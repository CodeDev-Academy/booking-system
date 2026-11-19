import React, { useState } from 'react';
import { AlertTriangle, X, Phone, Clock3, ArrowRightLeft } from 'lucide-react';

// Step 3 — the stranded queue, as Django reports it. Pure presentation: the
// store owns loading, undo, moving and refreshing; this panel only says what
// is true and hands the chosen colleague back.
export const StrandedPatientsPanel = ({
  isOpen,
  stranded,
  onClose,
  onRefresh,
  onMove,
  movingId = null,
}) => {
  const [choice, setChoice] = useState({});

  if (!isOpen) return null;

  const {
    count = 0,
    days = [],
    loading = false,
    error = null,
  } = stranded || {};

  return (
    <div
      className="calendar-modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="calendar-modal-surface stranded-surface"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="calendar-modal-header">
          <div className="modal-title-row">
            <span className="badge-pill badge-neutral stranded-badge">
              <AlertTriangle size={12} />
              <span>Needs you</span>
            </span>
            <h2 className="modal-title">Patients still without a slot</h2>
            <span className="stranded-count-chip tabular-nums">{count}</span>
          </div>
          <button
            type="button"
            className="icon-btn-close"
            onClick={onClose}
            aria-label="Close stranded patients"
          >
            <X size={18} />
          </button>
        </div>

        <p className="stranded-intro">
          These patients are still booked under a doctor who is on leave. Move
          each one to a colleague, or undo the last plan while nothing has been
          sent.
        </p>

        {error ? (
          <div className="stranded-empty stranded-empty-error">{error}</div>
        ) : null}

        {!error && !loading && count === 0 ? (
          <div className="stranded-empty">
            Nobody is stranded. Every patient has a doctor who can see them.
          </div>
        ) : null}

        {!error && count > 0 ? (
          <div className="stranded-day-list">
            {days.map((day) => (
              <section
                key={`${day.date}-${day.doctor_id}`}
                className="stranded-day"
              >
                <header className="stranded-day-head">
                  <span className="stranded-day-label tabular-nums">
                    {day.label}
                  </span>
                  <span className="stranded-day-doctor">
                    {day.doctor_name}
                  </span>
                  <span className="stranded-day-reason">
                    {day.leave_reason}
                  </span>
                </header>

                {day.patients.map((patient) => (
                  <div
                    key={patient.appointment_id}
                    className="stranded-patient-row"
                  >
                    <div className="stranded-patient-main">
                      <span className="stranded-patient-name">
                        {patient.patient_name}
                      </span>
                      <span className="stranded-patient-meta tabular-nums">
                        <Clock3 size={11} />
                        {patient.time_label} &middot; {patient.service_name}{' '}
                        &middot; {patient.appointment_code}
                      </span>
                    </div>

                    <div className="stranded-patient-side">
                      {patient.patient_phone ? (
                        <a
                          className="stranded-patient-phone tabular-nums"
                          href={`tel:${patient.patient_phone}`}
                        >
                          <Phone size={11} />
                          {patient.patient_phone}
                        </a>
                      ) : null}

                      {patient.status === 'held' &&
                      patient.hold_expires_at ? (
                        <span className="stranded-hold-chip tabular-nums">
                          Hold expires{' '}
                          {new Date(patient.hold_expires_at).toLocaleTimeString(
                            'en-US',
                            { hour: 'numeric', minute: '2-digit' }
                          )}
                        </span>
                      ) : null}

                      {patient.unplaced_text ? (
                        <span className="stranded-reason">
                          {patient.unplaced_text}
                        </span>
                      ) : null}
                    </div>

                    <StrandedPatientMove
                      patient={patient}
                      choice={choice[patient.appointment_id] || ''}
                      onChoose={(doctorId) =>
                        setChoice((current) => ({
                          ...current,
                          [patient.appointment_id]: doctorId,
                        }))
                      }
                      onMove={onMove}
                      isMoving={movingId === patient.appointment_id}
                    />
                  </div>
                ))}
              </section>
            ))}
          </div>
        ) : null}

        <div className="modal-actions-row" style={{ marginTop: '18px' }}>
          <button
            type="button"
            className="btn-base btn-secondary"
            onClick={() => onRefresh()}
            disabled={loading}
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button
            type="button"
            className="btn-base btn-primary"
            onClick={onClose}
          >
            Done / Close
          </button>
        </div>
      </div>
    </div>
  );
};

// One patient, one move. Django already said who can take them at this exact
// time and why the others cannot, so this is a list, not a guess: free
// colleagues are selectable, the rest are shown with Django's reason.
const StrandedPatientMove = ({ patient, choice, onChoose, onMove, isMoving }) => {
  const colleagues = Array.isArray(patient.colleagues) ? patient.colleagues : [];
  const available = colleagues.filter((colleague) => colleague.available);
  const selected = colleagues.find((colleague) => colleague.id === choice) || null;

  if (colleagues.length === 0) {
    return (
      <div className="stranded-patient-move">
        <span className="stranded-move-hint">
          No doctor in the clinic offers {patient.service_name}. This patient
          needs a new time, not a move between colleagues.
        </span>
      </div>
    );
  }

  return (
    <div className="stranded-patient-move">
      <select
        className="stranded-move-select"
        value={choice}
        onChange={(event) => onChoose(event.target.value)}
        disabled={isMoving || available.length === 0}
        aria-label={`Colleague to take ${patient.patient_name}`}
      >
        <option value="">
          {available.length === 0 ? 'Nobody is free at this time' : 'Move to…'}
        </option>
        {colleagues.map((colleague) => (
          <option
            key={colleague.id}
            value={colleague.id}
            disabled={!colleague.available}
          >
            {colleague.available
              ? colleague.name
              : `${colleague.name} — ${colleague.text}`}
          </option>
        ))}
      </select>

      <button
        type="button"
        className="btn-base btn-secondary stranded-move-btn"
        disabled={!selected || isMoving}
        onClick={() => onMove(patient, selected.id, selected.name)}
      >
        <ArrowRightLeft size={12} />
        <span>{isMoving ? 'Moving…' : 'Move patient'}</span>
      </button>

      {available.length === 0 ? (
        <span className="stranded-move-hint">
          Nobody is free at {patient.time_label}. Open the list to see why.
        </span>
      ) : null}
    </div>
  );
};
