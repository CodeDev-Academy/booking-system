import json
from django.utils import timezone
from django.shortcuts import get_object_or_404
from django.http import JsonResponse, HttpResponse
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

from .models import ClinicSetting, Doctor, StaffUser, Appointment, Service, AuditLog
from .permissions import IsStaffAuthenticated, IsClinicAdmin
from .serializers_clinic import (
    ClinicSettingSerializer,
    ServiceSerializer,
    DoctorDutyStatusUpdateSerializer,
    DoctorDirectorySerializer,
    StaffDirectoryUserSerializer,
    CalendarScheduleQuerySerializer,
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
        return Response(ClinicSettingSerializer(clinic).data, status=status.HTTP_200_OK)

    def patch(self, request):
        clinic = ClinicSetting.get_settings()
        serializer = ClinicSettingSerializer(clinic, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        updated_clinic = serializer.save()

        AuditLog.objects.create(
            entity_name='ClinicSetting',
            entity_id=updated_clinic.id,
            action='CLINIC_SETTINGS_UPDATED',
            performed_by=request.user.email,
            changes=serializer.data,
            ip_address=request.META.get('REMOTE_ADDR')
        )

        return Response(ClinicSettingSerializer(updated_clinic).data, status=status.HTTP_200_OK)

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
        data = ClinicSettingSerializer(clinic).data
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

            AuditLog.objects.create(
                entity_name='Doctor',
                entity_id=doctor.id,
                action='DOCTOR_DUTY_STATUS_CHANGED',
                performed_by=request.user.email,
                changes=validated,
                ip_address=request.META.get('REMOTE_ADDR')
            )

        return Response(DoctorDirectorySerializer(doctor).data, status=status.HTTP_200_OK)

    def post(self, request, id):
        return self.patch(request, id)


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

        doctors_qs = Doctor.objects.filter(is_active=True)
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
            schedule_by_doctor[str(doc.id)] = {
                'doctor_id': str(doc.id),
                'doctor_name': doc.name,
                'specialty': doc.specialty,
                'working_days': doc.working_days,
                'shift_start': doc.shift_start.strftime('%H:%M'),
                'shift_end': doc.shift_end.strftime('%H:%M'),
                'is_on_leave': doc.is_on_leave,
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

