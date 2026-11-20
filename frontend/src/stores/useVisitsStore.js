import { create } from 'zustand';
import { persist } from 'zustand/middleware';
// Wave 3 / Step 3.7-B: mockData stays ONLY as the pitch simulator's private
// dataset (simulateIncomingVisit draws from it). Clinic rows come from the API.
import { DOCTORS, SERVICES } from '../services/mockData';
import { clinicNow } from '../services/clinicTimeService';
import { getDoctor, getService } from '../services/slotEngine';
import { soundService } from '../services/soundService';
import { appointmentSyncBus } from '../services/appointmentSyncBus';
import { apiService } from '../services/apiService';
import { useAppModeStore } from './appModeStore';

const MIN = 60000;


export const useVisitsStore = create(
  persist(
    (set, get) => ({
  // Wave 3 / Step 3.7-B: the API is the only source of clinic rows. The
  // board starts EMPTY and is filled by syncFromBackend (today's real
  // appointments). The pitch SIMULATOR keeps its own private dataset and
  // injects through simulateIncomingVisit.
  visits: [],
  expectedToday: [],
  selectedDoctorFilter: 'all',

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

  // Wave 3 / Step 3.3 — the Live Visits board reads TODAY'S REAL APPOINTMENTS.
  // The board used to be buildInitialVisits()/buildInitialExpected() demo
  // rows forever: apiService.fetchTodayAppointments existed and was never
  // called. Mapping, lane by lane:
  //   arrived          -> waiting (lobby timer from arrival_at)
  //   in_consultation  -> in_consultation
  //   completed        -> completed
  //   confirmed/held   -> expectedToday (booked, not yet at the desk)
  // An EMPTY answer empties the board — it is an answer. A FAILED fetch
  // keeps whatever is on screen (the network being down is not an empty
  // clinic). Display fields (doctor/service names, price) travel on the row
  // so the UI never needs the mock roster.
  syncFromBackend: async () => {
    if (useAppModeStore.getState().isDemoMode) return;
    try {
      const data = await apiService.fetchTodayAppointments();
      const list = Array.isArray(data) ? data : data?.results || [];

      const visits = [];
      const expectedToday = [];
      list.forEach((appt) => {
        const id = appt.appointment_code || appt.id;
        const base = {
          id,
          appointmentId: id,
          patientName: appt.patient_name || 'Patient',
          patientPhone: appt.patient_phone || '',
          doctorId: appt.doctor_id || appt.doctor || null,
          doctorName: appt.doctor_name || null,
          serviceId: appt.service_id || appt.service || null,
          serviceName: appt.service_name || null,
          servicePrice: appt.service_price ?? null,
          serviceDurationMin: appt.service_duration || null,
          patientType: appt.patient_type || 'new',
          scheduledTime: appt.start_datetime ? Date.parse(appt.start_datetime) : null,
          roomName: appt.room_name || '',
          paymentStatus: 'pending',
          followUp: null,
          welfareSent: false,
          notes: appt.notes || appt.cancellation_reason || '',
        };
        const arrivalMs = appt.arrival_at ? Date.parse(appt.arrival_at) : null;

        if (appt.status === 'arrived') {
          visits.push({
            ...base,
            status: 'waiting',
            arrivedAt: arrivalMs ?? base.scheduledTime ?? clinicNow(),
            consultationStartedAt: null,
            completedAt: null,
          });
        } else if (appt.status === 'in_consultation') {
          // The backend records when the visit was completed but not when
          // the consult started; the timer falls back to arrival, then to
          // the scheduled time, and stays honest (00:00) otherwise.
          visits.push({
            ...base,
            status: 'in_consultation',
            arrivedAt: arrivalMs ?? base.scheduledTime ?? null,
            consultationStartedAt: arrivalMs ?? base.scheduledTime ?? null,
            completedAt: null,
          });
        } else if (appt.status === 'completed') {
          visits.push({
            ...base,
            status: 'completed',
            arrivedAt: arrivalMs ?? base.scheduledTime ?? null,
            consultationStartedAt: null,
            completedAt: appt.completed_at ? Date.parse(appt.completed_at) : null,
          });
        } else if (appt.status === 'confirmed' || appt.status === 'held') {
          expectedToday.push({ ...base });
        }
        // cancelled / no_show / hold_expired never appear on today's board.
      });

      set({ visits, expectedToday });
    } catch (err) {
      console.warn('Visits syncFromBackend fallback:', err);
    }
  },

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
      arrivedAt: clinicNow(),
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
    // Wave 3 / Step 3.7-B: no mock fallbacks — a real (UUID) doctor id finds
    // nothing in the mock registry and must not silently become a demo one.
    const doc = getDoctor(appt.doctorId) || null;
    const service = getService(appt.serviceId) || null;

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
      doctorId: appt.doctorId || doc?.id || null,
      doctorName: appt.doctorName || doc?.name || null,
      serviceId: appt.serviceId || service?.id || null,
      serviceName: appt.serviceName || service?.name || null,
      roomName: appt.roomName || '',
      scheduledTime: appt.start || clinicNow(),
      arrivedAt: clinicNow(),
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
    // Wave 3 / Step 3.7-B: no mock fallbacks for a real (UUID) doctor/service.
    const doc = getDoctor(doctorId) || null;
    const service = getService(serviceId) || null;
    const newVisit = {
      id: `VIS-${Math.floor(200 + Math.random() * 800)}`,
      appointmentId: `AP-${Math.floor(1000 + Math.random() * 9000)}`,
      patientName: patientName || 'Walk-In Patient',
      patientPhone: phone || '',
      patientType: patientType || 'new',
      dateOfBirth: extra.dateOfBirth || null,
      gender: extra.gender || '',
      isEmergency: Boolean(extra.isEmergency),
      doctorId: doctorId || doc?.id || null,
      doctorName: doc?.name || null,
      serviceId: serviceId || service?.id || null,
      serviceName: service?.name || null,
      roomName: extra.roomName || '',
      scheduledTime: clinicNow(),
      arrivedAt: clinicNow(),
      consultationStartedAt: null,
      completedAt: null,
      status: 'waiting',
      paymentStatus: 'pending',
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
              consultationStartedAt: clinicNow(),
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
              completedAt: clinicNow(),
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
            new Date(clinicNow() + 14 * 86400000).toISOString().split('T')[0];
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
              arrivedAt: clinicNow(),
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
    // Wave 3 / Step 3.7-B: a reset is an honest CLEAR — syncFromBackend will
    // refill the board with today's REAL appointments.
    set({
      visits: [],
      expectedToday: [],
      toast: {
        tone: 'info',
        text: 'Board cleared. Today\'s real appointments will re-appear on the next sync.',
      },
    });
  },

  dismissToast: () => set({ toast: null }),
    }),
    {
      name: 'cbs_visits_storage',
      version: 2,
      // Wave 3 / Step 3.7-B: v1 persisted the seeded demo visits. One-time
      // migration wipes them — the API is the only source now.
      migrate: (persisted) => ({
        ...persisted,
        visits: [],
        expectedToday: [],
      }),
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
  if (isToday || (appt.start >= clinicNow() && appt.start <= clinicNow() + 12 * 3600000)) {
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
