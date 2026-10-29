import {
  StaffRole,
  StaffSession,
  StaffUser,
  DiaryEntry,
  DiaryAttachment,
  StaffQuickNote,
  QuickNoteCategory,
  PendingStaffMutation,
  StreamType,
} from '../types';
import { resolveApiUrl } from './updateService';
import { apkAwareFetch as fetch } from './apkApiBridge';
import {
  getDiaryCycleInfo,
  getActiveDiaryCycleDateIST,
  type DiaryCycleInfo,
} from '../utils/diaryHelper';

const SESSION_STORAGE_KEY = 'nexora_staff_session_v1';
const IDB_NAME = 'ClassOS_Staff_Vault_DB';
const IDB_VERSION = 1;
const STORE_DIARY = 'staff_diary_cache';
const STORE_NOTES = 'staff_quick_notes_cache';
const STORE_QUEUE = 'staff_mutation_queue';

export interface StaffAuthStatusResponse {
  bootstrapRequired: boolean;
  authenticated: boolean;
  user: StaffUser | null;
  expiresAt?: number;
}

export interface StaffAccountSummary extends StaffUser {
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface SaveDiaryInput {
  id?: string;
  date: string;
  subject: string;
  title?: string;
  type: 'Homework' | 'Remark' | 'Notice' | 'Announcement' | 'Circular';
  content: string;
  homework?: string;
  remarks?: string;
  notices?: string;
  targetStream: StreamType | 'ALL';
  status?: 'published' | 'draft';
  attachments?: DiaryAttachment[];
  baseVersion?: number;
  idempotencyKey?: string;
}

export interface SaveQuickNoteInput {
  title?: string;
  content: string;
  category?: QuickNoteCategory;
  pinned?: boolean;
  baseVersion?: number;
  idempotencyKey?: string;
}

export interface ConflictResult<T> {
  conflict: boolean;
  latestRecord?: T;
  error?: string;
}

function isAuthorizedStaffRole(role: unknown): role is StaffRole {
  return role === 'teacher_in_charge' || role === 'developer';
}

function openStaffVaultDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB is not available in this environment'));
    }
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_DIARY)) {
        db.createObjectStore(STORE_DIARY, { keyPath: 'vaultKey' });
      }
      if (!db.objectStoreNames.contains(STORE_NOTES)) {
        db.createObjectStore(STORE_NOTES, { keyPath: 'vaultKey' });
      }
      if (!db.objectStoreNames.contains(STORE_QUEUE)) {
        db.createObjectStore(STORE_QUEUE, { keyPath: 'vaultKey' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGetAccountRecords<T>(storeName: string, accountId: string): Promise<T[]> {
  if (!accountId) return [];
  try {
    const db = await openStaffVaultDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => {
        const all = Array.isArray(req.result) ? req.result : [];
        const prefix = `${accountId}::`;
        const filtered = all
          .filter((item: any) => typeof item?.vaultKey === 'string' && item.vaultKey.startsWith(prefix))
          .map((item: any) => item.record as T);
        resolve(filtered);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

async function idbReplaceAccountRecords<T extends { id: string }>(
  storeName: string,
  accountId: string,
  records: T[]
): Promise<void> {
  if (!accountId) return;
  try {
    const db = await openStaffVaultDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const getAllReq = store.getAllKeys();
      getAllReq.onsuccess = () => {
        const keys = Array.isArray(getAllReq.result) ? getAllReq.result : [];
        const prefix = `${accountId}::`;
        for (const k of keys) {
          if (typeof k === 'string' && k.startsWith(prefix)) {
            store.delete(k);
          }
        }
        for (const rec of records) {
          store.put({
            vaultKey: `${accountId}::${rec.id}`,
            accountId,
            updatedAt: Date.now(),
            record: rec,
          });
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore IndexedDB errors
  }
}

async function idbClearAccountStore(accountId: string): Promise<void> {
  if (!accountId) return;
  try {
    const db = await openStaffVaultDB();
    const stores = [STORE_DIARY, STORE_NOTES, STORE_QUEUE];
    for (const storeName of stores) {
      await new Promise<void>((resolve) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const req = store.getAllKeys();
        req.onsuccess = () => {
          const keys = Array.isArray(req.result) ? req.result : [];
          const prefix = `${accountId}::`;
          for (const k of keys) {
            if (typeof k === 'string' && k.startsWith(prefix)) {
              store.delete(k);
            }
          }
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    }
  } catch {
    // ignore
  }
}

class StaffContentService {
  private currentSession: StaffSession | null = null;
  private bootstrapRequired = false;
  private memoryDiaryEntries: DiaryEntry[] = [];
  private memoryQuickNotes: StaffQuickNote[] = [];
  private memoryPendingQueue: PendingStaffMutation[] = [];
  private diaryCycleInfo: DiaryCycleInfo | null = null;
  private serverClockOffsetMs = 0;
  private rolloverTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<() => void>();
  private syncInProgress = false;

  constructor() {
    this.restoreSessionFromStorage();
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        if (this.getAuthorizedSession()) {
          this.syncPendingMutations()
            .then(() => this.fetchDiaryEntries())
            .catch(() => {});
        }
      });
      window.addEventListener('focus', () => {
        if (this.getAuthorizedSession() && window.navigator.onLine !== false) {
          this.syncPendingMutations()
            .then(() => this.fetchDiaryEntries())
            .catch(() => {});
        }
      });
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
          if (
            document.visibilityState === 'visible' &&
            this.getAuthorizedSession() &&
            window.navigator.onLine !== false
          ) {
            this.syncPendingMutations()
              .then(() => this.fetchDiaryEntries())
              .catch(() => {});
          }
        });
      }
    }
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    this.listeners.forEach((fn) => {
      try {
        fn();
      } catch {
        // ignore listener errors
      }
    });
  }

  private restoreSessionFromStorage(): void {
    if (typeof window === 'undefined') return;
    try {
      const raw =
        window.sessionStorage.getItem(SESSION_STORAGE_KEY) ||
        window.localStorage.getItem(SESSION_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as StaffSession;
      if (
        parsed &&
        typeof parsed.token === 'string' &&
        parsed.user &&
        isAuthorizedStaffRole(parsed.user.role) &&
        typeof parsed.expiresAt === 'number' &&
        parsed.expiresAt > Date.now()
      ) {
        this.currentSession = parsed;
      } else {
        this.clearStoredSession();
      }
    } catch {
      this.clearStoredSession();
    }
  }

  private persistSessionToStorage(session: StaffSession): void {
    this.currentSession = session;
    if (typeof window !== 'undefined') {
      try {
        const serialized = JSON.stringify(session);
        window.sessionStorage.setItem(SESSION_STORAGE_KEY, serialized);
        window.localStorage.setItem(SESSION_STORAGE_KEY, serialized);
      } catch {
        // ignore storage quota errors
      }
    }
    this.notify();
  }

  private clearStoredSession(): void {
    this.currentSession = null;
    // Immediately wipe all in-memory protected caches so unauthorized users cannot access them
    this.memoryDiaryEntries = [];
    this.memoryQuickNotes = [];
    this.memoryPendingQueue = [];
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
        window.localStorage.removeItem(SESSION_STORAGE_KEY);
      } catch {
        // ignore
      }
    }
    this.notify();
  }

  /**
   * Returns the active StaffSession ONLY if it is present, unexpired, and has an authorized role.
   */
  public getAuthorizedSession(): StaffSession | null {
    if (!this.currentSession) return null;
    if (
      !this.currentSession.token ||
      !this.currentSession.user ||
      !isAuthorizedStaffRole(this.currentSession.user.role)
    ) {
      this.clearStoredSession();
      return null;
    }
    if (Date.now() > this.currentSession.expiresAt) {
      this.clearStoredSession();
      return null;
    }
    return this.currentSession;
  }

  public getCurrentStaffUser(): StaffUser | null {
    return this.getAuthorizedSession()?.user || null;
  }

  public isStaffAuthenticated(): boolean {
    return Boolean(this.getAuthorizedSession());
  }

  public isDeveloper(): boolean {
    return this.getAuthorizedSession()?.user.role === 'developer';
  }

  public isTeacherInCharge(): boolean {
    return this.getAuthorizedSession()?.user.role === 'teacher_in_charge';
  }

  public isBootstrapRequired(): boolean {
    return this.bootstrapRequired;
  }

  public getMemoryDiaryEntries(): DiaryEntry[] {
    if (!this.getAuthorizedSession()) return [];
    return this.memoryDiaryEntries;
  }

  public getMemoryQuickNotes(): StaffQuickNote[] {
    if (!this.getAuthorizedSession()) return [];
    return this.memoryQuickNotes;
  }

  public getPendingMutations(): PendingStaffMutation[] {
    if (!this.getAuthorizedSession()) return [];
    return this.memoryPendingQueue;
  }

  public getDiaryCycleState(): DiaryCycleInfo {
    const estimatedServerNow = Date.now() + this.serverClockOffsetMs;
    const computed = getDiaryCycleInfo(estimatedServerNow);
    if (
      this.diaryCycleInfo &&
      this.diaryCycleInfo.activeCycleDate === computed.activeCycleDate
    ) {
      return {
        ...this.diaryCycleInfo,
        serverTimestamp: estimatedServerNow,
        msUntilNextRefresh: Math.max(0, this.diaryCycleInfo.nextRefreshAtMs - estimatedServerNow),
      };
    }
    return computed;
  }

  public getActiveDiaryCycleDate(): string {
    return this.getDiaryCycleState().activeCycleDate;
  }

  private updateCycleStateFromServer(cycleInfo?: DiaryCycleInfo, serverTimestamp?: number): void {
    const refNow =
      typeof serverTimestamp === 'number' && Number.isFinite(serverTimestamp)
        ? serverTimestamp
        : cycleInfo?.serverTimestamp;
    if (typeof refNow === 'number' && Number.isFinite(refNow)) {
      this.serverClockOffsetMs = refNow - Date.now();
    }
    const resolvedCycle =
      cycleInfo && cycleInfo.activeCycleDate
        ? cycleInfo
        : getDiaryCycleInfo(Date.now() + this.serverClockOffsetMs);
    this.diaryCycleInfo = resolvedCycle;
    this.scheduleClientRolloverReconcile(resolvedCycle.msUntilNextRefresh);
  }

  private scheduleClientRolloverReconcile(msUntilNextRefresh: number): void {
    if (typeof window === 'undefined') return;
    if (this.rolloverTimer) {
      clearTimeout(this.rolloverTimer);
      this.rolloverTimer = null;
    }
    const delay = Math.min(2147483647, Math.max(500, msUntilNextRefresh + 250));
    this.rolloverTimer = setTimeout(() => {
      if (this.getAuthorizedSession()) {
        this.reconcileDiaryCycle()
          .then(() => this.fetchDiaryEntries())
          .catch(() => {});
      }
    }, delay);
  }

  private sortDiaryEntries(entries: DiaryEntry[]): DiaryEntry[] {
    return [...entries].sort((a, b) => {
      const dateCmp = String(b.date || '').localeCompare(String(a.date || ''));
      if (dateCmp !== 0) return dateCmp;
      return (
        (b.updatedAt || b.publishedAt || b.createdAt || 0) -
        (a.updatedAt || a.publishedAt || a.createdAt || 0)
      );
    });
  }

  public clearMemoryCache(): void {
    this.memoryDiaryEntries = [];
    this.memoryQuickNotes = [];
    this.memoryPendingQueue = [];
    if (this.rolloverTimer) {
      clearTimeout(this.rolloverTimer);
      this.rolloverTimer = null;
    }
    this.notify();
  }

  private getAuthHeaders(extraHeaders: Record<string, string> = {}): Record<string, string> {
    const session = this.getAuthorizedSession();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...extraHeaders,
    };
    if (session?.token) {
      headers['Authorization'] = `Bearer ${session.token}`;
      headers['X-Nexora-Role'] = session.user.role;
    }
    return headers;
  }

  /**
   * Verify authentication status with the backend server.
   */
  public async checkAuthStatus(): Promise<StaffAuthStatusResponse> {
    const session = this.getAuthorizedSession();
    try {
      const res = await fetch(resolveApiUrl('/api/staff/auth/status'), {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });
      if (!res.ok) {
        throw new Error(`Status check failed (${res.status})`);
      }
      const data = (await res.json()) as StaffAuthStatusResponse;
      this.bootstrapRequired = Boolean(data.bootstrapRequired);

      if (session && !data.authenticated) {
        // Server invalidated or expired the session
        this.clearStoredSession();
      } else if (session && data.authenticated && data.user) {
        this.persistSessionToStorage({
          token: session.token,
          user: data.user,
          expiresAt: data.expiresAt || session.expiresAt,
        });
      } else {
        this.notify();
      }
      return data;
    } catch {
      // Offline fallback: preserve valid local session token until expiry so staff can read their own account-isolated cache
      return {
        bootstrapRequired: this.bootstrapRequired,
        authenticated: Boolean(session),
        user: session?.user || null,
        expiresAt: session?.expiresAt,
      };
    }
  }

  /**
   * Initial one-time staff provisioning when no accounts exist on the backend yet.
   */
  public async bootstrapInitialStaff(payload: {
    setupKey?: string;
    developerUsername: string;
    developerPassword: string;
    developerDisplayName?: string;
    teacherUsername?: string;
    teacherPassword?: string;
    teacherDisplayName?: string;
  }): Promise<{ success: boolean; session?: StaffSession; error?: string }> {
    try {
      const res = await fetch(resolveApiUrl('/api/staff/auth/bootstrap'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        return {
          success: false,
          error: data.error || `Bootstrap failed (${res.status})`,
        };
      }
      this.bootstrapRequired = false;
      const session: StaffSession = {
        token: data.token,
        expiresAt: data.expiresAt,
        user: data.user,
      };
      this.persistSessionToStorage(session);
      await this.loadAccountCacheIntoMemory(session.user.id);
      return { success: true, session };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Network error while connecting to staff authentication server.',
      };
    }
  }

  /**
   * Authenticate with staff username and password.
   */
  public async login(
    username: string,
    password: string
  ): Promise<{ success: boolean; session?: StaffSession; error?: string }> {
    try {
      const res = await fetch(resolveApiUrl('/api/staff/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        return {
          success: false,
          error: data.error || `Sign-in failed (${res.status})`,
        };
      }
      const session: StaffSession = {
        token: data.token,
        expiresAt: data.expiresAt,
        user: data.user,
      };
      this.persistSessionToStorage(session);
      await this.loadAccountCacheIntoMemory(session.user.id);
      // Trigger sync and fresh fetch from shared backend immediately after login
      await this.syncPendingMutations();
      await Promise.all([this.fetchDiaryEntries(), this.fetchQuickNotes()]);
      return { success: true, session };
    } catch (err: any) {
      return {
        success: false,
        error:
          err?.message ||
          'Unable to reach NEXORA authentication server. Check your internet connection or server URL.',
      };
    }
  }

  /**
   * Log out the current staff user, revoke server session, and immediately wipe in-memory protected caches.
   */
  public async logout(clearDeviceOfflineCache = false): Promise<void> {
    const session = this.currentSession;
    const accountId = session?.user?.id || '';
    try {
      if (session?.token) {
        await fetch(resolveApiUrl('/api/staff/auth/logout'), {
          method: 'POST',
          headers: this.getAuthHeaders(),
        });
      }
    } catch {
      // Ignore network errors during logout; local revocation still proceeds immediately
    }
    if (clearDeviceOfflineCache && accountId) {
      await idbClearAccountStore(accountId);
    }
    this.clearStoredSession();
  }

  private async loadAccountCacheIntoMemory(accountId: string): Promise<void> {
    if (!this.getAuthorizedSession() || this.getAuthorizedSession()?.user.id !== accountId) {
      return;
    }
    const [cachedDiary, cachedNotes, cachedQueue] = await Promise.all([
      idbGetAccountRecords<DiaryEntry>(STORE_DIARY, accountId),
      idbGetAccountRecords<StaffQuickNote>(STORE_NOTES, accountId),
      idbGetAccountRecords<PendingStaffMutation>(STORE_QUEUE, accountId),
    ]);
    this.memoryDiaryEntries = this.sortDiaryEntries(cachedDiary);
    this.memoryQuickNotes = this.sortQuickNotes(cachedNotes);
    this.memoryPendingQueue = cachedQueue.sort((a, b) => a.createdAt - b.createdAt);
    this.notify();
  }

  private sortQuickNotes(notes: StaffQuickNote[]): StaffQuickNote[] {
    return [...notes].sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) {
        return a.pinned ? -1 : 1;
      }
      return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);
    });
  }

  // ============================================================================
  // DEVELOPER-ONLY STAFF ACCOUNT & ROLE MANAGEMENT
  // ============================================================================

  public async listStaffAccounts(): Promise<{
    accounts: StaffAccountSummary[];
    error?: string;
  }> {
    const session = this.getAuthorizedSession();
    if (!session || session.user.role !== 'developer') {
      return { accounts: [], error: 'Forbidden: Only Developer role can manage staff accounts.' };
    }
    try {
      const res = await fetch(resolveApiUrl('/api/staff/accounts'), {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });
      if (res.status === 401 || res.status === 403) {
        if (res.status === 401) this.clearStoredSession();
        const errData = await res.json().catch(() => ({}));
        return { accounts: [], error: errData.error || 'Unauthorized access.' };
      }
      const data = await res.json();
      return { accounts: Array.isArray(data.accounts) ? data.accounts : [] };
    } catch (err: any) {
      return { accounts: [], error: err?.message || 'Failed to load staff accounts.' };
    }
  }

  public async upsertStaffAccount(payload: {
    id?: string;
    username: string;
    password?: string;
    displayName: string;
    role: StaffRole;
    title?: string;
    active?: boolean;
  }): Promise<{ success: boolean; account?: StaffAccountSummary; error?: string }> {
    const session = this.getAuthorizedSession();
    if (!session || session.user.role !== 'developer') {
      return { success: false, error: 'Forbidden: Developer access required.' };
    }
    try {
      const res = await fetch(resolveApiUrl('/api/staff/accounts'), {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || 'Failed to save staff account.' };
      }
      return { success: true, account: data.account };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network error while saving staff account.' };
    }
  }

  public async deleteStaffAccount(
    accountId: string
  ): Promise<{ success: boolean; error?: string }> {
    const session = this.getAuthorizedSession();
    if (!session || session.user.role !== 'developer') {
      return { success: false, error: 'Forbidden: Developer access required.' };
    }
    try {
      const res = await fetch(resolveApiUrl(`/api/staff/accounts/${encodeURIComponent(accountId)}`), {
        method: 'DELETE',
        headers: this.getAuthHeaders(),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || 'Failed to delete staff account.' };
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network error while deleting staff account.' };
    }
  }

  // ============================================================================
  // PROTECTED DIARY ENTRIES, 2:00 PM IST DAILY CYCLE & ATTACHMENTS
  // ============================================================================

  /**
   * Reconciles the 2:00 PM IST (Asia/Kolkata) daily diary cycle with the authoritative server clock.
   */
  public async reconcileDiaryCycle(options?: {
    simulatedNowMs?: number;
    isolatedSimulation?: boolean;
    entriesSnapshot?: DiaryEntry[];
    cycleStateSnapshot?: any;
    forceEnsureActiveEntry?: boolean;
  }): Promise<{
    success: boolean;
    cycleInfo?: DiaryCycleInfo;
    activeEntry?: DiaryEntry | null;
    createdNewCycleEntry?: boolean;
    entries?: DiaryEntry[];
    cycleState?: any;
    error?: string;
  }> {
    const session = this.getAuthorizedSession();
    if (!session) {
      return {
        success: false,
        error: 'Authentication required: Only Teacher/In-Charge and Developer roles can access the Diary.',
      };
    }

    try {
      const res = await fetch(resolveApiUrl('/api/diary/cycle/reconcile'), {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(options || {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return {
          success: false,
          error: data.error || `Failed to reconcile diary cycle (${res.status})`,
        };
      }
      if (!options?.isolatedSimulation && data.cycleInfo) {
        this.updateCycleStateFromServer(data.cycleInfo, data.serverTimestamp);
      }
      return {
        success: true,
        cycleInfo: data.cycleInfo,
        activeEntry: data.activeEntry,
        createdNewCycleEntry: Boolean(data.createdNewCycleEntry),
        entries: Array.isArray(data.entries) ? data.entries : [],
        cycleState: data.cycleState,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Offline: Unable to reach server for diary cycle reconciliation.',
      };
    }
  }

  public async fetchDiaryEntries(): Promise<{
    entries: DiaryEntry[];
    cycleInfo?: DiaryCycleInfo;
    offline: boolean;
    error?: string;
  }> {
    const session = this.getAuthorizedSession();
    if (!session) {
      return {
        entries: [],
        offline: false,
        error: 'Authentication required: Only Teacher/In-Charge and Developer roles can access the Diary.',
      };
    }

    const accountId = session.user.id;
    try {
      const res = await fetch(resolveApiUrl('/api/diary/entries'), {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });

      if (res.status === 401 || res.status === 403) {
        const errData = await res.json().catch(() => ({}));
        if (res.status === 401) this.clearStoredSession();
        return {
          entries: [],
          offline: false,
          error: errData.error || 'Session expired or unauthorized. Please sign in again.',
        };
      }

      if (!res.ok) {
        throw new Error(`Failed to fetch diary entries (${res.status})`);
      }

      const data = await res.json();
      if (data.cycleInfo || data.serverTimestamp) {
        this.updateCycleStateFromServer(data.cycleInfo, data.serverTimestamp);
      }
      const serverEntries: DiaryEntry[] = Array.isArray(data.entries) ? data.entries : [];

      // Merge any unsynced local pending diary entries for this account so they aren't lost before sync
      const pendingQueue = await idbGetAccountRecords<PendingStaffMutation>(STORE_QUEUE, accountId);
      const pendingDeletes = new Set(
        pendingQueue
          .filter((m) => m.target === 'diary' && m.operation === 'delete')
          .map((m) => m.recordId)
      );
      const pendingDiaryCreates = pendingQueue
        .filter((m) => m.target === 'diary' && (m.operation === 'create' || m.operation === 'update'))
        .map((m) => ({
          ...(m.payload as DiaryEntry),
          syncStatus: m.status,
          syncError: m.errorMessage,
        }));

      const mergedMap = new Map<string, DiaryEntry>();
      for (const entry of serverEntries) {
        if (!pendingDeletes.has(entry.id)) {
          mergedMap.set(entry.id, { ...entry, syncStatus: 'synced' });
        }
      }
      for (const pendingEntry of pendingDiaryCreates) {
        if (pendingEntry && pendingEntry.id) {
          mergedMap.set(pendingEntry.id, pendingEntry);
        }
      }

      const merged = this.sortDiaryEntries(Array.from(mergedMap.values()));

      this.memoryDiaryEntries = merged;
      await idbReplaceAccountRecords(STORE_DIARY, accountId, merged);
      this.notify();
      return { entries: merged, cycleInfo: this.getDiaryCycleState(), offline: false };
    } catch {
      // Offline fallback: read from account-isolated IndexedDB cache ONLY for this authenticated staff user
      const cached = await idbGetAccountRecords<DiaryEntry>(STORE_DIARY, accountId);
      const sorted = this.sortDiaryEntries(cached);
      this.memoryDiaryEntries = sorted;
      this.notify();
      return { entries: sorted, cycleInfo: this.getDiaryCycleState(), offline: true };
    }
  }

  public async saveDiaryEntry(
    input: SaveDiaryInput
  ): Promise<{
    success: boolean;
    entry?: DiaryEntry;
    cycleInfo?: DiaryCycleInfo;
    queuedOffline?: boolean;
    conflict?: boolean;
    latestEntry?: DiaryEntry;
    error?: string;
  }> {
    const session = this.getAuthorizedSession();
    if (!session) {
      return {
        success: false,
        error: 'Unauthorized: You must be signed in as Teacher/In-Charge or Developer to publish diary entries.',
      };
    }

    const accountId = session.user.id;
    const isUpdate = Boolean(input.id);
    const effectiveDate = (input.date || this.getActiveDiaryCycleDate() || getActiveDiaryCycleDateIST()).trim();
    const idempotencyKey =
      input.idempotencyKey || `diary-${accountId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const payload = {
      ...input,
      date: effectiveDate,
      idempotencyKey,
    };

    try {
      const endpoint = isUpdate
        ? resolveApiUrl(`/api/diary/entries/${encodeURIComponent(input.id!)}`)
        : resolveApiUrl('/api/diary/entries');
      const res = await fetch(endpoint, {
        method: isUpdate ? 'PUT' : 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 401 || res.status === 403) {
        if (res.status === 401) this.clearStoredSession();
        return {
          success: false,
          error: data.error || 'Session expired or unauthorized.',
        };
      }

      if (res.status === 409) {
        return {
          success: false,
          conflict: true,
          latestEntry: data.latestEntry,
          error: data.error || 'Concurrent edit conflict detected.',
        };
      }

      if (!res.ok) {
        return {
          success: false,
          error: data.error || `Failed to save diary entry (${res.status})`,
        };
      }

      if (data.cycleInfo) {
        this.updateCycleStateFromServer(data.cycleInfo, data.serverTimestamp);
      }

      const savedEntry: DiaryEntry = {
        ...data.entry,
        syncStatus: 'synced',
      };

      const nextList = this.sortDiaryEntries([
        savedEntry,
        ...this.memoryDiaryEntries.filter((e) => e.id !== savedEntry.id),
      ]);

      this.memoryDiaryEntries = nextList;
      await idbReplaceAccountRecords(STORE_DIARY, accountId, nextList);
      this.notify();
      return { success: true, entry: savedEntry, cycleInfo: this.getDiaryCycleState() };
    } catch {
      // Network unreachable while authenticated: queue in account-isolated offline mutation store
      // Never falsely report an upload as server-confirmed while offline!
      const now = Date.now();
      const tempId = input.id || `diary-local-${now}-${Math.random().toString(36).slice(2, 6)}`;
      const optimisticEntry: DiaryEntry = {
        id: tempId,
        date: effectiveDate,
        subject: input.subject,
        title: input.title || `${input.subject} — ${input.type}`,
        type: input.type,
        content: input.content,
        homework: input.homework || '',
        remarks: input.remarks || '',
        notices: input.notices || '',
        targetStream: input.targetStream || 'ALL',
        authorName: session.user.displayName,
        authorId: session.user.id,
        authorRole: session.user.role,
        authorRoleLabel: session.user.roleLabel,
        createdAt: now,
        updatedAt: now,
        publishedAt: now,
        status: input.status || 'published',
        attachments: input.attachments || [],
        version: (input.baseVersion || 0) + 1,
        syncStatus: 'pending',
        idempotencyKey,
      };

      const mutation: PendingStaffMutation = {
        id: `mut-${now}-${Math.random().toString(36).slice(2, 6)}`,
        accountId,
        target: 'diary',
        operation: isUpdate ? 'update' : 'create',
        recordId: tempId,
        payload: optimisticEntry,
        idempotencyKey,
        baseVersion: input.baseVersion,
        createdAt: now,
        status: 'pending',
      };

      await this.enqueueMutation(accountId, mutation);
      const nextList = this.sortDiaryEntries([
        optimisticEntry,
        ...this.memoryDiaryEntries.filter((e) => e.id !== optimisticEntry.id),
      ]);

      this.memoryDiaryEntries = nextList;
      await idbReplaceAccountRecords(STORE_DIARY, accountId, nextList);
      this.notify();

      return {
        success: true,
        entry: optimisticEntry,
        cycleInfo: this.getDiaryCycleState(),
        queuedOffline: true,
      };
    }
  }

  public async deleteDiaryEntry(
    id: string
  ): Promise<{ success: boolean; queuedOffline?: boolean; error?: string }> {
    const session = this.getAuthorizedSession();
    if (!session) {
      return { success: false, error: 'Unauthorized: Staff authentication required.' };
    }
    const accountId = session.user.id;

    // If deleting a purely local pending diary entry that hasn't synced yet:
    if (id.startsWith('diary-local-')) {
      const queue = await idbGetAccountRecords<PendingStaffMutation>(STORE_QUEUE, accountId);
      const nextQueue = queue.filter((m) => m.recordId !== id);
      this.memoryPendingQueue = nextQueue;
      await idbReplaceAccountRecords(STORE_QUEUE, accountId, nextQueue);
      const nextList = this.memoryDiaryEntries.filter((e) => e.id !== id);
      this.memoryDiaryEntries = nextList;
      await idbReplaceAccountRecords(STORE_DIARY, accountId, nextList);
      this.notify();
      return { success: true };
    }

    try {
      const res = await fetch(resolveApiUrl(`/api/diary/entries/${encodeURIComponent(id)}`), {
        method: 'DELETE',
        headers: this.getAuthHeaders(),
      });
      if (res.status === 401 || res.status === 403) {
        if (res.status === 401) this.clearStoredSession();
        const errData = await res.json().catch(() => ({}));
        return { success: false, error: errData.error || 'Unauthorized to delete diary entry.' };
      }
      if (!res.ok && res.status !== 404) {
        const errData = await res.json().catch(() => ({}));
        return { success: false, error: errData.error || 'Failed to delete diary entry.' };
      }

      const nextList = this.memoryDiaryEntries.filter((e) => e.id !== id);
      this.memoryDiaryEntries = nextList;
      await idbReplaceAccountRecords(STORE_DIARY, accountId, nextList);
      this.notify();
      return { success: true };
    } catch {
      const now = Date.now();
      const mutation: PendingStaffMutation = {
        id: `mut-del-${now}-${Math.random().toString(36).slice(2, 6)}`,
        accountId,
        target: 'diary',
        operation: 'delete',
        recordId: id,
        payload: { id },
        idempotencyKey: `diary-del-${id}-${now}`,
        createdAt: now,
        status: 'pending',
      };
      await this.enqueueMutation(accountId, mutation);
      const nextList = this.memoryDiaryEntries.filter((e) => e.id !== id);
      this.memoryDiaryEntries = nextList;
      await idbReplaceAccountRecords(STORE_DIARY, accountId, nextList);
      this.notify();
      return {
        success: true,
        queuedOffline: true,
      };
    }
  }

  /**
   * Upload a diary file/image attachment (max 5 MB, server-side validated & stored outside public/).
   */
  public async uploadDiaryAttachment(
    file: File
  ): Promise<{ success: boolean; attachment?: DiaryAttachment; error?: string }> {
    const session = this.getAuthorizedSession();
    if (!session) {
      return { success: false, error: 'Unauthorized: Please sign in as staff to upload files.' };
    }

    const MAX_BYTES = 5 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      return {
        success: false,
        error: `File "${file.name}" is ${(file.size / (1024 * 1024)).toFixed(2)} MB, which exceeds the 5 MB limit.`,
      };
    }

    const allowedExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.pdf', '.txt', '.doc', '.docx'];
    const lowerName = file.name.toLowerCase();
    if (!allowedExtensions.some((ext) => lowerName.endsWith(ext))) {
      return {
        success: false,
        error: `Unsupported file type for "${file.name}". Allowed: Images (.png, .jpg, .webp, .gif), PDF (.pdf), Word (.doc, .docx), and Text (.txt).`,
      };
    }

    try {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Failed to read selected file'));
        reader.readAsDataURL(file);
      });

      const res = await fetch(resolveApiUrl('/api/diary/attachments/upload'), {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          base64Data,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.status === 401 || res.status === 403) {
        if (res.status === 401) this.clearStoredSession();
        return { success: false, error: data.error || 'Session expired or unauthorized.' };
      }
      if (!res.ok) {
        return { success: false, error: data.error || 'Attachment upload failed.' };
      }

      return { success: true, attachment: data.attachment as DiaryAttachment };
    } catch (err: any) {
      return {
        success: false,
        error:
          err?.message ||
          'Attachment upload requires an active server connection. Please verify connectivity and retry.',
      };
    }
  }

  /**
   * Request a short-lived signed ticket to preview or download a protected diary attachment.
   */
  public async getProtectedAttachmentUrl(
    attachmentId: string,
    inline = true
  ): Promise<{ url?: string; error?: string }> {
    const session = this.getAuthorizedSession();
    if (!session) {
      return { error: 'Unauthorized: Staff sign-in required to view protected attachments.' };
    }
    try {
      const res = await fetch(
        resolveApiUrl(`/api/diary/attachments/${encodeURIComponent(attachmentId)}/ticket`),
        {
          method: 'POST',
          headers: this.getAuthHeaders(),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { error: data.error || 'Unable to authorize attachment access.' };
      }
      const rawPath = inline ? data.inlineUrl : data.downloadUrl;
      return { url: resolveApiUrl(rawPath) };
    } catch (err: any) {
      return { error: err?.message || 'Network error while requesting attachment access ticket.' };
    }
  }

  // ============================================================================
  // PRIVATE STAFF-ONLY QUICK NOTES (SHARED ACROSS TEACHER/IN-CHARGE & DEVELOPER)
  // ============================================================================

  public async fetchQuickNotes(): Promise<{
    notes: StaffQuickNote[];
    offline: boolean;
    error?: string;
  }> {
    const session = this.getAuthorizedSession();
    if (!session) {
      return {
        notes: [],
        offline: false,
        error: 'Forbidden: Quick Notes is strictly restricted to Teacher/In-Charge and Developer roles.',
      };
    }

    const accountId = session.user.id;
    try {
      const res = await fetch(resolveApiUrl('/api/quick-notes'), {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });

      if (res.status === 401 || res.status === 403) {
        const errData = await res.json().catch(() => ({}));
        if (res.status === 401) this.clearStoredSession();
        return {
          notes: [],
          offline: false,
          error: errData.error || 'Unauthorized access to Quick Notes.',
        };
      }

      if (!res.ok) {
        throw new Error(`Failed to load Quick Notes (${res.status})`);
      }

      const data = await res.json();
      const serverNotes: StaffQuickNote[] = Array.isArray(data.notes) ? data.notes : [];

      const pendingQueue = await idbGetAccountRecords<PendingStaffMutation>(STORE_QUEUE, accountId);
      const pendingNoteMutations = pendingQueue
        .filter((m) => m.target === 'quick_note' && (m.operation === 'create' || m.operation === 'update'))
        .map((m) => ({
          ...(m.payload as StaffQuickNote),
          syncStatus: m.status,
          syncError: m.errorMessage,
        }));

      const mergedMap = new Map<string, StaffQuickNote>();
      for (const note of serverNotes) {
        mergedMap.set(note.id, { ...note, syncStatus: 'synced' });
      }
      for (const pendingNote of pendingNoteMutations) {
        if (pendingNote && pendingNote.id) {
          mergedMap.set(pendingNote.id, pendingNote);
        }
      }

      const sorted = this.sortQuickNotes(Array.from(mergedMap.values()));
      this.memoryQuickNotes = sorted;
      await idbReplaceAccountRecords(STORE_NOTES, accountId, sorted);
      this.notify();
      return { notes: sorted, offline: false };
    } catch {
      const cached = await idbGetAccountRecords<StaffQuickNote>(STORE_NOTES, accountId);
      const sorted = this.sortQuickNotes(cached);
      this.memoryQuickNotes = sorted;
      this.notify();
      return { notes: sorted, offline: true };
    }
  }

  public async createQuickNote(
    input: SaveQuickNoteInput
  ): Promise<{
    success: boolean;
    note?: StaffQuickNote;
    queuedOffline?: boolean;
    error?: string;
  }> {
    const session = this.getAuthorizedSession();
    if (!session) {
      return {
        success: false,
        error: 'Unauthorized: Only authenticated Teacher/In-Charge and Developer users can create Quick Notes.',
      };
    }

    const content = (input.content || '').trim();
    if (!content) {
      return { success: false, error: 'Quick Note content cannot be empty.' };
    }

    const accountId = session.user.id;
    const idempotencyKey =
      input.idempotencyKey || `qnote-${accountId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    try {
      const res = await fetch(resolveApiUrl('/api/quick-notes'), {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
          title: input.title?.trim() || '',
          content,
          category: input.category || 'general',
          pinned: Boolean(input.pinned),
          idempotencyKey,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.status === 401 || res.status === 403) {
        if (res.status === 401) this.clearStoredSession();
        return { success: false, error: data.error || 'Session expired or unauthorized.' };
      }
      if (!res.ok) {
        return { success: false, error: data.error || 'Failed to publish Quick Note.' };
      }

      const savedNote: StaffQuickNote = {
        ...data.note,
        syncStatus: 'synced',
      };

      const nextList = this.sortQuickNotes([
        savedNote,
        ...this.memoryQuickNotes.filter((n) => n.id !== savedNote.id),
      ]);
      this.memoryQuickNotes = nextList;
      await idbReplaceAccountRecords(STORE_NOTES, accountId, nextList);
      this.notify();
      return { success: true, note: savedNote };
    } catch {
      const now = Date.now();
      const tempId = `qnote-local-${now}-${Math.random().toString(36).slice(2, 6)}`;
      const pendingNote: StaffQuickNote = {
        id: tempId,
        title: input.title?.trim() || '',
        content,
        category: input.category || 'general',
        pinned: Boolean(input.pinned),
        authorId: session.user.id,
        authorName: session.user.displayName,
        authorRole: session.user.role,
        authorRoleLabel: session.user.roleLabel,
        createdAt: now,
        updatedAt: now,
        version: 1,
        syncStatus: 'pending',
        idempotencyKey,
      };

      const mutation: PendingStaffMutation = {
        id: `mut-${now}-${Math.random().toString(36).slice(2, 6)}`,
        accountId,
        target: 'quick_note',
        operation: 'create',
        recordId: tempId,
        payload: pendingNote,
        idempotencyKey,
        createdAt: now,
        status: 'pending',
      };

      await this.enqueueMutation(accountId, mutation);
      const nextList = this.sortQuickNotes([
        pendingNote,
        ...this.memoryQuickNotes.filter((n) => n.id !== pendingNote.id),
      ]);
      this.memoryQuickNotes = nextList;
      await idbReplaceAccountRecords(STORE_NOTES, accountId, nextList);
      this.notify();

      return {
        success: true,
        note: pendingNote,
        queuedOffline: true,
      };
    }
  }

  public async updateQuickNote(
    id: string,
    input: SaveQuickNoteInput
  ): Promise<{
    success: boolean;
    note?: StaffQuickNote;
    conflict?: boolean;
    latestNote?: StaffQuickNote;
    error?: string;
  }> {
    const session = this.getAuthorizedSession();
    if (!session) {
      return { success: false, error: 'Unauthorized: Staff authentication required.' };
    }

    const accountId = session.user.id;
    try {
      const res = await fetch(resolveApiUrl(`/api/quick-notes/${encodeURIComponent(id)}`), {
        method: 'PUT',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
          title: input.title,
          content: input.content,
          category: input.category,
          pinned: input.pinned,
          baseVersion: input.baseVersion,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.status === 401 || res.status === 403) {
        if (res.status === 401) this.clearStoredSession();
        return { success: false, error: data.error || 'Unauthorized to edit Quick Note.' };
      }

      if (res.status === 409) {
        return {
          success: false,
          conflict: true,
          latestNote: data.latestNote,
          error:
            data.error ||
            'Another staff member updated this Quick Note simultaneously. Review the latest version before saving.',
        };
      }

      if (!res.ok) {
        return { success: false, error: data.error || 'Failed to update Quick Note.' };
      }

      const updatedNote: StaffQuickNote = {
        ...data.note,
        syncStatus: 'synced',
      };

      const nextList = this.sortQuickNotes([
        updatedNote,
        ...this.memoryQuickNotes.filter((n) => n.id !== updatedNote.id),
      ]);
      this.memoryQuickNotes = nextList;
      await idbReplaceAccountRecords(STORE_NOTES, accountId, nextList);
      this.notify();
      return { success: true, note: updatedNote };
    } catch {
      return {
        success: false,
        error: 'Updating a shared Quick Note requires an active connection to prevent conflicting edits.',
      };
    }
  }

  public async deleteQuickNote(id: string): Promise<{ success: boolean; error?: string }> {
    const session = this.getAuthorizedSession();
    if (!session) {
      return { success: false, error: 'Unauthorized: Staff authentication required.' };
    }

    const accountId = session.user.id;
    // If deleting a purely local pending note that hasn't synced yet:
    if (id.startsWith('qnote-local-')) {
      const queue = await idbGetAccountRecords<PendingStaffMutation>(STORE_QUEUE, accountId);
      const nextQueue = queue.filter((m) => m.recordId !== id);
      this.memoryPendingQueue = nextQueue;
      await idbReplaceAccountRecords(STORE_QUEUE, accountId, nextQueue);
      const nextList = this.memoryQuickNotes.filter((n) => n.id !== id);
      this.memoryQuickNotes = nextList;
      await idbReplaceAccountRecords(STORE_NOTES, accountId, nextList);
      this.notify();
      return { success: true };
    }

    try {
      const res = await fetch(resolveApiUrl(`/api/quick-notes/${encodeURIComponent(id)}`), {
        method: 'DELETE',
        headers: this.getAuthHeaders(),
      });
      if (res.status === 401 || res.status === 403) {
        if (res.status === 401) this.clearStoredSession();
        const errData = await res.json().catch(() => ({}));
        return { success: false, error: errData.error || 'Unauthorized to delete Quick Note.' };
      }
      if (!res.ok && res.status !== 404) {
        const errData = await res.json().catch(() => ({}));
        return { success: false, error: errData.error || 'Failed to delete Quick Note.' };
      }

      const nextList = this.memoryQuickNotes.filter((n) => n.id !== id);
      this.memoryQuickNotes = nextList;
      await idbReplaceAccountRecords(STORE_NOTES, accountId, nextList);
      this.notify();
      return { success: true };
    } catch {
      return {
        success: false,
        error: 'Deleting a published Quick Note requires an active server connection.',
      };
    }
  }

  // ============================================================================
  // OFFLINE QUEUE MANAGEMENT & RE-AUTHENTICATED REPLAY
  // ============================================================================

  private async enqueueMutation(accountId: string, mutation: PendingStaffMutation): Promise<void> {
    const existing = await idbGetAccountRecords<PendingStaffMutation>(STORE_QUEUE, accountId);
    const updated = [...existing.filter((m) => m.id !== mutation.id), mutation];
    this.memoryPendingQueue = updated;
    await idbReplaceAccountRecords(STORE_QUEUE, accountId, updated);
    this.notify();
  }

  /**
   * Replay pending offline mutations ONLY after verifying that the staff session is still valid.
   */
  public async syncPendingMutations(): Promise<{
    syncedCount: number;
    failedCount: number;
    error?: string;
  }> {
    if (this.syncInProgress) {
      return { syncedCount: 0, failedCount: 0 };
    }

    const session = this.getAuthorizedSession();
    if (!session) {
      return { syncedCount: 0, failedCount: 0, error: 'Not authenticated' };
    }

    const accountId = session.user.id;
    const queue = await idbGetAccountRecords<PendingStaffMutation>(STORE_QUEUE, accountId);
    if (queue.length === 0) {
      return { syncedCount: 0, failedCount: 0 };
    }

    this.syncInProgress = true;
    try {
      // Re-validate session & role with the backend before replaying any queued mutations
      const authStatus = await this.checkAuthStatus();
      if (!authStatus.authenticated || !authStatus.user) {
        const failedQueue = queue.map((m) => ({
          ...m,
          status: 'failed' as const,
          errorMessage: 'Session expired before offline changes could sync. Please sign in again.',
        }));
        this.memoryPendingQueue = failedQueue;
        await idbReplaceAccountRecords(STORE_QUEUE, accountId, failedQueue);
        this.notify();
        return {
          syncedCount: 0,
          failedCount: failedQueue.length,
          error: 'Session expired before offline changes could sync.',
        };
      }

      const res = await fetch(resolveApiUrl('/api/staff/sync'), {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ mutations: queue }),
      });

      if (!res.ok) {
        throw new Error(`Sync request failed (${res.status})`);
      }

      const data = await res.json();
      const results: Array<{ mutationId: string; status: string; error?: string }> = Array.isArray(
        data.results
      )
        ? data.results
        : [];

      const remainingQueue: PendingStaffMutation[] = [];
      let syncedCount = 0;
      let failedCount = 0;

      for (const item of queue) {
        const match = results.find((r) => r.mutationId === item.id);
        if (match && match.status === 'synced') {
          syncedCount++;
        } else if (match) {
          failedCount++;
          remainingQueue.push({
            ...item,
            status: 'failed',
            errorMessage: match.error || 'Sync rejected by server',
          });
        } else {
          remainingQueue.push(item);
        }
      }

      this.memoryPendingQueue = remainingQueue;
      await idbReplaceAccountRecords(STORE_QUEUE, accountId, remainingQueue);

      // Refresh canonical server state after replay
      await Promise.all([this.fetchDiaryEntries(), this.fetchQuickNotes()]);
      this.notify();
      return { syncedCount, failedCount };
    } catch (err: any) {
      return {
        syncedCount: 0,
        failedCount: 0,
        error: err?.message || 'Offline sync deferred until connection is restored.',
      };
    } finally {
      this.syncInProgress = false;
    }
  }


  /**
   * List all teacher accounts (Teacher & Developer authorized)
   */
  public async listTeachers(): Promise<{ success: boolean; teachers: StaffAccountSummary[]; error?: string }> {
    try {
      const res = await fetch(resolveApiUrl('/api/staff/teachers'), {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, teachers: [], error: data.error || `Failed to fetch teachers (${res.status})` };
      }
      return { success: true, teachers: data.teachers || [] };
    } catch (err: any) {
      return { success: false, teachers: [], error: err?.message || 'Network error' };
    }
  }

  /**
   * Add a new teacher account
   */
  public async createTeacherAccount(payload: {
    username: string;
    displayName: string;
    title: string;
    password: string;
  }): Promise<{ success: boolean; teacher?: StaffAccountSummary; error?: string }> {
    try {
      const res = await fetch(resolveApiUrl('/api/staff/teachers'), {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || `Failed to add teacher (${res.status})` };
      }
      return { success: true, teacher: data.teacher };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network error' };
    }
  }

  /**
   * Reset teacher password
   */
  public async resetTeacherPassword(
    id: string,
    newPassword: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(resolveApiUrl(`/api/staff/teachers/${id}/reset-password`), {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || `Failed to reset password (${res.status})` };
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network error' };
    }
  }

  /**
   * Update teacher account
   */
  public async updateTeacherAccount(
    id: string,
    payload: { displayName?: string; title?: string; active?: boolean }
  ): Promise<{ success: boolean; teacher?: StaffAccountSummary; error?: string }> {
    try {
      const res = await fetch(resolveApiUrl(`/api/staff/teachers/${id}`), {
        method: 'PATCH',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || `Failed to update teacher (${res.status})` };
      }
      return { success: true, teacher: data.teacher };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network error' };
    }
  }

  /**
   * Delete teacher account
   */
  public async deleteTeacherAccount(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(resolveApiUrl(`/api/staff/teachers/${id}`), {
        method: 'DELETE',
        headers: this.getAuthHeaders(),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || `Failed to delete teacher (${res.status})` };
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network error' };
    }
  }

  /**
   * Student / Character Management (Developer-Only)
   */
  public async fetchServerStudents(): Promise<any[]> {
    try {
      const res = await fetch(resolveApiUrl('/api/students'));
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.students) ? data.students : [];
    } catch {
      return [];
    }
  }

  public async addStudent(studentData: {
    name: string;
    stream: string;
    gender: 'boy' | 'girl';
    rollNumber?: number;
  }): Promise<{ success: boolean; student?: any; error?: string }> {
    try {
      const res = await fetch(resolveApiUrl('/api/students'), {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(studentData),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || `Failed to add student (${res.status})` };
      }
      return { success: true, student: data.student };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network error' };
    }
  }

  public async updateStudent(
    id: string,
    studentData: {
      name?: string;
      stream?: string;
      gender?: 'boy' | 'girl';
      rollNumber?: number;
    }
  ): Promise<{ success: boolean; student?: any; error?: string }> {
    try {
      const res = await fetch(resolveApiUrl(`/api/students/${id}`), {
        method: 'PATCH',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(studentData),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || `Failed to update student (${res.status})` };
      }
      return { success: true, student: data.student };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network error' };
    }
  }

  public async deleteStudent(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(resolveApiUrl(`/api/students/${id}`), {
        method: 'DELETE',
        headers: this.getAuthHeaders(),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || `Failed to delete student (${res.status})` };
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network error' };
    }
  }

  public async resetStudents(): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(resolveApiUrl('/api/students/reset'), {
        method: 'POST',
        headers: this.getAuthHeaders(),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || `Failed to reset students (${res.status})` };
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network error' };
    }
  }
}

export const staffContentService = new StaffContentService();

