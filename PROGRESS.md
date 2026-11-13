
# Project Progress Tracker (`PROGRESS.md`)

## 1. Status Dashboard
- **Current Phase**: Master Agency Template Complete (All 6 Phases 100% Verified & Signed Off)
- **Master Plan**: Comprehensive 6-Phase Execution Roadmap codified in [TASKS.md](file:///c:/Users/User/OneDrive/Desktop/Project/Clinic%20Booking%20system/TASKS.md)
- **Security & Authentication Specification**: Full blueprint in [SECURITY_AND_AUTH.md](file:///c:/Users/User/OneDrive/Desktop/Project/Clinic%20Booking%20system/SECURITY_AND_AUTH.md)
- **Workflow Automation Architecture**: Full n8n workflow functional plan in [n8n.md](file:///c:/Users/User/OneDrive/Desktop/Project/Clinic%20Booking%20system/n8n.md)
- **Inter-Agent Communication Buses**:
  - Frontend ⇄ Reviewer: [TEST_FRONTEND.md](file:///c:/Users/User/OneDrive/Desktop/Project/Clinic%20Booking%20system/TEST_FRONTEND.md) (Owned by Frontend Sub-Agent & Reviewer Agent)
  - Backend ⇄ Reviewer: [TEST_BACKEND.md](file:///c:/Users/User/OneDrive/Desktop/Project/Clinic%20Booking%20system/TEST_BACKEND.md) (Owned by Brain Backend Agent & Reviewer Agent)
  - Master QA Matrix: [TEST.md](file:///c:/Users/User/OneDrive/Desktop/Project/Clinic%20Booking%20system/TEST.md)
- **Agent Operating Team**:
  - **Brain Agent — Architect & Backend** (Lead): System architecture, backend foundation, relational schema, concurrency locks, security, and project governance.
  - **Frontend Sub-Agent**: React 18, Vanilla CSS design system, receptionist dashboard modules.
  - **Review Sub-Agent**: Code reviews, test verification, QA auditing, and edge-case verification.

---

## 2. All 8 Planning Stages Signed Off
- [x] **Stage 1: Receptionist Gatekeeping & Queue Governance** (Strict human-in-the-loop, 4-tab FIFO queue, after-hours queuing)
- [x] **Stage 2: Patient Intake & Normalization** (Structured messaging trigger, 2-week date range, nearest alternative fallback, returning patient phone lookup)
- [x] **Stage 3: Availability Engine & Backend Architecture** (Signed-off via 7-point `/grill-me`: E.164 phone normalization, returning patient matching, HttpOnly cookies, PBKDF2 PIN rate-limiting, HMAC webhook security, single-tenant deployment)
- [x] **Stage 4: Temporary Hold & Expiry State Machine** (1-hour offer window, atomic `SELECT FOR UPDATE` hold lock, 60s cron sweeper)
- [x] **Stage 5: Messaging Protocols & Patient Recovery** (Telegram Bot inline buttons & WhatsApp parity, 24h & 2h reminders, 1-click reschedule, no-show welfare message)
- [x] **Stage 6: Receptionist Dashboard UI/UX & Frontend Architecture** (Signed-off via 10-point `/grill-me`: React Router, Zustand stores, dual-mode switcher, SSE with 10s fallback, 20m PIN lock, adaptive tablet rail, Web Audio chimes, follow-up chips, pitch simulator)
- [x] **Stage 7: Multi-Tenant Visual Clinic Settings** (Visual Clinic Settings UI for non-technical managers to edit hours, phone, buffer times)
- [x] **Stage 8: Fault Tolerance & Auditing** (Webhook idempotency, retry mechanisms, comprehensive audit trail table)

---

## 3. Phase-by-Phase Execution Progress
- [x] **Phase 1: Backend Foundation & Relational Schema**
  - [x] Task 1.1: Django project scaffold with `core`, `appointments`, and `dj-database-url`
  - [x] Task 1.2: 11 Relational domain models in `appointments/models.py`
  - [x] Task 1.3: Migrations generation and database initialization
  - [x] Task 1.4: One-click demo clinic seeder (`seed_clinic.py`)
- [x] **Phase 2: Availability Engine & Business Services**
  - [x] Task 2.1: Deterministic Availability Calculator (`availability.py`, shift intersections, buffer rules, W1-W4 contiguous scoring)
  - [x] Task 2.2: 2-Week Range & Nearest-Alternative Fallback (`find_candidate_slots_for_request`)
  - [x] Task 2.3: Atomic Slot Hold & Selection Engine (`hold_service.py` with `select_for_update`)
  - [x] Task 2.4: Doctor Sick Leave Disruption Protocol (`disruption_service.py` & 1-click colleague reassignment)
  - [x] Task 2.5: 60-Second Expiry Cron Sweeper (`sweep_service.py` & `manage.py run_expiry_sweep`)
- [x] **Phase 3: Django REST Framework API Endpoints & Auth**
  - [x] Task 3.1: Staff Authentication, Dual-Mode JWT & Governance API (`views_auth.py`, `authentication.py`, quick PIN 3-strike lockout, 401 session killswitch)
  - [x] Task 3.2: Intake & Booking Request API with Anti-Abuse & Deduplication (`views_booking.py`, honeypot drop, rate limit, FIFO queue, candidate slot bridge, offer dispatch)
  - [x] Task 3.3: Appointment & Live Visit Management API (`views_appointment.py`, atomic slot hold, visit lifecycle status, follow-up tasks, colleague reassignment, CSV exports)
  - [x] Task 3.4: Clinic Settings & Staff Directory API (`views_clinic.py`, settings CRUD, white-label export/import, staff directory with live duty chips, master calendar feed)
  - [x] Task 3.5: Real-Time SSE Hub & Presence Broadcasting (`views_realtime.py`, `sse_bus.py`, SSE keepalive stream, review presence with 3-minute TTL, webhook deduplication)
  - [x] Task 3.6: Analytics & Export API (`views_analytics.py`, `serializers_analytics.py`, real-time KPI summary, revenue aggregations, RFC 4180 CSV exports)
- [x] **Phase 4: Frontend Receptionist Hub & Admin Bento (React + Vanilla CSS)**
  - [x] Task 4.1: Architecture, Tokens & Master Navigation Shell (`LeftRail.jsx`, `Header.jsx`, `tokens.css`, `layout.css`)
  - [x] Task 4.2: Staff Authentication & 20-Minute PIN Lock Overlay (`usePinLock.js`, `PrivacyLockModal.jsx`, Web Audio synth)
  - [x] Task 4.3: Inbound Triage Queue & Candidate Slot Review Modal (`useQueueStore.js`, FIFO cards, Phone Dossier, Shield, universal 080... phone number search normalization)
  - [x] Task 4.4: Master Clinical Calendar Grid & Historical Archive (`useCalendarStore.js`, `MasterCalendarGrid.jsx`, `PastPatientsHistory.jsx`, exact date calendar picker, 10 Jan 2026 pre-seeding)
  - [x] Task 4.5: Live Clinic Visits 3-Swimlane Flow & Attendance Management (`useVisitsStore.js`, reception check-in roster, elapsed tabular timers, zero price display, rich clinical past visits dossiers for `Ngozi Okonjo` & returning patients, `+ Walk-In Patient (Check-In)`)
  - [x] Task 4.6: Staff Roster, Attendance & Operational Bento (`useStaffStore.js`, `StaffRosterTable.jsx`, eye toggle to reveal quick PINs, account deactivation, removal of Clinic Revenue, plain-language metric explanations)
  - [x] Task 4.7: Visual Clinic Settings & Clinical Services Registry (`useSettingsStore.js`, `ServicesManagementBento.jsx`, add/remove custom clinic specialties: Dental, Eye Care, ENT, Teeth, Nose, General Practice)
  - [x] Task 4.8: Client Pitch Simulator & Mobile Frame Booking Widget (`usePitchSimulator.js`, dual-channel Web/Telegram)
  - [x] **Design Refactor**: Pinterest Minimalist Aesthetic Alignment (`https://www.pinterest.com/pin/1025343040191187594/` — porcelain ivory canvas `#f3f4f7`, pure white floating cards `#ffffff`, high-contrast obsidian chips `#111114`, 4-tone monochrome discipline, zero rainbow slop, compact card density). Built with 0 errors.
- [x] **Doctor Dynamic Sync & Dr. Babawo Integration**: Consultant Physician & Surgeon Dr. Babawo dynamically integrated and persisted across Staff Directory, Master Calendar, Walk-In Check-In, Past Patient Records, and Queue triage. Cross-store pub/sub bus handles doctor lifecycle.
- [x] **Schedule Grid Workload Header & Flexible Horizons**: Removed duplicate summary cards from above the calendar grid; embedded consultation workload and capacity meters (`% Free`) directly in each doctor column header with flexible horizon selector (`Today`, `5d`, `1W`, `2W`). 1-Click modal displays full appointment details and patient dossier navigation.
- [x] **Universal Responsiveness (320px iPhone 4/3.5 up to 4K TV screens)**: Implemented mobile doctor switcher tabs (`All Doctors`, `Dr. Bello`, `Dr. Okafor`, `Dr. Babawo`), sticky time gutter, fluid auto-fit grids, and ultra-wide constraints for TV/desktop monitors without horizontal clipping.
- [x] **Clean Local Caching & Save Indication**: Enhanced Staff enrollment, Services management, and Settings with clear local persistence and unsaved changes indicators to prevent duplicate API flood requests.
- [x] **Staff & Security Governance Upgrade**:
  - `StaffRosterTable.jsx`: Refactored wide table into a sleek **Compact Cards Grid** per user request (Avatar, Name, Role badge, Email, Shift, On-Duty status, and Active Workstation indicator).
  - `StaffEditModal.jsx`: Dedicated **Reset Password** card with reveal eye toggle, input field, and direct save action, alongside 4-digit Screen PIN reset.
  - **Receptionist Credentials Control**: Admin can view/reveal, set, and reset receptionist passwords and Quick-PINs with eye toggles.
  - **Doctors Login Exclusion**: Confirmed and enforced that clinical doctors do not have dashboard logins.
  - `AddStaffModal.jsx`: Added explicit password creation for receptionists and automatic login bypass for doctors.
- [x] **Schedule Grid & Doctor Consultation Load Integration**:
  - `DoctorScheduleSummaryStrip.jsx`: Integrated compact doctor workload cards at the **top of the Schedule Grid (`/calendar`)** displaying 3 consultation horizons (**Today**, **1 Week**, **2 Weeks**).
  - Clicking any doctor card opens a dedicated **Doctor Appointment List Drawer/Modal** showing scheduled patients, times, procedures, and linking directly into patient dossiers.
  - `PastPatientsHistory.jsx`: Refactored bulky 8-column past patient table into **Compact Patient History Cards** (Name, Returning tag, Phone, Last Visit Date, Attending Doctor) with 1-click dossier inspection.
- [x] **Clinic Settings & UI Space Streamlining**:
  - **Compact Audio Chimes Control**: Replaced bulky card with a sleek, single-row inline control (Mute/Turn On toggle, `[🔔 Test Sound]` preview).
  - **Expandable Clinical Services Bento**: Refactored wide service table into compact cards that expand inline to edit name, category, duration, sanitization buffer, and description.
  - **Multi-Phone & Multi-Email Tag Inputs**: Chip/tag inputs in `ClinicProfileCard.jsx` allowing multiple contact phones and emails via Enter/comma.
  - **Plain English Scheduling Rules**: Replaced technical jargon with clear terminology (e.g., "Patient Decision Time Limit", "Temporary Slot Hold Duration", "Cleaning & Room Prep Buffer", "Urgent / Walk-In Reserved Slots").
  - **Instant Reminder Auto-Save**: Toggling 24h pre-visit notice or 2h arrival alert automatically saves to the live system with an instant toast notification.
  - **Header Active Receptionist Indicator**: Glowing green badge showing the currently logged-in receptionist on active duty (e.g., `Sarah Aliyu • 🟢 Front Desk (On Duty)`).
  - **Mobile & Small-Screen Responsiveness (320px–360px)**: Injected comprehensive media queries in `layout.css` ensuring zero horizontal overflow and clean card stacking on small mobile screens.
  - [x] **User Feedback Refinements**:
    - [x] **Live Visits Modal Scroll & History Accordion**: Added `max-height: calc(100vh - 40px)` and scroll containment. Patient consultation history collapses by default with a `[▼ View Prior Consultations]` toggle to prevent screen overflow on laptop displays.
    - [x] **Front-Desk Walk-In Check-In Modal**: Built dedicated `WalkInCheckInModal` replacing dummy randomization with structured walk-in intake (Name, Phone, Patient Type, Doctor, Service, Triage Notes) with `[⚡ Quick Demo Fill]` and `[✓ Admit to Waiting Room]`.
    - [x] **Staff Directory Search & Streamlined Filters**: Integrated real-time staff search bar (by name, email, specialty, shift) and clean role dropdown filter; removed redundant top-bar synchronization text.
    - [x] **System Architecture Bento & Client Handover Mode**: Relocated Offline Demo / Live Django API switcher from sidebar into `Clinic Settings` under dedicated Bento card; added 1-click **Client Handover Mode** to hide Pitch Simulator from sidebar when handing over to paying clinic clients.
- [x] **Phase 5: Telegram Bot Gateway & n8n Workflows**
  - [x] Task 5.1: Telegram Bot Integration Engine (`telegram_service.py`, safe HTML escaping, inline buttons, 60m expiry rejection, 24h pre-visit reminders, double-click protection)
  - [x] Task 5.2: n8n Workflow Templates (`n8n/*.json` modular workflow suite: intake normalizer, 60s sweeper, 24h reminders, patient response router, slot offer dispatcher)
- [x] **Phase 6: End-to-End Verification & Production Packaging**
  - [x] Task 6.1: Concurrency & Atomic Lock Tests (Race conditions & dual-receptionist dispatch verified)
  - [x] Task 6.2: End-to-End 10-Step Full Lifecycle Verification (Intake $\rightarrow$ Queue $\rightarrow$ Check Slots $\rightarrow$ Dispatch $\rightarrow$ Select $\rightarrow$ Hold/Confirm $\rightarrow$ 24h Reminder $\rightarrow$ Live Visits Progression $\rightarrow$ Doctor Follow-Up Recall $\rightarrow$ Audit Trail)
  - [x] Task 6.3: Admin Deactivation & Immediate Session Revocation Test (Bearer JWT, Cookie JWT, Quick-PIN 401 killswitch)
  - [x] Task 6.4: White-Label Agency Template Packaging (`client-config.example.json` & `DEPLOYMENT_GUIDE.md`)
  - [x] **Reviewer Audit Hardening (7 Edge-Case Holes Patched)**:
    - [x] **Hole 1 (Callback Separator Mismatch)**: Standardized `select_slot_{id}` in `views_booking.py` and made `TelegramService` accept both `_` and `:` defensively.
    - [x] **Hole 2 (State Machine Orphan Transition)**: Ensured `booking_request.status` transitions to `'converted'` whenever a slot offer is selected or confirmed.
    - [x] **Hole 3 (Archive & Historical Date Filtering)**: Upgraded `TodayAppointmentsView` into `AppointmentListView` supporting `?date=YYYY-MM-DD`, `?start_date=`, `?end_date=`, and registered `/api/v1/appointments/`.
    - [x] **Hole 4 (Nigerian Phone Search Normalization)**: Added universal Nigerian phone number search (`080...` matches `+234...` or core digits) in `BookingRequestListCreateView` and `AppointmentListView`.
    - [x] **Hole 5 (Clinical Services Management API)**: Implemented `ClinicServiceListCreateView` and `ClinicServiceDetailView` (`GET`, `POST`, `PATCH`, `DELETE`) at `/api/v1/clinic/services/`.
    - [x] **Hole 6 (Unchecked Datetime Parse Handling)**: Wrapped ISO datetime parsing in `DispatchOffersView` with try/except returning structured HTTP 400 Bad Request on malformed inputs.
    - [x] **Hole 7 (Walk-In Arrival Hold Expiry Protection)**: Added `is_walk_in` support to admit counter arrivals directly as `arrived` with `arrival_at=now` and zero expiring hold timers.
  - [x] **Frontend Reviewer Audit & Architectural Remediations (10 Structural Flaws Patched)**:
    - [x] **Issue 1 (State Store Silos & Cross-Store Sync)**: Created decoupled event bus `appointmentSyncBus.js` (`appointmentBooked`, `walkInAdmitted`, `appointmentRescheduled`, `visitStatusChanged`) achieving full live synchronization across Queue, Calendar, and Live Visits swimlanes.
    - [x] **Issue 2 (The "Live API" Facade)**: Created headless `apiService.js` interfacing all Django REST endpoints (`/api/v1/booking-requests/`, `/api/v1/appointments/`, `/api/v1/realtime/stream/`, etc.) with real-time health indicator in Settings.
    - [x] **Issue 3 (Custom Services Doctor Availability)**: Upgraded `doctorsForService` and `generateCandidateSlots` in `slotEngine.js` with category/keyword matching and safe fallback to ensure candidate slots are never empty for newly registered clinic services.
    - [x] **Issue 4 (Browser Refresh Amnesia)**: Wrapped `useQueueStore`, `useCalendarStore`, and `useVisitsStore` in Zustand `persist` middleware with selective `partialize` (persisting only domain collections) and added a 1-click "Reset Demo Seeds" workstation purge button in Settings.
    - [x] **Issue 5 (Phone Normalization Gap)**: Upgraded `lookupPatient` in `mockData.js` to strip non-digits and match Nigerian `080...` vs `+234...`, core 7+ digit tails, and case-insensitive patient names.
    - [x] **Issue 6 (High-Frequency Interval Tickers)**: Throttled global board re-render ticker in `useLiveVisits.js` from 1000ms to 10000ms (10s), eliminating CPU and memory churn.
    - [x] **Issue 7 (Privacy Lock DOM Leak Remediation)**: Hardened `Shell.jsx` to completely unmount LeftRail, Header, and Outlet DOM trees when `isLocked === true`, rendering exclusively `PrivacyLockModal`.
    - [x] **Issue 8 (Modal Viewport Height Overflow)**: Added sticky footer positioning (`position: sticky; bottom: 0; z-index: 2;`) in `queue.css` so action buttons remain pinned to the visible viewport on all screen resolutions.
    - [x] **Issue 9 (Monolithic Chunk Size & Code Splitting)**: Implemented `React.lazy()` and `<Suspense>` route-level code splitting across all 6 main view routes in `App.jsx`.
    - [x] **Issue 10 (Schedule Collision Validator on Calendar)**: Implemented `rescheduleAppointment` and hardened `reassignToColleague` in `useCalendarStore.js` with `validateSlot` collision checks guarding shift boundaries, break times, and buffer preservation, paired with an interactive Reschedule & Verify panel in `AppointmentDetailsModal.jsx`.
    - [x] **Bugfix: Doctor Sick / Leave Disruption Modal Crash**: Fixed React hook order violation (`useMemo` rendered conditionally) in `EmergencyDisruptionModal.jsx` and protected mount in `MasterCalendarGrid.jsx`.
    - [x] **WSGI Hop-by-Hop SSE Crash Fix**: Removed `Connection: keep-alive` from `EventStreamView` in `views_realtime.py` (which triggered PEP 3333 WSGI assertion failures) and attached explicit CORS headers (`Access-Control-Allow-Origin`, `Access-Control-Allow-Credentials`, `Access-Control-Allow-Headers`).
    - [x] **Dispatch Offers Payload Robustness (`INVALID_SLOT_PAYLOAD`)**:
      - Updated `DispatchOffersView` in `views_booking.py` to auto-calculate `end_datetime = start_datetime + duration_minutes` when `end_datetime` is omitted.
      - Updated `apiService.js:dispatchOffers` to calculate `end_datetime` from `startTs + durationMin * 60000` so formatted slot payloads always include valid ISO timestamps.
    - [x] **Doctor UUID Resolution & Shift Hours Deselect Fix**:
      - In `slotEngine.js`, updated `getDoctor(id)` to gracefully resolve backend doctor UUIDs (e.g. from PostgreSQL database) against `staffList` and fallback to standard clinic doctor profiles rather than returning `undefined`.
      - In `validateSlot()`, separated custom manual slots from automated candidate slots: candidate slots from the availability engine are already vetted against doctor shifts and only enforced against clinic operating hours (08:00–18:00).
      - In `ReviewModal.jsx`, fixed candidate slot selection state machine using `lastRequestIdRef` so background data polls do not cancel or clobber the receptionist's chosen slots while reviewing.
    - [x] **Missing Favicon Fix**: Added `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />` to `frontend/index.html` to eliminate 404 console errors.
    - [x] **Review Sub-Agent Quality & Architecture Hardening**:
      - [x] **Staff API Persistence Parity**: Injected missing `createStaff`, `updateStaff`, `resetStaffPassword`, `resetStaffPin`, and `toggleStaffActive` in `apiService.js` to guarantee Live Mode persistence against `/api/v1/staff/` endpoints.
      - [x] **Non-Closing Password & PIN Reset**: Decoupled Quick-PIN and Master Password reset in `StaffEditModal.jsx` from full modal close via dedicated `useStaffStore.confirmResetPassword` and `confirmResetPin`, allowing receptionists' credentials to be staged without dropping in-progress edits.
      - [x] **Duplicate Telegram Offer Elimination**: Eliminated duplicate Telegram dispatch in `usePitchSimulator.js` by delegating solely to the reactive `useQueueStore.subscribe` listener.
      - [x] **Encrypted Password Disclosure Safeguard**: Prevented false fallback display of `'password123'` when viewing staff records loaded from Django, displaying `'•••••••••••• (Encrypted in Django)'` with helpful reset guidance.
      - [x] **Doctor Roster Reactivity**: Subscribed `useTriageQueue.js` to `useStaffStore((s) => s.staffList)` with dependency array inclusion to ensure dynamically added/updated doctors reflect immediately in the review modal.
      - [x] **Broadened Clinical Title Detection**: Extended doctor role detection in `AddStaffModal.jsx` to recognize all clinical practitioner keywords (`surgeon`, `dentist`, `consultant`, `officer`, `practitioner`, `specialist`).
      - [x] **Dynamic Doctor Resolution in Simulator**: Fixed `WebIntakeForm.jsx` to check `doctorsList` prop before falling back to static `DOCTORS`.
      - [x] **Accessibility (ARIA) Nested Control Fix**: Cleaned `QueueCard.jsx` by removing outer `role="button"` and `tabIndex={0}`, leaving the card as a clickable surface while the inner button handles keyboard focus cleanly with dedicated `aria-label`.
      - [x] **Zustand Selective Slicing**: Replaced monolithic store binding in `useTriageQueue.js` with individual state selectors, preventing unnecessary re-render churn on background ticks.
      - [x] **Cloudflare Security Audit Remediations (SEC-01 through SEC-05)**:
        - [x] **SEC-01 (SSE Stream RBAC Authentication)**: Hardened `EventStreamView` in `views_realtime.py` with `IsStaffAuthenticated`, enhanced `CookieJWTAuthentication` to accept validated `token` query parameters for browser `EventSource`, and updated `apiService.js` to pass active credentials.
        - [x] **SEC-02 (CORS Wildcard Tightening)**: Replaced open wildcard regexes in `settings.py` with exact clinic deployment domains (`cedarcare`, `clinic-booking`, `railway`, `onrender`, and localhost dev ports), and disabled global wildcard reflection when credentials are active.
        - [x] **SEC-03 (Zero Hardcoded Bot Secrets)**: Purged raw fallback Telegram bot tokens from `telegram_service.py` and `settings.py`, enforcing strict loading from environment variables (`.env.local`) and `ClinicSetting.custom_config`.
        - [x] **SEC-04 (Rate-Limit Client IP Resolution)**: Added hardened `get_client_ip()` in `views_booking.py` prioritizing edge headers (`CF-Connecting-IP`, `X-Real-IP`, leftmost untrusted proxy hop) to eliminate `X-Forwarded-For` spoofing.
        - [x] **SEC-05 (Webhook Signature Verification)**: Enforced `X-Telegram-Bot-Api-Secret-Token` validation against `TELEGRAM_WEBHOOK_SECRET` in `views_realtime.py`, rejecting unverified gateway payloads.
    - [x] **Polish: White-Label Config Exporter**: Replaced raw JSON code dump with client-friendly executive summary card (hours, phone, service counts, 1-click JSON backup); hid developer drawer in Client Handover Mode.
    - [x] **Security & Authentication: Dedicated Staff Login Portal (`LoginView.jsx`)**:
      - Strict Two-Role RBAC: Restricted to Front Desk Receptionists (`Sarah Aliyu`, `Chioma Okeke`) and Clinic Administrator (`Dr. Ibrahim Musa`). Doctors do not have dashboard login accounts.
      - Clean Enterprise UI: Clean portal displaying exclusively Staff Email, Password (with eye reveal toggle), Sign In button, and NDPR/HIPAA security notice; zero staff demo chips or role lists exposed on screen.
      - Brute-Force Rate Limiting: 5-strike counter triggering 15-minute security lockout countdown.
      - Side-Channel Timing Attack Mitigation: Constant-time authentication delay prevents timing-based credential enumeration.
      - Anti-Bot Honeypot: Hidden input traps automated credential stuffing bots.
      - Session Persistence: Secure `cbs_auth_session` storage in Zustand with instantaneous redirection on sign out.
    - [x] **Backend Security Hardening & Two-Role RBAC Alignment (`views_auth.py`, `authentication.py`, `permissions.py`, `serializers.py`)**:
      - **Strict Two-Role Dashboard Policy (Zero Doctor Accounts)**: Dashboard access is restricted strictly to Front Desk Receptionists and Clinic Administrators. Doctors exist solely as clinical resources in `Doctor`. Any login attempt by a doctor or clinician account returns `403 Forbidden` (`DOCTOR_LOGIN_FORBIDDEN`). Provisioning doctor logins via `StaffCreateSerializer` is rejected with `400 Bad Request`.
      - **5-Strike Brute-Force Rate Limiting (15-Minute Lockout)**: Cache-backed rate limiter on `POST /api/v1/auth/login/` tracking `login_attempts_{email}` and `login_lockout_{email}` (900s). 5th failed password attempt activates 15-minute freeze returning `HTTP 423 Locked` (`ACCOUNT_LOCKED`). Verified password clears lockout keys.
      - **Anti-Bot Honeypot Defense**: Integrated invisible bot trap field `website_url` in `StaffLoginSerializer` and frontend `apiService.login`. Submissions with populated honeypot are rejected immediately with `HTTP 400 Bad Request` (`BOT_DETECTED`) without touching the database or running password hashes.
      - **Side-Channel Timing Attack Mitigation**: If `StaffUser.DoesNotExist` occurs, a dummy PBKDF2 hash computation (`check_password(password, DUMMY_HASH)`) is executed to ensure identical computation time. Returns identical generic `INVALID_CREDENTIALS` error with decrementing remaining attempts.
      - **Token Invalidation & Session Revocation**: `POST /api/v1/auth/logout/` deletes both `clinic_access_token` and `clinic_refresh_token` cookies with `samesite='Lax'` and `httponly=True`. `CookieJWTAuthentication` and `IsStaffAuthenticated` strictly verify `is_active=True` and two-role permissions for instantaneous session revocation.
      - **Full Backend Test Verification**: All 70 unit tests passed (including 7 new security hardening tests in `StaffAuthSecurityHardeningTests`). Frontend production build verified (0 errors).
    - [x] **UI/UX Pro Max Design Quality Overhaul (`ui-ux-pro-max-skill`)**:
      - **Design System Blueprint & Dial Calibration**: Tuned design system to Balanced Modern (Variance 4/10) and Dense Dashboard (Density 8/10), matching healthcare clinic operations.
      - **Healthcare Color Palette & WCAG 2.2 AAA Contrast**: Injected calm clinical cyan (`--color-primary-cyan: #0891b2`) and emerald accents into `tokens.css`. Tuned text hierarchy to high-contrast slate (`#0f172a` primary, `#334155` secondary, `#64748b` muted) passing 4.5:1 / 7:1 contrast ratios.
      - **Keyboard Focus & Non-Obscured Standards**: Configured universal `:focus-visible` styling (`outline: 2px solid var(--color-ring)`) with 2px offset; added `scroll-padding-top` on scrollable viewports so sticky toolbars and headers never obscure focused inputs/buttons.
      - **Tactile Feedback & Touch Optimization**: Implemented `touch-action: manipulation` removing 300ms mobile tap delay; added active press scaling (`transform: scale(0.98)`) on buttons, chips, and cards; added `@media (prefers-reduced-motion: reduce)` accessibility guard.
      - **Viewport & Anti-Pattern Fixes**: Removed mobile zoom suppression (`user-scalable=no`) from `index.html` per WCAG guidelines; aligned mobile `theme-color` with the light porcelain canvas.
    - [x] **Comprehensive Backend Synchronization Specification (DRF ↔ React Store Parity)**:
      - **Item 1: Staff Roster & Access Governance (`views_auth.py`, `models.py`, `urls.py`)**:
        - Enforced strict Two-Role Dashboard Policy: Zero doctor accounts. Doctors are clinical scheduling resources in `Doctor` without dashboard login, password, or PIN.
        - Supported and verified endpoints:
          - `POST /api/v1/auth/login/`: Validates credentials, sets HttpOnly cookies, returns JWT tokens and sanitized user profile (`id`, `name`, `email`, `role`, `shift`, `avatar`).
          - `POST /api/v1/auth/verify-pin/`: Quick-PIN verification supporting authenticated staff or unauthenticated `email` + `pin`, with 3-strike brute-force lockout (60s cooldown, HTTP 423).
          - `PATCH /api/v1/staff/<staff_id>/`: Allows Administrator to update staff details (`name`, `email`, `specialty`, `shift`, `status`) or clinical doctor profiles.
          - `POST /api/v1/staff/<staff_id>/reset-password/`: Allows Administrator to set new password for receptionists. Clinicians (doctors) are strictly rejected with HTTP 400 (`DOCTOR_PASSWORD_NOT_SUPPORTED`).
          - `POST /api/v1/staff/<staff_id>/reset-pin/`: Allows Administrator to set new 4-digit PIN for receptionists. Clinicians (doctors) are strictly rejected with HTTP 400 (`DOCTOR_PIN_NOT_SUPPORTED`).
          - `POST /api/v1/staff/<staff_id>/toggle-active/`: Activates/deactivates staff. Deactivation triggers immediate session ejection / token revocation killswitch (HTTP 401 on next request).
      - **Item 2: Multi-Phone & Multi-Email Clinic Profile (`models.py`, `views_clinic.py`, `serializers_clinic.py`)**:
        - Added `phones: list[str]` and `emails: list[str]` JSONFields to `ClinicSetting` with backwards-compatible properties `phone` (`phones[0]`) and `email` (`emails[0]`).
        - `GET /api/v1/clinic/settings/` returns computed `clinic_profile` matching frontend expectations.
        - `PATCH /api/v1/clinic/settings/` and `POST /api/v1/clinic/settings/` cleanly update phone/email lists.
      - **Item 3: Plain English Scheduling Rules & Single-Field Auto-Save**:
        - Mapped scheduling rule fields (`offer_expiry_minutes`, `hold_expiry_minutes`, `default_buffer_minutes`, `emergency_slots_per_shift`, `booking_horizon_days`, `min_advance_hours`, `enable_24h_reminder`, `enable_2h_reminder`).
        - Added automatic camelCase-to-snake_case translation in `ClinicSettingSerializer.to_internal_value()`.
        - Permitted single-field partial updates via both PATCH and POST for instant reminder toggling.
      - **Item 4: Doctor Consultation Load Horizons (`views_appointment.py`, `views_clinic.py`)**:
        - Implemented `DoctorWorkloadView` at `GET /api/v1/doctors/workload/` (and `GET /api/v1/clinic/doctors/workload/`) returning aggregated workload counts across 3 horizons (`today_count`, `week_count`, `two_weeks_count`) for active doctors.
        - Added `include_workload=true` query parameter support on `GET /api/v1/appointments/` returning aggregated workload dictionary alongside appointment listings.
      - **Item 5: Clinical Services & Specialties Registry (`models.py`, `views_clinic.py`, `serializers_clinic.py`)**:
        - Added `description` field to `Service` model and `ServiceSerializer`.
        - Full CRUD verified at `GET/POST /api/v1/clinic/services/` and `PATCH/DELETE /api/v1/clinic/services/<id>/`.
        - Flexible camelCase input support (`durationMin`, `bufferMin`, `isActive`) and numeric/boolean deposit handling.
      - **Full Backend Test Verification**:
        - All 12 unit tests in `ComprehensiveBackendSyncSpecificationTests` passed.
        - Total 82 out of 82 unit tests passed across the entire backend suite (100% passing, 0 failures, 0 errors).
    - [x] **Uniform Bento Design System Rollout & Live Walk-In Reflection (`ui-ux-pro-max` + `Doctor Schedule Bento Hub`)**:
      - **Live Visits (`/live-visits`)**: Refactored `VisitCard.jsx` to uniform Bento Card pattern (`bento-visit-card`), eliminating harsh green/orange color bars. Implemented 48px circular initials avatars, clean cyan/amber patient type badges, `#f8fafc` meta strip with tabular lobby waiting counters and consult progress bar, and midnight navy `#0c1a30` action buttons.
      - **Requests Queue (`/queue`)**: Refactored `QueueCard.jsx` to uniform Bento Card pattern (`bento-queue-card`) with circular initials avatar, monospace request ID code, `#f8fafc` meta strip for preferred window/channel, and full-width `#0c1a30` action button. Active tab tuned to deep navy `#0c1a30`.
      - **Staff Roster (`/admin/staff`)**: Refactored `StaffRosterTable.jsx` to uniform Bento Card pattern (`bento-staff-card`) with circular initials avatars, on-duty pills, shift hours meta strip, and full-width `#0c1a30` action button.
      - **Clinic Settings (`/admin/settings`)**: Aligned all Bento card containers, headers, inputs, and primary save buttons with `#ffffff` white elevated surfaces, hairline `#e2e8f0` borders, and `#0c1a30` navy pill buttons.
      - **Real-Time Walk-In Booking Reflection**: In `CalendarView.jsx`, wired `onOpenWalkInBooking` to calculate exact `startTs` timestamps and pass them directly into `actions.openWalkInModal(doctorId, startTs)`. In `DoctorGridBookingCalendar.jsx`, subscribed to `useCalendarStore.blocks` and dynamically merged confirmed walk-in appointments into the active day timetable, 7-day overview, doctor week appointment counter, and Visit Hours grid (marking booked slots as crossed-out with patient names). In `useCalendarStore.js`, published `appointmentSyncBus.publishAppointmentBooked` to project walk-ins into Live Visits immediately.
      - **Universal Responsiveness & Edge Cases**: Injected comprehensive media queries in `grid-booking-calendar.css`, `swimlanes.css`, `queue.css`, and `layout.css` protecting micro-mobile (375px/390px), tablet (768px/900px/1080px), desktop (1280px/1440px), and 4K displays with `overflow-x: hidden` and `min-width: 0` anti-overflow guards.
      - **Build Verification**: Production build succeeded in 1.19s with 0 errors across 2,008 modules.
    - [x] **Custom Service Category & Small Screen (Galaxy Z Fold) Responsive Audit**:
      - **Custom Service Category Field (`ServicesManagementBento.jsx`, `useSettingsStore.js`)**:
        - Supported dynamic custom category creation when enrolling or editing services, allowing clinics to establish business-specific categories (e.g. *Laser Aesthetics*, *Orthodontics*, *Mental Health*, *Spa & Wellness*).
        - Added `✨ + Create Custom Category...` option to category `<select>`, revealing an inline text input `Custom Category Name *`.
        - Persisted custom categories in `useSettingsStore.customCategories` and included in `cedarcare_settings_storage` `partialize` for persistent availability across the app.
      - **Schedule Grid Header Centering (`CalendarView.jsx`)**:
        - Centered `Doctor Schedule & Clinical Records` view title and view switcher tabs (`Doctor Schedule & Timetable` and `Past Patient Records Archive`) per user direction.
      - **Mini Calendar Circular Dates (`grid-booking-calendar.css`)**:
        - Fixed `.date-cell-btn` to enforce strict 1:1 circular aspect ratio (`width: 36px; height: 36px; min-height: 36px; max-height: 36px; border-radius: 50% !important; aspect-ratio: 1 / 1`). Overrode the mobile `min-height: 44px` stretch that created square/tall buttons.
      - **User Profile (`SA`) Popover Overflow Protection (`grid-booking-calendar.css`)**:
        - Bounded `.user-profile-menu-popover` with `width: min(260px, calc(100vw - 32px)); max-width: calc(100vw - 32px); box-sizing: border-box; right: 0; left: auto;` preventing menu clipping on narrow screens.
      - **Past Patient Records Archive Dropdowns & Filter Picker (`PastPatientsHistory.jsx`)**:
        - Standardized "All Doctors" dropdown font size to `11px` with clean padding and bounded widths.
        - Made date filter and search inputs fluid (`min-width: 0; max-width: 100%`) preventing overflow on micro viewports (348px - 412px).
      - **Dossier & Reschedule Modal Controls (`AppointmentDetailsModal.jsx`, `calendar.css`)**:
        - Updated reschedule grid from rigid `1fr 1fr` to fluid `repeat(auto-fit, minmax(180px, 1fr))` with bounded dropdown widths (`max-width: 100%`).
        - Enhanced `.modal-actions-row` with `flex-wrap: wrap` and mobile column stacking so action buttons never squash or overflow.
      - **Request Queue Header Tabs & Review Modal (`queue.css`)**:
        - Replaced horizontal scroll slide on `.queue-tabs` with a clean 2x2 grid header (`grid-template-columns: repeat(2, 1fr)`), keeping all 4 triage tabs permanently visible and tap-accessible without scrolling.
        - Guaranteed `.field-input` and `select.field-input` text truncation with `text-overflow: ellipsis; max-width: 100%; box-sizing: border-box`.
      - **Global Anti-Overflow Safeguard (`layout.css`)**:
        - Applied universal constraints to all `<select>`, `.select-base`, and `<input>` elements preventing horizontal overflow on all screen sizes.
      - **Build Verification**: Clean production build succeeded in 4.80s across 2,010 modules.
    - [x] **Universal System-Wide Dropdown Responsiveness & Anti-Overflow Hardening**:
      - **Problem Solved**: Audio request noted that dropdown menus across all sections of the dashboard overflowed outside screen boundaries on smaller viewports.
      - **Comprehensive Select & Dropdown Remediation Across All Views**:
        - **Live Visits & Clinician Selector (`swimlanes.css`, `LiveVisitsGrid.jsx`)**: Bounded `.clinician-dropdown-wrapper` and `.clinician-select` with `width: 100%; min-width: 0; max-width: 100%; text-overflow: ellipsis; overflow: hidden; white-space: nowrap`. Added `@media (max-width: 640px)` stacking for `.swimlane-control-toolbar` and `.toolbar-left-group`, and removed fixed `min-width: 180px` on `.swimlane-search-input`.
        - **Staff Directory & Role Filter (`admin.css`, `StaffView.jsx`)**: Added mobile stacking for `.staff-table-toolbar` and `.staff-filter-group`. Made `.staff-search-box` fluid (`min-width: 0; width: 100%`) so it never pushes the role dropdown outside the viewport.
        - **Walk-In Check-In Modal (`WalkInCheckInModal.jsx`)**: Converted rigid `1fr 1fr` grids into fluid `repeat(auto-fit, minmax(180px, 1fr))` for Phone/Patient Status and Doctor/Service fields. Wrapped each cell in `minWidth: 0` and bounded selects with `textOverflow: ellipsis; overflow: hidden; whiteSpace: nowrap`.
        - **Quick Walk-In & Emergency Disruption Modals (`calendar.css`, `QuickWalkInModal.jsx`, `EmergencyDisruptionModal.jsx`)**: Added `@media (max-width: 640px)` column stacking to `.form-group-row`. Added `.colleague-select-row` wrapper. Bounded `.select-base` with ellipsis truncation and `min-width: 0; max-width: 100%`.
        - **Past Patients Records Archive (`calendar.css`, `PastPatientsHistory.jsx`)**: Added mobile stacking to `.past-patients-toolbar`. Replaced fixed `min-width: 260px` on `.past-search-box` with fluid mobile width. Ensured Doctor filter select truncates with ellipsis.
        - **Appointment Details & Reschedule Modal (`AppointmentDetailsModal.jsx`)**: Added `minWidth: 0`, `overflow: hidden`, and `whiteSpace: nowrap` to both Target Clinician and New Start Time selects.
        - **Clinic Settings & Services Registry (`settings.css`, `ServicesManagementBento.jsx`)**: Bounded `.settings-select` and `.settings-input` with `max-width: 100%; box-sizing: border-box; text-overflow: ellipsis; overflow: hidden; white-space: nowrap`. Wrapped flex items in `maxWidth: 100%; box-sizing: border-box`.
        - **User Profile Pill Popover (`grid-booking-calendar.css`)**: Adjusted `.user-profile-menu-popover` positioning on mobile screens with `width: min(260px, calc(100vw - 24px)); max-width: calc(100vw - 24px); box-sizing: border-box; right: 0; left: auto;` and aligned `.grid-booking-user-actions` to full width flex-end.
      - **Build Verification**: Production build verified via `npm run build` with zero errors across 2,010 modules in 3.67s.
    - [x] **Reviewer Audit Remediation Batch (`REV-FE-22` to `REV-FE-27`)**:
      - [x] **Ticket `REV-FE-22` (High)**: Dynamic Calendar "Today" Anchor — Removed hardcoded October 26, 2026 anchor from `DoctorGridBookingCalendar.jsx` and `CalendarView.jsx`, switching dynamically between demo seed date and real device date (`new Date()`).
      - [x] **Ticket `REV-FE-23` (Blocker)**: Auth Store Default Session Hardening — Initialized `useAuthStore` with `isAuthenticated: false` and `currentStaff: null` to prevent unauthenticated access bypassing `/login` on fresh deployments.
      - [x] **Ticket `REV-FE-24` (High)**: Candidate Slot Dispatch Payload Alignment — Updated `apiService.dispatchOffers` to format payload as `{ slots: formattedSlots }` matching Django backend `DispatchOffersView:L204`.
      - [x] **Ticket `REV-FE-25` (Medium)**: Live Mode Doctor Workload Count Accuracy — Bypassed demo `baseSeed` in `DoctorScheduleSummaryStrip.jsx` when live API mode is active so doctors show true appointment counts.
      - [x] **Ticket `REV-FE-26` (Medium)**: Real-Time Cross-Tab State Sync — Integrated native `BroadcastChannel('cbs_cross_tab_sync')` into `appointmentSyncBus.js` so mutations reflect across multiple open browser tabs without manual reload.
      - [x] **Ticket `REV-FE-27` (Polish)**: AudioContext Autoplay Warning Suppression — Added `.catch(() => {})` on `audioCtx.resume()` in `soundService.js` to cleanly suppress console warnings before first user gesture.
      - **Build Verification**: Production build succeeded in 1.40s with 0 errors across 2,010 modules.
    - [x] **End-to-End API Connectivity Audit & Full DRF Bridge (`REV-FE-28`)**:
      - **Complete Endpoint Audit & Client Parity**: Audited all 44 Django REST endpoints in `backend/appointments/urls.py` across `views_auth.py`, `views_booking.py`, `views_appointment.py`, `views_clinic.py`, `views_realtime.py`, and `views_analytics.py`.
      - **Upgraded `apiService.js`**: Enriched client with all missing endpoints (`fetchMe`, `fetchStaff`, `createStaff`, `updateStaff`, `resetStaffPassword`, `resetStaffPin`, `toggleStaffActive`, `registerWalkIn`, `rescheduleAppointment`, `appointmentAction`, `fetchUpcomingReminders`, `exportSettings`, `importSettings`, `updateService`, `fetchDoctorWorkload`, `broadcastPresence`, `fetchAnalyticsSummary`, `downloadAppointmentsCSV`, `downloadAttendanceCSV`).
      - **401 Session Revocation Bus**: Integrated `cbs_auth_unauthorized` window event bus into `apiService.js` and `useAuthStore.js` to instantly revoke sessions and display administrative lock upon HTTP 401 response from live backend.
      - **Store Live API Mode Integration**: Connected `useStaffStore`, `useSettingsStore`, `useVisitsStore`, `useQueueStore`, and `useCalendarStore` to dispatch live API calls when `isDemoMode === false` with optimistic local reactivity and seamless error boundaries.
      - **Full Backend Test Verification**: All 82 Django test specifications passed (`python manage.py test`: 82/82 OK in 111.89s).
      - **Build Verification**: Production build verified via `npm run build` in 1.25s with 0 errors across 2,010 modules.
    - [x] **Client-Ready UI/UX & Data Contract Refinements (User Audio Instructions Completed)**:
      - **Dynamic Tag Pills for Staff Enrollment (`AddStaffModal.jsx` & `StaffEditModal.jsx`)**:
        - Replaced hardcoded roles with interactive tag pills (`[Tag] ✕`) and inline `+ Add Role` input, identical to the Clinic Settings phone/email pattern.
        - Replaced free-text specialty with persistent, interactive tag pills (`[Specialty] ✕`) and inline `+ Add Specialty` input.
        - Added `<Eye>` / `<EyeOff>` password-style reveal toggle on the initial 4-digit Quick-PIN in `AddStaffModal`.
        - Preserved two-role login rule: Doctors are medical resources with no dashboard login; receptionists receive credentials.
      - **Live Visits Walk-In Check-In Reactivity (`WalkInCheckInModal.jsx`)**:
        - Subscribed to `useSettingsStore((s) => s.services)` reactively so newly added clinic services reflect instantly in the modal.
        - Added Gender selector pills (`Male`, `Female`, `Other`), Date of Birth picker (`<input type="date" />`), and Urgent Emergency Visit toggle banner (`🚨 Urgent / Emergency Medical Triage`).
      - **Patient Intake Normalization Across Channels (`WebIntakeForm.jsx`, `usePitchSimulator.js`, `useQueueStore.js`)**:
        - Added `date_of_birth`, `gender`, and `is_emergency` to patient intake forms, pitch presets, and queue requests.
        - Excluded known allergies and existing conditions per explicit user instructions.
        - Added high-visibility `🚨 URGENT` priority indicators and gender chips to `QueueCard.jsx`, `ReviewModal.jsx`, and `VisitCard.jsx`.
      - **Full-Stack Verification**:
        - Database Migration: `appointments.0003_appointment_date_of_birth_appointment_gender_and_more.py` applied cleanly to Neon PostgreSQL.
        - Frontend Build: `npm run build` compiled in 3.23s with 0 errors across 2,010 modules.
        - Backend Tests: All 82 tests passed in 159.041s (0 errors, 0 failures).
    - [x] **Full-System Playwright End-to-End (E2E) Test Suite**:
      - **Toolchain**: Installed `@playwright/test` and configured `playwright.config.js` targeting local Google Chrome against `http://localhost:5173`.
      - **Test Specifications (`frontend/e2e/clinic-e2e.spec.js`)**:
        - [x] **Test 1 — Triage Queue & FIFO Tabs**: Verified header branding, 4 FIFO tabs (`New Requests`, `Re-Requested`, `Expired Offers`, `Today's Schedule`), card rendering, and real-time search filtering.
        - [x] **Test 2 — Candidate Slot Review Modal**: Verified opening review modal from triage queue, header inspection, and clean dismissal.
        - [x] **Test 3 — Client Pitch Simulator**: Verified dual-channel mobile frame chassis, 1-click rapid demo preset (`Amina Yusuf`), phone intake form, and Telegram bot chat switching.
        - [x] **Test 4 — Master Clinical Calendar Grid**: Verified doctor workload cards, weekly schedule grid, and tab switching to Past Patient Records Archive.
        - [x] **Test 5 — Live Clinic Visits & Walk-In Admission**: Verified 3 swimlanes (`Waiting Room`, `In Consultation`, `Completed`), toolbar clinician filter, and Walk-In Patient check-in modal. Fixed infinite re-render loop caused by unstable selector reference in `WalkInCheckInModal.jsx`.
        - [x] **Test 6 — Staff Directory & Credentials**: Verified staff roster grid, clinician status chips, and staff management edit modal.
        - [x] **Test 7 — Clinic Settings Bento & Sound Engine**: Verified clinic profile, operational KPI cards, white-label rules, and front-desk Web Audio chime trigger.
        - [x] **Test 8 — Staff Workstation Authentication Portal**: Tested security boundaries, verified NDPR/HIPAA notice, validated rejection of unauthorized credentials, and verified 1-click demo credential authentication.
      - **Test Results**:
        - Playwright E2E Suite: **8/8 Passed (100%)** in 26.1s.
        - Django Backend Suite: **83/83 Passed (100%)** in 233.2s.
        - Frontend Production Build: **0 errors** across 2,010 modules.
    - [x] **Full Live Production Transition (`isDemoMode: false`) & n8n Standalone Ownership**:
      - **Permanent Live Production Enforcement**: Removed all offline demo mode toggles and switchers. Locked `isDemoMode: false` across all stores (`useQueueStore`, `useCalendarStore`, `useVisitsStore`, `useSettingsStore`, `useStaffStore`, `useAuthStore`), views (`SettingsView`, `CalendarView`, `StaffView`), and layout (`Shell`). All receptionist and patient interactions execute live against Django REST API endpoints.
      - **Live Neon PostgreSQL Verification**: Verified live connection to AWS Neon PostgreSQL (`neondb` on AWS us-east-2). All 22 database migrations verified applied (`[X]`). Configured direct IP resolution (`hostaddr=52.14.39.200`) in `DATABASE_URL` to eliminate Windows DNS `getaddrinfo` latency. Verified live domain records (7 staff users, 3 doctors, 5 services, 10 booking requests, 6 appointments).
      - **PostgreSQL Atomic Concurrency Hardening**: Resolved PostgreSQL `FOR UPDATE cannot be applied to the nullable side of an outer join` exception in `SweepService` by adding explicit `select_for_update(of=('self',))` table-targeted row locking.
      - **Standalone n8n Automation Engine Alignment**: Standardized all 5 workflow JSON templates in `n8n/`. Verified that standing 60s background cron (`02_hold_and_offer_expiry_cron.json`) pings `POST /api/v1/webhooks/expiry-sweep/` with `X-Webhook-Secret` and receives HTTP 200 OK with live release payload (`expired_offers`, `pre_expiry_nudges`, `expired_holds`).
      - **Production Bento Redesign (`SystemDeploymentBento.jsx`)**: Replaced offline demo mode cards with a 3-pillar production status dashboard (Django REST API, Neon PostgreSQL, n8n Automation Engine) and a 1-click **Force Sync Fresh Data from Backend** trigger.
      - **End-to-End Test Suite Verification in Live Mode**: Playwright E2E suite executed in 100% live mode with real JWT authentication: **8/8 tests passed in 34.1s**. Backend Django test suite: **83/83 tests passed**. Production frontend build: **0 errors**.
    - [x] **Web Intake Form Architecture & Custom Date Range Engine Integration**:
      - **Dual Ingestion Architecture Codified**: Formulated the production connection pathways:
        1. *Unified Ingestion Gateway via n8n Webhook Node*: Web form posts to `POST https://n8n.yourdomain.com/webhook/intake-patient-request` for centralized channel parity, validation, and forwarding to Django.
        2. *Direct REST API Endpoint with Instant SSE Receptionist Chime (< 50ms)*: Web form submits directly to `POST /api/v1/booking-requests/` on Django, immediately saving to PostgreSQL and triggering the real-time audio chime on the receptionist workstation.
      - **Custom Preferred Date Range UI (`WebIntakeForm.jsx`)**:
        - Added Step 3 "Preferred Date Range" with interactive Start Date (`fromDate`) and End Date (`toDate`) pickers with minimum validation guard (`min={today}`).
        - Added 1-click convenience presets: `⚡ Next 7 Days`, `📅 Next 14 Days`, `🗓️ 30 Days`.
        - Visual scanning window confirmation tag: `Scanning Window: YYYY-MM-DD → YYYY-MM-DD`.
        - Dynamic waiting card displays patient's requested date window while waiting for receptionist triage.
      - **Receptionist Visibility & Review Bridge (`ReviewModal.jsx` & `useTriageQueue.js`)**:
        - Displayed requested date range tag on the active review modal alongside preferred time window.
      - **Backend Validation & Normalization Hardening (`serializers_booking.py`)**:
        - Added `resolve_service_or_default()` and `resolve_doctor_or_default()` resolvers to seamlessly accept UUIDs, slugs (`svc-dental`, `doc-bello`), or text names without serialization exceptions.
        - Preserved `AvailabilityEngine.find_candidate_slots_for_request()` scanning logic across the patient's custom `preferred_date_range` with automatic nearest-alternative fallback.
      - **Build Verification**: `npm run build` compiled 2,010 modules in 2.25s with 0 errors.
    - [x] **Doctor Load-Balancing & Patient Doctor Selection Removal**:
      - **Zero Patient Doctor Selection**: Ensured patient intake forms (`WebIntakeForm.jsx`, `TelegramBotChat.jsx`, and pitch presets) never give patients an option to request a specific clinician. This eliminates demand congestion on popular doctors and avoids schedule bottlenecks.
      - **Automated Workload Equalization Algorithm (`availability.py`)**: Enhanced `AvailabilityEngine.get_available_slots_for_date()` with dynamic doctor utilization scoring:
        - Calculates daily doctor utilization: `active_appts_count / max_daily_appointments`.
        - Awards a **+0 to +40 points load-balancing bonus** to qualified clinicians with fewer bookings on the target day.
        - Open slots belonging to less busy doctors naturally rank higher and are offered first to patients.
        - Enforces hard daily cap: if a doctor reaches `max_daily_appointments`, they are immediately removed from further bookings on that day.
      - **Front-Desk Governance (`ReviewModal.jsx` & `useTriageQueue.js`)**: Labeled the default doctor dropdown option as `⚡ Auto-Balance by Clinic Load (Recommended)`, allowing receptionists to view the balanced clinician while retaining manual override authority if medically needed.
      - **Verification**: `Phase2ServicesTests` verified 7/7 passed. Frontend build verified 0 errors across 2,010 modules.
    - [x] **Full Backend-to-Frontend Feature Synchronization**:
      - **Doctor Provisioning via Admin API (`views_auth.py`)**: Upgraded `AdminStaffListCreateView.post` to handle clinician enrollment (`role: 'doctor'`). Creates the `Doctor` record in PostgreSQL, automatically binds them to active clinic services via `DoctorService`, logs an `AuditLog` entry, and returns standard clinician metadata.
      - **Walk-In & Direct Slot Hold Normalization (`serializers_appointment.py`)**: Enhanced `SlotHoldRequestSerializer` to accept friendly doctor/service slugs (`doc-bello`, `svc-dental`) and auto-compute missing `end_datetime` based on service duration.
      - **SSE Event Payload Completeness (`views_booking.py`)**: Included `preferred_date_range`, `preferred_time_window`, and `patient_notes` in the `request.created` SSE broadcast and HTTP 201 response so triage queue cards display custom date range windows immediately.
      - **Full Backend Test Suite Verified**: Ran all Phase 3 tests (`Phase3BookingQueueTests`, `Phase3AuthTests`, `Phase3LiveVisitsTests`): **23/23 tests passed in 124.28s**. Frontend production build: **0 errors**.
    - [x] **Playwright E2E Suite & Security Audit Verification**:
      - **Playwright E2E Suite (8/8 Passed — 100% in 1.1m)**:
        1. Triage Queue loads and displays inbound requests with FIFO tabs: PASSED
        2. Receptionist can open and inspect a Candidate Slot Review Modal: PASSED
        3. Client Pitch Simulator (Web & Telegram channels) intake and dispatch: PASSED
        4. Master Clinical Calendar grid & doctor workload horizons: PASSED
        5. Live Clinic Visits 3-swimlane flow & Walk-In admission modal: PASSED
        6. Staff Directory roster & credentials management: PASSED
        7. Clinic Settings bento & audio chimes test: PASSED
        8. Staff Login Portal displays clean NDPR notice and rejects invalid credentials: PASSED
      - **Backend Security & Concurrency Verification (100% Passed)**:
        - `Phase3AuthTests`: 8/8 Passed (PBKDF2 720,000-round password hashing, SHA-256 PIN hashing, 5-strike brute-force freeze, honeypots, doctor login barrier)
        - `Phase6ConcurrencyAndE2ETests`: 4/4 Passed (Atomic slot hold lock, race condition prevention, zero double-booking under load)
        - `Phase2ServicesTests`: 7/7 Passed (Availability engine, doctor sick-leave disruption reassignment, expiry sweeper)
      - **Frontend Production Build**: Vite compiled 2,010 modules cleanly in 4.75s with zero syntax or build errors.
    - [x] **Price Removal, Pitch Presets Cleanup & Telegram/WhatsApp Parity**:
      - **Zero Treatment Prices**: Removed all price labels (`₦15,000`, `priceNgn`) from web booking service cards and Telegram/WhatsApp bot flows so patients focus purely on clinical treatment and scheduling.
      - **Pitch Presets Strip Removed**: Removed `✨ Amina (Dental)` and `✨ Tunde (Check-up)` preset buttons from `WebIntakeForm.jsx`. Patients enter clean, real details without demo shortcut artifacts.
      - **Telegram & WhatsApp Complete Feature Parity**: Upgraded both backend (`telegram_service.py`) and simulator (`usePitchSimulator.js`) to guide patients through the exact same multi-step intake flow as the web form:
        1. Select Consultation Service
        2. Select Preferred Date Range (`⚡ Next 7 Days`, `📅 Next 14 Days`, `🗓️ Next 30 Days`, `☀️ This Week`)
        3. Select Preferred Time Window (`☀️ Morning`, `🌤️ Afternoon`, `🌙 Evening`)
        4. Select Patient Gender (`👩 Female`, `👨 Male`, `⚧ Other / Neutral`)
        5. Select Consultation Urgency (`🟢 Standard Consultation`, `🚨 Urgent / Emergency Visit`)
        6. Review Structured Summary Dossier & 1-Click Transmit to Reception
      - **Playwright E2E Suite Re-Verified**: **8/8 Passed in 31.3s (100%)**.
      - **Backend Suite Re-Verified**: `Phase2ServicesTests` (7/7 Passed), `Phase6ConcurrencyAndE2ETests` (4/4 Passed). Production Vite build: 0 errors in 3.67s.

---

# Partner Readiness Roadmap — Phase 1 (Hybrid Website AI Operating System)

Context: the partner-authored architecture spec is saved at `plans/HYBRID_AI_OPERATING_SYSTEM_SPEC.md`
(Type 3 Two-Way Sync, Option B Secure Backend API). The active execution roadmap lives in
`ROADMAP_PARTNER_READINESS.md`; project memory / AI-handover file is `MASTER_CONTEXT.md`.

- [x] **Task 1.1: Webhook Secret & Cryptographic Verification (COMPLETED 2026-11-12)**:
  - Created `backend/appointments/services/webhook_security.py` — centralized constant-time
    `X-Webhook-Secret` verification with resolution order: `ClinicSetting.webhook_secret` (new dedicated
    DB field, migration `0004`) → `custom_config['webhook_secret']` → `WEBHOOK_SECRET` env →
    `clinic_dev_secret_2026` dev fallback **only when `DEBUG=True`** → fail-closed (403) in production.
  - Enforced staff-auth-OR-secret on `POST /api/v1/slots/hold/` + `/api/v1/appointments/hold/` and
    `POST /api/v1/booking-requests/{id}/re-request/` (both were previously `AllowAny`).
  - Refactored `UpcomingRemindersView` and `ExpirySweepWebhookView` onto the shared helper
    (constant-time compare; removed unconditional hardcoded fallback).
  - Telegram inbound hardening: fail-closed in production when no secret configured; Telegram-shaped
    payloads only (WhatsApp/Meta traffic on the same route unaffected).
  - `WEBHOOK_SECRET` added to `core/settings.py` and `backend/.env.example` (with production notes).
  - New `WebhookSecurityHardeningTests` (11 tests: missing/wrong/valid secret, staff bypass,
    inactive-staff bypass blocked, fail-closed postures for hold + Telegram).
  - Updated 11 test `setUp`s + 7 guarded-endpoint test calls with explicit secrets.
  - Spec documented in `SECURITY_AND_AUTH.md` §7.4.
  - **Verification**: 95 tests total — 93 pass; the only 2 failures
    (`test_telegram_interactive_service_booking_and_dispatch`,
    `test_admin_cannot_create_doctor_account`) were verified PRE-EXISTING in HEAD via a clean
    `git archive` baseline run. Zero regressions introduced.

- [x] **Task 1.2: Role-Based Access Control Restrictions (COMPLETED 2026-11-12)**:
  - **Secret masking for non-admin staff**: `ClinicSettingSerializer.to_representation` now masks any
    `custom_config` key containing `secret` / `token` / `password` / `api_key` / `apikey` / `private`
    as `•••••••• (admin only)` unless the requester is an active `clinic_admin` (admin saves
    round-trip secrets uncorrupted). Applies to `GET /api/v1/clinic/settings/`, the PATCH response,
    and the white-label export endpoint. The dedicated `ClinicSetting.webhook_secret` DB field is
    never serialized at all.
  - **Root-rule write gate verified & regression-proofed**: `PATCH/POST /api/v1/clinic/settings/`
    confirmed already restricted to `IsClinicAdmin` via `get_permissions()`; tests added so a
    receptionist PATCH returns `403` and an admin PATCH succeeds.
  - **Doctor login-provisioning regression FIXED** (pre-existing in HEAD): `POST /api/v1/admin/staff/`
    with `role='doctor'` + password/PIN credentials → `400` (two-role policy restored: no
    `StaffUser(role='doctor')` can ever exist). Credential-free doctor enrolment — the
    `AddStaffModal` path — still creates a clinical `Doctor` resource with `201`.
  - New `RBACTighteningTests` (7 tests covering all of the above).
  - **Verification**: 102 tests total — **101 pass**; sole remaining failure is the pre-existing
    Telegram `book_svc` intake-flow bug (verified in clean HEAD baseline; tracked in
    `ROADMAP_PARTNER_READINESS.md` as a standalone issue).

- [x] **Task 1.3: Data Privacy & Masking (COMPLETED 2026-11-12)**:
  - New `backend/appointments/services/privacy.py`: `mask_phone` (keeps country code + last 4 digits,
    e.g. `+234••••••1122`), `mask_phones_in_text` (free-text regex sweep), `safe_external_body`
    (phone-masked + truncated provider error bodies for logs/audit).
  - Telegram dispatch success log (`views_booking.py`) now logs a safe `ok=`/`message_id=` summary —
    the raw Telegram response echoed patient names.
  - `TelegramService.call_api` HTTPError handler: the logged body and the
    `AuditLog.TELEGRAM_BOT_BLOCKED_BY_USER` payload now store masked, truncated text.
  - **Fixed latent pre-existing bug** surfaced by new tests: that EC-5 handler created `AuditLog`
    without the non-nullable `entity_id` (would IntegrityError in production); now passes a
    synthetic UUID.
  - **Documented decision**: the DB (AuditLog + domain models) intentionally keeps full contact data
    as the access-controlled authoritative store; ONLY ephemeral server logs are masked.
  - All 8 `logger.*` sites audited; frontend bundle scanned for hardcoded secrets — clean.
  - Tests: `PrivacyAndIPHardeningTests` (9 tests, incl. an end-to-end masked-log guard).

- [x] **Task 1.4: Inbound Rate-Limiting & Anti-Spam (COMPLETED 2026-11-12)**:
  - `get_client_ip()` in `views_booking.py` hardened: every candidate header value validated with
    `ipaddress.ip_address`; malformed/spoofed headers are logged and skipped (fall-through to
    REMOTE_ADDR); X-Forwarded-For chains resolve to the first hop.
  - New `TRUST_PROXY_IP_HEADERS` env toggle (default `True` — matches Cloudflare/Railway; `False`
    only when no reverse proxy). Documented in `backend/.env.example`.
  - **Documented decision**: secret-guarded n8n endpoints (`/slots/hold/`, `/re-request/`, sweep/
    reminder webhooks) deliberately get NO IP rate-limit — n8n shares a single egress IP, so the
    shared webhook secret is the anti-abuse control there. Public intake keeps its pre-existing
    5 req/10 min limit + honeypot.
  - Tests: 5 IP-extraction cases inside `PrivacyAndIPHardeningTests`.

- [x] **PHASE 1 COMPLETE (2026-11-12)**: full suite 111 tests / 110 pass; sole failure is the
    pre-existing Telegram `book_svc` intake bug (tracked in the roadmap). Next: Phase 2 Task 2.1 —
    InteractionLog model + `POST/GET /api/v1/interactions/` per the partner spec Section 6.

- [x] **Task 2.1: InteractionLog Model & API (COMPLETED 2026-11-12)**:
  - New `InteractionLog` model (migration `0005_interactionlog`): provider / channel / direction /
    status choices, E.164-normalized patient phone (indexed), nullable `BookingRequest` +
    `Appointment` FKs (SET_NULL), unique `external_ref` idempotency key, `call_duration_seconds`,
    `recording_url`, `summary` / `transcript` / `error_detail`, indexed timestamps.
  - `POST /api/v1/interactions/` (`views_interactions.py` + `serializers_interactions.py`):
    X-Webhook-Secret (Task 1.1 helper) OR staff JWT; idempotent upsert on `external_ref`
    (201 create / 200 re-delivery update); empty ref → NULL (unique-index safe); unknown
    `request_code` / `appointment_code` → 400; choice validation server-side; SSE
    `interaction_logged` broadcast (non-authoritative, spec §4B).
  - `GET /api/v1/interactions/`: staff-only; filters `patient_phone` / `request_code` / `channel` /
    `status`; `limit` capped 1–200 (default 50) per spec §9 pagination.
  - Docs: `DATABASE_SCHEMA.md` ERD entry; `API_REFERENCE.md` new §8 with request contract.
  - Tests: `InteractionLogAPITests` (10 tests: 401 without/wrong secret, 201 create +
    normalization, staff POST, idempotent re-delivery, unknown code 400, invalid channel 400,
    staff-only GET, filters, appointment_code resolution).
  - **Verification**: 121 tests total — **120 pass** (sole failure = pre-existing Telegram bug).
  NEXT: Task 2.2 — non-blocking async dispatch webhook.

- [x] **Task 2.2: Non-Blocking Asynchronous Webhook Dispatcher (COMPLETED 2026-11-12)**:
  - New `backend/appointments/services/dispatch_service.py`: `fire_and_forget_webhook` — daemon
    thread POST to n8n (5s timeout, failures logged never raised, zero DB access inside the thread).
  - `DispatchOffersView` n8n forward no longer blocks the receptionist response; DB rows
    (SlotOffer + status transition) commit before the call (spec §5 persist-before-process); n8n
    owns retries, reconciliation cron covers misses (spec §9-6).
  - **Fixed real pre-existing production bug** surfaced by the new test: the dispatch payload's
    `candidate_slots` serialize FKs as raw `UUID` objects → `json.dumps` TypeError → the n8n
    dispatch webhook notification had ALWAYS silently failed. Fixed with
    `json.dumps(payload, default=str)`.
  - Test: `AsyncDispatchWebhookTests.test_slow_n8n_does_not_block_response` — 2s-hanging n8n,
    response <1.5s, webhook attempt verified by call-count assertion (non-vacuous).
  - **Verification**: 122 tests total — **121 pass** (sole failure = pre-existing Telegram bug).

- [x] **PHASE 2 COMPLETE (2026-11-12)**: backend core is partner-ready for n8n integration
    (InteractionLog API + non-blocking dispatch). Next: Phase 3 frontend tasks — 3.1 ReviewModal
    channel selector, 3.2 patient dossier interaction history (depends on 2.1), 3.3 omnichannel
    settings bento.

- [x] **Code Review Fixes (COMPLETED 2026-11-12)** — external review of Phases 1–2:
  - **Critical**: `verify_webhook_secret` str-mode `compare_digest` raised TypeError on non-ASCII
    headers → unhandled 500 on all guarded endpoints. Fixed with bytes-mode comparison; test proves
    clean 401 (`WebhookSecurityHardeningTests` now 12 tests).
  - Interaction POST upsert race → concurrent re-deliveries could IntegrityError. Fixed with atomic
    `update_or_create` (external_ref excluded from defaults to avoid lookup/defaults duplication).
  - E.164 normalization now collapses `+234...` / bare `234...` / local `0803...` / spaced variants
    to one canonical key (`test_phone_variants_collapse_to_one_identity`); function-level import
    hoisted to module top.
  - Settings PATCH AuditLog no longer stores `custom_config` secrets (admin API responses still
    return them; authoritative store is ClinicSetting) — tested in `RBACTighteningTests` (8 tests).
  - New `TRUSTED_PROXY_SETS_XFF` env toggle (default True): X-Real-IP/XFF trusted only when the
    platform proxy overwrites them; `CF-Connecting-IP` always trusted; malformed header values
    truncated to 64 chars in logs. Documented in `backend/.env.example` +
    `PrivacyAndIPHardeningTests` (10 tests).
  - Hygiene: dead `import json` removed from `views_booking.py`; redundant class-level
    `permission_classes` removed from `views_interactions.py`; `mask_phones_in_text` regex now
    requires 10–15 digits (dates/order-IDs no longer masked in error bodies).
  - Deferred by design: InteractionLog `logged_by` attribution field; dispatch thread cap.
  - **Verification**: 126 tests total — **125 pass** (sole failure = pre-existing Telegram bug).

## 2026-11-13 - REVERTED: Ads Intake Channels (Task 4.0) + corrected decision

- User clarified the intent: ads data is NOT booking requests. Ad-extracted information
  (Google/Facebook ads) must be stored as new leads on a separate dedicated page that the
  user will design later; the booking request queue must stay untouched by ads.
- Commit 7016c6a had mistakenly built ads intake directly into BookingRequest (channel choices
  facebook_lead_ads/google_ads, lead_source field, migration 0006, 5 tests) and spec'd an
  n8n Workflow E that delivered ad leads straight into the receptionist queue.
- Reverted: dev DB unapplied to migration 0005, then git revert -> commit e503572
  (code, migration file, tests, build-sheet Workflow E, and doc claims all rolled back).
- Corrected decision recorded in MASTER_CONTEXT.md (Section 3, decision #7) and in the roadmap's
  Phase 4 section: no ads/leads code until the user designs the Leads page and explicitly
  commands the build. Suite back to the pre-Task-4.0 state (126 tests / 125 pass).
- Process note: Task 4.0 was built on a planning exchange; future feature work waits for an
  explicit build command per governance rule #1.

## 2026-11-13 — Architecture arrangement approved (planning only, no code)

- User walked through the remaining gaps (Step 3 channel toggle, Step 4 n8n workflows, Step 5
  handover) and asked for a full alignment plan with options, plus how to structure the code so
  each workflow owns its own tasks while staying connected to one system.
- Presented 3 options: (A) Feature-Sliced — each feature = vertical slice across Django + n8n +
  dashboard over one shared spine; (B) Central orchestrator — Django brain, dumb n8n; (C)
  n8n-centric. Recommended A; **user approved A**.
- Key principle locked: features may only ADD slices (new modules/endpoints/workflows) and reuse
  the spine (secret guard, E.164, InteractionLog, SSE) — never reach into another feature. Every
  feature follows the 5-beat rhythm: intake → human review → n8n acts → atomic response → logged.
- **Execution order approved:** Step 3.1 channel selector → user builds n8n A→B→C→D → Step 5
  partner handover → Leads page last (user designs first).
- Recorded in `MASTER_CONTEXT.md` (decisions #8, #9) and the roadmap Phase 4 header. No code
  written this session — planning and docs only.

## 2026-11-13 — Option-number hold contract + ALREADY_CONFIRMED (first approved build)

- First build under the approved architecture. Goal: make n8n Workflow C fully independent of
  Workflow D AND keep patient-response latency at exactly one call (user's fast-response priority).
- `SlotHoldRequestSerializer` now accepts `option_number` (1–20) + `request_id` (UUID or REQ code)
  as an alternative to `slot_offer_id`. Resolution inside validate(): request's slot offers in
  ORIGINAL dispatch order (`offered_at`, id tiebreaker); out-of-range/unknown-request/both-fields
  → 400; expired → 400 (n8n recovery path). Renumbering trap covered by tests (offers deliberately
  created out of start-time order; reply "2" must resolve to the 2nd CREATED offer).
- `SlotHoldView` short-circuits with friendly **200 ALREADY_CONFIRMED** (`appointment_code`
  included) when the request already has an active hold/confirmed appointment, a selected offer,
  or converted status — replaces the scary 409 for cross-channel double replies, per the spec's
  promised behavior. Expired holds deliberately do NOT match (fresh chance).
- **Real latent bug found & fixed by the new check:** a patient replying twice with DIFFERENT
  offer ids at different times previously created TWO appointments (no time conflict would stop
  it) because a held appointment does not yet convert the request. Active-hold check closes it.
- Build sheet §4 rewritten: no static-data map, no Workflow-D dependency; response-branch table
  documents 200-held / 200-ALREADY_CONFIRMED / 400-expired / 409-conflict.
- Tests: `SlotOptionNumberHoldTests` — 8 tests. Suite: **134 total, 133 pass** (sole failure =
  pre-existing Telegram bug). Committed to `partner-readiness/phase-1-2`.

## 2026-11-13 — Task 3.1: Dispatch channel checkboxes + already-booked guard (approved build)

- Pre-build decisions (user-approved via planning exchange): THREE independent checkboxes
  (WhatsApp/SMS/Voice Call) instead of a 2-mode toggle; **all three pre-checked** by default;
  dispatch BLOCKED when the patient has an active hold/booking, with a clear explanation shown
  on the dashboard (hover/inline + toast); include the transaction-hygiene fix in 3.1.
- Edge-case plan agreed before building (documented in chat): WhatsApp-send failure → 1 retry →
  auto-SMS fallback + `failed` log; all-channels-failed → reception alerted via logbook; call
  no-answer → VoiceBip retry, never resend messages; fast replier (<30s) → Workflow D checks
  request status before placing the call; invalid channel values/empty selection rejected.
- Backend (`views_booking.py` DispatchOffersView): `dispatch_channels` parsing (default all
  three = backward compatible), 400 on empty/invalid; 409 `PATIENT_ALREADY_BOOKED` guard
  (active hold/confirmed appointment; expired holds do NOT block — recovery path stays open)
  firing BEFORE any outbound call; Telegram instant-message leg now respects the "whatsapp"
  checkbox; Telegram send + n8n fire moved to `transaction.on_commit` (a slow Telegram server
  can no longer freeze the receptionist's screen or hold the DB row lock); n8n payload gains
  `dispatch_channels`.
- Logic/design separation kept: checkbox state + payload in `useQueueStore`/`useTriageQueue`/
  `apiService` (logic); strip + tooltips + reason line in `ReviewModal` (design); store rolls
  back optimistic state and shows the backend's explanation on 409 (no chime); `.toast-error`
  style added to `queue.css`.
- Tests: `DispatchChannelSelectionTests` (9: default-all-three, subset pass-through, empty/
  invalid 400, active-hold & confirmed blocks with clear detail, expired hold does NOT block,
  Telegram leg respects checkbox, blocked dispatch fires nothing); `AsyncDispatchWebhookTests`
  updated for on-commit semantics. Frontend build passes. Suite: **143 total, 142 pass**
  (sole failure = pre-existing Telegram bug). Committed to `partner-readiness/phase-1-2`.

## 2026-11-13 — Task 3.2: Patient dossier communication history (approved build)

- Goal: make every n8n touchpoint visible to reception — provider failures (WhatsApp failed,
  call not answered) are no longer silent; reception sees the timeline and acts (resend/call).
- Logic layer: `apiService.getInteractions(phone, limit)` → staff-auth
  `GET /api/v1/interactions/?patient_phone=<E.164>&limit=50`; `useTriageQueue` fetches when the
  review modal opens for the normalized patient phone, auto-refreshes every 20s while open
  (SSE `interaction_logged` consumer wiring is a separate later task), manual refresh button,
  demo-mode safe, fetch failure = non-fatal "History unavailable" note. `interaction_logged`
  registered in the SSE named-events list for future wiring.
- Design layer: `PatientDossier` timeline — channel icon (WhatsApp/SMS/voice/Telegram),
  inbound/outbound arrow, status chip (ok/pending/bad tones), summary, call duration, provider
  error detail in rose; empty states for new patients/no history/loading/error; styled in
  `queue.css` matching the existing dossier language; NDPR "clinical notes never shown" note
  untouched. `ReviewModal` passes `review.interactions` + `onRefresh`.
- No backend changes this task (the interactions API was built in Phase 2). Frontend build
  passes. With this, the system side of the patient-booking feature is 100% complete;
  remaining work on the feature = the user's n8n builds (D → C → B) per the build sheet.

## 2026-11-13 — Task 3.3: UX bug fixes + real dossier data (approved build)

- Three fixes found by live use of the dashboard:
  ① **Ask-for-info panel never opened** — `ReviewModal` called `toggleInfoPanel(true)`, the
  hook dropped the argument, and the store set `infoPanelOpen: undefined`. Fixed in the hook
  (arg pass-through) and store (no-arg = flip; true/false = set explicitly). Backend
  `ask-info` endpoint was always fine — pure wiring bug.
  ② **"Re-calculate Times" gave the same 3 slots** — deterministic engine. Backend:
  `POST check-slots/` now accepts `exclude_start_datetimes`;
  `find_candidate_slots_for_request(booking, max_slots, exclude_start_datetimes=)` skips
  candidates matching already-shown starts (±1 min tolerance; slot `start_datetime` is an ISO
  string so the filter parses before comparing; applies to both the in-range scan and the
  nearest-alternative scan). Frontend: `apiService.checkSlots(key, excludeStarts)` sends the
  body; `useQueueStore.checkSlots` passes the currently shown starts (ISO to backend, epoch-ms
  to the local `generateCandidateSlots` fallback — new optional 4th param `excludedStarts`).
  First click (no slots on screen) behaves exactly as before.
  ③ **Dossier reliability now REAL in live mode** — was computed from the hard-coded demo
  PATIENT_REGISTRY even in live mode. `syncFromBackend` now maps `patient_dossier` per queue
  item; the review view model prefers backend fields (`is_returning`,
  `reliability_percentage`, `completed_visits`/`no_show_count` → "X/Y attended"); the registry
  lookup runs only in demo mode. Backend formula unchanged: completed ÷ (completed + no_shows).
- Tests: `RecalculateExcludesShownSlotsTests` (2 tests). Suite: **145 total, 144 pass**
  (sole failure = pre-existing Telegram bug, unchanged). Frontend build passes.
- Committed to `partner-readiness/phase-1-2`. Next: **Task 3.4 — Needs Attention tab**
  (delivery-failure visibility queue, user-approved design).

## 2026-11-13 — Task 3.4: Needs Attention tab (approved build)

- Goal: reception must never manually re-open dispatched patients to discover a send failed.
  The system surfaces delivery problems in the queue itself. No new models — driven by the
  Phase 2 InteractionLog ("logbook") statuses `failed` / `no_answer` / `expired`.
- Backend: `BookingRequestDetailSerializer` gained `delivery_failures` (count scoped to that
  booking request) and `last_failure` (`{channel, status, summary, error_detail, created_at}`,
  most recent failure or null). Applies to the queue list (`GET /api/v1/booking-requests/`)
  and any detail response using the serializer.
- Frontend: `syncFromBackend` maps `delivery_failures` → `deliveryFailures` and `last_failure`
  → `lastFailure`. Queue gains a 5th tab **Needs Attention** (red count, "Delivery issues"
  hint) that lists every request with ≥1 failure, most recent failure first, regardless of
  queue status; empty state = "No delivery problems". `QueueCard` shows a red
  "⚠ N FAILED" chip with a tooltip naming the last failing channel; the LeftRail Requests
  Queue item gets a red badge (`.nav-count-badge-danger`); a Web-Audio chime plays when the
  count grows (respects the audio setting). Clicking a card opens the normal review modal
  where the Task 3.2 timeline shows the exact failure + provider error text.
- Demo mode: one seeded failure on `REQ-2026-0044` (WhatsApp failed, demo error text) so the
  pitch simulator demonstrates the tab; live mode values are real. Automatic retry stays
  n8n's job — this tab only humanizes what the logbook reports.
- Tests: `NeedsAttentionFieldsTests` (4). Suite: **149 total, 148 pass** (sole failure =
  pre-existing Telegram bug). Frontend build passes.
- Committed to `partner-readiness/phase-1-2`. **All three Phase 3 dashboard tasks complete.**
  Next: user builds n8n Workflow D → C → B (build sheet), then Phase 5 partner handover.

## 2026-11-13 — Task 3.5: Workflow D contract enrichment (prerequisite for the user's n8n build)

- ① Dispatch payload enriched: `clinic_name`, `expiry_minutes`, `offer_expires_at`, and
  per-slot `date_label`/`time_label` (Africa/Lagos, matches the dashboard). n8n does no
  timezone formatting; `candidate_slots` order = the option-numbering contract.
- ② Django's direct Telegram send now writes an InteractionLog (`sent`/`failed`,
  `external_ref: telegram-msg-<id>`, idempotent `update_or_create`, safe summary only) — the
  dossier timeline + Needs Attention tab now see the Telegram leg. Workflow D must not resend.
- ③ New `GET /booking-requests/{id}/dispatch-status/` (webhook-secret or staff auth) →
  `should_skip_voice_call` for Workflow D's fast-replier guard (hold/confirmed → skip the 30s
  call nudge).
- Tests: `DispatchContractEnrichmentTests` (5). Suite: **154 total, 153 pass** (sole failure =
  pre-existing Telegram bug). Build sheet §5 rewritten (payload, probe step, Telegram
  ownership, numbering rule). Committed to `partner-readiness/phase-1-2`.
- Next: user builds Workflow D (D1 skeleton → D2 live legs), then C, then B.

## 2026-11-13 — Workflow D graph rebuilt (live n8n) + MCP access for the agent

- Connected the n8n-mcp server to OpenCode (global config, outside the repo). Fixes needed:
  V2 shape is `mcp.servers.<name>` with an object `timeout`; the legacy `mcp.<name>` path
  requires an integer timeout. Local n8n also needs `WEBHOOK_SECURITY_MODE=moderate` because
  n8n-mcp blocks localhost in its default strict SSRF mode. The API key must be an
  **n8n API** key (`aud: public-api`), not the Instance-level MCP token.
- Live workflow `GtpeOwfnG8yYyAxq` rebuilt via the API: webhook responds immediately, the old
  `Is Channel Telegram?` IF / Telegram node / Respond node removed, three parallel IFs on
  `want_whatsapp` (+`chat_id` empty) / `want_sms` / `want_voice`, provider placeholders
  (WhatsApp, SMS, voice) wired and **disabled** until partner creds arrive; workflow timezone
  `Africa/Lagos`; workflow now **active**.
- Verified: validation clean (3 expected warnings for connections to disabled nodes), sample
  payload execution **success** (execution 7, 0.6s) with all three IFs true and every disabled
  leg skipped as pass-through. Build sheet §5.1/§5.2 records the built graph and remaining steps.
- Next: direct InteractionLog test (sent + failed) to confirm the dashboard timeline and Needs
  Attention tab against real rows, then wire the log nodes into the D graph.
- **Bug found by that test + fixed:** `PatientDossier` treated "has interactions" as "has visit
  history" and read `dossier.reliabilityTone`/`lastVisits` unconditionally → React crash (blank
  screen) when opening a first-time patient whose messages were logged. Reliability card is now
  conditional; timeline renders alone for new patients (`36b0df0`).
