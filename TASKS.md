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
- [ ] **Task 1.4: One-Click Demo Seeder (`manage.py seed_clinic`)**
  - Populate default clinic settings (Cedarcare Specialist Clinic, Wuse 2, Abuja).
  - Seed admin and receptionist accounts (`admin@clinic.com`, `sarah@clinic.com` with PIN `1234`).
  - Seed doctors: Dr. Bello (Dentist, Mon-Fri 9am-5pm) and Dr. Okafor (General Practitioner, Mon-Sat 8am-4pm).
  - Seed services: Dental Consultation (30m + 10m buffer), Tooth Extraction (45m + 15m buffer), General Health Check-up (20m + 10m buffer).

---

## Phase 2: Availability Engine, Atomic Holds & Business Logic
- [ ] **Task 2.1: Deterministic Availability Calculator (`availability_service.py`)**
  - Doctor shift & working days filter.
  - Doctor service qualification matching.
  - Total block size calculation (`duration + buffer`).
  - Overlap & conflict detector against existing appointments, holds, and lunch breaks.
  - Emergency reserve protection (shields 1 floating slot per shift from regular booking).
  - Contiguous schedule scoring ($W_1 \dots W_4$) to avoid fragmented gaps.
- [ ] **Task 2.2: 2-Week Range & Nearest-Alternative Fallback**
  - Query slots within the patient's requested 2-week date window.
  - If 0 slots exist, automatically calculate the 3 earliest available slots immediately following the window and flag them as `is_alternative_date = True`.
- [ ] **Task 2.3: Atomic Slot Hold & Selection Engine (`hold_service.py`)**
  - Implement concurrency-safe `select_for_update()` transaction.
  - Acquire 15-minute temporary hold or instant confirmation.
  - Handle race conditions (first patient secures slot; second patient receives friendly alternate times).
- [ ] **Task 2.4: Doctor Sick Leave Disruption Protocol**
  - When doctor is marked `is_on_leave = True`, generate disruption alerts for affected bookings.
  - Implement 1-click reassignment to an available colleague at the same time.
  - Implement 1-click reschedule options generator for another day.
- [ ] **Task 2.5: 60-Second Expiry Cron Sweeper (`sweep_service.py`)**
  - Check `BookingRequest` records where `status = 'slots_offered'` and `offer_expires_at < now()`.
  - Transition to `offer_expired` and trigger re-engagement dispatch.
  - Check `Appointment` records where `status = 'held'` and `hold_expires_at < now()`.
  - Transition to `hold_expired` and free the slot back to the open pool.

---

## Phase 3: REST API Viewsets, Staff Auth & Real-Time Events
- [ ] **Task 3.1: Staff Authentication & Governance API**
  - `POST /api/v1/auth/login/`: Issues 30-day session with HTTP-Only JWT cookie.
  - `POST /api/v1/auth/pin-unlock/`: Verifies 4-digit PIN after 20-minute screen lock.
  - `POST /api/v1/admin/staff/`: Create new receptionist account for incoming shifts.
  - `POST /api/v1/admin/staff/{id}/reset-pin/`: 1-click PIN reset by admin.
  - `POST /api/v1/admin/staff/{id}/deactivate/`: 1-click instant deactivation with token blacklisting and immediate 401 session ejection.
- [ ] **Task 3.2: Intake & Booking Request API**
  - `POST /api/v1/booking-requests/`: Ingest Web / Telegram requests, phone sanitization, returning patient lookup.
  - `GET /api/v1/booking-requests/`: Queue list with status filters (`awaiting_review`, `re_requested`, `slots_offered`, `offer_expired`), ordered by FIFO (`created_at ASC`).
  - `POST /api/v1/booking-requests/{id}/check-slots/`: Calculate candidate slots.
  - `POST /api/v1/booking-requests/{id}/dispatch-offers/`: Receptionist approves/edits slots and initiates 1-hour window.
  - `POST /api/v1/booking-requests/{id}/ask-info/`: Sends pre-written or custom front-desk prompt to patient.
