# Feature 03: Doctor Emergency Sick Leave Disruption Protocol (Priority Urgent Voicebip Call + Dual WhatsApp & SMS)

## 1. Executive Summary & Operational Strategy
When a doctor unexpectedly falls sick or is called away on an emergency, their scheduled patients for the day are disrupted. Because patients may already be dressing or commuting, text messages alone risk being missed. 

Feature 3 provides an **urgent multi-channel emergency alert sequence**:

1. **Priority Urgent Voicebip Call**:
   * Dials the patient's phone immediately from the clinic's official Nigerian `+234` DID.
   * Delivers a clear, urgent audio alert informing the patient of the clinician's unexpected absence.
   * Explicitly instructs the patient:  
     > *"Please check your WhatsApp now for our receptionist's direct phone number and further information regarding your appointment."*
2. **Simultaneous Dual WhatsApp + SMS Dispatch**:
   * **WhatsApp Message**: Contains the complete clinical update, the reassignment details or replacement dates, and **the receptionist's direct phone number prominently displayed** for immediate 1-tap calling.
   * **SMS Text Message**: Dispatched simultaneously over the cellular network so patients who are **offline, have no mobile data, or are not registered on WhatsApp** receive the notice and the receptionist's direct phone number immediately.
3. **Two Front-Desk Resolution Scenarios**:
   * **Scenario 1: 1-Click Colleague Reassignment (Same Time, New Doctor)**:
     * If a qualified colleague (e.g., Dr. Chinwe Okafor) is free at that exact hour, reception reassigns the patient with 1 click.
     * The patient's appointment time **does not change** (e.g., still 10:00 AM today).
     * The WhatsApp & SMS notice reassures them that their care is guaranteed without delay, with reception's number if they have questions.
   * **Scenario 2: Priority Reschedule (No Colleague Free, Select New Date)**:
     * If no qualified colleague is free at that time, reception clicks **[Dispatch Priority Reschedule Options]**.
     * The system calculates 3 priority replacement dates and dispatches our **Feature 1 Dual Dispatch** (WhatsApp buttons + SMS reply options) with a 1-hour priority hold window.

---

## 2. End-to-End Architectural Flow

```
                     [Doctor Marked On Sick Leave on Dashboard]
                                         │
                                         ▼
                        [Clinic Disruption Panel Opens]
                        Lists all affected patients for today
                                         │
              ┌──────────────────────────┴──────────────────────────┐
              ▼                                                     ▼
[SCENARIO 1: COLLEAGUE REASSIGNMENT]                  [SCENARIO 2: PRIORITY RESCHEDULE]
Colleague free at exact same time                     No colleague free at that hour
Reception clicks [Reassign to Dr. Chinwe]             Reception clicks [Dispatch Reschedule]
              │                                                     │
              └──────────────────────────┬──────────────────────────┘
                                         │
                                         ▼
                      [n8n Emergency Orchestrator Triggers]
                                         │
         ┌───────────────────────────────┼───────────────────────────────┐
         ▼                               ▼                               ▼
  [Step A: WhatsApp]              [Step B: SMS Text]              [Step C: Voicebip Call]
  Emergency card sent:            Text sent over GSM:             Dials patient phone (+234...)
  • Details of disruption         • "Dr. Bello on leave.          Urgent Voice Prompt:
  • Reassigned doctor/dates         Reassigned to Dr. Chinwe.     "Hello {{name}}, this is an
  • Reception Phone highlighted:    Call reception directly at     urgent notice from Cedarcare
    +234 803 000 1122               +2348030001122."               Clinic regarding your visit today.
         │                               │                         Dr. {{doctor}} is on emergency leave.
         │                               │                         Please check your WhatsApp now for
         │                               │                         the receptionist's direct phone
         │                               │                         number and further information. Thank you!"
         │                               │                                       │
         └───────────────────────────────┼───────────────────────────────────────┘
                                         │
                                         ▼
                        [Patient Hears Call & Opens WhatsApp]
                        • Sees full clinical explanation
                        • Sees Receptionist Direct Phone Line: +234 803 000 1122
                        • Taps number to speak with front desk if needed,
                          or attends at 10:00 AM with Dr. Chinwe as reassigned!
```

---

## 3. Data Contract: Outbound Disruption Webhook (Clinic $\rightarrow$ n8n)

### A. For Scenario 1: Colleague Reassignment
When reception clicks **Reassign Colleague**, Django POSTs to n8n:

* **Event**: `doctor.disruption_reassigned`
* **Method**: `POST`
* **Headers**:
  ```http
  Content-Type: application/json
  X-Clinic-Event: doctor.disruption_reassigned
  ```
* **Payload**:
```json
{
  "event": "doctor.disruption_reassigned",
  "appointment_id": "AP-1042",
  "patient": {
    "name": "Amina Garba",
    "phone": "+2348031234567"
  },
  "service_name": "Dental Consultation & Examination",
  "original_doctor": "Dr. Bello Ibrahim",
  "assigned_doctor": "Dr. Chinwe Okafor",
  "appointment_time": "10:00 AM",
  "appointment_date": "Today, Tuesday, Nov 10",
  "clinic_phone": "+2348030001122",
  "clinic_address": "Plot 1042 Aminu Kano Crescent, Wuse 2, Abuja"
}
```

---

### B. For Scenario 2: Priority Reschedule Dispatch
When reception clicks **Dispatch Reschedule**, Django POSTs the candidate slots using the standardized Feature 1 payload:

* **Event**: `slots.dispatched`
* **Sub-Type**: `disruption_reschedule`
* **Payload**: (Standard Feature 1 candidate slots schema with 3 alternative replacement dates and `clinic_phone`).

---

## 4. Exact Voice Prompt & Message Templates

