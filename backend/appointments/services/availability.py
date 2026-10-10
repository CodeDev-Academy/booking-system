"""
Core Deterministic Availability Engine & Contiguous Scoring.
Agency Template Master Scheduling Logic.

Implements:
1. Working days & shift boundaries per doctor
2. Service duration & rest/sanitization buffers
3. Collision detection against active bookings, active holds, and doctor breaks
4. Floating emergency slot protection (with receptionist override support)
5. 2-Week range evaluation & Nearest-Alternative Fallback
6. Schedule scoring (W1: Date, W2: Time, W3: Doctor, W4: Contiguity)
"""

from datetime import datetime, date, time, timedelta
from typing import List, Dict, Any, Optional
from django.utils import timezone
from django.db.models import Q
from appointments.models import (
    ClinicSetting,
    Doctor,
    Service,
    DoctorService,
    AvailabilityRule,
    Appointment,
    BookingRequest,
)


class AvailabilityEngine:
    """
    High-performance availability calculator adhering to clinic scheduling constraints.
    """

    def __init__(self, clinic_setting: Optional[ClinicSetting] = None):
        self.clinic = clinic_setting or ClinicSetting.objects.first() or ClinicSetting()

    def calculate_available_slots(
        self,
        service: Service,
        start_date: date,
        end_date: date,
        preferred_doctor: Optional[Doctor] = None,
        preferred_time_window: str = 'any',
        allow_emergency_override: bool = False,
        limit: int = 20,
    ) -> List[Dict[str, Any]]:
        """
        Calculates eligible available slots within the date range.
        If zero slots are available in the window, automatically executes
        nearest-alternative fallback into subsequent days.
        """
        # 1. Resolve qualified doctors for this service
        qualified_doctors = self._get_qualified_doctors(service, preferred_doctor)
        if not qualified_doctors:
            return []

        # 2. Search primary date window
        primary_slots = self._scan_date_range(
            doctors=qualified_doctors,
            service=service,
            start_date=start_date,
            end_date=end_date,
            preferred_doctor=preferred_doctor,
            preferred_time_window=preferred_time_window,
            allow_emergency_override=allow_emergency_override,
            is_alternative=False,
        )

        if primary_slots:
            # Sort descending by score
            primary_slots.sort(key=lambda s: s['score'], reverse=True)
            return primary_slots[:limit]

        # 3. Nearest Alternative Fallback (if requested window has 0 slots)
        # Scan next 14 days immediately following end_date
        fallback_start = end_date + timedelta(days=1)
        fallback_end = fallback_start + timedelta(days=14)
        fallback_slots = self._scan_date_range(
            doctors=qualified_doctors,
            service=service,
            start_date=fallback_start,
            end_date=fallback_end,
            preferred_doctor=preferred_doctor,
            preferred_time_window=preferred_time_window,
            allow_emergency_override=allow_emergency_override,
            is_alternative=True,
        )

        fallback_slots.sort(key=lambda s: s['score'], reverse=True)
        return fallback_slots[:limit]

    def _get_qualified_doctors(
        self,
        service: Service,
        preferred_doctor: Optional[Doctor] = None
    ) -> List[Doctor]:
        """
        Finds active doctors qualified to perform the requested service.
        """
        qs = Doctor.objects.filter(
            is_active=True,
            is_on_leave=False,
            doctor_services__service=service,
        ).distinct()

        # If preferred doctor is qualified and active, include them first
        doctors = list(qs)
        if preferred_doctor and preferred_doctor in doctors:
            doctors.remove(preferred_doctor)
            doctors.insert(0, preferred_doctor)
        return doctors

    def _scan_date_range(
        self,
        doctors: List[Doctor],
        service: Service,
        start_date: date,
        end_date: date,
        preferred_doctor: Optional[Doctor],
        preferred_time_window: str,
        allow_emergency_override: bool,
        is_alternative: bool,
    ) -> List[Dict[str, Any]]:
        """
        Scans each day in the date range for all qualified doctors.
        """
        all_candidate_slots = []
        total_duration = timedelta(minutes=service.duration_minutes + service.buffer_minutes)
        now = timezone.now()

        # Preload booked appointments and rules within the entire range for performance
        range_start_dt = timezone.make_aware(datetime.combine(start_date, time(0, 0)))
        range_end_dt = timezone.make_aware(datetime.combine(end_date, time(23, 59, 59)))

        existing_appts = list(Appointment.objects.filter(
            doctor__in=doctors,
            start_datetime__lt=range_end_dt,
            end_datetime__gt=range_start_dt,
        ).filter(
            Q(status__in=['confirmed', 'arrived', 'in_consultation']) |
            Q(status='held', hold_expires_at__gt=now)
        ).values('doctor_id', 'start_datetime', 'end_datetime'))

        existing_rules = list(AvailabilityRule.objects.filter(
            Q(doctor__in=doctors) | Q(doctor__isnull=True),
            start_datetime__lt=range_end_dt,
            end_datetime__gt=range_start_dt,
        ).values('doctor_id', 'start_datetime', 'end_datetime', 'rule_type'))

        current_day = start_date
        while current_day <= end_date:
            for doctor in doctors:
                # Check if doctor works on current_day
                if not doctor.is_available_on_date(current_day):
                    continue

                day_slots = self._generate_slots_for_doctor_day(
                    doctor=doctor,
                    service=service,
                    target_date=current_day,
                    total_duration=total_duration,
                    existing_appts=existing_appts,
                    existing_rules=existing_rules,
                    preferred_doctor=preferred_doctor,
                    preferred_time_window=preferred_time_window,
                    allow_emergency_override=allow_emergency_override,
                    is_alternative=is_alternative,
                )
                all_candidate_slots.extend(day_slots)

            current_day += timedelta(days=1)

        return all_candidate_slots

    def _generate_slots_for_doctor_day(
        self,
        doctor: Doctor,
        service: Service,
        target_date: date,
        total_duration: timedelta,
        existing_appts: List[Dict[str, Any]],
        existing_rules: List[Dict[str, Any]],
        preferred_doctor: Optional[Doctor],
        preferred_time_window: str,
        allow_emergency_override: bool,
        is_alternative: bool,
    ) -> List[Dict[str, Any]]:
        """
        Generates 15-minute grid aligned slot candidates for a doctor on a specific day.
        """
        slots = []
        now = timezone.now()

        # Doctor shift bounds
        shift_start = max(doctor.shift_start, self.clinic.open_time)
        shift_end = min(doctor.shift_end, self.clinic.close_time)

        shift_start_dt = timezone.make_aware(datetime.combine(target_date, shift_start))
        shift_end_dt = timezone.make_aware(datetime.combine(target_date, shift_end))

        # Clinic lunch bounds for this day
        lunch_start_dt = timezone.make_aware(datetime.combine(target_date, self.clinic.lunch_break_start))
        lunch_end_dt = timezone.make_aware(datetime.combine(target_date, self.clinic.lunch_break_end))

        # Doctor appointments for this day
        doc_appts = [
            a for a in existing_appts
            if a['doctor_id'] == doctor.id and a['start_datetime'].date() == target_date
        ]

        # Rules for this doctor or clinic-wide
        doc_rules = [
            r for r in existing_rules
            if (r['doctor_id'] is None or r['doctor_id'] == doctor.id)
            and r['start_datetime'].date() == target_date
        ]

        # Generate candidate slot starts on a 15-minute grid
        current_cursor = shift_start_dt
        candidate_times = []
        while current_cursor + total_duration <= shift_end_dt:
            # Slot cannot be in the past
            if current_cursor > now:
                candidate_times.append(current_cursor)
            current_cursor += timedelta(minutes=15)

        # Emergency slot reservation: shield last floating slot of shift unless override is active
        emergency_reserved_dt = None
        if not allow_emergency_override and self.clinic.emergency_slots_per_shift > 0:
            if candidate_times:
                # Reserve the last available slot before shift end as emergency reserve
                emergency_reserved_dt = candidate_times[-1]

        for slot_start in candidate_times:
            if emergency_reserved_dt and slot_start == emergency_reserved_dt:
                continue

            slot_end = slot_start + total_duration

            # 1. Lunch break collision check
            if slot_start < lunch_end_dt and slot_end > lunch_start_dt:
                continue

            # 2. Appointment collision check
            has_appt_collision = False
            for appt in doc_appts:
                if slot_start < appt['end_datetime'] and slot_end > appt['start_datetime']:
                    has_appt_collision = True
                    break
            if has_appt_collision:
                continue

            # 3. Rule / Break collision check
            has_rule_collision = False
            for rule in doc_rules:
                if slot_start < rule['end_datetime'] and slot_end > rule['start_datetime']:
                    has_rule_collision = True
                    break
            if has_rule_collision:
                continue

            # Calculate contiguity with adjacent bookings (W4 score)
            is_contiguous = self._check_contiguity(
                slot_start=slot_start,
                slot_end=slot_end,
                shift_start_dt=shift_start_dt,
                shift_end_dt=shift_end_dt,
                lunch_start_dt=lunch_start_dt,
                lunch_end_dt=lunch_end_dt,
                doc_appts=doc_appts,
            )

            # Calculate deterministic score
            score_data = self._calculate_score(
                slot_start=slot_start,
                doctor=doctor,
                preferred_doctor=preferred_doctor,
                preferred_time_window=preferred_time_window,
                is_alternative=is_alternative,
                is_contiguous=is_contiguous,
            )

            slots.append({
                'doctor_id': str(doctor.id),
                'doctor_name': doctor.name,
                'specialty': doctor.specialty,
                'service_id': str(service.id),
                'service_name': service.name,
                'start_datetime': slot_start.isoformat(),
                'end_datetime': slot_end.isoformat(),
                'duration_minutes': service.duration_minutes,
                'buffer_minutes': service.buffer_minutes,
                'is_alternative_date': is_alternative,
                'score': score_data['total_score'],
                'score_breakdown': score_data['breakdown'],
            })

        return slots

    def _check_contiguity(
        self,
        slot_start: datetime,
        slot_end: datetime,
        shift_start_dt: datetime,
        shift_end_dt: datetime,
        lunch_start_dt: datetime,
        lunch_end_dt: datetime,
        doc_appts: List[Dict[str, Any]],
    ) -> bool:
        """
        Returns True if slot directly abuts shift boundaries, lunch break,
        or an existing appointment (minimizes fragmented calendar islands).
        """
        # Abuts shift start or shift end
        if slot_start == shift_start_dt or slot_end == shift_end_dt:
            return True

        # Abuts lunch break
        if slot_end == lunch_start_dt or slot_start == lunch_end_dt:
            return True

        # Abuts another appointment (within 15 minutes)
        for appt in doc_appts:
            if abs((slot_start - appt['end_datetime']).total_seconds()) <= 900:
                return True
            if abs((appt['start_datetime'] - slot_end).total_seconds()) <= 900:
                return True

        return False

    def _calculate_score(
        self,
        slot_start: datetime,
        doctor: Doctor,
        preferred_doctor: Optional[Doctor],
        preferred_time_window: str,
        is_alternative: bool,
        is_contiguous: bool,
    ) -> Dict[str, Any]:
        """
        Deterministically scores the slot candidate:
        W1: Preferred Date Match (max 40)
        W2: Preferred Time Window (max 30)
        W3: Preferred Doctor Match (max 20)
        W4: Schedule Utilization / Contiguity (max 10)
        """
        # W1: Date factor
        if not is_alternative:
            w1_score = 40
        else:
            w1_score = 10

        # W2: Time window factor
        slot_hour = slot_start.hour
        w2_score = 10
        if preferred_time_window == 'morning' and 8 <= slot_hour < 12:
            w2_score = 30
        elif preferred_time_window == 'afternoon' and 12 <= slot_hour < 16:
            w2_score = 30
        elif preferred_time_window == 'evening' and 16 <= slot_hour < 19:
            w2_score = 30
        elif preferred_time_window == 'any':
            w2_score = 30

        # W3: Doctor factor
        if preferred_doctor and doctor.id == preferred_doctor.id:
            w3_score = 20
        else:
            w3_score = 10

        # W4: Contiguity factor
        w4_score = 10 if is_contiguous else 0

        total_score = w1_score + w2_score + w3_score + w4_score

        return {
            'total_score': total_score,
            'breakdown': {
                'p_date': w1_score,
                'p_time': w2_score,
                'd_pref': w3_score,
                'c_util': w4_score,
            }
        }

    def get_top_candidate_slots_for_request(
        self,
        booking_request: BookingRequest,
        limit: int = 3,
        allow_emergency_override: bool = False,
    ) -> List[Dict[str, Any]]:
        """
        Convenience method calculating top candidate slots for a BookingRequest record.
        """
        start_date = booking_request.preferred_date_start
        end_date = booking_request.preferred_date_end or start_date

        return self.calculate_available_slots(
            service=booking_request.service,
            start_date=start_date,
            end_date=end_date,
            preferred_doctor=booking_request.preferred_doctor,
            preferred_time_window=booking_request.preferred_time_window,
            allow_emergency_override=allow_emergency_override,
            limit=limit,
        )
