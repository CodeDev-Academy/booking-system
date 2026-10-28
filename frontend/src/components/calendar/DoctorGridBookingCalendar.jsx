import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  MapPin,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Clock,
  Shield,
  CheckCircle2,
  Calendar as CalendarIcon,
  User,
  Bell,
  Stethoscope,
  Sparkles,
  Coffee,
  AlertCircle,
  Plus,
  FileText,
  UserCheck,
  CalendarDays,
  Lock,
  LogOut,
  Users,
  Settings as SettingsIcon,
} from 'lucide-react';
import { useCalendarStore } from '../../stores/useCalendarStore';
import { useStaffStore } from '../../stores/useStaffStore';
import { useAuthStore } from '../../stores/useAuthStore';
import { useAppModeStore } from '../../stores/appModeStore';
import '../../styles/components/grid-booking-calendar.css';

const getInitialToday = () => {
  const isDemo = useAppModeStore.getState().isDemoMode;
  return isDemo ? new Date(2026, 9, 26) : new Date();
};

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

// Real Clinic Specialties from Clinic Settings & Staff Roster Memory
const CLINIC_SPECIALTIES = [
  'All Specialties',
  'Dental Surgery & Care',
  'Family Medicine & General Practice',
  'Consultant Surgery',
  'Ophthalmology (Eye Care)',
  'ENT Care',
];

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

