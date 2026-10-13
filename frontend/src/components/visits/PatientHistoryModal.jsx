import React, { useMemo } from 'react';
import {
  XIcon,
  ClockIcon,
  PhoneIcon,
  CheckCircleIcon,
  UserCheckIcon,
  UserIcon
} from '../common/Icons';

export const PatientHistoryModal = ({
  patientName,
  isOpen,
  onClose,
  allAppointments = []
}) => {
  if (!isOpen || !patientName) return null;

  // Filter all visits for this specific patient
  const patientVisits = useMemo(() => {
    return allAppointments
      .filter(a => a.patient_name?.toLowerCase() === patientName.toLowerCase())
      .sort((a, b) => new Date(b.date || b.start_datetime || 0) - new Date(a.date || a.start_datetime || 0));
  }, [allAppointments, patientName]);

  const phone = patientVisits[0]?.patient_phone || 'No phone recorded';

  // Metrics for this specific patient
  const completedVisits = patientVisits.filter(v => v.status === 'completed');
  const noShowVisits = patientVisits.filter(v => v.status === 'no_show');
  const cancelledVisits = patientVisits.filter(v => v.status === 'cancelled');

  // Unique doctors seen
  const doctorsSeen = Array.from(new Set(patientVisits.map(v => v.doctor_name).filter(Boolean)));

  const getStatusBadge = (status) => {
    switch (status) {
      case 'completed':
        return (
          <span className="glass-badge" style={{
            backgroundColor: 'rgba(118, 226, 67, 0.15)',
            color: 'var(--color-accent-green)',
            border: '1px solid rgba(118, 226, 67, 0.3)',
            fontSize: '0.6875rem'
          }}>
            ✓ Completed Visit
          </span>
        );
      case 'no_show':
        return (
          <span className="glass-badge" style={{
            backgroundColor: 'rgba(255, 77, 109, 0.15)',
            color: 'var(--color-accent-coral)',
            border: '1px solid rgba(255, 77, 109, 0.3)',
            fontSize: '0.6875rem'
          }}>
            ✕ Missed / No-Show
          </span>
        );
      case 'cancelled':
        return (
          <span className="glass-badge" style={{
            backgroundColor: 'rgba(255, 107, 0, 0.15)',
            color: 'var(--color-accent-orange)',
            border: '1px solid rgba(255, 107, 0, 0.3)',
            fontSize: '0.6875rem'
          }}>
            ⚠ Cancelled
          </span>
        );
      case 'in_consultation':
        return (
          <span className="glass-badge glass-badge-green" style={{ fontSize: '0.6875rem' }}>
            ● Inside Consultation
          </span>
        );
      case 'arrived':
        return (
          <span className="glass-badge glass-badge-orange" style={{ fontSize: '0.6875rem' }}>
            ● Waiting in Clinic
          </span>
        );
      default:
        return (
          <span className="glass-badge" style={{ fontSize: '0.6875rem' }}>
            {status}
          </span>
        );
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-glass-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '680px',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0
        }}>
          <div>
            <div style={{
              fontSize: '0.6875rem',
              textTransform: 'uppercase',
              color: 'var(--color-accent-orange)',
              fontWeight: '700',
              letterSpacing: '0.04em'
            }}>
              Patient Medical Journey & History
            </div>
            <h2 style={{ fontSize: '1.25rem', color: '#ffffff', margin: '2px 0 0' }}>
              {patientName}
            </h2>
          </div>
          <button onClick={onClose} style={{ color: '#8e8e93', padding: '4px' }}>
            <XIcon size={18} color="currentColor" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div style={{
          padding: '20px 24px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px'
        }}>
          {/* Patient Overview Summary Strip */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: '10px'
          }}>
            <div style={{
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              borderRadius: 'var(--radius-md)',
              padding: '10px 14px',
              border: '1px solid rgba(255, 255, 255, 0.06)'
            }}>
              <div style={{ fontSize: '0.6875rem', color: '#8e8e93', textTransform: 'uppercase', fontWeight: '700' }}>
                Total Visits
              </div>
              <div style={{ fontSize: '1.375rem', fontWeight: '800', color: '#ffffff', marginTop: '2px' }}>
                {patientVisits.length}
              </div>
            </div>

            <div style={{
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              borderRadius: 'var(--radius-md)',
              padding: '10px 14px',
              border: '1px solid rgba(255, 255, 255, 0.06)'
            }}>
              <div style={{ fontSize: '0.6875rem', color: '#8e8e93', textTransform: 'uppercase', fontWeight: '700' }}>
                Completed
              </div>
              <div style={{ fontSize: '1.375rem', fontWeight: '800', color: 'var(--color-accent-green)', marginTop: '2px' }}>
                {completedVisits.length}
              </div>
            </div>

            <div style={{
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              borderRadius: 'var(--radius-md)',
              padding: '10px 14px',
              border: '1px solid rgba(255, 255, 255, 0.06)'
            }}>
              <div style={{ fontSize: '0.6875rem', color: '#8e8e93', textTransform: 'uppercase', fontWeight: '700' }}>
                Missed (No-Show)
              </div>
              <div style={{ fontSize: '1.375rem', fontWeight: '800', color: 'var(--color-accent-coral)', marginTop: '2px' }}>
                {noShowVisits.length}
              </div>
            </div>

            <div style={{
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              borderRadius: 'var(--radius-md)',
              padding: '10px 14px',
              border: '1px solid rgba(255, 255, 255, 0.06)'
            }}>
              <div style={{ fontSize: '0.6875rem', color: '#8e8e93', textTransform: 'uppercase', fontWeight: '700' }}>
                Cancelled
              </div>
              <div style={{ fontSize: '1.375rem', fontWeight: '800', color: 'var(--color-accent-orange)', marginTop: '2px' }}>
                {cancelledVisits.length}
              </div>
            </div>
          </div>

          {/* Contact & Doctors Seen Metadata */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px',
            padding: '10px 14px',
            backgroundColor: 'rgba(255, 255, 255, 0.02)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.8125rem',
            border: '1px solid rgba(255, 255, 255, 0.05)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#8e8e93' }}>
              <PhoneIcon size={13} color="#8e8e93" />
              <span style={{ color: '#ffffff', fontWeight: '600' }}>{phone}</span>
            </div>

            {doctorsSeen.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#8e8e93' }}>
                <span>Doctors Seen:</span>
                <span style={{ color: '#ffffff', fontWeight: '500' }}>{doctorsSeen.join(', ')}</span>
              </div>
            )}
          </div>

          {/* Chronological Timeline */}
          <div>
            <div style={{
              fontSize: '0.75rem',
              fontWeight: '700',
              color: '#8e8e93',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              marginBottom: '10px'
            }}>
              Complete Visit Timeline ({patientVisits.length} Records)
            </div>

            {patientVisits.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#8e8e93', fontSize: '0.8125rem' }}>
                No historical appointments on file for this patient.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {patientVisits.map((visit, index) => {
                  const isCompleted = visit.status === 'completed';
                  const isNoShow = visit.status === 'no_show';
                  const isCancelled = visit.status === 'cancelled';

                  return (
                    <div
                      key={visit.appointment_id || index}
                      style={{
                        backgroundColor: 'rgba(255, 255, 255, 0.02)',
                        borderRadius: 'var(--radius-md)',
                        padding: '14px 16px',
                        border: '1px solid rgba(255, 255, 255, 0.06)',
                        borderLeft: isCompleted
                          ? '3px solid var(--color-accent-green)'
                          : isNoShow
                          ? '3px solid var(--color-accent-coral)'
                          : isCancelled
                          ? '3px solid var(--color-accent-orange)'
                          : '3px solid rgba(255, 255, 255, 0.15)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                      }}
                    >
                      {/* Top Row: Date, Time, Status */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{
                            fontSize: '0.75rem',
                            fontWeight: '700',
                            color: '#ffffff',
                            backgroundColor: 'rgba(255, 255, 255, 0.06)',
                            padding: '3px 8px',
                            borderRadius: 'var(--radius-sm)'
                          }}>
                            {visit.date || 'Today'}
                          </span>
                          <span style={{ fontSize: '0.8125rem', color: '#8e8e93' }}>
                            {visit.time_label || 'Scheduled Time'}
                          </span>
                        </div>

                        {getStatusBadge(visit.status)}
                      </div>

                      {/* Doctor & Service Line */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8125rem' }}>
                        <span style={{ color: 'var(--color-accent-orange)', fontWeight: '600' }}>
                          {visit.service_name}
                        </span>
                        <span style={{ color: '#8e8e93' }}>•</span>
                        <span style={{ color: '#ffffff' }}>
                          Doctor: {visit.doctor_name}
                        </span>
                        {visit.room && (
                          <>
                            <span style={{ color: '#8e8e93' }}>•</span>
                            <span style={{ color: '#8e8e93' }}>{visit.room}</span>
                          </>
                        )}
                      </div>

                      {/* Clinical Notes & Details */}
                      {visit.notes && (
                        <div style={{
                          fontSize: '0.75rem',
                          color: '#cccccc',
                          backgroundColor: 'rgba(0, 0, 0, 0.2)',
                          padding: '8px 10px',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid rgba(255, 255, 255, 0.04)'
                        }}>
                          <strong style={{ color: '#8e8e93' }}>Clinical Summary: </strong>
                          {visit.notes}
                        </div>
                      )}

                      {/* Recall follow up */}
                      {visit.follow_up_scheduled && visit.follow_up_scheduled !== 'None required' && (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '0.6875rem',
                          color: 'var(--color-accent-teal)',
                          backgroundColor: 'rgba(6, 182, 212, 0.08)',
                          padding: '4px 8px',
                          borderRadius: 'var(--radius-sm)',
                          width: 'fit-content'
                        }}>
                          <UserCheckIcon size={12} color="var(--color-accent-teal)" />
                          <span>Scheduled Recall: <strong>{visit.follow_up_scheduled}</strong></span>
                        </div>
                      )}

                      {/* Cancellation / Missed Reason */}
                      {visit.cancellation_reason && (
                        <div style={{
                          fontSize: '0.6875rem',
                          color: 'var(--color-accent-coral)',
                          backgroundColor: 'rgba(255, 77, 109, 0.08)',
                          padding: '4px 8px',
                          borderRadius: 'var(--radius-sm)',
                          width: 'fit-content'
                        }}>
                          Reason: <strong>{visit.cancellation_reason}</strong>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 24px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          justifyContent: 'flex-end',
          flexShrink: 0
        }}>
          <button onClick={onClose} className="btn-pill btn-pill-glass" style={{ padding: '8px 22px' }}>
            Close Dossier
          </button>
        </div>
      </div>
    </div>
  );
};
