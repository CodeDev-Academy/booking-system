/**
 * Clinical Mock Data matching DATABASE_SCHEMA.md and API_REFERENCE.md
 */

export const INITIAL_SERVICES = [
  {
    id: "srv-001",
    name: "Dental Consultation",
    category: "General",
    duration_minutes: 30,
    buffer_minutes: 10,
    deposit_required: false,
    price: 45.0
  },
  {
    id: "srv-002",
    name: "Teeth Whitening & Hygiene",
    category: "Cosmetic",
    duration_minutes: 45,
    buffer_minutes: 10,
    deposit_required: true,
    price: 120.0
  },
  {
    id: "srv-003",
    name: "Orthodontic Evaluation",
    category: "Specialist",
    duration_minutes: 40,
    buffer_minutes: 15,
    deposit_required: false,
    price: 85.0
  },
  {
    id: "srv-004",
    name: "Root Canal Therapy (Step 1)",
    category: "Endodontics",
    duration_minutes: 60,
    buffer_minutes: 15,
    deposit_required: true,
    price: 250.0
  },
  {
    id: "srv-005",
    name: "Emergency Toothache Triage",
    category: "Urgent",
    duration_minutes: 20,
    buffer_minutes: 5,
    deposit_required: false,
    price: 60.0
  }
];

export const INITIAL_DOCTORS = [
  {
    id: "doc-uuid-1",
    name: "Dr. Ibrahim Bello",
    specialty: "General Dental Practitioner",
    email: "dr.bello@medpulse.clinic",
    phone: "+234 802 111 2233",
    working_days: [1, 2, 3, 4, 5],
    shift_start: "08:30",
    shift_end: "16:30",
    is_active: true,
    duty_status: "on_duty", // on_duty, on_break, on_leave
    patients_seen_today: 4,
    appointments_remaining: 3
  },
  {
    id: "doc-uuid-2",
    name: "Dr. Chidinma Okafor",
    specialty: "Orthodontics Specialist",
    email: "dr.okafor@medpulse.clinic",
    phone: "+234 803 444 5566",
    working_days: [1, 2, 3, 4, 5, 6],
    shift_start: "09:00",
    shift_end: "17:00",
    is_active: true,
    duty_status: "on_duty",
    patients_seen_today: 6,
    appointments_remaining: 2
  },
  {
    id: "doc-uuid-3",
    name: "Dr. Zainab Al-Hassan",
    specialty: "Oral & Maxillofacial Surgeon",
    email: "dr.alhassan@medpulse.clinic",
    phone: "+234 805 777 8899",
    working_days: [2, 3, 4, 6],
    shift_start: "10:00",
    shift_end: "18:00",
    is_active: true,
    duty_status: "on_break",
    patients_seen_today: 2,
    appointments_remaining: 4
  }
];

