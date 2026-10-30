import express from 'express';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { validateAndNormalizeMCQ } from './src/utils/mcqValidator.ts';
import { registerStaffBackendRoutes } from './src/server/staffBackend.ts';
import {
  synthesizeCbseAssessment,
  synthesizeRegeneratedQuestion,
  synthesizeAcademicChatReply,
} from './src/utils/cbsePaperSynthesizer.ts';
import {
  buildQuestionPaperPdfDocument,
  buildTimetablePdfDocument,
  decodeCompactQuizSpec,
} from './src/utils/pdfGenerator.ts';

dotenv.config();
process.env.DISABLE_HMR = 'true';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));

// Global CORS middleware for all /api/* routes so installed Android APK WebView (file:// / Origin: null)
// and published web clients can call Gemini quiz generation, health, and sync endpoints seamlessly.
app.use('/api', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, Accept, Cache-Control, Pragma, X-Requested-With, X-Nexora-Role'
  );
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// Health / status endpoint for Gemini configuration
app.get('/api/health', (_req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  const isConfigured = Boolean(apiKey && apiKey.trim() !== '' && apiKey !== 'MY_GEMINI_API_KEY');
  res.json({
    status: 'ok',
    geminiConfigured: isConfigured,
    school: 'THE ABHINAV SCHOOL',
    class: 'CLASS 11TH',
    inCharge: 'Diksha Mam',
    timetableReadOnly: true,
    timestamp: new Date().toISOString()
  });
});

// Enforce backend read-only access on timetable endpoints
app.all(['/api/timetable*', '/api/schedule*'], (req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return res.status(403).json({
      error: 'Forbidden: Timetable is permanently read-only. Schedule modifications are not permitted.',
      code: 'TIMETABLE_READ_ONLY',
    });
  }
  next();
});

// Gemini chat endpoint
app.post('/api/gemini/chat', async (req, res) => {
  const { prompt, history } = req.body || {};
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: 'A valid text prompt is required.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === '' || apiKey === 'MY_GEMINI_API_KEY') {
    const synthesized = synthesizeAcademicChatReply(req.body);
    return res.status(synthesized.status).json(synthesized.body);
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
    const systemInstruction = `You are CLASS OS AI, the smart command-center academic copilot for The Abhinav School (Class In-charge: Alka Mam).
You support students across all four streams:
- PCM (Physics, Chemistry, Mathematics)
- PCB (Physics, Chemistry, Biology)
- Commerce (Economics, Accountancy, Business Studies)
- Humanities (Economics, History, Political Science, Geography)
- Common & Elective Subjects: English (Nancy Mam), Physical Education (Code 048), Artificial Intelligence (Code 843), Fine Arts (Painting, Code 049).

OFFICIAL CBSE CURRICULUM ALLOCATION RULES:
1. Physical Education (PE, Code 048), Artificial Intelligence (AI, Code 843), and Fine Arts (Painting, Code 049) STRICTLY follow the official CBSE Class 12 NCERT / Skill curriculum (Academic Session 2024-25 / 2025-26).
   - PE Class 12: Management of Sporting Events, Yoga for Lifestyle Disease, CWSN, Sports Nutrition, Test & Measurement, Physiology & Injuries, Biomechanics, Psychology, Training in Sports.
   - AI Class 12: Advanced Python & Data Structures, Data Science Methodology, Computer Vision & CNNs, Data Mining, Big Data Analytics, Neural Networks & Backprop, Generative AI & LLMs, Capstone Project.
   - Fine Arts Class 12: Rajasthani, Pahari, Mughal, and Deccani Schools of Miniature Painting, Bengal School, Modern Trends in Indian Art.
2. All other subjects (Physics, Chemistry, Mathematics, Biology, English, Accountancy, Business Studies, Economics, History, Political Science, Geography) STRICTLY follow the official CBSE Class 11 NCERT curriculum.

Provide concise, accurate, encouraging, and structured educational guidance grounded strictly in the official prescribed syllabus for that subject.
Use clean markdown with headers, bullet points, and LaTeX-style or clear math expressions where relevant.`;

    const contents: any[] = [];
    if (Array.isArray(history) && history.length > 0) {
      for (const item of history.slice(-6)) {
        if (item.text && typeof item.text === 'string') {
          contents.push({
            role: item.role === 'user' ? 'user' : 'model',
            parts: [{ text: item.text }]
          });
        }
      }
    }

    contents.push({
      role: 'user',
      parts: [{ text: prompt.trim() }]
    });

    // Robust generation with candidate model fallback across active Gemini models
    let reply = '';
    const CHAT_MODELS = ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite', 'gemini-2.5-flash'];

    for (const model of CHAT_MODELS) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction,
            temperature: 0.7,
          },
        });
        if (response && response.text) {
          reply = response.text;
          break;
        }
      } catch (chatErr: any) {
        console.warn(`[Gemini Chat] Model ${model} unavailable: ${chatErr?.message || chatErr}. Trying fallback...`);
      }
    }

    if (!reply) {
      const synthesized = synthesizeAcademicChatReply(req.body);
      return res.status(synthesized.status).json(synthesized.body);
    }

    return res.json({ reply });
  } catch (err: any) {
    console.error('Gemini server error:', err);
    const synthesized = synthesizeAcademicChatReply(req.body);
    return res.status(synthesized.status).json(synthesized.body);
  }
});

// Candidate models for quiz & question paper generation:
// Attempts gemini-2.5-flash first per specification, cascading gracefully to active Gemini models if deprecated/exhausted
const CANDIDATE_MODELS = [
  'gemini-2.5-flash',
  'gemini-3.8-flash',
  'gemini-flash-latest',
  'gemini-3.1-flash-lite',
];

function withModelTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Gemini model request timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

async function generateWithModelFallback(
  ai: GoogleGenAI,
  prompt: string,
  systemInstruction?: string,
  timeoutMs = 12000
) {
  let lastError: any = null;
  for (const model of CANDIDATE_MODELS) {
    try {
      const response = await withModelTimeout(
        ai.models.generateContent({
          model,
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          config: {
            responseMimeType: 'application/json',
            temperature: 0.85,
            ...(systemInstruction ? { systemInstruction } : {}),
          },
        }),
        timeoutMs
      );
      if (response && response.text) {
        return { text: response.text, modelUsed: model };
      }
    } catch (err: any) {
      lastError = err;
      console.warn(`[AI Quiz Server] Model ${model} experienced temporary issue: ${err?.message || err}. Cascading to fallback...`);
    }
  }
  throw lastError || new Error('All candidate AI models were unavailable. Please retry shortly.');
}

function getSubjectClassLevel(subjectName?: string): 'Class 11' | 'Class 12' {
  if (!subjectName) return 'Class 11';
  const s = subjectName.toLowerCase().trim();
  if (
    s.includes('physical education') ||
    s === 'pe' ||
    s.includes('artificial intelligence') ||
    s === 'ai' ||
    s.includes('fine art') ||
    s.includes('painting')
  ) {
    return 'Class 12';
  }
  return 'Class 11';
}

