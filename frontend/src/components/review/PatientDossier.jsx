import React from 'react';
import {
  ShieldCheck, History, UserPlus, MessageCircle, Smartphone, Phone, Send,
  ArrowDownLeft, ArrowUpRight, RefreshCw, AlertCircle,
} from 'lucide-react';

/**
 * PatientDossier — returning-patient reliability card + communication timeline.
 * ZERO DIAGNOSIS EXPOSURE (HIPAA/NDPR): shows operational procedure names only.
 * Task 3.2: `interactions` = live log of every message/call touchpoint
 * (fed from GET /api/v1/interactions/ — populated by the n8n workflows).
 */
const CHANNEL_ICONS = {
  whatsapp: MessageCircle,
  sms: Smartphone,
  voice: Phone,
  telegram: Send,
};

const STATUS_TONES = {
  delivered: 'ok',
  sent: 'ok',
  answered: 'ok',
  queued: 'pending',
  failed: 'bad',
  no_answer: 'bad',
  expired: 'pending',
};

const fmtStamp = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return today ? time : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`;
};

export const PatientDossier = ({ dossier, interactions, onRefresh }) => {
  const items = interactions?.items || [];
  const hasHistory = Boolean(dossier) || items.length > 0;

  if (!hasHistory) {
    return (
      <div className="dossier dossier-new">
        <UserPlus size={16} />
        <div>
          <strong>New patient</strong>
          <p>No visit history found for this phone number.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dossier">
      {dossier ? (
        <>
          <div className="dossier-head">
            <span className="dossier-title">
              <History size={14} /> Patient reliability
            </span>
            <span className={`dossier-score tone-${dossier.reliabilityTone} tabular-nums`}>
              {dossier.reliabilityPct}% reliable
            </span>
          </div>
          <div className="dossier-sub tabular-nums">{dossier.attendedLabel}</div>
          <ul className="dossier-visits">
            {(dossier.lastVisits || []).map((v) => (
              <li key={`${v.date}-${v.procedure}`}>
                <span className="tabular-nums">{v.date}</span>
                <span>{v.procedure}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        // First-time patient: no attendance history yet, but interactions may
        // already exist (a message/call was logged) — show the timeline without
        // pretending there is a reliability score to read.
        <div className="dossier-head">
          <span className="dossier-title">
            <History size={14} /> Patient reliability
          </span>
          <span className="dossier-sub">No prior visits on record</span>
        </div>
      )}

      {/* Task 3.2: live communication timeline */}
      <div className="dossier-timeline-head">
        <span className="dossier-title">
          <MessageCircle size={13} /> Communication history
        </span>
        <button
          type="button"
          className="dossier-refresh"
          onClick={onRefresh}
          disabled={interactions?.loading}
          title="Refresh communication history"
          aria-label="Refresh communication history"
        >
          <RefreshCw size={12} className={interactions?.loading ? 'spin' : ''} />
        </button>
      </div>

      {interactions?.error && (
        <div className="dossier-timeline-empty dossier-timeline-error">
          <AlertCircle size={12} /> {interactions.error}
        </div>
      )}
      {!interactions?.error && interactions?.loading && items.length === 0 && (
        <div className="dossier-timeline-empty">Loading history…</div>
      )}
      {!interactions?.error && !interactions?.loading && items.length === 0 && (
        <div className="dossier-timeline-empty">
          No messages or calls logged yet. History appears as soon as the patient is contacted.
        </div>
      )}

      <ul className="dossier-timeline">
        {items.map((it) => {
          const Icon = CHANNEL_ICONS[it.channel] || MessageCircle;
          const Inbound = it.direction === 'inbound' ? ArrowDownLeft : ArrowUpRight;
          const tone = STATUS_TONES[it.status] || 'pending';
          return (
            <li key={it.id} className="dossier-timeline-item">
              <span className={`timeline-icon channel-${it.channel}`}>
                <Icon size={13} />
              </span>
              <div className="timeline-body">
                <div className="timeline-top">
                  <span className="timeline-kind">
                    <Inbound size={10} className={`dir-${it.direction}`} />
                    {it.direction === 'inbound' ? 'Patient reply' : `${it.channel === 'voice' ? 'Voice call' : it.channel} sent`}
                  </span>
                  <span className={`timeline-status tone-${tone} tabular-nums`}>{it.status}</span>
                  <span className="timeline-time tabular-nums">{fmtStamp(it.created_at)}</span>
                </div>
                {it.summary && <div className="timeline-summary">{it.summary}</div>}
                {it.call_duration_seconds != null && (
                  <div className="timeline-meta tabular-nums">Call duration: {it.call_duration_seconds}s</div>
                )}
                {it.error_detail && (
                  <div className="timeline-meta timeline-error-detail">
                    <AlertCircle size={10} /> {it.error_detail}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="dossier-note">
        <ShieldCheck size={12} /> Clinical notes are never shown on reception screens.
      </div>
    </div>
  );
};
