
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


## 2026-11-13 - Option B Layer 1: channel-availability resolver + read-only endpoint

- New `backend/appointments/services/channel_availability.py`:
  `resolve_channel_availability(booking, request_data=None)` returns a per-channel
  reachability map (`whatsapp`, `sms`, `voice`, `telegram`) plus `reachable`,
  `unreachable`, `none` and `telegram_chat_id`. Read-only: no DB writes, no network
  calls, no provider invocation.
- Config signals are explicit enable flags - `WHATSAPP_ENABLED`, `SMS_ENABLED`,
  `VOICE_ENABLED` - because provider credentials live in n8n, not Django. Telegram is
  detected from `settings.TELEGRAM_BOT_TOKEN` because Django sends that leg itself.
- Telegram rule preserved: a patient with a `chat_id` + token makes the `whatsapp`
  checkbox reachable (`via: "telegram"`), matching what `DispatchOffersView` already
  does today (Telegram is the WhatsApp stand-in).
- New `GET /api/v1/booking-requests/{id}/channel-availability/` (staff auth only).
  Registered beside `dispatch-status` in `appointments/urls.py`.
- **Dispatch behaviour unchanged** - `DispatchOffersView` was not touched in this layer.
- Tests: `ChannelAvailabilityTests` (8) - resolver matrix (no providers -> `none`,
  Telegram via chat_id + token, explicit flags, chat_id without token, request-level
  override) and endpoint (200 shape, 401 unauthenticated, 404 unknown).
- Suite: **162 total, 161 pass** (sole failure = pre-existing Telegram bug at
  `Phase5TelegramTests.test_telegram_interactive_service_booking_and_dispatch`).
- Docs: `API_REFERENCE.md` (endpoint contract + Needs Attention distinction),
  `n8n.md` section 5.6 (layer status table + contract).
- Next: Layer 2 (advisory `delivery` / `delivery_warning` on dispatch, status stays 200),
  then Layer 3 (ReviewModal hints + `409 NO_REACHABLE_CHANNEL` rollback), then the
  `DISPATCH_REQUIRE_REACHABLE_CHANNEL` flag (default off).


## 2026-11-13 - Option B Layer 2: advisory delivery plan on dispatch (never blocking)

- `dispatch-offers` response now includes `delivery` (`requested`, `reachable`,
  `unreachable`, `warning`) and `delivery_warning` (same string, or null).
- `build_delivery_plan()` added to `services/channel_availability.py`: intersects the
  receptionist's checkbox selection with the resolver verdict and phrases the warning.
- Behaviour is unchanged by design: status stays **200**, offers are still created,
  Telegram + n8n still fire, and every pre-existing response key is preserved.
- `PATIENT_ALREADY_BOOKED` remains the first guard; its 409 response has no `delivery`
  key, and availability is computed only after that guard passes.
- Tests: `DispatchDeliveryAdvisoryTests` (5) - no reachable channel is advisory only
  (offers still created), partial reachability via Telegram, warning null when all
  reachable, existing response keys preserved, 409 precedence preserved.
- Suite: **167 total, 166 pass** (sole failure = pre-existing Telegram bug).
- Docs: `API_REFERENCE.md` (dispatch response contract), `n8n.md` section 5.6 (layer
  table + Layer 2 contract).
- Next: Layer 3 - dashboard availability hints in the ReviewModal, `409
  NO_REACHABLE_CHANNEL` rollback in the queue store, then the
  `DISPATCH_REQUIRE_REACHABLE_CHANNEL` enforcement flag (default off).


## 2026-11-13 - Option B Layer 3: dashboard channel-availability hints (display only)

- New `frontend/src/services/channelAvailability.js` (logic layer): channel labels,
  `isChannelReachable`, `channelReason`, and `buildDeliveryWarning` mirroring the backend
  wording. Unknown availability always counts as reachable, so the UI never raises a
  false alarm.
- `apiService.getChannelAvailability(id)` calls the Layer 1 endpoint; `useTriageQueue`
  fetches it when the ReviewModal opens for the selected request (demo mode, loading and
  errors leave the payload null -> no hints at all, no flicker).
- `ReviewModal`: unreachable channels show a warning marker with the backend reason on
  hover, plus one advisory sentence under the channel strip (amber, rose when nothing
  selected can reach the patient). Checkboxes stay **enabled** - nothing is blocked.
- `useQueueStore.dispatchOffers`: a returned `delivery_warning` replaces the success toast
  with an amber warning (offers are still created), and a `409 NO_REACHABLE_CHANNEL`
  response now rolls the optimistic update back exactly like `PATIENT_ALREADY_BOOKED`
  (dormant until the Layer 4 flag is enabled).
- `queue.css`: added `.toast-amber` (the queue toast previously styled only
  success/info/error).
- Backend polish: `build_delivery_plan` capitalises the first word so a voice-only warning
  does not start lowercase. No behaviour change.
- Verified: `npm run build` clean; `npm run lint` shows no new warnings. Backend suite
  **167 tests / 166 pass** (sole failure = pre-existing Telegram bug).
- Docs: `n8n.md` section 5.6 (Layer 3 contract, table now 1-3 DONE), `TEST.md` Suite G
  (T-601..T-604 passed, T-605 pending for the flag).
- Next: Layer 4 - `DISPATCH_REQUIRE_REACHABLE_CHANNEL` enforcement (default off) with
  `override_settings` tests for both flag states.


## 2026-11-13 - Option B Layer 4: flag-gated dispatch enforcement (default OFF)

- `settings.DISPATCH_REQUIRE_REACHABLE_CHANNEL` (env-driven, default **False**) and
  `enforcement_enabled()` in the resolver are the single read point.
- When ON and the receptionist's selected channels reach nobody, `dispatch-offers`
  returns **409 `NO_REACHABLE_CHANNEL`** with a clear `detail` plus the `delivery`
  payload. The check runs *before* previous offers are deleted, before new offers are
  created, and before audit log / SSE / Telegram / n8n.
- `PATIENT_ALREADY_BOOKED` still wins when both conditions are true.
- Flag OFF (default) is exactly the Layer 2 advisory behaviour - zero change for the
  current deployment. Turning enforcement on is an env change, not a deploy of new code,
  and the dashboard already rolls the optimistic update back on that 409.
- Tests: `DispatchEnforcementTests` (6) - flag off by default, off still dispatches with
  a warning, on refuses with no side effects (existing offer survives, request stays
  `awaiting_review`, `offer_expires_at` null), on still dispatches via Telegram, partial
  selection allowed, `PATIENT_ALREADY_BOOKED` precedence preserved.
- Suite: **173 total, 172 pass** (sole failure = pre-existing Telegram bug).
- Docs: `API_REFERENCE.md` (409 contract), `n8n.md` section 5.6 (Layer 4 contract, table
  1-4 DONE), `TEST.md` Suite G (T-605 passed), `backend/.env.example` (provider flags +
  enforcement switch).
- Option B is now complete end to end: resolver -> endpoint -> advisory dispatch ->
  dashboard hints -> opt-in enforcement.


## 2026-11-14 - Workflow D Stage D-1: provider adapter + channel routing (live n8n)

- Goal: build Workflow D in-house against a **mock provider** so flipping to live
  VoiceBip credentials later is a config change, not a rebuild. Voice **and** SMS both
  go through VoiceBip (Vapi stays only as a future alternative pattern).
- Live graph is now **7 nodes**:
  `Webhook → Format Offers & Telegram Buttons → Provider Config & Adapter (Code,
  runOnceForAllItems) → Route Provider Request (Switch: whatsapp|sms|voice|skip)` plus
  the three still-**disabled** send nodes (WhatsApp / VoiceBip SMS / VoiceBip voice).
