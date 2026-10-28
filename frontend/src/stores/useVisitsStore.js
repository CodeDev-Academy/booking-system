import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DOCTORS, SERVICES, startOfDayOffset, at, formatNaira } from '../services/mockData';
import { getDoctor, getService } from '../services/slotEngine';
import { soundService } from '../services/soundService';
import { appointmentSyncBus } from '../services/appointmentSyncBus';
import { apiService } from '../services/apiService';
import { useAppModeStore } from './appModeStore';

const MIN = 60000;

// Seed realistic initial in-clinic patient visits for today
const buildInitialVisits = () => {
  const now = Date.now();
  return [
    // 1. In Waiting Room (Arrived at reception)
    {
      id: 'VIS-200',
      appointmentId: 'AP-1019',
      patientName: 'Ngozi Okonjo',
      patientPhone: '+234 803 555 9911',
      patientType: 'returning',
      doctorId: 'doc-bello',
      serviceId: 'svc-dental',
      roomName: 'Dental Suite 1',
      scheduledTime: now - 10 * MIN,
      arrivedAt: now - 5 * MIN, // 5 mins in lobby
      consultationStartedAt: null,
      completedAt: null,
      status: 'waiting',
      paymentStatus: 'paid',
      followUp: null,
      welfareSent: false,
    },
    {
      id: 'VIS-201',
      appointmentId: 'AP-1041',
      patientName: 'Kolawole Adeyemi',
      patientPhone: '+234 803 555 0192',
      patientType: 'new',
      doctorId: 'doc-okafor',
      serviceId: 'svc-checkup',
      roomName: 'Suite B (General Care)',
      scheduledTime: now - 15 * MIN,
      arrivedAt: now - 8 * MIN, // 8 mins in lobby
      consultationStartedAt: null,
      completedAt: null,
      status: 'waiting',
      paymentStatus: 'paid',
      followUp: null,
      welfareSent: false,
    },
    {
      id: 'VIS-202',
      appointmentId: 'AP-1042',
      patientName: 'Chiamaka Obi',
      patientPhone: '+234 809 777 1234',
      patientType: 'new',
      doctorId: 'doc-bello',
      serviceId: 'svc-extract',
      roomName: 'Dental Suite 1',
      scheduledTime: now - 25 * MIN,
      arrivedAt: now - 23 * MIN, // 23 mins in lobby (amber alert)
      consultationStartedAt: null,
      completedAt: null,
      status: 'waiting',
      paymentStatus: 'pending',
      followUp: null,
      welfareSent: false,
    },

    // 2. In Active Consultation
    {
      id: 'VIS-203',
      appointmentId: 'AP-1039',
      patientName: 'Fatima Bello',
      patientPhone: '+234 802 333 4455',
      patientType: 'returning',
      doctorId: 'doc-bello',
      serviceId: 'svc-dental',
      roomName: 'Dental Suite 1',
      scheduledTime: now - 35 * MIN,
      arrivedAt: now - 30 * MIN,
      consultationStartedAt: now - 18 * MIN, // 18m of 30m consultation elapsed
      completedAt: null,
      status: 'in_consultation',
      paymentStatus: 'paid',
      followUp: null,
      welfareSent: false,
    },
    {
      id: 'VIS-204',
      appointmentId: 'AP-1040',
      patientName: 'Kenneth Danjuma',
      patientPhone: '+234 812 444 9900',
      patientType: 'returning',
      doctorId: 'doc-okafor',
      serviceId: 'svc-checkup',
      roomName: 'Suite B (General Care)',
      scheduledTime: now - 20 * MIN,
      arrivedAt: now - 15 * MIN,
      consultationStartedAt: now - 9 * MIN, // 9m of 20m consultation elapsed
      completedAt: null,
      status: 'in_consultation',
      paymentStatus: 'paid',
      followUp: null,
      welfareSent: false,
    },

    // 3. Completed Today
    {
      id: 'VIS-205',
      appointmentId: 'AP-1038',
      patientName: 'Tunde Musa',
      patientPhone: '+234 801 111 2233',
      patientType: 'returning',
      doctorId: 'doc-bello',
      serviceId: 'svc-dental',
      roomName: 'Dental Suite 1',
      scheduledTime: now - 90 * MIN,
      arrivedAt: now - 85 * MIN,
      consultationStartedAt: now - 75 * MIN,
      completedAt: now - 45 * MIN,
      status: 'completed',
      paymentStatus: 'paid',
      followUp: {
        preset: '6-Mos Hygiene Check',
        targetDate: '15 Apr 2027',
        notes: 'Advised routine biannual scaling and polishing.',
      },
      welfareSent: false,
    },
    {
      id: 'VIS-206',
      appointmentId: 'AP-1037',
      patientName: 'Amina Yusuf',
      patientPhone: '+234 801 234 5678',
      patientType: 'returning',
      doctorId: 'doc-bello',
      serviceId: 'svc-extract',
      roomName: 'Dental Suite 1',
      scheduledTime: now - 120 * MIN,
      arrivedAt: now - 115 * MIN,
      consultationStartedAt: now - 105 * MIN,
      completedAt: now - 60 * MIN,
      status: 'completed',
      paymentStatus: 'paid',
      followUp: {
        preset: '1-Wk Post-Op',
        targetDate: '22 Oct 2026',
        notes: 'Check socket healing after lower molar extraction.',
      },
      welfareSent: false,
    },
  ];
};

