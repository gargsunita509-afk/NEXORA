import React, { useState } from 'react';
import { Download, Upload, RefreshCw, X, Check, AlertTriangle, ShieldCheck } from 'lucide-react';
import { storage } from '../services/storage';
import { audioFX } from '../services/audio';

interface BackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDataRestored?: () => void;
}

export const BackupModal: React.FC<BackupModalProps> = ({
  isOpen,
  onClose,
  onDataRestored,
}) => {
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  if (!isOpen) return null;

  const handleExport = async () => {
    try {
      setIsExporting(true);
      audioFX.playClick();
      const json = await storage.exportAllData();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const dateStr = new Date().toISOString().split('T')[0];
      link.href = url;
      link.download = `ClassOS_AbhinavSchool_Backup_${dateStr}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setStatusMessage('Class OS database exported successfully.');
      setIsError(false);
    } catch (e: any) {
      setStatusMessage(`Export failed: ${e.message}`);
      setIsError(true);
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    audioFX.playClick();
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        const confirmRestore = window.confirm(
          'Are you sure you want to restore this backup? This will update the local timetable, diary, quizzes, and class records.'
        );
        if (!confirmRestore) return;

        const res = await storage.importAllData(content);
        if (res.success) {
          setStatusMessage(res.message);
          setIsError(false);
          audioFX.playSuccess();
          if (onDataRestored) onDataRestored();
        } else {
          setStatusMessage(res.message);
          setIsError(true);
          audioFX.playError();
        }
      } catch (err: any) {
        setStatusMessage(`Error parsing backup: ${err.message}`);
        setIsError(true);
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
  };

  const handleResetToDefaults = async () => {
    audioFX.playClick();
    await storage.resetToDefaults();
    setIsResetConfirmOpen(false);
    setStatusMessage('System reset to original Abhinav School Class 11th configuration.');
    setIsError(false);
    audioFX.playSuccess();
    if (onDataRestored) onDataRestored();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-2xl jarvis-panel border border-cyan-500/40 p-6 shadow-[0_0_40px_rgba(0,240,255,0.2)]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-cyan-500/20">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-hud font-bold text-lg text-white">
                DATABASE PERSISTENCE & BACKUP
              </h3>
              <p className="text-xs text-slate-400 font-sans">
                Class 11th • The Abhinav School
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              audioFX.playClick();
              onClose();
            }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60"
            aria-label="Close backup modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Message */}
        {statusMessage && (
          <div
            className={`mt-4 p-3 rounded-xl border text-xs font-mono-code flex items-start gap-2 ${
              isError
                ? 'bg-red-950/40 border-red-500/40 text-red-300'
                : 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
            }`}
          >
            {isError ? (
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <Check className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Actions Grid */}
        <div className="mt-5 space-y-3">
          {/* Export */}
          <div className="p-4 rounded-xl bg-cyan-950/20 border border-cyan-500/20 hover:border-cyan-400/40 transition">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-white font-hud">
                  Export Versioned JSON Backup
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Download all timetable edits, diary records, quizzes, and sketches.
                </p>
              </div>
              <button
                onClick={handleExport}
                disabled={isExporting}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-300 font-semibold text-xs transition"
              >
                <Download className="w-4 h-4" />
                <span>Export</span>
              </button>
            </div>
          </div>

          {/* Import */}
          <div className="p-4 rounded-xl bg-cyan-950/20 border border-cyan-500/20 hover:border-cyan-400/40 transition">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-white font-hud">
                  Restore From JSON Backup
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Safely load previous class records with schema verification.
                </p>
              </div>
              <label className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 border border-blue-400/40 text-blue-300 font-semibold text-xs cursor-pointer transition">
                <Upload className="w-4 h-4" />
                <span>Import</span>
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileImport}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Reset to Factory Defaults */}
          <div className="p-4 rounded-xl bg-red-950/10 border border-red-500/20 hover:border-red-500/40 transition">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-red-200 font-hud">
                  Reset to Original School Timetable
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Restores Alka Mam's standard Class 11 schedule and initial student list.
                </p>
              </div>
              {!isResetConfirmOpen ? (
                <button
                  onClick={() => setIsResetConfirmOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-950/40 hover:bg-red-900/50 border border-red-500/40 text-red-300 text-xs font-semibold transition"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Reset</span>
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleResetToDefaults}
                    className="px-2.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-xs"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => setIsResetConfirmOpen(false)}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-cyan-500/20 flex justify-end">
          <button
            onClick={() => {
              audioFX.playClick();
              onClose();
            }}
            className="px-5 py-2 rounded-xl bg-cyan-950/40 border border-cyan-500/40 text-cyan-300 font-hud text-xs font-bold hover:bg-cyan-900/50 transition"
          >
            CLOSE PANEL
          </button>
        </div>
      </div>
    </div>
  );
};
