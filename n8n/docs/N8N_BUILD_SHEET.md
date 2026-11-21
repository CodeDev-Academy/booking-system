# n8n Build Sheet — Clinic ⇄ Patient Messaging Workflows

> **For:** the in-house n8n builder. Distilled from `plans/voicebip-n8n/01–04.md` and verified
> against the actual Django code (Phase 1–2 contracts, 2026-11-12). Where the partner spec and the
> real backend differ, this sheet follows **the backend** (source of truth) and flags the gap.
>
> **Division of labor:** you build every workflow here. The partner supplies ONLY:
> VoiceBip API key + registered +234 sender number · Meta WhatsApp Phone Number ID + permanent
> access token + approved template names.

---

## 0. Environment & Shared Rules

```env
# n8n instance environment
# CANONICAL (matches .env.example and every shipped workflow): the base URL
# INCLUDES /api/v1 — workflows append bare paths like '/booking-requests/' or
# '/webhooks/expiry-sweep/' to it. A base without /api/v1 makes every call 404.
DJANGO_API_BASE_URL=https://your-clinic-backend.up.railway.app/api/v1
DJANGO_WEBHOOK_SECRET=<MUST equal the backend's WEBHOOK_SECRET env value>
N8N_DISPATCH_WEBHOOK_URL=https://<your-n8n>/webhook/dispatch-offers

# Partner-provided telephony assets
VOICEBIP_API_KEY=pk_live_xxxxxxxx
VOICEBIP_FROM_NUMBER=+234xxxxxxxxxx
WHATSAPP_PHONE_NUMBER_ID=xxxxxxxxxxxxxxxx
WHATSAPP_ACCESS_TOKEN=EAAG...
WHATSAPP_SLOT_OFFER_TEMPLATE=<approved template name — confirm with partner>
```

**Shared rules for EVERY Django call:**

| Rule | Detail |
|---|---|
| Secret | Header `X-Webhook-Secret: {{$env.DJANGO_WEBHOOK_SECRET}}` — without it you get `401 UNAUTHORIZED`. Production is fail-closed. |
| Base | All routes under `$DJANGO_API_BASE_URL/api/v1/...` |
| Phones | Send patient phones as `+234...` (backend normalizes `0803...`/`234...` too, but canonical is `+234...`) |
| Timeouts | Set n8n HTTP Request node timeouts ≤ 5s; Django never waits on you (dispatch is fire-and-forget), but retries on your side must be safe — all write endpoints are idempotent by design |
| Logging | After EVERY patient touchpoint (message sent, call attempted, reply received) → `POST /api/v1/interactions/` (see §1). This powers the receptionist's Patient Dossier. |

---

## 1. The Interaction Logging Call (NEW — required in every workflow)

Every send/receive ends with this write. It is what makes message history visible in the dashboard.

```
POST {DJANGO_API_BASE_URL}/api/v1/interactions/
X-Webhook-Secret: {{$env.DJANGO_WEBHOOK_SECRET}}

{
  "provider": "voicebip" | "meta_whatsapp" | "telegram" | "system",
  "channel": "voice" | "whatsapp" | "sms" | "telegram",
  "direction": "outbound" | "inbound",
  "status": "queued|sent|delivered|failed|answered|no_answer|expired",
  "patient_phone": "+2348031234567",
  "patient_name": "Amina Garba",
  "request_code": "REQ-2026-0042",          // optional — 400 if it doesn't exist
  "appointment_code": "AP-1042",            // optional
  "external_ref": "<provider message/call ID>",  // idempotency key — re-delivery UPDATES, never duplicates
  "call_duration_seconds": 45,              // voice only
  "recording_url": "https://...",           // voice only, if available
  "summary": "Slot options sent (3 options, dual channel).",
  "error_detail": ""                        // put provider error text here on failures
}
```

Responses: `201` created · `200` re-delivery (updated existing row) · `401` bad secret ·
`400` unknown `request_code`/`appointment_code` or invalid choice.

`error_detail` is composed on the n8n side, and only n8n sees the provider's failure
shape. **Do not re-derive it**: copy the canonical `provider-error-classification` block
from `05`'s `Log * Interaction` nodes verbatim (markers `// >>> provider-error-classification`
… `// <<< provider-error-classification`). `n8n/tests/test_lognodes.js` fails on a drifted
copy. See §6.1 item 7 for why the obvious `.replace(/\\"/g, '"')` is wrong.

Full read API (for debugging what you logged): `GET /api/v1/interactions/?patient_phone=+234...&limit=50`
(staff JWT, not secret — use the dashboard instead).

---

## 2. Workflow A — `03_reminder_flows.json` (build FIRST — simplest, validates your setup)

