import React, { useState } from 'react';
import {
  Users,
  Maximize2,
  Minimize2,
  Filter,
  Search,
  Sparkles,
  GraduationCap,
} from 'lucide-react';
import { storage } from '../../services/storage';
import { Student, StreamType, StaffUser } from '../../types';
import { audioFX } from '../../services/audio';
import { StudentProfileModal } from '../StudentProfileModal';

interface ClassIntroModuleProps {
  staffUser?: StaffUser | null;
  onOpenManageCharacters?: () => void;
}

const STREAM_COLORS: Record<StreamType, { border: string; bg: string; badge: string; text: string }> = {
  PCM: {
    border: 'border-cyan-500/30 hover:border-cyan-400',
    bg: 'bg-cyan-950/20 hover:bg-cyan-950/40',
    badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
    text: 'text-cyan-200',
  },
  PCB: {
    border: 'border-emerald-500/30 hover:border-emerald-400',
    bg: 'bg-emerald-950/20 hover:bg-emerald-950/40',
    badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    text: 'text-emerald-200',
  },
  HUMANITIES: {
    border: 'border-purple-500/30 hover:border-purple-400',
    bg: 'bg-purple-950/20 hover:bg-purple-950/40',
    badge: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
    text: 'text-purple-200',
  },
  COMMERCE: {
    border: 'border-amber-500/30 hover:border-amber-400',
    bg: 'bg-amber-950/20 hover:bg-amber-950/40',
    badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    text: 'text-amber-200',
  },
};

