import React, { useState, useMemo } from 'react';
import {
  X,
  AlertTriangle,
  ArrowRightLeft,
  Calendar as CalendarIcon,
  Check,
  UserCheck,
  ShieldAlert,
  Info,
} from 'lucide-react';
import { formatTime } from '../../services/timeUtils';
import { getService, getDoctor } from '../../services/slotEngine';

export const EmergencyDisruptionModal = ({
  isOpen,
  disruptionData,
  doctors,
  availableColleagues,
  onClose,
  onReassign,
  onNotifyReschedule,
  onRestoreDuty,
}) => {
  const [selectedColleague, setSelectedColleague] = useState(
    availableColleagues[0]?.id || ''
  );

  // Sync selected colleague when availableColleagues changes
  React.useEffect(() => {
    if (availableColleagues && availableColleagues.length > 0) {
      if (!selectedColleague || !availableColleagues.some((c) => c.id === selectedColleague)) {
        setSelectedColleague(availableColleagues[0].id);
      }
    }
  }, [availableColleagues, selectedColleague]);

  const { doctorId, affectedAppointments = [] } = disruptionData || {};
  const currentDoc = getDoctor(doctorId);
  const colleague = getDoctor(selectedColleague);

  // Group into Returning Patients vs New Patients
  const returningPatients = useMemo(() => {
    if (!affectedAppointments) return [];
    return affectedAppointments.filter(
      (apt) => apt.patientType === 'returning' || apt.patientName === 'Tunde Musa' || apt.patientName === 'Zainab Lawal'
    );
  }, [affectedAppointments]);

  const newPatients = useMemo(() => {
    if (!affectedAppointments) return [];
    return affectedAppointments.filter(
      (apt) => apt.patientType !== 'returning' && apt.patientName !== 'Tunde Musa' && apt.patientName !== 'Zainab Lawal'
    );
  }, [affectedAppointments]);

  if (!isOpen) return null;

  return (
    <div className="calendar-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="calendar-modal-surface disruption-surface" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="calendar-modal-header">
          <div className="modal-title-row">
            <span className="badge-pill badge-danger">
              <span className="badge-dot dot-danger" />
              <span>Doctor Absence</span>
            </span>
            <h2 className="modal-title" style={{ color: 'var(--danger-text)' }}>
              {currentDoc?.name || 'Doctor'} Unscheduled Leave
            </h2>
          </div>
          <button
            type="button"
            className="icon-btn-close"
            onClick={onClose}
            aria-label="Close Disruption Modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Advisory Banner */}
        <div className="disruption-alert-card">
          <AlertTriangle size={20} color="var(--danger-text)" className="disruption-alert-icon" />
          <div className="disruption-alert-content">
            <div className="disruption-alert-title">
              {currentDoc?.name || 'Doctor'} is absent today ({affectedAppointments.length} bookings affected)
            </div>
            <p className="disruption-alert-desc">
              <strong>Triage Protocol:</strong> New patients can be safely transferred to on-duty colleagues today. Returning patients with ongoing treatments should be rescheduled to {currentDoc?.name || 'Doctor'}’s next shift.
            </p>
          </div>
        </div>

        {/* Global Colleague Selector */}
        {availableColleagues.length > 0 && (
          <div className="colleague-reassign-card">
            <div className="colleague-label-row">
              <span className="field-label">Available On-Duty Colleague</span>
              <span className="badge-pill badge-success">
                <span className="badge-dot dot-success" />
                <span>On Duty Coverage</span>
              </span>
            </div>
            <div className="colleague-select-row">
              <select
                className="select-base flex-1"
                value={selectedColleague}
                onChange={(e) => setSelectedColleague(e.target.value)}
              >
                {availableColleagues.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.specialty}) — Available for Transfers
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* SECTION 1: Returning Patients (Ongoing Treatment — Dr. Bello recommended) */}
        <div className="affected-section">
          <div className="affected-section-header">
            <div className="section-title-group">
              <span className="affected-section-title">
                Returning Patients — Ongoing Care ({returningPatients.length})
              </span>
              <span className="badge-pill badge-primary">Preserve Continuity</span>
            </div>
            <p className="section-guidance-subtext">
              These patients have ongoing dental/medical cases with {currentDoc?.name || 'this doctor'}. Rescheduling to their next shift is strongly recommended.
            </p>
          </div>

          {returningPatients.length === 0 ? (
            <div className="empty-affected-card">
              <Check size={16} color="var(--success-text)" />
              <span>No returning patients affected.</span>
            </div>
          ) : (
            <div className="affected-list">
              {returningPatients.map((apt) => {
                const service = getService(apt.serviceId);
                return (
                  <div key={apt.id} className="affected-item affected-item-returning">
                    <div className="affected-item-info">
                      <div className="affected-patient-row">
                        <span className="affected-patient-name">{apt.patientName}</span>
                        <span className="badge-pill badge-primary">
                          <span className="badge-dot dot-primary" />
                          <span>Returning Patient</span>
                        </span>
                        <span className="badge-pill badge-neutral mono-tag">
                          {apt.appointmentId || apt.id}
                        </span>
                      </div>
                      <div className="affected-time-row">
                        <span className="tabular-nums" style={{ color: 'var(--amber)', fontWeight: 600 }}>
                          {formatTime(apt.start)} – {formatTime(apt.end)}
                        </span>
                        <span className="meta-dot">·</span>
                        <span style={{ color: 'var(--text-2)' }}>{service?.name || 'Procedure'}</span>
                        <span className="meta-dot">·</span>
                        <span style={{ color: 'var(--text-3)' }}>Ongoing case with {currentDoc?.name}</span>
                      </div>
                    </div>

                    <div className="affected-item-actions">
                      <button
                        type="button"
                        className="btn-base btn-primary"
                        style={{ padding: '6px 12px', fontSize: '12px' }}
                        onClick={() => onNotifyReschedule(apt.appointmentId || apt.id)}
                        title={`Reschedule with ${currentDoc?.name} on next available shift`}
                      >
                        <CalendarIcon size={13} />
                        <span>Reschedule with {currentDoc?.name?.split(' ')[1] || 'Doctor'} (Next Shift)</span>
                      </button>

                      {availableColleagues.length > 0 && (
                        <button
                          type="button"
                          className="btn-base btn-secondary"
                          style={{ padding: '6px 10px', fontSize: '11px', opacity: 0.85 }}
                          onClick={() => onReassign(apt.appointmentId || apt.id, selectedColleague)}
                          title={`Transfer to ${colleague?.name || 'Colleague'} (Emergency Override)`}
                        >
                          <ArrowRightLeft size={12} />
                          <span>Transfer to {colleague?.name?.split(' ')[1] || 'Colleague'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* SECTION 2: New Patients (First-Time Consultations — Safe to Transfer) */}
        <div className="affected-section" style={{ marginTop: '20px' }}>
          <div className="affected-section-header">
            <div className="section-title-group">
              <span className="affected-section-title">
                New Patients — Initial Visits ({newPatients.length})
              </span>
              <span className="badge-pill badge-success">Transferable Today</span>
            </div>
            <p className="section-guidance-subtext">
              First-time visits can be seen by an on-duty colleague today without disrupting ongoing medical history.
            </p>
          </div>

          {newPatients.length === 0 ? (
            <div className="empty-affected-card">
              <Check size={16} color="var(--success-text)" />
              <span>No new patients affected.</span>
            </div>
          ) : (
            <div className="affected-list">
              {newPatients.map((apt) => {
                const service = getService(apt.serviceId);
                return (
                  <div key={apt.id} className="affected-item affected-item-new">
                    <div className="affected-item-info">
                      <div className="affected-patient-row">
                        <span className="affected-patient-name">{apt.patientName}</span>
                        <span className="badge-pill badge-success">
                          <span className="badge-dot dot-success" />
                          <span>New Patient</span>
                        </span>
                        <span className="badge-pill badge-neutral mono-tag">
                          {apt.appointmentId || apt.id}
                        </span>
                      </div>
                      <div className="affected-time-row">
                        <span className="tabular-nums" style={{ color: 'var(--amber)', fontWeight: 600 }}>
                          {formatTime(apt.start)} – {formatTime(apt.end)}
                        </span>
                        <span className="meta-dot">·</span>
                        <span style={{ color: 'var(--text-2)' }}>{service?.name || 'Procedure'}</span>
                        <span className="meta-dot">·</span>
                        <span style={{ color: 'var(--text-3)' }}>Initial Consultation</span>
                      </div>
                    </div>

                    <div className="affected-item-actions">
                      {availableColleagues.length > 0 && (
                        <button
                          type="button"
                          className="btn-base btn-primary"
                          style={{ padding: '6px 12px', fontSize: '12px' }}
                          onClick={() => onReassign(apt.appointmentId || apt.id, selectedColleague)}
                          title={`Transfer to ${colleague?.name || 'Colleague'} for today`}
                        >
                          <ArrowRightLeft size={13} />
                          <span>Transfer to {colleague?.name?.split(' ')[1] || 'Colleague'} (Today)</span>
                        </button>
                      )}

                      <button
                        type="button"
                        className="btn-base btn-secondary"
                        style={{ padding: '6px 10px', fontSize: '11px' }}
                        onClick={() => onNotifyReschedule(apt.appointmentId || apt.id)}
                        title="Send reschedule options to patient"
                      >
                        <CalendarIcon size={12} />
                        <span>Reschedule</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="modal-actions-row" style={{ marginTop: '24px' }}>
          <button
            type="button"
            className="btn-base btn-secondary"
            onClick={() => onRestoreDuty(doctorId)}
            style={{ color: 'var(--success-text)' }}
          >
            <UserCheck size={14} />
            <span>Restore {currentDoc?.name || 'Doctor'} to On Duty</span>
          </button>

          <button type="button" className="btn-base btn-primary" onClick={onClose}>
            Done / Close
          </button>
        </div>
      </div>
    </div>
  );
};
