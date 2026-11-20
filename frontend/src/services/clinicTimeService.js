/**
 * clinicTimeService — the clinic's clock is the site's only clock.
 *
 * Wave 3 / Step 3.1. The clinic operates in West Africa time (Africa/Lagos).
 * Every date and hour the site shows must come from HERE, never from the
 * visitor's computer: a wrong laptop clock or a foreign timezone must not be
 * able to shift the schedule, mark the wrong day as "today", or drift the
 * hold countdowns.
 *
 * How it stays honest:
 * - `configureClinicClock()` receives the server's own time (from
 *   GET /api/v1/health/, which publishes `server_time` + `timezone`), and
 *   every `clinicNow()` afterwards is corrected by that offset — a device
 *   that is minutes or hours slow simply stops mattering.
 * - Date/hour labels and day keys are formatted in the clinic timezone with
 *   the browser's built-in world-clock formatter (Intl), not the device
 *   locale, so the same instant reads the same on every computer on earth.
 *
 * LOGIC LAYER ONLY: no JSX, no fetch (apiService feeds it), no DOM.
 */

const DEFAULT_CLINIC_TIMEZONE = 'Africa/Lagos';
const DAY_MS = 24 * 60 * 60 * 1000;

let clinicTimezone = DEFAULT_CLINIC_TIMEZONE;
/** serverNow - deviceNow, applied on every clinicNow() so a wrong device clock is corrected. */
let serverOffsetMs = 0;

const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatter(options) {
  return new Intl.DateTimeFormat('en-US', { timeZone: clinicTimezone, ...options });
}

function partsFormatter() {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: clinicTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/**
 * Feed the server's clock in. Called on boot and periodically afterwards.
 * Both fields are optional; an invalid timezone is ignored (kept as-is) so a
 * bad payload can never blank the schedule.
 */
export function configureClinicClock({ timezone, serverTime } = {}) {
  if (typeof timezone === 'string' && timezone.trim()) {
    try {
      // Throws on an unknown zone - that is the validation.
      new Intl.DateTimeFormat('en-US', { timeZone: timezone });
      clinicTimezone = timezone;
    } catch (e) {
      /* keep the current, known-good zone */
    }
  }
  if (typeof serverTime === 'string' && serverTime) {
    const serverMs = Date.parse(serverTime);
    // NaN guards a malformed payload from corrupting the offset.
    if (Number.isFinite(serverMs)) {
      serverOffsetMs = serverMs - Date.now();
    }
  }
}

/** The clinic's "now" — device clock, corrected by the server's. */
export function clinicNow() {
  return Date.now() + serverOffsetMs;
}

/** The clinic timezone currently in force (for display/debug). */
export function clinicTimezoneName() {
  return clinicTimezone;
}

/** Full calendar parts of an instant, in clinic time. monthIdx is 0-based. */
export function clinicParts(ts) {
  const raw = {};
  for (const p of partsFormatter().formatToParts(new Date(ts))) {
    raw[p.type] = p.value;
  }
  const year = Number(raw.year);
  const monthIdx = Number(raw.month) - 1;
  const day = Number(raw.day);
  const hour = Number(raw.hour === '24' ? '0' : raw.hour);
  return {
    year,
    monthIdx,
    day,
    hour,
    minute: Number(raw.minute),
    weekdayIdx: WEEKDAY_INDEX[raw.weekday] ?? 0,
    weekdayName: WEEKDAY_NAMES[WEEKDAY_INDEX[raw.weekday] ?? 0],
    dayKey: `${raw.year}-${raw.month}-${raw.day}`,
  };
}

/** 'YYYY-MM-DD' of an instant, in clinic time. */
export function clinicDayKey(ts) {
  const raw = {};
  for (const p of partsFormatter().formatToParts(new Date(ts))) {
    if (p.type === 'year' || p.type === 'month' || p.type === 'day') raw[p.type] = p.value;
  }
  return `${raw.year}-${raw.month}-${raw.day}`;
}

/** '10:30 AM' of an instant, in clinic time — the label patients were told. */
export function clinicTimeLabel(ts) {
  return formatter({ hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(ts));
}

/**
 * The instant at which the given CLINIC date begins (clinic 00:00).
 * monthIdx is 0-based like Date's. Robust for any zone, DST included: it
 * anchors on the date's midday, walks the calendar difference first, then
 * snaps the hour to midnight.
 */
export function clinicDayStartOfParts(year, monthIdx, day) {
  // Date.UTC normalizes overflow (day 32, monthIdx -1) so callers may step
  // dates arithmetically, exactly like Date always allowed.
  let guess = Date.UTC(year, monthIdx, day, 12);
  for (let i = 0; i < 3; i += 1) {
    const p = clinicParts(guess);
    const target = Date.UTC(year, monthIdx, day);
    const actual = Date.UTC(p.year, p.monthIdx, p.day);
    const dayShift = Math.round((target - actual) / DAY_MS);
    if (dayShift !== 0) {
      guess -= dayShift * DAY_MS;
      continue;
    }
    const midnightOffset = p.hour * 60 * 60 * 1000 + p.minute * 60 * 1000;
    if (midnightOffset !== 0) {
      guess -= midnightOffset;
    }
    break;
  }
  return guess;
}

/**
 * The instant at which the clinic's day begins, `offset` days from clinic
 * today. This is the anchor the calendar's day engine runs on.
 */
export function clinicDayStartOffset(offset) {
  const today = clinicParts(clinicNow());
  return clinicDayStartOfParts(today.year, today.monthIdx, today.day) + offset * DAY_MS;
}

/** Days in a clinic month (monthIdx 0-based) — pure date math, any zone. */
export function daysInClinicMonth(year, monthIdx) {
  return new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();
}

/** 0 = Monday ... 6 = Sunday, matching the calendar grid's Monday start. */
export function clinicMondayFirstWeekdayIdx(year, monthIdx) {
  return (new Date(Date.UTC(year, monthIdx, 1)).getUTCDay() + 6) % 7;
}
