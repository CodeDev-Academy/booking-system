import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  ShieldIcon,
  LockIcon,
  Volume2Icon,
  VolumeXIcon,
  LogOutIcon,
  UserIcon,
  SparklesIcon
} from './Icons';

export const Header = ({ chimeEnabled, setChimeEnabled, onTestChime }) => {
  const { currentUser, lockScreen, remainingIdleSeconds, logout, switchUser } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);

  // Format remaining seconds
  const minutes = Math.floor(remainingIdleSeconds / 60);
  const seconds = remainingIdleSeconds % 60;
  const idleFormatted = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

  return (
    <header style={{
      backgroundColor: '#ffffff',
      borderBottom: '1px solid var(--color-border)',
      position: 'sticky',
      top: 0,
      zIndex: 500,
      boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
    }}>
      <div className="container" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: '68px'
      }}>
        {/* Brand & Clinic Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              backgroundColor: 'var(--color-primary)',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 6px rgba(14, 116, 144, 0.3)'
            }}>
              <ShieldIcon size={22} color="white" />
            </div>
            <div>
              <div style={{
                fontFamily: 'var(--font-family-heading)',
                fontWeight: '800',
                fontSize: '1.125rem',
                color: 'var(--color-primary-dark)',
                lineHeight: 1.1
              }}>
                MedPulse
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                Receptionist Desk Hub
              </div>
            </div>
          </div>

          <div style={{ height: '24px', width: '1px', backgroundColor: 'var(--color-border)' }} />

          {/* Active Shift Pill */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: 'var(--color-surface-subtle)',
            padding: '5px 12px',
            borderRadius: 'var(--radius-full)',
            border: '1px solid var(--color-border)',
            fontSize: '0.8125rem'
          }}>
            <span className="live-indicator" />
            <span style={{ fontWeight: '600', color: 'var(--color-text-main)' }}>
              Shift: Morning (08:00 – 14:00)
            </span>
            <span style={{ color: 'var(--color-text-muted)' }}>•</span>
            <span style={{ color: 'var(--color-text-muted)' }}>
              {currentUser?.desk || 'Desk #1'}
            </span>
          </div>
        </div>

        {/* Center / Right controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Live Sync Badge */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.75rem',
            fontWeight: '600',
            color: 'var(--color-success-text)',
            backgroundColor: 'var(--color-success-bg)',
            border: '1px solid var(--color-success-border)',
            padding: '4px 10px',
            borderRadius: 'var(--radius-full)'
          }}>
            <span>⚡ SSE Synced</span>
          </div>

          {/* Audio Chime Notification Toggle */}
          <button
            onClick={() => {
              setChimeEnabled(!chimeEnabled);
              if (!chimeEnabled && onTestChime) onTestChime();
            }}
            className="btn btn-secondary btn-sm"
            title={chimeEnabled ? "Chime Alerts: ON (Click to mute)" : "Chime Alerts: OFF (Click to unmute)"}
            style={{ padding: '6px 10px' }}
          >
            {chimeEnabled ? (
              <>
                <Volume2Icon size={16} color="var(--color-primary)" />
                <span style={{ fontSize: '0.75rem' }}>Chime ON</span>
              </>
            ) : (
              <>
                <VolumeXIcon size={16} color="var(--color-text-muted)" />
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Muted</span>
              </>
            )}
          </button>

          {/* Idle Lock Screen Button */}
          <button
            onClick={lockScreen}
            className="btn btn-secondary btn-sm"
            title="Auto-locks after 20 mins idle. Click to lock now."
            style={{ padding: '6px 12px', gap: '6px' }}
          >
            <LockIcon size={14} color="var(--color-text-muted)" />
            <span style={{ fontSize: '0.75rem', fontFamily: 'monospace' }}>
              Lock ({idleFormatted})
            </span>
          </button>

          {/* User Profile & Role Switcher */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="btn btn-secondary btn-sm"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '5px 12px',
                borderRadius: 'var(--radius-full)'
              }}
            >
              <div style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                backgroundColor: currentUser?.role === 'clinic_admin' ? 'var(--color-purple)' : 'var(--color-primary)',
                color: 'white',
                fontSize: '0.75rem',
                fontWeight: '700',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {currentUser?.full_name ? currentUser.full_name[0] : 'U'}
              </div>
              <span style={{ fontWeight: '600', fontSize: '0.8125rem' }}>
                {currentUser?.full_name || 'Staff User'}
              </span>
              <span style={{
                fontSize: '0.6875rem',
                backgroundColor: currentUser?.role === 'clinic_admin' ? 'var(--color-purple-bg)' : 'var(--color-primary-light)',
                color: currentUser?.role === 'clinic_admin' ? 'var(--color-purple-text)' : 'var(--color-primary-dark)',
                padding: '2px 6px',
                borderRadius: '4px',
                fontWeight: '700',
                textTransform: 'uppercase'
              }}>
                {currentUser?.role === 'clinic_admin' ? 'Admin' : 'Front Desk'}
              </span>
            </button>

            {/* Dropdown Menu */}
            {showUserMenu && (
              <div style={{
                position: 'absolute',
                right: 0,
                top: 'calc(100% + 8px)',
                width: '240px',
                backgroundColor: '#ffffff',
                borderRadius: '12px',
                boxShadow: 'var(--shadow-xl)',
                border: '1px solid var(--color-border)',
                padding: '8px',
                zIndex: 600
              }}>
                <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-border)' }}>
                  <div style={{ fontWeight: '600', fontSize: '0.875rem' }}>{currentUser?.full_name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{currentUser?.email}</div>
                </div>

                <div style={{ padding: '8px 10px' }}>
                  <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>
                    Switch Demo Persona
                  </div>
                  <button
                    onClick={() => { switchUser('staff-uuid-1'); setShowUserMenu(false); }}
                    className="btn btn-ghost btn-sm"
                    style={{ width: '100%', justifyContent: 'flex-start', padding: '6px 8px' }}
                  >
                    👩‍💼 Sarah (Receptionist)
                  </button>
                  <button
                    onClick={() => { switchUser('staff-uuid-4'); setShowUserMenu(false); }}
                    className="btn btn-ghost btn-sm"
                    style={{ width: '100%', justifyContent: 'flex-start', padding: '6px 8px' }}
                  >
                    🛡️ Michael (Admin)
                  </button>
                </div>

                <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '6px' }}>
                  <button
                    onClick={() => { logout(); setShowUserMenu(false); }}
                    className="btn btn-ghost btn-sm"
                    style={{ width: '100%', justifyContent: 'flex-start', color: 'var(--color-danger)' }}
                  >
                    <LogOutIcon size={14} color="var(--color-danger)" />
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
