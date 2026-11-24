import React, { useState } from 'react';
import { Shield, Plus, Trash2, CalendarClock } from 'lucide-react';

/**
 * T-786: Emergency reserve slots are real AvailabilityRule rows. This panel
 * lists them and lets an admin protect or clear a walk-in window. All writes
 * go through the store actions (which call the API); the component only holds
 * the form's local input state and renders what it is given.
 */
export const ReserveSlotsBento = ({
  reserveSlots = [],
  busy = false,
  doctors = [],
  onAdd,
  onRemove,
}) => {
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('13:30');
  const [endTime, setEndTime] = useState('14:00');
  const [doctorId, setDoctorId] = useState('');
  const [reason, setReason] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!date || !startTime || !endTime) return;
    onAdd({
      date,
      start_time: startTime,
      end_time: endTime,
      ...(doctorId ? { doctor_id: doctorId } : {}),
      ...(reason.trim() ? { reason: reason.trim() } : {}),
    });
  };

  return (
    <div className="settings-card">
      <div className="settings-card-header">
        <div className="settings-card-title-group">
          <div className="settings-icon-badge">
            <Shield size={18} color="var(--amber)" />
          </div>
          <div>
            <h3 className="settings-card-title">Emergency Reserve Slots</h3>
            <p className="settings-card-subtitle">
              Protected walk-in windows. Ordinary bookings are refused inside them.
            </p>
          </div>
        </div>
        <span className="badge-pill badge-neutral mono-tag tabular-nums">
          <CalendarClock size={11} style={{ marginRight: '4px' }} />
          {reserveSlots.length} active
        </span>
      </div>

      <form className="reserve-form" onSubmit={handleSubmit}>
        <label className="reserve-field">
          <span className="reserve-label">Date</span>
          <input
            type="date"
            className="reserve-input tabular-nums"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </label>
        <label className="reserve-field">
          <span className="reserve-label">Start</span>
          <input
            type="time"
            className="reserve-input tabular-nums"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            required
          />
        </label>
        <label className="reserve-field">
          <span className="reserve-label">End</span>
          <input
            type="time"
            className="reserve-input tabular-nums"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            required
          />
        </label>
        <label className="reserve-field">
          <span className="reserve-label">Doctor (optional)</span>
          <select
            className="reserve-input"
            value={doctorId}
            onChange={(e) => setDoctorId(e.target.value)}
          >
            <option value="">Clinic-wide</option>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </label>
        <label className="reserve-field reserve-field-wide">
          <span className="reserve-label">Reason (optional)</span>
          <input
            type="text"
            className="reserve-input"
            value={reason}
            maxLength={255}
            placeholder="e.g. Walk-in triage"
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <button type="submit" className="btn-base btn-obsidian reserve-add-btn" disabled={busy || !date}>
          <Plus size={13} style={{ marginRight: '4px' }} />
          {busy ? 'Saving…' : 'Protect slot'}
        </button>
      </form>

      <div className="reserve-list">
        {reserveSlots.length === 0 ? (
          <div className="reserve-empty">
            No reserve slots yet. Add one above to protect a walk-in window.
          </div>
        ) : (
          reserveSlots.map((r) => (
            <div key={r.id} className="reserve-row">
              <div className="reserve-row-main">
                <span className="reserve-row-date tabular-nums">{r.date}</span>
                <span className="reserve-row-time tabular-nums">
                  {r.start_time} – {r.end_time}
                </span>
                <span className="reserve-row-scope">
                  {r.doctor_name || 'Clinic-wide'}
                </span>
                {r.reason && <span className="reserve-row-reason">{r.reason}</span>}
              </div>
              <button
                type="button"
                className="reserve-remove-btn"
                onClick={() => onRemove(r.id)}
                disabled={busy}
                aria-label={`Remove reserve on ${r.date} at ${r.start_time}`}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
