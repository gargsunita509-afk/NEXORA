/**
 * CBSE CLASS 11 ENGLISH CORE (CODE NO. 301) — CURRICULUM SPECIFICATION
 * Academic Session: 2026–2027
 * Official Reference: https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/English_core_SecP2_2026-27.pdf
 * Prescribed Textbooks (NCERT):
 * 1. Hornbill: Textbook published by NCERT, New Delhi
 * 2. Snapshots: Supplementary Reader published by NCERT, New Delhi
 */

export interface EnglishLiteratureItem {
  id: string;
  book: 'Hornbill Prose' | 'Hornbill Poetry' | 'Snapshots';
  type: 'prose' | 'poetry' | 'supplementary';
  number: number;
  title: string;
  author: string;
  theme: string;
  keyMoments?: string[];
  sampleExtract?: string;
  samplePoemLines?: string;
}

export interface EnglishReadingSkillConfig {
  id: 'unseen_discursive' | 'case_based' | 'note_making' | 'summary_writing';
  title: string;
  description: string;
  defaultMarks: number;
  allowedMarks: number[];
  wordLimit: string;
  questionFormats: string[];
  samplePassageTheme: string;
}

export interface EnglishGrammarTopic {
  id: 'tenses' | 'clauses' | 'reordering' | 'transformation';
  title: string;
  category: 'official_cbse';
  description: string;
  defaultQuestionCount: number;
  defaultMarksPerQuestion: number;
  ruleSummary: string;
  sampleQuestion: {
    prompt: string;
    options?: string[];
    correctAnswer: string;
    explanation: string;
  };
}

export interface EnglishCustomGrammarTopic {
  id: 'modals' | 'determiners' | 'active_passive';
  title: string;
  category: 'custom_practice';
  description: string;
  defaultQuestionCount: number;
  defaultMarksPerQuestion: number;
}

export interface EnglishWritingTask {
  id: 'classified_advertisement' | 'poster_writing' | 'speech_writing' | 'debate_writing';
  title: string;
  category: 'short_writing' | 'long_writing';
  officialMarks: number;
  wordLimit: string;
  formatRubric: string;
  contentRubric: string;
  expressionRubric: string;
  samplePrompts: string[];
}

// -----------------------------------------------------------------------------
// 1. HORNBILL & SNAPSHOTS PRESCRIBED CHAPTERS (OFFICIAL 2026–27)
// -----------------------------------------------------------------------------

