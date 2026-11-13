# MASTER_CONTEXT.md — AI Handover & Project Memory (Single Source of Truth)

> **READ ME FIRST (mandatory for every AI / developer entering this project).**
> This file is the project's long-term memory. Read it fully before touching any code.
> **Standing rule:** after every completed task, decision, or architecture change — update this file
> (and `ROADMAP_PARTNER_READINESS.md`) immediately. Any AI inheriting this project must continue this
> practice so the next one can resume exactly where we stopped.
> Last updated: 2026-11-12 (OpenCode session — Phase 1 complete + Phase 2 FULLY COMPLETED (2.1 InteractionLog, 2.2 async dispatch); next: Phase 3 frontend tasks).

---

## 1. What We Are Building

**Product:** A Receptionist-Approved Clinic Booking System for **Cedarcare Specialist Clinic** (Wuse 2, Abuja, Nigeria) — a human-in-the-loop booking assistant.

- Patients request appointments (web form / WhatsApp / Telegram / later voice).
- The system calculates valid slots using real clinic rules (doctor shifts, service durations,
  sanitization buffers, load balancing, emergency reserves, burnout caps).
- **Nothing is offered to a patient until a receptionist reviews and approves it.**
- Clinic staff never touch n8n, databases, or integration plumbing — the dashboard is their whole world.

**Target Architecture — "Hybrid Website AI Operating System"** (partner-authored spec, saved at
`plans/HYBRID_AI_OPERATING_SYSTEM_SPEC.md`): the existing clinic dashboard is extended into the
website/database half of a two-sided system where a **Dispatcher (n8n)** orchestrates AI agents and
external providers (VoiceBip voice, WhatsApp, SMS, Meta, etc.).

### Locked Architecture Decisions (agreed with partner — do not revisit without user)

| Decision | Locked Value |
|---|---|
| Integration depth | **Type 3 — Two-Way Synchronization** (commands/events both directions) |
| Dispatcher → Website access | **Option B — Secure Backend API only** (Dispatcher NEVER gets DB credentials) |
| Dashboard update strategy | **API operations + Realtime SSE + Scheduled reconciliation (60s sweeper)** |
| Source of truth | **Website (Django) database** — n8n and frontend are transport/presentation only |
| Booking consistency | Backend must validate + atomically lock the slot **before** any agent tells a patient "confirmed" |
| Provider flexibility | Provider-agnostic; n8n normalizes VoiceBip/WhatsApp/SMS/Meta into clean `/api/v1/` calls |
| Reference implementation | This existing Cedarcare clinic dashboard |

### Division of Ownership (current agreement)

- **User's side (us):** Clinic dashboard, Django backend, database, availability/concurrency engine —
  and **the n8n workflows themselves** (user decided to build n8n in-house).
- **Partner's side:** Telephony & platform assets ONLY — VoiceBip account/billing + NCC-licensed
  **+234 DID**, Meta Business verification + WhatsApp Cloud API credentials, and supplying API keys /
  access tokens / approved message templates to us.
- Both sides jointly own the API contract; neither changes shared endpoints/formats without informing the other.

---

## 2. Current Verified State of the Codebase (as of this file's date)

### What is DONE, tested, and live (do not rebuild)

- **Backend:** Django 5.2 + DRF under `backend/`, app `appointments/`, 11 relational models,
  40+ versioned REST endpoints under `/api/v1/` (see `API_REFERENCE.md`).
  - Deterministic availability engine (`appointments/services/availability.py`)
  - Atomic hold engine with `select_for_update()` (`hold_service.py`) — zero double-booking, race-tested
  - Doctor sick-leave disruption + colleague reassignment (`disruption_service.py`)
  - 60s expiry sweeper (`sweep_service.py` + `manage.py run_expiry_sweep`), triggered by n8n cron
  - SSE realtime bus (`sse_bus.py`, `views_realtime.py`) — sub-50ms dashboard updates
  - Two-role auth: `receptionist` + `clinic_admin`; **doctors have no dashboard login** (403 by design)
  - JWT (HttpOnly cookie + Bearer) + 4-digit desk PIN with strike-based lockout
