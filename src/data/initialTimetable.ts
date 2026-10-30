import type { DayOfWeek, Period, TimetableSchedule, StreamType, SubjectAllocation } from '../types/index.ts';

export type TimetableVersion = 'current' | 'old';

export const CURRENT_CLASS_IN_CHARGE = 'Diksha Mam';
export const OLD_CLASS_IN_CHARGE = 'Alka Mam';

export const DAYS_OF_WEEK: DayOfWeek[] = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

// Session-scoped active timetable version.
// Always starts as 'current' (CURRENT TIMETABLE) on every fresh app opening,
// and remains preserved during module navigation within the active session.
let activeTimetableVersion: TimetableVersion = 'current';
const versionListeners = new Set<(version: TimetableVersion) => void>();

export function getActiveTimetableVersion(): TimetableVersion {
  return activeTimetableVersion;
}

export function setActiveTimetableVersion(version: TimetableVersion): void {
  activeTimetableVersion = version === 'old' ? 'old' : 'current';
  versionListeners.forEach((listener) => {
    try {
      listener(activeTimetableVersion);
    } catch {
      // ignore listener errors
    }
  });
}

export function resetTimetableVersionToDefault(): void {
  setActiveTimetableVersion('current');
}

export function subscribeTimetableVersion(listener: (version: TimetableVersion) => void): () => void {
  versionListeners.add(listener);
  return () => {
    versionListeners.delete(listener);
  };
}

export function getActiveClassInCharge(version: TimetableVersion = activeTimetableVersion): string {
  return version === 'old' ? OLD_CLASS_IN_CHARGE : CURRENT_CLASS_IN_CHARGE;
}

/**
 * NEW / CURRENT CLASS 11 TIMETABLE (Default)
 * Class In-Charge: Diksha Mam
 */
