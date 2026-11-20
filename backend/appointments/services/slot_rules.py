"""
Wave 2 / Step 2.1 — the clinic's own rules, in ONE place.

`AvailabilityEngine.get_available_slots_for_date` refuses slots that break the
clinic's contract (closed days, shift bounds, lunch, blocked dates, emergency
reserves, notice, daily caps) — but nothing re-checked them once a human or a
bot POSTed a time of their own, so a direct calendar booking or walk-in could
land at 03:00, on a Sunday, inside lunch, in the past or past the doctor's cap.

Every writer now calls `validate_clinic_slot` before creating an appointment:

- `HoldService.acquire_slot` (dashboard confirm, calendar pick, walk-in)
- `RescheduleAppointmentView` (moving an existing visit)
- the offer dispatch path (reception's hand-picked slots)

The rules mirror the generator EXACTLY — whatever the slot generator refuses,
a picked slot must refuse too, with a named error and a plain sentence
reception can read to a patient on the phone.
"""
import datetime

from django.db.models import Q
from django.utils import timezone

from appointments.models import AvailabilityRule, Appointment

# The statuses that occupy a doctor's day and count against the daily cap —
# the same set find_slot_conflict treats as active.
ACTIVE_STATUSES = ('confirmed', 'held', 'arrived', 'in_consultation')


def validate_clinic_slot(
    doctor,
    start_datetime,
    end_datetime,
    *,
    service=None,
    clinic=None,
    is_walk_in=False,
    is_emergency=False,
    exclude_appointment_id=None,
    now=None,
):
    """
    Is this exact slot legal for THIS clinic and THIS doctor?

    Returns None when it is, otherwise `(code, plain sentence)` — no
    exceptions here, so callers can map it to their own error shape.

    Deliberate exemptions, matching how the front desk actually works:
    - `is_walk_in` skips the advance-notice rule (the patient is standing at
      the desk; the rule exists for remote bookings);
    - `is_emergency` may book inside an `emergency_reserve` block;
    - `exclude_appointment_id` stops a reschedule counting the very
      appointment it is moving.
    """
    now = now or timezone.now()
    if clinic is None:
        # Imported lazily: ClinicSetting lives in models, and models must stay
        # import-order-safe from any service module.
        from appointments.models import ClinicSetting
        clinic = ClinicSetting.get_settings()

    local_start = timezone.localtime(start_datetime)
    day = local_start.date()
    iso_day = day.isoweekday()  # 1=Monday ... 7=Sunday

    buffer_minutes = (service.buffer_minutes if service else None) or clinic.default_buffer_minutes
    block_end = end_datetime + datetime.timedelta(minutes=buffer_minutes)

    # 1. Never the past.
    if start_datetime < now:
        return ('SLOT_IN_PAST', 'That time has already passed.')

    # 2. The clinic's own calendar.
    if iso_day not in (clinic.working_days or []):
        return (
            'CLINIC_CLOSED',
            'The clinic is closed on that day.',
        )

    # 3. The doctor's own calendar.
    if iso_day not in (doctor.working_days or []):
        return (
            'DOCTOR_OFF_DUTY',
            f"{doctor.name} does not work on that day.",
        )

    # 4. Shift bounds - the same intersection the generator uses:
    #    no earlier than the later opening, no later than the earlier closing.
    shift_start = max(clinic.open_time, doctor.shift_start)
    shift_end = min(clinic.close_time, doctor.shift_end)
    day_open = timezone.make_aware(datetime.datetime.combine(day, shift_start))
    day_close = timezone.make_aware(datetime.datetime.combine(day, shift_end))
    if start_datetime < day_open or block_end > day_close:
        return (
            'OUTSIDE_SHIFT',
            f"{doctor.name} works {shift_start.strftime('%H:%M')} to "
            f"{shift_end.strftime('%H:%M')} on that day.",
        )

    # 5. Lunch - the whole block (visit + sterilization buffer) must clear it,
    #    exactly like the generator's overlap condition.
    lunch_start = timezone.make_aware(datetime.datetime.combine(day, clinic.lunch_break_start))
    lunch_end = timezone.make_aware(datetime.datetime.combine(day, clinic.lunch_break_end))
    if start_datetime < lunch_end and block_end > lunch_start:
        return (
            'LUNCH_BREAK',
            f"That time falls inside the clinic's lunch break "
            f"({clinic.lunch_break_start.strftime('%H:%M')}–"
            f"{clinic.lunch_break_end.strftime('%H:%M')}).",
        )

    # 6. Availability rules: breaks and blocked dates for anyone; the
    #    emergency reserve only for an emergency booking.
    day_floor = timezone.make_aware(datetime.datetime.combine(day, datetime.time.min))
    day_ceiling = timezone.make_aware(datetime.datetime.combine(day, datetime.time.max))
    rules = AvailabilityRule.objects.filter(
        Q(doctor=doctor) | Q(doctor__isnull=True),
        start_datetime__lt=day_ceiling,
        end_datetime__gt=day_floor,
    )
    for rule in rules:
        if start_datetime < rule.end_datetime and block_end > rule.start_datetime:
            if rule.rule_type == 'emergency_reserve':
                if is_emergency:
                    continue
                return (
                    'EMERGENCY_RESERVE_ONLY',
                    'That time is held as an emergency reserve. Mark the booking '
                    'as an emergency, or pick another time.',
                )
            return (
                'DATE_BLOCKED',
                (rule.reason or 'The clinic is unavailable at that time.')
                if rule.rule_type == 'break'
                else (rule.reason or 'That date is blocked by the clinic.'),
            )

    # 7. Advance notice - remote bookings only. A walk-in patient is already
    #    at the desk, so the notice window does not apply to them.
    if not is_walk_in:
        earliest = now + datetime.timedelta(hours=clinic.min_advance_hours)
        if start_datetime < earliest:
            hours = clinic.min_advance_hours
            return (
                'TOO_SOON',
                f'Bookings need at least {hours} hour(s) of notice. '
                'Please pick a later time.',
            )

    # 8. The doctor's daily cap. Holds count: an unclaimed hold is capacity
    #    someone else was promised. A reschedule never counts the appointment
    #    it is moving.
    day_start = timezone.make_aware(datetime.datetime.combine(day, datetime.time.min))
    day_end = timezone.make_aware(datetime.datetime.combine(day, datetime.time.max))
    booked = Appointment.objects.filter(
        doctor=doctor,
        start_datetime__gte=day_start,
        start_datetime__lte=day_end,
        status__in=ACTIVE_STATUSES,
    )
    if exclude_appointment_id:
        booked = booked.exclude(id=exclude_appointment_id)
    if booked.count() >= (doctor.max_daily_appointments or 0):
        return (
            'DAILY_CAP_REACHED',
            f"{doctor.name} already has the maximum number of visits that day "
            f"({doctor.max_daily_appointments}).",
        )

    return None
