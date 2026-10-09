import { useState, useEffect, useMemo } from 'react';
import { INITIAL_SERVICES, INITIAL_DOCTORS } from '../utils/mockData';
import { apiService } from '../services/apiService';

export const usePatientSimulator = ({
  activeDispatchedOffers,
  onSubmitPatientRequest,
  onPatientSelectSlot,
  onPatientReRequestNewTimes
}) => {
  // Web Form State
  const [selectedServiceId, setSelectedServiceId] = useState(INITIAL_SERVICES[0].id);
  const [preferredDoctorId, setPreferredDoctorId] = useState('any');
  const [selectedDate, setSelectedDate] = useState('2026-10-12');
  const [timeWindow, setTimeWindow] = useState('morning');
  const [patientName, setPatientName] = useState('Amina Yusuf');
  const [patientPhone, setPatientPhone] = useState('+234 801 234 5678');
  const [patientType, setPatientType] = useState('new');
  const [channel, setChannel] = useState('whatsapp');
  const [submittedRequestId, setSubmittedRequestId] = useState(null);

  // Phone Simulator Interactive State
  const [phoneChannel, setPhoneChannel] = useState('whatsapp');
  const [phoneMessages, setPhoneMessages] = useState([
    {
      id: 'msg-1',
      sender: 'bot',
      time: '09:30 AM',
      text: '👋 Welcome to MedPulse Dental & Wellness Clinic!\n\nOur front desk is reviewing available times with our clinical scheduling rules. We will dispatch your candidate options shortly.'
    }
  ]);
  const [activeSlotOffer, setActiveSlotOffer] = useState(null);
  const [offerCountdown, setOfferCountdown] = useState(3600); // 60 mins
  const [isExpired, setIsExpired] = useState(false);
  const [confirmedBooking, setConfirmedBooking] = useState(null);

  // 2-week date selector pills
  const nextTwoWeeks = useMemo(() => {
    return Array.from({ length: 14 }).map((_, i) => {
      const d = new Date(Date.now() + (i + 1) * 24 * 60 * 60 * 1000);
      const dateStr = d.toISOString().split('T')[0];
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
      const dayNum = d.getDate();
      const month = d.toLocaleDateString('en-US', { month: 'short' });
      return { dateStr, label: `${dayName}, ${month} ${dayNum}` };
    });
  }, []);

  // Listen to new offers dispatched by reception desk
  useEffect(() => {
    if (activeDispatchedOffers && activeDispatchedOffers.length > 0) {
      const latest = activeDispatchedOffers[activeDispatchedOffers.length - 1];
      setActiveSlotOffer(latest);
      setIsExpired(false);
      setOfferCountdown(3600);

      setPhoneMessages(prev => [
        ...prev,
        {
          id: `msg-offer-${Date.now()}`,
          sender: 'bot',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          text: `🎉 Front desk has approved candidate appointment times for you!\n\n⏳ Note: These options are reserved for 60 minutes. Reply or click below to lock in your slot:`,
          slots: latest.slots
        }
      ]);
    }
  }, [activeDispatchedOffers]);

  // 1-hour offer countdown
  useEffect(() => {
    if (!activeSlotOffer || isExpired || confirmedBooking) return;

    const timer = setInterval(() => {
      setOfferCountdown(c => {
        if (c <= 1) {
          setIsExpired(true);
          return 0;
        }
        return c - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [activeSlotOffer, isExpired, confirmedBooking]);

  const formatCountdown = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Submit web booking form
  const handleWebBookingSubmit = (e) => {
    e.preventDefault();
    const service = INITIAL_SERVICES.find(s => s.id === selectedServiceId);
    const doctor = INITIAL_DOCTORS.find(d => d.id === preferredDoctorId);
    const newReqId = `REQ-2026-${Math.floor(1000 + Math.random() * 9000)}`;

    const reqData = {
      request_id: newReqId,
      patient_name: patientName,
      patient_phone: patientPhone,
      patient_type: patientType,
      past_visits_count: patientType === 'returning' ? 2 : 0,
      service_id: selectedServiceId,
      service_name: service ? service.name : 'Dental Consultation',
      preferred_doctor_id: preferredDoctorId === 'any' ? null : preferredDoctorId,
      preferred_doctor_name: doctor ? doctor.name : 'Any Available Specialist',
      preferred_dates: [selectedDate],
      preferred_time_window: timeWindow,
      channel: channel,
      status: 'awaiting_review',
      priority: 'normal',
      created_at: new Date().toISOString()
    };

    if (onSubmitPatientRequest) onSubmitPatientRequest(reqData);
    setSubmittedRequestId(newReqId);
    setPhoneChannel(channel);

    setPhoneMessages(prev => [
      ...prev,
      {
        id: `msg-sub-${Date.now()}`,
        sender: 'patient',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        text: `Hello, I would like to book an appointment for ${service?.name} on ${selectedDate} (${timeWindow}). My name is ${patientName}.`
      },
      {
        id: `msg-ack-${Date.now()}`,
        sender: 'bot',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        text: `✅ Request received (Ref: ${newReqId})!\n\nOur front desk is checking doctor schedules right now. You will receive approved options shortly.`
      }
    ]);
  };

  // Patient selects a slot
  const selectSlot = async (slot) => {
    const appointmentId = `AP-${Math.floor(1000 + Math.random() * 9000)}`;
    setConfirmedBooking({ appointment_id: appointmentId, slot });

    setPhoneMessages(prev => [
      ...prev,
      {
        id: `msg-select-${Date.now()}`,
        sender: 'patient',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        text: `Selected Option: ${slot.display_label}`
      },
      {
        id: `msg-conf-${Date.now()}`,
        sender: 'bot',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        text: `🔒 Slot Locked & Confirmed!\n\nAppointment Reference: ${appointmentId}\nDoctor: ${slot.doctor_name}\nTime: ${slot.display_label}\n\nWe look forward to seeing you at MedPulse Clinic!`
      }
    ]);

    if (onPatientSelectSlot) {
      onPatientSelectSlot(appointmentId, slot, patientName, patientPhone);
    }
  };

  // Simulate 60-min expiration
  const simulateExpiry = () => {
    setIsExpired(true);
    setOfferCountdown(0);
    setPhoneMessages(prev => [
      ...prev,
      {
        id: `msg-exp-${Date.now()}`,
        sender: 'bot',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        text: `⚠️ Friendly Notice: The previous slot options for ${patientName} have expired to keep our schedule open for all patients.\n\nWe would still love to see you! Click below to request fresh available times:`,
        isExpiredPrompt: true
      }
    ]);
  };

  // Patient clicks "See New Times"
  const reRequestNewTimes = () => {
    setIsExpired(false);
    setPhoneMessages(prev => [
      ...prev,
      {
        id: `msg-rereq-${Date.now()}`,
        sender: 'patient',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        text: `🔄 [See New Times]`
      },
      {
        id: `msg-rereq-ack-${Date.now()}`,
        sender: 'bot',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        text: `⚡ Front desk alerted with PRIORITY status!\n\nReceptionist Sarah is preparing fresh available slots for you right now.`
      }
    ]);

    if (onPatientReRequestNewTimes) {
      onPatientReRequestNewTimes(submittedRequestId || 'REQ-2026-0042', patientName);
    }
  };

  return {
    selectedServiceId,
    setSelectedServiceId,
    preferredDoctorId,
    setPreferredDoctorId,
    selectedDate,
    setSelectedDate,
    timeWindow,
    setTimeWindow,
    patientName,
    setPatientName,
    patientPhone,
    setPatientPhone,
    patientType,
    setPatientType,
    channel,
    setChannel,
    phoneChannel,
    setPhoneChannel,
    phoneMessages,
    activeSlotOffer,
    offerCountdown,
    isExpired,
    confirmedBooking,
    nextTwoWeeks,
    formatCountdown,
    handleWebBookingSubmit,
    selectSlot,
    simulateExpiry,
    reRequestNewTimes
  };
};
