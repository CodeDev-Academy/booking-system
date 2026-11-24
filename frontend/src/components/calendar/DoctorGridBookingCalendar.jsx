import React, { useState, useMemo } from 'react';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Shield,
  Calendar as CalendarIcon,
  Coffee,
  Plus,
  CalendarDays,
  AlertTriangle,
} from 'lucide-react';
import {
  clinicParts,
  clinicDayKey,
  clinicDayStartOfParts,
  clinicDayStartOffset,
  clinicTimeLabel,
  daysInClinicMonth,
  clinicMondayFirstWeekdayIdx,
} from '../../services/clinicTimeService';
import { useCalendarStore } from '../../stores/useCalendarStore';
import { useStaffStore } from '../../stores/useStaffStore';
import { EmergencyDisruptionModal } from './EmergencyDisruptionModal';
import { LeavePlannerModal } from './LeavePlannerModal';
import { StrandedPatientsPanel } from './StrandedPatientsPanel';
import { DoubleBookingAlert, DoubleBookingCountChip } from './DoubleBookingAlert';
import { useDoubleBookingAlert } from '../../hooks/useDoubleBookingAlert';
import '../../styles/components/grid-booking-calendar.css';

// Wave 3 / Step 3.1: "today" is the CLINIC's today (server-synced Africa/Lagos),
// not the visitor's calendar date. The returned value is an instant anchored at
// clinic midnight; every read of it goes through clinicParts().
const getInitialToday = () => new Date(clinicDayStartOffset(0));

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_NAMES_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const isVisitBlock = (b) => b.type === 'appointment' || b.type === 'hold';

// "12:30" -> 750. Minutes since midnight are the only way to compare a saved
// clock value with a 12-hour agenda label.
const minutesFromHHMM = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
};