// Seed today's expected pre-booked appointments (awaiting physical check-in at front desk)
const buildInitialExpected = () => {
  const now = Date.now();
  return [
    {
      id: 'EXP-101',
      appointmentId: 'AP-1043',
      patientName: 'Oluwaseun Bakare',
      patientPhone: '+234 802 888 1902',
      patientType: 'returning',
      doctorId: 'doc-okafor',
      serviceId: 'svc-checkup',
      roomName: 'Suite B (General Care)',
      scheduledTime: now + 20 * MIN,
      scheduledTimeStr: '11:00 AM',
      notes: 'Routine health check & BP review.',
    },
    {
      id: 'EXP-102',
      appointmentId: 'AP-1044',
      patientName: 'Babajide Sanwo',
      patientPhone: '+234 814 333 7788',
      patientType: 'returning',
      doctorId: 'doc-okafor',
      serviceId: 'svc-checkup',
      roomName: 'Suite B (General Care)',
      scheduledTime: now + 50 * MIN,
      scheduledTimeStr: '11:30 AM',
      notes: 'Cardio follow-up & prescription renewal.',
    },
    {
      id: 'EXP-103',
      appointmentId: 'AP-1045',
      patientName: 'Aisha Mohammed',
      patientPhone: '+234 805 111 6543',
      patientType: 'returning',
      doctorId: 'doc-bello',
      serviceId: 'svc-dental',
      roomName: 'Dental Suite 1',
      scheduledTime: now + 90 * MIN,
      scheduledTimeStr: '02:00 PM',
      notes: 'Biannual scaling & polishing.',
    },
  ];
};

