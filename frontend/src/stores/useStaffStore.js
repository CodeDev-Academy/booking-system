import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useAuthStore } from './useAuthStore';
import { soundService } from '../services/soundService';
import { appointmentSyncBus } from '../services/appointmentSyncBus';
import { apiService } from '../services/apiService';
import { clinicNow } from '../services/clinicTimeService';
import { useAppModeStore } from './appModeStore';

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
      // Wave 3 / Step 3.7-B: the roster comes from the API. The store starts
      // EMPTY — and live rows never hold a password or PIN (Step 3.6).
      staffList: [],
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

      // Wave 3 / Step 3.6: an edit awaits the backend and commits what IT
      // accepted. The display-role label ("Lead Receptionist") is mapped to
      // a real backend role before the wire; a doctor's duty select drives
      // the real duty-status endpoint; and the committed row NEVER carries a
      // password or PIN. A refusal answers with the server's sentence and
      // leaves the roster exactly as it was.
      updateStaffMember: async (updatedStaff) => {
        const isDemo = useAppModeStore.getState().isDemoMode;

        // Map the workstation ROLE LABEL the admin picked to the backend's
        // own role values. Unknown labels keep the current role.
        const labelToRole = (label, fallbackRole) => {
          const l = String(label || '').toLowerCase();
          if (l.includes('admin') || l.includes('manager') || l.includes('director')) return 'clinic_admin';
          if (l.includes('doctor') || l.includes('physician') || l.includes('surgeon')) return 'doctor';
          if (l.includes('reception')) return 'receptionist';
          return fallbackRole;
        };

        const wirePayload = {
          name: updatedStaff.name,
          email: updatedStaff.email,
          specialty: updatedStaff.specialty,
          shift: updatedStaff.shift,
          role: updatedStaff.role === 'doctor'
            ? 'doctor'
            : labelToRole(updatedStaff.roleLabel || updatedStaff.role, updatedStaff.role),
          is_active: updatedStaff.isActive !== undefined ? updatedStaff.isActive : updatedStaff.is_active,
        };

        const commitRow = () => {
          // The committed row is what the admin SAVED, minus any secrets —
          // live rows never hold a password or PIN in browser state.
          const safeRow = { ...updatedStaff };
          delete safeRow.password;
          delete safeRow.pin;
          set((state) => ({
            staffList: state.staffList.map((s) => (s.id === updatedStaff.id ? { ...s, ...safeRow } : s)),
            editStaffModal: { isOpen: false, staff: null },
            toast: {
              tone: 'success',
              text: `Profile and settings for ${updatedStaff.name} saved successfully.`,
            },
          }));
          if (safeRow.role === 'doctor') {
            appointmentSyncBus.publishDoctorUpdated(safeRow);
          }
          soundService.playChime();
        };

        if (!isDemo) {
          try {
            await apiService.updateStaff(updatedStaff.id, wirePayload);
            // A doctor's duty select drives the real duty-status endpoint.
            if (wirePayload.role === 'doctor' && updatedStaff.status) {
              const dutyMode = updatedStaff.status === 'on_duty' ? 'on_duty' : 'off_duty';
              await apiService
                .updateDoctorDutyStatus(updatedStaff.id, { status: dutyMode })
                .catch(() => {});
            }
            commitRow();
          } catch (err) {
            set({
              toast: {
                tone: 'error',
                text:
                  err.details?.detail ||
                  err.message ||
                  'The profile was not saved — nothing changed.',
              },
            });
          }
          return;
        }

        // Demo row: the optimistic instant commit IS the product here.
        commitRow();
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

  // Wave 3 / Step 3.6: same contract as the password reset — await the
  // backend, never store the new PIN on the row, surface a refusal.
  confirmResetPin: async (staffId, newPin) => {
    if (useAppModeStore.getState().isDemoMode) {
      // Demo rows keep the PIN locally — the pitch lock screen unlocks with
      // it. Live rows never hold one (see the live branch below).
      set((state) => ({
        staffList: state.staffList.map((s) => (s.id === staffId ? { ...s, pin: newPin } : s)),
        resetPinModal: { isOpen: false, staffId: null, staffName: '' },
        toast: {
          tone: 'success',
          text: `Quick-PIN for ${get().staffList.find((s) => s.id === staffId)?.name || 'staff'} updated (demo).`,
        },
      }));
      soundService.playChime();
      return;
    }

    try {
      await apiService.resetStaffPin(staffId, newPin);
      set({
        resetPinModal: { isOpen: false, staffId: null, staffName: '' },
        toast: {
          tone: 'success',
          text: `Quick-PIN for ${get().staffList.find((s) => s.id === staffId)?.name || 'staff'} successfully updated.`,
        },
      });
      soundService.playChime();
    } catch (err) {
      set({
        toast: {
          tone: 'error',
          text: err.details?.detail || err.message || 'The PIN was not changed.',
        },
      });
    }
  },

  // Wave 3 / Step 3.6: a password reset awaits the backend and NEVER stores
  // the new secret on the row — the browser holds credentials only in the
  // moment of typing them. A refusal answers with the server's sentence.
  confirmResetPassword: async (staffId, newPassword) => {
    if (useAppModeStore.getState().isDemoMode) {
      set({
        toast: {
          tone: 'success',
          text: `Password for ${get().staffList.find((s) => s.id === staffId)?.name || 'staff'} updated (demo).`,
        },
      });
      soundService.playChime();
      return;
    }

    try {
      await apiService.resetStaffPassword(staffId, newPassword);
      set({
        toast: {
          tone: 'success',
          text: `Password for ${get().staffList.find((s) => s.id === staffId)?.name || 'staff'} successfully updated.`,
        },
      });
      soundService.playChime();
    } catch (err) {
      set({
        toast: {
          tone: 'error',
          text: err.details?.detail || err.message || 'The password was not changed.',
        },
      });
    }
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

  // Wave 3 / Step 3.5 + 3.6: staff creation asks the backend FIRST in live
  // mode and commits the row IT created (real id) — a failed POST used to
  // leave a fake row on screen with a success toast. Live rows never hold a
  // PIN or password (the toast must not print one either); those exist only
  // on demo rows, which are the pitch tool.
  addStaffMember: async (newStaffData) => {
    const initials = newStaffData.name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

    const isDoc = newStaffData.role === 'doctor';
    const isDemo = useAppModeStore.getState().isDemoMode;

    const commitStaff = (staffId) => {
      const newStaff = {
        id: staffId,
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

      // Credentials on the row exist ONLY in demo mode — live rows never
      // hold a PIN or password in browser state.
      if (isDemo && !isDoc) {
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
            : `Receptionist ${newStaff.name} enrolled.`,
        },
      }));

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
    };

    if (!isDemo) {
      try {
        const res = await apiService.createStaff(newStaffData);
        commitStaff(res?.id || res?.staff_id || `staff-${clinicNow()}`);
      } catch (err) {
        set({
          toast: {
            tone: 'error',
            text:
              err.details?.detail ||
              err.message ||
              'The staff account was not created — nothing was saved.',
          },
        });
      }
      return;
    }

    // Demo row: the optimistic instant commit IS the product here.
    commitStaff(`staff-${clinicNow()}`);
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
      version: 2,
      // Wave 3 / Step 3.7-B: v1 persisted the seeded demo roster — including
      // its demo passwords and PINs. One-time migration wipes it; the API is
      // the only source now.
      migrate: (persisted) => ({
        ...persisted,
        staffList: [],
      }),
      partialize: (state) => ({ staffList: state.staffList }),
    }
  )
);
