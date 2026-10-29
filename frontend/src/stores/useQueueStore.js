import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  buildMockRequests,
  buildMockAppointments,
  buildBusyBlocks,
  CLINIC_RULES,
  BASE_OFFSET,
  DEFAULT_RANGE_DAYS,
} from '../services/mockData';
import { generateCandidateSlots, getService, makeSlot } from '../services/slotEngine';
import { useAuthStore } from './useAuthStore';
import { soundService } from '../services/soundService';
import { appointmentSyncBus } from '../services/appointmentSyncBus';
import { apiService } from '../services/apiService';
import { useAppModeStore } from './appModeStore';

const MIN = 60000;

const getCurrentStaffName = () => {
  const staff = useAuthStore.getState().currentStaff;
  return staff?.name?.split(' ')[0] || staff?.name || 'Staff';
};

/**
 * useQueueStore — Headless state for the Inbound Triage Queue & review workflow.
 * LOGIC LAYER ONLY. Persisted in localStorage and synchronized via appointmentSyncBus.
 */
export const useQueueStore = create(
  persist(
    (set, get) => ({
  requests: buildMockRequests(),
  appointments: buildMockAppointments(),
  busyBlocks: buildBusyBlocks(),
  activeTab: 'new',
  selectedId: null,
  slotsByRequest: {},
  infoPanelOpen: false,
  toast: null,

  setActiveTab: (tab) => set({ activeTab: tab }),

  openRequest: (id) => {
    const staffName = getCurrentStaffName();
    set((state) => ({
      selectedId: id,
      infoPanelOpen: false,
      requests: state.requests.map((r) => (r.id === id ? { ...r, reviewingBy: staffName } : r)),
    }));

    if (!useAppModeStore.getState().isDemoMode) {
      apiService.broadcastPresence(id, 'start_review').catch(() => {});
    }
  },

  closeRequest: () => {
    const prevId = get().selectedId;
    const staffName = getCurrentStaffName();
    set((state) => ({
      requests: state.requests.map((r) =>
        r.id === state.selectedId && r.reviewingBy === staffName ? { ...r, reviewingBy: null } : r
      ),
      selectedId: null,
      infoPanelOpen: false,
    }));

    if (!useAppModeStore.getState().isDemoMode && prevId) {
      apiService.broadcastPresence(prevId, 'stop_review').catch(() => {});
    }
  },

  updateRequestField: (id, patch) =>
    set((state) => ({
      requests: state.requests.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    })),

  // 1-Click [Check Live Slots]
  checkSlots: (id) => {
    const { requests, busyBlocks } = get();
    const request = requests.find((r) => r.id === id);
    if (!request) return;
    const localSlots = generateCandidateSlots(request, busyBlocks);
    set((state) => ({
      slotsByRequest: { ...state.slotsByRequest, [id]: localSlots },
    }));

    if (!useAppModeStore.getState().isDemoMode) {
      const isLocalMock = !request.backendUuid && (
        String(request.id).startsWith('req-004') ||
        String(request.code || '').startsWith('REQ-2026-004')
      );
      if (!isLocalMock) {
        const lookupKey = request.backendUuid || request.code || request.id;
        apiService
          .checkSlots(lookupKey)
          .then((res) => {
            const remoteSlots = res?.candidate_slots || res?.slots || [];
            if (Array.isArray(remoteSlots) && remoteSlots.length > 0) {
              const service = getService(request.serviceId);
              const mapped = remoteSlots.map((s, idx) => ({
                id: s.id || `slot-live-${idx + 1}-${Date.now()}`,
                doctorId: s.doctor_id || request.preferredDoctorId || 'doc-bello',
                doctorName: s.doctor_name,
                start: new Date(s.start_datetime).getTime(),
                durationMin: s.duration_minutes || (service ? service.durationMin : 30),
                bufferMin: s.buffer_minutes !== undefined ? s.buffer_minutes : (service ? service.bufferMin : 10),
                custom: false,
              }));
              set((state) => ({
                slotsByRequest: { ...state.slotsByRequest, [id]: mapped },
              }));
            }
          })
          .catch(() => {
            // Keep instant local slots if backend request ID is unreachable
          });
      }
    }
  },

  syncFromBackend: async () => {
    if (useAppModeStore.getState().isDemoMode) return;
    try {
      const data = await apiService.fetchBookingRequests();
      const list = Array.isArray(data) ? data : data?.results || [];
      if (list.length === 0) return;

      const mappedRemote = list.map((item) => {
        const statusVal = item.status === 're_requested' ? 'awaiting_review' : item.status;
        const serviceNameLower = (item.service_name || '').toLowerCase();
        let matchedServiceId = 'svc-dental';
        if (serviceNameLower.includes('extract')) matchedServiceId = 'svc-extract';
        else if (serviceNameLower.includes('check') || serviceNameLower.includes('general')) matchedServiceId = 'svc-checkup';

        return {
          id: item.request_code || item.id,
          backendUuid: item.id,
          code: item.request_code || item.id,
          patientName: item.patient_name || 'Clinic Patient',
          phone: item.patient_phone || '+2348000000000',
          patientType: item.patient_type || 'new',
          serviceId: matchedServiceId,
          customService: item.service_name
            ? { id: item.service || matchedServiceId, name: item.service_name, durationMin: 30, bufferMin: 10 }
            : null,
          preferredDoctorId: item.preferred_doctor || null,
          timeWindow: item.preferred_time_window || 'morning',
          dateRange: {
            fromOffset: BASE_OFFSET,
            toOffset: BASE_OFFSET + DEFAULT_RANGE_DAYS - 1,
          },
          channel: item.channel === 'whatsapp_flow' ? 'telegram' : (item.channel || 'web'),
          status: statusVal,
          reRequested: item.status === 're_requested' || Boolean(item.re_requested),
          reviewingBy: null,
          createdAt: item.created_at ? new Date(item.created_at).getTime() : Date.now(),
          expiredAt: item.offer_expires_at ? new Date(item.offer_expires_at).getTime() : Date.now(),
          offerExpiresAt: item.offer_expires_at ? new Date(item.offer_expires_at).getTime() : null,
          isEmergency: Boolean(item.is_emergency),
          gender: item.gender || '',
          dateOfBirth: item.date_of_birth || null,
          symptoms: item.patient_notes || '',
        };
      });

      set((state) => {
        const existingByCode = new Map(state.requests.map((r) => [r.code || r.id, r]));
        mappedRemote.forEach((rem) => {
          existingByCode.set(rem.code || rem.id, {
            ...(existingByCode.get(rem.code || rem.id) || {}),
            ...rem,
          });
        });
        return { requests: Array.from(existingByCode.values()) };
      });
    } catch (err) {
      console.warn('Queue syncFromBackend fallback:', err);
    }
  },

  patchSlot: (requestId, slotId, patch) =>
    set((state) => ({
      slotsByRequest: {
        ...state.slotsByRequest,
        [requestId]: (state.slotsByRequest[requestId] || []).map((s) =>
          s.id === slotId ? { ...s, ...patch } : s
        ),
      },
    })),

  nudgeSlot: (requestId, slotId, deltaMin) => {
    const slot = (get().slotsByRequest[requestId] || []).find((s) => s.id === slotId);
    if (slot) get().patchSlot(requestId, slotId, { start: slot.start + deltaMin * MIN });
  },

  removeSlot: (requestId, slotId) =>
    set((state) => ({
      slotsByRequest: {
        ...state.slotsByRequest,
        [requestId]: (state.slotsByRequest[requestId] || []).filter((s) => s.id !== slotId),
      },
    })),

  addCustomSlot: (requestId, doctorId, start) => {
    const request = get().requests.find((r) => r.id === requestId);
    const service = request && getService(request.serviceId);
    if (!service || Number.isNaN(start)) return;
    const slot = makeSlot({ doctorId, start, service, custom: true });
    set((state) => ({
      slotsByRequest: {
        ...state.slotsByRequest,
        [requestId]: [...(state.slotsByRequest[requestId] || []), slot].sort((a, b) => a.start - b.start),
      },
    }));
  },

  toggleInfoPanel: (open) => set({ infoPanelOpen: open }),

  sendInfoRequest: (requestId, message) => {
    set({
      infoPanelOpen: false,
      toast: { tone: 'info', text: `Question sent to patient: “${message}”` },
    });

    if (!useAppModeStore.getState().isDemoMode) {
      const request = get().requests.find((r) => r.id === requestId);
      const isLocalMock = !request?.backendUuid && (
        String(requestId).startsWith('req-004') ||
        String(request?.code || '').startsWith('REQ-2026-004')
      );
      if (!isLocalMock) {
        const lookupKey = request?.backendUuid || request?.code || requestId;
        apiService.askInfo(lookupKey, message).catch((err) => {
          console.warn('Backend askInfo failed:', err);
        });
      }
    }
  },

  // [Approve & Dispatch Options] — starts the offer-expiry window
  dispatchOffers: (requestId, selectedSlotIds = null) => {
    const { requests, slotsByRequest } = get();
    const request = requests.find((r) => r.id === requestId);
    let updatedSlots = slotsByRequest[requestId] || [];
    if (selectedSlotIds && Array.isArray(selectedSlotIds) && selectedSlotIds.length > 0) {
      updatedSlots = updatedSlots.filter((s) => selectedSlotIds.includes(s.id));
    }
    const count = updatedSlots.length;
    set((state) => ({
      slotsByRequest: {
        ...state.slotsByRequest,
        [requestId]: updatedSlots,
      },
      requests: state.requests.map((r) =>
        r.id === requestId
          ? {
              ...r,
              status: 'slots_offered',
              reviewingBy: null,
              reRequested: false,
              offerExpiresAt: Date.now() + CLINIC_RULES.offerExpiryMin * MIN,
            }
          : r
      ),
      selectedId: null,
      toast: {
        tone: 'success',
        text: `${count} slot option${count === 1 ? '' : 's'} dispatched to ${request ? request.patientName : 'patient'} (${CLINIC_RULES.offerExpiryMin}-minute window started).`,
      },
    }));

    if (!useAppModeStore.getState().isDemoMode) {
      const isLocalMock = !request?.backendUuid && (
        String(requestId).startsWith('req-004') ||
        String(request?.code || '').startsWith('REQ-2026-004')
      );
      if (!isLocalMock) {
        const lookupKey = request?.backendUuid || request?.code || requestId;
        apiService.dispatchOffers(lookupKey, updatedSlots).catch((err) => {
          console.warn('Backend dispatchOffers failed:', err);
        });
      }
    }

    soundService.playChime();
  },

  // [Approve 1 Confirmed Slot] — directly books into confirmed schedule
  confirmSingleSlot: ({ requestId, slotId }) => {
    const { requests, appointments, slotsByRequest } = get();
    const req = requests.find((r) => r.id === requestId);
    if (!req) return;
    const allSlots = slotsByRequest[requestId] || [];
    const chosenSlot = allSlots.find((s) => s.id === slotId) || allSlots[0];
    if (!chosenSlot) return;

    const apptId = `AP-${Math.floor(1000 + Math.random() * 9000)}`;
    const newAppt = {
      id: apptId,
      patientName: req.patientName,
      patientType: req.patientType || 'new',
      phone: req.phone,
      serviceId: req.serviceId,
      doctorId: chosenSlot.doctorId,
      start: chosenSlot.start,
      status: 'confirmed',
    };

    set((state) => ({
      appointments: [...state.appointments, newAppt],
      requests: state.requests.map((r) =>
        r.id === requestId ? { ...r, status: 'converted', reviewingBy: null } : r
      ),
      selectedId: null,
      activeTab: 'today',
      toast: {
        tone: 'success',
        text: `✓ Booking ${apptId} confirmed & scheduled for ${req.patientName}!`,
      },
    }));

    // Broadcast cross-store synchronization to Calendar & Live Visits
    appointmentSyncBus.publishAppointmentBooked(newAppt);

    if (!useAppModeStore.getState().isDemoMode) {
      const isLocalMock = !req?.backendUuid && (
        String(requestId).startsWith('req-004') ||
        String(req?.code || '').startsWith('REQ-2026-004')
      );
      if (!isLocalMock) {
        const startIso = new Date(chosenSlot.start).toISOString();
        const endIso = new Date(chosenSlot.start + 30 * MIN).toISOString();
        apiService
          .holdSlot({
            doctor_id: chosenSlot.doctorId,
            service_id: req.serviceId,
            name: req.patientName,
            phone: req.phone,
            start_datetime: startIso,
            end_datetime: endIso,
            is_instant_confirm: true,
            booking_request_id: req.backendUuid || req.code || requestId,
          })
          .catch((err) => {
            console.warn('Backend slot hold failed:', err);
          });
      }
    }

    soundService.playChime();
  },

  injectRequest: (newRequest) =>
    set((state) => ({
      requests: [newRequest, ...state.requests],
      activeTab: 'new',
      toast: {
        tone: 'success',
        text: `⚡ Inbound intake from ${newRequest.patientName} (${newRequest.channel === 'telegram' ? 'Telegram Bot' : 'Web Form'}) injected into Triage Queue!`,
      },
    })),

  finalizeBooking: ({ requestId, slot, appointmentId }) => {
    const { requests } = get();
    const req = requests.find((r) => r.id === requestId);
    if (!req) return;

    const newAppt = {
      id: appointmentId,
      doctorId: slot.doctorId,
      serviceId: req.serviceId,
      patientName: req.patientName,
      phone: req.phone,
      patientType: req.patientType || 'new',
      start: slot.start,
      status: 'confirmed',
    };

    set((state) => ({
      requests: state.requests.map((r) =>
        r.id === requestId ? { ...r, status: 'converted', convertedAt: Date.now() } : r
      ),
      appointments: [...state.appointments, newAppt],
      toast: {
        tone: 'success',
        text: `🎉 Booking finalized for ${req.patientName} (${appointmentId})! Confirmed on calendar.`,
      },
    }));

    // Broadcast cross-store synchronization to Calendar & Live Visits
    appointmentSyncBus.publishAppointmentBooked(newAppt);
    soundService.playChime();
  },

  addConfirmedAppointment: (appt) => {
    const exists = get().appointments.some((a) => a.id === appt.id || a.id === appt.appointmentId);
    if (exists) return;

    const newAppt = {
      id: appt.appointmentId || appt.id,
      doctorId: appt.doctorId,
      serviceId: appt.serviceId,
      patientName: appt.patientName,
      phone: appt.phone || appt.patientPhone,
      patientType: appt.patientType || 'new',
      start: appt.scheduledTime || appt.start || Date.now(),
      status: 'confirmed',
    };

    set((state) => ({
      appointments: [...state.appointments, newAppt],
    }));
  },

  rescheduleAppointment: (appointmentId, newStart, doctorId) => {
    set((state) => ({
      appointments: state.appointments.map((a) =>
        a.id === appointmentId
          ? { ...a, start: newStart, ...(doctorId ? { doctorId } : {}) }
          : a
      ),
    }));
  },

  expireOffer: (requestId) => {
    set((state) => ({
      requests: state.requests.map((r) =>
        r.id === requestId
          ? { ...r, status: 'offer_expired', expiredAt: Date.now() }
          : r
      ),
      toast: {
        tone: 'amber',
        text: 'Offer window expired. Moved to Expired Requests.',
      },
    }));
  },

  reRequestSlots: (requestId) => {
    set((state) => ({
      requests: state.requests.map((r) =>
        r.id === requestId
          ? { ...r, status: 'awaiting_review', reRequested: true, createdAt: Date.now() }
          : r
      ),
      activeTab: 'rerequested',
      toast: {
        tone: 'ember',
        text: '⚡ Patient re-requested fresh times! Priority alert placed in Triage Queue.',
      },
    }));
  },

  resetToDemoDefaults: () => {
    set({
      requests: buildMockRequests(),
      appointments: buildMockAppointments(),
      busyBlocks: buildBusyBlocks(),
      activeTab: 'new',
      selectedId: null,
      slotsByRequest: {},
      toast: {
        tone: 'info',
        text: 'Queue reset to clean demo seeds.',
      },
    });
  },

  dismissToast: () => set({ toast: null }),
    }),
    {
      name: 'cbs_queue_storage',
      partialize: (state) => ({
        requests: state.requests,
        appointments: state.appointments,
        slotsByRequest: state.slotsByRequest,
      }),
    }
  )
);

// Register cross-store synchronization listeners
appointmentSyncBus.subscribe('walkInAdmitted', (visit) => {
  useQueueStore.getState().addConfirmedAppointment({
    id: visit.appointmentId || visit.id,
    appointmentId: visit.appointmentId || visit.id,
    doctorId: visit.doctorId,
    serviceId: visit.serviceId,
    patientName: visit.patientName,
    phone: visit.patientPhone,
    patientType: visit.patientType || 'new',
    start: visit.scheduledTime || visit.arrivedAt || Date.now(),
  });
});

appointmentSyncBus.subscribe('appointmentRescheduled', ({ appointmentId, newStart, doctorId }) => {
  useQueueStore.getState().rescheduleAppointment(appointmentId, newStart, doctorId);
});
