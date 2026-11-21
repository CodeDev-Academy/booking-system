# API Reference & Endpoint Specifications

All endpoints are prefixed with `/api/v1/`.

---

## 1. Booking Requests

### `POST /api/v1/booking-requests/`
Creates a standardized booking request from web intake or WhatsApp flow.

**Auth:** public on purpose (`AllowAny`) — this is the patient's front door. Protected by a
honeypot field (`clinic_web_trap`) and a 5-requests-per-10-minutes IP limit.

**Request Payload** (every field the web form sends; date of birth may be `null`, never `""`):
```json
{
  "patient_name": "Amina Yusuf",
  "patient_phone": "+2348012345678",
  "service_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "preferred_doctor_id": null,
  "preferred_dates": ["2026-10-12", "2026-10-13"],
  "preferred_time_window": "morning",
  "date_of_birth": "1990-04-02",
  "gender": "female",
  "is_emergency": false,
  "patient_notes": "Tooth pain on the lower right side for three days.",
  "channel": "web",
  "clinic_web_trap": ""
}
```

**Response (`201 Created`):**
```json
{
  "id": "8b9d0c1a-...",
  "request_id": "REQ-2026-0042",
  "request_code": "REQ-2026-0042",
  "status": "awaiting_review",
  "telegram_link": "https://t.me/babawo_bot?start=Xk3vQ2pL9wR4tY6nB1cA",
  "created_at": "2026-10-08T09:30:00Z"
}
```

`telegram_link` is the handoff to the only channel that works without a partner credential. It
carries a **random per-request token** (`telegram_link_token`, migration `0009`) — never the
guessable request code. Opening it binds the patient's Telegram chat to this request (see
`/start` below); `null` when no bot username is configured, and the page then offers the honest
"front desk will call you" fallback.

---

### `GET /api/v1/public/booking-info/`
**Auth:** public. Everything the `/book` page needs to render, and nothing more: clinic name, the
clinic's REAL `offer_hold_minutes` (from `ClinicSetting.offer_expiry_minutes`) with its notice
wording, `hold_expiry_minutes`, opening hours and working days, active services (`id`, `name`,
`category`, `duration_minutes` — **no price**), active doctors (`id`, `name`, `specialty`), and
`telegram_bot_username`. No secret, no patient data, no roster data.

---

### `GET /api/v1/booking-requests/`
Retrieves request queue for Receptionist Dashboard with status filtering (`awaiting_review`, `slots_offered`, `offer_expired`).

---

### `POST /api/v1/booking-requests/{request_id}/check-slots/`
Calculates valid slot candidates according to clinic scheduling rules without modifying database state.

**Response (`200 OK`):**
```json
{
  "request_id": "REQ-2026-0042",
  "service": "Dental Consultation",
  "duration_minutes": 30,
  "suggested_slots": [
    {
      "doctor_id": "doc-uuid-1",
      "doctor_name": "Dr. Bello",
      "start_datetime": "2026-10-12T10:00:00Z",
      "end_datetime": "2026-10-12T10:30:00Z"
    },
    {
      "doctor_id": "doc-uuid-1",
      "doctor_name": "Dr. Bello",
      "start_datetime": "2026-10-12T11:30:00Z",
      "end_datetime": "2026-10-12T12:00:00Z"
    },
    {
      "doctor_id": "doc-uuid-2",
      "doctor_name": "Dr. Okafor",
      "start_datetime": "2026-10-13T09:00:00Z",
      "end_datetime": "2026-10-13T09:30:00Z"
    }
  ]
}
```

---

### `POST /api/v1/booking-requests/{request_id}/dispatch-offers/`
Receptionist approves selected slots and initiates the 60-minute (1-hour) offer window. Dispatches webhook to deliver Telegram / WhatsApp interactive buttons.

**Option B, Layer 2 — advisory delivery plan (additive, never blocking).** The response now also contains:

