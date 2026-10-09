import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { LockIcon, ShieldIcon, AlertCircleIcon, LogOutIcon } from '../common/Icons';

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

  // Keyboard listener for typing PIN
  useEffect(() => {
    if (!isLocked) return;

    const handleKeyDown = (e) => {
      if (e.key >= '0' && e.key <= '9') {
        if (pin.length < 4) {
          handleDigitPress(e.key);
        }
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
      backgroundColor: 'rgba(15, 23, 42, 0.88)',
      backdropFilter: 'blur(10px)',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <div style={{
        background: '#ffffff',
        borderRadius: '20px',
        width: '100%',
        maxWidth: '380px',
        padding: '32px 28px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
        textAlign: 'center',
        transform: isShaking ? 'translateX(-6px)' : 'none',
        transition: 'transform 0.08s ease-in-out'
      }}>
        {/* Header Icon */}
        <div style={{
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          backgroundColor: 'var(--color-primary-light)',
          color: 'var(--color-primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 16px'
        }}>
          <LockIcon size={26} color="var(--color-primary)" />
        </div>

        <h2 style={{ fontSize: '1.25rem', marginBottom: '6px' }}>Desk Screen Locked</h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginBottom: '16px' }}>
          20-minute idle threshold reached.<br />
          <strong>{currentUser?.full_name}</strong> ({currentUser?.desk || 'Front Desk'})
        </p>

        {/* PIN Indicators */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '14px',
          margin: '20px 0 24px'
        }}>
          {[0, 1, 2, 3].map((index) => {
            const isFilled = pin.length > index;
            return (
              <div
                key={index}
                style={{
                  width: '18px',
                  height: '18px',
                  borderRadius: '50%',
                  border: '2px solid var(--color-primary)',
                  backgroundColor: isFilled ? 'var(--color-primary)' : 'transparent',
                  transition: 'all 0.15s ease'
                }}
              />
            );
          })}
        </div>

        {error && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            color: 'var(--color-danger)',
            fontSize: '0.8125rem',
            marginBottom: '14px'
          }}>
            <AlertCircleIcon size={14} color="var(--color-danger)" />
            <span>{error}</span>
          </div>
        )}

        {/* Numeric Keypad */}
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
              style={{
                height: '52px',
                borderRadius: '12px',
                fontSize: '1.25rem',
                fontWeight: '600',
                backgroundColor: 'var(--color-surface-subtle)',
                color: 'var(--color-text-main)',
                border: '1px solid var(--color-border)',
                transition: 'background-color 0.1s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--color-border)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--color-surface-subtle)'}
            >
              {num}
            </button>
          ))}
          <button
            onClick={handleClear}
            style={{
              height: '52px',
              borderRadius: '12px',
              fontSize: '0.875rem',
              fontWeight: '600',
              color: 'var(--color-text-muted)',
              backgroundColor: 'var(--color-surface-subtle)',
              border: '1px solid var(--color-border)'
            }}
          >
            Clear
          </button>
          <button
            onClick={() => handleDigitPress('0')}
            style={{
              height: '52px',
              borderRadius: '12px',
              fontSize: '1.25rem',
              fontWeight: '600',
              backgroundColor: 'var(--color-surface-subtle)',
              color: 'var(--color-text-main)',
              border: '1px solid var(--color-border)'
            }}
          >
            0
          </button>
          <button
            onClick={handleBackspace}
            style={{
              height: '52px',
              borderRadius: '12px',
              fontSize: '0.875rem',
              fontWeight: '600',
              color: 'var(--color-text-muted)',
              backgroundColor: 'var(--color-surface-subtle)',
              border: '1px solid var(--color-border)'
            }}
          >
            ⌫
          </button>
        </div>

        {/* Demo Pin helper badge */}
        <div style={{
          backgroundColor: 'var(--color-info-bg)',
          color: 'var(--color-info-text)',
          fontSize: '0.75rem',
          padding: '6px 10px',
          borderRadius: '8px',
          marginBottom: '16px',
          display: 'inline-block'
        }}>
          💡 Quick PIN: <strong>1234</strong>
        </div>

        {/* Logout / Switch */}
        <div>
          <button
            onClick={logout}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.8125rem',
              color: 'var(--color-danger)',
              fontWeight: '500'
            }}
          >
            <LogOutIcon size={14} color="var(--color-danger)" />
            Switch Staff / Sign Out
          </button>
        </div>
      </div>
    </div>
  );
};
