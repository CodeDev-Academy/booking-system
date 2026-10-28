/**
 * mockData — Pre-seeded Cedarcare demo records (Demo Mode / offline pitching).
 * LOGIC LAYER: no JSX. Replaced by live API responses when Live API mode is on.
 */

const MIN = 60000;

export const startOfDayOffset = (offset) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d.getTime();
};

export const at = (offset, h, m = 0) => startOfDayOffset(offset) + (h * 60 + m) * MIN;

/** First weekday offset from today (0 if today is Mon–Fri). */
const nextWeekdayOffset = () => {
  let offset = 0;
  while ([0, 6].includes(new Date(startOfDayOffset(offset)).getDay())) offset += 1;
  return offset;
};

export const BASE_OFFSET = nextWeekdayOffset();
export const DEFAULT_RANGE_DAYS = 14;

// Clinic rules — mirrors ClinicSetting (configurable in /admin/settings, never hardcoded in UI)
export const CLINIC_RULES = {
  offerExpiryMin: 60,
  gridIncrementMin: 15,
  lunchStartMin: 12 * 60,
  lunchEndMin: 13 * 60,
  reserveStartMin: 11 * 60,
  reserveDurationMin: 30,
  defaultCountryCode: '+234',
};

export const SERVICES = [
  { id: 'svc-dental', name: 'Dental Consultation', durationMin: 30, bufferMin: 10, priceNgn: 15000 },
  { id: 'svc-extract', name: 'Tooth Extraction', durationMin: 45, bufferMin: 15, priceNgn: 35000 },
  { id: 'svc-checkup', name: 'General Health Check-up', durationMin: 20, bufferMin: 10, priceNgn: 12000 },
];

export const formatNaira = (amount) =>
  `₦${Number(amount || 0).toLocaleString('en-NG')}`;

export const DOCTORS = [
  {
    id: 'doc-bello',
    name: 'Dr. Bello',
    specialty: 'Dentist',
    shiftStartMin: 9 * 60,
    shiftEndMin: 17 * 60,
    serviceIds: ['svc-dental', 'svc-extract'],
  },
  {
    id: 'doc-okafor',
    name: 'Dr. Okafor',
    specialty: 'General Practitioner',
    shiftStartMin: 8 * 60,
    shiftEndMin: 16 * 60,
    serviceIds: ['svc-checkup', 'svc-dental'],
  },
  {
    id: 'doc-babawo',
    name: 'Dr. Babawo',
    specialty: 'Consultant Physician & Surgeon',
    shiftStartMin: 8 * 60,
    shiftEndMin: 17 * 60,
    serviceIds: ['svc-checkup', 'svc-dental', 'svc-extract'],
  },
];

export const TIME_WINDOWS = {
  morning: { label: 'Morning', fromMin: 8 * 60, toMin: 12 * 60 },
  afternoon: { label: 'Afternoon', fromMin: 13 * 60, toMin: 17 * 60 },
  evening: { label: 'Evening', fromMin: 16 * 60, toMin: 18 * 60 },
};

export const INFO_PROMPTS = [
  'Could you confirm which tooth or area needs attention?',
  'Is this your first visit, or have you been to Cedarcare before?',
  'Please confirm the best phone number to reach you on.',
  'Do you have a preferred doctor or a preferred time of day?',
];

/** Existing-schedule blocks the Double-Booking Shield validates against. */
export const buildBusyBlocks = () => {
  const blocks = [];
  for (let day = BASE_OFFSET; day < BASE_OFFSET + DEFAULT_RANGE_DAYS + 7; day += 1) {
    blocks.push({
      id: `lunch-${day}`,
      doctorId: null,
      type: 'break',
      label: 'Clinic lunch break',
      start: at(day, 0) + CLINIC_RULES.lunchStartMin * MIN,
      end: at(day, 0) + CLINIC_RULES.lunchEndMin * MIN,
    });
    DOCTORS.forEach((doc) => {
      blocks.push({
        id: `reserve-${doc.id}-${day}`,
        doctorId: doc.id,
        type: 'reserve',
        label: 'Walk-In Emergency Reserve',
        start: at(day, 0) + CLINIC_RULES.reserveStartMin * MIN,
        end: at(day, 0) + (CLINIC_RULES.reserveStartMin + CLINIC_RULES.reserveDurationMin) * MIN,
      });
    });
  }
  // Confirmed visits + their sterilization buffers
  const visit = (id, doctorId, day, h, m, dur, buf, name) => {
    blocks.push({
      id,
      doctorId,
      type: 'appointment',
      label: `Booked: ${name}`,
      start: at(day, h, m),
      end: at(day, h, m) + dur * MIN,
    });
    blocks.push({
      id: `${id}-buf`,
      doctorId,
      type: 'buffer',
      label: 'Sterilization buffer',
      start: at(day, h, m) + dur * MIN,
      end: at(day, h, m) + (dur + buf) * MIN,
    });
  };
  visit('apt-1', 'doc-bello', BASE_OFFSET, 9, 0, 30, 10, 'T. Musa');
  visit('apt-2', 'doc-bello', BASE_OFFSET, 10, 0, 45, 15, 'F. Bello');
  visit('apt-3', 'doc-okafor', BASE_OFFSET, 9, 0, 20, 10, 'K. Danjuma');
  visit('apt-4', 'doc-bello', BASE_OFFSET + 1, 9, 0, 30, 10, 'R. Lawal');
  visit('apt-5', 'doc-babawo', BASE_OFFSET, 11, 0, 30, 10, 'A. Garba');
  visit('apt-6', 'doc-babawo', BASE_OFFSET, 14, 30, 45, 15, 'H. Sadiq');
  return blocks;
};

