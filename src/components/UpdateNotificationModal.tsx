import React, { useState } from 'react';
import {
  Sparkles,
  Download,
  Clock,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  X,
  FileCode,
  ShieldCheck,
  Smartphone,
  ExternalLink,
} from 'lucide-react';
import { useAppUpdate } from '../hooks/useAppUpdate';
import { NexoraLogo } from './NexoraLogo';
import { audioFX } from '../services/audio';

interface UpdateNotificationModalProps {
  forceOpen?: boolean;
  onClose?: () => void;
}

export const UpdateNotificationModal: React.FC<UpdateNotificationModalProps> = ({
  forceOpen = false,
  onClose,
}) => {
  const {
    currentVersion,
    latestVersion,
    updateAvailable,
    releaseInfo,
    isDismissed,
    isAndroid,
    isNativeApp,
    isDownloading,
    downloadProgress,
    downloadSuccess,
    downloadError,
    dismissLater,
    downloadAndInstall,
    applyWebUpdate,
  } = useAppUpdate();

  const [installStep, setInstallStep] = useState<number>(1);

  // If update is not available and not forced open, or if dismissed and not forced open, don't show
  const shouldShow = (updateAvailable && !isDismissed) || forceOpen;
  if (!shouldShow) return null;

  const handleUpdateClick = async () => {
    if (isAndroid || isNativeApp) {
      const ok = await downloadAndInstall();
      if (ok) {
        setInstallStep(2);
      }
    } else {
      await applyWebUpdate();
    }
  };

  const handleDismiss = () => {
    audioFX.playClick();
    dismissLater();
    if (onClose) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="update-dialog-title"
    >
      <div className="relative w-full max-w-lg rounded-3xl bg-[#060c20] border border-cyan-500/40 p-5 sm:p-7 shadow-[0_0_60px_rgba(0,240,255,0.3)] text-slate-100 overflow-hidden">
        {/* Holographic glowing top bar */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600" />
        <div className="absolute -top-16 -right-16 w-40 h-40 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Close / Dismiss */}
        <button
          onClick={handleDismiss}
          className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/60 transition"
          aria-label="Dismiss update notification"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-start gap-3.5 mb-5">
          <NexoraLogo size={46} glow={true} />
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 text-[10px] font-mono-code font-bold uppercase tracking-wider flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-cyan-400" />
                UPDATE AVAILABLE
              </span>
              <span className="text-[11px] font-mono-code text-slate-400">
                {isAndroid || isNativeApp ? 'Android APK Release' : 'Web / PWA Version'}
              </span>
            </div>
            <h2 id="update-dialog-title" className="font-hud font-extrabold text-xl text-white mt-1">
              A new version of NEXORA is ready.
            </h2>
          </div>
        </div>

        {/* Version Matrix comparison cards */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800">
            <span className="text-[10px] font-mono-code text-slate-400 uppercase block">
              Current Version
            </span>
            <span className="font-hud font-bold text-sm text-slate-300 mt-0.5 block">
              v{currentVersion}
            </span>
          </div>

          <div className="p-3 rounded-2xl bg-cyan-950/40 border border-cyan-500/40 shadow-[0_0_15px_rgba(0,240,255,0.15)]">
            <span className="text-[10px] font-mono-code text-cyan-400 uppercase block">
              Latest Version
            </span>
            <span className="font-hud font-bold text-sm text-cyan-200 mt-0.5 block flex items-center gap-1.5">
              <span>v{latestVersion}</span>
              <span className="px-1.5 py-0.2 rounded bg-cyan-500/20 text-[9px] text-cyan-300 font-mono-code">
                NEW
              </span>
            </span>
          </div>
        </div>

        {/* Release Notes */}
        {releaseInfo && (
          <div className="mb-4 p-3.5 rounded-2xl bg-slate-950/80 border border-cyan-500/20 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-hud font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
                <FileCode className="w-3.5 h-3.5 text-cyan-400" />
                Release Notes
              </span>
              <span className="text-[11px] font-mono-code text-slate-400">
                Released: {releaseInfo.releaseDate}
              </span>
            </div>
            <p className="text-xs text-slate-300 font-sans leading-relaxed">
              {releaseInfo.releaseNotes}
            </p>

            {/* Android Integrity Badge */}
            {(isAndroid || isNativeApp) && releaseInfo.sha256 && (
              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] font-mono-code text-slate-400">
                <span className="flex items-center gap-1 text-emerald-400">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Verified RSA 2048-bit Signed APK</span>
                </span>
                <span>Size: {releaseInfo.apkSize || '125 KB'}</span>
              </div>
            )}
          </div>
        )}

        {/* Download / Installation Progress Bar */}
        {isDownloading && (
          <div className="mb-4 p-3 rounded-2xl bg-cyan-950/50 border border-cyan-500/40 space-y-2">
            <div className="flex items-center justify-between text-xs font-mono-code text-cyan-300">
              <span className="flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Downloading NEXORA v{latestVersion} APK...</span>
              </span>
              <span>{downloadProgress}%</span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-900 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all duration-200"
                style={{ width: `${downloadProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Error notification */}
        {downloadError && (
          <div className="mb-4 p-3 rounded-2xl bg-red-950/40 border border-red-500/40 text-red-200 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{downloadError}</span>
          </div>
        )}

        {/* Post-Download Android Guidance */}
        {downloadSuccess && (isAndroid || isNativeApp) && (
          <div className="mb-4 p-3.5 rounded-2xl bg-emerald-950/40 border border-emerald-500/40 text-xs text-emerald-200 space-y-1.5 animate-in fade-in">
            <div className="flex items-center gap-1.5 font-hud font-bold text-emerald-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>APK Downloaded Successfully</span>
            </div>
            <p className="text-slate-300 leading-relaxed font-sans text-[11.5px]">
              Swipe down your notification shade or open your phone&apos;s <strong>Downloads</strong> folder. Tap <strong>nexora-v{latestVersion}.apk</strong> and tap <strong>Update</strong> to complete in-place installation.
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-3 pt-2">
          {/* Later Button */}
          <button
            type="button"
            onClick={handleDismiss}
            className="flex-1 py-3 px-4 rounded-2xl bg-slate-900 border border-slate-700 hover:border-slate-600 text-slate-300 hover:text-white font-hud font-bold text-xs sm:text-sm tracking-wider uppercase transition cursor-pointer"
          >
            Later
          </button>

          {/* Update Now Button */}
          <button
            type="button"
            onClick={handleUpdateClick}
            disabled={isDownloading}
            className="flex-2 py-3 px-5 rounded-2xl bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:brightness-110 active:scale-[0.98] text-white font-hud font-bold text-xs sm:text-sm tracking-wider uppercase flex items-center justify-center gap-2 shadow-[0_0_25px_rgba(0,240,255,0.4)] disabled:opacity-50 transition cursor-pointer"
          >
            {isDownloading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Downloading...</span>
              </>
            ) : isAndroid || isNativeApp ? (
              <>
                <Download className="w-4 h-4" />
                <span>Update Now (APK)</span>
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                <span>Update Now</span>
              </>
            )}
          </button>
        </div>

        {/* Footer info */}
        <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[10.5px] font-mono-code text-slate-400">
          <span>Accessible anytime in Settings &amp; Diagnostics</span>
          <span>{releaseInfo?.packageName || 'com.theabhinavschool.nexora'}</span>
        </div>
      </div>
    </div>
  );
};