const ACADEMIC_SYSTEM_INSTRUCTION = `You are the Official CBSE Academic Assessment Generator for The Abhinav School (NEXORA Command Center, Class In-Charge: Alka Mam).
You generate rigorous, authentic, NCERT/CBSE-grounded examination questions for students across PCM, PCB, Humanities, and Commerce.

OFFICIAL SYLLABUS GROUNDING RULES:
1. For Physical Education (Code 048), Artificial Intelligence (Code 843), and Fine Arts (Painting, Code 049):
   - You MUST generate questions strictly based on the official CBSE Class 12 NCERT / Skill curriculum (Academic Session 2024-25 / 2025-26).
   - Physical Education (048): Management of Sporting Events, Children & Women in Sports, Yoga as Preventive Measure for Lifestyle Disease, PE & Sports for CWSN, Sports & Nutrition, Test & Measurement in Sports, Physiology & Injuries in Sports, Biomechanics & Sports, Psychology & Sports, Training in Sports.
   - Artificial Intelligence (843): Advanced Python Programming & Data Structures, Data Science Methodology, Computer Vision & CNNs, Data Mining with Orange Tool, Big Data Analytics, Neural Networks & Backpropagation, Generative AI & LLMs, Data Storytelling, Capstone AI Project Lifecycle.
   - Fine Arts (049): Rajasthani School of Miniature Painting, Pahari School, Mughal School, Deccani School, Bengal School of Painting & National Flag evolution, Modern Trends in Indian Art.
2. For all other subjects (Physics, Chemistry, Mathematics, Biology, English, Accountancy, Business Studies, Economics, History, Political Science, Geography):
   - You MUST generate questions strictly based on the official CBSE Class 11 NCERT curriculum.

Strict requirements:
1. Questions must test genuine conceptual depth, numerical problem solving, or analytical reasoning strictly from the specified CBSE chapter(s) for the designated class level.
2. For Numerical problems, ensure all formulas, calculations, and units are mathematically exact with verified arithmetic.
3. Every MCQ must have exactly 4 plausible, distinct options (do NOT prefix option strings with "A.", "B.", "(a)", etc. — provide only the pure option text). Do NOT include duplicates, "None of the above", or "All of the above".
4. CRITICAL ANSWER-KEY RULE: Do NOT place the correct answer at index 0 (Option A) for every question! Naturally vary the correct option position across 0 (A), 1 (B), 2 (C), and 3 (D).
5. For every MCQ, provide BOTH "correctIndex" (0, 1, 2, or 3) AND "correctAnswerText" (which MUST exactly match ` + '`options[correctIndex]`' + `).
6. Provide a thorough, step-by-step academic explanation for why the chosen option is correct.
7. Strictly output a valid JSON object matching the requested schema with no markdown wrappers or external commentary.`;

