import type { MCQOptionItem, QuizQuestion } from '../types/index.ts';

const OPTION_LABELS: ('A' | 'B' | 'C' | 'D')[] = ['A', 'B', 'C', 'D'];

/**
 * Strips leading option labels like "A) ", "A. ", "(A) ", "Option A: " from option text
 * so that shuffling options never leaves stale letters baked into the option text.
 */
export function cleanOptionText(raw: string): string {
  if (typeof raw !== 'string') return '';
  return raw
    .trim()
    .replace(/^(?:option\s+[A-Da-d]\s*[:\.\)\-]\s*|\([A-Da-d]\)\s*|[A-Da-d]\s*[\.\)\:]\s+)/i, '')
    .trim();
}

export function normalizeCompareText(raw: string): string {
  return cleanOptionText(raw).toLowerCase().replace(/\s+/g, ' ');
}

export interface ValidatedMCQResult {
  valid: boolean;
  error?: string;
  reason?: string;
  question?: QuizQuestion;
  options?: [string, string, string, string];
  optionItems?: MCQOptionItem[];
  correctIndex?: number;
  correctOptionId?: string;
  correctAnswerText?: string;
}

/**
 * Validates raw MCQ data from AI or user input, assigns stable option IDs,
 * optionally shuffles the options using Fisher-Yates while remapping the answer key
 * via stable option IDs, and guarantees that option A (0) is NEVER forced as a fallback.
 */
