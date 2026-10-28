import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthStore } from '../stores/useAuthStore';
import { soundService } from '../services/soundService';

/**
 * usePinLock — Headless Custom Hook for Workstation Privacy & Keypad Governance
 * Strict Separation of Concerns: Handles idle tracking, keyboard events, and unlock math.
 */
export const usePinLock = () => {
  const [pinInput, setPinInput] = useState('');
  const [hasError, setHasError] = useState(false);
  const idleTimerRef = useRef(null);

  const {
    isLocked,
    lockWorkstation,
    unlockWorkstation,
    failedAttempts,
    lockoutRemaining,
    decrementLockout,
    lockTimeoutMinutes,
    currentStaff,
    isEjected,
    ejectionReason,
    switchUser,
  } = useAuthStore();

  // 1. Idle Inactivity Detection (20 minutes default)
  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }
    // Only track idle when unlocked
    if (!isLocked && lockTimeoutMinutes > 0) {
      const timeoutMs = lockTimeoutMinutes * 60 * 1000;
      idleTimerRef.current = setTimeout(() => {
        lockWorkstation();
      }, timeoutMs);
    }
  }, [isLocked, lockTimeoutMinutes, lockWorkstation]);

  useEffect(() => {
    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
    const handleUserActivity = () => resetIdleTimer();

    activityEvents.forEach((event) => {
      window.addEventListener(event, handleUserActivity, { passive: true });
    });

    resetIdleTimer();

    return () => {
      activityEvents.forEach((event) => {
        window.removeEventListener(event, handleUserActivity);
      });
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
    };
  }, [resetIdleTimer]);

  // 2. Cooldown Lockout Interval (Ticks down 60-second lockout)
  useEffect(() => {
    let interval = null;
    if (lockoutRemaining > 0) {
      interval = setInterval(() => {
        decrementLockout();
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [lockoutRemaining, decrementLockout]);

  // 3. Process PIN Submission when 4 digits are reached
  const processPin = useCallback(
    (pinToTest) => {
      if (lockoutRemaining > 0) return;

      const result = unlockWorkstation(pinToTest);
      if (result.success) {
        soundService.playChime();
        setPinInput('');
        setHasError(false);
      } else {
        soundService.playErrorBlip();
        setHasError(true);
        setTimeout(() => {
          setHasError(false);
          setPinInput('');
        }, 500);
      }
    },
    [lockoutRemaining, unlockWorkstation]
  );

  // 4. On-Screen Numpad Key Press Handler
  const handleDigit = useCallback(
    (digit) => {
      if (lockoutRemaining > 0 || pinInput.length >= 4) return;
      soundService.playKeyClick();
      const nextInput = pinInput + digit;
      setPinInput(nextInput);

      if (nextInput.length === 4) {
        processPin(nextInput);
      }
    },
    [lockoutRemaining, pinInput, processPin]
  );

  const handleBackspace = useCallback(() => {
    if (lockoutRemaining > 0 || pinInput.length === 0) return;
    soundService.playKeyClick();
    setPinInput((prev) => prev.slice(0, -1));
  }, [lockoutRemaining, pinInput]);

  const handleClear = useCallback(() => {
    if (lockoutRemaining > 0) return;
    soundService.playKeyClick();
    setPinInput('');
  }, [lockoutRemaining]);

  // 5. Physical Keyboard Input Listener (Active when locked)
  useEffect(() => {
    if (!isLocked) return;

    const handleKeyDown = (e) => {
      if (lockoutRemaining > 0) return;

      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === 'Escape' || e.key.toLowerCase() === 'c') {
        e.preventDefault();
        handleClear();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLocked, lockoutRemaining, handleDigit, handleBackspace, handleClear]);

  return {
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
    lockWorkstation,
    switchUser,
  };
};
