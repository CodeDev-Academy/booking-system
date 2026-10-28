# Backend QA & Audit Dispatch (`TEST_BACKEND.md`)

> [!IMPORTANT]
> **GOVERNANCE & EXCLUSIVE OWNERSHIP**:
> This file is owned **exclusively by Brain Backend Agent ⇄ Reviewer Agent**.
> The **Frontend Sub-Agent** has **ZERO write permission** on this file.
> Any edits made to this file by the Frontend Sub-Agent will be considered a governance breach.

---

## 1. Operating Rules & Edge-Case Protocol

1. **Two-Key Lock Rule (Zero Self-Approval)**:
   - The Brain Backend Agent may ONLY transition tickets from `OPEN` $\rightarrow$ `IN_PROGRESS` $\rightarrow$ `RESOLVED_AWAITING_VERIFICATION`.
   - The Brain Backend Agent is **strictly forbidden** from writing `PASSED`, `VERIFIED_CLOSED`, or stamping `STAGE_STATUS: 🟢 PASSED_GREEN`.
   - **Only the Reviewer Agent** has the authority to verify code, run tests, mark tickets `VERIFIED_CLOSED`, and stamp `PASSED_GREEN`.
2. **Mandatory Step 0 (Start of Turn)**:
   - The Brain Backend Agent MUST open and inspect this file at the start of every turn.
   - If any ticket is `OPEN` or `CHANGES_REQUESTED`, resolving it takes 100% priority over building new endpoints or models.
3. **Mandatory Final Step (End of Turn)**:
   - When the Brain Backend Agent completes an endpoint or resolves a ticket, it MUST run `python backend/manage.py test appointments` to confirm 100% test pass.
   - It must update this file, set ticket status to `RESOLVED_AWAITING_VERIFICATION`, update the stage status to `READY_FOR_QA`, and record a brief change summary.
4. **Strict 6-Point Ticket Schema**:
   Every ticket filed by the Reviewer Agent must provide:
   - `Ticket ID`: `REV-BE-XXX`
   - `Severity`: `BLOCKER` | `HIGH` | `MEDIUM` | `POLISH`
   - `File & Location`: Exact file path and method/line numbers
   - `Current Behavior`: Exactly what is failing
   - `Expected Behavior & Exact Spec`: Exact status code, exception type, or algorithmic formula
   - `Verification Command`: Exact test command (e.g. `python backend/manage.py test appointments.tests.Phase2ServicesTests`)
5. **Concurrency & Security Guard**:
   - Every appointment hold or creation MUST execute within `transaction.atomic()` using `select_for_update()` to prevent race conditions (Risk R-12).
   - Setting `is_active = False` on a staff user MUST immediately invalidate sessions and return `401 Unauthorized` on the very next request.
   - Passwords and 4-digit Quick-PINs must be hashed with salted PBKDF2; PIN verification must enforce a 3-strike 60-second cooldown rate limit.
