import datetime
from django.db import transaction
from django.utils import timezone
from appointments.models import (
    Doctor,
    DoctorLeave,
    DoctorService,
    Appointment,
    AuditLog,
    ClinicSetting,
    InteractionLog,
)
from .availability import AvailabilityEngine
from .hold_service import HoldService, SlotConflictException
from .sweep_service import PROVIDER_BY_CHANNEL


class _PreviewRollback(Exception):
    """Internal sentinel: unwinds a preview transaction so nothing is saved."""


class DisruptionService:
    """
    Doctor Emergency Sick Leave & Disruption Management Protocol (Risk R-15).
    Identifies affected appointments, finds 1-click colleague reassignments at identical times,
    and calculates priority replacement slots for affected patients.
    """

    @classmethod
    def record_leave_window(cls, doctor, leave_start_dt, leave_end_dt, reason,
                            performed_by, leave_type='emergency'):
        """
        Turn a datetime window into dated leave rows and keep the roster flag
        honest: `is_on_leave` stays True only while TODAY is inside the leave.

        A future-dated leave therefore no longer blocks the doctor's whole
        calendar, and a finished leave stops marking them off duty. Re-running
        the same window stretches the existing row instead of adding another.
        """
        today = timezone.localdate()
        start_date = timezone.localtime(leave_start_dt).date()
        end_date = timezone.localtime(leave_end_dt).date()

        # A doctor parked on the legacy "off duty" switch has no dates at all;
        # adding dated leave must not quietly put them back on duty.
        manual_off = doctor.is_on_leave and not doctor.leaves.exists()

        leave = DoctorLeave.record(
            doctor, start_date, end_date, reason=reason,
            leave_type=leave_type, created_by=performed_by,
        )
        if manual_off and not leave.covers(today):
            # Separate row: merging would turn the dated plan open-ended.
            DoctorLeave.objects.create(
                doctor=doctor, start_date=today, end_date=None,
                leave_type='other', reason='Manual off-duty (kept)',
                created_by=performed_by,
            )
        doctor.sync_leave_flag()
        return leave

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
        cls.record_leave_window(
            doctor, leave_start_dt, leave_end_dt, reason, performed_by,
            leave_type='emergency',
        )

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
                # 1a-bis. Dated leave on the appointment's own day
                if colleague.is_on_leave_on(local_start.date()):
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

        Phase 2.5 (system review finding #4): the move now carries the same
        zero-double-booking guarantee as a fresh booking — the TARGET doctor
        row is locked, availability is re-validated, and the colleague's
        calendar is conflict-checked (overlap + sterilization buffer) at the
        appointment's existing time before anything is saved. A clash raises
        SlotConflictException, which the view maps to 409.
        """
        appointment = Appointment.objects.select_for_update().get(id=appointment_id)
        old_doctor_name = appointment.doctor.name

        # Lock the target doctor row (same serialization as HoldService.acquire_slot).
        new_doctor = Doctor.objects.select_for_update().get(id=new_doctor_id)

        if not new_doctor.is_active or new_doctor.is_on_leave_on(
            timezone.localtime(appointment.start_datetime).date()
        ):
            raise SlotConflictException(
                f"Doctor {new_doctor.name} is currently unavailable or on leave."
            )

        HoldService.purge_expired_holds(new_doctor)
        conflict = HoldService.find_slot_conflict(
            new_doctor,
            appointment.start_datetime,
            appointment.end_datetime,
            service=appointment.service,
            exclude_appointment_id=appointment.id,
        )
        if conflict is not None:
            raise SlotConflictException(
                f"Colleague {new_doctor.name} already has an appointment "
                f"({conflict.appointment_code}) or its sterilization buffer overlapping "
                f"this time block.",
                conflicting_appointment=conflict,
            )

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

    # ------------------------------------------------------------------
    # Item B.1 — One-click auto-resolve (receptionist-approved pattern).
    #
    # ONE call: declare the leave, then place EVERY impacted patient in
    # priority order — (1) qualified colleague free at the EXACT same time,
    # (2) any free colleague slot the SAME day, (3) the NEXT day, up to
    # max_lookahead_days — under the same zero-double-booking guarantees as
    # HoldService (row lock + conflict + sterilization buffer), then queue
    # WhatsApp + SMS notice messages whose words are written HERE (n8n only
    # delivers; copy never lives in n8n).
    #
    # The claim row IS the dedupe (same pattern as reminder_service): one
    # outbound InteractionLog row per message (status 'queued',
    # deterministic external_ref `disrupt-<code>-<channel>`), so a second
    # auto-resolve or a webhook re-push can never double-send.
    # ------------------------------------------------------------------

    DISRUPTION_CLAIM_PREFIX = 'disrupt-'

    @classmethod
    def disruption_notice_message(cls, appointment, old_doctor_name, clinic):
        """SMS-safe emergency-move copy. States the ACTUAL new date and time
        (never "tomorrow"), both doctors, and the reference code."""
        local_start = timezone.localtime(appointment.start_datetime)
        date_str = local_start.strftime('%a %d %b')
        time_str = local_start.strftime('%I:%M %p').lstrip('0')
        return (
            f"Hello {appointment.patient_name}, due to a sudden emergency, your "
            f"{appointment.service.name} appointment with {old_doctor_name} has been moved. "
            f"You are now booked with {appointment.doctor.name} on {date_str} at {time_str} "
            f"at {clinic.clinic_name}. We apologise for the change. "
            f"Please call {clinic.phone} if this does not suit you. Ref {appointment.appointment_code}."
        )

    @classmethod
    def _build_distribution(cls, doctor, colleague_ids=None, colleague_caps=None):
        """
        Turn the receptionist's distribution choice into an allow-list and
        per-day caps.

        - `colleague_ids` absent/None: any available colleague may take patients
          (the original auto-split behaviour).
        - `colleague_ids` given: only those doctors are considered. An empty list
          is a deliberate "nobody", and every patient comes back unplaced.
        - `colleague_caps` maps a doctor id to the most EXTRA patients this plan
          may give them on any one day. Cap 0 means "do not use this doctor".
        """
        caps = {}
        for raw_id, raw_cap in (colleague_caps or {}).items():
            try:
                cap = int(raw_cap)
            except (TypeError, ValueError):
                raise ValueError('Colleague caps must be whole numbers.')
            if cap < 0:
                raise ValueError('Colleague caps cannot be negative.')
            caps[str(raw_id)] = cap

        allowed = None
        if colleague_ids is not None:
            ids = list(dict.fromkeys(str(value) for value in colleague_ids))
            if str(doctor.id) in ids:
                raise ValueError(
                    'The doctor who is going on leave cannot take their own patients.'
                )
            if not ids:
                allowed = set()
            else:
                known = {
                    str(pk) for pk in Doctor.objects.filter(
                        id__in=[value for value in ids], is_active=True
                    ).values_list('id', flat=True)
                }
                missing = [value for value in ids if value not in known]
                if missing:
                    raise ValueError(
                        'The plan names a colleague who is not an active doctor.'
                    )
                allowed = known

        return allowed, caps

    @staticmethod
    def _cap_allows(caps, placed_by_day, doctor_id, day):
        """True while the plan has given this doctor fewer than their cap on `day`."""
        cap = caps.get(str(doctor_id))
        if cap is None:
            return True
        return placed_by_day.get((str(doctor_id), day), 0) < cap

    @staticmethod
    def _cap_note(caps, placed_by_day, doctor, day):
        cap = caps.get(str(doctor.id))
        used = placed_by_day.get((str(doctor.id), day), 0)
        day_label = day.strftime('%a, %d %b')
        return f'{doctor.name} hit the cap you set for {day_label} ({used} of {cap}).'

    @classmethod
    def _colleague_can_take_at_same_time(cls, appointment, colleague):
        """Priority-1 check: qualified, on duty, inside shift, under ceiling,
        and conflict-free (with sterilization buffer) at the appointment's
        existing time."""
        local_start = timezone.localtime(appointment.start_datetime)
        local_end = timezone.localtime(appointment.end_datetime)
        iso_day = local_start.isoweekday()
        if iso_day not in colleague.working_days:
            return False
        if colleague.is_on_leave_on(local_start.date()):
            return False
        if local_start.time() < colleague.shift_start or local_end.time() > colleague.shift_end:
            return False
        if not DoctorService.objects.filter(doctor=colleague, service=appointment.service).exists():
            return False
        day_start = timezone.make_aware(datetime.datetime.combine(local_start.date(), datetime.time.min))
        day_end = timezone.make_aware(datetime.datetime.combine(local_start.date(), datetime.time.max))
        daily_count = Appointment.objects.filter(
            doctor=colleague,
            start_datetime__gte=day_start,
            start_datetime__lte=day_end,
            status__in=['confirmed', 'held', 'arrived', 'in_consultation'],
        ).count()
        if daily_count >= colleague.max_daily_appointments:
            return False
        return HoldService.find_slot_conflict(
            colleague,
            appointment.start_datetime,
            appointment.end_datetime,
            service=appointment.service,
            exclude_appointment_id=appointment.id,
        ) is None

    @classmethod
    def _apply_move(cls, appointment, new_doctor, new_start, new_end, performed_by):
        """The zero-double-booking save: lock the target doctor row, re-validate
        the block, then move. Raises SlotConflictException and leaves the
        appointment untouched on any clash."""
        locked = Doctor.objects.select_for_update().get(id=new_doctor.id)
        if not locked.is_active or locked.is_on_leave_on(
            timezone.localtime(new_start).date()
        ):
            raise SlotConflictException(
                f"Doctor {locked.name} is currently unavailable or on leave."
            )
        HoldService.purge_expired_holds(locked)
        conflict = HoldService.find_slot_conflict(
            locked,
            new_start,
            new_end,
            service=appointment.service,
            exclude_appointment_id=appointment.id,
        )
        if conflict is not None:
            raise SlotConflictException(
                f"Colleague {locked.name} already has an appointment "
                f"({conflict.appointment_code}) overlapping this block.",
                conflicting_appointment=conflict,
            )
        old_doctor_name = appointment.doctor.name
        appointment.doctor = locked
        appointment.start_datetime = new_start
        appointment.end_datetime = new_end
        appointment.save(update_fields=['doctor', 'start_datetime', 'end_datetime', 'updated_at'])
        AuditLog.objects.create(
            entity_name='Appointment',
            entity_id=appointment.id,
            action='DISRUPTION_AUTO_RESOLVE_MOVE',
            performed_by=performed_by,
            changes={
                'from_doctor': old_doctor_name,
                'to_doctor': locked.name,
                'new_start': new_start.isoformat(),
                'appointment_code': appointment.appointment_code,
            },
        )
        return old_doctor_name

    @classmethod
    def _queue_notice_messages(cls, appointment, old_doctor_name, clinic):
        """WhatsApp + SMS notice per placed patient, guarded by deterministic
        claim rows. Returns the deliverable item dicts (words included)."""
        words = cls.disruption_notice_message(appointment, old_doctor_name, clinic)
        items = []
        for channel in ('sms', 'whatsapp'):
            claim_ref = f"{cls.DISRUPTION_CLAIM_PREFIX}{appointment.appointment_code}-{channel}"
            draft = {
                'request_id': appointment.appointment_code,
                'id': str(appointment.id),
                'kind': 'disruption',
                'channel': channel,
                'patient_name': appointment.patient_name,
                'patient_phone': appointment.patient_phone,
                'service_name': appointment.service.name,
                'doctor_name': appointment.doctor.name,
                'start_datetime': appointment.start_datetime.isoformat(),
                'claim_ref': claim_ref,
                'message': words,
            }
            _, created = InteractionLog.objects.get_or_create(
                external_ref=claim_ref,
                defaults={
                    'provider': PROVIDER_BY_CHANNEL[channel],
                    'channel': channel,
                    'direction': 'outbound',
                    'status': 'queued',
                    'patient_name': appointment.patient_name,
                    'patient_phone': appointment.patient_phone,
                    'appointment': appointment,
                    'booking_request': appointment.booking_request,
                    'summary': 'Emergency disruption reassignment notice queued for delivery',
                },
            )
            if created:
                items.append(draft)
        return items

    @classmethod
    @transaction.atomic
    def auto_resolve_disruption(cls, doctor_id, leave_start_dt=None, leave_end_dt=None,
                                reason="Emergency Leave", performed_by="receptionist",
                                max_lookahead_days=3, colleague_ids=None,
                                colleague_caps=None):
        """
        One-click emergency-leave resolution: marks the doctor on leave, then
        for EVERY impacted appointment tries, in order — a qualified colleague
        at the exact same time, any free colleague slot the same day (earliest
        first), then the next day(s). Each placed patient gets WhatsApp + SMS
        notices queued (Django's words). Nothing is sent from here: the
        endpoint (B.2) pushes the returned items to n8n for delivery.

        Distribution (Step 2): `colleague_ids` narrows the plan to the chosen
        doctors, and `colleague_caps` limits how many EXTRA patients this plan
        may give each doctor on any one day. Both are enforced in the same pass
        the preview runs, so the plan the receptionist approves is the plan that
        was previewed.
        """
        clinic = ClinicSetting.get_settings()
        now = timezone.now()
        leave_start_dt = leave_start_dt or now
        if not leave_end_dt:
            leave_end_dt = timezone.make_aware(
                datetime.datetime.combine(leave_start_dt.date(), datetime.time(23, 59, 59))
            )

        doctor = Doctor.objects.select_for_update().get(id=doctor_id)
        allowed_ids, caps = cls._build_distribution(doctor, colleague_ids, colleague_caps)

        cls.record_leave_window(
            doctor, leave_start_dt, leave_end_dt, reason, performed_by,
            leave_type='emergency',
        )

        impacted_appts = Appointment.objects.filter(
            doctor=doctor,
            status__in=['confirmed', 'held'],
            start_datetime__gte=leave_start_dt,
            start_datetime__lte=leave_end_dt,
        ).select_related('service').order_by('start_datetime')

        colleagues = [
            colleague
            for colleague in Doctor.objects.filter(
                is_active=True, is_on_leave=False
            ).exclude(id=doctor.id)
            if allowed_ids is None or str(colleague.id) in allowed_ids
        ]
        names_by_id = {
            str(pk): name
            for pk, name in Doctor.objects.filter(is_active=True).values_list('id', 'name')
        }
        engine = AvailabilityEngine()

        # (doctor_id, date) -> how many patients this plan already gave them.
        placed_by_day = {}
        caps_hit = set()

        results = []
        same_day_count = 0
        next_day_count = 0
        unplaced_count = 0
        messages_queued_count = 0

        for appt in impacted_appts:
            old_doctor_name = appt.doctor.name
            local_start = timezone.localtime(appt.start_datetime)
            placement = None
            placed_doctor = None
            cap_note = None
            qualified_ids = {
                str(pk) for pk in DoctorService.objects.filter(
                    service=appt.service
                ).values_list('doctor_id', flat=True)
            }.intersection({str(colleague.id) for colleague in colleagues})
            qualified_count = len(qualified_ids)

            def note_cap(colleague, day):
                nonlocal cap_note
                caps_hit.add(colleague.name)
                if cap_note is None:
                    cap_note = cls._cap_note(caps, placed_by_day, colleague, day)

            # Priority 1: a qualified colleague free at the EXACT same time.
            for colleague in colleagues:
                if not cls._cap_allows(caps, placed_by_day, colleague.id, local_start.date()):
                    # Only blame the cap when the colleague could otherwise
                    # have taken this patient; qualification is reported first.
                    if str(colleague.id) in qualified_ids:
                        note_cap(colleague, local_start.date())
                    continue
                if cls._colleague_can_take_at_same_time(appt, colleague):
                    cls._apply_move(appt, colleague, appt.start_datetime, appt.end_datetime, performed_by)
                    key = (str(colleague.id), local_start.date())
                    placed_by_day[key] = placed_by_day.get(key, 0) + 1
                    placement = 'same_day_same_time'
                    placed_doctor = colleague
                    break

            # Priorities 2-3: earliest free engine slot, same day first, then
            # the following days. The engine already respects shifts,
            # qualifications, ceilings, lunch, rules, advance notice and
            # sterilization buffers; the move re-validates under lock anyway.
            if placement is None:
                for offset in range(0, max_lookahead_days + 1):
                    target_date = (local_start + datetime.timedelta(days=offset)).date()
                    slots = engine.get_available_slots_for_date(
                        service=appt.service,
                        target_date=target_date,
                        max_slots=10,
                    )
                    slots.sort(key=lambda s: s['start_datetime'])
                    for slot in slots:
                        slot_doctor_id = str(slot['doctor_id'])
                        if allowed_ids is not None and slot_doctor_id not in allowed_ids:
                            continue
                        slot_start = datetime.datetime.fromisoformat(slot['start_datetime'])
                        if offset == 0 and slot_start == appt.start_datetime:
                            continue  # the same-time case is Priority 1's job
                        slot_doctor = Doctor.objects.get(id=slot_doctor_id)
                        if not cls._cap_allows(caps, placed_by_day, slot_doctor_id, target_date):
                            note_cap(slot_doctor, target_date)
                            continue
                        slot_end = datetime.datetime.fromisoformat(slot['end_datetime'])
                        try:
                            cls._apply_move(appt, slot_doctor, slot_start, slot_end, performed_by)
                        except SlotConflictException:
                            continue
                        key = (slot_doctor_id, target_date)
                        placed_by_day[key] = placed_by_day.get(key, 0) + 1
                        placement = 'same_day_new_time' if offset == 0 else 'next_day_or_later'
                        placed_doctor = slot_doctor
                        break
                    if placement:
                        break

            messages = []
            unplaced_reason = None
            unplaced_text = None
            if placement:
                messages = cls._queue_notice_messages(appt, old_doctor_name, clinic)
                messages_queued_count += len(messages)
                if placement == 'next_day_or_later':
                    next_day_count += 1
                else:
                    same_day_count += 1
            else:
                unplaced_count += 1
                placement = None
                if not colleagues:
                    unplaced_reason = 'NO_COLLEAGUE_CHOSEN'
                    unplaced_text = 'No colleague is selected for this plan.'
                elif qualified_count == 0:
                    unplaced_reason = 'NONE_QUALIFIED'
                    chosen_names = ', '.join(colleague.name for colleague in colleagues)
                    unplaced_text = (
                        f'No chosen colleague is qualified for {appt.service.name}'
                        f' ({chosen_names}).'
                    )
                elif cap_note:
                    unplaced_reason = 'ALL_AT_CAP'
                    unplaced_text = (
                        f'{cap_note} No other chosen colleague could take this patient.'
                    )
                else:
                    unplaced_reason = 'NO_FREE_SLOT'
                    if max_lookahead_days == 0:
                        unplaced_text = (
                            f'No free slot with a chosen colleague on '
                            f'{local_start.strftime("%a, %d %b")}.'
                        )
                    else:
                        unplaced_text = (
                            f'No free slot with a chosen colleague within '
                            f'{max_lookahead_days} day{"" if max_lookahead_days == 1 else "s"}.'
                        )

            results.append({
                'appointment_id': str(appt.id),
                'appointment_code': appt.appointment_code,
                'patient_name': appt.patient_name,
                'patient_phone': appt.patient_phone,
                'outcome': 'reassigned' if placement else 'unplaced',
                'placement': placement,
                'old_doctor': old_doctor_name,
                'new_doctor': placed_doctor.name if placed_doctor else None,
                'new_start': appt.start_datetime.isoformat(),
                'new_end': appt.end_datetime.isoformat(),
                'unplaced_reason': unplaced_reason,
                'unplaced_text': unplaced_text,
                'messages': messages,
            })

        placed_by_doctor = {}
        for (placed_id, _day), count in placed_by_day.items():
            name = names_by_id.get(placed_id, 'Colleague')
            placed_by_doctor[name] = placed_by_doctor.get(name, 0) + count

        AuditLog.objects.create(
            entity_name='Doctor',
            entity_id=doctor.id,
            action='DISRUPTION_AUTO_RESOLVED',
            performed_by=performed_by,
            changes={
                'doctor_name': doctor.name,
                'impacted_count': len(results),
                'same_day_count': same_day_count,
                'next_day_count': next_day_count,
                'unplaced_count': unplaced_count,
                'messages_queued': messages_queued_count,
                'reason': reason,
                'colleague_ids': sorted(allowed_ids) if allowed_ids is not None else None,
                'colleague_caps': caps,
                'placed_by_doctor': placed_by_doctor,
            },
        )

        return {
            'doctor_id': str(doctor.id),
            'doctor_name': doctor.name,
            'is_on_leave': doctor.is_on_leave,
            'auto_resolved_count': same_day_count + next_day_count,
            'same_day_count': same_day_count,
            'next_day_count': next_day_count,
            'unplaced_count': unplaced_count,
            'messages_queued_count': messages_queued_count,
            'distribution': {
                'colleague_ids': sorted(allowed_ids) if allowed_ids is not None else None,
                'colleague_caps': caps,
                'placed_by_doctor': placed_by_doctor,
                'caps_hit': sorted(caps_hit),
            },
            'results': results,
        }

    @classmethod
    def preview_disruption(cls, doctor_id, leave_start_dt=None, leave_end_dt=None,
                           reason="Planned Leave", performed_by="preview",
                           max_lookahead_days=3, colleague_ids=None,
                           colleague_caps=None):
        """
        Dry run of auto_resolve_disruption — the honest kind.

        The REAL resolver runs inside a transaction that is always rolled back,
        so a preview can never drift from what the approve button would do.
        Same priority rules, same chosen colleagues, same caps, same conflict
        checks against already-planned moves, same per-patient report. Nothing
        is written: no leave flag, no moved appointment, no queued message, no
        audit row. The view never registers the n8n push for a preview.

        A 30-day leave is a large simulation; the caller should keep the range
        sane and treat the report as a plan, not a promise (a colleague can be
        booked by someone else between preview and approve — the approve run
        re-validates everything under its own locks and reports anyone it could
        not place).
        """
        try:
            with transaction.atomic():
                report = cls.auto_resolve_disruption(
                    doctor_id=doctor_id,
                    leave_start_dt=leave_start_dt,
                    leave_end_dt=leave_end_dt,
                    reason=reason,
                    performed_by=performed_by,
                    max_lookahead_days=max_lookahead_days,
                    colleague_ids=colleague_ids,
                    colleague_caps=colleague_caps,
                )
                raise _PreviewRollback
        except _PreviewRollback:
            pass

        report['preview'] = True
        report['nothing_saved'] = True
        return report
