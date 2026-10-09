# Content Guide & Messaging Templates (Telegram Bot & WhatsApp)

## 1. Compliance & Interactive Button Guidelines
The primary messaging gateway uses the **Telegram Bot API** (providing instant `@BotFather` setup, zero Meta verification delays, and rich **Inline Keyboard Buttons**). All templates maintain 1-to-1 parity so a clinic can toggle to WhatsApp Cloud API later if desired.

---

## 2. Standardized Message Templates

### Template 0: Inbound Messaging Entry Trigger
When a patient sends `/start` or any text to the clinic bot:
```
👋 *Welcome to [Clinic Name]*

We are glad to help you book an appointment with our medical team. 

Please tap below to select your service, doctor, and preferred dates:

👉 [📋 Book Appointment Now (Web Form)]
```

---

### Template 1: Slot Options Offered (Interactive Inline Keyboard)
```
🏥 *[Clinic Name]* — Appointment Options

Hello {{patient_name}}, your request for *{{service_name}}* has been reviewed by our reception team.

Please select your preferred time below (Held for 1 hour):
1️⃣ {{slot_1_formatted}} ({{doctor_name_1}})
2️⃣ {{slot_2_formatted}} ({{doctor_name_2}})
3️⃣ {{slot_3_formatted}} ({{doctor_name_3}})

[ 1️⃣ {{slot_1_time}} ]  [ 2️⃣ {{slot_2_time}} ]  [ 3️⃣ {{slot_3_time}} ]
```

---

### Template 1B: Alternative Slot Options Offered (Requested Dates Full)
```
🏥 *[Clinic Name]* — Schedule Update

Hello {{patient_name}}, your requested date range was fully booked, but our front desk found the closest available slots for *{{service_name}}*:

1️⃣ {{slot_1_formatted}} ({{doctor_name_1}})
2️⃣ {{slot_2_formatted}} ({{doctor_name_2}})
3️⃣ {{slot_3_formatted}} ({{doctor_name_3}})

These options are held for 1 hour. Tap below to reserve:
[Select Alternative Time]
```

---

### Template 2: Pre-Expiry Friendly Nudge (Minute 45)
```
⏰ *[Clinic Name]* — Slot Reservation Notice

Hello {{patient_name}}, quick reminder that your appointment options for *{{service_name}}* will expire in *15 minutes*.

Reply *1*, *2*, or *3* to secure your slot before it is released to other patients.
```

---

### Template 3B: Deposit Required Temporary Hold Notice
When a service requires an upfront deposit (e.g. specialized surgical procedures):
```
💳 *[Clinic Name]* — Slot Reserved (Awaiting Deposit)

Hello {{patient_name}}, your appointment with *{{doctor_name}}* for *{{service_name}}* on *{{appointment_datetime}}* is currently *HELD for 15 minutes*.

To finalize your booking, please complete the consultation deposit of ₦{{deposit_amount}}:
👉 Pay securely: {{payment_link}}
_Or transfer to: [Bank Name] | Acct: 1234567890_

Once payment is verified, your booking confirmation and reference number will be sent immediately.
```

---

### Template 3C: Race Condition / Slot Contention Fallback
When two patients attempt to claim the same slot simultaneously:
```
⚡ *[Clinic Name]* — Slot Update

Hello {{patient_name}}, that exact time slot was just secured by another patient a moment ago!

Don't worry, here are the next best alternative times for {{service_name}} with {{doctor_name}}:
1️⃣ {{alternative_slot_1}}
2️⃣ {{alternative_slot_2}}

Tap below to secure your choice:
[Choose Alternative Time]
```

---

### Template 4: Outside Operating Hours Acknowledgment
```
🌙 *[Clinic Name]* — Front Desk Closed

Hello {{patient_name}}, thank you for contacting us! Our reception desk is currently closed for the evening.

We have placed your booking request at the top of our queue. Our morning receptionist will review your request first thing at 8:00 AM and send your 1-hour appointment options.
```

---

### Template 5: Receptionist Quick Prompts (`[Ask for Info]`)
When the receptionist needs more details, they can pick from pre-written templates or write a custom message:
- **Service Clarification**: *"Hello {{patient_name}}, front desk here! Could you please let us know what specific dental service you require (e.g. Scaling & Polishing, Extraction, Check-up) so we can allocate the right doctor?"*
- **Doctor Preference**: *"Hello {{patient_name}}, do you have a specific doctor in mind, or should we offer slots with the earliest available specialist?"*
- **Urgency / Symptoms Check**: *"Hello {{patient_name}}, are you experiencing severe pain, swelling, or fever? Please let us know so we can prioritize your consultation."*

---

### Template 6: Doctor Leave / Colleague Reassignment Notice
```
⚠️ *[Clinic Name]* — Important Doctor Update

Hello {{patient_name}}, Dr. {{original_doctor_name}} is unexpectedly unavailable today due to emergency leave.

To ensure you receive timely care, your appointment has been reassigned to our specialist *{{new_doctor_name}}* at the *same scheduled time* ({{appointment_time}}).

Please let us know:
[Keep Appointment with Dr. {{new_doctor_name}}]   [Reschedule to Another Day]
```

---

### Template 7: Final Appointment Confirmation
```
✅ *Appointment Confirmed*

• *Clinic:* {{clinic_name}}
• *Service:* {{service_name}}
• *Doctor:* {{doctor_name}}
• *Date & Time:* {{appointment_datetime}}
• *Location:* {{clinic_address}}
• *Reference ID:* *{{appointment_code}}*

*Arrival instructions:* Please arrive 10 minutes early with your ID.

Manage your booking:
[Confirm]   [Reschedule]   [Cancel]
```

---

### Template 7: 24-Hour Pre-Visit Reminder
```
🔔 *Appointment Reminder for Tomorrow*

Hello {{patient_name}}, this is a friendly reminder of your appointment with *{{doctor_name}}* tomorrow at *{{appointment_time}}*.

Address: {{clinic_address}}

Please confirm your attendance:
[I'll Be There]   [Need to Reschedule]   [Cancel]
```