export function createCurrentDaySchedule(day: DayOfWeek): Period[] {
  const isFirstHalfOfWeek = day === 'Monday' || day === 'Tuesday' || day === 'Wednesday';

  return [
    // 1. SCHOOL ENTRY TIME — 7:30 AM to 8:00 AM
    {
      id: `${day}-entry`,
      periodNumber: -10,
      title: 'School Entry Time',
      startTime: '07:30',
      endTime: '08:00',
      isMorningRoutine: true,
      statusText: 'Campus Entry',
      description: 'Campus gates open, student entry, arrival verification and settling in.',
      notes: 'Campus gates open, student entry, arrival verification and settling in.',
      allocations: {
        PCM: { subject: 'School Entry Time', teacher: 'Campus Arrival' },
        PCB: { subject: 'School Entry Time', teacher: 'Campus Arrival' },
        HUMANITIES: { subject: 'School Entry Time', teacher: 'Campus Arrival' },
        COMMERCE: { subject: 'School Entry Time', teacher: 'Campus Arrival' },
      },
    },

    // 2. MORNING PRAYER — 8:00 AM to 8:20 AM
    {
      id: `${day}-prayer`,
      periodNumber: -11,
      title: 'Morning Prayer',
      startTime: '08:00',
      endTime: '08:20',
      isMorningRoutine: true,
      statusText: 'Morning Assembly',
      description: 'Morning assembly, school prayer, pledge, thought for the day, and national anthem.',
      notes: 'Morning assembly, school prayer, pledge, thought for the day, and national anthem.',
      allocations: {
        PCM: { subject: 'Morning Prayer', teacher: 'School Assembly' },
        PCB: { subject: 'Morning Prayer', teacher: 'School Assembly' },
        HUMANITIES: { subject: 'Morning Prayer', teacher: 'School Assembly' },
        COMMERCE: { subject: 'Morning Prayer', teacher: 'School Assembly' },
      },
    },

    // ZERO LECTURE — 8:20 AM to 8:30 AM
    {
      id: `${day}-p0`,
      periodNumber: 0,
      title: 'Zero Lecture',
      startTime: '08:20',
      endTime: '08:30',
      notes: 'Class meeting, attendance & morning announcements',
      allocations: {
        PCM: { subject: 'Class Meeting & Announcements', teacher: 'Diksha Mam' },
        PCB: { subject: 'Class Meeting & Announcements', teacher: 'Diksha Mam' },
        HUMANITIES: { subject: 'Class Meeting & Announcements', teacher: 'Diksha Mam' },
        COMMERCE: { subject: 'Class Meeting & Announcements', teacher: 'Diksha Mam' },
      },
    },

    // 1st LECTURE — 8:30 AM to 9:10 AM
    // PCM: Physics — Diksha Mam
    // PCB: Physics — Diksha Mam
    // COMMERCE: Business Studies — Parul Mam
    // HUMANITIES: Free (no teacher)
    {
      id: `${day}-p1`,
      periodNumber: 1,
      title: 'First Lecture',
      startTime: '08:30',
      endTime: '09:10',
      allocations: {
        PCM: { subject: 'Physics', teacher: 'Diksha Mam' },
        PCB: { subject: 'Physics', teacher: 'Diksha Mam' },
        COMMERCE: { subject: 'Business Studies', teacher: 'Parul Mam' },
        HUMANITIES: { subject: 'Free', isFree: true },
      },
    },

    // 2nd LECTURE — 9:10 AM to 9:50 AM
    // PCM, PCB, COMMERCE, HUMANITIES: English — Nancy Mam
    {
      id: `${day}-p2`,
      periodNumber: 2,
      title: 'Second Lecture',
      startTime: '09:10',
      endTime: '09:50',
      allocations: {
        PCM: { subject: 'English', teacher: 'Nancy Mam' },
        PCB: { subject: 'English', teacher: 'Nancy Mam' },
        COMMERCE: { subject: 'English', teacher: 'Nancy Mam' },
        HUMANITIES: { subject: 'English', teacher: 'Nancy Mam' },
      },
    },

    // FRUIT BREAK — 9:50 AM to 10:00 AM
    {
      id: `${day}-fruit-break`,
      periodNumber: -1,
      title: 'Fruit Break',
      startTime: '09:50',
      endTime: '10:00',
      isBreak: true,
      allocations: {
        PCM: { subject: 'Fruit Break', teacher: 'Nutrition & Relaxation' },
        PCB: { subject: 'Fruit Break', teacher: 'Nutrition & Relaxation' },
        HUMANITIES: { subject: 'Fruit Break', teacher: 'Nutrition & Relaxation' },
        COMMERCE: { subject: 'Fruit Break', teacher: 'Nutrition & Relaxation' },
      },
    },

    // 3rd LECTURE — 10:00 AM to 10:40 AM
    // PCM: Chemistry — Harshu Mam
    // PCB: Chemistry — Harshu Mam
    // COMMERCE: Accountancy — Alka Mam
    // HUMANITIES: Political Science (Mon–Wed); History (Thu–Sat) — Ritu Mam
    {
      id: `${day}-p3`,
      periodNumber: 3,
      title: 'Third Lecture',
      startTime: '10:00',
      endTime: '10:40',
      allocations: {
        PCM: { subject: 'Chemistry', teacher: 'Harshu Mam' },
        PCB: { subject: 'Chemistry', teacher: 'Harshu Mam' },
        COMMERCE: { subject: 'Accountancy', teacher: 'Alka Mam' },
        HUMANITIES: isFirstHalfOfWeek
          ? { subject: 'Political Science', teacher: 'Ritu Mam' }
          : { subject: 'History', teacher: 'Ritu Mam' },
      },
    },

    // 4th LECTURE — 10:40 AM to 11:20 AM
    // PCM: Mathematics — Anita Mam
    // PCB: Biology — Shalini Mam
    // COMMERCE: Free
    // HUMANITIES: Free
    {
      id: `${day}-p4`,
      periodNumber: 4,
      title: 'Fourth Lecture',
      startTime: '10:40',
      endTime: '11:20',
      allocations: {
        PCM: { subject: 'Mathematics', teacher: 'Anita Mam' },
        PCB: { subject: 'Biology', teacher: 'Shalini Mam' },
        COMMERCE: { subject: 'Free', isFree: true },
        HUMANITIES: { subject: 'Free', isFree: true },
      },
    },

    // LUNCH — 11:20 AM to 11:45 AM
    {
      id: `${day}-lunch`,
      periodNumber: -2,
      title: 'Lunch Break',
      startTime: '11:20',
      endTime: '11:45',
      isBreak: true,
      allocations: {
        PCM: { subject: 'Lunch Break', teacher: 'Cafeteria & Recess' },
        PCB: { subject: 'Lunch Break', teacher: 'Cafeteria & Recess' },
        HUMANITIES: { subject: 'Lunch Break', teacher: 'Cafeteria & Recess' },
        COMMERCE: { subject: 'Lunch Break', teacher: 'Cafeteria & Recess' },
      },
    },

    // 5th LECTURE — 11:45 AM to 12:25 PM
    // PCM: Physics (Mon–Wed); Chemistry (Thu–Sat)
    // PCB: Physics (Mon–Wed); Chemistry (Thu–Sat)
    // COMMERCE: Economics — Alka Mam
    // HUMANITIES: Economics — Alka Mam
    {
      id: `${day}-p5`,
      periodNumber: 5,
      title: 'Fifth Lecture',
      startTime: '11:45',
      endTime: '12:25',
      allocations: {
        PCM: isFirstHalfOfWeek ? { subject: 'Physics' } : { subject: 'Chemistry' },
        PCB: isFirstHalfOfWeek ? { subject: 'Physics' } : { subject: 'Chemistry' },
        COMMERCE: { subject: 'Economics', teacher: 'Alka Mam' },
        HUMANITIES: { subject: 'Economics', teacher: 'Alka Mam' },
      },
    },

    // 6th LECTURE — 12:25 PM to 1:05 PM
    // PCM, PCB, COMMERCE, HUMANITIES: Physical Education (Mon–Wed); Fine Arts (Thu–Sat)
    {
      id: `${day}-p6`,
      periodNumber: 6,
      title: 'Sixth Lecture',
      startTime: '12:25',
      endTime: '13:05',
      allocations: {
        PCM: isFirstHalfOfWeek ? { subject: 'Physical Education' } : { subject: 'Fine Arts' },
        PCB: isFirstHalfOfWeek ? { subject: 'Physical Education' } : { subject: 'Fine Arts' },
        COMMERCE: isFirstHalfOfWeek ? { subject: 'Physical Education' } : { subject: 'Fine Arts' },
        HUMANITIES: isFirstHalfOfWeek ? { subject: 'Physical Education' } : { subject: 'Fine Arts' },
      },
    },

    // AFTER-SCHOOL WAITING PERIOD — 1:05 PM to 2:00 PM
    {
      id: `${day}-after-school`,
      periodNumber: -3,
      title: 'School Off / Dispersal & Waiting Period',
      startTime: '13:05',
      endTime: '14:00',
      isAfterSchool: true,
      statusText: 'All regular classes finished',
      description:
        'Students are free from classes and may wait for their school bus/van, siblings, or parents until departure.',
      notes:
        'Students are free from classes and may wait for their school bus/van, siblings, or parents until departure.',
      allocations: {
        PCM: { subject: 'School Off / Dispersal & Waiting Period', isFree: true },
        PCB: { subject: 'School Off / Dispersal & Waiting Period', isFree: true },
        HUMANITIES: { subject: 'School Off / Dispersal & Waiting Period', isFree: true },
        COMMERCE: { subject: 'School Off / Dispersal & Waiting Period', isFree: true },
      },
    },
  ];
}

