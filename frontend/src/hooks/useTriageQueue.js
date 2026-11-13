import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
import { apiService } from '../services/apiService';
import { soundService } from '../services/soundService';
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
  const requests = useQueueStore((s) => s.requests);
  const appointments = useQueueStore((s) => s.appointments);
  const activeTab = useQueueStore((s) => s.activeTab);
  const selectedId = useQueueStore((s) => s.selectedId);
  const slotsByRequest = useQueueStore((s) => s.slotsByRequest);
  const busyBlocks = useQueueStore((s) => s.busyBlocks);
  const infoPanelOpen = useQueueStore((s) => s.infoPanelOpen);
  const toast = useQueueStore((s) => s.toast);
  const syncFromBackend = useQueueStore((s) => s.syncFromBackend);
  const dismissToast = useQueueStore((s) => s.dismissToast);

  const staffList = useStaffStore((s) => s.staffList);
  const isDemoMode = useAppModeStore((s) => s.isDemoMode);
  const setQueueCounts = useAppModeStore((s) => s.setQueueCounts);
  const [now, setNow] = useState(() => Date.now());
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (isDemoMode || !syncFromBackend) return undefined;
    // Initial fetch on mount
    syncFromBackend();
    // Safety polling guard every 10 seconds to auto-reflect new Telegram requests
    const pollId = setInterval(() => {
      syncFromBackend();
    }, 10000);
    return () => clearInterval(pollId);
  }, [isDemoMode, syncFromBackend]);

  // Auto-dismiss toast (4s)
  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(dismissToast, TOAST_MS);
    return () => clearTimeout(id);
  }, [toast, dismissToast]);

  const buckets = useMemo(() => {
    const awaiting = requests.filter((r) => r.status === 'awaiting_review');
    const byAge = (a, b) => a.createdAt - b.createdAt; // strict FIFO
    // Task 3.4: any request with a logged delivery failure (failed / no_answer /
    // expired interaction) needs a human — regardless of its queue status.
    const needsAttention = requests
      .filter((r) => (r.deliveryFailures || 0) > 0)
      .sort((a, b) => {
        const fa = a.lastFailure ? new Date(a.lastFailure.created_at).getTime() : a.createdAt;
        const fb = b.lastFailure ? new Date(b.lastFailure.created_at).getTime() : b.createdAt;
        return fb - fa; // most recent failure first
      });
    return {
      new: awaiting.filter((r) => !r.reRequested).sort(byAge),
      rerequested: awaiting.filter((r) => r.reRequested).sort(byAge),
      needs_attention: needsAttention,
      expired: requests.filter((r) => r.status === 'offer_expired').sort(byAge),
    };
  }, [requests]);

  const tabs = useMemo(
    () => [
      { id: 'new', label: 'New Requests', hint: 'FIFO', count: buckets.new.length, tone: 'amber' },
      { id: 'rerequested', label: 'Re-Requested', hint: 'Priority', count: buckets.rerequested.length, tone: 'ember' },
      { id: 'needs_attention', label: 'Needs Attention', hint: 'Delivery issues', count: buckets.needs_attention.length, tone: 'danger' },
      { id: 'expired', label: 'Expired Offers', hint: null, count: buckets.expired.length, tone: 'neutral' },
      { id: 'today', label: "Today's Schedule", hint: null, count: appointments.length, tone: 'info' },
    ],
    [buckets, appointments]
  );

  // Task 3.4: audible alert when a NEW delivery failure lands (count grows)
  // — reception shouldn't have to watch the tab to know something broke.
  const prevNeedsAttentionRef = useRef(null);
  useEffect(() => {
    const count = buckets.needs_attention.length;
    const prev = prevNeedsAttentionRef.current;
    prevNeedsAttentionRef.current = count;
    if (prev !== null && count > prev && useAppModeStore.getState().audioEnabled) {
      soundService.playChime();
    }
  }, [buckets.needs_attention.length]);

  // Keep the left-rail nav badges in sync with real queue counts
  useEffect(() => {
    setQueueCounts({
      newRequests: buckets.new.length,
      reRequested: buckets.rerequested.length,
      needsAttention: buckets.needs_attention.length,
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
        // Task 3.4: Needs Attention chips
        failureCount: r.deliveryFailures || 0,
        lastFailureLabel: r.lastFailure
          ? `${(r.lastFailure.channel || 'channel').replace('_', ' ')} ${(r.lastFailure.status || 'failed').replace('_', ' ')}`
          : null,
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
  const selectedRequest = requests.find((r) => r.id === selectedId) || null;

  // ---------- Task 3.2: patient communication history (dossier timeline) ----------
  const [interactionState, setInteractionState] = useState({ items: [], loading: false, error: null });
  const selectedRequestPhone = useMemo(() => {
    if (!selectedRequest) return null;
    const p = normalizeE164(selectedRequest.phone, CLINIC_RULES.defaultCountryCode);
    return p.value || selectedRequest.phone || null;
  }, [selectedRequest]);

  const fetchInteractions = useCallback(async (phone) => {
    if (!phone || useAppModeStore.getState().isDemoMode) return;
    setInteractionState((s) => ({ ...s, loading: true }));
    try {
      const items = await apiService.getInteractions(phone, 50);
      setInteractionState({ items: Array.isArray(items) ? items : [], loading: false, error: null });
    } catch (err) {
      console.warn('Interaction history fetch failed:', err);
      setInteractionState({ items: [], loading: false, error: 'History unavailable right now' });
    }
  }, []);

  useEffect(() => {
    setInteractionState({ items: [], loading: false, error: null });
    if (!selectedRequestPhone) return undefined;
    fetchInteractions(selectedRequestPhone);
    // Light live-refresh while the review modal is open — every n8n touchpoint
    // (message sent, call outcome, patient reply) is logged via /interactions/,
    // so this timeline stays current. (SSE `interaction_logged` consumer wiring lands later.)
    const interval = setInterval(() => fetchInteractions(selectedRequestPhone), 20000);
    return () => clearInterval(interval);
  }, [selectedRequestPhone, fetchInteractions]);

  const review = useMemo(() => {
    if (!selectedRequest) return null;
    const r = selectedRequest;
    const phone = normalizeE164(r.phone, CLINIC_RULES.defaultCountryCode);
    // Task 3.3: in LIVE mode the dossier comes from the REAL backend
    // (`patient_dossier` — computed attendance history from Appointments).
    // The demo PATIENT_REGISTRY is now a demo-mode fallback only, so live
    // dashboards never show seed data as if it were this patient's history.
    const isDemo = useAppModeStore.getState().isDemoMode;
    const backendDossier = (!isDemo && r.patientDossier?.is_returning) ? r.patientDossier : null;
    const registry = (!isDemo && !backendDossier)
      ? null
      : lookupPatient(phone.value || r.phone, r.patientName);
    
    // Dynamic doctors from Staff Directory (fallback to DOCTORS)
    const activeStaffDoctors = (staffList || [])
      .filter((s) => s.role === 'doctor' && s.isActive)
      .map((d) => ({ id: d.id, name: d.name, specialty: d.specialty }));
    const dynamicDoctors = activeStaffDoctors.length > 0 ? activeStaffDoctors : DOCTORS;

    // Custom or Standard Service
    const isCustomService = Boolean(r.customService || r.serviceId === 'custom');
    const service = isCustomService
      ? (r.customService || { id: 'custom', name: 'Custom Procedure', durationMin: 30, bufferMin: 10 })
      : getService(r.serviceId);

    const rawSlots = slotsByRequest[r.id];
    const hasChecked = Array.isArray(rawSlots);

    const slots = (rawSlots || []).map((s) => {
      const validation = validateSlot(s, busyBlocks);
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
    const dossier = backendDossier
      ? {
          name: r.patientName,
          reliabilityPct: Math.round(backendDossier.reliability_percentage || 0),
          reliabilityTone: reliabilityTone(Math.round(backendDossier.reliability_percentage || 0)),
          attendedLabel: `${backendDossier.completed_visits || 0}/${(backendDossier.completed_visits || 0) + (backendDossier.no_show_count || 0)} attended`,
          lastVisits: registry?.lastVisits || [],
        }
      : registry
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
      startDate: r.startDate || r.preferredDateRange?.start || r.preferred_date_range?.start || null,
      endDate: r.endDate || r.preferredDateRange?.end || r.preferred_date_range?.end || null,
      dateRangeDisplay: (r.startDate || r.preferredDateRange?.start || r.preferred_date_range?.start)
        ? `${r.startDate || r.preferredDateRange?.start || r.preferred_date_range?.start} → ${r.endDate || r.preferredDateRange?.end || r.preferred_date_range?.end}`
        : null,
      channel: r.channel,
      interactions: interactionState,
      serviceOptions: SERVICES.map((s) => ({ id: s.id, name: s.name })),
      doctorOptions: [{ id: '', name: '⚡ Auto-Balance by Clinic Load (Recommended)' }, ...dynamicDoctors.map((d) => ({ id: d.id, name: d.name }))],
      windowOptions: Object.entries(TIME_WINDOWS).map(([id, w]) => ({ id, name: w.label })),
      slots,
      hasChecked,
      collisions,
      gridIncrementMin: CLINIC_RULES.gridIncrementMin,
      infoPanelOpen,
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
  }, [selectedRequest, slotsByRequest, busyBlocks, infoPanelOpen, staffList, interactionState]);

  // ---------- Handlers (stable, passed down as props) ----------
  const updateField = useCallback(
    (patch) => selectedRequest && useQueueStore.getState().updateRequestField(selectedRequest.id, patch),
    [selectedRequest]
  );

  const actions = {
    setActiveTab: (tab) => useQueueStore.getState().setActiveTab(tab),
    openRequest: (id) => useQueueStore.getState().openRequest(id),
    closeRequest: () => useQueueStore.getState().closeRequest(),
    updateField,
    checkSlots: () => selectedRequest && useQueueStore.getState().checkSlots(selectedRequest.id),
    swapDoctor: (slotId, doctorId) =>
      selectedRequest && useQueueStore.getState().patchSlot(selectedRequest.id, slotId, { doctorId }),
    nudgeSlot: (slotId, deltaMin) =>
      selectedRequest && useQueueStore.getState().nudgeSlot(selectedRequest.id, slotId, deltaMin),
    setSlotTime: (slotId, value) => {
      const ts = fromDatetimeLocal(value);
      if (selectedRequest && !Number.isNaN(ts)) useQueueStore.getState().patchSlot(selectedRequest.id, slotId, { start: ts });
    },
    snapSlot: (slotId, nextSafeStart) =>
      selectedRequest && nextSafeStart && useQueueStore.getState().patchSlot(selectedRequest.id, slotId, { start: nextSafeStart }),
    removeSlot: (slotId) => selectedRequest && useQueueStore.getState().removeSlot(selectedRequest.id, slotId),
    addCustomSlot: (doctorId, datetimeValue) =>
      selectedRequest && useQueueStore.getState().addCustomSlot(selectedRequest.id, doctorId, fromDatetimeLocal(datetimeValue)),
    toggleInfoPanel: (open) => useQueueStore.getState().toggleInfoPanel(open),
    sendInfoRequest: (message) => selectedRequest && useQueueStore.getState().sendInfoRequest(selectedRequest.id, message),
    dispatchOffers: (selectedSlotIds = null, dispatchChannels = ['whatsapp', 'sms', 'voice']) =>
      selectedRequest && review && review.canDispatch &&
      useQueueStore.getState().dispatchOffers(selectedRequest.id, selectedSlotIds, dispatchChannels),
    refreshInteractions: () => fetchInteractions(selectedRequestPhone),
    confirmSingleSlot: (slotId) =>
      selectedRequest && useQueueStore.getState().confirmSingleSlot({ requestId: selectedRequest.id, slotId }),
    openTodayAppointment: (id) => setSelectedTodayAppointmentId(id),
    closeTodayAppointment: () => setSelectedTodayAppointmentId(null),
    setSearchQuery,
    dismissToast,
  };

  return {
    tabs,
    activeTab,
    searchQuery,
    cards,
    todayRows,
    selectedTodayAppointment,
    review,
    toast,
    actions,
  };
};