export function validateAndNormalizeMCQ(
  rawQuestion: any,
  questionId: string | number = 'q',
  optionsConfig: boolean | { shuffle?: boolean; preferredAvoidIndex?: number } = { shuffle: true }
): ValidatedMCQResult {
  const qIdStr = String(questionId);
  const shouldShuffle =
    typeof optionsConfig === 'boolean' ? optionsConfig : optionsConfig?.shuffle !== false;
  const preferredAvoidIndex =
    typeof optionsConfig === 'object' && optionsConfig !== null
      ? optionsConfig.preferredAvoidIndex
      : undefined;

  const fail = (msg: string): ValidatedMCQResult => ({
    valid: false,
    error: msg,
    reason: msg,
  });

  if (!rawQuestion || typeof rawQuestion !== 'object') {
    return fail('Question object is missing or invalid.');
  }

  const rawOptions = rawQuestion.options;
  if (!Array.isArray(rawOptions) || rawOptions.length !== 4) {
    return fail(
      `MCQ must have exactly 4 options (received ${Array.isArray(rawOptions) ? rawOptions.length : 0}).`
    );
  }

  const cleanedOptions = rawOptions.map((o: any) => cleanOptionText(String(o ?? '')));
  if (cleanedOptions.some((o) => !o || o.length === 0)) {
    return fail('One or more MCQ options are empty.');
  }

  // Reject placeholder options like "Option A", "Option B", etc.
  if (cleanedOptions.every((o, i) => o.toLowerCase() === `option ${OPTION_LABELS[i].toLowerCase()}`)) {
    return fail('MCQ contains unpopulated placeholder options.');
  }

  // Check that all 4 options are mutually distinct
  const normalizedSet = new Set(cleanedOptions.map((o) => normalizeCompareText(o)));
  if (normalizedSet.size !== 4) {
    return fail('MCQ options must be 4 distinct choices without duplicates.');
  }

  // Build initial option items with stable IDs
  const initialItems: MCQOptionItem[] = cleanedOptions.map((text, idx) => ({
    id:
      Array.isArray(rawQuestion.optionItems) &&
      rawQuestion.optionItems[idx] &&
      typeof rawQuestion.optionItems[idx].id === 'string'
        ? rawQuestion.optionItems[idx].id
        : `opt-${qIdStr}-${idx}`,
    label: OPTION_LABELS[idx],
    text,
  }));

  // Resolve the true correct option index in initialItems WITHOUT ever defaulting to 0
  let resolvedInitialIndex = -1;

  const rawCorrectText =
    typeof rawQuestion.correctAnswerText === 'string'
      ? rawQuestion.correctAnswerText.trim()
      : typeof rawQuestion.correctAnswer === 'string'
      ? rawQuestion.correctAnswer.trim()
      : typeof rawQuestion.answer === 'string'
      ? rawQuestion.answer.trim()
      : '';

  const rawCorrectOptionId =
    typeof rawQuestion.correctOptionId === 'string' ? rawQuestion.correctOptionId.trim() : '';

  const rawCorrectIndex =
    typeof rawQuestion.correctIndex === 'number' && Number.isInteger(rawQuestion.correctIndex)
      ? rawQuestion.correctIndex
      : typeof rawQuestion.correctIndex === 'string' && /^[0-3]$/.test(rawQuestion.correctIndex.trim())
      ? parseInt(rawQuestion.correctIndex.trim(), 10)
      : -1;

  const rawCorrectLetter =
    typeof rawQuestion.correctOption === 'string'
      ? rawQuestion.correctOption.trim().toUpperCase()
      : '';

  // 1. Check by stable correctOptionId first if present
  if (rawCorrectOptionId) {
    const idMatchIdx = initialItems.findIndex((item) => item.id === rawCorrectOptionId);
    if (idMatchIdx !== -1) {
      resolvedInitialIndex = idMatchIdx;
    }
  }

  // 2. Check by explicit correctAnswerText match against the 4 options
  let textMatchIdx = -1;
  if (rawCorrectText) {
    const normTarget = normalizeCompareText(rawCorrectText);
    textMatchIdx = initialItems.findIndex((item) => normalizeCompareText(item.text) === normTarget);
    // Also check if rawCorrectText is just a single letter "A", "B", "C", "D"
    if (textMatchIdx === -1 && /^[A-D]$/i.test(rawCorrectText)) {
      textMatchIdx = OPTION_LABELS.indexOf(rawCorrectText.toUpperCase() as any);
    }
  }

  // 3. Reconcile textMatchIdx and rawCorrectIndex
  if (resolvedInitialIndex === -1) {
    if (textMatchIdx !== -1 && rawCorrectIndex >= 0 && rawCorrectIndex < 4) {
      resolvedInitialIndex = textMatchIdx;
    } else if (textMatchIdx !== -1) {
      resolvedInitialIndex = textMatchIdx;
    } else if (rawCorrectIndex >= 0 && rawCorrectIndex < 4) {
      if (rawCorrectText && !/^[A-D]$/i.test(rawCorrectText)) {
        const normTarget = normalizeCompareText(rawCorrectText);
        const partialMatches = initialItems
          .map((item, idx) => ({ idx, norm: normalizeCompareText(item.text) }))
          .filter((m) => m.norm.includes(normTarget) || normTarget.includes(m.norm));
        if (partialMatches.length === 1) {
          resolvedInitialIndex = partialMatches[0].idx;
        } else {
          resolvedInitialIndex = rawCorrectIndex;
        }
      } else {
        resolvedInitialIndex = rawCorrectIndex;
      }
    } else if (/^[A-D]$/.test(rawCorrectLetter)) {
      resolvedInitialIndex = OPTION_LABELS.indexOf(rawCorrectLetter as any);
    }
  }

  if (resolvedInitialIndex < 0 || resolvedInitialIndex >= 4) {
    return fail('MCQ is missing a valid, unambiguous correct answer key.');
  }

  const targetCorrectOptionId = initialItems[resolvedInitialIndex].id;

  // Shuffle option items if requested (e.g. during generation) using Fisher-Yates
  let finalItems = [...initialItems];
  if (shouldShuffle) {
    for (let i = finalItems.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = finalItems[i];
      finalItems[i] = finalItems[j];
      finalItems[j] = temp;
    }

    if (
      typeof preferredAvoidIndex === 'number' &&
      preferredAvoidIndex >= 0 &&
      preferredAvoidIndex < 4
    ) {
      const currentCorrectPos = finalItems.findIndex((item) => item.id === targetCorrectOptionId);
      if (currentCorrectPos === preferredAvoidIndex) {
        const otherPositions = [0, 1, 2, 3].filter((p) => p !== currentCorrectPos);
        const swapPos = otherPositions[Math.floor(Math.random() * otherPositions.length)];
        const temp = finalItems[currentCorrectPos];
        finalItems[currentCorrectPos] = finalItems[swapPos];
        finalItems[swapPos] = temp;
      }
    }
  }

  // Re-assign visible A, B, C, D labels after ordering and locate the new correctIndex via stable ID
  const labeledItems: MCQOptionItem[] = finalItems.map((item, idx) => ({
    id: item.id,
    label: OPTION_LABELS[idx],
    text: item.text,
  }));

  const finalCorrectIndex = labeledItems.findIndex((item) => item.id === targetCorrectOptionId);
  if (finalCorrectIndex < 0 || finalCorrectIndex >= 4) {
    return fail('Failed to map stable correctOptionId after option ordering.');
  }

  const finalCorrectOption = labeledItems[finalCorrectIndex];
  const finalOptionsTuple: [string, string, string, string] = [
    labeledItems[0].text,
    labeledItems[1].text,
    labeledItems[2].text,
    labeledItems[3].text,
  ];
  const qMarks = Number(rawQuestion.marks) || 1;

  const normalizedQuestion: QuizQuestion = {
    id: rawQuestion.id ? String(rawQuestion.id) : qIdStr,
    question: String(rawQuestion.question || '').trim(),
    options: finalOptionsTuple,
    optionItems: labeledItems,
    correctIndex: finalCorrectIndex,
    correctOptionId: finalCorrectOption.id,
    correctAnswerText: finalCorrectOption.text,
    explanation: rawQuestion.explanation
      ? String(rawQuestion.explanation).trim()
      : 'Evaluated according to NCERT textbook principles.',
    marks: qMarks,
    points: Number(rawQuestion.points) || qMarks * 10,
    chapter: rawQuestion.chapter ? String(rawQuestion.chapter) : undefined,
    questionType: rawQuestion.questionType || 'mcq',
    isPYQ: Boolean(rawQuestion.isPYQ),
    pyqYear: rawQuestion.pyqYear ? String(rawQuestion.pyqYear) : undefined,
  };

  return {
    valid: true,
    question: normalizedQuestion,
    options: finalOptionsTuple,
    optionItems: labeledItems,
    correctIndex: finalCorrectIndex,
    correctOptionId: finalCorrectOption.id,
    correctAnswerText: finalCorrectOption.text,
  };
}

