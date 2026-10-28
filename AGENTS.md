# Clinic Booking System — Master Blueprint & Agency Template

## 1. Project Overview & Vision
This project is an **Agency Template for a Receptionist-Approved Clinic Booking System**.
It acts as a human-in-the-loop booking assistant where the system extracts and structures requests, calculates eligible slots using clinic scheduling rules, and the receptionist approves the options before they are sent to the patient.

---

## 2. Technology Stack & Deployment Architecture

| Layer | Technology | Deployment Target | Notes |
| :--- | :--- | :--- | :--- |
| **Frontend** | React.js + Vanilla CSS | **Vercel** | Responsive, modern aesthetics, fast load times, role-based dashboard for receptionist + patient booking widget. |
| **Backend** | Python + Django (Django REST Framework) | **Railway** | Robust ORM, modular apps, built-in admin, clean REST API endpoints. |
| **Database** | SQLite (Dev) → MySQL/Postgres (Prod) | Local / Railway | Built with Django ORM migrations for 1-click database engine switching. |
| **Workflow Automation** | n8n (Self-hosted) | **Railway** | Handles webhooks, scheduled cron sweepers (expiry), reminder notifications, and messaging routing. |
| **Messaging Channel** | **Telegram Bot API** (Primary / Fast Dev) + WhatsApp Cloud API (Optional Prod) | Telegram / Cloud API | Interactive Inline Buttons, zero Meta developer friction, instant webhooks, and template parity. |

---

## 3. The 10-Step Receptionist-Approved Booking Lifecycle

```
1. Capture Request (Web Form / WhatsApp Flow / NL Text)
       ↓
2. Extract & Validate Structured JSON
       ↓
3. Receptionist Review (Card in Dashboard: Edit Request, Check Slots, Modify/Customize Proposed Times)
       ↓
4. Scheduling Engine Calculates Suitable Available Slots
       ↓
5. Receptionist Edits/Approves & Dispatches Options to Patient (1-Hour Offer Expiry)
       ↓
6. Patient Selects Option → Instant Database Hold (15-30m Hold Expiry)
       ↓
7. Confirmation & Calendar Booking Finalized (Instant message + Reference #)
       ↓
8. Automated Reminders (24 Hours & Optional 2 Hours Before Visit)
       ↓
9. Patient Response & Rescheduling (Confirm / Reschedule / Cancel via Webhook)
       ↓
10. Receptionist Visit Status Management & Doctor-Approved Follow-up Reminders
```

---

## 4. Slot Expiry & Patient Recovery Strategy (Preventing Customer Loss)

### Phase A: Upfront Expectation Setting
- During the initial booking on the Website form or WhatsApp Flow, a clear disclaimer is displayed:
  > *"Available slot offers are held for 1 hour (60 minutes) once sent so that other patients have fair access to the schedule."*

### Phase B: Soft Reminder (45 Minutes in)
- If no selection has been made after 45 minutes:
  > *"Friendly reminder: Your appointment choices for Dental Consultation expire in 15 minutes. Reply 1, 2, or 3 to lock in your time."*

### Phase C: Graceful Expiry & 1-Click Re-Engagement (At 60 Minutes)
- When the 1-hour window elapses without selection:
  1. The database status transitions: `offered` → `offer_expired`.
  2. The receptionist dashboard updates the request to the **"Expired Requests"** tab.
  3. n8n automatically sends a supportive re-engagement message to the patient:
     > *"Hello Amina, the previously offered slots have expired to keep our schedule open for all patients. We'd still love to see you! Click below to request fresh available times from reception."*  
     > `[🔄 See New Times]` `[💬 Chat with Reception]`
  4. Clicking `[See New Times]` sends an instant acknowledgment to the patient (*"Front desk is reviewing fresh times for you..."*) and immediately places the request into the receptionist's **"Re-Requested Slots"** priority tab for 1-click review and approval before dispatching.

---

## 5. Database Schema Plan (Django ORM Models)

1. **Staff / Doctor**
   - `id`, `name`, `email`, `phone`, `specialty`, `working_days` (JSON/bitmask), `shift_start`, `shift_end`, `is_active`