```json
{
  "delivery": {
    "requested":   ["whatsapp", "sms", "voice"],
    "reachable":   ["whatsapp"],
    "unreachable": ["sms", "voice"],
    "warning":     "SMS and voice call cannot reach this patient — only WhatsApp will be used."
  },
  "delivery_warning": "SMS and voice call cannot reach this patient — only WhatsApp will be used."
}
```

- Computed from config + the patient's Telegram chat id (see `channel-availability/`); no network calls.
- **Status stays `200`** and the offers are still created — this layer only tells reception the truth. A dispatch that reaches nobody returns `delivery.reachable: []` and a `delivery_warning` starting *"None of the selected channels…"*.
- `delivery_warning` is `null` when every selected channel is reachable.
- `PATIENT_ALREADY_BOOKED` still returns `409` **before** availability is computed, and that response has no `delivery` key.

**Option B, Layer 4 — enforcement (default OFF).** With `DISPATCH_REQUIRE_REACHABLE_CHANNEL=true`, the same request is refused **before any offer is deleted or created** and before any provider call:

```json
{
  "error": "NO_REACHABLE_CHANNEL",
  "detail": "None of the selected channels can reach this patient — nothing would be delivered. Call the patient directly, or configure a provider, then try again.",
  "delivery": { "requested": [...], "reachable": [], "unreachable": [...], "warning": "..." }
}
```

- Status `409`. The booking request stays in its previous status and existing `SlotOffer` rows are untouched.
- `PATIENT_ALREADY_BOOKED` still wins when both conditions are true.
- Flag OFF (default) = exactly the Layer 2 advisory behaviour.

---

### `GET /api/v1/booking-requests/{request_id}/channel-availability/`
**Option B (preventive layer, read-only).** Reports which delivery channels can actually reach this patient under the current deployment configuration, so reception sees an unreachable patient *before* clicking Approve & Dispatch.

- **Auth:** staff JWT (`receptionist` / `clinic_admin`). No webhook-secret access.
- **Side effects:** none — no DB writes, no network calls, no provider invocation.
- **Provider config signals:** `TELEGRAM_BOT_TOKEN` (Django sends that leg itself) and the explicit enable flags `WHATSAPP_ENABLED`, `SMS_ENABLED`, `VOICE_ENABLED` (provider credentials live in n8n, not Django).
- **Telegram rule:** the `whatsapp` checkbox is the instant-message leg; a patient with a Telegram `chat_id` counts as reachable through it — matching what `dispatch-offers` already does.

```json
{
  "request_id": "REQ-2026-0042",
  "channels": {
    "whatsapp": { "configured": false, "reachable": true,  "via": "telegram", "reason": "Delivered through the Telegram card (WhatsApp stand-in)." },
    "sms":      { "configured": false, "reachable": false, "via": null, "reason": "SMS is not enabled (set SMS_ENABLED=true when VoiceBip credentials are live)." },
    "voice":    { "configured": false, "reachable": false, "via": null, "reason": "Voice is not enabled (set VOICE_ENABLED=true when the Vapi assistant is live)." },
    "telegram": { "configured": true,  "reachable": true,  "via": "telegram", "reason": null }
  },
  "reachable": ["whatsapp"],
  "unreachable": ["sms", "voice"],
  "none": false,
  "telegram_chat_id": "55882"
}
```

`reachable` / `unreachable` list only the dispatch channels (`whatsapp`, `sms`, `voice`) so callers can intersect them with the receptionist's checkbox selection; `telegram` is informational. `none: true` means the patient cannot be reached by any channel.

**Relationship to Needs Attention:** this endpoint is *preventive* (before a send). The Needs Attention tab is *reactive* (after an attempted send that failed and produced an `InteractionLog`). A dispatch that reaches nobody creates no log row, which is exactly the blind spot this endpoint closes.

---

### `POST /api/v1/booking-requests/{request_id}/channel-failed/`
Invoked by n8n when Telegram returns `403 Forbidden` (patient blocked bot) or WhatsApp delivery fails. Sets `channel_blocked = true` and generates a priority alert badge on the receptionist dashboard: `[⚠️ Call Patient]`.

