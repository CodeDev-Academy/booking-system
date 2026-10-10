"""
Appointment Lifecycle & Live Visit Management API Views.
Supports:
1. Two-phase hold & slot acquisition
2. Real-time visit progression (Confirmed -> Arrived -> In Consult -> Completed)
3. Follow-up task scheduling
4. Doctor sick leave reassignment & disruption alerts
"""

from rest_framework import status, viewsets
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from django.utils import timezone
from appointments.models import (
    Appointment,
    BookingRequest,
    SlotOffer,
    Doctor,
    Service,
    FollowUpTask,
    AuditLog,
)
from appointments.serializers import (
    AppointmentSerializer,
    FollowUpTaskSerializer,
)
from appointments.services.hold_service import HoldService
from appointments.services.disruption_service import DisruptionService


class AppointmentViewSet(viewsets.ModelViewSet):
    """
    CRUD and lifecycle transition actions for clinic appointments.
    """
    queryset = Appointment.objects.all().select_related(
        'doctor', 'service', 'booking_request'
    ).order_by('start_datetime')
    serializer_class = AppointmentSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        qs = super().get_queryset()
        date_str = self.request.query_params.get('date')
        if date_str:
            qs = qs.filter(start_datetime__date=date_str)
        
        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param)

        doctor_id = self.request.query_params.get('doctor_id')
        if doctor_id:
            qs = qs.filter(doctor_id=doctor_id)

        return qs

    @action(detail=False, methods=['post'], url_path='hold')
    def hold_slot(self, request):
        """
        POST /api/v1/appointments/hold/ or /api/v1/slots/hold/
        Patient selects a slot. Acquires atomic lock and sets 15-minute temporary hold.
        """
        request_id = request.data.get('request_id')
        slot_offer_id = request.data.get('slot_offer_id')
        force_confirm = request.data.get('force_confirm', False)
        actor = request.data.get('actor', 'Patient Selection')

        booking_req = None
        slot_offer = None

        if slot_offer_id:
            try:
                slot_offer = SlotOffer.objects.select_related('request', 'doctor', 'request__service').get(id=slot_offer_id)
                booking_req = slot_offer.request
                doctor = slot_offer.doctor
                service = booking_req.service
                start_dt = slot_offer.start_datetime
                end_dt = slot_offer.end_datetime
                patient_name = booking_req.patient_name
                patient_phone = booking_req.patient_phone
            except SlotOffer.DoesNotExist:
                return Response({'error': 'Offered slot not found.'}, status=status.HTTP_404_NOT_FOUND)
        elif request_id:
            try:
                booking_req = BookingRequest.objects.get(request_code=request_id)
            except BookingRequest.DoesNotExist:
                try:
                    booking_req = BookingRequest.objects.get(id=request_id)
                except BookingRequest.DoesNotExist:
                    return Response({'error': 'Booking request not found.'}, status=status.HTTP_404_NOT_FOUND)

            doctor_id = request.data.get('doctor_id') or (booking_req.preferred_doctor_id)
            doctor = Doctor.objects.get(id=doctor_id)
            service = booking_req.service
            start_dt = request.data.get('start_datetime')
            end_dt = request.data.get('end_datetime')
            patient_name = booking_req.patient_name
            patient_phone = booking_req.patient_phone
        else:
            doctor_id = request.data.get('doctor_id')
            service_id = request.data.get('service_id')
            doctor = Doctor.objects.get(id=doctor_id)
            service = Service.objects.get(id=service_id)
            start_dt = request.data.get('start_datetime')
            end_dt = request.data.get('end_datetime')
            patient_name = request.data.get('patient_name', 'Patient')
            patient_phone = request.data.get('patient_phone', '+2348000000000')

        hold_service = HoldService()
        result = hold_service.acquire_slot(
            doctor=doctor,
            service=service,
            start_datetime=start_dt,
            end_datetime=end_dt,
            patient_name=patient_name,
            patient_phone=patient_phone,
            booking_request=booking_req,
            slot_offer=slot_offer,
            force_confirm=force_confirm,
            actor=actor,
        )

        if not result['success']:
            return Response({
                'conflict': True,
                'message': result['message'],
                'alternative_slots': result.get('alternative_slots', []),
            }, status=status.HTTP_409_CONFLICT)

        appt = result['appointment']
        return Response({
            'appointment_id': appt.appointment_code,
            'status': appt.status,
            'hold_expires_at': appt.hold_expires_at.isoformat() if appt.hold_expires_at else None,
            'requires_deposit': service.deposit_required,
            'patient_name': appt.patient_name,
            'patient_phone': appt.patient_phone,
            'doctor_name': doctor.name,
            'start_datetime': appt.start_datetime.isoformat(),
        }, status=status.HTTP_201_CREATED if appt.status == 'confirmed' else status.HTTP_200_OK)

    @action(detail=True, methods=['patch', 'post'], url_path='status', url_name='status')
    def update_status(self, request, pk=None):
        """
        PATCH /api/v1/appointments/{id}/status/
        Advances appointment through live clinic states.
        """
        appointment = self.get_object()
        new_status = request.data.get('status')
        actor = request.data.get('receptionist_name', 'Front Desk Receptionist')
        cancellation_reason = request.data.get('cancellation_reason')

        if not new_status:
            return Response({'error': 'status is required.'}, status=status.HTTP_400_BAD_REQUEST)

        valid_statuses = dict(Appointment.STATUS_CHOICES).keys()
        if new_status not in valid_statuses:
            return Response({'error': f"Invalid status. Choices are: {list(valid_statuses)}"}, status=status.HTTP_400_BAD_REQUEST)

        now = timezone.now()
        appointment.status = new_status

        # Set milestone timestamps
        if new_status == 'confirmed' and not appointment.confirmed_at:
            appointment.confirmed_at = now
            appointment.hold_expires_at = None
        elif new_status == 'arrived':
            appointment.arrival_at = now
        elif new_status == 'completed':
            appointment.completed_at = now
        elif new_status == 'cancelled':
            appointment.cancelled_at = now
            if cancellation_reason:
                appointment.cancellation_reason = cancellation_reason

        appointment.save()

        AuditLog.objects.create(
            actor=actor,
            action=f"UPDATED_VISIT_STATUS_{new_status.upper()}",
            entity_name="Appointment",
            entity_id=str(appointment.id),
            changes={'status': new_status, 'patient_name': appointment.patient_name}
        )

        return Response(AppointmentSerializer(appointment).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='follow-up')
    def schedule_follow_up(self, request, pk=None):
        """
        POST /api/v1/appointments/{id}/follow-up/
        Schedules a clinical follow-up task.
        """
        appointment = self.get_object()
        follow_up_date = request.data.get('follow_up_date')
        notes = request.data.get('notes', '')
        actor = request.data.get('doctor_name', 'Consulting Doctor')

        if not follow_up_date:
            return Response({'error': 'follow_up_date is required.'}, status=status.HTTP_400_BAD_REQUEST)

        task = FollowUpTask.objects.create(
            appointment=appointment,
            doctor=appointment.doctor,
            follow_up_date=follow_up_date,
            notes=notes,
        )

        AuditLog.objects.create(
            actor=actor,
            action="SCHEDULED_FOLLOW_UP",
            entity_name="FollowUpTask",
            entity_id=str(task.id),
            changes={'follow_up_date': str(follow_up_date), 'patient_name': appointment.patient_name}
        )

        return Response(FollowUpTaskSerializer(task).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='reassign-leave')
    def reassign_leave(self, request, pk=None):
        """
        POST /api/v1/appointments/{id}/reassign-leave/
        1-Click colleague reassignment when doctor takes sick leave.
        """
        appointment = self.get_object()
        new_doctor_id = request.data.get('new_doctor_id')
        actor = request.data.get('receptionist_name', 'Front Desk Disruption Manager')

        if not new_doctor_id:
            return Response({'error': 'new_doctor_id is required.'}, status=status.HTTP_400_BAD_REQUEST)

        disruption_service = DisruptionService()
        result = disruption_service.reassign_appointment(
            appointment_id=str(appointment.id),
            new_doctor_id=str(new_doctor_id),
            actor=actor,
        )

        if not result['success']:
            return Response(result, status=status.HTTP_400_BAD_REQUEST)

        return Response(result, status=status.HTTP_200_OK)
