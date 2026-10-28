import datetime
from django.utils import timezone
from rest_framework import serializers
from .models import ClinicSetting, Doctor, StaffUser, Appointment, Service


class ClinicSettingSerializer(serializers.ModelSerializer):
    """
    Serializes central clinic operational and scheduling rules.
    Supports partial updates (PATCH) with multi-phone, multi-email,
    and camelCase frontend parameter translation.
    """
    phones = serializers.ListField(child=serializers.CharField(), required=False)
    emails = serializers.ListField(child=serializers.CharField(), required=False)
    clinic_profile = serializers.SerializerMethodField()

    class Meta:
        model = ClinicSetting
        fields = [
            'id',
            'clinic_name',
            'tagline',
            'address',
            'phone',
            'phones',
            'emails',
            'clinic_profile',
            'whatsapp_phone_id',
            'open_time',
            'close_time',
            'working_days',
            'lunch_break_start',
            'lunch_break_end',
            'grid_increment_minutes',
            'booking_horizon_days',
            'min_advance_hours',
            'offer_expiry_minutes',
            'hold_expiry_minutes',
            'default_buffer_minutes',
            'emergency_slots_per_shift',
            'enable_24h_reminder',
            'enable_2h_reminder',
            'custom_config',
            'updated_at',
        ]
        read_only_fields = ['id', 'updated_at']

    def get_clinic_profile(self, obj):
        phones_list = obj.phones if obj.phones and len(obj.phones) > 0 else ([obj.phone] if obj.phone else [])
        emails_list = obj.emails if obj.emails and len(obj.emails) > 0 else ([obj.custom_config.get('email')] if obj.custom_config.get('email') else ['contact@cedarcare.ng'])
        return {
            'clinic_name': obj.clinic_name,
            'tagline': obj.tagline,
            'address': obj.address,
            'phones': phones_list,
            'phone': phones_list[0] if phones_list else obj.phone,
            'emails': emails_list,
            'email': emails_list[0] if emails_list else 'contact@cedarcare.ng',
            'whatsapp_phone_id': obj.whatsapp_phone_id,
            'telegram_bot': obj.custom_config.get('telegram_bot', obj.custom_config.get('bot_handle', '@cedarcare_bot')),
            'timezone': obj.custom_config.get('timezone', 'Africa/Lagos (WAT, UTC+1)'),
            'currency': obj.custom_config.get('currency', 'NGN'),
            'currency_symbol': obj.custom_config.get('currency_symbol', '₦'),
        }

    def to_internal_value(self, data):
        data = data.copy() if hasattr(data, 'copy') else dict(data)

        # Unpack nested clinic_profile or clinicProfile if provided
        profile = data.pop('clinic_profile', None) or data.pop('clinicProfile', None)
        if isinstance(profile, dict):
            for k, v in profile.items():
                if k not in data:
                    data[k] = v

        # Translate camelCase to snake_case
        camel_to_snake = {
            'clinicName': 'clinic_name',
            'whatsappPhoneId': 'whatsapp_phone_id',
            'openTime': 'open_time',
            'closeTime': 'close_time',
            'workingDays': 'working_days',
            'lunchBreakStart': 'lunch_break_start',
            'lunchBreakEnd': 'lunch_break_end',
            'gridIncrementMinutes': 'grid_increment_minutes',
            'bookingHorizonDays': 'booking_horizon_days',
            'minAdvanceHours': 'min_advance_hours',
            'offerExpiryMinutes': 'offer_expiry_minutes',
            'holdExpiryMinutes': 'hold_expiry_minutes',
            'defaultBufferMinutes': 'default_buffer_minutes',
            'emergencySlotsPerShift': 'emergency_slots_per_shift',
            'enable24hReminder': 'enable_24h_reminder',
            'enable2hReminder': 'enable_2h_reminder',
        }
        for camel, snake in camel_to_snake.items():
            if camel in data and snake not in data:
                data[snake] = data[camel]

        # Handle telegramBot in custom_config
        if 'telegramBot' in data or 'telegram_bot' in data:
            bot_val = data.get('telegramBot') or data.get('telegram_bot')
            cfg = data.get('custom_config', {})
            if isinstance(cfg, dict):
                cfg['telegram_bot'] = bot_val
                data['custom_config'] = cfg

        return super().to_internal_value(data)

    def update(self, instance, validated_data):
        phones = validated_data.get('phones')
        if phones is not None:
            instance.phones = phones
            if len(phones) > 0:
                instance.phone = phones[0]

        emails = validated_data.get('emails')
        if emails is not None:
            instance.emails = emails
            if len(emails) > 0:
                if not instance.custom_config:
                    instance.custom_config = {}
                instance.custom_config['email'] = emails[0]

        return super().update(instance, validated_data)