export const INITIAL_STAFF = [
  {
    id: "staff-uuid-1",
    full_name: "Sarah Jenkins",
    email: "sarah.j@medpulse.clinic",
    role: "receptionist",
    desk: "Front Desk #1",
    phone: "+234 801 000 1122",
    is_active: true,
    duty_status: "on_duty",
    shift: "Morning (08:00 - 14:00)",
    last_login: "Today, 07:55 AM"
  },
  {
    id: "staff-uuid-2",
    full_name: "John Ade",
    email: "john.ade@medpulse.clinic",
    role: "receptionist",
    desk: "Front Desk #2",
    phone: "+234 802 333 4455",
    is_active: true,
    duty_status: "on_break",
    shift: "Morning (08:00 - 14:00)",
    last_login: "Today, 08:10 AM"
  },
  {
    id: "doc-uuid-1",
    full_name: "Dr. Ibrahim Bello",
    email: "dr.bello@medpulse.clinic",
    role: "doctor",
    desk: "Consultation Suite 1",
    specialty: "General Dental Practitioner",
    phone: "+234 802 111 2233",
    is_active: true,
    duty_status: "on_duty",
    shift: "Full Day (08:30 - 16:30)",
    last_login: "Today, 08:20 AM"
  },
  {
    id: "doc-uuid-2",
    full_name: "Dr. Chidinma Okafor",
    email: "dr.okafor@medpulse.clinic",
    role: "doctor",
    desk: "Consultation Suite 2",
    specialty: "Orthodontics Specialist",
    phone: "+234 803 444 5566",
    is_active: true,
    duty_status: "on_duty",
    shift: "Full Day (09:00 - 17:00)",
    last_login: "Today, 08:45 AM"
  },
  {
    id: "doc-uuid-3",
    full_name: "Dr. Zainab Al-Hassan",
    email: "dr.alhassan@medpulse.clinic",
    role: "doctor",
    desk: "Consultation Suite 3",
    specialty: "Oral & Maxillofacial Surgeon",
    phone: "+234 805 777 8899",
    is_active: true,
    duty_status: "on_break",
    shift: "Late Shift (10:00 - 18:00)",
    last_login: "Today, 09:30 AM"
  },
  {
    id: "staff-uuid-4",
    full_name: "Michael Sterling",
    email: "admin@medpulse.clinic",
    role: "clinic_admin",
    desk: "Administration Office",
    phone: "+234 809 999 0000",
    is_active: true,
    duty_status: "on_duty",
    shift: "Management",
    last_login: "Today, 07:30 AM"
  },
  {
    id: "staff-uuid-5",
    full_name: "Blessing Umeh",
    email: "blessing.u@medpulse.clinic",
    role: "nurse",
    desk: "Clinical Triage & Sterilization",
    phone: "+234 811 222 3344",
    is_active: true,
    duty_status: "on_duty",
    shift: "Morning (07:30 - 15:30)",
    last_login: "Today, 07:45 AM"
  },
  {
    id: "staff-uuid-6",
    full_name: "Musa Haruna",
    email: "musa.h@medpulse.clinic",
    role: "cleaner",
    desk: "Facility & Clinic Hygiene",
    phone: "+234 812 555 6677",
    is_active: true,
    duty_status: "on_duty",
    shift: "Morning (07:00 - 16:00)",
    last_login: "Today, 06:50 AM"
  }
];

