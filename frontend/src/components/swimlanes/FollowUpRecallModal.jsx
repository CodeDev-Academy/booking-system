import React, { useState, useEffect } from 'react';
import { X, CalendarCheck, CheckCircle2, Clock, Calendar as CalendarIcon, FileText, Sparkles } from 'lucide-react';
import { formatTime } from '../../services/timeUtils';

const RECALL_PRESETS = [
  { id: '1-wk', label: '1-Wk Post-Op', days: 7, defaultNote: 'Inspect surgical healing and wound site.' },
  { id: '2-wk', label: '2-Wks Stitch Check', days: 14, defaultNote: 'Suture removal and tissue recovery evaluation.' },
  { id: '1-mo', label: '1-Mo Review', days: 30, defaultNote: 'Follow-up clinical assessment on treatment outcome.' },
  { id: '6-mo', label: '6-Mos Hygiene Check', days: 180, defaultNote: 'Biannual routine dental check-up and prophylaxis.' },
];

export const FollowUpRecallModal = ({
  isOpen,
  visit,
  onClose,
  onComplete,
}) => {
  const [selectedPreset, setSelectedPreset] = useState(RECALL_PRESETS[0].label);
  const [targetDate, setTargetDate] = useState('');
  const [notes, setNotes] = useState(RECALL_PRESETS[0].defaultNote);
  const [feedbackRequested, setFeedbackRequested] = useState(true);

  // Initialize date offset on open or preset change
  useEffect(() => {
    if (isOpen) {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      setTargetDate(d.toISOString().split('T')[0]);
      setSelectedPreset(RECALL_PRESETS[0].label);
      setNotes(RECALL_PRESETS[0].defaultNote);
      setFeedbackRequested(true);
    }
  }, [isOpen]);

  if (!isOpen || !visit) return null;

  const handleSelectChip = (preset) => {
    setSelectedPreset(preset.label);
    const d = new Date();
    d.setDate(d.getDate() + preset.days);
    setTargetDate(d.toISOString().split('T')[0]);
    if (!notes || RECALL_PRESETS.some((p) => p.defaultNote === notes)) {
      setNotes(preset.defaultNote);
    }
  };

  const handleSaveWithRecall = (e) => {
    e.preventDefault();
    onComplete(visit.id, {
      preset: selectedPreset,
      targetDate: targetDate || '2026-10-22',
      notes,
      feedbackRequested,
    });
  };

  const handleSkipRecall = () => {
    onComplete(visit.id, null);
  };

  return (
    <div className="calendar-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="calendar-modal-surface followup-modal-surface" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="calendar-modal-header">
          <div className="modal-title-row">
            <span className="badge-pill badge-primary mono-tag">DISCHARGE WORKFLOW</span>
            <h2 className="modal-title">Doctor-Directed Follow-Up Recall</h2>
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
          Completing visit for <strong style={{ color: 'var(--text)' }}>{visit.patientName}</strong> ({visit.service?.name || 'Consultation'} with {visit.doctor?.name || 'Doctor'}). Record any future clinical recalls to automate patient recovery.
        </p>

        <form onSubmit={handleSaveWithRecall} className="walk-in-form">
          {/* Preset Recall Chips */}
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

          {/* Target Recall Date */}
          <div className="form-field">
            <label className="field-label">
              <CalendarIcon size={13} color="var(--text-3)" />
              <span>Target Recall Date</span>
            </label>
            <input
              type="date"
              className="input-base"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              required
            />
          </div>

          {/* Internal Instructions */}
          <div className="form-field">
            <label className="field-label">
              <FileText size={13} color="var(--text-3)" />
              <span>Doctor / Administrative Instructions</span>
            </label>
            <textarea
              className="input-base textarea-base"
              rows={3}
              placeholder="e.g. Check gum healing, routine follow-up"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Automated Post-Consultation Patient Feedback Survey */}
          <div className="feedback-survey-card" style={{
            background: 'var(--surface-2)',
            border: '1px solid var(--border-hairline)',
            borderRadius: '8px',
            padding: '12px',
            marginTop: '12px',
          }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={feedbackRequested}
                onChange={(e) => setFeedbackRequested(e.target.checked)}
                style={{ marginTop: '3px', accentColor: 'var(--primary)' }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                  Queue Post-Consultation Patient Feedback Survey
                </span>
                <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>
                  Sends an automated care rating & satisfaction inquiry to {visit.patientName} via Telegram/SMS 2 hours after discharge.
                </span>
              </div>
            </label>
          </div>

          {/* Automated Recall Notification Notice */}
          <div className="recall-notice-banner" style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(255, 181, 71, 0.08)',
            border: '1px solid rgba(255, 181, 71, 0.25)',
            borderRadius: '6px',
            padding: '10px 12px',
            marginTop: '10px',
            fontSize: '12px',
            color: 'var(--text-2)',
          }}>
            <Clock size={14} color="var(--amber)" style={{ flexShrink: 0 }} />
            <span>
              <strong>Automated Return Reminder:</strong> If recall is saved, the Cedarcare engine will automatically dispatch an appointment reminder to <strong>{visit.patientName}</strong> ({visit.patientPhone}) 48h prior to <strong>{targetDate || 'target date'}</strong>.
            </span>
          </div>

          {/* Modal Actions */}
          <div className="modal-actions-row" style={{ marginTop: '16px' }}>
            <button
              type="button"
              className="btn-base btn-secondary"
              onClick={handleSkipRecall}
              title="Discharge patient without automated recall reminder"
            >
              Skip Recall & Complete
            </button>

            <button type="submit" className="btn-base btn-primary">
              <CheckCircle2 size={15} />
              <span>Save Recall & Complete Visit</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
