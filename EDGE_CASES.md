# Edge Cases, Workflow Failure Risks & Solution Matrix (`EDGE_CASES.md`)

This document is the **master failure mode and resilience architecture** for the **MedPulse Clinic Booking System**.
It details all potential edge cases, technical risks, channel failures, concurrency race conditions, and human-in-the-loop operational bottlenecks—along with the evaluated solutions and architectural decisions.

---

## 1. System Resilience Overview

```
                      POTENTIAL FAILURE POINTS & RESILIENCE SHIELDS
┌─────────────────────────────────┬──────────────────────────────────┬─────────────────────────────────┐
│     Messaging & Gateways        │     Engine & Concurrency         │     Front-Desk & Human Gate     │
├─────────────────────────────────┼──────────────────────────────────┼─────────────────────────────────┤
│ • Bot Blocked / 403 Forbidden   │ • Phantom Slot after Doctor Sick │ • Queue Starvation / Delays     │
│ • Webhook Replay Storms (At-1)  │ • Zombie 15m Held Slots          │ • Shift Handover Collision      │
│ • Telegram 429 Rate Throttling  │ • DB Deadlocks in select_update  │ • Wi-Fi Dropout & SSE Disconnect│
│ • Unstructured Audio/Photos     │ • Timezone / DST Drift           │ • Walk-in vs Online Collision   │
└─────────────────────────────────┴──────────────────────────────────┴─────────────────────────────────┘
```

---

## 2. Category A: Messaging Channels & Gateway Failure Risks

### Risk 1: Webhook Replay Storms & Duplicate Inbound Callbacks
- **Scenario**: Telegram Bot API or WhatsApp retries webhook deliveries if the server response takes > 2–3 seconds. A network blip can cause 3–5 duplicate webhooks within 5 seconds for the same button click.
- **Impact**: Duplicate appointments created, duplicate reminder messages sent, or race conditions triggered.
- **Options Evaluated**:
  - *Option 1 (App-level DB Check)*: Query database before every action to see if already handled. Slow and vulnerable to microsecond race conditions.
  - *Option 2 (Fast 200 OK + Celery Worker)*: Return 200 OK immediately and process via background queue. Adds Redis/Celery dependency overhead.
  - *Option 3 (Idempotency Key via Cache/DB Table — SELECTED)*: Every webhook payload contains an `update_id` (Telegram) or `message_id` (WhatsApp). Django checks an `IdempotencyKey` cache/table with a 10-minute TTL. If seen, instantly return `200 OK` with zero action.
- **Architectural Decision**: **Option 3**. n8n and Django validate `update_id` deduplication before firing business logic.

---

### Risk 2: Patient Blocks the Bot or Deletes Chat (`403 Forbidden`)
- **Scenario**: Patient submits an inquiry on the Web Form, but later blocks `@MedPulseClinicBot` or disables Telegram notifications before the receptionist approves candidate slots.
- **Impact**: Delivery of 1-hour slot offers fails with `403 Forbidden: bot was blocked by the user`. Patient is lost in limbo.
- **Options Evaluated**:
  - *Option 1 (Silent Drop)*: Catch error in n8n and do nothing. (Rejected: Clinic loses a paying patient).
  - *Option 2 (Automatic SMS Switch)*: Automatically dispatch via Twilio / Termii SMS. (Good, but incurs SMS cost and lacks interactive buttons).
  - *Option 3 (Visual Front-Desk Alert + SMS Fallback — SELECTED)*: When n8n receives 403, it calls `POST /api/v1/booking-requests/{id}/channel-failed/`. The dashboard card turns bright red with badge: `[⚠️ Bot Blocked — Call Patient: +234 801 234 5678]`, allowing the receptionist to phone the patient directly.
- **Architectural Decision**: **Option 3**. Protects conversion rate through instant human front-desk escalation.

---

