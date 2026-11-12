from rest_framework import serializers

from .models import InteractionLog, BookingRequest, Appointment


def normalize_phone_e164(phone):
    """
    Light E.164 normalization (Hybrid AI OS spec §6 duplicate protection):
    strips spaces/dashes/parentheses and keeps the leading '+'.
    """
    if not phone:
        return ''
    raw = str(phone).strip()
    return '+' + ''.join(ch for ch in raw[1:] if ch.isdigit()) if raw.startswith('+') \
        else ''.join(ch for ch in raw if ch.isdigit())


class InteractionLogSerializer(serializers.ModelSerializer):
    """
    Read serializer for the dashboard (staff-auth GET /api/v1/interactions/).
    Staff may see the full phone number — the dashboard is the
    access-controlled authoritative view; only ephemeral logs are masked.
    """
    request_code = serializers.CharField(source='booking_request.request_code', read_only=True, default=None)
    appointment_code = serializers.CharField(source='appointment.appointment_code', read_only=True, default=None)

    class Meta:
        model = InteractionLog
        fields = [
            'id', 'provider', 'channel', 'direction', 'status',
            'patient_name', 'patient_phone', 'request_code', 'appointment_code',
            'external_ref', 'call_duration_seconds', 'recording_url',
            'summary', 'transcript', 'error_detail',
            'created_at', 'updated_at',
        ]


class InteractionWriteSerializer(serializers.Serializer):
    """
    Write contract for n8n Dispatcher results (POST /api/v1/interactions/).
    Every field is validated server-side (spec §8: never trust the client).
    """
    provider = serializers.ChoiceField(choices=[
        c[0] for c in InteractionLog.PROVIDER_CHOICES
    ])
    channel = serializers.ChoiceField(choices=[
        c[0] for c in InteractionLog.CHANNEL_CHOICES
    ])
    direction = serializers.ChoiceField(
        choices=[c[0] for c in InteractionLog.DIRECTION_CHOICES],
        default='outbound'
    )
    status = serializers.ChoiceField(
        choices=[c[0] for c in InteractionLog.STATUS_CHOICES],
        default='sent'
    )
    patient_phone = serializers.CharField(max_length=32)
    patient_name = serializers.CharField(max_length=255, required=False, allow_blank=True, default='')
    request_code = serializers.CharField(max_length=32, required=False, allow_blank=True, default='')
    appointment_code = serializers.CharField(max_length=32, required=False, allow_blank=True, default='')
    external_ref = serializers.CharField(max_length=255, required=False, allow_blank=True, default='')
    call_duration_seconds = serializers.IntegerField(required=False, min_value=0, allow_null=True, default=None)
    recording_url = serializers.URLField(required=False, allow_blank=True, default='')
    summary = serializers.CharField(required=False, allow_blank=True, default='')
    transcript = serializers.CharField(required=False, allow_blank=True, default='')
    error_detail = serializers.CharField(required=False, allow_blank=True, default='')

    def validate_patient_phone(self, value):
        normalized = normalize_phone_e164(value)
        if not normalized:
            raise serializers.ValidationError('patient_phone is required.')
        return normalized

    def resolve_links(self, validated):
        """Resolve request_code / appointment_code to FK instances; '' → None."""
        errors = {}
        validated['booking_request'] = None
        validated['appointment'] = None

        code = validated.pop('request_code', '') or ''
        if code:
            req = BookingRequest.objects.filter(request_code=code).first()
            if req:
                validated['booking_request'] = req
            else:
                errors['request_code'] = f'BookingRequest {code} not found.'

        code = validated.pop('appointment_code', '') or ''
        if code:
            appt = Appointment.objects.filter(appointment_code=code).first()
            if appt:
                validated['appointment'] = appt
            else:
                errors['appointment_code'] = f'Appointment {code} not found.'

        if errors:
            raise serializers.ValidationError(errors)
