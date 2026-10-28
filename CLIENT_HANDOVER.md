# Cedarcare Specialist Clinic — Client Handover & Operational Manual

**Master Agency Handover Document | Version 1.0 (Production-Ready)**  
**Prepared for**: Clinic Administrator & Front-Desk Team  
**Deployment Target**: Production Vercel (Frontend) · Production Railway & Neon PostgreSQL (Backend)

---

## 1. Executive System Summary

Cedarcare Specialist Clinic operates a modern, **Receptionist-Approved Clinic Booking System** designed to eliminate double-booking, protect doctor break times, and provide patients with interactive appointment scheduling across Web and Telegram channels.

### Core Architecture Highlights
- **Strict Human-in-the-Loop Triage**: Inbound patient requests never auto-book uncontrolled times into the calendar. The front desk retains complete authority to review, customize, and dispatch candidate slots.
- **Two-Role Front-Desk Workstation**: Strict Role-Based Access Control (RBAC). Only Front Desk Receptionists and the Practice Manager possess login credentials. Treating doctors exist strictly as clinical scheduling resources without workstation logins.
- **Atomic Concurrency Protection**: High-concurrency `select_for_update` database locking guarantees zero slot double-booking.
- **Multi-Channel Patient Gateway**: Instant intake via Website Form and live Telegram Bot (`@babawo_bot`).

---

## 2. Production Access Links & Portals

