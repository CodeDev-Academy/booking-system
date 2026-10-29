import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  DOCTORS,
  SERVICES,
  CLINIC_RULES,
  BASE_OFFSET,
  startOfDayOffset,
  at,
  buildBusyBlocks,
  buildMockAppointments,
} from '../services/mockData';
import { validateSlot, getService, getDoctor, makeSlot } from '../services/slotEngine';
import { soundService } from '../services/soundService';
import { appointmentSyncBus } from '../services/appointmentSyncBus';
import { apiService } from '../services/apiService';
import { useAppModeStore } from './appModeStore';

const MIN = 60000;

// Helper to construct initial calendar blocks
const initCalendarBlocks = () => {
  const busy = buildBusyBlocks();
  const appointments = buildMockAppointments();

  // Convert appointments into blocks
  const apptBlocks = appointments.map((apt) => {
    const service = getService(apt.serviceId);
    const duration = service ? service.durationMin : 30;
    const buffer = service ? service.bufferMin : 10;
    return {
      id: apt.id,
      appointmentId: apt.id,
      doctorId: apt.doctorId,
      serviceId: apt.serviceId,
      patientName: apt.patientName,
      patientPhone: apt.phone || '+2348012345678',
      patientType: apt.patientType || 'new',
      type: apt.status === 'held' ? 'hold' : 'appointment',
      status: apt.status,
      label: apt.status === 'held' ? `Hold: ${apt.patientName}` : `Booked: ${apt.patientName}`,
      start: apt.start,
      end: apt.start + duration * MIN,
      durationMin: duration,
      bufferMin: buffer,
      holdExpiresAt: apt.status === 'held' ? Date.now() + 12 * MIN : null,
      channel: 'telegram',
    };
  });

  // Also include the buffers for appointments
  const bufferBlocks = [];
  apptBlocks.forEach((apt) => {
    bufferBlocks.push({
      id: `${apt.id}-buffer`,
      appointmentId: apt.id,
      doctorId: apt.doctorId,
      type: 'buffer',
      label: `${apt.bufferMin}m Sterilization Buffer`,
      start: apt.end,
      end: apt.end + apt.bufferMin * MIN,
      durationMin: apt.bufferMin,
    });
  });

  return [...busy.filter((b) => b.type !== 'appointment' && b.type !== 'buffer'), ...apptBlocks, ...bufferBlocks];
};