/**
 * ORIGINAL / OLD CLASS 11 TIMETABLE (Preserved Intact)
 * Class In-Charge: Alka Mam
 */
export function createOldDaySchedule(day: DayOfWeek): Period[] {
  const isFirstHalfOfWeek = day === 'Monday' || day === 'Tuesday' || day === 'Wednesday';

  return [
    // 1. SCHOOL ENTRY TIME — 7:30 AM to 8:00 AM
    {
      id: `${day}-entry`,
      periodNumber: -10,
      title: 'School Entry Time',
      startTime: '07:30',
      endTime: '08:00',
      isMorningRoutine: true,
      statusText: 'Campus Entry',
      description: 'Campus gates open, student entry, arrival verification and settling in.',
      notes: 'Campus gates open, student entry, arrival verification and settling in.',
      allocations: {
        PCM: { subject: 'School Entry Time', teacher: 'Campus Arrival' },
        PCB: { subject: 'School Entry Time', teacher: 'Campus Arrival' },
        HUMANITIES: { subject: 'School Entry Time', teacher: 'Campus Arrival' },
        COMMERCE: { subject: 'School Entry Time', teacher: 'Campus Arrival' },
      },
    },

    // 2. MORNING PRAYER — 8:00 AM to 8:20 AM
    {
      id: `${day}-prayer`,
      periodNumber: -11,
      title: 'Morning Prayer',
      startTime: '08:00',
      endTime: '08:20',
      isMorningRoutine: true,
      statusText: 'Morning Assembly',
      description: 'Morning assembly, school prayer, pledge, thought for the day, and national anthem.',
      notes: 'Morning assembly, school prayer, pledge, thought for the day, and national anthem.',
      allocations: {
        PCM: { subject: 'Morning Prayer', teacher: 'School Assembly' },
        PCB: { subject: 'Morning Prayer', teacher: 'School Assembly' },
        HUMANITIES: { subject: 'Morning Prayer', teacher: 'School Assembly' },
        COMMERCE: { subject: 'Morning Prayer', teacher: 'School Assembly' },
      },
    },

    // ZERO LECTURE — 8:20 AM to 8:30 AM
    {
      id: `${day}-p0`,
      periodNumber: 0,
      title: 'Zero Lecture',
      startTime: '08:20',
      endTime: '08:30',
      notes: 'Class meeting, attendance & morning announcements',
      allocations: {
        PCM: { subject: 'Class Meeting & Announcements', teacher: 'Alka Mam' },
        PCB: { subject: 'Class Meeting & Announcements', teacher: 'Alka Mam' },
        HUMANITIES: { subject: 'Class Meeting & Announcements', teacher: 'Alka Mam' },
        COMMERCE: { subject: 'Class Meeting & Announcements', teacher: 'Alka Mam' },
      },
    },

    // FIRST LECTURE — 8:30 AM to 9:10 AM
    {
      id: `${day}-p1`,
      periodNumber: 1,
      title: 'First Lecture',
      startTime: '08:30',
      endTime: '09:10',
      allocations: {
        PCM: isFirstHalfOfWeek
          ? { subject: 'Physics', teacher: 'Diksha Mam' }
          : { subject: 'Free Period', teacher: '—', isFree: true },
        PCB: isFirstHalfOfWeek
          ? { subject: 'Physics', teacher: 'Diksha Mam' }
          : { subject: 'Free Period', teacher: '—', isFree: true },
        HUMANITIES: { subject: 'Economics', teacher: 'Alka Mam' },
        COMMERCE: { subject: 'Economics', teacher: 'Alka Mam' },
      },
    },

    // SECOND LECTURE — 9:10 AM to 9:50 AM
    {
      id: `${day}-p2`,
      periodNumber: 2,
      title: 'Second Lecture',
      startTime: '09:10',
      endTime: '09:50',
      allocations: {
        PCM: { subject: 'English', teacher: 'Nancy Mam' },
        PCB: { subject: 'English', teacher: 'Nancy Mam' },
        HUMANITIES: { subject: 'English', teacher: 'Nancy Mam' },
        COMMERCE: { subject: 'English', teacher: 'Nancy Mam' },
      },
    },

    // FRUIT BREAK — 9:50 AM to 10:00 AM
    {
      id: `${day}-fruit-break`,
      periodNumber: -1,
      title: 'Fruit Break',
      startTime: '09:50',
      endTime: '10:00',
      isBreak: true,
      allocations: {
        PCM: { subject: 'Fruit Break', teacher: 'Nutrition & Relaxation' },
        PCB: { subject: 'Fruit Break', teacher: 'Nutrition & Relaxation' },
        HUMANITIES: { subject: 'Fruit Break', teacher: 'Nutrition & Relaxation' },
        COMMERCE: { subject: 'Fruit Break', teacher: 'Nutrition & Relaxation' },
      },
    },

    // THIRD LECTURE — 10:00 AM to 10:40 AM
    {
      id: `${day}-p3`,
      periodNumber: 3,
      title: 'Third Lecture',
      startTime: '10:00',
      endTime: '10:40',
      allocations: {
        PCM: { subject: 'Mathematics', teacher: 'Anita Mam' },
        PCB: { subject: 'Biology', teacher: 'Shalini Mam' },
        HUMANITIES: { subject: 'Free', isFree: true },
        COMMERCE: { subject: 'Free', isFree: true },
      },
    },

    // FOURTH LECTURE — 10:40 AM to 11:20 AM
    {
      id: `${day}-p4`,
      periodNumber: 4,
      title: 'Fourth Lecture',
      startTime: '10:40',
      endTime: '11:20',
      allocations: {
        PCM: { subject: 'Physics', teacher: 'Diksha Mam' },
        PCB: { subject: 'Physics', teacher: 'Diksha Mam' },
        HUMANITIES: { subject: 'Political Science / History', teacher: 'Ritu Mam' },
        COMMERCE: { subject: 'Business Studies', teacher: 'Alka Mam' },
      },
    },

    // LUNCH — 11:20 AM to 11:45 AM
    {
      id: `${day}-lunch`,
      periodNumber: -2,
      title: 'Lunch Break',
      startTime: '11:20',
      endTime: '11:45',
      isBreak: true,
      allocations: {
        PCM: { subject: 'Lunch Break', teacher: 'Cafeteria & Recess' },
        PCB: { subject: 'Lunch Break', teacher: 'Cafeteria & Recess' },
        HUMANITIES: { subject: 'Lunch Break', teacher: 'Cafeteria & Recess' },
        COMMERCE: { subject: 'Lunch Break', teacher: 'Cafeteria & Recess' },
      },
    },

    // FIFTH LECTURE — 11:45 AM to 12:25 PM
    {
      id: `${day}-p5`,
      periodNumber: 5,
      title: 'Fifth Lecture',
      startTime: '11:45',
      endTime: '12:25',
      allocations: {
        PCM: isFirstHalfOfWeek
          ? { subject: 'Physical Education (PE) & AI' }
          : { subject: 'Fine Arts and AI' },
        PCB: isFirstHalfOfWeek
          ? { subject: 'Physical Education (PE) & AI' }
          : { subject: 'Fine Arts and AI' },
        HUMANITIES: isFirstHalfOfWeek
          ? { subject: 'Physical Education (PE) & AI' }
          : { subject: 'Fine Arts and AI' },
        COMMERCE: isFirstHalfOfWeek
          ? { subject: 'Physical Education (PE) & AI' }
          : { subject: 'Fine Arts and AI' },
      },
    },

    // SIXTH LECTURE — 12:25 PM to 1:05 PM
    {
      id: `${day}-p6`,
      periodNumber: 6,
      title: 'Sixth Lecture',
      startTime: '12:25',
      endTime: '13:05',
      allocations: {
        PCM: { subject: 'Chemistry', teacher: 'Harshu Mam' },
        PCB: { subject: 'Chemistry', teacher: 'Harshu Mam' },
        HUMANITIES: { subject: 'Free', teacher: '—', isFree: true },
        COMMERCE: { subject: 'Accounts', teacher: 'Alka Mam' },
      },
    },

    // AFTER-SCHOOL WAITING PERIOD — 1:05 PM to 2:00 PM
    {
      id: `${day}-after-school`,
      periodNumber: -3,
      title: 'School Off / Dispersal & Waiting Period',
      startTime: '13:05',
      endTime: '14:00',
      isAfterSchool: true,
      statusText: 'All regular classes finished',
      description:
        'Students are free from classes and may wait for their school bus/van, siblings, or parents until departure.',
      notes:
        'Students are free from classes and may wait for their school bus/van, siblings, or parents until departure.',
      allocations: {
        PCM: { subject: 'School Off / Dispersal & Waiting Period', isFree: true },
        PCB: { subject: 'School Off / Dispersal & Waiting Period', isFree: true },
        HUMANITIES: { subject: 'School Off / Dispersal & Waiting Period', isFree: true },
        COMMERCE: { subject: 'School Off / Dispersal & Waiting Period', isFree: true },
      },
    },
  ];
}

