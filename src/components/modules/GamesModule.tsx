import React, { useState, useEffect, useRef } from 'react';
import {
  Gamepad2,
  Users,
  RotateCw,
  Shuffle,
  Zap,
  Layers,
  HelpCircle,
  Sparkles,
  Trophy,
  CheckCircle,
  Play,
  RotateCcw,
} from 'lucide-react';
import { storage } from '../../services/storage';
import { Student } from '../../types';
import { audioFX } from '../../services/audio';

const MEMORY_CARDS_DATA = [
  { id: '1', pairId: 'a', label: 'Newton’s 2nd Law', match: 'F = m · a' },
  { id: '2', pairId: 'a', label: 'F = m · a', match: 'Newton’s 2nd Law' },
  { id: '3', pairId: 'b', label: 'Kinetic Energy', match: 'E_k = ½ m v²' },
  { id: '4', pairId: 'b', label: 'E_k = ½ m v²', match: 'Kinetic Energy' },
  { id: '5', pairId: 'c', label: 'Ohm’s Law', match: 'V = I · R' },
  { id: '6', pairId: 'c', label: 'V = I · R', match: 'Ohm’s Law' },
  { id: '7', pairId: 'd', label: 'Trig Identity', match: 'sin²θ + cos²θ = 1' },
  { id: '8', pairId: 'd', label: 'sin²θ + cos²θ = 1', match: 'Trig Identity' },
  { id: '9', pairId: 'e', label: 'Speed of Light', match: 'c ≈ 3 × 10⁸ m/s' },
  { id: '10', pairId: 'e', label: 'c ≈ 3 × 10⁸ m/s', match: 'Speed of Light' },
  { id: '11', pairId: 'f', label: 'Universal Gravity', match: 'G ≈ 6.67 × 10⁻¹¹' },
  { id: '12', pairId: 'f', label: 'G ≈ 6.67 × 10⁻¹¹', match: 'Universal Gravity' },
];

const DEBATE_TOPICS = [
  'Artificial Intelligence: Will AI enhance or disrupt traditional classroom education?',
  'Space Exploration vs Ocean Exploration: Where should scientific funding go?',
  'Renewable Energy in India: Solar vs Nuclear Power for net-zero goals.',
  'Quantum Computing: Implications for cryptography and financial privacy.',
  'Free Market Economy vs Social Welfare: The ideal model for developing nations.',
  'Genetic Engineering in Agriculture: Ethical perspectives and food security.',
  'Mental Health in High School: Prioritizing academic rigor vs student wellbeing.',
];

