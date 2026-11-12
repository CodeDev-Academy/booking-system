# ROADMAP_PARTNER_READINESS.md — 5-Phase Execution Roadmap (Active Task List)

> **Purpose:** get the clinic system 100% ready to connect to the partner's telephony assets
> (VoiceBip +234 DID, WhatsApp Cloud API) and their n8n integration expectations.
> **Rule:** execute top-to-bottom, ONE task at a time, verify each task (tests/build), tick the
> checkbox, and update `MASTER_CONTEXT.md` + `PROGRESS.md` after every completed task.
> Any AI inheriting this file continues from the first unchecked task.
> Status legend: `[x]` done · `[~]` partially done · `[ ]` not started · `(blocked)` needs partner/input.

---

## 🛡️ PHASE 1 — Security, Restrictions & Access Control (Top Priority)

### Task 1.1: Webhook Secret & Cryptographic Verification `[x]` ✅ COMPLETED 2026-11-12
- [x] `POST /api/v1/webhooks/expiry-sweep/` enforces `X-Webhook-Secret` (`secrets.compare_digest`) — pre-existing
- [x] `GET /api/v1/appointments/upcoming-reminders/` accepts staff auth OR `X-Webhook-Secret` — pre-existing
- [x] Defined `WEBHOOK_SECRET` in `core/settings.py` (env-loaded; hardcoded dev fallback only when `DEBUG=True`, fail-closed in production)
- [x] Enforced `X-Webhook-Secret` (or staff auth) on `POST /api/v1/slots/hold/` + `/api/v1/appointments/hold/` — was `AllowAny` (CRITICAL, fixed)
- [x] Enforced `X-Webhook-Secret` (or staff auth) on `POST /api/v1/booking-requests/{id}/re-request/` — was `AllowAny` (fixed)
- [x] Fixed Telegram inbound fail-open → fail-closed in production when `TELEGRAM_WEBHOOK_SECRET` unset (WhatsApp/Meta payloads on same route unaffected)
- [x] Added dedicated `webhook_secret` field to `ClinicSetting` (migration `0004_clinicsetting_webhook_secret`); resolution order: clinic field → custom_config → env → DEBUG-only dev fallback (centralized in new `appointments/services/webhook_security.py`)
- [x] Tests: new `WebhookSecurityHardeningTests` class (11 tests: reject missing/wrong secret, accept valid, staff bypass, fail-closed, inactive-staff bypass blocked); all pre-existing guarded-endpoint tests updated with headers
- [x] Verified n8n workflow JSONs already send `X-Webhook-Secret` (`$env.DJANGO_WEBHOOK_SECRET || 'clinic_dev_secret_2026'`) on all Django calls — partner must set `DJANGO_WEBHOOK_SECRET` in production n8n
- [x] Suite verification: 95 tests — 93 pass; only 2 failures are PRE-EXISTING in HEAD (verified via clean `git archive` baseline; unrelated to this task)
- Full spec written to `SECURITY_AND_AUTH.md` §7.4; env template updated in `backend/.env.example`

