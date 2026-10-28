import { useState, useEffect, useMemo, useCallback } from 'react';
import { useCalendarStore } from '../stores/useCalendarStore';
import { useVisitsStore } from '../stores/useVisitsStore';
import {
  DOCTORS,
  SERVICES,
  CLINIC_RULES,
  startOfDayOffset,
  at,
} from '../services/mockData';
import { getService, getDoctor, doctorsForService } from '../services/slotEngine';
import { formatTime, formatDayLabel } from '../services/timeUtils';

const MIN = 60000;
const TICK_SECOND_MS = 1000;
const TOAST_TIMEOUT_MS = 4000;

// Schedule hours: 08:00 to 18:00 WAT (in 15-minute increments)
export const SCHEDULE_START_MIN = 8 * 60; // 08:00
export const SCHEDULE_END_MIN = 18 * 60; // 18:00
export const INCREMENT_MIN = 15;

export const useCalendar = () => {
  const store = useCalendarStore();
  const [now, setNow] = useState(() => Date.now());

  // Second-level ticker for real-time hold countdowns
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_SECOND_MS);
    return () => clearInterval(timer);
  }, []);

  // Auto-dismiss in-app toast
  useEffect(() => {
    if (!store.toast) return undefined;
    const t = setTimeout(store.dismissToast, TOAST_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [store.toast, store.dismissToast]);

  const {
    currentDateOffset,
    viewMode,
    selectedServiceId,
    doctors,
    blocks,
    liveSyncConnected,
    walkInModal,
    disruptionModal,
    toast,
  } = store;

  // Selected date info
  const dayStartTs = useMemo(() => startOfDayOffset(currentDateOffset), [currentDateOffset]);
  const dayLabel = useMemo(() => formatDayLabel(dayStartTs), [dayStartTs]);

  // Selected service object for gap dimming
  const selectedService = useMemo(
    () => (selectedServiceId === 'all' ? null : getService(selectedServiceId)),
    [selectedServiceId]
  );

  const neededDurationMin = useMemo(() => {
    if (!selectedService) return 0;
    return selectedService.durationMin + selectedService.bufferMin;
  }, [selectedService]);

  // Generate 15-minute time gutter intervals: 08:00, 08:15, 08:30 ... 17:45
  const timeGutter = useMemo(() => {
    const slots = [];
    for (let m = SCHEDULE_START_MIN; m < SCHEDULE_END_MIN; m += INCREMENT_MIN) {
      const h = Math.floor(m / 60);
      const mins = m % 60;
      const ts = dayStartTs + m * MIN;
      slots.push({
        minuteOfDay: m,
        timeLabel: formatTime(ts),
        hour: h,
        minute: mins,
        isHourStart: mins === 0,
      });
    }
    return slots;
  }, [dayStartTs]);

  // Get active blocks for the selected day
  const dayBlocks = useMemo(() => {
    const dayEndTs = dayStartTs + 24 * 60 * MIN;
    return blocks.filter((b) => b.start >= dayStartTs && b.start < dayEndTs);
  }, [blocks, dayStartTs]);

  // Format hold remaining time
  const formatHoldCountdown = useCallback(
    (expiresAt) => {
      if (!expiresAt) return null;
      const diffMs = expiresAt - now;
      if (diffMs <= 0) return 'Expired';
      const totalSec = Math.floor(diffMs / 1000);
      const m = Math.floor(totalSec / 60);
      const s = totalSec % 60;
      return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    },
    [now]
  );

  // Compute doctor schedule columns with duration-aware gap dimming
  const doctorColumns = useMemo(() => {
    return doctors.map((doc) => {
      // Filter blocks specifically for this doctor or clinic-wide (doctorId === null)
      const docBlocks = dayBlocks.filter(
        (b) => b.doctorId === null || b.doctorId === doc.id
      );

      // Map 15-minute intervals
      const intervals = timeGutter.map((slot) => {
        const slotStartTs = dayStartTs + slot.minuteOfDay * MIN;
        const slotEndTs = slotStartTs + INCREMENT_MIN * MIN;

        // Check if doctor is on shift
        const isWithinShift =
          slot.minuteOfDay >= doc.shiftStartMin && slot.minuteOfDay < doc.shiftEndMin;

        // Find active block starting or covering this slot
        const activeBlock = docBlocks.find(
          (b) => slotStartTs >= b.start && slotStartTs < b.end
        );

        return {
          slotStartTs,
          slotEndTs,
          minuteOfDay: slot.minuteOfDay,
          timeLabel: slot.timeLabel,
          isWithinShift,
          activeBlock: activeBlock || null,
          isFree: isWithinShift && !activeBlock,
        };
      });

      // Calculate contiguous free gaps for duration dimming
      let currentGap = [];
      const gaps = [];
      intervals.forEach((item, idx) => {
        if (item.isFree) {
          currentGap.push(idx);
        } else {
          if (currentGap.length > 0) gaps.push(currentGap);
          currentGap = [];
        }
      });
      if (currentGap.length > 0) gaps.push(currentGap);

      // Mark intervals as dimmed if free gap is shorter than neededDurationMin
      const processedIntervals = [...intervals];
      if (neededDurationMin > 0) {
        gaps.forEach((gap) => {
          const gapMinutes = gap.length * INCREMENT_MIN;
          if (gapMinutes < neededDurationMin) {
            gap.forEach((idx) => {
              processedIntervals[idx] = {
                ...processedIntervals[idx],
                isDimmed: true,
                dimReason: `Gap is ${gapMinutes}m — needs ${neededDurationMin}m for ${selectedService.name}`,
              };
            });
          }
        });
      }

      // Continuous non-fragmented events for this doctor (appointments, holds, breaks, reserves)
      const continuousEvents = docBlocks
        .filter((b) => b.type !== 'buffer')
        .map((b) => {
          const startMin = Math.round((b.start - dayStartTs) / MIN);
          const endMin = Math.round((b.end - dayStartTs) / MIN);
          const durationMin = b.durationMin || Math.max(15, endMin - startMin);
          const service = b.serviceId ? getService(b.serviceId) : null;
          const bufferMin = b.bufferMin !== undefined ? b.bufferMin : (service ? service.bufferMin : 10);
          return {
            ...b,
            startMin,
            endMin,
            durationMin,
            bufferMin,
            serviceName: service ? service.name : (b.label || 'Consultation'),
            startTimeLabel: formatTime(b.start),
            endTimeLabel: formatTime(b.end),
            bufferEndTimeLabel: formatTime(b.end + bufferMin * MIN),
          };
        });

      return {
        doctor: doc,
        blocks: docBlocks,
        events: continuousEvents,
        intervals: processedIntervals,
      };
    });
  }, [doctors, dayBlocks, timeGutter, dayStartTs, neededDurationMin, selectedService]);

  // Schedule KPIs for Top Banner
  const kpis = useMemo(() => {
    let confirmedCount = 0;
    let holdCount = 0;
    let reserveCount = 0;
    let totalFreeSlots = 0;

    doctorColumns.forEach((col) => {
      col.blocks.forEach((b) => {
        if (b.type === 'appointment' && b.status === 'confirmed') confirmedCount += 1;
        if (b.type === 'hold') holdCount += 1;
        if (b.type === 'reserve') reserveCount += 1;
      });
      col.intervals.forEach((i) => {
        if (i.isFree && !i.isDimmed) totalFreeSlots += 1;
      });
    });

    const totalWorkSlots = doctorColumns.length * (SCHEDULE_END_MIN - SCHEDULE_START_MIN) / INCREMENT_MIN;
    const capacityPct = Math.min(100, Math.round((totalFreeSlots / totalWorkSlots) * 100));

    return {
      confirmedCount,
      holdCount,
      reserveCount,
      totalFreeSlots,
      capacityPct,
    };
  }, [doctorColumns]);

  // Colleague options for emergency disruption (Risk R-15)
  const availableColleagues = useMemo(() => {
    if (!disruptionModal.doctorId) return [];
    return doctors.filter(
      (d) => d.id !== disruptionModal.doctorId && d.isOnDuty && !d.isEmergencyLeave
    );
  }, [doctors, disruptionModal.doctorId]);

  return {
    currentDateOffset,
    dayLabel,
    dayStartTs,
    viewMode,
    selectedServiceId,
    selectedService,
    neededDurationMin,
    services: SERVICES,
    doctors,
    timeGutter,
    doctorColumns,
    kpis,
    blocks: store.blocks,
    liveSyncConnected,
    walkInModal,
    disruptionModal,
    availableColleagues,
    toast,
    formatHoldCountdown,
    actions: {
      setViewMode: store.setViewMode,
      setSelectedServiceId: store.setSelectedServiceId,
      nextDay: store.nextDay,
      prevDay: store.prevDay,
      goToToday: store.goToToday,
      setDateOffset: store.setDateOffset,
      toggleLiveSync: store.toggleLiveSync,
      openWalkInModal: store.openWalkInModal,
      closeWalkInModal: store.closeWalkInModal,
      updateWalkInField: store.updateWalkInField,
      confirmWalkIn: store.confirmWalkIn,
      openDisruptionModal: store.openDisruptionModal,
      closeDisruptionModal: store.closeDisruptionModal,
      markDoctorEmergencyLeave: store.markDoctorEmergencyLeave,
      restoreDoctorDuty: store.restoreDoctorDuty,
      reassignToColleague: store.reassignToColleague,
      notifyAndReschedule: store.notifyAndReschedule,
      rescheduleAppointment: store.rescheduleAppointment,
      admitAppointment: (apt) => useVisitsStore.getState().admitAppointment(apt),
      simulateIncomingHold: store.simulateIncomingHold,
      releaseHold: store.releaseHold,
      dismissToast: store.dismissToast,
    },
  };
};
