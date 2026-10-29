import React from 'react';

export const Footer: React.FC = () => {
  return (
    <footer className="no-print print:hidden w-full py-4 px-4 text-center border-t border-cyan-500/10 bg-[#030714]/80 backdrop-blur-md relative z-20">
      <div className="flex flex-col sm:flex-row items-center justify-center gap-2 text-xs font-mono-code text-slate-400">
        <span className="text-slate-500 hidden sm:inline">
          THE ABHINAV SCHOOL • CLASS 11TH • CLASS IN-CHARGE: DIKSHA MAM
        </span>
        <span className="hidden sm:inline text-cyan-500/40">•</span>
        <span className="text-slate-300 transition-all duration-300 hover:text-cyan-300 hover:drop-shadow-[0_0_8px_rgba(0,240,255,0.7)] cursor-default font-medium tracking-wider">
          By <strong className="text-cyan-400 font-semibold font-hud">Vansh</strong>
        </span>
      </div>
    </footer>
  );
};
