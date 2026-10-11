import React, { useState } from 'react';
import { XIcon, CheckCircleIcon } from '../common/Icons';
import { INITIAL_DOCTORS } from '../../utils/mockData';

export const FollowUpCompletionModal = ({
  appointment,
  isOpen,
  onClose,
  onCompleteWithFollowUp,
  doctors = []
}) => {
  if (!isOpen || !appointment) return null;

  const doctorList = doctors.length > 0 ? doctors : INITIAL_DOCTORS;
  const [requireFollowUp, setRequireFollowUp] = useState(true);
  const [doctorId, setDoctorId] = useState(appointment.doctor_id || doctorList[0]?.id || 'doc-uuid-1');
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
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-glass-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '540px' }}>
        {/* Header */}
        <div style={{
          padding: '24px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', color: '#ffffff', margin: 0 }}>Finalize Consultation Visit</h2>
            <p style={{ fontSize: '0.75rem', color: '#8e8e93', margin: 0, marginTop: '2px' }}>
              {appointment.patient_name} • {appointment.service_name}
            </p>
          </div>
          <button onClick={onClose} style={{ color: '#8e8e93', padding: '6px' }}>
            <XIcon size={18} color="currentColor" />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{
            backgroundColor: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 'var(--radius-md)',
            padding: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div>
              <div style={{ fontWeight: '600', fontSize: '0.9375rem', color: '#ffffff' }}>
                Require Doctor Follow-Up Visit?
              </div>
              <div style={{ fontSize: '0.75rem', color: '#8e8e93' }}>
                Auto-schedules automated WhatsApp/SMS check-ins.
              </div>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '8px' }}>
              <input
                type="checkbox"
                checked={requireFollowUp}
                onChange={(e) => setRequireFollowUp(e.target.checked)}
                style={{ width: '18px', height: '18px', accentColor: 'var(--color-accent-orange)' }}
              />
              <span style={{ fontWeight: '600', fontSize: '0.875rem', color: '#ffffff' }}>Yes</span>
            </label>
          </div>

          {requireFollowUp && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label className="form-label">Quick Follow-Up Window:</label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
                  {[
                    { label: '+1 Week', days: 7 },
                    { label: '+2 Weeks', days: 14 },
                    { label: '+1 Month', days: 30 }
                  ].map(btn => (
                    <button
                      key={btn.label}
                      type="button"
                      onClick={() => handleQuickDays(btn.days)}
                      className="btn-pill btn-pill-glass"
                      style={{ padding: '6px 14px', fontSize: '0.75rem' }}
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Target Date</label>
                  <input
                    type="date"
                    className="form-control-glass"
                    value={followUpDate}
                    onChange={(e) => setFollowUpDate(e.target.value)}
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Doctor</label>
                  <select
                    className="form-control-glass"
                    value={doctorId}
                    onChange={(e) => setDoctorId(e.target.value)}
                  >
                    {doctorList.map(d => (
                      <option key={d.id} value={d.id}>{d.name || d.full_name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Doctor Directions & Clinical Notes</label>
                <textarea
                  className="form-control-glass"
                  rows={3}
                  value={clinicalNotes}
                  onChange={(e) => setClinicalNotes(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '20px 24px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: '10px'
        }}>
          <button onClick={onClose} className="btn-pill btn-pill-glass">
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="btn-pill btn-pill-green"
          >
            <CheckCircleIcon size={16} color="currentColor" />
            <span>Complete Visit</span>
          </button>
        </div>
      </div>
    </div>
  );
};
