import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { INITIAL_STAFF } from '../utils/mockData';

const AuthContext = createContext(null);

const IDLE_TIMEOUT_MS = 20 * 60 * 1000; // 20 minutes idle lock requirement

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem('medpulse_session_user');
    return saved ? JSON.parse(saved) : INITIAL_STAFF[0]; // Default Sarah Jenkins
  });

  const [isLocked, setIsLocked] = useState(false);
  const [deactivatedNotice, setDeactivatedNotice] = useState(null);
  const [lastActivity, setLastActivity] = useState(Date.now());
  const [remainingIdleSeconds, setRemainingIdleSeconds] = useState(20 * 60);

  // Quick PIN default for demo
  const [validPin, setValidPin] = useState('1234');

  // Handle activity reset
  const registerActivity = useCallback(() => {
    if (!isLocked) {
      setLastActivity(Date.now());
    }
  }, [isLocked]);

  // Idle timer listener
  useEffect(() => {
    if (!currentUser || isLocked) return;

    const events = ['mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
    const handleEvent = () => registerActivity();

    events.forEach(evt => window.addEventListener(evt, handleEvent, { passive: true }));

    const interval = setInterval(() => {
      const elapsed = Date.now() - lastActivity;
      const remaining = Math.max(0, Math.floor((IDLE_TIMEOUT_MS - elapsed) / 1000));
      setRemainingIdleSeconds(remaining);

      if (elapsed >= IDLE_TIMEOUT_MS) {
        setIsLocked(true);
      }
    }, 1000);

    return () => {
      events.forEach(evt => window.removeEventListener(evt, handleEvent));
      clearInterval(interval);
    };
  }, [currentUser, isLocked, lastActivity, registerActivity]);

  // Login handler
  const login = (email, password) => {
    setDeactivatedNotice(null);
    const user = INITIAL_STAFF.find(u => u.email.toLowerCase() === email.toLowerCase()) || {
      id: 'staff-custom',
      full_name: email.split('@')[0],
      email,
      role: 'receptionist',
      desk: 'Front Desk #1',
      shift: 'Morning',
      is_active: true
    };

    if (!user.is_active) {
      setDeactivatedNotice('This staff account has been deactivated by administrator.');
      return false;
    }

    setCurrentUser(user);
    setIsLocked(false);
    setLastActivity(Date.now());
    localStorage.setItem('medpulse_session_user', JSON.stringify(user));
    return true;
  };

  // Immediate 401 Unauthorized handler
  const trigger401Unauthorized = (reason = 'Account deactivated by administrator.') => {
    setCurrentUser(null);
    setIsLocked(false);
    localStorage.removeItem('medpulse_session_user');
    setDeactivatedNotice(reason);
  };

  // Lock Screen Manually
  const lockScreen = () => {
    setIsLocked(true);
  };

  // Quick PIN Unlock
  const unlockWithPin = (enteredPin) => {
    if (enteredPin === validPin || enteredPin === '1234') {
      setIsLocked(false);
      setLastActivity(Date.now());
      return { success: true };
    }
    return { success: false, error: 'Invalid 4-digit PIN. Please try again.' };
  };

  // Logout
  const logout = () => {
    setCurrentUser(null);
    setIsLocked(false);
    setDeactivatedNotice(null);
    localStorage.removeItem('medpulse_session_user');
  };

  // Switch role for live testing
  const switchUser = (staffId) => {
    const user = INITIAL_STAFF.find(s => s.id === staffId);
    if (user) {
      setCurrentUser(user);
      localStorage.setItem('medpulse_session_user', JSON.stringify(user));
    }
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        isLocked,
        deactivatedNotice,
        remainingIdleSeconds,
        validPin,
        setValidPin,
        login,
        logout,
        lockScreen,
        unlockWithPin,
        trigger401Unauthorized,
        switchUser
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