const minutesAgo = (m) => Date.now() - m * MIN;
const range = { fromOffset: BASE_OFFSET, toOffset: BASE_OFFSET + DEFAULT_RANGE_DAYS - 1 };

export const buildMockRequests = () => [
  {
    id: 'req-0042',
    code: 'REQ-2026-0042',
    patientName: 'Amina Yusuf',
    phone: '+2348012345678',
    patientType: 'returning',
    serviceId: 'svc-dental',
    preferredDoctorId: 'doc-bello',
    timeWindow: 'morning',
    dateRange: { ...range },
    channel: 'telegram',
    status: 'awaiting_review',
    reRequested: false,
    reviewingBy: null,
    createdAt: minutesAgo(12),
  },
  {
    id: 'req-0043',
    code: 'REQ-2026-0043',
    patientName: 'Kolawole Adeyemi',
    phone: '0803 555 0192',
    patientType: 'new',
    serviceId: 'svc-checkup',
    preferredDoctorId: null,
    timeWindow: 'afternoon',
    dateRange: { ...range },
    channel: 'web',
    status: 'awaiting_review',
    reRequested: false,
    reviewingBy: null,
    createdAt: minutesAgo(22),
  },
  {
    id: 'req-0044',
    code: 'REQ-2026-0044',
    patientName: 'Chiamaka Obi',
    phone: '+2348097771234',
    patientType: 'new',
    serviceId: 'svc-extract',
    preferredDoctorId: 'doc-bello',
    timeWindow: 'morning',
    dateRange: { ...range },
    channel: 'web',
    status: 'awaiting_review',
    reRequested: false,
    reviewingBy: null,
    createdAt: minutesAgo(38),
  },
  {
    id: 'req-0045',
    code: 'REQ-2026-0045',
    patientName: 'Ibrahim Sani',
    phone: '+2348055550101',
    patientType: 'returning',
    serviceId: 'svc-dental',
    preferredDoctorId: null,
    timeWindow: 'afternoon',
    dateRange: { ...range },
    channel: 'telegram',
    status: 'awaiting_review',
    reRequested: true,
    reviewingBy: 'Mary',
    createdAt: minutesAgo(55),
  },
  {
    id: 'req-0041',
    code: 'REQ-2026-0041',
    patientName: 'Grace Eze',
    phone: '+2348031112222',
    patientType: 'new',
    serviceId: 'svc-checkup',
    preferredDoctorId: 'doc-okafor',
    timeWindow: 'morning',
    dateRange: { ...range },
    channel: 'telegram',
    status: 'offer_expired',
    reRequested: false,
    reviewingBy: null,
    createdAt: minutesAgo(95),
    expiredAt: minutesAgo(20),
  },
];

export const buildMockAppointments = () => [
  { id: 'AP-1038', patientName: 'Tunde Musa', patientType: 'returning', phone: '+234 803 987 6543', serviceId: 'svc-dental', doctorId: 'doc-bello', start: at(0, 9, 0), status: 'confirmed' },
  { id: 'AP-1039', patientName: 'Fatima Bello', patientType: 'new', phone: '+234 802 111 3333', serviceId: 'svc-extract', doctorId: 'doc-bello', start: at(0, 10, 0), status: 'confirmed' },
  { id: 'AP-1040', patientName: 'Kenneth Danjuma', patientType: 'new', phone: '+234 805 444 5555', serviceId: 'svc-checkup', doctorId: 'doc-okafor', start: at(0, 10, 30), status: 'confirmed' },
  { id: 'AP-1041', patientName: 'Zainab Lawal', patientType: 'returning', phone: '+234 807 666 7777', serviceId: 'svc-dental', doctorId: 'doc-bello', start: at(0, 14, 0), status: 'held' },
  { id: 'AP-1043', patientName: 'Aliyu Garba', patientType: 'returning', phone: '+234 802 444 8899', serviceId: 'svc-checkup', doctorId: 'doc-babawo', start: at(0, 11, 0), status: 'confirmed' },
  { id: 'AP-1044', patientName: 'Halima Sadiq', patientType: 'new', phone: '+234 813 555 1212', serviceId: 'svc-extract', doctorId: 'doc-babawo', start: at(0, 14, 30), status: 'confirmed' },
];

