"""
Webhook Security Utilities (Phase 1 / Task 1.1 — Partner Readiness Roadmap).

Centralizes the `X-Webhook-Secret` verification shared by every endpoint the
n8n Dispatcher (or an external messaging gateway) calls into the Django backend:

- POST /api/v1/slots/hold/            (patient slot selection via n8n)
- POST /api/v1/booking-requests/{id}/re-request/  (patient recovery via n8n)
- POST /api/v1/webhooks/expiry-sweep/ (60s n8n cron sweeper)
- GET  /api/v1/appointments/upcoming-reminders/   (n8n reminder cron)
- POST /api/v1/interactions/          (future InteractionLog writes — Phase 2)

Security posture:
- Comparison is constant-time (`secrets.compare_digest`) to prevent timing attacks.
- Resolution order: ClinicSetting.webhook_secret -> custom_config['webhook_secret']
  -> settings.WEBHOOK_SECRET (env). That is the whole list.
- Nothing configured = nothing accepted, in DEBUG as well as in production.

Security audit F3 (2026-11-25) removed the fourth step this file used to have: a
`DEBUG=True` fallback to a literal that was committed to this repository (in
`webhook_security.py`, in `n8n/.env.example` and in the handover docs). A secret
that ships in source cannot authenticate anyone, so the fallback is gone and an
unconfigured receiver now fails closed everywhere. Rotate the retired value in any
deployment that used it.
"""

import secrets as pysecrets

from django.conf import settings


def resolve_webhook_secret():
    """
    Return the effective shared webhook secret ('' means fail-closed).
    """
    from ..models import ClinicSetting  # Local import avoids circular dependencies.

    clinic = ClinicSetting.get_settings()
    configured = (getattr(clinic, 'webhook_secret', '') or '').strip()
    if not configured and isinstance(clinic.custom_config, dict):
        configured = (clinic.custom_config.get('webhook_secret') or '').strip()
    if not configured:
        configured = (getattr(settings, 'WEBHOOK_SECRET', '') or '').strip()
    return configured


def verify_webhook_secret(request) -> bool:
    """
    True only when the request carries the correct `X-Webhook-Secret` header.
    Constant-time comparison; False when unconfigured (fail-closed).
    """
    expected = resolve_webhook_secret()
    if not expected:
        return False
    provided = (
        request.headers.get('X-Webhook-Secret') or
        request.META.get('HTTP_X_WEBHOOK_SECRET') or
        ''
    )
    if not provided:
        return False
    # Compare as bytes: str-mode compare_digest raises TypeError on any
    # non-ASCII input (e.g. a malformed header), which would surface as an
    # unhandled 500 on every guarded endpoint instead of a clean 401.
    return pysecrets.compare_digest(
        str(provided).encode('utf-8'),
        str(expected).encode('utf-8'),
    )


def has_staff_or_webhook_access(request) -> bool:
    """
    True for an authenticated active staff member OR a valid webhook secret.
    Used by dual-audience endpoints consumed by both the dashboard and n8n.
    """
    user = getattr(request, 'user', None)
    if (
        user and
        getattr(user, 'is_authenticated', False) and
        getattr(user, 'is_active', False)
    ):
        return True
    return verify_webhook_secret(request)
