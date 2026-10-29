from django.db import transaction
from django.utils import timezone
from appointments.models import (
    BookingRequest,
    Appointment,
    AuditLog,
)


class SweepService:
    """
    60-Second Expiry Cron Sweeper Engine (Risk R-06).
    Performs batch transitions for:
    1. 60-Minute Slot Offers: transitions 'slots_offered' -> 'offer_expired'.
    2. 15-Minute Temporary Holds: transitions 'held' -> 'hold_expired', freeing the slot.
    """

    @classmethod
    @transaction.atomic
    def run_sweep(cls, performed_by="cron_sweeper"):
        """
        Executes a complete sweep iteration and returns metrics on expired entities.
        """
        now = timezone.now()

        # 1. Sweep expired 1-hour candidate slot offers
        expired_offers = BookingRequest.objects.select_for_update().filter(
            status='slots_offered',
            offer_expires_at__lt=now
        )
        expired_offer_codes = []
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

        # 2. Sweep expired 15-minute temporary holds (excluding appointments already converted by patient selection)
        expired_holds = Appointment.objects.select_for_update().filter(
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
            'expired_holds_count': len(expired_hold_codes),
            'expired_hold_codes': expired_hold_codes,
        }