export const INITIAL_BOOKING_REQUESTS = [
  {
    request_id: "REQ-2026-0042",
    patient_name: "Amina Yusuf",
    patient_phone: "+234 801 234 5678",
    patient_type: "returning",
    past_visits_count: 3,
    last_visit: "2026-08-14 (Teeth Cleaning)",
    service_id: "srv-001",
    service_name: "Dental Consultation",
    preferred_doctor_id: "doc-uuid-1",
    preferred_doctor_name: "Dr. Ibrahim Bello",
    preferred_dates: ["2026-10-12", "2026-10-13"],
    preferred_time_window: "morning",
    channel: "whatsapp",
    status: "awaiting_review", // awaiting_review, re_requested, slots_offered, offer_expired, converted, rejected
    priority: "normal",
    created_at: new Date(Date.now() - 14 * 60 * 1000).toISOString(), // 14 mins ago
    concurrent_review_by: null, // "Sarah"
    suggested_slots: [
      {
        id: "slot-cand-1",
        doctor_id: "doc-uuid-1",
        doctor_name: "Dr. Ibrahim Bello",
        start_datetime: "2026-10-12T10:00:00Z",
        end_datetime: "2026-10-12T10:30:00Z",
        display_label: "Mon Oct 12, 10:00 AM - 10:30 AM"
      },
      {
        id: "slot-cand-2",
        doctor_id: "doc-uuid-1",
        doctor_name: "Dr. Ibrahim Bello",
        start_datetime: "2026-10-12T11:30:00Z",
        end_datetime: "2026-10-12T12:00:00Z",
        display_label: "Mon Oct 12, 11:30 AM - 12:00 PM"
      },
      {
        id: "slot-cand-3",
        doctor_id: "doc-uuid-2",
        doctor_name: "Dr. Chidinma Okafor",
        start_datetime: "2026-10-13T09:00:00Z",
        end_datetime: "2026-10-13T09:30:00Z",
        display_label: "Tue Oct 13, 09:00 AM - 09:30 AM"
      }
    ]
  },
  {
    request_id: "REQ-2026-0043",
    patient_name: "David Olanrewaju",
    patient_phone: "+234 803 987 6543",
    patient_type: "new",
    past_visits_count: 0,
    last_visit: null,
    service_id: "srv-003",
    service_name: "Orthodontic Evaluation",
    preferred_doctor_id: null,
    preferred_doctor_name: "Any Specialist",
    preferred_dates: ["2026-10-14"],
    preferred_time_window: "afternoon",
    channel: "telegram",
    status: "awaiting_review",
    priority: "normal",
    created_at: new Date(Date.now() - 9 * 60 * 1000).toISOString(),
    concurrent_review_by: "John Ade",
    suggested_slots: [
      {
        id: "slot-cand-4",
        doctor_id: "doc-uuid-2",
        doctor_name: "Dr. Chidinma Okafor",
        start_datetime: "2026-10-14T14:00:00Z",
        end_datetime: "2026-10-14T14:40:00Z",
        display_label: "Wed Oct 14, 02:00 PM - 02:40 PM"
      },
      {
        id: "slot-cand-5",
        doctor_id: "doc-uuid-2",
        doctor_name: "Dr. Chidinma Okafor",
        start_datetime: "2026-10-14T15:30:00Z",
        end_datetime: "2026-10-14T16:10:00Z",
        display_label: "Wed Oct 14, 03:30 PM - 04:10 PM"
      }
    ]
  },
  {
    request_id: "REQ-2026-0040",
    patient_name: "Fatima Garba",
    patient_phone: "+234 809 112 3344",
    patient_type: "returning",
    past_visits_count: 2,
    last_visit: "2026-05-19",
    service_id: "srv-002",
    service_name: "Teeth Whitening & Hygiene",
    preferred_doctor_id: "doc-uuid-1",
    preferred_doctor_name: "Dr. Ibrahim Bello",
    preferred_dates: ["2026-10-15"],
    preferred_time_window: "morning",
    channel: "web",
    status: "re_requested", // 1-click priority re-engagement!
    priority: "urgent",
    created_at: new Date(Date.now() - 65 * 60 * 1000).toISOString(),
    re_requested_at: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
    concurrent_review_by: null,
    suggested_slots: [
      {
        id: "slot-cand-6",
        doctor_id: "doc-uuid-1",
        doctor_name: "Dr. Ibrahim Bello",
        start_datetime: "2026-10-15T09:30:00Z",
        end_datetime: "2026-10-15T10:15:00Z",
        display_label: "Thu Oct 15, 09:30 AM - 10:15 AM"
      },
      {
        id: "slot-cand-7",
        doctor_id: "doc-uuid-2",
        doctor_name: "Dr. Chidinma Okafor",
        start_datetime: "2026-10-15T11:00:00Z",
        end_datetime: "2026-10-15T11:45:00Z",
        display_label: "Thu Oct 15, 11:00 AM - 11:45 AM"
      }
    ]
  },
  {
    request_id: "REQ-2026-0038",
    patient_name: "Emeka Eze",
    patient_phone: "+234 814 555 7788",
    patient_type: "new",
    past_visits_count: 0,
    last_visit: null,
    service_id: "srv-004",
    service_name: "Root Canal Therapy (Step 1)",
    preferred_doctor_id: "doc-uuid-3",
    preferred_doctor_name: "Dr. Zainab Al-Hassan",
    preferred_dates: ["2026-10-11"],
    preferred_time_window: "afternoon",
    channel: "whatsapp",
    status: "offer_expired", // Past 60 min unselected
    priority: "normal",
    created_at: new Date(Date.now() - 120 * 60 * 1000).toISOString(),
    expired_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    concurrent_review_by: null,
    suggested_slots: []
  },
  {
    request_id: "REQ-2026-0044",
    patient_name: "Folake Adebayo",
    patient_phone: "+234 816 888 9900",
    patient_type: "returning",
    past_visits_count: 5,
    last_visit: "2026-09-02",
    service_id: "srv-001",
    service_name: "Dental Consultation",
    preferred_doctor_id: "doc-uuid-1",
    preferred_doctor_name: "Dr. Ibrahim Bello",
    preferred_dates: ["2026-10-13"],
    preferred_time_window: "morning",
    channel: "whatsapp",
    status: "slots_offered",
    offered_at: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
    expires_at: new Date(Date.now() + 35 * 60 * 1000).toISOString(), // 35 mins remaining
    suggested_slots: [
      {
        id: "slot-cand-8",
        doctor_id: "doc-uuid-1",
        doctor_name: "Dr. Ibrahim Bello",
        start_datetime: "2026-10-13T10:00:00Z",
        end_datetime: "2026-10-13T10:30:00Z",
        display_label: "Tue Oct 13, 10:00 AM - 10:30 AM"
      }
    ]
  }
];

