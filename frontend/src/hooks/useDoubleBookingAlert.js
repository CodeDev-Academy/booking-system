import { useCallback, useEffect, useRef, useState } from 'react';
import { apiService } from '../services/apiService';
import { useAppModeStore } from '../stores/appModeStore';

// The backend re-checks every 10 seconds while the calendar is open. A clash
// that appears between checks is still caught on the next poll — no button to
// press, no page reload for the receptionist.
const POLL_MS = 10000;

// Stable identity for one clash, so "Silence alert" survives re-polls but a
// brand-new clash raises the overlay again.
const conflictKey = (conflict) =>
  [
    conflict.doctor_id,
    conflict.appointment_a?.id || conflict.appointment_a?.code,
    conflict.appointment_b?.id || conflict.appointment_b?.code,
  ].join('|');

/**
 * useDoubleBookingAlert — headless logic for the red double-booking alert.
 *
 * Polls GET /api/v1/conflicts/double-bookings/ every 10 seconds, keeps the
 * last good list, and tracks which clashes the receptionist has silenced.
 * `count` is the truth for the red chip (silenced or not). `isOpen` is true
 * only while at least one clash is un-silenced, so the full-screen overlay
 * cannot be dismissed permanently by accident.
 */
export const useDoubleBookingAlert = () => {
  const isDemoMode = useAppModeStore((s) => s.isDemoMode);
  const [conflicts, setConflicts] = useState([]);
  const [generatedAt, setGeneratedAt] = useState(null);
  const [, forceTick] = useState(0);
  const silencedRef = useRef(new Set());
  const mountedRef = useRef(true);

  const check = useCallback(async () => {
    if (isDemoMode) return;
    try {
      const data = await apiService.fetchDoubleBookings();
      if (!mountedRef.current) return;
      const next = Array.isArray(data?.conflicts) ? data.conflicts : [];

      // Forget silences for clashes that no longer exist: if the same pair
      // ever clashes again, the alert must speak up instead of staying mute.
      const liveKeys = new Set(next.map(conflictKey));
      let silenceChanged = false;
      [...silencedRef.current].forEach((key) => {
        if (!liveKeys.has(key)) {
          silencedRef.current.delete(key);
          silenceChanged = true;
        }
      });

      setConflicts(next);
      setGeneratedAt(data?.generated_at || new Date().toISOString());
      if (silenceChanged) forceTick((v) => v + 1);
    } catch {
      // A failed check must never break the calendar. Keep the last known
      // list (no false "all clear") and try again on the next tick.
    }
  }, [isDemoMode]);

  useEffect(() => {
    mountedRef.current = true;
    check();
    const timer = setInterval(check, POLL_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(timer);
    };
  }, [check]);

  const openConflicts = conflicts.filter((c) => !silencedRef.current.has(conflictKey(c)));
  const primaryConflict = openConflicts[0] || null;

  const silence = useCallback(() => {
    conflicts.forEach((c) => silencedRef.current.add(conflictKey(c)));
    forceTick((v) => v + 1);
    // Re-check right away so a clash fixed in the last few seconds stops
    // colouring the chip red.
    check();
  }, [conflicts, check]);

  const reopen = useCallback(() => {
    silencedRef.current.clear();
    forceTick((v) => v + 1);
    check();
  }, [check]);

  return {
    conflicts,
    count: conflicts.length,
    isOpen: Boolean(primaryConflict),
    primaryConflict,
    generatedAt,
    silence,
    reopen,
    recheck: check,
  };
};
