import uuid
import datetime
from django.utils import timezone
from rest_framework import serializers
from .models import Appointment, SlotOffer, BookingRequest, Doctor, Service, FollowUpTask
from .serializers_booking import resolve_service_or_default, resolve_doctor_or_default, sanitize_phone_e164


class SlotHoldRequestSerializer(serializers.Serializer):
    """
    Validates atomic slot hold requests from either a SlotOffer selection
    or front-desk direct calendar selection.
    """
    slot_offer_id = serializers.UUIDField(required=False, allow_null=True)
    # n8n patient replies ("Reply 1, 2, or 3") — resolved by the BACKEND against the
    # request's slot offers in ORIGINAL dispatch order, so n8n never needs to remember
    # which offer was which (no workflow-to-workflow coupling).
    option_number = serializers.IntegerField(
        required=False, allow_null=True, min_value=1, max_value=20
    )
    request_id = serializers.CharField(required=False, allow_blank=True)
    doctor_id = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    service_id = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    start_datetime = serializers.DateTimeField(required=False, allow_null=True)
    end_datetime = serializers.DateTimeField(required=False, allow_null=True)
    patient_name = serializers.CharField(max_length=255, required=False, allow_blank=True)
    patient_phone = serializers.CharField(max_length=32, required=False, allow_blank=True)
    date_of_birth = serializers.DateField(required=False, allow_null=True)
    dob = serializers.DateField(required=False, allow_null=True)
    gender = serializers.CharField(max_length=16, required=False, allow_blank=True, default='')
    is_emergency = serializers.BooleanField(required=False, default=False)
    is_instant_confirm = serializers.BooleanField(default=False)
    is_walk_in = serializers.BooleanField(default=False)

    def validate(self, attrs):
        slot_offer_id = attrs.get('slot_offer_id')
        option_number = attrs.get('option_number')
        now = timezone.now()

        if slot_offer_id and option_number is not None:
            raise serializers.ValidationError(
                {'option_number': 'Provide either slot_offer_id or option_number, not both.'}
            )

        if slot_offer_id or option_number is not None:
            if slot_offer_id:
                try:
                    offer = SlotOffer.objects.select_related('request', 'doctor', 'request__service').get(id=slot_offer_id)
                except SlotOffer.DoesNotExist:
                    raise serializers.ValidationError({'slot_offer_id': 'Selected slot offer does not exist.'})
            else:
                # Option-number resolution (n8n patient replies): "Reply 2" resolves to the
                # 2nd offer of this request in ORIGINAL dispatch order. NEVER renumbered by
                # prior selections — the number the patient saw must keep its meaning.
                req_id = attrs.get('request_id')
                if not req_id:
                    raise serializers.ValidationError(
                        {'option_number': 'request_id is required when selecting by option_number.'}
                    )
                try:
                    val = uuid.UUID(str(req_id))
                    booking_req = BookingRequest.objects.filter(id=val).first()
                except (ValueError, AttributeError):
                    booking_req = BookingRequest.objects.filter(request_code=req_id).first()
                if not booking_req:
                    raise serializers.ValidationError({'request_id': 'Booking request does not exist.'})

                offers = list(booking_req.slot_offers.order_by('offered_at', 'id'))
                if option_number > len(offers):
                    raise serializers.ValidationError(
                        {'option_number': f'Only {len(offers)} slot option(s) were offered for this request.'}
                    )
                offer = offers[option_number - 1]

            if offer.expires_at and offer.expires_at < now:
                raise serializers.ValidationError({'slot_offer_id': 'This slot offer has expired.'})

            attrs['slot_offer_obj'] = offer
            attrs['doctor_obj'] = offer.doctor
            attrs['service_obj'] = offer.request.service
            attrs['start_dt'] = offer.start_datetime
            attrs['end_dt'] = offer.end_datetime
            attrs['name'] = offer.request.patient_name
            attrs['phone'] = offer.request.patient_phone
            attrs['booking_req'] = offer.request
        else:
            # Direct calendar selection
            doc_id = attrs.get('doctor_id')
            srv_id = attrs.get('service_id')
            start_dt = attrs.get('start_datetime')
            end_dt = attrs.get('end_datetime')
            name = attrs.get('patient_name')
            phone = attrs.get('patient_phone')

            if not all([doc_id, srv_id, start_dt, name, phone]):
                raise serializers.ValidationError(
                    "Either slot_offer_id or complete appointment details (doctor_id, service_id, start_datetime, patient_name, patient_phone) are required."
                )

            doctor_obj = resolve_doctor_or_default(doc_id)
            if not doctor_obj:
                raise serializers.ValidationError({'doctor_id': 'Doctor does not exist or is inactive.'})
            attrs['doctor_obj'] = doctor_obj

            service_obj = resolve_service_or_default(srv_id)
            if not service_obj:
                raise serializers.ValidationError({'service_id': 'Service does not exist or is inactive.'})
            attrs['service_obj'] = service_obj

            if not end_dt and start_dt:
                end_dt = start_dt + datetime.timedelta(minutes=service_obj.duration_minutes)

            attrs['start_dt'] = start_dt
            attrs['end_dt'] = end_dt
            attrs['name'] = name.strip()
            attrs['phone'] = sanitize_phone_e164(phone)
            attrs['phone'] = phone

            # Optional request lookup
            req_id = attrs.get('request_id')
            booking_req = None
            if req_id:
                try:
                    val = uuid.UUID(str(req_id))
                    booking_req = BookingRequest.objects.filter(id=val).first()
                except (ValueError, AttributeError):
                    booking_req = BookingRequest.objects.filter(request_code=req_id).first()
            attrs['booking_req'] = booking_req

        attrs['dob'] = attrs.get('date_of_birth') or attrs.get('dob')
        attrs['gender'] = attrs.get('gender', '')
        attrs['is_emergency'] = attrs.get('is_emergency', False)

        return attrs


