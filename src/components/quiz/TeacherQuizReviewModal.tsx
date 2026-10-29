import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  Check,
  RefreshCw,
  Plus,
  Trash2,
  Save,
  Send,
  AlertCircle,
  Clock,
  Layers,
  BookOpen,
  CheckCircle2,
  HelpCircle,
  ChevronUp,
  ChevronDown,
  Eye,
  Copy,
  FileText,
  Award,
  Shuffle,
  Download,
} from 'lucide-react';
import { Quiz, QuizQuestion, QuestionType, CaseStudySubQuestion } from '../../types';
import { audioFX } from '../../services/audio';
import { resolveApiUrl } from '../../services/updateService';
import { apkAwareFetch as fetch } from '../../services/apkApiBridge';
import {
  ensureQuestionStableOptionIds,
  shuffleQuestionOptionsWithStableId,
} from '../../utils/mcqValidator';
import { downloadQuestionPaperPdf } from '../../utils/pdfGenerator';
import { QuestionPaperPreviewModal } from './QuestionPaperPreviewModal';
import { UniversalBackButton } from '../UniversalBackButton';

interface TeacherQuizReviewModalProps {
  quiz: Quiz;
  isOpen: boolean;
  onClose: () => void;
  onSaveDraft: (updatedQuiz: Quiz) => Promise<void>;
  onPublish: (updatedQuiz: Quiz) => Promise<void>;
  onRegenerateFullQuiz: (quiz: Quiz) => Promise<void>;
}

