# Flip-Live Runbook — Workflow D (Slot Offer Dispatch + Provider Callbacks)

**Stage D-5.** Everything in Workflow D is built and verified against the provider
simulator. This runbook is the complete procedure for switching to real VoiceBip /
WhatsApp traffic. It is written so that the flip is **configuration only** — no node
edits, no graph rebuild, no Django deploy.

> Rule that never changes: **Django is the source of truth. n8n never receives database
> credentials.** n8n talks to Django only over the REST API with `X-Webhook-Secret`.

---

## 0. Preconditions (do not start without these)

| # | Item | Used by |
|---|---|---|
| 1 | `VOICEBIP_API_URL` (base URL for voice + SMS) | adapter |
| 2 | `VOICEBIP_API_KEY` | adapter |
| 3 | `VOICEBIP_VOICE_AGENT_ID` (outbound agent) | voice leg |
| 4 | `VOICEBIP_CALLER_ID` (DID shown to the patient) | voice leg |
| 5 | `VOICEBIP_SMS_SENDER_ID` (default `Cedarcare`) | SMS leg |
| 6 | VoiceBip **delivery-report / call-outcome webhook** format + how to register it, **and whether it can send a custom header** (the token is a header; a URL-only dashboard needs `PROVIDER_CALLBACK_ALLOW_QUERY_TOKEN=true`) | callback receiver |
| 7 | A **sandbox/test phone number** you control | live test |
| 8 | Public **HTTPS** URL for n8n (Railway / reverse proxy) | partner webhook |
| 9 | `PROVIDER_CALLBACK_TOKEN` — a long random string you generate | callback auth |
| 10 | (WhatsApp only) approved template + `WHATSAPP_PHONE_NUMBER_ID` / `WHATSAPP_ACCESS_TOKEN` | WhatsApp leg |

If an item is missing, keep `PROVIDER_MOCK=true`. A half-configured live run routes the
missing channel to `skip` (`provider_not_configured`) and logs nothing — which looks like
silence, not an error.

---

## 1. Freeze the artifacts

The JSON exports in `n8n/` are canonical. Before touching configuration:

```powershell
git status --short          # expect: clean
git log -1 --oneline        # expect the D-5 freeze commit
```

If you edited a workflow in the n8n UI, re-export it first (see `N8N_BUILD_SHEET.md` §6)
and commit the diff. Do not flip live with an export that does not match the live graph.

---

## 2. Fill the environment

Copy `n8n/.env.example` to your n8n host's environment (Railway variables, Docker
`env_file`, or the shell that starts n8n) and fill:

```env
DJANGO_API_BASE_URL=https://api.yourclinic.com/api/v1
DJANGO_WEBHOOK_SECRET=<same value as WEBHOOK_SECRET in backend/.env>

PROVIDER_MOCK=true                # keep true for step 3
PROVIDER_MOCK_FAIL=false
PROVIDER_SIMULATOR_URL=http://127.0.0.1:5678/webhook/provider-sim

VOICEBIP_API_URL=<partner base URL>
VOICEBIP_API_KEY=<partner key>
VOICEBIP_VOICE_AGENT_ID=<agent id>
VOICEBIP_CALLER_ID=<caller id>
VOICEBIP_SMS_SENDER_ID=Cedarcare

PROVIDER_CALLBACK_TOKEN=<long random string>
# Leave unset unless the partner confirms it can only paste a callback URL
# (no custom header support). Only the literal 'true' opens it.
PROVIDER_CALLBACK_ALLOW_QUERY_TOKEN=false

# WhatsApp is dormant until these are filled; Telegram ships first.
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_TEMPLATE_NAME=
WHATSAPP_TEMPLATE_LANG=en_US
WHATSAPP_VERIFY_TOKEN=<the string you type into Meta's Verify token box>

N8N_BLOCK_ENV_ACCESS_IN_NODE=false
```

**Restart n8n.** Environment variables are read once at process start; without a restart
the old values stay live and the flip silently does nothing.

### Verify the restart picked the values up

The callback receiver reports whether a token is configured, without revealing it:

```powershell
curl.exe -s -X POST -H "Content-Type: application/json" -d "{}" `
  "https://n8n.yourclinic.com/webhook/provider-callback"
