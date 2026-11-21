"""
Patient reply interpretation (Workflow C / C.1 — 2026-11-16).

An SMS or WhatsApp reply carries only a sender's phone number and a few words.
Django must answer two questions itself, because n8n never gets database access:

    1. Which open BookingRequest does this phone belong to?
    2. What does the text mean (select option N / cancel / reschedule / other)?

This module owns that interpretation and composes the `reply_text` the patient
receives. n8n stays a transport: it delivers the text, it never decides anything.

Telegram is deliberately NOT routed through here. Its buttons already carry
`select_slot_<offer>`, and `TelegramService.handle_telegram_webhook` owns that
conversation; handling the same update twice would double-book gestures.
"""

import re

from django.utils import timezone

from ..models import AuditLog, Appointment, BookingRequest, InteractionLog
from ..serializers_interactions import normalize_phone_e164
from .hold_service import SlotConflictException
from .slot_selection import find_active_booking, select_slot_offer
from .sse_bus import broadcast_event

# The plan calls the first status 'awaiting_slots'; the model's real name is
# 'awaiting_review'. These are the statuses where a reply can still change the
# outcome. 'converted' / 'rejected' are terminal and resolve only through the
# live-appointment fallback below.
OPEN_REQUEST_STATUSES = (
    'awaiting_review',
    'slots_offered',
    'offer_expired',
    're_requested',
)

VALID_CHANNELS = ('sms', 'whatsapp', 'voice', 'telegram')
DEFAULT_CHANNEL = 'sms'

# Channel -> InteractionLog.provider. Provider is transport bookkeeping; the
# interpretation above is channel-neutral by design.
PROVIDER_BY_CHANNEL = {
    'sms': 'voicebip',
    'voice': 'voicebip',
    'whatsapp': 'meta_whatsapp',
    'telegram': 'telegram',
}


def clean_channel(channel):
    """Return a channel the model accepts; default to SMS for odd input."""
    value = str(channel or '').strip().lower()
    return value if value in VALID_CHANNELS else DEFAULT_CHANNEL


def resolve_patient_request(phone):
    """
    Most recent open BookingRequest for this phone, or None.

    'Most recent' is a created_at ordering: a patient with two open requests is
    answering the one they most recently started. The phone comparison uses
    normalize_phone_e164 so `08030001122` and `+2348030001122` are one identity.
    """
    normalized = normalize_phone_e164(phone)
    if not normalized:
        return None
    return (
        BookingRequest.objects
        .filter(patient_phone=normalized, status__in=OPEN_REQUEST_STATUSES)
        .order_by('-created_at')
        .first()
    )


def format_slot(dt):
    """Clinic wall-clock wording for a slot, e.g. 'Tue 01 Dec, 09:00 AM'."""
    return timezone.localtime(dt).strftime('%a %d %b, %I:%M %p')


def reply_unmatched():
    return (
        "We could not find an open booking request for this number. "
        "Tell us the service you need and our front desk will help you book."
    )


def reply_needs_reception():
    return "Thank you for your message. A member of our front desk will reply shortly."


def reply_held(appointment):
    return (
        f"Thank you! Your time is held: {appointment.doctor.name}, "
        f"{format_slot(appointment.start_datetime)}. "
        f"Your reference is {appointment.appointment_code}. "
        "We will confirm your appointment shortly. Reply CANCEL to change it."
    )


def reply_already_confirmed(code):
    if code:
        return (
            "You already have a booking for this request. "
            f"Your reference is {code}. Reply RESCHEDULE or CANCEL to change it."
        )
    return (
        "You already selected a time for this request and our front desk is "
        "confirming it. We will message you with your reference shortly."
    )


def reply_out_of_range(option, count):
    if not count:
        return (
            "We have not sent you any time options yet. "
            "Our front desk will follow up with available times shortly."
        )
    return (
        f"Sorry, option {option} is not one of the times we sent you. "
        f"We offered {count} time option(s). Reply with one of those numbers."
    )


def reply_expired():
    return (
        "Those time options have expired so the schedule stays fair for every patient. "
        "Reply RESCHEDULE and our front desk will send you fresh times."
    )


def reply_slot_conflict():
    return (
        "Sorry, that time was just taken by another patient. "
        "Reply RESCHEDULE and our front desk will find you a new time."
    )