// Gemini AI Quiz Generation Endpoint for Teacher-Controlled Quiz System
app.post('/api/gemini/quiz', async (req, res) => {
  const {
    classLevel,
    stream = 'PCM',
    subject,
    chapter,
    chapters,
    questionCount = 10,
    difficulty = 'Medium',
    questionType = 'mixed',
    instructions = '',
    teacherName = 'Alka Mam',
    recentQuestions = [],
    studentName,
    // Assigned students metadata
    assignedStudentIds,
    assignedStudentNames,
    assignmentMode,
    // Advanced Question Paper Creator parameters
    isQuestionPaper = false,
    questionCountsByType,
    marksConfig,
    paperConfig,
  } = req.body || {};

  if (!subject || typeof subject !== 'string' || !subject.trim()) {
    return res.status(400).json({ error: 'Subject is required for quiz generation.' });
  }

  if (isQuestionPaper && questionCountsByType) {
    const totalRequested =
      (Number(questionCountsByType.mcq) || 0) +
      (Number(questionCountsByType.short_2) || 0) +
      (Number(questionCountsByType.short_3) || 0) +
      (Number(questionCountsByType.case_study) || 0) +
      (Number(questionCountsByType.long_5) || 0);
    if (totalRequested <= 0) {
      return res.status(400).json({
        error: 'Question paper must include at least 1 question across Sections A–E.',
        code: 'EMPTY_PAPER_CONFIG',
      });
    }
    const dur = Number(paperConfig?.durationMinutes);
    if (!Number.isFinite(dur) || dur <= 0) {
      return res.status(400).json({
        error: 'Question paper duration must be a positive number of minutes.',
        code: 'INVALID_DURATION',
      });
    }
  }

  const apiKey = process.env.GEMINI_API_KEY;
  // Explicit verification mode may use the local synthesizer, but production generation
  // must never silently substitute template questions for a failed Gemini request.
  if (req.body?.fastVerify) {
    const fallback = synthesizeCbseAssessment(req.body, 'local-verification-only');
    return res.status(fallback.status).json({ ...fallback.body, verificationOnly: true });
  }
  if (!apiKey || apiKey.trim() === '' || apiKey === 'MY_GEMINI_API_KEY') {
    return res.status(503).json({
      error: 'Gemini question generation is unavailable because GEMINI_API_KEY is not configured. No fallback paper was generated.',
      code: 'GEMINI_API_KEY_MISSING',
      retryable: false,
    });
  }

  try {
    const isEnglishPaper = Boolean(req.body?.isEnglishPaper);
    const generationSeed = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const recentExclusionList = Array.isArray(recentQuestions) ? recentQuestions.slice(-25) : [];

    const resolvedClassLevel = getSubjectClassLevel(subject);
    const effectiveClassLevel =
      classLevel && classLevel.toLowerCase().includes('12')
        ? 'Class 12TH'
        : resolvedClassLevel === 'Class 12'
        ? 'Class 12TH'
        : (classLevel || 'Class 11TH');

    const defaultFallbackChapter =
      resolvedClassLevel === 'Class 12'
        ? 'Entire Class 12 CBSE Syllabus'
        : 'Entire Class 11 CBSE Syllabus';

    const litCfg = req.body?.literatureConfig || {};
    const englishSelectedChapters = isEnglishPaper
      ? [
          ...(Array.isArray(litCfg.chosenProse) ? litCfg.chosenProse : []),
          ...(Array.isArray(litCfg.chosenPoetry) ? litCfg.chosenPoetry : []),
          ...(Array.isArray(litCfg.chosenSnapshots) ? litCfg.chosenSnapshots : []),
        ]
      : [];

    // Determine chapters list
    const selectedChapters: string[] =
      englishSelectedChapters.length > 0
        ? englishSelectedChapters
        : Array.isArray(chapters) && chapters.length > 0
        ? chapters
        : chapter
        ? [chapter]
        : [defaultFallbackChapter];

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
    });

    const isPaperMode = Boolean(
      isEnglishPaper ||
      (isQuestionPaper &&
        questionCountsByType &&
        (questionCountsByType.mcq > 0 ||
          questionCountsByType.short_2 > 0 ||
          questionCountsByType.short_3 > 0 ||
          questionCountsByType.case_study > 0 ||
          questionCountsByType.long_5 > 0))
    );

    let prompt: string;

    if (isEnglishPaper) {
      const rCfg = req.body?.readingConfig || {};
      const gCfg = req.body?.grammarConfig || {};
      const wCfg = req.body?.writingConfig || {};
      const lCfg = req.body?.literatureConfig || {};
      const examName = req.body?.examName || paperConfig?.examName || 'CBSE Class 11 English Core Examination';
      const durationMin = Number(req.body?.durationMinutes || paperConfig?.durationMinutes) || 180;
      const secAMarks = Number(rCfg.totalSectionAMarks) || 26;
      const secBMarks = (Number(gCfg.totalGrammarMarks) || 7) + (Number(wCfg.totalWritingMarks) || 16);
      const secCMarks = Number(lCfg.totalSectionCMarks) || 31;

      prompt = `You are generating a completely FRESH, ORIGINAL, NON-REPEATING CBSE Class 11 English Core (Subject Code 301) Question Paper for THE ABHINAV SCHOOL.
Generation Seed: ${generationSeed}
Examination Title: "${examName}"
Difficulty: ${difficulty}
Special Teacher Notes: ${req.body?.teacherNotes || instructions || 'Follow official CBSE Class 11 English Core (301) blueprint.'}
Selected Hornbill Prose Chapters: ${(lCfg.chosenProse || []).join(', ') || 'The Portrait of a Lady, We’re Not Afraid to Die...'}
Selected Hornbill Poetry: ${(lCfg.chosenPoetry || []).join(', ') || 'A Photograph, The Laburnum Top, The Voice of the Rain'}
Selected Snapshots Chapters: ${(lCfg.chosenSnapshots || []).join(', ') || 'The Summer of the Beautiful White Horse, The Address'}

CRITICAL ANTI-REPETITION RULE:
Do NOT repeat or paraphrase any of these recently generated passages or questions:
${JSON.stringify(recentExclusionList)}
Create brand-new, unseen reading comprehension themes, fresh grammar sentences, new creative writing scenarios, and distinct literature analytical angles.

REQUIRED 3-SECTION STRUCTURE (Every question object in "questions" MUST include a "section" string matching its section header):
1. "SECTION A: READING SKILLS (${secAMarks} Marks)":
   ${rCfg.includeUnseen !== false ? `- Q1: Unseen Discursive / Literary Passage ("questionType": "case_study", "marks": ${Number(rCfg.unseenMarks) || 10}). Provide a rich 350-450 word multi-paragraph passage in "casePassage" on a fresh intellectual/social/scientific theme, with subQuestions totaling ${Number(rCfg.unseenMarks) || 10} marks.` : ''}
   ${rCfg.includeCaseBased !== false ? `- Q2: Case-Based Factual Passage ("questionType": "case_study", "marks": ${Number(rCfg.caseBasedMarks) || 8}). Provide a factual passage with empirical data/survey findings in "casePassage" and subQuestions totaling ${Number(rCfg.caseBasedMarks) || 8} marks.` : ''}
   ${rCfg.includeNoteMaking !== false ? `- Q3: Note-Making & Summarization Passage ("questionType": "case_study", "marks": ${(Number(rCfg.noteMakingMarks) || 5) + (rCfg.includeSummary !== false ? (Number(rCfg.summaryMarks) || 3) : 0)}). Provide an academic passage in "casePassage" and subQuestions for Note-Making (${Number(rCfg.noteMakingMarks) || 5} marks) and Summary (${Number(rCfg.summaryMarks) || 3} marks).` : ''}
2. "SECTION B: GRAMMAR & CREATIVE WRITING SKILLS (${secBMarks} Marks)":
   - Grammar questions covering selected topics (${(gCfg.selectedTopics || ['tenses', 'clauses', 'reordering']).join(', ')}) totaling ${Number(gCfg.totalGrammarMarks) || 7} marks (use "questionType": "mcq" with 4 options or "short_2" for sentence reordering/transformation).
   - Creative Writing tasks covering selected tasks (${(wCfg.selectedTasks || ['classified_advertisement', 'poster_writing', 'speech_writing', 'debate_writing']).join(', ')}) totaling ${Number(wCfg.totalWritingMarks) || 16} marks. Include internal "OR" choices inside the question prompt when internalChoice is true.
3. "SECTION C: LITERATURE TEXTBOOKS (${secCMarks} Marks)":
   - Reference-to-Context (RTC) Extracts ("questionType": "case_study") with actual literary/poetic context in "casePassage" and subQuestions for Poetry (${Number(lCfg.poetryExtractMarks) || 3} marks), Hornbill Prose (${Number(lCfg.proseExtractMarks) || 3} marks), and Snapshots (${Number(lCfg.snapshotsExtractMarks) || 4} marks).
   - Short Answer Questions ("questionType": "short_3", 40-50 words) from Hornbill (${Number(lCfg.hornbillShortCount) || 2} questions, ${Number(lCfg.hornbillShortMarksPerQ) || 3} marks each) and Snapshots (${Number(lCfg.snapshotsShortCount) || 1} question, ${Number(lCfg.snapshotsShortMarksPerQ) || 3} marks each).
   - Long Answer Questions ("questionType": "long_5", 120-150 words, 6 marks each) from Hornbill (${Number(lCfg.hornbillLongAnswerMarks) || 6} marks) and Snapshots (${Number(lCfg.snapshotsLongAnswerMarks) || 6} marks) with internal "OR" alternative questions.

Return strictly a valid JSON object with NO markdown code fences matching the standard quiz schema ("title", "subject": "English Core", "questions": [...]).`;
    } else if (isPaperMode) {
      const mcqC = Math.max(0, Number(questionCountsByType.mcq) || 0);
      const s2C = Math.max(0, Number(questionCountsByType.short_2) || 0);
      const s3C = Math.max(0, Number(questionCountsByType.short_3) || 0);
      const csC = Math.max(0, Number(questionCountsByType.case_study) || 0);
      const l5C = Math.max(0, Number(questionCountsByType.long_5) || 0);

      const mcqMarks = Number(marksConfig?.mcq) || 1;
      const s2Marks = Number(marksConfig?.short_2) || 2;
      const s3Marks = Number(marksConfig?.short_3) || 3;
      const csMarks = Number(marksConfig?.case_study) || 4;
      const l5Marks = Number(marksConfig?.long_5) || 5;

      const defaultExamName =
        resolvedClassLevel === 'Class 12' ? 'CBSE Class 12 Examination' : 'CBSE Class 11 Examination';
      const examName = paperConfig?.examName || defaultExamName;
      const durationMin = paperConfig?.durationMinutes || 90;

      prompt = `You are generating a completely FRESH, NON-REPEATING official CBSE ${effectiveClassLevel} Question Paper for ${subject} (${stream} stream).
Generation Seed: ${generationSeed}
Examination Title: "${examName}"
Target Chapters: ${selectedChapters.join(', ')}
Difficulty: ${difficulty}
Special Teacher Guidelines: ${instructions || `Strict NCERT/CBSE ${effectiveClassLevel} guidelines, authentic high academic quality`}
Recently seen questions / passages to STRICTLY AVOID repeating: ${JSON.stringify(recentExclusionList)}

You MUST generate EXACTLY the following quantities of brand-new questions (vary numerical parameters, scenarios, derivations, and applications so no question repeats previous runs):
1. Multiple Choice Questions (MCQ): EXACTLY ${mcqC} questions. Each worth ${mcqMarks} mark(s). Must have 4 distinct options, a correctIndex (0, 1, 2, or 3 — vary naturally across A/B/C/D, do NOT always use 0), and correctAnswerText matching options[correctIndex].
2. Short Answer Type I (2 marks): EXACTLY ${s2C} questions. Each worth ${s2Marks} mark(s). Include clear question text and a concise model answer.
3. Short Answer Type II (3 marks): EXACTLY ${s3C} questions. Each worth ${s3Marks} mark(s). Include step-by-step model answer/key points.
4. Case-Study / Source-Based Questions: EXACTLY ${csC} questions. Each worth ${csMarks} mark(s) total. Must include a realistic academic passage ("casePassage") and 2 to 4 related subquestions in "subQuestions" array with subNumber (e.g. "(i)", "(ii)"), marks, and model answer.
5. Long Answer Questions (5 marks): EXACTLY ${l5C} questions. Each worth ${l5Marks} mark(s). In-depth conceptual derivation or comprehensive problem.

Return strictly a valid JSON object matching this schema with NO markdown code fences:
{
  "title": "${examName}",
  "chapter": "${selectedChapters.join(', ')}",
  "chapters": ${JSON.stringify(selectedChapters)},
  "subject": "${subject}",
  "stream": "${stream}",
  "classLevel": "${classLevel}",
  "difficulty": "${difficulty}",
  "questionType": "mixed",
  "timeLimitSeconds": ${durationMin * 60},
  "description": "${classLevel} ${subject} Question Paper covering ${selectedChapters.join(', ')}.",
  "createdBy": "${teacherName}",
  "paperConfig": {
    "examName": "${examName}",
    "examDate": "${paperConfig?.examDate || ''}",
    "durationMinutes": ${durationMin},
    "generalInstructions": [
      "All questions are compulsory.",
      "The question paper contains multiple sections reflecting CBSE assessment structure.",
      "Marks are indicated against each question."
    ]
  },
  "questions": [
    {
      "id": "q1",
      "questionType": "mcq",
      "question": "Question text here?",
      "options": ["First distinct choice", "Second distinct choice", "Third distinct choice", "Fourth distinct choice"],
      "correctIndex": 2,
      "correctAnswerText": "Third distinct choice",
      "marks": ${mcqMarks},
      "explanation": "Clear explanation proving why Third distinct choice is correct.",
      "chapter": "${selectedChapters[0]}"
    },
    {
      "id": "q2",
      "questionType": "short_2",
      "question": "2-mark question text here?",
      "marks": ${s2Marks},
      "modelAnswer": "Expected 2-mark answer key points.",
      "explanation": "Rationale / rubric.",
      "chapter": "${selectedChapters[0]}"
    },
    {
      "id": "q3",
      "questionType": "case_study",
      "question": "Read the following case and answer the questions that follow:",
      "casePassage": "Academic case passage or experimental observation here...",
      "marks": ${csMarks},
      "subQuestions": [
        {
          "id": "sq1",
          "subNumber": "(i)",
          "question": "Subquestion 1 text?",
          "questionType": "written",
          "marks": 2,
          "modelAnswer": "Model answer for subquestion 1."
        },
        {
          "id": "sq2",
          "subNumber": "(ii)",
          "question": "Subquestion 2 text?",
          "questionType": "written",
          "marks": 2,
          "modelAnswer": "Model answer for subquestion 2."
        }
      ],
      "chapter": "${selectedChapters[0]}"
    }
  ]
}`;
    } else {
      const clampedCount = Math.min(30, Math.max(1, Number(questionCount) || 10));

      prompt = `Generate a fresh, teacher-controlled CBSE ${effectiveClassLevel} examination quiz.
Subject: ${subject}
Stream: ${stream}
Target Chapters: ${selectedChapters.join(', ')}
Total Questions: ${clampedCount}
Target Difficulty: ${difficulty} (Ensure difficulty reflects real NCERT/CBSE ${effectiveClassLevel} standards)
Question Format / Type: ${questionType} (e.g. standard MCQs, numerical calculations with verified values, conceptual questions, or assertion-reason where appropriate)
Teacher Special Instructions: ${instructions || `NCERT/CBSE ${effectiveClassLevel} based, high academic accuracy`}
Recently seen questions / topics to strictly avoid repeating: ${JSON.stringify(recentQuestions.slice(-15))}

IMPORTANT MCQ RULES:
- Every question MUST have 4 distinct, realistic options (do NOT prefix with "A.", "B.", etc.).
- Distribute correct answers naturally across indices 0 (A), 1 (B), 2 (C), and 3 (D). Do NOT put the correct answer at index 0 for every question.
- Include "correctAnswerText" matching options[correctIndex] exactly.

Return strictly a valid JSON object matching this schema with NO markdown code fences:
{
  "title": "${subject} — ${selectedChapters.length === 1 ? selectedChapters[0] : 'Curriculum Mastery'}",
  "chapter": "${selectedChapters.join(', ')}",
  "chapters": ${JSON.stringify(selectedChapters)},
  "subject": "${subject}",
  "stream": "${stream}",
  "classLevel": "${classLevel}",
  "difficulty": "${difficulty}",
  "questionType": "${questionType}",
  "timeLimitSeconds": ${Math.max(25, clampedCount * 45)},
  "description": "${classLevel} ${stream} ${subject} examination quiz covering ${selectedChapters.join(', ')}.",
  "createdBy": "${teacherName}",
  "questions": [
    {
      "id": "q1",
      "question": "Clear, precise academic question text here?",
      "options": ["Plausible choice 1", "Plausible choice 2", "Plausible choice 3", "Plausible choice 4"],
      "correctIndex": 1,
      "correctAnswerText": "Plausible choice 2",
      "explanation": "Detailed step-by-step academic explanation confirming Plausible choice 2.",
      "chapter": "${selectedChapters[0]}",
      "questionType": "${questionType}",
      "points": 10,
      "marks": 1
    }
  ]
}`;
    }

    const { text, modelUsed } = await generateWithModelFallback(ai, prompt, ACADEMIC_SYSTEM_INSTRUCTION);

    const cleaned = text.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
    const parsed = JSON.parse(cleaned);

    if (!parsed.questions || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
      throw new Error('AI returned an empty or invalid question set.');
    }

    // Validate and sanitize every question
    const sanitizedQuestions = [];
    let calculatedTotalMarks = 0;

    for (let i = 0; i < parsed.questions.length; i++) {
      const q = parsed.questions[i];
      if (!q.question || typeof q.question !== 'string' || !q.question.trim()) {
        continue;
      }

      const qType = q.questionType || (isPaperMode ? 'short_2' : questionType);
      const qId = `q-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}`;
      const assignedChapter = q.chapter || selectedChapters[i % selectedChapters.length];

      // Handle CASE STUDY questions
      if (qType === 'case_study') {
        const rawSubs = Array.isArray(q.subQuestions) ? q.subQuestions : [];
        const sanitizedSubs = [];
        let caseMarks = 0;

        for (let sIdx = 0; sIdx < rawSubs.length; sIdx++) {
          const sq = rawSubs[sIdx];
          if (!sq.question) continue;
          const subMarks = Number(sq.marks) || 1;
          caseMarks += subMarks;
          sanitizedSubs.push({
            id: `sq-${qId}-${sIdx}`,
            subNumber: sq.subNumber || `(${sIdx + 1})`,
            question: String(sq.question).trim(),
            questionType: sq.options && Array.isArray(sq.options) && sq.options.length === 4 ? 'mcq' : 'written',
            options: Array.isArray(sq.options) ? sq.options.map((o: any) => String(o).trim()) : undefined,
            correctIndex: typeof sq.correctIndex === 'number' && sq.correctIndex >= 0 && sq.correctIndex < 4 ? sq.correctIndex : undefined,
            modelAnswer: sq.modelAnswer ? String(sq.modelAnswer).trim() : 'Key conceptual response.',
            marks: subMarks,
            explanation: sq.explanation ? String(sq.explanation).trim() : 'Evaluated as per CBSE marking scheme.'
          });
        }

        const totalQMarks = caseMarks > 0 ? caseMarks : (Number(q.marks) || 4);
        calculatedTotalMarks += totalQMarks;

        sanitizedQuestions.push({
          id: qId,
          question: q.question.trim(),
          casePassage: q.casePassage ? String(q.casePassage).trim() : 'Refer to the passage provided above.',
          subQuestions: sanitizedSubs.length > 0 ? sanitizedSubs : [
            {
              id: `sq-${qId}-0`,
              subNumber: '(i)',
              question: 'Analyze the core principle demonstrated in the case study.',
              questionType: 'written',
              marks: Math.ceil(totalQMarks / 2),
              modelAnswer: 'Clear conceptual justification based on NCERT guidelines.'
            },
            {
              id: `sq-${qId}-1`,
              subNumber: '(ii)',
              question: 'Evaluate the outcome or derive the conclusion.',
              questionType: 'written',
              marks: Math.floor(totalQMarks / 2),
              modelAnswer: 'Mathematical derivation or analytical summary.'
            }
          ],
          marks: totalQMarks,
          points: totalQMarks * 10,
          explanation: q.explanation ? String(q.explanation).trim() : 'Comprehensive case study evaluation.',
          chapter: assignedChapter,
          questionType: 'case_study',
          ...(q.section ? { section: String(q.section).trim() } : {}),
        });
        continue;
      }

      // Handle MCQ questions (or any 4-option question in speed quiz / paper Section A)
      if (qType === 'mcq' || (!isPaperMode && Array.isArray(q.options)) || (Array.isArray(q.options) && q.options.length === 4)) {
        // Validate & normalize MCQ using stable option IDs and unbiased shuffling; NEVER force Option A (0)
        const validated = validateAndNormalizeMCQ(
          {
            ...q,
            chapter: assignedChapter,
            questionType: qType === 'short_2' || qType === 'short_3' || qType === 'long_5' ? 'mcq' : qType,
          },
          qId,
          true // shuffle options and remap correctIndex via stable correctOptionId
        );

        if (!validated.valid || !validated.question) {
          console.warn(`[AI Quiz Server] Rejected invalid MCQ #${i + 1}: ${validated.reason}`);
          continue;
        }

        const qMarks = Number(validated.question.marks) || 1;
        calculatedTotalMarks += qMarks;
        sanitizedQuestions.push({
          ...validated.question,
          ...(q.section ? { section: String(q.section).trim() } : {}),
        });
        continue;
      }

      // Handle SHORT ANSWER (2 marks, 3 marks) or LONG ANSWER (5 marks)
      const qMarks = Number(q.marks) || (qType === 'short_2' ? 2 : qType === 'short_3' ? 3 : qType === 'long_5' ? 5 : 2);
      calculatedTotalMarks += qMarks;

      sanitizedQuestions.push({
        id: qId,
        question: q.question.trim(),
        marks: qMarks,
        points: qMarks * 10,
        modelAnswer: q.modelAnswer ? String(q.modelAnswer).trim() : (q.explanation || 'Detailed answer as per NCERT syllabus.'),
        rubric: q.rubric ? String(q.rubric).trim() : `${qMarks} marks based on step-wise accuracy.`,
        explanation: q.explanation ? String(q.explanation).trim() : 'Evaluated according to CBSE marking scheme.',
        chapter: assignedChapter,
        questionType: qType,
        ...(q.section ? { section: String(q.section).trim() } : {}),
      });
    }

    if (sanitizedQuestions.length === 0) {
      throw new Error('Could not validate generated questions (missing or inconsistent answer keys). Please retry.');
    }

    parsed.id = `quiz-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    parsed.questions = sanitizedQuestions;
    parsed.stream = stream;
    parsed.subject = subject;
    parsed.chapters = selectedChapters;
    parsed.chapter = selectedChapters.join(', ');
    parsed.difficulty = difficulty;
    parsed.questionType = isPaperMode ? 'mixed' : questionType;
    parsed.createdAt = Date.now();
    parsed.source = 'ai';
    parsed.classLevel = classLevel;
    parsed.createdBy = teacherName;
    parsed.modelUsed = modelUsed;
    if (isEnglishPaper) {
      parsed.isEnglishPaper = true;
      parsed.isQuestionPaper = true;
    }

    if (assignmentMode === 'skip' || (assignmentMode as any) === 'none') {
      parsed.assignmentMode = 'skip';
      parsed.assignedStudentIds = [];
      parsed.assignedStudentNames = [];
    } else if (Array.isArray(assignedStudentIds) && assignedStudentIds.length > 0) {
      parsed.assignedStudentIds = Array.from(new Set(assignedStudentIds));
      parsed.assignedStudentNames = Array.isArray(assignedStudentNames) ? assignedStudentNames : undefined;
      parsed.assignmentMode = assignmentMode || 'individual';
      parsed.assignedAt = Date.now();
    }

    if (isPaperMode) {
      parsed.paperConfig = {
        examName: req.body?.examName || paperConfig?.examName || (isEnglishPaper ? 'CBSE Class 11 English Core Examination' : 'CBSE Class 11 Examination'),
        examDate: req.body?.examDate || paperConfig?.examDate || '',
        durationMinutes: Number(req.body?.durationMinutes || paperConfig?.durationMinutes) || (isEnglishPaper ? 180 : 90),
        generalInstructions: paperConfig?.generalInstructions || [
          'All questions are compulsory.',
          'Read each question carefully before attempting.',
          'Marks are indicated against each question.'
        ],
        totalMarks: calculatedTotalMarks,
        isQuestionPaper: true
      };
      parsed.questionsCountByType = questionCountsByType;
      parsed.marksConfig = marksConfig;
    }

    return res.json({ success: true, quiz: parsed, modelUsed });
  } catch (err: any) {
    console.error('[AI Quiz Server] Gemini question generation failed; refusing to substitute template questions:', err?.message || err);
    return res.status(502).json({
      error: 'Gemini could not generate a valid question set. No fallback paper was created. Please retry or review the generation settings.',
      code: 'GEMINI_GENERATION_FAILED',
      retryable: true,
      model: 'gemini-2.5-flash',
    });
  }
});

// Single Question Regeneration Endpoint for Teacher Review Mode
app.post('/api/gemini/quiz/regenerate-question', async (req, res) => {
  const {
    classLevel = 'Class 11TH',
    stream = 'PCM',
    subject,
    chapter,
    difficulty = 'Medium',
    questionType = 'mcq',
    currentQuestionText = '',
    instructions = '',
    targetMarks = 1,
  } = req.body || {};

  if (!subject || typeof subject !== 'string' || !subject.trim()) {
    return res.status(400).json({ error: 'Subject is required.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (req.body?.fastVerify || !apiKey || apiKey.trim() === '' || apiKey === 'MY_GEMINI_API_KEY') {
    const fallback = synthesizeRegeneratedQuestion(req.body, 'gemini-3-flash-preview');
    return res.status(fallback.status).json(fallback.body);
  }

  try {

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
    });

    let prompt: string;

    if (questionType === 'case_study') {
      prompt = `Generate exactly ONE fresh, high-quality replacement CASE STUDY question for CBSE ${classLevel}.
Subject: ${subject}
Stream: ${stream}
Target Chapter: ${chapter || 'Core Chapter'}
Difficulty: ${difficulty}
Total Marks: ${targetMarks || 4}
Previous Question to REPLACE (do NOT repeat): "${currentQuestionText}"
Instructions: ${instructions || 'NCERT based, high academic rigor'}

Return strictly a valid JSON object matching this schema with NO markdown code fences:
{
  "question": "Read the following passage and answer the subquestions that follow:",
  "casePassage": "Rich academic case study scenario or experimental context here...",
  "marks": ${targetMarks || 4},
  "subQuestions": [
    {
      "subNumber": "(i)",
      "question": "First analytical question based on passage?",
      "questionType": "written",
      "marks": 2,
      "modelAnswer": "Model answer points."
    },
    {
      "subNumber": "(ii)",
      "question": "Second analytical question based on passage?",
      "questionType": "written",
      "marks": 2,
      "modelAnswer": "Model answer points."
    }
  ],
  "chapter": "${chapter || 'Core Chapter'}"
}`;
    } else if (questionType === 'short_2' || questionType === 'short_3' || questionType === 'long_5') {
      const marksVal = questionType === 'short_2' ? 2 : questionType === 'short_3' ? 3 : 5;
      prompt = `Generate exactly ONE fresh, high-quality replacement WRITTEN question for CBSE ${classLevel}.
Subject: ${subject}
Stream: ${stream}
Target Chapter: ${chapter || 'Core Chapter'}
Question Format: ${questionType} (${marksVal} marks)
Difficulty: ${difficulty}
Previous Question to REPLACE (do NOT repeat): "${currentQuestionText}"
Instructions: ${instructions || 'NCERT based, verified arithmetic and theoretical depth'}

Return strictly a valid JSON object matching this schema with NO markdown code fences:
{
  "question": "Fresh academic question text?",
  "marks": ${marksVal},
  "modelAnswer": "Comprehensive model answer points as per CBSE marking scheme.",
  "explanation": "Key scoring breakdown and rubric.",
  "chapter": "${chapter || 'Core Chapter'}"
}`;
    } else {
      prompt = `Generate exactly ONE fresh, high-quality replacement MCQ question for CBSE ${classLevel}.
Subject: ${subject}
Stream: ${stream}
Target Chapter: ${chapter || 'Core Chapter'}
Difficulty: ${difficulty}
Question Type: ${questionType}
Previous Question to REPLACE (do NOT repeat this question or its specific numbers): "${currentQuestionText}"
Instructions: ${instructions || 'NCERT based, verified arithmetic'}

IMPORTANT:
- Provide 4 distinct options without "A.", "B." prefixes.
- Provide BOTH "correctIndex" (0, 1, 2, or 3) AND "correctAnswerText" matching options[correctIndex].

Return strictly a valid JSON object matching this schema with NO markdown code fences:
{
  "question": "Fresh replacement question text?",
  "options": ["Choice 1", "Choice 2", "Choice 3", "Choice 4"],
  "correctIndex": 2,
  "correctAnswerText": "Choice 3",
  "marks": ${targetMarks || 1},
  "explanation": "Clear academic step-by-step explanation.",
  "chapter": "${chapter || 'Core Chapter'}"
}`;
    }

    const { text, modelUsed } = await generateWithModelFallback(ai, prompt, ACADEMIC_SYSTEM_INSTRUCTION);
    const cleaned = text.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
    const parsed = JSON.parse(cleaned);

    if (!parsed.question) {
      throw new Error('Invalid replacement question structure received.');
    }

    const qId = `q-regen-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    let newQuestion: any;

    if (questionType === 'case_study') {
      newQuestion = {
        id: qId,
        question: String(parsed.question).trim(),
        casePassage: parsed.casePassage ? String(parsed.casePassage).trim() : 'Refer to the passage provided.',
        subQuestions: Array.isArray(parsed.subQuestions) ? parsed.subQuestions.map((sq: any, sIdx: number) => ({
          id: `sq-${qId}-${sIdx}`,
          subNumber: sq.subNumber || `(${sIdx + 1})`,
          question: String(sq.question).trim(),
          questionType: sq.questionType || 'written',
          marks: Number(sq.marks) || 2,
          modelAnswer: sq.modelAnswer ? String(sq.modelAnswer).trim() : 'Key model response.'
        })) : [],
        marks: Number(parsed.marks) || (targetMarks || 4),
        points: (Number(parsed.marks) || (targetMarks || 4)) * 10,
        explanation: parsed.explanation || 'Verified CBSE case study rationale.',
        chapter: parsed.chapter || chapter,
        questionType: 'case_study',
      };
    } else if (questionType === 'short_2' || questionType === 'short_3' || questionType === 'long_5') {
      const qMarks = Number(parsed.marks) || (questionType === 'short_2' ? 2 : questionType === 'short_3' ? 3 : 5);
      newQuestion = {
        id: qId,
        question: String(parsed.question).trim(),
        marks: qMarks,
        points: qMarks * 10,
        modelAnswer: parsed.modelAnswer ? String(parsed.modelAnswer).trim() : (parsed.explanation || 'Model answer.'),
        rubric: `${qMarks} marks based on step-wise precision.`,
        explanation: parsed.explanation ? String(parsed.explanation).trim() : 'Evaluated according to CBSE marking scheme.',
        chapter: parsed.chapter || chapter,
        questionType,
      };
    } else {
      const validated = validateAndNormalizeMCQ(
        {
          ...parsed,
          marks: Number(parsed.marks) || targetMarks || 1,
          chapter: parsed.chapter || chapter,
          questionType: 'mcq',
        },
        qId,
        true
      );
      if (!validated.valid || !validated.question) {
        throw new Error(validated.reason || 'Regenerated MCQ failed answer-key validation.');
      }
      newQuestion = validated.question;
    }

    return res.json({ success: true, question: newQuestion, modelUsed });
  } catch (err: any) {
    console.warn('[AI Quiz Server] Regenerate question fallback triggered:', err?.message || err);
    const fallback = synthesizeRegeneratedQuestion(req.body, 'gemini-3-flash-preview');
    return res.status(fallback.status).json(fallback.body);
  }
});

