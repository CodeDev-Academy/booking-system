import React, { useState } from 'react';
import { X, KeyRound, CheckCircle2, ShieldCheck } from 'lucide-react';

export const ResetPinModal = ({
  isOpen,
  modalData,
  onClose,
  onConfirm,
}) => {
  const [newPin, setNewPin] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!/^\d{4}$/.test(newPin)) {
      setError('PIN must be exactly 4 numeric digits.');
      return;
    }
    setError('');
    onConfirm(modalData.staffId, newPin);
  };

  return (
    <div className="calendar-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="calendar-modal-surface" onClick={(e) => e.stopPropagation()} style={{ width: '420px' }}>
        <div className="calendar-modal-header">
          <div className="modal-title-row">
            <span className="badge-pill badge-primary mono-tag">SECURITY GOVERNANCE</span>
            <h2 className="modal-title">Reset Staff Quick-PIN</h2>
          </div>
          <button
            type="button"
            className="icon-btn-close"
            onClick={onClose}
            aria-label="Close Reset PIN Modal"
          >
            <X size={18} />
          </button>
        </div>

        <p className="modal-subtitle">
          Assign a new 4-digit quick-PIN for <strong style={{ color: 'var(--text)' }}>{modalData.staffName}</strong>. This PIN is used for workstation privacy lock verification.
        </p>

        {error && (
          <div className="modal-error-banner">
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="walk-in-form">
          <div className="form-field">
            <label className="field-label">
              <KeyRound size={13} color="var(--amber)" />
              <span>New 4-Digit Numeric PIN</span>
            </label>
            <input
              type="password"
              maxLength={4}
              pattern="[0-9]*"
              inputMode="numeric"
              className="input-base tabular-nums"
              placeholder="e.g. 5678"
              value={newPin}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                setNewPin(val);
                setError('');
              }}
              autoFocus
              required
            />
          </div>

          <div className="modal-actions-row" style={{ marginTop: '16px' }}>
            <button type="button" className="btn-base btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-base btn-primary">
              <ShieldCheck size={14} />
              <span>Update Quick-PIN</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