### Task 1.2: Role-Based Access Control (RBAC) Restrictions `[x]` ✅ COMPLETED 2026-11-12
- [x] Two-role dashboard policy; doctors barred from login — pre-existing
- [x] `IsClinicAdmin` gates all staff management endpoints (create/reset PIN/reset password/deactivate) — pre-existing
- [x] `PATCH/POST /api/v1/clinic/settings/` root rules restricted to `IsClinicAdmin` — found already gated via `get_permissions()`; regression-proofed with tests
- [x] Integration secrets inside `custom_config` (`telegram_bot_token`, `telegram_secret_token`, `webhook_secret`, any `*token*`/`*secret*`/`*password*`/`*api_key*` key) masked as `•••••••• (admin only)` for non-admin staff in `ClinicSettingSerializer.to_representation` (applies to settings GET, PATCH response, and white-label export); `clinic_admin` receives full values so admin saves round-trip without corruption; dedicated `webhook_secret` DB field never serialized at all
- [x] Fixed pre-existing HEAD regression: `POST /api/v1/admin/staff/` with `role='doctor'` + password/PIN credentials → now `400` (login provisioning forbidden); credential-free doctor enrolment still creates a clinical `Doctor` resource with `201` (frontend `AddStaffModal` compatible — it already omits credentials for doctors) and guarantees no `StaffUser(role='doctor')` ever exists
- [x] Tests: new `RBACTighteningTests` (7 tests: receptionist mask on GET + export, admin full values, receptionist PATCH 403, admin PATCH 200, credential-free doctor enrolment 201 with zero StaffUser, credential-bearing doctor attempt 400)
- [x] Suite verification: 102 tests — 101 pass; sole remaining failure is the known pre-existing Telegram intake-flow bug (tracked below, out of security scope)

### Task 1.3: Data Privacy & Masking (NDPR/HIPAA) `[x]` ✅ COMPLETED 2026-11-12
- [x] Mask patient phone numbers in server logs — new `backend/appointments/services/privacy.py`: `mask_phone` (keeps country-code prefix + last 4 digits, e.g. `+234••••••1122`), `mask_phones_in_text` (regex sweep of free text), `safe_external_body` (phone-masked + truncated provider error bodies)
- [x] Telegram dispatch success log in `views_booking.py` no longer dumps the raw Telegram response (which echoed patient name); logs safe `ok=` / `message_id=` summary only
- [x] `TelegramService.call_api` HTTPError handler: logged error body and `AuditLog.TELEGRAM_BOT_BLOCKED_BY_USER` payload now store the masked, truncated body
- [x] Fixed latent pre-existing bug surfaced by new tests: EC-5 403 handler created `AuditLog` without the non-nullable `entity_id` (would IntegrityError in production); now passes a synthetic UUID
- [x] Ensure logs/audit trail avoid exposing sensitive patient data — **documented decision**: the DB (AuditLog + domain models) intentionally keeps full contact data as the access-controlled authoritative store; ONLY ephemeral server logs are masked
- [x] Audited all `logger.*` call sites (8 total) — the two PII-bearing sites are the only ones handling external payloads; no `print()` PII leaks in app code; frontend bundle scanned for hardcoded secrets — clean
- [x] Tests: new `PrivacyAndIPHardeningTests` (9 tests incl. end-to-end masked-log guard)

### Task 1.4: Inbound Rate-Limiting & Anti-Spam `[x]` ✅ COMPLETED 2026-11-12
- [x] IP rate limiting (5 req/10 min) + honeypot on public booking intake — pre-existing
- [x] `get_client_ip()` hardened: every candidate header value validated with `ipaddress.ip_address`; malformed/spoofed headers are logged and skipped (fall through to next candidate, ultimately REMOTE_ADDR); X-Forwarded-For chains take the first hop
- [x] New `TRUST_PROXY_IP_HEADERS` env toggle (default `True`, matching Cloudflare/Railway); set `False` only when deploying without a reverse proxy. Documented in `backend/.env.example`
- [x] **Documented decision**: secret-guarded n8n endpoints (`/slots/hold/`, `/re-request/`, sweep/reminder webhooks) deliberately have NO IP rate-limit — all calls share n8n's single egress IP, so an IP limit would lock out legitimate automation; the shared secret is the anti-abuse control there
- [x] Tests: valid CF header trusted, garbage headers fall through, XFF first-hop parsing, toggle-off ignores headers, loopback default
- [x] Suite verification: 111 tests — 110 pass; **PHASE 1 COMPLETE** (sole failure = pre-existing Telegram intake bug, tracked below)

