import { useState, useEffect, useCallback } from 'react';
import {
  updateService,
  UpdateCheckResult,
  UpdateCheckStatus,
  ReleaseInfo,
  getInstalledVersionInfo,
  isAndroidDevice,
  isNativeAndroidApp,
} from '../services/updateService';
import { audioFX } from '../services/audio';

export interface AppUpdateState {
  status: UpdateCheckStatus;
  statusMessage?: string;
  checkedAt?: string;
  checkError: string | null;
  currentVersion: string;
  currentVersionCode: number;
  latestVersion: string;
  latestVersionCode: number;
  updateAvailable: boolean;
  webUpdateWaiting: boolean;
  releaseInfo: ReleaseInfo | null;
  isChecking: boolean;
  isDownloading: boolean;
  downloadProgress: number;
  downloadSuccess: boolean;
  downloadError: string | null;
  isDismissed: boolean;
  isAndroid: boolean;
  isNativeApp: boolean;
  checkForUpdates: (force?: boolean) => Promise<UpdateCheckResult>;
  dismissLater: () => void;
  downloadAndInstall: () => Promise<boolean>;
  applyWebUpdate: () => Promise<void>;
}

export function useAppUpdate(): AppUpdateState {
  const installed = getInstalledVersionInfo();

  const [updateState, setUpdateState] = useState<UpdateCheckResult>({
    status: 'idle',
    updateAvailable: false,
    currentVersion: installed.version,
    currentVersionCode: installed.versionCode,
    latestVersion: installed.version,
    latestVersionCode: installed.versionCode,
    releaseInfo: null,
  });

  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [downloadSuccess, setDownloadSuccess] = useState<boolean>(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isDismissed, setIsDismissed] = useState<boolean>(false);

  const isAndroid = isAndroidDevice();
  const isNativeApp = isNativeAndroidApp();

  // Subscribe to updateService
  useEffect(() => {
    const unsubscribe = updateService.subscribe((res) => {
      setUpdateState(res);
      setIsChecking(res.status === 'checking');
      if (res.updateAvailable && res.releaseInfo) {
        setIsDismissed(updateService.isUpdateDismissed(res.releaseInfo.version));
      } else {
        setIsDismissed(false);
      }
    });

    // Run check on mount after short delay so initial render is instantaneous
    const timer = setTimeout(() => {
      updateService.checkForUpdates(false).catch(() => {});
    }, 1500);

    // Periodic check every 30 minutes
    const interval = setInterval(() => {
      updateService.checkForUpdates(false).catch(() => {});
    }, 30 * 60 * 1000);

    return () => {
      unsubscribe();
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, []);

  const checkForUpdates = useCallback(async (force = true): Promise<UpdateCheckResult> => {
    audioFX.playClick();
    setIsChecking(true);
    try {
      const res = await updateService.checkForUpdates(force);
      setUpdateState(res);
      if (res.updateAvailable && res.releaseInfo) {
        setIsDismissed(false);
        updateService.clearDismissedUpdate();
        audioFX.playSuccess();
      } else if (res.error) {
        audioFX.playError();
      }
      return res;
    } finally {
      setIsChecking(false);
    }
  }, []);

  const dismissLater = useCallback(() => {
    if (updateState.releaseInfo) {
      updateService.dismissUpdateLater(updateState.releaseInfo.version);
      setIsDismissed(true);
    }
  }, [updateState.releaseInfo]);

  const downloadAndInstall = useCallback(async (): Promise<boolean> => {
    if (isDownloading) return false;
    audioFX.playClick();
    setIsDownloading(true);
    setDownloadProgress(0);
    setDownloadSuccess(false);
    setDownloadError(null);

    try {
      let activeReleaseInfo = updateState.releaseInfo;
      if (!activeReleaseInfo) {
        const freshCheck = await updateService.checkForUpdates(true);
        setUpdateState(freshCheck);
        activeReleaseInfo = freshCheck.releaseInfo;
      }

      const apkUrl =
        activeReleaseInfo?.versionedApkUrl ||
        activeReleaseInfo?.apkUrl ||
        '/downloads/nexora-release.apk';
      const targetVer = activeReleaseInfo?.version || installed.version;
      const filename = `nexora-v${targetVer}.apk`;

      const success = await updateService.downloadAPK(
        apkUrl,
        filename,
        (percent) => setDownloadProgress(percent),
        activeReleaseInfo?.sha256
      );
      if (success) {
        setDownloadSuccess(true);
        audioFX.playSuccess();
        return true;
      }
      throw new Error('Download did not complete.');
    } catch (err: any) {
      setDownloadError(err?.message || 'Download failed. Please retry.');
      audioFX.playError();
      return false;
    } finally {
      setIsDownloading(false);
    }
  }, [isDownloading, updateState.releaseInfo, installed.version]);

  const applyWebUpdate = useCallback(async () => {
    audioFX.playClick();
    await updateService.applyWebUpdate();
  }, []);

  return {
    status: updateState.status,
    statusMessage: updateState.statusMessage,
    checkedAt: updateState.checkedAt,
    checkError: updateState.error || null,
    currentVersion: updateState.currentVersion || installed.version,
    currentVersionCode: updateState.currentVersionCode || installed.versionCode,
    latestVersion: updateState.latestVersion || installed.version,
    latestVersionCode: updateState.latestVersionCode || installed.versionCode,
    updateAvailable: updateState.updateAvailable,
    webUpdateWaiting: Boolean(updateState.webUpdateWaiting),
    releaseInfo: updateState.releaseInfo,
    isChecking,
    isDownloading,
    downloadProgress,
    downloadSuccess,
    downloadError,
    isDismissed,
    isAndroid,
    isNativeApp,
    checkForUpdates,
    dismissLater,
    downloadAndInstall,
    applyWebUpdate,
  };
}
