import json
import datetime
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from django.shortcuts import get_object_or_404
from django.http import JsonResponse, HttpResponse
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

from .models import ClinicSetting, Doctor, DoctorLeave, StaffUser, Appointment, Service, AuditLog
from .permissions import IsStaffAuthenticated, IsClinicAdmin
from .serializers_clinic import (
    ClinicSettingSerializer,
    MASKED_SECRET_SENTINEL,
    ServiceSerializer,
    DoctorDutyStatusUpdateSerializer,
    DoctorDirectorySerializer,
    StaffDirectoryUserSerializer,
    CalendarScheduleQuerySerializer,
    DoctorLeaveWriteSerializer,
)


class ClinicSettingsView(APIView):
    """
    GET /api/v1/clinic/settings/
        Returns the active clinic operational rules, state machine timers, and custom parameters.
    PATCH /api/v1/clinic/settings/ or POST /api/v1/clinic/settings/
        Dynamically updates operating hours, buffers, expiry windows, or custom white-label settings.
    """
    def get_permissions(self):
        if self.request.method in ('PATCH', 'POST'):
            return [IsClinicAdmin()]
        return [IsStaffAuthenticated()]

    def get(self, request):
        clinic = ClinicSetting.get_settings()
        return Response(
            ClinicSettingSerializer(clinic, context={'request': request}).data,
            status=status.HTTP_200_OK
        )

    def patch(self, request):
        clinic = ClinicSetting.get_settings()
        serializer = ClinicSettingSerializer(clinic, data=request.data, partial=True, context={'request': request})
        serializer.is_valid(raise_exception=True)
        updated_clinic = serializer.save()

        # Review Fix #4: never copy integration secrets into the audit trail.
        # For an admin, serializer.data carries the FULL custom_config (bot
        # tokens etc.) — the authoritative values already live in ClinicSetting.
        audit_changes = {k: v for k, v in serializer.data.items() if k != 'custom_config'}
        AuditLog.objects.create(
            entity_name='ClinicSetting',
            entity_id=updated_clinic.id,
            action='CLINIC_SETTINGS_UPDATED',
            performed_by=request.user.email,
            changes=audit_changes,
            ip_address=request.META.get('REMOTE_ADDR')
        )

        return Response(
            ClinicSettingSerializer(updated_clinic, context={'request': request}).data,
            status=status.HTTP_200_OK
        )

    def post(self, request):
        return self.patch(request)


class DoctorWorkloadView(APIView):
    """
    GET /api/v1/doctors/workload/ or /api/v1/clinic/doctors/workload/
    Returns aggregated consultation workload for each active doctor across 3 horizons:
    - today_count: Confirmed/held appointments starting today.
    - week_count: Appointments starting within the next 7 days.
    - two_weeks_count: Appointments starting within the next 14 days.
    """
    permission_classes = [IsStaffAuthenticated]

    def get(self, request):
        import datetime
        now = timezone.now()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        today_end = today_start + datetime.timedelta(days=1)
        week_end = today_start + datetime.timedelta(days=7)
        two_weeks_end = today_start + datetime.timedelta(days=14)

        doctors = Doctor.objects.filter(is_active=True).order_by('name')
        valid_statuses = ['held', 'confirmed', 'arrived', 'in_consultation', 'completed']
        results = []

        for doc in doctors:
            appts = Appointment.objects.filter(
                doctor=doc,
                status__in=valid_statuses,
                start_datetime__gte=today_start,
                start_datetime__lt=two_weeks_end
            ).order_by('start_datetime')

            today_c = appts.filter(start_datetime__lt=today_end).count()
            week_c = appts.filter(start_datetime__lt=week_end).count()
            two_weeks_c = appts.count()

            parts = [p for p in doc.name.strip().split() if not p.lower().startswith('dr.') and not p.lower().startswith('dr')]
            avatar = f"{parts[0][0]}{parts[-1][0]}".upper() if len(parts) >= 2 else (parts[0][:2].upper() if parts else "DR")

            from .serializers_appointment import AppointmentDetailSerializer
            results.append({
                'id': str(doc.id),
                'name': doc.name,
                'specialty': doc.specialty,
                'email': doc.email,
                'phone': doc.phone,
                'avatar': avatar,
                'today_count': today_c,
                'week_count': week_c,
                'two_weeks_count': two_weeks_c,
                'appointments': AppointmentDetailSerializer(appts, many=True).data,
            })

        return Response(results, status=status.HTTP_200_OK)