```

| Response | Meaning |
|---|---|
| `401` with `reason:"receiver_not_configured"` | `PROVIDER_CALLBACK_TOKEN` is **empty** — fix it |
| `401` with `reason:"invalid_callback_token"` | Token **is set** and the request simply had none — correct |

### Verify the dispatch secret (the inbound direction)

`DJANGO_WEBHOOK_SECRET` is used in **both** directions: n8n sends it to Django, and
`/webhook/dispatch-offers` demands it from Django. If only one side was updated, every
dispatch is silently refused with a `401` that Django logs as a failed webhook.

```powershell
# 1. Missing header -> must be refused before any message is sent
curl.exe -s -X POST -H "Content-Type: application/json" -d "{}" `
  "https://n8n.yourclinic.com/webhook/dispatch-offers"
# expect: 401 {"ok":false,"error":"unauthorized","reason":"bad_secret"}

# 2. Correct header -> accepted (use a throwaway request id; this WILL send)
curl.exe -s -X POST -H "Content-Type: application/json" `
  -H "X-Webhook-Secret: <DJANGO_WEBHOOK_SECRET>" `
  -d "<a real dispatch payload>" `
  "https://n8n.yourclinic.com/webhook/dispatch-offers"
# expect: 200 {"ok":true,"accepted":true,...}
```

`reason:"secret_not_configured"` means `DJANGO_WEBHOOK_SECRET` is empty in n8n — the
receiver fails closed, so nothing is sent. Fix the env and restart.

---

## 3. Regression gate (still in mock mode)

Before flipping, prove the graph is intact after the env change:

1. Dispatch a real request from the dashboard to a **test request** with SMS + voice ticked.
2. Expected: one `InteractionLog` row per channel, `status: sent`, `external_ref:
   mock-<channel>-<request_code>`.

If this fails, stop. The problem is configuration (Django URL / webhook secret), not the
provider.

---

## 4. Flip to live

```env
PROVIDER_MOCK=false
```

Restart n8n. `PROVIDER_MOCK_FAIL` is irrelevant once mock is off — leave it `false`.

### 4a. SMS first

Send one dispatch to your **sandbox number** with only SMS ticked.

| Check | Expected |
|---|---|
| n8n execution | `Send SMS (VoiceBip)` → `success` |
| Django `GET /api/v1/interactions/?request_code=...` | row `channel: sms`, `status: sent`, real `external_ref` |
| Phone | message actually received |
| Dashboard | request shows in the queue with the interaction in the dossier timeline |

If it fails: the row is `status: failed` with the provider's sentence in `error_detail`,
and the request appears in **Needs Attention**. That is the correct behaviour — read the
`error_detail`, fix the credential, retry.

### 4b. Voice next

Send one dispatch with only voice ticked, to the sandbox number, **between 08:00 and
19:00 Africa/Lagos** (outside that window the adapter routes it to `skip` /
`outside_call_window` by design).

Expected sequence: 30s wait → `dispatch-status/` probe → call placed → `Log Voice
Interaction` row `status: sent` with the provider call id.

Then wait for the partner's callback and confirm the same row advances to `answered` or
`no_answer` (not a new row — `external_ref` upserts).

### 4c. WhatsApp (only once the template is approved)

Telegram is the launch channel; this step is what turns the dormant WhatsApp leg on. In
order:

1. **Create the template** in WhatsApp Manager (utility category). It must match the
   parameter order in `WHATSAPP_TEMPLATE_PARAM_ORDER`
   (default `patient_name,service_name,option_1,option_2,option_3,expiry` — six `{{n}}`
   placeholders) and, if `WHATSAPP_TEMPLATE_QUICK_REPLIES=true`, three quick-reply
   buttons. Set `WHATSAPP_TEMPLATE_NAME` / `WHATSAPP_TEMPLATE_LANG` to the approved
   values — they must match **exactly**, or Meta answers `132001`/`132000`.
2. **Register the callback URL** (§5 below) and type the same string as
   `WHATSAPP_VERIFY_TOKEN` into Meta's *Verify token* box. Meta calls the GET handshake
   immediately; a `403` means the two values differ or n8n was not restarted.
3. **Subscribe the app** to the `messages` field on the WABA.
4. Set `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_ACCESS_TOKEN`, restart n8n, then send one
   throwaway request with `dispatch_channels: ["whatsapp"]`.

Do **not** set `WHATSAPP_TEMPLATE_MODE=text` for offers: free-form business-initiated text
is rejected with `131047` outside the 24-hour customer-service window.

If the template name is still empty the leg is safe: it routes to
`skip / whatsapp_template_not_configured` and sends nothing.

---

## 5. Register the provider callback

Give the partner:

```
POST https://n8n.yourclinic.com/webhook/provider-callback
Content-Type: application/json
X-Provider-Token: <PROVIDER_CALLBACK_TOKEN>
```

The token goes in a **header**, not the URL. n8n records the webhook's query string in
every execution, so a `?token=` callback URL writes the secret into the log of every
callback. (`X-Callback-Token` and `X-Webhook-Token` are accepted aliases.) **Ask the
partner whether their dashboard can set a custom header.** If it can only paste a URL, set
`PROVIDER_CALLBACK_ALLOW_QUERY_TOKEN=true` and restart — that is the documented escape
hatch; without it a `?token=` callback on a VoiceBip-shaped body is refused `401`.

For **Meta**, register this URL in the app's WhatsApp → Configuration → Webhook and
enter `WHATSAPP_VERIFY_TOKEN` as the verify token — Meta is the one caller that keeps the
query token:

```
https://n8n.yourclinic.com/webhook/provider-callback?token=<PROVIDER_CALLBACK_TOKEN>
```

The receiver answers Meta's `GET ?hub.mode=subscribe&hub.challenge=…` handshake
automatically.

> **No HMAC check.** Meta signs POSTs with `X-Hub-Signature-256` over the raw body, but
> n8n's webhook node parses JSON before the workflow runs and exposes no raw bytes
> (`rawBody: true` still returns an object, `binaryData` returns nothing — verified). The
> query-string token is therefore the authentication for Meta, and a Meta-shaped envelope
> (`entry[]`) is the only body that may carry it by default. Treat
> `PROVIDER_CALLBACK_TOKEN` as a production secret and rotate it in both places together.

The receiver is tolerant of field names (`call_id`, `message_id`, `external_ref`,
`status`, `event`, `duration`, `recording_url`, `to`, `request_code`) and understands
Meta's `entry[].changes[].value.statuses[]` envelope natively (a batch carrying several
statuses is processed in full). Send them `n8n.md` §5.10 for the exact contract and the
status vocabulary.

### Callback acceptance test (from outside the network)

```powershell
curl.exe -s -X POST -H "Content-Type: application/json" `
  -H "X-Provider-Token: <PROVIDER_CALLBACK_TOKEN>" `
  -d '{\"status\":\"delivered\",\"message_id\":\"<real external_ref>\"}' `
  "https://n8n.yourclinic.com/webhook/provider-callback"
```

