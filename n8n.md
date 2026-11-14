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

## 5. Voice & SMS Provider Integration — Connection Model & Readiness Plan

**Status: PLANNING (2026-11-13). No code yet.** Decisions below are locked; the build follows
the sequence in §5.7.

### 5.1 The two directions (why the Vapi video looked so simple)

The video showed a **Vapi agent with the n8n webhook URL pasted into it**. That is only the
**inbound** half of the integration:

```
OUTBOUND (we start the call)              INBOUND (provider reports back)
n8n ──API key──► Provider                Provider ──webhook URL──► n8n
POST /call {assistantId, to, params}     {event: ended, status, transcript…}
```

- Pasting the webhook URL in the agent config makes the provider **call us** on call events.
- It does **not** let us start a call — that needs the provider's **API key + outbound endpoint**.
- Both halves are required for the dispatch nudge: n8n starts the call, then logs the outcome.

### 5.2 Actual provider split (decided — updated 2026-11-13)

| Capability | Provider | Why |
|---|---|---|
| Voice call (nudge) | **VoiceBip** (same partner account) | One account for voice + SMS; the Vapi video was only the connection pattern |
| SMS | **VoiceBip** | Partner supplies sender ID + SMS endpoint |
| WhatsApp / Telegram | Telegram (current stand-in) → WhatsApp Cloud API later | Unchanged |

**Correction recorded:** the voice leg is **VoiceBip, not Vapi**. Vapi stays in this document
only as the worked example of the two-direction pattern, and as a future alternative.

The adapter is **provider-agnostic**: voice and SMS are separate config blocks, so switching
voice provider again later (e.g. to Vapi) is a config edit, not a graph rebuild.

### 5.3 Voice is a NUDGE ONLY (no DTMF — decided)

- The call says: *"Your appointment options are ready — please check your WhatsApp/SMS and pick
  a time."* It does **not** read the options and does **not** accept 1/2/3 keypad input.
- Consequences: no DTMF handler, no option resolution by voice, no re-prompt loop.
- Option numbers are still resolved only by the backend (Workflow C), never by the call.
- If a patient presses keys anyway, the agent ignores it — the booking still happens on
  WhatsApp/SMS/Telegram.

### 5.4 Script ownership (decided: partner now, platform later)

- **Now:** the call script lives on the provider's voice agent (configured on the VoiceBip
  side). n8n sends only dynamic variables
  (`patient_name`, `clinic_name`, `service_name`, `options_count`, `expiry_minutes`).
- **Future:** script moves to our platform. Reserved config switch:
  `VOICE_SCRIPT_SOURCE=partner | platform`, plus a reserved payload field
  `assistant_overrides` (prompt/firstMessage/voice) that is simply omitted today.
- The adapter must be written so that adding `assistant_overrides` is a **config change**, not
  a graph rebuild.

### 5.5 Config contract (the only thing that changes when credentials land)

```
# VoiceBip — one account covers BOTH voice and SMS
VOICEBIP_API_URL=
VOICEBIP_API_KEY=
VOICEBIP_VOICE_AGENT_ID=     # outbound "assistant" to run (assistant IDs)
VOICEBIP_CALLER_ID=          # phone number ID / DID shown as caller
VOICE_SCRIPT_SOURCE=partner
VOICEBIP_SMS_SENDER_ID=Cedarcare

# Alternative voice provider (kept for reference; swapping = edit this block)
VAPI_API_URL=https://api.vapi.ai
VAPI_API_KEY=
VAPI_ASSISTANT_DISPATCH=
VAPI_PHONE_NUMBER_ID=

# Test switch — mock adapter returns realistic responses + simulated callbacks
PROVIDER_MOCK=true
PROVIDER_MOCK_FAIL=false      # true → the simulator rejects every send (tests Needs Attention)
PROVIDER_SIMULATOR_URL=http://127.0.0.1:5678/webhook/provider-sim
```

Rules: no node hardcodes a URL or key; one adapter Code node builds every provider request;
switching provider = editing this block only.

**How mock mode works (updated at Stage D-3).** `PROVIDER_MOCK=true` does **not** skip the
send nodes. It points every provider URL at `06_Provider_Simulator` — a small n8n workflow
that answers `/webhook/provider-sim/{whatsapp|sms|voice}` with a realistic provider payload
(`external_ref: mock-<channel>-<request_code>`) or an HTTP **500** when
`PROVIDER_MOCK_FAIL=true`. Consequences:

- The real HTTP nodes, their auth headers and their JSON bodies run exactly as in production,
  so a green mock run is meaningful.
- Failures travel the **real** error path (`onError: continueErrorOutput` → failure log →
  Needs Attention tab), not a simulated branch.
- Flipping live is still config only: `PROVIDER_MOCK=false` + real `VOICEBIP_*` /
  `WHATSAPP_*` values. The simulator workflow can then be deactivated and deleted.

### 5.6 Channel-availability guard (Option B — decided)

