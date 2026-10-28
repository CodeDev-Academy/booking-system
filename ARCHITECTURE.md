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

---

## 3. Backend Security & Architectural Decisions Matrix (Signed Off via Grill-Me)

The following 7 technical decisions have been comprehensively reviewed, evaluated, and officially locked into the backend implementation blueprint:

| Domain | Technical Decision & Architecture | Rationale & Security Safeguard |
| :--- | :--- | :--- |
| **1. Phone Ingestion** | **Automatic E.164 Normalization** via `python-phonenumbers` defaulting to `+234`. | Prevents invalid messaging numbers; rejects non-carrier digits before database insertion. |
| **2. Patient Identity** | **Automatic phone-based identity matching** on `Appointment` history. | Automatically recognizes returning patients, links dossier, and computes attendance reliability score without requiring patient ID friction. |
| **3. Staff Auth & Session** | **HttpOnly Secure SameSite Cookies** with real-time `is_active` DB validation. | Immune to browser XSS token theft; admin 1-click deactivation instantly ejects the user session on the next API call. |
| **4. Quick-PIN Security** | **Salted PBKDF2 Hash** with rate-limiting: Max 3 failed attempts within 5 minutes triggers a 60s cooldown, forces master password login, and logs a security event to `AuditLog`. | Eliminates brute-force guessing of the 4-digit PIN while allowing frictionless desk unlocks. |
| **5. Webhook Security** | **HMAC-SHA256 signature verification**: Telegram `X-Telegram-Bot-Api-Secret-Token` + Meta `X-Hub-Signature-256`. | Drops spoofed or unauthorized webhooks immediately with `401 Unauthorized` before querying the database. |
| **6. Data Privacy** | **Zero clinical diagnosis exposure**: Masked phone logging in server stdout (`+234 801 **** 5678`) and append-only immutable `AuditLog`. | Guarantees medical data confidentiality and regulatory compliance (HIPAA / NDPR). |
| **7. Multi-Tenant Deployment** | **Single-Tenant per Instance**: Each clinic gets its own isolated database container, seeded via `client-config.json`. | Eliminates cross-clinic data leak vulnerabilities and allows 1-click white-label deployment for agency clients. |

