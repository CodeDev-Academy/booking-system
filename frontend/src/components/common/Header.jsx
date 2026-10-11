import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { LogOutIcon } from './Icons';

export const Header = ({ activeTitle }) => {
  const { currentUser, logout } = useAuth();

  return (
    <header style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '4px 0 16px 0',
      borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
      marginBottom: '8px'
    }}>
      {/* Title & Section */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{
          fontFamily: 'var(--font-family-display)',
          fontSize: '1.35rem',
          fontWeight: '800',
          color: '#ffffff',
          letterSpacing: '-0.02em',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span>MedPulse</span>
          <span style={{ color: 'var(--color-text-muted)', fontWeight: '400' }}>/</span>
          <span style={{ color: 'var(--color-text-secondary)', fontWeight: '600', fontSize: '1.15rem' }}>
            {activeTitle}
          </span>
        </div>
      </div>

      {/* Right Controls: Clean Administrator Profile */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          padding: '4px 12px 4px 6px',
          borderRadius: 'var(--radius-pill)'
        }}>
          <div style={{
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #ff6b00 0%, #ff8533 100%)',
            color: '#ffffff',
            fontSize: '0.75rem',
            fontWeight: '800',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 10px rgba(255, 107, 0, 0.3)'
          }}>
            {currentUser?.full_name ? currentUser.full_name[0] : 'M'}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '0.8125rem', fontWeight: '700', color: '#ffffff', lineHeight: 1.2 }}>
              {currentUser?.full_name || 'Michael Sterling'}
            </span>
            <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-secondary)', lineHeight: 1 }}>
              {currentUser?.role === 'clinic_admin' ? 'Administrator' : 'Receptionist'}
            </span>
          </div>

          <button
            onClick={logout}
            title="Sign Out"
            style={{
              color: '#8e8e93',
              padding: '4px',
              marginLeft: '4px',
              display: 'flex',
              alignItems: 'center'
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-accent-coral)'}
            onMouseLeave={(e) => e.currentTarget.style.color = '#8e8e93'}
          >
            <LogOutIcon size={14} color="currentColor" />
          </button>
        </div>
      </div>
    </header>
  );
};