A web patient with no Telegram and no configured WhatsApp/SMS/voice currently receives
**nothing** while the dashboard says "dispatched". Fix, in two layers:

1. **Backend (authoritative):** `DispatchOffersView` computes reachable channels for the
   patient (telegram if `telegram_chat_id`; whatsapp/sms/voice if provider configured and the
   checkbox is on). If none are reachable → reject with a clear error code
   (e.g. `409 NO_REACHABLE_CHANNEL`) instead of silently firing nothing.
2. **Dashboard (preventive):** the ReviewModal shows channel availability next to the
   checkboxes (disabled + reason when a provider is not configured), so reception sees the
   problem before clicking Approve & Dispatch.

Availability is reported by the backend (config-driven), never hardcoded in React.

**Implementation status (2026-11-13):**

| Layer | Scope | State |
|---|---|---|
| 1 | Read-only resolver `appointments/services/channel_availability.py` + `GET /api/v1/booking-requests/{id}/channel-availability/` | **DONE** (8 tests, behaviour-neutral) |
| 2 | Advisory `delivery` / `delivery_warning` fields on `dispatch-offers` (status stays 200) | **DONE** (5 tests, nothing blocked) |
| 3 | Dashboard availability hints in the ReviewModal + `409 NO_REACHABLE_CHANNEL` rollback | **DONE** (display only, no blocking) |
| 4 | Enforcement behind `DISPATCH_REQUIRE_REACHABLE_CHANNEL` (default **off**) | **DONE** (default off; opt-in 409) |

Layer 1 contract (also documented in `API_REFERENCE.md`):

- Config signals: `TELEGRAM_BOT_TOKEN` (Django sends that leg itself) plus the explicit
  enable flags `WHATSAPP_ENABLED`, `SMS_ENABLED`, `VOICE_ENABLED`. Flags — not credentials —
  because provider secrets live in n8n.
- Telegram `chat_id` + token makes the **`whatsapp`** channel reachable (`via: "telegram"`),
  matching today's dispatch behaviour where Telegram is the WhatsApp stand-in.
- Response keys: `channels` (whatsapp/sms/voice/telegram, each with
  `configured`/`reachable`/`via`/`reason`), `reachable`, `unreachable`, `none`,
  `telegram_chat_id`, `request_id`.
- **No side effects:** no DB writes, no network calls, no provider invocation. Nothing in
  `DispatchOffersView` changed in this layer.
- Why it is not a duplicate of **Needs Attention**: that tab is reactive (an attempted send
  failed and wrote an `InteractionLog`). A dispatch that reaches nobody writes no log at all,
  so the tab stays green while the patient receives nothing. The guard closes that gap.

Layer 2 contract — advisory `delivery` / `delivery_warning` on `dispatch-offers`:

- `delivery = {requested, reachable, unreachable, warning}`; `requested` is the receptionist's
  checkbox selection intersected with the dispatch channels, `reachable`/`unreachable` are that
  selection split by the resolver's verdict, and `delivery_warning` mirrors `delivery.warning`.
- Warning wording: partial → *"SMS and voice call cannot reach this patient — only WhatsApp
  will be used."*; none reachable → *"None of the selected channels can reach this patient —
  nothing will be delivered. Call the patient directly, or configure a provider."*;
  all reachable → `null`.
- **Never blocking:** status stays `200`, offers are still created, Telegram/n8n still fire
  exactly as before. Existing response keys are untouched (pinned by a regression test).
- `PATIENT_ALREADY_BOOKED` remains the **first** guard and its `409` response carries no
  `delivery` key (precedence pinned by a test).

Layer 3 contract — dashboard hints (display only, never blocks):

- `apiService.getChannelAvailability(id)` → the Layer 1 endpoint; the hook
  (`useTriageQueue`) fetches it when the ReviewModal opens for the selected request.
- **Fail silent:** while loading, in demo mode, or on error the payload is `null` and the
  modal shows **no hints** — never a false alarm, and no flicker.
- Each unreachable channel gets a ⚠ marker with the backend `reason` on hover; the checkbox
  stays **enabled** and dispatch is never blocked. A single advisory sentence appears under
  the channel strip (`services/channelAvailability.js` mirrors the backend wording).
- After dispatch, a returned `delivery_warning` replaces the success toast with an **amber**
  warning — reception is told the truth even though the offers were created.
- `409 NO_REACHABLE_CHANNEL` (Layer 4) already has its rollback path in the queue store,
  mirroring `PATIENT_ALREADY_BOOKED`; it is dormant until the flag is enabled.

Layer 4 contract — enforcement (opt-in, default OFF):

- `DISPATCH_REQUIRE_REACHABLE_CHANNEL` is read from the environment into
  `settings.DISPATCH_REQUIRE_REACHABLE_CHANNEL` (default `False`); `enforcement_enabled()`
  in the resolver is the single read point.
- When ON and the selected channels reach nobody, `dispatch-offers` returns
  **409 `NO_REACHABLE_CHANNEL`** *before* deleting previous offers, creating new ones,
  writing the audit log, broadcasting SSE, or calling Telegram/n8n.
