import re
import uuid
from rest_framework import serializers
from .models import BookingRequest, SlotOffer, Service, Doctor, Appointment


def sanitize_phone_e164(phone: str) -> str:
    """
    Normalizes local and international phone formats into E.164 standard.
    Handles Nigerian local prefixes (080..., 070..., 090..., 081...) -> +234...
    """
    if not phone:
        return ""
    cleaned = re.sub(r'[\s\-\(\)\.]', '', str(phone).strip())
    if cleaned.startswith('0') and len(cleaned) == 11:
        return '+234' + cleaned[1:]
    if cleaned.startswith('234') and not cleaned.startswith('+'):
        return '+' + cleaned
    if not cleaned.startswith('+') and cleaned:
        return '+' + cleaned
    return cleaned


def resolve_service_or_default(service_id):
    """
    Resolves Service by UUID, slug ('svc-dental', 'svc-checkup'), or partial name match.
    Defaults to the first active clinic service if not found.
    """
    if not service_id:
        return Service.objects.filter(is_active=True).first()
    try:
        val = uuid.UUID(str(service_id))
        srv = Service.objects.filter(id=val, is_active=True).first()
        if srv:
            return srv
    except (ValueError, AttributeError):
        pass

    id_str = str(service_id).lower()
    if 'extract' in id_str or 'surgery' in id_str:
        srv = Service.objects.filter(name__icontains='Extraction', is_active=True).first()
    elif 'dental' in id_str or 'dent' in id_str:
        srv = Service.objects.filter(name__icontains='Dental', is_active=True).first()
    elif 'check' in id_str or 'general' in id_str:
        srv = Service.objects.filter(name__icontains='Check-up', is_active=True).first()
    elif 'eye' in id_str or 'ophthalmology' in id_str:
        srv = Service.objects.filter(name__icontains='Eye', is_active=True).first()
    else:
        srv = Service.objects.filter(name__icontains=id_str, is_active=True).first()
    return srv or Service.objects.filter(is_active=True).first()


def resolve_doctor_or_default(doctor_id):
    """
    Resolves Doctor by UUID, slug ('doc-bello', 'doc-okafor'), or partial name.
    """
    if not doctor_id:
        return None
    try:
        val = uuid.UUID(str(doctor_id))
        doc = Doctor.objects.filter(id=val, is_active=True).first()
        if doc:
            return doc
    except (ValueError, AttributeError):
        pass

    id_str = str(doctor_id).lower()
    if 'bello' in id_str:
        doc = Doctor.objects.filter(name__icontains='Bello', is_active=True).first()
    elif 'okafor' in id_str:
        doc = Doctor.objects.filter(name__icontains='Okafor', is_active=True).first()
    elif 'babawo' in id_str:
        doc = Doctor.objects.filter(name__icontains='Babawo', is_active=True).first()
    else:
        doc = Doctor.objects.filter(name__icontains=id_str, is_active=True).first()
    return doc


def get_patient_dossier(phone: str):
    """
    Computes attendance history without exposing clinical/diagnostic details (HIPAA/NDPR).
    """
    sanitized = sanitize_phone_e164(phone)
    past_appts = Appointment.objects.filter(patient_phone=sanitized).exclude(
        status__in=['held', 'hold_expired']
    )
    total = past_appts.count()
    if total == 0:
        return {
            'is_returning': False,
            'total_visits': 0,
            'completed_visits': 0,
            'no_show_count': 0,
            'reliability_percentage': None,
        }

    completed = past_appts.filter(status='completed').count()
    no_shows = past_appts.filter(status='no_show').count()
    denom = completed + no_shows
    reliability = round((completed / denom) * 100, 1) if denom > 0 else 100.0

    return {
        'is_returning': True,
        'total_visits': total,
        'completed_visits': completed,
        'no_show_count': no_shows,
        'reliability_percentage': reliability,
    }


class SlotOfferSerializer(serializers.ModelSerializer):
    doctor_name = serializers.CharField(source='doctor.name', read_only=True)
    doctor_specialty = serializers.CharField(source='doctor.specialty', read_only=True)

    class Meta:
        model = SlotOffer
        fields = [
            'id',
            'request',
            'doctor',
            'doctor_name',
            'doctor_specialty',
            'start_datetime',
            'end_datetime',
            'is_alternative_date',
            'offered_at',
            'expires_at',
            'is_selected',
        ]
        read_only_fields = ['id', 'offered_at']


