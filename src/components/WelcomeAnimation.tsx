import React, { useState, useEffect, useRef } from 'react';
import { NexoraLogo } from './NexoraLogo';
import { audioFX } from '../services/audio';

interface WelcomeAnimationProps {
  onComplete: () => void;
}

export const WelcomeAnimation: React.FC<WelcomeAnimationProps> = ({ onComplete }) => {
  // Phase sequence: 'enter' (0-900ms) -> 'hold' (900-3200ms) -> 'dock' (3200-4300ms) -> 'reveal' (4300-4900ms)
  const [phase, setPhase] = useState<'enter' | 'hold' | 'dock' | 'reveal'>('enter');
  const [glideCoords, setGlideCoords] = useState<{ dx: number; dy: number; scale: number }>({
    dx: 0,
    dy: 0,
    scale: 1,
  });

  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const isCompletedRef = useRef(false);

  const finish = () => {
    if (isCompletedRef.current) return;
    isCompletedRef.current = true;
    onCompleteRef.current();
  };

  useEffect(() => {
    // Respect reduced motion preference immediately
    if (typeof window !== 'undefined') {
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (prefersReducedMotion) {
        finish();
        return;
      }
    }

    // Play subtle entrance chime
    try {
      audioFX.playClick();
    } catch {}

    // 1. Enter to Hold transition at 900ms
    const tHold = setTimeout(() => {
      setPhase('hold');
    }, 900);

    // 2. Prepare Dock transition at 3200ms (held in center for 2.3 seconds)
    const tDock = setTimeout(() => {
      // Calculate target header position
      const headerBrand = document.getElementById('nexora-header-brand');
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;

      let targetX = 36;
      let targetY = 28;
      let targetScale = 0.42;

      if (headerBrand) {
        const rect = headerBrand.getBoundingClientRect();
        targetX = rect.left + 22;
        targetY = rect.top + rect.height / 2;
        targetScale = 38 / 92;
      }

      setGlideCoords({
        dx: targetX - centerX,
        dy: targetY - centerY,
        scale: targetScale,
      });

      setPhase('dock');
    }, 3200);

    // 3. Fade out overlay to reveal dashboard at 4300ms
    const tReveal = setTimeout(() => {
      setPhase('reveal');
    }, 4300);

    // 4. Complete sequence and unmount at 4950ms
    const tFinish = setTimeout(() => {
      finish();
    }, 4950);

    // 5. Hard failsafe watchdog: guarantee dashboard reveal within 5.8s
    const tWatchdog = setTimeout(() => {
      finish();
    }, 5800);

    return () => {
      clearTimeout(tHold);
      clearTimeout(tDock);
      clearTimeout(tReveal);
      clearTimeout(tFinish);
      clearTimeout(tWatchdog);
    };
  }, []);

  const handleSkip = () => {
    try {
      audioFX.playClick();
    } catch {}
    finish();
  };

  const isDocking = phase === 'dock' || phase === 'reveal';

  return (
    <div
      className={`fixed inset-0 z-50 overflow-hidden flex items-center justify-center transition-opacity duration-600 ease-out select-none ${
        phase === 'reveal' ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      style={{
        background: 'radial-gradient(circle at center, #081a42 0%, #040d24 55%, #020612 100%)',
      }}
      aria-label="Welcome Presentation"
    >
      {/* Soft atmospheric background illumination */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] sm:w-[750px] h-[550px] sm:h-[750px] rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] sm:w-[450px] h-[300px] sm:h-[450px] rounded-full bg-blue-600/10 blur-2xl" />
      </div>

      {/* Skip Button */}
      <button
        onClick={handleSkip}
        className="absolute top-4 right-4 z-50 px-3 py-1.5 rounded-lg bg-black/40 hover:bg-black/70 border border-cyan-500/30 text-cyan-300 hover:text-white font-mono-code text-xs transition backdrop-blur-md cursor-pointer"
        aria-label="Skip entrance presentation"
      >
        SKIP INTRO →
      </button>

      {/* Central Moving Container: Centers smoothly, glides to header using GPU transforms */}
      <div
        className="flex flex-col items-center justify-center text-center will-change-transform"
        style={{
          transform: isDocking
            ? `translate3d(${glideCoords.dx}px, ${glideCoords.dy}px, 0) scale(${glideCoords.scale})`
            : phase === 'enter'
            ? 'scale(0.94)'
            : 'scale(1)',
          transition: isDocking
            ? 'transform 1050ms cubic-bezier(0.16, 1, 0.3, 1)'
            : 'transform 800ms cubic-bezier(0.16, 1, 0.3, 1), opacity 800ms ease-out',
          opacity: phase === 'enter' ? 0.3 : 1,
        }}
      >
        {/* Holographic Logo Emblem */}
        <div className="mb-4">
          <NexoraLogo size={92} glow={true} />
        </div>

        {/* Brand Name */}
        <h1
          className="font-hud font-extrabold tracking-[0.24em] text-white text-4xl sm:text-6xl uppercase"
          style={{
            textShadow: '0 0 25px rgba(0, 240, 255, 0.6), 0 0 50px rgba(0, 119, 254, 0.35)',
          }}
        >
          NEXORA
        </h1>

        {/* Tagline & Subtitle Section */}
        <div
          className="transition-all duration-400 ease-out mt-3"
          style={{
            opacity: isDocking ? 0 : 1,
            transform: isDocking ? 'translateY(12px) scale(0.95)' : 'translateY(0) scale(1)',
            pointerEvents: isDocking ? 'none' : 'auto',
          }}
        >
          <p
            className="font-hud text-base sm:text-xl text-slate-100 font-medium tracking-[0.16em]"
            style={{
              textShadow: '0 0 15px rgba(0, 240, 255, 0.4), 0 0 25px rgba(255, 255, 255, 0.2)',
            }}
          >
            “A New Beginning of Life”
          </p>

          <p className="font-mono-code uppercase font-semibold tracking-[0.28em] text-cyan-400 text-xs mt-2 opacity-90">
            CLASS 11 COMMAND CENTER • THE ABHINAV SCHOOL
          </p>
        </div>
      </div>
    </div>
  );
};
