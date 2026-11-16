import datetime
from django.db import transaction
from django.utils import timezone
from appointments.models import (
    BookingRequest,
    Appointment,
    AuditLog,
    ClinicSetting,
    InteractionLog,
)
from appointments.services.channel_availability import resolve_telegram_chat_id
from appointments.services.telegram_service import TelegramService


# Workflow B (B.0) - the sweep endpoint is also the messaging brain: it decides WHO
# gets a reminder or a recovery message, on WHICH app, with WHICH words. n8n only
# delivers (the same split as C.1: "copy lives in Django").
#
# Channels mirror the offer's own dispatch log (Workflow D's outbound rows): if the
# offer reached the patient on WhatsApp and SMS, the nudge/recovery goes on both.
# Voice is never a reminder channel - a phone call to say "your offer expires" is
# not something the clinic wants to pay for. No dispatch record at all falls back
# to plain SMS, which has no approval window and no template requirement.

PROVIDER_BY_CHANNEL = {
    'sms': 'voicebip',
    'whatsapp': 'meta_whatsapp',
    'telegram': 'telegram',
}

# Dedupe markers. The claim row IS the dedupe: one outbound InteractionLog row per
# item is created at emit time (status 'queued'), and n8n's outcome POST upserts the
# SAME external_ref to sent/failed (the /interactions/ upsert contract). The nudge
# window is ~15 minutes long and the sweep fires every 60 seconds - without the
# claim, a patient would be reminded once per sweep.
NUDGE_CLAIM_PREFIX = 'nudge-'
RECOVERY_CLAIM_PREFIX = 'recovery-'
EXPIRY_ROW_PREFIX = 'sweep-expiry-'


def _service_name(request):
    return request.service.name if request.service else 'Consultation'


def _number_list(count):
    """Option grammar by count: '1', '1 or 2', '1, 2, or 3'."""
    numbers = [str(n) for n in range(1, count + 1)]
    if not numbers:
        return ''
    if len(numbers) == 1:
        return numbers[0]
    return ', '.join(numbers[:-1]) + ' or ' + numbers[-1]


def nudge_message(request, minutes_left):
    """
    Plain SMS-safe wording for the 45-minute reminder. The reply grammar is C.1's:
    a bare option number, resolved against the request's offers in dispatch order.
    """
    offers = list(request.slot_offers.order_by('offered_at', 'id'))
    options = _number_list(len(offers))
    return (
        f"Friendly reminder: your appointment choices for {_service_name(request)} "
        f"expire in {minutes_left} minutes. "
        + (f"Reply {options} to lock in your time." if options else "Our front desk will contact you shortly.")
    )


def recovery_message(request):
    """
    Plain SMS-safe recovery wording. It must teach the word C.1 actually accepts -
    RESCHEDULE. ('NEW' was the blueprint's guess; replying it would only earn the
    'unmatched' error text.)
    """
    return (
        f"Hello {request.patient_name}, the previously offered times for "
        f"{_service_name(request)} have expired to keep our schedule open for all "
        f"patients. We'd still love to see you! Reply RESCHEDULE and our front desk "
        f"will send you fresh times."
    )


def mirrored_channels(request):
    """
    The apps the offer actually reached, from the request's own outbound log rows
    (channel field, not provider - VoiceBip sends both SMS and voice). Voice is
    dropped; an empty mirror falls back to SMS when the patient has a number.
    """
    recorded = set(
        InteractionLog.objects.filter(
            booking_request=request, direction='outbound',
        ).exclude(channel='voice').values_list('channel', flat=True)
    )
    channels = [c for c in ('sms', 'whatsapp', 'telegram') if c in recorded]
    if channels:
        return channels
    return ['sms'] if request.patient_phone else []


def _telegram_copy(request, kind, offers):
    if kind == 'nudge':
        return TelegramService.format_pre_expiry_nudge(request, offers, ClinicSetting.get_settings())
    return TelegramService.format_graceful_expiry(request, ClinicSetting.get_settings())


def _build_item(request, kind, channel, minutes_left=None):
    """One deliverable message for n8n: target, app, words, and the claim ref."""
    item = {
        'request_id': request.request_code,
        'id': str(request.id),
        'patient_name': request.patient_name,
        'patient_phone': request.patient_phone,
        'service_name': _service_name(request),
        'channel': channel,
        'claim_ref': f'{kind}-{request.request_code}-{channel}',
    }
    if minutes_left is not None:
        item['minutes_remaining'] = minutes_left

    if channel == 'telegram':
        chat_id = resolve_telegram_chat_id(request)
        if not chat_id:
            # A Telegram offer with no resolvable chat can never be delivered.
            return None
        offers = list(request.slot_offers.order_by('offered_at', 'id'))
        text, reply_markup = _telegram_copy(request, kind, offers)
        item['message'] = text
        item['telegram_chat_id'] = chat_id
        item['reply_markup'] = reply_markup
    else:
        item['message'] = (
            nudge_message(request, minutes_left) if kind == 'nudge' else recovery_message(request)
        )
    return item


