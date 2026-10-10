"""
Clinic Settings, Staff Directory, Services & Analytics API Views.
Supports:
1. Visual Settings CRUD for non-technical managers
2. Live Staff & Doctor Roster with duty statuses
3. Analytics Summary (Attendance %, No-show %, Volume)
4. CSV Data Exports
"""

import csv
from datetime import timedelta
from rest_framework import status, viewsets
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework.decorators import action
from django.http import HttpResponse
from django.utils import timezone
from django.db.models import Count, Q
from appointments.models import (
    ClinicSetting,
    Doctor,
    Service,
    StaffUser,
    Appointment,
    BookingRequest,
    AuditLog,
)
from appointments.serializers import (
    ClinicSettingSerializer,
    DoctorSerializer,
    ServiceSerializer,
    StaffUserSerializer,
)
from appointments.services.disruption_service import DisruptionService


class ClinicSettingsView(APIView):
    """
    GET /api/v1/clinic/settings/
    PATCH /api/v1/clinic/settings/
    Visual settings configuration for clinic operating rules.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        setting = ClinicSetting.objects.first()
        if not setting:
            setting = ClinicSetting.objects.create()
        return Response(ClinicSettingSerializer(setting).data, status=status.HTTP_200_OK)

    def patch(self, request):
        setting = ClinicSetting.objects.first()
        if not setting:
            setting = ClinicSetting.objects.create()

        serializer = ClinicSettingSerializer(setting, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()

        AuditLog.objects.create(
            actor="Clinic Manager",
            action="UPDATED_CLINIC_SETTINGS",
            entity_name="ClinicSetting",
            entity_id=str(setting.id),
            changes=request.data
        )

        return Response(serializer.data, status=status.HTTP_200_OK)


class StaffDirectoryView(APIView):
    """
    GET /api/v1/clinic/staff-directory/
    Combined roster of doctors and front-desk staff with live operational status.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        doctors = Doctor.objects.filter(is_active=True).prefetch_related('doctor_services')
        staff_members = StaffUser.objects.filter(is_active=True).select_related('user')

        return Response({
            'doctors': DoctorSerializer(doctors, many=True).data,
            'staff': StaffUserSerializer(staff_members, many=True).data,
        }, status=status.HTTP_200_OK)


class DoctorViewSet(viewsets.ReadOnlyModelViewSet):
    """
    GET /api/v1/doctors/
    Roster of doctors with specialty and leave disruption tools.
    """
    queryset = Doctor.objects.filter(is_active=True)
    serializer_class = DoctorSerializer
    permission_classes = [AllowAny]

    @action(detail=True, methods=['post'], url_path='toggle-leave')
    def toggle_leave(self, request, pk=None):
        """
        POST /api/v1/doctors/{id}/toggle-leave/
        Toggles emergency sick leave and returns impact report.
        """
        doctor = self.get_object()
        doctor.is_on_leave = not doctor.is_on_leave
        doctor.save(update_fields=['is_on_leave'])

        disruption_service = DisruptionService()
        report = disruption_service.assess_doctor_leave_impact(doctor)

        AuditLog.objects.create(
            actor="Front Desk",
            action="TOGGLED_DOCTOR_LEAVE",
            entity_name="Doctor",
            entity_id=str(doctor.id),
            changes={'doctor_name': doctor.name, 'is_on_leave': doctor.is_on_leave}
        )

        return Response({
            'doctor_id': str(doctor.id),
            'doctor_name': doctor.name,
            'is_on_leave': doctor.is_on_leave,
            'disruption_report': report,
        }, status=status.HTTP_200_OK)


class ServiceViewSet(viewsets.ReadOnlyModelViewSet):
    """
    GET /api/v1/services/
    Directory of clinical procedures with pricing and durations.
    """
    queryset = Service.objects.filter(is_active=True)
    serializer_class = ServiceSerializer
    permission_classes = [AllowAny]


class AnalyticsSummaryView(APIView):
    """
    GET /api/v1/analytics/summary/
    High-level clinical KPI metrics, conversion rates, and volume statistics.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        today = timezone.now().date()
        week_ago = today - timedelta(days=7)

        total_requests = BookingRequest.objects.count()
        converted_requests = BookingRequest.objects.filter(status='converted').count()
        conversion_rate = round((converted_requests / total_requests * 100), 1) if total_requests else 0

        # Appointments breakdown
        all_appts = Appointment.objects.all()
        total_appts = all_appts.count()
        completed_count = all_appts.filter(status='completed').count()
        no_show_count = all_appts.filter(status='no_show').count()
        cancelled_count = all_appts.filter(status='cancelled').count()
        held_count = all_appts.filter(status='held').count()
        confirmed_count = all_appts.filter(status='confirmed').count()

        attendance_rate = round((completed_count / total_appts * 100), 1) if total_appts else 0
        no_show_rate = round((no_show_count / total_appts * 100), 1) if total_appts else 0

        # Today's workload
        today_appts = all_appts.filter(start_datetime__date=today)
        today_total = today_appts.count()
        today_completed = today_appts.filter(status='completed').count()
        today_arrived = today_appts.filter(status='arrived').count()

        return Response({
            'kpis': {
                'total_bookings': total_appts,
                'conversion_rate_pct': conversion_rate,
                'attendance_rate_pct': attendance_rate,
                'no_show_rate_pct': no_show_rate,
                'cancellation_count': cancelled_count,
            },
            'today': {
                'date': str(today),
                'scheduled': today_total,
                'completed': today_completed,
                'waiting_room': today_arrived,
            },
            'status_breakdown': {
                'confirmed': confirmed_count,
                'held': held_count,
                'completed': completed_count,
                'no_show': no_show_count,
                'cancelled': cancelled_count,
            }
        }, status=status.HTTP_200_OK)


class AnalyticsExportView(APIView):
    """
    GET /api/v1/analytics/export/appointments/
    GET /api/v1/analytics/export/attendance/
    Streams CSV reports directly to the browser.
    """
    permission_classes = [AllowAny]

    def get(self, request, report_type='appointments'):
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="clinic_{report_type}_report_{timezone.now():%Y%m%d}.csv"'

        writer = csv.writer(response)

        if report_type == 'attendance':
            writer.writerow(['Doctor Name', 'Specialty', 'Completed Visits', 'No Shows', 'Cancelled Visits'])
            doctors = Doctor.objects.filter(is_active=True)
            for doc in doctors:
                appts = Appointment.objects.filter(doctor=doc)
                completed = appts.filter(status='completed').count()
                no_shows = appts.filter(status='no_show').count()
                cancelled = appts.filter(status='cancelled').count()
                writer.writerow([doc.name, doc.specialty, completed, no_shows, cancelled])
        else:
            writer.writerow(['Appointment Code', 'Patient Name', 'Phone', 'Doctor', 'Service', 'Date/Time', 'Status'])
            appts = Appointment.objects.all().select_related('doctor', 'service').order_by('-start_datetime')
            for a in appts:
                writer.writerow([
                    a.appointment_code,
                    a.patient_name,
                    a.patient_phone,
                    a.doctor.name if a.doctor else 'N/A',
                    a.service.name if a.service else 'N/A',
                    a.start_datetime.strftime('%Y-%m-%d %H:%M'),
                    a.status,
                ])

        return response
