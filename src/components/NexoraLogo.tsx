import React from 'react';

interface NexoraLogoProps {
  className?: string;
  size?: number;
  glow?: boolean;
}

export const NexoraLogo: React.FC<NexoraLogoProps> = ({
  className = '',
  size = 40,
  glow = true,
}) => {
  return (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      {/* Background radial glow */}
      {glow && (
        <div
          className="absolute inset-0 rounded-full bg-cyan-400/20 blur-md pointer-events-none animate-pulse"
          style={{ transform: 'scale(1.2)' }}
        />
      )}

      {/* Futuristic SVG Emblem */}
      <svg
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full relative z-10 drop-shadow-[0_0_8px_rgba(0,240,255,0.7)]"
      >
        <defs>
          <linearGradient id="nexoraGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00f0ff" />
            <stop offset="50%" stopColor="#0088ff" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
          <linearGradient id="nexoraGrad2" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#06b6d4" />
          </linearGradient>
          <radialGradient id="nexoraCoreGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
            <stop offset="40%" stopColor="#00f0ff" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#0077fe" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Outer Hexagonal Shield */}
        <polygon
          points="50,6 88,28 88,72 50,94 12,72 12,28"
          stroke="url(#nexoraGrad1)"
          strokeWidth="3.5"
          strokeLinejoin="round"
          fill="rgba(4, 18, 48, 0.6)"
        />

        {/* Inner Arc Reactor Rings */}
        <circle
          cx="50"
          cy="50"
          r="30"
          stroke="rgba(0, 240, 255, 0.35)"
          strokeWidth="1.5"
          strokeDasharray="4 3"
        />

        {/* Stylized 'N' Prism Core */}
        <path
          d="M34,68 L34,32 L44,32 L60,56 L60,32 L68,32 L68,68 L58,68 L42,44 L42,68 Z"
          fill="url(#nexoraGrad1)"
        />

        {/* Central Quantum Flare Dot */}
        <circle cx="50" cy="50" r="5" fill="url(#nexoraCoreGlow)" />
        <circle cx="50" cy="50" r="2" fill="#ffffff" />

        {/* Corner Holographic Nodes */}
        <circle cx="50" cy="6" r="2" fill="#00f0ff" />
        <circle cx="88" cy="28" r="2" fill="#00f0ff" />
        <circle cx="88" cy="72" r="2" fill="#8b5cf6" />
        <circle cx="50" cy="94" r="2" fill="#8b5cf6" />
        <circle cx="12" cy="72" r="2" fill="#0088ff" />
        <circle cx="12" cy="28" r="2" fill="#0088ff" />
      </svg>
    </div>
  );
};