export const INITIAL_LIVE_APPOINTMENTS = [
  {
    appointment_id: "AP-1038",
    patient_name: "Tunde Bakare",
    patient_phone: "+234 802 334 5566",
    doctor_id: "doc-uuid-1",
    doctor_name: "Dr. Ibrahim Bello",
    service_name: "Dental Consultation",
    start_datetime: "2026-10-09T09:00:00Z",
    end_datetime: "2026-10-09T09:30:00Z",
    time_label: "09:00 AM - 09:30 AM",
    status: "in_consultation", // held, confirmed, arrived, in_consultation, completed, no_show, cancelled
    arrival_at: "08:52 AM",
    consultation_start_at: "09:05 AM",
    room: "Suite 1",
    notes: "Patient reported slight sensitivity in upper left molar."
  },
  {
    appointment_id: "AP-1039",
    patient_name: "Grace Nwosu",
    patient_phone: "+234 803 777 1212",
    doctor_id: "doc-uuid-2",
    doctor_name: "Dr. Chidinma Okafor",
    service_name: "Orthodontic Evaluation",
    start_datetime: "2026-10-09T09:30:00Z",
    end_datetime: "2026-10-09T10:10:00Z",
    time_label: "09:30 AM - 10:10 AM",
    status: "arrived", // Waiting room
    arrival_at: "09:18 AM (Waiting 14m)",
    consultation_start_at: null,
    room: "Waiting Area (Chair #3)",
    notes: "First time orthodontic consult."
  },
  {
    appointment_id: "AP-1040",
    patient_name: "Kelechi Iheanacho",
    patient_phone: "+234 805 999 8811",
    doctor_id: "doc-uuid-1",
    doctor_name: "Dr. Ibrahim Bello",
    service_name: "Teeth Whitening & Hygiene",
    start_datetime: "2026-10-09T10:30:00Z",
    end_datetime: "2026-10-09T11:15:00Z",
    time_label: "10:30 AM - 11:15 AM",
    status: "confirmed",
    arrival_at: null,
    consultation_start_at: null,
    room: "Upcoming",
    notes: "Confirmed via Telegram 24h reminder."
  },
  {
    appointment_id: "AP-1036",
    patient_name: "Amina Aliyu",
    patient_phone: "+234 812 444 3322",
    doctor_id: "doc-uuid-2",
    doctor_name: "Dr. Chidinma Okafor",
    service_name: "Orthodontic Evaluation",
    start_datetime: "2026-10-09T08:30:00Z",
    end_datetime: "2026-10-09T09:10:00Z",
    time_label: "08:30 AM - 09:10 AM",
    status: "completed",
    arrival_at: "08:25 AM",
    consultation_start_at: "08:32 AM",
    completed_at: "09:10 AM",
    room: "Suite 2",
    follow_up_scheduled: "2026-10-23",
    notes: "Bracket adjustment completed. Follow-up booked in 2 weeks."
  },
  {
    appointment_id: "AP-1037",
    patient_name: "Chukwudi Obi",
    patient_phone: "+234 806 333 9988",
    doctor_id: "doc-uuid-3",
    doctor_name: "Dr. Zainab Al-Hassan",
    service_name: "Emergency Toothache Triage",
    start_datetime: "2026-10-09T08:00:00Z",
    end_datetime: "2026-10-09T08:20:00Z",
    time_label: "08:00 AM - 08:20 AM",
    status: "no_show",
    arrival_at: null,
    consultation_start_at: null,
    room: "Unattended",
    notes: "Did not arrive; automated check-in reminder sent."
  }
];

