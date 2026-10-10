"""
Booking Requests & Receptionist Approval Workflow API Views.
Supports:
1. Ingesting requests from Web, Telegram, and WhatsApp
2. Receptionist queue with FIFO ordering and status filtering
3. check-slots calculation
4. dispatch-offers with 1-hour expiry timer
5. ask-info front-desk clarification prompts
"""

from datetime import timedelta
from rest_framework import status, viewsets
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from django.utils import timezone
from appointments.models import (
    BookingRequest,
    SlotOffer,
    Doctor,
    AuditLog,
)
from appointments.serializers import (
    BookingRequestSerializer,
    BookingRequestCreateSerializer,
    SlotOfferSerializer,
)
from appointments.services.availability import AvailabilityEngine


class BookingRequestViewSet(viewsets.ModelViewSet):
    """
    CRUD and workflow actions for patient booking requests.
    """
    queryset = BookingRequest.objects.all().select_related(
        'service', 'preferred_doctor', 'reviewed_by'
    ).prefetch_related('slot_offers').order_by('created_at')
    serializer_class = BookingRequestSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        qs = super().get_queryset()
        req_status = self.request.query_params.get('status')
        if req_status:
            qs = qs.filter(status=req_status)
        
        channel = self.request.query_params.get('channel')
        if channel:
            qs = qs.filter(channel=channel)
            
        return qs

    def create(self, request, *args, **kwargs):
        """
        POST /api/v1/booking-requests/
        Ingests web / messaging request and enqueues it for receptionist review.
        """
        serializer = BookingRequestCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        booking_request = serializer.save()

        AuditLog.objects.create(
            actor="Patient Intake",
            action="REQUEST_SUBMITTED",
            entity_name="BookingRequest",
            entity_id=str(booking_request.id),
            changes={
                'request_code': booking_request.request_code,
                'patient_name': booking_request.patient_name,
                'channel': booking_request.channel,
            }
        )

        output_serializer = BookingRequestSerializer(booking_request)
        return Response(output_serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post', 'get'], url_path='check-slots')
    def check_slots(self, request, pk=None):
        """
        POST/GET /api/v1/booking-requests/{id}/check-slots/
        Calculates eligible slot candidates without modifying DB state.
        """
        booking_request = self.get_object()
        allow_override = request.data.get('allow_emergency_override', False) or \
                         request.query_params.get('emergency_override') == 'true'

        engine = AvailabilityEngine()
        candidate_slots = engine.get_top_candidate_slots_for_request(
            booking_request=booking_request,
            limit=3,
            allow_emergency_override=allow_override,
        )

        # Format slots with display labels for receptionist UI
        formatted_slots = []
        for s in candidate_slots:
            formatted_slots.append({
                'doctor_id': s['doctor_id'],
                'doctor_name': s['doctor_name'],
                'specialty': s['specialty'],
                'start_datetime': s['start_datetime'],
                'end_datetime': s['end_datetime'],
                'score': s['score'],
                'is_alternative_date': s['is_alternative_date'],
            })

        return Response({
            'request_id': booking_request.request_code,
            'service': booking_request.service.name,
            'duration_minutes': booking_request.service.duration_minutes,
            'suggested_slots': formatted_slots,
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='dispatch-offers')
    def dispatch_offers(self, request, pk=None):
        """
        POST /api/v1/booking-requests/{id}/dispatch-offers/
        Receptionist approves selected slots and initiates the 60-minute offer window.
        """
        booking_request = self.get_object()
        slots_data = request.data.get('slots', [])
        actor = request.data.get('receptionist_name', 'Front Desk Receptionist')

        if not slots_data:
            # Fallback: auto-calculate top 3 slots if not manually passed
            engine = AvailabilityEngine()
            slots_data = engine.get_top_candidate_slots_for_request(booking_request, limit=3)

        now = timezone.now()
        offer_expires = now + timedelta(minutes=60)

        # Clear existing unselected offers for this request
        booking_request.slot_offers.filter(is_selected=False).delete()

        created_offers = []
        for s in slots_data:
            doctor_id = s.get('doctor_id')
            doctor = Doctor.objects.get(id=doctor_id) if doctor_id else booking_request.preferred_doctor

            from django.utils.dateparse import parse_datetime
            start_dt = s['start_datetime']
            if isinstance(start_dt, str):
                start_dt = parse_datetime(start_dt)
                if start_dt and timezone.is_naive(start_dt):
                    start_dt = timezone.make_aware(start_dt)

            end_dt = s['end_datetime']
            if isinstance(end_dt, str):
                end_dt = parse_datetime(end_dt)
                if end_dt and timezone.is_naive(end_dt):
                    end_dt = timezone.make_aware(end_dt)

            offer = SlotOffer.objects.create(
                request=booking_request,
                doctor=doctor,
                start_datetime=start_dt,
                end_datetime=end_dt,
                is_alternative_date=s.get('is_alternative_date', False),
                expires_at=offer_expires,
            )
            created_offers.append(offer)

        booking_request.status = 'slots_offered'
        booking_request.offer_expires_at = offer_expires
        booking_request.reviewed_at = now
        booking_request.save(update_fields=['status', 'offer_expires_at', 'reviewed_at', 'updated_at'])

        AuditLog.objects.create(
            actor=actor,
            action="DISPATCHED_SLOT_OFFERS",
            entity_name="BookingRequest",
            entity_id=str(booking_request.id),
            changes={
                'request_code': booking_request.request_code,
                'patient_name': booking_request.patient_name,
                'offered_count': len(created_offers),
                'expires_at': offer_expires.isoformat(),
            }
        )

        return Response({
            'request_id': booking_request.request_code,
            'status': 'slots_offered',
            'offered_at': now.isoformat(),
            'expires_at': offer_expires.isoformat(),
            'slots': SlotOfferSerializer(created_offers, many=True).data,
            'message': f"3 slot options dispatched to {booking_request.patient_name} with 1-hour expiry.",
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='ask-info')
    def ask_info(self, request, pk=None):
        """
        POST /api/v1/booking-requests/{id}/ask-info/
        Receptionist requests additional clinical details or clarification from the patient.
        """
        booking_request = self.get_object()
        prompt_text = request.data.get('prompt', 'Please provide additional clarification regarding your visit.')
        actor = request.data.get('receptionist_name', 'Front Desk Receptionist')

        AuditLog.objects.create(
            actor=actor,
            action="REQUESTED_MORE_INFO",
            entity_name="BookingRequest",
            entity_id=str(booking_request.id),
            changes={'patient_name': booking_request.patient_name, 'prompt': prompt_text}
        )

        return Response({
            'request_id': booking_request.request_code,
            'patient_name': booking_request.patient_name,
            'message_sent': prompt_text,
            'status': 'info_requested',
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='reject')
    def reject(self, request, pk=None):
        """
        POST /api/v1/booking-requests/{id}/reject/
        Receptionist declines the request with an explanation.
        """
        booking_request = self.get_object()
        reason = request.data.get('reason', 'Schedule currently at full capacity.')
        actor = request.data.get('receptionist_name', 'Front Desk Receptionist')

        booking_request.status = 'rejected'
        booking_request.rejection_reason = reason
        booking_request.save(update_fields=['status', 'rejection_reason', 'updated_at'])

        AuditLog.objects.create(
            actor=actor,
            action="REJECTED_REQUEST",
            entity_name="BookingRequest",
            entity_id=str(booking_request.id),
            changes={'reason': reason}
        )

        return Response({
            'request_id': booking_request.request_code,
            'status': 'rejected',
            'rejection_reason': reason,
        }, status=status.HTTP_200_OK)