### Tracked pre-existing issues (not roadmap blockers, fix when scheduled)
- [ ] `Phase5TelegramTests.test_telegram_interactive_service_booking_and_dispatch` — Telegram `book_svc_<id>`
      intake flow returns `'prompted_date_range'` instead of `'booking_request_created'` (present in HEAD
      before Phase 1 work; fallout suspected from the intake-parity/coolify commit; investigate
      `TelegramService` service-button branch). Sole remaining suite failure (111 tests / 110 pass).

---

## ⚙️ PHASE 2 — Backend Core Readiness & Database

### Task 2.1: InteractionLog Model & API `[x]` ✅ COMPLETED 2026-11-12
- [x] `InteractionLog` model (migration `0005`): provider, channel (voice/whatsapp/sms/telegram), direction, patient name + E.164 phone, nullable `BookingRequest`/`Appointment` FKs, status, call duration, recording URL, summary/transcript/error_detail, unique `external_ref` idempotency key, timestamps — all indexed per spec §9
- [x] `POST /api/v1/interactions/` — n8n writes results; guarded by the Task 1.1 `has_staff_or_webhook_access` helper (X-Webhook-Secret or staff JWT); idempotent upsert on `external_ref` (201 create / 200 re-delivery update); server-side choice validation; unknown `request_code`/`appointment_code` → 400; empty `external_ref` → NULL (unique-index safe); broadcasts `interaction_logged` SSE
- [x] `GET /api/v1/interactions/` — staff-auth only; filters `patient_phone` / `request_code` / `channel` / `status` + capped `limit` (default 50, max 200 per spec §9)
- [x] Tests: 10 new `InteractionLogAPITests` (secret enforcement, normalization, idempotency, FK resolution, staff read + filters)
- [x] `DATABASE_SCHEMA.md` ERD + `API_REFERENCE.md` §8 updated
- [x] Suite verification: 121 tests — 120 pass (sole failure = pre-existing Telegram intake bug)

### Task 2.2: Non-Blocking Asynchronous Webhook Dispatcher `[x]` ✅ COMPLETED 2026-11-12
- [x] New `backend/appointments/services/dispatch_service.py`: `fire_and_forget_webhook` posts to n8n from a daemon thread (5s timeout, failures logged, zero DB access inside the thread — payload pre-built by caller)
- [x] `DispatchOffersView` no longer blocks on the n8n webhook; offers + status transition are committed before the call (spec §5 persist-before-process); n8n owns retries and the reconciliation cron covers misses (spec §9-6)
- [x] **Fixed real pre-existing production bug surfaced by the new test**: the n8n payload's `SlotOfferSerializer` FK fields emit raw `UUID` objects → `json.dumps` raised `TypeError` → the webhook notification had ALWAYS silently failed (even in the old synchronous code). Fixed with `json.dumps(payload, default=str)`
- [x] Test: `AsyncDispatchWebhookTests.test_slow_n8n_does_not_block_response` — 2s-hanging n8n endpoint, response returns <1.5s, webhook attempt verified non-vacuously (call-count assertion)
- [x] Suite verification: 122 tests — 121 pass (sole failure = pre-existing Telegram intake bug)

### Task 2.3: Production PostgreSQL Provisioning `[x]` ✅ COMPLETED (pre-existing)
- [x] Live Neon PostgreSQL verified; migrations applied; connection pooling; SQLite dev-only — pre-existing

### ✅ PHASE 2 COMPLETE (2026-11-12) — Backend core is partner-ready for n8n integration

---

## 🖥️ PHASE 3 — Frontend Dashboard Workstation Enhancements

### Task 3.1: Review Modal Channel Selector `[ ]`
- [ ] Channel toggle in `ReviewModal.jsx`: `[🟢 Dual: WhatsApp + SMS + Voicebip Call]` (default) vs `[💬 WhatsApp Only]`

### Task 3.2: Patient Dossier Interaction History `[ ]`
- [ ] Communications log in patient details modal (calls completed 45s, WhatsApp dispatched, SMS selected…) — depends on Task 2.1