### Risk 3: Telegram API Rate Throttling (`429 Too Many Requests`)
- **Scenario**: Morning reminder batch: at 08:00 AM, the system tries to blast 60 pre-visit reminders simultaneously. Telegram imposes a limit of 30 msgs/second globally and 1 msg/second per user.
- **Impact**: Telegram drops messages with `429 Too Many Requests`, causing missed reminders.
- **Options Evaluated**:
  - *Option 1 (Synchronous Single Blast)*: High probability of 429 errors.
  - *Option 2 (n8n Batching with Jitter — SELECTED)*: Use n8n `Split In Batches` node (batch size: 5, wait interval: 350ms between batches).
  - *Option 3 (Time-staggered scheduling)*: Spread reminders over 30 minutes based on appointment time.
- **Architectural Decision**: **Option 2 + Option 3**. n8n throttles outgoing requests with 350ms jitter, preventing rate spikes.

---

### Risk 4: Patient Sends Unstructured Audio Notes, Images, or Free-Form Text
- **Scenario**: Instead of clicking `[1️⃣ 10:00 AM]`, patient replies with a voice note (*"Can I come Thursday afternoon instead?"*) or a photo of their tooth.
- **Impact**: Automation parser cannot match callback data; workflow may stall or drop the communication.
- **Options Evaluated**:
  - *Option 1 (Strict Bot Rejection)*: Bot replies *"Please use the buttons above."* (Feels cold and robotic).
  - *Option 2 (Receptionist Chat Forwarding — SELECTED)*: Bot replies: *"Thank you! Our front desk has received your note."* Webhook forwards text/media link to Django, attaching it as an urgent note in the Receptionist Review Modal.
- **Architectural Decision**: **Option 2**. Front-desk receptionist sees the patient's note inside the dashboard and can adjust candidate slots accordingly.

---

## 3. Category B: Scheduling Engine & Database Concurrency Risks

### Risk 5: The "Phantom Slot" Trap (Doctor marked on leave while offer countdown is active)
- **Scenario**: At 10:00 AM, receptionist sends 3 slots for Dr. Bello on Friday (1-hour countdown). At 10:20 AM, Dr. Bello calls in sick or clinic admin blocks Friday for maintenance. At 10:35 AM, patient taps `[1️⃣ Friday 10:00 AM]`.
- **Impact**: Patient arrives on Friday to find the doctor is absent.
- **Options Evaluated**:
  - *Option 1 (Blindly Lock)*: Results in patient dissatisfaction.
  - *Option 2 (Pre-Hold Re-Validation at Atomic Lock Time — SELECTED)*: Inside `hold_service.py` during `select_for_update()`, the system re-runs doctor leave and conflict checks *before* granting the hold. If Dr. Bello is marked on leave, transaction raises `SlotUnavailableException`.
  - *Option 3 (Proactive Offer Revocation)*: When a doctor is marked `is_on_leave = True`, all active `SlotOffer` records for that doctor are cancelled immediately, sending a polite notification to the patient.
- **Architectural Decision**: **Option 2 + Option 3**. Proactive alert sent to active offers, and atomic re-validation shields against any race conditions.

---

### Risk 6: Orphaned Zombie Holds (Sweeper Crash / Service Pause)
- **Scenario**: Patient clicks slot $\rightarrow$ 15-minute temporary hold placed. If n8n or Railway service restarts and misses the 60-second cron sweeper, the slot could remain locked forever.
- **Impact**: Clinic calendar is starved of available slots.
- **Options Evaluated**:
  - *Option 1 (Solely Rely on n8n Cron)*: Single point of failure.
  - *Option 2 (Lazy Self-Healing Expiry in AvailabilityEngine — SELECTED)*: The availability engine checks:
    ```python
    if appointment.status == 'held' and appointment.hold_expires_at < timezone.now():
        # Treat as FREE in slot calculations and trigger asynchronous cleanup
    ```
  - *Option 3 (Dual Sweeper)*: n8n cron + Django internal cron (`celery` / background thread).
