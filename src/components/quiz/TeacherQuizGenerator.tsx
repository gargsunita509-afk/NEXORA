import React, { useState, useEffect, useMemo } from 'react';
import {
  Sparkles,
  Layers,
  BookOpen,
  Sliders,
  Check,
  CheckSquare,
  Square,
  Search,
  RefreshCw,
  AlertCircle,
  HelpCircle,
  Cpu,
  UserCheck,
  UserX,
  Users,
  FileText,
  Play,
  Edit3,
  Trash2,
  Send,
  Eye,
  CheckCircle,
  Plus,
  Minus,
  ChevronDown,
  ChevronUp,
  Award,
  Calendar,
  Clock,
  Printer,
  Copy,
  Download,
} from 'lucide-react';
import {
  StreamType,
  Quiz,
  QuizDifficulty,
  QuestionType,
  Student,
  AttendanceStatus,
  StudentSelectionMode,
} from '../../types';
import {
  getSubjectsForStream,
  getChaptersForSubject,
  getSubjectClassLevel,
  getSubjectCurriculum,
  CURRENT_ACADEMIC_SESSION,
  ChapterInfo,
} from '../../data/cbseSyllabus';
import { storage } from '../../services/storage';
import { resolveApiUrl } from '../../services/updateService';
import { apkAwareFetch as fetch } from '../../services/apkApiBridge';
import { getLocalDateString } from '../../utils/diaryHelper';
import { audioFX } from '../../services/audio';
import { OfflineWarningModal } from '../OfflineWarningModal';
import { QuestionPaperPreviewModal } from './QuestionPaperPreviewModal';
import { EnglishQuestionPaperGenerator } from './EnglishQuestionPaperGenerator';
import { downloadQuestionPaperPdf } from '../../utils/pdfGenerator';

interface TeacherQuizGeneratorProps {
  onQuizGeneratedForReview: (quiz: Quiz) => void;
  savedQuizzes: Quiz[];
  onDeleteQuiz: (id: string) => Promise<void>;
  onPublishQuiz: (quiz: Quiz) => Promise<void>;
  onStartQuiz: (quiz: Quiz) => void;
}

// Authoritative Subject-to-Teacher Directory
export const SUBJECT_TO_TEACHER_MAPPING: Record<string, string> = {
  Physics: 'Diksha Mam',
  Chemistry: 'Harshu Mam',
  Mathematics: 'Anita Mam',
  English: 'Nancy Mam',
  Economics: 'Alka Mam',
  'Political Science': 'Ritu Mam',
  History: 'Ritu Mam',
  'Business Studies': 'Alka Mam',
  Accountancy: 'Alka Mam',
  Biology: 'Shalini Mam',
};

// Complete list of authorized teachers (including Harshu Mam and Nancy Mam)
export const AUTHORITATIVE_TEACHER_LIST: string[] = [
  'Diksha Mam',
  'Harshu Mam',
  'Anita Mam',
  'Nancy Mam',
  'Alka Mam',
  'Parul Mam',
  'Ritu Mam',
  'Shalini Mam',
];

const STREAM_CONFIG: Record<
  StreamType,
  { label: string; defaultTeacher: string; border: string; bg: string; text: string; badge: string }
> = {
  PCM: {
    label: 'PCM (Physics, Chem, Math)',
    defaultTeacher: 'Diksha Mam',
    border: 'border-cyan-500/40',
    bg: 'bg-cyan-950/20',
    text: 'text-cyan-300',
    badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-400/40',
  },
  PCB: {
    label: 'PCB (Physics, Chem, Biology)',
    defaultTeacher: 'Shalini Mam',
    border: 'border-emerald-500/40',
    bg: 'bg-emerald-950/20',
    text: 'text-emerald-300',
    badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40',
  },
  HUMANITIES: {
    label: 'Humanities (Pol Sci, History, Geo)',
    defaultTeacher: 'Ritu Mam',
    border: 'border-purple-500/40',
    bg: 'bg-purple-950/20',
    text: 'text-purple-300',
    badge: 'bg-purple-500/20 text-purple-300 border-purple-400/40',
  },
  COMMERCE: {
    label: 'Commerce (Accounts, BST, Eco)',
    defaultTeacher: 'Alka Mam',
    border: 'border-amber-500/40',
    bg: 'bg-amber-950/20',
    text: 'text-amber-300',
    badge: 'bg-amber-500/20 text-amber-300 border-amber-400/40',
  },
};

const DIFFICULTY_OPTIONS: { id: QuizDifficulty; label: string; desc: string }[] = [
  { id: 'Easy', label: 'Easy', desc: 'Direct NCERT definitions & formulas' },
  { id: 'Medium', label: 'Medium', desc: 'Standard application & conceptual problems' },
  { id: 'Hard', label: 'Hard', desc: 'Exemplar & higher-order analytical problems' },
  { id: 'Mixed', label: 'Mixed Difficulty', desc: 'Balanced CBSE exam paper distribution' },
];

const SPEED_QUESTION_TYPES: { id: QuestionType; label: string; desc: string }[] = [
  { id: 'mcq', label: 'Standard MCQs', desc: 'Single-correct 4-choice questions' },
  { id: 'numerical', label: 'Numerical Problems', desc: 'Calculation-based questions with verified values' },
  { id: 'conceptual', label: 'Conceptual Focus', desc: 'Theory & core foundational reasoning' },
  { id: 'assertion_reason', label: 'Assertion & Reason', desc: 'Statement I & Statement II evaluation' },
  { id: 'mixed', label: 'Mixed Practice', desc: 'Comprehensive multi-format examination' },
];

const INSTRUCTION_PRESETS = [
  'NCERT Exemplar Based',
  'CBSE Board Exam Practice',
  'Application & Numerical Focus',
  'Assertion-Reason Emphasis',
  'Important Recurring Exam Questions',
  'Formula & Derivation Concepts',
];

