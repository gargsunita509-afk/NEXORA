export const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000; // UTC+05:30 (Asia/Kolkata)
export const DIARY_DAILY_ROLLOVER_HOUR_IST = 14; // 2:00 PM IST

export interface DiaryCycleInfo {
  timezone: 'Asia/Kolkata';
  rolloverHourIST: number;
  rolloverLabel: string;
  serverTimestamp: number;
  istFormattedTime: string;
  calendarDateIST: string;
  activeCycleDate: string;
  previousCycleDate: string;
  isAfter2PM: boolean;
  cycleStartMs: number;
  nextRefreshAtMs: number;
  msUntilNextRefresh: number;
  dailyEntryId: string;
}

/**
 * Shifts a YYYY-MM-DD date string by deltaDays using pure UTC calendar arithmetic.
 */
export function shiftDateString(dateString: string, deltaDays: number): string {
  const [y, m, d] = dateString.split('-').map(Number);
  if (!y || !m || !d) return dateString;
  const shifted = new Date(Date.UTC(y, m - 1, d + deltaDays));
  const sy = shifted.getUTCFullYear();
  const sm = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const sd = String(shifted.getUTCDate()).padStart(2, '0');
  return `${sy}-${sm}-${sd}`;
}

/**
 * Computes the authoritative 2:00 PM IST (Asia/Kolkata) daily diary cycle state
 * from a server or reference UTC timestamp (in milliseconds).
 *
 * Rules:
 * - Before 14:00:00 IST on calendar day D, the active daily cycle is D - 1 (started yesterday at 2:00 PM IST).
 * - At or after 14:00:00 IST on calendar day D, the active daily cycle is D (started today at 2:00 PM IST).
 */
export function getDiaryCycleInfo(nowMs: number = Date.now()): DiaryCycleInfo {
  const safeNowMs = Number.isFinite(nowMs) ? nowMs : Date.now();
  const istMs = safeNowMs + IST_OFFSET_MS;
  const istDate = new Date(istMs);

  const year = istDate.getUTCFullYear();
  const month = istDate.getUTCMonth() + 1;
  const day = istDate.getUTCDate();
  const hour = istDate.getUTCHours();
  const minute = istDate.getUTCMinutes();
  const second = istDate.getUTCSeconds();

  const calendarDateIST = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const isAfter2PM = hour >= DIARY_DAILY_ROLLOVER_HOUR_IST;

  const activeCycleDate = isAfter2PM ? calendarDateIST : shiftDateString(calendarDateIST, -1);
  const previousCycleDate = isAfter2PM
    ? shiftDateString(calendarDateIST, -1)
    : shiftDateString(calendarDateIST, -2);

  const cycleStartMs = isAfter2PM
    ? Date.UTC(year, month - 1, day, DIARY_DAILY_ROLLOVER_HOUR_IST, 0, 0, 0) - IST_OFFSET_MS
    : Date.UTC(year, month - 1, day - 1, DIARY_DAILY_ROLLOVER_HOUR_IST, 0, 0, 0) - IST_OFFSET_MS;

  const nextRefreshAtMs = isAfter2PM
    ? Date.UTC(year, month - 1, day + 1, DIARY_DAILY_ROLLOVER_HOUR_IST, 0, 0, 0) - IST_OFFSET_MS
    : Date.UTC(year, month - 1, day, DIARY_DAILY_ROLLOVER_HOUR_IST, 0, 0, 0) - IST_OFFSET_MS;

  const msUntilNextRefresh = Math.max(0, nextRefreshAtMs - safeNowMs);
  const istFormattedTime = `${calendarDateIST} ${String(hour).padStart(2, '0')}:${String(minute).padStart(
    2,
    '0'
  )}:${String(second).padStart(2, '0')} IST`;

  return {
    timezone: 'Asia/Kolkata',
    rolloverHourIST: DIARY_DAILY_ROLLOVER_HOUR_IST,
    rolloverLabel: '2:00 PM IST (Asia/Kolkata)',
    serverTimestamp: safeNowMs,
    istFormattedTime,
    calendarDateIST,
    activeCycleDate,
    previousCycleDate,
    isAfter2PM,
    cycleStartMs,
    nextRefreshAtMs,
    msUntilNextRefresh,
    dailyEntryId: `diary-daily-${activeCycleDate}`,
  };
}

/**
 * Returns the active YYYY-MM-DD diary cycle date in Asia/Kolkata (2:00 PM IST rollover).
 */
export function getActiveDiaryCycleDateIST(nowMs: number = Date.now()): string {
  return getDiaryCycleInfo(nowMs).activeCycleDate;
}

/**
 * Formats a Date object into local YYYY-MM-DD string without UTC shifting.
 */
export function getLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns a human-friendly format like "Monday, October 12, 2026"
 */
export function formatReadableDate(dateString: string): string {
  if (!dateString) return '';
  const [y, m, d] = dateString.split('-').map(Number);
  if (!y || !m || !d) return dateString;
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Parses YYYY-MM-DD safely into year, month, day
 */
export function parseLocalDate(dateString: string): { year: number; month: number; day: number } {
  const [year, month, day] = dateString.split('-').map(Number);
  return { year, month, day };
}