- **Architectural Decision**: **Option 2**. Availability calculations are self-healing. Even if the sweeper is delayed by 5 minutes, an expired hold never blocks another patient.

---

### Risk 7: Timezone and Daylight Saving Time (DST) Drift
- **Scenario**: Patient books from the UK (BST) or US, but clinic is located in Nigeria (`Africa/Lagos`, UTC+1, no DST). Storing naive local datetimes causes 1-hour schedule misalignments.
- **Impact**: Patient arrives 1 hour early or 1 hour late.
- **Options Evaluated**:
  - *Option 1 (Naive Local Datetimes)*: Dangerous; timezone shifts break calendar logic.
  - *Option 2 (Strict UTC in DB + Explicit Timezone in Messaging — SELECTED)*:
    - Database stores all datetimes in UTC (`USE_TZ = True`).
    - API serializes timestamps with clinic's configured timezone (`Africa/Lagos`).
    - Messaging templates explicitly state the timezone: `10:00 AM (West Africa Time / WAT)`.
- **Architectural Decision**: **Option 2**. Universal UTC storage with localized formatting.

---

## 4. Category C: Front-Desk Human Gatekeeping Operational Risks

### Risk 8: Queue Starvation / Front-Desk Review Backlog
- **Scenario**: High-volume marketing campaign drives 30 web requests in 10 minutes. Receptionist is occupied with an emergency walk-in; patient cards sit unreviewed for 2+ hours.
- **Impact**: Patients abandon the clinic and book elsewhere.
- **Options Evaluated**:
  - *Option 1 (Auto-dispatch after timeout)*: Breaks the core principle of 100% receptionist gatekeeping.
  - *Option 2 (Visual Aging Badges + Audio Chime + Patient Reassurance — SELECTED)*:
    - 0–15m: Green badge `[Fresh]`
    - 15–30m: Amber badge `[Waiting]`
    - > 30m: Pulsing Red `[Delayed]` + Front-desk audio chime every 5 minutes.
    - Automated patient calming message sent at minute 30: *"We have received your request. Reception is finalizing doctor schedules and will send your times shortly."*
- **Architectural Decision**: **Option 2**. Preserves 100% human review while preventing patient abandonment.

---

### Risk 9: Shift Handover Collision (Two Receptionists Editing Same Request)
- **Scenario**: Shift change at 2:00 PM. Morning receptionist Sarah opened a card at 1:58 PM. Afternoon receptionist Mary logs in at 2:01 PM and opens the same card.
- **Impact**: Both could approve different candidate slots, sending conflicting messages to the patient.
- **Options Evaluated**:
  - *Option 1 (Last Write Wins)*: Silent overwrite, duplicate messaging.
  - *Option 2 (SSE Real-Time Presence + Optimistic Concurrency Check — SELECTED)*:
    - When Sarah opens the review modal, SSE broadcasts `request.reviewing`. Mary’s screen displays: `👀 Sarah is reviewing`.
    - Optimistic lock on save: If Sarah already dispatched, Mary’s click yields `409 Conflict: "Already dispatched by Sarah at 1:59 PM"`.
- **Architectural Decision**: **Option 2**. Complete presence visibility + zero duplicate messages.

---

### Risk 10: Front-Desk Workstation Wi-Fi / SSE Disconnect
- **Scenario**: Clinic Wi-Fi drops temporarily. Real-time SSE stream terminates silently; receptionist thinks no new patients are in the queue.
- **Impact**: Receptionist misses urgent inquiries.
- **Options Evaluated**:
  - *Option 1 (Silent Failure)*: High operational risk.
  - *Option 2 (Heartbeat Ping + Offline Banner + Polling Fallback — SELECTED)*:
    - SSE server sends a heartbeat comment `:ping` every 15 seconds.
    - If no ping is received for 30 seconds, dashboard displays a prominent top alert: `[⚠️ Network Disconnected — Reconnecting...]`.
    - Dashboard falls back to HTTP long-polling every 10 seconds until SSE re-establishes.
