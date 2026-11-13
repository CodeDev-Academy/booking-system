"""
Channel availability resolver — Option B, preventive layer.

Answers ONE question before reception dispatches anything:

    "Given this patient and the current deployment configuration,
     which delivery channels can actually reach them?"

This is deliberately READ-ONLY: no network calls, no DB writes, no side
effects. It complements (and does not replace) the InteractionLog-driven
"Needs Attention" tab:

    * availability  → BEFORE dispatch: "can we reach this patient at all?"
    * Needs Attention → AFTER an attempt: "a delivery was tried and failed."

Provider configuration is expressed with explicit enable flags rather than
secret values, because the provider credentials live in n8n, not Django:

    WHATSAPP_ENABLED=true   Meta WhatsApp Cloud API is live in n8n
    SMS_ENABLED=true        VoiceBip SMS is live in n8n
    VOICE_ENABLED=true      Vapi voice agent is live in n8n

Telegram is detected from ``settings.TELEGRAM_BOT_TOKEN`` because Django sends
that leg itself (it is not delegated to n8n).

The ``whatsapp`` checkbox is the instant-message leg. During the Telegram-first
era a Telegram patient is reached through the Telegram card, so Telegram counts
as a delivery path for that channel — matching what ``DispatchOffersView``
already does.
"""
import os

from django.conf import settings

# The channels reception can tick in the ReviewModal (order matters for UI).
DISPATCH_CHANNELS = ('whatsapp', 'sms', 'voice')

_TRUTHY = {'1', 'true', 'yes', 'on'}

_SMS_DISABLED_REASON = (
    'SMS is not enabled (set SMS_ENABLED=true when VoiceBip credentials are live).'
)
_VOICE_DISABLED_REASON = (
    'Voice is not enabled (set VOICE_ENABLED=true when the Vapi assistant is live).'
)
_WHATSAPP_DISABLED_REASON = (
    'WhatsApp is not enabled and this patient has no Telegram chat.'
)


def _enabled(flag_name):
    """True when an explicit provider enable flag is set to a truthy value."""
    return os.environ.get(flag_name, '').strip().lower() in _TRUTHY


def _telegram_configured():
    """Django sends the Telegram leg itself, so its token is the config signal."""
    return bool((getattr(settings, 'TELEGRAM_BOT_TOKEN', '') or '').strip())


def enforcement_enabled():
    """
    Layer 4 switch — when True, a dispatch whose selected channels can reach
    nobody is refused with 409 NO_REACHABLE_CHANNEL.

    Read through ``django.conf.settings`` (not os.environ) so tests can flip it
    with ``override_settings`` and so the default stays OFF.
    """
    return bool(getattr(settings, 'DISPATCH_REQUIRE_REACHABLE_CHANNEL', False))


def resolve_telegram_chat_id(booking, request_data=None):
    """
    Resolve the patient's Telegram chat id exactly the way DispatchOffersView
    does: explicit request value → booking.custom_config → patient_notes marker.

    Kept in one place so the dispatch view can reuse it in a later layer without
    changing behaviour.
    """
    if request_data is not None:
        try:
            explicit = request_data.get('telegram_chat_id')
        except AttributeError:
            explicit = None
        if explicit:
            return str(explicit).strip()

    custom_cfg = getattr(booking, 'custom_config', None) or {}
    if isinstance(custom_cfg, dict):
        configured_chat_id = custom_cfg.get('telegram_chat_id')
        if configured_chat_id:
            return str(configured_chat_id).strip()

    notes_text = getattr(booking, 'patient_notes', '') or ''
    if 'telegram_chat_id:' in notes_text:
        try:
            return notes_text.split('telegram_chat_id:')[1].split()[0].strip()
        except Exception:
            return None
    return None


