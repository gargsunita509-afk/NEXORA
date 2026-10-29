import React, { useState, useEffect } from 'react';
import {
  CalendarDays,
  Youtube,
  PenTool,
  BookOpen,
  StickyNote,
  Timer,
  Trophy,
  Gamepad2,
  Bot,
  Users,
  Calculator,
  ArrowRight,
  Clock,
  Sparkles,
  ShieldCheck,
  Lock,
} from 'lucide-react';
import { NavModule, StaffUser } from '../../types';
import { storage } from '../../services/storage';
import {
  getCurrentAndNextPeriod,
  getTodayDayOfWeek,
  getLiveWeekday,
  isSunday,
  formatTime12h,
} from '../../utils/timetableHelper';
import { audioFX } from '../../services/audio';
import { QuickNotesFAB } from '../QuickNotesFAB';

interface DashboardModuleProps {
  onNavigate: (module: NavModule) => void;
  staffUser?: StaffUser | null;
  onOpenStaffPortal?: () => void;
}

export const ALL_MODULE_CARDS: {
  id: NavModule;
  title: string;
  subtitle: string;
  badge?: string;
  icon: React.ElementType;
  gradient: string;
  accent: string;
  staffOnly?: boolean;
}[] = [
  {
    id: 'timetable',
    title: 'Class Timetable',
    subtitle: 'Monday-Saturday schedule with stream allocation & live lecture tracking',
    badge: 'Live Status',
    icon: CalendarDays,
    gradient: 'from-cyan-950/40 via-blue-950/40 to-slate-950/80',
    accent: 'border-cyan-500/30 group-hover:border-cyan-400',
  },
  {
    id: 'notes',
    title: 'Digital Sketchboard',
    subtitle: 'Interactive whiteboard with Cartesian axes, pens, shapes & PNG export',
    badge: 'Multi-Board',
    icon: PenTool,
    gradient: 'from-blue-950/40 via-indigo-950/40 to-slate-950/80',
    accent: 'border-blue-500/30 group-hover:border-blue-400',
  },
  {
    id: 'calculator',
    title: 'Scientific Calculator',
    subtitle: 'Trigonometric, logarithmic & algebraic computing suite with live history',
    badge: 'Precision Mode',
    icon: Calculator,
    gradient: 'from-emerald-950/40 via-teal-950/40 to-slate-950/80',
    accent: 'border-emerald-500/30 group-hover:border-emerald-400',
  },
  {
    id: 'quiz',
    title: 'Quiz Arena & Papers',
    subtitle: 'CBSE assessment bank with instant feedback, live leaderboard & PDF exports',
    badge: 'Official CBSE',
    icon: Trophy,
    gradient: 'from-amber-950/40 via-yellow-950/40 to-slate-950/80',
    accent: 'border-amber-500/30 group-hover:border-amber-400',
  },
  {
    id: 'gemini',
    title: 'Jarvis Class OS Copilot',
    subtitle: 'Academic intelligence for doubt solving, NCERT concept clarity & exam tips',
    badge: 'Gemini 2.5 Flash',
    icon: Bot,
    gradient: 'from-cyan-950/40 via-sky-950/40 to-slate-950/80',
    accent: 'border-cyan-500/30 group-hover:border-cyan-400',
  },
  {
    id: 'games',
    title: 'Retro Arcade Lounge',
    subtitle: 'Classic retro breakout, arcade snake & speed reaction training games',
    badge: 'Mind Refresh',
    icon: Gamepad2,
    gradient: 'from-rose-950/40 via-pink-950/40 to-slate-950/80',
    accent: 'border-rose-500/30 group-hover:border-rose-400',
  },
  {
    id: 'timer',
    title: 'Study Focus Timer',
    subtitle: 'Pomodoro timer, exam countdowns & interval stopwatch for focused revision',
    badge: 'Focus Track',
    icon: Timer,
    gradient: 'from-indigo-950/40 via-purple-950/40 to-slate-950/80',
    accent: 'border-indigo-500/30 group-hover:border-indigo-400',
  },
  {
    id: 'youtube',
    title: 'YouTube Gateway',
    subtitle: 'Direct launcher and validated Class 11 video lectures & playlists',
    badge: 'Direct Launch',
    icon: Youtube,
    gradient: 'from-red-950/40 via-rose-950/40 to-slate-950/80',
    accent: 'border-red-500/30 group-hover:border-red-400',
  },
];

