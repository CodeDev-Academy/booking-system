import { useState, useEffect } from 'react';

/**
 * useClinicClock — Headless hook providing a live, 1-second ticking clinic clock string.
 * Keeps timer logic out of presentational components (AGENTS.md Rule 4).
 */
export const useClinicClock = () => {
  const [timeStr, setTimeStr] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(
        now.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return { timeStr };
};
