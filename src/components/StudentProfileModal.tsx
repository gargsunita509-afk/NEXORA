import React, { useEffect } from 'react';
import {
  X,
  User,
  GraduationCap,
  Sparkles,
  BookOpen,
  School,
  ShieldCheck,
  Award,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { Student, StreamType } from '../types';
import { getStudentProfileData } from '../data/studentSubjectMapping';
import { audioFX } from '../services/audio';

interface StudentProfileModalProps {
  student: Student | null;
  isOpen: boolean;
  onClose: () => void;
}

const STREAM_THEMES: Record<
  StreamType,
  {
    border: string;
    borderGlow: string;
    badgeBg: string;
    badgeText: string;
    gradient: string;
    accent: string;
    glowColor: string;
  }
> = {
  PCM: {
    border: 'border-cyan-500/40',
    borderGlow: 'shadow-[0_0_30px_rgba(0,240,255,0.25)]',
    badgeBg: 'bg-cyan-500/20 border-cyan-400/50',
    badgeText: 'text-cyan-300',
    gradient: 'from-cyan-950/60 via-blue-950/40 to-slate-950/90',
    accent: 'text-cyan-400',
    glowColor: '#00f0ff',
  },
  PCB: {
    border: 'border-emerald-500/40',
    borderGlow: 'shadow-[0_0_30px_rgba(16,185,129,0.25)]',
    badgeBg: 'bg-emerald-500/20 border-emerald-400/50',
    badgeText: 'text-emerald-300',
    gradient: 'from-emerald-950/60 via-teal-950/40 to-slate-950/90',
    accent: 'text-emerald-400',
    glowColor: '#10b981',
  },
  HUMANITIES: {
    border: 'border-purple-500/40',
    borderGlow: 'shadow-[0_0_30px_rgba(168,85,247,0.25)]',
    badgeBg: 'bg-purple-500/20 border-purple-400/50',
    badgeText: 'text-purple-300',
    gradient: 'from-purple-950/60 via-violet-950/40 to-slate-950/90',
    accent: 'text-purple-400',
    glowColor: '#a855f7',
  },
  COMMERCE: {
    border: 'border-amber-500/40',
    borderGlow: 'shadow-[0_0_30px_rgba(245,158,11,0.25)]',
    badgeBg: 'bg-amber-500/20 border-amber-400/50',
    badgeText: 'text-amber-300',
    gradient: 'from-amber-950/60 via-yellow-950/40 to-slate-950/90',
    accent: 'text-amber-400',
    glowColor: '#f59e0b',
  },
};

export const StudentProfileModal: React.FC<StudentProfileModalProps> = ({
  student,
  isOpen,
  onClose,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !student) return null;

  const profile = getStudentProfileData(student);
  const theme = STREAM_THEMES[student.stream] || STREAM_THEMES.PCM;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="student-profile-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className={`relative w-full max-w-xl rounded-2xl sm:rounded-3xl bg-gradient-to-br ${theme.gradient} border ${theme.border} ${theme.borderGlow} p-5 sm:p-7 text-white overflow-hidden shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Holographic background ambient glow */}
        <div
          className="absolute -top-24 -right-24 w-60 h-60 rounded-full blur-3xl pointer-events-none opacity-20"
          style={{ backgroundColor: theme.glowColor }}
        />
        <div
          className="absolute -bottom-24 -left-24 w-60 h-60 rounded-full blur-3xl pointer-events-none opacity-15"
          style={{ backgroundColor: theme.glowColor }}
        />

        {/* Modal Close Button */}
        <button
          onClick={() => {
            audioFX.playClick();
            onClose();
          }}
          className="absolute top-4 right-4 sm:top-5 sm:right-5 p-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-700/60 transition cursor-pointer z-10"
          aria-label="Close Profile"
        >
          <X className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>

        {/* Header Section */}
        <div className="flex items-start gap-4 pb-5 border-b border-white/10 relative z-10">
          <div
            className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center shrink-0 border ${theme.badgeBg} font-hud font-black text-xl sm:text-2xl shadow-lg`}
          >
            {student.gender === 'girl' ? '♀' : '♂'}
          </div>

          <div className="min-w-0 flex-1 pr-6">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`px-2.5 py-0.5 rounded-md text-[11px] font-mono-code font-bold uppercase tracking-wider border ${theme.badgeBg} ${theme.badgeText}`}
              >
                {student.stream} STREAM
              </span>
              <span className="text-[11px] font-mono-code text-slate-400">
                THE ABHINAV SCHOOL
              </span>
            </div>

            <h2
              id="student-profile-title"
              className="text-2xl sm:text-3xl font-hud font-extrabold text-white mt-1 truncate tracking-wide"
            >
              {profile.name}
            </h2>

            <div className="flex items-center gap-2 text-xs text-slate-300 mt-1 font-sans flex-wrap">
              <span>Class 11th</span>
              <span>•</span>
              <span>Class In-Charge: <strong className="text-cyan-300">Diksha Mam</strong></span>
            </div>
          </div>
        </div>

        {/* Main Body: Confirmed Subjects & Teachers */}
        <div className="py-5 space-y-4 relative z-10">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-mono-code text-cyan-400 uppercase tracking-widest font-bold flex items-center gap-2">
              <BookOpen className="w-3.5 h-3.5" />
              <span>CONFIRMED SUBJECTS &amp; TEACHERS</span>
            </h3>
            <span className="text-xs font-mono-code text-slate-400">
              {profile.subjects.length} Confirmed {profile.subjects.length === 1 ? 'Subject' : 'Subjects'}
            </span>
          </div>

          {/* Subjects List */}
          <div className="space-y-2.5 max-h-[45vh] overflow-y-auto pr-1">
            {profile.subjects.map((sub, idx) => (
              <div
                key={sub.name}
                className="p-3 sm:p-3.5 rounded-xl bg-slate-950/60 border border-white/10 hover:border-cyan-500/30 transition flex items-center justify-between gap-3 group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-6 h-6 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 font-mono-code text-xs font-bold flex items-center justify-center shrink-0">
                    {idx + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="font-hud font-bold text-sm sm:text-base text-white truncate group-hover:text-cyan-200 transition">
                      {sub.name}
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  {sub.teacher ? (
                    <div className="text-xs font-mono-code text-slate-300 bg-white/5 border border-white/10 px-2.5 py-1 rounded-lg">
                      <span className="text-slate-400 text-[10px] block sm:inline sm:mr-1">Faculty:</span>
                      <strong className={sub.teacher === 'Alka Mam' ? 'text-cyan-300 font-semibold' : 'text-slate-100 font-medium'}>
                        {sub.teacher}
                      </strong>
                    </div>
                  ) : (
                    <div className="text-[11px] font-mono-code text-slate-400 italic px-2 py-0.5">
                      —
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Special note for Devansh or other confirmed data notes */}
          {profile.specialNote && (
            <div className="p-3.5 rounded-xl bg-amber-950/30 border border-amber-500/40 text-amber-200 text-xs flex items-center gap-2.5 animate-pulse">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <div className="font-sans font-medium tracking-wide">
                Note: <strong>{profile.specialNote}</strong>
              </div>
            </div>
          )}
        </div>

        {/* Footer info badge */}
        <div className="pt-4 border-t border-white/10 flex items-center justify-between text-[11px] font-mono-code text-slate-400 relative z-10">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
            <span>NEXORA Academic Record</span>
          </div>
          <button
            onClick={() => {
              audioFX.playClick();
              onClose();
            }}
            className="px-3.5 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-300 font-hud font-bold text-xs transition cursor-pointer"
          >
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
};
