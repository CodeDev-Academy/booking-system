import { useState, useEffect, useMemo, useCallback } from 'react';
import { useVisitsStore } from '../stores/useVisitsStore';
import { DOCTORS, SERVICES, formatNaira } from '../services/mockData';
import { getDoctor, getService } from '../services/slotEngine';
import { formatTime } from '../services/timeUtils';
import { matchesPhone } from '../services/phoneUtils';
import { clinicNow } from '../services/clinicTimeService';

// Throttle global board ticker to 10s to eliminate CPU/memory re-render churn
const TICK_MS = 10000;
const TOAST_TIMEOUT_MS = 4000;
// Wave 3 / Step 3.3: the board refreshes from the API on mount and once a
// minute, mirroring the queue's pattern.
const SYNC_INTERVAL_MS = 60 * 1000;

export const useLiveVisits = () => {
  const store = useVisitsStore();
  const [now, setNow] = useState(() => clinicNow());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPatientVisit, setSelectedPatientVisit] = useState(null);

  // Wave 3 / Step 3.3: real data on mount, then kept fresh.
  useEffect(() => {
    const run = () => { store.syncFromBackend(); };
    run();
    const t = setInterval(run, SYNC_INTERVAL_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Second-by-second ticker for active duration timers — on the CLINIC clock
  // (server-synced), so a slow laptop clock cannot skew urgency timers.
  useEffect(() => {
    const timer = setInterval(() => setNow(clinicNow()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  // Auto-dismiss toast
  useEffect(() => {
    if (!store.toast) return undefined;
    const t = setTimeout(store.dismissToast, TOAST_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [store.toast, store.dismissToast]);

  const { visits, selectedDoctorFilter, followUpModal, welfareModal, toast } = store;

  // Format elapsed seconds as MM:SS
  const formatTimer = useCallback((elapsedSec) => {
    const m = Math.floor(elapsedSec / 60);
    const s = elapsedSec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }, []);

  // Calculate waiting urgency:
  // 0–20 mins: normal (green)
  // 20–35 mins: amber alert
  // > 35 mins: danger alert (pulsing rose)
  const getWaitingUrgency = useCallback((elapsedMinutes) => {
    if (elapsedMinutes < 20) return 'normal';
    if (elapsedMinutes < 35) return 'amber';
    return 'danger';
  }, []);

  // Filter visits by selected doctor AND search query
  const filteredVisits = useMemo(() => {
    let result = visits;
    if (selectedDoctorFilter !== 'all') {
      result = result.filter((v) => v.doctorId === selectedDoctorFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (v) =>
          (v.patientName && v.patientName.toLowerCase().includes(q)) ||
          matchesPhone(v.patientPhone, searchQuery)
      );
    }
    return result;
  }, [visits, selectedDoctorFilter, searchQuery]);

  // Real-time visit counts per doctor filter
  // Wave 3 / Step 3.7-B: the tabs come from the REAL rows on the board —
  // the API's doctors — not the mock registry.
  const allDoctors = useMemo(() => {
    const byId = new Map();
    [...visits, ...(store.expectedToday || [])].forEach((v) => {
      if (!v.doctorId || byId.has(v.doctorId)) return;
      byId.set(v.doctorId, {
        id: v.doctorId,
        name: v.doctorName || getDoctor(v.doctorId)?.name || 'Doctor',
      });
    });
    return Array.from(byId.values());
  }, [visits, store.expectedToday]);

  const doctorCounts = useMemo(() => {
    const counts = { all: visits.length };
    allDoctors.forEach((d) => {
      counts[d.id] = visits.filter((v) => v.doctorId === d.id).length;
    });
    return counts;
  }, [visits, allDoctors]);

  // Process visits with real-time timers and progress bars
  const processedVisits = useMemo(() => {
    return filteredVisits.map((v) => {
      // Wave 3 / Step 3.3: the row carries the backend's own doctor/service
      // identity — the mock roster is only a fallback for demo rows.
      const doctor = v.doctorName
        ? { ...getDoctor(v.doctorId), name: v.doctorName }
        : getDoctor(v.doctorId);
      const service = v.serviceName
        ? { ...(getService(v.serviceId) || {}), name: v.serviceName, durationMin: v.serviceDurationMin || getService(v.serviceId)?.durationMin || 30, priceNgn: v.servicePrice ?? getService(v.serviceId)?.priceNgn }
        : getService(v.serviceId);
      const servicePrice = formatNaira(v.servicePrice ?? service?.priceNgn ?? 15000);

      // Lobby waiting time
      let waitElapsedSec = 0;
      let waitMinutes = 0;
      let waitUrgency = 'normal';
      let waitTimerStr = '00:00';

      if (v.status === 'waiting' && v.arrivedAt) {
        waitElapsedSec = Math.max(0, Math.floor((now - v.arrivedAt) / 1000));
        waitMinutes = Math.floor(waitElapsedSec / 60);
        waitUrgency = getWaitingUrgency(waitMinutes);
        waitTimerStr = formatTimer(waitElapsedSec);
      }

      // Active Consultation Progress
      let consultElapsedSec = 0;
      let consultMinutes = 0;
      let consultTimerStr = '00:00';
      let consultProgressPct = 0;
      let isOvertime = false;

      if (v.status === 'in_consultation' && v.consultationStartedAt) {
        consultElapsedSec = Math.max(0, Math.floor((now - v.consultationStartedAt) / 1000));
        consultMinutes = Math.floor(consultElapsedSec / 60);
        consultTimerStr = formatTimer(consultElapsedSec);
        const expectedSec = (service?.durationMin || 30) * 60;
        consultProgressPct = Math.min(100, Math.round((consultElapsedSec / expectedSec) * 100));
        isOvertime = consultElapsedSec > expectedSec;
      }

      return {
        ...v,
        doctor,
        service,
        servicePrice,
        waitElapsedSec,
        waitMinutes,
        waitUrgency,
        waitTimerStr,
        consultElapsedSec,
        consultMinutes,
        consultTimerStr,
        consultProgressPct,
        isOvertime,
        scheduledTimeStr: formatTime(v.scheduledTime),
        arrivedTimeStr: v.arrivedAt ? formatTime(v.arrivedAt) : null,
        completedTimeStr: v.completedAt ? formatTime(v.completedAt) : null,
      };
    });
  }, [filteredVisits, now, formatTimer, getWaitingUrgency]);

  // Swimlane buckets
  const waitingList = useMemo(
    () => processedVisits.filter((v) => v.status === 'waiting'),
    [processedVisits]
  );

  const inConsultationList = useMemo(
    () => processedVisits.filter((v) => v.status === 'in_consultation'),
    [processedVisits]
  );

  const completedList = useMemo(
    () => processedVisits.filter((v) => v.status === 'completed'),
    [processedVisits]
  );

  const noShowList = useMemo(
    () => processedVisits.filter((v) => v.status === 'no_show'),
    [processedVisits]
  );

  // Overall KPIs
  const kpis = useMemo(() => {
    const totalWaiting = waitingList.length;
    const totalConsult = inConsultationList.length;
    const totalCompleted = completedList.length;
    const totalNoShow = noShowList.length;

    // Average wait time in minutes
    let avgWait = 0;
    if (totalWaiting > 0) {
      const sumWait = waitingList.reduce((acc, v) => acc + v.waitMinutes, 0);
      avgWait = Math.round(sumWait / totalWaiting);
    }

    return {
      waitingCount: totalWaiting,
      avgWaitMinutes: avgWait,
      inConsultationCount: totalConsult,
      completedCount: totalCompleted,
      noShowCount: totalNoShow,
    };
  }, [waitingList, inConsultationList, completedList, noShowList]);

  // Get active visit for follow-up modal
  const activeFollowUpVisit = useMemo(
    () => (followUpModal.visitId ? visits.find((v) => v.id === followUpModal.visitId) : null),
    [visits, followUpModal.visitId]
  );

  // Get active visit for welfare modal
  const activeWelfareVisit = useMemo(
    () => (welfareModal.visitId ? visits.find((v) => v.id === welfareModal.visitId) : null),
    [visits, welfareModal.visitId]
  );

  // Process expected pre-booked appointments today
  const expectedTodayProcessed = useMemo(() => {
    let list = store.expectedToday || [];
    if (selectedDoctorFilter !== 'all') {
      list = list.filter((e) => e.doctorId === selectedDoctorFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (e) =>
          (e.patientName && e.patientName.toLowerCase().includes(q)) ||
          matchesPhone(e.patientPhone, searchQuery)
      );
    }
    return list.map((e) => ({
      ...e,
      // Wave 3 / Step 3.3: prefer the row's own backend identity; the mock
      // roster is a fallback only (real doctor ids are UUIDs).
      doctor: e.doctorName
        ? { ...(getDoctor(e.doctorId) || {}), name: e.doctorName }
        : getDoctor(e.doctorId),
      service: e.serviceName
        ? { ...(getService(e.serviceId) || {}), name: e.serviceName, priceNgn: e.servicePrice ?? getService(e.serviceId)?.priceNgn }
        : getService(e.serviceId),
    }));
  }, [store.expectedToday, selectedDoctorFilter, searchQuery]);

  return {
    doctors: allDoctors,
    selectedDoctorFilter,
    doctorCounts,
    searchQuery,
    selectedPatientVisit,
    expectedToday: expectedTodayProcessed,
    waitingList,
    inConsultationList,
    completedList,
    noShowList,
    kpis,
    followUpModal,
    activeFollowUpVisit,
    welfareModal,
    activeWelfareVisit,
    toast,
    actions: {
      setDoctorFilter: store.setDoctorFilter,
      setSearchQuery,
      openPatientDetails: (visit) => setSelectedPatientVisit(visit),
      closePatientDetails: () => setSelectedPatientVisit(null),
      markPatientPresent: store.markPatientPresent,
      reinstateVisit: store.reinstateVisit,
      checkInVisit: store.checkInVisit,
      sendToConsultation: store.sendToConsultation,
      openFollowUpModal: store.openFollowUpModal,
      closeFollowUpModal: store.closeFollowUpModal,
      completeVisit: store.completeVisit,
      markAsNoShow: store.markAsNoShow,
      openWelfareModal: store.openWelfareModal,
      closeWelfareModal: store.closeWelfareModal,
      sendWelfareMessage: store.sendWelfareMessage,
      simulatePatientArrival: store.simulatePatientArrival,
      dismissToast: store.dismissToast,
    },
  };
};
