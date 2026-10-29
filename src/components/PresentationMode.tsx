import React, { useState, useEffect } from 'react';
import { X, Maximize2, Minimize2, Download, Check, Tv, HelpCircle } from 'lucide-react';
import { audioFX } from '../services/audio';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { PWAInstallModal } from './PWAInstallModal';
import { UniversalBackButton } from './UniversalBackButton';

interface PresentationModeProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export const PresentationMode: React.FC<PresentationModeProps> = ({
  isOpen,
  onClose,
  title,
  children,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Sync fullscreen state
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // ESC key listener to exit presentation mode
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        audioFX.playClick();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleToggleFullscreen = () => {
    audioFX.playClick();
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const handleSmartBoardInstallClick = async () => {
    audioFX.playClick();
    if (isInstallable) {
      const outcome = await install();
      if (!outcome) {
        setIsInstallModalOpen(true);
      }
    } else {
      setIsInstallModalOpen(true);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[#030611] text-white flex flex-col overflow-hidden animate-in fade-in duration-200">
      {/* High-tech Top Bar for 16:9 Presentation */}
      <div className="flex items-center justify-between px-3 sm:px-6 py-2.5 sm:py-3 border-b border-cyan-500/30 bg-[#040a1c]/95 backdrop-blur-md gap-2">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <UniversalBackButton
            label="BACK"
            sublabel="Exit HUD"
            onClick={onClose}
            className="shrink-0"
          />
          <div className="hidden sm:inline-block px-2.5 py-1 rounded bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 font-mono-code text-[11px] sm:text-xs font-bold tracking-widest uppercase shrink-0">
            16:9 SMART-BOARD HUD
          </div>
          <h2 className="text-base sm:text-xl md:text-2xl font-bold font-hud tracking-wide text-white truncate flex items-center gap-2">
            <span>{title}</span>
            <span className="text-xs font-normal text-cyan-400 font-mono-code hidden lg:inline">
              — THE ABHINAV SCHOOL • CLASS 11TH
            </span>
          </h2>
        </div>

        {/* Right Action Bar: Install Action + Fullscreen + Exit */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Smart Board Installation Option */}
          <button
            onClick={handleSmartBoardInstallClick}
            title={
              isInstalled
                ? 'NEXORA is installed (Click for standalone mode info)'
                : isInstallable
                ? 'Install NEXORA app directly on this Smart Board'
                : 'Smart Board installation guide'
            }
            className={`px-2.5 py-1.5 rounded-lg border text-xs font-hud font-semibold flex items-center gap-1.5 transition ${
              isInstalled
                ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300 hover:bg-emerald-900/40'
                : isInstallable
                ? 'bg-gradient-to-r from-cyan-600 to-blue-600 border-cyan-400/50 text-white hover:brightness-110 shadow-[0_0_12px_rgba(0,240,255,0.3)]'
                : 'bg-cyan-950/40 border-cyan-500/30 text-cyan-300 hover:bg-cyan-900/40'
            }`}
          >
            {isInstalled ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline font-mono-code text-[11px]">INSTALLED</span>
              </>
            ) : isInstallable ? (
              <>
                <Download className="w-3.5 h-3.5 animate-bounce" />
                <span className="hidden sm:inline">INSTALL ON SMART BOARD</span>
                <span className="sm:hidden">INSTALL</span>
              </>
            ) : (
              <>
                <Tv className="w-3.5 h-3.5 text-cyan-400" />
                <span className="hidden sm:inline font-mono-code text-[11px]">INSTALL APP</span>
              </>
            )}
          </button>

          {/* Borderless Fullscreen for Smart Board Touch Stylus */}
          <button
            onClick={handleToggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Borderless Fullscreen'}
            className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg bg-cyan-950/40 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-900/40 text-xs font-hud font-semibold flex items-center gap-1.5 transition"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            <span className="hidden md:inline">{isFullscreen ? 'WINDOWED' : 'FULLSCREEN'}</span>
          </button>

          {/* Exit Presentation Mode Button */}
          <button
            onClick={() => {
              audioFX.playClick();
              onClose();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl bg-red-950/40 hover:bg-red-900/60 border border-red-500/40 text-red-300 hover:text-white font-hud font-bold text-xs sm:text-sm tracking-wider shadow-[0_0_15px_rgba(239,68,68,0.25)] transition"
          >
            <X className="w-4 h-4" />
            <span>EXIT HUD</span>
          </button>
        </div>
      </div>

      {/* Presentation Content Workspace */}
      <div className="flex-1 overflow-auto p-3 sm:p-6 md:p-8 flex flex-col">
        {children}
      </div>

      {/* Reused Installation Modal */}
      <PWAInstallModal
        isOpen={isInstallModalOpen}
        onClose={() => setIsInstallModalOpen(false)}
        canDirectInstall={isInstallable}
        onDirectInstall={install}
        isInstalled={isInstalled}
        isIOS={isIOS}
      />
    </div>
  );
};
