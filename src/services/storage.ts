import {
  DiaryEntry,
  Whiteboard,
  Quiz,
  QuizAttempt,
  TimetableSchedule,
  Student,
  StudentGamificationProfile,
  CalculatorNote,
  StreamType,
  AttendanceStatus,
  DailyAttendanceRecord,
  LeaderboardFilterPreferences,
  StoragePersistenceStatus,
} from '../types';
import {
  TimetableVersion,
  getInitialTimetable,
  getCurrentTimetable,
  getOldTimetable,
  getActiveTimetableVersion,
  setActiveTimetableVersion,
} from '../data/initialTimetable';
import { INITIAL_STUDENTS } from '../data/initialStudents';
import { STARTER_QUIZZES } from '../data/starterQuizzes';
import { resolveApiUrl } from './updateService';
import {
  LEADERBOARD_SCHEMA_VERSION,
  DEFAULT_LEADERBOARD_FILTERS,
  verifyAndNormalizeAttempt,
  findDuplicateSubmission,
  computeLeaderboard,
} from '../utils/leaderboardEngine';

const DB_NAME = 'ClassOS_AbhinavSchool_DB';
const DB_VERSION = 2;

// Storage Keys
const KEYS = {
  TIMETABLE: 'class_os_timetable_v1',
  STUDENTS: 'class_os_students_v1',
  CALCULATOR_HISTORY: 'class_os_calc_history_v1',
  CALCULATOR_MODE: 'class_os_calc_mode_v1',
  DIARY_LOCAL_BACKUP: 'class_os_diary_backup_v1',
  WHITEBOARD_LOCAL_BACKUP: 'class_os_whiteboards_backup_v1',
  QUIZZES_LOCAL_BACKUP: 'class_os_quizzes_backup_v1',
  QUIZ_ATTEMPTS_LOCAL_BACKUP: 'class_os_quiz_attempts_backup_v1',
  LEADERBOARD_PREFS: 'class_os_leaderboard_prefs_v2',
  LEADERBOARD_LAST_SYNC: 'class_os_leaderboard_last_sync_v2',
  ATTENDANCE_RECORDS: 'class_os_daily_attendance_v1',
  LAST_ACTIVE_DATE: 'class_os_last_active_date_v1',
  ACTIVE_STREAM: 'class_os_active_stream_v1',
  CUSTOM_VIDEOS: 'class_os_custom_videos_v1',
  WHEEL_OPTIONS: 'class_os_wheel_options_v1',
  GAMIFICATION_BACKUP: 'class_os_gamification_backup_v1',
  CALCULATOR_NOTES: 'class_os_calc_notes_v1',
};

class StorageService {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private memoryStore: Map<string, string> = new Map();
  private storageWarning: string | null = null;
  private indexedDBHealthy = false;

  constructor() {
    if (typeof window !== 'undefined' && window.indexedDB) {
      this.initDB()
        .then(() => {
          this.indexedDBHealthy = true;
          this.seedStudentsRegistryInIndexedDB().catch(() => {});
        })
        .catch((err) => {
          this.storageWarning = `IndexedDB initialization warning: ${err?.message || 'Using safe local mirror'}`;
        });
    }
  }

