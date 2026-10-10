"""
60-Second Background Expiry Sweeper Service.
Agency Template State Machine Garbage Collector.

Sweeps:
1. Slot Offers where offer_expires_at < now() (Transition: slots_offered -> offer_expired)
2. Temporary Holds where hold_expires_at < now() (Transition: held -> cancelled/released)
"""

from typing import Dict, Any, List
from django.db import transaction
from django.utils import timezone
from appointments.models import (
    BookingRequest,
    Appointment,
    AuditLog,
)


class SweepService:
    """
    Executes automated sweep sweeps to enforce 60-minute offer windows
    and 15-minute temporary holds without leaving stale locks in the schedule.
    """

    def sweep_all(self, actor: str = "System Sweeper Cron") -> Dict[str, Any]:
        """
        Executes both offer expiry and hold expiry sweeps in a single call.
        """
        now = timezone.now()
        expired_offers = self.sweep_expired_offers(now=now, actor=actor)
        expired_holds = self.sweep_expired_holds(now=now, actor=actor)

        return {
            'timestamp': now.isoformat(),
            'expired_offers_count': len(expired_offers),
            'expired_holds_count': len(expired_holds),
            'processed_offers': expired_offers,
            'processed_holds': expired_holds,
        }

    def sweep_expired_offers(self, now=None, actor: str = "System Sweeper Cron") -> List[Dict[str, Any]]:
        """
        Identifies booking requests where offer_expires_at < now and
        transitions them to 'offer_expired'.
        """
        now = now or timezone.now()
        processed = []

        with transaction.atomic():
            expired_requests = BookingRequest.objects.filter(
                status='slots_offered',
                offer_expires_at__lt=now,
            )

            for req in expired_requests:
                req.status = 'offer_expired'
                req.save(update_fields=['status', 'updated_at'])

                AuditLog.objects.create(
                    actor=actor,
                    action="OFFER_WINDOW_EXPIRED",
                    entity_name="BookingRequest",
                    entity_id=str(req.id),
                    changes={
                        'request_code': req.request_code,
                        'patient_name': req.patient_name,
                        'expired_at': now.isoformat(),
                    }
                )

                # Re-engagement patient recovery text
                reengagement_msg = (
                    f"Hello {req.patient_name}, the previously offered appointment slots have expired "
                    f"to keep our clinic schedule open for all patients. We would still love to see you! "
                    f"Reply or click below to request fresh available times from our reception team."
                )

                processed.append({
                    'request_code': req.request_code,
                    'patient_name': req.patient_name,
                    'patient_phone': req.patient_phone,
                    'reengagement_message': reengagement_msg,
                })

        return processed

    def sweep_expired_holds(self, now=None, actor: str = "System Sweeper Cron") -> List[Dict[str, Any]]:
        """
        Identifies temporary appointment holds where hold_expires_at < now
        and frees the slot back to the scheduling pool.
        """
        now = now or timezone.now()
        processed = []

        with transaction.atomic():
            expired_holds = Appointment.objects.filter(
                status='held',
                hold_expires_at__lt=now,
            )

            for appt in expired_holds:
                appt.status = 'cancelled'
                appt.cancelled_at = now
                appt.cancellation_reason = "15-minute temporary hold expired without deposit verification."
                appt.save(update_fields=['status', 'cancelled_at', 'cancellation_reason', 'updated_at'])

                AuditLog.objects.create(
                    actor=actor,
                    action="TEMPORARY_HOLD_EXPIRED",
                    entity_name="Appointment",
                    entity_id=str(appt.id),
                    changes={
                        'appointment_code': appt.appointment_code,
                        'patient_name': appt.patient_name,
                        'doctor': appt.doctor.name,
                        'expired_at': now.isoformat(),
                    }
                )

                processed.append({
                    'appointment_code': appt.appointment_code,
                    'patient_name': appt.patient_name,
                    'patient_phone': appt.patient_phone,
                    'doctor': appt.doctor.name,
                })

        return processed