// Returning-patient registry, keyed by E.164 phone (no patient ID required).
// ZERO DIAGNOSIS EXPOSURE: only operational, non-clinical procedure names are stored here.
const PATIENT_REGISTRY = {
  '+2348012345678': {
    name: 'Amina Yusuf',
    phone: '+234 801 234 5678',
    totalVisits: 4,
    attended: 4,
    lastVisits: [
      {
        date: '20 Oct 2026',
        time: '10:00 AM',
        doctor: 'Dr. Aminu Bello',
        receptionist: 'Chioma Nwosu (Front Desk)',
        procedure: 'Tooth Extraction',
        outcome: 'Discharged · Recall Set',
        clinicalNotes: 'Lower right molar extraction performed under local anesthesia. Socket sutured; hemostasis achieved.',
        adminNotes: 'Informed consent signed. Post-op instruction leaflet handed to patient.',
      },
      {
        date: '14 Jul 2026',
        time: '11:30 AM',
        doctor: 'Dr. Aminu Bello',
        receptionist: 'Bisi Alabi (Front Desk)',
        procedure: 'Routine Scaling & Polishing',
        outcome: 'Hygiene Complete',
        clinicalNotes: 'Ultrasonic supragingival scaling completed. Mild plaque buildup removed. Periodontal probing depths within normal limits (<3mm).',
        adminNotes: 'Patient arrived on time. Follow-up 6-month reminder flagged in system.',
      },
      {
        date: '10 Feb 2026',
        time: '09:00 AM',
        doctor: 'Dr. Aminu Bello',
        receptionist: 'Chioma Nwosu (Front Desk)',
        procedure: 'Dental Consultation & Diagnosis',
        outcome: 'Caries Identified',
        clinicalNotes: 'Identified deep occlusal caries on tooth #46. Discussed restorative vs extraction pathways.',
        adminNotes: 'Treatment estimate printed and approved by patient.',
      },
    ],
  },
  '+2348055550101': {
    name: 'Ibrahim Sani',
    phone: '+234 805 555 0101',
    totalVisits: 5,
    attended: 4,
    lastVisits: [
      {
        date: '20 Jul 2026',
        time: '09:00 AM',
        doctor: 'Dr. Aminu Bello',
        receptionist: 'Bisi Alabi (Front Desk)',
        procedure: 'Dental Consultation & Prophylaxis',
        outcome: 'Discharged',
        clinicalNotes: 'Routine cleaning. Gingival inflammation resolved following previous salt-water rinses.',
        adminNotes: 'Private insurance coverage verified. Copay cleared.',
      },
      {
        date: '18 May 2026',
        time: '10:15 AM',
        doctor: 'Dr. Chinelo Okafor',
        receptionist: 'Chioma Nwosu (Front Desk)',
        procedure: 'General Health Review',
        outcome: 'Vitals Normal',
        clinicalNotes: 'Blood pressure 124/82 mmHg. Pulse 74 bpm. Clear lung fields.',
        adminNotes: 'Routine check-in completed in under 2 minutes.',
      },
    ],
  },
  '+2348039876543': {
    name: 'Tunde Musa',
    phone: '+234 803 987 6543',
    totalVisits: 6,
    attended: 6,
    lastVisits: [
      {
        date: '18 Oct 2026',
        time: '02:30 PM',
        doctor: 'Dr. Aminu Bello',
        receptionist: 'Bisi Alabi (Front Desk)',
        procedure: 'Dental Consultation',
        outcome: 'Discharged · Recall Set',
        clinicalNotes: 'Bi-annual oral examination. Gingival health is excellent. Advised continued use of soft-bristle toothbrush.',
        adminNotes: 'WhatsApp reminder successfully sent 24h prior.',
      },
      {
        date: '12 Mar 2026',
        time: '03:15 PM',
        doctor: 'Dr. Aminu Bello',
        receptionist: 'Chioma Nwosu (Front Desk)',
        procedure: 'Routine Dental Cleaning',
        outcome: 'Treatment Completed',
        clinicalNotes: 'Tartar debridement and polishing. Fluoride gel application.',
        adminNotes: 'Scheduled during afternoon break window.',
      },
    ],
  },
  '+2348076667777': {
    name: 'Zainab Lawal',
    phone: '+234 807 666 7777',
    totalVisits: 3,
    attended: 3,
    lastVisits: [
      {
        date: '12 Jun 2026',
        time: '10:30 AM',
        doctor: 'Dr. Aminu Bello',
        receptionist: 'Chioma Nwosu (Front Desk)',
        procedure: 'Dental Consultation & Fissure Sealant',
        outcome: 'Sealant Applied',
        clinicalNotes: 'Molar fissures sealed with light-cured composite resin. Occlusion checked with articulating paper.',
        adminNotes: 'Pediatric guardian accompanied patient.',
      },
    ],
  },
  '+2348097771234': {
    name: 'Chiamaka Obi',
    phone: '+234 809 777 1234',
    totalVisits: 2,
    attended: 2,
    lastVisits: [
      {
        date: '05 Oct 2026',
        time: '09:30 AM',
        doctor: 'Dr. Aminu Bello',
        receptionist: 'Chioma Nwosu (Front Desk)',
        procedure: 'Dental Consultation',
        outcome: 'Treatment Plan Formulated',
        clinicalNotes: 'Enamel demineralization noted on upper right incisor. Scheduled restorative filling.',
        adminNotes: 'New patient intake documentation completed.',
      },
      {
        date: '15 Aug 2026',
        time: '01:00 PM',
        doctor: 'Dr. Chinelo Okafor',
        receptionist: 'Bisi Alabi (Front Desk)',
        procedure: 'General Health Check-up',
        outcome: 'Discharged',
        clinicalNotes: 'Routine wellness physical. BP 115/75 mmHg, BMI 22.4. Blood work ordered.',
        adminNotes: 'Self-referred via clinic website booking widget.',
      },
    ],
  },
  '+2348035559911': {
    name: 'Ngozi Okonjo',
    phone: '+234 803 555 9911',
    totalVisits: 5,
    attended: 5,
    lastVisits: [
      {
        date: '15 Aug 2026',
        time: '10:00 AM',
        doctor: 'Dr. Aminu Bello',
        receptionist: 'Bisi Alabi (Front Desk)',
        procedure: 'Routine Dental Scaling & Polishing',
        outcome: 'Hygiene Complete · Recall in 6 months',
        clinicalNotes: 'Full mouth periodontal scaling and root planing completed. Sulcus depth normal (<3mm) across all sextants. Advised interdental flossing daily.',
        adminNotes: 'NHIS insurance verified. Front desk cleared check-in with zero waiting delay.',
      },
      {
        date: '10 Jan 2026',
        time: '02:30 PM',
        doctor: 'Dr. Aminu Bello',
        receptionist: 'Chioma Nwosu (Front Desk)',
        procedure: 'Dental Consultation & Digital X-Ray',
        outcome: 'Restoration Treatment Plan Created',
        clinicalNotes: 'Periapical radiograph taken for upper left quadrant. Incipient enamel caries on second premolar. Recommended composite restoration.',
        adminNotes: 'Private billing confirmed. Patient arrived 10 mins early for scheduled intake.',
      },
      {
        date: '18 Nov 2025',
        time: '11:15 AM',
        doctor: 'Dr. Chinelo Okafor',
        receptionist: 'Bisi Alabi (Front Desk)',
        procedure: 'General Health Check-up',
        outcome: 'Vitals Normal · Discharged',
        clinicalNotes: 'Comprehensive wellness review. Blood pressure 118/76 mmHg, resting heart rate 72 bpm. Fasting blood glucose normal (4.8 mmol/L).',
        adminNotes: 'Corporate wellness scheme intake verified by front desk.',
      },
    ],
  },
  '+2348035550192': {
    name: 'Kolawole Adeyemi',
    phone: '+234 803 555 0192',
    totalVisits: 3,
    attended: 3,
    lastVisits: [
      {
        date: '28 Sep 2026',
        time: '03:00 PM',
        doctor: 'Dr. Chinelo Okafor',
        receptionist: 'Bisi Alabi (Front Desk)',
        procedure: 'General Health Check-up & Cardio Screening',
        outcome: 'Cardio Follow-up Scheduled',
        clinicalNotes: 'ECG baseline verified. Mild stage-1 hypertension noted (138/88 mmHg). Dietary sodium counseling provided.',
        adminNotes: 'Prescription for low-dose ACE inhibitor issued and documented in records.',
      },
      {
        date: '10 Jan 2026',
        time: '10:00 AM',
        doctor: 'Dr. Chinelo Okafor',
        receptionist: 'Chioma Nwosu (Front Desk)',
        procedure: 'Annual Physical Examination',
        outcome: 'Screening Complete',
        clinicalNotes: 'Comprehensive baseline evaluation. Spirometry normal, visual acuity 20/20 bilateral.',
        adminNotes: 'Walk-in check-in processed at front desk.',
      },
    ],
  },
  '+2348023334455': {
    name: 'Fatima Bello',
    phone: '+234 802 333 4455',
    totalVisits: 4,
    attended: 4,
    lastVisits: [
      {
        date: '25 Sep 2026',
        time: '11:00 AM',
        doctor: 'Dr. Aminu Bello',
        receptionist: 'Chioma Nwosu (Front Desk)',
        procedure: 'Tooth Extraction & Crown Prep',
        outcome: 'Successful Procedure',
        clinicalNotes: 'Surgical extraction of impacted lower wisdom tooth. Analgesics and amoxicillin prescribed.',
        adminNotes: 'Follow-up suture removal call logged for day 7.',
      },
      {
        date: '15 Jul 2026',
        time: '09:45 AM',
        doctor: 'Dr. Aminu Bello',
        receptionist: 'Bisi Alabi (Front Desk)',
        procedure: 'Dental Crown Fitting',
        outcome: 'Crown Cemented',
        clinicalNotes: 'Zirconia porcelain crown seated on tooth #16. Margins sealed with resin cement. Bite checked.',
        adminNotes: 'Warranty certificate provided to patient.',
      },
    ],
  },
  '+2348124449900': {
    name: 'Kenneth Danjuma',
    phone: '+234 812 444 9900',
    totalVisits: 2,
    attended: 2,
    lastVisits: [
      {
        date: '02 Aug 2026',
        time: '01:30 PM',
        doctor: 'Dr. Chinelo Okafor',
        receptionist: 'Chioma Nwosu (Front Desk)',
        procedure: 'General Health Check-up',
        outcome: 'Lab Tests Requested',
        clinicalNotes: 'Initial health review. Routine fasting lipid panel and HbA1c tests ordered.',
        adminNotes: 'Lab requisition slips generated and handed to patient.',
      },
      {
        date: '10 Jan 2026',
        time: '11:30 AM',
        doctor: 'Dr. Chinelo Okafor',
        receptionist: 'Bisi Alabi (Front Desk)',
        procedure: 'Blood Pressure & Lipid Profile',
        outcome: 'Discharged with Advice',
        clinicalNotes: 'Blood pressure 122/80 mmHg. Total cholesterol 190 mg/dL (desirable range).',
        adminNotes: 'Front desk scheduled 6-month wellness reminder.',
      },
    ],
  },
  '+2348028881902': {
    name: 'Oluwaseun Bakare',
    phone: '+234 802 888 1902',
    totalVisits: 3,
    attended: 3,
    lastVisits: [
      {
        date: '16 Oct 2026',
        time: '11:15 AM',
        doctor: 'Dr. Chinelo Okafor',
        receptionist: 'Chioma Nwosu (Front Desk)',
        procedure: 'General Health Check-up',
        outcome: 'Discharged · Vitals Healthy',
        clinicalNotes: 'Vitals stable (BP 120/80 mmHg, pulse 70). Blood sugar within target range (5.1 mmol/L).',
        adminNotes: 'Patient checked in via Telegram reservation bot.',
      },
      {
        date: '20 Feb 2026',
        time: '02:00 PM',
        doctor: 'Dr. Aminu Bello',
        receptionist: 'Bisi Alabi (Front Desk)',
        procedure: 'Routine Dental Cleaning',
        outcome: 'Oral Hygiene Maintained',
        clinicalNotes: 'Complete prophylaxis with fluoride treatment. Zero active cavities.',
        adminNotes: 'Regular recall adherence logged.',
      },
    ],
  },
  '+2348143337788': {
    name: 'Babajide Sanwo',
    phone: '+234 814 333 7788',
    totalVisits: 4,
    attended: 4,
    lastVisits: [
      {
        date: '22 May 2026',
        time: '02:00 PM',
        doctor: 'Dr. Chinelo Okafor',
        receptionist: 'Bisi Alabi (Front Desk)',
        procedure: 'General Health Check-up',
        outcome: 'Annual Physical Complete',
        clinicalNotes: 'Executive wellness profile complete. All metabolic and cardiac markers within normal limits.',
        adminNotes: 'Executive clinic lounge access noted.',
      },
    ],
  },
  '+2348051116543': {
    name: 'Aisha Mohammed',
    phone: '+234 805 111 6543',
    totalVisits: 2,
    attended: 2,
    lastVisits: [
      {
        date: '04 May 2026',
        time: '11:30 AM',
        doctor: 'Dr. Aminu Bello',
        receptionist: 'Chioma Nwosu (Front Desk)',
        procedure: 'Dental Consultation',
        outcome: 'Prophylaxis Delivered',
        clinicalNotes: 'Tartar debridement and topical fluoride varnish applied.',
        adminNotes: 'Patient satisfied with gentle care.',
      },
    ],
  },
};