// 750 -> "12:30 PM", the label style the agenda already uses.
const labelFromHHMM = (hhmm) => {
  const mins = minutesFromHHMM(hhmm);
  if (mins === null) return '';
  const h24 = Math.floor(mins / 60) % 24;
  const mm = String(mins % 60).padStart(2, '0');
  const suffix = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${String(h12).padStart(2, '0')}:${mm} ${suffix}`;
};

// "12:30 PM" -> 750. Tolerates the narrow no-break space some engines put
// between the clock and AM/PM.
const minutesFromLabel = (label) => {
  const m = /^(\d{1,2}):(\d{2})\s*([AP]M)$/i.exec(String(label || '').trim());
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (m[3].toUpperCase() === 'PM') h += 12;
  return h * 60 + Number(m[2]);
};

/**
 * One agenda row from one real store block. Both the day list and the week
 * overview use this, so a patient's time, phone and service read the same
 * wherever the receptionist looks. Nothing here is invented: a missing value
 * stays missing instead of falling back to a demo patient.
 */
const toAgendaRow = (b) => ({
  id: b.appointmentId || b.id,
  appointmentId: b.appointmentId || b.id,
  time: `${clinicTimeLabel(b.start)} – ${clinicTimeLabel(b.end)}`,
  patientName: b.patientName,
  patientPhone: b.patientPhone,
  phone: b.patientPhone,
  type: b.patientType || 'new',
  serviceId: b.serviceId,
  serviceName: b.serviceName,
  service: b.serviceName || 'Consultation',
  doctorId: b.doctorId,
  doctorName: b.doctorName,
  status: b.status || 'confirmed',
  bufferMin: b.bufferMin || 10,
  start: b.start,
  end: b.end,
  isDynamic: true,
});

const DEFAULT_TIME_SLOTS = [
  '08:30 AM',
  '09:00 AM',
  '09:30 AM',
  '10:00 AM',
  '10:30 AM',
  '11:00 AM',
  '11:30 AM',
  '12:00 PM',
  '01:30 PM',
  '02:00 PM',
  '02:30 PM',
  '03:00 PM',
  '03:30 PM',
  '04:00 PM',
  '04:30 PM',
  '05:00 PM',
];

/**
 * DoctorGridBookingCalendar — Master Bento Grid Booking & Schedule Hub
 * Faithful recreation of the uploaded healthcare design reference:
 * - Top Search & Location Bar + Interactive Receptionist Profile
 * - Category filter pills based on real clinic settings (Dental, Family Medicine, Surgery, Eye, ENT)
 * - Column 1: Choose Doctor
 * - Column 2: Doctor Schedule & Timetable Agenda (Day Agenda & Week Overview)
 * - Column 3: Calendar Date Picker & Visit Hours Time Slots Grid + Book Action Button
 */
export const DoctorGridBookingCalendar = ({
  calendarData,
  onOpenWalkInBooking,
  onSelectAppointment,
  onReleaseHold,
  onAdmitAppointment,
}) => {
  const calendarDoctors = useCalendarStore((state) => state.doctors);
  const leavePeriods = useCalendarStore((state) => state.leavePeriods);
  const staffList = useStaffStore((state) => state.staffList);
  // Risk R-15 disruption cockpit: state + actions for the one-click
  // emergency-leave resolver (modal renders at the end of this component).
  const disruptionModal = useCalendarStore((state) => state.disruptionModal);
  const openDisruptionModal = useCalendarStore((state) => state.openDisruptionModal);
  const closeDisruptionModal = useCalendarStore((state) => state.closeDisruptionModal);
  const reassignToColleague = useCalendarStore((state) => state.reassignToColleague);
  const autoResolveDisruption = useCalendarStore((state) => state.autoResolveDisruption);
  const setLeaveWindow = useCalendarStore((state) => state.setLeaveWindow);
  const setLeaveKind = useCalendarStore((state) => state.setLeaveKind);
  const previewDisruptionPlan = useCalendarStore((state) => state.previewDisruptionPlan);
  const setDistributionMode = useCalendarStore((state) => state.setDistributionMode);
  const toggleColleagueChoice = useCalendarStore((state) => state.toggleColleagueChoice);
  const chooseSingleColleague = useCalendarStore((state) => state.chooseSingleColleague);
  const setColleagueCap = useCalendarStore((state) => state.setColleagueCap);
  const restoreDoctorDuty = useCalendarStore((state) => state.restoreDoctorDuty);

  // Leave lifecycle / Step 2 — planned leave has its own form, apart from the
  // emergency cockpit (a quiet future window needs no patient moves).
  const leavePlanner = useCalendarStore((state) => state.leavePlanner);
  const openLeavePlanner = useCalendarStore((state) => state.openLeavePlanner);
  const closeLeavePlanner = useCalendarStore((state) => state.closeLeavePlanner);
  const addDoctorLeave = useCalendarStore((state) => state.addDoctorLeave);
  const removeDoctorLeave = useCalendarStore((state) => state.removeDoctorLeave);
  const endTodayLeaveFromPlanner = useCalendarStore(
    (state) => state.endTodayLeaveFromPlanner
  );

  // Step 3 — stranded queue + undo of the last distribution.
  const stranded = useCalendarStore((state) => state.stranded);
  const strandedPanelOpen = useCalendarStore((state) => state.strandedPanelOpen);
  const openStrandedPanel = useCalendarStore((state) => state.openStrandedPanel);
  const closeStrandedPanel = useCalendarStore((state) => state.closeStrandedPanel);
  const loadStranded = useCalendarStore((state) => state.loadStranded);
  const lastDistribution = useCalendarStore((state) => state.lastDistribution);
  const undoingDistribution = useCalendarStore((state) => state.undoingDistribution);
  const undoLastDistribution = useCalendarStore((state) => state.undoLastDistribution);
const moveStrandedPatient = useCalendarStore((state) => state.moveStrandedPatient);
const movingStrandedId = useCalendarStore((state) => state.movingStrandedId);

  // Item C — red double-booking alert. Polls the backend every 10s; the
  // overlay + red chip stay until the clash is fixed.
  const doubleBookingAlert = useDoubleBookingAlert();

  // Colleague options for the disruption modal (on-duty doctors only) — filled
  // in below, once the timetable's selected day is known. An empty roster
  // stays empty: the grid shows an honest "no doctors" state instead of
  // inventing a dentist the clinic never hired.
  const doctors = useMemo(() => {
    if (calendarDoctors && calendarDoctors.length > 0) return calendarDoctors;
    const staffDocs = staffList.filter((s) => s.role === 'doctor');
    if (staffDocs.length > 0) {
      return staffDocs.map((s) => ({
        id: s.id,
        name: s.name,
        specialty: s.specialty || 'General Practice',
        avatar: s.avatar || s.name.slice(0, 2).toUpperCase(),
        isOnDuty: s.status === 'on_duty',
      }));
    }
    return [];
  }, [calendarDoctors, staffList]);

  // View States
  const [selectedSpecialty, setSelectedSpecialty] = useState('All Specialties');
  const [searchDoctorQuery, setSearchDoctorQuery] = useState('');
  const [selectedDoctorId, setSelectedDoctorId] = useState(() => doctors[0]?.id || null);
  const [timetableHorizon, setTimetableHorizon] = useState('day'); // 'day' | 'week'
  const [selectedTimeSlot, setSelectedTimeSlot] = useState('11:30 AM');

  // Dynamic Date Engine — anchored to the clinic clock, never the device.
  const [selectedDate, setSelectedDate] = useState(() => getInitialToday());
  const [currentMonthDate, setCurrentMonthDate] = useState(() => {
    const today = clinicParts(getInitialToday().getTime());
    return new Date(clinicDayStartOfParts(today.year, today.monthIdx, 1));
  });

  // Date Properties — read in CLINIC time. The old device-local reads
  // (getFullYear/getMonth/getDate/getDay) shifted on any computer outside
  // West Africa time, marking the wrong day as "today".
  const selectedParts = clinicParts(selectedDate.getTime());
  const selectedYear = selectedParts.year;
  const selectedMonthIdx = selectedParts.monthIdx;
  const selectedDayNumber = selectedParts.day;
  const selectedDayName = selectedParts.weekdayName;
  const selectedDayKey = selectedParts.dayKey;
  const selectedMonthName = MONTH_NAMES[selectedMonthIdx];

  // The day the timetable is showing decides who is off. A dated leave period
  // only blocks its own dates, so stepping to another day brings the doctor
  // back without a refetch. When the backend has no periods for a doctor, the
  // older boolean (whole-day leave flag) still applies.
  const doctorsOnSelectedDay = useMemo(() => {
    if (!leavePeriods || Object.keys(leavePeriods).length === 0) return doctors;
    // The day the timetable is showing, as a CLINIC-midnight instant — the
    // leave periods from the backend are anchored to the same clock.
    const dayKey = clinicDayStartOfParts(selectedParts.year, selectedParts.monthIdx, selectedParts.day);

    return doctors.map((doc) => {
      const periods = leavePeriods[doc.id];
      if (!periods) return doc;
      const covering = periods.find((p) => dayKey >= p.start && dayKey <= p.end);
      return {
        ...doc,
        isOnDuty: !covering,
        isEmergencyLeave: Boolean(covering),
        emergencyReason: covering?.reason || null,
      };
    });
  }, [doctors, leavePeriods, selectedParts.year, selectedParts.monthIdx, selectedParts.day]);

  // Colleague options for the disruption modal: on duty on the viewed day and
  // not the doctor going on leave.
  const availableColleagues = useMemo(() => {
    if (!disruptionModal.doctorId) return [];
    return doctorsOnSelectedDay.filter(
      (d) => d.id !== disruptionModal.doctorId && d.isOnDuty && !d.isEmergencyLeave
    );
  }, [doctorsOnSelectedDay, disruptionModal.doctorId]);

  // Month Calendar Grid Calculation — read in clinic time, built from pure
  // date math that no timezone can shift.
  const monthAnchor = clinicParts(currentMonthDate.getTime());
  const calendarYear = monthAnchor.year;
  const calendarMonthIdx = monthAnchor.monthIdx;
  const calendarMonthLabel = `${MONTH_NAMES[calendarMonthIdx]} ${calendarYear}`;

  const daysInMonth = daysInClinicMonth(calendarYear, calendarMonthIdx);
  // Monday start: 0 = Mon, 6 = Sun
  const firstDayOfWeekIdx = clinicMondayFirstWeekdayIdx(calendarYear, calendarMonthIdx);

  // Month Navigation Handlers (Infinite past and future navigation)
  const handlePrevMonth = () => {
    const prev = calendarMonthIdx === 0 ? { year: calendarYear - 1, monthIdx: 11 } : { year: calendarYear, monthIdx: calendarMonthIdx - 1 };
    setCurrentMonthDate(new Date(clinicDayStartOfParts(prev.year, prev.monthIdx, 1)));
  };

  const handleNextMonth = () => {
    const next = calendarMonthIdx === 11 ? { year: calendarYear + 1, monthIdx: 0 } : { year: calendarYear, monthIdx: calendarMonthIdx + 1 };
    setCurrentMonthDate(new Date(clinicDayStartOfParts(next.year, next.monthIdx, 1)));
  };

  // Day Navigation Handlers (Step day-by-day or jump to today) — stepped on
  // clinic date components, never by adding milliseconds to an instant.
  const stepSelectedDay = (deltaDays) => {
    const nextMs = clinicDayStartOfParts(
      selectedParts.year, selectedParts.monthIdx, selectedParts.day + deltaDays
    );
    const nextParts = clinicParts(nextMs);
    setSelectedDate(new Date(nextMs));
    setCurrentMonthDate(new Date(clinicDayStartOfParts(nextParts.year, nextParts.monthIdx, 1)));
  };

  const handlePrevDay = () => stepSelectedDay(-1);

  const handleNextDay = () => stepSelectedDay(1);

  const handleGoToToday = () => {
    setSelectedDate(getInitialToday());
    const today = clinicParts(clinicDayStartOffset(0));
    setCurrentMonthDate(new Date(clinicDayStartOfParts(today.year, today.monthIdx, 1)));
  };

  const handleSelectCalendarDay = (dayNum) => {
    const nextMs = clinicDayStartOfParts(calendarYear, calendarMonthIdx, dayNum);
    setSelectedDate(new Date(nextMs));
  };

  // Filtered doctors
  const filteredDoctors = useMemo(() => {
    return doctorsOnSelectedDay.filter((doc) => {
      const q = searchDoctorQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        doc.name.toLowerCase().includes(q) ||
        (doc.specialty && doc.specialty.toLowerCase().includes(q));

      if (!matchSearch) return false;

      // The tabs are built from the doctors on the selected day, so the match
      // is exact — a tab that shows every doctor would be a filter that lies.
      if (selectedSpecialty === 'All Specialties') return true;
      return (doc.specialty || '') === selectedSpecialty;
    });
  }, [doctorsOnSelectedDay, searchDoctorQuery, selectedSpecialty]);

  // Active selected doctor
  const currentDoctor = useMemo(() => {
    return (
      doctorsOnSelectedDay.find((d) => d.id === selectedDoctorId) ||
      filteredDoctors[0] ||
      doctorsOnSelectedDay[0]
    );
  }, [doctorsOnSelectedDay, selectedDoctorId, filteredDoctors]);

  // "View in calendar" from the red alert: jump to the overlapping day and
  // select the clashing doctor's column, then step the overlay aside. The red
  // chip stays until the clash itself is gone.
  const handleViewDoubleBooking = () => {
    const conflict = doubleBookingAlert.primaryConflict;
    if (!conflict) return;
    const start = new Date(conflict.overlap_start || conflict.appointment_a?.start);
    if (!Number.isNaN(start.getTime())) {
      const startParts = clinicParts(start.getTime());
      setSelectedDate(new Date(clinicDayStartOfParts(startParts.year, startParts.monthIdx, startParts.day)));
      setCurrentMonthDate(new Date(clinicDayStartOfParts(startParts.year, startParts.monthIdx, 1)));
    }
    setTimetableHorizon('day');

    const doctorName = String(conflict.doctor_name || '').toLowerCase();
    const match = doctors.find((doc) => {
      if (doc.id === conflict.doctor_id) return true;
      const tokens = String(doc.name || '')
        .toLowerCase()
        .replace(/^dr\.?\s+/, '')
        .split(/\s+/);
      return tokens.some((token) => token.length > 2 && doctorName.includes(token));
    });
    if (match) setSelectedDoctorId(match.id);

    doubleBookingAlert.silence();
  };

  // Subscribe to live calendar blocks for real-time walk-in reflection
  const storeBlocks = useCalendarStore((state) => state.blocks) || [];
  // The clinic's real lunch break, from the same schedule sync. null means the
  // feed has not answered yet, or the clinic has no break configured.
  const clinicLunch = useCalendarStore((state) => state.clinicLunch) || null;
  // A break whose end is not after its start is NO break (a clinic can clear
  // it by setting both clocks the same). Drawing "12:15 until 12:15" would
  // promise a rest window that does not exist.
  const hasClinicLunch =
    Boolean(clinicLunch?.start && clinicLunch?.end) &&
    minutesFromHHMM(clinicLunch.end) > minutesFromHHMM(clinicLunch.start);
  // T-786: the real emergency reserve rows from the same schedule sync.
  const reserveSlots = useCalendarStore((state) => state.reserveSlots) || [];

  // Helper to format block time e.g. "09:30 AM" — in CLINIC time. The old
  // device-locale formatting renamed 09:00 to 04:00 the moment the site was
  // opened from another timezone.
  const formatSlotTime = (ts) => clinicTimeLabel(ts);

  // Day appointments for the active doctor — REAL store blocks only. The old
  // version merged in a hardcoded demo week, so a real doctor's day showed
  // invented patients the clinic never booked.
  const activeDayAppointments = useMemo(() => {
    return storeBlocks
      .filter(
        (b) =>
          b.doctorId === currentDoctor?.id &&
          isVisitBlock(b) &&
          clinicDayKey(b.start) === selectedDayKey
      )
      .map(toAgendaRow)
      // Sort by the real timestamp. The labels are 12-hour text, so comparing
      // them put "01:30 PM" before "09:00 AM".
      .sort((a, b) => a.start - b.start);
  }, [selectedDayKey, storeBlocks, currentDoctor]);

  // T-786: the real reserve rows for the selected day and doctor. A clinic-wide
  // reserve (no doctor) applies to every lane; a doctor-specific one only to
  // that doctor. Nothing here is invented — an empty list means no reserve.
  const dayReserves = useMemo(() => {
    return reserveSlots.filter(
      (r) =>
        r.date === selectedDayKey &&
        (!r.doctor_id || r.doctor_id === currentDoctor?.id)
    );
  }, [reserveSlots, selectedDayKey, currentDoctor]);

  // One sorted timeline for the day: real appointments, the real lunch break
  // and the real reserve slots, each at its saved clock position. The lunch
  // and reserve cards used to be glued after the last appointment.
  const dayTimeline = useMemo(() => {
    const items = activeDayAppointments.map((apt) => {
      const parts = clinicParts(apt.start);
      return {
        kind: 'appointment',
        minutes: parts.hour * 60 + parts.minute,
        apt,
      };
    });
    const hasLunch = hasClinicLunch && selectedDayName !== 'Sunday';
    if (hasLunch) {
      const lunchMinutes = minutesFromHHMM(clinicLunch.start);
      if (lunchMinutes !== null) items.push({ kind: 'lunch', minutes: lunchMinutes });
    }
    dayReserves.forEach((r) => {
      const minutes = minutesFromHHMM(r.start_time);
      if (minutes !== null) items.push({ kind: 'reserve', minutes, reserve: r });
    });
    return items.sort((a, b) => a.minutes - b.minutes);
  }, [activeDayAppointments, clinicLunch, hasClinicLunch, selectedDayName, dayReserves]);

  // The clinic week that contains the selected day, Monday first. Every date
  // comes from the clinic clock; every visit comes from the store. The old
  // panel hardcoded "Oct 26-31" and opened 2026-10-26 for any doctor.
  const weekRange = useMemo(() => {
    const mondayFirstIdx = (selectedParts.weekdayIdx + 6) % 7;
    const startMs = clinicDayStartOfParts(
      selectedParts.year,
      selectedParts.monthIdx,
      selectedParts.day - mondayFirstIdx
    );
    return { mondayFirstIdx, startMs };
  }, [selectedParts.year, selectedParts.monthIdx, selectedParts.day, selectedParts.weekdayIdx]);

  const weekDays = useMemo(() => {
    const visits = storeBlocks.filter(
      (b) => b.doctorId === currentDoctor?.id && isVisitBlock(b)
    );
    // Monday through Sunday: a real seven-day week, matching the "7-Day
    // Overview" label. The old panel showed six invented days, so Sunday's
    // real visits (and any walk-in that day) had nowhere to appear.
    return Array.from({ length: 7 }, (_, idx) => {
      const startMs = clinicDayStartOfParts(
        selectedParts.year,
        selectedParts.monthIdx,
        selectedParts.day - weekRange.mondayFirstIdx + idx
      );
      const parts = clinicParts(startMs);
      const rows = visits
        .filter((b) => clinicDayKey(b.start) === parts.dayKey)
        .map(toAgendaRow)
        .sort((a, b) => a.start - b.start);
      return {
        key: parts.dayKey,
        startMs,
        weekdayName: parts.weekdayName,
        label: `${MONTH_NAMES[parts.monthIdx].slice(0, 3)} ${parts.day}`,
        rows,
      };
    });
  }, [
    storeBlocks,
    currentDoctor,
    selectedParts.year,
    selectedParts.monthIdx,
    selectedParts.day,
    weekRange.mondayFirstIdx,
  ]);

  // Visits shown on a doctor's card = real blocks inside the visible week.
  const weekEndMs = clinicDayStartOfParts(
    selectedParts.year,
    selectedParts.monthIdx,
    selectedParts.day - weekRange.mondayFirstIdx + 7
  );
  const countWeekVisits = (doctorId) =>
    storeBlocks.filter(
      (b) =>
        b.doctorId === doctorId &&
        isVisitBlock(b) &&
        b.start >= weekRange.startMs &&
        b.start < weekEndMs
    ).length;

  // Check if slot is booked for this doctor (Real-Time Synchronized)
  const getSlotDetails = (slotStr) => {
    const apt = activeDayAppointments.find((a) => a.time.includes(slotStr));
    if (apt) {
      return { isBooked: true, patientName: apt.patientName, type: 'appointment' };
    }
    // Also check raw storeBlocks for direct time match
    const matchingBlock = storeBlocks.find((b) => {
      if (b.doctorId !== currentDoctor?.id) return false;
      if (b.type !== 'appointment' && b.type !== 'hold') return false;
      const bDate = new Date(b.start);
      if (
        bDate.getFullYear() !== selectedYear ||
        bDate.getMonth() !== selectedMonthIdx ||
        bDate.getDate() !== selectedDayNumber
      ) {
        return false;
      }
      return formatSlotTime(b.start) === slotStr;
    });

    if (matchingBlock) {
      return { isBooked: true, patientName: matchingBlock.patientName, type: 'appointment' };
    }

    // The lunch window shown here is the one the booking engine enforces.
    // Before, the grid painted 12:00-12:30 regardless of the saved setting.
    if (hasClinicLunch) {
      const slotMin = minutesFromLabel(slotStr);
      const lunchStart = minutesFromHHMM(clinicLunch.start);
      const lunchEnd = minutesFromHHMM(clinicLunch.end);
      if (
        slotMin !== null &&
        lunchStart !== null &&
        lunchEnd !== null &&
        slotMin >= lunchStart &&
        slotMin < lunchEnd
      ) {
        return { isBooked: true, label: 'Lunch', type: 'lunch' };
      }
    }
    // T-786: a reserve window comes from the real rows, not a fixed 01:30 PM.
    const slotMin = minutesFromLabel(slotStr);
    if (slotMin !== null) {
      const inReserve = dayReserves.some((r) => {
        const rs = minutesFromHHMM(r.start_time);
        const re = minutesFromHHMM(r.end_time);
        return rs !== null && re !== null && slotMin >= rs && slotMin < re;
      });
      if (inReserve) {
        return { isBooked: false, isReserve: true, label: 'Reserve' };
      }
    }
    return { isBooked: false, type: 'free' };
  };

  // Trigger Walk-In Modal
  const handleBookNow = () => {
    if (onOpenWalkInBooking) {
      onOpenWalkInBooking(currentDoctor?.id, selectedDate, selectedTimeSlot);
    }
  };

  const activeSpecialties = useMemo(() => {
    const specs = Array.from(
      new Set((doctorsOnSelectedDay || []).map((d) => d.specialty).filter(Boolean))
    );
    return ['All Specialties', ...specs];
  }, [doctorsOnSelectedDay]);

  return (
    <div className="grid-booking-container">
      {/* Compact Schedule Toolbar: Search + Real Specialties + Month Navigation */}
      <div
        className="grid-booking-title-row"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap',
          marginBottom: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'var(--surface-1)',
              border: '1px solid var(--line)',
              borderRadius: 'var(--radius-sm)',
              padding: '5px 10px',
              minWidth: '210px',
            }}
          >
            <Search size={14} color="var(--text-3)" />
            <input
              type="text"
              placeholder="Filter doctors or specialty..."
              value={searchDoctorQuery}
              onChange={(e) => setSearchDoctorQuery(e.target.value)}
              style={{
                border: 'none',
                outline: 'none',
                background: 'transparent',
                fontSize: '12px',
                color: 'var(--text)',
                width: '100%',
              }}
            />
          </div>

          {activeSpecialties.length > 2 && (
            <div className="segmented-tabs" role="tablist" aria-label="Filter by specialty">
              {activeSpecialties.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  role="tab"
                  aria-selected={selectedSpecialty === cat}
                  className={`segmented-tab-btn ${selectedSpecialty === cat ? 'active' : ''}`}
                  onClick={() => setSelectedSpecialty(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <DoubleBookingCountChip
            count={doubleBookingAlert.count}
            onReopen={doubleBookingAlert.reopen}
          />

          <div className="grid-booking-nav-arrows">
            <button
              type="button"
              className="nav-arrow-circle-btn"
              title="Previous Month"
              onClick={handlePrevMonth}
            >
              <ChevronLeft size={15} />
            </button>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
              {calendarMonthLabel}
            </span>
            <button
              type="button"
              className="nav-arrow-circle-btn"
              title="Next Month"
              onClick={handleNextMonth}
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* Step 3 — who still has no slot, and an honest undo of the last plan. */}
      {stranded.count > 0 && (
        <div className="stranded-strip">
          <span className="stranded-strip-count tabular-nums">
            {stranded.count}
          </span>
          <span className="stranded-strip-text">
            patient{stranded.count === 1 ? '' : 's'} still booked under a doctor
            on leave
          </span>
          <span className="stranded-strip-hint">
            Nobody here has been messaged; each row says why they could not be
            placed.
          </span>
          <button
            type="button"
            className="btn-base btn-secondary stranded-strip-action"
            onClick={openStrandedPanel}
          >
            Review patients
          </button>
        </div>
      )}

      {lastDistribution && (
        <div className="plan-undo-strip">
          <span className="stranded-strip-text">
            Last plan: {lastDistribution.doctorName}
            {typeof lastDistribution.placedCount === 'number'
              ? ` · ${lastDistribution.placedCount} moved`
              : ''}
            {typeof lastDistribution.unplacedCount === 'number' &&
            lastDistribution.unplacedCount > 0
              ? ` · ${lastDistribution.unplacedCount} still without a slot`
              : ''}
          </span>
          {lastDistribution.canUndo ? (
            <button
              type="button"
              className="plan-undo-btn"
              onClick={undoLastDistribution}
              disabled={undoingDistribution}
            >
              {undoingDistribution ? 'Undoing…' : 'Undo this plan'}
            </button>
          ) : (
            <span className="plan-undo-why">{lastDistribution.undoReason}</span>
          )}
        </div>
      )}

      {/* 4. Three-Column Bento Grid Layout */}
      <div className="grid-booking-bento-layout">
        {/* ==================================================================
            Column 1: Choose Doctor (Cards List)
            ================================================================== */}
        <div className="column-choose-doctor">
          <div className="column-section-title">Choose Doctor</div>

          {doctors.length === 0 ? (
            <div className="doctor-roster-empty">
              <strong>No doctors on the roster yet.</strong>
              <span>
                Add a doctor in Staff &amp; Reports, then this grid will show their real
                appointments.
              </span>
            </div>
          ) : filteredDoctors.map((doc) => {
            const isSelected = doc.id === currentDoctor?.id;
            const weekApptsCount = countWeekVisits(doc.id);

            return (
              <div
                key={doc.id}
                className={`doctor-select-card ${isSelected ? 'selected' : ''}`}
                onClick={() => setSelectedDoctorId(doc.id)}
                role="button"
                tabIndex={0}
                style={doc.isEmergencyLeave ? { borderColor: '#fecaca' } : undefined}
              >
                <div className="doctor-card-info-row">
                  <div className="doctor-card-avatar">
                    {doc.avatar || doc.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="doctor-card-text">
                    <span className="doctor-card-name">{doc.name}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <span className="doctor-card-specialty-tag">
                        {doc.specialty || 'General Practice'}
                      </span>
                      {doc.isEmergencyLeave ? (
                        <span style={{ fontSize: '10px', color: '#b91c1c', fontWeight: 700 }}>
                          &bull; On leave
                        </span>
                      ) : null}
                      <span style={{ fontSize: '10px', color: '#16a34a', fontWeight: 600 }}>
                        &bull; {weekApptsCount} {weekApptsCount === 1 ? 'visit' : 'visits'} this week
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  className="doctor-card-action-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedDoctorId(doc.id);
                  }}
                >
                  {isSelected ? '✓ Selected Doctor' : 'Select Doctor'}
                </button>
              </div>
            );
          })}
        </div>

        {/* ==================================================================
            Column 2: Selected Doctor Timetable & Schedule (Replaces Scattered Layout)
            ================================================================== */}
        <div className="column-doctor-timetable">
          {/* Header Row: Doctor Identity & Quick Action */}
          <div className="timetable-header-row">
            <div className="timetable-doctor-identity">
              <div className="timetable-avatar">
                {currentDoctor?.avatar || currentDoctor?.name?.slice(0, 2).toUpperCase() || 'DR'}
              </div>
              <div className="timetable-doctor-meta">
                <span className="timetable-doctor-name">{currentDoctor?.name}</span>
                <span className="timetable-doctor-sub">
                  <span
                    className="timetable-status-dot"
                    style={
                      currentDoctor?.isEmergencyLeave
                        ? { background: '#dc2626', boxShadow: '0 0 0 3px rgba(220,38,38,0.12)' }
                        : undefined
                    }
                  />
                  <strong style={{ color: currentDoctor?.isEmergencyLeave ? '#b91c1c' : '#0f172a' }}>
                    {currentDoctor?.isEmergencyLeave ? 'On Leave' : 'On Duty'}
                  </strong>{' '}
                  {currentDoctor?.isEmergencyLeave && currentDoctor?.emergencyReason ? (
                    <>
                      &bull;{' '}
                      <span style={{ color: '#b91c1c', fontWeight: 600 }}>
                        {currentDoctor.emergencyReason}
                      </span>{' '}
                    </>
                  ) : null}
                  &bull;{' '}
                  <span style={{ color: '#0369a1', fontWeight: 600 }}>{currentDoctor?.specialty}</span>
                  {currentDoctor?.shiftStart && currentDoctor?.shiftEnd ? (
                    <>
                      {' '}&bull;{' '}
                      <span className="tabular-nums">
                        {currentDoctor.shiftStart} – {currentDoctor.shiftEnd} WAT
                      </span>
                    </>
                  ) : null}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {/* Risk R-15 trigger: opens the one-click disruption cockpit */}
              <button
                type="button"
                className="dossier-action-btn"
                onClick={() => {
                  // CLINIC midnight of the day the receptionist is viewing, so
                  // the affected list mirrors exactly this timetable.
                  const dayStartTs = clinicDayStartOfParts(
                    selectedParts.year, selectedParts.monthIdx, selectedParts.day
                  );
                  openDisruptionModal(selectedDoctorId, dayStartTs);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: currentDoctor?.isEmergencyLeave ? '#fef2f2' : '#ffffff',
                  border: '1px solid #fecaca',
                  color: '#b91c1c',
                }}
                title="Report sudden absence — auto-reassign every affected patient and notify them (WhatsApp + SMS)"
              >
                <AlertTriangle size={14} />
                <span>{currentDoctor?.isEmergencyLeave ? 'Manage Leave' : 'Sudden absence'}</span>
              </button>

              {/* Leave lifecycle / Step 2 — planned dates that do not need an
                  emergency plan (and must not pretend to be one). */}
              <button
                type="button"
                className="dossier-action-btn"
                onClick={() => openLeavePlanner(selectedDoctorId)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: '#ffffff',
                  border: '1px solid var(--line-strong, #c8c1b4)',
                  color: '#334155',
                }}
                title="Plan or correct annual, sick or training leave — no patient moves"
              >
                <CalendarDays size={14} />
                <span>Plan leave</span>
              </button>

              <button
                type="button"
                className="dossier-action-btn"
                onClick={handleBookNow}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Plus size={14} />
                <span>+ Book Walk-In</span>
              </button>
            </div>
          </div>

          {/* Timetable Control Strip: Horizon Toggle & Functional Day Navigation */}
          <div className="timetable-control-strip">
            <div className="timetable-date-indicator">
              <CalendarIcon size={14} color="#111114" />
              <span>
                {selectedDayName}, {selectedMonthName} {selectedDayNumber}, {selectedYear}
              </span>
              <div className="day-nav-controls-row">
                <button
                  type="button"
                  className="day-nav-arrow-btn"
                  onClick={handlePrevDay}
                  title="Previous Day"
                >
                  <ChevronLeft size={13} />
                </button>
                <button
                  type="button"
                  className="day-nav-today-btn"
                  onClick={handleGoToToday}
                >
                  Today
                </button>
                <button
                  type="button"
                  className="day-nav-arrow-btn"
                  onClick={handleNextDay}
                  title="Next Day"
                >
                  <ChevronRight size={13} />
                </button>
              </div>
            </div>

            <div className="timetable-horizon-toggle">
              <button
                type="button"
                className={`horizon-toggle-btn ${timetableHorizon === 'day' ? 'active' : ''}`}
                onClick={() => setTimetableHorizon('day')}
              >
                Day Timetable
              </button>
              <button
                type="button"
                className={`horizon-toggle-btn ${timetableHorizon === 'week' ? 'active' : ''}`}
                onClick={() => setTimetableHorizon('week')}
              >
                7-Day Overview
              </button>
            </div>
          </div>

          {/* Quick Metrics Strip */}
          <div className="timetable-metrics-strip">
            <div className="timetable-metric-item">
              <span className="metric-dot confirmed" />
              <span>
                <strong style={{ color: '#0f172a' }}>
                  {activeDayAppointments.filter((a) => a.status === 'confirmed').length}
                </strong>{' '}
                Confirmed
              </span>
            </div>
            <span>&bull;</span>
            <div className="timetable-metric-item">
              <span className="metric-dot hold" />
              <span>
                <strong style={{ color: '#0f172a' }}>
                  {activeDayAppointments.filter((a) => a.status === 'held').length}
                </strong>{' '}
                Held Online
              </span>
            </div>
            <span>&bull;</span>
            <div className="timetable-metric-item">
              <span className="metric-dot reserve" />
              <span>
                <strong style={{ color: '#0f172a' }}>{dayReserves.length}</strong> Emergency Reserve
              </span>
            </div>
            <span>&bull;</span>
            <div className="timetable-metric-item">
              <span className="metric-dot free" />
              <span>
                <strong style={{ color: '#0f172a' }}>
                  {Math.max(0, DEFAULT_TIME_SLOTS.length - activeDayAppointments.length)}
                </strong>{' '}
                Open Slots
              </span>
            </div>
          </div>

          {/* Horizon View A: Day Timetable Agenda (Unscattered & Scoped) */}
          {timetableHorizon === 'day' ? (
            <div className="bento-agenda-list">
              {/* Sunday is the clinic's rest day, but a real Sunday booking
                  (walk-in, emergency) must still show. The closed message is
                  only the honest answer when nothing is booked. */}
              {selectedDayName === 'Sunday' && dayTimeline.length === 0 ? (
                <div style={{ padding: '36px', textAlign: 'center', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                  <CalendarIcon size={24} color="#64748b" style={{ margin: '0 auto 8px auto', display: 'block' }} />
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>Clinic Closed on Sundays</div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                    Consultations resume on Monday at 08:00 WAT.
                  </div>
                  <button
                    type="button"
                    className="btn-base btn-secondary"
                    onClick={handleNextDay}
                    style={{ marginTop: '12px', fontSize: '11px', padding: '4px 10px' }}
                  >
                    View Monday Timetable &rarr;
                  </button>
                </div>
              ) : (
                <>
                  {dayTimeline.length === 0 && (
                    <div style={{ padding: '32px', textAlign: 'center', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                      <CalendarIcon size={22} color="#64748b" style={{ margin: '0 auto 6px auto', display: 'block' }} />
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>No Scheduled Appointments</div>
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                        All slots are open for walk-in bookings or online patient requests.
                      </div>
                    </div>
                  )}

                  {/* One chronological timeline: the day's real appointments and
                      the clinic's real lunch break, ordered by clock time. */}
                  {dayTimeline.map((item) => {
                    if (item.kind === 'lunch') {
                      return (
                        <div key="clinic-lunch" className="bento-agenda-card event-break">
                          <div className="bento-time-col">
                            <span className="bento-time-primary">{labelFromHHMM(clinicLunch.start)}</span>
                            <span className="bento-duration-sub">until {labelFromHHMM(clinicLunch.end)}</span>
                          </div>
                          <div className="bento-details-col">
                            <div className="bento-patient-name-row">
                              <Coffee size={14} color="#64748b" />
                              <span className="bento-patient-name">Clinic Lunch &amp; Sanitization Break</span>
                            </div>
                            <div className="bento-service-sub">
                              Clinic-wide protected rest and equipment sterilization interval
                            </div>
                          </div>
                          <div className="bento-actions-col">
                            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Protected</span>
                          </div>
                        </div>
                      );
                    }

                    if (item.kind === 'reserve') {
                      const r = item.reserve;
                      return (
                        <div key={`reserve-${r.id}`} className="bento-agenda-card event-reserve">
                          <div className="bento-time-col">
                            <span className="bento-time-primary">{labelFromHHMM(r.start_time)}</span>
                            <span className="bento-duration-sub">until {labelFromHHMM(r.end_time)}</span>
                          </div>
                          <div className="bento-details-col">
                            <div className="bento-patient-name-row">
                              <Shield size={14} color="#8b5cf6" />
                              <span className="bento-patient-name">Walk-In Emergency Reserve</span>
                              <span
                                style={{
                                  fontSize: '9px',
                                  fontWeight: 700,
                                  color: '#7c3aed',
                                  background: '#ede9fe',
                                  padding: '1px 6px',
                                  borderRadius: '10px',
                                }}
                              >
                                RESERVE
                              </span>
                            </div>
                            <div className="bento-service-sub">
                              {r.reason || 'Protected triage slot for unscheduled urgent walk-in arrivals'}
                              {r.doctor_name ? ` • ${r.doctor_name}` : ' • Clinic-wide'}
                            </div>
                          </div>
                          <div className="bento-actions-col">
                            <button
                              type="button"
                              className="event-action-btn-sm"
                              onClick={() => onOpenWalkInBooking && onOpenWalkInBooking(currentDoctor?.id, selectedDate, labelFromHHMM(r.start_time))}
                            >
                              Assign
                            </button>
                          </div>
                        </div>
                      );
                    }

                    const apt = item.apt;
                    return (
                      <div
                        key={apt.id}
                        className={`bento-agenda-card ${
                          apt.status === 'held' ? 'event-hold' : 'event-confirmed'
                        }`}
                      >
                        <div className="bento-time-col">
                          <span className="bento-time-primary">{apt.time.split(' – ')[0]}</span>
                          <span className="bento-duration-sub">until {apt.time.split(' – ')[1]}</span>
                        </div>

                        <div className="bento-details-col">
                          <div className="bento-patient-name-row">
                            <span className="bento-patient-name">{apt.patientName}</span>
                            <span
                              className={`event-type-pill ${
                                apt.type === 'returning' ? 'returning' : 'new'
                              }`}
                            >
                              {apt.type}
                            </span>
                            {apt.status === 'held' && (
                              <span
                                style={{
                                  fontSize: '10px',
                                  fontWeight: 700,
                                  color: '#b45309',
                                  background: '#fef3c7',
                                  padding: '1px 6px',
                                  borderRadius: '10px',
                                }}
                              >
                                Held Online: {apt.holdExpiresIn || '12m left'}
                              </span>
                            )}
                          </div>
                          <div className="bento-service-sub">
                            <span>{apt.service}</span> &bull;{' '}
                            <span className="tabular-nums">{apt.phone}</span>
                            {apt.bufferMin && (
                              <span style={{ color: '#16a34a', marginLeft: '6px' }}>
                                &bull; {apt.bufferMin}m buffer safe
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="bento-actions-col">
                          <button
                            type="button"
                            className="event-action-btn-sm"
                            onClick={() => onSelectAppointment && onSelectAppointment(apt)}
                          >
                            Dossier
                          </button>
                          {apt.status === 'held' ? (
                            <button
                              type="button"
                              className="event-action-btn-secondary"
                              onClick={() => onReleaseHold && onReleaseHold(apt.id)}
                            >
                              Release
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="event-action-btn-secondary"
                              onClick={() => onAdmitAppointment && onAdmitAppointment(apt)}
                            >
                              Arrived
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          ) : (
            /* Horizon View B: 7-Day Overview for the active doctor — the real
               clinic week (Monday first) with the real visits the backend sent. */
            <div className="week-overview-grid">
              {weekDays.map((day) => {
                const isSelected = selectedDayKey === day.key;

                return (
                  <div
                    key={day.key}
                    className="week-day-card"
                    style={{
                      borderColor: isSelected ? '#111114' : '#e2e8f0',
                      background: isSelected ? '#ffffff' : '#f8fafc',
                    }}
                  >
                    <div className="week-day-header">
                      <div>
                        <span className="week-day-title">{day.weekdayName}</span>
                        <span style={{ fontSize: '11px', color: '#64748b', marginLeft: '6px' }}>
                          {day.label}
                        </span>
                      </div>
                      <span className="week-day-count">
                        {day.rows.length} {day.rows.length === 1 ? 'visit' : 'visits'}
                      </span>
                    </div>

                    {/* Complete List of Patients for This Day */}
                    <div className="week-day-patient-list">
                      {day.rows.length === 0 ? (
                        <div className="week-day-empty">No visits booked</div>
                      ) : (
                        day.rows.map((apt) => (
                          <div
                            key={apt.id}
                            className="week-patient-chip"
                            onClick={() => onSelectAppointment && onSelectAppointment(apt)}
                            style={{ cursor: 'pointer' }}
                            title={`Click to view clinical details for ${apt.patientName}`}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <strong>{apt.time.split(' – ')[0]}:</strong>
                              <span style={{ fontSize: '9px', fontWeight: 600, color: '#16a34a' }}>
                                {apt.status}
                              </span>
                            </div>
                            <div>
                              {apt.patientName} &bull; <span style={{ color: '#0369a1' }}>{apt.service}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    <button
                      type="button"
                      className="week-day-action-btn"
                      onClick={() => {
                        setSelectedDate(new Date(day.startMs));
                        setTimetableHorizon('day');
                      }}
                    >
                      Switch to {day.weekdayName} Timetable &rarr;
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ==================================================================
            Column 3: Interactive Calendar & Visit Hours (Time Slots Grid)
            ================================================================== */}
        <div className="column-calendar-slots">
          {/* Quick Book Button Above Calendar (As specifically requested by user) */}
          <button
            type="button"
            className="calendar-quick-book-btn"
            onClick={handleBookNow}
          >
            <Plus size={14} color="#111114" />
            <span>+ Quick Book Walk-In Slot</span>
          </button>

          {/* Card A: Month Calendar with Infinite Navigation */}
          <div className="calendar-mini-card">
            <div className="calendar-card-header">
              <span className="calendar-card-title">Calendar</span>
              <button
                type="button"
                className="view-all-link"
                onClick={handleGoToToday}
              >
                Today &gt;
              </button>
            </div>

            <div className="month-nav-row">
              <span className="month-label-bold">{calendarMonthLabel}</span>
              <div className="month-nav-buttons">
                <button
                  type="button"
                  className="month-arrow-btn"
                  onClick={handlePrevMonth}
                  title="Previous Month"
                >
                  <ChevronLeft size={15} />
                </button>
                <button
                  type="button"
                  className="month-arrow-btn"
                  onClick={handleNextMonth}
                  title="Next Month"
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>

            <div className="days-of-week-row">
              {DAYS_OF_WEEK.map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>

            <div className="month-dates-grid">
              {/* Dynamic Offset blanks for first day of month */}
              {Array.from({ length: firstDayOfWeekIdx }).map((_, idx) => (
                <span key={`blank-${idx}`} className="date-cell-btn empty-cell">.</span>
              ))}

              {/* Dynamic Days in the selected month */}
              {Array.from({ length: daysInMonth }).map((_, idx) => {
                const dayNum = idx + 1;
                const isSelected =
                  selectedParts.year === calendarYear &&
                  selectedParts.monthIdx === calendarMonthIdx &&
                  selectedParts.day === dayNum;

                // A day is marked only when the selected doctor really has a
                // visit on it. The old list [5, 9, 14, ...] was invented, so
                // quiet days looked busy and real days looked empty.
                const dayKey = `${calendarYear}-${String(calendarMonthIdx + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                const hasAppts = storeBlocks.some(
                  (b) =>
                    b.doctorId === currentDoctor?.id &&
                    isVisitBlock(b) &&
                    clinicDayKey(b.start) === dayKey
                );

                return (
                  <button
                    key={`day-${dayNum}`}
                    type="button"
                    className={`date-cell-btn ${isSelected ? 'active-selected' : ''} ${
                      hasAppts ? 'has-appointments' : ''
                    }`}
                    onClick={() => handleSelectCalendarDay(dayNum)}
                  >
                    {dayNum}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Card B: Visit Hours (Time Slots with Crossed-Out Booked State) */}
          <div className="visit-hours-card">
            <div className="calendar-card-header">
              <span className="calendar-card-title">Visit Hours</span>
              <span style={{ fontSize: '11px', color: '#64748b' }}>
                {activeDayAppointments.length} Booked &bull;{' '}
                {Math.max(0, DEFAULT_TIME_SLOTS.length - activeDayAppointments.length)} Free
              </span>
            </div>

            <div className="month-nav-row">
              <span className="month-label-bold">
                {selectedDayName}, {selectedMonthName.slice(0, 3)} {selectedDayNumber}
              </span>
              <div className="month-nav-buttons">
                <button
                  type="button"
                  className="month-arrow-btn"
                  onClick={handlePrevDay}
                  title="Previous Day"
                >
                  <ChevronLeft size={15} />
                </button>
                <button
                  type="button"
                  className="month-arrow-btn"
                  onClick={handleNextDay}
                  title="Next Day"
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>

            {/* 4-Column Time Slot Grid with Strikethrough/Crossed-out Booked state */}
            <div className="time-slots-grid-4col">
              {DEFAULT_TIME_SLOTS.map((slot) => {
                const details = getSlotDetails(slot);
                const isActive = selectedTimeSlot === slot && !details.isBooked;

                return (
                  <button
                    key={slot}
                    type="button"
                    disabled={details.isBooked}
                    className={`time-slot-btn ${isActive ? 'active' : ''} ${
                      details.isBooked ? 'booked' : ''
                    } ${details.isReserve ? 'reserve-slot' : ''}`}
                    onClick={() => setSelectedTimeSlot(slot)}
                    title={
                      details.isBooked
                        ? details.patientName
                          ? `Booked by ${details.patientName} (${slot})`
                          : `Clinic ${details.label || 'Break'} (${slot})`
                        : `Select Available Slot ${slot}`
                    }
                  >
                    {slot}
                    {details.isBooked && (
                      <span style={{ display: 'block', fontSize: '8px', opacity: 0.8 }}>
                        {details.label || 'Booked'}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Full-width Book Action Button */}
            <button
              type="button"
              className="visit-hours-book-cta"
              onClick={handleBookNow}
            >
              Book an appointment ({selectedTimeSlot})
            </button>
          </div>
        </div>
      </div>

      {/* Emergency Leave Disruption Cockpit (Risk R-15) — one-click auto-resolve
          plus per-patient manual transfer fallbacks. */}
      {disruptionModal.isOpen && (
        <EmergencyDisruptionModal
          isOpen={disruptionModal.isOpen}
          disruptionData={disruptionModal}
          doctors={doctorsOnSelectedDay}
          availableColleagues={availableColleagues}
          onClose={closeDisruptionModal}
          onReassign={reassignToColleague}
          onAutoResolve={autoResolveDisruption}
          onSetLeaveWindow={setLeaveWindow}
          onSetLeaveKind={setLeaveKind}
          onPreviewPlan={previewDisruptionPlan}
          onSetDistributionMode={setDistributionMode}
          onToggleColleague={toggleColleagueChoice}
          onChooseSingle={chooseSingleColleague}
          onSetColleagueCap={setColleagueCap}
          onRestoreDuty={restoreDoctorDuty}
        />
      )}

      {/* Leave lifecycle / Step 2 — plan or correct a leave period. */}
      <LeavePlannerModal
        isOpen={leavePlanner?.isOpen}
        planner={leavePlanner}
        onClose={closeLeavePlanner}
        onAdd={addDoctorLeave}
        onRemove={removeDoctorLeave}
        onEndToday={endTodayLeaveFromPlanner}
      />

      {/* Step 3 — the stranded queue Django reports, grouped by day with the
          plain reason each patient could not be placed. */}
      <StrandedPatientsPanel
        isOpen={strandedPanelOpen}
        stranded={stranded}
        onClose={closeStrandedPanel}
        onRefresh={loadStranded}
        onMove={moveStrandedPatient}
        movingId={movingStrandedId}
      />

      {/* Item C — full-screen red double-booking alert. Names the doctor, both
          appointment codes and the exact overlap; the chip stays red after
          "Silence" until the backend reports the clash is gone. */}
      <DoubleBookingAlert
        isOpen={doubleBookingAlert.isOpen}
        conflict={doubleBookingAlert.primaryConflict}
        count={doubleBookingAlert.conflicts.length}
        onViewInCalendar={handleViewDoubleBooking}
        onSilence={doubleBookingAlert.silence}
      />
    </div>
  );
};
