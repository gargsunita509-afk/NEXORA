import React, { useState, useMemo } from 'react';
import {
  Sparkles,
  BookOpen,
  FileText,
  Sliders,
  Check,
  CheckSquare,
  Square,
  RefreshCw,
  AlertCircle,
  HelpCircle,
  Award,
  Clock,
  ChevronDown,
  ChevronUp,
  Download,
  Printer,
  ShieldCheck,
  Feather,
  PenTool,
  Bookmark,
  Layers,
  Info,
} from 'lucide-react';
import { Quiz, QuizDifficulty, StreamType, Student } from '../../types';
import { storage } from '../../services/storage';
import { resolveApiUrl } from '../../services/updateService';
import { apkAwareFetch as fetch } from '../../services/apkApiBridge';
import { audioFX } from '../../services/audio';
import { OfflineWarningModal } from '../OfflineWarningModal';
import { QuestionPaperPreviewModal } from './QuestionPaperPreviewModal';
import {
  downloadQuestionPaperPdf,
  openSavedAndroidPdf,
  isAndroidApkEnvironment,
} from '../../utils/pdfGenerator';
import {
  HORNBILL_PROSE_CHAPTERS,
  HORNBILL_POETRY_POEMS,
  SNAPSHOTS_CHAPTERS,
  ENGLISH_READING_SKILLS,
  OFFICIAL_CBSE_GRAMMAR_TOPICS,
  CUSTOM_PRACTICE_GRAMMAR_TOPICS,
  ENGLISH_WRITING_TASKS,
  OFFICIAL_CBSE_2026_PRESET,
  UNIT_TEST_20_PRESET,
  MID_TERM_40_PRESET,
  EnglishLiteratureItem,
} from '../../data/cbseEnglishSyllabus';

interface EnglishQuestionPaperGeneratorProps {
  onQuizGeneratedForReview: (quiz: Quiz) => void;
  savedQuizzes: Quiz[];
  onDeleteQuiz: (id: string) => Promise<void>;
  onPublishQuiz: (quiz: Quiz) => Promise<void>;
  onStartQuiz: (quiz: Quiz) => void;
  onSwitchSubject?: (subject: string) => void;
}

