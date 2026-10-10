"""
Doctor Sick Leave & Emergency Disruption Protocol.
Agency Template Patient Protection & Reassignment Logic.

Handles:
1. Identifying disrupted bookings when a doctor takes emergency sick leave
2. Colleague auto-matching for instant 1-click reassignment at the same time
3. Generating priority reschedule options when no colleague is free
"""

from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from django.db import transaction
from django.utils import timezone
from django.db.models import Q
from appointments.models import (
    ClinicSetting,
    Doctor,
    Appointment,
    AuditLog,
)
from appointments.services.availability import AvailabilityEngine


class DisruptionService:
    """
    Evaluates and resolves schedule disruptions caused by doctor leave or emergency absence.
    """

    def __init__(self, clinic_setting: Optional[ClinicSetting] = None):
        self.clinic = clinic_setting or ClinicSetting.objects.first() or ClinicSetting()
        self.engine = AvailabilityEngine(clinic_setting=self.clinic)

    def assess_doctor_leave_impact(self, doctor: Doctor) -> Dict[str, Any]:
        """
        Analyzes all upcoming visits for the affected doctor and determines
        instant reassignment feasibility or priority reschedule needs.
        """
        now = timezone.now()

        # Find upcoming visits for this doctor
        affected_appts = Appointment.objects.filter(
            doctor=doctor,
            start_datetime__gte=now,
            status__in=['confirmed', 'held'],
        ).select_related('service').order_by('start_datetime')

        disruption_report = []

        for appt in affected_appts:
            # 1. Look for an eligible colleague for this service who is free at this exact time
            colleague = self._find_free_colleague_for_slot(
                service=appt.service,
                excluded_doctor=doctor,
                start_dt=appt.start_datetime,
                end_dt=appt.end_datetime,
            )

            if colleague:
                disruption_report.append({
                    'appointment_id': str(appt.id),
                    'appointment_code': appt.appointment_code,
                    'patient_name': appt.patient_name,
                    'patient_phone': appt.patient_phone,
                    'service_name': appt.service.name,
                    'start_datetime': appt.start_datetime.isoformat(),
                    'end_datetime': appt.end_datetime.isoformat(),
                    'can_instant_reassign': True,
                    'suggested_doctor_id': str(colleague.id),
                    'suggested_doctor_name': colleague.name,
                    'suggested_doctor_specialty': colleague.specialty,
                    'priority_reschedule_slots': [],
                })
            else:
                # 2. No colleague free: generate next 3 earliest available slots
                reschedule_slots = self.engine.calculate_available_slots(
                    service=appt.service,
                    start_date=appt.start_datetime.date(),
                    end_date=appt.start_datetime.date() + timedelta(days=14),
                    limit=3,
                )
                disruption_report.append({
                    'appointment_id': str(appt.id),
                    'appointment_code': appt.appointment_code,
                    'patient_name': appt.patient_name,
                    'patient_phone': appt.patient_phone,
                    'service_name': appt.service.name,
                    'start_datetime': appt.start_datetime.isoformat(),
                    'end_datetime': appt.end_datetime.isoformat(),
                    'can_instant_reassign': False,
                    'suggested_doctor_id': None,
                    'suggested_doctor_name': None,
                    'suggested_doctor_specialty': None,
                    'priority_reschedule_slots': reschedule_slots,
                })

        return {
            'doctor_id': str(doctor.id),
            'doctor_name': doctor.name,
            'is_on_leave': doctor.is_on_leave,
            'affected_count': len(disruption_report),
            'reassignable_count': sum(1 for item in disruption_report if item['can_instant_reassign']),
            'reschedule_needed_count': sum(1 for item in disruption_report if not item['can_instant_reassign']),
            'disruptions': disruption_report,
        }

    def _find_free_colleague_for_slot(
        self,
        service,
        excluded_doctor: Doctor,
        start_dt: datetime,
        end_dt: datetime,
    ) -> Optional[Doctor]:
        """
        Finds an active, non-leave colleague qualified for the service
        who is on shift and free of overlapping appointments during [start_dt, end_dt].
        """
        target_date = start_dt.date()
        target_time_start = start_dt.time()
        target_time_end = end_dt.time()

        colleagues = Doctor.objects.filter(
            is_active=True,
            is_on_leave=False,
            doctor_services__service=service,
        ).exclude(id=excluded_doctor.id).distinct()

        for colleague in colleagues:
            # Check if colleague works on this day
            if not colleague.is_available_on_date(target_date):
                continue

            # Check if slot is within colleague's shift
            if target_time_start < colleague.shift_start or target_time_end > colleague.shift_end:
                continue

            # Check if colleague has any conflicting appointments
            has_conflict = Appointment.objects.filter(
                doctor=colleague,
                start_datetime__lt=end_dt,
                end_datetime__gt=start_dt,
            ).filter(
                Q(status__in=['confirmed', 'arrived', 'in_consultation']) |
                Q(status='held', hold_expires_at__gt=timezone.now())
            ).exists()

            if not has_conflict:
                return colleague

        return None

    def reassign_appointment(
        self,
        appointment_id: str,
        new_doctor_id: str,
        actor: str = "Front Desk Disruption Manager",
    ) -> Dict[str, Any]:
        """
        Executes 1-click reassignment of an appointment to a colleague.
        """
        with transaction.atomic():
            try:
                appt = Appointment.objects.select_for_update().get(id=appointment_id)
                new_doctor = Doctor.objects.get(id=new_doctor_id)
            except (Appointment.DoesNotExist, Doctor.DoesNotExist) as e:
                return {'success': False, 'message': str(e)}

            old_doctor_name = appt.doctor.name
            appt.doctor = new_doctor
            appt.save(update_fields=['doctor', 'updated_at'])

            AuditLog.objects.create(
                actor=actor,
                action="REASSIGNED_DOCTOR_LEAVE",
                entity_name="Appointment",
                entity_id=str(appt.id),
                changes={
                    'appointment_code': appt.appointment_code,
                    'from_doctor': old_doctor_name,
                    'to_doctor': new_doctor.name,
                }
            )

            # Automated calm patient notification text template
            patient_notification = (
                f"Hello {appt.patient_name}, your upcoming appointment at {self.clinic.clinic_name} "
                f"on {appt.start_datetime.strftime('%A, %b %d at %I:%M %p')} has been smoothly "
                f"reassigned to {new_doctor.name} ({new_doctor.specialty}) at the exact same scheduled time."
            )

            return {
                'success': True,
                'appointment_code': appt.appointment_code,
                'new_doctor': new_doctor.name,
                'notification_message': patient_notification,
            }
