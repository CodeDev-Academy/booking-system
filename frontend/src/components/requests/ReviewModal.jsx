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
  onRejectRequest
}) => {
  if (!isOpen || !request) return null;

  // Local form state solely for the inline "+ Add Custom Slot" inputs
  const [showAddCustomSlot, setShowAddCustomSlot] = useState(false);
  const [customDoctorId, setCustomDoctorId] = useState(INITIAL_DOCTORS[0].id);
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
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '780px' }}>
        {/* Header */}
        <div style={{
          padding: '20px 28px',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: 'var(--color-surface-subtle)'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="badge badge-primary">{request.request_id}</span>
              <span className={`badge badge-${request.channel === 'whatsapp' ? 'success' : request.channel === 'telegram' ? 'info' : 'purple'}`}>
                {request.channel.toUpperCase()}
              </span>
              {request.patient_type === 'returning' ? (
                <span className="badge badge-success">Returning Patient ({request.past_visits_count} visits)</span>
              ) : (
                <span className="badge badge-primary">First-Time Patient</span>
              )}
            </div>
            <h2 style={{ fontSize: '1.25rem', marginTop: '6px', margin: '6px 0 0' }}>
              Review Booking Request: {request.patient_name}
            </h2>
          </div>
          <button onClick={onClose} className="btn btn-ghost" style={{ padding: '8px' }}>
            <XIcon size={20} color="var(--color-text-muted)" />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '22px' }}>
          {/* Patient Profile & Request Details Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '14px',
            backgroundColor: 'var(--color-bg-app)',
            borderRadius: '12px',
            padding: '16px',
            border: '1px solid var(--color-border)'
          }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: '600' }}>
                Patient Contact
              </div>
              <div style={{ fontWeight: '600', fontSize: '0.9375rem', marginTop: '3px' }}>
                {request.patient_name}
              </div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                <PhoneIcon size={13} color="var(--color-primary)" />
                {request.patient_phone}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: '600' }}>
                Requested Service
              </div>
              <div style={{ fontWeight: '600', fontSize: '0.9375rem', marginTop: '3px' }}>
                {request.service_name}
              </div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                Duration: 30–45 mins • Standard Rate
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: '600' }}>
                Doctor & Date Preferences
              </div>
              <div style={{ fontWeight: '600', fontSize: '0.9375rem', marginTop: '3px' }}>
                {request.preferred_doctor_name || 'Any Available Specialist'}
              </div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                Dates: {request.preferred_dates ? request.preferred_dates.join(', ') : 'Flexible'} ({request.preferred_time_window})
              </div>
            </div>
          </div>

          {/* Past History Drawer if Returning */}
          {request.patient_type === 'returning' && (
            <div style={{
              backgroundColor: 'var(--color-info-bg)',
              border: '1px solid var(--color-info-border)',
              borderRadius: '10px',
              padding: '10px 14px',
              fontSize: '0.8125rem',
              color: 'var(--color-info-text)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div>
                <strong>Clinical History:</strong> Patient has {request.past_visits_count} previous appointments at MedPulse. Last seen: {request.last_visit || '2 months ago'}.
              </div>
              <span className="badge badge-info">Zero No-Shows</span>
            </div>
          )}

          {/* Candidate Slots Section */}
          <div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '12px'
            }}>
              <div>
                <h3 style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>Proposed Candidate Slots</span>
                  <span className="badge badge-primary">{candidateSlots.length} Ready</span>
                </h3>
                <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                  Options sent to patient will be valid for 1 hour. Edit or swap doctors before approving.
                </p>
              </div>

              <button
                onClick={onCheckLiveSlots}
                disabled={isCheckingSlots}
                className="btn btn-secondary btn-sm"
              >
                <SparklesIcon size={14} color="var(--color-primary)" />
                {isCheckingSlots ? 'Recalculating...' : 'Check Live Slots'}
              </button>
            </div>

            {/* Candidate Slots List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {candidateSlots.map((slot, index) => {
                const isEditing = editingSlotId === slot.id;
                return (
                  <div
                    key={slot.id || index}
                    style={{
                      border: '1px solid var(--color-border)',
                      borderRadius: '12px',
                      padding: '12px 16px',
                      backgroundColor: 'var(--color-surface)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      boxShadow: 'var(--shadow-sm)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        backgroundColor: 'var(--color-primary-light)',
                        color: 'var(--color-primary-dark)',
                        fontWeight: '700',
                        fontSize: '0.8125rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        {index + 1}
                      </div>

                      <div>
                        <div style={{ fontWeight: '600', fontSize: '0.9375rem', color: 'var(--color-text-main)' }}>
                          {slot.display_label || slot.start_datetime}
                        </div>
                        <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <UserIcon size={13} color="var(--color-primary)" />
                          <span>Assigned: <strong>{slot.doctor_name}</strong></span>
                        </div>
                      </div>
                    </div>

                    {/* Actions for this Slot */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {isEditing ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <select
                            className="form-control"
                            style={{ padding: '4px 8px', fontSize: '0.8125rem', width: 'auto' }}
                            defaultValue={slot.doctor_id}
                            onChange={(e) => onSwapDoctor(slot.id, e.target.value)}
                          >
                            {INITIAL_DOCTORS.map(d => (
                              <option key={d.id} value={d.id}>{d.name} ({d.specialty})</option>
                            ))}
                          </select>
                          <button
                            onClick={() => setEditingSlotId(null)}
                            className="btn btn-ghost btn-sm"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setEditingSlotId(slot.id)}
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                        >
                          <Edit3Icon size={13} color="var(--color-text-muted)" />
                          Swap Doctor
                        </button>
                      )}

                      <button
                        onClick={() => onRemoveSlot(slot.id)}
                        className="btn btn-ghost btn-sm"
                        style={{ color: 'var(--color-danger)', padding: '4px 8px' }}
                        title="Remove option"
                      >
                        <XIcon size={14} color="var(--color-danger)" />
                      </button>
                    </div>
                  </div>
                );
              })}

              {candidateSlots.length === 0 && (
                <div style={{
                  padding: '24px',
                  textAlign: 'center',
                  backgroundColor: 'var(--color-bg-app)',
                  borderRadius: '12px',
                  border: '1px dashed var(--color-border)',
                  color: 'var(--color-text-muted)',
                  fontSize: '0.875rem'
                }}>
                  No candidate slots selected. Click <strong>"Check Live Slots"</strong> or add a custom slot below.
                </div>
              )}
            </div>

            {/* Add Custom Slot Drawer/Form */}
            {showAddCustomSlot ? (
              <form
                onSubmit={handleAddCustomSlotSubmit}
                style={{
                  marginTop: '12px',
                  padding: '14px',
                  backgroundColor: 'var(--color-surface-subtle)',
                  borderRadius: '12px',
                  border: '1px solid var(--color-border)',
                  display: 'flex',
                  alignItems: 'flex-end',
                  gap: '12px',
                  flexWrap: 'wrap'
                }}
              >
                <div style={{ flex: '1 1 180px' }}>
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>Doctor</label>
                  <select
                    className="form-control"
                    value={customDoctorId}
                    onChange={(e) => setCustomDoctorId(e.target.value)}
                  >
                    {INITIAL_DOCTORS.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>

                <div style={{ flex: '1 1 140px' }}>
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>Date</label>
                  <input
                    type="date"
                    className="form-control"
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                  />
                </div>

                <div style={{ flex: '1 1 120px' }}>
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>Start Time</label>
                  <input
                    type="time"
                    className="form-control"
                    value={customTime}
                    onChange={(e) => setCustomTime(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', gap: '6px' }}>
                  <button type="submit" className="btn btn-primary btn-sm">
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddCustomSlot(false)}
                    className="btn btn-secondary btn-sm"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <button
                onClick={() => setShowAddCustomSlot(true)}
                className="btn btn-ghost btn-sm"
                style={{ marginTop: '10px', color: 'var(--color-primary)', fontWeight: '600' }}
              >
                <PlusIcon size={14} color="var(--color-primary)" />
                + Add Custom Time Slot
              </button>
            )}
          </div>
        </div>

        {/* Modal Footer Controls */}
        <div style={{
          padding: '18px 28px',
          borderTop: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: '#ffffff'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => onOpenAskInfo(request)}
              className="btn btn-secondary"
            >
              <MessageSquareIcon size={15} color="var(--color-primary)" />
              Ask for Info
            </button>
            <button
              onClick={() => onRejectRequest(request.request_id)}
              className="btn btn-ghost"
              style={{ color: 'var(--color-danger)' }}
            >
              Reject
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button onClick={onClose} className="btn btn-secondary">
              Close
            </button>
            <button
              onClick={handleDispatch}
              disabled={candidateSlots.length === 0}
              className="btn btn-primary btn-lg"
              style={{ boxShadow: '0 4px 14px rgba(14, 116, 144, 0.35)' }}
            >
              <SendIcon size={18} color="white" />
              Approve & Dispatch Options (1-Hour Expiry)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
