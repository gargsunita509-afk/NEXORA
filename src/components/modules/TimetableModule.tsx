import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Clock,
  Filter,
  User,
  Shield,
  Layers,
  Lock,
  CalendarDays,
  Sparkles,
  Info,
  Printer,
  Download,
  CheckCircle,
} from 'lucide-react';
import { PrintableTimetable } from '../PrintableTimetable';
import { downloadTimetablePdf } from '../../utils/pdfGenerator';
import { DayOfWeek, Period, StreamType, TimetableSchedule, SubjectAllocation } from '../../types';
import {
  DAYS_OF_WEEK,
  OLD_DUAL_COLUMN_LECTURES,
  DualColumnLectureDef,
  TimetableVersion,
  getCurrentTimetable,
  getOldTimetable,
  getActiveTimetableVersion,
  setActiveTimetableVersion,
  subscribeTimetableVersion,
  getActiveClassInCharge,
} from '../../data/initialTimetable';
import {
  getCurrentAndNextPeriod,
  getTodayDayOfWeek,
  getLiveWeekday,
  isSunday,
  formatTime12h,
} from '../../utils/timetableHelper';
import { audioFX } from '../../services/audio';

const STREAMS: { id: StreamType | 'ALL'; label: string }[] = [
  { id: 'ALL', label: 'All Streams' },
  { id: 'PCM', label: 'PCM' },
  { id: 'PCB', label: 'PCB' },
  { id: 'HUMANITIES', label: 'Humanities' },
  { id: 'COMMERCE', label: 'Commerce' },
];

const STREAM_STYLES: Record<
  StreamType,
  { label: string; badgeBg: string; badgeText: string; border: string; glow: string }
> = {
  PCM: {
    label: 'PCM',
    badgeBg: 'bg-cyan-500/20',
    badgeText: 'text-cyan-300',
    border: 'border-cyan-500/30',
    glow: 'group-hover:border-cyan-400/60',
  },
  PCB: {
    label: 'PCB',
    badgeBg: 'bg-emerald-500/20',
    badgeText: 'text-emerald-300',
    border: 'border-emerald-500/30',
    glow: 'group-hover:border-emerald-400/60',
  },
  HUMANITIES: {
    label: 'Humanities',
    badgeBg: 'bg-purple-500/20',
    badgeText: 'text-purple-300',
    border: 'border-purple-500/30',
    glow: 'group-hover:border-purple-400/60',
  },
  COMMERCE: {
    label: 'Commerce',
    badgeBg: 'bg-amber-500/20',
    badgeText: 'text-amber-300',
    border: 'border-amber-500/30',
    glow: 'group-hover:border-amber-400/60',
  },
};