export const HORNBILL_PROSE_CHAPTERS: EnglishLiteratureItem[] = [
  {
    id: 'hornbill-prose-1',
    book: 'Hornbill Prose',
    type: 'prose',
    number: 1,
    title: 'The Portrait of a Lady',
    author: 'Khushwant Singh',
    theme: 'Three phases of bond between author and grandmother, traditional values, spiritual detachment, mourning sparrows',
    keyMoments: [
      'Grandmother in village feeding dogs and taking author to temple school',
      'Turning point upon moving to city; grandmother disapproves of English school & music',
      'Grandmother feeding sparrows in verandah with happiest half-hour',
      'Welcoming author back from abroad with songs of homecoming warriors',
      'Grandmother peaceful demise with rosary; sparrows sitting quietly without touching bread crumbs',
    ],
    sampleExtract:
      'She had always been short and fat and slightly bent. Her face was a criss-cross of wrinkles running from everywhere to everywhere. No, we were certain she had always been as we had known her. Old, so terribly old that she could not have grown older, and had stayed at the same age for twenty years.',
  },
  {
    id: 'hornbill-prose-2',
    book: 'Hornbill Prose',
    type: 'prose',
    number: 2,
    title: "We're Not Afraid to Die... if We Can All Be Together",
    author: 'Gordon Cook and Alan East',
    theme: 'Voyage on Wavewalker, extreme storm survival, courage, optimism of young children (Jonathan and Suzanne)',
    keyMoments: [
      'Setting sail from Plymouth replicating Captain James Cook round-the-world voyage',
      'Encountering roaring gales and monstrous waves in southern Indian Ocean on Jan 2',
      'Wavewalker smashed by colossal wave; captain injured, water filling decks',
      "Jonathan brave declaration: 'We aren't afraid of dying if we can all be together'",
      'Navigating pinpoint course to pinprick island of Ile Amsterdam',
    ],
    sampleExtract:
      'At dawn on January 2, the waves were gigantic. We were sailing with only a small storm jib and were still making eight knots. As the ship rose to the top of each wave we could see endless enormous seas rolling towards us, and the screaming of the wind and spray was painful to the ears.',
  },
  {
    id: 'hornbill-prose-3',
    book: 'Hornbill Prose',
    type: 'prose',
    number: 3,
    title: 'Discovering Tut: the Saga Continues',
    author: 'A.R. Williams',
    theme: 'Pharaoh Tutankhamun, Howard Carter 1922 discovery, 2005 CT scan, ancient Egyptian funeral rites, forensic reconstruction',
    keyMoments: [
      'Tut boy king taking throne at young age; abrupt mysterious death',
      'Howard Carter discovering golden coffin in 1922; resin chiseling dilemma',
      'Anatomy professor 1968 X-ray revealing missing breastbone and front ribs',
      'Zahi Hawass leading multi-slice portable CT scan on Tut mummy in Valley of the Kings',
      'Atmospheric sandstorm halting during scan, revealing tranquil constellation Orion',
    ],
    sampleExtract:
      'He was just a teenager when he died. The last heir of a powerful family that had ruled Egypt and its empire for centuries, he was laid to rest laden with gold and eventually forgotten. Since the discovery of his tomb in 1922, the modern world has speculated about what happened to him, with murder being the most extreme possibility.',
  },
  {
    id: 'hornbill-prose-4',
    book: 'Hornbill Prose',
    type: 'prose',
    number: 4,
    title: 'The Adventure',
    author: 'Jayant Narlikar',
    theme: 'Alternate history, catastrophic theory, quantum physics bifurcation, Battle of Panipat outcome, Gangadharpant Gaitonde journey',
    keyMoments: [
      'Professor Gaitonde colliding with truck, waking in alternate Bombay with East India Company rule',
      'Visiting town hall library, discovering Bakhar text showing Maratha victory at Third Battle of Panipat',
      'Vishwasrao narrowly escaping bullet that grazes his ear instead of killing him',
      'Gaitonde speaking at Azad Maidan public meeting, evading tomatoes and chair hurling',
      'Rajendra Deshpande explaining transition theory via catastrophic bifurcation in quantum reality',
    ],
    sampleExtract:
      'The battle was blowing out of control. Then Vishwasrao guided his horse to the meele where the elite troops were fighting. The bullet brushed past his ear. By the margin of an inch, history was changed! In that parallel trajectory, the Marathas did not lose morale.',
  },
  {
    id: 'hornbill-prose-5',
    book: 'Hornbill Prose',
    type: 'prose',
    number: 5,
    title: 'Silk Road',
    author: 'Nick Middleton',
    theme: 'High altitude travelogue, Mount Kailash Kora pilgrimage, Tibetan plateau, salt flats, Darchen settling, Norbu companionship',
    keyMoments: [
      'Leaving Ravu with Tsetan and Daniel; Lhamo gifting drokba sheepskin coat',
      'Encountering fierce Tibetan mastiffs guarding nomad tents along ancient Silk Road',
      'Crossing Tseti Pass at 5,515 meters, seeing salt lake with trucks hauling salt',
      'Arriving at desolate, filthy town of Darchen; narrator falling sick with blocked nasal sinuses',
      'Doctor at Darchen Tibetan medical college prescribing herbal powders; meeting English-speaking academic Norbu',
    ],
    sampleExtract:
      'As we passed nomad tents pitched in lonely isolation, there would usually be a huge black dog, a Tibetan mastiff, standing guard. These beasts would cock their great big heads when they became aware of our approach and fix us in their sights. As we drew nearer, they would explode into action, speeding directly towards us like a bullet from a gun.',
  },
];