---

### `POST /api/v1/booking-requests/{request_id}/append-note/`
Invoked when patient sends unstructured audio notes, photos, or free text. Appends notes/media link to `patient_notes` so the receptionist sees them directly inside the Review Modal.

---

## 2. Slot Selection & Holds

### `POST /api/v1/slots/hold/`
Patient selects an offered slot. Acquires atomic lock and sets a 15-minute temporary hold (or instant confirmation for standard visits).

**Request Payload:**
```json
{
  "request_id": "REQ-2026-0042",
  "slot_offer_id": "slot-uuid-1"
}
```

**Response (`200 OK`):**
```json
{
  "appointment_id": "AP-1042",
  "status": "held",
  "hold_expires_at": "2026-10-08T10:15:00Z",
  "requires_deposit": false
}
```

---

## 3. Appointment Lifecycle & Status Updates

### `PATCH /api/v1/appointments/{appointment_id}/status/`
Allows the receptionist or automated webhook to advance appointment state.

**State Options:**
- `confirmed`
- `arrived`
- `in_consultation`
- `completed`
- `cancelled`
- `no_show`
- `rescheduled`

---

### `POST /api/v1/appointments/{appointment_id}/follow-up/`
Schedules a doctor-directed recall after a visit. **Rule B (owner decision):
the patient message starts empty, and an empty message sends NOTHING** — the
recall is then a private clinic note only.

```json
{
  "follow_up_date": "2026-12-05",
  "send_at": "09:00",
  "notes": "Private clinical note — never sent to the patient.",
  "patient_message": "Please come back in two weeks and bring your X-ray."
}
```

- `notes` is **private**: it is stored for the clinic and never quoted in any
  outgoing message.
- `patient_message` is the **only** text a patient receives. Max 300 characters;
  omitted or empty means no message.
- `send_at` is the clinic-clock time (default `09:00`). The hourly reminder sweep
  (`POST /webhooks/reminder-sweep/`) only releases a recall once its date **and**
  time have passed, and only once (`reminder_sent`).
- Delivery mirrors the channels the patient was already reached on
  (`sms`, `whatsapp`, `telegram`). The Telegram recall carries a
  **"Book Follow-Up Visit"** button. A recall with no resolvable channel writes
  no claim and is retried by a later sweep.

`409`/`400` rules: the date cannot be in the past; a message over 300 characters
is refused.

---

### `GET /api/v1/follow-ups/`
The **Recalls page**. Returns every recall plus counts:

```json
{
  "counts": { "upcoming": 3, "sent": 12, "done": 4, "cancelled": 1 },
  "items": [
    {
      "id": "…",
      "appointment_code": "AP-1042",
      "patient_name": "Amina Yusuf",
      "doctor_name": "Dr. Bello",
      "service_name": "Dental Consultation",
      "follow_up_date": "2026-12-05",
      "send_at": "09:00:00",
      "patient_message": "Please come back in two weeks.",
      "status": "upcoming"
    }
  ]
}
```

`status` is derived: `cancelled` → `done` → `sent` → `upcoming`.
Filters: `?status=upcoming|sent|done|cancelled`, `?search=` (patient, phone or
code), `?doctor_id=`. **The clinical note is not in this payload** — this is a
front-desk screen.

### `PATCH /api/v1/follow-ups/{id}/`
```json
{ "cancelled": true }
{ "is_completed": true }
{ "follow_up_date": "2026-12-09", "send_at": "14:00", "patient_message": "…" }
```

- **Cancel** keeps the recall on record (`cancelled_at`, `cancelled_by`) and the
  sweep ignores it. `{"cancelled": false}` restores it (only before sending).
- **Mark done** is allowed at any time.
- **Edit** (date, time, message) is allowed only **before** the recall is sent:
  `409 ALREADY_SENT` afterwards, `409 CANCELLED` when it was cancelled. The
  message keeps the same 300-character limit.

