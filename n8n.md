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
- **Purpose**: Runs every 60 seconds as a high-reliability cron sweeper. It asks Django who expired, then **delivers the message Django composed, on the app Django chose**. n8n writes no patient-facing words and makes no channel decision (built 2026-11-16, Workflow B).

> **Built & live.** Workflow ID `WgdycXudLDdqskEQ` (`02_Hold_And_Offer_Expiry_Sweeper`) — active, 12 nodes,
> `valid: true` (0 errors / 0 warnings). Harness `n8n/tests/test_sweeper.js` (78 assertions); live proof
> `b3_live_proof.py` 18/18. Contract: every sweep item carries `channel` + `message` + `claim_ref`;
> Django pre-writes one claim row per message (`nudge-<REQ>-<channel>` / `recovery-<REQ>-<channel>`,
> `status="queued"`) and the log nodes **upsert that same ref** — a message can never go out twice no
> matter how many times the cron fires. Hold expiry stays silent (backend frees the slot; no message).
> Telegram needs a real `TELEGRAM_BOT_TOKEN` even in mock mode (the simulator has no Telegram leg).

#### Node Pipeline & Data Flow (as built):
```
[60-Second Sweeper Schedule] (Cron: */1 * * * * — Every 60s)
       │
       ▼
[Trigger Django Expiry Sweeper]
  • POST $env.DJANGO_API_BASE_URL + '/webhooks/expiry-sweep/'   (env already ends in /api/v1)
  • X-Webhook-Secret from $env — fail closed, no fallbacks; body {"triggered_by":"n8n_cron_sweeper"}
       │
       ▼
[Parse Sweep Response]
  • expired_offers → recovery items; pre_expiry_nudges → nudge items
  • drops any item missing channel / message / claim_ref (fail-safe); an empty sweep is a clean no-op
       │
       ▼
[Build Provider Requests]
  • mock (PROVIDER_MOCK unset/true): SMS/WhatsApp → Provider Simulator (/provider-sim/{sms|whatsapp})
  • Telegram → real Bot API sendMessage (chat_id + inline keyboard from the item)
  • live gates: VoiceBip creds / Meta creds + WHATSAPP_TEMPLATE_NAME → else route:"skip" with a named reason
       │
       ▼
[Route by Channel]  (switch on provider_request.route)
  ├── telegram  → [Send Telegram Message]   → [Log Telegram Outcome]
  ├── sms       → [Send SMS (VoiceBip)]     → [Log SMS Outcome]
  ├── whatsapp  → [Send WhatsApp Message]   → [Log WhatsApp Outcome]
  └── skip      → [Log Skipped Leg]         (upserts the claim row as failed with the reason)
                    All three send nodes: onError → continueErrorOutput (failures reach the same log).
                    Log nodes: one POST /interactions/ per response, zipped to its claim_ref BY POSITION
                    (a run can carry several messages for one app); canonical error block byte-identical to 05.

  Expired holds never appear here: Django frees the slot silently (AuditLog only).
```

#### Emission & dedupe rules (discovered and pinned by the live proof):
- A **nudge** claim regenerates while the request stays `slots_offered` (the offer window is still open).
- A **recovery** emission is a **one-time event** — it happens in the same sweep that moves the request
  to `offer_expired`, so a released recovery claim never regenerates.
- A skipped leg (no credentials in live mode, no approved WhatsApp template, no Telegram chat id) is
  **visible**: `Log Skipped Leg` upserts the claim row to `failed` with the reason.

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

> **✅ REBUILT (C.2, 2026-11-16).** The shipped JSON is no longer the Telegram-button
> router sketched below — that design was retired with C.1. The live graph is the
> SMS/WhatsApp reply transport described in **§5.8.1**: two webhook triggers, one call
> to `POST /api/v1/webhooks/patient-reply/`, and Django's `reply_text` delivered
> verbatim. The sketch below is kept only as the history of the original idea.

#### Node Pipeline & Data Flow (original blueprint — superseded, see §5.8.1):
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

1. **Authentication Header** (Django ⇄ n8n):
   - Every call the n8n Dispatcher makes into Django carries the shared secret:
     ```http
     X-Webhook-Secret: {{ DJANGO_WEBHOOK_SECRET }}
     ```
   - Django resolves the expected value from `ClinicSetting.webhook_secret` →
     `settings.WEBHOOK_SECRET` → dev fallback (`DEBUG` only) and compares it in constant
     time. An unconfigured secret rejects every guarded request (fail closed).