export const useCalendarStore = create(
  persist(
    (set, get) => ({
  // Navigation & View
  currentDateOffset: BASE_OFFSET, // days from today
  viewMode: 'day', // 'day' | 'week'
  selectedServiceId: 'all', // 'all' | 'svc-dental' | 'svc-extract' | 'svc-checkup'
  liveSyncConnected: true,

  // Doctors on duty
  doctors: DOCTORS.map((d) => ({
    ...d,
    isOnDuty: true,
    isEmergencyLeave: false,
    emergencyReason: null,
  })),

  // All blocks on schedule (appointments, holds, buffers, breaks, reserves)
  blocks: initCalendarBlocks(),

  // Walk-In Quick Booking Modal
  walkInModal: {
    isOpen: false,
    doctorId: DOCTORS[0].id,
    startTs: null,
    serviceId: SERVICES[0].id,
    patientName: '',
    phone: '',
    notes: '',
  },

  // Emergency Disruption Modal (Risk R-15)
  disruptionModal: {
    isOpen: false,
    doctorId: null,
    affectedAppointments: [],
  },

  // In-App Toast
  toast: null,

  // --- ACTIONS ---

  setViewMode: (mode) => set({ viewMode: mode }),
  setSelectedServiceId: (serviceId) => set({ selectedServiceId: serviceId }),

  setDateOffset: (offset) => set({ currentDateOffset: offset }),
  nextDay: () => set((state) => ({ currentDateOffset: state.currentDateOffset + 1 })),
  prevDay: () => set((state) => ({ currentDateOffset: Math.max(0, state.currentDateOffset - 1) })),
  goToToday: () => set({ currentDateOffset: BASE_OFFSET }),

  toggleLiveSync: () =>
    set((state) => {
      const next = !state.liveSyncConnected;
      return {
        liveSyncConnected: next,
        toast: {
          tone: next ? 'success' : 'amber',
          text: next ? 'Live Calendar Sync Connected' : 'Live Sync Paused — Running in Offline Mode',
        },
      };
    }),

  // Open Walk-in Modal for a clicked slot or the header button
  openWalkInModal: (doctorId, startTs) => {
    const firstDoc = doctorId || DOCTORS[0].id;
    const defaultStart = startTs || at(get().currentDateOffset, 11, 0);
    set({
      walkInModal: {
        isOpen: true,
        doctorId: firstDoc,
        startTs: defaultStart,
        serviceId: SERVICES[0].id,
        patientName: '',
        phone: '',
        notes: '',
      },
    });
  },

  closeWalkInModal: () =>
    set((state) => ({
      walkInModal: { ...state.walkInModal, isOpen: false },
    })),

  updateWalkInField: (field, value) =>
    set((state) => ({
      walkInModal: { ...state.walkInModal, [field]: value },
    })),

  // Confirm Walk-In Booking (Risk R-12 & R-13 buffer verification)
  confirmWalkIn: ({ patientName, phone, doctorId, serviceId, startTs, notes }) => {
    const service = getService(serviceId);
    if (!service) return { success: false, message: 'Invalid service selected' };

    const slot = {
      doctorId,
      start: startTs,
      durationMin: service.durationMin,
      bufferMin: service.bufferMin,
    };

    // Check collision against current blocks
    const busyBlocks = get().blocks;
    const validation = validateSlot(slot, busyBlocks);

    if (!validation.ok) {
      soundService.playAlert();
      return {
        success: false,
        code: validation.code,
        message: validation.message,
        nextSafeStart: validation.nextSafeStart,
      };
    }

    const apptId = `AP-${Math.floor(1000 + Math.random() * 9000)}`;
    const endTs = startTs + service.durationMin * MIN;

    const newApptBlock = {
      id: apptId,
      appointmentId: apptId,
      doctorId,
      serviceId,
      patientName: patientName.trim() || 'Walk-In Patient',
      patientPhone: phone || '+2348000000000',
      type: 'appointment',
      status: 'confirmed',
      label: `Booked: ${patientName.trim() || 'Walk-In Patient'}`,
      start: startTs,
      end: endTs,
      durationMin: service.durationMin,
      bufferMin: service.bufferMin,
      notes: notes || 'Counter Walk-In',
      channel: 'walk_in',
    };

    const newBufferBlock = {
      id: `${apptId}-buffer`,
      appointmentId: apptId,
      doctorId,
      type: 'buffer',
      label: `${service.bufferMin}m Sterilization Buffer`,
      start: endTs,
      end: endTs + service.bufferMin * MIN,
      durationMin: service.bufferMin,
    };

    set((state) => ({
      blocks: [...state.blocks, newApptBlock, newBufferBlock],
      walkInModal: { ...state.walkInModal, isOpen: false },
      toast: {
        tone: 'success',
        text: `Confirmed Walk-In: ${newApptBlock.patientName} (${apptId}) scheduled with ${getDoctor(doctorId)?.name || 'Doctor'}.`,
      },
    }));

    // Broadcast booking across stores (Live Visits, Queue, Calendar)
    appointmentSyncBus.publishAppointmentBooked(newApptBlock);

    if (!useAppModeStore.getState().isDemoMode) {
      apiService
        .registerWalkIn({
          doctorId,
          serviceId,
          patientName: newApptBlock.patientName,
          phone: newApptBlock.patientPhone,
          startTs,
          endTs,
          notes: newApptBlock.notes,
        })
        .catch((err) => {
          console.warn('Backend walk-in registration from calendar failed:', err);
        });
    }

    soundService.playChime();
    return { success: true };
  },

  // Confirm booking selected by online/patient channel (Web or Telegram)
  confirmPatientBooking: ({
    appointmentId,
    patientName,
    patientPhone,
    doctorId,
    serviceId,
    startTs,
    channel = 'web',
    patientType = 'new',
    notes = '',
  }) => {
    const service = getService(serviceId) || SERVICES[0];
    const apptId = appointmentId || `AP-${Math.floor(1000 + Math.random() * 9000)}`;
    const duration = service.durationMin || 30;
    const buffer = service.bufferMin !== undefined ? service.bufferMin : 10;
    const endTs = startTs + duration * MIN;

    const newApptBlock = {
      id: apptId,
      appointmentId: apptId,
      doctorId,
      serviceId,
      patientName: patientName.trim(),
      patientPhone: patientPhone.trim(),
      patientType,
      type: 'appointment',
      status: 'confirmed',
      label: `Booked: ${patientName.trim()}`,
      start: startTs,
      end: endTs,
      durationMin: duration,
      bufferMin: buffer,
      notes,
      channel,
    };

    const newBufferBlock = {
      id: `${apptId}-buffer`,
      appointmentId: apptId,
      doctorId,
      type: 'buffer',
      label: `${buffer}m Sterilization Buffer`,
      start: endTs,
      end: endTs + buffer * MIN,
      durationMin: buffer,
    };

    set((state) => ({
      blocks: [...state.blocks, newApptBlock, newBufferBlock],
      toast: {
        tone: 'success',
        text: `Confirmed Booking: ${newApptBlock.patientName} (${apptId}) scheduled on calendar.`,
      },
    }));

    soundService.playChime();
    return { success: true, apptId };
  },

  // Release an expired or unconfirmed hold to free up schedule
  releaseHold: (holdId) => {
    const hold = get().blocks.find((b) => b.id === holdId || b.appointmentId === holdId);
    set((state) => ({
      blocks: state.blocks.filter(
        (b) => b.id !== holdId && b.appointmentId !== holdId && b.id !== `${holdId}-buffer`
      ),
      toast: {
        tone: 'success',
        text: `Slot freed up! ${hold?.patientName || 'Online hold'} cleared from schedule.`,
      },
    }));
    soundService.playChime();
  },

  // 1-Click Doctor Emergency Absence Disruption Protocol (Risk R-15)
  openDisruptionModal: (doctorId) => {
    const { blocks, currentDateOffset } = get();
    const dayStart = startOfDayOffset(currentDateOffset);
    const dayEnd = dayStart + 24 * 60 * MIN;

    // Find all confirmed/held appointments for this doctor on current viewed day
    const affected = blocks.filter(
      (b) =>
        b.doctorId === doctorId &&
        (b.type === 'appointment' || b.type === 'hold') &&
        b.start >= dayStart &&
        b.start < dayEnd
    );

    set({
      disruptionModal: {
        isOpen: true,
        doctorId,
        affectedAppointments: affected,
      },
    });
  },

  closeDisruptionModal: () =>
    set({
      disruptionModal: {
        isOpen: false,
        doctorId: null,
        affectedAppointments: [],
      },
    }),

  markDoctorEmergencyLeave: (doctorId, reason = 'Sudden Medical Emergency') => {
    set((state) => ({
      doctors: state.doctors.map((d) =>
        d.id === doctorId
          ? { ...d, isOnDuty: false, isEmergencyLeave: true, emergencyReason: reason }
          : d
      ),
    }));
    if (!useAppModeStore.getState().isDemoMode) {
      apiService
        .updateDoctorDutyStatus(doctorId, { duty_mode: 'on_sick_leave', reason })
        .catch(() => {});
    }
    get().openDisruptionModal(doctorId);
    soundService.playAlert();
  },

  restoreDoctorDuty: (doctorId) => {
    set((state) => ({
      doctors: state.doctors.map((d) =>
        d.id === doctorId
          ? { ...d, isOnDuty: true, isEmergencyLeave: false, emergencyReason: null }
          : d
      ),
      disruptionModal: { isOpen: false, doctorId: null, affectedAppointments: [] },
      toast: {
        tone: 'success',
        text: `${getDoctor(doctorId)?.name || 'Doctor'} marked back On Duty.`,
      },
    }));
    if (!useAppModeStore.getState().isDemoMode) {
      apiService
        .updateDoctorDutyStatus(doctorId, { duty_mode: 'on_duty' })
        .catch(() => {});
    }
    soundService.playChime();
  },

  syncFromBackend: async () => {
    if (useAppModeStore.getState().isDemoMode) return;
    try {
      const startIso = new Date().toISOString().split('T')[0];
      const endIso = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];
      const data = await apiService.fetchCalendarSchedule(startIso, '', endIso);
      const docSchedules = data?.doctors || [];
      if (!Array.isArray(docSchedules) || docSchedules.length === 0) return;

      const remoteBlocks = [];
      docSchedules.forEach((docItem) => {
        const docNameLower = (docItem.doctor_name || '').toLowerCase();
        let mappedDocId = docItem.doctor_id;
        if (docNameLower.includes('bello')) mappedDocId = 'doc-bello';
        else if (docNameLower.includes('okafor') || docNameLower.includes('chin')) mappedDocId = 'doc-okafor';
        else if (docNameLower.includes('babawo')) mappedDocId = 'doc-babawo';

        (docItem.appointments || []).forEach((apt) => {
          const startTs = new Date(apt.start_datetime).getTime();
          const endTs = new Date(apt.end_datetime).getTime();
          const durationMin = Math.max(15, Math.round((endTs - startTs) / MIN));
          const bufferMin = apt.buffer_minutes !== undefined ? apt.buffer_minutes : 10;
          const aptId = apt.appointment_code || apt.id;

          remoteBlocks.push({
            id: aptId,
            appointmentId: aptId,
            doctorId: mappedDocId,
            serviceId: 'svc-dental',
            patientName: apt.patient_name || 'Patient',
            patientPhone: apt.patient_phone || '+2348000000000',
            type: apt.status === 'held' ? 'hold' : 'appointment',
            status: apt.status || 'confirmed',
            label:
              apt.status === 'held'
                ? `Hold: ${apt.patient_name}`
                : `Booked: ${apt.patient_name}`,
            start: startTs,
            end: endTs,
            durationMin,
            bufferMin,
            holdExpiresAt: apt.hold_expires_at ? new Date(apt.hold_expires_at).getTime() : null,
            channel: 'telegram',
          });
        });
      });

      if (remoteBlocks.length > 0) {
        set((state) => {
          const existingIds = new Set(state.blocks.map((b) => b.appointmentId || b.id));
          const additions = [];
          remoteBlocks.forEach((rb) => {
            if (!existingIds.has(rb.appointmentId)) {
              additions.push(rb);
              additions.push({
                id: `${rb.id}-buffer`,
                appointmentId: rb.appointmentId,
                doctorId: rb.doctorId,
                type: 'buffer',
                label: `${rb.bufferMin}m Sterilization Buffer`,
                start: rb.end,
                end: rb.end + rb.bufferMin * MIN,
                durationMin: rb.bufferMin,
              });
            }
          });
          return additions.length > 0 ? { blocks: [...state.blocks, ...additions] } : state;
        });
      }
    } catch (err) {
      console.warn('Calendar syncFromBackend fallback:', err);
    }
  },

  // Reassign affected appointments to a colleague with Schedule Collision Validation
  reassignToColleague: (appointmentId, targetDoctorId) => {
    const { blocks } = get();
    const apt = blocks.find((b) => b.appointmentId === appointmentId || b.id === appointmentId);
    if (!apt) return { success: false, message: 'Appointment not found on calendar' };

    const durationMin = apt.durationMin || 30;
    const bufferMin = apt.bufferMin !== undefined ? apt.bufferMin : 10;
    const targetDoc = getDoctor(targetDoctorId);

    // Validate collision for the colleague at the same time slot, excluding current appointment & buffer
    const busyBlocks = blocks.filter(
      (b) => b.appointmentId !== appointmentId && b.id !== appointmentId && b.id !== `${appointmentId}-buffer`
    );

    const validation = validateSlot(
      {
        doctorId: targetDoctorId,
        start: apt.start,
        durationMin,
        bufferMin,
      },
      busyBlocks
    );

    if (!validation.ok) {
      soundService.playAlert();
      set({
        toast: {
          tone: 'amber',
          text: `Cannot transfer to ${targetDoc?.name || 'Colleague'}: ${validation.message}`,
        },
      });
      return { success: false, message: validation.message, code: validation.code };
    }

    set((state) => ({
      blocks: state.blocks.map((b) => {
        if (b.appointmentId === appointmentId || b.id === appointmentId || b.id === `${appointmentId}-buffer`) {
          return { ...b, doctorId: targetDoctorId };
        }
        return b;
      }),
      disruptionModal: {
        ...state.disruptionModal,
        affectedAppointments: state.disruptionModal.affectedAppointments.filter(
          (a) => a.appointmentId !== appointmentId && a.id !== appointmentId
        ),
      },
      toast: {
        tone: 'success',
        text: `Transferred appointment ${appointmentId} to ${targetDoc?.name || 'Colleague'} (Verified Conflict-Free).`,
      },
    }));

    appointmentSyncBus.publishAppointmentRescheduled({
      appointmentId,
      newStart: apt.start,
      doctorId: targetDoctorId,
    });

    if (!useAppModeStore.getState().isDemoMode) {
      apiService.reassignDoctorLeave(appointmentId, targetDoctorId).catch((err) => {
        console.warn('Backend reassignDoctorLeave failed:', err);
      });
    }

    soundService.playChime();
    return { success: true };
  },

  // Reschedule an appointment with strict shift and overlap collision validation (Issue 10)
  rescheduleAppointment: (appointmentId, newStart, targetDoctorId = null) => {
    const { blocks } = get();
    const apt = blocks.find((b) => b.appointmentId === appointmentId || b.id === appointmentId);
    if (!apt) return { success: false, message: 'Appointment not found on schedule' };

    const docId = targetDoctorId || apt.doctorId;
    const doc = getDoctor(docId);
    const durationMin = apt.durationMin || 30;
    const bufferMin = apt.bufferMin !== undefined ? apt.bufferMin : 10;
    const endTs = newStart + durationMin * MIN;

    // Filter out the appointment's own block and its buffer
    const busyBlocks = blocks.filter(
      (b) => b.appointmentId !== appointmentId && b.id !== appointmentId && b.id !== `${appointmentId}-buffer`
    );

    const validation = validateSlot(
      {
        doctorId: docId,
        start: newStart,
        durationMin,
        bufferMin,
      },
      busyBlocks
    );

    if (!validation.ok) {
      soundService.playAlert();
      set({
        toast: {
          tone: 'amber',
          text: `Reschedule blocked: ${validation.message}`,
        },
      });
      return {
        success: false,
        code: validation.code,
        message: validation.message,
        nextSafeStart: validation.nextSafeStart,
      };
    }

    set((state) => ({
      blocks: state.blocks.map((b) => {
        if (b.appointmentId === appointmentId || b.id === appointmentId) {
          return { ...b, start: newStart, end: endTs, doctorId: docId };
        }
        if (b.id === `${appointmentId}-buffer` || (b.appointmentId === appointmentId && b.type === 'buffer')) {
          return {
            ...b,
            start: endTs,
            end: endTs + bufferMin * MIN,
            doctorId: docId,
          };
        }
        return b;
      }),
      toast: {
        tone: 'success',
        text: `Rescheduled ${apt.patientName || 'appointment'} to ${new Date(newStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} with ${doc?.name || 'Doctor'}.`,
      },
    }));

    appointmentSyncBus.publishAppointmentRescheduled({
      appointmentId,
      newStart,
      doctorId: docId,
    });

    if (!useAppModeStore.getState().isDemoMode) {
      apiService
        .rescheduleAppointment(appointmentId, {
          doctorId: docId,
          startDatetime: new Date(newStart).toISOString(),
          endDatetime: new Date(endTs).toISOString(),
        })
        .catch((err) => {
          console.warn('Backend rescheduleAppointment failed:', err);
        });
    }

    soundService.playChime();
    return { success: true };
  },

  // Dispatch emergency cancellation/reschedule alert to patients (Risk R-15 Option 2)
  notifyAndReschedule: (appointmentId) => {
    const apt = get().blocks.find((b) => b.appointmentId === appointmentId);
    set((state) => ({
      blocks: state.blocks.filter(
        (b) => b.appointmentId !== appointmentId && b.id !== `${appointmentId}-buffer`
      ),
      disruptionModal: {
        ...state.disruptionModal,
        affectedAppointments: state.disruptionModal.affectedAppointments.filter(
          (a) => a.appointmentId !== appointmentId
        ),
      },
      toast: {
        tone: 'amber',
        text: `Automated Telegram/SMS disruption alert dispatched to ${apt?.patientName || 'patient'}. Rescheduling priority token issued.`,
      },
    }));
    soundService.playAlert();
  },

  // Real-time SSE Cell Invalidation Simulation (Risk R-14)
  simulateIncomingHold: () => {
    const { currentDateOffset, doctors } = get();
    const doc = doctors[0];
    const startTs = at(currentDateOffset, 15, 30);
    const holdId = `HOLD-${Math.floor(100 + Math.random() * 900)}`;

    const newHold = {
      id: holdId,
      appointmentId: holdId,
      doctorId: doc.id,
      serviceId: 'svc-dental',
      patientName: 'Amina Yusuf (Online)',
      patientPhone: '+2348012345678',
      type: 'hold',
      status: 'held',
      label: 'Hold: Amina Yusuf',
      start: startTs,
      end: startTs + 30 * MIN,
      durationMin: 30,
      bufferMin: 10,
      holdExpiresAt: Date.now() + 15 * MIN,
      channel: 'telegram',
      isRecentUpdate: true,
    };

    set((state) => ({
      blocks: [...state.blocks.filter((b) => b.start !== startTs || b.doctorId !== doc.id), newHold],
      toast: {
        tone: 'info',
        text: `SSE: calendar.slot_updated — 15-minute temporary hold placed at 03:30 PM by Telegram Bot.`,
      },
    }));

    soundService.playChime();
  },

  addDoctor: (newDoc) => {
    set((state) => {
      const exists = state.doctors.some((d) => d.id === newDoc.id);
      if (exists) return state;
      const formatted = {
        id: newDoc.id,
        name: newDoc.name,
        specialty: newDoc.specialty || 'General Practitioner',
        shiftStartMin: newDoc.shiftStartMin || 8 * 60,
        shiftEndMin: newDoc.shiftEndMin || 17 * 60,
        serviceIds: newDoc.serviceIds || ['svc-checkup', 'svc-dental', 'svc-extract'],
        isOnDuty: true,
        isEmergencyLeave: false,
        emergencyReason: null,
      };
      return {
        doctors: [...state.doctors, formatted],
        toast: {
          tone: 'success',
          text: `Doctor ${formatted.name} (${formatted.specialty}) added to calendar schedule.`,
        },
      };
    });
  },

  updateDoctor: (updatedDoc) => {
    set((state) => ({
      doctors: state.doctors.map((d) =>
        d.id === updatedDoc.id ? { ...d, ...updatedDoc } : d
      ),
    }));
  },

  resetToDemoDefaults: () => {
    set({
      blocks: initCalendarBlocks(),
      toast: {
        tone: 'info',
        text: 'Calendar schedule reset to clean demo seeds.',
      },
    });
  },

  dismissToast: () => set({ toast: null }),
    }),
    {
      name: 'cbs_calendar_storage',
      partialize: (state) => ({
        blocks: state.blocks,
      }),
    }
  )
);