- **Architectural Decision**: **Option 2**. Clear visual disconnection indicator and seamless reconnect.

---

### Risk 11: Walk-In Patient Colliding with Active Online Hold
- **Scenario**: Walk-in patient arrives in-person at 10:02 AM. Receptionist wants to book them for 10:30 AM with Dr. Bello, but an online patient holds that slot until 10:15 AM.
- **Impact**: Receptionist double-books or turns away an in-person patient.
- **Options Evaluated**:
  - *Option 1 (Allow Receptionist Hard Override with Alert — SELECTED)*: Dashboard shows amber badge: `[⚠️ Temporarily Held by Online Patient Amina (Expires in 8 mins)]`. Receptionist can wait 8 minutes, or click `[Emergency In-Person Override]`, which cancels the online hold and transfers the slot to the walk-in patient. Online patient receives Template 3C with alternative times.
- **Architectural Decision**: **Option 1**. Gives receptionist complete real-world authority over the physical clinic.

---

## 5. Complete Risk & Solution Summary Matrix

| Risk ID | Domain | Failure Scenario | Selected Resilience Shield | Status |
| :--- | :--- | :--- | :--- | :--- |
| **R-01** | Messaging | Webhook replay storm / duplicate clicks | `update_id` / `IdempotencyKey` cache deduplication | ✅ User Approved |
| **R-02** | Messaging | Patient blocked bot (`403 Forbidden`) | Frontend alert `[⚠️ Call Patient]` + SMS fallback | ✅ User Approved |
| **R-03** | Messaging | Telegram 429 rate limit | n8n batching with 350ms delay between dispatches | ✅ User Approved |
| **R-04** | Messaging | Patient sends unstructured audio / photos | Store media link + attach note in Receptionist Modal | ✅ User Approved |
| **R-05** | Scheduling | Doctor sick leave during active 1-hour offer | Pre-hold re-validation inside `select_for_update` | ✅ User Approved |
| **R-06** | Scheduling | Zombie holds if sweeper misses run | Lazy self-healing expiry in `AvailabilityEngine` | ✅ User Approved |
| **R-07** | Scheduling | Timezone & DST mismatch | Universal UTC in DB + explicit `WAT` in messages | ✅ User Approved |
| **R-08** | Operations | Queue backlog / slow front desk | Visual aging badges (Green $\rightarrow$ Amber $\rightarrow$ Red) + audio chime | ✅ User Approved |
| **R-09** | Operations | Shift handover edit collision | SSE presence `👀 Sarah is reviewing` + optimistic save lock | ✅ User Approved |
| **R-10** | Operations | Workstation Wi-Fi dropout | 15s SSE heartbeat + persistent offline banner | ✅ User Approved |
| **R-11** | Operations | Walk-in patient vs online hold conflict | Front-desk emergency override with automated online patient recovery | ✅ User Approved |

---

## 5. Category D: Master Clinical Calendar & Manual Scheduling Risks

### Risk 12: Simultaneous Slot Collision (Manual Calendar Click vs Online Bot Selection)
- **Scenario**: At 10:14:02 AM, a receptionist clicks a free 11:30 AM slot on the calendar for a walk-in patient. At the exact same second, an online patient on Telegram taps `[11:30 AM]` on an offer sent 20 minutes earlier.
- **Impact**: Two patients booked for the same doctor at the same time.
- **Selected Resilience Shield**: **Single Atomic Funnel via `select_for_update()`**:
  - Both calendar clicks and bot callbacks execute the identical `hold_service.py` transaction wrapped in `select_for_update()`.
  - The first transaction to acquire the row lock succeeds and locks the slot.
  - The second transaction detects the lock and fails cleanly with a `409 Conflict`.
  - If the receptionist was second: Her calendar immediately flashes the cell orange/held, and a non-blocking toast appears: *"Slot was just claimed by Amina Yusuf via Telegram. Refreshing view..."*.
  - If the patient was second: The bot politely informs the patient: *"Apologies, that slot was just booked! Here are 2 alternative times: [12:00 PM], [12:30 PM]"*.

