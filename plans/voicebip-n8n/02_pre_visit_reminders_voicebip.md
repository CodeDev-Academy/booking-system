# Feature 02: Pre-Visit Reminders (24-Hour Informative Notice & 2-Hour Location Guide — WhatsApp & SMS Only)

## 1. Executive Summary & Operational Strategy
Feature 2 provides a clean, stress-free digital reminder sequence designed purely to keep patients informed and punctual, operating strictly via **WhatsApp & SMS (Zero Phone Calls)**:

1. **24 Hours Before Visit (Informative Appointment Reminder)**:
   * A pure, polite reminder informing the patient of their appointment tomorrow (Doctor, Service, Date, and Time).
   * **No interactive buttons, no automated reschedule, and no cancel button**.
   * If the patient needs to make any adjustments, the message provides the front desk's direct phone line to speak with the receptionist manually.
2. **2 Hours Before Visit (Location, Directions & Arrival Protocol)**:
   * A timely travel guide with the clinic's physical address, Google Maps pin link, parking instructions, and arrival advice (arrive 10 minutes early for vitals check-in).

---

## 2. End-to-End Architectural Flow

```
=============================================================================
STAGE 1: 24 HOURS BEFORE APPOINTMENT (APPOINTMENT DETAILS REMINDER)
=============================================================================

[Automated Trigger: n8n Cron (Daily at 08:00 & 18:00)]
n8n queries Django API: GET /api/v1/appointments/upcoming-reminders/?window_hours=24
          │
          │ Returns appointments scheduled for tomorrow
          ▼
[Dual-Channel Dispatch (WhatsApp + SMS Simultaneously — Zero Calls)]
          │
          ├─────────────────────────────────────────┐
          ▼                                         ▼
   [Step A: WhatsApp Message]                [Step B: SMS Text Message]
   Clean informative card:                   Clean text message:
   "Hello Amina, reminder of your visit      "Cedarcare Clinic: Reminder for your visit
    tomorrow at 10:00 AM with Dr. Bello.      tomorrow at 10:00 AM with Dr. Bello.
    If you need to make changes, call our     To make changes, call reception at
    front desk at +234 803 000 1122."         +234 803 000 1122. See you tomorrow!"

=============================================================================
STAGE 2: 2 HOURS BEFORE APPOINTMENT (LOCATION & ARRIVAL INSTRUCTIONS)
=============================================================================

[Automated Trigger: n8n Cron (2 Hours Before start_datetime)]
Checks for appointments where status == 'confirmed'
          │
          ▼
[Dual WhatsApp + SMS Location & Instructions Alert (Zero Calls)]
Sends:
"Hello {{patient_name}}, your appointment with Dr. {{doctor_name}} is in 2 hours ({{time_display}} today)!

📍 Clinic Address: Plot 1042 Aminu Kano Crescent, Wuse 2, Abuja
🗺️ Google Maps: https://maps.google.com/?q=Cedarcare+Clinic+Abuja
🅿️ Parking: Free secure on-site parking available inside the gate.
🕒 Instructions: Please arrive 10 minutes early to complete vital signs check-in at the front desk.
📞 Reception Line: +234 803 000 1122. Safe travels!"
```

---

## 3. Data Contract: Fetching Due Reminders (n8n $\rightarrow$ Clinic System)

* **Target URL**: `GET https://your-clinic-backend.up.railway.app/api/v1/appointments/upcoming-reminders/`
* **Headers**:
  ```http
  Content-Type: application/json
  X-Webhook-Secret: clinic_dev_secret_2026
  ```
* **Query Parameters**: `window_days=1` (or `window_hours=24`)

### Clinic Response (HTTP 200 OK):
```json
[
  {
    "appointment_id": "AP-1042",
    "patient_name": "Amina Garba",
    "patient_phone": "+2348031234567",
    "doctor_name": "Dr. Bello Ibrahim",
    "service_name": "Dental Consultation & Examination",
    "start_datetime": "2026-11-11T10:00:00+01:00",
    "time_display": "10:00 AM",
    "date_display": "Wednesday, Nov 11",
    "clinic_phone": "+2348030001122",
    "status": "confirmed"
  }
]
```