- **Frontend:** React 19 + Vite + Zustand + Vanilla CSS under `frontend/`, permanently live-mode
  (`isDemoMode: false` locked), full `apiService.js` bridge, Playwright E2E suite in `frontend/e2e/`.
- **Tests:** 83/83 Django tests passing; 8/8 Playwright E2E passing; production build 0 errors (per PROGRESS.md).
- **Deploy:** Backend on Railway/Render/Docker (Coolify turnkey setup in latest commit), Frontend on Vercel,
  **live Neon PostgreSQL** (production). SQLite only for local dev/test.
- **n8n:** 5 workflow JSONs in `n8n/` (intake, 60s sweeper, reminders, patient response router, slot dispatcher).
  The 60s sweeper already pings `POST /api/v1/webhooks/expiry-sweep/` with `X-Webhook-Secret` → HTTP 200 verified.

### What is PARTIALLY done

- **Webhook security (Phase 1 / Task 1.1): ✅ COMPLETED 2026-11-12.** `X-Webhook-Secret` now enforced
  (staff auth OR secret) on `slots/hold/`, `appointments/hold/`, `re-request/`, `expiry-sweep/`,
  `upcoming-reminders/`. Central resolution helper in `appointments/services/webhook_security.py`
  (clinic field → custom_config → env → DEBUG-only dev fallback `'clinic_dev_secret_2026'`;
  fail-closed in production). Telegram inbound is fail-closed in production when unconfigured.
  New `ClinicSetting.webhook_secret` field (migration `0004`). 11 new tests in
  `WebhookSecurityHardeningTests`. Production env requirements: `WEBHOOK_SECRET` + 
  `TELEGRAM_WEBHOOK_SECRET` on backend; `DJANGO_WEBHOOK_SECRET` on n8n (same value).
  Spec: `SECURITY_AND_AUTH.md` §7.4.
- **RBAC (Phase 1 / Task 1.2): ✅ COMPLETED 2026-11-12.** Integration secrets inside `custom_config`
  are masked (`•••••••• (admin only)`) for non-admin staff in all serializer outputs (settings GET,
  PATCH response, white-label export); `clinic_admin` receives full values (admin saves round-trip
  safely); the dedicated `webhook_secret` field is never serialized. `PATCH/POST /api/v1/clinic/settings/`
  root-rule writes were verified already admin-gated (`get_permissions()`) and are now regression-proofed.
  **Fixed the pre-existing HEAD regression** where `POST /api/v1/admin/staff/` accepted
  `role='doctor'` with password/PIN (201): such attempts now return `400` — doctors can never be
  provisioned dashboard logins — while credential-free doctor enrolment (the `AddStaffModal` path)
  still creates a clinical `Doctor` resource with `201` and zero `StaffUser` accounts.
  Tests: `RBACTighteningTests` (7 tests). Suite: 102 tests / 101 pass.

- **Data Privacy & Masking (Phase 1 / Task 1.3): ✅ COMPLETED 2026-11-12.**
  New `backend/appointments/services/privacy.py` with `mask_phone` (keeps country code + last 4:
  `+234••••••1122`), `mask_phones_in_text`, `safe_external_body` (masked + truncated provider error
  bodies). The Telegram dispatch success log in `views_booking.py` now logs a safe
  `ok=`/`message_id=` summary (the raw response echoed patient names). The
  `TelegramService.call_api` HTTPError handler logs and stores only masked bodies (both the
  logger.warning line and `AuditLog.TELEGRAM_BOT_BLOCKED_BY_USER`). **Fixed latent pre-existing bug:**
  that EC-5 handler created `AuditLog` without the non-nullable `entity_id` — would IntegrityError in
  production; now passes a synthetic UUID. **Documented decision:** the DB (AuditLog + domain models)
  intentionally keeps full contact data as the access-controlled authoritative store; ONLY ephemeral
  server logs are masked. All 8 `logger.*` sites audited; frontend bundle scanned for secrets — clean.
  Tests: `PrivacyAndIPHardeningTests` (9 tests).