export const TeacherQuizGenerator: React.FC<TeacherQuizGeneratorProps> = ({
  onQuizGeneratedForReview,
  savedQuizzes,
  onDeleteQuiz,
  onPublishQuiz,
  onStartQuiz,
}) => {
  // Mode selection: Question Paper Creator (Full CBSE Exam) vs Speed Practice Quiz
  const [studioMode, setStudioMode] = useState<'paper' | 'speed_quiz'>('paper');
  const [localPreviewPaper, setLocalPreviewPaper] = useState<Quiz | null>(null);

  // Common Academic selections
  const [selectedClass] = useState<string>('Class 11TH');
  const [selectedStream, setSelectedStream] = useState<StreamType>('PCM');
  const [selectedSubject, setSelectedSubject] = useState<string>('Physics');
  const [selectedChapters, setSelectedChapters] = useState<string[]>([]);
  const [chapterSearch, setChapterSearch] = useState<string>('');
  const [difficulty, setDifficulty] = useState<QuizDifficulty>('Mixed');
  const [teacherInstructions, setTeacherInstructions] = useState<string>('');
  const [teacherName, setTeacherName] = useState<string>('Diksha Mam');

  // --- STREAM-WISE STUDENT SELECTION & ATTENDANCE STATE ---
  const [todayDateKey] = useState<string>(() => getLocalDateString());
  const [attendanceVersion, setAttendanceVersion] = useState<number>(0);
  const [studentSelectionMode, setStudentSelectionMode] = useState<StudentSelectionMode>('all_in_stream');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [showAttendanceRollCall, setShowAttendanceRollCall] = useState<boolean>(false);

  // Students strictly belonging to the currently selected stream
  const streamStudents: Student[] = useMemo(() => {
    return storage.getStudentsByStream(selectedStream);
  }, [selectedStream]);

  // Current daily attendance state for the selected stream
  const streamAttendanceSummary = useMemo(() => {
    const record = storage.getAttendanceForDate(todayDateKey);
    const presentInfo = storage.getPresentStudents(todayDateKey, selectedStream);
    return {
      record,
      ...presentInfo,
    };
  }, [todayDateKey, selectedStream, attendanceVersion]);

  // Recalculate selectedStudentIds whenever selectedStream or studentSelectionMode or attendance changes
  useEffect(() => {
    const validStreamIds = new Set(streamStudents.map((s) => s.id));

    if (studentSelectionMode === 'skip' || (studentSelectionMode as any) === 'none') {
      setSelectedStudentIds([]);
    } else if (studentSelectionMode === 'all_in_stream') {
      setSelectedStudentIds(streamStudents.map((s) => s.id));
    } else if (studentSelectionMode === 'present_only') {
      // Strictly select only students marked 'present' or 'late' — never assume unrecorded/missing is present
      if (streamAttendanceSummary.configured) {
        setSelectedStudentIds(streamAttendanceSummary.presentStudents.map((s) => s.id));
      } else {
        setSelectedStudentIds([]);
      }
    } else {
      // 'individual' mode: keep only previously selected IDs that belong to the active stream (no duplicates)
      setSelectedStudentIds((prev) => {
        const filtered = Array.from(new Set(prev.filter((id) => validStreamIds.has(id))));
        return filtered;
      });
    }
  }, [selectedStream, studentSelectionMode, streamStudents, streamAttendanceSummary]);

  // Toggle an individual student checkbox (allows teachers to uncheck or add individual students even after choosing All Present Students)
  const handleToggleStudentId = (studentId: string) => {
    audioFX.playClick();
    setSelectedStudentIds((prev) => {
      const unique = new Set(prev);
      if (unique.has(studentId)) {
        unique.delete(studentId);
      } else {
        unique.add(studentId);
      }
      return Array.from(unique);
    });
    // Switch mode indicator to individual if teacher customizes selection manually
    if (studentSelectionMode !== 'individual') {
      setStudentSelectionMode('individual');
    }
  };

  // Update a student's attendance status in the daily roll call
  const handleMarkStudentAttendance = (studentId: string, status: AttendanceStatus) => {
    audioFX.playClick();
    storage.saveStudentAttendance(todayDateKey, studentId, status, teacherName);
    setAttendanceVersion((v) => v + 1);
  };

  // Bulk mark all students in current stream as Present or Reset
  const handleBulkStreamAttendance = (status: AttendanceStatus | 'clear') => {
    audioFX.playClick();
    if (status === 'clear') {
      const nextStatuses: Record<string, AttendanceStatus> = {};
      for (const st of streamStudents) {
        nextStatuses[st.id] = 'unrecorded';
      }
      storage.saveBulkAttendance(todayDateKey, nextStatuses, teacherName);
    } else {
      const nextStatuses: Record<string, AttendanceStatus> = {};
      for (const st of streamStudents) {
        nextStatuses[st.id] = status;
      }
      storage.saveBulkAttendance(todayDateKey, nextStatuses, teacherName);
    }
    setAttendanceVersion((v) => v + 1);
  };

  // Expandable Advanced Settings
  const [showAdvancedSettings, setShowAdvancedSettings] = useState<boolean>(false);

  // --- QUESTION PAPER WORKSPACE STATE ---
  // Initial quantities strictly start at 0 as required
  const [paperCounts, setPaperCounts] = useState<{
    mcq: number;
    short_2: number;
    short_3: number;
    case_study: number;
    long_5: number;
  }>({
    mcq: 0,
    short_2: 0,
    short_3: 0,
    case_study: 0,
    long_5: 0,
  });

  // Editable marks per question type
  const [marksConfig, setMarksConfig] = useState<{
    mcq: number;
    short_2: number;
    short_3: number;
    case_study: number;
    long_5: number;
  }>({
    mcq: 1,
    short_2: 2,
    short_3: 3,
    case_study: 4,
    long_5: 5,
  });

  // Exam Paper Metadata
  const [examName, setExamName] = useState<string>('Class 11 Term Examination 2025–26');
  const [examDate, setExamDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [durationMinutes, setDurationMinutes] = useState<number>(90);
  const [generalInstructions, setGeneralInstructions] = useState<string>(
    '1. All questions are compulsory.\n2. Section A contains Multiple Choice Questions (1 Mark each).\n3. Section B contains Short Answer Questions (2 Marks each).\n4. Section C contains Short Answer Questions (3 Marks each).\n5. Section D contains Case-Based Questions (4 Marks each).\n6. Section E contains Long Answer Questions (5 Marks each).'
  );

  // --- SPEED PRACTICE QUIZ STATE ---
  const [speedQuestionCount, setSpeedQuestionCount] = useState<number>(10);
  const [customSpeedCountInput, setCustomSpeedCountInput] = useState<string>('');
  const [isCustomSpeedCount, setIsCustomSpeedCount] = useState<boolean>(false);
  const [speedQuestionType, setSpeedQuestionType] = useState<QuestionType>('mixed');

  // Generator execution state
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [genStep, setGenStep] = useState<string>('');
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [isOfflineWarningOpen, setIsOfflineWarningOpen] = useState<boolean>(false);

  // Filter available subjects when stream changes
  const availableSubjects = useMemo(() => {
    return getSubjectsForStream(selectedStream);
  }, [selectedStream]);

  // Subject class level (Class 12 for PE, AI, Fine Arts; Class 11 for others)
  const subjectClassLevel = useMemo(() => {
    return getSubjectClassLevel(selectedSubject);
  }, [selectedSubject]);

  // Subject curriculum details
  const subjectCurriculum = useMemo(() => {
    return getSubjectCurriculum(selectedSubject);
  }, [selectedSubject]);

  // Keep subject in sync if not available in current stream
  useEffect(() => {
    if (!availableSubjects.includes(selectedSubject)) {
      if (availableSubjects.length > 0) {
        setSelectedSubject(availableSubjects[0]);
      }
    }
  }, [availableSubjects, selectedSubject]);

  // Keep default exam paper name aligned with subject class level
  useEffect(() => {
    const is12 = getSubjectClassLevel(selectedSubject) === 'Class 12';
    setExamName((prev) => {
      if (
        !prev ||
        prev.startsWith('Class 11') ||
        prev.startsWith('CBSE Class 11') ||
        prev.startsWith('Class 12') ||
        prev.startsWith('CBSE Class 12')
      ) {
        return is12
          ? `CBSE Class 12 Term Examination ${CURRENT_ACADEMIC_SESSION}`
          : `Class 11 Term Examination ${CURRENT_ACADEMIC_SESSION}`;
      }
      return prev;
    });
  }, [selectedSubject]);

  // Update teacher automatically when subject changes according to authoritative mapping,
  // falling back to stream default if subject is unmapped. Preserves manual teacher override.
  useEffect(() => {
    if (selectedSubject && SUBJECT_TO_TEACHER_MAPPING[selectedSubject]) {
      setTeacherName(SUBJECT_TO_TEACHER_MAPPING[selectedSubject]);
    } else if (selectedStream && STREAM_CONFIG[selectedStream]) {
      setTeacherName(STREAM_CONFIG[selectedStream].defaultTeacher);
    }
  }, [selectedSubject, selectedStream]);

  // Available chapters for the selected subject
  const availableChapters: ChapterInfo[] = useMemo(() => {
    return getChaptersForSubject(selectedSubject);
  }, [selectedSubject]);

  // Auto-select first chapter when subject changes if empty
  useEffect(() => {
    if (availableChapters.length > 0 && selectedChapters.length === 0) {
      setSelectedChapters([availableChapters[0].title]);
    }
  }, [availableChapters]);

  // Filtered chapters based on search
  const filteredChapters = useMemo(() => {
    if (!chapterSearch.trim()) return availableChapters;
    const clean = chapterSearch.toLowerCase().trim();
    return availableChapters.filter(
      (c) =>
        c.title.toLowerCase().includes(clean) ||
        `ch ${c.number}`.includes(clean) ||
        `chapter ${c.number}`.includes(clean) ||
        (c.keyTopics && c.keyTopics.some((t) => t.toLowerCase().includes(clean)))
    );
  }, [availableChapters, chapterSearch]);

  const isAllChaptersSelected =
    availableChapters.length > 0 && selectedChapters.length === availableChapters.length;

  // Toggle chapter selection
  const handleToggleChapter = (chapterTitle: string) => {
    audioFX.playClick();
    if (selectedChapters.includes(chapterTitle)) {
      setSelectedChapters(selectedChapters.filter((t) => t !== chapterTitle));
    } else {
      setSelectedChapters([...selectedChapters, chapterTitle]);
    }
  };

  // Toggle select all chapters
  const handleToggleSelectAllChapters = () => {
    audioFX.playClick();
    if (isAllChaptersSelected) {
      setSelectedChapters([]);
    } else {
      setSelectedChapters(availableChapters.map((c) => c.title));
    }
  };

  // Paper quantity handlers
  const handleCountChange = (key: keyof typeof paperCounts, delta: number) => {
    audioFX.playClick();
    setPaperCounts((prev) => ({
      ...prev,
      [key]: Math.max(0, Math.min(25, prev[key] + delta)),
    }));
  };

  const handleDirectCountInput = (key: keyof typeof paperCounts, val: string) => {
    const num = parseInt(val, 10);
    setPaperCounts((prev) => ({
      ...prev,
      [key]: isNaN(num) ? 0 : Math.max(0, Math.min(25, num)),
    }));
  };

  const handleMarksChange = (key: keyof typeof marksConfig, val: string) => {
    const num = parseInt(val, 10);
    setMarksConfig((prev) => ({
      ...prev,
      [key]: isNaN(num) ? 1 : Math.max(1, Math.min(20, num)),
    }));
  };

  // Quick Paper Templates
  const handleApplyPaperTemplate = (type: 'periodic' | 'half_yearly' | 'reset') => {
    audioFX.playClick();
    if (type === 'periodic') {
      setPaperCounts({ mcq: 5, short_2: 3, short_3: 3, case_study: 0, long_5: 0 });
      setDurationMinutes(45);
      setExamName(`${selectedSubject} Periodic Test (20 Marks)`);
    } else if (type === 'half_yearly') {
      setPaperCounts({ mcq: 16, short_2: 5, short_3: 7, case_study: 2, long_5: 3 });
      setDurationMinutes(180);
      setExamName(`${selectedSubject} Term Examination (70 Marks)`);
    } else {
      setPaperCounts({ mcq: 0, short_2: 0, short_3: 0, case_study: 0, long_5: 0 });
    }
  };

  // Live Summary Calculations for Question Paper
  const totalPaperQuestions =
    paperCounts.mcq +
    paperCounts.short_2 +
    paperCounts.short_3 +
    paperCounts.case_study +
    paperCounts.long_5;

  const totalPaperMarks =
    paperCounts.mcq * (marksConfig.mcq || 1) +
    paperCounts.short_2 * (marksConfig.short_2 || 2) +
    paperCounts.short_3 * (marksConfig.short_3 || 3) +
    paperCounts.case_study * (marksConfig.case_study || 4) +
    paperCounts.long_5 * (marksConfig.long_5 || 5);

  const isAllQuantitiesZero = totalPaperQuestions === 0;

  // Toggle instruction presets
  const handleToggleInstructionPreset = (preset: string) => {
    audioFX.playClick();
    if (teacherInstructions.includes(preset)) {
      setTeacherInstructions(
        teacherInstructions
          .replace(preset, '')
          .replace(/,\s*,/g, ',')
          .trim()
      );
    } else {
      setTeacherInstructions(
        teacherInstructions ? `${teacherInstructions}, ${preset}` : preset
      );
    }
  };

  // Selected students objects for current stream
  const selectedStudentsList: Student[] = useMemo(() => {
    const idSet = new Set(selectedStudentIds);
    return streamStudents.filter((s) => idSet.has(s.id));
  }, [streamStudents, selectedStudentIds]);

  // Overall Validation
  const isPaperValid =
    selectedSubject &&
    selectedChapters.length > 0 &&
    totalPaperQuestions > 0 &&
    totalPaperMarks > 0 &&
    Number(durationMinutes) >= 5 &&
    Number(durationMinutes) <= 300 &&
    (studentSelectionMode === 'skip' || (studentSelectionMode as any) === 'none' || selectedStudentIds.length > 0) &&
    !isGenerating;

  const isSpeedValid =
    selectedSubject &&
    selectedChapters.length > 0 &&
    speedQuestionCount >= 1 &&
    speedQuestionCount <= 30 &&
    (studentSelectionMode === 'skip' || (studentSelectionMode as any) === 'none' || selectedStudentIds.length > 0) &&
    !isGenerating;

  const isValid = studioMode === 'paper' ? isPaperValid : isSpeedValid;

  // Generate Handler (uses resolveApiUrl + apkAwareFetch so it works on both website and installed Android APK)
  const handleGenerateQuiz = async () => {
    if (studioMode === 'paper') {
      if (totalPaperQuestions <= 0 || totalPaperMarks <= 0) {
        setGenerationError('Please select at least 1 question with valid marks distribution before generating.');
        return;
      }
      if (!Number.isFinite(Number(durationMinutes)) || Number(durationMinutes) < 5 || Number(durationMinutes) > 300) {
        setGenerationError('Please specify a valid paper duration between 5 and 300 minutes.');
        return;
      }
    }

    if (!isValid) return;

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setIsOfflineWarningOpen(true);
      return;
    }

    audioFX.playClick();
    setIsGenerating(true);
    setGenerationError(null);
    setGenStep(
      studioMode === 'paper'
        ? `Structuring CBSE Official Question Paper for ${selectedSubject}...`
        : 'Initializing Gemini AI with CBSE curriculum guidelines...'
    );

    try {
      setTimeout(() => {
        setGenStep(
          `Targeting ${selectedSubject} (${selectedChapters.length} chapter${
            selectedChapters.length === 1 ? '' : 's'
          } selected)...`
        );
      }, 700);

      setTimeout(() => {
        setGenStep('Formulating questions, verifying MCQ answer keys & shuffling option positions...');
      }, 1600);

      const cleanAssignedIds = Array.from(new Set(selectedStudentIds));
      const cleanAssignedNames = selectedStudentsList.map((s) => s.name);

      const targetClassLevel = subjectClassLevel === 'Class 12' ? 'Class 12TH' : 'Class 11TH';
      const parsedInstructionsList = generalInstructions
        .split('\n')
        .map((line) => line.replace(/^\d+\.\s*/, '').trim())
        .filter(Boolean);

      // Collect recent questions/passages for this subject so consecutive generations never repeat content
      const recentSubjectQuestions: string[] = [];
      for (const sq of savedQuizzes) {
        if (sq.subject && sq.subject.toLowerCase() === selectedSubject.toLowerCase() && Array.isArray(sq.questions)) {
          for (const qItem of sq.questions) {
            if (qItem.casePassage) recentSubjectQuestions.push(qItem.casePassage.slice(0, 160));
            if (qItem.question) recentSubjectQuestions.push(qItem.question.slice(0, 160));
          }
        }
      }
      const generationNonce = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

      const requestPayload =
        studioMode === 'paper'
          ? {
              isQuestionPaper: true,
              classLevel: targetClassLevel,
              stream: selectedStream,
              subject: selectedSubject,
              chapters: selectedChapters,
              chapter: selectedChapters.join(', '),
              difficulty,
              questionCountsByType: paperCounts,
              marksConfig,
              recentQuestions: recentSubjectQuestions.slice(-35),
              generationNonce,
              paperConfig: {
                examName: examName || `${selectedSubject} Examination`,
                examDate: examDate || new Date().toISOString().split('T')[0],
                durationMinutes: Number(durationMinutes) || 90,
                generalInstructions:
                  parsedInstructionsList.length > 0
                    ? parsedInstructionsList
                    : [
                        'All questions are compulsory.',
                        'The question paper consists of multiple sections based on CBSE assessment guidelines.',
                        'Marks are indicated against each question.',
                      ],
              },
              instructions: teacherInstructions,
              teacherName,
              assignedStudentIds: cleanAssignedIds,
              assignedStudentNames: cleanAssignedNames,
              assignmentMode: studentSelectionMode,
            }
          : {
              isQuestionPaper: false,
              classLevel: targetClassLevel,
              stream: selectedStream,
              subject: selectedSubject,
              chapters: selectedChapters,
              chapter: selectedChapters.join(', '),
              questionCount: speedQuestionCount,
              difficulty,
              questionType: speedQuestionType,
              recentQuestions: recentSubjectQuestions.slice(-35),
              generationNonce,
              instructions: teacherInstructions,
              teacherName,
              assignedStudentIds: cleanAssignedIds,
              assignedStudentNames: cleanAssignedNames,
              assignmentMode: studentSelectionMode,
            };

      const apiUrl = resolveApiUrl('/api/gemini/quiz');
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Generation failed (HTTP ${response.status})`);
      }

      const data = await response.json();
      if (
        !data.success ||
        !data.quiz ||
        !Array.isArray(data.quiz.questions) ||
        data.quiz.questions.length === 0
      ) {
        throw new Error(data.error || 'Server did not return a valid non-empty question paper.');
      }

      const uniqueQuizId = `quiz-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const generatedQuiz: Quiz = {
        ...data.quiz,
        id: uniqueQuizId,
        createdAt: Date.now(),
        isDraft: true,
        isQuestionPaper: studioMode === 'paper' ? true : Boolean(data.quiz.isQuestionPaper),
        source: 'teacher',
        createdBy: teacherName,
        assignedStudentIds: cleanAssignedIds,
        assignedStudentNames: cleanAssignedNames,
        assignmentMode: studentSelectionMode,
        assignedAt: Date.now(),
      };

      audioFX.playSuccess();
      onQuizGeneratedForReview(generatedQuiz);
    } catch (err: any) {
      console.error('Quiz generation error:', err);
      audioFX.playError();
      setGenerationError(
        err.message ||
          'Unable to generate quiz. Please check your internet connection and tap Retry.'
      );
    } finally {
      setIsGenerating(false);
      setGenStep('');
    }
  };

  const streamInfo = STREAM_CONFIG[selectedStream];
  const isEnglishSelected = selectedSubject === 'English' || selectedSubject === 'English Core';

  return (
    <div className="space-y-6">
      {/* Top Banner with Studio Mode Selector */}
      <div className="p-5 sm:p-6 rounded-3xl jarvis-panel border border-cyan-500/30 bg-gradient-to-br from-[#060e22] via-[#040814] to-[#0a142e] shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 font-mono-code text-xs font-bold uppercase flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5" />
                TEACHER STUDIO WORKSPACE
              </span>
              <span className="text-xs font-mono-code text-slate-400">
                POWERED BY GOOGLE GEMINI 2.5 FLASH
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold font-hud text-white mt-1.5">
              CBSE QUESTION PAPER & QUIZ STUDIO
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 font-sans mt-0.5 max-w-3xl">
              Complete pedagogical control: craft formal CBSE question papers with MCQs, short answers, case studies, and long answers, or generate rapid practice quizzes.
            </p>
          </div>

          {/* Mode Switch Tabs */}
          <div className="flex items-center p-1 rounded-2xl bg-slate-950 border border-cyan-500/30 flex-wrap gap-1">
            <button
              type="button"
              onClick={() => {
                audioFX.playClick();
                setStudioMode('paper');
                if (isEnglishSelected) {
                  setSelectedSubject('Physics');
                }
              }}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-hud text-xs font-bold transition cursor-pointer ${
                studioMode === 'paper' && !isEnglishSelected
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-black shadow-[0_0_15px_rgba(0,240,255,0.4)]'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>QUESTION PAPER CREATOR</span>
            </button>
            <button
              type="button"
              onClick={() => {
                audioFX.playClick();
                setStudioMode('paper');
                setSelectedSubject('English');
              }}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-hud text-xs font-bold transition cursor-pointer ${
                studioMode === 'paper' && isEnglishSelected
                  ? 'bg-gradient-to-r from-amber-400 via-orange-500 to-purple-600 text-black shadow-[0_0_15px_rgba(245,158,11,0.4)]'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>ENGLISH PAPER GENERATOR</span>
            </button>
            <button
              type="button"
              onClick={() => {
                audioFX.playClick();
                setStudioMode('speed_quiz');
              }}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-hud text-xs font-bold transition cursor-pointer ${
                studioMode === 'speed_quiz'
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-black shadow-[0_0_15px_rgba(0,240,255,0.4)]'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              <span>SPEED QUIZ GENERATOR</span>
            </button>
          </div>
        </div>
      </div>

      {/* MAIN GENERATION CONTROLS PANEL */}
      <div className="p-5 sm:p-7 rounded-3xl jarvis-panel border border-cyan-500/30 space-y-6">
        {/* Row 1: Class & Stream Selector */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* 1. Class Selection */}
          <div className="lg:col-span-4 space-y-2">
            <label className="block text-xs font-hud font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-cyan-400" />
              <span>1. Class</span>
            </label>
            <div className="p-3 rounded-2xl bg-slate-950/80 border border-cyan-500/30 flex items-center justify-between">
              <div>
                <span className="font-hud font-bold text-white text-base">
                  {subjectClassLevel === 'Class 12' ? 'Class 12TH' : 'Class 11TH'}
                </span>
                <p className="text-[11px] font-mono-code text-slate-400">
                  THE ABHINAV SCHOOL • CBSE {CURRENT_ACADEMIC_SESSION}
                  {subjectClassLevel === 'Class 12' && (
                    <span className="text-amber-400 font-bold ml-1.5">(Class 12 Syllabus)</span>
                  )}
                </p>
              </div>
              <span
                className={`px-2.5 py-1 rounded-lg text-[10px] font-mono-code font-bold ${
                  subjectClassLevel === 'Class 12'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
                    : 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40'
                }`}
              >
                {subjectClassLevel === 'Class 12' ? 'CLASS 12 CBSE' : 'LOCKED BY NEXORA'}
              </span>
            </div>
          </div>

          {/* 2. Stream Selection */}
          <div className="lg:col-span-8 space-y-2">
            <label className="block text-xs font-hud font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-cyan-400" />
              <span>2. Stream</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {(['PCM', 'PCB', 'HUMANITIES', 'COMMERCE'] as StreamType[]).map((st) => {
                const isSelected = selectedStream === st;
                const cfg = STREAM_CONFIG[st];
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => {
                      audioFX.playClick();
                      setSelectedStream(st);
                      setSelectedChapters([]);
                    }}
                    className={`p-3 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? `${cfg.badge} border-cyan-400 shadow-[0_0_15px_rgba(0,240,255,0.25)] font-bold`
                        : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-hud font-bold text-sm text-white">{st}</div>
                    <div className="text-[10px] font-mono-code text-slate-400 mt-1 truncate">
                      {st === 'PCM'
                        ? 'Physics, Math'
                        : st === 'PCB'
                        ? 'Physics, Bio'
                        : st === 'HUMANITIES'
                        ? 'Pol Sci, Hist'
                        : 'Accounts, BST'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Row 2: Subject Selector (Dynamic per Stream) */}
        <div className="space-y-2">
          <label className="block text-xs font-hud font-bold text-cyan-300 uppercase tracking-wider flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-cyan-400" />
              <span>3. Subject (Available for {selectedStream})</span>
            </span>
            <span className="text-[11px] font-mono-code text-slate-400">
              {availableSubjects.length} subjects found
            </span>
          </label>

          <div className="flex items-center gap-2 flex-wrap">
            {availableSubjects.map((subj) => {
              const isSelected = selectedSubject === subj;
              const isClass12 = getSubjectClassLevel(subj) === 'Class 12';
              return (
                <button
                  key={subj}
                  type="button"
                  onClick={() => {
                    audioFX.playClick();
                    setSelectedSubject(subj);
                    setSelectedChapters([]);
                  }}
                  className={`px-4 py-2.5 rounded-xl border font-hud text-xs font-bold transition cursor-pointer flex items-center gap-2 ${
                    isSelected
                      ? 'bg-cyan-500 text-black border-cyan-400 shadow-[0_0_12px_rgba(0,240,255,0.4)]'
                      : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white hover:border-cyan-500/40'
                  }`}
                >
                  <span>{subj}</span>
                  {isClass12 && (
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded font-mono-code uppercase font-semibold ${
                        isSelected
                          ? 'bg-black text-amber-300'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
                      }`}
                    >
                      Class 12
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {studioMode === 'paper' && isEnglishSelected ? (
          <div className="pt-2 border-t border-cyan-500/20 animate-in fade-in">
            <EnglishQuestionPaperGenerator
              onQuizGeneratedForReview={onQuizGeneratedForReview}
              savedQuizzes={savedQuizzes}
              onDeleteQuiz={onDeleteQuiz}
              onPublishQuiz={onPublishQuiz}
              onStartQuiz={onStartQuiz}
              onSwitchSubject={(subj) => setSelectedSubject(subj)}
            />
          </div>
        ) : (
          <>
            {/* Row 3: Target Chapters */}
            <div className="space-y-2.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <label className="text-xs font-hud font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-cyan-400" />
              <span>4. Target Chapter(s) for {selectedSubject}</span>
              {subjectCurriculum && (
                <span className="text-[10px] font-mono-code font-normal text-slate-400 ml-1">
                  ({subjectCurriculum.classLevel}
                  {subjectCurriculum.subjectCode ? ` • CBSE Code ${subjectCurriculum.subjectCode}` : ''})
                </span>
              )}
            </label>

            <div className="flex items-center gap-2">
              <span className="text-xs font-mono-code text-slate-400">
                Selected: <strong className="text-white">{selectedChapters.length}</strong> of{' '}
                {availableChapters.length}
              </span>
              <button
                type="button"
                onClick={handleToggleSelectAllChapters}
                className={`px-3 py-1 rounded-lg font-mono-code text-xs font-bold transition cursor-pointer border ${
                  isAllChaptersSelected
                    ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300'
                    : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white'
                }`}
              >
                {isAllChaptersSelected ? 'Deselect All' : 'Select Entire Syllabus'}
              </button>
            </div>
          </div>

          {/* Search box for chapters */}
          <div className="relative">
            <input
              type="text"
              value={chapterSearch}
              onChange={(e) => setChapterSearch(e.target.value)}
              placeholder={`Search ${selectedSubject} chapters by name or number (e.g. Thermodynamics, Kinematics)...`}
              className="w-full px-4 py-2 rounded-xl bg-slate-950 border border-cyan-500/30 text-white font-sans text-xs focus:border-cyan-400 outline-none pl-9"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          </div>

          {/* Chapter cards list */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-52 overflow-y-auto p-1 rounded-2xl bg-slate-950/60 border border-slate-800">
            {filteredChapters.length === 0 ? (
              <div className="col-span-2 text-center py-6 text-xs font-mono-code text-slate-400">
                No chapters match &quot;{chapterSearch}&quot;.
              </div>
            ) : (
              filteredChapters.map((ch) => {
                const isSelected = selectedChapters.includes(ch.title);
                return (
                  <button
                    key={ch.number}
                    type="button"
                    onClick={() => handleToggleChapter(ch.title)}
                    className={`p-3 rounded-xl border text-left flex items-start gap-3 transition cursor-pointer ${
                      isSelected
                        ? 'bg-cyan-950/40 border-cyan-400/80 shadow-[0_0_10px_rgba(0,240,255,0.15)] text-white'
                        : 'bg-slate-900/50 border-slate-800/80 text-slate-300 hover:border-slate-700 hover:bg-slate-900'
                    }`}
                  >
                    <div className="mt-0.5 shrink-0">
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-cyan-400" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono-code px-1.5 py-0.5 rounded bg-black/40 text-cyan-300 border border-cyan-500/20 font-bold shrink-0">
                          CH {ch.number}
                        </span>
                        <span className="font-hud font-bold text-xs truncate">{ch.title}</span>
                      </div>
                      {ch.keyTopics && ch.keyTopics.length > 0 && (
                        <p className="text-[10px] text-slate-400 font-sans mt-1 line-clamp-1">
                          {ch.keyTopics.join(' • ')}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* WORKSPACE MODE 1: CBSE QUESTION PAPER CREATOR */}
        {studioMode === 'paper' && (
          <div className="space-y-6 pt-2 border-t border-cyan-500/20 animate-in fade-in">
            {/* Exam Paper Metadata Header */}
            <div className="p-4 rounded-2xl bg-slate-950/90 border border-cyan-500/30 space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs font-hud font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-cyan-400" />
                  <span>5. Examination Blueprint & Metadata</span>
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleApplyPaperTemplate('periodic')}
                    className="px-2.5 py-1 rounded-lg bg-slate-900 border border-cyan-500/30 hover:border-cyan-400 text-cyan-300 text-[11px] font-mono-code font-bold transition cursor-pointer"
                  >
                    + Periodic Test (20M)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyPaperTemplate('half_yearly')}
                    className="px-2.5 py-1 rounded-lg bg-slate-900 border border-cyan-500/30 hover:border-cyan-400 text-cyan-300 text-[11px] font-mono-code font-bold transition cursor-pointer"
                  >
                    + Term Exam (70M)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyPaperTemplate('reset')}
                    className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 hover:border-red-500 text-slate-400 hover:text-red-300 text-[11px] font-mono-code transition cursor-pointer"
                  >
                    Reset (0)
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label className="block text-[11px] font-mono-code text-slate-400 mb-1">
                    Exam Title / Name
                  </label>
                  <input
                    type="text"
                    value={examName}
                    onChange={(e) => setExamName(e.target.value)}
                    placeholder="e.g. Periodic Assessment II"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-hud text-xs focus:border-cyan-400 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-mono-code text-slate-400 mb-1 flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-cyan-400" />
                    <span>Exam Date</span>
                  </label>
                  <input
                    type="date"
                    value={examDate}
                    onChange={(e) => setExamDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-hud text-xs focus:border-cyan-400 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-mono-code text-slate-400 mb-1 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-cyan-400" />
                    <span>Duration (Minutes)</span>
                  </label>
                  <input
                    type="number"
                    min="15"
                    max="240"
                    step="5"
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Math.max(15, parseInt(e.target.value, 10) || 90))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-hud text-xs focus:border-cyan-400 outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Question Format Quantities & Marks (Starts at 0) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-hud font-bold text-cyan-300 uppercase tracking-wider">
                  6. Select Question Types & Quantities (All start at 0)
                </label>
                <span className="text-[11px] font-mono-code text-slate-400">
                  Total Questions: <strong className="text-white">{totalPaperQuestions}</strong> • Total Marks:{' '}
                  <strong className="text-cyan-300">{totalPaperMarks} M</strong>
                </span>
              </div>

              {/* Guard Alert if all quantities are 0 */}
              {isAllQuantitiesZero && (
                <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-400/40 text-amber-300 text-xs font-mono-code flex items-center gap-2.5 animate-pulse">
                  <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
                  <span>Select at least one question type and quantity to continue.</span>
                </div>
              )}

              {/* 5 Standard Formats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                {/* 1. MCQ */}
                <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-cyan-500/30 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-hud font-bold text-cyan-300">Section A: MCQs</span>
                      <span className="px-1.5 py-0.5 rounded bg-black text-[10px] font-mono-code text-cyan-400">
                        {paperCounts.mcq * marksConfig.mcq} M
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">Single-correct 4 options</p>
                  </div>

                  {/* Quantity Counter */}
                  <div className="mt-3 flex items-center justify-between gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
                    <button
                      type="button"
                      onClick={() => handleCountChange('mcq', -1)}
                      className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center text-xs font-bold transition cursor-pointer"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <input
                      type="number"
                      min="0"
                      max="30"
                      value={paperCounts.mcq}
                      onChange={(e) => handleDirectCountInput('mcq', e.target.value)}
                      className="w-10 text-center bg-transparent font-mono-code text-xs font-bold text-white outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleCountChange('mcq', 1)}
                      className="w-7 h-7 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black flex items-center justify-center text-xs font-bold transition cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Marks per question */}
                  <div className="mt-2 pt-2 border-t border-slate-800 flex items-center justify-between text-[10px] font-mono-code text-slate-400">
                    <span>Marks each:</span>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={marksConfig.mcq}
                      onChange={(e) => handleMarksChange('mcq', e.target.value)}
                      className="w-10 px-1 py-0.5 rounded bg-slate-900 border border-slate-700 text-center text-white text-[11px] font-mono-code outline-none"
                    />
                  </div>
                </div>

                {/* 2. Short-2 */}
                <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-cyan-500/30 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-hud font-bold text-blue-300">Section B: Short</span>
                      <span className="px-1.5 py-0.5 rounded bg-black text-[10px] font-mono-code text-blue-400">
                        {paperCounts.short_2 * marksConfig.short_2} M
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">2 Marks brief reasoning</p>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
                    <button
                      type="button"
                      onClick={() => handleCountChange('short_2', -1)}
                      className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center text-xs font-bold transition cursor-pointer"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <input
                      type="number"
                      min="0"
                      max="20"
                      value={paperCounts.short_2}
                      onChange={(e) => handleDirectCountInput('short_2', e.target.value)}
                      className="w-10 text-center bg-transparent font-mono-code text-xs font-bold text-white outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleCountChange('short_2', 1)}
                      className="w-7 h-7 rounded-lg bg-blue-500 hover:bg-blue-400 text-white flex items-center justify-center text-xs font-bold transition cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  <div className="mt-2 pt-2 border-t border-slate-800 flex items-center justify-between text-[10px] font-mono-code text-slate-400">
                    <span>Marks each:</span>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={marksConfig.short_2}
                      onChange={(e) => handleMarksChange('short_2', e.target.value)}
                      className="w-10 px-1 py-0.5 rounded bg-slate-900 border border-slate-700 text-center text-white text-[11px] font-mono-code outline-none"
                    />
                  </div>
                </div>

                {/* 3. Short-3 */}
                <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-cyan-500/30 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-hud font-bold text-purple-300">Section C: Short</span>
                      <span className="px-1.5 py-0.5 rounded bg-black text-[10px] font-mono-code text-purple-400">
                        {paperCounts.short_3 * marksConfig.short_3} M
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">3 Marks derivation / solve</p>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
                    <button
                      type="button"
                      onClick={() => handleCountChange('short_3', -1)}
                      className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center text-xs font-bold transition cursor-pointer"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <input
                      type="number"
                      min="0"
                      max="20"
                      value={paperCounts.short_3}
                      onChange={(e) => handleDirectCountInput('short_3', e.target.value)}
                      className="w-10 text-center bg-transparent font-mono-code text-xs font-bold text-white outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleCountChange('short_3', 1)}
                      className="w-7 h-7 rounded-lg bg-purple-500 hover:bg-purple-400 text-white flex items-center justify-center text-xs font-bold transition cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  <div className="mt-2 pt-2 border-t border-slate-800 flex items-center justify-between text-[10px] font-mono-code text-slate-400">
                    <span>Marks each:</span>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={marksConfig.short_3}
                      onChange={(e) => handleMarksChange('short_3', e.target.value)}
                      className="w-10 px-1 py-0.5 rounded bg-slate-900 border border-slate-700 text-center text-white text-[11px] font-mono-code outline-none"
                    />
                  </div>
                </div>

                {/* 4. Case-Study */}
                <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-cyan-500/30 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-hud font-bold text-amber-300">Section D: Case</span>
                      <span className="px-1.5 py-0.5 rounded bg-black text-[10px] font-mono-code text-amber-400">
                        {paperCounts.case_study * marksConfig.case_study} M
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">Passage + 2-3 subquestions</p>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
                    <button
                      type="button"
                      onClick={() => handleCountChange('case_study', -1)}
                      className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center text-xs font-bold transition cursor-pointer"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <input
                      type="number"
                      min="0"
                      max="10"
                      value={paperCounts.case_study}
                      onChange={(e) => handleDirectCountInput('case_study', e.target.value)}
                      className="w-10 text-center bg-transparent font-mono-code text-xs font-bold text-white outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleCountChange('case_study', 1)}
                      className="w-7 h-7 rounded-lg bg-amber-500 hover:bg-amber-400 text-black flex items-center justify-center text-xs font-bold transition cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  <div className="mt-2 pt-2 border-t border-slate-800 flex items-center justify-between text-[10px] font-mono-code text-slate-400">
                    <span>Marks each:</span>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={marksConfig.case_study}
                      onChange={(e) => handleMarksChange('case_study', e.target.value)}
                      className="w-10 px-1 py-0.5 rounded bg-slate-900 border border-slate-700 text-center text-white text-[11px] font-mono-code outline-none"
                    />
                  </div>
                </div>

                {/* 5. Long-5 */}
                <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-cyan-500/30 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-hud font-bold text-rose-300">Section E: Long</span>
                      <span className="px-1.5 py-0.5 rounded bg-black text-[10px] font-mono-code text-rose-400">
                        {paperCounts.long_5 * marksConfig.long_5} M
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">5 Marks detailed analysis</p>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
                    <button
                      type="button"
                      onClick={() => handleCountChange('long_5', -1)}
                      className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center text-xs font-bold transition cursor-pointer"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <input
                      type="number"
                      min="0"
                      max="10"
                      value={paperCounts.long_5}
                      onChange={(e) => handleDirectCountInput('long_5', e.target.value)}
                      className="w-10 text-center bg-transparent font-mono-code text-xs font-bold text-white outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleCountChange('long_5', 1)}
                      className="w-7 h-7 rounded-lg bg-rose-500 hover:bg-rose-400 text-white flex items-center justify-center text-xs font-bold transition cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  <div className="mt-2 pt-2 border-t border-slate-800 flex items-center justify-between text-[10px] font-mono-code text-slate-400">
                    <span>Marks each:</span>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={marksConfig.long_5}
                      onChange={(e) => handleMarksChange('long_5', e.target.value)}
                      className="w-10 px-1 py-0.5 rounded bg-slate-900 border border-slate-700 text-center text-white text-[11px] font-mono-code outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* WORKSPACE MODE 2: SPEED PRACTICE QUIZ */}
        {studioMode === 'speed_quiz' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2 border-t border-cyan-500/20 animate-in fade-in">
            {/* Number of Questions */}
            <div className="space-y-2">
              <label className="block text-xs font-hud font-bold text-cyan-300 uppercase tracking-wider">
                5. Number of Questions ({speedQuestionCount})
              </label>
              <div className="flex items-center gap-1.5 flex-wrap">
                {[5, 10, 15, 20, 25, 30].map((cnt) => (
                  <button
                    key={cnt}
                    type="button"
                    onClick={() => {
                      audioFX.playClick();
                      setIsCustomSpeedCount(false);
                      setSpeedQuestionCount(cnt);
                    }}
                    className={`px-3 py-1.5 rounded-xl border font-mono-code text-xs font-bold transition cursor-pointer ${
                      !isCustomSpeedCount && speedQuestionCount === cnt
                        ? 'bg-cyan-500 text-black border-cyan-400 shadow-md'
                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white'
                    }`}
                  >
                    {cnt}
                  </button>
                ))}
                <div className="flex items-center gap-1 ml-auto">
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={customSpeedCountInput}
                    onChange={(e) => {
                      setCustomSpeedCountInput(e.target.value);
                      setIsCustomSpeedCount(true);
                      const num = parseInt(e.target.value, 10);
                      if (!isNaN(num) && num >= 1 && num <= 30) {
                        setSpeedQuestionCount(num);
                      }
                    }}
                    placeholder="Custom"
                    className={`w-20 px-2.5 py-1.5 rounded-xl bg-slate-950 border font-mono-code text-xs outline-none text-white ${
                      isCustomSpeedCount ? 'border-cyan-400 ring-1 ring-cyan-400' : 'border-slate-800'
                    }`}
                  />
                </div>
              </div>
            </div>

            {/* Question Format */}
            <div className="space-y-2">
              <label className="block text-xs font-hud font-bold text-cyan-300 uppercase tracking-wider">
                6. Practice Format Style
              </label>
              <select
                value={speedQuestionType}
                onChange={(e) => {
                  audioFX.playClick();
                  setSpeedQuestionType(e.target.value as QuestionType);
                }}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-cyan-500/30 text-white font-hud text-xs focus:border-cyan-400 outline-none"
              >
                {SPEED_QUESTION_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label} — {t.desc}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* STREAM-WISE STUDENT SELECTION & ATTENDANCE-AWARE ASSIGNMENT */}
        <div className="p-4 sm:p-5 rounded-2xl bg-slate-950/90 border border-cyan-500/30 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <label className="text-xs font-hud font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-4 h-4 text-cyan-400" />
                <span>
                  {studioMode === 'paper' ? '7.' : '7.'} Stream-Wise Student Assignment ({selectedStream} Stream Only)
                </span>
              </label>
              <p className="text-[11px] font-sans text-slate-400 mt-0.5">
                Showing only verified Class 11 students enrolled in <strong className="text-white">{selectedStream}</strong> ({streamStudents.length} students).
              </p>
            </div>

            {/* Live Selected Student Count Badge */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-3 py-1 rounded-xl bg-cyan-500/20 border border-cyan-400/50 text-cyan-200 font-mono-code text-xs font-bold flex items-center gap-1.5">
                {studentSelectionMode === 'skip' || (studentSelectionMode as any) === 'none' ? (
                  <UserX className="w-3.5 h-3.5 text-amber-400" />
                ) : (
                  <UserCheck className="w-3.5 h-3.5 text-cyan-400" />
                )}
                <span>
                  Selected:{' '}
                  <strong className="text-white">
                    {studentSelectionMode === 'skip' || (studentSelectionMode as any) === 'none'
                      ? 'Skipped'
                      : selectedStudentIds.length}
                  </strong>{' '}
                  {studentSelectionMode === 'skip' || (studentSelectionMode as any) === 'none'
                    ? `(General / Unassigned Paper)`
                    : studentSelectionMode === 'present_only'
                    ? `Present Student${selectedStudentIds.length === 1 ? '' : 's'} (${selectedStream})`
                    : `of ${streamStudents.length} Student${streamStudents.length === 1 ? '' : 's'} (${selectedStream})`}
                </span>
              </span>

              <button
                type="button"
                onClick={() => {
                  audioFX.playClick();
                  setShowAttendanceRollCall(!showAttendanceRollCall);
                }}
                className={`px-3 py-1 rounded-xl border font-mono-code text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                  showAttendanceRollCall
                    ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                    : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white hover:border-cyan-500/40'
                }`}
              >
                <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                <span>
                  {showAttendanceRollCall
                    ? 'Hide Attendance Roll Call'
                    : `Mark Today's Attendance (${todayDateKey})`}
                </span>
              </button>
            </div>
          </div>

          {/* 4 Student Selection Modes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            <button
              type="button"
              onClick={() => {
                audioFX.playClick();
                setStudentSelectionMode('present_only');
              }}
              className={`p-3 rounded-xl border text-left transition cursor-pointer flex items-center justify-between ${
                studentSelectionMode === 'present_only'
                  ? 'bg-emerald-950/50 border-emerald-400 text-emerald-200 shadow-[0_0_12px_rgba(16,185,129,0.25)] font-bold'
                  : 'bg-slate-900/70 border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
            >
              <div>
                <div className="font-hud text-xs font-bold flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>All Present Students</span>
                </div>
                <div className="text-[10px] font-mono-code text-slate-400 mt-0.5">
                  {streamAttendanceSummary.configured
                    ? `${streamAttendanceSummary.presentStudents.length} Present in ${selectedStream}`
                    : 'Requires today’s attendance'}
                </div>
              </div>
              {studentSelectionMode === 'present_only' && (
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                audioFX.playClick();
                setStudentSelectionMode('individual');
              }}
              className={`p-3 rounded-xl border text-left transition cursor-pointer flex items-center justify-between ${
                studentSelectionMode === 'individual'
                  ? 'bg-cyan-950/50 border-cyan-400 text-cyan-200 shadow-[0_0_12px_rgba(0,240,255,0.25)] font-bold'
                  : 'bg-slate-900/70 border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
            >
              <div>
                <div className="font-hud text-xs font-bold flex items-center gap-1.5">
                  <CheckSquare className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Select Individual Students</span>
                </div>
                <div className="text-[10px] font-mono-code text-slate-400 mt-0.5">
                  Pick specific {selectedStream} scholars
                </div>
              </div>
              {studentSelectionMode === 'individual' && (
                <Check className="w-4 h-4 text-cyan-400 shrink-0" />
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                audioFX.playClick();
                setStudentSelectionMode('all_in_stream');
              }}
              className={`p-3 rounded-xl border text-left transition cursor-pointer flex items-center justify-between ${
                studentSelectionMode === 'all_in_stream'
                  ? 'bg-purple-950/50 border-purple-400 text-purple-200 shadow-[0_0_12px_rgba(168,85,247,0.25)] font-bold'
                  : 'bg-slate-900/70 border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
            >
              <div>
                <div className="font-hud text-xs font-bold flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-purple-400" />
                  <span>Select All Students</span>
                </div>
                <div className="text-[10px] font-mono-code text-slate-400 mt-0.5">
                  All {streamStudents.length} students in {selectedStream}
                </div>
              </div>
              {studentSelectionMode === 'all_in_stream' && (
                <Check className="w-4 h-4 text-purple-400 shrink-0" />
              )}
            </button>

            {/* 4. Skip Student Selection Option */}
            <button
              type="button"
              onClick={() => {
                audioFX.playClick();
                setStudentSelectionMode('skip');
              }}
              className={`p-3 rounded-xl border text-left transition cursor-pointer flex items-center justify-between ${
                studentSelectionMode === 'skip' || (studentSelectionMode as any) === 'none'
                  ? 'bg-amber-950/50 border-amber-400 text-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.25)] font-bold'
                  : 'bg-slate-900/70 border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
            >
              <div>
                <div className="font-hud text-xs font-bold flex items-center gap-1.5">
                  <UserX className="w-3.5 h-3.5 text-amber-400" />
                  <span>Skip Student Selection</span>
                </div>
                <div className="text-[10px] font-mono-code text-slate-400 mt-0.5">
                  Unassigned / Paper Export
                </div>
              </div>
              {(studentSelectionMode === 'skip' || (studentSelectionMode as any) === 'none') && (
                <Check className="w-4 h-4 text-amber-400 shrink-0" />
              )}
            </button>
          </div>

          {/* Warning if "All Present Students" is chosen but attendance is unrecorded/missing */}
          {studentSelectionMode === 'present_only' && !streamAttendanceSummary.configured && (
            <div className="p-3.5 rounded-2xl bg-amber-950/40 border border-amber-400/50 text-amber-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="font-hud text-amber-300 block">
                    Attendance Data Not Recorded Yet for {selectedStream} ({todayDateKey})
                  </strong>
                  <span className="text-[11px] text-amber-200/90">
                    Unrecorded students are never assumed present. Please mark today&apos;s attendance for {selectedStream} or select students manually.
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    handleBulkStreamAttendance('present');
                  }}
                  className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-hud text-[11px] font-bold transition cursor-pointer"
                >
                  Mark All {selectedStream} Present
                </button>
                <button
                  type="button"
                  onClick={() => setShowAttendanceRollCall(true)}
                  className="px-3 py-1.5 rounded-xl bg-slate-900 border border-amber-400/40 text-amber-300 hover:text-white font-hud text-[11px] font-bold transition cursor-pointer"
                >
                  Open Roll Call
                </button>
              </div>
            </div>
          )}

          {/* Warning if attendance is configured but 0 students are marked present */}
          {studentSelectionMode === 'present_only' &&
            streamAttendanceSummary.configured &&
            streamAttendanceSummary.presentStudents.length === 0 && (
              <div className="p-3.5 rounded-2xl bg-amber-950/40 border border-amber-400/50 text-amber-200 text-xs flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    0 students are currently marked Present in {selectedStream} today ({streamAttendanceSummary.absentOrLeaveCount} absent/leave, {streamAttendanceSummary.unrecordedCount} unrecorded).
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAttendanceRollCall(true)}
                  className="px-3 py-1 rounded-lg bg-slate-900 border border-amber-400/40 text-amber-300 text-[11px] font-mono-code font-bold cursor-pointer"
                >
                  Edit Roll Call
                </button>
              </div>
            )}

          {/* Inline Daily Attendance Roll Call Editor */}
          {showAttendanceRollCall && (
            <div className="p-4 rounded-2xl bg-slate-900/90 border border-emerald-500/30 space-y-3 animate-in fade-in">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800">
                <div>
                  <h4 className="font-hud font-bold text-xs text-emerald-300 uppercase">
                    Daily Attendance Roll Call — {selectedStream} Stream ({todayDateKey})
                  </h4>
                  <p className="text-[11px] font-mono-code text-slate-400">
                    Present: {streamAttendanceSummary.presentStudents.length} • Absent/Leave: {streamAttendanceSummary.absentOrLeaveCount} • Unrecorded: {streamAttendanceSummary.unrecordedCount}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => handleBulkStreamAttendance('present')}
                    className="px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 hover:bg-emerald-500 hover:text-black text-[11px] font-mono-code font-bold transition cursor-pointer"
                  >
                    Mark All Present
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBulkStreamAttendance('absent')}
                    className="px-2.5 py-1 rounded-lg bg-red-500/20 border border-red-400/40 text-red-300 hover:bg-red-500 hover:text-white text-[11px] font-mono-code font-bold transition cursor-pointer"
                  >
                    Mark All Absent
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBulkStreamAttendance('clear')}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white text-[11px] font-mono-code transition cursor-pointer"
                  >
                    Reset Unrecorded
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {streamStudents.map((st) => {
                  const currentStatus: AttendanceStatus =
                    streamAttendanceSummary.record.statuses[st.id] || 'unrecorded';
                  return (
                    <div
                      key={st.id}
                      className="p-2.5 rounded-xl bg-slate-950/90 border border-slate-800 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="font-hud font-bold text-xs text-white truncate">
                          {st.name}
                        </div>
                        <div className="text-[10px] font-mono-code text-slate-400">
                          {st.id} • {st.stream}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {(['present', 'absent', 'leave'] as AttendanceStatus[]).map((statusOpt) => {
                          const active = currentStatus === statusOpt;
                          const label =
                            statusOpt === 'present' ? 'P' : statusOpt === 'absent' ? 'A' : 'L';
                          const btnColor = active
                            ? statusOpt === 'present'
                              ? 'bg-emerald-500 text-black border-emerald-400 font-bold'
                              : statusOpt === 'absent'
                              ? 'bg-red-500 text-white border-red-400 font-bold'
                              : 'bg-amber-500 text-black border-amber-400 font-bold'
                            : 'bg-slate-900 text-slate-400 border-slate-700 hover:text-white';
                          return (
                            <button
                              key={statusOpt}
                              type="button"
                              onClick={() => handleMarkStudentAttendance(st.id, statusOpt)}
                              title={`Mark ${st.name} as ${statusOpt.toUpperCase()}`}
                              className={`w-7 h-7 rounded-lg border font-mono-code text-[11px] transition cursor-pointer ${btnColor}`}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Stream-Wise Student Checkboxes Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
            {streamStudents.map((student) => {
              const isChecked = selectedStudentIds.includes(student.id);
              const attStatus: AttendanceStatus =
                streamAttendanceSummary.record.statuses[student.id] || 'unrecorded';
              const statusBadge =
                attStatus === 'present' || attStatus === 'late'
                  ? { label: 'PRESENT', cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40' }
                  : attStatus === 'absent'
                  ? { label: 'ABSENT', cls: 'bg-red-500/20 text-red-300 border-red-400/40' }
                  : attStatus === 'leave'
                  ? { label: 'ON LEAVE', cls: 'bg-amber-500/20 text-amber-300 border-amber-400/40' }
                  : { label: 'UNRECORDED', cls: 'bg-slate-800 text-slate-400 border-slate-700' };

              return (
                <button
                  key={student.id}
                  type="button"
                  onClick={() => handleToggleStudentId(student.id)}
                  className={`p-3 rounded-xl border text-left flex items-center justify-between gap-2 transition cursor-pointer ${
                    isChecked
                      ? 'bg-cyan-950/40 border-cyan-400/80 text-white shadow-[0_0_10px_rgba(0,240,255,0.15)]'
                      : 'bg-slate-900/50 border-slate-800/80 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {isChecked ? (
                      <CheckSquare className="w-4 h-4 text-cyan-400 shrink-0" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-600 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="font-hud font-bold text-xs truncate">{student.name}</div>
                      <div className="text-[10px] font-mono-code text-slate-400">
                        {student.id} • {student.stream}
                      </div>
                    </div>
                  </div>

                  <span
                    className={`px-1.5 py-0.5 rounded border text-[9px] font-mono-code font-bold shrink-0 ${statusBadge.cls}`}
                  >
                    {statusBadge.label}
                  </span>
                </button>
              );
            })}
          </div>

          {studentSelectionMode === 'skip' || (studentSelectionMode as any) === 'none' ? (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-400/40 text-amber-300 text-xs font-mono-code flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <CheckCircle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  <strong>Student Selection Skipped:</strong> This exam will be created as a general institutional assessment without assigning individual scholars (ideal for physical paper printing, question bank exports, or unassigned practice).
                </span>
              </div>
              <button
                type="button"
                onClick={() => setStudentSelectionMode('all_in_stream')}
                className="px-2.5 py-1 rounded-lg bg-amber-500/20 border border-amber-400/40 text-amber-200 hover:text-white text-[11px] font-bold cursor-pointer shrink-0"
              >
                Assign Stream Students
              </button>
            </div>
          ) : selectedStudentIds.length === 0 ? (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-400/40 text-amber-300 text-xs font-mono-code flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Please select at least 1 student in {selectedStream} or choose &quot;Skip Student Selection&quot;.</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setStudentSelectionMode('skip')}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white text-[11px] font-bold cursor-pointer"
                >
                  Skip Selection
                </button>
                <button
                  type="button"
                  onClick={() => setStudentSelectionMode('all_in_stream')}
                  className="px-2.5 py-1 rounded-lg bg-amber-500/20 border border-amber-400/40 text-amber-200 hover:text-white text-[11px] font-bold cursor-pointer"
                >
                  Select All {selectedStream}
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {/* EXPANDABLE ADVANCED SETTINGS ACCORDION */}
        <div className="pt-2 border-t border-cyan-500/20">
          <button
            type="button"
            onClick={() => {
              audioFX.playClick();
              setShowAdvancedSettings(!showAdvancedSettings);
            }}
            className="flex items-center justify-between w-full p-3 rounded-2xl bg-slate-950/70 border border-slate-800 hover:border-cyan-500/40 text-left transition cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-cyan-400" />
              <span className="font-hud font-bold text-xs text-white uppercase tracking-wider">
                Optional Advanced Settings
              </span>
              <span className="text-[10px] font-mono-code text-slate-400">
                (Difficulty, Teacher Notes & Instructions, CBSE General Instructions)
              </span>
            </div>
            {showAdvancedSettings ? (
              <ChevronUp className="w-4 h-4 text-cyan-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            )}
          </button>

          {showAdvancedSettings && (
            <div className="p-4 mt-3 rounded-2xl bg-slate-950/80 border border-cyan-500/20 space-y-4 animate-in fade-in">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Difficulty Selector */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-hud font-bold text-cyan-300 uppercase">
                    Difficulty Profile
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {DIFFICULTY_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          audioFX.playClick();
                          setDifficulty(opt.id);
                        }}
                        className={`p-2 rounded-xl border text-left text-xs transition cursor-pointer ${
                          difficulty === opt.id
                            ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 font-bold'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        <div className="font-hud">{opt.label}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Teacher Name */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-hud font-bold text-cyan-300 uppercase">
                    Teacher In-Charge
                  </label>
                  <input
                    type="text"
                    value={teacherName}
                    onChange={(e) => setTeacherName(e.target.value)}
                    placeholder="Teacher Name"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-hud text-xs focus:border-cyan-400 outline-none"
                  />
                  <div className="flex items-center gap-1.5 flex-wrap pt-1">
                    {AUTHORITATIVE_TEACHER_LIST.map((name) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => {
                          audioFX.playClick();
                          setTeacherName(name);
                        }}
                        className={`text-[10px] font-mono-code px-2 py-0.5 rounded transition ${
                          teacherName === name
                            ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-400/40'
                            : 'bg-slate-900 text-slate-400 hover:text-white'
                        }`}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Instructions Presets */}
              <div className="space-y-1.5">
                <label className="block text-xs font-hud font-bold text-cyan-300 uppercase">
                  Additional Teacher Guidelines
                </label>
                <div className="flex items-center gap-1.5 flex-wrap mb-2">
                  {INSTRUCTION_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => handleToggleInstructionPreset(preset)}
                      className={`px-2 py-1 rounded-lg text-[10px] font-mono-code transition cursor-pointer border ${
                        teacherInstructions.includes(preset)
                          ? 'bg-purple-500/20 border-purple-400 text-purple-300 font-bold'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      + {preset}
                    </button>
                  ))}
                </div>
                <textarea
                  rows={2}
                  value={teacherInstructions}
                  onChange={(e) => setTeacherInstructions(e.target.value)}
                  placeholder="e.g. Include 2 numerical problems on Hooke's Law, emphasize assertion-reason questions, board exam focus..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-sans text-xs focus:border-cyan-400 outline-none"
                />
              </div>

              {/* General Instructions for Question Paper */}
              {studioMode === 'paper' && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-hud font-bold text-cyan-300 uppercase">
                    Printed Paper General Instructions
                  </label>
                  <textarea
                    rows={3}
                    value={generalInstructions}
                    onChange={(e) => setGeneralInstructions(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono-code text-[11px] focus:border-cyan-400 outline-none"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* LIVE SELECTION SUMMARY & GENERATE ACTION BAR */}
        <div className="p-4 sm:p-5 rounded-2xl bg-slate-950/90 border border-cyan-500/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap text-xs font-mono-code">
              <span className="text-slate-400">Specifications:</span>
              <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-400/30">
                {selectedClass}
              </span>
              <span className={`px-2 py-0.5 rounded border ${streamInfo.badge}`}>
                {selectedStream}
              </span>
              <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-white font-bold">
                {selectedSubject}
              </span>
              <span className="text-slate-300">
                {selectedChapters.length} {selectedChapters.length === 1 ? 'Chapter' : 'Chapters'}
              </span>
              <span>•</span>
              <span className="text-emerald-300 font-bold">
                Assigned: {selectedStudentIds.length} {selectedStream} Student{selectedStudentIds.length === 1 ? '' : 's'}
              </span>
              <span>•</span>
              <span className="text-purple-300 font-bold">{difficulty}</span>
            </div>

            {studioMode === 'paper' ? (
              <div className="flex items-center gap-2 flex-wrap text-xs font-mono-code">
                <span className="text-slate-400">Paper Breakdown:</span>
                <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-500/30">
                  MCQ: {paperCounts.mcq}
                </span>
                <span className="px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-500/30">
                  Short 2M: {paperCounts.short_2}
                </span>
                <span className="px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-500/30">
                  Short 3M: {paperCounts.short_3}
                </span>
                <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-500/30">
                  Case: {paperCounts.case_study}
                </span>
                <span className="px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-500/30">
                  Long 5M: {paperCounts.long_5}
                </span>
                <span className="text-white font-bold ml-1">
                  = {totalPaperQuestions} Qs ({totalPaperMarks} Marks) • {durationMinutes} Mins
                </span>
              </div>
            ) : (
              <div className="text-xs font-mono-code text-slate-300">
                Speed Quiz: <strong className="text-white">{speedQuestionCount} Questions</strong> ({speedQuestionType}) • Assigned to{' '}
                <strong className="text-cyan-300">
                  {selectedStudentsList.map((s) => s.name).join(', ') || 'None'}
                </strong>
              </div>
            )}
          </div>

          {/* Generate Button */}
          <button
            type="button"
            disabled={!isValid}
            onClick={handleGenerateQuiz}
            className="flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-2xl bg-gradient-to-r from-cyan-500 via-blue-600 to-purple-600 hover:brightness-110 text-white font-hud text-xs sm:text-sm font-bold shadow-[0_0_25px_rgba(0,240,255,0.4)] disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer shrink-0"
          >
            {isGenerating ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 text-cyan-300" />
            )}
            <span>
              {isGenerating
                ? 'GENERATING WITH GEMINI...'
                : studioMode === 'paper'
                ? 'GENERATE QUESTION PAPER'
                : 'GENERATE AI QUIZ'}
            </span>
          </button>
        </div>

        {/* Loading Progress State */}
        {isGenerating && (
          <div className="p-4 rounded-2xl bg-cyan-950/40 border border-cyan-400/50 flex items-center gap-3 animate-pulse text-cyan-200 text-xs font-mono-code">
            <RefreshCw className="w-4 h-4 animate-spin text-cyan-400 shrink-0" />
            <div className="space-y-0.5">
              <strong className="text-white font-hud block">Gemini AI Assessment Engine Active</strong>
              <span>{genStep}</span>
            </div>
          </div>
        )}

        {/* Error notice with Retry button */}
        {generationError && (
          <div className="p-4 rounded-2xl bg-red-950/40 border border-red-500/40 text-red-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{generationError}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleGenerateQuiz}
                disabled={isGenerating}
                className="px-3 py-1.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-400/50 text-red-200 hover:text-white font-hud font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>RETRY</span>
              </button>
              <button
                type="button"
                onClick={() => setGenerationError(null)}
                className="px-2.5 py-1.5 rounded-xl text-slate-400 hover:text-white"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
          </>
        )}
      </div>

      {/* SAVED QUIZZES, QUESTION PAPERS & DRAFTS SECTION */}
      <div className="p-5 sm:p-6 rounded-3xl jarvis-panel border border-cyan-500/20 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-hud font-bold text-sm text-cyan-300 uppercase tracking-wider flex items-center gap-2">
              <FileText className="w-4 h-4" />
              <span>Saved Question Papers & Quizzes ({savedQuizzes.length})</span>
            </h3>
            <p className="text-xs text-slate-400 font-sans mt-0.5">
              Review, edit, preview white A4 paper, print, duplicate or publish assessments for Class 11.
            </p>
          </div>
        </div>

        {savedQuizzes.length === 0 ? (
          <div className="p-8 rounded-2xl bg-slate-950/50 border border-slate-800 text-center text-slate-400 text-xs font-mono-code">
            No question papers or quizzes saved yet. Configure questions above and click &quot;GENERATE QUESTION PAPER&quot; to begin.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {savedQuizzes.map((quiz) => {
              const isDraft = quiz.isDraft;
              const isPaper = quiz.isQuestionPaper || !!quiz.paperConfig;
              const totalMarks = quiz.questions.reduce((sum, q) => {
                if (q.questionType === 'case_study' && Array.isArray(q.subQuestions) && q.subQuestions.length > 0) {
                  return sum + q.subQuestions.reduce((sSum, sq) => sSum + (sq.marks || 1), 0);
                }
                return sum + (q.marks || 1);
              }, 0);

              return (
                <div
                  key={quiz.id}
                  className="p-4 sm:p-5 rounded-2xl bg-slate-950/80 border border-cyan-500/20 hover:border-cyan-500/40 transition flex flex-col justify-between"
                >
                  <div>
                    {/* Header badges */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-400/30 text-cyan-300 text-[10px] font-mono-code font-bold uppercase">
                          {quiz.subject}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300 text-[10px] font-mono-code font-bold">
                          {quiz.stream || 'ALL'}
                        </span>
                        {isPaper && (
                          <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-400/30 text-[10px] font-mono-code font-bold">
                            CBSE PAPER
                          </span>
                        )}
                        {quiz.assignedStudentIds && quiz.assignedStudentIds.length > 0 && (
                          <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-400/30 text-[10px] font-mono-code font-bold">
                            {quiz.assignedStudentIds.length} ASSIGNED
                          </span>
                        )}
                      </div>

                      {isDraft ? (
                        <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-400/30 text-[10px] font-mono-code font-bold">
                          DRAFT
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[10px] font-mono-code font-bold flex items-center gap-1">
                          <CheckCircle className="w-2.5 h-2.5" /> PUBLISHED
                        </span>
                      )}
                    </div>

                    <h4 className="font-hud font-bold text-base text-white mt-2">
                      {quiz.title}
                    </h4>

                    {quiz.chapter && (
                      <p className="text-xs font-mono-code text-cyan-400 mt-1 flex items-center gap-1">
                        <Layers className="w-3 h-3 shrink-0" />
                        <span className="truncate">{quiz.chapter}</span>
                      </p>
                    )}

                    <div className="flex items-center gap-3 text-[11px] font-mono-code text-slate-400 mt-2 flex-wrap">
                      <span>{quiz.questions.length} Questions</span>
                      <span>•</span>
                      <span className="text-cyan-300 font-bold">{totalMarks} Total Marks</span>
                      <span>•</span>
                      <span>{Math.round(quiz.timeLimitSeconds / 60)} Mins</span>
                      {quiz.createdBy && (
                        <>
                          <span>•</span>
                          <span className="text-purple-300">{quiz.createdBy}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="mt-4 pt-3 border-t border-cyan-500/10 flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => {
                          audioFX.playClick();
                          setLocalPreviewPaper(quiz);
                        }}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-purple-950/40 border border-purple-500/40 hover:border-purple-400 text-purple-300 hover:text-white text-xs font-hud font-bold transition cursor-pointer"
                        title="View Question Paper & Print"
                      >
                        <Eye className="w-3 h-3" />
                        <span>VIEW</span>
                      </button>

                      <button
                        type="button"
                        onClick={async () => {
                          audioFX.playClick();
                          try {
                            await downloadQuestionPaperPdf(quiz, { includeAnswerKey: false });
                            audioFX.playSuccess();
                          } catch (err: any) {
                            audioFX.playError();
                            setGenerationError(
                              `PDF download failed for "${quiz.title}": ${err?.message || 'Please retry'}`
                            );
                          }
                        }}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 hover:border-emerald-400 text-emerald-300 hover:text-white text-xs font-hud font-bold transition cursor-pointer"
                        title="Download Official Question Paper PDF"
                      >
                        <Download className="w-3 h-3" />
                        <span>DOWNLOAD PDF</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onQuizGeneratedForReview(quiz)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-900 border border-cyan-500/30 hover:border-cyan-400 text-cyan-300 text-xs font-hud font-bold transition cursor-pointer"
                        title="Open Review & Edit Studio"
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>EDIT & REVIEW</span>
                      </button>

                      {isDraft && (
                        <button
                          type="button"
                          onClick={() => onPublishQuiz(quiz)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-cyan-950/40 border border-cyan-500/40 text-cyan-300 hover:text-white text-xs font-hud font-bold transition cursor-pointer"
                        >
                          <Send className="w-3 h-3" />
                          <span>PUBLISH</span>
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onStartQuiz(quiz)}
                        className="p-2 rounded-xl text-cyan-400 hover:text-white hover:bg-cyan-500/20 transition cursor-pointer"
                        title="Solve on Smart Board / Student View"
                      >
                        <Play className="w-4 h-4 fill-current" />
                      </button>

                      <button
                        type="button"
                        onClick={() => onDeleteQuiz(quiz.id)}
                        className="p-2 rounded-xl text-slate-500 hover:text-red-400 hover:bg-red-950/30 transition cursor-pointer"
                        title="Delete Assessment"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Direct Question Paper A4 Preview & Print Modal */}
      <QuestionPaperPreviewModal
        quiz={localPreviewPaper}
        isOpen={!!localPreviewPaper}
        onClose={() => setLocalPreviewPaper(null)}
      />

      {/* Offline Warning Modal */}
      <OfflineWarningModal
        isOpen={isOfflineWarningOpen}
        onClose={() => setIsOfflineWarningOpen(false)}
        featureName="AI Quiz Generation"
      />
    </div>
  );
};
