import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useAuthStore } from './useAuthStore';
import { soundService } from '../services/soundService';
import { appointmentSyncBus } from '../services/appointmentSyncBus';
import { apiService } from '../services/apiService';
import { useAppModeStore } from './appModeStore';

const INITIAL_STAFF = [
  {
    id: 'staff-01',
    name: 'Sarah Aliyu',
    email: 'sarah.aliyu@cedarcare.ng',
    role: 'receptionist',
    roleLabel: 'Senior Receptionist',
    shift: '08:00 – 16:00 WAT',
    specialty: 'Patient Triage & Reception Desk',
    pin: '1234',
    password: 'password123',
    status: 'on_duty', // 'on_duty' | 'on_break' | 'on_leave'
    clockInTime: '07:54 AM',
    punctuality: 'Punctual (+6m early)',
    patientsHandled: 14,
    isActive: true,
    avatar: 'SA',
  },
  {
    id: 'staff-02',
    name: 'Maryam Danladi',
    email: 'maryam.d@cedarcare.ng',
    role: 'receptionist',
    roleLabel: 'Front-Desk Coordinator',
    shift: '12:00 – 19:00 WAT',
    specialty: 'Booking Verification & Follow-Up',
    pin: '5678',
    password: 'maryam2026',
    status: 'on_duty',
    clockInTime: '11:58 AM',
    punctuality: 'Punctual (+2m early)',
    patientsHandled: 9,
    isActive: true,
    avatar: 'MD',
  },
  {
    id: 'doc-bello',
    name: 'Dr. Aminu Bello',
    email: 'dr.bello@cedarcare.ng',
    role: 'doctor',
    roleLabel: 'Consultant Dental Surgeon',
    shift: '09:00 – 17:00 WAT',
    specialty: 'Dental Surgery & Implantology',
    status: 'on_duty',
    clockInTime: '08:48 AM',
    punctuality: 'Punctual (+12m early)',
    patientsHandled: 5,
    isActive: true,
    avatar: 'AB',
  },
  {
    id: 'doc-okafor',
    name: 'Dr. Chinelo Okafor',
    email: 'dr.okafor@cedarcare.ng',
    role: 'doctor',
    roleLabel: 'General Medical Practitioner',
    shift: '08:00 – 16:00 WAT',
    specialty: 'Family Medicine & Health Screenings',
    status: 'on_duty',
    clockInTime: '08:04 AM',
    punctuality: 'Punctual (4m grace)',
    patientsHandled: 4,
    isActive: true,
    avatar: 'CO',
  },
  {
    id: 'doc-babawo',
    name: 'Dr. Babawo',
    email: 'dr.babawo@cedarcare.ng',
    role: 'doctor',
    roleLabel: 'Consultant Physician & Surgeon',
    shift: '08:00 – 17:00 WAT',
    specialty: 'Consultant Physician & Surgeon',
    status: 'on_duty',
    clockInTime: '07:50 AM',
    punctuality: 'Punctual (+10m early)',
    patientsHandled: 7,
    isActive: true,
    avatar: 'BW',
  },
];

