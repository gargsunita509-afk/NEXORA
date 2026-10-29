import React, { useState, useEffect, useRef } from 'react';
import {
  Timer as TimerIcon,
  Play,
  Pause,
  RotateCcw,
  Maximize2,
  Minimize2,
  Volume2,
  VolumeX,
  Flag,
  Clock,
  Sparkles,
} from 'lucide-react';
import { audioFX } from '../../services/audio';

const PRESETS = [
  { label: '1 Min', seconds: 60 },
  { label: '5 Min', seconds: 300 },
  { label: '10 Min', seconds: 600 },
  { label: '15 Min', seconds: 900 },
  { label: '25 Min (Pomodoro)', seconds: 1500 },
  { label: '45 Min (Period)', seconds: 2700 },
];

interface LapRecord {
  lap: number;
  splitTimeMs: number;
  overallTimeMs: number;
}

export const TimerModule: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'timer' | 'stopwatch'>('timer');

  // --- COUNTDOWN TIMER STATE ---
  const [totalTimerDurationSec, setTotalTimerDurationSec] = useState<number>(300); // 5 min default
  const [timerRemainingMs, setTimerRemainingMs] = useState<number>(300 * 1000);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);
  const [isTimerFullScreen, setIsTimerFullScreen] = useState<boolean>(false);

  // Custom duration inputs
  const [customHours, setCustomHours] = useState(0);
  const [customMinutes, setCustomMinutes] = useState(5);
  const [customSeconds, setCustomSeconds] = useState(0);

  // Ref tracking for exact elapsed time calculation
  const timerEndTimestampRef = useRef<number | null>(null);

  // --- STOPWATCH STATE ---
  const [isStopwatchRunning, setIsStopwatchRunning] = useState<boolean>(false);
  const [stopwatchElapsedMs, setStopwatchElapsedMs] = useState<number>(0);
  const [laps, setLaps] = useState<LapRecord[]>([]);
  const stopwatchStartRef = useRef<number | null>(null);
  const stopwatchAccumulatedRef = useRef<number>(0);

  // Sound mute state
  const [isMuted, setIsMuted] = useState<boolean>(audioFX.getMuted());

  // Timer Tick & Tab-Visibility Re-sync
  useEffect(() => {
    let animId: number;

    const tick = () => {
      if (isTimerRunning && timerEndTimestampRef.current !== null) {
        const remaining = Math.max(0, timerEndTimestampRef.current - Date.now());
        setTimerRemainingMs(remaining);

        if (remaining <= 0) {
          setIsTimerRunning(false);
          timerEndTimestampRef.current = null;
          audioFX.playTimerAlarm();
        }
      }

      if (isStopwatchRunning && stopwatchStartRef.current !== null) {
        const currentDelta = Date.now() - stopwatchStartRef.current;
        setStopwatchElapsedMs(stopwatchAccumulatedRef.current + currentDelta);
      }

      if (isTimerRunning || isStopwatchRunning) {
        animId = requestAnimationFrame(tick);
      }
    };

    if (isTimerRunning || isStopwatchRunning) {
      animId = requestAnimationFrame(tick);
    }

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        if (isTimerRunning && timerEndTimestampRef.current !== null) {
          const rem = Math.max(0, timerEndTimestampRef.current - Date.now());
          setTimerRemainingMs(rem);
          if (rem <= 0) {
            setIsTimerRunning(false);
            timerEndTimestampRef.current = null;
            audioFX.playTimerAlarm();
          }
        }
        if (isStopwatchRunning && stopwatchStartRef.current !== null) {
          const delta = Date.now() - stopwatchStartRef.current;
          setStopwatchElapsedMs(stopwatchAccumulatedRef.current + delta);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelAnimationFrame(animId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isTimerRunning, isStopwatchRunning]);

  // Timer Controls
  const startTimer = () => {
    audioFX.playClick();
    const targetEnd = Date.now() + timerRemainingMs;
    timerEndTimestampRef.current = targetEnd;
    setIsTimerRunning(true);
  };

  const pauseTimer = () => {
    audioFX.playClick();
    if (timerEndTimestampRef.current !== null) {
      const remaining = Math.max(0, timerEndTimestampRef.current - Date.now());
      setTimerRemainingMs(remaining);
      timerEndTimestampRef.current = null;
    }
    setIsTimerRunning(false);
  };

  const resetTimer = () => {
    audioFX.playClick();
    setIsTimerRunning(false);
    timerEndTimestampRef.current = null;
    setTimerRemainingMs(totalTimerDurationSec * 1000);
  };

  const restartTimer = () => {
    audioFX.playClick();
    setIsTimerRunning(false);
    const ms = totalTimerDurationSec * 1000;
    setTimerRemainingMs(ms);
    timerEndTimestampRef.current = Date.now() + ms;
    setIsTimerRunning(true);
  };

  const selectPreset = (sec: number) => {
    audioFX.playClick();
    setIsTimerRunning(false);
    timerEndTimestampRef.current = null;
    setTotalTimerDurationSec(sec);
    setTimerRemainingMs(sec * 1000);
  };

  const applyCustomDuration = (e: React.FormEvent) => {
    e.preventDefault();
    audioFX.playClick();
    const total = customHours * 3600 + customMinutes * 60 + customSeconds;
    if (total <= 0) return;
    setIsTimerRunning(false);
    timerEndTimestampRef.current = null;
    setTotalTimerDurationSec(total);
    setTimerRemainingMs(total * 1000);
  };

  // Stopwatch Controls
  const startStopwatch = () => {
    audioFX.playClick();
    stopwatchStartRef.current = Date.now();
    setIsStopwatchRunning(true);
  };

  const pauseStopwatch = () => {
    audioFX.playClick();
    if (stopwatchStartRef.current !== null) {
      stopwatchAccumulatedRef.current += Date.now() - stopwatchStartRef.current;
      stopwatchStartRef.current = null;
    }
    setIsStopwatchRunning(false);
  };

  const resetStopwatch = () => {
    audioFX.playClick();
    setIsStopwatchRunning(false);
    stopwatchStartRef.current = null;
    stopwatchAccumulatedRef.current = 0;
    setStopwatchElapsedMs(0);
    setLaps([]);
  };

  const recordLap = () => {
    if (!isStopwatchRunning) return;
    audioFX.playClick();
    const lastLapOverall = laps.length > 0 ? laps[0].overallTimeMs : 0;
    const split = stopwatchElapsedMs - lastLapOverall;
    const newLap: LapRecord = {
      lap: laps.length + 1,
      splitTimeMs: split,
      overallTimeMs: stopwatchElapsedMs,
    };
    setLaps([newLap, ...laps]);
  };

  // Formatting helpers
  const formatTimerDisplay = (ms: number) => {
    const totalSec = Math.ceil(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const formatStopwatchDisplay = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    const millis = Math.floor((ms % 1000) / 10);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(millis).padStart(2, '0')}`;
  };

  return (
    <div className={`space-y-6 ${isTimerFullScreen ? 'fixed inset-0 z-50 bg-[#040814] p-6' : ''}`}>
      {/* Header Banner */}
      {!isTimerFullScreen && (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 sm:p-6 rounded-2xl jarvis-panel border border-cyan-500/30">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 font-mono-code text-xs font-bold uppercase">
                MODULE 05
              </span>
              <span className="text-xs font-mono-code text-slate-400">CLASSROOM CHRONOMETER</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold font-hud text-white mt-1">
              TIMER & SMART STOPWATCH
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 font-sans mt-0.5">
              Elapsed delta timing • Background tab resilient • Synthetic audio chimes
            </p>
          </div>

          {/* Tab Switcher & Audio Toggle */}
          <div className="flex items-center gap-2">
            <div className="flex items-center p-1 rounded-xl bg-slate-900 border border-cyan-500/20">
              <button
                onClick={() => {
                  audioFX.playClick();
                  setActiveTab('timer');
                }}
                className={`px-4 py-2 rounded-lg font-hud text-xs font-bold transition ${
                  activeTab === 'timer'
                    ? 'bg-cyan-500 text-black shadow-[0_0_12px_rgba(0,240,255,0.4)]'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                COUNTDOWN TIMER
              </button>
              <button
                onClick={() => {
                  audioFX.playClick();
                  setActiveTab('stopwatch');
                }}
                className={`px-4 py-2 rounded-lg font-hud text-xs font-bold transition ${
                  activeTab === 'stopwatch'
                    ? 'bg-cyan-500 text-black shadow-[0_0_12px_rgba(0,240,255,0.4)]'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                STOPWATCH & LAPS
              </button>
            </div>

            <button
              onClick={() => {
                const muted = audioFX.toggleMute();
                setIsMuted(muted);
              }}
              title={isMuted ? 'Unmute timer alert chime' : 'Mute timer chime'}
              className="p-2.5 rounded-xl bg-cyan-950/40 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-900/40"
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}

      {/* COUNTDOWN TIMER VIEW */}
      {activeTab === 'timer' && (
        <div className="space-y-6">
          {/* Main Huge Display Card */}
          <div className="p-6 sm:p-12 rounded-3xl jarvis-panel border border-cyan-500/30 text-center relative overflow-hidden flex flex-col items-center justify-center">
            {/* Ambient glowing radial circle */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-cyan-500/5 blur-3xl pointer-events-none" />

            <div className="flex items-center gap-2 text-xs font-mono-code text-cyan-400 uppercase tracking-widest mb-3">
              <Clock className="w-4 h-4 animate-pulse" />
              <span>
                {isTimerRunning ? 'TIMER RUNNING' : timerRemainingMs === 0 ? 'TIME EXPIRED' : 'READY'}
              </span>
            </div>

            {/* Huge HUD Digital Clock readout */}
            <div
              className={`font-mono-code font-black tracking-wider transition-all drop-shadow-[0_0_30px_rgba(0,240,255,0.4)] ${
                isTimerFullScreen
                  ? 'text-7xl sm:text-9xl md:text-[14rem]'
                  : 'text-6xl sm:text-8xl md:text-9xl'
              } ${timerRemainingMs <= 10000 && timerRemainingMs > 0 ? 'text-amber-300 animate-pulse' : 'text-white'}`}
            >
              {formatTimerDisplay(timerRemainingMs)}
            </div>

            {/* Primary Controls */}
            <div className="flex flex-wrap items-center justify-center gap-3 mt-8">
              {!isTimerRunning ? (
                <button
                  onClick={startTimer}
                  className="flex items-center gap-2 px-8 py-3.5 rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-black font-hud text-base font-bold shadow-[0_0_25px_rgba(0,240,255,0.5)] transition"
                >
                  <Play className="w-5 h-5 fill-current" />
                  <span>START</span>
                </button>
              ) : (
                <button
                  onClick={pauseTimer}
                  className="flex items-center gap-2 px-8 py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-hud text-base font-bold shadow-[0_0_25px_rgba(245,158,11,0.5)] transition"
                >
                  <Pause className="w-5 h-5 fill-current" />
                  <span>PAUSE</span>
                </button>
              )}

              <button
                onClick={resetTimer}
                className="flex items-center gap-2 px-5 py-3.5 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white font-hud text-sm font-bold transition"
              >
                <RotateCcw className="w-4 h-4" />
                <span>RESET</span>
              </button>

              <button
                onClick={restartTimer}
                className="flex items-center gap-2 px-5 py-3.5 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-cyan-300 font-hud text-sm font-bold transition"
              >
                <span>RESTART</span>
              </button>

              <button
                onClick={() => {
                  audioFX.playClick();
                  setIsTimerFullScreen(!isTimerFullScreen);
                }}
                className="p-3.5 rounded-2xl bg-cyan-950/40 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-900/50 transition"
                title={isTimerFullScreen ? 'Exit full screen' : 'Full screen timer for classroom'}
              >
                {isTimerFullScreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Presets and Custom Inputs (Hidden during fullscreen) */}
          {!isTimerFullScreen && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Presets */}
              <div className="p-4 sm:p-5 rounded-2xl jarvis-panel border border-cyan-500/20">
                <h3 className="font-hud font-bold text-sm text-cyan-300 uppercase mb-3">
                  Classroom Presets
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {PRESETS.map((pr) => (
                    <button
                      key={pr.seconds}
                      onClick={() => selectPreset(pr.seconds)}
                      className={`p-3 rounded-xl border text-xs font-hud font-bold transition ${
                        totalTimerDurationSec === pr.seconds
                          ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400 shadow-[0_0_12px_rgba(0,240,255,0.2)]'
                          : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:border-cyan-500/40'
                      }`}
                    >
                      {pr.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Duration Input */}
              <form
                onSubmit={applyCustomDuration}
                className="p-4 sm:p-5 rounded-2xl jarvis-panel border border-cyan-500/20"
              >
                <h3 className="font-hud font-bold text-sm text-cyan-300 uppercase mb-3">
                  Custom Duration
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] font-mono-code text-slate-400 mb-1">
                      Hours
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="23"
                      value={customHours}
                      onChange={(e) => setCustomHours(Number(e.target.value))}
                      className="w-full p-2.5 rounded-lg bg-slate-900 border border-cyan-500/30 text-white text-center font-mono-code font-bold outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono-code text-slate-400 mb-1">
                      Minutes
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="59"
                      value={customMinutes}
                      onChange={(e) => setCustomMinutes(Number(e.target.value))}
                      className="w-full p-2.5 rounded-lg bg-slate-900 border border-cyan-500/30 text-white text-center font-mono-code font-bold outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono-code text-slate-400 mb-1">
                      Seconds
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="59"
                      value={customSeconds}
                      onChange={(e) => setCustomSeconds(Number(e.target.value))}
                      className="w-full p-2.5 rounded-lg bg-slate-900 border border-cyan-500/30 text-white text-center font-mono-code font-bold outline-none"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full mt-3 py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-300 font-hud text-xs font-bold transition"
                >
                  SET CUSTOM TIME
                </button>
              </form>
            </div>
          )}
        </div>
      )}

      {/* STOPWATCH VIEW */}
      {activeTab === 'stopwatch' && (
        <div className="space-y-6">
          {/* Main Stopwatch Readout */}
          <div className="p-8 sm:p-12 rounded-3xl jarvis-panel border border-cyan-500/30 text-center flex flex-col items-center justify-center">
            <div className="text-xs font-mono-code text-cyan-400 uppercase tracking-widest mb-3">
              STOPWATCH & HIGH-PRECISION LAP TIMER
            </div>

            <div className="text-6xl sm:text-8xl md:text-9xl font-mono-code font-black text-white tracking-wider drop-shadow-[0_0_30px_rgba(0,240,255,0.4)]">
              {formatStopwatchDisplay(stopwatchElapsedMs)}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 mt-8">
              {!isStopwatchRunning ? (
                <button
                  onClick={startStopwatch}
                  className="flex items-center gap-2 px-8 py-3.5 rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-black font-hud text-base font-bold shadow-[0_0_25px_rgba(0,240,255,0.5)] transition"
                >
                  <Play className="w-5 h-5 fill-current" />
                  <span>START</span>
                </button>
              ) : (
                <button
                  onClick={pauseStopwatch}
                  className="flex items-center gap-2 px-8 py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-hud text-base font-bold shadow-[0_0_25px_rgba(245,158,11,0.5)] transition"
                >
                  <Pause className="w-5 h-5 fill-current" />
                  <span>PAUSE</span>
                </button>
              )}

              <button
                onClick={recordLap}
                disabled={!isStopwatchRunning}
                className="flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-cyan-950/40 border border-cyan-500/40 text-cyan-300 disabled:opacity-40 font-hud text-sm font-bold transition"
              >
                <Flag className="w-4 h-4" />
                <span>LAP</span>
              </button>

              <button
                onClick={resetStopwatch}
                className="flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-slate-900 border border-slate-700 text-slate-300 font-hud text-sm font-bold transition"
              >
                <RotateCcw className="w-4 h-4" />
                <span>RESET</span>
              </button>
            </div>
          </div>

          {/* Laps Record Table */}
          {laps.length > 0 && (
            <div className="p-4 sm:p-5 rounded-2xl jarvis-panel border border-cyan-500/20">
              <h3 className="font-hud font-bold text-sm text-cyan-300 uppercase mb-3">
                Recorded Laps ({laps.length})
              </h3>
              <div className="max-h-60 overflow-y-auto space-y-2">
                {laps.map((lap) => (
                  <div
                    key={lap.lap}
                    className="p-3 rounded-xl bg-slate-950/60 border border-cyan-500/20 flex items-center justify-between text-xs font-mono-code"
                  >
                    <span className="font-hud font-bold text-cyan-400">
                      LAP #{String(lap.lap).padStart(2, '0')}
                    </span>
                    <span className="text-slate-300">
                      Split: {formatStopwatchDisplay(lap.splitTimeMs)}
                    </span>
                    <span className="font-bold text-white">
                      Overall: {formatStopwatchDisplay(lap.overallTimeMs)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
