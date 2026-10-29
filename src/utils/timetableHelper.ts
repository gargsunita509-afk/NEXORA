import { DayOfWeek, Period, StreamType, TimetableSchedule } from '../types';

export function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function getCurrentAndNextPeriod(periods: Period[], currentMinutes: number): {
  current: Period | null;
  next: Period | null;
  status: 'before_school' | 'in_period' | 'in_break' | 'after_school';
} {
  if (!periods || periods.length === 0) {
    return { current: null, next: null, status: 'after_school' };
  }

  // Sort chronologically
  const sorted = [...periods].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  const firstStart = timeToMinutes(sorted[0].startTime);
  const lastEnd = timeToMinutes(sorted[sorted.length - 1].endTime);

  if (currentMinutes < firstStart) {
    return { current: null, next: sorted[0], status: 'before_school' };
  }

  if (currentMinutes >= lastEnd) {
    return { current: null, next: null, status: 'after_school' };
  }

  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i];
    const start = timeToMinutes(p.startTime);
    const end = timeToMinutes(p.endTime);

    if (currentMinutes >= start && currentMinutes < end) {
      const next = i + 1 < sorted.length ? sorted[i + 1] : null;
      return {
        current: p,
        next,
        status: p.isBreak ? 'in_break' : 'in_period',
      };
    }

    // Between periods (gap)
    if (i + 1 < sorted.length) {
      const nextP = sorted[i + 1];
      const nextStart = timeToMinutes(nextP.startTime);
      if (currentMinutes >= end && currentMinutes < nextStart) {
        return {
          current: null,
          next: nextP,
          status: 'in_break',
        };
      }
    }
  }

  return { current: null, next: null, status: 'after_school' };
}

export function validatePeriodTimes(
  newPeriod: { startTime: string; endTime: string; id?: string },
  existingPeriods: Period[]
): { valid: boolean; error?: string } {
  const start = timeToMinutes(newPeriod.startTime);
  const end = timeToMinutes(newPeriod.endTime);

  if (isNaN(start) || isNaN(end)) {
    return { valid: false, error: 'Invalid time format. Please use HH:MM.' };
  }

  if (start >= end) {
    return { valid: false, error: 'Start time must be strictly before end time.' };
  }

  for (const p of existingPeriods) {
    if (newPeriod.id && p.id === newPeriod.id) continue;
    const pStart = timeToMinutes(p.startTime);
    const pEnd = timeToMinutes(p.endTime);

    // Overlap condition: start < pEnd && end > pStart
    if (start < pEnd && end > pStart) {
      return {
        valid: false,
        error: `Time overlaps with existing lecture "${p.title}" (${p.startTime} - ${p.endTime}).`,
      };
    }
  }

  return { valid: true };
}

export type Weekday = 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday';

export const ALL_WEEKDAYS: Weekday[] = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

/**
 * Returns the exact weekday name (Sunday to Saturday) using the user's local device date and time.
 */
export function getLiveWeekday(date: Date = new Date()): Weekday {
  const dayIndex = date.getDay(); // 0 is Sunday, 1 is Monday ... 6 is Saturday
  return ALL_WEEKDAYS[dayIndex] || 'Sunday';
}

/**
 * Returns true if the date falls on Sunday in the user's local device time.
 */
export function isSunday(date: Date = new Date()): boolean {
  return date.getDay() === 0;
}

/**
 * Returns the active school timetable day ('Monday' through 'Saturday').
 * On Sunday, returns null because there is no regular school timetable on Sunday.
 * Never fall back to Monday on Sunday.
 */
export function getTodayDayOfWeek(date: Date = new Date()): DayOfWeek | null {
  const dayIndex = date.getDay(); // 0 is Sunday, 1 is Monday ... 6 is Saturday
  if (dayIndex === 0) {
    return null; // Sunday: No regular school timetable
  }
  const days: DayOfWeek[] = [
    'Monday', // index 0 unused
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ];
  return days[dayIndex] || null;
}

export function formatTime12h(time24: string): string {
  if (!time24) return '';
  const [hStr, mStr] = time24.split(':');
  let h = parseInt(hStr, 10);
  const m = mStr || '00';
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  h = h ? h : 12;
  return `${h}:${m} ${ampm}`;
}
