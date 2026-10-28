import csv
import uuid
import datetime
from django.utils import timezone
from django.shortcuts import get_object_or_404
from django.http import HttpResponse
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny

from .models import Appointment, Doctor, FollowUpTask, AuditLog, ClinicSetting
from .permissions import IsStaffAuthenticated
from .services.hold_service import HoldService, SlotConflictException
from .services.disruption_service import DisruptionService
from .services.sse_bus import broadcast_event
from .serializers_appointment import (
    SlotHoldRequestSerializer,
    AppointmentStatusUpdateSerializer,
    FollowUpTaskCreateSerializer,
    AppointmentDetailSerializer,
    FollowUpTaskDetailSerializer,
)


def get_appointment_or_404(identifier):
    """
    Retrieves Appointment by UUID primary key or human-readable appointment_code (AP-XXXX).
    """
    try:
        val = uuid.UUID(str(identifier))
        return get_object_or_404(Appointment, id=val)
    except (ValueError, AttributeError):
        return get_object_or_404(Appointment, appointment_code=identifier)


class SlotHoldView(APIView):
    """
    POST /api/v1/slots/hold/ & /api/v1/appointments/hold/
    Acquires an atomic temporary 15-minute hold on a clinical slot with row-level locks.
    Prevents race conditions and double-booking.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = SlotHoldRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data

        performer = 'patient'
        if request.user and getattr(request.user, 'is_authenticated', False):
            performer = getattr(request.user, 'email', 'staff')

        is_walk_in = validated.get('is_walk_in', False)
        is_instant = validated.get('is_instant_confirm', False)

        try:
            appointment = HoldService.acquire_slot(
                doctor_id=validated['doctor_obj'].id,
                service_id=validated['service_obj'].id,
                start_datetime=validated['start_dt'],
                end_datetime=validated['end_dt'],
                patient_name=validated['name'],
                patient_phone=validated['phone'],
                booking_request_id=validated['booking_req'].id if validated.get('booking_req') else None,
                is_hold=not (is_instant or is_walk_in),
                initial_status='arrived' if is_walk_in else None,
                performed_by=performer,
                date_of_birth=validated.get('dob'),
                gender=validated.get('gender', ''),
                is_emergency=validated.get('is_emergency', False),
            )
        except SlotConflictException as e:
            return Response({
                "error": "SLOT_CONFLICT",
                "detail": str(e),
                "conflicting_appointment": getattr(e.conflicting_appointment, 'appointment_code', None)
            }, status=status.HTTP_409_CONFLICT)

        # Mark slot offer as selected if applicable
        if 'slot_offer_obj' in validated:
            offer = validated['slot_offer_obj']
            offer.is_selected = True
            offer.save(update_fields=['is_selected'])

        broadcast_event('slot.held', {
            'appointment_id': str(appointment.id),
            'appointment_code': appointment.appointment_code,
            'doctor_id': str(appointment.doctor.id),
            'start_datetime': appointment.start_datetime.isoformat(),
            'end_datetime': appointment.end_datetime.isoformat(),
            'status': appointment.status,
            'hold_expires_at': appointment.hold_expires_at.isoformat() if appointment.hold_expires_at else None,
        })

        return Response({
            "appointment_id": str(appointment.id),
            "appointment_code": appointment.appointment_code,
            "status": appointment.status,
            "hold_expires_at": appointment.hold_expires_at.isoformat() if appointment.hold_expires_at else None,
            "requires_deposit": appointment.service.deposit_required,
            "appointment": AppointmentDetailSerializer(appointment).data,
        }, status=status.HTTP_200_OK)


class AppointmentStatusUpdateView(APIView):
    """
    PATCH /api/v1/appointments/{id}/status/ & POST /api/v1/appointments/{id}/status/
    Transitions visit lifecycle status: confirmed -> arrived -> in_consultation -> completed / no_show.
    Sets exact wall-clock audit timestamps.
    """
    permission_classes = [IsStaffAuthenticated]

    def _update_status(self, request, id):
        appointment = get_appointment_or_404(id)
        serializer = AppointmentStatusUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        new_status = serializer.validated_data['status']
        cancellation_reason = serializer.validated_data.get('cancellation_reason', '')
        old_status = appointment.status
        now = timezone.now()

        appointment.status = new_status
        update_fields = ['status', 'updated_at']

        if new_status == 'arrived' and not appointment.arrival_at:
            appointment.arrival_at = now
            update_fields.append('arrival_at')
        elif new_status == 'completed' and not appointment.completed_at:
            appointment.completed_at = now
            update_fields.append('completed_at')
        elif new_status == 'cancelled':
            appointment.cancelled_at = now
            appointment.cancellation_reason = cancellation_reason
            update_fields.extend(['cancelled_at', 'cancellation_reason'])

        appointment.save(update_fields=update_fields)

        if new_status in ('confirmed', 'arrived', 'in_consultation', 'completed'):
            if appointment.booking_request and appointment.booking_request.status != 'converted':
                appointment.booking_request.status = 'converted'
                appointment.booking_request.save(update_fields=['status', 'updated_at'])

        AuditLog.objects.create(
            entity_name='Appointment',
            entity_id=appointment.id,
            action='APPOINTMENT_STATUS_CHANGED',
            performed_by=request.user.email,
            changes={
                'appointment_code': appointment.appointment_code,
                'from_status': old_status,
                'to_status': new_status,
                'cancellation_reason': cancellation_reason or None,
            },
            ip_address=request.META.get('REMOTE_ADDR')
        )

        broadcast_event('appointment.status_changed', {
            'appointment_id': str(appointment.id),
            'appointment_code': appointment.appointment_code,
            'from_status': old_status,
            'to_status': new_status,
            'timestamp': now.isoformat(),
        })

        return Response(AppointmentDetailSerializer(appointment).data, status=status.HTTP_200_OK)

    def patch(self, request, id):
        return self._update_status(request, id)

    def post(self, request, id):
        return self._update_status(request, id)


class FollowUpTaskCreateView(APIView):
    """
    POST /api/v1/appointments/{id}/follow-up/
    Creates a doctor-directed recall task linked to the appointment and treating clinician.
    """
    permission_classes = [IsStaffAuthenticated]

    def post(self, request, id):
        appointment = get_appointment_or_404(id)
        serializer = FollowUpTaskCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        task = FollowUpTask.objects.create(
            appointment=appointment,
            doctor=appointment.doctor,
            follow_up_date=serializer.validated_data['follow_up_date'],
            notes=serializer.validated_data['notes'],
        )

        AuditLog.objects.create(
            entity_name='FollowUpTask',
            entity_id=task.id,
            action='FOLLOW_UP_TASK_SCHEDULED',
            performed_by=request.user.email,
            changes={
                'appointment_code': appointment.appointment_code,
                'follow_up_date': str(task.follow_up_date),
                'notes': task.notes,
            },
            ip_address=request.META.get('REMOTE_ADDR')
        )

        return Response(FollowUpTaskDetailSerializer(task).data, status=status.HTTP_201_CREATED)


class ReassignLeaveView(APIView):
    """
    POST /api/v1/appointments/{id}/reassign-leave/
    1-Click Colleague Reassignment when a treating doctor takes emergency sick leave.
    """
    permission_classes = [IsStaffAuthenticated]

    def post(self, request, id):
        appointment = get_appointment_or_404(id)
        new_doctor_id = request.data.get('new_doctor_id')
        if not new_doctor_id:
            return Response({'error': 'new_doctor_id is required.'}, status=status.HTTP_400_BAD_REQUEST)

        updated_appt = DisruptionService.reassign_to_colleague(
            appointment_id=appointment.id,
            new_doctor_id=new_doctor_id,
            performed_by=request.user.email
        )

        return Response(AppointmentDetailSerializer(updated_appt).data, status=status.HTTP_200_OK)


class RescheduleAppointmentView(APIView):
    """
    POST /api/v1/appointments/{id}/reschedule/
    Reschedules appointment to a new safe slot and doctor.
    """
    permission_classes = [IsStaffAuthenticated]

    def post(self, request, id):
        appointment = get_appointment_or_404(id)
        new_start = request.data.get('start_datetime') or request.data.get('start')
        new_end = request.data.get('end_datetime') or request.data.get('end')
        new_doctor_id = request.data.get('doctor_id') or request.data.get('doctor')

        if new_doctor_id:
            try:
                appointment.doctor = Doctor.objects.get(id=new_doctor_id)
            except (Doctor.DoesNotExist, ValueError):
                doc = Doctor.objects.filter(name__icontains=str(new_doctor_id)).first()
                if doc:
                    appointment.doctor = doc

        if new_start:
            import datetime
            if isinstance(new_start, str):
                cleaned_start = new_start.replace('Z', '+00:00')
                appointment.start_datetime = datetime.datetime.fromisoformat(cleaned_start)
        if new_end:
            import datetime
            if isinstance(new_end, str):
                cleaned_end = new_end.replace('Z', '+00:00')
                appointment.end_datetime = datetime.datetime.fromisoformat(cleaned_end)

        appointment.save()

        AuditLog.objects.create(
            entity_name='Appointment',
            entity_id=appointment.id,
            action='APPOINTMENT_RESCHEDULED',
            performed_by=request.user.email,
            changes={
                'appointment_code': appointment.appointment_code,
                'doctor': str(appointment.doctor),
                'start_datetime': appointment.start_datetime.isoformat(),
            },
            ip_address=request.META.get('REMOTE_ADDR')
        )

        return Response(AppointmentDetailSerializer(appointment).data, status=status.HTTP_200_OK)


class AppointmentActionView(APIView):
    """
    POST /api/v1/appointments/{id}/{action}/ (check-in, consult, complete, no-show)
    """
    permission_classes = [IsStaffAuthenticated]

    ACTION_MAP = {
        'check-in': 'arrived',
        'checkin': 'arrived',
        'consult': 'in_consultation',
        'complete': 'completed',
        'no-show': 'no_show',
        'noshow': 'no_show',
    }

    def post(self, request, id, action):
        target_status = self.ACTION_MAP.get(action.lower())
        if not target_status:
            return Response({'error': f'Invalid action: {action}'}, status=status.HTTP_400_BAD_REQUEST)

        data = request.data.copy() if hasattr(request.data, 'copy') else dict(request.data)
        data['status'] = target_status
        request._full_data = data
        return AppointmentStatusUpdateView()._update_status(request, id)


class WalkInRegistrationView(APIView):
    """
    POST /api/v1/appointments/walk-in/ or /api/appointments/walk-in/
    Immediate reception walk-in registration.
    """
    permission_classes = [IsStaffAuthenticated]

    def post(self, request):
        data = request.data.copy() if hasattr(request.data, 'copy') else dict(request.data)
        data['is_walk_in'] = True
        request._full_data = data
        return SlotHoldView().post(request)


class AppointmentListView(APIView):
    """
    GET /api/v1/appointments/ and /api/v1/appointments/today/
    Returns active appointments for Kanban swimlanes or historical clinical archive.
    Supports ?date=YYYY-MM-DD, ?start_date=, ?end_date=, ?status=, and flexible Nigerian phone/name search (?search=).
    """
    permission_classes = [IsStaffAuthenticated]

    def get(self, request):
        qs = Appointment.objects.all().select_related('doctor', 'service', 'booking_request').order_by('start_datetime')

        date_param = request.query_params.get('date')
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        search_query = request.query_params.get('search', '').strip()
        status_filter = request.query_params.get('status')
        doctor_id = request.query_params.get('doctor_id')

        # Date Filtering Logic
        if date_param:
            if date_param.lower() != 'all':
                qs = qs.filter(start_datetime__date=date_param)
        elif start_date and end_date:
            qs = qs.filter(start_datetime__date__range=[start_date, end_date])
        elif start_date:
            qs = qs.filter(start_datetime__date__gte=start_date)
        elif end_date:
            qs = qs.filter(start_datetime__date__lte=end_date)
        elif not search_query:
            # Default to today if neither date nor search query is specified
            today = timezone.localdate()
            qs = qs.filter(start_datetime__date=today)

        if status_filter:
            statuses = [s.strip() for s in status_filter.split(',') if s.strip()]
            qs = qs.filter(status__in=statuses)

        if doctor_id:
            qs = qs.filter(doctor_id=doctor_id)

        if search_query:
            import re
            from django.db.models import Q
            from .serializers_booking import sanitize_phone_e164
            digits = re.sub(r'\D', '', search_query)
            q = Q(patient_name__icontains=search_query) | Q(appointment_code__icontains=search_query) | Q(patient_phone__icontains=search_query)
            if digits:
                core_digits = digits[1:] if digits.startswith('0') else (digits[3:] if digits.startswith('234') else digits)
                q |= Q(patient_phone__icontains=core_digits)
                if len(digits) >= 10:
                    sanitized = sanitize_phone_e164(search_query)
                    if sanitized:
                        q |= Q(patient_phone__icontains=sanitized)
            qs = qs.filter(q)

        serializer = AppointmentDetailSerializer(qs, many=True)

        if request.query_params.get('include_workload') == 'true' or request.query_params.get('workload') == 'true':
            import datetime
            now = timezone.now()
            today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
            today_end = today_start + datetime.timedelta(days=1)
            week_end = today_start + datetime.timedelta(days=7)
            two_weeks_end = today_start + datetime.timedelta(days=14)
            valid_statuses = ['held', 'confirmed', 'arrived', 'in_consultation', 'completed']

            base_workload_qs = Appointment.objects.filter(status__in=valid_statuses)
            if doctor_id:
                base_workload_qs = base_workload_qs.filter(doctor_id=doctor_id)

            workload_data = {
                'today_count': base_workload_qs.filter(start_datetime__gte=today_start, start_datetime__lt=today_end).count(),
                'week_count': base_workload_qs.filter(start_datetime__gte=today_start, start_datetime__lt=week_end).count(),
                'two_weeks_count': base_workload_qs.filter(start_datetime__gte=today_start, start_datetime__lt=two_weeks_end).count(),
            }
            return Response({
                'appointments': serializer.data,
                'workload': workload_data,
                'today_count': workload_data['today_count'],
                'week_count': workload_data['week_count'],
                'two_weeks_count': workload_data['two_weeks_count'],
            }, status=status.HTTP_200_OK)

        return Response(serializer.data, status=status.HTTP_200_OK)


TodayAppointmentsView = AppointmentListView


class ExportAppointmentsCSVView(APIView):
    """
    GET /api/v1/admin/export/appointments/
    Restricted CSV download of appointment records conforming to RFC 4180.
    """
    permission_classes = [IsStaffAuthenticated]

    def get(self, request):
        response = HttpResponse(content_type='text/csv')
        today_str = timezone.localdate().isoformat()
        response['Content-Disposition'] = f'attachment; filename="appointments_{today_str}.csv"'

        writer = csv.writer(response)
        writer.writerow([
            'Appointment Code',
            'Patient Name',
            'Patient Phone',
            'Doctor',
            'Doctor Specialty',
            'Service',
            'Start Time',
            'End Time',
            'Status',
            'Hold Expiry',
            'Confirmed At',
            'Arrival At',
            'Completed At',
            'Cancelled At',
            'Cancellation Reason',
        ])

        appts = Appointment.objects.select_related('doctor', 'service').order_by('-start_datetime')
        for a in appts:
            writer.writerow([
                a.appointment_code,
                a.patient_name,
                a.patient_phone,
                a.doctor.name,
                a.doctor.specialty,
                a.service.name,
                a.start_datetime.isoformat() if a.start_datetime else '',
                a.end_datetime.isoformat() if a.end_datetime else '',
                a.status,
                a.hold_expires_at.isoformat() if a.hold_expires_at else '',
                a.confirmed_at.isoformat() if a.confirmed_at else '',
                a.arrival_at.isoformat() if a.arrival_at else '',
                a.completed_at.isoformat() if a.completed_at else '',
                a.cancelled_at.isoformat() if a.cancelled_at else '',
                a.cancellation_reason,
            ])

        return response


class ExportAttendanceCSVView(APIView):
    """
    GET /api/v1/admin/export/attendance/
    Restricted CSV download summarizing doctor attendance and completion metrics.
    """
    permission_classes = [IsStaffAuthenticated]

    def get(self, request):
        response = HttpResponse(content_type='text/csv')
        today_str = timezone.localdate().isoformat()
        response['Content-Disposition'] = f'attachment; filename="attendance_{today_str}.csv"'

        writer = csv.writer(response)
        writer.writerow([
            'Doctor Name',
            'Specialty',
            'Total Appointments',
            'Completed',
            'No Shows',
            'Cancelled',
            'Attendance Rate (%)',
        ])

        doctors = Doctor.objects.all().order_by('name')
        for doc in doctors:
            doc_appts = Appointment.objects.filter(doctor=doc)
            total = doc_appts.count()
            completed = doc_appts.filter(status='completed').count()
            no_shows = doc_appts.filter(status='no_show').count()
            cancelled = doc_appts.filter(status='cancelled').count()
            denom = completed + no_shows
            rate = round((completed / denom) * 100, 1) if denom > 0 else 100.0

            writer.writerow([
                doc.name,
                doc.specialty,
                total,
                completed,
                no_shows,
                cancelled,
                f"{rate}%",
            ])

        return response


class UpcomingRemindersView(APIView):
    """
    GET /api/v1/appointments/upcoming-reminders/
    Returns appointments due for 24h pre-visit reminders and pending doctor follow-up tasks.
    Secured by staff authentication or X-Webhook-Secret header.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        clinic = ClinicSetting.get_settings()
        secret_header = request.headers.get('X-Webhook-Secret') or request.META.get('HTTP_X_WEBHOOK_SECRET')
        is_staff = request.user and getattr(request.user, 'is_authenticated', False) and getattr(request.user, 'is_active', False)

        if not is_staff:
            expected_secret = getattr(clinic, 'webhook_secret', None) or 'clinic_dev_secret_2026'
            if not secret_header or secret_header != expected_secret:
                return Response({'error': 'UNAUTHORIZED', 'detail': 'Valid staff credentials or X-Webhook-Secret required.'}, status=status.HTTP_401_UNAUTHORIZED)

        now = timezone.now()
        try:
            window_days = int(request.query_params.get('window_days', 14))
        except (ValueError, TypeError):
            window_days = 14

        end_window = now + datetime.timedelta(days=window_days)

        upcoming_appts = Appointment.objects.filter(
            status__in=['confirmed', 'held'],
            start_datetime__range=(now, end_window),
        ).select_related('doctor', 'service').order_by('start_datetime')

        reminders_list = []
        for appt in upcoming_appts:
            reminders_list.append({
                'appointment_id': appt.appointment_code,
                'patient_name': appt.patient_name,
                'patient_phone': appt.patient_phone,
                'telegram_chat_id': appt.patient_phone,
                'doctor_name': appt.doctor.name,
                'service_name': appt.service.name,
                'start_datetime': appt.start_datetime.isoformat(),
                'time_display': appt.start_datetime.strftime('%I:%M %p'),
                'date_display': appt.start_datetime.strftime('%A, %b %d'),
            })

        follow_up_tasks = FollowUpTask.objects.filter(
            is_completed=False,
            reminder_sent=False,
        ).select_related('appointment', 'doctor')

        follow_ups_list = []
        for task in follow_up_tasks:
            follow_ups_list.append({
                'id': str(task.id),
                'appointment_id': task.appointment.appointment_code,
                'patient_name': task.appointment.patient_name,
                'patient_phone': task.appointment.patient_phone,
                'doctor_name': task.doctor.name,
                'notes': task.notes,
                'follow_up_date': str(task.follow_up_date),
            })

        return Response({
            'reminders': reminders_list,
            'follow_ups': follow_ups_list,
            'count': len(reminders_list) + len(follow_ups_list),
        }, status=status.HTTP_200_OK)
