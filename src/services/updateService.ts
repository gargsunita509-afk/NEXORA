/**
 * NEXORA Update & APK Distribution Service
 * Manages version manifests, real update detection, APK verification & downloading, and PWA updates.
 */

import { installApkApiBridge, sha256Hex, apkAwareFetch as fetch } from './apkApiBridge.ts';

installApkApiBridge();

export const APP_CURRENT_VERSION = '1.8.0';
export const APP_CURRENT_VERSION_CODE = 8;
export const APP_PACKAGE_NAME = 'com.theabhinavschool.nexora';

export const DEFAULT_REMOTE_RELEASE_BASE =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_RELEASE_SERVER_URL) ||
  'https://ais-pre-cjjqxynp5pw6257ks3igyi-205056013380.asia-southeast1.run.app';

export const CONFIGURED_MANIFEST_URL =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_RELEASE_MANIFEST_URL) ||
  '';

export interface ReleaseInfo {
  version: string;
  versionCode: number;
  releaseDate: string;
  minSupportedVersion?: string;
  apkUrl: string;
  versionedApkUrl?: string;
  apkSize?: string;
  sha256?: string;
  packageName: string;
  appName: string;
  releaseNotes: string;
  platform: 'android' | 'web';
  apkReady: boolean;
}

export type UpdateCheckStatus = 'idle' | 'checking' | 'up_to_date' | 'update_available' | 'error';

export interface UpdateCheckResult {
  status: UpdateCheckStatus;
  updateAvailable: boolean;
  webUpdateWaiting?: boolean;
  currentVersion: string;
  currentVersionCode: number;
  latestVersion: string;
  latestVersionCode: number;
  releaseInfo: ReleaseInfo | null;
  checkedAt?: string;
  statusMessage?: string;
  error?: string;
}

export interface UpdateCheckOptions {
  manifestUrl?: string;
  mockResponseText?: string;
}

const STORAGE_KEYS = {
  DISMISSED_UPDATE_VERSION: 'nexora_dismissed_update_version',
  DISMISSED_UPDATE_TIME: 'nexora_dismissed_update_time',
  LAST_CHECK_TIME: 'nexora_last_update_check_time',
};

// Check if current client is Android
export function isAndroidDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent.toLowerCase();
  return /android/i.test(ua);
}

// Check if running inside the native NEXORA Android APK WebView
export function isNativeAndroidApp(): boolean {
  if (typeof window === 'undefined') return false;
  return window.navigator.userAgent.includes('NEXORA_Android_App');
}

/**
 * Normalize an optional leading 'v' or 'V' and whitespace from a version string.
 */
export function normalizeVersionString(v: unknown): string {
  if (typeof v !== 'string') return '';
  return v.trim().replace(/^[vV]/, '').trim();
}

/**
 * Validate whether a version string is a well-formed semantic version (e.g. "1.0.0", "v1.2.0", "1.0.1-beta.1").
 */
export function isValidSemver(v: unknown): boolean {
  const clean = normalizeVersionString(v);
  if (!clean) return false;
  return /^\d+\.\d+(\.\d+)?(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/.test(clean);
}

/**
 * Validate raw release metadata JSON before trusting its version or artifact URL.
 */
export function validateReleaseMetadata(data: unknown): {
  valid: boolean;
  error?: string;
  version?: string;
  versionCode?: number;
  apkUrl?: string;
} {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { valid: false, error: 'Release metadata must be a non-null JSON object.' };
  }
  const obj = data as Record<string, any>;
  const rawVersion = obj.latestVersion ?? obj.version;
  if (typeof rawVersion !== 'string' || !isValidSemver(rawVersion)) {
    return {
      valid: false,
      error: `Release metadata has missing or malformed version: "${String(rawVersion ?? '')}"`,
    };
  }
  const normalizedVersion = normalizeVersionString(rawVersion);

  let versionCode = 1;
  if (obj.versionCode !== undefined && obj.versionCode !== null) {
    const parsedCode = Number(obj.versionCode);
    if (!Number.isFinite(parsedCode) || parsedCode < 1 || !Number.isInteger(parsedCode)) {
      return {
        valid: false,
        error: `Release metadata has invalid versionCode: "${String(obj.versionCode)}"`,
      };
    }
    versionCode = parsedCode;
  }

  const rawApkUrl = obj.apkUrl || obj.versionedApkUrl;
  if (typeof rawApkUrl !== 'string' || !rawApkUrl.trim() || !rawApkUrl.includes('.apk')) {
    return {
      valid: false,
      error: 'Release metadata is missing a valid .apk download URL.',
    };
  }

  if (obj.packageName && obj.packageName !== APP_PACKAGE_NAME) {
    return {
      valid: false,
      error: `Release metadata packageName mismatch: expected ${APP_PACKAGE_NAME}, got ${String(obj.packageName)}`,
    };
  }

  return {
    valid: true,
    version: normalizedVersion,
    versionCode,
    apkUrl: rawApkUrl.trim(),
  };
}

