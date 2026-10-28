import { useState, useEffect, useMemo, useCallback } from 'react';
import { useQueueStore } from '../stores/useQueueStore';
import { useStaffStore } from '../stores/useStaffStore';
import { useAppModeStore } from '../stores/appModeStore';
import {
  SERVICES,
  DOCTORS,
  INFO_PROMPTS,
  CLINIC_RULES,
  TIME_WINDOWS,
  lookupPatient,
  lookupPatientByPhone,
} from '../services/mockData';
import {
  validateSlot,
  getDoctor,
  getService,
  doctorsForService,
  slotEnd,
} from '../services/slotEngine';
import { normalizeE164, formatPhoneDisplay, matchesPhone } from '../services/phoneUtils';
import {
  getAgingLevel,
  AGING_LABELS,
  minutesSince,
  formatAge,
  formatTime,
  formatDayLabel,
  formatRange,
  toDatetimeLocal,
  fromDatetimeLocal,
} from '../services/timeUtils';

const TICK_MS = 30000;
const TOAST_MS = 4000;

const reliabilityTone = (pct) => (pct >= 90 ? 'success' : pct >= 70 ? 'amber' : 'danger');

/**
 * useTriageQueue — Headless hook feeding TriageQueuePane + ReviewModal.
 * Owns ticking clock, tab filtering, aging math, phone normalization, slot validation.
 */
