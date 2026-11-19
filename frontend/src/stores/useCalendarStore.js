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

// The calendar roster and the backend staff directory spell the same doctor
// differently ("Dr. Aminu Bello" vs "Dr. Bello Ibrahim"), so names are matched
// on shared tokens rather than a substring. Never guess: no match = error.
const nameTokens = (name) =>
  String(name || '')
    .toLowerCase()
    .replace(/^dr\.?\s*/, '')
    .split(/[\s.]+/)
    .filter(Boolean);

const doctorNamesMatch = (a, b) => {
  const x = nameTokens(a);
  const y = nameTokens(b);
  return x.length > 0 && x.some((token) => y.includes(token));
};

const resolveBackendDoctor = async (doctorName) => {
  const directory = await apiService.fetchStaffDirectory();
  const match = (directory?.doctors || []).find((d) => doctorNamesMatch(d.name, doctorName));
  if (!match) {
    throw new Error('Doctor not found in the clinic staff directory');
  }
  return match;
};

// Roster doctors -> backend directory entries. The two spell names differently,
// so this uses the same token matcher as the single-doctor lookup. A doctor
// that cannot be matched is returned with `backend: null` and the caller must
// refuse the plan rather than silently drop them.
const resolveChosenColleagues = async (chosenDocs) => {
  const directory = await apiService.fetchStaffDirectory();
  return chosenDocs.map((doc) => ({
    rosterId: doc.id,
    name: doc.name,
    backend: (directory?.doctors || []).find((d) => doctorNamesMatch(d.name, doc.name)) || null,
  }));
};

