import React from 'react';
import {
  Sliders,
  Timer,
  Lock,
  Sparkles,
  ShieldAlert,
  BellRing,
  Calendar,
  Hourglass,
  Check,
} from 'lucide-react';

export const SchedulingRulesBento = ({
  schedulingRules,
  notificationRules,
  onUpdateRule,
  onToggleNotification,
}) => {
  return (
    <div className="settings-card">
      <div className="settings-card-header">
        <div className="settings-card-title-group">
          <div className="settings-icon-badge">
            <Sliders size={18} color="var(--rose)" />
          </div>
          <div>
            <h3 className="settings-card-title">Scheduling Engine Rules &amp; Timers</h3>
            <p className="settings-card-subtitle">
              Set patient decision limits, temporary slot locks, room cleaning breaks, and automated reminder alerts.
            </p>
          </div>
        </div>
      </div>

      {/* 4 Interactive Rules Sliders in Plain English */}
      <div className="rules-sliders-grid">
        {/* 1. Patient Decision Time Limit */}
        <div className="rule-slider-card">
          <div className="rule-slider-header">
            <div className="rule-title-group">
              <Timer size={14} color="var(--amber)" />
              <span className="rule-name">Patient Decision Time Limit</span>
            </div>
            <div className="rule-value-pill tabular-nums">
              {schedulingRules.offerExpiryMinutes} min
            </div>
          </div>
          <p className="rule-description">
            How much time a patient has to choose their appointment slot before the offered options expire and return to reception.
          </p>
          <input
            type="range"
            className="taste-range-slider"
            min="15"
            max="120"
            step="5"
            value={schedulingRules.offerExpiryMinutes}
            onChange={(e) => onUpdateRule('offerExpiryMinutes', e.target.value)}
          />
          <div className="slider-limits">
            <span>15m (Fast)</span>
            <span>60m (Standard)</span>
            <span>120m (Relaxed)</span>
          </div>
        </div>

        {/* 2. Temporary Slot Hold Duration */}
        <div className="rule-slider-card">
          <div className="rule-slider-header">
            <div className="rule-title-group">
              <Lock size={14} color="var(--ember)" />
              <span className="rule-name">Temporary Slot Hold Duration</span>
            </div>
            <div className="rule-value-pill tabular-nums">
              {schedulingRules.holdExpiryMinutes} min
            </div>
          </div>
          <p className="rule-description">
            How long a selected time slot is locked exclusively for the patient while they finalize their confirmation, preventing double-bookings.
          </p>
          <input
            type="range"
            className="taste-range-slider slider-ember"
            min="5"
            max="45"
            step="5"
            value={schedulingRules.holdExpiryMinutes}
            onChange={(e) => onUpdateRule('holdExpiryMinutes', e.target.value)}
          />
          <div className="slider-limits">
            <span>5m (Strict)</span>
            <span>15m (Standard)</span>
            <span>45m (Extended)</span>
          </div>
        </div>

        {/* 3. Cleaning & Room Prep Buffer */}
        <div className="rule-slider-card">
          <div className="rule-slider-header">
            <div className="rule-title-group">
              <Sparkles size={14} color="var(--info)" />
              <span className="rule-name">Cleaning &amp; Room Prep Buffer</span>
            </div>
            <div className="rule-value-pill tabular-nums">
              {schedulingRules.defaultBufferMinutes} min
            </div>
          </div>
          <p className="rule-description">
            Break time automatically added after each visit so the doctor can sanitize the room and write clinical notes before the next patient arrives.
          </p>
          <input
            type="range"
            className="taste-range-slider slider-info"
            min="0"
            max="30"
            step="5"
            value={schedulingRules.defaultBufferMinutes}
            onChange={(e) => onUpdateRule('defaultBufferMinutes', e.target.value)}
          />
          <div className="slider-limits">
            <span>0m (Back-to-back)</span>
            <span>10m (Recommended)</span>
            <span>30m (Deep Clean)</span>
          </div>
        </div>

        {/* 4. Urgent / Walk-In Reserved Slots */}
        <div className="rule-slider-card">
          <div className="rule-slider-header">
            <div className="rule-title-group">
              <ShieldAlert size={14} color="var(--rose)" />
              <span className="rule-name">Urgent / Walk-In Reserved Slots</span>
            </div>
            <div className="rule-value-pill tabular-nums">
              {schedulingRules.emergencySlotsPerShift} {schedulingRules.emergencySlotsPerShift === 1 ? 'Slot' : 'Slots'}
            </div>
          </div>
          <p className="rule-description">
            Number of appointment times kept open per shift exclusively for urgent, walk-in patients who arrive at the clinic without booking ahead.
          </p>
          <input
            type="range"
            className="taste-range-slider slider-rose"
            min="0"
            max="4"
            step="1"
            value={schedulingRules.emergencySlotsPerShift}
            onChange={(e) => onUpdateRule('emergencySlotsPerShift', e.target.value)}
          />
          <div className="slider-limits">
            <span>0 (None)</span>
            <span>1 Slot / Shift</span>
            <span>4 Slots Max</span>
          </div>
        </div>
      </div>

      {/* Secondary Horizon & Notice Rules */}
      <div className="settings-grid-3" style={{ marginTop: '16px' }}>
        <div className="settings-form-group">
          <label className="settings-label" htmlFor="bookingHorizon">
            <Calendar size={13} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
            Advance Booking Window (Days)
          </label>
          <div className="settings-input-wrapper">
            <input
              id="bookingHorizon"
              type="number"
              className="settings-input tabular-nums"
              min="7"
              max="60"
              value={schedulingRules.bookingHorizonDays}
              onChange={(e) => onUpdateRule('bookingHorizonDays', e.target.value)}
            />
          </div>
          <span className="settings-helper-text">
            How many days into the future patients can book appointments.
          </span>
        </div>

        <div className="settings-form-group">
          <label className="settings-label" htmlFor="minAdvanceNotice">
            <Hourglass size={13} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
            Minimum Notice for Same-Day Booking (Hours)
          </label>
          <div className="settings-input-wrapper">
            <input
              id="minAdvanceNotice"
              type="number"
              className="settings-input tabular-nums"
              min="1"
              max="48"
              value={schedulingRules.minAdvanceHours}
              onChange={(e) => onUpdateRule('minAdvanceHours', e.target.value)}
            />
          </div>
          <span className="settings-helper-text">
            Prevents patients from booking an appointment starting with less advance notice than this.
          </span>
        </div>

        <div className="settings-form-group">
          <label className="settings-label" htmlFor="gridGranularity">
            Calendar Time Interval
          </label>
          <div className="settings-input-wrapper">
            <select
              id="gridGranularity"
              className="settings-select tabular-nums"
              value={schedulingRules.gridIncrementMinutes}
              onChange={(e) => onUpdateRule('gridIncrementMinutes', e.target.value)}
            >
              <option value="10">10-Minute Intervals</option>
              <option value="15">15-Minute Intervals (Standard)</option>
              <option value="20">20-Minute Intervals</option>
              <option value="30">30-Minute Intervals</option>
            </select>
          </div>
          <span className="settings-helper-text">Step interval used when displaying appointment blocks on calendar.</span>
        </div>
      </div>

      {/* Notification & Security Controls */}
      <div className="notifications-toggle-section">
        <h4 className="notifications-section-title">
          <BellRing size={14} color="var(--success-text)" />
          Automated Patient Reminders &amp; Screen Protection (Instant Auto-Save)
        </h4>

        <div className="toggle-tiles-grid">
          {/* 24h Reminder Toggle */}
          <div
            className={`toggle-tile ${notificationRules.enable24hReminder ? 'is-enabled' : ''}`}
            onClick={() => onToggleNotification('enable24hReminder')}
            role="button"
            tabIndex={0}
            style={{ cursor: 'pointer' }}
            title="Click to toggle 24-hour notice (Saves instantly)"
          >
            <div className="toggle-tile-header">
              <span className="toggle-tile-label">24-Hour Pre-Visit Notice</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className={`badge-pill ${notificationRules.enable24hReminder ? 'badge-success' : 'badge-neutral'} mono-tag`}>
                  {notificationRules.enable24hReminder ? 'ACTIVE & SAVED' : 'MUTED'}
                </span>
                <div className="custom-checkbox">
                  {notificationRules.enable24hReminder && <Check size={12} color="#fff" />}
                </div>
              </div>
            </div>
            <p className="toggle-tile-desc">
              Sends an automated Telegram/WhatsApp reminder with <code>[✅ Confirm]</code> and <code>[🔄 Reschedule]</code> buttons 24 hours before the patient's visit.
            </p>
          </div>

          {/* 2h Urgent Reminder Toggle */}
          <div
            className={`toggle-tile ${notificationRules.enable2hReminder ? 'is-enabled' : ''}`}
            onClick={() => onToggleNotification('enable2hReminder')}
            role="button"
            tabIndex={0}
            style={{ cursor: 'pointer' }}
            title="Click to toggle 2-hour arrival alert (Saves instantly)"
          >
            <div className="toggle-tile-header">
              <span className="toggle-tile-label">2-Hour Arrival Alert</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className={`badge-pill ${notificationRules.enable2hReminder ? 'badge-success' : 'badge-neutral'} mono-tag`}>
                  {notificationRules.enable2hReminder ? 'ACTIVE & SAVED' : 'MUTED'}
                </span>
                <div className="custom-checkbox">
                  {notificationRules.enable2hReminder && <Check size={12} color="#fff" />}
                </div>
              </div>
            </div>
            <p className="toggle-tile-desc">
              Sends automated clinic directions, parking details, and check-in instructions 2 hours before the scheduled appointment.
            </p>
          </div>

          {/* 20-Minute Auto-Lock */}
          <div className="toggle-tile static-tile">
            <div className="toggle-tile-header">
              <span className="toggle-tile-label">Workstation Auto-Lock</span>
              <span className="badge-pill badge-neutral mono-tag tabular-nums">
                {notificationRules.autoLockMinutes}m TIMEOUT
              </span>
            </div>
            <p className="toggle-tile-desc">
              Locks the reception workstation into a 4-digit PIN screen after 20 minutes of inactivity to protect patient records.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