export const useTriageQueue = () => {
  const store = useQueueStore();
  const setQueueCounts = useAppModeStore((s) => s.setQueueCounts);
  const [now, setNow] = useState(() => Date.now());
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  // Auto-dismiss toast (4s)
  useEffect(() => {
    if (!store.toast) return undefined;
    const id = setTimeout(store.dismissToast, TOAST_MS);
    return () => clearTimeout(id);
  }, [store.toast, store.dismissToast]);

  const { requests, appointments, activeTab } = store;

  const buckets = useMemo(() => {
    const awaiting = requests.filter((r) => r.status === 'awaiting_review');
    const byAge = (a, b) => a.createdAt - b.createdAt; // strict FIFO
    return {
      new: awaiting.filter((r) => !r.reRequested).sort(byAge),
      rerequested: awaiting.filter((r) => r.reRequested).sort(byAge),
      expired: requests.filter((r) => r.status === 'offer_expired').sort(byAge),
    };
  }, [requests]);

  const tabs = useMemo(
    () => [
      { id: 'new', label: 'New Requests', hint: 'FIFO', count: buckets.new.length, tone: 'amber' },
      { id: 'rerequested', label: 'Re-Requested', hint: 'Priority', count: buckets.rerequested.length, tone: 'ember' },
      { id: 'expired', label: 'Expired Offers', hint: null, count: buckets.expired.length, tone: 'neutral' },
      { id: 'today', label: "Today's Schedule", hint: null, count: appointments.length, tone: 'info' },
    ],
    [buckets, appointments]
  );

  // Keep the left-rail nav badges in sync with real queue counts
  useEffect(() => {
    setQueueCounts({
      newRequests: buckets.new.length,
      reRequested: buckets.rerequested.length,
      expiredOffers: buckets.expired.length,
      todaySchedule: appointments.length,
    });
  }, [buckets, appointments, setQueueCounts]);

  const toCard = useCallback(
    (r) => {
      const reference = r.status === 'offer_expired' ? r.expiredAt : r.createdAt;
      const age = minutesSince(reference, now);
      const level = r.status === 'offer_expired' ? 'waiting' : getAgingLevel(age);
      const service = getService(r.serviceId);
      const doctor = r.preferredDoctorId ? getDoctor(r.preferredDoctorId) : null;
      const phone = normalizeE164(r.phone, CLINIC_RULES.defaultCountryCode);
      return {
        id: r.id,
        code: r.code,
        patientName: r.patientName,
        phoneDisplay: formatPhoneDisplay(phone.value) || r.phone,
        patientType: r.patientType,
        serviceName: service ? service.name : 'Unknown service',
        doctorName: doctor ? doctor.name : 'Any available doctor',
        windowLabel: (TIME_WINDOWS[r.timeWindow] || {}).label || '',
        channel: r.channel,
        isEmergency: Boolean(r.isEmergency || r.is_emergency),
        gender: r.gender || '',
        dateOfBirth: r.dateOfBirth || r.date_of_birth || null,
        ageLabel: r.status === 'offer_expired' ? `Expired ${formatAge(age)}` : formatAge(age),
        agingLevel: level,
        agingLabel: r.status === 'offer_expired' ? 'Expired' : AGING_LABELS[level],
        reviewingBy: r.reviewingBy && r.reviewingBy !== 'Sarah' ? r.reviewingBy : null,
        reRequested: r.reRequested,
      };
    },
    [now]
  );

  const cards = useMemo(() => {
    if (activeTab === 'today') return [];
    const raw = (buckets[activeTab] || []).map(toCard);
    if (!searchQuery.trim()) return raw;
    const q = searchQuery.toLowerCase().trim();
    return raw.filter(
      (c) =>
        (c.patientName && c.patientName.toLowerCase().includes(q)) ||
        matchesPhone(c.phoneDisplay, searchQuery) ||
        (c.serviceName && c.serviceName.toLowerCase().includes(q)) ||
        (c.doctorName && c.doctorName.toLowerCase().includes(q))
    );
  }, [activeTab, buckets, toCard, searchQuery]);

  const todayRows = useMemo(() => {
    const raw = [...appointments]
      .sort((a, b) => a.start - b.start)
      .map((a) => {
        const service = getService(a.serviceId);
        const doctor = getDoctor(a.doctorId);
        return {
          id: a.id,
          patientName: a.patientName,
          phone: a.patientPhone || a.phone,
          serviceName: service ? service.name : '',
          doctorName: doctor ? doctor.name : '',
          timeLabel: formatTime(a.start),
          status: a.status,
        };
      });
    if (!searchQuery.trim()) return raw;
    const q = searchQuery.toLowerCase().trim();
    return raw.filter(
      (r) =>
        (r.patientName && r.patientName.toLowerCase().includes(q)) ||
        matchesPhone(r.phone, searchQuery) ||
        (r.serviceName && r.serviceName.toLowerCase().includes(q)) ||
        (r.doctorName && r.doctorName.toLowerCase().includes(q))
    );
  }, [appointments, searchQuery]);

  // Selected Today's Schedule Patient Modal
  const [selectedTodayAppointmentId, setSelectedTodayAppointmentId] = useState(null);

  const selectedTodayAppointment = useMemo(() => {
    if (!selectedTodayAppointmentId) return null;
    const found = appointments.find((a) => a.id === selectedTodayAppointmentId);
    if (!found) return null;
    const service = getService(found.serviceId);
    const doctor = getDoctor(found.doctorId);
    return {
      ...found,
      durationMin: service ? service.durationMin : 30,
      bufferMin: service ? service.bufferMin : 10,
      end: found.start + (service ? service.durationMin : 30) * 60000,
      patientPhone: found.phone || '+234 800 000 0000',
      doctorName: doctor ? doctor.name : 'Clinician',
      serviceName: service ? service.name : 'General Consultation',
    };
  }, [selectedTodayAppointmentId, appointments]);

  // ---------- Review modal view model ----------
  const selectedRequest = requests.find((r) => r.id === store.selectedId) || null;

  const review = useMemo(() => {
    if (!selectedRequest) return null;
    const r = selectedRequest;
    const phone = normalizeE164(r.phone, CLINIC_RULES.defaultCountryCode);
    const registry = lookupPatient(phone.value || r.phone, r.patientName);
    
    // Dynamic doctors from Staff Directory (fallback to DOCTORS)
    const staffMembers = (useStaffStore.getState && useStaffStore.getState().staffMembers) || [];
    const activeStaffDoctors = staffMembers
      .filter((s) => s.role === 'doctor' && s.isActive)
      .map((d) => ({ id: d.id, name: d.name, specialty: d.specialty }));
    const dynamicDoctors = activeStaffDoctors.length > 0 ? activeStaffDoctors : DOCTORS;

    // Custom or Standard Service
    const isCustomService = Boolean(r.customService || r.serviceId === 'custom');
    const service = isCustomService
      ? (r.customService || { id: 'custom', name: 'Custom Procedure', durationMin: 30, bufferMin: 10 })
      : getService(r.serviceId);

    const rawSlots = store.slotsByRequest[r.id];
    const hasChecked = Array.isArray(rawSlots);

    const slots = (rawSlots || []).map((s) => {
      const validation = validateSlot(s, store.busyBlocks);
      const doctor = getDoctor(s.doctorId) || dynamicDoctors.find((d) => d.id === s.doctorId);
      return {
        id: s.id,
        index: 0,
        doctorId: s.doctorId,
        doctorName: doctor ? doctor.name : 'Unassigned',
        dayLabel: formatDayLabel(s.start),
        rangeLabel: formatRange(s.start, slotEnd(s)),
        durationLabel: `${s.durationMin}m + ${s.bufferMin}m buffer`,
        startValue: toDatetimeLocal(s.start),
        custom: s.custom,
        ok: validation.ok,
        code: validation.code,
        message: validation.message,
        canSnap: Boolean(validation.nextSafeStart) && validation.code !== 'RESERVE',
        nextSafeStart: validation.nextSafeStart,
        nextSafeLabel: validation.nextSafeStart ? formatTime(validation.nextSafeStart) : null,
        doctorOptions: dynamicDoctors.map((d) => ({ id: d.id, name: d.name })),
      };
    });
    slots.forEach((s, i) => {
      s.index = i + 1;
    });

    const collisions = slots.filter((s) => !s.ok).length;
    const dossier = registry
      ? {
          name: registry.name,
          reliabilityPct: Math.round((registry.attended / registry.totalVisits) * 100),
          reliabilityTone: reliabilityTone(Math.round((registry.attended / registry.totalVisits) * 100)),
          attendedLabel: `${registry.attended}/${registry.totalVisits} attended`,
          lastVisits: registry.lastVisits,
        }
      : null;

    return {
      id: r.id,
      code: r.code,
      patientName: r.patientName,
      phoneInput: r.phone,
      phoneValid: phone.valid,
      phoneNormalized: phone.value,
      phoneDisplay: formatPhoneDisplay(phone.value),
      isReturning: Boolean(registry),
      gender: r.gender || '',
      dateOfBirth: r.dateOfBirth || r.date_of_birth || null,
      isEmergency: Boolean(r.isEmergency || r.is_emergency),
      dossier,
      serviceId: r.serviceId,
      isCustomService,
      customService: r.customService || null,
      serviceSummary: service ? `${service.durationMin}m + ${service.bufferMin}m buffer` : '',
      doctorId: r.preferredDoctorId || '',
      timeWindow: r.timeWindow,
      channel: r.channel,
      serviceOptions: SERVICES.map((s) => ({ id: s.id, name: s.name })),
      doctorOptions: [{ id: '', name: 'Any available doctor' }, ...dynamicDoctors.map((d) => ({ id: d.id, name: d.name }))],
      windowOptions: Object.entries(TIME_WINDOWS).map(([id, w]) => ({ id, name: w.label })),
      slots,
      hasChecked,
      collisions,
      gridIncrementMin: CLINIC_RULES.gridIncrementMin,
      infoPanelOpen: store.infoPanelOpen,
      infoPrompts: INFO_PROMPTS,
      offerExpiryMin: CLINIC_RULES.offerExpiryMin,
      canDispatch: phone.valid && slots.length > 0 && collisions === 0,
      blockReason: !phone.valid
        ? 'Fix the patient phone number (E.164) first'
        : slots.length === 0
          ? 'Check live slots and keep at least one option'
          : collisions > 0
            ? `${collisions} slot${collisions > 1 ? 's' : ''} blocked by the Double-Booking Shield`
            : '',
    };
  }, [selectedRequest, store.slotsByRequest, store.busyBlocks, store.infoPanelOpen]);

  // ---------- Handlers (stable, passed down as props) ----------
  const updateField = useCallback(
    (patch) => selectedRequest && store.updateRequestField(selectedRequest.id, patch),
    [selectedRequest, store]
  );

  const actions = {
    setActiveTab: store.setActiveTab,
    openRequest: store.openRequest,
    closeRequest: store.closeRequest,
    updateField,
    checkSlots: () => selectedRequest && store.checkSlots(selectedRequest.id),
    swapDoctor: (slotId, doctorId) =>
      selectedRequest && store.patchSlot(selectedRequest.id, slotId, { doctorId }),
    nudgeSlot: (slotId, deltaMin) =>
      selectedRequest && store.nudgeSlot(selectedRequest.id, slotId, deltaMin),
    setSlotTime: (slotId, value) => {
      const ts = fromDatetimeLocal(value);
      if (selectedRequest && !Number.isNaN(ts)) store.patchSlot(selectedRequest.id, slotId, { start: ts });
    },
    snapSlot: (slotId, nextSafeStart) =>
      selectedRequest && nextSafeStart && store.patchSlot(selectedRequest.id, slotId, { start: nextSafeStart }),
    removeSlot: (slotId) => selectedRequest && store.removeSlot(selectedRequest.id, slotId),
    addCustomSlot: (doctorId, datetimeValue) =>
      selectedRequest && store.addCustomSlot(selectedRequest.id, doctorId, fromDatetimeLocal(datetimeValue)),
    toggleInfoPanel: store.toggleInfoPanel,
    sendInfoRequest: (message) => selectedRequest && store.sendInfoRequest(selectedRequest.id, message),
    dispatchOffers: (selectedSlotIds = null) =>
      selectedRequest && review && review.canDispatch && store.dispatchOffers(selectedRequest.id, selectedSlotIds),
    confirmSingleSlot: (slotId) =>
      selectedRequest && store.confirmSingleSlot({ requestId: selectedRequest.id, slotId }),
    openTodayAppointment: (id) => setSelectedTodayAppointmentId(id),
    closeTodayAppointment: () => setSelectedTodayAppointmentId(null),
    setSearchQuery,
    dismissToast: store.dismissToast,
  };

  return {
    tabs,
    activeTab,
    searchQuery,
    cards,
    todayRows,
    selectedTodayAppointment,
    review,
    toast: store.toast,
    actions,
  };
};