export const INITIAL_CLINIC_SETTINGS = {
  clinic_name: "MedPulse Dental & Specialist Clinic",
  tagline: "Receptionist-Approved Precision Healthcare",
  address: "Plot 14, Victoria Island Crescent, Lagos",
  phone: "+234 1 234 5678",
  whatsapp_phone_id: "MEDPULSE_WA_2026",
  telegram_bot_token: "bot728912891:AAFk3920_medpulse_live",
  open_time: "08:00",
  close_time: "18:00",
  working_days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  lunch_break_start: "13:00",
  lunch_break_end: "14:00",
  offer_expiry_minutes: 60,
  hold_expiry_minutes: 15,
  default_buffer_minutes: 10,
  emergency_slots_per_shift: 1,
  enable_24h_reminder: true,
  enable_2h_reminder: true
};

export const INITIAL_ANALYTICS = {
  total_bookings: 142,
  attendance_rate_percent: 92.4,
  no_show_rate_percent: 4.8,
  avg_receptionist_response_minutes: 3.8,
  re_engagement_recovery_rate_percent: 71.2,
  hourly_distribution: [
    { hour: "08:00", count: 8 },
    { hour: "09:00", count: 18 },
    { hour: "10:00", count: 24 },
    { hour: "11:00", count: 21 },
    { hour: "12:00", count: 15 },
    { hour: "13:00", count: 6 },
    { hour: "14:00", count: 19 },
    { hour: "15:00", count: 17 },
    { hour: "16:00", count: 11 },
    { hour: "17:00", count: 3 }
  ],
  services_breakdown: [
    { name: "Dental Consultation", count: 58, percent: 41 },
    { name: "Teeth Whitening", count: 34, percent: 24 },
    { name: "Orthodontic Evaluation", count: 28, percent: 20 },
    { name: "Root Canal Therapy", count: 14, percent: 10 },
    { name: "Emergency Triage", count: 8, percent: 5 }
  ]
};

