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
DJANGO_API_BASE_URL=https://your-clinic-backend.up.railway.app
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

Full read API (for debugging what you logged): `GET /api/v1/interactions/?patient_phone=+234...&limit=50`
(staff JWT, not secret — use the dashboard instead).

---

## 2. Workflow A — `03_reminder_flows.json` (build FIRST — simplest, validates your setup)

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

**Purpose:** inbound WhatsApp/SMS patient replies → slot selection, re-request, cross-channel neutralization.

| Step | Node | Detail |
|---|---|---|
| Triggers | 2 webhooks | `/webhook/whatsapp-inbound` (Meta status/callback payload) and `/webhook/sms-inbound` (VoiceBip SMS delivery). Both must respond < 5s (Meta times out retries). |
| 1 | Normalize | Extract `patient_phone`, `message text/button payload`, `provider message id` → E.164 the phone. |
| 2 | Log inbound | InteractionLog: `direction:"inbound"`, `provider:"meta_whatsapp"|"voicebip"`, raw text in `summary`. |
| 3 | Router (Switch) | a) `1`/`2`/`3` or button tap → **slot selection** · b) `NEW` / "See New Times" button → **re-request** · c) anything else → ignore (or future features). |
| 4a | ~~Slot lookup~~ **NOT NEEDED** | **No static-data map, no Workflow-D dependency.** The backend resolves the patient's number itself — C sends `option_number` + `request_id` in ONE call (below). Workflow D and Workflow C are fully independent; you can rebuild/restart either without breaking the other. |
| 5a | Hold call | `POST {base}/api/v1/slots/hold/` with `X-Webhook-Secret`: `{"request_id":"REQ-2026-0042","option_number":2,"response_channel":"sms"}` — **ONE call, zero extra latency.** The backend maps reply `2` to the 2nd offer in ORIGINAL dispatch order (never renumbered by prior selections), validates expiry/selection inside its locked transaction, and creates the 15-min hold. |
| 6a | Branch on response | **200 with `appointment_code` + `status:"held"`** → send confirmation on the SAME channel: *"Confirmed! Ref: {{appointment_code}} with {{doctor_name}} on {{start_datetime}}. See you then!"* (note: the slot is a 15-min hold until the front desk confirms — treat the code as the patient's reference immediately) · **200 with `error:"ALREADY_CONFIRMED"`** → the patient already picked (other channel) — send *"You're already confirmed! Ref: {{appointment_code}}"*, log `answered`, done · **400 containing "expired"** → *"Sorry, those times expired. Reply NEW for fresh times."* · **409 `SLOT_CONFLICT`** → *"Sorry, that time was just taken. Reply NEW for fresh times."* |
| 4b | Re-request | `POST {base}/api/v1/booking-requests/REQ-2026-0042/re-request/` with `X-Webhook-Secret`, body `{"re_requested_by":"patient_whatsapp_button"}` → then instantly ack the patient: *"Thank you {{name}}! Our front desk is reviewing fresh times for you right now."* |
| 7 | Log | InteractionLog for the outcome (`answered` for selection, `failed`+`error_detail` for conflicts). |

**Cross-channel neutralization (double-reply defense):** SOLVED in the backend (2026-11-13).
Any second selection for a request that already has an active hold or confirmation returns
**200 `ALREADY_CONFIRMED`** with the existing `appointment_code` — n8n sends the friendly
"already confirmed (Ref: AP-XXXX)" message. The number→offer mapping lives in Django, so a
stale or lost n8n static-data map can never make a live patient reply fail. Old workaround
(treat 409-after-confirm as "no action") is obsolete — keep it only as a fallback branch.

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

### 5.1 Current build state (Stage D-1 + D-2 + D-3, 2026-11-14)

Workflow ID `GtpeOwfnG8yYyAxq` (`05_Slot_Offer_Dispatcher_Bridge`) — **active**, 14 nodes,
`valid: true` (0 errors). Graph:

```
Dispatch Offers Webhook from Django        (responseMode: onReceived — answers instantly)
   └─ Format Offers & Telegram Buttons      (Task 3.5 code: labels, options, sms_body, want_*)
        └─ Provider Config & Adapter        (Code, runOnceForAllItems — ONE item per active channel)
             └─ Route Provider Request      (Switch: whatsapp | sms | voice | skip)
                  ├─ whatsapp → Send WhatsApp Interactive Message → Log WhatsApp Interaction
                  ├─ sms      → Send SMS (VoiceBip)               → Log SMS Interaction
                  ├─ voice    → Wait 30s Before Voice Nudge
                  │              └─ Check Patient Replied (dispatch-status)  [GET, error → stop]
                  │                   └─ Merge Voice Guard  (reattach payload + voice_guard)
                  │                        └─ IF Voice Still Needed
                  │                             ├─ true  → Send Voice Call (VoiceBip) → Log Voice Interaction
                  │                             └─ false → (stop, no call)
                  └─ skip     → (empty, intentional no-op)
```

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
| `provider_request.skip_reason` | `duplicate_dispatch` \| `outside_call_window` \| `provider_not_configured` \| `no_active_channel` \| `patient_already_engaged` \| `voice_payload_missing` |
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

### 5.2 Remaining D steps

| Step | Node | Detail |
|---|---|---|
| 1 | Code | ✅ Done — `Format Offers & Telegram Buttons` builds labels, `options[]`, `options_text`, `sms_body`, `whatsapp_params`, `want_*`. |
| 2 | Adapter + routing | ✅ Done (D-1) — `Provider Config & Adapter` (one item per active channel, mock, dedupe, quiet hours, `configured` gate) → `Route Provider Request` switch. The three `IF Want *` nodes were removed (see §5.1). |
| 3 | WhatsApp send | ✅ Done (D-3) — enabled, driven by `provider_request`; against the simulator today, Meta Cloud API template once creds land. |
| 4 | SMS send | ✅ Done (D-3) — enabled; VoiceBip SMS body already composed as `sms_body`; sender ID `Cedarcare`. |
| 5 | Log ×3 | ✅ Done (D-3) — one Code node per branch, `POST {DJANGO_API_BASE_URL}/interactions/`, `external_ref` = provider id, failures carry a plain-language `error_detail`. |
| 6 | Voice guard | ✅ Done (D-2) — `Wait 30s` → `GET dispatch-status/` → `Merge Voice Guard` → `IF Voice Still Needed`; skip + fail-closed on probe error. |
| 7 | VoiceBip call | ✅ Done (D-3) — enabled, `POST {VOICEBIP_API_URL}/voice/calls`, `Authorization: Bearer {{$env.VOICEBIP_API_KEY}}`, `agent_id`, `caller_id`; nudge only, no DTMF. |
| 8 | Log voice | ✅ Done (D-3) — `provider:"voicebip"`, `channel:"voice"`, `status: sent|failed`; `answered`/`no_answer` arrive with the D-4 callback. |
| 9 | Callback receiver | ✅ Done (D-4) — `07_Provider_Callback_Receiver` (`rmqf5Z5K3EfapVGo`, 10 nodes) receives VoiceBip delivery-report / call-outcome webhooks and POSTs them to `interactions/`. See §5.3. |
| 10 | Respond | ✅ Not needed — webhook responds immediately. |

### 5.3 Provider callback receiver (Stage D-4)

Workflow `07_Provider_Callback_Receiver` (`rmqf5Z5K3EfapVGo`) — **active**, 10 nodes,
`valid: true` (0 errors, 0 warnings). Webhook: `POST /webhook/provider-callback`,
`responseMode: responseNode` (the caller gets a real status code, unlike the dispatcher).

```
Provider Callback Webhook
   └─ Verify & Normalize Provider Event     (Code: auth + vocabulary + payload)
        └─ IF Authorized
             ├─ true  → IF Should Forward
             │            ├─ true  → Post Interaction Update  (POST {DJANGO_API_BASE_URL}/interactions/)
             │            │            ├─ success → Respond Accepted           200
             │            │            └─ error   → Classify Update Failure
             │            │                         ├─ 4xx → Respond Retry 200 (rejected: true)
             │            │                         └─ else → Respond Retry 500 (retry: true)
             │            └─ false → Respond Ignored                            200
             └─ false → Respond Unauthorized                                    401
```

**Auth — fail closed.** A shared token (`PROVIDER_CALLBACK_TOKEN`) must appear as
`?token=` / `?access_token=` or in `X-Provider-Token` / `X-Callback-Token` /
`X-Webhook-Token`. If the env var is **unset**, every callback is rejected 401
(`receiver_not_configured`) — an unconfigured receiver never accepts traffic.

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

Channel is taken from `channel` / `medium`, else inferred from the `external_ref`
(`mock-voice-…`), the event name (`sms.delivered`), or the status (`answered` →
voice). Provider: `voicebip` for voice/SMS, `meta_whatsapp` for WhatsApp,
`telegram` for Telegram.

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

---

## 6. Existing JSON skeletons (what's already in `n8n/`)

| File | State | Your job |
|---|---|---|
| `01_intake_webhook.json` | Intake notifications | Minor — intake lands in Django directly; n8n intake webhook is mostly for the dashboard chime |
| `02_hold_and_offer_expiry_cron.json` | Sweeper skeleton | Per §3 — add nudge branch + recovery sends + logging |
| `03_reminder_flows.json` | Reminder skeleton | Per §2 — add SMS leg + logging + dedupe |
| `04_patient_response_handler.json` | Response skeleton | Per §4 — add SMS "1/2/3" replies, re-request, channel neutralization, logging |
| `05_slot_offer_dispatcher.json` | ✅ Fresh export of the live workflow | Re-export after any live edit (see §5.1). Graph = 14 nodes: adapter → switch → 3 live send nodes → 3 log nodes, plus the D-2 voice guard. |
| `06_provider_simulator.json` | ✅ Fresh export (dev only) | Stands in for VoiceBip/Meta while `PROVIDER_MOCK=true`. Deactivate + delete once real credentials are in. |
| `07_provider_callback.json` | ✅ Fresh export of the live workflow | `POST /webhook/provider-callback` — authenticated, idempotent provider events (see §5.3). Point VoiceBip's delivery-report / call-outcome webhook here. |

## 7. Build & test order (recommended)

1. **Reminders (A)** — validates secret, GET endpoint, one provider send, logging. Testable with Telegram-only sends before partner creds arrive.
2. **Sweeper (B)** — validates cron + sweep API + recovery. Testable end-to-end today: create a request, dispatch, wait 60 min (or temporarily set `offer_expiry_minutes` low in Clinic Settings).
3. **Response handler (C)** — testable today via the **Telegram** channel end-to-end (bot buttons already work); WhatsApp/SMS legs once partner creds land.
4. **Dispatcher (D)** — needs partner WhatsApp template + VoiceBip key for full test; the Telegram leg works today.

**Definition of done (Phase 4):** a full journey — *form request → receptionist dispatch → WhatsApp+SMS+call received → patient replies "2" → confirmation message → interactions visible in dashboard → 24h+2h reminders → reschedule reply* — all logged in `GET /api/v1/interactions/`.