def resolve_channel_availability(booking, request_data=None):
    """
    Return the per-channel reachability map for a booking request.

    Shape::

        {
          "request_id": "REQ-2026-0042",
          "channels": {
            "whatsapp": {"configured": bool, "reachable": bool, "via": str|None, "reason": str|None},
            "sms":      {...},
            "voice":    {...},
            "telegram": {...}
          },
          "reachable": ["whatsapp"],
          "unreachable": ["sms", "voice"],
          "none": false,
          "telegram_chat_id": "123456789" | None
        }

    ``reachable`` / ``unreachable`` only contain the dispatch channels
    (whatsapp, sms, voice) so callers can intersect them with the receptionist's
    checkbox selection. ``telegram`` is informational.
    """
    chat_id = resolve_telegram_chat_id(booking, request_data)
    telegram_ok = _telegram_configured()
    telegram_reachable = bool(telegram_ok and chat_id)

    whatsapp_enabled = _enabled('WHATSAPP_ENABLED')
    sms_enabled = _enabled('SMS_ENABLED')
    voice_enabled = _enabled('VOICE_ENABLED')

    channels = {
        'whatsapp': {
            'configured': whatsapp_enabled,
            'reachable': whatsapp_enabled or telegram_reachable,
            'via': (
                'whatsapp' if whatsapp_enabled
                else ('telegram' if telegram_reachable else None)
            ),
            'reason': (
                None if whatsapp_enabled
                else (
                    'Delivered through the Telegram card (WhatsApp stand-in).'
                    if telegram_reachable else _WHATSAPP_DISABLED_REASON
                )
            ),
        },
        'sms': {
            'configured': sms_enabled,
            'reachable': sms_enabled,
            'via': 'sms' if sms_enabled else None,
            'reason': None if sms_enabled else _SMS_DISABLED_REASON,
        },
        'voice': {
            'configured': voice_enabled,
            'reachable': voice_enabled,
            'via': 'voice' if voice_enabled else None,
            'reason': None if voice_enabled else _VOICE_DISABLED_REASON,
        },
        'telegram': {
            'configured': telegram_ok,
            'reachable': telegram_reachable,
            'via': 'telegram' if telegram_reachable else None,
            'reason': (
                None if telegram_reachable
                else (
                    'Telegram bot token is not configured.'
                    if not telegram_ok
                    else 'This request has no Telegram chat id.'
                )
            ),
        },
    }

    reachable = [c for c in DISPATCH_CHANNELS if channels[c]['reachable']]
    return {
        'request_id': getattr(booking, 'request_code', None),
        'channels': channels,
        'reachable': reachable,
        'unreachable': [c for c in DISPATCH_CHANNELS if c not in reachable],
        'none': not reachable,
        'telegram_chat_id': chat_id,
    }


_CHANNEL_LABELS = {
    'whatsapp': 'WhatsApp',
    'sms': 'SMS',
    'voice': 'voice call',
}


def _join_labels(channels):
    """'WhatsApp', 'SMS and voice call', 'WhatsApp, SMS and voice call'."""
    labels = [_CHANNEL_LABELS.get(c, c) for c in channels]
    if len(labels) <= 1:
        return ''.join(labels)
    return f"{', '.join(labels[:-1])} and {labels[-1]}"


def _sentence(text):
    """Capitalise the first letter so a warning can start with any channel name."""
    return text[:1].upper() + text[1:] if text else text


def build_delivery_plan(availability, dispatch_channels):
    """
    Layer 2 (advisory): intersect the receptionist's checkbox selection with the
    reachable channels, and phrase a human warning when some (or all) of the
    selection cannot reach the patient.

    This NEVER blocks a dispatch — ``DispatchOffersView`` still returns 200 and
    still creates the offers. It only tells reception the truth about delivery.
    Enforcement is a separate, flag-gated layer.

    Shape::

        {
          "requested":   ["whatsapp", "sms", "voice"],
          "reachable":   ["whatsapp"],
          "unreachable": ["sms", "voice"],
          "warning":     "SMS and voice call cannot reach this patient — only WhatsApp will be used."
        }
    """
    requested = [c for c in DISPATCH_CHANNELS if c in (dispatch_channels or [])]
    channels = availability.get('channels', {}) if availability else {}
    reachable = [
        c for c in requested if channels.get(c, {}).get('reachable')
    ]
    unreachable = [c for c in requested if c not in reachable]

    if not requested:
        warning = None
    elif not reachable:
        warning = (
            'None of the selected channels can reach this patient — nothing will be '
            'delivered. Call the patient directly, or configure a provider.'
        )
    elif unreachable:
        warning = (
            f"{_sentence(_join_labels(unreachable))} cannot reach this patient — "
            f"only {_join_labels(reachable)} will be used."
        )
    else:
        warning = None

    return {
        'requested': requested,
        'reachable': reachable,
        'unreachable': unreachable,
        'warning': warning,
    }