// Rich clinic data for doctor shift hours & room suites
const DOCTOR_META = {
  'doc-bello': {
    experience: 'Dental Surgeon | 14 yrs experience',
    suite: 'Cedarcare Dental Suite 1',
    shift: '09:00 – 17:00 WAT',
    specialtyCategory: 'Dental Surgery & Care',
    weekAppointments: {
      Monday: [
        { id: 'apt-b1', time: '09:00 AM – 09:30 AM', patientName: 'Tunde Musa', type: 'returning', phone: '+234 803 987 6543', service: 'Dental Consultation', status: 'confirmed', bufferMin: 10 },
        { id: 'apt-b2', time: '10:00 AM – 10:45 AM', patientName: 'Fatima Bello', type: 'new', phone: '+234 802 111 3333', service: 'Tooth Extraction', status: 'confirmed', bufferMin: 15 },
        { id: 'apt-b3', time: '11:00 AM – 11:30 AM', patientName: 'Zainab Lawal', type: 'returning', phone: '+234 807 666 7777', service: 'Dental Consultation', status: 'held', holdExpiresIn: '11m 45s' },
        { id: 'apt-b4', time: '02:30 PM – 03:15 PM', patientName: 'Emeka Obi', type: 'returning', phone: '+234 809 123 4567', service: 'Follow-Up Inspection', status: 'arrived', bufferMin: 10 },
      ],
      Tuesday: [
        { id: 'apt-b5', time: '09:00 AM – 09:30 AM', patientName: 'Rahman Lawal', type: 'returning', phone: '+234 803 222 1100', service: 'Dental Consultation', status: 'confirmed', bufferMin: 10 },
        { id: 'apt-b6', time: '11:30 AM – 12:15 PM', patientName: 'Amina Yusuf', type: 'new', phone: '+234 801 234 5678', service: 'Tooth Extraction', status: 'confirmed', bufferMin: 15 },
        { id: 'apt-b7', time: '02:00 PM – 02:30 PM', patientName: 'Ibrahim Sani', type: 'returning', phone: '+234 805 555 0101', service: 'Prophylaxis & Cleaning', status: 'confirmed', bufferMin: 10 },
      ],
      Wednesday: [
        { id: 'apt-b8', time: '09:30 AM – 10:15 AM', patientName: 'Hauwa Yusuf', type: 'new', phone: '+234 806 777 8899', service: 'Tooth Extraction', status: 'confirmed', bufferMin: 15 },
        { id: 'apt-b9', time: '10:30 AM – 11:00 AM', patientName: 'Sani Bello', type: 'returning', phone: '+234 802 333 4455', service: 'Dental Consultation', status: 'confirmed', bufferMin: 10 },
        { id: 'apt-b10', time: '03:00 PM – 03:45 PM', patientName: 'Maryam Alabi', type: 'new', phone: '+234 814 555 6677', service: 'Tooth Extraction', status: 'confirmed', bufferMin: 15 },
      ],
      Thursday: [
        { id: 'apt-b11', time: '10:00 AM – 10:30 AM', patientName: 'Kolawole Adeyemi', type: 'new', phone: '+234 803 555 0192', service: 'Dental Consultation', status: 'confirmed', bufferMin: 10 },
        { id: 'apt-b12', time: '02:00 PM – 02:45 PM', patientName: 'Bisi Alabi', type: 'returning', phone: '+234 805 111 2233', service: 'Tooth Extraction', status: 'confirmed', bufferMin: 15 },
      ],
      Friday: [
        { id: 'apt-b13', time: '09:00 AM – 09:30 AM', patientName: 'Chioma Nwosu', type: 'returning', phone: '+234 808 999 8877', service: 'Dental Consultation', status: 'confirmed', bufferMin: 10 },
        { id: 'apt-b14', time: '10:00 AM – 10:45 AM', patientName: 'Danjuma Kenneth', type: 'new', phone: '+234 803 777 6655', service: 'Tooth Extraction', status: 'confirmed', bufferMin: 15 },
        { id: 'apt-b15', time: '02:30 PM – 03:00 PM', patientName: 'Aliyu Garba', type: 'returning', phone: '+234 802 444 8899', service: 'Prophylaxis & Cleaning', status: 'confirmed', bufferMin: 10 },
        { id: 'apt-b16', time: '03:30 PM – 04:15 PM', patientName: 'Halima Sadiq', type: 'new', phone: '+234 813 555 1212', service: 'Tooth Extraction', status: 'confirmed', bufferMin: 15 },
      ],
      Saturday: [
        { id: 'apt-b17', time: '10:00 AM – 10:30 AM', patientName: 'Tariq Mohammed', type: 'returning', phone: '+234 809 333 2211', service: 'Dental Checkup', status: 'confirmed', bufferMin: 10 },
        { id: 'apt-b18', time: '11:00 AM – 11:30 AM', patientName: 'Zainab Lawal', type: 'returning', phone: '+234 807 666 7777', service: 'Dental Consultation', status: 'confirmed', bufferMin: 10 },
      ],
    },
  },
  'doc-okafor': {
    experience: 'Primary Care Physician | 10 yrs experience',
    suite: 'Cedarcare Executive Suite B',
    shift: '08:00 – 16:00 WAT',
    specialtyCategory: 'Family Medicine & General Practice',
    weekAppointments: {
      Monday: [
        { id: 'apt-o1', time: '09:00 AM – 09:30 AM', patientName: 'Kenneth Danjuma', type: 'new', phone: '+234 805 444 5555', service: 'General Health Check-up', status: 'confirmed', bufferMin: 10 },
        { id: 'apt-o2', time: '10:30 AM – 11:00 AM', patientName: 'Amina Yusuf', type: 'returning', phone: '+234 801 234 5678', service: 'Blood Pressure Review', status: 'confirmed', bufferMin: 10 },
        { id: 'apt-o3', time: '02:00 PM – 02:30 PM', patientName: 'Ibrahim Sani', type: 'returning', phone: '+234 805 555 0101', service: 'General Health Review', status: 'arrived', bufferMin: 10 },
      ],
      Tuesday: [
        { id: 'apt-o4', time: '08:30 AM – 09:00 AM', patientName: 'Fatima Bello', type: 'returning', phone: '+234 802 111 3333', service: 'Metabolic Health Exam', status: 'confirmed', bufferMin: 10 },
        { id: 'apt-o5', time: '10:00 AM – 10:30 AM', patientName: 'Kolawole Adeyemi', type: 'new', phone: '+234 803 555 0192', service: 'General Health Check-up', status: 'confirmed', bufferMin: 10 },
      ],
      Wednesday: [
        { id: 'apt-o6', time: '09:00 AM – 09:30 AM', patientName: 'Chioma Nwosu', type: 'returning', phone: '+234 808 999 8877', service: 'General Health Review', status: 'confirmed', bufferMin: 10 },
        { id: 'apt-o7', time: '11:00 AM – 11:30 AM', patientName: 'Tunde Musa', type: 'returning', phone: '+234 803 987 6543', service: 'Preventive Wellness', status: 'confirmed', bufferMin: 10 },
        { id: 'apt-o8', time: '01:30 PM – 02:00 PM', patientName: 'Bisi Alabi', type: 'returning', phone: '+234 805 111 2233', service: 'Blood Pressure Review', status: 'confirmed', bufferMin: 10 },
      ],
      Thursday: [
        { id: 'apt-o9', time: '10:00 AM – 10:30 AM', patientName: 'Rahman Lawal', type: 'new', phone: '+234 803 222 1100', service: 'General Health Check-up', status: 'confirmed', bufferMin: 10 },
        { id: 'apt-o10', time: '02:30 PM – 03:00 PM', patientName: 'Maryam Alabi', type: 'returning', phone: '+234 814 555 6677', service: 'Routine Examination', status: 'confirmed', bufferMin: 10 },
      ],
      Friday: [
        { id: 'apt-o11', time: '08:30 AM – 09:00 AM', patientName: 'Emeka Obi', type: 'returning', phone: '+234 809 123 4567', service: 'General Health Review', status: 'confirmed', bufferMin: 10 },
        { id: 'apt-o12', time: '10:30 AM – 11:00 AM', patientName: 'Aliyu Garba', type: 'returning', phone: '+234 802 444 8899', service: 'Cardiovascular Screening', status: 'confirmed', bufferMin: 10 },
        { id: 'apt-o13', time: '02:00 PM – 02:30 PM', patientName: 'Zainab Lawal', type: 'returning', phone: '+234 807 666 7777', service: 'Routine Check-up', status: 'confirmed', bufferMin: 10 },
      ],
      Saturday: [
        { id: 'apt-o14', time: '09:00 AM – 09:30 AM', patientName: 'Halima Sadiq', type: 'new', phone: '+234 813 555 1212', service: 'General Consultation', status: 'confirmed', bufferMin: 10 },
      ],
    },
  },
  'doc-babawo': {
    experience: 'Consultant Physician & Surgeon | 16 yrs experience',
    suite: 'Cedarcare Executive Suite & Theater',
    shift: '08:00 – 17:00 WAT',
    specialtyCategory: 'Consultant Surgery',
    weekAppointments: {
      Monday: [
        { id: 'apt-bw1', time: '11:00 AM – 11:30 AM', patientName: 'Aliyu Garba', type: 'returning', phone: '+234 802 444 8899', service: 'Consultant Clinical Review', status: 'confirmed', bufferMin: 10 },
        { id: 'apt-bw2', time: '02:30 PM – 03:15 PM', patientName: 'Halima Sadiq', type: 'new', phone: '+234 813 555 1212', service: 'Pre-Operative Assessment', status: 'confirmed', bufferMin: 15 },
        { id: 'apt-bw3', time: '03:30 PM – 04:00 PM', patientName: 'Ibrahim Danjuma', type: 'returning', phone: '+234 803 111 9900', service: 'Post-Op Suture Inspection', status: 'arrived', bufferMin: 10 },
      ],
      Tuesday: [
        { id: 'apt-bw4', time: '10:00 AM – 10:45 AM', patientName: 'Kenneth Danjuma', type: 'new', phone: '+234 805 444 5555', service: 'Surgical Consultation', status: 'confirmed', bufferMin: 15 },
        { id: 'apt-bw5', time: '02:00 PM – 02:30 PM', patientName: 'Tunde Musa', type: 'returning', phone: '+234 803 987 6543', service: 'Follow-up Clinical Review', status: 'confirmed', bufferMin: 10 },
      ],
      Wednesday: [
        { id: 'apt-bw6', time: '09:00 AM – 09:45 AM', patientName: 'Amina Yusuf', type: 'returning', phone: '+234 801 234 5678', service: 'Consultant Second Opinion', status: 'confirmed', bufferMin: 15 },
        { id: 'apt-bw7', time: '11:30 AM – 12:00 PM', patientName: 'Emeka Obi', type: 'returning', phone: '+234 809 123 4567', service: 'Post-Op Inspection', status: 'confirmed', bufferMin: 10 },
        { id: 'apt-bw8', time: '03:00 PM – 03:45 PM', patientName: 'Fatima Bello', type: 'new', phone: '+234 802 111 3333', service: 'Minor Surgical Assessment', status: 'confirmed', bufferMin: 15 },
      ],
      Thursday: [
        { id: 'apt-bw9', time: '10:30 AM – 11:15 AM', patientName: 'Sani Bello', type: 'new', phone: '+234 802 333 4455', service: 'Clinical Consultation', status: 'confirmed', bufferMin: 15 },
        { id: 'apt-bw10', time: '02:00 PM – 02:30 PM', patientName: 'Zainab Lawal', type: 'returning', phone: '+234 807 666 7777', service: 'Post-Op Follow-up', status: 'confirmed', bufferMin: 10 },
      ],
      Friday: [
        { id: 'apt-bw11', time: '09:00 AM – 09:45 AM', patientName: 'Kolawole Adeyemi', type: 'returning', phone: '+234 803 555 0192', service: 'Surgical Review', status: 'confirmed', bufferMin: 15 },
        { id: 'apt-bw12', time: '11:00 AM – 11:30 AM', patientName: 'Chioma Nwosu', type: 'returning', phone: '+234 808 999 8877', service: 'Consultant Clinical Review', status: 'confirmed', bufferMin: 10 },
        { id: 'apt-bw13', time: '02:30 PM – 03:15 PM', patientName: 'Bisi Alabi', type: 'new', phone: '+234 805 111 2233', service: 'Pre-Operative Assessment', status: 'confirmed', bufferMin: 15 },
      ],
      Saturday: [
        { id: 'apt-bw14', time: '10:00 AM – 10:45 AM', patientName: 'Rahman Lawal', type: 'returning', phone: '+234 803 222 1100', service: 'Consultant Second Opinion', status: 'confirmed', bufferMin: 15 },
      ],
    },
  },
};

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
  const navigate = useNavigate();
  const calendarDoctors = useCalendarStore((state) => state.doctors);
  const staffList = useStaffStore((state) => state.staffList);
  const lockDesk = useAuthStore((state) => state.lockDesk);
  const logout = useAuthStore((state) => state.logout);

  // Doctors list (Dr. Bello, Dr. Okafor, Dr. Babawo)
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
    return [
      { id: 'doc-bello', name: 'Dr. Aminu Bello', specialty: 'Dentistry', avatar: 'AB', isOnDuty: true },
      { id: 'doc-okafor', name: 'Dr. Chinelo Okafor', specialty: 'General Practice', avatar: 'CO', isOnDuty: true },
      { id: 'doc-babawo', name: 'Dr. Babawo', specialty: 'Consultant Surgery', avatar: 'BW', isOnDuty: true },
    ];
  }, [calendarDoctors, staffList]);

  // View States
  const [selectedSpecialty, setSelectedSpecialty] = useState('All Specialties');
  const [searchDoctorQuery, setSearchDoctorQuery] = useState('');
  const [selectedDoctorId, setSelectedDoctorId] = useState(() => doctors[0]?.id || 'doc-bello');
  const [timetableHorizon, setTimetableHorizon] = useState('day'); // 'day' | 'week'
  const [selectedTimeSlot, setSelectedTimeSlot] = useState('11:30 AM');
  const [showUserMenu, setShowUserMenu] = useState(false);

  // Dynamic Date Engine (Defaults to demo seed anchor or real device today)
  const [selectedDate, setSelectedDate] = useState(() => getInitialToday());
  const [currentMonthDate, setCurrentMonthDate] = useState(() => {
    const today = getInitialToday();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });

  // Date Properties
  const selectedYear = selectedDate.getFullYear();
  const selectedMonthIdx = selectedDate.getMonth();
  const selectedDayNumber = selectedDate.getDate();
  const selectedDayName = DAY_NAMES_FULL[selectedDate.getDay()];
  const selectedMonthName = MONTH_NAMES[selectedMonthIdx];

  // Month Calendar Grid Calculation
  const calendarYear = currentMonthDate.getFullYear();
  const calendarMonthIdx = currentMonthDate.getMonth();
  const calendarMonthLabel = `${MONTH_NAMES[calendarMonthIdx]} ${calendarYear}`;

  const daysInMonth = new Date(calendarYear, calendarMonthIdx + 1, 0).getDate();
  // Monday start: 0 = Mon, 6 = Sun
  const firstDayOfWeekIdx = (new Date(calendarYear, calendarMonthIdx, 1).getDay() + 6) % 7;

  // Month Navigation Handlers (Infinite past and future navigation)
  const handlePrevMonth = () => {
    setCurrentMonthDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonthDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  // Day Navigation Handlers (Step day-by-day or jump to today)
  const handlePrevDay = () => {
    setSelectedDate((prev) => {
      const next = new Date(prev.getTime() - 86400000);
      setCurrentMonthDate(new Date(next.getFullYear(), next.getMonth(), 1));
      return next;
    });
  };

  const handleNextDay = () => {
    setSelectedDate((prev) => {
      const next = new Date(prev.getTime() + 86400000);
      setCurrentMonthDate(new Date(next.getFullYear(), next.getMonth(), 1));
      return next;
    });
  };

  const handleGoToToday = () => {
    const today = getInitialToday();
    setSelectedDate(today);
    setCurrentMonthDate(new Date(today.getFullYear(), today.getMonth(), 1));
  };

  const handleSelectCalendarDay = (dayNum) => {
    const nextDate = new Date(calendarYear, calendarMonthIdx, dayNum);
    setSelectedDate(nextDate);
  };

  // Filtered doctors
  const filteredDoctors = useMemo(() => {
    return doctors.filter((doc) => {
      const q = searchDoctorQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        doc.name.toLowerCase().includes(q) ||
        (doc.specialty && doc.specialty.toLowerCase().includes(q));

      if (!matchSearch) return false;

      if (selectedSpecialty === 'All Specialties') return true;
      if (selectedSpecialty === 'Dental Surgery & Care') {
        return doc.specialty?.toLowerCase().includes('dent') || doc.id === 'doc-bello';
      }
      if (selectedSpecialty === 'Family Medicine & General Practice') {
        return doc.specialty?.toLowerCase().includes('general') || doc.id === 'doc-okafor';
      }
      if (selectedSpecialty === 'Consultant Surgery') {
        return (
          doc.specialty?.toLowerCase().includes('surg') ||
          doc.specialty?.toLowerCase().includes('physician') ||
          doc.id === 'doc-babawo'
        );
      }
      return true;
    });
  }, [doctors, searchDoctorQuery, selectedSpecialty]);

  // Active selected doctor
  const currentDoctor = useMemo(() => {
    return (
      doctors.find((d) => d.id === selectedDoctorId) ||
      filteredDoctors[0] ||
      doctors[0]
    );
  }, [doctors, selectedDoctorId, filteredDoctors]);

  const activeDocMeta = useMemo(() => {
    return DOCTOR_META[currentDoctor?.id] || DOCTOR_META['doc-bello'];
  }, [currentDoctor]);

  // Subscribe to live calendar blocks for real-time walk-in reflection
  const storeBlocks = useCalendarStore((state) => state.blocks) || [];

  // Helper to format block time e.g. "09:30 AM"
  const formatSlotTime = (ts) => {
    return new Date(ts).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  // Day appointments for active doctor (Merges static seed + dynamic Walk-In bookings)
  const activeDayAppointments = useMemo(() => {
    if (selectedDayName === 'Sunday') return [];
    const weekAppts = activeDocMeta.weekAppointments || {};
    const staticDayAppts = weekAppts[selectedDayName] || [];

    // Filter dynamic blocks for active doctor on currently viewed day
    const dynamicAppts = storeBlocks
      .filter((b) => {
        if (b.doctorId !== currentDoctor?.id) return false;
        if (b.type !== 'appointment' && b.type !== 'hold') return false;
        const bDate = new Date(b.start);
        return (
          bDate.getFullYear() === selectedYear &&
          bDate.getMonth() === selectedMonthIdx &&
          bDate.getDate() === selectedDayNumber
        );
      })
      .map((b) => {
        const startStr = formatSlotTime(b.start);
        const endStr = formatSlotTime(b.end);
        return {
          id: b.appointmentId || b.id,
          time: `${startStr} – ${endStr}`,
          patientName: b.patientName,
          type: b.patientType || 'new',
          phone: b.patientPhone,
          service: b.serviceId?.includes('extract') ? 'Tooth Extraction' : 'Dental Consultation',
          status: b.status || 'confirmed',
          bufferMin: b.bufferMin || 10,
          isDynamic: true,
        };
      });

    // Merge static and dynamic, deduplicating by ID
    const merged = [...staticDayAppts];
    dynamicAppts.forEach((dyn) => {
      if (!merged.some((m) => m.id === dyn.id)) {
        merged.push(dyn);
      }
    });

    // Sort chronologically by start time
    return merged.sort((a, b) => {
      const timeA = a.time.split(' – ')[0];
      const timeB = b.time.split(' – ')[0];
      return timeA.localeCompare(timeB);
    });
  }, [
    activeDocMeta,
    selectedDayName,
    selectedYear,
    selectedMonthIdx,
    selectedDayNumber,
    storeBlocks,
    currentDoctor,
  ]);

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

    if (slotStr === '12:00 PM' || slotStr === '12:30 PM') {
      return { isBooked: true, label: 'Lunch', type: 'lunch' };
    }
    if (slotStr === '01:30 PM') {
      return { isBooked: false, isReserve: true, label: 'Reserve' };
    }
    return { isBooked: false, type: 'free' };
  };

  // Trigger Walk-In Modal
  const handleBookNow = () => {
    if (onOpenWalkInBooking) {
      onOpenWalkInBooking(currentDoctor?.id, selectedDate, selectedTimeSlot);
    }
  };

  return (
    <div className="grid-booking-container">
      {/* 1. Top Search & Location Bar */}
      <div className="grid-booking-search-bar">
        <div className="search-location-combo">
          <div className="search-field-part">
            <Search size={16} color="#64748b" />
            <input
              type="text"
              placeholder="Find doctors, specialties..."
              value={searchDoctorQuery}
              onChange={(e) => setSearchDoctorQuery(e.target.value)}
            />
          </div>
          <div className="search-combo-divider" />
          <div className="location-field-part">
            <MapPin size={15} color="#0c1a30" />
            <input type="text" defaultValue="Abuja, NG" readOnly />
          </div>
          <button type="button" className="search-combo-btn">
            Search
          </button>
        </div>

        {/* User Profile Pill with Interactive Dropdown */}
        <div className="grid-booking-user-actions">
          <button type="button" className="round-icon-action-btn" title="Front-Desk Alerts">
            <Bell size={16} />
          </button>

          <div className="user-profile-wrapper">
            <div
              className="user-profile-pill"
              onClick={() => setShowUserMenu(!showUserMenu)}
              role="button"
              tabIndex={0}
            >
              <div className="user-profile-avatar">SA</div>
              <span className="user-profile-name">Sarah Aliyu (Front Desk)</span>
              <ChevronDown size={14} color="#64748b" />
            </div>

            {/* Interactive Receptionist Profile Popover */}
            {showUserMenu && (
              <div className="user-profile-menu-popover">
                <div className="popover-user-header">
                  <div className="user-profile-avatar">SA</div>
                  <div>
                    <div className="popover-user-name">Sarah Aliyu</div>
                    <div className="popover-user-role">Senior Receptionist &bull; On Duty</div>
                  </div>
                </div>

                <div style={{ fontSize: '11px', color: '#64748b', padding: '2px 4px' }}>
                  sarah.aliyu@cedarcare.ng &bull; Shift: 08:00–16:00 WAT
                </div>

                <div style={{ height: '1px', background: '#f1f5f9', margin: '4px 0' }} />

                <button
                  type="button"
                  className="popover-menu-item"
                  onClick={() => {
                    setShowUserMenu(false);
                    navigate('/admin/staff');
                  }}
                >
                  <Users size={14} />
                  <span>Staff &amp; Doctors Roster</span>
                </button>

                <button
                  type="button"
                  className="popover-menu-item"
                  onClick={() => {
                    setShowUserMenu(false);
                    navigate('/admin/settings');
                  }}
                >
                  <SettingsIcon size={14} />
                  <span>Clinic Settings &amp; Rules</span>
                </button>

                <button
                  type="button"
                  className="popover-menu-item"
                  onClick={() => {
                    setShowUserMenu(false);
                    if (lockDesk) lockDesk();
                  }}
                >
                  <Lock size={14} />
                  <span>Lock Reception Desk</span>
                </button>

                <button
                  type="button"
                  className="popover-menu-item"
                  style={{ color: '#ef4444' }}
                  onClick={() => {
                    setShowUserMenu(false);
                    if (logout) logout();
                    navigate('/login');
                  }}
                >
                  <LogOut size={14} />
                  <span>Sign Out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. Page Title & Navigation Arrows */}
      <div className="grid-booking-title-row">
        <h1 className="grid-booking-heading">Doctor Schedule &amp; Timetable Hub</h1>
        <div className="grid-booking-nav-arrows">
          <button
            type="button"
            className="nav-arrow-circle-btn"
            title="Previous Month"
            onClick={handlePrevMonth}
          >
            <ChevronLeft size={16} />
          </button>
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>
            {calendarMonthLabel}
          </span>
          <button
            type="button"
            className="nav-arrow-circle-btn"
            title="Next Month"
            onClick={handleNextMonth}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* 3. Horizontal Specialty Category Pills Bar (From Clinic Memory) */}
      <div className="specialty-pills-bar">
        {CLINIC_SPECIALTIES.map((cat) => (
          <button
            key={cat}
            type="button"
            className={`specialty-pill-btn ${selectedSpecialty === cat ? 'active' : ''}`}
            onClick={() => setSelectedSpecialty(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* 4. Three-Column Bento Grid Layout */}
      <div className="grid-booking-bento-layout">
        {/* ==================================================================
            Column 1: Choose Doctor (Cards List)
            ================================================================== */}
        <div className="column-choose-doctor">
          <div className="column-section-title">Choose Doctor</div>

          {filteredDoctors.map((doc) => {
            const meta = DOCTOR_META[doc.id] || DOCTOR_META['doc-bello'];
            const isSelected = doc.id === currentDoctor?.id;
            const staticCount = Object.values(meta.weekAppointments || {}).reduce(
              (acc, arr) => acc + arr.length,
              0
            );
            const dynamicCount = storeBlocks.filter(
              (b) => b.doctorId === doc.id && (b.type === 'appointment' || b.type === 'hold')
            ).length;
            const weekApptsCount = staticCount + dynamicCount;

            return (
              <div
                key={doc.id}
                className={`doctor-select-card ${isSelected ? 'selected' : ''}`}
                onClick={() => setSelectedDoctorId(doc.id)}
                role="button"
                tabIndex={0}
              >
                <div className="doctor-card-info-row">
                  <div className="doctor-card-avatar">
                    {doc.avatar || doc.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="doctor-card-text">
                    <span className="doctor-card-name">{doc.name}</span>
                    <span className="doctor-card-experience">
                      {meta.experience}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <span className="doctor-card-specialty-tag">
                        {doc.specialty || 'General Practice'}
                      </span>
                      <span style={{ fontSize: '10px', color: '#16a34a', fontWeight: 600 }}>
                        &bull; {weekApptsCount} visits this week
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
                  <span className="timetable-status-dot" />
                  <strong style={{ color: '#0f172a' }}>On Duty</strong> &bull;{' '}
                  <span style={{ color: '#0369a1', fontWeight: 600 }}>{currentDoctor?.specialty}</span> &bull;{' '}
                  <span>{activeDocMeta.suite}</span> &bull;{' '}
                  <span className="tabular-nums">{activeDocMeta.shift}</span>
                </span>
              </div>
            </div>

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

          {/* Timetable Control Strip: Horizon Toggle & Functional Day Navigation */}
          <div className="timetable-control-strip">
            <div className="timetable-date-indicator">
              <CalendarIcon size={14} color="#0c1a30" />
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
                <strong style={{ color: '#0f172a' }}>1</strong> Emergency Reserve
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
              {selectedDayName === 'Sunday' ? (
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
              ) : activeDayAppointments.length === 0 ? (
                <div style={{ padding: '32px', textAlign: 'center', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                  <CalendarIcon size={22} color="#64748b" style={{ margin: '0 auto 6px auto', display: 'block' }} />
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>No Scheduled Appointments</div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                    All slots are open for walk-in bookings or online patient requests.
                  </div>
                </div>
              ) : (
                /* Chronological Scheduled Appointments */
                activeDayAppointments.map((apt) => (
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
                ))
              )}

              {/* Clinic Lunch Break Event */}
              {selectedDayName !== 'Sunday' && (
                <div className="bento-agenda-card event-break">
                  <div className="bento-time-col">
                    <span className="bento-time-primary">12:00 PM</span>
                    <span className="bento-duration-sub">until 01:00 PM</span>
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
              )}

              {/* Emergency Walk-In Reserve Slot */}
              {selectedDayName !== 'Sunday' && (
                <div className="bento-agenda-card event-reserve">
                  <div className="bento-time-col">
                    <span className="bento-time-primary">01:30 PM</span>
                    <span className="bento-duration-sub">until 02:00 PM</span>
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
                      Protected triage slot for unscheduled urgent walk-in arrivals
                    </div>
                  </div>
                  <div className="bento-actions-col">
                    <button
                      type="button"
                      className="event-action-btn-sm"
                      onClick={() => onOpenWalkInBooking && onOpenWalkInBooking(currentDoctor?.id, selectedDate, '01:30 PM')}
                    >
                      Assign
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Horizon View B: 7-Day Overview for Active Doctor (Full Patient Reviews per Day) */
            <div className="week-overview-grid">
              {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day, idx) => {
                const dayAppts = activeDocMeta.weekAppointments?.[day] || [];
                const isSelected = selectedDayName === day;
                // Calculate date for this day of week in current week (base Monday Oct 26)
                const computedDayNumber = 26 + idx;

                return (
                  <div
                    key={day}
                    className="week-day-card"
                    style={{
                      borderColor: isSelected ? '#0c1a30' : '#e2e8f0',
                      background: isSelected ? '#ffffff' : '#f8fafc',
                    }}
                  >
                    <div className="week-day-header">
                      <div>
                        <span className="week-day-title">{day}</span>
                        <span style={{ fontSize: '11px', color: '#64748b', marginLeft: '6px' }}>
                          Oct {computedDayNumber}
                        </span>
                      </div>
                      <span className="week-day-count">{dayAppts.length} visits</span>
                    </div>

                    {/* Complete List of Patients for This Day */}
                    <div className="week-day-patient-list">
                      {dayAppts.map((apt) => (
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
                      ))}
                    </div>

                    <button
                      type="button"
                      className="week-day-action-btn"
                      onClick={() => {
                        setSelectedDate(new Date(2026, 9, computedDayNumber));
                        setTimetableHorizon('day');
                      }}
                    >
                      Switch to {day} Timetable &rarr;
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
            <Plus size={14} color="#0c1a30" />
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
                  selectedDate.getFullYear() === calendarYear &&
                  selectedDate.getMonth() === calendarMonthIdx &&
                  selectedDate.getDate() === dayNum;

                // Highlight dates that have scheduled appointments
                const hasAppts = [5, 9, 14, 16, 22, 26, 27, 28, 29, 30].includes(dayNum);

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
    </div>
  );
};
