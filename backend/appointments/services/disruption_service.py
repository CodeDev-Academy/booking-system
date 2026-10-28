import datetime
from django.db import transaction
from django.utils import timezone
from appointments.models import (
    Doctor,
    DoctorService,
    Appointment,
    AuditLog,
)
from .availability import AvailabilityEngine


class DisruptionService:
    """
    Doctor Emergency Sick Leave & Disruption Management Protocol (Risk R-15).
    Identifies affected appointments, finds 1-click colleague reassignments at identical times,
    and calculates priority replacement slots for affected patients.
    """

    @classmethod
    @transaction.atomic
    def declare_doctor_leave(cls, doctor_id, leave_start_dt=None, leave_end_dt=None, reason="Emergency Leave", performed_by="receptionist"):
        """
        Marks a doctor as on-leave and scans for all impacted appointments.
        Returns a structured disruption report with colleague reassignments and reschedule options.
        """
        now = timezone.now()
        leave_start_dt = leave_start_dt or now
        if not leave_end_dt:
            # Default to end of current day
            leave_end_dt = timezone.make_aware(datetime.datetime.combine(leave_start_dt.date(), datetime.time(23, 59, 59)))

        doctor = Doctor.objects.select_for_update().get(id=doctor_id)
        doctor.is_on_leave = True
        doctor.save(update_fields=['is_on_leave'])

        # Find all confirmed or held appointments in the leave window
        impacted_appts = Appointment.objects.filter(
            doctor=doctor,
            status__in=['confirmed', 'held'],
            start_datetime__gte=leave_start_dt,
            start_datetime__lte=leave_end_dt
        ).select_related('service').order_by('start_datetime')

        # Find available active colleagues on duty
        qualified_colleagues = Doctor.objects.filter(
            is_active=True,
            is_on_leave=False
        ).exclude(id=doctor.id)

        disruption_report = []
        engine = AvailabilityEngine()

        for appt in impacted_appts:
            item = {
                'appointment_id': str(appt.id),
                'appointment_code': appt.appointment_code,
                'patient_name': appt.patient_name,
                'patient_phone': appt.patient_phone,
                'service_name': appt.service.name,
                'start_datetime': appt.start_datetime.isoformat(),
                'end_datetime': appt.end_datetime.isoformat(),
                'eligible_reassignments': [],
                'reschedule_suggestions': []
            }

            # 1. Colleague Reassignment Check (Can a colleague take it at the EXACT same time?)
            local_start = timezone.localtime(appt.start_datetime)
            local_end = timezone.localtime(appt.end_datetime)
            iso_day = local_start.isoweekday()
            appt_start_t = local_start.time()
            appt_end_t = local_end.time()

            day_start = timezone.make_aware(datetime.datetime.combine(local_start.date(), datetime.time.min))
            day_end = timezone.make_aware(datetime.datetime.combine(local_start.date(), datetime.time.max))

            for colleague in qualified_colleagues:
                # 1a. Working day check
                if iso_day not in colleague.working_days:
                    continue

                # 1b. Shift hours check
                if appt_start_t < colleague.shift_start or appt_end_t > colleague.shift_end:
                    continue

                # 1c. Qualification check
                is_qualified = DoctorService.objects.filter(doctor=colleague, service=appt.service).exists()
                if not is_qualified:
                    continue

                # 1d. Daily appointment ceiling check (burnout guard)
                daily_count = Appointment.objects.filter(
                    doctor=colleague,
                    start_datetime__gte=day_start,
                    start_datetime__lte=day_end,
                    status__in=['confirmed', 'held', 'arrived', 'in_consultation']
                ).count()
                if daily_count >= colleague.max_daily_appointments:
                    continue

                # 1e. Schedule conflict check
                has_conflict = Appointment.objects.filter(
                    doctor=colleague,
                    status__in=['confirmed', 'held', 'arrived', 'in_consultation'],
                    start_datetime__lt=appt.end_datetime,
                    end_datetime__gt=appt.start_datetime
                ).exists()

                if not has_conflict:
                    item['eligible_reassignments'].append({
                        'doctor_id': str(colleague.id),
                        'doctor_name': colleague.name,
                        'specialty': colleague.specialty,
                    })

            # 2. Reschedule Suggestions (Next 3 days)
            tomorrow = leave_start_dt.date() + datetime.timedelta(days=1)
            suggested_slots = engine.get_available_slots_for_date(
                service=appt.service,
                target_date=tomorrow,
                max_slots=3
            )
            item['reschedule_suggestions'] = suggested_slots
            disruption_report.append(item)

        AuditLog.objects.create(
            entity_name='Doctor',
            entity_id=doctor.id,
            action='DOCTOR_EMERGENCY_LEAVE_DECLARED',
            performed_by=performed_by,
            changes={
                'doctor_name': doctor.name,
                'impacted_count': len(disruption_report),
                'reason': reason,
            }
        )

        return {
            'doctor_id': str(doctor.id),
            'doctor_name': doctor.name,
            'is_on_leave': doctor.is_on_leave,
            'impacted_count': len(disruption_report),
            'impacted_appointments': disruption_report
        }

    @classmethod
    @transaction.atomic
    def reassign_to_colleague(cls, appointment_id, new_doctor_id, performed_by="receptionist"):
        """
        1-Click Reassignment of an impacted appointment to an available qualified colleague.
        """
        appointment = Appointment.objects.select_for_update().get(id=appointment_id)
        new_doctor = Doctor.objects.get(id=new_doctor_id)
        old_doctor_name = appointment.doctor.name

        appointment.doctor = new_doctor
        appointment.save(update_fields=['doctor', 'updated_at'])

        AuditLog.objects.create(
            entity_name='Appointment',
            entity_id=appointment.id,
            action='DISRUPTION_COLLEAGUE_REASSIGNMENT',
            performed_by=performed_by,
            changes={
                'from_doctor': old_doctor_name,
                'to_doctor': new_doctor.name,
                'appointment_code': appointment.appointment_code,
            }
        )

        return appointment