export const INITIAL_PAST_APPOINTMENTS = [
  {
    appointment_id: "AP-1025",
    patient_name: "Amina Yusuf",
    patient_phone: "+234 801 234 5678",
    doctor_id: "doc-uuid-1",
    doctor_name: "Dr. Ibrahim Bello",
    doctor_specialty: "General Dental Practitioner",
    service_name: "Dental Consultation",
    date: "2026-10-08",
    time_label: "09:30 AM - 10:00 AM",
    status: "completed",
    room: "Suite 1 (Dental)",
    notes: "Comprehensive oral exam done. Mild plaque noted. Ultrasonic scaling completed successfully.",
    follow_up_scheduled: "2027-04-08 (6-Month Routine Recall)",
    completed_at: "2026-10-08T10:05:00Z"
  },
  {
    appointment_id: "AP-1024",
    patient_name: "Tunde Bakare",
    patient_phone: "+234 802 888 1122",
    doctor_id: "doc-uuid-2",
    doctor_name: "Dr. Chidinma Okafor",
    doctor_specialty: "Orthodontics Specialist",
    service_name: "Teeth Whitening & Hygiene",
    date: "2026-10-07",
    time_label: "11:00 AM - 11:45 AM",
    status: "completed",
    room: "Suite 2 (Aesthetics)",
    notes: "In-office 45-min laser whitening completed. 3 shades improvement noted on VITA shade guide.",
    follow_up_scheduled: "None required",
    completed_at: "2026-10-07T11:50:00Z"
  },
  {
    appointment_id: "AP-1023",
    patient_name: "Chioma Okonkwo",
    patient_phone: "+234 803 777 4433",
    doctor_id: "doc-uuid-2",
    doctor_name: "Dr. Chidinma Okafor",
    doctor_specialty: "Orthodontics Specialist",
    service_name: "Orthodontic Evaluation",
    date: "2026-10-06",
    time_label: "02:00 PM - 02:40 PM",
    status: "completed",
    room: "Suite 2 (Orthodontics)",
    notes: "Diagnostic scans and impressions taken. Clear aligner treatment plan initiated.",
    follow_up_scheduled: "2026-10-27 (Aligner Tray Fitting)",
    completed_at: "2026-10-06T14:42:00Z"
  },
  {
    appointment_id: "AP-1022",
    patient_name: "Segun Adeleke",
    patient_phone: "+234 805 111 9900",
    doctor_id: "doc-uuid-1",
    doctor_name: "Dr. Ibrahim Bello",
    doctor_specialty: "General Dental Practitioner",
    service_name: "Root Canal Therapy (Step 1)",
    date: "2026-10-05",
    time_label: "10:30 AM - 11:30 AM",
    status: "completed",
    room: "Suite 1 (Endodontics)",
    notes: "Pulp chamber accessed. Canal instrumentation complete. Temporary IRM filling placed.",
    follow_up_scheduled: "2026-10-19 (Step 2 Obturation)",
    completed_at: "2026-10-05T11:35:00Z"
  },
  {
    appointment_id: "AP-1021",
    patient_name: "Fatima Aliyu",
    patient_phone: "+234 807 555 6677",
    doctor_id: "doc-uuid-3",
    doctor_name: "Dr. Zainab Al-Hassan",
    doctor_specialty: "Oral & Maxillofacial Surgeon",
    service_name: "Dental Consultation",
    date: "2026-10-04",
    time_label: "01:00 PM - 01:30 PM",
    status: "cancelled",
    room: "Unassigned",
    notes: "Patient requested cancellation 24h prior due to interstate work travel.",
    cancellation_reason: "Patient interstate work travel",
    completed_at: null
  },
  {
    appointment_id: "AP-1020",
    patient_name: "Emeka Nwosu",
    patient_phone: "+234 809 333 2211",
    doctor_id: "doc-uuid-3",
    doctor_name: "Dr. Zainab Al-Hassan",
    doctor_specialty: "Oral & Maxillofacial Surgeon",
    service_name: "Emergency Toothache Triage",
    date: "2026-10-03",
    time_label: "08:30 AM - 08:50 AM",
    status: "no_show",
    room: "Suite 3",
    notes: "Patient did not show up. Follow-up SMS welfare check dispatched by reception.",
    cancellation_reason: "Unnotified missed visit",
    completed_at: null
  },
  {
    appointment_id: "AP-1019",
    patient_name: "Grace Danladi",
    patient_phone: "+234 802 444 6688",
    doctor_id: "doc-uuid-1",
    doctor_name: "Dr. Ibrahim Bello",
    doctor_specialty: "General Dental Practitioner",
    service_name: "Dental Consultation",
    date: "2026-09-29",
    time_label: "03:00 PM - 03:30 PM",
    status: "completed",
    room: "Suite 1 (Dental)",
    notes: "Gingival health checkup. Clean bill of oral health. Recommended soft-bristled brush.",
    follow_up_scheduled: "2027-03-29 (Routine Recall)",
    completed_at: "2026-09-29T15:35:00Z"
  }
];
