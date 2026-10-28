# n8n Automation Workflows Directory (`n8n/`)

This directory contains the production-ready, modular workflow JSON templates for the **MedPulse Receptionist-Approved Clinic Booking System**.

---

## 📁 Workflow Manifest

| File | Name | Trigger | Action |
| :--- | :--- | :--- | :--- |
| `01_intake_webhook.json` | **Patient Inbound Intake & Normalizer** | Webhook (`POST /webhook/intake`) | Ingests raw patient inquiries, normalizes phone to E.164 (+234...), registers booking in Django queue, checks operating hours, and responds with queue acknowledgment. |
| `02_hold_and_offer_expiry_cron.json` | **60-Second Temporary Hold & Expiry Sweeper** | Cron (`*/1 * * * *`) | Calls Django sweep API every 60s, dispatches 45-minute pre-expiry friendly nudges, sends 60-minute graceful expiry recovery messages with `[🔄 See New Times]`, and releases expired holds. |
| `03_reminder_flows.json` | **Pre-Visit Reminders & Follow-Ups** | Cron (`0 8,18 * * *`) | Twice-daily check for tomorrow's appointments (24h reminder) and doctor-directed clinical follow-up recall tasks with interactive confirmation buttons. |
| `04_patient_response_handler.json` | **Patient Response Interactive Router** | Webhook (`POST /webhook/messaging/inbound`) | Handles Telegram inline callback buttons (`select_slot_...`, `confirm_attend_...`, `cancel_...`, `re_request_slots_...`), communicates with Django, and updates appointment state. |
| `05_slot_offer_dispatcher.json` | **Receptionist Approved Slot Dispatch Bridge** | Webhook (`POST /webhook/dispatch-offers`) | Triggered when receptionist approves card in dashboard; formats 3 candidate times into interactive Telegram buttons with 1-hour expiry countdown. |

---

## 🚀 15-Minute Agency Setup Guide

### 1. Environment Variables in n8n
Configure the following environment variables in your n8n Railway/Docker instance:

```env
DJANGO_API_BASE_URL=http://backend:8000
DJANGO_WEBHOOK_SECRET=clinic_dev_secret_2026
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrSTUvwxYZ
WHATSAPP_PHONE_NUMBER_ID=optional_phone_id
WHATSAPP_ACCESS_TOKEN=optional_meta_access_token
```

### 2. Importing into n8n
1. Open your n8n dashboard (e.g. `https://n8n.yourclinic.com`).
2. Go to **Workflows** ➔ Click **Add Workflow** ➔ Click **Import from File...**
3. Select each `.json` file from this directory:
   - `01_intake_webhook.json`
   - `02_hold_and_offer_expiry_cron.json`
   - `03_reminder_flows.json`
   - `04_patient_response_handler.json`
   - `05_slot_offer_dispatcher.json`
4. Toggle each workflow from **Inactive** to **Active**.

### 3. Telegram Bot Webhook Configuration
To route Telegram messages through n8n instead of direct Django:
```bash
curl -F "url=https://n8n.yourclinic.com/webhook/messaging/inbound" \
     https://api.telegram.org/bot<YOUR_TELEGRAM_BOT_TOKEN>/setWebhook
```

### 4. Dual-Engine Operation (Django Direct vs n8n Mode)
In your Django backend clinic settings:
- **Mode A (`django_direct`)**: Django handles webhooks directly via `TelegramService` (zero n8n required).
- **Mode B (`n8n_webhook`)**: n8n handles incoming webhooks and triggers Django REST API endpoints with `X-Webhook-Secret`.
