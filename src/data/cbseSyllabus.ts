import type { StreamType } from '../types/index.ts';

export const CURRENT_ACADEMIC_SESSION = '2024-25 & 2025-26';

export interface ChapterInfo {
  number: number;
  title: string;
  keyTopics?: string[];
  unitName?: string;
  weightageMarks?: number;
}

export interface SubjectCurriculum {
  subject: string;
  classLevel: 'Class 11' | 'Class 12';
  subjectCode?: string;
  curriculumSource: string;
  academicSession: string;
  streams: StreamType[];
  chapters: ChapterInfo[];
  marksDistribution?: {
    theory: number;
    practical: number;
    total: number;
  };
}

/**
 * Authoritative CBSE Curriculum Registry.
 *
 * NOTE: Per official academic configuration:
 * - Physical Education (Code 048), Artificial Intelligence (Code 843), and Fine Arts (Code 049)
 *   are upgraded to the official CBSE / NCERT CLASS 12 syllabus.
 * - All other subjects (Physics, Chemistry, Mathematics, Biology, English, Economics,
 *   Accountancy, Business Studies, History, Political Science, Geography) remain on CBSE CLASS 11.
 */
export const CBSE_CURRICULUM: Record<string, SubjectCurriculum> = {
  // ============================================================================
  // UNCHANGED CLASS 11 SUBJECTS (STRICTLY PRESERVED)
  // ============================================================================
  Physics: {
    subject: 'Physics',
    classLevel: 'Class 11',
    subjectCode: '042',
    curriculumSource: 'CBSE Official Class 11 Curriculum & NCERT Physics Textbooks (Part I & II)',
    academicSession: CURRENT_ACADEMIC_SESSION,
    streams: ['PCM', 'PCB'],
    marksDistribution: { theory: 70, practical: 30, total: 100 },
    chapters: [
      { number: 1, title: 'Units and Measurements', keyTopics: ['SI units', 'Dimensional analysis', 'Significant figures'] },
      { number: 2, title: 'Motion in a Straight Line', keyTopics: ['Kinematics', 'Displacement', 'v-t graphs', 'Equations of motion'] },
      { number: 3, title: 'Motion in a Plane', keyTopics: ['Vectors', 'Projectile motion', 'Uniform circular motion'] },
      { number: 4, title: 'Laws of Motion', keyTopics: ['Newton laws', 'Inertia', 'Friction', 'Centripetal force'] },
      { number: 5, title: 'Work, Energy and Power', keyTopics: ['Work-energy theorem', 'Kinetic & potential energy', 'Collisions'] },
      { number: 6, title: 'System of Particles and Rotational Motion', keyTopics: ['Center of mass', 'Torque', 'Moment of inertia'] },
      { number: 7, title: 'Gravitation', keyTopics: ['Universal law of gravitation', 'Acceleration due to gravity', 'Escape speed', 'Kepler laws'] },
      { number: 8, title: 'Mechanical Properties of Solids', keyTopics: ['Stress-strain curve', 'Hooke law', 'Young modulus'] },
      { number: 9, title: 'Mechanical Properties of Fluids', keyTopics: ['Pascal law', 'Bernoulli theorem', 'Surface tension', 'Viscosity'] },
      { number: 10, title: 'Thermal Properties of Matter', keyTopics: ['Heat transfer', 'Calorimetry', 'Thermal expansion'] },
      { number: 11, title: 'Thermodynamics', keyTopics: ['First law', 'Second law', 'Isothermal & adiabatic processes'] },
      { number: 12, title: 'Kinetic Theory of Gases', keyTopics: ['Ideal gas equation', 'Degrees of freedom', 'Equipartition of energy'] },
      { number: 13, title: 'Oscillations', keyTopics: ['Simple Harmonic Motion', 'Spring-mass system', 'Simple pendulum'] },
      { number: 14, title: 'Waves', keyTopics: ['Transverse & longitudinal waves', 'Sound speed', 'Beats', 'Doppler effect'] },
    ],
  },

  Chemistry: {
    subject: 'Chemistry',
    classLevel: 'Class 11',
    subjectCode: '043',
    curriculumSource: 'CBSE Official Class 11 Curriculum & NCERT Chemistry Textbooks (Part I & II)',
    academicSession: CURRENT_ACADEMIC_SESSION,
    streams: ['PCM', 'PCB'],
    marksDistribution: { theory: 70, practical: 30, total: 100 },
    chapters: [
      { number: 1, title: 'Some Basic Concepts of Chemistry', keyTopics: ['Mole concept', 'Empirical formula', 'Stoichiometry', 'Molarity'] },
      { number: 2, title: 'Structure of Atom', keyTopics: ['Bohr model', 'de Broglie wavelength', 'Quantum numbers', 'Hund rule', 'Aufbau principle'] },
      { number: 3, title: 'Classification of Elements & Periodicity', keyTopics: ['Modern periodic law', 'Ionization enthalpy', 'Electronegativity'] },
      { number: 4, title: 'Chemical Bonding & Molecular Structure', keyTopics: ['VSEPR theory', 'Hybridization', 'Molecular orbital theory', 'Hydrogen bonding'] },
      { number: 5, title: 'Thermodynamics', keyTopics: ['Enthalpy', 'Entropy', 'Gibbs free energy', 'Hess law'] },
      { number: 6, title: 'Equilibrium', keyTopics: ['Chemical equilibrium', 'Le Chatelier principle', 'pH scale', 'Buffer solutions'] },
      { number: 7, title: 'Redox Reactions', keyTopics: ['Oxidation numbers', 'Balancing redox equations', 'Electrochemical cells'] },
      { number: 8, title: 'Organic Chemistry: Basic Principles & Techniques', keyTopics: ['IUPAC nomenclature', 'Inductive effect', 'Resonance', 'Reaction intermediates'] },
      { number: 9, title: 'Hydrocarbons', keyTopics: ['Alkanes', 'Alkenes', 'Alkynes', 'Benzene & aromaticity'] },
    ],
  },

  Mathematics: {
    subject: 'Mathematics',
    classLevel: 'Class 11',
    subjectCode: '041',
    curriculumSource: 'CBSE Official Class 11 Curriculum & NCERT Mathematics Textbook',
    academicSession: CURRENT_ACADEMIC_SESSION,
    streams: ['PCM'],
    marksDistribution: { theory: 80, practical: 20, total: 100 },
    chapters: [
      { number: 1, title: 'Sets', keyTopics: ['Venn diagrams', 'Subsets', 'Power sets', 'Union & intersection'] },
      { number: 2, title: 'Relations and Functions', keyTopics: ['Cartesian product', 'Domain and range', 'Special functions'] },
      { number: 3, title: 'Trigonometric Functions', keyTopics: ['Radian measure', 'Trigonometric identities', 'Compound angle formulas'] },
      { number: 4, title: 'Complex Numbers & Quadratic Equations', keyTopics: ['Argand plane', 'Modulus & conjugate', 'Quadratic roots'] },
      { number: 5, title: 'Linear Inequalities', keyTopics: ['Algebraic solutions', 'Graphical representation in two variables'] },
      { number: 6, title: 'Permutations and Combinations', keyTopics: ['Fundamental counting principle', 'Factorial notation', 'nPr and nCr'] },
      { number: 7, title: 'Binomial Theorem', keyTopics: ['Binomial expansions', 'General and middle terms'] },
      { number: 8, title: 'Sequences and Series', keyTopics: ['Arithmetic progressions', 'Geometric progressions', 'Sum to n terms'] },
      { number: 9, title: 'Straight Lines', keyTopics: ['Slope of a line', 'Various forms of line equation', 'Distance formulas'] },
      { number: 10, title: 'Conic Sections', keyTopics: ['Circles', 'Parabolas', 'Ellipses', 'Hyperbolas'] },
      { number: 11, title: 'Introduction to Three Dimensional Geometry', keyTopics: ['Coordinate axes', 'Distance formula in 3D', 'Section formula'] },
      { number: 12, title: 'Limits and Derivatives', keyTopics: ['Standard limits', 'First principle of differentiation', 'Product & quotient rule'] },
      { number: 13, title: 'Statistics', keyTopics: ['Mean deviation', 'Variance', 'Standard deviation of grouped data'] },
      { number: 14, title: 'Probability', keyTopics: ['Random experiments', 'Sample spaces', 'Events & addition theorem'] },
    ],
  },

  Biology: {
    subject: 'Biology',
    classLevel: 'Class 11',
    subjectCode: '044',
    curriculumSource: 'CBSE Official Class 11 Curriculum & NCERT Biology Textbook',
    academicSession: CURRENT_ACADEMIC_SESSION,
    streams: ['PCB'],
    marksDistribution: { theory: 70, practical: 30, total: 100 },
    chapters: [
      { number: 1, title: 'The Living World', keyTopics: ['Taxonomic categories', 'Binomial nomenclature', 'Taxonomical aids'] },
      { number: 2, title: 'Biological Classification', keyTopics: ['Five kingdom system', 'Monera', 'Protista', 'Fungi', 'Viruses'] },
      { number: 3, title: 'Plant Kingdom', keyTopics: ['Algae', 'Bryophytes', 'Pteridophytes', 'Gymnosperms', 'Angiosperms'] },
      { number: 4, title: 'Animal Kingdom', keyTopics: ['Non-chordates and Chordates classification and characteristics'] },
      { number: 5, title: 'Morphology of Flowering Plants', keyTopics: ['Root, stem, leaf modifications', 'Inflorescence', 'Flower parts'] },
      { number: 6, title: 'Anatomy of Flowering Plants', keyTopics: ['Meristematic & permanent tissues', 'Secondary growth'] },
      { number: 7, title: 'Structural Organisation in Animals', keyTopics: ['Animal tissues', 'Cockroach/frog morphology & anatomy'] },
      { number: 8, title: 'Cell: The Unit of Life', keyTopics: ['Prokaryotic & eukaryotic cells', 'Organelles', 'Endomembrane system'] },
      { number: 9, title: 'Biomolecules', keyTopics: ['Carbohydrates', 'Proteins', 'Lipids', 'Nucleic acids', 'Enzyme kinetics'] },
      { number: 10, title: 'Cell Cycle and Cell Division', keyTopics: ['Mitosis phases', 'Meiosis I & II', 'Significance of division'] },
      { number: 11, title: 'Photosynthesis in Higher Plants', keyTopics: ['Light reaction', 'Calvin cycle', 'C4 pathway', 'Photorespiration'] },
      { number: 12, title: 'Respiration in Plants', keyTopics: ['Glycolysis', 'Krebs cycle', 'Electron transport system', 'ATP yield'] },
      { number: 13, title: 'Plant Growth and Development', keyTopics: ['Auxins', 'Gibberellins', 'Cytokinins', 'Photoperiodism'] },
      { number: 14, title: 'Breathing and Exchange of Gases', keyTopics: ['Respiratory organs', 'Mechanism of breathing', 'Gas transport'] },
      { number: 15, title: 'Body Fluids and Circulation', keyTopics: ['Blood groups', 'Cardiac cycle', 'ECG', 'Double circulation'] },
      { number: 16, title: 'Excretory Products and their Elimination', keyTopics: ['Nephron structure', 'Urine formation', 'Regulation of kidney function'] },
      { number: 17, title: 'Locomotion and Movement', keyTopics: ['Muscle contraction mechanism', 'Skeletal system', 'Joints'] },
      { number: 18, title: 'Neural Control and Coordination', keyTopics: ['Neuron transmission', 'Central nervous system', 'Sense organs'] },
      { number: 19, title: 'Chemical Coordination and Integration', keyTopics: ['Endocrine glands', 'Hormone mechanisms', 'Feedback loops'] },
    ],
  },

  Economics: {
    subject: 'Economics',
    classLevel: 'Class 11',
    subjectCode: '030',
    curriculumSource: 'CBSE Official Class 11 Curriculum & NCERT Economics Textbooks (Statistics for Economics & Introductory Microeconomics)',
    academicSession: CURRENT_ACADEMIC_SESSION,
    streams: ['HUMANITIES', 'COMMERCE'],
    marksDistribution: { theory: 80, practical: 20, total: 100 },
    chapters: [
      { number: 1, title: 'Introduction to Statistics', keyTopics: ['Scope and importance of statistics in economics'] },
      { number: 2, title: 'Collection, Organisation & Presentation of Data', keyTopics: ['Sampling', 'Tabulation', 'Diagrammatic representation'] },
      { number: 3, title: 'Measures of Central Tendency', keyTopics: ['Arithmetic mean', 'Median', 'Mode'] },
      { number: 4, title: 'Measures of Correlation & Index Numbers', keyTopics: ['Karl Pearson correlation', 'Consumer price index', 'Wholesale price index'] },
      { number: 5, title: 'Introduction to Microeconomics', keyTopics: ['Scarcity', 'Opportunity cost', 'Production Possibility Curve (PPC)'] },
      { number: 6, title: 'Consumer Equilibrium and Demand', keyTopics: ['Marginal utility', 'Indifference curve', 'Law of demand', 'Price elasticity'] },
      { number: 7, title: 'Producer Behaviour and Supply', keyTopics: ['Production function', 'Cost curves', 'Revenue curves', 'Law of supply'] },
      { number: 8, title: 'Forms of Market & Price Determination', keyTopics: ['Perfect competition', 'Market equilibrium', 'Shift in demand/supply'] },
    ],
  },

  Accountancy: {
    subject: 'Accountancy',
    classLevel: 'Class 11',
    subjectCode: '055',
    curriculumSource: 'CBSE Official Class 11 Curriculum & NCERT Accountancy Textbooks (Financial Accounting - I & II)',
    academicSession: CURRENT_ACADEMIC_SESSION,
    streams: ['COMMERCE'],
    marksDistribution: { theory: 80, practical: 20, total: 100 },
    chapters: [
      { number: 1, title: 'Introduction to Accounting', keyTopics: ['Objectives', 'Users of accounting information', 'Branches of accounting'] },
      { number: 2, title: 'Theory Base of Accounting & Standards', keyTopics: ['Accounting concepts', 'GAAP', 'Accrual vs cash basis', 'GST basics'] },
      { number: 3, title: 'Recording of Transactions - I (Journal)', keyTopics: ['Accounting equation', 'Rules of debit & credit', 'Source documents', 'Journal entries'] },
      { number: 4, title: 'Recording of Transactions - II (Ledger & Cash Book)', keyTopics: ['Special purpose books', 'Posting to ledger', 'Balancing accounts'] },
      { number: 5, title: 'Bank Reconciliation Statement (BRS)', keyTopics: ['Causes of difference between cash book & pass book', 'Preparation of BRS'] },
      { number: 6, title: 'Trial Balance and Rectification of Errors', keyTopics: ['Trial balance objectives', 'One-sided vs two-sided errors', 'Suspense account'] },
      { number: 7, title: 'Depreciation, Provisions and Reserves', keyTopics: ['Straight line method', 'Written down value method', 'Provision for doubtful debts'] },
      { number: 8, title: 'Financial Statements of Sole Proprietorship', keyTopics: ['Trading account', 'Profit and loss account', 'Balance sheet', 'Closing adjustments'] },
    ],
  },

  'Business Studies': {
    subject: 'Business Studies',
    classLevel: 'Class 11',
    subjectCode: '054',
    curriculumSource: 'CBSE Official Class 11 Curriculum & NCERT Business Studies Textbook',
    academicSession: CURRENT_ACADEMIC_SESSION,
    streams: ['COMMERCE'],
    marksDistribution: { theory: 80, practical: 20, total: 100 },
    chapters: [
      { number: 1, title: 'Nature and Purpose of Business', keyTopics: ['Economic activities', 'Objectives of business', 'Business risks'] },
      { number: 2, title: 'Forms of Business Organisation', keyTopics: ['Sole proprietorship', 'Partnership', 'Joint Hindu family', 'Cooperative societies', 'Company formation'] },
      { number: 3, title: 'Private, Public and Global Enterprises', keyTopics: ['Departmental undertakings', 'Statutory corporations', 'Government companies', 'MNCs'] },
      { number: 4, title: 'Business Services', keyTopics: ['Banking', 'Insurance principles', 'Communication and warehousing'] },
      { number: 5, title: 'Emerging Modes of Business', keyTopics: ['E-business scope and benefits', 'Outsourcing (BPO)'] },
      { number: 6, title: 'Social Responsibility of Business & Ethics', keyTopics: ['Arguments for social responsibility', 'Environmental protection', 'Business ethics'] },
      { number: 7, title: 'Sources of Business Finance', keyTopics: ['Retained earnings', 'Shares & debentures', 'Commercial banks', 'Trade credit'] },
      { number: 8, title: 'Small Business and Enterprises', keyTopics: ['Role of small business in India', 'Government assistance schemes'] },
      { number: 9, title: 'Internal Trade', keyTopics: ['Wholesale trade', 'Retail trade', 'Departmental stores', 'Chain stores', 'GST'] },
      { number: 10, title: 'International Business', keyTopics: ['Scope of international business', 'Export and import procedure', 'WTO'] },
    ],
  },

  History: {
    subject: 'History',
    classLevel: 'Class 11',
    subjectCode: '027',
    curriculumSource: 'CBSE Official Class 11 Curriculum & NCERT Themes in World History',
    academicSession: CURRENT_ACADEMIC_SESSION,
    streams: ['HUMANITIES'],
    marksDistribution: { theory: 80, practical: 20, total: 100 },
    chapters: [
      { number: 1, title: 'Writing and City Life (Mesopotamia)', keyTopics: ['Cuneiform script', 'Urbanisation', 'Mesopotamian temples and palaces'] },
      { number: 2, title: 'An Empire Across Three Continents (Rome)', keyTopics: ['Roman Republic and Empire', 'Third-century crisis', 'Slavery', 'Late antiquity'] },
      { number: 3, title: 'Nomadic Empires (The Mongols)', keyTopics: ['Genghis Khan', 'Military organization', 'Yasaq', 'Transcontinental trade'] },
      { number: 4, title: 'The Three Orders (Feudal Europe)', keyTopics: ['Clergy, nobility, and peasantry', 'Manorial system', 'Cathedral towns', 'Black death'] },
      { number: 5, title: 'Changing Cultural Traditions', keyTopics: ['Italian Renaissance', 'Humanism', 'Scientific revolution', 'Printing press'] },
      { number: 6, title: 'Displacing Indigenous Peoples', keyTopics: ['European settlement in North America and Australia', 'The Gold Rush'] },
      { number: 7, title: 'Paths to Modernisation (East Asia)', keyTopics: ['Meiji Restoration in Japan', 'Opium Wars & Boxer Rebellion', 'Modern China'] },
    ],
  },

  'Political Science': {
    subject: 'Political Science',
    classLevel: 'Class 11',
    subjectCode: '028',
    curriculumSource: 'CBSE Official Class 11 Curriculum & NCERT Indian Constitution at Work / Political Theory',
    academicSession: CURRENT_ACADEMIC_SESSION,
    streams: ['HUMANITIES'],
    marksDistribution: { theory: 80, practical: 20, total: 100 },
    chapters: [
      { number: 1, title: 'Constitution: Why and How?', keyTopics: ['Making of the Constitution', 'Constituent Assembly debates', 'Borrowings from other nations'] },
      { number: 2, title: 'Rights in the Indian Constitution', keyTopics: ['Fundamental Rights', 'Directive Principles of State Policy', 'Fundamental Duties'] },
      { number: 3, title: 'Election and Representation', keyTopics: ['First Past the Post system', 'Proportional Representation', 'Election Commission'] },
      { number: 4, title: 'Executive', keyTopics: ['Parliamentary executive', 'President and Prime Minister powers', 'Permanent bureaucracy'] },
      { number: 5, title: 'Legislature', keyTopics: ['Need for bicameral parliament', 'Lok Sabha and Rajya Sabha', 'Law making procedure'] },
      { number: 6, title: 'Judiciary', keyTopics: ['Independence of judiciary', 'Supreme Court jurisdiction', 'Judicial review & activism'] },
      { number: 7, title: 'Federalism', keyTopics: ['Division of powers', 'Center-State relations', 'Special provisions'] },
      { number: 8, title: 'Local Governments', keyTopics: ['73rd and 74th Constitutional Amendments', 'Panchayati Raj functions'] },
      { number: 9, title: 'Political Theory: An Introduction', keyTopics: ['Meaning of politics', 'Putting political theory to practice'] },
      { number: 10, title: 'Freedom and Equality', keyTopics: ['Negative and positive liberty', 'Dimensions of equality', 'Affirmative action'] },
      { number: 11, title: 'Social Justice and Rights', keyTopics: ['John Rawls theory of justice', 'Legal vs moral rights', 'Human rights'] },
      { number: 12, title: 'Citizenship, Nationalism and Secularism', keyTopics: ['Global citizenship', 'Self-determination', 'Indian model of secularism'] },
    ],
  },

  Geography: {
    subject: 'Geography',
    classLevel: 'Class 11',
    subjectCode: '029',
    curriculumSource: 'CBSE Official Class 11 Curriculum & NCERT Fundamentals of Physical Geography / India Physical Environment',
    academicSession: CURRENT_ACADEMIC_SESSION,
    streams: ['HUMANITIES'],
    marksDistribution: { theory: 70, practical: 30, total: 100 },
    chapters: [
      { number: 1, title: 'Geography as a Discipline', keyTopics: ['Branches of geography', 'Physical vs human geography'] },
      { number: 2, title: 'The Earth & Planetary Origin', keyTopics: ['Nebular hypothesis', 'Big Bang theory', 'Lithosphere evolution'] },
      { number: 3, title: 'Interior of the Earth', keyTopics: ['Seismic waves P and S', 'Crust, mantle and core', 'Volcanoes and shadow zones'] },
      { number: 4, title: 'Distribution of Oceans and Continents', keyTopics: ['Continental drift theory', 'Sea floor spreading', 'Plate tectonics'] },
      { number: 5, title: 'Geomorphic Processes & Landforms', keyTopics: ['Weathering', 'Mass wasting', 'Erosion by running water and wind'] },
      { number: 6, title: 'Composition and Structure of Atmosphere', keyTopics: ['Troposphere to exosphere', 'Atmospheric gases'] },
      { number: 7, title: 'Solar Radiation, Heat Balance and Temperature', keyTopics: ['Insolation factors', 'Heat budget', 'Inversion of temperature'] },
      { number: 8, title: 'Atmospheric Circulation & Weather Systems', keyTopics: ['Pressure belts', 'Planetary winds', 'Tropical and extra-tropical cyclones'] },
      { number: 9, title: 'Water in the Atmosphere', keyTopics: ['Humidity', 'Condensation forms', 'Precipitation types'] },
      { number: 10, title: 'World Climate and Climate Change', keyTopics: ['Koppen classification', 'Greenhouse gases', 'Global warming'] },
      { number: 11, title: 'Oceans: Relief and Movement', keyTopics: ['Ocean floor topography', 'Tides and currents', 'Salinity and temperature'] },
      { number: 12, title: 'India: Location, Physiography and Drainage', keyTopics: ['Himalayas', 'Northern Plains', 'Peninsular Plateau', 'Himalayan vs Peninsular rivers'] },
      { number: 13, title: 'Climate, Vegetation and Soil of India', keyTopics: ['Indian monsoon mechanism', 'Forest types', 'Alluvial & Black soils'] },
    ],
  },

  'English Core': {
    subject: 'English Core',
    classLevel: 'Class 11',
    subjectCode: '301',
    curriculumSource: 'CBSE Official Class 11 English Core Curriculum & NCERT Hornbill / Snapshots',
    academicSession: CURRENT_ACADEMIC_SESSION,
    streams: ['PCM', 'PCB', 'HUMANITIES', 'COMMERCE'],
    marksDistribution: { theory: 80, practical: 20, total: 100 },
    chapters: [
      { number: 1, title: 'The Portrait of a Lady (Khushwant Singh)', keyTopics: ['Grandmother-grandson relationship', 'Theme of transition', 'Vocabulary'] },
      { number: 2, title: "We're Not Afraid to Die... (Gordon Cook & Alan East)", keyTopics: ['Voyage courage', 'Wavewalker struggle', 'Human resilience'] },
      { number: 3, title: 'Discovering Tut: the Saga Continues (A.R. Williams)', keyTopics: ['King Tut tomb discovery', 'CT scan revelations', 'Ancient Egyptian history'] },
      { number: 4, title: 'The Voice of the Rain & Childhood (Poetry)', keyTopics: ['Walt Whitman', 'Markus Natten', 'Metaphors', 'Themes of innocence'] },
      { number: 5, title: 'The Adventure (Jayant Narlikar)', keyTopics: ['Parallel worlds', 'Battle of Panipat catastrophic theory', 'Quantum physics'] },
      { number: 6, title: 'Silk Road (Nick Middleton)', keyTopics: ['Travelogue to Mount Kailash', 'Tibetan mastiffs', 'Kora pilgrimage'] },
      { number: 7, title: 'The Summer of the Beautiful White Horse', keyTopics: ['William Saroyan', 'Garoghlanian tribe honour', 'Aram and Mourad'] },
      { number: 8, title: 'The Address (Marga Minco)', keyTopics: ['Post-war emotional displacement', 'Mrs. Dorling', 'Memory and trauma'] },
    ],
  },

  // ============================================================================
  // UPGRADED CLASS 12 SUBJECTS (OFFICIAL CBSE & NCERT CLASS 12 CURRICULUM)
  // ============================================================================

  /**
   * 1. Physical Education (CBSE Subject Code: 048)
   * Source: Official CBSE Class 12 Physical Education Curriculum & NCERT Class 12 Textbook
   * Evaluation: Theory (70 Marks) + Practical/Internal (30 Marks) = 100 Marks
   */
  'Physical Education': {
    subject: 'Physical Education',
    classLevel: 'Class 12',
    subjectCode: '048',
    curriculumSource: 'Official CBSE Class 12 Physical Education Curriculum & NCERT Class 12 Textbook',
    academicSession: CURRENT_ACADEMIC_SESSION,
    streams: ['PCM', 'PCB', 'HUMANITIES', 'COMMERCE'],
    marksDistribution: { theory: 70, practical: 30, total: 100 },
    chapters: [
      {
        number: 1,
        title: 'Management of Sporting Events',
        unitName: 'Unit I',
        keyTopics: [
          'Functions of Sports Events Management (Planning, Organising, Staffing, Directing & Controlling)',
          'Various Committees & their Responsibilities (Pre, During, & Post tournament)',
          'Fixtures and their Procedures – Knock-Out (Bye & Seeding) and League (Staircase & Cyclic methods)',
          'Combination Tournaments & Deciding Winners in League',
          'Intramural & Extramural Tournaments – Meaning, Objectives & Significance',
          'Community Sports Program (Sports Day, Health Run, Run for Fun, Run for Specific Cause, Run for Unity)',
        ],
      },
      {
        number: 2,
        title: 'Children & Women in Sports',
        unitName: 'Unit II',
        keyTopics: [
          'Exercise guidelines of WHO for different age groups',
          'Common Postural Deformities (Knock Knees, Flat Foot, Round Shoulders, Lordosis, Kyphosis, Scoliosis, Bow Legs) & Corrective Measures',
          'Women’s participation in sports – Physical, Psychological, and Social benefits',
          'Special considerations (Menarche and Menstrual Dysfunction in female athletes)',
          'Female Athlete Triad (Osteoporosis, Amenorrhea, Eating Disorders: Anorexia & Bulimia)',
        ],
      },
      {
        number: 3,
        title: 'Yoga as Preventive Measure for Lifestyle Disease',
        unitName: 'Unit III',
        keyTopics: [
          'Obesity – Asanas: Tadasana, Katichakrasana, Pavanmuktasana, Matsyasana, Halasana, Paschimottanasana, Ardha Matsyendrasana, Dhanurasana, Ushtrasana, Suryanamaskar',
          'Diabetes – Asanas: Bhujangasana, Shalabhasana, Gomukhasana, Mandukasana, Vakrasana, Yogmudrasana, Kapalabhati',
          'Asthma – Asanas: Tadasana, Urdhwahastottanasana, Uttanmandukasana, Bhujangasana, Matsyasana, Anulom-Vilom pranayama',
          'Hypertension – Asanas: Tadasana, Sarvangasana, Shavasana, Nadishodhanapranayama, Sitali pranayama',
          'Back Pain & Arthritis – Asanas: Tadasana, Bhujangasana, Shalabhasana, Vakrasana, Ushtrasana, Gomukhasana',
        ],
      },
      {
        number: 4,
        title: 'Physical Education & Sports for CWSN (Children with Special Needs – Divyang)',
        unitName: 'Unit IV',
        keyTopics: [
          'Organizations promoting Disability Sports: Special Olympics, Paralympics, Deaflympics',
          'Concept of Classification and Divisioning in Sports for CWSN',
          'Concept of Inclusion in Sports, its need, and implementation strategies',
          'Advantages of Physical Activities for children with special needs',
          'Strategies to make Physical Activities accessible for CWSN',
        ],
      },
      {
        number: 5,
        title: 'Sports & Nutrition',
        unitName: 'Unit V',
        keyTopics: [
          'Concept of Balanced Diet and Nutrition',
          'Macro and Micro Nutrients – Food sources, biological functions, and daily requirements',
          'Nutritive and Non-Nutritive Components of Diet (Fiber, Water, Colors, Flavors, Phytochemicals)',
          'Eating Disorders – Anorexia Nervosa and Bulimia Nervosa',
          'Importance of Diet in Sports and Pre, During and Post-competition meal planning',
          'Food Myths and Pitfalls of Dieting',
        ],
      },
      {
        number: 6,
        title: 'Test & Measurement in Sports',
        unitName: 'Unit VI',
        keyTopics: [
          'SAI Khelo India Fitness Test (Age 5-8 yrs: BMI, Flamingo Balance, Plate Tapping; Age 9-18 yrs: 50m dash, 600m run/walk, Sit & Reach, Partial Curl-up, Push-ups/Modified Push-ups)',
          'Measurement of Cardio-Respiratory Fitness – Harvard Step Test & Rockport One-Mile Walk Test',
          'Computation of Fitness Index (Long form & Short form)',
          'Rikli & Jones Senior Citizen Fitness Test (Chair Stand, Arm Curl, Chair Sit & Reach, Back Scratch, 8-Foot Up and Go, 6-Minute Walk)',
          'Computation of BMI (Body Mass Index) and Waist-to-Hip Ratio',
        ],
      },
      {
        number: 7,
        title: 'Physiology & Injuries in Sports',
        unitName: 'Unit VII',
        keyTopics: [
          'Physiological factors determining components of Physical Fitness (Strength, Speed, Endurance, Flexibility)',
          'Effect of exercise on Muscular System (Hypertrophy, neuromuscular coordination, lactate tolerance)',
          'Effect of exercise on Cardio-Respiratory System (Stroke volume, cardiac output, VO2 max, tidal volume)',
          'Physiological changes due to aging in skeletal, muscular, and circulatory systems',
          'Sports Injuries: Classification (Soft tissue: Abrasion, Contusion, Laceration, Incision, Sprain, Strain; Bone/Joint: Dislocation, Fractures)',
          'First Aid and Management of Sports Injuries (PRICE & RICER principles)',
        ],
      },
      {
        number: 8,
        title: 'Biomechanics & Sports',
        unitName: 'Unit VIII',
        keyTopics: [
          'Newton’s Laws of Motion & their practical applications in sports and athletics',
          'Types of Levers (First, Second, and Third Class) & their anatomical applications in human movement',
          'Equilibrium – Dynamic & Static, Centre of Gravity and its application in sports',
          'Friction & Sports – Types of friction and its advantageous & disadvantageous roles in athletic footwear and equipment',
          'Projectile Motion in Sports – Factors affecting trajectory (angle of release, velocity, gravity, air resistance)',
        ],
      },
      {
        number: 9,
        title: 'Psychology & Sports',
        unitName: 'Unit IX',
        keyTopics: [
          'Personality – Definition, dimensions, and classifications (Carl Jung typology & Big Five theory: OCEAN)',
          'Motivation – Types (Intrinsic vs Extrinsic) and motivational techniques for athletes',
          'Exercise Adherence – Reasons, benefits, barriers, and strategies for long-term adherence',
          'Aggression in Sports – Concept and types (Instrumental, Hostile, and Assertive behavior)',
          'Psychological Attributes in Sports – Self-esteem, Mental Imagery, Self-talk, and Goal Setting',
        ],
      },
      {
        number: 10,
        title: 'Training in Sports',
        unitName: 'Unit X',
        keyTopics: [
          'Concept of Talent Identification and Talent Development in Sports',
          'Introduction to Sports Training Cycle (Microcycle, Mesocycle, and Macrocycle periodization)',
          'Types & Methods to develop Strength (Isometric, Isotonic, and Isokinetic exercises)',
          'Types & Methods to develop Endurance (Continuous, Interval, and Fartlek training)',
          'Types & Methods to develop Speed (Acceleration runs and Pace runs)',
          'Types & Methods to develop Flexibility (Active, Passive, Ballistic, Static, PNF stretching)',
          'Coordinative Abilities & Circuit Training – Meaning, design, and station setup',
        ],
      },
    ],
  },

  /**
   * 2. Fine Arts (Painting) (CBSE Subject Code: 049)
   * Course in NEXORA: Fine Arts (Painting, taught by Parul Mam)
   * Source: Official CBSE Class 12 Fine Arts (Painting) Curriculum & NCERT Textbook "An Introduction to Indian Art - Part II"
   * Evaluation: Theory (30 Marks) + Practical (70 Marks) = 100 Marks
   */
  'Fine Arts': {
    subject: 'Fine Arts',
    classLevel: 'Class 12',
    subjectCode: '049',
    curriculumSource: 'Official CBSE Class 12 Fine Arts (Painting, Code 049) Curriculum & NCERT "An Introduction to Indian Art - Part II"',
    academicSession: CURRENT_ACADEMIC_SESSION,
    streams: ['PCM', 'PCB', 'HUMANITIES', 'COMMERCE'],
    marksDistribution: { theory: 30, practical: 70, total: 100 },
    chapters: [
      {
        number: 1,
        title: 'The Rajasthani School of Miniature Painting',
        unitName: 'Unit I (A)',
        keyTopics: [
          'Origin, development, and salient artistic characteristics of the Rajasthani School',
          'Sub-schools of Rajasthan: Mewar, Bundi, Bikaner, Kishangarh, Jaipur, and Jodhpur',
          'Prescribed masterpiece analysis: "Maru-Ragini" by Sahibdin (Mewar sub-school)',
          'Prescribed masterpiece analysis: "Raja Aniruddha Singh Hara" by Utram (Bundi sub-school)',
          'Prescribed masterpiece analysis: "Chaugan Players" by Dana (Jodhpur sub-school)',
          'Prescribed masterpiece analysis: "Radha (Bani Thani)" by Nihal Chand (Kishangarh sub-school)',
          'Prescribed masterpiece analysis: "Krishna Lifting Mount Govardhana" by Miskin (Jaipur sub-school)',
        ],
      },
      {
        number: 2,
        title: 'The Pahari School of Miniature Painting',
        unitName: 'Unit I (B)',
        keyTopics: [
          'Origin, evolution, and delicate lyrical characteristics of the Pahari miniature tradition',
          'Sub-schools of the Hills: Basohli, Guler, Kangra, Chamba, and Garhwal',
          'Prescribed masterpiece analysis: "Krishna with Gopis" by Manaku (Basohli sub-school)',
          'Prescribed masterpiece analysis: "Nand, Yashoda and Krishna with Kinsmen Going to Vrindavan" by Nainsukh (Guler sub-school)',
          'Color palette, landscape depictions, and romantic-devotional themes of Gita Govinda & Bhagavata Purana',
        ],
      },
      {
        number: 3,
        title: 'The Mughal School of Miniature Painting',
        unitName: 'Unit II (A)',
        keyTopics: [
          'Origin, evolution, and synthesis of Persian and indigenous Indian styles under Mughal emperors',
          'Artistic patronage under Akbar (Hamzanama), Jahangir (portraiture & flora/fauna), and Shah Jahan',
          'Prescribed masterpiece analysis: "Krishna Lifting Mount Govardhana" by Miskin (Akbar atelier)',
          'Prescribed masterpiece analysis: "Falcon on a Bird-Rest" by Ustad Mansur (Jahangir court)',
          'Prescribed masterpiece analysis: "Kabir and Raidas" by Ustad Faqirullah Khan (Shah Jahan era)',
          'Prescribed masterpiece analysis: "Marriage Procession of Dara Shukoh" by Haji Madni (Provincial Mughal/Awadh)',
        ],
      },
      {
        number: 4,
        title: 'The Deccani School of Miniature Painting',
        unitName: 'Unit II (B)',
        keyTopics: [
          'Origin, development, and unique Islamic-Persian-South Indian stylistic fusion in Deccan sultanates',
          'Major centers of Deccani painting: Bijapur, Golconda, Ahmadnagar, and Hyderabad',
          'Prescribed masterpiece analysis: "Chand Bibi Playing Polo (Chaugan)" (Golconda sub-school)',
          'Prescribed masterpiece analysis: "Hazrat Nizamuddin Auliya and Amir Khusro" (Hyderabad sub-school)',
          'Lush decorative landscape, rich golden work, tall stylized human figures, and Persian arabesques',
        ],
      },
      {
        number: 5,
        title: 'The Bengal School of Painting & National Freedom Movement',
        unitName: 'Unit III (A)',
        keyTopics: [
          'Evolution of the Indian National Flag and the symbolic significance of its colors and Ashoka Chakra',
          'Emergence of the Bengal School: Abanindranath Tagore, E.B. Havell, and swadeshi art revival',
          'Contribution of nationalist artists in the struggle for Indian freedom',
          'Prescribed masterpiece analysis: "Journey’s End" by Abanindranath Tagore (wash technique & symbolism)',
          'Prescribed masterpiece analysis: "Shiv and Sati" by Nandalal Bose (classical revivalism)',
          'Prescribed masterpiece analysis: "Radhika" by M.A.R. Chughtai (lyrical romantic watercolor)',
          'Prescribed masterpiece analysis: "Meghdoot" by Ram Gopal Vijaivargiya',
        ],
      },
      {
        number: 6,
        title: 'Modern Trends in Indian Art',
        unitName: 'Unit III (B)',
        keyTopics: [
          'Contemporary Indian Art movements: Progressive Artists Group (PAG) and independent modern masters',
          'Modern Paintings: "Rama Vanquishing Pride of the Ocean" (Raja Ravi Varma), "Mother and Child" (Jamini Roy), "Haldi Grinders" (Amrita Sher-Gil), "Mother Teresa" (M.F. Husain)',
          'Graphic Prints & Etchings: "Children" (Somnath Hore), "Devi" (Jyoti Bhatt), "Of Walls" (Anupam Sud), "Man, Woman and Tree" (K. Laxma Goud)',
          'Modern Indian Sculptures: "Triumph of Labour" (D.P. Roychowdhury), "Santhal Family" (Ramkinkar Baij), "Cries Un-heard" (Amar Nath Sehgal), "Ganesha" (P.V. Janakiram)',
        ],
      },
      {
        number: 7,
        title: 'Nature & Object Study and Painting Composition',
        unitName: 'Practical Assessment',
        keyTopics: [
          'Studies of objects and drapery from a fixed viewpoint with light, shade, and color values',
          'Painting composition based on life, nature, and cultural celebrations in tempera/water colors',
          'Folk art traditions of India (Madhubani, Warli, Pattachitra) and yearly portfolio assessment',
        ],
      },
    ],
  },

  /**
   * 3. Artificial Intelligence (CBSE Subject Code: 843)
   * Course in NEXORA: Artificial Intelligence (CBSE Senior Secondary Skill Subject)
   * Source: Official CBSE Department of Skill Education Curriculum & Student Handbook for Class 12 AI (Code 843)
   * Evaluation: Theory (50 Marks: 10 Employability + 40 Subject-Specific) + Practical/Capstone (50 Marks) = 100 Marks
   */
  'Artificial Intelligence': {
    subject: 'Artificial Intelligence',
    classLevel: 'Class 12',
    subjectCode: '843',
    curriculumSource: 'Official CBSE Class 12 Skill Subject Curriculum (CBSE Dept of Skill Education, Code 843)',
    academicSession: CURRENT_ACADEMIC_SESSION,
    streams: ['PCM', 'PCB', 'HUMANITIES', 'COMMERCE'],
    marksDistribution: { theory: 50, practical: 50, total: 100 },
    chapters: [
      {
        number: 1,
        title: 'Employability Skills — Advanced Work Readiness',
        unitName: 'Part A',
        keyTopics: [
          'Communication Skills-IV (Active listening, professional communication, presentation delivery)',
          'Self-Management Skills-IV (Stress reduction techniques, time management, emotional intelligence)',
          'ICT Skills-IV (Spreadsheet analytics, data tables, digital security protocols)',
          'Entrepreneurial Skills-IV (Business opportunity identification, startup ecosystems in India)',
          'Green Skills-IV (Sustainable development goals, carbon accounting, green economy practices)',
        ],
      },
      {
        number: 2,
        title: 'Python Programming & Advanced Data Structures',
        unitName: 'Unit 1 (Subject-Specific)',
        keyTopics: [
          'NumPy arrays – Creation, multi-dimensional array slicing, vectorization, and mathematical broadcasting',
          'Pandas – Series and DataFrame structures, indexing, filtering, and descriptive statistical summaries',
          'Data cleansing – Detecting and handling missing (NaN/null) values, data imputation, and outlier detection',
          'CSV and JSON file I/O operations with Pandas',
          'Data visualization fundamentals with Matplotlib and Seaborn (line, bar, scatter, histogram, heatmaps)',
        ],
      },
      {
        number: 3,
        title: 'Data Science Methodology',
        unitName: 'Unit 2 (Subject-Specific)',
        keyTopics: [
          'John B. Rollins 10-Stage Data Science Methodology framework for real-world AI problem solving',
          'From Problem to Approach: Business Understanding and Analytic Approach selection',
          'Working with Data: Data Requirements, Data Collection, Data Understanding, and Exploratory Data Analysis',
          'Deriving Insights: Data Preparation, Feature Engineering, Feature Selection',
          'Modeling & Validation: Model Building, Model Evaluation (Confusion Matrix, Precision, Recall, F1-Score)',
          'Deployment & Operationalization: Model Deployment, Monitoring, and Feedback iteration',
        ],
      },
      {
        number: 4,
        title: 'Computer Vision — Making Machines See',
        unitName: 'Unit 3 (Subject-Specific)',
        keyTopics: [
          'Foundations of Computer Vision – Human visual system vs digital image representations (pixels, RGB, Grayscale)',
          'Digital Image Processing basics – Spatial resolution, color spaces (RGB, HSV, BGR), color histograms',
          'Image preprocessing – Convolution filtering, Gaussian blur, noise reduction, image normalization',
          'Thresholding and Edge Detection – Sobel operator, Laplacian filter, and Canny Edge Detector',
          'Image Segmentation and Object Detection using OpenCV and Convolutional Neural Networks (CNNs)',
          'Practical applications – Facial recognition, automated medical imaging, autonomous vehicle vision',
        ],
      },
      {
        number: 5,
        title: 'Data Mining with Orange Visual Tool',
        unitName: 'Unit 4 (Subject-Specific)',
        keyTopics: [
          'No-code visual machine learning pipelines using Orange Data Mining tool',
          'Data ingestion widgets – File, Data Table, Select Columns, Edit Domain',
          'Data preprocessing and exploration widgets – Impute, Preprocess, Distributions, Scatter Plot',
          'Model training widgets – Classification Tree, Random Forest, Logistic Regression, k-NN',
          'Model evaluation widgets – Test & Score, Confusion Matrix, ROC Analysis, Lift Curve',
        ],
      },
      {
        number: 6,
        title: 'Introduction to Big Data & Data Analytics',
        unitName: 'Unit 5 (Subject-Specific)',
        keyTopics: [
          'What is Big Data? – The 6Vs framework (Volume, Velocity, Variety, Veracity, Value, Variability)',
          'Data architectures – Structured vs Semi-structured vs Unstructured data',
          'Big Data technologies overview – Distributed storage (HDFS), MapReduce paradigm, Apache Spark basics',
          'Real-time streaming analytics vs Batch processing',
          'Business applications of Big Data – Recommendation engines, predictive maintenance, logistics optimization',
        ],
      },
      {
        number: 7,
        title: 'Understanding Neural Networks',
        unitName: 'Unit 6 (Subject-Specific)',
        keyTopics: [
          'Biological Neuron vs Artificial Neuron (Perceptron architecture: inputs, weights, bias, summation)',
          'Activation Functions – Need for non-linearity; Step function, Sigmoid, ReLU (Rectified Linear Unit), Tanh, Softmax',
          'Multi-Layer Perceptron (MLP) architecture – Input layer, hidden layers, output layer',
          'Forward Propagation and Loss/Cost Functions (Mean Squared Error, Binary Cross-Entropy)',
          'Concept of Backpropagation and Gradient Descent optimization (Learning rate, convergence)',
          'Overview of specialized architectures: Convolutional Neural Networks (CNN), Recurrent Neural Networks (RNN), and Generative Adversarial Networks (GAN)',
        ],
      },
      {
        number: 8,
        title: 'Generative AI & Large Language Models (LLMs)',
        unitName: 'Unit 7 (Subject-Specific)',
        keyTopics: [
          'Foundations of Generative AI – Discriminative vs Generative modeling paradigms',
          'Introduction to Transformer architectures – Attention mechanism, self-attention, tokenization, embeddings',
          'Large Language Models (LLMs) – Pre-training, fine-tuning, and Reinforcement Learning from Human Feedback (RLHF)',
          'Prompt Engineering best practices – Zero-shot, few-shot prompting, Chain-of-Thought (CoT), role prompting',
          'Multimodal GenAI – Text-to-Image (Diffusion models), Audio, and Code synthesis tools',
          'Risks and Ethics in GenAI – Hallucinations, algorithmic bias, copyright/IP issues, deepfakes, AI safety & alignment',
        ],
      },
      {
        number: 9,
        title: 'Data Storytelling & Dashboard Visualization',
        unitName: 'Unit 8 (Subject-Specific)',
        keyTopics: [
          'Principles of effective data storytelling – Connecting data insights with human emotional decision-making',
          'Narrative structure in data presentations – Setup, conflict/challenge, resolution, call to action',
          'Visual encodings and cognitive load – Selecting the right charts (bar, line, scatter, treemap, heatmaps)',
          'Designing interactive dashboards – Layout, hierarchy, color psychology, and accessibility',
          'Ethics in data presentation – Avoiding deceptive visual scales and misleading axes',
        ],
      },
      {
        number: 10,
        title: 'Capstone AI Project Lifecycle & Ethics',
        unitName: 'Part C / Capstone',
        keyTopics: [
          'End-to-end Capstone Project lifecycle – Problem definition, data acquisition, model prototyping, validation, user testing',
          'Responsible AI principles – Fairness, accountability, transparency, explainability (XAI), and data privacy (DPDP Act)',
          'Documentation standards – Project logbook, architecture diagrams, code documentation, and presentation viva prep',
        ],
      },
    ],
  },
};

