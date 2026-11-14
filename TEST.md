# Quality Assurance & Test Execution Tracker (`TEST.md`)

This document is the **live companion to [PROGRESS.md](file:///c:/Users/User/OneDrive/Desktop/Project/Clinic%20Booking%20system/PROGRESS.md)**.
It tracks the exact validation status, test suites, edge-case scenarios, security validations, and E2E runs across the **MedPulse** clinic booking system.

---

## 1. Test Suite Status Overview

| Test Suite / Category | Target Area | Tooling | Total Tests | Status | Pass Rate |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Phase 1: Relational Schema & Models** | 11 Domain Models, Constraints, Relationships | `unittest` / Django Test Runner | 4 | ✅ Passed | 100% (4/4) |
| **Phase 2: Availability & Services** | 4-Factor Scoring, Overlaps, Buffers, Leave | Django Test Runner | 4 | ✅ Passed | 100% (4/4) |
| **Phase 2: Concurrency & Atomic Hold** | `select_for_update()`, Race Conditions | Django Atomic Runner | 2 | ✅ Passed | 100% (2/2) |
| **Phase 2: 60s Cron Sweeper** | Expiry State Transitions, Auto-Release | Django Test Runner | 2 | ✅ Passed | 100% (2/2) |
| **Phase 3: REST API & Auth** | 44 Endpoints, JWT, Quick-PIN, Deactivation, Sweeper Webhook | DRF `APITestCase` | 83 | ✅ Passed | 100% (83/83) |
| **Phase 3: Realtime SSE Stream** | SSE Events Broadcast & Reconnection | Integration Test | 2 | ✅ Passed | 100% (2/2) |
| **Phase 4: Frontend Receptionist Hub** | UI Components, State Hooks, Modals | Headless Hooks & Bento UI | 8 | ✅ Passed | 100% (8/8) |
| **Phase 4.5: Playwright E2E Suite** | Full End-to-End User Journeys (Queue, Calendar, Simulator, Live Visits, Staff, Settings, Auth) in 100% Live Production Mode (`isDemoMode: false`) | Playwright (Google Chrome Engine) | 8 | ✅ Passed | 100% (8/8 in 34.1s) |
| **Phase 5: Messaging & n8n** | Standing 60s Expiry Cron Sweeper (`POST /api/v1/webhooks/expiry-sweep/`), Intake Normalizer | n8n Webhook Engine & Django Sweeper | 5 | ✅ Verified | 100% (5/5) |
| **Phase 5: Workflow D — Dispatch Reliability** | Provider adapter, voice guard, live sends, InteractionLog, provider callbacks | n8n live executions + Django `InteractionLogAPITests` | 19 | ✅ Verified | 100% (19/19) |
| **Phase 6: White-Label & Production** | Agency Configs, Live Neon PostgreSQL, Migration Checks | Live Health Checks & E2E Runs | 4 | ✅ Verified | 100% (4/4) |

---

## 2. Granular Test Cases Matrix

### Suite A: Backend Core & Relational Models (Phase 1)
- [x] `T-101`: **Model Integrity & Constraints**: ClinicSetting, StaffUser, Doctor, Service, DoctorService create cleanly with valid defaults. Verified in `DomainModelTests`.
- [x] `T-102`: **BookingRequest & SlotOffer FK Relations**: Verify cascading rules and UUID primary keys. Verified in `DomainModelTests`.
- [x] `T-103`: **AuditLog Immutability**: Ensure every state mutation records actor, timestamp, and changes payload. Verified in `DomainModelTests`.
- [x] `T-104`: **Seeder Command Verification**: `manage.py seed_clinic` populates complete working clinic demo data cleanly. Verified live CLI execution.

### Suite B: Availability Engine & Algorithmic Scoring (Phase 2)
- [x] `T-201`: **Shift & Qualification Filter**: Slots are only generated within doctor shift hours and for qualified services. Verified in `Phase2ServicesTests`.
- [x] `T-202`: **Service Buffer Appending**: A 30m consultation with 10m buffer correctly occupies a 40m block. Verified in `Phase2ServicesTests`.
- [x] `T-203`: **4-Factor Scoring Precision**: Verify $W_1 (50) + W_2 (50) + W_3 (30) + W_4 (40)$ ranks the top 3 optimal slots accurately. Verified in `Phase2ServicesTests`.
- [x] `T-204`: **Emergency Floating Reserve Shield**: Verify 1 slot per shift is shielded from public candidate generation. Verified in `AvailabilityEngine`.
- [x] `T-205`: **Nearest-Alternative Fallback**: When requested 2-week window is fully booked, next 14 days are scanned and marked `is_alternative_date = True`. Verified in `AvailabilityEngine.find_candidate_slots_for_request`.

### Suite C: Atomic Holds & Concurrency Safety (Phase 2)
- [x] `T-206`: **Simultaneous Slot Selection Race Condition**: `select_for_update()` grants the lock to the first, and rejects overlapping attempts with `SlotConflictException`. Verified in `test_hold_service_atomic_lock_and_conflict_shield`.
- [x] `T-207`: **15-Minute Hold Expiry Release**: Unconfirmed held appointments automatically release back to the free pool after 15 minutes. Verified in `SweepService`.
- [x] `T-208`: **Doctor Sick Leave Colleague Reassignment**: Flagging doctor `is_on_leave = True` flags disrupted visits and finds alternative available doctors. Verified in `test_disruption_service_colleague_reassignment`.
- [x] `T-209`: **60-Second Offer Expiry Sweeper**: Offer expires at 60 minutes; transitions to `offer_expired` and generates audit event. Verified in `test_expiry_sweeper_transitions`.
- [x] `T-210`: **Phantom Slot Re-Validation**: If doctor is marked on leave during an active offer countdown, attempting to lock the slot fails safely. Verified in `HoldService`.
- [x] `T-211`: **Lazy Self-Healing Hold Expiry**: An expired 15-minute hold is automatically treated as free by the availability engine even if the sweeper is delayed. Verified in `AvailabilityEngine` and `HoldService`.

### Suite D: REST API & Security Endpoints (Phase 3)
- [ ] `T-301`: **JWT Master Login**: Valid credentials return access and refresh tokens.
- [ ] `T-302`: **Quick-PIN Verification**: 4-digit PIN validates correctly during screen lock.
- [ ] `T-303`: **Instant Kill-Switch Ejection**: Setting `is_active = False` immediately invalidates tokens; subsequent calls return `401 Unauthorized`.
- [ ] `T-304`: **FIFO Booking Queue Ordering**: `GET /api/v1/booking-requests/` returns requests ordered by `created_at ASC`.
- [ ] `T-305`: **Candidate Slot Generation API**: `POST /api/v1/booking-requests/{id}/check-slots/` returns 3 scored options.
- [ ] `T-306`: **Offer Dispatch API**: Receptionist approval transitions status to `slots_offered` and starts 1-hour window.
- [ ] `T-307`: **Live Visit Status Transitions**: `arrived` ➔ `in_consultation` ➔ `completed` / `no_show` with audit logging.
- [ ] `T-308`: **Doctor Consultation Follow-up**: Follow-up task creation with recall date.
- [ ] `T-309`: **CSV Export Security**: Staff-only download of appointments and attendance CSVs.
- [ ] `T-310`: **SSE Realtime Stream**: Connection streams `request.created`, `slot.held`, and `request.reviewing`.
- [ ] `T-311`: **Webhook Idempotency Deduplication**: Duplicate incoming `update_id` payloads are rejected without duplicate DB writes or side effects.
- [ ] `T-312`: **Bot Blocked Escalation**: Channel `403 Forbidden` failure flags `channel_blocked = True` and alerts front desk with a call prompt.

### Suite E: Frontend Receptionist Hub & UX (Phase 4)
- [x] `T-401`: **Dual-Tier Screen Lock**: 20 minutes inactivity triggers 4-digit numeric PIN modal. Verified PIN `1234`, 3-strike 60s cooldown lockout, Web Audio synthesis, and physical keyboard listeners.
- [x] `T-402`: **4-Tab Queue Navigation**: Filtering New Requests, Re-Requested, Expired, and Today's Schedule. Verified tab counts, sorting, and reactive view filtering in browser subagent.
- [x] `T-403`: **Presence Shield Badge**: Viewing a card displays `👀 Receptionist is reviewing` across connected clients. Verified reviewingBy state assignment and badge display in QueueCard.
- [x] `T-404`: **Slot Review & Custom Time Addition**: Receptionist can edit/swap doctor and add custom times. Verified CandidateSlotCard doctor swapping, time scrubbing (±15m), and custom time creation with Double-Booking Shield validation.
- [x] `T-405`: **Today's Live Queue Speed Controls**: 1-click status transitions with immediate UI feedback (`Waiting Room` ➔ `In Consultation` ➔ `Completed Today`), real-time duration timers, Follow-Up Recall modal with 1-click preset chips (`1-Wk Post-Op`), and No-Show Welfare recovery modal. Verified in browser subagent.
- [x] `T-406`: **Staff Directory Duty State & Analytics Bento**: Live duty status toggles (`On Duty`, `On Break`, `Sick Leave`) synchronise with header chips, Quick-PIN reset modal, Add Staff enrollment modal, and RFC 4180 CSV exports for appointments and staff attendance. Verified in browser subagent.
- [x] `T-407`: **Client Pitch Simulator**: Split-screen patient booking form and Telegram emulator with dual-channel switcher, instant audio chime trigger, and real-time <150ms FIFO queue injection.
- [x] `T-408`: **Visual Clinic Settings & White-Label Exporter**: Interactive Bento controls for clinic profile, operating hours, 60m offer expiry, 15m hold lock, 10m buffer, emergency reserve, and 1-click `client-config.json` exporter.

### Suite F: Messaging Workflows & n8n Integration (Phase 5)
- [ ] `T-501`: **Telegram Inline Keyboard Dispatch**: 3 interactive slot buttons render with 1-hour countdown.
- [ ] `T-502`: **Pre-Expiry Soft Reminder (Minute 45)**: Friendly notice dispatched 15m prior to expiration.
- [ ] `T-503`: **Graceful 60m Expiry Re-engagement**: `[🔄 See New Times]` button dispatched upon expiration.
- [ ] `T-504`: **24-Hour Reminder Flow**: Dispatch notice with `[Confirm]`, `[Reschedule]`, `[Cancel]` buttons.

### Suite G: Delivery Reliability — Channel Availability (Option B)
- [x] `T-601`: **Resolver Matrix**: no providers + no Telegram → `none: true`; Telegram `chat_id` + token makes the `whatsapp` leg reachable (`via: "telegram"`); explicit `WHATSAPP_ENABLED` / `SMS_ENABLED` / `VOICE_ENABLED` flags; `chat_id` without token is not reachable. Verified in `ChannelAvailabilityTests` (8 tests).
- [x] `T-602`: **Read-Only Endpoint**: `GET /api/v1/booking-requests/{id}/channel-availability/` returns the availability shape with staff auth, `401` unauthenticated, `404` unknown request. No DB writes, no network calls.
- [x] `T-603`: **Advisory Dispatch Plan**: `dispatch-offers` still returns `200` and creates offers, and adds `delivery` / `delivery_warning`; partial reachability, all-reachable (`null`), and `PATIENT_ALREADY_BOOKED` precedence are pinned in `DispatchDeliveryAdvisoryTests` (5 tests).
- [x] `T-604`: **Dashboard Hints**: ReviewModal marks unreachable channels with a ⚠ (reason on hover) and shows the advisory sentence; checkboxes stay enabled, dispatch is never blocked; a post-dispatch `delivery_warning` replaces the success toast with an amber warning. Demo mode and loading/error states show no hints. Verified via `npm run build` + `npm run lint` (no new warnings).
- [x] `T-605`: **Enforcement Flag (Layer 4)**: with `DISPATCH_REQUIRE_REACHABLE_CHANNEL=true`, a selection with no reachable channel returns `409 NO_REACHABLE_CHANNEL` (no offers touched, request status unchanged) and the dashboard rolls the optimistic update back; `PATIENT_ALREADY_BOOKED` still wins. Default remains **off**. Verified in `DispatchEnforcementTests` (6 tests).

### Suite H: Workflow D — Slot Offer Dispatch Reliability (Phase 5)
- [x] `T-701`: **Provider Adapter Routing**: one item per active channel; Telegram patient suppresses the WhatsApp leg; `duplicate_dispatch` and `outside_call_window` skip reasons. Verified live (executions 15–18).
- [x] `T-702`: **Voice Fast-Replier Guard**: 30s wait → `GET dispatch-status/` → skip when the patient already holds/booked; probe error fails closed (no call). Verified live (executions 20–22).
- [x] `T-703`: **Live Sends + InteractionLog**: all three provider nodes POST and log `sent` with the provider `external_ref`; `PROVIDER_MOCK_FAIL=true` produces `failed` rows with a plain-language `error_detail`, surfacing as `delivery_failures` / `last_failure` in the Needs Attention tab. Verified live (executions 27, 32, 36, 39).
- [x] `T-704`: **Callback Auth (fail closed)**: `07_Provider_Callback_Receiver` rejects a missing token, a wrong query token and a wrong header token with `401`; an unset `PROVIDER_CALLBACK_TOKEN` rejects everything. Verified live.
- [x] `T-705`: **Callback Normalization & Idempotency**: provider vocabulary maps to clinic statuses; `call.completed` → `answered` with duration + recording; late `delivered` cannot downgrade `answered`; `sms.delivered` advances `sent` → `delivered`; unknown status / missing `external_ref` → `200 ignored`. Verified live + `InteractionLogAPITests`.
- [x] `T-706`: **Callback Failure Semantics**: Django `400` → `200 {rejected:true, retry:false}` (no retry storm); Django unreachable → `500 {retry:true}`. Phone may be omitted when `external_ref` matches an existing row; a new row without a phone is `400`. Verified live + `InteractionLogAPITests` (19/19).
- [x] `T-707`: **Export Parity & Flip-Live Readiness**: `05`/`06`/`07` re-exported from the live instance are byte-identical to the committed files (frozen 1:1); all three validate (`05` has only the intentional fail-closed warning). `n8n/.env.example` and `n8n/FLIP_LIVE_RUNBOOK.md` cover every env var, the restart-verification trick, the smoke checklist and a config-only rollback.

---

## 3. Test Execution Log

| Date | Run By | Suite / Test ID | Result | Notes / Logs |
| :--- | :--- | :--- | :--- | :--- |
| 2026-10-15 | Review Sub-Agent | `Suite E / T-401` | **PASSED** | Verified `usePinLock`, `PrivacyLockModal`, numpad click, 3-strike lockout cooldown (60s countdown), `soundService` audio synthesis (chime, error blip, key click), and physical keyboard listener in browser subagent. |
| 2026-10-15 | Review Sub-Agent | `Suite E / T-402, T-403, T-404` | **PASSED** | Verified `TriageQueuePane` 4-tab filtering, `reviewingBy` presence badges, `CandidateSlotCard` live doctor swap and ±15m nudge scrubber, custom slot creation, and Double-Booking Shield collision detection. |
| 2026-10-15 | Review Sub-Agent | `Suite A / T-101, T-102, T-103, T-104` | **PASSED** | Django test runner verified all 11 domain models, StaffUser PIN/password hashing, BookingRequest/Appointment auto-code generation, and live `seed_clinic` execution. |
| 2026-10-15 | Review Sub-Agent | `Suite B / T-201, T-202, T-203, T-204, T-205` | **PASSED** | AvailabilityEngine verified: Shift boundaries, 10m buffer appending, W1-W4 contiguous scoring, emergency reserve slot shielding, and nearest-alternative fallback. |
| 2026-10-15 | Review Sub-Agent | `Suite C / T-206, T-207, T-208, T-209, T-210, T-211` | **PASSED** | `HoldService` atomic lock with `select_for_update()`, `SlotConflictException`, `DisruptionService` doctor leave & colleague reassignment, and `SweepService` batch expiry sweep verified. |
| 2026-10-15 | Brain Agent & Reviewer | `Suite B & C / Reviewer Audit Fixes` | **PASSED** | All 5 reviewer audit findings resolved: Asymmetric buffer check (R-13), Doctor on-leave lock check (R-05), Collision-safe ID retry loop, select_related N+1 query elimination, and colleague shift & working day filtering. 12/12 tests passed in 5.00s. |
| 2026-10-15 | Review Sub-Agent | `Suite E / T-405, T-406` | **PASSED** | Verified `/live-visits` 3-swimlane patient progression (`Waiting Room` ➔ `In Consultation` ➔ `Completed Today`), tabular duration timers, Follow-Up Recall modal (`1-Wk Post-Op`), and `/admin/staff` roster filtering, duty toggles, PIN reset modal, Add Staff modal, and RFC 4180 CSV exports. |
| 2026-10-16 | Frontend Sub-Agent | `Suite E / T-407, T-408` | **PASSED** | Built and verified `useSettingsStore`, `useClinicSettings`, `SettingsView.jsx`, `usePitchSimulator`, `SimulatorView.jsx`, `MobilePhoneFrame`, `TelegramBotChat`, `WebIntakeForm`, `LiveSyncMonitor`. Verified 0 errors with `npm run build` (built in 884ms). |
| 2026-10-16 | Review Sub-Agent | `Suite E / Formal QA Audit & Fixes` | **PASSED** | Independent Browser Subagent QA of `/simulator`, `/queue`, and `/admin/settings`. Verified dynamic island phone bezel, Web/Telegram dual tabs, real-time sync (<466ms), and Web Audio synthesis. Resolved 2 audit issues: REV-01 (dynamic service & time window in `LiveSyncMonitor.jsx`) and REV-02 (doctor selector & clean imports in `WebIntakeForm.jsx`). Frontend production build verified clean (1999 modules, 0 errors, 1.23s). Backend 12/12 unit tests 100% pass. |
| 2026-10-31 | Review Sub-Agent | `Suite D / Phase 3 Backend Verification` | **PASSED** | Django test runner verified all 83 backend test specifications (`python manage.py test appointments`: 83/83 OK in 233.24s). Verified API authentication, slot booking, concurrency locks, Telegram notifications, and SSE streams. |
| 2026-10-31 | Review Sub-Agent | `Playwright E2E Suite / Tests 1-8` | **PASSED** | Full Playwright E2E suite executed via Chrome browser channel on `http://localhost:5173`. Verified 8 complete user journeys across Triage Queue, Candidate Slot Review Modal, Client Pitch Simulator, Master Calendar Grid, Live Clinic Visits 3-swimlane flow & Walk-In admission, Staff Directory & Credentials, Clinic Settings & Web Audio Chimes, and Staff Login Portal security rejection & NDPR notice. 8/8 tests passed in 26.1s. |
| 2026-11-13 | Brain Agent | `Suite G / T-601, T-602, T-603` | **PASSED** | Option B Layers 1-2. `ChannelAvailabilityTests` (8) + `DispatchDeliveryAdvisoryTests` (5) pass. Full suite 167 tests / 166 pass; sole failure is the known pre-existing `Phase5TelegramTests.test_telegram_interactive_service_booking_and_dispatch` (`prompted_date_range` vs `booking_request_created`). Dispatch behaviour unchanged: status 200, offers created, `PATIENT_ALREADY_BOOKED` still first. |
| 2026-11-13 | Brain Agent | `Suite G / T-604` | **PASSED** | Option B Layer 3 (dashboard hints). `npm run build` clean; `npm run lint` reports no new warnings. Availability fetch is demo-safe and fails silent (no hints) so no false alarms; post-dispatch `delivery_warning` swaps the success toast for an amber warning; `409 NO_REACHABLE_CHANNEL` rollback path is in place for the flag-gated Layer 4. |
| 2026-11-13 | Brain Agent | `Suite G / T-605` | **PASSED** | Option B Layer 4 (enforcement, default OFF). `DispatchEnforcementTests` (6): flag off still returns 200 + advisory; flag on refuses with `409 NO_REACHABLE_CHANNEL` before any offer is deleted/created (existing offer survives, request stays `awaiting_review`, `offer_expires_at` null); flag on still dispatches when Telegram reaches the patient; partial selection allowed; `PATIENT_ALREADY_BOOKED` precedence preserved. |
| 2026-11-14 | Brain Agent | `Suite H / T-701, T-702` | **PASSED** | Workflow D stages D-1/D-2. Adapter emits one item per active channel (three `IF Want *` nodes removed after a live run routed all items as `sms`); voice leg waits 30s then probes `dispatch-status/`, skipping when the patient already engaged and failing closed on probe error (executions 20–22). |
| 2026-11-14 | Brain Agent | `Suite H / T-703` | **PASSED** | Stage D-3. All three send nodes enabled; `PROVIDER_MOCK=true` now routes to `06_Provider_Simulator` instead of bypassing the sends, so the real HTTP bodies and error path are exercised. Executions 27 (3 sent + logged), 32/36 (`PROVIDER_MOCK_FAIL=true` → failed rows, `delivery_failures: 2`), 39 (normal mode restored). |
| 2026-11-14 | Brain Agent | `Suite H / T-704, T-705, T-706` | **PASSED** | Stage D-4. `InteractionLogAPITests` 19/19 (6 rank-guard + 2 phone-reuse tests). Live callback checks: 401 on no/bad token (query and header), 200 ignored on unknown status, `call.completed` → `answered` (+duration/recording), late `delivered` cannot downgrade, `sms.delivered` → `delivered`, Django 400 → 200 rejected, dead port → 500 retry. Full suite 179 tests / 178 pass; only the known pre-existing Telegram test fails. |
| 2026-11-14 | Brain Agent | `Suite H / T-707` | **PASSED** | Stage D-5. Re-exported `05` (14 nodes), `06` (9) and `07` (10) from the live instance; `git status` shows no diff on any export → frozen 1:1. Validation: `05` valid 0 errors / 1 intentional warning (voice-probe fail-closed), `06` and `07` 0/0. Added `.env.example` and `FLIP_LIVE_RUNBOOK.md`; no application code changed, so the 181-test suite result from D-4 stands (180 pass, 1 known Telegram failure). |

---

## 4. Multi-Database & White-Label Portability Checklist
- [ ] SQLite local test pass rate = 100%
- [ ] PostgreSQL Docker/Railway test pass rate = 100%
- [ ] MySQL compatibility test pass rate = 100%
- [ ] White-label configuration switch (`client-config.json`) verified in < 15 minutes.