---

## 4. Staff Authentication & Admin Governance
 
### `POST /api/v1/auth/login/`
Authenticates receptionist with email and password, returns user profile, role, and issues 30-day HTTP-Only cookie.
The response also carries the refresh token in the body (`refresh`), which the frontend stores
and redeems through the endpoint below.

### `POST /api/v1/auth/refresh/`
Redeems a valid 30-day refresh token for a fresh 60-minute access token.
Body: `{"refresh": "<token>"}`; the HttpOnly `clinic_refresh_token` cookie is a fallback for
same-origin deployments. `200 {"access": "<jwt>"}`; `401 INVALID_REFRESH_TOKEN` for a malformed or
unknown token, and `401 ACCOUNT_DEACTIVATED` when the account was deactivated (the T-303
kill-switch holds on this path too — a deactivated staff member cannot renew a session).

### `POST /api/v1/auth/pin-unlock/`
Validates 4-digit Quick PIN after 20-minute idle screen lock.

### `POST /api/v1/admin/staff/{staff_id}/deactivate/`
**Admin-Only Action**: Immediately sets `is_active = False` on the receptionist, revokes all active tokens/cookies, and instantly severs their access to the dashboard.

### `POST /api/v1/admin/staff/{staff_id}/reset-pin/`
**Admin-Only Action**: Resets a receptionist's PIN if forgotten.

---

## 5. Webhook Ingestion Gateways

- `POST /api/v1/webhooks/messaging/inbound/` (Unified messaging ingestion from Telegram / WhatsApp)
- `POST /api/v1/webhooks/telegram/inbound/` (Direct Telegram Bot API webhook)
- `POST /api/v1/webhooks/whatsapp/inbound/` (Direct Meta Cloud API webhook)
- `POST /api/v1/webhooks/expiry-sweep/` (Invoked every 1m by n8n cron worker)
- `POST /api/v1/webhooks/re-engagement/` (Triggered upon offer expiry to send `[🔄 See New Times]`)
- `POST /api/v1/webhooks/patient-reply/` (SMS / WhatsApp patient reply — see below)
- `POST /api/v1/webhooks/disruption-claims/check/` (Workflow `08` asks if a notice is still live before sending — see below)

### `POST /api/v1/webhooks/telegram/inbound/` — the web booking handoff
The Telegram bot receives normal updates here. One command is special: **`/start <token>`**
(also `/start@babawo_bot <token>` in a group), which binds the chat to the booking request that
owns the token printed on the `/book` success screen.

| Case | Behaviour |
| :--- | :--- |
| Valid token, chat not linked | Saves the `telegram_chat_id:<id>` marker that dispatch already reads, audits `TELEGRAM_LINKED`, replies with the request code and the next step. |
| Same chat, same request | Idempotent — a friendly "already connected" reply, no duplicate marker. |
| Request linked to a DIFFERENT chat | Refused. One chat per request, so a forwarded link cannot hijack another patient's booking. |
| Unknown token | Refused politely; no writes. |
| Request already `converted` / `rejected` / `offer_expired` | Refused with the truth; no writes. |
| `/start` with no token | Falls through to the existing welcome menu with the service buttons. |

Once bound, the normal flow takes over: reception approves times and the patient receives the
slot buttons in that chat.

---

### `POST /api/v1/webhooks/disruption-claims/check/`
Answers, per claim reference, whether a disruption notice may still be delivered. Workflow `08`
calls it immediately before any send node, because `queued` means "not sent yet", not "never
will be": an undo can withdraw a notice while a push is already running.

**Auth:** `X-Webhook-Secret` header only (fail closed, `401` and no reads). Staff JWT is not
accepted.

**Request Payload:**
```json
{ "claim_refs": ["disrupt-AP-1042-9f2c1a77b0-sms", "disrupt-AP-1042-9f2c1a77b0-whatsapp"] }
```

