# UI/UX Design Direction & Aesthetics Blueprint (`tastecode.dev` Cloned System)

## 1. Visual Philosophy & Design Identity (Cloned from `tastecode.dev`)
The Receptionist Dashboard is built strictly on the **`tastecode.dev` dark minimalist aesthetic**: ultra-refined near-black canvas, hairline borders, soft-rounded charcoal cards, glowing beam accents, and the warm ember/amber gradient spectrum.

- **Theme**: Deep Dark Minimalist (`--bg: #0f0f0f` canvas with `#0b0b0b` depth)
- **Typography**: `Geist`, `Geist Fallback`, system sans with `font-variant-numeric: tabular-nums`
- **Color Palette & Design Tokens**:
  - **Canvas Background**: `var(--bg)`: `#0f0f0f` | Elevated Backdrop: `#0b0b0b`
  - **Card Surfaces**: `#121212` (Cards/Panels), `#141414` (Inner Containers), `#1a1a1a` (Input Prompts)
  - **Hover Surfaces**: `#1b1b1b` / `#222222`
  - **Hairlines & Borders**: `--line`: `#1f1f1f` | `--line-strong`: `#2b2b2b` | `--chrome-border`: `#303030`
  - **Text Hierarchy**: 
    - Primary Text (`--text`): `#ededed` / `#f3f3f3`
    - Secondary Text (`--text-2`): `#a3a3a3`
    - Tertiary / Muted (`--text-3`): `#6f6f6f`
  - **Signature Ember/Amber Accents & Gradients**:
    - Amber: `--amber`: `#ffb547` (Warm highlight / Fresh queue)
    - Ember (Primary Accent): `--ember`: `#ff6b3d` | Text: `--ember-text`: `#ff8a5c`
    - Rose / Urgent: `--rose`: `#ff4f79` | Danger: `--danger`: `#fe8549` / `#ff7a93`
    - **Horizontal Ember Gradient**: `linear-gradient(90deg, #ffb547, #ff6b3d 50%, #ff4f79)`
    - **Vertical Ember Gradient**: `linear-gradient(180deg, #ffb547, #ff6b3d 50%, #ff4f79)`
  - **Status Accents**:
    - Success / Confirmed: `#32c850` / `#10b981` (Emerald)
    - Reviewing / Waiting: `#ffb547` (Amber)
    - Hold / Atomic Lock: `#ff6b3d` (Ember)
    - Expired / Disrupted: `#ff4f79` (Rose)
  - **Beam Glow / Shimmer**: Multi-color subtle spectrum border / bloom (`#ff3264`, `#ff7828`, `#32c850`, `#288cff`, `#b428f0`)
  - **Card Shadows**: `0 30px 80px -30px #000000e6, 0 0 0 1px #ffffff12`
  - **Pill Buttons & Tags**: `border-radius: 999px` with `border: 1px solid #2b2b2b; background: #151515`

---

### 2. Dashboard Layout & Navigation Structure (TasteCode Left Rail + Split-Stage)

