from django.urls import path
from django.http import JsonResponse
from .views_auth import (
    StaffLoginView,
    StaffLogoutView,
    StaffMeView,
    PinUnlockView,
    AdminStaffListCreateView,
    AdminStaffDetailView,
    AdminStaffResetPasswordView,
    AdminStaffResetPinView,
    AdminStaffToggleActiveView,
    AdminStaffDeactivateView,
)
from .views_booking import (
    BookingRequestListCreateView,
    CheckSlotsView,
    DispatchOffersView,
    AskInfoView,
)
from .views_appointment import (
    SlotHoldView,
    AppointmentStatusUpdateView,
    FollowUpTaskCreateView,
    ReassignLeaveView,
    RescheduleAppointmentView,
    AppointmentActionView,
    WalkInRegistrationView,
    TodayAppointmentsView,
    AppointmentListView,
    ExportAppointmentsCSVView,
    ExportAttendanceCSVView,
    UpcomingRemindersView,
)
from .views_clinic import (
    ClinicSettingsView,
    ClinicSettingsExportView,
    ClinicSettingsImportView,
    StaffDirectoryView,
    DoctorDutyStatusView,
    CalendarScheduleView,
    ClinicServiceListCreateView,
    ClinicServiceDetailView,
    DoctorWorkloadView,
)
from .views_realtime import (
    EventStreamView,
    PresenceBroadcastView,
    InboundWebhookView,
)
from .views_analytics import (
    AnalyticsSummaryView,
)


from django.db import connection
from django.conf import settings

def health_check(request):
    db_ok = True
    db_error = None
    try:
        connection.ensure_connection()
    except Exception as e:
        db_ok = False
        db_error = str(e)

    return JsonResponse({
        "status": "healthy" if db_ok else "degraded",
        "service": "Clinic Booking API",
        "version": "1.0.0",
        "neon": {
            "database": {
                "engine": settings.DATABASES['default']['ENGINE'],
                "host": settings.DATABASES['default'].get('HOST', 'localhost'),
                "connected": db_ok,
                "error": db_error,
            },
            "auth": {
                "base_url": getattr(settings, 'NEON_AUTH_BASE_URL', ''),
                "jwks_url": getattr(settings, 'NEON_AUTH_JWKS_URL', ''),
                "configured": bool(getattr(settings, 'NEON_AUTH_BASE_URL', '')),
            }
        }
    })