- **Rate-Limiting (Phase 1 / Task 1.4): ✅ COMPLETED 2026-11-12.** `get_client_ip()` in
  `views_booking.py` now validates every candidate header (CF-Connecting-IP, X-Real-IP,
  X-Forwarded-For first hop) with `ipaddress.ip_address`; malformed values are logged and skipped,
  falling through to REMOTE_ADDR. New `TRUST_PROXY_IP_HEADERS` env toggle (default `True` for
  Cloudflare/Railway; set `False` only with no reverse proxy) — documented in `backend/.env.example`.
  **Documented decision:** secret-guarded n8n endpoints get NO IP rate-limit (n8n is one shared egress
  IP; the shared secret is the anti-abuse control there). Intake keeps its pre-existing
  5 req/10 min + honeypot.

- **PHASE 1 STATUS: ✅ FULLY COMPLETE (2026-11-12).** Suite: 111 tests / 110 pass; sole failure =
  pre-existing Telegram intake bug (tracked in roadmap). Next: Phase 2 Task 2.1 — InteractionLog
  model + `POST/GET /api/v1/interactions/` (secret-guarded write for n8n, staff-read), then Task 2.2
  (async outbound dispatch webhook in `DispatchOffersView`, currently synchronous urllib at
  `views_booking.py` ~lines 406–428).

- **InteractionLog (Phase 2 / Task 2.1): ✅ COMPLETED 2026-11-12.** New `InteractionLog` model
  (migration `0005`) — provider/channel/direction/status, E.164 patient phone, nullable
  `BookingRequest`/`Appointment` FKs, unique `external_ref` idempotency key, call duration,
  recording URL, summary/transcript/error_detail. `POST /api/v1/interactions/` is guarded by the
  Task 1.1 `has_staff_or_webhook_access` helper (X-Webhook-Secret for n8n OR staff JWT) and is
  idempotent (re-delivery with same `external_ref` updates the row — 200; fresh → 201); empty
  `external_ref` maps to NULL to avoid unique-index collisions; unknown codes → 400; broadcasts
  `interaction_logged` via SSE (non-authoritative per spec §4B). `GET /api/v1/interactions/` is
  staff-only, filterable (`patient_phone` / `request_code` / `channel` / `status`), capped limit.
  Files: `models.py`, `serializers_interactions.py`, `views_interactions.py`, `urls.py`
  (`/interactions/` route), migration `0005`. Tests: `InteractionLogAPITests` (10 tests).
  Suite: 121 tests / 120 pass. NEXT: Task 2.2 — async dispatch webhook.

- **Async Dispatch Webhook (Phase 2 / Task 2.2): ✅ COMPLETED 2026-11-12.**
  New `backend/appointments/services/dispatch_service.py` — `fire_and_forget_webhook(url, payload)`
  posts to n8n from a daemon thread (5s timeout, failures logged, zero DB access inside the thread;
  payload fully pre-built by the caller). `DispatchOffersView` no longer blocks on n8n latency;
  offers + status transition commit first (spec §5 persist-before-process); n8n owns retries and the
  reconciliation cron covers misses (spec §9-6).
  **Fixed a real pre-existing production bug surfaced by the new test:** the n8n dispatch payload's
  `candidate_slots` (SlotOfferSerializer) contains raw `UUID` objects from `PrimaryKeyRelatedField`
  — `json.dumps` raised `TypeError` every time, meaning the n8n dispatch webhook notification had
  ALWAYS silently failed (old synchronous code swallowed it into a warning log). Fixed with
  `json.dumps(payload, default=str)`.
  Test: `AsyncDispatchWebhookTests` (slow 2s n8n → response <1.5s, non-vacuous call-count check).
  Suite: 122 tests / 121 pass. **PHASE 2 COMPLETE (2026-11-12).** Next: Phase 3 frontend tasks
  (3.1 ReviewModal channel selector, 3.2 patient dossier interaction history — depends on 2.1,
  3.3 omnichannel settings bento).

