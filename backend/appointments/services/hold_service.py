import datetime
from django.db import transaction
from django.utils import timezone
from appointments.models import (
    ClinicSetting,
    Doctor,
    Service,
    Appointment,
    BookingRequest,
    AuditLog,
)


class SlotConflictException(Exception):
    """Raised when a requested slot is already held, booked, or conflicts with another visit."""
    def __init__(self, message, conflicting_appointment=None):
        super().__init__(message)
        self.conflicting_appointment = conflicting_appointment


class HoldService:
    """
    Atomic Slot Hold & Selection Engine.
    Executes concurrency-safe transactions with row-level locks (select_for_update)
    to guarantee zero double-booking across online bots and receptionist counter clicks.
    """

    @classmethod
    @transaction.atomic
    def acquire_slot(
        cls,
        doctor_id,
        service_id,
        start_datetime,
        end_datetime,
        patient_name,
        patient_phone,
        booking_request_id=None,
        is_hold=True,
        initial_status=None,
        performed_by='system',
        date_of_birth=None,
        gender='',
        is_emergency=False
    ):
        """
        Atomically acquires a temporary 15-minute hold or instant confirmed booking.
        Uses select_for_update() on the Doctor row to serialize concurrent attempts.
        """
        now = timezone.now()
        clinic = ClinicSetting.get_settings()

        # 1. Row-level lock on Doctor
        doctor = Doctor.objects.select_for_update().get(id=doctor_id)
        service = Service.objects.get(id=service_id)

        # Risk R-05: Pre-hold re-validation of doctor status
        if not doctor.is_active or doctor.is_on_leave:
            raise SlotConflictException(f"Doctor {doctor.name} is currently unavailable or on leave.")

        booking_request = None
        if booking_request_id:
            booking_request = BookingRequest.objects.get(id=booking_request_id)

        # 2. Lazy self-healing expiry: purge expired holds for this doctor
        Appointment.objects.filter(
            doctor=doctor,
            status='held',
            hold_expires_at__lt=now
        ).update(status='hold_expired')

        # 3. Two-way conflict detection against active appointments + sterilization buffer (Risk R-13)
        buffer_min = service.buffer_minutes or clinic.default_buffer_minutes
        effective_block_end = end_datetime + datetime.timedelta(minutes=buffer_min)

        # Query all active appointments in the vicinity (including 60m lookback for prior appointment buffer)
        candidate_appts = Appointment.objects.filter(
            doctor=doctor,
            status__in=['confirmed', 'held', 'arrived', 'in_consultation'],
            start_datetime__lt=effective_block_end,
            end_datetime__gt=start_datetime - datetime.timedelta(minutes=60)
        ).select_related('service')

        for appt in candidate_appts:
            appt_buf = appt.service.buffer_minutes or clinic.default_buffer_minutes
            appt_effective_end = appt.end_datetime + datetime.timedelta(minutes=appt_buf)
            # Two-way overlap test
            if start_datetime < appt_effective_end and effective_block_end > appt.start_datetime:
                raise SlotConflictException(
                    f"Slot conflict: Time block overlaps with active appointment ({appt.appointment_code}) or its sterilization buffer.",
                    conflicting_appointment=appt
                )

        # 4. Create atomic Appointment record
        if initial_status:
            status = initial_status
            hold_expiry = None
            confirmed_at = now
            arrival_at = now if initial_status == 'arrived' else None
        else:
            status = 'held' if is_hold else 'confirmed'
            hold_expiry = (now + datetime.timedelta(minutes=clinic.hold_expiry_minutes)) if is_hold else None
            confirmed_at = now if not is_hold else None
            arrival_at = None

        final_dob = date_of_birth or (booking_request.date_of_birth if booking_request else None)
        final_gender = gender or (booking_request.gender if booking_request else '')
        final_emergency = is_emergency or (booking_request.is_emergency if booking_request else False)

        appointment = Appointment.objects.create(
            patient_name=patient_name,
            patient_phone=patient_phone,
            date_of_birth=final_dob,
            gender=final_gender,
            is_emergency=final_emergency,
            doctor=doctor,
            service=service,
            booking_request=booking_request,
            start_datetime=start_datetime,
            end_datetime=end_datetime,
            status=status,
            hold_expires_at=hold_expiry,
            confirmed_at=confirmed_at,
            arrival_at=arrival_at,
        )

        # 5. Transition booking request if applicable
        if booking_request and not is_hold:
            booking_request.status = 'converted'
            booking_request.save(update_fields=['status', 'updated_at'])

        # 6. Immutable Audit Log
        AuditLog.objects.create(
            entity_name='Appointment',
            entity_id=appointment.id,
            action='SLOT_HELD' if is_hold else 'APPOINTMENT_CONFIRMED',
            performed_by=performed_by,
            changes={
                'appointment_code': appointment.appointment_code,
                'status': status,
                'start_datetime': start_datetime.isoformat(),
                'end_datetime': end_datetime.isoformat(),
                'hold_expires_at': hold_expiry.isoformat() if hold_expiry else None,
            }
        )

        return appointment

    @classmethod
    @transaction.atomic
    def confirm_hold(cls, appointment_id, performed_by='patient'):
        """
        Converts an active 15-minute temporary hold into a confirmed calendar booking.
        """
        now = timezone.now()
        appointment = Appointment.objects.select_for_update().get(id=appointment_id)

        if appointment.status != 'held':
            raise ValueError(f"Cannot confirm appointment with status '{appointment.status}'")

        if appointment.hold_expires_at and appointment.hold_expires_at < now:
            appointment.status = 'hold_expired'
            appointment.save(update_fields=['status', 'updated_at'])
            raise SlotConflictException("Temporary hold expired before confirmation was received.")

        appointment.status = 'confirmed'
        appointment.confirmed_at = now
        appointment.hold_expires_at = None
        appointment.save(update_fields=['status', 'confirmed_at', 'hold_expires_at', 'updated_at'])

        if appointment.booking_request:
            appointment.booking_request.status = 'converted'
            appointment.booking_request.save(update_fields=['status', 'updated_at'])

        AuditLog.objects.create(
            entity_name='Appointment',
            entity_id=appointment.id,
            action='HOLD_CONFIRMED',
            performed_by=performed_by,
            changes={'status': 'confirmed', 'confirmed_at': now.isoformat()}
        )

        return appointment

    @classmethod
    @transaction.atomic
    def release_hold(cls, appointment_id, reason='Cancelled by patient or reception', performed_by='system'):
        """
        Releases an active hold, immediately freeing the slot back to the clinic schedule.
        """
        now = timezone.now()
        appointment = Appointment.objects.select_for_update().get(id=appointment_id)

        if appointment.status == 'held':
            appointment.status = 'cancelled'
            appointment.cancelled_at = now
            appointment.cancellation_reason = reason
            appointment.hold_expires_at = None
            appointment.save(update_fields=['status', 'cancelled_at', 'cancellation_reason', 'hold_expires_at', 'updated_at'])

            AuditLog.objects.create(
                entity_name='Appointment',
                entity_id=appointment.id,
                action='HOLD_RELEASED',
                performed_by=performed_by,
                changes={'status': 'cancelled', 'reason': reason}
            )

        return appointment