```
┌──────────────┬────────────────────────────────┬────────────────────────────────────────────────────────┐
│ 248px RAIL   │ QUEUE PANE (FIFO TRIAGE)       │ ACTIVE REVIEW & DISPATCH STAGE                         │
├──────────────┼────────────────────────────────┼────────────────────────────────────────────────────────┤
│ 🏥 MedPulse  │ 🔍 [Search name/phone...]      │ 👤 AMINA YUSUF (Returning Patient — 2 Past Visits)     │
│              │ Tabs: [📥 New (5)] [⚡ ReQ (2)] │ 📞 +234 801 234 5678  ·  Channel: Telegram Bot         │
│ • Requests   │       [⌛ Exp (1)] [📅 Today]  │ Service: Dental Consultation (30m + 10m buffer)       │
│ • Visits     ├────────────────────────────────┤ Preferred: Oct 12–13  ·  Morning (08:00–12:00)         │
│ • Staff      │ 🟢 [08:15 AM] Amina Yusuf      │ ────────────────────────────────────────────────────── │
│ • Analytics  │    Dental Consultation (30m)   │ 🛡️ [Double-Booking Shield: 0 Conflicts Detected]       │
│ • Settings   │    Dr. Bello · Oct 12 Morning  │                                                        │
│              │    Badge: Fresh (4m ago)       │ CANDIDATE SLOTS (Top 3 Scored — W1..W4 Algorithm):     │
│ ──────────── ├────────────────────────────────┤ ┌────────────────────────────────────────────────────┐ │
│ 👤 Sarah     │ 🟡 [08:02 AM] John Doe         │ │ 1. Mon Oct 12, 10:00 AM (Dr. Bello)  [✏️ Edit/Swap] │ │
│ Morning Shift│    Tooth Extraction (45m)      │ │ 2. Mon Oct 12, 11:30 AM (Dr. Bello)  [✏️ Edit/Swap] │ │
│ [Lock / PIN] │    Badge: Waiting (19m ago)    │ │ 3. Tue Oct 13, 09:00 AM (Dr. Okafor) [✏️ Edit/Swap] │ │
│              ├────────────────────────────────┤ └────────────────────────────────────────────────────┘ │
│              │ 🔴 [07:30 AM] Daniel K.        │ [+ Add Custom Slot]  [💬 Ask Patient]  [❌ Reject]     │
│              │    Badge: Delayed (>45m)       │ [🚀 Approve & Dispatch to Telegram (1h Expiry)]        │
└──────────────┴────────────────────────────────┴────────────────────────────────────────────────────────┘
```

### Key UI Subsystems:
1. **TasteCode Rail (248px Left Navigation)**:
   - Clinic brand mark with subtle amber glow.
   - Core modules with active pill selection (`background: #222222; color: #ededed`).
   - Bottom profile widget: Active receptionist name, current shift (`Morning Shift`), audio chime toggle, and 1-click `[Lock Screen / Switch User]`.
2. **Queue List Pane (Center)**:
   - High-density cards with live aging tags: Green (`Fresh` 0–15m), Amber (`Waiting` 15–30m), Pulsing Red (`Delayed` >30m).
   - Real-time presence indicator (`👀 Sarah is reviewing`).
   - Quick search input (`name`, `phone`, or `request code`).
3. **Active Stage (Right Canvas)**:
   - Patient dossier header with returning patient badge.
   - Proposed candidate slots with front-desk overrides (`[✏️ Edit / Swap]`, `[+ Add Custom Time]`).
   - Prominent green banner: `[🛡️ Double-Booking Shield Active: 0 Conflicts]`.
   - Dispatch action button with the TasteCode Ember gradient: `background: linear-gradient(90deg, #ffb547, #ff6b3d 50%, #ff4f79)`.


---

## 4. Today's Live Visits: 3-Stage Swimlanes Module (taste-skill + Cal.com + TasteCode Synthesis)