- [ ] **Task 3.3: Appointment & Live Visit Management API**
  - `POST /api/v1/appointments/hold/`: Patient selects slot; creates atomic hold/confirmation.
  - `PATCH /api/v1/appointments/{id}/status/`: Advance status (`arrived`, `in_consultation`, `completed`, `no_show`, `cancelled`).
  - `POST /api/v1/appointments/{id}/follow-up/`: Schedule doctor-directed follow-up task.
- [ ] **Task 3.4: Clinic Settings & Staff Directory API**
  - `GET / PATCH /api/v1/clinic/settings/`: Visual settings CRUD for non-technical managers.
  - `GET /api/v1/clinic/staff-directory/`: Roster of doctors and receptionists with live duty status and attendance metrics.
- [ ] **Task 3.5: Real-Time SSE Hub & Presence Broadcasting**
  - `GET /api/v1/realtime/events/`: Server-Sent Events endpoint streaming updates.
  - Broadcast `request.created`, `slot.held`, `offer.expired`, `status.updated`.
  - Broadcast `request.reviewing` presence badge when a receptionist opens a card.
- [ ] **Task 3.6: Analytics & Export API**
  - `GET /api/v1/analytics/summary/`: Total bookings, attendance vs no-shows, top doctors/services, front-desk response times.
  - `GET /api/v1/analytics/export/appointments/`: Stream CSV file.
  - `GET /api/v1/analytics/export/attendance/`: Stream CSV file.

---

## Phase 4: Receptionist Dashboard (React.js + Vanilla CSS)
- [ ] **Task 4.1: Frontend Foundation & Design System (`frontend/`)**
  - Scaffold React application with Vite.
  - Implement Vanilla CSS design system tokens in `src/index.css` (Clinical Slate/Teal palette, typography, glass accents, dark/light contrast inspired by Pinterest reference).
  - Global real-time SSE listener and audio chime audio context.
- [ ] **Task 4.2: Staff Authentication & 20-Minute PIN Lock Overlay**
  - Login view (Email & Password for 30-day session).
  - Idle timer (20 minutes inactivity triggers 4-digit numeric PIN pad overlay).
  - Immediate 401 Unauthorized handler (clears state and ejects deactivated staff).
- [ ] **Task 4.3: Master Navigation & Header**
  - Clinic branding, active shift indicator (`Shift: Morning | Receptionist: Sarah`), audio chime toggle, and `[Switch User / Log Out]`.
  - 5 Navigation Tabs: `Requests Queue`, `Live Visits`, `Staff Directory`, `Analytics`, `Clinic Settings`.
- [ ] **Task 4.4: Module 1 — Requests Queue & Review Cards**
  - 4 Filter Tabs: `[📥 New Requests (FIFO)]`, `[⚡ Re-Requested (Priority)]`, `[⌛ Expired Offers]`, `[📅 Today's Schedule]`.
  - Presence badge on card: `👀 Sarah is reviewing`.
  - Review Modal:
    - View/Edit patient contact, service, doctor preference, and 2-week date range.
    - Returning Patient badge with past visit history.
    - 1-Click `[⚡ Check Live Slots]`.
    - Proposed candidate slots with **Front-Desk Editing & Custom Slot Addition** (`[✏️ Edit / Swap]`, `[+ Add Custom Time]`).
    - `[💬 Ask for Info]` slide-over with pre-written clinical prompt dropdown and custom textarea.
    - `[🚀 Approve & Dispatch Options (1-Hour Expiry)]`.
- [ ] **Task 4.5: Module 2 — Live Clinic Visits Tracker**
  - Schedule view of today's appointments.
  - 1-Click Status Progression: `[➡️ Mark Arrived]` $\rightarrow$ `[🩺 In Consultation]` $\rightarrow$ `[✅ Completed]` / `[⚠️ No-Show]`.
  - Completion Modal: Toggle for Doctor-directed follow-up date and notes.
