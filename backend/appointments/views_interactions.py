"""
Interaction Log API (Phase 2 / Task 2.1 — Partner Readiness Roadmap).

POST /api/v1/interactions/   — n8n Dispatcher writes call/message results
                               (X-Webhook-Secret guarded) or staff JWT writes.
GET  /api/v1/interactions/   — dashboard reads (staff JWT only).

Hybrid AI OS spec §6: the Django DB is the authoritative Interactions record;
SSE realtime only improves visibility. Duplicate provider deliveries are
absorbed via the unique `external_ref` upsert.
"""
import logging

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny

from .models import InteractionLog
from .permissions import IsStaffAuthenticated
from .serializers_interactions import (
    InteractionLogSerializer,
    InteractionWriteSerializer,
    normalize_phone_e164,
)
from .services.webhook_security import has_staff_or_webhook_access
from .services.sse_bus import broadcast_event

logger = logging.getLogger(__name__)

# Phase 3 / 3.7: the phone on an existing row is identity, not ordinary data. A callback
# may fill a blank number (2.1 contract) but must never rewrite one that is already there.
PHONE_MISMATCH_NOTE = (
    'Phone on this callback did not match the number on file, '
    'so the number on file was kept.'
)


def _flag_phone_mismatch(summary):
    """Append the mismatch note once, keeping whatever the provider actually said."""
    text = (summary or '').strip()
    if PHONE_MISMATCH_NOTE in text:
        return text
    return (text + ' · ' + PHONE_MISMATCH_NOTE) if text else PHONE_MISMATCH_NOTE