/**
 * Backward compatibility alias: exports the curriculum map.
 */
export const CBSE_CLASS_11_CURRICULUM = CBSE_CURRICULUM;

/**
 * Normalizes subject names to canonical curriculum keys.
 */
export function normalizeSubjectKey(rawSubject: string): string {
  const norm = String(rawSubject || '').trim().toLowerCase();

  // Physical Education matches (including compound allocations like Physical Education (PE) & AI)
  if (
    norm === 'pe' ||
    norm.includes('physical education') ||
    norm.includes('physical ed') ||
    norm === 'pe & ai' ||
    norm === 'pe and ai'
  ) {
    return 'Physical Education';
  }

  // Artificial Intelligence matches
  if (
    norm === 'ai' ||
    norm.includes('artificial intelligence') ||
    norm.includes('artificial intel')
  ) {
    return 'Artificial Intelligence';
  }

  // Fine Arts matches
  if (
    norm.includes('fine art') ||
    norm.includes('painting')
  ) {
    return 'Fine Arts';
  }

  // English matches
  if (norm === 'english' || norm === 'english core') {
    return 'English Core';
  }

  // Mathematics matches
  if (norm === 'mathematics' || norm === 'math' || norm === 'maths') {
    return 'Mathematics';
  }

  // Political Science matches
  if (norm === 'political science' || norm === 'pol sci') {
    return 'Political Science';
  }

  // Business Studies matches
  if (norm === 'business studies' || norm === 'bst') {
    return 'Business Studies';
  }

  // Case-insensitive direct match against keys
  for (const key of Object.keys(CBSE_CURRICULUM)) {
    if (key.toLowerCase() === norm) {
      return key;
    }
  }

  return rawSubject;
}