```
┌───────────────────────────────────┬───────────────────────────────────┬───────────────────────────────────┐
│ 🏥 WAITING ROOM (ARRIVED: 3)       │ 🩺 IN CONSULTATION (ACTIVE: 2)     │ ✅ COMPLETED TODAY (DONE: 8)      │
├───────────────────────────────────┼───────────────────────────────────┼───────────────────────────────────┤
│ ┌───────────────────────────────┐ │ ┌───────────────────────────────┐ │ ┌───────────────────────────────┐ │
│ │ 👤 TUNDE BAKARE               │ │ │ 👤 AMINA YUSUF                │ │ │ 👤 CHIDI EZE                  │ │
│ │ Service: General Checkup (20m)│ │ │ Service: Dental Consult (30m) │ │ │ Service: Scaling & Polish (30m)│ │
│ │ Doctor: Dr. Okafor (Room 2)   │ │ │ Doctor: Dr. Bello (Dental 1)  │ │ │ Doctor: Dr. Bello             │ │
│ │ Arrived: 10:14 AM             │ │ │ Started: 10:02 AM             │ │ │ Completed: 09:45 AM           │ │
│ │ ⏱️ Waiting: 14 mins (Normal)  │ │ │ ⏱️ In Room: 26m / 30m target  │ │ │ 📅 Recall: 6 Mos Hygiene Check│ │
│ │ ───────────────────────────── │ │ │ ───────────────────────────── │ │ │ ───────────────────────────── │ │
│ │ [🩺 Send into Consultation]   │ │ │ [✅ Complete Consultation]    │ │ │ [📁 View Patient Dossier]     │ │
│ └───────────────────────────────┘ │ └───────────────────────────────┘ │ └───────────────────────────────┘ │
│ ┌───────────────────────────────┐ │ ┌───────────────────────────────┐ │ ⚠️ NO-SHOW / CANCELLED (2)         │
│ │ 👤 FATIMA BELLO               │ │ │ 👤 KOLAWOLE ADEYEMI           │ │ ┌───────────────────────────────┐ │
│ │ Service: Scaling & Polish(30m)│ │ │ Service: Eye Examination (20m)│ │ │ 👤 EMMANUEL OKON              │ │
│ │ Doctor: Dr. Bello (Dental 1)  │ │ │ Doctor: Dr. Okafor (Room 2)   │ │ │ Slot: 09:00 AM (Unarrived)    │ │
│ │ Arrived: 10:22 AM             │ │ │ Started: 10:10 AM             │ │ │ [💌 Send Friendly Welfare Msg]│ │
│ │ ⏱️ Waiting: 6 mins (Normal)   │ │ │ ⏱️ In Room: 18m / 20m target  │ │ └───────────────────────────────┘ │
│ │ ───────────────────────────── │ │ │ ───────────────────────────── │                                     │
│ │ [🩺 Send into Consultation]   │ │ │ [✅ Complete Consultation]    │                                     │
│ └───────────────────────────────┘ │ └───────────────────────────────┘ │                                     │
└───────────────────────────────────┴───────────────────────────────────┴───────────────────────────────────┘
```

### Visual & Behavioral Specifications (Governed by `taste-skill` & `awesome-design-md`):
1. **Surface Hierarchy (`tastecode.dev` + `Linear`)**:
   - Column Container: Background `#121212`, hairline border `1px solid #1f1f1f`, rounded `14px`.
   - Visit Cards: Background `#161616`, border `1px solid #2b2b2b`, box-shadow `0 8px 24px -12px #000000a0`.
   - Hover state: Border turns `#3d3d3d`, subtle card lift (`transform: translateY(-1px)`).
2. **Real-Time Duration Counters (`font-variant-numeric: tabular-nums`)**:
   - Waiting Room Counter: Live timer increments every second (`⏱️ Waiting: 14:22`). Turns amber at 20m, rose at 35m.
   - Active Consultation Counter: Progress ring/bar shows elapsed vs booked service duration.
3. **1-Click Speed Controls (Sub-second State Transitions)**:
   - `[🩺 Send into Consultation]`: Atomic PATCH to backend $\rightarrow$ card animates into Column 2, starts consultation timer, updates doctor room availability badge.
   - `[✅ Complete Consultation]`: Opens the Doctor-Directed Follow-up Recall modal $\rightarrow$ moves card to Column 3 upon save.
   - `[💌 Send Friendly Welfare Message]`: Dispatches empathetic recovery message to no-show patients.

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

---

## 9. Patient Inbound Web Widget & Client Pitch Simulator (`taste-skill` Multi-Step)

