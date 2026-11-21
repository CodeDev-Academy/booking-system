import React, { useState } from 'react';
import { CalendarPlus, CalendarX2, Clock3, Trash2, X } from 'lucide-react';

const LEAVE_TYPES = [
  { id: 'annual', label: 'Annual leave' },
  { id: 'sick', label: 'Sick leave' },
  { id: 'emergency', label: 'Emergency leave' },
  { id: 'training', label: 'Training / Conference' },
  { id: 'other', label: 'Other' },
];

const formatRange = (startDate, endDate) => {
  if (!startDate) return '';
  const start = new Date(`${startDate}T00:00:00`);
  const label = start.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
  if (!endDate) return `${label} — until further notice`;
  if (endDate === startDate) return label;
  const end = new Date(`${endDate}T00:00:00`);
  return `${label} → ${end.toLocaleDateString(undefined, { day: '2-digit', month: 'short' })}`;
};

/**
 * LeavePlannerModal — planned leave, deliberately separate from the emergency
 * cockpit. DESIGN ONLY: every rule (overlaps, bookings in the window) is
 * Django's and arrives as `planner.error`.
 */
export const LeavePlannerModal = ({
  isOpen,
  planner,
  onClose,
  onAdd,
  onRemove,
  onEndToday,
}) => {
  const [form, setForm] = useState({
    startDate: '',
    endDate: '',
    leaveType: 'annual',
    reason: '',
  });

  if (!isOpen) return null;

  const {
    doctorName = 'Doctor',
    leaves = [],
    doctorIsOnLeave = false,
    loading = false,
    saving = false,
    error = null,
    demo = false,
  } = planner || {};

  const canSubmit = form.startDate && !saving && !demo;

  const submit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;
    const result = await onAdd?.(form);
    if (result?.success) {
      setForm({ startDate: '', endDate: '', leaveType: 'annual', reason: '' });
    }
  };

  return (
    <div className="calendar-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="calendar-modal-surface leave-planner-surface"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="calendar-modal-header">
          <div className="modal-title-row">
            <span className="badge-pill badge-neutral">
              <CalendarPlus size={12} />
              <span>Planned leave</span>
            </span>
            <h2 className="modal-title">Leave calendar — {doctorName}</h2>
          </div>
          <button
            type="button"
            className="icon-btn-close"
            onClick={onClose}
            aria-label="Close the leave planner"
          >
            <X size={18} />
          </button>
        </div>

        <div className="leave-planner-body">
          <p className={`leave-planner-status${doctorIsOnLeave ? ' is-away' : ''}`}>
            <Clock3 size={14} />
            {doctorIsOnLeave
              ? `${doctorName} is on leave today.`
              : `${doctorName} is on duty today.`}
            {doctorIsOnLeave && (
              <button
                type="button"
                className="btn-base btn-secondary leave-planner-endtoday"
                onClick={onEndToday}
                disabled={saving}
              >
                End today&apos;s leave
              </button>
            )}
          </p>

          {demo ? (
            <p className="leave-planner-hint">
              This is the pitch demo, which has no clinic database. Planned leave
              works on the live clinic.
            </p>
          ) : (
            <>
              {loading ? (
                <p className="leave-planner-hint">Loading leave periods…</p>
              ) : leaves.length === 0 ? (
                <p className="leave-planner-hint">No leave periods recorded.</p>
              ) : (
                <ul className="leave-planner-list">
                  {leaves.map((leave) => (
                    <li key={leave.id} className="leave-period">
                      <div className="leave-period-main">
                        <span className="leave-period-type">
                          {LEAVE_TYPES.find((type) => type.id === leave.leave_type)?.label
                            || leave.leave_type}
                        </span>
                        <span className="leave-period-dates tabular-nums">
                          {formatRange(leave.start_date, leave.end_date)}
                        </span>
                        {leave.reason && (
                          <span className="leave-period-reason">{leave.reason}</span>
                        )}
                      </div>
                      <button
                        type="button"
                        className="icon-btn-close"
                        onClick={() => onRemove?.(leave.id)}
                        disabled={saving}
                        aria-label={`Remove leave ${leave.start_date}`}
                        title="Remove this leave period"
                      >
                        <Trash2 size={15} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <form className="leave-planner-form" onSubmit={submit}>
                <span className="field-label">Plan a new leave</span>

                <div className="leave-planner-grid">
                  <label className="leave-planner-field">
                    <span>Type</span>
                    <select
                      className="field-input"
                      value={form.leaveType}
                      onChange={(event) => setForm((prev) => ({ ...prev, leaveType: event.target.value }))}
                    >
                      {LEAVE_TYPES.map((type) => (
                        <option key={type.id} value={type.id}>{type.label}</option>
                      ))}
                    </select>
                  </label>

                  <label className="leave-planner-field">
                    <span>First day</span>
                    <input
                      type="date"
                      className="field-input"
                      value={form.startDate}
                      onChange={(event) => setForm((prev) => ({ ...prev, startDate: event.target.value }))}
                      required
                    />
                  </label>

                  <label className="leave-planner-field">
                    <span>Last day (optional)</span>
                    <input
                      type="date"
                      className="field-input"
                      aria-label="Last day (optional)"
                      value={form.endDate}
                      min={form.startDate || undefined}
                      onChange={(event) => setForm((prev) => ({ ...prev, endDate: event.target.value }))}
                    />
                  </label>
                </div>

                <label className="leave-planner-field">
                  <span>Reason (optional)</span>
                  <input
                    type="text"
                    className="field-input"
                    maxLength={120}
                    placeholder="Annual leave"
                    value={form.reason}
                    onChange={(event) => setForm((prev) => ({ ...prev, reason: event.target.value }))}
                  />
                </label>

                {error && (
                  <p className="leave-planner-error" role="alert">
                    <CalendarX2 size={14} />
                    <span>{error}</span>
                  </p>
                )}

                <div className="modal-actions-row">
                  <button type="button" className="btn-base btn-secondary" onClick={onClose}>
                    Close
                  </button>
                  <button type="submit" className="btn-base btn-primary" disabled={!canSubmit}>
                    {saving ? 'Saving…' : 'Save leave'}
                  </button>
                </div>
              </form>

              <p className="leave-planner-hint">
                Patients already booked in the window are not moved by this form.
                Use <strong>Sudden absence</strong> for that window so everyone is
                moved and told.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
