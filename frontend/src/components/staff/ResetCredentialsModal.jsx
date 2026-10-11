import React, { useState } from 'react';
import { XIcon, LockIcon, KeyIcon, CheckCircleIcon } from '../common/Icons';

export const ResetCredentialsModal = ({
  staff,
  isOpen,
  onClose,
  onSaveCredentials
}) => {
  if (!isOpen || !staff) return null;

  const [pin, setPin] = useState(staff.quick_pin || '1234');
  const [password, setPassword] = useState('');
  const [showSuccessHint, setShowSuccessHint] = useState(false);

  const handleSetDefaultPin = () => {
    setPin('1234');
  };

  const handleGeneratePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$';
    let generated = '';
    for (let i = 0; i < 10; i++) {
      generated += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setPassword(generated);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSaveCredentials(staff.id, {
      pin: pin,
      password: password || undefined
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-glass-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px' }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div>
            <h2 style={{ fontSize: '1.125rem', color: '#ffffff', margin: 0 }}>Reset PIN & Password</h2>
            <p style={{ fontSize: '0.75rem', color: '#8e8e93', margin: '2px 0 0' }}>
              Credentials for {staff.full_name}
            </p>
          </div>
          <button onClick={onClose} style={{ color: '#8e8e93', padding: '4px' }}>
            <XIcon size={18} color="currentColor" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Username info box */}
          <div style={{
            backgroundColor: 'rgba(255, 255, 255, 0.03)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 16px',
            border: '1px solid rgba(255, 255, 255, 0.06)'
          }}>
            <div style={{ fontSize: '0.6875rem', color: '#8e8e93', textTransform: 'uppercase', fontWeight: '700' }}>
              System Login Username
            </div>
            <div style={{ fontSize: '0.9375rem', color: '#ffffff', fontWeight: '600', marginTop: '2px' }}>
              {staff.email}
            </div>
          </div>

          {/* Quick PIN */}
          <div className="form-group" style={{ margin: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label className="form-label" style={{ margin: 0 }}>Quick PIN (4 digits)</label>
              <button
                type="button"
                onClick={handleSetDefaultPin}
                style={{ fontSize: '0.6875rem', color: 'var(--color-accent-orange)', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Set to 1234
              </button>
            </div>
            <input
              type="text"
              maxLength={4}
              pattern="\d{4}"
              className="form-control-glass"
              placeholder="e.g. 1234"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              required
            />
            <span style={{ fontSize: '0.6875rem', color: '#8e8e93', marginTop: '4px', display: 'block' }}>
              Used for instant lock screen bypass and receptionist shift takeover.
            </span>
          </div>

          {/* New Password */}
          <div className="form-group" style={{ margin: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label className="form-label" style={{ margin: 0 }}>New Account Password</label>
              <button
                type="button"
                onClick={handleGeneratePassword}
                style={{ fontSize: '0.6875rem', color: 'var(--color-accent-green)', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                ⚡ Generate Strong
              </button>
            </div>
            <input
              type="text"
              className="form-control-glass"
              placeholder="Leave blank to keep unchanged"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <span style={{ fontSize: '0.6875rem', color: '#8e8e93', marginTop: '4px', display: 'block' }}>
              Used for full portal sign-in and administrator console access.
            </span>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
            <button type="button" onClick={onClose} className="btn-pill btn-pill-glass">
              Cancel
            </button>
            <button type="submit" className="btn-pill btn-pill-orange">
              Update Credentials
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
