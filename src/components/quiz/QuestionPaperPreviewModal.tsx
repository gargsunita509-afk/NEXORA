import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Printer,
  ArrowLeft,
  X,
  CheckCircle,
  Eye,
  EyeOff,
  Download,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { Quiz } from '../../types';
import { audioFX } from '../../services/audio';
import { storage } from '../../services/storage';
import {
  downloadQuestionPaperPdf,
  groupQuestionsIntoPaperSections,
  calculatePaperTotalMarks,
} from '../../utils/pdfGenerator';

interface QuestionPaperPreviewModalProps {
  quiz?: Quiz | null;
  paperId?: string;
  isOpen: boolean;
  onClose: () => void;
}

export const QuestionPaperPreviewModal: React.FC<QuestionPaperPreviewModalProps> = ({
  quiz,
  paperId,
  isOpen,
  onClose,
}) => {
  // CRITICAL: All React hooks MUST be declared unconditionally at the top level before any early return
  const [showMarkingScheme, setShowMarkingScheme] = useState<boolean>(false);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [pdfNotice, setPdfNotice] = useState<{
    message: string;
    type: 'success' | 'error';
    includeAnswerKey?: boolean;
  } | null>(null);
  const [resolvedPaper, setResolvedPaper] = useState<Quiz | null>(quiz || null);
  const [isLoadingPaper, setIsLoadingPaper] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadAndValidatePaper = useCallback(async () => {
    setLoadError(null);

    // Fast path: if the passed quiz object already has populated questions, use it directly
    if (quiz && Array.isArray(quiz.questions) && quiz.questions.length > 0) {
      setResolvedPaper(quiz);
      setIsLoadingPaper(false);
      return;
    }

    // Async retrieval path: fetch from saved quizzes storage by ID
    const targetId = paperId || quiz?.id;
    setIsLoadingPaper(true);
    try {
      const savedQuizzes = await storage.getQuizzes();
      const found = targetId
        ? savedQuizzes.find((q) => q.id === targetId)
        : savedQuizzes.find((q) => q.isQuestionPaper || (Array.isArray(q.questions) && q.questions.length > 0));

      if (found && Array.isArray(found.questions) && found.questions.length > 0) {
        setResolvedPaper(found);
        setLoadError(null);
      } else {
        setResolvedPaper(null);
        setLoadError(
          'The selected question paper could not be loaded or contains no saved questions. Please retry or return to Teacher Studio.'
        );
      }
    } catch (err: any) {
      console.error('Error loading question paper for preview:', err);
      setResolvedPaper(null);
      setLoadError(err?.message || 'Failed to retrieve question paper data.');
    } finally {
      setIsLoadingPaper(false);
    }
  }, [quiz, paperId]);

  useEffect(() => {
    if (isOpen) {
      void loadAndValidatePaper();
    } else {
      setPdfNotice(null);
    }
  }, [isOpen, loadAndValidatePaper]);

  const activePaper = useMemo(() => {
    if (quiz && Array.isArray(quiz.questions) && quiz.questions.length > 0) {
      return quiz;
    }
    return resolvedPaper;
  }, [quiz, resolvedPaper]);

  const sections = useMemo(() => {
    if (!activePaper || !Array.isArray(activePaper.questions)) return [];
    return groupQuestionsIntoPaperSections(activePaper.questions);
  }, [activePaper]);

  const totalMarks = useMemo(() => {
    if (!activePaper || !Array.isArray(activePaper.questions)) return 0;
    return calculatePaperTotalMarks(activePaper.questions);
  }, [activePaper]);

  const handlePrint = useCallback(() => {
    audioFX.playClick();
    if (typeof window !== 'undefined' && typeof window.print === 'function') {
      window.print();
    }
  }, []);

  const handleDownloadPdf = useCallback(
    async (includeAnswerKey = false) => {
      if (!activePaper || !Array.isArray(activePaper.questions) || activePaper.questions.length === 0) {
        setPdfNotice({
          message: 'Cannot download PDF: Question paper has no loaded questions.',
          type: 'error',
          includeAnswerKey,
        });
        return;
      }

      audioFX.playClick();
      setIsExportingPdf(true);
      setPdfNotice(null);

      try {
        const res = await downloadQuestionPaperPdf(activePaper, { includeAnswerKey });
        if (!res.success) {
          throw new Error('PDF file could not be saved.');
        }
        audioFX.playSuccess();
        setPdfNotice({
          message: includeAnswerKey
            ? `Answer Key PDF saved (${res.filename} • ${res.pageCount} ${res.pageCount === 1 ? 'Page' : 'Pages'})`
            : `Question Paper PDF saved (${res.filename} • ${res.pageCount} ${res.pageCount === 1 ? 'Page' : 'Pages'})`,
          type: 'success',
          includeAnswerKey,
        });
      } catch (err: any) {
        console.error('Failed to generate or save question paper PDF:', err);
        audioFX.playError();
        setPdfNotice({
          message: `PDF download failed: ${err?.message || 'Could not save PDF file. Please tap Retry.'}`,
          type: 'error',
          includeAnswerKey,
        });
      } finally {
        setIsExportingPdf(false);
      }
    },
    [activePaper]
  );

  // Early return strictly AFTER all hooks have been called
  if (!isOpen) return null;

  const paperConfig = activePaper?.paperConfig || {};
  const examName = paperConfig.examName || activePaper?.title || 'CBSE Class 11 Examination';
  const duration =
    paperConfig.durationMinutes || Math.round((activePaper?.timeLimitSeconds || 5400) / 60) || 90;
  const examDate =
    paperConfig.examDate ||
    new Date(activePaper?.createdAt || Date.now()).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

  const generalInstructions =
    Array.isArray(paperConfig.generalInstructions) && paperConfig.generalInstructions.length > 0
      ? paperConfig.generalInstructions
      : [
          'All questions are compulsory. Internal choice is provided in designated questions where applicable.',
          `This question paper contains ${activePaper?.questions?.length || 0} questions distributed across structured sections.`,
          'Marks are indicated against each question. Read the instructions carefully before writing the answers.',
          'Use of calculators or unauthorized electronic devices is strictly prohibited unless specifically permitted.',
          'Draw neat, labeled diagrams and show all step-wise calculations where required.',
        ];

  let questionNumberCounter = 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="paper-preview-title"
      className="printable-modal fixed inset-0 z-50 flex flex-col bg-slate-950/90 backdrop-blur-md overflow-hidden animate-in fade-in"
    >
      {/* Top Floating Control Bar (Hidden on print) */}
      <div className="no-print bg-[#060b19] border-b border-cyan-500/30 px-4 sm:px-8 py-3.5 flex items-center justify-between gap-4 shadow-xl shrink-0 flex-wrap">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              audioFX.playClick();
              onClose();
            }}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900 border border-cyan-500/40 text-cyan-300 hover:text-white hover:bg-cyan-950/50 text-xs font-hud font-bold transition cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>BACK TO TEACHER STUDIO</span>
          </button>

          <div className="hidden md:block">
            <span className="text-[11px] font-mono-code text-cyan-400 uppercase tracking-widest font-bold block">
              OFFICIAL QUESTION PAPER PREVIEW
            </span>
            <h2 id="paper-preview-title" className="text-sm font-hud font-bold text-white truncate max-w-md">
              {examName} • {activePaper?.subject || 'Class 11TH'}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Toggle Marking Scheme */}
          <button
            type="button"
            disabled={!activePaper || isLoadingPaper}
            onClick={() => {
              audioFX.playClick();
              setShowMarkingScheme(!showMarkingScheme);
            }}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-hud font-bold transition cursor-pointer disabled:opacity-40 ${
              showMarkingScheme
                ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white'
            }`}
            title="Toggle solutions and marking rubric for teacher reference"
          >
            {showMarkingScheme ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            <span className="hidden sm:inline">
              {showMarkingScheme ? 'HIDE ANSWER KEY' : 'VIEW ANSWER KEY'}
            </span>
          </button>

          {/* Primary Print Button */}
          <button
            type="button"
            disabled={!activePaper || isLoadingPaper}
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-hud font-extrabold text-xs uppercase tracking-wider transition shadow-[0_0_15px_rgba(0,240,255,0.4)] cursor-pointer disabled:opacity-40"
          >
            <Printer className="w-4 h-4" />
            <span>PRINT QUESTION PAPER</span>
          </button>

          {/* Download PDF Button */}
          <button
            type="button"
            onClick={() => handleDownloadPdf(false)}
            disabled={isExportingPdf || !activePaper || isLoadingPaper}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-black font-hud font-extrabold text-xs uppercase tracking-wider transition shadow-[0_0_15px_rgba(16,185,129,0.4)] cursor-pointer disabled:opacity-50"
            title="Download multi-page official examination question paper PDF"
          >
            {isExportingPdf ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <span>{isExportingPdf ? 'SAVING PDF...' : 'DOWNLOAD PDF'}</span>
          </button>

          {/* Teacher Answer Key PDF if Answer Key is toggled */}
          {showMarkingScheme && (
            <button
              type="button"
              onClick={() => handleDownloadPdf(true)}
              disabled={isExportingPdf || !activePaper || isLoadingPaper}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/20 border border-amber-400 hover:bg-amber-500/30 text-amber-300 font-hud font-bold text-xs uppercase tracking-wider transition cursor-pointer disabled:opacity-50"
              title="Download separate teacher marking scheme with solutions and explanations"
            >
              <Download className="w-4 h-4 text-amber-400" />
              <span>KEY PDF</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              audioFX.playClick();
              onClose();
            }}
            className="p-2 rounded-xl bg-slate-900 text-slate-400 hover:text-white border border-slate-800 transition cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* PDF Generation & Save Status Notice with Retry on Failure */}
      {pdfNotice && (
        <div
          className={`no-print border-b px-4 py-2.5 text-xs font-mono-code flex items-center justify-between gap-3 animate-in fade-in shrink-0 ${
            pdfNotice.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-400/50 text-emerald-300'
              : 'bg-red-950/90 border-red-400/50 text-red-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {pdfNotice.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            )}
            <span>{pdfNotice.message}</span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {pdfNotice.type === 'error' && (
              <button
                type="button"
                onClick={() => handleDownloadPdf(Boolean(pdfNotice.includeAnswerKey))}
                className="px-2.5 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-400/50 text-red-200 hover:text-white font-hud font-bold text-[11px] flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>RETRY</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setPdfNotice(null)}
              className="px-2 py-0.5 text-slate-400 hover:text-white cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Main Preview Container */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-8 bg-[#040814]/80">
        {isLoadingPaper ? (
          <div className="max-w-xl mx-auto my-16 p-8 rounded-2xl bg-slate-900/90 border border-cyan-500/40 text-center space-y-3 shadow-2xl">
            <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin mx-auto" />
            <h3 className="font-hud font-bold text-base text-white uppercase tracking-wider">
              Loading Question Paper...
            </h3>
            <p className="text-xs font-mono-code text-slate-400">
              Retrieving saved questions, section structure, and marking scheme from Teacher Studio.
            </p>
          </div>
        ) : loadError || !activePaper || !Array.isArray(activePaper.questions) || activePaper.questions.length === 0 ? (
          <div className="max-w-xl mx-auto my-16 p-8 rounded-2xl bg-slate-900/95 border border-red-500/40 text-center space-y-4 shadow-2xl">
            <AlertCircle className="w-10 h-10 text-red-400 mx-auto" />
            <h3 className="font-hud font-bold text-base text-white uppercase tracking-wider">
              Unable to Load Question Paper
            </h3>
            <p className="text-xs font-sans text-slate-300 leading-relaxed">
              {loadError || 'This question paper contains no questions or could not be retrieved.'}
            </p>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => void loadAndValidatePaper()}
                className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-hud font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>RETRY</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-hud font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>BACK TO TEACHER STUDIO</span>
              </button>
            </div>
          </div>
        ) : (
          <div
            id="nexora-exam-paper-print"
            className="bg-white text-slate-900 rounded-lg shadow-2xl p-6 sm:p-12 max-w-4xl mx-auto font-sans leading-normal border border-slate-300 print:border-none print:shadow-none print:p-0 print:m-0 print:max-w-none"
          >
            {/* Standard Question Paper Header */}
            <div className="text-center pb-4 mb-4 border-b-2 border-slate-900 space-y-1">
              <h1 className="text-xl sm:text-2xl font-bold uppercase tracking-tight text-slate-950 font-serif">
                THE ABHINAV SCHOOL
              </h1>
              <div className="text-sm sm:text-base font-bold text-slate-900 tracking-wide font-sans">
                CLASS 11TH
              </div>
              <div className="text-xs sm:text-sm font-bold uppercase text-slate-800 tracking-wider">
                SAMPLE PAPER
              </div>
              <div className="flex items-center justify-center gap-6 text-xs sm:text-sm font-medium text-slate-800 pt-0.5">
                <span>
                  Subject: <strong className="font-semibold text-slate-950">{activePaper.subject}</strong>
                </span>
                <span>•</span>
                <span>
                  Maximum Marks: <strong className="font-semibold text-slate-950">{totalMarks}</strong>
                </span>
              </div>

              {/* Exam Metadata Grid */}
              <div className="mt-2 pt-2 border-t border-slate-300 grid grid-cols-3 text-[11px] font-semibold text-slate-700 uppercase">
                <div className="text-left">
                  Time Allowed: <span className="font-normal font-mono">{duration} Minutes</span>
                </div>
                <div className="text-center">
                  Date: <span className="font-normal font-mono">{examDate}</span>
                </div>
                <div className="text-right">
                  Stream: <span className="font-normal font-mono">{activePaper.stream || 'ALL'}</span>
                </div>
              </div>
            </div>

            {/* General Instructions Box */}
            <div className="mb-6 p-3 sm:p-4 rounded border border-slate-400 bg-slate-50 text-[11px] leading-relaxed text-slate-800">
              <div className="font-bold uppercase text-xs mb-1.5 text-slate-900">General Instructions:</div>
              <ol className="list-decimal pl-4 space-y-1">
                {generalInstructions.map((inst, idx) => (
                  <li key={idx}>{inst.replace(/^\d+\.\s*/, '')}</li>
                ))}
              </ol>
            </div>

            {/* QUESTION SECTIONS */}
            <div className="space-y-6 text-sm">
              {sections.map((section) => (
                <div key={section.id} className="space-y-4 pt-1">
                  <div className="pb-1 border-b border-slate-800 flex items-center justify-between font-bold text-xs uppercase bg-slate-100 p-1.5 rounded">
                    <span>{section.title}</span>
                    <span>{section.summary}</span>
                  </div>

                  <div className="space-y-5">
                    {section.questions.map((q) => {
                      questionNumberCounter += 1;
                      const qNum = questionNumberCounter;

                      if (
                        q.questionType === 'case_study' ||
                        (typeof q.casePassage === 'string' && q.casePassage.trim().length > 0)
                      ) {
                        const caseTotal =
                          Array.isArray(q.subQuestions) && q.subQuestions.length > 0
                            ? q.subQuestions.reduce((sum, sq) => sum + (Number(sq.marks) || 1), 0)
                            : Number(q.marks) || 4;

                        return (
                          <div
                            key={q.id || `q-${qNum}`}
                            className="break-inside-avoid text-slate-900 pl-1 border border-slate-300 rounded-md p-4 bg-slate-50/50"
                          >
                            <div className="flex items-start justify-between gap-3 font-bold mb-2">
                              <span className="text-slate-950 font-mono">
                                Q{qNum}. {q.question || 'PASSAGE / CASE STUDY'}
                              </span>
                              <span className="text-xs text-slate-800 font-mono shrink-0">
                                [{caseTotal} Marks]
                              </span>
                            </div>

                            {/* Passage box */}
                            {q.casePassage && (
                              <div className="p-3 bg-white border-l-4 border-slate-700 text-xs italic text-slate-800 leading-relaxed mb-3.5 shadow-sm whitespace-pre-line">
                                {q.casePassage}
                              </div>
                            )}

                            {/* Subquestions */}
                            {Array.isArray(q.subQuestions) && q.subQuestions.length > 0 ? (
                              <div className="space-y-3.5 pl-2">
                                {q.subQuestions.map((sq, sqIdx) => (
                                  <div key={sq.id || sqIdx} className="text-xs">
                                    <div className="flex items-start justify-between gap-2 font-medium">
                                      <div className="flex items-start gap-1.5">
                                        <span className="font-bold font-mono text-slate-900">
                                          {sq.subNumber || `(${sqIdx + 1})`}
                                        </span>
                                        <span>{sq.question}</span>
                                      </div>
                                      <span className="font-bold font-mono text-slate-700 shrink-0">
                                        [{sq.marks || 1}]
                                      </span>
                                    </div>

                                    {/* Subquestion MCQ options if any */}
                                    {sq.options && Array.isArray(sq.options) && sq.options.length > 0 && (
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1.5 pl-5 text-[11px]">
                                        {sq.options.map((opt, optIdx) => {
                                          const isSubCorrect =
                                            showMarkingScheme && sq.correctIndex === optIdx;
                                          return (
                                            <div
                                              key={optIdx}
                                              className={`flex items-center gap-1.5 p-1 rounded ${
                                                isSubCorrect
                                                  ? 'bg-emerald-100 font-bold text-emerald-900 border border-emerald-400'
                                                  : ''
                                              }`}
                                            >
                                              <span className="font-mono font-bold">
                                                ({String.fromCharCode(65 + optIdx)})
                                              </span>
                                              <span>{opt}</span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}

                                    {showMarkingScheme && (sq.modelAnswer || sq.explanation) && (
                                      <div className="no-print mt-1.5 ml-5 p-1.5 bg-emerald-50 border border-emerald-300 rounded text-[11px] text-emerald-900">
                                        <span className="font-bold">Answer: </span>
                                        <span>{sq.modelAnswer || sq.explanation}</span>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              showMarkingScheme &&
                              (q.modelAnswer || q.explanation) && (
                                <div className="no-print mt-2 p-2 bg-emerald-50 border border-emerald-300 rounded text-xs text-emerald-900 font-sans">
                                  <span className="font-bold uppercase text-[10px] block">
                                    Model Answer &amp; Marking Scheme:
                                  </span>
                                  <span>{q.modelAnswer || q.explanation}</span>
                                </div>
                              )
                            )}
                          </div>
                        );
                      }

                      const marks =
                        Number(q.marks) ||
                        (q.points ? Math.max(1, Math.round(q.points / 10)) : 1);
                      const hasOptions = Array.isArray(q.options) && q.options.length > 0;

                      return (
                        <div key={q.id || `q-${qNum}`} className="break-inside-avoid text-slate-900 pl-1">
                          <div className="flex items-start justify-between gap-3 font-medium">
                            <div className="flex items-start gap-2 flex-1">
                              <span className="font-bold text-slate-950 font-mono">Q{qNum}.</span>
                              <span className="leading-snug whitespace-pre-line">{q.question}</span>
                            </div>
                            <span className="font-bold text-xs text-slate-800 shrink-0 font-mono">
                              [{marks}]
                            </span>
                          </div>

                          {/* MCQ Options A, B, C, D */}
                          {hasOptions && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 mt-2 pl-7 text-xs">
                              {q.options!.map((opt, oIdx) => {
                                const letter = String.fromCharCode(65 + oIdx);
                                const isCorrect = showMarkingScheme && q.correctIndex === oIdx;

                                return (
                                  <div
                                    key={oIdx}
                                    className={`flex items-start gap-2 p-1 rounded ${
                                      isCorrect
                                        ? 'bg-emerald-100 font-bold text-emerald-900 border border-emerald-400'
                                        : ''
                                    }`}
                                  >
                                    <span className="font-bold text-slate-800 font-mono">({letter})</span>
                                    <span>{opt}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Optional Marking Scheme Display on Screen */}
                          {showMarkingScheme && (q.modelAnswer || q.explanation) && (
                            <div className="no-print mt-2 ml-7 p-2 bg-emerald-50 border border-emerald-300 rounded text-xs text-emerald-900 font-sans">
                              <span className="font-bold uppercase text-[10px] block">
                                {hasOptions ? 'Answer Key & Explanation:' : 'Model Answer / Rubric:'}
                              </span>
                              <span>
                                {hasOptions
                                  ? `Correct: Option (${String.fromCharCode(
                                      65 + (q.correctIndex ?? 0)
                                    )}) — ${q.explanation || q.modelAnswer}`
                                  : q.modelAnswer || q.explanation}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* End of Examination Paper Sign-off & Minimal Footer */}
            <div className="mt-8 pt-3 border-t border-slate-300 flex items-center justify-between text-xs">
              <span className="font-bold uppercase tracking-widest text-slate-700">
                — END OF QUESTION PAPER —
              </span>
              <span className="text-[10px] font-sans font-normal text-slate-400 tracking-wider">
                NEXORA
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