---

## 4. Exact Message Templates for Both Channels

### Stage 1: 24-Hour Pre-Visit Reminder (Informative Only)

#### A. WhatsApp Message Format
* **Header**: `Cedarcare Specialist Clinic • Appointment Reminder`
* **Body**:
  > *"Hello **{{patient_name}}**, this is a friendly reminder for your upcoming medical consultation:*  
  >  
  > *👨‍⚕️ **Doctor**: Dr. {{doctor_name}}*  
  > *🩺 **Service**: {{service_name}}*  
  > *📅 **Date**: {{date_display}}*  
  > *⏰ **Time**: {{time_display}}*  
  > *📍 **Location**: Plot 1042 Aminu Kano Crescent, Wuse 2, Abuja*  
  >  
  > *ℹ️ If you need to make any changes to your scheduled appointment, please call our front desk directly at **+234 803 000 1122**. We look forward to seeing you tomorrow!"*

#### B. SMS Text Message Format (For Basic Phones / Non-WhatsApp)
* **Sender ID**: `Cedarcare`
* **Body**:
  > *"Cedarcare Clinic: Reminder for your consultation tomorrow at {{time_display}} with Dr. {{doctor_name}}. To make any changes, please call reception at +2348030001122. See you tomorrow!"*

---

### Stage 2: 2-Hour Pre-Visit Travel & Arrival Guide

#### A. WhatsApp Travel Guide Format
* **Header**: `Cedarcare Specialist Clinic • Arrival & Directions`
* **Body**:
  > *"Hello **{{patient_name}}**, your appointment with Dr. {{doctor_name}} is in 2 hours ({{time_display}} today)!*  
  >  
  > *📍 **Address**: Plot 1042 Aminu Kano Crescent, Wuse 2, Abuja*  
  > *🗺️ **Google Maps Pin**: https://maps.google.com/?q=Cedarcare+Clinic+Abuja*  
  > *🅿️ **Parking**: Free secure on-site parking is available inside the clinic gate.*  
  > *🕒 **Arrival Instruction**: Please arrive 10 minutes early so our nursing team can record your vital signs before your consultation.*  
  >  
  > *📞 Reception Direct Desk: **+234 803 000 1122**. Have a safe trip!"*

#### B. SMS Travel Guide Format
* **Sender ID**: `Cedarcare`
* **Body**:
  > *"Cedarcare Clinic: Your visit with Dr. {{doctor_name}} is in 2 hours ({{time_display}}). Address: Plot 1042 Aminu Kano Cres, Wuse 2, Abuja. Directions: https://clinic.ng/map. Please arrive 10m early. Desk: +2348030001122."*

---

## 5. Edge Cases & Resilience Safeguards

| # | Edge Case Scenario | System & n8n Defense |
| :--- | :--- | :--- |
| **1** | **Patient calls receptionist to cancel or reschedule** | Receptionist simply opens the patient card on the dashboard and updates or reschedules it manually. The system frees the slot immediately. |
| **2** | **Patient is already sitting in the lobby 2 hours before** | The 2-hour cron checks `status != 'arrived'` and `status != 'completed'` before dispatching, avoiding sending directions to a patient who has already arrived. |
| **3** | **Patient's WhatsApp has no mobile data** | The SMS text delivers instantly over the GSM cellular network with the exact same details and receptionist phone line. |
| **4** | **Appointment was cancelled earlier** | The reminder queries only fetch `status == 'confirmed'`. Any cancelled or no-show bookings are completely ignored. |

---

## 6. Clinic Management System Readiness Checklist

When development starts, here are the exact adjustments to be applied to the clinic codebase:
- [ ] **Backend (`views_appointment.py`)**: Ensure `UpcomingRemindersView` includes the clinic's contact phone number (`clinic_phone`) and filters strictly for confirmed appointments.
- [ ] **Backend (`models.py`)**: Verify `ClinicSetting` contains `phone = "+2348030001122"` and address strings.
- [ ] **n8n (`03_reminder_flows.json`)**: Update the workflow to send the exact informative WhatsApp & SMS templates above (Zero phone calls, zero interactive callback buttons).
