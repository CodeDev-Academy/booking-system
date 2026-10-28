# n8n Automation Workflows — Master Plan & Blueprint (`n8n.md`)

This document is the **complete operational and architectural blueprint** for all workflow automations in the **MedPulse Receptionist-Approved Clinic Booking System**.
It details how self-hosted **n8n** functions as the glue between patient messaging channels (Telegram Bot & WhatsApp) and the Django REST Framework backend.

---

## 1. High-Level Automation Topology

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             PATIENT CHANNELS                                │
│   • Telegram Bot (@MedPulseClinicBot)         • WhatsApp Cloud API          │
│   • Web Booking Form Widget                   • Direct Text Replies         │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ HTTPS Webhooks
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      n8n WORKFLOW ENGINE (Railway)                          │
│                                                                             │
│  [Workflow 1] Inbound Intake Webhook & Normalization                        │
│  [Workflow 2] 60-Second Temporary Hold & Offer Expiry Sweeper               │
│  [Workflow 3] 24-Hour & 2-Hour Pre-Visit Reminders                          │
│  [Workflow 4] Patient Response & Interactive Button Click Handler           │
│  [Workflow 5] Receptionist Approved Slot Dispatch Bridge                    │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Authenticated REST API (X-Webhook-Secret)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      DJANGO BACKEND REST API (/api/v1/)                     │
│  • Booking Request Queue (FIFO)          • Deterministic Availability Engine│
│  • Atomic Slot Holds (select_for_update) • Today's Live Clinic Queue        │
│  • Clinic Settings & Operating Hours     • Immutable Audit Trail            │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. The 5 Core n8n Workflows: Comprehensive Execution Plan

---

### Workflow 1: Patient Inbound Intake & Webhook Normalizer
- **Template File**: `n8n/01_intake_webhook.json`
- **Purpose**: Ingest raw patient inquiries from all external channels, validate and sanitize the input, and register a new booking request in the receptionist queue.

#### Node Pipeline & Data Flow:
```
[Webhook Node] (POST /webhook/intake)
       │
       ▼
[Code Node: Input Normalizer]
  • Normalize phone to E.164 (+234...)
  • Validate service_id & preferred 2-week date range
  • Map channel ('telegram', 'whatsapp', 'web')
       │
       ▼
[HTTP Request Node: Django API]
  • POST to http://backend:8000/api/v1/booking-requests/
  • Header: X-Webhook-Secret: {{ $env.DJANGO_WEBHOOK_SECRET }}
       │
       ▼
[IF Node: Operating Hours Check]
  • Is current clinic status Open or Closed?
       ├── TRUE (Open Hours):
       │     └─► [Messaging Node: Telegram/WhatsApp]
       │           Send Template 0: "Thank you! Your request is in our queue. Front desk will review shortly."
       └── FALSE (After Hours):
             └─► [Messaging Node: Telegram/WhatsApp]
                   Send Template 4: "Front desk is closed. You are #1 in tomorrow morning's queue (8:00 AM)."
```

---

### Workflow 2: 60-Second Temporary Hold & Offer Expiry Sweeper
- **Template File**: `n8n/02_hold_and_offer_expiry_cron.json`
- **Purpose**: Runs every 60 seconds as a high-reliability cron sweeper. It triggers backend expiration routines, re-engages unresponsive patients, and releases abandoned slot locks.