class ClinicSettingsExportView(APIView):
    """
    GET /api/v1/clinic/settings/export/
    Exports clinic configuration as a clean, portable client-config.json template.
    """
    permission_classes = [IsStaffAuthenticated]

    def get(self, request):
        clinic = ClinicSetting.get_settings()
        data = ClinicSettingSerializer(clinic, context={'request': request}).data
        # Remove primary key and timestamps from portable template
        data.pop('id', None)
        data.pop('updated_at', None)

        json_bytes = json.dumps(data, indent=2).encode('utf-8')
        response = HttpResponse(json_bytes, content_type='application/json')
        slug = clinic.clinic_name.lower().replace(' ', '_')
        response['Content-Disposition'] = f'attachment; filename="client-config-{slug}.json"'
        return response


class ClinicSettingsImportView(APIView):
    """
    POST /api/v1/clinic/settings/import/
    Uploads a client-config.json template to instantly configure a clinic instance.
    """
    permission_classes = [IsClinicAdmin]

    def post(self, request):
        payload = request.data
        if not isinstance(payload, dict):
            return Response({'error': 'Invalid JSON payload structure.'}, status=status.HTTP_400_BAD_REQUEST)

        clinic = ClinicSetting.get_settings()

        # Wave 5 / Step 5.4: an exported file carries MASKED secret values.
        # Writing the payload back verbatim used to replace the real bot
        # token (and every other secret) with the mask. Masked keys now keep
        # their CURRENT value; a genuinely new value is written as given.
        payload = dict(payload)
        incoming_cfg = payload.get('custom_config')
        if isinstance(incoming_cfg, dict):
            current_cfg = clinic.custom_config or {}
            safe_cfg = {}
            for key, value in incoming_cfg.items():
                if value == MASKED_SECRET_SENTINEL:
                    if key in current_cfg:
                        safe_cfg[key] = current_cfg[key]
                    # Nothing to preserve: the key is simply not written.
                else:
                    safe_cfg[key] = value
            payload['custom_config'] = safe_cfg

        serializer = ClinicSettingSerializer(clinic, data=payload, partial=True)
        serializer.is_valid(raise_exception=True)
        updated_clinic = serializer.save()

        AuditLog.objects.create(
            entity_name='ClinicSetting',
            entity_id=updated_clinic.id,
            action='CLINIC_SETTINGS_IMPORTED',
            performed_by=request.user.email,
            changes={'imported_keys': list(payload.keys())},
            ip_address=request.META.get('REMOTE_ADDR')
        )

        return Response({
            "detail": "Clinic configuration successfully imported.",
            "settings": ClinicSettingSerializer(updated_clinic).data
        }, status=status.HTTP_200_OK)


class StaffDirectoryView(APIView):
    """
    GET /api/v1/clinic/staff-directory/
    Returns active doctor roster and front-desk accounts with real-time duty indicators.
    """
    permission_classes = [IsStaffAuthenticated]

    def get(self, request):
        clinic = ClinicSetting.get_settings()
        doctors = Doctor.objects.all().order_by('name')
        staff = StaffUser.objects.all().order_by('-created_at')

        doctor_data = DoctorDirectorySerializer(doctors, many=True).data
        staff_data = StaffDirectoryUserSerializer(staff, many=True).data

        on_duty_count = sum(1 for d in doctor_data if d['duty_status'] == 'on_duty')
        on_leave_count = sum(1 for d in doctor_data if d['duty_status'] == 'on_sick_leave')

        return Response({
            "clinic_name": clinic.clinic_name,
            "doctors": doctor_data,
            "staff": staff_data,
            "summary": {
                "total_doctors": doctors.count(),
                "doctors_on_duty": on_duty_count,
                "doctors_on_leave": on_leave_count,
                "total_staff": staff.count(),
            }
        }, status=status.HTTP_200_OK)