export const lookupPatient = (rawPhone, rawName) => {
  if (rawPhone) {
    // 1. Direct key match
    if (PATIENT_REGISTRY[rawPhone]) return PATIENT_REGISTRY[rawPhone];

    const rawClean = String(rawPhone).replace(/\D/g, '');
    const rawCore = rawClean.replace(/^(234|0)/, '');

    for (const [key, p] of Object.entries(PATIENT_REGISTRY)) {
      const keyClean = key.replace(/\D/g, '');
      const keyCore = keyClean.replace(/^(234|0)/, '');
      const recordPhoneClean = p.phone ? String(p.phone).replace(/\D/g, '') : '';
      const recordPhoneCore = recordPhoneClean.replace(/^(234|0)/, '');

      if (
        keyClean === rawClean ||
        recordPhoneClean === rawClean ||
        (rawCore.length >= 7 && (keyCore === rawCore || recordPhoneCore === rawCore)) ||
        (rawCore.length >= 7 && (keyCore.includes(rawCore) || recordPhoneCore.includes(rawCore)))
      ) {
        return p;
      }
    }
  }

  if (rawName) {
    const norm = String(rawName).trim().toLowerCase();
    if (norm.length >= 2) {
      const found = Object.values(PATIENT_REGISTRY).find((p) => {
        const pName = p.name ? p.name.toLowerCase() : '';
        return pName === norm || pName.includes(norm) || norm.includes(pName);
      });
      if (found) return found;
    }
  }

  return null;
};