#### Node Pipeline & Data Flow:
```
[Schedule Trigger Node] (Cron: */1 * * * * — Every 60s)
       │
       ▼
[HTTP Request Node: Sweep Endpoint]
  • POST to http://backend:8000/api/v1/webhooks/expiry-sweep/
       │
       ▼
[Code Node: Response Processor]
  • Output contains:
    - expired_offers: Array of requests whose 60m offer window elapsed
    - expired_holds: Array of appointments whose 15m hold elapsed
    - pre_expiry_nudges: Array of requests at minute 45 (15m left)
       │
       ▼
[Split In Batches / Switch Node]
       ├── Branch A: Pre-Expiry Nudges (Minute 45)
       │     └─► [Telegram / WhatsApp Node]
       │           Send Template 2: "Friendly reminder: Your slots expire in 15 minutes. Tap to confirm."
       │
       ├── Branch B: Expired Offers (Minute 60)
       │     └─► [Telegram / WhatsApp Node]
       │           Send Graceful Expiry Recovery Message:
       │           "The previous times expired to keep our calendar open. We'd still love to see you!"
       │           Buttons: [🔄 See New Times]  [💬 Chat with Reception]
       │
       └── Branch C: Expired Holds (15m unconfirmed)
             └─► Backend automatically freed slot; logs event in AuditLog.
```

---

### Workflow 3: Automated Pre-Visit Reminders & Follow-Ups
- **Template File**: `n8n/03_reminder_flows.json`
- **Purpose**: Runs on scheduled cron to check for appointments occurring tomorrow (24h reminder) or in 2 hours, and sends interactive confirmation buttons.

#### Node Pipeline & Data Flow:
```
[Schedule Trigger Node] (Cron: 0 8,18 * * * — Twice daily at 8am and 6pm)
       │
       ▼
[HTTP Request Node: Fetch Due Reminders]
  • GET http://backend:8000/api/v1/appointments/upcoming-reminders/
       │
       ▼
[Item Lists Node: Split Items into Individual Appointments]
       │
       ▼
[IF Node: Reminder Type]
       ├── Branch 1: 24-Hour Notice
       │     └─► [Telegram / WhatsApp Node]
       │           Send Template 7: "Appointment Reminder for Tomorrow with Dr. {{doctor_name}} at {{time}}"
       │           Inline Keyboard: [✅ I'll Be There]  [🔄 Reschedule]  [❌ Cancel]
       │
       └── Branch 2: Doctor-Directed Follow-up Recall (e.g. 6-Month Dental Checkup)
             └─► [Telegram / WhatsApp Node]
                   Send Recall Template: "Dr. Bello recommended a routine checkup this month. Click to book."
```

---

### Workflow 4: Patient Response & Interactive Button Click Handler
- **Template File**: `n8n/04_patient_response_handler.json`
- **Purpose**: Ingests interactive callback clicks from Telegram Inline Keyboards and WhatsApp button clicks, and routes them to the correct transactional backend endpoint.

#### Node Pipeline & Data Flow:
```
[Webhook Node: Telegram/WhatsApp Inbound Callback]
       │
       ▼
[Switch Node: Action Router (Evaluates callback_data)]
       │
       ├── Case 'select_slot_{slot_offer_id}':
       │     • HTTP POST http://backend:8000/api/v1/slots/hold/
       │     • If 200 OK: Send Confirmation Card (AP-1042) + Calendar instructions.
       │     • If 409 Conflict: Send Template 3C ("Slot just reserved! Here are alternative times...").
       │
       ├── Case 'confirm_attendance_{appointment_id}':
       │     • HTTP PATCH http://backend:8000/api/v1/appointments/{id}/status/ (status: 'confirmed')
       │     • Reply: "Thank you! Your arrival is confirmed. See you soon!"
       │
       ├── Case 'cancel_booking_{appointment_id}':
       │     • HTTP PATCH http://backend:8000/api/v1/appointments/{id}/status/ (status: 'cancelled')
       │     • Reply: "Your appointment has been cancelled. Tap below if you ever wish to rebook."
       │
       └── Case 're_request_slots_{request_id}':
             • HTTP POST http://backend:8000/api/v1/booking-requests/{id}/re-request/
             • Moves card into receptionist's priority "⚡ Re-Requested Slots" tab.
             • Reply: "Front desk is preparing fresh available times for you right now!"
```

---

### Workflow 5: Receptionist Approved Slot Dispatch Bridge
- **Template File**: `n8n/05_slot_offer_dispatcher.json`
- **Purpose**: Triggered when the receptionist clicks **`[Approve & Dispatch Options]`** on the dashboard. Formats the candidate slots into interactive buttons and delivers them to the patient.

