import React from 'react';
import {
  ClockIcon,
  PhoneIcon,
  SparklesIcon,
  CheckCircleIcon,
  RefreshCwIcon,
  EyeIcon,
  SendIcon,
  MessageSquareIcon
} from '../common/Icons';
import { ReviewModal } from './ReviewModal';
import { AskForInfoDrawer } from './AskForInfoDrawer';

export const RequestsModule = ({
  controller,
  onSendMessage
}) => {
  const {
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
    simulateIncomingRequest
  } = controller;

  return (
    <div>
      {/* Top Banner & Fast Simulation Controls */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '20px',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '4px' }}>Receptionist Requests Queue</h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
            Review, edit doctor candidate slots, and approve appointment dispatches.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={simulateIncomingRequest}
            className="btn btn-secondary btn-sm"
            style={{ border: '1px dashed var(--color-primary)', color: 'var(--color-primary)' }}
          >
            <SparklesIcon size={14} color="var(--color-primary)" />
            + Simulate Incoming Patient Request
          </button>
        </div>
      </div>

      {/* 4 Filter Tabs */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        borderBottom: '1px solid var(--color-border)',
        marginBottom: '20px',
        overflowX: 'auto',
        paddingBottom: '2px'
      }}>
        <button
          onClick={() => setActiveTab('new')}
          style={{
            padding: '10px 16px',
            borderRadius: '8px',
            fontSize: '0.875rem',
            fontWeight: activeTab === 'new' ? '700' : '500',
            backgroundColor: activeTab === 'new' ? 'var(--color-surface)' : 'transparent',
            color: activeTab === 'new' ? 'var(--color-primary)' : 'var(--color-text-muted)',
            border: activeTab === 'new' ? '1px solid var(--color-border)' : '1px solid transparent',
            boxShadow: activeTab === 'new' ? 'var(--shadow-sm)' : 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <span>📥 New Requests (FIFO)</span>
          <span className="badge badge-primary">{newRequests.length}</span>
        </button>

        <button
          onClick={() => setActiveTab('re_requested')}
          style={{
            padding: '10px 16px',
            borderRadius: '8px',
            fontSize: '0.875rem',
            fontWeight: activeTab === 're_requested' ? '700' : '500',
            backgroundColor: activeTab === 're_requested' ? 'var(--color-surface)' : 'transparent',
            color: activeTab === 're_requested' ? 'var(--color-warning-text)' : 'var(--color-text-muted)',
            border: activeTab === 're_requested' ? '1px solid var(--color-warning-border)' : '1px solid transparent',
            boxShadow: activeTab === 're_requested' ? 'var(--shadow-sm)' : 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <span className="priority-pulse" style={{ display: 'inline-block' }}>⚡</span>
          <span>Re-Requested (Priority)</span>
          <span className="badge badge-warning">{reRequestedList.length}</span>
        </button>

        <button
          onClick={() => setActiveTab('offered')}
          style={{
            padding: '10px 16px',
            borderRadius: '8px',
            fontSize: '0.875rem',
            fontWeight: activeTab === 'offered' ? '700' : '500',
            backgroundColor: activeTab === 'offered' ? 'var(--color-surface)' : 'transparent',
            color: activeTab === 'offered' ? 'var(--color-primary)' : 'var(--color-text-muted)',
            border: activeTab === 'offered' ? '1px solid var(--color-border)' : '1px solid transparent',
            boxShadow: activeTab === 'offered' ? 'var(--shadow-sm)' : 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <span>⏳ Offers Awaiting Patient</span>
          <span className="badge badge-info">{offeredList.length}</span>
        </button>

        <button
          onClick={() => setActiveTab('expired')}
          style={{
            padding: '10px 16px',
            borderRadius: '8px',
            fontSize: '0.875rem',
            fontWeight: activeTab === 'expired' ? '700' : '500',
            backgroundColor: activeTab === 'expired' ? 'var(--color-surface)' : 'transparent',
            color: activeTab === 'expired' ? 'var(--color-danger)' : 'var(--color-text-muted)',
            border: activeTab === 'expired' ? '1px solid var(--color-border)' : '1px solid transparent',
            boxShadow: activeTab === 'expired' ? 'var(--shadow-sm)' : 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <span>⌛ Expired Offers</span>
          <span className="badge badge-danger">{expiredList.length}</span>
        </button>
      </div>

      {/* Cards Grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {currentTabList.map((req, idx) => (
          <div
            key={req.request_id}
            className="card"
            style={{
              padding: '20px 24px',
              borderLeft: req.status === 're_requested'
                ? '5px solid var(--color-warning)'
                : req.status === 'offer_expired'
                ? '5px solid var(--color-danger)'
                : req.status === 'slots_offered'
                ? '5px solid var(--color-info)'
                : '5px solid var(--color-primary)',
              position: 'relative'
            }}
          >
            {/* Top Row */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '14px',
              flexWrap: 'wrap',
              gap: '8px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{
                  fontSize: '0.8125rem',
                  fontWeight: '700',
                  color: 'var(--color-text-muted)',
                  fontFamily: 'monospace'
                }}>
                  #{idx + 1} • {req.request_id}
                </span>

                <span className={`badge badge-${req.channel === 'whatsapp' ? 'success' : req.channel === 'telegram' ? 'info' : 'purple'}`}>
                  {req.channel.toUpperCase()}
                </span>

                {req.patient_type === 'returning' ? (
                  <span className="badge badge-success">
                    Returning ({req.past_visits_count} visits)
                  </span>
                ) : (
                  <span className="badge badge-primary">New Patient</span>
                )}

                {req.status === 're_requested' && (
                  <span className="badge badge-warning priority-pulse" style={{ fontWeight: '700' }}>
                    ⚡ 1-Click Priority (Customer Recovery)
                  </span>
                )}
              </div>

              {/* Multi-Desk Receptionist Presence indicator */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {req.concurrent_review_by && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '0.75rem',
                    backgroundColor: 'var(--color-purple-bg)',
                    color: 'var(--color-purple-text)',
                    border: '1px solid var(--color-purple-border)',
                    padding: '3px 10px',
                    borderRadius: 'var(--radius-full)',
                    fontWeight: '600'
                  }}>
                    <EyeIcon size={12} color="var(--color-purple)" />
                    <span>👀 {req.concurrent_review_by} is reviewing</span>
                  </div>
                )}

                <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <ClockIcon size={13} color="var(--color-text-muted)" />
                  <span>Received: {new Date(req.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
            </div>

            {/* Middle Row Details */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '16px',
              marginBottom: '18px'
            }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: '600' }}>
                  Patient Name & Phone
                </div>
                <div style={{ fontWeight: '700', fontSize: '1.0625rem', color: 'var(--color-text-main)', marginTop: '2px' }}>
                  {req.patient_name}
                </div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                  {req.patient_phone}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: '600' }}>
                  Requested Service
                </div>
                <div style={{ fontWeight: '600', fontSize: '0.9375rem', color: 'var(--color-primary-dark)', marginTop: '2px' }}>
                  {req.service_name}
                </div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                  Preference: {req.preferred_doctor_name || 'Any Dentist'}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: '600' }}>
                  Preferred Dates / Window
                </div>
                <div style={{ fontWeight: '600', fontSize: '0.9375rem', marginTop: '2px' }}>
                  {req.preferred_dates ? req.preferred_dates.join(', ') : 'Open'}
                </div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', textTransform: 'capitalize', marginTop: '2px' }}>
                  Window: {req.preferred_time_window}
                </div>
              </div>

              {/* Status Specific Info */}
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: '600' }}>
                  Scheduling Status
                </div>
                {req.status === 'slots_offered' ? (
                  <div style={{ marginTop: '2px' }}>
                    <div className="badge badge-info" style={{ fontWeight: '700' }}>
                      ⏳ Offer Sent (35m left)
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                      Auto-expires at 60m
                    </div>
                  </div>
                ) : req.status === 'offer_expired' ? (
                  <div style={{ marginTop: '2px' }}>
                    <div className="badge badge-danger">
                      ⌛ Expired (Unselected)
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                      Re-engagement link delivered
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop: '2px' }}>
                    <div className="badge badge-primary">
                      Ready for Front Desk Review
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                      {req.suggested_slots?.length || 0} candidate slots calculated
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Action Row */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: '14px',
              borderTop: '1px solid var(--color-border)',
              flexWrap: 'wrap',
              gap: '10px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={() => openAskInfoDrawer(req)}
                  className="btn btn-secondary btn-sm"
                >
                  <MessageSquareIcon size={14} color="var(--color-primary)" />
                  💬 Ask for Info
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {req.status === 'offer_expired' ? (
                  <>
                    <button
                      onClick={() => reEngageExpired(req.request_id)}
                      className="btn btn-primary btn-sm"
                    >
                      <RefreshCwIcon size={14} color="white" />
                      Resend Fresh Available Times
                    </button>
                    <a
                      href={`tel:${req.patient_phone}`}
                      className="btn btn-secondary btn-sm"
                    >
                      <PhoneIcon size={14} color="var(--color-primary)" />
                      Call Patient Directly
                    </a>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => openReviewModal(req)}
                      className="btn btn-secondary btn-sm"
                    >
                      ⚡ Check & Modify Slots
                    </button>
                    <button
                      onClick={() => openReviewModal(req)}
                      className="btn btn-primary btn-sm"
                      style={{ boxShadow: '0 2px 6px rgba(14, 116, 144, 0.25)' }}
                    >
                      <SendIcon size={14} color="white" />
                      Review & Approve Dispatch
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}

        {currentTabList.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: '60px 20px',
            backgroundColor: 'var(--color-surface)',
            borderRadius: '16px',
            border: '1px dashed var(--color-border)'
          }}>
            <div style={{
              width: '50px',
              height: '50px',
              borderRadius: '50%',
              backgroundColor: 'var(--color-surface-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 12px'
            }}>
              <CheckCircleIcon size={24} color="var(--color-success)" />
            </div>
            <h3 style={{ fontSize: '1.125rem', marginBottom: '6px' }}>No Requests in this tab</h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
              All patient requests have been processed or approved by front desk!
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