```
┌────────────────────────────────────────────────────────────────────────┐
│ 🏥 CEDARCARE SPECIALIST CLINIC — APPOINTMENT REQUEST                   │
│ Step [ 1. Service ] ──► [ 2. Preferred Dates ] ──► [ 3. Contact Info ] │
├────────────────────────────────────────────────────────────────────────┤
│ STEP 1: SELECT TREATMENT & SPECIALIST                                  │
│ ┌───────────────────────────────────┐ ┌──────────────────────────────┐ │
│ │ 🦷 Dental Consultation            │ │ 🩺 General Health Check-up   │ │
│ │ Duration: 30 mins · Fee: ₦15,000  │ │ Duration: 20 mins · Fee: ₦10k│ │
│ │ Doctor: Dr. Bello (Specialist)    │ │ Doctor: Dr. Okafor (GP)      │ │
│ └───────────────────────────────────┘ └──────────────────────────────┘ │
│                                                                        │
│ STEP 2: PREFERRED 2-WEEK WINDOW & TIME OF DAY                          │
│ Calendar Range: [ 12 Oct 2026 ] ──► [ 24 Oct 2026 ] (Next 14 Days)     │
│ Preferred Window: [ ☀️ Morning (8-12) ]  [ 🌤️ Afternoon (12-4) ]       │
│                                                                        │
│ STEP 3: PATIENT CONTACT & SYMPTOM NOTES                                │
│ Full Name: [ Amina Yusuf                      ]                        │
│ WhatsApp / Phone: [ +234 801 234 5678         ] (E.164 normalized)    │
│ Symptoms / Notes: [ Routine dental cleaning & mild sensitivity       ] │
│                                                                        │
│ [ 🚀 Submit Request to Reception Desk ] (Instant FIFO Queue Injection) │
│ Notice: "Front desk will calculate eligible slots and send options."  │
└────────────────────────────────────────────────────────────────────────┘
```

### Client Pitch Simulator (Split-Screen Mode):
- **Live Sales Demonstration**: When pitching to doctors/clinic owners, the frontend offers a toggleable split-screen mode:
  - **Left Window**: Mobile frame running the Patient Intake Widget or Telegram Bot emulator.
  - **Right Window**: Real-time Receptionist Dashboard.
- **Demonstration Flow**: The client types a booking on the phone widget $\rightarrow$ hits submit $\rightarrow$ within 300ms, the Receptionist Hub on the right plays the audio chime, displays the green aging badge, calculates 3 non-overlapping candidate slots, and proves the **100% human-in-the-loop gatekeeping** value proposition live.

---

## 10. Front-Desk Security & Quick-PIN Inactivity Lock Overlay

```
┌────────────────────────────────────────────────────────────────────────┐
│ [ FROSTED BACKGROUND: backdrop-filter: blur(18px) obscuring patients ]  │
│                                                                        │
│                      ┌───────────────────────────┐                     │
│                      │ 🔒 WORKSTATION LOCKED     │                     │
│                      │                           │                     │
│                      │    [👤 Sarah (Morning)]   │                     │
│                      │                           │                     │
│                      │ Enter 4-Digit Quick PIN:  │                     │
│                      │     ●   ●   ○   ○         │                     │
│                      │                           │                     │
│                      │    [ 1 ]  [ 2 ]  [ 3 ]     │                     │
│                      │    [ 4 ]  [ 5 ]  [ 6 ]     │                     │
│                      │    [ 7 ]  [ 8 ]  [ 9 ]     │                     │
│                      │    [ C ]  [ 0 ]  [ ⌫ ]     │                     │
│                      │                           │                     │
│                      │  [ 🔄 Switch User / Exit ]│                     │
│                      └───────────────────────────┘                     │
└────────────────────────────────────────────────────────────────────────┘
```

### Specifications:
1. **Confidentiality Shield**: 20 minutes of mouse/keyboard inactivity triggers a full-screen privacy shield with `backdrop-filter: blur(18px)` and `background: rgba(11, 11, 11, 0.85)` to prevent walk-in visitors or cleaning staff from reading patient medical details.
2. **Instant Numeric Unlock**: Supports both physical keyboard typing (`0-9`) and on-screen clicks. Submitting the 4th digit automatically posts to `/api/v1/auth/pin-unlock/` without needing an "Enter" click.
3. **Security Throttling**: 3 consecutive failed PIN attempts triggers a 60-second cooldown timer, disables the numpad, and logs a `security.pin_failure` event to `AuditLog`.
4. **Shift Switch**: Receptionists arriving for their afternoon shift can click `[Switch User / Exit]`, gracefully invalidating the local token and presenting the master email/password login.

---

## 11. Candidate Slot Editing, Doctor Swapping & Custom Overrides

