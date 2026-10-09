# Real-Time Protocol & Event Synchronization

## 1. Overview
The Receptionist Dashboard requires low-latency, real-time updates when:
1. New booking requests arrive via Web or WhatsApp.
2. An offer expires or a patient clicks `[🔄 See New Times]`.
3. A patient selects a slot, placing a temporary hold on the schedule.
4. An appointment status changes (e.g., patient replies "Confirm" or "Cancel").

---

## 2. Event Dispatching Architecture

```
[ WhatsApp / Web Intake ] ──► [ Django Backend Engine ] ──► [ SSE / WebSocket Hub ] ──► [ Receptionist Dashboard ]
                                       │
                                       ▼
                             [ Postgres / SQLite ]
```

---

## 3. Real-Time Event Schema

### Event 1: `request.created`
Fired when a new request is validated.
```json
{
  "event": "request.created",
  "timestamp": "2026-10-08T10:00:00Z",
  "data": {
    "request_id": "REQ-2026-0042",
    "patient_name": "Amina Yusuf",
    "service_name": "Dental Consultation",
    "channel": "whatsapp",
    "status": "awaiting_review"
  }
}
```

### Event 2: `slot.held`
Fired when a patient claims an offered slot.
```json
{
  "event": "slot.held",
  "timestamp": "2026-10-08T10:15:00Z",
  "data": {
    "appointment_id": "AP-1042",
    "doctor_id": "doc-uuid-1",
    "doctor_name": "Dr. Bello",
    "start_datetime": "2026-10-12T10:00:00Z",
    "hold_expires_at": "2026-10-08T10:30:00Z"
  }
}
```

### Event 3: `offer.expired`
Fired by the 1-minute cron sweeper when 60 minutes elapse without selection.
```json
{
  "event": "offer.expired",
  "timestamp": "2026-10-09T10:45:00Z",
  "data": {
    "request_id": "REQ-2026-0042",
    "patient_name": "Amina Yusuf",
    "action_required": "reengagement_sent"
  }
}
```

### Event 4: `request.reviewing` (Multi-Receptionist Desk Presence)
Fired when Receptionist Sarah opens a request card to prevent Receptionist Mary from duplicate work:
```json
{
  "event": "request.reviewing",
  "timestamp": "2026-10-09T10:46:10Z",
  "data": {
    "request_id": "REQ-2026-0042",
    "reviewed_by_staff_id": "staff-uuid-1",
    "reviewed_by_staff_name": "Sarah"
  }
}
```

---

## 4. Frontend Reconnection & Fallback Strategy
- **Primary Mechanism**: Server-Sent Events (SSE) `/api/v1/realtime/events/` for zero-overhead unidirectional streaming.
- **Heartbeat**: 15-second ping frame.
- **Auto-Reconnect**: Exponential backoff (1s, 2s, 5s, 10s max).
- **Graceful Fallback**: Transparent HTTP long-polling (every 10s) if SSE is blocked by proxy/firewalls.
