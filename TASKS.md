# Master Actionable Task List & Work Breakdown

This document is the **single source of truth** for building the entire Receptionist-Approved Clinic Booking System.
Every decision, edge case, and feature discussed across all 8 planning stages is itemized below. We execute this file **step by step, one task after the other**.

---

## Phase 1: Django Backend & Core Relational Data Models
- [x] **Task 1.1: Backend Project Setup**
  - Scaffold Django project in `backend/` (`core` settings, `manage.py`).
  - Configure Django REST Framework, `django-cors-headers`, and SQLite database engine with MySQL/Postgres toggle via `DATABASE_URL`.
  - Set up timezone support (`TIME_ZONE = 'Africa/Lagos'`, `USE_TZ = True`).
- [x] **Task 1.2: Database Models & Relational Schema (`appointments/models.py`)**
  - `ClinicSetting`: Clinic name, phone, address, operating hours (open/close/lunch break), 60m offer expiry, 15m hold expiry, default buffer, emergency slots per shift, 24h & 2h reminder toggles.
  - `StaffUser`: Email, full name, password hash, 4-digit quick PIN hash, role (`receptionist`, `doctor`, `clinic_admin`), `is_active` boolean, `last_login`.
  - `Doctor`: Name, email, phone, specialty, working days JSON `[1,2,3,4,5]`, shift start/end times, `is_active`, `is_on_leave` toggle.
  - `Service`: Name, category, duration minutes, buffer minutes, price.
  - `DoctorService`: Many-to-many mapping linking doctors to qualified services with optional custom duration override.
  - `AvailabilityRule`: Doctor FK (nullable for clinic-wide), rule type (`break`, `blocked_date`, `emergency_reserve`), start/end datetimes, reason.
  - `BookingRequest`: Request code (`REQ-2026-0042`), patient name, phone (E.164), patient type (`new` / `returning`), previous patient FK, service FK, preferred doctor FK (nullable), preferred 2-week date range (`start`, `end`), preferred time window (`morning`, `afternoon`, `evening`), channel (`web`, `telegram`), status (`awaiting_review`, `slots_offered`, `offer_expired`, `converted`, `rejected`), `offer_expires_at`, `created_at`.
  - `SlotOffer`: Request FK, Doctor FK, `start_datetime`, `end_datetime`, `is_alternative_date` boolean, `offered_at`, `expires_at`, `is_selected`.
  - `Appointment`: Code (`AP-1042`), Patient name, phone, Doctor FK, Service FK, BookingRequest FK, `start_datetime`, `end_datetime`, status (`held`, `confirmed`, `arrived`, `in_consultation`, `completed`, `cancelled`, `no_show`, `hold_expired`), `hold_expires_at`, `confirmed_at`, `arrival_at`, `completed_at`, `cancelled_at`, cancellation reason.
  - `FollowUpTask`: Appointment FK, Doctor FK, follow-up date, notes, `reminder_sent`, `is_completed`.
  - `AuditLog`: Timestamp, Actor (staff name/ID), Action, Entity Name, Entity ID, Changes JSON, IP address.
- [x] **Task 1.3: Database Migrations**
  - Generate initial migrations (`makemigrations`) and execute schema creation (`migrate`).
- [x] **Task 1.4: One-Click Demo Seeder (`manage.py seed_clinic`)**
  - Populate default clinic settings (Cedarcare Specialist Clinic, Wuse 2, Abuja).
  - Seed admin and receptionist accounts (`admin@clinic.com`, `sarah@clinic.com` with PIN `1234`).
  - Seed doctors: Dr. Bello (Dentist, Mon-Fri 9am-5pm) and Dr. Okafor (General Practitioner, Mon-Sat 8am-4pm).
  - Seed services: Dental Consultation (30m + 10m buffer), Tooth Extraction (45m + 15m buffer), General Health Check-up (20m + 10m buffer).

---

## Phase 2: Availability Engine, Atomic Holds & Business Logic
- [x] **Task 2.1: Deterministic Availability Calculator (`availability.py`)**
  - Doctor shift & working days filter.
  - Doctor service qualification matching.
  - Total block size calculation (`duration + buffer`).
  - Overlap & conflict detector against existing appointments, holds, and lunch breaks.
  - Emergency reserve protection (shields 1 floating slot per shift from regular booking).
  - Contiguous schedule scoring ($W_1 \dots W_4$) to avoid fragmented gaps.
