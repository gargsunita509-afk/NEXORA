import React, { useState, useRef } from 'react';
import {
  Trophy,
  Crown,
  Medal,
  Award,
  Zap,
  CheckCircle,
  Clock,
  Layers,
  Filter,
  Calendar,
  BookOpen,
  Download,
  Upload,
  RefreshCw,
  HardDrive,
  Wifi,
  WifiOff,
  AlertTriangle,
  Info,
  User,
  Sparkles,
  Play,
  Users,
} from 'lucide-react';
import {
  Quiz,
  QuizAttempt,
  Student,
  StreamType,
  LeaderboardFilterPreferences,
  LeaderboardViewScope,
  LeaderboardTimePeriod,
  LeaderboardEntry,
  StoragePersistenceStatus,
  QuizBadge,
} from '../../types';
import { computeLeaderboard } from '../../utils/leaderboardEngine';
import { audioFX } from '../../services/audio';

interface QuizLeaderboardPanelProps {
  students: Student[];
  quizzes: Quiz[];
  attempts: QuizAttempt[];
  activeStudent: Student | null;
  filters: LeaderboardFilterPreferences;
  persistenceStatus: StoragePersistenceStatus | null;
  badgesCatalog: QuizBadge[];
  onUpdateFilters: (partial: Partial<LeaderboardFilterPreferences>) => void;
  onSyncNow: () => Promise<void>;
  onExportBackup: () => Promise<void>;
  onImportBackup: (fileText: string) => Promise<{
    success: boolean;
    message: string;
  }>;
  onSwitchToQuizzesTab: () => void;
  onSelectStudent?: (studentName: string) => void;
}

const STREAM_BADGE_STYLES: Record<
  StreamType,
  { badge: string; border: string; avatarBg: string; text: string }
> = {
  PCM: {
    badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-400/40',
    border: 'border-cyan-500/40',
    avatarBg: 'from-cyan-500/30 to-blue-600/30 border-cyan-400/50 text-cyan-200',
    text: 'text-cyan-300',
  },
  PCB: {
    badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40',
    border: 'border-emerald-500/40',
    avatarBg: 'from-emerald-500/30 to-teal-600/30 border-emerald-400/50 text-emerald-200',
    text: 'text-emerald-300',
  },
  COMMERCE: {
    badge: 'bg-amber-500/20 text-amber-300 border-amber-400/40',
    border: 'border-amber-500/40',
    avatarBg: 'from-amber-500/30 to-orange-600/30 border-amber-400/50 text-amber-200',
    text: 'text-amber-300',
  },
  HUMANITIES: {
    badge: 'bg-purple-500/20 text-purple-300 border-purple-400/40',
    border: 'border-purple-500/40',
    avatarBg: 'from-purple-500/30 to-fuchsia-600/30 border-purple-400/50 text-purple-200',
    text: 'text-purple-300',
  },
};

function getInitials(name: string): string {
  const clean = name.replace(/\s*\/\s*/g, ' ').trim();
  const parts = clean.split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase();
}