def reply_cancelled(code):
    return (
        f"Your appointment {code} has been cancelled. "
        "If you would like a new time, reply RESCHEDULE."
    )


def reply_cancel_without_booking():
    return (
        "We could not find a booked appointment to cancel for this request. "
        "A member of our front desk will reply shortly."
    )


def reply_rescheduled():
    return (
        "Our front desk is finding fresh available times for you "
        "and will message you here shortly."
    )


# A bare number is a slot choice. Everything else is a word the patient typed:
# keep the vocabulary small and obvious, because SMS has no buttons.
# The dispatch copy says "Reply 1, 2, or 3", so patients type exactly that on
# BOTH channels; the engine accepts the leading word it taught them.
OPTION_RE = re.compile(r'^(?:(?:reply|option|opt)\s*)?(\d{1,2})$', re.IGNORECASE)
CANCEL_WORDS = {'cancel', 'cancelled', 'canceled', 'stop'}
RESCHEDULE_WORDS = {'reschedule', 'change', 'move', 'new time'}

# What the dashboard shows under an inbound row. Written from the outcome, never
# from the patient's raw text: free text may contain a phone number or clinical
# detail, and phone numbers must never be logged.
INBOUND_SUMMARY = {
    'held': 'Patient selected a time',
    'already_confirmed': 'Patient replied about a request that already has a booking',
    'out_of_range': 'Patient replied with an option number that was not offered',
    'expired': 'Patient replied after the offered times expired',
    'slot_conflict': 'Patient selected a time that was just taken',
    'cancelled': 'Patient cancelled the appointment',
    're_requested': 'Patient asked for fresh times',
    'needs_reception': 'Patient message needs a human reply',
}


def parse_intent(text):
    """
    ('select', 2) for "2"; ('cancel', None); ('reschedule', None); ('other', None).

    Odd input is not an error: it becomes 'other' and a human picks it up.
    """
    value = (text or '').strip().lower()
    if OPTION_RE.match(value):
        return 'select', int(OPTION_RE.match(value).group(1))
    if value in CANCEL_WORDS:
        return 'cancel', None
    if value in RESCHEDULE_WORDS:
        return 'reschedule', None
    return 'other', None


def build_answer(status_value, intent, request, code, channel, reply_text):
    return {
        'status': status_value,
        'intent': intent,
        'request_id': request.request_code if request else None,
        'appointment_code': code,
        'channel': channel,
        'reply_text': reply_text,
    }


def handle_select_intent(request, option, channel):
    """
    Route a bare number through the SAME core SlotHoldView uses.

    Order matters: an existing live booking wins over expiry. A patient who
    already holds a slot should hear "you already have it", not "expired".
    """
    existing = find_active_booking(request)
    if existing or request.status == 'converted':
        code = existing.appointment_code if existing else None
        return build_answer(
            'already_confirmed', 'select', request, code, channel,
            reply_already_confirmed(code),
        )

    # Option numbers follow ORIGINAL dispatch order (offered_at), exactly like
    # SlotHoldRequestSerializer: the number the patient saw keeps its meaning.
    offers = list(request.slot_offers.order_by('offered_at', 'id'))
    if option < 1 or option > len(offers):
        return build_answer(
            'out_of_range', 'select', request, None, channel,
            reply_out_of_range(option, len(offers)),
        )

    offer = offers[option - 1]
    if request.status == 'offer_expired' or (offer.expires_at and offer.expires_at < timezone.now()):
        return build_answer('expired', 'select', request, None, channel, reply_expired())

    try:
        outcome, appointment = select_slot_offer(
            offer, performer=f'PatientChannel:{channel}',
        )
    except SlotConflictException:
        return build_answer(
            'slot_conflict', 'select', request, None, channel, reply_slot_conflict(),
        )

    if outcome == 'already_confirmed':
        code = appointment.appointment_code if appointment else None
        return build_answer(
            'already_confirmed', 'select', request, code, channel,
            reply_already_confirmed(code),
        )

    return build_answer(
        'held', 'select', request, appointment.appointment_code, channel,
        reply_held(appointment),
    )


