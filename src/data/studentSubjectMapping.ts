import { StreamType } from '../types';

export interface StudentSubjectInfo {
  name: string;
  teacher?: string;
  isConfirmed: boolean;
}

export interface StudentProfileData {
  id: string;
  name: string;
  stream: StreamType;
  gender: 'boy' | 'girl';
  subjects: StudentSubjectInfo[];
  specialNote?: string;
}

// Confirmed Authoritative Subject-Teacher Directory
export const CONFIRMED_TEACHER_MAPPING: Record<string, string> = {
  Physics: 'Diksha Mam',
  Chemistry: 'Harshu Mam',
  Mathematics: 'Anita Mam',
  English: 'Nancy Mam',
  Economics: 'Alka Mam',
  'Political Science': 'Ritu Mam',
  History: 'Ritu Mam',
  'Business Studies': 'Alka Mam',
  Accountancy: 'Alka Mam',
  Biology: 'Shalini Mam', // Authoritative existing timetable record
};

/**
 * Normalizes student name for exact matching across variations (e.g. "Lakshit/Shivam" vs "Lakshit / Shivam")
 */
export function normalizeStudentKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s*\/\s*/g, '/');
}

/**
 * Returns the exact verified subjects and confirmed teachers for any of the 21 students.
 * Strictly respects all individual exceptions: Harshita, Vanshika, Diya, and Devansh.
 */
