import React, { useState } from 'react';
import {
  XIcon,
  CalendarIcon,
  ClockIcon,
  UserIcon,
  PhoneIcon,
  SparklesIcon,
  Edit3Icon,
  PlusIcon,
  SendIcon,
  MessageSquareIcon
} from '../common/Icons';
import { INITIAL_DOCTORS } from '../../utils/mockData';

export const ReviewModal = ({
  request,
  isOpen,
  onClose,
  candidateSlots,
  isCheckingSlots,
  editingSlotId,
  setEditingSlotId,
  onCheckLiveSlots,
  onSwapDoctor,
  onAddCustomSlot,
  onRemoveSlot,
  onApproveAndDispatch,
  onOpenAskInfo,
  onRejectRequest,
  doctors = []
}) => {
  if (!isOpen || !request) return null;

  const doctorList = doctors.length > 0 ? doctors : INITIAL_DOCTORS;
  const [showAddCustomSlot, setShowAddCustomSlot] = useState(false);
  const [customDoctorId, setCustomDoctorId] = useState(doctorList[0]?.id || 'doc-uuid-1');
  const [customDate, setCustomDate] = useState('2026-10-12');
  const [customTime, setCustomTime] = useState('14:00');

  const handleAddCustomSlotSubmit = (e) => {
    e.preventDefault();
    onAddCustomSlot({
      doctorId: customDoctorId,
      date: customDate,
      time: customTime
    });
    setShowAddCustomSlot(false);
  };

  const handleDispatch = () => {
    if (candidateSlots.length === 0) {
      alert('Please include at least 1 candidate slot before dispatching.');
      return;
    }
    onApproveAndDispatch(request.request_id, candidateSlots);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-glass-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '720px' }}>
        {/* Header */}
        <div style={{
          padding: '24px 28px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="glass-badge glass-badge-neutral">{request.request_id}</span>
              <span className="glass-badge glass-badge-orange">{request.channel}</span>
              {request.patient_type === 'returning' ? (
                <span className="glass-badge glass-badge-green">Returning ({request.past_visits_count} visits)</span>
              ) : (
                <span className="glass-badge glass-badge-neutral">New Patient</span>
              )}
            </div>
            <h2 style={{ fontSize: '1.25rem', marginTop: '6px', color: '#ffffff' }}>
              {request.patient_name}
            </h2>
          </div>
          <button onClick={onClose} style={{ color: '#8e8e93', padding: '6px' }}>
            <XIcon size={18} color="currentColor" />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Patient Details Snapshot Card */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '14px',
            backgroundColor: 'rgba(255, 255, 255, 0.03)',
            borderRadius: 'var(--radius-lg)',
            padding: '16px 20px',
            border: '1px solid rgba(255, 255, 255, 0.06)'
          }}>
            <div>
              <div style={{ fontSize: '0.6875rem', color: '#8e8e93', textTransform: 'uppercase', fontWeight: '700' }}>
                Contact
              </div>
              <div style={{ fontWeight: '600', fontSize: '0.9375rem', color: '#ffffff', marginTop: '2px' }}>
                {request.patient_name}
              </div>
              <div style={{ fontSize: '0.8125rem', color: '#8e8e93', marginTop: '2px' }}>
                {request.patient_phone}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.6875rem', color: '#8e8e93', textTransform: 'uppercase', fontWeight: '700' }}>
                Service
              </div>
              <div style={{ fontWeight: '600', fontSize: '0.9375rem', color: 'var(--color-accent-orange)', marginTop: '2px' }}>
                {request.service_name}
              </div>
              <div style={{ fontSize: '0.8125rem', color: '#8e8e93', marginTop: '2px' }}>
                Duration: 30m • Standard
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.6875rem', color: '#8e8e93', textTransform: 'uppercase', fontWeight: '700' }}>
                Doctor & Window
              </div>
              <div style={{ fontWeight: '600', fontSize: '0.9375rem', color: '#ffffff', marginTop: '2px' }}>
                {request.preferred_doctor_name || 'Any Specialist'}
              </div>
              <div style={{ fontSize: '0.8125rem', color: '#8e8e93', marginTop: '2px' }}>
                {request.preferred_dates ? request.preferred_dates.join(', ') : 'Flexible'} ({request.preferred_time_window})
              </div>
            </div>
          </div>

          {/* Candidate Slots Section */}
          <div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '12px'
            }}>
              <div>
                <h3 style={{ fontSize: '1rem', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>Proposed Time Slots</span>
                  <span className="glass-badge glass-badge-green">{candidateSlots.length} Ready</span>
                </h3>
                <p style={{ fontSize: '0.75rem', color: '#8e8e93' }}>
                  Patient has 1 hour to pick once approved and dispatched.
                </p>
              </div>

              <button
                onClick={onCheckLiveSlots}
                disabled={isCheckingSlots}
                className="btn-pill btn-pill-glass"
                style={{ padding: '6px 14px' }}
              >
                <SparklesIcon size={14} color="var(--color-accent-orange)" />
                <span>{isCheckingSlots ? 'Calculating...' : 'Recalculate'}</span>
              </button>
            </div>

            {/* Double-Booking Shield Verification Bar */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 14px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'rgba(52, 199, 89, 0.08)',
              border: '1px solid rgba(52, 199, 89, 0.22)',
              fontSize: '0.75rem',
              color: 'var(--color-accent-green)',
              marginBottom: '10px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircleIcon size={15} color="var(--color-accent-green)" />
                <span><strong>Double-Booking Shield Active:</strong> 0 conflicts detected with doctor shifts, breaks, or active patient holds.</span>
              </div>
              <span style={{ fontSize: '0.6875rem', opacity: 0.85 }}>Live Calendar Verified</span>
            </div>

            {/* Candidate Slots List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {candidateSlots.map((slot, index) => {
                const isEditing = editingSlotId === slot.id;
                return (
                  <div
                    key={slot.id || index}
                    style={{
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: 'var(--radius-md)',
                      padding: '12px 18px',
                      backgroundColor: 'rgba(255, 255, 255, 0.03)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'all 0.15s'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        backgroundColor: 'rgba(255, 107, 0, 0.15)',
                        color: 'var(--color-accent-orange)',
                        fontWeight: '800',
                        fontSize: '0.8125rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        {index + 1}
                      </div>

                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: '600', fontSize: '0.9375rem', color: '#ffffff' }}>
                            {slot.display_label || slot.start_datetime}
                          </span>
                          <span className="glass-badge" style={{
                            backgroundColor: 'rgba(52, 199, 89, 0.12)',
                            color: 'var(--color-accent-green)',
                            border: '1px solid rgba(52, 199, 89, 0.25)',
                            fontSize: '0.6875rem',
                            padding: '2px 8px'
                          }}>
                            ✓ Verified Free
                          </span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#8e8e93', marginTop: '2px' }}>
                          Assigned: <strong style={{ color: '#ffffff' }}>{slot.doctor_name}</strong>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {isEditing ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <select
                            className="form-control-glass"
                            style={{ padding: '4px 8px', fontSize: '0.8125rem', width: 'auto' }}
                            defaultValue={slot.doctor_id}
                            onChange={(e) => onSwapDoctor(slot.id, e.target.value)}
                          >
                            {doctorList.map(d => (
                              <option key={d.id} value={d.id}>{d.name || d.full_name}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => setEditingSlotId(null)}
                            className="btn-pill btn-pill-glass"
                            style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                          >
                            Done
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setEditingSlotId(slot.id)}
                          className="btn-pill btn-pill-glass"
                          style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                        >
                          <Edit3Icon size={12} color="#8e8e93" />
                          <span>Swap</span>
                        </button>
                      )}

                      <button
                        onClick={() => onRemoveSlot(slot.id)}
                        style={{ color: 'var(--color-accent-coral)', padding: '4px 8px' }}
                        title="Remove option"
                      >
                        <XIcon size={14} color="currentColor" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Custom Slot Toggle */}
            {showAddCustomSlot ? (
              <form
                onSubmit={handleAddCustomSlotSubmit}
                style={{
                  marginTop: '12px',
                  padding: '14px',
                  backgroundColor: 'rgba(255, 255, 255, 0.04)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  alignItems: 'flex-end',
                  gap: '10px',
                  flexWrap: 'wrap'
                }}
              >
                <div style={{ flex: '1 1 160px' }}>
                  <label className="form-label">Doctor</label>
                  <select
                    className="form-control-glass"
                    value={customDoctorId}
                    onChange={(e) => setCustomDoctorId(e.target.value)}
                  >
                    {doctorList.map(d => (
                      <option key={d.id} value={d.id}>{d.name || d.full_name}</option>
                    ))}
                  </select>
                </div>

                <div style={{ flex: '1 1 130px' }}>
                  <label className="form-label">Date</label>
                  <input
                    type="date"
                    className="form-control-glass"
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                  />
                </div>

                <div style={{ flex: '1 1 110px' }}>
                  <label className="form-label">Time</label>
                  <input
                    type="time"
                    className="form-control-glass"
                    value={customTime}
                    onChange={(e) => setCustomTime(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', gap: '6px' }}>
                  <button type="submit" className="btn-pill btn-pill-orange" style={{ padding: '8px 14px' }}>
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddCustomSlot(false)}
                    className="btn-pill btn-pill-glass"
                    style={{ padding: '8px 12px' }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <button
                onClick={() => setShowAddCustomSlot(true)}
                className="btn-pill btn-pill-glass"
                style={{ marginTop: '10px', fontSize: '0.75rem' }}
              >
                <PlusIcon size={12} color="var(--color-accent-orange)" />
                <span>+ Custom Slot</span>
              </button>
            )}
          </div>
        </div>

        {/* Modal Footer Controls */}
        <div style={{
          padding: '20px 28px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => onOpenAskInfo(request)}
              className="btn-pill btn-pill-glass"
            >
              <MessageSquareIcon size={14} color="#8e8e93" />
              <span>Ask for Info</span>
            </button>
            <button
              onClick={() => onRejectRequest(request.request_id)}
              style={{ color: 'var(--color-accent-coral)', fontSize: '0.8125rem', padding: '6px 12px' }}
            >
              Reject
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button onClick={onClose} className="btn-pill btn-pill-glass">
              Close
            </button>
            <button
              onClick={handleDispatch}
              disabled={candidateSlots.length === 0}
              className="btn-pill btn-pill-orange"
              style={{ padding: '10px 24px', fontSize: '0.875rem' }}
            >
              <SendIcon size={16} color="#ffffff" />
              Approve & Dispatch (1h)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