```
┌────────────────────────────────────────────────────────────────────────┐
│ CANDIDATE SLOTS (Top 3 Algorithmic Matches — Editable by Receptionist) │
├────────────────────────────────────────────────────────────────────────┤
│ Slot 1: Mon Oct 12, 10:00 AM – 10:30 AM (Dr. Bello)   [✏️ Edit / Swap] │
│ └─► [ Expanded Swap Drawer ]                                           │
│     Doctor: [ Dr. Bello (Dentist) ▼ ] (Shows: Dr. Okafor also free)   │
│     Time:   [ 10:00 AM ] [ 10:15 AM ] [ 10:30 AM ] [ 10:45 AM ]       │
│     Shield: [ 🟢 Conflict-Free · 10m sanitization buffer preserved ]  │
│                                                                        │
│ Slot 2: Mon Oct 12, 11:30 AM – 12:00 PM (Dr. Bello)   [✏️ Edit / Swap] │
│ Slot 3: Tue Oct 13, 09:00 AM – 09:30 AM (Dr. Okafor)  [✏️ Edit / Swap] │
│                                                                        │
│ ┌────────────────────────────────────────────────────────────────────┐ │
│ │ [+ Add Custom Slot] ──► Opens fast datetime picker                 │ │
│ │ Live Conflict Validator: Checks doctor shifts, breaks, holds.      │ │
│ └────────────────────────────────────────────────────────────────────┘ │
│                                                                        │
│ [🛡️ Double-Booking Shield Active: 0 Collisions Detected]               │
│ [ 🚀 Approve & Dispatch to Telegram (1h Countdown Window Starts) ]    │
└────────────────────────────────────────────────────────────────────────┘
```

### Specifications:
1. **1-Click Doctor Swapping**: Clicking `[✏️ Edit / Swap]` displays only doctors who are qualified for the selected treatment and on active duty that day.
2. **15-Minute Granular Time Scrubber**: Receptionists can nudge slots forward or backward in 15-minute increments with instant visual validation.
3. **Live Collision Shield**: Any overlapping appointment, active temporary hold, or doctor break immediately triggers an amber warning: `[⚠️ Dr. Bello is in lunch break 12:00–13:00]`, preventing accidental collision before dispatch.
4. **Custom Slot Addition**: Receptionists can add a 4th slot or replace a suggestion with an arbitrary date/time, automatically verifying that the required service buffer (e.g. +10m sanitization) is preserved.

---

## 12. Slide-Over Patient Dossier Drawer (`[📁 Patient Dossier]`)

```
┌────────────────────────────────────────────────────────────────────────┐
│ 👤 PATIENT DOSSIER: AMINA YUSUF                     [ ✕ Close Drawer ] │
│ 📞 +234 801 234 5678  ·  Channel: Telegram Bot  ·  Patient ID: P-8821  │
├────────────────────────────────────────────────────────────────────────┤
│ ATTENDANCE RELIABILITY SCORE:                                          │
│ [ 🟢 100% RELIABLE PATIENT ]  ·  5 Total Visits (5 Attended, 0 No-Show)│
│                                                                        │
│ ────────────────────────────────────────────────────────────────────── │
│ ACTIVE CLINICAL RECALLS & FOLLOW-UPS:                                  │
│ • 🦷 6-Month Routine Hygiene Checkup                                  │
│   Target Date: 15 Nov 2026 (Due in 4 weeks) · Dr. Bello               │
│   Status: Automated reminder scheduled                                │
│                                                                        │
│ ────────────────────────────────────────────────────────────────────── │
│ PAST VISIT HISTORY (REVERSE-CHRONOLOGICAL TIMELINE):                   │
│ 1. 📅 14 Apr 2026 — Scaling & Polishing (30m) with Dr. Bello           │
│    Notes: Mild gingival sensitivity noted on lower left molars.        │
│ 2. 📅 08 Oct 2025 — Initial Dental Consultation with Dr. Bello         │
│    Notes: X-rays taken. Advised biannual cleanings.                   │
│                                                                        │
│ ────────────────────────────────────────────────────────────────────── │
│ FRONT-DESK ADMINISTRATIVE NOTES (RECEPTIONIST-ONLY):                   │
│ [ Prefers morning slots between 10am-12pm. Always punctual.          ] │
│ [ 💾 Save Internal Note ]                                              │
└────────────────────────────────────────────────────────────────────────┘
```