export const HORNBILL_POETRY_POEMS: EnglishLiteratureItem[] = [
  {
    id: 'hornbill-poetry-1',
    book: 'Hornbill Poetry',
    type: 'poetry',
    number: 1,
    title: 'A Photograph',
    author: 'Shirley Toulson',
    theme: 'Transience of human life vs eternity of sea, mother youth snapshot at beach, maternal loss, silent grief',
    keyMoments: [
      'Cardboard frame holding photo of mother aged twelve with cousins Betty and Dolly',
      'Uncle taking photo with camera smiling through flying hair at sea beach',
      'The sea washing their terribly transient feet (symbol of permanence vs mortal mortality)',
      'Mother laughing at snapshot twenty-thirty years later reminiscing childhood fashion',
      'Mother deceased for nearly as many years; its silence silences',
    ],
    samplePoemLines: `The cardboard shows me how it was
When the two girl cousins went paddling,
Each one holding one of my mother’s hands,
And she the big girl — some twelve years or so.
All three stood still to smile through their hair
At the uncle with the camera. A sweet face,
My mother’s, that was before I was born.
And the sea, which appears to have changed less,
Washed their terribly transient feet.`,
  },
  {
    id: 'hornbill-poetry-2',
    book: 'Hornbill Poetry',
    type: 'poetry',
    number: 2,
    title: 'The Laburnum Top',
    author: 'Ted Hughes',
    theme: 'Mutual dependence in nature, silence broken by goldfinch arrival, tree as engine of bird family, sudden return to empty silence',
    keyMoments: [
      'Laburnum top silent and still in yellow September afternoon sunlight',
      'Goldfinch twitching arrival with suddenness, startlement at branch end',
      'Entering sleek like a lizard; machine of chitterings and tremor of wings bursting alive',
      'She stokes the engine of her family, showing barred face identity mask',
      'Flying away into the infinite; laburnum subsides to empty void again',
    ],
    samplePoemLines: `The Laburnum top is silent, quite still
In the afternoon yellow September sunlight,
A few leaves yellowing, all its seeds fallen.
Till the goldfinch comes, with a twitching chirrup
A suddenness, a startlement, at a branch end.
Then sleek as a lizard, and alert, and abrupt,
She enters the thickness, and a machine starts up
Of chitterings, and a tremor of wings, and trillings —
The whole tree trembles and thrills.`,
  },
  {
    id: 'hornbill-poetry-3',
    book: 'Hornbill Poetry',
    type: 'poetry',
    number: 3,
    title: 'The Voice of the Rain',
    author: 'Walt Whitman',
    theme: 'Cyclical journey of rain compared to poetry/song, origin in bottomless earth/sea, rebirth and purification of drought-stricken earth',
    keyMoments: [
      "Poet asking soft-falling shower 'Who art thou?'; rain answering strangely in poem translation",
      "Rain proclaiming itself 'Poem of Earth', rising impalpable out of land and sea",
      'Ascending to heaven, vaguely formed, changed yet same',
      'Descending to lave drouths, atomies, dust layers of globe',
      'Reck’d or unreck’d duly with love returns, parallel to singer’s song returning with fulfillment',
    ],
    samplePoemLines: `And who art thou? said I to the soft-falling shower,
Which, strange to tell, gave me an answer, as here translated:
I am the Poem of Earth, said the voice of the rain,
Eternal I rise impalpable out of the land and the bottomless sea,
Upward to heaven, whence, vaguely form'd, altogether changed, and yet the same,
I descend to lave the drouths, atomies, dust-layers of the globe,
And all that in them without me were seeds only, latent, unborn.`,
  },
  {
    id: 'hornbill-poetry-4',
    book: 'Hornbill Poetry',
    type: 'poetry',
    number: 4,
    title: 'Childhood',
    author: 'Markus Natten',
    theme: 'Stages of growing up, loss of innocence, realizing hypocrisy of adults, discovering individuality, emergence of rational mind',
    keyMoments: [
      'Pondering when childhood vanished: turning eleven, realizing Hell and Heaven not found in geography',
      'Realizing adults are not all they preach: talking of love but not practicing it lovingly',
      'Discovering one’s own mind: producing thoughts that are uniquely one’s own',
      'Realizing where childhood went: hidden in an infant’s innocent face',
    ],
    samplePoemLines: `When did my childhood go?
Was it the day I ceased to be eleven,
Was it the time I realised that Hell and Heaven,
Could not be found in Geography,
And therefore could not be,
Was that the day!

When did my childhood go?
Was it the time I realised that adults were not
All they seemed to be,
They talked of love and preached of love,
But did not act so lovingly,
Was that the day!`,
  },
  {
    id: 'hornbill-poetry-5',
    book: 'Hornbill Poetry',
    type: 'poetry',
    number: 5,
    title: 'Father to Son',
    author: 'Elizabeth Jennings',
    theme: 'Generational communication gap, longing for reconciliation, grief of emotional estrangement between father and grown son',
    keyMoments: [
      'Father lamenting lack of understanding despite living in same house for years',
      'Trying to build relationship from nursery memories, feeling land is stranger’s territory',
      'Speaking like strangers; silence surrounding their interactions',
      'Willing to forgive prodigal son returning home rather than seeing him build strange world',
      'Both putting out empty hand with hearts yearning for forgiveness',
    ],
    samplePoemLines: `I do not understand this child
Though we have lived together now
In the same house for years. I know
Nothing of him, so try to build
Up a relationship from how
He was when small. Yet have I killed
The seed I spent or sown it where
The land is his and none of mine?
We speak like strangers, there's no sign
Of understanding in the air.`,
  },
];