export const TimetableModule: React.FC = () => {
  const [timetableVersion, setTimetableVersionState] = useState<TimetableVersion>(() =>
    getActiveTimetableVersion()
  );
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>(() => getTodayDayOfWeek() || 'Monday');
  const [selectedStream, setSelectedStream] = useState<StreamType | 'ALL'>('ALL');
  const [currentTimeMinutes, setCurrentTimeMinutes] = useState<number>(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  });

  useEffect(() => {
    return subscribeTimetableVersion((v) => {
      setTimetableVersionState(v);
    });
  }, []);

  const handleSelectTimetableVersion = (version: TimetableVersion) => {
    audioFX.playClick();
    setActiveTimetableVersion(version);
    setTimetableVersionState(version);
  };

  const schedule: TimetableSchedule =
    timetableVersion === 'old' ? getOldTimetable() : getCurrentTimetable();
  const activeInCharge = getActiveClassInCharge(timetableVersion);

  const isSundayToday = isSunday(currentDate);
  const liveWeekday = getLiveWeekday(currentDate);
  const todayDayOfWeek = isSundayToday ? null : getTodayDayOfWeek(currentDate);

  // Sync current minute & date
  useEffect(() => {
    const updateMinute = () => {
      const now = new Date();
      setCurrentDate(now);
      setCurrentTimeMinutes(now.getHours() * 60 + now.getMinutes());
    };
    const interval = setInterval(updateMinute, 10000); // Check every 10s
    return () => clearInterval(interval);
  }, []);

  const currentDayPeriods = schedule[selectedDay] || [];
  const isViewingToday = !isSundayToday && selectedDay === todayDayOfWeek;
  const { current: activePeriod, next: upcomingPeriod } = isViewingToday
    ? getCurrentAndNextPeriod(currentDayPeriods, currentTimeMinutes)
    : { current: null, next: null };

  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [pdfSuccessMessage, setPdfSuccessMessage] = useState<string | null>(null);

  const handlePrintTimetable = () => {
    audioFX.playClick();
    window.print();
  };

  const handleDownloadPdf = async () => {
    audioFX.playClick();
    setIsExportingPdf(true);
    try {
      const res = await downloadTimetablePdf({ version: timetableVersion });
      const label = timetableVersion === 'old' ? 'Old Timetable' : 'Current Timetable';
      setPdfSuccessMessage(`${label} PDF downloaded successfully (${res.filename})`);
      setTimeout(() => setPdfSuccessMessage(null), 4000);
    } catch (err: any) {
      console.error('Failed to generate timetable PDF:', err);
      setPdfSuccessMessage(`PDF export error: ${err.message || 'Please try again'}`);
      setTimeout(() => setPdfSuccessMessage(null), 5000);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const renderStreamCard = (
    stream: StreamType,
    alloc: SubjectAllocation,
    isHighlighted: boolean,
    isStreamSelected: boolean,
    showTeacher = true
  ) => {
    const style = STREAM_STYLES[stream];
    const isFree = alloc.isFree || alloc.subject.toLowerCase().includes('free');
    const isUnassigned = alloc.unassigned;
    const hasTeacher = Boolean(
      showTeacher &&
      !isFree &&
      alloc.teacher &&
      alloc.teacher.trim() !== '' &&
      alloc.teacher !== '—' &&
      alloc.teacher !== 'Unconfirmed'
    );

    return (
      <div
        key={stream}
        className={`p-3 rounded-xl border text-left transition-all duration-200 relative overflow-hidden group ${
          isStreamSelected
            ? 'ring-2 ring-cyan-400 bg-cyan-950/40 border-cyan-400 shadow-[0_0_15px_rgba(0,240,255,0.25)]'
            : isFree
            ? 'bg-indigo-950/25 border-indigo-500/30 text-indigo-200'
            : isUnassigned
            ? 'bg-slate-900/30 border-slate-800 text-slate-500'
            : isHighlighted
            ? 'bg-[#091530]/80 border-cyan-500/30 hover:border-cyan-400/60 text-slate-200'
            : 'bg-slate-950/40 border-slate-800 text-slate-300'
        }`}
      >
        <div className="flex items-center justify-between text-[11px] font-mono-code font-bold uppercase mb-1.5">
          <span
            className={`px-2 py-0.5 rounded border text-[10px] ${style.badgeBg} ${style.badgeText} ${style.border}`}
          >
            {stream}
          </span>
          {isFree ? (
            <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 text-[10px]">
              FREE PERIOD
            </span>
          ) : isUnassigned ? (
            <span className="text-slate-500 text-[10px]">UNASSIGNED</span>
          ) : null}
        </div>

        <div className="font-hud font-bold text-sm text-white truncate" title={alloc.subject}>
          {alloc.subject}
        </div>

        {hasTeacher && (
          <div className="text-xs text-slate-400 flex items-center gap-1.5 mt-1 truncate">
            <User className="w-3 h-3 text-cyan-400/80 shrink-0" />
            <span
              className={
                alloc.teacher === activeInCharge
                  ? 'font-semibold text-cyan-300'
                  : 'text-slate-300'
              }
            >
              {alloc.teacher}
            </span>
          </div>
        )}
      </div>
    );
  };

  const renderDualColumnLecture = (period: Period, dualDef: DualColumnLectureDef) => {
    const isCurrent = activePeriod?.id === period.id;
    const isNext = upcomingPeriod?.id === period.id;
    const isFifthLecture = period.periodNumber === 5;

    const isCol1Active = dualDef.column1.dayRange.includes(selectedDay);
    const isCol2Active = dualDef.column2.dayRange.includes(selectedDay);

    return (
      <div
        key={period.id}
        className={`p-4 sm:p-5 rounded-2xl border transition-all duration-300 ${
          isCurrent
            ? 'bg-gradient-to-r from-cyan-950/60 via-blue-950/50 to-slate-950/90 border-cyan-400 shadow-[0_0_30px_rgba(0,240,255,0.25)]'
            : isNext
            ? 'bg-slate-950/70 border-cyan-500/35'
            : 'bg-slate-950/50 border-cyan-500/20 hover:border-cyan-500/40'
        }`}
      >
        {/* Header: Title, Timing & Two Day-Group Badge */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-cyan-500/15">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="px-2.5 py-1 rounded-lg bg-cyan-500/15 border border-cyan-400/40 text-cyan-300 font-hud text-xs font-bold">
              P{period.periodNumber}
            </span>
            <h3 className="font-hud font-bold text-base sm:text-lg text-white">
              {dualDef.title}
            </h3>

            <span className="px-2.5 py-0.5 rounded-full bg-blue-500/20 border border-blue-400/40 text-blue-300 text-[10px] font-mono-code font-bold uppercase">
              TWO DAY-GROUP MATRIX
            </span>

            {isCurrent && (
              <span className="px-2.5 py-0.5 rounded bg-cyan-400/20 text-cyan-300 border border-cyan-400/50 text-[10px] font-mono-code font-bold uppercase animate-pulse">
                CURRENT
              </span>
            )}
            {isNext && (
              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 text-[10px] font-mono-code uppercase">
                UPCOMING
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono-code text-cyan-400 font-bold bg-cyan-950/60 px-3 py-1 rounded-lg border border-cyan-500/30">
              {formatTime12h(dualDef.startTime)} – {formatTime12h(dualDef.endTime)}
            </span>
          </div>
        </div>

        {/* TWO SIDE-BY-SIDE DAY-GROUP COLUMNS */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
          {/* COLUMN 1 — MONDAY TO WEDNESDAY */}
          <div
            className={`p-4 rounded-xl border transition-all ${
              isCol1Active
                ? 'bg-[#06112a]/90 border-cyan-400/50 shadow-[0_0_20px_rgba(0,240,255,0.12)] ring-1 ring-cyan-500/30'
                : 'bg-slate-950/50 border-slate-800/80 opacity-90'
            }`}
          >
            {/* Column 1 Heading */}
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-cyan-500/15">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-cyan-400" />
                <div>
                  <h4 className="font-hud font-bold text-xs sm:text-sm text-cyan-300 tracking-wider uppercase">
                    COLUMN 1 — MONDAY TO WEDNESDAY
                  </h4>
                  <div className="text-[10px] font-mono-code text-slate-400">
                    Schedule for Mon, Tue, Wed
                  </div>
                </div>
              </div>

              {isCol1Active && (
                <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 text-[10px] font-mono-code font-bold shrink-0">
                  ACTIVE TODAY ({selectedDay.toUpperCase().slice(0, 3)})
                </span>
              )}
            </div>

            {/* Configurable Notice for Lecture 5 if any */}
            {!isFifthLecture && dualDef.column1.isConfigurableNotice && (
              <div className="mb-3 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-300/90 text-[11px] font-sans flex items-start gap-1.5 leading-tight">
                <Info className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                <span>{dualDef.column1.isConfigurableNotice}</span>
              </div>
            )}

            {/* Column 1 Entry: Single Common Entry for 5th Lecture or Stream Grid for 1st Lecture */}
            {isFifthLecture ? (
              <div className="p-4 rounded-xl bg-slate-900/60 border border-cyan-500/30 text-left">
                <div className="flex items-center justify-between mb-2">
                  <span className="px-2.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 text-[10px] font-mono-code font-bold uppercase">
                    COMMON SCHEDULED OPTION
                  </span>
                  <span className="text-xs font-mono-code text-cyan-400 font-semibold">
                    11:45 AM – 12:25 PM
                  </span>
                </div>
                <div className="font-hud font-bold text-base sm:text-lg text-white">
                  Physical Education (PE) &amp; AI
                </div>
                <div className="mt-2 text-xs text-slate-300 italic font-sans flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />
                  <span>Subjects chosen by students according to their individual choice.</span>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {(['PCM', 'PCB', 'HUMANITIES', 'COMMERCE'] as StreamType[]).map((st) => {
                  const alloc = dualDef.column1.allocations[st];
                  const isSelected = selectedStream === st;
                  return renderStreamCard(st, alloc, isCol1Active, isSelected, !isFifthLecture);
                })}
              </div>
            )}
          </div>

          {/* COLUMN 2 — THURSDAY TO SATURDAY */}
          <div
            className={`p-4 rounded-xl border transition-all ${
              isCol2Active
                ? 'bg-[#090e24]/90 border-indigo-400/50 shadow-[0_0_20px_rgba(99,102,241,0.12)] ring-1 ring-indigo-500/30'
                : 'bg-slate-950/50 border-slate-800/80 opacity-90'
            }`}
          >
            {/* Column 2 Heading */}
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-indigo-500/15">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-indigo-400" />
                <div>
                  <h4 className="font-hud font-bold text-xs sm:text-sm text-indigo-300 tracking-wider uppercase">
                    COLUMN 2 — THURSDAY TO SATURDAY
                  </h4>
                  <div className="text-[10px] font-mono-code text-slate-400">
                    Schedule for Thu, Fri, Sat
                  </div>
                </div>
              </div>

              {isCol2Active && (
                <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-400/40 text-[10px] font-mono-code font-bold shrink-0">
                  ACTIVE TODAY ({selectedDay.toUpperCase().slice(0, 3)})
                </span>
              )}
            </div>

            {/* Column 2 Entry: Single Common Entry for 5th Lecture or Stream Grid for 1st Lecture */}
            {isFifthLecture ? (
              <div className="p-4 rounded-xl bg-slate-900/60 border border-indigo-500/30 text-left">
                <div className="flex items-center justify-between mb-2">
                  <span className="px-2.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-400/40 text-[10px] font-mono-code font-bold uppercase">
                    COMMON SCHEDULED OPTION
                  </span>
                  <span className="text-xs font-mono-code text-indigo-300 font-semibold">
                    11:45 AM – 12:25 PM
                  </span>
                </div>
                <div className="font-hud font-bold text-base sm:text-lg text-white">
                  Fine Arts &amp; AI
                </div>
                <div className="mt-2 text-xs text-slate-300 italic font-sans flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                  <span>Subjects chosen by students according to their individual choice.</span>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {(['PCM', 'PCB', 'HUMANITIES', 'COMMERCE'] as StreamType[]).map((st) => {
                  const alloc = dualDef.column2.allocations[st];
                  const isSelected = selectedStream === st;
                  return renderStreamCard(st, alloc, isCol2Active, isSelected, !isFifthLecture);
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* On-Screen Interactive Timetable Workspace (Hidden during print) */}
      <div className="no-print print:hidden space-y-6 animate-in fade-in">
        {/* Module Title & Quick Summary Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 sm:p-6 rounded-2xl jarvis-panel border border-cyan-500/30">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 font-mono-code text-xs font-bold uppercase">
                MODULE 01
              </span>
              <span className="text-xs font-mono-code text-slate-400">CLASS 11TH SCHEDULE</span>
              <span className="px-2.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 font-mono-code text-xs flex items-center gap-1 font-semibold">
                <Lock className="w-3 h-3 text-emerald-400" />
                <span>PERMANENTLY READ-ONLY</span>
              </span>
              <span
                className={`px-2.5 py-0.5 rounded font-mono-code text-xs font-bold uppercase border ${
                  timetableVersion === 'current'
                    ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200'
                    : 'bg-amber-500/20 border-amber-400/50 text-amber-200'
                }`}
              >
                {timetableVersion === 'current' ? 'CURRENT TIMETABLE ACTIVE' : 'OLD TIMETABLE ACTIVE'}
              </span>
            </div>

            <h2 className="text-xl sm:text-2xl font-bold font-hud text-white mt-1">
              CLASS TIMETABLE & STREAM MATRIX
            </h2>

            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs sm:text-sm text-slate-300 font-sans mt-0.5">
              <span>Class In-Charge:</span>
              <strong className="text-cyan-300 text-sm font-semibold tracking-wide">
                {activeInCharge}
              </strong>
              <span className="text-slate-500 hidden sm:inline">•</span>
              <span className="text-slate-400">
                Live lecture tracking &amp; CBSE stream allocations
              </span>
            </div>

            {/* CURRENT TIMETABLE / OLD TIMETABLE Switcher */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <div
                role="group"
                aria-label="Timetable Version Selector"
                className="inline-flex items-center p-1 rounded-xl bg-slate-950/80 border border-cyan-500/30 gap-1"
              >
                <button
                  type="button"
                  onClick={() => handleSelectTimetableVersion('current')}
                  aria-pressed={timetableVersion === 'current'}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-hud font-bold tracking-wider uppercase transition cursor-pointer ${
                    timetableVersion === 'current'
                      ? 'bg-gradient-to-r from-cyan-500/30 to-blue-600/30 border border-cyan-400 text-cyan-200 shadow-[0_0_12px_rgba(0,240,255,0.25)]'
                      : 'text-slate-400 hover:text-cyan-200 border border-transparent'
                  }`}
                >
                  CURRENT TIMETABLE
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectTimetableVersion('old')}
                  aria-pressed={timetableVersion === 'old'}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-hud font-bold tracking-wider uppercase transition cursor-pointer ${
                    timetableVersion === 'old'
                      ? 'bg-gradient-to-r from-amber-500/30 to-orange-600/30 border border-amber-400 text-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.25)]'
                      : 'text-slate-400 hover:text-amber-200 border border-transparent'
                  }`}
                >
                  OLD TIMETABLE
                </button>
              </div>
              <span className="text-[11px] font-mono-code text-slate-400">
                {timetableVersion === 'current'
                  ? 'Viewing updated Class 11 schedule (Default)'
                  : 'Viewing preserved original Class 11 schedule'}
              </span>
            </div>
          </div>

          {/* Live Period Banner & Actions */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Print Timetable Button */}
            <button
              onClick={handlePrintTimetable}
              title="Print official 6-day Class 11 Timetable (Monday to Saturday)"
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-cyan-950/70 via-blue-950/70 to-slate-900 border border-cyan-400/50 hover:border-cyan-300 text-cyan-300 hover:text-white shadow-[0_0_15px_rgba(0,240,255,0.2)] hover:shadow-[0_0_20px_rgba(0,240,255,0.4)] transition cursor-pointer text-xs font-hud font-bold tracking-wider uppercase active:scale-[0.98]"
              aria-label="Print Timetable"
            >
              <Printer className="w-4 h-4 text-cyan-400" />
              <span>PRINT TIMETABLE</span>
            </button>

            {/* Download PDF Button */}
            <button
              onClick={handleDownloadPdf}
              disabled={isExportingPdf}
              title="Download official 1-page A4 landscape Timetable PDF (Monday to Saturday)"
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-950/70 via-teal-950/70 to-slate-900 border border-emerald-400/50 hover:border-emerald-300 text-emerald-300 hover:text-white shadow-[0_0_15px_rgba(16,185,129,0.2)] hover:shadow-[0_0_20px_rgba(16,185,129,0.4)] transition cursor-pointer text-xs font-hud font-bold tracking-wider uppercase active:scale-[0.98] disabled:opacity-50"
              aria-label="Download Timetable PDF"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              <span>{isExportingPdf ? 'GENERATING PDF...' : 'DOWNLOAD PDF'}</span>
            </button>

            {isSundayToday ? (
              <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-500/15 border border-amber-400/40 text-amber-300">
                <CalendarDays className="w-4 h-4 text-amber-400 shrink-0" />
                <div>
                  <div className="text-[10px] font-mono-code text-amber-400 font-bold uppercase">
                    SUNDAY STATUS • OFF DAY
                  </div>
                  <div className="text-xs font-bold text-white font-hud">
                    Sunday — No Regular School Timetable
                  </div>
                </div>
              </div>
            ) : activePeriod ? (
              <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-cyan-500/10 border border-cyan-400/40 shadow-[0_0_15px_rgba(0,240,255,0.2)]">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
                <div>
                  <div className="text-[10px] font-mono-code text-cyan-400 font-bold uppercase">
                    NOW ACTIVE ({formatTime12h(activePeriod.startTime)} - {formatTime12h(activePeriod.endTime)})
                  </div>
                  <div className="text-xs font-bold text-white font-hud">
                    {activePeriod.title}
                  </div>
                </div>
              </div>
            ) : (
              <div className="px-3.5 py-2 rounded-xl bg-slate-900/60 border border-slate-700 text-xs font-mono-code text-slate-400">
                No lecture currently in session
              </div>
            )}

            {!isSundayToday && upcomingPeriod && (
              <div className="hidden lg:flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900/80 border border-cyan-500/20 text-xs font-mono-code text-slate-300">
                <span className="text-cyan-400 font-bold">NEXT:</span>
                <span>
                  {upcomingPeriod.title} ({formatTime12h(upcomingPeriod.startTime)})
                </span>
              </div>
            )}
          </div>
        </div>

        {/* PDF Download Notice */}
        {pdfSuccessMessage && (
          <div className="p-3 rounded-xl border border-emerald-400/50 bg-emerald-950/40 text-emerald-300 flex items-center justify-between gap-2.5 text-xs font-mono-code animate-in fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{pdfSuccessMessage}</span>
            </div>
            <button
              onClick={() => setPdfSuccessMessage(null)}
              className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-200 hover:text-white text-[10px] font-bold"
            >
              DISMISS
            </button>
          </div>
        )}

        {/* Sunday Informative Banner */}
        {isSundayToday && (
          <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-950/20 text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
            <div className="flex items-center gap-2.5">
              <CalendarDays className="w-4 h-4 text-amber-400 shrink-0" />
              <div>
                <span className="font-bold text-amber-300 font-hud text-sm">
                  Sunday — No Regular School Timetable
                </span>
                <span className="text-slate-300 ml-2">
                  School campus is closed on Sundays. Showing <strong>{selectedDay}</strong>'s schedule for preview.
                </span>
              </div>
            </div>
            <span className="text-[11px] font-mono-code text-amber-400/90 uppercase font-semibold">
              Monday–Saturday Timetable Accessible
            </span>
          </div>
        )}

        {/* Weekday Tabs & Stream Selector */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Monday - Saturday Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {DAYS_OF_WEEK.map((day) => {
              const isSelected = selectedDay === day;
              const isToday = !isSundayToday && todayDayOfWeek === day;
              return (
                <button
                  key={day}
                  onClick={() => {
                    audioFX.playClick();
                    setSelectedDay(day);
                  }}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-hud font-bold whitespace-nowrap transition-all ${
                    isSelected
                      ? 'bg-gradient-to-r from-cyan-900/70 to-blue-900/70 border border-cyan-400 text-cyan-200 shadow-[0_0_15px_rgba(0,240,255,0.25)]'
                      : 'bg-slate-950/60 border border-cyan-500/20 text-slate-400 hover:text-cyan-300 hover:border-cyan-500/40'
                  }`}
                >
                  <span>{day}</span>
                  {isToday && (
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                  )}
                </button>
              );
            })}
          </div>

        {/* Stream Filter Switcher */}
        <div className="flex items-center gap-1 bg-slate-950/70 border border-cyan-500/20 rounded-xl p-1 overflow-x-auto">
          <Filter className="w-3.5 h-3.5 text-cyan-400 ml-2 mr-1 shrink-0" />
          {STREAMS.map((s) => {
            const isSel = selectedStream === s.id;
            return (
              <button
                key={s.id}
                onClick={() => {
                  audioFX.playClick();
                  setSelectedStream(s.id);
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono-code font-medium whitespace-nowrap transition ${
                  isSel
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Schedule Display */}
      <div className="space-y-4">
        {currentDayPeriods.map((period) => {
          const isCurrent = activePeriod?.id === period.id;
          const isNext = upcomingPeriod?.id === period.id;

          // SPECIAL DUAL-COLUMN LAYOUT FOR OLD TIMETABLE: FIRST LECTURE (P1) AND FIFTH LECTURE (P5)
          if (timetableVersion === 'old' && (period.periodNumber === 1 || period.periodNumber === 5)) {
            const dualDef = OLD_DUAL_COLUMN_LECTURES[period.periodNumber];
            if (dualDef) {
              return renderDualColumnLecture(period, dualDef);
            }
          }

          // Morning Routine Cards (School Entry Time & Morning Prayer)
          if (period.isMorningRoutine || (period.periodNumber < 0 && !period.isBreak && !period.isAfterSchool)) {
            const isEntry = period.title.toLowerCase().includes('entry');
            return (
              <div
                key={period.id}
                className={`p-4 sm:p-5 rounded-2xl border transition-all ${
                  isCurrent
                    ? 'bg-gradient-to-r from-cyan-950/40 via-blue-950/30 to-slate-950/80 border-cyan-400 shadow-[0_0_25px_rgba(0,240,255,0.25)]'
                    : isNext
                    ? 'bg-slate-950/60 border-cyan-500/30'
                    : 'bg-slate-950/40 border-cyan-500/15 hover:border-cyan-500/30'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-cyan-500/20">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="px-2.5 py-1 rounded bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 font-mono-code text-xs font-bold uppercase tracking-wider">
                      {isEntry ? 'CAMPUS ARRIVAL' : 'MORNING ASSEMBLY'}
                    </span>
                    <h3 className="font-hud font-bold text-base sm:text-lg text-white">
                      {period.title}
                    </h3>
                    {isCurrent && (
                      <span className="px-2 py-0.5 rounded bg-cyan-400/20 text-cyan-300 border border-cyan-400/40 text-[10px] font-mono-code font-bold uppercase animate-pulse">
                        CURRENTLY ACTIVE
                      </span>
                    )}
                    {isNext && (
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 text-[10px] font-mono-code uppercase">
                        UPCOMING
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-mono-code text-cyan-300 font-semibold bg-cyan-950/50 px-3 py-1 rounded-lg border border-cyan-400/30">
                      {formatTime12h(period.startTime)} – {formatTime12h(period.endTime)}
                    </span>
                  </div>
                </div>

                <div className="mt-3 text-xs text-slate-300 font-sans leading-relaxed flex items-start gap-2.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 mt-1 shrink-0 shadow-[0_0_8px_rgba(0,240,255,0.5)]" />
                  <div>
                    <div className="font-hud font-bold text-cyan-300 uppercase tracking-wide text-xs">
                      {isEntry ? 'Student Arrival & Campus Entry' : 'Morning Assembly & School Prayer'}
                    </div>
                    <p className="text-slate-300 mt-0.5 leading-relaxed">
                      {period.description || period.notes}
                    </p>
                  </div>
                </div>
              </div>
            );
          }

          // Break style (Fruit Break or Lunch)
          if (period.isBreak) {
            return (
              <div
                key={period.id}
                className={`p-3.5 sm:p-4 rounded-xl border flex items-center justify-between gap-4 transition-all ${
                  isCurrent
                    ? 'bg-amber-950/30 border-amber-400/60 shadow-[0_0_20px_rgba(245,158,11,0.25)]'
                    : 'bg-slate-950/40 border-amber-500/20'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/30">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-hud font-bold text-amber-300 text-sm sm:text-base">
                        {period.title.toUpperCase()}
                      </span>
                      {isCurrent && (
                        <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-mono-code font-bold uppercase animate-pulse">
                          ACTIVE BREAK
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 font-mono-code">
                      {formatTime12h(period.startTime)} — {formatTime12h(period.endTime)}
                    </div>
                  </div>
                </div>

                <div className="text-xs font-mono-code text-amber-400/80 bg-amber-950/40 px-3 py-1 rounded-lg border border-amber-500/20">
                  Classroom Recess
                </div>
              </div>
            );
          }

          // After-School Waiting Period Card (1:05 PM to 2:00 PM)
          if (period.isAfterSchool) {
            return (
              <div
                key={period.id}
                className={`p-4 sm:p-5 rounded-2xl border transition-all ${
                  isCurrent
                    ? 'bg-gradient-to-r from-emerald-950/40 via-teal-950/30 to-slate-950/80 border-emerald-400 shadow-[0_0_25px_rgba(16,185,129,0.25)]'
                    : isNext
                    ? 'bg-slate-950/60 border-indigo-500/40'
                    : 'bg-slate-950/40 border-indigo-500/25 hover:border-indigo-500/50'
                }`}
              >
                {/* Header: Title & Timing */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-indigo-500/20">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="px-2.5 py-1 rounded bg-indigo-500/20 border border-indigo-400/40 text-indigo-300 font-mono-code text-xs font-bold uppercase tracking-wider">
                      AFTER-SCHOOL WAITING PERIOD
                    </span>
                    <h3 className="font-hud font-bold text-base sm:text-lg text-white">
                      {period.title}
                    </h3>
                    {isCurrent && (
                      <span className="px-2 py-0.5 rounded bg-emerald-400/20 text-emerald-300 border border-emerald-400/40 text-[10px] font-mono-code font-bold uppercase animate-pulse">
                        CURRENTLY ACTIVE
                      </span>
                    )}
                    {isNext && (
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 text-[10px] font-mono-code uppercase">
                        NEXT
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-mono-code text-indigo-300 font-semibold bg-indigo-950/50 px-3 py-1 rounded-lg border border-indigo-400/30">
                      1:05 PM – 2:00 PM
                    </span>
                  </div>
                </div>

                {/* Details Grid */}
                <div className="mt-3.5 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 flex items-start gap-2.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 mt-1 shrink-0 shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
                    <div>
                      <div className="font-hud font-bold text-emerald-300 uppercase tracking-wide text-xs">
                        All Regular Classes Finished
                      </div>
                      <p className="text-slate-300 mt-1 leading-relaxed">
                        Regular academic instruction concludes at <strong>1:05 PM</strong> (after 6th Lecture).
                      </p>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 flex items-start gap-2.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-indigo-400 mt-1 shrink-0 shadow-[0_0_8px_rgba(129,140,248,0.5)]" />
                    <div>
                      <div className="font-hud font-bold text-indigo-300 uppercase tracking-wide text-xs">
                        Dispersal &amp; Supervised Waiting
                      </div>
                      <p className="text-slate-300 mt-1 leading-relaxed">
                        Students are free from classes and may wait for their school bus/van, siblings, or parents until departure (Waiting period extends to <strong>2:00 PM</strong>).
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-2.5 text-[11px] text-slate-400 font-mono-code">
                  Note: Supervised waiting window. Not an academic lecture. All regular teaching concludes at 1:05 PM.
                </div>
              </div>
            );
          }

          // Regular Lecture Period Card (Zero, Second, Third, Fourth, Sixth)
          return (
            <div
              key={period.id}
              className={`p-4 rounded-xl border transition-all ${
                isCurrent
                  ? 'bg-gradient-to-r from-cyan-950/50 via-blue-950/40 to-slate-950/80 border-cyan-400 shadow-[0_0_25px_rgba(0,240,255,0.2)]'
                  : isNext
                  ? 'bg-slate-950/60 border-cyan-500/30'
                  : 'bg-slate-950/40 border-cyan-500/10 hover:border-cyan-500/30'
              }`}
            >
              {/* Header: Period Title & Time */}
              <div className="flex items-center justify-between gap-3 pb-3 border-b border-cyan-500/10">
                <div className="flex items-center gap-2.5">
                  <span className="px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 font-hud text-xs font-bold">
                    {period.periodNumber === 0 ? 'ZERO' : `P${period.periodNumber}`}
                  </span>
                  <h3 className="font-hud font-bold text-sm sm:text-base text-white">
                    {period.title}
                  </h3>
                  {isCurrent && (
                    <span className="px-2 py-0.5 rounded bg-cyan-400/20 text-cyan-300 border border-cyan-400/40 text-[10px] font-mono-code font-bold uppercase animate-pulse">
                      CURRENT
                    </span>
                  )}
                  {isNext && (
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 text-[10px] font-mono-code uppercase">
                      UPCOMING
                    </span>
                  )}
                </div>

                <div>
                  <span className="text-xs font-mono-code text-cyan-400 font-semibold bg-cyan-950/40 px-2.5 py-1 rounded-lg border border-cyan-500/20">
                    {formatTime12h(period.startTime)} – {formatTime12h(period.endTime)}
                  </span>
                </div>
              </div>

              {/* Stream Allocations Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 mt-3">
                {(['PCM', 'PCB', 'COMMERCE', 'HUMANITIES'] as StreamType[]).map((st) => {
                  if (selectedStream !== 'ALL' && selectedStream !== st) {
                    return null;
                  }
                  const alloc: SubjectAllocation = period.allocations[st];
                  const isUnassigned = alloc.unassigned;
                  const isFree = alloc.isFree || alloc.subject.toLowerCase() === 'free';
                  const showTeacher =
                    !isFree &&
                    Boolean(
                      alloc.teacher &&
                        alloc.teacher.trim() !== '' &&
                        alloc.teacher !== '—' &&
                        alloc.teacher !== 'Unconfirmed'
                    );

                  // Weekday variation hint for Current Timetable
                  let weekdayVariationNote: string | null = null;
                  if (timetableVersion === 'current') {
                    if (period.periodNumber === 3 && st === 'HUMANITIES') {
                      weekdayVariationNote = 'Mon–Wed: Political Science • Thu–Sat: History';
                    } else if (period.periodNumber === 5 && (st === 'PCM' || st === 'PCB')) {
                      weekdayVariationNote = 'Mon–Wed: Physics • Thu–Sat: Chemistry';
                    } else if (period.periodNumber === 6) {
                      weekdayVariationNote = 'Mon–Wed: Physical Education • Thu–Sat: Fine Arts';
                    }
                  }

                  return (
                    <div
                      key={st}
                      className={`p-3 rounded-lg border text-left transition ${
                        isUnassigned
                          ? 'bg-slate-900/30 border-slate-800 text-slate-500'
                          : isFree
                          ? 'bg-indigo-950/20 border-indigo-500/30 text-indigo-300'
                          : 'bg-cyan-950/20 border-cyan-500/20 text-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[10px] font-mono-code font-bold uppercase mb-1">
                        <span className="text-cyan-400">{st}</span>
                        {isFree && <span className="text-indigo-400">FREE</span>}
                        {isUnassigned && <span className="text-slate-500">UNASSIGNED</span>}
                        {!isFree && weekdayVariationNote && (
                          <span className="text-[9px] text-cyan-300/80 font-mono-code">
                            {selectedDay === 'Monday' || selectedDay === 'Tuesday' || selectedDay === 'Wednesday'
                              ? 'MON–WED'
                              : 'THU–SAT'}
                          </span>
                        )}
                      </div>

                      <div className="font-hud font-bold text-sm text-white truncate">
                        {isFree ? 'Free' : alloc.subject}
                      </div>

                      {showTeacher && (
                        <div className="text-xs text-slate-400 flex items-center gap-1 mt-1 truncate">
                          <User className="w-3 h-3 text-cyan-400/80 shrink-0" />
                          <span
                            className={
                              alloc.teacher === activeInCharge
                                ? 'font-semibold text-cyan-300'
                                : 'text-slate-300'
                            }
                          >
                            {alloc.teacher}
                          </span>
                        </div>
                      )}

                      {weekdayVariationNote && (
                        <div className="text-[10px] text-slate-400 font-mono-code mt-1 truncate" title={weekdayVariationNote}>
                          {weekdayVariationNote}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Schedule Footnote / Disclaimer (On-Screen Only) */}
      <div className="p-3 rounded-xl border border-cyan-500/15 bg-slate-950/40 text-center">
        <p className="text-xs text-slate-400 font-sans leading-relaxed">
          <span className="text-slate-300 font-medium">Note:</span> This timetable is for regular school days. In case of any school function, special event, or other activities, the timetable may vary for that day or for a few days.
        </p>
      </div>
    </div>

    {/* Dedicated Printable 6-Day Timetable Matrix (Hidden on Screen, Active on Print) */}
    <PrintableTimetable version={timetableVersion} />
  </>
);
};
