import React from 'react';
import { AlertTriangle, X, Phone, Clock3 } from 'lucide-react';

// Step 3 — the stranded queue, as Django reports it. Pure presentation: the
// store owns loading, undo and refreshing; this panel only says what is true.
export const StrandedPatientsPanel = ({
  isOpen,
  stranded,
  onClose,
  onRefresh,
}) => {
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