### Specifications:
1. **Zero Context Loss**: The drawer slides in from the right edge with a smooth ease-out animation (`width: 440px`), allowing the receptionist to inspect past visits and reliability without leaving their active queue triage.
2. **Attendance Metric Calculation**: Automatically computes the patient's attendance percentage:
   $$\text{Reliability} = \frac{\text{Attended Visits}}{\text{Total Booked Visits}} \times 100$$
   Displays a confidence badge: `🟢 100% Reliable`, `🟡 1 Past Reschedule`, or `🔴 Caution: 2 Past No-Shows`.
3. **Internal Administrative Notes Box**: Front-desk staff can record operational preferences (e.g., patient mobility assistance, preferred language) without mixing into clinical medical diagnostics.

---

## 13. Visual Clinic Settings & White-Label Agency Exporter (`[⚙️ Settings]`)

```
┌────────────────────────────────────────────────────────────────────────┐
│ ⚙️ CLINIC SETTINGS & WHITE-LABEL CONFIGURATION                         │
│ [ 🏢 Profile & Bot ]  [ ⏰ Hours & Shifts ]  [ 📏 Scheduling Rules ]  [ 🔔 Reminders ] │
├────────────────────────────────────────────────────────────────────────┤
│ TAB 1: CLINIC PROFILE & BOT TOKENS                                     │
│ Clinic Name:     [ Cedarcare Specialist Clinic                       ] │
│ Physical Address:[ Plot 142 Aminu Kano Crescent, Wuse 2, Abuja       ] │
│ Phone (Support): [ +234 901 234 5678                                 ] │
│ Telegram Bot:    [ @CedarcareClinicBot                               ] │
│ Telegram Token:  [ 738291048:AAH3k...                                ] │
│ WhatsApp Phone:  [ +234 901 234 5678 (Cloud API Phone Number ID)     ] │
│                                                                        │
│ ────────────────────────────────────────────────────────────────────── │
│ TAB 2: OPERATING HOURS & CLINIC BREAKS                                 │
│ Working Days:    [✓] Mon  [✓] Tue  [✓] Wed  [✓] Thu  [✓] Fri  [✓] Sat  │
│ Clinic Opening:  [ 08:00 AM ]          Clinic Closing: [ 06:00 PM ]   │
│ Lunch Break:     [ 01:00 PM ] ──► [ 02:00 PM ] (Clinic-wide buffer)    │
│                                                                        │
│ ────────────────────────────────────────────────────────────────────── │
│ TAB 3: SCHEDULING RULES & EXCLUSION THRESHOLDS                         │
│ Offer Expiration Window:    [ 60 ] minutes (Time patient has to pick) │
│ Temporary Hold Expiration:  [ 15 ] minutes (Atomic lock countdown)    │
│ Sanitization Buffer:        [ 10 ] minutes (Appended after each visit)│
│ Emergency Floating Reserve: [  1 ] slot per shift shielded for walk-ins│
│                                                                        │
│ ────────────────────────────────────────────────────────────────────── │
│ TAB 4: AUTOMATED REMINDERS & NOTIFICATIONS                             │
│ [✓] Enable 24-Hour Interactive Pre-Visit Reminder (Telegram/WhatsApp) │
│ [✓] Enable 2-Hour Urgent Arrival Nudge                                │
│ [✓] Enable End-of-Day No-Show Welfare Message                          │
│                                                                        │
│ [ 💾 Save Settings Changes ]                                           │
│ [ 📦 Export White-Label Agency Template (client-config.json) ]         │
└────────────────────────────────────────────────────────────────────────┘
```

### Specifications:
1. **Zero-Code Clinic Re-branding**: A clinic manager or agency owner can rebrand the entire system—logo, name, phone numbers, shift times, and bot tokens—purely through this visual interface in under 15 minutes.
2. **1-Click Agency JSON Exporter**: Clicking `[📦 Export White-Label Agency Template]` generates and downloads a clean `client-config.json`. When setting up a new clinic client, running `python manage.py seed_clinic --config client-config.json` immediately configures the entire database, doctors, services, and bot settings automatically.
3. **Validation & Protection**: Built-in sanity checks prevent opening times after closing times or setting offer expirations shorter than 15 minutes.