- [x] **Task 2.2: 2-Week Range & Nearest-Alternative Fallback**
  - Query slots within the patient's requested 2-week date window.
  - If 0 slots exist, automatically calculate the 3 earliest available slots immediately following the window and flag them as `is_alternative_date = True`.
- [x] **Task 2.3: Atomic Slot Hold & Selection Engine (`hold_service.py`)**
  - Implement concurrency-safe `select_for_update()` transaction.
  - Acquire 15-minute temporary hold or instant confirmation.
  - Handle race conditions (first patient secures slot; second patient receives friendly alternate times).
- [x] **Task 2.4: Doctor Sick Leave Disruption Protocol (`disruption_service.py`)**
  - When doctor is marked `is_on_leave = True`, generate disruption alerts for affected bookings.
  - Implement 1-click reassignment to an available colleague at the same time.
  - Implement 1-click reschedule options generator for another day.
- [x] **Task 2.5: 60-Second Expiry Cron Sweeper (`sweep_service.py` & `run_expiry_sweep.py`)**
  - Check `BookingRequest` records where `status = 'slots_offered'` and `offer_expires_at < now()`.
  - Transition to `offer_expired` and trigger re-engagement dispatch.
  - Check `Appointment` records where `status = 'held'` and `hold_expires_at < now()`.
  - Transition to `cancelled` with reason and free the slot back to the open pool.

---

## Phase 3: REST API Viewsets, Staff Auth & Real-Time Events
- [x] **Task 3.1: Staff Authentication, Dual-Mode JWT & Governance API**
  - Implement `CookieJWTAuthentication`: Dual-mode token transport with `HttpOnly`, `Secure`, `SameSite=Lax` cookies for the React web app + `Authorization: Bearer` header for API/bot clients.
  - Implement real-time `is_active` DB validation inside the auth class: 1-click admin deactivation immediately revokes active sessions with a 401 response and clears cookies.
  - `POST /api/v1/auth/login/`: Issues access token (60m) and refresh token (30 days) with token rotation.
  - `POST /api/v1/auth/pin-unlock/`: Verifies 4-digit PIN against salted PBKDF2 hash (`quick_pin_hash`).
  - 3-Strike Brute-Force Shield: 3 consecutive wrong PINs trigger 60s cooldown, password-only fallback, and log `SECURITY_PIN_LOCKOUT_TRIGGERED` to `AuditLog`.
  - `POST /api/v1/admin/staff/`: Create new receptionist account for incoming shifts.
  - `POST /api/v1/admin/staff/{id}/reset-pin/`: 1-click PIN reset by admin.
  - `POST /api/v1/admin/staff/{id}/deactivate/`: 1-click instant deactivation with immediate 401 session ejection.
- [x] **Task 3.2: Intake & Booking Request API with Anti-Abuse & Deduplication**
  - `POST /api/v1/booking-requests/`: Ingest Web / Telegram requests with IP rate limiting (5 req / 10 min) and hidden honeypot trap (`clinic_web_trap`) to silently drop bot attacks.
  - Automatic E.164 phone sanitization and returning patient dossier matching (zero-diagnosis leakage: attendance reliability % and visit history only).
  - Webhook Security: Validate Telegram `X-Telegram-Bot-Api-Secret-Token` and WhatsApp HMAC-SHA256 signature; enforce deduplication via `IdempotencyKey`.
  - `GET /api/v1/booking-requests/`: Queue list with status filters (`awaiting_review`, `re_requested`, `slots_offered`, `offer_expired`), ordered by FIFO (`created_at ASC`).
  - `POST /api/v1/booking-requests/{id}/check-slots/`: Calculate candidate slots.
  - `POST /api/v1/booking-requests/{id}/dispatch-offers/`: Receptionist approves/edits slots and initiates 1-hour window.
  - `POST /api/v1/booking-requests/{id}/ask-info/`: Sends pre-written or custom front-desk prompt to patient.
