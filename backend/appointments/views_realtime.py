import uuid
import datetime
import secrets
from django.utils import timezone
from django.core.cache import cache
from django.http import StreamingHttpResponse
from django.db import transaction, IntegrityError
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny

from .models import IdempotencyKey, ClinicSetting, AuditLog
from .permissions import IsStaffAuthenticated
from rest_framework.renderers import BaseRenderer, JSONRenderer
from .services.sse_bus import bus, broadcast_event, sse_event_stream
from .services.telegram_service import TelegramService
from .serializers_realtime import PresenceUpdateSerializer, InboundWebhookSerializer


class ServerSentEventRenderer(BaseRenderer):
    media_type = 'text/event-stream'
    format = 'sse'

    def render(self, data, accepted_media_type=None, renderer_context=None):
        return data


class EventStreamView(APIView):
    """
    GET /api/v1/realtime/stream/ & /api/v1/realtime/events/
    Server-Sent Events endpoint streaming real-time clinic updates.
    Implements anti-buffering headers (X-Accel-Buffering: no) and 15s heartbeats.
    """
    permission_classes = [AllowAny]
    renderer_classes = [ServerSentEventRenderer, JSONRenderer]

    def get(self, request):
        limit = None
        if 'limit' in request.query_params:
            try:
                limit = int(request.query_params['limit'])
            except ValueError:
                limit = None

        heartbeat = 15.0
        if 'heartbeat' in request.query_params:
            try:
                heartbeat = float(request.query_params['heartbeat'])
            except ValueError:
                heartbeat = 15.0

        client_queue = bus.subscribe()
        stream_gen = sse_event_stream(client_queue, limit=limit, heartbeat_seconds=heartbeat)

        response = StreamingHttpResponse(stream_gen, content_type='text/event-stream')
        response['Cache-Control'] = 'no-cache, no-transform'
        response['X-Accel-Buffering'] = 'no'
        response['Connection'] = 'keep-alive'
        return response


class PresenceBroadcastView(APIView):
    """
    POST /api/v1/realtime/presence/
    Broadcasts receptionist desk review presence ('👀 Sarah is reviewing')
    with automatic 3-minute self-expiring TTL to prevent ghost locks.
    """
    permission_classes = [IsStaffAuthenticated]

    def post(self, request):
        serializer = PresenceUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        req_id = serializer.validated_data['request_id']
        action = serializer.validated_data['action']
        reviewer_name = getattr(request.user, 'full_name', 'Frontdesk Staff')
        reviewer_email = getattr(request.user, 'email', 'staff@clinic.com')

        cache_key = f"review_presence_{req_id}"

        if action == 'stop_review':
            cache.delete(cache_key)
        else:
            # 3-minute self-expiring lock (Risk EC-6)
            cache.set(cache_key, {
                'reviewer_name': reviewer_name,
                'reviewer_email': reviewer_email,
                'timestamp': timezone.now().isoformat(),
            }, timeout=180)

        event_payload = {
            'request_id': req_id,
            'action': action,
            'reviewer_name': reviewer_name,
            'reviewer_email': reviewer_email,
            'timestamp': timezone.now().isoformat(),
        }

        broadcast_event('request.reviewing', event_payload)

        return Response({
            'status': 'broadcasted',
            'presence': event_payload
        }, status=status.HTTP_200_OK)


class InboundWebhookView(APIView):
    """
    POST /api/v1/webhooks/messaging/inbound/
    POST /api/v1/webhooks/telegram/inbound/
    POST /api/v1/webhooks/whatsapp/inbound/

    Ingests messaging gateway webhooks with cryptographic token verification
    and database-level IdempotencyKey deduplication (Risk EC-5).
    """
    permission_classes = [AllowAny]

    def post(self, request):
        clinic = ClinicSetting.get_settings()

        # 1. Telegram Webhook Secret Token Verification (Risk EC-7)
        expected_tg_token = clinic.custom_config.get('telegram_secret_token')
        received_tg_token = request.META.get('HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN')
        if expected_tg_token:
            if not received_tg_token or not secrets.compare_digest(str(expected_tg_token), str(received_tg_token)):
                return Response({'error': 'INVALID_WEBHOOK_SECRET'}, status=status.HTTP_403_FORBIDDEN)


        # 2. Extract update_id from raw payload or standardized serializer
        raw_update_id = (
            request.data.get('update_id') or
            request.data.get('idempotency_key') or
            (request.data.get('entry', [{}])[0].get('id') if isinstance(request.data.get('entry'), list) and len(request.data.get('entry')) > 0 else None)
        )

        if not raw_update_id:
            return Response({'error': 'update_id or idempotency_key is required.'}, status=status.HTTP_400_BAD_REQUEST)

        key_str = str(raw_update_id)
        source = request.data.get('channel', 'telegram')
        expires_at = timezone.now() + datetime.timedelta(hours=24)

        # 3. Concurrency-Safe Idempotency Check & Lock (Risk EC-5)
        try:
            with transaction.atomic():
                idempotency, created = IdempotencyKey.objects.get_or_create(
                    key=key_str,
                    defaults={'source': source, 'expires_at': expires_at}
                )
        except IntegrityError:
            created = False

        if not created:
            # Duplicate webhook delivery safely rejected without reprocessing
            return Response({
                "status": "duplicate_ignored",
                "detail": "Payload with this update_id has already been processed.",
                "update_id": key_str
            }, status=status.HTTP_200_OK)

        AuditLog.objects.create(
            entity_name='IdempotencyKey',
            entity_id=idempotency.id,
            action='WEBHOOK_INGESTED',
            performed_by=f"Gateway:{source}",
            changes={'update_id': key_str, 'source': source},
            ip_address=request.META.get('REMOTE_ADDR')
        )

        telegram_result = None
        if source == 'telegram' or 'callback_query' in request.data or 'message' in request.data:
            telegram_result = TelegramService.handle_telegram_webhook(request.data)

        resp_data = {
            "status": "processed",
            "detail": "Webhook received and idempotency key registered.",
            "update_id": key_str,
            "created": True
        }
        if telegram_result:
            resp_data["telegram_result"] = telegram_result

        return Response(resp_data, status=status.HTTP_200_OK)