// Detect the actual installed version (extracts native APK version from WebView User-Agent if running in APK)
export function getInstalledVersionInfo(): { version: string; versionCode: number } {
  if (typeof window !== 'undefined' && window.navigator?.userAgent) {
    const ua = window.navigator.userAgent;
    const verMatch = ua.match(/NEXORA_Android_App\/v?([0-9]+\.[0-9]+\.[0-9]+)/i);
    const codeMatch = ua.match(/VersionCode\/([0-9]+)/i);
    if (verMatch && verMatch[1]) {
      return {
        version: normalizeVersionString(verMatch[1]),
        versionCode: codeMatch && codeMatch[1] ? parseInt(codeMatch[1], 10) : 1,
      };
    }
  }
  return {
    version: APP_CURRENT_VERSION,
    versionCode: APP_CURRENT_VERSION_CODE,
  };
}

/**
 * Compare two semver strings numerically (e.g. "v1.1.0" vs "1.0.0", "1.10.0" vs "1.2.0").
 * Returns:
 *   1 if v1 > v2
 *  -1 if v1 < v2
 *   0 if v1 === v2
 */
export function compareSemver(v1: string, v2: string): number {
  const clean1 = normalizeVersionString(v1 || '0.0.0').split(/[-+]/)[0];
  const clean2 = normalizeVersionString(v2 || '0.0.0').split(/[-+]/)[0];
  const p1 = clean1.split('.').map((n) => {
    const parsed = parseInt(n, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  });
  const p2 = clean2.split('.').map((n) => {
    const parsed = parseInt(n, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  });
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const a = p1[i] || 0;
    const b = p2[i] || 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }
  return 0;
}

const BACKEND_SERVER_URL_KEY = 'nexora_backend_server_url';

export function getConfiguredBackendUrl(): string {
  if (typeof window !== 'undefined') {
    const isHostedWeb =
      (window.location.protocol === 'http:' || window.location.protocol === 'https:') &&
      window.location.origin &&
      window.location.origin !== 'null' &&
      window.location.hostname !== 'appassets.androidplatform.net';

    if (isHostedWeb) {
      return window.location.origin.replace(/\/+$/, '');
    }

    try {
      const saved = window.localStorage.getItem(BACKEND_SERVER_URL_KEY);
      if (
        saved &&
        /^https?:\/\//i.test(saved.trim()) &&
        !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(saved.trim())
      ) {
        return saved.trim().replace(/\/+$/, '');
      }
    } catch {
      // ignore storage errors
    }
  }
  return DEFAULT_REMOTE_RELEASE_BASE.replace(/\/+$/, '');
}

export function setConfiguredBackendUrl(url: string): void {
  if (typeof window === 'undefined') return;
  try {
    const clean = url.trim().replace(/\/+$/, '');
    if (!clean) {
      window.localStorage.removeItem(BACKEND_SERVER_URL_KEY);
    } else if (/^https?:\/\//i.test(clean)) {
      window.localStorage.setItem(BACKEND_SERVER_URL_KEY, clean);
    }
  } catch {
    // ignore storage errors
  }
}

/**
 * Resolve an APK or API URL so it works both on web (http/https) and inside standalone APK (file://)
 */
export function resolveReleaseUrl(pathOrUrl: string): string {
  if (!pathOrUrl) return '/downloads/nexora-release.apk';
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const normalizedPath = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  if (typeof window !== 'undefined') {
    if (
      window.location.protocol === 'file:' ||
      window.location.origin === 'null' ||
      window.location.hostname === 'appassets.androidplatform.net' ||
      (isNativeAndroidApp() && !window.location.origin.includes('run.app'))
    ) {
      const base = getConfiguredBackendUrl();
      return `${base}${normalizedPath}`;
    }
  }
  return normalizedPath;
}

/**
 * Resolve any backend API endpoint (e.g. '/api/gemini/quiz', '/api/diary/entries') so that both the website
 * and the installed Android APK WebView hit the live backend without routing http/https origins to a dead preview URL.
 */
export function resolveApiUrl(pathOrUrl: string): string {
  if (!pathOrUrl) return '/';
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const normalizedPath = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  if (typeof window === 'undefined') {
    const port = (typeof process !== 'undefined' && process.env?.PORT) || 3000;
    return `http://localhost:${port}${normalizedPath}`;
  }
  if (
    window.location.protocol === 'file:' ||
    window.location.origin === 'null' ||
    window.location.hostname === 'appassets.androidplatform.net' ||
    (isNativeAndroidApp() && !window.location.origin.includes('run.app'))
  ) {
    const base = getConfiguredBackendUrl();
    return `${base}${normalizedPath}`;
  }
  return normalizedPath;
}

/**
 * Helper to fetch release metadata text across HTTP/HTTPS and Android WebView file:// assets.
 */
async function fetchReleaseMetadataText(
  url: string
): Promise<{ ok: boolean; status: number; contentType: string; text: string }> {
  const isFileProtocol =
    typeof window !== 'undefined' && window.location.protocol === 'file:';
  const isRelativeLocalUrl = !/^https?:\/\//i.test(url);

  if (isFileProtocol && isRelativeLocalUrl && typeof XMLHttpRequest !== 'undefined') {
    return new Promise((resolve, reject) => {
      try {
        const xhr = new XMLHttpRequest();
        const cleanLocalUrl = url.split('?')[0];
        xhr.open('GET', cleanLocalUrl, true);
        xhr.onload = () => {
          if ((xhr.status === 200 || xhr.status === 0) && xhr.responseText) {
            resolve({
              ok: true,
              status: 200,
              contentType: 'application/json',
              text: xhr.responseText,
            });
          } else {
            resolve({
              ok: false,
              status: xhr.status || 404,
              contentType: '',
              text: '',
            });
          }
        };
        xhr.onerror = () => reject(new Error('Local file XMLHttpRequest failed'));
        xhr.send();
      } catch (err) {
        reject(err);
      }
    });
  }

  const response = await fetch(url, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
    },
  });

  const contentType = response.headers.get('content-type') || '';
  const text = response.ok ? await response.text() : '';
  return {
    ok: response.ok,
    status: response.status,
    contentType,
    text,
  };
}

