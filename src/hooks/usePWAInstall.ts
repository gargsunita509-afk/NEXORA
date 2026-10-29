import { useState, useEffect, useCallback } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export interface PWAInstallState {
  isInstallable: boolean;
  isInstalled: boolean;
  isIOS: boolean;
  isStandalone: boolean;
  install: () => Promise<boolean>;
}

// Module-level singleton state to avoid competing handlers and preserve the single beforeinstallprompt event
let globalDeferredPrompt: BeforeInstallPromptEvent | null = null;
let globalIsInstalled: boolean = false;
const globalListeners = new Set<() => void>();

function notifyAllListeners() {
  globalListeners.forEach((listener) => {
    try {
      listener();
    } catch (e) {
      console.warn('[NEXORA PWA] Error notifying listener:', e);
    }
  });
}

function checkStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  const isStandaloneMedia = window.matchMedia('(display-mode: standalone)').matches;
  const isStandaloneNav = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  const isStandaloneDoc = document.referrer?.includes('android-app://') ?? false;
  return isStandaloneMedia || isStandaloneNav || isStandaloneDoc;
}

// Initialize listeners immediately at script evaluation time
if (typeof window !== 'undefined') {
  globalIsInstalled = checkStandaloneMode();

  // Listen for beforeinstallprompt once globally
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    globalDeferredPrompt = e as BeforeInstallPromptEvent;
    // Expose on window for diagnostics or debugging
    (window as any).deferredPWAInstallPrompt = globalDeferredPrompt;
    notifyAllListeners();
  });

  // Listen for successful app installation once globally
  window.addEventListener('appinstalled', () => {
    console.log('[NEXORA PWA] App was successfully installed to device home screen/launcher');
    globalIsInstalled = true;
    globalDeferredPrompt = null;
    (window as any).deferredPWAInstallPrompt = null;
    notifyAllListeners();
  });

  // Listen for display-mode changes (e.g. window dragged to standalone display)
  try {
    const mq = window.matchMedia('(display-mode: standalone)');
    mq.addEventListener('change', (e) => {
      globalIsInstalled = e.matches;
      notifyAllListeners();
    });
  } catch {}
}

/**
 * Universal PWA Installation Hook
 * Shared by Header, Smart Board HUD, and Installation Dialogs
 */
export function usePWAInstall(): PWAInstallState {
  const [, setTick] = useState(0);

  useEffect(() => {
    // Re-check standalone status on mount
    const currentStandalone = checkStandaloneMode();
    if (currentStandalone !== globalIsInstalled) {
      globalIsInstalled = currentStandalone;
    }

    const handleChange = () => {
      setTick((t) => t + 1);
    };

    globalListeners.add(handleChange);
    return () => {
      globalListeners.delete(handleChange);
    };
  }, []);

  // Detect iOS devices (iPhone, iPad, iPod)
  const isIOS = typeof window !== 'undefined'
    ? /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase()) && !globalIsInstalled
    : false;

  const install = useCallback(async (): Promise<boolean> => {
    if (!globalDeferredPrompt) {
      console.info('[NEXORA PWA] No direct beforeinstallprompt available. Opening instructions.');
      return false;
    }

    try {
      await globalDeferredPrompt.prompt();
      const choice = await globalDeferredPrompt.userChoice;
      console.log(`[NEXORA PWA] User install choice outcome: ${choice.outcome}`);
      if (choice.outcome === 'accepted') {
        globalIsInstalled = true;
        globalDeferredPrompt = null;
        (window as any).deferredPWAInstallPrompt = null;
        notifyAllListeners();
        return true;
      }
      return false;
    } catch (err) {
      console.warn('[NEXORA PWA] Error invoking install prompt:', err);
      return false;
    }
  }, []);

  return {
    isInstallable: !!globalDeferredPrompt,
    isInstalled: globalIsInstalled,
    isIOS,
    isStandalone: globalIsInstalled,
    install,
  };
}
