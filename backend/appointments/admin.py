"""
Django Admin registration for clinic scheduling models.
"""

from django.contrib import admin
from appointments.models import (
    ClinicSetting,
    StaffUser,
    Doctor,
    Service,
    DoctorService,
    AvailabilityRule,
    BookingRequest,
    SlotOffer,
    Appointment,
    FollowUpTask,
    AuditLog,
)


@admin.register(ClinicSetting)
class ClinicSettingAdmin(admin.ModelAdmin):
    list_display = ('clinic_name', 'phone', 'open_time', 'close_time', 'offer_expiry_minutes', 'updated_at')


@admin.register(StaffUser)
class StaffUserAdmin(admin.ModelAdmin):
    list_display = ('user', 'get_full_name', 'get_email', 'role', 'is_active', 'created_at')
    list_filter = ('role', 'is_active')
    search_fields = ('user__username', 'user__first_name', 'user__last_name', 'user__email')

    @admin.display(description='Full Name')
    def get_full_name(self, obj):
        return obj.user.get_full_name() or obj.user.username

    @admin.display(description='Email')
    def get_email(self, obj):
        return obj.user.email


class DoctorServiceInline(admin.TabularInline):
    model = DoctorService
    extra = 1


@admin.register(Doctor)
class DoctorAdmin(admin.ModelAdmin):
    list_display = ('name', 'specialty', 'shift_start', 'shift_end', 'is_active', 'is_on_leave')
    list_filter = ('specialty', 'is_active', 'is_on_leave')
    search_fields = ('name', 'specialty', 'email')
    inlines = [DoctorServiceInline]


@admin.register(Service)
class ServiceAdmin(admin.ModelAdmin):
    list_display = ('name', 'category', 'duration_minutes', 'buffer_minutes', 'price', 'deposit_required', 'is_active')
    list_filter = ('category', 'is_active', 'deposit_required')
    search_fields = ('name', 'category')


@admin.register(AvailabilityRule)
class AvailabilityRuleAdmin(admin.ModelAdmin):
    list_display = ('rule_type', 'doctor', 'start_datetime', 'end_datetime', 'reason')
    list_filter = ('rule_type', 'doctor')


class SlotOfferInline(admin.TabularInline):
    model = SlotOffer
    extra = 0
    readonly_fields = ('start_datetime', 'end_datetime', 'offered_at', 'expires_at', 'is_selected')


@admin.register(BookingRequest)
class BookingRequestAdmin(admin.ModelAdmin):
    list_display = ('request_code', 'patient_name', 'patient_phone', 'service', 'status', 'created_at')
    list_filter = ('status', 'channel', 'service')
    search_fields = ('request_code', 'patient_name', 'patient_phone')
    inlines = [SlotOfferInline]


@admin.register(Appointment)
class AppointmentAdmin(admin.ModelAdmin):
    list_display = ('appointment_code', 'patient_name', 'doctor', 'service', 'start_datetime', 'status')
    list_filter = ('status', 'doctor', 'service')
    search_fields = ('appointment_code', 'patient_name', 'patient_phone')


@admin.register(FollowUpTask)
class FollowUpTaskAdmin(admin.ModelAdmin):
    list_display = ('appointment', 'doctor', 'follow_up_date', 'reminder_sent', 'is_completed')
    list_filter = ('reminder_sent', 'is_completed', 'doctor')


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ('created_at', 'actor', 'action', 'entity_name', 'entity_id')
    list_filter = ('action', 'entity_name')
    search_fields = ('actor', 'action', 'entity_name', 'entity_id')
    readonly_fields = ('created_at', 'actor', 'action', 'entity_name', 'entity_id', 'changes', 'ip_address')