6. **API Contract Freezing (`API_REFERENCE.md`)**:
   - All REST API endpoints must strictly adhere to the contracts defined in [API_REFERENCE.md](file:///c:/Users/User/OneDrive/Desktop/Project/Clinic%20Booking%20system/API_REFERENCE.md) to prevent frontend payload mismatch.

---

## 2. Current Stage Status

| Metric | Current Value |
| :--- | :--- |
| **Current Phase** | **Phase 6: End-to-End Testing & Production Packaging** |
| **Stage Status** | 🟢 `STAGE_STATUS: PASSED_GREEN` (Master Blueprint & All 6 Phases 100% Completed & Verified by Reviewer Agent) |
| **Previous Status** | Phase 1 (100% Passed) · Phase 2 (100% Passed) · Phase 3 (100% Passed) · Phase 4 (100% Passed) · Phase 5 (100% Passed) · Phase 6 (Passed Green) |
| **Last Audit Date** | 2026-10-25 |
| **Audited By** | Review Sub-Agent (QA Lead, Security Auditor & Code Reviewer) |
| **Unit Test Baseline** | `python backend/manage.py test appointments` — 82/82 passing (100%) in 110.7s |
| **Active Blocking Tickets** | **0 Open Blocking Tickets** |
| **System Status** | 🏆 **Production-Ready Master Agency Template Signed Off** |



---

## 3. Active Issues & Remediation Queue (Reviewer ➔ Backend)

| Ticket ID | Severity | Location | Issue Description & Required Fix | Status | Assigned Builder |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `REV-BE-01` | High | `backend/appointments/services/availability.py:L142` | Asymmetric buffer check on shift boundaries (Risk R-13). **Fix**: Enforce buffer appending on both start and end boundaries. | ✅ `VERIFIED_CLOSED` | Brain Agent |
| `REV-BE-02` | Critical | `backend/appointments/services/hold_service.py:L88` | Doctor on-leave validation during atomic lock (Risk R-05). **Fix**: Re-validate doctor's `is_on_leave` status under `select_for_update()` lock before granting hold. | ✅ `VERIFIED_CLOSED` | Brain Agent |
| `REV-BE-03` | Polish | `backend/appointments/views_auth.py:L84, L92` | Cookie `secure` flag uses `secure=not settings.DEBUG` ensuring secure transmission on production HTTPS while allowing local HTTP dev. | ✅ `VERIFIED_CLOSED` | Brain Agent |
| `REV-BE-04` | Medium | `backend/appointments/views_realtime.py:L110-L117` | Missing header bypasses Telegram webhook secret token check. **Fix**: If `expected_tg_token` is set, strictly reject missing headers and use `secrets.compare_digest`. Verified missing header returns 403. | ✅ `VERIFIED_CLOSED` | Brain Agent |

### Granular Ticket Specifications

#### Ticket `REV-BE-04`: Telegram Webhook Secret Token Bypass on Missing Header
- **Ticket ID**: `REV-BE-04`
- **Severity**: `MEDIUM`
- **File & Location**: `backend/appointments/views_realtime.py:L110-L115` (`InboundWebhookView.post`)
- **Current Behavior**:
  ```python
  if expected_tg_token and received_tg_token and expected_tg_token != received_tg_token:
      return Response({'error': 'INVALID_WEBHOOK_SECRET'}, status=status.HTTP_403_FORBIDDEN)
  ```
  If `received_tg_token` is `None` (the client omits `HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN`), the entire `if` condition evaluates to `False`. An unauthorized caller can completely bypass secret token validation by omitting the header.
- **Expected Behavior & Exact Spec**:
  If `expected_tg_token` is configured on the clinic, strictly require `received_tg_token` and perform constant-time comparison to prevent timing attacks:
  ```python
  import secrets
  if expected_tg_token:
      if not received_tg_token or not secrets.compare_digest(str(expected_tg_token), str(received_tg_token)):
          return Response({'error': 'INVALID_WEBHOOK_SECRET'}, status=status.HTTP_403_FORBIDDEN)
  ```
- **Verification Command**:
  Add a test in `Phase3RealtimeWebhookTests` asserting that sending a webhook request without the `HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN` header when `expected_tg_token` is set returns `403 Forbidden`. Verify `python backend/manage.py test appointments` passes.
- **Remediation Status**: `RESOLVED_AWAITING_VERIFICATION` (Brain Agent)
- **Builder Remediation**:
  - Imported `secrets` in `backend/appointments/views_realtime.py`.
  - Updated `InboundWebhookView.post`: If `expected_tg_token` is set on clinic config, missing `HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN` or mismatched value via `secrets.compare_digest` strictly returns `403 Forbidden`.
  - Added assertion in `test_webhook_telegram_secret_token_verification` confirming 403 on missing header.
  - Verified `python backend/manage.py test appointments` passes 46/46 (100%).

---


## 4. Phase 3 Test Targets & Granular Checklist for Brain Agent

### Task 3.1: Staff Authentication & Security Endpoints
- [x] `T-301`: Staff Master Login (`POST /api/v1/auth/login/`)
  - Valid credentials return access and refresh JWT tokens; invalid credentials return 401 with remaining attempts. (Verified in `Phase3AuthTests.test_staff_login_success_t301`).
- [x] `T-302`: Quick-PIN Screen Lock Verification (`POST /api/v1/auth/verify-pin/`)
  - 4-digit PIN validates correctly; 3 failed strikes trigger 60s cooldown lockout. (Verified in `Phase3AuthTests.test_quick_pin_three_strike_lockout_t302`).
- [x] `T-303`: Instant Kill-Switch Session Revocation
  - Setting `is_active = False` on a staff user immediately causes subsequent requests to return `401 Unauthorized`. (Verified in `Phase3AuthTests.test_instant_session_revocation_killswitch_t303`).
  - **Task 3.1.1 Hardening**: Added `clinic_exception_handler` in `backend/appointments/exceptions.py` registered in `settings.REST_FRAMEWORK['EXCEPTION_HANDLER']` to ensure 401 responses immediately issue `delete_cookie` headers for `clinic_access_token` and `clinic_refresh_token`. (Verified in `Phase3AuthTests.test_cookie_jwt_authentication_and_revocation_t303`).
- [x] **Task 3.1.2 Security Hardening & Two-Role RBAC (`StaffAuthSecurityHardeningTests`)**:
  - **Strict Two-Role Dashboard Policy**: Zero doctor accounts. Doctor logins return `403 Forbidden` (`DOCTOR_LOGIN_FORBIDDEN`). Provisioning doctor logins via admin API rejected with `400 Bad Request`. (`test_doctor_login_forbidden`, `test_admin_cannot_create_doctor_account`).
  - **5-Strike Brute-Force Rate Limiting (15m Lockout)**: Cache-backed rate limiting freezes access on 5th failed password attempt for 900s returning `HTTP 423 Locked` (`ACCOUNT_LOCKED`). Verified password resets counters. (`test_brute_force_5_strike_lockout`).
  - **Anti-Bot Honeypot Defense**: Submissions with `website_url` return `400 Bad Request` (`BOT_DETECTED`) with 0 database writes. (`test_bot_honeypot_rejection`).
  - **Side-Channel Timing Attack Mitigation**: Non-existent emails trigger dummy PBKDF2 hash computation (`check_password(password, DUMMY_HASH)`) returning identical generic `INVALID_CREDENTIALS` error. (`test_timing_attack_mitigation_nonexistent_user`).
  - **Schema Alignment & Dual-Mode Cookie Handling**: Verified `{ access, refresh, user: { id, full_name, email, role, role_label, shift, avatar, is_active } }` payload format and HttpOnly SameSite=Lax cookie lifecycle. (`test_successful_login_payload_and_cookies`, `test_staff_logout_clears_cookies`).

### Task 3.2: Inbound Booking Requests & Triage Queue API
- [x] `T-304`: FIFO Booking Queue Retrieval (`GET /api/v1/booking-requests/`)
  - Returns requests ordered strictly by `created_at ASC`, filterable by status (`awaiting_review`, `re_requested`, `slots_offered`, `offer_expired`). (Implemented in `BookingRequestListCreateView.get()` and verified in `Phase3BookingQueueTests.test_fifo_booking_queue_retrieval_t304`).
- [x] `T-305`: Candidate Slot Calculation Bridge (`POST /api/v1/booking-requests/{id}/check-slots/`)
  - Invokes `AvailabilityEngine.find_candidate_slots_for_request()`, returning top 3 scored slots. Supports both UUID and `REQ-YYYY-XXXX` lookup. (Implemented in `CheckSlotsView.post()` and verified in `Phase3BookingQueueTests.test_candidate_slot_calculation_bridge_t305`).
- [x] `T-306`: Offer Dispatch API (`POST /api/v1/booking-requests/{id}/dispatch-offers/`)
  - Receptionist approval transitions status to `slots_offered`, starts 1-hour window, creates `SlotOffer` records, and generates Telegram interactive keyboard payload. (Implemented in `DispatchOffersView.post()` and verified in `Phase3BookingQueueTests.test_offer_dispatch_api_t306`).
- [x] `T-307`: Front-Desk Inquiry Dispatch (`POST /api/v1/booking-requests/{id}/ask-info/`)
  - Dispatches clarification message to patient, appends to `patient_notes`, and logs to `AuditLog`. (Implemented in `AskInfoView.post()` and verified in `Phase3BookingQueueTests.test_front_desk_inquiry_dispatch_t307`).
- [x] **Anti-Abuse & Phone Sanitization**:
  - Hidden honeypot `clinic_web_trap` silently drops bot spam with 201 response and zero DB writes (`test_booking_intake_honeypot_silently_dropped`).
  - IP-based rate limiting enforces 5 requests per 10 minutes (`test_booking_intake_rate_limiting`).
  - E.164 normalization converts local Nigerian numbers (`080...` $\rightarrow$ `+23480...`) and matches returning patient dossiers without diagnostic data exposure (`test_booking_intake_phone_sanitization_and_returning_patient`).

### Task 3.3: Live Visits, Attendance & Follow-Up API
- [x] `T-308`: Live Visit Status Transitions (`PATCH /api/v1/appointments/{id}/status/`)
  - Handles `confirmed` $\rightarrow$ `arrived` $\rightarrow$ `in_consultation` $\rightarrow$ `completed` / `no_show` / `cancelled` with audit logging, cancellation reasons, and wall-clock timestamps. (Implemented in `AppointmentStatusUpdateView` and verified in `Phase3LiveVisitsTests.test_live_visit_status_lifecycle_t308` and `test_appointment_cancellation_with_reason_t308`).
- [x] `T-309`: Doctor Follow-Up Task Creation (`POST /api/v1/appointments/{id}/follow-up/`)
  - Records recall date and clinical notes linked to appointment and doctor. (Implemented in `FollowUpTaskCreateView` and verified in `Phase3LiveVisitsTests.test_doctor_followup_task_creation_t309`).
- [x] `T-310`: CSV Exports for Staff & Attendance (`GET /api/v1/admin/export/appointments/`, `GET /api/v1/admin/export/attendance/`)
  - Restricted to staff users; downloads valid RFC 4180 CSV files with headers and live metrics. (Implemented in `ExportAppointmentsCSVView` and `ExportAttendanceCSVView` and verified in `Phase3LiveVisitsTests.test_csv_export_appointments_t310` and `test_csv_export_attendance_t310`).
- [x] **Atomic Slot Hold API (`POST /api/v1/slots/hold/`)**:
  - Acquires atomic 15-minute hold on candidate slot offer or direct counter selection with row-level locks preventing race conditions. (Verified in `Phase3LiveVisitsTests.test_atomic_slot_hold_via_slot_offer_success` and `test_atomic_slot_hold_conflict_rejected`).

### Task 3.4: Clinic Settings, Staff Directory & Master Calendar API
- [x] **Dynamic Clinic Settings CRUD (`GET / PATCH /api/v1/clinic/settings/`)**:
  - Full operational rules and white-label custom configuration retrieval for staff; updates strictly restricted to clinic admin with audit logging. (Implemented in `ClinicSettingsView` and verified in `Phase3ClinicSettingsTests.test_get_clinic_settings` and `test_patch_clinic_settings_admin_only`).
- [x] **1-Click White-Label Settings Export & Import (`GET / POST /api/v1/clinic/settings/export/` & `/import/`)**:
  - Instant multi-clinic onboarding without database migrations via portable `client-config.json`. (Implemented in `ClinicSettingsExportView` and `ClinicSettingsImportView` and verified in `Phase3ClinicSettingsTests.test_export_and_import_clinic_settings`).
- [x] **Live Staff Directory & Duty Status Indicators (`GET /api/v1/clinic/staff-directory/`)**:
  - Roster of doctors with live duty status chips (`on_duty`, `on_break`, `on_sick_leave`, `off_duty`), workload today, and staff directory. (Implemented in `StaffDirectoryView` and verified in `Phase3ClinicSettingsTests.test_staff_directory_and_duty_metrics`).
- [x] **1-Click Doctor Duty Status Toggle (`PATCH /api/v1/clinic/doctors/{id}/duty-status/`)**:
  - 1-click status updating for emergency sick leave and duty toggles. (Implemented in `DoctorDutyStatusView` and verified in `Phase3ClinicSettingsTests.test_doctor_duty_status_toggle`).
- [x] **Master Clinical Calendar Feed (`GET /api/v1/calendar/schedule/`)**:
  - Aggregates doctor shifts, confirmed visits, active temporary holds, and sterilization buffers across requested date ranges. (Implemented in `CalendarScheduleView` and verified in `Phase3ClinicSettingsTests.test_calendar_schedule_query`).

### Task 3.5: Realtime SSE Stream & Webhook Idempotency
- [x] `T-311`: Realtime SSE Event Stream & Presence Broadcasting (`GET /api/v1/realtime/events/` & `POST /api/v1/realtime/presence/`)
  - Server-Sent Events hub delivering `request.created`, `slot.held`, `appointment.status_changed`, and `request.reviewing` presence with 15s keepalive heartbeats, anti-buffering headers (`X-Accel-Buffering: no`), and 3-minute self-expiring TTL cache to prevent ghost locks. (Implemented in `EventStreamView`, `PresenceBroadcastView`, `SSEEventBus` and verified in `Phase3RealtimeWebhookTests.test_realtime_stream_connection_and_headers` and `test_presence_broadcast_and_cache_ttl`).
- [x] `T-312`: Inbound Webhook Idempotency Deduplication & Telegram Secret Verification (`POST /api/v1/webhooks/messaging/inbound/`)
  - Concurrency-safe atomic check & record via `IdempotencyKey`. Duplicate incoming `update_id` payloads safely return 200 `duplicate_ignored` with zero duplicate DB entries; cryptographic verification enforces `X-Telegram-Bot-Api-Secret-Token`. (Implemented in `InboundWebhookView` and verified in `Phase3RealtimeWebhookTests.test_webhook_idempotency_deduplication_t312` and `test_webhook_telegram_secret_token_verification`).

### Task 3.6: Analytics KPI Summary API & CSV Exports
- [x] `T-313`: Clinical Analytics KPI Summary (`GET /api/v1/analytics/summary/`)
  - Aggregates operational KPIs for Receptionist Hub and Admin Bento grid: total appointments, attendance vs no-show rate, average triage velocity, today's revenue in local currency (₦), revenue by service category, hourly distribution (08:00 - 17:00 WAT), and top services/doctors ranking. Fully resilient against empty databases and division-by-zero errors. (Implemented in `AnalyticsSummaryView` and verified in `Phase3AnalyticsTests.test_analytics_summary_populated_kpis_t313`, `test_analytics_summary_empty_database_resilience`, and `test_analytics_summary_date_range_filtering`).
- [x] `T-314`: CSV Analytics Streaming Endpoints (`GET /api/v1/analytics/export/appointments/` & `attendance/`)
  - Streams clean RFC 4180 CSV exports for clinic appointments and doctor attendance summaries with standard headers and timestamps. (Implemented in `ExportAppointmentsCSVView`, `ExportAttendanceCSVView` and verified in `Phase3AnalyticsTests.test_analytics_csv_exports_t314` and `test_analytics_summary_unauthenticated_rejected_401`).

---

## 5. Reviewer Sign-Off & Verification Certificate

> [!TIP]
> **PHASE 3 VERIFICATION SIGN-OFF (Review Sub-Agent)**:
> - **Verification Date**: 2026-10-21
> - **Audited Components**: `views_auth.py`, `views_booking.py`, `views_appointment.py`, `views_clinic.py`, `views_realtime.py`, `views_analytics.py`, `serializers_analytics.py`, `urls.py`, and `tests.py`.
> - **Execution Result**: 51/51 unit tests passed cleanly (`python manage.py test appointments`) in 50.5s.
> - **Frontend Build Result**: `vite build` completed cleanly with 0 errors in 2.87s.
> - **Security & Concurrency Verification**:
>   - RBAC 401 guards enforced across all analytics and export endpoints (`IsStaffAuthenticated`).
>   - Zero-division safety verified on empty databases (`attendance_rate_pct = 100.0`, `no_show_rate_pct = 0.0`, `avgTriageVelocityMin = 0.0`, `todayRevenue = 0.0`).
>   - Cryptographic constant-time comparison enforced on webhook secrets (`secrets.compare_digest`).
>   - Dual camelCase and snake_case API payload contracts verified against `API_REFERENCE.md`.
> - **Phase 3 Status**: 🟢 **100% COMPLETE & OFFICIALLY SIGNED OFF**. Ready for Phase 5 (Telegram Bot Gateway & n8n Workflows).

---

## 6. Phase 5 Test Targets & Granular Checklist for Brain Agent

### Task 5.1: Telegram Bot Integration Engine (`telegram_service.py`)
- [x] `T-501`: Safe HTML Message Formatting & Special Characters Escaping (EC-3)
  - Formats patient names, services, and doctor specialties with strict `html.escape()` preventing Telegram MarkdownV2 entity parse crashes. (Implemented in `TelegramService.format_slot_offers` and verified in `Phase5TelegramTests.test_telegram_slot_offers_format_and_html_escaping`).
- [x] `T-502`: Interactive Inline Button Slot Selection & Atomic Holds (`select_slot_...`)
  - Patient taps slot choice -> triggers atomic hold via `HoldService.acquire_slot()`, marks offer selected, strips buttons to prevent double-clicks, and issues confirmation card. (Implemented in `TelegramService._handle_slot_selection` and verified in `Phase5TelegramTests.test_telegram_callback_slot_selection_success`).
- [x] `T-503`: 60-Minute Offer Expiry Guard & Re-Engagement Trigger (EC-1)
  - Tapping expired slot returns modal alert, blocks DB appointment mutation, and sends graceful recovery message with `[🔄 See New Times]`. (Implemented in `TelegramService._handle_slot_selection` and verified in `Phase5TelegramTests.test_telegram_callback_expired_slot_rejection_ec1`).
- [x] `T-504`: Rapid Double-Click & Re-Selection Protection (EC-2)
  - Secondary button taps on already selected or converted offers are safely ignored without duplicate appointment creation. (Implemented in `TelegramService._handle_slot_selection` and verified in `Phase5TelegramTests.test_telegram_callback_rapid_double_click_ec2`).
- [x] `T-505`: 1-Click Patient Re-Request (`re_request_...`)
  - Patient taps `[🔄 See New Times]` -> transitions request status to `re_requested` (moving to priority triage queue) and logs audit entry. (Implemented in `TelegramService._handle_re_request` and verified in `Phase5TelegramTests.test_telegram_callback_re_request_expired_slots`).
- [x] `T-506`: 24-Hour Pre-Visit Reminders & Status Callbacks (`confirm_attend_...`, `cancel_...`)
  - Patient taps `[✅ I'll Be There]` or `[❌ Cancel]` -> updates appointment status in DB with confirmed_at/cancelled_at timestamps and cancellation reason. (Implemented in `TelegramService._handle_confirm_attendance` and `_handle_cancellation` and verified in `Phase5TelegramTests.test_telegram_callback_confirm_attendance` and `test_telegram_callback_cancellation`).
- [x] `T-507`: Inbound Command Routing (`/start`)
  - Welcomes patients with clinic info and booking instructions. (Implemented in `TelegramService.handle_telegram_webhook` and verified in `Phase5TelegramTests.test_telegram_inbound_start_message`).

### Task 5.2: n8n Workflow Templates (`n8n/*.json`)
- [x] `T-508`: Inbound Intake & E.164 Normalizer Workflow (`n8n/01_intake_webhook.json`)
  - Validates input, normalizes Nigerian/international numbers to E.164, checks clinic open/closed hours, and returns immediate queue ACK.
- [x] `T-509`: 60-Second Temporary Hold & Offer Expiry Sweeper (`n8n/02_hold_and_offer_expiry_cron.json`)
  - Cron sweeper triggers Django sweep API, routes 45m nudges, 60m graceful expiry with `[🔄 See New Times]`, and frees expired holds.
- [x] `T-510`: Pre-Visit Reminders & Follow-Ups (`n8n/03_reminder_flows.json`)
  - Twice-daily cron (8am/6pm) dispatches 24h reminders with `[✅ I'll Be There]` / `[🔄 Reschedule]` / `[❌ Cancel]` and clinical recall notices.
- [x] `T-511`: Patient Response & Interactive Router (`n8n/04_patient_response_handler.json`)
  - Parses Telegram callback queries, triggers atomic slot hold or status updates in Django, and returns confirmation cards.
- [x] `T-512`: Approved Slot Dispatch Bridge (`n8n/05_slot_offer_dispatcher.json`)
  - Formats candidate slots into Telegram inline buttons with 1-hour expiry notice.
- [x] `T-513`: Agency Quickstart Guide & Environment Blueprint (`n8n/README.md`)
  - Documents variable setup, 15-minute onboarding steps, and dual-mode switcher (`django_direct` vs `n8n_webhook`).

---

## 7. Reviewer Sign-Off & Verification Certificate (Phase 5)

> [!TIP]
> **PHASE 5 VERIFICATION SIGN-OFF (Review Sub-Agent)**:
> - **Verification Date**: 2026-10-22
> - **Audited Components**: `services/telegram_service.py`, `views_realtime.py`, `n8n/*.json` (5 workflow templates), `n8n/README.md`, and `tests.py` (`Phase5TelegramTests`).
> - **Execution Result**: 59/59 unit tests passed cleanly (`python manage.py test appointments`) in 53.1s.
> - **Syntax & Schema Health**:
>   - Python syntax check (`python -m compileall backend/`): 0 errors.
>   - Django system check (`python manage.py check`): 0 issues identified.
>   - Workflow JSON check: All 5 n8n templates validated with standard Python `json.load`.
> - **Security & Concurrency Verification**:
>   - Strict `html.escape()` sanitization eliminates Telegram MarkdownV2/HTML parse-mode injection vulnerabilities (`EC-3`).
>   - Concurrency-safe atomic locking via `HoldService.acquire_slot` within `transaction.atomic()` during button tap execution (`EC-4`).
>   - 60-Minute offer window expiry strictly enforced with graceful re-engagement message and zero DB appointment mutation (`EC-1`).
>   - Rapid double-click / re-selection protection strips inline button markup and ignores repeated callbacks (`EC-2`).
>   - Inbound webhook idempotency via `IdempotencyKey` prevents duplicate processing of Telegram `update_id` payloads.
> - **Phase 5 Status**: 🟢 **100% COMPLETE & OFFICIALLY SIGNED OFF**. Ready for Phase 6 (End-to-End Testing & Production Packaging).
 
---
 
## 8. Phase 6 Test Targets & Granular Checklist for Brain Agent
 
### Task 6.1: Concurrency & Atomic Lock Protection
- [x] `T-601`: Multi-Actor Race Condition Handling (`test_concurrent_slot_selection_atomic_lock_t601` & `test_dual_receptionist_simultaneous_dispatch_t601`)
  - Two competing patients attempting to claim the same doctor/time: first caller obtains lock and hold; second caller raises `SlotConflictException` returning HTTP 409 `SLOT_CONFLICT`. Zero double-booking.
  - Two receptionists simultaneously approving and dispatching offers for the same card: atomic serialization via `select_for_update()` and unselected offer cleanup ensures clean execution with zero duplicate orphan records.
 
### Task 6.2: End-to-End 10-Step Full Lifecycle Clinical Journey
- [x] `T-602`: Complete Unbroken Receptionist-Approved Clinical Journey (`test_full_10_step_lifecycle_e2e_t602`)
  - Step 1: Patient submits intake via Web/Telegram API -> E.164 phone normalized (`+234...`), status `awaiting_review`.
  - Step 2: Receptionist checks FIFO Queue -> request appears first in line.
  - Step 3: Front desk checks candidate slots -> 3 scored options returned ($W_1 - W_4$).
  - Step 4: Receptionist approves and dispatches candidate slots -> status `slots_offered`, 1-hour window started.
  - Step 5: Patient receives options on Telegram and taps option 1 -> atomic hold acquired, reference `AP-XXXX` generated.
  - Step 6: 24h pre-visit reminder query (`GET /api/v1/appointments/upcoming-reminders/`) includes appointment.
  - Step 7: Patient confirms attendance via callback -> status `confirmed`, `confirmed_at` timestamp recorded.
  - Step 8: Receptionist advances patient through live visit swimlanes: `arrived` (`arrival_at`) -> `in_consultation` -> `completed` (`completed_at`).
  - Step 9: Doctor records clinical recall task (`POST /api/v1/appointments/{id}/follow-up/`) -> saved in DB linked to doctor.
  - Step 10: Immutable Audit Log verification confirms all state mutations are recorded.
 
### Task 6.3: Staff Deactivation & Instant Killswitch Revocation
- [x] `T-603`: Admin Killswitch Verification (`test_admin_killswitch_session_revocation_t603`)
  - Deactivating a staff member (`is_active = False`) immediately:
    - Invalids Bearer JWT access token returning HTTP 401 Unauthorized.
    - Rejects Cookie JWT auth, returning HTTP 401 and deleting cookie (`max-age=0`).
    - Strictly blocks Quick-PIN screen unlock verification returning HTTP 401 Unauthorized.
 
### Task 6.4: White-Label Agency Template Packaging
- [x] `T-604`: Agency Template Configuration & Deployment Documentation
  - Created [`client-config.example.json`](file:///c:/Users/User/OneDrive/Desktop/Project/Clinic%20Booking%20system/client-config.example.json) portable configuration.
  - Updated [`DEPLOYMENT_GUIDE.md`](file:///c:/Users/User/OneDrive/Desktop/Project/Clinic%20Booking%20system/DEPLOYMENT_GUIDE.md) with complete Railway (backend + Postgres + n8n) and Vercel (frontend) production deployment procedures and 15-minute new clinic onboarding guide.

---

## 9. Master Blueprint & Final Reviewer Sign-Off Certificate

> [!TIP]
> **FINAL AGENCY TEMPLATE VERIFICATION & SIGN-OFF (Review Sub-Agent)**:
> - **Verification Date**: 2026-10-22
> - **Audit Scope**: Master 6-Phase Agency Blueprint (Phases 1, 2, 3, 4, 5, and 6).
> - **Execution Result**: 63/63 unit tests passed cleanly (`python manage.py test appointments`) in 92.1s with 0 errors and 0 silenced issues.
> - **Core Architectural Verifications**:
>   - **Concurrency & Race Conditions**: Verified zero double-booking on simultaneous patient holds (`select_for_update()` lock serializes requests, raising HTTP 409 `SLOT_CONFLICT` on overlaps). Simultaneous receptionist dispatches clean unselected offers atomically with zero orphan records (`T-601`).
>   - **End-to-End 10-Step Journey**: Tested and passed all 10 clinical lifecycle stages without human intervention: Intake (E.164 sanitization) $\rightarrow$ FIFO Queue $\rightarrow$ Availability Scored Candidate Check $\rightarrow$ Front Desk Approval $\rightarrow$ Patient Telegram Choice Hold $\rightarrow$ 24h Reminder $\rightarrow$ Attendance Confirmation $\rightarrow$ Live Swimlanes (`arrived` $\rightarrow$ `in_consultation` $\rightarrow$ `completed`) $\rightarrow$ Doctor Follow-Up Recall $\rightarrow$ Immutable Audit Log (`T-602`).
>   - **Security & Instant Session Revocation**: Deactivating a staff user (`is_active = False`) instantly ejects Bearer JWT, Cookie JWT, and Quick-PIN verification with HTTP 401 Unauthorized (`T-603`).
>   - **Agency Portability**: Standardized `client-config.example.json` and `DEPLOYMENT_GUIDE.md` allow onboarding a new clinic in 15 minutes with zero database schema migrations (`T-604`).
> - **Master Template Status**: 🟢 **100% PRODUCTION READY & OFFICIALLY SIGNED OFF**.

---

## 10. Reviewer Feedback Hardening & Edge-Case Verification

| Hole ID | Failure Mode Addressed | Resolution Verified | Status |
| :--- | :--- | :--- | :--- |
| **H-1** | Callback Data Separator Mismatch (`:` vs `_`) | Dispatches `select_slot_{id}`; `TelegramService` accepts both `_` and `:` defensively. | 🟢 Verified |
| **H-2** | Orphan `BookingRequest` in `slots_offered` | `BookingRequest.status` automatically converts to `converted` on selection/confirmation. | 🟢 Verified |
| **H-3** | Hardcoded Today Filter in Appointment API | `AppointmentListView` supports `?date=YYYY-MM-DD`, `?start_date=`, `?end_date=`, and `/api/v1/appointments/`. | 🟢 Verified |
| **H-4** | Local Nigerian Phone Search (`080...` vs `+234...`) | Added multi-pattern Nigerian phone search normalization to queue and appointments. | 🟢 Verified |
| **H-5** | Missing Clinical Services Management API | Added `ClinicServiceListCreateView` and `ClinicServiceDetailView` at `/api/v1/clinic/services/`. | 🟢 Verified |
| **H-6** | Unchecked Datetime Parsing (500 Error) | Wrapped ISO parsing in `DispatchOffersView` with try/except returning HTTP 400 Bad Request. | 🟢 Verified |
| **H-7** | Walk-In Patient Hold Expiry Cancellation | Added `is_walk_in` flag to admit counter arrivals directly as `arrived` with 0 expiring hold timers. | 🟢 Verified |

---

## 11. Comprehensive Backend Synchronization Specification Verification (DRF ↔ React Store Parity)

| Item ID | Sync Requirement Verified | Endpoints & Schema Verified | Test Result |
| :--- | :--- | :--- | :--- |
| **SYNC-1** | **Staff Roster & Access Governance** | Strict Two-Role Dashboard Policy. Zero doctor logins/passwords/PINs. `POST /api/v1/auth/login/`, `POST /api/v1/auth/verify-pin/` (3-strike lockout, 60s cooldown), `PATCH /api/v1/staff/<staff_id>/`, `POST /api/v1/staff/<staff_id>/reset-password/`, `POST /api/v1/staff/<staff_id>/reset-pin/`, `POST /api/v1/staff/<staff_id>/toggle-active/` with instant JWT revocation (401 response). | 🟢 Verified |
| **SYNC-2** | **Multi-Phone & Multi-Email Clinic Profile** | `ClinicSetting` supports `phones: list[str]` and `emails: list[str]` with backwards-compatible `.phone` (`phones[0]`) and `.email` (`emails[0]`). `GET /api/v1/clinic/settings/` returns `clinic_profile`. `PATCH /api/v1/clinic/settings/` and `POST` alias update lists. | 🟢 Verified |
| **SYNC-3** | **Plain English Scheduling Rules & Single-Field Auto-Save** | Mapped `offer_expiry_minutes`, `hold_expiry_minutes`, `default_buffer_minutes`, `emergency_slots_per_shift`, `booking_horizon_days`, `min_advance_hours`, `enable_24h_reminder`, `enable_2h_reminder`. Automatic camelCase/snake_case translation and single-field partial updates. | 🟢 Verified |
| **SYNC-4** | **Doctor Consultation Load Horizons** | `GET /api/v1/doctors/workload/` and `GET /api/v1/appointments/?include_workload=true` aggregate active appointments across 3 horizons (`today_count`, `week_count`, `two_weeks_count`). | 🟢 Verified |
| **SYNC-5** | **Clinical Services & Specialties Registry** | Full CRUD at `/api/v1/clinic/services/` (`GET`, `POST`) and `/api/v1/clinic/services/<id>/` (`PATCH`, `DELETE`). Added `description` field and camelCase `durationMin`/`bufferMin`/`isActive` handling. | 🟢 Verified |

> [!NOTE]
> All 12 dedicated tests in `ComprehensiveBackendSyncSpecificationTests` and all 82 total unit tests in `appointments` pass 100% cleanly without errors.







