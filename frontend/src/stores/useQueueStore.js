import { create } from 'zustand';
import { persist } from 'zustand/middleware';
// Wave 3 / Step 3.7-B: the mock builders are gone from the clinic store.
// What remains imported are the CLINIC RULES the real API also enforces and
// the pitch simulator's date range.
import {
  CLINIC_RULES,
  BASE_OFFSET,
  DEFAULT_RANGE_DAYS,
} from '../services/mockData';
import { clinicNow } from '../services/clinicTimeService';
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
  // Wave 3 / Step 3.7-B: the API is the only source of clinic rows. The
  // in-browser demo seeds are deleted; the pitch look comes from
  // `seed_clinic` on the database, so the queue reflects the real pipeline.
  // (The pitch SIMULATOR keeps its own private dataset and injects its
  // requests live through appointmentSyncBus.)
  requests: [],
  appointments: [],
  busyBlocks: [],
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
  // Task 3.3: when slots are already on screen (re-calculate), their starts are
  // sent as exclusions so BOTH the instant local fill and the backend engine
  // return FRESH times instead of the identical top-3 again.
  checkSlots: (id) => {
    const { requests, busyBlocks, slotsByRequest } = get();
    const request = requests.find((r) => r.id === id);
    if (!request) return;
    const shownStarts = (slotsByRequest[id] || [])
      .filter((s) => s && typeof s.start === 'number')
      .map((s) => s.start);
    const localSlots = generateCandidateSlots(request, busyBlocks, 3, shownStarts);
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
          .checkSlots(lookupKey, shownStarts.length > 0
            ? shownStarts.map((ts) => new Date(ts).toISOString())
            : null)
          .then((res) => {
            const remoteSlots = res?.candidate_slots || res?.slots || [];
            if (Array.isArray(remoteSlots) && remoteSlots.length > 0) {
              const service = getService(request.serviceId);
              const mapped = remoteSlots.map((s, idx) => ({
                id: s.id || `slot-live-${idx + 1}-${clinicNow()}`,
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

      // Wave 3 / Step 3.2: an EMPTY answer is still an answer. The backend is
      // the source of truth — when it says no requests exist, the queue shows
      // no requests instead of keeping seeded rows on screen. (A FAILED fetch
      // is different: the catch below keeps whatever is on screen.)
      if (list.length === 0) {
        set({ requests: [] });
        return;
      }

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
          createdAt: item.created_at ? new Date(item.created_at).getTime() : clinicNow(),
          expiredAt: item.offer_expires_at ? new Date(item.offer_expires_at).getTime() : clinicNow(),
          offerExpiresAt: item.offer_expires_at ? new Date(item.offer_expires_at).getTime() : null,
          isEmergency: Boolean(item.is_emergency),
          gender: item.gender || '',
          dateOfBirth: item.date_of_birth || null,
          symptoms: item.patient_notes || '',
          // Task 3.3: real attendance history from the backend (computed by
          // get_patient_dossier) — replaces the demo registry for live mode.
          patientDossier: item.patient_dossier || null,
          // Task 3.4: delivery-failure visibility (Needs Attention tab).
          deliveryFailures: item.delivery_failures || 0,
          lastFailure: item.last_failure || null,
          // Resolution rule: True only while the newest outbound outcome is a
          // failure — a later successful send clears it (recovered patients
          // leave the Needs Attention tab; a newer failure puts them back).
          attentionOpen: item.attention_open === true,
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
        // Live reconciliation: the backend is the source of truth. Rows that
        // never reached the backend (no backendUuid — e.g. a simulator intake
        // that failed to save) are local ghosts; keeping them would 404 on
        // every recalculate/dispatch call. Local overlays on rows that DO
        // exist remotely survive the merge above.
        const remoteCodes = new Set(mappedRemote.map((rem) => rem.code || rem.id));
        const reconciled = Array.from(existingByCode.values()).filter(
          (r) => remoteCodes.has(r.code || r.id) || Boolean(r.backendUuid)
        );
        return { requests: reconciled };
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

  // Task 3.3 fix: called with no argument (e.g. from a plain toggle button) it flips;
  // called with true/false it sets explicitly. Previously the hook dropped the arg
  // and the panel state became `undefined` — the Ask-for-info panel could never open.
  toggleInfoPanel: (open) => set((state) => ({ infoPanelOpen: open === undefined ? !state.infoPanelOpen : Boolean(open) })),

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
  // Task 3.1: `dispatchChannels` = receptionist's checkbox selection
  // (['whatsapp','sms','voice'] — all three by default per the approved UX).
  dispatchOffers: async (requestId, selectedSlotIds = null, dispatchChannels = ['whatsapp', 'sms', 'voice']) => {
    const { requests, slotsByRequest } = get();
    const request = requests.find((r) => r.id === requestId);
    const prevRequest = request
      ? { status: request.status, reviewingBy: request.reviewingBy, offerExpiresAt: request.offerExpiresAt, reRequested: request.reRequested }
      : null;
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
              offerExpiresAt: clinicNow() + CLINIC_RULES.offerExpiryMin * MIN,
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
        try {
          const dispatchResponse = await apiService.dispatchOffers(lookupKey, updatedSlots, dispatchChannels);
          // Option B (advisory): the backend reports which of the ticked channels
          // could actually reach the patient. Never roll back — just replace the
          // success toast with the truthful warning so reception isn't misled.
          const deliveryWarning = dispatchResponse?.delivery_warning
            || dispatchResponse?.delivery?.warning
            || null;
          if (deliveryWarning) {
            set({ toast: { tone: 'amber', text: deliveryWarning } });
          }
        } catch (err) {
          console.warn('Backend dispatchOffers failed:', err);
          // Task 3.1 guard surfaced: patient already has an active hold/booking.
          // Roll the optimistic update back and explain clearly (hover-message UX).
          if (err.status === 409 && err.details?.error === 'PATIENT_ALREADY_BOOKED') {
            set((state) => ({
              requests: state.requests.map((r) =>
                r.id === requestId && prevRequest
                  ? { ...r, ...prevRequest }
                  : r
              ),
              toast: {
                tone: 'error',
                text: err.details.detail ||
                  'Dispatch blocked: patient already has an active booking. Cancel or reschedule it first.',
              },
            }));
            return; // no chime for a blocked dispatch
          }
          // Option B (Layer 4, flag-gated backend): no selected channel can reach
          // the patient. Mirror the rollback so the queue never claims a dispatch
          // that reached nobody.
          if (err.status === 409 && err.details?.error === 'NO_REACHABLE_CHANNEL') {
            set((state) => ({
              requests: state.requests.map((r) =>
                r.id === requestId && prevRequest
                  ? { ...r, ...prevRequest }
                  : r
              ),
              toast: {
                tone: 'error',
                text: err.details.detail ||
                  'Dispatch blocked: no selected channel can reach this patient.',
              },
            }));
            return;
          }
        }
      }
    }

    soundService.playChime();
  },

  // [Approve 1 Confirmed Slot] — directly books into confirmed schedule.
  // Wave 3 / Step 3.5: in live mode the backend is asked FIRST and the row
  // committed is the one IT created — real appointment code, real times. A
  // refusal answers with the server's own sentence (Wave 2 made the 409s
  // readable) and leaves the request exactly as it was. The optimistic
  // instant-commit survives only for demo rows, which are the pitch tool.
  confirmSingleSlot: async ({ requestId, slotId }) => {
    const { requests, slotsByRequest } = get();
    const req = requests.find((r) => r.id === requestId);
    if (!req) return;
    const allSlots = slotsByRequest[requestId] || [];
    const chosenSlot = allSlots.find((s) => s.id === slotId) || allSlots[0];
    if (!chosenSlot) return;

    const commitBooking = (newAppt, toastText) => {
      set((state) => ({
        appointments: [...state.appointments, newAppt],
        requests: state.requests.map((r) =>
          r.id === requestId ? { ...r, status: 'converted', reviewingBy: null } : r
        ),
        selectedId: null,
        activeTab: 'today',
        toast: { tone: 'success', text: toastText },
      }));
      // Broadcast cross-store synchronization to Calendar & Live Visits
      appointmentSyncBus.publishAppointmentBooked(newAppt);
      soundService.playChime();
    };

    const isLocalMock = !req?.backendUuid && (
      String(requestId).startsWith('req-004') ||
      String(req?.code || '').startsWith('REQ-2026-004')
    );
    const isLiveRow = !useAppModeStore.getState().isDemoMode && !isLocalMock;

    if (isLiveRow) {
      const startIso = new Date(chosenSlot.start).toISOString();
      const endIso = new Date(chosenSlot.start + 30 * MIN).toISOString();
      try {
        const res = await apiService.holdSlot({
          doctorId: chosenSlot.doctorId,
          serviceId: req.serviceId,
          patientName: req.patientName,
          patientPhone: req.phone,
          startDatetime: startIso,
          endDatetime: endIso,
          isInstantConfirm: true,
          requestId: req.backendUuid || req.code || requestId,
        });
        const appt = res?.appointment || res || {};
        const realCode = appt.appointment_code || res?.appointment_code;
        const realStart = appt.start_datetime ? Date.parse(appt.start_datetime) : chosenSlot.start;
        const realEnd = appt.end_datetime
          ? Date.parse(appt.end_datetime)
          : chosenSlot.start + 30 * MIN;
        commitBooking(
          {
            id: realCode,
            patientName: appt.patient_name || req.patientName,
            patientType: req.patientType || 'new',
            phone: appt.patient_phone || req.phone,
            serviceId: String(appt.service_id || req.serviceId),
            doctorId: String(appt.doctor_id || chosenSlot.doctorId),
            start: realStart,
            end: realEnd,
            status: appt.status || 'confirmed',
          },
          `✓ Booking ${realCode} confirmed & scheduled for ${req.patientName}!`
        );
      } catch (err) {
        // Nothing was booked: no row, no conversion, no broadcast — just the
        // server's own explanation of why.
        set({
          toast: {
            tone: 'error',
            text:
              err.details?.detail ||
              err.message ||
              'The booking was refused — nothing was saved.',
          },
        });
      }
      return;
    }

    // Demo/mock row: the optimistic instant commit IS the product here.
    const apptId = `AP-${Math.floor(1000 + Math.random() * 9000)}`;
    commitBooking(
      {
        id: apptId,
        patientName: req.patientName,
        patientType: req.patientType || 'new',
        phone: req.phone,
        serviceId: req.serviceId,
        doctorId: chosenSlot.doctorId,
        start: chosenSlot.start,
        status: 'confirmed',
      },
      `✓ Booking ${apptId} confirmed & scheduled for ${req.patientName}!`
    );
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
        r.id === requestId ? { ...r, status: 'converted', convertedAt: clinicNow() } : r
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
      start: appt.scheduledTime || appt.start || clinicNow(),
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
          ? { ...r, status: 'offer_expired', expiredAt: clinicNow() }
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
          ? { ...r, status: 'awaiting_review', reRequested: true, createdAt: clinicNow() }
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
    // Wave 3 / Step 3.7-B: a reset is an honest CLEAR, not a re-seed — the
    // old action manufactured demo patients out of thin air.
    set({
      requests: [],
      appointments: [],
      busyBlocks: [],
      activeTab: 'new',
      selectedId: null,
      toast: {
        tone: 'info',
        text: 'Queue cleared. Live requests will re-appear as the API answers.',
      },
    });
  },

  dismissToast: () => set({ toast: null }),
    }),
    {
      name: 'cbs_queue_storage',
      version: 2,
      // Wave 3 / Step 3.7-B: v1 persisted the in-browser demo seeds. This
      // one-time migration wipes them — the API is the only source now.
      migrate: (persisted) => ({
        ...persisted,
        requests: [],
        appointments: [],
      }),
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
    start: visit.scheduledTime || visit.arrivedAt || clinicNow(),
  });
});

appointmentSyncBus.subscribe('appointmentRescheduled', ({ appointmentId, newStart, doctorId }) => {
  useQueueStore.getState().rescheduleAppointment(appointmentId, newStart, doctorId);
});