export const useVisitsStore = create(
  persist(
    (set, get) => ({
  visits: buildInitialVisits(),
  expectedToday: buildInitialExpected(),
  selectedDoctorFilter: 'all', // 'all' | 'doc-bello' | 'doc-okafor'

  // Modals
  followUpModal: {
    isOpen: false,
    visitId: null,
  },
  welfareModal: {
    isOpen: false,
    visitId: null,
  },

  // Toast
  toast: null,

  // --- ACTIONS ---

  setDoctorFilter: (filter) => set({ selectedDoctorFilter: filter }),

  // 1-Click Reception Attendance: Admit scheduled appointment into Waiting Room
  markPatientPresent: (expectedId) => {
    const exp = get().expectedToday.find((e) => e.id === expectedId);
    if (!exp) return;

    const newVisit = {
      id: `VIS-${Math.floor(200 + Math.random() * 800)}`,
      appointmentId: exp.appointmentId,
      patientName: exp.patientName,
      patientPhone: exp.patientPhone,
      patientType: exp.patientType,
      doctorId: exp.doctorId,
      serviceId: exp.serviceId,
      roomName: exp.roomName,
      scheduledTime: exp.scheduledTime,
      arrivedAt: Date.now(),
      consultationStartedAt: null,
      completedAt: null,
      status: 'waiting',
      paymentStatus: 'paid',
      followUp: null,
      welfareSent: false,
    };

    set((state) => ({
      expectedToday: state.expectedToday.filter((e) => e.id !== expectedId),
      visits: [newVisit, ...state.visits],
      toast: {
        tone: 'success',
        text: `Attendance Confirmed: ${exp.patientName} marked present. Admitted to Waiting Lobby.`,
      },
    }));

    appointmentSyncBus.publishVisitStatusChanged({
      appointmentId: exp.appointmentId,
      status: 'waiting',
    });

    if (!useAppModeStore.getState().isDemoMode) {
      apiService.updateAppointmentStatus(exp.appointmentId, 'arrived').catch((err) => {
        console.warn('Backend mark present failed:', err);
      });
    }

    soundService.playChime();
  },

  // Admit from calendar or external appointment object
  admitAppointment: (appt) => {
    const aptId = appt.appointmentId || appt.id;
    const doc = getDoctor(appt.doctorId) || DOCTORS[0];
    const service = getService(appt.serviceId) || SERVICES[0];

    // Check if already in active visits
    const existing = get().visits.find((v) => v.appointmentId === aptId || v.id === aptId);
    if (existing) {
      if (existing.status !== 'waiting') {
        get().reinstateVisit(existing.id);
      }
      return;
    }

    // Check if in expectedToday
    const exp = get().expectedToday.find((e) => e.appointmentId === aptId || e.id === aptId);
    if (exp) {
      get().markPatientPresent(exp.id);
      return;
    }

    const newVisit = {
      id: `VIS-${Math.floor(200 + Math.random() * 800)}`,
      appointmentId: aptId,
      patientName: appt.patientName || 'Patient',
      patientPhone: appt.patientPhone || appt.phone || '+234 800 000 0000',
      patientType: appt.patientType || 'new',
      doctorId: doc.id,
      serviceId: service.id,
      roomName: doc.id === 'doc-bello' ? 'Dental Suite 1' : 'Suite B (General Care)',
      scheduledTime: appt.start || Date.now(),
      arrivedAt: Date.now(),
      consultationStartedAt: null,
      completedAt: null,
      status: 'waiting',
      paymentStatus: 'paid',
      notes: appt.notes || 'Checked in from Master Calendar.',
      followUp: null,
      welfareSent: false,
    };

    set((state) => ({
      visits: [newVisit, ...state.visits],
      toast: {
        tone: 'success',
        text: `Checked In: ${newVisit.patientName} admitted to Waiting Lobby.`,
      },
    }));

    appointmentSyncBus.publishVisitStatusChanged({
      appointmentId: aptId,
      status: 'waiting',
    });

    soundService.playChime();
  },

  // Walk-In Check-In from front desk
  checkInVisit: (patientName, phone, doctorId, serviceId, patientType = 'new', notes = '', extra = {}) => {
    const doc = getDoctor(doctorId) || DOCTORS[0];
    const service = getService(serviceId) || SERVICES[0];
    const newVisit = {
      id: `VIS-${Math.floor(200 + Math.random() * 800)}`,
      appointmentId: `AP-${Math.floor(1000 + Math.random() * 9000)}`,
      patientName: patientName || 'Walk-In Patient',
      patientPhone: phone || '+234 800 000 0000',
      patientType: patientType || (patientName === 'Ngozi Okonjo' ? 'returning' : 'new'),
      dateOfBirth: extra.dateOfBirth || null,
      gender: extra.gender || '',
      isEmergency: Boolean(extra.isEmergency),
      doctorId: doc.id,
      serviceId: service.id,
      roomName: doc.id === 'doc-bello' ? 'Dental Suite 1' : 'Suite B (General Care)',
      scheduledTime: Date.now(),
      arrivedAt: Date.now(),
      consultationStartedAt: null,
      completedAt: null,
      status: 'waiting',
      paymentStatus: 'paid',
      notes: notes || (extra.isEmergency ? '⚠️ URGENT / EMERGENCY Walk-In Admission' : 'Front-desk walk-in registration.'),
      followUp: null,
      welfareSent: false,
    };

    set((state) => ({
      visits: [newVisit, ...state.visits],
      toast: {
        tone: extra.isEmergency ? 'rose' : 'success',
        text: extra.isEmergency
          ? `🚨 Urgent Walk-In Admitted: ${newVisit.patientName} flagged for Priority Clinical Attention!`
          : `Walk-In Admitted: ${newVisit.patientName} registered and seated in Waiting Room.`,
      },
    }));

    // Broadcast cross-store synchronization to Calendar & Queue
    appointmentSyncBus.publishWalkInAdmitted(newVisit);

    if (!useAppModeStore.getState().isDemoMode) {
      apiService
        .registerWalkIn({
          doctorId: doc.id,
          serviceId: service.id,
          patientName,
          phone,
          notes: newVisit.notes,
          startTs: newVisit.scheduledTime,
          dateOfBirth: extra.dateOfBirth,
          gender: extra.gender,
          isEmergency: extra.isEmergency,
        })
        .then((res) => {
          if (res && res.appointment_code) {
            set((state) => ({
              visits: state.visits.map((v) =>
                v.id === newVisit.id ? { ...v, appointmentId: res.appointment_code } : v
              ),
            }));
          }
        })
        .catch((err) => {
          console.warn('Backend walk-in registration failed:', err);
        });
    }

    soundService.playChime();
  },

  // 1-Click: Waiting -> Consultation
  sendToConsultation: (visitId) => {
    const visit = get().visits.find((v) => v.id === visitId);
    if (!visit) return;

    set((state) => ({
      visits: state.visits.map((v) =>
        v.id === visitId
          ? {
              ...v,
              status: 'in_consultation',
              consultationStartedAt: Date.now(),
            }
          : v
      ),
      toast: {
        tone: 'info',
        text: `${visit.patientName} called into ${visit.roomName} with ${getDoctor(visit.doctorId)?.name || 'Doctor'}.`,
      },
    }));

    if (visit.appointmentId) {
      appointmentSyncBus.publishVisitStatusChanged({
        appointmentId: visit.appointmentId,
        status: 'in_consultation',
      });

      if (!useAppModeStore.getState().isDemoMode) {
        apiService.updateAppointmentStatus(visit.appointmentId, 'in_consultation').catch((err) => {
          console.warn('Backend update status failed:', err);
        });
      }
    }

    soundService.playChime();
  },

  // Open Follow-up modal when doctor finishes
  openFollowUpModal: (visitId) => {
    set({
      followUpModal: {
        isOpen: true,
        visitId,
      },
    });
  },

  closeFollowUpModal: () => {
    set({
      followUpModal: {
        isOpen: false,
        visitId: null,
      },
    });
  },

  // Finalize consultation & record follow-up recall
  completeVisit: (visitId, followUpData = null) => {
    const visit = get().visits.find((v) => v.id === visitId);
    if (!visit) return;

    set((state) => ({
      visits: state.visits.map((v) =>
        v.id === visitId
          ? {
              ...v,
              status: 'completed',
              completedAt: Date.now(),
              followUp: followUpData,
            }
          : v
      ),
      followUpModal: { isOpen: false, visitId: null },
      toast: {
        tone: 'success',
        text: `Visit completed for ${visit.patientName}. ${followUpData ? `Recall scheduled: ${followUpData.preset}` : 'Checkout finalized.'}`,
      },
    }));

    if (visit.appointmentId) {
      appointmentSyncBus.publishVisitStatusChanged({
        appointmentId: visit.appointmentId,
        status: 'completed',
      });

      if (!useAppModeStore.getState().isDemoMode) {
        apiService.updateAppointmentStatus(visit.appointmentId, 'completed').catch((err) => {
          console.warn('Backend complete visit failed:', err);
        });

        if (followUpData) {
          const followUpDate =
            followUpData.date ||
            new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];
          apiService
            .createFollowUp(visit.appointmentId, {
              follow_up_date: followUpDate,
              notes: followUpData.notes || followUpData.preset || 'Routine recall follow-up',
            })
            .catch((err) => {
              console.warn('Backend create follow-up failed:', err);
            });
        }
      }
    }

    soundService.playChime();
  },

  // Mark patient as No-Show
  markAsNoShow: (visitId) => {
    const visit = get().visits.find((v) => v.id === visitId);
    if (!visit) return;

    set((state) => ({
      visits: state.visits.map((v) =>
        v.id === visitId
          ? {
              ...v,
              status: 'no_show',
            }
          : v
      ),
      toast: {
        tone: 'danger',
        text: `${visit.patientName} marked as No-Show. Card moved to Missed Appointments below.`,
      },
    }));

    if (visit.appointmentId) {
      appointmentSyncBus.publishVisitStatusChanged({
        appointmentId: visit.appointmentId,
        status: 'no_show',
      });

      if (!useAppModeStore.getState().isDemoMode) {
        apiService.updateAppointmentStatus(visit.appointmentId, 'no_show').catch((err) => {
          console.warn('Backend mark no-show failed:', err);
        });
      }
    }

    soundService.playAlert();
  },

  // Re-instate a no-show patient who arrived late
  reinstateVisit: (visitId) => {
    const visit = get().visits.find((v) => v.id === visitId);
    if (!visit) return;

    set((state) => ({
      visits: state.visits.map((v) =>
        v.id === visitId
          ? {
              ...v,
              status: 'waiting',
              arrivedAt: Date.now(),
              welfareSent: false,
            }
          : v
      ),
      toast: {
        tone: 'success',
        text: `Patient ${visit.patientName} reinstated. Seated in Waiting Lobby.`,
      },
    }));

    if (visit.appointmentId) {
      appointmentSyncBus.publishVisitStatusChanged({
        appointmentId: visit.appointmentId,
        status: 'waiting',
      });
    }

    soundService.playChime();
  },

  // Open Welfare recovery modal
  openWelfareModal: (visitId) => {
    set({
      welfareModal: {
        isOpen: true,
        visitId,
      },
    });
  },

  closeWelfareModal: () => {
    set({
      welfareModal: {
        isOpen: false,
        visitId: null,
      },
    });
  },

  // Dispatch welfare message to no-show patient
  sendWelfareMessage: (visitId, customMessage) => {
    const visit = get().visits.find((v) => v.id === visitId);
    if (!visit) return;

    set((state) => ({
      visits: state.visits.map((v) =>
        v.id === visitId
          ? {
              ...v,
              welfareSent: true,
            }
          : v
      ),
      welfareModal: { isOpen: false, visitId: null },
      toast: {
        tone: 'info',
        text: `Friendly welfare message dispatched to ${visit.patientName} via Telegram/SMS.`,
      },
    }));

    soundService.playChime();
  },

  // Real-time patient counter check-in (+ Patient Arrived)
  simulatePatientArrival: () => {
    const candidates = [
      { name: 'Ngozi Okonjo', phone: '+234 803 555 9911', patientType: 'returning' },
      { name: 'Oluwaseun Bakare', phone: '+234 802 888 1902', patientType: 'new' },
      { name: 'Babajide Sanwo', phone: '+234 814 333 7788', patientType: 'new' },
      { name: 'Aisha Mohammed', phone: '+234 805 111 6543', patientType: 'new' },
    ];
    const picked = candidates[Math.floor(Math.random() * candidates.length)];
    const randomDoc = DOCTORS[Math.floor(Math.random() * DOCTORS.length)];
    const randomSvc = SERVICES[Math.floor(Math.random() * SERVICES.length)];

    get().checkInVisit(
      picked.name,
      picked.phone,
      randomDoc.id,
      randomSvc.id,
      picked.patientType
    );
  },

  addExpectedAppointment: (appt) => {
    const exists = get().expectedToday.some(
      (e) => e.appointmentId === appt.id || e.id === appt.id
    );
    if (exists) return;

    const doc = getDoctor(appt.doctorId);
    const service = getService(appt.serviceId);
    const d = new Date(appt.start);
    const scheduledTimeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const newExp = {
      id: `EXP-${Math.floor(100 + Math.random() * 900)}`,
      appointmentId: appt.id,
      patientName: appt.patientName,
      patientPhone: appt.phone || appt.patientPhone || '+234 800 000 0000',
      patientType: appt.patientType || 'new',
      doctorId: appt.doctorId,
      serviceId: appt.serviceId,
      roomName: appt.doctorId === 'doc-bello' ? 'Dental Suite 1' : 'Suite B (General Care)',
      scheduledTime: appt.start,
      scheduledTimeStr,
      notes: appt.notes || `${service?.name || 'Consultation'} with ${doc?.name || 'Doctor'}`,
    };

    set((state) => ({
      expectedToday: [newExp, ...state.expectedToday],
    }));
  },

  resetToDemoDefaults: () => {
    set({
      visits: buildInitialVisits(),
      expectedToday: buildInitialExpected(),
      toast: {
        tone: 'info',
        text: 'Live visits and lobby roster reset to clean demo seeds.',
      },
    });
  },

  dismissToast: () => set({ toast: null }),
    }),
    {
      name: 'cbs_visits_storage',
      partialize: (state) => ({
        visits: state.visits,
        expectedToday: state.expectedToday,
      }),
    }
  )
);

// Register cross-store synchronization listeners
appointmentSyncBus.subscribe('appointmentBooked', (appt) => {
  const now = new Date();
  const apptDate = new Date(appt.start);
  const isToday =
    apptDate.getDate() === now.getDate() &&
    apptDate.getMonth() === now.getMonth() &&
    apptDate.getFullYear() === now.getFullYear();

  // If appointment is for today or within next 12 hours, project into expectedToday
  if (isToday || (appt.start >= Date.now() && appt.start <= Date.now() + 12 * 3600000)) {
    useVisitsStore.getState().addExpectedAppointment(appt);
  }
});

appointmentSyncBus.subscribe('appointmentRescheduled', ({ appointmentId, newStart }) => {
  useVisitsStore.setState((state) => ({
    expectedToday: state.expectedToday.map((e) =>
      e.appointmentId === appointmentId || e.id === appointmentId
        ? {
            ...e,
            scheduledTime: newStart,
            scheduledTimeStr: new Date(newStart).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            }),
          }
        : e
    ),
  }));
});
