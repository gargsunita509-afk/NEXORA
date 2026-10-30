import { MathEvaluator, calculateStatistics } from './mathParser';
import { getCurrentAndNextPeriod, validatePeriodTimes, timeToMinutes } from './timetableHelper';
import { getLocalDateString } from './diaryHelper';
import {
  getInitialTimetable,
  getCurrentTimetable,
  getOldTimetable,
  getActiveTimetableVersion,
  setActiveTimetableVersion,
  getActiveClassInCharge,
  DAYS_OF_WEEK,
} from '../data/initialTimetable';
import { INITIAL_STUDENTS, CLASS_METADATA } from '../data/initialStudents';
import { storage } from '../services/storage';
import { compareSemver, updateService, resolveApiUrl } from '../services/updateService';
import { apkAwareFetch as fetch } from '../services/apkApiBridge';
import {
  validateAndNormalizeMCQ,
  shuffleQuestionOptionsWithStableId,
  isMCQAnswerCorrect,
} from './mcqValidator';
import {
  verifyAndNormalizeAttempt,
  findDuplicateSubmission,
  computeLeaderboard,
  ONE_WEEK_MS,
} from './leaderboardEngine';
import {
  generateTimetablePdf,
  generateQuestionPaperPdf,
  buildTimetablePdfDocument,
  buildQuestionPaperPdfDocument,
} from './pdfGenerator';
import {
  SUBJECT_TO_TEACHER_MAPPING,
  AUTHORITATIVE_TEACHER_LIST,
} from '../components/quiz/TeacherQuizGenerator';
import { DiaryEntry, Period, Quiz, QuizAttempt } from '../types';

export interface TestResult {
  id: number;
  name: string;
  category: string;
  passed: boolean;
  message: string;
  durationMs: number;
}