class BookingRequestCreateSerializer(serializers.Serializer):
    """
    Validates inbound booking requests from web intake and bot messaging.
    Includes anti-abuse honeypot trap and E.164 phone sanitization.
    """
    patient_name = serializers.CharField(max_length=255)
    patient_phone = serializers.CharField(max_length=32)
    service_id = serializers.CharField(required=False, allow_blank=True)
    service = serializers.CharField(required=False, allow_blank=True)
    preferred_doctor_id = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    preferred_doctor = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    preferred_dates = serializers.ListField(
        child=serializers.CharField(), required=False, allow_empty=True
    )
    preferred_date_range = serializers.DictField(required=False)
    preferred_time_window = serializers.ChoiceField(
        choices=['morning', 'afternoon', 'evening'], default='morning'
    )
    channel = serializers.ChoiceField(
        choices=['web', 'telegram', 'whatsapp_flow'], default='web'
    )
    patient_notes = serializers.CharField(required=False, allow_blank=True, default='')
    clinic_web_trap = serializers.CharField(required=False, allow_blank=True, default='')
    date_of_birth = serializers.DateField(required=False, allow_null=True)
    dob = serializers.DateField(required=False, allow_null=True)
    gender = serializers.CharField(max_length=16, required=False, allow_blank=True, default='')
    is_emergency = serializers.BooleanField(required=False, default=False)

    def validate(self, attrs):
        # Service ID normalization (accepts UUID, slug like 'svc-dental', or name)
        srv_id = attrs.get('service_id') or attrs.get('service')
        service_obj = resolve_service_or_default(srv_id)
        if not service_obj:
            raise serializers.ValidationError({'service_id': 'Selected service does not exist or is inactive.'})
        attrs['service_obj'] = service_obj

        # Preferred Doctor normalization (optional, accepts UUID, slug, or name)
        doc_id = attrs.get('preferred_doctor_id') or attrs.get('preferred_doctor')
        attrs['doctor_obj'] = resolve_doctor_or_default(doc_id)

        # Phone sanitization
        raw_phone = attrs.get('patient_phone', '')
        sanitized_phone = sanitize_phone_e164(raw_phone)
        if len(sanitized_phone) < 8:
            raise serializers.ValidationError({'patient_phone': 'Invalid phone number format.'})
        attrs['sanitized_phone'] = sanitized_phone

        # Preferred Date Range normalization
        dates = attrs.get('preferred_dates')
        date_range = attrs.get('preferred_date_range')
        if dates and len(dates) > 0:
            attrs['normalized_date_range'] = {
                'start': dates[0],
                'end': dates[-1] if len(dates) > 1 else dates[0],
                'dates': dates,
            }
        elif date_range:
            attrs['normalized_date_range'] = date_range
        else:
            attrs['normalized_date_range'] = {}

        return attrs


class BookingRequestDetailSerializer(serializers.ModelSerializer):
    """
    Renders detailed booking request for Receptionist Triage Queue,
    including returning patient reliability score and active slot offers.
    """
    service_id = serializers.UUIDField(source='service.id', read_only=True)
    service_name = serializers.CharField(source='service.name', read_only=True)
    service_category = serializers.CharField(source='service.category', read_only=True)
    service_duration = serializers.IntegerField(source='service.duration_minutes', read_only=True)
    service_buffer = serializers.IntegerField(source='service.buffer_minutes', read_only=True)
    service_price = serializers.DecimalField(source='service.price', max_digits=10, decimal_places=2, read_only=True)

    preferred_doctor_id = serializers.UUIDField(source='preferred_doctor.id', read_only=True, allow_null=True)
    preferred_doctor_name = serializers.CharField(source='preferred_doctor.name', read_only=True, allow_null=True)
    preferred_doctor_specialty = serializers.CharField(source='preferred_doctor.specialty', read_only=True, allow_null=True)

    patient_dossier = serializers.SerializerMethodField()
    # Task 3.4 "Needs Attention": delivery-failure visibility driven by the shared
    # InteractionLog — n8n logs provider failures (failed / no_answer / expired)
    # there, and the dashboard queue surfaces them without new models.
    delivery_failures = serializers.SerializerMethodField()
    last_failure = serializers.SerializerMethodField()
    slot_offers = SlotOfferSerializer(many=True, read_only=True)
    request_id = serializers.CharField(source='request_code', read_only=True)

    class Meta:
        model = BookingRequest
        fields = [
            'id',
            'request_code',
            'request_id',
            'patient_name',
            'patient_phone',
            'patient_type',
            'date_of_birth',
            'gender',
            'is_emergency',
            'previous_patient_id',
            'service_id',
            'service_name',
            'service_category',
            'service_duration',
            'service_buffer',
            'service_price',
            'preferred_doctor_id',
            'preferred_doctor_name',
            'preferred_doctor_specialty',
            'preferred_date_range',
            'preferred_time_window',
            'channel',
            'status',
            'channel_blocked',
            'patient_notes',
            'offer_expires_at',
            'patient_dossier',
            'delivery_failures',
            'last_failure',
            'slot_offers',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'request_code', 'created_at', 'updated_at']

    def get_patient_dossier(self, obj):
        return get_patient_dossier(obj.patient_phone)

    # --- Task 3.4: Needs Attention fields -------------------------------
    FAILURE_STATUSES = ('failed', 'no_answer', 'expired')

    def _failure_queryset(self, obj):
        return obj.interactions.filter(status__in=self.FAILURE_STATUSES)

    def get_delivery_failures(self, obj):
        return self._failure_queryset(obj).count()

    def get_last_failure(self, obj):
        latest = self._failure_queryset(obj).order_by('-created_at').first()
        if latest is None:
            return None
        return {
            'channel': latest.channel,
            'status': latest.status,
            'summary': latest.summary or '',
            'error_detail': latest.error_detail or '',
            'created_at': latest.created_at.isoformat(),
        }
