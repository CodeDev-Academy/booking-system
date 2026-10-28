import json
import queue
import threading
import logging
from typing import Generator

logger = logging.getLogger(__name__)


class SSEEventBus:
    """
    Thread-safe in-memory publish-subscribe event bus for Server-Sent Events (SSE).
    Distributes clinical domain events to connected receptionist dashboard clients.
    """
    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super(SSEEventBus, cls).__new__(cls)
                cls._instance._subscribers = set()
                cls._instance._subscribers_lock = threading.Lock()
        return cls._instance

    def subscribe(self) -> queue.Queue:
        """Registers a new client queue to receive broadcast events."""
        q = queue.Queue(maxsize=200)
        with self._subscribers_lock:
            self._subscribers.add(q)
        return q

    def unsubscribe(self, q: queue.Queue):
        """Removes a client queue on disconnection."""
        with self._subscribers_lock:
            self._subscribers.discard(q)

    def broadcast(self, event_type: str, data: dict):
        """
        Publishes an event to all connected subscriber queues.
        Formats payload conforming to W3C Server-Sent Events standard.
        """
        payload = (
            f"event: {event_type}\n"
            f"data: {json.dumps(data)}\n\n"
        )
        with self._subscribers_lock:
            stale_subscribers = []
            for q in self._subscribers:
                try:
                    q.put_nowait(payload)
                except queue.Full:
                    stale_subscribers.append(q)
            for stale in stale_subscribers:
                self._subscribers.discard(stale)

    def format_comment(self, text: str) -> str:
        """Formats an SSE comment line (used for connection initialization and heartbeats)."""
        return f": {text}\n\n"

    def format_event(self, event_type: str, data: dict) -> str:
        return f"event: {event_type}\ndata: {json.dumps(data)}\n\n"


bus = SSEEventBus()


def broadcast_event(event_type: str, data: dict):
    """Global helper to broadcast domain events to all connected clients."""
    bus.broadcast(event_type, data)


def sse_event_stream(q: queue.Queue, limit: int = None, heartbeat_seconds: float = 15.0) -> Generator[str, None, None]:
    """
    Generator that yields SSE chunks.
    Yields initial connected handshake, received domain events, and periodic heartbeats.
    Gracefully cleans up subscriber on disconnection or when limit is reached.
    """
    sent_count = 0
    try:
        # Handshake frame
        yield bus.format_event("connected", {"status": "connected", "channel": "clinic.events"})
        sent_count += 1

        if limit is not None and sent_count >= limit:
            return

        while True:
            try:
                # Wait for next event or heartbeat timeout
                msg = q.get(timeout=heartbeat_seconds)
                yield msg
                sent_count += 1
                if limit is not None and sent_count >= limit:
                    break
            except queue.Empty:
                # Heartbeat to keep TCP socket alive across cloud reverse proxies (Risk EC-2)
                yield bus.format_comment("keepalive")
                sent_count += 1
                if limit is not None and sent_count >= limit:
                    break
    finally:
        bus.unsubscribe(q)
