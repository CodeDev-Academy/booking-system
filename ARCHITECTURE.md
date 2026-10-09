# Architecture & Data Flow Specification

## 1. High-Level Architecture Topology

```
                  ┌────────────────────────┐
                  │    Patient Channels    │
                  │ (Web Widget / WhatsApp)│
                  └───────────┬────────────┘
                              │ HTTPS Webhooks / REST
                              ▼
                  ┌────────────────────────┐
                  │     n8n Gateway /      │
                  │   Webhook Ingestion    │
                  └───────────┬────────────┘
                              │ Normalized JSON
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                 Django Backend REST API                     │
│  ┌─────────────────┐ ┌──────────────────┐ ┌──────────────┐  │
│  │ Intake & Normal │ │ Availability &   │ │ Status State │  │
│  │ Request Service │ │ Hold Engine      │ │ Machine      │  │
│  └─────────────────┘ └──────────────────┘ └──────────────┘  │
└─────────────────────────────┬───────────────────────────────┘
                              │ Django ORM / ACID Transactions
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                 Database Engine (SQLite / MySQL)             │
│   • Doctors & Shifts    • Services & Buffers                │
│   • Booking Requests    • Temporary Slot Holds              │
│   • Confirmed Appts     • Audit Logs & Follow-ups           │
└─────────────────────────────▲───────────────────────────────┘
                              │ REST API + JSON
┌─────────────────────────────┴───────────────────────────────┐
│              Receptionist Dashboard (React.js)              │
│   • Request Cards & Review    • 1-Click Availability Checker│
│   • Slot Offer Dispatcher     • Live Clinic Visit Tracker   │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Component Communication & Interfaces

### 1. Ingestion Pipeline
- **Web Widget**: Submits `POST /api/v1/booking-requests/` with user payload.
- **WhatsApp Cloud API Webhook**: Ingests interactive responses or text, invokes `POST /api/v1/webhooks/whatsapp/`, maps to the internal canonical schema.

### 2. Availability Engine
- Executes deterministic slot generation:
  $$\text{Eligible Slots} = \text{Doctor Shifts} \cap \text{Clinic Hours} \setminus (\text{Existing Appts} \cup \text{Active Holds} \cup \text{Breaks} \cup \text{Buffers})$$
- Generates 3 non-overlapping slot candidates matching patient preferences.

### 3. Slot Lock & Confirmation Pipeline
- When patient selects Slot $K$:
  - Starts Django Atomic Transaction.
  - Queries `Appointment` with `select_for_update()`.
  - Creates or updates `Appointment(status='held', hold_expires_at=now() + 15min)`.
  - If successful, transitions to `confirmed` and triggers n8n confirmation message.

### 4. Sweeper Background Job
- Executed every 60 seconds by n8n cron or Celery beat:
  - Finds all `BookingRequest` where `status='slots_offered'` and `offer_expires_at < now()` $\rightarrow$ marks `offer_expired`, triggers re-engagement webhook.
  - Finds all `Appointment` where `status='held'` and `hold_expires_at < now()` $\rightarrow$ marks `hold_expired`, frees slot.