**Response (`200 OK`):**
```json
{
  "claims": {
    "disrupt-AP-1042-9f2c1a77b0-sms": { "live": true, "status": "queued" },
    "disrupt-AP-1042-9f2c1a77b0-whatsapp": { "live": false, "status": "expired" }
  }
}
```

**Rules:** only an `outbound` `InteractionLog` row with status `queued` is `live: true`. Anything
else — `expired`, `sent`, `delivered`, `answered`, `failed`, an inbound row, or a ref with no row
(`status: "missing"`) — is `live: false`. Unknown refs are never assumed safe. `400
CLAIM_REFS_REQUIRED` for a non-list body, `400 TOO_MANY_CLAIMS` above 500 refs. On any non-200
answer workflow `08` holds the whole push.

### `POST /api/v1/webhooks/patient-reply/`
Interprets a patient's text reply for a channel that has no buttons (SMS, WhatsApp). Django
resolves the sender's phone to the most recent open booking request, applies the intent, and
composes the sentence to send. n8n only delivers `reply_text`.

**Auth:** `X-Webhook-Secret` header only (fail closed, `401` and no writes). Staff JWT is not
accepted — this is a machine-to-machine route.

**Request Payload:**
```json
{
  "phone": "+2348030001122",
  "text": "2",
  "channel": "sms",
  "provider_message_id": "vb-in-8812"
}
```

**Grammar:** a bare number (`1`–`20`), or the same with the teaching word in front
(`Reply 1`, `Option 1`) — the dispatch copy says "Reply 1, 2, or 3", so the engine accepts
what it taught. `cancel` / `stop`, `reschedule` / `change` / `move` / `new time`, and
anything else becomes `needs_reception`.

**One engine everywhere:** the same `handle_patient_reply` core also runs for Telegram text
replies (a plain message from a chat whose `telegram_chat_id:<id>` marker resolves a booking);
Telegram button taps stay a separate, richer flow. The inbound InteractionLog row keyed by
`external_ref` is the idempotency claim on every channel, so a provider retry answers
`duplicate_ignored` instead of acting twice.

**Response (`200 OK`):**
```json
{
  "status": "held",
  "intent": "select",
  "request_id": "REQ-2026-0042",
  "appointment_code": "AP-1042",
  "channel": "sms",
  "reply_text": "Thank you! Your time is held: Dr. Ade, Tue 01 Dec, 09:00 AM. Your reference is AP-1042. ..."
}
```

**Statuses:** `held`, `already_confirmed`, `out_of_range`, `expired`, `duplicate_ignored`
(`reply_text` is `""` — send nothing), `unmatched`, `needs_reception`, `cancelled`,
`re_requested`, `slot_conflict`.

`unmatched` is a normal `200` answer (no open request for that number), not an error.
Replaying the same `provider_message_id` is idempotent and creates no second appointment.
Each accepted message writes one `direction="inbound"` `InteractionLog` row; `unmatched`
writes nothing.

---

## 6. Doctor Leave & Disruptions

Django owns every rule and every sentence here: n8n workflow `08` only delivers.
Notices are queued for `sms` and `whatsapp` (one row per patient per channel,
`claim_ref`-guarded so a placement is announced once). A **third** notice is
queued for `telegram` when the patient's booking request carries a
`telegram_chat_id` marker: Django sends that leg itself (the bot token lives in
Django, like the slot card) and records `sent`/`failed` on the row. With no bot
token the row is `failed` with *"Telegram is not configured (no bot token)."* —
never a silent success. n8n receives only the two provider legs.

### `POST /api/v1/disruptions/{doctor_id}/preview/`
Dry run of the leave plan: the real resolver runs inside a rolled-back
transaction, so the returned placements, counts and per-doctor distribution are
exactly what an approval would do. Nothing is saved, nothing is sent.

### `POST /api/v1/disruptions/{doctor_id}/auto-resolve/`
The one-click plan. Records the leave, then for every affected appointment
tries a qualified colleague at the **same time**, then a free slot **that day**
(earliest first), then the **next days** (3-day lookahead) — under the
zero-double-booking lock, service qualification and sterilization buffers.

