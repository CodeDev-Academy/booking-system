"""
Non-Blocking Outbound Webhook Dispatcher (Phase 2 / Task 2.2 — Partner Readiness Roadmap).

The receptionist's "Approve & Dispatch" action must never hang on network
latency from the n8n Dispatcher. The DB rows (SlotOffer + BookingRequest
status transition) are committed BEFORE this fire-and-forget call, satisfying
the Hybrid AI OS spec §5 rule: "Commands are persisted before being treated
as accepted for processing."

Design:
- Daemon thread with a short timeout; failures are logged (never raised to
  the requester, never retried inline — the n8n side owns retries, and the
  scheduled reconciliation cron covers missed notifications per spec §9-6).
- Zero database access inside the thread: the payload is fully built by the
  caller, so the thread never holds a Django DB connection and cannot race
  the test-runner teardown.
"""

import json
import logging
import threading
import urllib.request

logger = logging.getLogger(__name__)

# Generous enough for n8n cold starts, short enough to keep thread churn low.
N8N_DISPATCH_TIMEOUT_SECONDS = 5.0


def _post_webhook(url, payload, timeout):
    try:
        # default=str absorbs DRF serializer values that aren't natively JSON-safe
        # (e.g. PrimaryKeyRelatedField emits raw UUID objects). The old synchronous
        # implementation silently failed on this every time — surfaced by Task 2.2 tests.
        data = json.dumps(payload, default=str).encode('utf-8')
        req = urllib.request.Request(
            url,
            data=data,
            headers={'Content-Type': 'application/json'}
        )
        urllib.request.urlopen(req, timeout=timeout)
        logger.info(
            "n8n dispatch webhook delivered for request %s",
            payload.get('request_id')
        )
    except Exception as err:
        logger.warning(
            "n8n dispatch webhook failed for request %s: %s",
            payload.get('request_id'), err
        )


def fire_and_forget_webhook(url, payload, timeout=N8N_DISPATCH_TIMEOUT_SECONDS):
    """
    POST `payload` to `url` in a daemon thread. Returns the started thread
    (handy for test synchronization); never raises to the caller.
    """
    thread = threading.Thread(
        target=_post_webhook,
        args=(url, payload, timeout),
        daemon=True,
        name='n8n-dispatch-webhook'
    )
    thread.start()
    return thread