#### Node Pipeline & Data Flow:
```
[Webhook Node: Dispatch Trigger from Django]
  • Fired by Django View: POST /api/v1/booking-requests/{id}/dispatch-offers/
  • Payload: Patient details, Channel, 3 Candidate Slots (start/end, doctor, is_alternative)
       │
       ▼
[IF Node: Channel Switch]
       ├── Branch A: Telegram
       │     └─► [Telegram Bot Node: SendMessage]
       │           Format Markdown text with 1-hour expiry notice.
       │           Attach InlineKeyboardMarkup with 3 buttons:
       │           [[ { text: "1️⃣ 10:00 AM (Dr. Bello)", callback_data: "select_slot_123" } ],
       │            [ { text: "2️⃣ 11:30 AM (Dr. Bello)", callback_data: "select_slot_124" } ],
       │            [ { text: "3️⃣ 02:00 PM (Dr. Okafor)", callback_data: "select_slot_125" } ]]
       │
       └── Branch B: WhatsApp
             └─► [WhatsApp Cloud API Node: Interactive Message]
                   Send Interactive List or Reply Buttons.
```

---

## 3. Webhook Security & Idempotency Governance

1. **Authentication Header**:
   - Every webhook between Django and n8n requires the shared secret:
     ```http
     X-Webhook-Secret: {{ DJANGO_WEBHOOK_SECRET }}
     ```
   - Requests without this valid header are rejected immediately with `401 Unauthorized`.

2. **Idempotency & Deduplication**:
   - Every message dispatch includes an `idempotency_key` (e.g. `req_{id}_sweep_{timestamp}`).
   - n8n checks a Redis/local memory cache before processing duplicate webhook retries to prevent double-messaging patients.

3. **Fault Tolerance & Failure Alerting**:
   - Every workflow contains an **Error Trigger Node**.
   - If an HTTP request to Django fails (e.g., backend restarting), n8n retries 3 times with exponential backoff (1s, 5s, 15s).
   - If all retries fail, an alert is posted to the clinic admin Telegram log group.

---

## 4. White-Label Agency Portability (Cloning for a New Clinic)

To onboard a new clinic client in under 15 minutes:

| Step | Action | Description |
| :--- | :--- | :--- |
| **Step 1** | Export/Import | All 5 workflows are stored as clean JSON files in `n8n/`. Import directly into n8n via UI or API. |
| **Step 2** | Set Variables | Fill `.env` with new clinic's `TELEGRAM_BOT_TOKEN`, `DJANGO_API_BASE_URL`, and `DJANGO_WEBHOOK_SECRET`. |
| **Step 3** | Set Webhook | Run `curl -F "url=https://n8n.clientclinic.com/webhook/telegram" https://api.telegram.org/bot<TOKEN>/setWebhook`. |
| **Step 4** | Activate | Turn on all 5 workflows. The clinic automation is live! |

---

## 5. Summary Matrix of Workflow JSONs

| Workflow Name | File Path | Trigger | Primary Action |
| :--- | :--- | :--- | :--- |
| **Intake Webhook** | `n8n/01_intake_webhook.json` | Webhook (`/webhook/intake`) | Ingest, sanitize, post to Django queue |
| **Hold & Expiry Sweeper** | `n8n/02_hold_and_offer_expiry_cron.json` | Cron (`*/1 * * * *`) | Check 60m offer and 15m hold expiries |
| **Reminder Flows** | `n8n/03_reminder_flows.json` | Cron (Twice daily) | Dispatch 24h & 2h pre-visit interactive buttons |
| **Patient Response Handler** | `n8n/04_patient_response_handler.json` | Webhook (`/webhook/messaging/inbound`) | Route inline buttons (Hold, Confirm, Cancel, Re-Request) |
| **Slot Offer Dispatcher** | `n8n/05_slot_offer_dispatcher.json` | Webhook (`/webhook/dispatch-offers`) | Format & send approved 1h slot buttons to patient |
