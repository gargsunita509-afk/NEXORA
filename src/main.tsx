import './services/apkApiBridge';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';
import { APP_CURRENT_VERSION } from './services/updateService';

const ACTIVE_BUNDLE_VERSION_KEY = 'nexora_active_bundle_version';

// Clear outdated Workbox precaches when transitioning to a newer NEXORA bundle version
// while strictly preserving all localStorage and IndexedDB student/staff records.
if (typeof window !== 'undefined') {
  try {
    const previousBundleVersion = window.localStorage.getItem(ACTIVE_BUNDLE_VERSION_KEY);
    if (previousBundleVersion !== APP_CURRENT_VERSION) {
      window.localStorage.setItem(ACTIVE_BUNDLE_VERSION_KEY, APP_CURRENT_VERSION);
      if ('caches' in window) {
        window.caches
          .keys()
          .then((keys) =>
            Promise.all(
              keys
                .filter((k) => k.includes('workbox') || k.includes('precache'))
                .map((k) => window.caches.delete(k))
            )
          )
          .catch(() => {});
      }
    }
  } catch {
    // ignore storage access issues
  }
}

// Register service worker with immediate update checking to ensure latest website changes load
const updateSW = registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (registration) {
      registration.update().catch(() => {});
    }
  },
  onNeedRefresh() {
    console.log('[NEXORA PWA] New update available, refreshing assets...');
    updateSW(true);
  },
  onOfflineReady() {
    console.log('[NEXORA PWA] Application shell cached and ready for offline use');
  },
  onRegisterError(error) {
    console.warn('[NEXORA PWA] Service worker registration note:', error);
  },
});

createRoot(document.getElementById('root')!).render(<App />);


