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
| 4a | Slot lookup | Map the chosen option number → `slot_offer_id`. **You need the dispatch context**: Workflow D should save `{request_code: {option_n: slot_offer_id, patient_name, phone, service_name}}` into n8n static data (or a lightweight n8n data table) when dispatching. Lookup here. If missing → reply "options expired, reply NEW". |
| 5a | Hold call | `POST {base}/api/v1/slots/hold/` with `X-Webhook-Secret`: `{"slot_offer_id":"<uuid>","request_id":"REQ-2026-0042","action":"select_slot","response_channel":"sms"}` (serializer also accepts `patient_name`/`patient_phone` extras). |
| 6a | Branch on response | **200/201 with `appointment_code`** → send confirmation on the SAME channel: *"Confirmed! Ref: {{appointment_code}} with {{doctor_name}} on {{start_datetime}}. See you then!"* · **409 `SLOT_CONFLICT`** → *"Sorry, that time was just taken. Reply NEW for fresh times."* · offer expired → same recovery offer. |
| 4b | Re-request | `POST {base}/api/v1/booking-requests/REQ-2026-0042/re-request/` with `X-Webhook-Secret`, body `{"re_requested_by":"patient_whatsapp_button"}` → then instantly ack the patient: *"Thank you {{name}}! Our front desk is reviewing fresh times for you right now."* |
| 7 | Log | InteractionLog for the outcome (`answered` for selection, `failed`+`error_detail` for conflicts). |

**Cross-channel neutralization (double-reply defense):** the backend locks the booking row and
transitions `slots_offered → converted` on the FIRST selection. ⚠ **Gap vs spec:** the spec
promises a friendly `already_confirmed` response on a second channel, but the current backend
returns `409 SLOT_CONFLICT` in that case. Until the backend adds the explicit
`already_confirmed` response, treat **409 after a successful confirm as "no action needed"** —
check your static-data guard for that `request_code` and, if it was just confirmed, send the
"already confirmed (Ref: AP-XXXX)" message instead of "slot taken". A backend fix is tracked.

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
  "telegram_chat_id": "<or null>",
  "channel": "web" | "telegram" | "whatsapp_flow",
  "candidate_slots": [
    { "id": "<slot_offer uuid>", "doctor_name": "Dr. Bello Ibrahim",
      "start_datetime": "2026-11-10T10:00:00+01:00", "end_datetime": "...",
      "is_alternative_date": false, "expires_at": "..." },
    ...one per offered option...
  ]
}
```

⚠ **Spec gap:** the spec's richer payload (`dispatch_channel`, `voice_nudge_enabled`,
`expiry.window_minutes`, pre-formatted `date_label`/`time_label`, shortlinks) is NOT sent yet.
Either format labels in n8n (`{{$json.candidate_slots}}` → n8n Code node can build
`"Tue, 10 Nov at 10:00 AM"` with Luxon) or ask us to enrich the backend payload (small task).

| Step | Node | Detail |
|---|---|---|
| 1 | Code | Format option labels: `1️⃣ Tue, 10 Nov at 10:00 AM (Dr. Bello)` etc.; build option→slot_offer_id map; save to static data keyed by `request_id` (Workflow C reads it). |
| 2 | IF telegram | `telegram_chat_id` present → existing Telegram interactive card node (keep it). |
| 3 | WhatsApp send | Meta Cloud API — **approved template with 3 quick-reply buttons** (one per option). Template name from partner; payload params: patient name, service, option labels, expiry minutes. |
| 4 | SMS send | VoiceBip SMS: *"Cedarcare Clinic: Your consultation slots are ready. 1) … 2) … 3) … Reply 1, 2, or 3 to lock in your time. Held for 1 hr."* Sender ID `Cedarcare`. |
| 5 | Log ×2 | InteractionLog for WhatsApp + SMS (`sent`/`failed` + provider message IDs). |
| 6 | Wait | 30 seconds (spec: call is an auxiliary nudge, never the primary channel). |
| 7 | VoiceBip call | `POST https://api.voicebip.com/v1/campaigns`, `Authorization: Bearer {{$env.VOICEBIP_API_KEY}}`: `{"channel":"voice","config":{"from_number":"{{$env.VOICEBIP_FROM_NUMBER}}","call_window":{"start":"08:00","end":"19:00","timezone":"Africa/Lagos"}},"retry_policy":{"max_attempts":2,"backoff_seconds":300},"targets":[{"to_address":"{{$json.patient_phone}}","params":{"name":"{{$json.patient_name}}"}}]}` — universal audio prompt announces options and says to check WhatsApp/SMS. |
| 8 | Log | InteractionLog: `provider:"voicebip"`, `channel:"voice"`, status per call result (`answered`/`no_answer`/`failed`), `external_ref` = VoiceBip call ID, `call_duration_seconds` if reported. |
| 9 | Respond to webhook | Return `{"status":"accepted"}` immediately (Django is NOT waiting, but keep the node tidy). |

