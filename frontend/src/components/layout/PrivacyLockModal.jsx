import React from 'react';
import { Lock, ShieldAlert, AlertTriangle, Delete, RotateCcw } from 'lucide-react';
import { usePinLock } from '../../hooks/usePinLock';
import '../../styles/components/privacyLock.css';

/**
 * PrivacyLockModal — Frosted Glass Workstation Lock Overlay
 * Pure presentational component governed by tasteskill.dev aesthetics.
 * Protects patient confidentiality during front-desk counter absences.
 */
export const PrivacyLockModal = () => {
  const {
    isLocked,
    pinInput,
    hasError,
    failedAttempts,
    lockoutRemaining,
    currentStaff,
    isEjected,
    ejectionReason,
    handleDigit,
    handleBackspace,
    handleClear,
    switchUser,
  } = usePinLock();

  // If not locked, do not render modal
  if (!isLocked) return null;

  const isNumpadDisabled = lockoutRemaining > 0;

  return (
    <div
      className="privacy-lock-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Workstation Privacy Lock"
    >
      <div className="privacy-lock-card">
        {/* Header & Staff Identity */}
        <div className="lock-header">
          <div className="lock-avatar-badge">
            <span>{currentStaff?.avatar || 'SA'}</span>
            <div className="lock-icon-corner">
              <Lock size={10} />
            </div>
          </div>
          <span className="lock-clinic-name">Cedarcare Specialist Clinic</span>
          <h2 className="lock-title">Workstation Locked</h2>
          <span className="lock-staff-subtext">
            {currentStaff?.name || 'Sarah Aliyu'} &bull; {currentStaff?.shift || 'Morning Shift'}
          </span>
        </div>

        {/* Session Suspension Banner */}
        {isEjected && (
          <div className="ejection-banner">
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700', marginBottom: '4px' }}>
              <ShieldAlert size={14} />
              <span>Access Suspended — Session Locked</span>
            </div>
            <span>{ejectionReason || 'Staff credentials revoked by Clinic Administrator.'}</span>
          </div>
        )}

        {/* Cooldown Banner */}
        {lockoutRemaining > 0 && (
          <div className="lockout-banner">
            <AlertTriangle size={14} />
            <span>
              Too many incorrect attempts. Please wait{' '}
              <strong className="tabular-nums">{lockoutRemaining}s</strong>
            </span>
          </div>
        )}

        {/* 4-Dot PIN Indicator */}
        <div
          className={`pin-dots-container ${hasError ? 'shake' : ''}`}
          aria-label={`PIN entered: ${pinInput.length} of 4 digits`}
        >
          {[0, 1, 2, 3].map((index) => (
            <div
              key={index}
              className={`pin-dot ${index < pinInput.length ? 'filled' : ''}`}
            />
          ))}
        </div>

        {/* Tactile 3x4 Numpad */}
        <div className="numpad-grid">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              className="numpad-btn tabular-nums"
              onClick={() => handleDigit(digit)}
              disabled={isNumpadDisabled}
              aria-label={`Digit ${digit}`}
            >
              {digit}
            </button>
          ))}

          {/* Clear Key */}
          <button
            type="button"
            className="numpad-btn action-btn"
            onClick={handleClear}
            disabled={isNumpadDisabled || pinInput.length === 0}
            title="Clear PIN"
            aria-label="Clear PIN"
          >
            <RotateCcw size={16} />
          </button>

          {/* Zero Key */}
          <button
            type="button"
            className="numpad-btn tabular-nums"
            onClick={() => handleDigit('0')}
            disabled={isNumpadDisabled}
            aria-label="Digit 0"
          >
            0
          </button>

          {/* Backspace Key */}
          <button
            type="button"
            className="numpad-btn action-btn"
            onClick={handleBackspace}
            disabled={isNumpadDisabled || pinInput.length === 0}
            title="Backspace"
            aria-label="Backspace"
          >
            <Delete size={18} />
          </button>
        </div>

        {/* Footer Actions */}
        <div className="lock-footer">
          {failedAttempts > 0 && lockoutRemaining === 0 && (
            <span style={{ fontSize: '11px', color: 'var(--danger-text)', fontWeight: '600' }}>
              Incorrect PIN ({3 - failedAttempts} attempt{3 - failedAttempts !== 1 ? 's' : ''} left)
            </span>
          )}

          <span className="demo-pin-hint">
            Quick-PIN for {currentStaff?.name?.split(' ')[0] || 'Staff'}:{' '}
            <strong style={{ color: 'var(--amber)', letterSpacing: '0.05em' }}>
              {currentStaff?.pin || '1234'}
            </strong>
          </span>

          <button
            type="button"
            className="switch-staff-btn"
            onClick={switchUser}
            title="Log out and return to the main sign in portal"
          >
            Switch User / Master Password
          </button>
        </div>
      </div>
    </div>
  );
};
