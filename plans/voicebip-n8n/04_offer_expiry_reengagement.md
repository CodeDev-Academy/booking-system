# Feature 04: 60-Minute Slot Offer Expiry & Patient Re-Engagement Protocol

## 1. Executive Summary & Operational Strategy
When candidate consultation slots are dispatched in Feature 1, they are held for **60 minutes** to keep the doctor's calendar open and fair for all patients. 

Feature 4 implements your **3-Phase Expiry & Patient Recovery Strategy** (codified in `AGENTS.md`) to prevent lost bookings:

1. **Phase A: Upfront Expectation Setting** (Established in Feature 1):
   * Initial WhatsApp, SMS, and Voicebip notices clearly set expectations: *"These options are held for 1 hour so all waiting patients have fair access."*
2. **Phase B: Soft Reminder (45 Minutes In — 15 Mins Left)**:
   * If no selection has been made after 45 minutes, n8n sends a gentle WhatsApp & SMS nudge:  
     *"Friendly reminder: Your appointment choices for Dental Consultation expire in 15 minutes. Tap a button above to lock in your time."*
3. **Phase C: Graceful Expiry & 1-Click Re-Engagement (At 60 Minutes)**:
   * **Doctor Calendar Protection**: The 60-second sweeper marks the request as `offer_expired` and releases the unselected slots back into the open doctor pool.
   * **Receptionist Dashboard**: Card moves from "New Requests" to the **"Expired Requests"** tab.
   * **Warm Recovery Outreach**: n8n automatically sends a supportive WhatsApp & SMS message:  
     *"The previously offered slots have expired to keep our schedule open. We'd still love to see you! Tap below to request fresh times from reception."* `[ 🔄 See New Times ]`
   * **Priority Re-Queue**: When the patient taps `[See New Times]`, the request is elevated directly into the receptionist's **"Re-Requested Slots" Priority Tab** with an immediate audio chime.

---

## 2. End-to-End Architectural Flow

```
                      [Receptionist Dispatches 3 Slots (Feature 1)]
                      60-Minute Expiration Timer Active
                                       │
                      [45 Minutes Pass With No Selection]
                                       │
                                       ▼
                      [Phase B: 45-Minute Soft Nudge]
                      Sent simultaneously via WhatsApp & SMS:
                      "Friendly reminder: Your appointment choices for
                       Dental Consultation expire in 15 minutes.
                       Tap a button above to lock in your time."
                                       │
                      [60 Minutes Pass With No Selection]
                                       │
                                       ▼
                      [Phase C: 60-Minute Expiry Sweeper Runs]
                      n8n Cron (02_hold_and_offer_expiry_cron.json) calls:
                      POST /api/v1/webhooks/expiry-sweep/
                      • Request status: slots_offered → offer_expired
                      • Doctor slots freed on schedule
                      • Card moves to "Expired Requests" tab on Receptionist Queue
                                       │
                                       ▼
                      [Automated Dual Re-Engagement Outreach (WhatsApp + SMS)]
                      Sent automatically (Zero phone calls):
                      "Hello Amina, the previously offered slots have expired
                       to keep our schedule open. We'd still love to see you!
                       Whenever you are ready, tap below to request fresh times."
                                       │
                                       │ WhatsApp Button: [ 🔄 See New Times ]
                                       │ SMS Text: "Reply NEW or tap: https://clinic.ng/re/REQ-0042"
                                       │
                                       ▼
                        [Patient Taps: "See New Times"]
                                       │
                                       ▼
                      [n8n Router: POST /api/v1/booking-requests/{id}/re-request/]
                      • Request status: offer_expired → re_requested
                      • Moves directly to "Re-Requested Slots" Priority Tab
                      • Audio Chime plays at Reception Desk:
                        "Amina Garba requested fresh appointment times"
                      • Real-time SSE event updates receptionist screen (< 50ms)
                                       │
                                       ▼
                      [Instant Acknowledgment Sent to Patient]
                      "Thank you Amina! Our front desk is reviewing fresh times
                       for you right now and will dispatch them shortly."
                                       │
                                       ▼
                      [Receptionist Dispatches Fresh Slots (Triggers Feature 1 Again!)]
```

---

## 3. Data Contracts & Webhooks

### A. Expiry Sweeper Trigger (n8n $\rightarrow$ Clinic System)
* **Target URL**: `POST https://your-clinic-backend.up.railway.app/api/v1/webhooks/expiry-sweep/`
* **Schedule**: Every 60 seconds (`*/1 * * * *` via `02_hold_and_offer_expiry_cron.json`)
* **Headers**:
  ```http
  Content-Type: application/json
  X-Webhook-Secret: clinic_dev_secret_2026
  ```
* **Payload**:
  ```json
  {
    "triggered_by": "n8n_cron_sweeper",
    "timestamp": "2026-11-10T23:00:00Z"
  }
  ```
* **Clinic Response (HTTP 200 OK)**:
  ```json
  {
    "status": "success",
    "expired_offers_count": 1,
    "expired_requests": [
      {
        "request_id": "REQ-2026-0042",
        "patient_name": "Amina Garba",
        "patient_phone": "+2348031234567",
        "service_name": "Dental Consultation & Examination"
      }
    ]
  }
  ```

