"""
ConflictService — read-only detection of patient double-bookings.

A double-booking is two ACTIVE appointments (confirmed / held / arrived /
in_consultation) for the SAME doctor whose real intervals overlap. The booking
engine already prevents these under a row lock; this detector exists to make a
data-level breach (bad import, manual SQL, migration) impossible to miss: the
dashboard raises a red alert naming the doctor, both appointment codes and the
overlap window.

Deliberate rules:
  * Only real appointment intervals are compared - never sterilization
    buffers. A buffer clash is a scheduling inconvenience; two patients in the
    same chair at the same moment is the emergency this alert is for.
  * Expired holds are not conflicts: the patient never confirmed and the slot
    is free again.
  * The scan window keeps the query small: one day back (to catch a visit that
    ran over midnight) and fourteen days forward.
"""
import datetime

from django.utils import timezone

from ..models import Appointment

ACTIVE_STATUSES = ['confirmed', 'held', 'arrived', 'in_consultation']


class ConflictService:
    @classmethod
    def find_double_bookings(cls, now=None, lookback_days=1, lookahead_days=14):
        """
        Return every overlapping pair of active appointments, one dict per pair:

            {
              'doctor_id': '<uuid>',
              'doctor_name': 'Dr. Bello Ibrahim',
              'appointment_a': {'id', 'code', 'patient', 'status', 'start', 'end'},
              'appointment_b': {...},
              'overlap_start': '<iso>',
              'overlap_end': '<iso>',
            }

        Sorted by overlap start so the receptionist sees the soonest clash first.
        Read-only: never mutates an appointment.
        """
        now = now or timezone.now()
        window_start = now - datetime.timedelta(days=lookback_days)
        window_end = now + datetime.timedelta(days=lookahead_days)

        appointments = list(
            Appointment.objects.filter(
                status__in=ACTIVE_STATUSES,
                start_datetime__lt=window_end,
                end_datetime__gt=window_start,
            )
            .exclude(status='held', hold_expires_at__lte=now)
            .select_related('doctor')
            .order_by('start_datetime', 'end_datetime', 'appointment_code')
        )

        by_doctor = {}
        for appt in appointments:
            by_doctor.setdefault(appt.doctor_id, []).append(appt)

        conflicts = []
        for doctor_id, appts in by_doctor.items():
            for i in range(len(appts)):
                for j in range(i + 1, len(appts)):
                    first, second = appts[i], appts[j]
                    overlap_start = max(first.start_datetime, second.start_datetime)
                    overlap_end = min(first.end_datetime, second.end_datetime)
                    if overlap_start >= overlap_end:
                        continue
                    conflicts.append({
                        'doctor_id': str(doctor_id),
                        'doctor_name': first.doctor.name,
                        'appointment_a': cls._describe(first),
                        'appointment_b': cls._describe(second),
                        'overlap_start': overlap_start.isoformat(),
                        'overlap_end': overlap_end.isoformat(),
                    })

        conflicts.sort(key=lambda c: (c['overlap_start'], c['doctor_name']))
        return conflicts

    @staticmethod
    def _describe(appt):
        return {
            'id': str(appt.id),
            'code': appt.appointment_code,
            'patient': appt.patient_name,
            'status': appt.status,
            'start': appt.start_datetime.isoformat(),
            'end': appt.end_datetime.isoformat(),
        }