---

## 14. Web Audio Two-Tone Chime & Multi-Desk Presence System

```
┌────────────────────────────────────────────────────────────────────────┐
│ TOP NOTIFICATION BANNER (FLOAT TOP-RIGHT):                             │
│ ┌────────────────────────────────────────────────────────────────────┐ │
│ │ 🔔 New Patient Inbound: Amina Yusuf · Dental Consultation (30m)    │ │
│ │    [ ılılılılılılıl ] (Animated Soundwave Accent)            [ ✕ ] │ │
│ └────────────────────────────────────────────────────────────────────┘ │
│                                                                        │
│ QUEUE PRESENCE SHIELD (PREVENTING RECEPTIONIST COLLISION):             │
│ ┌────────────────────────────────────────────────────────────────────┐ │
│ │ Amina Yusuf (Telegram)       [ 👀 Sarah is reviewing ] (Pulsing)   │ │
│ │ Status: In Triage            (Mary's screen shows locked dispatch) │ │
│ └────────────────────────────────────────────────────────────────────┘ │
│                                                                        │
│ LEFT RAIL CHIME CONTROLS:                                              │
│ [ 👤 Sarah (Morning Shift) ]                                           │
│ [ 🔔 Sound Chimes: ON ] ──► 1-Click Mute Toggle (Two-Tone Audio Synth) │
└────────────────────────────────────────────────────────────────────────┘
```

### Specifications:
1. **Web Audio API Synthesis**: Zero external `.mp3` audio files required. Uses browser native Web Audio API oscillators:
   - Primary Inbound Chime: Crisp two-tone chime (520Hz $\rightarrow$ 659Hz, 0.4s fade-out, pleasant non-intrusive hospital bell tone).
   - Priority Re-Request Alert: Ascending three-tone chime (587Hz $\rightarrow$ 740Hz $\rightarrow$ 880Hz).
2. **Audio Preference Persistence**: The `[🔔 Sound Chimes: ON / MUTED]` toggle in the bottom left rail persists in browser `localStorage`, remembering each receptionist's audio preference.
3. **SSE Presence Broadcasting**:
   - When Receptionist Sarah clicks a patient card, frontend emits `request.reviewing` over SSE.
   - All other receptionists' screens immediately display the glowing amber pill badge: `[👀 Sarah is reviewing]`.
   - The `[Approve & Dispatch Options]` button is disabled on Mary's screen with tooltip: *"Currently being reviewed by Sarah"*, eliminating duplicate dispatches or patient double-messaging.

---

## 15. Frontend State Management & Dual-Mode API Client (`apiService.js`)

```
┌────────────────────────────────────────────────────────────────────────┐
│ REACT PRESENTATIONAL COMPONENT TREE (Zero direct fetch() in JSX)       │
│   ├── RequestsQueueView.jsx                                            │
│   ├── ActiveReviewStage.jsx                                            │
│   ├── LiveVisitsSwimlanes.jsx                                          │
│   └── ClinicSettingsBento.jsx                                          │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ consumes clean reactive state
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ MODULAR CUSTOM REACT HOOKS                                             │
│   • useBookingRequests(): Queue state, filtering, candidate slots check│
│   • useLiveVisits(): Today's 3 swimlanes, waiting counters, statuses   │
│   • useStaffDirectory(): Doctor/staff roster, localStorage duty tags   │
│   • useClinicSettings(): Operating hours, buffers, white-label config  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ calls unified API client
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ UNIFIED DUAL-MODE API CLIENT (`apiService.js`)                         │
│                                                                        │
│   const USE_LIVE_BACKEND = true; // 1-Click Toggle                     │
│                                                                        │
│   ├── [Mode 1: LIVE DJANGO REST API]                                   │
│   │     • Endpoint: http://localhost:8000/api/v1/                      │
│   │     • Sends Bearer JWT tokens in Authorization headers             │
│   │     • Handles 401 Unauthorized by triggering Quick-PIN Lock        │
│   │                                                                    │
│   └── [Mode 2: STANDALONE MOCK DEMO STORAGE]                           │
│         • Reads/writes to memory + localStorage                        │
│         • Allows instant offline pitching to clinic clients            │
│         • Zero dependencies on local database for frontend design      │
└────────────────────────────────────────────────────────────────────────┘
```

