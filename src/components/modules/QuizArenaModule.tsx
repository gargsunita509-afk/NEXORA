import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Trophy,
  Play,
  CheckCircle,
  XCircle,
  Clock,
  Zap,
  RotateCcw,
  Sparkles,
  User,
  Shield,
  Layers,
  X,
  Search,
  BookOpen,
  AlertCircle,
  Check,
  RefreshCw,
  Lock,
  FileText,
  UserCheck,
} from 'lucide-react';
import {
  Quiz,
  QuizQuestion,
  QuizAttempt,
  StudentGamificationProfile,
  QuizBadge,
  Student,
  StreamType,
  LeaderboardFilterPreferences,
  StoragePersistenceStatus,
} from '../../types';
import { storage } from '../../services/storage';
import { resolveApiUrl } from '../../services/updateService';
import { apkAwareFetch as fetch } from '../../services/apkApiBridge';
import {
  ensureQuestionStableOptionIds,
  isMCQAnswerCorrect,
} from '../../utils/mcqValidator';
import { DEFAULT_LEADERBOARD_FILTERS } from '../../utils/leaderboardEngine';
import { audioFX } from '../../services/audio';
import { STREAM_ASSIGNED_SUBJECTS, SUBJECT_CHAPTERS } from '../../data/starterQuizzes';
import { TeacherQuizGenerator } from '../quiz/TeacherQuizGenerator';
import { TeacherQuizReviewModal } from '../quiz/TeacherQuizReviewModal';
import { QuestionPaperPreviewModal } from '../quiz/QuestionPaperPreviewModal';
import { QuizLeaderboardPanel } from '../quiz/QuizLeaderboardPanel';
import { UniversalBackButton } from '../UniversalBackButton';

const BADGES_CATALOG: QuizBadge[] = [
  {
    id: 'first-strike',
    name: 'First Strike',
    description: 'Completed your first classroom challenge',
    icon: '⚡',
    category: 'dedication',
  },
  {
    id: 'perfect-score',
    name: 'Perfect Score',
    description: 'Scored 100% accuracy on a quiz',
    icon: '🎯',
    category: 'accuracy',
  },
  {
    id: 'speed-demon',
    name: 'Speed Demon',
    description: 'Completed a quiz under 25 seconds',
    icon: '🏎️',
    category: 'speed',
  },
  {
    id: 'quiz-master',
    name: 'Quiz Master',
    description: 'Completed 3 or more quizzes successfully',
    icon: '👑',
    category: 'mastery',
  },
  {
    id: 'flawless-streak',
    name: 'Flawless Streak',
    description: 'Achieved multiple perfect scores',
    icon: '🔥',
    category: 'mastery',
  },
];