2. **Service**
   - `id`, `name`, `category`, `duration_minutes`, `buffer_minutes`, `deposit_required`, `price`
3. **AvailabilityRule**
   - `id`, `doctor` (FK nullable for clinic-wide), `type` (break, blocked_date, emergency_reserve), `start_datetime`, `end_datetime`
4. **BookingRequest**
   - `request_id` (e.g. `REQ-2026-0042`), `patient_name`, `phone`, `patient_type` (new/returning), `service` (FK), `preferred_doctor` (FK nullable), `preferred_dates` (JSON), `preferred_time_window` (morning/afternoon/evening), `channel` (web/whatsapp), `status` (`awaiting_review`, `slots_offered`, `offer_expired`, `converted`, `rejected`)
5. **SlotOffer**
   - `id`, `request` (FK), `doctor` (FK), `start_datetime`, `end_datetime`, `offered_at`, `expires_at`, `is_selected`
6. **Appointment**
   - `appointment_id` (e.g. `AP-1042`), `patient_name`, `patient_phone`, `doctor` (FK), `service` (FK), `start_datetime`, `end_datetime`, `status` (`held`, `confirmed`, `arrived`, `in_consultation`, `completed`, `cancelled`, `no_show`), `hold_expires_at`, `confirmed_at`, `arrival_at`, `completed_at`
7. **FollowUpTask**
   - `id`, `appointment` (FK), `follow_up_date`, `notes`, `reminder_sent`, `is_completed`

---

## 6. Directory Layout for Agency Template

```
clinic-booking-system/
├── AGENTS.md                  # Master architecture, instructions & memory
├── PROGRESS.md                # Real-time phase milestone tracker
├── TEST.md                    # Granular QA & test case matrix
├── n8n.md                     # n8n workflows master functional blueprint
├── backend/                   # Django REST Framework Project
│   ├── manage.py
│   ├── core/                  # Django project settings & wsgi/asgi
│   ├── appointments/          # Models, serializers, views, availability engine
│   └── requirements.txt
├── frontend/                  # React.js + Vanilla CSS (Strict Logic vs Design Separation)
│   ├── index.html
│   ├── src/
│   │   ├── api/               # API clients, JWT interceptor, SSE listener (LOGIC ONLY)
│   │   ├── hooks/             # Headless React hooks for queue, holds, swimlanes (LOGIC ONLY)
│   │   ├── services/          # Web Audio synth, mock data store, time utilities (LOGIC ONLY)
│   │   ├── components/        # Pure presentational UI components (DESIGN ONLY)
│   │   │   ├── layout/        # LeftRail, Header, PrivacyLockModal
│   │   │   ├── queue/         # TriageQueuePane, QueueCard, AgingBadge
│   │   │   ├── review/        # ActiveReviewStage, CandidateSlotCard, ShieldBanner
│   │   │   ├── swimlanes/     # LiveVisitsGrid, VisitCard, FollowUpModal
│   │   │   ├── admin/         # ClinicSettingsBento, StaffRosterTable
│   │   │   └── simulator/     # SplitPitchSimulator, MobilePhoneIntakeFrame
│   │   ├── styles/            # Vanilla CSS tokens and component styles (DESIGN ONLY)
│   │   │   ├── tokens.css     # tasteskill.dev color, border, and typography tokens
│   │   │   ├── layout.css     # Grid, anti-overflow guards, responsive rules
│   │   │   └── components/    # Component-specific CSS sheets
│   │   └── main.jsx
│   └── package.json
└── n8n/                       # Ready-to-import n8n Workflow JSONs
    ├── intake_webhook.json
    ├── hold_and_offer_expiry_cron.json
    ├── reminder_dispatcher.json
    └── patient_response_handler.json
```

---

## 7. Multi-Agent Team Structure & Operational Responsibilities

1. **Brain Agent — Architect & Backend (Lead Pair Architect)**:
   - **Primary Ownership**: System Architecture, Backend Foundation (`backend/`), Relational Schema & ORM, Availability Engine & Concurrency Locks, Security & RBAC Governance, Project Monitoring, and Continuous Documentation Synchronization (`*.md` files).
   - **Role**: Coordinates the roadmap, guarantees zero double-booking logic, guards database integrity, and leads Phase 1, Phase 2, and Phase 3.
