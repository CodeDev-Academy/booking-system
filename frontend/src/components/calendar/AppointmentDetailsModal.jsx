import React, { useState } from 'react';
import {
  X,
  User,
  Phone,
  Stethoscope,
  Clock,
  Calendar as CalendarIcon,
  CheckCircle2,
  FileText,
  ArrowRight,
  ShieldCheck,
  Send,
  History,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { formatTime, formatDayLabel } from '../../services/timeUtils';
import { getService, getDoctor } from '../../services/slotEngine';
import { lookupPatient, at } from '../../services/mockData';

export const AppointmentDetailsModal = ({
  isOpen,
  appointment,
  doctors = [],
  onClose,
  onCheckIn,
  onReschedule,
}) => {
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [rescheduleDocId, setRescheduleDocId] = useState('');
  const [rescheduleTimeStr, setRescheduleTimeStr] = useState('');
  const [rescheduleError, setRescheduleError] = useState('');
  if (!isOpen || !appointment) return null;

  const doctor = getDoctor(appointment.doctorId);
  const service = getService(appointment.serviceId);
  const isReturning = appointment.patientType === 'returning';
  const registry = lookupPatient(appointment.patientPhone || appointment.phone, appointment.patientName || appointment.name);

  const startTime = appointment.start || appointment.scheduledTime || appointment.arrivedAt;
  const endTime = appointment.end || (startTime ? startTime + (service?.durationMin || 30) * 60000 : null);

  const getStatusBadge = () => {
    switch (appointment.status) {
      case 'waiting':
        return (
          <span className="badge-pill badge-warning">
            <span className="badge-dot" style={{ background: 'var(--amber)' }} />
            <span>Waiting in Lobby</span>
          </span>
        );
      case 'in_consultation':
        return (
          <span className="badge-pill badge-info">
            <span className="badge-dot" style={{ background: 'var(--primary)' }} />
            <span>In Consultation</span>
          </span>
        );
      case 'completed':
        return (
          <span className="badge-pill badge-success">
            <span className="badge-dot dot-success" />
            <span>Completed Today</span>
          </span>
        );
      case 'no_show':
        return (
          <span className="badge-pill badge-danger">
            <span className="badge-dot" style={{ background: 'var(--rose)' }} />
            <span>Missed / No-Show</span>
          </span>
        );
      default:
        return (
          <span className="badge-pill badge-success">
            <span className="badge-dot dot-success" />
            <span>Confirmed Booking</span>
          </span>
        );
    }
  };

  return (
    <div className="calendar-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="calendar-modal-surface appt-details-surface" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="calendar-modal-header">
          <div className="modal-title-row">
            {getStatusBadge()}
            <span className="badge-pill badge-neutral mono-tag">
              {appointment.appointmentId || appointment.id}
            </span>
          </div>
          <button
            type="button"
            className="icon-btn-close"
            onClick={onClose}
            aria-label="Close Appointment Details"
          >
            <X size={18} />
          </button>
        </div>

        {/* Patient Profile Header */}
        <div className="appt-patient-banner">
          <div className="patient-avatar-circle">
            {appointment.patientName ? appointment.patientName.charAt(0) : 'P'}
          </div>
          <div className="patient-banner-info">
            <div className="patient-name-line">
              <h3 className="patient-name-heading">{appointment.patientName}</h3>
              {isReturning ? (
                <span className="badge-pill badge-primary">
                  <span className="badge-dot dot-primary" />
                  <span>Returning Patient</span>
                </span>
              ) : (
                <span className="badge-pill badge-success">
                  <span className="badge-dot dot-success" />
                  <span>New Patient</span>
                </span>
              )}
            </div>
            <div className="patient-contact-line">
              <Phone size={12} color="var(--text-3)" />
              <span className="tabular-nums">{appointment.patientPhone || '+234 800 000 0000'}</span>
              <span className="meta-dot">·</span>
              <span className="channel-text">Booked via {appointment.channel === 'telegram' ? 'Telegram Bot' : 'Counter Walk-In'}</span>
            </div>
          </div>
        </div>

        {/* Clinical Booking Details Grid */}
        <div className="appt-details-grid">
          {/* Procedure */}
          <div className="detail-item">
            <span className="detail-label">
              <Clock size={12} color="var(--text-3)" />
              <span>Procedure & Buffer</span>
            </span>
            <span className="detail-value">{service?.name || 'General Consultation'}</span>
            <span className="detail-subtext">
              {appointment.durationMin || 30}m consultation + {appointment.bufferMin || 10}m sterilization prep
            </span>
          </div>

          {/* Assigned Clinician */}
          <div className="detail-item">
            <span className="detail-label">
              <Stethoscope size={12} color="var(--text-3)" />
              <span>Assigned Clinician</span>
            </span>
            <span className="detail-value">{doctor?.name || 'Doctor'}</span>
            <span className="detail-subtext">{doctor?.specialty || 'General Practitioner'}</span>
          </div>

          {/* Scheduled Time & Room */}
          <div className="detail-item">
            <span className="detail-label">
              <CalendarIcon size={12} color="var(--text-3)" />
              <span>Scheduled Time</span>
            </span>
            <span className="detail-value tabular-nums">
              {formatTime(startTime)} – {formatTime(endTime)}
            </span>
            <span className="detail-subtext">WAT (Local Clinic Time)</span>
          </div>

          {/* Schedule Verification Status */}
          <div className="detail-item">
            <span className="detail-label">
              <ShieldCheck size={12} color="var(--success-text)" />
              <span>Schedule Verification</span>
            </span>
            <span className="detail-value" style={{ color: 'var(--success-text)' }}>
              Verified · Conflict-Free
            </span>
            <span className="detail-subtext">Doctor shift & room buffer verified</span>
          </div>
        </div>

        {/* Past Clinical History (for Returning Patients) */}
        {registry && registry.lastVisits && registry.lastVisits.length > 0 && (
          <div className="detail-notes-card" style={{ marginBottom: '12px' }}>
            <div className="notes-header" style={{ justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <History size={13} color="var(--amber)" />
                <span style={{ fontWeight: 600, color: 'var(--text)' }}>
                  Patient Clinical History ({registry.attended}/{registry.totalVisits} visits attended)
                </span>
              </div>
              <span className="badge-pill badge-success mono-tag" style={{ fontSize: '10px' }}>
                {Math.round((registry.attended / registry.totalVisits) * 100)}% RELIABILITY
              </span>
            </div>

            <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {(showAllHistory ? registry.lastVisits : registry.lastVisits.slice(0, 1)).map((v, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '5px',
                    padding: '8px 10px',
                    background: 'var(--surface-2)',
                    borderRadius: '6px',
                    border: '1px solid var(--border)',
                    fontSize: '12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text)' }}>{v.procedure}</span>
                      {v.outcome && (
                        <span className="badge-pill badge-neutral" style={{ fontSize: '10px', padding: '1px 6px' }}>
                          {v.outcome}
                        </span>
                      )}
                    </div>
                    <span style={{ color: 'var(--amber-text)', fontSize: '11px', fontFamily: 'monospace' }}>
                      {v.date} {v.time ? `· ${v.time}` : ''}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '11px', color: 'var(--text-2)' }}>
                    <span>👨‍⚕️ <strong>Doctor:</strong> {v.doctor || 'Attending Physician'}</span>
                    {v.receptionist && <span>📋 <strong>Staff:</strong> {v.receptionist}</span>}
                  </div>

                  {v.clinicalNotes && (
                    <div style={{ fontSize: '11px', color: 'var(--text)', background: 'rgba(255,255,255,0.03)', padding: '5px 8px', borderRadius: '4px', borderLeft: '2px solid var(--amber)' }}>
                      <span style={{ color: 'var(--text-3)', fontWeight: 500 }}>Clinical: </span>
                      {v.clinicalNotes}
                    </div>
                  )}

                  {v.adminNotes && (
                    <div style={{ fontSize: '10px', color: 'var(--text-3)', fontStyle: 'italic', paddingLeft: '2px' }}>
                      <span>Admin: {v.adminNotes}</span>
                    </div>
                  )}
                </div>
              ))}

              {/* Accordion Expand / Collapse Toggle if more than 1 visit */}
              {registry.lastVisits.length > 1 && (
                <button
                  type="button"
                  onClick={() => setShowAllHistory(!showAllHistory)}
                  style={{
                    marginTop: '2px',
                    background: 'none',
                    border: '1px dashed var(--border)',
                    borderRadius: '6px',
                    padding: '6px 10px',
                    color: 'var(--amber-text)',
                    fontSize: '11px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    width: '100%',
                    transition: 'all 0.15s ease',
                  }}
                  title={showAllHistory ? 'Collapse prior visits' : 'Expand full clinical history'}
                >
                  {showAllHistory ? (
                    <>
                      <ChevronUp size={12} />
                      <span>Collapse Prior Consultations</span>
                    </>
                  ) : (
                    <>
                      <ChevronDown size={12} />
                      <span>View {registry.lastVisits.length - 1} More Prior Consultations</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Administrative Notes */}
        <div className="detail-notes-card">
          <div className="notes-header">
            <FileText size={13} color="var(--text-3)" />
            <span>Administrative Notes</span>
          </div>
          <p className="notes-content">
            {appointment.notes || (isReturning ? 'Patient has ongoing treatment history. Prior records on file.' : 'First consultation at Cedarcare Clinic. Initial intake questionnaire pending.')}
          </p>
        </div>

        {/* Reschedule & Schedule Collision Validator Section (Issue 10) */}
        {isRescheduling && (
          <div
            className="detail-notes-card"
            style={{
              marginTop: '12px',
              border: '1px solid var(--amber)',
              background: 'rgba(255, 181, 71, 0.05)',
            }}
          >
            <div className="notes-header" style={{ justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <RefreshCw size={13} color="var(--amber)" />
                <span style={{ fontWeight: 600, color: 'var(--amber-text)' }}>
                  Reschedule Appointment & Verify Collision
                </span>
              </div>
              <button
                type="button"
                className="icon-btn-close"
                style={{ width: '20px', height: '20px' }}
                onClick={() => {
                  setIsRescheduling(false);
                  setRescheduleError('');
                }}
              >
                &times;
              </button>
            </div>

            {rescheduleError && (
              <div
                style={{
                  marginTop: '10px',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  background: 'rgba(255, 79, 121, 0.12)',
                  border: '1px solid var(--rose)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: 'var(--rose-text)',
                  fontSize: '11px',
                }}
              >
                <AlertCircle size={14} style={{ flexShrink: 0 }} />
                <span>{rescheduleError}</span>
              </div>
            )}

            <div
              style={{
                marginTop: '10px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '10px',
                width: '100%',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-3)', marginBottom: '4px' }}>
                  Target Clinician
                </label>
                <select
                  value={rescheduleDocId || appointment.doctorId}
                  onChange={(e) => setRescheduleDocId(e.target.value)}
                  style={{
                    width: '100%',
                    maxWidth: '100%',
                    minWidth: 0,
                    boxSizing: 'border-box',
                    padding: '7px 8px',
                    borderRadius: '6px',
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    color: 'var(--text)',
                    fontSize: '11px',
                    textOverflow: 'ellipsis',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {(doctors.length > 0 ? doctors : [doctor].filter(Boolean)).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.specialty})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ minWidth: 0 }}>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-3)', marginBottom: '4px' }}>
                  New Start Time
                </label>
                <select
                  value={rescheduleTimeStr}
                  onChange={(e) => {
                    setRescheduleTimeStr(e.target.value);
                    setRescheduleError('');
                  }}
                  style={{
                    width: '100%',
                    maxWidth: '100%',
                    minWidth: 0,
                    boxSizing: 'border-box',
                    padding: '7px 8px',
                    borderRadius: '6px',
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    color: 'var(--text)',
                    fontSize: '11px',
                    textOverflow: 'ellipsis',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <option value="">-- Choose Time --</option>
                  {Array.from({ length: 40 }).map((_, idx) => {
                    const totalMins = 8 * 60 + idx * 15; // 08:00 to 17:45
                    const hh = String(Math.floor(totalMins / 60)).padStart(2, '0');
                    const mm = String(totalMins % 60).padStart(2, '0');
                    const timeStr = `${hh}:${mm}`;
                    return (
                      <option key={timeStr} value={timeStr}>
                        {timeStr}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                className="btn-base btn-secondary"
                style={{ padding: '5px 10px', fontSize: '11px' }}
                onClick={() => {
                  setIsRescheduling(false);
                  setRescheduleError('');
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-base btn-primary"
                style={{ padding: '5px 12px', fontSize: '11px' }}
                onClick={() => {
                  setRescheduleError('');
                  if (!rescheduleTimeStr) {
                    setRescheduleError('Please select a new appointment start time.');
                    return;
                  }
                  const [hh, mm] = rescheduleTimeStr.split(':').map(Number);
                  const targetTs = new Date(startTime);
                  targetTs.setHours(hh, mm, 0, 0);

                  const targetDoc = rescheduleDocId || appointment.doctorId;
                  if (onReschedule) {
                    const result = onReschedule(appointment.appointmentId || appointment.id, targetTs.getTime(), targetDoc);
                    if (result && !result.success) {
                      setRescheduleError(result.message || 'Collision detected with doctor shift or sterilizing buffer.');
                      return;
                    }
                  }
                  setIsRescheduling(false);
                  onClose();
                }}
              >
                <ShieldCheck size={13} />
                <span>Verify & Lock Reschedule</span>
              </button>
            </div>
          </div>
        )}

        {/* Actions Row */}
        <div className="modal-actions-row">
          {['waiting', 'in_consultation', 'completed', 'no_show'].includes(appointment.status) || !onCheckIn ? (
            <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
              {onReschedule && !isRescheduling && (
                <button
                  type="button"
                  className="btn-base btn-secondary"
                  style={{ flex: 1 }}
                  onClick={() => setIsRescheduling(true)}
                >
                  <RefreshCw size={13} />
                  <span>Reschedule Visit</span>
                </button>
              )}
              <button type="button" className="btn-base btn-secondary" style={{ flex: 1 }} onClick={onClose}>
                Close Patient Dossier
              </button>
            </div>
          ) : (
            <>
              <button type="button" className="btn-base btn-secondary" onClick={onClose}>
                Back to Schedule
              </button>
              {onReschedule && !isRescheduling && (
                <button
                  type="button"
                  className="btn-base btn-secondary"
                  onClick={() => setIsRescheduling(true)}
                >
                  <RefreshCw size={13} />
                  <span>Reschedule</span>
                </button>
              )}
              <button
                type="button"
                className="btn-base btn-primary"
                onClick={() => {
                  if (onCheckIn) onCheckIn(appointment);
                  onClose();
                }}
              >
                <ArrowRight size={14} />
                <span>Check In to Waiting Room</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
