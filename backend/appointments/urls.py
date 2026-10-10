"""
URL patterns for appointments and clinic booking API (/api/v1/).
Strictly implements API_REFERENCE.md and master architecture specifications.
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from appointments.views import (
    healthcheck,
    LoginView,
    PinUnlockView,
    StaffAdminViewSet,
    BookingRequestViewSet,
    AppointmentViewSet,
    ClinicSettingsView,
    StaffDirectoryView,
    DoctorViewSet,
    ServiceViewSet,
    AnalyticsSummaryView,
    AnalyticsExportView,
    RealtimeEventsView,
)

app_name = 'appointments'

router = DefaultRouter()
router.register(r'booking-requests', BookingRequestViewSet, basename='booking-request')
router.register(r'appointments', AppointmentViewSet, basename='appointment')
router.register(r'doctors', DoctorViewSet, basename='doctor')
router.register(r'services', ServiceViewSet, basename='service')
router.register(r'admin/staff', StaffAdminViewSet, basename='admin-staff')

urlpatterns = [
    # System Health
    path('health/', healthcheck, name='api-health'),

    # Staff Auth & Governance
    path('auth/login/', LoginView.as_view(), name='auth-login'),
    path('auth/pin-unlock/', PinUnlockView.as_view(), name='auth-pin-unlock'),

    # Slot Hold alias conforming to API_REFERENCE.md (/api/v1/slots/hold/)
    path('slots/hold/', AppointmentViewSet.as_view({'post': 'hold_slot'}), name='slots-hold'),

    # Clinic Settings & Staff Directory
    path('clinic/settings/', ClinicSettingsView.as_view(), name='clinic-settings'),
    path('clinic/staff-directory/', StaffDirectoryView.as_view(), name='clinic-staff-directory'),

    # Real-Time SSE Stream
    path('realtime/events/', RealtimeEventsView.as_view(), name='realtime-events'),

    # Analytics & CSV Exports
    path('analytics/summary/', AnalyticsSummaryView.as_view(), name='analytics-summary'),
    path('analytics/export/<str:report_type>/', AnalyticsExportView.as_view(), name='analytics-export'),

    # Router endpoints
    path('', include(router.urls)),
]