```json
{
  "reason": "Planned leave",
  "kind": "planned",
  "leave_start": "2026-12-12T00:00:00+01:00",
  "leave_end": "2026-12-16T23:59:00+01:00",
  "colleague_ids": ["<uuid>"],
  "colleague_caps": { "<uuid>": 3 }
}
```

`kind` is `emergency` (default) or `planned`, and it decides the patient's
sentence: *"due to a sudden emergency"* vs *"because of planned leave"*.
Patients a plan cannot place are reported as **stranded** with Django's reason.

The response adds the real Telegram outcome:
`telegram_queued_count`, `telegram_sent_count`, `telegram_failed_count`
(Django sends this leg synchronously, so the numbers are measured, not hoped
for). `messages_queued_count` stays the sms/whatsapp count.

### `POST /api/v1/clinic/doctors/{id}/end-leave/`
**"The doctor is back today."** Removes TODAY only from every leave covering it:
a leave that started earlier keeps its past days (end → yesterday), a leave
starting today keeps its remaining future days (start → tomorrow), a one-day
leave is deleted. Patients already moved to a colleague **stay** there — the
move was communicated. Returns `{doctor, ended, message}`; `doctor.is_on_leave`
is the real flag, and the receptionist screen uses it instead of guessing.

### `GET|POST /api/v1/clinic/doctors/{id}/leaves/`
List (`leaves` + `doctor.is_on_leave`) or plan a period:
`{start_date, end_date|null, leave_type, reason}`. `end_date: null` means "until
further notice". A plain leave is only for windows with **no bookings**:
`409 LEAVE_OVERLAPS_BOOKINGS` (with `appointment_count`) points at the plan
instead, and `409 LEAVE_OVERLAPS_EXISTING` names the period already there.

### `PATCH|DELETE /api/v1/clinic/doctors/{id}/leaves/{leave_id}/`
Edit or shorten a period (the same overlap rules apply; extending over a
booked patient is refused), or delete it. Deleting the last period restores the
doctor's duty flag.

---

## 7. Master Clinical Calendar & Dynamic Settings

### `GET /api/v1/calendar/schedule/`
Aggregates all 4 schedule layers (doctor shifts, confirmed appointments, active temporary holds, and open free slots) in a single optimized query.

**Query Parameters:**
- `start_date`: `YYYY-MM-DD` (e.g. `2026-10-12`)
- `end_date`: `YYYY-MM-DD` (e.g. `2026-10-18`)
- `doctor_id`: *(Optional)* Filter by doctor UUID
- `service_id`: *(Optional)* Service UUID to automatically dim gaps smaller than treatment duration + buffer

### `GET /api/v1/clinic/settings/`
Returns complete clinic configuration including operating hours, state machine timers, and custom white-label parameters.

### `PATCH /api/v1/clinic/settings/`
Updates clinic operating hours, default buffers, offer windows, or custom white-label settings without requiring database migrations.

### `GET /api/v1/clinic/settings/export/`
Downloads the entire clinic configuration as a clean `client-config.json` template.

### `POST /api/v1/clinic/settings/import/`
Uploads a `client-config.json` to immediately re-brand and configure a new clinic instance in seconds.

---

## 8. Analytics & Reporting

### `GET /api/v1/analytics/summary/`
Returns real-time clinical and operational KPIs for the Receptionist Dashboard and Admin Bento grid.

**Query Parameters:**
- `start_date`: *(Optional)* `YYYY-MM-DD`
- `end_date`: *(Optional)* `YYYY-MM-DD`