- [ ] **Task 4.6: Module 3 — Staff Directory & Attendance**
  - Grid of all doctors and receptionists.
  - Live duty status toggles: `🟢 On Duty` | `🟡 On Break` | `🔴 On Sick Leave`.
  - Daily metrics: patients seen today, appointments remaining, punctuality logs.
  - Admin controls: `[+ Add Staff]`, `[1-Click Reset PIN]`, `[1-Click Deactivate]`.
- [ ] **Task 4.7: Module 4 — Clinic Analytics & Reports**
  - KPI Cards: Total bookings, attendance rate %, no-show rate %, front-desk review speed.
  - Charts: Booking trends and busiest services.
  - 1-Click `[📥 Export Appointments CSV]` and `[📥 Export Attendance CSV]`.
- [ ] **Task 4.8: Module 5 — Visual Clinic Settings (No-Code UI)**
  - Clinic profile form (Name, phone, address, WhatsApp/Telegram bot credentials).
  - Operating hours and lunch break time pickers.
  - Rules toggles (60m offer expiry, buffer minutes, emergency reserve count, 24h & 2h reminder toggles).
- [ ] **Task 4.9: Client Pitch Simulator / Patient Web Widget**
  - Embeddable Patient Booking Form (2-week date picker, service selection).
  - Split-screen Telegram/WhatsApp interactive phone simulator for live client pitching.

---

## Phase 5: Telegram Bot Gateway & n8n Workflows
- [ ] **Task 5.1: Telegram Bot Integration Engine (`telegram_service.py`)**
  - Inbound webhook handler for `/start` and booking requests.
  - Send 1-hour slot offers with Telegram **Inline Keyboard Buttons** (`[1️⃣ 10:00 AM]`, `[2️⃣ 11:30 AM]`, `[3️⃣ 09:00 AM]`).
  - Send Instant Confirmation Card with reference code (`AP-1042`).
  - Send Pre-Expiry friendly reminder at 45 minutes (15 mins left).
  - Send Graceful Expiry & Re-engagement message at 60 minutes with `[🔄 See New Times]`.
  - Send 24-hour Pre-Visit Reminder with inline buttons: `[✅ I'll Be There]`, `[🔄 Reschedule]`, `[❌ Cancel]`.
  - Handle patient inline button clicks (Confirm, Cancel, Reschedule, Re-Request).
  - Send friendly no-show welfare message.
  - Send doctor leave colleague reassignment notice.
- [ ] **Task 5.2: n8n Workflow Templates (`n8n/`)**
  - `01_intake_webhook.json`: Ingests and normalizes external payloads into Django API.
  - `02_slot_expiry_cron.json`: 60-second cron sweeper triggering Django sweep API.
  - `03_reminder_flows.json`: Daily scheduler for 24h and 2h pre-visit notices.
  - `04_patient_response_handler.json`: Routes button responses and webhooks.

---

## Phase 6: End-to-End Testing, Audit Verification & Agency Package
- [ ] **Task 6.1: Concurrency & Atomic Lock Tests**
  - Verify simultaneous slot selection race condition handling.
  - Verify two receptionists opening and approving the same card simultaneously.
- [ ] **Task 6.2: End-to-End Lifecycle Verification**
  - Request submission $\rightarrow$ FIFO Queue $\rightarrow$ Receptionist slot edit & approval $\rightarrow$ Telegram button dispatch $\rightarrow$ Patient slot selection $\rightarrow$ 15m hold / instant confirmation $\rightarrow$ 24h reminder $\rightarrow$ Mark Arrived $\rightarrow$ Completed $\rightarrow$ Follow-up.
- [ ] **Task 6.3: Admin Deactivation & Session Revocation Test**
  - Verify that deactivating a receptionist immediately invalidates tokens, returns 401 on next click, and blocks PIN/password.
- [ ] **Task 6.4: White-Label Agency Template Packaging**
  - Export clean `client-config.example.json`.
  - Complete Railway and Vercel 1-click deployment documentation.
