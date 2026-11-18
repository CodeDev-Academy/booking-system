import React from 'react';
import { AlertTriangle, BellOff, CalendarDays } from 'lucide-react';
import '../../styles/components/double-booking-alert.css';

const safeDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const fmtDay = (value) => {
  const date = safeDate(value);
  if (!date) return String(value || '');
  return date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
};

const fmtTime = (value) => {
  const date = safeDate(value);
  if (!date) return String(value || '');
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
};

const AppointmentRow = ({ appointment, accent }) => (
  <div className="double-booking-code-row">
    <span className={`double-booking-code ${accent}`}>{appointment.code}</span>
    <span className="double-booking-patient">{appointment.patient}</span>
    <span className="double-booking-time">
      {fmtTime(appointment.start)} &ndash; {fmtTime(appointment.end)}
    </span>
  </div>
);

/**
 * DoubleBookingAlert — the full-screen red alert.
 *
 * Pure markup: every fact (doctor, both codes, exact overlap window) comes
 * from the backend detector. It intentionally has no auto-dismiss and no
 * Escape shortcut: a double-booking needs a real decision, so the only exits
 * are "View in calendar" (jump to the clash, keep the chip) and "Silence
 * alert" (acknowledge, keep the chip).
 */
export const DoubleBookingAlert = ({ isOpen, conflict, count, onViewInCalendar, onSilence }) => {
  if (!isOpen || !conflict) return null;

  const extraClashes = Math.max(0, (count || 0) - 1);
  const day = fmtDay(conflict.overlap_start);

  return (
    <div
      className="double-booking-overlay"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="double-booking-title"
      aria-describedby="double-booking-detail"
    >
      <div className="double-booking-panel">
        <span className="double-booking-pulse" aria-hidden="true" />

        <div className="double-booking-kicker">
          <AlertTriangle size={16} aria-hidden="true" />
          Double booking detected
        </div>

        <h2 className="double-booking-title" id="double-booking-title">
          {conflict.doctor_name}
        </h2>

        <p className="double-booking-lede" id="double-booking-detail">
          Two patients hold the same chair at the same time on {day}.
          One of them must be moved before they arrive.
        </p>

        <div className="double-booking-codes">
          <AppointmentRow appointment={conflict.appointment_a} accent="accent-a" />
          <div className="double-booking-vs" aria-hidden="true">
            <span />
            clashes with
            <span />
          </div>
          <AppointmentRow appointment={conflict.appointment_b} accent="accent-b" />
        </div>

        <div className="double-booking-overlap">
          <span className="double-booking-overlap-label">Overlap</span>
          <span className="double-booking-overlap-value">
            {fmtTime(conflict.overlap_start)} &ndash; {fmtTime(conflict.overlap_end)}
          </span>
        </div>

        {extraClashes > 0 && (
          <p className="double-booking-more">
            +{extraClashes} more {extraClashes === 1 ? 'clash' : 'clashes'} waiting.
            Clear this one and the next alert appears.
          </p>
        )}

        <div className="double-booking-actions">
          <button type="button" className="double-booking-btn primary" onClick={onViewInCalendar}>
            <CalendarDays size={16} aria-hidden="true" />
            View in calendar
          </button>
          <button type="button" className="double-booking-btn ghost" onClick={onSilence}>
            <BellOff size={16} aria-hidden="true" />
            Silence alert
          </button>
        </div>

        <p className="double-booking-footnote">
          Stays red until the clash is fixed. The calendar re-checks every 10 seconds.
        </p>
      </div>
    </div>
  );
};

/**
 * DoubleBookingCountChip — the red count chip that stays visible after the
 * overlay is silenced. Clicking it brings the alert back.
 */
export const DoubleBookingCountChip = ({ count, onReopen }) => {
  if (!count) return null;
  return (
    <button
      type="button"
      className="double-booking-chip"
      onClick={onReopen}
      title={`${count} double booking${count === 1 ? '' : 's'} — click to review`}
    >
      <AlertTriangle size={13} aria-hidden="true" />
      <span>{count}</span>
      <span className="double-booking-chip-label">
        clash{count === 1 ? '' : 'es'}
      </span>
    </button>
  );
};
