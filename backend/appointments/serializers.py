"""
Django REST Framework Serializers for Clinic Booking System.
Agency Template Serialization & Validation Layer.
"""

from datetime import datetime, date, timedelta
from rest_framework import serializers
from django.utils import timezone
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


class ClinicSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClinicSetting
        fields = '__all__'


class ServiceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Service
        fields = [
            'id', 'name', 'category', 'duration_minutes',
            'buffer_minutes', 'price', 'deposit_required', 'is_active'
        ]


class DoctorSerializer(serializers.ModelSerializer):
    duty_status = serializers.SerializerMethodField()
    patients_seen_today = serializers.SerializerMethodField()
    appointments_remaining = serializers.SerializerMethodField()

    class Meta:
        model = Doctor
        fields = [
            'id', 'name', 'email', 'phone', 'specialty',
            'working_days', 'shift_start', 'shift_end',
            'is_active', 'is_on_leave', 'duty_status',
            'patients_seen_today', 'appointments_remaining',
        ]

    def get_duty_status(self, obj) -> str:
        if obj.is_on_leave:
            return 'on_leave'
        if not obj.is_active:
            return 'inactive'
        
        now = timezone.now()
        target_time = now.time()
        if not obj.is_available_on_date(now.date()):
            return 'off_duty'
        if obj.shift_start <= target_time <= obj.shift_end:
            return 'on_duty'
        return 'off_duty'

    def get_patients_seen_today(self, obj) -> int:
        today = timezone.now().date()
        return Appointment.objects.filter(
            doctor=obj,
            start_datetime__date=today,
            status='completed',
        ).count()

    def get_appointments_remaining(self, obj) -> int:
        now = timezone.now()
        return Appointment.objects.filter(
            doctor=obj,
            start_datetime__gte=now,
            start_datetime__date=now.date(),
            status__in=['confirmed', 'arrived', 'in_consultation'],
        ).count()


class StaffUserSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)
    first_name = serializers.CharField(source='user.first_name', read_only=True)
    last_name = serializers.CharField(source='user.last_name', read_only=True)
    email = serializers.EmailField(source='user.email', read_only=True)
    full_name = serializers.ReadOnlyField()

    class Meta:
        model = StaffUser
        fields = [
            'id', 'username', 'first_name', 'last_name',
            'email', 'full_name', 'role', 'is_active',
            'created_at'
        ]


class SlotOfferSerializer(serializers.ModelSerializer):
    doctor_name = serializers.CharField(source='doctor.name', read_only=True)
    display_label = serializers.SerializerMethodField()

    class Meta:
        model = SlotOffer
        fields = [
            'id', 'request', 'doctor', 'doctor_name',
            'start_datetime', 'end_datetime', 'is_alternative_date',
            'is_selected', 'offered_at', 'expires_at', 'display_label'
        ]

    def get_display_label(self, obj) -> str:
        from django.utils.dateparse import parse_datetime
        start = obj.start_datetime
        if isinstance(start, str):
            start = parse_datetime(start)
        end = obj.end_datetime
        if isinstance(end, str):
            end = parse_datetime(end)

        local_start = timezone.localtime(start) if (start and timezone.is_aware(start)) else start
        local_end = timezone.localtime(end) if (end and timezone.is_aware(end)) else end
        if local_start and local_end:
            return f"{local_start.strftime('%a %b %d, %I:%M %p')} - {local_end.strftime('%I:%M %p')}"
        return ""


class BookingRequestSerializer(serializers.ModelSerializer):
    request_id = serializers.CharField(source='request_code', read_only=True)
    service_name = serializers.CharField(source='service.name', read_only=True)
    preferred_doctor_name = serializers.CharField(source='preferred_doctor.name', read_only=True, allow_null=True)
    preferred_dates = serializers.SerializerMethodField()
    past_visits_count = serializers.SerializerMethodField()
    last_visit = serializers.SerializerMethodField()
    suggested_slots = SlotOfferSerializer(source='slot_offers', many=True, read_only=True)

    class Meta:
        model = BookingRequest
        fields = [
            'id', 'request_id', 'request_code', 'patient_name',
            'patient_phone', 'patient_type', 'service', 'service_name',
            'preferred_doctor', 'preferred_doctor_name',
            'preferred_dates', 'preferred_date_start', 'preferred_date_end',
            'preferred_time_window', 'channel', 'status',
            'offer_expires_at', 'past_visits_count', 'last_visit',
            'suggested_slots', 'created_at', 'updated_at'
        ]

    def get_preferred_dates(self, obj) -> list:
        dates = [str(obj.preferred_date_start)]
        if obj.preferred_date_end and obj.preferred_date_end != obj.preferred_date_start:
            dates.append(str(obj.preferred_date_end))
        return dates

    def get_past_visits_count(self, obj) -> int:
        return Appointment.objects.filter(
            patient_phone=obj.patient_phone,
            status='completed'
        ).count()

    def get_last_visit(self, obj) -> str | None:
        last_appt = Appointment.objects.filter(
            patient_phone=obj.patient_phone,
            status='completed'
        ).order_by('-completed_at').first()
        if last_appt and last_appt.completed_at:
            return f"{last_appt.completed_at.strftime('%Y-%m-%d')} ({last_appt.service.name})"
        return None