- [x] **Task 3.3: Appointment & Live Visit Management API**
  - `POST /api/v1/appointments/hold/` and `/api/v1/slots/hold/`: Patient selects slot; creates atomic hold/confirmation.
  - `PATCH /api/v1/appointments/{id}/status/`: Advance status (`arrived`, `in_consultation`, `completed`, `no_show`, `cancelled`).
  - `POST /api/v1/appointments/{id}/follow-up/`: Schedule doctor-directed follow-up task.
  - `POST /api/v1/appointments/{id}/reassign-leave/`: 1-click colleague reassignment when doctor takes sick leave.
- [x] **Task 3.4: Clinic Settings & Staff Directory API**
  - `GET / PATCH /api/v1/clinic/settings/`: Visual settings CRUD for non-technical managers.
  - `GET /api/v1/clinic/staff-directory/`: Roster of doctors and receptionists with live duty status and attendance metrics.
- [x] **Task 3.5: Real-Time SSE Hub & Presence Broadcasting**
  - `GET /api/v1/realtime/events/`: Server-Sent Events endpoint streaming updates.
  - Broadcast `request.created`, `slot.held`, `offer.expired`, `status.updated`.
  - Broadcast `request.reviewing` presence badge when a receptionist opens a card.
- [x] **Task 3.6: Analytics & Export API**
  - `GET /api/v1/analytics/summary/`: Total bookings, attendance vs no-shows, top doctors/services, front-desk response times.
  - `GET /api/v1/analytics/export/appointments/`: Stream CSV file.
  - `GET /api/v1/analytics/export/attendance/`: Stream CSV file.

---

## Phase 4: Receptionist Dashboard & Admin Hub (React.js + Vanilla CSS)
- [x] **Task 4.1: Architecture, Design Tokens & Master Navigation Shell (`frontend/`)**
  - Scaffold React application with Vite 8 + React 19.
  - Implement Vanilla CSS design system tokens in `src/styles/tokens.css` based strictly on `tasteskill.dev` (`#0f0f0f` canvas, `#121212` / `#141414` elevated surfaces, `#1f1f1f` hairlines, ember/amber gradients `#ffb547` $\rightarrow$ `#ff6b3d` $\rightarrow$ `#ff4f79`).
  - Implement anti-overflow and responsive guards in `src/styles/layout.css` (`min-width: 0` on flex items, `overflow-x: hidden` viewport bounds, custom dark scrollbars, `tabular-nums`).
  - Build headless `appModeStore.js` with 1-click `[● Live API / Demo Mode]` switcher pill and active session state.
  - Build presentational `LeftRail.jsx` (256px desktop width, collapsible to 68px on tablet) with clinic branding, active navigation indicators, audio chime toggle, and PIN lock trigger.
  - Build top `Header.jsx` with doctor live duty status chips (`Dr. Bello 🟢` · `Dr. Okafor 🟡`), digital tabular clock, and Double-Booking Shield indicator.
  - Setup React Router shell with routes: `/queue`, `/calendar`, `/live-visits`, `/admin/staff`, `/admin/settings`, `/simulator`.
- [x] **Task 4.2: Staff Authentication & 20-Minute PIN Lock Overlay**
  - Headless hook: `usePinLock.js` (20-min idle activity listener, 4-digit verification math, failed attempt throttling).
  - Web Audio API synth: `src/services/soundService.js` (clean queue arrival chime & urgency alert).
  - Presentational components: `LoginView.jsx` (HttpOnly cookie auth) and `PrivacyLockModal.jsx` (frosted backdrop `backdrop-filter: blur(18px)`, 4-dot PIN entry, numpad + physical keyboard listener).
  - 3-Strike Brute-Force Shield: 60-second cooldown timer, numpad lock, and master password fallback.
  - Immediate `401 Unauthorized` session ejection (clears state, revokes credentials, and ejects to login).
