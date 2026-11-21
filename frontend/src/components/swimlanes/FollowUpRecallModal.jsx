import React, { useState, useEffect } from 'react';
import { X, CalendarCheck, CheckCircle2, Clock, Calendar as CalendarIcon, FileText, Sparkles } from 'lucide-react';

const RECALL_PRESETS = [
  { id: '1-wk', label: '1-Wk Post-Op', days: 7, defaultNote: 'Inspect surgical healing and wound site.' },
  { id: '2-wk', label: '2-Wks Stitch Check', days: 14, defaultNote: 'Suture removal and tissue recovery evaluation.' },
  { id: '1-mo', label: '1-Mo Review', days: 30, defaultNote: 'Follow-up clinical assessment on treatment outcome.' },
  { id: '6-mo', label: '6-Mos Hygiene Check', days: 180, defaultNote: 'Biannual routine dental check-up and prophylaxis.' },
];

const todayInput = () => {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
};

/**
 * FollowUpRecallModal — finish a visit and optionally schedule a patient message.
 *
 * Owner rule (B): the "Message for the patient" box starts EMPTY, and an empty
 * box means NOTHING is sent. The clinical note is always private and never
 * quoted. When a message is typed, it is sent on the chosen date and time.
 */
export const FollowUpRecallModal = ({
  isOpen,
  visit,
  onClose,
  onComplete,
}) => {
  const [selectedPreset, setSelectedPreset] = useState(RECALL_PRESETS[0].label);
  const [targetDate, setTargetDate] = useState('');
  const [notes, setNotes] = useState(RECALL_PRESETS[0].defaultNote);
  // Empty on purpose: no default text, no preset filled in.
  const [patientMessage, setPatientMessage] = useState('');
  const [sendAt, setSendAt] = useState('09:00');

  useEffect(() => {
    if (!isOpen) return;
    const d = new Date();
    d.setDate(d.getDate() + RECALL_PRESETS[0].days);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    setTargetDate(`${d.getFullYear()}-${month}-${day}`);
    setSelectedPreset(RECALL_PRESETS[0].label);
    setNotes(RECALL_PRESETS[0].defaultNote);
    setPatientMessage('');
    setSendAt('09:00');
  }, [isOpen]);

  if (!isOpen || !visit) return null;

  const handleSelectChip = (preset) => {
    setSelectedPreset(preset.label);
    const d = new Date();
    d.setDate(d.getDate() + preset.days);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    setTargetDate(`${d.getFullYear()}-${month}-${day}`);
    if (!notes || RECALL_PRESETS.some((p) => p.defaultNote === notes)) {
      setNotes(preset.defaultNote);
    }
    // The patient message is never auto-filled, by design.
  };

  const message = patientMessage.trim();
  const canSave = Boolean(targetDate);

  const handleSaveWithRecall = (event) => {
    event.preventDefault();
    if (!canSave) return;
    onComplete(visit.id, {
      preset: selectedPreset,
      targetDate,
      notes,
      patientMessage: message,
      sendAt: sendAt || '09:00',
    });
  };

  const handleSkipRecall = () => {
    onComplete(visit.id, null);
  };

  return (
    <div className="calendar-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="calendar-modal-surface followup-modal-surface" onClick={(e) => e.stopPropagation()}>
        <div className="calendar-modal-header">
          <div className="modal-title-row">
            <span className="badge-pill badge-primary mono-tag">DISCHARGE WORKFLOW</span>
            <h2 className="modal-title">Finish Visit &amp; Follow-Up</h2>
          </div>
          <button
            type="button"
            className="icon-btn-close"
            onClick={onClose}
            aria-label="Close Recall Modal"
          >
            <X size={18} />
          </button>
        </div>

        <p className="modal-subtitle">
          Completing visit for <strong style={{ color: 'var(--text)' }}>{visit.patientName}</strong> ({visit.service?.name || 'Consultation'} with {visit.doctor?.name || 'Doctor'}).
        </p>

        <form onSubmit={handleSaveWithRecall} className="walk-in-form">
          <div className="form-field">
            <label className="field-label">
              <Sparkles size={13} color="var(--amber)" />
              <span>1-Click Clinical Recall Presets</span>
            </label>
            <div className="recall-chips-grid">
              {RECALL_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={`recall-chip-btn ${selectedPreset === preset.label ? 'active' : ''}`}
                  onClick={() => handleSelectChip(preset)}
                >
                  <CalendarCheck size={13} />
                  <span>{preset.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="form-field">
            <label className="field-label">
              <CalendarIcon size={13} color="var(--text-3)" />
              <span>Target Recall Date</span>
            </label>
            <input
              type="date"
              className="input-base"
              value={targetDate}
              min={todayInput()}
              onChange={(e) => setTargetDate(e.target.value)}
              required
            />
            {!targetDate && (
              <span style={{ fontSize: '11px', color: 'var(--rose)' }}>
                Pick a date before saving.
              </span>
            )}
          </div>

          <div className="form-field">
            <label className="field-label">
              <FileText size={13} color="var(--text-3)" />
              <span>Doctor / Administrative Instructions (private)</span>
            </label>
            <textarea
              className="input-base textarea-base"
              rows={2}
              placeholder="e.g. Check gum healing, routine follow-up"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>
              This note stays inside the clinic. It is never sent to the patient.
            </span>
          </div>

          <div className="form-field">
            <label className="field-label">
              <Sparkles size={13} color="var(--text-3)" />
              <span>Message for the patient (optional)</span>
              <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text-3)' }}>
                {message.length}/300
              </span>
            </label>
            <textarea
              className="input-base textarea-base"
              rows={3}
              maxLength={300}
              placeholder="Leave empty and nothing is sent. Example: Please come back in two weeks and bring your X-ray."
              value={patientMessage}
              onChange={(e) => setPatientMessage(e.target.value)}
            />
          </div>

          <div className="form-field">
            <label className="field-label">
              <Clock size={13} color="var(--text-3)" />
              <span>Send at</span>
            </label>
            <input
              type="time"
              className="input-base"
              value={sendAt}
              onChange={(e) => setSendAt(e.target.value)}
              disabled={!message}
            />
          </div>

          <div
            className="recall-notice-banner"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: message ? 'rgba(50, 200, 80, 0.08)' : 'rgba(255, 181, 71, 0.08)',
              border: message
                ? '1px solid rgba(50, 200, 80, 0.28)'
                : '1px solid rgba(255, 181, 71, 0.25)',
              borderRadius: '6px',
              padding: '10px 12px',
              marginTop: '10px',
              fontSize: '12px',
              color: 'var(--text-2)',
            }}
          >
            <Clock size={14} color={message ? 'var(--success)' : 'var(--amber)'} style={{ flexShrink: 0 }} />
            <span>
              {message ? (
                <>
                  <strong>Message scheduled.</strong> It will be sent to{' '}
                  <strong>{visit.patientName}</strong> on <strong>{targetDate || 'the chosen date'}</strong>{' '}
                  at <strong>{sendAt || '09:00'}</strong>.
                </>
              ) : (
                <>
                  <strong>No message will be sent.</strong> This recall is saved as a private
                  clinic note only. Type a message above to schedule one.
                </>
              )}
            </span>
          </div>

          <div className="modal-actions-row" style={{ marginTop: '16px' }}>
            <button
              type="button"
              className="btn-base btn-secondary"
              onClick={handleSkipRecall}
              title="Complete the visit with no recall at all"
            >
              Skip Recall &amp; Complete
            </button>

            <button type="submit" className="btn-base btn-primary" disabled={!canSave}>
              <CheckCircle2 size={15} />
              <span>
                {message ? 'Schedule Message & Complete' : 'Save Note & Complete'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
