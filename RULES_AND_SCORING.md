## 1. Hard Scheduling Constraints & Availability Math

The deterministic availability engine applies the following sequential rules:

1. **Doctor Shift & Working Days Filter**:
   $$\text{Slot} \subseteq [\text{Doctor.shift\_start}, \text{Doctor.shift\_end}] \quad \text{AND} \quad \text{Weekday} \in \text{Doctor.working\_days}$$
2. **Multi-Service Doctor Qualification**:
   - Doctors are linked to specific services they are authorized to perform.
   - When a patient selects a service, only doctors linked to that service are evaluated.
3. **Service Duration & Rest/Sanitization Buffer**:
   $$\text{Total Time Block} = \text{Service.duration\_minutes} + \text{Service.buffer\_minutes}$$
   *(e.g., Dental Consultation: 30m + 10m buffer = 40m block. Ensures doctor rest and room sanitation).*
4. **Collision & Overlap Filter**:
   $$\text{Start}_{\text{new}} < \text{End}_{\text{existing}} \quad \text{AND} \quad \text{End}_{\text{new}} > \text{Start}_{\text{existing}}$$
   *(Checks against confirmed appointments, active temporary holds, and doctor leave/breaks).*
5. **Emergency & Walk-In Protection (Floating Reserve)**:
   - The clinic reserves **1 floating emergency slot per shift** (or a designated emergency window) shielded from public booking.
   - The receptionist can unlock or assign this slot instantly for walk-in emergency patients via **Emergency Override**.

---

## 2. Doctor Sickness & Emergency Leave Disruption Protocol

When a doctor is suddenly marked **"On Sick Leave"** by the front desk:
1. **Dashboard Disruption Alert**: The dashboard immediately generates an elevated **"⚠️ Doctor Leave Disruption"** panel listing all affected patients for that doctor.
2. **Receptionist Resolution Actions**:
   - **Action 1: 1-Click Reassign to Available Colleague**: If another doctor of the same specialty is free at that time, receptionist clicks `[Reassign to Dr. Okafor]`. Patient is sent an automated update: *"Your appointment today has been reassigned to Dr. Okafor at the same time."*
   - **Action 2: Reschedule to New Dates**: If no doctor is free, receptionist clicks `[Dispatch Reschedule Options]`, which calculates the next 3 available slots and sends a polite priority rebook message with a 1-hour offer window.

---

## 3. Slot Scoring & Ranking Algorithm
When multiple eligible slots exist, the engine ranks them to present the top 3 optimal options for the receptionist:

$$\text{Score}(S) = W_1 \cdot P_{\text{date}} + W_2 \cdot P_{\text{time}} + W_3 \cdot D_{\text{pref}} + W_4 \cdot C_{\text{util}}$$

| Weight Factor | Metric | Criteria / Scoring Points |
| :--- | :--- | :--- |
| **$W_1 = 40$ pts** | **Preferred Date Match** | +40 if exact 1st choice date; +25 if within 2-week range. |
| **$W_2 = 30$ pts** | **Preferred Time Window** | +30 if within requested window (Morning: 8am-12pm, Afternoon: 12pm-4pm, Evening: 4pm-7pm). |
| **$W_3 = 20$ pts** | **Preferred Doctor Match** | +20 if preferred doctor; +10 if assigned specialty match. |
| **$W_4 = 10$ pts** | **Schedule Utilization** | +10 if slot directly abuts an existing booking (minimizes fragmented calendar gaps). |

---

## 3. Receptionist Queue Governance & Tab Organization

### A. Queue Ordering Rules
1. **FIFO (First In, First Out) by Default**: New booking requests are ordered strictly by creation timestamp (`created_at ASC`). Earlier patients always appear higher in the queue than later arrivals.
2. **Re-Requested Priority Elevation**: Patients who missed their 1-hour window and clicked `[🔄 See New Times]` are routed into the dedicated **"Re-Requested Slots"** tab and elevated to the top of the receptionist's action list. Since their data is already collected, front desk can approve fresh slots immediately.

### B. Receptionist Dashboard Tab Breakdown
- **Tab 1: New Requests Queue** (Active incoming leads awaiting initial clinical review & slot check).
- **Tab 2: Re-Requested Slots** (Patients who requested fresh times after 1-hour expiry — Priority).
- **Tab 3: Expired Requests** (Historical/unresponsive requests where 1-hour offer elapsed without patient action).
- **Tab 4: Live Clinic Schedule & Visits** (`Confirmed` $\rightarrow$ `Arrived` $\rightarrow$ `In Consultation` $\rightarrow$ `Completed` / `No-Show`).

### C. Receptionist Shifts, Shared Queue State & Session Lifetimes
- **Shared Clinic State**: All receptionists share the **identical central database, requests queue, calendar, and patient records**. When a new receptionist account is created or a new shift begins, they immediately see the full clinic operational state. Their personal identity is attached to the session for audit logs.
- **30-Day Session Lifetime with 20-Min Screen Lock**:
  - Full username/password session lasts for **30 days** on the front-desk workstation.
  - Inactivity of **20 minutes** triggers a quick **4-digit PIN lock** (fast to unlock in < 3 seconds).
  - Receptionists can click `[Switch User / Log Out]` to cleanly switch between shift personnel at any time.
- **Outside Operating Hours**: When a patient books at night or on holidays:
  1. Instant calm message is sent confirming receipt and stating the clinic's opening time (e.g., 8:00 AM).
  2. The request is tagged as `queued_for_morning` and positioned at the top of the morning shift's queue.
  3. Patient is informed that when their slot options are sent in the morning, they will have **1 hour** to select.

---

## 4. Emergency & Walk-In Reservation Rules
- Clinics can configure an `emergency_reserve_percentage` (e.g., 10% of total daily slots or designated time blocks like 1:00 PM – 2:00 PM).
- These reserved slots are shielded from regular patient booking offers and only unlocked by receptionist override.