| Portal / Channel | Link / Target | Notes |
| :--- | :--- | :--- |
| **Receptionist Workstation** | `https://your-clinic.vercel.app/` | Main operational dashboard for front desk officers |
| **Staff Login Portal** | `https://your-clinic.vercel.app/login` | Secure 2-role sign-in portal with 15m brute-force freeze |
| **Interactive Client Simulator** | `https://your-clinic.vercel.app/simulator` | Split-screen demonstration for pitching or patient testing |
| **Patient Telegram Bot** | [`https://t.me/babawo_bot`](https://t.me/babawo_bot) (`@babawo_bot`) | Verified clinical messaging gateway with inline buttons |
| **Cloud REST API Engine** | `https://your-backend.up.railway.app/api/v1/` | High-performance Django REST Framework API |
| **System Health Probe** | `https://your-backend.up.railway.app/api/v1/health/` | Real-time database & engine status (`HTTP 200 OK`) |

---

## 3. Staff Credentials & Access Matrix

> [!IMPORTANT]
> **Strict Two-Role Separation**: Treating doctors do NOT have workstation logins. Their schedules are managed collaboratively through the front desk and calendar views.

| Role | Name | Email / Login | Default Password | Quick-PIN | Access Level |
| :--- | :--- | :--- | :--- | :---: | :--- |
| **Clinic Administrator** | Dr. Ibrahim Musa | `admin@cedarcare.ng` | `adminpassword123` | `9900` | Full administrative control, staff roster, clinic settings & services |
| **Front Desk Receptionist** | Sarah Aliyu | `receptionist1@cedarcare.ng` | `receptionpassword123` | `1234` | Queue triage, candidate slot dispatch, live visits, walk-in check-in |
| **Front Desk Receptionist** | Chioma Okeke | `receptionist2@cedarcare.ng` | `receptionpassword123` | `5678` | Queue triage, candidate slot dispatch, live visits, walk-in check-in |

### Quick-PIN Screen Lock
- If a front desk terminal is idle, or when the user clicks the padlock icon in the header, the workstation locks immediately into **Privacy Shield Mode**.
- Simply type the 4-digit numeric Quick-PIN (`9900`, `1234`, or `5678`) to unlock in <1 second without retyping your password.
- 3 consecutive incorrect PIN entries trigger a 60-second administrative cooldown lock.

---

## 4. Clinical Roster & Doctor Directory

| Doctor Name | Specialty | Shift Hours | Working Days | Services Covered |
| :--- | :--- | :---: | :---: | :--- |
| **Dr. Babawo** | Consultant Physician & Surgeon | 08:00 – 17:00 | Mon – Fri | Comprehensive General Check-up, Dental Consultation, Tooth Extraction |
| **Dr. Amina Bello** | Senior Dental Surgeon | 08:30 – 16:30 | Mon – Sat | Dental Consultation, Teeth Whitening, Tooth Extraction |
| **Dr. Chinedu Eze** | Consultant Family Physician | 09:00 – 17:00 | Mon – Fri | Comprehensive General Check-up, Routine Extraction |

---

## 5. Standard Operating Procedures (SOP) for Front Desk

### 📋 Workflow 1: Processing an Inbound Request (Queue Triage)
1. Navigate to **Requests Queue** (`/queue`).
2. Incoming inquiries appear in the **New Requests** tab in strict FIFO order with real-time aging badges.
3. Click **Review Request** on any card:
   - The system checks the patient's phone history (`080...` or `+234...`) and flags whether they are a *New Patient* or *Returning Patient*.
   - The Availability Engine calculates 3 conflict-free candidate slots respecting doctor shifts, lunch breaks (13:00–14:00), and sterilizing buffers (10 mins).
4. Review the candidate times. If needed, click to customize or swap any proposed slot.
5. Click **Approve & Dispatch Offers**.
   - Status changes to `slots_offered`.
   - The patient receives interactive buttons on Telegram (`@babawo_bot`).
   - A 60-minute offer countdown begins.

### 🚶 Workflow 2: Admitting a Walk-In Counter Patient
1. Navigate to **Live Visits** (`/live-visits`) or **Doctor Schedule** (`/calendar`).
2. Click the **+ Walk-In Patient (Check-In)** button in the top action bar.
3. Fill in the patient's name, phone number, doctor, and service.
4. Click **Admit & Check In Patient**.
   - The patient is admitted directly with status `arrived` (zero expiring holds).
   - Their name immediately reflects in the **Lobby Waiting Room** swimlane and crosses out the time block on the Doctor's daily schedule grid.

### ⏱️ Workflow 3: Live Patient Attendance Lifecycle
In **Live Visits** (`/live-visits`), drag or click patient action buttons as they move through the clinic:
1. **Lobby Waiting Room**: Patient is checked in. Live tabular counters show exact minutes spent waiting.
2. **In Consultation**: Front desk clicks **Start Consult** when the doctor calls the patient in.
3. **Completed**: When the visit finishes, click **Complete Visit**. You can optionally log a Doctor Follow-Up Task (e.g. 7-day recall or suture removal).

### 🚨 Workflow 4: Doctor Sick Day / Emergency Disruption
If a doctor is abruptly absent or calls in sick:
1. Navigate to **Doctor Schedule** (`/calendar`).
2. In the Doctor Summary Strip, click **Emergency Disruption**.
3. Select the affected doctor (e.g. Dr. Amina Bello) and choose the coverage plan:
   - **Option A (Reassign to Colleague)**: 1-click move all affected appointments to another available doctor (e.g. Dr. Babawo) whose shifts and specialty match.
   - **Option B (Notify Patients & Reschedule)**: Dispatches automated Telegram reschedule notices with alternative times.

---

## 6. White-Label Customization in Under 2 Minutes

To rebrand or update the clinic details for any client or branch:
1. Navigate to **Clinic Settings** (`/admin/settings`).
2. Update clinic profile:
   - **Clinic Name**: e.g., *Cedarcare Specialist Clinic*
   - **Phone & Emergency Lines**: Add or remove multiple Nigerian telephone numbers (`+234...`).
   - **Operating Hours**: Adjust open/close times, lunch break, and working days.
3. In **Clinical Services & Specialties**:
   - Add new services (e.g., *Laser Aesthetics*, *Orthodontics*, *Eye Care*).
   - Set consultation durations (15m, 30m, 45m, 60m) and buffer times.
   - Dynamically create new service categories using `✨ + Create Custom Category...`.
4. Click **Save Settings**. Updates propagate instantly to the availability engine and booking forms.

---

## 7. Compliance, Security & Data Privacy

- **Zero-Storage of Raw PINs/Passwords**: All credentials are encrypted using salted PBKDF2 with SHA-256 (390,000 hashing iterations).
- **Session Revocation Killswitch**: Deactivating an employee in `/admin/staff` instantly invalidates their JWT session cookies with immediate HTTP 401 expulsion.
- **NDPR & HIPAA Compliance**: Patient phone numbers, consultation logs, and medical visit records are strictly isolated, encrypted in transit over TLS 1.3, and protected against timing side-channel attacks.
