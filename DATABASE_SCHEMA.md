# Database Schema Specification & Data Dictionary

## 1. Entity-Relationship Model (ERD)

```mermaid
erDiagram
    CLINIC_SETTING ||--o{ STAFF_USER : "employs"
    CLINIC_SETTING ||--o{ DOCTOR : "governs"
    DOCTOR ||--o{ DOCTOR_SERVICE : "provides"
    SERVICE ||--o{ DOCTOR_SERVICE : "provided by"
    DOCTOR ||--o{ AVAILABILITY_RULE : "has"
    DOCTOR ||--o{ APPOINTMENT : "attends"
    DOCTOR ||--o{ SLOT_OFFER : "offered for"
    SERVICE ||--o{ BOOKING_REQUEST : "requested in"
    SERVICE ||--o{ APPOINTMENT : "performed in"
    BOOKING_REQUEST ||--o{ SLOT_OFFER : "generates"
    BOOKING_REQUEST ||--o| APPOINTMENT : "converts to"
    APPOINTMENT ||--o{ FOLLOW_UP_TASK : "generates"
    APPOINTMENT ||--o{ AUDIT_LOG : "tracked by"

    STAFF_USER {
        uuid id PK
        string full_name
        string email UK
        string password_hash
        string quick_pin_hash "4-6 digit hashed PIN"
        string role "receptionist | doctor | clinic_admin"
        boolean is_active
        datetime last_login
        datetime created_at
    }

    CLINIC_SETTING {
        uuid id PK
        string clinic_name
        string tagline
        string address
        string phone
        string whatsapp_phone_id
        time open_time
        time close_time
        json working_days "[1,2,3,4,5,6]"
        time lunch_break_start
        time lunch_break_end
        int grid_increment_minutes "default 15"
        int booking_horizon_days "default 14"
        int min_advance_hours "default 2"
        int offer_expiry_minutes "default 60"
        int hold_expiry_minutes "default 15"
        int default_buffer_minutes "default 10"
        int emergency_slots_per_shift "default 1"
        boolean enable_24h_reminder "default true"
        boolean enable_2h_reminder "default false"
        json custom_config "Stores dynamic white-label key-values (currency, bot tokens, reminders, payment keys)"
        datetime updated_at
    }

    DOCTOR {
        uuid id PK
        string name
        string email
        string phone
        string specialty
        json working_days "e.g. [1,2,3,4,5]"
        time shift_start
        time shift_end
        int max_daily_appointments "default 12 (burnout ceiling)"
        boolean is_active
        boolean is_on_leave
    }

    DOCTOR_SERVICE {
        uuid id PK
        uuid doctor_id FK
        uuid service_id FK
        int custom_duration_minutes "nullable override"
    }

    SERVICE {
        uuid id PK
        string name
        string category
        int duration_minutes
        int buffer_minutes
        decimal price
        boolean deposit_required
    }

    AVAILABILITY_RULE {
        uuid id PK
        uuid doctor_id FK "nullable (clinic-wide)"
        string rule_type "break | blocked_date | emergency_reserve"
        datetime start_datetime
        datetime end_datetime
        string reason
    }

    BOOKING_REQUEST {
        uuid id PK
        string request_code "e.g. REQ-2026-0042"
        string patient_name
        string patient_phone
        string patient_type "new | returning"
        uuid previous_patient_id FK "nullable (linked via phone)"
        uuid service_id FK
        uuid preferred_doctor_id FK "nullable"
        json preferred_date_range "{'start': 'YYYY-MM-DD', 'end': 'YYYY-MM-DD'}"
        string preferred_time_window "morning | afternoon | evening"
        string channel "web | whatsapp_flow | telegram"
        string status "awaiting_review | slots_offered | offer_expired | converted | rejected"
        boolean channel_blocked "default false (triggered if bot is blocked / 403)"
        string patient_notes "nullable text for unstructured notes/symptoms"
        datetime offer_expires_at
        datetime created_at
    }

    IDEMPOTENCY_KEY {
        uuid id PK
        string key UK "update_id or message_id"
        string source "telegram | whatsapp"
        datetime expires_at
        datetime created_at
    }

    SLOT_OFFER {
        uuid id PK
        uuid request_id FK
        uuid doctor_id FK
        datetime start_datetime
        datetime end_datetime
        boolean is_alternative_date "true if outside requested range"
        datetime offered_at
        datetime expires_at
        boolean is_selected
    }

    APPOINTMENT {
        uuid id PK
        string appointment_code "e.g. AP-1042"
        string patient_name
        string patient_phone
        uuid doctor_id FK
        uuid service_id FK
        uuid booking_request_id FK "nullable"
        datetime start_datetime
        datetime end_datetime
        string status "held | confirmed | arrived | in_consultation | completed | cancelled | no_show | hold_expired"
        datetime hold_expires_at
        datetime confirmed_at
        datetime arrival_at
        datetime completed_at
        datetime cancelled_at
        string cancellation_reason
    }

    FOLLOW_UP_TASK {
        uuid id PK
        uuid appointment_id FK
        date follow_up_date
        string notes
        boolean reminder_sent
        boolean is_completed
        datetime reminder_sent_at
    }

    AUDIT_LOG {
        uuid id PK
        string entity_name
        uuid entity_id
        string action
        string performed_by
        json changes
        datetime created_at
    }
```

---

## 2. Table Indexing & Performance Strategy
- `idx_appointment_doctor_time`: `(doctor_id, start_datetime, end_datetime)` for sub-millisecond overlap queries.
- `idx_request_status_expiry`: `(status, offer_expires_at)` for fast 60s expiry cron sweepers.
- `idx_appointment_status_hold`: `(status, hold_expires_at)` for fast hold expiry sweeper.