urlpatterns = [
    path('health/', health_check, name='api-health'),

    # Task 3.1: Staff Authentication & Governance Endpoints
    path('auth/login/', StaffLoginView.as_view(), name='auth-login'),
    path('auth/logout/', StaffLogoutView.as_view(), name='auth-logout'),
    path('auth/me/', StaffMeView.as_view(), name='auth-me'),
    path('auth/pin-unlock/', PinUnlockView.as_view(), name='auth-pin-unlock'),
    path('auth/verify-pin/', PinUnlockView.as_view(), name='auth-verify-pin'),

    # Admin Staff Roster & Killswitch Endpoints
    path('staff/', AdminStaffListCreateView.as_view(), name='staff-list-create'),
    path('staff/<str:staff_id>/', AdminStaffDetailView.as_view(), name='staff-detail'),
    path('staff/<str:staff_id>/reset-password/', AdminStaffResetPasswordView.as_view(), name='staff-reset-password'),
    path('staff/<str:staff_id>/reset-pin/', AdminStaffResetPinView.as_view(), name='staff-reset-pin'),
    path('staff/<str:staff_id>/toggle-active/', AdminStaffToggleActiveView.as_view(), name='staff-toggle-active'),
    path('admin/staff/', AdminStaffListCreateView.as_view(), name='admin-staff-list-create'),
    path('admin/staff/<str:staff_id>/', AdminStaffDetailView.as_view(), name='admin-staff-detail'),
    path('admin/staff/<str:staff_id>/reset-password/', AdminStaffResetPasswordView.as_view(), name='admin-staff-reset-password'),
    path('admin/staff/<str:staff_id>/reset-pin/', AdminStaffResetPinView.as_view(), name='admin-staff-reset-pin'),
    path('admin/staff/<str:staff_id>/toggle-active/', AdminStaffToggleActiveView.as_view(), name='admin-staff-toggle-active'),
    path('admin/staff/<str:staff_id>/deactivate/', AdminStaffDeactivateView.as_view(), name='admin-staff-deactivate'),

    # Task 3.2: Inbound Booking Requests & Triage Queue Endpoints
    path('booking-requests/', BookingRequestListCreateView.as_view(), name='booking-requests-list-create'),
    path('booking-requests/<str:id>/check-slots/', CheckSlotsView.as_view(), name='booking-check-slots'),
    path('booking-requests/<str:id>/dispatch-offers/', DispatchOffersView.as_view(), name='booking-dispatch-offers'),
    path('booking-requests/<str:id>/ask-info/', AskInfoView.as_view(), name='booking-ask-info'),
    path('requests/', BookingRequestListCreateView.as_view(), name='requests-list-create'),
    path('requests/<str:id>/check-slots/', CheckSlotsView.as_view(), name='requests-check-slots'),
    path('requests/<str:id>/dispatch/', DispatchOffersView.as_view(), name='requests-dispatch'),
    path('requests/<str:id>/dispatch-offers/', DispatchOffersView.as_view(), name='requests-dispatch-offers'),
    path('availability/slots/', CheckSlotsView.as_view(), name='availability-slots'),

    # Task 3.3: Appointments, Live Visits & Follow-Up Endpoints
    path('slots/hold/', SlotHoldView.as_view(), name='slots-hold'),
    path('appointments/', AppointmentListView.as_view(), name='appointments-list'),
    path('appointments/hold/', SlotHoldView.as_view(), name='appointments-hold'),
    path('appointments/walk-in/', WalkInRegistrationView.as_view(), name='appointments-walk-in'),
    path('appointments/today/', TodayAppointmentsView.as_view(), name='appointments-today'),
    path('appointments/upcoming-reminders/', UpcomingRemindersView.as_view(), name='appointments-upcoming-reminders'),
    path('appointments/<str:id>/status/', AppointmentStatusUpdateView.as_view(), name='appointment-status-update'),
    path('appointments/<str:id>/reschedule/', RescheduleAppointmentView.as_view(), name='appointment-reschedule'),
    path('appointments/<str:id>/follow-up/', FollowUpTaskCreateView.as_view(), name='appointment-follow-up'),
    path('appointments/<str:id>/reassign-leave/', ReassignLeaveView.as_view(), name='appointment-reassign-leave'),
    path('appointments/<str:id>/<str:action>/', AppointmentActionView.as_view(), name='appointment-action'),

    # Admin CSV Exports
    path('admin/export/appointments/', ExportAppointmentsCSVView.as_view(), name='admin-export-appointments'),
    path('admin/export/attendance/', ExportAttendanceCSVView.as_view(), name='admin-export-attendance'),

    # Task 3.4: Clinic Settings, Staff Directory & Master Calendar Feed
    path('clinic/settings/', ClinicSettingsView.as_view(), name='clinic-settings'),
    path('clinic/settings/export/', ClinicSettingsExportView.as_view(), name='clinic-settings-export'),
    path('clinic/settings/import/', ClinicSettingsImportView.as_view(), name='clinic-settings-import'),
    path('clinic/services/', ClinicServiceListCreateView.as_view(), name='clinic-services-list-create'),
    path('clinic/services/<str:id>/', ClinicServiceDetailView.as_view(), name='clinic-services-detail'),
    path('clinic/staff-directory/', StaffDirectoryView.as_view(), name='clinic-staff-directory'),
    path('clinic/doctors/<str:id>/duty-status/', DoctorDutyStatusView.as_view(), name='clinic-doctor-duty-status'),
    path('doctors/workload/', DoctorWorkloadView.as_view(), name='doctors-workload'),
    path('clinic/doctors/workload/', DoctorWorkloadView.as_view(), name='clinic-doctors-workload'),
    path('calendar/schedule/', CalendarScheduleView.as_view(), name='calendar-schedule'),
    path('services/', ClinicServiceListCreateView.as_view(), name='services-list-create'),
    path('services/<str:id>/', ClinicServiceDetailView.as_view(), name='services-detail'),
    path('settings/', ClinicSettingsView.as_view(), name='settings'),

    # Task 3.5: Real-Time SSE Stream, Presence Broadcasting & Webhook Inbound
    path('realtime/stream/', EventStreamView.as_view(), name='realtime-stream'),
    path('realtime/events/', EventStreamView.as_view(), name='realtime-events'),
    path('realtime/presence/', PresenceBroadcastView.as_view(), name='realtime-presence'),
    path('webhooks/messaging/inbound/', InboundWebhookView.as_view(), name='webhook-messaging-inbound'),
    path('webhooks/telegram/inbound/', InboundWebhookView.as_view(), name='webhook-telegram-inbound'),
    path('webhooks/telegram/', InboundWebhookView.as_view(), name='webhook-telegram'),
    path('webhooks/whatsapp/inbound/', InboundWebhookView.as_view(), name='webhook-whatsapp-inbound'),
    path('telegram/webhook/', InboundWebhookView.as_view(), name='telegram-webhook-alias'),

    # Task 3.6: Analytics KPI Summary API & CSV Exports
    path('analytics/summary/', AnalyticsSummaryView.as_view(), name='analytics-summary'),
    path('analytics/export/appointments/', ExportAppointmentsCSVView.as_view(), name='analytics-export-appointments'),
    path('analytics/export/attendance/', ExportAttendanceCSVView.as_view(), name='analytics-export-attendance'),
]