2. **Inbound authentication per webhook** (verified 2026-11-14):

   | Workflow | Path | Auth | Failure mode |
   |---|---|---|---|
   | `05` Slot Offer Dispatcher | `/webhook/dispatch-offers` | `X-Webhook-Secret` checked **before** the graph runs (`Verify Dispatch Secret` → `IF Dispatch Authorized`) | **401** `{ok:false,error:"unauthorized",reason}` — nothing is sent |
   | `07` Provider Callback | `/webhook/provider-callback` (**GET + POST**, one output per method) | POST: `PROVIDER_CALLBACK_TOKEN` in a **header** (`X-Provider-Token` / `X-Callback-Token` / `X-Webhook-Token`); a query token only for a Meta envelope or with `PROVIDER_CALLBACK_ALLOW_QUERY_TOKEN=true`. GET: `hub.verify_token` vs `WHATSAPP_VERIFY_TOKEN` (Meta handshake only) | POST **401**; GET **403** — both fail closed when the env var is unset |
   | `06` Provider Simulator | `/webhook/provider-sim/*` | none — dev-only, deactivated before launch | n/a |
   | `04` Patient Response (C.2) | `/webhook/whatsapp-inbound` + `/webhook/sms-inbound` (**both POST**) | `X-Webhook-Secret` checked **before** the graph runs (`Verify Reply Secret` → `IF Reply Authorized`), same pattern as `05` | **401** `{ok:false,error:"unauthorized",reason}` — nothing is sent; its call **into** Django (`POST /api/v1/webhooks/patient-reply/`) carries the same secret and Django checks it again (C.1, §5.8) |

   `05` is the most sensitive entry point because it triggers real outbound messages and
   calls, so it answers with a true **401** (`responseMode: responseNode`) instead of the
   default silent 200, while an authorised request is released in ~200 ms — well inside
   Django's 5-second fire-and-forget timeout.

   **Meta's authentication is the token in the registered callback URL.** Meta signs POSTs
   with `X-Hub-Signature-256` over the **raw** body, but n8n's webhook node parses JSON
   before the workflow sees it and exposes no raw bytes (`rawBody: true` still yields an
   object, `binaryData` yields nothing — verified 2026-11-14), so the HMAC cannot be
   computed in-graph. The callback URL is therefore registered as
   `https://<n8n-host>/webhook/provider-callback?token=<PROVIDER_CALLBACK_TOKEN>`; Meta
   preserves the query string on every POST. Adding true HMAC later requires a proxy that
   retains the raw body.

   **Why a header everywhere else (Phase 3 / 3.5).** A query token is a secret in a URL,
   and n8n records the webhook's `query` object in every execution — so `?token=` writes
   the secret into the log of every callback, readable by anyone with n8n UI access. The
   rule is therefore: header first, always. A query token is honoured **only** (a) on a
   Meta envelope (`body.entry[]` present), because Meta has no alternative, or (b) with
   `PROVIDER_CALLBACK_ALLOW_QUERY_TOKEN=true`, an explicit escape hatch for a partner
   whose dashboard can only paste a URL — unset means closed, and only the literal `true`
   opens it. `body.token` is never accepted (a secret in the payload is logged twice), and
   `query.access_token` was dropped as an undocumented alias. The carve-out cannot
   downgrade authentication: both paths require the same secret, so it only decides *where
   the secret may travel*.

3. **Idempotency & Deduplication**:
   - Each dispatch carries `request_id`; `Provider Config & Adapter` keeps a 10-minute
     in-memory `seen` map in workflow static data and routes repeats to
     `skip / duplicate_dispatch`. The window is **read before routing and stamped after
     it**, only for legs that actually fire (Phase 3 / 3.4): a skipped leg never reached a
     provider, so it must leave the window open — otherwise fixing the cause and
     re-dispatching minutes later is refused as `duplicate_dispatch` (which is unlogged)
     and the patient silently gets nothing.
   - Best-effort by design: static data is not authoritative, so Django's offer state and
     `PATIENT_ALREADY_BOOKED` remain the real guard.

4. **Fault Tolerance & Failure Alerting**:
   - Provider sends use `onError: continueErrorOutput`; the error branch writes an
     `InteractionLog` row with a plain-language `error_detail`, which surfaces in the
     dashboard's **Needs Attention** tab.
   - The voice probe fails closed (no call) and the callback receiver answers `500` on
     transient Django errors so the provider retries; `4xx` answers `200 rejected` to stop
     retry storms.
   - An **Error Trigger** workflow that posts to the clinic admin Telegram log group is
     still to be added (Phase 5 hardening).

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
# Django (authoritative API) — same secret both directions
DJANGO_API_BASE_URL=http://127.0.0.1:8000/api/v1
DJANGO_WEBHOOK_SECRET=        # outbound header + inbound dispatch-offers gate

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

# Meta WhatsApp Cloud — PRE-WIRED, DORMANT until the Business account exists.
# Telegram is the launch channel; filling these in is the whole flip.
WHATSAPP_API_URL=https://graph.facebook.com/v19.0/
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_TEMPLATE_NAME=       # approved template; empty in live mode = leg refuses to send
WHATSAPP_TEMPLATE_LANG=en_US
WHATSAPP_TEMPLATE_PARAM_ORDER=patient_name,service_name,option_1,option_2,option_3,expiry
WHATSAPP_TEMPLATE_QUICK_REPLIES=true
WHATSAPP_TEMPLATE_MODE=template   # 'template' (only correct live mode) | 'text' (in-window only)
WHATSAPP_VERIFY_TOKEN=        # the string typed into Meta's "Verify token" box

