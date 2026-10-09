import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ShieldIcon, AlertTriangleIcon, UserIcon, LockIcon } from '../common/Icons';

export const LoginPage = () => {
  const { login, deactivatedNotice } = useAuth();
  const [email, setEmail] = useState('sarah.j@medpulse.clinic');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please provide email and password.');
      return;
    }
    const success = login(email, password);
    if (!success) {
      setError('Invalid credentials or inactive account.');
    }
  };

  const handleQuickLogin = (demoEmail) => {
    setEmail(demoEmail);
    login(demoEmail, 'password123');
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'var(--color-bg-app)',
      padding: '20px'
    }}>
      <div style={{
        maxWidth: '440px',
        width: '100%',
        backgroundColor: '#ffffff',
        borderRadius: '24px',
        padding: '36px 32px',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.03)',
        border: '1px solid var(--color-border)'
      }}>
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{
            width: '60px',
            height: '60px',
            borderRadius: '16px',
            backgroundColor: 'var(--color-primary-light)',
            color: 'var(--color-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            boxShadow: '0 4px 12px rgba(14, 116, 144, 0.15)'
          }}>
            <ShieldIcon size={32} color="var(--color-primary)" />
          </div>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '6px' }}>MedPulse Clinic</h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
            Receptionist Hub & Clinic Operating Desk
          </p>
        </div>

        {/* Deactivated Notice Banner if 401 was triggered */}
        {deactivatedNotice && (
          <div style={{
            backgroundColor: 'var(--color-danger-bg)',
            border: '1px solid var(--color-danger-border)',
            color: 'var(--color-danger-text)',
            borderRadius: '12px',
            padding: '12px 14px',
            fontSize: '0.875rem',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px'
          }}>
            <AlertTriangleIcon size={18} color="var(--color-danger)" style={{ marginTop: '2px' }} />
            <div>
              <strong>Access Revoked:</strong>
              <div>{deactivatedNotice}</div>
            </div>
          </div>
        )}

        {error && (
          <div style={{
            backgroundColor: 'var(--color-danger-bg)',
            color: 'var(--color-danger-text)',
            borderRadius: '8px',
            padding: '10px',
            fontSize: '0.8125rem',
            marginBottom: '16px'
          }}>
            {error}
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Staff Email Address</label>
            <div style={{ position: 'relative' }}>
              <input
                type="email"
                className="form-control"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="staff@medpulse.clinic"
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              type="password"
              className="form-control"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-lg"
            style={{ width: '100%', marginTop: '8px' }}
          >
            Sign In to Clinic Desk
          </button>
        </form>

        {/* Quick Demo Access Switcher */}
        <div style={{ marginTop: '28px', paddingTop: '20px', borderTop: '1px solid var(--color-border)' }}>
          <p style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px', textAlign: 'center' }}>
            Fast Demo Login Roles
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button
              onClick={() => handleQuickLogin('sarah.j@medpulse.clinic')}
              className="btn btn-secondary btn-sm"
              style={{ justifyContent: 'flex-start', padding: '10px 14px' }}
            >
              👩‍💼 <strong>Sarah Jenkins</strong> (Receptionist — Desk #1)
            </button>
            <button
              onClick={() => handleQuickLogin('admin@medpulse.clinic')}
              className="btn btn-secondary btn-sm"
              style={{ justifyContent: 'flex-start', padding: '10px 14px' }}
            >
              🛡️ <strong>Michael Sterling</strong> (Clinic Admin — Full Governance)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