export const SNAPSHOTS_CHAPTERS: EnglishLiteratureItem[] = [
  {
    id: 'snapshots-1',
    book: 'Snapshots',
    type: 'supplementary',
    number: 1,
    title: 'The Summer of the Beautiful White Horse',
    author: 'William Saroyan',
    theme: 'Armenian Garoghlanian tribe, pride in honesty, boyhood riding passion, Mourad and Aram, John Byro farmer encounter',
    keyMoments: [
      'Mourad tapping on Aram window at 4 AM riding magnificent white horse',
      'Aram torn between poverty-stricken Garoghlanian honesty and longing to ride',
      'Hiding horse in deserted barn of farmer Fetvajian',
      'Farmer John Byro visiting house, stating loss of stolen horse; Uncle Khosrove shouting: It is no harm, pay no attention to it!',
      'Encountering Byro on road; Byro examining teeth, declaring horse must be twin due to trust in tribe honesty',
      'Boys returning horse quietly next morning to Byro barn',
    ],
    sampleExtract:
      'One day back there in the good old days when I was nine and the world was full of every imaginable kind of magnificence, and life was still a delightful and mysterious dream, my cousin Mourad, who was considered crazy by everybody who knew him except me, came to my house at four in the morning and woke me up tapping on the window of my room.',
  },
  {
    id: 'snapshots-2',
    book: 'Snapshots',
    type: 'supplementary',
    number: 2,
    title: 'The Address',
    author: 'Marga Minco',
    theme: 'Post-WWII Holland, Jewish holocaust survivor returning to claim family possessions, trauma of war, decision to forget the address',
    keyMoments: [
      'Narrator knocking on door of Number 46, Marconi Street; Mrs. Dorling refuses entry wearing mother green cardigan',
      'Narrator recalling wartime visits when Mrs. Dorling took silver cutlery and antique vases under pretext of safekeeping',
      'Second visit; Mrs. Dorling daughter opening door, leading narrator into living room',
      'Seeing familiar objects (Hanukkah menorah, pewter teapot, silver spoons) kept tasteless in strange surroundings',
      'Realizing objects lost emotional value detached from mother and former home; deciding to forget address forever',
    ],
    sampleExtract:
      "'Do you still know me?' I asked. The woman looked at me searchingly. She had opened the door a chink. I came closer and stood on the step. 'No, I don't know you.' 'I am Mrs. S’s daughter.' She held her hand on the door as though she wished to prevent it opening any further. Her face gave absolutely no sign of recognition.",
  },
  {
    id: 'snapshots-3',
    book: 'Snapshots',
    type: 'supplementary',
    number: 3,
    title: "Mother's Day",
    author: 'J.B. Priestley',
    theme: 'Unappreciated housewife, status of mother in family, personality exchange comedy, teaching family mutual respect',
    keyMoments: [
      'Mrs. Annie Pearson treated like unpaid servant by husband George and children Doris and Cyril',
      'Neighbor Mrs. Fitzgerald using fortune-telling magic to swap personalities with Mrs. Pearson',
      'New stern Mrs. Pearson smoking cigarette, drinking stout, refusing to iron Doris yellow silk or make Cyril tea',
      'George Pearson confronted about being mocked as Pompy-Ompy Pearson at local club',
      'Family thoroughly humbled; swapping personalities back to enjoy respectful family card game',
    ],
    sampleExtract:
      "MRS FITZGERALD: Now listen, Mrs Pearson. If you want them to behave like human beings, you've got to show them who's boss. You've got to put your foot down. MRS PEARSON: I know I ought to — but it's so difficult. I love them so, and I hate making an unpleasantness.",
  },
  {
    id: 'snapshots-4',
    book: 'Snapshots',
    type: 'supplementary',
    number: 4,
    title: 'Birth',
    author: 'A.J. Cronin',
    theme: 'Medical dedication, miraculous resuscitation of stillborn baby, Joe and Susan Morgan, Andrew Manson career milestone',
    keyMoments: [
      'Dr. Andrew Manson returning weary at midnight to find miner Joe Morgan waiting anxiously',
      'Susan Morgan in difficult labor for their first child after twenty years of marriage',
      'Child born lifeless, pale with white asphyxia pallor; midwife shoves baby under bed among dirty newspapers',
      'Andrew first reviving collapsed mother with hypodermic injection, then retrieving stillborn child',
      'Using alternate hot and cold basin immersion, chest friction, blowing breath; child miraculously gasps alive',
      "Andrew walking home at dawn crying: 'I've done something; oh, God! I've done something real at last.'",
    ],
    sampleExtract:
      'Though it was nearly midnight when Andrew reached Bryngower, he found Joe Morgan waiting for him, pacing up and down with short steps between the closed surgery and the entrance to the house. At the sight of him the burly driller’s face expressed relief. ‘Doctor, I’m glad to see you. I been back and forth this last hour.’',
  },
  {
    id: 'snapshots-5',
    book: 'Snapshots',
    type: 'supplementary',
    number: 5,
    title: 'The Tale of Melon City',
    author: 'Vikram Seth',
    theme: 'Satirical verse narrative, foolish governance, laissez-faire absurdity, hanging of arch, king hanged, melon crowned as ruler',
    keyMoments: [
      'Just and placid king ordering ceremonial triumphal arch to be built across thoroughfare',
      'King crown knocked off riding under low arch; king angrily orders builders hanged',
      'Blame shifted sequentially: builders → masons → architect → king himself who made changes',
      'Wise old man advising that the guilty arch itself must be hanged',
      'Crowd demands execution; king decree that whoever fits the gallows noose will hang; only king fits noose!',
      'Tradition that next person passing city gate names king; idiot answers: A Melon!; melon placed on throne',
    ],
    sampleExtract:
      `In the city of which I sing
There was a just and placid King.
He proclaimed an arch should be
Constructed, that triumphantly
Would span the major thoroughfare
To edify the spectators there.
The workmen went and built the thing.
They did so since he was the King.`,
  },
];

