import {
  Quiz,
  QuizAttempt,
  Student,
  StreamType,
  LeaderboardFilterPreferences,
  LeaderboardEntry,
  LeaderboardComputationResult,
} from '../types';
import { INITIAL_STUDENTS } from '../data/initialStudents';
import { ensureQuestionStableOptionIds, isMCQAnswerCorrect } from './mcqValidator';

export const LEADERBOARD_SCHEMA_VERSION = 2;
export const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export const DEFAULT_LEADERBOARD_FILTERS: LeaderboardFilterPreferences = {
  id: 'default',
  scope: 'overall',
  streamFilter: 'ALL',
  selectedQuizId: 'ALL',
  timePeriod: 'all_time',
  showUnattemptedStudents: false,
  updatedAt: Date.now(),
  schemaVersion: LEADERBOARD_SCHEMA_VERSION,
};

export function getScholarLevelInfo(xp: number): {
  level: number;
  title: string;
  nextLevelXP: number;
  progress: number;
} {
  const levels = [
    { level: 1, title: 'Novice Scholar', minXP: 0, maxXP: 200 },
    { level: 2, title: 'Class 11 Scholar', minXP: 200, maxXP: 500 },
    { level: 3, title: 'Analytical Thinker', minXP: 500, maxXP: 1000 },
    { level: 4, title: 'Concept Strategist', minXP: 1000, maxXP: 2000 },
    { level: 5, title: 'Academic Prodigy', minXP: 2000, maxXP: 3500 },
    { level: 6, title: 'Master Mind', minXP: 3500, maxXP: 5500 },
    { level: 7, title: 'Class OS Grandmaster', minXP: 5500, maxXP: 10000 },
  ];

  for (let i = 0; i < levels.length; i++) {
    const l = levels[i];
    if (xp >= l.minXP && (xp < l.maxXP || i === levels.length - 1)) {
      const range = l.maxXP - l.minXP;
      const prog = Math.min(100, Math.round(((xp - l.minXP) / range) * 100));
      return { level: l.level, title: l.title, nextLevelXP: l.maxXP, progress: prog };
    }
  }

  return { level: 7, title: 'Class OS Grandmaster', nextLevelXP: 10000, progress: 100 };
}

/**
 * Strictly resolves a student from the verified Class 11 roster by ID or name.
 * Prevents fake or unknown student records from entering the leaderboard.
 */
export function resolveVerifiedStudent(
  studentId?: string,
  studentName?: string,
  roster: Student[] = INITIAL_STUDENTS
): Student | null {
  const list = Array.isArray(roster) && roster.length > 0 ? roster : INITIAL_STUDENTS;
  if (studentId && typeof studentId === 'string') {
    const byId = list.find((s) => s.id.toLowerCase() === studentId.trim().toLowerCase());
    if (byId) return byId;
  }
  if (studentName && typeof studentName === 'string') {
    const clean = studentName.trim().toLowerCase();
    // Handle historical spelling normalization
    const normalizedName =
      clean === 'kesav' ? 'keshav' : clean === 'dixit' ? 'dikshit' : clean;
    const byName = list.find((s) => s.name.toLowerCase() === normalizedName);
    if (byName) return byName;
  }
  return null;
}

/**
 * Verifies a quiz attempt against the actual quiz answer key when available,
 * recalculating correctAnswers, score, maxScore, and accuracy from submitted answers.
 * Rejects incomplete, malformed, or non-roster attempts.
 */