// Local-midnight day bounds -> the ISO window the backend resolver expects.
const leaveWindowPayload = (startDay, endDay) => ({
  leave_start: new Date(startDay).toISOString(),
  leave_end: new Date(endDay + 24 * 60 * MIN - 1).toISOString(),
});

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

  // Emergency Disruption Modal (Risk R-15). `leaveWindow` is the planned leave
  // (whole days, inclusive); `preview` is the backend's rolled-back dry run of
  // the very resolver that Approve will run. `distributionMode` is the
  // receptionist's choice of who takes the patients (Step 2).
  disruptionModal: {
    isOpen: false,
    doctorId: null,
    dayStart: null,
    affectedAppointments: [],
    leaveWindow: null,
    preview: null,
    previewLoading: false,
    previewError: null,
    distributionMode: 'auto',
    chosenColleagueIds: [],
    colleagueCaps: {},
  },

  // Step 3 safety net. `stranded` is Django's list of patients still booked
  // under a doctor who is on leave; `lastDistribution` is the plan that was
  // just approved, so it can be undone while nothing has reached a patient.
  stranded: { count: 0, days: [], patients: [], loading: false, error: null },
  lastDistribution: null,
  // Bumped every time this tab itself writes lastDistribution. A read-back
  // that started before that write must not overwrite it (see
  // loadLastDistribution).
  _planSeq: 0,
  undoingDistribution: false,
  strandedPanelOpen: false,

  // In-App Toast
  toast: null,

  // --- ACTIONS ---

  setViewMode: (mode) => set({ viewMode: mode }),
  setSelectedServiceId: (serviceId) => set({ selectedServiceId: serviceId }),

  // Doctor leave periods from the backend, keyed by roster id. The calendar
  // derives "on leave" for the day it is showing from these raw ranges.
  leavePeriods: {},

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
  // dayStartTs: optional explicit day (local midnight) so the affected list
  // mirrors exactly the day the receptionist is viewing.
  openDisruptionModal: (doctorId, dayStartTs = null) => {
    const { blocks, currentDateOffset } = get();
    const dayStart = dayStartTs ?? startOfDayOffset(currentDateOffset);
    const dayEnd = dayStart + 24 * 60 * MIN;

    // Find all confirmed/held appointments for this doctor on current viewed day.
    // Same statuses the backend resolver will move: a patient who already
    // arrived, was seen, or whose hold expired is not part of the plan, so it
    // must not appear here either.
    const now = Date.now();
    const affected = blocks.filter(
      (b) =>
        b.doctorId === doctorId &&
        (b.type === 'appointment' || b.type === 'hold') &&
        (!b.status || b.status === 'confirmed' || b.status === 'held') &&
        !(b.holdExpiresAt && b.holdExpiresAt < now) &&
        b.start >= dayStart &&
        b.start < dayEnd
    );

    set({
      disruptionModal: {
        isOpen: true,
        doctorId,
        dayStart,
        affectedAppointments: affected,
        leaveWindow: { startDay: dayStart, endDay: dayStart },
        preview: null,
        previewLoading: false,
        previewError: null,
        distributionMode: 'auto',
        chosenColleagueIds: [],
        colleagueCaps: {},
      },
    });
  },

  // The receptionist widens or narrows the planned leave (whole days). Any
  // change throws away the old preview: it no longer describes this plan.
  setLeaveWindow: ({ startDay, endDay }) => {
    set((state) => {
      const start = startDay ?? state.disruptionModal.leaveWindow?.startDay ?? state.disruptionModal.dayStart;
      const rawEnd = endDay ?? state.disruptionModal.leaveWindow?.endDay ?? start;
      const end = rawEnd < start ? start : rawEnd;
      return {
        disruptionModal: {
          ...state.disruptionModal,
          leaveWindow: { startDay: start, endDay: end },
          preview: null,
          previewError: null,
        },
      };
    });
  },

  // Distribution (Step 2): who takes the patients and how many extra each may
  // take on any one day. Any change throws the old preview away.
  setDistributionMode: (mode) => {
    set((state) => ({
      disruptionModal: {
        ...state.disruptionModal,
        distributionMode: mode,
        preview: null,
        previewError: null,
      },
    }));
  },

  toggleColleagueChoice: (rosterId) => {
    set((state) => {
      const chosen = state.disruptionModal.chosenColleagueIds || [];
      const nextChosen = chosen.includes(rosterId)
        ? chosen.filter((id) => id !== rosterId)
        : [...chosen, rosterId];
      return {
        disruptionModal: {
          ...state.disruptionModal,
          chosenColleagueIds: nextChosen,
          preview: null,
          previewError: null,
        },
      };
    });
  },

  chooseSingleColleague: (rosterId) => {
    set((state) => ({
      disruptionModal: {
        ...state.disruptionModal,
        chosenColleagueIds: rosterId ? [rosterId] : [],
        preview: null,
        previewError: null,
      },
    }));
  },

  setColleagueCap: (rosterId, value) => {
    set((state) => {
      const caps = { ...(state.disruptionModal.colleagueCaps || {}) };
      if (value === '' || value === null || value === undefined) {
        delete caps[rosterId];
      } else {
        const parsed = Number(value);
        caps[rosterId] = Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
      }
      return {
        disruptionModal: {
          ...state.disruptionModal,
          colleagueCaps: caps,
          preview: null,
          previewError: null,
        },
      };
    });
  },

  // Roster choice -> the ids the backend resolver expects, plus caps keyed the
  // same way. Throws (never guesses) when a chosen doctor is not in the
  // directory or nobody was chosen.
  _distributionPayload: async () => {
    const modal = get().disruptionModal;
    const mode = modal.distributionMode || 'auto';
    if (mode === 'auto') return { colleague_ids: null, colleague_caps: null };

    const roster = get().doctors;
    const chosenDocs = (modal.chosenColleagueIds || [])
      .map((id) => roster.find((doc) => doc.id === id))
      .filter(Boolean);
    if (chosenDocs.length === 0) {
      throw new Error('Pick at least one colleague for this plan.');
    }

    const resolved = await resolveChosenColleagues(chosenDocs);
    const unmatched = resolved.filter((item) => !item.backend).map((item) => item.name);
    if (unmatched.length > 0) {
      throw new Error(`Could not find ${unmatched.join(', ')} in the clinic staff directory.`);
    }

    const colleague_ids = resolved.map((item) => item.backend.id);
    const colleague_caps = {};
    resolved.forEach((item) => {
      const cap = modal.colleagueCaps?.[item.rosterId];
      if (cap === undefined || cap === null) return;
      colleague_caps[item.backend.id] = Math.max(0, Number(cap) || 0);
    });
    return { colleague_ids, colleague_caps };
  },

  // Dry run: the backend runs the REAL resolver inside a rolled-back
  // transaction, with the same chosen colleagues and caps. Same placements,
  // same counts, nothing saved, nothing sent.
  previewDisruptionPlan: async (reason = 'Planned Leave') => {
    const modal = get().disruptionModal;
    const docId = modal.doctorId;
    if (!docId) return { success: false, message: 'No doctor selected' };

    const doctorName = getDoctor(docId)?.name || 'Doctor';
    const dayStart = modal.leaveWindow?.startDay ?? modal.dayStart ?? startOfDayOffset(get().currentDateOffset);
    const dayEnd = modal.leaveWindow?.endDay ?? dayStart;

    set((state) => ({
      disruptionModal: { ...state.disruptionModal, previewLoading: true, previewError: null },
    }));

    try {
      if (useAppModeStore.getState().isDemoMode) {
        // Demo mode has no backend: plan locally from the blocks on screen and
        // say so. Nothing is claimed about patient messages.
        const report = get()._demoDisruptionPreview(docId, dayStart, dayEnd);
        set((state) => ({
          disruptionModal: {
            ...state.disruptionModal,
            preview: report,
            previewLoading: false,
            previewError: null,
            demoPreview: true,
          },
        }));
        return { success: true, report };
      }

      const backendDoctor = await resolveBackendDoctor(doctorName);
      const distribution = await get()._distributionPayload();
      const report = await apiService.previewDisruption(
        backendDoctor.id,
        { reason, ...leaveWindowPayload(dayStart, dayEnd), ...distribution }
      );
      set((state) => ({
        disruptionModal: {
          ...state.disruptionModal,
          preview: report,
          previewLoading: false,
          previewError: null,
          demoPreview: false,
        },
      }));
      return { success: true, report };
    } catch (err) {
      const message = err?.message || 'Could not preview this leave plan';
      set((state) => ({
        disruptionModal: {
          ...state.disruptionModal,
          preview: null,
          previewLoading: false,
          previewError: message,
        },
      }));
      return { success: false, message };
    }
  },

  // Local-only plan used by the demo simulator. Same shape as the backend
  // report and the same rules: chosen colleagues only, caps counted per doctor
  // per day, priority "same time" then "earliest free slot that day".
  _demoDisruptionPreview: (docId, startDay, endDay = startDay) => {
    const modal = get().disruptionModal;
    const mode = modal.distributionMode || 'auto';
    const chosenIds = modal.chosenColleagueIds || [];
    const caps = modal.colleagueCaps || {};
    const now = Date.now();

    let colleagues = get().doctors.filter(
      (d) => d.id !== docId && d.isOnDuty && !d.isEmergencyLeave
    );
    if (mode !== 'auto') {
      colleagues = colleagues.filter((d) => chosenIds.includes(d.id));
    }

    const dayKeyOf = (ts) => {
      const d = new Date(ts);
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    };
    const dayLabel = (ts) =>
      new Date(ts).toLocaleDateString('en-GB', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
      });

    // A working copy, so patient 2 sees where patient 1 landed — the same way
    // the backend resolver plans against its own moves.
    let projected = [...get().blocks];
    const placedByDay = {};
    const capsHit = new Set();
    let capNote = null;
    const results = [];

    const capAllows = (doctorId, dayKey) => {
      const cap = caps[doctorId];
      if (cap === undefined || cap === null) return true;
      return (placedByDay[`${doctorId}|${dayKey}`] || 0) < Number(cap);
    };
    const noteCap = (doctor, ts) => {
      capsHit.add(doctor.name);
      if (capNote) return;
      const used = placedByDay[`${doctor.id}|${dayKeyOf(ts)}`] || 0;
      capNote = `${doctor.name} hit the cap you set for ${dayLabel(ts)} (${used} of ${Number(
        caps[doctor.id]
      )}).`;
    };

    for (let dayStart = startDay; dayStart <= endDay; dayStart += 24 * 60 * MIN) {
      const dayEndTs = dayStart + 24 * 60 * MIN;
      const affected = projected
        .filter(
          (b) =>
            b.doctorId === docId &&
            (b.type === 'appointment' || b.type === 'hold') &&
            (!b.status || b.status === 'confirmed' || b.status === 'held') &&
            !(b.holdExpiresAt && b.holdExpiresAt < now) &&
            b.start >= dayStart &&
            b.start < dayEndTs
        )
        .sort((a, b) => a.start - b.start);

      affected.forEach((apt) => {
        const aptKey = apt.appointmentId || apt.id;
        const durationMin = apt.durationMin || 30;
        const bufferMin = apt.bufferMin !== undefined ? apt.bufferMin : 10;
        const busyWithoutApt = projected.filter(
          (b) => b.appointmentId !== aptKey && b.id !== apt.id && b.id !== `${aptKey}-buffer`
        );

        let placed = null;
        for (const colleague of colleagues) {
          if (!capAllows(colleague.id, dayKeyOf(apt.start))) {
            noteCap(colleague, apt.start);
            continue;
          }
          const validation = validateSlot(
            { doctorId: colleague.id, start: apt.start, durationMin, bufferMin },
            busyWithoutApt
          );
          if (validation.ok) {
            placed = { doctorId: colleague.id, start: apt.start };
            break;
          }
        }

        if (!placed) {
          for (const colleague of colleagues) {
            for (
              let ts = Math.max(dayStart, apt.start);
              ts + durationMin * MIN <= dayEndTs;
              ts += 15 * MIN
            ) {
              if (ts === apt.start) continue;
              if (!capAllows(colleague.id, dayKeyOf(ts))) {
                noteCap(colleague, ts);
                continue;
              }
              const validation = validateSlot(
                { doctorId: colleague.id, start: ts, durationMin, bufferMin },
                busyWithoutApt
              );
              if (validation.ok) {
                placed = { doctorId: colleague.id, start: ts };
                break;
              }
            }
            if (placed) break;
          }
        }

        if (placed) {
          const key = `${placed.doctorId}|${dayKeyOf(placed.start)}`;
          placedByDay[key] = (placedByDay[key] || 0) + 1;
          const newEnd = placed.start + durationMin * MIN;
          projected = projected.map((b) => {
            if (b.appointmentId === aptKey || b.id === apt.id) {
              return { ...b, doctorId: placed.doctorId, start: placed.start, end: newEnd };
            }
            if (b.id === `${aptKey}-buffer`) {
              return {
                ...b,
                doctorId: placed.doctorId,
                start: newEnd,
                end: newEnd + bufferMin * MIN,
              };
            }
            return b;
          });
        }

        const placedDoctor = placed
          ? get().doctors.find((d) => d.id === placed.doctorId)
          : null;
        let unplacedReason = null;
        let unplacedText = null;
        if (!placed) {
          if (colleagues.length === 0) {
            unplacedReason = 'NO_COLLEAGUE_CHOSEN';
            unplacedText = 'No colleague is selected for this plan.';
          } else if (capNote) {
            unplacedReason = 'ALL_AT_CAP';
            unplacedText = `${capNote} No other chosen colleague could take this patient.`;
          } else {
            unplacedReason = 'NO_FREE_SLOT';
            unplacedText = `No free slot with a chosen colleague on ${dayLabel(apt.start)}.`;
          }
        }

        results.push({
          appointment_id: apt.id,
          appointment_code: aptKey,
          patient_name: apt.patientName,
          start_datetime: new Date(apt.start).toISOString(),
          outcome: placed ? 'reassigned' : 'unplaced',
          placement: placed ? 'same_day_same_time' : null,
          old_doctor: getDoctor(docId)?.name || 'Doctor',
          new_doctor: placedDoctor?.name || null,
          new_start: new Date(placed ? placed.start : apt.start).toISOString(),
          new_end: new Date(
            placed ? placed.start + durationMin * MIN : apt.end
          ).toISOString(),
          unplaced_reason: unplacedReason,
          unplaced_text: unplacedText,
        });
      });
    }

    const placedByDoctor = {};
    Object.entries(placedByDay).forEach(([key, count]) => {
      const doctorId = key.split('|')[0];
      const name = get().doctors.find((d) => d.id === doctorId)?.name || 'Colleague';
      placedByDoctor[name] = (placedByDoctor[name] || 0) + count;
    });
    const placedCount = results.filter((r) => r.outcome === 'reassigned').length;

    return {
      preview: true,
      demo: true,
      doctor_name: getDoctor(docId)?.name || 'Doctor',
      auto_resolved_count: placedCount,
      same_day_count: placedCount,
      next_day_count: 0,
      unplaced_count: results.length - placedCount,
      messages_queued_count: 0,
      distribution: {
        colleague_ids: mode === 'auto' ? null : chosenIds,
        colleague_caps: mode === 'auto' ? {} : caps,
        placed_by_doctor: placedByDoctor,
        caps_hit: [...capsHit].sort(),
      },
      results,
    };
  },

  closeDisruptionModal: () =>
    set({
      disruptionModal: {
        isOpen: false,
        doctorId: null,
        dayStart: null,
        affectedAppointments: [],
        leaveWindow: null,
        preview: null,
        previewLoading: false,
        previewError: null,
        distributionMode: 'auto',
        chosenColleagueIds: [],
        colleagueCaps: {},
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
      disruptionModal: {
        isOpen: false,
        doctorId: null,
        dayStart: null,
        affectedAppointments: [],
        leaveWindow: null,
        preview: null,
        previewLoading: false,
        previewError: null,
        distributionMode: 'auto',
        chosenColleagueIds: [],
        colleagueCaps: {},
      },
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
      const leavePeriods = {};

      docSchedules.forEach((docItem) => {
        const docNameLower = (docItem.doctor_name || '').toLowerCase();
        let mappedDocId = docItem.doctor_id;
        if (docNameLower.includes('bello')) mappedDocId = 'doc-bello';
        else if (docNameLower.includes('okafor') || docNameLower.includes('chin')) mappedDocId = 'doc-okafor';
        else if (docNameLower.includes('babawo')) mappedDocId = 'doc-babawo';

        // Keep the RAW periods. A leave only greys out the days it covers, so
        // the calendar derives the flag for whatever day it is showing.
        leavePeriods[mappedDocId] = (docItem.leave_periods || []).map((period) => ({
          start: new Date(`${period.start_date}T00:00:00`).getTime(),
          end: period.end_date
            ? new Date(`${period.end_date}T00:00:00`).getTime()
            : Infinity,
          reason: period.reason || 'Planned leave',
        }));

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

      set({ leavePeriods });

      if (remoteBlocks.length > 0) {
        set((state) => {
          // UPSERT, not append: the persisted snapshot can hold an older copy
          // of an appointment (same id, old time/doctor). Append-only sync
          // silently ignored every backend move — the calendar then showed a
          // stale slot and the disruption cockpit missed real patients.
          const remoteById = new Map(remoteBlocks.map((rb) => [rb.appointmentId, rb]));
          const matched = new Set();

          let blocks = state.blocks.map((b) => {
            const key = b.appointmentId || b.id;
            const rb = remoteById.get(key);
            if (!rb || b.type === 'buffer') return b;
            matched.add(key);
            return {
              ...b,
              doctorId: rb.doctorId,
              start: rb.start,
              end: rb.end,
              durationMin: rb.durationMin,
              bufferMin: rb.bufferMin,
              patientName: rb.patientName,
              patientPhone: rb.patientPhone,
              status: rb.status,
              label: rb.label,
              holdExpiresAt: rb.holdExpiresAt,
            };
          });

          // Recompute every sterilization buffer from its (possibly moved) parent.
          blocks = blocks.map((b) => {
            if (b.type !== 'buffer') return b;
            const parentKey = String(b.id).replace(/-buffer$/, '');
            const parent = blocks.find(
              (x) => x.type !== 'buffer' && (x.appointmentId || x.id) === parentKey
            );
            if (!parent) return b;
            return {
              ...b,
              doctorId: parent.doctorId,
              start: parent.end,
              end: parent.end + (b.durationMin || 10) * MIN,
            };
          });

          // Append appointments this browser has never seen.
          const additions = [];
          remoteBlocks.forEach((rb) => {
            if (matched.has(rb.appointmentId)) return;
            if (blocks.some((b) => (b.appointmentId || b.id) === rb.appointmentId)) return;
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
          });

          return additions.length > 0 ? { blocks: [...blocks, ...additions] } : { blocks };
        });
      }
    } catch (err) {
      console.warn('Calendar syncFromBackend fallback:', err);
    }
  },

  // Reassign affected appointments to a colleague with Schedule Collision Validation.
  //
  // Fix 4: in live mode the backend decides first. Django refuses a colleague
  // who does not offer the patient's service (or is on leave / clashes), and
  // the card must not move until that answer is in — an optimistic move would
  // leave the grid showing a patient under a doctor who never took them.
  reassignToColleague: async (appointmentId, targetDoctorId) => {
    const { blocks } = get();
    const apt = blocks.find((b) => b.appointmentId === appointmentId || b.id === appointmentId);
    if (!apt) return { success: false, message: 'Appointment not found on calendar' };

    const targetDoc = getDoctor(targetDoctorId);

    if (!useAppModeStore.getState().isDemoMode) {
      try {
        await apiService.reassignDoctorLeave(appointmentId, targetDoctorId);
      } catch (err) {
        const detail =
          err?.details?.detail ||
          err?.message ||
          `Could not transfer the patient to ${targetDoc?.name || 'this colleague'}.`;
        soundService.playAlert();
        set({ toast: { tone: 'amber', text: detail } });
        return { success: false, message: detail, code: err?.details?.error };
      }
    }

    const durationMin = apt.durationMin || 30;
    const bufferMin = apt.bufferMin !== undefined ? apt.bufferMin : 10;

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

  // One-click emergency resolution (B.4): the backend places EVERY impacted
  // patient in priority order (same-time colleague -> same-day free slot ->
  // next day) and queues WhatsApp + SMS notices with its own words. This
  // action applies the returned placements to the calendar and reports the
  // outcome TRUTHFULLY: delivery is only claimed when the backend confirms
  // the push to n8n. Demo mode simulates placement locally and never claims
  // a patient message was sent.
  autoResolveDisruption: async (doctorId, reason = 'Sudden Medical Emergency') => {
    // The modal owns the doctor context — fall back to it when the id is
    // not passed explicitly (defensive: an undefined id must never resolve
    // to the wrong doctor).
    const docId = doctorId || get().disruptionModal.doctorId;
    if (!docId) {
      return { success: false, message: 'No doctor selected for disruption resolution' };
    }
    const affected = get().disruptionModal.affectedAppointments;
    const doctorName = getDoctor(docId)?.name || 'Doctor';

    // The modal opens straight from the "Sick / Leave" button, so declaring
    // the leave is THIS action's job. Live mode: the endpoint marks the
    // backend doctor on leave; locally we mirror it for the calendar.
    set((state) => ({
      doctors: state.doctors.map((d) =>
        d.id === docId
          ? { ...d, isOnDuty: false, isEmergencyLeave: true, emergencyReason: reason }
          : d
      ),
    }));

    if (useAppModeStore.getState().isDemoMode) {
      const dayStart =
        get().disruptionModal.leaveWindow?.startDay ??
        get().disruptionModal.dayStart ??
        startOfDayOffset(get().currentDateOffset);
      const dayEnd = get().disruptionModal.leaveWindow?.endDay ?? dayStart;
      // One local planner for preview and approve, so the demo cannot promise
      // one thing and do another.
      const report = get()._demoDisruptionPreview(docId, dayStart, dayEnd);
      const roster = get().doctors;
      const newBlocks = get().blocks.map((block) => {
        const result = report.results.find(
          (r) =>
            r.outcome === 'reassigned' &&
            (r.appointment_code === block.appointmentId ||
              r.appointment_code === block.id ||
              r.appointment_id === block.id)
        );
        if (!result) return block;
        const newStart = new Date(result.new_start).getTime();
        const newEnd = new Date(result.new_end).getTime();
        const newDoctorId = result.new_doctor
          ? roster.find((doc) => doctorNamesMatch(doc.name, result.new_doctor))?.id || block.doctorId
          : block.doctorId;
        return { ...block, doctorId: newDoctorId, start: newStart, end: newEnd };
      });

      const remainingKeys = report.results
        .filter((r) => r.outcome !== 'reassigned')
        .map((r) => r.appointment_code);
      const placedCount = report.auto_resolved_count;

      set((state) => ({
        blocks: newBlocks,
        disruptionModal: {
          ...state.disruptionModal,
          ...(remainingKeys.length === 0
            ? { isOpen: false, doctorId: null }
            : {}),
          affectedAppointments: state.disruptionModal.affectedAppointments.filter(
            (a) => remainingKeys.includes(a.appointmentId || a.id)
          ),
        },
        toast: {
          tone: remainingKeys.length === 0 ? 'success' : 'amber',
          text:
            remainingKeys.length === 0
              ? `Demo auto-resolve: all ${placedCount} affected appointments re-placed on the calendar. No patient messages are sent in demo mode.`
              : `Demo auto-resolve: ${placedCount} re-placed locally, ${remainingKeys.length} need manual transfer. No patient messages are sent in demo mode.`,
        },
      }));
      if (remainingKeys.length === 0) {
        soundService.playChime();
      } else {
        soundService.playAlert();
      }
      set({
        _planSeq: get()._planSeq + 1,
        lastDistribution: {
          id: null,
          canUndo: false,
          undoReason:
            'Demo mode — this plan was simulated on screen, so there is nothing saved to undo.',
          doctorName,
          placedCount,
          demo: true,
        },
      });
      get().loadStranded();
      return { success: true, sameDay: placedCount, unplaced: remainingKeys.length };
    }

    try {
      // The calendar uses local roster ids ('doc-babawo'); the disruption
      // endpoint needs the backend Doctor UUID. The staff directory is the
      // bridge — resolved by name tokens (shared helper above).
      const nameMatches = doctorNamesMatch;
      const backendDoctor = await resolveBackendDoctor(doctorName);

      // The leave window is the plan the receptionist confirmed in the modal
      // (whole days, inclusive). Falling back to the viewed day keeps the old
      // behaviour for callers that never opened the planner.
      const dayStart =
        get().disruptionModal.leaveWindow?.startDay ??
        get().disruptionModal.dayStart ??
        startOfDayOffset(get().currentDateOffset);
      const dayEnd = get().disruptionModal.leaveWindow?.endDay ?? dayStart;
      const distribution = await get()._distributionPayload();
      const report = await apiService.autoResolveDisruption(
        backendDoctor.id,
        { reason, ...leaveWindowPayload(dayStart, dayEnd), ...distribution }
      );

      // Map backend doctor names ("Dr. Amina Bello") to local doctor ids.
      const roster = get().doctors;
      const nameToId = (name) => {
        if (!name) return null;
        return roster.find((d) => nameMatches(d.name, name))?.id || null;
      };

      set((state) => {
        let blocks = state.blocks;
        report.results.forEach((r) => {
          if (r.outcome !== 'reassigned') return;
          const keys = [r.appointment_code, r.appointment_id].filter(Boolean);
          const newDocId = nameToId(r.new_doctor);
          const newStart = new Date(r.new_start).getTime();
          const newEnd = new Date(r.new_end).getTime();
          blocks = blocks.map((b) => {
            if (keys.includes(b.appointmentId) || keys.includes(b.id)) {
              return { ...b, doctorId: newDocId || b.doctorId, start: newStart, end: newEnd };
            }
            if (keys.some((k) => b.id === `${k}-buffer`)) {
              return {
                ...b,
                doctorId: newDocId || b.doctorId,
                start: newEnd,
                end: newEnd + (b.durationMin || 10) * MIN,
              };
            }
            return b;
          });
          appointmentSyncBus.publishAppointmentRescheduled({
            appointmentId: r.appointment_code || r.appointment_id,
            newStart,
            doctorId: newDocId,
          });
        });

        const unplacedResults = report.results.filter((r) => r.outcome !== 'reassigned');
        const remainingKeys = unplacedResults.map(
          (r) => r.appointment_code || r.appointment_id
        );

        const parts = [];
        if (report.same_day_count) parts.push(`${report.same_day_count} same day`);
        if (report.next_day_count) parts.push(`${report.next_day_count} next day`);
        const placementSummary = parts.length ? parts.join(', ') : 'no automatic placement';
        const delivery = report.delivery_pushed
          ? `${report.messages_queued_count} notices pushed for WhatsApp/SMS delivery.`
          : report.messages_queued_count
            ? `${report.messages_queued_count} notices queued — delivery follows via the messaging workflows.`
            : 'No notices queued.';

        return {
          blocks,
          disruptionModal: {
            ...state.disruptionModal,
            ...(remainingKeys.length === 0 ? { isOpen: false, doctorId: null } : {}),
            affectedAppointments: state.disruptionModal.affectedAppointments.filter(
              (a) => remainingKeys.includes(a.appointmentId || a.id)
            ),
          },
          toast: {
            tone: unplacedResults.length === 0 ? 'success' : 'amber',
            text: `${report.doctor_name || doctorName}'s leave auto-resolved: ${placementSummary}. ${
              unplacedResults.length ? `${unplacedResults.length} need manual transfer. ` : ''
            }${delivery}`,
          },
        };
      });

      if (report.unplaced_count === 0) {
        soundService.playChime();
      } else {
        soundService.playAlert();
      }
      const batch = report.batch || null;
      set({
        _planSeq: get()._planSeq + 1,
        lastDistribution: batch
          ? {
              id: batch.id,
              canUndo: Boolean(batch.can_undo),
              undoReason: batch.undo_reason || null,
              doctorName: report.doctor_name || doctorName,
              placedCount: report.auto_resolved_count || 0,
              unplacedCount: report.unplaced_count || 0,
              createdAt: Date.now(),
            }
          : null,
      });
      get().syncFromBackend();
      get().loadStranded();
      return { success: true, report };
    } catch (err) {
      console.warn('Auto-resolve disruption failed:', err);
      set({
        toast: {
          tone: 'amber',
          text: `Auto-resolve failed for ${doctorName}: ${
            err?.message || 'backend error'
          }. Patients still need manual transfer.`,
        },
      });
      soundService.playAlert();
      return { success: false, message: err?.message || 'Auto-resolve failed' };
    }
  },

  // --- Step 3: stranded queue + undo of the last distribution ---

  openStrandedPanel: () => set({ strandedPanelOpen: true }),
  closeStrandedPanel: () => set({ strandedPanelOpen: false }),

  // Django decides who is stranded. Demo mode derives the same list from the
  // doctors marked on leave on screen, so the pitch shows the real behaviour.
  //
  // `silent` is for background refreshes (the Shell poll and SSE): it updates
  // the numbers without flipping the panel into "Refreshing…".
  loadStranded: async ({ silent = false } = {}) => {
    if (useAppModeStore.getState().isDemoMode) {
      const demo = get()._demoStranded();
      set({ stranded: { ...demo, loading: false, error: null } });
      return demo;
    }
    if (!silent) {
      set((state) => ({ stranded: { ...state.stranded, loading: true, error: null } }));
    }
    try {
      const data = await apiService.fetchStranded();
      const next = {
        count: data?.count || 0,
        days: data?.days || [],
        patients: data?.patients || [],
        loading: false,
        error: null,
      };
      set({ stranded: next });
      return next;
    } catch (err) {
      set((state) => ({
        stranded: {
          ...state.stranded,
          loading: false,
          error: err?.details?.detail || err?.message || 'Could not load stranded patients',
        },
      }));
      return null;
    }
  },

  // Fix 1 — bring the undo strip back after a refresh (or on another
  // receptionist's machine). The batch has always been durable in the
  // database; before this, the strip lived only in the tab that approved it.
  //
  // A slow reply must never overwrite a plan this tab just approved: the
  // request captures the write counter first and drops its own answer if the
  // counter moved. A failed read keeps whatever is on screen.
  loadLastDistribution: async () => {
    if (useAppModeStore.getState().isDemoMode) return null;
    const seq = get()._planSeq || 0;
    try {
      const data = await apiService.fetchLastDisruptionBatch();
      if ((get()._planSeq || 0) !== seq) return get().lastDistribution;

      const batch = data?.batch || null;
      if (!batch) {
        set({ lastDistribution: null });
        return null;
      }

      const next = {
        id: batch.id,
        canUndo: Boolean(batch.can_undo),
        undoReason: batch.undo_reason || null,
        doctorName: batch.doctor_name,
        placedCount: batch.placed_count || 0,
        unplacedCount: batch.unplaced_count || 0,
        createdAt: batch.created_at ? new Date(batch.created_at).getTime() : null,
      };
      set({ lastDistribution: next });
      return next;
    } catch (err) {
      console.warn('Could not load the last distribution:', err);
      return null;
    }
  },

  _demoStranded: () => {
    const { blocks, doctors } = get();
    const groups = {};
    (blocks || []).forEach((block) => {
      const doctor = doctors.find((d) => d.id === block.doctorId);
      if (!doctor?.isEmergencyLeave) return;
      if (block.type !== 'appointment' && block.type !== 'hold') return;
      const when = new Date(block.start);
      if (!Number.isFinite(when.getTime()) || when.getTime() < Date.now()) return;
      const date = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}-${String(when.getDate()).padStart(2, '0')}`;
      const key = `${date}|${doctor.id}`;
      if (!groups[key]) {
        groups[key] = {
          date,
          label: when.toLocaleDateString('en-GB', {
            weekday: 'short',
            day: '2-digit',
            month: 'short',
          }),
          doctor_id: doctor.id,
          doctor_name: doctor.name,
          leave_reason: doctor.emergencyReason || 'On leave (demo)',
          patients: [],
        };
      }
      groups[key].patients.push({
        appointment_id: block.appointmentId || block.id,
        appointment_code: block.appointmentId || block.id,
        patient_name: block.patientName || block.label || 'Patient',
        patient_phone: block.patientPhone || '',
        service_name: block.serviceName || 'Consultation',
        status: block.status || block.type,
        time_label: when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
        unplaced_reason: null,
        unplaced_text: null,
        batch_id: null,
      });
    });
    const days = Object.values(groups).sort((a, b) =>
      a.date === b.date
        ? a.doctor_name.localeCompare(b.doctor_name)
        : a.date.localeCompare(b.date)
    );
    const patients = days.flatMap((day) => day.patients);
    return { count: patients.length, days, patients };
  },

  // Undo the last approved distribution. The backend is the guard: it refuses
  // once a notice has reached a patient or a later plan covers the same days,
  // and its plain reason replaces the button with an explanation.
  undoLastDistribution: async () => {
    const last = get().lastDistribution;
    if (!last?.id) {
      return {
        success: false,
        message:
          (last && last.undoReason) || 'There is no saved plan to undo.',
      };
    }
    set({ undoingDistribution: true });
    try {
      const result = await apiService.undoDisruptionBatch(last.id);
      set({
        undoingDistribution: false,
        _planSeq: get()._planSeq + 1,
        lastDistribution: null,
        toast: {
          tone: 'success',
          text: result?.message || 'The last plan was undone.',
        },
      });
      await get().syncFromBackend();
      await get().loadStranded();
      soundService.playChime();
      return { success: true, result };
    } catch (err) {
      const detail =
        err?.details?.detail || err?.message || 'Could not undo this plan';
      set((state) => ({
        undoingDistribution: false,
        _planSeq: state._planSeq + 1,
        lastDistribution: state.lastDistribution
          ? { ...state.lastDistribution, canUndo: false, undoReason: detail }
          : null,
        toast: { tone: 'amber', text: `Undo refused: ${detail}` },
      }));
      soundService.playAlert();
      return { success: false, message: detail };
    }
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