// Helper for semver normalization and numeric comparison
function normalizeServerVersion(v: unknown): string {
  if (typeof v !== 'string') return '';
  return v.trim().replace(/^[vV]/, '').trim();
}

function isValidServerSemver(v: unknown): boolean {
  const clean = normalizeServerVersion(v);
  if (!clean) return false;
  return /^\d+\.\d+(\.\d+)?(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/.test(clean);
}

function compareVersions(v1: string, v2: string): number {
  const clean1 = normalizeServerVersion(v1 || '0.0.0').split(/[-+]/)[0];
  const clean2 = normalizeServerVersion(v2 || '0.0.0').split(/[-+]/)[0];
  const parts1 = clean1.split('.').map((n) => {
    const parsed = parseInt(n, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  });
  const parts2 = clean2.split('.').map((n) => {
    const parsed = parseInt(n, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  });
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
}

// 0. Server-assisted PDF Download Bridge for Installed Android APK & Mobile WebViews
interface PreparedPdfEntry {
  buffer: Buffer;
  filename: string;
  createdAt: number;
}

const pdfDownloadStore = new Map<string, PreparedPdfEntry>();
const PDF_STORE_TTL_MS = 30 * 60 * 1000; // 30 minutes

function cleanupExpiredPdfs() {
  const now = Date.now();
  for (const [token, entry] of pdfDownloadStore.entries()) {
    if (now - entry.createdAt > PDF_STORE_TTL_MS) {
      pdfDownloadStore.delete(token);
    }
  }
}

function sanitizePdfFilename(rawName: unknown): string {
  const fallback = 'NEXORA_Class11_Question_Paper.pdf';
  if (typeof rawName !== 'string' || !rawName.trim()) return fallback;
  const cleaned = rawName
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_');
  if (!cleaned) return fallback;
  return cleaned.toLowerCase().endsWith('.pdf') ? cleaned : `${cleaned}.pdf`;
}

app.post('/api/pdf/prepare', (req, res) => {
  try {
    cleanupExpiredPdfs();
    const { base64, filename } = req.body || {};
    if (!base64 || typeof base64 !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Missing PDF base64 payload.',
      });
    }

    const stripped = base64.replace(/^data:application\/pdf;base64,/i, '').trim();
    const buffer = Buffer.from(stripped, 'base64');

    // Verify valid PDF binary signature (%PDF-) and non-empty size
    if (buffer.length < 100 || buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
      return res.status(400).json({
        success: false,
        error: 'Generated file is not a valid PDF document.',
      });
    }

    const safeFilename = sanitizePdfFilename(filename);
    const token = `pdf_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    pdfDownloadStore.set(token, {
      buffer,
      filename: safeFilename,
      createdAt: Date.now(),
    });

    const encodedFile = encodeURIComponent(safeFilename);
    return res.json({
      success: true,
      token,
      filename: safeFilename,
      byteLength: buffer.length,
      // /downloads/nexora-paper/... matches the Android APK MainActivity native external downloader rule (/downloads/nexora-)
      downloadPath: `/downloads/nexora-paper/${token}/${encodedFile}`,
      apiDownloadPath: `/api/pdf/download/${token}/${encodedFile}`,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err?.message || 'Failed to prepare PDF download on server.',
    });
  }
});

app.get(['/downloads/nexora-paper/:token/:filename', '/api/pdf/download/:token/:filename'], (req, res) => {
  cleanupExpiredPdfs();
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

  const token = String(req.params.token || '').trim();
  const requestedFilename = String(req.params.filename || '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_');

  const entry = pdfDownloadStore.get(token);
  if (!entry) {
    // Support stateless Android APK external downloader via compact ?spec= query parameter
    const specParam = typeof req.query.spec === 'string' ? req.query.spec.trim() : '';
    if (specParam === 'timetable' || specParam === 'timetable_old') {
      try {
        const built = buildTimetablePdfDocument(specParam === 'timetable_old' ? 'old' : 'current');
        const buf = Buffer.from(built.uint8);
        const dlName = requestedFilename.endsWith('.pdf') ? requestedFilename : built.filename;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${dlName}"`);
        res.setHeader('Content-Length', String(buf.length));
        return res.status(200).send(buf);
      } catch (err: any) {
        console.error('[PDF Spec Reconstruct] Timetable failed:', err);
      }
    } else if (specParam) {
      try {
        const decoded = decodeCompactQuizSpec(specParam);
        if (decoded && decoded.quiz) {
          const built = buildQuestionPaperPdfDocument(decoded.quiz, {
            includeAnswerKey: decoded.includeAnswerKey,
          });
          const buf = Buffer.from(built.uint8);
          const dlName = requestedFilename.endsWith('.pdf') ? requestedFilename : built.filename;
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `attachment; filename="${dlName}"`);
          res.setHeader('Content-Length', String(buf.length));
          return res.status(200).send(buf);
        }
      } catch (err: any) {
        console.error('[PDF Spec Reconstruct] Question paper failed:', err);
      }
    }

    return res.status(404).json({
      success: false,
      error: 'Prepared PDF link has expired or does not exist. Please click Download PDF again.',
    });
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${entry.filename}"`);
  res.setHeader('Content-Length', String(entry.buffer.length));
  return res.status(200).send(entry.buffer);
});

