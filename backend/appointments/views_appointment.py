import csv
import os
import re
import uuid
import datetime
from django.db import transaction
from django.utils import timezone
from django.shortcuts import get_object_or_404
from django.http import HttpResponse
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny

from .models import Appointment, Doctor, FollowUpTask, AuditLog, ClinicSetting, DisruptionBatch
from .permissions import IsStaffAuthenticated
from .services.hold_service import HoldService, SlotConflictException
from .services.slot_rules import validate_clinic_slot
from .services.slot_selection import select_slot_offer
from .services.disruption_service import DisruptionService, DisruptionUndoError, DisruptionRefusal
from .services.conflict_service import ConflictService
from .services.dispatch_service import fire_and_forget_webhook
from .services.webhook_security import has_staff_or_webhook_access, resolve_webhook_secret, verify_webhook_secret
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


def read_distribution_choice(request):
    """
    Step 2: read the receptionist's distribution choice from the request body.

    Both resolver endpoints use this, so preview and approve always read the
    same fields. Absent fields mean "any available colleague, no caps" — the
    original behaviour — which keeps older clients working.
    """
    colleague_ids = request.data.get('colleague_ids')
    colleague_caps = request.data.get('colleague_caps')

    if colleague_ids is not None:
        if not isinstance(colleague_ids, list):
            raise ValueError('colleague_ids must be a list of doctor ids.')
        colleague_ids = [str(value) for value in colleague_ids]

    if colleague_caps is not None:
        if not isinstance(colleague_caps, dict):
            raise ValueError('colleague_caps must map a doctor id to a whole number.')
        colleague_caps = {str(key): value for key, value in colleague_caps.items()}

    return colleague_ids, colleague_caps