# Inbound provider callbacks (07_Provider_Callback_Receiver)
PROVIDER_CALLBACK_TOKEN=      # shared secret; unset = every callback rejected 401
```

Rules: no node hardcodes a URL or key; one adapter Code node builds every provider request;
switching provider = editing this block only.

**How mock mode works (updated at Stage D-3).** `PROVIDER_MOCK=true` does **not** skip the
send nodes. It points every provider URL at `06_Provider_Simulator` — a small n8n workflow
that answers `/webhook/provider-sim/{whatsapp|sms|voice}` with a realistic provider payload
(`external_ref: mock-<channel>-<request_code>-<stamp>`) or an HTTP **500** when
`PROVIDER_MOCK_FAIL=true`. Consequences:

- The real HTTP nodes, their auth headers and their JSON bodies run exactly as in production,
  so a green mock run is meaningful.
- Failures travel the **real** error path (`onError: continueErrorOutput` → failure log →
  Needs Attention tab), not a simulated branch.
- Flipping live is still config only: `PROVIDER_MOCK=false` + real `VOICEBIP_*` /
  `WHATSAPP_*` values. The simulator workflow can then be deactivated and deleted.

**One id per message (updated at C.2).** The simulator mints a fresh id for every accepted
send — `mock-sms-<request_code>-<stamp>` / `wamid.mock-whatsapp-<request_code>-<stamp>` —
because that is what real gateways do: the id is what a delivery report comes back with, and
`POST /interactions/` upserts `InteractionLog` rows on it. The old request-scoped id made two
replies to one request share a ref, so the second outbound row overwrote the first. Kept
properties: the id stays readable, and the `REQ-…` code inside it keeps `07`'s legacy fallback
working in dev.

**WhatsApp leg: dormant but credential-ready (Phase 1).** Telegram ships first, so the
WhatsApp path is fully built and inert. It refuses to fire until it is genuinely configured:

- **Template mode is the only correct live mode.** Meta rejects business-initiated
  free-form text outside the 24-hour customer-service window (`131047`), and a slot offer
  always reaches a patient who has not messaged us recently. `WHATSAPP_TEMPLATE_MODE=template`
  builds `type: "template"` with the approved name/language and positional body parameters
  from `WHATSAPP_TEMPLATE_PARAM_ORDER` (default six: patient, service, three options,
  expiry), plus up to **3** quick-reply buttons (`1`,`2`,`3`) because that is Meta's cap.
- **Gate precedence:** `provider_not_configured` (no phone id/token) is reported first;
  with credentials present but no `WHATSAPP_TEMPLATE_NAME` the leg routes to
  `skip / whatsapp_template_not_configured`. A skipped leg builds **no** URL and **no**
  body, so nothing downstream can send it by accident.
- **`to` is E.164 without the plus** (`+2348033112233` → `2348033112233`); Django
  re-normalizes whatever comes back.
- **`biz_opaque_callback_data: <request_code>`** rides on every send. Meta echoes it in
  every status callback and it is the only reliable link from a real `wamid…` back to a
  `BookingRequest`.
- **Mock mode still exercises the template.** With `PROVIDER_MOCK=true` the template name
  defaults to `mock_clinic_slot_offer` and the simulator answers with Meta's real shape
  (`{contacts:[…], messages:[{id:"wamid.mock-whatsapp-<REQ>"}]}`), so wamid capture is
  tested rather than assumed.
- **`external_ref` is read as `messages[0].id` first**, then the legacy flat fields — the
  old flat-only read would have left `external_ref` NULL and made every callback a no-op.

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
- **Phone check (Phase 2, 2026-11-14):** reachability now also reflects the *patient's
  data*, not just provider flags. A booking with no phone number cannot be texted, called
  or messaged by a real provider, so `sms` and `voice` (and `whatsapp` via a provider) are
  `reachable: false` with reason *"No phone number on file for this patient."* — only the
  Telegram card (`via: "telegram"`) still reaches a phoneless patient. Pinned by
  `ChannelAvailabilityTests` (10 tests).

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
   `external_ref`; status rank so late events never downgrade a row. ✅ Done (Stage D-4,
   `07_Provider_Callback_Receiver` / `n8n/07_provider_callback.json`; rank guard lives in
   Django so it holds even for replayed events).
6. **Flip to live** — fill §5.5, set `PROVIDER_MOCK=false`, enable the provider nodes, re-run
   the sample payload, then one real call to a test number. ✅ Done (Stage D-5) — the
   procedure is `n8n/FLIP_LIVE_RUNBOOK.md`; configuration template is `n8n/.env.example`.
   The flip is env-only: no node edits and no Django deploy.
7. **Authenticate the dispatch webhook** — the one entry point that can make the clinic send
   real messages. ✅ Done (Phase 0). `05` now runs `Verify Dispatch Secret` → `IF Dispatch
   Authorized` before anything else and answers **401** on a missing/wrong header; Django
   sends `X-Webhook-Secret` from `dispatch_service.fire_and_forget_webhook(secret=...)`.
   Verified live: no header → 401, wrong header → 401, correct header → 200 in 225 ms with
   the dispatch still completing. `04`/`01` get the same treatment in Workflow C.
8. **WhatsApp credential-readiness** — the leg is fully built while Telegram ships first.
   ✅ Done (Phase 1). Real `wamid` capture (`messages[0].id` first), Meta
   `statuses[]` envelope unwrapped one-item-per-status, template-mode body with positional
   params + ≤3 quick replies and `biz_opaque_callback_data`, a fail-closed template gate
   (`skip / whatsapp_template_not_configured`, no URL/body built), and the `GET`
   `hub.challenge` handshake on `07` (`multipleMethods: true` — one webhook output per
   method, both must be wired). Verified live; see `TEST.md` T-709.
9. **Skip visibility** — a channel that cannot fire is a *record*, not a log line.
   ✅ Done (Phase 2). The switch's skip output feeds `Log Skipped Channel`, which writes a
   `status: queued` InteractionLog row (`external_ref: skip-<channel>-<request_code>`,
   plain-language summary, reason code in `error_detail`) for the actionable reasons
   (`outside_call_window`, `provider_not_configured`, `whatsapp_template_not_configured`,
   `missing_phone`, and since Phase 3 `no_slots`); `duplicate_dispatch` and
   `no_active_channel` stay unlogged by decision.
   The voice probe's error output feeds `Log Voice Probe Failure` — a `failed` row ("voice
   call suppressed, fail closed") that lands in Needs Attention and closed the workflow's
   last validation warning. Supporting Django changes: `POST /interactions/` accepts a
   phoneless row only for `status=queued` with a request link, and
   `resolve_channel_availability` marks phone-dependent channels unreachable ("No phone
   number on file for this patient.") so reception learns it *before* dispatch. Verified
   live (all four reasons + the probe failure); see `TEST.md` T-710.
10. **Patient-facing copy correctness** — the SMS text is ours (VoiceBip is only the
    delivery pipe; the voice leg is the opposite, where the VoiceBip agent speaks its own
    script). ✅ Done (Phase 3 / 3.2). `Format Offers & Telegram Buttons` now builds the
    reply sentence from the actual option count — `Reply 1`, `Reply 1 or 2`,
    `Reply 1, 2, or 3`, `Reply 1, 2, 3, or 4` — instead of hardcoding the first two
    numbers (which read "Reply 1, 2, or 1" for a single option and "Reply 1, 2, or 2" for
    two). Singular/plural is honoured for the slot count and the expiry
    ("1 minute" / "60 minutes"). With **zero** options the text never claims options
    exist, and the adapter's `no_slots` guard (most fundamental skip reason) stops every
    channel from firing at all — Django falls back to the availability engine when
    reception approves no explicit slots and the engine can legitimately find none, so
    this is a real path. `no_slots` is row-worthy: it lands in Needs Attention as a
    `queued` row. Verified live with 1-, 2- and 0-option dispatches; see `TEST.md` T-712b.
11. **Readable provider failures** — a failed send is a record reception can act on, not
    n8n's error wrapper. ✅ Done (Phase 3 / 3.3). Grounded on two live failure probes:
    n8n's error object is only `{ message, name, stack }` (plus `code` on transport
    failures) — there is **no** `error.status`/`httpCode`, the HTTP status exists *only*
    as the message prefix, and the response body arrives as a **JSON string literal**, so
    it needs two real `JSON.parse` steps. The previous `.replace(/\\"/g, '"')` was not a
    valid decode: it corrupts nested escaped quotes, the parse throws, and reception read
    `404 - "{\"code\":404,...\"hint\":\"The workflow must be active..."` cut at 300 chars.
    The three `Log * Interaction` nodes now share one canonical classifier (byte-identical,
    asserted by the harness — `n8n/tests/test_lognodes.js`; n8n has no shared module, so the
    block is duplicated by design): **status prefix → class label** (`Provider authentication failed`,
    `endpoint not found`, `rate limit reached`, `server error` for 5xx, …), **transport
    `code` → plain words** (`ECONNREFUSED`/`ENOTFOUND`/`ETIMEDOUT`/`ECONNABORTED`/
    `ECONNRESET`), then **the provider's own sentence** out of the parsed body
    (`detail` → `message` → `error_description`/`description`/`hint` →
    `error.message`/`error.title`/`error.error_data.details` → `errors[]`), flattened to
    one line and capped at 300 chars. An `ok:false` answer without an exception keeps the
    provider's `error_message` verbatim. `06`/`07` need no equivalent (they never format a
    provider HTTP failure). See `TEST.md` T-712c.