export const EnglishQuestionPaperGenerator: React.FC<EnglishQuestionPaperGeneratorProps> = ({
  onQuizGeneratedForReview,
  savedQuizzes,
  onDeleteQuiz,
  onPublishQuiz,
  onStartQuiz,
  onSwitchSubject,
}) => {
  // Preset selection
  const [activePresetId, setActivePresetId] = useState<string>('official_cbse_2026');

  // Exam Meta
  const [examName, setExamName] = useState<string>('English Core Annual Examination 2026–27');
  const [examDate, setExamDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [durationMinutes, setDurationMinutes] = useState<number>(180);
  const [selectedStream, setSelectedStream] = useState<StreamType>('PCM');
  const [teacherName, setTeacherName] = useState<string>('Nancy Mam');
  const [difficulty, setDifficulty] = useState<QuizDifficulty>('Mixed');
  const [teacherNotes, setTeacherNotes] = useState<string>('');

  // 1. TEXTBOOK LITERATURE SELECTION
  const [selectedProseIds, setSelectedProseIds] = useState<string[]>(
    HORNBILL_PROSE_CHAPTERS.map((c) => c.id)
  );
  const [selectedPoetryIds, setSelectedPoetryIds] = useState<string[]>(
    HORNBILL_POETRY_POEMS.map((p) => p.id)
  );
  const [selectedSnapshotsIds, setSelectedSnapshotsIds] = useState<string[]>(
    SNAPSHOTS_CHAPTERS.map((s) => s.id)
  );

  // 2. READING SKILLS CONFIGURATION
  const [includeUnseenPassage, setIncludeUnseenPassage] = useState<boolean>(true);
  const [unseenPassageMarks, setUnseenPassageMarks] = useState<number>(10);
  const [includeCaseBased, setIncludeCaseBased] = useState<boolean>(true);
  const [caseBasedMarks, setCaseBasedMarks] = useState<number>(8);
  const [includeNoteMaking, setIncludeNoteMaking] = useState<boolean>(true);
  const [noteMakingMarks, setNoteMakingMarks] = useState<number>(5);
  const [includeSummary, setIncludeSummary] = useState<boolean>(true);
  const [summaryMarks, setSummaryMarks] = useState<number>(3);

  // 3. GRAMMAR CONFIGURATION
  const [selectedGrammarTopicIds, setSelectedGrammarTopicIds] = useState<string[]>([
    'tenses',
    'clauses',
    'reordering',
    'transformation',
  ]);
  const [grammarTopicConfig, setGrammarTopicConfig] = useState<
    Record<
      string,
      {
        questionCount: number;
        marksPerQuestion: number;
        format: 'mcq' | 'fill_in';
        difficulty: QuizDifficulty;
        showOptions: boolean;
      }
    >
  >({
    tenses: { questionCount: 2, marksPerQuestion: 1, format: 'mcq', difficulty: 'Medium', showOptions: true },
    clauses: { questionCount: 2, marksPerQuestion: 1, format: 'mcq', difficulty: 'Medium', showOptions: true },
    reordering: { questionCount: 2, marksPerQuestion: 1, format: 'mcq', difficulty: 'Medium', showOptions: true },
    transformation: { questionCount: 1, marksPerQuestion: 1, format: 'mcq', difficulty: 'Medium', showOptions: true },
  });

  // 4. CREATIVE WRITING SKILLS CONFIGURATION
  const [selectedWritingTaskIds, setSelectedWritingTaskIds] = useState<string[]>([
    'classified_advertisement',
    'poster_writing',
    'speech_writing',
    'debate_writing',
  ]);
  const [writingTaskMarks, setWritingTaskMarks] = useState<Record<string, number>>({
    classified_advertisement: 3,
    poster_writing: 3,
    speech_writing: 5,
    debate_writing: 5,
  });
  const [writingInternalChoice, setWritingInternalChoice] = useState<Record<string, boolean>>({
    classified_advertisement: true,
    poster_writing: true,
    speech_writing: true,
    debate_writing: true,
  });

  // 5. LITERATURE QUESTION FORMATS & TARGET CHAPTERS
  const [includePoetryExtract, setIncludePoetryExtract] = useState<boolean>(true);
  const [poetryExtractMarks, setPoetryExtractMarks] = useState<number>(3);

  const [includeProseExtract, setIncludeProseExtract] = useState<boolean>(true);
  const [proseExtractMarks, setProseExtractMarks] = useState<number>(3);

  const [includeSnapshotsExtract, setIncludeSnapshotsExtract] = useState<boolean>(true);
  const [snapshotsExtractMarks, setSnapshotsExtractMarks] = useState<number>(4);

  const [hornbillShortCount, setHornbillShortCount] = useState<number>(2); // 2 out of 3
  const [hornbillShortMarksPerQ, setHornbillShortMarksPerQ] = useState<number>(3);

  const [snapshotsShortCount, setSnapshotsShortCount] = useState<number>(1); // 1 out of 2
  const [snapshotsShortMarksPerQ, setSnapshotsShortMarksPerQ] = useState<number>(3);

  // 6-Mark Long Answers: Specific chapter & section targeting
  const [includeHornbillLongAnswer, setIncludeHornbillLongAnswer] = useState<boolean>(true);
  const [hornbillLongAnswerMarks, setHornbillLongAnswerMarks] = useState<number>(6);
  const [hornbillLongScope, setHornbillLongScope] = useState<'prose' | 'poetry' | 'both'>('both');
  const [hornbillLongTargetChapter, setHornbillLongTargetChapter] = useState<string>('any');

  const [includeSnapshotsLongAnswer, setIncludeSnapshotsLongAnswer] = useState<boolean>(true);
  const [snapshotsLongAnswerMarks, setSnapshotsLongAnswerMarks] = useState<number>(6);
  const [snapshotsLongTargetChapter, setSnapshotsLongTargetChapter] = useState<string>('any');

  // Student selection
  const [studentSelectionMode, setStudentSelectionMode] = useState<'all' | 'skip'>('skip');

  // UI state
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [genStep, setGenStep] = useState<string>('');
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [localPreviewPaper, setLocalPreviewPaper] = useState<Quiz | null>(null);
  const [isOfflineWarningOpen, setIsOfflineWarningOpen] = useState<boolean>(false);
  const [pdfSaveNotice, setPdfSaveNotice] = useState<{
    message: string;
    savedUri?: string;
    filename?: string;
  } | null>(null);

  // Active section tab
  const [activeTab, setActiveTab] = useState<'syllabus' | 'reading' | 'grammar' | 'writing' | 'literature' | 'saved'>('syllabus');

  // Apply Presets
  const handleApplyPreset = (presetId: string) => {
    audioFX.playClick();
    setActivePresetId(presetId);

    if (presetId === 'official_cbse_2026') {
      const p = OFFICIAL_CBSE_2026_PRESET;
      setExamName('CBSE Class 11 English Core Annual Examination 2026–27');
      setDurationMinutes(p.durationMinutes);
      // Reading
      setIncludeUnseenPassage(p.sections.sectionA.includeUnseen);
      setUnseenPassageMarks(p.sections.sectionA.unseenMarks);
      setIncludeCaseBased(p.sections.sectionA.includeCaseBased);
      setCaseBasedMarks(p.sections.sectionA.caseBasedMarks);
      setIncludeNoteMaking(p.sections.sectionA.includeNoteMaking);
      setNoteMakingMarks(p.sections.sectionA.noteMakingMarks);
      setIncludeSummary(p.sections.sectionA.includeSummary);
      setSummaryMarks(p.sections.sectionA.summaryMarks);
      // Grammar
      setSelectedGrammarTopicIds(['tenses', 'clauses', 'reordering', 'transformation']);
      setGrammarTopicConfig({
        tenses: { questionCount: 2, marksPerQuestion: 1, format: 'mcq', difficulty: 'Medium', showOptions: true },
        clauses: { questionCount: 2, marksPerQuestion: 1, format: 'mcq', difficulty: 'Medium', showOptions: true },
        reordering: { questionCount: 2, marksPerQuestion: 1, format: 'mcq', difficulty: 'Medium', showOptions: true },
        transformation: { questionCount: 1, marksPerQuestion: 1, format: 'mcq', difficulty: 'Medium', showOptions: true },
      });
      // Writing
      setSelectedWritingTaskIds(['classified_advertisement', 'poster_writing', 'speech_writing', 'debate_writing']);
      setWritingTaskMarks({
        classified_advertisement: 3,
        poster_writing: 3,
        speech_writing: 5,
        debate_writing: 5,
      });
      // Literature
      setIncludePoetryExtract(true);
      setPoetryExtractMarks(3);
      setIncludeProseExtract(true);
      setProseExtractMarks(3);
      setIncludeSnapshotsExtract(true);
      setSnapshotsExtractMarks(4);
      setHornbillShortCount(2);
      setHornbillShortMarksPerQ(3);
      setSnapshotsShortCount(1);
      setSnapshotsShortMarksPerQ(3);
      setIncludeHornbillLongAnswer(true);
      setHornbillLongAnswerMarks(6);
      setIncludeSnapshotsLongAnswer(true);
      setSnapshotsLongAnswerMarks(6);
    } else if (presetId === 'unit_test_20') {
      const p = UNIT_TEST_20_PRESET;
      setExamName('English Core Periodic Assessment (20 Marks)');
      setDurationMinutes(p.durationMinutes);
      setIncludeUnseenPassage(true);
      setUnseenPassageMarks(5);
      setIncludeCaseBased(false);
      setIncludeNoteMaking(false);
      setIncludeSummary(false);
      setSelectedGrammarTopicIds(['tenses', 'clauses']);
      setSelectedWritingTaskIds(['classified_advertisement']);
      setIncludePoetryExtract(true);
      setPoetryExtractMarks(3);
      setIncludeProseExtract(false);
      setIncludeSnapshotsExtract(false);
      setHornbillShortCount(1);
      setSnapshotsShortCount(0);
      setIncludeHornbillLongAnswer(true);
      setHornbillLongAnswerMarks(4);
      setIncludeSnapshotsLongAnswer(false);
    } else if (presetId === 'mid_term_40') {
      const p = MID_TERM_40_PRESET;
      setExamName('English Core Mid-Term Examination 2026–27');
      setDurationMinutes(p.durationMinutes);
      setIncludeUnseenPassage(true);
      setUnseenPassageMarks(8);
      setIncludeCaseBased(false);
      setIncludeNoteMaking(false);
      setIncludeSummary(true);
      setSummaryMarks(4);
      setSelectedGrammarTopicIds(['tenses', 'clauses', 'reordering', 'transformation']);
      setSelectedWritingTaskIds(['classified_advertisement', 'speech_writing']);
      setIncludePoetryExtract(true);
      setPoetryExtractMarks(3);
      setIncludeProseExtract(true);
      setProseExtractMarks(3);
      setIncludeSnapshotsExtract(false);
      setHornbillShortCount(2);
      setSnapshotsShortCount(0);
      setIncludeHornbillLongAnswer(true);
      setHornbillLongAnswerMarks(6);
      setIncludeSnapshotsLongAnswer(false);
    } else {
      setActivePresetId('custom_practice');
    }
  };

  // Live Marks Breakdown Calculation
  const sectionAMarks = useMemo(() => {
    let sum = 0;
    if (includeUnseenPassage) sum += Number(unseenPassageMarks) || 0;
    if (includeCaseBased) sum += Number(caseBasedMarks) || 0;
    if (includeNoteMaking) sum += Number(noteMakingMarks) || 0;
    if (includeSummary) sum += Number(summaryMarks) || 0;
    return sum;
  }, [includeUnseenPassage, unseenPassageMarks, includeCaseBased, caseBasedMarks, includeNoteMaking, noteMakingMarks, includeSummary, summaryMarks]);

  const grammarMarks = useMemo(() => {
    return selectedGrammarTopicIds.reduce((sum, tid) => {
      const cfg = grammarTopicConfig[tid];
      return sum + (cfg ? (cfg.questionCount || 0) * (cfg.marksPerQuestion || 1) : 0);
    }, 0);
  }, [selectedGrammarTopicIds, grammarTopicConfig]);

  const writingMarks = useMemo(() => {
    return selectedWritingTaskIds.reduce((sum, tid) => {
      return sum + (writingTaskMarks[tid] || 0);
    }, 0);
  }, [selectedWritingTaskIds, writingTaskMarks]);

  const sectionBMarks = grammarMarks + writingMarks;

  const sectionCMarks = useMemo(() => {
    let sum = 0;
    if (includePoetryExtract) sum += Number(poetryExtractMarks) || 0;
    if (includeProseExtract) sum += Number(proseExtractMarks) || 0;
    if (includeSnapshotsExtract) sum += Number(snapshotsExtractMarks) || 0;
    sum += (Number(hornbillShortCount) || 0) * (Number(hornbillShortMarksPerQ) || 0);
    sum += (Number(snapshotsShortCount) || 0) * (Number(snapshotsShortMarksPerQ) || 0);
    if (includeHornbillLongAnswer) sum += Number(hornbillLongAnswerMarks) || 0;
    if (includeSnapshotsLongAnswer) sum += Number(snapshotsLongAnswerMarks) || 0;
    return sum;
  }, [
    includePoetryExtract,
    poetryExtractMarks,
    includeProseExtract,
    proseExtractMarks,
    includeSnapshotsExtract,
    snapshotsExtractMarks,
    hornbillShortCount,
    hornbillShortMarksPerQ,
    snapshotsShortCount,
    snapshotsShortMarksPerQ,
    includeHornbillLongAnswer,
    hornbillLongAnswerMarks,
    includeSnapshotsLongAnswer,
    snapshotsLongAnswerMarks,
  ]);

  const totalCalculatedMarks = sectionAMarks + sectionBMarks + sectionCMarks;

  // Determine if configuration matches official CBSE pattern (80 marks with 26 + 23 + 31)
  const isOfficialPattern = useMemo(() => {
    return (
      totalCalculatedMarks === 80 &&
      sectionAMarks === 26 &&
      sectionBMarks === 23 &&
      sectionCMarks === 31 &&
      includeUnseenPassage &&
      includeCaseBased &&
      includeNoteMaking &&
      includeSummary &&
      selectedGrammarTopicIds.length === 4 &&
      selectedWritingTaskIds.length === 4
    );
  }, [totalCalculatedMarks, sectionAMarks, sectionBMarks, sectionCMarks, includeUnseenPassage, includeCaseBased, includeNoteMaking, includeSummary, selectedGrammarTopicIds, selectedWritingTaskIds]);

  // Overall Generation Handler
  const handleGenerateEnglishPaper = async () => {
    if (totalCalculatedMarks <= 0) {
      setGenerationError('Please select at least one section with valid marks.');
      return;
    }
    if (selectedProseIds.length === 0 && selectedPoetryIds.length === 0 && selectedSnapshotsIds.length === 0) {
      setGenerationError('Please select at least one literature chapter or poem from Hornbill / Snapshots.');
      return;
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setIsOfflineWarningOpen(true);
      return;
    }

    audioFX.playClick();
    setIsGenerating(true);
    setGenerationError(null);
    setGenStep('Synthesizing CBSE Class 11 English Core Examination Structure...');

    try {
      setTimeout(() => {
        setGenStep('Compiling Reading Comprehension Passages, Note-Making & Summary...');
      }, 700);

      setTimeout(() => {
        setGenStep('Formulating Grammar, Creative Writing prompts & Literature Extracts...');
      }, 1500);

      // Selected literature titles
      const chosenProse = HORNBILL_PROSE_CHAPTERS.filter((c) => selectedProseIds.includes(c.id)).map((c) => c.title);
      const chosenPoetry = HORNBILL_POETRY_POEMS.filter((p) => selectedPoetryIds.includes(p.id)).map((p) => p.title);
      const chosenSnapshots = SNAPSHOTS_CHAPTERS.filter((s) => selectedSnapshotsIds.includes(s.id)).map((s) => s.title);

      // Collect recent English questions & passages so consecutive generations never repeat content
      const recentEnglishItems: string[] = [];
      for (const sq of savedQuizzes) {
        if (sq.subject && sq.subject.toLowerCase().includes('english') && Array.isArray(sq.questions)) {
          for (const qItem of sq.questions) {
            if (qItem.casePassage) recentEnglishItems.push(qItem.casePassage.slice(0, 160));
            if (qItem.question) recentEnglishItems.push(qItem.question.slice(0, 160));
          }
        }
      }

      const payload = {
        isQuestionPaper: true,
        isEnglishPaper: true,
        classLevel: 'Class 11TH',
        stream: selectedStream,
        subject: 'English Core',
        examName,
        examDate,
        durationMinutes: Number(durationMinutes) || 180,
        totalMarks: totalCalculatedMarks,
        isOfficialCbsePattern: isOfficialPattern,
        difficulty,
        teacherName,
        teacherNotes,
        recentQuestions: recentEnglishItems.slice(-40),
        generationNonce: `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
        readingConfig: {
          includeUnseen: includeUnseenPassage,
          unseenMarks: unseenPassageMarks,
          includeCaseBased,
          caseBasedMarks,
          includeNoteMaking,
          noteMakingMarks,
          includeSummary,
          summaryMarks,
          totalSectionAMarks: sectionAMarks,
        },
        grammarConfig: {
          selectedTopics: selectedGrammarTopicIds,
          topicConfig: grammarTopicConfig,
          totalGrammarMarks: grammarMarks,
        },
        writingConfig: {
          selectedTasks: selectedWritingTaskIds,
          taskMarks: writingTaskMarks,
          internalChoice: writingInternalChoice,
          totalWritingMarks: writingMarks,
        },
        literatureConfig: {
          chosenProse,
          chosenPoetry,
          chosenSnapshots,
          includePoetryExtract,
          poetryExtractMarks,
          includeProseExtract,
          proseExtractMarks,
          includeSnapshotsExtract,
          snapshotsExtractMarks,
          hornbillShortCount,
          hornbillShortMarksPerQ,
          snapshotsShortCount,
          snapshotsShortMarksPerQ,
          includeHornbillLongAnswer,
          hornbillLongAnswerMarks,
          hornbillLongScope,
          hornbillLongTargetChapter,
          includeHornbillLongAnswerChoice: true,
          includeSnapshotsLongAnswer,
          snapshotsLongAnswerMarks,
          snapshotsLongTargetChapter,
          totalSectionCMarks: sectionCMarks,
        },
        assignedStudentIds: [],
        assignedStudentNames: [],
        assignmentMode: 'skip',
      };

      const apiUrl = resolveApiUrl('/api/gemini/quiz');
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server returned HTTP ${response.status}`);
      }

      const data = await response.json();
      if (!data.success || !data.quiz || !Array.isArray(data.quiz.questions) || data.quiz.questions.length === 0) {
        throw new Error(data.error || 'Failed to synthesize English question paper.');
      }

      const uniquePaperId = `quiz-eng-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const generatedPaper: Quiz = {
        ...data.quiz,
        id: uniquePaperId,
        createdAt: Date.now(),
        isQuestionPaper: true,
        isEnglishPaper: true,
        source: 'teacher',
        createdBy: teacherName,
        paperConfig: {
          examName: examName || 'Class 11 English Core Examination',
          examDate,
          durationMinutes: Number(durationMinutes) || 180,
          generalInstructions: [
            'This question paper is divided into three sections: Section A (Reading), Section B (Grammar and Creative Writing Skills), and Section C (Literature).',
            'All questions are compulsory. Internal choices are provided in designated questions.',
            'Marks are indicated against each question. Adhere strictly to the prescribed word limits.',
          ],
        },
      };

      // Save to storage and open in Teacher Studio Review & Preview
      await storage.saveQuiz(generatedPaper);
      onQuizGeneratedForReview(generatedPaper);
      audioFX.playSuccess();
    } catch (err: any) {
      console.error('Failed to generate English paper:', err);
      setGenerationError(err.message || 'Generation failed. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Subject Switcher Bar */}
      <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-blue-950/60 via-indigo-950/40 to-slate-950/80 border border-blue-500/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-500/20 text-blue-300 border border-blue-400/40">
            <Feather className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-hud font-extrabold text-lg sm:text-xl text-white tracking-wide">
                ENGLISH CORE GENERATOR
              </h2>
              <span className="text-[10px] font-mono-code font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/40">
                CBSE 2026–27
              </span>
            </div>
            <p className="text-xs text-slate-400 font-sans mt-0.5">
              Teacher In-Charge: <strong className="text-cyan-300">Nancy Mam</strong> • NCERT Hornbill, Snapshots, Reading &amp; Grammar
            </p>
          </div>
        </div>

        {/* Action: Switch to other subjects if needed */}
        {onSwitchSubject && (
          <button
            onClick={() => onSwitchSubject('Physics')}
            className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-300 hover:text-white hover:border-cyan-400 transition flex items-center gap-1.5 cursor-pointer"
          >
            <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
            <span>Switch to Science / Commerce Subjects</span>
          </button>
        )}
      </div>

      {/* Official Preset Selector Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          {
            id: 'official_cbse_2026',
            title: 'CBSE Official Pattern',
            marks: '80 Marks',
            desc: 'Section A (26m) • Section B (23m) • Section C (31m)',
            badge: 'Official 2026–27',
            accent: 'border-cyan-400 bg-cyan-950/40 text-cyan-200',
          },
          {
            id: 'unit_test_20',
            title: 'Unit Assessment',
            marks: '20 Marks',
            desc: 'Reading (5m) • Grammar/Writing (5m) • Literature (10m)',
            badge: 'Periodic Test',
            accent: 'border-emerald-400 bg-emerald-950/40 text-emerald-200',
          },
          {
            id: 'mid_term_40',
            title: 'Mid-Term Exam',
            marks: '40 Marks',
            desc: 'Reading (12m) • Grammar/Writing (10m) • Literature (18m)',
            badge: 'Term Exam',
            accent: 'border-purple-400 bg-purple-950/40 text-purple-200',
          },
        ].map((preset) => {
          const isSelected = activePresetId === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => handleApplyPreset(preset.id)}
              className={`p-3.5 rounded-xl border text-left transition-all relative cursor-pointer ${
                isSelected
                  ? `${preset.accent} shadow-[0_0_15px_rgba(0,240,255,0.25)]`
                  : 'bg-slate-900/60 border-white/10 text-slate-300 hover:border-white/20'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-hud font-bold text-sm tracking-wide">{preset.title}</span>
                <span className="text-[10px] font-mono-code font-bold px-1.5 py-0.5 rounded bg-black/40">
                  {preset.marks}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 leading-snug">{preset.desc}</p>
            </button>
          );
        })}
      </div>

      {/* Live Paper Breakdown HUD Bar */}
      <div className="p-4 rounded-xl bg-slate-900/90 border border-cyan-500/30 flex flex-wrap items-center justify-between gap-4 text-xs">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <span className="text-[10px] uppercase font-mono-code text-slate-400 block">Paper Status</span>
            <span
              className={`font-hud font-bold text-xs uppercase px-2 py-0.5 rounded-full inline-block mt-0.5 ${
                isOfficialPattern
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
              }`}
            >
              {isOfficialPattern ? 'Official CBSE 2026–27 Pattern' : 'Custom Practice Paper'}
            </span>
          </div>

          <div className="border-l border-white/10 pl-3">
            <span className="text-[10px] uppercase font-mono-code text-slate-400 block">Sec A (Reading)</span>
            <span className="font-bold text-white font-mono">{sectionAMarks} Marks</span>
          </div>

          <div className="border-l border-white/10 pl-3">
            <span className="text-[10px] uppercase font-mono-code text-slate-400 block">Sec B (Grammar &amp; Writing)</span>
            <span className="font-bold text-white font-mono">{sectionBMarks} Marks</span>
          </div>

          <div className="border-l border-white/10 pl-3">
            <span className="text-[10px] uppercase font-mono-code text-slate-400 block">Sec C (Literature)</span>
            <span className="font-bold text-white font-mono">{sectionCMarks} Marks</span>
          </div>

          <div className="border-l border-white/10 pl-3">
            <span className="text-[10px] uppercase font-mono-code text-cyan-400 block font-bold">Total Marks</span>
            <span className="font-hud font-extrabold text-base text-cyan-300 font-mono">
              {totalCalculatedMarks} / {isOfficialPattern ? '80' : 'Custom'}
            </span>
          </div>
        </div>

        {/* Generate Button in HUD */}
        <button
          onClick={handleGenerateEnglishPaper}
          disabled={isGenerating || totalCalculatedMarks <= 0}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 via-cyan-500 to-teal-400 hover:from-blue-400 hover:to-teal-300 text-slate-950 font-hud font-bold text-xs tracking-wider uppercase transition shadow-[0_0_20px_rgba(0,240,255,0.3)] disabled:opacity-50 cursor-pointer flex items-center gap-2"
        >
          {isGenerating ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>{genStep || 'Generating...'}</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              <span>Generate English Paper</span>
            </>
          )}
        </button>
      </div>

      {generationError && (
        <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-500/40 text-xs text-rose-300 flex items-start gap-2.5 animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <span>{generationError}</span>
        </div>
      )}

      {/* Navigation Tabs for Configuration Panels */}
      <div className="flex border-b border-white/10 overflow-x-auto gap-2 pb-1 text-xs">
        {[
          { id: 'syllabus', label: '1. Textbooks & Chapters' },
          { id: 'reading', label: '2. Section A: Reading' },
          { id: 'grammar', label: '3. Section B: Grammar' },
          { id: 'writing', label: '4. Section B: Creative Writing' },
          { id: 'literature', label: '5. Section C: Literature Formats' },
          { id: 'saved', label: 'Saved Papers' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-3 py-2 rounded-lg font-hud font-semibold transition whitespace-nowrap cursor-pointer ${
              activeTab === tab.id
                ? 'bg-cyan-950/60 text-cyan-300 border border-cyan-400/40'
                : 'text-slate-400 hover:text-white hover:bg-slate-900/50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* PANEL 1: TEXTBOOK LITERATURE SELECTION */}
      {activeTab === 'syllabus' && (
        <div className="space-y-6 animate-in fade-in">
          {/* Hornbill Prose */}
          <div className="p-4 sm:p-5 rounded-xl bg-slate-900/70 border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-hud font-bold text-sm text-cyan-300 flex items-center gap-2">
                  <Bookmark className="w-4 h-4" /> Hornbill — Prescribed Prose (NCERT)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">5 prescribed chapters in official Class 11 English Core curriculum</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedProseIds(HORNBILL_PROSE_CHAPTERS.map((c) => c.id))}
                  className="text-[11px] text-cyan-400 hover:underline cursor-pointer"
                >
                  Select All
                </button>
                <span className="text-slate-600">|</span>
                <button
                  type="button"
                  onClick={() => setSelectedProseIds([])}
                  className="text-[11px] text-slate-400 hover:underline cursor-pointer"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {HORNBILL_PROSE_CHAPTERS.map((chap) => {
                const isChecked = selectedProseIds.includes(chap.id);
                return (
                  <label
                    key={chap.id}
                    className={`p-3 rounded-lg border flex items-start gap-3 cursor-pointer transition ${
                      isChecked
                        ? 'bg-cyan-950/30 border-cyan-500/40 text-cyan-100'
                        : 'bg-slate-950/40 border-white/5 text-slate-400 hover:border-white/15'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => {
                        setSelectedProseIds((prev) =>
                          e.target.checked ? [...prev, chap.id] : prev.filter((id) => id !== chap.id)
                        );
                      }}
                      className="mt-0.5 accent-cyan-400"
                    />
                    <div className="min-w-0">
                      <div className="font-semibold text-xs text-white leading-tight">{chap.title}</div>
                      <div className="text-[10px] text-slate-400 font-mono-code mt-0.5">{chap.author}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Hornbill Poetry */}
          <div className="p-4 sm:p-5 rounded-xl bg-slate-900/70 border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-hud font-bold text-sm text-indigo-300 flex items-center gap-2">
                  <Feather className="w-4 h-4" /> Hornbill — Prescribed Poetry (NCERT)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">5 prescribed poems with extract-based assessment</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedPoetryIds(HORNBILL_POETRY_POEMS.map((p) => p.id))}
                  className="text-[11px] text-indigo-400 hover:underline cursor-pointer"
                >
                  Select All
                </button>
                <span className="text-slate-600">|</span>
                <button
                  type="button"
                  onClick={() => setSelectedPoetryIds([])}
                  className="text-[11px] text-slate-400 hover:underline cursor-pointer"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {HORNBILL_POETRY_POEMS.map((poem) => {
                const isChecked = selectedPoetryIds.includes(poem.id);
                return (
                  <label
                    key={poem.id}
                    className={`p-3 rounded-lg border flex items-start gap-3 cursor-pointer transition ${
                      isChecked
                        ? 'bg-indigo-950/30 border-indigo-500/40 text-indigo-100'
                        : 'bg-slate-950/40 border-white/5 text-slate-400 hover:border-white/15'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => {
                        setSelectedPoetryIds((prev) =>
                          e.target.checked ? [...prev, poem.id] : prev.filter((id) => id !== poem.id)
                        );
                      }}
                      className="mt-0.5 accent-indigo-400"
                    />
                    <div className="min-w-0">
                      <div className="font-semibold text-xs text-white leading-tight">{poem.title}</div>
                      <div className="text-[10px] text-slate-400 font-mono-code mt-0.5">{poem.author}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Snapshots Supplementary Reader */}
          <div className="p-4 sm:p-5 rounded-xl bg-slate-900/70 border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-hud font-bold text-sm text-teal-300 flex items-center gap-2">
                  <BookOpen className="w-4 h-4" /> Snapshots — Supplementary Reader (NCERT)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">5 prescribed stories (rationalized syllabus compliant)</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedSnapshotsIds(SNAPSHOTS_CHAPTERS.map((s) => s.id))}
                  className="text-[11px] text-teal-400 hover:underline cursor-pointer"
                >
                  Select All
                </button>
                <span className="text-slate-600">|</span>
                <button
                  type="button"
                  onClick={() => setSelectedSnapshotsIds([])}
                  className="text-[11px] text-slate-400 hover:underline cursor-pointer"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {SNAPSHOTS_CHAPTERS.map((chap) => {
                const isChecked = selectedSnapshotsIds.includes(chap.id);
                return (
                  <label
                    key={chap.id}
                    className={`p-3 rounded-lg border flex items-start gap-3 cursor-pointer transition ${
                      isChecked
                        ? 'bg-teal-950/30 border-teal-500/40 text-teal-100'
                        : 'bg-slate-950/40 border-white/5 text-slate-400 hover:border-white/15'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => {
                        setSelectedSnapshotsIds((prev) =>
                          e.target.checked ? [...prev, chap.id] : prev.filter((id) => id !== chap.id)
                        );
                      }}
                      className="mt-0.5 accent-teal-400"
                    />
                    <div className="min-w-0">
                      <div className="font-semibold text-xs text-white leading-tight">{chap.title}</div>
                      <div className="text-[10px] text-slate-400 font-mono-code mt-0.5">{chap.author}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* PANEL 2: SECTION A — READING SKILLS */}
      {activeTab === 'reading' && (
        <div className="space-y-4 animate-in fade-in">
          <div className="p-4 rounded-xl bg-slate-900/60 border border-white/10 text-xs text-slate-400 leading-relaxed">
            Configure each component of Section A (Reading Skills) independently. Official 2026–27 CBSE structure assigns 26 marks:
            Unseen Passage (10m) + Case-based Passage (8m) + Note-Making (5m) + Summary (3m).
          </div>

          {/* 1. Unseen Passage */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer font-hud font-bold text-sm text-cyan-300">
                <input
                  type="checkbox"
                  checked={includeUnseenPassage}
                  onChange={(e) => setIncludeUnseenPassage(e.target.checked)}
                  className="accent-cyan-400"
                />
                1. Unseen Comprehension Passage (600–750 Words)
              </label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Marks:</span>
                <select
                  value={unseenPassageMarks}
                  onChange={(e) => setUnseenPassageMarks(Number(e.target.value))}
                  disabled={!includeUnseenPassage}
                  className="px-2.5 py-1 rounded-lg bg-slate-950 border border-white/15 text-xs text-white focus:outline-none"
                >
                  <option value={8}>8 Marks</option>
                  <option value={10}>10 Marks (Official)</option>
                  <option value={12}>12 Marks</option>
                </select>
              </div>
            </div>
            <p className="text-xs text-slate-400 pl-6">
              Factual, descriptive, or literary discursive passage with MCQs and short analytical comprehension questions.
            </p>
          </div>

          {/* 2. Case-based Passage */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer font-hud font-bold text-sm text-cyan-300">
                <input
                  type="checkbox"
                  checked={includeCaseBased}
                  onChange={(e) => setIncludeCaseBased(e.target.checked)}
                  className="accent-cyan-400"
                />
                2. Case-Based Factual Passage with Visual / Data Input (350–400 Words)
              </label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Marks:</span>
                <select
                  value={caseBasedMarks}
                  onChange={(e) => setCaseBasedMarks(Number(e.target.value))}
                  disabled={!includeCaseBased}
                  className="px-2.5 py-1 rounded-lg bg-slate-950 border border-white/15 text-xs text-white focus:outline-none"
                >
                  <option value={6}>6 Marks</option>
                  <option value={8}>8 Marks (Official)</option>
                  <option value={10}>10 Marks</option>
                </select>
              </div>
            </div>
            <p className="text-xs text-slate-400 pl-6">
              Factual input accompanied by statistical table or chart, assessing data correlation and textual evidence matching.
            </p>
          </div>

          {/* 3. Note-Making */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer font-hud font-bold text-sm text-cyan-300">
                <input
                  type="checkbox"
                  checked={includeNoteMaking}
                  onChange={(e) => setIncludeNoteMaking(e.target.checked)}
                  className="accent-cyan-400"
                />
                3. Note-Making with Numbered &amp; Indented Notes + Abbreviation Key
              </label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Marks:</span>
                <select
                  value={noteMakingMarks}
                  onChange={(e) => setNoteMakingMarks(Number(e.target.value))}
                  disabled={!includeNoteMaking}
                  className="px-2.5 py-1 rounded-lg bg-slate-950 border border-white/15 text-xs text-white focus:outline-none"
                >
                  <option value={4}>4 Marks</option>
                  <option value={5}>5 Marks (Official: Title 1m, Notes 2m, Key 1m, Indent 1m)</option>
                  <option value={6}>6 Marks</option>
                </select>
              </div>
            </div>
            <p className="text-xs text-slate-400 pl-6">
              Condensed note-making passage (200–250 words) with structured headings, sub-headings, and minimum 4 abbreviations.
            </p>
          </div>

          {/* 4. Summary Writing */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer font-hud font-bold text-sm text-cyan-300">
                <input
                  type="checkbox"
                  checked={includeSummary}
                  onChange={(e) => setIncludeSummary(e.target.checked)}
                  className="accent-cyan-400"
                />
                4. Summary Writing (Up to 50 Words)
              </label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Marks:</span>
                <select
                  value={summaryMarks}
                  onChange={(e) => setSummaryMarks(Number(e.target.value))}
                  disabled={!includeSummary}
                  className="px-2.5 py-1 rounded-lg bg-slate-950 border border-white/15 text-xs text-white focus:outline-none"
                >
                  <option value={2}>2 Marks</option>
                  <option value={3}>3 Marks (Official: Content 2m, Expression 1m)</option>
                  <option value={4}>4 Marks</option>
                </select>
              </div>
            </div>
            <p className="text-xs text-slate-400 pl-6">
              Synthesized summary based on the note-making passage within the strict 50-word syllabus limit.
            </p>
          </div>
        </div>
      )}

      {/* PANEL 3: SECTION B — GRAMMAR */}
      {activeTab === 'grammar' && (
        <div className="space-y-4 animate-in fade-in">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Official CBSE Class 11 Core Grammar Topics (Total Marks: {grammarMarks})</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedGrammarTopicIds(['tenses', 'clauses', 'reordering', 'transformation'])}
                className="text-cyan-400 hover:underline cursor-pointer"
              >
                Select All Official
              </button>
              <span className="text-slate-600">|</span>
              <button
                type="button"
                onClick={() => setSelectedGrammarTopicIds([])}
                className="text-slate-400 hover:underline cursor-pointer"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {OFFICIAL_CBSE_GRAMMAR_TOPICS.map((topic) => {
              const isSelected = selectedGrammarTopicIds.includes(topic.id);
              const cfg = grammarTopicConfig[topic.id] || {
                questionCount: 2,
                marksPerQuestion: 1,
                format: 'mcq',
                difficulty: 'Medium',
                showOptions: true,
              };

              return (
                <div
                  key={topic.id}
                  className={`p-4 rounded-xl border transition ${
                    isSelected ? 'bg-slate-900/90 border-cyan-500/40' : 'bg-slate-950/50 border-white/10 opacity-75'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <label className="flex items-center gap-2 cursor-pointer font-hud font-bold text-sm text-white">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          setSelectedGrammarTopicIds((prev) =>
                            e.target.checked ? [...prev, topic.id] : prev.filter((id) => id !== topic.id)
                          );
                        }}
                        className="accent-cyan-400"
                      />
                      <span>{topic.title}</span>
                    </label>

                    {/* Topic Controls */}
                    {isSelected && (
                      <div className="flex flex-wrap items-center gap-3 text-xs pl-6 sm:pl-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-400">Questions:</span>
                          <input
                            type="number"
                            min={1}
                            max={10}
                            value={cfg.questionCount}
                            onChange={(e) => {
                              const val = Math.max(1, Number(e.target.value) || 1);
                              setGrammarTopicConfig((prev) => ({
                                ...prev,
                                [topic.id]: { ...cfg, questionCount: val },
                              }));
                            }}
                            className="w-14 px-2 py-0.5 rounded bg-slate-950 border border-white/20 text-center font-mono text-white"
                          />
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-400">Marks/Q:</span>
                          <input
                            type="number"
                            min={1}
                            max={5}
                            value={cfg.marksPerQuestion}
                            onChange={(e) => {
                              const val = Math.max(1, Number(e.target.value) || 1);
                              setGrammarTopicConfig((prev) => ({
                                ...prev,
                                [topic.id]: { ...cfg, marksPerQuestion: val },
                              }));
                            }}
                            className="w-12 px-2 py-0.5 rounded bg-slate-950 border border-white/20 text-center font-mono text-white"
                          />
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-400">Format:</span>
                          <select
                            value={cfg.format}
                            onChange={(e) => {
                              const val = e.target.value as any;
                              setGrammarTopicConfig((prev) => ({
                                ...prev,
                                [topic.id]: { ...cfg, format: val, showOptions: val === 'mcq' },
                              }));
                            }}
                            className="px-2 py-0.5 rounded bg-slate-950 border border-white/20 text-white"
                          >
                            <option value="mcq">MCQ (4 Options)</option>
                            <option value="fill_in">Direct Fill-in</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>

                  <p className="text-[11px] text-slate-400 mt-1 pl-6">{topic.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* PANEL 4: SECTION B — CREATIVE WRITING SKILLS */}
      {activeTab === 'writing' && (
        <div className="space-y-4 animate-in fade-in">
          <div className="p-4 rounded-xl bg-slate-900/60 border border-white/10 text-xs text-slate-400 leading-relaxed">
            Prescribed 2026–27 Writing Tasks (Total Marks: {writingMarks}). Choose which tasks to include; each task can offer internal choice (1 out of 2 questions).
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {ENGLISH_WRITING_TASKS.map((task) => {
              const isSelected = selectedWritingTaskIds.includes(task.id);
              const marks = writingTaskMarks[task.id] || task.officialMarks;
              const hasChoice = writingInternalChoice[task.id] ?? true;

              return (
                <div
                  key={task.id}
                  className={`p-4 rounded-xl border transition ${
                    isSelected ? 'bg-slate-900/90 border-cyan-500/40' : 'bg-slate-950/50 border-white/10 opacity-70'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer font-hud font-bold text-sm text-white">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          setSelectedWritingTaskIds((prev) =>
                            e.target.checked ? [...prev, task.id] : prev.filter((id) => id !== task.id)
                          );
                        }}
                        className="accent-cyan-400"
                      />
                      <span>{task.title}</span>
                    </label>
                    <span className="text-[10px] font-mono-code font-bold px-2 py-0.5 rounded bg-cyan-950 border border-cyan-500/30 text-cyan-300">
                      {task.wordLimit}
                    </span>
                  </div>

                  {isSelected && (
                    <div className="mt-3 pt-2.5 border-t border-white/10 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400">Marks:</span>
                        <select
                          value={marks}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setWritingTaskMarks((prev) => ({ ...prev, [task.id]: val }));
                          }}
                          className="px-2 py-0.5 rounded bg-slate-950 border border-white/20 text-white"
                        >
                          <option value={3}>3 Marks</option>
                          <option value={4}>4 Marks</option>
                          <option value={5}>5 Marks</option>
                        </select>
                      </div>

                      <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                        <input
                          type="checkbox"
                          checked={hasChoice}
                          onChange={(e) => {
                            setWritingInternalChoice((prev) => ({ ...prev, [task.id]: e.target.checked }));
                          }}
                          className="accent-cyan-400"
                        />
                        <span>Internal Choice (1 out of 2)</span>
                      </label>
                    </div>
                  )}

                  <div className="text-[11px] text-slate-400 mt-2 space-y-0.5 pl-6">
                    <div>{task.formatRubric}</div>
                    <div>{task.contentRubric}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* PANEL 5: SECTION C — LITERATURE QUESTION TYPES & TARGETING */}
      {activeTab === 'literature' && (
        <div className="space-y-5 animate-in fade-in">
          {/* Extracts Configuration */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-white/10 space-y-3">
            <h4 className="font-hud font-bold text-sm text-cyan-300">Extract-Based Questions</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              {/* Hornbill Poetry Extract */}
              <div className="p-3 rounded-lg bg-slate-950/60 border border-white/10 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer font-semibold text-white">
                  <input
                    type="checkbox"
                    checked={includePoetryExtract}
                    onChange={(e) => setIncludePoetryExtract(e.target.checked)}
                    className="accent-cyan-400"
                  />
                  <span>Hornbill Poetry Extract</span>
                </label>
                <div className="flex items-center justify-between text-slate-400">
                  <span>Marks (3 Qs × 1m):</span>
                  <input
                    type="number"
                    min={1}
                    max={6}
                    value={poetryExtractMarks}
                    onChange={(e) => setPoetryExtractMarks(Number(e.target.value) || 3)}
                    className="w-12 px-2 py-0.5 rounded bg-slate-900 border border-white/20 text-center text-white"
                  />
                </div>
              </div>

              {/* Hornbill Prose Extract */}
              <div className="p-3 rounded-lg bg-slate-950/60 border border-white/10 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer font-semibold text-white">
                  <input
                    type="checkbox"
                    checked={includeProseExtract}
                    onChange={(e) => setIncludeProseExtract(e.target.checked)}
                    className="accent-cyan-400"
                  />
                  <span>Hornbill Prose Extract</span>
                </label>
                <div className="flex items-center justify-between text-slate-400">
                  <span>Marks (3 Qs × 1m):</span>
                  <input
                    type="number"
                    min={1}
                    max={6}
                    value={proseExtractMarks}
                    onChange={(e) => setProseExtractMarks(Number(e.target.value) || 3)}
                    className="w-12 px-2 py-0.5 rounded bg-slate-900 border border-white/20 text-center text-white"
                  />
                </div>
              </div>

              {/* Snapshots Prose Extract */}
              <div className="p-3 rounded-lg bg-slate-950/60 border border-white/10 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer font-semibold text-white">
                  <input
                    type="checkbox"
                    checked={includeSnapshotsExtract}
                    onChange={(e) => setIncludeSnapshotsExtract(e.target.checked)}
                    className="accent-cyan-400"
                  />
                  <span>Snapshots Extract</span>
                </label>
                <div className="flex items-center justify-between text-slate-400">
                  <span>Marks (4 Qs × 1m):</span>
                  <input
                    type="number"
                    min={1}
                    max={6}
                    value={snapshotsExtractMarks}
                    onChange={(e) => setSnapshotsExtractMarks(Number(e.target.value) || 4)}
                    className="w-12 px-2 py-0.5 rounded bg-slate-900 border border-white/20 text-center text-white"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Short Answer Questions (3 Marks each, 40-50 words) */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-white/10 space-y-3">
            <h4 className="font-hud font-bold text-sm text-cyan-300">Short Answer Questions (3 Marks, 40–50 words)</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="space-y-1.5">
                <span className="text-slate-300 font-semibold block">Hornbill Prose &amp; Poetry Short Questions:</span>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">Questions to answer:</span>
                  <select
                    value={hornbillShortCount}
                    onChange={(e) => setHornbillShortCount(Number(e.target.value))}
                    className="px-2.5 py-1 rounded bg-slate-950 border border-white/20 text-white"
                  >
                    <option value={1}>1 Question (3 Marks)</option>
                    <option value={2}>2 Questions out of 3 (6 Marks — Official)</option>
                    <option value={3}>3 Questions (9 Marks)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="text-slate-300 font-semibold block">Snapshots Short Questions:</span>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">Questions to answer:</span>
                  <select
                    value={snapshotsShortCount}
                    onChange={(e) => setSnapshotsShortCount(Number(e.target.value))}
                    className="px-2.5 py-1 rounded bg-slate-950 border border-white/20 text-white"
                  >
                    <option value={1}>1 Question out of 2 (3 Marks — Official)</option>
                    <option value={2}>2 Questions (6 Marks)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* 6-Mark Long Answer Questions: Complete Teacher Targeting */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-white/10 space-y-4">
            <h4 className="font-hud font-bold text-sm text-cyan-300 flex items-center gap-2">
              <Award className="w-4 h-4" /> 6-Mark Long Answer Questions (120–150 words)
            </h4>

            {/* Hornbill Long Answer */}
            <div className="p-3 rounded-lg bg-slate-950/60 border border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer font-semibold text-white text-xs">
                  <input
                    type="checkbox"
                    checked={includeHornbillLongAnswer}
                    onChange={(e) => setIncludeHornbillLongAnswer(e.target.checked)}
                    className="accent-cyan-400"
                  />
                  <span>Hornbill Long Answer Question (6 Marks)</span>
                </label>
                <span className="text-[10px] text-cyan-300 font-mono-code">Internal Choice (1 out of 2)</span>
              </div>

              {includeHornbillLongAnswer && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pl-6">
                  <div>
                    <span className="text-slate-400 block mb-1">Target Section:</span>
                    <select
                      value={hornbillLongScope}
                      onChange={(e) => setHornbillLongScope(e.target.value as any)}
                      className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-white/20 text-white"
                    >
                      <option value="both">Prose or Poetry (Balanced Choice)</option>
                      <option value="prose">Strictly Hornbill Prose Only</option>
                      <option value="poetry">Strictly Hornbill Poetry Only</option>
                    </select>
                  </div>

                  <div>
                    <span className="text-slate-400 block mb-1">Target Specific Chapter / Poem:</span>
                    <select
                      value={hornbillLongTargetChapter}
                      onChange={(e) => setHornbillLongTargetChapter(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-white/20 text-white"
                    >
                      <option value="any">Any Selected Hornbill Chapter/Poem</option>
                      <optgroup label="Prose">
                        {HORNBILL_PROSE_CHAPTERS.map((c) => (
                          <option key={c.id} value={c.title}>
                            {c.title}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Poetry">
                        {HORNBILL_POETRY_POEMS.map((p) => (
                          <option key={p.id} value={p.title}>
                            {p.title}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Snapshots Long Answer */}
            <div className="p-3 rounded-lg bg-slate-950/60 border border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer font-semibold text-white text-xs">
                  <input
                    type="checkbox"
                    checked={includeSnapshotsLongAnswer}
                    onChange={(e) => setIncludeSnapshotsLongAnswer(e.target.checked)}
                    className="accent-cyan-400"
                  />
                  <span>Snapshots Long Answer Question (6 Marks)</span>
                </label>
                <span className="text-[10px] text-teal-300 font-mono-code">Internal Choice (1 out of 2)</span>
              </div>

              {includeSnapshotsLongAnswer && (
                <div className="text-xs pl-6">
                  <span className="text-slate-400 block mb-1">Target Specific Snapshots Story:</span>
                  <select
                    value={snapshotsLongTargetChapter}
                    onChange={(e) => setSnapshotsLongTargetChapter(e.target.value)}
                    className="w-full sm:w-80 px-2.5 py-1.5 rounded bg-slate-900 border border-white/20 text-white"
                  >
                    <option value="any">Any Selected Snapshots Chapter</option>
                    {SNAPSHOTS_CHAPTERS.map((s) => (
                      <option key={s.id} value={s.title}>
                        {s.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* PANEL 6: SAVED ENGLISH PAPERS */}
      {activeTab === 'saved' && (
        <div className="space-y-3 animate-in fade-in">
          {pdfSaveNotice && (
            <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-400/50 text-emerald-300 text-xs font-mono-code flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{pdfSaveNotice.message}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {(pdfSaveNotice.savedUri || isAndroidApkEnvironment()) && (
                  <button
                    type="button"
                    onClick={() => openSavedAndroidPdf(pdfSaveNotice.savedUri, pdfSaveNotice.filename)}
                    className="px-2.5 py-1 rounded-lg bg-emerald-500/25 border border-emerald-400/60 text-emerald-200 hover:text-white font-hud font-bold text-[11px] cursor-pointer"
                  >
                    OPEN PDF
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPdfSaveNotice(null)}
                  className="px-2 py-0.5 text-slate-400 hover:text-white cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}
          {savedQuizzes.filter((q) => q.isQuestionPaper && (q.subject.toLowerCase().includes('english'))).length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs bg-slate-900/40 rounded-xl border border-white/10">
              No English question papers generated yet. Click "Generate English Paper" above to formulate an official CBSE 2026–27 examination paper.
            </div>
          ) : (
            savedQuizzes
              .filter((q) => q.isQuestionPaper && q.subject.toLowerCase().includes('english'))
              .map((paper) => (
                <div
                  key={paper.id}
                  className="p-4 rounded-xl bg-slate-900/80 border border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <h4 className="font-bold text-white text-sm">{paper.title}</h4>
                    <p className="text-slate-400 text-[11px] mt-0.5">
                      Subject: {paper.subject} • {paper.questions.length} Questions • Created by {paper.createdBy || 'Nancy Mam'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => {
                        audioFX.playClick();
                        setLocalPreviewPaper(paper);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-cyan-950/60 border border-cyan-500/30 text-cyan-300 hover:text-white hover:border-cyan-400 transition cursor-pointer font-hud font-bold"
                    >
                      View Paper
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        audioFX.playClick();
                        setPdfSaveNotice(null);
                        try {
                          const res = await downloadQuestionPaperPdf(paper, { includeAnswerKey: false });
                          audioFX.playSuccess();
                          const locLabel = res.storageLocation || `Downloads/${res.filename}`;
                          setPdfSaveNotice({
                            message: `PDF saved to Downloads (${locLabel})`,
                            savedUri: res.savedUri,
                            filename: res.filename,
                          });
                        } catch (err: any) {
                          audioFX.playError();
                          setGenerationError(`PDF download error: ${err?.message || 'Please try again'}`);
                        }
                      }}
                      className="px-3 py-1.5 rounded-lg bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 hover:text-white hover:border-emerald-400 transition cursor-pointer font-hud font-bold flex items-center gap-1"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download PDF</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onQuizGeneratedForReview(paper)}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 hover:text-white hover:border-cyan-400 transition cursor-pointer font-hud font-bold"
                    >
                      Edit &amp; Review
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteQuiz(paper.id)}
                      className="px-3 py-1.5 rounded-lg bg-rose-950/40 border border-rose-500/30 text-rose-300 hover:text-white hover:border-rose-400 transition cursor-pointer"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
          )}
        </div>
      )}

      {/* Preview & PDF Modal */}
      <QuestionPaperPreviewModal
        quiz={localPreviewPaper}
        isOpen={Boolean(localPreviewPaper)}
        onClose={() => setLocalPreviewPaper(null)}
      />

      {/* Offline Warning */}
      <OfflineWarningModal
        isOpen={isOfflineWarningOpen}
        onClose={() => setIsOfflineWarningOpen(false)}
        featureName="English Question Paper Generator"
      />
    </div>
  );
};
