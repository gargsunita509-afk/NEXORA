import React, { useState } from 'react';
import { WifiOff, AlertTriangle, X, ShieldAlert } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const OfflineBanner: React.FC = () => {
  const isOnline = useOnlineStatus();
  const [isDismissed, setIsDismissed] = useState<boolean>(false);

  if (isOnline || isDismissed) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-md z-50 animate-fadeIn"
    >
      <div className="bg-amber-950/90 border border-amber-500/50 text-amber-100 p-3.5 rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.6)] backdrop-blur-md">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400 mt-0.5 shrink-0">
              <WifiOff className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 font-hud font-bold text-xs uppercase tracking-wider text-amber-300">
                <span>Offline Mode Active</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 border border-amber-500/30 font-mono-code">
                  CACHED SHELL
                </span>
              </div>
              <p className="text-xs text-amber-200/90 mt-1 leading-relaxed">
                You are currently offline. Local timetable, sketchboard, and scientific calculator are fully functional.
              </p>
              <div className="mt-2 pt-2 border-t border-amber-500/20 flex items-center gap-1.5 text-[11px] text-amber-300/80">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>AI generation, cloud backup, and live sync require an active connection.</span>
              </div>
            </div>
          </div>

          <button
            onClick={() => setIsDismissed(true)}
            className="text-amber-400/80 hover:text-amber-200 p-1 rounded-md hover:bg-amber-500/10 transition shrink-0"
            aria-label="Dismiss offline notice"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