/**
 * Returns subjects available for a stream, including the 3 upgraded Class 12 common subjects.
 */
export function getSubjectsForStream(stream: StreamType): string[] {
  const list: string[] = [];
  for (const [subjName, def] of Object.entries(CBSE_CURRICULUM)) {
    if (def.streams.includes(stream)) {
      list.push(subjName);
    }
  }
  return list;
}

/**
 * Returns chapter list for any subject with automatic normalization.
 */
export function getChaptersForSubject(subject: string): ChapterInfo[] {
  const canonKey = normalizeSubjectKey(subject);
  return CBSE_CURRICULUM[canonKey]?.chapters || [];
}

/**
 * Returns full subject curriculum metadata including class level and academic session.
 */
export function getSubjectCurriculum(subject: string): SubjectCurriculum | undefined {
  const canonKey = normalizeSubjectKey(subject);
  return CBSE_CURRICULUM[canonKey];
}

/**
 * Returns whether a given subject operates at Class 11 or Class 12 level.
 * Strictly returns 'Class 12' ONLY for Physical Education, Artificial Intelligence, and Fine Arts.
 */
export function getSubjectClassLevel(subject: string): 'Class 11' | 'Class 12' {
  const canonKey = normalizeSubjectKey(subject);
  return CBSE_CURRICULUM[canonKey]?.classLevel || 'Class 11';
}
