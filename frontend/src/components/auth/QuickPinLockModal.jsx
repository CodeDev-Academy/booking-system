import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { LockIcon, AlertCircleIcon, LogOutIcon } from '../common/Icons';

export const QuickPinLockModal = () => {
  const { isLocked, currentUser, unlockWithPin, logout } = useAuth();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isShaking, setIsShaking] = useState(false);

  useEffect(() => {
    if (!isLocked) {
      setPin('');
      setError('');
    }
  }, [isLocked]);

  useEffect(() => {
    if (!isLocked) return;

    const handleKeyDown = (e) => {
      if (e.key >= '0' && e.key <= '9') {
        if (pin.length < 4) handleDigitPress(e.key);
      } else if (e.key === 'Backspace') {
        handleBackspace();
      } else if (e.key === 'Enter' && pin.length === 4) {
        handleSubmitPin(pin);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLocked, pin]);

  if (!isLocked) return null;

  const handleDigitPress = (digit) => {
    if (pin.length < 4) {
      const nextPin = pin + digit;
      setPin(nextPin);
      setError('');
      if (nextPin.length === 4) {
        handleSubmitPin(nextPin);
      }
    }
  };

  const handleBackspace = () => {
    setPin(prev => prev.slice(0, -1));
    setError('');
  };

  const handleClear = () => {
    setPin('');
    setError('');
  };

  const handleSubmitPin = (enteredPin) => {
    const result = unlockWithPin(enteredPin);
    if (!result.success) {
      setError(result.error);
      setIsShaking(true);
      setTimeout(() => {
        setIsShaking(false);
        setPin('');
      }, 500);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.88)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <div className="glass-card" style={{
        width: '100%',
        maxWidth: '360px',
        padding: '36px 28px',
        textAlign: 'center',
        transform: isShaking ? 'translateX(-6px)' : 'none',
        transition: 'transform 0.08s ease-in-out',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        background: 'rgba(20, 21, 25, 0.92)'
      }}>
        {/* Lock Icon */}
        <div style={{
          width: '52px',
          height: '52px',
          borderRadius: '50%',
          backgroundColor: 'rgba(255, 107, 0, 0.15)',
          color: 'var(--color-accent-orange)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 16px',
          boxShadow: '0 0 20px rgba(255, 107, 0, 0.3)'
        }}>
          <LockIcon size={24} color="var(--color-accent-orange)" />
        </div>

        <h2 style={{ fontSize: '1.25rem', color: '#ffffff', marginBottom: '6px' }}>Screen Locked</h2>
        <p style={{ fontSize: '0.8125rem', color: '#8e8e93', marginBottom: '20px' }}>
          Enter Quick PIN to resume shift<br />
          <strong style={{ color: '#ffffff' }}>{currentUser?.full_name}</strong>
        </p>

        {/* PIN Indicators */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '14px',
          marginBottom: '20px'
        }}>
          {[0, 1, 2, 3].map((index) => {
            const isFilled = pin.length > index;
            return (
              <div
                key={index}
                style={{
                  width: '16px',
                  height: '16px',
                  borderRadius: '50%',
                  border: isFilled ? 'none' : '2px solid rgba(255, 255, 255, 0.2)',
                  backgroundColor: isFilled ? 'var(--color-accent-orange)' : 'transparent',
                  boxShadow: isFilled ? '0 0 10px rgba(255, 107, 0, 0.6)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              />
            );
          })}
        </div>

        {error && (
          <div style={{
            color: 'var(--color-accent-coral)',
            fontSize: '0.75rem',
            marginBottom: '14px'
          }}>
            {error}
          </div>
        )}

        {/* Keypad */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '10px',
          marginBottom: '20px'
        }}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
            <button
              key={num}
              onClick={() => handleDigitPress(num.toString())}
              className="btn-pill"
              style={{
                height: '48px',
                borderRadius: 'var(--radius-md)',
                fontSize: '1.25rem',
                fontWeight: '700',
                backgroundColor: 'rgba(255, 255, 255, 0.04)',
                color: '#ffffff',
                border: '1px solid rgba(255, 255, 255, 0.08)'
              }}
            >
              {num}
            </button>
          ))}
          <button
            onClick={handleClear}
            className="btn-pill"
            style={{
              height: '48px',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.8125rem',
              color: '#8e8e93',
              backgroundColor: 'rgba(255, 255, 255, 0.03)'
            }}
          >
            Clear
          </button>
          <button
            onClick={() => handleDigitPress('0')}
            className="btn-pill"
            style={{
              height: '48px',
              borderRadius: 'var(--radius-md)',
              fontSize: '1.25rem',
              fontWeight: '700',
              backgroundColor: 'rgba(255, 255, 255, 0.04)',
              color: '#ffffff',
              border: '1px solid rgba(255, 255, 255, 0.08)'
            }}
          >
            0
          </button>
          <button
            onClick={handleBackspace}
            className="btn-pill"
            style={{
              height: '48px',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.875rem',
              color: '#8e8e93',
              backgroundColor: 'rgba(255, 255, 255, 0.03)'
            }}
          >
            ⌫
          </button>
        </div>

        <div style={{
          fontSize: '0.75rem',
          color: '#8e8e93',
          marginBottom: '16px'
        }}>
          Default PIN: <strong style={{ color: '#ffffff' }}>1234</strong>
        </div>

        <button
          onClick={logout}
          style={{
            fontSize: '0.8125rem',
            color: 'var(--color-accent-coral)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <LogOutIcon size={14} color="currentColor" />
          <span>Switch Account</span>
        </button>
      </div>
    </div>
  );
};
