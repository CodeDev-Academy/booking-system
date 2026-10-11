import React, { useState } from 'react';
import {
  ClockIcon,
  PhoneIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  MessageSquareIcon,
  SendIcon
} from '../common/Icons';
import { ReviewModal } from './ReviewModal';
import { AskForInfoDrawer } from './AskForInfoDrawer';

export const RequestsModule = ({
  controller,
  onSendMessage,
  doctors = []
}) => {
  const {
    requests,
    selectedRequest,
    isReviewOpen,
    isAskInfoOpen,
    candidateSlots,
    isCheckingSlots,
    editingSlotId,
    setEditingSlotId,
    openReviewModal,
    closeReviewModal,
    openAskInfoDrawer,
    closeAskInfoDrawer,
    checkLiveSlots,
    swapDoctor,
    addCustomSlot,
    removeCandidateSlot,
    approveAndDispatch,
    rejectRequest
  } = controller;

  // Simple toggle for expired requests as requested
  const [showExpired, setShowExpired] = useState(false);

  // Active new requests: urgent/re-requested patients naturally float to the top
  const activeRequests = requests
    .filter(r => ['awaiting_review', 're_requested'].includes(r.status))
    .sort((a, b) => {
      // Re-requested (urgent) floats to top
      if (a.status === 're_requested' && b.status !== 're_requested') return -1;
      if (b.status === 're_requested' && a.status !== 're_requested') return 1;
      return new Date(a.created_at) - new Date(b.created_at);
    });

  const expiredRequests = requests.filter(r => r.status === 'offer_expired');

  const displayedList = showExpired ? expiredRequests : activeRequests;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Simple, Clean Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        {/* Simple Tab Wording */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <button
            onClick={() => setShowExpired(false)}
            className="btn-pill"
            style={{
              padding: '7px 18px',
              fontSize: '0.8125rem',
              fontWeight: !showExpired ? '700' : '500',
              backgroundColor: !showExpired ? '#ffffff' : 'rgba(255, 255, 255, 0.04)',
              color: !showExpired ? '#0c0d0e' : '#8e8e93',
              boxShadow: !showExpired ? '0 0 20px rgba(255, 255, 255, 0.25)' : 'none'
            }}
          >
            <span>New Requests</span>
            <span style={{
              fontSize: '0.6875rem',
              fontWeight: '800',
              padding: '2px 7px',
              borderRadius: '10px',
              backgroundColor: !showExpired ? '#0c0d0e' : 'rgba(255, 255, 255, 0.08)',
              color: !showExpired ? '#ffffff' : '#8e8e93'
            }}>
              {activeRequests.length}
            </span>
          </button>
        </div>

        {/* Simple Toggle for Expired Requests */}
        <div>
          <button
            onClick={() => setShowExpired(!showExpired)}
            className="btn-pill"
            style={{
              padding: '7px 16px',
              fontSize: '0.8125rem',
              fontWeight: showExpired ? '700' : '500',
              backgroundColor: showExpired ? 'rgba(255, 77, 109, 0.15)' : 'rgba(255, 255, 255, 0.03)',
              color: showExpired ? 'var(--color-accent-coral)' : '#8e8e93',
              border: showExpired ? '1px solid var(--color-accent-coral)' : '1px solid var(--color-border-glass)'
            }}
          >
            <span>{showExpired ? '← Back to New Requests' : `Show Expired (${expiredRequests.length})`}</span>
          </button>
        </div>
      </div>

      {/* Clean Request Cards List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {displayedList.map((req) => {
          const isUrgent = req.status === 're_requested';
          const isExpired = req.status === 'offer_expired';

          return (
            <div
              key={req.request_id}
              onClick={() => openReviewModal(req)}
              className="glass-card"
              style={{
                padding: '18px 24px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '14px',
                borderLeft: isUrgent
                  ? '3px solid var(--color-accent-orange)'
                  : isExpired
                  ? '3px solid var(--color-accent-coral)'
                  : '3px solid rgba(255, 255, 255, 0.12)'
              }}
            >
              {/* Left Column: Patient & Service Info (No Avatar, Clean Typography) */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {/* Urgent amber dot for re-requested patients */}
                  {isUrgent && (
                    <span
                      title="Patient requested new times"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        fontSize: '0.75rem',
                        fontWeight: '700',
                        color: 'var(--color-accent-orange)',
                        background: 'rgba(255, 107, 0, 0.12)',
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-pill)',
                        border: '1px solid rgba(255, 107, 0, 0.25)'
                      }}
                    >
                      <span style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        backgroundColor: 'var(--color-accent-orange)',
                        boxShadow: '0 0 6px var(--color-accent-orange)'
                      }} />
                      <span>Needs New Times</span>
                    </span>
                  )}

                  <span style={{ fontWeight: '700', fontSize: '1.0625rem', color: '#ffffff' }}>
                    {req.patient_name}
                  </span>

                  {/* Tiny discreet channel icon */}
                  <span
                    title={`Submitted via ${req.channel}`}
                    style={{
                      fontSize: '0.75rem',
                      color: req.channel === 'whatsapp' ? '#25D366' : '#229ED9',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    {req.channel === 'whatsapp' ? '💬' : '✈️'}
                  </span>

                  {/* Returning Tag */}
                  {req.patient_type === 'returning' && (
                    <span className="glass-badge glass-badge-green" style={{ fontSize: '0.625rem' }}>
                      Returning
                    </span>
                  )}
                </div>

                {/* Service and Doctor Line */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  fontSize: '0.8125rem',
                  color: 'var(--color-text-secondary)',
                  marginTop: '4px'
                }}>
                  <span style={{ color: '#ffffff', fontWeight: '500' }}>{req.service_name}</span>
                  <span>•</span>
                  <span>{req.preferred_doctor_name || 'Any Doctor'}</span>
                  <span>•</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <ClockIcon size={12} color="#8e8e93" />
                    {new Date(req.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>

              {/* Right Column: Exactly 1 Clean Review Button */}
              <div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openReviewModal(req);
                  }}
                  className={`btn-pill ${isUrgent ? 'btn-pill-orange' : 'btn-pill-glass'}`}
                  style={{ padding: '8px 20px', gap: '6px' }}
                >
                  <span>Review</span>
                  <ChevronRightIcon size={14} color="currentColor" />
                </button>
              </div>
            </div>
          );
        })}

        {displayedList.length === 0 && (
          <div className="glass-card" style={{
            textAlign: 'center',
            padding: '50px 20px',
            color: 'var(--color-text-secondary)'
          }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '50%',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 10px'
            }}>
              <CheckCircleIcon size={20} color="var(--color-accent-green)" />
            </div>
            <h3 style={{ fontSize: '1rem', color: '#ffffff', marginBottom: '2px' }}>
              {showExpired ? 'No Expired Requests' : 'All Clear'}
            </h3>
            <p style={{ fontSize: '0.8125rem' }}>
              {showExpired ? 'No historical expired requests found.' : 'No new patient requests waiting right now.'}
            </p>
          </div>
        )}
      </div>

      {/* Review Modal */}
      <ReviewModal
        request={selectedRequest}
        isOpen={isReviewOpen}
        onClose={closeReviewModal}
        candidateSlots={candidateSlots}
        isCheckingSlots={isCheckingSlots}
        editingSlotId={editingSlotId}
        setEditingSlotId={setEditingSlotId}
        onCheckLiveSlots={checkLiveSlots}
        onSwapDoctor={swapDoctor}
        onAddCustomSlot={addCustomSlot}
        onRemoveSlot={removeCandidateSlot}
        onApproveAndDispatch={approveAndDispatch}
        onOpenAskInfo={openAskInfoDrawer}
        onRejectRequest={rejectRequest}
        doctors={doctors}
      />

      {/* Ask for Info Slide-Over */}
      <AskForInfoDrawer
        request={selectedRequest}
        isOpen={isAskInfoOpen}
        onClose={closeAskInfoDrawer}
        onSendMessage={onSendMessage}
      />
    </div>
  );
};