> **BUILT & LIVE (2026-11-17, supersedes the spec below).** As built, `03_Pre_Visit_Reminders_And_Followups`
> (instance `UHQzb7w5gOh2hxcW`, active, 12 nodes) is Workflow B's proven graph: **one hourly cron**
> (`5 * * * *`) replaces the two-cron plan (a single call returns all due items — 24h, 2h, follow-up recall —
> Django decides what's due), and it POSTs Django's new `POST /webhooks/reminder-sweep/` (one call, full item
> contract) instead of `GET /upcoming-reminders/`. **n8n writes no copy**: every message is composed in
> Django (`reminder_service.py`) and delivered verbatim; the WhatsApp leg wraps Django's words as the body
> parameter of the ONE shared template (`WHATSAPP_TEMPLATE_NAME`). Claim refs `rem24-/rem2h-/followup-` keep
> every message single-shot; channels mirror the patient's own outbound log with plain-SMS fallback, never
> voice; only `confirmed` appointments are reminded; copy states the actual date/time, never "tomorrow".
> Details: `n8n.md` Workflow 3 (as built). The original spec below is kept for the partner's context only.

**Purpose:** 24-hour and 2-hour pre-visit reminders. Dual WhatsApp + SMS. **Zero calls.**

| Step | Node | Detail |
|---|---|---|
| Trigger | Cron 1 | Daily at 00:05 WAT → 24h batch. Cron 2 | Hourly at :05 → 2h batch. |
| 1 | HTTP GET | `GET {base}/api/v1/appointments/upcoming-reminders/?window_hours=24` (or `=2`) with `X-Webhook-Secret`. Returns array: `appointment_id, patient_name, patient_phone, doctor_name, service_name, start_datetime, time_display, date_display, clinic_phone, status`. |
| 2 | Filter | Only `status == "confirmed"` (never message cancelled/no-show/arrived patients). Split into items. |
| 3 | Dedupe guard | Check "24h reminder already sent" marker (e.g. n8n static data keyed by `appointment_id` + window) so re-runs don't double-send. |
| 4 | WhatsApp send | `POST https://graph.facebook.com/v18.0/{{$env.WHATSAPP_PHONE_NUMBER_ID}}/messages`, Bearer `{{$env.WHATSAPP_ACCESS_TOKEN}}`, body per template below. |
| 5 | SMS send | VoiceBip SMS (confirm exact endpoint with partner docs; the voice payload in §4 shows the campaign shape — SMS should be `channel: "sms"`). |
| 6 | Log ×2 | InteractionLog per channel (status `sent`/`delivered`, `external_ref` = provider message ID). |

**Message texts (from blueprint 02):**
- 24h WhatsApp: *"Hello {{patient_name}}, this is a friendly reminder for your upcoming medical consultation: {{service_name}} with {{doctor_name}} on {{date_display}} at {{time_display}}. …Need to change it? Call our front desk: {{clinic_phone}}."*
- 24h SMS: *"Cedarcare Clinic: Reminder for your consultation tomorrow at {{time_display}} with Dr. {{doctor_name}}. Questions? Call {{clinic_phone}}. See you tomorrow!"*
- 2h WhatsApp: *"Hello {{patient_name}}, your appointment with Dr. {{doctor_name}} is in 2 hours ({{time_display}} today)! Reception line: {{clinic_phone}}. Safe travels!"*
- 2h SMS: *"Cedarcare Clinic: Your visit with Dr. {{doctor_name}} is in 2 hours ({{time_display}}). Address: Plot 1042 Aminu Kano Crescent, Wuse 2, Abuja."*

**⚠ WhatsApp 24h-session rule:** business-initiated messages to a patient who hasn't written within 24h REQUIRE an approved template. Get the template name(s) from the partner before testing WhatsApp; SMS always works meanwhile.

---

## 3. Workflow B — `02_hold_and_offer_expiry_cron.json` (build SECOND)

> **B is built (2026-11-16).** Live workflow ID `WgdycXudLDdqskEQ` (`02_Hold_And_Offer_Expiry_Sweeper`)
> — active, 12 nodes, `valid: true` (0 errors / 0 warnings). Django composes every word and chooses
> every channel (B.0: items carry `channel`+`message`+`claim_ref`; claim rows pre-written as `queued`
> make every message single-shot). Harness `n8n/tests/test_sweeper.js` 78 assertions; live proof
> `b3_live_proof.py` 18/18. Two spec deviations, both deliberate:
> (1) the recovery message says **RESCHEDULE** — the word `04`/C.1's reply endpoint actually accepts —
> not this sheet's "Reply NEW" (the table below is the original spec, kept for the record);
> (2) n8n holds no copy at all, so the "45-min nudge text" line below is Django's job now
> (`telegram_service.format_pre_expiry_nudge` / `format_graceful_expiry`).

**Purpose:** 60-second expiry sweeper + 45-min soft nudge + 60-min recovery message.

| Step | Node | Detail |
|---|---|---|
| Trigger | Cron | `*/1 * * * *` (every 60s) |
| 1 | HTTP POST | `POST {base}/api/v1/webhooks/expiry-sweep/` with `X-Webhook-Secret`, body `{"triggered_by":"n8n_cron_sweeper","timestamp": "<now ISO>"}`. Response: `{"status":"success","expired_offers_count":N,"expired_requests":[{request_id, patient_name, patient_phone, service_name}]}`. |
| 2 | IF | `expired_offers_count > 0`? |
| 3 | Split | One item per expired request |
| 4 | Nudge or recovery | This sweep fires at the 60-min mark → send the **recovery** message (the 45-min nudge is done by scheduling a separate Wait node chain below, or a second cron reading offers at 45 min — simplest: chain from this same sweep using the request's `offer_expires_at` if you enrich it; else implement nudge as a separate daily-check is WRONG — use the 45-min branch pattern from blueprint 04) |
| 5 | Send WhatsApp + SMS | Recovery text (blueprint 04): *"Hello {{name}}, the previously offered slots have expired to keep our schedule open for all patients. We'd still love to see you! Reply NEW to request fresh times, or tap: [🔄 See New Times]"* (WhatsApp quick-reply button; SMS keyword `NEW`). |
| 6 | Log | InteractionLog ×2 (`expired` status for the expiry event, `sent` for the recovery message). |

**45-min nudge text:** *"Friendly reminder: Your appointment choices for {{service_name}} expire in 15 minutes. Reply 1, 2, or 3 to lock in your time."*

**Idempotency:** sweeping the same request twice is safe — the backend marks status transitions atomically and repeated recovery sends are deduped by your static-data guard + `external_ref`.

---

## 4. Workflow C — `04_patient_response_handler.json` (build THIRD — the critical one)

**Purpose:** inbound WhatsApp/SMS patient replies → one call to Django, which resolves the
phone → open request and the intent. **Django decides; n8n only parses and delivers.**

> **C.1 is built (2026-11-16).** Django now owns the whole interpretation:
> `POST /api/v1/webhooks/patient-reply/` (`X-Webhook-Secret`, body
> `{phone, text, channel, provider_message_id}`) returns
> `{status, intent, request_id, appointment_code, channel, reply_text}`. See `n8n.md` §5.8.
> The table below is the C.2 rebuild spec; nothing here needs a second Django call.

### 4.1 Current build state (C.2, 2026-11-16) — ✅ DONE

Workflow ID `lBAjZ9ozCvFzKIBs` (`04_Patient_Response_Handler`) — **active**, 19 nodes,
`valid: true` (0 errors, 22 connections, 23 expressions). Repo JSON is the source; the spec
table above was followed exactly. The full graph and the response contract live in
`n8n.md` §5.8.1.

| Verification | Result |
|---|---|
| Harness (`node n8n/tests/test_reply_handler.js`) | **91 assertions**, runs the shipped node sources: fail-closed auth, Meta + VoiceBip payloads, one-call rule, duplicate skip, delivery routing, outbound row, drift guards |
| Live proof (`c2_live_proof.py` through the running workflow) | **36/36 checks**: wrong secret → 401 with zero writes, out-of-range + hold + replay + WhatsApp cancel + status-callback ignore + reschedule, two replies → two outbound rows, voice-tagged SMS → SMS, unmatched number → guidance reply; DB left clean |
| Django regression suite | `manage.py test --parallel 1` → **218 tests, OK** |
| Removed by design (asserted by the harness) | staff-JWT `PATCH …/status/`, duplicated `/api/v1`, secret fallbacks, `re_request_slots_` prefix |

**Companion fix — `06_Provider_Simulator` mints one id per message (C.2).** The outbound
`InteractionLog` row is keyed on `external_ref` and `/interactions/` upserts on it, so a
request-scoped mock id (`mock-sms-<REQ>`) made the second reply overwrite the first row.
The simulator now returns `mock-<channel>-<request_code>-<stamp>` / `wamid.mock-whatsapp-<request_code>-<stamp>`
(real gateways do exactly this — the id is what a delivery report matches). Guarded by
`node n8n/tests/test_simulator_ids.js` (19 assertions). Manual REPL tests: read the actual id
from the log row or execution output — it is no longer predictable.

| Step | Node | Detail |
|---|---|---|
| Triggers | 2 webhooks | `/webhook/whatsapp-inbound` (Meta payload) and `/webhook/sms-inbound` (VoiceBip SMS). Both must respond < 5s (Meta retries). Both need the **fail-closed** `X-Webhook-Secret` check copied from `05` (`Verify … Secret` → `IF … Authorized` → true 401 via `responseMode: responseNode`). No `$env.X || 'clinic_dev_…'` fallbacks. |
| 1 | Normalize | Extract `phone`, `text` (or button payload → its number/word), `channel`, `provider_message_id`. Send the phone as received; Django normalizes (`0803…` and `+234803…` are one identity). Never build a URL with `/api/v1` twice: `DJANGO_API_BASE_URL` **already includes** `/api/v1`. |
| 2 | Patient Reply call | `POST {DJANGO_API_BASE_URL}/webhooks/patient-reply/` with `X-Webhook-Secret`, body `{"phone", "text", "channel", "provider_message_id"}`. **ONE call.** Do not PATCH `/appointments/{id}/status/` (staff-JWT-only, and a patient webhook must never touch arbitrary ids). |
| 3 | Branch on `status` | `held` / `already_confirmed` / `out_of_range` / `expired` / `cancelled` / `re_requested` / `needs_reception` / `slot_conflict` → send `reply_text` **verbatim** on the same channel. `duplicate_ignored` (`reply_text: ""`) → send **nothing**. Any non-2xx or network error → log and stop; do not invent a message. |
| 4 | Log | **Do not POST `/interactions/` for the inbound message.** Django already wrote exactly one `direction="inbound"` row (it is also the idempotency claim). A second row would duplicate the patient's message in the dossier. |
| — | Removed by design | `4a` slot lookup, static-data maps, the `option_number`+`request_id` construction, `re_request_slots_{id}`, and the two-call select/re-request split. All of it is one endpoint now. |

**Cross-channel neutralization (double-reply defense):** solved in the backend. Any second
selection for a request that already has an active hold or confirmation answers
`200 already_confirmed` with the existing `appointment_code`, and the same message replayed by
the provider answers `duplicate_ignored` with an empty `reply_text`. A stale or lost n8n map can
never make a live reply fail, because there is no map.

---

## 5. Workflow D — `05_slot_offer_dispatcher.json` (build LAST — needs partner creds)

**Purpose:** receives the receptionist's dispatch from Django, blasts offers on all channels.

**Trigger (already exists):** webhook `POST /webhook/dispatch-offers` — Django sends it
fire-and-forget with this payload (verified against `DispatchOffersView`):

```json
{
  "request_id": "REQ-2026-0042",
  "patient_name": "Amina Garba",
  "patient_phone": "+2348031234567",
  "service_name": "Dental Consultation",
  "clinic_name": "Cedarcare Specialist Clinic",
  "telegram_chat_id": "<or null>",
  "channel": "web" | "telegram" | "whatsapp_flow",
  "dispatch_channels": ["whatsapp", "sms", "voice"],
  "expiry_minutes": 60,
  "offer_expires_at": "2026-11-13T11:02:00+01:00",
  "candidate_slots": [
    { "id": "<slot_offer uuid>", "doctor_name": "Dr. Bello Ibrahim",
      "start_datetime": "2026-11-10T10:00:00+01:00", "end_datetime": "...",
      "date_label": "Tue, 10 Nov 2026", "time_label": "10:00 AM",
      "is_alternative_date": false, "offered_at": "...", "expires_at": "..." },
    ...one per offered option...
  ]
}
```

**Task 3.5 enrichments (2026-11-13):** `clinic_name`, `expiry_minutes`, `offer_expires_at`
and pre-formatted `date_label` / `time_label` (Africa/Lagos, matches the dashboard exactly).
n8n does ZERO timezone math — just compose `1️⃣ {{date_label}} at {{time_label}} ({{doctor_name}})`.

⚠ **Option numbering is a contract:** Workflow C resolves the patient's reply ("2") against
the offers in ORIGINAL dispatch order. Display options in `candidate_slots` array order,
1→n. Never reorder, filter, or renumber them — even when some channels are skipped.

**`dispatch_channels` (Task 3.1, 2026-11-13):** the receptionist's checkbox selection in the
ReviewModal — any non-empty combination of `whatsapp` / `sms` / `voice`; default is all three.
- `whatsapp` checked → send the WhatsApp leg; if the patient came via Telegram (Telegram-first
  era, `telegram_chat_id` present) the instant-message leg is the Telegram card instead.
- `whatsapp` NOT checked → skip the instant-message leg entirely (no WhatsApp, no Telegram).
- `sms` → VoiceBip SMS leg. `voice` → the 30s-wait → VoiceBip call leg.
- Distinct from `channel` (where the patient CAME FROM) — never confuse the two.
- Backend guard: if the patient already has an active hold/confirmed booking, Django returns
  **409 `PATIENT_ALREADY_BOOKED`** and fires NOTHING — no workflow run, no wasted messages.

✅ **Spec gap resolved (Task 3.5, 2026-11-13):** the payload now carries `date_label` /
`time_label` (Africa/Lagos, identical to the dashboard), `clinic_name`, `expiry_minutes` and
`offer_expires_at`. n8n does **no date math and no `toLocaleDateString`** — it prints the
labels verbatim. Remaining spec extras (`voice_nudge_enabled`, shortlinks) are not needed for
the current flow; the voice leg is gated by the `voice` checkbox plus the status probe below.

⚠ **Telegram is sent by Django, not by D.** When `telegram_chat_id` is present and the
`whatsapp` checkbox is on, the backend already delivered the interactive Telegram card
**and logged it** to the InteractionLog (`provider: telegram`, `external_ref:
telegram-msg-<message_id>`). D must NOT resend it — for Telegram patients D only handles
`sms` and `voice`. When Meta WhatsApp credentials land, the same checkbox routes the
instant-message leg to Workflow D for non-Telegram patients.

🛡 **Fast-replier guard (Task 3.5):** before placing the 30s voice nudge, call

```
GET {DJANGO_API_BASE_URL}/api/v1/booking-requests/{request_id}/dispatch-status/
X-Webhook-Secret: {{$env.DJANGO_WEBHOOK_SECRET}}

→ { "status": "slots_offered", "has_active_hold": false,
    "has_confirmed_booking": false, "appointment_code": null,
    "should_skip_voice_call": false }
```

If `should_skip_voice_call` is `true` (patient already picked an option — hold or confirmed
booking), **skip the call entirely** and log nothing extra. Works with the webhook secret;
no staff session needed.

### 5.1 Current build state (Stages D-1 … D-5 + Phases 0-2, 2026-11-14)

Workflow ID `GtpeOwfnG8yYyAxq` (`05_Slot_Offer_Dispatcher_Bridge`) — **active**, 20 nodes,
`valid: true` (**0 errors, 0 warnings** — the old fail-closed warning was closed in
Phase 2 by wiring the probe's error output). Graph:

````
Dispatch Offers Webhook from Django        (responseMode: responseNode)
   └─ Verify Dispatch Secret                (Code: X-Webhook-Secret vs $env.DJANGO_WEBHOOK_SECRET)
        └─ IF Dispatch Authorized
             ├─ false → Respond Dispatch Unauthorized            401  (graph stops here)
             └─ true  → Respond Dispatch Accepted                200  (Django is released immediately)
                  └─ Format Offers & Telegram Buttons      (Task 3.5 code: labels, options, sms_body, want_*)
                       └─ Provider Config & Adapter        (Code, runOnceForAllItems — ONE item per active channel)
                            └─ Route Provider Request      (Switch: whatsapp | sms | voice | skip)
                                 ├─ whatsapp → Send WhatsApp Interactive Message → Log WhatsApp Interaction
                                 ├─ sms      → Send SMS (VoiceBip)               → Log SMS Interaction
                                 ├─ voice    → Wait 30s Before Voice Nudge
                                 │              └─ Check Patient Replied (dispatch-status)  [GET, onError: continueErrorOutput]
                                 │                   ├─ ok    → Merge Voice Guard  (reattach payload + voice_guard)
                                 │                   │            └─ IF Voice Still Needed
                                 │                   │                 ├─ true  → Send Voice Call (VoiceBip) → Log Voice Interaction
                                 │                   │                 └─ false → (stop, no call)
                                 │                   └─ error → Log Voice Probe Failure   (Phase 2)
                                 │                                └─ failed row: call suppressed (fail closed)
                                 └─ skip     → Log Skipped Channel  (Phase 2)
                                              └─ queued row per actionable skip reason
````

**Authentication (Phase 0).** This is the only n8n entry point that can make the clinic send
real messages and place real calls, so it is authenticated **before** anything else runs.
`Verify Dispatch Secret` compares the `X-Webhook-Secret` header against
`$env.DJANGO_WEBHOOK_SECRET` and **fails closed** when the env var is unset. The graph uses
`responseMode: responseNode` so the rejection is a real **401** (not a silent 200), while an
authorized request is answered **200 in ~200 ms** — before the 30-second voice wait, so
Django's 5-second fire-and-forget timeout is never at risk.

Django sends the header from `dispatch_service.fire_and_forget_webhook(..., secret=...)`,
resolved by `resolve_webhook_secret()` (ClinicSetting → `settings.WEBHOOK_SECRET` → dev
fallback) in the request thread, keeping the daemon thread database-free.

Verified live: no header → `401 bad_secret`; wrong header → `401 bad_secret`; correct header
→ `200` in 225 ms and the dispatch still completed end-to-end (execution 63, SMS logged with
`mock-sms-REQ-2026-0044`).

**Sends are LIVE against the simulator (D-3).** All three provider nodes are enabled and
make a real HTTP POST using `provider_request.{url,headers,body}`. `PROVIDER_MOCK=true`
points those URLs at the companion workflow `06_Provider_Simulator`
(`JrsFTzRpf2yyoZsW`, `/webhook/provider-sim/{whatsapp|sms|voice}`), which returns a realistic
payload or an HTTP 500 when `PROVIDER_MOCK_FAIL=true`. So mock runs exercise the real send
nodes, the real bodies and the real error path — not a bypass.

**Logging (D-3).** Each send node's **success and error outputs both feed one Code log node**,
which POSTs to `{{$env.DJANGO_API_BASE_URL}}/interactions/` with `X-Webhook-Secret`:

| Branch | `provider` | `channel` | `summary` |
|---|---|---|---|
| WhatsApp | `meta_whatsapp` | `whatsapp` | Appointment options sent via WhatsApp |
| SMS | `voicebip` | `sms` | Appointment options sent via SMS |
| Voice | `voicebip` | `voice` | Voice nudge call |

- Success → `status: sent`, `external_ref` from the provider (`external_ref` / `message_id` /
  `id` / `call_id`); re-delivery upserts onto the same row.
- Failure → `status: failed`, no `external_ref` (each failed attempt is its own event) and a
  plain-language `error_detail` extracted from the provider's error body. That row is what the
  dashboard's **Needs Attention** tab counts (`delivery_failures` / `last_failure`).
- Logging never breaks a dispatch: the POST is wrapped in try/catch and the result is returned
  in `interaction_log` on the item.

**Why the three `IF Want *` nodes were removed (Stage D-1 finding):** all three IFs passed
*identical* items downstream — every item carried every `want_*` flag — so a node after them
could not tell which branch it came from (a live run routed all three items as `sms`).
Branching therefore lives inside the adapter, which emits exactly one item per active
channel. Do not re-introduce per-channel IFs.

**`Provider Config & Adapter` contract** (single source of provider config — no node
hardcodes a URL, key or sender id; everything comes from `$env`):

| Field | Meaning |
|---|---|
| `provider_channel` | `whatsapp` \| `sms` \| `voice` (the item's channel) |
| `provider_request.route` | same value, or `skip` |
| `provider_request.skip_reason` | `no_slots` \| `duplicate_dispatch` \| `missing_phone` \| `outside_call_window` \| `provider_not_configured` \| `whatsapp_template_not_configured` \| `no_active_channel` \| `patient_already_engaged` \| `voice_payload_missing` |
| `provider_request.{method,url,headers,body}` | the exact HTTP call the send node makes (live since D-3) |
| `adapter_meta` | `channel, provider_mock, provider_mock_fail, configured, voice_in_window, duplicate, request_id, external_ref_hint, missing_env[]` |
| `voice_guard` (voice branch only) | `checked, checked_at, wait_seconds, should_skip, request_status, has_active_hold, has_confirmed_booking, appointment_code` |

Active-channel rules (in the adapter, in this order):
- `whatsapp` — `want_whatsapp && !chat_id` (a Telegram patient already got Django's card)
- `sms` — `want_sms`
- `voice` — `want_voice`, then gated by quiet hours **08:00–19:00 `Africa/Lagos`**

Guards:
- **Dedupe** — `$getWorkflowStaticData('global')` keyed `request_id:channel`, 10-minute
  prune. Best-effort only: static data does not persist across manual test runs, and
  Django's `PATIENT_ALREADY_BOOKED` 409 + offer state remain authoritative. (It *does*
  survive an n8n restart, which is why a repeat test inside 10 minutes shows
  `duplicate_dispatch`.)
  **Stamped by sends, not by attempts (Phase 3 / 3.4):** the window is read before routing
  and written only for legs whose `skip_reason === null`. A skipped leg never reached a
  provider, so it must leave the window open — otherwise fixing the cause (adding a slot,
  pasting credentials, adding a phone number) and re-dispatching minutes later is refused
  as `duplicate_dispatch`, which is unlogged, and the patient silently gets nothing. A leg
  that *fails* still stamps: the adapter cannot see the HTTP outcome, so the operator
  decides whether to retry.
- **Mock** — `PROVIDER_MOCK` unset **or** true → every provider URL is pointed at
  `06_Provider_Simulator`; the send nodes still run for real. `PROVIDER_MOCK_FAIL=true`
  makes the simulator answer **HTTP 500**, which drives the real failure path.
- **Not configured** — with mock off, a channel missing its env vars routes to `skip`
  (`provider_not_configured`) instead of firing a broken call.
- **Voice fast-replier guard (D-2)** — the voice leg waits **30s**, then
  `GET {DJANGO_API_BASE_URL}/booking-requests/{request_id}/dispatch-status/` with
  `X-Webhook-Secret`. `should_skip_voice_call: true` (patient already holds or booked a
  slot) → route becomes `skip` / `patient_already_engaged`, the IF sends nothing and **no
  call is placed**. If the probe fails (404 / Django down) the HTTP node's **error output
  is deliberately unwired**, so the call is also skipped — the guard fails closed, never
  open. The `Merge Voice Guard` code node reattaches the adapter payload (the probe
  response replaces the item) and records the full `voice_guard` block for the log.

- Workflow settings timezone: `Africa/Lagos`.
- Verified live (executions 15–18): per-channel routing, Telegram patient suppressing the
  WhatsApp leg, `duplicate_dispatch`, `outside_call_window`, and the mock
  `external_ref`/`status`.
- Verified live (executions 20–22, D-2): **20** no hold → 30.2s → probe `should_skip:
  false` → IF true → call leg reached; **21** active hold `AP-D2GUARD` → probe
  `should_skip: true` → IF false → `Send Voice Call` never ran; **22** unknown request →
  probe 404 → error output → branch stopped, no call, execution still `success`.
- Verified live (executions 27–39, D-3): **27** all three legs POST to the simulator, each
  logging `sent` with `mock-<channel>-<request_code>`; **32** `PROVIDER_MOCK_FAIL=true` →
  all three 500 → `status: failed` with a readable `error_detail`; **36** same on a
  two-channel dispatch; **39** back in normal mode, all three `sent` again. Django confirmed
  the rows (`REQ-2026-0006` → 3 interactions) and `delivery_failures: 2` +
  `last_failure` on `REQ-2026-0040`, which is exactly what the Needs Attention tab reads.
- Flip-live is **config only**: set `PROVIDER_MOCK=false` plus the `VOICEBIP_*` /
  `WHATSAPP_*` env vars, restart n8n (env vars are read at process start), then deactivate
  and delete `06_Provider_Simulator`.

**WhatsApp leg is credential-ready but dormant (Phase 1).** Telegram is the launch channel
(no WhatsApp Business account yet), so the leg is pre-wired and inert until credentials are
inserted:

- **Template mode is the only live mode.** Meta rejects business-initiated free-form text
  outside the 24-hour customer-service window (`131047`), and a slot offer always goes to a
  patient who has not messaged us recently. `WHATSAPP_TEMPLATE_MODE=template` (default) builds
  `type: "template"` with the approved name/language and positional body parameters from
  `WHATSAPP_TEMPLATE_PARAM_ORDER` (default `patient_name,service_name,option_1,option_2,option_3,expiry`).
  Up to **3** quick-reply buttons (`1`,`2`,`3`) are appended, capped because that is Meta's
  limit even though Telegram shows more. `WHATSAPP_TEMPLATE_MODE=text` exists only for
  in-window replies.
- **Gate:** in template mode with `WHATSAPP_TEMPLATE_NAME` empty, the leg routes to
  `skip / whatsapp_template_not_configured` — it never fires a request, so a half-filled
  config cannot produce a wall of 400s. Precedence: `provider_not_configured` (no phone
  id/token) is reported first, then the template gate.
- **`to` is E.164 without the plus** (`+2348033112233` → `2348033112233`); Django
  re-normalizes whatever comes back.
- **`biz_opaque_callback_data: <request_code>`** is sent on every WhatsApp message. Meta
  echoes it in every status callback, and it is the only reliable way to link a real
  `wamid…` back to a `BookingRequest`.
- **Mock still exercises the template path:** with `PROVIDER_MOCK=true` the template name
  defaults to `mock_clinic_slot_offer`, so the real template body is built and posted to the
  simulator. The simulator now answers with Meta's **real** response shape
  (`{contacts:[…], messages:[{id:"wamid.mock-whatsapp-<REQ>"}]}`) instead of a convenient
  flat `external_ref`, so the wamid capture is genuinely tested.
- **`external_ref`** for WhatsApp is read as `messages[0].id` **first**, then the legacy flat
  fields — missing it would leave `external_ref` NULL and no callback could ever advance the
  row.

Verified live: mock dispatch built the template body (`to` without `+`, 6 params, 2 quick
replies) and logged `wamid.mock-whatsapp-REQ-2026-0040`; live mode with fake credentials but
no template → `skip / whatsapp_template_not_configured`, empty url/body, no send node.

**Skip visibility (Phase 2).** Before Phase 2, a channel the receptionist asked for that
could not fire vanished into the execution log — the switch's skip output and the voice
probe's error output were both dead ends. Now every actionable skip is a **record in
Django**, and the suppressed voice call is a **Needs Attention** row:

- **`Log Skipped Channel`** (switch `skip` output, and since 3.8 the voice guard's `false`
  output) writes one `status: queued` InteractionLog
  row per actionable reason — `outside_call_window`, `provider_not_configured`,
  `whatsapp_template_not_configured`, `missing_phone`, `no_slots`, `voice_payload_missing` — with `summary: "Held back: <plain
  language>"`, `error_detail: <reason code>` and a deterministic `external_ref`
  (`skip-<channel>-<request_code>`, so repeats upsert instead of piling up). By decision,
  `duplicate_dispatch` (the original send row exists) and `no_active_channel` (the Telegram
  card Django sent is already logged) write **no** row.
- **`voice_payload_missing`** is the guard's own fail-safe and only fires when the graph is
  inconsistent (the adapter produced no voice item). Since 3.8 the guard sets
  `should_skip = true` for it and inherits `request_id` from the probe, because the old
  behaviour passed the gate and reached the send node with `provider_request.url ===
  undefined` — an aborted workflow instead of a record. The IF's `false` output was wired to
  nothing and now goes to `Log Skipped Channel`; `patient_already_engaged` rides the same
  wire but stays unlogged because `REASON_TEXT` has no entry for it (the decision above is
  unchanged).
- **`Log Voice Probe Failure`** (probe error output) writes a `status: failed` voice row —
  `external_ref: probe-<request_code>`, plain-language `error_detail` ("Status probe
  failed — voice call suppressed (fail closed): …") — so a suppressed call surfaces in
  Needs Attention instead of disappearing. This is what closed the last validation warning.
- **`missing_phone` guard** in the adapter: precedence `no_slots` → `duplicate_dispatch` →
  `missing_phone` → `outside_call_window` → `provider_not_configured` →
  `whatsapp_template_not_configured`; a skipped leg builds no URL/body. `no_slots` leads
  because with zero candidate options there is nothing to say on any channel (Django's
  engine fallback can legitimately find none).
- **Django side:** `POST /interactions/` accepts a phoneless row **only** when
  `status=queued` AND it links a request (skip rows are internal bookkeeping; a `sent`
  row without a phone is still 400), and `resolve_channel_availability` marks sms/voice
  (and provider-WhatsApp) unreachable with *"No phone number on file for this patient."*
  when the booking has no number — reception sees the warning **before** dispatch.
- Best-effort by design: the skip/probe loggers catch their own errors, so a Django outage
  can never fail a dispatch. The skip already happened; the row is a record, not a gate.

Verified live: phoneless dispatch → 3 queued rows (`missing_phone`); evening dispatch →
queued row (`outside_call_window`); live mode no creds → queued row
(`provider_not_configured`); live mode fake creds + no template → queued row
(`whatsapp_template_not_configured`); dead-port probe → **failed** row, no call placed;
repeat dispatch inside the 10-min dedupe window → no rows (duplicate is not row-worthy);
normal dispatch → sends + `sent` rows, no queued rows. Adapter harness 38/38.

Since 3.8, verified live on `REQ-2026-9801..9803`: with the adapter's voice item
deliberately hidden, the dispatch produced **one** `queued` row
(`external_ref: skip-voice-…`, `error_detail: voice_payload_missing`) and **no** call
attempt; with the adapter restored, an already-booked patient produced **no** row
(`patient_already_engaged`), and a clean dispatch still called and logged
`mock-voice-…`. `n8n/tests/test_voice_guard.js` pins both nodes (31 assertions).

### 5.2 Remaining D steps

| Step | Node | Detail |
|---|---|---|
| 1 | Code | ✅ Done — `Format Offers & Telegram Buttons` builds labels, `options[]`, `options_text`, `sms_body`, `whatsapp_params`, `want_*`. Since Phase 3 the reply sentence is derived from the real option count (`Reply 1` / `Reply 1 or 2` / `Reply 1, 2, or 3`) with singular/plural for the slot count and expiry. |
| 2 | Adapter + routing | ✅ Done (D-1) — `Provider Config & Adapter` (one item per active channel, mock, dedupe, quiet hours, `configured` gate) → `Route Provider Request` switch. The three `IF Want *` nodes were removed (see §5.1). |
| 3 | WhatsApp send | ✅ Done (D-3) — enabled, driven by `provider_request`; against the simulator today, Meta Cloud API template once creds land. |
| 4 | SMS send | ✅ Done (D-3) — enabled; VoiceBip SMS body already composed as `sms_body`; sender ID `Cedarcare`. |
| 5 | Log ×3 | ✅ Done (D-3) — one Code node per branch, `POST {DJANGO_API_BASE_URL}/interactions/`, `external_ref` = provider id, failures carry a plain-language `error_detail`. |
| 6 | Voice guard | ✅ Done (D-2) — `Wait 30s` → `GET dispatch-status/` → `Merge Voice Guard` → `IF Voice Still Needed`; skip + fail-closed on probe error. |
| 7 | VoiceBip call | ✅ Done (D-3) — enabled, `POST {VOICEBIP_API_URL}/voice/calls`, `Authorization: Bearer {{$env.VOICEBIP_API_KEY}}`, `agent_id`, `caller_id`; nudge only, no DTMF. |
| 8 | Log voice | ✅ Done (D-3) — `provider:"voicebip"`, `channel:"voice"`, `status: sent|failed`; `answered`/`no_answer` arrive with the D-4 callback. |
| 9 | Callback receiver | ✅ Done (D-4) — `07_Provider_Callback_Receiver` (`rmqf5Z5K3EfapVGo`, **13 nodes**) receives VoiceBip delivery-report / call-outcome webhooks, **and Meta WhatsApp status callbacks**, and POSTs them to `interactions/`. See §5.3. |
| 10 | Respond | ✅ Not needed — webhook responds immediately. |

### 5.3 Provider callback receiver (Stage D-4 + Phase 1 WhatsApp)

Workflow `07_Provider_Callback_Receiver` (`rmqf5Z5K3EfapVGo`) — **active**, 13 nodes,
`valid: true` (0 errors, 0 warnings). Webhook: **`GET` + `POST` on the same path**
(`/webhook/provider-callback`), `multipleMethods: true`, `responseMode: responseNode`
(the caller gets a real status code, unlike the dispatcher).

```
Provider Callback Webhook                    (GET + POST, one output PER METHOD)
   ├─ GET  → Handle Verification Handshake   (Meta hub.challenge)
   │           └─ IF Verification Handshake
   │                ├─ true  → Respond Verification Challenge   text, 200 or 403
   │                └─ false → (unused on GET)
   └─ POST → Handle Verification Handshake   (mode != subscribe → handshake:false)
                └─ IF Verification Handshake
                     └─ false → Verify & Normalize Provider Event   (Code)
                          └─ IF Authorized
                               ├─ true  → IF Should Forward
                               │            ├─ true  → Post Interaction Update
                               │            │            ├─ success → Respond Accepted           200
                               │            │            └─ error   → Classify Update Failure
                               │            │                         ├─ 4xx → Respond Retry 200 (rejected: true)
                               │            │                         └─ else → Respond Retry 500 (retry: true)
                               │            └─ false → Respond Ignored                            200
                               └─ false → Respond Unauthorized                                    401
```

> **Gotcha found live:** with `multipleMethods: true` the webhook node exposes **one
> output per HTTP method** (`main[0]` = GET, `main[1]` = POST). Wiring only `main[0]`
> makes every POST callback fall off the graph and return an empty `200`. Both outputs
> must connect to the same handler.

**Meta webhook verification (Phase 1).** Meta registers a callback URL by calling
`GET <url>?hub.mode=subscribe&hub.challenge=<nonce>&hub.verify_token=<token>` and expects
the challenge echoed as **plain text**. `Handle Verification Handshake` compares
`hub.verify_token` with `WHATSAPP_VERIFY_TOKEN` and answers the raw challenge (200) or
`403` when the token is wrong/unset — fail closed, so an unconfigured receiver never
verifies.

**Meta status envelope (Phase 1).** Meta wraps events in
`entry[].changes[].value.statuses[]` and can batch several into one request (a phone
coming online produces `sent` + `delivered` together). `Verify & Normalize` unwraps the
batch and emits **one item per status**, so the tail of a batch is never dropped. The
wamid is taken from `statuses[].id`, the phone from `recipient_id`, the failure sentence
from `errors[0].error_data.details` (prefixed with `errors[0].code`, e.g. `(131047)`), and
the booking link from `biz_opaque_callback_data` — which the dispatcher sets on every
WhatsApp send, because nothing else survives the round trip.

Inbound patient replies arrive on the same webhook in Meta's model; they are acked and
ignored (`inbound_message_not_a_status_event`) because Workflow C owns them.

**No HMAC signature check (verified limitation).** Meta signs POSTs with
`X-Hub-Signature-256`, computed over the **raw body**. n8n's webhook node parses JSON
before the workflow sees it and exposes no raw bytes (`rawBody: true` still yields an
object; `binaryData` yields nothing), so the signature cannot be verified in-graph. The
shared token is therefore the authentication for Meta: register the callback URL as
`https://<n8n>/webhook/provider-callback?token=<PROVIDER_CALLBACK_TOKEN>` — Meta preserves
the query string on every POST. Add HMAC later via a proxy that keeps the raw body.

**Auth — fail closed.** The shared token (`PROVIDER_CALLBACK_TOKEN`) must arrive in a
**header** — `X-Provider-Token` / `X-Callback-Token` / `X-Webhook-Token` — because n8n
records the webhook's `query` in every execution, so a `?token=` URL writes the secret into
the log of every callback. Two forced exceptions (Phase 3 / 3.5): a query token is honoured
on a **Meta envelope** (`body.entry[]`) because Meta cannot send custom headers, and on any
body when `PROVIDER_CALLBACK_ALLOW_QUERY_TOKEN=true` (escape hatch for a URL-only partner;
unset = closed, only the literal `true` opens it). `body.token` is never accepted. If the
env var is **unset**, every callback is rejected 401 (`receiver_not_configured`) — an
unconfigured receiver never accepts traffic.

**Status mapping.** Only two tables change when the partner contract lands:
`STATUS_ALIASES` and `CHANNEL_ALIASES` in `Verify & Normalize Provider Event`.

| Provider says | Stored |
|---|---|
| `queued`, `pending`, `scheduled`, `initiated`, `created` | `queued` |
| `sent`, `submitted`, `accepted`, `ringing`, `in_progress` | `sent` |
| `delivered`, `read`, `delivery_success` | `delivered` |
| `answered`, `completed`, `call_answered`, `human_answered` | `answered` |
| `no_answer`, `unanswered`, `busy`, `line_busy`, `voicemail`, `machine_detected` | `no_answer` |
| `failed`, `error`, `rejected`, `undelivered`, `cancelled` | `failed` |
| `expired`, `timeout`, `timed_out` | `expired` |
| anything else | **ignored, HTTP 200** (`unknown_status`) |

Channel is taken from `channel` / `medium` / `channel_type`, else inferred from the
`external_ref` (`mock-voice-…`), the event name (`sms.delivered`), or the status
(`answered` → voice). A channel that is **named but unrecognised** is a contract mismatch,
not an SMS: it is ignored (`200 {ignored:true, reason:"unknown_channel"}`) and writes no
row, so a misconfigured partner cannot inject plausible-looking SMS rows into the patient
timeline. Only when no channel is claimed at all does the documented SMS last resort apply
(VoiceBip's remaining product). Provider: `voicebip` for voice/SMS, `meta_whatsapp` for
WhatsApp, `telegram` for Telegram; a Meta envelope is WhatsApp whatever it claims.

**Ignore, don't fail.** An event with an unknown status or no `external_ref` is
answered `200 {ok:true, ignored:true, reason}`. Retrying cannot fix it, and a 5xx
would make the provider hammer the endpoint.

**Why the 4xx/5xx split.** Django `400` means the event will *never* be accepted
(unknown `request_code`, invalid recording URL). Answering 500 would loop forever, so
it answers **200** with `rejected: true`. Anything else (connection refused, timeout,
5xx) is transient and answers **500** so the provider retries.

**Status rank lives in Django, not here.** `InteractionLog.STATUS_RANK`
(`queued 0 < sent 1 < delivered 2 < terminal 3`) is enforced in
`POST /api/v1/interactions/`: an event whose rank is lower than the stored row's
never overwrites it and only fills blank fields. Terminal outcomes share rank 3, so
the most recent terminal event wins (a corrected `answered → no_answer` is accepted).
That keeps the guarantee even if a callback is replayed from outside n8n.

**Phone may be omitted.** A provider callback normally identifies the message/call by
`external_ref` only. When the row exists, Django reuses its stored number; a brand-new
row without a phone is still rejected `400`.

**Verified live (2026-11-14):**

| Case | Result |
|---|---|
| no token / bad query token / bad header token | `401 unauthorized` (all three) |
| unknown event (`teleported`) | `200 {ignored:true, reason:"unknown_status"}` |
| `call.completed` for `mock-voice-REQ-2026-0038` | `200`, row → `answered`, duration 62, recording URL stored, request linked |
| late `delivered` on that same row | `200`, row **stays `answered`** (rank guard) |
| `sms.delivered` for `mock-sms-REQ-2026-0038` | `200`, row `sent` → `delivered` |
| unknown `request_code` → Django 400 | `200 {rejected:true, retry:false}` (no retry storm) |
| Django unreachable (POST pointed at a dead port) | `500 {retry:true, reason:"django_unavailable"}` |

**Phase 1 (Meta WhatsApp), verified live:**

| Case | Result |
|---|---|
| `GET ?hub.mode=subscribe` + correct `hub.verify_token` | `200` with the raw challenge (`1158201444`) |
| `GET` + wrong verify token | `403 bad_verify_token` |
| `GET` without `hub.mode` | falls through to the callback pipeline → `401` |
| Meta `statuses:[delivered]` for a real wamid | `200 accepted`, row `sent` → `delivered`, **1 row**, linked to `REQ-2026-0043` via `biz_opaque_callback_data` |
| Meta batch `[sent, delivered]` in one POST | both items processed, row ends `delivered` (tail not dropped) |
| Meta `failed` + `errors[]` (code 131047) | row `failed`, `error_detail: "(131047) Message failed to send because more than 24 hours…"` |
| Meta inbound `messages[]` | `200 {ignored:true, reason:"inbound_message_not_a_status_event"}`, no row created |
| Meta unknown status (`deleted`) | `200 {ignored:true, reason:"unknown_status"}` |
| flat VoiceBip SMS / voice (regression) | unchanged: `delivered` / `answered` + duration + recording |

---

## 6. Existing JSON skeletons (what's already in `n8n/`)

| File | State | Your job |
|---|---|---|
| `01_intake_webhook.json` | Intake notifications | Minor — intake lands in Django directly; n8n intake webhook is mostly for the dashboard chime |
| `02_hold_and_offer_expiry_cron.json` | Sweeper skeleton | Per §3 — add nudge branch + recovery sends + logging |
| `03_reminder_flows.json` | Reminder skeleton | Per §2 — add SMS leg + logging + dedupe |
| `04_patient_response_handler.json` | ✅ Rebuilt (C.2, 2026-11-16) — live `lBAjZ9ozCvFzKIBs`, 19 nodes | Done per §4 — one call to `POST /webhooks/patient-reply/`, `reply_text` delivered verbatim. PATCH branch, duplicate `/api/v1`, secret fallbacks and `re_request_slots_` prefix are **removed** (harness-asserted). See `n8n.md` §5.8.1. |
| `05_slot_offer_dispatcher.json` | ✅ Fresh export of the live workflow | Re-export after any live edit (see §5.1). Graph = 20 nodes: auth → format → adapter → switch (4 outputs, skip is wired) → 3 live send nodes → 3 log nodes + skip/probe-failure loggers, plus the D-2 voice guard. |
| `06_provider_simulator.json` | ✅ Fresh export (dev only) | Stands in for VoiceBip/Meta while `PROVIDER_MOCK=true`. Deactivate + delete once real credentials are in. |
| `07_provider_callback.json` | ✅ Fresh export of the live workflow | `POST /webhook/provider-callback` — authenticated, idempotent provider events (see §5.3). Point VoiceBip's delivery-report / call-outcome webhook here. |
| `FLIP_LIVE_RUNBOOK.md` | ✅ Procedure | Preconditions → env → regression gate → SMS → voice → callbacks → retire simulator → smoke checklist → rollback. |
| `.env.example` | ✅ Config template | The complete, annotated n8n environment contract (mock block + live block). |

**Exports are frozen (Stage D-5).** The three JSON files above match the live graphs in the
dev instance 1:1. If a workflow is edited in the n8n UI, re-export before committing or the
repo and the running system silently diverge.

### 6.1 Hard requirements for the B and C rebuilds (from the 2026-11 system review)

The skeletons `01`–`04` were audited against the Django contract during the Phase 2.5
review. Their flaws are **not to be patched** — the skeletons get rebuilt as Workflows B
(`02`) and C (`04`) — but the rebuilds MUST resolve every one of these, verified live:

1. **Auth model.** `04` PATCHes `/appointments/{id}/status/` with `X-Webhook-Secret`,
   but that view is staff-JWT-only → every patient confirm/cancel would 401. Worse,
   a patient-facing webhook must never PATCH arbitrary appointment ids. Workflow C
   needs a **dedicated, webhook-auth'd, scoped endpoint** (e.g. "select offer N for
   request R" validated server-side), mirroring what the Telegram path already does.
   **✅ The Django half is built (C.1, 2026-11-16):** `POST /api/v1/webhooks/patient-reply/`
   takes `{phone, text, channel, provider_message_id}`, resolves the phone → open request
   itself, and returns `reply_text`. C.2 must **use it and delete the PATCH branch**; do not
   reintroduce `PATCH /appointments/{id}/status/` or a second "select" call.
2. **URL contract.** `01`–`04` append `/api/v1/...` to `DJANGO_API_BASE_URL`, while
   `05`/`07` (and `.env.example`) expect the base to already include it. Canonical:
   **`DJANGO_API_BASE_URL` includes `/api/v1`** — the rebuilds follow 05/07.
   **✅ `01` is fixed to this contract (Wave 1, 2026-11-20):** the normalizer builds
   `base + '/booking-requests/'` in code; `n8n/tests/test_intake_webhook.js` pins it.
   The shipped `02`/`03`/`04`/`08` already follow it (verified: they append
   `/webhooks/...` only, no doubling, no fallback secret).
3. **No fail-open secret fallbacks.** `01`–`04` embed `$env.DJANGO_WEBHOOK_SECRET ||
   'clinic_dev_…'` — if the env var is ever unset, the secret silently becomes a known
   string. This pattern is forbidden; 05's fail-closed pattern (`secret_not_configured`
   → refuse) is the rule.
   **✅ Gone from `01` (Wave 1, 2026-11-20):** the secret is read from `$env` once, in
   code; an unset value sends an empty header and the node fails visibly. Verified by
   the same harness. `02`–`04` were already clean on audit.
4. **Callback prefix.** `02` sends `re_request_slots_{id}`; `telegram_service` parses
   the `re_request_` prefix, producing id `slots_REQ-…` → 404. Use `re_request_{id}`
   (exactly what Django's own Telegram formatter emits).
5. **Nudge dedupe.** `SweepService.run_sweep()` returns every offer expiring within
   15 minutes with no "already nudged" marker; a 60-second cron would text the patient
   up to 15 times. Workflow B must only nudge once per offer (e.g. a `nudge_sent_at`
   marker on the BookingRequest, or Django sends the nudge itself and the sweep stays
   state-only).
6. **Logging.** Both rebuilds write InteractionLog rows through `POST /interactions/`
   exactly like 05's log nodes (same payload shape, `X-Webhook-Secret`, try/catch so
   a Django outage never kills the patient flow).
7. **Provider error text.** Both rebuilds must copy 05's canonical
   `provider-error-classification` block **verbatim** (markers
   `// >>> provider-error-classification` … `// <<< provider-error-classification`).
   n8n's failed-HTTP error object is only `{ message, name, stack }` — there is no
   `error.status`, the status exists solely as the message prefix — and the response body
   is embedded as a **JSON string literal**, so it needs two real `JSON.parse` steps.
   Never reintroduce `.replace(/\\"/g, '"')` before `JSON.parse`: it corrupts nested
   escaped quotes, the parse throws, and the raw wrapper (`404 - "{\"code\":404,…`)
   reaches reception. `n8n/tests/test_lognodes.js` asserts the block is byte-identical
   across every copy, so a drifted paste fails the harness.
8. **Patient identity on a callback is fill-only.** `POST /interactions/` accepts a callback
   that carries a phone/name, but on an existing row it may only **fill a blank**, never
   rewrite a stored value. The delivery outcome still advances, and a phone discrepancy is
   appended to `summary` once (idempotent; no numbers in the log). If a rebuild forwards
   identity fields, read the snake_case keys `normalize()` actually returns — `n.patientName`
   was `undefined` in `07` for a whole phase, so no callback ever carried a patient name to
   Django. Assert on the outgoing payload, not just the response code.
   **Inbound replies are different (C.1):** the patient-reply endpoint writes the inbound row
   itself, including the normalized phone and the request/appointment links. Workflow C must
   **not** forward identity or POST an inbound `/interactions/` row — that would duplicate the
   message and contradict the fill-only rule.

## 7. Build & test order (recommended)

1. **Reminders (A)** — validates secret, GET endpoint, one provider send, logging. Testable with Telegram-only sends before partner creds arrive.
2. **Sweeper (B)** — validates cron + sweep API + recovery. Testable end-to-end today: create a request, dispatch, wait 60 min (or temporarily set `offer_expiry_minutes` low in Clinic Settings).
3. **Response handler (C)** — testable today via the **Telegram** channel end-to-end (bot buttons already work); WhatsApp/SMS legs once partner creds land. The Django half is done (C.1): C.2 only builds the graph around `POST /webhooks/patient-reply/` and delivers `reply_text`.
4. **Dispatcher (D)** — needs partner WhatsApp template + VoiceBip key for full test; the Telegram leg works today.

**Definition of done (Phase 4):** a full journey — *form request → receptionist dispatch → WhatsApp+SMS+call received → patient replies "2" → confirmation message → interactions visible in dashboard → 24h+2h reminders → reschedule reply* — all logged in `GET /api/v1/interactions/`.