def _emit_items(request, kind, minutes_left=None):
    """
    One item per mirrored channel, guarded by its claim row. A claim that already
    exists means this message was already queued for delivery: skip. Items that
    cannot be built (Telegram with no chat id) also write no claim, so a fix to
    the data lets the next sweep try again.
    """
    items = []
    for channel in mirrored_channels(request):
        draft = _build_item(request, kind, channel, minutes_left)
        if draft is None:
            continue
        claim, created = InteractionLog.objects.get_or_create(
            external_ref=draft['claim_ref'],
            defaults={
                'provider': PROVIDER_BY_CHANNEL[channel],
                'channel': channel,
                'direction': 'outbound',
                'status': 'queued',
                'patient_name': request.patient_name,
                'patient_phone': request.patient_phone,
                'booking_request': request,
                'summary': (
                    '45-minute expiry nudge queued for delivery'
                    if kind == 'nudge' else 'Expiry recovery message queued for delivery'
                ),
            },
        )
        if created:
            items.append(draft)
    return items


class SweepService:
    """
    60-Second Expiry Cron Sweeper Engine (Risk R-06).
    Performs batch transitions for:
    1. 60-Minute Slot Offers: transitions 'slots_offered' -> 'offer_expired'.
    2. 15-Minute Temporary Holds: transitions 'held' -> 'hold_expired', freeing the slot.
    3. 45-Minute Pre-Expiry Nudges: surfaces active offers with <= 15 minutes left.
    4. Workflow B (B.0): every expired offer and nudge candidate is also turned into
       deliverable message items (channel + copy + claim ref) for the n8n sweeper.
    """

    @classmethod
    @transaction.atomic
    def run_sweep(cls, performed_by="cron_sweeper"):
        """
        Executes a complete sweep iteration and returns metrics on expired entities.
        """
        now = timezone.now()

        # 1. Sweep expired 1-hour candidate slot offers
        expired_offers = BookingRequest.objects.select_for_update(of=('self',)).filter(
            status='slots_offered',
            offer_expires_at__lt=now
        ).select_related('service')
        expired_offer_codes = []
        expired_offer_items = []
        for req in expired_offers:
            req.status = 'offer_expired'
            req.save(update_fields=['status', 'updated_at'])
            expired_offer_codes.append(req.request_code)

            AuditLog.objects.create(
                entity_name='BookingRequest',
                entity_id=req.id,
                action='OFFER_EXPIRED_SWEEP',
                performed_by=performed_by,
                changes={
                    'request_code': req.request_code,
                    'patient_name': req.patient_name,
                    'expired_at': req.offer_expires_at.isoformat() if req.offer_expires_at else None,
                }
            )

            # One visible expiry event in the dossier, even if delivery later fails.
            InteractionLog.objects.get_or_create(
                external_ref=EXPIRY_ROW_PREFIX + req.request_code,
                defaults={
                    'provider': 'system',
                    'channel': (mirrored_channels(req) or ['sms'])[0],
                    'direction': 'outbound',
                    'status': 'expired',
                    'patient_name': req.patient_name,
                    'patient_phone': req.patient_phone,
                    'booking_request': req,
                    'summary': 'Offer window expired; patient asked to reply RESCHEDULE for fresh times',
                },
            )

            # Recovery message items, one per app the offer actually reached.
            expired_offer_items.extend(_emit_items(req, 'recovery'))

        # 2. Identify 45-Minute Pre-Expiry Nudge Candidates (15m remaining window)
        nudge_window = now + datetime.timedelta(minutes=15)
        nudge_candidates = BookingRequest.objects.filter(
            status='slots_offered',
            offer_expires_at__gt=now,
            offer_expires_at__lte=nudge_window
        ).select_related('service')
        pre_expiry_nudges = []
        for req in nudge_candidates:
            minutes_left = max(1, int((req.offer_expires_at - now).total_seconds() / 60))
            pre_expiry_nudges.extend(_emit_items(req, 'nudge', minutes_left))

        # 3. Sweep expired 15-minute temporary holds (excluding appointments already converted by patient selection)
        expired_holds = Appointment.objects.select_for_update(of=('self',)).filter(
            status='held',
            hold_expires_at__lt=now
        ).exclude(booking_request__status='converted')
        expired_hold_codes = []
        for appt in expired_holds:
            appt.status = 'hold_expired'
            appt.cancellation_reason = 'Temporary 15-minute hold expired without patient confirmation'
            appt.save(update_fields=['status', 'cancellation_reason', 'updated_at'])
            expired_hold_codes.append(appt.appointment_code)

            AuditLog.objects.create(
                entity_name='Appointment',
                entity_id=appt.id,
                action='HOLD_EXPIRED_SWEEP',
                performed_by=performed_by,
                changes={
                    'appointment_code': appt.appointment_code,
                    'patient_name': appt.patient_name,
                    'doctor_name': appt.doctor.name,
                }
            )

        return {
            'timestamp': now.isoformat(),
            'expired_offers_count': len(expired_offer_codes),
            'expired_offer_codes': expired_offer_codes,
            'expired_offers': expired_offer_items,
            'pre_expiry_nudges': pre_expiry_nudges,
            'expired_holds_count': len(expired_hold_codes),
            'expired_hold_codes': expired_hold_codes,
        }
