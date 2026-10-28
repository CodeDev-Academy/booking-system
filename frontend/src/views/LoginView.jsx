import React, { useState, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import {
  Lock,
  Mail,
  Eye,
  EyeOff,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { useAuthStore } from '../stores/useAuthStore';
import '../styles/components/login.css';

/**
 * LoginView — Dedicated Staff & Receptionist Authentication Portal
 * Strict RBAC: Access limited to Receptionists (shift accounts) and Clinic Administrator.
 * Includes multi-tier brute force defense, lockout reset, and 1-click demo presets.
 */
export const LoginView = () => {
  const navigate = useNavigate();
  const {
    isAuthenticated,
    login,
    loginLockoutUntil,
    clearLoginLockout,
    quickDemoLogin,
  } = useAuthStore();

  const [email, setEmail] = useState('sarah.aliyu@cedarcare.ng');
  const [password, setPassword] = useState('password123');
  const [honeypot, setHoneypot] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [lockoutSec, setLockoutSec] = useState(0);

  // If already authenticated, redirect to Queue
  if (isAuthenticated) {
    return <Navigate to="/queue" replace />;
  }

  // Active Lockout Countdown Timer
  useEffect(() => {
    if (!loginLockoutUntil) {
      setLockoutSec(0);
      return undefined;
    }

    const updateTimer = () => {
      const remaining = Math.max(0, Math.ceil((loginLockoutUntil - Date.now()) / 1000));
      setLockoutSec(remaining);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [loginLockoutUntil]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (!email.trim()) {
      setErrorMessage('Please enter your staff email address.');
      return;
    }
    if (!password) {
      setErrorMessage('Please enter your account password.');
      return;
    }

    setIsLoading(true);
    try {
      const result = await login({ email, password, honeypot });
      if (result.success) {
        navigate('/queue', { replace: true });
      } else {
        setErrorMessage(result.message || 'Authentication failed. Please verify your credentials.');
      }
    } catch (err) {
      setErrorMessage(err.message || 'System error during login. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickFill = (targetEmail, targetPassword) => {
    setEmail(targetEmail);
    setPassword(targetPassword);
    setErrorMessage('');
    if (clearLoginLockout) clearLoginLockout();
  };

  return (
    <div className="login-page-container">
      <div className="login-card-surface">
        {/* Clinic Header Branding */}
        <div className="login-header-group">
          <div className="login-clinic-badge">
            <ShieldCheck size={13} />
            <span>Cedarcare Health System</span>
          </div>
          <h1 className="login-title">Staff Workstation Portal</h1>
          <p className="login-subtitle">
            Secure front-desk booking, calendar triage, and clinical administration access.
          </p>
        </div>

        {/* Security Alert / Lockout Banner */}
        {lockoutSec > 0 ? (
          <div
            className="login-alert-banner login-alert-danger"
            style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertTriangle size={16} style={{ flexShrink: 0 }} />
              <div>
                <strong>Security Lockout Active:</strong> 5 failed password attempts detected. Access frozen for{' '}
                <span className="tabular-nums" style={{ fontWeight: 700 }}>
                  {Math.floor(lockoutSec / 60)}m {lockoutSec % 60}s
                </span>.
              </div>
            </div>
            <button
              type="button"
              className="btn-base btn-secondary btn-sm"
              onClick={() => {
                clearLoginLockout();
                setErrorMessage('');
              }}
              style={{
                alignSelf: 'flex-start',
                fontSize: '11px',
                padding: '3px 8px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <RotateCcw size={11} />
              <span>Clear Security Lockout &amp; Retry</span>
            </button>
          </div>
        ) : errorMessage ? (
          <div className="login-alert-banner login-alert-warning">
            <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: '1px' }} />
            <span>{errorMessage}</span>
          </div>
        ) : null}

        {/* Login Form */}
        <form className="login-form" onSubmit={handleSubmit} noValidate>
          {/* Invisible Bot Honeypot Field */}
          <input
            type="text"
            name="website_url"
            className="login-honeypot"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
          />

          {/* Email Address */}
          <div className="login-field-group">
            <label className="login-label" htmlFor="staff-email">
              <span>Staff Email</span>
            </label>
            <div className="login-input-wrapper">
              <Mail size={15} className="login-input-icon" />
              <input
                id="staff-email"
                type="email"
                className="login-input"
                placeholder="name@cedarcare.ng"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setErrorMessage('');
                }}
                disabled={isLoading}
                autoComplete="username"
                required
              />
            </div>
          </div>

          {/* Password */}
          <div className="login-field-group">
            <label className="login-label" htmlFor="staff-password">
              <span>Password</span>
            </label>
            <div className="login-input-wrapper">
              <Lock size={15} className="login-input-icon" />
              <input
                id="staff-password"
                type={showPassword ? 'text' : 'password'}
                className="login-input"
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setErrorMessage('');
                }}
                disabled={isLoading}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="login-toggle-password-btn"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            className="login-submit-btn"
            disabled={isLoading}
          >
            {isLoading ? (
              <span>Authenticating...</span>
            ) : (
              <>
                <span>Sign In to Workstation</span>
                <ArrowRight size={15} />
              </>
            )}
          </button>
        </form>

        {/* Quick 1-Click Demo Fill & Direct Login Strip */}
        <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-3)', marginBottom: '8px', fontWeight: 600 }}>
            Quick 1-Click Credentials:
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <button
              type="button"
              onClick={() => handleQuickFill('sarah.aliyu@cedarcare.ng', 'password123')}
              className="btn-base btn-secondary btn-sm"
              style={{
                fontSize: '11px',
                padding: '6px 8px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: '2px',
                textAlign: 'left',
              }}
              title="Fill Sarah Aliyu (Reception Desk)"
            >
              <span style={{ fontWeight: 600, color: 'var(--text)' }}>👩‍💼 Sarah (Reception)</span>
              <span style={{ fontSize: '10px', color: 'var(--text-3)' }}>password123</span>
            </button>

            <button
              type="button"
              onClick={() => handleQuickFill('admin@cedarcare.ng', 'password123')}
              className="btn-base btn-secondary btn-sm"
              style={{
                fontSize: '11px',
                padding: '6px 8px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: '2px',
                textAlign: 'left',
              }}
              title="Fill Dr. Ibrahim Musa (Clinic Admin)"
            >
              <span style={{ fontWeight: 600, color: 'var(--text)' }}>🩺 Dr. Ibrahim (Admin)</span>
              <span style={{ fontSize: '10px', color: 'var(--text-3)' }}>password123</span>
            </button>
          </div>
        </div>

        {/* Footer Security Notice */}
        <div className="login-footer-note" style={{ marginTop: '12px' }}>
          <ShieldCheck size={12} color="var(--success-text)" />
          <span>NDPR &amp; HIPAA Protected &bull; Authorized Reception &amp; Admin Personnel Only</span>
        </div>
      </div>
    </div>
  );
};
