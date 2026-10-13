# Master Architecture, Security, Scalability & Implementation Blueprint

## 1. Executive Summary & Vision

This project is an **Agency-Grade Production Template for a Receptionist-Approved Clinic Booking System** (`MedPulse`).
It bridges patient self-service booking (Web, Telegram, WhatsApp) with front-desk human gatekeeping:
- The system parses requests, runs clinic availability rules, and generates candidate slots.
- The **receptionist reviews, edits, and approves** the candidate options before dispatch.
- The patient selects a slot within a **1-hour offer countdown**, securing a **15-minute atomic database hold**.
- Automated cron sweepers manage expirations, re-engagement workflows, and reminders.

---

## 2. Technology Stack & Deployment Targets

| Tier | Technology | Rationale | Deployment |
| :--- | :--- | :--- | :--- |
| **Frontend** | React 18 + Vanilla CSS (Vite) | High performance, zero CSS framework bloat, rich custom glassmorphism aesthetic. | **Vercel** |
| **Backend** | Python 3.12 + Django 6 + DRF | Mature ORM, transactional safety, clean REST endpoints, built-in admin & auth. | **Railway** |
| **Database** | SQLite (Dev) $\rightarrow$ PostgreSQL (Prod) | 1-click engine switching via `dj-database-url` and Django migrations. | **Railway Postgres** |
| **Automation** | n8n (Self-hosted) | Visual orchestration for Telegram/WhatsApp webhooks, 60s cron sweep, reminders. | **Railway** |
| **Messaging** | Telegram Bot API + WhatsApp Cloud API | Interactive Inline Keyboard Buttons, zero Meta developer friction, fast testing. | **Telegram / Meta** |

---

## 3. High-Level System Architecture

```
[ Patient Channels ] ──► ( Web Form / Telegram Bot / WhatsApp Flow )
                                    │
                                    ▼
[ Ingestion & Automation ] ──► ( n8n Webhook Ingestion Gateway )
                                    │
                                    ▼
[ Backend REST API ] ──► Django REST Framework (/api/v1/)
       │                  ├── Authentication & Quick-PIN Security
       │                  ├── Booking Requests Queue (FIFO)
       │                  ├── AvailabilityEngine (Deterministic Scoring W1-W4)
       │                  ├── Atomic HoldService (select_for_update Row Locks)
       │                  ├── SweepService (60s Expiry Cron)
       │                  └── AuditLogger (Immutable State History)
       │
       ▼
[ Receptionist Hub ] ──► React Frontend (Vercel)
                          ├── New Requests Queue & Review Modal
                          ├── Today's Live Queue (Waiting Room ➔ Consult ➔ Done)
                          ├── Past Appointments History & Patient Dossier
                          ├── Staff Directory & Real-time Duty Tags
                          ├── Reports, Analytics & CSV Accounting Export
                          └── Emergency Sick Leave Colleague Reassignment
```

---

## 4. Backend Architecture Master Plan

### 4.1 Layered Directory Structure
```
backend/
├── manage.py
├── core/
│   ├── __init__.py
│   ├── settings.py           # Database URL, JWT, CORS, Logging, Throttling
│   ├── urls.py               # Main router mount (/api/v1/ and admin/)
│   ├── wsgi.py
│   └── asgi.py
└── appointments/
    ├── models.py             # 11 Relational domain models
    ├── serializers.py        # Input validation & output serialization
    ├── urls.py               # Resource routing and action paths
    ├── views/
    │   ├── auth_views.py     # Login, PIN unlock, Staff Admin
    │   ├── request_views.py  # Request CRUD, Check-Slots, Dispatch, Ask-Info, Reject
    │   ├── appointment_views.py # Live visits, Atomic Hold, Status transitions, Follow-up
    │   ├── clinic_views.py   # Settings, Staff Directory, Doctors, Services
    │   ├── realtime_views.py # Server-Sent Events (SSE) stream
    │   └── common_views.py   # System healthcheck
    ├── services/
    │   ├── availability.py   # 4-factor scoring algorithm & conflict detection
    │   ├── hold_service.py   # Concurrency-safe atomic holds
    │   ├── disruption_service.py # Doctor sick leave reassignment
    │   └── sweep_service.py  # 60s cron expiration sweeper
    ├── management/commands/
    │   ├── seed_clinic.py    # Realistic seed data for immediate demonstration
    │   └── run_expiry_sweep.py # Standalone cron runner
    └── tests/
        ├── test_phase1_models.py
        ├── test_phase2_services.py
        └── test_phase3_api.py
```

### 4.2 Availability & Collision Prevention Algorithm
- **Deterministic 4-Factor Scoring Function**:
  $$\text{Score} = W_1 (\text{Date Match: 40}) + W_2 (\text{Time Window: 30}) + W_3 (\text{Doctor Match: 20}) + W_4 (\text{Contiguity: 10})$$
- **Mandatory Buffers**: Automatically appends service-specific buffer (e.g. 10m sanitization) after each consultation.
- **Double-Booking Shield**: Checks confirmed appointments, active doctor breaks, clinic lunch, and active temporary holds.
- **Nearest-Alternative Fallback**: If requested date range has zero available slots, automatically scans subsequent 14 days and tags slots with `is_alternative_date = True`.

### 4.3 Concurrency & Idempotency
- **Atomic Holds**: Wrapped in `transaction.atomic()` with `select_for_update()`.
- **Race Condition Handling**: If two patients tap the same inline button simultaneously, the first secures the hold; the second receives an instant conflict warning (`SlotConflictException`) with recommendations for alternative slots.

---