### A. Urgent Voicebip Phone Call Script (Universal Emergency Nudge)
* **Trigger**: Immediately when reception clicks Reassign or Reschedule.
* **Caller ID**: Clinic's registered Nigerian `+234` DID.
* **Spoken Script**:
  > *"Hello {{patient.name}}, this is an urgent notification from Cedarcare Specialist Clinic regarding your appointment today with Dr. {{original_doctor}}.*  
  > *Dr. {{original_doctor}} has unexpectedly been called away on medical leave.*  
  > *We have sent the complete update and our receptionist's direct phone number to your WhatsApp and SMS.*  
  > *Please check your WhatsApp immediately for the receptionist's direct number and further information regarding your appointment. Thank you!"*

---

### B. Scenario 1: Colleague Reassignment Messages (Same Time, New Doctor)

#### WhatsApp Message Format:
* **Header**: `🚨 Cedarcare Specialist Clinic • Urgent Schedule Update`
* **Body**:
  > *"Hello **{{patient.name}}**, this is an important schedule update regarding your appointment today:*  
  >  
  > *Dr. {{original_doctor}} has unexpectedly been called away on medical emergency leave. To ensure your medical care proceeds today without disruption, your consultation has been safely reassigned to our senior clinician, **Dr. {{assigned_doctor}}**, at the exact same scheduled time:*  
  >  
  > *📅 **Date**: {{appointment_date}}*  
  > *⏰ **Time**: {{appointment_time}} (Unchanged)*  
  > *👨‍⚕️ **Attending Clinician**: Dr. {{assigned_doctor}}*  
  > *📍 **Location**: {{clinic_address}}*  
  >  
  > *Your appointment remains confirmed. If you have any questions or prefer to reschedule to a later date, please call our front desk directly at:*  
  > *📞 **Reception Direct Line: {{clinic_phone}}***  
  >  
  > *See you at {{appointment_time}}!"*

#### SMS Text Message Format (For Offline / Non-WhatsApp Patients):
* **Sender ID**: `Cedarcare`
* **Body**:
  > *"Cedarcare Clinic URGENT: Dr. Bello is on medical leave today. Your 10:00 AM visit is reassigned to Dr. Chinwe at the same time. Confirmed. For questions, call reception: +2348030001122."*

---

### C. Scenario 2: Priority Reschedule Messages (No Colleague Free, Pick New Time)

#### WhatsApp Message Format:
* **Header**: `🚨 Cedarcare Specialist Clinic • Urgent Reschedule Notice`
* **Body**:
  > *"Hello **{{patient.name}}**, we regret to inform you that Dr. {{original_doctor}} is unexpectedly on medical leave today, and our other clinicians are fully booked for this specialty.*  
  >  
  > *We have reserved 3 priority replacement times for you to choose from:*  
  > *1️⃣ Tomorrow, Wed 11 Nov at 10:00 AM*  
  > *2️⃣ Tomorrow, Wed 11 Nov at 02:30 PM*  
  > *3️⃣ Thursday, 12 Nov at 11:15 AM*  
  >  
  > *⏳ Please tap an option below to lock in your replacement time. Held for 1 hour.*  
  > *📞 If you prefer to speak with our front desk directly, call: **{{clinic_phone}}**"*
* **Buttons**:
  * `[ 1️⃣ Wed 10:00 AM ]`
  * `[ 2️⃣ Wed 02:30 PM ]`
  * `[ 3️⃣ Thu 11:15 AM ]`

#### SMS Text Message Format (For Offline / Non-WhatsApp Patients):
* **Sender ID**: `Cedarcare`
* **Body**:
  > *"Cedarcare Clinic: Dr. Bello is on emergency leave today. Priority slots: 1) Wed 10am, 2) Wed 2:30pm, 3) Thu 11:15am. Reply 1, 2, or 3 or tap: https://clinic.ng/opt/REQ-0042. Call desk: +2348030001122."*

---

## 5. Edge Cases & Resilience Safeguards

| # | Edge Case Scenario | System & n8n Defense |
| :--- | :--- | :--- |
| **1** | **Patient is driving and cannot read text** | The Voicebip urgent call rings their car Bluetooth/phone, delivering the spoken alert so they know not to commute blindly, directing them to check WhatsApp once parked. |
| **2** | **Patient doesn't answer the phone call** | Both the WhatsApp message and the cellular SMS text are already delivered on their screen with the receptionist's direct phone number. |
| **3** | **Patient wants to speak to reception immediately** | The receptionist direct phone line (`+234 803 000 1122`) is highlighted at the top of the WhatsApp and SMS messages, allowing 1-tap dialing. |
| **4** | **Colleague has already reached daily appointment ceiling** | `DisruptionService` checks `daily_count >= colleague.max_daily_appointments` (burnout ceiling) before allowing reassignment. If all colleagues are at capacity, the system automatically routes to Scenario 2 (Priority Reschedule). |

---

## 6. Clinic Management System Readiness Checklist

When development starts, here are the exact adjustments to be applied to the clinic codebase:
- [ ] **Backend (`views_appointment.py`)**: In `ReassignLeaveView`, trigger the outbound n8n webhook (`doctor.disruption_reassigned`) with patient, service, doctor names, and clinic contact phone number.
- [ ] **Backend (`models.py`)**: Verify `ClinicSetting` contains the official front-desk phone number (`phone = "+2348030001122"`).
- [ ] **Frontend (`DisruptionResolutionModal.jsx`)**: Add confirmation toast showing: `Colleague Reassigned • Urgent Call & WhatsApp/SMS Dispatched`.
- [ ] **n8n (`05_slot_offer_dispatcher.json` or disruption workflow)**: Configure the Voicebip call node + parallel WhatsApp & SMS dispatch for `doctor.disruption_reassigned`.