class BookingRequestCreateSerializer(serializers.Serializer):
    patient_name = serializers.CharField(max_length=150)
    patient_phone = serializers.CharField(max_length=30)
    patient_type = serializers.ChoiceField(choices=['new', 'returning'], default='new')
    service_id = serializers.UUIDField()
    preferred_doctor_id = serializers.UUIDField(required=False, allow_null=True)
    preferred_dates = serializers.ListField(
        child=serializers.DateField(),
        required=False,
        allow_empty=True
    )
    preferred_date_start = serializers.DateField(required=False)
    preferred_date_end = serializers.DateField(required=False)
    preferred_time_window = serializers.ChoiceField(
        choices=['morning', 'afternoon', 'evening', 'any'],
        default='morning'
    )
    channel = serializers.ChoiceField(
        choices=['web', 'telegram', 'whatsapp'],
        default='web'
    )

    def validate(self, attrs):
        service_id = attrs.get('service_id')
        try:
            attrs['service'] = Service.objects.get(id=service_id, is_active=True)
        except Service.DoesNotExist:
            raise serializers.ValidationError({'service_id': 'Active service not found.'})

        doctor_id = attrs.get('preferred_doctor_id')
        if doctor_id:
            try:
                attrs['preferred_doctor'] = Doctor.objects.get(id=doctor_id, is_active=True)
            except Doctor.DoesNotExist:
                raise serializers.ValidationError({'preferred_doctor_id': 'Active doctor not found.'})
        else:
            attrs['preferred_doctor'] = None

        # Resolve date range
        dates = attrs.get('preferred_dates', [])
        if dates:
            attrs['start_date'] = min(dates)
            attrs['end_date'] = max(dates)
        else:
            attrs['start_date'] = attrs.get('preferred_date_start', timezone.now().date())
            attrs['end_date'] = attrs.get('preferred_date_end', attrs['start_date'])

        # Auto-detect returning patient if past appointments exist
        if attrs.get('patient_type') == 'new':
            has_past = Appointment.objects.filter(patient_phone=attrs['patient_phone']).exists()
            if has_past:
                attrs['patient_type'] = 'returning'

        return attrs

    def create(self, validated_data):
        import uuid
        request_code = f"REQ-2026-{uuid.uuid4().hex[:4].upper()}"
        return BookingRequest.objects.create(
            request_code=request_code,
            patient_name=validated_data['patient_name'],
            patient_phone=validated_data['patient_phone'],
            patient_type=validated_data['patient_type'],
            service=validated_data['service'],
            preferred_doctor=validated_data['preferred_doctor'],
            preferred_date_start=validated_data['start_date'],
            preferred_date_end=validated_data['end_date'],
            preferred_time_window=validated_data['preferred_time_window'],
            channel=validated_data['channel'],
            status='awaiting_review',
        )


class AppointmentSerializer(serializers.ModelSerializer):
    appointment_id = serializers.CharField(source='appointment_code', read_only=True)
    doctor_name = serializers.CharField(source='doctor.name', read_only=True)
    doctor_specialty = serializers.CharField(source='doctor.specialty', read_only=True)
    service_name = serializers.CharField(source='service.name', read_only=True)
    service_price = serializers.DecimalField(source='service.price', max_digits=10, decimal_places=2, read_only=True)

    class Meta:
        model = Appointment
        fields = [
            'id', 'appointment_id', 'appointment_code', 'patient_name',
            'patient_phone', 'doctor', 'doctor_name', 'doctor_specialty',
            'service', 'service_name', 'service_price',
            'start_datetime', 'end_datetime', 'status',
            'hold_expires_at', 'confirmed_at', 'arrival_at',
            'completed_at', 'cancelled_at', 'cancellation_reason',
            'created_at'
        ]


class FollowUpTaskSerializer(serializers.ModelSerializer):
    doctor_name = serializers.CharField(source='doctor.name', read_only=True)
    patient_name = serializers.CharField(source='appointment.patient_name', read_only=True)
    patient_phone = serializers.CharField(source='appointment.patient_phone', read_only=True)

    class Meta:
        model = FollowUpTask
        fields = [
            'id', 'appointment', 'doctor', 'doctor_name',
            'patient_name', 'patient_phone', 'follow_up_date',
            'notes', 'reminder_sent', 'is_completed', 'created_at'
        ]


class AuditLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditLog
        fields = '__all__'