// Complete Literature Registry
export const ALL_ENGLISH_LITERATURE: EnglishLiteratureItem[] = [
  ...HORNBILL_PROSE_CHAPTERS,
  ...HORNBILL_POETRY_POEMS,
  ...SNAPSHOTS_CHAPTERS,
];

// -----------------------------------------------------------------------------
// 2. READING SKILLS SPECIFICATION (OFFICIAL 2026–27 — 26 MARKS)
// -----------------------------------------------------------------------------

export const ENGLISH_READING_SKILLS: EnglishReadingSkillConfig[] = [
  {
    id: 'unseen_discursive',
    title: 'Unseen Comprehension Passage',
    description:
      'Factual, descriptive, or literary discursive passage (600–750 words) assessing inference, interpretation, analysis, and vocabulary.',
    defaultMarks: 10,
    allowedMarks: [8, 10, 12],
    wordLimit: '600–750 words',
    questionFormats: ['MCQs', 'Objective Type', 'Short Answer'],
    samplePassageTheme: 'Impact of Artificial Intelligence on Cognitive Development and Critical Thinking',
  },
  {
    id: 'case_based',
    title: 'Case-Based Unseen Passage',
    description:
      'Factual passage with statistical data, charts, verbal inputs, or tables (350–400 words) assessing data interpretation and analytical reasoning.',
    defaultMarks: 8,
    allowedMarks: [6, 8, 10],
    wordLimit: '350–400 words + Data/Table',
    questionFormats: ['MCQs', 'Objective Evidence Matching', 'Data Verification'],
    samplePassageTheme: 'Global Renewable Energy Transitions and Decarbonization Targets (2020–2026)',
  },
  {
    id: 'note_making',
    title: 'Note-Making & Abbreviation Key',
    description:
      'Passage of 200–250 words to be condensed into structured, numbered, indented notes with minimum 4 standard abbreviations and a key glossary.',
    defaultMarks: 5,
    allowedMarks: [4, 5, 6],
    wordLimit: '200–250 words',
    questionFormats: ['Title (1m)', 'Numbering & Indenting (1m)', 'Abbreviation Key (1m)', 'Notes Content (2m)'],
    samplePassageTheme: 'The Art of Deep Reading and Attention Span Restoration in the Digital Era',
  },
  {
    id: 'summary_writing',
    title: 'Summary Writing',
    description:
      'Concise summary based on the Note-Making passage within the syllabus-prescribed limit of up to 50 words.',
    defaultMarks: 3,
    allowedMarks: [2, 3, 4],
    wordLimit: 'Up to 50 words',
    questionFormats: ['Content (2m)', 'Expression & Accuracy (1m)'],
    samplePassageTheme: 'Summary based on deep reading and attention span passage',
  },
];

// -----------------------------------------------------------------------------
// 3. GRAMMAR SPECIFICATION (OFFICIAL 2026–27 — 7 MARKS)
// -----------------------------------------------------------------------------

