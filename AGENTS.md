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
├── backend/                   # Django REST Framework Project
│   ├── manage.py
│   ├── core/                  # Django project settings & wsgi/asgi
│   ├── appointments/          # Models, serializers, views, availability engine
│   └── requirements.txt
├── frontend/                  # React.js + Vanilla CSS
│   ├── index.html
│   ├── src/
│   │   ├── components/        # RequestCards, SlotPicker, CalendarGrid, StatusToggles
│   │   ├── pages/             # Dashboard, BookingForm, Analytics
│   │   └── index.css          # Vanilla CSS Design System
│   └── package.json
└── n8n/                       # Ready-to-import n8n Workflow JSONs
    ├── intake_webhook.json
    ├── hold_and_offer_expiry_cron.json
    ├── reminder_dispatcher.json
    └── patient_response_handler.json
```
