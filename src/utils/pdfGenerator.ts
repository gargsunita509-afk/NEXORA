import { jsPDF } from 'jspdf';
import type { Quiz, QuizQuestion } from '../types/index.ts';
import {
  type TimetableVersion,
  getActiveTimetableVersion,
  getActiveClassInCharge,
} from '../data/initialTimetable.ts';
import { resolveApiUrl } from '../services/updateService.ts';
import { apkAwareFetch } from '../services/apkApiBridge.ts';

export interface PdfGenerationResult {
  success: boolean;
  filename: string;
  pageCount: number;
  byteLength?: number;
  saveMethod?: 'android_native_download' | 'web_share' | 'browser_download' | 'headless';
  downloadUrl?: string;
  savedUri?: string;
  storageLocation?: string;
}

export interface BuiltPdfDocument {
  doc: jsPDF;
  filename: string;
  pageCount: number;
  byteLength: number;
  uint8: Uint8Array;
  base64: string;
  docKind?: 'timetable' | 'timetable_old' | 'question_paper';
  quizSpec?: Quiz;
  includeAnswerKey?: boolean;
}

/**
 * Sanitizes a PDF filename so it is safe across Android MediaStore.Downloads, legacy FAT/ext4 storage, and browsers.
 */
export function sanitizePdfFilename(rawName: string): string {
  const cleaned = String(rawName || 'NEXORA_Document.pdf')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!cleaned) return 'NEXORA_Document.pdf';
  return cleaned.toLowerCase().endsWith('.pdf') ? cleaned : `${cleaned}.pdf`;
}

export interface NativeAndroidPdfSaveResult {
  invoked: boolean;
  ok: boolean;
  uri?: string;
  byteLength?: number;
  storageMethod?: string;
  displayPath?: string;
  error?: string;
}

/**
 * Invokes the synchronous native Android WebChromeClient.onJsPrompt bridge ("NEXORA_SAVE_PDF:<filename>")
 * implemented in MainActivity.savePdfToDownloads(filename, base64Data).
 * Writes directly to MediaStore.Downloads (Android 10+) or Environment.DIRECTORY_DOWNLOADS (Android 5-9)
 * and verifies that the saved file exists and is >= 100 bytes before returning ok: true.
 */
