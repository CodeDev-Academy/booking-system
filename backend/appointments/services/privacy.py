"""
Privacy & PII Masking Utilities (Phase 1 / Task 1.3 — NDPR / HIPAA posture).

Server/terminal logs and error traces are shared across hosting dashboards and
log aggregators. They must never carry full patient contact details. The
authoritative record keeps the full phone number in the database (AuditLog and
domain models are intentional, access-controlled stores); ONLY ephemeral logs
are masked via the helpers below.
"""

import re

# Nigerian E.164 numbers plus generic international formats.
# Requires 10–15 total digits so dates ('2026-11-12'), order numbers and other
# short numeric runs in provider error text are NOT masked as phones (Review Fix #9).
_PHONE_RE = re.compile(r'(?=(?:\D*\d){10,15})(\+?\d[\d\s\-()]{7,}\d)')


def mask_phone(phone):
    """
    Mask all but the last 4 digits of a phone number for logging.

    '+2348030001122' -> '+234•••••1122'
    '08030001122'    -> '•••••1122'
    '' / None        -> '' (safe fallback)

    Keeps the international prefix and a stable 4-digit tail so support staff
    can correlate a log line with a patient WITHOUT exposing the full number.
    """
    if not phone:
        return ''
    raw = str(phone).strip()
    digits = re.sub(r'\D', '', raw)
    if len(digits) < 6:
        return '•' * len(digits)
    visible_tail = digits[-4:]
    if raw.startswith('+') and len(digits) > 7:
        # Keep the country code (e.g. '234') so logs stay correlate-able
        cc = digits[:3]
        hidden = max(len(digits) - 4 - len(cc), 0)
        return f"+{cc}{'•' * hidden}{visible_tail}"
    return f"{'•' * (len(digits) - 4)}{visible_tail}"


def mask_phones_in_text(text, replacement='••••'):
    """
    Replace any phone-like numeric sequence inside free text with a masked form.
    Used when an external API response body must be logged verbatim (truncated).
    """
    if not text:
        return text

    def _sub(match):
        return mask_phone(match.group(0))

    return _PHONE_RE.sub(_sub, str(text))


def safe_external_body(body, max_chars=300):
    """
    Prepare an external provider error/response body for logging:
    phone-masked and truncated so neither PII nor oversized payloads hit logs.
    """
    if body is None:
        return ''
    text = str(body)
    masked = mask_phones_in_text(text)
    if len(masked) > max_chars:
        masked = masked[:max_chars] + '…[truncated]'
    return masked