Expected: `200 {"ok":true,"accepted":true,...}` and the row advances. Then send a late
`sent` for the same ref — expected: `200` but the stored status **does not go backwards**.

Two other `200` answers are not failures:

| Response | Meaning |
|---|---|
| `{"ok":true,"ignored":true,"reason":"unknown_status"}` | the provider's status word is not in `STATUS_ALIASES` — add it from the partner contract |
| `{"ok":true,"ignored":true,"reason":"unknown_channel"}` | the callback named a channel this receiver cannot map (`email`, `push`, …). Nothing was written, by design — a row here would be invented data. Check the payload against `CHANNEL_ALIASES`; a genuinely new spelling is one table entry, not a code change |

Both are visible in the n8n execution and absent from the dashboard feed on purpose.

**Identity is fill-only.** A callback that carries a *different* number than the one already
on the row still returns `200 accepted` and still advances the status — before you assume the
callback "failed", open the row: the stored number is kept and its summary ends with *"Phone
on this callback did not match the number on file, so the number on file was kept."* That is
the desired behaviour (a sandbox call, or a provider echoing its own DID, must not reattribute
a patient), so fix the payload, not the receiver. A callback that carries no name never
blanks a stored one.

---

## 6. Retire the simulator

Once SMS, voice and callbacks are green:

1. In n8n, **deactivate** `06_Provider_Simulator`.
2. Delete it (it is a dev-only workflow).
3. Remove `PROVIDER_SIMULATOR_URL` / `PROVIDER_MOCK_FAIL` from the environment (optional).
4. Keep `n8n/06_provider_simulator.json` in the repo — it is how the team re-tests without
   spending provider credit.

