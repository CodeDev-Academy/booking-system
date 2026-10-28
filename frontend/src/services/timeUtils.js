/**
 * timeUtils — Aging levels and time formatting helpers.
 * LOGIC LAYER: pure functions, no JSX.
 */

const MIN = 60000;

// R-08 aging thresholds: 0–15m Fresh, 15–30m Waiting, >30m Delayed
export const getAgingLevel = (ageMinutes) => {
  if (ageMinutes < 15) return 'fresh';
  if (ageMinutes < 30) return 'waiting';
  return 'delayed';
};

export const AGING_LABELS = { fresh: 'Just in', waiting: 'Needs review', delayed: 'Overdue' };

export const minutesSince = (timestamp, now) => Math.max(0, Math.floor((now - timestamp) / MIN));

export const formatAge = (minutes) => {
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m ago` : `${h}h ago`;
};

export const formatTime = (ts) =>
  new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

export const formatDayLabel = (ts) =>
  new Date(ts).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

export const formatRange = (start, end) => `${formatTime(start)} – ${formatTime(end)}`;

/** <input type="datetime-local"> value for a timestamp */
export const toDatetimeLocal = (ts) => {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const fromDatetimeLocal = (value) => new Date(value).getTime();

/** Convert timestamp to YYYY-MM-DD for <input type="date"> */
export const toDateInputString = (ts) => {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Convert timestamp to HH:MM for <input type="time"> */
export const toTimeInputString = (ts) => {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Combine YYYY-MM-DD string and HH:MM string into a unix timestamp ms */
export const combineDateAndTime = (dateStr, timeStr) => {
  if (!dateStr || !timeStr) return Date.now();
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hours, minutes] = timeStr.split(':').map(Number);
  const d = new Date(year, month - 1, day, hours, minutes, 0, 0);
  return d.getTime();
};

/** Convert a Date/dateString and a 12-hour slot string (e.g. "09:30 AM") to unix timestamp ms */
export const parseTimeSlotToTimestamp = (dateOrStr, slotStr) => {
  let baseDate = dateOrStr instanceof Date ? new Date(dateOrStr) : new Date();
  if (typeof dateOrStr === 'string' && dateOrStr.includes('-')) {
    const [y, m, d] = dateOrStr.split('-').map(Number);
    baseDate = new Date(y, m - 1, d);
  }
  if (!slotStr) {
    baseDate.setHours(9, 0, 0, 0);
    return baseDate.getTime();
  }
  const match = slotStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (match) {
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const period = match[3].toUpperCase();
    if (period === 'PM' && hours < 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
    baseDate.setHours(hours, minutes, 0, 0);
  }
  return baseDate.getTime();
};

