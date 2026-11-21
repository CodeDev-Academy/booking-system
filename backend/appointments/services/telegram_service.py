import json
import html
import re
import logging
import uuid
import urllib.request
import urllib.error
from django.utils import timezone
from django.conf import settings
from django.db import transaction

import datetime
from ..models import (
    ClinicSetting,
    BookingRequest,
    SlotOffer,
    Appointment,
    FollowUpTask,
    AuditLog,
    IdempotencyKey,
    Service,
)
from .hold_service import HoldService, SlotConflictException
from .privacy import safe_external_body
from .sse_bus import broadcast_event

logger = logging.getLogger(__name__)


class TelegramService:
    """
    Telegram Bot Integration Engine (Task 5.1).
    Provides native outbound message formatting with Inline Keyboards,
    safe HTML escaping, HTTP dispatch via standard library,
    and inbound webhook/callback handling with atomic slot locks.
    """

    @staticmethod
    def get_bot_token() -> str:
        """Retrieves Telegram bot token strictly from ClinicSetting or Django environment settings (SEC-03)."""
        clinic = ClinicSetting.get_settings()
        token = clinic.custom_config.get('telegram_bot_token')
        if token:
            return str(token)
        return str(getattr(settings, 'TELEGRAM_BOT_TOKEN', '') or '')

    @classmethod
    def call_api(cls, method: str, payload: dict) -> dict:
        """
        Executes outbound HTTP request to Telegram Bot API using urllib.
        Implements strict 5.0s timeout and graceful fallback for mock/offline testing.
        """
        token = cls.get_bot_token()
        if not token or token == 'MOCK_TOKEN' or token == 'test_token':
            logger.info("Telegram API call simulated (no live token configured): %s", method)
            return {'ok': True, 'simulated': True, 'result': {'message_id': 9999}}

        url = f"https://api.telegram.org/bot{token}/{method}"
        data_bytes = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(
            url,
            data=data_bytes,
            headers={'Content-Type': 'application/json', 'User-Agent': 'ClinicBookingSystem/1.0'}
        )

        try:
            with urllib.request.urlopen(req, timeout=5.0) as resp:
                resp_data = resp.read().decode('utf-8')
                return json.loads(resp_data)
        except urllib.error.HTTPError as e:
            error_body = e.read().decode('utf-8', errors='ignore')
            # Task 1.3 (privacy): provider error bodies are phone-masked and truncated
            # before logging / audit storage so patient contact details never leak.
            safe_body = safe_external_body(error_body)
            logger.warning("Telegram API HTTP error %d: %s", e.code, safe_body)
            # EC-5: Bot blocked by patient (403 Forbidden)
            if e.code == 403:
                AuditLog.objects.create(
                    entity_name='TelegramService',
                    entity_id=uuid.uuid4(),  # service-level log (no domain entity)
                    action='TELEGRAM_BOT_BLOCKED_BY_USER',
                    performed_by='System',
                    changes={'method': method, 'error': safe_body}
                )
            return {'ok': False, 'status_code': e.code, 'error': error_body}
        except Exception as e:
            logger.error("Telegram API connection error: %s", str(e))
            return {'ok': False, 'error': str(e)}

    @classmethod
    def send_message(cls, chat_id: str | int, text: str, reply_markup: dict = None) -> dict:
        """Sends an HTML formatted message with optional InlineKeyboardMarkup."""
        payload = {
            'chat_id': str(chat_id),
            'text': text,
            'parse_mode': 'HTML',
            'disable_web_page_preview': True,
        }
        if reply_markup:
            payload['reply_markup'] = reply_markup
        return cls.call_api('sendMessage', payload)

    @classmethod
    def edit_message_reply_markup(cls, chat_id: str | int, message_id: int, reply_markup: dict = None) -> dict:
        """Removes or updates buttons to prevent rapid double-clicks (Risk EC-2)."""
        payload = {
            'chat_id': str(chat_id),
            'message_id': message_id,
        }
        if reply_markup is not None:
            payload['reply_markup'] = reply_markup
        else:
            payload['reply_markup'] = {'inline_keyboard': []}
        return cls.call_api('editMessageReplyMarkup', payload)

    @classmethod
    def answer_callback_query(cls, callback_query_id: str, text: str = None, show_alert: bool = False) -> dict:
        """Acknowledges button tap to Telegram client to dismiss spinner or show modal alert."""
        payload = {'callback_query_id': callback_query_id}
        if text:
            payload['text'] = text
        if show_alert:
            payload['show_alert'] = True
        return cls.call_api('answerCallbackQuery', payload)

    # -------------------------------------------------------------------------
    # Outbound Message Formatters (Crash-Proof Safe HTML, Risk EC-3)
    # -------------------------------------------------------------------------

    @staticmethod
    def format_slot_offers(booking_request: BookingRequest, slot_offers, clinic: ClinicSetting) -> tuple[str, dict]:
        """
        Formats 1-Hour Candidate Slot Offer message with interactive Inline Keyboard.
        """
        patient_name = html.escape(booking_request.patient_name)
        service_name = html.escape(booking_request.service.name)
        clinic_name = html.escape(clinic.clinic_name)
        expiry_min = clinic.offer_expiry_minutes

        text = (
            f"🏥 <b>{clinic_name} — Available Times</b>\n\n"
            f"Hello <b>{patient_name}</b>, your request for <b>{service_name}</b> has been reviewed by our reception.\n\n"
            f"⏳ <i>These options are held for {expiry_min} minutes so all patients have fair access to the schedule.</i>\n\n"
            f"Please tap a button below to lock in your preferred time:"
        )

        keyboard = []
        emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣"]
        for idx, offer in enumerate(slot_offers):
            emoji = emojis[idx] if idx < len(emojis) else "📅"
            local_start = timezone.localtime(offer.start_datetime)
            time_str = local_start.strftime("%a %b %d at %I:%M %p")
            doc_name = html.escape(offer.doctor.name)
            btn_label = f"{emoji} {time_str} ({doc_name})"
            keyboard.append([{"text": btn_label, "callback_data": f"select_slot_{offer.id}"}])

        keyboard.append([{"text": "💬 Chat with Reception", "callback_data": f"ask_desk_{booking_request.id}"}])
        return text, {"inline_keyboard": keyboard}

    @staticmethod
    def format_confirmation(appointment: Appointment, clinic: ClinicSetting) -> tuple[str, dict]:
        """Formats instant booking confirmation card with reference code and arrival advice."""
        patient_name = html.escape(appointment.patient_name)
        doc_name = html.escape(appointment.doctor.name)
        service_name = html.escape(appointment.service.name)
        clinic_name = html.escape(clinic.clinic_name)
        clinic_address = html.escape(clinic.address or "Clinic Front Desk")

        local_start = timezone.localtime(appointment.start_datetime)
        date_str = local_start.strftime("%A, %B %d, %Y")
        time_str = local_start.strftime("%I:%M %p")

        text = (
            f"✅ <b>Appointment Confirmed!</b>\n\n"
            f"Hello <b>{patient_name}</b>, your visit at <b>{clinic_name}</b> is locked into our schedule.\n\n"
            f"📌 <b>Reference Code:</b> <code>{appointment.appointment_code}</code>\n"
            f"👨‍⚕️ <b>Doctor:</b> {doc_name} ({html.escape(appointment.doctor.specialty)})\n"
            f"🩺 <b>Service:</b> {service_name}\n"
            f"📅 <b>Date:</b> {date_str}\n"
            f"⏰ <b>Time:</b> {time_str}\n"
            f"📍 <b>Location:</b> {clinic_address}\n\n"
            f"<i>Please arrive 10 minutes prior to your time for vitals check-in.</i>"
        )

        keyboard = [
            [
                {"text": "❌ Cancel Appointment", "callback_data": f"cancel_{appointment.id}"},
                {"text": "💬 Help / Inquiries", "callback_data": f"help_{appointment.id}"}
            ]
        ]
        return text, {"inline_keyboard": keyboard}

    @staticmethod
    def format_pre_expiry_nudge(booking_request: BookingRequest, slot_offers, clinic: ClinicSetting) -> tuple[str, dict]:
        """45-minute friendly reminder (15 minutes left before offer window expires)."""
        service_name = html.escape(booking_request.service.name)
        text = (
            f"⏰ <b>Friendly Reminder: 15 Minutes Remaining!</b>\n\n"
            f"Your appointment choices for <b>{service_name}</b> expire in 15 minutes. "
            f"Tap an option below to secure your time before it is freed for other patients:"
        )

        keyboard = []
        emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣"]
        for idx, offer in enumerate(slot_offers):
            emoji = emojis[idx] if idx < len(emojis) else "📅"
            local_start = timezone.localtime(offer.start_datetime)
            time_str = local_start.strftime("%a %b %d at %I:%M %p")
            keyboard.append([{"text": f"{emoji} {time_str}", "callback_data": f"select_slot_{offer.id}"}])

        return text, {"inline_keyboard": keyboard}

    @staticmethod
    def format_graceful_expiry(booking_request: BookingRequest, clinic: ClinicSetting) -> tuple[str, dict]:
        """60-minute graceful expiry recovery message with 1-click re-request button."""
        patient_name = html.escape(booking_request.patient_name)
        clinic_name = html.escape(clinic.clinic_name)

        text = (
            f"⌛ <b>Appointment Offer Expired</b>\n\n"
            f"Hello <b>{patient_name}</b>, the previously offered times have expired to keep our calendar open for all patients.\n\n"
            f"We would still love to see you at <b>{clinic_name}</b>! Tap below to request fresh times from our front desk:"
        )

        keyboard = [
            [{"text": "🔄 See New Times", "callback_data": f"re_request_{booking_request.id}"}],
            [{"text": "💬 Chat with Reception", "callback_data": f"ask_desk_{booking_request.id}"}]
        ]
        return text, {"inline_keyboard": keyboard}

    @staticmethod
    def format_24h_reminder(appointment: Appointment, clinic: ClinicSetting) -> tuple[str, dict]:
        """24-Hour Pre-Visit reminder with interactive attendance buttons.

        The copy states the actual date and time - never "tomorrow" - because
        the 24h window is (now, now+24h] and an appointment 3 hours out is not
        tomorrow. Buttons use only callbacks the reply handler actually wires
        (confirm_attend_ / cancel_); a dead button would silently do nothing.
        """
        patient_name = html.escape(appointment.patient_name)
        doc_name = html.escape(appointment.doctor.name)
        clinic_name = html.escape(clinic.clinic_name)
        local_start = timezone.localtime(appointment.start_datetime)
        date_str = local_start.strftime("%a %d %b")
        time_str = local_start.strftime("%I:%M %p")

        text = (
            f"🔔 <b>Appointment Reminder</b>\n\n"
            f"Hello <b>{patient_name}</b>, your appointment at <b>{clinic_name}</b> is coming up:\n\n"
            f"👨‍⚕️ <b>Doctor:</b> {doc_name}\n"
            f"📅 <b>Date:</b> {date_str}\n"
            f"⏰ <b>Time:</b> {time_str}\n"
            f"📌 <b>Code:</b> <code>{appointment.appointment_code}</code>\n\n"
            f"Please let us know if you'll make it:"
        )

        keyboard = [
            [{"text": "✅ I'll Be There", "callback_data": f"confirm_attend_{appointment.id}"}],
            [{"text": "❌ Cancel", "callback_data": f"cancel_{appointment.id}"}]
        ]
        return text, {"inline_keyboard": keyboard}

    @staticmethod
    def format_2h_reminder(appointment: Appointment, clinic: ClinicSetting) -> tuple[str, dict]:
        """2-Hour Pre-Visit reminder. Same wired attendance buttons as the 24h
        reminder; copy states the actual date and time."""
        patient_name = html.escape(appointment.patient_name)
        doc_name = html.escape(appointment.doctor.name)
        clinic_name = html.escape(clinic.clinic_name)
        local_start = timezone.localtime(appointment.start_datetime)
        date_str = local_start.strftime("%a %d %b")
        time_str = local_start.strftime("%I:%M %p")

        text = (
            f"⏰ <b>Your Appointment Starts Soon</b>\n\n"
            f"Hello <b>{patient_name}</b>, your appointment at <b>{clinic_name}</b> "
            f"is on <b>{date_str}</b> at <b>{time_str}</b>:\n\n"
            f"👨‍⚕️ <b>Doctor:</b> {doc_name}\n"
            f"📌 <b>Code:</b> <code>{appointment.appointment_code}</code>\n\n"
            f"Please let us know if you'll make it:"
        )

        keyboard = [
            [{"text": "✅ I'll Be There", "callback_data": f"confirm_attend_{appointment.id}"}],
            [{"text": "❌ Cancel", "callback_data": f"cancel_{appointment.id}"}]
        ]
        return text, {"inline_keyboard": keyboard}

    @staticmethod
    def format_followup_recall(appointment: Appointment, task: FollowUpTask, clinic: ClinicSetting) -> tuple[str, dict]:
        """Doctor-directed follow-up recall. Under rule B the body is EXACTLY
        the message reception typed — there is no generic text. The button uses
        the wired `book_svc_` grammar so the patient lands straight in re-booking."""
        text = html.escape(task.patient_message)
        keyboard = [[{"text": "📅 Book Follow-Up Visit", "callback_data": f"book_svc_{appointment.service_id}"}]]
        return text, {"inline_keyboard": keyboard}

    @staticmethod
    def format_no_show_welfare(appointment: Appointment, clinic: ClinicSetting) -> tuple[str, dict]:
        """Supportive welfare message sent when patient misses their appointment."""
        patient_name = html.escape(appointment.patient_name)
        clinic_name = html.escape(clinic.clinic_name)

        text = (
            f"💙 <b>We Missed You Today at {clinic_name}</b>\n\n"
            f"Hello <b>{patient_name}</b>, we noticed you were unable to make your visit today. We hope everything is well!\n\n"
            f"Whenever you are ready to book a new appointment, tap below:"
        )
        keyboard = [[{"text": "📅 Book New Visit", "callback_data": "book_new"}]]
        return text, {"inline_keyboard": keyboard}

    @staticmethod
    def format_colleague_reassignment(appointment: Appointment, new_doctor, clinic: ClinicSetting) -> tuple[str, dict]:
        """Notice sent when doctor emergency sick leave reassigns visit to colleague."""
        patient_name = html.escape(appointment.patient_name)
        new_doc_name = html.escape(new_doctor.name)
        clinic_name = html.escape(clinic.clinic_name)
        local_start = timezone.localtime(appointment.start_datetime)
        time_str = local_start.strftime("%A, %B %d at %I:%M %p")

        text = (
            f"ℹ️ <b>Doctor Update for Your Visit</b>\n\n"
            f"Hello <b>{patient_name}</b>, your visit on <b>{time_str}</b> at <b>{clinic_name}</b> "
            f"has been reassigned to <b>{new_doc_name}</b> ({html.escape(new_doctor.specialty)}) "
            f"due to a doctor duty schedule change.\n\n"
            f"Your time slot and appointment reference (<code>{appointment.appointment_code}</code>) remain identical."
        )
        keyboard = [[{"text": "✅ Acknowledge & Keep Time", "callback_data": f"confirm_attend_{appointment.id}"}]]
        return text, {"inline_keyboard": keyboard}

    # -------------------------------------------------------------------------
    # Inbound Webhook Processing & Callback Action Router (Task 5.1)
    # -------------------------------------------------------------------------

    @classmethod
    def handle_telegram_webhook(cls, payload: dict) -> dict:
        """
        Parses Telegram webhook payload (message or callback_query).
        Executes atomic database transactions and answers callbacks.
        """
        clinic = ClinicSetting.get_settings()

        # Handle Inline Keyboard Callback Queries (button clicks)
        if 'callback_query' in payload:
            cq = payload['callback_query']
            callback_id = cq.get('id')
            callback_data = cq.get('data', '')
            from_user = cq.get('from', {})
            chat_id = cq.get('message', {}).get('chat', {}).get('id') or from_user.get('id')
            message_id = cq.get('message', {}).get('message_id')

            logger.info("Processing Telegram callback_data: %s from user %s", callback_data, from_user.get('id'))

            # Case 1: Slot Offer Selection (select_slot_{offer_id} or select_slot:{offer_id})
            if callback_data.startswith(('select_slot_', 'select_slot:')):
                offer_id = callback_data.replace('select_slot_', '').replace('select_slot:', '').strip()
                return cls._handle_slot_selection(
                    offer_id=offer_id,
                    callback_id=callback_id,
                    chat_id=chat_id,
                    message_id=message_id,
                    user_info=from_user,
                    clinic=clinic
                )

            # Case 2: Re-Request Expired Slots (re_request_{request_id} or re_request:{request_id})
            elif callback_data.startswith(('re_request_', 're_request:')):
                request_id = callback_data.replace('re_request_', '').replace('re_request:', '').strip()
                return cls._handle_re_request(
                    request_id=request_id,
                    callback_id=callback_id,
                    chat_id=chat_id,
                    clinic=clinic
                )

            # Case 3: Attendance Confirmation (confirm_attend_{appointment_id} or confirm_attend:{appointment_id})
            elif callback_data.startswith(('confirm_attend_', 'confirm_attend:')):
                appt_id = callback_data.replace('confirm_attend_', '').replace('confirm_attend:', '').strip()
                return cls._handle_confirm_attendance(
                    appointment_id=appt_id,
                    callback_id=callback_id,
                    chat_id=chat_id
                )

            # Case 4: Appointment Cancellation (cancel_{appointment_id} or cancel:{appointment_id})
            elif callback_data.startswith(('cancel_', 'cancel:')):
                appt_id = callback_data.replace('cancel_', '').replace('cancel:', '').strip()
                return cls._handle_cancellation(
                    appointment_id=appt_id,
                    callback_id=callback_id,
                    chat_id=chat_id
                )

            # Case 5: Interactive Clinic Service Booking (book_svc_{service_id})
            elif callback_data.startswith(('book_svc_', 'book_svc:')):
                svc_id = callback_data.replace('book_svc_', '').replace('book_svc:', '').strip()
                return cls._prompt_date_range(
                    service_id=svc_id,
                    callback_id=callback_id,
                    chat_id=chat_id,
                    message_id=message_id,
                    clinic=clinic
                )

            # Case 5b: Date Range Selection in Telegram (tg_rng_{service_id}_{days})
            elif callback_data.startswith('tg_rng_'):
                parts = callback_data.split('_')
                if len(parts) >= 4:
                    svc_id, days = parts[2], parts[3]
                    return cls._prompt_time_window(
                        service_id=svc_id,
                        days=days,
                        callback_id=callback_id,
                        chat_id=chat_id,
                        message_id=message_id,
                        clinic=clinic
                    )

            # Case 5c: Time Window Selection in Telegram (tg_win_{service_id}_{days}_{window})
            elif callback_data.startswith('tg_win_'):
                parts = callback_data.split('_')
                if len(parts) >= 5:
                    svc_id, days, window = parts[2], parts[3], parts[4]
                    return cls._prompt_gender(
                        service_id=svc_id,
                        days=days,
                        window=window,
                        callback_id=callback_id,
                        chat_id=chat_id,
                        message_id=message_id,
                        clinic=clinic
                    )

            # Case 5d: Finalize Telegram Intake with Gender (tg_gen_{service_id}_{days}_{window}_{gender})
            elif callback_data.startswith('tg_gen_'):
                parts = callback_data.split('_')
                if len(parts) >= 6:
                    svc_id, days, window, gender = parts[2], parts[3], parts[4], parts[5]
                    return cls._finalize_booking(
                        service_id=svc_id,
                        days=int(days) if days.isdigit() else 14,
                        window=window,
                        gender=gender,
                        callback_id=callback_id,
                        chat_id=chat_id,
                        message_id=message_id,
                        from_user=from_user,
                        clinic=clinic
                    )

            # Fallback for unrecognized button callbacks
            cls.answer_callback_query(callback_id, text="Action received.")
            return {'status': 'acknowledged', 'action': callback_data}

        # Handle Regular Inbound Messages (/start, inquiries)
        elif 'message' in payload:
            msg = payload['message']
            chat_id = msg.get('chat', {}).get('id')
            from_user = msg.get('from', {})
            text = (msg.get('text') or '').strip()
            message_id = msg.get('message_id')

            # Zero-partner route / Step 3 — the WEB → TELEGRAM handoff.
            # The public booking page hands the patient `t.me/<bot>?start=<token>`
            # (Step 2). Telegram delivers it here as "/start <token>" (or
            # "/start@bot <token>" in a group), and THIS is the only code that
            # binds a chat to a request. A token-less /start keeps the existing
            # welcome menu below, untouched.
            if chat_id and text.startswith('/'):
                command, _, command_arg = text.partition(' ')
                if command.split('@')[0].lower() == '/start' and command_arg.strip():
                    return cls._link_telegram_chat(
                        command_arg.strip(), chat_id, from_user, clinic,
                    )

            # Wave 4 / Step 4.4 — ONE reply engine on every channel. A plain
            # TEXT ("Reply 1", "cancel", ...) from a chat that belongs to a
            # booking request routes through the SAME handle_patient_reply
            # engine SMS/WhatsApp use: the chat id resolves the patient via
            # the `telegram_chat_id:<id>` marker, the inbound InteractionLog
            # row is the idempotency claim (the same primitive, the same key
            # scheme), and the engine's answer is delivered back here.
            # A chat with no booking history keeps the welcome menu — that is
            # an inquiry, not a reply.
            if chat_id and text and not text.startswith('/'):
                from .patient_reply import handle_patient_reply
                marker = BookingRequest.objects.filter(
                    patient_notes__contains=f'telegram_chat_id:{chat_id}',
                ).order_by('-created_at').first()
                if marker:
                    result = handle_patient_reply(
                        phone=marker.patient_phone,
                        text=text,
                        channel='telegram',
                        provider_message_id=f'tgmsg-{message_id}',
                    )
                    if result.get('reply_text'):
                        cls.send_message(chat_id, result['reply_text'])
                    result['chat_id'] = chat_id
                    return result

            clinic_name = html.escape(clinic.clinic_name)
            services = list(Service.objects.filter(is_active=True).order_by('name')[:6])
            service_buttons = []
            for svc in services:
                service_buttons.append([{"text": f"🩺 {svc.name} ({svc.duration_minutes}m)", "callback_data": f"book_svc_{svc.id}"}])

            welcome = (
                f"🏥 <b>Welcome to {clinic_name}!</b>\n\n"
                f"I am your automated booking assistant. I help you coordinate appointments directly with our doctors.\n\n"
                f"Please choose a service below to request appointment times from our front desk:"
            )
            cls.send_message(chat_id, welcome, reply_markup={"inline_keyboard": service_buttons})
            return {'status': 'welcomed', 'chat_id': chat_id, 'service_menu_sent': True}

        return {'status': 'ignored'}

    # -------------------------------------------------------------------------
    # Zero-partner route / Step 3 — web booking → Telegram handoff
    # -------------------------------------------------------------------------
    @classmethod
    def _link_telegram_chat(cls, token, chat_id, from_user, clinic):
        """
        Bind an incoming chat to the booking request that owns `token`.

        Rules, in order:
          1. Unknown token → refuse politely. No writes.
          2. Request no longer waiting (converted / rejected / offer_expired) →
             tell the truth. No writes.
          3. Chat already bound to this request → idempotent friendly answer.
          4. Request bound to ANOTHER chat → refuse. One chat per request, so a
             forwarded link cannot hijack somebody else's booking.
          5. Otherwise → write the `telegram_chat_id:<id>` marker (the same
             marker dispatch and the reply engine already read), audit it, and
             confirm with the request code.

        Django writes every sentence; the bot only delivers it.
        """
        clinic_name = html.escape(clinic.clinic_name)
        request_obj = BookingRequest.objects.filter(telegram_link_token=token).first()

        if not request_obj:
            cls.send_message(chat_id, (
                f"This booking link is not valid any more.\n\n"
                f"Please start a new request on the {clinic_name} website and we "
                f"will send you fresh times."
            ))
            return {'status': 'link_token_unknown', 'chat_id': chat_id}

        if request_obj.status in ('converted', 'rejected', 'offer_expired'):
            cls.send_message(chat_id, (
                f"Request <code>{request_obj.request_code}</code> is no longer "
                f"waiting for times, so it cannot be linked.\n\n"
                f"Please ask {clinic_name} for a fresh request."
            ))
            return {
                'status': 'link_request_closed',
                'chat_id': chat_id,
                'request_id': request_obj.request_code,
            }

        notes = request_obj.patient_notes or ''
        existing = re.search(r'telegram_chat_id:(\d+)', notes)

        if existing:
            if existing.group(1) == str(chat_id):
                cls.send_message(chat_id, (
                    f"This chat is already connected to "
                    f"<code>{request_obj.request_code}</code>.\n\n"
                    f"The front desk will send the available times here."
                ))
                return {
                    'status': 'already_linked',
                    'chat_id': chat_id,
                    'request_id': request_obj.request_code,
                }

            cls.send_message(chat_id, (
                f"This booking link is already connected to a different Telegram "
                f"chat.\n\n"
                f"For everyone's safety, please contact {clinic_name} so we can "
                f"verify the booking and send you a new link."
            ))
            return {
                'status': 'link_rejected_other_chat',
                'chat_id': chat_id,
                'request_id': request_obj.request_code,
            }

        marker = f'telegram_chat_id:{chat_id}'
        request_obj.patient_notes = f"{notes} {marker}".strip() if notes else marker
        request_obj.save(update_fields=['patient_notes', 'updated_at'])

        AuditLog.objects.create(
            entity_name='BookingRequest',
            entity_id=request_obj.id,
            action='TELEGRAM_LINKED',
            performed_by=f"Telegram:{chat_id}",
            changes={
                'request_code': request_obj.request_code,
                'channel': request_obj.channel,
            },
        )

        baby = html.escape(request_obj.patient_name.split(' ')[0] or 'there')
        cls.send_message(chat_id, (
            f"Connected, <b>{baby}</b>.\n\n"
            f"Your request <code>{request_obj.request_code}</code> for "
            f"<b>{html.escape(request_obj.service.name)}</b> is with the front desk.\n\n"
            f"Available times will arrive here as buttons — tap the one you want, "
            f"and it is held for you immediately."
        ))

        return {
            'status': 'linked',
            'chat_id': chat_id,
            'request_id': request_obj.request_code,
        }

    # -------------------------------------------------------------------------
    # Internal Handlers with Concurrency & Expiry Guards (EC-1, EC-2, EC-4)
    # -------------------------------------------------------------------------

    @classmethod
    def _handle_slot_selection(cls, offer_id, callback_id, chat_id, message_id, user_info, clinic):
        """Processes patient slot choice with atomic locking and expiry validation."""
        try:
            offer = SlotOffer.objects.select_related('request', 'doctor', 'request__service').get(id=offer_id)
        except (SlotOffer.DoesNotExist, ValueError):
            cls.answer_callback_query(callback_id, text="Error: Offer not found.", show_alert=True)
            return {'status': 'error', 'detail': 'Offer not found.'}

        # EC-1: Check 60-minute offer expiry
        if offer.expires_at < timezone.now() or offer.request.status == 'offer_expired':
            cls.answer_callback_query(
                callback_id,
                text="⚠️ These appointment options have expired to keep the schedule open.",
                show_alert=True
            )
            # Send graceful expiry re-engagement
            exp_text, exp_markup = cls.format_graceful_expiry(offer.request, clinic)
            cls.send_message(chat_id, exp_text, reply_markup=exp_markup)
            return {'status': 'expired_handled'}

        # EC-2: Rapid multi-click / already booked check
        if offer.is_selected or offer.request.status == 'converted':
            cls.answer_callback_query(callback_id, text="You already selected this appointment!", show_alert=True)
            if message_id:
                cls.edit_message_reply_markup(chat_id, message_id)
            return {'status': 'already_selected'}

        # EC-4: Atomic lock acquisition via HoldService
        try:
            appointment = HoldService.acquire_slot(
                doctor_id=offer.doctor.id,
                service_id=offer.request.service.id,
                start_datetime=offer.start_datetime,
                end_datetime=offer.end_datetime,
                patient_name=offer.request.patient_name,
                patient_phone=offer.request.patient_phone,
                booking_request_id=offer.request.id,
                is_hold=True,
                performed_by=f"TelegramUser:{chat_id}"
            )
            offer.is_selected = True
            offer.save(update_fields=['is_selected'])
            if offer.request and offer.request.status != 'converted':
                offer.request.status = 'converted'
                offer.request.save(update_fields=['status', 'updated_at'])
        except SlotConflictException:
            # Slot reserved by another patient a moment earlier
            cls.answer_callback_query(
                callback_id,
                text="That time was just reserved by another patient. Here are alternate times:",
                show_alert=True
            )
            return {'status': 'conflict_handled'}

        # Successfully held/confirmed! Strip buttons to prevent double-clicks (EC-2)
        cls.answer_callback_query(callback_id, text="Slot locked in! Generating confirmation...")
        if message_id:
            cls.edit_message_reply_markup(chat_id, message_id)

        # Send confirmation card
        conf_text, conf_markup = cls.format_confirmation(appointment, clinic)
        cls.send_message(chat_id, conf_text, reply_markup=conf_markup)

        # Broadcast real-time SSE update to Receptionist Hub
        broadcast_event('slot.held', {
            'appointment_code': appointment.appointment_code,
            'patient_name': appointment.patient_name,
            'doctor_name': appointment.doctor.name,
            'start_datetime': appointment.start_datetime.isoformat(),
        })

        return {'status': 'confirmed', 'appointment_code': appointment.appointment_code}

    @classmethod
    def _handle_re_request(cls, request_id, callback_id, chat_id, clinic):
        """Moves expired request to priority re-requested tab and notifies patient."""
        try:
            req = BookingRequest.objects.get(id=request_id)
        except (BookingRequest.DoesNotExist, ValueError):
            cls.answer_callback_query(callback_id, text="Request not found.", show_alert=True)
            return {'status': 'error'}

        req.status = 're_requested'
        req.save(update_fields=['status'])

        AuditLog.objects.create(
            entity_name='BookingRequest',
            entity_id=req.id,
            action='PATIENT_RE_REQUESTED_TIMES',
            performed_by=f"TelegramUser:{chat_id}",
            changes={'status': 're_requested'}
        )

        cls.answer_callback_query(
            callback_id,
            text="Reception has been notified! Fresh times are being prepared for you.",
            show_alert=True
        )

        reply_text = (
            f"🔄 <b>Fresh Times Requested</b>\n\n"
            f"Our front desk has received your request and is reviewing new available slots for you. "
            f"We will message you right here shortly!"
        )
        cls.send_message(chat_id, reply_text)

        broadcast_event('request.created', {
            'id': str(req.id),
            'request_code': req.request_code,
            'patient_name': req.patient_name,
            'status': 're_requested'
        })

        return {'status': 're_requested_handled'}

    @classmethod
    def _handle_confirm_attendance(cls, appointment_id, callback_id, chat_id):
        """Patient clicks [✅ I'll Be There]."""
        try:
            appt = Appointment.objects.get(id=appointment_id)
            appt.status = 'confirmed'
            appt.confirmed_at = timezone.now()
            appt.hold_expires_at = None
            appt.save(update_fields=['status', 'confirmed_at', 'hold_expires_at'])
            if appt.booking_request and appt.booking_request.status != 'converted':
                appt.booking_request.status = 'converted'
                appt.booking_request.save(update_fields=['status', 'updated_at'])

            # Wave 5 / Step 5.7(a): the confirmation names the REAL day —
            # the old sentence always said "See you tomorrow", even for a
            # visit next week.
            when = timezone.localtime(appt.start_datetime)
            cls.answer_callback_query(
                callback_id,
                text=f"Arrival confirmed for {when.strftime('%a, %d %b')} at "
                     f"{when.strftime('%I:%M %p').lstrip('0')}.",
            )
            cls.send_message(
                chat_id,
                f"✅ <b>Thank you {html.escape(appt.patient_name)}!</b> Your arrival has been confirmed for "
                f"<b>{timezone.localtime(appt.start_datetime).strftime('%I:%M %p')}</b> with {html.escape(appt.doctor.name)}."
            )
            return {'status': 'confirmed_attendance'}
        except (Appointment.DoesNotExist, ValueError):
            cls.answer_callback_query(callback_id, text="Appointment not found.", show_alert=True)
            return {'status': 'error'}

    @classmethod
    def _handle_cancellation(cls, appointment_id, callback_id, chat_id):
        """Patient clicks [❌ Cancel]."""
        try:
            appt = Appointment.objects.get(id=appointment_id)
            appt.status = 'cancelled'
            appt.cancelled_at = timezone.now()
            appt.cancellation_reason = 'Cancelled by patient via Telegram'
            appt.save(update_fields=['status', 'cancelled_at', 'cancellation_reason'])

            cls.answer_callback_query(callback_id, text="Appointment cancelled.")
            cls.send_message(
                chat_id,
                f"❌ <b>Appointment Cancelled</b>\n\n"
                f"Your appointment (<code>{appt.appointment_code}</code>) has been cancelled. "
                f"If you ever wish to re-book, feel free to message us anytime!"
            )
            return {'status': 'cancelled_by_patient'}
        except (Appointment.DoesNotExist, ValueError):
            cls.answer_callback_query(callback_id, text="Appointment not found.", show_alert=True)
            return {'status': 'error'}

    @classmethod
    def _prompt_date_range(cls, service_id, callback_id, chat_id, message_id, clinic):
        try:
            service = Service.objects.get(id=service_id)
        except (Service.DoesNotExist, ValueError):
            cls.answer_callback_query(callback_id, text="Service not found.", show_alert=True)
            return {'status': 'error'}

        cls.answer_callback_query(callback_id, text="Select date range")
        text = (
            f"🩺 <b>Selected: {html.escape(service.name)}</b>\n\n"
            f"🗓️ <b>What is your preferred date window?</b>\n"
            f"Our scheduling engine scans doctor shifts within this range to find candidate times:"
        )
        keyboard = [
            [{"text": "⚡ Next 7 Days", "callback_data": f"tg_rng_{service.id}_7"}],
            [{"text": "📅 Next 14 Days", "callback_data": f"tg_rng_{service.id}_14"}],
            [{"text": "🗓️ Next 30 Days", "callback_data": f"tg_rng_{service.id}_30"}],
        ]
        cls.send_message(chat_id, text, reply_markup={"inline_keyboard": keyboard})
        return {'status': 'prompted_date_range'}

    @classmethod
    def _prompt_time_window(cls, service_id, days, callback_id, chat_id, message_id, clinic):
        cls.answer_callback_query(callback_id, text="Select time of day")
        text = (
            f"⏰ <b>What time of day works best for your schedule?</b>"
        )
        keyboard = [
            [{"text": "☀️ Morning (08:00 – 12:00)", "callback_data": f"tg_win_{service_id}_{days}_morning"}],
            [{"text": "🌤️ Afternoon (13:00 – 17:00)", "callback_data": f"tg_win_{service_id}_{days}_afternoon"}],
            [{"text": "🌙 Evening (16:00 – 18:00)", "callback_data": f"tg_win_{service_id}_{days}_evening"}],
        ]
        cls.send_message(chat_id, text, reply_markup={"inline_keyboard": keyboard})
        return {'status': 'prompted_time_window'}

    @classmethod
    def _prompt_gender(cls, service_id, days, window, callback_id, chat_id, message_id, clinic):
        cls.answer_callback_query(callback_id, text="Select gender")
        text = (
            f"👤 <b>For medical records and clinical triage, please select the patient's gender:</b>"
        )
        keyboard = [
            [{"text": "👩 Female", "callback_data": f"tg_gen_{service_id}_{days}_{window}_Female"}],
            [{"text": "👨 Male", "callback_data": f"tg_gen_{service_id}_{days}_{window}_Male"}],
            [{"text": "⚧ Other / Neutral", "callback_data": f"tg_gen_{service_id}_{days}_{window}_Other"}],
        ]
        cls.send_message(chat_id, text, reply_markup={"inline_keyboard": keyboard})
        return {'status': 'prompted_gender'}

    @classmethod
    def _finalize_booking(cls, service_id, days, window, gender, callback_id, chat_id, message_id, from_user, clinic):
        try:
            service = Service.objects.get(id=service_id)
        except (Service.DoesNotExist, ValueError):
            cls.answer_callback_query(callback_id, text="Service not found.", show_alert=True)
            return {'status': 'error'}

        first_name = (from_user.get('first_name') or '').strip()
        last_name = (from_user.get('last_name') or '').strip()
        patient_name = f"{first_name} {last_name}".strip()
        if not patient_name:
            patient_name = from_user.get('username') or 'Telegram Patient'

        # Wave 5 / Step 5.7: Telegram never shares a phone number, and
        # inventing one from the chat id (+23480<last 8 digits>) can be a real
        # stranger's line — live SMS/WhatsApp would message them. Store the
        # truth: no phone. Only the Telegram card can reach this patient,
        # which the channel availability already reports for phoneless
        # bookings.
        patient_phone = ''

        today = timezone.now().date()
        start_date = today.isoformat()
        end_date = (today + datetime.timedelta(days=int(days))).isoformat()

        booking = BookingRequest.objects.create(
            patient_name=patient_name,
            patient_phone=patient_phone,
            patient_type='new',
            service=service,
            gender=gender,
            preferred_date_range={'start': start_date, 'end': end_date},
            preferred_time_window=window,
            channel='telegram',
            status='awaiting_review',
            patient_notes=f"Patient booked via Telegram @babawo_bot. Window: {window}, Gender: {gender}, Range: {start_date} to {end_date}. telegram_chat_id:{chat_id}",
        )

        AuditLog.objects.create(
            entity_name='BookingRequest',
            entity_id=booking.id,
            action='TELEGRAM_REQUEST_CREATED',
            performed_by=f"Telegram:{chat_id}",
            changes={'service': service.name, 'patient_name': patient_name, 'request_code': booking.request_code}
        )

        broadcast_event('request.created', {
            'id': str(booking.id),
            'request_id': booking.request_code,
            'patient_name': booking.patient_name,
            'service': service.name,
            'gender': gender,
            'preferred_date_range': {'start': start_date, 'end': end_date},
            'preferred_time_window': window,
            'channel': 'telegram',
            'created_at': booking.created_at.isoformat()
        })

        cls.answer_callback_query(callback_id, text="Booking submitted!")

        confirm_msg = (
            f"📋 <b>Booking Request Submitted!</b>\n\n"
            f"Hello <b>{html.escape(patient_name)}</b>, our reception has received your appointment request:\n\n"
            f"🩺 <b>Service:</b> {html.escape(service.name)}\n"
            f"🗓️ <b>Date Range:</b> <code>{start_date}</code> &rarr; <code>{end_date}</code>\n"
            f"⏰ <b>Preferred Window:</b> {window.capitalize()}\n"
            f"👤 <b>Gender:</b> {gender}\n"
            f"📌 <b>Request Code:</b> <code>{booking.request_code}</code>\n"
            f"⏱️ <b>Status:</b> <i>Awaiting Front-Desk Review</i>\n\n"
            f"Our front desk is reviewing doctor schedules right now. As soon as reception approves candidate times, "
            f"you will receive interactive slot buttons right here in Telegram to lock in your visit!"
        )
        cls.send_message(chat_id, confirm_msg)

        return {'status': 'booking_request_created', 'request_id': booking.request_code}