export function saveBase64PdfViaAndroidBridge(
  filename: string,
  base64Data: string
): NativeAndroidPdfSaveResult {
  if (typeof window === 'undefined' || typeof window.prompt !== 'function') {
    return { invoked: false, ok: false };
  }
  const cleanFilename = sanitizePdfFilename(filename);
  const cleanBase64 = String(base64Data || '').replace(/^data:application\/pdf;base64,/i, '').trim();
  if (!cleanBase64 || cleanBase64.length < 120) {
    return {
      invoked: true,
      ok: false,
      error: 'Generated PDF data is empty or corrupted (< 100 bytes).',
    };
  }

  try {
    const reply = window.prompt(`NEXORA_SAVE_PDF:${cleanFilename}`, cleanBase64);
    if (typeof reply !== 'string' || !reply) {
      return { invoked: false, ok: false };
    }
    if (reply.startsWith('OK|')) {
      const parts = reply.split('|');
      const uri = parts[1] || '';
      const writtenBytes = Number(parts[2]) || 0;
      const storageMethod = parts[3] || 'Downloads';
      const displayPath = parts[4] || `Downloads/${cleanFilename}`;
      if (writtenBytes < 100) {
        return {
          invoked: true,
          ok: false,
          error: `Saved PDF verification failed: file size is ${writtenBytes} bytes.`,
        };
      }
      return {
        invoked: true,
        ok: true,
        uri,
        byteLength: writtenBytes,
        storageMethod,
        displayPath,
      };
    }
    if (reply.startsWith('ERR:')) {
      return {
        invoked: true,
        ok: false,
        error: reply.slice(4).trim() || 'Native Android storage write failed.',
      };
    }
    return { invoked: false, ok: false };
  } catch (err: any) {
    return {
      invoked: false,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Opens a previously saved PDF URI (or the Android system Downloads view) via the native Android bridge.
 */
export function openSavedAndroidPdf(uri?: string, filename?: string): boolean {
  if (typeof window === 'undefined' || typeof window.prompt !== 'function') {
    return false;
  }
  try {
    const cleanFilename = sanitizePdfFilename(filename || 'NEXORA_Document.pdf');
    const reply = window.prompt(`NEXORA_OPEN_PDF:${cleanFilename}`, uri || '');
    return typeof reply === 'string' && reply.startsWith('OK');
  } catch {
    return false;
  }
}

/**
 * Encodes a Quiz into a compact base64url specification string (< 6KB) so that if the Android APK
 * hands off a /downloads/nexora-paper/:token/:filename?spec=... URL to Android's system downloader,
 * the server can reconstruct the exact PDF even when the APK WebView ran in standalone file:// mode.
 */
export function encodeCompactQuizSpec(quiz: Quiz, includeAnswerKey?: boolean): string {
  try {
    const compactPayload = {
      t: quiz.title || quiz.paperConfig?.examName || 'Question Paper',
      s: quiz.subject || 'Subject',
      c: quiz.classLevel || 'Class 11TH',
      st: quiz.stream || 'PCM',
      ak: Boolean(includeAnswerKey),
      pc: {
        en: quiz.paperConfig?.examName || quiz.title || 'Sample Paper',
        ed: quiz.paperConfig?.examDate || '',
        dm: quiz.paperConfig?.durationMinutes || 180,
        tm: quiz.paperConfig?.totalMarks || calculatePaperTotalMarks(quiz.questions || []),
        gi: Array.isArray(quiz.paperConfig?.generalInstructions)
          ? quiz.paperConfig!.generalInstructions.slice(0, 5)
          : undefined,
      },
      q: (quiz.questions || []).map((q, idx) => ({
        i: q.id || `q-${idx + 1}`,
        sec: q.section || undefined,
        qt: q.questionType || 'mcq',
        m: getSingleQuestionMarks(q),
        cp: q.casePassage ? String(q.casePassage).slice(0, 1200) : undefined,
        qu: String(q.question || '').slice(0, 900),
        op: Array.isArray(q.options) ? q.options.map((o) => String(o).slice(0, 220)) : undefined,
        ci: typeof q.correctIndex === 'number' ? q.correctIndex : undefined,
        ma: includeAnswerKey && q.modelAnswer ? String(q.modelAnswer).slice(0, 500) : undefined,
        sq: Array.isArray(q.subQuestions)
          ? q.subQuestions.map((sq, sIdx) => ({
              sn: sq.subNumber || `(${sIdx + 1})`,
              qu: String(sq.question || '').slice(0, 400),
              qt: sq.questionType || 'written',
              m: Number(sq.marks) || 1,
              op: Array.isArray(sq.options) ? sq.options.map((o) => String(o).slice(0, 180)) : undefined,
              ci: typeof sq.correctIndex === 'number' ? sq.correctIndex : undefined,
              ma: includeAnswerKey && sq.modelAnswer ? String(sq.modelAnswer).slice(0, 300) : undefined,
            }))
          : undefined,
      })),
    };
    const jsonStr = JSON.stringify(compactPayload);
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(jsonStr, 'utf8').toString('base64url');
    }
    const base64 = btoa(unescape(encodeURIComponent(jsonStr)));
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  } catch {
    return '';
  }
}

export function decodeCompactQuizSpec(spec: string): { quiz: Quiz; includeAnswerKey: boolean } | null {
  try {
    if (!spec || typeof spec !== 'string') return null;
    let jsonStr = '';
    if (typeof Buffer !== 'undefined') {
      jsonStr = Buffer.from(spec, 'base64url').toString('utf8');
    } else {
      const b64 = spec.replace(/-/g, '+').replace(/_/g, '/');
      jsonStr = decodeURIComponent(escape(atob(b64)));
    }
    const p = JSON.parse(jsonStr);
    if (!p || !Array.isArray(p.q) || p.q.length === 0) return null;
    const reconstructed: Quiz = {
      id: 'reconstructed-paper',
      title: p.t || 'Question Paper',
      description: p.t || 'Question Paper',
      timeLimitSeconds: (Number(p.pc?.dm) || 180) * 60,
      subject: p.s || 'Subject',
      chapter: p.s || 'CBSE Syllabus',
      classLevel: p.c || 'Class 11TH',
      stream: p.st || 'PCM',
      createdAt: Date.now(),
      isQuestionPaper: true,
      paperConfig: {
        examName: p.pc?.en || p.t || 'Sample Paper',
        examDate: p.pc?.ed || '',
        durationMinutes: Number(p.pc?.dm) || 180,
        totalMarks: Number(p.pc?.tm) || undefined,
        generalInstructions: Array.isArray(p.pc?.gi) ? p.pc.gi : [
          'All questions are compulsory.',
          'Marks are indicated against each question.',
        ],
      },
      questions: p.q.map((item: any, idx: number) => ({
        id: item.i || `q-${idx + 1}`,
        section: item.sec,
        questionType: item.qt || 'mcq',
        marks: Number(item.m) || 1,
        points: (Number(item.m) || 1) * 10,
        casePassage: item.cp,
        question: item.qu || '',
        options: Array.isArray(item.op) ? item.op : [],
        correctIndex: typeof item.ci === 'number' ? item.ci : 0,
        explanation: '',
        modelAnswer: item.ma,
        subQuestions: Array.isArray(item.sq)
          ? item.sq.map((sq: any, sIdx: number) => ({
              id: `sq-${idx}-${sIdx}`,
              subNumber: sq.sn || `(${sIdx + 1})`,
              question: sq.qu || '',
              questionType: sq.qt || 'written',
              marks: Number(sq.m) || 1,
              options: Array.isArray(sq.op) ? sq.op : undefined,
              correctIndex: typeof sq.ci === 'number' ? sq.ci : undefined,
              modelAnswer: sq.ma,
            }))
          : undefined,
      })),
    };
    return { quiz: reconstructed, includeAnswerKey: Boolean(p.ak) };
  } catch {
    return null;
  }
}

export interface PaperSectionGroup {
  id: string;
  title: string;
  summary: string;
  totalMarks: number;
  questions: QuizQuestion[];
}

/**
 * Calculates the authoritative total marks of a question paper from its actual questions.
 */
export function calculatePaperTotalMarks(questions: QuizQuestion[] = []): number {
  if (!Array.isArray(questions)) return 0;
  return questions.reduce((sum, q) => {
    if (!q) return sum;
    if (q.questionType === 'case_study' && Array.isArray(q.subQuestions) && q.subQuestions.length > 0) {
      return sum + q.subQuestions.reduce((sSum, sq) => sSum + (Number(sq.marks) || 1), 0);
    }
    const qMarks =
      typeof q.marks === 'number' && q.marks > 0
        ? q.marks
        : q.points
        ? Math.max(1, Math.round(q.points / 10))
        : 1;
    return sum + qMarks;
  }, 0);
}

function getSingleQuestionMarks(q: QuizQuestion): number {
  if (q.questionType === 'case_study' && Array.isArray(q.subQuestions) && q.subQuestions.length > 0) {
    return q.subQuestions.reduce((sSum, sq) => sSum + (Number(sq.marks) || 1), 0);
  }
  if (typeof q.marks === 'number' && q.marks > 0) return q.marks;
  if (q.points) return Math.max(1, Math.round(q.points / 10));
  if (q.questionType === 'short_2' || q.questionType === 'fill_in') return 2;
  if (q.questionType === 'short_3') return 3;
  if (q.questionType === 'case_study') return 4;
  if (q.questionType === 'long_5') return 5;
  return 1;
}

function normalizeExplicitSectionTitle(rawSection: string): string {
  const trimmed = rawSection.trim();
  const upper = trimmed.toUpperCase();
  if (upper === 'A' || upper === 'SECTION A') {
    return 'SECTION A — READING SKILLS';
  }
  if (upper === 'B' || upper === 'SECTION B') {
    return 'SECTION B — GRAMMAR & CREATIVE WRITING SKILLS';
  }
  if (upper === 'C' || upper === 'SECTION C') {
    return 'SECTION C — LITERATURE TEXTBOOKS & SUPPLEMENTARY READING';
  }
  if (upper === 'D' || upper === 'SECTION D') {
    return 'SECTION D — CASE STUDY / SOURCE-BASED QUESTIONS';
  }
  if (upper === 'E' || upper === 'SECTION E') {
    return 'SECTION E — LONG ANSWER QUESTIONS';
  }
  return trimmed;
}

/**
 * Groups paper questions into structured examination sections so that BOTH the Teacher Studio Preview
 * and the generated PDF display 100% of questions in the exact same order without dropping any question type.
 */
export function groupQuestionsIntoPaperSections(questions: QuizQuestion[] = []): PaperSectionGroup[] {
  if (!Array.isArray(questions) || questions.length === 0) return [];

  const validQuestions = questions.filter((q) => q && typeof q.question === 'string' && q.question.trim().length > 0);
  if (validQuestions.length === 0) return [];

  // Check if paper uses explicit section labels (e.g., CBSE Class 11 English Core Section A / B / C)
  const hasExplicitSections = validQuestions.some((q) => typeof q.section === 'string' && q.section.trim().length > 0);

  if (hasExplicitSections) {
    const sectionMap = new Map<string, QuizQuestion[]>();
    for (const q of validQuestions) {
      const rawSec = typeof q.section === 'string' && q.section.trim() ? q.section.trim() : 'GENERAL SECTION';
      const normTitle = normalizeExplicitSectionTitle(rawSec);
      if (!sectionMap.has(normTitle)) {
        sectionMap.set(normTitle, []);
      }
      sectionMap.get(normTitle)!.push(q);
    }

    const groups: PaperSectionGroup[] = [];
    let idx = 0;
    for (const [title, secQuestions] of sectionMap.entries()) {
      idx += 1;
      const secMarks = calculatePaperTotalMarks(secQuestions);
      // Avoid duplicating marks label if title already ends with "(XX Marks)"
      const summary = /\(\d+\s*Marks\)/i.test(title)
        ? `[${secQuestions.length} ${secQuestions.length === 1 ? 'Question' : 'Questions'}]`
        : `[${secMarks} Marks]`;
      groups.push({
        id: `sec-explicit-${idx}`,
        title,
        summary,
        totalMarks: secMarks,
        questions: secQuestions,
      });
    }
    return groups;
  }

  // Standard CBSE Class 11 / 12 multi-section grouping (Sections A–E) with zero omissions
  const placedIds = new Set<string>();
  const takeMatching = (predicate: (q: QuizQuestion) => boolean): QuizQuestion[] => {
    const matched: QuizQuestion[] = [];
    validQuestions.forEach((q, i) => {
      const key = q.id || `q-idx-${i}`;
      if (!placedIds.has(key) && predicate(q)) {
        placedIds.add(key);
        matched.push(q);
      }
    });
    return matched;
  };

  const mcqQuestions = takeMatching(
    (q) =>
      q.questionType === 'mcq' ||
      q.questionType === 'assertion_reason' ||
      ((!q.questionType || q.questionType === 'mixed') && Array.isArray(q.options) && q.options.length >= 2)
  );
  const short2Questions = takeMatching((q) => q.questionType === 'short_2' || q.questionType === 'fill_in');
  const short3Questions = takeMatching((q) => q.questionType === 'short_3');
  const caseStudyQuestions = takeMatching((q) => q.questionType === 'case_study');
  const long5Questions = takeMatching(
    (q) => q.questionType === 'long_5' || q.questionType === 'numerical' || q.questionType === 'conceptual'
  );
  // Catch-all so no question is ever omitted
  const remainingQuestions = takeMatching(() => true);

  const rawBuckets: { title: string; list: QuizQuestion[] }[] = [
    {
      title: 'SECTION A — MULTIPLE CHOICE QUESTIONS',
      list: mcqQuestions,
    },
    {
      title: 'SECTION B — SHORT ANSWER QUESTIONS (TYPE I)',
      list: short2Questions,
    },
    {
      title: 'SECTION C — SHORT ANSWER QUESTIONS (TYPE II)',
      list: short3Questions,
    },
    {
      title: 'SECTION D — CASE STUDY / SOURCE-BASED QUESTIONS',
      list: caseStudyQuestions,
    },
    {
      title: 'SECTION E — LONG ANSWER QUESTIONS',
      list: long5Questions,
    },
    {
      title: 'ADDITIONAL ASSESSMENT QUESTIONS',
      list: remainingQuestions,
    },
  ];

  return rawBuckets
    .filter((b) => b.list.length > 0)
    .map((b, idx) => {
      const secMarks = calculatePaperTotalMarks(b.list);
      return {
        id: `sec-std-${idx + 1}`,
        title: b.title,
        summary: `[${secMarks} Marks]`,
        totalMarks: secMarks,
        questions: b.list,
      };
    });
}

function uint8ToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

/**
 * Detects whether the code is running inside the installed NEXORA Android APK WebView.
 */
export function isAndroidApkEnvironment(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (ua.includes('NEXORA_Android_App') || ua.includes('NEXORA-Android-APK')) return true;
  if (/Android/i.test(ua) && (/\bwv\b/i.test(ua) || /Version\/\d+\.\d+/i.test(ua))) return true;
  if (window.location && window.location.protocol === 'file:') return true;
  return false;
}

function finalizeBuiltPdf(
  doc: jsPDF,
  filename: string,
  meta?: { docKind?: 'timetable' | 'timetable_old' | 'question_paper'; quizSpec?: Quiz; includeAnswerKey?: boolean }
): BuiltPdfDocument {
  const cleanFilename = sanitizePdfFilename(filename);
  const pageCount = doc.getNumberOfPages();
  const arrayBuffer = doc.output('arraybuffer');
  const uint8 = new Uint8Array(arrayBuffer);
  if (uint8.byteLength < 100) {
    throw new Error('PDF generation failed: generated PDF document is empty.');
  }
  // Verify %PDF- header
  const header = String.fromCharCode(uint8[0], uint8[1], uint8[2], uint8[3], uint8[4]);
  if (header !== '%PDF-') {
    throw new Error('PDF generation failed: invalid PDF header signature.');
  }
  const base64 = uint8ToBase64(uint8);
  return {
    doc,
    filename: cleanFilename,
    pageCount,
    byteLength: uint8.byteLength,
    uint8,
    base64,
    docKind: meta?.docKind,
    quizSpec: meta?.quizSpec,
    includeAnswerKey: meta?.includeAnswerKey,
  };
}

/**
 * Triggers a direct HTTPS download URL inside the browser / Android APK WebView.
 * Note: In MainActivity.java, any URL containing "/downloads/nexora-" or non-blob download
 * is intercepted and passed directly to Android's system downloader without leaving the app.
 */
function triggerDirectUrlDownload(downloadUrl: string, filename: string): void {
  if (typeof document === 'undefined') return;
  const anchor = document.createElement('a');
  anchor.href = downloadUrl;
  anchor.download = filename;
  anchor.rel = 'noopener noreferrer';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  setTimeout(() => {
    try {
      document.body.removeChild(anchor);
    } catch {
      // ignore cleanup error
    }
  }, 2500);
}

/**
 * Async stage-2 saver: saves a validated BuiltPdfDocument on Android APK or Website.
 * Separates PDF generation from file saving so each stage reports meaningful errors.
 * Never claims success unless the PDF file is genuinely written or handed off to a verified saver.
 */
export async function saveBuiltPdfDocument(
  built: BuiltPdfDocument,
  options: { forceServerBridge?: boolean } = {}
): Promise<PdfGenerationResult> {
  const { doc, pageCount, byteLength, uint8, base64, docKind, quizSpec, includeAnswerKey } = built;
  const filename = sanitizePdfFilename(built.filename);

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return {
      success: true,
      filename,
      pageCount,
      byteLength,
      saveMethod: 'headless',
    };
  }

  const inAndroidApk = isAndroidApkEnvironment();

  // Primary Android APK Path: Synchronous Native Bridge ("NEXORA_SAVE_PDF:" -> MainActivity.savePdfToDownloads)
  // Writes directly into MediaStore.Downloads (Android 10+) or Environment.DIRECTORY_DOWNLOADS (Android 5-9)
  // and verifies file existence and byteLength >= 100 before returning.
  if (inAndroidApk && !options.forceServerBridge) {
    const nativeRes = saveBase64PdfViaAndroidBridge(filename, base64);
    if (nativeRes.invoked) {
      if (nativeRes.ok && (nativeRes.byteLength || 0) >= 100) {
        return {
          success: true,
          filename,
          pageCount,
          byteLength: nativeRes.byteLength || byteLength,
          saveMethod: 'android_native_download',
          savedUri: nativeRes.uri,
          storageLocation: nativeRes.displayPath || `Downloads/${filename}`,
        };
      }
      throw new Error(
        `Could not save PDF to phone Downloads folder: ${
          nativeRes.error || 'Native storage write failed verification.'
        }`
      );
    }
  }

  const useAndroidBridge = options.forceServerBridge || inAndroidApk;

  // Path 1B: Fallback Android / Server Bridge if running in an older WebView without NEXORA_SAVE_PDF prompt support
  if (useAndroidBridge) {
    // Try Web Share API with PDF File object first if offline or if native prompt was not present
    const isStrictlyOffline = typeof navigator !== 'undefined' && navigator.onLine === false && !options.forceServerBridge;
    if (isStrictlyOffline && typeof navigator !== 'undefined' && typeof navigator.share === 'function' && typeof File !== 'undefined') {
      try {
        const pdfFile = new File([uint8 as unknown as BlobPart], filename, { type: 'application/pdf' });
        if (!navigator.canShare || navigator.canShare({ files: [pdfFile] })) {
          await navigator.share({
            files: [pdfFile],
            title: filename,
            text: 'NEXORA Official PDF Document',
          });
          return {
            success: true,
            filename,
            pageCount,
            byteLength,
            saveMethod: 'web_share',
            storageLocation: 'Shared via Android System Sheet',
          };
        }
      } catch (shareErr: any) {
        if (shareErr && shareErr.name === 'AbortError') {
          throw new Error('PDF save was cancelled.');
        }
      }
    }

    try {
      const prepareUrl = resolveApiUrl('/api/pdf/prepare');
      const res = await apkAwareFetch(prepareUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64, filename }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server PDF preparation returned HTTP ${res.status}`);
      }

      const data = await res.json();
      if (!data.success || !data.downloadPath) {
        throw new Error(data.error || 'Server did not return a valid PDF download path.');
      }

      // If data.embedded is true inside an older APK without the native prompt bridge,
      // try Web Share API first so the user can save directly on the phone without relying on an external browser redirect
      if (data.embedded && !options.forceServerBridge && typeof navigator !== 'undefined' && typeof navigator.share === 'function' && typeof File !== 'undefined') {
        try {
          const pdfFile = new File([uint8 as unknown as BlobPart], filename, { type: 'application/pdf' });
          if (!navigator.canShare || navigator.canShare({ files: [pdfFile] })) {
            await navigator.share({
              files: [pdfFile],
              title: filename,
              text: 'NEXORA Official PDF Document',
            });
            return {
              success: true,
              filename,
              pageCount,
              byteLength,
              saveMethod: 'web_share',
              storageLocation: 'Shared via Android System Sheet',
            };
          }
        } catch (shareErr: any) {
          if (shareErr && shareErr.name === 'AbortError') {
            throw new Error('PDF save was cancelled.');
          }
        }
      }

      let fullDownloadUrl = resolveApiUrl(data.downloadPath);
      if (data.embedded) {
        if (docKind === 'timetable' || docKind === 'timetable_old') {
          fullDownloadUrl += `${fullDownloadUrl.includes('?') ? '&' : '?'}spec=${docKind}`;
        } else if (quizSpec) {
          const compactSpec = encodeCompactQuizSpec(quizSpec, includeAnswerKey);
          if (compactSpec && compactSpec.length < 12000) {
            fullDownloadUrl += `${fullDownloadUrl.includes('?') ? '&' : '?'}spec=${encodeURIComponent(compactSpec)}`;
          }
        }
      }

      triggerDirectUrlDownload(fullDownloadUrl, filename);

      return {
        success: true,
        filename: data.filename || filename,
        pageCount,
        byteLength: data.byteLength || byteLength,
        saveMethod: 'android_native_download',
        downloadUrl: fullDownloadUrl,
        storageLocation: `Downloads/${data.filename || filename}`,
      };
    } catch (bridgeErr: any) {
      console.warn('[PDF Save] Android server bridge fallback:', bridgeErr);

      // Fallback: Web Share API with PDF File object (opens Android system share/save sheet)
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function' && typeof File !== 'undefined') {
        try {
          const pdfFile = new File([uint8 as unknown as BlobPart], filename, { type: 'application/pdf' });
          if (!navigator.canShare || navigator.canShare({ files: [pdfFile] })) {
            await navigator.share({
              files: [pdfFile],
              title: filename,
              text: 'NEXORA Official PDF Document',
            });
            return {
              success: true,
              filename,
              pageCount,
              byteLength,
              saveMethod: 'web_share',
              storageLocation: 'Shared via Android System Sheet',
            };
          }
        } catch (shareErr: any) {
          if (shareErr && shareErr.name === 'AbortError') {
            throw new Error('PDF save was cancelled.');
          }
        }
      }

      throw new Error(
        `Could not save PDF on Android device: ${
          bridgeErr instanceof Error ? bridgeErr.message : 'Unable to write PDF file to device storage.'
        }`
      );
    }
  }

  // Path 2: Standard Desktop / Mobile Browser (Website)
  try {
    doc.save(filename);
    return {
      success: true,
      filename,
      pageCount,
      byteLength,
      saveMethod: 'browser_download',
      storageLocation: `Downloads/${filename}`,
    };
  } catch (primaryErr) {
    console.warn('Primary doc.save failed, using blob anchor fallback:', primaryErr);
    try {
      const blob = new Blob([uint8 as unknown as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      triggerDirectUrlDownload(url, filename);
      setTimeout(() => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // ignore
        }
      }, 4000);
      return {
        success: true,
        filename,
        pageCount,
        byteLength,
        saveMethod: 'browser_download',
        storageLocation: `Downloads/${filename}`,
      };
    } catch (fallbackErr: any) {
      throw new Error(
        `Failed to save PDF file: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`
      );
    }
  }
}

/**
 * Synchronous wrapper for backward compatibility and synchronous unit tests.
 * Uses the synchronous native Android prompt bridge when running inside the Android APK.
 */
function downloadDocumentSync(built: BuiltPdfDocument): PdfGenerationResult {
  const { doc, pageCount, byteLength, base64 } = built;
  const filename = sanitizePdfFilename(built.filename);
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { success: true, filename, pageCount, byteLength, saveMethod: 'headless' };
  }

  if (isAndroidApkEnvironment()) {
    const nativeRes = saveBase64PdfViaAndroidBridge(filename, base64);
    if (nativeRes.invoked) {
      if (!nativeRes.ok || (nativeRes.byteLength || 0) < 100) {
        throw new Error(
          `Could not save PDF to phone Downloads folder: ${nativeRes.error || 'Native storage write failed.'}`
        );
      }
      return {
        success: true,
        filename,
        pageCount,
        byteLength: nativeRes.byteLength || byteLength,
        saveMethod: 'android_native_download',
        savedUri: nativeRes.uri,
        storageLocation: nativeRes.displayPath || `Downloads/${filename}`,
      };
    }
    void saveBuiltPdfDocument(built, { forceServerBridge: true }).catch((err) => {
      console.error('[PDF Sync Wrapper] Android PDF save failed:', err);
    });
    return { success: true, filename, pageCount, byteLength, saveMethod: 'android_native_download' };
  }

  try {
    doc.save(filename);
    return { success: true, filename, pageCount, byteLength, saveMethod: 'browser_download' };
  } catch (primaryErr) {
    console.warn('Primary doc.save failed, using blob anchor fallback:', primaryErr);
    const blob = new Blob([built.uint8 as unknown as BlobPart], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    triggerDirectUrlDownload(url, filename);
    setTimeout(() => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // ignore
      }
    }, 3000);
    return { success: true, filename, pageCount, byteLength, saveMethod: 'browser_download' };
  }
}

/**
 * Stage 1 for Timetable: Builds and validates the 1-page A4 landscape Timetable PDF
 * for whichever timetable version ('current' or 'old') is selected.
 */
export function buildTimetablePdfDocument(version?: TimetableVersion): BuiltPdfDocument {
  const activeVersion: TimetableVersion = version || getActiveTimetableVersion();
  const isOld = activeVersion === 'old';
  const activeInCharge = getActiveClassInCharge(activeVersion);

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const pageWidth = 297;
  const marginX = 10;
  const usableWidth = pageWidth - marginX * 2; // 277 mm

  // Header Section
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(marginX, 7, usableWidth, 12, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('THE ABHINAV SCHOOL — CLASS 11TH OFFICIAL TIMETABLE', marginX + 3, 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(203, 213, 225); // slate-300
  doc.text(
    `Class In-Charge: ${activeInCharge}   |   Academic Session: 2026–2027   |   Schedule: Monday to Saturday`,
    marginX + 3,
    16.5
  );

  doc.setFont('helvetica', 'bold');
  doc.text(isOld ? 'OLD TIMETABLE' : 'CURRENT TIMETABLE', pageWidth - marginX - 3, 12, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.text(`Official Institutional Copy`, pageWidth - marginX - 3, 16.5, { align: 'right' });

  // Column definitions (Total = 277 mm)
  const colW = {
    timing: 49,
    pcm: 57,
    pcb: 57,
    humanities: 57,
    commerce: 57,
  };

  const colX = {
    timing: marginX,
    pcm: marginX + colW.timing,
    pcb: marginX + colW.timing + colW.pcm,
    humanities: marginX + colW.timing + colW.pcm + colW.pcb,
    commerce: marginX + colW.timing + colW.pcm + colW.pcb + colW.humanities,
  };

  let curY = 21;

  // Table Header Row
  const headerHeight = 6.5;
  doc.setFillColor(226, 232, 240); // slate-200
  doc.rect(marginX, curY, usableWidth, headerHeight, 'F');
  doc.setDrawColor(51, 65, 85);
  doc.setLineWidth(0.3);
  doc.rect(marginX, curY, usableWidth, headerHeight, 'S');

  // Vertical column borders for header
  doc.line(colX.pcm, curY, colX.pcm, curY + headerHeight);
  doc.line(colX.pcb, curY, colX.pcb, curY + headerHeight);
  doc.line(colX.humanities, curY, colX.humanities, curY + headerHeight);
  doc.line(colX.commerce, curY, colX.commerce, curY + headerHeight);

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('Lecture & Timing', colX.timing + 2, curY + 4.5);
  doc.text('PCM (Science)', colX.pcm + colW.pcm / 2, curY + 4.5, { align: 'center' });
  doc.text('PCB (Medical)', colX.pcb + colW.pcb / 2, curY + 4.5, { align: 'center' });
  doc.text('Humanities (Arts)', colX.humanities + colW.humanities / 2, curY + 4.5, { align: 'center' });
  doc.text('Commerce', colX.commerce + colW.commerce / 2, curY + 4.5, { align: 'center' });

  curY += headerHeight;

  // Helper to draw full-width spanning row
  const drawSpanningRow = (
    title: string,
    time: string,
    description: string,
    rowH: number,
    bgColor = [248, 250, 252],
    titleColor = [15, 23, 42]
  ) => {
    doc.setFillColor(bgColor[0], bgColor[1], bgColor[2]);
    doc.rect(marginX, curY, usableWidth, rowH, 'F');
    doc.setFillColor(241, 245, 249);
    doc.rect(colX.timing, curY, colW.timing, rowH, 'F');

    doc.setDrawColor(71, 85, 105);
    doc.setLineWidth(0.2);
    doc.rect(marginX, curY, usableWidth, rowH, 'S');
    doc.line(colX.pcm, curY, colX.pcm, curY + rowH);

    doc.setTextColor(titleColor[0], titleColor[1], titleColor[2]);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text(title, colX.timing + 2, curY + 3.8);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(71, 85, 105);
    doc.text(time, colX.timing + 2, curY + 7.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(30, 41, 59);
    doc.text(description, colX.pcm + (usableWidth - colW.timing) / 2, curY + 5.5, { align: 'center' });

    curY += rowH;
  };

  // Helper to draw 4-stream standard row
  const drawStreamRow = (
    title: string,
    time: string,
    pcm: { subject: string; teacher?: string; secondLine?: string },
    pcb: { subject: string; teacher?: string; secondLine?: string },
    hum: { subject: string; teacher?: string; secondLine?: string },
    comm: { subject: string; teacher?: string; secondLine?: string },
    rowH: number
  ) => {
    doc.setFillColor(255, 255, 255);
    doc.rect(marginX, curY, usableWidth, rowH, 'F');
    doc.setFillColor(248, 250, 252);
    doc.rect(colX.timing, curY, colW.timing, rowH, 'F');

    doc.setDrawColor(71, 85, 105);
    doc.setLineWidth(0.2);
    doc.rect(marginX, curY, usableWidth, rowH, 'S');
    doc.line(colX.pcm, curY, colX.pcm, curY + rowH);
    doc.line(colX.pcb, curY, colX.pcb, curY + rowH);
    doc.line(colX.humanities, curY, colX.humanities, curY + rowH);
    doc.line(colX.commerce, curY, colX.commerce, curY + rowH);

    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text(title, colX.timing + 2, curY + 3.8);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(71, 85, 105);
    doc.text(time, colX.timing + 2, curY + 7.5);

    const drawCell = (
      x: number,
      width: number,
      data: { subject: string; teacher?: string; secondLine?: string }
    ) => {
      const isFree = data.subject.toLowerCase().includes('free');
      const hasTeacher = Boolean(!isFree && data.teacher && data.teacher !== '—');
      if (isFree) {
        doc.setFillColor(241, 245, 249);
        doc.rect(x + 0.2, curY + 0.2, width - 0.4, rowH - 0.4, 'F');
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(data.secondLine ? 6.8 : 7.5);
      doc.setTextColor(isFree ? 100 : 15, isFree ? 116 : 23, isFree ? 139 : 42);

      if (data.secondLine && hasTeacher) {
        doc.text(data.subject, x + width / 2, curY + 3.4, { align: 'center' });
        doc.text(data.secondLine, x + width / 2, curY + 6.5, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.2);
        doc.setTextColor(71, 85, 105);
        doc.text(`Teacher: ${data.teacher}`, x + width / 2, curY + 9.8, { align: 'center' });
      } else if (data.secondLine) {
        doc.text(data.subject, x + width / 2, curY + 4.3, { align: 'center' });
        doc.text(data.secondLine, x + width / 2, curY + 8.2, { align: 'center' });
      } else if (hasTeacher) {
        doc.text(data.subject, x + width / 2, curY + 4.2, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(71, 85, 105);
        doc.text(`Teacher: ${data.teacher}`, x + width / 2, curY + 8.0, { align: 'center' });
      } else {
        doc.text(data.subject, x + width / 2, curY + rowH / 2 + 1.2, { align: 'center' });
      }
    };

    drawCell(colX.pcm, colW.pcm, pcm);
    drawCell(colX.pcb, colW.pcb, pcb);
    drawCell(colX.humanities, colW.humanities, hum);
    drawCell(colX.commerce, colW.commerce, comm);

    curY += rowH;
  };

  // Helper to draw dual matrix split row (Old Timetable First Lecture & Fifth Lecture)
  const drawDualMatrixRow = (
    title: string,
    time: string,
    monWed: { pcm: string; pcb: string; hum: string; comm: string; pcmT?: string; pcbT?: string; humT?: string; commT?: string },
    thuSat: { pcm: string; pcb: string; hum: string; comm: string; pcmT?: string; pcbT?: string; humT?: string; commT?: string },
    rowH: number
  ) => {
    doc.setFillColor(255, 255, 255);
    doc.rect(marginX, curY, usableWidth, rowH, 'F');
    doc.setFillColor(248, 250, 252);
    doc.rect(colX.timing, curY, colW.timing, rowH, 'F');

    doc.setDrawColor(71, 85, 105);
    doc.setLineWidth(0.2);
    doc.rect(marginX, curY, usableWidth, rowH, 'S');
    doc.line(colX.pcm, curY, colX.pcm, curY + rowH);
    doc.line(colX.pcb, curY, colX.pcb, curY + rowH);
    doc.line(colX.humanities, curY, colX.humanities, curY + rowH);
    doc.line(colX.commerce, curY, colX.commerce, curY + rowH);

    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text(title, colX.timing + 2, curY + 3.8);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(71, 85, 105);
    doc.text(time, colX.timing + 2, curY + 7.5);
    doc.setFontSize(6);
    doc.setTextColor(14, 116, 144);
    doc.text('2-Group Matrix', colX.timing + 2, curY + 11);

    const halfH = rowH / 2;
    doc.setDrawColor(203, 213, 225);
    doc.line(colX.pcm, curY + halfH, marginX + usableWidth, curY + halfH);

    const renderDualCell = (
      x: number,
      width: number,
      mwSubj: string,
      mwTeacher: string,
      tsSubj: string,
      tsTeacher: string
    ) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.8);
      doc.setTextColor(15, 23, 42);
      doc.text(`[M-W] ${mwSubj}`, x + width / 2, curY + 3.2, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.setTextColor(71, 85, 105);
      doc.text(mwTeacher, x + width / 2, curY + 6.4, { align: 'center' });

      const isFree = tsSubj.toLowerCase().includes('free');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.8);
      doc.setTextColor(isFree ? 100 : 15, isFree ? 116 : 23, isFree ? 139 : 42);
      doc.text(`[Th-S] ${tsSubj}`, x + width / 2, curY + halfH + 3.2, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.setTextColor(71, 85, 105);
      doc.text(tsTeacher, x + width / 2, curY + halfH + 6.4, { align: 'center' });
    };

    renderDualCell(colX.pcm, colW.pcm, monWed.pcm, monWed.pcmT || '', thuSat.pcm, thuSat.pcmT || '');
    renderDualCell(colX.pcb, colW.pcb, monWed.pcb, monWed.pcbT || '', thuSat.pcb, thuSat.pcbT || '');
    renderDualCell(colX.humanities, colW.humanities, monWed.hum, monWed.humT || '', thuSat.hum, thuSat.humT || '');
    renderDualCell(colX.commerce, colW.commerce, monWed.comm, monWed.commT || '', thuSat.comm, thuSat.commT || '');

    curY += rowH;
  };

  // --- COMMON MORNING ROWS ---
  drawSpanningRow(
    'School Entry Time',
    '7:30 AM – 8:00 AM',
    'Campus Gates Open, Student Entry, Arrival Verification & Settling In (All Streams)',
    9.5,
    [248, 250, 252]
  );

  drawSpanningRow(
    'Morning Prayer',
    '8:00 AM – 8:20 AM',
    'Morning Assembly, School Prayer, Pledge, Thought for the Day & National Anthem (All Streams)',
    9.5,
    [248, 250, 252]
  );

  drawSpanningRow(
    'Zero Lecture',
    '8:20 AM – 8:30 AM',
    `Class Meeting, Attendance & Morning Announcements — ${activeInCharge} (All Streams)`,
    9,
    [241, 245, 249]
  );

  if (isOld) {
    // --- OLD TIMETABLE LECTURES ---
    drawDualMatrixRow(
      'First Lecture',
      '8:30 AM – 9:10 AM',
      {
        pcm: 'Physics',
        pcmT: 'Diksha Mam',
        pcb: 'Physics',
        pcbT: 'Diksha Mam',
        hum: 'Economics',
        humT: 'Alka Mam',
        comm: 'Economics',
        commT: 'Alka Mam',
      },
      {
        pcm: 'Free Period',
        pcmT: '',
        pcb: 'Free Period',
        pcbT: '',
        hum: 'Economics',
        humT: 'Alka Mam',
        comm: 'Economics',
        commT: 'Alka Mam',
      },
      14
    );

    drawStreamRow(
      'Second Lecture',
      '9:10 AM – 9:50 AM',
      { subject: 'English', teacher: 'Nancy Mam' },
      { subject: 'English', teacher: 'Nancy Mam' },
      { subject: 'English', teacher: 'Nancy Mam' },
      { subject: 'English', teacher: 'Nancy Mam' },
      10.5
    );

    drawSpanningRow(
      'Fruit Break',
      '9:50 AM – 10:00 AM',
      'Fruit Break (Nutrition & Classroom Relaxation — All Streams)',
      8.5,
      [254, 243, 199]
    );

    drawStreamRow(
      'Third Lecture',
      '10:00 AM – 10:40 AM',
      { subject: 'Mathematics', teacher: 'Anita Mam' },
      { subject: 'Biology', teacher: 'Shalini Mam' },
      { subject: 'Free' },
      { subject: 'Free' },
      10.5
    );

    drawStreamRow(
      'Fourth Lecture',
      '10:40 AM – 11:20 AM',
      { subject: 'Physics', teacher: 'Diksha Mam' },
      { subject: 'Physics', teacher: 'Diksha Mam' },
      { subject: 'Political Science / History', teacher: 'Ritu Mam' },
      { subject: 'Business Studies', teacher: 'Alka Mam' },
      10.5
    );

    drawSpanningRow(
      'Lunch Break',
      '11:20 AM – 11:45 AM',
      'Lunch Break (Cafeteria & Recess — All Streams)',
      8.5,
      [254, 243, 199]
    );

    drawDualMatrixRow(
      'Fifth Lecture',
      '11:45 AM – 12:25 PM',
      {
        pcm: 'Physical Education (PE) & AI',
        pcmT: '',
        pcb: 'Physical Education (PE) & AI',
        pcbT: '',
        hum: 'Physical Education (PE) & AI',
        humT: '',
        comm: 'Physical Education (PE) & AI',
        commT: '',
      },
      {
        pcm: 'Fine Arts and AI',
        pcmT: '',
        pcb: 'Fine Arts and AI',
        pcbT: '',
        hum: 'Fine Arts and AI',
        humT: '',
        comm: 'Fine Arts and AI',
        commT: '',
      },
      14
    );

    drawStreamRow(
      'Sixth Lecture',
      '12:25 PM – 1:05 PM',
      { subject: 'Chemistry', teacher: 'Harshu Mam' },
      { subject: 'Chemistry', teacher: 'Harshu Mam' },
      { subject: 'Free' },
      { subject: 'Accounts', teacher: 'Alka Mam' },
      10.5
    );
  } else {
    // --- CURRENT TIMETABLE LECTURES (DEFAULT) ---
    drawStreamRow(
      'First Lecture',
      '8:30 AM – 9:10 AM',
      { subject: 'Physics', teacher: 'Diksha Mam' },
      { subject: 'Physics', teacher: 'Diksha Mam' },
      { subject: 'Free' },
      { subject: 'Business Studies', teacher: 'Parul Mam' },
      11
    );

    drawStreamRow(
      'Second Lecture',
      '9:10 AM – 9:50 AM',
      { subject: 'English', teacher: 'Nancy Mam' },
      { subject: 'English', teacher: 'Nancy Mam' },
      { subject: 'English', teacher: 'Nancy Mam' },
      { subject: 'English', teacher: 'Nancy Mam' },
      11
    );

    drawSpanningRow(
      'Fruit Break',
      '9:50 AM – 10:00 AM',
      'Fruit Break (Nutrition & Classroom Relaxation — All Streams)',
      8.5,
      [254, 243, 199]
    );

    drawStreamRow(
      'Third Lecture',
      '10:00 AM – 10:40 AM',
      { subject: 'Chemistry', teacher: 'Harshu Mam' },
      { subject: 'Chemistry', teacher: 'Harshu Mam' },
      {
        subject: '[M-W] Political Science',
        secondLine: '[Th-S] History',
        teacher: 'Ritu Mam',
      },
      { subject: 'Accountancy', teacher: 'Alka Mam' },
      12
    );

    drawStreamRow(
      'Fourth Lecture',
      '10:40 AM – 11:20 AM',
      { subject: 'Mathematics', teacher: 'Anita Mam' },
      { subject: 'Free' },
      { subject: 'Free' },
      { subject: 'Free' },
      11
    );

    drawSpanningRow(
      'Lunch Break',
      '11:20 AM – 11:45 AM',
      'Lunch Break (Cafeteria & Recess — All Streams)',
      8.5,
      [254, 243, 199]
    );

    drawStreamRow(
      'Fifth Lecture',
      '11:45 AM – 12:25 PM',
      { subject: '[M-W] Physics', secondLine: '[Th-S] Chemistry' },
      { subject: '[M-W] Physics', secondLine: '[Th-S] Chemistry' },
      { subject: 'Economics', teacher: 'Alka Mam' },
      { subject: 'Economics', teacher: 'Alka Mam' },
      12
    );

    drawStreamRow(
      'Sixth Lecture',
      '12:25 PM – 1:05 PM',
      { subject: '[M-W] Physical Education', secondLine: '[Th-S] Fine Arts' },
      { subject: '[M-W] Physical Education', secondLine: '[Th-S] Fine Arts' },
      { subject: '[M-W] Physical Education', secondLine: '[Th-S] Fine Arts' },
      { subject: '[M-W] Physical Education', secondLine: '[Th-S] Fine Arts' },
      12
    );
  }

  drawSpanningRow(
    'Dispersal & Waiting',
    '1:05 PM – 2:00 PM',
    'School Off / Dispersal & Waiting Period: All regular classes end at 1:05 PM. Bus/van and student pickup until 2:00 PM.',
    9.5,
    [241, 245, 249]
  );

  // Institutional Info Row (No approval/verification statements)
  curY += 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(30, 41, 59);
  doc.text('THE ABHINAV SCHOOL', marginX, curY + 3);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  doc.text('•   NEXORA Class 11 Command Center   •   Official Institutional Academic Timetable', marginX + 37, curY + 3);
  doc.text(isOld ? 'Class 11th (Old Timetable)' : 'Class 11th (Current Timetable)', pageWidth - marginX, curY + 3, { align: 'right' });

  // EXACT TIMETABLE DISCLAIMER BOX AT BOTTOM (Single box, exact text required)
  curY += 5.5;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.2);
  doc.rect(marginX, curY, usableWidth, 6.5, 'FD');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(71, 85, 105);
  doc.text(
    'Note: This timetable is for regular school days. In case of any school function, special event, or other activities, the timetable may vary for that day or for a few days.',
    marginX + usableWidth / 2,
    curY + 4.2,
    { align: 'center' }
  );

  const filename = `NEXORA_Class11_Timetable_Official.pdf`;
  return finalizeBuiltPdf(doc, filename, {
    docKind: isOld ? 'timetable_old' : 'timetable',
  });
}

/**
 * Generates and downloads the Official Class 11 Timetable PDF (synchronous interface).
 */
export function generateTimetablePdf(version?: TimetableVersion): PdfGenerationResult {
  const built = buildTimetablePdfDocument(version);
  return downloadDocumentSync(built);
}

/**
 * Async two-stage Timetable PDF generator & saver (supports Android APK native downloader + browser).
 */
export async function downloadTimetablePdf(
  options: { forceServerBridge?: boolean; version?: TimetableVersion } = {}
): Promise<PdfGenerationResult> {
  const built = buildTimetablePdfDocument(options.version);
  return saveBuiltPdfDocument(built, { forceServerBridge: options.forceServerBridge });
}

/**
 * Stage 1 for Question Paper: Builds and validates the multi-page A4 portrait Question Paper PDF
 * without triggering side effects, so generation errors are cleanly separated from file-save errors.
 */
export function buildQuestionPaperPdfDocument(
  quiz: Quiz,
  options: { includeAnswerKey?: boolean } = {}
): BuiltPdfDocument {
  if (!quiz || !Array.isArray(quiz.questions) || quiz.questions.length === 0) {
    throw new Error('Cannot generate PDF: Question paper contains no questions.');
  }

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const marginX = 14;
  const usableWidth = pageWidth - marginX * 2; // 182 mm
  const maxY = 278; // Page break threshold

  const paperConfig = quiz.paperConfig || {};
  const duration = paperConfig.durationMinutes || Math.round((quiz.timeLimitSeconds || 5400) / 60) || 90;
  const examDate =
    paperConfig.examDate ||
    new Date(quiz.createdAt || Date.now()).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

  // Calculate live total marks from actual questions
  const totalMarks = calculatePaperTotalMarks(quiz.questions);
  const sections = groupQuestionsIntoPaperSections(quiz.questions);

  let curY = 16;

  // Standard Question Paper Header on Page 1:
  // THE ABHINAV SCHOOL
  // CLASS 11TH
  // SAMPLE PAPER
  // Subject: [Actual selected subject]
  // Maximum Marks: [Actual configured total marks]
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text('THE ABHINAV SCHOOL', pageWidth / 2, curY, { align: 'center' });

  curY += 5.2;
  doc.setFontSize(10.5);
  doc.text('CLASS 11TH', pageWidth / 2, curY, { align: 'center' });

  curY += 4.8;
  doc.setFontSize(9.5);
  doc.text('SAMPLE PAPER', pageWidth / 2, curY, { align: 'center' });

  curY += 4.5;
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 41, 59);
  doc.text(`Subject: ${quiz.subject || 'Academic Assessment'}`, pageWidth / 2, curY, { align: 'center' });

  curY += 4;
  doc.text(`Maximum Marks: ${totalMarks}`, pageWidth / 2, curY, { align: 'center' });

  if (options.includeAnswerKey) {
    curY += 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(180, 83, 9); // amber-700
    doc.text('*** TEACHER ANSWER KEY & EVALUATION RUBRIC ***', pageWidth / 2, curY, { align: 'center' });
  }

  // Header Divider
  curY += 3;
  doc.setDrawColor(30, 41, 59);
  doc.setLineWidth(0.4);
  doc.line(marginX, curY, marginX + usableWidth, curY);

  // Metadata Grid (Time, Date, Stream)
  curY += 3.8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.setTextColor(51, 65, 85);
  doc.text(`Time Allowed: ${duration} Minutes`, marginX, curY);
  doc.text(`Date: ${examDate}`, pageWidth / 2, curY, { align: 'center' });
  const streamInfo = quiz.stream ? `Stream: ${quiz.stream}` : 'All Streams';
  doc.text(streamInfo, marginX + usableWidth, curY, { align: 'right' });

  curY += 2;
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.2);
  doc.line(marginX, curY, marginX + usableWidth, curY);

  // General Instructions Box (Page 1)
  curY += 3.5;
  const customInstructions =
    Array.isArray(paperConfig.generalInstructions) && paperConfig.generalInstructions.length > 0
      ? paperConfig.generalInstructions
      : [
          'All questions are compulsory. Internal choice is provided in designated questions where applicable.',
          `This question paper contains ${quiz.questions.length} questions organized in structured sections.`,
          'Marks are indicated against each question. Answer concisely according to the allocated marks.',
          'Use of calculators, cell phones, or electronic communication devices is strictly prohibited.',
        ];

  const wrappedInstructionLines: string[] = [];
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  customInstructions.forEach((inst, idx) => {
    const numbered = /^\d+\./.test(inst.trim()) ? inst.trim() : `${idx + 1}. ${inst.trim()}`;
    const split = doc.splitTextToSize(numbered, usableWidth - 6);
    wrappedInstructionLines.push(...split);
  });

  const instBoxH = Math.max(16, wrappedInstructionLines.length * 3.3 + 7);
  doc.setFillColor(248, 250, 252);
  doc.rect(marginX, curY, usableWidth, instBoxH, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.rect(marginX, curY, usableWidth, instBoxH, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text('General Instructions:', marginX + 3, curY + 4);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(51, 65, 85);
  wrappedInstructionLines.forEach((line, lIdx) => {
    doc.text(line, marginX + 3, curY + 7.5 + lIdx * 3.3);
  });

  curY += instBoxH + 4;

  let qNumCounter = 0;

  // Helper for checking page overflow
  const ensureSpace = (neededHeight: number) => {
    if (curY + neededHeight > maxY) {
      doc.addPage();
      curY = 16;
      doc.setDrawColor(226, 232, 240);
      doc.line(marginX, 12, marginX + usableWidth, 12);
    }
  };

  // Helper for drawing Section Title Bar
  const drawSectionTitle = (title: string, summary: string) => {
    ensureSpace(12);
    doc.setFillColor(241, 245, 249);
    doc.rect(marginX, curY, usableWidth, 6, 'F');
    doc.setDrawColor(71, 85, 105);
    doc.setLineWidth(0.2);
    doc.rect(marginX, curY, usableWidth, 6, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.8);
    doc.setTextColor(15, 23, 42);
    doc.text(title, marginX + 2.5, curY + 4.2);
    doc.text(summary, marginX + usableWidth - 2.5, curY + 4.2, { align: 'right' });

    curY += 8.5;
  };

  // Render every section and question in sequence
  sections.forEach((section) => {
    drawSectionTitle(section.title, section.summary);

    section.questions.forEach((q) => {
      qNumCounter += 1;
      const qMarks = getSingleQuestionMarks(q);

      if (q.questionType === 'case_study' || (q.casePassage && q.casePassage.trim().length > 0)) {
        ensureSpace(14);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.2);
        doc.setTextColor(15, 23, 42);
        const headerLines = doc.splitTextToSize(`Q${qNumCounter}. ${q.question || 'PASSAGE / SOURCE-BASED QUESTION'}`, usableWidth - 20);
        doc.text(headerLines, marginX, curY);
        doc.text(`[${qMarks} Marks]`, marginX + usableWidth, curY, { align: 'right' });
        curY += headerLines.length * 3.6 + 1.5;

        // Passage text in boxed background if casePassage exists
        if (q.casePassage && q.casePassage.trim().length > 0) {
          const passageLines = doc.splitTextToSize(q.casePassage.trim(), usableWidth - 8);
          // Handle long reading passages gracefully across pages if needed
          const passBoxH = passageLines.length * 3.2 + 4;
          ensureSpace(Math.min(passBoxH + 6, 85));

          doc.setFillColor(248, 250, 252);
          doc.rect(marginX, curY, usableWidth, passBoxH, 'F');
          doc.setDrawColor(148, 163, 184);
          doc.setLineWidth(0.2);
          doc.rect(marginX, curY, usableWidth, passBoxH, 'S');

          doc.setFont('helvetica', 'italic');
          doc.setFontSize(7.2);
          doc.setTextColor(30, 41, 59);
          doc.text(passageLines, marginX + 4, curY + 3.5);
          curY += passBoxH + 3;
        }

        // Subquestions
        if (Array.isArray(q.subQuestions) && q.subQuestions.length > 0) {
          q.subQuestions.forEach((sq, sqIdx) => {
            const subNum = sq.subNumber || `(${sqIdx + 1})`;
            const sqLines = doc.splitTextToSize(`${subNum} ${sq.question}`, usableWidth - 18);
            ensureSpace(sqLines.length * 3.5 + 4);

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.5);
            doc.setTextColor(15, 23, 42);
            doc.text(sqLines, marginX + 4, curY);
            doc.text(`[${sq.marks || 1}]`, marginX + usableWidth, curY, { align: 'right' });
            curY += sqLines.length * 3.5 + 1;

            // MCQ options if subquestion is MCQ
            if (sq.options && Array.isArray(sq.options) && sq.options.length > 0) {
              const optHalfWidth = (usableWidth - 12) / 2;
              sq.options.forEach((opt, oIdx) => {
                const letter = String.fromCharCode(65 + oIdx);
                const colX = oIdx % 2 === 0 ? marginX + 8 : marginX + 8 + optHalfWidth;
                const isCorrect = options.includeAnswerKey && sq.correctIndex === oIdx;

                doc.setFont('helvetica', isCorrect ? 'bold' : 'normal');
                doc.setFontSize(7);
                doc.setTextColor(isCorrect ? 16 : 51, isCorrect ? 185 : 65, isCorrect ? 129 : 85);
                const optText = doc.splitTextToSize(`(${letter}) ${opt}${isCorrect ? ' [KEY]' : ''}`, optHalfWidth - 4);
                doc.text(optText[0] || `(${letter}) ${opt}`, colX, curY);

                if (oIdx % 2 === 1 || oIdx === sq.options!.length - 1) {
                  curY += 3.5;
                }
              });
            }

            if (options.includeAnswerKey && (sq.modelAnswer || sq.explanation)) {
              ensureSpace(6);
              doc.setFont('helvetica', 'italic');
              doc.setFontSize(6.8);
              doc.setTextColor(4, 120, 87);
              const ansLines = doc.splitTextToSize(`Ans: ${sq.modelAnswer || sq.explanation}`, usableWidth - 10);
              doc.text(ansLines, marginX + 8, curY);
              curY += ansLines.length * 3.2 + 1;
            }

            curY += 1.5;
          });
        } else if (options.includeAnswerKey && (q.modelAnswer || q.explanation)) {
          ensureSpace(8);
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(7);
          doc.setTextColor(4, 120, 87);
          const ansLines = doc.splitTextToSize(`Model Answer / Rubric: ${q.modelAnswer || q.explanation}`, usableWidth - 6);
          doc.text(ansLines, marginX + 4, curY);
          curY += ansLines.length * 3.2 + 1;
        }

        curY += 2;
        return;
      }

      // Standard MCQ / Fill-in / Short / Long question rendering
      const qPrefix = `Q${qNumCounter}. `;
      const marksStr = `[${qMarks}]`;
      const hasOptions = Array.isArray(q.options) && q.options.length > 0;

      const qLines = doc.splitTextToSize(qPrefix + q.question, usableWidth - 14);
      const neededH = qLines.length * 3.8 + (hasOptions ? 10 : 4);
      ensureSpace(neededH);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text(qLines, marginX, curY);
      doc.text(marksStr, marginX + usableWidth, curY, { align: 'right' });

      curY += qLines.length * 3.8 + 1.2;

      if (hasOptions) {
        const optHalfWidth = (usableWidth - 8) / 2;
        q.options!.forEach((opt, oIdx) => {
          const letter = String.fromCharCode(65 + oIdx);
          const colX = oIdx % 2 === 0 ? marginX + 4 : marginX + 4 + optHalfWidth;
          const isCorrect = options.includeAnswerKey && q.correctIndex === oIdx;

          doc.setFont('helvetica', isCorrect ? 'bold' : 'normal');
          doc.setFontSize(7.5);
          doc.setTextColor(isCorrect ? 16 : 51, isCorrect ? 185 : 65, isCorrect ? 129 : 85);
          const optText = doc.splitTextToSize(`(${letter}) ${opt}${isCorrect ? ' [CORRECT]' : ''}`, optHalfWidth - 4);
          doc.text(optText[0] || `(${letter}) ${opt}`, colX, curY);

          if (oIdx % 2 === 1 || oIdx === q.options!.length - 1) {
            curY += 3.8;
          }
        });
      }

      if (options.includeAnswerKey && (q.modelAnswer || q.explanation)) {
        ensureSpace(8);
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(7);
        doc.setTextColor(4, 120, 87);
        const keyText = hasOptions
          ? `Ans: Option (${String.fromCharCode(65 + (q.correctIndex ?? 0))}) — ${q.explanation || q.modelAnswer}`
          : `Model Answer / Key: ${q.modelAnswer || q.explanation}`;
        const ansLines = doc.splitTextToSize(keyText, usableWidth - 6);
        doc.text(ansLines, marginX + 4, curY);
        curY += ansLines.length * 3.2 + 1;
      }

      curY += 2;
    });
  });

  // End of Examination Paper Sign-off
  ensureSpace(12);
  curY += 2;
  doc.setDrawColor(71, 85, 105);
  doc.setLineWidth(0.3);
  doc.line(marginX + 20, curY, marginX + usableWidth - 20, curY);

  curY += 4.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text('— END OF QUESTION PAPER —', pageWidth / 2, curY, { align: 'center' });

  // Add Running Page Numbers & Footers to all pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(marginX, pageHeight - 11, marginX + usableWidth, pageHeight - 11);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(100, 116, 139);
    doc.text(`Page ${i} of ${totalPages}`, marginX, pageHeight - 6.5);

    // Minimal NEXORA Footer on the FINAL page only
    if (i === totalPages) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.8);
      doc.setTextColor(148, 163, 184);
      doc.text('NEXORA', marginX + usableWidth, pageHeight - 6.5, { align: 'right' });
    }
  }

  const cleanSubj = (quiz.subject || 'Exam')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const rawTitle = (quiz.paperConfig?.examName || quiz.title || '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 38)
    .replace(/_+$/g, '');
  const suffix = options.includeAnswerKey ? 'Answer_Key' : 'Question_Paper';
  const titlePart =
    rawTitle && rawTitle.toLowerCase() !== cleanSubj.toLowerCase()
      ? `${rawTitle}_${suffix}`
      : suffix;
  const filename = `NEXORA_Class11_${cleanSubj}_${titlePart}.pdf`;

  return finalizeBuiltPdf(doc, filename, {
    docKind: 'question_paper',
    quizSpec: quiz,
    includeAnswerKey: options.includeAnswerKey,
  });
}

/**
 * Generates and downloads the Official Question Paper PDF (synchronous interface).
 */
export function generateQuestionPaperPdf(
  quiz: Quiz,
  options: { includeAnswerKey?: boolean } = {}
): PdfGenerationResult {
  const built = buildQuestionPaperPdfDocument(quiz, options);
  return downloadDocumentSync(built);
}

/**
 * Async two-stage Question Paper PDF generator & saver.
 * Stage 1: Builds and validates the PDF bytes and page count.
 * Stage 2: Saves via Android APK native external download bridge (/downloads/nexora-paper/...) or browser download,
 * confirming completion before returning.
 */
export async function downloadQuestionPaperPdf(
  quiz: Quiz,
  options: { includeAnswerKey?: boolean; forceServerBridge?: boolean } = {}
): Promise<PdfGenerationResult> {
  const built = buildQuestionPaperPdfDocument(quiz, { includeAnswerKey: options.includeAnswerKey });
  return saveBuiltPdfDocument(built, { forceServerBridge: options.forceServerBridge });
}