## 5. Frontend Architecture Master Plan

### 5.1 Component & State Hierarchy
```
frontend/
├── index.html
├── src/
│   ├── main.jsx
│   ├── App.jsx               # Main Layout Shell & Module Router
│   ├── index.css             # Vanilla CSS Design System (Tokens, Utilities)
│   ├── context/
│   │   └── AuthContext.jsx   # Current User, JWT tokens, Screen Lock state
│   ├── hooks/
│   │   ├── useBookingRequests.js  # Requests Queue & Review State
│   │   ├── useLiveVisits.js       # Today's Queue & Status Transitions
│   │   ├── useStaffDirectory.js   # Duty tags with localStorage persistence
│   │   └── useClinicSettings.js   # Clinic buffer and hours config
│   ├── services/
│   │   ├── apiService.js     # Unified API Client (Live REST + Mock Fallback)
│   │   └── exportService.js  # Client-side CSV generation
│   ├── components/
│   │   ├── auth/             # LoginPage, QuickPinLockModal
│   │   ├── common/           # Header, Sidebar, Icons
│   │   ├── requests/         # RequestsModule, ReviewModal, AskForInfoDrawer
│   │   ├── visits/           # LiveVisitsModule, PastAppointmentsHistory, PatientHistoryModal, FollowUpCompletionModal
│   │   ├── staff/            # StaffDirectoryModule, EditStaffModal, ResetCredentialsModal, StaffDetailModal
│   │   ├── analytics/        # AnalyticsModule
│   │   ├── settings/         # ClinicSettingsModule
│   │   └── simulator/        # PatientSimulatorModule (for client pitching)
│   └── utils/
│       ├── audioChime.js     # Front-desk audible chime on incoming events
│       └── mockData.js       # High-fidelity realistic clinic demo data
```

### 5.2 Aesthetic Direction
- **Theme**: Sleek Dark Glassmorphism (`#0c0d0e` canvas, `#141618` cards, `rgba(255, 255, 255, 0.08)` borders).
- **Accents**: 
  - Vibrant Clinical Orange: `var(--color-accent-orange)` (`#ff6b00`)
  - Status Green: `var(--color-accent-green)` (`#34c759`)
  - Alert Coral Red: `var(--color-accent-coral)` (`#ff3b30`)
- **Visual Confidence**: Explicit badges for `[✓ Verified Free]`, `[Double-Booking Shield Active]`, and dynamic duty dots for doctors.

---

## 6. Security, Compliance & Governance Architecture

1. **Dual-Tier Authentication**:
   - **Primary Login**: Email + Password returning JWT access & refresh tokens.
   - **Quick-PIN Lock**: 4-digit PIN locks front desk when receptionist steps away.
2. **Instant Deactivation & Session Invalidation**:
   - Deactivating a staff account immediately blacklists their tokens and PIN. Subsequent requests yield `401 Unauthorized` and lock the screen immediately.
3. **Role-Based Access Control (RBAC)**:
   - `receptionist`: Access to Requests, Visits, Staff Directory, and Analytics.
   - `clinic_admin`: Full access including credentials reset, staff creation/deactivation, and clinic policies.
   - `doctor`: Read-only access to their assigned schedule and consultation follow-ups.
4. **Input Sanitization & Rate Limiting**:
   - Strict serializer validation on phone numbers (E.164 format) and dates.
   - DRF Throttling: `100/minute` per IP for public intake; `600/minute` for authenticated staff.
5. **Immutable Audit Trail**:
   - `AuditLog` table records every receptionist approval, patient hold, cancellation reason, and doctor status change.

---

## 7. Maintainability & Scalability Plan

1. **Clean Code Separation**:
   - No business logic in views; all calculations reside in `appointments/services/`.
   - Frontend components are pure presentation; state and data fetching live in custom hooks.
2. **Zero-Downtime Database Scalability**:
   - Database indexes placed on `(doctor, start_datetime, end_datetime)`, `(status, created_at)`, and `(patient_phone)`.
   - Soft deletes on sensitive records to protect historical patient records.
3. **Automated Testing Suite**:
   - Target: >90% code coverage.
   - 12 comprehensive unit and integration test suites covering the availability engine, atomic holds, disruption reassignment, and REST endpoints.
4. **Docker & Multi-Environment Setup**:
   - Dockerfile for Railway backend container with automatic `migrate` and `collectstatic`.
   - Environment variables for clear dev/staging/prod isolation.

---

## 8. Implementation Roadmap (Phase-by-Phase)

- [ ] **Phase 1: Backend Foundation & Relational Schema**
  - Django project setup, requirements, 11 ORM models, migrations, and realistic seed command.
- [ ] **Phase 2: Availability Engine & Business Services**
  - 4-factor contiguous scoring, atomic hold service, doctor sick leave reassignment, and 60s cron sweeper.
- [ ] **Phase 3: Django REST Framework API Endpoints**
  - 42 REST endpoints, JWT auth, Quick-PIN unlock, viewsets, serializers, SSE stream, and automated test suite.
- [ ] **Phase 4: Frontend Receptionist Hub (React + Vanilla CSS)**
  - Auth, Requests Queue, Review Modal with Double-Booking Shield, Today's Live Visits, Past Appointments History, Staff Directory with duty tag persistence, and Settings.
- [ ] **Phase 5: Automation & Messaging Workflows (n8n & Telegram)**
  - Telegram bot gateway, inline button keyboard flows, and ready-to-import n8n workflow templates.
- [ ] **Phase 6: End-to-End Verification & Production Packaging**
  - Concurrency tests, race condition validation, audit trail checks, and deployment guide.
