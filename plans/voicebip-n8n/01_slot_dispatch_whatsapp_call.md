# Feature 01: Receptionist Slot Dispatch (Dual WhatsApp + SMS with Voicebip Call Nudge & Cross-Channel Cancellation)

## 1. Executive Summary & Operational Strategy
When the front-desk receptionist reviews an inbound booking request and approves 3 candidate consultation times, the system executes a resilient **dual-channel dispatch with an automated audio nudge**:

1. **Simultaneous Dual Dispatch (WhatsApp + SMS)**:
   * **WhatsApp Message**: Delivers 3 interactive slot choice buttons with clinician names, dates, times, and a 60-minute selection window.
   * **SMS Text Message**: Dispatched at the exact same moment. Formatted for any basic phone or patient without active mobile data, containing the 3 choices and two ways to respond: **reply with digits (`1`, `2`, or `3`)** or **tap a 1-click mobile link**.
2. **Universal Voicebip Automated Call (30-Second Buffer)**:
   * Dials the patient's phone from the clinic's official Nigerian `+234` DID.
   * The AI voice speaks a universal prompt: *"We just sent your appointment times to your phone via WhatsApp and SMS text message. Please check your messages and select your preferred time. Your options are held for one hour so waiting patients have fair access. Thank you!"*
3. **Atomic Cross-Channel Cancellation & Double-Booking Guard**:
   * If the patient responds via **SMS** (because they don't have WhatsApp or their data is off), the clinic database immediately locks the chosen slot atomically (`select_for_update`) and creates the confirmed Appointment (`AP-XXXX`).
   * The system **automatically neutralizes the WhatsApp message**: If the patient opens WhatsApp later and taps a button, the backend detects the request is already converted and politely replies: *"You have already confirmed this appointment via SMS for Tuesday at 10:00 AM (Ref: AP-1042). See you then!"*
   * Zero double-booking or slot collision can ever occur.

---

## 2. End-to-End Architectural Flow

```
                      [1. Receptionist Review]
         Receptionist clicks [Approve & Dispatch] on Dashboard
                                │
                                │ HTTP POST (Outbound Webhook)
                                ▼
         [2. n8n Dispatcher: 05_slot_offer_dispatcher.json]
         Receives patient details, 3 candidate slots, and 60-min expiry
                                │
         ┌──────────────────────┼──────────────────────┐
         ▼                      ▼                      ▼
  [Step A: WhatsApp]     [Step B: SMS Text]     [Step C: 30s Wait Node]
  Interactive buttons    Text with 3 slots &    Waits for messages to land
  "1️⃣ Tue 10:00 AM"      "Reply 1, 2, or 3      on patient's lock screen
  "2️⃣ Tue 02:30 PM"      or tap clinic.ng/opt"         │
  "3️⃣ Wed 11:15 AM"             │                      ▼
         │                      │           [Voicebip Campaign Node]
         │                      │           Dials patient phone (+234...)
         │                      │           Voice speaks:
         │                      │           "We sent your appointment times
         │                      │            via WhatsApp and SMS. Please check
         │                      │            your messages and choose your time.
         │                      │            Options expire in 1 hour. Thank you!"
         │                      │                      │
         └──────────────┬───────┴──────────────────────┘
                        │
                        ▼
       [3. Patient Responds (e.g. via SMS: "1")]
                        │
                        ▼
       [4. n8n Inbound Selection Router]
       Captures SMS reply "1" (or WhatsApp button tap)
                        │
                        │ HTTP POST /api/v1/slots/hold/
                        ▼
       [5. Clinic Database (Django ORM)]
       Executes SELECT FOR UPDATE atomic row lock:
       • Locks Slot 1 (is_selected = True)
       • Transitions BookingRequest status: slots_offered → converted
       • Generates Appointment AP-1042
       • Pushes SSE event to receptionist workstation (< 50ms)
                        │
       ┌────────────────┴─────────────────────────────┐
       ▼                                              ▼
[SMS Confirmation Receipt]            [WhatsApp Offer Neutralized]
Sends SMS to patient:                 If patient taps WhatsApp button later:
"Confirmed! Ref: AP-1042.             System returns ALREADY_CONFIRMED:
 Dr. Bello on Tue 10 Nov at 10 AM.    "You already confirmed this appointment
 Address: Plot 1042 Aminu Kano Cres"   via SMS for Tue 10 AM (Ref: AP-1042)!"
```

---

## 3. Data Contract: Outbound Trigger (Clinic System $\rightarrow$ n8n)

When the receptionist clicks **Approve & Dispatch**, the clinic backend fires an HTTP POST request to the configured n8n webhook URL:

* **Target URL**: `$N8N_DISPATCH_WEBHOOK_URL` (e.g. `https://your-n8n.com/webhook/dispatch-offers`)
* **Method**: `POST`
* **Headers**:
  ```http
  Content-Type: application/json
  X-Clinic-Event: slots.dispatched
  ```

### Outbound JSON Schema:
```json
{
  "event": "slots.dispatched",
  "dispatch_channel": "dual_whatsapp_and_sms",
  "voice_nudge_enabled": true,
  "request_id": "REQ-2026-0042",
  "patient": {
    "name": "Amina Garba",
    "phone": "+2348031234567",
    "gender": "Female",
    "patient_type": "returning"
  },
  "service": {
    "name": "Dental Consultation & Examination",
    "duration_minutes": 30
  },
  "expiry": {
    "window_minutes": 60,
    "expires_at": "2026-11-10T15:30:00Z"
  },
  "candidate_slots": [
    {
      "slot_offer_id": "019488a0-e832-7213-9a3b-24b5849df001",
      "slot_number": 1,
      "doctor_name": "Dr. Bello Ibrahim",
      "date_label": "Tue, 10 Nov",
      "time_label": "10:00 AM",
      "start_datetime": "2026-11-10T10:00:00+01:00",
      "end_datetime": "2026-11-10T10:30:00+01:00"
    },
    {
      "slot_offer_id": "019488a1-e832-7213-9a3b-24b5849df002",
      "slot_number": 2,
      "doctor_name": "Dr. Chinwe Okafor",
      "date_label": "Tue, 10 Nov",
      "time_label": "02:30 PM",
      "start_datetime": "2026-11-10T14:30:00+01:00",
      "end_datetime": "2026-11-10T15:00:00+01:00"
    },
    {
      "slot_offer_id": "019488a2-e832-7213-9a3b-24b5849df003",
      "slot_number": 3,
      "doctor_name": "Dr. Babawo",
      "date_label": "Wed, 11 Nov",
      "time_label": "11:15 AM",
      "start_datetime": "2026-11-11T11:15:00+01:00",
      "end_datetime": "2026-11-11T11:45:00+01:00"
    }
  ]
}
```

---

## 4. Message Contents & Templates for Both Channels

### A. WhatsApp Message Format (With Interactive Buttons)
* **Header**: `Cedarcare Specialist Clinic`
* **Body**:
  > *"Hello Amina, our front desk has reviewed your request for Dental Consultation & Examination and reserved the following options for you:*  
  > *1️⃣ Tue, 10 Nov at 10:00 AM (Dr. Bello)*  
  > *2️⃣ Tue, 10 Nov at 02:30 PM (Dr. Chinwe)*  
  > *3️⃣ Wed, 11 Nov at 11:15 AM (Dr. Babawo)*  
  >  
  > *⏳ Please tap your preferred time below to confirm. These options are held for 1 hour so all patients have fair access to the doctor's calendar."*
* **Buttons**:
  * `[ 1️⃣ Tue, 10 Nov at 10:00 AM ]`
  * `[ 2️⃣ Tue, 10 Nov at 02:30 PM ]`
  * `[ 3️⃣ Wed, 11 Nov at 11:15 AM ]`

### B. SMS Text Message Format (For Non-WhatsApp / Offline Patients)
* **Sender ID**: `Cedarcare`
* **Body**:
  > *"Cedarcare Clinic: Your consultation slots are ready. 1) Tue 10am (Dr Bello), 2) Tue 2:30pm (Dr Chinwe), 3) Wed 11:15am (Dr Babawo). Reply 1, 2, or 3 to lock in your time, or tap: https://clinic.ng/opt/REQ-2026-0042. Held for 1 hr."*

---

## 5. Voicebip Campaign & Call Configuration (Universal Audio Nudge)

* **Trigger**: 30 seconds after WhatsApp and SMS are dispatched.
* **Endpoint**: `POST https://api.voicebip.com/v1/campaigns`
* **Headers**:
  ```http
  Authorization: Bearer pk_live_xxxxxxxxxxxxxxxxxxxx
  Content-Type: application/json
  ```
* **Payload**:
  ```json
  {
    "channel": "voice",
    "config": {
      "from_number": "+2341002223344",
      "call_window": { "start": "08:00", "end": "19:00", "timezone": "Africa/Lagos" }
    },
    "retry_policy": {
      "max_attempts": 2,
      "backoff_seconds": 300
    },
    "targets": [
      {
        "to_address": "{{ $json.patient.phone }}",
        "params": {
          "name": "{{ $json.patient.name }}"
        }
      }
    ]
  }
  ```

### Universal Voice Prompt:
> *"Hello {{name}}, this is Cedarcare Specialist Clinic.*  
> *Our reception team has reviewed your booking request and just sent your available appointment times to your phone **via WhatsApp and SMS text message**.*  
> *Please check your messages and choose your preferred time.*  
> *Kindly note that your options are held for one hour so that other waiting patients can also be scheduled. Thank you, and have a pleasant day!"*

---

## 6. Data Contract: Inbound Selection & Cross-Channel Cancellation

When the patient responds via **EITHER** SMS or WhatsApp:

* **Endpoint**: `POST https://your-clinic-backend.up.railway.app/api/v1/slots/hold/`
* **Headers**:
  ```http
  Content-Type: application/json
  X-Webhook-Secret: clinic_dev_secret_2026
  ```
* **Payload from n8n (SMS or WhatsApp)**:
  ```json
  {
    "slot_offer_id": "019488a0-e832-7213-9a3b-24b5849df001",
    "request_id": "REQ-2026-0042",
    "action": "select_slot",
    "response_channel": "sms"
  }
  ```

### Database Behavior & Cross-Channel Cancellation:
1. **Atomic Transaction**: Backend locks the row via `BookingRequest.objects.select_for_update()`.
2. **If Request is Active (`slots_offered`)**:
   * Transitions status to `converted`.
   * Sets chosen `SlotOffer(is_selected=True)`.
   * Creates `Appointment(status='confirmed', appointment_code='AP-1042')`.
   * Returns **HTTP 201 Created**:
     ```json
     {
       "status": "confirmed",
       "appointment_code": "AP-1042",
       "patient_name": "Amina Garba",
       "doctor_name": "Dr. Bello Ibrahim",
       "start_datetime": "2026-11-10T10:00:00+01:00",
       "confirmed_via": "sms"
     }
     ```
   * n8n shoots confirmation SMS: *"Confirmed! Ref: AP-1042 with Dr. Bello on Tue 10 Nov at 10 AM. See you then!"*
3. **If Patient Later Taps WhatsApp Button**:
   * The backend checks `booking.status`. It sees it is already `converted`!
   * Returns **HTTP 200 with code `ALREADY_CONFIRMED`**:
     ```json
     {
       "status": "already_confirmed",
       "appointment_code": "AP-1042",
       "confirmed_via": "sms",
       "message": "Appointment AP-1042 is already confirmed for Tue 10 Nov at 10:00 AM."
     }
     ```
   * n8n replies on WhatsApp: *"Hello Amina, your appointment is already confirmed via SMS for Tuesday at 10:00 AM with Dr. Bello (Ref: AP-1042). No further action needed!"*

---

## 7. Edge Cases & Resilience Safeguards

| # | Edge Case Scenario | System & n8n Defense |
| :--- | :--- | :--- |
| **1** | **Patient's number is not registered on WhatsApp** | Meta API returns an error on WhatsApp delivery, but the SMS arrives instantly. The patient reads the SMS, picks their time, and the booking succeeds without disruption. |
| **2** | **Patient has no active internet / mobile data** | WhatsApp cannot deliver until they find Wi-Fi, but the cellular SMS reaches them immediately. The patient replies `1` via SMS text. |
| **3** | **Voicebip call fails or goes to voicemail** | The call is an auxiliary audio nudge. Both the WhatsApp and SMS messages are already delivered, giving the patient full access to their options. |
| **4** | **Patient responds on both WhatsApp and SMS** | The first incoming response acquires the database row lock and confirms the booking. The second response is greeted with the `"Already Confirmed"` message. Double-booking is mathematically impossible. |
| **5** | **1 hour elapses without any response** | The 60-second sweeper marks the request as `offer_expired`. Any later tap on either SMS link or WhatsApp button returns `OFFER_EXPIRED`, offering a 1-click re-request. |

---

## 8. Clinic Management System Readiness Checklist

When development starts, here are the exact adjustments to be applied to the clinic codebase:
- [ ] **Frontend (`ReviewModal.jsx`)**: Ensure dispatch default is set to `[🟢 Dual Dispatch: WhatsApp + SMS + Voicebip Call]`.
- [ ] **Frontend (`WebIntakeForm.jsx`)**: Add optional `[x] This number is on WhatsApp` checkbox under patient phone input for proactive routing intelligence.
- [ ] **Backend (`views_booking.py`)**: Ensure `DispatchOffersView` outputs the dual payload with both candidate slot IDs and mobile shortlinks to n8n.
- [ ] **Backend (`views_appointment.py`)**: Ensure `SlotHoldView` handles the `ALREADY_CONFIRMED` idempotency check cleanly for cross-channel neutralization.
- [ ] **n8n (`05_slot_offer_dispatcher.json`)**: Add parallel SMS dispatch node alongside WhatsApp, followed by the 30s delay and Voicebip call.