export function verifyAndNormalizeAttempt(
  raw: Partial<QuizAttempt> | null | undefined,
  quizzesMap?: Map<string, Quiz>,
  roster: Student[] = INITIAL_STUDENTS
): { valid: boolean; attempt?: QuizAttempt; reason?: string } {
  if (!raw || typeof raw !== 'object') {
    return { valid: false, reason: 'Attempt record is null or not an object.' };
  }

  // Reject incomplete attempts (e.g., merely assigned or opened quizzes)
  if (raw.completedStatus === 'incomplete') {
    return { valid: false, reason: 'Incomplete quiz attempts do not earn points.' };
  }

  if (!raw.quizId || typeof raw.quizId !== 'string' || !raw.quizId.trim()) {
    return { valid: false, reason: 'Missing valid quizId.' };
  }

  const student = resolveVerifiedStudent(raw.studentId, raw.studentName, roster);
  if (!student) {
    return {
      valid: false,
      reason: `Student "${raw.studentName || raw.studentId || 'unknown'}" is not in the verified Class 11 roster.`,
    };
  }

  const completedAt = Number(raw.completedAt || raw.timestamp || 0);
  if (!Number.isFinite(completedAt) || completedAt <= 0) {
    return { valid: false, reason: 'Attempt is missing a valid completion timestamp.' };
  }

  const matchedQuiz = quizzesMap?.get(raw.quizId);

  let totalQuestions = Number(raw.totalQuestions) || 0;
  let correctAnswers = Number(raw.correctAnswers) || 0;
  let score = Number(raw.score) || 0;
  let maxScore = Number(raw.maxScore) || 0;
  let verifiedByAnswerKey = Boolean(raw.verifiedByAnswerKey);
  let selectedOptionIds: (string | null)[] | undefined = Array.isArray(raw.selectedOptionIds)
    ? [...raw.selectedOptionIds]
    : undefined;
  let userAnswers: number[] | undefined = Array.isArray(raw.userAnswers)
    ? [...raw.userAnswers]
    : undefined;

  // If the quiz definition is available AND we have submitted answers, recalculate from the verified answer key!
  if (
    matchedQuiz &&
    Array.isArray(matchedQuiz.questions) &&
    matchedQuiz.questions.length > 0 &&
    ((Array.isArray(userAnswers) && userAnswers.length > 0) ||
      (Array.isArray(selectedOptionIds) && selectedOptionIds.length > 0))
  ) {
    const normalizedQuestions = matchedQuiz.questions.map((q) =>
      ensureQuestionStableOptionIds(q)
    );

    // Count scorable MCQ questions
    const mcqQuestions = normalizedQuestions.filter(
      (q) => Array.isArray(q.options) && q.options.length > 0
    );

    if (mcqQuestions.length > 0) {
      let recalcCorrect = 0;
      let recalcPoints = 0;
      let recalcMaxPoints = 0;
      const rebuiltOptionIds: (string | null)[] = [];
      const rebuiltUserAnswers: number[] = [];

      normalizedQuestions.forEach((q, idx) => {
        const isMcq = Array.isArray(q.options) && q.options.length > 0;
        const qPoints = Number(q.points) || (Number(q.marks) ? Number(q.marks) * 10 : 10);

        if (!isMcq) {
          rebuiltOptionIds.push(null);
          rebuiltUserAnswers.push(-1);
          return;
        }

        recalcMaxPoints += qPoints;

        let chosenIdx =
          Array.isArray(userAnswers) && typeof userAnswers[idx] === 'number'
            ? userAnswers[idx]
            : -1;
        const chosenOptId =
          Array.isArray(selectedOptionIds) && selectedOptionIds[idx]
            ? selectedOptionIds[idx]
            : null;

        // If selectedOptionId was stored, resolve its current index in optionItems if needed
        if (
          chosenOptId &&
          chosenOptId !== 'unanswered' &&
          Array.isArray(q.optionItems)
        ) {
          const foundIdx = q.optionItems.findIndex((item) => item.id === chosenOptId);
          if (foundIdx >= 0) {
            chosenIdx = foundIdx;
          }
        }

        rebuiltUserAnswers.push(chosenIdx);
        const resolvedOptId =
          chosenIdx >= 0 && q.optionItems && q.optionItems[chosenIdx]
            ? q.optionItems[chosenIdx].id
            : chosenOptId || 'unanswered';
        rebuiltOptionIds.push(resolvedOptId);

        if (isMCQAnswerCorrect(q, chosenIdx, resolvedOptId)) {
          recalcCorrect++;
          recalcPoints += qPoints;
        }
      });

      totalQuestions = mcqQuestions.length;
      correctAnswers = recalcCorrect;
      score = recalcPoints;
      maxScore = recalcMaxPoints;
      userAnswers = rebuiltUserAnswers;
      selectedOptionIds = rebuiltOptionIds;
      verifiedByAnswerKey = true;
    }
  } else {
    // Validate numeric bounds when raw summary is used
    if (!Number.isFinite(totalQuestions) || totalQuestions <= 0) {
      return { valid: false, reason: 'Attempt has 0 or invalid totalQuestions.' };
    }
    if (!Number.isFinite(correctAnswers) || correctAnswers < 0 || correctAnswers > totalQuestions) {
      return {
        valid: false,
        reason: `Invalid correctAnswers (${correctAnswers}) for totalQuestions (${totalQuestions}).`,
      };
    }
    score = correctAnswers * 10;
    maxScore = totalQuestions * 10;
  }

  const accuracy =
    totalQuestions > 0 ? Math.min(100, Math.max(0, Math.round((correctAnswers / totalQuestions) * 100))) : 0;
  const timeSpentSeconds = Math.max(1, Math.round(Number(raw.timeSpentSeconds) || 10));
  const baseXP = correctAnswers * 50;
  const speedBonusXP =
    timeSpentSeconds <= 30 && correctAnswers > 0
      ? Math.round((30 - timeSpentSeconds) * 2)
      : 0;
  const xpEarned = baseXP + speedBonusXP;

  const stableId =
    raw.id && typeof raw.id === 'string' && raw.id.trim()
      ? raw.id.trim()
      : `att-${student.id}-${raw.quizId}-${completedAt}`;

  const synced = Boolean(raw.synced);
  const syncStatus =
    raw.syncStatus || (synced ? 'synced' : 'pending');

  const normalized: QuizAttempt = {
    id: stableId,
    quizId: raw.quizId.trim(),
    quizTitle:
      (raw.quizTitle && raw.quizTitle.trim()) ||
      matchedQuiz?.title ||
      'Class 11 Assessment',
    subject: raw.subject || matchedQuiz?.subject,
    studentId: student.id,
    studentName: student.name,
    stream: student.stream,
    score,
    maxScore: maxScore || totalQuestions * 10,
    totalQuestions,
    correctAnswers,
    accuracy,
    timeSpentSeconds,
    xpEarned,
    speedBonusXP,
    timestamp: completedAt,
    completedAt,
    completedStatus: 'completed',
    userAnswers,
    selectedOptionIds,
    verifiedByAnswerKey,
    schemaVersion: LEADERBOARD_SCHEMA_VERSION,
    synced,
    syncedAt: raw.syncedAt,
    syncStatus,
    syncError: raw.syncError,
  };

  return { valid: true, attempt: normalized };
}