class SlotHoldView(APIView):
    """
    POST /api/v1/slots/hold/ & /api/v1/appointments/hold/
    Acquires an atomic temporary 15-minute hold on a clinical slot with row-level locks.
    Prevents race conditions and double-booking.

    Security (Phase 1 / Task 1.1): requires an authenticated active staff member
    (dashboard / walk-in desk) OR a valid `X-Webhook-Secret` header (n8n Dispatcher
    proxying a patient's slot selection). Anonymous requests without the secret are
    rejected with 401 before any database work.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        if not has_staff_or_webhook_access(request):
            return Response(
                {'error': 'UNAUTHORIZED', 'detail': 'Valid staff credentials or X-Webhook-Secret required.'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        serializer = SlotHoldRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data

        performer = 'patient'
        if request.user and getattr(request.user, 'is_authenticated', False):
            performer = getattr(request.user, 'email', 'staff')

        is_walk_in = validated.get('is_walk_in', False)
        is_instant = validated.get('is_instant_confirm', False)

        # Cross-channel neutralization: if the patient's request already has an active
        # hold or confirmation (e.g. they replied on WhatsApp after answering SMS),
        # answer with a friendly, idempotent 200 instead of a scary 409 — n8n sends the
        # "already confirmed" message with the existing reference. No state changes here.
        # Note: patient replies create 15-minute HOLDS (the request only becomes
        # 'converted' at confirmation), so the active-hold check is the real signal.
        # Expired holds do NOT match — the patient legitimately gets a fresh chance.
        # Workflow C / C.1: this core is shared with the patient-reply webhook.
        offer = validated.get('slot_offer_obj')
        if offer:
            outcome, appointment = select_slot_offer(offer, performer=performer)
            if outcome == 'already_confirmed':
                return Response({
                    "error": "ALREADY_CONFIRMED",
                    "already_confirmed": True,
                    "detail": "This request was already selected. No action needed.",
                    "appointment_code": appointment.appointment_code if appointment else None,
                }, status=status.HTTP_200_OK)
        else:
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
                    is_walk_in=is_walk_in,
                )
            except SlotConflictException as e:
                return Response({
                    "error": getattr(e, 'code', 'SLOT_CONFLICT'),
                    "detail": str(e),
                    "conflicting_appointment": getattr(e.conflicting_appointment, 'appointment_code', None)
                }, status=status.HTTP_409_CONFLICT)

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

        # Wave 2 / Step 2.3: only an edge the lifecycle actually has. The old
        # endpoint accepted any listed status, so a completed visit could be
        # dragged back to 'arrived' and a cancelled one resurrected, with the
        # audit log recording the impossible history as if it happened.
        if new_status not in appointment.allowed_status_targets():
            return Response({
                'error': 'INVALID_TRANSITION',
                'detail': (
                    f"A {old_status} appointment cannot move to '{new_status}'."
                ),
                'current_status': old_status,
            }, status=status.HTTP_409_CONFLICT)

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

        updated_appt = None
        try:
            updated_appt = DisruptionService.reassign_to_colleague(
                appointment_id=appointment.id,
                new_doctor_id=new_doctor_id,
                performed_by=request.user.email
            )
        except DisruptionRefusal as e:
            # A colleague who does not offer the patient's service is refused
            # before anything is saved, with Django's sentence for it.
            return Response({
                'error': e.code,
                'detail': e.text,
            }, status=status.HTTP_409_CONFLICT)
        except SlotConflictException as e:
            # Phase 2.5: a colleague whose calendar clashes (or who is on
            # leave) is a 409, not a silent double-booking on their calendar.
            return Response({
                'error': 'SLOT_CONFLICT',
                'detail': str(e),
                'conflicting_appointment': getattr(e.conflicting_appointment, 'appointment_code', None),
            }, status=status.HTTP_409_CONFLICT)
        except Doctor.DoesNotExist:
            return Response(
                {'error': 'DOCTOR_NOT_FOUND', 'detail': 'No doctor matches new_doctor_id.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(AppointmentDetailSerializer(updated_appt).data, status=status.HTTP_200_OK)


class DisruptionPreviewView(APIView):
    """
    POST /api/v1/disruptions/{doctor_id}/preview/
    Step 1 — dry run before the receptionist commits to a leave plan.

    Runs the REAL resolver inside a transaction that is always rolled back, so
    the report is exactly what the approve button would produce: per-patient
    placement, same-day/next-day counts and who cannot be placed. Nothing is
    moved, nothing is queued, no webhook fires. Long ranges are allowed but the
    approve run re-validates every move under its own locks.
    """
    permission_classes = [IsStaffAuthenticated]

    def post(self, request, doctor_id):
        reason = request.data.get('reason') or 'Planned Leave'

        def parse_dt(value, field):
            if not value:
                return None
            try:
                parsed = datetime.datetime.fromisoformat(str(value).replace('Z', '+00:00'))
            except (ValueError, TypeError):
                raise ValueError(field)
            if timezone.is_naive(parsed):
                parsed = timezone.make_aware(parsed)
            return parsed

        try:
            leave_start = parse_dt(request.data.get('leave_start'), 'leave_start')
            leave_end = parse_dt(request.data.get('leave_end'), 'leave_end')
        except ValueError as field_err:
            return Response(
                {'error': 'INVALID_DATETIME', 'detail': f'Unparseable {field_err} value.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not leave_start or not leave_end or leave_end < leave_start:
            return Response(
                {'error': 'INVALID_WINDOW', 'detail': 'leave_start and leave_end must form a valid window.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            colleague_ids, colleague_caps = read_distribution_choice(request)
        except ValueError as distribution_err:
            return Response(
                {'error': 'INVALID_DISTRIBUTION', 'detail': str(distribution_err)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            report = DisruptionService.preview_disruption(
                doctor_id=doctor_id,
                leave_start_dt=leave_start,
                leave_end_dt=leave_end,
                reason=reason,
                performed_by=request.user.email,
                colleague_ids=colleague_ids,
                colleague_caps=colleague_caps,
            )
        except Doctor.DoesNotExist:
            return Response(
                {'error': 'DOCTOR_NOT_FOUND', 'detail': 'No doctor matches this id.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        except ValueError as distribution_err:
            return Response(
                {'error': 'INVALID_DISTRIBUTION', 'detail': str(distribution_err)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        report['delivery_pushed'] = False
        return Response(report, status=status.HTTP_200_OK)


class DisruptionAutoResolveView(APIView):
    """
    POST /api/v1/disruptions/{doctor_id}/auto-resolve/
    Item B.2 — the ONE-CLICK emergency leave resolution. Declares the leave,
    places EVERY impacted patient in priority order (same-time colleague →
    same-day free slot → next day) under the zero-double-booking guarantees,
    queues WhatsApp + SMS notices with Django's words, then fire-and-forget
    pushes the queued items to n8n Workflow 08 (env-driven
    N8N_DISRUPTION_WEBHOOK_URL, authenticated with the shared webhook secret).
    An unset URL is fail-safe: nothing fires, the queued items are never lost.
    """
    permission_classes = [IsStaffAuthenticated]

    def post(self, request, doctor_id):
        reason = request.data.get('reason') or 'Emergency Leave'

        def parse_dt(value, field):
            if not value:
                return None
            try:
                parsed = datetime.datetime.fromisoformat(str(value).replace('Z', '+00:00'))
            except (ValueError, TypeError):
                raise ValueError(field)
            if timezone.is_naive(parsed):
                parsed = timezone.make_aware(parsed)
            return parsed

        try:
            leave_start = parse_dt(request.data.get('leave_start'), 'leave_start')
            leave_end = parse_dt(request.data.get('leave_end'), 'leave_end')
        except ValueError as field_err:
            return Response(
                {'error': 'INVALID_DATETIME', 'detail': f'Unparseable {field_err} value.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            colleague_ids, colleague_caps = read_distribution_choice(request)
        except ValueError as distribution_err:
            return Response(
                {'error': 'INVALID_DISTRIBUTION', 'detail': str(distribution_err)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            report = DisruptionService.auto_resolve_disruption(
                doctor_id=doctor_id,
                leave_start_dt=leave_start,
                leave_end_dt=leave_end,
                reason=reason,
                performed_by=request.user.email,
                colleague_ids=colleague_ids,
                colleague_caps=colleague_caps,
            )
        except Doctor.DoesNotExist:
            return Response(
                {'error': 'DOCTOR_NOT_FOUND', 'detail': 'No doctor matches this id.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        except ValueError as distribution_err:
            return Response(
                {'error': 'INVALID_DISTRIBUTION', 'detail': str(distribution_err)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        items = [message for result in report['results'] for message in result['messages']]
        report['delivery_pushed'] = False

        def _post_commit_push():
            n8n_url = os.environ.get('N8N_DISRUPTION_WEBHOOK_URL')
            if not n8n_url or not items:
                # Fail-safe: no configured workflow (or nothing to send) — the
                # queued claim rows remain the record; the operator can wire
                # delivery without losing a patient.
                return
            # Resolve the secret here (request thread) so the daemon thread
            # stays database-free — same posture as dispatch-offers.
            fire_and_forget_webhook(
                n8n_url,
                {
                    'doctor_id': report['doctor_id'],
                    'doctor_name': report['doctor_name'],
                    'reason': reason,
                    'clinic_name': ClinicSetting.get_settings().clinic_name,
                    'items': items,
                },
                secret=resolve_webhook_secret(),
            )

        transaction.on_commit(_post_commit_push)
        report['delivery_pushed'] = bool(items) and bool(os.environ.get('N8N_DISRUPTION_WEBHOOK_URL'))

        return Response(report, status=status.HTTP_200_OK)


class DisruptionStrandedView(APIView):
    """
    GET /api/v1/disruptions/stranded/
    Step 3 — every patient still booked under a doctor who is on leave,
    grouped by day, with Django's reason when a plan could not place them.
    """
    permission_classes = [IsStaffAuthenticated]

    def get(self, request):
        return Response(DisruptionService.list_stranded(), status=status.HTTP_200_OK)


class DisruptionLastBatchView(APIView):
    """
    GET /api/v1/disruptions/batches/last/
    Fix 1 — the plan behind the undo strip. The batch is durable; this is how
    a refreshed tab (or a second receptionist) gets the safety net back.
    """
    permission_classes = [IsStaffAuthenticated]

    def get(self, request):
        return Response(
            {'batch': DisruptionService.latest_batch()},
            status=status.HTTP_200_OK,
        )


class DisruptionBatchUndoView(APIView):
    """
    POST /api/v1/disruptions/batches/{batch_id}/undo/
    Step 3 — put the last approved distribution back, while nothing has
    reached a patient and no later plan covers the same days.
    """
    permission_classes = [IsStaffAuthenticated]

    def post(self, request, batch_id):
        performed_by = getattr(request.user, 'email', '') or 'receptionist'
        try:
            result = DisruptionService.undo_disruption_batch(
                batch_id=batch_id, performed_by=performed_by
            )
        except DisruptionBatch.DoesNotExist:
            return Response(
                {'error': 'BATCH_NOT_FOUND', 'detail': 'No distribution matches this id.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        except DisruptionUndoError as exc:
            return Response(
                {'error': exc.code, 'detail': exc.text},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(result, status=status.HTTP_200_OK)


class DisruptionClaimCheckView(APIView):
    """
    POST /api/v1/webhooks/disruption-claims/check/

    Gap 3 — workflow 08 asks Django, immediately before any send, whether the
    notices it is about to deliver are still live. `queued` is not a promise:
    an undo can withdraw a notice while the workflow runs, and a withdrawn
    notice must never reach a patient.

    Auth: `X-Webhook-Secret` only (machine-to-machine, same verifier as every
    other webhook). Never staff JWT.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        if not verify_webhook_secret(request):
            return Response(
                {'error': 'INVALID_WEBHOOK_SECRET'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        refs = request.data.get('claim_refs')
        if not isinstance(refs, list):
            return Response(
                {
                    'error': 'CLAIM_REFS_REQUIRED',
                    'detail': 'claim_refs must be a list of claim references.',
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(refs) > DisruptionService.CLAIM_CHECK_MAX_REFS:
            return Response(
                {
                    'error': 'TOO_MANY_CLAIMS',
                    'detail': (
                        f'At most {DisruptionService.CLAIM_CHECK_MAX_REFS} claim '
                        f'references can be checked at once.'
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {'claims': DisruptionService.claim_liveness(refs)},
            status=status.HTTP_200_OK,
        )


class DoubleBookingConflictsView(APIView):
    """
    GET /api/v1/conflicts/double-bookings/
    Item C.2 — read-only feed for the dashboard's red double-booking alert.
    Wraps ConflictService so the detection rules live in exactly one place.
    Returns the soonest clash first, plus `generated_at` so the client can show
    how fresh the check is (it polls every 10 seconds).
    """
    permission_classes = [IsStaffAuthenticated]

    def get(self, request):
        conflicts = ConflictService.find_double_bookings()
        return Response({
            'generated_at': timezone.now().isoformat(),
            'count': len(conflicts),
            'conflicts': conflicts,
        }, status=status.HTTP_200_OK)


class RescheduleAppointmentView(APIView):
    """
    POST /api/v1/appointments/{id}/reschedule/
    Reschedules appointment to a new safe slot and doctor.

    Phase 2.5 (system review finding #4): a reschedule now carries the SAME
    zero-double-booking guarantee as HoldService.acquire_slot — the target
    doctor row is locked, availability is re-validated, and the two-way
    overlap + sterilization-buffer conflict check runs before anything is
    saved. A clash answers 409 SLOT_CONFLICT naming the conflicting block,
    and the appointment is left exactly where it was.
    """
    permission_classes = [IsStaffAuthenticated]

    def post(self, request, id):
        appointment = get_appointment_or_404(id)
        new_start = request.data.get('start_datetime') or request.data.get('start')
        new_end = request.data.get('end_datetime') or request.data.get('end')
        new_doctor_id = request.data.get('doctor_id') or request.data.get('doctor')

        def parse_dt(value, field):
            if value is None or isinstance(value, datetime.datetime):
                return value
            try:
                parsed = datetime.datetime.fromisoformat(str(value).replace('Z', '+00:00'))
            except (ValueError, TypeError):
                raise ValueError(field)
            if timezone.is_naive(parsed):
                # A naive ISO string has no offset; anchor it to the server's
                # timezone so the overlap math never compares naive vs aware.
                parsed = timezone.make_aware(parsed)
            return parsed

        try:
            new_start = parse_dt(new_start, 'start_datetime')
            new_end = parse_dt(new_end, 'end_datetime')
        except ValueError as field_err:
            return Response(
                {'error': 'INVALID_DATETIME', 'detail': f'Unparseable {field_err} value.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Moving only the start keeps the original visit length instead of
        # silently stretching or shrinking the appointment.
        if new_start and not new_end:
            new_end = new_start + (appointment.end_datetime - appointment.start_datetime)
        if new_end and not new_start:
            new_start = appointment.start_datetime
        if (new_start or new_end) and new_end <= new_start:
            return Response(
                {'error': 'INVALID_TIME_BLOCK', 'detail': 'end must be after start.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            doctor = appointment.doctor
            if new_doctor_id:
                try:
                    doctor = Doctor.objects.get(id=new_doctor_id)
                except (Doctor.DoesNotExist, ValueError, TypeError):
                    doctor = Doctor.objects.filter(name__icontains=str(new_doctor_id)).first()
                    if doctor is None:
                        return Response(
                            {'error': 'DOCTOR_NOT_FOUND', 'detail': 'No doctor matches the given id or name.'},
                            status=status.HTTP_400_BAD_REQUEST,
                        )

            # Same guarantees as a fresh booking: lock the target doctor row,
            # re-validate availability, purge stale holds, then conflict-check.
            doctor = Doctor.objects.select_for_update().get(id=doctor.id)
            start = new_start or appointment.start_datetime
            end = new_end or appointment.end_datetime
            if not doctor.is_active or doctor.is_on_leave_on(
                timezone.localtime(start).date()
            ):
                return Response(
                    {
                        'error': 'SLOT_CONFLICT',
                        'detail': f"Doctor {doctor.name} is currently unavailable or on leave.",
                        'conflicting_appointment': None,
                    },
                    status=status.HTTP_409_CONFLICT,
                )

            HoldService.purge_expired_holds(doctor)

            # Wave 2 / Step 2.2: the same clinic contract as a fresh booking.
            # The moving appointment never counts against its own cap, and a
            # reschedule is planned work, so the walk-in notice exemption
            # never applies here.
            violated = validate_clinic_slot(
                doctor, start, end,
                service=appointment.service, clinic=ClinicSetting.get_settings(),
                exclude_appointment_id=appointment.id,
            )
            if violated:
                code, detail = violated
                return Response(
                    {
                        'error': code,
                        'detail': detail,
                        'conflicting_appointment': None,
                    },
                    status=status.HTTP_409_CONFLICT,
                )

            conflict = HoldService.find_slot_conflict(
                doctor, start, end,
                service=appointment.service,
                exclude_appointment_id=appointment.id,
            )
            if conflict is not None:
                return Response(
                    {
                        'error': 'SLOT_CONFLICT',
                        'detail': (
                            f"Slot conflict: the new time block overlaps active appointment "
                            f"({conflict.appointment_code}) or its sterilization buffer."
                        ),
                        'conflicting_appointment': conflict.appointment_code,
                    },
                    status=status.HTTP_409_CONFLICT,
                )

            appointment.doctor = doctor
            if new_start:
                appointment.start_datetime = start
            if new_end:
                appointment.end_datetime = end
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

        # Wave 5 / Step 5.5: one aggregate for every doctor instead of four
        # counts per doctor (a 50-doctor clinic paid 200+ queries for a file).
        from django.db.models import Count, Q

        stats = {
            row['doctor_id']: row
            for row in Appointment.objects.values('doctor_id').annotate(
                total=Count('id'),
                completed=Count('id', filter=Q(status='completed')),
                no_shows=Count('id', filter=Q(status='no_show')),
                cancelled=Count('id', filter=Q(status='cancelled')),
            )
        }

        doctors = Doctor.objects.all().order_by('name')
        for doc in doctors:
            row = stats.get(doc.id, {})
            total = row.get('total', 0)
            completed = row.get('completed', 0)
            no_shows = row.get('no_shows', 0)
            cancelled = row.get('cancelled', 0)
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
        is_staff = request.user and getattr(request.user, 'is_authenticated', False) and getattr(request.user, 'is_active', False)

        if not is_staff and not verify_webhook_secret(request):
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
            # Wave 4 / Step 4.2: `telegram_chat_id` is a CHAT ID, not a phone.
            # The old row handed the patient's phone number to the reminder
            # workflow, which then tried to Telegram a "+234..." chat id — a
            # send that can never succeed. The real chat id lives in the
            # booking request's `telegram_chat_id:<id>` marker (the inbound
            # protocol); no Telegram history answers None — honestly
            # unreachable, not silently broken.
            chat_id = None
            if appt.booking_request and appt.booking_request.patient_notes:
                marker = re.search(
                    r'telegram_chat_id:(\d+)', appt.booking_request.patient_notes,
                )
                if marker:
                    chat_id = marker.group(1)

            reminders_list.append({
                'appointment_id': appt.appointment_code,
                'patient_name': appt.patient_name,
                'patient_phone': appt.patient_phone,
                'telegram_chat_id': chat_id,
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
