"""
Real-Time Server-Sent Events (SSE) Streaming Hub.
Agency Template Live Event Protocol.

Streams:
1. 'request.created' — Fresh intake request arrived
2. 'request.reviewing' — Multi-receptionist desk presence locking
3. 'slot.held' — Temporary hold acquired by patient
4. 'status.updated' — Visit milestone updated (arrived, completed, etc.)
5. 'offer.expired' — 60-min window elapsed
"""

import time
import json
import collections
from django.http import StreamingHttpResponse
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny

# Thread-safe in-memory circular event buffer (up to 100 recent events)
EVENT_BUFFER = collections.deque(maxlen=100)


def broadcast_realtime_event(event_type: str, data: dict):
    """
    Broadcasts an event to all connected SSE clients.
    """
    event = {
        'id': f"evt-{int(time.time() * 1000)}",
        'type': event_type,
        'timestamp': timezone.now().isoformat(),
        'data': data,
    }
    EVENT_BUFFER.append(event)
    return event


class RealtimeEventsView(APIView):
    """
    GET /api/v1/realtime/events/
    Streams SSE updates to the Receptionist React Dashboard.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        def event_stream():
            last_sent_id = None
            yield "event: connected\ndata: {\"status\": \"connected\"}\n\n"

            heartbeat_interval = 15  # seconds
            last_heartbeat = time.time()

            # Stream for up to 30 iterations in test/dev or until client disconnects
            iterations = 0
            while iterations < 30:
                iterations += 1
                now = time.time()

                # Check for new events in buffer
                if EVENT_BUFFER:
                    for evt in list(EVENT_BUFFER):
                        if last_sent_id is None or evt['id'] > last_sent_id:
                            last_sent_id = evt['id']
                            payload = json.dumps(evt)
                            yield f"event: {evt['type']}\ndata: {payload}\n\n"

                # Send periodic heartbeat
                if now - last_heartbeat >= heartbeat_interval:
                    last_heartbeat = now
                    yield f": heartbeat {int(now)}\n\n"

                time.sleep(1)

        response = StreamingHttpResponse(
            event_stream(),
            content_type='text/event-stream'
        )
        response['Cache-Control'] = 'no-cache'
        response['X-Accel-Buffering'] = 'no'
        return response