---

### B. Inbound Re-Request Trigger (n8n $\rightarrow$ Clinic System)
When the patient taps `[ 🔄 See New Times ]` on WhatsApp or replies `NEW` on SMS:

* **Target URL**: `POST https://your-clinic-backend.up.railway.app/api/v1/booking-requests/REQ-2026-0042/re-request/`
* **Headers**:
  ```http
  Content-Type: application/json
  X-Webhook-Secret: clinic_dev_secret_2026
  ```
* **Payload**:
  ```json
  {
    "re_requested_by": "patient_whatsapp_button"
  }
  ```
* **Clinic Response (HTTP 200 OK)**:
  ```json
  {
    "status": "re_requested",
    "request_id": "REQ-2026-0042",
    "patient_name": "Amina Garba",
    "detail": "Request placed in receptionist priority Re-Requested tab."
  }
  ```

---

## 4. Exact Message Templates for Both Channels

### Phase B: 45-Minute Soft Warning (15 Minutes Remaining)

#### A. WhatsApp Message Format:
* **Body**:
  > *"⏳ **Friendly Reminder**: Hello **{{patient_name}}**, your 3 reserved appointment times for **{{service_name}}** will expire in **15 minutes**.*  
  >  
  > *Please tap your preferred time above to confirm your booking before the slots are released to other waiting patients."*

#### B. SMS Text Message Format:
* **Sender ID**: `Cedarcare`
* **Body**:
  > *"Cedarcare Clinic: Your consultation choices expire in 15 mins. Reply 1, 2, or 3 or tap your booking link to lock in your time before slots are released."*

---

### Phase C: 60-Minute Expiry & Re-Engagement Notice

#### A. WhatsApp Message Format:
* **Header**: `Cedarcare Specialist Clinic • Schedule Notice`
* **Body**:
  > *"Hello **{{patient_name}}**, the appointment times previously offered for **{{service_name}}** have expired to keep our schedule open for all patients.*  
  >  
  > *We would still love to see you! Whenever you are ready, simply tap below to request fresh available times from our reception team:"*
* **Button**:
  * `[ 🔄 Request Fresh Times ]` (callback: `re_request_slots_REQ-2026-0042`)

#### B. SMS Text Message Format:
* **Sender ID**: `Cedarcare`
* **Body**:
  > *"Cedarcare Clinic: Your offered slots have expired. We'd still love to care for you! Reply NEW or tap: https://clinic.ng/re/REQ-2026-0042 to request fresh times from reception."*

---

### Immediate Reassurance Receipt (After Tapping "Request Fresh Times")

#### WhatsApp & SMS Receipt:
> *"Thank you **{{patient_name}}**! Our front desk has received your request and is reviewing fresh available times for you right now. We will send new options shortly!"*

---

## 5. Edge Cases & Resilience Safeguards

| # | Edge Case Scenario | System & n8n Defense |
| :--- | :--- | :--- |
| **1** | **Patient taps an old slot button after 65 minutes** | Database checks `offer.expires_at < now()`. Rejects with HTTP 410 `OFFER_EXPIRED`. n8n automatically replies: *"These options have expired. Tap below to receive fresh times:"* `[ 🔄 See New Times ]`. |
| **2** | **Patient taps "Request Fresh Times" multiple times** | Idempotency guard on `POST /re-request/` checks if status is already `re_requested`. Leaves the card safely in the priority queue without creating duplicate cards. |
| **3** | **Receptionist is away from desk when re-request lands** | Visual glowing amber badge (`Re-Requested`) on the tab + Web Audio chime rings on the computer. Card remains at the top of the queue until attended to. |
| **4** | **Patient has no active internet data** | Both the 45-minute soft reminder and the 60-minute expiry message are delivered via cellular SMS text. Patient simply replies `NEW` via SMS to trigger fresh times. |

---

## 6. Clinic Management System Readiness Checklist

When development starts, here are the exact adjustments to be applied to the clinic codebase:
- [ ] **Backend (`views_booking.py`)**: Verify `BookingRequestReRequestView` updates `booking.status = 're_requested'` and broadcasts the `request.re_requested` SSE event to the queue.
- [ ] **Backend (`services/sweep_service.py`)**: Ensure `SweepService.run_expiry_sweep()` expires unselected `SlotOffer` records and emits the `offer.expired` event.
- [ ] **Frontend (`TriageQueuePane.jsx`)**: Ensure the **"Re-Requested Slots"** tab displays an elevated priority badge and plays the audio chime upon receipt.
- [ ] **n8n (`02_hold_and_offer_expiry_cron.json`)**: Configure the 60-second schedule trigger to call `/api/v1/webhooks/expiry-sweep/`.
- [ ] **n8n (`04_patient_response_handler.json`)**: Ensure `re_request_slots_{id}` calls `/api/v1/booking-requests/{id}/re-request/` and replies with the reassurance receipt.