- `PATIENT_ALREADY_BOOKED` still takes precedence when both apply.
- Rollback is a **config change** (env var), not a deploy of new code — instant on/off.
- The dashboard already rolls the optimistic update back on this 409, so flipping the flag
  needs no frontend change.

### 5.7 Build sequence (mock-first, so "connect the API" is the only step left)

1. **Channel-availability guard** — backend + dashboard (no provider needed; fully testable).
   ✅ Done (Option B layers 1–4).
2. **Mock provider adapter** — `PROVIDER_MOCK=true` returns fake call IDs/statuses and can
   simulate callbacks; lets the whole D graph, logging and dashboard run today.
   ✅ Done (Stage D-1, live workflow `GtpeOwfnG8yYyAxq`).
3. **Voice guard** — Wait 30s → `GET dispatch-status/` → skip when the patient already replied.
   ✅ Done (Stage D-2; probe errors fail closed — no call is placed).
4. **InteractionLog nodes** — after every provider branch (sent / failed / no_answer), tested
   against mock responses. ✅ Done (Stage D-3; one Code log node per branch, posts to
   `POST /api/v1/interactions/`).
5. **Callback receiver** — one authenticated webhook for provider events; idempotent upsert by
   `external_ref`; status rank so late events never downgrade a row. ⏳ Stage D-4
   (`07_provider_callback.json`).
6. **Flip to live** — fill §5.5, set `PROVIDER_MOCK=false`, enable the provider nodes, re-run
   the sample payload, then one real call to a test number. ⏳ Stage D-5.

### 5.8 Edge cases owned by this integration

- Partial dispatch where the only checked channel is unconfigured → guard blocks it (§5.6).
- Duplicate dispatch → existing `PATIENT_ALREADY_BOOKED` guard + idempotency key per provider call.
- Offer expires while the call is ringing → log the call, flag the mismatch, never resurrect the offer.
- Call window 08:00–19:00 Africa/Lagos; call started at 18:59 still completes.
- Retry policy: max 2 attempts, backoff; each attempt logged separately with its own `external_ref`.
- DND / invalid number → `failed` (not `no_answer`).
- Duplicate or out-of-order callbacks → upsert by `external_ref`, status rank enforced.
- Provider key missing/invalid → the branch logs `failed` and the request appears in Needs
  Attention; never silently succeeds.
- NDPR: recordings/transcripts are sensitive; consent line in the agent script, retention policy
  before storing them in InteractionLog.

### 5.9 What to request from the partner (checklist)

| # | Item | Needed for |
|---|---|---|
| 1 | Vapi **private API key** + confirmation of outbound endpoint (`POST /call`, assistantId + customer number) | Starting the call |
| 2 | **Assistant IDs** for dispatch nudge / reminder / follow-up | Selecting the right agent |
| 3 | **Server URL** slot in each assistant (paste our n8n webhook) + which **server messages** are enabled | Callback events |
| 4 | Callback **signature/secret** scheme (if any) | Authenticating inbound events |
| 5 | **Phone number ID / caller ID** (+234 DID) | Caller display |
| 6 | VoiceBip **SMS endpoint**, auth scheme, **sender ID**, length/encoding limits | SMS leg |
| 7 | SMS **delivery-report** callback format | Logging delivered vs failed |
| 8 | **Sandbox/test** numbers and keys | End-to-end test without real patients |
| 9 | Rate limits, concurrent-call limit, retry/backoff expectations | Burst control |
| 10 | Call outcome vocabulary (answered/no_answer/failed/voicemail) + error codes | Status mapping |

---

## 6. Summary Matrix of Workflow JSONs

| Workflow Name | File Path | Trigger | Primary Action |
| :--- | :--- | :--- | :--- |
| **Intake Webhook** | `n8n/01_intake_webhook.json` | Webhook (`/webhook/intake`) | Ingest, sanitize, post to Django queue |
| **Hold & Expiry Sweeper** | `n8n/02_hold_and_offer_expiry_cron.json` | Cron (`*/1 * * * *`) | Check 60m offer and 15m hold expiries |
| **Reminder Flows** | `n8n/03_reminder_flows.json` | Cron (Twice daily) | Dispatch 24h & 2h pre-visit interactive buttons |
| **Patient Response Handler** | `n8n/04_patient_response_handler.json` | Webhook (`/webhook/messaging/inbound`) | Route inline buttons (Hold, Confirm, Cancel, Re-Request) |
| **Slot Offer Dispatcher** | `n8n/05_slot_offer_dispatcher.json` | Webhook (`/webhook/dispatch-offers`) | Format & send approved 1h slot buttons to patient |
| **Provider Simulator** (dev only) | `n8n/06_provider_simulator.json` | Webhook (`/webhook/provider-sim/{channel}`) | Stand-in for VoiceBip/Meta: realistic success payload or HTTP 500 when `PROVIDER_MOCK_FAIL=true` |
