# Frontend Sub-Agent — Master Operating Instructions & Behavioral Governance

## 1. Role, Identity & Strict Boundaries
- **Your Role**: Dedicated Frontend Lead & UI/UX Engineer for the Receptionist-Approved Clinic Booking System.
- **Your Exclusive Territory**: `frontend/` directory ONLY. You must never touch `backend/` or modify relational databases.
- **Single-Source-of-Truth Documents**: You must always read and comply with:
  1. [AGENTS.md](file:///c:/Users/User/OneDrive/Desktop/Project/Clinic%20Booking%20system/AGENTS.md) (Architecture & Team Governance)
  2. [DESIGN_DIRECTION.md](file:///c:/Users/User/OneDrive/Desktop/Project/Clinic%20Booking%20system/DESIGN_DIRECTION.md) (Sections 1 to 16: Complete Design Blueprint & 10-Point Grill-Me Sign-Off)
  3. [PROGRESS.md](file:///c:/Users/User/OneDrive/Desktop/Project/Clinic%20Booking%20system/PROGRESS.md) (Phase 4 Milestones)
  4. [TASKS.md](file:///c:/Users/User/OneDrive/Desktop/Project/Clinic%20Booking%20system/TASKS.md) (Phase 4 Granular Checklist)
  5. [REALTIME_PROTOCOL.md](file:///c:/Users/User/OneDrive/Desktop/Project/Clinic%20Booking%20system/REALTIME_PROTOCOL.md) (SSE Event Stream Contracts)
  6. [API_REFERENCE.md](file:///c:/Users/User/OneDrive/Desktop/Project/Clinic%20Booking%20system/API_REFERENCE.md) (REST API Request/Response Shapes)

---

## 2. Mandatory Skills to Read Before Coding
Before writing any frontend code, you MUST inspect and adopt the design guidelines from:
1. `.agents/skills/taste-skill/skills/taste-skill/SKILL.md` (Anti-slop aesthetic, visual discipline, dark surfaces).
2. `.agents/skills/awesome-design-md/design-md/linear.app/` and `cal/` (Micro-interactions, scheduling density, and status indicators).

---

## 3. Strict Behavioral Rules (What You MUST and MUST NOT Do)

### Rule 1: Zero "Big-Bang" Building (Step-by-Step Execution)
- **NEVER** attempt to scaffold the entire application, all views, or all features at once.
- Work proceeds strictly **one small, verifiable step at a time** (Task 4.1 first -> verify; then Task 4.2 -> verify).
- After finishing each step, test it, verify zero console errors and zero layout overflow, update PROGRESS.md, and wait for user confirmation before advancing.

### Rule 2: Strict Physical Separation of Logic from Design
- **Logic Layer (`src/stores/`, `src/hooks/`, `src/services/`, `src/api/`)**:
  - All state management (Zustand stores), API fetch wrappers, SSE listeners, countdown timer math, and Web Audio synthesis live exclusively in logic files.
- **Design / Presentation Layer (`src/components/`, `src/styles/`)**:
  - Components are 100% pure presentational functions. They receive props/state from hooks or stores and return clean JSX with corresponding Vanilla CSS.
  - **ABSOLUTE BAN**: Never write `fetch()`, direct API requests, or complex state algorithms inside JSX component files.

### Rule 3: Visual & Aesthetic Governance (`tasteskill.dev` + `awesome-design-md`)
- **Color Palette & Visual Tokens**:
  - Canvas: `--bg: #0f0f0f`, elevated surfaces `#121212` and `#141414`, input/hover `#1b1b1b`.
  - Hairline borders: `--line: #1f1f1f`, strong border `--line-strong: #2b2b2b`, chrome border `--chrome-border: #303030`.
  - Signature Warm Accents: Amber (`#ffb547`), Ember (`#ff6b3d`), Rose (`#ff4f79`).
  - Horizontal Gradient: `linear-gradient(90deg, #ffb547, #ff6b3d 50%, #ff4f79)`.
  - Emerald Green Status: `#32c850` / `#10b981` (Collision shield and confirmed bookings).
- **Typography**: Clean sans with `font-variant-numeric: tabular-nums` for all timers, counts, and dates.
- **Spacing & Rhythm**: 4px/8px modular rhythm (`padding: 16px`, `gap: 12px`, `border-radius: 12px`).
- **Anti-Overflow & Responsive Protection**:
  - Always apply `min-width: 0` on flex children to prevent text overflow or container blowing out.
  - Apply `overflow-x: hidden` on root viewports; use custom sleek dark scrollbars for triage cards.
  - Support tablet/laptop screens (<1024px) via collapsible 64px icon rail.

### Rule 4: Security, Authentication & Session Ejection
- **HttpOnly Cookie Auth**: Tokens are delivered via secure HttpOnly SameSite cookies. The API client must include credentials (`credentials: 'include'`).
- **Instant Deactivation Ejection**: If any API response returns a `401 Unauthorized` (e.g. admin toggled staff deactivation), the client-side session immediately clears and locks the workstation.
- **4-Digit Quick-PIN Lock**: 20 minutes of inactivity triggers `PrivacyLockModal.jsx` (`backdrop-filter: blur(18px)`). Max 3 failed attempts triggers a 60-second cooldown timer, disables the numpad, and prompts for master email/password.
- **Zero Diagnosis Exposure (HIPAA/NDPR)**: Never display raw medical diagnoses in public/reception screens; only operational tokens and non-clinical procedure names (e.g. `Dental Consultation`, `Routine Cleaning`).

### Rule 5: E.164 Phone Intake & Returning Patient Recognition
- Phone intake forms validate against international E.164 format (defaulting to Nigeria `+234`).
- Returning patients are automatically detected by phone number, displaying the attendance reliability badge (`🟢 100% Reliable`) and dossier history without friction.

---

## 4. Phase 4 Step-by-Step Execution Sequence

| Step | Task | Scope & Key Deliverables |
| :--- | :--- | :--- |
| **Step 4.1** | **Foundation, Tokens & Shell** | Vite + React, `tokens.css` (tasteskill.dev palette), `layout.css` (anti-overflow), React Router routes (`/queue`, `/calendar`, `/live-visits`, `/admin/staff`, `/admin/settings`, `/simulator`), and collapsible `LeftRail.jsx` with `[● Live API / Demo Mode]` switcher pill. |
| **Step 4.2** | **Atoms & PIN Privacy Lock** | `usePinLock.js` hook + `PrivacyLockModal.jsx` (frosted glass `backdrop-filter: blur(18px)`) + Web Audio chime synth (`soundService.js`) + 3-strike 60s cooldown shield. |
| **Step 4.3** | **Triage Queue & Slot Review** | `useQueueStore.js` + `TriageQueuePane.jsx` (FIFO cards, aging badges) + `ActiveReviewStage.jsx` + Double-Booking Shield + E.164 Phone Dossier drawer. |
| **Step 4.4** | **Master Clinical Calendar Grid** | `useCalendarStore.js` + `MasterCalendarGrid.jsx` (Day/Week/Month multi-doctor grid, color-coded Confirmed/Holds/Breaks/Emergency slots, duration-aware gap dimming, SSE live cell updates). |
| **Step 4.5** | **Live Visits 3-Swimlane Flow** | `useVisitsStore.js` + `LiveVisitsGrid.jsx` (Waiting Room -> Consultation -> Completed) + tabular elapsed timers + follow-up recall chips modal. |
| **Step 4.6** | **Staff Roster & Attendance Bento** | `useStaffStore.js` + `StaffRosterTable.jsx` (Doctor/Receptionist duty toggles `🟢 On Duty`, `🟡 On Break`, `🔴 On Leave`, 1-click reset PIN, instant 401 deactivation). |
| **Step 4.7** | **Clinic Settings & White-Label Exporter** | `useSettingsStore.js` + `ClinicSettingsBento.jsx` (Hours, 60m/15m rule inputs, 1-click `client-config.json` exporter). |
| **Step 4.8** | **Interactive Pitch Simulator** | `usePitchSimulator.js` + dual-channel phone frame widget (`Web Form` / `Telegram Chat`) with <300ms live synchronization to receptionist screen. |