---

### Risk 13: Sanitization Buffer Time Violation on Manual Placement
- **Scenario**: Receptionist spots a 30-minute free gap between appointments and forces a booking into it, ignoring that the prior visit was a surgical extraction requiring a mandatory 15-minute tool sterilization buffer.
- **Impact**: Doctor starts the procedure without sterilized tools or clinic runs chronically behind schedule.
- **Selected Resilience Shield**: **Visual Buffer Blocks & Validation Guard**:
  - The calendar explicitly renders sterilization buffers as striped charcoal blocks (`10:30–10:45 AM [Sterilization Buffer]`).
  - If the receptionist attempts to book within a buffer, the system displays a clear dialog:
    > `[⚠️ Sanitization Buffer Conflict: Previous procedure requires 15m sterilization until 10:45 AM. Next safe start is 10:45 AM.]`
    > `[Option A: Snap to 10:45 AM (Recommended)]`  
    > `[Option B: Clinical Admin Override (Requires Manager PIN)]`

---

### Risk 14: Stale Calendar View on Front-Desk Monitor (Ghost Availability)
- **Scenario**: Receptionist leaves the calendar open on a secondary monitor for 25 minutes while attending to counter patients. During this time, 2 online appointments were booked and 1 was cancelled.
- **Impact**: Receptionist promises an already-booked time to a caller based on outdated screen data.
- **Selected Resilience Shield**: **SSE Cell-Level Invalidation (Zero-Reload Live Updates)**:
  - Whenever an appointment or hold is created or updated, the backend emits a `calendar.slot_updated` SSE event containing `{ doctor_id, start_time, end_time, new_status }`.
  - The frontend calendar updates that specific time block in place with a smooth color transition without requiring a full page reload.
  - A pulse badge `[🟢 Live Calendar Sync]` confirms connectivity; if offline, it turns amber: `[⚠️ Live Sync Paused - Reconnecting...]`.

---

### Risk 15: Doctor Mid-Day Emergency Absence (Mass Schedule Disruption)
- **Scenario**: At 11:30 AM, Dr. Okafor has an emergency and must leave immediately. She has 5 appointments scheduled for the afternoon.
- **Impact**: 5 patients travel to the clinic and arrive to find an absent doctor.
- **Selected Resilience Shield**: **1-Click Calendar Disruption Protocol**:
  - Receptionist right-clicks Dr. Okafor's column header $\rightarrow$ `[Mark Doctor Unavailable / Emergency Leave]`.
  - The backend immediately scans the 5 affected bookings against all active on-duty colleagues:
    1. **1-Click Colleague Reassignment**: If Dr. Bello is free at 1:00 PM and 2:30 PM for the same service, the system prompts: `[Move 2 Eligible Visits to Dr. Bello]`.
    2. **Automated Patient Recovery Dispatch**: For remaining patients, n8n immediately fires empathetic priority rescheduling messages with 3 replacement times for tomorrow or Friday.
    3. The calendar updates affected blocks to striped amber: `[⚠️ Rescheduling in Progress]`.

---

### Risk 16: Multi-Service Duration Mismatch (Overfilling a Short Free Gap)
- **Scenario**: Receptionist opens the calendar to book a patient for a 60-minute procedure (Scaling & Polishing), but clicks an available free gap that is only 30 minutes long before a doctor's scheduled break.
- **Impact**: Appointment overlaps the doctor's break or the next patient.
- **Selected Resilience Shield**: **Dynamic Duration-Aware Slot Dimming**:
  - When the calendar is opened from a patient request, it knows the service duration (e.g., 60m + 10m buffer = 70m).
  - The calendar automatically dims all free gaps shorter than 70m, rendering them non-clickable with a tooltip: *"Gap too short (30m available, 70m required)"*. Only gaps that can completely fit the procedure are highlighted as clickable.