- [x] **Task 4.3: Inbound Triage Queue & Candidate Slot Review Modal**
  - Headless store: `useQueueStore.js` (FIFO queue ordering, 4 status filters: `[📥 New Requests]`, `[⚡ Re-Requested (Priority)]`, `[⌛ Expired Offers]`, `[📅 Today's Schedule]`).
  - Presentational components: `TriageQueuePane.jsx` and `QueueCard.jsx` with visual aging badges (Green $\rightarrow$ Amber $\rightarrow$ Red) and desk presence badge (`👀 Sarah is reviewing`).
  - Review Modal:
    - View/Edit patient contact with international E.164 phone input (defaulting to Nigeria `+234`).
    - Returning Patient Recognition Drawer: automatically recognizes phone, displays attendance reliability score (`🟢 100% Reliable (4/4)`), and past visit history with Zero-Diagnosis Exposure (HIPAA/NDPR).
    - 1-Click `[⚡ Check Live Slots]` integrating availability engine candidate slots.
    - Front-Desk Candidate Slot Editing: Doctor Swapping drawer (`[✏️ Edit / Swap]`), Granular Time Scrubber, and Custom Slot addition (`[+ Add Custom Time]`) with live sanitization buffer verification.
    - `[💬 Ask for Info]` slide-over with pre-written clinical prompt dropdown and custom textarea.
    - `[🚀 Approve & Dispatch Options (1-Hour Expiry)]` dispatch trigger.
- [x] **Task 4.4: Master Clinical Calendar Grid (`/calendar`)**
  - Headless store: `useCalendarStore.js` (aggregates doctor shifts, confirmed bookings, temporary holds, and open capacity).
  - Multi-Doctor Schedule Columns (Dr. Bello, Dr. Okafor) with Day / Week / Month view toggle.
  - Left-hand sticky time-gutter (`08:00 – 18:00` WAT in 15-minute increments).
  - 5 Distinct Color-Coded Schedule Blocks:
    - Confirmed Appointments (Forest Emerald `#112316` + `#27a644`)
    - Active 15-Minute Temporary Holds (Deep Amber `#26180b` with real-time countdown `⏳ 08:42`)
    - Sanitization Buffer Blocks (Striped dark charcoal `░░░ 10m Buffer ░░░`)
    - Floating Emergency Walk-In Reserve (Purple shield `#1a1228` + `#a855f7`)
    - Free Available Slots (Dotted surface `#141414`, hover `#ff6b3d`)
  - Dynamic Duration-Aware Gap Dimming: automatically dims gaps shorter than treatment duration + buffer (e.g. 15m free vs 40m needed).
  - Real-time cell invalidation via SSE (`calendar.slot_updated`) with smooth in-place color transitions (Risk R-14).
  - 1-Click Doctor Emergency Leave Disruption Protocol (Risk R-15).
  - Instant Walk-In Quick Booking drawer on free slot click.