### Task 3.3: Omnichannel Settings Bento `[ ]`
- [ ] Inputs in `/admin/settings` for `N8N_DISPATCH_WEBHOOK_URL`, `VOICEBIP_ENABLED`, "Test Webhook Connection" diagnostic button (admin-only edit)

---

## 🔄 PHASE 4 — n8n Workflows (User Builds In-House)

### Task 4.1: Slot Offer Dispatcher workflow `[~]` (05_slot_offer_dispatcher.json exists; add SMS node + 30s delay + VoiceBip call node)
### Task 4.2: Patient Response Handler workflow `[~]` (04 exists; add SMS "1/2/3" replies, other-channel neutralization, write to /interactions/)
### Task 4.3: Reminder Flows workflow `[~]` (03 exists; add dual WhatsApp+SMS 24h & 2h messages, zero calls)
### Task 4.4: Expiry Sweeper workflow `[~]` (02 exists; add 45-min nudge + 60-min expiry recovery card `[🔄 See New Times]`)
- [ ] All workflows verified end-to-end against local n8n instance (blocked on user's n8n deployment)

---

## 🤝 PHASE 5 — Partner Handover & Telephony Connection

### Task 5.1: Package We Give the Partner `[ ]`
- [ ] VoiceBip event webhook URL (n8n) + WhatsApp inbound webhook URL (n8n)
- [ ] Shared webhook verification token
- [ ] Live staging dashboard link for joint end-to-end testing

### Task 5.2: Assets We Collect from the Partner `(blocked)`
- [ ] VoiceBip API key + registered +234 caller ID
- [ ] Meta WhatsApp Phone Number ID + permanent access token (+ approved template names if used)

### Task 5.3: Joint Acceptance Run `[ ]`
- [ ] Complete partner checklist (their spec §14): auth, customers CRUD, campaigns, availability,
      appointments CRUD, interactions logging, campaign commands, realtime updates, idempotency,
      retries, reconciliation, data isolation, one full end-to-end journey tested together

---

## Sign-off Log
| Date | Task | Verified By | Notes |
|---|---|---|---|
| 2026-11-12 | Full review of project state; roadmap codified | OpenCode (GLM) | Phase 1 Task 1.1 started |
| 2026-11-12 | **Task 1.1 — Webhook Secret Enforcement** | OpenCode (GLM) | 11 new tests; 95 total, 93 pass (2 pre-existing HEAD failures unrelated, verified via clean baseline). See MASTER_CONTEXT.md ⚠ section. |
| 2026-11-12 | **Task 1.2 — RBAC Restrictions** | OpenCode (GLM) | 7 new tests; 102 total, 101 pass (sole failure = pre-existing Telegram intake bug, tracked below). Doctor-login regression fixed; secrets masked for receptionists. |
| 2026-11-12 | **Task 1.3 — Data Privacy & Masking** | OpenCode (GLM) | 9 new tests incl. end-to-end masked-log guard; 111 total, 110 pass. Fixed latent AuditLog `entity_id` bug in EC-5 handler. |
| 2026-11-12 | **Task 1.4 — Rate-Limiting Review** | OpenCode (GLM) | `get_client_ip` ipaddress-validated + `TRUST_PROXY_IP_HEADERS` toggle. **PHASE 1 COMPLETE.** Next: Phase 2 Task 2.1 (InteractionLog). |
| 2026-11-12 | **Task 2.1 — InteractionLog Model & API** | OpenCode (GLM) | Migration 0005; `POST/GET /api/v1/interactions/`; 10 new tests; 121 total, 120 pass. Secret-guarded writes, staff-only reads, `external_ref` idempotency. |
| 2026-11-12 | **Task 2.2 — Async Dispatch Webhook** | OpenCode (GLM) | Fire-and-forget daemon thread; fixed silent UUID-serialization bug in n8n payload (webhook had never actually delivered). 1 new test; 122 total, 121 pass. **PHASE 2 COMPLETE.** |
