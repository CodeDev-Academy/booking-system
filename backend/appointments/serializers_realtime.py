from rest_framework import serializers


class PresenceUpdateSerializer(serializers.Serializer):
    """
    Validates front-desk review card presence updates.
    """
    request_id = serializers.CharField(max_length=64)
    action = serializers.ChoiceField(
        choices=['start_review', 'stop_review', 'heartbeat'],
        default='start_review'
    )


class InboundWebhookSerializer(serializers.Serializer):
    """
    Validates inbound messaging gateway webhook payloads with idempotency tracking.
    """
    update_id = serializers.CharField(max_length=255)
    channel = serializers.ChoiceField(
        choices=['telegram', 'whatsapp', 'web'],
        default='telegram'
    )
    sender_phone = serializers.CharField(max_length=32, required=False, allow_blank=True)
    sender_name = serializers.CharField(max_length=255, required=False, allow_blank=True)
    text = serializers.CharField(required=False, allow_blank=True)
    callback_data = serializers.CharField(required=False, allow_blank=True)
    raw_payload = serializers.DictField(required=False)
