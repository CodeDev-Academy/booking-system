import React, { useState } from 'react';
import { XIcon, CalendarIcon, CheckCircleIcon, StethoscopeIcon } from '../common/Icons';
import { INITIAL_DOCTORS } from '../../utils/mockData';

export const FollowUpCompletionModal = ({
  appointment,
  isOpen,
  onClose,
  onCompleteWithFollowUp
}) => {
  if (!isOpen || !appointment) return null;

  const [requireFollowUp, setRequireFollowUp] = useState(true);
  const [doctorId, setDoctorId] = useState(appointment.doctor_id || INITIAL_DOCTORS[0].id);

  // Set default follow-up date to 14 days from today
  const defaultDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const [followUpDate, setFollowUpDate] = useState(defaultDate);
  const [clinicalNotes, setClinicalNotes] = useState('Routine 2-week healing evaluation & stitch check.');

  const handleQuickDays = (days) => {
    const target = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    setFollowUpDate(target);
  };

  const handleSave = () => {
    onCompleteWithFollowUp(appointment.appointment_id, {
      requireFollowUp,
      followUpDate: requireFollowUp ? followUpDate : null,
      doctorId: requireFollowUp ? doctorId : null,
      notes: clinicalNotes
    });
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '560px' }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: 'var(--color-surface-subtle)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              backgroundColor: 'var(--color-success-bg)',
              color: 'var(--color-success-text)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <CheckCircleIcon size={20} color="var(--color-success)" />
            </div>
            <div>
              <h2 style={{ fontSize: '1.125rem', margin: 0 }}>Finalize Consultation Visit</h2>
              <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', margin: 0 }}>
                {appointment.patient_name} • {appointment.service_name}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn btn-ghost" style={{ padding: '6px' }}>
            <XIcon size={18} color="var(--color-text-muted)" />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Follow-up question banner */}
          <div style={{
            backgroundColor: 'var(--color-bg-app)',
            border: '1px solid var(--color-border)',
            borderRadius: '12px',
            padding: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div>
              <div style={{ fontWeight: '600', fontSize: '0.9375rem', color: 'var(--color-text-main)' }}>
                Does this patient require a doctor follow-up visit?
              </div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
                Auto-schedules automated SMS/WhatsApp reminders for the patient.
              </div>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '8px' }}>
              <input
                type="checkbox"
                checked={requireFollowUp}
                onChange={(e) => setRequireFollowUp(e.target.checked)}
                style={{ width: '18px', height: '18px', accentColor: 'var(--color-primary)' }}
              />
              <span style={{ fontWeight: '600', fontSize: '0.875rem' }}>Yes</span>
            </label>
          </div>

          {requireFollowUp && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Preset Quick Date Buttons */}
              <div>
                <label className="form-label">Recommended Follow-up Window:</label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
                  <button
                    type="button"
                    onClick={() => handleQuickDays(7)}
                    className="btn btn-secondary btn-sm"
                  >
                    + 1 Week
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickDays(14)}
                    className="btn btn-secondary btn-sm"
                  >
                    + 2 Weeks
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickDays(30)}
                    className="btn btn-secondary btn-sm"
                  >
                    + 1 Month
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickDays(90)}
                    className="btn btn-secondary btn-sm"
                  >
                    + 3 Months
                  </button>
                </div>
              </div>

              {/* Specific Date & Doctor */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Follow-up Target Date</label>
                  <input
                    type="date"
                    className="form-control"
                    value={followUpDate}
                    onChange={(e) => setFollowUpDate(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Assigned Doctor</label>
                  <select
                    className="form-control"
                    value={doctorId}
                    onChange={(e) => setDoctorId(e.target.value)}
                  >
                    {INITIAL_DOCTORS.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Clinical Notes / Doctor Directions */}
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Doctor Directions & Clinical Notes</label>
                <textarea
                  className="form-control"
                  rows={3}
                  value={clinicalNotes}
                  onChange={(e) => setClinicalNotes(e.target.value)}
                  placeholder="e.g. Check gum healing, assess bite alignment, prescribe mouthwash refill."
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: '10px',
          backgroundColor: '#ffffff'
        }}>
          <button onClick={onClose} className="btn btn-secondary">
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="btn btn-success btn-lg"
            style={{ minWidth: '160px' }}
          >
            <CheckCircleIcon size={18} color="white" />
            Complete Visit
          </button>
        </div>
      </div>
    </div>
  );
};
