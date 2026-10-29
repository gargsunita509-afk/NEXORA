export type StreamType = 'PCM' | 'PCB' | 'HUMANITIES' | 'COMMERCE';

export type DayOfWeek = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday';

export interface SubjectAllocation {
  subject: string;
  teacher?: string;
  isFree?: boolean;
  unassigned?: boolean;
}

export interface Period {
  id: string;
  periodNumber: number;
  title: string;
  startTime: string;
  endTime: string;
  isBreak?: boolean;
  isAfterSchool?: boolean;
  isMorningRoutine?: boolean;
  statusText?: string;
  description?: string;
  notes?: string;
  allocations: {
    PCM: SubjectAllocation;
    PCB: SubjectAllocation;
    HUMANITIES: SubjectAllocation;
    COMMERCE: SubjectAllocation;
  };
}

export type TimetableSchedule = Record<DayOfWeek, Period[]>;

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'leave' | 'unrecorded';

export type StudentSelectionMode = 'present_only' | 'individual' | 'all_in_stream' | 'skip' | 'none';

export interface DailyAttendanceRecord {
  date: string; // YYYY-MM-DD
  configured: boolean;
  updatedAt: number;
  statuses: Record<string, AttendanceStatus>; // keyed by student.id
  records?: Record<string, AttendanceStatus>;
  markedBy?: string;
}

export interface Student {
  id: string;
  name: string;
  stream: StreamType;
  gender: 'boy' | 'girl';
  attendanceStatus?: AttendanceStatus;
}

export interface MCQOptionItem {
  id: string;
  label?: 'A' | 'B' | 'C' | 'D';
  text: string;
}

export type StaffRole = 'teacher_in_charge' | 'developer';
export type UserRole = StaffRole | 'student' | 'guest';

export interface StaffUser {
  id: string;
  username: string;
  displayName: string;
  role: StaffRole;
  roleLabel: string;
  title?: string;
  createdAt?: number;
  updatedAt?: number;
  createdBy?: string;
  active?: boolean;
}

export interface StaffSession {
  token: string;
  expiresAt: number;
  user: StaffUser;
}

export type StaffSyncStatus = 'synced' | 'pending' | 'failed';

export interface DiaryAttachment {
  id: string;
  diaryId?: string;
  originalName: string;
  fileName?: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: number;
  uploadedBy: string;
  uploadedByName?: string;
  /** Only populated locally before server upload completes */
  localDataUrl?: string;
}

export interface DiaryEntry {
  id: string;
  date: string; // YYYY-MM-DD local calendar date
  subject: string;
  title: string;
  type: 'Homework' | 'Remark' | 'Notice' | 'Announcement' | 'Circular';
  content: string;
  description?: string;
  homework: string;
  remarks?: string;
  notices?: string;
  teacherRemarks?: string;
  importantNotices?: string;
  targetStream: StreamType | 'ALL';
  lastModified?: number;
  createdAt?: number;
  updatedAt?: number;
  publishedAt?: number;
  authorId?: string;
  authorName: string;
  authorRole?: StaffRole;
  authorRoleLabel?: string;
  status?: 'published' | 'draft';
  attachments?: DiaryAttachment[];
  version?: number;
  syncStatus?: StaffSyncStatus;
  syncError?: string;
  idempotencyKey?: string;
}

export type QuickNoteCategory =
  | 'announcement'
  | 'academic'
  | 'urgent'
  | 'moderation'
  | 'general'
  | 'handover';

export interface StaffQuickNote {
  id: string;
  title?: string;
  content: string;
  category: QuickNoteCategory;
  pinned?: boolean;
  authorId: string;
  authorName: string;
  authorRole: StaffRole;
  authorRoleLabel: string;
  createdAt: number;
  updatedAt: number;
  version: number;
  syncStatus?: StaffSyncStatus;
  syncError?: string;
  idempotencyKey?: string;
}

