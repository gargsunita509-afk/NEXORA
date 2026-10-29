import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  CheckCircle,
  XCircle,
  X,
  RefreshCw,
  Smartphone,
  Download,
  FileCode,
  AlertCircle,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { runAllVerificationTests, TestResult } from '../utils/tests';
import { audioFX } from '../services/audio';
import { useAppUpdate } from '../hooks/useAppUpdate';

interface DiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DiagnosticsModal: React.FC<DiagnosticsModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'tests' | 'apk'>('tests');
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<TestResult[]>([]);
  const [lastRunTime, setLastRunTime] = useState<string | null>(null);
  const [hasManuallyChecked, setHasManuallyChecked] = useState(false);

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
    checkForUpdates,
    isChecking,
    downloadAndInstall,
    applyWebUpdate,
    isDownloading,
    downloadProgress,
    downloadSuccess,
    downloadError,
  } = useAppUpdate();

  const executeTests = async () => {
    setIsRunning(true);
    audioFX.playClick();
    try {
      const res = await runAllVerificationTests();
      setResults(res);
      setLastRunTime(new Date().toLocaleTimeString());
      const allPassed = res.every((r) => r.passed);
      if (allPassed) {
        audioFX.playSuccess();
      } else {
        audioFX.playError();
      }
    } finally {
      setIsRunning(false);
    }
  };

  useEffect(() => {
    if (isOpen && results.length === 0) {
      executeTests();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = total - passed;

  const handleManualUpdateCheck = async () => {
    setHasManuallyChecked(true);
    await checkForUpdates(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl jarvis-panel border border-cyan-500/40 p-4 sm:p-6 shadow-[0_0_50px_rgba(0,240,255,0.25)]">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-cyan-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
              <ShieldCheck className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h3 className="font-hud font-bold text-lg sm:text-xl text-white">
                CLASS OS VERIFICATION &amp; RELEASES
              </h3>
              <p className="text-xs text-slate-400 font-sans">
                System Integrity Verification • Official APK &amp; Update Status
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              audioFX.playClick();
              onClose();
            }}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition cursor-pointer"
            aria-label="Close diagnostics"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sub-tabs */}
        <div className="flex items-center gap-2 mt-3 pb-2 border-b border-cyan-500/10">
          <button
            onClick={() => {
              audioFX.playClick();
              setActiveTab('tests');
            }}
            className={`px-3 py-1.5 rounded-lg font-hud text-xs font-bold transition cursor-pointer ${
              activeTab === 'tests'
                ? 'bg-cyan-500 text-black shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            CORE VERIFICATION ({passed}/{total || 40})
          </button>
          <button
            onClick={() => {
              audioFX.playClick();
              setActiveTab('apk');
            }}
            className={`px-3 py-1.5 rounded-lg font-hud text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'apk'
                ? 'bg-cyan-500 text-black shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>ANDROID APK &amp; UPDATES</span>
          </button>
        </div>

        {/* TAB 1: TESTS */}
        {activeTab === 'tests' && (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Status Bar */}
            <div className="mt-3 p-3 rounded-xl bg-cyan-950/30 border border-cyan-500/20 flex flex-wrap items-center justify-between gap-3 text-xs font-mono-code shrink-0">
              <div className="flex items-center gap-4">
                <span className="text-slate-300">
                  Total Tests: <strong className="text-white">{total || 40}</strong>
                </span>
                <span className="text-emerald-400">
                  Passed: <strong>{passed}</strong>
                </span>
                {failed > 0 && (
                  <span className="text-red-400">
                    Failed: <strong>{failed}</strong>
                  </span>
                )}
                {lastRunTime && (
                  <span className="text-slate-400 hidden sm:inline">
                    Last Run: {lastRunTime}
                  </span>
                )}
              </div>

              <button
                onClick={executeTests}
                disabled={isRunning}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-300 font-semibold transition cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRunning ? 'animate-spin' : ''}`} />
                <span>{isRunning ? 'Verifying...' : 'Re-Run All Checks'}</span>
              </button>
            </div>

            {/* Test List */}
            <div className="mt-3 flex-1 overflow-y-auto space-y-2 pr-1">
              {results.map((res) => (
                <div
                  key={res.id}
                  className={`p-3 rounded-xl border flex items-start justify-between gap-3 transition ${
                    res.passed
                      ? 'bg-cyan-950/20 border-cyan-500/20 hover:border-cyan-400/30'
                      : 'bg-red-950/30 border-red-500/40'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      {res.passed ? (
                        <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white font-hud">
                          #{res.id} {res.name}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800/80 text-cyan-300 font-mono-code">
                          {res.category}
                        </span>
                      </div>
                      <p
                        className={`text-xs mt-0.5 font-sans ${
                          res.passed ? 'text-slate-400' : 'text-red-300 font-medium'
                        }`}
                      >
                        {res.message}
                      </p>
                    </div>
                  </div>

                  <div className="text-[11px] font-mono-code text-slate-500 shrink-0">
                    {res.durationMs}ms
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 2: ANDROID APK & RELEASES */}
        {activeTab === 'apk' && (
          <div className="flex-1 overflow-y-auto mt-3 space-y-4 pr-1">
            {/* Live APK Status */}
            <div className="p-4 rounded-xl bg-slate-950/80 border border-cyan-500/30 space-y-3.5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h4 className="font-hud font-bold text-sm text-white">
                    Official Android Release APK
                  </h4>
                  <p className="text-[11px] font-mono-code text-cyan-400">
                    Application ID: com.theabhinavschool.nexora
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-lg bg-slate-900 text-slate-300 border border-slate-700 font-mono-code text-xs">
                    Installed: v{currentVersion} (Code {currentVersionCode})
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono-code text-xs font-bold">
                    Latest: v{latestVersion} (Code {latestVersionCode})
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono-code">
                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">APK Size</span>
                  <strong className="text-white">{releaseInfo?.apkSize || '605K'}</strong>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Sign Scheme</span>
                  <strong className="text-emerald-400">v1 + v2 + v3</strong>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Target SDK</span>
                  <strong className="text-white">API 33 (Android 13)</strong>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Min SDK</span>
                  <strong className="text-white">API 21 (Android 5.0)</strong>
                </div>
              </div>

              {/* SHA-256 */}
              {releaseInfo?.sha256 && (
                <div className="text-[10px] font-mono-code text-slate-400 bg-black/40 p-2.5 rounded-lg border border-slate-800/80">
                  <span className="text-cyan-400 font-bold">SHA-256: </span>
                  <span className="text-slate-300 break-all select-all font-mono">
                    {releaseInfo.sha256}
                  </span>
                </div>
              )}

              {/* Download Progress */}
              {isDownloading && (
                <div className="p-3 rounded-xl bg-cyan-950/60 border border-cyan-500/40 space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-mono-code text-cyan-300">
                    <span className="flex items-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Downloading NEXORA v{latestVersion} APK...</span>
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

              {/* Download Success Feedback */}
              {downloadSuccess && (
                <div className="p-3 rounded-xl bg-emerald-950/50 border border-emerald-500/50 text-xs text-emerald-200 flex items-start gap-2.5 animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-hud font-bold text-white block">
                      APK Download Complete (v{latestVersion})
                    </strong>
                    <span>
                      Open your device notifications or <strong>Downloads</strong> folder, tap{' '}
                      <strong>nexora-v{latestVersion}.apk</strong>, and confirm <strong>Install / Update</strong>. Because it uses the same package ID and signing certificate with versionCode {latestVersionCode}, Android upgrades your existing app in-place without erasing data.
                    </span>
                  </div>
                </div>
              )}

              {/* Download Error Feedback */}
              {downloadError && (
                <div className="p-3 rounded-xl bg-red-950/50 border border-red-500/50 text-xs text-red-200 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                    <span>{downloadError}</span>
                  </div>
                  <button
                    onClick={downloadAndInstall}
                    className="px-2.5 py-1 rounded bg-red-500/20 hover:bg-red-500/30 border border-red-400/40 text-red-200 font-hud text-[10px] font-bold uppercase shrink-0 cursor-pointer"
                  >
                    Retry Download
                  </button>
                </div>
              )}

              {/* Primary Action Buttons */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={downloadAndInstall}
                  disabled={isDownloading}
                  className="flex-1 py-2.5 px-3 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-black font-hud text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>
                    {isDownloading
                      ? `Downloading (${downloadProgress}%)...`
                      : `Download Latest APK (v${latestVersion})`}
                  </span>
                </button>
                <button
                  onClick={handleManualUpdateCheck}
                  disabled={isChecking}
                  className="py-2.5 px-4 rounded-lg bg-slate-900 border border-cyan-500/40 hover:border-cyan-400 text-cyan-300 hover:text-white disabled:opacity-50 font-hud text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
                  <span>{isChecking ? 'Checking...' : 'Check Updates'}</span>
                </button>
              </div>

              {/* Real-Time Update Check Result Banner */}
              {isChecking && (
                <div className="p-3 rounded-xl bg-cyan-950/40 border border-cyan-500/40 text-xs text-cyan-200 flex items-center gap-2.5 animate-in fade-in">
                  <RefreshCw className="w-4 h-4 text-cyan-400 animate-spin shrink-0" />
                  <span>Contacting release server and comparing installed version (v{currentVersion})...</span>
                </div>
              )}

              {!isChecking && status === 'error' && checkError && (
                <div className="p-3.5 rounded-xl bg-red-950/50 border border-red-500/50 text-xs text-red-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in">
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="font-hud font-bold text-white block">
                        Update Check Failed
                      </strong>
                      <span className="text-red-200">{checkError}</span>
                    </div>
                  </div>
                  <button
                    onClick={handleManualUpdateCheck}
                    className="px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-400/50 text-white font-hud text-xs font-bold uppercase shrink-0 cursor-pointer flex items-center gap-1.5 self-start sm:self-center"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Retry</span>
                  </button>
                </div>
              )}

              {!isChecking && status === 'update_available' && updateAvailable && (
                <div className="p-4 rounded-xl bg-cyan-950/50 border border-cyan-400/60 text-xs text-cyan-100 space-y-2.5 animate-in fade-in">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="font-hud font-bold text-sm text-cyan-300 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-cyan-400" />
                      <span>Update Available: v{latestVersion} (Build {latestVersionCode})</span>
                    </span>
                    {checkedAt && (
                      <span className="text-[10px] font-mono-code text-slate-400">
                        Checked at {checkedAt}
                      </span>
                    )}
                  </div>
                  {releaseInfo?.releaseNotes && (
                    <p className="text-slate-300 font-sans leading-relaxed">
                      {releaseInfo.releaseNotes}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      onClick={downloadAndInstall}
                      disabled={isDownloading}
                      className="px-3.5 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black font-hud text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download Update APK (v{latestVersion})</span>
                    </button>
                    <button
                      onClick={applyWebUpdate}
                      className="px-3.5 py-2 rounded-lg bg-slate-900 border border-cyan-500/40 hover:border-cyan-400 text-cyan-300 font-hud text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Reload Web App</span>
                    </button>
                  </div>
                </div>
              )}

              {!isChecking && status === 'up_to_date' && !updateAvailable && (hasManuallyChecked || checkedAt) && (
                <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-xs text-emerald-200 flex items-start gap-2.5 animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <strong className="font-hud font-bold text-white">
                        You&apos;re using the latest version.
                      </strong>
                      {checkedAt && (
                        <span className="text-[10px] font-mono-code text-emerald-300/80">
                          Checked at {checkedAt}
                        </span>
                      )}
                    </div>
                    <p className="text-slate-300 mt-0.5 font-mono-code text-[11px]">
                      Installed: v{currentVersion} (Build {currentVersionCode}) • Latest Published: v{latestVersion} (Build {latestVersionCode})
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Release Notes & Upgrade Compatibility Information */}
            {releaseInfo && (
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-hud font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
                    <FileCode className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Published Release Notes (v{releaseInfo.version})</span>
                  </span>
                  <span className="text-[11px] font-mono-code text-slate-400">
                    Released: {releaseInfo.releaseDate}
                  </span>
                </div>
                <p className="text-xs text-slate-300 font-sans leading-relaxed">
                  {releaseInfo.releaseNotes}
                </p>
                <div className="pt-2 border-t border-slate-800/80 text-[11px] text-slate-400 font-sans">
                  <strong className="text-slate-200">In-Place Android Upgrade Note:</strong> If you previously installed an older APK (such as v1.0.0), download the latest APK above and tap <strong>Install / Update</strong> when Android prompts for confirmation. Because it shares the same package ID (<code className="text-cyan-400">com.theabhinavschool.nexora</code>) and signing key with a higher version code, Android updates your existing app without losing saved data.
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="mt-4 pt-3 border-t border-cyan-500/20 flex items-center justify-between shrink-0">
          <span className="text-[11px] font-mono-code text-slate-400">
            NEXORA Verification &amp; Release Monitor • The Abhinav School
          </span>
          <button
            onClick={() => {
              audioFX.playClick();
              onClose();
            }}
            className="px-4 py-2 rounded-xl bg-cyan-950/40 border border-cyan-500/40 text-cyan-300 font-hud text-xs font-bold hover:bg-cyan-900/50 transition cursor-pointer"
          >
            DISMISS
          </button>
        </div>
      </div>
    </div>
  );
};