  // Safe browser / Node storage access
  private safeGet(key: string): string | null {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
    } catch (e: any) {
      this.storageWarning = `Local storage read restricted: ${e?.message || 'Using in-memory store'}`;
    }
    return this.memoryStore.get(key) || null;
  }

  private safeSet(key: string, val: string): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, val);
        return;
      }
    } catch (e: any) {
      this.storageWarning = `Local storage write restricted: ${e?.message || 'Using in-memory store'}`;
    }
    this.memoryStore.set(key, val);
  }

  private safeRemove(key: string): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
        return;
      }
    } catch {}
    this.memoryStore.delete(key);
  }

  private initDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        return reject(new Error('IndexedDB not available in current runtime'));
      }

      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        // Preserve all v1 stores without erasing existing data
        if (!db.objectStoreNames.contains('diaryEntries')) {
          db.createObjectStore('diaryEntries', { keyPath: 'date' });
        }
        if (!db.objectStoreNames.contains('whiteboards')) {
          db.createObjectStore('whiteboards', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('quizzes')) {
          db.createObjectStore('quizzes', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('quizAttempts')) {
          const attemptsStore = db.createObjectStore('quizAttempts', { keyPath: 'id' });
          attemptsStore.createIndex('by_studentId', 'studentId', { unique: false });
          attemptsStore.createIndex('by_quizId', 'quizId', { unique: false });
          attemptsStore.createIndex('by_timestamp', 'timestamp', { unique: false });
        } else {
          // Safe v1 -> v2 index upgrade on existing quizAttempts store
          const tx = (event.target as IDBOpenDBRequest).transaction;
          if (tx) {
            const attemptsStore = tx.objectStore('quizAttempts');
            if (!attemptsStore.indexNames.contains('by_studentId')) {
              attemptsStore.createIndex('by_studentId', 'studentId', { unique: false });
            }
            if (!attemptsStore.indexNames.contains('by_quizId')) {
              attemptsStore.createIndex('by_quizId', 'quizId', { unique: false });
            }
            if (!attemptsStore.indexNames.contains('by_timestamp')) {
              attemptsStore.createIndex('by_timestamp', 'timestamp', { unique: false });
            }
          }
        }
        if (!db.objectStoreNames.contains('gamificationProfiles')) {
          db.createObjectStore('gamificationProfiles', { keyPath: 'studentName' });
        }
        // v2 stores for Leaderboard settings & verified student registry
        if (!db.objectStoreNames.contains('leaderboardSettings')) {
          db.createObjectStore('leaderboardSettings', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('studentsRegistry')) {
          db.createObjectStore('studentsRegistry', { keyPath: 'id' });
        }
      };

      request.onsuccess = () => {
        this.indexedDBHealthy = true;
        resolve(request.result);
      };
      request.onerror = () => {
        this.dbPromise = null;
        this.storageWarning = `IndexedDB could not be opened: ${request.error?.message || 'Unknown error'}`;
        reject(request.error);
      };
    });

    return this.dbPromise;
  }

  private async seedStudentsRegistryInIndexedDB(): Promise<void> {
    try {
      const db = await this.initDB();
      const students = this.getStudents();
      const tx = db.transaction('studentsRegistry', 'readwrite');
      const store = tx.objectStore('studentsRegistry');
      for (const s of students) {
        store.put(s);
      }
    } catch {}
  }

  // --- DIARY STORAGE ---
  async getDiaryEntry(dateKey: string): Promise<DiaryEntry | null> {
    try {
      const db = await this.initDB();
      return new Promise((resolve) => {
        const tx = db.transaction('diaryEntries', 'readonly');
        const store = tx.objectStore('diaryEntries');
        const req = store.get(dateKey);
        req.onsuccess = () => resolve(req.result || this.getDiaryFromLocalStorage(dateKey));
        req.onerror = () => resolve(this.getDiaryFromLocalStorage(dateKey));
      });
    } catch {
      return this.getDiaryFromLocalStorage(dateKey);
    }
  }

  async saveDiaryEntry(entry: DiaryEntry): Promise<void> {
    this.saveDiaryToLocalStorage(entry);
    try {
      const db = await this.initDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('diaryEntries', 'readwrite');
        const store = tx.objectStore('diaryEntries');
        const req = store.put(entry);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch {}
  }

  async getAllDiaryEntries(): Promise<DiaryEntry[]> {
    try {
      const db = await this.initDB();
      return new Promise((resolve) => {
        const tx = db.transaction('diaryEntries', 'readonly');
        const store = tx.objectStore('diaryEntries');
        const req = store.getAll();
        req.onsuccess = () => {
          const list = (req.result || []) as DiaryEntry[];
          if (list.length === 0) {
            resolve(this.getAllDiaryFromLocalStorage());
          } else {
            resolve(list.sort((a, b) => b.date.localeCompare(a.date)));
          }
        };
        req.onerror = () => resolve(this.getAllDiaryFromLocalStorage());
      });
    } catch {
      return this.getAllDiaryFromLocalStorage();
    }
  }

  private getDiaryFromLocalStorage(dateKey: string): DiaryEntry | null {
    try {
      const raw = this.safeGet(KEYS.DIARY_LOCAL_BACKUP);
      if (!raw) return null;
      const dict: Record<string, DiaryEntry> = JSON.parse(raw);
      return dict[dateKey] || null;
    } catch {
      return null;
    }
  }

  private saveDiaryToLocalStorage(entry: DiaryEntry) {
    try {
      const raw = this.safeGet(KEYS.DIARY_LOCAL_BACKUP);
      const dict: Record<string, DiaryEntry> = raw ? JSON.parse(raw) : {};
      dict[entry.date] = entry;
      this.safeSet(KEYS.DIARY_LOCAL_BACKUP, JSON.stringify(dict));
    } catch (e) {
      console.error('Safe storage write error for diary:', e);
    }
  }

  private getAllDiaryFromLocalStorage(): DiaryEntry[] {
    try {
      const raw = this.safeGet(KEYS.DIARY_LOCAL_BACKUP);
      if (!raw) return [];
      const dict: Record<string, DiaryEntry> = JSON.parse(raw);
      return Object.values(dict).sort((a, b) => b.date.localeCompare(a.date));
    } catch {
      return [];
    }
  }

  // --- WHITEBOARD STORAGE ---
  async getWhiteboards(): Promise<Whiteboard[]> {
    try {
      const db = await this.initDB();
      return new Promise((resolve) => {
        const tx = db.transaction('whiteboards', 'readonly');
        const store = tx.objectStore('whiteboards');
        const req = store.getAll();
        req.onsuccess = () => {
          const list = req.result as Whiteboard[];
          if (!list || list.length === 0) {
            resolve(this.getWhiteboardsFromLocalStorage());
          } else {
            resolve(list.sort((a, b) => b.updatedAt - a.updatedAt));
          }
        };
        req.onerror = () => resolve(this.getWhiteboardsFromLocalStorage());
      });
    } catch {
      return this.getWhiteboardsFromLocalStorage();
    }
  }

  async saveWhiteboard(board: Whiteboard): Promise<void> {
    this.saveWhiteboardToLocalStorage(board);
    try {
      const db = await this.initDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('whiteboards', 'readwrite');
        const store = tx.objectStore('whiteboards');
        const req = store.put(board);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch {}
  }

  async deleteWhiteboard(id: string): Promise<void> {
    try {
      const db = await this.initDB();
      const tx = db.transaction('whiteboards', 'readwrite');
      tx.objectStore('whiteboards').delete(id);
    } catch {}

    try {
      const raw = this.safeGet(KEYS.WHITEBOARD_LOCAL_BACKUP);
      if (raw) {
        const list: Whiteboard[] = JSON.parse(raw);
        this.safeSet(
          KEYS.WHITEBOARD_LOCAL_BACKUP,
          JSON.stringify(list.filter((b) => b.id !== id))
        );
      }
    } catch {}
  }

  private getWhiteboardsFromLocalStorage(): Whiteboard[] {
    try {
      const raw = this.safeGet(KEYS.WHITEBOARD_LOCAL_BACKUP);
      if (!raw) {
        return [
          {
            id: 'wb-default',
            name: 'Class 11 Main Board',
            updatedAt: Date.now(),
            background: 'cartesian',
            strokes: [],
          },
        ];
      }
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  private saveWhiteboardToLocalStorage(board: Whiteboard) {
    try {
      const current = this.getWhiteboardsFromLocalStorage();
      const idx = current.findIndex((b) => b.id === board.id);
      if (idx >= 0) {
        current[idx] = board;
      } else {
        current.push(board);
      }
      this.safeSet(KEYS.WHITEBOARD_LOCAL_BACKUP, JSON.stringify(current));
    } catch {}
  }

  // --- QUIZZES & LEADERBOARDS ---
  private getQuizzesFromLocalStorage(): Quiz[] {
    try {
      const raw = this.safeGet(KEYS.QUIZZES_LOCAL_BACKUP);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return STARTER_QUIZZES;
  }

  private saveQuizToLocalStorage(quiz: Quiz) {
    try {
      const current = this.getQuizzesFromLocalStorage();
      const idx = current.findIndex((q) => q.id === quiz.id);
      if (idx >= 0) {
        current[idx] = quiz;
      } else {
        current.unshift(quiz);
      }
      this.safeSet(KEYS.QUIZZES_LOCAL_BACKUP, JSON.stringify(current));
    } catch {}
  }

  private deleteQuizFromLocalStorage(id: string) {
    try {
      const current = this.getQuizzesFromLocalStorage();
      this.safeSet(
        KEYS.QUIZZES_LOCAL_BACKUP,
        JSON.stringify(current.filter((q) => q.id !== id))
      );
    } catch {}
  }

  async getQuizzes(): Promise<Quiz[]> {
    try {
      const db = await this.initDB();
      return new Promise((resolve) => {
        const tx = db.transaction('quizzes', 'readonly');
        const store = tx.objectStore('quizzes');
        const req = store.getAll();
        req.onsuccess = () => {
          const list = req.result as Quiz[];
          if (!list || list.length === 0) {
            const localList = this.getQuizzesFromLocalStorage();
            for (const q of localList) {
              this.saveQuiz(q);
            }
            resolve(localList);
          } else {
            // Merge with local mirror so nothing is lost on Android WebView
            const localList = this.getQuizzesFromLocalStorage();
            const map = new Map<string, Quiz>();
            for (const q of localList) map.set(q.id, q);
            for (const q of list) map.set(q.id, q);
            resolve(Array.from(map.values()));
          }
        };
        req.onerror = () => resolve(this.getQuizzesFromLocalStorage());
      });
    } catch {
      return this.getQuizzesFromLocalStorage();
    }
  }

  async saveQuiz(quiz: Quiz): Promise<void> {
    this.saveQuizToLocalStorage(quiz);
    try {
      const db = await this.initDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('quizzes', 'readwrite');
        const store = tx.objectStore('quizzes');
        const req = store.put(quiz);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch {}
  }

  async deleteQuiz(id: string): Promise<void> {
    this.deleteQuizFromLocalStorage(id);
    try {
      const db = await this.initDB();
      const tx = db.transaction('quizzes', 'readwrite');
      tx.objectStore('quizzes').delete(id);
    } catch {}
  }

  private getQuizAttemptsFromLocalStorage(): QuizAttempt[] {
    try {
      const raw = this.safeGet(KEYS.QUIZ_ATTEMPTS_LOCAL_BACKUP);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed
            .filter((a) => a && typeof a === 'object' && a.id)
            .sort((a: QuizAttempt, b: QuizAttempt) => b.timestamp - a.timestamp);
        }
      }
    } catch {}
    return [];
  }

  private saveQuizAttemptToLocalStorage(attempt: QuizAttempt) {
    try {
      const current = this.getQuizAttemptsFromLocalStorage();
      const idx = current.findIndex((a) => a.id === attempt.id);
      if (idx >= 0) {
        current[idx] = attempt;
      } else {
        current.unshift(attempt);
      }
      // Never overwrite valid saved records with an empty list
      if (current.length > 0) {
        this.safeSet(KEYS.QUIZ_ATTEMPTS_LOCAL_BACKUP, JSON.stringify(current));
      }
    } catch {}
  }

  private saveAllQuizAttemptsToLocalStorage(attempts: QuizAttempt[]) {
    try {
      if (!Array.isArray(attempts)) return;
      // Guard against accidentally overwriting existing saved records with an empty array
      const existing = this.getQuizAttemptsFromLocalStorage();
      if (attempts.length === 0 && existing.length > 0) {
        return;
      }
      this.safeSet(KEYS.QUIZ_ATTEMPTS_LOCAL_BACKUP, JSON.stringify(attempts));
    } catch {}
  }

  /**
   * Loads all persisted quiz attempts from IndexedDB (primary database) and safe local mirror,
   * validating each record against the verified Class 11 roster and quiz answer keys.
   * Never overwrites valid saved records with an empty array when a read fails.
   */
  async getQuizAttempts(): Promise<QuizAttempt[]> {
    const students = this.getStudents();
    const quizzes = await this.getQuizzes();
    const quizzesMap = new Map<string, Quiz>();
    for (const q of quizzes) {
      if (q && q.id) quizzesMap.set(q.id, q);
    }

    const localList = this.getQuizAttemptsFromLocalStorage();
    let idbList: QuizAttempt[] = [];
    let idbReadSucceeded = false;

    try {
      const db = await this.initDB();
      idbList = await new Promise<QuizAttempt[]>((resolve) => {
        const tx = db.transaction('quizAttempts', 'readonly');
        const store = tx.objectStore('quizAttempts');
        const req = store.getAll();
        req.onsuccess = () => {
          idbReadSucceeded = true;
          resolve((req.result || []) as QuizAttempt[]);
        };
        req.onerror = () => {
          this.storageWarning = `IndexedDB read error: ${req.error?.message || 'Fallback active'}`;
          resolve([]);
        };
      });
    } catch (e: any) {
      this.storageWarning = `IndexedDB unavailable: ${e?.message || 'Using safe local mirror'}`;
    }

    // Merge local mirror and IndexedDB records by stable attempt ID
    const mergedMap = new Map<string, QuizAttempt>();
    const rawCombined = [...localList, ...idbList];
    const needsIdbBackfill: QuizAttempt[] = [];
    const idbIds = new Set(idbList.map((a) => a?.id));

    for (const rawAtt of rawCombined) {
      const verified = verifyAndNormalizeAttempt(rawAtt, quizzesMap, students);
      if (!verified.valid || !verified.attempt) continue;
      const normalized = verified.attempt;
      const existing = mergedMap.get(normalized.id);
      if (!existing) {
        mergedMap.set(normalized.id, normalized);
      } else {
        // Keep sync status if either copy is already marked synced
        if (existing.synced && !normalized.synced) {
          mergedMap.set(normalized.id, existing);
        } else {
          mergedMap.set(normalized.id, normalized);
        }
      }
      if (idbReadSucceeded && !idbIds.has(normalized.id)) {
        needsIdbBackfill.push(normalized);
      }
    }

    const finalAttempts = Array.from(mergedMap.values()).sort(
      (a, b) => (b.completedAt || b.timestamp) - (a.completedAt || a.timestamp)
    );

    // Backfill IndexedDB if local mirror had records not yet in IndexedDB
    if (needsIdbBackfill.length > 0) {
      try {
        const db = await this.initDB();
        const tx = db.transaction('quizAttempts', 'readwrite');
        const store = tx.objectStore('quizAttempts');
        for (const item of needsIdbBackfill) {
          store.put(item);
        }
      } catch {}
    }

    // Keep local mirror synchronized if IndexedDB had records
    if (finalAttempts.length > 0) {
      this.saveAllQuizAttemptsToLocalStorage(finalAttempts);
    }

    return finalAttempts;
  }

  /**
   * Validates, deduplicates, and persists a completed quiz attempt to IndexedDB immediately.
   * Also recalculates gamification profiles from persisted valid attempts so scores never double-count.
   */
  async saveQuizAttempt(
    attempt: QuizAttempt,
    activeQuiz?: Quiz
  ): Promise<{ saved: boolean; duplicate: boolean; attempt: QuizAttempt | null; reason?: string }> {
    const students = this.getStudents();
    const quizzes = await this.getQuizzes();
    const quizzesMap = new Map<string, Quiz>();
    for (const q of quizzes) {
      if (q && q.id) quizzesMap.set(q.id, q);
    }
    if (activeQuiz && activeQuiz.id) {
      quizzesMap.set(activeQuiz.id, activeQuiz);
    }

    const verified = verifyAndNormalizeAttempt(attempt, quizzesMap, students);
    if (!verified.valid || !verified.attempt) {
      return {
        saved: false,
        duplicate: false,
        attempt: null,
        reason: verified.reason || 'Invalid quiz attempt.',
      };
    }

    const normalized = verified.attempt;
    const existingAttempts = await this.getQuizAttempts();
    const duplicate = findDuplicateSubmission(normalized, existingAttempts);
    if (duplicate) {
      return {
        saved: false,
        duplicate: true,
        attempt: duplicate,
        reason: 'Duplicate attempt submission ignored.',
      };
    }

    // 1. Save to local mirror immediately
    this.saveQuizAttemptToLocalStorage(normalized);

    // 2. Save to IndexedDB primary database
    try {
      const db = await this.initDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('quizAttempts', 'readwrite');
        const store = tx.objectStore('quizAttempts');
        const req = store.put(normalized);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
      this.indexedDBHealthy = true;
    } catch (e: any) {
      this.storageWarning = `Saved to local mirror (IndexedDB write error: ${e?.message || 'unknown'})`;
    }

    // 3. Rebuild gamification profiles from verified persisted records
    await this.recalculateGamificationProfilesFromAttempts([normalized, ...existingAttempts]);

    // 4. Trigger non-blocking server sync if online
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      this.syncQuizAttemptsWithServer().catch(() => {});
    }

    return { saved: true, duplicate: false, attempt: normalized };
  }

  /**
   * Recalculates and persists StudentGamificationProfile records directly from verified attempts
   * so XP, completed quizzes, and perfect scores are always truthful and never double-counted.
   */
  async recalculateGamificationProfilesFromAttempts(
    attemptsInput?: QuizAttempt[]
  ): Promise<StudentGamificationProfile[]> {
    const students = this.getStudents();
    const quizzes = await this.getQuizzes();
    const attempts = attemptsInput || (await this.getQuizAttempts());

    const computed = computeLeaderboard({
      students,
      attempts,
      quizzes,
      filters: {
        scope: 'overall',
        streamFilter: 'ALL',
        selectedQuizId: 'ALL',
        timePeriod: 'all_time',
      },
    });

    const profiles: StudentGamificationProfile[] = computed.rankedEntries.map((entry) => ({
      studentName: entry.studentName,
      studentId: entry.studentId,
      stream: entry.stream,
      totalXP: entry.totalXP,
      level: entry.level,
      levelTitle: entry.levelTitle,
      quizzesCompleted: entry.completedQuizzes,
      perfectScoresCount: entry.perfectScoresCount,
      earnedBadgeIds: entry.earnedBadgeIds,
      lastUpdated: entry.lastCompletedAt || Date.now(),
    }));

    for (const p of profiles) {
      await this.saveGamificationProfile(p);
    }

    return profiles;
  }

  // --- LEADERBOARD FILTER PREFERENCES IN INDEXEDDB ---
  async getLeaderboardPreferences(): Promise<LeaderboardFilterPreferences> {
    try {
      const db = await this.initDB();
      const fromIdb = await new Promise<LeaderboardFilterPreferences | null>((resolve) => {
        const tx = db.transaction('leaderboardSettings', 'readonly');
        const store = tx.objectStore('leaderboardSettings');
        const req = store.get('default');
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
      if (fromIdb && fromIdb.scope) {
        return { ...DEFAULT_LEADERBOARD_FILTERS, ...fromIdb };
      }
    } catch {}

    try {
      const raw = this.safeGet(KEYS.LEADERBOARD_PREFS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.scope) {
          return { ...DEFAULT_LEADERBOARD_FILTERS, ...parsed };
        }
      }
    } catch {}

    return { ...DEFAULT_LEADERBOARD_FILTERS };
  }

  async saveLeaderboardPreferences(
    prefs: Partial<LeaderboardFilterPreferences>
  ): Promise<LeaderboardFilterPreferences> {
    const current = await this.getLeaderboardPreferences();
    const updated: LeaderboardFilterPreferences = {
      ...current,
      ...prefs,
      id: 'default',
      updatedAt: Date.now(),
      schemaVersion: LEADERBOARD_SCHEMA_VERSION,
    };

    this.safeSet(KEYS.LEADERBOARD_PREFS, JSON.stringify(updated));

    try {
      const db = await this.initDB();
      await new Promise<void>((resolve) => {
        const tx = db.transaction('leaderboardSettings', 'readwrite');
        const store = tx.objectStore('leaderboardSettings');
        const req = store.put(updated);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
      });
    } catch {}

    return updated;
  }

  // --- OFFLINE & SHARED SERVER SYNCHRONIZATION ---
  getLastSyncedAt(): number | null {
    const raw = this.safeGet(KEYS.LEADERBOARD_LAST_SYNC);
    if (!raw) return null;
    const num = Number(raw);
    return Number.isFinite(num) && num > 0 ? num : null;
  }

  private setLastSyncedAt(ts: number): void {
    this.safeSet(KEYS.LEADERBOARD_LAST_SYNC, String(ts));
  }

  /**
   * Synchronizes local IndexedDB quiz attempts with the backend server (`/api/quizzes/attempts/sync`).
   * - Works safely when offline (returns immediately without error or data loss).
   * - Pushes pending local attempts idempotently.
   * - Merges any verified server attempts into local IndexedDB without overwriting or deleting local records.
   */
  async syncQuizAttemptsWithServer(): Promise<{
    success: boolean;
    syncedCount: number;
    pendingCount: number;
    mergedFromServer: number;
    lastSyncedAt: number | null;
    error?: string;
  }> {
    const localAttempts = await this.getQuizAttempts();
    const unsynced = localAttempts.filter((a) => !a.synced);

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return {
        success: false,
        syncedCount: localAttempts.filter((a) => a.synced).length,
        pendingCount: unsynced.length,
        mergedFromServer: 0,
        lastSyncedAt: this.getLastSyncedAt(),
        error: 'Offline — showing locally saved results on this device.',
      };
    }

    try {
      const syncUrl = resolveApiUrl('/api/quizzes/attempts/sync');
      const response = await fetch(syncUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attempts: localAttempts }),
      });

      if (!response.ok) {
        throw new Error(`Sync server returned HTTP ${response.status}`);
      }

      const data = await response.json();
      const syncedIdsSet = new Set<string>(Array.isArray(data.syncedIds) ? data.syncedIds : []);
      const serverAttemptsRaw: Partial<QuizAttempt>[] = Array.isArray(data.attempts)
        ? data.attempts
        : [];

      const now = Date.now();
      const students = this.getStudents();
      const quizzes = await this.getQuizzes();
      const quizzesMap = new Map<string, Quiz>(quizzes.map((q) => [q.id, q]));

      const updatedMap = new Map<string, QuizAttempt>();

      // 1. Update local records with synced status
      for (const att of localAttempts) {
        if (syncedIdsSet.has(att.id) || att.synced) {
          updatedMap.set(att.id, {
            ...att,
            synced: true,
            syncedAt: att.syncedAt || now,
            syncStatus: 'synced',
            syncError: undefined,
          });
        } else {
          updatedMap.set(att.id, att);
        }
      }

      // 2. Merge any verified attempts from server that are not yet stored locally
      let mergedFromServer = 0;
      for (const rawSrv of serverAttemptsRaw) {
        if (!rawSrv || !rawSrv.id || updatedMap.has(rawSrv.id)) continue;
        const verified = verifyAndNormalizeAttempt(rawSrv, quizzesMap, students);
        if (verified.valid && verified.attempt) {
          updatedMap.set(verified.attempt.id, {
            ...verified.attempt,
            synced: true,
            syncedAt: now,
            syncStatus: 'synced',
          });
          mergedFromServer++;
        }
      }

      const mergedList = Array.from(updatedMap.values()).sort(
        (a, b) => (b.completedAt || b.timestamp) - (a.completedAt || a.timestamp)
      );

      // Persist updated sync flags to IndexedDB & local mirror
      if (mergedList.length > 0) {
        this.saveAllQuizAttemptsToLocalStorage(mergedList);
        try {
          const db = await this.initDB();
          const tx = db.transaction('quizAttempts', 'readwrite');
          const store = tx.objectStore('quizAttempts');
          for (const item of mergedList) {
            store.put(item);
          }
        } catch {}
      }

      this.setLastSyncedAt(now);
      await this.recalculateGamificationProfilesFromAttempts(mergedList);

      return {
        success: true,
        syncedCount: mergedList.filter((a) => a.synced).length,
        pendingCount: mergedList.filter((a) => !a.synced).length,
        mergedFromServer,
        lastSyncedAt: now,
      };
    } catch (err: any) {
      return {
        success: false,
        syncedCount: localAttempts.filter((a) => a.synced).length,
        pendingCount: unsynced.length,
        mergedFromServer: 0,
        lastSyncedAt: this.getLastSyncedAt(),
        error: err?.message || 'Could not reach sync server; local records remain safe.',
      };
    }
  }

  /**
   * Returns current local storage health & synchronization status for the Leaderboard UI.
   */
  async getPersistenceStatus(): Promise<StoragePersistenceStatus> {
    const attempts = await this.getQuizAttempts();
    const quizzes = await this.getQuizzes();
    const pendingSyncCount = attempts.filter((a) => !a.synced).length;
    const syncedCount = attempts.filter((a) => a.synced).length;
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

    return {
      indexedDBAvailable: this.indexedDBHealthy || (typeof window !== 'undefined' && !!window.indexedDB),
      schemaVersion: DB_VERSION,
      savedAttemptsCount: attempts.length,
      savedQuizzesCount: quizzes.length,
      pendingSyncCount,
      syncedCount,
      lastSyncedAt: this.getLastSyncedAt(),
      isOnline,
      storageWarning: this.storageWarning,
    };
  }

  /**
   * Exports a dedicated Leaderboard & Quiz Arena JSON backup for same-device or cross-device recovery.
   */
  async exportLeaderboardBackup(): Promise<string> {
    const students = this.getStudents();
    const quizzes = await this.getQuizzes();
    const quizAttempts = await this.getQuizAttempts();
    const gamificationProfiles = await this.getAllGamificationProfiles();
    const preferences = await this.getLeaderboardPreferences();

    const payload = {
      app: 'NEXORA_QUIZ_ARENA_LEADERBOARD_BACKUP',
      schemaVersion: LEADERBOARD_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      data: {
        students,
        quizzes,
        quizAttempts,
        gamificationProfiles,
        preferences,
      },
    };

    return JSON.stringify(payload, null, 2);
  }

  /**
   * Validates and imports a Leaderboard JSON backup without creating duplicate attempts or overwriting valid newer records.
   */
  async importLeaderboardBackup(jsonStr: string): Promise<{
    success: boolean;
    message: string;
    importedAttempts: number;
    skippedDuplicates: number;
    importedQuizzes: number;
  }> {
    try {
      const parsed = JSON.parse(jsonStr);
      if (!parsed || typeof parsed !== 'object' || !parsed.data) {
        return {
          success: false,
          message: 'Invalid backup file: missing root "data" object.',
          importedAttempts: 0,
          skippedDuplicates: 0,
          importedQuizzes: 0,
        };
      }

      const { data } = parsed;
      let importedQuizzes = 0;
      let importedAttempts = 0;
      let skippedDuplicates = 0;

      // 1. Import quizzes first so attempt verification has access to quiz answer keys
      if (Array.isArray(data.quizzes)) {
        for (const q of data.quizzes) {
          if (q && typeof q === 'object' && q.id && q.title && Array.isArray(q.questions)) {
            await this.saveQuiz(q);
            importedQuizzes++;
          }
        }
      }

      const students = this.getStudents();
      const allQuizzes = await this.getQuizzes();
      const quizzesMap = new Map<string, Quiz>(allQuizzes.map((q) => [q.id, q]));
      const existingAttempts = await this.getQuizAttempts();
      const currentList = [...existingAttempts];

      // 2. Validate & import quiz attempts with duplicate protection
      if (Array.isArray(data.quizAttempts)) {
        for (const rawAtt of data.quizAttempts) {
          const verified = verifyAndNormalizeAttempt(rawAtt, quizzesMap, students);
          if (!verified.valid || !verified.attempt) {
            continue;
          }
          const dup = findDuplicateSubmission(verified.attempt, currentList);
          if (dup) {
            skippedDuplicates++;
            continue;
          }
          currentList.push(verified.attempt);
          this.saveQuizAttemptToLocalStorage(verified.attempt);
          try {
            const db = await this.initDB();
            await new Promise<void>((resolve) => {
              const tx = db.transaction('quizAttempts', 'readwrite');
              tx.objectStore('quizAttempts').put(verified.attempt!);
              tx.oncomplete = () => resolve();
              tx.onerror = () => resolve();
            });
          } catch {}
          importedAttempts++;
        }
      }

      // 3. Restore filter preferences if valid
      if (data.preferences && typeof data.preferences === 'object') {
        await this.saveLeaderboardPreferences(data.preferences);
      }

      // 4. Recalculate gamification profiles from all valid attempts
      await this.recalculateGamificationProfilesFromAttempts(currentList);

      return {
        success: true,
        message: `Restored ${importedAttempts} verified attempt(s) and ${importedQuizzes} quiz(zes)${
          skippedDuplicates > 0 ? ` (${skippedDuplicates} duplicate(s) skipped)` : ''
        }.`,
        importedAttempts,
        skippedDuplicates,
        importedQuizzes,
      };
    } catch (e: any) {
      return {
        success: false,
        message: `Backup restore failed: ${e?.message || 'Malformed JSON file'}`,
        importedAttempts: 0,
        skippedDuplicates: 0,
        importedQuizzes: 0,
      };
    }
  }

  // --- GAMIFICATION PROFILES (XP, BADGES, LEVELS) ---
  async getGamificationProfile(studentName: string): Promise<StudentGamificationProfile | null> {
    try {
      const db = await this.initDB();
      return new Promise((resolve) => {
        const tx = db.transaction('gamificationProfiles', 'readonly');
        const store = tx.objectStore('gamificationProfiles');
        const req = store.get(studentName);
        req.onsuccess = () => resolve(req.result || this.getGamificationFromSafe(studentName));
        req.onerror = () => resolve(this.getGamificationFromSafe(studentName));
      });
    } catch {
      return this.getGamificationFromSafe(studentName);
    }
  }

  async saveGamificationProfile(profile: StudentGamificationProfile): Promise<void> {
    this.saveGamificationToSafe(profile);
    try {
      const db = await this.initDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('gamificationProfiles', 'readwrite');
        const store = tx.objectStore('gamificationProfiles');
        const req = store.put(profile);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch {}
  }

  async getAllGamificationProfiles(): Promise<StudentGamificationProfile[]> {
    try {
      const db = await this.initDB();
      return new Promise((resolve) => {
        const tx = db.transaction('gamificationProfiles', 'readonly');
        const store = tx.objectStore('gamificationProfiles');
        const req = store.getAll();
        req.onsuccess = () => {
          const list = (req.result || []) as StudentGamificationProfile[];
          if (list.length === 0) {
            resolve(this.getAllGamificationFromSafe());
          } else {
            resolve(list.sort((a, b) => b.totalXP - a.totalXP));
          }
        };
        req.onerror = () => resolve(this.getAllGamificationFromSafe());
      });
    } catch {
      return this.getAllGamificationFromSafe();
    }
  }

  private getGamificationFromSafe(name: string): StudentGamificationProfile | null {
    try {
      const raw = this.safeGet(KEYS.GAMIFICATION_BACKUP);
      if (!raw) return null;
      const dict: Record<string, StudentGamificationProfile> = JSON.parse(raw);
      return dict[name] || null;
    } catch {
      return null;
    }
  }

  private saveGamificationToSafe(profile: StudentGamificationProfile) {
    try {
      const raw = this.safeGet(KEYS.GAMIFICATION_BACKUP);
      const dict: Record<string, StudentGamificationProfile> = raw ? JSON.parse(raw) : {};
      dict[profile.studentName] = profile;
      this.safeSet(KEYS.GAMIFICATION_BACKUP, JSON.stringify(dict));
    } catch {}
  }

  private getAllGamificationFromSafe(): StudentGamificationProfile[] {
    try {
      const raw = this.safeGet(KEYS.GAMIFICATION_BACKUP);
      if (!raw) return [];
      const dict: Record<string, StudentGamificationProfile> = JSON.parse(raw);
      return Object.values(dict).sort((a, b) => b.totalXP - a.totalXP);
    } catch {
      return [];
    }
  }

  // --- CALCULATOR & DIGITAL NOTEPAD STORAGE ---
  getCalculatorNotes(): CalculatorNote[] {
    try {
      const raw = this.safeGet(KEYS.CALCULATOR_NOTES);
      if (raw) return JSON.parse(raw);
    } catch {}
    return [
      {
        id: 'note-default',
        title: 'Class 11 Working Steps & Formulas',
        content: `### Class 11 Mathematics & Science Notes\n- Use "Insert Result into Notes" to bring calculator values directly into your workings.\n- Derivations, step-by-step problem solutions, and formulas are auto-saved locally.\n\n#### Example Working:\n1. Quadratic equation: ax² + bx + c = 0\n2. Calculation result:\n`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];
  }

  saveCalculatorNotes(notes: CalculatorNote[]): void {
    try {
      this.safeSet(KEYS.CALCULATOR_NOTES, JSON.stringify(notes));
    } catch {}
  }

  // --- TIMETABLE STORAGE (PERMANENTLY READ-ONLY) ---
  isTimetableReadOnly(): boolean {
    return true;
  }

  getActiveTimetableVersion(): TimetableVersion {
    return getActiveTimetableVersion();
  }

  setActiveTimetableVersion(version: TimetableVersion): void {
    setActiveTimetableVersion(version);
  }

  getCurrentTimetable(): TimetableSchedule {
    return getCurrentTimetable();
  }

  getOldTimetable(): TimetableSchedule {
    return getOldTimetable();
  }

  getTimetable(version?: TimetableVersion): TimetableSchedule {
    return getInitialTimetable(version);
  }

  saveTimetable(_schedule: TimetableSchedule): { success: boolean; message: string } {
    console.warn('[Storage] Timetable is permanently read-only. Modification rejected.');
    return {
      success: false,
      message: 'Timetable is permanently read-only and cannot be modified.',
    };
  }

  // --- STUDENTS & STREAM-WISE FILTERING ---
  getStudents(): Student[] {
    try {
      const raw = this.safeGet(KEYS.STUDENTS);
      if (raw) {
        const parsed: Student[] = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length >= 21) {
          let updated = false;
          const normalized = parsed.map((s) => {
            if (s.name === 'Kesav' || s.id === 'std-1') {
              if (s.name !== 'Keshav') {
                updated = true;
                return { ...s, name: 'Keshav' };
              }
            }
            if (s.name === 'Dixit' || s.id === 'std-6') {
              if (s.name !== 'Dikshit') {
                updated = true;
                return { ...s, name: 'Dikshit' };
              }
            }
            return s;
          });
          if (updated) {
            this.saveStudents(normalized);
          }
          return normalized;
        }
      }
    } catch (e) {
      console.error('Error reading students:', e);
    }
    this.saveStudents(INITIAL_STUDENTS);
    return INITIAL_STUDENTS;
  }

  /**
   * Returns students strictly filtered by the requested stream (or all students if stream is 'ALL' / omitted).
   * Guarantees no duplicate student IDs.
   */
  getStudentsByStream(stream?: StreamType | 'ALL'): Student[] {
    const all = this.getStudents();
    const seen = new Set<string>();
    const unique: Student[] = [];
    for (const st of all) {
      if (!seen.has(st.id)) {
        seen.add(st.id);
        if (!stream || stream === 'ALL' || st.stream === stream) {
          unique.push(st);
        }
      }
    }
    return unique;
  }

  saveStudents(students: Student[]) {
    try {
      this.safeSet(KEYS.STUDENTS, JSON.stringify(students));
    } catch (e) {
      console.error('Failed to save students:', e);
    }
  }

  async syncStudentsWithBackend(): Promise<Student[]> {
    try {
      const res = await fetch(resolveApiUrl('/api/students'));
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.students) && data.students.length > 0) {
          this.saveStudents(data.students);
          return data.students;
        }
      }
    } catch {
      // offline fallback
    }
    return this.getStudents();
  }

  // --- DAILY ATTENDANCE & PRESENT STUDENTS REGISTRY ---
  private getAllAttendanceRecords(): Record<string, DailyAttendanceRecord> {
    try {
      const raw = this.safeGet(KEYS.ATTENDANCE_RECORDS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch {}
    return {};
  }

  /**
   * Retrieves the attendance record for a given date (YYYY-MM-DD).
   * IMPORTANT: If attendance has not been recorded for that date, `configured` is false
   * and no student is assumed to be present.
   */
  getAttendanceForDate(dateKey: string): DailyAttendanceRecord {
    const all = this.getAllAttendanceRecords();
    const existing = all[dateKey];
    if (existing && (existing.statuses || existing.records)) {
      const statuses = existing.statuses || existing.records || {};
      return {
        ...existing,
        statuses,
        records: statuses,
      };
    }
    return {
      date: dateKey,
      statuses: {},
      records: {},
      updatedAt: 0,
      configured: false,
    };
  }

  /**
   * Saves a single student's attendance status for the given date.
   */
  saveStudentAttendance(
    dateKey: string,
    studentId: string,
    status: AttendanceStatus,
    markedBy = 'Alka Mam'
  ): DailyAttendanceRecord {
    const all = this.getAllAttendanceRecords();
    const current = all[dateKey] || {
      date: dateKey,
      statuses: {},
      updatedAt: Date.now(),
      configured: true,
    };
    const baseStatuses = current.statuses || current.records || {};
    const nextStatuses = { ...baseStatuses, [studentId]: status };
    const hasConfigured = Object.values(nextStatuses).some(
      (st) => st === 'present' || st === 'absent' || st === 'late' || st === 'leave'
    );
    const updated: DailyAttendanceRecord = {
      date: dateKey,
      statuses: nextStatuses,
      records: nextStatuses,
      updatedAt: Date.now(),
      markedBy,
      configured: hasConfigured,
    };
    all[dateKey] = updated;
    this.safeSet(KEYS.ATTENDANCE_RECORDS, JSON.stringify(all));
    return updated;
  }

  /**
   * Saves bulk attendance statuses for a given date (e.g., marking stream students present/absent).
   */
  saveBulkAttendance(
    dateKey: string,
    statuses: Record<string, AttendanceStatus>,
    markedBy = 'Alka Mam'
  ): DailyAttendanceRecord {
    const all = this.getAllAttendanceRecords();
    const current = all[dateKey] || {
      date: dateKey,
      statuses: {},
      updatedAt: Date.now(),
      configured: false,
    };
    const baseStatuses = current.statuses || current.records || {};
    const mergedStatuses = { ...baseStatuses, ...statuses };
    const hasConfigured = Object.values(mergedStatuses).some(
      (st) => st === 'present' || st === 'absent' || st === 'late' || st === 'leave'
    );
    const updated: DailyAttendanceRecord = {
      date: dateKey,
      statuses: mergedStatuses,
      records: mergedStatuses,
      updatedAt: Date.now(),
      markedBy,
      configured: hasConfigured,
    };
    all[dateKey] = updated;
    this.safeSet(KEYS.ATTENDANCE_RECORDS, JSON.stringify(all));
    return updated;
  }

  /**
   * Clears attendance for a specific date (resets to unconfigured state).
   */
  clearAttendanceForDate(dateKey: string): void {
    const all = this.getAllAttendanceRecords();
    delete all[dateKey];
    this.safeSet(KEYS.ATTENDANCE_RECORDS, JSON.stringify(all));
  }

  /**
   * Returns only students who are explicitly marked 'present' (or 'late') on the given date,
   * optionally filtered by stream.
   * Never assumes 'unrecorded' or missing attendance is present.
   */
  getPresentStudents(
    dateKey: string,
    stream?: StreamType | 'ALL'
  ): {
    configured: boolean;
    presentStudents: Student[];
    absentOrLeaveCount: number;
    unrecordedCount: number;
    totalStreamStudents: number;
  } {
    const streamStudents = this.getStudentsByStream(stream);
    const record = this.getAttendanceForDate(dateKey);
    const map = record.statuses || record.records || {};

    const presentStudents: Student[] = [];
    let absentOrLeaveCount = 0;
    let unrecordedCount = 0;

    for (const student of streamStudents) {
      const status = map[student.id] || 'unrecorded';
      if (status === 'present' || status === 'late') {
        presentStudents.push(student);
      } else if (status === 'absent' || status === 'leave') {
        absentOrLeaveCount++;
      } else {
        unrecordedCount++;
      }
    }

    const streamConfigured =
      record.configured && unrecordedCount < streamStudents.length;

    return {
      configured: streamConfigured,
      presentStudents,
      absentOrLeaveCount,
      unrecordedCount,
      totalStreamStudents: streamStudents.length,
    };
  }

  // --- BACKUP & RESTORE ---
  async exportAllData(): Promise<string> {
    const timetable = this.getTimetable();
    const students = this.getStudents();
    const diaryEntries = await this.getAllDiaryEntries();
    const whiteboards = await this.getWhiteboards();
    const quizzes = await this.getQuizzes();
    const quizAttempts = await this.getQuizAttempts();
    const attendance = this.getAllAttendanceRecords();
    const leaderboardPreferences = await this.getLeaderboardPreferences();

    const backupPayload = {
      app: 'CLASS OS — THE ABHINAV SCHOOL',
      version: '1.3.0',
      schemaVersion: DB_VERSION,
      exportedAt: new Date().toISOString(),
      data: {
        timetable,
        students,
        diaryEntries,
        whiteboards,
        quizzes,
        quizAttempts,
        attendance,
        leaderboardPreferences,
      },
    };

    return JSON.stringify(backupPayload, null, 2);
  }

  async importAllData(jsonStr: string): Promise<{ success: boolean; message: string; recordCount?: number }> {
    try {
      const parsed = JSON.parse(jsonStr);
      if (!parsed || !parsed.data) {
        return { success: false, message: 'Invalid backup file structure. Missing "data" payload.' };
      }

      const { data } = parsed;
      let count = 0;

      if (data.timetable) {
        this.saveTimetable(data.timetable);
        count++;
      }
      if (data.students && Array.isArray(data.students)) {
        this.saveStudents(data.students);
        count += data.students.length;
      }
      if (data.diaryEntries && Array.isArray(data.diaryEntries)) {
        for (const entry of data.diaryEntries) {
          await this.saveDiaryEntry(entry);
          count++;
        }
      }
      if (data.whiteboards && Array.isArray(data.whiteboards)) {
        for (const wb of data.whiteboards) {
          await this.saveWhiteboard(wb);
          count++;
        }
      }
      if (data.quizzes && Array.isArray(data.quizzes)) {
        for (const q of data.quizzes) {
          await this.saveQuiz(q);
          count++;
        }
      }
      if (data.quizAttempts && Array.isArray(data.quizAttempts)) {
        for (const a of data.quizAttempts) {
          await this.saveQuizAttempt(a);
          count++;
        }
      }
      if (data.attendance && typeof data.attendance === 'object') {
        this.safeSet(KEYS.ATTENDANCE_RECORDS, JSON.stringify(data.attendance));
        count++;
      }
      if (data.leaderboardPreferences && typeof data.leaderboardPreferences === 'object') {
        await this.saveLeaderboardPreferences(data.leaderboardPreferences);
        count++;
      }

      return {
        success: true,
        message: `Successfully restored ${count} classroom records and configuration items.`,
        recordCount: count,
      };
    } catch (e: any) {
      return { success: false, message: `Failed to parse backup JSON: ${e.message}` };
    }
  }

  async resetToDefaults(): Promise<void> {
    const initialTimetable = getInitialTimetable();
    this.saveTimetable(initialTimetable);
    this.saveStudents(INITIAL_STUDENTS);
    this.safeRemove(KEYS.QUIZZES_LOCAL_BACKUP);

    try {
      const db = await this.initDB();
      const tx = db.transaction(['quizzes'], 'readwrite');
      tx.objectStore('quizzes').clear();
      for (const q of STARTER_QUIZZES) {
        await this.saveQuiz(q);
      }
    } catch {}
  }
}

export const storage = new StorageService();