---

## 6. Workflow E — Lead Ads → Booking Request (ads intake, the 3rd channel)

**Purpose:** Facebook/Instagram **Lead Ads** instant forms become booking requests in the same receptionist queue. Google Ads needs NO workflow (clicks land on the website form) — just capture `utm_source=google` into `lead_source` on the site (small frontend task).

**Backend support (shipped):** `POST /api/v1/booking-requests/` now accepts
`channel: "facebook_lead_ads" | "google_ads"` and an optional `lead_source` string
(e.g. `"Meta Lead Form — Whitening Campaign"`) — attribution shown on the receptionist's queue card.

| Step | Node | Detail |
|---|---|---|
| Trigger | Meta Lead Ads node (or webhook) | Connect your Meta page's lead-gen form; Meta delivers: name, phone, email, form/campaign name |
| 1 | Normalize | E.164 the phone (`+234...`); trim name |
| 2 | Create request | `POST {base}/api/v1/booking-requests/` (public, rate-limited 5/10min/IP — Meta sends few, fine): `{"patient_name": "...", "patient_phone": "+234...", "service": "<from ad form>", "channel": "facebook_lead_ads", "lead_source": "Meta Lead Form — <campaign>", "preferred_dates": []}` → `201` with `request_id` (REQ-…). Card appears in the queue instantly (SSE). |
| 3 | Instant greeting | `POST https://graph.facebook.com/v18.0/{{$env.WHATSAPP_PHONE_NUMBER_ID}}/messages` — warm welcome: *"Thank you {{name}}! Cedarcare has received your interest in {{service}}. Our front desk will review and send you available times shortly."* |
| 4 | Log | InteractionLog: `direction:"inbound"`, `provider:"meta_whatsapp"` (the lead capture) + one for the greeting send. |

**Downstream is unchanged:** the ad lead enters Step 3 (Receptionist Review) like every other request — no special handling.

## 7. Existing JSON skeletons (what's already in `n8n/`)

| File | State | Your job |
|---|---|---|
| `01_intake_webhook.json` | Intake notifications | Minor — intake lands in Django directly; n8n intake webhook is mostly for the dashboard chime |
| `02_hold_and_offer_expiry_cron.json` | Sweeper skeleton | Per §3 — add nudge branch + recovery sends + logging |
| `03_reminder_flows.json` | Reminder skeleton | Per §2 — add SMS leg + logging + dedupe |
| `04_patient_response_handler.json` | Response skeleton | Per §4 — add SMS "1/2/3" replies, re-request, channel neutralization, logging |
| `05_slot_offer_dispatcher.json` | Has Telegram path | Per §5 — add WhatsApp + SMS + 30s wait + VoiceBip call + static-data map + logging |

## 8. Build & test order (recommended)

1. **Reminders (A)** — validates secret, GET endpoint, one provider send, logging. Testable with Telegram-only sends before partner creds arrive.
2. **Sweeper (B)** — validates cron + sweep API + recovery. Testable end-to-end today: create a request, dispatch, wait 60 min (or temporarily set `offer_expiry_minutes` low in Clinic Settings).
3. **Response handler (C)** — testable today via the **Telegram** channel end-to-end (bot buttons already work); WhatsApp/SMS legs once partner creds land.
4. **Dispatcher (D)** — needs partner WhatsApp template + VoiceBip key for full test; the Telegram leg works today.
5. **Lead Ads (E)** — needs your Meta page + a lead-gen form; fully testable with a test lead submission (WhatsApp greeting needs the access token).

**Definition of done (Phase 4):** a full journey — *form request → receptionist dispatch → WhatsApp+SMS+call received → patient replies "2" → confirmation message → interactions visible in dashboard → 24h+2h reminders → reschedule reply* — all logged in `GET /api/v1/interactions/`.
