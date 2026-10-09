# UI/UX Design Direction & Aesthetics Blueprint

## 1. Visual Philosophy & Design Identity
The Receptionist Dashboard must feel **clinical, modern, ultra-responsive, and effortless**.
Receptionists handle high-stress, fast-paced workflows; every action must be actionable in under 2 clicks.

- **Theme**: Clean Medical Slate (Modern light theme with subtle dark glass accents).
- **Typography**: Google Fonts `Inter` (Body/Data tables) and `Outfit` (Headings/Brand).
- **Color Palette**:
  - **Primary Brand**: `#0E7490` (Teal 700 — trust, medical authority)
  - **Primary Accent**: `#06B6D4` (Cyan 500 — active highlights)
  - **Success / Confirmed**: `#10B981` (Emerald 500)
  - **Pending Review / Hold**: `#F59E0B` (Amber 500)
  - **Expired / Danger**: `#EF4444` (Rose 500)
  - **Neutral Surfaces**: `#F8FAFC` (Slate 50), `#FFFFFF` (Card surface), `#0F172A` (Slate 900 text)

---

## 2. Dashboard Layout & Navigation Structure

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 🏥 MedPulse Reception Hub              [Shift: Morning | Receptionist: Sarah] [🔔 3]   │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ NAVIGATION: [📥 Requests Queue]  [📅 Live Visits]  [👥 Staff & Attendance]  [📊 Analytics]  [⚙️ Settings] │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ QUEUE TABS: [📥 New Requests (5)]  [⚡ Re-Requested (2)]  [⌛ Expired (1)]  [📅 Today's Schedule] │
├──────────────────────────────┬─────────────────────────────────────────────────────────┤
│ QUEUE VIEW (FIFO ORDERED)    │ APPOINTMENT DETAILS / ACTION MODAL                      │
│ ┌──────────────────────────┐ │ Patient: Amina Yusuf (+234 801 234 5678)                │
│ │ #1 Amina Yusuf (Telegram)│ │ Service: Dental Consultation (30m)                      │
│ │ Requested: 08:15 AM      │ │ Requested Doctor: Any Dentist                           │
│ │ Status: Awaiting Review  │ │ Preferred Dates: Oct 12, Oct 13 (Morning)               │
│ ├──────────────────────────┤ │                                                         │
│ │ #2 John Doe (Web Form)   │ │ [⚡ Check Live Slots]  [💬 Ask for Info]  [❌ Reject]     │
│ │ Requested: 08:22 AM      │ │                                                         │
│ └──────────────────────────┘ │ ┌─────────────────────────────────────────────────────┐ │
│                              │ │ PROPOSED CANDIDATE SLOTS (Editable by Front Desk):  │ │
│                              │ │ 1. Mon Oct 12, 10:00 AM (Dr. Bello)  [✏️ Edit / Swap]│ │
│                              │ │ 2. Mon Oct 12, 11:30 AM (Dr. Bello)  [✏️ Edit / Swap]│ │
│                              │ │ 3. Tue Oct 13, 09:00 AM (Dr. Okafor) [✏️ Edit / Swap]│ │
│                              │ │                                                     │ │
│                              │ │ [+ Add Custom Time Slot]                            │ │
│                              │ │ [🚀 Approve & Dispatch to Telegram (1h Expiry)]     │ │
│                              │ └─────────────────────────────────────────────────────┘ │
└──────────────────────────────┴─────────────────────────────────────────────────────────┘
```

---

---

## 4. Live Visit Status Workflow & Speed Controls
Receptionists manage active clinic flow with 1-click status transitions:
- `[➡️ Mark Arrived]`: Moves patient to the clinic waiting room queue.
- `[🩺 In Consultation]`: Doctor begins the session.
- `[✅ Completed]`: Consultation concludes $\rightarrow$ triggers Follow-Up prompt modal.
- `[⚠️ No-Show]`: Flagged if patient never arrived; triggers automated welfare message.

---

## 5. Visual Badges & Audio Chimes
- **Audio Chime**: Subtle, pleasant sound plays whenever a new booking request or high-priority `[⚡ Re-Requested]` card lands in the queue.
- **Pulsing Countdown Badges**:
  - `⏳ 54:12` (Blue) for active 1-hour slot offers.
  - `⚠️ 12:45` (Amber) for active temporary deposit holds.
  - `🚨 Expired` (Rose) for expired requests.

---

## 6. Doctor-Directed Follow-Up Prompt Modal
Upon clicking `[Completed]`, a modal smoothly appears:
- Toggle: `[ ] Follow-up appointment required`
- If enabled:
  - Date Picker (e.g. *2 weeks ahead: Oct 22, 2026*)
  - Follow-up notes (e.g. *"Check healing of extraction socket"*)
  - Responsible Doctor selection
- System automatically queues the administrative follow-up reminder without exposing medical diagnoses.

---

## 7. Staff Directory & Attendance View (`[👥 Staff & Attendance]`)
A dedicated operational roster for the front desk and clinic manager:
- **Active Staff Grid**: Cards showing each Doctor and Receptionist.
  - Avatar, Name, Role/Specialty, Shift Hours (`08:00 - 16:00`), Active Working Days (`Mon-Fri`).
  - **Live Duty Status**: `🟢 On Duty` | `🟡 On Break` | `🔴 On Leave / Off`.
  - **Today's Attendance Metrics**: Number of patients seen today, appointments remaining, and punctuality logs.
  - **Admin Action Buttons**: `[Edit Shift]`, `[1-Click Sick Leave Toggle]`, `[Deactivate Staff]`.

---

## 8. Clinic Analytics & Performance Reports (`[📊 Analytics]`)
High-level overview tailored for clinic owners and managers:
- **KPI Summary Cards**:
  - Total Appointments (Week / Month) with trend indicators (+12%).
  - **Patient Attendance Rate**: (e.g. 91% Attended, 6% Rescheduled, 3% No-Show).
  - **Front Desk Speed**: Average time from request receipt to slot dispatch (e.g. 3.4 mins).
  - Busiest Service (*Dental Scaling & Polishing*) & Top Doctor (*Dr. Bello*).
- **Export Controls**: 1-Click `[📥 Export Appointments to CSV]` and `[📥 Export Attendance to CSV]`.