export const lookupPatientByPhone = (rawPhone) => {
  return lookupPatient(rawPhone, null);
};

/** Pre-seeded realistic past patient archive across 1w, 1m, 3m, 6m ranges */
export const buildPastPatientRecords = () => {
  const DAY_MS = 86400000;
  const now = Date.now();

  return [
    // Today / Recent (1-7 days ago)
    {
      id: 'REC-001',
      appointmentId: 'AP-1035',
      patientName: 'Amina Yusuf',
      patientPhone: '+234 801 234 5678',
      patientType: 'returning',
      doctorName: 'Dr. Bello',
      doctorId: 'doc-bello',
      receptionistName: 'Chioma Nwosu',
      serviceName: 'Tooth Extraction',
      serviceId: 'svc-extract',
      dateStr: '20 Oct 2026',
      isoDate: '2026-10-20',
      timeStr: '10:00 AM',
      timestamp: now - 2 * DAY_MS,
      daysAgo: 2,
      status: 'completed',
      outcome: 'Discharged · Recall Set',
      recallTargetDate: '27 Oct 2026',
      notes: 'Lower molar extraction uncomplicated. Post-op healing check scheduled.',
    },
    {
      id: 'REC-002',
      appointmentId: 'AP-1034',
      patientName: 'Tunde Musa',
      patientPhone: '+234 803 987 6543',
      patientType: 'returning',
      doctorName: 'Dr. Bello',
      doctorId: 'doc-bello',
      receptionistName: 'Bisi Alabi',
      serviceName: 'Dental Consultation',
      serviceId: 'svc-dental',
      dateStr: '18 Oct 2026',
      isoDate: '2026-10-18',
      timeStr: '02:30 PM',
      timestamp: now - 4 * DAY_MS,
      daysAgo: 4,
      status: 'completed',
      outcome: 'Discharged',
      recallTargetDate: '15 Apr 2027',
      notes: 'Routine bi-annual oral exam. Advised scaling and polishing.',
    },
    {
      id: 'REC-003',
      appointmentId: 'AP-1033',
      patientName: 'Oluwaseun Bakare',
      patientPhone: '+234 802 888 1902',
      patientType: 'returning',
      doctorName: 'Dr. Okafor',
      doctorId: 'doc-okafor',
      receptionistName: 'Chioma Nwosu',
      serviceName: 'General Health Check-up',
      serviceId: 'svc-checkup',
      dateStr: '16 Oct 2026',
      isoDate: '2026-10-16',
      timeStr: '11:15 AM',
      timestamp: now - 6 * DAY_MS,
      daysAgo: 6,
      status: 'completed',
      outcome: 'Discharged',
      recallTargetDate: null,
      notes: 'Vitals normal (BP 120/80). Blood sugar within target range.',
    },

    // Last 1 Month (8-30 days ago)
    {
      id: 'REC-004',
      appointmentId: 'AP-1030',
      patientName: 'Chiamaka Obi',
      patientPhone: '+234 809 777 1234',
      patientType: 'new',
      doctorName: 'Dr. Bello',
      doctorId: 'doc-bello',
      receptionistName: 'Chioma Nwosu',
      serviceName: 'Dental Consultation',
      serviceId: 'svc-dental',
      dateStr: '05 Oct 2026',
      isoDate: '2026-10-05',
      timeStr: '09:30 AM',
      timestamp: now - 17 * DAY_MS,
      daysAgo: 17,
      status: 'completed',
      outcome: 'Treatment Plan Formulated',
      recallTargetDate: '22 Oct 2026',
      notes: 'Enamel demineralization noted on upper incisor. Scheduled restoration.',
    },
    {
      id: 'REC-005',
      appointmentId: 'AP-1028',
      patientName: 'Kolawole Adeyemi',
      patientPhone: '+234 803 555 0192',
      patientType: 'returning',
      doctorName: 'Dr. Okafor',
      doctorId: 'doc-okafor',
      receptionistName: 'Bisi Alabi',
      serviceName: 'General Health Check-up',
      serviceId: 'svc-checkup',
      dateStr: '28 Sep 2026',
      isoDate: '2026-09-28',
      timeStr: '03:00 PM',
      timestamp: now - 24 * DAY_MS,
      daysAgo: 24,
      status: 'completed',
      outcome: 'Cardio Follow-up',
      recallTargetDate: '28 Dec 2026',
      notes: 'ECG baseline verified. Dietary counseling given for mild hypertension.',
    },
    {
      id: 'REC-006',
      appointmentId: 'AP-1025',
      patientName: 'Fatima Bello',
      patientPhone: '+234 802 333 4455',
      patientType: 'returning',
      doctorName: 'Dr. Bello',
      doctorId: 'doc-bello',
      receptionistName: 'Chioma Nwosu',
      serviceName: 'Tooth Extraction',
      serviceId: 'svc-extract',
      dateStr: '25 Sep 2026',
      isoDate: '2026-09-25',
      timeStr: '11:00 AM',
      timestamp: now - 27 * DAY_MS,
      daysAgo: 27,
      status: 'completed',
      outcome: 'Successful Procedure',
      recallTargetDate: '02 Oct 2026',
      notes: 'Extraction of impacted wisdom tooth. Analgesics and antibiotics prescribed.',
    },

    // Last 3 Months (31-90 days ago)
    {
      id: 'REC-007',
      appointmentId: 'AP-1019',
      patientName: 'Ngozi Okonjo',
      patientPhone: '+234 803 555 9911',
      patientType: 'returning',
      doctorName: 'Dr. Bello',
      doctorId: 'doc-bello',
      receptionistName: 'Bisi Alabi',
      serviceName: 'Dental Consultation',
      serviceId: 'svc-dental',
      dateStr: '15 Aug 2026',
      isoDate: '2026-08-15',
      timeStr: '10:00 AM',
      timestamp: now - 68 * DAY_MS,
      daysAgo: 68,
      status: 'completed',
      outcome: 'Routine Hygiene Completed',
      recallTargetDate: '15 Feb 2027',
      notes: 'Scaling and root planing performed. Excellent periodontal health.',
    },
    {
      id: 'REC-008',
      appointmentId: 'AP-1014',
      patientName: 'Kenneth Danjuma',
      patientPhone: '+234 812 444 9900',
      patientType: 'new',
      doctorName: 'Dr. Okafor',
      doctorId: 'doc-okafor',
      receptionistName: 'Chioma Nwosu',
      serviceName: 'General Health Check-up',
      serviceId: 'svc-checkup',
      dateStr: '02 Aug 2026',
      isoDate: '2026-08-02',
      timeStr: '01:30 PM',
      timestamp: now - 81 * DAY_MS,
      daysAgo: 81,
      status: 'completed',
      outcome: 'Lab Tests Requested',
      recallTargetDate: null,
      notes: 'Initial health review. Routine lipid panel and fasting glucose ordered.',
    },
    {
      id: 'REC-009',
      appointmentId: 'AP-1009',
      patientName: 'Ibrahim Sani',
      patientPhone: '+234 805 555 0101',
      patientType: 'returning',
      doctorName: 'Dr. Bello',
      doctorId: 'doc-bello',
      receptionistName: 'Bisi Alabi',
      serviceName: 'Dental Consultation',
      serviceId: 'svc-dental',
      dateStr: '20 Jul 2026',
      isoDate: '2026-07-20',
      timeStr: '09:00 AM',
      timestamp: now - 94 * DAY_MS,
      daysAgo: 94,
      status: 'completed',
      outcome: 'Discharged',
      recallTargetDate: '20 Jan 2027',
      notes: 'Routine cleaning. Gingival inflammation resolved.',
    },

    // Last 6 Months (91-180 days ago)
    {
      id: 'REC-010',
      appointmentId: 'AP-0988',
      patientName: 'Zainab Lawal',
      patientPhone: '+234 807 666 7777',
      patientType: 'returning',
      doctorName: 'Dr. Bello',
      doctorId: 'doc-bello',
      receptionistName: 'Chioma Nwosu',
      serviceName: 'Dental Consultation',
      serviceId: 'svc-dental',
      dateStr: '12 Jun 2026',
      isoDate: '2026-06-12',
      timeStr: '10:30 AM',
      timestamp: now - 132 * DAY_MS,
      daysAgo: 132,
      status: 'completed',
      outcome: 'Dental Sealant Applied',
      recallTargetDate: '12 Dec 2026',
      notes: 'Molar fissures sealed. Preventative oral care guidance provided.',
    },
    {
      id: 'REC-011',
      appointmentId: 'AP-0975',
      patientName: 'Babajide Sanwo',
      patientPhone: '+234 814 333 7788',
      patientType: 'returning',
      doctorName: 'Dr. Okafor',
      doctorId: 'doc-okafor',
      receptionistName: 'Bisi Alabi',
      serviceName: 'General Health Check-up',
      serviceId: 'svc-checkup',
      dateStr: '22 May 2026',
      isoDate: '2026-05-22',
      timeStr: '02:00 PM',
      timestamp: now - 153 * DAY_MS,
      daysAgo: 153,
      status: 'completed',
      outcome: 'Annual Physical Complete',
      recallTargetDate: '22 May 2027',
      notes: 'Executive wellness profile complete. All organ markers healthy.',
    },
    {
      id: 'REC-012',
      appointmentId: 'AP-0960',
      patientName: 'Aisha Mohammed',
      patientPhone: '+234 805 111 6543',
      patientType: 'returning',
      doctorName: 'Dr. Bello',
      doctorId: 'doc-bello',
      receptionistName: 'Chioma Nwosu',
      serviceName: 'Dental Consultation',
      serviceId: 'svc-dental',
      dateStr: '04 May 2026',
      isoDate: '2026-05-04',
      timeStr: '11:30 AM',
      timestamp: now - 171 * DAY_MS,
      daysAgo: 171,
      status: 'completed',
      outcome: 'Prophylaxis Delivered',
      recallTargetDate: '04 Nov 2026',
      notes: 'Tartar removal and fluoride varnish applied.',
    },

    // Explicit Archive Records for Specific Dates (e.g. 10th of January 2026)
    {
      id: 'REC-013',
      appointmentId: 'AP-0890',
      patientName: 'Ngozi Okonjo',
      patientPhone: '+234 803 555 9911',
      patientType: 'returning',
      doctorName: 'Dr. Bello',
      doctorId: 'doc-bello',
      receptionistName: 'Chioma Nwosu',
      serviceName: 'Dental Consultation & Digital X-Ray',
      serviceId: 'svc-dental',
      dateStr: '10 Jan 2026',
      isoDate: '2026-01-10',
      timeStr: '02:30 PM',
      timestamp: new Date('2026-01-10T14:30:00').getTime(),
      daysAgo: 285,
      status: 'completed',
      outcome: 'Treatment Plan Formulated',
      recallTargetDate: '15 Aug 2026',
      notes: 'Periapical radiograph taken for upper left quadrant. Incipient enamel caries on second premolar.',
    },
    {
      id: 'REC-014',
      appointmentId: 'AP-0891',
      patientName: 'Kolawole Adeyemi',
      patientPhone: '+234 803 555 0192',
      patientType: 'returning',
      doctorName: 'Dr. Okafor',
      doctorId: 'doc-okafor',
      receptionistName: 'Chioma Nwosu',
      serviceName: 'Annual Physical Examination',
      serviceId: 'svc-checkup',
      dateStr: '10 Jan 2026',
      isoDate: '2026-01-10',
      timeStr: '10:00 AM',
      timestamp: new Date('2026-01-10T10:00:00').getTime(),
      daysAgo: 285,
      status: 'completed',
      outcome: 'Screening Complete',
      recallTargetDate: '28 Sep 2026',
      notes: 'Comprehensive baseline evaluation. Spirometry normal, visual acuity 20/20 bilateral.',
    },
    {
      id: 'REC-015',
      appointmentId: 'AP-0892',
      patientName: 'Kenneth Danjuma',
      patientPhone: '+234 812 444 9900',
      patientType: 'returning',
      doctorName: 'Dr. Okafor',
      doctorId: 'doc-okafor',
      receptionistName: 'Bisi Alabi',
      serviceName: 'Blood Pressure & Lipid Profile',
      serviceId: 'svc-checkup',
      dateStr: '10 Jan 2026',
      isoDate: '2026-01-10',
      timeStr: '11:30 AM',
      timestamp: new Date('2026-01-10T11:30:00').getTime(),
      daysAgo: 285,
      status: 'completed',
      outcome: 'Discharged with Advice',
      recallTargetDate: '02 Aug 2026',
      notes: 'Blood pressure 122/80 mmHg. Total cholesterol 190 mg/dL within desirable range.',
    },
  ];
};