class UpdateService {
  private updateListeners = new Set<(result: UpdateCheckResult) => void>();
  private lastCheckResult: UpdateCheckResult | null = null;
  private isChecking = false;

  public subscribe(listener: (result: UpdateCheckResult) => void): () => void {
    this.updateListeners.add(listener);
    if (this.lastCheckResult) {
      listener(this.lastCheckResult);
    }
    return () => this.updateListeners.delete(listener);
  }

  private notify(result: UpdateCheckResult) {
    this.lastCheckResult = result;
    this.updateListeners.forEach((l) => {
      try {
        l(result);
      } catch (err) {
        console.warn('[UpdateService] Listener error:', err);
      }
    });
  }

  /**
   * Check if a PWA Service Worker has a waiting update or fresh bundle
   */
  private async checkServiceWorkerWaiting(): Promise<boolean> {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return false;
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return false;
      await reg.update().catch(() => {});
      return Boolean(reg.waiting);
    } catch {
      return false;
    }
  }

  /**
   * Check for updates against the configured release source.
   * Compares installed version (and versionCode) against latest published release.
   */
  public async checkForUpdates(
    force = false,
    overrideInstalledVersion?: { version: string; versionCode?: number },
    options?: UpdateCheckOptions
  ): Promise<UpdateCheckResult> {
    const isSimulation = Boolean(overrideInstalledVersion || options);
    const hasExplicitVersionCode = overrideInstalledVersion
      ? typeof overrideInstalledVersion.versionCode === 'number'
      : true;

    const rawInstalled = overrideInstalledVersion
      ? {
          version: overrideInstalledVersion.version,
          versionCode: overrideInstalledVersion.versionCode ?? 0,
        }
      : getInstalledVersionInfo();

    const normalizedInstalledVersion = isValidSemver(rawInstalled.version)
      ? normalizeVersionString(rawInstalled.version)
      : rawInstalled.version;

    const installed = {
      version: normalizedInstalledVersion,
      versionCode: rawInstalled.versionCode,
    };

    // Rate-limit background automated checks to once per 5 minutes unless forced by user tap or simulation
    if (!force && typeof window !== 'undefined' && !isSimulation) {
      const lastCheck = localStorage.getItem(STORAGE_KEYS.LAST_CHECK_TIME);
      if (lastCheck && Date.now() - parseInt(lastCheck, 10) < 5 * 60 * 1000) {
        if (this.lastCheckResult) return this.lastCheckResult;
      }
    }

    if (this.isChecking && !force && !isSimulation) {
      return (
        this.lastCheckResult || {
          status: 'checking',
          updateAvailable: false,
          currentVersion: installed.version,
          currentVersionCode: installed.versionCode,
          latestVersion: installed.version,
          latestVersionCode: installed.versionCode,
          releaseInfo: null,
        }
      );
    }

    if (!isSimulation) {
      this.isChecking = true;
    }
    const startTime = Date.now();

    // Broadcast immediate 'checking' state for regular checks (not simulations)
    if (!isSimulation) {
      this.notify({
        status: 'checking',
        updateAvailable: this.lastCheckResult?.updateAvailable || false,
        currentVersion: installed.version,
        currentVersionCode: installed.versionCode,
        latestVersion: this.lastCheckResult?.latestVersion || installed.version,
        latestVersionCode: this.lastCheckResult?.latestVersionCode || installed.versionCode,
        releaseInfo: this.lastCheckResult?.releaseInfo || null,
        statusMessage: 'Checking release server for updates...',
      });
    }

    try {
      if (!isValidSemver(rawInstalled.version)) {
        throw new Error(`Invalid installed version string: "${String(rawInstalled.version)}"`);
      }

      if (typeof navigator !== 'undefined' && navigator.onLine === false && !options?.mockResponseText) {
        throw new Error('You are currently offline. Please connect to the internet and try again.');
      }

      let data: any = null;
      let lastFetchError: string | null = null;

      if (options?.mockResponseText !== undefined) {
        const text = options.mockResponseText;
        if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
          throw new Error('Release endpoint returned HTML instead of JSON release metadata.');
        }
        let parsed: any;
        try {
          parsed = JSON.parse(text);
        } catch {
          throw new Error('Release endpoint returned malformed JSON.');
        }
        const validation = validateReleaseMetadata(parsed);
        if (!validation.valid) {
          throw new Error(validation.error || 'Invalid release metadata schema.');
        }
        data = parsed;
      } else {
        const platform = isAndroidDevice() ? 'android' : 'web';
        const cacheBuster = Date.now();
        const candidateUrls: string[] = [];

        if (options?.manifestUrl) {
          const sep = options.manifestUrl.includes('?') ? '&' : '?';
          candidateUrls.push(`${options.manifestUrl}${sep}_t=${cacheBuster}`);
        } else {
          if (CONFIGURED_MANIFEST_URL) {
            const sep = CONFIGURED_MANIFEST_URL.includes('?') ? '&' : '?';
            candidateUrls.push(`${CONFIGURED_MANIFEST_URL}${sep}_t=${cacheBuster}`);
          }

          if (typeof window === 'undefined') {
            const port = (typeof process !== 'undefined' && process.env?.PORT) || 3000;
            const localBase = `http://localhost:${port}`;
            candidateUrls.push(
              `${localBase}/api/updates/check?currentVersion=${encodeURIComponent(installed.version)}&versionCode=${installed.versionCode}&platform=${platform}&_t=${cacheBuster}`,
              `${localBase}/downloads/release-info.json?_t=${cacheBuster}`,
              `${localBase}/api/updates/manifest?_t=${cacheBuster}`
            );
          } else {
            const isFileOrStandaloneOrigin =
              window.location.protocol === 'file:' ||
              window.location.origin === 'null' ||
              window.location.hostname === 'appassets.androidplatform.net';

            if (!isFileOrStandaloneOrigin) {
              // On standard HTTP/HTTPS web origins, try same-origin endpoints first (carries cookies & hits active server)
              candidateUrls.push(
                `/api/updates/check?currentVersion=${encodeURIComponent(installed.version)}&versionCode=${installed.versionCode}&platform=${platform}&_t=${cacheBuster}`,
                `/downloads/release-info.json?_t=${cacheBuster}`,
                `/api/updates/manifest?_t=${cacheBuster}`
              );
            }

            // Also include configured remote backend URL
            const remoteBase = getConfiguredBackendUrl();
            if (remoteBase && (isFileOrStandaloneOrigin || remoteBase !== window.location.origin)) {
              candidateUrls.push(
                `${remoteBase}/api/updates/check?currentVersion=${encodeURIComponent(installed.version)}&versionCode=${installed.versionCode}&platform=${platform}&_t=${cacheBuster}`,
                `${remoteBase}/downloads/release-info.json?_t=${cacheBuster}`,
                `${remoteBase}/api/updates/manifest?_t=${cacheBuster}`
              );
            }

            // Inside standalone Android APK (file:///android_asset/www/index.html), include packaged release-info.json fallback
            // in case the remote Cloud Run preview URL requires browser authentication cookies
            if (isFileOrStandaloneOrigin) {
              candidateUrls.push(`./downloads/release-info.json?_t=${cacheBuster}`);
            }
          }
        }

        for (const url of candidateUrls) {
          try {
            const res = await fetchReleaseMetadataText(url);
            if (!res.ok) {
              lastFetchError = `Release server returned HTTP ${res.status}`;
              continue;
            }

            const text = res.text;
            if (
              res.contentType.includes('text/html') ||
              text.trim().startsWith('<!DOCTYPE') ||
              text.trim().startsWith('<html')
            ) {
              lastFetchError = 'Release endpoint returned HTML instead of JSON release metadata.';
              continue;
            }

            let parsed: any;
            try {
              parsed = JSON.parse(text);
            } catch {
              lastFetchError = 'Release endpoint returned malformed JSON.';
              continue;
            }

            const validation = validateReleaseMetadata(parsed);
            if (!validation.valid) {
              lastFetchError = validation.error || 'Release metadata JSON failed validation.';
              continue;
            }

            data = parsed;
            break;
          } catch (fetchErr: any) {
            lastFetchError = fetchErr?.message || 'Network error while contacting release server.';
          }
        }
      }

      if (!data) {
        throw new Error(
          lastFetchError ||
            'Unable to reach the NEXORA release metadata endpoint. Please check your connection and retry.'
        );
      }

      // Ensure forced manual checks show a visible loading state for at least 300ms so user sees clear feedback
      if (force && !isSimulation) {
        const elapsed = Date.now() - startTime;
        if (elapsed < 300) {
          await new Promise((r) => setTimeout(r, 300 - elapsed));
        }
      }

      const validation = validateReleaseMetadata(data);
      const latestVersion = validation.version || normalizeVersionString(data.latestVersion || data.version);
      const latestVersionCode = validation.versionCode || Number(data.versionCode) || 1;

      const semverCmp = compareSemver(latestVersion, installed.version);
      const isSemverNewer = semverCmp > 0;
      const isCodeNewer =
        semverCmp === 0 &&
        hasExplicitVersionCode &&
        installed.versionCode > 0 &&
        latestVersionCode > installed.versionCode;
      const swWaiting = isSimulation ? false : await this.checkServiceWorkerWaiting();
      const isNewer = isSemverNewer || isCodeNewer || swWaiting;

      const rawApkUrl = data.apkUrl || '/downloads/nexora-release.apk';
      const rawVersionedUrl = data.versionedApkUrl || `/downloads/nexora-v${latestVersion}.apk`;

      const releaseInfo: ReleaseInfo = {
        version: latestVersion,
        versionCode: latestVersionCode,
        releaseDate: data.releaseDate || new Date().toISOString().split('T')[0],
        minSupportedVersion: data.minSupportedVersion || '1.0.0',
        apkUrl: resolveReleaseUrl(rawApkUrl),
        versionedApkUrl: resolveReleaseUrl(rawVersionedUrl),
        apkSize: data.apkSize || '546K',
        sha256: data.sha256,
        packageName: data.packageName || APP_PACKAGE_NAME,
        appName: data.appName || 'NEXORA',
        releaseNotes:
          data.releaseNotes ||
          'Includes real-time timetable matrix, live IST clock, Gemini AI quiz studio, and standalone offline support.',
        platform: data.platform || 'android',
        apkReady: data.apkReady !== false,
      };

      const checkedAt = new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

      const statusMessage = isNewer
        ? `Update available: NEXORA v${latestVersion} (Build ${latestVersionCode}) is ready to install.`
        : "You're using the latest version.";

      const result: UpdateCheckResult = {
        status: isNewer ? 'update_available' : 'up_to_date',
        updateAvailable: isNewer,
        webUpdateWaiting: swWaiting,
        currentVersion: installed.version,
        currentVersionCode: installed.versionCode || latestVersionCode,
        latestVersion,
        latestVersionCode,
        releaseInfo,
        checkedAt,
        statusMessage,
      };

      if (!isSimulation) {
        if (typeof window !== 'undefined') {
          localStorage.setItem(STORAGE_KEYS.LAST_CHECK_TIME, Date.now().toString());
        }
        this.notify(result);
      }
      return result;
    } catch (err: any) {
      if (force && !isSimulation) {
        const elapsed = Date.now() - startTime;
        if (elapsed < 300) {
          await new Promise((r) => setTimeout(r, 300 - elapsed));
        }
      }

      const errorMessage =
        err?.message || 'Failed to check for updates. Please verify your internet connection.';
      const checkedAt = new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

      const result: UpdateCheckResult = {
        status: 'error',
        updateAvailable: false,
        currentVersion: installed.version,
        currentVersionCode: installed.versionCode,
        latestVersion: this.lastCheckResult?.latestVersion || installed.version,
        latestVersionCode: this.lastCheckResult?.latestVersionCode || installed.versionCode,
        releaseInfo: this.lastCheckResult?.releaseInfo || null,
        checkedAt,
        statusMessage: errorMessage,
        error: errorMessage,
      };
      if (!isSimulation) {
        this.notify(result);
      }
      return result;
    } finally {
      if (!isSimulation) {
        this.isChecking = false;
      }
    }
  }

  /**
   * Check if the user dismissed this specific update version recently (within 24 hours).
   */
  public isUpdateDismissed(version: string): boolean {
    if (typeof window === 'undefined') return false;
    const dismissedVer = localStorage.getItem(STORAGE_KEYS.DISMISSED_UPDATE_VERSION);
    const dismissedTime = localStorage.getItem(STORAGE_KEYS.DISMISSED_UPDATE_TIME);
    if (!dismissedVer || !dismissedTime) return false;

    if (dismissedVer === version) {
      const snoozedFor = Date.now() - parseInt(dismissedTime, 10);
      return snoozedFor < 24 * 60 * 60 * 1000;
    }
    return false;
  }

  /**
   * Snooze the update notification for 24 hours.
   */
  public dismissUpdateLater(version: string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.DISMISSED_UPDATE_VERSION, version);
    localStorage.setItem(STORAGE_KEYS.DISMISSED_UPDATE_TIME, Date.now().toString());
  }

  /**
   * Reset dismiss snooze (e.g. when user clicks Check Updates manually).
   */
  public clearDismissedUpdate(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(STORAGE_KEYS.DISMISSED_UPDATE_VERSION);
    localStorage.removeItem(STORAGE_KEYS.DISMISSED_UPDATE_TIME);
  }

  /**
   * Safely download and verify the genuine Android APK.
   * Validates HTTP response, MIME/magic bytes (PK\x03\x04), Android package entries, and optional SHA-256 checksum before saving.
   */
  public async downloadAPK(
    apkUrl: string,
    filename = 'nexora-release.apk',
    onProgress?: (percent: number) => void,
    expectedSha256?: string
  ): Promise<boolean> {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new Error('Cannot download APK while offline. Please connect to the internet and retry.');
    }

    const resolvedUrl = resolveReleaseUrl(apkUrl);
    const fetchUrl = `${resolvedUrl}${resolvedUrl.includes('?') ? '&' : '?'}_t=${Date.now()}`;

    // If running inside the native Android WebView, hand off to Android system downloader
    if (isNativeAndroidApp()) {
      if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
        const headRes = await fetch(fetchUrl, { method: 'HEAD', cache: 'no-store' });
        if (!headRes.ok) {
          throw new Error(`APK artifact unavailable on server (HTTP ${headRes.status}).`);
        }
      }
      if (onProgress) onProgress(100);
      window.location.href = fetchUrl;
      return true;
    }

    const response = await fetch(fetchUrl, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      },
    });

    if (!response.ok) {
      throw new Error(`APK download failed: Server responded with HTTP ${response.status}.`);
    }

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('text/html')) {
      throw new Error('Invalid download: Server returned an HTML page instead of a valid Android APK.');
    }

    const contentLength = response.headers.get('content-length');
    const total = contentLength ? parseInt(contentLength, 10) : 0;

    if (!response.body) {
      const arrayBuf = await response.arrayBuffer();
      const bytes = new Uint8Array(arrayBuf);
      this.verifyApkBytes(bytes);
      await this.verifyApkChecksum(bytes, expectedSha256);
      this.triggerBrowserDownload(bytes, filename);
      if (onProgress) onProgress(100);
      return true;
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.length;
        if (total > 0 && onProgress) {
          onProgress(Math.min(99, Math.round((received / total) * 100)));
        } else if (onProgress) {
          onProgress(Math.min(95, Math.round((received / 558478) * 100)));
        }
      }
    }

    // Merge chunks to verify APK integrity
    const fullBytes = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      fullBytes.set(chunk, offset);
      offset += chunk.length;
    }

    this.verifyApkBytes(fullBytes);
    await this.verifyApkChecksum(fullBytes, expectedSha256);
    this.triggerBrowserDownload(fullBytes, filename);

    if (onProgress) onProgress(100);
    return true;
  }

  /**
   * Verify that the downloaded payload is a genuine signed ZIP/APK archive (starts with PK\x03\x04, > 50KB, and contains AndroidManifest.xml)
   */
  public verifyApkBytes(bytes: Uint8Array): void {
    if (!bytes || bytes.byteLength < 50000) {
      throw new Error(
        `Invalid artifact: Downloaded file is too small (${bytes ? bytes.byteLength : 0} bytes) to be a valid NEXORA APK.`
      );
    }
    // Check ZIP/APK magic header: 0x50 ('P'), 0x4B ('K'), 0x03, 0x04
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) {
      throw new Error('Invalid artifact: Downloaded file failed APK signature header verification (not a valid APK archive).');
    }
    // Verify that the archive contains 'AndroidManifest.xml' and 'classes.dex' in its ZIP directory entries
    const asciiSample = new TextDecoder('latin1').decode(bytes);
    if (!asciiSample.includes('AndroidManifest.xml') || !asciiSample.includes('classes.dex')) {
      throw new Error('Invalid artifact: Archive is missing required Android package components (AndroidManifest.xml / classes.dex).');
    }
  }

  /**
   * Verify SHA-256 checksum of downloaded APK bytes when expectedSha256 and Web Crypto API are available.
   */
  public async verifyApkChecksum(bytes: Uint8Array, expectedSha256?: string): Promise<void> {
    if (!expectedSha256 || !expectedSha256.trim()) return;
    let computedHex = '';
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      try {
        const hashBuffer = await crypto.subtle.digest('SHA-256', bytes.buffer as ArrayBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        computedHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
      } catch {
        computedHex = sha256Hex(bytes);
      }
    } else {
      computedHex = sha256Hex(bytes);
    }
    if (computedHex.toLowerCase() !== expectedSha256.trim().toLowerCase()) {
      throw new Error(
        `Invalid artifact: APK SHA-256 checksum mismatch (expected ${expectedSha256.slice(0, 12)}..., got ${computedHex.slice(0, 12)}...).`
      );
    }
  }

  private triggerBrowserDownload(bytes: Uint8Array, filename: string): void {
    const blob = new Blob([bytes.buffer as ArrayBuffer], {
      type: 'application/vnd.android.package-archive',
    });
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => window.URL.revokeObjectURL(downloadUrl), 10000);
  }

  /**
   * PWA / Web update handler: triggers service worker update, clears stale asset precaches, and safely refreshes.
   * Preserves all localStorage and IndexedDB student/teacher data.
   */
  public async applyWebUpdate(): Promise<void> {
    if (typeof window !== 'undefined') {
      if ('caches' in window) {
        try {
          const keys = await window.caches.keys();
          await Promise.all(
            keys
              .filter((k) => k.includes('workbox') || k.includes('precache'))
              .map((k) => window.caches.delete(k))
          );
        } catch {
          // ignore cache deletion errors
        }
      }
      if ('serviceWorker' in navigator) {
        try {
          const registrations = await navigator.serviceWorker.getRegistrations();
          for (const reg of registrations) {
            await reg.update().catch(() => {});
            if (reg.waiting) {
              reg.waiting.postMessage({ type: 'SKIP_WAITING' });
            }
          }
        } catch (e) {
          console.warn('[UpdateService] Service worker update warning:', e);
        }
      }
      // Reload page from network while keeping localStorage and IndexedDB intact
      window.location.reload();
    }
  }
}

export const updateService = new UpdateService();