- [x] **Task 4.5: Live Clinic Visits 3-Swimlane Flow (`/live-visits`)**
  - Headless store: `useVisitsStore.js` (Today's scheduled appointments).
  - 3 Linear-style Kanban Swimlanes: `🕒 Waiting Room` $\rightarrow$ `🩺 In Consultation` $\rightarrow$ `✅ Completed Today`.
  - Real-time tabular duration timers (`⏱️ Waiting: 14:22` turns amber at 20m, rose at 35m; active consultation elapsed progress bar).
  - 1-Click Status Progression: `[➡️ Send into Consultation]` $\rightarrow$ `[✅ Complete Consultation]`.
  - Doctor-Directed Follow-Up Recall Modal: Preset recall chips (`[1-Wk Post-Op]`, `[2-Wks Stitch Check]`, `[6-Mos Routine]`) + custom date picker and notes.
  - `[💌 Send Friendly Welfare Message]` recovery action for no-shows.
- [x] **Task 4.6: Staff Roster, Attendance & Clinic Analytics Bento (`/admin/staff`)**
  - Headless store: `useStaffStore.js`.
  - Doctor & Receptionist Roster Grid: Live duty status toggles (`🟢 On Duty`, `🟡 On Break`, `🔴 On Sick Leave`).
  - Real-time attendance, punctuality logs, and patients seen today.
  - Admin governance controls: `[+ Add Staff]`, `[1-Click Reset PIN]`, `[1-Click Deactivate (Immediate 401 Session Revocation)]`.
  - Analytics KPI Bento: Total bookings, attendance rate %, no-show rate %, front-desk triage review speed, booking trends chart, and 1-click `[📥 Export Appointments CSV]` / `[📥 Export Attendance CSV]`.
- [x] **Task 4.7: Visual Clinic Settings & White-Label Config Exporter (`/admin/settings`)**
  - Headless store: `useSettingsStore.js`.
  - Visual non-technical manager form: Clinic profile (Name, phone, address, WhatsApp/Telegram bot credentials).
  - Operating hours and lunch break time-pickers.
  - Scheduling engine rules: 60m offer expiry, 15m hold expiry, default buffer minutes (10m), emergency slots per shift (1), 24h & 2h reminder toggles.
  - 1-Click `client-config.json` download and live preview generator for zero-code clinic onboarding.
- [x] **Task 4.8: Client Pitch Simulator & Patient Web Booking Widget (`/simulator`)**
  - Headless hook: `usePitchSimulator.js`.
  - Dual-channel simulated mobile device frame: `[🌐 Web Booking Form]` / `[💬 Telegram Bot Chat]`.
  - Interactive patient booking intake (service picker, 2-week date range, E.164 phone input).
  - Real-time bidirectional synchronization: Submitting from the phone instantly rings front-desk audio chime and injects card into the Triage Queue in <300ms.

---

## Phase 5: Telegram Bot Gateway & n8n Workflows
- [x] **Task 5.1: Telegram Bot Integration Engine (`telegram_service.py`)**
  - Inbound webhook handler for `/start` and booking requests.
  - Send 1-hour slot offers with Telegram **Inline Keyboard Buttons** (`[1️⃣ 10:00 AM]`, `[2️⃣ 11:30 AM]`, `[3️⃣ 09:00 AM]`).
  - Send Instant Confirmation Card with reference code (`AP-1042`).
  - Send Pre-Expiry friendly reminder at 45 minutes (15 mins left).
  - Send Graceful Expiry & Re-engagement message at 60 minutes with `[🔄 See New Times]`.
  - Send 24-hour Pre-Visit Reminder with inline buttons: `[✅ I'll Be There]`, `[🔄 Reschedule]`, `[❌ Cancel]`.
  - Handle patient inline button clicks (Confirm, Cancel, Reschedule, Re-Request).
  - Send friendly no-show welfare message.
  - Send doctor leave colleague reassignment notice.
- [x] **Task 5.2: n8n Workflow Templates (`n8n/`)**
  - `01_intake_webhook.json`: Ingests and normalizes external payloads into Django API.
  - `02_hold_and_offer_expiry_cron.json`: 60-second cron sweeper triggering Django sweep API.
  - `03_reminder_flows.json`: Daily scheduler for 24h and 2h pre-visit notices.
  - `04_patient_response_handler.json`: Routes button responses and webhooks.
  - `05_slot_offer_dispatcher.json`: Receptionist approved slot dispatch bridge.
  - `README.md`: 15-minute agency quickstart guide and environment variable blueprint.

---

## Phase 6: End-to-End Testing, Audit Verification & Agency Package
- [x] **Task 6.1: Concurrency & Atomic Lock Tests**
  - Verify simultaneous slot selection race condition handling (`test_concurrent_slot_selection_atomic_lock_t601`).
  - Verify two receptionists opening and approving the same card simultaneously (`test_dual_receptionist_simultaneous_dispatch_t601`).
- [x] **Task 6.2: End-to-End Lifecycle Verification**
  - Request submission $\rightarrow$ FIFO Queue $\rightarrow$ Receptionist slot edit & approval $\rightarrow$ Telegram button dispatch $\rightarrow$ Patient slot selection $\rightarrow$ 15m hold / instant confirmation $\rightarrow$ 24h reminder $\rightarrow$ Mark Arrived $\rightarrow$ Completed $\rightarrow$ Follow-up (`test_full_10_step_lifecycle_e2e_t602`).
- [x] **Task 6.3: Admin Deactivation & Session Revocation Test**
  - Verify that deactivating a receptionist immediately invalidates tokens, returns 401 on next click, and blocks PIN/password (`test_admin_killswitch_session_revocation_t603`).
- [x] **Task 6.4: White-Label Agency Template Packaging**
  - Export clean `client-config.example.json`.
  - Complete Railway and Vercel 1-click deployment documentation (`DEPLOYMENT_GUIDE.md`).