class InteractionListCreateView(APIView):
    """
    POST: External interaction results (n8n Dispatcher — VoiceBip call outcomes,
          WhatsApp/SMS delivery statuses) or staff-sent message records.
          Auth: valid X-Webhook-Secret OR authenticated active staff.
          Idempotent: re-delivery with the same external_ref updates the row
          instead of duplicating it.
    GET:  Staff-only interaction history, filterable by patient_phone,
          request_code, channel, and status; newest first, capped page.
    """

    def get_permissions(self):
        if self.request.method == 'GET':
            return [IsStaffAuthenticated()]
        return [AllowAny()]

    def post(self, request):
        if not has_staff_or_webhook_access(request):
            return Response(
                {
                    'error': 'UNAUTHORIZED',
                    'detail': 'Valid X-Webhook-Secret header or staff credentials required.'
                },
                status=status.HTTP_401_UNAUTHORIZED
            )

        serializer = InteractionWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data
        serializer.resolve_links(validated)

        external_ref = (validated.get('external_ref') or '').strip()
        # Empty-string external_ref must map to NULL — '' would collide on the unique index.
        validated['external_ref'] = external_ref or None

        existing = (
            InteractionLog.objects.filter(external_ref=external_ref).first()
            if external_ref else None
        )

        # Provider callbacks (Stage D-4) usually identify the message/call by provider id
        # only. When the row already exists, reuse its stored number instead of rejecting
        # the event; a brand-new row still has to carry a phone number.
        if not (validated.get('patient_phone') or ''):
            # Phase 2 skip visibility: a "held back, not attempted" row
            # (status queued) is internal bookkeeping linked to the booking
            # request — no destination number, because nothing was sent. The
            # request link is mandatory so the row is always findable.
            phoneless_skip_row = (
                (validated.get('status') or '') == 'queued'
                and validated.get('booking_request') is not None
            )
            if existing is not None:
                validated['patient_phone'] = existing.patient_phone
            elif not phoneless_skip_row:
                return Response(
                    {'patient_phone': ['patient_phone is required.']},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        created = False
        if external_ref:
            incoming_rank = InteractionLog.STATUS_RANK.get(validated.get('status') or 'sent', 0)
            if existing is not None and incoming_rank < existing.status_rank():
                # Out-of-order provider event (Stage D-4): a late "delivered" must never
                # overwrite an "answered", and a retried "sent" must not erase a failure.
                # Keep the newer status and only fill blanks the row is still missing.
                filled = []
                for field, value in validated.items():
                    if field in ('external_ref', 'status') or value in ('', None):
                        continue
                    if getattr(existing, field) in (None, '', []):
                        setattr(existing, field, value)
                        filled.append(field)
                if filled:
                    existing.save(update_fields=filled + ['updated_at'])
                instance = existing
            else:
                # Phase 3 / 3.7: a callback may FILL a blank number but must not REWRITE
                # one that already exists. The delivery outcome is real, so the status
                # still advances - only the identity is refused. Without this, a sandbox
                # call, a provider echoing its own DID, or a cross-wired external_ref
                # could move the patient's whole history onto another number, silently.
                if existing is not None:
                    stored_phone = existing.patient_phone
                    incoming_phone = validated.get('patient_phone') or ''
                    if stored_phone and incoming_phone and incoming_phone != stored_phone:
                        validated['patient_phone'] = stored_phone
                        validated['summary'] = _flag_phone_mismatch(
                            validated.get('summary') or existing.summary
                        )
                        # external_ref only: no phone numbers in the log.
                        logger.warning(
                            'Callback %s carried a different phone; kept the stored number.',
                            external_ref,
                        )
                    # Same identity rule for the name, and the same distinction: a
                    # delivery receipt that says nothing about the patient must not
                    # erase the name the first event carried. No note here - silence
                    # is not a discrepancy, so there is nothing to flag.
                    stored_name = existing.patient_name
                    incoming_name = validated.get('patient_name') or ''
                    if stored_name and not incoming_name.strip():
                        validated['patient_name'] = stored_name

                # Atomic upsert (Review Fix #2): a check-then-create race would let two
                # concurrent n8n re-deliveries both pass the .first() check and the second
                # create() crash with IntegrityError. update_or_create handles both outcomes.
                defaults = {k: v for k, v in validated.items() if k != 'external_ref'}
                # Phase 3 (hardening): a rank-advancing event that identifies the
                # message only by external_ref (a typical VoiceBip call outcome:
                # id + status + duration, no codes) must not UNLINK a row that
                # already carries a request/appointment link. None in the event
                # means "said nothing about the link", not "clear it" — a
                # non-None value still wins, including re-linking.
                if existing is not None:
                    for link_field in ('booking_request', 'appointment'):
                        if defaults.get(link_field) is None and getattr(existing, link_field, None):
                            defaults[link_field] = getattr(existing, link_field)
                instance, created = InteractionLog.objects.update_or_create(
                    external_ref=external_ref,
                    defaults=defaults,
                )
        else:
            instance = InteractionLog.objects.create(**validated)
            created = True

        payload = InteractionLogSerializer(instance).data

        # SSE visibility (non-authoritative — spec §4B)
        if created:
            try:
                broadcast_event('interaction_logged', {
                    'interaction_id': str(payload['id']),
                    'channel': payload['channel'],
                    'provider': payload['provider'],
                    'status': payload['status'],
                    'patient_phone': payload['patient_phone'],
                })
            except Exception as sse_err:  # SSE must never break the write
                logger.warning("SSE broadcast failed for interaction log: %s", sse_err)

        return Response(
            payload,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK
        )

    def get(self, request):
        qs = InteractionLog.objects.select_related('booking_request', 'appointment')

        patient_phone = request.query_params.get('patient_phone', '').strip()
        if patient_phone:
            qs = qs.filter(patient_phone=normalize_phone_e164(patient_phone))

        request_code = request.query_params.get('request_code', '').strip()
        if request_code:
            qs = qs.filter(booking_request__request_code=request_code)

        channel = request.query_params.get('channel', '').strip()
        if channel:
            qs = qs.filter(channel=channel)

        interaction_status = request.query_params.get('status', '').strip()
        if interaction_status:
            qs = qs.filter(status=interaction_status)

        try:
            limit = int(request.query_params.get('limit', '50'))
        except ValueError:
            limit = 50
        limit = max(1, min(limit, 200))  # spec §9: capped, paginated reads

        return Response(InteractionLogSerializer(qs[:limit], many=True).data)