// Register cross-store synchronization listeners
appointmentSyncBus.subscribe('appointmentBooked', (appt) => {
  const store = useCalendarStore.getState();
  const exists = store.blocks.some(
    (b) => b.appointmentId === appt.id || b.id === appt.id
  );
  if (!exists) {
    store.confirmPatientBooking({
      appointmentId: appt.id,
      patientName: appt.patientName,
      patientPhone: appt.phone || appt.patientPhone || '',
      doctorId: appt.doctorId,
      serviceId: appt.serviceId,
      startTs: appt.start,
      patientType: appt.patientType || 'new',
      channel: appt.channel || 'web',
      notes: appt.notes || '',
    });
  }
});

appointmentSyncBus.subscribe('walkInAdmitted', (visit) => {
  const store = useCalendarStore.getState();
  const exists = store.blocks.some(
    (b) => b.appointmentId === visit.appointmentId || b.id === visit.id
  );
  if (!exists) {
    const service = getService(visit.serviceId) || SERVICES[0];
    const duration = service.durationMin || 30;
    const buffer = service.bufferMin !== undefined ? service.bufferMin : 10;
    const startTs = visit.scheduledTime || visit.arrivedAt || Date.now();
    const endTs = startTs + duration * MIN;

    const walkInBlock = {
      id: visit.id,
      appointmentId: visit.appointmentId || visit.id,
      doctorId: visit.doctorId,
      serviceId: visit.serviceId,
      patientName: visit.patientName,
      patientPhone: visit.patientPhone,
      patientType: visit.patientType || 'new',
      type: 'appointment',
      status: 'confirmed',
      label: `Walk-In: ${visit.patientName}`,
      start: startTs,
      end: endTs,
      durationMin: duration,
      bufferMin: buffer,
      notes: visit.notes || 'Front-desk walk-in registration.',
      channel: 'reception',
    };

    const bufferBlock = {
      id: `${visit.id}-buffer`,
      appointmentId: visit.appointmentId || visit.id,
      doctorId: visit.doctorId,
      type: 'buffer',
      label: `${buffer}m Sterilization Buffer`,
      start: endTs,
      end: endTs + buffer * MIN,
      durationMin: buffer,
    };

    useCalendarStore.setState((state) => ({
      blocks: [...state.blocks, walkInBlock, bufferBlock],
    }));
  }
});