// Helper to download a string as a CSV file in browser
const downloadCSV = (filename, csvContent) => {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const useStaffStore = create(
  persist(
    (set, get) => ({
      staffList: INITIAL_STAFF,
      selectedTab: 'all', // 'all' | 'doctor' | 'receptionist'
      searchQuery: '',

      // Modals state
      addStaffModalOpen: false,
      editStaffModal: {
        isOpen: false,
        staff: null,
      },
      resetPinModal: {
        isOpen: false,
        staffId: null,
        staffName: '',
      },

      toast: null,

      // --- ACTIONS ---

      setSelectedTab: (tab) => set({ selectedTab: tab }),
      setSearchQuery: (query) => set({ searchQuery: query }),

      // Edit Staff Modal Actions
      openEditStaffModal: (staff) => set({ editStaffModal: { isOpen: true, staff } }),
      closeEditStaffModal: () => set({ editStaffModal: { isOpen: false, staff: null } }),

      updateStaffMember: (updatedStaff) => {
        set((state) => ({
          staffList: state.staffList.map((s) => (s.id === updatedStaff.id ? { ...s, ...updatedStaff } : s)),
          editStaffModal: { isOpen: false, staff: null },
          toast: {
            tone: 'success',
            text: `Profile and settings for ${updatedStaff.name} saved successfully.`,
          },
        }));

        if (!useAppModeStore.getState().isDemoMode) {
          apiService.updateStaff(updatedStaff.id, updatedStaff).catch((err) => {
            console.warn('Backend updateStaff failed:', err);
          });
        }

        if (updatedStaff.role === 'doctor') {
          appointmentSyncBus.publishDoctorUpdated(updatedStaff);
        }

        soundService.playChime();
      },

  setDutyStatus: (staffId, newStatus) => {
    const staff = get().staffList.find((s) => s.id === staffId);
    set((state) => ({
      staffList: state.staffList.map((s) => (s.id === staffId ? { ...s, status: newStatus } : s)),
      toast: {
        tone: 'info',
        text: `${staff?.name || 'Staff'} status updated to: ${newStatus.replace('_', ' ').toUpperCase()}`,
      },
    }));

    if (!useAppModeStore.getState().isDemoMode && staff?.role === 'doctor') {
      apiService.updateDoctorDutyStatus(staffId, newStatus).catch(() => {});
    }

    soundService.playChime();
  },

  // 1-Click PIN Reset
  openResetPinModal: (staffId) => {
    const staff = get().staffList.find((s) => s.id === staffId);
    if (!staff) return;
    set({
      resetPinModal: {
        isOpen: true,
        staffId,
        staffName: staff.name,
      },
    });
  },

  closeResetPinModal: () => {
    set({
      resetPinModal: {
        isOpen: false,
        staffId: null,
        staffName: '',
      },
    });
  },

  confirmResetPin: (staffId, newPin) => {
    set((state) => ({
      staffList: state.staffList.map((s) => (s.id === staffId ? { ...s, pin: newPin } : s)),
      resetPinModal: { isOpen: false, staffId: null, staffName: '' },
      toast: {
        tone: 'success',
        text: `Quick-PIN for ${get().staffList.find((s) => s.id === staffId)?.name || 'staff'} successfully updated.`,
      },
    }));

    if (!useAppModeStore.getState().isDemoMode) {
      apiService.resetStaffPin(staffId, newPin).catch((err) => {
        console.warn('Backend resetPin failed:', err);
      });
    }

    soundService.playChime();
  },

  // 1-Click Deactivation with Immediate 401 Session Revocation
  toggleStaffActive: (staffId) => {
    const currentLoggedStaff = useAuthStore.getState().currentStaff;
    const targetStaff = get().staffList.find((s) => s.id === staffId);
    if (!targetStaff) return;

    const nextActiveState = !targetStaff.isActive;

    set((state) => ({
      staffList: state.staffList.map((s) =>
        s.id === staffId ? { ...s, isActive: nextActiveState } : s
      ),
      editStaffModal: state.editStaffModal.staff?.id === staffId
        ? { ...state.editStaffModal, staff: { ...state.editStaffModal.staff, isActive: nextActiveState } }
        : state.editStaffModal,
      toast: {
        tone: nextActiveState ? 'success' : 'danger',
        text: `${targetStaff.name} has been ${nextActiveState ? 'Reactivated' : 'Deactivated'}.`,
      },
    }));

    if (!useAppModeStore.getState().isDemoMode) {
      apiService.toggleStaffActive(staffId, nextActiveState).catch((err) => {
        console.warn('Backend toggleStaffActive failed:', err);
      });
    }

    // If administrator deactivated the currently active user, trigger instant session ejection!
    if (!nextActiveState && currentLoggedStaff && currentLoggedStaff.id === staffId) {
      soundService.playAlert();
      useAuthStore.getState().ejectSession('Your workstation account has been deactivated by the Administrator.');
      return;
    }

    if (nextActiveState) {
      soundService.playChime();
    } else {
      soundService.playAlert();
    }
  },

  // Add Staff Modal
  openAddStaffModal: () => set({ addStaffModalOpen: true }),
  closeAddStaffModal: () => set({ addStaffModalOpen: false }),

  addStaffMember: (newStaffData) => {
    const initials = newStaffData.name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

    const isDoc = newStaffData.role === 'doctor';

    const newStaff = {
      id: `staff-${Date.now()}`,
      name: newStaffData.name,
      email: newStaffData.email,
      role: newStaffData.role,
      roleLabel: isDoc ? 'Clinical Doctor' : 'Front-Desk Receptionist',
      shift: newStaffData.shift || '08:00 – 16:00 WAT',
      specialty: newStaffData.specialty || (isDoc ? 'General Practice' : 'Reception Triage'),
      status: 'on_duty',
      clockInTime: 'Just now',
      punctuality: 'On Time',
      patientsHandled: 0,
      isActive: true,
      avatar: initials || 'ST',
    };

    if (!isDoc) {
      newStaff.pin = newStaffData.pin || '1234';
      newStaff.password = newStaffData.password || 'password123';
    }

    set((state) => ({
      staffList: [...state.staffList, newStaff],
      addStaffModalOpen: false,
      toast: {
        tone: 'success',
        text: isDoc
          ? `Doctor ${newStaff.name} enrolled and reflected across all clinical schedules.`
          : `Receptionist ${newStaff.name} enrolled with Quick-PIN ${newStaff.pin}.`,
      },
    }));

    if (!useAppModeStore.getState().isDemoMode && !isDoc) {
      apiService.createStaff(newStaffData).catch((err) => {
        console.warn('Backend createStaff failed:', err);
      });
    }

    if (isDoc) {
      const docCalendarData = {
        id: newStaff.id,
        name: newStaff.name,
        specialty: newStaff.specialty,
        shiftStartMin: 8 * 60,
        shiftEndMin: 17 * 60,
        serviceIds: ['svc-checkup', 'svc-dental', 'svc-extract'],
        isOnDuty: true,
        isEmergencyLeave: false,
        emergencyReason: null,
      };
      appointmentSyncBus.publishDoctorEnrolled(docCalendarData);
    }

    soundService.playChime();
  },

  // 1-Click CSV Exporters
  exportAppointmentsCSV: async () => {
    if (!useAppModeStore.getState().isDemoMode) {
      try {
        await apiService.downloadAppointmentsCSV();
        set({
          toast: {
            tone: 'success',
            text: 'Appointments CSV exported from database successfully.',
          },
        });
        soundService.playChime();
        return;
      } catch (err) {
        console.warn('Live appointments CSV download failed, using local export:', err);
      }
    }

    const headers = [
      'Appointment ID',
      'Patient Name',
      'Phone Number',
      'Doctor Name',
      'Procedure',
      'Scheduled Time (WAT)',
      'Status',
      'Fee (NGN)',
    ];

    const sampleRows = [
      ['AP-1037', 'Amina Yusuf', '+234 801 234 5678', 'Dr. Aminu Bello', 'Tooth Extraction', '09:00 AM', 'Completed', '35000'],
      ['AP-1038', 'Tunde Musa', '+234 801 111 2233', 'Dr. Aminu Bello', 'Dental Consultation', '10:00 AM', 'Completed', '15000'],
      ['AP-1039', 'Fatima Bello', '+234 802 333 4455', 'Dr. Aminu Bello', 'Dental Consultation', '11:30 AM', 'In Consultation', '15000'],
      ['AP-1040', 'Kenneth Danjuma', '+234 812 444 9900', 'Dr. Chinelo Okafor', 'General Health Check-up', '11:45 AM', 'In Consultation', '12000'],
      ['AP-1041', 'Kolawole Adeyemi', '+234 803 555 0192', 'Dr. Chinelo Okafor', 'General Health Check-up', '12:15 PM', 'Waiting', '12000'],
      ['AP-1042', 'Chiamaka Obi', '+234 809 777 1234', 'Dr. Aminu Bello', 'Tooth Extraction', '01:00 PM', 'Waiting', '35000'],
      ['AP-1043', 'Aliyu Garba', '+234 802 444 8899', 'Dr. Babawo', 'General Health Check-up', '02:00 PM', 'Waiting', '12000'],
    ];

    const csvString = [
      headers.join(','),
      ...sampleRows.map((r) => r.map((field) => `"${String(field).replace(/"/g, '""')}"`).join(',')),
    ].join('\r\n');

    const dateStr = new Date().toISOString().split('T')[0];
    downloadCSV(`cedarcare-appointments-${dateStr}.csv`, csvString);

    set({
      toast: {
        tone: 'success',
        text: `Appointments CSV exported successfully (${sampleRows.length} records).`,
      },
    });

    soundService.playChime();
  },

  exportAttendanceCSV: async () => {
    if (!useAppModeStore.getState().isDemoMode) {
      try {
        await apiService.downloadAttendanceCSV();
        set({
          toast: {
            tone: 'success',
            text: 'Staff Attendance CSV exported from database successfully.',
          },
        });
        soundService.playChime();
        return;
      } catch (err) {
        console.warn('Live attendance CSV download failed, using local export:', err);
      }
    }

    const headers = [
      'Staff ID',
      'Full Name',
      'Email Address',
      'Role',
      'Shift (WAT)',
      'Duty Status',
      'Clock In Time',
      'Punctuality',
      'Patients Handled Today',
      'Account Active',
    ];

    const staffRows = get().staffList.map((s) => [
      s.id,
      s.name,
      s.email,
      s.roleLabel,
      s.shift,
      s.status.toUpperCase(),
      s.clockInTime,
      s.punctuality,
      s.patientsHandled,
      s.isActive ? 'ACTIVE' : 'DEACTIVATED',
    ]);

    const csvString = [
      headers.join(','),
      ...staffRows.map((r) => r.map((field) => `"${String(field).replace(/"/g, '""')}"`).join(',')),
    ].join('\r\n');

    const dateStr = new Date().toISOString().split('T')[0];
    downloadCSV(`cedarcare-staff-attendance-${dateStr}.csv`, csvString);

    set({
      toast: {
        tone: 'success',
        text: `Staff Attendance CSV exported successfully (${staffRows.length} staff records).`,
      },
    });

    soundService.playChime();
  },

  dismissToast: () => set({ toast: null }),
    }),
    {
      name: 'cedarcare_staff_store',
      partialize: (state) => ({ staffList: state.staffList }),
    }
  )
);
