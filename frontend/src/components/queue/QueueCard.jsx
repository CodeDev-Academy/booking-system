import React from 'react';
import {
  Eye,
  Clock,
  Send,
  Globe,
  RefreshCw,
  ArrowRight,
  UserCheck,
  Calendar,
  Sparkles,
} from 'lucide-react';
import { AgingBadge } from './AgingBadge';

/**
 * QueueCard — Uniform Bento Card Design Pattern
 * Aligned with PastPatientsHistory / Doctor Bento Cards:
 * - 48px Circular avatar with initials & pastel indicator
 * - Name, code & returning/new pill
 * - Clean #f8fafc meta strip with preferred time & channel
 * - Full-width midnight navy pill action button (#0c1a30)
 */
export const QueueCard = ({ card, onOpen }) => {
  const isReturning = card.patientType === 'returning';

  const initials = (card.patientName || 'Patient')
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div
      className="bento-queue-card"
      onClick={() => onOpen(card.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(card.id);
        }
      }}
      aria-label={`Review request ${card.code} from ${card.patientName}`}
    >
      {/* 1. Top Info Row: Avatar + Name + Tags */}
      <div className="bento-queue-info-row">
        <div
          className="bento-queue-avatar"
          style={{
            background: isReturning ? '#e0f2fe' : '#fef3c7',
            color: isReturning ? '#0369a1' : '#b45309',
          }}
        >
          {initials}
        </div>

        <div className="bento-queue-text">
          <div className="bento-queue-header-line">
            <span className="bento-queue-name">{card.patientName}</span>
            {card.isEmergency && (
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
            <span className="bento-queue-phone">{card.phoneDisplay}</span>
            {card.gender && (
              <>
                <span style={{ fontSize: '10px', color: '#94a3b8' }}>&bull;</span>
                <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>{card.gender}</span>
              </>
            )}
            <span style={{ fontSize: '10px', color: '#94a3b8' }}>&bull;</span>
            <span className="bento-queue-code mono-tag">{card.code}</span>
          </div>

          <span className="bento-queue-service-tag">
            {card.serviceName} &bull; {card.doctorName}
          </span>
        </div>
      </div>

      {/* 2. Middle Meta Strip: Preferred Window, Channel & Aging */}
      <div className="bento-queue-meta-strip">
        <div className="bento-meta-item">
          <span className="bento-meta-label">Preferred Window:</span>
          <span className="bento-meta-val">{card.windowLabel || 'Flexible'}</span>
        </div>

        <div className="bento-meta-item">
          <span className="bento-meta-label">Channel &amp; Triage:</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '10px',
                color: '#64748b',
              }}
            >
              {card.channel === 'telegram' ? <Send size={10} color="#0284c7" /> : <Globe size={10} />}
              {card.channel === 'telegram' ? 'Telegram' : 'Web'}
            </span>
            <span>&bull;</span>
            <AgingBadge level={card.agingLevel} label={card.agingLabel} />
          </div>
        </div>

        {/* Live Collaboration or Re-Requested Alert */}
        {(card.reRequested || card.reviewingBy) && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              paddingTop: '4px',
              borderTop: '1px solid #f1f5f9',
              fontSize: '10px',
            }}
          >
            {card.reRequested && (
              <span style={{ color: '#d97706', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                <RefreshCw size={10} /> Re-Requested (Priority)
              </span>
            )}
            {card.reviewingBy && (
              <span style={{ color: '#0284c7', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                <Eye size={10} /> {card.reviewingBy} is reviewing
              </span>
            )}
          </div>
        )}
      </div>

      {/* 3. Bottom Action Footer: Full Width Midnight Navy Button */}
      <button
        type="button"
        className="bento-queue-action-btn"
        onClick={(e) => {
          e.stopPropagation();
          onOpen(card.id);
        }}
      >
        <span>Review Request</span>
        <ArrowRight size={13} />
      </button>
    </div>
  );
};
