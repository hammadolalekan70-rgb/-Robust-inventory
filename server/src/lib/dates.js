import { config } from '../config/env.js';

export const BUSINESS_TZ = config.tz;

const dtfCache = new Map();
function partsFormatter(tz) {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    dtfCache.set(tz, f);
  }
  return f;
}

function offsetMs(date, tz) {
  const parts = partsFormatter(tz).formatToParts(date);
  const map = {};
  for (const p of parts) if (p.type !== 'literal') map[p.type] = p.value;
  const hour = map.hour === '24' ? 0 : Number(map.hour);
  const asUtc = Date.UTC(+map.year, +map.month - 1, +map.day, hour, +map.minute, +map.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Convert a wall-clock time in `tz` to a UTC Date. */
export function zonedToUtc({ year, month, day, hour = 0, minute = 0, second = 0 }, tz = BUSINESS_TZ) {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  let ts = guess;
  for (let i = 0; i < 3; i += 1) {
    ts = guess - offsetMs(new Date(ts), tz);
  }
  return new Date(ts);
}

export function isValidDateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function parseDateOnly(value) {
  if (!isValidDateOnly(value)) {
    const err = new Error('Date must be in YYYY-MM-DD format');
    err.code = 'INVALID_DATE';
    throw err;
  }
  const [year, month, day] = value.split('-').map(Number);
  return { year, month, day };
}

/** Start of a business day (00:00 in business tz) as a UTC instant. */
export function startOfBusinessDay(dateOnly) {
  const { year, month, day } = parseDateOnly(dateOnly);
  return zonedToUtc({ year, month, day });
}

/** Exclusive end of a business day (next day 00:00). */
export function endOfBusinessDayExclusive(dateOnly) {
  return startOfBusinessDay(addDays(dateOnly, 1));
}

export function businessDayKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(d);
  const map = {};
  for (const p of parts) if (p.type !== 'literal') map[p.type] = p.value;
  return `${map.year}-${map.month}-${map.day}`;
}

export function todayBusinessDate() {
  return businessDayKey(new Date());
}

export function addDays(dateOnly, days) {
  const { year, month, day } = parseDateOnly(dateOnly);
  const dt = new Date(Date.UTC(year, month - 1, day + days));
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function enumerateDays(from, to) {
  const out = [];
  let cursor = from;
  let guard = 0;
  while (cursor <= to && guard < 1000) {
    out.push(cursor);
    cursor = addDays(cursor, 1);
    guard += 1;
  }
  return out;
}

/** Monday-based week key for a business date, e.g. "2026-W43". */
export function weekKey(dateOnly) {
  const { year, month, day } = parseDateOnly(dateOnly);
  const dt = new Date(Date.UTC(year, month - 1, day));
  const dow = (dt.getUTCDay() + 6) % 7; // Monday = 0
  const monday = new Date(Date.UTC(year, month - 1, day - dow));
  const y = monday.getUTCFullYear();
  const mm = String(monday.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(monday.getUTCDate()).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}

export function monthKey(dateOnly) {
  return dateOnly.slice(0, 7);
}

export function resolveRange(from, to, tz = BUSINESS_TZ) {
  const start = startOfBusinessDay(from);
  const end = endOfBusinessDayExclusive(to);
  if (start >= end) {
    const err = new Error('"from" must be on or before "to"');
    err.code = 'INVALID_RANGE';
    throw err;
  }
  return { from, to, start, end, tz };
}

export function formatBusinessDateTime(date) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: BUSINESS_TZ,
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date(date));
}

export function formatBusinessDate(date) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: BUSINESS_TZ,
    year: 'numeric',
    month: 'short',
    day: '2-digit'
  }).format(new Date(date));
}
