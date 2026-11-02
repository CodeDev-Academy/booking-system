import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQueueStore } from '../stores/useQueueStore';
import { useCalendarStore } from '../stores/useCalendarStore';
import { useStaffStore } from '../stores/useStaffStore';
import { soundService } from '../services/soundService';
import { apiService } from '../services/apiService';
import {
  SERVICES,
  DOCTORS,
  BASE_OFFSET,
  DEFAULT_RANGE_DAYS,
  CLINIC_RULES,
} from '../services/mockData';
import { generateCandidateSlots, getService, getDoctor } from '../services/slotEngine';
import { formatDayLabel, formatTime } from '../services/timeUtils';

const MIN = 60000;

export const formatDateIso = (d) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getTodayIso = () => formatDateIso(new Date());
export const getFutureIso = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return formatDateIso(d);
};

export const PRESETS = {
  amina: {
    patientName: 'Amina Yusuf',
    phone: '+234 801 234 5678',
    patientType: 'returning',
    serviceId: 'svc-dental',
    preferredDoctorId: null,
    timeWindow: 'morning',
    startDate: getTodayIso(),
    endDate: getFutureIso(14),
    gender: 'Female',
    dateOfBirth: '1992-05-14',
    isEmergency: false,
    symptoms: 'Routine dental scaling and mild cold sensitivity on upper left molar',
  },
  tunde: {
    patientName: 'Tunde Musa',
    phone: '+234 802 987 6543',
    patientType: 'new',
    serviceId: 'svc-checkup',
    preferredDoctorId: null,
    timeWindow: 'afternoon',
    startDate: getTodayIso(),
    endDate: getFutureIso(14),
    gender: 'Male',
    dateOfBirth: '1985-11-20',
    isEmergency: false,
    symptoms: 'Annual executive comprehensive physical and blood pressure check',
  },
};

const INITIAL_WEB_FORM = {
  patientName: '',
  phone: '',
  patientType: 'new',
  serviceId: 'svc-dental',
  preferredDoctorId: null,
  timeWindow: 'morning',
  startDate: getTodayIso(),
  endDate: getFutureIso(14),
  gender: 'Female',
  dateOfBirth: '',
  isEmergency: false,
  symptoms: '',
};

const INITIAL_TELEGRAM_MESSAGES = [
  {
    id: 'tg-1',
    sender: 'bot',
    text: '👋 Welcome to Cedarcare Specialist Clinic! How can we assist you today? Please choose a consultation service:',
    time: '10:00 AM',
    options: [
      { label: '🦷 Dental Consultation', key: 'service', value: 'svc-dental' },
      { label: '🩺 General Health Check-up', key: 'service', value: 'svc-checkup' },
      { label: '🦷 Tooth Extraction', key: 'service', value: 'svc-extract' },
    ],
  },
];

