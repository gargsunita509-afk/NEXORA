import React, { useEffect } from 'react';
import { WifiOff, AlertTriangle, X } from 'lucide-react';
import { audioFX } from '../services/audio';

interface OfflineWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  featureName?: string;
}

export const OfflineWarningModal: React.FC<OfflineWarningModalProps> = ({
  isOpen,
  onClose,
  featureName,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="offline-dialog-title"
      aria-describedby="offline-dialog-desc"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-2xl bg-gradient-to-br from-amber-950/90 via-slate-900/95 to-slate-950 border border-amber-500/50 p-6 text-white shadow-[0_0_40px_rgba(245,158,11,0.25)]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => {
            audioFX.playClick();
            onClose();
          }}
          className="absolute top-4 right-4 p-1.5 rounded-lg bg-black/40 hover:bg-black/70 text-slate-400 hover:text-white border border-slate-700/50 transition cursor-pointer"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0 shadow-[0_0_15px_rgba(245,158,11,0.3)]">
            <WifiOff className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <span className="text-[10px] font-mono-code uppercase tracking-widest text-amber-400 font-bold">
              {featureName ? `${featureName.toUpperCase()} • ` : ''}CONNECTION REQUIRED
            </span>
            <h3 id="offline-dialog-title" className="font-hud font-bold text-lg text-white">
              Internet Required
            </h3>
          </div>
        </div>

        {/* Exact required warning text */}
        <div className="p-4 rounded-xl bg-black/50 border border-amber-500/30 mb-5">
          <p id="offline-dialog-desc" className="text-sm font-sans text-amber-100 font-medium leading-relaxed">
            No internet access. Connect to the internet and try again.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => {
              audioFX.playClick();
              onClose();
            }}
            className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-hud font-bold text-xs uppercase tracking-wider transition cursor-pointer shadow-lg shadow-amber-500/20"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};
