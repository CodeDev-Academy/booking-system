import datetime

from django.db import transaction
from django.utils import timezone

from appointments.models import (
    Appointment,
    ClinicSetting,
    FollowUpTask,
    InteractionLog,
)
from appointments.services.channel_availability import resolve_telegram_chat_id
from appointments.services.sweep_service import PROVIDER_BY_CHANNEL
from appointments.services.telegram_service import TelegramService


# Workflow A (A.0) - pre-visit reminders (24h & 2h) and doctor follow-up
# recalls. The same split as B.0: the sweep endpoint is the messaging brain -
# it decides WHO is due, on WHICH app, with WHICH words - and n8n only
# delivers ("copy lives in Django").
#
# Windows are (now, now+24h] and (now, now+2h] against CONFIRMED appointments
# only (never held/cancelled/no_show), and the copy always states the actual
# date and time - never "tomorrow" - so the words stay truthful for any window.
#
# Channels mirror the patient's own outbound log: the booking request's rows
# plus rows linked to the appointment itself. A walk-in (no booking request)
# or a patient with no dispatch record falls back to plain SMS, which has no
# approval window and no template requirement. Voice is never a reminder
# channel - a phone call to say "your visit is soon" is not something the
# clinic wants to pay for.
#
# The claim row IS the dedupe: one outbound InteractionLog row per item is
# created at emit time (status 'queued'), and n8n's outcome POST upserts the
# SAME external_ref to sent/failed (the /interactions/ upsert contract). The
# sweep fires hourly, and a 24h window is 24 sweeps long - without the claim,
# a patient would be reminded once per hour for a whole day.
#
# Clinic flags gate the batches: enable_24h_reminder (default on) and
# enable_2h_reminder (default off). Unlike B, no extra system/expiry row is
# written and no AuditLog row either: the reminder IS the interaction, and
# InteractionLog is already the authoritative record.

REM24_CLAIM_PREFIX = 'rem24-'
REM2H_CLAIM_PREFIX = 'rem2h-'
FOLLOWUP_CLAIM_PREFIX = 'followup-'

SUMMARY_BY_KIND = {
    '24h': '24-hour pre-visit reminder queued for delivery',
    '2h': '2-hour pre-visit reminder queued for delivery',
    'followup': 'Follow-up recall queued for delivery',
}


def _fmt_when(appointment):
    local_start = timezone.localtime(appointment.start_datetime)
    return local_start.strftime('%a %d %b'), local_start.strftime('%I:%M %p')


def reminder_message(appointment, clinic):
    """SMS-safe 24h copy. States the actual date and time, and points at the
    front desk for changes (no unwired reply grammar is taught)."""
    date_str, time_str = _fmt_when(appointment)
    return (
        f"Hello {appointment.patient_name}, reminder: your {appointment.service.name} "
        f"appointment with {appointment.doctor.name} at {clinic.clinic_name} is "
        f"scheduled for {date_str} at {time_str}. "
        f"Please call {clinic.phone} if you need to change it. Ref {appointment.appointment_code}."
    )


def two_hour_message(appointment, clinic):
    """SMS-safe 2h copy - same facts, closer urgency."""
    date_str, time_str = _fmt_when(appointment)
    return (
        f"Hello {appointment.patient_name}, your {appointment.service.name} "
        f"appointment with {appointment.doctor.name} at {clinic.clinic_name} is coming "
        f"up on {date_str} at {time_str}. "
        f"Please call {clinic.phone} if you need to change it. Ref {appointment.appointment_code}."
    )


def mirrored_channels_for_appointment(appointment):
    """
    The apps this patient was actually reached on, from the outbound log rows
    linked to the appointment's booking request (Workflow D's offer dispatch)
    plus rows linked to the appointment itself (confirmations, reminders).
    Voice is dropped; an empty mirror falls back to SMS when there is a number.
    """
    req = appointment.booking_request
    recorded = set()
    if req is not None:
        recorded.update(
            InteractionLog.objects.filter(
                booking_request=req, direction='outbound',
            ).exclude(channel='voice').values_list('channel', flat=True)
        )
    recorded.update(
        InteractionLog.objects.filter(
            appointment=appointment, direction='outbound',
        ).exclude(channel='voice').values_list('channel', flat=True)
    )
    channels = [c for c in ('sms', 'whatsapp', 'telegram') if c in recorded]
    if channels:
        return channels
    return ['sms'] if appointment.patient_phone else []


def _base_item(appointment, kind, channel):
    return {
        'request_id': appointment.appointment_code,
        'id': str(appointment.id),
        'kind': kind,
        'channel': channel,
        'patient_name': appointment.patient_name,
        'patient_phone': appointment.patient_phone,
        'service_name': appointment.service.name,
        'doctor_name': appointment.doctor.name,
        'start_datetime': appointment.start_datetime.isoformat(),
    }


def _build_item(appointment, kind, channel, clinic):
    """One deliverable message for n8n: target, app, words, and the claim ref."""
    item = _base_item(appointment, kind, channel)
    item['claim_ref'] = f"{'rem24' if kind == '24h' else 'rem2h'}-{appointment.appointment_code}-{channel}"

    if channel == 'telegram':
        chat_id = resolve_telegram_chat_id(appointment.booking_request)
        if not chat_id:
            # A Telegram reminder with no resolvable chat can never be delivered.
            return None
        if kind == '24h':
            text, reply_markup = TelegramService.format_24h_reminder(appointment, clinic)
        else:
            text, reply_markup = TelegramService.format_2h_reminder(appointment, clinic)
        item['message'] = text
        item['telegram_chat_id'] = chat_id
        item['reply_markup'] = reply_markup
    else:
        item['message'] = (
            reminder_message(appointment, clinic) if kind == '24h'
            else two_hour_message(appointment, clinic)
        )
    return item