export const ClassIntroModule: React.FC<ClassIntroModuleProps> = ({
  staffUser,
  onOpenManageCharacters,
}) => {
  const [students, setStudents] = useState<Student[]>(() => storage.getStudents());
  const [selectedStream, setSelectedStream] = useState<StreamType | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [selectedStudentForProfile, setSelectedStudentForProfile] = useState<Student | null>(null);

  // Sync roster with backend data/students.json
  React.useEffect(() => {
    storage
      .syncStudentsWithBackend()
      .then((synced) => {
        setStudents(synced);
      })
      .catch(() => {
        setStudents(storage.getStudents());
      });
  }, []);

  const filteredStudents = students.filter((s) => {
    const matchesStream = selectedStream === 'ALL' || s.stream === selectedStream;
    const matchesSearch =
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.stream.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStream && matchesSearch;
  });

  return (
    <div
      className={`space-y-6 transition-all duration-300 animate-in fade-in ${
        isFullScreen ? 'fixed inset-0 z-50 bg-[#040814] p-4 sm:p-8 overflow-y-auto' : ''
      }`}
    >
      {/* Top Banner & Fullscreen Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 sm:p-6 rounded-2xl jarvis-panel border border-cyan-500/30">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 font-mono-code text-xs font-bold uppercase">
              MODULE 09
            </span>
            <span className="text-xs font-mono-code text-slate-400">CLASS 11TH ROSTER</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold font-hud text-white mt-1">
            CLASS 11TH ROSTER & ACADEMIC STREAMS
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 font-sans mt-0.5">
            The Abhinav School • Complete verified student registry
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          {/* Stream Filter Pills */}
          <div className="flex items-center gap-1 bg-slate-950/80 border border-cyan-500/20 p-1 rounded-xl overflow-x-auto">
            {(['ALL', 'PCM', 'PCB', 'HUMANITIES', 'COMMERCE'] as (StreamType | 'ALL')[]).map((st) => (
              <button
                key={st}
                onClick={() => {
                  audioFX.playClick();
                  setSelectedStream(st);
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono-code font-bold transition whitespace-nowrap ${
                  selectedStream === st
                    ? 'bg-cyan-500 text-black shadow-[0_0_10px_rgba(0,240,255,0.4)]'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          {/* Developer-Only: Manage / Add Characters Button */}
          {staffUser?.role === 'developer' && onOpenManageCharacters && (
            <button
              onClick={() => {
                audioFX.playClick();
                onOpenManageCharacters();
              }}
              className="px-3 py-2 rounded-xl bg-purple-950/50 border border-purple-500/40 text-purple-300 hover:bg-purple-900/60 flex items-center gap-1.5 text-xs font-hud font-bold shadow-[0_0_15px_rgba(168,85,247,0.2)] transition"
              title="Developer Mode: Add or Manage Class Students / Characters"
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span>+ MANAGE CHARACTERS</span>
            </button>
          )}

          {/* Fullscreen Toggle */}
          <button
            onClick={() => {
              audioFX.playClick();
              setIsFullScreen(!isFullScreen);
            }}
            className="p-2 sm:px-3 sm:py-2 rounded-xl bg-cyan-950/40 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-900/50 flex items-center gap-1.5 text-xs font-hud font-bold"
            title={isFullScreen ? 'Exit Full Screen' : 'Full Screen Smart Board'}
          >
            {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            <span className="hidden md:inline">{isFullScreen ? 'EXIT' : 'FULLSCREEN'}</span>
          </button>
        </div>
      </div>

      {/* SECTION 1: CLASS IN-CHARGE (FIRST) */}
      <div className="p-6 sm:p-8 rounded-2xl jarvis-panel-glow border border-cyan-400/40 text-center relative overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-32 rounded-full bg-cyan-400/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center justify-center">
          <span className="text-[11px] sm:text-xs font-mono-code text-cyan-400 uppercase tracking-[0.25em] font-semibold mb-1">
            CLASS IN-CHARGE
          </span>
          <h3
            className="text-3xl sm:text-5xl font-hud font-black text-white tracking-wider"
            style={{
              textShadow: '0 0 25px rgba(0, 240, 255, 0.5), 0 0 50px rgba(0, 119, 254, 0.3)',
            }}
          >
            Diksha Mam
          </h3>
          <p className="text-xs sm:text-sm font-sans text-slate-300 mt-1.5">
            Faculty Mentor & Department Coordinator • Class 11th, The Abhinav School
          </p>
        </div>
      </div>

      {/* Glowing Divider & Instructions */}
      <div className="relative flex flex-col items-center justify-center py-2">
        <div className="w-full h-px bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent" />
        <span className="bg-[#040814] px-4 text-xs font-hud font-bold text-cyan-300 uppercase tracking-widest border border-cyan-500/30 rounded-full py-0.5">
          ALL STUDENTS ({students.length}) • CLICK ANY STUDENT TO VIEW PROFILE
        </span>
      </div>

      {/* SECTION 2: ALL STUDENTS TOGETHER (UNIFIED SIMULTANEOUS GRID) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
        {filteredStudents.map((student) => {
          const streamStyle = STREAM_COLORS[student.stream] || STREAM_COLORS.PCM;

          return (
            <div
              key={student.id}
              onClick={() => {
                audioFX.playClick();
                setSelectedStudentForProfile(student);
              }}
              className={`p-4 rounded-xl border backdrop-blur-md transition-all duration-200 flex items-center justify-between gap-3 group jarvis-panel-interactive cursor-pointer select-none hover:shadow-lg ${streamStyle.border} ${streamStyle.bg}`}
              title={`Click to view ${student.name}'s academic profile & confirmed subjects`}
            >
              <div className="flex-1 min-w-0">
                {/* Student Name */}
                <div className="font-hud font-bold text-base sm:text-lg text-white group-hover:text-cyan-200 transition truncate flex items-center gap-1.5">
                  <span>{student.name}</span>
                  <span className="text-[10px] text-cyan-400 opacity-0 group-hover:opacity-100 transition">↗</span>
                </div>
                {/* Stream Subtitle */}
                <div className="text-xs font-mono-code text-slate-400 mt-0.5">
                  Stream: <span className="font-semibold text-slate-200">{student.stream}</span>
                </div>
              </div>

              {/* Stream Badge */}
              <div
                className={`px-2.5 py-1 rounded-lg text-xs font-mono-code font-bold uppercase shrink-0 border ${streamStyle.badge}`}
              >
                {student.stream}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer Info Counter */}
      <div className="p-3.5 rounded-xl bg-slate-950/40 border border-cyan-500/10 text-center text-xs font-mono-code text-slate-400">
        Showing {filteredStudents.length} of {students.length} verified Class 11th students at The Abhinav School. Click any student to view their confirmed subject list.
      </div>

      {/* Student Profile Modal */}
      <StudentProfileModal
        student={selectedStudentForProfile}
        isOpen={Boolean(selectedStudentForProfile)}
        onClose={() => setSelectedStudentForProfile(null)}
      />
    </div>
  );
};