12. **Dedupe stamped by sends, not attempts** — ✅ Done (Phase 3 / 3.4). The 10-minute
    window was written at decision time for every ticked channel, so all five skip reasons
    (`no_slots`, `missing_phone`, `outside_call_window`, `provider_not_configured`,
    `whatsapp_template_not_configured`) burned it without contacting anyone. The read and
    the write are now separate: read + prune before routing, stamp after, single condition
    `skip_reason === null`. `adapter_meta.duplicate` therefore means "a previous dispatch
    actually fired". A leg that **fails** still stamps — the adapter cannot see the HTTP
    outcome, so un-stamping could duplicate a message that was already delivered. Verified
    live with a skip → send → repeat sequence on one request; see `TEST.md` T-712d.
13. **Unknown channel ignored** — ✅ Done (Phase 3 / 3.6). An **explicit** channel the
    receiver cannot map (`email`, `push`, an object) is a contract mismatch and returns
    `200 {ignored:true, reason:"unknown_channel"}` with no row; an **absent** channel keeps
    the ref/event/status inference and the documented SMS last resort. Before this, the
    blind `channel = 'sms'` default filed every such event as an SMS delivery report — wrong
    data in the patient timeline, with a `200` that stopped the provider retrying. See
    `TEST.md` T-712f.
