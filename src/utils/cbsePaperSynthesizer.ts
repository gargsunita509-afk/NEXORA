import { CBSE_CURRICULUM, getChaptersForSubject, getSubjectClassLevel } from '../data/cbseSyllabus.ts';
import { RAW_STARTER_QUIZZES_EXPORT } from '../data/starterQuizzes.ts';
import { validateAndNormalizeMCQ } from './mcqValidator.ts';
import {
  HORNBILL_PROSE_CHAPTERS,
  HORNBILL_POETRY_POEMS,
  SNAPSHOTS_CHAPTERS,
} from '../data/cbseEnglishSyllabus.ts';

export interface QuizGenerationPayload {
  classLevel?: string;
  stream?: string;
  subject?: string;
  chapter?: string;
  chapters?: string[];
  questionCount?: number;
  difficulty?: string;
  questionType?: string;
  instructions?: string;
  teacherName?: string;
  recentQuestions?: string[];
  studentName?: string;
  assignedStudentIds?: string[];
  assignedStudentNames?: string[];
  assignmentMode?: 'individual' | 'group' | 'whole_stream' | 'present_only' | 'all_in_stream' | 'skip' | 'none';
  isQuestionPaper?: boolean;
  questionCountsByType?: {
    mcq?: number;
    short_2?: number;
    short_3?: number;
    case_study?: number;
    long_5?: number;
  };
  marksConfig?: {
    mcq?: number;
    short_2?: number;
    short_3?: number;
    case_study?: number;
    long_5?: number;
  };
  paperConfig?: {
    examName?: string;
    examDate?: string;
    durationMinutes?: number;
    generalInstructions?: string[];
  };
}

interface ChapterContext {
  subject: string;
  classLevel: string;
  chapterTitle: string;
  keyTopics: string[];
}

function getChapterContext(subject: string, chapterTitle: string, classLevel: string): ChapterContext {
  const chapters = getChaptersForSubject(subject);
  const cleanTitle = (chapterTitle || '').toLowerCase().trim();
  const matched =
    chapters.find((c) => c.title.toLowerCase() === cleanTitle) ||
    chapters.find((c) => cleanTitle.includes(c.title.toLowerCase()) || c.title.toLowerCase().includes(cleanTitle)) ||
    chapters[0];

  return {
    subject,
    classLevel,
    chapterTitle: matched ? matched.title : chapterTitle || `${subject} Core Curriculum`,
    keyTopics:
      matched && Array.isArray(matched.keyTopics) && matched.keyTopics.length > 0
        ? matched.keyTopics
        : ['Fundamental Principles', 'NCERT Derivations & Laws', 'Analytical Applications', 'Numerical Problem Solving'],
  };
}

interface RawMCQTemplate {
  question: string;
  options: [string, string, string, string];
  correctIndex: number;
  explanation: string;
  chapterMatch?: string;
}

const SUBJECT_CHAPTER_MCQS: Record<string, RawMCQTemplate[]> = {
  Physics: [
    {
      chapterMatch: 'Units and Measurements',
      question: 'Which of the following pairs of physical quantities possesses identical dimensional formulas [M L² T⁻²]?',
      options: [
        'Force and Linear Momentum',
        'Work and Torque',
        'Angular Momentum and Planck’s Constant',
        'Stress and Surface Tension',
      ],
      correctIndex: 1,
      explanation: 'Both Work (W = F·d) and Torque (τ = r × F) have dimensions [M L T⁻²][L] = [M L² T⁻²].',
    },
    {
      chapterMatch: 'Units and Measurements',
      question: 'If percentage errors in the measurement of mass and speed of a body are 2% and 3% respectively, what is the maximum percentage error in its kinetic energy (K = ½mv²)?',
      options: ['5%', '6%', '8%', '11%'],
      correctIndex: 2,
      explanation: 'ΔK/K × 100 = (Δm/m × 100) + 2(Δv/v × 100) = 2% + 2(3%) = 8%.',
    },
    {
      chapterMatch: 'Units and Measurements',
      question: 'How many significant figures are present in the measured quantity 0.0045080 m?',
      options: ['4', '5', '7', '8'],
      correctIndex: 1,
      explanation: 'Leading zeros are not significant, whereas captive and trailing zeros after a decimal point are significant: 4, 5, 0, 8, 0 gives 5 significant figures.',
    },
    {
      chapterMatch: 'Units and Measurements',
      question: 'In the van der Waals equation (P + a/V²)(V - b) = RT, what is the dimensional formula of the constant "a"?',
      options: ['[M L⁵ T⁻²]', '[M L³ T⁻²]', '[M L⁻¹ T⁻²]', '[M⁰ L³ T⁰]'],
      correctIndex: 0,
      explanation: 'By the principle of homogeneity, [a/V²] = [P] => [a] = [P][V²] = [M L⁻¹ T⁻²][L⁶] = [M L⁵ T⁻²].',
    },
    {
      chapterMatch: 'Motion in a Straight Line',
      question: 'A particle starts from rest with uniform acceleration of 4 m/s². What is the distance covered by the particle during the 3rd second of its motion?',
      options: ['6 m', '10 m', '12 m', '18 m'],
      correctIndex: 1,
      explanation: 'Distance in nth second: s_n = u + (a/2)(2n - 1) = 0 + (4/2)(2×3 - 1) = 2 × 5 = 10 m.',
    },
    {
      chapterMatch: 'Motion in a Straight Line',
      question: 'What physical quantity is represented by the area enclosed under a velocity-time (v-t) graph for rectilinear motion?',
      options: ['Instantaneous acceleration', 'Displacement of the object', 'Rate of change of acceleration', 'Linear momentum'],
      correctIndex: 1,
      explanation: 'The definite integral ∫v dt (area under the v-t curve) gives the net displacement over that time interval.',
    },
    {
      chapterMatch: 'Motion in a Plane',
      question: 'For a projectile launched at speed u at angle θ with the horizontal, at what launch angle is the horizontal range R equal to the maximum height H?',
      options: ['θ = 45°', 'θ = tan⁻¹(4)', 'θ = tan⁻¹(2)', 'θ = 60°'],
      correctIndex: 1,
      explanation: 'Since R = (u² sin 2θ)/g and H = (u² sin²θ)/(2g), setting R = H gives 2 sinθ cosθ = sin²θ / 2 => tanθ = 4, so θ = tan⁻¹(4).',
    },
    {
      chapterMatch: 'Laws of Motion',
      question: 'A 5 kg block rests on a horizontal surface with coefficient of static friction μ_s = 0.4 (take g = 10 m/s²). If a horizontal force of 15 N is applied, what is the frictional force acting on the block?',
      options: ['20 N', '15 N', '5 N', '0 N'],
      correctIndex: 1,
      explanation: 'Maximum static friction f_s(max) = μ_s N = 0.4 × 50 = 20 N. Since applied force (15 N) < 20 N, static friction self-adjusts to 15 N.',
    },
    {
      chapterMatch: 'Work, Energy and Power',
      question: 'A force F = (3i + 4j) N displaces a particle by d = (4i - 2j) m. What is the net work done by the force?',
      options: ['20 J', '12 J', '4 J', '-4 J'],
      correctIndex: 2,
      explanation: 'Work W = F · d = (3)(4) + (4)(-2) = 12 - 8 = 4 J.',
    },
    {
      chapterMatch: 'Gravitation',
      question: 'What is the ratio of escape speed (v_e) to orbital speed (v_o) for a satellite revolving very close to the Earth’s surface?',
      options: ['1 : 1', '√2 : 1', '2 : 1', '1 : √2'],
      correctIndex: 1,
      explanation: 'Near Earth’s surface, v_e = √(2gR) and v_o = √(gR), so v_e / v_o = √2 : 1.',
    },
  ],
  Chemistry: [
    {
      chapterMatch: 'Some Basic Concepts of Chemistry',
      question: 'What is the molarity of pure water at 298 K given its density is 1000 g/L and molar mass is 18 g/mol?',
      options: ['18.0 M', '55.55 M', '1.0 M', '100.0 M'],
      correctIndex: 1,
      explanation: 'Moles of H₂O in 1 L (1000 g) = 1000 / 18 = 55.55 mol/L.',
    },
    {
      chapterMatch: 'Structure of Atom',
      question: 'What is the maximum number of electrons in an atom that can have quantum numbers n = 3 and l = 2?',
      options: ['2', '6', '10', '14'],
      correctIndex: 2,
      explanation: 'n = 3, l = 2 corresponds to the 3d subshell, which has 2l + 1 = 5 orbitals and can hold up to 10 electrons.',
    },
    {
      chapterMatch: 'Chemical Bonding',
      question: 'According to VSEPR theory, what is the hybridization and molecular geometry of SF₄?',
      options: ['sp³, Tetrahedral', 'sp³d, See-saw', 'sp³d², Square planar', 'sp³d, Trigonal bipyramidal'],
      correctIndex: 1,
      explanation: 'Sulfur in SF₄ has 4 bond pairs and 1 lone pair (steric number 5, sp³d hybridization), resulting in a see-saw molecular geometry.',
    },
    {
      chapterMatch: 'Thermodynamics',
      question: 'For a chemical reaction to be spontaneous at all temperatures, what must be the signs of ΔH and ΔS?',
      options: ['ΔH < 0 and ΔS > 0', 'ΔH > 0 and ΔS < 0', 'ΔH < 0 and ΔS < 0', 'ΔH > 0 and ΔS > 0'],
      correctIndex: 0,
      explanation: 'From ΔG = ΔH - TΔS, when ΔH < 0 (exothermic) and ΔS > 0 (positive entropy change), ΔG is negative at all temperatures T.',
    },
  ],
  Mathematics: [
    {
      chapterMatch: 'Sets',
      question: 'If finite sets A and B have n(A) = 20, n(B) = 28, and n(A ∪ B) = 36, then what is n(A ∩ B)?',
      options: ['8', '12', '16', '24'],
      correctIndex: 1,
      explanation: 'By the inclusion-exclusion identity, n(A ∩ B) = n(A) + n(B) - n(A ∪ B) = 20 + 28 - 36 = 12.',
    },
    {
      chapterMatch: 'Trigonometric Functions',
      question: 'What is the principal value of cos(7π/6) in exact radical form?',
      options: ['√3 / 2', '-√3 / 2', '-1 / 2', '1 / 2'],
      correctIndex: 1,
      explanation: 'cos(7π/6) = cos(π + π/6) = -cos(π/6) = -√3 / 2.',
    },
    {
      chapterMatch: 'Complex Numbers',
      question: 'What is the modulus |z| of the complex number z = (3 + 4i) / (1 - 2i)?',
      options: ['√5', '5', '5 / √3', '√2'],
      correctIndex: 0,
      explanation: '|z| = |3 + 4i| / |1 - 2i| = √(9 + 16) / √(1 + 4) = 5 / √5 = √5.',
    },
    {
      chapterMatch: 'Limits and Derivatives',
      question: 'What is the value of the standard limit lim(x→0) [sin(5x) / sin(3x)]?',
      options: ['3 / 5', '5 / 3', '1', '0'],
      correctIndex: 1,
      explanation: 'lim(x→0) [sin(5x)/(5x) × (3x)/sin(3x) × (5/3)] = 1 × 1 × 5/3 = 5/3.',
    },
  ],
};

// Anti-repetition state across consecutive generations in the same session/server process
let generationEpochCounter = 0;
const recentSynthesizedSignatures: string[] = [];

