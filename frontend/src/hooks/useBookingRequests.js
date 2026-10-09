import { useState, useMemo } from 'react';
import { INITIAL_BOOKING_REQUESTS, INITIAL_DOCTORS } from '../utils/mockData';
import { apiService } from '../services/apiService';

export const useBookingRequests = ({ onNewRequestNotification, onDispatchedOffer }) => {
  const [requests, setRequests] = useState(INITIAL_BOOKING_REQUESTS);
  const [activeTab, setActiveTab] = useState('new'); // 'new', 're_requested', 'offered', 'expired'
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [isAskInfoOpen, setIsAskInfoOpen] = useState(false);

  // Review modal specific logic state
  const [candidateSlots, setCandidateSlots] = useState([]);
  const [isCheckingSlots, setIsCheckingSlots] = useState(false);
  const [editingSlotId, setEditingSlotId] = useState(null);

  // Sorted and filtered tab lists (Separation of Logic)
  const newRequests = useMemo(() => {
    return requests
      .filter(r => r.status === 'awaiting_review' && r.priority !== 'urgent')
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at)); // FIFO
  }, [requests]);

  const reRequestedList = useMemo(() => {
    return requests.filter(r => r.status === 're_requested');
  }, [requests]);

  const offeredList = useMemo(() => {
    return requests.filter(r => r.status === 'slots_offered');
  }, [requests]);

  const expiredList = useMemo(() => {
    return requests.filter(r => r.status === 'offer_expired');
  }, [requests]);

  const currentTabList = useMemo(() => {
    switch (activeTab) {
      case 'new': return newRequests;
      case 're_requested': return reRequestedList;
      case 'offered': return offeredList;
      case 'expired': return expiredList;
      default: return newRequests;
    }
  }, [activeTab, newRequests, reRequestedList, offeredList, expiredList]);

  // Open / Close actions
  const openReviewModal = (req) => {
    setSelectedRequest(req);
    setCandidateSlots(req.suggested_slots || []);
    setEditingSlotId(null);
    setIsReviewOpen(true);
  };

  const closeReviewModal = () => {
    setIsReviewOpen(false);
  };

  const openAskInfoDrawer = (req) => {
    setSelectedRequest(req);
    setIsAskInfoOpen(true);
  };

  const closeAskInfoDrawer = () => {
    setIsAskInfoOpen(false);
  };

  // Recalculate Live Slots via apiService
  const checkLiveSlots = async () => {
    if (!selectedRequest) return;
    setIsCheckingSlots(true);
    try {
      const response = await apiService.bookingRequests.checkSlots(
        selectedRequest.request_id,
        selectedRequest.service_name
      );
      setCandidateSlots(response.suggested_slots);
    } finally {
      setIsCheckingSlots(false);
    }
  };

  // Swap doctor on candidate slot
  const swapDoctor = (slotId, newDocId) => {
    const doc = INITIAL_DOCTORS.find(d => d.id === newDocId);
    if (!doc) return;
    setCandidateSlots(prev => prev.map(s => {
      if (s.id === slotId) {
        return {
          ...s,
          doctor_id: doc.id,
          doctor_name: doc.name
        };
      }
      return s;
    }));
    setEditingSlotId(null);
  };

  // Add custom slot
  const addCustomSlot = ({ doctorId, date, time }) => {
    const doc = INITIAL_DOCTORS.find(d => d.id === doctorId) || INITIAL_DOCTORS[0];
    const newSlot = {
      id: `slot-custom-${Date.now()}`,
      doctor_id: doc.id,
      doctor_name: doc.name,
      start_datetime: `${date}T${time}:00Z`,
      end_datetime: `${date}T${time}:30Z`,
      display_label: `${date}, ${time} (${doc.name})`
    };
    setCandidateSlots(prev => [...prev, newSlot]);
  };

  // Remove candidate slot
  const removeCandidateSlot = (slotId) => {
    setCandidateSlots(prev => prev.filter(s => s.id !== slotId));
  };

  // Approve and Dispatch (1-Hour Expiry)
  const approveAndDispatch = async (requestId, slotsToDispatch) => {
    const dispatchResult = await apiService.bookingRequests.dispatchOffers(requestId, slotsToDispatch);

    setRequests(prev => prev.map(req => {
      if (req.request_id === requestId) {
        return {
          ...req,
          status: 'slots_offered',
          suggested_slots: slotsToDispatch,
          offered_at: dispatchResult.offered_at,
          expires_at: dispatchResult.expires_at
        };
      }
      return req;
    }));

    if (onDispatchedOffer) {
      const targetReq = requests.find(r => r.request_id === requestId);
      onDispatchedOffer({
        requestId,
        patientName: targetReq?.patient_name || 'Patient',
        slots: slotsToDispatch
      });
    }

    closeReviewModal();
    return dispatchResult;
  };

  // Re-engage expired request (moves to priority re-requested)
  const reEngageExpired = (requestId) => {
    setRequests(prev => prev.map(r => {
      if (r.request_id === requestId) {
        return {
          ...r,
          status: 're_requested',
          priority: 'urgent',
          re_requested_at: new Date().toISOString()
        };
      }
      return r;
    }));
    if (onNewRequestNotification) onNewRequestNotification();
  };

  // Reject request
  const rejectRequest = (requestId) => {
    setRequests(prev => prev.filter(r => r.request_id !== requestId));
    closeReviewModal();
  };

  // Add new external request (from Web or WhatsApp intake)
  const addExternalRequest = (newReq) => {
    setRequests(prev => [newReq, ...prev]);
    if (onNewRequestNotification) onNewRequestNotification();
  };

  // Simulate an incoming patient request
  const simulateIncomingRequest = () => {
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const newReq = {
      request_id: `REQ-2026-${randomNum}`,
      patient_name: "Chiamaka Okonjo",
      patient_phone: "+234 807 555 1234",
      patient_type: "new",
      past_visits_count: 0,
      service_id: "srv-001",
      service_name: "Dental Consultation",
      preferred_doctor_id: "doc-uuid-1",
      preferred_doctor_name: "Dr. Ibrahim Bello",
      preferred_dates: ["2026-10-14"],
      preferred_time_window: "morning",
      channel: "whatsapp",
      status: "awaiting_review",
      priority: "normal",
      created_at: new Date().toISOString(),
      concurrent_review_by: null,
      suggested_slots: [
        {
          id: `slot-new-${Date.now()}`,
          doctor_id: "doc-uuid-1",
          doctor_name: "Dr. Ibrahim Bello",
          start_datetime: "2026-10-14T10:00:00Z",
          end_datetime: "2026-10-14T10:30:00Z",
          display_label: "Wed Oct 14, 10:00 AM - 10:30 AM"
        }
      ]
    };
    addExternalRequest(newReq);
    return newReq;
  };

  return {
    requests,
    activeTab,
    setActiveTab,
    selectedRequest,
    isReviewOpen,
    isAskInfoOpen,
    candidateSlots,
    isCheckingSlots,
    editingSlotId,
    setEditingSlotId,
    newRequests,
    reRequestedList,
    offeredList,
    expiredList,
    currentTabList,
    openReviewModal,
    closeReviewModal,
    openAskInfoDrawer,
    closeAskInfoDrawer,
    checkLiveSlots,
    swapDoctor,
    addCustomSlot,
    removeCandidateSlot,
    approveAndDispatch,
    reEngageExpired,
    rejectRequest,
    addExternalRequest,
    simulateIncomingRequest
  };
};