/**
 * Shuffles the 4 options of an existing validated QuizQuestion while preserving its
 * stable correctOptionId and updating correctIndex and correctAnswerText to match.
 */
export function shuffleQuestionOptionsWithStableId(question: QuizQuestion): QuizQuestion {
  if (!question.options || question.options.length !== 4) {
    return question;
  }
  const ensured = ensureQuestionStableOptionIds(question);
  const res = validateAndNormalizeMCQ(ensured, ensured.id || 'q', { shuffle: true });
  if (!res.valid || !res.options || !res.optionItems || typeof res.correctIndex !== 'number') {
    return ensured;
  }
  return {
    ...ensured,
    options: res.options,
    optionItems: res.optionItems,
    correctIndex: res.correctIndex,
    correctOptionId: res.correctOptionId,
    correctAnswerText: res.correctAnswerText,
  };
}

/**
 * Ensures any QuizQuestion with 4 options has synchronized optionItems, correctOptionId,
 * correctAnswerText, and correctIndex.
 */
export function ensureQuestionStableOptionIds(question: QuizQuestion): QuizQuestion {
  if (!question.options || question.options.length !== 4) {
    return question;
  }

  const qId = question.id || 'q';
  const existingItems = question.optionItems;
  const optionItems: MCQOptionItem[] = question.options.map((optText, idx) => ({
    id:
      existingItems && existingItems[idx] && existingItems[idx].id
        ? existingItems[idx].id
        : `opt-${qId}-${idx}`,
    label: OPTION_LABELS[idx],
    text: String(optText),
  }));

  let correctIdx =
    typeof question.correctIndex === 'number' &&
    question.correctIndex >= 0 &&
    question.correctIndex < 4
      ? question.correctIndex
      : -1;

  if (question.correctOptionId) {
    const idIdx = optionItems.findIndex((item) => item.id === question.correctOptionId);
    if (idIdx !== -1) {
      correctIdx = idIdx;
    }
  } else if (correctIdx === -1 && question.correctAnswerText) {
    const norm = normalizeCompareText(question.correctAnswerText);
    const txtIdx = optionItems.findIndex((item) => normalizeCompareText(item.text) === norm);
    if (txtIdx !== -1) {
      correctIdx = txtIdx;
    }
  }

  if (correctIdx < 0 || correctIdx >= 4) {
    return question;
  }

  return {
    ...question,
    options: [
      optionItems[0].text,
      optionItems[1].text,
      optionItems[2].text,
      optionItems[3].text,
    ],
    optionItems,
    correctIndex: correctIdx,
    correctOptionId: optionItems[correctIdx].id,
    correctAnswerText: optionItems[correctIdx].text,
  };
}

/**
 * Evaluates whether a student's selected option (by index or optionId) is correct
 * using the question's validated answer key.
 */
export function isMCQAnswerCorrect(
  question: QuizQuestion,
  selectedOptionIndex: number | null | undefined,
  selectedOptionId?: string | null
): boolean {
  if (selectedOptionId && question.correctOptionId) {
    return selectedOptionId === question.correctOptionId;
  }
  if (
    typeof selectedOptionIndex === 'number' &&
    selectedOptionIndex >= 0 &&
    selectedOptionIndex < 4
  ) {
    if (question.optionItems && question.correctOptionId) {
      const chosenItem = question.optionItems[selectedOptionIndex];
      if (chosenItem) {
        return chosenItem.id === question.correctOptionId;
      }
    }
    return selectedOptionIndex === question.correctIndex;
  }
  return false;
}
