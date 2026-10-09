# API Reference & Endpoint Specifications

All endpoints are prefixed with `/api/v1/`.

---

## 1. Booking Requests

### `POST /api/v1/booking-requests/`
Creates a standardized booking request from web intake or WhatsApp flow.

**Request Payload:**
```json
{
  "patient_name": "Amina Yusuf",
  "patient_phone": "+2348012345678",
  "patient_type": "new",
  "service_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "preferred_doctor_id": null,
  "preferred_dates": ["2026-10-12", "2026-10-13"],
  "preferred_time_window": "morning",
  "channel": "whatsapp"
}
```

**Response (`201 Created`):**
```json
{
  "request_id": "REQ-2026-0042",
  "status": "awaiting_review",
  "created_at": "2026-10-08T09:30:00Z"
}
```

---

### `GET /api/v1/booking-requests/`
Retrieves request queue for Receptionist Dashboard with status filtering (`awaiting_review`, `slots_offered`, `offer_expired`).

---

### `POST /api/v1/booking-requests/{request_id}/check-slots/`
Calculates valid slot candidates according to clinic scheduling rules without modifying database state.

**Response (`200 OK`):**
```json
{
  "request_id": "REQ-2026-0042",
  "service": "Dental Consultation",
  "duration_minutes": 30,
  "suggested_slots": [
    {
      "doctor_id": "doc-uuid-1",
      "doctor_name": "Dr. Bello",
      "start_datetime": "2026-10-12T10:00:00Z",
      "end_datetime": "2026-10-12T10:30:00Z"
    },
    {
      "doctor_id": "doc-uuid-1",
      "doctor_name": "Dr. Bello",
      "start_datetime": "2026-10-12T11:30:00Z",
      "end_datetime": "2026-10-12T12:00:00Z"
    },
    {
      "doctor_id": "doc-uuid-2",
      "doctor_name": "Dr. Okafor",
      "start_datetime": "2026-10-13T09:00:00Z",
      "end_datetime": "2026-10-13T09:30:00Z"
    }
  ]
}
```

---

### `POST /api/v1/booking-requests/{request_id}/dispatch-offers/`
Receptionist approves selected slots and initiates the 60-minute (1-hour) offer window. Dispatches webhook to deliver Telegram / WhatsApp interactive buttons.

---

## 2. Slot Selection & Holds

### `POST /api/v1/slots/hold/`
Patient selects an offered slot. Acquires atomic lock and sets a 15-minute temporary hold (or instant confirmation for standard visits).

**Request Payload:**
```json
{
  "request_id": "REQ-2026-0042",
  "slot_offer_id": "slot-uuid-1"
}
```

**Response (`200 OK`):**
```json
{
  "appointment_id": "AP-1042",
  "status": "held",
  "hold_expires_at": "2026-10-08T10:15:00Z",
  "requires_deposit": false
}
```

---

## 3. Appointment Lifecycle & Status Updates

### `PATCH /api/v1/appointments/{appointment_id}/status/`
Allows the receptionist or automated webhook to advance appointment state.

**State Options:**
- `confirmed`
- `arrived`
- `in_consultation`
- `completed`
- `cancelled`
- `no_show`
- `rescheduled`

---

## 4. Staff Authentication & Admin Governance
 
### `POST /api/v1/auth/login/`
Authenticates receptionist with email and password, returns user profile, role, and issues 30-day HTTP-Only cookie.

### `POST /api/v1/auth/pin-unlock/`
Validates 4-digit Quick PIN after 20-minute idle screen lock.

### `POST /api/v1/admin/staff/{staff_id}/deactivate/`
**Admin-Only Action**: Immediately sets `is_active = False` on the receptionist, revokes all active tokens/cookies, and instantly severs their access to the dashboard.

### `POST /api/v1/admin/staff/{staff_id}/reset-pin/`
**Admin-Only Action**: Resets a receptionist's PIN if forgotten.

---

## 5. Webhook Ingestion Gateways

- `POST /api/v1/webhooks/messaging/inbound/` (Unified messaging ingestion from Telegram / WhatsApp)
- `POST /api/v1/webhooks/telegram/inbound/` (Direct Telegram Bot API webhook)
- `POST /api/v1/webhooks/whatsapp/inbound/` (Direct Meta Cloud API webhook)
- `POST /api/v1/webhooks/expiry-sweep/` (Invoked every 1m by n8n cron worker)
- `POST /api/v1/webhooks/re-engagement/` (Triggered upon offer expiry to send `[🔄 See New Times]`)