// 1. Static APK & release manifest handler with proper MIME, CORS, and Cache-Control
app.use('/downloads', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  const requestedFile = req.path.replace(/^\//, '');
  const safePath = path.resolve(__dirname, 'public/downloads', requestedFile);
  if (!safePath.startsWith(path.resolve(__dirname, 'public/downloads'))) {
    return res.status(403).send('Forbidden');
  }

  if (fs.existsSync(safePath) && fs.statSync(safePath).isFile()) {
    if (requestedFile.endsWith('.apk')) {
      res.setHeader('Content-Type', 'application/vnd.android.package-archive');
      res.setHeader('Content-Disposition', `attachment; filename="${path.basename(safePath)}"`);
    } else if (requestedFile.endsWith('.json')) {
      res.setHeader('Content-Type', 'application/json');
    }
    return res.sendFile(safePath);
  }

  if (/^nexora-v[\d.]+\.apk$/i.test(requestedFile)) {
    const fallbackApk = path.resolve(__dirname, 'public/downloads/nexora-release.apk');
    if (fs.existsSync(fallbackApk) && fs.statSync(fallbackApk).isFile()) {
      res.setHeader('Content-Type', 'application/vnd.android.package-archive');
      res.setHeader('Content-Disposition', `attachment; filename="${path.basename(requestedFile)}"`);
      return res.sendFile(fallbackApk);
    }
  }
  next();
});

