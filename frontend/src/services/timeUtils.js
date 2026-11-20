/**
 * timeUtils — Aging levels and time formatting helpers.
 * LOGIC LAYER: pure functions, no JSX.
 *
 * Wave 3 / Step 3.1: every conversion between human calendar/hour strings and
 * timestamps runs on the CLINIC clock (server-synced Africa/Lagos), never the
 * visitor's. A laptop set to another timezone cannot invent or shift a slot:
 * `combineDateAndTime('2026-11-24', '10:30')` is clinic 10:30 everywhere on
 * earth, and every formatted label says the same thing on every screen.
 */

import {
  clinicNow,
  clinicParts,
  clinicDayStartOfParts,
  clinicTimeLabel,
} from './clinicTimeService';

const MIN = 60000;

// R-08 aging thresholds: 0–15m Fresh, 15–30m Waiting, >30m Delayed
export const getAgingLevel = (ageMinutes) => {
  if (ageMinutes < 15) return 'fresh';
  if (ageMinutes < 30) return 'waiting';
  return 'delayed';
};

export const AGING_LABELS = { fresh: 'Just in', waiting: 'Needs review', delayed: 'Overdue' };

export const minutesSince = (timestamp, now = clinicNow()) =>
  Math.max(0, Math.floor((now - timestamp) / MIN));

export const formatAge = (minutes) => {
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m ago` : `${h}h ago`;
};

/** Clinic-time wall clock label, e.g. "09:30 AM". */
export const formatTime = (ts) => clinicTimeLabel(ts);

/** Clinic-time day label, e.g. "Mon, Nov 24". */
export const formatDayLabel = (ts) => {
  const p = clinicParts(ts);
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `${WEEKDAYS[p.weekdayIdx]}, ${MONTHS[p.monthIdx]} ${p.day}`;
};

export const formatRange = (start, end) => `${formatTime(start)} – ${formatTime(end)}`;

/** <input type="datetime-local"> value for a timestamp, in clinic time. */
export const toDatetimeLocal = (ts) => {
  const p = clinicParts(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${p.year}-${pad(p.monthIdx + 1)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
};

export const fromDatetimeLocal = (value) => {
  // datetime-local values carry no timezone; they are clinic wall-clock by
  // definition (the receptionist typed what the clinic runs on).
  const [dateStr, timeStr] = String(value).split('T');
  return combineDateAndTime(dateStr, timeStr);
};

/** Convert timestamp to YYYY-MM-DD for <input type="date">, in clinic time. */
export const toDateInputString = (ts) => {
  const p = clinicParts(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${p.year}-${pad(p.monthIdx + 1)}-${pad(p.day)}`;
};

/** Convert timestamp to HH:MM for <input type="time">, in clinic time. */
export const toTimeInputString = (ts) => {
  const p = clinicParts(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(p.hour)}:${pad(p.minute)}`;
};

/** Combine YYYY-MM-DD string and HH:MM string into a clinic-wall-clock instant. */
export const combineDateAndTime = (dateStr, timeStr) => {
  if (!dateStr || !timeStr) return clinicNow();
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hours, minutes] = timeStr.split(':').map(Number);
  return clinicDayStartOfParts(year, month - 1, day) + (hours * 60 + minutes) * MIN;
};

/** Convert a Date/dateString and a 12-hour slot string (e.g. "09:30 AM") to
 *  a clinic-wall-clock instant. The date resolves through the clinic clock,
 *  never `new Date(y, m, d, h)` in the visitor's timezone. */
export const parseTimeSlotToTimestamp = (dateOrStr, slotStr) => {
  let dayMs;
  if (dateOrStr instanceof Date) {
    const p = clinicParts(dateOrStr.getTime());
    dayMs = clinicDayStartOfParts(p.year, p.monthIdx, p.day);
  } else if (typeof dateOrStr === 'string' && dateOrStr.includes('-')) {
    const [y, m, d] = dateOrStr.split('-').map(Number);
    dayMs = clinicDayStartOfParts(y, m - 1, d);
  } else {
    const p = clinicParts(clinicNow());
    dayMs = clinicDayStartOfParts(p.year, p.monthIdx, p.day);
  }

  let hours = 9;
  let minutes = 0;
  if (slotStr) {
    const match = slotStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (match) {
      hours = parseInt(match[1], 10);
      minutes = parseInt(match[2], 10);
      const period = match[3].toUpperCase();
      if (period === 'PM' && hours < 12) hours += 12;
      if (period === 'AM' && hours === 12) hours = 0;
    }
  }
  return dayMs + (hours * 60 + minutes) * MIN;
};