export const DashboardModule: React.FC<DashboardModuleProps> = ({
  onNavigate,
  staffUser,
  onOpenStaffPortal,
}) => {
  const [liveDate, setLiveDate] = useState<Date>(new Date());
  const [currentTimeMinutes, setCurrentTimeMinutes] = useState<number>(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  });

  const isStaffAuthorized = Boolean(
    staffUser &&
      (staffUser.role === 'teacher_in_charge' || staffUser.role === 'developer')
  );

  const timetable = storage.getTimetable();
  const liveWeekday = getLiveWeekday(liveDate);
  const isSundayToday = isSunday(liveDate);
  const todayDay = isSundayToday ? null : getTodayDayOfWeek(liveDate);
  const todayPeriods = (todayDay && timetable[todayDay]) ? timetable[todayDay] : [];
  const { current: activePeriod } = isSundayToday
    ? { current: null }
    : getCurrentAndNextPeriod(todayPeriods, currentTimeMinutes);

  // Live second-precision IST clock & period updater
  useEffect(() => {
    const update = () => {
      const now = new Date();
      setLiveDate(now);
      setCurrentTimeMinutes(now.getHours() * 60 + now.getMinutes());
    };

    const interval = setInterval(update, 1000);
    const handleVisibility = () => {
      if (!document.hidden) update();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', update);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', update);
    };
  }, []);

  const localTimeStr = liveDate.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  const localDateStr = liveDate.toLocaleDateString([], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const MODULE_CARDS = ALL_MODULE_CARDS;

  return (
    <div className="space-y-6">
      {/* HERO COMMAND CENTER BANNER */}
      <div className="relative p-4 sm:p-8 md:p-10 rounded-2xl sm:rounded-3xl jarvis-panel-glow border border-cyan-400/40 overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 rounded-full bg-cyan-400/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 w-64 h-64 rounded-full bg-blue-600/10 blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5 sm:gap-6">
          <div className="space-y-2 max-w-2xl min-w-0">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 font-mono-code text-[11px] sm:text-xs font-bold uppercase tracking-wider">
                NEXORA COMMAND CENTER
              </span>
              <span className="text-[11px] sm:text-xs font-mono-code text-slate-400">
                • THE ABHINAV SCHOOL
              </span>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center items-start gap-2.5 sm:gap-4 pt-0.5">
              <h2 className="text-xl sm:text-3xl md:text-4xl font-extrabold font-hud tracking-tight sm:tracking-wide text-white min-w-0 break-words leading-snug sm:leading-tight">
                CLASS 11<span className="text-cyan-400">TH</span> SMART BOARD OS
              </h2>

              <div
                className="inline-flex items-center gap-2 sm:gap-2.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl bg-[#040a1c]/90 border border-cyan-500/40 shadow-[0_0_15px_rgba(0,240,255,0.18)] text-cyan-300 backdrop-blur-md shrink-0"
                title="Current Local Time & Date"
              >
                <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center shrink-0">
                  <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-cyan-300 animate-pulse" />
                </div>
                <div className="flex flex-col">
                  <div className="flex items-baseline gap-1.5 font-mono-code text-xs sm:text-sm font-bold tracking-wider text-white">
                    <span>{localTimeStr}</span>
                    <span className="text-[9px] sm:text-[10px] text-cyan-400 font-bold px-1 rounded bg-cyan-950 border border-cyan-500/30">
                      LIVE
                    </span>
                  </div>
                  <div className="text-[9px] font-mono-code text-slate-400 leading-tight">
                    {localDateStr}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs sm:text-sm md:text-base text-slate-300 font-sans pt-0.5">
              <span className="text-slate-300 font-medium">Class In-Charge:</span>
              <span className="text-sm sm:text-base md:text-lg font-semibold text-cyan-300 tracking-wide drop-shadow-[0_0_8px_rgba(0,240,255,0.3)]">
                Diksha Mam
              </span>
              <span className="text-slate-500 text-xs hidden sm:inline">•</span>
              <span className="text-xs sm:text-sm text-slate-300">
                Dedicated smart command hub supporting PCM, PCB, Humanities, and Commerce streams.
              </span>
            </div>
          </div>

          {/* Real-Time Lecture Status Pill */}
          <div className="shrink-0 p-4 sm:p-5 rounded-2xl bg-[#030611]/90 border border-cyan-500/30 shadow-xl w-full md:w-auto md:max-w-xs">
            <div className="flex items-center justify-between text-xs font-mono-code mb-2">
              <span
                className={`font-bold flex items-center gap-1.5 ${
                  isSundayToday ? 'text-amber-400' : 'text-cyan-400'
                }`}
              >
                {!isSundayToday && (
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                )}
                {liveWeekday.toUpperCase()} {isSundayToday ? 'STATUS' : 'SCHEDULE'}
              </span>
              <span className="text-slate-400">
                {isSundayToday ? 'OFF DAY' : '7:30 AM – 2:00 PM'}
              </span>
            </div>

            {isSundayToday ? (
              <div className="space-y-1">
                <div className="font-hud font-bold text-amber-300 text-sm sm:text-base">
                  Sunday — No Regular School Timetable
                </div>
                <p className="text-xs text-slate-400 font-sans leading-relaxed">
                  School campus is closed on Sundays. Access the full Monday–Saturday timetable below.
                </p>
              </div>
            ) : activePeriod ? (
              <div>
                <div className="font-hud font-bold text-white text-base truncate">
                  {activePeriod.title}
                </div>
                <div className="text-xs font-mono-code text-cyan-300 mt-0.5">
                  {formatTime12h(activePeriod.startTime)} – {formatTime12h(activePeriod.endTime)}
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-400 font-sans">
                No lecture currently running. Ready for next session.
              </div>
            )}

            <button
              onClick={() => {
                audioFX.playClick();
                onNavigate('timetable');
              }}
              className="w-full mt-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-300 text-xs font-hud font-bold transition flex items-center justify-center gap-1 cursor-pointer"
            >
              <span>VIEW FULL TIMETABLE</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* STAFF SECURITY VAULT BANNER */}
      {isStaffAuthorized && staffUser && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/40 via-cyan-950/40 to-violet-950/40 border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-300 shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white">
                  Staff Security Vault Unlocked: {staffUser.displayName}
                </span>
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-mono">
                  {staffUser.roleLabel}
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Protected Class Diary uploads and Private Staff Quick Notes are active and synchronized across Web &amp; APK.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onNavigate('diary')}
              className="px-3.5 py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-200 text-xs font-bold flex items-center gap-1.5"
            >
              <BookOpen className="w-3.5 h-3.5" />
              Open Protected Diary
            </button>
            <button
              type="button"
              onClick={() => onNavigate('quick_notes')}
              className="px-3.5 py-2 rounded-xl bg-violet-500/20 hover:bg-violet-500/30 border border-violet-500/40 text-violet-200 text-xs font-bold flex items-center gap-1.5"
            >
              <StickyNote className="w-3.5 h-3.5" />
              Staff Quick Notes
            </button>
            {onOpenStaffPortal && (
              <button
                type="button"
                onClick={onOpenStaffPortal}
                className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-xs font-semibold"
              >
                Session / Roles
              </button>
            )}
          </div>
        </div>
      )}

      {/* CORE MODULES INTERACTIVE GRID */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-hud font-bold text-base text-cyan-300 uppercase tracking-wider flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <span>Classroom Operating Modules</span>
          </h3>
          <span className="text-xs font-mono-code text-slate-400">
            {MODULE_CARDS.length} Functional Workspaces
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {MODULE_CARDS.map((card) => {
            const Icon = card.icon;
            const isLockedStaffCard = Boolean(card.staffOnly && !isStaffAuthorized);

            return (
              <div
                key={card.id}
                onClick={() => {
                  audioFX.playClick();
                  if (isLockedStaffCard) {
                    onOpenStaffPortal?.();
                  } else {
                    onNavigate(card.id);
                  }
                }}
                className={`p-5 rounded-2xl bg-gradient-to-br ${card.gradient} border ${
                  isLockedStaffCard ? 'border-amber-500/30 hover:border-amber-400' : card.accent
                } backdrop-blur-md shadow-lg cursor-pointer transition-all duration-200 group flex flex-col justify-between jarvis-panel-interactive`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className={`w-10 h-10 rounded-xl bg-black/40 border flex items-center justify-center group-hover:scale-110 transition shrink-0 ${
                      isLockedStaffCard ? 'border-amber-500/30 text-amber-400' : 'border-cyan-500/30 text-cyan-400'
                    }`}>
                      <Icon className="w-5 h-5" />
                    </div>

                    {card.badge && (
                      <span className={`px-2 py-0.5 rounded-full border text-[10px] font-mono-code font-bold flex items-center gap-1 ${
                        isLockedStaffCard
                          ? 'bg-amber-500/10 text-amber-300 border-amber-500/40'
                          : 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30'
                      }`}>
                        {isLockedStaffCard ? (
                          <>
                            <Lock className="w-2.5 h-2.5 text-amber-400" />
                            <span>Staff Login Required</span>
                          </>
                        ) : (
                          card.badge
                        )}
                      </span>
                    )}
                  </div>

                  <h4 className={`font-hud font-bold text-lg text-white transition ${
                    isLockedStaffCard ? 'group-hover:text-amber-200' : 'group-hover:text-cyan-200'
                  }`}>
                    {card.title}
                  </h4>

                  <p className="text-xs text-slate-400 font-sans mt-1.5 leading-relaxed">
                    {card.subtitle}
                  </p>
                </div>

                <div className={`mt-4 pt-3 border-t flex items-center justify-between text-xs font-hud font-bold ${
                  isLockedStaffCard
                    ? 'border-amber-500/20 text-amber-300 group-hover:text-amber-200'
                    : 'border-cyan-500/10 text-cyan-400 group-hover:text-cyan-300'
                }`}>
                  <span>{isLockedStaffCard ? 'SIGN IN TO ACCESS' : 'LAUNCH WORKSPACE'}</span>
                  {isLockedStaffCard ? (
                    <Lock className="w-4 h-4 text-amber-400 group-hover:scale-110 transition" />
                  ) : (
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Staff-only Quick Notes Floating Action Button (strictly mounted only for authorized staff) */}
      {isStaffAuthorized && <QuickNotesFAB onOpenFullModule={() => onNavigate('quick_notes')} />}
    </div>
  );
};