export const OFFICIAL_CBSE_GRAMMAR_TOPICS: EnglishGrammarTopic[] = [
  {
    id: 'tenses',
    title: 'Gap Filling — Tenses',
    category: 'official_cbse',
    description: 'Gap-filling sentences testing correct tense forms, subject-verb agreement, and time markers.',
    defaultQuestionCount: 2,
    defaultMarksPerQuestion: 1,
    ruleSummary: 'Past perfect vs simple past, present continuous for near future, conditional tenses, reporting sequence.',
    sampleQuestion: {
      prompt: 'By the time the medical rescue team arrived, the injured hikers _______ (take) shelter inside the cave.',
      options: ['took', 'have taken', 'had taken', 'were taking'],
      correctAnswer: 'had taken',
      explanation:
        "The past perfect tense 'had taken' indicates an action completed prior to another past event ('the medical rescue team arrived').",
    },
  },
  {
    id: 'clauses',
    title: 'Gap Filling — Clauses',
    category: 'official_cbse',
    description: 'Noun clauses, relative clauses, and adverbial clauses of condition, concession, and time.',
    defaultQuestionCount: 2,
    defaultMarksPerQuestion: 1,
    ruleSummary: 'Relative pronouns (who, whom, whose, which, that), subordinate conjunctions (although, unless, since).',
    sampleQuestion: {
      prompt: 'The young physicist _______ groundbreaking paper was published last week will deliver the keynote address.',
      options: ['who', 'whom', 'whose', 'which'],
      correctAnswer: 'whose',
      explanation:
        "The possessive relative pronoun 'whose' is required to show ownership of the 'groundbreaking paper'.",
    },
  },
  {
    id: 'reordering',
    title: 'Reordering of Sentences',
    category: 'official_cbse',
    description: 'Rearranging jumbled word clusters or phrases into grammatically coherent, meaningful English sentences.',
    defaultQuestionCount: 2,
    defaultMarksPerQuestion: 1,
    ruleSummary: 'Subject + Verb + Object word order, adverb positioning, prepositional phrase alignment.',
    sampleQuestion: {
      prompt:
        'Rearrange the following words/phrases to make a meaningful sentence:\nin the laboratory / breakthroughs / persistent dedication / often leads / to scientific',
      options: [
        'Persistent dedication often leads to scientific breakthroughs in the laboratory.',
        'In the laboratory scientific breakthroughs often leads persistent dedication.',
        'To scientific breakthroughs in the laboratory persistent dedication often leads.',
        'Often leads persistent dedication to scientific breakthroughs in the laboratory.',
      ],
      correctAnswer: 'Persistent dedication often leads to scientific breakthroughs in the laboratory.',
      explanation: 'Follows standard English syntax: Subject (Persistent dedication) + Adverb (often) + Verb (leads to) + Object (scientific breakthroughs) + Adverbial of place (in the laboratory).',
    },
  },
  {
    id: 'transformation',
    title: 'Transformation of Sentences',
    category: 'official_cbse',
    description: 'Changing sentence structures (Affirmative to Negative, Simple to Complex/Compound, Degrees of Comparison, Question Tags) without altering meaning.',
    defaultQuestionCount: 2,
    defaultMarksPerQuestion: 1,
    ruleSummary: 'No sooner... than, As soon as, too... to into so... that, Degree shifts without changing core sense.',
    sampleQuestion: {
      prompt: "Transform into a negative sentence without changing meaning: 'He is too proud to acknowledge his error.'",
      options: [
        'He is so proud that he will not acknowledge his error.',
        'He is not proud enough to acknowledge his error.',
        'He is proud but he acknowledges his error.',
        'He cannot acknowledge his error because he is proud.',
      ],
      correctAnswer: 'He is so proud that he will not acknowledge his error.',
      explanation: "'Too + adjective + to-infinitive' converts into 'so + adjective + that + subject + cannot/will not + verb' in standard transformation.",
    },
  },
];

export const CUSTOM_PRACTICE_GRAMMAR_TOPICS: EnglishCustomGrammarTopic[] = [
  {
    id: 'modals',
    title: 'Modals (Custom Practice)',
    category: 'custom_practice',
    description: 'Expressing necessity, permission, obligation, probability (must, ought to, should, might).',
    defaultQuestionCount: 2,
    defaultMarksPerQuestion: 1,
  },
  {
    id: 'determiners',
    title: 'Determiners (Custom Practice)',
    category: 'custom_practice',
    description: 'Articles, quantifiers, demonstratives, and distributive determiners.',
    defaultQuestionCount: 2,
    defaultMarksPerQuestion: 1,
  },
  {
    id: 'active_passive',
    title: 'Active & Passive Voice (Custom Practice)',
    category: 'custom_practice',
    description: 'Converting active voice to passive voice with agent deletion where applicable.',
    defaultQuestionCount: 2,
    defaultMarksPerQuestion: 1,
  },
];

// -----------------------------------------------------------------------------
// 4. CREATIVE WRITING SKILLS SPECIFICATION (OFFICIAL 2026–27 — 16 MARKS)
// -----------------------------------------------------------------------------