- **InteractionLog API contract (for n8n builds / Phase 4):** `POST /api/v1/interactions/` with
  `X-Webhook-Secret`; body per `API_REFERENCE.md` §8 (provider/channel/direction/status choices,
  E.164 phone, optional `request_code`/`appointment_code`, `external_ref` idempotency key →
  201 create / 200 re-delivery update). Upsert is atomic (`update_or_create`) — concurrent
  re-deliveries cannot crash. Dashboard reads: `GET /api/v1/interactions/`
  (staff JWT; filters patient_phone / request_code / channel / status; limit ≤ 200).

- **E.164 normalization contract (Review Fix, 2026-11-12):** `normalize_phone_e164` in
  `serializers_interactions.py` collapses ALL of `+2348030001122`, `2348030001122`, `08030001122`,
  and spaced variants to the canonical `+2348030001122` — one patient, one identity key, for both
  writes and dossier filters. **n8n workflows should send `+234...`** (any of the variants work,
  but the canonical form is the contract).

- **Option-number hold contract (Phase 4 prep, 2026-11-13):** `POST /api/v1/slots/hold/` now
  accepts `{"request_id": "REQ-...", "option_number": 2}` as an alternative to `slot_offer_id` —
  the BACKEND resolves the reply number against the request's SlotOffers in ORIGINAL dispatch
  order (`offered_at`; never renumbered by prior selections) inside the locked transaction.
  n8n Workflow C sends exactly ONE call — no static-data map, no Workflow-D dependency, zero
  added latency. Resolution rules: both `slot_offer_id` + `option_number` → 400; unknown request
  → 400; out-of-range → 400; expired offer → 400 (n8n sends the recovery/NEW path); valid →
  200 with a 15-minute HELD appointment (request converts only at confirm-time — existing
  lifecycle). **ALREADY_CONFIRMED (closes the tracked spec gap):** any second selection for a
  request that already has an active hold/confirmed appointment (or a selected offer/converted
  status) returns **200** `{"error": "ALREADY_CONFIRMED", "already_confirmed": true,
  "appointment_code": "AP-XXXX"}` — n8n sends the friendly "already confirmed" message instead
  of a scary 409. Expired holds do NOT match (patient gets a fresh chance). This check also
  closes a latent double-booking hole: previously a patient replying twice with DIFFERENT offer
  ids at different times could create two appointments (no time conflict to stop it).
  Tests: `SlotOptionNumberHoldTests` (8 tests, incl. the renumbering-trap proof).

- **Dispatch channel checkboxes (Task 3.1, 2026-11-13):** `POST /booking-requests/{id}/dispatch-offers/`
  accepts `dispatch_channels` — any non-empty combination of `whatsapp`/`sms`/`voice` (default all
  three). The "WhatsApp" checkbox controls the instant-message leg: during the Telegram-first era
  a telegram-intake patient gets the Telegram card; when the WhatsApp API key arrives the same
  checkbox flips to Meta WhatsApp — **no rebuild needed**. Distinct from `channel` (intake origin).
  **New guard:** dispatch is REFUSED with **409 `PATIENT_ALREADY_BOOKED`** (human-readable `detail`
  shown on the dashboard hover/inline + error toast) when the patient already has an active
  hold/confirmed appointment — expired holds do NOT block (reception can re-dispatch). The guard
  fires BEFORE any outbound call: nothing is sent, no offers created, no state change.
  **Commit-hygiene fix:** the Telegram send + n8n fire now run via `transaction.on_commit` — a
  slow Telegram server can no longer hold the receptionist's response or the DB row lock (spec §5
  persist-before-process now actually true; `AsyncDispatchWebhookTests` updated to
  `captureOnCommitCallbacks`). Frontend: ReviewModal channel strip (all three pre-checked),
  Approve disabled with reason until ≥1 channel, hover tooltip on the button, store rolls back
  optimistic state + shows the backend's explanation on 409. Tests: `DispatchChannelSelectionTests`
  (9 tests). Suite: **143 tests / 142 pass** (sole failure = pre-existing Telegram bug).

