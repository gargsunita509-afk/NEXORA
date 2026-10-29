import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { audioFX } from '../services/audio';

interface UniversalBackButtonProps {
  label?: string;
  sublabel?: string;
  onClick: () => void;
  className?: string;
}

export const UniversalBackButton: React.FC<UniversalBackButtonProps> = ({
  label = 'BACK TO COMMAND CENTER',
  sublabel,
  onClick,
  className = '',
}) => {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        audioFX.playClick();
        onClick();
      }}
      className={`group inline-flex items-center gap-2.5 px-3.5 py-2 min-h-[44px] rounded-xl bg-slate-900/90 hover:bg-cyan-950/70 border border-cyan-500/30 hover:border-cyan-400 text-cyan-300 hover:text-white shadow-[0_0_15px_rgba(0,240,255,0.15)] hover:shadow-[0_0_20px_rgba(0,240,255,0.3)] transition-all cursor-pointer select-none active:scale-95 ${className}`}
      aria-label={label}
      title={label}
    >
      <div className="w-6 h-6 rounded-lg bg-cyan-500/20 group-hover:bg-cyan-500/30 flex items-center justify-center transition shrink-0">
        <ArrowLeft className="w-4 h-4 text-cyan-400 group-hover:text-white transition-transform group-hover:-translate-x-0.5" />
      </div>
      <div className="text-left leading-tight">
        <span className="font-hud text-xs sm:text-sm font-bold tracking-wider uppercase block">
          {label}
        </span>
        {sublabel && (
          <span className="text-[10px] text-slate-400 font-mono-code block mt-0.5">
            {sublabel}
          </span>
        )}
      </div>
    </button>
  );
};