14. **Patient identity is fill-only** — ✅ Done (Phase 3 / 3.7). A callback may fill a blank
    phone/name but never rewrite a stored one; the delivery outcome still advances, the phone
    discrepancy is appended to `summary` once, and the log names only the `external_ref`.
    Also fixed the forwarder reading `n.patientName` (undefined) instead of
    `n.patient_name`, which meant no callback had ever carried a patient name to Django.
    See `TEST.md` T-712g.
15. **A fail-safe records, it does not vanish** — ✅ Done (Phase 3 / 3.8). The voice guard's
    `voice_payload_missing` path only fires when the graph is inconsistent (the adapter
    produced no voice item), and it was the least observable thing in the workflow: it was
    synthesised *after* the switch so it could never reach `Log Skipped Channel`, it was not
    in `REASON_TEXT`, it carried no `request_id`, and `IF Voice Still Needed`'s `false`
    output was wired to nothing — so when the patient had not replied the item went to the
    send node with `provider_request.url === undefined` and aborted the run. Now the guard
    forces `should_skip` for a missing payload, inherits the request code from the probe, and
    the `false` output goes to `Log Skipped Channel`, which writes a `queued` row
    (`skip-voice-…`, `error_detail: voice_payload_missing`). `patient_already_engaged` takes
    the same wire and stays unlogged, by the decision in item 9. See `TEST.md` T-712h.

16. **Inbound patient replies** — phone number → open request → intent, in Django.
    ✅ Done (Workflow C / C.1 + C.2). See §5.8 (endpoint) and §5.8.1 (the rebuilt `04`).

### 5.8 Inbound patient replies: one Django endpoint (Workflow C / C.1)

**Status: DONE (2026-11-16).** Verified by `PatientReplyWebhookTests` (R1–R12) and a live
proof against the dev server (28/28).

Telegram replies work because the button carries the offer id (`select_slot_<offer>`). An SMS
or WhatsApp reply carries only the sender's number and the text. Django must therefore answer
*"which open request is this phone replying about, and which offer is number 2?"* — n8n cannot,
because that is a database question and n8n never gets DB access.

```
POST /api/v1/webhooks/patient-reply/
X-Webhook-Secret: <shared>                 (fail closed; 401 and no writes)
Content-Type: application/json

{"phone": "+2348030001122", "text": "2",
 "channel": "sms", "provider_message_id": "vb-in-8812"}

200 {"status": "...", "intent": "select|cancel|reschedule|other|none",
     "request_id": "REQ-2026-0042", "appointment_code": "AP-1042" | null,
     "channel": "sms", "reply_text": "<send this verbatim>"}
```

**What Django decides (n8n decides nothing):**

| Input | `status` | Effect |
|---|---|---|
| `1`..`4` | `held` | holds that option, in original dispatch order; reply names doctor/time/code |
| `1`..`4` when a live booking exists | `already_confirmed` | no second booking; original `appointment_code` |
| number not offered | `out_of_range` | no hold |
| valid number, 60-minute window passed | `expired` | no hold |
| `cancel` | `cancelled` | live appointment cancelled (or `needs_reception` if none) |
| `reschedule` | `re_requested` | priority tab + `PATIENT_RE_REQUESTED_TIMES` audit row |
| other text | `needs_reception` | handed to reception |
| same `provider_message_id` again | `duplicate_ignored` | no action; `reply_text` is `""` |
| phone has no open request | `unmatched` | normal `200`, nothing written |
| time taken inside the lock | `slot_conflict` | normal answer, no hold |

**Rules that make it safe:**

- **Auth:** `X-Webhook-Secret` only (header, constant-time, unset = closed). Staff JWT is not
  accepted: this is a machine-to-machine route and a patient never holds the secret.
- **Idempotency:** `provider_message_id` is stored as `InteractionLog.external_ref` (already
  unique), so the inbound row is the claim. A provider retry cannot create a second hold, and
  an empty `reply_text` tells `04` not to send anything.
- **One code path:** selection goes through `services/slot_selection.py::select_slot_offer`,
  shared with `SlotHoldView`, so the dashboard, the n8n hold and an SMS reply cannot drift.
- **One inbound row** per accepted message (`direction="inbound"`, request/appointment links,
  summary built from the outcome). The patient's raw text is **not** stored: it may contain a
  phone number or clinical detail. `unmatched` writes nothing.
- **Copy lives in Django.** `reply_text` is plain text (SMS-safe); `04` sends it as-is.
- **Telegram is not routed here.** Django already owns that conversation; duplicating it would
  handle one tap twice.
- **Partner payload shape is neutral** (`{phone, text, channel, provider_message_id}`) because
  VoiceBip's inbound format is still an open question. `04` does the parsing, not Django.

**C.2 status:** DONE (2026-11-16). `04` was rebuilt around this endpoint — see §5.8.1.
Verified by `n8n/tests/test_reply_handler.js` (91 assertions) and a live end-to-end proof
through the running n8n workflow (36 checks).

### 5.8.1 The rebuilt `04_Patient_Response_Handler` (Workflow C / C.2)

**Status: DONE (2026-11-16).** Live workflow `lBAjZ9ozCvFzKIBs` (19 nodes, active), repo
JSON is the source. Proven live: 36/36 checks, all rows cleaned up afterwards.