export const QuizLeaderboardPanel: React.FC<QuizLeaderboardPanelProps> = ({
  students,
  quizzes,
  attempts,
  activeStudent,
  filters,
  persistenceStatus,
  badgesCatalog,
  onUpdateFilters,
  onSyncNow,
  onExportBackup,
  onImportBackup,
  onSwitchToQuizzesTab,
  onSelectStudent,
}) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [showScoringInfo, setShowScoringInfo] = useState(false);
  const [backupFeedback, setBackupFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const publishedQuizzes = quizzes.filter((q) => !q.isDraft);

  // Compute Leaderboard dynamically from persisted records and current filters
  const leaderboardResult = computeLeaderboard({
    students,
    attempts,
    quizzes: publishedQuizzes,
    filters,
  });

  const {
    rankedEntries,
    unattemptedEntries,
    totalValidAttempts,
    uniqueQuizzesCount,
    DuplicateAttemptsIgnored,
    scoringFormulaSummary,
  } = leaderboardResult;

  // Find current active student's entry in the computed leaderboard
  const currentStudentEntry: LeaderboardEntry | null = activeStudent
    ? leaderboardResult.allEntries.find((e) => e.studentId === activeStudent.id) || null
    : null;

  // Top 3 podium entries (entries with rank 1, 2, or 3, up to 3 cards)
  const podiumEntries = rankedEntries.slice(0, 3);

  const handleScopeChange = (newScope: LeaderboardViewScope) => {
    audioFX.playClick();
    if (newScope === 'overall' || newScope === 'class') {
      onUpdateFilters({
        scope: newScope,
        streamFilter: 'ALL',
        selectedQuizId: 'ALL',
        showUnattemptedStudents: newScope === 'class' ? true : filters.showUnattemptedStudents,
      });
    } else if (newScope === 'stream') {
      const defaultStream: StreamType =
        filters.streamFilter !== 'ALL'
          ? filters.streamFilter
          : activeStudent?.stream || 'PCM';
      onUpdateFilters({
        scope: 'stream',
        streamFilter: defaultStream,
        selectedQuizId: 'ALL',
      });
    } else if (newScope === 'quiz') {
      const defaultQuizId =
        filters.selectedQuizId !== 'ALL'
          ? filters.selectedQuizId
          : publishedQuizzes[0]?.id || 'ALL';
      onUpdateFilters({
        scope: 'quiz',
        selectedQuizId: defaultQuizId,
      });
    }
  };

  const handleStreamSelect = (stream: StreamType | 'ALL') => {
    audioFX.playClick();
    onUpdateFilters({
      scope: stream === 'ALL' ? (filters.scope === 'stream' ? 'class' : filters.scope) : 'stream',
      streamFilter: stream,
    });
  };

  const handleQuizSelect = (quizId: string) => {
    audioFX.playClick();
    onUpdateFilters({
      scope: quizId === 'ALL' ? 'overall' : 'quiz',
      selectedQuizId: quizId,
    });
  };

  const handleTimePeriodChange = (period: LeaderboardTimePeriod) => {
    audioFX.playClick();
    onUpdateFilters({ timePeriod: period });
  };

  const handleTriggerSync = async () => {
    audioFX.playClick();
    setIsSyncing(true);
    try {
      await onSyncNow();
    } finally {
      setIsSyncing(false);
    }
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const res = await onImportBackup(text);
      setBackupFeedback({
        type: res.success ? 'success' : 'error',
        message: res.message,
      });
      if (res.success) {
        audioFX.playSuccess();
      } else {
        audioFX.playError();
      }
    } catch (err: any) {
      setBackupFeedback({
        type: 'error',
        message: err?.message || 'Failed to read backup file.',
      });
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const selectedQuizObj =
    filters.selectedQuizId !== 'ALL'
      ? publishedQuizzes.find((q) => q.id === filters.selectedQuizId)
      : null;

  return (
    <div className="space-y-5 animate-in fade-in">
      {/* 1. LOCAL PERSISTENCE & DATA STATUS BAR */}
      <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-950/90 border border-cyan-500/30 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Device Storage Status Pill */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-950/50 border border-emerald-500/40 text-emerald-300 text-xs font-mono-code font-bold">
            <HardDrive className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Saved on this device</span>
            <span className="text-[10px] text-emerald-400/80">
              (IndexedDB v{persistenceStatus?.schemaVersion || 2} •{' '}
              {persistenceStatus?.savedAttemptsCount ?? attempts.length} attempts)
            </span>
          </div>

          {/* Online / Offline Status Pill */}
          {persistenceStatus && !persistenceStatus.isOnline ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-950/60 border border-amber-500/40 text-amber-300 text-xs font-mono-code font-bold">
              <WifiOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Offline — showing saved results</span>
            </div>
          ) : persistenceStatus && persistenceStatus.pendingSyncCount > 0 ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-950/60 border border-cyan-500/40 text-cyan-300 text-xs font-mono-code">
              <RefreshCw className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span>Sync pending ({persistenceStatus.pendingSyncCount})</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-300 text-xs font-mono-code">
              <Wifi className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span>
                {persistenceStatus?.lastSyncedAt
                  ? `Last synced: ${new Date(persistenceStatus.lastSyncedAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}`
                  : 'Local DB active'}
              </span>
            </div>
          )}

          {persistenceStatus?.storageWarning && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-950/40 border border-amber-500/40 text-amber-200 text-[11px] font-mono-code">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>{persistenceStatus.storageWarning}</span>
            </div>
          )}
        </div>

        {/* Recovery & Sync Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => {
              audioFX.playClick();
              setShowScoringInfo((prev) => !prev);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-cyan-500/30 text-cyan-300 text-xs font-hud font-bold transition cursor-pointer"
          >
            <Info className="w-3.5 h-3.5 text-cyan-400" />
            <span>SCORING RULES</span>
          </button>

          <button
            type="button"
            onClick={handleTriggerSync}
            disabled={isSyncing || Boolean(persistenceStatus && !persistenceStatus.isOnline)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-950/50 hover:bg-cyan-900/60 border border-cyan-500/40 text-cyan-200 text-xs font-hud font-bold transition disabled:opacity-40 cursor-pointer"
            title="Synchronize local attempts with classroom server"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-cyan-300' : 'text-cyan-400'}`} />
            <span>{isSyncing ? 'SYNCING...' : 'SYNC NOW'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              audioFX.playClick();
              onExportBackup();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-950/40 hover:bg-purple-900/50 border border-purple-500/40 text-purple-200 text-xs font-hud font-bold transition cursor-pointer"
            title="Export Leaderboard & Quiz Attempts Backup (JSON)"
          >
            <Download className="w-3.5 h-3.5 text-purple-400" />
            <span>EXPORT BACKUP</span>
          </button>

          <button
            type="button"
            onClick={() => {
              audioFX.playClick();
              fileInputRef.current?.click();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-hud font-bold transition cursor-pointer"
            title="Restore Leaderboard Backup from JSON"
          >
            <Upload className="w-3.5 h-3.5 text-cyan-400" />
            <span>RESTORE JSON</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleFileImport}
            className="hidden"
          />
        </div>
      </div>

      {/* Backup Import/Export Notification */}
      {backupFeedback && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-mono-code flex items-center justify-between gap-2 ${
            backupFeedback.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
              : 'bg-red-950/40 border-red-500/40 text-red-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {backupFeedback.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            )}
            <span>{backupFeedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setBackupFeedback(null)}
            className="text-slate-400 hover:text-white px-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Scoring Formula & Anti-Duplication Explanation Panel */}
      {showScoringInfo && (
        <div className="p-4 rounded-2xl bg-cyan-950/30 border border-cyan-500/40 space-y-2 text-xs font-sans text-slate-200 animate-in fade-in">
          <div className="flex items-center justify-between">
            <h4 className="font-hud font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-2">
              <Award className="w-4 h-4 text-cyan-400" />
              <span>Verified Leaderboard Scoring & Fair Tie-Breaking Rules</span>
            </h4>
            <button
              type="button"
              onClick={() => setShowScoringInfo(false)}
              className="text-slate-400 hover:text-white text-xs font-mono-code"
            >
              HIDE
            </button>
          </div>
          <p className="text-slate-300 leading-relaxed">{scoringFormulaSummary}</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-1 font-mono-code text-[11px]">
            <div className="p-2.5 rounded-xl bg-slate-950/80 border border-cyan-500/20">
              <strong className="text-cyan-300 block mb-0.5">1. Answer-Key Verification</strong>
              Every attempt is validated against the actual MCQ option IDs. Only completed attempts earn points (assigned or opened quizzes award 0 pts).
            </div>
            <div className="p-2.5 rounded-xl bg-slate-950/80 border border-purple-500/20">
              <strong className="text-purple-300 block mb-0.5">2. Duplicate Prevention</strong>
              Each unique (Student, Quiz) pair counts once toward cumulative totals using the best verified attempt. Repeat submissions never double-count.
            </div>
            <div className="p-2.5 rounded-xl bg-slate-950/80 border border-emerald-500/20">
              <strong className="text-emerald-300 block mb-0.5">3. Fair Tie-Breakers</strong>
              Total Points → Average % → Correct Answers → Completed Quizzes → Fastest Time. Identical performance earns a shared rank.
            </div>
          </div>
        </div>
      )}

      {/* 2. LEADERBOARD FILTERS BAR */}
      <div className="p-4 sm:p-5 rounded-2xl jarvis-panel border border-cyan-500/30 space-y-4">
        {/* Top Row: Leaderboard Mode Tabs & Time Period Toggle */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-cyan-500/15">
          {/* 4 Primary Leaderboard Modes */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-hud font-bold text-cyan-300 uppercase tracking-wider mr-1 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5 text-cyan-400" />
              <span>View:</span>
            </span>
            {(
              [
                { id: 'overall', label: 'OVERALL LEADERBOARD' },
                { id: 'class', label: 'CLASS 11 LEADERBOARD' },
                { id: 'stream', label: 'STREAM LEADERBOARD' },
                { id: 'quiz', label: 'QUIZ LEADERBOARD' },
              ] as const
            ).map((tab) => {
              const active = filters.scope === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleScopeChange(tab.id)}
                  className={`px-3 py-1.5 rounded-xl font-hud text-xs font-bold border transition cursor-pointer ${
                    active
                      ? 'bg-cyan-500 text-black border-cyan-300 shadow-[0_0_12px_rgba(0,240,255,0.35)]'
                      : 'bg-slate-900/90 border-slate-700 text-slate-300 hover:text-white hover:border-cyan-500/40'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Time Period Filter: All Time vs Weekly */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono-code text-slate-400 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-purple-400" />
              <span>Period:</span>
            </span>
            <div className="flex items-center p-1 rounded-xl bg-slate-950 border border-purple-500/30">
              <button
                type="button"
                onClick={() => handleTimePeriodChange('all_time')}
                className={`px-3 py-1 rounded-lg font-hud text-xs font-bold transition cursor-pointer ${
                  filters.timePeriod === 'all_time'
                    ? 'bg-purple-500 text-white shadow-[0_0_10px_rgba(168,85,247,0.4)]'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                ALL TIME
              </button>
              <button
                type="button"
                onClick={() => handleTimePeriodChange('weekly')}
                className={`px-3 py-1 rounded-lg font-hud text-xs font-bold transition cursor-pointer ${
                  filters.timePeriod === 'weekly'
                    ? 'bg-purple-500 text-white shadow-[0_0_10px_rgba(168,85,247,0.4)]'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                WEEKLY (7D)
              </button>
            </div>
          </div>
        </div>

        {/* Second Row: Stream Filter Pills & Specific Quiz Selector */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
          {/* Stream Filter Pills */}
          <div className="lg:col-span-7 flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-mono-code text-slate-400 mr-1 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              <span>Stream:</span>
            </span>
            {(['ALL', 'PCM', 'PCB', 'COMMERCE', 'HUMANITIES'] as const).map((st) => {
              const isSelected = filters.streamFilter === st;
              const count =
                st === 'ALL'
                  ? students.length
                  : students.filter((s) => s.stream === st).length;
              return (
                <button
                  key={st}
                  type="button"
                  onClick={() => handleStreamSelect(st)}
                  className={`px-3 py-1 rounded-xl font-hud text-xs font-bold border transition cursor-pointer ${
                    isSelected
                      ? 'bg-cyan-500/25 text-cyan-200 border-cyan-400 shadow-[0_0_10px_rgba(0,240,255,0.25)]'
                      : 'bg-slate-950/80 border-slate-800 text-slate-400 hover:text-white hover:border-cyan-500/30'
                  }`}
                >
                  {st === 'ALL' ? `ALL STREAMS (${count})` : `${st} (${count})`}
                </button>
              );
            })}
          </div>

          {/* Quiz Selector Dropdown */}
          <div className="lg:col-span-5 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-cyan-400 shrink-0" />
            <select
              aria-label="Filter Leaderboard by Quiz"
              value={filters.selectedQuizId}
              onChange={(e) => handleQuizSelect(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-cyan-500/40 text-white font-hud text-xs outline-none focus:border-cyan-400"
            >
              <option value="ALL">All Completed Quizzes (Cumulative Ranking)</option>
              {publishedQuizzes.map((q) => (
                <option key={q.id} value={q.id}>
                  [{q.stream || 'ALL'} • {q.subject}] {q.title} ({q.questions.length} Qs)
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Summary Metrics & Show Unattempted Toggle */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80 text-[11px] font-mono-code text-slate-400">
          <div className="flex items-center gap-3 flex-wrap">
            <span>
              Ranked Scholars: <strong className="text-cyan-300">{rankedEntries.length}</strong> /{' '}
              {rankedEntries.length + unattemptedEntries.length} eligible
            </span>
            <span>•</span>
            <span>
              Valid Attempts: <strong className="text-emerald-300">{totalValidAttempts}</strong>
            </span>
            <span>•</span>
            <span>
              Quizzes Represented: <strong className="text-purple-300">{uniqueQuizzesCount}</strong>
            </span>
            {DuplicateAttemptsIgnored > 0 && (
              <>
                <span>•</span>
                <span className="text-amber-300">
                  Repeat Attempts Deduplicated: {DuplicateAttemptsIgnored}
                </span>
              </>
            )}
          </div>

          {unattemptedEntries.length > 0 && (
            <button
              type="button"
              onClick={() => {
                audioFX.playClick();
                onUpdateFilters({
                  showUnattemptedStudents: !filters.showUnattemptedStudents,
                });
              }}
              className="flex items-center gap-1.5 text-cyan-300 hover:text-cyan-200 underline cursor-pointer"
            >
              <Users className="w-3.5 h-3.5" />
              <span>
                {filters.showUnattemptedStudents
                  ? `Hide ${unattemptedEntries.length} unattempted student(s)`
                  : `Show ${unattemptedEntries.length} eligible student(s) with 0 attempts`}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* 3. CURRENT SELECTED STUDENT'S STANDING CARD */}
      {activeStudent && (
        <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-cyan-950/50 via-slate-950/90 to-purple-950/40 border border-cyan-400/50 shadow-[0_0_20px_rgba(0,240,255,0.12)] flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            {/* Avatar & Rank Badge */}
            <div className="relative">
              <div
                className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br border flex items-center justify-center font-hud font-black text-base sm:text-lg shadow-lg ${
                  STREAM_BADGE_STYLES[activeStudent.stream].avatarBg
                }`}
              >
                {getInitials(activeStudent.name)}
              </div>
              {currentStudentEntry?.rank && (
                <span className="absolute -top-2 -right-2 px-2 py-0.5 rounded-lg bg-cyan-400 text-black font-hud font-black text-[10px] shadow">
                  #{currentStudentEntry.rank}
                </span>
              )}
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-mono-code uppercase tracking-wider px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 font-bold">
                  YOUR CURRENT STANDING
                </span>
                <h4 className="font-hud font-bold text-base sm:text-lg text-white">
                  {activeStudent.name}
                </h4>
                <span
                  className={`text-[10px] font-mono-code font-bold px-2 py-0.5 rounded border ${
                    STREAM_BADGE_STYLES[activeStudent.stream].badge
                  }`}
                >
                  {activeStudent.stream}
                </span>
              </div>

              {currentStudentEntry && currentStudentEntry.rank !== null ? (
                <p className="text-xs font-mono-code text-slate-300 mt-1">
                  Rank{' '}
                  <strong className="text-cyan-300">
                    #{currentStudentEntry.rank}
                    {currentStudentEntry.isTied ? ' (Tied)' : ''}
                  </strong>{' '}
                  • Lvl {currentStudentEntry.level} {currentStudentEntry.levelTitle} •{' '}
                  <span className="text-amber-300 font-bold">{currentStudentEntry.totalXP} XP</span>
                </p>
              ) : (
                <p className="text-xs font-mono-code text-slate-400 mt-1">
                  {filters.streamFilter !== 'ALL' && activeStudent.stream !== filters.streamFilter
                    ? `${activeStudent.name} belongs to ${activeStudent.stream} stream (currently viewing ${filters.streamFilter} filter).`
                    : `No completed quiz attempts recorded for ${activeStudent.name} in this filter yet.`}
                </p>
              )}
            </div>
          </div>

          {/* Current Student Performance Metrics */}
          {currentStudentEntry && currentStudentEntry.rank !== null ? (
            <div className="grid grid-cols-4 gap-2 sm:gap-3 w-full md:w-auto">
              <div className="px-3 py-2 rounded-xl bg-slate-950/80 border border-cyan-500/30 text-center">
                <div className="text-[10px] font-mono-code text-slate-400 uppercase">Points</div>
                <div className="font-hud font-bold text-sm sm:text-base text-white">
                  {currentStudentEntry.totalPoints}
                </div>
              </div>
              <div className="px-3 py-2 rounded-xl bg-slate-950/80 border border-cyan-500/30 text-center">
                <div className="text-[10px] font-mono-code text-slate-400 uppercase">Quizzes</div>
                <div className="font-hud font-bold text-sm sm:text-base text-cyan-300">
                  {currentStudentEntry.completedQuizzes}
                </div>
              </div>
              <div className="px-3 py-2 rounded-xl bg-slate-950/80 border border-cyan-500/30 text-center">
                <div className="text-[10px] font-mono-code text-slate-400 uppercase">Avg %</div>
                <div className="font-hud font-bold text-sm sm:text-base text-emerald-300">
                  {currentStudentEntry.averagePercentage}%
                </div>
              </div>
              <div className="px-3 py-2 rounded-xl bg-slate-950/80 border border-cyan-500/30 text-center">
                <div className="text-[10px] font-mono-code text-slate-400 uppercase">Correct</div>
                <div className="font-hud font-bold text-sm sm:text-base text-purple-300">
                  {currentStudentEntry.totalCorrectAnswers}/{currentStudentEntry.totalQuestionsAnswered}
                </div>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                audioFX.playClick();
                onSwitchToQuizzesTab();
              }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-hud text-xs font-bold shadow-[0_0_15px_rgba(0,240,255,0.3)] transition cursor-pointer shrink-0"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>START QUIZ AS {activeStudent.name.toUpperCase()}</span>
            </button>
          )}
        </div>
      )}

      {/* 4. EMPTY STATE WHEN NO COMPLETED QUIZ ATTEMPTS EXIST */}
      {rankedEntries.length === 0 ? (
        <div className="p-8 sm:p-12 rounded-3xl jarvis-panel border border-cyan-500/30 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-cyan-500/15 border border-cyan-400/40 flex items-center justify-center mx-auto text-cyan-300 shadow-[0_0_25px_rgba(0,240,255,0.2)]">
            <Trophy className="w-8 h-8" />
          </div>
          <div className="space-y-1.5 max-w-lg mx-auto">
            <h3 className="font-hud font-bold text-lg sm:text-xl text-white">
              NO VERIFIED QUIZ ATTEMPTS RECORDED YET
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 font-sans">
              {selectedQuizObj
                ? `No Class 11 student has completed "${selectedQuizObj.title}" yet.`
                : filters.streamFilter !== 'ALL'
                ? `No completed quiz attempts found for ${filters.streamFilter} stream${
                    filters.timePeriod === 'weekly' ? ' in the past 7 days' : ''
                  }.`
                : 'Rankings are calculated strictly from real, verified quiz submissions on this device or synced from the classroom server. Complete a quiz in Quiz Arena to claim the #1 spot!'}
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 flex-wrap pt-2">
            <button
              type="button"
              onClick={() => {
                audioFX.playClick();
                onSwitchToQuizzesTab();
              }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-hud text-xs font-bold shadow-[0_0_15px_rgba(0,240,255,0.35)] transition cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>TAKE A QUIZ NOW</span>
            </button>
            {(filters.streamFilter !== 'ALL' ||
              filters.selectedQuizId !== 'ALL' ||
              filters.timePeriod !== 'all_time') && (
              <button
                type="button"
                onClick={() => {
                  audioFX.playClick();
                  onUpdateFilters({
                    scope: 'overall',
                    streamFilter: 'ALL',
                    selectedQuizId: 'ALL',
                    timePeriod: 'all_time',
                  });
                }}
                className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-hud text-xs font-bold transition cursor-pointer"
              >
                RESET FILTERS
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* 5. TOP THREE PODIUM (1ST, 2ND, 3RD PLACE DISTINCT STYLING) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {podiumEntries.map((entry, idx) => {
              const place = entry.rank || idx + 1;
              const isFirst = place === 1;
              const isSecond = place === 2;
              const stStyle = STREAM_BADGE_STYLES[entry.stream];

              const cardStyle = isFirst
                ? 'bg-gradient-to-b from-amber-500/20 via-slate-950/90 to-cyan-950/40 border-amber-400/60 shadow-[0_0_25px_rgba(245,158,11,0.25)]'
                : isSecond
                ? 'bg-gradient-to-b from-cyan-500/15 via-slate-950/90 to-purple-950/40 border-cyan-400/50 shadow-[0_0_20px_rgba(0,240,255,0.18)]'
                : 'bg-gradient-to-b from-emerald-500/15 via-slate-950/90 to-slate-950 border-emerald-400/50 shadow-[0_0_18px_rgba(16,185,129,0.15)]';

              const badgeStyle = isFirst
                ? 'bg-amber-400 text-black shadow-[0_0_15px_rgba(245,158,11,0.6)]'
                : isSecond
                ? 'bg-cyan-300 text-black shadow-[0_0_12px_rgba(0,240,255,0.5)]'
                : 'bg-emerald-400 text-black shadow-[0_0_12px_rgba(16,185,129,0.4)]';

              const placeLabel = isFirst
                ? '1ST PLACE CHAMPION'
                : isSecond
                ? '2ND PLACE SCHOLAR'
                : '3RD PLACE MEDALIST';

              return (
                <div
                  key={entry.studentId}
                  onClick={() => onSelectStudent?.(entry.studentName)}
                  className={`p-5 rounded-2xl border relative overflow-hidden transition hover:scale-[1.01] cursor-pointer ${cardStyle}`}
                >
                  {/* Top Ribbon */}
                  <div className="flex items-center justify-between gap-2 mb-4">
                    <span
                      className={`px-2.5 py-1 rounded-lg font-hud font-black text-xs flex items-center gap-1.5 ${badgeStyle}`}
                    >
                      {isFirst ? (
                        <Crown className="w-3.5 h-3.5" />
                      ) : (
                        <Medal className="w-3.5 h-3.5" />
                      )}
                      <span>
                        #{entry.rank} {entry.isTied ? '(TIED)' : ''}
                      </span>
                    </span>
                    <span className="text-[10px] font-mono-code font-bold uppercase tracking-wider text-slate-300">
                      {placeLabel}
                    </span>
                  </div>

                  {/* Scholar Identity */}
                  <div className="flex items-center gap-3.5 mb-4">
                    <div
                      className={`w-14 h-14 rounded-2xl bg-gradient-to-br border flex items-center justify-center font-hud font-black text-lg shrink-0 ${stStyle.avatarBg}`}
                    >
                      {getInitials(entry.studentName)}
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-hud font-bold text-lg text-white truncate">
                        {entry.studentName}
                      </h4>
                      <div className="flex items-center gap-1.5 flex-wrap mt-1">
                        <span
                          className={`text-[10px] font-mono-code font-bold px-2 py-0.5 rounded border ${stStyle.badge}`}
                        >
                          {entry.stream}
                        </span>
                        <span className="text-[10px] font-mono-code text-slate-400">
                          Lvl {entry.level}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Key Metrics Grid */}
                  <div className="grid grid-cols-2 gap-2 pt-3 border-t border-white/10 font-mono-code text-xs">
                    <div className="p-2.5 rounded-xl bg-black/40 border border-white/10">
                      <div className="text-[10px] text-slate-400 uppercase">Total Points</div>
                      <div className="font-hud font-black text-base text-white mt-0.5">
                        {entry.totalPoints} <span className="text-[10px] text-cyan-300">pts</span>
                      </div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-black/40 border border-white/10">
                      <div className="text-[10px] text-slate-400 uppercase">Avg Accuracy</div>
                      <div className="font-hud font-black text-base text-cyan-300 mt-0.5">
                        {entry.averagePercentage}%
                      </div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-black/40 border border-white/10">
                      <div className="text-[10px] text-slate-400 uppercase">Completed</div>
                      <div className="font-hud font-bold text-sm text-emerald-300 mt-0.5">
                        {entry.completedQuizzes} Quiz{entry.completedQuizzes === 1 ? '' : 'zes'}
                      </div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-black/40 border border-white/10">
                      <div className="text-[10px] text-slate-400 uppercase">Correct Ans</div>
                      <div className="font-hud font-bold text-sm text-purple-300 mt-0.5">
                        {entry.totalCorrectAnswers}/{entry.totalQuestionsAnswered}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 6. FULL RANKINGS TABLE */}
          <div className="p-4 sm:p-6 rounded-2xl jarvis-panel border border-cyan-500/30 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-cyan-500/20 pb-3">
              <div>
                <h3 className="font-hud font-bold text-base text-white uppercase flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-cyan-400" />
                  <span>
                    {selectedQuizObj
                      ? `Quiz Standings: ${selectedQuizObj.title}`
                      : filters.streamFilter !== 'ALL'
                      ? `${filters.streamFilter} Stream Leaderboard`
                      : filters.scope === 'class'
                      ? 'Class 11 Complete Standings'
                      : 'Overall Class 11 Leaderboard'}
                  </span>
                </h3>
                <p className="text-xs font-mono-code text-slate-400 mt-0.5">
                  {filters.timePeriod === 'weekly'
                    ? 'Showing verified quiz completions from the last 7 days'
                    : 'Showing all-time verified quiz completions stored on this device'}
                </p>
              </div>
              <span className="text-xs font-mono-code text-cyan-300 bg-cyan-950/50 border border-cyan-500/30 px-3 py-1 rounded-xl">
                {rankedEntries.length} Ranked Scholar{rankedEntries.length === 1 ? '' : 's'}
              </span>
            </div>

            <div className="space-y-2.5">
              {rankedEntries.map((entry) => {
                const isCurrentStudent = activeStudent?.id === entry.studentId;
                const stStyle = STREAM_BADGE_STYLES[entry.stream];
                const rankNum = entry.rank || 1;

                const rankBadgeClass =
                  rankNum === 1
                    ? 'bg-amber-400 text-black shadow-[0_0_12px_rgba(245,158,11,0.5)]'
                    : rankNum === 2
                    ? 'bg-cyan-300 text-black shadow-[0_0_10px_rgba(0,240,255,0.4)]'
                    : rankNum === 3
                    ? 'bg-emerald-400 text-black shadow-[0_0_10px_rgba(16,185,129,0.4)]'
                    : 'bg-slate-800 text-slate-200 border border-slate-700';

                return (
                  <div
                    key={entry.studentId}
                    onClick={() => onSelectStudent?.(entry.studentName)}
                    className={`p-3.5 sm:p-4 rounded-2xl border transition flex flex-col lg:flex-row lg:items-center justify-between gap-4 cursor-pointer ${
                      isCurrentStudent
                        ? 'bg-cyan-950/40 border-cyan-400 shadow-[0_0_18px_rgba(0,240,255,0.2)]'
                        : 'bg-slate-950/70 border-cyan-500/20 hover:border-cyan-500/40'
                    }`}
                  >
                    {/* Left: Rank, Avatar, Name, Stream, Level & Badges */}
                    <div className="flex items-center gap-3.5">
                      <div className="flex flex-col items-center">
                        <span
                          className={`w-9 h-9 rounded-xl flex items-center justify-center font-hud font-black text-xs shrink-0 ${rankBadgeClass}`}
                        >
                          #{rankNum}
                        </span>
                        {entry.isTied && (
                          <span className="text-[9px] font-mono-code font-bold text-amber-300 mt-0.5">
                            TIED
                          </span>
                        )}
                      </div>

                      <div
                        className={`w-11 h-11 rounded-xl bg-gradient-to-br border flex items-center justify-center font-hud font-bold text-sm shrink-0 ${stStyle.avatarBg}`}
                      >
                        {getInitials(entry.studentName)}
                      </div>

                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-hud font-bold text-sm sm:text-base text-white">
                            {entry.studentName}
                          </h4>
                          {isCurrentStudent && (
                            <span className="px-2 py-0.5 rounded bg-cyan-400 text-black font-hud font-black text-[9px] uppercase">
                              YOU
                            </span>
                          )}
                          <span
                            className={`text-[10px] font-mono-code font-bold px-2 py-0.5 rounded border ${stStyle.badge}`}
                          >
                            {entry.stream}
                          </span>
                          <span className="text-[10px] font-mono-code px-2 py-0.5 rounded bg-slate-900 text-cyan-300 border border-cyan-500/25">
                            Lvl {entry.level} • {entry.levelTitle}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 flex-wrap text-[11px] font-mono-code text-slate-400 mt-1">
                          <span>ID: {entry.studentId}</span>
                          <span>•</span>
                          <span className="flex items-center gap-1 text-slate-300">
                            <Clock className="w-3 h-3 text-cyan-400" />
                            <span>{entry.totalTimeSeconds}s total time</span>
                          </span>
                          {entry.earnedBadgeIds.length > 0 && (
                            <div className="flex items-center gap-1">
                              {entry.earnedBadgeIds.map((bid) => {
                                const b = badgesCatalog.find((item) => item.id === bid);
                                if (!b) return null;
                                return (
                                  <span
                                    key={bid}
                                    title={`${b.name}: ${b.description}`}
                                    className="text-sm"
                                  >
                                    {b.icon}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Total Points, Completed Quizzes, Average %, Correct Answers, XP */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 lg:gap-4 items-center border-t lg:border-t-0 pt-3 lg:pt-0 border-slate-800/80">
                      <div className="px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 text-center">
                        <div className="text-[10px] font-mono-code text-slate-400 uppercase">
                          Total Points
                        </div>
                        <div className="font-hud font-extrabold text-sm sm:text-base text-white">
                          {entry.totalPoints}{' '}
                          <span className="text-[10px] font-mono-code text-slate-400">
                            / {entry.maxPossiblePoints}
                          </span>
                        </div>
                      </div>

                      <div className="px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 text-center">
                        <div className="text-[10px] font-mono-code text-slate-400 uppercase">
                          Quizzes
                        </div>
                        <div className="font-hud font-bold text-sm sm:text-base text-cyan-300">
                          {entry.completedQuizzes}
                        </div>
                      </div>

                      <div className="px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 text-center">
                        <div className="text-[10px] font-mono-code text-slate-400 uppercase">
                          Average %
                        </div>
                        <div className="font-hud font-bold text-sm sm:text-base text-emerald-300">
                          {entry.averagePercentage}%
                        </div>
                      </div>

                      <div className="px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 text-center">
                        <div className="text-[10px] font-mono-code text-slate-400 uppercase">
                          Correct Ans
                        </div>
                        <div className="font-hud font-bold text-sm sm:text-base text-purple-300">
                          {entry.totalCorrectAnswers}
                          <span className="text-[10px] text-slate-400">
                            /{entry.totalQuestionsAnswered}
                          </span>
                        </div>
                      </div>

                      <div className="col-span-2 sm:col-span-1 px-3 py-1.5 rounded-xl bg-amber-950/30 border border-amber-500/30 text-center">
                        <div className="text-[10px] font-mono-code text-amber-300/80 uppercase">
                          Total XP
                        </div>
                        <div className="font-hud font-extrabold text-sm text-amber-400 flex items-center justify-center gap-1">
                          <Zap className="w-3.5 h-3.5 fill-current" />
                          <span>{entry.totalXP}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* 7. OPTIONAL UNATTEMPTED ELIGIBLE STUDENTS SECTION (NEVER ASSIGNED FAKE RANKS OR SCORES) */}
      {filters.showUnattemptedStudents && unattemptedEntries.length > 0 && (
        <div className="p-4 sm:p-5 rounded-2xl jarvis-panel border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-hud font-bold text-xs uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <User className="w-4 h-4 text-slate-400" />
              <span>
                Eligible Class 11 Students Awaiting First Attempt ({unattemptedEntries.length})
              </span>
            </h4>
            <span className="text-[11px] font-mono-code text-slate-400">
              Unranked until a valid quiz is completed
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {unattemptedEntries.map((st) => {
              const stStyle = STREAM_BADGE_STYLES[st.stream];
              return (
                <div
                  key={st.studentId}
                  onClick={() => onSelectStudent?.(st.studentName)}
                  className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/90 hover:border-cyan-500/30 flex items-center justify-between gap-2 cursor-pointer transition"
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-8 h-8 rounded-lg bg-gradient-to-br border flex items-center justify-center font-hud font-bold text-xs ${stStyle.avatarBg}`}
                    >
                      {getInitials(st.studentName)}
                    </div>
                    <div>
                      <div className="font-hud font-bold text-xs text-slate-200">
                        {st.studentName}
                      </div>
                      <div className="text-[10px] font-mono-code text-slate-500">
                        No attempts yet
                      </div>
                    </div>
                  </div>
                  <span
                    className={`text-[10px] font-mono-code font-bold px-2 py-0.5 rounded border ${stStyle.badge}`}
                  >
                    {st.stream}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
