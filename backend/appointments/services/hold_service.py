"""
Atomic Slot Hold & Selection Service.
Agency Template Concurrency Protection.

Uses transaction.atomic() to ensure race-free appointment holds
and confirmations with automatic conflict fallback.
"""

import uuid
from datetime import datetime, timedelta
from typing import Dict, Any, Optional
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from appointments.models import (
    ClinicSetting,
    Doctor,
    Service,
    BookingRequest,
    SlotOffer,
    Appointment,
    AuditLog,
)
from appointments.services.availability import AvailabilityEngine


class HoldConflictError(Exception):
    """Raised when another patient acquires the slot concurrently."""
    pass


class HoldService:
    """
    Manages atomic slot reservation, temporary holds (15-30m),
    and final calendar confirmation.
    """

    def __init__(self, clinic_setting: Optional[ClinicSetting] = None):
        self.clinic = clinic_setting or ClinicSetting.objects.first() or ClinicSetting()
        self.engine = AvailabilityEngine(clinic_setting=self.clinic)

    def acquire_slot(
        self,
        doctor: Doctor,
        service: Service,
        start_datetime: datetime,
        end_datetime: datetime,
        patient_name: str,
        patient_phone: str,
        booking_request: Optional[BookingRequest] = None,
        slot_offer: Optional[SlotOffer] = None,
        force_confirm: bool = False,
        actor: str = "Patient Selection",
    ) -> Dict[str, Any]:
        """
        Atomically attempts to hold or confirm a slot.
        If a collision occurs, catches the conflict and returns alternative suggestions.
        """
        now = timezone.now()

        with transaction.atomic():
            # Check for conflicting active appointments or active temporary holds
            conflict_exists = Appointment.objects.filter(
                doctor=doctor,
                start_datetime__lt=end_datetime,
                end_datetime__gt=start_datetime,
            ).filter(
                Q(status__in=['confirmed', 'arrived', 'in_consultation']) |
                Q(status='held', hold_expires_at__gt=now)
            ).exists()

            if conflict_exists:
                # Slot has been taken: query 3 alternative slots immediately
                alt_slots = self.engine.calculate_available_slots(
                    service=service,
                    start_date=start_datetime.date(),
                    end_date=start_datetime.date() + timedelta(days=7),
                    preferred_doctor=doctor,
                    limit=3,
                )
                return {
                    'success': False,
                    'conflict': True,
                    'message': 'This time slot was just secured by another patient.',
                    'alternative_slots': alt_slots,
                }

            # Determine whether slot requires a temporary hold (for deposit) or instant confirmation
            hold_minutes = self.clinic.hold_expiry_minutes
            if service.deposit_required and not force_confirm:
                initial_status = 'held'
                hold_expires = now + timedelta(minutes=hold_minutes)
                confirmed_at = None
            else:
                initial_status = 'confirmed'
                hold_expires = None
                confirmed_at = now

            # Generate unique appointment code
            appt_code = f"AP-{uuid.uuid4().hex[:6].upper()}"

            appointment = Appointment.objects.create(
                appointment_code=appt_code,
                booking_request=booking_request,
                patient_name=patient_name,
                patient_phone=patient_phone,
                doctor=doctor,
                service=service,
                start_datetime=start_datetime,
                end_datetime=end_datetime,
                status=initial_status,
                hold_expires_at=hold_expires,
                confirmed_at=confirmed_at,
            )

            # Update request status if linked
            if booking_request:
                booking_request.status = 'converted'
                booking_request.save(update_fields=['status', 'updated_at'])

            # Update slot offer if linked
            if slot_offer:
                slot_offer.is_selected = True
                slot_offer.save(update_fields=['is_selected'])

            # Record audit trail
            AuditLog.objects.create(
                actor=actor,
                action=f"ACQUIRED_SLOT_{initial_status.upper()}",
                entity_name="Appointment",
                entity_id=str(appointment.id),
                changes={
                    'appointment_code': appt_code,
                    'doctor': doctor.name,
                    'start_datetime': start_datetime.isoformat(),
                    'status': initial_status,
                    'hold_expires_at': hold_expires.isoformat() if hold_expires else None,
                }
            )

            return {
                'success': True,
                'conflict': False,
                'appointment': appointment,
                'appointment_code': appointment.appointment_code,
                'status': initial_status,
                'hold_expires_at': hold_expires,
            }

    def confirm_held_appointment(
        self,
        appointment_id: str,
        actor: str = "Front Desk Payment Verification",
    ) -> Dict[str, Any]:
        """
        Transitions a held appointment to confirmed status once deposit is verified.
        """
        with transaction.atomic():
            try:
                appointment = Appointment.objects.select_for_update().get(id=appointment_id)
            except Appointment.DoesNotExist:
                return {'success': False, 'message': 'Appointment not found.'}

            if appointment.status != 'held':
                return {
                    'success': False,
                    'message': f"Appointment status is already '{appointment.status}'.",
                }

            now = timezone.now()
            if appointment.hold_expires_at and appointment.hold_expires_at < now:
                return {
                    'success': False,
                    'message': 'Temporary hold has expired. Slot is no longer reserved.',
                }

            appointment.status = 'confirmed'
            appointment.confirmed_at = now
            appointment.hold_expires_at = None
            appointment.save(update_fields=['status', 'confirmed_at', 'hold_expires_at', 'updated_at'])

            AuditLog.objects.create(
                actor=actor,
                action="CONFIRMED_HELD_APPOINTMENT",
                entity_name="Appointment",
                entity_id=str(appointment.id),
                changes={'status': 'confirmed', 'confirmed_at': now.isoformat()}
            )

            return {
                'success': True,
                'appointment': appointment,
                'message': 'Appointment confirmed successfully.',
            }
