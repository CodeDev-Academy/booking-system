"""
Shared slot-selection core (Workflow C / C.1 — 2026-11-16).

Two callers select an offer for a patient:

- `SlotHoldView` (dashboard, walk-in desk, n8n `option_number` hold)
- the patient-reply webhook (an SMS/WhatsApp "2")

They must behave identically, or a patient who replies on two channels gets two
different answers. Extracting the core means one code path, one ALREADY_CONFIRMED
rule and one conflict rule - not a copy that slowly drifts.

The hard part (row locks, buffer conflicts, hold expiry) stays in HoldService.
"""

from django.db.models import Q
from django.utils import timezone

from ..models import Appointment
from .hold_service import HoldService
from .sse_bus import broadcast_event


def find_active_booking(request):
    """
    The live appointment for a booking request, if any.

    'Live' mirrors SlotHoldView's long-standing rule: a confirmed appointment, or
    a hold that has not expired yet. An expired hold does NOT count - the patient
    legitimately gets a fresh chance.
    """
    now = timezone.now()
    return (
        Appointment.objects
        .filter(booking_request=request)
        .filter(Q(status='confirmed') | Q(status='held', hold_expires_at__gt=now))
        .first()
    )


def select_slot_offer(offer, performer='patient'):
    """
    Select `offer` for its patient.

    Returns (outcome, appointment) where outcome is:
      - 'already_confirmed': nothing was written; `appointment` may be None when
        the request was already converted without a live row (legacy data).
      - 'held': a 15-minute hold was created and the offer marked selected.

    Raises SlotConflictException when another patient took the time first.
    """
    existing = find_active_booking(offer.request)
    if existing or offer.is_selected or offer.request.status == 'converted':
        return 'already_confirmed', existing

    appointment = HoldService.acquire_slot(
        doctor_id=offer.doctor.id,
        service_id=offer.request.service.id,
        start_datetime=offer.start_datetime,
        end_datetime=offer.end_datetime,
        patient_name=offer.request.patient_name,
        patient_phone=offer.request.patient_phone,
        booking_request_id=offer.request.id,
        is_hold=True,
        performed_by=performer,
    )

    offer.is_selected = True
    offer.save(update_fields=['is_selected'])

    broadcast_event('slot.held', {
        'appointment_id': str(appointment.id),
        'appointment_code': appointment.appointment_code,
        'doctor_id': str(appointment.doctor.id),
        'start_datetime': appointment.start_datetime.isoformat(),
        'end_datetime': appointment.end_datetime.isoformat(),
        'status': appointment.status,
        'hold_expires_at': appointment.hold_expires_at.isoformat() if appointment.hold_expires_at else None,
    })

    return 'held', appointment