function normalizeSignature(text: string): string {
  return String(text || '')
    .toLowerCase()
    .replace(/^rearrange the following words\/phrases into a grammatically correct sentence:\s*/i, '')
    .replace(/^answer in 40[–-]50 words:\s*/i, '')
    .replace(/^answer any one of the following questions in 120[–-]150 words(?:\s*\[\d+\s*marks\])?:\s*/i, '')
    .replace(/^read the following [a-z\s-]+ and answer the questions that follow:\s*/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .slice(0, 110);
}

function recordSignature(text: string): void {
  const sig = normalizeSignature(text);
  if (!sig) return;
  if (!recentSynthesizedSignatures.includes(sig)) {
    recentSynthesizedSignatures.push(sig);
    if (recentSynthesizedSignatures.length > 60) {
      recentSynthesizedSignatures.shift();
    }
  }
}

function buildRecentSignatureSet(recentQuestions?: string[]): Set<string> {
  const set = new Set<string>();
  if (Array.isArray(recentQuestions) && recentQuestions.length > 0) {
    for (const rq of recentQuestions) {
      const sig = normalizeSignature(rq);
      if (sig) set.add(sig);
    }
  } else {
    for (const sig of recentSynthesizedSignatures.slice(-20)) {
      if (sig) set.add(sig);
    }
  }
  return set;
}

function isTextRecentlyUsed(text: string, recentSet: Set<string>): boolean {
  const sig = normalizeSignature(text);
  if (!sig) return false;
  if (recentSet.has(sig)) return true;
  for (const existing of recentSet) {
    if (existing.length >= 45 && sig.length >= 45) {
      if (existing.slice(0, 75) === sig.slice(0, 75)) {
        return true;
      }
    }
  }
  return false;
}

function pickFreshItems<T>(
  pool: T[],
  count: number,
  getText: (item: T) => string,
  recentSet: Set<string>,
  epochOffset: number
): T[] {
  if (!Array.isArray(pool) || pool.length === 0 || count <= 0) return [];
  const rotated: T[] = [];
  const start = Math.abs(epochOffset) % pool.length;
  for (let i = 0; i < pool.length; i++) {
    rotated.push(pool[(start + i) % pool.length]);
  }
  const fresh = rotated.filter((item) => !isTextRecentlyUsed(getText(item), recentSet));
  const used = rotated.filter((item) => isTextRecentlyUsed(getText(item), recentSet));
  const combined = [...fresh, ...used];
  const selected: T[] = [];
  for (let i = 0; i < count; i++) {
    const picked = combined[i % combined.length];
    selected.push(picked);
    const sig = normalizeSignature(getText(picked));
    if (sig) {
      recentSet.add(sig);
      recordSignature(getText(picked));
    }
  }
  return selected;
}

function buildDynamicMCQ(
  ctx: ChapterContext,
  index: number,
  marks: number,
  difficulty: string,
  instructions: string,
  recentSet: Set<string> = new Set(),
  epoch = 0
): any {
  const subjectTemplates = SUBJECT_CHAPTER_MCQS[ctx.subject] || [];
  const matchingTemplates = subjectTemplates.filter(
    (t) =>
      t.chapterMatch &&
      (ctx.chapterTitle.toLowerCase().includes(t.chapterMatch.toLowerCase()) ||
        t.chapterMatch.toLowerCase().includes(ctx.chapterTitle.toLowerCase()))
  );

  const starterMatches = RAW_STARTER_QUIZZES_EXPORT.filter(
    (q) => q.subject.toLowerCase() === ctx.subject.toLowerCase()
  ).flatMap((q) => q.questions);

  const qId = `q-mcq-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 6)}`;

  const unusedMatching = matchingTemplates.filter((t) => !isTextRecentlyUsed(t.question, recentSet));
  if (unusedMatching.length > 0) {
    const t = unusedMatching[(index + epoch) % unusedMatching.length];
    recordSignature(t.question);
    recentSet.add(normalizeSignature(t.question));
    const validated = validateAndNormalizeMCQ(
      {
        id: qId,
        questionType: 'mcq',
        question: t.question,
        options: [...t.options],
        correctIndex: t.correctIndex,
        correctAnswerText: t.options[t.correctIndex],
        marks,
        points: marks * 10,
        explanation: t.explanation,
        chapter: ctx.chapterTitle,
      },
      qId,
      true
    );
    if (validated.valid && validated.question) return validated.question;
  }

  const unusedSubjectTemplates = subjectTemplates.filter((t) => !isTextRecentlyUsed(t.question, recentSet));
  if (unusedSubjectTemplates.length > 0 && matchingTemplates.length === 0) {
    const t = unusedSubjectTemplates[(index + epoch) % unusedSubjectTemplates.length];
    const qText = `[${ctx.chapterTitle}] ${t.question}`;
    recordSignature(qText);
    recentSet.add(normalizeSignature(qText));
    const validated = validateAndNormalizeMCQ(
      {
        id: qId,
        questionType: 'mcq',
        question: qText,
        options: [...t.options],
        correctIndex: t.correctIndex,
        correctAnswerText: t.options[t.correctIndex],
        marks,
        points: marks * 10,
        explanation: t.explanation,
        chapter: ctx.chapterTitle,
      },
      qId,
      true
    );
    if (validated.valid && validated.question) return validated.question;
  }

  const unusedStarters = starterMatches.filter((sq) => sq && !isTextRecentlyUsed(sq.question, recentSet));
  if (unusedStarters.length > 0) {
    const sq = unusedStarters[(index + epoch) % unusedStarters.length];
    if (sq && Array.isArray(sq.options) && sq.options.length === 4 && typeof sq.correctIndex === 'number') {
      recordSignature(sq.question);
      recentSet.add(normalizeSignature(sq.question));
      const validated = validateAndNormalizeMCQ(
        {
          id: qId,
          questionType: 'mcq',
          question: sq.question,
          options: [...sq.options],
          correctIndex: sq.correctIndex,
          correctAnswerText: sq.options[sq.correctIndex],
          marks,
          points: marks * 10,
          explanation: sq.explanation || `Evaluated per CBSE ${ctx.classLevel} ${ctx.subject} curriculum.`,
          chapter: ctx.chapterTitle,
        },
        qId,
        true
      );
      if (validated.valid && validated.question) return validated.question;
    }
  }

  // Topic-driven CBSE MCQ generator with 8 distinct analytical framings so consecutive runs never repeat
  const topicIdx = (index + epoch) % ctx.keyTopics.length;
  const topic = ctx.keyTopics[topicIdx];
  const altTopic1 = ctx.keyTopics[(topicIdx + 1) % ctx.keyTopics.length];
  const altTopic2 = ctx.keyTopics[(topicIdx + 2) % ctx.keyTopics.length];
  const variants = [
    {
      question: `In CBSE ${ctx.classLevel} ${ctx.subject} (${ctx.chapterTitle}), which statement accurately characterizes the principle of ${topic}?`,
      correct: `It establishes the quantitative and analytical relationship governing ${topic} under standard NCERT boundary conditions`,
      distractors: [
        `It applies exclusively to irreversible non-equilibrium systems independent of ${topic}`,
        `It states that ${altTopic1} remains zero regardless of external parameters`,
        `It contradicts the conservation laws established in ${altTopic2}`,
      ],
      explanation: `According to the official NCERT ${ctx.classLevel} ${ctx.subject} textbook (${ctx.chapterTitle}), ${topic} defines the exact analytical relationship verified under standard conditions.`,
    },
    {
      question: `Assertion (A): In the study of ${ctx.chapterTitle}, ${topic} is essential for solving standard ${difficulty.toLowerCase()}-level board problems.\nReason (R): ${topic} directly links measurable variables with theoretical derivations in ${ctx.subject}.`,
      correct: 'Both Assertion (A) and Reason (R) are true, and Reason (R) is the correct explanation of Assertion (A)',
      distractors: [
        'Both Assertion (A) and Reason (R) are true, but Reason (R) is not the correct explanation of Assertion (A)',
        'Assertion (A) is true, but Reason (R) is false',
        'Assertion (A) is false, but Reason (R) is true',
      ],
      explanation: `Both statements are true per NCERT ${ctx.classLevel} ${ctx.subject}: ${topic} provides the theoretical and quantitative foundation for ${ctx.chapterTitle}.`,
    },
    {
      question: `When analyzing ${topic} in the chapter "${ctx.chapterTitle}" (${ctx.subject}), if the primary governing parameter is doubled while keeping secondary factors constant, how does the system respond?`,
      correct: `The system follows the proportional law of ${topic} predicted by standard NCERT equations`,
      distractors: [
        `The system becomes completely independent of ${topic}`,
        `The measured value drops instantaneously to absolute zero`,
        `The dimensional consistency of ${ctx.chapterTitle} is violated`,
      ],
      explanation: `By direct application of the governing equation of ${topic} in ${ctx.chapterTitle}, the response scales in strict accordance with NCERT dimensional and mathematical principles.${instructions ? ` (Teacher Focus: ${instructions})` : ''}`,
    },
    {
      question: `Which of the following experimental or analytical observations best validates the concept of ${topic} in "${ctx.chapterTitle}" (${ctx.classLevel} ${ctx.subject})?`,
      correct: `Direct empirical verification linking ${topic} with ${altTopic1} under controlled NCERT conditions`,
      distractors: [
        `Elimination of all boundary constraints between ${altTopic1} and ${altTopic2}`,
        `Spontaneous reversal of the governing law of ${topic} at standard temperature`,
        `Complete decoupling of ${topic} from fundamental conservation laws`,
      ],
      explanation: `Empirical and analytical verification in NCERT ${ctx.subject} confirms how ${topic} systematically governs ${altTopic1}.`,
    },
    {
      question: `Identify the correct mathematical or conceptual condition required for applying ${topic} in CBSE ${ctx.classLevel} ${ctx.subject} ("${ctx.chapterTitle}"):`,
      correct: `All system variables must satisfy the standard domain and equilibrium assumptions of ${topic}`,
      distractors: [
        `The contribution of ${altTopic1} must exceed infinite magnitude`,
        `All physical or economic units must be omitted during substitution`,
        `The boundary conditions of ${altTopic2} must be inverted`,
      ],
      explanation: `Applying ${topic} in ${ctx.chapterTitle} requires adherence to its standard NCERT domain and boundary conditions.`,
    },
    {
      question: `In "${ctx.chapterTitle}", what distinguishes the analytical role of ${topic} from that of ${altTopic1}?`,
      correct: `${topic} governs the primary structural/quantitative mechanism, whereas ${altTopic1} characterizes the complementary aspect of ${ctx.chapterTitle}`,
      distractors: [
        `Both ${topic} and ${altTopic1} are obsolete and excluded from modern ${ctx.subject}`,
        `${topic} applies only to hypothetical vacuum states whereas ${altTopic1} is purely qualitative`,
        `Neither ${topic} nor ${altTopic1} has any bearing on ${altTopic2}`,
      ],
      explanation: `NCERT ${ctx.classLevel} ${ctx.subject} clearly differentiates the primary mechanism of ${topic} from ${altTopic1}.`,
    },
  ];

  const chosen = pickFreshItems(variants, 1, (v) => v.question, recentSet, index + epoch)[0] || variants[0];
  const options = [chosen.correct, ...chosen.distractors];
  const validated = validateAndNormalizeMCQ(
    {
      id: qId,
      questionType: 'mcq',
      question: chosen.question,
      options,
      correctIndex: 0,
      correctAnswerText: chosen.correct,
      marks,
      points: marks * 10,
      explanation: chosen.explanation,
      chapter: ctx.chapterTitle,
    },
    qId,
    true
  );

  return validated.question!;
}

function buildShort2Question(
  ctx: ChapterContext,
  index: number,
  marks: number,
  difficulty: string,
  instructions: string,
  recentSet: Set<string> = new Set(),
  epoch = 0
): any {
  const topicIdx = (index + epoch) % ctx.keyTopics.length;
  const topic = ctx.keyTopics[topicIdx];
  const secondTopic = ctx.keyTopics[(topicIdx + 1) % ctx.keyTopics.length];
  const qId = `q-s2-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 6)}`;

  const prompts = [
    {
      question: `Define ${topic} in the context of "${ctx.chapterTitle}". State its mathematical expression or standard convention and mention one key condition for its validity.`,
      modelAnswer: `1. Definition (1 Mark): ${topic} in ${ctx.chapterTitle} (${ctx.subject}) is defined per NCERT ${ctx.classLevel} standards as the fundamental relationship governing the system state.\n2. Expression / Condition (1 Mark): Expressed in standard units/conventions; valid under equilibrium / standard CBSE boundary conditions.`,
    },
    {
      question: `Distinguish between ${topic} and ${secondTopic} as studied in "${ctx.chapterTitle}" (any two clear points with examples).`,
      modelAnswer: `1. Conceptual Distinction (1 Mark): ${topic} addresses the primary analytical property in ${ctx.chapterTitle}, whereas ${secondTopic} governs the complementary structural/dynamic response.\n2. Application / Example (1 Mark): Standard NCERT ${ctx.classLevel} ${ctx.subject} illustration demonstrating both concepts.`,
    },
    {
      question: `Give a concise academic justification for why ${topic} plays a critical role in "${ctx.chapterTitle}".`,
      modelAnswer: `1. Core Principle (1 Mark): Direct application of ${topic} from NCERT ${ctx.classLevel} ${ctx.subject}.\n2. Justification (1 Mark): Explains the causal mechanism and quantitative impact on ${secondTopic}.`,
    },
    {
      question: `State two key characteristics of ${topic} in "${ctx.chapterTitle}" and explain how it influences ${secondTopic}.`,
      modelAnswer: `1. Two Key Characteristics (1 Mark): Precision formulation of ${topic} per NCERT ${ctx.classLevel} ${ctx.subject}.\n2. Influence on ${secondTopic} (1 Mark): Direct analytical linkage verified in ${ctx.chapterTitle}.`,
    },
    {
      question: `Why is ${topic} considered a foundational concept in "${ctx.chapterTitle}"? Support your answer with one standard NCERT example.`,
      modelAnswer: `1. Foundational Role (1 Mark): ${topic} provides the theoretical basis for analyzing problems in ${ctx.chapterTitle}.\n2. Standard Example (1 Mark): Authentic CBSE ${ctx.classLevel} ${ctx.subject} illustration.`,
    },
    {
      question: `Write the governing rule or analytical criterion for ${topic} in "${ctx.chapterTitle}" and state one limitation or special case.`,
      modelAnswer: `1. Governing Rule (1 Mark): Formal NCERT statement of ${topic}.\n2. Limitation / Special Case (1 Mark): Boundary condition where ${secondTopic} modifies the ideal behavior.`,
    },
  ];

  const selected = pickFreshItems(prompts, 1, (p) => p.question, recentSet, index + epoch)[0] || prompts[0];

  return {
    id: qId,
    questionType: 'short_2',
    question: selected.question,
    marks,
    points: marks * 10,
    modelAnswer: selected.modelAnswer,
    rubric: `${marks} marks: 1 mark for accurate NCERT definition/formula + 1 mark for analytical justification (${difficulty} level).`,
    explanation: `Evaluated according to the official CBSE ${ctx.classLevel} ${ctx.subject} marking scheme for ${ctx.chapterTitle}.${instructions ? ` Incorporates teacher guideline: ${instructions}` : ''}`,
    chapter: ctx.chapterTitle,
  };
}

function buildShort3Question(
  ctx: ChapterContext,
  index: number,
  marks: number,
  difficulty: string,
  instructions: string,
  recentSet: Set<string> = new Set(),
  epoch = 0
): any {
  const topicIdx = (index + epoch) % ctx.keyTopics.length;
  const topic = ctx.keyTopics[topicIdx];
  const secondTopic = ctx.keyTopics[(topicIdx + 1) % ctx.keyTopics.length];
  const thirdTopic = ctx.keyTopics[(topicIdx + 2) % ctx.keyTopics.length];
  const qId = `q-s3-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 6)}`;

  const prompts = [
    {
      question: `(a) Explain the theoretical principle of ${topic} in "${ctx.chapterTitle}".\n(b) Derive or demonstrate how ${topic} relates to ${secondTopic} with a step-by-step NCERT illustration.`,
      modelAnswer: `• Part (a) Principle (1 Mark): Clear statement of ${topic} with governing assumptions from ${ctx.chapterTitle}.\n• Part (b) Step-by-Step Derivation / Analysis (1.5 Marks): Sequential mathematical/logical steps connecting ${topic} to ${secondTopic}.\n• Conclusion & Units (0.5 Mark): Final verified relation with proper notation.`,
    },
    {
      question: `Solve and analyze the following 3-mark problem from "${ctx.chapterTitle}":\nUsing the principles of ${topic}, evaluate the system behavior when standard parameters are varied by 25%, and state two practical implications in ${ctx.subject}.`,
      modelAnswer: `• Formula & Identification of Given Data (1 Mark): Writing the governing relation for ${topic}.\n• Substitution & Step-wise Calculation (1 Mark): Evaluating the 25% parameter variation accurately.\n• Two Practical Implications (1 Mark): Two NCERT-grounded applications in ${ctx.chapterTitle}.`,
    },
    {
      question: `Compare the analytical framework of ${topic} and ${secondTopic} in "${ctx.chapterTitle}" under three distinct heads: (i) Core Principle, (ii) Governing Relation/Structure, and (iii) Real-world Application.`,
      modelAnswer: `• (i) Core Principle (1 Mark): Fundamental NCERT distinction between ${topic} and ${secondTopic}.\n• (ii) Governing Relation (1 Mark): Mathematical/conceptual representation in ${ctx.chapterTitle}.\n• (iii) Real-world Application (1 Mark): Concrete illustration connecting to ${thirdTopic}.`,
    },
    {
      question: `With reference to "${ctx.chapterTitle}" (${ctx.classLevel} ${ctx.subject}), explain three critical factors that govern ${topic} and illustrate how ${secondTopic} modifies the outcome.`,
      modelAnswer: `• Three Governing Factors (1.5 Marks): Detailed breakdown of parameters controlling ${topic}.\n• Modification by ${secondTopic} (1.5 Marks): Analytical explanation with NCERT example.`,
    },
    {
      question: `(a) State the foundational rule of ${topic} in "${ctx.chapterTitle}".\n(b) Justify two reasons why ${secondTopic} is indispensable when applying ${topic} to practical ${ctx.subject} scenarios.`,
      modelAnswer: `• Part (a) Foundational Rule (1 Mark): Exact NCERT statement of ${topic}.\n• Part (b) Two Analytical Justifications (2 Marks): 1 mark each for rigorous explanation linking ${secondTopic} and ${thirdTopic}.`,
    },
  ];

  const selected = pickFreshItems(prompts, 1, (p) => p.question, recentSet, index + epoch)[0] || prompts[0];

  return {
    id: qId,
    questionType: 'short_3',
    question: selected.question,
    marks,
    points: marks * 10,
    modelAnswer: selected.modelAnswer,
    rubric: `${marks} marks: Step-wise CBSE marking (1M principle/formula + 1M intermediate steps + 1M final result/application).`,
    explanation: `3-Mark Short Answer Type-II question grounded in ${ctx.chapterTitle} (${ctx.classLevel} ${ctx.subject}, ${difficulty}).${instructions ? ` Teacher Note: ${instructions}` : ''}`,
    chapter: ctx.chapterTitle,
  };
}

function buildCaseStudyQuestion(
  ctx: ChapterContext,
  index: number,
  marks: number,
  difficulty: string,
  instructions: string,
  recentSet: Set<string> = new Set(),
  epoch = 0
): any {
  const offset = (index + epoch) % ctx.keyTopics.length;
  const topic1 = ctx.keyTopics[offset] || 'Core Principle';
  const topic2 = ctx.keyTopics[(offset + 1) % ctx.keyTopics.length] || 'Analytical Method';
  const topic3 = ctx.keyTopics[(offset + 2) % ctx.keyTopics.length] || 'Practical Application';
  const qId = `q-case-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 6)}`;

  const totalMarks = Math.max(2, Number(marks) || 4);
  const m1 = 1;
  const m2 = 1;
  const m3 = Math.max(1, totalMarks - m1 - m2);

  const scenarios = [
    {
      casePassage: `During an advanced CBSE ${ctx.classLevel} ${ctx.subject} classroom investigation at The Abhinav School, students examined the real-world behavior of ${ctx.chapterTitle}. Specifically, they recorded observations connecting ${topic1}, ${topic2}, and ${topic3} under controlled conditions. By plotting the measured variables and applying standard NCERT equations, the group demonstrated how small variations in ${topic1} systematically influence the overall outcome predicted by ${topic2}.`,
      q1: `Identify the fundamental law or concept of ${topic1} demonstrated in the above observation from "${ctx.chapterTitle}".`,
      q2: `How does ${topic2} quantitatively or conceptually account for the trend recorded by the students?`,
      q3: `Apply ${topic3} to formulate the conclusion of this study and solve for the limiting case when external disturbances are minimized.`,
    },
    {
      casePassage: `A research audit on "${ctx.chapterTitle}" in CBSE ${ctx.classLevel} ${ctx.subject} evaluated three distinct operational regimes governed by ${topic1} and ${topic2}. Across 40 documented trials, researchers observed that maintaining equilibrium in ${topic1} directly stabilized ${topic2}, whereas neglecting the boundary constraints of ${topic3} led to systematic deviations from ideal theoretical predictions.`,
      q1: `Based on the case study, state the role of ${topic1} in stabilizing the system described in "${ctx.chapterTitle}".`,
      q2: `Why did neglecting the boundary constraints of ${topic3} cause deviations from ideal predictions?`,
      q3: `Synthesize a step-by-step corrective methodology using ${topic2} and ${topic3} to restore ideal NCERT performance.`,
    },
    {
      casePassage: `Consider a practical case scenario grounded in "${ctx.chapterTitle}" (${ctx.classLevel} ${ctx.subject}): An analytical team is tasked with optimizing a model where ${topic1} interacts dynamically with ${topic2}. Initial baseline measurements indicate a 15% variance attributable to secondary effects in ${topic3}, prompting a rigorous re-evaluation using standard NCERT frameworks.`,
      q1: `Which primary parameter of ${topic1} must be calibrated first in "${ctx.chapterTitle}"?`,
      q2: `Explain the analytical linkage between ${topic1} and ${topic2} that governs the baseline measurement.`,
      q3: `Demonstrate how accounting for ${topic3} eliminates the 15% variance and aligns the model with CBSE standards.`,
    },
  ];

  const chosen = pickFreshItems(scenarios, 1, (s) => s.casePassage, recentSet, index + epoch)[0] || scenarios[0];

  return {
    id: qId,
    questionType: 'case_study',
    question: `Read the following competency-based academic passage on "${ctx.chapterTitle}" and answer the sub-questions that follow:`,
    casePassage: chosen.casePassage,
    marks: totalMarks,
    points: totalMarks * 10,
    subQuestions: [
      {
        id: `sq-${qId}-0`,
        subNumber: '(i)',
        question: chosen.q1,
        questionType: 'written',
        marks: m1,
        modelAnswer: `The observation demonstrates the NCERT principle of ${topic1} in ${ctx.chapterTitle}, which governs the primary relationship between the observed variables.`,
        explanation: '1 mark for identifying the core concept accurately.',
      },
      {
        id: `sq-${qId}-1`,
        subNumber: '(ii)',
        question: chosen.q2,
        questionType: 'written',
        marks: m2,
        modelAnswer: `According to ${topic2}, variations in the input parameter produce a predictable, proportional response consistent with ${ctx.subject} theory.`,
        explanation: '1 mark for explaining the mechanism.',
      },
      {
        id: `sq-${qId}-2`,
        subNumber: '(iii)',
        question: chosen.q3,
        questionType: 'written',
        marks: m3,
        modelAnswer: `When external disturbances approach zero, ${topic3} ensures conservation and stability of the system in ${ctx.chapterTitle}, yielding the ideal NCERT theoretical value.`,
        explanation: `${m3} mark(s) for complete analytical synthesis and limiting-case evaluation.`,
      },
    ],
    explanation: `Competency-based CBSE Case Study (${totalMarks} Marks) on ${ctx.chapterTitle} (${difficulty}).${instructions ? ` ${instructions}` : ''}`,
    chapter: ctx.chapterTitle,
  };
}

function buildLong5Question(
  ctx: ChapterContext,
  index: number,
  marks: number,
  difficulty: string,
  instructions: string,
  recentSet: Set<string> = new Set(),
  epoch = 0
): any {
  const offset = (index + epoch) % ctx.keyTopics.length;
  const topic1 = ctx.keyTopics[offset];
  const topic2 = ctx.keyTopics[(offset + 1) % ctx.keyTopics.length];
  const topic3 = ctx.keyTopics[(offset + 2) % ctx.keyTopics.length];
  const qId = `q-l5-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 6)}`;

  const prompts = [
    {
      question: `(a) State and explain the comprehensive theory of ${topic1} in "${ctx.chapterTitle}" with necessary mathematical expressions or structured diagrams.\n(b) Derive the analytical relationship connecting ${topic1} and ${topic2}.\n(c) Using ${topic3}, solve a standard numerical/application problem to illustrate how this principle operates in CBSE ${ctx.classLevel} ${ctx.subject}.`,
      modelAnswer: `• Part (a) Theory & Diagram/Expression (2 Marks): Complete NCERT statement of ${topic1} in ${ctx.chapterTitle} with labeled schematic/equation and boundary conditions.\n• Part (b) Analytical Derivation (2 Marks): Step-by-step derivation linking ${topic1} with ${topic2}, showing all intermediate algebraic/conceptual transitions.\n• Part (c) Numerical / Application Problem (1 Mark): Explicit verification using ${topic3} with proper units and interpretation.`,
    },
    {
      question: `(a) Critically evaluate the significance of ${topic1} and ${topic2} in the chapter "${ctx.chapterTitle}".\n(b) Formulate the complete step-by-step proof or structured framework demonstrating how ${topic2} governs ${topic3} under standard NCERT assumptions.`,
      modelAnswer: `• Part (a) Critical Evaluation (2.5 Marks): Detailed NCERT analysis of ${topic1} and ${topic2} in ${ctx.chapterTitle}.\n• Part (b) Structured Proof / Framework (2.5 Marks): Logical derivation and boundary verification connecting ${topic2} and ${topic3}.`,
    },
    {
      question: `Answer the following comprehensive 5-mark question on "${ctx.chapterTitle}" (${ctx.classLevel} ${ctx.subject}):\n(i) Define ${topic1} and state its fundamental assumptions (1.5 Marks).\n(ii) Establish the quantitative or structural interrelationship between ${topic2} and ${topic3} (2 Marks).\n(iii) Discuss one practical case where ${topic1} and ${topic3} are applied simultaneously (1.5 Marks).`,
      modelAnswer: `• (i) Definition & Assumptions (1.5 Marks): Formal NCERT definition of ${topic1}.\n• (ii) Interrelationship (2 Marks): Complete analytical linkage between ${topic2} and ${topic3}.\n• (iii) Simultaneous Application (1.5 Marks): Real-world CBSE exemplar application.`,
    },
    {
      question: `(a) Distinguish between the ideal and real-world behavior of ${topic1} in "${ctx.chapterTitle}".\n(b) Explain how ${topic2} and ${topic3} address complex multi-variable scenarios in CBSE ${ctx.classLevel} ${ctx.subject}, supporting your answer with a labeled flow/diagrammatic breakdown.`,
      modelAnswer: `• Part (a) Ideal vs Real-World Behavior (2 Marks): Comparative NCERT analysis of ${topic1}.\n• Part (b) Multi-Variable Synthesis & Diagram (3 Marks): Step-wise integration of ${topic2} and ${topic3} in ${ctx.chapterTitle}.`,
    },
  ];

  const chosen = pickFreshItems(prompts, 1, (p) => p.question, recentSet, index + epoch)[0] || prompts[0];

  return {
    id: qId,
    questionType: 'long_5',
    question: chosen.question,
    marks,
    points: marks * 10,
    modelAnswer: chosen.modelAnswer,
    rubric: `${marks} marks: 2M for Part (a) theory/diagram + 2M for Part (b) derivation + 1M for Part (c) application.`,
    explanation: `Comprehensive 5-Mark Long Answer question for ${ctx.classLevel} ${ctx.subject} (${ctx.chapterTitle}, ${difficulty}).${instructions ? ` Teacher Focus: ${instructions}` : ''}`,
    chapter: ctx.chapterTitle,
  };
}

// ============================================================================
// MULTI-VARIANT CBSE CLASS 11 ENGLISH CORE QUESTION BANKS
// ============================================================================

const ENGLISH_UNSEEN_PASSAGES = [
  {
    casePassage: `The rapid ascent of generative artificial intelligence has fundamentally disrupted cognitive routines and traditional pedagogical models. For centuries, educational philosophies have anchored themselves to the preservation and development of critical reasoning, synthesis, and expressive eloquence. However, the advent of algorithmic neural networks capable of synthesizing prose, solving equations, and summarizing research in fractions of a second poses an existential question: Does artificial cognitive assistance enhance human intellect, or does it catalyze intellectual atrophy?\n\nRecent neurocognitive evaluations suggest that reliance on algorithmic summaries reduces the depth of syntactic processing and weakens working memory retention. When students bypass the laborious struggle of parsing dense textual arguments, they miss out on forming synaptic pathways crucial for dialectical thought. Conversely, proponents argue that cognitive offloading allows the human mind to focus on higher-order evaluative judgments and ethical deliberations. The debate is not whether technology should be prohibited, but rather how educators can cultivate deep reading habits that anchor attention spans in an era of incessant digital bombardment.`,
    subQuestions: [
      {
        subNumber: '(i)',
        question: 'According to the passage, what is the central dilemma posed by generative AI to modern education?',
        questionType: 'mcq',
        options: [
          'Whether AI increases administrative costs or reduces tuition',
          'Whether cognitive assistance enhances human intellect or induces intellectual atrophy',
          'Whether digital screens impair vision compared to printed textbooks',
          'Whether teachers should be replaced entirely by automated software',
        ],
        correctIndex: 1,
        correctAnswerText: 'Whether cognitive assistance enhances human intellect or induces intellectual atrophy',
        marks: 1,
        explanation: 'Paragraph 1 explicitly poses whether AI enhances human intellect or catalyzes intellectual atrophy.',
      },
      {
        subNumber: '(ii)',
        question: 'What neurocognitive impact does bypassing dense textual arguments have on students?',
        questionType: 'written',
        marks: 2,
        modelAnswer: 'It reduces the depth of syntactic processing, weakens working memory retention, and impedes the formation of synaptic pathways necessary for dialectical thought.',
      },
      {
        subNumber: '(iii)',
        question: 'The phrase "cognitive offloading" as used in paragraph 2 most closely implies:',
        questionType: 'mcq',
        options: [
          'Delegating mundane cognitive tasks to external tools to free mental bandwidth',
          'Complete mental exhaustion resulting from over-studying',
          'Shutting down digital devices during examinations',
          'Discarding scientific theories in favor of computational algorithms',
        ],
        correctIndex: 0,
        correctAnswerText: 'Delegating mundane cognitive tasks to external tools to free mental bandwidth',
        marks: 1,
        explanation: 'Cognitive offloading refers to relying on external tools (AI) to handle lower-order tasks.',
      },
      {
        subNumber: '(iv)',
        question: 'Find a word from paragraph 1 that means "essential to or dealing with the nature of human existence":',
        questionType: 'written',
        marks: 1,
        modelAnswer: 'Existential',
      },
      {
        subNumber: '(v)',
        question: 'How do proponents of AI justify its integration into academic disciplines?',
        questionType: 'written',
        marks: 2,
        modelAnswer: 'Proponents argue that offloading routine cognitive chores allows learners to concentrate on higher-order evaluative judgments, creative innovation, and ethical deliberation.',
      },
      {
        subNumber: '(vi)',
        question: 'State whether the following assertion is TRUE or FALSE per the passage:\n"The author advocates for the total prohibition of artificial intelligence across all educational institutions."',
        questionType: 'mcq',
        options: [
          'FALSE — The author advocates cultivating deep reading rather than banning technology.',
          'TRUE — The author demands an immediate worldwide ban on AI in schools.',
        ],
        correctIndex: 0,
        correctAnswerText: 'FALSE — The author advocates cultivating deep reading rather than banning technology.',
        marks: 1,
        explanation: 'Paragraph 2 concludes: "The debate is not whether technology should be prohibited, but rather how educators can cultivate deep reading habits."',
      },
    ],
  },
  {
    casePassage: `Across rapidly urbanizing metropolises, the phenomenon of the "Urban Heat Island" (UHI) has transformed concrete skylines into thermal traps that elevate ambient night-time temperatures by up to five degrees Celsius compared to surrounding rural belts. In response, ecological urbanists have pioneered the Miyawaki method of dense afforestation—cultivating multi-layered native micro-forests on compact urban plots no larger than a tennis court. Unlike ornamental monoculture plantations of non-native palms or lawns, a Miyawaki micro-forest replicates the vertical stratification of a natural woodland, combining canopy trees, sub-tree layers, shrubs, and ground-cover herbs.\n\nEmpirical observations across Indian cities reveal that these self-sustaining micro-ecosystems grow ten times faster and sequester thirty times more carbon per square metre than conventional municipal parks. By restoring mycorrhizal fungal networks in degraded urban soils and intercepting particulate pollutants, micro-forests serve as biological air-conditioning lungs. Yet urban planners caution that pocket forests cannot become a convenient alibi for unchecked deforestation on metropolitan peripheries; true climate resilience requires integrating green corridors into statutory master plans.`,
    subQuestions: [
      {
        subNumber: '(i)',
        question: 'What distinguishes a Miyawaki micro-forest from conventional municipal monoculture plantations?',
        questionType: 'mcq',
        options: [
          'It relies exclusively on imported exotic palm species',
          'It replicates multi-layered native woodland stratification on compact urban plots',
          'It requires permanent chemical irrigation every week for fifty years',
          'It eliminates all shrubs and ground-cover herbs to maximize lawn space',
        ],
        correctIndex: 1,
        correctAnswerText: 'It replicates multi-layered native woodland stratification on compact urban plots',
        marks: 1,
        explanation: 'Paragraph 1 states that the Miyawaki method replicates vertical stratification combining canopy, sub-tree, shrub, and herb layers.',
      },
      {
        subNumber: '(ii)',
        question: 'How do Miyawaki micro-forests mitigate the Urban Heat Island (UHI) effect and air pollution?',
        questionType: 'written',
        marks: 2,
        modelAnswer: 'They sequester up to thirty times more carbon per square metre, restore soil mycorrhizal networks, intercept particulate pollutants, and act as biological cooling lungs that lower ambient urban temperatures.',
      },
      {
        subNumber: '(iii)',
        question: 'In paragraph 2, the word "alibi" is used to warn against:',
        questionType: 'mcq',
        options: [
          'Using small pocket forests as an excuse to justify large-scale peripheral deforestation',
          'Planting native trees along highway dividers',
          'Measuring soil carbon content using laboratory instruments',
          'Involving school students in neighbourhood tree-planting drives',
        ],
        correctIndex: 0,
        correctAnswerText: 'Using small pocket forests as an excuse to justify large-scale peripheral deforestation',
        marks: 1,
        explanation: 'Urban planners caution that pocket forests must not become an excuse (alibi) for unchecked deforestation.',
      },
      {
        subNumber: '(iv)',
        question: 'Identify the term in paragraph 1 that refers to "arrangement or classification into different vertical layers":',
        questionType: 'written',
        marks: 1,
        modelAnswer: 'Stratification',
      },
      {
        subNumber: '(v)',
        question: 'Why do ecological urbanists criticize ornamental lawns and non-native palm plantations?',
        questionType: 'written',
        marks: 2,
        modelAnswer: 'Because ornamental monocultures lack vertical biodiversity layers, fail to restore native soil ecosystems, and offer minimal carbon sequestration compared to native multi-layered forests.',
      },
      {
        subNumber: '(vi)',
        question: 'What is the author’s concluding recommendation for achieving genuine urban climate resilience?',
        questionType: 'mcq',
        options: [
          'Replacing all residential buildings with agricultural farms',
          'Integrating continuous green corridors into statutory metropolitan master plans',
          'Relying solely on mechanical air-filtration towers',
          'Restricting afforestation to rural sanctuaries only',
        ],
        correctIndex: 1,
        correctAnswerText: 'Integrating continuous green corridors into statutory metropolitan master plans',
        marks: 1,
        explanation: 'The final sentence emphasizes integrating green corridors into statutory master plans.',
      },
    ],
  },
  {
    casePassage: `Beneath the sunlit photic zone of the world’s oceans lies the mesopelagic "twilight zone"—an abyssal realm between 200 and 1,000 metres where solar photons fade into perpetual midnight. In this high-pressure wilderness, over seventy-five percent of marine organisms have independently evolved the biochemical marvel of bioluminescence: the production of cold light through the oxidation of luciferin molecules catalyzed by the enzyme luciferase. Far from being a mere aesthetic curiosity, living light functions as the primary syntax of deep-sea survival.\n\nPredators such as the anglerfish wield luminescent lures to ambush prey, while lanternfish employ ventral "counter-illumination" to match the faint downwelling glow from above, rendering their silhouettes invisible to predators lurking below. Equally vital is the nightly "diel vertical migration," during which trillions of bioluminescent organisms ascend toward surface waters to feed on phytoplankton before retreating to the depths at dawn. This silent biological elevator transports gigatonnes of atmospheric carbon into the deep ocean, regulating Earth’s climate with a precision that modern geoengineering has yet to rival.`,
    subQuestions: [
      {
        subNumber: '(i)',
        question: 'What biochemical reaction enables deep-sea organisms to produce cold light?',
        questionType: 'mcq',
        options: [
          'Photosynthesis driven by ultraviolet thermal vents',
          'Oxidation of luciferin molecules catalyzed by the enzyme luciferase',
          'Combustion of dissolved methane in high-salinity water',
          'Reflection of moonlight off crystalline fish scales',
        ],
        correctIndex: 1,
        correctAnswerText: 'Oxidation of luciferin molecules catalyzed by the enzyme luciferase',
        marks: 1,
        explanation: 'Paragraph 1 explicitly defines bioluminescence as the oxidation of luciferin catalyzed by luciferase.',
      },
      {
        subNumber: '(ii)',
        question: 'Explain how lanternfish use "counter-illumination" as a defensive camouflage strategy.',
        questionType: 'written',
        marks: 2,
        modelAnswer: 'Lanternfish emit light from their underside (ventral surface) that matches the intensity of faint downwelling sunlight from above, erasing their dark silhouette so predators looking up from below cannot spot them.',
      },
      {
        subNumber: '(iii)',
        question: 'Why does the author refer to the diel vertical migration as a "silent biological elevator"?',
        questionType: 'written',
        marks: 2,
        modelAnswer: 'Because trillions of marine organisms ascend to the surface at night to feed and return to the deep ocean at dawn, actively transporting gigatonnes of carbon from surface waters into the deep sea.',
      },
      {
        subNumber: '(iv)',
        question: 'Which word in paragraph 1 means "existing or continuing forever without interruption"?',
        questionType: 'written',
        marks: 1,
        modelAnswer: 'Perpetual',
      },
      {
        subNumber: '(v)',
        question: 'What depth range defines the oceanic mesopelagic "twilight zone"?',
        questionType: 'mcq',
        options: [
          '0 to 50 metres',
          '200 to 1,000 metres',
          '3,000 to 6,000 metres',
          '10,000 metres and below',
        ],
        correctIndex: 1,
        correctAnswerText: '200 to 1,000 metres',
        marks: 1,
        explanation: 'Paragraph 1 states that the mesopelagic twilight zone lies between 200 and 1,000 metres.',
      },
      {
        subNumber: '(vi)',
        question: 'How does the passage link deep-sea bioluminescent organisms to global climate regulation?',
        questionType: 'mcq',
        options: [
          'Their vertical migration sequesters massive quantities of carbon into the deep ocean',
          'Their cold light warms polar ice caps during winter',
          'They release oxygen directly into the stratosphere',
          'They prevent ocean currents from circulating near the equator',
        ],
        correctIndex: 0,
        correctAnswerText: 'Their vertical migration sequesters massive quantities of carbon into the deep ocean',
        marks: 1,
        explanation: 'Paragraph 2 explains that their daily migration transports gigatonnes of carbon into the deep ocean.',
      },
    ],
  },
  {
    casePassage: `For decades, neuroscientists viewed sleep as a passive restorative pause—a biological standby mode during which the brain simply rested from waking metabolic exertion. Contemporary polysomnographic research, however, has overturned this quiescent model, revealing that the sleeping brain orchestrates an intricate nocturnal symphony of memory consolidation and synaptic pruning. During slow-wave non-REM sleep, the hippocampus—acting as a temporary scratchpad for daily experiences—replays neural firing patterns at accelerated speeds, transferring fragile short-term episodic memories into the permanent archival circuitry of the neocortex.\n\nSimultaneously, the brain’s glymphatic system expands interstitial fluid channels by nearly sixty percent, flushing out neurotoxic metabolic by-products that accumulate during waking cognition. When adolescents chronically curtail sleep to accommodate late-night revision—"cramming" at the expense of slow-wave cycles—they paradoxically sabotage the very neural architecture required to retain what they studied. True academic mastery, therefore, is forged not merely at the study desk, but in the disciplined preservation of uninterrupted nocturnal sleep.`,
    subQuestions: [
      {
        subNumber: '(i)',
        question: 'How has contemporary neuroscience revised the traditional view of sleep?',
        questionType: 'mcq',
        options: [
          'It proved that the brain shuts down all electrical activity during sleep',
          'It revealed that sleep actively consolidates memories and prunes synapses rather than being a passive pause',
          'It showed that adolescents require less sleep than elderly adults',
          'It demonstrated that short-term memories are stored permanently in the spinal cord',
        ],
        correctIndex: 1,
        correctAnswerText: 'It revealed that sleep actively consolidates memories and prunes synapses rather than being a passive pause',
        marks: 1,
        explanation: 'Paragraph 1 contrasts the old passive model with active nocturnal memory consolidation and synaptic pruning.',
      },
      {
        subNumber: '(ii)',
        question: 'Describe the respective roles of the hippocampus and the neocortex during slow-wave non-REM sleep.',
        questionType: 'written',
        marks: 2,
        modelAnswer: 'The hippocampus acts as a temporary scratchpad that replays recent neural firing patterns, transferring fragile short-term memories into the neocortex for permanent long-term archival storage.',
      },
      {
        subNumber: '(iii)',
        question: 'What vital physiological function is performed by the brain’s glymphatic system during sleep?',
        questionType: 'written',
        marks: 2,
        modelAnswer: 'It expands interstitial fluid channels by nearly sixty percent to flush out neurotoxic metabolic waste products accumulated during waking cognitive activity.',
      },
      {
        subNumber: '(iv)',
        question: 'Find a word in paragraph 1 that means "in a state of quiet inactivity or dormancy":',
        questionType: 'written',
        marks: 1,
        modelAnswer: 'Quiescent',
      },
      {
        subNumber: '(v)',
        question: 'Why does the author describe late-night exam cramming at the expense of sleep as "paradoxical"?',
        questionType: 'mcq',
        options: [
          'Because sacrificing slow-wave sleep destroys the neural consolidation needed to retain the studied material',
          'Because textbooks are harder to read under artificial lamps',
          'Because morning examinations are shorter than afternoon examinations',
          'Because the glymphatic system only operates during afternoon naps',
        ],
        correctIndex: 0,
        correctAnswerText: 'Because sacrificing slow-wave sleep destroys the neural consolidation needed to retain the studied material',
        marks: 1,
        explanation: 'Paragraph 2 explains that curtailing sleep sabotages the neural architecture required to retain what was studied.',
      },
      {
        subNumber: '(vi)',
        question: 'Which metaphor is used in paragraph 1 to describe the hippocampus?',
        questionType: 'mcq',
        options: [
          'A temporary scratchpad for daily experiences',
          'A mechanical clockwork pendulum',
          'An impenetrable fortress wall',
          'A high-voltage electrical transformer',
        ],
        correctIndex: 0,
        correctAnswerText: 'A temporary scratchpad for daily experiences',
        marks: 1,
        explanation: 'Paragraph 1 explicitly calls the hippocampus "a temporary scratchpad for daily experiences".',
      },
    ],
  },
];

const ENGLISH_CASE_BASED_PASSAGES = [
  {
    casePassage: `A survey conducted across 50 urban secondary schools analyzed weekly screen time versus sustained reading durations among Class 11 students. The findings are summarized below:\n\n[STATISTICAL DATA TABLE]\nCategory | Daily Screen Time (hrs) | Weekly Deep Reading (hrs) | Reported Focus Fatigue (%)\nGroup A (Heavy Media Users)   | > 6.0 hrs  | 1.5 hrs  | 78%\nGroup B (Moderate Users)      | 3.0–5.9 hrs| 4.2 hrs  | 42%\nGroup C (Balanced Users)      | < 3.0 hrs  | 8.5 hrs  | 16%\n\nStatistical regression confirmed an inverse correlation (r = -0.74) between non-academic entertainment screen hours and continuous reading stamina. While digital literacy metrics remained high across all three cohorts, comprehension accuracy on complex multi-clause texts deteriorated sharply in cohorts exhibiting elevated focus fatigue.`,
    subQuestions: [
      {
        subNumber: '(i)',
        question: 'What is the correlation coefficient (r) reported between non-academic screen hours and continuous reading stamina?',
        questionType: 'mcq',
        options: [
          'r = -0.74 (Strong inverse correlation)',
          'r = +0.74 (Strong direct correlation)',
          'r = 0.00 (No correlation)',
          'r = -0.16 (Weak correlation)',
        ],
        correctIndex: 0,
        correctAnswerText: 'r = -0.74 (Strong inverse correlation)',
        marks: 1,
        explanation: 'The passage explicitly states an inverse correlation of r = -0.74.',
      },
      {
        subNumber: '(ii)',
        question: 'Based on the data table, what percentage of Heavy Media Users reported focus fatigue?',
        questionType: 'written',
        marks: 1,
        modelAnswer: '78% of Group A (Heavy Media Users) reported focus fatigue.',
      },
      {
        subNumber: '(iii)',
        question: 'Which group demonstrated the highest average weekly deep reading hours?',
        questionType: 'mcq',
        options: [
          'Group C (Balanced Users with 8.5 hours)',
          'Group B (Moderate Users with 4.2 hours)',
          'Group A (Heavy Users with 1.5 hours)',
          'All groups spent equal hours',
        ],
        correctIndex: 0,
        correctAnswerText: 'Group C (Balanced Users with 8.5 hours)',
        marks: 1,
        explanation: 'Group C achieved 8.5 hours weekly compared to 1.5h in Group A and 4.2h in Group B.',
      },
      {
        subNumber: '(iv)',
        question: 'Infer why comprehension accuracy deteriorated in cohorts with elevated focus fatigue despite high digital literacy.',
        questionType: 'written',
        marks: 2,
        modelAnswer: 'Digital literacy measures mechanical navigational skill, whereas parsing complex multi-clause sentences requires sustained neural focus and deep cognitive stamina that are depleted by excessive screen fatigue.',
      },
      {
        subNumber: '(v)',
        question: 'State one strategic pedagogical recommendation derived from the statistical findings.',
        questionType: 'written',
        marks: 2,
        modelAnswer: 'Implementing designated daily non-screen deep reading intervals (< 3 hours entertainment screen time) to rebuild cognitive focus stamina and restore textual comprehension accuracy.',
      },
    ],
  },
  {
    casePassage: `A national energy audit examined rooftop solar photovoltaic (PV) adoption and grid peak-load reduction across four residential zones in 2025–26:\n\n[STATISTICAL DATA TABLE]\nZone | Households Surveyed | Rooftop Solar Adoption (%) | Avg. Monthly Bill Reduction (%) | Peak Grid Stress Drop (%)\nZone I (High-Subsidy Metro)     | 1,200 | 64% | 58% | 39%\nZone II (Tier-2 Industrial)     | 950   | 41% | 44% | 24%\nZone III (Suburban Co-ops)      | 800   | 29% | 31% | 17%\nZone IV (Low-Awareness Semi-Urb)| 1,050 | 11% | 14% | 6%\n\nThe audit revealed that streamlined net-metering approvals and upfront capital subsidies in Zone I accelerated adoption nearly sixfold compared to Zone IV. Furthermore, neighbourhoods integrating community battery storage alongside rooftop panels achieved an additional 18% resilience against evening peak voltage fluctuations.`,
    subQuestions: [
      {
        subNumber: '(i)',
        question: 'Which residential zone recorded the highest percentage reduction in peak grid stress?',
        questionType: 'mcq',
        options: [
          'Zone I (High-Subsidy Metro at 39%)',
          'Zone II (Tier-2 Industrial at 24%)',
          'Zone III (Suburban Co-ops at 17%)',
          'Zone IV (Low-Awareness Semi-Urban at 6%)',
        ],
        correctIndex: 0,
        correctAnswerText: 'Zone I (High-Subsidy Metro at 39%)',
        marks: 1,
        explanation: 'The table shows Zone I achieved a 39% drop in peak grid stress.',
      },
      {
        subNumber: '(ii)',
        question: 'What two policy factors enabled Zone I to achieve nearly sixfold higher adoption than Zone IV?',
        questionType: 'written',
        marks: 2,
        modelAnswer: 'Streamlined net-metering approvals and upfront capital subsidies accelerated rooftop solar adoption in Zone I.',
      },
      {
        subNumber: '(iii)',
        question: 'What was the average monthly electricity bill reduction in Zone II (Tier-2 Industrial)?',
        questionType: 'mcq',
        options: ['58%', '44%', '31%', '14%'],
        correctIndex: 1,
        correctAnswerText: '44%',
        marks: 1,
        explanation: 'Per the data table, Zone II recorded a 44% average monthly bill reduction.',
      },
      {
        subNumber: '(iv)',
        question: 'How did integrating community battery storage enhance neighbourhood energy performance?',
        questionType: 'written',
        marks: 2,
        modelAnswer: 'Community battery storage provided an additional 18% resilience against evening peak voltage fluctuations when solar generation tapers off.',
      },
      {
        subNumber: '(v)',
        question: 'Suggest one targeted intervention to boost solar adoption in Zone IV based on the audit.',
        questionType: 'written',
        marks: 1,
        modelAnswer: 'Launching semi-urban public awareness campaigns coupled with simplified single-window net-metering subsidies.',
      },
    ],
  },
  {
    casePassage: `An adolescent nutritional study evaluated dietary diversity, daily physical activity, and haemoglobin sufficiency among 2,400 senior secondary students across three dietary patterns:\n\n[STATISTICAL DATA TABLE]\nCohort | Ultra-Processed Intake | Daily Outdoor Activity | Micronutrient Sufficiency (%) | Classroom Alertness Score (out of 10)\nCohort Alpha (Whole-Grain & Pulse Rich) | < 10% calories | 65 mins | 88% | 8.7\nCohort Beta (Mixed Convenience Diet)    | 35% calories   | 30 mins | 54% | 6.1\nCohort Gamma (High Ultra-Processed)     | > 60% calories | 12 mins | 23% | 4.2\n\nBiochemical assays demonstrated that students consuming whole grains, seasonal legumes, and iron-rich leafy greens (Cohort Alpha) maintained stable post-lunch glycemic levels and scored 107% higher on sustained classroom alertness than Cohort Gamma.`,
    subQuestions: [
      {
        subNumber: '(i)',
        question: 'Which cohort achieved a Classroom Alertness Score of 8.7 out of 10?',
        questionType: 'mcq',
        options: [
          'Cohort Alpha (Whole-Grain & Pulse Rich)',
          'Cohort Beta (Mixed Convenience Diet)',
          'Cohort Gamma (High Ultra-Processed)',
          'None of the cohorts',
        ],
        correctIndex: 0,
        correctAnswerText: 'Cohort Alpha (Whole-Grain & Pulse Rich)',
        marks: 1,
        explanation: 'The table shows Cohort Alpha achieved 8.7/10 alertness with 88% micronutrient sufficiency.',
      },
      {
        subNumber: '(ii)',
        question: 'What was the micronutrient sufficiency percentage and daily outdoor activity duration for Cohort Gamma?',
        questionType: 'written',
        marks: 1,
        modelAnswer: 'Cohort Gamma recorded 23% micronutrient sufficiency and only 12 minutes of daily outdoor activity.',
      },
      {
        subNumber: '(iii)',
        question: 'What physiological mechanism explained Cohort Alpha’s superior afternoon classroom alertness?',
        questionType: 'written',
        marks: 2,
        modelAnswer: 'Consumption of complex whole grains, legumes, and iron-rich greens maintained stable post-lunch glycemic (blood sugar) levels and prevented micronutrient deficiency.',
      },
      {
        subNumber: '(iv)',
        question: 'What proportion of daily calories came from ultra-processed foods in Cohort Beta?',
        questionType: 'mcq',
        options: ['Less than 10%', '35% of calories', 'More than 60%', '88% of calories'],
        correctIndex: 1,
        correctAnswerText: '35% of calories',
        marks: 1,
        explanation: 'Table row 2 lists 35% calories from ultra-processed intake for Cohort Beta.',
      },
      {
        subNumber: '(v)',
        question: 'Formulate two school canteen policy measures supported by this study.',
        questionType: 'written',
        marks: 2,
        modelAnswer: '1. Replacing ultra-processed snacks with whole-grain and pulse-based meals in school canteens.\n2. Mandating at least 45–60 minutes of daily outdoor physical activity.',
      },
    ],
  },
];

const ENGLISH_NOTE_MAKING_PASSAGES = [
  {
    passage: `The preservation of indigenous agricultural ecosystems has emerged as a frontline defence against catastrophic climate anomalies. Traditional seed varieties, nurtured across generations of agrarian communities, exhibit genetic resistance to soil salinity, drought shocks, and pest infestations. Modern monoculture, while delivering transient yield peaks through chemical fertilizers and synthetic pesticides, strips topsoil of microbial diversity and renders crops vulnerable to pathogen epidemics. Revitalizing ancient crop rotation, organic mulching, and decentralized community seed vaults not only safeguards food sovereignty but also reverses carbon emissions by enriching humus content. Agro-ecological resilience thus represents not nostalgic antiquarianism, but sophisticated, bio-compatible science tailored for planetary survival.`,
    notesModel: `TITLE: INDIGENOUS AGRO-ECOLOGY & PLANETARY RESILIENCE\n\n1. Trad. Seed Var. & Clim. Resilience:\n   1.1 Gen. resist. to salinity & drought\n   1.2 Nurtured thru gen. of agrarian comm.\n   1.3 Nat. shield agst pest shocks\n\n2. Pitfalls of Mod. Monoculture:\n   2.1 Transient peaks via chem. fert. & pest.\n   2.2 Loss of soil microb. diversity\n   2.3 Vuln. to pathogen epidemics\n\n3. Agro-Ecol. Solutions for Food Sovereignty:\n   3.1 Ancient crop rotation & org. mulching\n   3.2 Decentr. comm. seed vaults\n   3.3 Carbon rev. via humus enrich.\n\nKEY TO ABBREVIATIONS:\n- Trad. : Traditional\n- Var.  : Varieties\n- Clim. : Climate\n- Gen.  : Genetic\n- Comm. : Communities\n- Chem. : Chemical`,
    summaryModel: `Indigenous seed varieties offer critical genetic resistance against drought and climate shocks. While modern chemical monoculture depletes topsoil microbes, revitalizing traditional crop rotation, organic mulching, and decentralized seed vaults safeguards food sovereignty and enriches soil carbon, proving essential for long-term ecological survival (44 words).`,
  },
  {
    passage: `Circadian biology governs the internal twenty-four-hour molecular clock present in virtually every nucleated cell of the human body. Synchronized primarily by morning blue-wavelength solar light hitting specialized retinal ganglion cells, the suprachiasmatic nucleus (SCN) in the hypothalamus coordinates hormone secretion, core body temperature, and digestive enzyme synthesis. Modern industrial lifestyles—characterized by artificial nocturnal illumination, erratic meal timings, and trans-meridian shift work—induce "circadian misalignment." Chronic desynchronization between internal peripheral clocks and external environmental cues elevates cortisol levels, impairs insulin sensitivity, and accelerates cardiovascular inflammation. Aligning nutritional intake and sleep-wake cycles with natural photoperiods—a discipline termed chrononutrition—restores metabolic homeostasis and sharpens daytime executive cognition.`,
    notesModel: `TITLE: CIRCADIAN BIOLOGY & METABOLIC HOMEOSTASIS\n\n1. Mechanism of the Circadian Clock:\n   1.1 24-hr mol. clock in nucleated cells\n   1.2 Sync. by morning blue solar light via retina\n   1.3 SCN in hypothalamus reg. hormones, temp. & enz.\n\n2. Causes & Effects of Circadian Misalignment:\n   2.1 Artif. night light, erratic meals & shift work\n   2.2 Elev. cortisol & impaired insulin sens.\n   2.3 Accel. cardiovasc. inflammation\n\n3. Chrononutrition & Restoration:\n   3.1 Aligning meals & sleep with nat. photoperiods\n   3.2 Restores metab. homeostasis & exec. cognition\n\nKEY TO ABBREVIATIONS:\n- Mol.   : Molecular\n- Sync.  : Synchronized\n- Reg.   : Regulates\n- Temp.  : Temperature\n- Enz.   : Enzymes\n- Metab. : Metabolic`,
    summaryModel: `The hypothalamic suprachiasmatic nucleus synchronizes cellular twenty-four-hour circadian clocks with morning sunlight to regulate hormones, temperature, and digestion. Artificial night lighting and irregular meals cause circadian misalignment, impairing insulin sensitivity and raising inflammation. Practicing chrononutrition by aligning meals and sleep with natural daylight restores metabolic health and cognition (48 words).`,
  },
  {
    passage: `Himalayan glaciers, often revered as the "Water Towers of Asia," sustain the perennial flow of the Indus, Ganga, and Brahmaputra river basins, supporting the agrarian livelihoods of nearly two billion people. However, satellite altimetry over the past three decades indicates an alarming acceleration in glacial mass loss driven by atmospheric warming and the deposition of anthropogenic black carbon—soot particles emitted by incomplete fossil-fuel and biomass combustion. When black carbon settles on pristine alpine snowpacks, it drastically lowers surface albedo, causing the ice to absorb solar radiation rather than reflect it back into space. Consequently, supra-glacial lakes expand rapidly behind fragile moraine dams, heightening the hazard of Glacial Lake Outburst Floods (GLOFs) in downstream Himalayan valleys. Mitigating this cryospheric crisis demands regional clean-energy transitions, early-warning hydrological telemetry, and trans-boundary watershed governance.`,
    notesModel: `TITLE: HIMALAYAN CRYOSPHERE & GLACIAL HYDROLOGY\n\n1. Strategic Importance of Him. Glaciers:\n   1.1 Termed "Water Towers of Asia"\n   1.2 Sustain Indus, Ganga & Brahmaputra basins\n   1.3 Support agrarian livelihoods of ~2 bn people\n\n2. Drivers of Accel. Glacial Melt:\n   2.1 Atmos. warming & black carbon (soot) dep.\n   2.2 Reduced snow surface albedo -> higher solar abs.\n   2.3 Expansion of supra-glacial lakes & GLOF hazards\n\n3. Mitigation & Adaptation Strategies:\n   3.1 Reg. clean-energy transitions\n   3.2 Early-warning hydrol. telemetry\n   3.3 Trans-boundary watershed gov.\n\nKEY TO ABBREVIATIONS:\n- Him.    : Himalayan\n- Accel.  : Accelerated\n- Atmos.  : Atmospheric\n- Dep.    : Deposition\n- Hydrol. : Hydrological\n- Gov.    : Governance`,
    summaryModel: `Himalayan glaciers sustain major Asian rivers and two billion livelihoods, but atmospheric warming and black carbon soot are accelerating glacial melt by reducing snow albedo. This rapid melting expands fragile glacial lakes, increasing catastrophic flood risks. Addressing this crisis requires clean-energy transitions, hydrological early-warning systems, and trans-boundary watershed cooperation (49 words).`,
  },
];

const ENGLISH_GRAMMAR_BANK: Record<
  string,
  Array<{
    prompt: string;
    options: [string, string, string, string];
    correct: number;
    ans: string;
    exp: string;
    label: string;
  }>
> = {
  tenses: [
    {
      prompt: 'Fill in the blank with the correct tense form:\n"By the time the rescue team reached the summit, the snowstorm _______ (intensify) dangerously."',
      options: ['had intensified', 'has intensified', 'intensifies', 'was intensifying'],
      correct: 0,
      ans: 'had intensified',
      exp: "Past perfect tense 'had intensified' is required because the action preceded another past event.",
      label: 'Grammar — Tenses',
    },
    {
      prompt: 'Fill in the blank with the appropriate tense form:\n"The archaeological expedition _______ (excavate) the burial mound for three weeks before discovering the royal seal."',
      options: ['is excavating', 'had been excavating', 'excavates', 'has excavated'],
      correct: 1,
      ans: 'had been excavating',
      exp: "Past perfect continuous 'had been excavating' shows an ongoing duration prior to a defined past event.",
      label: 'Grammar — Tenses',
    },
    {
      prompt: 'Choose the correct verb form to complete the sentence:\n"By next December, our school’s solar micro-grid _______ (generate) clean electricity for five consecutive years."',
      options: ['will have been generating', 'is generating', 'generated', 'had generated'],
      correct: 0,
      ans: 'will have been generating',
      exp: "Future perfect continuous 'will have been generating' denotes an ongoing action reaching a future milestone.",
      label: 'Grammar — Tenses',
    },
    {
      prompt: 'Select the correct tense form:\n"Neither the principal investigator nor her research assistants _______ (submit) the final laboratory audit yet."',
      options: ['has submitted', 'have submitted', 'submits', 'is submitting'],
      correct: 1,
      ans: 'have submitted',
      exp: "With 'neither...nor', the verb agrees with the nearer plural subject 'assistants' in present perfect ('have submitted').",
      label: 'Grammar — Tenses',
    },
    {
      prompt: 'Complete the sentence with the correct tense:\n"Look at those dark cumulonimbus clouds! It _______ (pour) heavily within a few minutes."',
      options: ['poured', 'had poured', 'is going to pour', 'pours'],
      correct: 2,
      ans: 'is going to pour',
      exp: "'Is going to pour' expresses a future prediction based on immediate visible evidence.",
      label: 'Grammar — Tenses',
    },
    {
      prompt: 'Choose the grammatically accurate verb form:\n"Ever since the new library wing opened, student reading hours _______ (increase) steadily."',
      options: ['increased', 'have increased', 'had increased', 'will increase'],
      correct: 1,
      ans: 'have increased',
      exp: "After 'ever since + past clause', the main clause takes the present perfect tense 'have increased'.",
      label: 'Grammar — Tenses',
    },
  ],
  clauses: [
    {
      prompt: 'Complete the sentence with the appropriate relative clause marker:\n"The professor _______ research on quantum entanglement won international acclaim will deliver the plenary lecture."',
      options: ['whose', 'whom', 'which', 'who'],
      correct: 0,
      ans: 'whose',
      exp: "Possessive relative pronoun 'whose' is needed to qualify 'research'.",
      label: 'Grammar — Clauses',
    },
    {
      prompt: 'Select the correct subordinate clause connector to complete the statement:\n"The mountain pass was declared inaccessible _______ the torrential blizzards triggered multiple landslides."',
      options: ['although', 'because', 'unless', 'even if'],
      correct: 1,
      ans: 'because',
      exp: "Adverbial clause of reason requires 'because' to connect cause and effect.",
      label: 'Grammar — Clauses',
    },
    {
      prompt: 'Identify the correct conditional clause completion:\n"Had the navigators calibrated the barometer earlier, they _______ the approaching cyclone in time."',
      options: ['will detect', 'would have detected', 'detected', 'would detect'],
      correct: 1,
      ans: 'would have detected',
      exp: "Type-3 inverted conditional ('Had + subject + V3') requires 'would have + past participle' in the main clause.",
      label: 'Grammar — Clauses',
    },
    {
      prompt: 'Choose the appropriate noun clause connector:\n"_______ the ancient Harappan script remained undeciphered for over a century continues to intrigue epigraphists."',
      options: ['Why', 'Which', 'Whom', 'Unless'],
      correct: 0,
      ans: 'Why',
      exp: "Nominal clause functioning as the subject of 'continues' requires 'Why' (or 'That').",
      label: 'Grammar — Clauses',
    },
    {
      prompt: 'Complete the sentence with the correct adverbial clause marker of concession:\n"_______ the expedition faced sub-zero gales on the ridge, every climber reached the base camp safely."',
      options: ['Because', 'Although', 'Unless', 'So that'],
      correct: 1,
      ans: 'Although',
      exp: "'Although' introduces an adverbial clause of concession contrasting hardship with safe arrival.",
      label: 'Grammar — Clauses',
    },
    {
      prompt: 'Select the correct relative pronoun:\n"The archival manuscript _______ the curator restored last month dates back to the sixteenth century."',
      options: ['who', 'whom', 'that', 'whose'],
      correct: 2,
      ans: 'that',
      exp: "Restrictive relative clause referring to an inanimate object ('manuscript') uses 'that' or 'which'.",
      label: 'Grammar — Clauses',
    },
  ],
  reordering: [
    {
      prompt: 'Rearrange the following words/phrases into a grammatically correct sentence:\n"sustainable development / requires / of natural resources / equitable distribution / and careful stewardship"',
      options: [
        'Sustainable development requires equitable distribution and careful stewardship of natural resources.',
        'Of natural resources equitable distribution and careful stewardship sustainable development requires.',
        'Equitable distribution requires sustainable development and careful stewardship of natural resources.',
        'Careful stewardship requires sustainable development of natural resources and equitable distribution.',
      ],
      correct: 0,
      ans: 'Sustainable development requires equitable distribution and careful stewardship of natural resources.',
      exp: 'Follows standard S-V-O syntax with balanced coordinate noun phrase object.',
      label: 'Grammar — Reordering of Sentences',
    },
    {
      prompt: 'Rearrange the following jumbled segments into a coherent sentence:\n"intellectual humility / the hallmark / is / of / genuine scientific inquiry / and open-minded scepticism"',
      options: [
        'Genuine scientific inquiry is open-minded scepticism and the hallmark of intellectual humility.',
        'The hallmark of genuine scientific inquiry is intellectual humility and open-minded scepticism.',
        'Of genuine scientific inquiry the hallmark intellectual humility is and open-minded scepticism.',
        'Open-minded scepticism requires the hallmark of genuine scientific inquiry is intellectual humility.',
      ],
      correct: 1,
      ans: 'The hallmark of genuine scientific inquiry is intellectual humility and open-minded scepticism.',
      exp: 'Subject noun phrase ("The hallmark of genuine scientific inquiry") + copula ("is") + compound complement.',
      label: 'Grammar — Reordering of Sentences',
    },
    {
      prompt: 'Unscramble the words/phrases to form a meaningful statement:\n"biodiversity corridors / fragmented habitats / across / enable / seasonal migration / of endangered wildlife"',
      options: [
        'Fragmented habitats enable biodiversity corridors across seasonal migration of endangered wildlife.',
        'Of endangered wildlife seasonal migration enable biodiversity corridors across fragmented habitats.',
        'Biodiversity corridors across fragmented habitats enable seasonal migration of endangered wildlife.',
        'Seasonal migration across endangered wildlife enable biodiversity corridors of fragmented habitats.',
      ],
      correct: 2,
      ans: 'Biodiversity corridors across fragmented habitats enable seasonal migration of endangered wildlife.',
      exp: 'Subject ("Biodiversity corridors across fragmented habitats") + verb ("enable") + object ("seasonal migration of endangered wildlife").',
      label: 'Grammar — Reordering of Sentences',
    },
    {
      prompt: 'Rearrange the following segments into a grammatically accurate sentence:\n"critical thinking / empowers / misinformation / to distinguish / young citizens / from verified evidence"',
      options: [
        'Critical thinking empowers young citizens to distinguish misinformation from verified evidence.',
        'Young citizens empowers critical thinking from verified evidence to distinguish misinformation.',
        'To distinguish misinformation empowers critical thinking young citizens from verified evidence.',
        'Verified evidence empowers misinformation to distinguish young citizens from critical thinking.',
      ],
      correct: 0,
      ans: 'Critical thinking empowers young citizens to distinguish misinformation from verified evidence.',
      exp: 'Follows Subject + Verb + Object + Infinitive complement structure.',
      label: 'Grammar — Reordering of Sentences',
    },
  ],
  transformation: [
    {
      prompt: 'Transform into a negative sentence without changing its meaning:\n"As soon as the bell rang, the students vacated the lecture hall."',
      options: [
        'No sooner did the bell ring than the students vacated the lecture hall.',
        'The students did not vacate the hall when the bell rang.',
        'Hardly had the bell rung when the students did not leave.',
        'The bell did not ring until all students vacated.',
      ],
      correct: 0,
      ans: 'No sooner did the bell ring than the students vacated the lecture hall.',
      exp: "'As soon as' converts into 'No sooner did ... than' for negative transformation.",
      label: 'Grammar — Transformation of Sentences',
    },
    {
      prompt: 'Transform the sentence by removing "too" without altering its meaning:\n"The manuscript was too fragile to be handled without protective gloves."',
      options: [
        'The manuscript was very fragile and could be handled without gloves.',
        'The manuscript was so fragile that it could not be handled without protective gloves.',
        'Unless the manuscript was fragile, it was handled with gloves.',
        'The manuscript was fragile enough to be handled without protective gloves.',
      ],
      correct: 1,
      ans: 'The manuscript was so fragile that it could not be handled without protective gloves.',
      exp: "'Too + adj + to-infinitive' transforms into 'so + adj + that + pronoun + could not + verb'.",
      label: 'Grammar — Transformation of Sentences',
    },
    {
      prompt: 'Convert the following complex sentence into a simple sentence:\n"Although she confronted severe financial constraints, she completed her doctoral research with distinction."',
      options: [
        'She confronted severe financial constraints and so she completed her research.',
        'In spite of confronting severe financial constraints, she completed her doctoral research with distinction.',
        'She completed her doctoral research because of severe financial constraints.',
        'Severe financial constraints prevented her from completing her doctoral research.',
      ],
      correct: 1,
      ans: 'In spite of confronting severe financial constraints, she completed her doctoral research with distinction.',
      exp: "Replaces the subordinate clause 'Although she confronted...' with the prepositional phrase 'In spite of confronting...'.",
      label: 'Grammar — Transformation of Sentences',
    },
    {
      prompt: 'Change the degree of comparison to Comparative without changing the meaning:\n"Platinum is one of the most corrosion-resistant metals used in laboratory electrodes."',
      options: [
        'No other metal is as corrosion-resistant as platinum.',
        'Platinum is more corrosion-resistant than most other metals used in laboratory electrodes.',
        'Platinum is less corrosion-resistant than other laboratory metals.',
        'All other metals are more corrosion-resistant than platinum.',
      ],
      correct: 1,
      ans: 'Platinum is more corrosion-resistant than most other metals used in laboratory electrodes.',
      exp: "'One of the most...' in superlative transforms to 'more ... than most other ...' in comparative degree.",
      label: 'Grammar — Transformation of Sentences',
    },
  ],
  determiners: [
    {
      prompt: 'Fill in the blank with the correct determiner:\n"Only _______ delegates from the regional conference voted in favour of the resolution; the majority abstained."',
      options: ['a little', 'a few', 'much', 'every'],
      correct: 1,
      ans: 'a few',
      exp: "'A few' is used with plural countable nouns ('delegates') to denote a small positive number.",
      label: 'Grammar — Determiners',
    },
    {
      prompt: 'Choose the appropriate determiner:\n"There is hardly _______ potable water left in the expedition’s reserve canteens."',
      options: ['some', 'many', 'any', 'few'],
      correct: 2,
      ans: 'any',
      exp: "With semi-negative adverbs like 'hardly', 'any' is used before uncountable nouns ('water').",
      label: 'Grammar — Determiners',
    },
  ],
  modals: [
    {
      prompt: 'Select the correct modal auxiliary expressing moral obligation:\n"Citizens _______ preserve constitutional fraternity and safeguard public heritage monuments."',
      options: ['might', 'ought to', 'dare not', 'would'],
      correct: 1,
      ans: 'ought to',
      exp: "'Ought to' expresses moral duty and civic obligation.",
      label: 'Grammar — Modals',
    },
    {
      prompt: 'Fill in the blank with the appropriate modal of logical deduction:\n"The laboratory lights are switched off and the door is bolted; the researchers _______ have left for the seminar."',
      options: ['can', 'must', 'need not', 'shall'],
      correct: 1,
      ans: 'must',
      exp: "'Must have + V3' expresses strong logical deduction based on present evidence.",
      label: 'Grammar — Modals',
    },
  ],
  reported_speech: [
    {
      prompt: 'Convert into indirect (reported) speech:\nThe astronomer said to the students, "Have you observed the transit of Mercury through the solar filter?"',
      options: [
        'The astronomer asked the students whether they had observed the transit of Mercury through the solar filter.',
        'The astronomer told the students that they have observed the transit of Mercury.',
        'The astronomer asked the students did they observe the transit of Mercury.',
        'The astronomer inquired whether the students had been observing Mercury tomorrow.',
      ],
      correct: 0,
      ans: 'The astronomer asked the students whether they had observed the transit of Mercury through the solar filter.',
      exp: 'Yes/No interrogative in present perfect shifts to past perfect with "whether/if".',
      label: 'Grammar — Reported Speech',
    },
    {
      prompt: 'Choose the correct reported speech form:\nMeera said, "I will submit my environmental project prototype tomorrow."',
      options: [
        'Meera said that she will submit her environmental project prototype tomorrow.',
        'Meera said that she would submit her environmental project prototype the following day.',
        'Meera told that I would submit my prototype the next day.',
        'Meera exclaimed that she had submitted her prototype the previous day.',
      ],
      correct: 1,
      ans: 'Meera said that she would submit her environmental project prototype the following day.',
      exp: "'Will' shifts to 'would' and 'tomorrow' shifts to 'the following day'.",
      label: 'Grammar — Reported Speech',
    },
  ],
  active_passive: [
    {
      prompt: 'Convert into the Passive Voice:\n"The editorial committee is reviewing all shortlisted research papers this afternoon."',
      options: [
        'All shortlisted research papers are being reviewed by the editorial committee this afternoon.',
        'All shortlisted research papers were reviewed by the editorial committee this afternoon.',
        'All shortlisted research papers have been reviewed by the editorial committee.',
        'The editorial committee has been reviewing all shortlisted research papers.',
      ],
      correct: 0,
      ans: 'All shortlisted research papers are being reviewed by the editorial committee this afternoon.',
      exp: 'Present continuous active ("is reviewing") converts to "are being reviewed" in passive voice.',
      label: 'Grammar — Active & Passive Voice',
    },
    {
      prompt: 'Change from Passive to Active Voice:\n"By whom was this exquisite bronze sculpture cast during the Chola dynasty?"',
      options: [
        'Who cast this exquisite bronze sculpture during the Chola dynasty?',
        'Whom did cast this exquisite bronze sculpture during the Chola dynasty?',
        'Who had been casting this exquisite bronze sculpture?',
        'Who is casting this exquisite bronze sculpture during the Chola dynasty?',
      ],
      correct: 0,
      ans: 'Who cast this exquisite bronze sculpture during the Chola dynasty?',
      exp: "'By whom was ... cast' (simple past passive) converts to 'Who cast ...' in simple past active.",
      label: 'Grammar — Active & Passive Voice',
    },
  ],
};

const ENGLISH_WRITING_BANK: Record<
  string,
  Array<{
    question: string;
    modelAnswer: string;
    explanation: string;
    label: string;
  }>
> = {
  classified_advertisement: [
    {
      question:
        'You are Principal, The Abhinav School, New Delhi. Draft a classified advertisement for the "SITUATION VACANT" column of a national newspaper inviting applications for the post of PGT English. State required qualifications, minimum teaching experience, and contact protocol in not more than 50 words.\n\nOR\n\nYou wish to sell your family ancestral library collection containing rare first-edition literature volumes. Draft a classified advertisement for the "FOR SALE" column of The Hindu in not more than 50 words.\n[Format: 1 Mark | Content: 1 Mark | Expression: 1 Mark]',
      modelAnswer: `SITUATION VACANT\n\nWANTED PGT English for The Abhinav School, Delhi. Candidate must possess M.A. (English) with B.Ed., minimum 5 years teaching experience in CBSE senior secondary classes, and excellent communicative command. Attractive pay scale per CBSE 7th Pay Commission. Send resume within 10 days to Principal, The Abhinav School, Rohini, Delhi (principal@theabhinavschool.edu.in).`,
      explanation: 'Box enclosure, uppercase heading, crisp telegraphic style, no complete narrative sentences.',
      label: 'Creative Writing — Classified Advertisements',
    },
    {
      question:
        'You are Dr. Vikramaditya Sen, Director of NexGen Robotics Lab, Bengaluru. Draft a classified advertisement for the "TO LET" column offering a 2,400 sq. ft. commercial office floor in Indiranagar with 24×7 power backup and metro connectivity (max 50 words).\n\nOR\n\nWhile travelling on the Delhi Metro Yellow Line, you accidentally left behind a black leather portfolio containing your original Class 10 certificates and research notes. Draft a classified advertisement for the "LOST AND FOUND" column of a local daily in not more than 50 words.\n[Format: 1 Mark | Content: 1 Mark | Expression: 1 Mark]',
      modelAnswer: `LOST AND FOUND\n\nLOST a black leather portfolio containing original CBSE Class 10 mark sheet, certificates, and handwritten physics notes in Delhi Metro Yellow Line between Vishwavidyalaya and Rajiv Chowk on 14th March around 10:30 AM. Finder will be suitably rewarded. Please contact: Rohan Verma, 9811XXXXXX or return to Station Controller, Rajiv Chowk.`,
      explanation: 'Box enclosure, concise phrases specifying exact item, location, date/time, reward, and contact details.',
      label: 'Creative Writing — Classified Advertisements',
    },
    {
      question:
        'You are Sunita Rao, an alumnus relocating to Munich for higher studies. Draft a classified advertisement under "HOUSEHOLD GOODS FOR SALE" to sell your sparingly used acoustic piano, study workstation, and solar inverter in not more than 50 words.\n\nOR\n\nYour institute, Academy of Classical Performing Arts, Jaipur, is launching a summer workshop in Kathak and Hindustani Vocal Music. Draft a classified notice under "EDUCATIONAL / COACHING" in not more than 50 words.\n[Format: 1 Mark | Content: 1 Mark | Expression: 1 Mark]',
      modelAnswer: `FOR SALE — HOUSEHOLD GOODS\n\nAVAILABLE for immediate sale: Yamaha upright acoustic piano (2023 model, mint condition), ergonomic solid-teak study workstation, and 2kVA luminous solar hybrid inverter. Owner relocating abroad next week. Reasonable negotiable prices for genuine buyers. Inspection between 4 PM and 7 PM. Contact: Sunita Rao, C-42 Vasant Kunj, New Delhi, Ph: 9810XXXXXX.`,
      explanation: 'Box layout, clear heading, item specifications, condition, reason for sale, and contact details.',
      label: 'Creative Writing — Classified Advertisements',
    },
  ],
  poster_writing: [
    {
      question:
        'Design an eye-catching poster on behalf of Delhi Traffic Police to create public awareness against the menace of underage driving and reckless road rage (maximum 50 words).\n\nOR\n\nYour school environmental club is organizing a "Rainwater Harvesting & Ground Water Recharging" drive. Design an inspiring poster promoting water conservation in not more than 50 words.\n[Format: 1 Mark | Content: 1 Mark | Expression: 1 Mark]',
      modelAnswer: `[BOX ENCLOSURE]\nSPEED THRILLS BUT KILLS! — SAY NO TO UNDERAGE DRIVING!\n\nKey Hazards:\n• Life at stake in microseconds\n• Heavy legal penalties & vehicle impoundment\n• Parents held legally accountable under Motor Vehicles Act\n\nREMEMBER: A driving license is earned through maturity, not entitlement!\nIssued in Public Interest by: Delhi Traffic Police`,
      explanation: 'Box layout, catchy slogan, visual proportionality, issuing authority name at bottom.',
      label: 'Creative Writing — Poster Writing',
    },
    {
      question:
        'Design an impactful public-awareness poster on behalf of the National Cyber Crime Reporting Portal warning citizens and students against "Digital Arrest Scams, Phishing Links & OTP Fraud" in not more than 50 words.\n\nOR\n\nAs Secretary of the Literary Society of The Abhinav School, design a vibrant poster announcing the Annual Inter-School Book Fair & Author Conclave "LIT-FEST 2026" (maximum 50 words).\n[Format: 1 Mark | Content: 1 Mark | Expression: 1 Mark]',
      modelAnswer: `[BOX ENCLOSURE]\nTHINK BEFORE YOU CLICK! — GUARD AGAINST CYBER FRAUD!\n\n• Law enforcement NEVER conducts "Digital Arrests" over video calls!\n• Never share OTPs, UPI PINs, or click unverified KYC links.\n• Report cyber financial fraud immediately at Helpline 1930 or cybercrime.gov.in\n\nSTAY ALERT • STAY CYBER SAFE!\nIssued in Public Interest by: National Cyber Security Cell`,
      explanation: 'Box enclosure, bold headline, bulleted actionable warnings, helpline info, and issuing authority.',
      label: 'Creative Writing — Poster Writing',
    },
    {
      question:
        'Draft a visually compelling poster on behalf of the Ministry of Environment & Forests urging citizens to "Eliminate Single-Use Plastics and Adopt Biodegradable Alternatives" in not more than 50 words.\n\nOR\n\nDesign an awareness poster for the Red Cross Society encouraging healthy young adults to participate in a "Voluntary Blood & Stem-Cell Donation Camp" (maximum 50 words).\n[Format: 1 Mark | Content: 1 Mark | Expression: 1 Mark]',
      modelAnswer: `[BOX ENCLOSURE]\nREFUSE SINGLE-USE PLASTIC TODAY — SAVE OUR OCEANS & SOIL TOMORROW!\n\n• One plastic bag takes 500+ years to degrade\n• Carry cloth/jute bags & steel water bottles\n• Segregate dry waste at source\n\nBE PART OF THE SOLUTION, NOT THE POLLUTION!\nIssued in Public Interest by: Ministry of Environment & Forests`,
      explanation: 'Box enclosure, memorable slogan, key ecological facts, call to action, and issuing authority.',
      label: 'Creative Writing — Poster Writing',
    },
  ],
  speech_writing: [
    {
      question:
        'You are Aarav/Ananya, Head Boy/Head Girl of The Abhinav School. Write a persuasive speech in 120–150 words to be delivered in the morning assembly on the topic: "Cultivating Digital Wellbeing: Reclaiming Focus and Mental Health in a Hyper-Connected World".\n\nOR\n\nDeliver a speech in 120–150 words addressing your peers on: "The Crucial Role of Secondary School Students in Environmental Decarbonization and Waste Segregation".\n[Format: 1 Mark | Content: 2 Marks | Expression: 2 Marks]',
      modelAnswer: `Respected Principal, esteemed teachers, and my fellow students,\nGood morning to one and all.\n\nToday, I stand before you to address an invisible crisis that silently erodes our intellectual vitality: digital addiction. In our relentless quest for digital validation and algorithmic dopamine, we have inadvertently traded our attention spans for endless notifications. We check our phones over a hundred times a day, fracturing the deep focus required to comprehend complex ideas, read substantive literature, and form genuine interpersonal connections.\n\nDigital wellbeing does not demand that we abandon modern technology; rather, it demands that we master it. Let us declare screen-free study sanctuaries, cultivate evening reading rituals, and prioritize face-to-face dialogues over mediated digital chats. By reclaiming our time, we reclaim our cognitive agency.\n\nThank you!`,
      explanation: 'Formal salutation, problem exposition, constructive recommendations, inspiring formal sign-off.',
      label: 'Creative Writing — Speech Writing',
    },
    {
      question:
        'You are Kabir/Kavya, President of the Science & Innovation Club at The Abhinav School. Write a morning assembly speech in 120–150 words on the topic: "Scientific Temperament vs Superstition: Building a Rational 21st-Century Society".\n\nOR\n\nWrite a speech in 120–150 words to be delivered on National Sports Day on: "Why Physical Resilience and Team Sports Are Just as Vital as Academic Excellence".\n[Format: 1 Mark | Content: 2 Marks | Expression: 2 Marks]',
      modelAnswer: `Respected Principal, learned faculty members, and my dear friends,\nA very good morning to everyone.\n\nToday, I wish to speak on a constitutional duty enshrined in Article 51A(h) of our Republic: cultivating scientific temperament, humanism, and the spirit of inquiry. Despite launching interplanetary probes and decoding the human genome, sections of society still fall prey to unverified superstitions and pseudoscientific rumours.\n\nScientific temperament is not confined to physics or chemistry laboratories; it is a disciplined habit of mind that demands empirical evidence before accepting any claim. Whenever we question misinformation, verify facts, and embrace reasoned debate, we honour the true spirit of science. Let us pledge to be torchbearers of rationality, critical inquiry, and evidence-based empathy.\n\nThank you and Jai Hind!`,
      explanation: 'Engaging opening, constitutional/thematic depth, practical student application, formal conclusion.',
      label: 'Creative Writing — Speech Writing',
    },
    {
      question:
        'You are Devika/Devansh, Cultural Secretary of The Abhinav School. Write a speech in 120–150 words for International Mother Language Day on: "Preserving India’s Linguistic Diversity and Indigenous Folk Literature".\n\nOR\n\nWrite a persuasive speech in 120–150 words on: "Empathy Towards Senior Citizens: Bridging the Generational Divide in Modern Nuclear Families".\n[Format: 1 Mark | Content: 2 Marks | Expression: 2 Marks]',
      modelAnswer: `Respected Principal, worthy teachers, and my dear schoolmates,\nWarm greetings to all.\n\nOn this special morning, I invite you to reflect on the silent pillars of our homes: our grandparents and senior citizens. As modern urban families transition into fast-paced nuclear households, the elderly often experience profound emotional isolation despite living under the same roof.\n\nOur elders are living libraries of resilience, cultural wisdom, and unconditional affection. Bridging the generational divide does not require grand gestures; it begins with setting aside our smartphones for thirty minutes each evening to listen to their life stories, assisting them patiently with digital tools, and valuing their counsel. Let us ensure that progress never comes at the cost of filial warmth.\n\nThank you!`,
      explanation: 'Warm salutation, empathetic thematic development, concrete actionable steps, formal sign-off.',
      label: 'Creative Writing — Speech Writing',
    },
  ],
  debate_writing: [
    {
      question:
        '"Artificial Intelligence in Academic Settings Will Undermine Original Thinking and Intellectual Integrity." Write a debate in 120–150 words presenting your arguments either FOR or AGAINST the motion.\n\nOR\n\n"Standardized Pen-and-Paper Examinations Are an Inadequate Metric for Evaluating Real 21st-Century Competencies." Write a debate speech in 120–150 words either FOR or AGAINST the motion.\n[Format: 1 Mark | Content: 2 Marks | Expression: 2 Marks]',
      modelAnswer: `Respected Chairperson, worthy judges, members of the jury, and my esteemed opponents,\n\nI stand before you today firmly FOR the motion that "Artificial Intelligence in Academic Settings Will Undermine Original Thinking and Intellectual Integrity."\n\nWhen intellectual labor is outsourced to generative algorithms, the human brain is denied the vital friction necessary to forge new neural pathways. Learning is not merely about producing a polished end-product; it is fundamentally about the arduous journey of wrestling with concepts, making erroneous drafts, and synthesizing personal conviction through effort. Automated tools turn students into passive consumers of machine-generated prose rather than fearless thinkers. For true intellectual integrity, we must prioritize human cognitive struggle over automated convenience.\n\nThank you!`,
      explanation: 'Formal opening, unambiguous stance declaration, logical evidence points, powerful rebuttal, formal conclusion.',
      label: 'Creative Writing — Debate Writing',
    },
    {
      question:
        '"Space Exploration Budgets Should Be Redirected Entirely Toward Solving Terrestrial Poverty and Climate Change." Write a debate in 120–150 words expressing your views either FOR or AGAINST the motion.\n\nOR\n\n"Mandatory Community Service Should Be a Prerequisite for Awarding Senior Secondary School Certificates." Write a debate in 120–150 words either FOR or AGAINST the motion.\n[Format: 1 Mark | Content: 2 Marks | Expression: 2 Marks]',
      modelAnswer: `Respected Chairperson, honourable judges, and my worthy opponents,\n\nI stand resolutely AGAINST the motion that "Space Exploration Budgets Should Be Redirected Entirely Toward Solving Terrestrial Poverty and Climate Change."\n\nMy opponents present a false dichotomy between cosmic exploration and earthly welfare. In reality, space research is the single most powerful instrument for climate and agricultural stewardship! Without earth-observation satellites, meteorologists could not track cyclones to evacuate millions of coastal villagers, nor could hydrologists monitor Himalayan glacial melt or soil moisture droughts. Furthermore, space budgets represent less than half a percent of national expenditure while catalysing breakthroughs in solar cells, water purification, and telemedicine. Cutting space science would blind humanity to the very planetary crises we seek to solve!\n\nThank you!`,
      explanation: 'Clear stance declaration, refutation of opponent premise, concrete scientific examples, persuasive closing.',
      label: 'Creative Writing — Debate Writing',
    },
    {
      question:
        '"Cashless Digital Economies Compromise Individual Financial Privacy More Than They Enhance Convenience." Write a debate speech in 120–150 words either FOR or AGAINST the motion.\n\nOR\n\n"Electric Vehicles Alone Cannot Solve Urban Air Pollution Without a Radical Overhaul of Public Transit." Write a debate in 120–150 words either FOR or AGAINST the motion.\n[Format: 1 Mark | Content: 2 Marks | Expression: 2 Marks]',
      modelAnswer: `Respected Chairperson, learned judges, and my fellow debaters,\n\nI speak firmly FOR the motion that "Electric Vehicles Alone Cannot Solve Urban Air Pollution Without a Radical Overhaul of Public Transit."\n\nReplacing two million private internal-combustion cars with two million private electric cars merely substitutes tailpipe exhaust with severe traffic gridlock, non-exhaust tyre particulate emissions, and lithium-mining footprints. In regions where electricity grids still rely heavily on coal thermal plants, private EVs simply shift emissions from city avenues to power-plant chimneys. A single electrified metro train or electric bus replaces sixty private cars per trip while democratizing mobility for every economic class. True urban decarbonization demands high-frequency public transit, pedestrian infrastructure, and cycling lanes—not merely greener private luxury.\n\nThank you!`,
      explanation: 'Formal address, clear stance, analytical argument with rebuttal of naive assumptions, strong conclusion.',
      label: 'Creative Writing — Debate Writing',
    },
  ],
};

const ENGLISH_POETRY_EXTRACTS = [
  {
    poem: 'The Laburnum Top',
    casePassage: `[EXTRACT]\n"The Laburnum top is silent, quite still\nIn the afternoon yellow September sunlight,\nA few leaves yellowing, all its seeds fallen.\nTill the goldfinch comes, with a twitching chirrup\nA suddenness, a startlement, at a branch end.\nThen sleek as a lizard, and alert, and abrupt,\nShe enters the thickness, and a machine starts up\nOf chitterings, and a tremor of wings, and trillings —\nThe whole tree trembles and thrills."`,
    subQuestions: [
      {
        subNumber: '(i)',
        question: 'What poetic device is employed in the phrase "sleek as a lizard"?',
        questionType: 'mcq',
        options: ['Simile', 'Metaphor', 'Personification', 'Hyperbole'],
        correctIndex: 0,
        correctAnswerText: 'Simile',
        marks: 1,
        explanation: "Comparison using 'as' is a Simile.",
      },
      {
        subNumber: '(ii)',
        question: 'What does the metaphor "machine starts up" signify in the context of the poem?',
        questionType: 'written',
        marks: 1,
        modelAnswer: 'It signifies the sudden burst of noise, energy, and excitement produced by the hungry nestlings upon their mother’s arrival.',
      },
      {
        subNumber: '(iii)',
        question: 'Identify the month and season evoked in the opening lines:',
        questionType: 'mcq',
        options: ['September afternoon in autumn', 'March morning in spring', 'July monsoon afternoon', 'December winter evening'],
        correctIndex: 0,
        correctAnswerText: 'September afternoon in autumn',
        marks: 1,
        explanation: 'Text explicitly states "September sunlight, a few leaves yellowing".',
      },
    ],
  },
  {
    poem: 'A Photograph',
    casePassage: `[EXTRACT]\n"The cardboard shows me how it was\nWhen the two girl cousins went paddling,\nEach one holding one of my mother’s hands,\nAnd she the big girl — some twelve years or so.\nAll three stood still to smile through their hair\nAt the uncle with the camera. A sweet face,\nMy mother’s, that was before I was born.\nAnd the sea, which appears to have changed less,\nWashed their terribly transient feet."`,
    subQuestions: [
      {
        subNumber: '(i)',
        question: 'What does the word "cardboard" denote in the opening line of the extract?',
        questionType: 'mcq',
        options: [
          'A packing box for beach equipment',
          'The framed vintage photograph of the poet’s mother and her cousins',
          'A postcard sent from a foreign country',
          'A canvas painting of the sea',
        ],
        correctIndex: 1,
        correctAnswerText: 'The framed vintage photograph of the poet’s mother and her cousins',
        marks: 1,
        explanation: "'Cardboard' refers to the stiff mount of the old photograph.",
      },
      {
        subNumber: '(ii)',
        question: 'Explain the contrast implied in the line "Washed their terribly transient feet" (Transferred Epithet & Alliteration).',
        questionType: 'written',
        marks: 1,
        modelAnswer: 'It contrasts the eternal, unchanging permanence of the sea with the fragile, fleeting mortality of human life ("transient feet").',
      },
      {
        subNumber: '(iii)',
        question: 'Who was "the big girl" referred to in the extract, and how old was she?',
        questionType: 'mcq',
        options: [
          'The poet’s mother, around twelve years old',
          'Cousin Betty, around fifteen years old',
          'Cousin Dolly, around ten years old',
          'The poet Shirley Toulson herself',
        ],
        correctIndex: 0,
        correctAnswerText: 'The poet’s mother, around twelve years old',
        marks: 1,
        explanation: 'The poem states "And she the big girl — some twelve years or so", referring to the poet’s mother.',
      },
    ],
  },
  {
    poem: 'The Voice of the Rain',
    casePassage: `[EXTRACT]\n"Eternal I rise impalpable out of the land and the bottomless sea,\nUpward to heaven, whence, vaguely form’d, altogether changed, and yet the same,\nI descend to lave the droughts, atomies, dust-layers of the globe,\nAnd all that in them without me were seeds only, latent, unborn;\nAnd forever, by day and night, I give back life to my own origin,\nAnd make pure and beautify it;"`,
    subQuestions: [
      {
        subNumber: '(i)',
        question: 'Who is the speaker "I" in the above lines by Walt Whitman?',
        questionType: 'mcq',
        options: ['The soft-falling shower of rain', 'The ocean tide', 'The mountain wind', 'The morning sun'],
        correctIndex: 0,
        correctAnswerText: 'The soft-falling shower of rain',
        marks: 1,
        explanation: 'The poem personifies the rain speaking as " the Poem of Earth".',
      },
      {
        subNumber: '(ii)',
        question: 'Why does the rain describe itself as "altogether changed, and yet the same"?',
        questionType: 'written',
        marks: 1,
        modelAnswer: 'Because water evaporates as invisible ("impalpable") vapour and condenses into clouds—changing its physical state—while its chemical essence (H₂O) remains unchanged.',
      },
      {
        subNumber: '(iii)',
        question: 'What happens to the "latent, unborn" seeds when the rain descends upon the earth?',
        questionType: 'mcq',
        options: [
          'They sprout and germinate into living plants',
          'They are washed away into the bottomless sea',
          'They remain dormant beneath dust layers forever',
          'They turn into dry atomies',
        ],
        correctIndex: 0,
        correctAnswerText: 'They sprout and germinate into living plants',
        marks: 1,
        explanation: 'The rain gives life to seeds that would otherwise remain "seeds only, latent, unborn".',
      },
    ],
  },
  {
    poem: 'Childhood',
    casePassage: `[EXTRACT]\n"When did my childhood go?\nWas it the time I realised that adults were not\nall they seemed to be,\nThey talked of love and preached of love,\nBut did not act so lovingly,\nWas that the day!"`,
    subQuestions: [
      {
        subNumber: '(i)',
        question: 'What disillusionment about adults does the speaker Markus Natten express in this stanza?',
        questionType: 'mcq',
        options: [
          'Adults are hypocritical—they preach love but do not act lovingly',
          'Adults do not understand geography and maps',
          'Adults refuse to allow children to think independently',
          'Adults forget their own childhood memories',
        ],
        correctIndex: 0,
        correctAnswerText: 'Adults are hypocritical—they preach love but do not act lovingly',
        marks: 1,
        explanation: 'The poet highlights the gap between adult preaching of love and their unloving actions.',
      },
      {
        subNumber: '(ii)',
        question: 'How does the realization in this stanza mark a milestone in the poet’s growing up?',
        questionType: 'written',
        marks: 1,
        modelAnswer: 'It marks the loss of innocent childhood trust and the awakening of critical moral discernment capable of recognizing adult hypocrisy.',
      },
      {
        subNumber: '(iii)',
        question: 'What is the refrain used at the end of the first three stanzas of the poem "Childhood"?',
        questionType: 'mcq',
        options: ['"Was that the day!"', '"Forgotten in an infant’s face"', '"Heaven and Hell could not be found"', '"My mind was really mine"'],
        correctIndex: 0,
        correctAnswerText: '"Was that the day!"',
        marks: 1,
        explanation: 'The rhetorical exclamation "Was that the day!" closes each of the first three stanzas.',
      },
    ],
  },
];

const ENGLISH_PROSE_EXTRACTS = [
  {
    chapter: 'The Portrait of a Lady',
    casePassage: `[EXTRACT]\n"She had always been short and fat and slightly bent. Her face was a criss-cross of wrinkles running from everywhere to everywhere. No, we were certain she had always been as we had known her. Old, so terribly old that she could not have grown older, and had stayed at the same age for twenty years. She could never have been pretty; but she was always beautiful. She hobbled about the house in spotless white with one hand resting on her waist to balance her stoop and the other telling the beads of her rosary."`,
    subQuestions: [
      {
        subNumber: '(i)',
        question: 'How does the author distinguish between being "pretty" and being "beautiful"?',
        questionType: 'written',
        marks: 1,
        modelAnswer: "'Pretty' refers to physical superficial youthfulness, while 'beautiful' refers to inner spiritual grace and moral serenity.",
      },
      {
        subNumber: '(ii)',
        question: 'Why did the grandmother keep one hand on her waist while walking?',
        questionType: 'mcq',
        options: ['To balance her stoop', 'Because her hand was fractured', 'To carry her prayer book', 'To hide her purse'],
        correctIndex: 0,
        correctAnswerText: 'To balance her stoop',
        marks: 1,
        explanation: "Text directly states 'with one hand resting on her waist to balance her stoop'.",
      },
      {
        subNumber: '(iii)',
        question: 'What was the constant activity of her other hand?',
        questionType: 'written',
        marks: 1,
        modelAnswer: 'Telling the beads of her rosary in perpetual prayer.',
      },
    ],
  },
  {
    chapter: "We're Not Afraid to Die... if We Can All Be Together",
    casePassage: `[EXTRACT]\n"At dawn on January 2, the waves were gigantic. We were sailing with only a small storm jib and were still making eight knots. As the ship rose to the top of each wave we could see endless enormous seas rolling towards us, and the screaming of the wind and spray was painful to the ears. To slow the boat down, we dropped the storm jib and lashed a heavy mooring rope in a loop across the stern. Then we double-lashed everything, went through our life-raft drill, attached lifelines, donned oilskins and life jackets — and waited."`,
    subQuestions: [
      {
        subNumber: '(i)',
        question: 'What precautionary seamanship measure did the narrator take to slow down the Wavewalker on January 2?',
        questionType: 'mcq',
        options: [
          'Dropped the storm jib and lashed a heavy mooring rope in a loop across the stern',
          'Hoisted the main sail to full capacity',
          'Anchored the vessel to a coral reef',
          'Switched on the auxiliary twin diesel engines at full throttle',
        ],
        correctIndex: 0,
        correctAnswerText: 'Dropped the storm jib and lashed a heavy mooring rope in a loop across the stern',
        marks: 1,
        explanation: 'The narrator explicitly states they dropped the storm jib and lashed a heavy mooring rope across the stern.',
      },
      {
        subNumber: '(ii)',
        question: 'What qualities of the crew are reflected in the final sentence of the extract?',
        questionType: 'written',
        marks: 1,
        modelAnswer: 'Methodical preparedness, composure under extreme peril, and disciplined teamwork.',
      },
      {
        subNumber: '(iii)',
        question: 'What speed was the vessel still making with only a small storm jib?',
        questionType: 'mcq',
        options: ['Eight knots', 'Two knots', 'Twenty knots', 'Fifteen knots'],
        correctIndex: 0,
        correctAnswerText: 'Eight knots',
        marks: 1,
        explanation: 'The passage states: "We were sailing with only a small storm jib and were still making eight knots."',
      },
    ],
  },
  {
    chapter: 'Discovering Tut: the Saga Continues',
    casePassage: `[EXTRACT]\n"An angry wind stirred up ghostly dust devils as King Tut was taken from his resting place in the ancient Egyptian cemetery known as the Valley of the Kings. Dark-bellied clouds had scudded across the desert sky all day and now were veiling the stars in casket grey. It was 6 p.m. on 5 January 2005. The world’s most famous mummy glided head first into a CT scanner brought here to probe the lingering medical mysteries of this little understood young ruler who died more than 3,300 years ago."`,
    subQuestions: [
      {
        subNumber: '(i)',
        question: 'Why was King Tut’s mummy placed inside a CT scanner on 5 January 2005?',
        questionType: 'mcq',
        options: [
          'To probe the lingering medical mysteries of how he lived and died over 3,300 years ago',
          'To melt the solid gold coffin and remove the resins',
          'To relocate his tomb permanently to London',
          'To photograph his funerary amulets for an auction',
        ],
        correctIndex: 0,
        correctAnswerText: 'To probe the lingering medical mysteries of how he lived and died over 3,300 years ago',
        marks: 1,
        explanation: 'The extract states the CT scanner was brought "to probe the lingering medical mysteries of this little understood young ruler".',
      },
      {
        subNumber: '(ii)',
        question: 'Explain the poetic appropriateness of the phrase "veiling the stars in casket grey".',
        questionType: 'written',
        marks: 1,
        modelAnswer: 'The metaphor "casket grey" evokes a sombre, funereal atmosphere over the Valley of the Kings as the boy pharaoh’s coffin is disturbed.',
      },
      {
        subNumber: '(iii)',
        question: 'Where was King Tut’s ancient resting place located?',
        questionType: 'written',
        marks: 1,
        modelAnswer: 'In the ancient Egyptian cemetery known as the Valley of the Kings.',
      },
    ],
  },
  {
    chapter: 'Silk Road',
    casePassage: `[EXTRACT]\n"We passed nomads’ dark tents pitched in splendid isolation, usually with a huge black dog, a Tibetan mastiff, standing guard. These beasts would cock their great big heads when they became aware of our approach and fix us in their sights. As we continued to draw closer, they would explode into action, speeding directly towards us, like a bullet from a gun and nearly as fast. These shaggy monsters, blacker than the darkest night, usually wore bright red collars and barked furiously with massive jaws."`,
    subQuestions: [
      {
        subNumber: '(i)',
        question: 'How did the Tibetan mastiffs react as the author’s vehicle approached the nomad tents?',
        questionType: 'mcq',
        options: [
          'They exploded into action and charged directly towards the car like a bullet from a gun',
          'They retreated quietly inside the dark tents',
          'They wagged their tails and begged for food',
          'They ignored the vehicle completely',
        ],
        correctIndex: 0,
        correctAnswerText: 'They exploded into action and charged directly towards the car like a bullet from a gun',
        marks: 1,
        explanation: 'The text states they "would explode into action, speeding directly towards us, like a bullet from a gun".',
      },
      {
        subNumber: '(ii)',
        question: 'Identify two striking visual details used by Nick Middleton to describe the Tibetan mastiffs.',
        questionType: 'written',
        marks: 1,
        modelAnswer: 'They are described as "shaggy monsters, blacker than the darkest night" wearing "bright red collars" with "massive jaws".',
      },
      {
        subNumber: '(iii)',
        question: 'Whose tents were the Tibetan mastiffs guarding on the high Changtang plateau?',
        questionType: 'written',
        marks: 1,
        modelAnswer: 'The dark tents of Tibetan nomads (Drokbas) pitched in splendid isolation.',
      },
    ],
  },
];

const ENGLISH_SNAPSHOTS_EXTRACTS = [
  {
    chapter: 'The Summer of the Beautiful White Horse',
    casePassage: `[EXTRACT]\n"One day back there in the good old days when I was nine and the world was full of every imaginable kind of magnificence, and life was still a delightful and mysterious dream, my cousin Mourad, who was considered crazy by everybody who knew him except me, came to my house at four in the morning and woke me up tapping on the window of my room.\n'Aram,' he said.\nI jumped out of bed and looked out of the window. I couldn't believe what I saw. It wasn't morning yet, but it was summer and with daybreak not many minutes around the corner of the world it was light enough for me to know I wasn't dreaming.\nMy cousin Mourad was sitting on a beautiful white horse."`,
    subQuestions: [
      {
        subNumber: '(i)',
        question: 'Why could Aram scarcely believe what he saw out of the window?',
        questionType: 'written',
        marks: 1,
        modelAnswer: 'Because his Garoghlanian tribe lived in extreme poverty and could never afford to purchase a magnificent white horse.',
      },
      {
        subNumber: '(ii)',
        question: 'What family trait did cousin Mourad reputedly inherit?',
        questionType: 'mcq',
        options: [
          'The crazy streak of Uncle Khosrove',
          'The mechanical engineering talent of his father Zorab',
          'The business shrewdness of John Byro',
          'The religious piety of the village priest',
        ],
        correctIndex: 0,
        correctAnswerText: 'The crazy streak of Uncle Khosrove',
        marks: 1,
        explanation: 'Mourad was deemed the natural descendant of the crazy streak in their tribe.',
      },
      {
        subNumber: '(iii)',
        question: 'At what time of day did Mourad awaken Aram?',
        questionType: 'written',
        marks: 1,
        modelAnswer: 'At four in the morning.',
      },
      {
        subNumber: '(iv)',
        question: 'What did the Garoghlanian tribe take proudest pride in, despite their poverty?',
        questionType: 'mcq',
        options: [
          'Their unyielding honesty and integrity',
          'Their military conquests',
          'Their vast agricultural landholdings',
          'Their aristocratic pedigree',
        ],
        correctIndex: 0,
        correctAnswerText: 'Their unyielding honesty and integrity',
        marks: 1,
        explanation: 'The tribe was famous for their honesty for eleven centuries.',
      },
    ],
  },
  {
    chapter: 'The Address',
    casePassage: `[EXTRACT]\n"I was in a room I knew and did not know. I found myself in the midst of things I did want to see again but which oppressed me in the strange atmosphere. Or because of the tasteless way everything was arranged, because of the ugly furniture or the muggy smell that hung there, I don’t know; but I scarcely dared to look around me. The girl moved a chair. I sat down and stared at the woollen table-cloth. I rubbed it. My fingers grew warm from rubbing. I followed the lines of the pattern. Somewhere on the edge there should be a burn mark that had never been repaired."`,
    subQuestions: [
      {
        subNumber: '(i)',
        question: 'Why does the narrator say "I was in a room I knew and did not know"?',
        questionType: 'written',
        marks: 1,
        modelAnswer: 'She knew the room’s contents (her mother’s pre-war belongings), yet she did not know the unfamiliar, tasteless room at 46 Marconi Street where Mrs. Dorling kept them.',
      },
      {
        subNumber: '(ii)',
        question: 'What specific detail did the narrator look for on the woollen table-cloth to verify its identity?',
        questionType: 'mcq',
        options: [
          'An unrepaired burn mark on the edge',
          'Her mother’s embroidered initials in gold thread',
          'A tear near the centre',
          'A fringe of lace tassels',
        ],
        correctIndex: 0,
        correctAnswerText: 'An unrepaired burn mark on the edge',
        marks: 1,
        explanation: 'She looked for "a burn mark that had never been repaired" on the edge of the woollen table-cloth.',
      },
      {
        subNumber: '(iii)',
        question: 'How did the sight of her mother’s belongings affect the narrator emotionally?',
        questionType: 'written',
        marks: 1,
        modelAnswer: 'Instead of comforting her, the familiar objects oppressed and alienated her in that strange, muggy environment.',
      },
      {
        subNumber: '(iv)',
        question: 'Who is the author of the story "The Address"?',
        questionType: 'mcq',
        options: ['Marga Minco', 'William Saroyan', 'J.B. Priestley', 'A.J. Cronin'],
        correctIndex: 0,
        correctAnswerText: 'Marga Minco',
        marks: 1,
        explanation: '"The Address" is written by Dutch author Marga Minco.',
      },
    ],
  },
  {
    chapter: 'Birth',
    casePassage: `[EXTRACT]\n"As he gazed at the still form a shiver of horror passed over Andrew. After all that he had promised! His face, heated with his own exertions, chilled suddenly. He hesitated, torn between his desire to attempt to resuscitate the child, and his obligation towards the mother, who was herself in a desperate state. The dilemma was so urgent he did not solve it consciously. Blindly, instinctively, he gave the child to the nurse and turned his attention to Susan Morgan who now lay collapsed, almost pulseless, and not yet out of the ether, upon her side."`,
    subQuestions: [
      {
        subNumber: '(i)',
        question: 'What urgent medical dilemma confronted Dr. Andrew Manson immediately after the delivery?',
        questionType: 'mcq',
        options: [
          'Whether to resuscitate the stillborn infant first or save the collapsing mother Susan Morgan',
          'Whether to call a senior surgeon from Cardiff or perform surgery alone',
          'Whether to administer chloroform or ether',
          'Whether to inform Joe Morgan waiting outside',
        ],
        correctIndex: 0,
        correctAnswerText: 'Whether to resuscitate the stillborn infant first or save the collapsing mother Susan Morgan',
        marks: 1,
        explanation: 'Andrew was torn between resuscitating the stillborn child and saving the nearly pulseless mother.',
      },
      {
        subNumber: '(ii)',
        question: 'Why did a "shiver of horror" pass over Andrew as he looked at the newborn?',
        questionType: 'written',
        marks: 1,
        modelAnswer: 'Because the baby was born lifeless (suffering from white asphyxia) despite Andrew’s reassuring promise to the Morgans.',
      },
      {
        subNumber: '(iii)',
        question: 'Whom did Andrew attend to first, and how?',
        questionType: 'written',
        marks: 1,
        modelAnswer: 'He instinctively handed the baby to the midwife and attended to the mother Susan Morgan first, smashing a glass ampoule and injecting medicine to restore her heart.',
      },
      {
        subNumber: '(iv)',
        question: 'What condition was the newborn suffering from when Andrew examined it closer?',
        questionType: 'mcq',
        options: ['Asphyxia pallida', 'Jaundice', 'Hypothermia', 'Pneumonia'],
        correctIndex: 0,
        correctAnswerText: 'Asphyxia pallida',
        marks: 1,
        explanation: 'Andrew diagnosed the pale, limp state as asphyxia pallida (white asphyxia).',
      },
    ],
  },
];

const HORNBILL_SHORT_POOL = [
  {
    q: 'Why did the author’s grandmother dislike the education given to him in the city English school?',
    ans: 'She was distressed that there was no religious teaching about God and the scriptures. Furthermore, she disapproved of music lessons, associating music with beggars rather than gentlefolk.',
    ch: 'The Portrait of a Lady',
  },
  {
    q: 'How did the sparrows express their silent sorrow when the author’s grandmother passed away?',
    ans: 'Thousands of sparrows sat scattered on the verandah and in her room in complete silence without chirping, ignored the bread crumbs thrown by the author’s mother, and flew away quietly when her corpse was carried off.',
    ch: 'The Portrait of a Lady',
  },
  {
    q: 'What difference did the captain note between the children’s reaction and adult anxiety during the storm on Wavewalker?',
    ans: 'While adults struggled against panic, young Jonathan courageously proclaimed they were not afraid of dying if they could all be together, and Suzanne stoically concealed her severe head injury to spare her father distress.',
    ch: "We're Not Afraid to Die...",
  },
  {
    q: 'Why did Howard Carter have to chisel away the solidified resins beneath King Tut’s mummy in 1922?',
    ans: 'The ritual resins poured during Tutankhamun’s burial had hardened like cement, bonding the mummy firmly to the bottom of the solid gold coffin; even scorching desert sun failed to loosen it.',
    ch: 'Discovering Tut: the Saga Continues',
  },
  {
    q: 'How did Rajendra Deshpande use Catastrophe Theory and quantum lack of determinism to explain Professor Gaitonde’s experience?',
    ans: 'Rajendra explained that at critical historical junctures (like the Battle of Panipat), multiple quantum trajectories exist; Gaitonde’s neural collision caused his consciousness to transition momentarily to an alternate parallel historical reality.',
    ch: 'The Adventure',
  },
  {
    q: 'Why was the narrator Nick Middleton disappointed by the town of Hor on the shore of Lake Manasarovar?',
    ans: 'In stark contrast to the reverent accounts of ancient pilgrims, Hor was a grim, miserable, dusty place devoid of vegetation, littered with accumulated refuse and rocks.',
    ch: 'Silk Road',
  },
  {
    q: 'What do the "sea holiday" and the poet’s "laughter" signify in Shirley Toulson’s poem "A Photograph"?',
    ans: 'The "sea holiday" was the mother’s cherished past (her childhood innocence), while the mother’s laughter was the poet’s treasured past; both now evoke a shared sense of irreparable loss.',
    ch: 'A Photograph',
  },
  {
    q: 'Why is the Laburnum tree’s top silent before the arrival of the goldfinch and silent again after her departure?',
    ans: 'The goldfinch acts as the vitalizing soul or engine of the tree; her arrival awakens her nestlings into a flurry of chitterings, and once she flies into the infinite sky, the tree subsides into emptiness.',
    ch: 'The Laburnum Top',
  },
  {
    q: 'Why does Walt Whitman place the last two lines of "The Voice of the Rain" within brackets?',
    ans: 'The bracketed lines represent the poet’s own meditative reflection drawing a parallel between the cyclical journey of rain and the journey of a song/poem returning to its creator with love.',
    ch: 'The Voice of the Rain',
  },
  {
    q: 'How does the father’s helplessness manifest in Elizabeth Jennings’ poem "Father to Son"?',
    ans: 'Despite living in the same house for years, the father feels like a stranger to his son, unable to share his son’s preferences or bridge the emotional silence that separates them.',
    ch: 'Father to Son',
  },
];

const SNAPSHOTS_SHORT_POOL = [
  {
    q: 'Why did the narrator of "The Address" resolve to forget Number 46, Marconi Street forever?',
    ans: 'She realized that familiar physical objects stripped of their emotional association and stored in tasteless, unfamiliar surroundings had lost all meaningful connection to her deceased mother and former home.',
    ch: 'The Address',
  },
  {
    q: 'Why did John Byro not accuse Mourad and Aram of stealing his white horse even after examining its teeth?',
    ans: 'Because the fame of the Garoghlanian family for unyielding honesty was so deeply ingrained in John Byro that he trusted his heart over his eyes, assuming the horse was his horse’s twin.',
    ch: 'The Summer of the Beautiful White Horse',
  },
  {
    q: 'How did Mrs. Fitzgerald’s personality-swap intervention transform Mrs. Annie Pearson’s status in her household?',
    ans: 'By speaking firmly to Doris, Cyril, and George and refusing to act as an unpaid domestic servant, Mrs. Fitzgerald (in Mrs. Pearson’s body) taught the family to respect Annie’s dignity and share household duties.',
    ch: "Mother's Day",
  },
  {
    q: 'Why did Dr. Andrew Manson exclaim, "Oh, God! I’ve done something real at last" as he walked home at dawn in Blaenelly?',
    ans: 'Because through sheer clinical perseverance and intuitive courage, he had saved both Susan Morgan and her seemingly stillborn infant against overwhelming odds, fulfilling his highest medical calling.',
    ch: 'Birth',
  },
  {
    q: 'How did a melon end up being crowned the monarch in Vikram Seth’s "The Tale of Melon City"?',
    ans: 'Following the hanging of the just and placid king by his own decree, custom dictated that the next person passing the City Gate would choose the ruler; an idiot who loved melons answered "A melon" to every question.',
    ch: 'The Tale of Melon City',
  },
];

const HORNBILL_LONG_POOL = [
  {
    ch: 'The Portrait of a Lady',
    scope: 'prose',
    question: `Answer ANY ONE of the following questions in 120–150 words [6 Marks]:\n\n(A) "Human relationships evolve through distinct phases of dependency, transition, and emotional detachment." Trace the three phases of the relationship between Khushwant Singh and his grandmother in "The Portrait of a Lady".\n\nOR\n\n(B) "Optimism and collective resilience are humanity’s greatest safeguards against nature’s fiercest adversities." Discuss this assertion with detailed reference to Gordon Cook and Alan East’s voyage in "We're Not Afraid to Die... if We Can All Be Together".`,
    modelAnswer: `Phase 1 (Village): The author and grandmother shared an intimate, inseparable bond. She awakened him, bathed him, recited prayers, and accompanied him to the temple school while feeding village dogs.\n\nPhase 2 (City School): The turning point arrived when they migrated to the city. Although they shared the same room, she could no longer assist him with modern science and English. She was alienated by the lack of religious instruction and disapproved of music lessons.\n\nPhase 3 (University & Abroad): When the author joined university, their common physical link snapped as he was given a separate room. She accepted her seclusion with stoic quietude, dedicating her afternoons to feeding hundreds of sparrows in the verandah. Her profound spiritual detachment culminated at his homecoming and her peaceful demise holding her rosary.`,
  },
  {
    ch: 'Discovering Tut: the Saga Continues',
    scope: 'prose',
    question: `Answer ANY ONE of the following questions in 120–150 words [6 Marks]:\n\n(A) "Archaeology has changed substantially in the intervening decades, focusing less on treasure and more on the fascinating details of life and intriguing mysteries of death." Substantiate this statement with reference to "Discovering Tut: the Saga Continues".\n\nOR\n\n(B) Compare Professor Gaitonde’s experience of post-Panipat India in the parallel world with the historical reality he knew in "The Adventure". What philosophical insights does the story offer on historical determinism?`,
    modelAnswer: `In 1922, when British archaeologist Howard Carter discovered King Tutankhamun’s tomb, archaeological methods were dominated by treasure hunting. Carter focused on cataloguing the dazzling golden artefacts and even chiselled away the king’s mummified limbs and head to separate the corpse from the solid gold coffin.\n\nOver the subsequent eight decades, archaeology evolved into a forensic, non-invasive science employing medical diagnostic technology. In 1968, an anatomy professor X-rayed the mummy, revealing a missing breastbone and front ribs. By January 2005, Zahi Hawass’s team used a portable CT scanner to create 1,700 digital cross-sectional images of Tut’s body, shifting focus from material plunder to reconstructing ancient longevity, pathology, and royal lineage.`,
  },
  {
    ch: 'Silk Road',
    scope: 'prose',
    question: `Answer ANY ONE of the following questions in 120–150 words [6 Marks]:\n\n(A) Nick Middleton’s account in "Silk Road" blends physical hardship at extreme altitudes with keen cultural observation and self-deprecating humour. Analyze how the author’s encounter with Norbu in Darchen transforms his pilgrimage to Mount Kailash.\n\nOR\n\n(B) How do the poems "A Photograph" and "Childhood" explore two distinct facets of the passage of time—mortal loss and psychological maturation?`,
    modelAnswer: `Throughout "Silk Road", Nick Middleton battles freezing winds, dizzying altitudes above 5,000 metres, and a severe sinus blockage that prevents him from sleeping in Darchen. Initially disheartened when his driver Tsetan leaves and he discovers no other pilgrims have arrived for the kora, Middleton fears he must undertake the arduous trek alone without a companion who speaks English.\n\nHis chance meeting with Norbu—a Beijing academic of Tibetan origin—in Darchen’s sole café completely revitalizes his spirits. Like the author, Norbu is an academic rather than a devout prostrating ascetic, and he sensibly suggests hiring yaks to carry their luggage. Their shared intellectual camaraderie and humorous realism turn a daunting ordeal into a fulfilling shared journey.`,
  },
  {
    ch: 'Father to Son',
    scope: 'poetry',
    question: `Answer ANY ONE of the following questions in 120–150 words [6 Marks]:\n\n(A) "Generation gap is less a conflict of age and more a failure of empathetic communication." Examine the universal dilemma of parental alienation depicted in Elizabeth Jennings’ "Father to Son" and suggest how both generations can rebuild mutual understanding.\n\nOR\n\n(B) Nature in "The Laburnum Top" and "The Voice of the Rain" is portrayed as a self-renewing cycle of reciprocal nourishment. Compare the central metaphors employed by Ted Hughes and Walt Whitman.`,
    modelAnswer: `In "Father to Son", Elizabeth Jennings poignantly captures the anguish of a father who, despite sharing the same roof with his son for years, feels completely estranged from him. The father laments that he worked to "build up a relationship from how he was when small," yet fails to recognize the independent adult his son has become. By viewing the son merely as an extension of himself ("The seed I spent or sown"), the father inadvertently stifles the son’s autonomy.\n\nYet the final stanza reveals that both father and son "put out an empty hand, longing for something to forgive." Rebuilding this bond requires replacing paternal possessiveness with active listening, respecting emotional boundaries, and embracing honest dialogue over defensive silence.`,
  },
];

const SNAPSHOTS_LONG_POOL = [
  {
    ch: 'Birth',
    question: `Answer ANY ONE of the following questions in 120–150 words [6 Marks]:\n\n(A) "A doctor’s true test lies not merely in academic knowledge, but in unflinching dedication and refusal to surrender hope in the face of despair." Evaluate Dr. Andrew Manson’s desperate struggle to revive the stillborn child in A.J. Cronin’s "Birth".\n\nOR\n\n(B) Satire is a powerful literary instrument for exposing administrative folly and the absurdities of blind governance. Analyze Vikram Seth’s satirical intent in "The Tale of Melon City".`,
    modelAnswer: `In "Birth", Dr. Andrew Manson confronts an agonizing crisis when Susan Morgan’s baby is born completely lifeless, stricken with white asphyxia. Overcoming physical exhaustion from a sleepless night, Andrew refuses to concede defeat. First, he revitalizes the collapsed mother with a hypodermic injection. Then, retrieving the limp, pale child from beneath the bed among dirty newspapers, he embarks on an intuitive, desperate medical struggle.\n\nHe calls for two basins of hot and cold water, repeatedly plunging the infant alternately into icy and steaming water. When this fails, he rubs the small chest with a rough towel and forces his own breath into the miniature lungs. After an exhausting hour, the child’s chest heaves with a miraculous gasp. Andrew’s triumph represents the triumph of pure dedication over medical despair, culminating in his grateful realization: "I've done something real at last."`,
  },
  {
    ch: "Mother's Day",
    question: `Answer ANY ONE of the following questions in 120–150 words [6 Marks]:\n\n(A) J.B. Priestley’s play "Mother's Day" uses comic fantasy to deliver a sharp social critique of unpaid and unappreciated domestic labour. Discuss how Mrs. Pearson’s family is reformed and why the play remains relevant today.\n\nOR\n\n(B) Compare the moral dilemma faced by Mourad and Aram in "The Summer of the Beautiful White Horse" with the psychological trauma faced by the narrator in "The Address".`,
    modelAnswer: `In "Mother's Day", J.B. Priestley highlights the plight of Mrs. Annie Pearson, a devoted homemaker whose husband George and children Doris and Cyril treat her like an uncomplaining domestic servant, demanding tea, ironed clothes, and meals while working eight-hour shifts themselves.\n\nThrough the dramatic device of a personality swap orchestrated by her bold neighbour Mrs. Fitzgerald, Annie’s household receives a much-needed shock therapy. When Doris, Cyril, and George confront a firm refusal to wait on them hand and foot, their entitlement crumbles into contrition. Before swapping back, Mrs. Fitzgerald cautions Annie never to go soft again. The play remains deeply relevant as an indictment of taking maternal labour for granted and a call for equitable family partnership.`,
  },
  {
    ch: 'The Address',
    question: `Answer ANY ONE of the following questions in 120–150 words [6 Marks]:\n\n(A) "War destroys not only cities and lives, but also the sanctity of human trust and memory." Analyze how Marga Minco’s "The Address" portrays the lingering emotional devastation of war and the narrator’s path to closure.\n\nOR\n\n(B) How did the Garoghlanian tribe’s eleven-century legacy of integrity ultimately triumph over juvenile temptation in William Saroyan’s "The Summer of the Beautiful White Horse"?`,
    modelAnswer: `In "The Address", Marga Minco explores the subtle psychological scars of World War II through a young Jewish survivor returning to post-war Holland in search of her deceased mother’s belongings. Mrs. Dorling, an opportunistic acquaintance who had removed their silver cutlery, antique plates, and woollen tablecloths under the pretext of "saving" them during the Nazi occupation, initially slams the door in the narrator’s face.\n\nOn her second visit, the narrator enters 46 Marconi Street and is confronted by her mother’s cherished possessions arranged tastelessly in a muggy, alien room. She realizes that objects derive their value from the living human warmth of home; severed from her mother, they only burden her with grief. Resolving to forget the address, she chooses emotional liberation over material nostalgia.`,
  },
];

/**
 * Synthesizes a dedicated CBSE Class 11 English Core Question Paper
 * with Section A (Reading), Section B (Grammar & Creative Writing), Section C (Literature).
 * Uses multi-variant pools and recentQuestions deduplication so consecutive generations never repeat.
 */
export function synthesizeEnglishPaper(
  payload: any,
  modelLabel = 'gemini-3-flash-preview'
): { status: number; body: any } {
  generationEpochCounter += 1;
  const epoch = generationEpochCounter;

  const {
    stream = 'ALL',
    examName = 'English Core Annual Examination 2026–27',
    examDate = new Date().toISOString().split('T')[0],
    durationMinutes = 180,
    teacherName = 'Nancy Mam',
    readingConfig = {},
    grammarConfig = {},
    writingConfig = {},
    literatureConfig = {},
    isOfficialCbsePattern = true,
    recentQuestions = [],
  } = payload || {};

  const recentSet = buildRecentSignatureSet(recentQuestions);
  const questions: any[] = [];
  let questionCounter = 0;
  let runningMarks = 0;

  // SECTION A: READING SKILLS
  if (readingConfig.includeUnseen !== false) {
    questionCounter += 1;
    const uMarks = Number(readingConfig.unseenMarks) || 10;
    runningMarks += uMarks;
    const pickedUnseen =
      pickFreshItems(ENGLISH_UNSEEN_PASSAGES, 1, (p) => p.casePassage, recentSet, epoch)[0] ||
      ENGLISH_UNSEEN_PASSAGES[0];

    // Adjust sub-question marks so their sum equals uMarks
    const rawSubs = pickedUnseen.subQuestions.map((sq, idx) => ({
      ...sq,
      id: `sq-${questionCounter}-${idx + 1}`,
    }));
    const currentSum = rawSubs.reduce((s, sq) => s + (Number(sq.marks) || 1), 0);
    if (currentSum !== uMarks && rawSubs.length > 0) {
      const diff = uMarks - currentSum;
      rawSubs[rawSubs.length - 1].marks = Math.max(1, (rawSubs[rawSubs.length - 1].marks || 1) + diff);
    }

    questions.push({
      id: `q-eng-${questionCounter}`,
      section: 'SECTION A: READING SKILLS',
      questionType: 'case_study',
      question: 'Read the following unseen discursive passage carefully and answer the questions that follow:',
      casePassage: pickedUnseen.casePassage,
      marks: uMarks,
      subQuestions: rawSubs,
      chapter: 'Reading Skills — Discursive Passage',
    });
  }

  // 2. Case-Based Passage
  if (readingConfig.includeCaseBased !== false) {
    questionCounter += 1;
    const cbMarks = Number(readingConfig.caseBasedMarks) || 8;
    runningMarks += cbMarks;
    const pickedCase =
      pickFreshItems(ENGLISH_CASE_BASED_PASSAGES, 1, (p) => p.casePassage, recentSet, epoch)[0] ||
      ENGLISH_CASE_BASED_PASSAGES[0];

    const rawSubs = pickedCase.subQuestions.map((sq, idx) => ({
      ...sq,
      id: `sq-${questionCounter}-${idx + 1}`,
    }));
    const currentSum = rawSubs.reduce((s, sq) => s + (Number(sq.marks) || 1), 0);
    if (currentSum !== cbMarks && rawSubs.length > 0) {
      const diff = cbMarks - currentSum;
      rawSubs[rawSubs.length - 1].marks = Math.max(1, (rawSubs[rawSubs.length - 1].marks || 1) + diff);
    }

    questions.push({
      id: `q-eng-${questionCounter}`,
      section: 'SECTION A: READING SKILLS',
      questionType: 'case_study',
      question: 'Read the following case-based factual passage with data inputs and answer the questions that follow:',
      casePassage: pickedCase.casePassage,
      marks: cbMarks,
      subQuestions: rawSubs,
      chapter: 'Reading Skills — Case-Based Factual Passage',
    });
  }

  // 3. Note-Making & Summary (paired from the same selected passage)
  const pickedNotePassage =
    pickFreshItems(ENGLISH_NOTE_MAKING_PASSAGES, 1, (p) => p.passage, recentSet, epoch)[0] ||
    ENGLISH_NOTE_MAKING_PASSAGES[0];

  if (readingConfig.includeNoteMaking !== false) {
    questionCounter += 1;
    const nmMarks = Number(readingConfig.noteMakingMarks) || 5;
    runningMarks += nmMarks;
    questions.push({
      id: `q-eng-${questionCounter}`,
      section: 'SECTION A: READING SKILLS',
      questionType: 'short_3',
      question: `Read the following passage carefully:\n\n"${pickedNotePassage.passage}"\n\n(a) On the basis of your reading of the above passage, make notes on it using headings and sub-headings. Use recognizable abbreviations (minimum 4) with a key glossary. Supply an appropriate title.\n[Title: 1 Mark | Numbering & Indenting: 1 Mark | Key to Abbreviations: 1 Mark | Notes Content: 2 Marks]`,
      marks: nmMarks,
      modelAnswer: pickedNotePassage.notesModel,
      explanation: 'Official CBSE rubric: 1m Title, 1m Numbering/Indenting, 1m Key to abbreviations (min 4), 2m Notes content.',
      chapter: 'Reading Skills — Note-Making',
    });
  }

  if (readingConfig.includeSummary !== false) {
    questionCounter += 1;
    const sMarks = Number(readingConfig.summaryMarks) || 3;
    runningMarks += sMarks;
    questions.push({
      id: `q-eng-${questionCounter}`,
      section: 'SECTION A: READING SKILLS',
      questionType: 'short_2',
      question:
        '(b) Write a concise summary of the Note-Making passage in not more than 50 words based on your notes.\n[Content: 2 Marks | Expression: 1 Mark]',
      marks: sMarks,
      modelAnswer: pickedNotePassage.summaryModel,
      explanation: 'CBSE Word Limit: up to 50 words. Content: 2 Marks, Expression: 1 Mark.',
      chapter: 'Reading Skills — Summary Writing',
    });
  }

  // SECTION B: GRAMMAR
  const grammarTopics = grammarConfig.selectedTopics || ['tenses', 'clauses', 'reordering', 'transformation'];
  const topicCfg = grammarConfig.topicConfig || {};

  grammarTopics.forEach((topId: string, tIdx: number) => {
    const cfg = topicCfg[topId] || { questionCount: 2, marksPerQuestion: 1 };
    const qCount = Math.max(1, cfg.questionCount || 2);
    const mPerQ = Math.max(1, cfg.marksPerQuestion || 1);
    const bank =
      ENGLISH_GRAMMAR_BANK[topId] ||
      ENGLISH_GRAMMAR_BANK.transformation;

    const chosenGrammarItems = pickFreshItems(
      bank,
      qCount,
      (item) => item.prompt,
      recentSet,
      epoch + tIdx
    );

    chosenGrammarItems.forEach((v) => {
      questionCounter += 1;
      runningMarks += mPerQ;
      questions.push({
        id: `q-eng-${questionCounter}`,
        section: 'SECTION B: GRAMMAR AND CREATIVE WRITING SKILLS',
        questionType: 'mcq',
        question: v.prompt,
        options: [...v.options],
        correctIndex: v.correct,
        correctAnswerText: v.ans,
        marks: mPerQ,
        explanation: v.exp,
        chapter: v.label,
      });
    });
  });

  // SECTION B: CREATIVE WRITING SKILLS
  const writingTasks = writingConfig.selectedTasks || ['classified_advertisement', 'poster_writing', 'speech_writing', 'debate_writing'];
  const wMarks = writingConfig.taskMarks || {};

  writingTasks.forEach((taskId: string, wIdx: number) => {
    questionCounter += 1;
    const marks = wMarks[taskId] || (taskId.includes('speech') || taskId.includes('debate') ? 5 : 3);
    runningMarks += marks;
    const bank =
      ENGLISH_WRITING_BANK[taskId] ||
      ENGLISH_WRITING_BANK.debate_writing;
    const pickedTask =
      pickFreshItems(bank, 1, (item) => item.question, recentSet, epoch + wIdx)[0] ||
      bank[0];

    questions.push({
      id: `q-eng-${questionCounter}`,
      section: 'SECTION B: GRAMMAR AND CREATIVE WRITING SKILLS',
      questionType: marks >= 5 ? 'long_5' : 'short_3',
      question: pickedTask.question,
      marks,
      modelAnswer: pickedTask.modelAnswer,
      explanation: pickedTask.explanation,
      chapter: pickedTask.label,
    });
  });

  // SECTION C: LITERATURE (Filtered by chosen chapters/poems & recentQuestions)
  const chosenProseTitles: string[] = Array.isArray(literatureConfig.chosenProse) ? literatureConfig.chosenProse : [];
  const chosenPoetryTitles: string[] = Array.isArray(literatureConfig.chosenPoetry) ? literatureConfig.chosenPoetry : [];
  const chosenSnapshotsTitles: string[] = Array.isArray(literatureConfig.chosenSnapshots) ? literatureConfig.chosenSnapshots : [];

  if (literatureConfig.includePoetryExtract !== false) {
    questionCounter += 1;
    const pMarks = Number(literatureConfig.poetryExtractMarks) || 3;
    runningMarks += pMarks;
    const filteredPoetryExtracts =
      chosenPoetryTitles.length > 0
        ? ENGLISH_POETRY_EXTRACTS.filter((pe) =>
            chosenPoetryTitles.some((t) => t.toLowerCase().includes(pe.poem.toLowerCase()) || pe.poem.toLowerCase().includes(t.toLowerCase()))
          )
        : ENGLISH_POETRY_EXTRACTS;
    const pool = filteredPoetryExtracts.length > 0 ? filteredPoetryExtracts : ENGLISH_POETRY_EXTRACTS;
    const pickedExt = pickFreshItems(pool, 1, (pe) => pe.casePassage, recentSet, epoch)[0] || pool[0];

    questions.push({
      id: `q-eng-${questionCounter}`,
      section: 'SECTION C: LITERATURE TEXTBOOK AND SUPPLEMENTARY READER',
      questionType: 'case_study',
      question: 'Read the following poem extract and answer the questions that follow:\n(Attempt ANY ONE of the two extracts A or B)',
      casePassage: pickedExt.casePassage,
      marks: pMarks,
      subQuestions: pickedExt.subQuestions.map((sq, idx) => ({
        ...sq,
        id: `sq-${questionCounter}-${idx + 1}`,
      })),
      chapter: `Hornbill Poetry — ${pickedExt.poem}`,
    });
  }

  if (literatureConfig.includeProseExtract !== false) {
    questionCounter += 1;
    const prMarks = Number(literatureConfig.proseExtractMarks) || 3;
    runningMarks += prMarks;
    const filteredProseExtracts =
      chosenProseTitles.length > 0
        ? ENGLISH_PROSE_EXTRACTS.filter((pe) =>
            chosenProseTitles.some((t) => t.toLowerCase().includes(pe.chapter.toLowerCase().slice(0, 12)) || pe.chapter.toLowerCase().includes(t.toLowerCase().slice(0, 12)))
          )
        : ENGLISH_PROSE_EXTRACTS;
    const pool = filteredProseExtracts.length > 0 ? filteredProseExtracts : ENGLISH_PROSE_EXTRACTS;
    const pickedExt = pickFreshItems(pool, 1, (pe) => pe.casePassage, recentSet, epoch)[0] || pool[0];

    questions.push({
      id: `q-eng-${questionCounter}`,
      section: 'SECTION C: LITERATURE TEXTBOOK AND SUPPLEMENTARY READER',
      questionType: 'case_study',
      question: 'Read the following prose extract and answer the questions that follow:\n(Attempt ANY ONE of the two extracts A or B)',
      casePassage: pickedExt.casePassage,
      marks: prMarks,
      subQuestions: pickedExt.subQuestions.map((sq, idx) => ({
        ...sq,
        id: `sq-${questionCounter}-${idx + 1}`,
      })),
      chapter: `Hornbill Prose — ${pickedExt.chapter}`,
    });
  }

  if (literatureConfig.includeSnapshotsExtract !== false) {
    questionCounter += 1;
    const snMarks = Number(literatureConfig.snapshotsExtractMarks) || 4;
    runningMarks += snMarks;
    const filteredSnapExtracts =
      chosenSnapshotsTitles.length > 0
        ? ENGLISH_SNAPSHOTS_EXTRACTS.filter((se) =>
            chosenSnapshotsTitles.some((t) => t.toLowerCase().includes(se.chapter.toLowerCase().slice(0, 10)) || se.chapter.toLowerCase().includes(t.toLowerCase().slice(0, 10)))
          )
        : ENGLISH_SNAPSHOTS_EXTRACTS;
    const pool = filteredSnapExtracts.length > 0 ? filteredSnapExtracts : ENGLISH_SNAPSHOTS_EXTRACTS;
    const pickedExt = pickFreshItems(pool, 1, (se) => se.casePassage, recentSet, epoch)[0] || pool[0];

    questions.push({
      id: `q-eng-${questionCounter}`,
      section: 'SECTION C: LITERATURE TEXTBOOK AND SUPPLEMENTARY READER',
      questionType: 'case_study',
      question: 'Read the following extract from Snapshots and answer the questions that follow:\n(Attempt ANY ONE of the two extracts A or B)',
      casePassage: pickedExt.casePassage,
      marks: snMarks,
      subQuestions: pickedExt.subQuestions.map((sq, idx) => ({
        ...sq,
        id: `sq-${questionCounter}-${idx + 1}`,
      })),
      chapter: `Snapshots — ${pickedExt.chapter}`,
    });
  }

  const hShortCount = Number(literatureConfig.hornbillShortCount) ?? 2;
  const hShortMarks = Number(literatureConfig.hornbillShortMarksPerQ) || 3;
  if (hShortCount > 0) {
    const allowedHornbillTitles = [...chosenProseTitles, ...chosenPoetryTitles];
    const filteredHShort =
      allowedHornbillTitles.length > 0
        ? HORNBILL_SHORT_POOL.filter((item) =>
            allowedHornbillTitles.some((t) => t.toLowerCase().includes(item.ch.toLowerCase().slice(0, 10)) || item.ch.toLowerCase().includes(t.toLowerCase().slice(0, 10)))
          )
        : HORNBILL_SHORT_POOL;
    const pool = filteredHShort.length >= hShortCount ? filteredHShort : HORNBILL_SHORT_POOL;
    const pickedShorts = pickFreshItems(pool, hShortCount, (item) => item.q, recentSet, epoch);

    for (const item of pickedShorts) {
      questionCounter += 1;
      runningMarks += hShortMarks;
      questions.push({
        id: `q-eng-${questionCounter}`,
        section: 'SECTION C: LITERATURE TEXTBOOK AND SUPPLEMENTARY READER',
        questionType: 'short_3',
        question: `Answer in 40–50 words:\n${item.q}`,
        marks: hShortMarks,
        modelAnswer: item.ans,
        explanation: 'CBSE Word Limit: 40–50 words.',
        chapter: `Hornbill — ${item.ch}`,
      });
    }
  }

  const sShortCount = Number(literatureConfig.snapshotsShortCount) ?? 1;
  const sShortMarks = Number(literatureConfig.snapshotsShortMarksPerQ) || 3;
  if (sShortCount > 0) {
    const filteredSShort =
      chosenSnapshotsTitles.length > 0
        ? SNAPSHOTS_SHORT_POOL.filter((item) =>
            chosenSnapshotsTitles.some((t) => t.toLowerCase().includes(item.ch.toLowerCase().slice(0, 10)) || item.ch.toLowerCase().includes(t.toLowerCase().slice(0, 10)))
          )
        : SNAPSHOTS_SHORT_POOL;
    const pool = filteredSShort.length >= sShortCount ? filteredSShort : SNAPSHOTS_SHORT_POOL;
    const pickedShorts = pickFreshItems(pool, sShortCount, (item) => item.q, recentSet, epoch);

    for (const item of pickedShorts) {
      questionCounter += 1;
      runningMarks += sShortMarks;
      questions.push({
        id: `q-eng-${questionCounter}`,
        section: 'SECTION C: LITERATURE TEXTBOOK AND SUPPLEMENTARY READER',
        questionType: 'short_3',
        question: `Answer in 40–50 words:\n${item.q}`,
        marks: sShortMarks,
        modelAnswer: item.ans,
        explanation: 'CBSE Word Limit: 40–50 words.',
        chapter: `Snapshots — ${item.ch}`,
      });
    }
  }

  if (literatureConfig.includeHornbillLongAnswer !== false) {
    questionCounter += 1;
    const hLongMarks = Number(literatureConfig.hornbillLongAnswerMarks) || 6;
    runningMarks += hLongMarks;
    const target =
      literatureConfig.hornbillLongTargetChapter && literatureConfig.hornbillLongTargetChapter !== 'any'
        ? literatureConfig.hornbillLongTargetChapter
        : '';
    const scope = literatureConfig.hornbillLongScope || 'both';
    let candidateLongs = HORNBILL_LONG_POOL;
    if (target) {
      const byTarget = HORNBILL_LONG_POOL.filter(
        (l) => l.ch.toLowerCase().includes(target.toLowerCase()) || target.toLowerCase().includes(l.ch.toLowerCase())
      );
      if (byTarget.length > 0) candidateLongs = byTarget;
    } else if (scope === 'prose' || scope === 'poetry') {
      const byScope = HORNBILL_LONG_POOL.filter((l) => l.scope === scope);
      if (byScope.length > 0) candidateLongs = byScope;
    }
    const pickedLong =
      pickFreshItems(candidateLongs, 1, (l) => l.question, recentSet, epoch)[0] || HORNBILL_LONG_POOL[0];

    questions.push({
      id: `q-eng-${questionCounter}`,
      section: 'SECTION C: LITERATURE TEXTBOOK AND SUPPLEMENTARY READER',
      questionType: 'long_5',
      question: pickedLong.question,
      marks: hLongMarks,
      modelAnswer: pickedLong.modelAnswer,
      explanation: 'CBSE 6-Mark Rubric: Content (3 Marks), Expression & Fluency (2 Marks), Accuracy & Vocabulary (1 Mark). Word limit: 120–150 words.',
      chapter: `Hornbill — ${target || pickedLong.ch}`,
    });
  }

  if (literatureConfig.includeSnapshotsLongAnswer !== false) {
    questionCounter += 1;
    const sLongMarks = Number(literatureConfig.snapshotsLongAnswerMarks) || 6;
    runningMarks += sLongMarks;
    const target =
      literatureConfig.snapshotsLongTargetChapter && literatureConfig.snapshotsLongTargetChapter !== 'any'
        ? literatureConfig.snapshotsLongTargetChapter
        : '';
    let candidateSnapLongs = SNAPSHOTS_LONG_POOL;
    if (target) {
      const byTarget = SNAPSHOTS_LONG_POOL.filter(
        (l) => l.ch.toLowerCase().includes(target.toLowerCase()) || target.toLowerCase().includes(l.ch.toLowerCase())
      );
      if (byTarget.length > 0) candidateSnapLongs = byTarget;
    }
    const pickedSnapLong =
      pickFreshItems(candidateSnapLongs, 1, (l) => l.question, recentSet, epoch)[0] || SNAPSHOTS_LONG_POOL[0];

    questions.push({
      id: `q-eng-${questionCounter}`,
      section: 'SECTION C: LITERATURE TEXTBOOK AND SUPPLEMENTARY READER',
      questionType: 'long_5',
      question: pickedSnapLong.question,
      marks: sLongMarks,
      modelAnswer: pickedSnapLong.modelAnswer,
      explanation: 'CBSE 6-Mark Rubric: Content (3 Marks), Expression & Fluency (2 Marks), Accuracy & Vocabulary (1 Mark). Word limit: 120–150 words.',
      chapter: `Snapshots — ${target || pickedSnapLong.ch}`,
    });
  }

  const generatedQuiz: any = {
    id: `quiz-english-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    title: examName,
    chapter: 'Complete CBSE Class 11 English Core Syllabus (Hornbill & Snapshots)',
    chapters: [
      'Hornbill Prose',
      'Hornbill Poetry',
      'Snapshots Reader',
      'Reading Skills',
      'Grammar & Creative Writing',
    ],
    subject: 'English Core',
    stream,
    classLevel: 'Class 11TH',
    difficulty: payload.difficulty || 'Mixed',
    questionType: 'mixed',
    timeLimitSeconds: durationMinutes * 60,
    description: `Official CBSE Class 11 English Core Question Paper (${runningMarks} Marks, ${durationMinutes} Mins). Prescribed NCERT Hornbill, Snapshots, Reading & Writing.`,
    createdBy: teacherName,
    createdAt: Date.now(),
    source: 'ai',
    isQuestionPaper: true,
    isEnglishPaper: true,
    modelUsed: modelLabel,
    paperConfig: {
      examName,
      examDate,
      durationMinutes,
      totalMarks: runningMarks,
      isQuestionPaper: true,
      isEnglishPaper: true,
      isOfficialCbsePattern,
      generalInstructions: [
        'This question paper is divided into three sections: Section A (Reading Skills), Section B (Grammar and Creative Writing Skills), and Section C (Literature).',
        'All questions are compulsory. Internal choices are provided in designated questions.',
        'Marks are indicated against each question. Adhere strictly to the prescribed word limits.',
      ],
    },
    questions,
  };

  return {
    status: 200,
    body: {
      success: true,
      quiz: generatedQuiz,
      modelUsed: modelLabel,
    },
  };
}

/**
 * Validates and synthesizes a complete, authentic CBSE Question Paper or Speed Quiz
 * honoring all user selections (class, stream, subject, chapters, student selection,
 * difficulty, teacher notes, CBSE instructions, question types, marks distribution, and duration).
 */
export function synthesizeCbseAssessment(
  payload: QuizGenerationPayload,
  modelLabel = 'gemini-3-flash-preview'
): { status: number; body: any } {
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
    assignedStudentIds,
    assignedStudentNames,
    assignmentMode,
    isQuestionPaper = false,
    questionCountsByType,
    marksConfig,
    paperConfig,
  } = payload || {};

  if (!subject || typeof subject !== 'string' || !subject.trim()) {
    return {
      status: 400,
      body: {
        error: 'Subject is required for quiz generation.',
        code: 'INVALID_SUBJECT',
      },
    };
  }

  const cleanSubject = subject.trim();

  // If this is an English Paper request, route to dedicated English paper synthesizer
  if (
    (payload as any).isEnglishPaper ||
    cleanSubject.toLowerCase().includes('english') ||
    (payload as any).readingConfig ||
    (payload as any).grammarConfig
  ) {
    return synthesizeEnglishPaper(payload, modelLabel);
  }

  generationEpochCounter += 1;
  const epoch = generationEpochCounter;
  const recentSet = buildRecentSignatureSet(recentQuestions);

  const resolvedClassLevel = getSubjectClassLevel(cleanSubject);
  const effectiveClassLevel =
    classLevel && classLevel.toLowerCase().includes('12')
      ? 'Class 12TH'
      : resolvedClassLevel === 'Class 12'
      ? 'Class 12TH'
      : classLevel || 'Class 11TH';

  const subjectChapters = getChaptersForSubject(cleanSubject);
  const defaultFallbackChapter =
    subjectChapters.length > 0
      ? subjectChapters[0].title
      : resolvedClassLevel === 'Class 12'
      ? 'Entire Class 12 CBSE Syllabus'
      : 'Entire Class 11 CBSE Syllabus';

  const selectedChapters: string[] =
    Array.isArray(chapters) && chapters.length > 0
      ? chapters.map((c) => String(c).trim()).filter(Boolean)
      : chapter && typeof chapter === 'string' && chapter.trim()
      ? [chapter.trim()]
      : [defaultFallbackChapter];

  const isPaperMode = Boolean(isQuestionPaper && questionCountsByType);

  if (isPaperMode) {
    const mcqC = Math.max(0, Number(questionCountsByType?.mcq) || 0);
    const s2C = Math.max(0, Number(questionCountsByType?.short_2) || 0);
    const s3C = Math.max(0, Number(questionCountsByType?.short_3) || 0);
    const csC = Math.max(0, Number(questionCountsByType?.case_study) || 0);
    const l5C = Math.max(0, Number(questionCountsByType?.long_5) || 0);
    const totalQuestions = mcqC + s2C + s3C + csC + l5C;

    if (totalQuestions <= 0) {
      return {
        status: 400,
        body: {
          error: 'Question paper must include at least 1 question across Sections A–E.',
          code: 'EMPTY_PAPER_CONFIG',
        },
      };
    }

    const durationMin = Number(paperConfig?.durationMinutes);
    if (!Number.isFinite(durationMin) || durationMin <= 0) {
      return {
        status: 400,
        body: {
          error: 'Question paper duration must be a positive number of minutes.',
          code: 'INVALID_DURATION',
        },
      };
    }

    const mcqMarks = Math.max(1, Number(marksConfig?.mcq) || 1);
    const s2Marks = Math.max(1, Number(marksConfig?.short_2) || 2);
    const s3Marks = Math.max(1, Number(marksConfig?.short_3) || 3);
    const csMarks = Math.max(1, Number(marksConfig?.case_study) || 4);
    const l5Marks = Math.max(1, Number(marksConfig?.long_5) || 5);

    const questions: any[] = [];
    let calculatedTotalMarks = 0;

    for (let i = 0; i < mcqC; i++) {
      const ch = selectedChapters[(i + epoch) % selectedChapters.length];
      const ctx = getChapterContext(cleanSubject, ch, effectiveClassLevel);
      const q = buildDynamicMCQ(ctx, i, mcqMarks, difficulty, instructions, recentSet, epoch);
      questions.push(q);
      calculatedTotalMarks += mcqMarks;
    }

    for (let i = 0; i < s2C; i++) {
      const ch = selectedChapters[(i + epoch) % selectedChapters.length];
      const ctx = getChapterContext(cleanSubject, ch, effectiveClassLevel);
      const q = buildShort2Question(ctx, i, s2Marks, difficulty, instructions, recentSet, epoch);
      questions.push(q);
      calculatedTotalMarks += s2Marks;
    }

    for (let i = 0; i < s3C; i++) {
      const ch = selectedChapters[(i + epoch) % selectedChapters.length];
      const ctx = getChapterContext(cleanSubject, ch, effectiveClassLevel);
      const q = buildShort3Question(ctx, i, s3Marks, difficulty, instructions, recentSet, epoch);
      questions.push(q);
      calculatedTotalMarks += s3Marks;
    }

    for (let i = 0; i < csC; i++) {
      const ch = selectedChapters[(i + epoch) % selectedChapters.length];
      const ctx = getChapterContext(cleanSubject, ch, effectiveClassLevel);
      const q = buildCaseStudyQuestion(ctx, i, csMarks, difficulty, instructions, recentSet, epoch);
      questions.push(q);
      calculatedTotalMarks += csMarks;
    }

    for (let i = 0; i < l5C; i++) {
      const ch = selectedChapters[(i + epoch) % selectedChapters.length];
      const ctx = getChapterContext(cleanSubject, ch, effectiveClassLevel);
      const q = buildLong5Question(ctx, i, l5Marks, difficulty, instructions, recentSet, epoch);
      questions.push(q);
      calculatedTotalMarks += l5Marks;
    }

    const defaultExamName =
      resolvedClassLevel === 'Class 12'
        ? 'CBSE Class 12 Term Examination'
        : 'Class 11 Term Examination';
    const examName = paperConfig?.examName || defaultExamName;
    const generalInstructions = Array.isArray(paperConfig?.generalInstructions) && paperConfig!.generalInstructions.length > 0
      ? paperConfig!.generalInstructions
      : [
          'All questions are compulsory.',
          'The question paper consists of sections corresponding to the configured blueprint.',
          'Marks for each question are indicated on the right-hand margin.',
        ];

    const quiz: any = {
      id: `quiz-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      title: examName,
      chapter: selectedChapters.join(', '),
      chapters: selectedChapters,
      subject: cleanSubject,
      stream,
      classLevel: effectiveClassLevel,
      difficulty,
      questionType: 'mixed',
      timeLimitSeconds: durationMin * 60,
      description: `${effectiveClassLevel} ${cleanSubject} Question Paper covering ${selectedChapters.join(', ')} (${calculatedTotalMarks} Marks, ${durationMin} Mins).`,
      createdBy: teacherName,
      createdAt: Date.now(),
      source: 'ai',
      isQuestionPaper: true,
      instructions,
      modelUsed: modelLabel,
      questionsCountByType: {
        mcq: mcqC,
        short_2: s2C,
        short_3: s3C,
        case_study: csC,
        long_5: l5C,
      },
      marksConfig: {
        mcq: mcqMarks,
        short_2: s2Marks,
        short_3: s3Marks,
        case_study: csMarks,
        long_5: l5Marks,
      },
      paperConfig: {
        examName,
        examDate: paperConfig?.examDate || new Date().toISOString().split('T')[0],
        durationMinutes: durationMin,
        generalInstructions,
        totalMarks: calculatedTotalMarks,
        isQuestionPaper: true,
      },
      questions,
    };

    if (assignmentMode === 'skip' || (assignmentMode as any) === 'none') {
      quiz.assignmentMode = 'skip';
      quiz.assignedStudentIds = [];
      quiz.assignedStudentNames = [];
    } else if (Array.isArray(assignedStudentIds) && assignedStudentIds.length > 0) {
      quiz.assignedStudentIds = Array.from(new Set(assignedStudentIds));
      quiz.assignedStudentNames = Array.isArray(assignedStudentNames) ? assignedStudentNames : undefined;
      quiz.assignmentMode = assignmentMode || 'individual';
      quiz.assignedAt = Date.now();
    }

    return {
      status: 200,
      body: {
        success: true,
        quiz,
        modelUsed: modelLabel,
      },
    };
  }

  // Speed Quiz Mode
  const clampedCount = Math.min(30, Math.max(1, Number(questionCount) || 10));
  const questions: any[] = [];

  for (let i = 0; i < clampedCount; i++) {
    const ch = selectedChapters[(i + epoch) % selectedChapters.length];
    const ctx = getChapterContext(cleanSubject, ch, effectiveClassLevel);
    const q = buildDynamicMCQ(ctx, i, 1, difficulty, instructions, recentSet, epoch);
    q.questionType = questionType || 'mcq';
    questions.push(q);
  }

  const quiz: any = {
    id: `quiz-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    title: `${cleanSubject} — ${selectedChapters.length === 1 ? selectedChapters[0] : 'Curriculum Mastery'}`,
    chapter: selectedChapters.join(', '),
    chapters: selectedChapters,
    subject: cleanSubject,
    stream,
    classLevel: effectiveClassLevel,
    difficulty,
    questionType: questionType || 'mixed',
    timeLimitSeconds: Math.max(25, clampedCount * 45),
    description: `${effectiveClassLevel} ${stream} ${cleanSubject} examination quiz covering ${selectedChapters.join(', ')}.`,
    createdBy: teacherName,
    createdAt: Date.now(),
    source: 'ai',
    instructions,
    modelUsed: modelLabel,
    questions,
  };

  if (assignmentMode === 'skip' || (assignmentMode as any) === 'none') {
    quiz.assignmentMode = 'skip';
    quiz.assignedStudentIds = [];
    quiz.assignedStudentNames = [];
  } else if (Array.isArray(assignedStudentIds) && assignedStudentIds.length > 0) {
    quiz.assignedStudentIds = Array.from(new Set(assignedStudentIds));
    quiz.assignedStudentNames = Array.isArray(assignedStudentNames) ? assignedStudentNames : undefined;
    quiz.assignmentMode = assignmentMode || 'individual';
    quiz.assignedAt = Date.now();
  }

  return {
    status: 200,
    body: {
      success: true,
      quiz,
      modelUsed: modelLabel,
    },
  };
}

/**
 * Synthesizes a single replacement question for `/api/gemini/quiz/regenerate-question`.
 */
export function synthesizeRegeneratedQuestion(
  payload: any,
  modelLabel = 'gemini-3-flash-preview'
): { status: number; body: any } {
  const {
    classLevel = 'Class 11TH',
    subject,
    chapter,
    difficulty = 'Medium',
    questionType = 'mcq',
    currentQuestionText = '',
    recentQuestions = [],
    instructions = '',
    targetMarks = 1,
  } = payload || {};

  if (!subject || typeof subject !== 'string' || !subject.trim()) {
    return {
      status: 400,
      body: { error: 'Subject is required.' },
    };
  }

  generationEpochCounter += 1;
  const epoch = generationEpochCounter;
  const recentSet = buildRecentSignatureSet([
    ...(Array.isArray(recentQuestions) ? recentQuestions : []),
    ...(currentQuestionText ? [currentQuestionText] : []),
  ]);

  const cleanSubject = subject.trim();
  const ctx = getChapterContext(cleanSubject, chapter || '', classLevel);
  const randIdx = epoch;

  let question: any;
  if (questionType === 'case_study') {
    question = buildCaseStudyQuestion(ctx, randIdx, Number(targetMarks) || 4, difficulty, instructions, recentSet, epoch);
  } else if (questionType === 'short_2') {
    question = buildShort2Question(ctx, randIdx, Number(targetMarks) || 2, difficulty, instructions, recentSet, epoch);
  } else if (questionType === 'short_3') {
    question = buildShort3Question(ctx, randIdx, Number(targetMarks) || 3, difficulty, instructions, recentSet, epoch);
  } else if (questionType === 'long_5') {
    question = buildLong5Question(ctx, randIdx, Number(targetMarks) || 5, difficulty, instructions, recentSet, epoch);
  } else {
    question = buildDynamicMCQ(ctx, randIdx, Number(targetMarks) || 1, difficulty, instructions, recentSet, epoch);
  }

  return {
    status: 200,
    body: {
      success: true,
      question,
      modelUsed: modelLabel,
    },
  };
}

/**
 * Synthesizes an academic copilot reply for `/api/gemini/chat` when running in standalone APK mode.
 */
export function synthesizeAcademicChatReply(payload: any): { status: number; body: any } {
  const prompt = payload?.prompt;
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return {
      status: 400,
      body: { error: 'A valid text prompt is required.' },
    };
  }

  const cleanPrompt = prompt.trim();
  const matchedSubject = Object.keys(CBSE_CURRICULUM).find((sub) =>
    cleanPrompt.toLowerCase().includes(sub.toLowerCase())
  );
  const curriculum = matchedSubject ? CBSE_CURRICULUM[matchedSubject] : CBSE_CURRICULUM.Physics;
  const topChapters = curriculum.chapters.slice(0, 3).map((c) => `**Ch ${c.number}: ${c.title}** (${(c.keyTopics || []).join(', ')})`);

  const reply = `### NEXORA Academic Copilot — ${curriculum.subject} (${curriculum.classLevel})
**Query Focus:** *${cleanPrompt}*

1. **Core NCERT Conceptual Framework:**
   - Grounded in the official **${curriculum.curriculumSource}** (${curriculum.academicSession}).
   - Key chapters aligned with your query:
     - ${topChapters.join('\n     - ')}

2. **Step-by-Step Academic Breakdown:**
   - **Principle & Definition:** Begin every board answer with the precise NCERT statement, defining all symbols and their SI units.
   - **Analytical / Mathematical Formulation:** State the governing formula clearly, verify dimensional homogeneity, and substitute values in standard units.
   - **Exam Tip (Alka Mam's Guidelines):** Highlight the final result inside a box and include a labeled schematic diagram wherever applicable for full CBSE step-marking credit.`;

  return {
    status: 200,
    body: { reply },
  };
}