appointmentSyncBus.subscribe('visitStatusChanged', ({ appointmentId, status }) => {
  useCalendarStore.setState((state) => ({
    blocks: state.blocks.map((b) => {
      if (b.appointmentId === appointmentId || b.id === appointmentId) {
        return {
          ...b,
          status,
          label:
            status === 'waiting'
              ? `Waiting: ${b.patientName}`
              : status === 'in_consultation'
              ? `In Consult: ${b.patientName}`
              : status === 'completed'
              ? `Completed: ${b.patientName}`
              : status === 'no_show'
              ? `Missed: ${b.patientName}`
              : b.label,
        };
      }
      return b;
    }),
  }));
});

appointmentSyncBus.subscribe('appointmentRescheduled', ({ appointmentId, newStart, doctorId }) => {
  const store = useCalendarStore.getState();
  const apt = store.blocks.find((b) => b.appointmentId === appointmentId || b.id === appointmentId);
  if (apt && (apt.start !== newStart || (doctorId && apt.doctorId !== doctorId))) {
    const durationMin = apt.durationMin || 30;
    const bufferMin = apt.bufferMin !== undefined ? apt.bufferMin : 10;
    const endTs = newStart + durationMin * MIN;
    const docId = doctorId || apt.doctorId;

    useCalendarStore.setState((state) => ({
      blocks: state.blocks.map((b) => {
        if (b.appointmentId === appointmentId || b.id === appointmentId) {
          return { ...b, start: newStart, end: endTs, doctorId: docId };
        }
        if (b.id === `${appointmentId}-buffer` || (b.appointmentId === appointmentId && b.type === 'buffer')) {
          return { ...b, start: endTs, end: endTs + bufferMin * MIN, doctorId: docId };
        }
        return b;
      }),
    }));
  }
});

appointmentSyncBus.subscribe('doctorEnrolled', (doctor) => {
  useCalendarStore.getState().addDoctor(doctor);
});

appointmentSyncBus.subscribe('doctorUpdated', (doctor) => {
  useCalendarStore.getState().updateDoctor(doctor);
});


