import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQueueStore } from '../stores/useQueueStore';
import { useCalendarStore } from '../stores/useCalendarStore';
import { soundService } from '../services/soundService';
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

export const PRESETS = {
  amina: {
    patientName: 'Amina Yusuf',
    phone: '+234 801 234 5678',
    patientType: 'returning',
    serviceId: 'svc-dental',
    preferredDoctorId: 'doc-bello',
    timeWindow: 'morning',
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
    preferredDoctorId: 'doc-okafor',
    timeWindow: 'afternoon',
    gender: 'Male',
    dateOfBirth: '1985-11-20',
    isEmergency: false,
    symptoms: 'Annual executive comprehensive physical and blood pressure check',
  },
};

const INITIAL_WEB_FORM = { ...PRESETS.amina };

const INITIAL_TELEGRAM_MESSAGES = [
  {
    id: 'tg-1',
    sender: 'bot',
    text: '👋 Welcome to Cedarcare Specialist Clinic! How can we assist you today?',
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
    timeWindow: 'morning',
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

  // Submit via Web Intake Form
  const submitWebBooking = useCallback(() => {
    if (!webForm.patientName || !webForm.phone) {
      setToast({ tone: 'error', text: 'Please provide patient name and phone number.' });
      return;
    }

    setIsSubmitting(true);
    const startTimestamp = performance.now();
    const uniqueId = `req-sim-${Date.now().toString(36)}`;
    const randomCode = `REQ-2026-${Math.floor(1000 + Math.random() * 9000)}`;

    const newRequest = {
      id: uniqueId,
      code: randomCode,
      patientName: webForm.patientName.trim(),
      phone: webForm.phone.trim(),
      patientType: webForm.patientType,
      serviceId: webForm.serviceId,
      preferredDoctorId: webForm.preferredDoctorId || null,
      timeWindow: webForm.timeWindow,
      dateRange: { fromOffset: BASE_OFFSET, toOffset: BASE_OFFSET + DEFAULT_RANGE_DAYS - 1 },
      channel: 'web',
      status: 'awaiting_review',
      reRequested: false,
      reviewingBy: null,
      createdAt: Date.now(),
      gender: webForm.gender || 'Female',
      dateOfBirth: webForm.dateOfBirth || null,
      isEmergency: Boolean(webForm.isEmergency),
      symptoms: webForm.symptoms,
    };

    setTimeout(() => {
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
    }, 180);
  }, [webForm, injectRequest]);

  // Handle Telegram Chat Options
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
          text: `Great choice! When do you prefer to see the specialist?`,
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
        setTelegramStep(3);

        const botReply = {
          id: `tg-b-${Date.now() + 1}`,
          sender: 'bot',
          text: `Got it! Please confirm booking under your registered contact:\n👤 Amina Yusuf\n📞 +234 801 234 5678`,
          time: nowTime,
          options: [
            { label: '🚀 Confirm & Dispatch to Clinic', key: 'confirm', value: 'confirm' },
            { label: '🔄 Start Over', key: 'restart', value: 'restart' },
          ],
        };
        setTelegramMessages((prev) => [...prev, userMsg, botReply]);
      } else if (key === 'confirm') {
        setTelegramStep(4);
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
          preferredDoctorId: 'doc-bello',
          timeWindow: telegramDraft.timeWindow,
          dateRange: { fromOffset: BASE_OFFSET, toOffset: BASE_OFFSET + DEFAULT_RANGE_DAYS - 1 },
          channel: 'telegram',
          status: 'awaiting_review',
          reRequested: false,
          reviewingBy: null,
          createdAt: Date.now(),
          symptoms: 'Scheduled via @cedarcare_bot interactive Telegram intake flow',
        };

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
            text: `✅ Request received (${randomCode})!\n\nFront desk receptionist is now reviewing available slots for your preferred window.\n\nYou will receive 3 candidate options directly here within minutes with a 1-hour decision hold.`,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [telegramDraft, injectRequest, offeredSlots]
  );

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

    dispatchOffers(activeRequest.id);
    setOfferedSlots(candidateSlots);
    const expiresAt = Date.now() + CLINIC_RULES.offerExpiryMin * MIN;
    setOfferExpiresAt(expiresAt);
    setRemainingOfferSeconds(CLINIC_RULES.offerExpiryMin * 60);
    setSimulatorStage('slots_offered');
    soundService.playChime();

    // If channel is Telegram, send bot message with option buttons
    if (channel === 'telegram') {
      const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const options = candidateSlots.map((slot, idx) => {
        const doc = getDoctor(slot.doctorId);
        const label = `${idx + 1}️⃣ ${formatDayLabel(slot.start)} @ ${formatTime(slot.start)} (${doc?.name?.split(' ')[0] || 'Doctor'})`;
        return { label, key: 'select_slot', value: slot.id, slotData: slot };
      });

      setTelegramMessages((prev) => [
        ...prev,
        {
          id: `tg-offered-${Date.now()}`,
          sender: 'bot',
          text: `✨ Good news, ${activeRequest.patientName.split(' ')[0]}!\n\nFront desk receptionist Chioma reviewed your request and approved 3 available times.\n\nPlease tap your preferred slot below (offers held for 1 hour):`,
          time: nowTime,
          options,
        },
      ]);
    }

    setToast({
      tone: 'success',
      text: `Approved & dispatched 3 candidate slots to ${activeRequest.patientName}! 60-min offer window active.`,
    });
  }, [activeRequest, dispatchOffers, channel]);

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

  const dismissToast = useCallback(() => setToast(null), []);

  return {
    channel,
    setChannel,
    simulatorStage,
    webForm,
    updateWebForm,
    applyPreset,
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
    doctorsList: DOCTORS,
  };
};