class ServiceSerializer(serializers.ModelSerializer):
    """
    Serializes clinical treatments and consultation procedures.
    Includes description and supports camelCase durationMin/bufferMin.
    """
    description = serializers.CharField(required=False, allow_blank=True, default='')

    class Meta:
        model = Service
        fields = [
            'id',
            'name',
            'category',
            'description',
            'duration_minutes',
            'buffer_minutes',
            'price',
            'deposit_required',
            'is_active',
        ]
        read_only_fields = ['id']

    def to_internal_value(self, data):
        data = data.copy() if hasattr(data, 'copy') else dict(data)
        if 'durationMin' in data and 'duration_minutes' not in data:
            data['duration_minutes'] = data['durationMin']
        if 'bufferMin' in data and 'buffer_minutes' not in data:
            data['buffer_minutes'] = data['bufferMin']
        if 'isActive' in data and 'is_active' not in data:
            data['is_active'] = data['isActive']
        if 'deposit_required' in data:
            val = data['deposit_required']
            if isinstance(val, (int, float)):
                data['deposit_required'] = (val > 0)
            elif isinstance(val, str):
                data['deposit_required'] = val.lower() in ('true', '1', 'yes')
        return super().to_internal_value(data)


class DoctorDutyStatusUpdateSerializer(serializers.Serializer):
    """
    Validates 1-click duty status toggles for doctors.
    Supports is_on_leave, is_active, duty_mode, and frontend status ('on_duty', 'on_leave', 'on_break').
    """
    is_on_leave = serializers.BooleanField(required=False)
    is_active = serializers.BooleanField(required=False)
    duty_mode = serializers.ChoiceField(
        choices=['on_duty', 'on_break', 'on_sick_leave', 'off_duty'],
        required=False
    )
    status = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        mode = attrs.get('duty_mode') or attrs.get('status')
        if mode:
            mode_str = str(mode).lower()
            if mode_str in ['on_sick_leave', 'on_leave', 'leave']:
                attrs['is_on_leave'] = True
            elif mode_str in ['on_duty', 'on_break']:
                attrs['is_on_leave'] = False
                attrs['is_active'] = True
            elif mode_str in ['off_duty', 'inactive', 'deactivated']:
                attrs['is_active'] = False
        return attrs


class DoctorDirectorySerializer(serializers.ModelSerializer):
    """
    Renders clinicians with real-time duty state, daily workload, and attendance score.
    """
    duty_status = serializers.SerializerMethodField()
    patients_seen_today = serializers.SerializerMethodField()
    active_appointments_today = serializers.SerializerMethodField()
    total_appointments = serializers.SerializerMethodField()
    attendance_rate = serializers.SerializerMethodField()

    class Meta:
        model = Doctor
        fields = [
            'id',
            'name',
            'email',
            'phone',
            'specialty',
            'working_days',
            'shift_start',
            'shift_end',
            'is_active',
            'is_on_leave',
            'duty_status',
            'patients_seen_today',
            'active_appointments_today',
            'total_appointments',
            'attendance_rate',
        ]

    def get_duty_status(self, obj):
        if not obj.is_active:
            return 'inactive'
        if obj.is_on_leave:
            return 'on_sick_leave'

        now = timezone.localtime(timezone.now())
        today_iso = now.isoweekday()  # 1=Mon, 7=Sun
        current_time = now.time()

        clinic = ClinicSetting.get_settings()
        if today_iso not in obj.working_days:
            return 'off_duty'

        if clinic.lunch_break_start <= current_time < clinic.lunch_break_end:
            return 'on_break'

        if obj.shift_start <= current_time <= obj.shift_end:
            return 'on_duty'

        return 'off_duty'

    def get_patients_seen_today(self, obj):
        today = timezone.localdate()
        return Appointment.objects.filter(
            doctor=obj,
            start_datetime__date=today,
            status='completed'
        ).count()

    def get_active_appointments_today(self, obj):
        today = timezone.localdate()
        return Appointment.objects.filter(
            doctor=obj,
            start_datetime__date=today,
            status__in=['held', 'confirmed', 'arrived', 'in_consultation']
        ).count()

    def get_total_appointments(self, obj):
        return Appointment.objects.filter(doctor=obj).count()

    def get_attendance_rate(self, obj):
        appts = Appointment.objects.filter(doctor=obj)
        completed = appts.filter(status='completed').count()
        no_shows = appts.filter(status='no_show').count()
        denom = completed + no_shows
        return round((completed / denom) * 100, 1) if denom > 0 else 100.0


class StaffDirectoryUserSerializer(serializers.ModelSerializer):
    """
    Renders administrative and front-desk staff accounts.
    """
    class Meta:
        model = StaffUser
        fields = [
            'id',
            'full_name',
            'email',
            'role',
            'is_active',
            'last_login',
            'created_at',
        ]
        read_only_fields = ['id', 'created_at']


class CalendarScheduleQuerySerializer(serializers.Serializer):
    """
    Validates date range and doctor filters for the master clinical calendar grid.
    """
    start_date = serializers.DateField(required=False)
    end_date = serializers.DateField(required=False)
    doctor_id = serializers.UUIDField(required=False, allow_null=True)
    service_id = serializers.UUIDField(required=False, allow_null=True)

    def validate(self, attrs):
        today = timezone.localdate()
        start = attrs.get('start_date') or today
        end = attrs.get('end_date') or (start + datetime.timedelta(days=7))

        if end < start:
            end = start + datetime.timedelta(days=7)

        attrs['resolved_start'] = start
        attrs['resolved_end'] = end
        return attrs