function getLevelInfo(xp: number): { level: number; title: string; nextLevelXP: number; progress: number } {
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

const STREAM_STYLES: Record<StreamType, { border: string; bg: string; badge: string; text: string }> = {
  PCM: {
    border: 'border-cyan-500/40',
    bg: 'bg-cyan-950/30',
    badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-400/40',
    text: 'text-cyan-300',
  },
  PCB: {
    border: 'border-emerald-500/40',
    bg: 'bg-emerald-950/30',
    badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40',
    text: 'text-emerald-300',
  },
  HUMANITIES: {
    border: 'border-purple-500/40',
    bg: 'bg-purple-950/30',
    badge: 'bg-purple-500/20 text-purple-300 border-purple-400/40',
    text: 'text-purple-300',
  },
  COMMERCE: {
    border: 'border-amber-500/40',
    bg: 'bg-amber-950/30',
    badge: 'bg-amber-500/20 text-amber-300 border-amber-400/40',
    text: 'text-amber-300',
  },
};

export const QuizArenaModule: React.FC = () => {
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [leaderboard, setLeaderboard] = useState<StudentGamificationProfile[]>([]);
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [leaderboardFilters, setLeaderboardFilters] = useState<LeaderboardFilterPreferences>(
    DEFAULT_LEADERBOARD_FILTERS
  );
  const [persistenceStatus, setPersistenceStatus] = useState<StoragePersistenceStatus | null>(null);
  const [activeTab, setActiveTab] = useState<'quizzes' | 'teacher_studio' | 'leaderboard' | 'history'>('quizzes');
  const isSubmittingQuizRef = useRef<boolean>(false);

  // Teacher Review & Edit State
  const [reviewQuiz, setReviewQuiz] = useState<Quiz | null>(null);
  const [isReviewOpen, setIsReviewOpen] = useState<boolean>(false);

  // Student list & Stream-Wise Student Selection
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudentStreamFilter, setSelectedStudentStreamFilter] = useState<StreamType | 'ALL'>('ALL');
  const [studentInput, setStudentInput] = useState<string>('Vansh');
  const [isAutocompleteOpen, setIsAutocompleteOpen] = useState<boolean>(false);
  const autocompleteRef = useRef<HTMLDivElement>(null);

  // AI Quiz Generation State
  const [isGeneratingAI, setIsGeneratingAI] = useState<boolean>(false);
  const [aiNotice, setAiNotice] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  // Active Quiz Play State
  const [activeQuiz, setActiveQuiz] = useState<Quiz | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isAnswerSubmitted, setIsAnswerSubmitted] = useState<boolean>(false);
  const [userAnswers, setUserAnswers] = useState<number[]>([]);
  const [quizStartTime, setQuizStartTime] = useState<number>(0);
  const [questionTimeRemaining, setQuestionTimeRemaining] = useState<number>(25);
  const [quizFinished, setQuizFinished] = useState<boolean>(false);
  const [lastResult, setLastResult] = useState<QuizAttempt | null>(null);
  const [newlyUnlockedBadges, setNewlyUnlockedBadges] = useState<QuizBadge[]>([]);

  // Paper Preview Modal & Subjective Board Solving State
  const [paperToPreview, setPaperToPreview] = useState<Quiz | null>(null);
  const [showSubjectiveSolution, setShowSubjectiveSolution] = useState<boolean>(false);
  const [scratchpadText, setScratchpadText] = useState<string>('');

  // Load data on mount and listen for connectivity transitions
  useEffect(() => {
    refreshData();
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      storage.syncQuizAttemptsWithServer().then(() => refreshData()).catch(() => {});
    }

    const handleOnline = () => {
      storage.syncQuizAttemptsWithServer().then(() => refreshData()).catch(() => {});
    };
    const handleOffline = () => {
      storage.getPersistenceStatus().then(setPersistenceStatus).catch(() => {});
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const refreshData = async () => {
    const studentList = storage.getStudents();
    setStudents(studentList);
    const qList = await storage.getQuizzes();
    setQuizzes(qList);
    const aList = await storage.getQuizAttempts();
    setAttempts(aList);
    const pList = await storage.getAllGamificationProfiles();
    setLeaderboard(pList);
    const savedPrefs = await storage.getLeaderboardPreferences();
    setLeaderboardFilters(savedPrefs);
    const status = await storage.getPersistenceStatus();
    setPersistenceStatus(status);
  };

  const handleUpdateLeaderboardFilters = async (partial: Partial<LeaderboardFilterPreferences>) => {
    const updated = await storage.saveLeaderboardPreferences(partial);
    setLeaderboardFilters(updated);
  };

  const handleSyncLeaderboardNow = async () => {
    await storage.syncQuizAttemptsWithServer();
    await refreshData();
  };

  const handleExportLeaderboardBackup = async () => {
    const jsonStr = await storage.exportLeaderboardBackup();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nexora-leaderboard-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportLeaderboardBackup = async (fileText: string) => {
    const res = await storage.importLeaderboardBackup(fileText);
    if (res.success) {
      await refreshData();
    }
    return { success: res.success, message: res.message };
  };

  // Close autocomplete on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (autocompleteRef.current && !autocompleteRef.current.contains(e.target as Node)) {
        setIsAutocompleteOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Students filtered by selected stream filter in Student Selector
  const streamFilteredStudents: Student[] = useMemo(() => {
    if (selectedStudentStreamFilter === 'ALL') return students;
    return students.filter((s) => s.stream === selectedStudentStreamFilter);
  }, [students, selectedStudentStreamFilter]);

  // Resolve current active student from studentInput
  const activeStudent: Student | null = useMemo(() => {
    if (!studentInput || !studentInput.trim()) return null;
    const clean = studentInput.trim().toLowerCase();
    return (
      students.find(
        (s) => s.name.toLowerCase() === clean || s.id.toLowerCase() === clean
      ) || null
    );
  }, [studentInput, students]);

  // Autocomplete suggestions strictly filtered by the selected stream filter and input text
  const suggestions: Student[] = useMemo(() => {
    if (!studentInput || !studentInput.trim()) return streamFilteredStudents;
    const clean = studentInput.trim().toLowerCase();
    return streamFilteredStudents.filter(
      (s) =>
        s.name.toLowerCase().includes(clean) ||
        s.stream.toLowerCase().includes(clean) ||
        s.id.toLowerCase().includes(clean)
    );
  }, [studentInput, streamFilteredStudents]);

  // When teacher/student switches the stream filter, if the current activeStudent is not in that stream,
  // automatically switch to the first student of the selected stream so only that stream's students appear.
  const handleStreamFilterChange = (stream: StreamType | 'ALL') => {
    audioFX.playClick();
    setSelectedStudentStreamFilter(stream);
    if (stream !== 'ALL') {
      const inStream = students.filter((s) => s.stream === stream);
      if (inStream.length > 0 && (!activeStudent || activeStudent.stream !== stream)) {
        setStudentInput(inStream[0].name);
      }
    }
  };

  // Assigned subjects for current student's stream
  const assignedSubjects = useMemo(() => {
    if (!activeStudent) return [];
    return STREAM_ASSIGNED_SUBJECTS[activeStudent.stream] || [];
  }, [activeStudent]);

  // Filter quizzes strictly relevant to the student's assigned stream, subjects, and student-level assignment
  const studentQuizzes = useMemo(() => {
    if (!activeStudent) return [];
    const subjects = assignedSubjects;

    const filtered = quizzes.filter((q) => {
      if (q.isDraft) return false;
      // If quiz was assigned to specific students, only show to those selected students
      if (Array.isArray(q.assignedStudentIds) && q.assignedStudentIds.length > 0) {
        return q.assignedStudentIds.includes(activeStudent.id);
      }
      const subjectMatch = subjects.some(
        (sub) => sub.toLowerCase() === q.subject.toLowerCase()
      );
      const streamMatch = !q.stream || q.stream === 'ALL' || q.stream === activeStudent.stream;
      return subjectMatch && streamMatch;
    });

    // Sort to show newly created/published quizzes first, up to 8
    return filtered.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 8);
  }, [activeStudent, quizzes, assignedSubjects]);

  // Teacher Review & Publishing Handlers
  const handleOpenReview = (quiz: Quiz) => {
    setReviewQuiz(quiz);
    setIsReviewOpen(true);
    if (quiz && Array.isArray(quiz.questions) && quiz.questions.length > 0) {
      storage.saveQuiz(quiz).catch(() => {});
      setQuizzes((prev) => [quiz, ...prev.filter((q) => q.id !== quiz.id)]);
    }
  };

  const handleSaveDraft = async (updatedQuiz: Quiz) => {
    await storage.saveQuiz(updatedQuiz);
    setQuizzes((prev) => [updatedQuiz, ...prev.filter((q) => q.id !== updatedQuiz.id)]);
    setReviewQuiz(updatedQuiz);
  };

  const handlePublishQuiz = async (updatedQuiz: Quiz) => {
    const published: Quiz = { ...updatedQuiz, isDraft: false, source: 'teacher' };
    await storage.saveQuiz(published);
    setQuizzes((prev) => [published, ...prev.filter((q) => q.id !== published.id)]);
    setIsReviewOpen(false);
    setReviewQuiz(null);
    const assignedText =
      published.assignedStudentIds && published.assignedStudentIds.length > 0
        ? `Assigned to ${published.assignedStudentIds.length} student(s) in ${published.stream || 'Class 11'}.`
        : `Available in My Quizzes for ${published.stream || 'Class 11'}.`;
    setAiNotice({
      message: `Published "${published.title}"! ${assignedText}`,
      type: 'success',
    });
  };

  const handleDeleteQuiz = async (id: string) => {
    audioFX.playClick();
    await storage.deleteQuiz(id);
    setQuizzes((prev) => prev.filter((q) => q.id !== id));
    if (reviewQuiz?.id === id) {
      setIsReviewOpen(false);
      setReviewQuiz(null);
    }
  };

  const handleRegenerateFullQuiz = async (quizToRegen: Quiz) => {
    const isPaper = Boolean(quizToRegen.isQuestionPaper || quizToRegen.paperConfig);
    const isEng = Boolean(
      (quizToRegen as any).isEnglishPaper ||
      (quizToRegen.subject && quizToRegen.subject.toLowerCase().includes('english') && isPaper)
    );
    const recentItems: string[] = [];
    for (const qItem of quizToRegen.questions || []) {
      if (qItem.casePassage) recentItems.push(qItem.casePassage.slice(0, 160));
      if (qItem.question) recentItems.push(qItem.question.slice(0, 160));
    }
    const response = await fetch(resolveApiUrl('/api/gemini/quiz'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        isQuestionPaper: isPaper,
        isEnglishPaper: isEng,
        classLevel: quizToRegen.classLevel || 'Class 11TH',
        stream: quizToRegen.stream || 'PCM',
        subject: quizToRegen.subject,
        chapters: quizToRegen.chapters || (quizToRegen.chapter ? [quizToRegen.chapter] : []),
        chapter: quizToRegen.chapter,
        questionCount: quizToRegen.questions.length,
        questionCountsByType: quizToRegen.questionsCountByType,
        marksConfig: quizToRegen.marksConfig,
        paperConfig: quizToRegen.paperConfig,
        difficulty: quizToRegen.difficulty || 'Medium',
        questionType: quizToRegen.questionType || 'mixed',
        instructions: quizToRegen.instructions || '',
        teacherName: quizToRegen.createdBy || 'Alka Mam',
        recentQuestions: recentItems.slice(-40),
        generationNonce: `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
        assignedStudentIds: quizToRegen.assignedStudentIds,
        assignedStudentNames: quizToRegen.assignedStudentNames,
        assignmentMode: quizToRegen.assignmentMode,
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Failed to regenerate full quiz: HTTP ${response.status}`);
    }

    const data = await response.json();
    if (data.success && data.quiz && Array.isArray(data.quiz.questions) && data.quiz.questions.length > 0) {
      const freshQuiz: Quiz = {
        ...data.quiz,
        id: quizToRegen.id,
        isDraft: quizToRegen.isDraft ?? true,
        isQuestionPaper: isPaper,
        assignedStudentIds: quizToRegen.assignedStudentIds,
        assignedStudentNames: quizToRegen.assignedStudentNames,
        assignmentMode: quizToRegen.assignmentMode,
      };
      setReviewQuiz(freshQuiz);
      await storage.saveQuiz(freshQuiz);
      setQuizzes((prev) => [freshQuiz, ...prev.filter((q) => q.id !== freshQuiz.id)]);
    } else {
      throw new Error(data.error || 'Failed to regenerate quiz data');
    }
  };

  // Timer countdown during active quiz
  useEffect(() => {
    if (!activeQuiz || quizFinished || isAnswerSubmitted) return;

    const timer = setInterval(() => {
      setQuestionTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleSubmitAnswer(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [activeQuiz, currentQuestionIndex, quizFinished, isAnswerSubmitted]);

  // Start Quiz (ensuring stable option IDs on all MCQ questions)
  const handleStartQuiz = (quiz: Quiz) => {
    audioFX.playClick();
    isSubmittingQuizRef.current = false;
    const normalizedQuiz: Quiz = {
      ...quiz,
      questions: (quiz.questions || []).map((q) => ensureQuestionStableOptionIds(q)),
    };
    setActiveQuiz(normalizedQuiz);
    setCurrentQuestionIndex(0);
    setSelectedOption(null);
    setIsAnswerSubmitted(false);
    setShowSubjectiveSolution(false);
    setScratchpadText('');
    setUserAnswers(new Array(normalizedQuiz.questions.length).fill(-1));
    setQuizStartTime(Date.now());
    setQuestionTimeRemaining(normalizedQuiz.timeLimitSeconds || 25);
    setQuizFinished(false);
    setLastResult(null);
    setNewlyUnlockedBadges([]);
  };

  // Submit Answer (stores answer strictly at currentQuestionIndex and validates via stable option ID)
  const handleSubmitAnswer = (isTimeout = false) => {
    if (!activeQuiz || isAnswerSubmitted) return;

    const currentQ = activeQuiz.questions[currentQuestionIndex];
    const chosenIndex = isTimeout ? -1 : selectedOption !== null ? selectedOption : -1;
    setIsAnswerSubmitted(true);

    const isCorrect = isMCQAnswerCorrect(currentQ, chosenIndex);
    if (isCorrect) {
      audioFX.playSuccess();
    } else {
      audioFX.playError();
    }

    setUserAnswers((prev) => {
      const next = [...prev];
      while (next.length < activeQuiz.questions.length) {
        next.push(-1);
      }
      next[currentQuestionIndex] = chosenIndex;
      return next;
    });
  };

  // Previous Question (restores previously submitted option for that question if already answered)
  const handlePrevQuestion = () => {
    if (!activeQuiz || currentQuestionIndex === 0) return;
    audioFX.playClick();
    const targetIdx = currentQuestionIndex - 1;
    const prevAns = userAnswers[targetIdx];
    setCurrentQuestionIndex(targetIdx);
    if (typeof prevAns === 'number' && prevAns >= 0) {
      setSelectedOption(prevAns);
      setIsAnswerSubmitted(true);
    } else {
      setSelectedOption(null);
      setIsAnswerSubmitted(false);
    }
    setShowSubjectiveSolution(false);
    setScratchpadText('');
  };

  // Next Question or Finish Quiz
  const handleNextQuestion = async () => {
    if (!activeQuiz) return;
    audioFX.playClick();

    if (currentQuestionIndex + 1 < activeQuiz.questions.length) {
      const nextIdx = currentQuestionIndex + 1;
      const existingAns = userAnswers[nextIdx];
      setCurrentQuestionIndex(nextIdx);
      if (typeof existingAns === 'number' && existingAns >= 0) {
        setSelectedOption(existingAns);
        setIsAnswerSubmitted(true);
      } else {
        setSelectedOption(null);
        setIsAnswerSubmitted(false);
      }
      setShowSubjectiveSolution(false);
      setScratchpadText('');
      setQuestionTimeRemaining(activeQuiz.timeLimitSeconds || 25);
    } else {
      finishQuiz();
    }
  };

  const finishQuiz = async () => {
    if (!activeQuiz || !activeStudent || isSubmittingQuizRef.current) return;
    isSubmittingQuizRef.current = true;

    try {
      const totalQ = activeQuiz.questions.length;
      let correctCount = 0;
      const selectedOptionIds: string[] = [];

      activeQuiz.questions.forEach((q, idx) => {
        const chosenIdx = userAnswers[idx] ?? -1;
        if (isMCQAnswerCorrect(q, chosenIdx)) {
          correctCount++;
        }
        const optId =
          chosenIdx >= 0 && q.optionItems && q.optionItems[chosenIdx]
            ? q.optionItems[chosenIdx].id
            : chosenIdx >= 0
            ? `opt-${q.id}-${chosenIdx}`
            : 'unanswered';
        selectedOptionIds.push(optId);
      });

      const completedAt = Date.now();
      const timeSpent = Math.max(1, Math.round((completedAt - quizStartTime) / 1000));
      const accuracy = Math.round((correctCount / totalQ) * 100);
      const baseXP = correctCount * 50;
      const speedBonusXP =
        timeSpent <= 30 && correctCount > 0 ? Math.round((30 - timeSpent) * 2) : 0;
      const totalXPForQuiz = baseXP + speedBonusXP;
      const score = correctCount * 10;

      // Snapshot previous badges before saving so we can highlight newly unlocked ones
      const prevProfile = await storage.getGamificationProfile(activeStudent.name);
      const prevBadgeIds = new Set<string>(prevProfile?.earnedBadgeIds || []);

      const attempt: QuizAttempt = {
        id: `att-${activeStudent.id}-${activeQuiz.id}-${completedAt}`,
        quizId: activeQuiz.id,
        quizTitle: activeQuiz.title,
        subject: activeQuiz.subject,
        studentName: activeStudent.name,
        studentId: activeStudent.id,
        stream: activeStudent.stream,
        score,
        maxScore: totalQ * 10,
        totalQuestions: totalQ,
        correctAnswers: correctCount,
        accuracy,
        timeSpentSeconds: timeSpent,
        xpEarned: totalXPForQuiz,
        speedBonusXP,
        timestamp: completedAt,
        completedAt,
        completedStatus: 'completed',
        userAnswers: [...userAnswers],
        selectedOptionIds,
        verifiedByAnswerKey: true,
        schemaVersion: 2,
      };

      // Validate, deduplicate, and persist to IndexedDB immediately
      const saveResult = await storage.saveQuizAttempt(attempt, activeQuiz);
      const finalAttempt = saveResult.attempt || attempt;

      const updatedProfile = await storage.getGamificationProfile(activeStudent.name);
      const newBadges: QuizBadge[] = [];
      if (updatedProfile) {
        for (const bid of updatedProfile.earnedBadgeIds) {
          if (!prevBadgeIds.has(bid)) {
            const b = BADGES_CATALOG.find((item) => item.id === bid);
            if (b) newBadges.push(b);
          }
        }
      }

      setLastResult(finalAttempt);
      setNewlyUnlockedBadges(newBadges);
      setQuizFinished(true);
      await refreshData();
    } finally {
      isSubmittingQuizRef.current = false;
    }
  };

  // Generate a Fresh AI Quiz for the Student (works identically on website and installed Android APK via resolveApiUrl)
  const handleGenerateFreshAIQuiz = async (preferredSubject?: string) => {
    if (!activeStudent) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setAiNotice({
        message: 'You are currently offline. Please connect to the internet and tap Retry to generate a live AI quiz.',
        type: 'error',
      });
      return;
    }

    audioFX.playClick();
    setIsGeneratingAI(true);
    setAiNotice(null);

    const targetSubject =
      preferredSubject ||
      assignedSubjects[Math.floor(Math.random() * assignedSubjects.length)];
    const candidateChapters = SUBJECT_CHAPTERS[targetSubject] || ['Core Principles'];
    const targetChapter = candidateChapters[Math.floor(Math.random() * candidateChapters.length)];

    // Collect recent question texts to avoid repetition
    const recentTitles = attempts.slice(-10).map((a) => a.quizTitle);

    try {
      const response = await fetch(resolveApiUrl('/api/gemini/quiz'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: targetSubject,
          stream: activeStudent.stream,
          chapter: targetChapter,
          chapters: [targetChapter],
          questionCount: 5,
          difficulty: 'Medium',
          questionType: 'mixed',
          studentName: activeStudent.name,
          assignedStudentIds: [activeStudent.id],
          assignedStudentNames: [activeStudent.name],
          assignmentMode: 'individual',
          recentQuestions: recentTitles,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `AI generation service returned HTTP ${response.status}`);
      }

      const data = await response.json();
      if (data.success && data.quiz) {
        const freshQuiz: Quiz = {
          ...data.quiz,
          isDraft: false,
          assignedStudentIds: [activeStudent.id],
          assignedStudentNames: [activeStudent.name],
          assignmentMode: 'individual',
          assignedAt: Date.now(),
        };
        await storage.saveQuiz(freshQuiz);
        setQuizzes((prev) => [freshQuiz, ...prev.filter((q) => q.id !== freshQuiz.id)]);
        audioFX.playSuccess();
        setAiNotice({
          message: `Generated fresh AI Quiz for ${activeStudent.name}: ${freshQuiz.title}`,
          type: 'success',
        });
      } else {
        throw new Error(data.error || 'Invalid AI response from server.');
      }
    } catch (err: any) {
      console.error('AI Quiz generation error:', err);
      audioFX.playError();
      setAiNotice({
        message: err?.message || 'AI Quiz generation failed. Please check your connection and tap Retry.',
        type: 'error',
      });
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const currentQ = activeQuiz ? activeQuiz.questions[currentQuestionIndex] : null;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 sm:p-6 rounded-2xl jarvis-panel border border-cyan-500/30">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 font-mono-code text-xs font-bold uppercase">
              MODULE 06
            </span>
            <span className="text-xs font-mono-code text-slate-400">SMART BOARD GAMIFICATION</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold font-hud text-white mt-1">
            QUIZ ARENA & PERSONALIZED CHALLENGES
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 font-sans mt-0.5">
            Personalized stream quizzes • Real-time XP & badges • CBSE syllabus mastery
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-2">
          <div className="flex items-center p-1 rounded-xl bg-slate-900 border border-cyan-500/20">
            <button
              onClick={() => {
                audioFX.playClick();
                setActiveTab('quizzes');
              }}
              className={`px-3 sm:px-4 py-2 rounded-lg font-hud text-xs font-bold transition ${
                activeTab === 'quizzes'
                  ? 'bg-cyan-500 text-black shadow-[0_0_12px_rgba(0,240,255,0.4)]'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              MY QUIZZES
            </button>
            <button
              onClick={() => {
                audioFX.playClick();
                setActiveTab('teacher_studio');
              }}
              className={`px-3 sm:px-4 py-2 rounded-lg font-hud text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === 'teacher_studio'
                  ? 'bg-cyan-500 text-black shadow-[0_0_12px_rgba(0,240,255,0.4)]'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span>TEACHER GENERATOR</span>
            </button>
            <button
              onClick={() => {
                audioFX.playClick();
                setActiveTab('leaderboard');
              }}
              className={`px-3 sm:px-4 py-2 rounded-lg font-hud text-xs font-bold transition ${
                activeTab === 'leaderboard'
                  ? 'bg-cyan-500 text-black shadow-[0_0_12px_rgba(0,240,255,0.4)]'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              LEADERBOARD
            </button>
            <button
              onClick={() => {
                audioFX.playClick();
                setActiveTab('history');
              }}
              className={`px-3 sm:px-4 py-2 rounded-lg font-hud text-xs font-bold transition ${
                activeTab === 'history'
                  ? 'bg-cyan-500 text-black shadow-[0_0_12px_rgba(0,240,255,0.4)]'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              HISTORY
            </button>
          </div>
        </div>
      </div>

      {/* STREAM-WISE STUDENT SELECTOR WITH AUTOCOMPLETE */}
      {!activeQuiz && (
        <div className="p-4 sm:p-5 rounded-2xl jarvis-panel border border-cyan-500/30 space-y-4">
          {/* Stream Filter Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-cyan-500/15">
            <span className="text-xs font-hud font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-cyan-400" />
              <span>Filter Students by Stream:</span>
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {(['ALL', 'PCM', 'PCB', 'COMMERCE', 'HUMANITIES'] as const).map((st) => {
                const active = selectedStudentStreamFilter === st;
                const count =
                  st === 'ALL'
                    ? students.length
                    : students.filter((s) => s.stream === st).length;
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => handleStreamFilterChange(st)}
                    className={`px-3 py-1 rounded-xl font-hud text-xs font-bold border transition cursor-pointer ${
                      active
                        ? 'bg-cyan-500 text-black border-cyan-400 shadow-[0_0_10px_rgba(0,240,255,0.3)]'
                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white hover:border-cyan-500/40'
                    }`}
                  >
                    {st} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {/* Input & Autocomplete */}
            <div className="flex-1 relative" ref={autocompleteRef}>
              <label
                htmlFor="student-name-input"
                className="block text-xs font-hud font-bold text-cyan-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5"
              >
                <User className="w-4 h-4 text-cyan-400" />
                <span>
                  Select Student{' '}
                  {selectedStudentStreamFilter !== 'ALL'
                    ? `(${selectedStudentStreamFilter} Stream Only)`
                    : '(All 21 Verified Class 11 Students)'}
                </span>
              </label>

              <div className="relative">
                <input
                  id="student-name-input"
                  type="text"
                  value={studentInput}
                  onChange={(e) => {
                    setStudentInput(e.target.value);
                    setIsAutocompleteOpen(true);
                  }}
                  onFocus={() => setIsAutocompleteOpen(true)}
                  placeholder="Enter Student Name (e.g. Vansh, Keshav, Dikshit, Arpit, Geetika...)"
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950/90 border border-cyan-500/40 text-white font-hud text-sm outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 pl-10"
                />
                <Search className="w-4 h-4 text-cyan-400/70 absolute left-3.5 top-3" />
                {studentInput && (
                  <button
                    onClick={() => {
                      setStudentInput('');
                      setIsAutocompleteOpen(true);
                    }}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Autocomplete Dropdown */}
              {isAutocompleteOpen && suggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-[#071126] border border-cyan-500/40 rounded-xl shadow-2xl z-30 max-h-60 overflow-y-auto divide-y divide-cyan-500/10">
                  {suggestions.map((s) => {
                    const stStyle = STREAM_STYLES[s.stream];
                    return (
                      <button
                        key={s.id}
                        onClick={() => {
                          audioFX.playClick();
                          setStudentInput(s.name);
                          setIsAutocompleteOpen(false);
                        }}
                        className="w-full px-4 py-2.5 flex items-center justify-between text-left hover:bg-cyan-950/50 transition cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="font-hud font-bold text-sm text-white">
                            {s.name}
                          </span>
                          <span className="text-[10px] font-mono-code text-slate-400">
                            ID: {s.id}
                          </span>
                        </div>
                        <span
                          className={`text-[10px] font-mono-code font-bold px-2 py-0.5 rounded border ${stStyle.badge}`}
                        >
                          {s.stream}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Stream-Filtered Student Pills */}
            <div className="flex items-center gap-1.5 flex-wrap max-w-xl">
              <span className="text-[11px] font-mono-code text-slate-400 mr-1">
                {selectedStudentStreamFilter === 'ALL'
                  ? 'Quick Select:'
                  : `${selectedStudentStreamFilter} Students:`}
              </span>
              {(selectedStudentStreamFilter === 'ALL'
                ? students.filter((s) =>
                    ['Vansh', 'Keshav', 'Dikshit', 'Arpit', 'Geetika', 'Riya'].includes(s.name)
                  )
                : streamFilteredStudents
              ).map((stObj) => (
                <button
                  key={stObj.id}
                  onClick={() => {
                    audioFX.playClick();
                    setStudentInput(stObj.name);
                    setIsAutocompleteOpen(false);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-hud font-semibold transition cursor-pointer ${
                    activeStudent?.id === stObj.id
                      ? 'bg-cyan-500 text-black shadow-[0_0_10px_rgba(0,240,255,0.4)]'
                      : 'bg-slate-900/80 border border-cyan-500/20 text-slate-300 hover:text-white hover:border-cyan-400/50'
                  }`}
                >
                  {stObj.name}
                </button>
              ))}
            </div>
          </div>

          {/* Student Status & Verified Stream Identity Card */}
          {activeStudent ? (
            <div className="p-4 rounded-xl bg-slate-950/80 border border-cyan-500/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-mono-code text-slate-400">Active Student:</span>
                  <strong className="text-base font-hud font-bold text-white tracking-wide">
                    {activeStudent.name}
                  </strong>
                  <span className="text-xs font-mono-code text-slate-500">
                    ({activeStudent.id})
                  </span>
                  <span
                    className={`text-xs font-mono-code font-bold px-2.5 py-0.5 rounded border ${
                      STREAM_STYLES[activeStudent.stream].badge
                    }`}
                  >
                    STREAM: {activeStudent.stream}
                  </span>
                </div>

                {/* Assigned Subjects */}
                <div className="flex items-center gap-1.5 flex-wrap text-xs">
                  <span className="text-slate-400 font-mono-code">Assigned Subjects:</span>
                  {assignedSubjects.map((sub) => (
                    <span
                      key={sub}
                      className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-200 font-medium"
                    >
                      {sub}
                    </span>
                  ))}
                  <span className="text-[11px] text-cyan-400/80 font-mono-code">
                    • Locked by Class 11 Registry
                  </span>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => {
                    audioFX.playClick();
                    setActiveTab('teacher_studio');
                  }}
                  className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-purple-950/40 border border-purple-500/40 hover:border-purple-400 text-purple-300 hover:text-white font-hud text-xs font-bold transition cursor-pointer"
                  title="Open Teacher AI Quiz Studio"
                >
                  <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                  <span>TEACHER STUDIO</span>
                </button>

                <button
                  onClick={() => handleGenerateFreshAIQuiz()}
                  disabled={isGeneratingAI}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500/20 via-blue-500/20 to-purple-500/20 border border-cyan-400/50 hover:border-cyan-300 text-cyan-300 hover:text-white font-hud text-xs font-bold transition shadow-[0_0_15px_rgba(0,240,255,0.2)] disabled:opacity-50 cursor-pointer"
                >
                  {isGeneratingAI ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                  )}
                  <span>{isGeneratingAI ? 'GENERATING WITH GEMINI...' : 'GENERATE FRESH AI QUIZ'}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-500/40 flex items-start gap-3 text-amber-200">
              <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-hud font-bold text-sm text-amber-300">
                  Student Not Found in Class 11 Records
                </h4>
                <p className="text-xs text-amber-200/90 mt-0.5">
                  Please enter a valid student name from the Class 11th roster (e.g., Vansh, Keshav, Dikshit, Arpit, Geetika, Harshita, Diya, Riya) to load personalized stream quizzes.
                </p>
              </div>
            </div>
          )}

          {/* AI Generation Notification / Error Banner with Retry */}
          {aiNotice && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                aiNotice.type === 'success'
                  ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                  : aiNotice.type === 'error'
                  ? 'bg-red-950/40 border-red-500/40 text-red-200'
                  : 'bg-cyan-950/40 border-cyan-500/40 text-cyan-300'
              }`}
            >
              <div className="flex items-center gap-2">
                {aiNotice.type === 'error' ? (
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                ) : (
                  <Sparkles className="w-4 h-4 shrink-0" />
                )}
                <span>{aiNotice.message}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {aiNotice.type === 'error' && (
                  <button
                    type="button"
                    onClick={() => handleGenerateFreshAIQuiz()}
                    disabled={isGeneratingAI}
                    className="px-3 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-400/50 text-red-200 hover:text-white font-hud font-bold text-xs flex items-center gap-1 transition cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>RETRY</span>
                  </button>
                )}
                <button
                  onClick={() => setAiNotice(null)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ACTIVE QUIZ PLAY ARENA */}
      {activeQuiz && !quizFinished && currentQ && (
        <div className="p-5 sm:p-8 rounded-3xl jarvis-panel border border-cyan-500/40 space-y-6 animate-in fade-in">
          {/* Quiz Play Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-cyan-500/20">
            <div className="flex items-center gap-3">
              <UniversalBackButton
                label="EXIT QUIZ"
                sublabel="Back to Quizzes"
                onClick={() => {
                  audioFX.playClick();
                  setActiveQuiz(null);
                }}
                className="py-1.5 min-h-[38px] text-xs"
              />
              <span className="px-3 py-1 rounded-lg bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 font-mono-code text-xs font-bold">
                QUESTION {currentQuestionIndex + 1} OF {activeQuiz.questions.length}
              </span>
              <span className="text-sm font-hud font-bold text-white hidden md:inline">
                {activeQuiz.title}
              </span>
            </div>

            {/* Timer and Active Student */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-cyan-500/30 text-xs font-mono-code text-cyan-400">
                <Clock className="w-3.5 h-3.5 animate-pulse" />
                <span>{questionTimeRemaining}s remaining</span>
              </div>

              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-950/40 border border-cyan-500/30 text-xs font-hud font-bold text-slate-200">
                <User className="w-3.5 h-3.5 text-cyan-400" />
                <span>Scholar: {activeStudent?.name || 'Class 11'}</span>
              </div>

              <button
                onClick={() => setActiveQuiz(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                title="Cancel Quiz"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Question Body */}
          {(() => {
            const isSubjectiveOrCaseStudy =
              currentQ.questionType === 'case_study' ||
              currentQ.questionType === 'short_2' ||
              currentQ.questionType === 'short_3' ||
              currentQ.questionType === 'long_5' ||
              !currentQ.options ||
              currentQ.options.length === 0;

            if (isSubjectiveOrCaseStudy) {
              return (
                <div className="space-y-4">
                  {/* Question format tag & Marks */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="px-2.5 py-1 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 text-xs font-mono-code font-bold uppercase">
                      {currentQ.questionType === 'case_study'
                        ? 'SECTION D: CASE STUDY'
                        : currentQ.questionType === 'short_2'
                        ? 'SECTION B: SHORT ANSWER'
                        : currentQ.questionType === 'short_3'
                        ? 'SECTION C: SHORT ANSWER'
                        : currentQ.questionType === 'long_5'
                        ? 'SECTION E: LONG ANSWER'
                        : 'WRITTEN ASSESSMENT'}
                    </span>
                    <span className="px-3 py-1 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono-code text-xs font-bold">
                      {currentQ.marks ||
                        (currentQ.questionType === 'case_study'
                          ? 4
                          : currentQ.questionType === 'long_5'
                          ? 5
                          : currentQ.questionType === 'short_3'
                          ? 3
                          : 2)}{' '}
                      Marks
                    </span>
                  </div>

                  {/* Case Study Passage if available */}
                  {currentQ.casePassage && (
                    <div className="p-4 sm:p-5 rounded-2xl bg-cyan-950/30 border border-cyan-500/40 space-y-2">
                      <div className="flex items-center gap-2 text-xs font-hud font-bold text-cyan-300 uppercase tracking-wider">
                        <BookOpen className="w-4 h-4 text-cyan-400" />
                        <span>Case Scenario / Source Passage:</span>
                      </div>
                      <p className="text-xs sm:text-sm text-slate-200 font-sans leading-relaxed whitespace-pre-line pl-2 border-l-2 border-cyan-400">
                        {currentQ.casePassage}
                      </p>
                    </div>
                  )}

                  {/* Question Statement */}
                  <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800">
                    <h3 className="text-base sm:text-xl font-hud font-bold text-white leading-relaxed">
                      {currentQ.question}
                    </h3>
                  </div>

                  {/* Subquestions if case study */}
                  {currentQ.subQuestions && currentQ.subQuestions.length > 0 && (
                    <div className="space-y-3">
                      <span className="text-xs font-mono-code text-slate-400 uppercase tracking-wider">
                        Sub-Questions:
                      </span>
                      {currentQ.subQuestions.map((sq, sIdx) => (
                        <div
                          key={sq.id || sIdx}
                          className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-700 space-y-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-2">
                              <span className="px-1.5 py-0.5 rounded bg-black text-cyan-400 font-mono-code text-[11px] font-bold">
                                ({String.fromCharCode(105 + sIdx)})
                              </span>
                              <p className="text-xs sm:text-sm text-white font-sans">{sq.question}</p>
                            </div>
                            <span className="px-2 py-0.5 rounded bg-black/40 text-[10px] font-mono-code text-cyan-300 shrink-0">
                              {sq.marks || 1} M
                            </span>
                          </div>

                          {/* Model answer if toggled */}
                          {showSubjectiveSolution && sq.modelAnswer && (
                            <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-xs font-sans text-emerald-200">
                              <strong className="text-emerald-400 font-mono-code uppercase mr-1">
                                Key / Solution:
                              </strong>
                              {sq.modelAnswer}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Smart Board Rough Work / Working Notes */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-hud font-bold text-slate-300 uppercase tracking-wider">
                        Smart Board Rough Work & Discussion Notes
                      </label>
                      <span className="text-[10px] font-mono-code text-slate-400">
                        Classroom Scratchpad
                      </span>
                    </div>
                    <textarea
                      rows={3}
                      value={scratchpadText}
                      onChange={(e) => setScratchpadText(e.target.value)}
                      placeholder="Type student reasoning, formulas, or rough calculation working here..."
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono-code text-xs focus:border-cyan-400 outline-none"
                    />
                  </div>

                  {/* Marking Scheme Toggle Button */}
                  <div className="flex items-center justify-between gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        audioFX.playClick();
                        setShowSubjectiveSolution(!showSubjectiveSolution);
                      }}
                      className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-purple-950/40 border border-purple-500/40 hover:border-purple-400 text-purple-300 text-xs font-hud font-bold transition cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                      <span>
                        {showSubjectiveSolution
                          ? 'HIDE MARKING SCHEME'
                          : 'VIEW TEACHER MARKING SCHEME & RUBRIC'}
                      </span>
                    </button>
                  </div>

                  {/* Revealed Marking Scheme Box */}
                  {showSubjectiveSolution && (
                    <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/40 text-xs sm:text-sm text-emerald-200 font-sans space-y-2 animate-in fade-in">
                      <div className="font-hud font-bold text-emerald-300 uppercase tracking-wide flex items-center gap-1.5">
                        <CheckCircle className="w-4 h-4 text-emerald-400" />
                        <span>Official NCERT Solution / Marking Criteria:</span>
                      </div>
                      <p className="whitespace-pre-line leading-relaxed">
                        {currentQ.modelAnswer ||
                          currentQ.rubric ||
                          currentQ.explanation ||
                          'Refer to CBSE NCERT standard marking key.'}
                      </p>
                    </div>
                  )}
                </div>
              );
            }

            return (
              <div className="space-y-4">
                {/* Question Text */}
                <div className="py-2">
                  <h3 className="text-lg sm:text-2xl font-hud font-bold text-white leading-relaxed">
                    {currentQ.question}
                  </h3>
                </div>

                {/* Options Grid (Large Touch Targets for Smart Board) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {(currentQ.options || []).map((opt, idx) => {
                    const isSelected = selectedOption === idx;
                    const isCorrectAnswer = isMCQAnswerCorrect(currentQ, idx);

                    let style =
                      'bg-slate-900/60 border-slate-700 text-slate-200 hover:border-cyan-400/60';
                    if (isAnswerSubmitted) {
                      if (isCorrectAnswer) {
                        style =
                          'bg-emerald-950/50 border-emerald-400 text-emerald-200 shadow-[0_0_20px_rgba(16,185,129,0.3)] font-bold';
                      } else if (isSelected && !isCorrectAnswer) {
                        style = 'bg-red-950/50 border-red-500 text-red-200 font-bold';
                      } else {
                        style = 'bg-slate-900/40 border-slate-800 text-slate-500 opacity-60';
                      }
                    } else if (isSelected) {
                      style =
                        'bg-cyan-500/20 border-cyan-400 text-cyan-200 shadow-[0_0_15px_rgba(0,240,255,0.25)] font-bold';
                    }

                    return (
                      <button
                        key={idx}
                        disabled={isAnswerSubmitted}
                        onClick={() => {
                          audioFX.playClick();
                          setSelectedOption(idx);
                        }}
                        className={`p-4 sm:p-5 rounded-2xl border text-left flex items-center justify-between gap-3 text-sm sm:text-base font-sans transition-all duration-200 ${style}`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-8 h-8 rounded-xl bg-black/40 border border-cyan-500/30 flex items-center justify-center font-mono-code font-bold text-xs shrink-0 text-cyan-300">
                            {String.fromCharCode(65 + idx)}
                          </span>
                          <span>{opt}</span>
                        </div>

                        {isAnswerSubmitted && isCorrectAnswer && (
                          <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
                        )}
                        {isAnswerSubmitted && isSelected && !isCorrectAnswer && (
                          <XCircle className="w-5 h-5 text-red-400 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Explanation Banner when answered */}
                {isAnswerSubmitted && (
                  <div className="p-4 rounded-xl bg-cyan-950/30 border border-cyan-500/30 text-xs sm:text-sm text-slate-300 font-sans animate-in fade-in">
                    <strong className="text-cyan-400 font-hud uppercase mr-2">Explanation:</strong>
                    {currentQ.explanation}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Action Bar */}
          <div className="flex items-center justify-between pt-4 border-t border-cyan-500/20">
            <div className="flex items-center gap-2">
              {currentQuestionIndex > 0 && (
                <button
                  type="button"
                  onClick={handlePrevQuestion}
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 font-hud text-xs font-bold transition cursor-pointer"
                >
                  PREVIOUS
                </button>
              )}
              <span className="text-xs font-mono-code text-slate-400 hidden sm:inline">
                {currentQ.questionType === 'case_study' ||
                currentQ.questionType === 'short_2' ||
                currentQ.questionType === 'short_3' ||
                currentQ.questionType === 'long_5'
                  ? 'Board Solving & Marking Scheme'
                  : '10 Points per question • Speed bonus available'}
              </span>
            </div>

            <div>
              {currentQ.questionType !== 'case_study' &&
              currentQ.questionType !== 'short_2' &&
              currentQ.questionType !== 'short_3' &&
              currentQ.questionType !== 'long_5' &&
              currentQ.options &&
              currentQ.options.length > 0 &&
              !isAnswerSubmitted ? (
                <button
                  onClick={() => handleSubmitAnswer(false)}
                  disabled={selectedOption === null}
                  className="px-6 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-hud text-xs sm:text-sm font-bold shadow-[0_0_15px_rgba(0,240,255,0.3)] disabled:opacity-40 transition cursor-pointer"
                >
                  LOCK ANSWER
                </button>
              ) : (
                <button
                  onClick={handleNextQuestion}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:brightness-110 text-white font-hud text-xs sm:text-sm font-bold shadow-[0_0_20px_rgba(0,240,255,0.4)] transition cursor-pointer"
                >
                  {currentQuestionIndex + 1 < activeQuiz.questions.length
                    ? 'NEXT QUESTION'
                    : 'FINISH ASSESSMENT'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* QUIZ COMPLETION SUMMARY CARD */}
      {quizFinished && lastResult && (
        <div className="p-6 sm:p-10 rounded-3xl jarvis-panel border border-cyan-500/50 text-center space-y-6 animate-in zoom-in-95">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-cyan-500/20 border border-cyan-400 text-cyan-300 shadow-[0_0_30px_rgba(0,240,255,0.4)] mb-2">
            <Trophy className="w-10 h-10" />
          </div>

          <div>
            <h3 className="font-hud font-black text-2xl sm:text-3xl text-white">
              CHALLENGE COMPLETED
            </h3>
            <p className="text-sm font-mono-code text-cyan-300 mt-1">
              {lastResult.studentName} — {lastResult.quizTitle}
            </p>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl mx-auto">
            <div className="p-3.5 rounded-xl bg-slate-900 border border-cyan-500/20">
              <div className="text-[11px] font-mono-code text-slate-400 uppercase">Score</div>
              <div className="font-hud font-bold text-xl text-white mt-1">
                {lastResult.score} pts
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900 border border-cyan-500/20">
              <div className="text-[11px] font-mono-code text-slate-400 uppercase">Accuracy</div>
              <div className="font-hud font-bold text-xl text-cyan-300 mt-1">
                {lastResult.accuracy}%
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900 border border-cyan-500/20">
              <div className="text-[11px] font-mono-code text-slate-400 uppercase">Time Spent</div>
              <div className="font-hud font-bold text-xl text-purple-300 mt-1">
                {lastResult.timeSpentSeconds}s
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900 border border-cyan-500/20">
              <div className="text-[11px] font-mono-code text-slate-400 uppercase">XP Earned</div>
              <div className="font-hud font-bold text-xl text-amber-400 mt-1 flex items-center justify-center gap-1">
                <Zap className="w-4 h-4 fill-current" />
                <span>+{lastResult.xpEarned}</span>
              </div>
            </div>
          </div>

          {/* Unlocked Badges */}
          {newlyUnlockedBadges.length > 0 && (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-400/40 max-w-md mx-auto space-y-2">
              <div className="font-hud font-bold text-xs uppercase tracking-wider text-amber-300 flex items-center justify-center gap-1.5">
                <Sparkles className="w-4 h-4" />
                <span>New Achievements Unlocked!</span>
              </div>
              <div className="flex items-center justify-center gap-3">
                {newlyUnlockedBadges.map((badge) => (
                  <div key={badge.id} className="text-center">
                    <span className="text-2xl">{badge.icon}</span>
                    <div className="text-[11px] font-hud font-bold text-white mt-1">
                      {badge.name}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Question-by-Question Validated Answer Key & Review */}
          {activeQuiz && activeQuiz.questions.length > 0 && (
            <div className="max-w-3xl mx-auto text-left space-y-3 pt-2">
              <div className="font-hud font-bold text-xs uppercase tracking-wider text-cyan-300 flex items-center justify-between border-b border-cyan-500/20 pb-2">
                <span>Answer Key & Explanation Review</span>
                <span className="text-[11px] font-mono-code text-slate-400">
                  {activeQuiz.questions.length} Questions
                </span>
              </div>
              <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1 custom-scrollbar">
                {activeQuiz.questions.map((q, qIdx) => {
                  const chosenIdx = lastResult.userAnswers?.[qIdx] ?? userAnswers[qIdx] ?? -1;
                  const optionsList = Array.isArray(q.options) ? q.options : [];
                  const isMcq = optionsList.length > 0;
                  const wasCorrect = isMcq ? isMCQAnswerCorrect(q, chosenIdx) : true;
                  const correctIdx = isMcq
                    ? optionsList.findIndex((_, idx) => isMCQAnswerCorrect(q, idx))
                    : -1;
                  const resolvedCorrectIdx =
                    correctIdx >= 0
                      ? correctIdx
                      : typeof q.correctIndex === 'number'
                      ? q.correctIndex
                      : -1;

                  return (
                    <div
                      key={q.id || qIdx}
                      className={`p-3.5 rounded-xl border text-xs space-y-1.5 ${
                        wasCorrect
                          ? 'bg-emerald-950/25 border-emerald-500/35'
                          : 'bg-red-950/25 border-red-500/35'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-hud font-bold text-white">
                          Q{qIdx + 1}. {q.question}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded font-mono-code text-[10px] font-bold shrink-0 ${
                            wasCorrect
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-red-500/20 text-red-300'
                          }`}
                        >
                          {wasCorrect ? 'CORRECT' : chosenIdx === -1 ? 'UNANSWERED' : 'INCORRECT'}
                        </span>
                      </div>
                      {isMcq && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 font-mono-code text-[11px]">
                          <div className="text-slate-300">
                            <span className="text-slate-400">Your Answer: </span>
                            {chosenIdx >= 0 && optionsList[chosenIdx] ? (
                              <span className={wasCorrect ? 'text-emerald-300 font-bold' : 'text-red-300 font-bold'}>
                                ({String.fromCharCode(65 + chosenIdx)}) {optionsList[chosenIdx]}
                              </span>
                            ) : (
                              <span className="text-amber-300">Skipped / Timeout</span>
                            )}
                          </div>
                          <div className="text-emerald-300">
                            <span className="text-slate-400">Correct Answer: </span>
                            {resolvedCorrectIdx >= 0 && optionsList[resolvedCorrectIdx] ? (
                              <span className="font-bold">
                                ({String.fromCharCode(65 + resolvedCorrectIdx)}) {optionsList[resolvedCorrectIdx]}
                              </span>
                            ) : (
                              <span>See Explanation</span>
                            )}
                          </div>
                        </div>
                      )}
                      {q.explanation && (
                        <div className="text-[11px] text-slate-300 pt-1 border-t border-white/10">
                          <strong className="text-cyan-400 font-mono-code">Explanation: </strong>
                          {q.explanation}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Replay, Leaderboard, or Back Actions */}
          <div className="flex items-center justify-center gap-3 flex-wrap pt-4">
            <button
              onClick={() => activeQuiz && handleStartQuiz(activeQuiz)}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-hud text-xs sm:text-sm font-bold shadow-[0_0_20px_rgba(0,240,255,0.4)] transition cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>REPLAY QUIZ</span>
            </button>
            <button
              onClick={() => {
                audioFX.playClick();
                setActiveQuiz(null);
                setQuizFinished(false);
                setActiveTab('leaderboard');
              }}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-hud text-xs sm:text-sm font-bold shadow-[0_0_20px_rgba(168,85,247,0.35)] transition cursor-pointer"
            >
              <Trophy className="w-4 h-4" />
              <span>VIEW LEADERBOARD</span>
            </button>
            <button
              onClick={() => {
                setActiveQuiz(null);
                setQuizFinished(false);
              }}
              className="px-6 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-hud text-xs sm:text-sm font-bold transition cursor-pointer"
            >
              RETURN TO ARENA
            </button>
          </div>
        </div>
      )}

      {/* 3 TO 4 RELEVANT QUIZZES FOR ACTIVE STUDENT */}
      {activeTab === 'quizzes' && !activeQuiz && (
        <div className="space-y-4">
          {activeStudent ? (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-hud font-bold text-sm text-cyan-300 uppercase tracking-wider flex items-center gap-2">
                  <BookOpen className="w-4 h-4" />
                  <span>Available Quizzes for {activeStudent.name} ({studentQuizzes.length})</span>
                </h3>
                <span className="text-xs font-mono-code text-slate-400">
                  Strictly mapped to {activeStudent.stream} subjects
                </span>
              </div>

              {studentQuizzes.length === 0 ? (
                <div className="p-8 rounded-2xl jarvis-panel border border-cyan-500/20 text-center text-slate-400">
                  <p className="text-sm font-hud">No quizzes currently found for assigned subjects.</p>
                  <button
                    onClick={() => handleGenerateFreshAIQuiz()}
                    className="mt-3 px-4 py-2 rounded-xl bg-cyan-500 text-black font-hud font-bold text-xs"
                  >
                    Generate AI Quiz for {activeStudent.stream}
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {studentQuizzes.map((quiz) => {
                    const isAi = quiz.source === 'ai';
                    const isExplicitlyAssigned =
                      Array.isArray(quiz.assignedStudentIds) &&
                      quiz.assignedStudentIds.includes(activeStudent.id);
                    const diff = quiz.difficulty || 'Intermediate';
                    const diffColor =
                      diff === 'Advanced'
                        ? 'text-purple-300 border-purple-500/40 bg-purple-500/10'
                        : diff === 'Foundation'
                        ? 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10'
                        : 'text-cyan-300 border-cyan-500/40 bg-cyan-500/10';

                    return (
                      <div
                        key={quiz.id}
                        className="p-5 rounded-2xl jarvis-panel border border-cyan-500/30 hover:border-cyan-400/60 transition flex flex-col justify-between group shadow-lg"
                      >
                        <div>
                          {/* Subject & Difficulty Header */}
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-1.5">
                              <span className="px-2.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-400/30 text-cyan-300 text-[10px] font-mono-code font-bold uppercase tracking-wider">
                                {quiz.subject}
                              </span>
                              {isExplicitlyAssigned && (
                                <span className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-[9px] font-mono-code font-bold uppercase">
                                  ASSIGNED TO YOU
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`px-2 py-0.5 rounded border text-[10px] font-mono-code font-bold uppercase ${diffColor}`}
                              >
                                {diff}
                              </span>
                              {quiz.source === 'teacher' ? (
                                <span className="px-2 py-0.5 rounded bg-purple-500/20 border border-purple-400/40 text-purple-300 text-[9px] font-mono-code font-bold flex items-center gap-1">
                                  <Sparkles className="w-2.5 h-2.5 text-purple-400" /> TEACHER ({quiz.createdBy || 'Class 11'})
                                </span>
                              ) : isAi ? (
                                <span className="px-2 py-0.5 rounded bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 text-[9px] font-mono-code font-bold flex items-center gap-1">
                                  <Sparkles className="w-2.5 h-2.5 text-cyan-400" /> AI
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 text-[9px] font-mono-code">
                                  CBSE BANK
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Quiz Title */}
                          <h3 className="font-hud font-bold text-base sm:text-lg text-white mt-2 group-hover:text-cyan-200 transition">
                            {quiz.title}
                          </h3>

                          {/* Chapter / Topic */}
                          {quiz.chapter && (
                            <p className="text-xs font-mono-code text-cyan-400/90 mt-1 flex items-center gap-1">
                              <Layers className="w-3 h-3 shrink-0" />
                              <span>{quiz.chapter}</span>
                            </p>
                          )}

                          {/* Description */}
                          <p className="text-xs text-slate-400 font-sans mt-1.5 line-clamp-2">
                            {quiz.description}
                          </p>
                        </div>

                        {/* Metadata Footer & Start Quiz Button */}
                        <div className="mt-5 pt-4 border-t border-cyan-500/15 flex items-center justify-between gap-2">
                          <div className="text-[11px] font-mono-code text-slate-400 flex items-center gap-3">
                            <span>{quiz.questions.length} Questions</span>
                            <span className="flex items-center gap-1 text-slate-400">
                              <Clock className="w-3 h-3 text-cyan-400" />
                              <span>{quiz.questions.length * 25}s</span>
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            {(quiz.isQuestionPaper || !!quiz.paperConfig) && (
                              <button
                                type="button"
                                onClick={() => {
                                  audioFX.playClick();
                                  setPaperToPreview(quiz);
                                }}
                                className="flex items-center gap-1 px-2.5 py-2 rounded-xl bg-purple-950/40 hover:bg-purple-900/50 border border-purple-500/40 text-purple-300 hover:text-white font-hud text-xs font-bold transition cursor-pointer"
                                title="View & Print Official CBSE Question Paper"
                              >
                                <FileText className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">PAPER</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleStartQuiz(quiz)}
                              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500/20 to-blue-500/20 hover:from-cyan-500/30 hover:to-blue-500/30 border border-cyan-400/60 text-cyan-300 hover:text-white font-hud text-xs font-bold transition shadow-[0_0_12px_rgba(0,240,255,0.25)] cursor-pointer"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                              <span>START QUIZ</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="p-8 rounded-2xl jarvis-panel border border-slate-800 text-center text-slate-400">
              <Lock className="w-6 h-6 text-slate-500 mx-auto mb-2" />
              <p className="text-sm font-hud text-slate-300">
                Please enter a valid student name above to reveal personalized quizzes.
              </p>
            </div>
          )}
        </div>
      )}

      {/* COMPLETE LEADERBOARD + LOCAL PERSISTENCE TAB */}
      {activeTab === 'leaderboard' && !activeQuiz && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <UniversalBackButton
              label="BACK TO PRACTICE QUIZZES"
              onClick={() => setActiveTab('quizzes')}
            />
          </div>
          <QuizLeaderboardPanel
            students={students}
            quizzes={quizzes}
            attempts={attempts}
            activeStudent={activeStudent}
            filters={leaderboardFilters}
            persistenceStatus={persistenceStatus}
            badgesCatalog={BADGES_CATALOG}
            onUpdateFilters={handleUpdateLeaderboardFilters}
            onSyncNow={handleSyncLeaderboardNow}
            onExportBackup={handleExportLeaderboardBackup}
            onImportBackup={handleImportLeaderboardBackup}
            onSwitchToQuizzesTab={() => setActiveTab('quizzes')}
            onSelectStudent={(name) => {
              audioFX.playClick();
              setStudentInput(name);
            }}
          />
        </div>
      )}

      {/* HISTORY TAB */}
      {activeTab === 'history' && !activeQuiz && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <UniversalBackButton
              label="BACK TO PRACTICE QUIZZES"
              onClick={() => setActiveTab('quizzes')}
            />
          </div>
          <div className="p-4 sm:p-5 rounded-2xl jarvis-panel border border-cyan-500/20">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-hud font-bold text-sm text-cyan-300 uppercase">
                {activeStudent
                  ? `Quiz Attempts History for ${activeStudent.name}`
                  : `All Recorded Quiz Attempts (${attempts.length})`}
              </h3>
              <span className="text-xs font-mono-code text-slate-400">
                Persisted in IndexedDB v2
              </span>
            </div>

            {attempts.length === 0 ? (
              <div className="text-center py-8 text-xs font-mono-code text-slate-400">
                No historical quiz attempts recorded yet.
              </div>
            ) : (
              <div className="space-y-2">
                {attempts
                  .filter((att) =>
                    activeStudent ? att.studentName.toLowerCase() === activeStudent.name.toLowerCase() : true
                  )
                  .map((att) => (
                    <div
                      key={att.id}
                      className="p-3.5 rounded-xl bg-slate-950/60 border border-cyan-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs font-mono-code"
                    >
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-hud font-bold text-white text-sm">
                            {att.studentName} — {att.quizTitle}
                          </span>
                          {att.stream && (
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded border font-bold ${
                                STREAM_STYLES[att.stream]?.badge || ''
                              }`}
                            >
                              {att.stream}
                            </span>
                          )}
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded border ${
                              att.synced
                                ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300'
                                : 'bg-cyan-950/50 border-cyan-500/40 text-cyan-300'
                            }`}
                          >
                            {att.synced ? 'Synced' : 'Saved on device'}
                          </span>
                        </div>
                        <div className="text-slate-400 mt-0.5">
                          Score: {att.score} pts ({att.correctAnswers}/{att.totalQuestions} correct • {att.accuracy}%) • Time: {att.timeSpentSeconds}s • Completed:{' '}
                          {new Date(att.completedAt || att.timestamp).toLocaleString()}
                        </div>
                      </div>

                      <div className="text-amber-400 font-hud font-bold text-sm shrink-0">
                        +{att.xpEarned} XP
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TEACHER QUIZ GENERATOR STUDIO TAB */}
      {activeTab === 'teacher_studio' && !activeQuiz && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <UniversalBackButton
              label="BACK TO PRACTICE QUIZZES"
              onClick={() => setActiveTab('quizzes')}
            />
          </div>
          <TeacherQuizGenerator
            onQuizGeneratedForReview={handleOpenReview}
            savedQuizzes={quizzes.filter((q) => q.source === 'teacher' || q.source === 'ai' || q.createdBy)}
            onDeleteQuiz={handleDeleteQuiz}
            onPublishQuiz={handlePublishQuiz}
            onStartQuiz={handleStartQuiz}
          />
        </div>
      )}

      {/* TEACHER REVIEW & EDIT MODAL */}
      {reviewQuiz && (
        <TeacherQuizReviewModal
          quiz={reviewQuiz}
          isOpen={isReviewOpen}
          onClose={() => {
            setIsReviewOpen(false);
            setReviewQuiz(null);
          }}
          onSaveDraft={handleSaveDraft}
          onPublish={handlePublishQuiz}
          onRegenerateFullQuiz={handleRegenerateFullQuiz}
        />
      )}

      {/* DIRECT QUESTION PAPER PREVIEW MODAL */}
      {paperToPreview && (
        <QuestionPaperPreviewModal
          quiz={paperToPreview}
          isOpen={!!paperToPreview}
          onClose={() => setPaperToPreview(null)}
        />
      )}
    </div>
  );
};