// 2. Check for Updates Endpoint
app.get('/api/updates/check', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  try {
    const releaseFilePath = path.resolve(__dirname, 'public/downloads/release-info.json');
    if (!fs.existsSync(releaseFilePath)) {
      return res.status(404).json({
        updateAvailable: false,
        error: 'No published release metadata found on server.'
      });
    }

    const releaseData = JSON.parse(fs.readFileSync(releaseFilePath, 'utf8'));
    if (!releaseData || typeof releaseData !== 'object' || !isValidServerSemver(releaseData.version)) {
      return res.status(500).json({
        updateAvailable: false,
        error: 'Server release metadata is malformed or missing a valid version.'
      });
    }

    const rawClientVersion = String(req.query.currentVersion || req.query.version || '1.0.0').trim();
    const clientVersion = isValidServerSemver(rawClientVersion)
      ? normalizeServerVersion(rawClientVersion)
      : '1.0.0';
    const latestVersion = normalizeServerVersion(releaseData.version);
    const clientVersionCode = parseInt(String(req.query.versionCode || '0'), 10) || 0;
    const latestVersionCode = Number(releaseData.versionCode) || 1;

    // Compare both semantic version and integer versionCode (only use versionCode tie-breaker when semver is equal)
    const semverCmp = compareVersions(latestVersion, clientVersion);
    const isSemverNewer = semverCmp > 0;
    const isCodeNewer = semverCmp === 0 && clientVersionCode > 0 && latestVersionCode > clientVersionCode;
    const isNewer = isSemverNewer || isCodeNewer;

    const apkPath = path.resolve(__dirname, 'public/downloads/nexora-release.apk');
    const apkExists = fs.existsSync(apkPath) && fs.statSync(apkPath).size > 50000;

    return res.json({
      updateAvailable: isNewer,
      clientVersion,
      clientVersionCode,
      latestVersion,
      version: latestVersion,
      versionCode: latestVersionCode,
      releaseDate: releaseData.releaseDate,
      releaseNotes: releaseData.releaseNotes,
      apkUrl: releaseData.apkUrl || '/downloads/nexora-release.apk',
      versionedApkUrl: releaseData.versionedApkUrl || releaseData.apkUrl || '/downloads/nexora-release.apk',
      apkSize: releaseData.apkSize,
      sha256: releaseData.sha256,
      minSupportedVersion: releaseData.minSupportedVersion || '1.0.0',
      platform: releaseData.platform || 'android',
      apkReady: apkExists,
      packageName: releaseData.packageName || 'com.theabhinavschool.nexora',
      appName: releaseData.appName || 'NEXORA',
      checkedAt: new Date().toISOString()
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to read update manifest', details: err?.message });
  }
});

// 3. Quiz Attempts Offline Synchronization Endpoints (Idempotent + Validated)
const ATTEMPTS_STORE_PATH = path.resolve(__dirname, 'data/server-quiz-attempts.json');

function readServerAttempts(): any[] {
  try {
    if (fs.existsSync(ATTEMPTS_STORE_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(ATTEMPTS_STORE_PATH, 'utf8'));
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

function writeServerAttempts(attempts: any[]) {
  try {
    if (!Array.isArray(attempts)) return;
    // Never overwrite existing non-empty server attempts with an empty array
    const current = readServerAttempts();
    if (attempts.length === 0 && current.length > 0) return;

    const dir = path.dirname(ATTEMPTS_STORE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(ATTEMPTS_STORE_PATH, JSON.stringify(attempts, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to write server attempts:', e);
  }
}

app.post('/api/quizzes/attempts/sync', (req, res) => {
  try {
    const { attempts } = req.body;
    if (!Array.isArray(attempts)) {
      return res.status(400).json({ error: 'Expected attempts array' });
    }

    const existing = readServerAttempts();
    const existingMap = new Map<string, any>(existing.map((a: any) => [a.id, a]));
    const syncedIds: string[] = [];
    const now = Date.now();

    for (const att of attempts) {
      if (
        att &&
        typeof att === 'object' &&
        typeof att.id === 'string' &&
        att.id.trim() &&
        typeof att.quizId === 'string' &&
        att.quizId.trim() &&
        (att.studentId || att.studentName) &&
        att.completedStatus !== 'incomplete' &&
        Number(att.totalQuestions) > 0
      ) {
        const cleanId = att.id.trim();
        const totalQ = Math.max(1, Number(att.totalQuestions) || 1);
        const correctC = Math.min(totalQ, Math.max(0, Number(att.correctAnswers) || 0));
        const verifiedScore = Number(att.score) >= 0 ? Number(att.score) : correctC * 10;
        const verifiedAccuracy = Math.min(100, Math.max(0, Math.round((correctC / totalQ) * 100)));
        const completedAt = Number(att.completedAt || att.timestamp) || now;

        const sanitizedRecord = {
          ...att,
          id: cleanId,
          totalQuestions: totalQ,
          correctAnswers: correctC,
          score: verifiedScore,
          accuracy: verifiedAccuracy,
          timestamp: completedAt,
          completedAt,
          completedStatus: 'completed',
          synced: true,
          syncedAt: att.syncedAt || now,
          syncStatus: 'synced',
          serverReceivedAt: existingMap.get(cleanId)?.serverReceivedAt || now,
        };

        if (!existingMap.has(cleanId)) {
          existingMap.set(cleanId, sanitizedRecord);
        } else {
          // Idempotent merge: preserve earliest serverReceivedAt, never downgrade score
          const prev = existingMap.get(cleanId);
          if ((sanitizedRecord.score || 0) >= (prev.score || 0)) {
            existingMap.set(cleanId, {
              ...prev,
              ...sanitizedRecord,
              serverReceivedAt: prev.serverReceivedAt || now,
            });
          }
        }
        syncedIds.push(cleanId);
      }
    }

    const mergedAll = Array.from(existingMap.values()).sort(
      (a, b) => (b.completedAt || b.timestamp || 0) - (a.completedAt || a.timestamp || 0)
    );
    if (mergedAll.length > 0) {
      writeServerAttempts(mergedAll);
    }

    return res.json({
      success: true,
      syncedIds,
      attempts: mergedAll,
      totalCount: mergedAll.length,
      syncedAt: now,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Sync failed', details: err?.message });
  }
});

app.get('/api/quizzes/attempts', (_req, res) => {
  const attempts = readServerAttempts();
  return res.json({
    success: true,
    attempts,
    totalCount: attempts.length,
    checkedAt: Date.now(),
  });
});

// 4. Update Manifest Direct Access
app.get('/api/updates/manifest', (_req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  const releaseFilePath = path.resolve(__dirname, 'public/downloads/release-info.json');
  if (fs.existsSync(releaseFilePath)) {
    return res.sendFile(releaseFilePath);
  }
  return res.status(404).json({ error: 'Release manifest not found' });
});

// 5. Protected Staff Authentication, Diary, Attachments & Quick Notes Routes
registerStaffBackendRoutes(app, __dirname);

// 6. Explicit JSON 404 catch-all for any unmatched /api/* route so it never falls through to HTML SPA index.html
app.use('/api', (req, res) => {
  res.status(404).json({
    error: `API endpoint not found: ${req.method} ${req.originalUrl}`,
    code: 'NOT_FOUND',
  });
});

// Mount Vite in dev mode or serve static files in production
async function startServer() {
  const distPath = path.resolve(__dirname, 'dist');
  const distIndexHtml = path.resolve(distPath, 'index.html');
  const isProduction =
    process.env.NODE_ENV === 'production' ||
    process.env.npm_lifecycle_event === 'start' ||
    (process.env.npm_lifecycle_event !== 'dev' && fs.existsSync(distIndexHtml));

  // Ensure HTML shell and Service Worker scripts are never cached by browsers, WebViews, or CDNs
  app.use((req, res, next) => {
    const p = req.path;
    if (
      p === '/' ||
      p === '/index.html' ||
      p === '/sw.js' ||
      p === '/registerSW.js' ||
      p === '/manifest.webmanifest' ||
      p.startsWith('/dev-sw.js') ||
      p.startsWith('/workbox-')
    ) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
    next();
  });

  if (!isProduction) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: {
        middlewareMode: true,
        host: '0.0.0.0',
        port: Number(PORT),
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.sendFile(distIndexHtml);
    });
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`[CLASS OS] Server running on port ${PORT} (${isProduction ? 'production' : 'development'})`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