class DoctorDutyStatusView(APIView):
    """
    PATCH /api/v1/clinic/doctors/{id}/duty-status/ or POST /api/v1/clinic/doctors/{id}/duty-status/
    1-Click toggle for doctor duty status (is_on_leave, is_active, duty_mode, status).
    """
    permission_classes = [IsStaffAuthenticated]

    def patch(self, request, id):
        doctor = None
        try:
            doctor = Doctor.objects.get(id=id)
        except (Doctor.DoesNotExist, ValueError):
            doctor = Doctor.objects.filter(email__iexact=id).first()
            if not doctor:
                # Check for mock doc IDs like 'doc-bello', 'doc-okafor'
                clean_id = str(id).lower()
                if 'bello' in clean_id:
                    doctor = Doctor.objects.filter(name__icontains='Bello').first()
                elif 'okafor' in clean_id:
                    doctor = Doctor.objects.filter(name__icontains='Okafor').first()
                else:
                    doctor = Doctor.objects.filter(name__icontains=id).first()

        if not doctor:
            return Response({'error': f'Doctor {id} not found.'}, status=status.HTTP_404_NOT_FOUND)

        serializer = DoctorDutyStatusUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data

        update_fields = []
        if 'is_on_leave' in validated:
            doctor.is_on_leave = validated['is_on_leave']
            update_fields.append('is_on_leave')
        if 'is_active' in validated:
            doctor.is_active = validated['is_active']
            update_fields.append('is_active')

        if update_fields:
            doctor.save(update_fields=update_fields)
            self._sync_leave_rows(doctor, request.user.email)

            AuditLog.objects.create(
                entity_name='Doctor',
                entity_id=doctor.id,
                action='DOCTOR_DUTY_STATUS_CHANGED',
                performed_by=request.user.email,
                changes=validated,
                ip_address=request.META.get('REMOTE_ADDR')
            )

        return Response(DoctorDirectorySerializer(doctor).data, status=status.HTTP_200_OK)

    @staticmethod
    def _sync_leave_rows(doctor, performed_by):
        """
        Keep the 1-click switch and the dated leave rows in step: "off duty"
        opens an open-ended leave row from today, "on duty" closes it. Dated
        plans are left alone — they are edited in the leave planner, not here.

        Wave 5 / Step 5.1: "on duty" removes ONLY the row this switch
        created (its exact reason marker). It used to delete every row with
        `end_date IS NULL`, which silently cut a legitimate "leave until
        further notice" short.
        """
        today = timezone.localdate()
        marker = 'Marked off duty from the roster'
        if doctor.is_on_leave:
            has_today = any(p.covers(today) for p in doctor.leaves.all())
            if not has_today:
                DoctorLeave.objects.create(
                    doctor=doctor, start_date=today, end_date=None,
                    leave_type='sick', reason=marker,
                    created_by=performed_by,
                )
        else:
            doctor.leaves.filter(end_date__isnull=True, reason=marker).delete()
        doctor.sync_leave_flag()

    def post(self, request, id):
        return self.patch(request, id)