def handle_cancel_intent(request, channel):
    """
    Same effect as Telegram's [❌ Cancel] button, but the target is the patient's
    live appointment for THIS request instead of an id carried in a button.

    No live appointment = nothing to cancel. That is a human matter, not an error:
    answer honestly and let reception pick it up.
    """
    appointment = find_active_booking(request)
    if appointment is None:
        return build_answer(
            'needs_reception', 'cancel', request, None, channel,
            reply_cancel_without_booking(),
        )

    appointment.status = 'cancelled'
    appointment.cancelled_at = timezone.now()
    appointment.cancellation_reason = f'Cancelled by patient via {channel}'
    appointment.save(update_fields=['status', 'cancelled_at', 'cancellation_reason', 'updated_at'])

    return build_answer(
        'cancelled', 'cancel', request, appointment.appointment_code, channel,
        reply_cancelled(appointment.appointment_code),
    )


def handle_reschedule_intent(request, channel):
    """
    Same effect as the Telegram [🔄 Reschedule] button: the request lands in the
    receptionist's priority Re-Requested tab. Copy is Django's; n8n only delivers.
    """
    request.status = 're_requested'
    request.save(update_fields=['status', 'updated_at'])

    AuditLog.objects.create(
        entity_name='BookingRequest',
        entity_id=request.id,
        action='PATIENT_RE_REQUESTED_TIMES',
        performed_by=f'PatientChannel:{channel}',
        changes={'status': 're_requested'},
    )

    broadcast_event('request.re_requested', {
        'request_id': request.request_code,
        'patient_name': request.patient_name,
        'status': 're_requested',
    })

    return build_answer(
        're_requested', 'reschedule', request, None, channel, reply_rescheduled(),
    )


def complete_inbound_claim(claim, request, result):
    """
    Fill in the inbound row once the outcome is known.

    The row is created up-front as the idempotency claim, so it may not know the
    appointment yet. Only links and outcome wording are written - never the
    patient's raw text.
    """
    updates = []

    if result.get('appointment_code'):
        appointment = Appointment.objects.filter(
            appointment_code=result['appointment_code']
        ).first()
        if appointment and claim.appointment_id != appointment.id:
            claim.appointment = appointment
            updates.append('appointment')

    if claim.booking_request_id != request.id:
        claim.booking_request = request
        updates.append('booking_request')

    summary = INBOUND_SUMMARY.get(result.get('status') or '', '')
    if summary and claim.summary != summary:
        claim.summary = summary
        updates.append('summary')

    if updates:
        claim.save(update_fields=updates + ['updated_at'])


def handle_patient_reply(phone, text, channel, provider_message_id=''):
    """
    Interpret one patient message and return the endpoint's answer dict.

    The inbound row is the idempotency claim and is completed with outcome
    links and wording once the intent has been handled.
    """
    channel = clean_channel(channel)
    intent, option = parse_intent(text)

    request = resolve_patient_request(phone)
    if request is None:
        return build_answer('unmatched', 'none', None, None, channel, reply_unmatched())

    # Idempotency: providers retry webhooks. `external_ref` is the provider's own
    # message id and is unique in the table, so the inbound row doubles as the
    # claim. get_or_create closes the race: a concurrent retry gets created=False
    # instead of raising.
    #
    # An empty reply_text means "nothing to deliver" - n8n must not re-send the
    # confirmation just because the provider retried its HTTP call.
    claim = None
    if provider_message_id:
        claim, created = InteractionLog.objects.get_or_create(
            external_ref=provider_message_id,
            defaults={
                'provider': PROVIDER_BY_CHANNEL[channel],
                'channel': channel,
                'direction': 'inbound',
                'status': 'answered',
                'patient_phone': normalize_phone_e164(phone),
                'booking_request': request,
            },
        )
        if not created:
            existing_code = claim.appointment.appointment_code if claim.appointment else None
            return build_answer(
                'duplicate_ignored', intent, request, existing_code, channel, '',
            )

    if intent == 'select':
        result = handle_select_intent(request, option, channel)
    elif intent == 'cancel':
        result = handle_cancel_intent(request, channel)
    elif intent == 'reschedule':
        result = handle_reschedule_intent(request, channel)
    else:
        result = build_answer(
            'needs_reception', intent, request, None, channel, reply_needs_reception(),
        )

    if claim is not None:
        complete_inbound_claim(claim, request, result)

    return result