export const ENGLISH_WRITING_TASKS: EnglishWritingTask[] = [
  {
    id: 'classified_advertisement',
    title: 'Classified Advertisements',
    category: 'short_writing',
    officialMarks: 3,
    wordLimit: 'Up to 50 words',
    formatRubric: '1 Mark: Box enclosure, proper heading/category (e.g. SITUATION VACANT, FOR SALE, TO LET)',
    contentRubric: '1 Mark: Necessary details (qualifications, contact address, phone, email, specifications)',
    expressionRubric: '1 Mark: Grammatical accuracy, spelling, concise formal tone',
    samplePrompts: [
      'You are Principal of St. Xavier School, New Delhi. Draft a classified advertisement for the column "SITUATION VACANT" inviting applications for the post of PGT English. Mention qualifications, experience, and perks in not more than 50 words.',
      'You want to sell your newly renovated 3-BHK flat in Sector 14, Rohini. Draft an advertisement for the "FOR SALE" column of a national daily with essential details (max 50 words).',
    ],
  },
  {
    id: 'poster_writing',
    title: 'Poster Writing',
    category: 'short_writing',
    officialMarks: 3,
    wordLimit: 'Up to 50 words',
    formatRubric: '1 Mark: Box enclosure, catchy title/slogan, issuing authority details',
    contentRubric: '1 Mark: Visual elements, relevant message, date/venue/timing or cause details',
    expressionRubric: '1 Mark: Creative layout, rhythm, persuasive language, and impact',
    samplePrompts: [
      'Draft a visually impactful poster on behalf of Delhi Traffic Police to create awareness against the hazards of underage driving and road rage (within 50 words).',
      'Design a poster to promote "Water Conservation and Rainwater Harvesting" for your school environmental club annual campaign (within 50 words).',
    ],
  },
  {
    id: 'speech_writing',
    title: 'Speech Writing',
    category: 'long_writing',
    officialMarks: 5,
    wordLimit: '120–150 words',
    formatRubric: '1 Mark: Formal salutation (Respected Principal, teachers, and friends) and formal conclusion (Thank you)',
    contentRubric: '2 Marks: Clear development of ideas, persuasive arguments, facts, examples',
    expressionRubric: '2 Marks: Flow of language, coherence, vocabulary, and grammatical accuracy',
    samplePrompts: [
      'You are Aarav/Ananya, Head Boy/Girl of Abhinav Global School. Write a speech in 120–150 words to be delivered in the morning assembly on "The Role of Youth in Combating Climate Change".',
      'Deliver a speech in 120–150 words on "Digital Wellbeing: Balancing Screen Time with Mental Health in Student Life".',
    ],
  },
  {
    id: 'debate_writing',
    title: 'Debate Writing',
    category: 'long_writing',
    officialMarks: 5,
    wordLimit: '120–150 words',
    formatRubric: '1 Mark: Formal opening (Respected judges and worthy opponents), stance declaration (FOR or AGAINST), and formal sign-off',
    contentRubric: '2 Marks: Logically structured arguments, rebuttals to opposing view, data support',
    expressionRubric: '2 Marks: Persuasive rhetoric, emotive appeal, lexical richness, and grammatical precision',
    samplePrompts: [
      '"Artificial Intelligence in Education Will Diminish Genuine Human Learning." Write a debate speech either FOR or AGAINST the motion in 120–150 words.',
      '"Online Examinations Are Superior to Traditional Pen-and-Paper Board Exams." Write a debate in 120–150 words presenting your arguments either FOR or AGAINST the motion.',
    ],
  },
];

// -----------------------------------------------------------------------------
// 5. OFFICIAL CBSE PRESET & STANDARD TEMPLATES
// -----------------------------------------------------------------------------

export interface EnglishPaperPreset {
  id: string;
  name: string;
  badge: string;
  description: string;
  totalMarks: number;
  durationMinutes: number;
  isOfficialCbsePattern: boolean;
  sections: {
    sectionA: {
      name: string;
      marks: number;
      includeUnseen: boolean;
      unseenMarks: number;
      includeCaseBased: boolean;
      caseBasedMarks: number;
      includeNoteMaking: boolean;
      noteMakingMarks: number;
      includeSummary: boolean;
      summaryMarks: number;
    };
    sectionB: {
      name: string;
      marks: number;
      grammarMarks: number;
      selectedGrammarTopics: string[];
      writingMarks: number;
      selectedWritingTasks: string[];
    };
    sectionC: {
      name: string;
      marks: number;
      hornbillPoetryExtractMarks: number; // 3
      hornbillProseExtractMarks: number;   // 3
      snapshotsExtractMarks: number;        // 4
      hornbillShortAnswerMarks: number;     // 6 (2 out of 3, 3m each)
      snapshotsShortAnswerMarks: number;    // 3 (1 out of 2, 3m each)
      hornbillLongAnswerMarks: number;      // 6 (1 out of 2, 6m each)
      snapshotsLongAnswerMarks: number;     // 6 (1 out of 2, 6m each)
    };
  };
}

