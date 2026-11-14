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
| 6 | VoiceBip **delivery-report / call-outcome webhook** format + how to register it | callback receiver |
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

### 4c. WhatsApp (only if the template is approved)

Same as SMS. Without an approved template the send fails and lands in Needs Attention —
which is honest, but do not enable the WhatsApp checkbox for patients until it is approved.

---

## 5. Register the provider callback

Give the partner:

```
POST https://n8n.yourclinic.com/webhook/provider-callback?token=<PROVIDER_CALLBACK_TOKEN>
Content-Type: application/json
```

The receiver is tolerant of field names (`call_id`, `message_id`, `external_ref`,
`status`, `event`, `duration`, `recording_url`, `to`, `request_code`). Send them
`n8n.md` §5.10 for the exact contract and the status vocabulary.

### Callback acceptance test (from outside the network)

```powershell
curl.exe -s -X POST -H "Content-Type: application/json" `
  -d '{\"status\":\"delivered\",\"message_id\":\"<real external_ref>\"}' `
  "https://n8n.yourclinic.com/webhook/provider-callback?token=<PROVIDER_CALLBACK_TOKEN>"
```

Expected: `200 {"ok":true,"accepted":true,...}` and the row advances. Then send a late
`sent` for the same ref — expected: `200` but the stored status **does not go backwards**.

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
| 7 | Callback without token | `401` |
| 8 | Patient already holds a slot before the voice leg | no call placed (30s guard) |
| 9 | Voice dispatch at 20:00 Lagos | skipped (`outside_call_window`) |
| 10 | Repeat dispatch within 10 min | `duplicate_dispatch` for every channel |
| 11 | `POST /webhook/dispatch-offers` without `X-Webhook-Secret` | `401`, no message sent |

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
  restarting n8n and updating the partner's webhook URL. No deploy required.
- `DJANGO_WEBHOOK_SECRET` protects the **inbound** dispatch webhook too. Rotating it means
  updating both sides (backend `.env` / `ClinicSetting.webhook_secret` **and** n8n's env)
  before restarting, or dispatch is refused with `401` until they match again.
- The callback receiver compares the token exactly; it does not log it.
- Exports in `n8n/*.json` must never contain secrets — configuration lives only in env.
- n8n holds provider keys and the Django webhook secret. It must **never** hold
  `DATABASE_URL`, Django `SECRET_KEY`, or any credential that can read the database.
- Recordings/transcripts are patient data: consent line in the agent script, and agree a
  retention period before storing `recording_url` / `transcript` in `InteractionLog`.
