"""
Workflow C / C.1 — the channel-neutral patient-reply endpoint.

    POST /api/v1/webhooks/patient-reply/
    X-Webhook-Secret: <shared>              (fail closed, same verifier as every webhook)
    {"phone", "text", "channel", "provider_message_id"}

Telegram replies work because the button carries the offer id. An SMS says only
"2" plus the sender's number, so this endpoint resolves phone -> open request and
interprets the text (see services/patient_reply.py). n8n receives `reply_text`
and only delivers it; it never sees the database.

Never log or echo the patient's phone number here.
"""

import logging

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny

from .services.patient_reply import handle_patient_reply
from .services.webhook_security import verify_webhook_secret

logger = logging.getLogger(__name__)


class PatientReplyWebhookView(APIView):
    """
    Patient reply ingress for SMS / WhatsApp (VoiceBip, Meta).

    Auth: `X-Webhook-Secret` only. A patient never holds that secret, and this
    endpoint is a machine-to-machine webhook, so staff JWT is not accepted here.
    """

    permission_classes = [AllowAny]

    def post(self, request):
        if not verify_webhook_secret(request):
            return Response(
                {'error': 'INVALID_WEBHOOK_SECRET'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        phone = str(request.data.get('phone') or '').strip()
        if not phone:
            # A provider call with no sender number cannot be resolved and cannot
            # be answered on any channel. Malformed, not hostile: 400, no writes.
            return Response(
                {'phone': ['phone is required.']},
                status=status.HTTP_400_BAD_REQUEST,
            )

        text = str(request.data.get('text') or '').strip()[:500]
        channel = request.data.get('channel') or 'sms'
        provider_message_id = str(request.data.get('provider_message_id') or '').strip()[:255]

        result = handle_patient_reply(
            phone=phone,
            text=text,
            channel=channel,
            provider_message_id=provider_message_id,
        )
        return Response(result, status=status.HTTP_200_OK)