export const TeacherQuizReviewModal: React.FC<TeacherQuizReviewModalProps> = ({
  quiz,
  isOpen,
  onClose,
  onSaveDraft,
  onPublish,
  onRegenerateFullQuiz,
}) => {
  const [editedQuiz, setEditedQuiz] = useState<Quiz>(() => ({
    ...quiz,
    questions: (quiz.questions || []).map((q) => ensureQuestionStableOptionIds(q)),
  }));
  const [regeneratingQId, setRegeneratingQId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState<boolean>(false);
  const [isPaperPreviewOpen, setIsPaperPreviewOpen] = useState<boolean>(false);
  const [notice, setNotice] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  useEffect(() => {
    if (quiz) {
      setEditedQuiz({
        ...quiz,
        questions: (quiz.questions || []).map((q) => ensureQuestionStableOptionIds(q)),
      });
    }
  }, [quiz]);

  if (!isOpen) return null;

  // Live total marks calculation
  const totalMarks = editedQuiz.questions.reduce((sum, q) => {
    if (q.questionType === 'case_study' && Array.isArray(q.subQuestions) && q.subQuestions.length > 0) {
      return sum + q.subQuestions.reduce((sSum, sq) => sSum + (Number(sq.marks) || 1), 0);
    }
    return sum + (Number(q.marks) || (q.points ? Math.max(1, Math.round(q.points / 10)) : 1));
  }, 0);

  // Handle single question text / options / answer changes
  const handleUpdateQuestion = (index: number, updates: Partial<QuizQuestion>) => {
    const updatedQuestions = [...editedQuiz.questions];
    updatedQuestions[index] = { ...updatedQuestions[index], ...updates };
    setEditedQuiz({ ...editedQuiz, questions: updatedQuestions });
  };

  const handleUpdateOption = (qIndex: number, optIndex: number, value: string) => {
    const updatedQuestions = [...editedQuiz.questions];
    const targetQ = ensureQuestionStableOptionIds(updatedQuestions[qIndex]);
    const prevOptions = targetQ.options || ['Option A', 'Option B', 'Option C', 'Option D'];
    const newOptions = [...prevOptions];
    newOptions[optIndex] = value;

    const newOptionItems = (targetQ.optionItems || []).map((item, idx) =>
      idx === optIndex ? { ...item, text: value } : item
    );
    const currentCorrectIdx =
      typeof targetQ.correctIndex === 'number' && targetQ.correctIndex >= 0 && targetQ.correctIndex < 4
        ? targetQ.correctIndex
        : 0;

    updatedQuestions[qIndex] = {
      ...targetQ,
      options: newOptions,
      optionItems: newOptionItems,
      correctAnswerText: newOptions[currentCorrectIdx],
    };
    setEditedQuiz({ ...editedQuiz, questions: updatedQuestions });
  };

  const handleSetCorrectIndex = (qIndex: number, correctIdx: number) => {
    audioFX.playClick();
    const updatedQuestions = [...editedQuiz.questions];
    const targetQ = ensureQuestionStableOptionIds(updatedQuestions[qIndex]);
    const optItems = targetQ.optionItems || [];
    const options = targetQ.options || [];
    updatedQuestions[qIndex] = {
      ...targetQ,
      correctIndex: correctIdx,
      correctOptionId: optItems[correctIdx]?.id || `opt-${targetQ.id}-${correctIdx}`,
      correctAnswerText: options[correctIdx] || '',
    };
    setEditedQuiz({ ...editedQuiz, questions: updatedQuestions });
  };

  // Shuffle options for a single MCQ while updating the answer key via stable option IDs
  const handleShuffleQuestionOptions = (qIndex: number) => {
    audioFX.playClick();
    const updatedQuestions = [...editedQuiz.questions];
    const shuffled = shuffleQuestionOptionsWithStableId(updatedQuestions[qIndex]);
    updatedQuestions[qIndex] = shuffled;
    setEditedQuiz({ ...editedQuiz, questions: updatedQuestions });
    setNotice({
      message: `Shuffled options for Q${qIndex + 1}. Answer key automatically updated to Option ${String.fromCharCode(
        65 + (shuffled.correctIndex ?? 0)
      )}.`,
      type: 'info',
    });
  };

  // Reorder Questions: Move Up or Down
  const handleMoveQuestion = (index: number, direction: 'up' | 'down') => {
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === editedQuiz.questions.length - 1)) {
      return;
    }
    audioFX.playClick();
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const updated = [...editedQuiz.questions];
    const [moved] = updated.splice(index, 1);
    updated.splice(targetIndex, 0, moved);
    setEditedQuiz({ ...editedQuiz, questions: updated });
  };

  // Delete question
  const handleDeleteQuestion = (index: number) => {
    if (editedQuiz.questions.length <= 1) {
      setNotice({
        message: 'A quiz or examination paper must contain at least one question.',
        type: 'error',
      });
      return;
    }
    audioFX.playClick();
    const updatedQuestions = editedQuiz.questions.filter((_, idx) => idx !== index);
    setEditedQuiz({ ...editedQuiz, questions: updatedQuestions });
    setNotice({
      message: `Question #${index + 1} removed. Total marks updated.`,
      type: 'info',
    });
  };

  // Add question template
  const handleAddQuestion = () => {
    audioFX.playClick();
    const qId = `q-custom-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const newQ: QuizQuestion = ensureQuestionStableOptionIds({
      id: qId,
      question: 'New question statement here...',
      options: ['Choice A', 'Choice B', 'Choice C', 'Choice D'],
      correctIndex: 0,
      correctAnswerText: 'Choice A',
      marks: 1,
      points: 10,
      explanation: 'Academic reasoning according to NCERT CBSE Class 11.',
      chapter: editedQuiz.chapter || 'Core Chapter',
      questionType: 'mcq',
    });
    setEditedQuiz({
      ...editedQuiz,
      questions: [...editedQuiz.questions, newQ],
    });
    setNotice({
      message: 'New question added. Customize text, format, and marks.',
      type: 'success',
    });
  };

  // Update Case Study Subquestion
  const handleUpdateSubQuestion = (qIndex: number, sIndex: number, updates: Partial<CaseStudySubQuestion>) => {
    const updatedQuestions = [...editedQuiz.questions];
    const targetQ = updatedQuestions[qIndex];
    if (!targetQ.subQuestions) return;
    const newSubs = [...targetQ.subQuestions];
    newSubs[sIndex] = { ...newSubs[sIndex], ...updates };
    targetQ.subQuestions = newSubs;
    // Update parent marks to sum of subquestions
    targetQ.marks = newSubs.reduce((s, sq) => s + (Number(sq.marks) || 1), 0);
    setEditedQuiz({ ...editedQuiz, questions: updatedQuestions });
  };

  // Regenerate single question using backend endpoint (via resolveApiUrl for Web + Android APK)
  const handleRegenerateQuestion = async (qIndex: number) => {
    const targetQ = editedQuiz.questions[qIndex];
    audioFX.playClick();
    setRegeneratingQId(targetQ.id);
    setNotice(null);

    try {
      const response = await fetch(resolveApiUrl('/api/gemini/quiz/regenerate-question'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classLevel: editedQuiz.classLevel || 'Class 11TH',
          stream: editedQuiz.stream || 'PCM',
          subject: editedQuiz.subject,
          chapter: targetQ.chapter || editedQuiz.chapter,
          difficulty: editedQuiz.difficulty || 'Medium',
          questionType: targetQ.questionType || 'mcq',
          currentQuestionText: targetQ.question,
          instructions: editedQuiz.instructions || 'NCERT based, high precision',
          targetMarks: targetQ.marks || 1,
        }),
      });

      if (!response.ok) {
        const errPayload = await response.json().catch(() => ({}));
        throw new Error(errPayload.error || `Failed to regenerate question (status: ${response.status})`);
      }

      const data = await response.json();
      if (data.success && data.question) {
        const freshQ: QuizQuestion = ensureQuestionStableOptionIds({
          ...data.question,
          marks: targetQ.marks || data.question.marks || 1,
        });
        const updatedQuestions = [...editedQuiz.questions];
        updatedQuestions[qIndex] = freshQ;
        setEditedQuiz({ ...editedQuiz, questions: updatedQuestions });
        audioFX.playSuccess();
        setNotice({
          message: `Question #${qIndex + 1} regenerated successfully with fresh NCERT content!`,
          type: 'success',
        });
      } else {
        throw new Error(data.error || 'Server returned invalid question data');
      }
    } catch (err: any) {
      console.error('Error regenerating question:', err);
      audioFX.playError();
      setNotice({
        message: err.message || 'Unable to regenerate question. Please retry.',
        type: 'error',
      });
    } finally {
      setRegeneratingQId(null);
    }
  };

  // Save Draft
  const handleSaveDraft = async () => {
    setIsSaving(true);
    audioFX.playClick();
    try {
      await onSaveDraft({ ...editedQuiz, isDraft: true });
      setNotice({ message: 'Saved as draft successfully in Teacher Studio.', type: 'success' });
    } catch (e: any) {
      setNotice({ message: 'Error saving draft: ' + e.message, type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  // Duplicate as New Draft
  const handleDuplicateDraft = async () => {
    setIsSaving(true);
    audioFX.playClick();
    try {
      const duplicated: Quiz = {
        ...editedQuiz,
        id: `quiz-dup-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        title: `${editedQuiz.title} (Copy)`,
        isDraft: true,
        createdAt: Date.now(),
      };
      await onSaveDraft(duplicated);
      setEditedQuiz(duplicated);
      setNotice({ message: 'Paper duplicated as new draft in Teacher Studio.', type: 'success' });
    } catch (e: any) {
      setNotice({ message: 'Error duplicating draft: ' + e.message, type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  // Publish to Quiz Arena
  const handlePublish = async () => {
    setIsSaving(true);
    audioFX.playClick();
    try {
      await onPublish({ ...editedQuiz, isDraft: false, source: 'teacher' });
      audioFX.playSuccess();
      onClose();
    } catch (e: any) {
      setNotice({ message: 'Error publishing: ' + e.message, type: 'error' });
      setIsSaving(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-6 bg-black/80 backdrop-blur-md overflow-y-auto animate-in fade-in">
        <div className="relative w-full max-w-5xl my-auto rounded-3xl jarvis-panel border border-cyan-500/50 shadow-[0_0_50px_rgba(0,240,255,0.2)] bg-[#040814] flex flex-col max-h-[94vh]">
          {/* Header Bar */}
          <div className="p-4 sm:p-6 border-b border-cyan-500/20 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0 bg-slate-950/90 rounded-t-3xl">
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <UniversalBackButton
                  label="BACK TO STUDIO"
                  onClick={onClose}
                  className="py-1.5 min-h-[38px] text-xs"
                />
                <span className="px-2.5 py-1 rounded-xl bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 font-mono-code text-[11px] font-bold uppercase">
                  TEACHER STUDIO • REVIEW &amp; EDIT
                </span>
                <span className="text-xs font-mono-code text-slate-400">
                  {editedQuiz.classLevel || 'Class 11TH'} • {editedQuiz.stream}
                </span>
                <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-400/30 text-[10px] font-mono-code font-bold">
                  {editedQuiz.difficulty || 'Medium'}
                </span>
                <span className="px-2.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[10px] font-mono-code font-bold">
                  {totalMarks} TOTAL MARKS
                </span>
                {editedQuiz.isDraft && (
                  <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-400/30 text-[10px] font-mono-code font-bold">
                    DRAFT
                  </span>
                )}
              </div>

              {/* Editable Title */}
              <input
                type="text"
                value={editedQuiz.title}
                onChange={(e) => setEditedQuiz({ ...editedQuiz, title: e.target.value })}
                className="mt-1.5 text-lg sm:text-xl font-hud font-bold text-white bg-transparent border-b border-cyan-500/30 focus:border-cyan-400 outline-none w-full max-w-xl pb-0.5"
                placeholder="Question Paper / Quiz Title"
              />

              <div className="flex items-center gap-3 text-xs font-mono-code text-slate-400 mt-1 flex-wrap">
                <span>Subject: <strong className="text-cyan-300">{editedQuiz.subject}</strong></span>
                <span>•</span>
                <span>Questions: <strong className="text-white">{editedQuiz.questions.length}</strong></span>
                <span>•</span>
                <span>Max Marks: <strong className="text-emerald-300">{totalMarks}</strong></span>
                <span>•</span>
                <span>Duration: <strong className="text-white">{Math.round(editedQuiz.timeLimitSeconds / 60)} min</strong></span>
                {editedQuiz.assignedStudentIds && editedQuiz.assignedStudentIds.length > 0 && (
                  <>
                    <span>•</span>
                    <span className="text-emerald-300 font-bold">
                      Assigned to {editedQuiz.assignedStudentIds.length} Student{editedQuiz.assignedStudentIds.length === 1 ? '' : 's'}
                      {editedQuiz.assignedStudentNames && editedQuiz.assignedStudentNames.length > 0
                        ? ` (${editedQuiz.assignedStudentNames.join(', ')})`
                        : ''}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Top Toolbar Actions */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Prominent VIEW QUESTION PAPER Action */}
              <button
                onClick={() => {
                  audioFX.playClick();
                  setIsPaperPreviewOpen(true);
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-600/30 border border-purple-400/50 hover:bg-purple-600 text-purple-200 hover:text-white font-hud text-xs font-bold transition shadow-[0_0_15px_rgba(168,85,247,0.3)] cursor-pointer"
                title="Open dedicated examination paper printable preview"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>VIEW QUESTION PAPER</span>
              </button>

              {/* Direct PDF Download Action */}
              <button
                onClick={async () => {
                  audioFX.playClick();
                  setIsDownloadingPdf(true);
                  setNotice(null);
                  try {
                    const res = await downloadQuestionPaperPdf(editedQuiz, { includeAnswerKey: false });
                    audioFX.playSuccess();
                    setNotice({
                      message: `Question Paper PDF saved (${res.filename} • ${res.pageCount} ${res.pageCount === 1 ? 'Page' : 'Pages'})`,
                      type: 'success',
                    });
                  } catch (err: any) {
                    audioFX.playError();
                    setNotice({
                      message: `PDF download error: ${err.message || 'Please try again'}`,
                      type: 'error',
                    });
                  } finally {
                    setIsDownloadingPdf(false);
                  }
                }}
                disabled={isDownloadingPdf}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600/30 border border-emerald-400/50 hover:bg-emerald-600 text-emerald-200 hover:text-white font-hud text-xs font-bold transition shadow-[0_0_15px_rgba(168,85,247,0.3)] cursor-pointer disabled:opacity-50"
                title="Download Question Paper PDF directly"
              >
                {isDownloadingPdf ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">{isDownloadingPdf ? 'SAVING...' : 'DOWNLOAD PDF'}</span>
              </button>

              <button
                onClick={handleAddQuestion}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 border border-cyan-500/30 hover:border-cyan-400 text-cyan-300 hover:text-white font-hud text-xs font-bold transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>ADD</span>
              </button>

              <button
                onClick={handleDuplicateDraft}
                disabled={isSaving}
                className="flex items-center gap-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white font-hud text-xs font-bold transition cursor-pointer disabled:opacity-50"
                title="Duplicate this paper as a new draft"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>DUPLICATE</span>
              </button>

              <button
                onClick={handleSaveDraft}
                disabled={isSaving}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 border border-amber-500/40 text-amber-300 hover:text-amber-200 font-hud text-xs font-bold transition cursor-pointer disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>SAVE DRAFT</span>
              </button>

              <button
                onClick={handlePublish}
                disabled={isSaving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:brightness-110 text-white font-hud text-xs font-bold shadow-[0_0_15px_rgba(0,240,255,0.4)] transition cursor-pointer disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>PUBLISH</span>
              </button>

              <button
                onClick={onClose}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
                title="Close Review Mode"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Notice Alert */}
          {notice && (
            <div
              className={`px-6 py-2.5 text-xs font-mono-code flex items-center justify-between border-b shrink-0 ${
                notice.type === 'success'
                  ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
                  : notice.type === 'error'
                  ? 'bg-red-950/40 border-red-500/30 text-red-300'
                  : 'bg-cyan-950/40 border-cyan-500/30 text-cyan-300'
              }`}
            >
              <span>{notice.message}</span>
              <button onClick={() => setNotice(null)} className="text-slate-400 hover:text-white">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Question Cards Body */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
            {editedQuiz.questions.map((q, qIdx) => {
              const isRegeneratingThis = regeneratingQId === q.id;
              const isCaseStudy = q.questionType === 'case_study';
              const isMCQ = q.questionType === 'mcq' || (!q.questionType && q.options && q.options.length === 4);

              return (
                <div
                  key={q.id || qIdx}
                  className={`p-4 sm:p-5 rounded-2xl bg-slate-950/70 border transition duration-200 ${
                    isRegeneratingThis
                      ? 'border-purple-400 shadow-[0_0_20px_rgba(168,85,247,0.3)] animate-pulse'
                      : 'border-cyan-500/20 hover:border-cyan-500/40'
                  }`}
                >
                  {/* Question Header & Order / Delete Controls */}
                  <div className="flex items-center justify-between gap-3 pb-3 border-b border-cyan-500/10 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-0.5 rounded bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 font-mono-code text-xs font-bold">
                        Q{qIdx + 1}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300 font-mono-code text-[11px] uppercase">
                        {q.questionType === 'case_study'
                          ? 'CASE STUDY'
                          : q.questionType === 'short_2'
                          ? '2 MARKS SHORT'
                          : q.questionType === 'short_3'
                          ? '3 MARKS SHORT'
                          : q.questionType === 'long_5'
                          ? '5 MARKS LONG'
                          : 'MCQ'}
                      </span>
                      {q.chapter && (
                        <span className="text-[11px] font-mono-code text-slate-400 flex items-center gap-1">
                          <Layers className="w-3 h-3 text-cyan-400" />
                          <span>{q.chapter}</span>
                        </span>
                      )}

                      {/* Marks Field */}
                      <div className="flex items-center gap-1 text-xs font-mono-code bg-slate-900 px-2 py-0.5 rounded border border-slate-700">
                        <span className="text-slate-400">Marks:</span>
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={q.marks || (q.points ? Math.max(1, Math.round(q.points / 10)) : 1)}
                          onChange={(e) => handleUpdateQuestion(qIdx, { marks: Number(e.target.value) || 1 })}
                          className="w-12 bg-transparent text-emerald-300 font-bold outline-none text-center"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {/* Reorder: Move Up */}
                      <button
                        onClick={() => handleMoveQuestion(qIdx, 'up')}
                        disabled={qIdx === 0}
                        className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white disabled:opacity-30 transition cursor-pointer"
                        title="Move Question Up"
                      >
                        <ChevronUp className="w-4 h-4" />
                      </button>

                      {/* Reorder: Move Down */}
                      <button
                        onClick={() => handleMoveQuestion(qIdx, 'down')}
                        disabled={qIdx === editedQuiz.questions.length - 1}
                        className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white disabled:opacity-30 transition cursor-pointer"
                        title="Move Question Down"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </button>

                      {/* Shuffle Options (for MCQs) */}
                      {isMCQ && (
                        <button
                          type="button"
                          onClick={() => handleShuffleQuestionOptions(qIdx)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-950/40 border border-cyan-500/30 hover:border-cyan-400 text-cyan-300 hover:text-white font-mono-code text-[11px] transition cursor-pointer"
                          title="Shuffle options A/B/C/D and update answer key via stable option ID"
                        >
                          <Shuffle className="w-3 h-3 text-cyan-400" />
                          <span className="hidden sm:inline">SHUFFLE</span>
                        </button>
                      )}

                      {/* Regenerate this Question */}
                      <button
                        onClick={() => handleRegenerateQuestion(qIdx)}
                        disabled={isRegeneratingThis}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-950/40 border border-purple-500/30 hover:border-purple-400 text-purple-300 hover:text-white font-mono-code text-[11px] transition cursor-pointer disabled:opacity-50"
                        title="AI Regenerate this specific question"
                      >
                        {isRegeneratingThis ? (
                          <RefreshCw className="w-3 h-3 animate-spin" />
                        ) : (
                          <Sparkles className="w-3 h-3 text-purple-400" />
                        )}
                        <span className="hidden sm:inline">REGENERATE</span>
                      </button>

                      {/* Delete Question */}
                      <button
                        onClick={() => handleDeleteQuestion(qIdx)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-950/30 transition cursor-pointer"
                        title="Delete Question"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* CASE STUDY PASSAGE EDITING */}
                  {isCaseStudy && (
                    <div className="mt-3 space-y-3">
                      <div>
                        <label className="block text-[11px] font-mono-code text-cyan-400 uppercase mb-1">
                          Case Study Passage / Source Text
                        </label>
                        <textarea
                          rows={3}
                          value={q.casePassage || ''}
                          onChange={(e) => handleUpdateQuestion(qIdx, { casePassage: e.target.value })}
                          className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-cyan-500/30 text-slate-200 font-sans text-xs focus:border-cyan-400 outline-none transition"
                          placeholder="Enter or edit case study passage or observational scenario..."
                        />
                      </div>

                      {/* Subquestions editor */}
                      <div className="pl-3 border-l-2 border-cyan-500/30 space-y-3">
                        <div className="text-[11px] font-mono-code text-slate-400 uppercase">
                          Case Subquestions ({q.subQuestions?.length || 0})
                        </div>
                        {q.subQuestions && q.subQuestions.map((sq, sIdx) => (
                          <div key={sq.id || sIdx} className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono-code font-bold text-cyan-400 text-xs">
                                {sq.subNumber || `(${sIdx + 1})`}
                              </span>
                              <div className="flex items-center gap-1 text-xs">
                                <span className="text-slate-400 text-[10px]">Marks:</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={5}
                                  value={sq.marks}
                                  onChange={(e) => handleUpdateSubQuestion(qIdx, sIdx, { marks: Number(e.target.value) || 1 })}
                                  className="w-10 bg-slate-950 border border-slate-700 text-emerald-300 text-center rounded text-xs"
                                />
                              </div>
                            </div>
                            <input
                              type="text"
                              value={sq.question}
                              onChange={(e) => handleUpdateSubQuestion(qIdx, sIdx, { question: e.target.value })}
                              className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-xs text-white"
                              placeholder="Subquestion statement..."
                            />
                            <input
                              type="text"
                              value={sq.modelAnswer || ''}
                              onChange={(e) => handleUpdateSubQuestion(qIdx, sIdx, { modelAnswer: e.target.value })}
                              className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-[11px] text-emerald-300"
                              placeholder="Expected model answer key points..."
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Main Question Statement */}
                  {!isCaseStudy && (
                    <div className="mt-3">
                      <label className="block text-[11px] font-mono-code text-slate-400 uppercase mb-1">
                        Question Statement (Editable)
                      </label>
                      <textarea
                        rows={2}
                        value={q.question}
                        onChange={(e) => handleUpdateQuestion(qIdx, { question: e.target.value })}
                        className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-cyan-500/30 text-white font-hud text-sm focus:border-cyan-400 outline-none transition"
                        placeholder="Enter question text..."
                      />
                    </div>
                  )}

                  {/* MCQ Options Grid (if MCQ) */}
                  {isMCQ && q.options && (
                    <div className="mt-3">
                      <label className="block text-[11px] font-mono-code text-slate-400 uppercase mb-1.5 flex items-center justify-between">
                        <span>Options &amp; Correct Option Key (Click A/B/C/D to set correct option)</span>
                        <span className="text-emerald-400 font-bold">
                          Correct: Option {String.fromCharCode(65 + (q.correctIndex ?? 0))}
                        </span>
                      </label>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {q.options.map((opt, optIdx) => {
                          const isCorrect = q.correctIndex === optIdx;
                          return (
                            <div
                              key={optIdx}
                              onClick={() => handleSetCorrectIndex(qIdx, optIdx)}
                              className={`p-2.5 rounded-xl border flex items-center gap-2.5 transition cursor-pointer ${
                                isCorrect
                                  ? 'bg-emerald-950/40 border-emerald-400/80 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
                                  : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSetCorrectIndex(qIdx, optIdx);
                                }}
                                className={`w-6 h-6 rounded-lg flex items-center justify-center font-mono-code font-bold text-xs shrink-0 transition ${
                                  isCorrect
                                    ? 'bg-emerald-500 text-black shadow-md'
                                    : 'bg-slate-800 text-slate-400 hover:text-white'
                                }`}
                              >
                                {String.fromCharCode(65 + optIdx)}
                              </button>

                              <input
                                type="text"
                                value={opt}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => handleUpdateOption(qIdx, optIdx, e.target.value)}
                                className="flex-1 bg-transparent text-white text-xs font-sans outline-none focus:text-cyan-200"
                                placeholder={`Option ${String.fromCharCode(65 + optIdx)}`}
                              />

                              {isCorrect && (
                                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* WRITTEN QUESTION MODEL ANSWER / RUBRIC (if not MCQ and not Case Study) */}
                  {!isMCQ && !isCaseStudy && (
                    <div className="mt-3">
                      <label className="block text-[11px] font-mono-code text-emerald-400 uppercase mb-1">
                        Expected Model Answer &amp; Step-Wise Marking Rubric
                      </label>
                      <textarea
                        rows={2}
                        value={q.modelAnswer || q.explanation || ''}
                        onChange={(e) => handleUpdateQuestion(qIdx, { modelAnswer: e.target.value, explanation: e.target.value })}
                        className="w-full px-3.5 py-1.5 rounded-xl bg-slate-900/90 border border-emerald-500/30 text-emerald-200 font-sans text-xs focus:border-emerald-400 outline-none transition"
                        placeholder="Expected step-by-step model response according to CBSE marking scheme..."
                      />
                    </div>
                  )}

                  {/* Explanation for MCQs */}
                  {isMCQ && (
                    <div className="mt-3">
                      <label className="block text-[11px] font-mono-code text-slate-400 uppercase mb-1 flex items-center gap-1">
                        <HelpCircle className="w-3 h-3 text-cyan-400" />
                        <span>NCERT Explanation &amp; Rationale</span>
                      </label>
                      <textarea
                        rows={2}
                        value={q.explanation}
                        onChange={(e) => handleUpdateQuestion(qIdx, { explanation: e.target.value })}
                        className="w-full px-3.5 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-300 font-sans text-xs focus:border-cyan-400 outline-none transition"
                        placeholder="Step-by-step academic explanation for students..."
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer Info Bar */}
          <div className="p-4 border-t border-cyan-500/20 bg-slate-950/80 rounded-b-3xl flex items-center justify-between text-xs font-mono-code text-slate-400 shrink-0 flex-wrap gap-2">
            <div>
              <span>Live Assessment • Total Questions: <strong className="text-white">{editedQuiz.questions.length}</strong> • Total Marks: <strong className="text-emerald-300">{totalMarks}</strong></span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  audioFX.playClick();
                  setIsPaperPreviewOpen(true);
                }}
                className="text-purple-300 hover:text-white font-bold cursor-pointer flex items-center gap-1"
              >
                <Eye className="w-3 h-3" />
                <span>Preview Paper</span>
              </button>
              <span>•</span>
              <button
                onClick={handleSaveDraft}
                className="text-amber-300 hover:underline cursor-pointer"
              >
                Save as Draft
              </button>
              <span>•</span>
              <button
                onClick={handlePublish}
                className="text-cyan-400 hover:underline font-bold cursor-pointer"
              >
                Publish to Arena
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Question Paper Dedicated Preview & Print Modal */}
      <QuestionPaperPreviewModal
        quiz={editedQuiz}
        isOpen={isPaperPreviewOpen}
        onClose={() => setIsPaperPreviewOpen(false)}
      />
    </>
  );
};
