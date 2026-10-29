import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Download,
  X,
  Monitor,
  Smartphone,
  Tablet,
  CheckCircle2,
  Tv,
  Maximize2,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  AlertCircle,
  FileCode,
} from 'lucide-react';
import { NexoraLogo } from './NexoraLogo';
import { audioFX } from '../services/audio';
import { useAppUpdate } from '../hooks/useAppUpdate';
import { isNativeAndroidApp } from '../services/updateService';

interface PWAInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
  canDirectInstall: boolean;
  onDirectInstall: () => Promise<boolean>;
  isInstalled: boolean;
  isIOS: boolean;
  onOpenPresentation?: () => void;
}

export const PWAInstallModal: React.FC<PWAInstallModalProps> = ({
  isOpen,
  onClose,
  canDirectInstall,
  onDirectInstall,
  isInstalled,
  isIOS,
  onOpenPresentation,
}) => {
  const {
    status,
    checkedAt,
    checkError,
    currentVersion,
    currentVersionCode,
    latestVersion,
    latestVersionCode,
    updateAvailable,
    releaseInfo,
    isDownloading,
    downloadProgress,
    downloadSuccess,
    downloadError,
    downloadAndInstall,
    applyWebUpdate,
    checkForUpdates,
    isChecking,
  } = useAppUpdate();

  const [activeTab, setActiveTab] = useState<'android' | 'smartboard' | 'pwa'>('android');
  const [copiedSha, setCopiedSha] = useState<boolean>(false);
  const [hasManuallyChecked, setHasManuallyChecked] = useState<boolean>(false);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const runningInNativeApk = isNativeAndroidApp();

  // Dynamically resolve portal target: attach to active fullscreen element if present, otherwise document.body
  useEffect(() => {
    const updateTarget = () => {
      if (typeof document === 'undefined') return;
      const fsElement = document.fullscreenElement as HTMLElement | null;
      setPortalTarget(fsElement || document.body);
    };

    updateTarget();
    document.addEventListener('fullscreenchange', updateTarget);
    return () => {
      document.removeEventListener('fullscreenchange', updateTarget);
    };
  }, []);

  // Prevent background body scrolling while modal is open
  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  // Handle ESC key to dismiss modal without leaving current page or exiting fullscreen
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        audioFX.playClick();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !portalTarget) return null;

  const handleDownloadAPK = async () => {
    audioFX.playClick();
    await downloadAndInstall();
  };

  const handlePWAInstallClick = async () => {
    audioFX.playClick();
    if (canDirectInstall) {
      const installed = await onDirectInstall();
      if (installed) {
        onClose();
      }
    }
  };

  const handleToggleFullscreen = () => {
    audioFX.playClick();
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const handleOpenSmartBoard = () => {
    audioFX.playClick();
    onClose();
    if (onOpenPresentation) {
      onOpenPresentation();
    } else if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  };

  const handleCopySha256 = () => {
    if (releaseInfo?.sha256) {
      navigator.clipboard.writeText(releaseInfo.sha256).catch(() => {});
      setCopiedSha(true);
      setTimeout(() => setCopiedSha(false), 2500);
    }
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 md:p-6 bg-black/85 backdrop-blur-md animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pwa-install-title"
      onClick={(e) => {
        // Dismiss when clicking the backdrop
        if (e.target === e.currentTarget) {
          audioFX.playClick();
          onClose();
        }
      }}
    >
      <div
        className="relative w-full max-w-xl my-auto rounded-3xl bg-[#060c20] border border-cyan-500/40 p-5 sm:p-6 shadow-[0_0_60px_rgba(0,240,255,0.25)] text-slate-100 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Holographic accent glow */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600" />
        <div className="absolute -top-16 -right-16 w-40 h-40 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Prominent, Accessible Close Button (Top-Right) */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            audioFX.playClick();
            onClose();
          }}
          className="absolute top-4 right-4 z-30 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-2xl bg-slate-900/90 hover:bg-red-950/80 border border-slate-700/80 hover:border-red-500/60 text-slate-300 hover:text-white shadow-lg transition active:scale-95 cursor-pointer group"
          aria-label="Close installation dialog"
          title="Close Dialog (Esc)"
        >
          <X className="w-5 h-5 text-cyan-400 group-hover:text-red-300 transition" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3.5 mb-4 shrink-0 pr-12">
          <NexoraLogo size={44} glow={true} />
          <div>
            <div className="flex items-center gap-2">
              <h2 id="pwa-install-title" className="font-hud font-extrabold text-lg sm:text-xl text-white">
                INSTALL NEXORA
              </h2>
              <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 text-[10px] font-mono-code font-bold">
                v{currentVersion}
              </span>
            </div>
            <p className="text-xs text-cyan-400 font-mono-code mt-0.5">
              Genuine Android APK • Classroom Smart Board • PWA Matrix
            </p>
          </div>
        </div>

        {/* Platform Tabs */}
        <div className="flex items-center p-1 rounded-xl bg-slate-950/90 border border-cyan-500/20 mb-4 shrink-0">
          <button
            onClick={() => {
              audioFX.playClick();
              setActiveTab('android');
            }}
            className={`flex-1 py-2 px-2.5 rounded-lg font-hud text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'android'
                ? 'bg-cyan-500 text-black shadow-[0_0_12px_rgba(0,240,255,0.4)]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>ANDROID APK</span>
          </button>

          <button
            onClick={() => {
              audioFX.playClick();
              setActiveTab('smartboard');
            }}
            className={`flex-1 py-2 px-2.5 rounded-lg font-hud text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'smartboard'
                ? 'bg-cyan-500 text-black shadow-[0_0_12px_rgba(0,240,255,0.4)]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Tv className="w-3.5 h-3.5" />
            <span>SMART BOARD</span>
          </button>

          <button
            onClick={() => {
              audioFX.playClick();
              setActiveTab('pwa');
            }}
            className={`flex-1 py-2 px-2.5 rounded-lg font-hud text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'pwa'
                ? 'bg-cyan-500 text-black shadow-[0_0_12px_rgba(0,240,255,0.4)]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>BROWSER / PWA</span>
          </button>
        </div>

        {/* Scrollable Tab Body */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1 min-h-0">
          {/* TAB 1: ANDROID APK */}
          {activeTab === 'android' && (
            <div className="space-y-4">
              {/* Primary APK Download Card */}
              <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-cyan-950/40 via-slate-950 to-blue-950/30 border border-cyan-400/40 shadow-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="p-2 rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-400/40">
                      <Smartphone className="w-5 h-5" />
                    </span>
                    <div>
                      <h3 className="font-hud font-bold text-sm sm:text-base text-white">
                        Official NEXORA Android APK
                      </h3>
                      <p className="text-[11px] font-mono-code text-cyan-400">
                        Package: com.theabhinavschool.nexora
                      </p>
                    </div>
                  </div>

                  <span className="text-[11px] font-mono-code px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold">
                    GENUINE SIGNED APK
                  </span>
                </div>

                {/* Download Progress */}
                {isDownloading && (
                  <div className="p-3 rounded-xl bg-cyan-950/60 border border-cyan-500/40 space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-mono-code text-cyan-300">
                      <span className="flex items-center gap-1.5">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Downloading NEXORA APK...</span>
                      </span>
                      <span>{downloadProgress}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-900 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all duration-150"
                        style={{ width: `${downloadProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Download Success Banner */}
                {downloadSuccess && (
                  <div className="p-3 rounded-xl bg-emerald-950/50 border border-emerald-500/50 text-xs text-emerald-200 flex items-start gap-2.5 animate-in fade-in">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="font-hud font-bold text-white block">APK Downloaded — Ready to Install</strong>
                      <span>
                        Swipe down notifications or open your <strong>Downloads</strong> folder, tap{' '}
                        <strong>nexora-v{releaseInfo?.version || latestVersion}.apk</strong>, and confirm{' '}
                        <strong>Install / Update</strong> on Android.
                      </span>
                    </div>
                  </div>
                )}

                {/* Error Banner */}
                {downloadError && (
                  <div className="p-3 rounded-xl bg-red-950/50 border border-red-500/50 text-xs text-red-200 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                    <span>{downloadError}</span>
                  </div>
                )}

                {/* Action Button: If already running inside installed Android APK with no update, show Installed status */}
                {runningInNativeApk && !updateAvailable ? (
                  <div className="p-3.5 rounded-xl bg-emerald-950/50 border border-emerald-500/40 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                      <div>
                        <div className="font-hud font-bold text-xs sm:text-sm text-emerald-300 uppercase">
                          Native Android App Installed (v{currentVersion})
                        </div>
                        <div className="text-[11px] font-mono-code text-slate-300">
                          You are running the latest installed NEXORA APK.
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={handleDownloadAPK}
                    disabled={isDownloading}
                    className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:brightness-110 active:scale-[0.98] text-white font-hud font-bold text-sm tracking-wider uppercase flex items-center justify-center gap-2.5 shadow-[0_0_25px_rgba(0,240,255,0.4)] disabled:opacity-50 transition cursor-pointer"
                  >
                    {isDownloading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>DOWNLOADING ({downloadProgress}%)...</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" />
                        <span>
                          {runningInNativeApk ? 'DOWNLOAD UPDATE APK' : 'DOWNLOAD ANDROID APK'} v{releaseInfo?.version || latestVersion} ({releaseInfo?.apkSize || '820K'})
                        </span>
                      </>
                    )}
                  </button>
                )}

                {/* Metadata & Verification */}
                <div className="pt-2 border-t border-cyan-500/15 flex flex-wrap items-center justify-between gap-2 text-[10.5px] font-mono-code text-slate-400">
                  <span className="flex items-center gap-1 text-emerald-400">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>RSA 2048-bit Signed &amp; Verified</span>
                  </span>
                  <span>Android 5.0+ (Lollipop to Android 15+)</span>
                </div>
              </div>

              {/* SHA-256 Checksum Card */}
              {releaseInfo?.sha256 && (
                <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-mono-code text-slate-400">
                    <span>SHA-256 File Checksum:</span>
                    <button
                      onClick={handleCopySha256}
                      className="text-cyan-400 hover:text-cyan-300 font-bold cursor-pointer"
                    >
                      {copiedSha ? 'COPIED!' : 'COPY'}
                    </button>
                  </div>
                  <p className="font-mono-code text-[10px] text-slate-300 break-all select-all bg-black/40 p-2 rounded-lg border border-slate-800">
                    {releaseInfo.sha256}
                  </p>
                </div>
              )}

              {/* Step by Step Android Installation Guide */}
              <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
                <h4 className="font-hud font-bold text-xs text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
                  <FileCode className="w-3.5 h-3.5" />
                  <span>Installation Steps on Android</span>
                </h4>
                <ol className="text-xs text-slate-300 space-y-1.5 list-decimal list-inside font-sans leading-relaxed">
                  <li>Click <strong>Download Android APK</strong> above.</li>
                  <li>When prompted by browser, tap <strong>Download anyway</strong>.</li>
                  <li>Tap the downloaded file from your notification bar or <strong>Downloads</strong> app.</li>
                  <li>If asked, enable <em>&quot;Allow from this source&quot;</em> for your browser.</li>
                  <li>Tap <strong>Install</strong> to add NEXORA directly to your app launcher.</li>
                </ol>
              </div>
            </div>
          )}

          {/* TAB 2: SMART BOARD */}
          {activeTab === 'smartboard' && (
            <div className="space-y-3.5">
              <div className="p-4 rounded-2xl bg-slate-900/70 border border-cyan-500/30 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-hud font-bold text-xs sm:text-sm text-cyan-300">
                    <Tv className="w-4 h-4 text-cyan-400" />
                    <span>Interactive Flat Panels &amp; Classroom Smart Boards</span>
                  </div>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed font-sans">
                  Optimized for ViewSonic ViewBoard, Promethean, MAXHUB, BenQ, Samsung Flip, and all Android or Windows smart boards.
                </p>

                {/* If smart board runs Android, direct APK button */}
                <button
                  onClick={handleDownloadAPK}
                  disabled={isDownloading}
                  className="w-full py-2.5 px-3 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/60 text-cyan-300 hover:text-white font-hud font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download APK for Android Smart Board ({releaseInfo?.apkSize || '605K'})</span>
                </button>

                {canDirectInstall && !isInstalled && (
                  <button
                    onClick={handlePWAInstallClick}
                    className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-hud font-bold text-xs flex items-center justify-center gap-2 shadow-md transition cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Install via Smart Board Browser (PWA)</span>
                  </button>
                )}

                <div className="pt-1 flex gap-2">
                  <button
                    onClick={handleToggleFullscreen}
                    className="flex-1 py-2 px-3 rounded-xl bg-cyan-950/60 border border-cyan-400/40 text-cyan-300 text-xs font-hud font-semibold flex items-center justify-center gap-1.5 hover:bg-cyan-900/40 transition cursor-pointer"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                    <span>Toggle Borderless Fullscreen</span>
                  </button>
                  {onOpenPresentation && (
                    <button
                      onClick={handleOpenSmartBoard}
                      className="py-2 px-3 rounded-xl bg-blue-950/60 border border-blue-400/40 text-blue-300 text-xs font-hud font-semibold flex items-center justify-center gap-1.5 hover:bg-blue-900/40 transition cursor-pointer"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Launch 16:9 HUD</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: BROWSER / PWA */}
          {activeTab === 'pwa' && (
            <div className="space-y-3.5">
              {isInstalled ? (
                <div className="p-4 rounded-2xl bg-emerald-950/50 border border-emerald-500/40 space-y-2">
                  <div className="flex items-center gap-2 text-xs text-emerald-300 font-bold font-hud">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>NEXORA IS ALREADY INSTALLED</span>
                  </div>
                  <p className="text-xs text-slate-200 leading-relaxed font-sans">
                    NEXORA is installed in standalone mode. Tap the NEXORA icon on your home screen or desktop to launch.
                  </p>
                </div>
              ) : canDirectInstall ? (
                <div className="p-4 rounded-2xl bg-slate-900/70 border border-cyan-500/30 space-y-3">
                  <h4 className="font-hud font-bold text-sm text-white">
                    Direct Browser Installation
                  </h4>
                  <p className="text-xs text-slate-300 font-sans">
                    Chrome, Edge, and Chromium-based browsers support 1-click standalone installation.
                  </p>
                  <button
                    onClick={handlePWAInstallClick}
                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-hud font-bold text-xs tracking-wider uppercase flex items-center justify-center gap-2 shadow-lg hover:brightness-110 transition cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Install PWA to Desktop / Launcher</span>
                  </button>
                </div>
              ) : (
                <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2 text-xs text-slate-300">
                  <h4 className="font-hud font-bold text-cyan-300">
                    Desktop &amp; Laptop (Chrome / Edge / Brave):
                  </h4>
                  <p>
                    Look for the <strong>Install App (⊕)</strong> icon on the right side of the address bar, or click Menu <strong>(⋮) ➔ Save and share ➔ Install NEXORA</strong>.
                  </p>
                </div>
              )}

              {isIOS && (
                <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-purple-500/30 space-y-1.5 text-xs text-slate-300">
                  <div className="flex items-center gap-2 font-hud font-bold text-purple-300">
                    <Tablet className="w-4 h-4 text-purple-400" />
                    <span>iPhone &amp; iPad (Safari)</span>
                  </div>
                  <p>
                    1. Tap the <strong>Share</strong> button in Safari toolbar.<br />
                    2. Scroll down and tap <strong>Add to Home Screen</strong>.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Live Update Check Feedback Banner */}
        {hasManuallyChecked && (
          <div className="mt-3 shrink-0">
            {isChecking && (
              <div className="p-2.5 rounded-xl bg-cyan-950/50 border border-cyan-500/40 text-xs text-cyan-200 flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 text-cyan-400 animate-spin shrink-0" />
                <span>Checking release server for updates (Installed: v{currentVersion})...</span>
              </div>
            )}

            {!isChecking && status === 'error' && checkError && (
              <div className="p-2.5 rounded-xl bg-red-950/50 border border-red-500/50 text-xs text-red-200 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                  <span>{checkError}</span>
                </div>
                <button
                  onClick={() => checkForUpdates(true)}
                  className="px-2.5 py-1 rounded bg-red-500/20 hover:bg-red-500/30 border border-red-400/50 text-white font-hud text-[10px] font-bold uppercase shrink-0 cursor-pointer"
                >
                  Retry
                </button>
              </div>
            )}

            {!isChecking && status === 'update_available' && updateAvailable && (
              <div className="p-3 rounded-xl bg-cyan-950/60 border border-cyan-400/60 text-xs text-cyan-100 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <strong className="font-hud text-cyan-300">
                    New Version Available: v{latestVersion} (Build {latestVersionCode})
                  </strong>
                  {checkedAt && <span className="text-[10px] font-mono-code text-slate-400">{checkedAt}</span>}
                </div>
                {releaseInfo?.releaseNotes && (
                  <p className="text-[11px] text-slate-300 font-sans">{releaseInfo.releaseNotes}</p>
                )}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDownloadAPK}
                    disabled={isDownloading}
                    className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black font-hud text-[11px] font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3 h-3" />
                    <span>Download Update APK</span>
                  </button>
                  <button
                    onClick={applyWebUpdate}
                    className="px-3 py-1.5 rounded-lg bg-slate-900 border border-cyan-500/40 text-cyan-300 font-hud text-[11px] font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Reload Web App</span>
                  </button>
                </div>
              </div>
            )}

            {!isChecking && status === 'up_to_date' && !updateAvailable && (
              <div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-xs text-emerald-200 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    <strong className="text-white font-hud">You&apos;re using the latest version.</strong>{' '}
                    <span className="text-[11px] font-mono-code text-emerald-300">
                      (v{currentVersion} • Build {currentVersionCode})
                    </span>
                  </span>
                </div>
                {checkedAt && (
                  <span className="text-[10px] font-mono-code text-emerald-300/80 shrink-0">
                    {checkedAt}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Footer info & Dismiss */}
        <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2 text-[11px] font-mono-code text-slate-400 shrink-0">
          <button
            onClick={() => {
              setHasManuallyChecked(true);
              checkForUpdates(true);
            }}
            disabled={isChecking}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-cyan-950/40 hover:bg-cyan-900/50 border border-cyan-500/30 text-cyan-300 hover:text-white cursor-pointer disabled:opacity-50 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
            <span>{isChecking ? 'Checking Updates...' : 'Check for Updates'}</span>
          </button>

          <div className="flex items-center gap-2.5">
            <span className="text-slate-400 hidden xs:inline">
              Installed: v{currentVersion} (Latest: v{latestVersion})
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                audioFX.playClick();
                onClose();
              }}
              className="px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 hover:border-cyan-500/50 text-slate-300 hover:text-white font-hud text-xs font-bold transition cursor-pointer"
            >
              CLOSE
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, portalTarget);
};