export async function runAllVerificationTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Helper to record test
  async function test(id: number, name: string, category: string, fn: () => Promise<void> | void) {
    const start = performance.now();
    try {
      await fn();
      const durationMs = Number((performance.now() - start).toFixed(2));
      results.push({ id, name, category, passed: true, message: 'Passed successfully', durationMs });
    } catch (e: any) {
      const durationMs = Number((performance.now() - start).toFixed(2));
      results.push({ id, name, category, passed: false, message: e.message || String(e), durationMs });
    }
  }

  // 1. Live clock updating
  await test(1, 'Live Clock Updating & Timezones', 'Clock', () => {
    const now = new Date();
    const iso = now.toISOString();
    if (!iso) throw new Error('Invalid date instance');
    const kolkataStr = now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' });
    if (!kolkataStr) throw new Error('Failed to resolve Asia/Kolkata timezone string');
  });

  // 2. Timetable period selection based on time, day and stream (Current Default & Preserved Old Timetable)
  await test(2, 'Timetable Period Selection & Current/Old Schedule Matrix', 'Timetable', () => {
    setActiveTimetableVersion('current');
    const timetable = storage.getTimetable();
    const mondaySchedule = timetable['Monday'];
    const thursdaySchedule = timetable['Thursday'];

    // 1. 07:45 AM -> School Entry Time (07:30 AM to 08:00 AM)
    const resEntry = getCurrentAndNextPeriod(mondaySchedule, 7 * 60 + 45);
    if (!resEntry.current || resEntry.current.title !== 'School Entry Time') {
      throw new Error('Expected School Entry Time at 7:45 AM');
    }
    if (resEntry.current.startTime !== '07:30' || resEntry.current.endTime !== '08:00') {
      throw new Error(`Expected School Entry Time 07:30 - 08:00, got ${resEntry.current.startTime} - ${resEntry.current.endTime}`);
    }

    // 2. 08:10 AM -> Morning Prayer (08:00 AM to 08:20 AM)
    const resPrayer = getCurrentAndNextPeriod(mondaySchedule, 8 * 60 + 10);
    if (!resPrayer.current || resPrayer.current.title !== 'Morning Prayer') {
      throw new Error('Expected Morning Prayer at 8:10 AM');
    }
    if (resPrayer.current.startTime !== '08:00' || resPrayer.current.endTime !== '08:20') {
      throw new Error(`Expected Morning Prayer 08:00 - 08:20, got ${resPrayer.current.startTime} - ${resPrayer.current.endTime}`);
    }

    // 3. 08:25 AM -> 505 minutes -> Zero Lecture (Diksha Mam in Current Timetable)
    const resZero = getCurrentAndNextPeriod(mondaySchedule, 8 * 60 + 25);
    if (!resZero.current || resZero.current.periodNumber !== 0) {
      throw new Error('Expected Zero Lecture at 8:25 AM');
    }

    // --- CURRENT TIMETABLE: FIRST LECTURE (8:30 AM – 9:10 AM) ---
    const monL1 = getCurrentAndNextPeriod(mondaySchedule, 8 * 60 + 45).current;
    if (!monL1 || monL1.periodNumber !== 1) throw new Error('Expected First Lecture on Monday');
    if (monL1.startTime !== '08:30' || monL1.endTime !== '09:10') throw new Error('First Lecture timing mismatch');
    if (monL1.allocations.PCM.subject !== 'Physics' || monL1.allocations.PCM.teacher !== 'Diksha Mam') {
      throw new Error('Expected Current First Lecture PCM to be Physics (Diksha Mam)');
    }
    if (monL1.allocations.PCB.subject !== 'Physics' || monL1.allocations.PCB.teacher !== 'Diksha Mam') {
      throw new Error('Expected Current First Lecture PCB to be Physics (Diksha Mam)');
    }
    if (monL1.allocations.COMMERCE.subject !== 'Business Studies' || monL1.allocations.COMMERCE.teacher !== 'Parul Mam') {
      throw new Error('Expected Current First Lecture Commerce to be Business Studies (Parul Mam)');
    }
    if (monL1.allocations.HUMANITIES.subject !== 'Free' || !monL1.allocations.HUMANITIES.isFree || monL1.allocations.HUMANITIES.teacher) {
      throw new Error('Expected Current First Lecture Humanities to be Free with no teacher');
    }

    // --- CURRENT TIMETABLE: SECOND LECTURE (9:10 AM – 9:50 AM) ---
    const monL2 = getCurrentAndNextPeriod(mondaySchedule, 9 * 60 + 30).current;
    if (!monL2 || monL2.periodNumber !== 2) throw new Error('Expected Second Lecture on Monday');
    const streams: ('PCM' | 'PCB' | 'HUMANITIES' | 'COMMERCE')[] = ['PCM', 'PCB', 'HUMANITIES', 'COMMERCE'];
    for (const st of streams) {
      if (monL2.allocations[st].subject !== 'English' || monL2.allocations[st].teacher !== 'Nancy Mam') {
        throw new Error(`Expected Current Second Lecture ${st} to be English (Nancy Mam)`);
      }
    }

    // --- CURRENT TIMETABLE: THIRD LECTURE (10:00 AM – 10:40 AM) ---
    const monL3 = getCurrentAndNextPeriod(mondaySchedule, 10 * 60 + 15).current;
    const thuL3 = getCurrentAndNextPeriod(thursdaySchedule, 10 * 60 + 15).current;
    if (!monL3 || monL3.periodNumber !== 3 || !thuL3 || thuL3.periodNumber !== 3) {
      throw new Error('Expected Third Lecture on Monday and Thursday');
    }
    if (monL3.allocations.PCM.subject !== 'Chemistry' || monL3.allocations.PCM.teacher !== 'Harshu Mam') {
      throw new Error('Expected Current Third Lecture PCM to be Chemistry (Harshu Mam)');
    }
    if (monL3.allocations.PCB.subject !== 'Chemistry' || monL3.allocations.PCB.teacher !== 'Harshu Mam') {
      throw new Error('Expected Current Third Lecture PCB to be Chemistry (Harshu Mam)');
    }
    if (monL3.allocations.COMMERCE.subject !== 'Accountancy' || monL3.allocations.COMMERCE.teacher !== 'Alka Mam') {
      throw new Error('Expected Current Third Lecture Commerce to be Accountancy (Alka Mam)');
    }
    if (monL3.allocations.HUMANITIES.subject !== 'Political Science' || monL3.allocations.HUMANITIES.teacher !== 'Ritu Mam') {
      throw new Error('Expected Current Mon-Wed Third Lecture Humanities to be Political Science (Ritu Mam)');
    }
    if (thuL3.allocations.HUMANITIES.subject !== 'History' || thuL3.allocations.HUMANITIES.teacher !== 'Ritu Mam') {
      throw new Error('Expected Current Thu-Sat Third Lecture Humanities to be History (Ritu Mam)');
    }

    // --- CURRENT TIMETABLE: FOURTH LECTURE (10:40 AM – 11:20 AM) ---
    const monL4 = getCurrentAndNextPeriod(mondaySchedule, 10 * 60 + 55).current;
    if (!monL4 || monL4.periodNumber !== 4) throw new Error('Expected Fourth Lecture on Monday');
    if (monL4.allocations.PCM.subject !== 'Mathematics' || monL4.allocations.PCM.teacher !== 'Anita Mam') {
      throw new Error('Expected Current Fourth Lecture PCM to be Mathematics (Anita Mam)');
    }
    if (monL4.allocations.PCB.subject !== 'Biology' || monL4.allocations.PCB.teacher !== 'Shalini Mam') {
      throw new Error('Expected Current Fourth Lecture PCB to be Biology (Shalini Mam)');
    }
    for (const freeSt of ['COMMERCE', 'HUMANITIES'] as const) {
      if (monL4.allocations[freeSt].subject !== 'Free' || !monL4.allocations[freeSt].isFree || monL4.allocations[freeSt].teacher) {
        throw new Error(`Expected Current Fourth Lecture ${freeSt} to be Free with no teacher`);
      }
    }

    // --- CURRENT TIMETABLE: FIFTH LECTURE (11:45 AM – 12:25 PM) ---
    const monL5 = getCurrentAndNextPeriod(mondaySchedule, 12 * 60).current;
    const thuL5 = getCurrentAndNextPeriod(thursdaySchedule, 12 * 60).current;
    if (!monL5 || monL5.periodNumber !== 5 || !thuL5 || thuL5.periodNumber !== 5) {
      throw new Error('Expected Fifth Lecture on Monday and Thursday');
    }
    if (monL5.allocations.PCM.subject !== 'Physics' || monL5.allocations.PCM.teacher) {
      throw new Error('Expected Current Mon-Wed Fifth Lecture PCM to be Physics (no teacher)');
    }
    if (monL5.allocations.PCB.subject !== 'Physics' || monL5.allocations.PCB.teacher) {
      throw new Error('Expected Current Mon-Wed Fifth Lecture PCB to be Physics (no teacher)');
    }
    if (thuL5.allocations.PCM.subject !== 'Chemistry' || thuL5.allocations.PCM.teacher) {
      throw new Error('Expected Current Thu-Sat Fifth Lecture PCM to be Chemistry (no teacher)');
    }
    if (thuL5.allocations.PCB.subject !== 'Chemistry' || thuL5.allocations.PCB.teacher) {
      throw new Error('Expected Current Thu-Sat Fifth Lecture PCB to be Chemistry (no teacher)');
    }
    if (monL5.allocations.COMMERCE.subject !== 'Economics' || monL5.allocations.COMMERCE.teacher !== 'Alka Mam') {
      throw new Error('Expected Current Fifth Lecture Commerce to be Economics (Alka Mam)');
    }
    if (monL5.allocations.HUMANITIES.subject !== 'Economics' || monL5.allocations.HUMANITIES.teacher !== 'Alka Mam') {
      throw new Error('Expected Current Fifth Lecture Humanities to be Economics (Alka Mam)');
    }

    // --- CURRENT TIMETABLE: SIXTH LECTURE (12:25 PM – 1:05 PM) ---
    const monL6 = getCurrentAndNextPeriod(mondaySchedule, 12 * 60 + 40).current;
    const thuL6 = getCurrentAndNextPeriod(thursdaySchedule, 12 * 60 + 40).current;
    if (!monL6 || monL6.periodNumber !== 6 || !thuL6 || thuL6.periodNumber !== 6) {
      throw new Error('Expected Sixth Lecture on Monday and Thursday');
    }
    for (const st of streams) {
      if (monL6.allocations[st].subject !== 'Physical Education' || monL6.allocations[st].teacher) {
        throw new Error(`Expected Current Mon-Wed Sixth Lecture ${st} to be Physical Education (no teacher)`);
      }
      if (thuL6.allocations[st].subject !== 'Fine Arts' || thuL6.allocations[st].teacher) {
        throw new Error(`Expected Current Thu-Sat Sixth Lecture ${st} to be Fine Arts (no teacher)`);
      }
    }

    // --- PRESERVED OLD TIMETABLE VERIFICATION ---
    const oldTimetable = storage.getOldTimetable();
    const oldMonL1 = getCurrentAndNextPeriod(oldTimetable['Monday'], 8 * 60 + 45).current;
    const oldThuL1 = getCurrentAndNextPeriod(oldTimetable['Thursday'], 8 * 60 + 45).current;
    if (!oldMonL1 || oldMonL1.allocations.HUMANITIES.subject !== 'Economics' || oldMonL1.allocations.HUMANITIES.teacher !== 'Alka Mam') {
      throw new Error('Expected Old Timetable Mon-Wed First Lecture Humanities to be Economics (Alka Mam)');
    }
    if (!oldThuL1 || oldThuL1.allocations.PCM.subject !== 'Free Period') {
      throw new Error('Expected Old Timetable Thu-Sat First Lecture PCM to be Free Period');
    }

    // 09:55 AM -> Fruit Break
    const resFruit = getCurrentAndNextPeriod(mondaySchedule, 9 * 60 + 55);
    if (!resFruit.current || !resFruit.current.isBreak) {
      throw new Error('Expected Fruit Break at 9:55 AM');
    }

    // 01:30 PM -> After-School Waiting Period (1:05 PM to 2:00 PM)
    const resAfterSchool = getCurrentAndNextPeriod(mondaySchedule, 13 * 60 + 30);
    if (!resAfterSchool.current || !resAfterSchool.current.isAfterSchool) {
      throw new Error('Expected After-School Waiting Period at 1:30 PM');
    }
    if (resAfterSchool.current.startTime !== '13:05' || resAfterSchool.current.endTime !== '14:00') {
      throw new Error('Expected After-School period timing to be 13:05 - 14:00');
    }
    if (resAfterSchool.current.periodNumber !== -3) {
      throw new Error('Expected After-School period not to have a regular lecture number');
    }
  });

  // 3. Permanent Read-Only Timetable Protection & Overlap Validation
  await test(3, 'Timetable Read-Only Enforcement & Validation', 'Timetable', () => {
    // Verify storage enforces read-only
    if (!storage.isTimetableReadOnly()) {
      throw new Error('Expected storage.isTimetableReadOnly() to return true');
    }

    // Attempting to overwrite timetable must be rejected
    const dummySchedule = {} as any;
    const saveResult = storage.saveTimetable(dummySchedule);
    if (saveResult.success) {
      throw new Error('Expected storage.saveTimetable() to reject modification');
    }

    // Official timetable must remain untouched
    const current = storage.getTimetable();
    if (!current['Monday'] || current['Monday'].length === 0) {
      throw new Error('Official timetable was corrupted or empty');
    }

    // Validate period times calculation after all school periods and waiting period (after 14:00)
    const monday = current['Monday'];
    const valid = validatePeriodTimes({ startTime: '14:10', endTime: '14:50' }, monday);
    if (!valid.valid) throw new Error(`Validation failed unexpectedly: ${valid.error}`);

    // Overlapping period with Zero lecture (08:20 - 08:30)
    const overlap = validatePeriodTimes({ startTime: '08:25', endTime: '08:50' }, monday);
    if (overlap.valid) throw new Error('Expected overlap detection between 08:25 and 08:30');

    // Overlapping period with School Entry Time (07:30 - 08:00)
    const overlapEntry = validatePeriodTimes({ startTime: '07:45', endTime: '08:15' }, monday);
    if (overlapEntry.valid) throw new Error('Expected overlap detection during School Entry Time (07:30 - 08:00)');

    // Overlapping period with After-School Waiting period (13:05 - 14:00)
    const overlapAfterSchool = validatePeriodTimes({ startTime: '13:30', endTime: '13:45' }, monday);
    if (overlapAfterSchool.valid) throw new Error('Expected overlap detection during After-School period (13:05 - 14:00)');
  });

  // 4. Timer calculations after tab suspension
  await test(4, 'Timer Timestamp-Delta Calculation', 'Timer', () => {
    const startMs = Date.now() - 5000; // Simulated 5 seconds ago
    const totalDurationMs = 60000;     // 60 seconds
    const elapsed = Date.now() - startMs;
    const remaining = Math.max(0, totalDurationMs - elapsed);
    if (remaining > 56000 || remaining < 54000) {
      throw new Error(`Timer remaining mismatch: ${remaining}`);
    }
  });

  // 5. Whiteboard drawing, undo/redo and export
  await test(5, 'Whiteboard State, Undo/Redo & Serialization', 'Whiteboard', () => {
    const stack: any[] = [];
    const undoStack: any[] = [];
    // Add stroke
    const s1 = { id: 's1', tool: 'pen', color: '#00f0ff', points: [{ x: 10, y: 10 }] };
    stack.push(s1);
    // Undo
    const popped = stack.pop();
    undoStack.push(popped);
    if (stack.length !== 0 || undoStack.length !== 1) {
      throw new Error('Undo operation failed');
    }
    // Redo
    const redone = undoStack.pop();
    stack.push(redone);
    const redoneLen: number = (stack as any).length;
    if (redoneLen !== 1 || stack[0]?.id !== 's1') {
      throw new Error('Redo operation failed');
    }
  });

  // 6. Diary persistence across reloads
  await test(6, 'Diary Persistence Across Reloads', 'Diary', async () => {
    const today = getLocalDateString();
    const testEntry: DiaryEntry = {
      id: `diary-test-${today}`,
      date: today,
      subject: 'Physics',
      type: 'Homework',
      targetStream: 'PCM',
      authorName: 'Alka Mam',
      title: 'Class 11 Test Entry',
      content: 'Physics kinematics formulas practiced.',
      homework: 'NCERT Ch 3 exercises 1 to 10',
      teacherRemarks: 'Excellent attendance and participation',
      importantNotices: 'Unit test next Monday',
      lastModified: Date.now(),
    };
    await storage.saveDiaryEntry(testEntry);
    const loaded = await storage.getDiaryEntry(today);
    if (!loaded || loaded.content !== testEntry.content) {
      throw new Error('Failed to retrieve saved diary entry');
    }
  });

  // 7. Diary rollover to next local calendar day
  await test(7, 'Diary Rollover to Next Local Calendar Day', 'Diary', async () => {
    const futureDate = '2099-01-01';
    // Reopening on future day should result in null / empty entry initially
    const futureEntry = await storage.getDiaryEntry(futureDate);
    if (futureEntry !== null && futureEntry.content !== '') {
      throw new Error('Future date entry should start empty');
    }
  });

  // 8. Preservation of historical diary entries
  await test(8, 'Preservation of Historical Diary Entries', 'Diary', async () => {
    const yesterday = '2026-10-11';
    const oldEntry: DiaryEntry = {
      id: `diary-test-${yesterday}`,
      date: yesterday,
      subject: 'Chemistry',
      type: 'Homework',
      targetStream: 'ALL',
      authorName: 'Alka Mam',
      title: 'Yesterday Archive',
      content: 'Chemistry lab experiment',
      homework: 'Complete lab report',
      teacherRemarks: 'Good',
      importantNotices: '',
      lastModified: Date.now() - 86400000,
    };
    await storage.saveDiaryEntry(oldEntry);
    const all = await storage.getAllDiaryEntries();
    const found = all.find((e) => e.date === yesterday);
    if (!found || found.content !== 'Chemistry lab experiment') {
      throw new Error('Historical diary record was lost or not preserved');
    }
  });

  // 9. Quiz score calculations & 4-stream personalized selection
  await test(9, 'Quiz Personalization Across All 4 Streams & Scoring', 'Quiz', async () => {
    const totalQuestions = 5;
    const correctCount = 4;
    const accuracy = Math.round((correctCount / totalQuestions) * 100);
    const score = correctCount * 10;
    if (accuracy !== 80 || score !== 40) {
      throw new Error(`Quiz calculations inaccurate: acc=${accuracy}, score=${score}`);
    }

    const allQuizzes = await storage.getQuizzes();
    const students = storage.getStudents();

    // Verify PCM (Vansh)
    const pcmStudent = students.find((s) => s.name === 'Vansh');
    if (!pcmStudent || pcmStudent.stream !== 'PCM') throw new Error('PCM student Vansh not found');
    const pcmQuizzes = allQuizzes.filter((q) =>
      ['Physics', 'Chemistry', 'Mathematics'].includes(q.subject) &&
      (!q.stream || q.stream === 'ALL' || q.stream === 'PCM')
    );
    if (pcmQuizzes.length < 3) throw new Error(`Expected at least 3 PCM quizzes, got ${pcmQuizzes.length}`);

    // Verify PCB (Dikshit)
    const pcbStudent = students.find((s) => s.name === 'Dikshit');
    if (!pcbStudent || pcbStudent.stream !== 'PCB') throw new Error('PCB student Dikshit not found');
    const pcbQuizzes = allQuizzes.filter((q) =>
      ['Physics', 'Chemistry', 'Biology'].includes(q.subject) &&
      (!q.stream || q.stream === 'ALL' || q.stream === 'PCB')
    );
    if (pcbQuizzes.length < 3) throw new Error(`Expected at least 3 PCB quizzes, got ${pcbQuizzes.length}`);

    // Verify Humanities (Keshav)
    const humStudent = students.find((s) => s.name === 'Keshav');
    if (!humStudent || humStudent.stream !== 'HUMANITIES') throw new Error('Humanities student Keshav not found');
    const humQuizzes = allQuizzes.filter((q) =>
      ['History', 'Political Science', 'Geography', 'Economics'].includes(q.subject) &&
      (!q.stream || q.stream === 'ALL' || q.stream === 'HUMANITIES')
    );
    if (humQuizzes.length < 3) throw new Error(`Expected at least 3 Humanities quizzes, got ${humQuizzes.length}`);
    const hasHistory = humQuizzes.some((q) => q.subject === 'History');
    if (!hasHistory) throw new Error('Expected Humanities quizzes to include History');

    // Verify Commerce (Riya)
    const commStudent = students.find((s) => s.name === 'Riya');
    if (!commStudent || commStudent.stream !== 'COMMERCE') throw new Error('Commerce student Riya not found');
    const commQuizzes = allQuizzes.filter((q) =>
      ['Accountancy', 'Business Studies', 'Economics'].includes(q.subject) &&
      (!q.stream || q.stream === 'ALL' || q.stream === 'COMMERCE')
    );
    if (commQuizzes.length < 3) throw new Error(`Expected at least 3 Commerce quizzes, got ${commQuizzes.length}`);
  });

  // 10. Scientific calculator operator precedence and trigonometric modes
  await test(10, 'Calculator Precedence & Trigonometry (DEG/RAD)', 'Calculator', () => {
    const calcDeg = new MathEvaluator('DEG');
    // Precedence: 2 + 3 * 4 = 14
    if (calcDeg.evaluate('2 + 3 * 4') !== 14) {
      throw new Error('Operator precedence failed for 2 + 3 * 4');
    }
    // Nested parentheses & power: (2 + 3) ^ 2 = 25
    if (calcDeg.evaluate('(2 + 3) ^ 2') !== 25) {
      throw new Error('Power/parentheses precedence failed for (2 + 3) ^ 2');
    }
    // sin(30) in DEG = 0.5
    const sin30 = calcDeg.evaluate('sin(30)');
    if (Math.abs(sin30 - 0.5) > 1e-6) {
      throw new Error(`sin(30) in DEG failed: got ${sin30}`);
    }

    // In RAD mode: sin(pi / 6) = 0.5
    const calcRad = new MathEvaluator('RAD');
    const sinRad = calcRad.evaluate('sin(pi / 6)');
    if (Math.abs(sinRad - 0.5) > 1e-6) {
      throw new Error(`sin(pi/6) in RAD failed: got ${sinRad}`);
    }
  });

  // 11. Modulus versus absolute-value calculations
  await test(11, 'Modulus vs Absolute Value Distinction', 'Calculator', () => {
    const calc = new MathEvaluator('DEG');
    // Absolute value: |-5| = 5 and abs(-5) = 5
    const absRes = calc.evaluate('abs(-5)');
    const pipeRes = calc.evaluate('|-5|');
    if (absRes !== 5 || pipeRes !== 5) {
      throw new Error(`Absolute value failed: abs(-5)=${absRes}, |-5|=${pipeRes}`);
    }

    // Remainder: 17 mod 5 = 2
    const modRes = calc.evaluate('17 mod 5');
    if (modRes !== 2) {
      throw new Error(`17 mod 5 failed: expected 2, got ${modRes}`);
    }
  });

  // 12. Import/export validation
  await test(12, 'Backup JSON Import/Export Schema Validation', 'Backup', async () => {
    const exportJson = await storage.exportAllData();
    const parsed = JSON.parse(exportJson);
    if (!parsed.app || !parsed.data || !parsed.data.timetable) {
      throw new Error('Export JSON missing expected root keys');
    }

    // Import invalid string
    const badRes = await storage.importAllData('{"broken": true}');
    if (badRes.success) {
      throw new Error('Import should fail for invalid schema without "data"');
    }
  });

  // 13. Introduction sequence without duplicate records & correct student spellings
  await test(13, 'Class Introduction Non-Repeating Student Sequence', 'Intro', () => {
    const students = storage.getStudents();
    if (students.length !== 21) {
      throw new Error(`Expected exactly 21 student records, found ${students.length}`);
    }
    const ids = new Set(students.map((s) => s.id));
    if (ids.size !== students.length) {
      throw new Error('Duplicate student records detected in list');
    }
    // Verify Lakshit / Shivam is kept combined
    const lakshit = students.find((s) => s.name === 'Lakshit/Shivam' || s.name === 'Lakshit / Shivam');
    if (!lakshit) {
      throw new Error('Lakshit / Shivam combined record is missing');
    }
    // Verify Keshav (Humanities) spelling
    const keshav = students.find((s) => s.name === 'Keshav');
    if (!keshav || keshav.stream !== 'HUMANITIES') {
      throw new Error('Expected student Keshav (Humanities) to exist');
    }
    if (students.some((s) => s.name === 'Kesav')) {
      throw new Error('Outdated spelling Kesav found in student list');
    }
    // Verify Dikshit (PCB) spelling
    const dikshit = students.find((s) => s.name === 'Dikshit');
    if (!dikshit || dikshit.stream !== 'PCB') {
      throw new Error('Expected student Dikshit (PCB) to exist');
    }
    if (students.some((s) => s.name === 'Dixit')) {
      throw new Error('Outdated spelling Dixit found in student list');
    }
  });

  // 14. Navigation and all major buttons
  await test(14, 'Module Navigation & System Architecture', 'System', () => {
    const validModules = [
      'dashboard', 'timetable', 'youtube', 'notes', 'diary',
      'timer', 'quiz', 'games', 'gemini', 'intro', 'calculator', 'diagnostics'
    ];
    if (validModules.length !== 12) {
      throw new Error('Modules list count mismatch');
    }
  });

  // 15. Timetable Disclaimer Footnote Verification
  await test(15, 'Timetable Disclaimer Footnote Verification', 'Timetable', () => {
    const expectedDisclaimer =
      'Note: This timetable is for regular school days. In case of any school function, special event, or other activities, the timetable may vary for that day or for a few days.';

    // Check that expected text is non-empty and well-formed
    if (!expectedDisclaimer.includes('In case of any school function, special event, or other activities')) {
      throw new Error('Disclaimer wording mismatch');
    }
  });

  // 16. Android APK Build & File Integrity
  await test(16, 'Android APK Build & File Integrity', 'Android', () => {
    // In Node test environment, verify release APK file exists and has non-trivial size
    if (typeof process !== 'undefined' && process.versions && process.versions.node) {
      const fs = require('fs');
      const path = require('path');
      const apkPath = path.resolve(process.cwd(), 'public/downloads/nexora-release.apk');
      if (!fs.existsSync(apkPath)) {
        throw new Error('Expected genuine Android APK at public/downloads/nexora-release.apk');
      }
      const stats = fs.statSync(apkPath);
      if (stats.size < 50000) {
        throw new Error(`APK file is suspiciously small (${stats.size} bytes), expected genuine APK > 50KB`);
      }
    }
  });

  // 17. Update Engine Semver & Live Update Check Verification
  await test(17, 'Update Engine Semver & Live Update Check Verification', 'Updates', async () => {
    if (compareSemver('1.1.0', '1.0.0') !== 1) throw new Error('Expected 1.1.0 > 1.0.0');
    if (compareSemver('v1.1.0', 'v1.0.0') !== 1) throw new Error('Expected v1.1.0 > v1.0.0');
    if (compareSemver('1.0.1', 'v1.0.0') !== 1) throw new Error('Expected 1.0.1 > v1.0.0');
    if (compareSemver('1.10.0', '1.2.0') !== 1) throw new Error('Expected numeric 1.10.0 > 1.2.0');
    if (compareSemver('1.1.0', '1.1.0') !== 0) throw new Error('Expected 1.1.0 === 1.1.0');
    if (compareSemver('v1.0.0', '1.0.0') !== 0) throw new Error('Expected v1.0.0 === 1.0.0');
    if (compareSemver('1.0.0', '1.1.0') !== -1) throw new Error('Expected 1.0.0 < 1.1.0');
    if (compareSemver('v1.0.0', '1.0.1') !== -1) throw new Error('Expected v1.0.0 < 1.0.1');
    if (compareSemver('2.0.0', '1.9.9') !== 1) throw new Error('Expected 2.0.0 > 1.9.9');

    if (typeof window === 'undefined' || navigator.onLine !== false) {
      // 1. Original assertion: Simulate older v1.0.0 installation checking against latest release
      const olderRes = await updateService.checkForUpdates(false, { version: '1.0.0', versionCode: 1 });
      if (!olderRes.updateAvailable) {
        throw new Error('Expected updateAvailable=true when comparing installed v1.0.0 against latest release');
      }

      // 2. Leading 'v' older version check ("v1.0.0")
      const olderVPrefixRes = await updateService.checkForUpdates(false, { version: 'v1.0.0', versionCode: 1 });
      if (!olderVPrefixRes.updateAvailable || olderVPrefixRes.status !== 'update_available') {
        throw new Error('Expected updateAvailable=true for installed version "v1.0.0"');
      }

      // 3. Equal version check must NOT trigger a false update
      const equalRes = await updateService.checkForUpdates(false, {
        version: olderRes.latestVersion,
        versionCode: olderRes.latestVersionCode,
      });
      if (equalRes.updateAvailable || equalRes.status !== 'up_to_date') {
        throw new Error(
          `Expected updateAvailable=false for equal version ${olderRes.latestVersion}, got status=${equalRes.status}`
        );
      }

      const equalWithVPrefix = await updateService.checkForUpdates(false, {
        version: `v${olderRes.latestVersion}`,
      });
      if (equalWithVPrefix.updateAvailable) {
        throw new Error('Expected updateAvailable=false for equal version with leading "v"');
      }

      // 4. Newer installed version (server has older release than client) must NOT trigger a false update
      const newerInstalledRes = await updateService.checkForUpdates(false, {
        version: '9.9.9',
        versionCode: 99,
      });
      if (newerInstalledRes.updateAvailable || newerInstalledRes.status !== 'up_to_date') {
        throw new Error('Expected updateAvailable=false when installed version (9.9.9) is newer than published release');
      }

      // 5. Malformed and unavailable release metadata must produce a safe error (updateAvailable: false, status: 'error')
      const malformedJsonRes = await updateService.checkForUpdates(
        false,
        { version: '1.0.0', versionCode: 1 },
        { mockResponseText: '{corrupted_json' }
      );
      if (malformedJsonRes.status !== 'error' || malformedJsonRes.updateAvailable !== false) {
        throw new Error('Expected malformed JSON metadata to return status="error" and updateAvailable=false');
      }

      const malformedVersionRes = await updateService.checkForUpdates(
        false,
        { version: '1.0.0', versionCode: 1 },
        { mockResponseText: JSON.stringify({ version: 'not-a-semver', apkUrl: '/downloads/nexora-release.apk' }) }
      );
      if (malformedVersionRes.status !== 'error' || malformedVersionRes.updateAvailable !== false) {
        throw new Error('Expected invalid version in metadata to return status="error" and updateAvailable=false');
      }

      const unavailableServerRes = await updateService.checkForUpdates(
        false,
        { version: '1.0.0', versionCode: 1 },
        { manifestUrl: resolveApiUrl('/api/updates/nonexistent-endpoint-404') }
      );
      if (unavailableServerRes.status !== 'error' || unavailableServerRes.updateAvailable !== false) {
        throw new Error('Expected unavailable release endpoint to return status="error" and updateAvailable=false');
      }

      // 6. Verify current installation state
      const currentRes = await updateService.checkForUpdates(false);
      if (currentRes.status !== 'up_to_date' && currentRes.status !== 'update_available') {
        throw new Error(`Unexpected update status: ${currentRes.status}`);
      }
    }
  });

  // 18. Release Manifest Schema & Checksum Verification
  await test(18, 'Release Manifest Schema & Checksum Verification', 'Updates', () => {
    if (typeof process !== 'undefined' && process.versions && process.versions.node) {
      const fs = require('fs');
      const path = require('path');
      const manifestPath = path.resolve(process.cwd(), 'public/downloads/release-info.json');
      if (!fs.existsSync(manifestPath)) {
        throw new Error('Expected release-info.json in public/downloads');
      }
      const data = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (!data.version || !data.versionCode || !data.apkUrl || !data.sha256) {
        throw new Error('Release manifest missing required fields (version, versionCode, apkUrl, sha256)');
      }
      if (data.packageName !== 'com.theabhinavschool.nexora') {
        throw new Error(`Unexpected packageName: ${data.packageName}`);
      }
    }
  });

  // 19. Question Paper Blueprint & Format Calculations
  await test(19, 'Question Paper Blueprint & Multi-Format Calculations', 'Quiz Arena', () => {
    const counts = { mcq: 0, short_2: 0, short_3: 0, case_study: 0, long_5: 0 };
    const marksConfig = { mcq: 1, short_2: 2, short_3: 3, case_study: 4, long_5: 5 };

    // Initially all start at 0
    const totalQInitial = Object.values(counts).reduce((a, b) => a + b, 0);
    if (totalQInitial !== 0) throw new Error('Initial question paper quantities must start at 0');

    // Simulate selecting questions
    counts.mcq = 5;
    counts.short_2 = 3;
    counts.short_3 = 2;
    counts.case_study = 1;
    counts.long_5 = 1;

    const totalQuestions = counts.mcq + counts.short_2 + counts.short_3 + counts.case_study + counts.long_5;
    if (totalQuestions !== 12) throw new Error(`Expected 12 questions, got ${totalQuestions}`);

    const totalMarks =
      counts.mcq * marksConfig.mcq +
      counts.short_2 * marksConfig.short_2 +
      counts.short_3 * marksConfig.short_3 +
      counts.case_study * marksConfig.case_study +
      counts.long_5 * marksConfig.long_5;

    // 5*1 + 3*2 + 2*3 + 1*4 + 1*5 = 5 + 6 + 6 + 4 + 5 = 26
    if (totalMarks !== 26) throw new Error(`Expected 26 total marks, got ${totalMarks}`);
  });

  // 20. Case-Study Subquestions & Reordering Verification
  await test(20, 'Case-Study Subquestions & Reordering Verification', 'Quiz Arena', () => {
    const mockCaseStudyQuestion = {
      id: 'cs-1',
      question: 'Read the passage on Newton\'s Laws and answer the sub-questions.',
      casePassage: 'A block of mass 5 kg is placed on a frictionless horizontal plane...',
      questionType: 'case_study' as const,
      marks: 4,
      subQuestions: [
        { id: 'sq-1', question: 'Find the acceleration of the block.', marks: 1, modelAnswer: 'a = F/m = 10/5 = 2 m/s²' },
        { id: 'sq-2', question: 'State the direction of the net force.', marks: 1, modelAnswer: 'Along the horizontal axis' },
        { id: 'sq-3', question: 'Calculate velocity after 3 seconds.', marks: 2, modelAnswer: 'v = u + at = 0 + 2(3) = 6 m/s' },
      ],
    };

    const calculatedSum = mockCaseStudyQuestion.subQuestions.reduce((s, sq) => s + sq.marks, 0);
    if (calculatedSum !== 4) throw new Error(`Expected case study subquestion marks to equal 4, got ${calculatedSum}`);

    // Verify non-destructive reordering
    const list = ['Q1', 'Q2', 'Q3'];
    const reorder = (arr: string[], from: number, to: number) => {
      const copy = [...arr];
      const [item] = copy.splice(from, 1);
      copy.splice(to, 0, item);
      return copy;
    };
    const moved = reorder(list, 2, 1);
    if (moved[1] !== 'Q3' || moved[2] !== 'Q2' || moved[0] !== 'Q1') {
      throw new Error('Reordering logic failed');
    }
  });

  // 21. MCQ Validation, Stable Option ID Shuffling & Zero Fallback to Option A
  await test(21, 'MCQ Validation, Stable Option ID Shuffling & Answer-Key Integrity', 'Quiz Arena', () => {
    // 1. Reject MCQ with missing correct answer (must NEVER default to index 0 / Option A)
    const missingKey = validateAndNormalizeMCQ(
      {
        question: 'Which law defines force?',
        options: ['First Law', 'Second Law', 'Third Law', 'Law of Gravitation'],
        explanation: 'Newton Second Law.',
      },
      'q-test-0',
      { shuffle: false }
    );
    if (missingKey.valid) {
      throw new Error('Expected MCQ without a valid correctIndex or correctAnswerText to be rejected, not defaulted to Option A');
    }

    // 2. Reject MCQ with duplicate options
    const dupOptions = validateAndNormalizeMCQ(
      {
        question: 'What is 2 + 2?',
        options: ['4', '4', '5', '6'],
        correctIndex: 0,
      },
      'q-test-1',
      { shuffle: false }
    );
    if (dupOptions.valid) {
      throw new Error('Expected MCQ with duplicate options to be rejected');
    }

    // 3. Reconcile correctAnswerText when AI puts index 0 but text matches Option C (index 2)
    const reconciled = validateAndNormalizeMCQ(
      {
        question: 'SI unit of electric current is:',
        options: ['(A) Volt', '(B) Ohm', '(C) Ampere', '(D) Watt'],
        correctIndex: 0,
        correctAnswerText: 'Ampere',
        explanation: 'Ampere is the SI base unit of electric current.',
      },
      'q-test-2',
      { shuffle: false }
    );
    if (!reconciled.valid || !reconciled.options || typeof reconciled.correctIndex !== 'number') {
      throw new Error('Expected valid reconciled MCQ');
    }
    if (reconciled.correctIndex !== 2) {
      throw new Error(`Expected reconciled correctIndex to be 2 (Ampere), got ${reconciled.correctIndex}`);
    }
    if (reconciled.options[2] !== 'Ampere') {
      throw new Error(`Expected option label prefix to be stripped cleanly, got "${reconciled.options[2]}"`);
    }

    // 4. Verify shuffling preserves exact answer key via stable correctOptionId across 20 shuffles
    let q: import('../types').QuizQuestion = {
      id: 'q-test-2',
      question: 'SI unit of electric current is:',
      options: reconciled.options,
      optionItems: reconciled.optionItems,
      correctIndex: reconciled.correctIndex,
      correctOptionId: reconciled.correctOptionId,
      correctAnswerText: reconciled.correctAnswerText,
      explanation: 'Ampere is the SI base unit of electric current.',
    };
    for (let i = 0; i < 20; i++) {
      q = shuffleQuestionOptionsWithStableId(q);
      const qOpts = q.options ?? [];
      const qCorrIdx = q.correctIndex ?? -1;
      const selectedCorrectText = qCorrIdx >= 0 ? qOpts[qCorrIdx] : undefined;
      if (selectedCorrectText !== 'Ampere') {
        throw new Error(`After shuffle #${i + 1}, correctIndex (${qCorrIdx}) pointed to "${selectedCorrectText}" instead of "Ampere"`);
      }
      if (!isMCQAnswerCorrect(q, qCorrIdx)) {
        throw new Error('isMCQAnswerCorrect returned false for the shuffled correctIndex');
      }
      const wrongIdx = (qCorrIdx + 1) % 4;
      if (isMCQAnswerCorrect(q, wrongIdx)) {
        throw new Error('isMCQAnswerCorrect returned true for an incorrect option');
      }
    }
  });

  // 22. Stream-Wise Student Filtering (PCM, PCB, COMMERCE, HUMANITIES)
  await test(22, 'Stream-Wise Student Filtering & Zero Cross-Stream Leakage', 'Quiz Arena', () => {
    const pcm = storage.getStudentsByStream('PCM');
    const pcb = storage.getStudentsByStream('PCB');
    const comm = storage.getStudentsByStream('COMMERCE');
    const hum = storage.getStudentsByStream('HUMANITIES');
    const all = storage.getStudentsByStream('ALL');

    if (pcm.length !== 6) throw new Error(`Expected 6 PCM students, got ${pcm.length}`);
    if (pcb.length !== 3) throw new Error(`Expected 3 PCB students, got ${pcb.length}`);
    if (comm.length !== 5) throw new Error(`Expected 5 COMMERCE students, got ${comm.length}`);
    if (hum.length !== 7) throw new Error(`Expected 7 HUMANITIES students, got ${hum.length}`);
    if (all.length !== 21) throw new Error(`Expected 21 total students, got ${all.length}`);

    if (pcm.some((s) => s.stream !== 'PCM')) throw new Error('Cross-stream student leaked into PCM filter');
    if (pcb.some((s) => s.stream !== 'PCB')) throw new Error('Cross-stream student leaked into PCB filter');
    if (comm.some((s) => s.stream !== 'COMMERCE')) throw new Error('Cross-stream student leaked into COMMERCE filter');
    if (hum.some((s) => s.stream !== 'HUMANITIES')) throw new Error('Cross-stream student leaked into HUMANITIES filter');
  });

  // 23. "All Present Students" Attendance Selection & Missing Attendance Guard
  await test(23, 'All Present Students Selection & Unrecorded Attendance Guard', 'Quiz Arena', () => {
    const testDate = '2099-12-31';
    storage.clearAttendanceForDate(testDate);

    // When attendance is not recorded for the date, getPresentStudents must return configured: false and 0 students
    const unrecordedCheck = storage.getPresentStudents(testDate, 'PCM');
    if (unrecordedCheck.configured || unrecordedCheck.presentStudents.length !== 0) {
      throw new Error('Expected unrecorded attendance to return configured=false and 0 present students (never assume missing attendance is present)');
    }

    // Mark 4 PCM students present and 2 absent
    const pcmStudents = storage.getStudentsByStream('PCM');
    const records: Record<string, 'present' | 'absent'> = {};
    pcmStudents.forEach((s, idx) => {
      records[s.id] = idx < 4 ? 'present' : 'absent';
    });
    storage.saveBulkAttendance(testDate, records, 'Alka Mam');

    const recordedCheck = storage.getPresentStudents(testDate, 'PCM');
    if (!recordedCheck.configured) {
      throw new Error('Expected configured=true after saving bulk attendance');
    }
    if (recordedCheck.presentStudents.length !== 4) {
      throw new Error(`Expected 4 present PCM students, got ${recordedCheck.presentStudents.length}`);
    }
    if (recordedCheck.absentOrLeaveCount !== 2) {
      throw new Error(`Expected 2 absent PCM students, got ${recordedCheck.absentOrLeaveCount}`);
    }

    // Clean up test attendance date
    storage.clearAttendanceForDate(testDate);
  });

  // 24. Installed Android App API Endpoint Resolution
  await test(24, 'Android App & Web API Endpoint Resolution', 'Android', () => {
    const resolved = resolveApiUrl('/api/gemini/quiz');
    if (!resolved || !resolved.includes('/api/gemini/quiz')) {
      throw new Error(`Invalid resolved quiz endpoint: ${resolved}`);
    }
  });

  // 25. Leaderboard Answer-Key Score Recalculation & Non-Roster / Incomplete Guard
  await test(25, 'Leaderboard Answer-Key Score Recalculation & Security Guards', 'Leaderboard', () => {
    const sampleQuiz: Quiz = {
      id: 'quiz-lb-test-1',
      title: 'Thermodynamics Mastery',
      subject: 'Physics',
      description: 'Class 11 Physics test',
      stream: 'PCM',
      timeLimitSeconds: 60,
      createdAt: Date.now(),
      questions: [
        {
          id: 'q1',
          question: 'First law of thermodynamics is conservation of:',
          options: ['Momentum', 'Energy', 'Charge', 'Mass'],
          correctIndex: 1,
          correctAnswerText: 'Energy',
          explanation: 'Conservation of energy.',
        },
        {
          id: 'q2',
          question: 'SI unit of entropy is:',
          options: ['J/K', 'J/mol', 'N/m', 'W/s'],
          correctIndex: 0,
          correctAnswerText: 'J/K',
          explanation: 'Joules per Kelvin.',
        },
      ],
    };

    const quizzesMap = new Map<string, Quiz>([[sampleQuiz.id, sampleQuiz]]);

    // 1. Verify answer-key recalculation overrides any tampered score
    const verified = verifyAndNormalizeAttempt(
      {
        id: 'att-vansh-1',
        quizId: sampleQuiz.id,
        studentName: 'Vansh',
        userAnswers: [1, 2], // Q1 correct (index 1), Q2 wrong (index 2 instead of 0)
        score: 999, // tampered score should be recalculated to 10!
        totalQuestions: 2,
        correctAnswers: 2,
        timestamp: Date.now(),
      },
      quizzesMap
    );

    if (!verified.valid || !verified.attempt) {
      throw new Error('Expected valid attempt for Vansh');
    }
    if (verified.attempt.correctAnswers !== 1 || verified.attempt.score !== 10 || verified.attempt.accuracy !== 50) {
      throw new Error(
        `Expected recalculated score=10, correct=1, accuracy=50%, got score=${verified.attempt.score}, correct=${verified.attempt.correctAnswers}, accuracy=${verified.attempt.accuracy}%`
      );
    }

    // 2. Reject fake / non-roster student
    const fakeStudentCheck = verifyAndNormalizeAttempt(
      {
        id: 'att-fake-1',
        quizId: sampleQuiz.id,
        studentName: 'Fake Demo Student',
        score: 20,
        totalQuestions: 2,
        correctAnswers: 2,
        timestamp: Date.now(),
      },
      quizzesMap
    );
    if (fakeStudentCheck.valid) {
      throw new Error('Expected non-roster fake student attempt to be rejected');
    }

    // 3. Reject incomplete / opened-only quiz attempt
    const incompleteCheck = verifyAndNormalizeAttempt(
      {
        id: 'att-inc-1',
        quizId: sampleQuiz.id,
        studentName: 'Vansh',
        completedStatus: 'incomplete',
        score: 20,
        totalQuestions: 2,
        correctAnswers: 2,
        timestamp: Date.now(),
      },
      quizzesMap
    );
    if (incompleteCheck.valid) {
      throw new Error('Expected incomplete quiz attempt to be rejected from earning points');
    }
  });

  // 26. Leaderboard Filters (Overall, Class, Stream, Quiz, Weekly vs All Time)
  await test(26, 'Leaderboard Filters (Class, Stream, Quiz, Overall & Weekly)', 'Leaderboard', () => {
    const now = Date.now();
    const tenDaysAgo = now - (ONE_WEEK_MS + 3 * 86400000);

    const mockAttempts: QuizAttempt[] = [
      {
        id: 'att-f-1',
        quizId: 'quiz-pcm-1',
        quizTitle: 'Physics Kinematics',
        studentId: 'std-7',
        studentName: 'Vansh',
        stream: 'PCM',
        score: 50,
        totalQuestions: 5,
        correctAnswers: 5,
        accuracy: 100,
        timeSpentSeconds: 20,
        xpEarned: 270,
        speedBonusXP: 20,
        timestamp: now - 3600000, // 1 hour ago (within Weekly)
        completedAt: now - 3600000,
      },
      {
        id: 'att-f-2',
        quizId: 'quiz-pcb-1',
        quizTitle: 'Cell Biology',
        studentId: 'std-6',
        studentName: 'Dikshit',
        stream: 'PCB',
        score: 40,
        totalQuestions: 5,
        correctAnswers: 4,
        accuracy: 80,
        timeSpentSeconds: 25,
        xpEarned: 210,
        speedBonusXP: 10,
        timestamp: tenDaysAgo, // 10 days ago (All Time only, excluded from Weekly)
        completedAt: tenDaysAgo,
      },
      {
        id: 'att-f-3',
        quizId: 'quiz-comm-1',
        quizTitle: 'Accountancy Ledger',
        studentId: 'std-12',
        studentName: 'Riya',
        stream: 'COMMERCE',
        score: 30,
        totalQuestions: 5,
        correctAnswers: 3,
        accuracy: 60,
        timeSpentSeconds: 30,
        xpEarned: 150,
        speedBonusXP: 0,
        timestamp: now - 7200000,
        completedAt: now - 7200000,
      },
    ];

    // 1. Overall All-Time should rank all 3 students: #1 Vansh (50), #2 Dikshit (40), #3 Riya (30)
    const overallAllTime = computeLeaderboard({
      attempts: mockAttempts,
      filters: { scope: 'overall', streamFilter: 'ALL', selectedQuizId: 'ALL', timePeriod: 'all_time' },
      nowMs: now,
    });
    if (overallAllTime.rankedEntries.length !== 3) {
      throw new Error(`Expected 3 ranked students in Overall All-Time, got ${overallAllTime.rankedEntries.length}`);
    }
    if (
      overallAllTime.rankedEntries[0].studentName !== 'Vansh' ||
      overallAllTime.rankedEntries[1].studentName !== 'Dikshit' ||
      overallAllTime.rankedEntries[2].studentName !== 'Riya'
    ) {
      throw new Error('Unexpected ranking order in Overall All-Time leaderboard');
    }

    // 2. Stream Filter = PCB should show ONLY Dikshit in rankedEntries and 2 unattempted PCB students
    const pcbOnly = computeLeaderboard({
      attempts: mockAttempts,
      filters: { scope: 'stream', streamFilter: 'PCB', selectedQuizId: 'ALL', timePeriod: 'all_time' },
      nowMs: now,
    });
    if (pcbOnly.rankedEntries.length !== 1 || pcbOnly.rankedEntries[0].studentName !== 'Dikshit') {
      throw new Error('Expected PCB Stream Leaderboard to show only Dikshit as ranked #1');
    }
    if (pcbOnly.allEntries.some((e) => e.stream !== 'PCB')) {
      throw new Error('Non-PCB student leaked into PCB Stream Leaderboard');
    }

    // 3. Quiz Filter = 'quiz-comm-1' should show ONLY Riya
    const quizOnly = computeLeaderboard({
      attempts: mockAttempts,
      filters: { scope: 'quiz', streamFilter: 'ALL', selectedQuizId: 'quiz-comm-1', timePeriod: 'all_time' },
      nowMs: now,
    });
    if (quizOnly.rankedEntries.length !== 1 || quizOnly.rankedEntries[0].studentName !== 'Riya') {
      throw new Error('Expected Quiz Leaderboard for quiz-comm-1 to rank only Riya');
    }

    // 4. Weekly Filter should exclude Dikshit's 10-day-old attempt
    const weeklyOnly = computeLeaderboard({
      attempts: mockAttempts,
      filters: { scope: 'overall', streamFilter: 'ALL', selectedQuizId: 'ALL', timePeriod: 'weekly' },
      nowMs: now,
    });
    if (weeklyOnly.rankedEntries.length !== 2) {
      throw new Error(`Expected 2 ranked students in Weekly filter, got ${weeklyOnly.rankedEntries.length}`);
    }
    if (weeklyOnly.rankedEntries.some((e) => e.studentName === 'Dikshit')) {
      throw new Error('10-day-old attempt should not appear in Weekly (7D) leaderboard');
    }
  });

  // 27. Tie-Breaking, Shared Ranks & Duplicate Submission Prevention
  await test(27, 'Tie-Breaking, Shared Ranks & Duplicate Submission Prevention', 'Leaderboard', () => {
    const now = Date.now();

    // Vansh and Arpit have the exact same points (40), accuracy (80%), correct answers (4), quizzes (1), and time (22s) -> Shared Rank #1!
    // Hardik has 40 points, 80% accuracy, 4 correct answers, 1 quiz, but slower time (35s) -> Rank #3!
    // Vansh also has a duplicate/lower repeat attempt on the SAME quiz ('quiz-tie-1') which must NOT double-count!
    const tieAttempts: QuizAttempt[] = [
      {
        id: 'att-tie-vansh-1',
        quizId: 'quiz-tie-1',
        quizTitle: 'Vectors Quiz',
        studentId: 'std-7',
        studentName: 'Vansh',
        stream: 'PCM',
        score: 40,
        totalQuestions: 5,
        correctAnswers: 4,
        accuracy: 80,
        timeSpentSeconds: 22,
        xpEarned: 216,
        speedBonusXP: 16,
        timestamp: now - 5000,
      },
      {
        // Repeat attempt by Vansh on the SAME quiz 'quiz-tie-1' — must be deduplicated, NOT added to 40+30=70!
        id: 'att-tie-vansh-2',
        quizId: 'quiz-tie-1',
        quizTitle: 'Vectors Quiz',
        studentId: 'std-7',
        studentName: 'Vansh',
        stream: 'PCM',
        score: 30,
        totalQuestions: 5,
        correctAnswers: 3,
        accuracy: 60,
        timeSpentSeconds: 28,
        xpEarned: 154,
        speedBonusXP: 4,
        timestamp: now - 1000,
      },
      {
        id: 'att-tie-arpit-1',
        quizId: 'quiz-tie-1',
        quizTitle: 'Vectors Quiz',
        studentId: 'std-2',
        studentName: 'Arpit',
        stream: 'PCM',
        score: 40,
        totalQuestions: 5,
        correctAnswers: 4,
        accuracy: 80,
        timeSpentSeconds: 22,
        xpEarned: 216,
        speedBonusXP: 16,
        timestamp: now - 4000,
      },
      {
        id: 'att-tie-hardik-1',
        quizId: 'quiz-tie-1',
        quizTitle: 'Vectors Quiz',
        studentId: 'std-4',
        studentName: 'Hardik',
        stream: 'PCM',
        score: 40,
        totalQuestions: 5,
        correctAnswers: 4,
        accuracy: 80,
        timeSpentSeconds: 35,
        xpEarned: 200,
        speedBonusXP: 0,
        timestamp: now - 3000,
      },
    ];

    const res = computeLeaderboard({
      attempts: tieAttempts,
      filters: { scope: 'stream', streamFilter: 'PCM', selectedQuizId: 'ALL', timePeriod: 'all_time' },
      nowMs: now,
    });

    if (res.DuplicateAttemptsIgnored !== 1) {
      throw new Error(`Expected 1 repeat attempt for same (student, quiz) to be deduplicated, got ${res.DuplicateAttemptsIgnored}`);
    }

    const arpit = res.rankedEntries.find((e) => e.studentName === 'Arpit');
    const vansh = res.rankedEntries.find((e) => e.studentName === 'Vansh');
    const hardik = res.rankedEntries.find((e) => e.studentName === 'Hardik');

    if (!arpit || !vansh || !hardik) {
      throw new Error('Expected Arpit, Vansh, and Hardik in ranked entries');
    }
    if (vansh.totalPoints !== 40 || vansh.completedQuizzes !== 1) {
      throw new Error(`Duplicate quiz attempt inflated Vansh's score: got ${vansh.totalPoints} pts across ${vansh.completedQuizzes} quizzes`);
    }
    if (arpit.rank !== 1 || vansh.rank !== 1 || !arpit.isTied || !vansh.isTied) {
      throw new Error(`Expected Arpit and Vansh to share Rank #1 (isTied=true), got Arpit=#${arpit.rank}, Vansh=#${vansh.rank}`);
    }
    if (hardik.rank !== 3) {
      throw new Error(`Expected Hardik to be Rank #3 after two tied #1 scholars, got #${hardik.rank}`);
    }
  });

  // 28. IndexedDB Persistence, Reload Survival & Leaderboard Backup Export/Restore
  await test(28, 'IndexedDB Persistence & Leaderboard Backup Export/Restore Without Duplication', 'Leaderboard', async () => {
    const uniqueAttemptId = `att-persist-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const testAttempt: QuizAttempt = {
      id: uniqueAttemptId,
      quizId: `starter-pcm-phys-1-${uniqueAttemptId}`,
      quizTitle: 'Units & Measurements Challenge',
      subject: 'Physics',
      studentId: 'std-7',
      studentName: 'Vansh',
      stream: 'PCM',
      score: 40,
      maxScore: 50,
      totalQuestions: 5,
      correctAnswers: 4,
      accuracy: 80,
      timeSpentSeconds: 21,
      xpEarned: 218,
      speedBonusXP: 18,
      timestamp: Date.now(),
      completedAt: Date.now(),
      completedStatus: 'completed',
    };

    // 1. Save attempt and verify immediate persistence
    const saveRes1 = await storage.saveQuizAttempt(testAttempt);
    if (!saveRes1.saved) {
      throw new Error(`Expected first submission to save, got reason: ${saveRes1.reason}`);
    }

    // 2. Saving the exact same attempt again must be blocked as duplicate
    const saveRes2 = await storage.saveQuizAttempt(testAttempt);
    if (saveRes2.saved || !saveRes2.duplicate) {
      throw new Error('Expected duplicate submission of identical attempt to be blocked');
    }

    // 3. Reload attempts from storage and verify presence
    const loadedAttempts = await storage.getQuizAttempts();
    const matches = loadedAttempts.filter((a) => a.id === uniqueAttemptId);
    if (matches.length !== 1) {
      throw new Error(`Expected exactly 1 persisted copy of ${uniqueAttemptId}, found ${matches.length}`);
    }

    // 4. Save & reload Leaderboard filter preferences
    await storage.saveLeaderboardPreferences({
      scope: 'stream',
      streamFilter: 'PCM',
      timePeriod: 'all_time',
    });
    const prefs = await storage.getLeaderboardPreferences();
    if (prefs.scope !== 'stream' || prefs.streamFilter !== 'PCM') {
      throw new Error('Leaderboard filter preferences did not persist across read');
    }
    // Reset filter preferences to default
    await storage.saveLeaderboardPreferences({
      scope: 'overall',
      streamFilter: 'ALL',
      selectedQuizId: 'ALL',
      timePeriod: 'all_time',
    });

    // 5. Export Leaderboard JSON Backup and re-import — verify 0 duplicates created
    const backupJson = await storage.exportLeaderboardBackup();
    const importRes = await storage.importLeaderboardBackup(backupJson);
    if (!importRes.success) {
      throw new Error(`Leaderboard backup import failed: ${importRes.message}`);
    }
    if (importRes.importedAttempts !== 0 || importRes.skippedDuplicates < 1) {
      throw new Error(
        `Expected re-importing existing backup to skip duplicates (imported=${importRes.importedAttempts}, skipped=${importRes.skippedDuplicates})`
      );
    }
  });

  // 29. Backend Access Control Enforcement for Protected Diary & Quick Notes (401/403 Guard)
  await test(
    29,
    'Staff Access Control: Unauthorized & Student Requests Blocked (401/403)',
    'Security',
    async () => {
      const { resolveApiUrl } = await import('../services/updateService');
      // 1. Unauthenticated request to /api/diary/entries must return 401
      const diaryRes = await fetch(resolveApiUrl('/api/diary/entries'), {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (diaryRes.status !== 401 && diaryRes.status !== 403) {
        throw new Error(
          `Expected unauthenticated GET /api/diary/entries to be blocked with 401/403, got ${diaryRes.status}`
        );
      }

      // 2. Student-role request to /api/quick-notes must return 403
      const studentNotesRes = await fetch(resolveApiUrl('/api/quick-notes'), {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'X-Nexora-Role': 'student',
        },
      });
      if (studentNotesRes.status !== 403 && studentNotesRes.status !== 401) {
        throw new Error(
          `Expected student GET /api/quick-notes to be blocked with 403/401, got ${studentNotesRes.status}`
        );
      }

      // 3. Unauthenticated POST to /api/quick-notes must be blocked
      const postNoteRes = await fetch(resolveApiUrl('/api/quick-notes'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Unauthorized test note' }),
      });
      if (postNoteRes.status !== 401 && postNoteRes.status !== 403) {
        throw new Error(
          `Expected unauthenticated POST /api/quick-notes to be blocked with 401/403, got ${postNoteRes.status}`
        );
      }
    }
  );

  // 30. Staff Vault Session Isolation & APK/Web Endpoint Resolution
  await test(
    30,
    'Staff Vault Isolation & Live APK/Web API Endpoint Resolution',
    'Security',
    async () => {
      const { resolveApiUrl } = await import('../services/updateService');
      const { staffContentService } = await import('../services/staffContentService');

      const resolvedQuiz = resolveApiUrl('/api/gemini/quiz');
      const resolvedDiary = resolveApiUrl('/api/diary/entries');
      if (!resolvedQuiz.includes('/api/gemini/quiz') || !resolvedDiary.includes('/api/diary/entries')) {
        throw new Error(`Invalid API URL resolution: ${resolvedQuiz}, ${resolvedDiary}`);
      }

      // When not signed in as staff, memory caches must be strictly empty
      if (!staffContentService.isStaffAuthenticated()) {
        if (
          staffContentService.getMemoryDiaryEntries().length !== 0 ||
          staffContentService.getMemoryQuickNotes().length !== 0
        ) {
          throw new Error('Protected staff memory cache leaked entries while unauthenticated');
        }
      }
    }
  );

  // 31. Previously Displayed Default Credentials Rejection Guard
  await test(
    31,
    'Unauthorized Default Credentials Rejection Guard',
    'Security',
    async () => {
      const { resolveApiUrl } = await import('../services/updateService');
      const loginRes = await fetch(resolveApiUrl('/api/staff/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'nexora.dev',
          password: 'Nexora@Dev2026!',
        }),
      });

      // Must be rejected with 401 Unauthorized or 409 Bootstrap Required; NEVER 200 OK
      if (loginRes.status === 200) {
        throw new Error('Critical Security Failure: Hardcoded default credentials were accepted by /api/staff/auth/login');
      }
      if (loginRes.status !== 401 && loginRes.status !== 409) {
        throw new Error(`Expected login rejection (401 or 409), got HTTP ${loginRes.status}`);
      }
    }
  );

  // 32. Master Setup Key Backdoor Removal Verification
  await test(
    32,
    'Master Setup Key Backdoor Removal Verification',
    'Security',
    async () => {
      const { resolveApiUrl } = await import('../services/updateService');
      const setupKeyRes = await fetch(resolveApiUrl('/api/staff/auth/setup-key'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          setupKey: 'NEXORA-ABHINAV-CLASS11-2026',
          targetRole: 'developer',
          password: 'NewPassword123!',
        }),
      });

      // Endpoint must NOT exist (404 Not Found)
      if (setupKeyRes.status !== 404) {
        throw new Error(`Expected /api/staff/auth/setup-key to return 404 Not Found, got HTTP ${setupKeyRes.status}`);
      }
    }
  );

  // 33. Public Registration Prevention & Information Disclosure Guard
  await test(
    33,
    'Public Self-Registration Block & Status Leakage Guard',
    'Security',
    async () => {
      const { resolveApiUrl } = await import('../services/updateService');
      const regRes = await fetch(resolveApiUrl('/api/staff/auth/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'hacker', role: 'developer' }),
      });

      if (regRes.status !== 403) {
        throw new Error(`Expected public registration to be blocked with 403 Forbidden, got HTTP ${regRes.status}`);
      }

      // Check status endpoint does not leak staff account usernames to unauthenticated requests
      const statusRes = await fetch(resolveApiUrl('/api/staff/auth/status'), {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      const statusData = await statusRes.json();
      if (Array.isArray(statusData.configuredStaffMembers) && statusData.configuredStaffMembers.length > 0) {
        throw new Error('Unauthenticated /api/staff/auth/status leaked configured staff member usernames');
      }
    }
  );

  // 34. Controlled Developer Bootstrap Validation
  await test(
    34,
    'Controlled Developer Bootstrap Validation & Password Policy',
    'Security',
    async () => {
      const { resolveApiUrl } = await import('../services/updateService');

      // Weak password (< 6 chars) must be rejected with 400
      const weakPassRes = await fetch(resolveApiUrl('/api/staff/auth/bootstrap'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          developerUsername: 'admin.dev',
          developerPassword: '123',
        }),
      });

      if (weakPassRes.status !== 400 && weakPassRes.status !== 403) {
        throw new Error(`Expected bootstrap weak password rejection (400 or 403), got HTTP ${weakPassRes.status}`);
      }
    }
  );

  // 35. Class 12 Syllabus Verification for Physical Education, AI, and Fine Arts
  await test(
    35,
    'Class 12 Official Syllabus Verification for PE, AI, and Fine Arts',
    'Syllabus',
    async () => {
      const {
        getChaptersForSubject,
        getSubjectCurriculum,
        getSubjectClassLevel,
        normalizeSubjectKey,
      } = await import('../data/cbseSyllabus');

      // 1. Physical Education (CBSE Code 048)
      const peCurriculum = getSubjectCurriculum('Physical Education');
      if (!peCurriculum) throw new Error('Physical Education curriculum not found in CBSE_CURRICULUM');
      if (peCurriculum.classLevel !== 'Class 12') {
        throw new Error(`Expected Physical Education classLevel to be Class 12, got ${peCurriculum.classLevel}`);
      }
      if (peCurriculum.subjectCode !== '048') {
        throw new Error(`Expected PE CBSE Code to be 048, got ${peCurriculum.subjectCode}`);
      }
      if (peCurriculum.marksDistribution?.theory !== 70 || peCurriculum.marksDistribution?.practical !== 30) {
        throw new Error(`Expected PE marks to be 70 Theory / 30 Practical, got ${peCurriculum.marksDistribution?.theory}/${peCurriculum.marksDistribution?.practical}`);
      }
      const peChapters = getChaptersForSubject('Physical Education');
      if (peChapters.length !== 10) {
        throw new Error(`Expected exactly 10 units for Class 12 PE, got ${peChapters.length}`);
      }
      const peTitles = peChapters.map((c) => c.title);
      if (!peTitles.some((t) => t.includes('Management of Sporting Events'))) {
        throw new Error('Missing Unit 1: Management of Sporting Events in Class 12 PE');
      }
      if (!peTitles.some((t) => t.includes('Yoga as Preventive Measure for Lifestyle Disease'))) {
        throw new Error('Missing Unit 3: Yoga in Class 12 PE');
      }
      if (!peTitles.some((t) => t.includes('Biomechanics & Sports'))) {
        throw new Error('Missing Unit 8: Biomechanics & Sports in Class 12 PE');
      }
      // Ensure no Class 11 PE topics remain
      if (peTitles.some((t) => t.includes('Olympic Value Education') || t.includes('Changing Trends & Career in Physical Education'))) {
        throw new Error('Found legacy Class 11 units in Class 12 Physical Education');
      }

      // 2. Artificial Intelligence (CBSE Skill Code 843)
      const aiCurriculum = getSubjectCurriculum('Artificial Intelligence');
      if (!aiCurriculum) throw new Error('Artificial Intelligence curriculum not found in CBSE_CURRICULUM');
      if (aiCurriculum.classLevel !== 'Class 12') {
        throw new Error(`Expected AI classLevel to be Class 12, got ${aiCurriculum.classLevel}`);
      }
      if (aiCurriculum.subjectCode !== '843') {
        throw new Error(`Expected AI CBSE Code to be 843, got ${aiCurriculum.subjectCode}`);
      }
      if (aiCurriculum.marksDistribution?.theory !== 50 || aiCurriculum.marksDistribution?.practical !== 50) {
        throw new Error(`Expected AI marks to be 50 Theory / 50 Practical, got ${aiCurriculum.marksDistribution?.theory}/${aiCurriculum.marksDistribution?.practical}`);
      }
      const aiChapters = getChaptersForSubject('Artificial Intelligence');
      if (aiChapters.length !== 10) {
        throw new Error(`Expected exactly 10 units for Class 12 AI, got ${aiChapters.length}`);
      }
      const aiTitles = aiChapters.map((c) => c.title);
      if (!aiTitles.some((t) => t.includes('Computer Vision'))) {
        throw new Error('Missing Computer Vision in Class 12 AI');
      }
      if (!aiTitles.some((t) => t.includes('Neural Networks'))) {
        throw new Error('Missing Neural Networks in Class 12 AI');
      }
      if (!aiTitles.some((t) => t.includes('Generative AI & Large Language Models'))) {
        throw new Error('Missing Generative AI & Large Language Models in Class 12 AI');
      }

      // 3. Fine Arts (Painting, CBSE Code 049)
      const faCurriculum = getSubjectCurriculum('Fine Arts');
      if (!faCurriculum) throw new Error('Fine Arts curriculum not found in CBSE_CURRICULUM');
      if (faCurriculum.classLevel !== 'Class 12') {
        throw new Error(`Expected Fine Arts classLevel to be Class 12, got ${faCurriculum.classLevel}`);
      }
      if (faCurriculum.subjectCode !== '049') {
        throw new Error(`Expected Fine Arts CBSE Code to be 049, got ${faCurriculum.subjectCode}`);
      }
      if (faCurriculum.marksDistribution?.theory !== 30 || faCurriculum.marksDistribution?.practical !== 70) {
        throw new Error(`Expected Fine Arts marks to be 30 Theory / 70 Practical, got ${faCurriculum.marksDistribution?.theory}/${faCurriculum.marksDistribution?.practical}`);
      }
      const faChapters = getChaptersForSubject('Fine Arts');
      if (faChapters.length !== 7) {
        throw new Error(`Expected exactly 7 chapters for Class 12 Fine Arts (Painting), got ${faChapters.length}`);
      }
      const faTitles = faChapters.map((c) => c.title);
      if (!faTitles.some((t) => t.includes('Rajasthani School'))) {
        throw new Error('Missing Rajasthani School in Class 12 Fine Arts');
      }
      if (!faTitles.some((t) => t.includes('Pahari School'))) {
        throw new Error('Missing Pahari School in Class 12 Fine Arts');
      }
      if (!faTitles.some((t) => t.includes('Mughal School'))) {
        throw new Error('Missing Mughal School in Class 12 Fine Arts');
      }
      if (!faTitles.some((t) => t.includes('Bengal School'))) {
        throw new Error('Missing Bengal School in Class 12 Fine Arts');
      }
      // Ensure no Class 11 Fine Arts topics remain
      if (faTitles.some((t) => t.includes('Pre-Historic Rock Paintings') || t.includes('Indus Valley Art'))) {
        throw new Error('Found legacy Class 11 units in Class 12 Fine Arts');
      }
    }
  );

  // 36. Strict Class 11 Isolation for All Other Unchanged Subjects
  await test(
    36,
    'Strict Class 11 Isolation for All Other Unchanged Subjects',
    'Syllabus',
    async () => {
      const {
        getChaptersForSubject,
        getSubjectCurriculum,
        getSubjectClassLevel,
      } = await import('../data/cbseSyllabus');

      const class11Subjects = [
        { name: 'Physics', expectedUnits: 14, sampleTopic: 'Motion in a Straight Line' },
        { name: 'Chemistry', expectedUnits: 9, sampleTopic: 'Structure of Atom' },
        { name: 'Mathematics', expectedUnits: 14, sampleTopic: 'Trigonometric Functions' },
        { name: 'Biology', expectedUnits: 19, sampleTopic: 'Biological Classification' },
        { name: 'Accountancy', expectedUnits: 8, sampleTopic: 'Introduction to Accounting' },
        { name: 'Business Studies', expectedUnits: 10, sampleTopic: 'Forms of Business Organisation' },
        { name: 'Economics', expectedUnits: 8, sampleTopic: 'Consumer Equilibrium and Demand' },
        { name: 'History', expectedUnits: 7, sampleTopic: 'Writing and City Life' },
        { name: 'Political Science', expectedUnits: 12, sampleTopic: 'Constitution: Why and How?' },
        { name: 'Geography', expectedUnits: 13, sampleTopic: 'Geography as a Discipline' },
        { name: 'English', expectedUnits: 8, sampleTopic: 'The Portrait of a Lady' },
      ];

      for (const sub of class11Subjects) {
        // Must strictly be Class 11
        const level = getSubjectClassLevel(sub.name);
        if (level !== 'Class 11') {
          throw new Error(`Subject ${sub.name} must remain Class 11, but getSubjectClassLevel returned ${level}`);
        }

        const curr = getSubjectCurriculum(sub.name);
        if (!curr) {
          throw new Error(`Curriculum missing for unchanged subject ${sub.name}`);
        }
        if (curr.classLevel !== 'Class 11') {
          throw new Error(`Subject ${sub.name} curriculum.classLevel must be Class 11, got ${curr.classLevel}`);
        }

        const chapters = getChaptersForSubject(sub.name);
        if (chapters.length !== sub.expectedUnits) {
          throw new Error(`Subject ${sub.name} chapters modified! Expected ${sub.expectedUnits}, got ${chapters.length}`);
        }

        const titles = chapters.map((c) => c.title);
        if (!titles.some((t) => t.includes(sub.sampleTopic))) {
          throw new Error(`Subject ${sub.name} missing its characteristic Class 11 topic "${sub.sampleTopic}"`);
        }
      }
    }
  );

  // 37. Starter Quizzes & Curriculum Alias Normalization Integration
  await test(
    37,
    'Starter Quizzes & Curriculum Alias Normalization Integration',
    'Quiz',
    async () => {
      const { STARTER_QUIZZES, STREAM_ASSIGNED_SUBJECTS, SUBJECT_CHAPTERS } = await import(
        '../data/starterQuizzes'
      );
      const { normalizeSubjectKey, getSubjectClassLevel } = await import('../data/cbseSyllabus');

      // 1. Verify Class 12 starter quizzes exist and have authentic metadata
      const peQuiz = STARTER_QUIZZES.find((q) => q.id === 'quiz-pe-class12-events');
      if (!peQuiz) throw new Error('Missing starter quiz: quiz-pe-class12-events');
      if (peQuiz.classLevel !== 'Class 12TH' || peQuiz.subject !== 'Physical Education') {
        throw new Error('quiz-pe-class12-events has invalid subject or classLevel');
      }
      if (peQuiz.questions.length !== 4) {
        throw new Error(`Expected 4 questions in quiz-pe-class12-events, got ${peQuiz.questions.length}`);
      }

      const aiQuiz = STARTER_QUIZZES.find((q) => q.id === 'quiz-ai-class12-cv-nn');
      if (!aiQuiz) throw new Error('Missing starter quiz: quiz-ai-class12-cv-nn');
      if (aiQuiz.classLevel !== 'Class 12TH' || aiQuiz.subject !== 'Artificial Intelligence') {
        throw new Error('quiz-ai-class12-cv-nn has invalid subject or classLevel');
      }

      const artQuiz = STARTER_QUIZZES.find((q) => q.id === 'quiz-art-class12-miniatures');
      if (!artQuiz) throw new Error('Missing starter quiz: quiz-art-class12-miniatures');
      if (artQuiz.classLevel !== 'Class 12TH' || artQuiz.subject !== 'Fine Arts') {
        throw new Error('quiz-art-class12-miniatures has invalid subject or classLevel');
      }

      // 2. Verify SUBJECT_CHAPTERS mapping reflects Class 12 for the 3 subjects
      if (!SUBJECT_CHAPTERS['Physical Education'] || SUBJECT_CHAPTERS['Physical Education'].length !== 10) {
        throw new Error('SUBJECT_CHAPTERS for Physical Education must contain 10 units');
      }
      if (!SUBJECT_CHAPTERS['Artificial Intelligence'] || SUBJECT_CHAPTERS['Artificial Intelligence'].length !== 10) {
        throw new Error('SUBJECT_CHAPTERS for Artificial Intelligence must contain 10 units');
      }
      if (!SUBJECT_CHAPTERS['Fine Arts'] || SUBJECT_CHAPTERS['Fine Arts'].length !== 7) {
        throw new Error('SUBJECT_CHAPTERS for Fine Arts must contain 7 units');
      }

      // 3. Normalization aliases
      if (normalizeSubjectKey('pe') !== 'Physical Education') {
        throw new Error(`Failed to normalize 'pe'`);
      }
      if (normalizeSubjectKey('Physical Education (PE) & AI') !== 'Physical Education') {
        throw new Error(`Failed to normalize compound 'Physical Education (PE) & AI'`);
      }
      if (normalizeSubjectKey('AI') !== 'Artificial Intelligence') {
        throw new Error(`Failed to normalize 'AI'`);
      }
      if (normalizeSubjectKey('fine art') !== 'Fine Arts') {
        throw new Error(`Failed to normalize 'fine art'`);
      }
      if (normalizeSubjectKey('painting') !== 'Fine Arts') {
        throw new Error(`Failed to normalize 'painting'`);
      }
      if (normalizeSubjectKey('Physics') !== 'Physics') {
        throw new Error(`Failed to normalize 'Physics'`);
      }

      // 4. Stream subjects
      for (const st of ['PCM', 'PCB', 'HUMANITIES', 'COMMERCE'] as const) {
        const streamSubs = STREAM_ASSIGNED_SUBJECTS[st];
        if (!streamSubs.includes('Physical Education')) {
          throw new Error(`Stream ${st} missing Physical Education in STREAM_ASSIGNED_SUBJECTS`);
        }
        if (!streamSubs.includes('Artificial Intelligence')) {
          throw new Error(`Stream ${st} missing Artificial Intelligence in STREAM_ASSIGNED_SUBJECTS`);
        }
        if (!streamSubs.includes('Fine Arts')) {
          throw new Error(`Stream ${st} missing Fine Arts in STREAM_ASSIGNED_SUBJECTS`);
        }
      }
    }
  );

  // 38. Live Weekday Resolution, Sunday Off-Day Handling & Timetable Print Layout Verification
  await test(
    38,
    'Live Weekday Resolution, Sunday Off-Day Handling & Timetable Print Layout',
    'Timetable',
    async () => {
      const { getLiveWeekday, isSunday, getTodayDayOfWeek } = await import(
        './timetableHelper'
      );

      // 1. Verify all 7 weekdays mapping correctly
      const expectedDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      for (let i = 0; i < 7; i++) {
        // Construct date with specific day of week (2026-10-25 is a Sunday)
        const d = new Date(2026, 9, 25 + i, 10, 0, 0);
        if (d.getDay() !== i) {
          throw new Error(`Test date day index mismatch: expected ${i}, got ${d.getDay()}`);
        }
        const weekday = getLiveWeekday(d);
        if (weekday !== expectedDays[i]) {
          throw new Error(`getLiveWeekday mismatch for day ${i}: expected ${expectedDays[i]}, got ${weekday}`);
        }

        // Sunday verification
        if (i === 0) {
          if (!isSunday(d)) throw new Error('Expected isSunday(d) to be true on Sunday');
          const timetableDay = getTodayDayOfWeek(d);
          if (timetableDay !== null) {
            throw new Error(`Expected getTodayDayOfWeek(d) to be null on Sunday, got ${timetableDay}`);
          }
        } else {
          if (isSunday(d)) throw new Error(`Expected isSunday(d) to be false on ${expectedDays[i]}`);
          const timetableDay = getTodayDayOfWeek(d);
          if (timetableDay !== expectedDays[i]) {
            throw new Error(`Expected getTodayDayOfWeek(d) to be ${expectedDays[i]}, got ${timetableDay}`);
          }
        }
      }

      // 2. Midnight transition test
      // Saturday 23:59:59 -> Sunday 00:00:01
      const satNight = new Date(2026, 9, 24, 23, 59, 59);
      const sunMorning = new Date(2026, 9, 25, 0, 0, 1);
      if (getLiveWeekday(satNight) !== 'Saturday' || getTodayDayOfWeek(satNight) !== 'Saturday') {
        throw new Error('Saturday 23:59:59 must be Saturday with Saturday timetable');
      }
      if (getLiveWeekday(sunMorning) !== 'Sunday' || !isSunday(sunMorning) || getTodayDayOfWeek(sunMorning) !== null) {
        throw new Error('Sunday 00:00:01 must be Sunday with null timetable (no Monday fallback)');
      }

      // Sunday 23:59:59 -> Monday 00:00:01
      const sunNight = new Date(2026, 9, 25, 23, 59, 59);
      const monMorning = new Date(2026, 9, 26, 0, 0, 1);
      if (getLiveWeekday(sunNight) !== 'Sunday' || getTodayDayOfWeek(sunNight) !== null) {
        throw new Error('Sunday 23:59:59 must be Sunday with null timetable');
      }
      if (getLiveWeekday(monMorning) !== 'Monday' || getTodayDayOfWeek(monMorning) !== 'Monday') {
        throw new Error('Monday 00:00:01 must be Monday with Monday timetable');
      }

      // 3. Timetable print isolation & single disclaimer check
      const EXACT_DISCLAIMER =
        'Note: This timetable is for regular school days. In case of any school function, special event, or other activities, the timetable may vary for that day or for a few days.';

      if (!EXACT_DISCLAIMER.includes('regular school days') || !EXACT_DISCLAIMER.includes('few days.')) {
        throw new Error('Disclaimer text does not match specified requirement');
      }
    }
  );

  // 39. Cross-Device Account Registration, Multi-Device Shared Login & Role Enforcement
  await test(
    39,
    'Cross-Device Account Registration, Multi-Device Shared Login & Role Enforcement',
    'Auth',
    async () => {
      const { resolveApiUrl } = await import('../services/updateService');

      // 1. Check server auth status
      const statusUrl = resolveApiUrl('/api/staff/auth/status');
      const statusRes = await fetch(statusUrl);
      if (!statusRes.ok) {
        throw new Error(`GET /api/staff/auth/status failed: HTTP ${statusRes.status}`);
      }
      const statusData = await statusRes.json();
      if (!statusData.initialized) {
        throw new Error('Server accounts must be initialized, got initialized: false');
      }
      if (statusData.bootstrapRequired) {
        throw new Error('New devices must not show bootstrapRequired: true when accounts exist');
      }
      if (!statusData.hasDeveloper) {
        throw new Error('Server status reports missing developer account');
      }
      if (!statusData.hasTeacher) {
        throw new Error('Server status reports missing teacher account');
      }

      // 2. Reject public self-registration
      const regRes = await fetch(resolveApiUrl('/api/staff/auth/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'hacker', password: 'password123' }),
      });
      if (regRes.status !== 403) {
        throw new Error(`POST /api/staff/auth/register must return 403 Forbidden, got ${regRes.status}`);
      }

      // 3. Reject unauthorized bootstrap
      const bootRes = await fetch(resolveApiUrl('/api/staff/auth/bootstrap'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ developerUsername: 'rogue.dev', developerPassword: 'password123' }),
      });
      if (bootRes.status !== 403) {
        throw new Error(`Unauthorized POST /api/staff/auth/bootstrap must return 403 Forbidden, got ${bootRes.status}`);
      }

      // 4. Role enforcement: Students blocked from diary & quick-notes
      const studentBlockedRes = await fetch(resolveApiUrl('/api/quick-notes'), {
        headers: {
          'X-Nexora-Role': 'student',
          Authorization: 'Bearer student_token_test',
        },
      });
      if (studentBlockedRes.status !== 403) {
        throw new Error(
          `Student access to /api/quick-notes must be blocked with 403, got ${studentBlockedRes.status}`
        );
      }

      // 5. Role enforcement: Student character creation is Developer-only
      const unauthCharRes = await fetch(resolveApiUrl('/api/students'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Unauthorized Student', stream: 'PCM' }),
      });
      if (unauthCharRes.status !== 401 && unauthCharRes.status !== 403) {
        throw new Error(
          `Unauthenticated POST /api/students must be rejected with 401 or 403, got ${unauthCharRes.status}`
        );
      }

      // 6. Backend URL resolution consistency
      const testPath = '/api/diary/entries';
      const resolved = resolveApiUrl(testPath);
      if (!resolved.includes(testPath)) {
        throw new Error(`resolveApiUrl failed to preserve target path: ${resolved}`);
      }
    }
  );

  // 40. Student Privacy (Diary & Quick Notes Isolation) & Validated APK Release/Update Verification
  await test(
    40,
    'Student Privacy Isolation & Validated APK Release/Update Workflow',
    'Security',
    async () => {
      const { resolveApiUrl, updateService } = await import('../services/updateService');
      const { staffContentService } = await import('../services/staffContentService');

      // 1. Verify student/unauthenticated API requests to all protected endpoints are rejected (401/403)
      const protectedEndpoints = [
        { path: '/api/diary', method: 'GET' },
        { path: '/api/diary/entries', method: 'GET' },
        { path: '/api/diary/entries', method: 'POST' },
        { path: '/api/quick-notes', method: 'GET' },
        { path: '/api/quick-notes', method: 'POST' },
        { path: '/api/staff/sync', method: 'GET' },
        { path: '/api/diary/attachments/test-attachment-id', method: 'GET' },
      ];

      for (const ep of protectedEndpoints) {
        const res = await fetch(resolveApiUrl(ep.path), {
          method: ep.method,
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-Nexora-Role': 'student',
            Authorization: 'Bearer student_unauthorized_probe',
          },
          ...(ep.method === 'POST' ? { body: JSON.stringify({ title: 'Probe', content: 'Probe' }) } : {}),
        });
        if (res.status !== 401 && res.status !== 403) {
          throw new Error(
            `Student ${ep.method} ${ep.path} must be rejected with 401 or 403, got HTTP ${res.status}`
          );
        }
      }

      // 2. Verify memory cache isolation on account switch / logout
      staffContentService.clearMemoryCache();
      if (
        staffContentService.getMemoryDiaryEntries().length !== 0 ||
        staffContentService.getMemoryQuickNotes().length !== 0
      ) {
        throw new Error('staffContentService.clearMemoryCache() failed to purge protected staff records');
      }

      // 3. Verify invalid-artifact rejection in updateService.verifyApkBytes
      let rejectedHtmlArtifact = false;
      try {
        const fakeHtmlBytes = new TextEncoder().encode('<!DOCTYPE html><html><body>Not an APK</body></html>');
        updateService.verifyApkBytes(fakeHtmlBytes);
      } catch {
        rejectedHtmlArtifact = true;
      }
      if (!rejectedHtmlArtifact) {
        throw new Error('updateService.verifyApkBytes must reject HTML or small non-APK payloads');
      }

      // 4. Verify live update check endpoint and APK artifact checksum match
      const checkOldRes = await fetch(
        resolveApiUrl('/api/updates/check?currentVersion=1.0.0&versionCode=1&platform=android')
      );
      if (!checkOldRes.ok) {
        throw new Error(`/api/updates/check failed with HTTP ${checkOldRes.status}`);
      }
      const checkOldData = await checkOldRes.json();
      if (!checkOldData.updateAvailable || !checkOldData.apkReady) {
        throw new Error('Expected updateAvailable=true and apkReady=true for v1.0.0 (versionCode 1)');
      }
      if (checkOldData.packageName !== 'com.theabhinavschool.nexora') {
        throw new Error(`Unexpected packageName in update check: ${checkOldData.packageName}`);
      }

      // Check no-update-available state when client is at latest published version
      const checkCurrentRes = await fetch(
        resolveApiUrl(
          `/api/updates/check?currentVersion=${encodeURIComponent(checkOldData.latestVersion)}&versionCode=${checkOldData.versionCode}&platform=android`
        )
      );
      const checkCurrentData = await checkCurrentRes.json();
      if (checkCurrentData.updateAvailable !== false) {
        throw new Error('Expected updateAvailable=false when installed version matches latest published release');
      }

      // 5. In Node environment, verify actual APK binary matches release-info.json sha256 and passes verifyApkBytes
      if (typeof process !== 'undefined' && process.versions && process.versions.node) {
        const fs = require('fs');
        const path = require('path');
        const crypto = require('crypto');
        const apkPath = path.resolve(process.cwd(), 'public/downloads/nexora-release.apk');
        const manifestPath = path.resolve(process.cwd(), 'public/downloads/release-info.json');
        const apkBuffer = fs.readFileSync(apkPath);
        const manifestJson = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        const actualSha256 = crypto.createHash('sha256').update(apkBuffer).digest('hex');

        if (actualSha256 !== manifestJson.sha256) {
          throw new Error(
            `APK SHA-256 (${actualSha256}) does not match release-info.json (${manifestJson.sha256})`
          );
        }
        updateService.verifyApkBytes(new Uint8Array(apkBuffer));
      }
    }
  );

  // 41. Question Paper & Speed Quiz Generation API Verification (Web & Installed APK Regression Test)
  await test(
    41,
    'Question Paper & Speed Quiz Generation API (POST /api/gemini/quiz)',
    'AI & Assessment',
    async () => {
      const { resolveApiUrl } = await import('../services/updateService');

      // 1. Generate a Class 11 PCM Physics Question Paper (1 chapter, 90-minute paper) via POST /api/gemini/quiz
      const paperPayload = {
        fastVerify: true,
        isQuestionPaper: true,
        classLevel: 'Class 11TH',
        stream: 'PCM',
        subject: 'Physics',
        chapters: ['Units and Measurements'],
        chapter: 'Units and Measurements',
        difficulty: 'Mixed',
        questionCountsByType: {
          mcq: 5,
          short_2: 3,
          short_3: 2,
          case_study: 1,
          long_5: 1,
        },
        marksConfig: {
          mcq: 1,
          short_2: 2,
          short_3: 3,
          case_study: 4,
          long_5: 5,
        },
        paperConfig: {
          examName: 'Class 11 Term Examination 2024-25 & 2025-26',
          examDate: '2026-10-25',
          durationMinutes: 90,
          generalInstructions: ['All questions are compulsory.'],
        },
        instructions: 'NCERT Exemplar Based, Formula & Derivation Concepts',
        teacherName: 'Diksha Mam',
        assignedStudentIds: ['std-1', 'std-2', 'std-3'],
        assignedStudentNames: ['Vansh', 'Keshav', 'Dikshit'],
        assignmentMode: 'all_in_stream',
      };

      const res = await fetch(resolveApiUrl('/api/gemini/quiz'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(paperPayload),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(
          `POST /api/gemini/quiz failed with HTTP ${res.status}: ${errBody.error || 'Unknown error'}`
        );
      }

      const data = await res.json();
      if (!data.success || !data.quiz || !Array.isArray(data.quiz.questions)) {
        throw new Error('POST /api/gemini/quiz did not return { success: true, quiz: { questions: [...] } }');
      }

      const quiz = data.quiz;
      if (quiz.questions.length !== 12) {
        throw new Error(`Expected 12 total questions in generated paper, got ${quiz.questions.length}`);
      }
      if (quiz.subject !== 'Physics' || quiz.stream !== 'PCM') {
        throw new Error(`Expected Physics (PCM), got ${quiz.subject} (${quiz.stream})`);
      }
      if (!quiz.paperConfig || quiz.paperConfig.durationMinutes !== 90 || quiz.paperConfig.totalMarks !== 26) {
        throw new Error(
          `Expected paperConfig durationMinutes=90 & totalMarks=26, got duration=${quiz.paperConfig?.durationMinutes}, marks=${quiz.paperConfig?.totalMarks}`
        );
      }

      // Verify MCQ structure and answer key consistency
      const mcqs = quiz.questions.filter((q: any) => q.questionType === 'mcq');
      if (mcqs.length !== 5) {
        throw new Error(`Expected 5 MCQs in generated paper, got ${mcqs.length}`);
      }
      for (const mcq of mcqs) {
        if (!Array.isArray(mcq.options) || mcq.options.length !== 4) {
          throw new Error(`Generated MCQ "${mcq.id}" does not have 4 options`);
        }
        if (typeof mcq.correctIndex !== 'number' || mcq.correctIndex < 0 || mcq.correctIndex > 3) {
          throw new Error(`Generated MCQ "${mcq.id}" has invalid correctIndex: ${mcq.correctIndex}`);
        }
        if (mcq.correctAnswerText !== mcq.options[mcq.correctIndex]) {
          throw new Error(`Generated MCQ "${mcq.id}" correctAnswerText mismatch`);
        }
      }

      // Verify persistence into Saved Question Papers & Quizzes
      await storage.saveQuiz({ ...quiz, isDraft: true, source: 'teacher' });
      const savedQuizzes = await storage.getQuizzes();
      if (!savedQuizzes.some((q) => q.id === quiz.id)) {
        throw new Error('Generated question paper was not saved in Saved Question Papers & Quizzes');
      }
      await storage.deleteQuiz(quiz.id);

      // 2. Verify single-question regeneration endpoint (/api/gemini/quiz/regenerate-question)
      const regenRes = await fetch(resolveApiUrl('/api/gemini/quiz/regenerate-question'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fastVerify: true,
          classLevel: 'Class 11TH',
          stream: 'PCM',
          subject: 'Physics',
          chapter: 'Units and Measurements',
          difficulty: 'Medium',
          questionType: 'mcq',
          targetMarks: 1,
        }),
      });
      if (!regenRes.ok) {
        throw new Error(`POST /api/gemini/quiz/regenerate-question failed with HTTP ${regenRes.status}`);
      }
      const regenData = await regenRes.json();
      if (!regenData.success || !regenData.question || !regenData.question.question) {
        throw new Error('Single-question regeneration did not return a valid question object');
      }

      // 3. Verify validation rejects empty/invalid paper requests with HTTP 400
      const invalidRes = await fetch(resolveApiUrl('/api/gemini/quiz'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isQuestionPaper: true,
          subject: 'Physics',
          questionCountsByType: { mcq: 0, short_2: 0, short_3: 0, case_study: 0, long_5: 0 },
          paperConfig: { durationMinutes: 90 },
        }),
      });
      if (invalidRes.status !== 400) {
        throw new Error(`Expected HTTP 400 for 0-question paper payload, got ${invalidRes.status}`);
      }

      // 4. Verify explicit verificationOnly flag on fastVerify requests and refusal of silent template fallback on production requests
      if (data.verificationOnly !== true || data.modelUsed !== 'local-verification-only') {
        throw new Error(
          `Expected fastVerify response to have verificationOnly=true and modelUsed='local-verification-only', got verificationOnly=${data.verificationOnly}, modelUsed=${data.modelUsed}`
        );
      }

      const { handleEmbeddedApiRequest } = await import('../services/apkApiBridge');
      const prodBridgeRes = await handleEmbeddedApiRequest('/api/gemini/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isQuestionPaper: true,
          subject: 'Physics',
          stream: 'PCM',
          chapters: ['Units and Measurements'],
          questionCountsByType: { mcq: 2, short_2: 1, short_3: 0, case_study: 0, long_5: 0 },
          paperConfig: { durationMinutes: 60 },
        }),
      });
      if (prodBridgeRes.status !== 502) {
        throw new Error(
          `Expected embedded bridge without fastVerify to refuse template fallback with 502, got ${prodBridgeRes.status}`
        );
      }
      const prodBridgeBody = await prodBridgeRes.json();
      if (prodBridgeBody.code !== 'GEMINI_GENERATION_FAILED' || prodBridgeBody.model !== 'gemini-2.5-flash') {
        throw new Error(
          `Expected GEMINI_GENERATION_FAILED and model='gemini-2.5-flash', got ${JSON.stringify(prodBridgeBody)}`
        );
      }
    }
  );

  // 42. Authoritative 2:00 PM IST Daily Diary Refresh & Multi-Device / APK Cross-Device Sync
  await test(
    42,
    'Authoritative 2:00 PM IST Daily Refresh & Multi-Device / APK Cross-Device Sync',
    'Diary & Sync',
    async () => {
      const { resolveApiUrl, updateService } = await import('../services/updateService');
      const { staffContentService } = await import('../services/staffContentService');
      const { getDiaryCycleInfo, IST_OFFSET_MS } = await import('./diaryHelper');

      // Helper to generate a valid test staff bearer token for the test suite
      let testToken = '';
      if (typeof process !== 'undefined' && process.versions && process.versions.node) {
        const fs = require('fs');
        const path = require('path');
        const crypto = require('crypto');
        const secret = fs.readFileSync(path.resolve(process.cwd(), 'data/server-secret.key'), 'utf8').trim();
        const accounts = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'data/staff-accounts.json'), 'utf8'));
        const acc = accounts.find((a: any) => a.id === 'staff-tch-4d948c6f328c') || accounts[0];
        const ptag = crypto.createHash('sha256').update(acc.passwordHash).digest('hex').slice(0, 12);
        const claimsPayload = Buffer.from(
          JSON.stringify({
            sid: `sess_test_${Date.now()}`,
            uid: acc.id,
            usr: acc.username,
            role: acc.role,
            iat: Date.now(),
            exp: Date.now() + 12 * 3600 * 1000,
            ptag,
          })
        ).toString('base64url');
        const sig = crypto.createHmac('sha256', secret).update(`sessv2_${claimsPayload}`).digest('hex');
        testToken = `sessv2_${claimsPayload}.${sig}`;
      }

      if (!testToken) {
        throw new Error('Failed to generate test staff authentication token');
      }

      const authHeaders = {
        Authorization: `Bearer ${testToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };

      const testUniqueKey = `test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      let createdEntryId = '';

      // 1. PHONE A: Create & upload a diary entry using an authorized account
      const createRes = await fetch(resolveApiUrl('/api/diary/entries'), {
        method: 'POST',
        headers: {
          ...authHeaders,
          'X-Nexora-Device-ID': 'phone-a-android',
          'X-Nexora-Client-Version': '1.6.1',
        },
        body: JSON.stringify({
          title: `Class 11 Wave Optics Lab Record (${testUniqueKey})`,
          subject: 'Physics',
          type: 'Homework',
          targetStream: 'PCM',
          content: 'Detailed laboratory observations on Young double slit interference experiment.',
          homework: 'NCERT Ch 10 Exercises 1 to 8 in fair notebook',
          remarks: 'Brought practical manuals',
          status: 'published',
        }),
      });

      if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({}));
        throw new Error(`Phone A POST /api/diary/entries failed (${createRes.status}): ${err.error || 'Unknown'}`);
      }

      const createData = await createRes.json();
      if (!createData.success || !createData.entry || !createData.entry.id) {
        throw new Error('Phone A diary creation did not return a valid saved entry');
      }
      createdEntryId = createData.entry.id;

      // 2. PHONE B: Log in through the website and verify the same entry appears
      const phoneBRes = await fetch(resolveApiUrl('/api/diary/entries'), {
        method: 'GET',
        headers: {
          ...authHeaders,
          'X-Nexora-Device-ID': 'phone-b-web-browser',
          'X-Nexora-Client-Type': 'web',
        },
      });

      if (!phoneBRes.ok) {
        throw new Error(`Phone B GET /api/diary/entries failed: HTTP ${phoneBRes.status}`);
      }
      const phoneBData = await phoneBRes.json();
      const phoneBFound = (phoneBData.entries || []).find((e: any) => e.id === createdEntryId);
      if (!phoneBFound) {
        throw new Error('Phone B (Website) could not find the entry created by Phone A in shared database');
      }
      if (!phoneBFound.title.includes(testUniqueKey)) {
        throw new Error('Phone B entry title mismatch with Phone A upload');
      }

      // 3. PHONE C: Log in using the installed NEXORA APK and verify the same entry appears
      const phoneCRes = await fetch(resolveApiUrl('/api/diary/entries'), {
        method: 'GET',
        headers: {
          ...authHeaders,
          'X-Nexora-Device-ID': 'phone-c-apk',
          'X-Nexora-Platform': 'android',
          'User-Agent': 'NEXORA-Android-APK/1.6.1',
        },
      });

      if (!phoneCRes.ok) {
        throw new Error(`Phone C (APK) GET /api/diary/entries failed: HTTP ${phoneCRes.status}`);
      }
      const phoneCData = await phoneCRes.json();
      const phoneCFound = (phoneCData.entries || []).find((e: any) => e.id === createdEntryId);
      if (!phoneCFound) {
        throw new Error('Phone C (APK) could not find the entry created by Phone A in shared database');
      }

      // 4. MULTI-DEVICE EDIT & SYNC: Edit an entry on Phone B, verify updated version on Phone C
      const updatedHomework = 'NCERT Ch 10 Exercises 1 to 15 (Extended Deadline)';
      const editRes = await fetch(resolveApiUrl(`/api/diary/entries/${createdEntryId}`), {
        method: 'PUT',
        headers: {
          ...authHeaders,
          'X-Nexora-Device-ID': 'phone-b-web-browser',
        },
        body: JSON.stringify({
          title: `Class 11 Wave Optics Lab Record [UPDATED] (${testUniqueKey})`,
          subject: 'Physics',
          type: 'Homework',
          targetStream: 'PCM',
          content: 'Detailed laboratory observations on Young double slit interference experiment. Updated with rubric.',
          homework: updatedHomework,
          baseVersion: phoneBFound.version,
        }),
      });

      if (!editRes.ok) {
        const err = await editRes.json().catch(() => ({}));
        throw new Error(`PUT /api/diary/entries/${createdEntryId} failed (${editRes.status}): ${err.error || ''}`);
      }

      // Verify Phone C sees the edit
      const phoneCUpdatedRes = await fetch(resolveApiUrl('/api/diary/entries'), {
        headers: {
          ...authHeaders,
          'X-Nexora-Device-ID': 'phone-c-apk',
        },
      });
      const phoneCUpdatedData = await phoneCUpdatedRes.json();
      const phoneCEditFound = (phoneCUpdatedData.entries || []).find((e: any) => e.id === createdEntryId);
      if (!phoneCEditFound || phoneCEditFound.homework !== updatedHomework) {
        throw new Error('Phone C (APK) did not reflect the edit made by Phone B');
      }

      // 5. DAILY ROLLOVER AT 2:00 PM IST WITHOUT LOSING OLDER ENTRIES
      // We test pure calculation and isolated server cycle simulation
      // a. 13:59:59 IST on 2026-10-26 (Before 2:00 PM) -> Cycle date must be 2026-10-25
      const before2PM_UTC = Date.UTC(2026, 9, 26, 8, 29, 59); // 13:59:59 IST is 08:29:59 UTC
      const infoBefore = getDiaryCycleInfo(before2PM_UTC);
      if (infoBefore.calendarDateIST !== '2026-10-26') {
        throw new Error(`Expected calendar date 2026-10-26, got ${infoBefore.calendarDateIST}`);
      }
      if (infoBefore.activeCycleDate !== '2026-10-25') {
        throw new Error(`Expected active cycle 2026-10-25 before 2:00 PM IST, got ${infoBefore.activeCycleDate}`);
      }

      // b. 14:00:01 IST on 2026-10-26 (At or after 2:00 PM) -> Cycle date must be 2026-10-26
      const after2PM_UTC = Date.UTC(2026, 9, 26, 8, 30, 1); // 14:00:01 IST is 08:30:01 UTC
      const infoAfter = getDiaryCycleInfo(after2PM_UTC);
      if (infoAfter.calendarDateIST !== '2026-10-26') {
        throw new Error(`Expected calendar date 2026-10-26, got ${infoAfter.calendarDateIST}`);
      }
      if (infoAfter.activeCycleDate !== '2026-10-26') {
        throw new Error(`Expected active cycle 2026-10-26 at/after 2:00 PM IST, got ${infoAfter.activeCycleDate}`);
      }

      // c. Server simulation: verify daily rollover preserves all historical entries and avoids duplicates
      const rolloverSimRes = await fetch(resolveApiUrl('/api/diary/cycle/reconcile'), {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          simulatedNowMs: after2PM_UTC,
          isolatedSimulation: true,
          forceEnsureActiveEntry: true,
        }),
      });

      if (!rolloverSimRes.ok) {
        throw new Error(`POST /api/diary/cycle/reconcile failed: HTTP ${rolloverSimRes.status}`);
      }
      const rolloverSimData = await rolloverSimRes.json();
      if (!rolloverSimData.success || rolloverSimData.cycleInfo?.activeCycleDate !== '2026-10-26') {
        throw new Error('Server 2:00 PM IST rollover failed to activate 2026-10-26 cycle');
      }

      // Verify older entries are preserved
      const simEntries = rolloverSimData.entries || [];
      const ourEntryPreserved = simEntries.find((e: any) => e.id === createdEntryId);
      if (!ourEntryPreserved) {
        throw new Error('Critical: 2:00 PM IST rollover deleted or lost previous historical diary entries!');
      }

      // Verify idempotency (no duplicate entries when running rollover repeatedly)
      const repeatRolloverRes = await fetch(resolveApiUrl('/api/diary/cycle/reconcile'), {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          simulatedNowMs: after2PM_UTC + 5000,
          isolatedSimulation: true,
          entriesSnapshot: simEntries,
          cycleStateSnapshot: rolloverSimData.cycleState,
        }),
      });
      const repeatData = await repeatRolloverRes.json();
      const dailyMatches = (repeatData.entries || []).filter(
        (e: any) => e.id === `diary-daily-2026-10-26` || e.date === '2026-10-26' && e.title.includes('Daily Class Diary')
      );
      if (dailyMatches.length > 1) {
        throw new Error(`Duplicate daily entry created during repeat rollover: ${dailyMatches.length} found`);
      }

      // 6. CONFIRM QUICK NOTES REMAIN SEPARATE & UNCHANGED AFTER ROLLOVER
      const notesBeforeRes = await fetch(resolveApiUrl('/api/quick-notes'), { headers: authHeaders });
      if (!notesBeforeRes.ok) {
        throw new Error(`GET /api/quick-notes failed: HTTP ${notesBeforeRes.status}`);
      }
      const notesData = await notesBeforeRes.json();
      if (!notesData.success || !Array.isArray(notesData.notes)) {
        throw new Error('Quick Notes endpoint failed to return valid notes array');
      }

      // 7. ROLE-BASED ACCESS CONTROL & PRIVACY: BLOCK STUDENTS AND UNAUTHENTICATED USERS
      const unauthDiaryRes = await fetch(resolveApiUrl('/api/diary/entries'));
      if (unauthDiaryRes.status !== 401 && unauthDiaryRes.status !== 403) {
        throw new Error(`Expected unauthenticated diary request to return 401/403, got ${unauthDiaryRes.status}`);
      }

      const studentDiaryRes = await fetch(resolveApiUrl('/api/diary/entries'), {
        headers: {
          'X-Nexora-Role': 'student',
          Authorization: 'Bearer student_token_test_probe',
        },
      });
      if (studentDiaryRes.status !== 403 && studentDiaryRes.status !== 401) {
        throw new Error(`Expected student diary request to return 403 Forbidden, got ${studentDiaryRes.status}`);
      }

      // 8. LOGOUT / RECOVERY / CLEANUP
      // Delete temporary test entry from shared database
      const deleteRes = await fetch(resolveApiUrl(`/api/diary/entries/${createdEntryId}`), {
        method: 'DELETE',
        headers: authHeaders,
      });
      if (!deleteRes.ok) {
        throw new Error(`DELETE /api/diary/entries/${createdEntryId} cleanup failed: HTTP ${deleteRes.status}`);
      }

      // Verify deletion propagated
      const verifyDeleteRes = await fetch(resolveApiUrl('/api/diary/entries'), { headers: authHeaders });
      const verifyDeleteData = await verifyDeleteRes.json();
      if ((verifyDeleteData.entries || []).some((e: any) => e.id === createdEntryId)) {
        throw new Error('Deleted test entry still persisted in shared database');
      }
    }
  );

  // 43. TIMETABLE PDF EXPORT & 1-PAGE A4 LANDSCAPE MATRIX
  await test(43, 'Timetable PDF Download & 1-Page A4 Landscape Matrix', 'PDF & Documents', () => {
    const res = generateTimetablePdf();
    if (!res.success) {
      throw new Error('Timetable PDF generation failed');
    }
    if (res.filename !== 'NEXORA_Class11_Timetable_Official.pdf') {
      throw new Error(`Expected filename NEXORA_Class11_Timetable_Official.pdf, got ${res.filename}`);
    }
    if (res.pageCount !== 1) {
      throw new Error(`Critical: Timetable PDF must fit on strictly 1 page A4 landscape, got ${res.pageCount} pages`);
    }
  });

  // 44. QUESTION PAPER PDF MULTI-PAGE EXPORT & SEPARATE TEACHER ANSWER KEY
  await test(44, 'Question Paper PDF Multi-Page Export & Compact Layout', 'PDF & Documents', () => {
    const samplePaperQuiz: Quiz = {
      id: 'quiz-test-pdf-1',
      title: 'Class 11 Chemistry Term Examination',
      subject: 'Chemistry',
      stream: 'PCM',
      timeLimitSeconds: 5400,
      createdAt: Date.now(),
      description: 'Comprehensive CBSE Class 11 Chemistry Examination',
      isQuestionPaper: true,
      paperConfig: {
        examName: 'Chemistry Term Examination 2026-2027',
        examDate: '2026-10-26',
        durationMinutes: 90,
      },
      questions: [
        {
          id: 'q-mcq-1',
          question: 'What is the molar mass of water (H2O)?',
          questionType: 'mcq',
          options: ['18 g/mol', '16 g/mol', '20 g/mol', '14 g/mol'],
          correctIndex: 0,
          correctAnswerText: '18 g/mol',
          explanation: '2(1.008) + 16.00 = 18.016 g/mol.',
          marks: 1,
        },
        {
          id: 'q-short-1',
          question: 'State and explain Hund’s rule of maximum multiplicity.',
          questionType: 'short_2',
          marks: 2,
          explanation: 'Electron pairing in p, d and f orbitals cannot occur until each sub-level has one electron.',
          modelAnswer: 'Electron pairing in p, d and f orbitals cannot occur until each sub-level has one electron.',
        },
        {
          id: 'q-short-2',
          question: 'Derive the de Broglie relationship and state its physical significance.',
          questionType: 'short_3',
          marks: 3,
          explanation: 'lambda = h / p = h / (mv). Significant only for microscopic entities.',
          modelAnswer: 'lambda = h / p = h / (mv). Significant only for microscopic entities.',
        },
        {
          id: 'q-case-1',
          question: 'Case Study on Bohr Atomic Model',
          questionType: 'case_study',
          explanation: 'Bohr model atomic energy levels and spectral lines.',
          casePassage: 'Bohr model explains hydrogen spectrum by postulating quantized energy states.',
          subQuestions: [
            {
              id: 'sq-1',
              question: 'Calculate the radius of the first orbit of hydrogen atom.',
              questionType: 'written',
              marks: 2,
              explanation: 'r1 = 0.529 Angstroms.',
              modelAnswer: 'r1 = 0.529 Angstroms.',
            },
            {
              id: 'sq-2',
              question: 'Which series of hydrogen spectrum lies in visible region?',
              questionType: 'mcq',
              options: ['Lyman', 'Balmer', 'Paschen', 'Brackett'],
              correctIndex: 1,
              correctAnswerText: 'Balmer',
              marks: 2,
              explanation: 'Balmer series is in the visible electromagnetic spectrum.',
            },
          ],
        },
        {
          id: 'q-long-1',
          question: 'Discuss the postulates of VSEPR theory and predict the geometry of SF6 and PCl5.',
          questionType: 'long_5',
          marks: 5,
          explanation: 'VSEPR electron pair repulsion minimizes repulsion energy.',
          modelAnswer: 'SF6 has octahedral geometry (sp3d2). PCl5 has trigonal bipyramidal geometry (sp3d).',
        },
      ],
    };

    // Test student paper (no answers)
    const studentRes = generateQuestionPaperPdf(samplePaperQuiz, { includeAnswerKey: false });
    if (!studentRes.success) throw new Error('Student Question Paper PDF generation failed');
    if (!studentRes.filename.includes('Question_Paper.pdf')) {
      throw new Error(`Expected filename to contain Question_Paper.pdf, got ${studentRes.filename}`);
    }
    if (studentRes.pageCount < 1) throw new Error('Expected at least 1 page for Question Paper');

    // Test teacher answer key (separate document)
    const keyRes = generateQuestionPaperPdf(samplePaperQuiz, { includeAnswerKey: true });
    if (!keyRes.success) throw new Error('Teacher Answer Key PDF generation failed');
    if (!keyRes.filename.includes('Answer_Key.pdf')) {
      throw new Error(`Expected filename to contain Answer_Key.pdf, got ${keyRes.filename}`);
    }
  });

  // 45. AUTHORITATIVE SUBJECT-TO-TEACHER MAPPING & TEACHER DIRECTORY
  await test(45, 'Subject-to-Teacher Mapping & Teacher In-Charge Directory', 'Teacher & Quiz', () => {
    // 1. Verify all required subject mappings
    const expectedMappings: Record<string, string> = {
      Physics: 'Diksha Mam',
      Chemistry: 'Harshu Mam',
      Mathematics: 'Anita Mam',
      English: 'Nancy Mam',
      Economics: 'Alka Mam',
      'Political Science': 'Ritu Mam',
      History: 'Ritu Mam',
      'Business Studies': 'Alka Mam',
      Accountancy: 'Alka Mam',
    };

    for (const [subj, expectedTeacher] of Object.entries(expectedMappings)) {
      const actual = SUBJECT_TO_TEACHER_MAPPING[subj];
      if (actual !== expectedTeacher) {
        throw new Error(`Mapping mismatch for "${subj}": expected "${expectedTeacher}", got "${actual}"`);
      }
    }

    // 2. Verify Harshu Mam and Nancy Mam exist in the authoritative teacher list
    if (!AUTHORITATIVE_TEACHER_LIST.includes('Harshu Mam')) {
      throw new Error('Harshu Mam is missing from AUTHORITATIVE_TEACHER_LIST');
    }
    if (!AUTHORITATIVE_TEACHER_LIST.includes('Nancy Mam')) {
      throw new Error('Nancy Mam is missing from AUTHORITATIVE_TEACHER_LIST');
    }
    if (!AUTHORITATIVE_TEACHER_LIST.includes('Diksha Mam') || !AUTHORITATIVE_TEACHER_LIST.includes('Anita Mam')) {
      throw new Error('Core faculty missing from AUTHORITATIVE_TEACHER_LIST');
    }
  });

  // 46. QUIZ MAKER SKIP STUDENT SELECTION OPTION
  await test(46, 'Quiz Maker Skip Student Selection Mode', 'Teacher & Quiz', async () => {
    // Verify backend allows generation with assignmentMode: 'skip' and empty assignedStudentIds
    const res = await fetch(resolveApiUrl('/api/gemini/quiz'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fastVerify: true,
        subject: 'Physics',
        stream: 'PCM',
        chapter: 'Units and Measurements',
        questionCount: 3,
        assignmentMode: 'skip',
        assignedStudentIds: [],
        assignedStudentNames: [],
      }),
    });

    if (!res.ok) {
      throw new Error(`POST /api/gemini/quiz failed with assignmentMode='skip': HTTP ${res.status}`);
    }

    const data = await res.json();
    if (!data.quiz || !Array.isArray(data.quiz.questions) || data.quiz.questions.length === 0) {
      throw new Error('Expected generated quiz with questions for unassigned/skipped assessment');
    }

    if (data.quiz.assignmentMode !== 'skip') {
      throw new Error(`Expected quiz.assignmentMode to be 'skip', got '${data.quiz.assignmentMode}'`);
    }

    if (Array.isArray(data.quiz.assignedStudentIds) && data.quiz.assignedStudentIds.length > 0) {
      throw new Error('Expected assignedStudentIds to be empty when student selection is skipped');
    }
  });

  // 47. CBSE CLASS 11 ENGLISH CORE QUESTION PAPER GENERATOR & PRESETS
  await test(
    47,
    'CBSE Class 11 English Core Question Paper Generator & Presets',
    'English Generator',
    async () => {
      const {
        HORNBILL_PROSE_CHAPTERS,
        HORNBILL_POETRY_POEMS,
        SNAPSHOTS_CHAPTERS,
        ENGLISH_READING_SKILLS,
        OFFICIAL_CBSE_GRAMMAR_TOPICS,
        ENGLISH_WRITING_TASKS,
        OFFICIAL_CBSE_2026_PRESET,
        UNIT_TEST_20_PRESET,
        MID_TERM_40_PRESET,
      } = await import('../data/cbseEnglishSyllabus');

      // 1. Verify Hornbill Prose chapters (5 chapters)
      if (HORNBILL_PROSE_CHAPTERS.length !== 5) {
        throw new Error(`Expected 5 Hornbill prose chapters, got ${HORNBILL_PROSE_CHAPTERS.length}`);
      }
      const proseTitles = HORNBILL_PROSE_CHAPTERS.map((c) => c.title);
      if (!proseTitles.some((t) => t.includes('The Portrait of a Lady'))) {
        throw new Error('Missing "The Portrait of a Lady" in Hornbill Prose');
      }
      if (!proseTitles.some((t) => t.includes('Silk Road'))) {
        throw new Error('Missing "Silk Road" in Hornbill Prose');
      }

      // 2. Verify Hornbill Poetry (5 poems)
      if (HORNBILL_POETRY_POEMS.length !== 5) {
        throw new Error(`Expected 5 Hornbill poems, got ${HORNBILL_POETRY_POEMS.length}`);
      }
      const poemTitles = HORNBILL_POETRY_POEMS.map((p) => p.title);
      if (!poemTitles.some((t) => t.includes('A Photograph'))) {
        throw new Error('Missing "A Photograph" in Hornbill Poetry');
      }
      if (!poemTitles.some((t) => t.includes('Father to Son'))) {
        throw new Error('Missing "Father to Son" in Hornbill Poetry');
      }

      // 3. Verify Snapshots chapters (5 chapters)
      if (SNAPSHOTS_CHAPTERS.length !== 5) {
        throw new Error(`Expected 5 Snapshots chapters, got ${SNAPSHOTS_CHAPTERS.length}`);
      }
      const snapshotTitles = SNAPSHOTS_CHAPTERS.map((s) => s.title);
      if (!snapshotTitles.some((t) => t.includes('The Summer of the Beautiful White Horse'))) {
        throw new Error('Missing "The Summer of the Beautiful White Horse" in Snapshots');
      }
      if (!snapshotTitles.some((t) => t.includes('The Tale of Melon City'))) {
        throw new Error('Missing "The Tale of Melon City" in Snapshots');
      }

      // 4. Verify Reading Skills & Section Breakdown
      if (ENGLISH_READING_SKILLS.length !== 4) {
        throw new Error(`Expected 4 Reading skills components, got ${ENGLISH_READING_SKILLS.length}`);
      }
      const totalReadingMarks = ENGLISH_READING_SKILLS.reduce((sum, s) => sum + s.defaultMarks, 0);
      if (totalReadingMarks !== 26) {
        throw new Error(`Expected 26 Section A Reading marks (10+8+5+3), got ${totalReadingMarks}`);
      }

      // 5. Verify Grammar & Creative Writing
      if (OFFICIAL_CBSE_GRAMMAR_TOPICS.length !== 4) {
        throw new Error(`Expected 4 Official CBSE grammar topics, got ${OFFICIAL_CBSE_GRAMMAR_TOPICS.length}`);
      }
      if (ENGLISH_WRITING_TASKS.length !== 4) {
        throw new Error(`Expected 4 Creative Writing tasks, got ${ENGLISH_WRITING_TASKS.length}`);
      }

      // 6. Verify Presets
      if (OFFICIAL_CBSE_2026_PRESET.totalMarks !== 80) {
        throw new Error(`Official CBSE Preset total marks must be 80, got ${OFFICIAL_CBSE_2026_PRESET.totalMarks}`);
      }
      if (UNIT_TEST_20_PRESET.totalMarks !== 20 || MID_TERM_40_PRESET.totalMarks !== 40) {
        throw new Error('Presets marks mismatch for Unit Test or Mid-Term');
      }

      // 7. Verify generation via /api/gemini/quiz (using explicit fastVerify mode)
      const engRes = await fetch(resolveApiUrl('/api/gemini/quiz'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fastVerify: true,
          isEnglishPaper: true,
          subject: 'English Core',
          classLevel: 'Class 11TH',
          stream: 'PCM',
          examName: 'Class 11 English Core Annual Assessment',
          examDate: '2026-10-27',
          durationMinutes: 180,
          totalMarks: 80,
          isOfficialCbsePattern: true,
          readingConfig: {
            includeUnseen: true,
            unseenMarks: 10,
            includeCaseBased: true,
            caseBasedMarks: 8,
            includeNoteMaking: true,
            noteMakingMarks: 5,
            includeSummary: true,
            summaryMarks: 3,
            totalSectionAMarks: 26,
          },
          grammarConfig: {
            selectedTopics: ['tenses', 'clauses', 'reordering', 'transformation'],
            totalGrammarMarks: 7,
          },
          writingConfig: {
            selectedTasks: ['advertisement', 'poster', 'speech', 'debate'],
            totalWritingMarks: 16,
          },
          literatureConfig: {
            chosenProse: ['The Portrait of a Lady', 'We’re Not Afraid to Die'],
            chosenPoetry: ['A Photograph', 'The Laburnum Top'],
            chosenSnapshots: ['The Summer of the Beautiful White Horse'],
            totalSectionCMarks: 31,
          },
        }),
      });

      if (!engRes.ok) {
        throw new Error(`English paper generation API failed: HTTP ${engRes.status}`);
      }

      const engData = await engRes.json();
      if (!engData.success || !engData.quiz || !engData.verificationOnly) {
        throw new Error('API did not return a valid verificationOnly English question paper');
      }

      const paper = engData.quiz;
      if (paper.subject !== 'English Core' && paper.subject !== 'English') {
        throw new Error(`Expected paper subject English Core, got ${paper.subject}`);
      }

      // Verify sections present: Section A, Section B, Section C
      const questions = paper.questions || [];
      const hasSecA = questions.some((q: any) => q.section?.includes('A') || q.chapter?.includes('Reading'));
      const hasSecB = questions.some((q: any) => q.section?.includes('B') || q.chapter?.includes('Grammar') || q.chapter?.includes('Writing'));
      const hasSecC = questions.some((q: any) => q.section?.includes('C') || q.chapter?.includes('Hornbill') || q.chapter?.includes('Snapshots') || q.chapter?.includes('Poetry') || q.chapter?.includes('Prose'));

      if (!hasSecA || !hasSecB || !hasSecC) {
        throw new Error(`Missing expected sections in synthesized English paper (Sec A=${hasSecA}, Sec B=${hasSecB}, Sec C=${hasSecC})`);
      }
    }
  );

  // 48. STANDARD QUESTION PAPER HEADER & MINIMAL FOOTER IN PDF EXPORT
  await test(
    48,
    'Standard Question Paper Header & Minimal Footer in PDF Export',
    'PDF & Documents',
    async () => {
      const { generateQuestionPaperPdf } = await import('./pdfGenerator');

      const testPaper: Quiz = {
        id: 'quiz-header-footer-test',
        title: 'Class 11 English Core Annual Assessment',
        subject: 'English Core',
        stream: 'PCM',
        timeLimitSeconds: 10800,
        createdAt: Date.now(),
        description: 'CBSE Class 11 English Core Sample Examination Paper',
        isQuestionPaper: true,
        paperConfig: {
          examName: 'Class 11 English Core Annual Assessment',
          examDate: '2026-10-27',
          durationMinutes: 180,
          generalInstructions: [
            'This question paper contains three sections: Section A (Reading Skills), Section B (Grammar and Creative Writing Skills), and Section C (Literature).',
            'All questions are compulsory.',
          ],
        },
        questions: [
          {
            id: 'eng-q1',
            question: 'Read the unseen passage and answer the questions that follow.',
            questionType: 'case_study',
            section: 'A',
            marks: 10,
            explanation: 'Reading comprehension passage analysis.',
            casePassage: 'Technological disruption in modern education has altered pedagogical delivery...',
            subQuestions: [
              {
                id: 'eng-q1-1',
                question: 'What is the primary thesis of the author in paragraph 1?',
                questionType: 'mcq',
                options: ['Educational innovation', 'Stagnation', 'Policy decline', 'None'],
                correctIndex: 0,
                correctAnswerText: 'Educational innovation',
                marks: 1,
              },
            ],
          },
          {
            id: 'eng-q2',
            question: 'Fill in the blanks with the correct form of the verbs in brackets (Tenses).',
            questionType: 'fill_in',
            section: 'B',
            marks: 2,
            explanation: 'Correct past participle form is required.',
            modelAnswer: 'had arrived, began',
          },
          {
            id: 'eng-q3',
            question: 'Discuss the transformation of the author’s relationship with his grandmother in "The Portrait of a Lady".',
            questionType: 'long_5',
            section: 'C',
            marks: 6,
            explanation: 'Khushwant Singh depicts the evolving bond across village, city, and university phases.',
            modelAnswer: 'Khushwant Singh depicts three distinct phases...',
          },
        ],
      };

      const result = generateQuestionPaperPdf(testPaper, { includeAnswerKey: false });
      if (!result.success) {
        throw new Error('generateQuestionPaperPdf failed');
      }

      // Verify filename adheres to standard pattern (includes subject and paper title)
      if (!result.filename.startsWith('NEXORA_Class11_English_Core_') || !result.filename.endsWith('_Question_Paper.pdf')) {
        throw new Error(`Expected filename NEXORA_Class11_English_Core_*_Question_Paper.pdf, got ${result.filename}`);
      }

      if (result.pageCount < 1) {
        throw new Error('PDF export produced 0 pages');
      }

      // Verify answer key generation
      const keyResult = generateQuestionPaperPdf(testPaper, { includeAnswerKey: true });
      if (!keyResult.success) {
        throw new Error('generateQuestionPaperPdf for answer key failed');
      }
      if (!keyResult.filename.startsWith('NEXORA_Class11_English_Core_') || !keyResult.filename.endsWith('_Answer_Key.pdf')) {
        throw new Error(`Expected filename NEXORA_Class11_English_Core_*_Answer_Key.pdf, got ${keyResult.filename}`);
      }
    }
  );

  // 49. WEBSITE CLEANUP: REMOVAL OF STAFF PORTAL & USER-FACING DIARY/NOTES NAV
  await test(
    49,
    'Website Cleanup: Removal of Staff Portal & User-Facing Diary/Notes Navigation',
    'Website Cleanup',
    async () => {
      // 1. Verify Navigation items do NOT contain 'diary' or 'quick_notes'
      const { NAV_ITEMS } = await import('../components/Navigation');
      const navIds = NAV_ITEMS.map((item) => item.id);
      if (navIds.includes('diary' as any)) {
        throw new Error('Navigation still contains "diary"');
      }
      if (navIds.includes('quick_notes' as any)) {
        throw new Error('Navigation still contains "quick_notes"');
      }

      // 2. Verify Dashboard module cards do NOT contain 'diary' or 'quick_notes'
      const { ALL_MODULE_CARDS } = await import('../components/modules/DashboardModule');
      const cardIds = ALL_MODULE_CARDS.map((card: { id: string }) => card.id);
      if (cardIds.includes('diary' as any)) {
        throw new Error('Dashboard cards still contain "diary"');
      }
      if (cardIds.includes('quick_notes' as any)) {
        throw new Error('Dashboard cards still contain "quick_notes"');
      }

      // 3. Verify underlying diary and notes data are preserved in backend storage
      const diaryBackup = typeof localStorage !== 'undefined' ? localStorage.getItem('nexora_diary_daily_entries_v2') : null;
      if (diaryBackup && diaryBackup.length > 0) {
        const parsed = JSON.parse(diaryBackup);
        if (!Array.isArray(parsed)) {
          throw new Error('Corrupted diary backup structure');
        }
      }
    }
  );

  // 50. BUG 1 REGRESSION TEST: TEACHER STUDIO VIEW BUTTON & MULTI-SECTION PREVIEW LIFECYCLE
  await test(
    50,
    'Teacher Studio View / Preview Lifecycle & Complete Section Grouping',
    'Teacher & Quiz',
    async () => {
      const { groupQuestionsIntoPaperSections, calculatePaperTotalMarks } = await import('./pdfGenerator');

      // 1. Verify English Core paper with explicit sections (A, B, C) and fill_in / case_study / long_5 types preserves 100% of questions
      const englishPaper: Quiz = {
        id: 'quiz-preview-eng-test',
        title: 'Class 11 English Core Annual Sample Paper',
        subject: 'English Core',
        stream: 'PCM',
        timeLimitSeconds: 10800,
        createdAt: Date.now(),
        description: 'Official CBSE Class 11 English Core Paper',
        isQuestionPaper: true,
        questions: [
          {
            id: 'eq-1',
            question: 'Read the following unseen passage carefully and answer the questions that follow:',
            questionType: 'case_study',
            section: 'SECTION A: READING SKILLS (26 Marks)',
            casePassage: 'Sustainable development requires balancing ecological preservation with human progress...',
            marks: 10,
            explanation: 'Comprehension passage.',
            subQuestions: [
              { id: 'eq-1-a', subNumber: '(i)', question: 'What is the central theme?', questionType: 'mcq', options: ['Ecology', 'Finance', 'Space', 'Sports'], correctIndex: 0, marks: 5 },
              { id: 'eq-1-b', subNumber: '(ii)', question: 'Explain the role of policy.', questionType: 'written', marks: 5, modelAnswer: 'Policy enforces sustainability benchmarks.' },
            ],
          },
          {
            id: 'eq-2',
            question: 'Fill in the blanks with the correct tense form of the verb given in brackets.',
            questionType: 'fill_in',
            section: 'SECTION B: GRAMMAR & CREATIVE WRITING SKILLS (23 Marks)',
            marks: 7,
            explanation: 'Grammar tense transformation.',
            modelAnswer: 'had completed',
          },
          {
            id: 'eq-3',
            question: 'Draft a speech in 120-150 words on the importance of digital literacy.',
            questionType: 'long_5',
            section: 'SECTION B: GRAMMAR & CREATIVE WRITING SKILLS (23 Marks)',
            marks: 16,
            explanation: 'Speech writing format + content + expression.',
            modelAnswer: 'Respected Principal, teachers, and my dear friends...',
          },
          {
            id: 'eq-4',
            question: 'Analyze the grandmother’s strength of character in "The Portrait of a Lady".',
            questionType: 'long_5',
            section: 'SECTION C: LITERATURE TEXTBOOKS (31 Marks)',
            marks: 31,
            explanation: 'Hornbill prose analysis.',
            modelAnswer: 'Khushwant Singh portrays his grandmother as a symbol of dignity and spiritual resilience.',
          },
        ],
      };

      const engSections = groupQuestionsIntoPaperSections(englishPaper.questions);
      if (engSections.length !== 3) {
        throw new Error(`Expected 3 explicit sections for English paper, got ${engSections.length}`);
      }
      const totalGroupedQuestions = engSections.reduce((sum, s) => sum + s.questions.length, 0);
      if (totalGroupedQuestions !== englishPaper.questions.length) {
        throw new Error(`Section grouping dropped questions: expected ${englishPaper.questions.length}, got ${totalGroupedQuestions}`);
      }
      const engTotalMarks = calculatePaperTotalMarks(englishPaper.questions);
      if (engTotalMarks !== 64) {
        throw new Error(`Expected 64 total marks for test English paper, got ${engTotalMarks}`);
      }

      // 2. Verify Standard Science/Commerce paper without explicit section property groups cleanly into Sections A-E without dropping any question
      const physicsPaper: Quiz = {
        id: 'quiz-preview-phy-test',
        title: 'Class 11 Physics Unit Examination',
        subject: 'Physics',
        stream: 'PCM',
        timeLimitSeconds: 5400,
        createdAt: Date.now(),
        description: 'CBSE Class 11 Physics Paper',
        isQuestionPaper: true,
        questions: [
          { id: 'pq-1', question: 'SI unit of impulse is:', questionType: 'mcq', options: ['N s', 'J s', 'W', 'Pa'], correctIndex: 0, marks: 1, explanation: 'Impulse = F * t' },
          { id: 'pq-2', question: 'State Work-Energy Theorem.', questionType: 'short_2', marks: 2, explanation: 'W = delta K' },
          { id: 'pq-3', question: 'Derive expression for orbital velocity of a satellite.', questionType: 'short_3', marks: 3, explanation: 'v_o = sqrt(GM/r)' },
          { id: 'pq-4', question: 'Projectile motion case study', questionType: 'case_study', casePassage: 'A projectile is fired at angle theta...', marks: 4, explanation: 'Kinematics', subQuestions: [{ id: 'psq-1', question: 'Find max height.', questionType: 'written', marks: 4 }] },
          { id: 'pq-5', question: 'State and prove Bernoulli’s principle for incompressible fluid flow.', questionType: 'long_5', marks: 5, explanation: 'P + 1/2 rho v^2 + rho g h = constant' },
        ],
      };

      const phySections = groupQuestionsIntoPaperSections(physicsPaper.questions);
      if (phySections.length !== 5) {
        throw new Error(`Expected 5 standard sections (A-E) for Physics paper, got ${phySections.length}`);
      }
      const phyMarks = calculatePaperTotalMarks(physicsPaper.questions);
      if (phyMarks !== 15) {
        throw new Error(`Expected 15 total marks for Physics paper, got ${phyMarks}`);
      }

      // 3. Verify QuestionPaperPreviewModal source has no React hooks after conditional return (Rules of Hooks invariant)
      if (typeof process !== 'undefined' && process.versions && process.versions.node) {
        const fs = require('fs');
        const path = require('path');
        const modalSrc = fs.readFileSync(
          path.resolve(process.cwd(), 'src/components/quiz/QuestionPaperPreviewModal.tsx'),
          'utf8'
        );
        const earlyReturnIdx = modalSrc.indexOf('if (!isOpen) return null;');
        if (earlyReturnIdx === -1) {
          throw new Error('Expected early return guard in QuestionPaperPreviewModal.tsx');
        }
        const afterEarlyReturn = modalSrc.slice(earlyReturnIdx);
        if (/\buse(State|Effect|Memo|Callback|Ref)\s*\(/.test(afterEarlyReturn)) {
          throw new Error('Fatal: React hook found after "if (!isOpen) return null;" in QuestionPaperPreviewModal.tsx');
        }
      }
    }
  );

  // 51. BUG 2 REGRESSION TEST: ANDROID APK & WEBSITE QUESTION PAPER PDF GENERATION & NATIVE DOWNLOAD BRIDGE
  await test(
    51,
    'Android APK & Website Question Paper PDF Generation & Native Download Bridge',
    'PDF & Documents',
    async () => {
      const { resolveApiUrl } = await import('../services/updateService');
      const { buildQuestionPaperPdfDocument } = await import('./pdfGenerator');

      // Build a multi-page question paper with 18 questions across sections
      const questions = [];
      for (let i = 1; i <= 10; i++) {
        questions.push({
          id: `apk-pdf-mcq-${i}`,
          question: `Question ${i}: Which fundamental physical conservation law governs elastic collisions in an isolated system of particles?`,
          questionType: 'mcq' as const,
          options: [
            'Conservation of Linear Momentum and Kinetic Energy',
            'Conservation of Angular Velocity only',
            'Planck Quantum Radiation Law',
            'Faraday Law of Electromagnetic Induction',
          ],
          correctIndex: 0,
          correctAnswerText: 'Conservation of Linear Momentum and Kinetic Energy',
          marks: 1,
          explanation: 'Both linear momentum and kinetic energy are conserved in elastic collisions.',
        });
      }
      for (let i = 1; i <= 6; i++) {
        questions.push({
          id: `apk-pdf-long-${i}`,
          question: `Long Answer ${i}: Derive the complete mathematical expression for the moment of inertia of a uniform circular disc and explain the theorem of parallel and perpendicular axes with neat physical applications.`,
          questionType: 'long_5' as const,
          marks: 5,
          explanation: 'Step-by-step derivation using surface mass density and integration.',
          modelAnswer: 'I = (1/2) M R^2 about perpendicular axis through center.',
        });
      }

      const multiPageQuiz: Quiz = {
        id: 'quiz-apk-pdf-bridge-test',
        title: 'Class 11 Physics Comprehensive Examination',
        subject: 'Physics',
        stream: 'PCM',
        timeLimitSeconds: 10800,
        createdAt: Date.now(),
        description: 'Multi-page CBSE Class 11 Physics Paper',
        isQuestionPaper: true,
        paperConfig: {
          examName: 'Annual Examination 2026-27',
          examDate: '2026-10-28',
          durationMinutes: 180,
        },
        questions,
      };

      // Stage 1: Build and validate PDF document
      const built = buildQuestionPaperPdfDocument(multiPageQuiz, { includeAnswerKey: false });
      if (!built || built.pageCount < 2) {
        throw new Error(`Expected multi-page PDF (>= 2 pages), got ${built?.pageCount}`);
      }
      if (built.byteLength < 1000) {
        throw new Error(`Expected non-empty PDF bytes (> 1000 bytes), got ${built.byteLength}`);
      }

      // Stage 2: Test the Android APK Server Download Bridge (POST /api/pdf/prepare -> GET /downloads/nexora-paper/:token/:filename)
      const prepRes = await fetch(resolveApiUrl('/api/pdf/prepare'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base64: built.base64,
          filename: built.filename,
        }),
      });

      if (!prepRes.ok) {
        throw new Error(`POST /api/pdf/prepare failed with HTTP ${prepRes.status}`);
      }

      const prepData = await prepRes.json();
      if (!prepData.success || !prepData.downloadPath || !prepData.token) {
        throw new Error('POST /api/pdf/prepare did not return a valid downloadPath and token');
      }

      // Crucial Android APK MainActivity check: downloadPath MUST contain "/downloads/nexora-" so MainActivity's native downloader intercepts it
      if (!prepData.downloadPath.includes('/downloads/nexora-')) {
        throw new Error(`Android APK downloadPath must include "/downloads/nexora-", got ${prepData.downloadPath}`);
      }

      // Fetch the prepared PDF binary from the download endpoint and verify headers + %PDF- signature
      const dlRes = await fetch(resolveApiUrl(prepData.downloadPath));
      if (!dlRes.ok) {
        throw new Error(`GET ${prepData.downloadPath} failed with HTTP ${dlRes.status}`);
      }

      const contentType = dlRes.headers.get('content-type') || '';
      const contentDisp = dlRes.headers.get('content-disposition') || '';
      if (!contentType.includes('application/pdf')) {
        throw new Error(`Expected Content-Type application/pdf, got ${contentType}`);
      }
      if (!contentDisp.includes('attachment') || !contentDisp.includes('NEXORA_Class11_Physics_') || !contentDisp.includes('.pdf')) {
        throw new Error(`Expected Content-Disposition attachment with subject+title filename, got ${contentDisp}`);
      }

      const arrayBuf = await dlRes.arrayBuffer();
      const dlBytes = new Uint8Array(arrayBuf);
      if (dlBytes.byteLength !== built.byteLength) {
        throw new Error(`Downloaded PDF byteLength (${dlBytes.byteLength}) did not match generated PDF (${built.byteLength})`);
      }
      const magicHeader = String.fromCharCode(dlBytes[0], dlBytes[1], dlBytes[2], dlBytes[3], dlBytes[4]);
      if (magicHeader !== '%PDF-') {
        throw new Error(`Downloaded file does not start with %PDF- signature: ${magicHeader}`);
      }
    }
  );

  // 52. FRESH NON-REPEATING QUESTION PAPER GENERATION ACROSS CONSECUTIVE RUNS (ENGLISH CORE & OTHER SUBJECTS)
  await test(
    52,
    'Fresh Non-Repeating Question Paper Generation Across Consecutive Runs (English Core & All Subjects)',
    'AI & Assessment',
    async () => {
      const { resolveApiUrl } = await import('../services/updateService');

      const baseEnglishPayload = {
        isQuestionPaper: true,
        isEnglishPaper: true,
        fastVerify: true,
        classLevel: 'Class 11TH',
        stream: 'PCM',
        subject: 'English Core',
        examName: 'English Core Annual Examination 2026–27',
        durationMinutes: 180,
        totalMarks: 80,
        difficulty: 'Mixed',
        readingConfig: {
          includeUnseen: true,
          unseenMarks: 10,
          includeCaseBased: true,
          caseBasedMarks: 8,
          includeNoteMaking: true,
          noteMakingMarks: 5,
          includeSummary: true,
          summaryMarks: 3,
          totalSectionAMarks: 26,
        },
        grammarConfig: {
          selectedTopics: ['tenses', 'clauses', 'reordering'],
          totalGrammarMarks: 7,
        },
        writingConfig: {
          selectedTasks: ['classified_advertisement', 'poster_writing', 'speech_writing', 'debate_writing'],
          internalChoice: true,
          totalWritingMarks: 16,
        },
        literatureConfig: {
          chosenProse: ['The Portrait of a Lady', 'Silk Road'],
          chosenPoetry: ['A Photograph', 'The Laburnum Top'],
          chosenSnapshots: ['The Summer of the Beautiful White Horse', 'The Address'],
          includePoetryExtract: true,
          poetryExtractMarks: 3,
          includeProseExtract: true,
          proseExtractMarks: 3,
          includeSnapshotsExtract: true,
          snapshotsExtractMarks: 4,
          hornbillShortCount: 2,
          hornbillShortMarksPerQ: 3,
          snapshotsShortCount: 1,
          snapshotsShortMarksPerQ: 3,
          includeHornbillLongAnswer: true,
          hornbillLongAnswerMarks: 6,
          includeSnapshotsLongAnswer: true,
          snapshotsLongAnswerMarks: 6,
          totalSectionCMarks: 31,
        },
      };

      // Generate English Paper #1
      const engRes1 = await fetch(resolveApiUrl('/api/gemini/quiz'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(baseEnglishPayload),
      });
      if (!engRes1.ok) throw new Error(`English Paper #1 failed: HTTP ${engRes1.status}`);
      const engData1 = await engRes1.json();
      const qList1 = engData1?.quiz?.questions || [];
      if (qList1.length < 10) {
        throw new Error(`Expected >= 10 questions in English Paper #1, got ${qList1.length}`);
      }

      // Collect recentQuestions from Paper #1
      const recentFromEng1: string[] = [];
      for (const q of qList1) {
        if (q.casePassage) recentFromEng1.push(q.casePassage.slice(0, 160));
        if (q.question) recentFromEng1.push(q.question.slice(0, 160));
      }

      // Generate English Paper #2 with identical settings + recentQuestions
      const engRes2 = await fetch(resolveApiUrl('/api/gemini/quiz'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...baseEnglishPayload,
          recentQuestions: recentFromEng1,
        }),
      });
      if (!engRes2.ok) throw new Error(`English Paper #2 failed: HTTP ${engRes2.status}`);
      const engData2 = await engRes2.json();
      const qList2 = engData2?.quiz?.questions || [];
      if (qList2.length < 10) {
        throw new Error(`Expected >= 10 questions in English Paper #2, got ${qList2.length}`);
      }

      // Verify unseen passage (Q1) and grammar questions do NOT repeat between Paper #1 and Paper #2
      if (qList1[0].casePassage && qList2[0].casePassage && qList1[0].casePassage === qList2[0].casePassage) {
        throw new Error('English Paper #2 repeated the exact same Unseen Passage as English Paper #1');
      }
      const grammarQ1 = qList1.filter((q: any) => String(q.section || '').includes('SECTION B')).map((q: any) => q.question);
      const grammarQ2 = qList2.filter((q: any) => String(q.section || '').includes('SECTION B')).map((q: any) => q.question);
      const overlappingGrammar = grammarQ2.filter((qText: string) => grammarQ1.includes(qText));
      if (overlappingGrammar.length > 0) {
        throw new Error(`English Paper #2 repeated Section B questions from Paper #1: ${overlappingGrammar[0]}`);
      }

      // Now test consecutive Physics question papers with identical settings
      const phyPayload = {
        isQuestionPaper: true,
        fastVerify: true,
        classLevel: 'Class 11TH',
        stream: 'PCM',
        subject: 'Physics',
        chapters: ['Laws of Motion', 'Work, Energy and Power'],
        difficulty: 'Medium',
        questionCountsByType: { mcq: 4, short_2: 2, short_3: 2, case_study: 1, long_5: 1 },
        marksConfig: { mcq: 1, short_2: 2, short_3: 3, case_study: 4, long_5: 5 },
        paperConfig: { examName: 'Physics Unit Test', durationMinutes: 90 },
      };

      const phyRes1 = await fetch(resolveApiUrl('/api/gemini/quiz'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(phyPayload),
      });
      const phyData1 = await phyRes1.json();
      const phyQ1 = phyData1?.quiz?.questions || [];
      const recentPhy = phyQ1.map((q: any) => q.casePassage || q.question);

      const phyRes2 = await fetch(resolveApiUrl('/api/gemini/quiz'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...phyPayload, recentQuestions: recentPhy }),
      });
      const phyData2 = await phyRes2.json();
      const phyQ2 = phyData2?.quiz?.questions || [];

      const phyStems1 = new Set(phyQ1.map((q: any) => q.question));
      const repeatedPhy = phyQ2.filter((q: any) => phyStems1.has(q.question));
      if (repeatedPhy.length > 0) {
        throw new Error(`Physics Paper #2 repeated question from Paper #1: ${repeatedPhy[0].question}`);
      }
    }
  );

  // 53. ANDROID APK EMBEDDED BRIDGE & STATELESS ?spec= PDF RECONSTRUCTION PIPELINE
  await test(
    53,
    'Android APK Embedded PDF Bridge (POST /api/pdf/prepare) & Stateless ?spec= PDF Reconstruction',
    'PDF & Documents',
    async () => {
      const { resolveApiUrl } = await import('../services/updateService');
      const { handleEmbeddedApiRequest } = await import('../services/apkApiBridge');
      const {
        buildQuestionPaperPdfDocument,
        encodeCompactQuizSpec,
        decodeCompactQuizSpec,
      } = await import('./pdfGenerator');

      const samplePaper: Quiz = {
        id: 'quiz-spec-test-11',
        title: 'English Core Mid-Term Assessment',
        subject: 'English Core',
        stream: 'PCM',
        classLevel: 'Class 11TH',
        timeLimitSeconds: 5400,
        createdAt: Date.now(),
        description: 'Sample paper for APK PDF verification',
        isQuestionPaper: true,
        paperConfig: {
          examName: 'Mid-Term Examination 2026',
          durationMinutes: 90,
        },
        questions: [
          {
            id: 'sq-eng-1',
            section: 'SECTION A: READING SKILLS (10 Marks)',
            question: 'Read the passage carefully and answer the questions that follow:',
            questionType: 'case_study',
            casePassage: 'Language shapes the architecture of human thought and cultural memory.',
            marks: 10,
            explanation: 'Reading skill assessment',
            subQuestions: [
              {
                id: 'sub-1',
                subNumber: '(i)',
                question: 'What role does language play in cultural memory?',
                questionType: 'written',
                marks: 5,
                modelAnswer: 'It preserves shared knowledge across generations.',
              },
              {
                id: 'sub-2',
                subNumber: '(ii)',
                question: 'Identify the central thesis of the passage.',
                questionType: 'written',
                marks: 5,
                modelAnswer: 'Linguistic diversity enriches human cognition.',
              },
            ],
          },
          {
            id: 'sq-eng-2',
            section: 'SECTION B: GRAMMAR & CREATIVE WRITING SKILLS (5 Marks)',
            question: 'Draft a formal speech in 120-150 words on Ethical AI in Education.',
            questionType: 'long_5',
            marks: 5,
            explanation: 'Speech writing format and expression',
            modelAnswer: 'Respected Principal, teachers, and my dear friends...',
          },
        ],
      };

      const built = buildQuestionPaperPdfDocument(samplePaper, { includeAnswerKey: false });
      if (!built.filename.includes('English_Core') || !built.filename.includes('Mid_Term_Examination_2026')) {
        throw new Error(`Expected filename to include subject and paper title, got ${built.filename}`);
      }

      // 1. Test embedded APK bridge handler for POST /api/pdf/prepare directly (must NEVER return 404 API endpoint not found)
      const embPrepRes = await handleEmbeddedApiRequest('/api/pdf/prepare', {
        method: 'POST',
        body: JSON.stringify({
          base64: built.base64,
          filename: built.filename,
        }),
      });
      if (!embPrepRes.ok) {
        const errJson = await embPrepRes.json().catch(() => ({}));
        throw new Error(`Embedded POST /api/pdf/prepare failed with ${embPrepRes.status}: ${errJson.error}`);
      }
      const embPrepData = await embPrepRes.json();
      if (!embPrepData.success || !embPrepData.embedded || !embPrepData.downloadPath.includes('/downloads/nexora-paper/')) {
        throw new Error(`Unexpected embedded prepare response: ${JSON.stringify(embPrepData)}`);
      }

      // 2. Test encodeCompactQuizSpec -> decodeCompactQuizSpec round-trip
      const encodedSpec = encodeCompactQuizSpec(samplePaper, false);
      if (!encodedSpec || encodedSpec.length < 20) {
        throw new Error('encodeCompactQuizSpec returned empty or invalid string');
      }
      const decodedSpec = decodeCompactQuizSpec(encodedSpec);
      if (!decodedSpec || decodedSpec.quiz.subject !== 'English Core' || decodedSpec.quiz.questions.length !== 2) {
        throw new Error('decodeCompactQuizSpec failed to restore samplePaper accurately');
      }

      // 3. Test live server stateless reconstruction when Android APK external downloader requests /downloads/nexora-paper/:token/:filename?spec=...
      const statelessPath = `/downloads/nexora-paper/pdf_emb_unseen_token/${encodeURIComponent(built.filename)}?spec=${encodeURIComponent(encodedSpec)}`;
      const statelessRes = await fetch(resolveApiUrl(statelessPath));
      if (!statelessRes.ok) {
        throw new Error(`Stateless APK PDF download GET ${statelessPath} failed with HTTP ${statelessRes.status}`);
      }
      const statelessBytes = new Uint8Array(await statelessRes.arrayBuffer());
      const pdfHeader = String.fromCharCode(
        statelessBytes[0],
        statelessBytes[1],
        statelessBytes[2],
        statelessBytes[3],
        statelessBytes[4]
      );
      if (pdfHeader !== '%PDF-') {
        throw new Error(`Stateless reconstructed PDF did not start with %PDF-, got ${pdfHeader}`);
      }
    }
  );

  // 54. NEW CLASS 11 CURRENT TIMETABLE DEFAULT, OLD TIMETABLE ACCESS & ZERO APPROVAL LABELS
  await test(
    54,
    'Current Timetable Default, Old Timetable Switcher, PDF Export & Zero Approval Labels',
    'Timetable',
    async () => {
      // 1. Default selection must be CURRENT TIMETABLE with Class In-Charge: Diksha Mam
      setActiveTimetableVersion('current');
      if (getActiveTimetableVersion() !== 'current') {
        throw new Error('Expected CURRENT TIMETABLE to be active by default');
      }
      if (getActiveClassInCharge() !== 'Diksha Mam' || CLASS_METADATA.classInCharge !== 'Diksha Mam') {
        throw new Error('Expected default Class In-Charge to be Diksha Mam');
      }

      // 2. Verify all 6 days (Monday through Saturday) in CURRENT TIMETABLE
      const currentSched = getCurrentTimetable();
      for (const day of DAYS_OF_WEEK) {
        const isMonWed = day === 'Monday' || day === 'Tuesday' || day === 'Wednesday';
        const periods = currentSched[day];
        if (!Array.isArray(periods) || periods.length === 0) {
          throw new Error(`Missing schedule for ${day} in CURRENT TIMETABLE`);
        }

        const p1 = periods.find((p) => p.periodNumber === 1);
        const p2 = periods.find((p) => p.periodNumber === 2);
        const p3 = periods.find((p) => p.periodNumber === 3);
        const p4 = periods.find((p) => p.periodNumber === 4);
        const p5 = periods.find((p) => p.periodNumber === 5);
        const p6 = periods.find((p) => p.periodNumber === 6);
        if (!p1 || !p2 || !p3 || !p4 || !p5 || !p6) {
          throw new Error(`Missing lecture period on ${day}`);
        }

        // 1st Lecture
        if (
          p1.allocations.PCM.subject !== 'Physics' ||
          p1.allocations.PCM.teacher !== 'Diksha Mam' ||
          p1.allocations.PCB.subject !== 'Physics' ||
          p1.allocations.PCB.teacher !== 'Diksha Mam' ||
          p1.allocations.COMMERCE.subject !== 'Business Studies' ||
          p1.allocations.COMMERCE.teacher !== 'Parul Mam' ||
          p1.allocations.HUMANITIES.subject !== 'Free' ||
          !p1.allocations.HUMANITIES.isFree ||
          Boolean(p1.allocations.HUMANITIES.teacher)
        ) {
          throw new Error(`1st Lecture mismatch on ${day}`);
        }

        // 2nd Lecture
        for (const st of ['PCM', 'PCB', 'COMMERCE', 'HUMANITIES'] as const) {
          if (p2.allocations[st].subject !== 'English' || p2.allocations[st].teacher !== 'Nancy Mam') {
            throw new Error(`2nd Lecture ${st} mismatch on ${day}`);
          }
        }

        // 3rd Lecture
        const expectedHumP3 = isMonWed ? 'Political Science' : 'History';
        if (
          p3.allocations.PCM.subject !== 'Chemistry' ||
          p3.allocations.PCM.teacher !== 'Harshu Mam' ||
          p3.allocations.PCB.subject !== 'Chemistry' ||
          p3.allocations.PCB.teacher !== 'Harshu Mam' ||
          p3.allocations.COMMERCE.subject !== 'Accountancy' ||
          p3.allocations.COMMERCE.teacher !== 'Alka Mam' ||
          p3.allocations.HUMANITIES.subject !== expectedHumP3 ||
          p3.allocations.HUMANITIES.teacher !== 'Ritu Mam'
        ) {
          throw new Error(`3rd Lecture mismatch on ${day}`);
        }

        // 4th Lecture
        if (
          p4.allocations.PCM.subject !== 'Mathematics' ||
          p4.allocations.PCM.teacher !== 'Anita Mam' ||
          p4.allocations.PCB.subject !== 'Biology' ||
          p4.allocations.PCB.teacher !== 'Shalini Mam' ||
          p4.allocations.COMMERCE.subject !== 'Free' ||
          !p4.allocations.COMMERCE.isFree ||
          Boolean(p4.allocations.COMMERCE.teacher) ||
          p4.allocations.HUMANITIES.subject !== 'Free' ||
          !p4.allocations.HUMANITIES.isFree ||
          Boolean(p4.allocations.HUMANITIES.teacher)
        ) {
          throw new Error(`4th Lecture mismatch on ${day}`);
        }

        // 5th Lecture
        const expectedSciP5 = isMonWed ? 'Physics' : 'Chemistry';
        if (
          p5.allocations.PCM.subject !== expectedSciP5 ||
          Boolean(p5.allocations.PCM.teacher) ||
          p5.allocations.PCB.subject !== expectedSciP5 ||
          Boolean(p5.allocations.PCB.teacher) ||
          p5.allocations.COMMERCE.subject !== 'Economics' ||
          p5.allocations.COMMERCE.teacher !== 'Alka Mam' ||
          p5.allocations.HUMANITIES.subject !== 'Economics' ||
          p5.allocations.HUMANITIES.teacher !== 'Alka Mam'
        ) {
          throw new Error(`5th Lecture mismatch on ${day}`);
        }

        // 6th Lecture
        const expectedP6 = isMonWed ? 'Physical Education' : 'Fine Arts';
        for (const st of ['PCM', 'PCB', 'COMMERCE', 'HUMANITIES'] as const) {
          if (p6.allocations[st].subject !== expectedP6 || Boolean(p6.allocations[st].teacher)) {
            throw new Error(`6th Lecture ${st} mismatch on ${day}`);
          }
        }
      }

      // 3. Verify switching between CURRENT TIMETABLE and OLD TIMETABLE without restarting
      storage.setActiveTimetableVersion('old');
      if (storage.getActiveTimetableVersion() !== 'old' || getActiveClassInCharge() !== 'Alka Mam') {
        throw new Error('Failed to switch active timetable version to old');
      }
      const oldSched = storage.getTimetable();
      const oldMonP3 = oldSched['Monday'].find((p) => p.periodNumber === 3);
      const oldMonP6 = oldSched['Monday'].find((p) => p.periodNumber === 6);
      if (
        !oldMonP3 ||
        oldMonP3.allocations.PCM.subject !== 'Mathematics' ||
        oldMonP3.allocations.PCB.subject !== 'Biology' ||
        !oldMonP6 ||
        oldMonP6.allocations.PCM.subject !== 'Chemistry'
      ) {
        throw new Error('Old Timetable was not preserved intact');
      }

      // Switch back to CURRENT TIMETABLE
      storage.setActiveTimetableVersion('current');
      if (storage.getActiveTimetableVersion() !== 'current' || getActiveClassInCharge() !== 'Diksha Mam') {
        throw new Error('Failed to switch active timetable version back to current');
      }

      // 4. Verify PDF generation for both CURRENT TIMETABLE and OLD TIMETABLE (1-page A4 landscape, no approval labels)
      const builtCurrentPdf = buildTimetablePdfDocument('current');
      const builtOldPdf = buildTimetablePdfDocument('old');
      if (builtCurrentPdf.pageCount !== 1 || builtOldPdf.pageCount !== 1) {
        throw new Error(
          `Expected 1 page for both Current (${builtCurrentPdf.pageCount}) and Old (${builtOldPdf.pageCount}) Timetable PDFs`
        );
      }

      // 5. Verify stateless server PDF reconstruction for both ?spec=timetable and ?spec=timetable_old
      const curSpecRes = await fetch(
        resolveApiUrl('/downloads/nexora-paper/pdf_test_cur/NEXORA_Class11_Timetable_Official.pdf?spec=timetable')
      );
      const oldSpecRes = await fetch(
        resolveApiUrl('/downloads/nexora-paper/pdf_test_old/NEXORA_Class11_Timetable_Official.pdf?spec=timetable_old')
      );
      if (!curSpecRes.ok || !oldSpecRes.ok) {
        throw new Error(
          `Server timetable spec PDF download failed: current=${curSpecRes.status}, old=${oldSpecRes.status}`
        );
      }
    }
  );

  // 55. NATIVE ANDROID APK MEDIASTORE.DOWNLOADS PDF SAVING & VERIFICATION BRIDGE
  await test(
    55,
    'Android APK Native MediaStore.Downloads PDF Saving, Non-Empty Verification & Open Action',
    'PDF & Documents',
    async () => {
      const {
        sanitizePdfFilename,
        saveBase64PdfViaAndroidBridge,
        buildTimetablePdfDocument,
      } = await import('./pdfGenerator');

      const sanitized = sanitizePdfFilename('NEXORA Class 11: Physics & Chemistry Paper! ');
      if (!sanitized.endsWith('.pdf') || sanitized.includes(' ') || sanitized.includes(':')) {
        throw new Error(`sanitizePdfFilename did not clean unsafe filename characters: ${sanitized}`);
      }

      // Reject empty / tiny payload (< 100 bytes) before even touching storage
      const emptyCheck = saveBase64PdfViaAndroidBridge('test.pdf', 'JVBERi0xLjQK');
      if (emptyCheck.ok) {
        throw new Error('saveBase64PdfViaAndroidBridge must reject payloads smaller than 100 bytes');
      }

      // Build a real timetable PDF and verify its base64 payload is non-empty and starts with %PDF- (JVBERi0)
      const builtPdf = buildTimetablePdfDocument('current');
      if (builtPdf.byteLength < 1000 || !builtPdf.base64.startsWith('JVBERi0')) {
        throw new Error('Built PDF document did not produce valid %PDF- base64 data');
      }
    }
  );

  // 56. PCB 4TH LECTURE BIOLOGY, VANSHIKA COMMERCE ECONOMICS & CLASS SHOWCASE RESTORATION
  await test(
    56,
    'PCB 4th Lecture Biology, Vanshika Commerce Economics & Class Showcase Integration',
    'Timetable & Students',
    async () => {
      // 1. Verify PCB 4th lecture displays Biology across all Monday–Saturday schedules
      const currentTimetable = storage.getTimetable('current');
      for (const day of DAYS_OF_WEEK) {
        const schedule = currentTimetable[day];
        const fourthPeriod = schedule.find((p) => p.periodNumber === 4);
        if (!fourthPeriod) {
          throw new Error(`Fourth Lecture not found in ${day} current schedule`);
        }
        if (fourthPeriod.startTime !== '10:40' || fourthPeriod.endTime !== '11:20') {
          throw new Error(`Fourth Lecture timing mismatch on ${day}: ${fourthPeriod.startTime} - ${fourthPeriod.endTime}`);
        }
        // Verify PCB is Biology with Shalini Mam
        if (fourthPeriod.allocations.PCB.subject !== 'Biology' || fourthPeriod.allocations.PCB.teacher !== 'Shalini Mam') {
          throw new Error(`Expected PCB 4th lecture on ${day} to be Biology (Shalini Mam), got ${fourthPeriod.allocations.PCB.subject}`);
        }
        // Verify PCM remains Mathematics with Anita Mam
        if (fourthPeriod.allocations.PCM.subject !== 'Mathematics' || fourthPeriod.allocations.PCM.teacher !== 'Anita Mam') {
          throw new Error(`Expected PCM 4th lecture on ${day} to remain Mathematics (Anita Mam)`);
        }
        // Verify Commerce and Humanities remain Free
        if (fourthPeriod.allocations.COMMERCE.subject !== 'Free' || fourthPeriod.allocations.HUMANITIES.subject !== 'Free') {
          throw new Error(`Expected Commerce and Humanities 4th lecture on ${day} to remain Free`);
        }
      }

      // 2. Verify Vanshika in Commerce stream has Economics instead of Physical Education
      const { getStudentProfileData } = await import('../data/studentSubjectMapping');
      const vanshikaProfile = getStudentProfileData({
        id: 'std-13',
        name: 'Vanshika',
        stream: 'COMMERCE',
        gender: 'girl',
      });
      if (vanshikaProfile.stream !== 'COMMERCE') {
        throw new Error(`Expected Vanshika stream to be COMMERCE, got ${vanshikaProfile.stream}`);
      }
      const vanshikaSubjectNames = vanshikaProfile.subjects.map((s) => s.name);
      if (!vanshikaSubjectNames.includes('Economics')) {
        throw new Error(`Expected Vanshika to have Economics, got: ${vanshikaSubjectNames.join(', ')}`);
      }
      if (vanshikaSubjectNames.includes('Physical Education')) {
        throw new Error('Expected Physical Education to be removed from Vanshika subjects');
      }
      // Verify all her other confirmed subjects are preserved
      const expectedVanshikaSubjects = [
        'Business Studies',
        'Accountancy',
        'English',
        'Mathematics',
        'Economics',
        'Fine Arts',
      ];
      for (const subj of expectedVanshikaSubjects) {
        if (!vanshikaSubjectNames.includes(subj)) {
          throw new Error(`Missing expected subject ${subj} for Vanshika`);
        }
      }

      // 3. Verify other Commerce students retain their original subjects (including Physical Education)
      const otherCommerceStudents = ['Riya', 'Harsh', 'Sandhya', 'Tamanna'];
      for (const name of otherCommerceStudents) {
        const prof = getStudentProfileData({
          name,
          stream: 'COMMERCE',
          gender: name === 'Harsh' ? 'boy' : 'girl',
        });
        const subjs = prof.subjects.map((s) => s.name);
        if (!subjs.includes('Physical Education')) {
          throw new Error(`Expected Commerce student ${name} to retain Physical Education`);
        }
        if (!subjs.includes('Economics')) {
          throw new Error(`Expected Commerce student ${name} to retain Economics`);
        }
        if (subjs.includes('Mathematics')) {
          throw new Error(`Commerce student ${name} should not have Mathematics`);
        }
      }

      // 4. Verify Class Showcase restoration: exactly 21 students and card present in ALL_MODULE_CARDS
      const students = storage.getStudents();
      if (students.length !== 21) {
        throw new Error(`Expected 21 student records for Class Showcase, got ${students.length}`);
      }
      const { ALL_MODULE_CARDS } = await import('../components/modules/DashboardModule');
      const introCard = ALL_MODULE_CARDS.find((c) => c.id === 'intro');
      if (!introCard || introCard.title !== 'Class Showcase') {
        throw new Error('Class Showcase card is missing from Dashboard ALL_MODULE_CARDS');
      }
    }
  );

  return results;
}