---

## 7. Smoke checklist

| # | Check | Expected |
|---|---|---|
| 1 | Dispatch with all channels to sandbox | 3 rows, all `sent` |
| 2 | SMS delivered | row → `delivered` via callback |
| 3 | Voice call answered | row → `answered` (+ duration, recording URL) |
| 4 | Voice call unanswered | row → `no_answer`, appears in Needs Attention |
| 5 | Bad provider key | row `failed` with readable `error_detail`, Needs Attention |
| 6 | Late/duplicate callback | `200`, status never downgraded |
| 7 | Callback with no token, and a `?token=` on a non-Meta body | `401` both times; only the header (or a Meta envelope) authenticates |
| 8 | Patient already holds a slot before the voice leg | no call placed (30s guard) |
| 9 | Voice dispatch at 20:00 Lagos | skipped (`outside_call_window`) **+ a `queued` "Held back" row in the interactions feed** |
| 10 | Repeat dispatch within 10 min | `duplicate_dispatch` for every channel **that actually sent** (no extra rows). A repeat of a *skipped* leg is expected to send — the window is only stamped by real sends (3.4) |
| 11 | `POST /webhook/dispatch-offers` without `X-Webhook-Secret` | `401`, no message sent |
| 12 | Dispatch while a provider is unconfigured | `queued` row with `error_detail: provider_not_configured` — reception sees it without digging through n8n |
| 13 | Django briefly down when the voice guard probes | `failed` voice row "Status probe failed — voice call suppressed (fail closed)" in Needs Attention; no call placed |

**Reading `queued` rows (Phase 2):** a `queued` interaction row means *"held back, not
attempted"* — the receptionist asked for the channel, the system refused to fire it, and
the row says why in plain language (`summary`) plus a machine code (`error_detail`:
`outside_call_window` / `provider_not_configured` / `whatsapp_template_not_configured` /
`missing_phone` / `no_slots`). They are deliberately **not** failures: nothing was sent,
nothing was billed. A later real send for the same channel creates its own row, so the
history stays honest ("first attempt held, second sent"). A held-back leg also does **not**
consume the 10-minute dedupe window (Phase 3 / 3.4), so after fixing the cause — adding a
slot, pasting the provider credentials, adding a phone number — the very next dispatch
sends. If it answers `duplicate_dispatch` instead, a previous attempt really did go out.

---

## 8. Rollback

Any single step can be undone by configuration:

| Problem | Action |
|---|---|
| Provider misbehaving / wrong key | `PROVIDER_MOCK=true` + restart → traffic returns to the simulator, no code change |
| Callback flood / bad partner format | Clear `PROVIDER_CALLBACK_TOKEN` + restart → every callback gets `401` (fail closed) |
| Django rejects every callback (`400`) | Fix the vocabulary table in `Verify & Normalize Provider Event` — do **not** disable auth |
| WhatsApp template rejected | Untick WhatsApp in the dashboard; SMS/voice keep working |

Offers, holds and appointments are **never** affected by a provider rollback: dispatch
already happened in Django, and interactions are additive log rows.

---

## 9. Security notes

- `PROVIDER_CALLBACK_TOKEN` must be long and random; rotate it by changing the env var,
  restarting n8n and updating the partner's configured header. No deploy required.
- The token belongs in a **header**. A query token is only honoured on a Meta envelope or
  with `PROVIDER_CALLBACK_ALLOW_QUERY_TOKEN=true`, and every use of it puts the secret in
  that execution's log.
- `DJANGO_WEBHOOK_SECRET` protects the **inbound** dispatch webhook too. Rotating it means
  updating both sides (backend `.env` / `ClinicSetting.webhook_secret` **and** n8n's env)
  before restarting, or dispatch is refused with `401` until they match again.
- The callback receiver compares the token exactly; it does not log it.
- Exports in `n8n/*.json` must never contain secrets — configuration lives only in env.
- n8n holds provider keys and the Django webhook secret. It must **never** hold
  `DATABASE_URL`, Django `SECRET_KEY`, or any credential that can read the database.
- Recordings/transcripts are patient data: consent line in the agent script, and agree a
  retention period before storing `recording_url` / `transcript` in `InteractionLog`.
