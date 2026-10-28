from django.contrib import admin
from .models import (
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
    IdempotencyKey,
)


@admin.register(ClinicSetting)
class ClinicSettingAdmin(admin.ModelAdmin):
    list_display = ('clinic_name', 'phone', 'open_time', 'close_time', 'grid_increment_minutes', 'updated_at')


@admin.register(StaffUser)
class StaffUserAdmin(admin.ModelAdmin):
    list_display = ('full_name', 'email', 'role', 'is_active', 'last_login', 'created_at')
    list_filter = ('role', 'is_active')
    search_fields = ('full_name', 'email')


class DoctorServiceInline(admin.TabularInline):
    model = DoctorService
    extra = 1


@admin.register(Doctor)
class DoctorAdmin(admin.ModelAdmin):
    list_display = ('name', 'specialty', 'shift_start', 'shift_end', 'max_daily_appointments', 'is_active', 'is_on_leave')
    list_filter = ('specialty', 'is_active', 'is_on_leave')
    search_fields = ('name', 'specialty')
    inlines = [DoctorServiceInline]


@admin.register(Service)
class ServiceAdmin(admin.ModelAdmin):
    list_display = ('name', 'category', 'duration_minutes', 'buffer_minutes', 'price', 'is_active')
    list_filter = ('category', 'is_active')
    search_fields = ('name',)


@admin.register(AvailabilityRule)
class AvailabilityRuleAdmin(admin.ModelAdmin):
    list_display = ('doctor', 'rule_type', 'start_datetime', 'end_datetime', 'reason')
    list_filter = ('rule_type', 'doctor')


class SlotOfferInline(admin.TabularInline):
    model = SlotOffer
    extra = 0
    readonly_fields = ('offered_at',)


@admin.register(BookingRequest)
class BookingRequestAdmin(admin.ModelAdmin):
    list_display = ('request_code', 'patient_name', 'patient_phone', 'service', 'preferred_doctor', 'channel', 'status', 'created_at')
    list_filter = ('status', 'channel', 'patient_type')
    search_fields = ('request_code', 'patient_name', 'patient_phone')
    inlines = [SlotOfferInline]


@admin.register(Appointment)
class AppointmentAdmin(admin.ModelAdmin):
    list_display = ('appointment_code', 'patient_name', 'patient_phone', 'doctor', 'service', 'start_datetime', 'status')
    list_filter = ('status', 'doctor', 'service')
    search_fields = ('appointment_code', 'patient_name', 'patient_phone')


@admin.register(FollowUpTask)
class FollowUpTaskAdmin(admin.ModelAdmin):
    list_display = ('appointment', 'doctor', 'follow_up_date', 'reminder_sent', 'is_completed')
    list_filter = ('is_completed', 'reminder_sent')


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ('created_at', 'entity_name', 'action', 'performed_by', 'ip_address')
    list_filter = ('entity_name', 'action')
    readonly_fields = ('created_at',)


@admin.register(IdempotencyKey)
class IdempotencyKeyAdmin(admin.ModelAdmin):
    list_display = ('key', 'source', 'expires_at', 'created_at')
    list_filter = ('source',)