---

### Risk 17: Accidental Booking into Floating Emergency Reserve
- **Scenario**: Clinic policy shields 1 slot per shift (e.g. 11:00 AM) as the Emergency Walk-In Reserve.
- **Impact**: Receptionist accidentally assigns a routine 6-month checkup to the emergency reserve.
- **Selected Resilience Shield**: **Visual Shield Badge & Explicit Confirmation**:
  - The emergency reserve slot is rendered in distinct purple with a shield icon: `[🛡️ Walk-In Emergency Reserve]`.
  - It is permanently excluded from public bot/web algorithms.
  - If a receptionist clicks it, a confirmation prompt appears: *"This is Cedarcare's designated Emergency Walk-In Slot. Are you sure you want to assign a routine appointment here?"*

---

## 6. Updated Complete Risk & Solution Matrix

| Risk ID | Domain | Failure Scenario | Selected Resilience Shield | Status |
| :--- | :--- | :--- | :--- | :--- |
| **R-01** | Messaging | Webhook replay storm / duplicate clicks | `update_id` / `IdempotencyKey` cache deduplication | ✅ User Approved |
| **R-02** | Messaging | Patient blocked bot (`403 Forbidden`) | Frontend alert `[⚠️ Call Patient]` + SMS fallback | ✅ User Approved |
| **R-03** | Messaging | Telegram 429 rate limit | n8n batching with 350ms delay between dispatches | ✅ User Approved |
| **R-04** | Messaging | Patient sends unstructured audio / photos | Store media link + attach note in Receptionist Modal | ✅ User Approved |
| **R-05** | Scheduling | Doctor sick leave during active 1-hour offer | Pre-hold re-validation inside `select_for_update` | ✅ User Approved |
| **R-06** | Scheduling | Zombie holds if sweeper misses run | Lazy self-healing expiry in `AvailabilityEngine` | ✅ User Approved |
| **R-07** | Scheduling | Timezone & DST mismatch | Universal UTC in DB + explicit `WAT` in messages | ✅ User Approved |
| **R-08** | Operations | Queue backlog / slow front desk | Visual aging badges (Green $\rightarrow$ Amber $\rightarrow$ Red) + audio chime | ✅ User Approved |
| **R-09** | Operations | Shift handover edit collision | SSE presence `👀 Sarah is reviewing` + optimistic save lock | ✅ User Approved |
| **R-10** | Operations | Workstation Wi-Fi dropout | 15s SSE heartbeat + persistent offline banner | ✅ User Approved |
| **R-11** | Operations | Walk-in patient vs online hold conflict | Front-desk emergency override with automated online patient recovery | ✅ User Approved |
| **R-12** | Calendar | Manual click vs online bot simultaneous hold | Unified `select_for_update()` transaction lock + 409 conflict toast | ✅ User Approved |
| **R-13** | Calendar | Sanitization buffer violation on manual drop | Striped buffer blocks + snap-to-valid-time warning guard | ✅ User Approved |
| **R-14** | Calendar | Stale screen data after 20m idle | SSE granular cell invalidation (real-time color change without reload) | ✅ User Approved |
| **R-15** | Calendar | Doctor mid-day emergency absence | 1-click colleague reassignment + automated patient rescheduling | ✅ User Approved |
| **R-16** | Calendar | Procedure duration > free gap size | Duration-aware gap dimming (disables gaps shorter than treatment) | ✅ User Approved |
| **R-17** | Calendar | Accidental routine booking in emergency slot | Purple shield styling + explicit confirmation prompt | ✅ User Approved |

