import React, { useState } from 'react';
import { Download, Check, Sparkles, Smartphone } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useAppUpdate } from '../hooks/useAppUpdate';
import { PWAInstallModal } from './PWAInstallModal';
import { audioFX } from '../services/audio';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const { updateAvailable, isDismissed, isAndroid } = useAppUpdate();
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  const hasPendingUpdate = updateAvailable && !isDismissed;

  const handleClick = async () => {
    audioFX.playClick();
    // Always open modal to allow Android APK download, Smart Board selection, or update
    setIsModalOpen(true);
  };

  return (
    <>
      <button
        onClick={handleClick}
        title={
          hasPendingUpdate
            ? 'A new version of NEXORA is ready! Click to update.'
            : isInstalled
            ? 'NEXORA is installed (Click for APK & Smart Board tools)'
            : isAndroid
            ? 'Download NEXORA Android APK'
            : 'Install NEXORA on Smart Board, Laptop, or Tablet'
        }
        className={`p-2 sm:px-3 sm:py-1.5 rounded-lg border text-xs font-hud font-semibold flex items-center gap-1.5 transition cursor-pointer ${
          hasPendingUpdate
            ? 'bg-gradient-to-r from-purple-950/80 via-blue-950/80 to-cyan-950/80 border-cyan-400 text-cyan-200 shadow-[0_0_15px_rgba(0,240,255,0.4)] animate-pulse'
            : isInstalled
            ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300 hover:bg-emerald-900/40'
            : isAndroid
            ? 'bg-cyan-950/60 border-cyan-400/60 text-cyan-300 hover:border-cyan-300 hover:text-white shadow-[0_0_12px_rgba(0,240,255,0.25)]'
            : isInstallable
            ? 'bg-gradient-to-r from-cyan-950/60 to-blue-950/60 border-cyan-400/50 text-cyan-300 hover:border-cyan-300 hover:text-white shadow-[0_0_12px_rgba(0,240,255,0.25)]'
            : 'bg-cyan-950/30 border-cyan-500/30 text-cyan-400 hover:border-cyan-400/60 hover:text-cyan-200'
        }`}
        aria-label="Install or Update NEXORA"
      >
        {hasPendingUpdate ? (
          <>
            <Sparkles className="w-3.5 h-3.5 text-cyan-300 animate-spin" />
            <span className="font-hud font-bold text-white tracking-wide">UPDATE</span>
          </>
        ) : isInstalled ? (
          <>
            <Check className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden lg:inline text-[11px] font-mono-code">INSTALLED</span>
          </>
        ) : isAndroid ? (
          <>
            <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">GET APK</span>
          </>
        ) : (
          <>
            <Download className="w-3.5 h-3.5 text-cyan-400 animate-bounce" />
            <span className="hidden sm:inline">INSTALL</span>
          </>
        )}
      </button>

      <PWAInstallModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        canDirectInstall={isInstallable}
        onDirectInstall={install}
        isInstalled={isInstalled}
        isIOS={isIOS}
      />
    </>
  );
};
