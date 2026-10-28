import datetime
from django.utils import timezone
from django.db.models import Q
from appointments.models import (
    ClinicSetting,
    Doctor,
    Service,
    DoctorService,
    AvailabilityRule,
    Appointment,
)


class AvailabilityEngine:
    """
    Deterministic Availability & Scheduling Engine for Cedarcare Specialist Clinic.
    Calculates eligible clinical slots based on doctor shift intersections, qualification rules,
    sterilization buffers, lunch hours, emergency reserves, and contiguous schedule scoring (W1-W4).
    """

    TIME_WINDOWS = {
        'morning': (datetime.time(8, 0), datetime.time(12, 0)),
        'afternoon': (datetime.time(12, 0), datetime.time(16, 0)),
        'evening': (datetime.time(16, 0), datetime.time(18, 0)),
    }

    def __init__(self, clinic_settings=None):
        self.clinic = clinic_settings or ClinicSetting.get_settings()

    def get_available_slots_for_date(
        self,
        service,
        target_date,
        preferred_doctor=None,
        preferred_time_window=None,
        include_emergency=False,
        max_slots=10
    ):
        """
        Finds all eligible available appointment slots for a specific date.
        Returns a scored, sorted list of candidate slot dictionaries.
        """
        if isinstance(service, str):
            service = Service.objects.get(id=service)
        if isinstance(preferred_doctor, str):
            preferred_doctor = Doctor.objects.get(id=preferred_doctor)
        if isinstance(target_date, str):
            target_date = datetime.date.fromisoformat(target_date)

        # 1. Clinic operating day check
        # target_date.isoweekday(): 1=Monday ... 7=Sunday
        iso_day = target_date.isoweekday()
        if iso_day not in self.clinic.working_days:
            return []

        # 2. Get eligible doctors qualified for this service
        doctor_services = DoctorService.objects.filter(
            service=service,
            doctor__is_active=True,
            doctor__is_on_leave=False
        ).select_related('doctor')

        if preferred_doctor:
            doctor_services = doctor_services.filter(doctor=preferred_doctor)

        eligible_slots = []
        now = timezone.now()

        for ds in doctor_services:
            doctor = ds.doctor
            if iso_day not in doctor.working_days:
                continue

            # Check doctor daily appointment ceiling (burnout guard)
            day_start = timezone.make_aware(datetime.datetime.combine(target_date, datetime.time.min))
            day_end = timezone.make_aware(datetime.datetime.combine(target_date, datetime.time.max))

            # Lazy self-healing: free any expired holds
            Appointment.objects.filter(
                doctor=doctor,
                status='held',
                hold_expires_at__lt=now
            ).update(status='hold_expired')

            active_appts_count = Appointment.objects.filter(
                doctor=doctor,
                start_datetime__gte=day_start,
                start_datetime__lte=day_end,
                status__in=['confirmed', 'held', 'arrived', 'in_consultation']
            ).count()

            if active_appts_count >= doctor.max_daily_appointments:
                continue

            # Calculate effective shift bounds
            shift_start = max(self.clinic.open_time, doctor.shift_start)
            shift_end = min(self.clinic.close_time, doctor.shift_end)

            duration = ds.custom_duration_minutes or service.duration_minutes
            buffer_min = service.buffer_minutes or self.clinic.default_buffer_minutes
            total_block = datetime.timedelta(minutes=duration + buffer_min)
            step = datetime.timedelta(minutes=self.clinic.grid_increment_minutes)

            # Fetch existing blocks for this doctor on this day (select_related avoids N+1 queries)
            existing_appts = list(Appointment.objects.filter(
                doctor=doctor,
                start_datetime__gte=day_start - datetime.timedelta(hours=2),
                end_datetime__lte=day_end + datetime.timedelta(hours=2),
                status__in=['confirmed', 'held', 'arrived', 'in_consultation']
            ).select_related('service').order_by('start_datetime'))

            # Fetch doctor and clinic availability rules
            rules = list(AvailabilityRule.objects.filter(
                Q(doctor=doctor) | Q(doctor__isnull=True),
                start_datetime__lte=day_end,
                end_datetime__gte=day_start
            ))

            current_time = datetime.datetime.combine(target_date, shift_start)
            end_shift_dt = datetime.datetime.combine(target_date, shift_end)

            # Minimum advance notice check for today
            min_notice_dt = now + datetime.timedelta(hours=self.clinic.min_advance_hours)

            while current_time + total_block <= end_shift_dt:
                slot_start = timezone.make_aware(current_time)
                slot_end = timezone.make_aware(current_time + datetime.timedelta(minutes=duration))
                block_end = timezone.make_aware(current_time + total_block)

                current_time += step

                # Must satisfy advance notice if today
                if slot_start < min_notice_dt:
                    continue

                # Must not intersect clinic lunch break
                lunch_start = timezone.make_aware(datetime.datetime.combine(target_date, self.clinic.lunch_break_start))
                lunch_end = timezone.make_aware(datetime.datetime.combine(target_date, self.clinic.lunch_break_end))
                if slot_start < lunch_end and block_end > lunch_start:
                    continue

                # Must not intersect availability rules
                rule_conflict = False
                is_emergency_slot = False
                for r in rules:
                    if slot_start < r.end_datetime and block_end > r.start_datetime:
                        if r.rule_type == 'emergency_reserve':
                            is_emergency_slot = True
                            if not include_emergency:
                                rule_conflict = True
                                break
                        else:
                            rule_conflict = True
                            break

                if rule_conflict:
                    continue

                # Must not intersect existing appointments or their sterilization buffers
                appt_conflict = False
                for appt in existing_appts:
                    # Previous appointment sterilization buffer extends appt.end_datetime
                    appt_buffer = appt.service.buffer_minutes or self.clinic.default_buffer_minutes
                    appt_block_end = appt.end_datetime + datetime.timedelta(minutes=appt_buffer)
                    if slot_start < appt_block_end and block_end > appt.start_datetime:
                        appt_conflict = True
                        break

                if appt_conflict:
                    continue

                # Contiguous Schedule Optimization Scoring (W1 - W4)
                score = self._calculate_contiguous_score(
                    slot_start=slot_start,
                    block_end=block_end,
                    shift_start_dt=timezone.make_aware(datetime.datetime.combine(target_date, shift_start)),
                    shift_end_dt=timezone.make_aware(end_shift_dt),
                    existing_appts=existing_appts,
                    preferred_time_window=preferred_time_window
                )

                eligible_slots.append({
                    'doctor_id': str(doctor.id),
                    'doctor_name': doctor.name,
                    'doctor_specialty': doctor.specialty,
                    'start_datetime': slot_start.isoformat(),
                    'end_datetime': slot_end.isoformat(),
                    'duration_minutes': duration,
                    'buffer_minutes': buffer_min,
                    'score': score,
                    'is_emergency_reserve': is_emergency_slot,
                    'is_alternative_date': False,
                })

        # Sort slots: highest score first, then earliest start time
        eligible_slots.sort(key=lambda s: (-s['score'], s['start_datetime']))
        return eligible_slots[:max_slots]

    def _calculate_contiguous_score(
        self,
        slot_start,
        block_end,
        shift_start_dt,
        shift_end_dt,
        existing_appts,
        preferred_time_window=None
    ):
        """
        Scores slot based on Contiguous Schedule Optimization to eliminate orphan gaps:
        - W1 (+50): Snugly touches the end of a previous appointment's buffer.
        - W2 (+50): Snugly touches the start of a following appointment.
        - W3 (+30): Anchored to the start or end of the doctor's shift.
        - W4 (+40): Fits within patient's preferred time window.
        """
        score = 100  # Base score

        # W4: Preferred Time Window bonus
        if preferred_time_window and preferred_time_window in self.TIME_WINDOWS:
            win_start_t, win_end_t = self.TIME_WINDOWS[preferred_time_window]
            slot_t = slot_start.time()
            if win_start_t <= slot_t < win_end_t:
                score += 40
            else:
                score -= 20  # Mild penalty for outside window

        # W3: Shift boundary anchor
        if slot_start == shift_start_dt or block_end == shift_end_dt:
            score += 30

        # W1 & W2: Adjacent to existing appointments
        for appt in existing_appts:
            appt_buffer = appt.service.buffer_minutes or self.clinic.default_buffer_minutes
            appt_effective_end = appt.end_datetime + datetime.timedelta(minutes=appt_buffer)

            # W1: Adjacent to previous
            if slot_start == appt_effective_end:
                score += 50
            # W2: Adjacent to next
            if block_end == appt.start_datetime:
                score += 50

        return score

    def find_candidate_slots_for_request(self, booking_request, max_slots=3):
        """
        Scans dates within the patient's preferred 2-week range.
        If 0 slots are found in range, automatically scans forward to find the 3 nearest
        alternative slots (Option A - Nearest-Alternative Auto-Offer) flagged with is_alternative_date=True.
        """
        service = booking_request.service
        preferred_doctor = booking_request.preferred_doctor
        preferred_time_window = booking_request.preferred_time_window
        date_range = booking_request.preferred_date_range or {}

        today = timezone.now().date()
        try:
            start_date = datetime.date.fromisoformat(date_range.get('start'))
            end_date = datetime.date.fromisoformat(date_range.get('end'))
        except (ValueError, TypeError):
            start_date = today
            end_date = today + datetime.timedelta(days=14)

        # Ensure start_date is not in the past
        if start_date < today:
            start_date = today
        if end_date < start_date:
            end_date = start_date + datetime.timedelta(days=14)

        collected_slots = []
        curr_date = start_date

        # Phase 1: Scan within requested range
        while curr_date <= end_date and len(collected_slots) < max_slots * 3:
            day_slots = self.get_available_slots_for_date(
                service=service,
                target_date=curr_date,
                preferred_doctor=preferred_doctor,
                preferred_time_window=preferred_time_window,
                max_slots=max_slots
            )
            collected_slots.extend(day_slots)
            curr_date += datetime.timedelta(days=1)

        # Phase 2: If 0 slots found, execute Nearest-Alternative Fallback (up to 14 days beyond window)
        if not collected_slots:
            alt_date = end_date + datetime.timedelta(days=1)
            alt_horizon = alt_date + datetime.timedelta(days=14)

            while alt_date <= alt_horizon and len(collected_slots) < max_slots:
                day_slots = self.get_available_slots_for_date(
                    service=service,
                    target_date=alt_date,
                    preferred_doctor=preferred_doctor,
                    preferred_time_window=preferred_time_window,
                    max_slots=max_slots
                )
                for slot in day_slots:
                    slot['is_alternative_date'] = True
                    collected_slots.append(slot)
                alt_date += datetime.timedelta(days=1)

        # Sort: in-range slots first, then highest score, then earliest time
        collected_slots.sort(key=lambda s: (s['is_alternative_date'], -s['score'], s['start_datetime']))
        return collected_slots[:max_slots]