/**
 * Checks whether an incoming attempt is an accidental duplicate submission
 * (same attempt ID or identical student + quiz + answers submitted within 15 seconds).
 */
export function findDuplicateSubmission(
  incoming: QuizAttempt,
  existingAttempts: QuizAttempt[]
): QuizAttempt | null {
  for (const existing of existingAttempts) {
    if (existing.id === incoming.id) {
      return existing;
    }
    const sameStudent =
      (existing.studentId && existing.studentId === incoming.studentId) ||
      existing.studentName.toLowerCase() === incoming.studentName.toLowerCase();
    const sameQuiz = existing.quizId === incoming.quizId;
    if (sameStudent && sameQuiz) {
      const timeDiff = Math.abs((incoming.completedAt || incoming.timestamp) - (existing.completedAt || existing.timestamp));
      const sameAnswers =
        JSON.stringify(existing.userAnswers || []) ===
        JSON.stringify(incoming.userAnswers || []);
      if (timeDiff < 15000 && sameAnswers) {
        return existing;
      }
    }
  }
  return null;
}

/**
 * Compares two valid attempts for the same (studentId, quizId) to select the canonical best attempt
 * so re-submitting or replaying the same quiz never counts twice in leaderboard totals.
 * Returns > 0 if `a` is better than `b`.
 */