class DoctorEndLeaveView(APIView):
    """
    POST /api/v1/clinic/doctors/{id}/end-leave/

    Leave lifecycle / Step 1 — "the doctor is back today", and only today.

    The duty switch deliberately removes only the open-ended row it created, so
    after an emergency plan the dated leave row survived and the doctor stayed
    unbookable while the screen said "on duty" (verified: is_on_leave stayed
    True). This endpoint removes TODAY from every leave that covers it, never
    more:

      - a leave that started earlier keeps its past days (end moves to yesterday);
      - a leave that starts today keeps its remaining future days (start moves to
        tomorrow);
      - a one-day leave for today simply goes.

    Patients already moved to a colleague STAY there — the move was
    communicated, and putting them back on a leave day would be worse. Ending
    the leave only makes the doctor bookable again.
    """
    permission_classes = [IsStaffAuthenticated]

    def post(self, request, id):
        try:
            doctor = Doctor.objects.get(id=id)
        except (Doctor.DoesNotExist, ValueError):
            return Response(
                {'error': 'DOCTOR_NOT_FOUND', 'detail': 'No doctor matches this id.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        today = timezone.localdate()
        yesterday = today - datetime.timedelta(days=1)
        tomorrow = today + datetime.timedelta(days=1)
        ended = []

        with transaction.atomic():
            for leave in list(doctor.leaves.all()):
                if not leave.covers(today):
                    continue

                leave_id = leave.id
                before = {
                    'start_date': leave.start_date.isoformat(),
                    'end_date': leave.end_date.isoformat() if leave.end_date else None,
                    'leave_type': leave.leave_type,
                    'reason': leave.reason,
                }

                if leave.start_date == today:
                    if leave.end_date is None or leave.end_date == today:
                        leave.delete()
                        action = 'deleted'
                    else:
                        leave.start_date = tomorrow
                        leave.save(update_fields=['start_date'])
                        action = 'trimmed_start'
                else:
                    leave.end_date = yesterday
                    leave.save(update_fields=['end_date'])
                    action = 'trimmed_end'

                AuditLog.objects.create(
                    entity_name='DoctorLeave',
                    entity_id=leave_id,
                    action='DOCTOR_LEAVE_ENDED',
                    performed_by=request.user.email,
                    changes={**before, 'action': action, 'ended_day': today.isoformat()},
                    ip_address=request.META.get('REMOTE_ADDR'),
                )
                ended.append({
                    'id': str(leave_id),
                    'action': action,
                    'leave_type': before['leave_type'],
                    'previous_start_date': before['start_date'],
                    'previous_end_date': before['end_date'],
                })

            # Re-derive the flag from what is actually left: a finished leave
            # stops marking the doctor off duty, and the legacy open-ended
            # switch (no rows at all) is cleared here too.
            should = any(period.covers(today) for period in doctor.leaves.all())
            if doctor.is_on_leave != should:
                doctor.is_on_leave = should
                doctor.save(update_fields=['is_on_leave'])

        message = (
            f'{doctor.name} is back on duty today.'
            if ended
            else f'{doctor.name} is already on duty today.'
        )

        return Response({
            'doctor': DoctorDirectorySerializer(doctor).data,
            'ended': ended,
            'message': message,
        }, status=status.HTTP_200_OK)


class DoctorLeaveListCreateView(APIView):
    """
    GET  /api/v1/clinic/doctors/{id}/leaves/   — the periods, and which covers today
    POST /api/v1/clinic/doctors/{id}/leaves/   — plan a leave window

    Leave lifecycle / Step 2. A plain leave record is only for windows with no
    bookings: if patients are already booked inside it, the answer is the
    disruption plan (which moves them, tells them, and can be undone). Saving
    the leave anyway would leave those patients stranded with nobody told.
    """
    permission_classes = [IsStaffAuthenticated]

    @staticmethod
    def _doctor(id):
        try:
            return Doctor.objects.get(id=id)
        except (Doctor.DoesNotExist, ValueError):
            return None

    @staticmethod
    def _leave_dict(leave, today):
        return {
            'id': str(leave.id),
            'start_date': leave.start_date.isoformat(),
            'end_date': leave.end_date.isoformat() if leave.end_date else None,
            'leave_type': leave.leave_type,
            'reason': leave.reason,
            'covers_today': leave.covers(today),
        }

    @staticmethod
    def _overlap(doctor, start, end, exclude_id=None):
        horizon = end or datetime.date.max
        qs = doctor.leaves.filter(start_date__lte=horizon).filter(
            Q(end_date__isnull=True) | Q(end_date__gte=start)
        )
        if exclude_id:
            qs = qs.exclude(id=exclude_id)
        return qs.order_by('start_date').first()

    @staticmethod
    def _bookings_inside(doctor, start, end):
        qs = Appointment.objects.filter(
            doctor=doctor,
            status__in=['confirmed', 'held'],
            start_datetime__date__gte=start,
        )
        if end is not None:
            qs = qs.filter(start_datetime__date__lte=end)
        return qs

    def get(self, request, id):
        doctor = self._doctor(id)
        if not doctor:
            return Response(
                {'error': 'DOCTOR_NOT_FOUND', 'detail': 'No doctor matches this id.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        today = timezone.localdate()
        leaves = doctor.leaves.all().order_by('start_date')
        return Response({
            'doctor': {
                'id': str(doctor.id),
                'name': doctor.name,
                'is_on_leave': doctor.is_on_leave_on(today),
            },
            'leaves': [self._leave_dict(leave, today) for leave in leaves],
        }, status=status.HTTP_200_OK)

    def post(self, request, id):
        doctor = self._doctor(id)
        if not doctor:
            return Response(
                {'error': 'DOCTOR_NOT_FOUND', 'detail': 'No doctor matches this id.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = DoctorLeaveWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        start = data['start_date']
        end = data.get('end_date')

        existing = self._overlap(doctor, start, end)
        if existing:
            existing_end = (
                existing.end_date.strftime('%d %b')
                if existing.end_date else 'further notice'
            )
            return Response({
                'error': 'LEAVE_OVERLAPS_EXISTING',
                'detail': (
                    f"{doctor.name} already has {existing.leave_type} leave from "
                    f"{existing.start_date.strftime('%d %b')} to {existing_end}. "
                    'Edit that period instead.'
                ),
                'existing': self._leave_dict(existing, timezone.localdate()),
            }, status=status.HTTP_409_CONFLICT)

        booked = self._bookings_inside(doctor, start, end).count()
        if booked:
            return Response({
                'error': 'LEAVE_OVERLAPS_BOOKINGS',
                'detail': (
                    f'{booked} patient(s) are already booked in this window. '
                    'Use the leave plan (unscheduled leave) so they are moved and '
                    'told — a plain leave would leave them stranded.'
                ),
                'appointment_count': booked,
            }, status=status.HTTP_409_CONFLICT)

        leave = DoctorLeave.objects.create(
            doctor=doctor,
            start_date=start,
            end_date=end,
            leave_type=data['leave_type'],
            reason=data.get('reason', ''),
            created_by=request.user.email,
        )
        doctor.sync_leave_flag()

        AuditLog.objects.create(
            entity_name='DoctorLeave',
            entity_id=leave.id,
            action='DOCTOR_LEAVE_PLANNED',
            performed_by=request.user.email,
            changes={
                'start_date': start.isoformat(),
                'end_date': end.isoformat() if end else None,
                'leave_type': leave.leave_type,
            },
            ip_address=request.META.get('REMOTE_ADDR'),
        )

        return Response(
            self._leave_dict(leave, timezone.localdate()),
            status=status.HTTP_201_CREATED,
        )


class DoctorLeaveDetailView(APIView):
    """
    PATCH  /api/v1/clinic/doctors/{id}/leaves/{leave_id}/ — edit or shorten
    DELETE /api/v1/clinic/doctors/{id}/leaves/{leave_id}/ — remove entirely

    Editing cannot extend a leave over a patient who is already booked — that
    is the same silent-stranding mistake as creating one there.
    """
    permission_classes = [IsStaffAuthenticated]

    @staticmethod
    def _leave(id, leave_id):
        try:
            return DoctorLeave.objects.select_related('doctor').get(
                id=leave_id, doctor_id=id,
            )
        except (DoctorLeave.DoesNotExist, ValueError, TypeError):
            return None

    def patch(self, request, id, leave_id):
        leave = self._leave(id, leave_id)
        if not leave:
            return Response(
                {'error': 'LEAVE_NOT_FOUND', 'detail': 'No leave period matches this id.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = DoctorLeaveWriteSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        start = data.get('start_date', leave.start_date)
        end = data['end_date'] if 'end_date' in data else leave.end_date
        if end is not None and end < start:
            return Response(
                {'error': 'INVALID_WINDOW', 'detail': 'The last day cannot be before the first day.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        existing = DoctorLeaveListCreateView._overlap(
            leave.doctor, start, end, exclude_id=leave.id,
        )
        if existing:
            return Response({
                'error': 'LEAVE_OVERLAPS_EXISTING',
                'detail': 'This window overlaps another leave period.',
                'existing': DoctorLeaveListCreateView._leave_dict(
                    existing, timezone.localdate()
                ),
            }, status=status.HTTP_409_CONFLICT)

        booked = DoctorLeaveListCreateView._bookings_inside(
            leave.doctor, start, end,
        ).count()
        if booked:
            return Response({
                'error': 'LEAVE_OVERLAPS_BOOKINGS',
                'detail': (
                    f'{booked} patient(s) are booked in this window. Move them with '
                    'the leave plan instead of extending the leave over them.'
                ),
                'appointment_count': booked,
            }, status=status.HTTP_409_CONFLICT)

        leave.start_date = start
        leave.end_date = end
        if 'leave_type' in data:
            leave.leave_type = data['leave_type']
        if 'reason' in data:
            leave.reason = data['reason']
        leave.save(update_fields=['start_date', 'end_date', 'leave_type', 'reason'])
        leave.doctor.sync_leave_flag()

        AuditLog.objects.create(
            entity_name='DoctorLeave',
            entity_id=leave.id,
            action='DOCTOR_LEAVE_UPDATED',
            performed_by=request.user.email,
            changes={
                'start_date': start.isoformat(),
                'end_date': end.isoformat() if end else None,
                'leave_type': leave.leave_type,
            },
            ip_address=request.META.get('REMOTE_ADDR'),
        )

        return Response(
            DoctorLeaveListCreateView._leave_dict(leave, timezone.localdate()),
            status=status.HTTP_200_OK,
        )

    def delete(self, request, id, leave_id):
        leave = self._leave(id, leave_id)
        if not leave:
            return Response(
                {'error': 'LEAVE_NOT_FOUND', 'detail': 'No leave period matches this id.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        doctor = leave.doctor
        snapshot = {
            'start_date': leave.start_date.isoformat(),
            'end_date': leave.end_date.isoformat() if leave.end_date else None,
            'leave_type': leave.leave_type,
        }
        entity_id = leave.id
        leave.delete()
        # With no periods left, the legacy open-ended flag must not keep the
        # doctor off duty — sync_leave_flag deliberately preserves it, because
        # that flag IS the whole record when there are no rows.
        if doctor.leaves.exists():
            doctor.sync_leave_flag()
        elif doctor.is_on_leave:
            doctor.is_on_leave = False
            doctor.save(update_fields=['is_on_leave'])

        AuditLog.objects.create(
            entity_name='DoctorLeave',
            entity_id=entity_id,
            action='DOCTOR_LEAVE_DELETED',
            performed_by=request.user.email,
            changes=snapshot,
            ip_address=request.META.get('REMOTE_ADDR'),
        )

        return Response({
            'deleted': str(entity_id),
            'doctor': {
                'id': str(doctor.id),
                'name': doctor.name,
                'is_on_leave': doctor.is_on_leave_on(timezone.localdate()),
            },
        }, status=status.HTTP_200_OK)


class CalendarScheduleView(APIView):
    """
    GET /api/v1/calendar/schedule/
    Aggregates doctor shifts, confirmed appointments, active temporary holds,
    and sterilization buffers into a unified feed for the master calendar grid.
    """
    permission_classes = [IsStaffAuthenticated]

    def get(self, request):
        serializer = CalendarScheduleQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)

        start_date = serializer.validated_data['resolved_start']
        end_date = serializer.validated_data['resolved_end']
        doctor_id = serializer.validated_data.get('doctor_id')
        clinic = ClinicSetting.get_settings()

        doctors_qs = Doctor.objects.filter(is_active=True).prefetch_related('leaves')
        if doctor_id:
            doctors_qs = doctors_qs.filter(id=doctor_id)

        appts_qs = Appointment.objects.filter(
            start_datetime__date__gte=start_date,
            start_datetime__date__lte=end_date,
            status__in=['held', 'confirmed', 'arrived', 'in_consultation', 'completed']
        ).select_related('doctor', 'service').order_by('start_datetime')

        if doctor_id:
            appts_qs = appts_qs.filter(doctor_id=doctor_id)

        # Build doctor schedule blocks
        schedule_by_doctor = {}
        for doc in doctors_qs:
            leave_periods = [
                {
                    'id': str(period.id),
                    'start_date': period.start_date.isoformat(),
                    'end_date': period.end_date.isoformat() if period.end_date else None,
                    'leave_type': period.leave_type,
                    'reason': period.reason,
                }
                for period in doc.leaves.all()
                if period.start_date <= end_date
                and (period.end_date is None or period.end_date >= start_date)
            ]
            schedule_by_doctor[str(doc.id)] = {
                'doctor_id': str(doc.id),
                'doctor_name': doc.name,
                'specialty': doc.specialty,
                'working_days': doc.working_days,
                'shift_start': doc.shift_start.strftime('%H:%M'),
                'shift_end': doc.shift_end.strftime('%H:%M'),
                'is_on_leave': doc.is_on_leave_on(start_date),
                'leave_periods': leave_periods,
                'appointments': [],
            }

        for appt in appts_qs:
            doc_id_str = str(appt.doctor.id)
            if doc_id_str in schedule_by_doctor:
                buffer_m = appt.service.buffer_minutes
                schedule_by_doctor[doc_id_str]['appointments'].append({
                    'id': str(appt.id),
                    'appointment_code': appt.appointment_code,
                    'patient_name': appt.patient_name,
                    'service_name': appt.service.name,
                    'start_datetime': appt.start_datetime.isoformat(),
                    'end_datetime': appt.end_datetime.isoformat(),
                    'buffer_minutes': buffer_m,
                    'status': appt.status,
                    'hold_expires_at': appt.hold_expires_at.isoformat() if appt.hold_expires_at else None,
                })

        return Response({
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            "appointments_count": appts_qs.count(),
            # The grid must draw the clinic's REAL rest window, not a guess.
            # The booking engine already refuses slots inside this break
            # (services/availability.py), so the screen has to show the same
            # hours or staff will book over it.
            "clinic": {
                "lunch_break_start": clinic.lunch_break_start.strftime('%H:%M'),
                "lunch_break_end": clinic.lunch_break_end.strftime('%H:%M'),
                "open_time": clinic.open_time.strftime('%H:%M'),
                "close_time": clinic.close_time.strftime('%H:%M'),
                "working_days": clinic.working_days,
            },
            "doctors": list(schedule_by_doctor.values()),
        }, status=status.HTTP_200_OK)


class ClinicServiceListCreateView(APIView):
    """
    GET /api/v1/clinic/services/
        Lists all clinical services and treatments.
    POST /api/v1/clinic/services/
        Creates a new clinical service (Admin only).
    """
    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsClinicAdmin()]
        return [IsStaffAuthenticated()]

    def get(self, request):
        qs = Service.objects.all().order_by('category', 'name')
        is_active = request.query_params.get('is_active')
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() in ('true', '1'))
        return Response(ServiceSerializer(qs, many=True).data, status=status.HTTP_200_OK)

    def post(self, request):
        serializer = ServiceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        service = serializer.save()

        AuditLog.objects.create(
            entity_name='Service',
            entity_id=service.id,
            action='SERVICE_CREATED',
            performed_by=request.user.email,
            changes=serializer.data,
            ip_address=request.META.get('REMOTE_ADDR')
        )
        return Response(ServiceSerializer(service).data, status=status.HTTP_201_CREATED)


class ClinicServiceDetailView(APIView):
    """
    PATCH /api/v1/clinic/services/{id}/
        Updates service details (price, duration, buffer, active status). Admin only.
    DELETE /api/v1/clinic/services/{id}/
        Soft-deactivates service. Admin only.
    """
    permission_classes = [IsClinicAdmin]

    def patch(self, request, id):
        service = None
        try:
            service = Service.objects.get(id=id)
        except (Service.DoesNotExist, ValueError):
            service = Service.objects.filter(name__iexact=id).first()

        if not service:
            return Response({'error': 'Service not found.'}, status=status.HTTP_404_NOT_FOUND)

        serializer = ServiceSerializer(service, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        updated_service = serializer.save()

        AuditLog.objects.create(
            entity_name='Service',
            entity_id=updated_service.id,
            action='SERVICE_UPDATED',
            performed_by=request.user.email,
            changes=serializer.data,
            ip_address=request.META.get('REMOTE_ADDR')
        )
        return Response(ServiceSerializer(updated_service).data, status=status.HTTP_200_OK)

    def delete(self, request, id):
        service = None
        try:
            service = Service.objects.get(id=id)
        except (Service.DoesNotExist, ValueError):
            service = Service.objects.filter(name__iexact=id).first()

        if not service:
            return Response({'error': 'Service not found.'}, status=status.HTTP_404_NOT_FOUND)

        if request.query_params.get('permanent') == 'true':
            # Wave 5 / Step 5.2: appointments PROTECT their service. The
            # unguarded delete raised ProtectedError and the client saw a raw
            # 500; now it is a named conflict with the honest alternative.
            referenced = service.appointments.count()
            if referenced:
                return Response(
                    {
                        'error': 'SERVICE_IN_USE',
                        'detail': (
                            f"{referenced} appointment(s) use this service, so it "
                            'cannot be deleted. Deactivate it instead — existing '
                            'visits keep their history.'
                        ),
                        'appointment_count': referenced,
                    },
                    status=status.HTTP_409_CONFLICT,
                )
            service.delete()
            return Response({'detail': f'Service {service.name} permanently removed.'}, status=status.HTTP_200_OK)

        service.is_active = False
        service.save(update_fields=['is_active'])

        AuditLog.objects.create(
            entity_name='Service',
            entity_id=service.id,
            action='SERVICE_DEACTIVATED',
            performed_by=request.user.email,
            changes={'is_active': False},
            ip_address=request.META.get('REMOTE_ADDR')
        )
        return Response({'detail': f'Service {service.name} deactivated successfully.'}, status=status.HTTP_200_OK)

