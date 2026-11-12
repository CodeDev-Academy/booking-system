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
  -> settings.WEBHOOK_SECRET (env) -> dev fallback ONLY when DEBUG=True.
- Fail-closed in production: an unconfigured secret rejects every guarded request.
"""

import secrets as pysecrets

from django.conf import settings

# Value the bundled n8n workflow JSONs send when DJANGO_WEBHOOK_SECRET env is
# unset in local development. Never used when DEBUG=False.
DEV_FALLBACK_WEBHOOK_SECRET = 'clinic_dev_secret_2026'


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
    if not configured and getattr(settings, 'DEBUG', False):
        configured = DEV_FALLBACK_WEBHOOK_SECRET
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