export function compareAttemptQuality(a: QuizAttempt, b: QuizAttempt): number {
  if (a.score !== b.score) return a.score - b.score;
  if (a.accuracy !== b.accuracy) return a.accuracy - b.accuracy;
  if (a.correctAnswers !== b.correctAnswers) return a.correctAnswers - b.correctAnswers;
  if (a.timeSpentSeconds !== b.timeSpentSeconds) return b.timeSpentSeconds - a.timeSpentSeconds; // faster is better
  return (b.completedAt || b.timestamp) - (a.completedAt || a.timestamp); // earlier timestamp wins tie
}

/**
 * Computes the complete Leaderboard for NEXORA Quiz Arena based on:
 * - Real Class 11 students (`roster`)
 * - Verified completed attempts (`attempts`)
 * - Available quizzes (`quizzes`)
 * - Active filters (`filters`: scope, streamFilter, selectedQuizId, timePeriod)
 */
export function computeLeaderboard(params: {
  students?: Student[];
  attempts: QuizAttempt[];
  quizzes?: Quiz[];
  filters: Partial<LeaderboardFilterPreferences>;
  nowMs?: number;
}): LeaderboardComputationResult {
  const roster =
    Array.isArray(params.students) && params.students.length > 0
      ? params.students
      : INITIAL_STUDENTS;
  const quizzes = Array.isArray(params.quizzes) ? params.quizzes : [];
  const quizzesMap = new Map<string, Quiz>();
  for (const q of quizzes) {
    if (q && q.id) quizzesMap.set(q.id, q);
  }

  const scope = params.filters.scope || 'overall';
  const streamFilter: StreamType | 'ALL' =
    scope === 'stream' && params.filters.streamFilter && params.filters.streamFilter !== 'ALL'
      ? params.filters.streamFilter
      : params.filters.streamFilter || 'ALL';
  const selectedQuizId =
    scope === 'quiz' && params.filters.selectedQuizId
      ? params.filters.selectedQuizId
      : params.filters.selectedQuizId || 'ALL';
  const timePeriod = params.filters.timePeriod || 'all_time';
  const nowMs = params.nowMs || Date.now();
  const weeklyCutoffMs = nowMs - ONE_WEEK_MS;

  // 1. Filter eligible students by stream if stream filter is active (or if selected quiz is restricted to a stream)
  const selectedQuizObj =
    selectedQuizId !== 'ALL' ? quizzesMap.get(selectedQuizId) : undefined;

  const eligibleStudents = roster.filter((student) => {
    if (streamFilter !== 'ALL' && student.stream !== streamFilter) {
      return false;
    }
    if (
      scope === 'quiz' &&
      selectedQuizObj &&
      Array.isArray(selectedQuizObj.assignedStudentIds) &&
      selectedQuizObj.assignedStudentIds.length > 0
    ) {
      return selectedQuizObj.assignedStudentIds.includes(student.id);
    }
    if (
      scope === 'quiz' &&
      selectedQuizObj &&
      selectedQuizObj.stream &&
      selectedQuizObj.stream !== 'ALL' &&
      streamFilter === 'ALL'
    ) {
      return student.stream === selectedQuizObj.stream;
    }
    return true;
  });

  const eligibleStudentMap = new Map<string, Student>();
  for (const s of eligibleStudents) {
    eligibleStudentMap.set(s.id, s);
  }

  // 2. Verify and filter attempts
  const seenAttemptIds = new Set<string>();
  const validFilteredAttempts: QuizAttempt[] = [];
  let duplicateAttemptsIgnored = 0;

  for (const rawAtt of params.attempts || []) {
    const verified = verifyAndNormalizeAttempt(rawAtt, quizzesMap, roster);
    if (!verified.valid || !verified.attempt) continue;
    const att = verified.attempt;

    // Exact attempt ID deduplication
    if (seenAttemptIds.has(att.id)) {
      duplicateAttemptsIgnored++;
      continue;
    }
    seenAttemptIds.add(att.id);

    // Must belong to an eligible student in current filter
    if (!att.studentId || !eligibleStudentMap.has(att.studentId)) {
      continue;
    }

    // Quiz filter check
    if (selectedQuizId !== 'ALL' && att.quizId !== selectedQuizId) {
      continue;
    }

    // Time period filter check
    const ts = att.completedAt || att.timestamp;
    if (timePeriod === 'weekly' && ts < weeklyCutoffMs) {
      continue;
    }

    validFilteredAttempts.push(att);
  }

  // 3. Group attempts by studentId, and deduplicate per (studentId, quizId) keeping best verified attempt
  const attemptsByStudent = new Map<
    string,
    {
      bestByQuiz: Map<string, QuizAttempt>;
      totalAttemptsCount: number;
      lastCompletedAt: number | null;
    }
  >();

  const uniqueQuizIdsAcrossLeaderboard = new Set<string>();

  for (const att of validFilteredAttempts) {
    const sid = att.studentId!;
    uniqueQuizIdsAcrossLeaderboard.add(att.quizId);

    let record = attemptsByStudent.get(sid);
    if (!record) {
      record = {
        bestByQuiz: new Map<string, QuizAttempt>(),
        totalAttemptsCount: 0,
        lastCompletedAt: null,
      };
      attemptsByStudent.set(sid, record);
    }

    record.totalAttemptsCount += 1;
    const ts = att.completedAt || att.timestamp;
    if (!record.lastCompletedAt || ts > record.lastCompletedAt) {
      record.lastCompletedAt = ts;
    }

    const existingForQuiz = record.bestByQuiz.get(att.quizId);
    if (!existingForQuiz) {
      record.bestByQuiz.set(att.quizId, att);
    } else {
      duplicateAttemptsIgnored += 1;
      if (compareAttemptQuality(att, existingForQuiz) > 0) {
        record.bestByQuiz.set(att.quizId, att);
      }
    }
  }

  // 4. Build entries for each eligible student
  const unrankedWithAttempts: LeaderboardEntry[] = [];
  const unattemptedEntries: LeaderboardEntry[] = [];

  for (const student of eligibleStudents) {
    const record = attemptsByStudent.get(student.id);
    const uniqueAttempts = record ? Array.from(record.bestByQuiz.values()) : [];

    if (uniqueAttempts.length === 0) {
      unattemptedEntries.push({
        rank: null,
        isTied: false,
        studentId: student.id,
        studentName: student.name,
        stream: student.stream,
        gender: student.gender,
        totalPoints: 0,
        maxPossiblePoints: 0,
        completedQuizzes: 0,
        totalAttemptsCount: 0,
        averagePercentage: 0,
        totalCorrectAnswers: 0,
        totalQuestionsAnswered: 0,
        perfectScoresCount: 0,
        totalTimeSeconds: 0,
        totalXP: 0,
        level: 1,
        levelTitle: 'Novice Scholar',
        earnedBadgeIds: [],
        lastCompletedAt: null,
      });
      continue;
    }

    let totalPoints = 0;
    let maxPossiblePoints = 0;
    let totalCorrectAnswers = 0;
    let totalQuestionsAnswered = 0;
    let sumPercentages = 0;
    let perfectScoresCount = 0;
    let totalTimeSeconds = 0;
    let totalXP = 0;
    let bestAttemptId = uniqueAttempts[0].id;
    let bestAttemptScore = -1;

    for (const att of uniqueAttempts) {
      totalPoints += att.score;
      maxPossiblePoints += att.maxScore || att.totalQuestions * 10;
      totalCorrectAnswers += att.correctAnswers;
      totalQuestionsAnswered += att.totalQuestions;
      sumPercentages += att.accuracy;
      if (att.accuracy === 100) perfectScoresCount += 1;
      totalTimeSeconds += att.timeSpentSeconds;
      totalXP += att.xpEarned;
      if (att.score > bestAttemptScore) {
        bestAttemptScore = att.score;
        bestAttemptId = att.id;
      }
    }

    const completedQuizzes = uniqueAttempts.length;
    const averagePercentage = Math.round(sumPercentages / completedQuizzes);
    const lvlInfo = getScholarLevelInfo(totalXP);

    const earnedBadgeIds: string[] = ['first-strike'];
    if (perfectScoresCount >= 1) earnedBadgeIds.push('perfect-score');
    if (
      uniqueAttempts.some((a) => a.timeSpentSeconds <= 25 && a.accuracy >= 80)
    ) {
      earnedBadgeIds.push('speed-demon');
    }
    if (completedQuizzes >= 3) earnedBadgeIds.push('quiz-master');
    if (perfectScoresCount >= 2) earnedBadgeIds.push('flawless-streak');

    unrankedWithAttempts.push({
      rank: 0,
      isTied: false,
      studentId: student.id,
      studentName: student.name,
      stream: student.stream,
      gender: student.gender,
      totalPoints,
      maxPossiblePoints,
      completedQuizzes,
      totalAttemptsCount: record?.totalAttemptsCount || completedQuizzes,
      averagePercentage,
      totalCorrectAnswers,
      totalQuestionsAnswered,
      perfectScoresCount,
      totalTimeSeconds,
      totalXP,
      level: lvlInfo.level,
      levelTitle: lvlInfo.title,
      earnedBadgeIds,
      lastCompletedAt: record?.lastCompletedAt || null,
      bestAttemptId,
    });
  }

  // 5. Sort active entries deterministically
  unrankedWithAttempts.sort((a, b) => {
    // 1. Total points earned (descending)
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    // 2. Average percentage accuracy (descending)
    if (b.averagePercentage !== a.averagePercentage) {
      return b.averagePercentage - a.averagePercentage;
    }
    // 3. Total verified correct answers (descending)
    if (b.totalCorrectAnswers !== a.totalCorrectAnswers) {
      return b.totalCorrectAnswers - a.totalCorrectAnswers;
    }
    // 4. Completed quizzes count (descending)
    if (b.completedQuizzes !== a.completedQuizzes) {
      return b.completedQuizzes - a.completedQuizzes;
    }
    // 5. Total time spent (ascending — faster wins tie-breaker)
    if (a.totalTimeSeconds !== b.totalTimeSeconds) {
      return a.totalTimeSeconds - b.totalTimeSeconds;
    }
    // Alphabetical display order when completely tied (they will share the same rank number)
    return a.studentName.localeCompare(b.studentName);
  });

  // 6. Assign competition ranks with shared ranks on exact ties (1, 1, 3...)
  const isSamePerformance = (a: LeaderboardEntry, b: LeaderboardEntry): boolean => {
    return (
      a.totalPoints === b.totalPoints &&
      a.averagePercentage === b.averagePercentage &&
      a.totalCorrectAnswers === b.totalCorrectAnswers &&
      a.completedQuizzes === b.completedQuizzes &&
      a.totalTimeSeconds === b.totalTimeSeconds
    );
  };

  for (let i = 0; i < unrankedWithAttempts.length; i++) {
    const current = unrankedWithAttempts[i];
    if (i > 0 && isSamePerformance(current, unrankedWithAttempts[i - 1])) {
      current.rank = unrankedWithAttempts[i - 1].rank;
      current.isTied = true;
      unrankedWithAttempts[i - 1].isTied = true;
    } else {
      current.rank = i + 1;
    }
  }

  // Sort unattempted students alphabetically
  unattemptedEntries.sort((a, b) => a.studentName.localeCompare(b.studentName));

  const scoringFormulaSummary =
    selectedQuizId !== 'ALL'
      ? 'Quiz Ranking Formula: 10 pts per verified correct MCQ (or question marks × 10) • Best verified attempt per student • Tie-breakers: Marks Earned → Accuracy % → Correct Answers → Fastest Time (Shared rank on exact tie).'
      : 'Cumulative Ranking Formula: Sum of verified points across unique completed quizzes (10 pts per correct answer; repeat submissions of the same quiz do not double-count) • Tie-breakers: Total Points → Average % → Correct Answers → Completed Quizzes → Fastest Time (Shared rank on exact tie).';

  return {
    rankedEntries: unrankedWithAttempts,
    unattemptedEntries,
    allEntries: [...unrankedWithAttempts, ...unattemptedEntries],
    totalValidAttempts: validFilteredAttempts.length,
    uniqueQuizzesCount: uniqueQuizIdsAcrossLeaderboard.size,
    DuplicateAttemptsIgnored: duplicateAttemptsIgnored,
    scoringFormulaSummary,
  };
}
