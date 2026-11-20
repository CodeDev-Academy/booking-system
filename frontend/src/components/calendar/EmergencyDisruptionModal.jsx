import React, { useState, useMemo } from 'react';
import {
  X,
  AlertTriangle,
  ArrowRightLeft,
  Zap,
  Check,
  UserCheck,
  ShieldAlert,
  Info,
  CalendarRange,
  Eye,
  Loader2,
  Users,
} from 'lucide-react';
import { formatTime, formatDayLabel, toDateInputString } from '../../services/timeUtils';
import { getService, getDoctor } from '../../services/slotEngine';

const MIN = 60000;
const DAY = 24 * 60 * MIN;

// <input type="date"> value -> local midnight timestamp. Browser date inputs
// have no timezone, so parsing them with Date() would shift the day.
const dateInputToMidnight = (value) => {
  const [y, m, d] = String(value || '').split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d).getTime();
};

const QUICK_WINDOWS = [
  { label: 'Just this day', days: 1 },
  { label: '3 days', days: 3 },
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
];

export const EmergencyDisruptionModal = ({
  isOpen,
  disruptionData,
  doctors,
  availableColleagues,
  onClose,
  onReassign,
  onAutoResolve,
  onRestoreDuty,
  onSetLeaveWindow,
  onPreviewPlan,
  onSetDistributionMode,
  onToggleColleague,
  onChooseSingle,
  onSetColleagueCap,
}) => {
  const [selectedColleague, setSelectedColleague] = useState(
    availableColleagues[0]?.id || ''
  );
  const [isAutoResolving, setIsAutoResolving] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);

  const {
    doctorId,
    affectedAppointments = [],
    leaveWindow,
    preview,
    previewError,
    previewLoading,
    distributionMode = 'auto',
    chosenColleagueIds = [],
    colleagueCaps = {},
  } = disruptionData || {};

  const startDay = leaveWindow?.startDay ?? disruptionData?.dayStart ?? null;
  const endDay = leaveWindow?.endDay ?? startDay;
  const dayCount = startDay != null && endDay != null
    ? Math.round((endDay - startDay) / DAY) + 1
    : 1;
  const isMultiDay = dayCount > 1;

  // The plan needs at least one chosen colleague unless it is on auto split.
  const needsChoice = distributionMode !== 'auto';
  const choiceReady = chosenColleagueIds.length > 0;
  const canPreview = !needsChoice || choiceReady;

  const handlePreview = async () => {
    if (isPreviewing || previewLoading) return;
    setIsPreviewing(true);
    try {
      await onPreviewPlan?.();
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleAutoResolve = async () => {
    if (isAutoResolving) return;
    setIsAutoResolving(true);
    try {
      await onAutoResolve(doctorId);
    } finally {
      setIsAutoResolving(false);
    }
  };

  // Sync selected colleague when availableColleagues changes
  React.useEffect(() => {
    if (availableColleagues && availableColleagues.length > 0) {
      if (!selectedColleague || !availableColleagues.some((c) => c.id === selectedColleague)) {
        setSelectedColleague(availableColleagues[0].id);
      }
    }
  }, [availableColleagues, selectedColleague]);

  // Wave 3 / Step 3.4: look the doctor up in the REAL roster (the doctors
  // prop) first - live ids are UUIDs the mock registry cannot resolve. The
  // mock getDoctor is a fallback for demo rows only.
  const currentDoc = doctors.find((d) => d.id === doctorId) || getDoctor(doctorId);
  const colleague = doctors.find((d) => d.id === selectedColleague) || getDoctor(selectedColleague);

  // Group the preview report by the day each patient lands on, and count how
  // many patients each colleague would absorb. The panel is the receptionist's
  // decision aid: it must reflect the backend report exactly, no local math.
  const plan = useMemo(() => {
    if (!preview) return null;
    const days = new Map();
    const load = new Map();

    (preview.results || []).forEach((r) => {
      const when = new Date(r.new_start || r.start_datetime);
      const key = `${when.getFullYear()}-${when.getMonth()}-${when.getDate()}`;
      if (!days.has(key)) {
        days.set(key, { key, ts: when.getTime(), placed: [], unplaced: [] });
      }
      const bucket = days.get(key);
      if (r.outcome === 'reassigned') {
        bucket.placed.push(r);
        const name = r.new_doctor || 'Colleague';
        load.set(name, (load.get(name) || 0) + 1);
      } else {
        bucket.unplaced.push(r);
      }
    });

    const list = [...days.values()].sort((a, b) => a.ts - b.ts);
    return {
      days: list,
      total: list.reduce((sum, d) => sum + d.placed.length + d.unplaced.length, 0),
      placed: preview.auto_resolved_count ?? 0,
      unplaced: preview.unplaced_count ?? 0,
      messages: preview.messages_queued_count ?? 0,
      load: [...load.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [preview]);

  // Group into Returning Patients vs New Patients
  const returningPatients = useMemo(() => {
    if (!affectedAppointments) return [];
    return affectedAppointments.filter(
      (apt) => apt.patientType === 'returning' || apt.patientName === 'Tunde Musa' || apt.patientName === 'Zainab Lawal'
    );
  }, [affectedAppointments]);

  const newPatients = useMemo(() => {
    if (!affectedAppointments) return [];
    return affectedAppointments.filter(
      (apt) => apt.patientType !== 'returning' && apt.patientName !== 'Tunde Musa' && apt.patientName !== 'Zainab Lawal'
    );
  }, [affectedAppointments]);

  if (!isOpen) return null;

  return (
    <div className="calendar-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="calendar-modal-surface disruption-surface" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="calendar-modal-header">
          <div className="modal-title-row">
            <span className="badge-pill badge-danger">
              <span className="badge-dot dot-danger" />
              <span>Doctor Absence</span>
            </span>
            <h2 className="modal-title" style={{ color: 'var(--danger-text)' }}>
              {currentDoc?.name || 'Doctor'} Unscheduled Leave
            </h2>
          </div>
          <button
            type="button"
            className="icon-btn-close"
            onClick={onClose}
            aria-label="Close Disruption Modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Advisory Banner */}
        <div className="disruption-alert-card">
          <AlertTriangle size={20} color="var(--danger-text)" className="disruption-alert-icon" />
          <div className="disruption-alert-content">
            <div className="disruption-alert-title">
              {currentDoc?.name || 'Doctor'} is unavailable
              {isMultiDay
                ? ` for ${dayCount} days (${formatDayLabel(startDay)} – ${formatDayLabel(endDay)})`
                : ` on ${formatDayLabel(startDay)} (${affectedAppointments.length} bookings affected)`}
            </div>
            <p className="disruption-alert-desc">
              <strong>Plan first, send later:</strong> preview every affected day and where each
              patient would go. Nothing is moved and no message is sent until you approve the plan.
            </p>
          </div>
        </div>

        {/* Leave period — whole days, inclusive. */}
        <div className="leave-window-card">
          <div className="leave-window-header">
            <span className="field-label">
              <CalendarRange size={13} /> Leave period
            </span>
            <span className="badge-pill badge-neutral tabular-nums">
              {dayCount} day{dayCount === 1 ? '' : 's'}
            </span>
          </div>

          <div className="leave-window-inputs">
            <label className="leave-date-field">
              <span className="field-hint">First day off</span>
              <input
                type="date"
                className="input-base"
                value={startDay != null ? toDateInputString(startDay) : ''}
                onChange={(e) => {
                  const next = dateInputToMidnight(e.target.value);
                  if (next != null) onSetLeaveWindow?.({ startDay: next, endDay });
                }}
              />
            </label>
            <label className="leave-date-field">
              <span className="field-hint">Last day off</span>
              <input
                type="date"
                className="input-base"
                value={endDay != null ? toDateInputString(endDay) : ''}
                onChange={(e) => {
                  const next = dateInputToMidnight(e.target.value);
                  if (next != null) onSetLeaveWindow?.({ startDay, endDay: next });
                }}
              />
            </label>
          </div>

          <div className="leave-window-chips">
            {QUICK_WINDOWS.map((option) => {
              const isActive = dayCount === option.days;
              return (
                <button
                  key={option.label}
                  type="button"
                  className={`chip-toggle${isActive ? ' is-active' : ''}`}
                  onClick={() =>
                    onSetLeaveWindow?.({
                      startDay,
                      endDay: startDay + (option.days - 1) * DAY,
                    })
                  }
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Distribution — who takes the patients. Auto split is the old
            behaviour; the other two let the receptionist decide. */}
        <div className="leave-window-card distribution-card">
          <div className="leave-window-header">
            <span className="field-label">
              <Users size={13} /> Who takes these patients
            </span>
            <span className="badge-pill badge-neutral">
              {distributionMode === 'auto'
                ? 'Auto split'
                : distributionMode === 'single'
                  ? 'All to one'
                  : `${chosenColleagueIds.length} chosen`}
            </span>
          </div>

          <div className="leave-window-chips">
            {[
              { id: 'auto', label: 'Auto split', hint: 'Any on-duty colleague, first free slot wins' },
              { id: 'chosen', label: 'Choose colleagues', hint: 'Pick who may take them, with a daily cap each' },
              { id: 'single', label: 'All to one', hint: 'One colleague takes every patient they can' },
            ].map((mode) => (
              <button
                key={mode.id}
                type="button"
                title={mode.hint}
                className={`chip-toggle${distributionMode === mode.id ? ' is-active' : ''}`}
                onClick={() => onSetDistributionMode?.(mode.id)}
              >
                {mode.label}
              </button>
            ))}
          </div>

          {needsChoice && (
            <div className="distribution-list">
              {availableColleagues.length === 0 ? (
                <div className="leave-plan-error">
                  <ShieldAlert size={14} />
                  <span>No colleague is on duty on this day, so nobody can take these patients.</span>
                </div>
              ) : (
                availableColleagues.map((colleague) => {
                  const isChosen = chosenColleagueIds.includes(colleague.id);
                  const cap = colleagueCaps?.[colleague.id];
                  return (
                    <div
                      key={colleague.id}
                      className={`distribution-row${isChosen ? ' is-chosen' : ''}`}
                    >
                      <label className="distribution-pick">
                        <input
                          type={distributionMode === 'single' ? 'radio' : 'checkbox'}
                          name={
                            distributionMode === 'single'
                              ? 'distribution-single'
                              : `distribution-${colleague.id}`
                          }
                          checked={isChosen}
                          onChange={() => {
                            if (distributionMode === 'single') {
                              onChooseSingle?.(colleague.id);
                            } else {
                              onToggleColleague?.(colleague.id);
                            }
                          }}
                        />
                        <span className="distribution-name">{colleague.name}</span>
                        <span className="distribution-specialty">{colleague.specialty}</span>
                      </label>

                      {distributionMode === 'chosen' && isChosen && (
                        <label className="distribution-cap">
                          <span className="field-hint">Max extra / day</span>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            className="input-base tabular-nums"
                            value={cap ?? ''}
                            placeholder="No limit"
                            onChange={(e) => onSetColleagueCap?.(colleague.id, e.target.value)}
                          />
                        </label>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {needsChoice && !choiceReady && availableColleagues.length > 0 && (
            <p className="distribution-hint">
              Pick at least one colleague — until then the plan has nowhere to put these
              patients.
            </p>
          )}
        </div>

        {/* Preview = the real resolver, rolled back. Nothing saved, nothing sent. */}
        <div className="leave-plan-actions">
          <button
            type="button"
            className="btn-base btn-secondary"
            onClick={handlePreview}
            disabled={isPreviewing || previewLoading || !canPreview}
          >
            {isPreviewing || previewLoading ? (
              <Loader2 size={14} className="spin-icon" />
            ) : (
              <Eye size={14} />
            )}
            <span>{isPreviewing || previewLoading ? 'Building plan…' : 'Preview plan'}</span>
          </button>
          <span className="leave-plan-hint">
            {!canPreview
              ? 'Choose at least one colleague first.'
              : preview
                ? 'Preview is up to date for this period.'
                : 'Shows every affected patient and where they would go.'}
          </span>
        </div>

        {previewError && (
          <div className="leave-plan-error">
            <ShieldAlert size={14} />
            <span>{previewError}</span>
          </div>
        )}

        {plan && (
          <div className="leave-plan-panel">
            <div className="leave-plan-summary">
              <div className="leave-plan-numbers">
                <span className="leave-plan-number tabular-nums">{plan.total}</span>
                <span className="leave-plan-number-label">affected</span>
                <span className="leave-plan-number tabular-nums" style={{ color: 'var(--success-text)' }}>
                  {plan.placed}
                </span>
                <span className="leave-plan-number-label">can be placed</span>
                <span
                  className="leave-plan-number tabular-nums"
                  style={{ color: plan.unplaced ? 'var(--danger-text)' : 'var(--text-3)' }}
                >
                  {plan.unplaced}
                </span>
                <span className="leave-plan-number-label">need you</span>
              </div>
              <span className="badge-pill badge-neutral">
                <Info size={11} /> Preview only — nothing sent
              </span>
            </div>

            {plan.load.length > 0 && (
              <div className="leave-plan-load">
                <span className="field-hint">Colleague load</span>
                <div className="leave-plan-load-chips">
                  {plan.load.map(([name, count]) => (
                    <span key={name} className="badge-pill badge-primary tabular-nums">
                      {name} · {count}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="leave-plan-days">
              {plan.days.map((day) => (
                <div key={day.key} className="leave-plan-day">
                  <div className="leave-plan-day-head">
                    <span className="leave-plan-day-label">{formatDayLabel(day.ts)}</span>
                    <span className="leave-plan-day-count tabular-nums">
                      {day.placed.length + day.unplaced.length} patient
                      {day.placed.length + day.unplaced.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <ul className="leave-plan-list">
                    {day.placed.map((r) => (
                      <li key={r.appointment_id || r.appointment_code} className="leave-plan-row">
                        <span className="affected-patient-name">{r.patient_name}</span>
                        <span className="leave-plan-arrow">→</span>
                        <span className="leave-plan-target">
                          {r.new_doctor}
                          {r.new_start && (
                            <span className="leave-plan-time tabular-nums">
                              {formatTime(new Date(r.new_start).getTime())}
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                    {day.unplaced.map((r) => (
                      <li
                        key={r.appointment_id || r.appointment_code}
                        className="leave-plan-row is-unplaced"
                      >
                        <span className="affected-patient-name">{r.patient_name}</span>
                        <span className="leave-plan-arrow">→</span>
                        <span className="leave-plan-target">
                          {r.unplaced_text || 'No free colleague — decide manually'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Approve = the real resolver with the same window. */}
        {preview && (plan.total > 0) && (
          <button
            type="button"
            className="btn-base btn-primary"
            style={{
              width: '100%',
              marginTop: '12px',
              padding: '12px 16px',
              fontSize: '13px',
              fontWeight: 700,
              justifyContent: 'center',
              opacity: isAutoResolving ? 0.7 : 1,
              cursor: isAutoResolving ? 'wait' : 'pointer',
            }}
            onClick={handleAutoResolve}
            disabled={isAutoResolving}
          >
            <Zap size={15} />
            <span>
              {isAutoResolving
                ? 'Applying Plan — Moving Patients…'
                : `Approve & notify: place ${plan.placed} patient${plan.placed === 1 ? '' : 's'}${
                    plan.unplaced ? `, leave ${plan.unplaced} for you` : ''
                  }`}
            </span>
          </button>
        )}

        {preview && plan.total === 0 && (
          <div className="empty-affected-card" style={{ marginTop: '12px' }}>
            <Check size={16} color="var(--success-text)" />
            <span>No appointments fall inside this leave period — nothing to move.</span>
          </div>
        )}

        {/* Global Colleague Selector */}
        {availableColleagues.length > 0 && (
          <div className="colleague-reassign-card">
            <div className="colleague-label-row">
              <span className="field-label">Available On-Duty Colleague</span>
              <span className="badge-pill badge-success">
                <span className="badge-dot dot-success" />
                <span>On Duty Coverage</span>
              </span>
            </div>
            <div className="colleague-select-row">
              <select
                className="select-base flex-1"
                value={selectedColleague}
                onChange={(e) => setSelectedColleague(e.target.value)}
              >
                {availableColleagues.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.specialty}) — Available for Transfers
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* SECTION 1: Returning Patients (Ongoing Treatment — Dr. Bello recommended) */}
        <div className="affected-section">
          <div className="affected-section-header">
            <div className="section-title-group">
              <span className="affected-section-title">
                Returning Patients — Ongoing Care ({returningPatients.length})
              </span>
              <span className="badge-pill badge-primary">Preserve Continuity</span>
            </div>
            <p className="section-guidance-subtext">
              These patients have ongoing dental/medical cases with {currentDoc?.name || 'this doctor'}. Rescheduling to their next shift is strongly recommended.
            </p>
          </div>

          {returningPatients.length === 0 ? (
            <div className="empty-affected-card">
              <Check size={16} color="var(--success-text)" />
              <span>No returning patients affected.</span>
            </div>
          ) : (
            <div className="affected-list">
              {returningPatients.map((apt) => {
                // Prefer the row's own service name (real UUID ids resolve
                // nothing in the mock registry).
                const service = apt.serviceName
                  ? { name: apt.serviceName }
                  : getService(apt.serviceId);
                return (
                  <div key={apt.id} className="affected-item affected-item-returning">
                    <div className="affected-item-info">
                      <div className="affected-patient-row">
                        <span className="affected-patient-name">{apt.patientName}</span>
                        <span className="badge-pill badge-primary">
                          <span className="badge-dot dot-primary" />
                          <span>Returning Patient</span>
                        </span>
                        <span className="badge-pill badge-neutral mono-tag">
                          {apt.appointmentId || apt.id}
                        </span>
                      </div>
                      <div className="affected-time-row">
                        <span className="tabular-nums" style={{ color: 'var(--amber)', fontWeight: 600 }}>
                          {formatTime(apt.start)} – {formatTime(apt.end)}
                        </span>
                        <span className="meta-dot">·</span>
                        <span style={{ color: 'var(--text-2)' }}>{service?.name || 'Procedure'}</span>
                        <span className="meta-dot">·</span>
                        <span style={{ color: 'var(--text-3)' }}>Ongoing case with {currentDoc?.name}</span>
                      </div>
                    </div>

                    <div className="affected-item-actions">
                      {availableColleagues.length > 0 && (
                        <button
                          type="button"
                          className="btn-base btn-secondary"
                          style={{ padding: '6px 10px', fontSize: '11px', opacity: 0.85 }}
                          onClick={() => onReassign(apt.appointmentId || apt.id, selectedColleague)}
                          title={`Transfer to ${colleague?.name || 'Colleague'} (Emergency Override)`}
                        >
                          <ArrowRightLeft size={12} />
                          <span>Transfer to {colleague?.name?.split(' ')[1] || 'Colleague'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* SECTION 2: New Patients (First-Time Consultations — Safe to Transfer) */}
        <div className="affected-section" style={{ marginTop: '20px' }}>
          <div className="affected-section-header">
            <div className="section-title-group">
              <span className="affected-section-title">
                New Patients — Initial Visits ({newPatients.length})
              </span>
              <span className="badge-pill badge-success">Transferable Today</span>
            </div>
            <p className="section-guidance-subtext">
              First-time visits can be seen by an on-duty colleague today without disrupting ongoing medical history.
            </p>
          </div>

          {newPatients.length === 0 ? (
            <div className="empty-affected-card">
              <Check size={16} color="var(--success-text)" />
              <span>No new patients affected.</span>
            </div>
          ) : (
            <div className="affected-list">
              {newPatients.map((apt) => {
                const service = apt.serviceName
                  ? { name: apt.serviceName }
                  : getService(apt.serviceId);
                return (
                  <div key={apt.id} className="affected-item affected-item-new">
                    <div className="affected-item-info">
                      <div className="affected-patient-row">
                        <span className="affected-patient-name">{apt.patientName}</span>
                        <span className="badge-pill badge-success">
                          <span className="badge-dot dot-success" />
                          <span>New Patient</span>
                        </span>
                        <span className="badge-pill badge-neutral mono-tag">
                          {apt.appointmentId || apt.id}
                        </span>
                      </div>
                      <div className="affected-time-row">
                        <span className="tabular-nums" style={{ color: 'var(--amber)', fontWeight: 600 }}>
                          {formatTime(apt.start)} – {formatTime(apt.end)}
                        </span>
                        <span className="meta-dot">·</span>
                        <span style={{ color: 'var(--text-2)' }}>{service?.name || 'Procedure'}</span>
                        <span className="meta-dot">·</span>
                        <span style={{ color: 'var(--text-3)' }}>Initial Consultation</span>
                      </div>
                    </div>

                    <div className="affected-item-actions">
                      {availableColleagues.length > 0 && (
                        <button
                          type="button"
                          className="btn-base btn-primary"
                          style={{ padding: '6px 12px', fontSize: '12px' }}
                          onClick={() => onReassign(apt.appointmentId || apt.id, selectedColleague)}
                          title={`Transfer to ${colleague?.name || 'Colleague'} for today`}
                        >
                          <ArrowRightLeft size={13} />
                          <span>Transfer to {colleague?.name?.split(' ')[1] || 'Colleague'} (Today)</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="modal-actions-row" style={{ marginTop: '24px' }}>
          <button
            type="button"
            className="btn-base btn-secondary"
            onClick={() => onRestoreDuty(doctorId)}
            style={{ color: 'var(--success-text)' }}
          >
            <UserCheck size={14} />
            <span>Restore {currentDoc?.name || 'Doctor'} to On Duty</span>
          </button>

          <button type="button" className="btn-base btn-primary" onClick={onClose}>
            Done / Close
          </button>
        </div>
      </div>
    </div>
  );
};