The old skeleton was a Telegram-button router with a staff-JWT `PATCH /appointments/{id}/status/`
and its own `/api/v1` URL mashing. All of that is **removed, not patched**: no PATCH node, no
`/api/v1` in any URL (the base URL already ends in `/api/v1`), no `re_request_slots_` prefix,
no `clinic_dev_…` fallback — an unset `DJANGO_WEBHOOK_SECRET` rejects every request.

```
[WhatsApp Inbound Webhook]   [SMS Inbound Webhook]      Meta envelope or VoiceBip/flat payload
            └────────────┬────────┘
     [Verify Reply Secret]                          fail closed, 401 {ok:false,error:"unauthorized",reason}
            │
     [Normalize Patient Reply]                      → {phone, text, channel, provider_message_id}; "2" stays "2"
            │
     [Switch Reply Action] ── ignore / bad_request ─► 200 {ignored:"not_a_message"} / 400 {error:"missing_phone"}
            │ reply
     [Ask Django Patient Reply]                     ONE call: POST /webhooks/patient-reply/ (+ X-Webhook-Secret)
        │            └── error ─────────────────────► 500 {ok:false,error:"django_unavailable"} (retry is safe)
     [IF Reply Text Present] ── empty ─────────────► 200 {ok:true,status,sent:false,reason:"empty_reply"}
            │
     [Prepare Reply Delivery]                       wraps reply_text for SMS (VoiceBip) or WhatsApp (Meta)
            │
     [Route Reply Channel] ── skip ────────────────► logged as `failed`, still answers 200
            │
     [Send Reply WhatsApp] / [Send Reply SMS]       onError → the same log node
            │
     [Log Reply Outcome]                            ONE POST /interactions/ row, direction="outbound"
            │
     [Respond Reply Handled]                        200 {ok:true,status,intent,request_id,appointment_code,reply_delivered,logged}
```

**Contract details:**

- **n8n decides nothing.** `Normalize Patient Reply` only reshapes; "2" is forwarded as `"2"`.
  Intent, offer resolution, holds, cancels and all copy are Django's (§5.8).
- **Two triggers, one transport rule.** The trigger decides the transport; the body may only
  refine it to `sms` or `whatsapp`. Anything else (a provider mislabeling `channel: "voice"`) is
  an SMS reply — a mislabel must never strand the patient. Telegram stays Django's.
- **Meta specifics.** A status callback (`sent`/`delivered`/`read`) is **not** a reply: 200
  `{ignored:"not_a_message"}`, nothing written — `07` owns delivery reports. Button payloads,
  `interactive` replies and media captions are read; a caption is kept for a human.
- **Delivery.** Mock mode (default) points at the `06` simulator; live mode refuses to guess —
  missing credentials mean a skipped leg, not a guessed endpoint. `reply_text` is sent verbatim.
- **The outbound row.** One `POST /interactions/` with `direction="outbound"`, the provider id
  as `external_ref`, and links to the request/appointment. A held-back reply (skip reason or
  provider failure) is logged as `failed` with one actionable sentence — the patient is waiting
  and silence would be invisible. A Django outage while logging never breaks the patient flow
  (the row is best-effort; the answer to the provider already went out).
- **Idempotency is end-to-end.** The provider retrying its webhook → Django answers
  `duplicate_ignored` with an empty `reply_text` → nothing is sent, no row is written.
- **Harness:** `node n8n/tests/test_reply_handler.js` runs the shipped node sources (91
  assertions: fail-closed auth, both payload shapes, the one-call rule, duplicate skip,
  delivery routing, the outbound row, and graph drift guards).

### 5.9 Edge cases owned by this integration

- Partial dispatch where the only checked channel is unconfigured → guard blocks it (§5.6).
- Duplicate dispatch → existing `PATIENT_ALREADY_BOOKED` guard + idempotency key per provider call.
  The 10-minute n8n window only blocks a repeat of a leg that actually sent (3.4); retrying
  a *skipped* leg immediately is expected and allowed.
- Offer expires while the call is ringing → log the call, flag the mismatch, never resurrect the offer.
- Call window 08:00–19:00 Africa/Lagos; call started at 18:59 still completes.
- Retry policy: max 2 attempts, backoff; each attempt logged separately with its own `external_ref`.
- DND / invalid number → `failed` (not `no_answer`).
- Duplicate or out-of-order callbacks → upsert by `external_ref`, status rank enforced; a
  callback can fill a blank phone but never rewrite a stored one (3.7) — the mismatch is
  flagged in the row's summary instead of being rejected.
- Adapter produced no voice item after the 30s probe → `voice_payload_missing`: the call is
  never placed, and the request gets one `queued` row saying so (3.8). Visible in the skipped
  list, not Needs Attention, because nothing failed — the dispatch was held back.
- Provider key missing/invalid → the branch logs `failed` and the request appears in Needs
  Attention; never silently succeeds. Since 3.3 the class leads the sentence
  (`Provider authentication failed: Invalid API key`), so a bad key is distinguishable at
  a glance from a 429, a 5xx or a dead endpoint.
- Unknown channel in a callback → `200 ignored:unknown_channel`, no row (3.6). It is a
  contract mismatch, not an SMS, and it is visible in the execution rather than invented in
  the timeline.
