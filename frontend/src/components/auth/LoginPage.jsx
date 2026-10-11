import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ShieldIcon, AlertTriangleIcon } from '../common/Icons';

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
      backgroundColor: 'var(--color-bg-base)',
      padding: '20px'
    }}>
      <div className="glass-card" style={{
        maxWidth: '420px',
        width: '100%',
        padding: '36px 32px',
        background: 'rgba(20, 21, 25, 0.85)',
        border: '1px solid rgba(255, 255, 255, 0.12)'
      }}>
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            backgroundColor: 'var(--color-accent-orange)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            boxShadow: '0 0 25px rgba(255, 107, 0, 0.45)'
          }}>
            <ShieldIcon size={26} color="#ffffff" />
          </div>
          <h1 style={{ fontSize: '1.5rem', color: '#ffffff', marginBottom: '4px' }}>MedPulse Clinic</h1>
          <p style={{ fontSize: '0.8125rem', color: '#8e8e93' }}>
            Receptionist Hub & Operations Desk
          </p>
        </div>

        {/* Deactivated Notice Banner */}
        {deactivatedNotice && (
          <div style={{
            backgroundColor: 'rgba(255, 77, 109, 0.15)',
            border: '1px solid rgba(255, 77, 109, 0.3)',
            color: 'var(--color-accent-coral)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 14px',
            fontSize: '0.8125rem',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <AlertTriangleIcon size={16} color="var(--color-accent-coral)" />
            <span>{deactivatedNotice}</span>
          </div>
        )}

        {error && (
          <div style={{
            color: 'var(--color-accent-coral)',
            fontSize: '0.8125rem',
            marginBottom: '14px',
            textAlign: 'center'
          }}>
            {error}
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Staff Email Address</label>
            <input
              type="email"
              className="form-control-glass"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="staff@medpulse.clinic"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              type="password"
              className="form-control-glass"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              required
            />
          </div>

          <button
            type="submit"
            className="btn-pill btn-pill-orange"
            style={{ width: '100%', padding: '12px', marginTop: '10px', fontSize: '0.9375rem' }}
          >
            Sign In to Desk
          </button>
        </form>

        {/* Quick Demo Access Switcher */}
        <div style={{ marginTop: '28px', paddingTop: '20px', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <p style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#8e8e93', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px', textAlign: 'center' }}>
            Fast Demo Login Roles
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button
              onClick={() => handleQuickLogin('sarah.j@medpulse.clinic')}
              className="btn-pill btn-pill-glass"
              style={{ justifyContent: 'flex-start', padding: '9px 14px', fontSize: '0.8125rem' }}
            >
              👩‍💼 <strong>Sarah Jenkins</strong> (Receptionist)
            </button>
            <button
              onClick={() => handleQuickLogin('admin@medpulse.clinic')}
              className="btn-pill btn-pill-glass"
              style={{ justifyContent: 'flex-start', padding: '9px 14px', fontSize: '0.8125rem' }}
            >
              🛡️ <strong>Michael Sterling</strong> (Admin)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