- **Code review fixes (2026-11-12):** external review of Phases 1–2 found 1 critical + 5 medium
  issues; all fixed and tested. Critical: non-ASCII `X-Webhook-Secret` header caused TypeError →
  500 on every guarded endpoint (bytes-mode compare now → clean 401). Mediums: interaction upsert
  race (atomic `update_or_create`), E.164 identity collapse (above), settings-PATCH AuditLog no
  longer stores `custom_config` secrets, spoofable-XFF rate-limit bypass (new `TRUSTED_PROXY_SETS_XFF`
  env toggle, default True; CF-Connecting-IP always trusted; malformed header values truncated in
  logs), plus hygiene (dead imports, over-masking regex requires 10–15 digits). Deferred by design:
  InteractionLog `logged_by` field (add when Phase 4 needs automation identities) and dispatch
  thread cap (no bulk loop exists). Suite: 126 tests / 125 pass.

### ⚠ Known PRE-EXISTING issues (present in HEAD before Phase 1 — verified via clean `git archive` baseline)

1. ~~`StaffAuthSecurityHardeningTests.test_admin_cannot_create_doctor_account`~~ — **FIXED in Task 1.2**
   (2026-11-12): doctor login-provisioning via staff endpoint now returns `400` again.
2. `Phase5TelegramTests.test_telegram_interactive_service_booking_and_dispatch` — Telegram
   `book_svc_<id>` flow returns `'prompted_date_range'` instead of `'booking_request_created'`.
   Still open; tracked in `ROADMAP_PARTNER_READINESS.md` (sole remaining suite failure: 111/110).

### What is MISSING (planned, not built)

- `InteractionLog` model + `POST/GET /api/v1/interactions/` (call outcomes, durations, transcripts,
  recording URLs, WhatsApp/SMS delivery statuses — partner spec Section 6 requirement).
- Visual Outbound Campaign Manager UI (partner spec Scenario E requirement — partner's acceptance
  checklist includes it; do not be surprised at handover).
- Non-blocking (async) outbound webhook dispatch from `DispatchOffersView`.
- Live n8n deployment + real VoiceBip/WhatsApp credentials (partner-dependent).
- **Ads Leads page** (user will design): ad-generated data (Google/Facebook ads) must be stored
  as **new leads on a dedicated page**, NOT injected into the booking request queue. See the
  2026-11-13 decision in Section 3.

### The 5 Messaging Features (specs in `plans/voicebip-n8n/`)

| # | Feature | Channels | Status |
|---|---|---|---|
| 1 | Slot dispatch (receptionist approves → 3 slots → patient picks → atomic hold) | WhatsApp + SMS + VoiceBip call nudge 30s later | Spec ready |
| 2 | Pre-visit reminders (24h details, 2h location guide) | WhatsApp + SMS only, zero calls | Spec ready |
| 3 | Doctor sick-leave disruption | Priority VoiceBip call ("check WhatsApp for receptionist's number") + WhatsApp + SMS | Spec ready |
| 4 | 60-min offer expiry & re-engagement (45-min nudge, expiry, 1-click recovery to priority tab) | WhatsApp + SMS only | Spec ready |
| 5 | Post-consultation follow-up & welfare recall | TBD | **DEFERRED by user — revisit later** |

---

## 3. Key Conversation History (decisions you must not lose)

1. System built via 8 planning stages + 6 build phases — all signed off (see `TASKS.md`, `PROGRESS.md`).
2. Partner delivered the Hybrid AI OS spec; we answered their **Phase 1 System Discovery questionnaire**
   (21 questions, Sections A–E + 6-part deliverable) — answers established the "~85% aligned, 2 additions
   needed (InteractionLog + Campaigns)" assessment.
