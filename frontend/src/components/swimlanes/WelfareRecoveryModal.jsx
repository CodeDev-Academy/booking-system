import React, { useState } from 'react';
import { X, HeartHandshake, Send, MessageSquare, AlertCircle } from 'lucide-react';

const WELFARE_TEMPLATES = [
  {
    id: 'empathetic',
    title: 'Standard Empathetic Welfare Check',
    text: (name, service) =>
      `Hello ${name}, we missed you today for your scheduled ${service} at Cedarcare Clinic. We hope everything is well! Please let us know if you'd like reception to find a convenient alternative time for you.`,
  },
  {
    id: 'priority',
    title: 'Priority Reschedule Token',
    text: (name, service) =>
      `Hello ${name}, your missed appointment for ${service} has been held with front desk. Reply "RESCHEDULE" to receive priority available slots with zero queue delay.`,
  },
  {
    id: 'health',
    title: 'Health Welfare & Check-in',
    text: (name) =>
      `Hello ${name}, our clinical team noticed you were unable to attend today. If your absence was due to an urgent health concern, please contact our counter hotline directly at +234 901 234 5678.`,
  },
];

export const WelfareRecoveryModal = ({
  isOpen,
  visit,
  onClose,
  onSend,
}) => {
  const [selectedTemplateId, setSelectedTemplateId] = useState(WELFARE_TEMPLATES[0].id);
  const [customText, setCustomText] = useState('');

  if (!isOpen || !visit) return null;

  const currentTemplate = WELFARE_TEMPLATES.find((t) => t.id === selectedTemplateId) || WELFARE_TEMPLATES[0];
  const generatedMessage = customText || currentTemplate.text(visit.patientName, visit.service?.name || 'Appointment');

  const handleSend = (e) => {
    e.preventDefault();
    onSend(visit.id, generatedMessage);
  };

  return (
    <div className="calendar-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="calendar-modal-surface welfare-modal-surface" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="calendar-modal-header">
          <div className="modal-title-row">
            <span className="badge-pill badge-amber mono-tag">PATIENT RECOVERY</span>
            <h2 className="modal-title">Friendly No-Show Welfare Message</h2>
          </div>
          <button
            type="button"
            className="icon-btn-close"
            onClick={onClose}
            aria-label="Close Welfare Modal"
          >
            <X size={18} />
          </button>
        </div>

        <p className="modal-subtitle">
          Recover missed patient <strong style={{ color: 'var(--text)' }}>{visit.patientName}</strong> ({visit.patientPhone}) with an empathetic, non-punitive re-engagement dispatch.
        </p>

        <form onSubmit={handleSend} className="walk-in-form">
          {/* Template Selector */}
          <div className="form-field">
            <label className="field-label">
              <MessageSquare size={13} color="var(--amber)" />
              <span>Select Recovery Message Style</span>
            </label>
            <div className="template-select-pills">
              {WELFARE_TEMPLATES.map((tmpl) => (
                <button
                  key={tmpl.id}
                  type="button"
                  className={`template-pill-btn ${selectedTemplateId === tmpl.id ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedTemplateId(tmpl.id);
                    setCustomText('');
                  }}
                >
                  {tmpl.title}
                </button>
              ))}
            </div>
          </div>

          {/* Message Preview */}
          <div className="form-field">
            <label className="field-label">
              <span>Message Preview (Dispatched via Telegram / SMS)</span>
            </label>
            <textarea
              className="input-base textarea-base"
              rows={4}
              value={customText || currentTemplate.text(visit.patientName, visit.service?.name || 'Appointment')}
              onChange={(e) => setCustomText(e.target.value)}
            />
          </div>

          {/* Actions */}
          <div className="modal-actions-row" style={{ marginTop: '16px' }}>
            <button type="button" className="btn-base btn-secondary" onClick={onClose}>
              Cancel
            </button>

            <button type="submit" className="btn-base btn-primary">
              <Send size={14} />
              <span>Dispatch Friendly Welfare Alert</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