export interface PendingStaffMutation {
  id: string;
  accountId: string;
  target: 'diary' | 'quick_note';
  entityType?: 'diary' | 'quick_note';
  operation: 'create' | 'update' | 'delete';
  recordId: string;
  entityId?: string;
  payload: any;
  baseVersion?: number;
  baseUpdatedAt?: number;
  idempotencyKey: string;
  createdAt: number;
  retryCount?: number;
  errorMessage?: string;
  lastError?: string;
  status: 'pending' | 'failed';
}

export type DrawingTool =
  | 'pen'
  | 'pencil'
  | 'highlighter'
  | 'eraser'
  | 'line'
  | 'arrow'
  | 'rect'
  | 'roundedRect'
  | 'circle'
  | 'ellipse'
  | 'triangle'
  | 'polygon'
  | 'text'
  | 'select';

export interface Point {
  x: number;
  y: number;
  pressure?: number;
}

export interface CanvasStroke {
  id: string;
  tool: DrawingTool;
  color: string;
  size: number;
  opacity: number;
  points: Point[];
  startPoint?: Point;
  endPoint?: Point;
  polygonSides?: number;
  text?: string;
  fontSize?: number;
}

export type WhiteboardBg = 'navy' | 'white' | 'black' | 'lightGrey' | 'grid' | 'dots' | 'cartesian';

export interface Whiteboard {
  id: string;
  name: string;
  updatedAt: number;
  strokes: CanvasStroke[];
  background: WhiteboardBg;
  customBgColor?: string;
  previewImage?: string;
}

