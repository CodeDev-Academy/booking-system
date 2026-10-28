import { useState, useEffect, useMemo, useCallback } from 'react';
import { useVisitsStore } from '../stores/useVisitsStore';
import { DOCTORS, SERVICES, formatNaira } from '../services/mockData';
import { getDoctor, getService, getAllDoctors } from '../services/slotEngine';
import { formatTime } from '../services/timeUtils';
import { matchesPhone } from '../services/phoneUtils';

// Throttle global board ticker to 10s to eliminate CPU/memory re-render churn
const TICK_MS = 10000;
const TOAST_TIMEOUT_MS = 4000;

export const useLiveVisits = () => {
  const store = useVisitsStore();
  const [now, setNow] = useState(() => Date.now());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPatientVisit, setSelectedPatientVisit] = useState(null);

  // Second-by-second ticker for active duration timers
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
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
  const allDoctors = useMemo(() => getAllDoctors(), [visits]);

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
      const doctor = getDoctor(v.doctorId);
      const service = getService(v.serviceId);
      const servicePrice = formatNaira(service?.priceNgn || 15000);

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
      doctor: getDoctor(e.doctorId),
      service: getService(e.serviceId),
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