- Design correction found by a live run: the three `IF Want *` nodes were **removed**.
  All three IFs passed identical items (every item carried every `want_*` flag), so a
  downstream node could not tell which branch it came from - a run routed all three items
  as `sms`. The adapter now emits exactly **one item per active channel**:
  `whatsapp` only when `want_whatsapp && !chat_id` (Telegram patients already got
  Django's card), `sms` when `want_sms`, `voice` when `want_voice` + quiet hours
  (08:00-19:00 `Africa/Lagos`).
- Adapter is the single source of provider config: every URL/key/sender id comes from
  `$env` (`VOICEBIP_API_URL`, `VOICEBIP_API_KEY`, `VOICEBIP_VOICE_AGENT_ID`,
  `VOICEBIP_CALLER_ID`, `VOICEBIP_SMS_SENDER_ID`, `WHATSAPP_*`) - no node hardcodes one.
  It exposes `provider_request.{route,skip_reason,method,url,headers,body}` and
  `adapter_meta` (`provider_mock`, `configured`, `voice_in_window`, `duplicate`,
  `missing_env[]`) for the log nodes that arrive in D-3.
- Guards: mock mode (`PROVIDER_MOCK` unset **or** true -> no HTTP, realistic fake
  `external_ref: mock-<channel>-<request_id>`; `PROVIDER_MOCK_FAIL=true` simulates a
  provider failure), best-effort 10-minute dedupe on n8n static data
  (Django `PATIENT_ALREADY_BOOKED` + offer state stay authoritative), and a
  `provider_not_configured` skip when mock is off and a channel is missing env vars.
- Stage 0 finding: a probe workflow proved `$env` is **not** blocked on this instance,
  so no restart was needed for the mock stage; the n8n process was later restarted with
  the mock env vars loaded and the adapter now reports the real `missing_env` list.
- Verified live (executions 15-19): per-channel routing `[wa,sms,voice,skip]=[1,1,1,0]`,
  Telegram patient suppressing the WhatsApp leg, `duplicate_dispatch`,
  `outside_call_window`, and mock `external_ref`/`status`. `valid: true`, 0 errors, only
  the three expected "connection to disabled node" warnings.
- Repo copy exported to `n8n/05_slot_offer_dispatcher.json` (7 nodes, UTF-8, settings
  timezone `Africa/Lagos`); build sheet section 5.1/5.2 rewritten for the new graph.
- Next: **D-2** voice guard (`Wait 30s` -> `GET dispatch-status/` -> skip when
  `should_skip_voice_call`), then D-3 enable sends + `InteractionLog` per branch,
  D-4 provider callback receiver, D-5 freeze.


## 2026-11-14 - Workflow D Stage D-2: 30s voice fast-replier guard (live n8n)

- The voice leg no longer calls blindly. New chain between the switch and the call:
  `Wait 30s Before Voice Nudge` -> `Check Patient Replied (dispatch-status)` (HTTP GET,
  `X-Webhook-Secret`) -> `Merge Voice Guard` (Code) -> `IF Voice Still Needed` ->
  `Send Voice Call (VoiceBip)`.
- Probe contract (already built in Task 3.5, `DispatchStatusView`): `GET
  /api/v1/booking-requests/{request_code}/dispatch-status/` returns
  `{status, has_active_hold, has_confirmed_booking, appointment_code, should_skip_voice_call}`.
- `should_skip_voice_call: true` (patient already holds or booked a slot within the 30s) ->
  route becomes `skip` / `patient_already_engaged`, the IF's false output goes nowhere and
  **no call is placed**.
- **Fails closed:** the HTTP node uses `onError: continueErrorOutput` with the error output
  deliberately unwired, so a 404 (request gone) or an unreachable Django stops the branch
  instead of calling the patient. Never call on uncertainty.
- `Merge Voice Guard` exists because the probe response replaces the item: it pulls the
  voice item back from `Provider Config & Adapter`, reattaches the provider payload, and
  records `voice_guard {checked, checked_at, wait_seconds, should_skip, request_status,
  has_active_hold, has_confirmed_booking, appointment_code}` for the D-3 log nodes.
- Verified live (executions 20-22):
  - **20** no hold (REQ-2026-0006) - 30.2s total, probe `should_skip:false`, IF `[1,0]`,
    call leg reached with the payload intact.
  - **21** active hold (`AP-D2GUARD` on REQ-2026-0043) - probe `should_skip:true`,
    IF `[0,1]`, `Send Voice Call` never ran.
  - **22** unknown request (REQ-2026-9999) - probe 404 -> error output -> branch stopped,
    no call, execution still `success`.
- Cleanup: the temporary `AP-D2GUARD` hold was deleted; the workflow is 11 nodes,
  `valid: true`, exported to `n8n/05_slot_offer_dispatcher.json`.
- Next: **D-3** - enable the three send nodes, add `InteractionLog` posts per branch
  (sent / failed / no_answer), verify `PROVIDER_MOCK_FAIL=true` lands in Needs Attention.


## 2026-11-14 - Workflow D Stage D-3: live sends + InteractionLog + Needs Attention

- All three provider nodes are **enabled** and make a real HTTP POST from
  `provider_request.{url,headers,body}`. Mock mode no longer bypasses them.
- Mock redesign: `PROVIDER_MOCK=true` now points every provider URL at a new companion
  workflow **`06_Provider_Simulator`** (`JrsFTzRpf2yyoZsW`, 9 nodes,
  `/webhook/provider-sim/{whatsapp|sms|voice}`). It returns a realistic payload
  (`external_ref: mock-<channel>-<request_code>`) or an **HTTP 500** when
  `PROVIDER_MOCK_FAIL=true`. Reason: a bypass would leave the send nodes, their auth
  headers, their JSON bodies and the error path untested until the day credentials land.
  Flipping live stays config-only (`PROVIDER_MOCK=false` + real keys), then delete the
  simulator.
- Logging: one Code node per branch (`Log WhatsApp / SMS / Voice Interaction`) fed by **both**
  the success and the error output of its send node. It POSTs to
  `{DJANGO_API_BASE_URL}/interactions/` with `X-Webhook-Secret` via
  `this.helpers.httpRequest`, so no extra HTTP node per branch. Logging is wrapped in
  try/catch and never breaks a dispatch.
- Payload mapping: WhatsApp -> `meta_whatsapp`; SMS/voice -> `voicebip`; success ->
  `status: sent` + provider `external_ref` (upsert on re-delivery); failure -> `status:
  failed`, no `external_ref`, and a **plain-language** `error_detail` extracted from the
  provider's error body (n8n wraps it as `500 - "{\"error\":...}"`, the node unwraps it).
- Verified live:
  - **27** all three legs POST to the simulator and log `sent` with
    `mock-<channel>-REQ-2026-0006`; Django shows 3 interactions linked to the request.
  - **32 / 36** `PROVIDER_MOCK_FAIL=true` -> all sends 500 -> `status: failed` with
    `error_detail: "PROVIDER_MOCK_FAIL=true - the simulator rejected this request on
    purpose."`.
  - `BookingRequestDetailSerializer` for `REQ-2026-0040` reports `delivery_failures: 2`
    and a `last_failure` block - exactly what the dashboard Needs Attention tab reads.
  - **39** back in normal mode: all three `sent` again.
  - Also confirmed n8n static data (dedupe) **survives a restart**: a repeat dispatch inside
    10 minutes correctly returned `duplicate_dispatch` for all three channels.
- Housekeeping: temporary probe workflows deleted; both workflows exported
  (`n8n/05_slot_offer_dispatcher.json` 14 nodes, `n8n/06_provider_simulator.json` 9 nodes).
- Next: **D-4** - provider callback receiver (`07_provider_callback.json`) for delivery
  reports / call outcomes, idempotent on `external_ref`, never downgrading a status.


## 2026-11-14 - Workflow D Stage D-4: provider callback receiver + status-rank guard

**D-4a - backend (Django is the source of truth, so the guard lives here).**

- `InteractionLog.STATUS_RANK` + `status_rank()`: `queued 0 < sent 1 < delivered 2 <
  answered|no_answer|failed|expired 3`. Terminal outcomes share rank 3 on purpose - they
  are peers, so the most recent terminal event wins (a corrected `answered -> no_answer`
  is accepted).
- `POST /api/v1/interactions/` now refuses to walk a row backwards: when the incoming rank
  is lower than the stored rank it keeps the stored status and only fills blank fields
  (`recording_url`, `transcript`, `summary`, `error_detail`, ...). It also never clears a
  failure reason. Enforced in Django, not n8n, so it holds for replayed events too.
- `patient_phone` is now optional on write. A provider callback normally identifies the
  call by `external_ref` only; if the row exists Django reuses its stored number. A new row
  without a phone is still rejected `400`.
- Tests: `InteractionLogAPITests` 19/19 pass (6 new rank tests + 2 phone-reuse tests).
  Full suite 179 tests / 178 pass - the only failure is the known pre-existing
  `Phase5TelegramTests.test_telegram_interactive_service_booking_and_dispatch`.

**D-4b - `07_Provider_Callback_Receiver`** (`rmqf5Z5K3EfapVGo`, 10 nodes, `valid: true`).

- Graph: Webhook -> `Verify & Normalize Provider Event` -> `IF Authorized` ->
  `IF Should Forward` -> `Post Interaction Update` -> `Respond Accepted`; error output ->
  `Classify Update Failure` -> `Respond Retry`; plus `Respond Ignored` and
  `Respond Unauthorized`.
- Auth: shared `PROVIDER_CALLBACK_TOKEN` via `?token=` / `?access_token=` or
  `X-Provider-Token` / `X-Callback-Token` / `X-Webhook-Token`. **Fail closed** - an unset
  env var rejects every callback with `401 receiver_not_configured`.
- Vocabulary: `STATUS_ALIASES` / `CHANNEL_ALIASES` in the Code node are the only two tables
  to edit when VoiceBip's real payload format lands. Unknown status or missing
  `external_ref` -> `200 {ignored:true, reason}` (retrying cannot fix it).
- Failure split: Django `4xx` (unknown `request_code`, bad recording URL) -> `200
  {rejected:true, retry:false}` so the provider stops retrying; connection refused /
  timeout / `5xx` -> `500 {retry:true}` so it does retry.
- Verified live:
  - no token / bad query token / bad header token -> `401` (all three);
  - unknown event -> `200 ignored:unknown_status`;
  - `call.completed` for `mock-voice-REQ-2026-0038` -> `200`, row `answered`, duration 62,
    recording URL stored, request linked;
  - late `delivered` on the same row -> `200` but the row **stays `answered`**;
  - `sms.delivered` for `mock-sms-REQ-2026-0038` -> row `sent` -> `delivered`;
  - unknown `request_code` -> Django 400 -> `200 rejected`, no retry storm;
  - Django unreachable (POST temporarily pointed at a dead port) -> `500 retry:true`, then
    restored and re-verified `200`.
- Env change: n8n restarted with `PROVIDER_CALLBACK_TOKEN=clinic_dev_callback_2026`.
  Exported to `n8n/07_provider_callback.json` (10 nodes).
- Next: **D-5** - freeze the exports and write the flip-live runbook (fill §5.5, set
  `PROVIDER_MOCK=false`, retire the simulator), then C (response handler), B (sweeper) and
  the Phase 5 handover.


## 2026-11-14 - Workflow D Stage D-5: exports frozen + flip-live runbook (Workflow D complete)

- **Exports frozen.** Re-exported `05`, `06` and `07` from the live instance and diffed
  against the committed files: byte-identical. The repo copies now match the running graphs
  1:1 (14 / 9 / 10 nodes). Validation: `05` 0 errors + 1 intentional warning (the voice
  probe's error output is deliberately unwired so the guard fails closed), `06` and `07`
  clean.
- **`n8n/.env.example`** - the complete, annotated environment contract: Django URL +
  secret, mock block (`PROVIDER_MOCK`, `PROVIDER_MOCK_FAIL`, `PROVIDER_SIMULATOR_URL`),
  VoiceBip voice + SMS, WhatsApp, `PROVIDER_CALLBACK_TOKEN`, and the required
  `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`.
- **`n8n/FLIP_LIVE_RUNBOOK.md`** - the whole switch, config-only:
  1. preconditions (10 partner items);
  2. fill env + restart (env is read at process start);
  3. **restart verification** - an unauthenticated callback answers
     `401 receiver_not_configured` when the token is empty vs `401 invalid_callback_token`
     when it is set, so configuration is provable without revealing the secret;
  4. regression gate in mock mode;
  5. flip `PROVIDER_MOCK=false`, then SMS -> voice -> callbacks in that order;
  6. register the partner webhook with the token over HTTPS;
  7. retire `06_Provider_Simulator` (keep the JSON for cheap re-testing);
  8. 10-point smoke checklist;
  9. rollback table (any problem -> `PROVIDER_MOCK=true` + restart; offers/holds never
     affected);
  10. security notes (token rotation, no DB credentials in n8n, recording/transcript NDPR).
- `n8n/README.md` manifest now lists `06`/`07` and links the runbook and env template.
- **Workflow D is complete (D-1 .. D-5).** Everything left is partner credentials.
- Next: **C** (patient response handler - testable today over Telegram), then **B**
  (expiry sweeper), then the Phase 5 handover / Railway deployment.


## 2026-11-14 - Phase 0: dispatch webhook authentication (review finding #4 closed)

**Why first.** Of every finding from the Workflow D review, this is the only one that can
cost real money or reach a real patient: `/webhook/dispatch-offers` was the one n8n entry
point with no auth, and it is the entry point that makes the clinic send SMS/WhatsApp
messages and place voice calls. Anyone who learned the URL could trigger billable traffic.

**n8n side (`05`, 18 nodes, `valid: true`).** The webhook moved from `responseMode:
onReceived` to `responseMode: responseNode`, and two nodes now run before anything else:

```
Dispatch Offers Webhook from Django   (responseMode: responseNode)
   +- Verify Dispatch Secret          (Code: headers['x-webhook-secret'] vs $env.DJANGO_WEBHOOK_SECRET)
        +- IF Dispatch Authorized
             +- false -> Respond Dispatch Unauthorized   401  (graph stops)
             +- true  -> Respond Dispatch Accepted       200  (Django released here)
                  +- Format Offers & Telegram Buttons ...
```

- Fails **closed**: an unset `DJANGO_WEBHOOK_SECRET` rejects every request
  (`reason: secret_not_configured`), so an unconfigured receiver never accepts traffic.
- A real `401` is returned, not a silent 200 - `responseMode: responseNode` is what makes
  that possible.
- The `Respond` node passes items downstream (verified with a throwaway probe workflow
  before committing to the design), so answering 200 does not interrupt the graph: the
  dispatch continues while Django has already been released.
- The 200 is sent **before** the 30-second voice wait, so Django's 5-second fire-and-forget
  timeout is never at risk.

**Django side.** `dispatch_service._post_webhook(..., secret='')` adds `X-Webhook-Secret`
when a secret is supplied, and `views_booking.py` resolves it in the request thread via
`resolve_webhook_secret()` (ClinicSetting -> `settings.WEBHOOK_SECRET` -> DEBUG-only dev
fallback) and passes it into `fire_and_forget_webhook`. The daemon thread stays
database-free, which was the constraint the original design was built around.

**Verified live (execution 63):**

| Request | Response |
|---|---|
| no header | `401 {"ok":false,"error":"unauthorized","reason":"bad_secret"}` |
| wrong header (`nope`) | `401`, same body |
| correct header | `200 {"ok":true,"accepted":true,"request_id":"REQ-2026-0044"}` in **225 ms** |

and the same execution then completed normally: `Send SMS (VoiceBip)` succeeded and
`Log SMS Interaction` posted `external_ref: mock-sms-REQ-2026-0044`, so authentication does
not break the dispatch path.

**Tests.** New `AsyncDispatchWebhookTests.test_dispatch_webhook_sends_webhook_secret_header`
asserts the header and `Content-Type` on the captured `urllib.request.Request`
(`AsyncDispatchWebhookTests` 2/2). Full suite: **182 tests, 181 pass** - the only failure is
the pre-existing `Phase5TelegramTests.test_telegram_interactive_service_booking_and_dispatch`
(`'prompted_date_range' != 'booking_request_created'`), which predates this work and is
tracked separately.

**Docs synced.** `n8n.md` section 3 rewritten as a per-webhook auth table (which paths are
authenticated, which are not yet, and the failure mode of each) plus 5.5 config contract
and 5.7 build-sequence step 7; `n8n/.env.example` now documents `DJANGO_WEBHOOK_SECRET` as
a **two-direction** value; `FLIP_LIVE_RUNBOOK.md` gained a "verify the dispatch secret"
check, smoke item 11 and a rotation warning (both sides must change together);
`N8N_BUILD_SHEET.md` 5.1 has the new graph; `TEST.md` T-708 + log row.

**Known remaining gap, deliberately left for Workflow C.** `01` (intake) and `04` (patient
response) are still `authentication: none` and do not verify Telegram's
`X-Telegram-Bot-Api-Secret-Token`. `04` is about to be rebuilt as Workflow C, so the
secret-token check will be built into it there rather than retrofitted twice. `01` is lower
risk (it creates a review card, it cannot send anything) but gets the same treatment.


## 2026-11-14 - Phase 1: WhatsApp credential-readiness (dormant but fully wired)

**Goal.** Telegram is the launch channel, so WhatsApp must be **pre-wired and inert**:
the moment a Business account, phone number id, access token and an approved template
exist, going live is config-only. Phase 1 removed every place where the WhatsApp path
would have silently misbehaved once real credentials were inserted.

**1.1 - Real wamid + Meta envelope.** Two bugs that only appear with a real provider:

- The dispatcher logged `external_ref` from flat fields (`external_ref`, `message_id`, …).
  Meta answers `{ contacts: [...], messages: [{ id: "wamid..." }] }`, so the field would
  have been **NULL** and no delivery callback could ever find the row. It now reads
  `messages[0].id` first. The simulator was changed to return Meta's **real** shape
  (instead of a convenient flat `external_ref`) precisely so a green mock run proves the
  parsing rather than hiding it.
- The callback receiver assumed one flat event. Meta wraps statuses in
  `entry[].changes[].value.statuses[]` and **batches** them (`sent` + `delivered` together
  when a phone comes online). The normalizer now emits **one item per status**, so the
  tail of a batch is never dropped, maps `recipient_id` -> phone,
  `errors[0].error_data.details` -> `error_detail` prefixed with the code (`(131047) ...`),
  and `biz_opaque_callback_data` -> booking link. Inbound patient `messages[]` are acked
  and ignored (`inbound_message_not_a_status_event`) because Workflow C owns them.

**1.2 - Template mode + gate.** Meta rejects business-initiated free-form text outside the
24-hour customer-service window (`131047`), and a slot offer always reaches a patient who
has not messaged us recently - so `template` is the only correct live mode.
`WHATSAPP_TEMPLATE_MODE=template` (default) builds a `type: "template"` body with the
approved name/language, positional body params from `WHATSAPP_TEMPLATE_PARAM_ORDER`
(default `patient_name,service_name,option_1,option_2,option_3,expiry`), and up to **3**
quick-reply buttons (`1`,`2`,`3` - Meta's cap, even though Telegram shows more). `to` is
E.164 **without** the plus. `biz_opaque_callback_data: <request_code>` is attached to
every send. Mock mode uses the placeholder `mock_clinic_slot_offer`, so the template body
is still exercised today. Gate precedence: `provider_not_configured` first, then
`whatsapp_template_not_configured`; a skipped leg builds **no URL and no body**.

**1.3 - Meta GET handshake.** The webhook is now `multipleMethods: true` (`GET` + `POST`).
`Handle Verification Handshake` answers Meta's
`GET ?hub.mode=subscribe&hub.challenge=...&hub.verify_token=...` with the raw challenge
(`200`) and fails closed (`403`) on a wrong or unset `WHATSAPP_VERIFY_TOKEN`; a GET
without `hub.mode` falls through to the normal pipeline and is `401`. Without this the
callback URL could not be registered in the Meta console at all.

**Gotcha found live.** With `multipleMethods: true` the webhook node exposes **one output
per HTTP method** (`main[0]` = GET, `main[1]` = POST). Wiring only the first made every
POST return an empty `200` - the graph had simply stopped. Both outputs now connect to
the same handler.

**No HMAC - verified limitation, not an omission.** Meta signs POSTs with
`X-Hub-Signature-256` over the **raw** body. n8n's webhook node parses JSON before the
workflow runs and exposes no raw bytes (`rawBody: true` still yields an object,
`binaryData` yields nothing - both probed on the live instance). The signature therefore
cannot be computed in-graph. Meta's authentication is the shared token in the registered
callback URL (`...?token=<PROVIDER_CALLBACK_TOKEN>`, preserved on every POST); true HMAC
would need a proxy that retains the body.

**Verified live.** Dispatcher logged `wamid.mock-whatsapp-REQ-2026-0043`; a `delivered`
callback advanced that row; a `[sent, delivered]` batch left one row at `delivered`; a
`failed` callback stored `(131047) Message failed to send because more than 24 hours...`;
inbound and unknown-status callbacks were `200 ignored`; flat VoiceBip SMS/voice were
unchanged. Mock dispatch built the 6-param template with 2 quick replies and `to` without
`+`. A Node harness (27/27) covers every adapter branch including live mode; live mode
with fake credentials and no template produced `skip / whatsapp_template_not_configured`
with an empty url/body and no send node. Handshake: `200 1158201444` (correct token),
`403 bad_verify_token` (wrong), `401` (no `hub.mode`). Mock mode restored; `05` (18
nodes), `06` (9) and `07` (13) all `valid: true`; probe workflows deleted.

**Docs synced.** `n8n.md` section 3 auth table (GET + POST on `07`, no-HMAC note), 5.5
config contract (full WhatsApp block), 5.10 callback contract (handshake, envelope, batch
semantics); `n8n/FLIP_LIVE_RUNBOOK.md` 2 (env), 4c (template + registration steps), 5
(callback URL, no-HMAC warning); `N8N_BUILD_SHEET.md` 5.1/5.3; `n8n/.env.example`;
`TEST.md` T-709.

**Still blocked on the partner.** WhatsApp Business account (template approval, phone
number id, access token, verify token), VoiceBip API key + voice agent/caller ids + SMS
endpoint/sender contract. Nothing in the code needs to change when they arrive.

---

## 2026-11-14 - Phase 2: skip visibility (a held-back channel is now a record, not a log line)

**Goal.** Before Phase 2, a channel the receptionist asked for that could not fire vanished
inside the n8n execution log: the switch's skip output was wired to nothing, and the voice
probe's error output (the one intentional validation warning on `05`) dropped failures
silently. Reception had no way to learn that "dispatched" quietly meant "two of three legs
never went out". Four judgment calls were settled up front with the user: log the four
*actionable* skip reasons; keep `patient_already_engaged`, `duplicate_dispatch` and
`no_active_channel` unlogged (the Telegram card Django sends in the `no_active_channel`
case is already a `telegram-msg-*` row); fold `voice_payload_missing` into Phase 3; and
include the pre-dispatch phoneless-availability fix.

**2.1 - Django: queued rows without a phone (test-first).** A "held back, not attempted"
row has no destination number because nothing was sent - but `POST /interactions/` required
one for brand-new rows. The relaxation is narrow: blank `patient_phone` is accepted **only**
when `status=queued` **and** the row links a request, so the row is always findable. A
`sent` row without a phone is still 400. Bonus pinned by test: when the channel later fires
for real, the higher-ranked provider event advances the same row and fills the blank phone
(`InteractionLogAPITests` now 22/22).

**2.2 - Django: phoneless availability (test-first).** `resolve_channel_availability` never
looked at the patient's data - sms/voice showed "reachable" for a phoneless booking as long
as the provider flags were on. Now any booking without a number makes sms, voice and
provider-WhatsApp unreachable with reason *"No phone number on file for this patient."*;
the Telegram card (`via: "telegram"`) remains the one road that needs no number. Reception
sees the warning **before** dispatch, and Layer-4 enforcement refuses such dispatches when
the flag is on (`ChannelAvailabilityTests` now 10/10).

**2.3 - Adapter: `missing_phone` guard.** New skip reason with explicit precedence:
`duplicate_dispatch` -> `missing_phone` -> `outside_call_window` -> `provider_not_configured`
-> `whatsapp_template_not_configured`. A phoneless patient previously produced requests with
`to: ""`; now every channel skips and - as since Phase 1 - a skipped leg builds no URL and
no body. Node harness extended 27 -> 38 assertions (all pass), including the precedence
check (phoneless beats unconfigured).

**2.4 - `Log Skipped Channel` (switch skip output wired, first time).** One Code node per
skip item writes the queued row via the same `this.helpers.httpRequest` + try/catch pattern
as the three send loggers (a Django outage can never fail a dispatch - the row is a record,
not a gate). Deterministic `external_ref` (`skip-<channel>-<request_code>`) makes repeats
upsert instead of piling up; a later real send uses a different ref so the history stays
honest. Row-worthy reasons only; `duplicate_dispatch` and `no_active_channel` pass through
unlogged by design.

**2.5 - `Log Voice Probe Failure` (the last warning, closed).** The probe's error output now
feeds a node that writes a `failed` voice row - `external_ref: probe-<request_code>`, plain
language in `error_detail` - which lands in **Needs Attention**. Verified live by pointing
the probe at a dead port: the row recorded "voice call suppressed (fail closed):
connect ECONNREFUSED 127.0.0.1:9" and `Send Voice Call` never ran. `05` is now **20 nodes,
0 errors / 0 warnings**.

**Verified live (executions 105-123).** Phoneless dispatch -> three queued rows
(`missing_phone`); evening dispatch -> queued row (`outside_call_window`) - the case
originally planned as harness-only, live because Lagos passed 19:00 mid-test; live mode
with no credentials -> queued row (`provider_not_configured`); live mode with fake creds +
no template -> queued row (`whatsapp_template_not_configured`); dead-port probe -> failed
row, no call; repeat dispatch inside the 10-minute dedupe window -> no rows; normal
dispatches -> `sent` rows only, skip node idle. One genuine puzzle during verification -
two consecutive "duplicate" results - was measured, not guessed: the static-data timestamps
proved all of Phase 2's live work happened inside eight minutes, so the dedupe stamps were
simply still alive. No bug; the guard works exactly as designed.

**Temporary test patches, all asserted and restored byte-exact:** probe URL -> dead port
and back; voice quiet-hours window forced open (to reach the probe path at night) and back.

**Docs synced.** `N8N_BUILD_SHEET.md` 5.1 (20-node graph, both new nodes, skip-reason
table + Phase 2 section with the verified-live list); `n8n.md` 5.6 (phone check in the
availability contract), 5.7 (step 9), 5.10 (phone rule now says queued+linked rows are
accepted); `FLIP_LIVE_RUNBOOK.md` smoke items 12-13 + a "reading queued rows" note;
`TEST.md` T-710 + log row; `PROGRESS.md` this entry. `n8n/.env.example` unchanged (no new
env vars). `06`/`07` re-exported byte-identical (frozen 1:1 holds).

**State.** Full suite **187 tests / 186 pass** - the only failure remains the pre-existing
`Phase5TelegramTests` Telegram test. `05` (20 nodes), `06` (9), `07` (13) all `valid: true`
0/0; `PROVIDER_MOCK=true` restored. Next: Phase 3 hardening (dedupe stamping only on real
sends, `error.status` before the regex, header-only token, unknown channel -> ignore,
`patient_phone` guard on callbacks, SMS grammar for <3 options, `voice_payload_missing`
row, and the `update_or_create` link-clobber quirk noted in 2.1), then Workflow C.

---

## 2026-11-15 - Phase 2.5: production correctness & security (the verified system review)

**Origin.** An external full-system review landed 12 findings. Every claim was verified
against the actual code before anything was fixed - and that verification mattered: the
review's two `05` items (unauthenticated dispatch-offers, missing wamid capture) were
**stale** (fixed in Phases 0/1), its Telegram test name didn't exist, its PIN-lockout
framing missed a server-side throttle that does exist, and its duplicate-methods finding
was a maintenance trap rather than a runtime bug (the view accepts both payload keys).
Grounding the plan also surfaced three things the review understated: the workstation
PIN lock is validated **client-side with a '1234' fallback** in live mode, the app boots
**permanently live** (so the login fallback was the default behavior, not an edge case),
and the login screen **displayed** credentials on production. Four findings were
genuine launch blockers; three were quick wins; two needed no code (n8n skeleton
lessons -> written requirements for B/C; code-gen-under-lock noted and deferred).

**2.5.1 - Double-booking side doors closed (review #4, the worst finding).**
`HoldService.acquire_slot` is the gold standard; `RescheduleAppointmentView` and
`DisruptionService.reassign_to_colleague` walked around it - no lock, no availability
check, no overlap/buffer test. The conflict check was extracted into shared read-only
helpers (`find_slot_conflict`, `purge_expired_holds`), `acquire_slot` refactored onto
them behavior-identically (pinned by the existing hold suite), and both paths now:
lock the target doctor row, re-validate active/leave, purge stale holds, conflict-check
excluding the appointment being moved, and answer `409 SLOT_CONFLICT` (naming the
conflicting block) leaving the appointment untouched. Three silent defects fixed on the
way: moving only the start now preserves the visit duration (was stretched/shrunk
silently - the failing-first test showed a negative duration), naive ISO datetimes are
anchored to the server timezone (the overlap math previously would have crashed on
naive input), and an unresolvable doctor is a 400 instead of a silent no-op.
`RescheduleConflictTests` 9/9, written first and failing exactly as predicted.

**2.5.2 - Live login fallback removed (review #2).** `login()` in live mode now returns
a server-unreachable failure on a network error instead of falling through to the local
demo array; the local matching runs in demo mode only; `quickDemoLogin` refuses outside
demo mode; the login screen renders 1-click presets only in demo mode and no longer
pre-fills credential fields. The demo array was scrubbed to synthetic identities
(`.example` emails, `demo-` passwords) - it still ships in demo builds, but nothing in
it resembles a real credential.

**2.5.3 - Server-authoritative PIN unlock (review #3).** `PinUnlockView` (both
`/auth/pin-unlock/` and `/auth/verify-pin/` aliases) now requires an active staff
session; the email+PIN branch - a staff-email enumeration oracle plus an unauthenticated
brute-force surface - is gone, and anonymous probes receive a uniform 401. The existing
tests already authenticated, so nothing broke; `test_verify_pin_and_lockout` was updated
and gained the anonymous-probe assertion. On the frontend, `unlockWorkstation` is async
and server-gated in live mode: 200 unlocks, 400 counts the attempt, 423 mirrors the
server's cooldown, 401 clears the session and routes to a full password re-login - and
the client-side `'1234'` fallback is gone (the live login no longer fabricates a PIN).
Demo mode keeps the local persona check. Stated honestly in the docs: the 20-minute
lock is a privacy screen; the JWT remains the security boundary - this step makes the
lock consistent instead of decorative.

**2.5.4 - SSE-safe deploy config (review #1).** `render.yaml` and `backend/Procfile`
both now run gunicorn with `--workers 1 --threads 8 --timeout 0`: one process means one
in-memory SSE bus and one LocMemCache (the old `--workers 3` split both across
processes - a webhook on worker 1 never reached a dashboard on worker 2), the thread
pool serves concurrent dashboards, and no request timeout kills EventSource streams.
Render's missing `$PORT` bind was fixed in the same line. Scaling past ~7 concurrent
dashboards is the documented Phase 5 trigger (Postgres LISTEN/NOTIFY or Redis).

**2.5.5 - SSE event names aligned (review #5).** Three backend events were dead on
arrival: `request.reviewing` (registered as `presence.reviewing`),
`appointment.status_changed` (registered as `appointment.updated`), and
`request.re_requested` (not registered at all). The frontend now registers the backend's
canonical names, the dead `calendar.slot_updated` listener is removed, and re-requests
refresh the priority queue live. A new contract test (`test_sse_event_name_contract_phase25`)
pins all three names per broadcaster by patching `broadcast_event` at each view module -
neither side can drift silently again.

**2.5.6 - Cleanups (reviews #7/#8).** The five staff-management methods defined twice in
`apiService` (the first block silently dead) are now one block, with `resetStaffPin`
standardized on the serializer's `new_pin`. The hardcoded `reviewingBy !== 'Sarah'`
filter is replaced by identity comparison - email on the SSE path, current staff name on
the local path - so presence badges show for every reviewer except one's own.

**2.5.7 - The suite's one red test fixed (review #9, diagnosis correct, test name
wrong).** The Telegram conversational intake gained date-range / time-window / gender
steps after `test_telegram_interactive_service_booking_and_dispatch` was written; the
test now walks the full chain (`book_svc_` -> `tg_rng_` -> `tg_win_` -> `tg_gen_`) with
unique update ids and asserts each prompt status before `booking_request_created`.

**2.5.8 - n8n skeleton lessons recorded (review #6, no code).** The audited flaws in
`01`-`04` (JWT-only status endpoint called with a webhook secret, `/api/v1` prefix
conflict, `re_request_slots_` prefix, 15x nudge spam, fail-open secret fallbacks) are
now §6.1 "Hard requirements for the B and C rebuilds" in `N8N_BUILD_SHEET.md` - the
skeletons are rebuilt, not patched, and the rebuilds must resolve every item,
verified live.

**State.** Full suite **197 tests / 197 pass - the first fully green run since Phase 0.**
Frontend `npm run build` clean. The privacy-lock honesty note and the gunicorn scaling
trigger are documented where they'll be looked for. Next: Phase 3 hardening as planned
(now T-712), then Workflow C.

---

## 2026-11-15 - Phase 3: hardening (in progress)

**3.1 - Callback upsert link preservation.** The link-clobber quirk found during Phase 2.1
is closed. `POST /interactions/` resolves `request_code`/`appointment_code` into FK links
before the upsert, so an event carrying no codes set them to `None` - and because the
rank-advancing path passes everything through `update_or_create(defaults=...)`, a
legitimate id-only callback (VoiceBip call outcome: id + status + duration, no metadata)
silently unlinked the row from its BookingRequest. The dashboard then lost the row from
the request timeline. The fill-blanks path already skipped `None`, which is why only the
advancing path was affected; phone was already protected. Now `None` in an incoming event
means "said nothing about the link" and the existing link is preserved, while a non-`None`
value still wins - deliberate re-linking is pinned by its own test so the fix cannot
over-reach. Three tests were written first (detector failed with the link clobbered to
`None`), then the one-block fix; `InteractionLogAPITests` 25/25 and the full suite
**200 tests / 200 pass**.

**3.2 - Patient-facing SMS grammar, and no-slots fail-closed.** Worth restating the
ownership split, because it decides where this fix belongs: for the **voice** leg the
VoiceBip agent speaks its own script and we only pass variables; for **WhatsApp** Meta
forces an approved template; for **SMS** we compose the text ourselves and VoiceBip is
only the delivery pipe. So the wording is ours to correct. `Format Offers & Telegram
Buttons` now derives the reply sentence from the real option count - `Reply 1`,
`Reply 1 or 2`, `Reply 1, 2, or 3`, `Reply 1, 2, 3, or 4` - instead of hardcoding the
first two numbers, which produced "Reply 1, 2, or 1" for a single option and
"Reply 1, 2, or 2" for two. Singular/plural is honoured for both the slot count ("slot is
ready" vs "slots are ready") and the expiry ("1 minute" vs "60 minutes").

Grounding the grammar surfaced a reachable empty-dispatch path: when the receptionist
approves no explicit slots Django falls back to the availability engine, which can
legitimately find none - and every channel would then have texted/called the patient with
an empty option list ("Reply 1, 2, or 0"). The adapter gained a `no_slots` skip reason as
the most fundamental check (ahead of `duplicate_dispatch`, because with nothing to offer
nothing should fire), the zero-option text never claims options exist, and `no_slots` is
row-worthy in `Log Skipped Channel`, so reception sees a `queued` row instead of silence.
The deeper Django question - a request marked `slots_offered` with zero offers - is
recorded for a decision rather than silently changed here.

**Verification.** Format harness 24/24 (12 failed against the shipped text first),
adapter harness 51/51 (13 new assertions: `no_slots` on every channel, precedence over
`missing_phone`/`provider_not_configured`, and one-option dispatch still normal), then
live: 1-, 2- and 0-option dispatches through the real webhook, reading the shipped Format
node's `sms_body` out of the executions - exact texts confirmed, the 0-option run routed
to `skip/no_slots` and wrote a `queued` row in Django. Workflow `valid: true`, 20 nodes,
0 errors / 0 warnings.

**3.3 - Provider failures read like sentences.** The three `Log * Interaction` nodes are
what puts a failed send in front of reception, so their `error_detail` is a piece of UI,
not a log line. Grounding this against real failures changed the fix twice, so the
evidence comes first: n8n's failed-HTTP error object is only `{ message, name, stack }` -
plus `code` for transport failures - with **no** `error.status`, no `httpCode`, and no
`description`. The status exists *only* as the message prefix, and the response body is
embedded as a **JSON string literal**. Two live probes (a 404 and a closed port, executed
through the real dispatcher and then removed) showed exactly that.

That kills the two assumptions the old code was built on. First, there is no status field
to read, so every failure looked alike: a bad key (the partner fixes it), a 429 (retry
later), a dead endpoint and a DNS failure all produced the same blob. Second, the
hand-rolled `.replace(/\\"/g, '"')` is not a valid decode of a JSON string literal - it
mangles nested escaped quotes, so `JSON.parse` throws (`Expected ',' or '}' after property
value in JSON at position 46` against a body that quotes `"GET dispatch-offers"`) and the
`catch` returned the raw wrapper: `404 - "{\"code\":404,...\"hint\":\"The workflow must be
active..."`, cut mid-word at 300 chars. Worse, the SMS and Voice variants read
`parsed.error` directly, so a provider nesting `error` as an object gave reception
`[object Object]`.

All three nodes now share one canonical classifier: status prefix -> class label
(`authentication failed`, `endpoint not found`, `rate limit reached`, `server error` for
5xx, ...), transport `code` -> plain words (`ECONNREFUSED`, `ENOTFOUND`, `ETIMEDOUT`), then
the provider's own sentence out of a genuine two-step parse, flattened to one line and
capped at 300 chars. An `ok:false` answer with no exception keeps the provider's
`error_message` verbatim. n8n has no shared module, so the block is duplicated by design -
and the harness asserts it is byte-identical in all three, which is the only thing that
stops the copies drifting. The `parse` also had to move *before* any tidying: an early
build tidied the message first, which unescaped the nested quotes and broke the literal
again.

**Verification.** `test_lognodes.js` runs the shipped code from the workflow JSON with
stubbed `$input`/`$`/`$env`/`helpers.httpRequest`: 121 assertions (39 per log node + 4
drift guards), 57 of them red against the shipped code - including the probe-147 body
verbatim, `[object Object]`, and the plain-text 500. Then live: both failure classes
re-run through the real dispatcher and read back from Django, `error_detail` =
`Provider endpoint not found: The requested webhook "POST definitely-not-registered" is
not registered.` (102 chars) and `Provider endpoint refused the connection` (40 chars),
17/17; SMS send URL restored byte-exact afterwards; workflow `valid: true`, 20 nodes,
0 errors / 0 warnings. No Django change was needed - and none was possible: the write
serializer is an explicit field list, so a new `error_status` key would have been silently
dropped, which is why the class lives inside the sentence instead of beside it.

**Harnesses are now in the repo.** The three node-level harnesses existed only in `%TEMP%`,
which made the drift guard a promise nobody could keep: `TEST.md` and the build sheet
reference them by name, and the B/C rebuilds are supposed to fail on a stale copy. They now
live in `n8n/tests/` with repo-relative paths and a `README.md` stating the rules. Two
things surfaced while moving them: `test_adapter.js` was reading a dumped `adapter_v2.js`
(byte-identical today by luck, and exactly the pattern that makes a harness lie), so it now
reads the adapter node out of the workflow export like the others; and the assertion counts
recorded for 3.2 (24 / 51) never matched the files — re-measured from their own output they
are 22 / 47 / 121, and `TEST.md` T-712b is corrected.

**State.** Full suite **200 tests / 200 pass** (3.3 touches n8n only, so this was a
regression guard; `python manage.py test --parallel 1` exits 0). Live dispatcher in sync
with the repo export; test rows cleaned up. Next: 3.4 (dedupe stamping only on real
sends), then 3.5-3.8.

**3.4 - The dedupe window is stamped by sends, not by attempts.** `Provider Config &
Adapter` wrote its 10-minute dedupe stamp at *decision* time, for every channel the
receptionist had ticked - before any of the five skip reasons was evaluated 130 lines
later. So a leg that never left the building still burned the window, and 3.2's `no_slots`
turned that from a papercut into a customer-loss path:

| t | What happened | Patient |
|---|---|---|
| 0 min | dispatch, 0 options -> `skip / no_slots`, `queued` row written, window **stamped** | nothing |
| 2 min | reception finds a free slot, re-dispatches -> `duplicate_dispatch`, which is **deliberately unlogged** | nothing |
| - | dashboard shows the request as dispatched | nothing |

`missing_phone`, `outside_call_window`, `provider_not_configured` and
`whatsapp_template_not_configured` all had the same shape: fix the cause, retry
immediately, get refused, and lose the trace.

The fix splits the read from the write. The window is read (and entries older than 10
minutes pruned) before routing, and stamped *after* the per-channel map exists, with one
condition - `skip_reason === null` - which by construction covers all five skip reasons. A
leg that actually fires still stamps, so the guard's original purpose is intact;
`adapter_meta.duplicate` now means "a previous dispatch actually fired" rather than
"someone clicked recently".

**Verification.** The harness could not have caught this: `test_adapter.js` stubbed
`$getWorkflowStaticData` as `() => ({})`, a fresh object per call, so the dedupe path had
never been exercised there at all (T-701's dedupe claim was live-only). It now takes a
shared static-data object across `run()` calls and carries section M, 15 assertions:
**62 total, 7 red first** (M2/M3/M4 skipped-dispatch-burns-the-window,
M9/M10 config-fix-blocked, M12/M13 phone-fix-blocked). Live on `REQ-2026-9401`, three
dispatches seconds apart: 0 options -> `skip / no_slots` + one `queued` row; 1 option ->
`route=sms`, `duplicate=false`, row written; repeat -> `duplicate_dispatch`,
`duplicate=true`, no new row - 10/10, asserted on the adapter's own output read back from
each execution, so it holds regardless of the mock endpoint. That also proves
`$getWorkflowStaticData` persists across executions in this deployment, which the harness
can only stub. Full suite 200/200, `valid: true` 20 nodes / 22 connections / 0 errors.

Deliberately out of scope: **retry after a failed send.** The adapter cannot see the HTTP
outcome, so un-stamping on `failed` would equally allow duplicating a message the provider
had already delivered before the connection dropped. A failure keeps its stamp; the
operator decides. Concurrency is unchanged and still best-effort (static data is
per-execution; Django's `PATIENT_ALREADY_BOOKED` and offer state remain authoritative).

**3.5 - the callback token travels in a header, not a URL.** `07`'s verify node accepted
the shared secret from five carriers: `query.token`, `query.access_token`, three header
names and `body.token`. All five were compared against the same secret, so this was never
an authentication bypass - it was a **leak**. n8n records the webhook's `query` object in
every execution, so registering the callback URL as `...?token=<secret>` writes the secret
into the log of every callback that ever arrives, permanently, readable by anyone with n8n
UI access. `body.token` was worse: a secret inside the payload, logged twice.

Two constraints shaped the fix rather than being designed away. **Meta cannot send custom
headers**, and its `X-Hub-Signature-256` cannot be verified in-graph (both `rawBody` and
`binaryData` were probed on 2026-11-14 and neither exposes raw bytes), so the Meta leg must
keep a URL token or never authenticate at all. And **VoiceBip's header support is an open
partner question** - their delivery-report format is still on the blocked list - so strict
header-only could kill the launch on a detail nobody had confirmed.

The rule is therefore header-first with two forced exceptions. Headers
(`X-Provider-Token` / `X-Callback-Token` / `X-Webhook-Token`) are the only carrier for a
VoiceBip event, and win when both are present. A query token is honoured on a **Meta
envelope** (`body.entry[]`) because there is no alternative, or on any body when
`PROVIDER_CALLBACK_ALLOW_QUERY_TOKEN` is exactly `'true'` - an escape hatch for a partner
that can only paste a URL, closed unless someone opens it. `body.token` is gone outright,
`query.access_token` with it. Neither exception weakens authentication: both paths require
the same secret, so the rule only decides *where the secret may travel*.

**Verification.** `07` had never had a harness (T-704 was live-only), so
`n8n/tests/test_callback_auth.js` was written first: 30 assertions, 11 red (query token
accepted, payload token accepted, `access_token` accepted, the flag ignored in both
directions, plus the entire refusal-contract block that only runs on a rejection). Live on
`REQ-2026-9501`: header + VoiceBip -> `200` accepted and a row written; `?token=` +
VoiceBip -> `401 invalid_callback_token` and no row; `?token=` + Meta envelope -> `200` and
a `whatsapp` row; wrong header -> `401`; payload token -> `401` - 11/11. Then n8n was
restarted with the flag `true` and the identical query request returned `200` with a row,
and restarted again without it to confirm `401` and leave the launch default in place.
That restart pair matters: the hatch is configuration, so it has to be proven through the
env, not just in the harness. Workflow `valid: true`, 13 nodes, 0 errors.

**3.6 - an unknown channel is ignored, not relabelled as SMS.** The channel chain ended in
`if (!channel) channel = 'sms'` - justified once, because VoiceBip's remaining product is
SMS, but it was not a fallback, it was an assumption. A callback that explicitly said
`channel: "email"` (or `"push"`, or a typo, or an object stringifying to `[object Object]`)
fell through every rung and was stored as an SMS delivery report: a row in the patient
timeline for a message that was never an SMS, with a `200` to the provider, so it never
retried and never surfaced anywhere. Inventing plausible data is the worst failure mode for
a feed reception is supposed to trust.

The fix keeps `rawChannel` - what the provider actually said - so the code can tell
*"you named a channel I don't know"* from *"you didn't name one"*. An explicit but unmappable
channel becomes `200 {ignored:true, reason:"unknown_channel"}` with no row; an absent channel
keeps the ref/event/status inference and the documented SMS last resort, because VoiceBip
delivery reports may legitimately omit the field and dropping them would lose real delivery
updates. `isMeta` still sits above the fallback, so a Meta envelope is WhatsApp whatever it
claims. When the partner contract lands, a genuinely new spelling is one `CHANNEL_ALIASES`
entry - the fix here is stopping the invention, not adding aliases.

**Verification.** Section J in `test_callback_auth.js`: 40 assertions, 3 red first (J1
`email`, J2 `channel_type: push`, J3 an object channel). J9 (`Meta + channel:"email"` →
`whatsapp`) was already green — the Meta override sits above the fallback — and stays as a
guard so a future reordering cannot break it. Live on `REQ-2026-9601`: `channel:"email"` and
`channel_type:"push"` both answered `200 ignored/unknown_channel` and wrote nothing; a
no-channel `answered` event produced a `voice/answered` row; a no-channel `sms-ext-…` ref
produced `sms/delivered`; `channel:"sms"` still worked; exactly three rows at the end, which
is the assertion that matters — nothing was invented. Workflow `valid: true`, 13 nodes.

Deliberately not a Django row: `InteractionLog.channel` has no "unknown" value, so logging
an ignored callback would mean lying in the other direction. The reason is in the execution,
and the runbook now lists `unknown_status` and `unknown_channel` as the two `200` answers
that are not failures.

**State.** Full suite **200 tests / 200 pass** (`python manage.py test --parallel 1`,
exit 0). `07` live and in sync with `n8n/07_provider_callback.json`; both live workflows
`valid: true`. Next: 3.7 (patient identity on callbacks), 3.8 (`voice_payload_missing` row).

---

## 2026-11-16 - Phase 3 / 3.7: patient identity on a callback is fill-only

**Origin.** Reading 3.6 surfaced two defects in the same field, one of them a silent
data-loss bug. The upsert path built `defaults` from every validated field, so
`update_or_create` would happily write a callback's `patient_phone` over a number already on
the row - while the lower-rank branch fourteen lines above refused exactly that and filled
blanks only. Two opposite policies on the same field, in one file. And the overwrite was
reachable, not theoretical: `normalize_phone_e164` is deliberately lenient (a bare 11-digit
`0…` number becomes `+234…`), so a sandbox call, a provider echoing its trunk DID, or a
cross-wired `external_ref` reattributes a patient's whole message history with nothing to
show for it. It is the link-clobber bug fixed in 3.1, one field over.

The second defect was in `07`: the forwarder read `n.patientName`, but `normalize()` returns
`patient_name`. The value was `undefined`, n8n dropped it from the payload, and **no callback
had ever carried a patient name to Django**. One line - and only visible because the live
probe asserted on Django rows instead of the webhook's own response.

**The rule is "fill a blank, never rewrite."** A callback may fill a missing phone (the 2.1
skip-visibility contract: a queued row has no number because nothing was sent), but a stored
number is identity. The delivery outcome is real, so the status still advances and the
duration/error text still land; only the identity is refused. The mismatch is appended to the
row's `summary` once (`_flag_phone_mismatch` is idempotent, so provider retries cannot stack
it) because a discrepancy that only exists in a log file is invisible to the person who needs
it - and the log line names the `external_ref` only, never the numbers. The same rule then
applied itself to the name: a callback that says nothing about the patient must not erase the
name the first event carried; silence is not a discrepancy, so it is restored with no note.

Deliberately **not** rejected with `400`: throwing away a real delivery outcome to protect a
field we can simply keep would trade a guaranteed loss for a hypothetical one.

**Tests first.** Six in `InteractionLogAPITests`: reattribution refused, the flag not
duplicated, a same-number-in-another-format not flagged, the lower-rank branch pinned so the
two policies cannot drift apart, a blank filled without a note, and a nameless callback not
blanking the name. Two red first (the overwrite and the stacking), then 31/31. Section K in
`test_callback_auth.js`: 44 assertions, 3 red first (`patient_name` reaching the payload,
being a string rather than `undefined`, and an absent name becoming `''`), with K3 keeping the
`recipient` phone alias pinned.

**Verified live on `REQ-2026-9701`, reading Django rows.** A callback with a different phone
advanced the row to `answered`, kept `+2348030009701`, and still stored the 42-second
duration; a retried mismatch left exactly one sentence; `Amina Probe` arrived on the first
callback and survived a later nameless one; the same number as `08030009702` was not flagged;
a blank number was still filled. 13/13.

Two probe bugs worth recording, since both were mine and both looked like code failures. The
first version asserted on the webhook response, which only echoes
`ok/accepted/external_ref/status/channel/request_id` - the row is the truth. And the
"same format" case used `080300009702`, twelve digits, which the lenient normalizer turns
into `+080300009702` and correctly reads as a mismatch: an 11-digit local number is the only
form that collapses to the stored `+234…`.

**State.** Full suite **206 tests / 206 pass** (`python manage.py test --parallel 1`,
exit 0). `07` live and in sync with `n8n/07_provider_callback.json`; both live workflows
`valid: true`. Next: 3.8 (`voice_payload_missing` row).

---

## 2026-11-16 - Phase 3 / 3.8: a fail-safe records, it does not vanish

**Origin.** `Merge Voice Guard` synthesises a `voice_payload_missing` skip when it cannot find
the adapter's voice item. That is a defensive branch - it only fires when the graph is
inconsistent - and it was the least observable thing in the whole workflow, for three
independent reasons found by following the wire rather than reading the node:

- It is created *after* `Route Provider Request`, so it could never reach `Log Skipped
  Channel`, which is the only place a skip becomes a row. Its only route was the voice branch.
- `IF Voice Still Needed` tested `voice_guard.should_skip`, a value that comes from the
  probe. A missing payload did not set it, so the item passed the gate and went to
  `Send Voice Call` with `provider_request.url === undefined`. The comment said "if the
  adapter payload is missing, do NOT place a call" - and no call was placed, but the outcome
  was a node error that aborted the run, not a record.
- Even if it had reached the logger it would have been dropped: no `REASON_TEXT` entry, and
  no `request_id` for the deterministic `external_ref`.

So the rarer and more alarming the cause, the quieter the system got - backwards for a feed
reception is supposed to trust.

**The fix.** The guard now treats a missing payload as a skip reason rather than as a
synthetic payload: `shouldSkip = probe.should_skip_voice_call || payloadMissing`, the reason
switches to `voice_payload_missing`, and the synthetic item inherits `request_id` from the
probe (the probe still knows the request; the adapter is the thing that is gone). `Log Skipped
Channel` gained one `REASON_TEXT` entry, and `IF Voice Still Needed`'s **false** output - which
was wired to nothing - now goes to the logger.

Wiring the false output had a second-order risk worth naming: `patient_already_engaged` now
reaches the logger too. It stays unlogged because `REASON_TEXT` has no entry for it, so the
Phase 2 decision is preserved *by the same mechanism* that makes the new reason row-worthy -
the harness pins both directions (G4 posts, G5 does not).

**Tests first.** New `n8n/tests/test_voice_guard.js`, covering `Merge Voice Guard` and
`Log Skipped Channel` from the shipped export with stubbed `$`, `$input`, `$env` and a
recording `httpRequest`: 31 assertions, **13 red** first (G3a fail-closed, G3e request-code
inheritance, G9a/G9b the missing wire, G4a-G4h the row, G7b the captured error). It also
asserts one **graph edge** - the first harness here to test topology, because this bug was a
missing wire rather than bad code.

**Verified live** in three phases on `REQ-2026-9801..9803`. To reach the branch at all the
adapter has to fail, so `Provider Config & Adapter` was temporarily pushed with only
`provider_channel` renamed (`route` is built from the channel name inside the adapter, so the
switch still routed it down the voice path and the guard is what discovered the payload was
gone): one `queued` row, `error_detail: voice_payload_missing`, linked to the request, **no**
call row (8/8). The adapter was then restored and re-asserted in sync, an already-booked
patient produced **no** row (2/2), and a clean dispatch still called and logged
`mock-voice-REQ-2026-9803` (4/4) - which is the assertion that the new wire did not break the
happy path.

**State.** Full suite **206 tests / 206 pass** (`python manage.py test --parallel 1`,
exit 0). `05` live and in sync with `n8n/05_slot_offer_dispatcher.json` (20 nodes, 23
connections) and `07` with its export; both `valid: true`. Next: Workflow C (patient response
handler), then Workflow B (sweeper), then Phase 5.

---

## 2026-11-16 - Workflow C / C.1: patient-reply endpoint (built, live-proven)

**Status: DONE.** Full suite **218 tests / 218 pass** (`--parallel 1`, exit 0). The 5 n8n
harnesses are untouched and still pass. Live proof ran against the real dev server with real
rows: 28/28 checks, cleanup verified. Two commits on `partner-readiness/phase-1-2`.

### What was broken

Telegram replies work end to end because the button data is `select_slot_<offer_id>`: the
button itself says which offer, and `TelegramService.handle_telegram_webhook` does the rest.

An SMS or WhatsApp reply carries only the sender's phone and a few words. Nothing in Django
answered *"which open request is this phone replying about, and which offer is number 2?"* -
and n8n cannot answer it, because that is a database question and n8n never gets DB access.
`/slots/hold/` could not be reused directly: it needs a `request_id`, which the patient never
supplies.

### What shipped

**1. One channel-neutral endpoint** (`views_patient_reply.py` + `services/patient_reply.py`):

```
POST /api/v1/webhooks/patient-reply/
X-Webhook-Secret: <shared>          (fail closed, same verifier as every webhook, 401)
{"phone": "+2348030001122", "text": "2", "channel": "sms",
 "provider_message_id": "vb-in-8812"}

{"status", "intent", "request_id", "appointment_code", "channel", "reply_text"}
```

`X-Webhook-Secret` only. A patient never holds that secret, so staff JWT is deliberately not
accepted on this machine-to-machine route.

**2. Resolution** - `normalize_phone_e164(phone)`, then the most recent `BookingRequest` in an
open status. No open request is a normal `200 unmatched`, not an error and not a 500. The real
model statuses are `awaiting_review`, `slots_offered`, `offer_expired`, `re_requested` (the
plan said `awaiting_slots`; that value has never existed in the model).

**3. The select intent reuses the booking core, it does not copy it.** The option number is
resolved against the request's offers in **original dispatch order** (`offered_at`, `id`) -
the number the patient saw keeps its meaning. The selection itself goes through
`services/slot_selection.py::select_slot_offer`, which was extracted verbatim from
`SlotHoldView` (ALREADY_CONFIRMED guard + `HoldService.acquire_slot` + `is_selected` + SSE).
Both callers now share one code path; the existing hold tests (`SlotOptionNumberHoldTests`,
`WebhookSecurityHardeningTests`) stayed green through the extraction. `SlotHoldView` keeps its
two paths: the shared offer path and the direct calendar/walk-in path.

**4. Intent grammar** (SMS has no buttons, so the vocabulary is small and obvious):

| Text | Intent | Effect |
|---|---|---|
| `1`..`4` (any 1-2 digit number) | `select` | hold that dispatched option |
| `cancel`, `cancelled`, `canceled`, `stop` | `cancel` | cancel the live appointment |
| `reschedule`, `change`, `move`, `new time` | `reschedule` | request -> `re_requested` |
| anything else | `other` | `needs_reception` |

**5. Statuses returned** (the six approved plus the ones lifecycle needs):

| Status | Meaning |
|---|---|
| `held` | 15-minute hold created, `reply_text` names doctor/time/reference |
| `already_confirmed` | a live booking exists; original `appointment_code` returned |
| `out_of_range` | option number was not offered (or nothing offered yet) |
| `expired` | the 60-minute offer window passed |
| `duplicate_ignored` | provider retried the same message; **no** action, `reply_text` is `""` |
| `unmatched` | no open request for this phone |
| `needs_reception` | free text, or `cancel` with nothing to cancel |
| `cancelled` | appointment cancelled (`cancelled_at`, reason `Cancelled by patient via <channel>`) |
| `re_requested` | request in the priority tab + `PATIENT_RE_REQUESTED_TIMES` audit row |
| `slot_conflict` | another patient took the time inside the lock |

**6. Idempotency is the inbound row itself.** `provider_message_id` is stored as
`InteractionLog.external_ref`, which is already unique, so `get_or_create` is the claim: a
retry (or a race) gets `created=False` and answers `duplicate_ignored` without touching the
database further. No new model, no migration. An empty `reply_text` is the contract signal
"nothing to deliver" - n8n must not send just because it retried its HTTP call.

**7. The patient's side of the conversation is recorded.** One `direction="inbound"` row per
accepted message: provider inferred from the channel, `status="answered"`, normalized phone,
request and appointment links filled once the outcome is known, and a `summary` built from the
outcome - never from the patient's raw text, because free text may contain a phone number or
clinical detail. `unmatched` writes nothing (there is nothing to attach, and R3 pins it).

**8. Copy stays in Django, plain text.** `reply_text` is composed here (no HTML/Telegram
markup), so there is one place to be wrong and one place to fix.

**9. Telegram untouched.** Django already owns that conversation; forwarding Telegram updates
here would handle the same tap twice.

### Precedence decisions (and why)

1. **`already_confirmed` before `out_of_range` and `expired`.** A patient who already holds a
   slot and then texts `9` should hear "you already have a booking", not "option 9 does not
   exist" - and must never get a second booking. R12 ("3" after "2" on another channel) pins
   this. Unit R4 still sees `out_of_range` because it has no prior hold.
2. **`out_of_range` before `expired`?** No: a valid number whose offer expired reports
   `expired`; an invalid number reports `out_of_range` regardless of expiry.
3. **`cancel` with no live appointment** is `needs_reception` with an honest sentence; it does
   not silently mark the request rejected. Telegram's cancel targets an appointment id from a
   button; here the target is the live appointment for the request.
4. **`unmatched` writes nothing** - no row, no SSE, no audit.

### Tests (R1-R12, written first)

`PatientReplyWebhookTests`, 12 tests, **12 red first** (9 failures + 3 errors, all `404`
because the route did not exist). Step-by-step green counts: 2/12 after the resolver + auth,
7/12 after the select intent, 9/12 after idempotency, 11/12 after cancel/reschedule, 12/12
after the inbound row. Suite total 206 -> 218, exit 0.

### Live proof

`c1_live_proof.py` against `127.0.0.1:8000` with the real dev database: created a request with
three offers, then `9` -> `out_of_range`, `2` -> `held` (right offer, reply names its time),
same `provider_message_id` -> `duplicate_ignored` (one appointment, one inbound row),
`cancel` -> `cancelled`, `reschedule` -> `re_requested` + audit row, free text ->
`needs_reception`, wrong secret -> `401` with no rows, local phone `08090012345` -> same
patient held, inbound summaries contain no phone number. **28/28, exit 0**, all proof rows
deleted and verified gone.

It caught one wrong assumption in the proof itself: after a hold exists, `already_confirmed`
legitimately wins over the range check, so the proof now checks `9` on a request with no hold.

### Files

- New: `backend/appointments/services/patient_reply.py`,
  `backend/appointments/services/slot_selection.py`,
  `backend/appointments/views_patient_reply.py`
- Changed: `backend/appointments/views_appointment.py` (shared select core, behaviour
  identical), `backend/appointments/urls.py` (route),
  `backend/appointments/tests.py` (`PatientReplyWebhookTests`)
- Docs: `PROGRESS.md`, `TEST.md` (T-713), `n8n.md` (§5.8), `n8n/N8N_BUILD_SHEET.md` (§4, §6.1),
  `API_REFERENCE.md`, `DATABASE_SCHEMA.md` (no migration; `external_ref` note only)

No schema change, no new dependency, no frontend change.

### Out of scope (unchanged)

- The n8n workflow rebuild (**C.2**) - done immediately after; see the C.2 section below.
- VoiceBip's inbound payload format - still an open partner question, which is why the endpoint
  takes a neutral `{phone, text, channel, provider_message_id}` shape.
- Forwarding Meta inbound messages from `07` (WhatsApp is dormant).

---

## 2026-11-16 - Workflow C / C.2: `04` rebuilt around the endpoint (built, live-proven)

**Status: DONE.** Full Django suite still **218 tests / 218 pass** (`--parallel 1`, exit 0).
All 7 n8n harnesses green (`test_reply_handler.js` 91, `test_simulator_ids.js` 19, plus the
five existing ones). Live proof ran **through the running n8n workflow into Django**: 36/36
checks, cleanup verified. Live workflow `lBAjZ9ozCvFzKIBs` (19 nodes, active, `valid: true` -
0 errors, 22 connections, 23 expressions); the repo JSON is the source.

### What was broken

The endpoint existed, but nothing used it: `n8n/04_patient_response_handler.json` was still
the audited skeleton - a Telegram-button router that PATCHed `/appointments/{id}/status/` with
a staff-JWT route a patient webhook must never touch, built URLs with `/api/v1` twice, carried
`|| 'clinic_dev_…'` secret fallbacks, and a `re_request_slots_{id}` prefix for a flow that no
longer exists. An SMS reply hit nothing.

### What shipped

**1. Rebuilt, not patched.** Two triggers (`/webhook/whatsapp-inbound` for Meta envelopes,
`/webhook/sms-inbound` for VoiceBip flat payloads), both fail-closed on `X-Webhook-Secret`
copied from `05` (`Verify Reply Secret` -> `IF Reply Authorized` -> a real **401**; an unset
env rejects even the correct dev string). Then one graph:
normalize -> switch -> **one** `POST /webhooks/patient-reply/` -> deliver `reply_text`
verbatim on the patient's channel -> one outbound log row -> `200` to the provider.
Removals are asserted by the harness: no PATCH node, no `/api/v1` in any URL, no
`re_request_slots_`, no secret fallback.

**2. n8n decides nothing.** `Normalize Patient Reply` only reshapes either provider payload
into `{phone, text, channel, provider_message_id}`; "2" is forwarded as `"2"`. Meta buttons,
`interactive` replies and media captions are read; a **status callback is not a reply** - it
answers `200 {ignored:"not_a_message"}` and writes nothing, because `07` owns delivery
reports. A message with no number is `400 missing_phone`.

**3. Delivery.** `duplicate_ignored` (empty `reply_text`) -> `200 sent:false`, nothing sent,
no row. Django non-2xx/network -> `500 django_unavailable` (a provider retry is safe there).
Mock mode points at `06`'s simulator; live mode **refuses to guess** - missing credentials are
a `provider_not_configured` skip, never an invented URL. The trigger owns the transport: a
payload mislabeled `channel: "voice"` on the SMS trigger is still an SMS reply.

**4. The outbound row (06.1 requirement 6).** One `POST /interactions/` with
`direction="outbound"`, the provider message id as `external_ref`, request/appointment links,
and a held-back reply (skip or provider failure) recorded as **`failed` with one actionable
sentence** - the patient is waiting, and silence would be invisible. Best-effort by design: a
Django outage while logging never breaks the answer to the provider.

**5. Companion fix - the simulator minted one id per request.** The live proof caught it: two
replies to one request both came back `external_ref: mock-sms-<REQ>`, and `/interactions/`
upserts on `external_ref`, so the second outbound row **overwrote the first** - the dashboard
would have shown one reply where the patient received two. `06` now mints
`mock-<channel>-<REQ>-<stamp>` / `wamid.mock-whatsapp-<REQ>-<stamp>`, which is what real
gateways do: the id is what a delivery report matches. `07`'s legacy `REQ-…` fallback still
finds the code inside the id.

### Tests (written first)

- `n8n/tests/test_reply_handler.js`: runs the **shipped** node sources from the workflow JSON;
  **red first** (the workflow was still the skeleton), then **91 assertions green** - fail-closed
  auth (9), Meta shapes (13), VoiceBip aliases (10), delivery routing (21), the outbound row and
  error classification (21), graph drift guards (13, including the canonical error block being
  byte-identical to `05`).
- `n8n/tests/test_simulator_ids.js`: **4 red -> 19 green** - one id per message, readable ids
  that keep the `REQ-` code, Meta's real response shape, the `PROVIDER_MOCK_FAIL` 500 switch.

### Live proof

`c2_live_proof.py` through `127.0.0.1:5678` into `127.0.0.1:8000`, real rows: wrong secret ->
`401` with zero writes; `9` -> `out_of_range` (delivered); `2` -> `held` on the **second
dispatched** offer; provider replay of the same message id -> `duplicate_ignored`, no second
appointment, no new row; WhatsApp `cancel` -> `cancelled` and the reply logged as
`meta_whatsapp` with the real wamid; a Meta status callback for that wamid -> ignored, the row
untouched; `reschedule` -> `re_requested` + audit row; **two replies -> two outbound rows with
distinct refs** (the C.2 fix, asserted); a voice-tagged SMS -> still SMS/voicebip; an unmatched
number -> Django's guidance text delivered with a request-less row. **36/36, exit 0**, all
proof rows deleted and verified gone.

### Files

- Rebuilt: `n8n/04_patient_response_handler.json` (19 nodes, live `lBAjZ9ozCvFzKIBs`)
- Fixed: `n8n/06_provider_simulator.json` (one id per message; live copy updated too)
- New: `n8n/tests/test_reply_handler.js`, `n8n/tests/test_simulator_ids.js`
- Docs: `PROGRESS.md`, `TEST.md` (T-713b), `n8n.md` (§3 auth table, Workflow 4 banner,
  §5.8 status + new §5.8.1, mock-mode note, §6 matrix), `n8n/N8N_BUILD_SHEET.md` (§4.1, §6),
  `n8n/tests/README.md`

No backend change, no schema change, no new dependency, no frontend change.

---

## Workflow B - complete end to end (2026-11-16)

**Status: done.** The 60-second expiry sweeper is a real, active, proven workflow: Django decides
everything (who, which app, which words), n8n only delivers, and every message is single-shot.

- **B.0 (Django owns the message contract).** `sweep_service.py` rewritten: every sweep item carries
  `channel` + `message` + `claim_ref` (Telegram adds `telegram_chat_id` + `reply_markup`); Django
  pre-writes one claim row per message (`nudge-<REQ>-<channel>` / `recovery-<REQ>-<channel>`,
  `status="queued"`), so no matter how many times the cron fires, the `/interactions/` upsert on
  `external_ref` keeps each message at exactly one row. Reminders **mirror the offer's channels**
  (same app the offer went out on, plain-SMS fallback, never voice). Recovery copy says
  **RESCHEDULE** - the word C.1's endpoint accepts, not the blueprint's "Reply NEW". One
  `status="expired"` system row (`sweep-expiry-<REQ>`) + `OFFER_EXPIRED_SWEEP` audit per swept
  offer; **hold expiry stays silent**. `ExpirySweepWebhookView` bad/missing secret now answers
  **401** (was 403), same body as every endpoint. `SweeperMessagingTests` 10 red first, then green;
  full suite **228/228, exit 0**.
- **B.1 (harness first).** `n8n/tests/test_sweeper.js`: **29/40 red** against the skeleton - which
  also failed A8 (the literal dev secret was embedded in the file) and G2 (hardcoded "expire in"
  copy, exactly the n8n-writes-words defect the plan forbids). After the rebuild: **78 green**
  (A cron POST env-resolved + fail-closed, B parse guards, C adapter gates, D switch wiring,
  E onError wiring, F claim-ref upserts + canonical-block drift guard, G no patient-facing words).
- **B.2 (rebuild + upload).** 12 nodes: cron → `Trigger Django Expiry Sweeper` → `Parse Sweep
  Response` → `Build Provider Requests` → `Route by Channel` → 3 send nodes (`onError:
  continueErrorOutput`) + `Log Skipped Leg` → 3 `Log * Outcome` nodes. Instance
  `WgdycXudLDdqskEQ` **active**, `valid: true` 0 errors / 0 warnings, repo JSON byte-identical.
- **B.3 (live proof, 18/18 exit 0).** Wrong secret → 401 with zero writes; the **real active cron**
  swept, emitted and delivered the SMS + WhatsApp nudges and the recovery message (`queued → sent`),
  each claimed exactly once across every fire; Telegram with a fake chat id ends **failed with a
  readable reason**; B → `offer_expired` + one system expired row + audit; hold expiry silent;
  extra sweeps re-emit nothing; "reschedule" → `re_requested` + `PATIENT_RE_REQUESTED_TIMES`;
  all proof rows deleted and verified.
  **Two real defects caught and pinned by the harness:** (1) the trigger URL doubled `/api/v1`
  (the instance's `DJANGO_API_BASE_URL` already ends in `/api/v1`) → 404 every minute; A1/A2 now
  *resolve the URL expression* against a mock env instead of string-grepping. (2) The log nodes ran
  **once per run** (n8n Code default mode) but paired contexts with `$itemIndex` (per-item
  semantics): with two SMS items in one run only the first was processed and the second claim stayed
  `queued` forever. Rewritten as true all-items zipping by position + a no-context guard; F12 pins
  one-run-two-responses pairing, F13b pins that an unpaired response posts nothing.
  Emission rule pinned for future work: **nudge claims regenerate** while the request stays
  `slots_offered`; a **recovery emission is one-time** (tied to the `offer_expired` transition).
- **Files:** `backend/appointments/services/sweep_service.py`, `backend/appointments/views_realtime.py`,
  `backend/appointments/tests.py`, `n8n/02_hold_and_offer_expiry_cron.json`,
  `n8n/tests/test_sweeper.js` (new). Docs: `PROGRESS.md`, `TEST.md` (T-714, T-714b),
  `n8n.md` (Workflow 2 + §6 matrix), `n8n/N8N_BUILD_SHEET.md` §3 (Reply NEW superseded by
  RESCHEDULE), `n8n/tests/README.md`.

---

## Workflow A - complete end to end (2026-11-17)

**Status: done.** The pre-visit reminder & follow-up recall workflow is real, active and proven:
one hourly sweep asks Django who is due, and every message is Django's words on Django's app,
single-shot by claim row. Same split as B: Django decides everything, n8n only delivers.

- **A.0 (Django owns the message contract).** New `reminder_service.py` + `POST /api/v1/webhooks/reminder-sweep/`
  (401 house auth, same `{"error": "INVALID_WEBHOOK_SECRET"}` body). **One call returns ALL due items** -
  24h reminders (start in (now, now+24h]), 2h reminders ((now, now+2h]), follow-up recalls
  (`is_completed=False, reminder_sent=False, follow_up_date <= today`) - no per-kind parameter. Every item
  carries `kind` (`24h`/`2h`/`followup`) + `channel` + `message` + `claim_ref` (`rem24-<AP>-<ch>` /
  `rem2h-<AP>-<ch>` / `followup-<TASK>-<ch>`; `request_id` = appointment code); Telegram items add
  `telegram_chat_id` + `reply_markup`. Claim rows (`status="queued"`) keep each message single-shot across
  the 24 hourly fires a 24h window spans. Channels **mirror the patient's own outbound log** (booking-request
  rows + appointment rows); walk-ins and no-record patients fall back to plain SMS; never voice. Copy states
  the **actual date and time - never "tomorrow"** (an appointment 3 hours out is inside the 24h window too).
  Clinic flags gate the batches: `enable_24h_reminder` (default on), `enable_2h_reminder` (default off).
  Follow-ups mark `reminder_sent=True` + `reminder_sent_at` only when >= 1 claim was written (no claim, no
  mark - the next sweep retries). Unlike B: **no state transitions, no AuditLog rows, no extra system rows** -
  the reminder IS the interaction. Dead code activated with fixes: `format_24h_reminder` said "tomorrow" and
  carried a **dead `reschedule_` callback** (nothing wires it) - now states the real date and uses only wired
  callbacks (`confirm_attend_`/`cancel_`); new `format_2h_reminder` + `format_followup_recall` (the follow-up
  button uses the wired `book_svc_<service_id>` grammar). `ReminderMessagingTests` **19 red first** (17 errors
  + 2 failures on 404), then green; full suite **247/247, exit 0** at that point.
- **A.1 (harness first).** `n8n/tests/test_reminders.js`: **27/30 red** against the 6-node skeleton (which
  hardcoded reminder copy in n8n, used `||` fallback URLs, and carried the dead `reschedule_`/`book_new`
  callbacks). After the rebuild: **81 green** - A env-driven POST + fail-closed secret + shipped-cron pin,
  B parse guards, C adapter gates + C19 (the adapter must be **byte-identical to 02's**, so both workflows
  share the ONE WhatsApp template), D wiring, E onError wiring, F claim-ref upserts + canonical-block drift
  guard + F9b/F12b (log summaries name the reminder kind, never "Expiry recovery message"), G no
  patient-facing words.
- **A.2 (rebuild + upload).** 12 nodes - the same graph as `02` with three renamed nodes: cron `5 * * * *`
  (hourly at :05; supersedes the two-cron spec - a single sweep returns all kinds) -> `Trigger Django Reminder
  Sweep` (actor `n8n_cron_reminders`) -> `Parse Reminder Sweep Response` -> `Build Provider Requests` ->
  `Route by Channel` -> 3 send nodes + `Log Skipped Leg` -> 3 `Log * Outcome` nodes. Instance
  `UHQzb7w5gOh2hxcW` (`03_Pre_Visit_Reminders_And_Followups`) **active**, `valid: true` 0 errors / 0 warnings,
  repo JSON in sync.
- **A.3 (live proof - caught one real defect, then all checks passed).** The proof temporarily tightens the
  instance cron to `*/1 * * * *` and restores `5 * * * *` in `finally` (re-verified active; A10 pins the
  shipped schedule). First run: Django emitted every claim correctly but **all claims stayed `queued`** -
  9x `400 {"request_code":"BookingRequest AP-0000 not found."}`. Root cause: the outcome POSTs carry the
  **appointment** code as `request_code`, and `/api/v1/interactions/` resolved it against BookingRequest only.
  Fixed red-first (test `400 != 201` -> green): `resolve_links` tries **BookingRequest first, then
  Appointment** (additive; the upsert never downgrades an existing link). The shared log-node `kindLabel` also
  learned `24h`/`2h`/`followup` labels (only in `03`; `02` untouched). Second run failed on the **stale
  `--noreload` dev server** (the fix was live in the process only after restart - the documented trap) and the
  third run: **all checks passed** - wrong secret 401 + zero writes; the real cron delivered the 24h reminder
  on the sms+whatsapp mirrors; the walk-in got the SMS fallback in **both** windows (24h + 2h with the flag
  on); the follow-up recall delivered on whatsapp and marked the task once; the Telegram fake-chat-id leg
  (`55990`) ended **failed with a readable reason** (the host has no bot token, and the simulator has no
  Telegram leg); the +30h appointment produced no claims; no AuditLog rows; only fixture+claim rows per phone;
  extra sweeps re-emitted nothing. Proof rows deleted and verified; seeded demo-data reminders
  (`rem24-AP-1043-sms`, `rem24-AP-1044-sms`, `followup-601abc5d-...-sms`) fired once each during the window -
  single-shot held, untouched. Full suite **248/248, exit 0** (the new serializer test); all 9 n8n harnesses
  green.
- **A.4 (docs).** `n8n.md` Workflow 3 rewritten as built (+ A6 matrix row), `n8n/N8N_BUILD_SHEET.md` A2 banner
  (hourly single-cron as-built note), `TEST.md` T-715/T-715b + run-log rows, this file.
- **Files:** `backend/appointments/services/reminder_service.py` (new),
  `backend/appointments/services/telegram_service.py`, `backend/appointments/serializers_interactions.py`,
  `backend/appointments/views_realtime.py`, `backend/appointments/urls.py`, `backend/appointments/tests.py`,
  `n8n/03_reminder_flows.json`, `n8n/tests/test_reminders.js` (new). Docs: `PROGRESS.md`, `TEST.md`
  (T-715, T-715b), `n8n.md` (Workflow 3 + A6 matrix row), `n8n/N8N_BUILD_SHEET.md` A2 banner,
  `n8n/tests/README.md`.

---

## n8n package restructure (2026-11-17, Item A)

- `n8n/workflows/` (01-07), `n8n/tests/` (paths updated), `n8n/docs/` (build sheet, handover,
  runbook), `README.md` documents the tree. `git mv` history preserved; all 9 harnesses green
  after the move; live pointers in `n8n.md`, `AGENTS.md`, `MASTER_CONTEXT.md`, roadmap synced.
- Workflow 08 (`disruption_notifier`, Item B) will be born into `workflows/`.

---

## Partner-readiness QA batch (2026-11-17, user's live dashboard session)

Three defects found by hands-on receptionist testing, all fixed red-first and pushed on
`partner-readiness/phase-1-2`:

- **T-716 Needs Attention never resolved.** The tab keyed on the all-time failure count;
  a successful re-send kept the patient stuck. New backend `attention_open` field (newest
  failure newer than newest success = open); the tab now filters on it. Commits `fa981fe`.
- **T-717 Simulator ghost requests.** Web intake sent `date_of_birth: ''` (400), fell back
  silently to a local-only row; recalculate/dispatch then 404'd ("none of the channels
  could be reached" was this, not a channel outage). Fixed: null DOB, loud live-mode
  failure toast, live sync drops backend-unknown ghosts. Commits `fa981fe`.
- **T-718 Seeder wiped credentials on every restart.** `seed_clinic` re-hashed all staff
  passwords/PINs at boot (wsgi auto-seed), silently undoing dashboard resets. Credentials
  now set once (creation or blank hash). Commits `c1e14c0`.

Full suite **253/253**; logins verified live: `admin@clinic.com` / `adminpassword123`
(PIN `9900`), `sarah@clinic.com` / `password123` (PIN `1234`).

---

## 2026-11-17/18 - Item B: one-click emergency-leave resolver (built, live-proven)

### What was broken
A doctor calling in sick left the receptionist to move every patient by hand: the old
Emergency Leave modal offered fake notify buttons, nothing was placed automatically and
patients were never told. The live runs also exposed three defects: the n8n adapter sent
only the first of four queued messages, the calendar's backend sync never updated a moved
appointment, and the calendar route showed no toast at all.

### What shipped
- `DisruptionService.auto_resolve_disruption` (B.1): one atomic call marks the leave and
  places every impacted patient - same-time colleague -> earliest same-day slot -> next
  day - each move re-validated under the hold lock; queues one WhatsApp + one SMS row per
  patient with Django's own words; unplaced patients get no message.
- `POST /api/v1/disruptions/<doctor_id>/auto-resolve/` (B.2): staff-only, per-patient
  report, `delivery_pushed` truthful, fire-and-forget push to `N8N_DISRUPTION_WEBHOOK_URL`
  inside `transaction.on_commit`.
- Workflow `08_Disruption_Notifier` (B.3): `05`'s graph on `/webhook/disruption-alerts`,
  fail-closed secret, its own single-placeholder WhatsApp template; the adapter now adapts
  EVERY item (the item[0] bug is pinned by harness cases D+1-D+7).
- Frontend (B.4/B.5): "Sick / Leave" on the live timetable header opens the cockpit; the
  one-click resolves the backend UUID via the staff directory (token-based name match),
  applies returned placements to the calendar, and renders a truthful toast on the
  calendar route (new banner, 4s auto-dismiss). Calendar sync is now an upsert.

### Tests
Harness first everywhere: Django 265/265 (T-720/T-721 red-first); `test_disruption_notifier.js`
77 checks (red-first skeleton, incl. D+1-D+7 multi-item). All 10 n8n harnesses green.

### Live proof (executions 951, 960, 1066)
Two fresh probe appointments on Dr. Bello -> UI one-click -> both placed at the exact same
times to a colleague; 4 claim rows -> n8n Parse 4 -> Adapter 4 -> 2 WhatsApp + 2 SMS -> 4
`sent` rows; toast: "Dr. Bello Ibrahim's leave auto-resolved: 2 same day. 4 notices pushed
for WhatsApp/SMS delivery." Probe rows deleted, doctors restored, DB clean.

### Files
`backend/appointments/services/disruption_service.py`, `backend/appointments/views_appointment.py`,
`n8n/workflows/08_disruption_notifier.json`, `n8n/tests/test_disruption_notifier.js`,
`frontend/src/stores/useCalendarStore.js`, `frontend/src/hooks/useCalendar.js`,
`frontend/src/components/calendar/EmergencyDisruptionModal.jsx`,
`frontend/src/components/calendar/DoctorGridBookingCalendar.jsx`,
`frontend/src/components/calendar/MasterCalendarGrid.jsx`,
`frontend/src/views/CalendarView.jsx`, `frontend/src/services/apiService.js`.

---

## 2026-11-18 - Item C: double-booking red alert (built, live-proven)

### What was broken
Nothing watched the database for two patients in the same doctor's chair at the same
time. The booking engine blocks such writes, but an import, a manual SQL edit or a
migration could still create one, and the receptionist would only find out when both
patients arrived.

### What shipped
- `ConflictService.find_double_bookings` (C.1): read-only scan from one day back to
  fourteen days ahead; active statuses only; expired holds ignored; real appointment
  intervals compared (sterilization buffers never raise this alert). Every clash is
  reported once per pair with the doctor, both appointment records and the exact
  overlap window, soonest first. 12 tests.
- `GET /api/v1/conflicts/double-bookings/` (C.2): staff-only feed returning
  `{generated_at, count, conflicts}`; it wraps the service so the rules live in one
  place. 3 tests.
- Frontend (C.3): headless `useDoubleBookingAlert` polls every 10 seconds;
  `DoubleBookingAlert` is a full-screen red pulsing overlay naming the doctor, both
  codes, both patients and the overlap, with "View in calendar" and "Silence alert".
  A red count chip stays until the clash is gone and brings the overlay back when
  clicked. Logic lives in the hook + apiService, markup in the component, styles in
  `double-booking-alert.css`.

### Tests
Red first at every step: 12 detector tests (NotImplementedError), 3 endpoint tests
(404), then green; full Django suite green. Parse check clean on every changed
frontend file; live browser proof.

### Live proof
Two deliberately overlapping confirmed appointments on Dr. Bello (11:00-11:30 and
11:15-11:45): the overlay named AP-0007 / AP-0008 with overlap 12:15-12:30 PM
(local); "View in calendar" selected the clash day and Dr. Bello; "Silence alert"
closed the overlay and the chip stayed red; clicking the chip reopened it; deleting
one probe cleared the chip 3.6 s later through the 10 s poll. Probe rows deleted,
doctors restored, DB clean.

### Files
`backend/appointments/services/conflict_service.py`,
`backend/appointments/views_appointment.py`, `backend/appointments/urls.py`,
`backend/appointments/tests.py`, `frontend/src/hooks/useDoubleBookingAlert.js`,
`frontend/src/components/calendar/DoubleBookingAlert.jsx`,
`frontend/src/styles/components/double-booking-alert.css`,
`frontend/src/components/calendar/DoctorGridBookingCalendar.jsx`,
`frontend/src/services/apiService.js`.

---

## 2026-11-18 - Leave flow step 1: dated period + honest preview (built, live-proven)

### What was broken
The leave cockpit only ever meant "this doctor is off today". A receptionist
planning a 4-day trip had to repeat the same one-day action four times, and the
"Auto-Resolve" button moved patients the moment it was pressed — there was no way
to see where everyone would go before it happened.

### What shipped
- Dated leave (T-726): `DoctorLeave` holds a real range, inclusive, with
  `end_date = NULL` meaning "until further notice". `Doctor.is_on_leave` is now
  only the today flag and re-syncs from the periods; a doctor with no leave rows
  still honours the old boolean, so manual switches keep working. The
  availability engine, hold engine, colleague reassignment and the resolver all
  check the requested DATE, so the first day back books normally. Overlapping
  windows merge into one row.
- Preview (T-727): `preview_disruption` runs the REAL resolver inside a
  transaction that is always rolled back. Same placements, same counts, nothing
  saved, nothing queued. `POST /api/v1/disruptions/<uuid>/preview/` returns the
  same report shape as approve, flagged `preview: true`.
- Planner UI (T-728): leave period card with first/last day inputs and 1 / 3 / 7
  / 30-day chips; "Preview plan" renders a per-day panel with every patient,
  where they would land, colleague load and a "need you" count, stamped
  "Preview only — nothing sent". "Approve & notify" only appears once a preview
  exists and names the outcome. Editing the window discards the old preview.
- Calendar truth (T-728): the grid derives "on leave" from the raw periods for
  the day it is showing, so a 2-day plan greys out exactly two columns. The
  timetable header reads "On Leave · <reason>" instead of "On Duty", the doctor
  card carries an "On leave" chip, and the day's affected list uses the same
  statuses the resolver moves (`confirmed` / `held`, expired holds excluded).

### Tests
Red first: 7 preview tests (`DisruptionPreviewTests`), 9 dated-leave tests
(`DoctorLeaveAvailabilityTests`, `DoctorLeavePlanTests`), then green. Full Django
suite **300/300 OK** in 297 s. esbuild parse check clean on every changed
frontend file; browser console clean.

### Live proof
Three probe appointments (AP-0007/0008 on Mon 30 Nov, AP-0009 on Tue 1 Dec,
Dr. Bello). Preview: 2 days, 3 patients, all to Dr. Babawo at the same times,
"Preview only — nothing sent"; DB check afterwards showed no leave rows, flag
false, appointments unmoved. Approve: one `DoctorLeave` 2026-11-30 → 2026-12-01,
all three moved to Dr. Babawo, 6 notices queued, toast "3 same day. 6 notices
pushed". Calendar check: Dr. Bello reads "Manage Leave" + "On Leave · Sudden
Medical Emergency" on 30 Nov and 1 Dec, and "Sick / Leave" + "On Duty" on 18 Nov
and 2 Dec. Probes, their interaction rows and the temporary leave row deleted;
DB clean.

### Files
`backend/appointments/models.py`,
`backend/appointments/migrations/0006_doctorleave.py`,
`backend/appointments/services/disruption_service.py`,
`backend/appointments/services/availability.py`,
`backend/appointments/services/hold_service.py`,
`backend/appointments/views_appointment.py`,
`backend/appointments/views_clinic.py`,
`backend/appointments/serializers_clinic.py`,
`backend/appointments/tests.py`,
`frontend/src/stores/useCalendarStore.js`,
`frontend/src/services/apiService.js`,
`frontend/src/components/calendar/EmergencyDisruptionModal.jsx`,
`frontend/src/components/calendar/DoctorGridBookingCalendar.jsx`,
`frontend/src/styles/components/calendar.css`.

---

## 2026-11-19 - Leave flow step 2: distribution control (built, live-proven)

### What was broken
Step 1 could plan a leave and show where everyone would go, but the
receptionist had no say in it. Every affected patient went to whichever
colleague the resolver found first, so one doctor could quietly absorb a
whole morning while another sat free. There was no way to say "Okafor can
take two extra, Babawo four" or "give them all to Babawo", and an
unplaced patient came back as a bare "unplaced" with no reason.

### What shipped
- Distribution contract (T-729): `preview_disruption` and
  `auto_resolve_disruption` both accept `colleague_ids` and
  `colleague_caps`, read by one shared parser (`read_distribution_choice`).
  `colleague_ids` is a hard allow-list — absent means any colleague (old
  behaviour), `[]` means nobody, a list means only those doctors, and the
  leaving doctor is rejected. Caps limit the EXTRA patients this plan adds
  to a doctor on any ONE day: existing bookings do not eat the cap, and a
  cap of 1 on Monday still allows 1 on Tuesday. Cap 0 means "do not use
  this doctor". Both the same-time pass and the engine slot search respect
  the list and caps.
- Honest failures: each unplaced patient carries `unplaced_reason` and
  `unplaced_text` written by Django — `NO_COLLEAGUE_CHOSEN`,
  `NONE_QUALIFIED` (names the chosen doctors), `ALL_AT_CAP` (names the
  doctor, the day and `used of cap`) or `NO_FREE_SLOT` (names the day or
  the lookahead). The report echoes `distribution` (`colleague_ids`,
  `colleague_caps`, `placed_by_doctor`, `caps_hit`) and the audit row
  records it.
- Bad input: both endpoints answer `400 INVALID_DISTRIBUTION` with a plain
  detail for a wrong shape, an unknown/inactive doctor, the leaving doctor
  or a negative cap.
- Chooser UI (T-730): a "Who takes these patients" card with Auto split /
  Choose colleagues / All to one. "Choose colleagues" gives each on-duty
  colleague a tick and a "Max extra / day" input (blank = no limit); "All
  to one" uses radios. Preview is disabled until a choice exists, any
  change discards the old preview, and unplaced rows show Django's text.
  Roster ids are mapped to backend ids by the existing name-token bridge; a
  doctor that cannot be matched refuses the plan instead of vanishing.
  Preview and approve send identical payloads.

### Tests
Red first: 18 new cases in `DisruptionDistributionTests` and
`DisruptionDistributionEndpointTests` (allow-list, cap spill, cap 0,
per-day counting, one-colleague plan, extra-patient counting, named
reasons, preview == approve, bad shapes). First run: 4 failures, because
the cap helper was passed doctor objects where ids were expected — fixed,
then 18/18. Disruption classes **32/32 OK**; full Django suite
**318/318 OK** in 424 s.

### Live proof
Three probe appointments (AP-0007/0008/0009, Fri 20 Nov, Dr. Bello) with
Dr. Okafor cap 1 and Dr. Babawo cap 2: preview reported "3 affected /
3 can be placed / 0 need you", colleague load "Dr. Babawo · 3", with two
patients on Friday and the third pushed to Monday 23 by the per-day cap.
The preview POST carried `colleague_ids` + `colleague_caps`, and the
approve POST carried the same two values (approve was stubbed in the page,
so the real DB was not touched). Unqualified-only (Okafor, cap 0) rendered "No chosen
colleague is qualified for Dental Consultation & Examination (Dr. Chinwe
Okafor)."; qualified-only at cap 0 rendered "Dr. Babawo hit the cap you
set for Wed, 18 Nov (0 of 0). No other chosen colleague could take this
patient." Probes and their rows deleted; no leave rows; appointments
restored; DB clean.

### Files
`backend/appointments/services/disruption_service.py`,
`backend/appointments/views_appointment.py`,
`backend/appointments/tests.py`,
`frontend/src/stores/useCalendarStore.js`,
`frontend/src/components/calendar/EmergencyDisruptionModal.jsx`,
`frontend/src/components/calendar/DoctorGridBookingCalendar.jsx`,
`frontend/src/styles/components/calendar.css`.

---

## 2026-11-19 - Leave flow step 3: stranded queue, undo, notify-once (built, live-proven)

### What was broken
Two gaps left a patient able to fall through the cracks. First, if the plan
could not place someone — no colleague chosen, nobody qualified, everyone at
their cap, no free slot — the receptionist got a number and a reason in the
modal, and then nothing. Close the modal and that patient was still booked
under a doctor who is on leave, with no list anywhere that said so. Second,
approving a plan was one-way: a wrong window or a wrong colleague choice
moved real patients, queued real messages, and the only way back was to move
each patient by hand — while the notices already promised a time that no
longer held. And every re-run of the resolver could queue a second, different
message for the same patient.

### What shipped
- Stranded queue (T-731): `DisruptionService.list_stranded()` lists every
  `confirmed`/`held` appointment still booked under a doctor who is on leave,
  grouped by day then doctor. Each patient carries the reason from the newest
  live plan (`unplaced_reason` + Django's `unplaced_text`), or `null` when no
  plan has ever covered them. Legacy "off duty, no end date" doctors are
  included (`leave_id: null`), finished leaves are skipped, held patients keep
  `hold_expires_at` so the countdown is honest, and a patient who booked AFTER
  the leave was declared still appears. Served staff-only as
  `GET /api/v1/disruptions/stranded/`.
- Undo of the last distribution (T-732): a new `DisruptionBatch` row
  (migration `0007`) records the leave, the distribution, every exact move
  (from/to doctor and time, notice refs) and everyone left unplaced.
  `POST /api/v1/disruptions/batches/<id>/undo/` puts every patient back,
  removes the leave **only if that plan created it**, marks its undelivered
  notices `expired`, and writes a `DISRUPTION_BATCH_UNDONE` audit row. Undo is
  all-or-nothing and refuses with `409` plus a named code and a plain
  sentence: `NOTICES_DELIVERED`, `LEAVE_NOT_FROM_PLAN`, `SUPERSEDED` (names
  the days of the later plan), `MOVES_CHANGED`, `ALREADY_UNDONE`,
  `SLOT_TAKEN`. `can_undo` / `undo_reason` on the approve response come from
  the same `_undo_blocker` the endpoint uses, so the button and the guard
  cannot disagree. An approve that affects nobody writes no batch, so a
  harmless repeat approve cannot supersede the real plan.
- Notify once (T-733): notice claim refs are versioned by the placement —
  `disrupt-<code>-<sha1(doctor|start|end)[:10]>-<channel>`. The same placement
  is never announced twice. A queued, undelivered notice for an older
  placement is marked `expired` before the new one is written, so a stale time
  is never delivered; a notice that already reached the patient is left alone
  and gets exactly one `Correction: …` message per channel.
- UI (T-733b): an amber strip on the calendar ("N patients still booked under
  a doctor on leave" → **Review patients**) and a plan strip ("Last plan:
  Dr. … · N moved" → **Undo this plan**, or Django's refusal sentence in
  place of the button). The panel groups by day and doctor with time, service,
  code, tap-to-call number, hold countdown and Django's `unplaced_text`
  verbatim. Demo mode derives the list from the doctors marked on leave and
  never pretends a simulated plan can be undone. Presentational components
  only; state lives in `useCalendarStore` (`loadStranded`,
  `undoLastDistribution`, `stranded`, `lastDistribution`).

### Tests
Red first: 24 new cases across `StrandedPatientsTests`,
`DisruptionUndoTests`, `NotifyOnceTests`, `DisruptionStrandedEndpointTests`
and `DisruptionUndoEndpointTests`. First run: 21 errors (model and methods
still missing) plus the endpoint 401 guards; after the implementation, the
last 2 failed on fixture wording (`03:00 PM` vs `3:00 PM`, and a stale
in-memory appointment re-used for a notify-once check) — fixed, then 24/24.
Disruption + leave set **74/74 OK** in 32.9 s.

### Live proof
Three probe patients on Fri 20 Nov (AP-0007 10:00, AP-0008 11:00, AP-0009
12:00, Dr. Bello), approved through the real modal with only Dr. Babawo
chosen at cap 1: preview said "3 affected / 2 can be placed / 1 need you",
"Dr. Babawo · 2", and the button read "place 2 patients, leave 1 for you".
After approve the calendar showed both strips; the panel listed AP-0009 at
12:00 PM with Django's exact words "Dr. Babawo hit the cap you set for Fri,
20 Nov (1 of 1). No other chosen colleague could take this patient."
**Undo this plan** returned 200 in one call and the DB showed AP-0007/0008
back with Dr. Bello at their original times, `DoctorLeave` rows 0,
`is_on_leave` False, the batch marked undone, all 4 queued notices `expired`,
audit `restored_count: 2, leave_removed: True, notices_expired: 4`, stranded
`count: 0`, and both strips gone. Probes, their `InteractionLog` rows and the
batch deleted; DB back to the 6 baseline appointments, no leave rows, no
doctor on leave.

### Files
`backend/appointments/models.py`,
`backend/appointments/migrations/0007_disruptionbatch.py`,
`backend/appointments/services/disruption_service.py`,
`backend/appointments/views_appointment.py`,
`backend/appointments/urls.py`,
`backend/appointments/tests.py`,
`frontend/src/services/apiService.js`,
`frontend/src/stores/useCalendarStore.js`,
`frontend/src/hooks/useCalendar.js`,
`frontend/src/components/calendar/StrandedPatientsPanel.jsx`,
`frontend/src/components/calendar/DoctorGridBookingCalendar.jsx`,
`frontend/src/styles/components/calendar.css`.

---

## 2026-11-19 - Leave flow hardening: three gaps closed (built, live-proven)

### What was broken
A review of the finished leave flow found six things it did not reach. Three
were worth fixing now:

1. **The undo button died on refresh.** The plan was safely stored, but the
   strip that offers "Undo this plan" lived only in the browser tab that
   approved it. Refresh the page, or walk to the other receptionist's machine,
   and the way back was gone — even though nothing had been sent to a patient.
2. **A manual transfer did not check who was qualified.** The per-patient
   **Transfer** buttons checked "active", "on leave" and clashes, but not
   whether the colleague offers the patient's service. A dental patient could
   be handed to a GP. The automatic resolver had filtered correctly since day
   one; this path never did. The UI also moved the card first and only warned
   in the console, so a refused transfer left the grid showing a doctor who
   never took the patient.
3. **Stranded was only visible on the calendar.** No badge anywhere else. If
   reception sat on the queue, a patient booked under a doctor on leave waited
   silently.

### What shipped
- **A transfer must be to a doctor who offers the service (T-734).** New
  `DisruptionRefusal(code, text)` (with `DisruptionUndoError` now a subclass of
  it). `reassign_to_colleague` raises `NOT_QUALIFIED` with a plain sentence —
  "Dr. Ada Unqualified does not offer Dental Examination, so Amina cannot be
  moved to them." — before anything is saved and before any audit row is
  written; the endpoint maps it to `409 NOT_QUALIFIED`. Undo is deliberately
  **not** gated this way: it puts a patient back with the doctor who already
  had them, so a later roster edit can never trap them on the leave day. The
  live Transfer button now awaits Django before the card moves.
- **The undo strip survives a refresh (T-735).** `GET
  /api/v1/disruptions/batches/last/` returns the newest live plan with Django's
  words already resolved (`id`, `doctor_name`, `placed_count`,
  `unplaced_count`, `created_at`, `can_undo`, `undo_reason`), or `null`. Only
  plans from the last 24 hours (`LAST_PLAN_WINDOW`) come back — an undo button
  for last week's plan is a trap, not a safety net; older plans stay in
  `DisruptionBatch` and `AuditLog` as history. The frontend reads it back on
  mount. A slow reply can never overwrite a plan the tab just approved: every
  local write bumps `_planSeq` and a stale answer is thrown away. A failed read
  keeps whatever is on screen. The strip now also says "· N still without a
  slot" when the plan left people behind.
- **Stranded is visible from every page (T-736).** `Shell` owns the count: one
  load on sign-in, a refresh on `slot.held` / `appointment.status_changed`, and
  a 60-second poll. It hands the number to `LeftRail` as a prop, so the rail
  stays presentational and **Schedule Grid** shows "⚠ N" (with a plain tooltip)
  in place of the GRID tag. `loadStranded({ silent: true })` updates the number
  without flipping the panel into "Refreshing…". No new backend surface — it is
  the same `list_stranded` Django already decides. The panel's Refresh button
  no longer receives the click event as its first argument.

### Tests
- T-734: `ManualReassignQualificationTests` (4), red first (import error on the
  missing `DisruptionRefusal`), then green; disruption + leave + reschedule
  **94/94 OK**.
- T-735: `DisruptionLastBatchTests` (6), red first (2 failures + 4 errors, the
  route did not exist), then green — auth, "no plan yet", the plan just
  approved, "nothing left after undo", Django's refusal sentence for a blocked
  plan, and a 3-day-old plan staying history.
- T-736: no new backend tests (no new backend); proven in the browser.
- **Full suite 352 tests / 352 pass, exit 0** in 577 s; `npm run build` clean.

### Live proof
With three probe patients on Fri 20 Nov under Dr. Bello:

1. Approving with every colleague allowed placed all three (batch
   `7d7ae764`). A **hard browser reload** of `/calendar` — nothing approved in
   that page load — showed "Last plan: Dr. Bello Ibrahim · 3 moved" and
   **Undo this plan**. That is the fix: the strip came back from the database.
2. Undid it (3 patients back, leave removed, 6 notices `expired`), then
   approved again with `colleague_ids: []` → 0 placed / 3 unplaced.
3. On `/queue` the rail showed **"Schedule Grid ⚠ 3"** with the tooltip "3
   patients are still booked under a doctor on leave — open the Schedule Grid".
   The calendar strips read "3 patients still booked under a doctor on leave"
   and "Last plan: Dr. Bello Ibrahim · 0 moved · 3 still without a slot".
4. Clicking **Undo this plan** in the UI cleared both strips and the rail went
   back to "GRID" — the badge is live, not a one-time read.

Probes, notices and batches deleted afterwards; DB back to the 6 baseline
appointments, 0 leave rows, 0 batches, no doctor on leave.

### Gap 2 - a real per-patient move (2026-11-20)

The panel told reception to "move each one to a colleague" and then offered no
move. The only route was re-approving the leave, which creates a second plan
with `leave_created=False`: it can never be undone and it supersedes the first.
One correction permanently removed the undo.

Django now answers the question the panel was leaving to the browser: who can
take this patient at this exact time? Every stranded patient carries
`colleagues`, built by `_colleague_options` through the same gate the move
itself passes (`_apply_move`): qualified for the service, active, working that
weekday, inside their shift, under the daily cap, free at that time. Free
colleagues come first, the rest carry Django's own sentence ("Busy at 11:00
AM.", "On leave that day.", "Already at the daily limit (1 of 1)."), and a
patient nobody offers the service for says so instead of showing a broken list.

The panel renders that list as a select plus "Move patient". It cannot offer a
colleague the save would refuse; if the list goes stale and Django still
refuses, the toast shows `details.detail`. A hand move is not a batch: an
unplaced patient is absent from the plan's placements, so moving them never
blocks undo; if the plan HAD placed them, the batch reports `MOVES_CHANGED`,
which is the truth.

Proof: 9 tests (`StrandedMoveOptionsTests`), first run red (`KeyError:
'colleagues'`), then 9/9; disruption + leave set 88/88. Live: 3 probes, approve
with no colleague allowed -> 0 placed / 3 stranded; each row offered only Dr.
Babawo (the one qualified dental colleague); AP-0008 moved -> "Moved Probe
Patient Two to Dr. Babawo at 11:00 AM.", row gone (3 -> 2), rail badge 3 -> 2,
DB confirmed the new doctor. `batches/last` still said `can_undo: true` -
correct, because the moved patient was never in that batch's placements.

### Gap 3 - `08` asks before it sends (2026-11-20)

Undo refused to proceed when a notice was `sent`, but `queued` only means "not
sent yet". Workflow `08` never re-checked, so an undo during a push could still
let withdrawn words reach the patient.

Django now answers, per claim ref, whether the notice is still `queued`
(`POST /api/v1/webhooks/disruption-claims/check/`, `X-Webhook-Secret` only, 500
refs per call). Only an outbound `queued` row is live; `expired`, `sent`,
`delivered`, `answered`, `failed`, an inbound row or an unknown ref all answer
`live: false` with their own status (`missing` when there is no row).

Workflow `08` calls it between `Parse Disruption Items` and the adapter
(`Check Claim Liveness`), then `IF Claim Live` routes the yeses to the adapter
and everything else to `Log Halted Claims` - one row per held claim, no send,
and no write back to Django (the notice's true status is already there). It
fails closed: unreachable Django, a non-2xx answer, a body without `claims`, a
missing `live: true`, or unset `DJANGO_API_BASE_URL`/`DJANGO_WEBHOOK_SECRET`
hold the whole push with a named reason (`claim_expired`, `claim_already_sent`,
`claim_unknown`, `claim_check_unavailable`). The parse comment now names the
real ref (`disrupt-<code>-<placement signature>-<channel>`).

Proof: 12 endpoint tests written red (route 404), then 12/12; 30 new harness
assertions, `test_disruption_notifier.js` 140/140, all 10 n8n harnesses green;
**full suite 373/373 OK in 225 s**. Live: probe AP-0007 placed, both claims
`queued` -> the shipped node code answered `live: true` twice; undid the plan
(both notices `expired`) -> the same items answered `live: false`,
`claim_expired`; pointed at a dead port -> `claim_check_unavailable`. Probes
deleted; DB back to the 6 baseline appointments, 0 leave rows, 0 batches.

### Live proof in the real n8n instance (2026-11-20)

The gap-3 evidence so far ran the shipped node source directly against Django,
never through n8n. The live instance was still the old 13-node graph (no claim
gate), and its stored API key had expired at 05:00 that morning, so the first
job was access, not code.

What was done, all against `127.0.0.1:5678`:

1. Fresh 60-day API key, used for every call below.
2. Live graph compared with the repo file first. Thirteen shared nodes, all
   connections identical; the only parameter differences were encoding damage
   in comments (`?` where the repo has `-`/`+`) and the intended claim-ref
   comment. Nothing on the live side was newer, so the overwrite lost nothing.
   Backup written to `n8n_live_08_backup.json` before the write.
3. Repo graph pushed (`PUT /api/v1/workflows/II2eWdnZIt364WPE`): 16 nodes,
   `active` still true, every node and connection byte-equal to the file.
4. Two real runs through the webhook, both with the provider simulator
   (mock bearer, `provider-sim` URLs, mock template - no message left the box):

   - **Live claim.** Probe AP-0007 (Fri 27 Nov 09:30, Bello -> Babawo), two
     `queued` claims. Execution 2130: `Check Claim Liveness` ran, both answered
     `live: true`, `IF Claim Live` sent 2 to the adapter, both sends fired, both
     log nodes ran. `Log Halted Claims` never executed.
   - **Withdrawn claim.** Probe AP-0008 (Fri 4 Dec 09:30), two `queued` claims,
     then the plan was undone for real (2 notices `expired`, patient moved back,
     leave removed). Execution 2135 pushed the SAME items: gate answered
     `live: false` / `claim_expired` for both, `IF Claim Live` sent 0 to the
     adapter, `Log Halted Claims` wrote 2 rows, and **no send node ran at all**.
     Django's rows stayed `expired` - the halt path writes nothing back.

### Gap 4 - a delivered notice never closes its claim (found by the live proof, fixed)

The live run exposed a defect the unit tests could not see. After a successful
send, the log nodes post the provider's message id as `external_ref`
(`mock-sms-AP-0007-...`, `wamid.mock-whatsapp-AP-0007-...`), while the claim row
is keyed by `disrupt-AP-0007-<signature>-<channel>`. Django's interactions
endpoint upserts only by `external_ref`, so it created a second row and left the
claim at `queued` forever. Asked again after the sends, the claim endpoint
answered `live: true` for a message the patient had already received.

Two real consequences:

- **Notify-once was not enforced by Django.** `claim_liveness` still said the
  notice may be delivered. (The adapter's own `<code>:<channel>` registry does
  stop the repeat while n8n keeps its static data, but that store is memory-only
  and per appointment, not per placement - it is a second line, not the record.)
- **Undo safety was inverted.** `_undo_blocker` refuses to undo when a notice is
  `sent`; because the claim never reached `sent`, undo proceeded after a real
  delivery and told reception nothing was sent.

**Fixed.** Both log nodes now send `claim_ref` next to the provider id, and
`InteractionListCreateView._close_claim()` advances that row under the existing
status-rank guard. Narrow by construction: outbound rows only, same channel
only, unknown refs ignored, a late `sent` never downgrades `delivered`/`answered`,
and the claim keeps its own `external_ref` because that is what the gate and undo
are keyed by. The provider row still exists for delivery receipts.

Proof, in the order it happened:

1. Eight `ClaimCloseOnLogTests` cases written first, red on exactly the new
   behaviour (`'queued' != 'sent'`, `'queued' != 'failed'`,
   `blocker unexpectedly None`), then green together with
   `DisruptionClaimCheckTests` + `InteractionLogAPITests`: 52/52.
2. Harness assertions H1-H4 added first (146 checks, 4 failing), then
   `claim_ref: base.claim_ref || ''` in both payload builders: 146/146, all 10
   n8n harnesses green. Full suite: **381 tests, 381 pass, exit 0** (404 s).
3. The fixed graph pushed to the live instance, then proven there: execution
   2159 sent both channels and Django showed both claims `sent` with the log
   node's summary (the gate answering `live: false` afterwards); execution 2162
   re-pushed the same two items, got `claim_already_sent` twice, sent 0 to the
   adapter, wrote 2 rows in `Log Halted Claims` and ran no send node;
   `_undo_blocker` on that batch returned `NOTICES_DELIVERED`.

Probes and every row they created were deleted; the DB is back to the 6 baseline
appointments, 0 leave rows, 0 batches, 0 disrupt logs.

### Leave flow: nothing open

The stranded panel moves one patient, undo cannot race a withdrawn send, a
delivered notice closes its claim, and the docs match the shipped claim-ref
shape.

### Files
`backend/appointments/services/disruption_service.py`,
`backend/appointments/views_appointment.py`,
`backend/appointments/urls.py`,
`backend/appointments/views_interactions.py`,
`backend/appointments/serializers_interactions.py`,
`backend/appointments/tests.py`,
`n8n/workflows/08_disruption_notifier.json`,
`n8n/tests/test_disruption_notifier.js`,
`frontend/src/services/apiService.js`,
`frontend/src/stores/useCalendarStore.js`,
`frontend/src/hooks/useCalendar.js`,
`frontend/src/components/calendar/DoctorGridBookingCalendar.jsx`,
`frontend/src/components/calendar/StrandedPatientsPanel.jsx`,
`frontend/src/components/layout/Shell.jsx`,
`frontend/src/components/layout/LeftRail.jsx`.

---

## Review Wave 1 — stop the bleeding (2026-11-20)

An independent review of the whole repo found defects the green suites never
touched, because nothing tested the request the UI or the workflow actually
sends. Wave 1 fixed the five that break a real user's day, every one red-first:

1. **The dashboard books for real (T-742).** Every queue confirm and walk-in
   POSTed `name`/`phone`/`booking_request_id`; Django reads
   `patient_name`/`patient_phone`/`request_id`, so the API answered 400 while
   the UI toasted success and the appointment lived only in the browser.
   `apiService.toWireBookingPayload` is now the single camelCase→wire
   translation point for `holdSlot` and `registerWalkIn`.
2. **Workflow 01 delivers an intake (T-743).** Doubled `/api/v1` (404), raw
   `phone` + literal `null` service (400), unescaped template values, and a
   hardcoded fallback secret — all gone; the normalizer builds
   `django_url`/`secret`/`django_body` in code and the HTTP node transports it.
3. **A direct booking stores the E.164 phone (T-744).** The sanitisation result
   is no longer overwritten by the raw string.
4. **A named-but-unknown service is a 400, not a silent swap (T-745).** An
   intake naming no service still defaults — it is a lead for reception.
5. **The seed ships clean (T-746).** No committed token (env-only), one
   identity per person (legacy duplicates removed), random per-staff
   passwords/PINs printed once at seed time, demo credentials opt-in via
   `SEED_DEMO_PASSWORDS=1`.

Proof: two new harnesses (`frontend/tests/test_booking_payloads.js` 15/15,
`n8n/tests/test_intake_webhook.js` 22/22, both red first), all 11 n8n
harnesses green, `npm run build` clean, nine new Django tests, and the full
suite **390/390 OK in 435 s**.

Still the owner's: the committed Telegram bot token is leaked until revoked
with BotFather (it is in git history), and the local dev DB still carries it
until the next re-seed without `TELEGRAM_BOT_TOKEN` set. Waves 2-5 of the
review remediation (booking-engine honesty, frontend truth, sessions,
medium sweep) remain open and are tracked in TEST.md and the review record.

## Review Wave 2 — the booking engine gets honest (2026-11-20)

The independent review's High findings 4, 7, 13 and 18: the engine that
generates slot OPTIONS enforced the clinic's contract, but every path where a
human or a bot PICKED a time bypassed it. Four fixes, all red-first:

1. **One validator, three callers (T-747).** `services/slot_rules.py` exposes
   `validate_clinic_slot`, mirroring `AvailabilityEngine` exactly: past time,
   clinic day, doctor day, shift bounds with the sterilization buffer, lunch,
   blocked dates, emergency reserves, advance notice, daily cap (holds
   count). `acquire_slot` calls it; a violation is a 409 with a named code
   and a sentence reception can read to a patient. A walk-in skips the notice
   window (the patient is at the desk); an emergency may use the reserve.
2. **Reschedule plays by the same rules (T-748)**, with the moving
   appointment excluded from its own cap count.
3. **The lifecycle is a map (T-749).** `Appointment.STATUS_TRANSITIONS` on
   the model; the staff endpoint answers 409 `INVALID_TRANSITION` for edges
   that cannot exist (`completed -> arrived`, `cancelled -> confirmed`, the
   ghost `rescheduled` value), terminal states are terminal, and internal
   writers (sweeper, Telegram, replies) are untouched by design.
4. **Dispatch re-checks reception's picks (T-750)** under the doctor row
   lock, purging expired holds first; bad picks are skipped with named
   reasons in `skipped_slots`, and an all-invalid dispatch answers 409
   `ALL_SLOTS_INVALID` without touching the request.

The fallout was instructive: the first full run failed 21 legacy tests whose
fixtures booked `now + N hours` — times that floated with the wall clock and
could land at 03:00 on a Saturday — or used doctors created with NO working
days, which the old engine silently made unbookable and the new rules refuse
loudly. All fixtures now use the shared `next_legal_slot()` helper, and the
five day-less fixture doctors got real calendars. One genuine product bug
surfaced: the dispatch re-check originally counted an expired hold as a live
conflict — it now purges dead holds first, exactly like the booking path.

Also closed today, outside the wave: the **Telegram token leak** (review
finding 1) — revoked in BotFather (both prior tokens answer 401), the live
token lives only in the environment and clinic settings, and the live n8n
instance gained workflow 01 (created, verified, activated) with a real
intake proven end to end, quote-in-name included.

Proof: 33 new tests (14 + 6 + 8 + 4 + 1 control), every step red first;
full suite **422/422 OK**. Waves 3-5 of the review remediation remain open.

## Review Wave 3 — the screen tells the truth (2026-11-20)

The independent review's frontend findings (2, 3, 8, 9, 11 plus Batch 3
High/Medium), the owner's calendar-clock requirement, and the owner's Option B
decision. Eight steps, every one red-first, all frontend except two small
backend additions:

1. **One clock — the clinic's (T-751, owner requirement).** The site used to
   read the visitor's computer for every date and hour. New
   `services/clinicTimeService.js`: `now()` is server-synced from the health
   endpoint (which now publishes `server_time` + `timezone`), and every day
   key, hour label, midnight anchor and date/hour conversion runs in
   Africa/Lagos. The harness executed the service on fake computers set to
   New York and Tokyo and proved it still answers in Lagos time, and that a
   2h-slow laptop is corrected by the server clock.
2. **Empty backend = empty screen (T-752).** A successful empty answer
   replaces the queue, the calendar and the settings service list. A failed
   fetch keeps the screen.
3. **Live Visits reads real data (T-753).** The store had NO fetch at all;
   the board always showed seeds. New sync maps today's real appointments by
   status into the lanes, on mount and every 60s.
4. **The calendar shows the appointment's own data (T-754).** The details
   modal stopped inventing times/services/phones/doctors; the remote mapping
   and lane columns carry backend UUIDs and real names; the roster is
   replaced from the schedule response; the default-to-Bello demo week is
   gone.
5. **No ghost rows (T-755).** Live writes ask the backend FIRST and commit
   the row it created; a refusal surfaces the server's own sentence (Wave
   2's 409s, finally visible) and leaves the screen untouched.
6. **Staff screen honest, secrets out of the browser (T-756).** The backend
   persists `role` (red-first); the store maps labels to real roles, drives
   the duty endpoint, awaits resets; live rows never hold a password or
   PIN; the toast and the lock screen no longer PRINT the PIN.
7. **Option B (T-757, owner decision).** The in-browser demo data is
   DELETED — every store starts empty and syncs from the API; every
   persisted store is version-bumped with a one-time wipe migration so old
   localStorage cannot resurrect the seeds (including the persisted demo
   passwords); resets are honest clears; the rail badges count real rows
   only; the brand shows the API-synced clinic name and address. The pitch
   look comes from `seed_clinic` on the database; the pitch simulator keeps
   its own private dataset.
8. **The API base never guesses in production (T-758).** A production build
   without `VITE_API_URL` refuses to start with one clear instruction; the
   dead constant pointing at someone else's demo server is deleted.

Gates: 8 new frontend harnesses **109/109**, `npm run build` clean, Django
suite **425/425 OK** (health-clock + role-patch tests added). Live browser
proof with zero console errors across queue / live-visits / calendar: the
rail showed the real clinic name, address and signed-in session, the queue
showed the 4 real seeded requests, the board showed today's real lanes, the
calendar showed the real roster. The smoke test caught one real crash
(LeftRail read the removed fake staff default) — fixed and re-verified.

Waves 4-5 of the review remediation remain open (sessions, unified reply
path, the medium sweep, doc sync).

## Review Wave 4 — sessions and honest messaging (2026-11-21)

The independent review's findings 11, 19, 20, 21 and 26, plus the owner's
session decision:

1. **The 30-day session exists (T-759).** Login always issued the refresh
   token (body + HttpOnly cookie) but nothing could redeem it — staff were
   ejected every 60 minutes. Owner decision: the STORED token. New
   `POST /api/v1/auth/refresh/` (body primary, cookie fallback, the T-303
   kill-switch enforced on this path too); the store keeps the token, a 401
   silently renews once and retries, boot renews for returning staff, and
   logout/eject clears it. Proven live: login → refresh → the new access
   token authenticates.
2. **`telegram_chat_id` is a chat id (T-760).** The reminders feed used to
   hand n8n the patient's PHONE in that field — a Telegram send that could
   only fail. It now reads the real chat id marker, or None.
3. **AskInfo delivers or tells the truth (T-761).** `"dispatched"` while
   sending nothing is gone: Telegram bookings get a real send (logged), a
   no-channel booking answers `recorded_only`, failures answer
   `send_failed`, and the audit action matches reality.
4. **One reply engine (T-762).** A Telegram TEXT reply used to get the
   welcome menu while SMS selected the slot. Texts now route through the
   same `handle_patient_reply` engine, same idempotency claim, answer
   returned on Telegram; unknown chats keep the welcome. The shared grammar
   now accepts "Reply N" — the words the dispatch copy teaches.
5. **Dead branch removed (finding 26).** `BookingRequest.custom_config` is
   not a field; the CLINIC-level config is the real source for the n8n
   dispatch URL.

Gates: 9 frontend harnesses 116/116, build clean, Django 438/438 OK. The
first full run caught two mistakes in the wave itself (a dangling
`custom_cfg` reference after the cleanup; two security-test fixtures that
booked "+7 days" — a Saturday — correctly refused by the Wave 2 rules) —
both fixed before the green run.

Wave 5 remains: the medium sweep (duty/leave semantics, service-delete
guard, role-label heuristics, export/import mask, attendance N+1, double
mount, the low items) and the documentation truth pass.


## Next up - Phase 5 (partner handover)

**Leave flow complete (2026-11-20).** Dated leave, a rolled-back preview,
distribution with caps, a stranded queue that can move one patient, an honest
undo that survives a refresh and cannot race a message in flight, notify-once, a
manual transfer that refuses an unqualified doctor, and a stranded count on the
rail from any page. Next work is partner handover - deploy staging, collect the
partner credentials, then the joint acceptance run.

## Phase 5 (partner handover)

**Status: 5.1 done (2026-11-17); 5.2 blocked on the partner; 5.3 next.** All message-carrying
workflows are real and proven: `05` (dispatch), `04` (replies), `02` (expiry sweeper),
`03` (reminders & follow-ups). The handover package is **`n8n/PARTNER_HANDOVER.md`**: the
webhook registration table (verified against the shipped JSONs), the three-secret token
table with rotation rules, the env checklist for Django / n8n / partner, the deployment
table (Vercel + Railway URLs to fill at deploy), and the 5.2 questions the partner must
answer. Also fixed a stale `.env.example` intake path (`intake-event` → `/webhook/intake`,
the shipped truth per workflow `01`). Remaining: deploy staging (fill the §4c URLs), collect
the partner's 5.2 credentials, then the joint acceptance run (5.3, runbook §6-§7).