export interface CalculatorNote {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

export type QuizDifficulty =
  | 'Easy'
  | 'Medium'
  | 'Hard'
  | 'Mixed'
  | 'Foundation'
  | 'Intermediate'
  | 'Advanced';

export type QuestionType =
  | 'mcq'
  | 'short_2'
  | 'short_3'
  | 'case_study'
  | 'long_5'
  | 'mixed'
  | 'numerical'
  | 'conceptual'
  | 'assertion_reason'
  | 'fill_in';

export interface CaseStudySubQuestion {
  id: string;
  subNumber?: string; // e.g. "(i)", "(ii)", "(iii)"
  question: string;
  questionType: 'mcq' | 'written';
  options?: string[]; // for MCQ subquestions
  optionItems?: MCQOptionItem[];
  correctIndex?: number;
  correctOptionId?: string;
  correctAnswerText?: string;
  modelAnswer?: string;
  marks: number;
  explanation?: string;
}

export interface QuizQuestion {
  id: string;
  question: string;
  options?: [string, string, string, string] | string[];
  optionItems?: MCQOptionItem[];
  correctIndex?: number;
  correctOptionId?: string;
  correctAnswerText?: string;
  explanation: string;
  points?: number;
  marks?: number; // Configured exam paper marks
  chapter?: string;
  section?: 'A' | 'B' | 'C' | 'D' | 'E' | string;
  questionType?: QuestionType;
  // Case-study fields
  casePassage?: string;
  subQuestions?: CaseStudySubQuestion[];
  // Written response / rubric fields
  modelAnswer?: string;
  rubric?: string;
  isPYQ?: boolean;
  pyqYear?: string;
}

export interface PaperExamConfig {
  examName?: string;
  examDate?: string;
  durationMinutes?: number;
  generalInstructions?: string[];
  totalMarks?: number;
  isQuestionPaper?: boolean;
}

export interface Quiz {
  id: string;
  title: string;
  subject: string;
  description: string;
  stream?: StreamType | 'ALL';
  classLevel?: string;
  timeLimitSeconds: number;
  questions: QuizQuestion[];
  createdAt: number;
  chapter?: string;
  chapters?: string[];
  difficulty?: QuizDifficulty;
  questionType?: QuestionType;
  source?: 'ai' | 'cbse-bank' | 'teacher';
  studentId?: string;
  assignedStudentIds?: string[];
  assignedStudentNames?: string[];
  assignmentMode?: StudentSelectionMode;
  assignedAt?: number;
  createdBy?: string;
  isDraft?: boolean;
  instructions?: string;
  isQuestionPaper?: boolean;
  paperConfig?: PaperExamConfig;
  questionsCountByType?: Record<string, number>;
  marksConfig?: Record<string, number>;
}

export type AttemptSyncStatus = 'synced' | 'pending' | 'local' | 'failed';

export interface QuizAttempt {
  id: string;
  quizId: string;
  quizTitle: string;
  subject?: string;
  studentName: string;
  studentId?: string;
  stream?: StreamType;
  score: number;
  maxScore?: number;
  totalQuestions: number;
  correctAnswers: number;
  accuracy: number;
  timeSpentSeconds: number;
  xpEarned: number;
  speedBonusXP: number;
  timestamp: number;
  completedAt?: number;
  completedStatus?: 'completed' | 'incomplete';
  userAnswers?: number[];
  selectedOptionIds?: (string | null)[];
  verifiedByAnswerKey?: boolean;
  schemaVersion?: number;
  synced?: boolean;
  syncedAt?: number;
  syncStatus?: AttemptSyncStatus;
  syncError?: string;
}

export type LeaderboardViewScope = 'overall' | 'class' | 'stream' | 'quiz';
export type LeaderboardTimePeriod = 'all_time' | 'weekly';

export interface LeaderboardFilterPreferences {
  id: string; // 'default'
  scope: LeaderboardViewScope;
  streamFilter: StreamType | 'ALL';
  selectedQuizId: string | 'ALL';
  timePeriod: LeaderboardTimePeriod;
  showUnattemptedStudents: boolean;
  updatedAt: number;
  schemaVersion: number;
}

export interface LeaderboardEntry {
  rank: number | null; // null if student has 0 completed attempts
  isTied: boolean;
  studentId: string;
  studentName: string;
  stream: StreamType;
  gender: 'boy' | 'girl';
  totalPoints: number;
  maxPossiblePoints: number;
  completedQuizzes: number;
  totalAttemptsCount: number;
  averagePercentage: number;
  totalCorrectAnswers: number;
  totalQuestionsAnswered: number;
  perfectScoresCount: number;
  totalTimeSeconds: number;
  totalXP: number;
  level: number;
  levelTitle: string;
  earnedBadgeIds: string[];
  lastCompletedAt: number | null;
  bestAttemptId?: string;
}

export interface LeaderboardComputationResult {
  rankedEntries: LeaderboardEntry[]; // Students with >= 1 valid completed attempt
  unattemptedEntries: LeaderboardEntry[]; // Eligible students with 0 attempts in current filter
  allEntries: LeaderboardEntry[];
  totalValidAttempts: number;
  uniqueQuizzesCount: number;
  DuplicateAttemptsIgnored: number;
  scoringFormulaSummary: string;
}

export interface StoragePersistenceStatus {
  indexedDBAvailable: boolean;
  schemaVersion: number;
  savedAttemptsCount: number;
  savedQuizzesCount: number;
  pendingSyncCount: number;
  syncedCount: number;
  lastSyncedAt: number | null;
  isOnline: boolean;
  storageWarning: string | null;
}

export interface QuizBadge {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'accuracy' | 'speed' | 'dedication' | 'mastery';
  unlockedAt?: number;
}

export interface StudentGamificationProfile {
  studentName: string;
  studentId?: string;
  stream?: StreamType;
  totalXP: number;
  level: number;
  levelTitle: string;
  quizzesCompleted: number;
  perfectScoresCount: number;
  earnedBadgeIds: string[];
  lastUpdated: number;
}

export interface CalculatorHistoryItem {
  id: string;
  expression: string;
  result: string;
  angleMode: 'DEG' | 'RAD';
  timestamp: number;
}

export interface ClassroomVideo {
  id: string;
  title: string;
  url: string;
  subject: string;
  stream: string;
  description?: string;
}

export type NavModule =
  | 'dashboard'
  | 'timetable'
  | 'youtube'
  | 'notes'
  | 'diary'
  | 'quick_notes'
  | 'timer'
  | 'quiz'
  | 'games'
  | 'gemini'
  | 'intro'
  | 'calculator'
  | 'diagnostics';