class AppointmentStatusUpdateSerializer(serializers.Serializer):
    """
    Validates live visit status transitions for the 3 Kanban swimlanes.
    """
    ALLOWED_STATUSES = [
        'confirmed',
        'arrived',
        'in_consultation',
        'completed',
        'no_show',
        'cancelled',
        'rescheduled',
    ]

    status = serializers.ChoiceField(choices=ALLOWED_STATUSES)
    cancellation_reason = serializers.CharField(required=False, allow_blank=True, default='')

    def validate(self, attrs):
        if attrs['status'] == 'cancelled' and not attrs.get('cancellation_reason'):
            raise serializers.ValidationError({'cancellation_reason': 'Cancellation reason is required when cancelling.'})
        return attrs


class FollowUpTaskCreateSerializer(serializers.Serializer):
    """
    Validates doctor-directed recall task creation.
    """
    follow_up_date = serializers.DateField()
    notes = serializers.CharField(max_length=500)

    def validate_follow_up_date(self, value):
        today = timezone.now().date()
        if value < today:
            raise serializers.ValidationError("Follow-up date cannot be in the past.")
        return value


class AppointmentDetailSerializer(serializers.ModelSerializer):
    """
    Serializes appointments with treating doctor, service details, and wall-clock timestamps.
    """
    doctor_id = serializers.UUIDField(source='doctor.id', read_only=True)
    doctor_name = serializers.CharField(source='doctor.name', read_only=True)
    doctor_specialty = serializers.CharField(source='doctor.specialty', read_only=True)

    service_id = serializers.UUIDField(source='service.id', read_only=True)
    service_name = serializers.CharField(source='service.name', read_only=True)
    service_duration = serializers.IntegerField(source='service.duration_minutes', read_only=True)
    service_buffer = serializers.IntegerField(source='service.buffer_minutes', read_only=True)
    service_price = serializers.DecimalField(source='service.price', max_digits=10, decimal_places=2, read_only=True)

    booking_request_code = serializers.CharField(source='booking_request.request_code', read_only=True, default=None)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = Appointment
        fields = [
            'id',
            'appointment_code',
            'patient_name',
            'patient_phone',
            'date_of_birth',
            'gender',
            'is_emergency',
            'doctor_id',
            'doctor_name',
            'doctor_specialty',
            'service_id',
            'service_name',
            'service_duration',
            'service_buffer',
            'service_price',
            'booking_request_code',
            'start_datetime',
            'end_datetime',
            'status',
            'status_display',
            'hold_expires_at',
            'confirmed_at',
            'arrival_at',
            'completed_at',
            'cancelled_at',
            'cancellation_reason',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'appointment_code', 'created_at', 'updated_at']


class FollowUpTaskDetailSerializer(serializers.ModelSerializer):
    appointment_code = serializers.CharField(source='appointment.appointment_code', read_only=True)
    patient_name = serializers.CharField(source='appointment.patient_name', read_only=True)
    doctor_name = serializers.CharField(source='doctor.name', read_only=True)

    class Meta:
        model = FollowUpTask
        fields = [
            'id',
            'appointment',
            'appointment_code',
            'patient_name',
            'doctor',
            'doctor_name',
            'follow_up_date',
            'notes',
            'reminder_sent',
            'is_completed',
            'created_at',
        ]
        read_only_fields = ['id', 'created_at']
