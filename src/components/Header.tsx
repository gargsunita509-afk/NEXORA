import React, { useState, useEffect } from 'react';
import {
  Clock,
  Calendar,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Database,
  Layers,
  ShieldAlert,
  ShieldCheck,
  Lock,
} from 'lucide-react';
import { audioFX } from '../services/audio';
import { NexoraLogo } from './NexoraLogo';
import { PWAInstallButton } from './PWAInstallButton';
import { StaffUser } from '../types';

interface HeaderProps {
  currentModule: string;
  isPresentationMode: boolean;
  onTogglePresentation: () => void;
  onOpenBackup: () => void;
  onOpenDiagnostics: () => void;
  isMobileMenuOpen: boolean;
  onToggleMobileMenu: () => void;
  staffUser?: StaffUser | null;
  onOpenStaffPortal?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentModule,
  isPresentationMode,
  onTogglePresentation,
  onOpenBackup,
  onOpenDiagnostics,
  isMobileMenuOpen,
  onToggleMobileMenu,
  staffUser,
  onOpenStaffPortal,
}) => {
  const [time, setTime] = useState<Date>(new Date());
  const [isMuted, setIsMuted] = useState<boolean>(audioFX.getMuted());
  const [is24Hour, setIs24Hour] = useState<boolean>(false);

  // Update clock every second & re-sync on visibility change
  useEffect(() => {
    const updateTime = () => setTime(new Date());
    const intervalId = setInterval(updateTime, 1000);

    const handleVisibility = () => {
      if (!document.hidden) updateTime();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', updateTime);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', updateTime);
    };
  }, []);

  const handleMuteToggle = () => {
    const muted = audioFX.toggleMute();
    setIsMuted(muted);
    if (!muted) audioFX.playClick();
  };

  const formattedDate = time.toLocaleDateString('en-IN', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const formattedTime = time.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: !is24Hour,
  });

  return (
    <header className="relative z-30 border-b border-cyan-500/20 bg-[#040814]/90 backdrop-blur-md px-3 sm:px-6 py-2.5 transition-all">
      {/* Top ambient glowing accent line */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent opacity-80" />

      <div className="flex items-center justify-between gap-3">
        {/* Left: NEXORA Logo + School Identity */}
        <div className="flex items-center gap-3">
          {/* Mobile hamburger menu button */}
          <button
            onClick={() => {
              audioFX.playClick();
              onToggleMobileMenu();
            }}
            className="md:hidden p-2 rounded-lg bg-cyan-950/40 border border-cyan-500/30 text-cyan-400 hover:text-cyan-200 transition"
            aria-label="Toggle navigation menu"
          >
            <Layers className="w-5 h-5" />
          </button>

          {/* Permanent NEXORA Branding with Custom Holographic Emblem */}
          <div id="nexora-header-brand" className="flex items-center gap-2.5">
            <NexoraLogo size={38} glow={true} />
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-hud font-extrabold text-base sm:text-lg tracking-[0.16em] text-white">
                  NEXORA
                </span>
                <span className="text-[10px] sm:text-xs font-semibold tracking-[0.15em] text-cyan-400/90 uppercase font-mono-code hidden sm:inline">
                  • THE ABHINAV SCHOOL
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <span className="font-hud font-bold text-cyan-300">
                  CLASS 11<span className="text-cyan-400">TH</span>
                </span>
                <span className="text-slate-400 text-[11px] hidden xs:inline">
                  • Class In-Charge:
                </span>
                <span className="font-semibold text-cyan-300 text-[11px] hidden xs:inline">
                  Diksha Mam
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Center / Right: Live Clock & Quick Controls */}
        <div className="flex items-center gap-2 sm:gap-4">
          {/* Live Clock with IST Support */}
          <div className="flex items-center gap-2 sm:gap-3 px-2.5 sm:px-4 py-1.5 rounded-lg bg-cyan-950/30 border border-cyan-500/20 shadow-inner">
            <div className="text-right">
              <div className="flex items-center justify-end gap-1.5 text-xs sm:text-sm font-semibold font-mono-code text-cyan-300 tracking-wider">
                <Clock className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                <button
                  onClick={() => setIs24Hour(!is24Hour)}
                  title="Click to toggle 12h / 24h format"
                  className="hover:text-white transition"
                >
                  {formattedTime}
                </button>
              </div>
              <div className="hidden sm:flex items-center justify-end gap-1 text-[10px] text-slate-400 font-mono-code">
                <Calendar className="w-3 h-3 text-slate-400" />
                <span>{formattedDate}</span>
                <span className="text-cyan-400/80 font-bold ml-1">IST (Asia/Kolkata)</span>
              </div>
            </div>
          </div>

          {/* Quick Controls */}
          <div className="flex items-center gap-1 sm:gap-2">

            {/* Audio Toggle */}
            <button
              onClick={handleMuteToggle}
              title={isMuted ? 'Unmute Sound Effects' : 'Mute Sound Effects'}
              className={`p-2 rounded-lg border transition ${
                isMuted
                  ? 'bg-slate-900/60 border-slate-700 text-slate-400 hover:text-slate-200'
                  : 'bg-cyan-950/40 border-cyan-500/30 text-cyan-400 hover:bg-cyan-900/40 shadow-[0_0_10px_rgba(0,240,255,0.15)]'
              }`}
              aria-label={isMuted ? 'Unmute audio' : 'Mute audio'}
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>

            {/* Diagnostics Runner */}
            <button
              onClick={() => {
                audioFX.playClick();
                onOpenDiagnostics();
              }}
              title="Run 40 Verification Tests"
              className="p-2 rounded-lg bg-cyan-950/40 border border-cyan-500/30 text-cyan-400 hover:text-cyan-200 hover:bg-cyan-900/40 transition flex items-center gap-1.5"
              aria-label="System Diagnostics"
            >
              <ShieldAlert className="w-4 h-4 text-emerald-400" />
              <span className="hidden xl:inline text-xs font-mono-code font-medium">Verify</span>
            </button>

            {/* Backup & Restore */}
            <button
              onClick={() => {
                audioFX.playClick();
                onOpenBackup();
              }}
              title="Backup / Restore Class Data"
              className="p-2 rounded-lg bg-cyan-950/40 border border-cyan-500/30 text-cyan-400 hover:text-cyan-200 hover:bg-cyan-900/40 transition flex items-center gap-1.5"
              aria-label="Backup and Restore"
            >
              <Database className="w-4 h-4" />
              <span className="hidden xl:inline text-xs font-mono-code font-medium">Backup</span>
            </button>

            {/* PWA Install Button for Smart Board / Desktop / Mobile */}
            <PWAInstallButton />

            {/* 16:9 Smart Board Presentation Mode */}
            <button
              onClick={() => {
                audioFX.playClick();
                onTogglePresentation();
              }}
              title={isPresentationMode ? 'Exit Presentation Mode' : '16:9 Presentation Mode'}
              className={`p-2 sm:px-3 sm:py-2 rounded-lg border transition flex items-center gap-1.5 text-xs font-semibold ${
                isPresentationMode
                  ? 'bg-amber-500/20 border-amber-400/50 text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.3)]'
                  : 'bg-gradient-to-r from-cyan-900/50 to-blue-900/50 border-cyan-400/40 text-cyan-300 hover:border-cyan-300 shadow-[0_0_12px_rgba(0,240,255,0.2)]'
              }`}
            >
              {isPresentationMode ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              <span className="hidden md:inline font-hud">
                {isPresentationMode ? 'EXIT HUD' : 'PRESENT 16:9'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
