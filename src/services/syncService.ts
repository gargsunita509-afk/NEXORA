import { storage } from './storage';
import { QuizAttempt } from '../types';
import { resolveApiUrl } from './updateService';
import { apkAwareFetch as fetch } from './apkApiBridge';

class SyncService {
  private isSyncing = false;
  private intervalId: any = null;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        console.log('[SyncService] Network online detected — triggering pending sync...');
        this.syncPendingAttempts();
      });

      // Periodic background check every 60 seconds
      this.intervalId = setInterval(() => {
        if (navigator.onLine) {
          this.syncPendingAttempts();
        }
      }, 60000);
    }
  }

  /**
   * Synchronizes all unsynced local quiz attempts with the backend server.
   * Idempotent and failsafe: preserves local records, updates synced state only upon server confirmation.
   */
  async syncPendingAttempts(): Promise<{ syncedCount: number; pendingCount: number }> {
    if (this.isSyncing) {
      return { syncedCount: 0, pendingCount: 0 };
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return { syncedCount: 0, pendingCount: 0 };
    }

    try {
      this.isSyncing = true;
      const allAttempts = await storage.getQuizAttempts();
      const pending = allAttempts.filter((att) => !att.synced);

      if (pending.length === 0) {
        return { syncedCount: 0, pendingCount: 0 };
      }

      const response = await fetch(resolveApiUrl('/api/quizzes/attempts/sync'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attempts: pending }),
      });

      if (!response.ok) {
        throw new Error(`Sync failed with HTTP ${response.status}`);
      }

      const data = await response.json();
      const syncedIds: string[] = data.syncedIds || [];

      if (syncedIds.length > 0) {
        const syncedSet = new Set(syncedIds);
        for (const att of pending) {
          if (syncedSet.has(att.id)) {
            const updated: QuizAttempt = {
              ...att,
              synced: true,
              syncedAt: Date.now(),
            };
            await storage.saveQuizAttempt(updated);
          }
        }
      }

      return {
        syncedCount: syncedIds.length,
        pendingCount: pending.length - syncedIds.length,
      };
    } catch (err) {
      console.warn('[SyncService] Pending attempts sync postponed:', err);
      return { syncedCount: 0, pendingCount: 0 };
    } finally {
      this.isSyncing = false;
    }
  }
}

export const syncService = new SyncService();