export function createDaySchedule(day: DayOfWeek, version: TimetableVersion = activeTimetableVersion): Period[] {
  return version === 'old' ? createOldDaySchedule(day) : createCurrentDaySchedule(day);
}

export interface DayGroupColumn {
  heading: string;
  subheading: string;
  dayRange: DayOfWeek[];
  allocations: Record<StreamType, SubjectAllocation>;
  isConfigurableNotice?: string;
}

export interface DualColumnLectureDef {
  periodNumber: number;
  title: string;
  startTime: string;
  endTime: string;
  note?: string;
  column1: DayGroupColumn;
  column2: DayGroupColumn;
}

export const OLD_DUAL_COLUMN_LECTURES: Record<number, DualColumnLectureDef> = {
  1: {
    periodNumber: 1,
    title: 'First Lecture',
    startTime: '08:30',
    endTime: '09:10',
    note: 'Two Day-Group Matrix: Monday–Wednesday vs Thursday–Saturday',
    column1: {
      heading: 'MONDAY TO WEDNESDAY',
      subheading: 'Days: Mon, Tue, Wed',
      dayRange: ['Monday', 'Tuesday', 'Wednesday'],
      allocations: {
        PCM: { subject: 'Physics', teacher: 'Diksha Mam' },
        PCB: { subject: 'Physics', teacher: 'Diksha Mam' },
        HUMANITIES: { subject: 'Economics', teacher: 'Alka Mam' },
        COMMERCE: { subject: 'Economics', teacher: 'Alka Mam' },
      },
    },
    column2: {
      heading: 'THURSDAY TO SATURDAY',
      subheading: 'Days: Thu, Fri, Sat',
      dayRange: ['Thursday', 'Friday', 'Saturday'],
      allocations: {
        PCM: { subject: 'Free Period', teacher: '—', isFree: true },
        PCB: { subject: 'Free Period', teacher: '—', isFree: true },
        HUMANITIES: { subject: 'Economics', teacher: 'Alka Mam' },
        COMMERCE: { subject: 'Economics', teacher: 'Alka Mam' },
      },
    },
  },
  5: {
    periodNumber: 5,
    title: 'Fifth Lecture',
    startTime: '11:45',
    endTime: '12:25',
    note: 'Two Day-Group Matrix: Monday–Wednesday vs Thursday–Saturday',
    column1: {
      heading: 'MONDAY TO WEDNESDAY',
      subheading: 'Days: Mon, Tue, Wed',
      dayRange: ['Monday', 'Tuesday', 'Wednesday'],
      allocations: {
        PCM: { subject: 'Physical Education (PE) & AI' },
        PCB: { subject: 'Physical Education (PE) & AI' },
        HUMANITIES: { subject: 'Physical Education (PE) & AI' },
        COMMERCE: { subject: 'Physical Education (PE) & AI' },
      },
    },
    column2: {
      heading: 'THURSDAY TO SATURDAY',
      subheading: 'Days: Thu, Fri, Sat',
      dayRange: ['Thursday', 'Friday', 'Saturday'],
      allocations: {
        PCM: { subject: 'Fine Arts and AI' },
        PCB: { subject: 'Fine Arts and AI' },
        HUMANITIES: { subject: 'Fine Arts and AI' },
        COMMERCE: { subject: 'Fine Arts and AI' },
      },
    },
  },
};

export const DUAL_COLUMN_LECTURES = OLD_DUAL_COLUMN_LECTURES;

export function getCurrentTimetable(): TimetableSchedule {
  const schedule: Partial<TimetableSchedule> = {};
  for (const day of DAYS_OF_WEEK) {
    schedule[day] = createCurrentDaySchedule(day);
  }
  return schedule as TimetableSchedule;
}

export function getOldTimetable(): TimetableSchedule {
  const schedule: Partial<TimetableSchedule> = {};
  for (const day of DAYS_OF_WEEK) {
    schedule[day] = createOldDaySchedule(day);
  }
  return schedule as TimetableSchedule;
}

export function getInitialTimetable(version: TimetableVersion = activeTimetableVersion): TimetableSchedule {
  return version === 'old' ? getOldTimetable() : getCurrentTimetable();
}