def _emit_appointment_reminder(appointment, kind, clinic):
    """
    One item per mirrored channel, guarded by its claim row. A claim that
    already exists means this message was already queued for delivery: skip.
    Items that cannot be built (Telegram with no chat id) also write no claim,
    so a fix to the data lets the next sweep try again.
    """
    items = []
    for channel in mirrored_channels_for_appointment(appointment):
        draft = _build_item(appointment, kind, channel, clinic)
        if draft is None:
            continue
        claim, created = InteractionLog.objects.get_or_create(
            external_ref=draft['claim_ref'],
            defaults={
                'provider': PROVIDER_BY_CHANNEL[channel],
                'channel': channel,
                'direction': 'outbound',
                'status': 'queued',
                'patient_name': appointment.patient_name,
                'patient_phone': appointment.patient_phone,
                'appointment': appointment,
                'booking_request': appointment.booking_request,
                'summary': SUMMARY_BY_KIND[kind],
            },
        )
        if created:
            items.append(draft)
    return items


def _build_followup_item(task, channel, clinic):
    appointment = task.appointment
    item = _base_item(appointment, 'followup', channel)
    item['claim_ref'] = f"{FOLLOWUP_CLAIM_PREFIX}{task.id}-{channel}"
    item['follow_up_id'] = str(task.id)
    item['follow_up_date'] = task.follow_up_date.isoformat()

    if channel == 'telegram':
        chat_id = resolve_telegram_chat_id(appointment.booking_request)
        if not chat_id:
            return None
        text, reply_markup = TelegramService.format_followup_recall(appointment, task, clinic)
        item['message'] = text
        item['telegram_chat_id'] = chat_id
        item['reply_markup'] = reply_markup
    else:
        # Rule B: the ONLY words sent are the ones reception typed.
        item['message'] = task.patient_message
    return item


def _emit_followup(task, clinic, now):
    """
    Recall items for one due task. The task is marked reminder_sent only when
    at least one claim was actually written: an unresolvable channel writes no
    claim and no mark, so a later sweep retries (Workflow B's posture).
    """
    items = []
    created_any = False
    for channel in mirrored_channels_for_appointment(task.appointment):
        draft = _build_followup_item(task, channel, clinic)
        if draft is None:
            continue
        claim, created = InteractionLog.objects.get_or_create(
            external_ref=draft['claim_ref'],
            defaults={
                'provider': PROVIDER_BY_CHANNEL[channel],
                'channel': channel,
                'direction': 'outbound',
                'status': 'queued',
                'patient_name': task.appointment.patient_name,
                'patient_phone': task.appointment.patient_phone,
                'appointment': task.appointment,
                'booking_request': task.appointment.booking_request,
                'summary': SUMMARY_BY_KIND['followup'],
            },
        )
        if created:
            items.append(draft)
            created_any = True

    if created_any:
        task.reminder_sent = True
        task.reminder_sent_at = now
        task.save(update_fields=['reminder_sent', 'reminder_sent_at'])
    return items


class ReminderService:
    """
    Pre-visit reminder & follow-up recall engine (Workflow A).
    One call returns ALL due items - there is no per-kind parameter, Django
    decides everything. n8n only delivers.
    """

    @classmethod
    @transaction.atomic
    def run_sweep(cls):
        now = timezone.now()
        clinic = ClinicSetting.get_settings()

        reminder_items = []

        reminder_24h_count = 0
        if clinic.enable_24h_reminder:
            due_24h = Appointment.objects.filter(
                status='confirmed',
                start_datetime__gt=now,
                start_datetime__lte=now + datetime.timedelta(hours=24),
            ).select_related('doctor', 'service', 'booking_request').order_by('start_datetime')
            for appointment in due_24h:
                items = _emit_appointment_reminder(appointment, '24h', clinic)
                reminder_items.extend(items)
                reminder_24h_count += len(items)

        reminder_2h_count = 0
        if clinic.enable_2h_reminder:
            due_2h = Appointment.objects.filter(
                status='confirmed',
                start_datetime__gt=now,
                start_datetime__lte=now + datetime.timedelta(hours=2),
            ).select_related('doctor', 'service', 'booking_request').order_by('start_datetime')
            for appointment in due_2h:
                items = _emit_appointment_reminder(appointment, '2h', clinic)
                reminder_items.extend(items)
                reminder_2h_count += len(items)

        followup_items = []
        due_tasks = FollowUpTask.objects.filter(
            is_completed=False,
            reminder_sent=False,
            cancelled_at__isnull=True,
            follow_up_date__lte=timezone.localdate(),
        ).exclude(
            # Rule B: an empty message sends nothing. The recall is a note.
            patient_message='',
        ).select_related(
            'appointment', 'appointment__doctor', 'appointment__service',
            'appointment__booking_request',
        ).order_by('follow_up_date', 'id')
        for task in due_tasks:
            due_at = timezone.make_aware(
                datetime.datetime.combine(task.follow_up_date, task.send_at)
            )
            if due_at > now:
                continue  # not yet the chosen time today
            followup_items.extend(_emit_followup(task, clinic, now))

        return {
            'timestamp': now.isoformat(),
            'reminder_24h_count': reminder_24h_count,
            'reminder_2h_count': reminder_2h_count,
            'followup_count': len(followup_items),
            'reminder_items': reminder_items,
            'followup_items': followup_items,
        }
