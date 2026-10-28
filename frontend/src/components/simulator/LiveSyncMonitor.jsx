import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Zap,
  Volume2,
  ShieldCheck,
  ArrowRight,
  RotateCcw,
  Sparkles,
  Timer,
  CheckCircle2,
  ExternalLink,
  Calendar,
  Activity,
  AlertTriangle,
  Clock,
  Send,
} from 'lucide-react';
import { SERVICES, TIME_WINDOWS } from '../../services/mockData';
import { getDoctor, getService } from '../../services/slotEngine';
import { formatDayLabel, formatTime } from '../../services/timeUtils';

export const LiveSyncMonitor = ({
  stage = 'intake',
  activeRequest,
  offeredSlots = [],
  remainingOfferSeconds = 3600,
  confirmedAppointment,
  syncLatencyMs,
  onApproveAndDispatch,
  onSimulateExpiry,
  onReset,
}) => {
  const navigate = useNavigate();

  const service = activeRequest && getService(activeRequest.serviceId);
  const timeWindowInfo = activeRequest && TIME_WINDOWS[activeRequest.timeWindow];

  const formatTimer = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="sync-monitor-card">
      {/* Header */}
      <div className="sync-monitor-header">
        <div className="sync-header-left">
          <div className="sync-pulse-badge">
            <span className="sync-dot-live pulse" />
            <span className="sync-live-text">BIDIRECTIONAL SYNC ACTIVE</span>
          </div>
          <h3 className="sync-title">Receptionist Triage &amp; Schedule Monitor</h3>
          <p className="sync-subtitle">
            Experience the real-time receptionist approval loop. Every patient booking is triaged and approved before entering the clinic calendar.
          </p>
        </div>

        <button
          type="button"
          className="btn-ghost-sm"
          onClick={onReset}
          title="Reset simulator demo"
        >
          <RotateCcw size={13} style={{ marginRight: '5px' }} />
          Reset Demo
        </button>
      </div>

      {/* Real-Time Metrics Strip */}
      <div className="sync-kpi-grid">
        <div className="sync-kpi-card">
          <div className="sync-kpi-label">
            <span>Sync Latency</span>
            <Zap size={13} color="var(--amber)" />
          </div>
          <div className="sync-kpi-value tabular-nums">
            {syncLatencyMs ? `${syncLatencyMs}ms` : '< 110ms'}
          </div>
          <div className="sync-kpi-subtext">Instant WebSocket / SSE bridge</div>
        </div>

        <div className="sync-kpi-card">
          <div className="sync-kpi-label">
            <span>Front-Desk Bell</span>
            <Volume2 size={13} color="var(--success-text)" />
          </div>
          <div className="sync-kpi-value">Instant Chime</div>
          <div className="sync-kpi-subtext">Web Audio two-tone bell (587Hz &rarr; 880Hz)</div>
        </div>

        <div className="sync-kpi-card">
          <div className="sync-kpi-label">
            <span>Gatekeeping Shield</span>
            <ShieldCheck size={13} color="var(--info)" />
          </div>
          <div className="sync-kpi-value">100% Guarded</div>
          <div className="sync-kpi-subtext">Zero unreviewed calendar writes</div>
        </div>
      </div>

      {/* Dynamic Intake Stage Cards */}

      {/* STAGE: INTAKE (Awaiting Patient Input) */}
      {stage === 'intake' && (
        <div className="injected-placeholder-card">
          <Sparkles size={24} color="var(--amber)" />
          <div className="placeholder-text-group">
            <h4 className="placeholder-title">Awaiting Phone Intake Submission</h4>
            <p className="placeholder-desc">
              Tap <strong>"Submit to Reception Desk"</strong> on the simulated mobile device or chat with the Telegram bot to test the instant front-desk chime and card injection.
            </p>
          </div>
        </div>
      )}

      {/* STAGE: WAITING REVIEW (Request Injected, Waiting Front Desk Approval) */}
      {stage === 'waiting_review' && activeRequest && (
        <div className="injected-request-card">
          <div className="injected-card-header">
            <div className="injected-status-group">
              <span className="badge-pill badge-ember mono-tag">⚡ INTAKE RECEIVED</span>
              <span className="injected-code mono-tag">{activeRequest.code}</span>
            </div>
            <span className="injected-channel-tag mono-tag">
              CHANNEL: {activeRequest.channel.toUpperCase()}
            </span>
          </div>

          <div className="injected-details-grid">
            <div>
              <div className="detail-label">Patient Name</div>
              <div className="detail-value">{activeRequest.patientName}</div>
            </div>
            <div>
              <div className="detail-label">Phone (E.164)</div>
              <div className="detail-value tabular-nums">{activeRequest.phone}</div>
            </div>
            <div>
              <div className="detail-label">Requested Treatment</div>
              <div className="detail-value">
                {service ? `${service.name} (${service.durationMin}m)` : 'Dental Consultation (30m)'}
              </div>
            </div>
            <div>
              <div className="detail-label">Preferred Window</div>
              <div className="detail-value text-capitalize">
                {timeWindowInfo?.label || activeRequest.timeWindow}
              </div>
            </div>
          </div>

          {/* Action Callouts */}
          <div className="injected-action-group">
            <button
              id="btn-quick-dispatch"
              type="button"
              className="btn-quick-dispatch"
              onClick={onApproveAndDispatch}
            >
              <Send size={15} style={{ marginRight: '6px' }} />
              <span>⚡ 1-Click Front Desk Review &amp; Dispatch 3 Slots</span>
            </button>

            <button
              type="button"
              className="btn-review-now"
              onClick={() => navigate('/queue')}
            >
              <span>Open in Full Triage Queue View</span>
              <ArrowRight size={14} style={{ marginLeft: '6px' }} />
            </button>
          </div>

          <span className="injected-helper-tip">
            Click <strong>"1-Click Review &amp; Dispatch"</strong> to simulate receptionist approval and dispatch 3 candidate slots to the patient's phone.
          </span>
        </div>
      )}

      {/* STAGE: SLOTS OFFERED (Candidate Slots Sent to Patient Phone) */}
      {stage === 'slots_offered' && activeRequest && (
        <div className="injected-request-card offer-active-border">
          <div className="injected-card-header">
            <div className="injected-status-group">
              <span className="badge-pill badge-amber mono-tag">⏳ 60-MIN OFFER WINDOW ACTIVE</span>
              <span className="injected-code mono-tag">{activeRequest.code}</span>
            </div>
            <span className="injected-timer-tag mono-tag tabular-nums">
              <Clock size={11} style={{ marginRight: '3px', display: 'inline' }} />
              {formatTimer(remainingOfferSeconds)} remaining
            </span>
          </div>

          <div className="monitor-offered-slots-box">
            <div className="monitor-box-title">
              Approved Slots Currently on Patient Phone:
            </div>
            <div className="monitor-slots-list">
              {offeredSlots.map((slot, i) => {
                const doc = getDoctor(slot.doctorId);
                return (
                  <div key={slot.id || i} className="monitor-slot-row">
                    <span className="monitor-slot-num">Option {i + 1}</span>
                    <span className="monitor-slot-time tabular-nums">
                      {formatDayLabel(slot.start)} @ {formatTime(slot.start)}
                    </span>
                    <span className="monitor-slot-doc">
                      {doc?.name || 'Doctor'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="injected-action-group" style={{ marginTop: '12px' }}>
            <button
              id="btn-simulate-expiry"
              type="button"
              className="btn-secondary-action"
              onClick={onSimulateExpiry}
              title="Demonstrate 60m expiry and recovery message"
            >
              <AlertTriangle size={14} color="var(--amber)" style={{ marginRight: '6px' }} />
              <span>Simulate 60m Expiry &amp; Patient Recovery Flow</span>
            </button>
          </div>

          <span className="injected-helper-tip">
            👉 Tap any slot on the phone to complete patient selection, OR click <strong>"Simulate 60m Expiry"</strong> to test the patient recovery re-engagement.
          </span>
        </div>
      )}

      {/* STAGE: CONFIRMED (Appointment Booked & Committed) */}
      {stage === 'confirmed' && confirmedAppointment && (
        <div className="injected-request-card confirmed-active-border">
          <div className="injected-card-header">
            <div className="injected-status-group">
              <span className="badge-pill badge-ember mono-tag">🎉 APPOINTMENT FINALIZED</span>
              <span className="injected-code mono-tag">{confirmedAppointment.appointmentId}</span>
            </div>
            <span className="badge-pill badge-neutral mono-tag">
              COMMITTED TO DATABASE
            </span>
          </div>

          <div className="confirmed-summary-banner">
            <CheckCircle2 size={24} color="var(--success-text)" />
            <div>
              <div className="conf-summary-title">
                {confirmedAppointment.patientName} &bull; {confirmedAppointment.serviceName}
              </div>
              <div className="conf-summary-subtitle tabular-nums">
                {confirmedAppointment.dateLabel} at {confirmedAppointment.timeLabel} with {confirmedAppointment.doctorName} ({confirmedAppointment.roomName})
              </div>
            </div>
          </div>

          <div className="injected-action-group" style={{ marginTop: '14px' }}>
            <button
              type="button"
              className="btn-quick-dispatch"
              onClick={() => navigate('/calendar')}
            >
              <Calendar size={14} style={{ marginRight: '6px' }} />
              <span>View on Master Schedule Grid</span>
            </button>

            <button
              type="button"
              className="btn-review-now"
              onClick={() => navigate('/live-visits')}
            >
              <Activity size={14} style={{ marginRight: '6px' }} />
              <span>View in Live Waiting Room</span>
            </button>
          </div>

          <span className="injected-helper-tip">
            The booking is now visible across the clinic schedule, with 10-minute sterilization buffer and patient dossier attached.
          </span>
        </div>
      )}

      {/* STAGE: EXPIRED (Graceful Expiry Notice) */}
      {stage === 'expired' && activeRequest && (
        <div className="injected-request-card expired-active-border">
          <div className="injected-card-header">
            <div className="injected-status-group">
              <span className="badge-pill badge-neutral mono-tag">⚠️ OFFER EXPIRED</span>
              <span className="injected-code mono-tag">{activeRequest.code}</span>
            </div>
            <span className="badge-pill badge-amber mono-tag">
              RE-ENGAGEMENT DISPATCHED
            </span>
          </div>

          <div className="monitor-offered-slots-box">
            <div className="monitor-box-title">
              Patient Recovery Protocol (Section 4):
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-2)', margin: '4px 0 0 0', lineHeight: 1.4 }}>
              The 60-minute window elapsed. The request was moved to the <strong>"Expired Offers"</strong> queue. The patient's mobile phone received a supportive message with a 1-click <code>[Request Fresh Times]</code> button.
            </p>
          </div>

          <span className="injected-helper-tip">
            👉 Tap <strong>"Request Fresh Times from Reception"</strong> on the phone to see the request prioritized in the front-desk queue!
          </span>
        </div>
      )}

      {/* Agency Sales Pitch Highlights for Clinic Owners */}
      <div className="pitch-highlights-section">
        <h4 className="pitch-section-title">
          <CheckCircle2 size={14} color="var(--success-text)" />
          Agency Pitch Highlights: Why Clinics Buy This Template
        </h4>

        <div className="pitch-cards-grid">
          <div className="pitch-feature-card">
            <div className="feature-title-group">
              <ShieldCheck size={14} color="var(--ember)" />
              <span className="feature-name">Human-in-the-Loop Triage</span>
            </div>
            <p className="feature-desc">
              Eliminates patient scheduling errors and double-bookings. Front desk reviews and modifies proposed times before any offer reaches the patient.
            </p>
          </div>

          <div className="pitch-feature-card">
            <div className="feature-title-group">
              <Timer size={14} color="var(--amber)" />
              <span className="feature-name">60m Expiry &amp; Recovery</span>
            </div>
            <p className="feature-desc">
              Proposed times automatically expire after 1 hour with a 1-click <code>[🔄 See New Times]</code> recovery flow, preventing calendar hoarding.
            </p>
          </div>

          <div className="pitch-feature-card">
            <div className="feature-title-group">
              <ExternalLink size={14} color="var(--info)" />
              <span className="feature-name">Telegram &amp; WhatsApp Parity</span>
            </div>
            <p className="feature-desc">
              Interactive inline buttons deliver instantaneous, zero-friction booking with zero app install required by patients.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
