import json
import html
import logging
import urllib.request
import urllib.error
from django.utils import timezone
from django.conf import settings
from django.db import transaction

from ..models import (
    ClinicSetting,
    BookingRequest,
    SlotOffer,
    Appointment,
    AuditLog,
    IdempotencyKey,
)
from .hold_service import HoldService, SlotConflictException
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
        """Retrieves Telegram bot token from ClinicSetting or Django settings."""
        clinic = ClinicSetting.get_settings()
        token = clinic.custom_config.get('telegram_bot_token')
        if token:
            return str(token)
        return getattr(settings, 'TELEGRAM_BOT_TOKEN', '')

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
            logger.warning("Telegram API HTTP error %d: %s", e.code, error_body)
            # EC-5: Bot blocked by patient (403 Forbidden)
            if e.code == 403:
                AuditLog.objects.create(
                    entity_name='TelegramService',
                    action='TELEGRAM_BOT_BLOCKED_BY_USER',
                    performed_by='System',
                    changes={'method': method, 'error': error_body}
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
        """24-Hour Pre-Visit reminder with interactive confirmation/reschedule buttons."""
        patient_name = html.escape(appointment.patient_name)
        doc_name = html.escape(appointment.doctor.name)
        clinic_name = html.escape(clinic.clinic_name)
        local_start = timezone.localtime(appointment.start_datetime)
        time_str = local_start.strftime("%I:%M %p")

        text = (
            f"🔔 <b>Appointment Reminder for Tomorrow</b>\n\n"
            f"Hello <b>{patient_name}</b>, this is a reminder of your appointment tomorrow at <b>{clinic_name}</b>:\n\n"
            f"👨‍⚕️ <b>Doctor:</b> {doc_name}\n"
            f"⏰ <b>Time:</b> {time_str}\n"
            f"📌 <b>Code:</b> <code>{appointment.appointment_code}</code>\n\n"
            f"Please let us know if you'll make it:"
        )

        keyboard = [
            [{"text": "✅ I'll Be There", "callback_data": f"confirm_attend_{appointment.id}"}],
            [
                {"text": "🔄 Reschedule", "callback_data": f"reschedule_{appointment.id}"},
                {"text": "❌ Cancel", "callback_data": f"cancel_{appointment.id}"}
            ]
        ]
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

            # Fallback for unrecognized button callbacks
            cls.answer_callback_query(callback_id, text="Action received.")
            return {'status': 'acknowledged', 'action': callback_data}

        # Handle Regular Inbound Messages (/start, inquiries)
        elif 'message' in payload:
            msg = payload['message']
            chat_id = msg.get('chat', {}).get('id')
            text = (msg.get('text') or '').strip()

            if text.startswith('/start'):
                clinic_name = html.escape(clinic.clinic_name)
                welcome = (
                    f"🏥 <b>Welcome to {clinic_name}!</b>\n\n"
                    f"I am your automated booking assistant. I help you coordinate appointments with our doctors.\n\n"
                    f"To request a consultation, you can book on our website or reply with your desired service."
                )
                cls.send_message(chat_id, welcome)
                return {'status': 'welcomed', 'chat_id': chat_id}

        return {'status': 'ignored'}

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
            appt.save(update_fields=['status', 'confirmed_at'])
            if appt.booking_request and appt.booking_request.status != 'converted':
                appt.booking_request.status = 'converted'
                appt.booking_request.save(update_fields=['status', 'updated_at'])

            cls.answer_callback_query(callback_id, text="Arrival confirmed! See you tomorrow.")
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