- NDPR: recordings/transcripts are sensitive; consent line in the agent script, retention policy
  before storing them in InteractionLog.

### 5.9 What to request from the partner (checklist)

| # | Item | Needed for |
|---|---|---|
| 1 | **VoiceBip private API key** + confirmation of the outbound call endpoint (agent/caller id + customer number) | Starting the call |
| 2 | **Assistant IDs** for dispatch nudge / reminder / follow-up | Selecting the right agent |
| 3 | **Server URL** slot in each assistant (paste our n8n webhook) + which **server messages** are enabled | Callback events |
| 4 | Callback **signature/secret** scheme (if any) | Authenticating inbound events |
| 5 | **Phone number ID / caller ID** (+234 DID) | Caller display |
| 6 | VoiceBip **SMS endpoint**, auth scheme, **sender ID**, length/encoding limits | SMS leg |
| 7 | SMS **delivery-report** callback format | Logging delivered vs failed |
| 8 | **Sandbox/test** numbers and keys | End-to-end test without real patients |
| 9 | Rate limits, concurrent-call limit, retry/backoff expectations | Burst control |
| 10 | Call outcome vocabulary (answered/no_answer/failed/voicemail) + error codes | Status mapping |
| 11 | **DND routing**: does free-text SMS deliver to DND-locked Nigerian numbers, or is a transactional route / pre-registered template required? If templates are required, ask for the **SMS template id + variable syntax** | SMS copy is composed by us (Phase 3 / 3.2). A "templates required" answer is config-only to absorb: a `VOICEBIP_SMS_TEMPLATE_ID` env var + one branch in the adapter's body builder, mirroring WhatsApp |

### 5.10 Provider callback contract (Stage D-4)

`07_Provider_Callback_Receiver` (`rmqf5Z5K3EfapVGo`, `n8n/07_provider_callback.json`) owns
`POST /webhook/provider-callback`. Point the partner's delivery-report / call-outcome webhook
at it and give them the shared token.

**Auth.** `PROVIDER_CALLBACK_TOKEN` must be supplied in an `X-Provider-Token` /
`X-Callback-Token` / `X-Webhook-Token` header (the header wins if several are present).
Unset env var → every request is `401` (fail closed). A `?token=` query parameter is honoured
**only** on a Meta envelope (Meta cannot set custom headers) or when
`PROVIDER_CALLBACK_ALLOW_QUERY_TOKEN` is exactly `true` — an escape hatch for a partner whose
dashboard can only paste a URL. `?access_token=` and `body.token` are no longer accepted: n8n
records the webhook's query object in every execution, so a URL token writes the secret into
the log of every callback, permanently, for anyone with UI access. See Phase 3 / 3.5.

**Request body** (any subset; the receiver infers the rest):

```json
{
  "event": "call.completed",
  "call_id": "mock-voice-REQ-2026-0038",
  "status": "answered",
  "duration": 62,
  "recording_url": "https://recordings.example.com/vb-0038.mp3",
  "request_code": "REQ-2026-0038",
  "to": "+2348030001122"
}
```

**Responses.**

| Situation | Status | Body |
|---|---|---|
| Accepted / updated | `200` | `{ok:true, accepted:true, interaction_id, status, channel, external_ref, request_code}` |
| Unparseable but authentic (unknown status, no `external_ref`) | `200` | `{ok:true, ignored:true, reason}` |
| Django rejects the event (`4xx`, e.g. unknown `request_code`) | `200` | `{ok:false, rejected:true, retry:false, reason}` |
| Django unreachable / `5xx` / timeout | `500` | `{ok:false, retry:true, reason:"django_unavailable"}` |
| Missing or wrong token | `401` | `{ok:false, error:"unauthorized", reason}` |

The 4xx/5xx split is deliberate: a retry cannot fix a rejected event, so it answers 200;
only transient failures ask the provider to try again.

**Meta WhatsApp (Phase 1) — same webhook, two directions.**

1. *Verification handshake (GET).* Meta registers the callback URL by calling
   `GET /webhook/provider-callback?hub.mode=subscribe&hub.challenge=<nonce>&hub.verify_token=<token>`
   and expects the challenge echoed as **plain text**. `Handle Verification Handshake`
   compares the token with `WHATSAPP_VERIFY_TOKEN` and answers `200 <challenge>` or
   `403 bad_verify_token` (unset env var → `403 verify_token_not_configured`). A GET
   without `hub.mode` falls through to the normal pipeline and is `401` for a missing
   callback token.
2. *Status callbacks (POST).* Meta wraps events in `entry[].changes[].value.statuses[]`
   and **can batch several** into one request (`sent` + `delivered` arrive together when a
   phone comes online). The normalizer emits **one item per status**, so the tail of a
   batch is never dropped. Field mapping: wamid ← `statuses[].id`, phone ←
   `recipient_id`, failure sentence ← `errors[0].error_data.details` prefixed with
   `errors[0].code` (e.g. `(131047) …`), booking link ← `biz_opaque_callback_data`.
   Inbound patient messages share the webhook in Meta's model and are acked and ignored
   (`inbound_message_not_a_status_event`) because Workflow C owns them.

