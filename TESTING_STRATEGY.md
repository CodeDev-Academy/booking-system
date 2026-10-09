# Testing Strategy & Quality Assurance Matrix

## 1. Test Layers & Coverage Targets

| Test Layer | Focus Area | Tooling | Success Criteria |
| :--- | :--- | :--- | :--- |
| **Unit Tests** | Availability slot calculation, buffer evaluation, scoring logic | `pytest-django` / `unittest` | 100% coverage on scheduling math and overlap detection. |
| **Concurrency / Atomic Tests** | Race conditions on simultaneous holds | Multi-threaded Django test client | Zero duplicate holds for overlapping slots. |
| **Integration Tests** | REST API endpoints, serializers, status transitions | Django REST Framework test runner | All state transitions strictly adhere to state machine. |
| **Automation Flow Tests** | n8n webhooks, mock WhatsApp payloads | Postman / cURL / n8n test node | Valid JSON transformation across channels. |
| **E2E UI Tests** | Receptionist card approval, countdown timers, hold releases | Browser automated flows | Sub-second visual updates without full-page reload. |

---

## 2. Key Critical Test Scenarios
1. **Double-Booking Contention**: Two concurrent requests attempting to hold the same 10:00 AM slot $\rightarrow$ exactly one succeeds with `200 OK`, other receives `409 Conflict` and alternative times.
2. **Expired Hold Auto-Release**: Slot held at 10:00 AM with 15m expiration $\rightarrow$ at 10:16 AM, sweeper frees slot $\rightarrow$ availability engine shows slot as open.
3. **Doctor Leave Collision**: Doctor marked on leave from 2:00 PM to 5:00 PM $\rightarrow$ availability engine completely excludes these hours.