### Specifications:
1. **Clean Separation of Concerns**: UI components are 100% focused on presentation and micro-interactions. All networking, error handling, optimistic updates, and caching logic live inside custom hooks and Zustand stores.
2. **1-Click Pitch Toggle**: When demonstrating to clinic clients at their office without guaranteed Wi-Fi, the agency salesperson can toggle `USE_LIVE_BACKEND = false`. The frontend functions identically with pre-seeded realistic clinic records in `mockData.js`.
3. **Session Interceptor**: If the backend returns a `401 Unauthorized` (e.g. receptionist token expired or account deactivated by admin), the API interceptor immediately triggers the Quick-PIN privacy overlay or ejects to the login screen.

---

## 16. Frontend Architectural Decisions & Governance Matrix (Signed Off via Grill-Me)

The following 10 architectural decisions have been comprehensively interviewed, evaluated, and officially locked into the system blueprint:

| Area | Decision & Technical Specification | Rationale & Behavioral Impact |
| :--- | :--- | :--- |
| **1. Navigation & Routing** | **React Router with URL paths** (`/queue`, `/live-visits`, `/admin/settings`, `/admin/staff`, `/simulator`) with role-based route guards. | Direct browser bookmarking, deep-linking, page reload persistence, and clean separation between receptionist and clinic admin spaces. |
| **2. State Management** | **Lightweight Zustand Stores** (`useQueueStore`, `useVisitsStore`, `useSettingsStore`, `useAuthStore`). | Absolute physical decoupling of state/logic from JSX views, zero boilerplate, no context re-render cascades, and seamless integration with incoming SSE event streams. |
| **3. Dual-Mode Switcher** | **Visual bottom-rail pill toggle** (`[● Live API / Demo Mode]`) with `localStorage` persistence. | Agency salespeople can toggle between the live Django production backend and offline pre-seeded clinic pitch data instantly with 1 click. |
| **4. Real-Time Streaming** | **Auto-reconnecting SSE with 10-second polling fallback** + simulated instant events in Demo Mode. | Front-desk staff never miss inbound requests or desk presence updates during network fluctuations or restrictive proxy firewalls. |
| **5. Workstation PIN Lock** | **20-min auto-lock + manual `[Lock Desk]` button + 60s cooldown on 3 failed attempts** + adjustable timeout in Settings. | Protects patient confidentiality under HIPAA/GDPR while allowing flexibility during sales demonstrations. |
| **6. Responsive Layout** | **Adaptive 2-stage layout**: Collapsible 64px icon rail on tablets; selecting a triage card smoothly transitions to full-width review with a back button. | Eliminates horizontal scrollbar slop and element clipping on iPad/tablet counter setups. |
| **7. Web Audio Chimes** | **Polite 'Enable Audio Chimes' prompt** on first user interaction + persistent mute toggle + visual soundwave banner as silent fallback. | Conforms with browser native Autoplay policies while guaranteeing front-desk alerting. |
| **8. Follow-Up Workflow** | **Optional recall modal with preset chips** (1-Wk Post-Op, 2-Wks Review, 6-Mos Routine) + date picker and 'Skip & Complete' button. | Minimizes front-desk friction while ensuring doctor-directed recalls are systematically captured. |
| **9. Pitch Simulator** | **Dual-channel phone toggle** (`[🌐 Web Form] / [💬 Telegram Bot Chat]`) on the simulated phone frame. | Allows live demonstrations of both clinical website intake and WhatsApp/Telegram conversational booking in <300ms. |
| **10. In-App Toasts** | **Floating top-right TasteSkill toast notifications** with hairline dark borders, emerald/amber accent icons, and 4-second auto-dismiss. | Non-intrusive confirmation feedback for dispatches, status changes, and settings updates. |