2. **Frontend Sub-Agent**:
   - **Primary Ownership**: User Interface & UX (`frontend/`), React 18 component tree, Vanilla CSS design system (`index.css`), Real-time SSE listener, Audio Chime notifications, Receptionist Hub modules, and Client Pitch Simulator.
3. **Review Sub-Agent**:
   - **Primary Ownership**: Quality Assurance, Code Review, Security Auditing, Test Execution Verification against [TEST.md](file:///c:/Users/User/OneDrive/Desktop/Project/Clinic%20Booking%20system/TEST.md), Edge-Case & Concurrency stress validation.

---

## 8. Core Agent Behavioral Governance & Execution Constraints

1. **Explicit User Command Required Before Building**:
   - The agent MUST NEVER initiate code scaffolding, file generation, or system building until the user explicitly commands to start building.
   - Planning, architectural alignment, documentation reviews, and schema vetting take precedence until given the explicit go-ahead.

2. **Strict Step-by-Step Incremental Execution (Zero 'Big-Bang' Building)**:
   - NEVER build entire subsystems or multiple phases in one go.
   - All work must proceed strictly one small, verifiable step at a time (e.g., Task 1.1 first, verify; Task 1.2 next, verify).
   - Each step must be completed, tested against [TEST.md](file:///c:/Users/User/OneDrive/Desktop/Project/Clinic%20Booking%20system/TEST.md), and signed off before proceeding to the subsequent step.

3. **Frontend Design Governance (`tasteskill.dev` + `awesome-design-md`)**:
   - **Strict Aesthetic Rule**: Every frontend component must strictly adhere to the `tasteskill.dev` and `awesome-design-md` design system:
     - Palette: `#0f0f0f` canvas, `#121212` / `#141414` elevated card surfaces, hairline borders (`#1f1f1f` / `#2b2b2b`), signature ember/amber gradients (`#ffb547` $\rightarrow$ `#ff6b3d` $\rightarrow$ `#ff4f79`), emerald green accents (`#32c850`).
     - Typography: Clean sans with `tabular-nums` for timers, counts, and dates.
     - Spacing & Structure: Strict 4px/8px modular grid rhythm, optical padding.
     - Responsive & Anti-Overflow Guard: Prevent all element overflow (`min-width: 0` on flex items, `overflow-x: hidden` on viewport roots, responsive auto-fit grids for tablet/mobile without horizontal clipping).
   - **Zero Slop**: No generic centered cards, no clunky grey shadows, no raw unstyled defaults.

4. **Strict Separation of Concerns (Logic vs Design)**:
   - **Logic files and Design/Presentation files MUST NEVER be mixed**:
     - **Logic Layer (`hooks/`, `services/`, `api/`)**: All state machines, API calls, SSE listeners, countdown math, and business validation live strictly in headless custom hooks and service modules.
     - **Design/Presentation Layer (`components/`, `styles/`)**: Components are pure presentational functions that receive props and return clean markup with corresponding CSS. Zero direct `fetch()`, zero complex business logic in JSX.

5. **Continuous Documentation Synchronization**:
   - Whenever a feature, rule, workflow, or architectural decision is planned or modified, corresponding `.md` files ([n8n.md](file:///c:/Users/User/OneDrive/Desktop/Project/Clinic%20Booking%20system/n8n.md), [PROGRESS.md](file:///c:/Users/User/OneDrive/Desktop/Project/Clinic%20Booking%20system/PROGRESS.md), [TEST.md](file:///c:/Users/User/OneDrive/Desktop/Project/Clinic%20Booking%20system/TEST.md), [DATABASE_SCHEMA.md](file:///c:/Users/User/OneDrive/Desktop/Project/Clinic%20Booking%20system/DATABASE_SCHEMA.md), [DESIGN_DIRECTION.md](file:///c:/Users/User/OneDrive/Desktop/Project/Clinic%20Booking%20system/DESIGN_DIRECTION.md)) must be updated immediately to preserve single-source-of-truth accuracy.