export const usePitchSimulator = () => {
  const [channel, setChannel] = useState('web'); // 'web' | 'telegram'
  const [simulatorStage, setSimulatorStage] = useState('intake'); // 'intake' | 'waiting_review' | 'slots_offered' | 'confirmed' | 'expired'
  const [webForm, setWebForm] = useState({ ...INITIAL_WEB_FORM });
  const [telegramMessages, setTelegramMessages] = useState([...INITIAL_TELEGRAM_MESSAGES]);
  const [telegramStep, setTelegramStep] = useState(1); // 1: service, 2: timeWindow, 3: contact, 4: sent
  const [telegramDraft, setTelegramDraft] = useState({
    serviceId: 'svc-dental',
    dateRangeDays: 14,
    startDate: getTodayIso(),
    endDate: getFutureIso(14),
    timeWindow: 'morning',
    gender: 'Female',
    isEmergency: false,
    patientName: 'Amina Yusuf',
    phone: '+234 801 234 5678',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeRequest, setActiveRequest] = useState(null);
  const [offeredSlots, setOfferedSlots] = useState([]);
  const [offerExpiresAt, setOfferExpiresAt] = useState(null);
  const [remainingOfferSeconds, setRemainingOfferSeconds] = useState(3600);
  const [confirmedAppointment, setConfirmedAppointment] = useState(null);
  const [syncLatencyMs, setSyncLatencyMs] = useState(null);
  const [toast, setToast] = useState(null);

  const injectRequest = useQueueStore((s) => s.injectRequest);
  const dispatchOffers = useQueueStore((s) => s.dispatchOffers);
  const finalizeBooking = useQueueStore((s) => s.finalizeBooking);
  const expireOffer = useQueueStore((s) => s.expireOffer);
  const reRequestSlots = useQueueStore((s) => s.reRequestSlots);
  const confirmPatientBooking = useCalendarStore((s) => s.confirmPatientBooking);

  const staffList = useStaffStore((s) => s.staffList);
  const dynamicDoctors = useMemo(() => {
    const activeDocs = (staffList || [])
      .filter((s) => s.role === 'doctor' && s.isActive)
      .map((d) => ({ id: d.id, name: d.name, specialty: d.specialty }));
    return activeDocs.length > 0 ? activeDocs : DOCTORS;
  }, [staffList]);

  // Sync with QueueStore changes (e.g. if receptionist approved in /queue)
  useEffect(() => {
    if (!activeRequest) return;
    const unsub = useQueueStore.subscribe((state) => {
      const match = state.requests.find((r) => r.id === activeRequest.id);
      if (!match) return;

      if (match.status === 'slots_offered' && simulatorStage === 'waiting_review') {
        const storedSlots = state.slotsByRequest[activeRequest.id] || [];
        setOfferedSlots(storedSlots);
        setOfferExpiresAt(match.offerExpiresAt || Date.now() + 60 * MIN);
        setSimulatorStage('slots_offered');
        soundService.playChime();

        if (channel === 'telegram') {
          const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const options = storedSlots.map((slot, idx) => {
            const doc = getDoctor(slot.doctorId);
            const label = `${idx + 1}️⃣ ${formatDayLabel(slot.start)} @ ${formatTime(slot.start)} (${doc?.name?.split(' ')[0] || 'Doctor'})`;
            return { label, key: 'select_slot', value: slot.id, slotData: slot };
          });

          setTelegramMessages((prev) => [
            ...prev,
            {
              id: `tg-offered-${Date.now()}`,
              sender: 'bot',
              text: `✨ Good news, ${match.patientName.split(' ')[0]}!\n\nFront desk receptionist Chioma reviewed your request and approved 3 available times.\n\nPlease tap your preferred slot below (offers held for 1 hour):`,
              time: nowTime,
              options,
            },
          ]);
        }
      } else if (match.status === 'offer_expired' && simulatorStage === 'slots_offered') {
        setSimulatorStage('expired');
      }
    });

    return () => unsub();
  }, [activeRequest, simulatorStage, channel]);

  // 1-second countdown ticker for active offer expiry window
  useEffect(() => {
    if (simulatorStage !== 'slots_offered' || !offerExpiresAt) return undefined;
    const interval = setInterval(() => {
      const diffSec = Math.max(0, Math.floor((offerExpiresAt - Date.now()) / 1000));
      setRemainingOfferSeconds(diffSec);
      if (diffSec === 0) {
        setSimulatorStage('expired');
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [simulatorStage, offerExpiresAt]);

  const updateWebForm = useCallback((field, value) => {
    setWebForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const applyPreset = useCallback((presetKey) => {
    if (PRESETS[presetKey]) {
      setWebForm({ ...PRESETS[presetKey] });
      setToast({
        tone: 'info',
        text: `Loaded preset: ${PRESETS[presetKey].patientName} (${PRESETS[presetKey].patientType === 'returning' ? 'Returning Patient' : 'New Patient'})`,
      });
    }
  }, []);

  const applyDateRangePreset = useCallback((days) => {
    const start = getTodayIso();
    const end = getFutureIso(days);
    setWebForm((prev) => ({
      ...prev,
      startDate: start,
      endDate: end,
    }));
    setToast({
      tone: 'info',
      text: `Date range adjusted: ${start} to ${end} (${days} days)`,
    });
  }, []);

  // Submit via Web Intake Form
  const submitWebBooking = useCallback(async () => {
    if (!webForm.patientName || !webForm.phone) {
      setToast({ tone: 'error', text: 'Please provide patient name and phone number.' });
      return;
    }

    setIsSubmitting(true);
    const startTimestamp = performance.now();
    const uniqueId = `req-sim-${Date.now().toString(36)}`;
    const randomCode = `REQ-2026-${Math.floor(1000 + Math.random() * 9000)}`;

    const startDate = webForm.startDate || getTodayIso();
    const endDate = webForm.endDate || getFutureIso(14);
    const preferredDateRange = { start: startDate, end: endDate };

    const newRequest = {
      id: uniqueId,
      code: randomCode,
      patientName: webForm.patientName.trim(),
      phone: webForm.phone.trim(),
      patientType: webForm.patientType || 'new',
      serviceId: webForm.serviceId,
      preferredDoctorId: webForm.preferredDoctorId || null,
      timeWindow: webForm.timeWindow,
      startDate,
      endDate,
      preferredDateRange,
      dateRange: { fromOffset: BASE_OFFSET, toOffset: BASE_OFFSET + DEFAULT_RANGE_DAYS - 1 },
      channel: 'web',
      status: 'awaiting_review',
      reRequested: false,
      reviewingBy: null,
      createdAt: Date.now(),
      gender: webForm.gender || 'Female',
      dateOfBirth: webForm.dateOfBirth || null,
      isEmergency: Boolean(webForm.isEmergency),
      symptoms: webForm.symptoms || '',
    };

    // Live backend persistence
    try {
      const res = await apiService.createBookingRequest({
        patient_name: newRequest.patientName,
        patient_phone: newRequest.phone,
        service_id: newRequest.serviceId,
        preferred_doctor_id: newRequest.preferredDoctorId,
        preferred_time_window: newRequest.timeWindow,
        preferred_date_range: preferredDateRange,
        preferred_dates: [startDate, endDate],
        channel: 'web',
        patient_notes: newRequest.symptoms,
        gender: newRequest.gender,
        date_of_birth: newRequest.dateOfBirth,
        is_emergency: newRequest.isEmergency,
      });

      if (res && (res.id || res.request_id || res.request_code)) {
        newRequest.id = res.id || uniqueId;
        newRequest.code = res.request_code || res.request_id || randomCode;
        newRequest.backendUuid = res.id;
      }
    } catch (err) {
      console.warn('Backend createBookingRequest fallback to local state:', err);
    }

    injectRequest(newRequest);
    soundService.playChime();

    const elapsed = Math.round(performance.now() - startTimestamp);
    setSyncLatencyMs(elapsed > 0 ? elapsed : 110);
    setActiveRequest(newRequest);
    setSimulatorStage('waiting_review');
    setIsSubmitting(false);

    setToast({
      tone: 'success',
      text: `⚡ Web Intake for ${newRequest.patientName} synced to Front Desk Triage in ${elapsed}ms!`,
    });
  }, [webForm, injectRequest]);

  // Reset simulator
  const resetSimulator = useCallback(() => {
    setWebForm({ ...INITIAL_WEB_FORM });
    setTelegramMessages([...INITIAL_TELEGRAM_MESSAGES]);
    setTelegramStep(1);
    setActiveRequest(null);
    setOfferedSlots([]);
    setOfferExpiresAt(null);
    setRemainingOfferSeconds(3600);
    setConfirmedAppointment(null);
    setSimulatorStage('intake');
    setSyncLatencyMs(null);
    setToast({ tone: 'neutral', text: 'Pitch simulator reset to initial demo state.' });
  }, []);

  // Patient selects one candidate slot
  const selectCandidateSlot = useCallback(
    (slot) => {
      if (!activeRequest || !slot) return;

      const apptId = `AP-${Math.floor(1000 + Math.random() * 9000)}`;
      const doc = getDoctor(slot.doctorId);
      const svc = getService(activeRequest.serviceId);

      // Confirm in calendar store
      confirmPatientBooking({
        appointmentId: apptId,
        patientName: activeRequest.patientName,
        patientPhone: activeRequest.phone,
        patientType: activeRequest.patientType,
        doctorId: slot.doctorId,
        serviceId: activeRequest.serviceId,
        startTs: slot.start,
        channel: activeRequest.channel,
        notes: activeRequest.symptoms || 'Booked via Online Simulator',
      });

      // Finalize in queue store
      finalizeBooking({
        requestId: activeRequest.id,
        slot,
        appointmentId: apptId,
      });

      const confirmedData = {
        appointmentId: apptId,
        patientName: activeRequest.patientName,
        doctorName: doc?.name || 'Dr. Specialist',
        specialty: doc?.specialty || 'General Dental Practitioner',
        serviceName: svc?.name || 'Clinical Consultation',
        startTs: slot.start,
        dateLabel: formatDayLabel(slot.start),
        timeLabel: formatTime(slot.start),
        roomName: doc?.id === 'doc-bello' ? 'Dental Suite 1' : 'Suite B (Consultation)',
        clinicAddress: 'Cedarcare Specialist Clinic, Suite 4, Victoria Island, Lagos',
      };

      setConfirmedAppointment(confirmedData);
      setSimulatorStage('confirmed');
      soundService.playChime();

      if (channel === 'telegram') {
        const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const botSuccess = {
          id: `tg-conf-${Date.now()}`,
          sender: 'bot',
          text: `🎉 Booking Confirmed!\n\nReference: #${apptId}\n📅 Date: ${confirmedData.dateLabel} at ${confirmedData.timeLabel}\n👨‍⚕️ Specialist: ${confirmedData.doctorName} (${confirmedData.specialty})\n📍 Location: ${confirmedData.roomName}, Cedarcare VI\n\nA reminder will be sent 24 hours prior to your visit. Thank you for choosing Cedarcare!`,
          time: nowTime,
          options: [{ label: '🔄 Test Another Booking', key: 'restart', value: 'restart' }],
        };
        setTelegramMessages((prev) => [...prev, botSuccess]);
      }

      setToast({
        tone: 'success',
        text: `🎉 Confirmed! Appointment ${apptId} placed on Clinic Master Calendar.`,
      });
    },
    [activeRequest, confirmPatientBooking, finalizeBooking, channel]
  );

  // Patient re-requests fresh times (Phase C Step 4: Re-Requested Slots Priority Queue)
  const reRequestFreshTimes = useCallback(() => {
    if (!activeRequest) return;

    reRequestSlots(activeRequest.id);
    setSimulatorStage('waiting_review');
    soundService.playChime();

    if (channel === 'telegram') {
      const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const botWaitMsg = {
        id: `tg-wait-${Date.now()}`,
        sender: 'bot',
        text: `⚡ Front desk is reviewing fresh times for you right now. You will receive updated options shortly!`,
        time: nowTime,
        options: [],
      };
      setTelegramMessages((prev) => [...prev, botWaitMsg]);
    }

    setToast({
      tone: 'ember',
      text: `Patient ${activeRequest.patientName} re-requested fresh times! Prioritized in Triage Queue.`,
    });
  }, [activeRequest, reRequestSlots, channel]);

  // Simulate 60-Minute Expiry (Phase C: Graceful Expiry Demo)
  const simulateOfferExpiry = useCallback(() => {
    if (!activeRequest) return;

    expireOffer(activeRequest.id);
    setSimulatorStage('expired');
    soundService.playAlert();

    if (channel === 'telegram') {
      const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const botExpiryMsg = {
        id: `tg-exp-${Date.now()}`,
        sender: 'bot',
        text: `⏳ Hello ${activeRequest.patientName.split(' ')[0]}, the previously offered slots have expired to keep our schedule open for all patients.\n\nWe'd still love to see you! Tap below to request fresh available times from reception.`,
        time: nowTime,
        options: [
          { label: '🔄 Request Fresh Times', key: 'rerequest_fresh', value: 'rerequest_fresh' },
          { label: '💬 Chat with Reception', key: 'restart', value: 'restart' },
        ],
      };
      setTelegramMessages((prev) => [...prev, botExpiryMsg]);
    }

    setToast({
      tone: 'amber',
      text: '60-minute offer window expired. Patient received supportive re-engagement card.',
    });
  }, [activeRequest, expireOffer, channel]);

  // 1-Click Receptionist Action from LiveSyncMonitor: Review & Dispatch 3 Candidate Slots
  const approveAndDispatchQuickly = useCallback(() => {
    if (!activeRequest) return;

    const busyBlocks = useQueueStore.getState().busyBlocks || [];
    const candidateSlots = generateCandidateSlots(activeRequest, busyBlocks, 3);

    // Save slots to queue store
    useQueueStore.setState((state) => ({
      slotsByRequest: {
        ...state.slotsByRequest,
        [activeRequest.id]: candidateSlots,
      },
    }));

    // Trigger state machine transition
    dispatchOffers(activeRequest.id);

    setToast({
      tone: 'success',
      text: `Approved & dispatched 3 candidate slots to ${activeRequest.patientName}! 60-min offer window active.`,
    });
  }, [activeRequest, dispatchOffers]);

  // Handle Telegram Chat Options with Full Feature Parity
  const handleTelegramOptionSelect = useCallback(
    (key, value, optionLabel, slotData = null) => {
      const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      // User response bubble
      const userMsg = {
        id: `tg-u-${Date.now()}`,
        sender: 'user',
        text: optionLabel || value,
        time: nowTime,
      };

      if (key === 'service') {
        setTelegramDraft((prev) => ({ ...prev, serviceId: value }));
        setTelegramStep(2);

        const botReply = {
          id: `tg-b-${Date.now() + 1}`,
          sender: 'bot',
          text: `🗓️ What is your preferred date window? Our scheduling engine scans doctor shifts within this range:`,
          time: nowTime,
          options: [
            { label: '⚡ Next 7 Days', key: 'dateRange', value: '7' },
            { label: '📅 Next 14 Days', key: 'dateRange', value: '14' },
            { label: '🗓️ Next 30 Days', key: 'dateRange', value: '30' },
            { label: '☀️ This Week', key: 'dateRange', value: '5' },
          ],
        };
        setTelegramMessages((prev) => [...prev, userMsg, botReply]);
      } else if (key === 'dateRange') {
        const days = Number(value) || 14;
        const startDate = getTodayIso();
        const endDate = getFutureIso(days);
        setTelegramDraft((prev) => ({ ...prev, dateRangeDays: days, startDate, endDate }));
        setTelegramStep(3);

        const botReply = {
          id: `tg-b-${Date.now() + 1}`,
          sender: 'bot',
          text: `⏰ What time of day works best for your schedule?`,
          time: nowTime,
          options: [
            { label: '☀️ Morning (08:00 – 12:00)', key: 'timeWindow', value: 'morning' },
            { label: '🌤️ Afternoon (13:00 – 17:00)', key: 'timeWindow', value: 'afternoon' },
            { label: '🌙 Evening (16:00 – 18:00)', key: 'timeWindow', value: 'evening' },
          ],
        };
        setTelegramMessages((prev) => [...prev, userMsg, botReply]);
      } else if (key === 'timeWindow') {
        setTelegramDraft((prev) => ({ ...prev, timeWindow: value }));
        setTelegramStep(4);

        const botReply = {
          id: `tg-b-${Date.now() + 1}`,
          sender: 'bot',
          text: `👤 For clinical records and triage, please select the patient's gender:`,
          time: nowTime,
          options: [
            { label: '👩 Female', key: 'gender', value: 'Female' },
            { label: '👨 Male', key: 'gender', value: 'Male' },
            { label: '⚧ Other / Neutral', key: 'gender', value: 'Other' },
          ],
        };
        setTelegramMessages((prev) => [...prev, userMsg, botReply]);
      } else if (key === 'gender') {
        setTelegramDraft((prev) => ({ ...prev, gender: value }));
        setTelegramStep(5);

        const botReply = {
          id: `tg-b-${Date.now() + 1}`,
          sender: 'bot',
          text: `🩺 Is this a routine consultation or an urgent emergency medical visit?`,
          time: nowTime,
          options: [
            { label: '🟢 Standard Consultation', key: 'urgency', value: 'standard' },
            { label: '🚨 Urgent / Emergency Visit', key: 'urgency', value: 'emergency' },
          ],
        };
        setTelegramMessages((prev) => [...prev, userMsg, botReply]);
      } else if (key === 'urgency') {
        const isEmergency = value === 'emergency';
        setTelegramDraft((prev) => ({ ...prev, isEmergency }));
        setTelegramStep(6);

        const svc = SERVICES.find((s) => s.id === telegramDraft.serviceId) || { name: 'Consultation' };
        const windowLabel =
          telegramDraft.timeWindow === 'morning'
            ? 'Morning (08:00 – 12:00)'
            : telegramDraft.timeWindow === 'afternoon'
            ? 'Afternoon (13:00 – 17:00)'
            : 'Evening (16:00 – 18:00)';

        const botReply = {
          id: `tg-b-${Date.now() + 1}`,
          sender: 'bot',
          text: `📋 Review Booking Request:\n👤 Patient: ${telegramDraft.patientName}\n📞 Phone: ${telegramDraft.phone}\n🩺 Service: ${svc.name}\n🗓️ Range: ${telegramDraft.startDate} → ${telegramDraft.endDate}\n⏰ Window: ${windowLabel}\n👤 Gender: ${telegramDraft.gender}\n🚨 Priority: ${isEmergency ? 'URGENT' : 'STANDARD'}\n\nConfirm to transmit to front desk triage:`,
          time: nowTime,
          options: [
            { label: '🚀 Confirm & Dispatch to Clinic', key: 'confirm', value: 'confirm' },
            { label: '🔄 Start Over', key: 'restart', value: 'restart' },
          ],
        };
        setTelegramMessages((prev) => [...prev, userMsg, botReply]);
      } else if (key === 'confirm') {
        setTelegramStep(7);
        setIsSubmitting(true);
        const startTimestamp = performance.now();

        const uniqueId = `req-tg-${Date.now().toString(36)}`;
        const randomCode = `REQ-2026-${Math.floor(1000 + Math.random() * 9000)}`;

        const newRequest = {
          id: uniqueId,
          code: randomCode,
          patientName: telegramDraft.patientName,
          phone: telegramDraft.phone,
          patientType: 'returning',
          serviceId: telegramDraft.serviceId,
          preferredDoctorId: null, // Zero doctor choice: auto-balanced across clinicians!
          timeWindow: telegramDraft.timeWindow,
          startDate: telegramDraft.startDate,
          endDate: telegramDraft.endDate,
          preferredDateRange: { start: telegramDraft.startDate, end: telegramDraft.endDate },
          gender: telegramDraft.gender,
          isEmergency: Boolean(telegramDraft.isEmergency),
          channel: 'telegram',
          status: 'awaiting_review',
          reRequested: false,
          reviewingBy: null,
          createdAt: Date.now(),
          symptoms: `Scheduled via @cedarcare_bot interactive Telegram gateway (${telegramDraft.isEmergency ? 'URGENT' : 'Standard'}, ${telegramDraft.gender})`,
        };

        // Live backend persistence
        try {
          apiService.createBookingRequest({
            patient_name: newRequest.patientName,
            patient_phone: newRequest.phone,
            service_id: newRequest.serviceId,
            preferred_doctor_id: null,
            preferred_time_window: newRequest.timeWindow,
            preferred_date_range: newRequest.preferredDateRange,
            preferred_dates: [telegramDraft.startDate, telegramDraft.endDate],
            channel: 'telegram',
            patient_notes: newRequest.symptoms,
            gender: newRequest.gender,
            is_emergency: newRequest.isEmergency,
          }).then((res) => {
            if (res && (res.id || res.request_id || res.request_code)) {
              newRequest.id = res.id || uniqueId;
              newRequest.code = res.request_code || res.request_id || randomCode;
              newRequest.backendUuid = res.id;
            }
          }).catch((err) => {
            console.warn('Backend createBookingRequest fallback to local state:', err);
          });
        } catch (err) {
          console.warn('Backend createBookingRequest error:', err);
        }

        setTimeout(() => {
          injectRequest(newRequest);
          soundService.playChime();

          const elapsed = Math.round(performance.now() - startTimestamp);
          setSyncLatencyMs(elapsed > 0 ? elapsed : 95);
          setActiveRequest(newRequest);
          setSimulatorStage('waiting_review');
          setIsSubmitting(false);

          const botConfirmed = {
            id: `tg-b-${Date.now() + 2}`,
            sender: 'bot',
            text: `✅ Request received (${randomCode})!\n\nFront desk receptionist is now reviewing available slots for your preferred window (${telegramDraft.startDate} → ${telegramDraft.endDate}).\n\nYou will receive 3 candidate options directly here within minutes with a 1-hour decision hold.`,
            time: nowTime,
            options: [],
          };

          setTelegramMessages((prev) => [...prev, userMsg, botConfirmed]);
          setToast({
            tone: 'success',
            text: `⚡ Telegram Bot Intake (${randomCode}) injected into Triage Queue in ${elapsed}ms!`,
          });
        }, 150);
      } else if (key === 'select_slot') {
        // Patient picked a slot in Telegram!
        const chosenSlot = slotData || offeredSlots.find((s) => s.id === value) || offeredSlots[0];
        if (chosenSlot) {
          selectCandidateSlot(chosenSlot);
        }
      } else if (key === 'rerequest_fresh') {
        reRequestFreshTimes();
      } else if (key === 'restart') {
        resetSimulator();
      }
    },
    [telegramDraft, injectRequest, offeredSlots, selectCandidateSlot, reRequestFreshTimes, resetSimulator]
  );

  const dismissToast = useCallback(() => setToast(null), []);

  return {
    channel,
    setChannel,
    simulatorStage,
    webForm,
    updateWebForm,
    applyPreset,
    applyDateRangePreset,
    submitWebBooking,
    telegramMessages,
    telegramStep,
    telegramDraft,
    handleTelegramOptionSelect,
    isSubmitting,
    activeRequest,
    offeredSlots,
    remainingOfferSeconds,
    confirmedAppointment,
    approveAndDispatchQuickly,
    selectCandidateSlot,
    simulateOfferExpiry,
    reRequestFreshTimes,
    syncLatencyMs,
    toast,
    dismissToast,
    resetSimulator,
    servicesList: SERVICES,
    doctorsList: dynamicDoctors,
  };
};