> **Gotcha:** with `multipleMethods: true` the webhook node exposes **one output per HTTP
> method** (`main[0]` = GET, `main[1]` = POST). Wiring only the first makes every POST
> silently return an empty `200` — both outputs must connect to the same handler.

**Status rank is enforced in Django**, not n8n: `queued 0 < sent 1 < delivered 2 <
answered|no_answer|failed|expired 3`. A lower-ranked event never overwrites a higher-ranked
row and only fills blank fields; same-rank terminal events overwrite (last one wins). This
holds even if a callback is replayed outside n8n.

**Phone is optional** when `external_ref` matches an existing row (Django reuses the stored
number). Since Phase 2, a brand-new row may also omit the phone **only** when
`status=queued` **and** it links a request (`request_code`) — that is the skip-visibility
contract: a "held back, not attempted" row has no destination number because nothing was
sent. Any other new row without a phone is still rejected `400`.

**Links survive id-only events** (Phase 3 / 3.1). A rank-advancing event that identifies the
message by `external_ref` alone — the typical VoiceBip call outcome (id + status +
duration, no request/appointment code) — no longer unlinks a row from its
`BookingRequest`/`Appointment`. `null` in the event means "said nothing about the link";
a non-`null` value still wins, including deliberate re-linking. Without this, the
dashboard lost the request timeline for exactly the callbacks our own normalizer is least
likely to enrich.

**An existing row's phone and name are identity** (Phase 3 / 3.7). A callback may **fill** a
blank number — the 2.1 skip-visibility contract — but it may never **rewrite** one that is
already stored. The delivery outcome is real, so the status still advances; only the identity
is refused, and the discrepancy is appended to the row's `summary` (idempotently, so a retried
callback cannot stack it) so reception sees it rather than it living in a log file. The log
line names the `external_ref` only, never the numbers. A nameless callback is not a
discrepancy — silence never erases a stored name — so it is restored silently with no note.
Without the guard, a sandbox call, a provider echoing its own trunk DID, or a cross-wired
`external_ref` could move a patient's whole message history onto another number with nothing
to show for it.

> **Forwarder gotcha (fixed in 3.7):** the `Forward to Django` node read `n.patientName`, but
> `normalize()` returns `patient_name` — so the value was `undefined`, n8n dropped it from the
> payload, and **no callback had ever carried a patient name to Django**. Add a `patient_name`
> assertion to any new alias you map: a silently undefined expression is invisible to the
> harness unless something asserts on the outgoing payload.

**Vocabulary tables** live in the `Verify & Normalize Provider Event` Code node
(`STATUS_ALIASES`, `CHANNEL_ALIASES`). Only those two tables need editing when the partner's
real payload format arrives.

**An unknown channel is ignored, not relabelled** (Phase 3 / 3.6). The channel chain used to
end in a blind `channel = 'sms'`, so a callback that explicitly said `channel: "email"` (or
`"push"`, or an object that stringifies to `[object Object]`) was filed as an SMS delivery
report — a row in the patient timeline for a message that was never an SMS, with a `200` to
the provider so it never retried and never surfaced. Now an **explicit but unmappable**
channel returns `200 {ignored:true, reason:"unknown_channel"}` and writes nothing; an
**absent** channel keeps the ref/event/status inference chain and the documented SMS last
resort. The distinction is the point: *"you named a channel I don't know"* is a contract
mismatch, *"you didn't name one"* is the expected VoiceBip shape. Ignored callbacks are
visible in the n8n execution (`reason`), deliberately not in Django — `InteractionLog.channel`
has no "unknown" value, so a row would require lying in the other direction.

---

## 6. Summary Matrix of Workflow JSONs

| Workflow Name | File Path | Trigger | Primary Action |
| :--- | :--- | :--- | :--- |
| **Intake Webhook** | `n8n/01_intake_webhook.json` | Webhook (`/webhook/intake`) | Ingest, sanitize, post to Django queue |
| **Hold & Expiry Sweeper** | `n8n/02_hold_and_offer_expiry_cron.json` | Cron (`*/1 * * * *`) | B: asks Django who expired (`POST /webhooks/expiry-sweep/`) and delivers Django's words on Django's channel; claim-ref upserts keep every message single-shot |
| **Reminder Flows** | `n8n/03_reminder_flows.json` | Cron (Twice daily) | Dispatch 24h & 2h pre-visit interactive buttons |
| **Patient Response Handler** | `n8n/04_patient_response_handler.json` | Webhook (`/webhook/whatsapp-inbound`, `/webhook/sms-inbound`) | C.2: asks Django what an SMS/WhatsApp reply means (`/webhooks/patient-reply/`) and delivers `reply_text` verbatim |
| **Slot Offer Dispatcher** | `n8n/05_slot_offer_dispatcher.json` | Webhook (`/webhook/dispatch-offers`) | Format & send approved 1h slot buttons to patient |
| **Provider Simulator** (dev only) | `n8n/06_provider_simulator.json` | Webhook (`/webhook/provider-sim/{channel}`) | Stand-in for VoiceBip/Meta: realistic success payload or HTTP 500 when `PROVIDER_MOCK_FAIL=true` |
| **Provider Callback Receiver** | `n8n/07_provider_callback.json` | Webhook (`/webhook/provider-callback`) | Authenticate + normalize provider delivery reports / call outcomes, upsert `InteractionLog` |