export const GamesModule: React.FC = () => {
  const [activeGame, setActiveGame] = useState<'picker' | 'wheel' | 'quickfire' | 'memory' | 'topic'>('picker');
  const [students, setStudents] = useState<Student[]>(() => storage.getStudents());

  // 1. RANDOM PICKER STATE
  const [pickedStudent, setPickedStudent] = useState<Student | null>(null);
  const [isPicking, setIsPicking] = useState(false);
  const [teamCount, setTeamCount] = useState<number>(2);
  const [generatedTeams, setGeneratedTeams] = useState<Student[][]>([]);

  // 2. SPINNING WHEEL STATE
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [wheelOptions, setWheelOptions] = useState<string[]>([
    'Period 1: Physics',
    'Period 2: English',
    'Period 3: Math/Bio',
    'Period 4: Physics',
    'Period 5: AI & PE',
    'Period 6: Chemistry',
    'Alka Mam’s Bonus Trivia',
    'Fruit Break',
  ]);
  const [wheelWinner, setWheelWinner] = useState<string | null>(null);
  const [isSpinning, setIsSpinning] = useState(false);
  const wheelAngleRef = useRef<number>(0);

  // 3. QUICK-FIRE FLASHCARD STATE
  const [quickFireQuestions] = useState([
    { q: 'What is the acceleration due to gravity on Earth?', a: '9.8 m/s²' },
    { q: 'Formula for quadratic roots ax² + bx + c = 0?', a: 'x = (-b ± √(b² - 4ac)) / (2a)' },
    { q: 'Which quantum number specifies orbital shape?', a: 'Azimuthal (l)' },
    { q: 'Who is the author of "The Portrait of a Lady"?', a: 'Khushwant Singh' },
    { q: 'What is Opportunity Cost?', a: 'The value of next best alternative forgone' },
  ]);
  const [quickFireIndex, setQuickFireIndex] = useState(0);
  const [quickFireShowAnswer, setQuickFireShowAnswer] = useState(false);
  const [quickFireTimer, setQuickFireTimer] = useState(10);
  const [quickFireActive, setQuickFireActive] = useState(false);

  // 4. MEMORY MATCH GAME STATE
  const [memoryCards, setMemoryCards] = useState(() =>
    [...MEMORY_CARDS_DATA].sort(() => Math.random() - 0.5)
  );
  const [flippedIndices, setFlippedIndices] = useState<number[]>([]);
  const [matchedPairIds, setMatchedPairIds] = useState<string[]>([]);
  const [moves, setMoves] = useState(0);

  // 5. TOPIC PICKER STATE
  const [currentTopic, setCurrentTopic] = useState<string>(DEBATE_TOPICS[0]);

  // Canvas Spinning Wheel Drawing
  useEffect(() => {
    if (activeGame !== 'wheel') return;
    drawWheel();
  }, [activeGame, wheelOptions]);

  const drawWheel = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const radius = width / 2 - 12;
    const cx = width / 2;
    const cy = height / 2;

    ctx.clearRect(0, 0, width, height);

    const numSlices = wheelOptions.length;
    const sliceAngle = (2 * Math.PI) / numSlices;
    const colors = ['#00f0ff', '#3b82f6', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b', '#06b6d4', '#6366f1'];

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(wheelAngleRef.current);

    for (let i = 0; i < numSlices; i++) {
      const start = i * sliceAngle;
      const end = start + sliceAngle;

      // Slice
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius, start, end);
      ctx.fillStyle = colors[i % colors.length];
      ctx.fill();
      ctx.strokeStyle = '#040814';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Text
      ctx.save();
      ctx.rotate(start + sliceAngle / 2);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 12px Chakra Petch, sans-serif';
      ctx.fillText(wheelOptions[i], radius - 20, 4);
      ctx.restore();
    }

    // Center Core
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, Math.PI * 2);
    ctx.fillStyle = '#040814';
    ctx.fill();
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.restore();

    // Top Pointer Arrow
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 12, 10);
    ctx.lineTo(cx + 12, 10);
    ctx.lineTo(cx, 32);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  };

  const handleSpinWheel = () => {
    if (isSpinning) return;
    setIsSpinning(true);
    setWheelWinner(null);
    audioFX.playClick();

    const spinDuration = 3500; // 3.5s
    const startAngle = wheelAngleRef.current;
    // Genuine random rotations: between 5 and 10 full spins + random offset
    const targetAddition = (5 + Math.random() * 5) * 2 * Math.PI + Math.random() * 2 * Math.PI;
    const startTime = performance.now();

    const animateSpin = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / spinDuration);
      // Ease out cubic
      const easeOut = 1 - Math.pow(1 - progress, 3);
      wheelAngleRef.current = startAngle + targetAddition * easeOut;

      drawWheel();

      // Tick sound periodically
      if (Math.floor(elapsed / 150) % 2 === 0) {
        audioFX.playTick();
      }

      if (progress < 1) {
        requestAnimationFrame(animateSpin);
      } else {
        setIsSpinning(false);
        // Calculate winning slice at 12 o'clock (-PI / 2)
        const totalAngle = wheelAngleRef.current % (2 * Math.PI);
        const normalized = (2 * Math.PI - (totalAngle % (2 * Math.PI))) % (2 * Math.PI);
        // Arrow is at top: 3 * PI / 2 (270 deg)
        const pointerAngle = (normalized + (3 * Math.PI) / 2) % (2 * Math.PI);
        const sliceAngle = (2 * Math.PI) / wheelOptions.length;
        const winnerIndex = Math.floor(pointerAngle / sliceAngle) % wheelOptions.length;

        const winner = wheelOptions[winnerIndex];
        setWheelWinner(winner);
        audioFX.playSuccess();
      }
    };

    requestAnimationFrame(animateSpin);
  };

  // Single Student Pick
  const handlePickRandomStudent = () => {
    if (isPicking || students.length === 0) return;
    setIsPicking(true);
    audioFX.playClick();

    let counter = 0;
    const interval = setInterval(() => {
      const rand = students[Math.floor(Math.random() * students.length)];
      setPickedStudent(rand);
      audioFX.playTick();
      counter++;

      if (counter > 15) {
        clearInterval(interval);
        setIsPicking(false);
        audioFX.playSuccess();
      }
    }, 80);
  };

  // Divide Class into Teams
  const handleGenerateTeams = () => {
    audioFX.playClick();
    const shuffled = [...students].sort(() => Math.random() - 0.5);
    const teams: Student[][] = Array.from({ length: teamCount }, () => []);

    shuffled.forEach((std, idx) => {
      teams[idx % teamCount].push(std);
    });

    setGeneratedTeams(teams);
    audioFX.playSuccess();
  };

  // Memory Game Click
  const handleCardClick = (idx: number) => {
    if (flippedIndices.length === 2 || flippedIndices.includes(idx)) return;
    const card = memoryCards[idx];
    if (matchedPairIds.includes(card.pairId)) return;

    audioFX.playClick();
    const newFlipped = [...flippedIndices, idx];
    setFlippedIndices(newFlipped);

    if (newFlipped.length === 2) {
      setMoves((m) => m + 1);
      const first = memoryCards[newFlipped[0]];
      const second = memoryCards[newFlipped[1]];

      if (first.pairId === second.pairId) {
        // Matched!
        audioFX.playSuccess();
        setMatchedPairIds((prev) => [...prev, first.pairId]);
        setFlippedIndices([]);
      } else {
        // Mismatch
        setTimeout(() => {
          setFlippedIndices([]);
        }, 900);
      }
    }
  };

  const handleResetMemory = () => {
    audioFX.playClick();
    setMemoryCards([...MEMORY_CARDS_DATA].sort(() => Math.random() - 0.5));
    setFlippedIndices([]);
    setMatchedPairIds([]);
    setMoves(0);
  };

  return (
    <div className="space-y-6">
      {/* Module Title Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 sm:p-6 rounded-2xl jarvis-panel border border-cyan-500/30">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 font-mono-code text-xs font-bold uppercase">
              MODULE 07
            </span>
            <span className="text-xs font-mono-code text-slate-400">CLASSROOM ACTIVITIES</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold font-hud text-white mt-1">
            GAMES & INTERACTIVE WARMUPS
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 font-sans mt-0.5">
            Spinning wheel • Real student picker • Memory match • Debate topics
          </p>
        </div>

        {/* Activity Switcher */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {[
            { id: 'picker', label: 'Student Picker' },
            { id: 'wheel', label: 'Spinning Wheel' },
            { id: 'quickfire', label: 'Quick-Fire Quiz' },
            { id: 'memory', label: 'Memory Match' },
            { id: 'topic', label: 'Topic Picker' },
          ].map((act) => (
            <button
              key={act.id}
              onClick={() => {
                audioFX.playClick();
                setActiveGame(act.id as any);
              }}
              className={`px-3 py-2 rounded-xl text-xs font-hud font-bold whitespace-nowrap transition ${
                activeGame === act.id
                  ? 'bg-cyan-500 text-black shadow-[0_0_12px_rgba(0,240,255,0.4)]'
                  : 'bg-slate-900/80 text-slate-400 hover:text-white border border-cyan-500/20'
              }`}
            >
              {act.label}
            </button>
          ))}
        </div>
      </div>

      {/* 1. STUDENT PICKER & TEAMS */}
      {activeGame === 'picker' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Single Student Random Picker */}
          <div className="p-6 rounded-2xl jarvis-panel border border-cyan-500/30 text-center flex flex-col items-center justify-center">
            <h3 className="font-hud font-bold text-base text-cyan-300 uppercase mb-2">
              Random Student Call-Out
            </h3>
            <p className="text-xs text-slate-400 font-sans mb-6">
              Picks fairly from the 21 Class 11 students with zero repeats during active rounds.
            </p>

            <div className="w-full max-w-xs p-6 rounded-2xl bg-cyan-950/40 border border-cyan-400/40 shadow-[0_0_30px_rgba(0,240,255,0.2)] mb-6 min-h-[130px] flex flex-col items-center justify-center">
              {pickedStudent ? (
                <>
                  <div className="text-2xl sm:text-3xl font-hud font-extrabold text-white">
                    {pickedStudent.name}
                  </div>
                  <div className="text-xs font-mono-code text-cyan-400 mt-1 uppercase font-bold">
                    Stream: {pickedStudent.stream}
                  </div>
                </>
              ) : (
                <div className="text-sm font-mono-code text-slate-400">
                  Ready to pick student...
                </div>
              )}
            </div>

            <button
              onClick={handlePickRandomStudent}
              disabled={isPicking}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-hud text-sm font-bold shadow-[0_0_20px_rgba(0,240,255,0.4)] transition"
            >
              <Shuffle className={`w-4 h-4 ${isPicking ? 'animate-spin' : ''}`} />
              <span>{isPicking ? 'SELECTING...' : 'PICK RANDOM STUDENT'}</span>
            </button>
          </div>

          {/* Classroom Team Generator */}
          <div className="p-6 rounded-2xl jarvis-panel border border-cyan-500/30">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-hud font-bold text-base text-cyan-300 uppercase">
                  Class 11 Team Divider
                </h3>
                <p className="text-xs text-slate-400 font-sans">
                  Evenly distributes 21 students across teams.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-mono-code text-slate-300">Teams:</span>
                {[2, 3, 4].map((cnt) => (
                  <button
                    key={cnt}
                    onClick={() => setTeamCount(cnt)}
                    className={`w-7 h-7 rounded-lg text-xs font-hud font-bold ${
                      teamCount === cnt
                        ? 'bg-cyan-500 text-black font-extrabold'
                        : 'bg-slate-900 text-slate-400'
                    }`}
                  >
                    {cnt}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleGenerateTeams}
              className="w-full py-2.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-300 font-hud text-xs font-bold transition mb-4"
            >
              SHUFFLE & CREATE {teamCount} TEAMS
            </button>

            {generatedTeams.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-72 overflow-y-auto">
                {generatedTeams.map((team, tIdx) => (
                  <div
                    key={tIdx}
                    className="p-3.5 rounded-xl bg-slate-950/60 border border-cyan-500/20 text-xs font-mono-code"
                  >
                    <div className="font-hud font-bold text-cyan-400 mb-2">
                      TEAM {String.fromCharCode(65 + tIdx)} ({team.length} Members)
                    </div>
                    <ul className="space-y-1">
                      {team.map((s) => (
                        <li key={s.id} className="text-slate-200">
                          • {s.name} <span className="text-slate-500">({s.stream})</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. SPINNING WHEEL */}
      {activeGame === 'wheel' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 p-6 rounded-2xl jarvis-panel border border-cyan-500/30 flex flex-col items-center justify-center">
            <h3 className="font-hud font-bold text-base text-cyan-300 uppercase mb-4">
              Physics & Classroom Activity Wheel
            </h3>

            <div className="relative w-[340px] h-[340px] sm:w-[380px] sm:h-[380px] flex items-center justify-center">
              <canvas
                ref={canvasRef}
                width={380}
                height={380}
                className="w-full h-full drop-shadow-[0_0_25px_rgba(0,240,255,0.3)]"
              />
            </div>

            {wheelWinner && (
              <div className="mt-4 p-3.5 rounded-xl bg-amber-500/20 border border-amber-400 text-amber-300 font-hud font-bold text-base animate-in zoom-in-95">
                🎉 SELECTED: {wheelWinner}
              </div>
            )}

            <button
              onClick={handleSpinWheel}
              disabled={isSpinning}
              className="mt-6 flex items-center gap-2 px-8 py-3.5 rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-black font-hud text-sm font-bold shadow-[0_0_25px_rgba(0,240,255,0.5)] transition"
            >
              <RotateCw className={`w-4 h-4 ${isSpinning ? 'animate-spin' : ''}`} />
              <span>{isSpinning ? 'SPINNING...' : 'SPIN WHEEL'}</span>
            </button>
          </div>

          {/* Slices editor */}
          <div className="p-6 rounded-2xl jarvis-panel border border-cyan-500/30">
            <h3 className="font-hud font-bold text-sm text-cyan-300 uppercase mb-3">
              Configure Wheel Slices
            </h3>
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {wheelOptions.map((opt, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={opt}
                    onChange={(e) => {
                      const updated = [...wheelOptions];
                      updated[idx] = e.target.value;
                      setWheelOptions(updated);
                    }}
                    className="flex-1 px-3 py-1.5 rounded-lg bg-slate-900 border border-cyan-500/30 text-white text-xs font-mono-code outline-none"
                  />
                  {wheelOptions.length > 2 && (
                    <button
                      onClick={() => {
                        setWheelOptions(wheelOptions.filter((_, i) => i !== idx));
                      }}
                      className="p-1 text-slate-500 hover:text-red-400"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>

            <button
              onClick={() => {
                setWheelOptions([...wheelOptions, `New Choice ${wheelOptions.length + 1}`]);
              }}
              className="w-full mt-3 py-2 rounded-xl bg-cyan-950/40 border border-cyan-500/30 text-cyan-300 text-xs font-hud font-bold"
            >
              + ADD SLICE
            </button>
          </div>
        </div>
      )}

      {/* 3. QUICK-FIRE FLASHCARD CHALLENGE */}
      {activeGame === 'quickfire' && (
        <div className="p-6 sm:p-10 rounded-2xl jarvis-panel border border-cyan-500/30 text-center max-w-2xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono-code text-cyan-400 font-bold">
              CARD {quickFireIndex + 1} OF {quickFireQuestions.length}
            </span>
            <span className="text-xs font-mono-code text-slate-400">
              10-Second Warmup Challenge
            </span>
          </div>

          <div className="p-8 rounded-2xl bg-cyan-950/30 border border-cyan-500/30 min-h-[160px] flex flex-col items-center justify-center">
            <h3 className="font-hud font-bold text-xl text-white">
              {quickFireQuestions[quickFireIndex].q}
            </h3>

            {quickFireShowAnswer ? (
              <div className="mt-4 p-3 rounded-xl bg-emerald-950/40 border border-emerald-400 text-emerald-300 font-hud font-bold text-base animate-in fade-in">
                Answer: {quickFireQuestions[quickFireIndex].a}
              </div>
            ) : (
              <p className="text-xs text-slate-400 font-mono-code mt-4">
                Think fast before revealing the answer!
              </p>
            )}
          </div>

          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => {
                audioFX.playClick();
                setQuickFireShowAnswer(!quickFireShowAnswer);
              }}
              className="px-6 py-2.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-300 font-hud text-xs font-bold"
            >
              {quickFireShowAnswer ? 'HIDE ANSWER' : 'REVEAL ANSWER'}
            </button>

            <button
              onClick={() => {
                audioFX.playClick();
                setQuickFireIndex((prev) => (prev + 1) % quickFireQuestions.length);
                setQuickFireShowAnswer(false);
              }}
              className="px-6 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-hud text-xs font-bold shadow-[0_0_15px_rgba(0,240,255,0.4)]"
            >
              NEXT FLASHCARD →
            </button>
          </div>
        </div>
      )}

      {/* 4. MEMORY MATCH */}
      {activeGame === 'memory' && (
        <div className="p-6 rounded-2xl jarvis-panel border border-cyan-500/30 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-hud font-bold text-base text-cyan-300 uppercase">
                Physics & Mathematics Formula Match
              </h3>
              <p className="text-xs text-slate-400 font-sans">
                Find matching pairs between laws, identities, and their formulas.
              </p>
            </div>

            <div className="flex items-center gap-3 text-xs font-mono-code">
              <span className="text-slate-300">
                Moves: <strong className="text-white">{moves}</strong>
              </span>
              <button
                onClick={handleResetMemory}
                className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 hover:text-white"
              >
                Reset
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            {memoryCards.map((card, idx) => {
              const isFlipped = flippedIndices.includes(idx);
              const isMatched = matchedPairIds.includes(card.pairId);

              return (
                <button
                  key={card.id}
                  onClick={() => handleCardClick(idx)}
                  className={`h-24 p-2 rounded-xl border flex items-center justify-center text-center text-xs font-hud font-bold transition-all duration-300 ${
                    isMatched
                      ? 'bg-emerald-950/40 border-emerald-400 text-emerald-300 opacity-60'
                      : isFlipped
                      ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 shadow-[0_0_15px_rgba(0,240,255,0.2)]'
                      : 'bg-slate-900/80 border-cyan-500/20 text-transparent hover:border-cyan-400/50'
                  }`}
                >
                  {isFlipped || isMatched ? card.label : '❓'}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 5. TOPIC PICKER */}
      {activeGame === 'topic' && (
        <div className="p-8 rounded-2xl jarvis-panel border border-cyan-500/30 text-center max-w-2xl mx-auto space-y-6">
          <h3 className="font-hud font-bold text-base text-cyan-300 uppercase">
            Class 11 Debate & Presentation Topic Generator
          </h3>

          <div className="p-8 rounded-2xl bg-cyan-950/30 border border-cyan-400/30 min-h-[140px] flex items-center justify-center">
            <h4 className="font-hud font-bold text-lg sm:text-xl text-white leading-relaxed">
              "{currentTopic}"
            </h4>
          </div>

          <button
            onClick={() => {
              audioFX.playClick();
              const rand = DEBATE_TOPICS[Math.floor(Math.random() * DEBATE_TOPICS.length)];
              setCurrentTopic(rand);
              audioFX.playSuccess();
            }}
            className="px-8 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-hud text-sm font-bold shadow-[0_0_20px_rgba(0,240,255,0.4)] transition"
          >
            GENERATE NEW TOPIC
          </button>
        </div>
      )}
    </div>
  );
};