**Response Payload (`200 OK`):**
```json
{
  "totalAppointments": 42,
  "attendanceRatePct": 97.4,
  "noShowRatePct": 2.6,
  "avgTriageVelocityMin": 3.8,
  "todayRevenue": 480000.0,
  "todayRevenueFormatted": "₦480,000",
  "breakdown": {
    "total": 42,
    "confirmed": 12,
    "arrived": 4,
    "in_consultation": 2,
    "completed": 20,
    "no_show": 1,
    "cancelled": 2,
    "held": 1
  },
  "revenueByCategory": {
    "Dental Care": 270000.0,
    "Surgeries": 140000.0,
    "General": 70000.0
  },
  "hourlyDistribution": [
    { "hour": "08:00", "count": 4, "heightPct": 40 },
    { "hour": "09:00", "count": 7, "heightPct": 70 },
    { "hour": "10:00", "count": 10, "heightPct": 100 }
  ],
  "topServices": [
    { "name": "Dental Consultation", "count": 18 },
    { "name": "Teeth Whitening", "count": 14 }
  ],
  "topDoctors": [
    { "name": "Dr. Bello Ibrahim", "specialty": "Dental Surgery", "completed_count": 12 }
  ]
}
```

### `GET /api/v1/analytics/export/appointments/`
Streams clean RFC 4180 CSV file of all clinic appointments.

### `GET /api/v1/analytics/export/attendance/`
Streams clean RFC 4180 CSV summary of doctor attendance and completion rates.

---

## 9. Interaction Logs (Phase 2 / Task 2.1)

Authoritative record of every patient-facing communication (VoiceBip call,
WhatsApp, SMS, Telegram) — the Hybrid AI OS spec §6 "Interactions" data area.

### `POST /api/v1/interactions/`
**Auth:** `X-Webhook-Secret` header (n8n Dispatcher) OR staff JWT. Fail-closed otherwise.

**Request:**
```json
{
  "provider": "voicebip",              // voicebip | meta_whatsapp | telegram | system
  "channel": "voice",                  // voice | whatsapp | sms | telegram
  "direction": "outbound",             // outbound | inbound
  "status": "answered",                // queued | sent | delivered | failed | answered | no_answer | expired
  "patient_phone": "+234 803 000 1122",// E.164-normalized server-side
  "patient_name": "Amina Test",
  "request_code": "REQ-2026-0042",     // optional FK resolution (400 if unknown)
  "appointment_code": "AP-1042",       // optional FK resolution (400 if unknown)
  "external_ref": "VB-CALL-7788",      // provider's unique ID — idempotency key
  "claim_ref": "disrupt-AP-1042-9f2c1a77b0-sms", // optional: closes a queued disruption claim
  "call_duration_seconds": 45,
  "recording_url": "https://cdn.voicebip.com/rec/7788.mp3",
  "summary": "Patient accepted the 10:00 slot.",
  "transcript": "...",
  "error_detail": ""
}
```

**Behavior:**
- `201` on create, `200` on re-delivery (same `external_ref` **updates** the existing row — no duplicates)
- `401` without a valid secret/staff credentials; `400` on unknown request/appointment codes or invalid choices
- Broadcasts `interaction_logged` over SSE (non-authoritative, spec §4B)
- `claim_ref` (optional, not a model field) names the queued disruption notice this
  outcome belongs to (`disrupt-<code>-<signature>-<channel>`). Django advances **that**
  row's `status` / `summary` / `error_detail` under the existing status-rank guard, so a
  late `sent` never downgrades a `delivered` row and the claim keeps its own
  `external_ref`. Deliberately narrow: outbound rows only, same channel only, unknown
  refs ignored. This is how a delivered notice stops being deliverable and starts
  blocking automated undo.

### `GET /api/v1/interactions/`
**Auth:** staff JWT only (receptionists and admins).

**Query Parameters:**
- `patient_phone` — E.164-normalized filter
- `request_code` — e.g. `REQ-2026-0042`
- `channel` — `voice` | `whatsapp` | `sms` | `telegram`
- `status` — any of the status choices
- `limit` — 1–200 (default 50, spec §9 pagination)

**Response:** newest-first array of interaction records including resolved
`request_code` / `appointment_code` links.


