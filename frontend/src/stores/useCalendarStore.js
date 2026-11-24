import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  CLINIC_RULES,
  BASE_OFFSET,
  startOfDayOffset,
  // `at` is used ONLY by simulateIncomingHold — the pitch simulator's SSE
  // demo cell, which draws from the simulator's own dataset.
  at,
} from '../services/mockData';
import { clinicNow, clinicParts } from '../services/clinicTimeService';
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


export const useCalendarStore = create(
  persist(
    (set, get) => ({
  // Navigation & View
  currentDateOffset: BASE_OFFSET, // days from today
  viewMode: 'day', // 'day' | 'week'
  selectedServiceId: 'all', // 'all' | 'svc-dental' | 'svc-extract' | 'svc-checkup'
  liveSyncConnected: true,

  // Wave 3 / Step 3.7-B: the roster and the schedule come from the API.
  // The store starts EMPTY; syncFromBackend replaces both with the real
  // doctors and blocks (see the mapping there). The pitch simulator keeps
  // its own private dataset.
  doctors: [],

  // All blocks on schedule (appointments, holds, buffers, breaks, reserves)
  blocks: [],

  // The clinic's real rest window and hours, read from the same schedule feed
  // the grid already loads. null until the first sync.
  clinicLunch: null,
  clinicHours: null,

  // T-786: the real emergency reserve rows from the schedule feed. The grid
  // draws these instead of a hardcoded "1 Emergency Reserve" card.
  reserveSlots: [],

  // Walk-In Quick Booking Modal — no mock pre-selection; the UI populates
  // the first REAL doctor/service once the roster answers.
  walkInModal: {
    isOpen: false,
    doctorId: null,
    startTs: null,
    serviceId: null,
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
  movingStrandedId: null,
  strandedPanelOpen: false,

  // In-App Toast
  toast: null,

  // --- ACTIONS ---

  setViewMode: (mode) => set({ viewMode: mode }),
  setSelectedServiceId: (serviceId) => set({ selectedServiceId: serviceId }),

  // Doctor leave periods from the backend, keyed by roster id. The calendar
  // derives "on leave" for the day it is showing from these raw ranges.
  leavePeriods: {},

  // Leave lifecycle / Step 2 — the planned-leave form. Kept apart from the
  // emergency cockpit on purpose: a quiet future window needs no patient moves.
  leavePlanner: {
    isOpen: false,
    doctorId: null,
    backendDoctorId: null,
    doctorName: '',
    leaves: [],
    doctorIsOnLeave: false,
    loading: false,
    saving: false,
    error: null,
    demo: false,
  },

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
    // Wave 3 / Step 3.7-B: the default doctor is the FIRST REAL one from the
    // synced roster — never a mock slug. The service picker selects from the
    // real services list itself.
    const roster = get().doctors;
    const firstDoc = doctorId || roster[0]?.id || null;
    const defaultStart = startTs || startOfDayOffset(get().currentDateOffset) + 11 * 60 * MIN;
    set({
      walkInModal: {
        isOpen: true,
        doctorId: firstDoc,
        startTs: defaultStart,
        serviceId: null,
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
  // Wave 3 / Step 3.5: the backend is asked FIRST in live mode and the block
  // committed is the one IT created (real appointment code, real times). A
  // refusal answers with the server's own sentence — Wave 2 made the 409s
  // readable — and the slot stays free. The optimistic instant-commit
  // survives only for demo rows.
  confirmWalkIn: async ({ patientName, phone, doctorId, serviceId, startTs, notes }) => {
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

    const commitBlocks = (apptId, start, end) => {
      const newApptBlock = {
        id: apptId,
        appointmentId: apptId,
        doctorId,
        serviceId,
        patientName: patientName.trim() || 'Walk-In Patient',
        patientPhone: phone || '',
        type: 'appointment',
        status: 'arrived',
        label: `Booked: ${patientName.trim() || 'Walk-In Patient'}`,
        start,
        end,
        durationMin: Math.round((end - start) / MIN),
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
        start: end,
        end: end + service.bufferMin * MIN,
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
      soundService.playChime();
    };

    const endTs = startTs + service.durationMin * MIN;

    if (!useAppModeStore.getState().isDemoMode) {
      try {
        const res = await apiService.registerWalkIn({
          doctorId,
          serviceId,
          patientName: patientName.trim() || 'Walk-In Patient',
          phone: phone || '',
          startTs,
          endTs,
          notes: notes || 'Counter Walk-In',
        });
        const appt = res?.appointment || res || {};
        const realCode = appt.appointment_code || res?.appointment_code;
        const realStart = appt.start_datetime ? Date.parse(appt.start_datetime) : startTs;
        const realEnd = appt.end_datetime ? Date.parse(appt.end_datetime) : endTs;
        commitBlocks(realCode, realStart, realEnd);
      } catch (err) {
        // Nothing was booked: no block, no broadcast — the server's own
        // explanation of why, on a red toast.
        soundService.playAlert();
        set({
          toast: {
            tone: 'error',
            text:
              err.details?.detail ||
              err.message ||
              'The walk-in was refused — nothing was saved.',
          },
        });
        return { success: false, message: err.details?.detail || err.message };
      }
      return { success: true };
    }

    // Demo row: the optimistic instant commit IS the product here.
    const apptId = `AP-${Math.floor(1000 + Math.random() * 9000)}`;
    commitBlocks(apptId, startTs, endTs);
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
    // Wave 3 / Step 3.7-B: no mock fallback — a real (UUID) service id finds
    // nothing in the mock registry and must not silently become one.
    const service = getService(serviceId) || null;
    const apptId = appointmentId || `AP-${Math.floor(1000 + Math.random() * 9000)}`;
    const duration = service?.durationMin || 30;
    const buffer = service?.bufferMin !== undefined ? service.bufferMin : 10;
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
    const now = clinicNow();
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
        leaveKind: 'emergency',
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
    const now = clinicNow();

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
        leaveKind: 'emergency',
        preview: null,
        previewLoading: false,
        previewError: null,
        distributionMode: 'auto',
        chosenColleagueIds: [],
        colleagueCaps: {},
      },
    }),

  // Leave lifecycle / Step 3 — why the doctor is away decides the patient's
  // sentence. "Planned leave" must never be announced as a sudden emergency.
  setLeaveKind: (kind) =>
    set((state) => ({
      disruptionModal: {
        ...state.disruptionModal,
        leaveKind: kind === 'planned' ? 'planned' : 'emergency',
      },
    })),

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

  restoreDoctorDuty: async (doctorId) => {
    const doctorName = getDoctor(doctorId)?.name || 'Doctor';
    const closedModal = {
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
    };

    // Demo mode has no backend: flip locally and say so.
    if (useAppModeStore.getState().isDemoMode) {
      set((state) => ({
        doctors: state.doctors.map((d) =>
          d.id === doctorId
            ? { ...d, isOnDuty: true, isEmergencyLeave: false, emergencyReason: null }
            : d
        ),
        disruptionModal: closedModal,
        toast: { tone: 'success', text: `${doctorName} marked back On Duty.` },
      }));
      soundService.playChime();
      return { success: true };
    }

    // Live: the server decides. The old code flipped the flag locally and
    // ignored the answer — after a plan the dated leave survived, so the
    // screen said "on duty" while every booking was still refused.
    try {
      const backendDoctor = await resolveBackendDoctor(doctorName);
      const res = await apiService.endDoctorLeave(backendDoctor.id);
      const stillOnLeave = Boolean(res?.doctor?.is_on_leave);

      set((state) => ({
        doctors: state.doctors.map((d) =>
          d.id === doctorId
            ? {
                ...d,
                isOnDuty: !stillOnLeave,
                isEmergencyLeave: stillOnLeave,
                emergencyReason: stillOnLeave ? d.emergencyReason : null,
              }
            : d
        ),
        disruptionModal: closedModal,
        toast: {
          tone: stillOnLeave ? 'warning' : 'success',
          text:
            res?.message
            || (stillOnLeave
              ? `${doctorName} is still on leave today.`
              : `${doctorName} is back on duty today.`),
        },
      }));
      if (!stillOnLeave) soundService.playChime();
      // Re-read the roster so the calendar shows the real leave periods.
      await get().syncFromBackend();
      return { success: true, stillOnLeave };
    } catch (err) {
      set({
        toast: {
          tone: 'error',
          text: err?.message || `Could not end ${doctorName}'s leave.`,
        },
      });
      return { success: false, message: err?.message };
    }
  },

  // ---------------------------------------------------------------------------
  // Leave lifecycle / Step 2 — planned leave, its own form.
  // ---------------------------------------------------------------------------
  openLeavePlanner: async (doctorId) => {
    const doctorName = getDoctor(doctorId)?.name || 'Doctor';
    set({
      leavePlanner: {
        isOpen: true,
        doctorId,
        backendDoctorId: null,
        doctorName,
        leaves: [],
        doctorIsOnLeave: false,
        loading: !useAppModeStore.getState().isDemoMode,
        saving: false,
        error: null,
        demo: false,
      },
    });

    // The pitch simulator has no backend; the form is read-only there.
    if (useAppModeStore.getState().isDemoMode) {
      set((state) => ({
        leavePlanner: { ...state.leavePlanner, loading: false, demo: true },
      }));
      return;
    }

    try {
      const backendDoctor = await resolveBackendDoctor(doctorName);
      const data = await apiService.fetchDoctorLeaves(backendDoctor.id);
      set((state) => ({
        leavePlanner: {
          ...state.leavePlanner,
          backendDoctorId: backendDoctor.id,
          leaves: data?.leaves || [],
          doctorIsOnLeave: Boolean(data?.doctor?.is_on_leave),
          loading: false,
          saving: false,
          error: null,
        },
      }));
    } catch (err) {
      set((state) => ({
        leavePlanner: {
          ...state.leavePlanner,
          loading: false,
          saving: false,
          error: err?.message || 'Could not load the leave periods.',
        },
      }));
    }
  },

  closeLeavePlanner: () =>
    set((state) => ({ leavePlanner: { ...state.leavePlanner, isOpen: false, error: null } })),

  addDoctorLeave: async ({ startDate, endDate, leaveType = 'annual', reason = '' }) => {
    const planner = get().leavePlanner;
    if (planner.demo) {
      set((state) => ({
        leavePlanner: {
          ...state.leavePlanner,
          error: 'Planned leave needs the live clinic backend.',
        },
      }));
      return { success: false };
    }
    if (!planner.backendDoctorId) {
      set((state) => ({
        leavePlanner: { ...state.leavePlanner, error: 'This doctor is not loaded yet.' },
      }));
      return { success: false };
    }

    set((state) => ({ leavePlanner: { ...state.leavePlanner, saving: true, error: null } }));
    try {
      await apiService.createDoctorLeave(planner.backendDoctorId, {
        start_date: startDate,
        end_date: endDate || null,
        leave_type: leaveType,
        reason,
      });
      await get().openLeavePlanner(planner.doctorId);
      await get().syncFromBackend();
      set({
        toast: { tone: 'success', text: `Leave planned for ${planner.doctorName}.` },
      });
      return { success: true };
    } catch (err) {
      // Django's sentence is the truth (overlapping leave, or patients already
      // booked in the window). Never soften it here.
      set((state) => ({
        leavePlanner: {
          ...state.leavePlanner,
          saving: false,
          error: err?.message || 'Could not save this leave.',
        },
      }));
      return { success: false, message: err?.message };
    }
  },

  removeDoctorLeave: async (leaveId) => {
    const planner = get().leavePlanner;
    if (planner.demo || !planner.backendDoctorId) {
      set((state) => ({
        leavePlanner: { ...state.leavePlanner, error: 'Removing leave needs the live clinic backend.' },
      }));
      return { success: false };
    }

    set((state) => ({ leavePlanner: { ...state.leavePlanner, saving: true, error: null } }));
    try {
      const res = await apiService.deleteDoctorLeave(planner.backendDoctorId, leaveId);
      await get().openLeavePlanner(planner.doctorId);
      await get().syncFromBackend();
      set({
        toast: {
          tone: 'success',
          text: res?.doctor?.is_on_leave
            ? `${planner.doctorName} still has leave covering today.`
            : `Leave removed for ${planner.doctorName}.`,
        },
      });
      return { success: true };
    } catch (err) {
      set((state) => ({
        leavePlanner: {
          ...state.leavePlanner,
          saving: false,
          error: err?.message || 'Could not remove this leave.',
        },
      }));
      return { success: false, message: err?.message };
    }
  },

  endTodayLeaveFromPlanner: async () => {
    const planner = get().leavePlanner;
    if (planner.demo || !planner.backendDoctorId) return { success: false };

    set((state) => ({ leavePlanner: { ...state.leavePlanner, saving: true, error: null } }));
    try {
      const res = await apiService.endDoctorLeave(planner.backendDoctorId);
      const stillOnLeave = Boolean(res?.doctor?.is_on_leave);
      await get().openLeavePlanner(planner.doctorId);
      await get().syncFromBackend();
      set({
        toast: {
          tone: stillOnLeave ? 'warning' : 'success',
          text: res?.message || `Leave updated for ${planner.doctorName}.`,
        },
      });
      return { success: true, stillOnLeave };
    } catch (err) {
      set((state) => ({
        leavePlanner: {
          ...state.leavePlanner,
          saving: false,
          error: err?.message || 'Could not end today\'s leave.',
        },
      }));
      return { success: false, message: err?.message };
    }
  },

  syncFromBackend: async () => {
    if (useAppModeStore.getState().isDemoMode) return;
    try {
      // Clinic dates, not UTC dates: at Lagos 00:30 the UTC calendar is
      // still on yesterday, which would shift the fetched range a day.
      const startIso = clinicParts(clinicNow()).dayKey;
      const endParts = clinicParts(clinicNow() + 14 * 86400000);
      const endIso = endParts.dayKey;
      const data = await apiService.fetchCalendarSchedule(startIso, '', endIso);
      const docSchedules = data?.doctors || [];

      // The lunch break the booking engine enforces, taken from the very
      // response the grid is already loading. The screen used to draw a
      // hardcoded 12:00-13:00 while the engine protected 13:00-14:00.
      const clinicLunch = data?.clinic
        ? {
            start: data.clinic.lunch_break_start,
            end: data.clinic.lunch_break_end,
          }
        : null;
      const clinicHours = data?.clinic
        ? {
            openTime: data.clinic.open_time,
            closeTime: data.clinic.close_time,
            workingDays: data.clinic.working_days || [],
          }
        : null;
      // T-786: the real emergency reserve rows travel in the same response.
      const reserveSlots = Array.isArray(data?.reserve_slots) ? data.reserve_slots : [];

      // Wave 3 / Step 3.2: an empty roster is an answer, not a reason to keep
      // the previous blocks on screen. A brand-new clinic shows an empty
      // calendar. (A FAILED fetch is different: the catch keeps the screen.)
      if (!Array.isArray(docSchedules) || docSchedules.length === 0) {
        set({ blocks: [], leavePeriods: {}, clinicLunch, clinicHours, reserveSlots });
        return;
      }

      const remoteBlocks = [];
      const leavePeriods = {};
      const mappedDoctors = [];

      docSchedules.forEach((docItem) => {
        // Wave 3 / Step 3.4: the backend's own doctor id IS the lane key.
        // The old name-substring heuristics (bello/okafor/babawo) mapped
        // every real doctor onto a mock lane - a fourth doctor matched
        // nothing and a raw UUID id matched no column at all.
        const docId = String(docItem.doctor_id);

        mappedDoctors.push({
          id: docId,
          name: docItem.doctor_name || 'Doctor',
          // The schedule payload names this key `specialty` (views_clinic.py);
          // `doctor_specialty` is the appointment-level name, kept as a fallback.
          // Reading the wrong key made every doctor "General Practice" and the
          // specialty filter a no-op.
          specialty: docItem.specialty || docItem.doctor_specialty || 'General Practice',
          workingDays: docItem.working_days || [],
          shiftStart: docItem.shift_start || null,
          shiftEnd: docItem.shift_end || null,
          isOnDuty: true,
          isEmergencyLeave: false,
          emergencyReason: null,
        });

        // Keep the RAW periods. A leave only greys out the days it covers, so
        // the calendar derives the flag for whatever day it is showing.
        leavePeriods[docId] = (docItem.leave_periods || []).map((period) => ({
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
            // Wave 3 / Step 3.4: the REAL identities. The old mapping gave
            // every block serviceId 'svc-dental', so the details modal and
            // the lanes showed a service the patient never booked.
            doctorId: docId,
            doctorName: docItem.doctor_name || null,
            serviceId: String(apt.service_id || ''),
            serviceName: apt.service_name || null,
            patientName: apt.patient_name || 'Patient',
            patientPhone: apt.patient_phone || '',
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

      // Wave 3 / Step 3.4: the lane columns come from the backend roster —
      // the mock DOCTORS list is only the pre-sync initial state (and is
      // removed entirely in Step 3.7-B).
      set({ leavePeriods, doctors: mappedDoctors, clinicLunch, clinicHours, reserveSlots });

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
              doctorName: rb.doctorName ?? b.doctorName ?? null,
              serviceId: rb.serviceId,
              serviceName: rb.serviceName ?? b.serviceName ?? null,
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
        {
          reason,
          kind: get().disruptionModal.leaveKind || 'emergency',
          ...leaveWindowPayload(dayStart, dayEnd),
          ...distribution,
        }
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

        // Leave lifecycle / Step 4 — Telegram is sent by Django itself, so the
        // banner reports it exactly: sent, failed, or not attempted.
        const telegramParts = [];
        if (report.telegram_sent_count) {
          telegramParts.push(`${report.telegram_sent_count} Telegram sent`);
        }
        if (report.telegram_failed_count) {
          telegramParts.push(`${report.telegram_failed_count} Telegram failed`);
        }
        const telegram = telegramParts.length
          ? ` Telegram: ${telegramParts.join(', ')}.`
          : '';

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
            }${delivery}${telegram}`,
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
              createdAt: clinicNow(),
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
      if (!Number.isFinite(when.getTime()) || when.getTime() < clinicNow()) return;
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
        colleagues: doctors
          .filter(
            (d) => d.id !== doctor.id && !d.isEmergencyLeave && d.isActive !== false
          )
          .map((d) => ({
            id: d.id,
            name: d.name,
            specialty: d.specialty || '',
            available: true,
            reason: null,
            text: null,
          })),
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

  // Gap 2 — move ONE stranded patient to a colleague who is free at that
  // time. The panel only offers what Django already said it would accept;
  // Django is still the gate (qualified, free, not on leave) and its sentence
  // is what the toast shows when it refuses.
  //
  // This is deliberately not a plan batch. A patient the plan could not place
  // is not on that batch's placement list, so moving them by hand never blocks
  // undoing the plan (undo restores the placed ones and removes the leave).
  // If the plan HAD placed them, a hand move makes the batch report
  // MOVES_CHANGED — the truth, because undo would overwrite that change.
  moveStrandedPatient: async (patient, doctorId, doctorName) => {
    if (!patient?.appointment_id || !doctorId) {
      return { success: false, message: 'Pick a colleague first.' };
    }
    const patientName = patient.patient_name || 'The patient';
    const target = doctorName || 'the colleague';
    const when = patient.time_label ? ` at ${patient.time_label}` : '';

    if (useAppModeStore.getState().isDemoMode) {
      set((state) => ({
        blocks: state.blocks.map((b) =>
          b.appointmentId === patient.appointment_id ||
          b.id === patient.appointment_id ||
          b.id === `${patient.appointment_id}-buffer`
            ? { ...b, doctorId }
            : b
        ),
        toast: {
          tone: 'success',
          text: `Demo: ${patientName} moved to ${target}${when}. Nothing was saved or sent.`,
        },
      }));
      get().loadStranded();
      soundService.playChime();
      return { success: true };
    }

    set({ movingStrandedId: patient.appointment_id });
    try {
      await apiService.reassignDoctorLeave(
        patient.appointment_id,
        doctorId,
        'Moved from the stranded list'
      );
      set({
        movingStrandedId: null,
        toast: {
          tone: 'success',
          text: `Moved ${patientName} to ${target}${when}.`,
        },
      });
      await get().syncFromBackend();
      await get().loadStranded();
      soundService.playChime();
      return { success: true };
    } catch (err) {
      const detail =
        err?.details?.detail ||
        err?.message ||
        `Could not move ${patientName} to ${target}.`;
      set({
        movingStrandedId: null,
        toast: { tone: 'amber', text: detail },
      });
      soundService.playAlert();
      // The colleague may have filled up since the list was drawn.
      get().loadStranded({ silent: true });
      return { success: false, message: detail };
    }
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
    if (!doc) {
      set({
        toast: {
          tone: 'error',
          text: 'No doctor on the roster yet — sync the calendar first.',
        },
      });
      return { success: false, message: 'No doctor on the roster.' };
    }
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
      holdExpiresAt: clinicNow() + 15 * MIN,
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
    // Wave 3 / Step 3.7-B: a reset is an honest CLEAR — syncFromBackend will
    // refill the schedule with the REAL roster and blocks.
    set({
      blocks: [],
      toast: {
        tone: 'info',
        text: 'Calendar cleared. The real schedule will re-appear on the next sync.',
      },
    });
  },

  dismissToast: () => set({ toast: null }),
    }),
    {
      name: 'cbs_calendar_storage',
      version: 2,
      // Wave 3 / Step 3.7-B: v1 persisted the seeded demo blocks. One-time
      // migration wipes them — the API is the only source now.
      migrate: (persisted) => ({
        ...persisted,
        blocks: [],
      }),
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
    // Wave 3 / Step 3.7-B: no mock fallback for a real (UUID) service id.
    const service = getService(visit.serviceId) || null;
    const duration = service?.durationMin || visit.serviceDurationMin || 30;
    const buffer = service?.bufferMin !== undefined ? service.bufferMin : 10;
    const startTs = visit.scheduledTime || visit.arrivedAt || clinicNow();
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


