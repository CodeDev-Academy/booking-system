# Build Plan & Implementation Milestones

## 1. Phased Development Roadmap

```mermaid
gantt
    title Clinic Booking System Build Plan
    dateFormat  YYYY-MM-DD
    section Phase 1: Backend & DB
    Django Core & DB Models           :active, p1_1, 2026-10-08, 2d
    Availability & Lock Engine        :p1_2, after p1_1, 2d
    REST API Viewsets & Serializers   :p1_3, after p1_2, 2d
    section Phase 2: Frontend Dashboard
    React + Vanilla CSS Foundation    :p2_1, after p1_3, 2d
    Receptionist Review & Queue Cards :p2_2, after p2_1, 2d
    Realtime SSE & Live Status Flow   :p2_3, after p2_2, 2d
    section Phase 3: n8n & Automations
    Webhook Intake & Normalizer       :p3_1, after p2_3, 1d
    Hold/Expiry 1m Cron Sweeper       :p3_2, after p3_1, 1d
    Reminder Dispatcher Workflows     :p3_3, after p3_2, 1d
    section Phase 4: Verification & Docs
    End-to-End Simulation Testing     :p4_1, after p3_3, 2d
    Agency White-label Package        :p4_2, after p4_1, 1d
```

---

## 2. Milestone Deliverables
- **Milestone 1 (Backend Core & Security)**: Fully functional Django backend with SQLite/MySQL models, migrations, deterministic availability calculator, and **Staff Governance & Instant Deactivation API** (with immediate JWT session revocation upon admin toggle).
- **Milestone 2 (Receptionist & Admin Dashboard)**: Modern React + Vanilla CSS dashboard inspired by clinical aesthetic reference (`pinterest_ref`), featuring active request queue, slot editing modal, countdown badges, live visit transitions, and **Staff Management Panel** (Create staff, Reset PIN, 1-Click Deactivate/Revoke).
- **Milestone 3 (n8n Automations)**: Exportable n8n workflows for WhatsApp webhooks, 1-minute expiration cron, and 24h reminders.
- **Milestone 4 (Interactive Web Widget & Agency Package)**: Patient booking widget and ready-to-deploy white-label agency distribution.
