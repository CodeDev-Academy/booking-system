import React from 'react';
import {
  Clock,
  ArrowRight,
  CheckCircle2,
  Stethoscope,
  Phone,
  Tag,
  AlertCircle,
  HeartHandshake,
  CalendarCheck,
  UserX,
  FileText,
} from 'lucide-react';

/**
 * VisitCard — Uniform Bento Card Design Pattern
 * Aligned with PastPatientsHistory / Doctor Bento Cards:
 * - 48px Avatar with initials & soft pastel colors
 * - Clean name, phone & specialty tags
 * - Porcelain #f8fafc meta strip
 * - Midnight navy pill action buttons (#0c1a30)
 */
export const VisitCard = ({
  visit,
  onSendToConsultation,
  onOpenFollowUp,
  onMarkNoShow,
  onOpenWelfare,
  onSelectPatient,
  onReinstateVisit,
}) => {
  const {
    id,
    patientName,
    patientPhone,
    patientType,
    doctor,
    service,
    roomName,
    status,
    waitTimerStr,
    waitUrgency,
    consultTimerStr,
    consultProgressPct,
    isOvertime,
    scheduledTimeStr,
    arrivedTimeStr,
    completedTimeStr,
    followUp,
    welfareSent,
  } = visit;

  const initials = (patientName || 'Patient')
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const isReturning = patientType === 'returning';

  return (
    <div
      className="bento-visit-card"
      onClick={() => onSelectPatient && onSelectPatient(visit)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelectPatient && onSelectPatient(visit);
        }
      }}
      title={`Click to view patient profile & clinical history for ${patientName}`}
    >
      {/* 1. Top Info Row: Avatar + Name + Type Tag */}
      <div className="bento-visit-info-row">
        <div
          className="bento-visit-avatar"
          style={{
            background: isReturning ? '#e0f2fe' : '#fef3c7',
            color: isReturning ? '#0369a1' : '#b45309',
          }}
        >
          {initials}
        </div>

        <div className="bento-visit-text">
          <div className="bento-visit-header-line">
            <span className="bento-visit-name">{patientName}</span>
            {visit.isEmergency && (
              <span
                className="event-type-pill"
                style={{
                  background: 'rgba(255, 79, 121, 0.15)',
                  color: 'var(--rose)',
                  border: '1px solid rgba(255, 79, 121, 0.3)',
                  fontWeight: 700,
                  fontSize: '9px',
                }}
              >
                🚨 URGENT
              </span>
            )}
            <span
              className={`event-type-pill ${isReturning ? 'returning' : 'new'}`}
            >
              {isReturning ? 'RETURNING' : 'NEW'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="bento-visit-phone">{patientPhone}</span>
            {visit.gender && (
              <>
                <span style={{ fontSize: '10px', color: '#94a3b8' }}>&bull;</span>
                <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>{visit.gender}</span>
              </>
            )}
          </div>
          <span className="bento-visit-service-tag">
            {service?.name || 'Consultation'} &bull; {doctor?.name || 'Doctor'}
          </span>
        </div>
      </div>

      {/* 2. Middle Meta Strip: Status & Timers */}
      <div className="bento-visit-meta-strip">
        {/* Waiting Lobby */}
        {status === 'waiting' && (
          <>
            <div className="bento-meta-item">
              <span className="bento-meta-label">Waiting in Lobby:</span>
              <span
                className="bento-meta-val"
                style={{
                  color:
                    waitUrgency === 'danger'
                      ? '#e11d48'
                      : waitUrgency === 'amber'
                      ? '#d97706'
                      : '#16a34a',
                  fontWeight: 700,
                }}
              >
                <Clock size={11} style={{ display: 'inline', marginRight: '4px' }} />
                {waitTimerStr}
              </span>
            </div>
            <div className="bento-meta-item">
              <span className="bento-meta-label">Scheduled Time:</span>
              <span className="bento-meta-val">{scheduledTimeStr || 'Today'}</span>
            </div>
          </>
        )}

        {/* In Consultation */}
        {status === 'in_consultation' && (
          <>
            <div className="bento-meta-item">
              <span className="bento-meta-label" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span className="duty-dot duty-dot-pulse" style={{ background: '#10b981' }} />
                In Consultation:
              </span>
              <span className="bento-meta-val" style={{ color: '#0f172a', fontWeight: 700 }}>
                {consultTimerStr} / {service?.durationMin || 30}m
              </span>
            </div>

            {/* Subtle Progress Bar */}
            <div
              style={{
                width: '100%',
                height: '4px',
                background: '#e2e8f0',
                borderRadius: '2px',
                overflow: 'hidden',
                margin: '2px 0',
              }}
            >
              <div
                style={{
                  width: `${consultProgressPct}%`,
                  height: '100%',
                  background: isOvertime ? '#f43f5e' : '#10b981',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>

            <div className="bento-meta-item">
              <span className="bento-meta-label">Location:</span>
              <span className="bento-meta-val">{roomName || 'Consultation Suite'}</span>
            </div>
          </>
        )}

        {/* Completed */}
        {status === 'completed' && (
          <>
            <div className="bento-meta-item">
              <span className="bento-meta-label">Completed at:</span>
              <span className="bento-meta-val" style={{ color: '#16a34a', fontWeight: 600 }}>
                {completedTimeStr || 'Discharged'}
              </span>
            </div>
            <div className="bento-meta-item">
              <span className="bento-meta-label">Clinical Recall:</span>
              <span className="bento-meta-val">
                {followUp ? `${followUp.preset} (${followUp.targetDate})` : 'Routine Discharge'}
              </span>
            </div>
          </>
        )}

        {/* No-Show */}
        {status === 'no_show' && (
          <>
            <div className="bento-meta-item">
              <span className="bento-meta-label">Status:</span>
              <span className="bento-meta-val" style={{ color: '#e11d48', fontWeight: 600 }}>
                Absent / Did Not Arrive
              </span>
            </div>
            <div className="bento-meta-item">
              <span className="bento-meta-label">Welfare Notice:</span>
              <span className="bento-meta-val">
                {welfareSent ? '✓ Sent' : 'Pending Message'}
              </span>
            </div>
          </>
        )}
      </div>

      {/* 3. Bottom Action Footer */}
      <div className="bento-visit-actions">
        {status === 'waiting' && (
          <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
            <button
              type="button"
              className="bento-visit-secondary-btn"
              onClick={(e) => {
                e.stopPropagation();
                onMarkNoShow(id);
              }}
              title="Mark patient absent"
            >
              <UserX size={12} />
              <span>No-Show</span>
            </button>

            <button
              type="button"
              className="bento-visit-primary-btn"
              onClick={(e) => {
                e.stopPropagation();
                onSendToConsultation(id);
              }}
              title="Doctor is ready — admit patient to room"
            >
              <span>Call into Room</span>
              <ArrowRight size={13} />
            </button>
          </div>
        )}

        {status === 'in_consultation' && (
          <button
            type="button"
            className="bento-visit-primary-btn"
            style={{ width: '100%', background: '#0c1a30' }}
            onClick={(e) => {
              e.stopPropagation();
              onOpenFollowUp(id);
            }}
            title="Conclude visit and log recall"
          >
            <CheckCircle2 size={13} color="#38bdf8" />
            <span>Finish Visit &amp; Recall</span>
          </button>
        )}

        {status === 'completed' && (
          <button
            type="button"
            className="bento-visit-primary-btn"
            style={{ width: '100%' }}
            onClick={(e) => {
              e.stopPropagation();
              onSelectPatient && onSelectPatient(visit);
            }}
            title="View complete clinical dossier"
          >
            <FileText size={13} />
            <span>View Patient Dossier</span>
          </button>
        )}

        {status === 'no_show' && (
          <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
            <button
              type="button"
              className="bento-visit-secondary-btn"
              onClick={(e) => {
                e.stopPropagation();
                onReinstateVisit && onReinstateVisit(id);
              }}
            >
              <span>Patient Arrived</span>
            </button>

            {!welfareSent && (
              <button
                type="button"
                className="bento-visit-primary-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenWelfare(id);
                }}
              >
                <HeartHandshake size={13} />
                <span>Send Welfare</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
