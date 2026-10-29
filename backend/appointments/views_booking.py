import uuid
import datetime
from django.utils import timezone
from django.core.cache import cache
from django.shortcuts import get_object_or_404
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny

from django.db import transaction
from .models import BookingRequest, SlotOffer, Doctor, ClinicSetting, AuditLog, Appointment
from .permissions import IsStaffAuthenticated
from .serializers_booking import (
    BookingRequestCreateSerializer,
    BookingRequestDetailSerializer,
    SlotOfferSerializer,
    sanitize_phone_e164,
)
from .services.availability import AvailabilityEngine
from .services.sse_bus import broadcast_event
from .services.telegram_service import TelegramService


def get_booking_or_404(identifier, for_update=False):
    """
    Retrieves BookingRequest by UUID primary key or human-readable request_code (REQ-YYYY-XXXX).
    Optionally applies select_for_update() for atomic locking during mutations.
    """
    qs = BookingRequest.objects.select_for_update() if for_update else BookingRequest.objects
    try:
        val = uuid.UUID(str(identifier))
        return get_object_or_404(qs, id=val)
    except (ValueError, AttributeError):
        return get_object_or_404(qs, request_code=identifier)


class BookingRequestListCreateView(APIView):
    """
    POST: Public patient intake endpoint (Web widget, Telegram, WhatsApp).
          Includes hidden honeypot shield and IP rate limiting (5 req / 10 min).
    GET:  Authenticated FIFO queue for Receptionist Triage Queue ordered by created_at ASC.
    """
    def get_permissions(self):
        if self.request.method == 'POST':
            return [AllowAny()]
        return [IsStaffAuthenticated()]

    def post(self, request):
        # 1. Anti-Abuse Honeypot Trap (clinic_web_trap)
        # If filled by bot script, silently return 201 without writing to database
        trap_value = request.data.get('clinic_web_trap')
        if trap_value:
            current_year = timezone.now().year
            return Response({
                "request_id": f"REQ-{current_year}-0000",
                "status": "awaiting_review",
                "created_at": timezone.now().isoformat(),
                "detail": "Request received.",
            }, status=status.HTTP_201_CREATED)

        # 2. IP-Based Rate Limiting (5 requests per 10 minutes)
        client_ip = request.META.get('HTTP_X_FORWARDED_FOR', request.META.get('REMOTE_ADDR', '127.0.0.1'))
        if client_ip and ',' in client_ip:
            client_ip = client_ip.split(',')[0].strip()

        rate_limit_key = f"rate_limit_booking_{client_ip}"
        current_attempts = cache.get(rate_limit_key, 0)
        if current_attempts >= 5:
            return Response({
                "error": "RATE_LIMIT_EXCEEDED",
                "detail": "Too many booking requests from this network. Please wait a few minutes before trying again."
            }, status=status.HTTP_429_TOO_MANY_REQUESTS)

        cache.set(rate_limit_key, current_attempts + 1, timeout=600)

        # 3. Request Validation & Sanitization
        serializer = BookingRequestCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data

        sanitized_phone = validated['sanitized_phone']

        # 4. Returning Patient Recognition & History Matching
        is_returning = (
            Appointment.objects.filter(patient_phone=sanitized_phone).exists() or
            BookingRequest.objects.filter(patient_phone=sanitized_phone).exists()
        )
        patient_type = 'returning' if is_returning else 'new'

        dob = validated.get('date_of_birth') or validated.get('dob')
        gender = validated.get('gender', '')
        is_emergency = validated.get('is_emergency', False)

        # 5. Persist Booking Request
        booking = BookingRequest.objects.create(
            patient_name=validated['patient_name'].strip(),
            patient_phone=sanitized_phone,
            patient_type=patient_type,
            date_of_birth=dob,
            gender=gender,
            is_emergency=is_emergency,
            service=validated['service_obj'],
            preferred_doctor=validated.get('doctor_obj'),
            preferred_date_range=validated.get('normalized_date_range', {}),
            preferred_time_window=validated.get('preferred_time_window', 'morning'),
            channel=validated.get('channel', 'web'),
            status='awaiting_review',
            patient_notes=validated.get('patient_notes', ''),
        )

        AuditLog.objects.create(
            entity_name='BookingRequest',
            entity_id=booking.id,
            action='BOOKING_REQUEST_CREATED',
            performed_by=f"Channel:{booking.channel}",
            changes={
                'request_code': booking.request_code,
                'patient_name': booking.patient_name,
                'service': booking.service.name,
                'patient_type': booking.patient_type,
            },
            ip_address=client_ip
        )

        broadcast_event('request.created', {
            'id': str(booking.id),
            'request_code': booking.request_code,
            'patient_name': booking.patient_name,
            'service_name': booking.service.name,
            'channel': booking.channel,
            'patient_type': booking.patient_type,
            'date_of_birth': str(booking.date_of_birth) if booking.date_of_birth else None,
            'gender': booking.gender,
            'is_emergency': booking.is_emergency,
            'created_at': booking.created_at.isoformat(),
        })

        return Response({
            "id": str(booking.id),
            "request_id": booking.request_code,
            "request_code": booking.request_code,
            "status": booking.status,
            "patient_name": booking.patient_name,
            "patient_phone": booking.patient_phone,
            "patient_type": booking.patient_type,
            "date_of_birth": str(booking.date_of_birth) if booking.date_of_birth else None,
            "gender": booking.gender,
            "is_emergency": booking.is_emergency,
            "created_at": booking.created_at.isoformat(),
        }, status=status.HTTP_201_CREATED)

    def get(self, request):
        # FIFO Triage Queue ordered strictly by created_at ASC
        qs = BookingRequest.objects.all().select_related('service', 'preferred_doctor').prefetch_related('slot_offers').order_by('created_at')

        status_param = request.query_params.get('status')
        if status_param:
            statuses = [s.strip() for s in status_param.split(',') if s.strip()]
            qs = qs.filter(status__in=statuses)

        search_query = request.query_params.get('search', '').strip()
        if search_query:
            import re
            from django.db.models import Q
            from .serializers_booking import sanitize_phone_e164
            digits = re.sub(r'\D', '', search_query)
            q = Q(patient_name__icontains=search_query) | Q(request_code__icontains=search_query) | Q(patient_phone__icontains=search_query)
            if digits:
                core_digits = digits[1:] if digits.startswith('0') else (digits[3:] if digits.startswith('234') else digits)
                q |= Q(patient_phone__icontains=core_digits)
                if len(digits) >= 10:
                    sanitized = sanitize_phone_e164(search_query)
                    if sanitized:
                        q |= Q(patient_phone__icontains=sanitized)
            qs = qs.filter(q)

        serializer = BookingRequestDetailSerializer(qs, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class CheckSlotsView(APIView):
    """
    POST /api/v1/booking-requests/{id}/check-slots/
    Calculates candidate slots for a booking request using the AvailabilityEngine.
    Returns the top scored slots (within range or nearest alternatives).
    """
    permission_classes = [IsStaffAuthenticated]

    def post(self, request, id):
        booking = get_booking_or_404(id)
        engine = AvailabilityEngine()
        candidate_slots = engine.find_candidate_slots_for_request(booking, max_slots=3)

        return Response({
            "request_id": booking.request_code,
            "service": booking.service.name,
            "duration_minutes": booking.service.duration_minutes,
            "suggested_slots": candidate_slots,
            "candidate_slots": candidate_slots,
        }, status=status.HTTP_200_OK)


class DispatchOffersView(APIView):
    """
    POST /api/v1/booking-requests/{id}/dispatch-offers/
    Receptionist approves candidate/custom slots and initiates the 60-minute offer window.
    Creates SlotOffer records, transitions request to 'slots_offered', and generates
    the interactive Telegram inline keyboard / WhatsApp payload.
    """
    permission_classes = [IsStaffAuthenticated]

    @transaction.atomic
    def post(self, request, id):
        booking = get_booking_or_404(id, for_update=True)
        clinic = ClinicSetting.get_settings()

        offers_data = request.data.get('slots') or request.data.get('offers') or []
        created_offers = []

        now = timezone.now()
        expiry_minutes = clinic.offer_expiry_minutes or 60
        expires_at = now + datetime.timedelta(minutes=expiry_minutes)

        # Remove previous unselected offers for this request
        SlotOffer.objects.filter(request=booking, is_selected=False).delete()

        if offers_data:
            for s in offers_data:
                doctor_id = s.get('doctor_id')
                doctor = get_object_or_404(Doctor, id=doctor_id)
                try:
                    if not s.get('start_datetime') or not s.get('end_datetime'):
                        raise ValueError("start_datetime and end_datetime are required fields.")
                    start_dt = datetime.datetime.fromisoformat(s['start_datetime'])
                    end_dt = datetime.datetime.fromisoformat(s['end_datetime'])
                except (KeyError, ValueError, TypeError) as err:
                    return Response({
                        'error': 'INVALID_SLOT_PAYLOAD',
                        'detail': f'Malformed slot datetime payload: {err}'
                    }, status=status.HTTP_400_BAD_REQUEST)

                if timezone.is_naive(start_dt):
                    start_dt = timezone.make_aware(start_dt)
                if timezone.is_naive(end_dt):
                    end_dt = timezone.make_aware(end_dt)

                offer = SlotOffer.objects.create(
                    request=booking,
                    doctor=doctor,
                    start_datetime=start_dt,
                    end_datetime=end_dt,
                    is_alternative_date=s.get('is_alternative_date', False),
                    expires_at=expires_at,
                    is_selected=False,
                )
                created_offers.append(offer)
        else:
            # Fallback to automated engine calculation if none passed explicitly
            engine = AvailabilityEngine()
            candidate_slots = engine.find_candidate_slots_for_request(booking, max_slots=3)
            for s in candidate_slots:
                doctor = get_object_or_404(Doctor, id=s['doctor_id'])
                start_dt = datetime.datetime.fromisoformat(s['start_datetime'])
                end_dt = datetime.datetime.fromisoformat(s['end_datetime'])
                offer = SlotOffer.objects.create(
                    request=booking,
                    doctor=doctor,
                    start_datetime=start_dt,
                    end_datetime=end_dt,
                    is_alternative_date=s.get('is_alternative_date', False),
                    expires_at=expires_at,
                    is_selected=False,
                )
                created_offers.append(offer)

        booking.status = 'slots_offered'
        booking.offer_expires_at = expires_at
        booking.save(update_fields=['status', 'offer_expires_at', 'updated_at'])

        # Generate Telegram inline keyboard payload structure for n8n/bot dispatch
        inline_buttons = []
        for idx, offer in enumerate(created_offers, 1):
            btn_label = f"Option {idx}: {offer.start_datetime.strftime('%a, %d %b %I:%M %p')} ({offer.doctor.name})"
            inline_buttons.append([{
                "text": btn_label,
                "callback_data": f"select_slot_{offer.id}"
            }])

        telegram_payload = {
            "recipient_phone": booking.patient_phone,
            "message": (
                f"Hello {booking.patient_name}, Cedarcare Specialist Clinic has reviewed your request.\n"
                f"Please choose your preferred time for {booking.service.name} (valid for {expiry_minutes} mins):"
            ),
            "inline_keyboard": inline_buttons,
        }

        AuditLog.objects.create(
            entity_name='BookingRequest',
            entity_id=booking.id,
            action='SLOT_OFFERS_DISPATCHED',
            performed_by=request.user.email,
            changes={
                'offers_count': len(created_offers),
                'offer_expires_at': expires_at.isoformat(),
            },
            ip_address=request.META.get('REMOTE_ADDR')
        )

        broadcast_event('offer.dispatched', {
            'request_id': booking.request_code,
            'offers_count': len(created_offers),
            'offer_expires_at': expires_at.isoformat(),
        })

        # Auto-dispatch interactive buttons to patient on Telegram if request originated from Telegram
        custom_cfg = getattr(booking, 'custom_config', None) or {}
        chat_id = request.data.get('telegram_chat_id') or custom_cfg.get('telegram_chat_id')
        notes_text = getattr(booking, 'patient_notes', '') or ''
        if not chat_id and 'telegram_chat_id:' in notes_text:
            try:
                chat_id = notes_text.split('telegram_chat_id:')[1].split()[0].strip()
            except Exception:
                pass

        if chat_id:
            try:
                tg_text, tg_markup = TelegramService.format_slot_offers(booking, created_offers, clinic)
                TelegramService.send_message(chat_id, tg_text, tg_markup)
            except Exception:
                pass

        return Response({
            "detail": "Offers dispatched successfully.",
            "request_id": booking.request_code,
            "status": booking.status,
            "offer_expires_at": expires_at.isoformat(),
            "offers": SlotOfferSerializer(created_offers, many=True).data,
            "telegram_payload": telegram_payload,
        }, status=status.HTTP_200_OK)


class AskInfoView(APIView):
    """
    POST /api/v1/booking-requests/{id}/ask-info/
    Dispatches a clarification inquiry to the patient and logs the note to the request dossier.
    """
    permission_classes = [IsStaffAuthenticated]

    def post(self, request, id):
        booking = get_booking_or_404(id)
        message = request.data.get('message', '').strip()
        prompt_code = request.data.get('prompt_code', 'custom')

        if not message:
            return Response(
                {"error": "MESSAGE_REQUIRED", "detail": "Clarification message content is required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        now_str = timezone.now().strftime('%Y-%m-%d %H:%M')
        note_entry = f"[{now_str} Staff Inquiry ({prompt_code})]: {message}"
        if booking.patient_notes:
            booking.patient_notes = f"{booking.patient_notes}\n{note_entry}"
        else:
            booking.patient_notes = note_entry

        booking.save(update_fields=['patient_notes', 'updated_at'])

        AuditLog.objects.create(
            entity_name='BookingRequest',
            entity_id=booking.id,
            action='PATIENT_INQUIRY_DISPATCHED',
            performed_by=request.user.email,
            changes={'prompt_code': prompt_code, 'message': message},
            ip_address=request.META.get('REMOTE_ADDR')
        )

        return Response({
            "status": "dispatched",
            "detail": "Clarification prompt dispatched to patient channel.",
            "request_id": booking.request_code,
            "prompt_code": prompt_code,
            "patient_notes": booking.patient_notes,
        }, status=status.HTTP_200_OK)