export const OFFICIAL_CBSE_2026_PRESET: EnglishPaperPreset = {
  id: 'official_cbse_2026',
  name: 'Official CBSE Class XI English Core 2026–27',
  badge: 'CBSE 80 Marks Theory',
  description:
    'Exact official 80-mark curriculum pattern: Section A Reading (26m), Section B Grammar & Writing (23m), Section C Literature (31m).',
  totalMarks: 80,
  durationMinutes: 180,
  isOfficialCbsePattern: true,
  sections: {
    sectionA: {
      name: 'SECTION A: READING SKILLS',
      marks: 26,
      includeUnseen: true,
      unseenMarks: 10,
      includeCaseBased: true,
      caseBasedMarks: 8,
      includeNoteMaking: true,
      noteMakingMarks: 5,
      includeSummary: true,
      summaryMarks: 3,
    },
    sectionB: {
      name: 'SECTION B: GRAMMAR AND CREATIVE WRITING SKILLS',
      marks: 23,
      grammarMarks: 7,
      selectedGrammarTopics: ['tenses', 'clauses', 'reordering', 'transformation'],
      writingMarks: 16,
      selectedWritingTasks: [
        'classified_advertisement', // 3m
        'poster_writing',           // 3m
        'speech_writing',           // 5m
        'debate_writing',           // 5m
      ],
    },
    sectionC: {
      name: 'SECTION C: LITERATURE TEXTBOOK AND SUPPLEMENTARY READER',
      marks: 31,
      hornbillPoetryExtractMarks: 3,
      hornbillProseExtractMarks: 3,
      snapshotsExtractMarks: 4,
      hornbillShortAnswerMarks: 6,
      snapshotsShortAnswerMarks: 3,
      hornbillLongAnswerMarks: 6,
      snapshotsLongAnswerMarks: 6,
    },
  },
};

export const UNIT_TEST_20_PRESET: EnglishPaperPreset = {
  id: 'unit_test_20',
  name: 'Unit / Periodic Assessment (20 Marks)',
  badge: 'Formative 20m',
  description: 'Quick 20-mark periodic test: Reading (5m) + Grammar/Writing (5m) + Literature Extracts & Short Answer (10m).',
  totalMarks: 20,
  durationMinutes: 45,
  isOfficialCbsePattern: false,
  sections: {
    sectionA: {
      name: 'SECTION A: READING SKILLS',
      marks: 5,
      includeUnseen: true,
      unseenMarks: 5,
      includeCaseBased: false,
      caseBasedMarks: 0,
      includeNoteMaking: false,
      noteMakingMarks: 0,
      includeSummary: false,
      summaryMarks: 0,
    },
    sectionB: {
      name: 'SECTION B: GRAMMAR & WRITING',
      marks: 5,
      grammarMarks: 2,
      selectedGrammarTopics: ['tenses', 'clauses'],
      writingMarks: 3,
      selectedWritingTasks: ['classified_advertisement'],
    },
    sectionC: {
      name: 'SECTION C: LITERATURE',
      marks: 10,
      hornbillPoetryExtractMarks: 3,
      hornbillProseExtractMarks: 0,
      snapshotsExtractMarks: 0,
      hornbillShortAnswerMarks: 3,
      snapshotsShortAnswerMarks: 0,
      hornbillLongAnswerMarks: 4,
      snapshotsLongAnswerMarks: 0,
    },
  },
};

export const MID_TERM_40_PRESET: EnglishPaperPreset = {
  id: 'mid_term_40',
  name: 'Mid-Term / Half-Yearly (40 Marks)',
  badge: 'Term 40m',
  description: '40-mark term exam: Reading (12m) + Grammar & Writing (10m) + Literature (18m).',
  totalMarks: 40,
  durationMinutes: 90,
  isOfficialCbsePattern: false,
  sections: {
    sectionA: {
      name: 'SECTION A: READING SKILLS',
      marks: 12,
      includeUnseen: true,
      unseenMarks: 8,
      includeCaseBased: false,
      caseBasedMarks: 0,
      includeNoteMaking: false,
      noteMakingMarks: 0,
      includeSummary: true,
      summaryMarks: 4,
    },
    sectionB: {
      name: 'SECTION B: GRAMMAR & WRITING',
      marks: 10,
      grammarMarks: 4,
      selectedGrammarTopics: ['tenses', 'clauses', 'reordering', 'transformation'],
      writingMarks: 6,
      selectedWritingTasks: ['classified_advertisement', 'speech_writing'],
    },
    sectionC: {
      name: 'SECTION C: LITERATURE',
      marks: 18,
      hornbillPoetryExtractMarks: 3,
      hornbillProseExtractMarks: 3,
      snapshotsExtractMarks: 0,
      hornbillShortAnswerMarks: 6,
      snapshotsShortAnswerMarks: 0,
      hornbillLongAnswerMarks: 6,
      snapshotsLongAnswerMarks: 0,
    },
  },
};