export function getStudentProfileData(student: { id?: string; name: string; stream: StreamType; gender?: 'boy' | 'girl' }): StudentProfileData {
  const norm = normalizeStudentKey(student.name);

  // 1. DEVANSH — SPECIAL CONFIRMED-SUBJECT EXCEPTION
  // Display EXACTLY three confirmed subjects: English, Fine Arts, Physical Education
  // Plus exact note: "3 other subjects not confirmed."
  if (norm === 'devansh') {
    return {
      id: student.id || 'std-17',
      name: 'Devansh',
      stream: 'HUMANITIES',
      gender: student.gender || 'boy',
      subjects: [
        { name: 'English', teacher: CONFIRMED_TEACHER_MAPPING['English'], isConfirmed: true },
        { name: 'Fine Arts', isConfirmed: true },
        { name: 'Physical Education', isConfirmed: true },
      ],
      specialNote: '3 other subjects not confirmed.',
    };
  }

  // 2. HARSHITA — PCM EXCEPTION
  // Physics, Chemistry, Mathematics, English, Physical Education, Artificial Intelligence (AI)
  // No Fine Arts!
  if (norm === 'harshita') {
    return {
      id: student.id || 'std-10',
      name: 'Harshita',
      stream: 'PCM',
      gender: student.gender || 'girl',
      subjects: [
        { name: 'Physics', teacher: CONFIRMED_TEACHER_MAPPING['Physics'], isConfirmed: true },
        { name: 'Chemistry', teacher: CONFIRMED_TEACHER_MAPPING['Chemistry'], isConfirmed: true },
        { name: 'Mathematics', teacher: CONFIRMED_TEACHER_MAPPING['Mathematics'], isConfirmed: true },
        { name: 'English', teacher: CONFIRMED_TEACHER_MAPPING['English'], isConfirmed: true },
        { name: 'Physical Education', isConfirmed: true },
        { name: 'Artificial Intelligence (AI)', isConfirmed: true },
      ],
    };
  }

  // 3. VANSHIKA — COMMERCE EXCEPTION
  // Business Studies, Accountancy, English, Mathematics, Economics, Fine Arts
  // Economics replaces Physical Education for Vanshika only!
  if (norm === 'vanshika') {
    return {
      id: student.id || 'std-13',
      name: 'Vanshika',
      stream: 'COMMERCE',
      gender: student.gender || 'girl',
      subjects: [
        { name: 'Business Studies', teacher: CONFIRMED_TEACHER_MAPPING['Business Studies'], isConfirmed: true },
        { name: 'Accountancy', teacher: CONFIRMED_TEACHER_MAPPING['Accountancy'], isConfirmed: true },
        { name: 'English', teacher: CONFIRMED_TEACHER_MAPPING['English'], isConfirmed: true },
        { name: 'Mathematics', teacher: CONFIRMED_TEACHER_MAPPING['Mathematics'], isConfirmed: true },
        { name: 'Economics', teacher: CONFIRMED_TEACHER_MAPPING['Economics'], isConfirmed: true },
        { name: 'Fine Arts', isConfirmed: true },
      ],
    };
  }

  // 4. DIYA — HUMANITIES EXCEPTION
  // Political Science, History, English, Mathematics, Physical Education, Artificial Intelligence (AI)
  // No Economics or Fine Arts!
  if (norm === 'diya') {
    return {
      id: student.id || 'std-11',
      name: 'Diya',
      stream: 'HUMANITIES',
      gender: student.gender || 'girl',
      subjects: [
        { name: 'Political Science', teacher: CONFIRMED_TEACHER_MAPPING['Political Science'], isConfirmed: true },
        { name: 'History', teacher: CONFIRMED_TEACHER_MAPPING['History'], isConfirmed: true },
        { name: 'English', teacher: CONFIRMED_TEACHER_MAPPING['English'], isConfirmed: true },
        { name: 'Mathematics', teacher: CONFIRMED_TEACHER_MAPPING['Mathematics'], isConfirmed: true },
        { name: 'Physical Education', isConfirmed: true },
        { name: 'Artificial Intelligence (AI)', isConfirmed: true },
      ],
    };
  }

  // STREAM-WISE DEFAULTS FOR ALL OTHER STUDENTS
  switch (student.stream) {
    case 'PCM':
      // Arpit, Hardik, Khushant, Vansh, Gauransh
      return {
        id: student.id || `std-${student.name}`,
        name: student.name,
        stream: 'PCM',
        gender: student.gender || 'boy',
        subjects: [
          { name: 'Physics', teacher: CONFIRMED_TEACHER_MAPPING['Physics'], isConfirmed: true },
          { name: 'Chemistry', teacher: CONFIRMED_TEACHER_MAPPING['Chemistry'], isConfirmed: true },
          { name: 'Mathematics', teacher: CONFIRMED_TEACHER_MAPPING['Mathematics'], isConfirmed: true },
          { name: 'English', teacher: CONFIRMED_TEACHER_MAPPING['English'], isConfirmed: true },
          { name: 'Physical Education', isConfirmed: true },
          { name: 'Fine Arts', isConfirmed: true },
        ],
      };

    case 'PCB':
      // Lakshit / Shivam, Dikshit, Geetika
      return {
        id: student.id || `std-${student.name}`,
        name: student.name,
        stream: 'PCB',
        gender: student.gender || 'boy',
        subjects: [
          { name: 'Physics', teacher: CONFIRMED_TEACHER_MAPPING['Physics'], isConfirmed: true },
          { name: 'Chemistry', teacher: CONFIRMED_TEACHER_MAPPING['Chemistry'], isConfirmed: true },
          { name: 'Biology', teacher: CONFIRMED_TEACHER_MAPPING['Biology'], isConfirmed: true },
          { name: 'English', teacher: CONFIRMED_TEACHER_MAPPING['English'], isConfirmed: true },
          { name: 'Physical Education', isConfirmed: true },
          { name: 'Fine Arts', isConfirmed: true },
        ],
      };

    case 'COMMERCE':
      // Riya, Harsh, Sandhya, Tamanna
      return {
        id: student.id || `std-${student.name}`,
        name: student.name,
        stream: 'COMMERCE',
        gender: student.gender || 'boy',
        subjects: [
          { name: 'Business Studies', teacher: CONFIRMED_TEACHER_MAPPING['Business Studies'], isConfirmed: true },
          { name: 'Accountancy', teacher: CONFIRMED_TEACHER_MAPPING['Accountancy'], isConfirmed: true },
          { name: 'English', teacher: CONFIRMED_TEACHER_MAPPING['English'], isConfirmed: true },
          { name: 'Economics', teacher: CONFIRMED_TEACHER_MAPPING['Economics'], isConfirmed: true },
          { name: 'Physical Education', isConfirmed: true },
          { name: 'Fine Arts', isConfirmed: true },
        ],
      };

    case 'HUMANITIES':
    default:
      // Keshav, Anmol, Raghav, Aashish, Anshika
      return {
        id: student.id || `std-${student.name}`,
        name: student.name,
        stream: 'HUMANITIES',
        gender: student.gender || 'boy',
        subjects: [
          { name: 'Political Science', teacher: CONFIRMED_TEACHER_MAPPING['Political Science'], isConfirmed: true },
          { name: 'History', teacher: CONFIRMED_TEACHER_MAPPING['History'], isConfirmed: true },
          { name: 'English', teacher: CONFIRMED_TEACHER_MAPPING['English'], isConfirmed: true },
          { name: 'Physical Education', isConfirmed: true },
          { name: 'Fine Arts', isConfirmed: true },
          { name: 'Economics', teacher: CONFIRMED_TEACHER_MAPPING['Economics'], isConfirmed: true },
        ],
      };
  }
}