3. The 5 critical readiness steps agreed: PostgreSQL in prod (done), InteractionLog (pending),
   public ingress URL for webhooks, non-blocking outbound dispatch, standardized `X-Webhook-Secret`.
4. User chose to **build n8n workflows in-house**; partner supplies telephony credentials.
5. Master 5-phase partner-readiness roadmap agreed (Security → Backend → Frontend → n8n → Handover),
  codified in `ROADMAP_PARTNER_READINESS.md`.
6. Governance rules (from `AGENTS.md`): never build without explicit user command; strictly one small
   verifiable task at a time; logic/design separation; keep all `.md` docs synchronized.
7. **Ads/lead data flow (2026-11-13, USER DECISION):** data extracted from ads (Google/Facebook) is
   NOT a booking request. It must be stored as **new leads on a separate dedicated page** that the
   user will design later. An ads-intake implementation was mistakenly built straight into
   BookingRequest (commit `7016c6a` — channels + lead_source + n8n Workflow E delivering into the
   queue) and was **reverted the same day** (commit `e503572`, migration 0006 unapplied). The n8n
   ads workflow is ON HOLD until the Leads page design exists. Planning-first: do NOT build any
   leads/ads code until the user explicitly commands it.
8. **Architecture arrangement (2026-11-13, USER APPROVED) — Option A: Feature-Sliced.** Every
   feature is a vertical slice across Django + n8n + dashboard; each feature = own backend service
   module, own n8n workflow file, own dashboard tab — all sharing ONE spine (X-Webhook-Secret
   guard, E.164 phones, InteractionLog logging, SSE bus). Features may only ADD new
   modules/endpoints/workflows and reuse the spine; never reach into another feature's internals.
   Every feature follows the same 5-beat rhythm: intake → human review → n8n acts → patient
   responds (atomic backend) → everything logged. New intake methods and the future Leads page
   plug in without touching the core.
9. **Execution order (2026-11-13, USER APPROVED):** Step 3.1 channel selector (dispatch_channel
   backend field + ReviewModal toggle) → user builds n8n workflows A→B→C→D per
   `n8n/N8N_BUILD_SHEET.md` → Step 5 partner handover → Leads page last (user designs first).

---

## 4. File Map (where everything lives)

| Path | What it is |
|---|---|
| `AGENTS.md` | Master blueprint & agent behavioral governance |
| `TASKS.md` / `PROGRESS.md` | Original 6-phase build tasks & completion log |
| `ROADMAP_PARTNER_READINESS.md` | **Current active 5-phase roadmap (keep updated)** |
| `MASTER_CONTEXT.md` | **This file (keep updated)** |
| `API_REFERENCE.md` / `DATABASE_SCHEMA.md` / `SECURITY_AND_AUTH.md` | Backend contracts & security spec |
| `plans/HYBRID_AI_OPERATING_SYSTEM_SPEC.md` | Partner's architecture spec (locked decisions) |
| `plans/voicebip-n8n/01–04*.md` | Messaging feature handover specs |
| `backend/` | Django REST backend (`appointments/` = domain app, `services/` = business logic) |
| `frontend/` | React 19 workstation (`stores/`, `services/`, `hooks/` = logic; `components/`, `views/` = design) |
| `n8n/` | Workflow JSONs + agency quickstart README |

---

## 5. Working Rules for Any AI on This Project

1. Read this file + `ROADMAP_PARTNER_READINESS.md` before any work; continue the **next unchecked task**.
2. One task at a time; verify (tests / build) before signing off and updating progress files.
3. **Never** give the Dispatcher direct DB credentials; never let agents confirm bookings without backend validation.
4. Preserve existing REST contracts: `POST /api/v1/booking-requests/`, `POST /api/v1/slots/hold/`,
   `POST /api/v1/booking-requests/{id}/re-request/` (changes must be backward-compatible and documented).
5. After every session: update this file's "Last updated" line, the roadmap checkboxes, and `PROGRESS.md`.
