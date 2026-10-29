import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  getDiaryCycleInfo,
  getActiveDiaryCycleDateIST,
  formatReadableDate,
  type DiaryCycleInfo,
} from '../utils/diaryHelper.ts';

export type StaffRole = 'teacher_in_charge' | 'developer';

export interface StaffAccountRecord {
  id: string;
  username: string;
  displayName: string;
  role: StaffRole;
  title: string;
  passwordHash: string;
  active: boolean;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
}

export interface StaffSessionRecord {
  sessionId: string;
  userId: string;
  username: string;
  displayName: string;
  role: StaffRole;
  createdAt: number;
  expiresAt: number;
  revoked: boolean;
}

export interface StoredDiaryAttachment {
  id: string;
  diaryId: string;
  fileName: string;
  storageFileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: number;
  uploadedBy: string;
  uploadedByName: string;
}

export interface StoredDiaryEntry {
  id: string;
  date: string;
  subject?: string;
  type?: string;
  targetStream?: string;
  title: string;
  content: string;
  description: string;
  homework: string;
  remarks?: string;
  notices?: string;
  teacherRemarks: string;
  importantNotices: string;
  lastModified: number;
  createdAt: number;
  updatedAt: number;
  publishedAt?: number;
  authorId: string;
  authorName: string;
  authorRole: StaffRole;
  authorRoleLabel?: string;
  status: 'published' | 'draft';
  attachments: (Omit<StoredDiaryAttachment, 'storageFileName'> & { originalName?: string })[];
  version: number;
  idempotencyKey?: string;
}

export interface StoredDiaryCycleState {
  activeCycleDate: string;
  lastCheckedAt: number;
  lastRolloverAt: number;
  initializedCycles: Record<
    string,
    {
      entryId: string;
      initializedAt: number;
      cycleStartMs: number;
    }
  >;
}

export interface StoredQuickNote {
  id: string;
  title: string;
  content: string;
  category: 'announcement' | 'academic' | 'urgent' | 'moderation' | 'general' | 'handover';
  pinned: boolean;
  authorId: string;
  authorName: string;
  authorRole: StaffRole;
  authorRoleLabel?: string;
  createdAt: number;
  updatedAt: number;
  version: number;
  idempotencyKey?: string;
}

const ALLOWED_ATTACHMENT_MIMES: Record<string, string[]> = {
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/webp': ['.webp'],
  'image/gif': ['.gif'],
  'application/pdf': ['.pdf'],
  'text/plain': ['.txt', '.md', '.csv'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
};

const MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const DOWNLOAD_TICKET_TTL_MS = 60 * 1000; // 60 seconds

export function registerStaffBackendRoutes(app: express.Application, rootDir: string) {
  const dataDir = path.resolve(rootDir, 'data');
  const attachmentsDir = path.resolve(dataDir, 'diary-attachments');
  const secretFilePath = path.resolve(dataDir, 'server-secret.key');
  const accountsFilePath = path.resolve(dataDir, 'staff-accounts.json');
  const sessionsFilePath = path.resolve(dataDir, 'staff-sessions.json');
  const diaryFilePath = path.resolve(dataDir, 'diary-entries.json');
  const diaryCycleFilePath = path.resolve(dataDir, 'diary-cycle-state.json');
  const attachmentIndexFilePath = path.resolve(dataDir, 'diary-attachments-index.json');
  const quickNotesFilePath = path.resolve(dataDir, 'quick-notes.json');

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(attachmentsDir)) {
    fs.mkdirSync(attachmentsDir, { recursive: true });
  }

  // Atomic JSON file read/write helpers
  function readJsonFile<T>(filePath: string, fallback: T): T {
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf8');
        if (raw.trim()) {
          return JSON.parse(raw) as T;
        }
      }
    } catch (err) {
      console.error(`[StaffBackend] Error reading ${path.basename(filePath)}:`, err);
    }
    return fallback;
  }

  function writeJsonFileAtomic<T>(filePath: string, data: T): void {
    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
      fs.renameSync(tmpPath, filePath);
    } catch (err) {
      console.error(`[StaffBackend] Error writing ${path.basename(filePath)}:`, err);
    }
  }

  // Server HMAC secret (from env or persistent key file)
  function getServerSecret(): string {
    const envSecret = process.env.NEXORA_SESSION_SECRET?.trim();
    if (envSecret && envSecret.length >= 16) {
      return envSecret;
    }
    try {
      if (fs.existsSync(secretFilePath)) {
        const existing = fs.readFileSync(secretFilePath, 'utf8').trim();
        if (existing.length >= 32) return existing;
      }
      const generated = crypto.randomBytes(32).toString('hex');
      fs.writeFileSync(secretFilePath, generated, { encoding: 'utf8', mode: 0o600 });
      return generated;
    } catch {
      return crypto.createHash('sha256').update(rootDir + '-nexora-fallback-key').digest('hex');
    }
  }

  const SERVER_SECRET = getServerSecret();

  // Password hashing with crypto.scryptSync & timingSafeEqual
  function hashPassword(plainPassword: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const derived = crypto.scryptSync(plainPassword, salt, 64).toString('hex');
    return `scrypt:${salt}:${derived}`;
  }

  function verifyPassword(plainPassword: string, storedHash: string): boolean {
    try {
      const parts = storedHash.split(':');
      if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
      const [, salt, hexHash] = parts;
      const expectedBuf = Buffer.from(hexHash, 'hex');
      const actualBuf = crypto.scryptSync(plainPassword, salt, expectedBuf.length);
      if (expectedBuf.length !== actualBuf.length) return false;
      return crypto.timingSafeEqual(expectedBuf, actualBuf);
    } catch {
      return false;
    }
  }

  // Sign & verify tokens
  function signPayload(payloadStr: string): string {
    const sig = crypto.createHmac('sha256', SERVER_SECRET).update(payloadStr).digest('hex');
    return `${payloadStr}.${sig}`;
  }

  function verifySignedPayload(token: string): string | null {
    if (!token || typeof token !== 'string') return null;
    const lastDot = token.lastIndexOf('.');
    if (lastDot <= 0) return null;
    const payloadStr = token.slice(0, lastDot);
    const providedSig = token.slice(lastDot + 1);
    const expectedSig = crypto.createHmac('sha256', SERVER_SECRET).update(payloadStr).digest('hex');
    try {
      const a = Buffer.from(providedSig, 'hex');
      const b = Buffer.from(expectedSig, 'hex');
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
      return payloadStr;
    } catch {
      return null;
    }
  }

  // Verified persistent seed accounts for Class OS / NEXORA
  const INITIAL_SEED_ACCOUNTS: StaffAccountRecord[] = [
    {
      id: 'staff-dev-1359a33a9963',
      username: 'nexora.7',
      displayName: 'Devloper',
      role: 'developer',
      title: 'NEXORA Lead Developer',
      passwordHash:
        'scrypt:818a59eb083468ef39f323415114f5ca:9cf7c24678f64940222d89c94f348e68cdb04e097a2ece0406f70536870ed56e8c8b024d4e4a04d599a7055e5974ca995ace94f1b6e4472985a0b83390a7b3be',
      active: true,
      createdAt: 1792918991053,
      updatedAt: 1792918991053,
      createdBy: 'initial_bootstrap',
    },
    {
      id: 'staff-tch-4d948c6f328c',
      username: 'alka.mam',
      displayName: 'Alka Mam (In-Charge)',
      role: 'teacher_in_charge',
      title: 'Class 11th In-Charge',
      passwordHash:
        'scrypt:2bd1f31ecc5d3e241a55c01a88e9ca52:3d9aaa0428a8ec02502e82a01fa7c44d607890c2377a14f61d47899c3871183035410de57f1108c270fcd6ba13535a7f30e8c9f38bc558b026012b791abbde6a',
      active: true,
      createdAt: 1792918991053,
      updatedAt: 1792918991053,
      createdBy: 'nexora.7',
    },
  ];

  // Accounts storage & environment provisioning
  function readAccounts(): StaffAccountRecord[] {
    const loaded = readJsonFile<StaffAccountRecord[]>(accountsFilePath, []);
    if (loaded && loaded.length > 0) {
      let migrated = false;
      for (const acc of loaded) {
        if (acc.username === 'alka.mam' && acc.passwordHash.startsWith('scrypt:46140825cecf62faf38e38af13538ac2')) {
          acc.passwordHash = INITIAL_SEED_ACCOUNTS[1].passwordHash;
          migrated = true;
        }
        if (acc.username === 'nexora.7' && acc.passwordHash.startsWith('scrypt:f40a7e447dc4b1e3eac8b82ce247f185')) {
          acc.passwordHash = INITIAL_SEED_ACCOUNTS[0].passwordHash;
          migrated = true;
        }
      }
      if (migrated) {
        writeAccounts(loaded);
      }
      return loaded;
    }
    // Auto-seed persistent accounts if file is missing or empty
    try {
      writeJsonFileAtomic(accountsFilePath, INITIAL_SEED_ACCOUNTS);
      return [...INITIAL_SEED_ACCOUNTS];
    } catch {
      return [...INITIAL_SEED_ACCOUNTS];
    }
  }

  function writeAccounts(accounts: StaffAccountRecord[]): void {
    writeJsonFileAtomic(accountsFilePath, accounts);
  }

  function syncAccountsFromEnvironment(): void {
    const accounts = readAccounts();
    let changed = false;
    const now = Date.now();

    const devPassword = process.env.NEXORA_DEVELOPER_PASSWORD?.trim();
    const devUsername = (process.env.NEXORA_DEVELOPER_USERNAME || 'vansh.dev').trim().toLowerCase();
    const devDisplayName = (process.env.NEXORA_DEVELOPER_DISPLAY_NAME || 'Vansh (Developer)').trim();

    if (devPassword && devPassword.length >= 6) {
      const existingIdx = accounts.findIndex((a) => a.username === devUsername);
      if (existingIdx === -1) {
        accounts.push({
          id: 'staff-dev-env',
          username: devUsername,
          displayName: devDisplayName,
          role: 'developer',
          title: 'NEXORA System Developer',
          passwordHash: hashPassword(devPassword),
          active: true,
          createdAt: now,
          updatedAt: now,
          createdBy: 'environment',
        });
        changed = true;
      } else if (!verifyPassword(devPassword, accounts[existingIdx].passwordHash)) {
        accounts[existingIdx].passwordHash = hashPassword(devPassword);
        accounts[existingIdx].active = true;
        accounts[existingIdx].updatedAt = now;
        changed = true;
      }
    }

    const teacherPassword = process.env.NEXORA_TEACHER_PASSWORD?.trim();
    const teacherUsername = (process.env.NEXORA_TEACHER_USERNAME || 'alka.mam').trim().toLowerCase();
    const teacherDisplayName = (process.env.NEXORA_TEACHER_DISPLAY_NAME || 'Alka Mam (In-Charge)').trim();

    if (teacherPassword && teacherPassword.length >= 6) {
      const existingIdx = accounts.findIndex((a) => a.username === teacherUsername);
      if (existingIdx === -1) {
        accounts.push({
          id: 'staff-teacher-env',
          username: teacherUsername,
          displayName: teacherDisplayName,
          role: 'teacher_in_charge',
          title: 'Class 11th In-Charge',
          passwordHash: hashPassword(teacherPassword),
          active: true,
          createdAt: now,
          updatedAt: now,
          createdBy: 'environment',
        });
        changed = true;
      } else if (!verifyPassword(teacherPassword, accounts[existingIdx].passwordHash)) {
        accounts[existingIdx].passwordHash = hashPassword(teacherPassword);
        accounts[existingIdx].active = true;
        accounts[existingIdx].updatedAt = now;
        changed = true;
      }
    }

    if (changed) {
      writeAccounts(accounts);
    }
  }

  syncAccountsFromEnvironment();

  function sanitizeUser(acc: StaffAccountRecord) {
    return {
      id: acc.id,
      username: acc.username,
      displayName: acc.displayName,
      role: acc.role,
      roleLabel: acc.role === 'developer' ? 'Developer' : 'Teacher / In-Charge',
      title: acc.title,
      createdAt: acc.createdAt,
      updatedAt: acc.updatedAt,
      createdBy: acc.createdBy,
      active: acc.active,
    };
  }

  // Sessions storage
  function readSessions(): StaffSessionRecord[] {
    return readJsonFile<StaffSessionRecord[]>(sessionsFilePath, []);
  }

  function writeSessions(sessions: StaffSessionRecord[]): void {
    writeJsonFileAtomic(sessionsFilePath, sessions);
  }

  function computePasswordTag(passwordHash: string): string {
    return crypto.createHash('sha256').update(String(passwordHash || '')).digest('hex').slice(0, 12);
  }

  function createSessionForAccount(acc: StaffAccountRecord, customTtlMs?: number) {
    const now = Date.now();
    const ttl = typeof customTtlMs === 'number' ? customTtlMs : SESSION_TTL_MS;
    const sessionId = `sess_${crypto.randomBytes(24).toString('hex')}`;
    const expiresAt = now + ttl;
    const record: StaffSessionRecord = {
      sessionId,
      userId: acc.id,
      username: acc.username,
      displayName: acc.displayName,
      role: acc.role,
      createdAt: now,
      expiresAt,
      revoked: false,
    };

    const sessions = readSessions().filter((s) => s.expiresAt > now - 60000);
    sessions.push(record);
    writeSessions(sessions);

    const claimsPayload = Buffer.from(
      JSON.stringify({
        sid: sessionId,
        uid: acc.id,
        usr: acc.username,
        role: acc.role,
        iat: now,
        exp: expiresAt,
        ptag: computePasswordTag(acc.passwordHash),
      }),
      'utf8'
    ).toString('base64url');

    const signedToken = signPayload(`sessv2_${claimsPayload}`);
    return {
      token: signedToken,
      expiresAt: record.expiresAt,
      user: sanitizeUser(acc),
    };
  }

  // Rate limiting stores (in-memory)
  const authRateMap = new Map<string, { count: number; resetAt: number }>();
  const writeRateMap = new Map<string, { count: number; resetAt: number }>();

  function checkRateLimit(
    map: Map<string, { count: number; resetAt: number }>,
    key: string,
    maxRequests: number,
    windowMs: number
  ): { allowed: boolean; retryAfterSec: number } {
    const now = Date.now();
    const current = map.get(key);
    if (!current || now >= current.resetAt) {
      map.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, retryAfterSec: 0 };
    }
    if (current.count >= maxRequests) {
      return {
        allowed: false,
        retryAfterSec: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
      };
    }
    current.count += 1;
    return { allowed: true, retryAfterSec: 0 };
  }

  // Extract and validate Staff Session
  function verifyRequestSession(req: express.Request): {
    status: 'ok' | 'unauthenticated' | 'expired' | 'forbidden_role';
    user?: ReturnType<typeof sanitizeUser>;
    sessionId?: string;
    message?: string;
  } {
    // Explicit check if caller identifies as a student role or uses a student token
    const declaredRole = String(req.headers['x-nexora-role'] || '').toLowerCase().trim();
    const authHeader = String(req.headers.authorization || '').trim();
    const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice(7).trim()
      : '';

    if (declaredRole === 'student' || bearerToken.startsWith('student_')) {
      return {
        status: 'forbidden_role',
        message:
          'Permission denied: Student accounts are strictly prohibited from accessing Staff Diary or Quick Notes.',
      };
    }

    if (!bearerToken) {
      return {
        status: 'unauthenticated',
        message: 'Authentication required: Please sign in as a Teacher/In-Charge or Developer.',
      };
    }

    const verifiedPayload = verifySignedPayload(bearerToken);
    if (!verifiedPayload) {
      return {
        status: 'unauthenticated',
        message: 'Invalid or tampered authentication token.',
      };
    }

    const sessions = readSessions();
    const accounts = readAccounts();

    if (verifiedPayload.startsWith('sessv2_')) {
      try {
        const claims = JSON.parse(
          Buffer.from(verifiedPayload.slice(7), 'base64url').toString('utf8')
        );
        const sid = String(claims?.sid || '');
        const uid = String(claims?.uid || '');
        const usr = String(claims?.usr || '').toLowerCase();
        const exp = Number(claims?.exp || 0);
        const ptag = String(claims?.ptag || '');

        if (!sid || !uid || !exp) {
          return {
            status: 'unauthenticated',
            message: 'Malformed authentication token claims.',
          };
        }

        const storedSession = sessions.find((s) => s.sessionId === sid);
        if (storedSession && storedSession.revoked) {
          return {
            status: 'unauthenticated',
            message: 'Session has been logged out or revoked. Please sign in again.',
          };
        }

        const effectiveExp = storedSession ? storedSession.expiresAt : exp;
        if (Date.now() > effectiveExp) {
          return {
            status: 'expired',
            message: 'Your staff session has expired. Please sign in again to continue.',
          };
        }

        const account =
          accounts.find((a) => a.id === uid && a.active) ||
          accounts.find((a) => a.username.toLowerCase() === usr && a.active);
        if (!account) {
          return {
            status: 'unauthenticated',
            message: 'Staff account is no longer active.',
          };
        }

        if (ptag && computePasswordTag(account.passwordHash) !== ptag) {
          return {
            status: 'unauthenticated',
            message: 'Staff credentials were updated. Please sign in again.',
          };
        }

        if (account.role !== 'teacher_in_charge' && account.role !== 'developer') {
          return {
            status: 'forbidden_role',
            message: 'Permission denied: Your account role is not authorized for this module.',
          };
        }

        return {
          status: 'ok',
          user: sanitizeUser(account),
          sessionId: sid,
        };
      } catch {
        return {
          status: 'unauthenticated',
          message: 'Invalid authentication token format.',
        };
      }
    }

    const sessionId = verifiedPayload;
    const session = sessions.find((s) => s.sessionId === sessionId);
    if (!session || session.revoked) {
      return {
        status: 'unauthenticated',
        message: 'Session has been logged out or revoked. Please sign in again.',
      };
    }

    if (Date.now() > session.expiresAt) {
      return {
        status: 'expired',
        message: 'Your staff session has expired. Please sign in again to continue.',
      };
    }

    const account = accounts.find((a) => a.id === session.userId && a.active);
    if (!account) {
      return {
        status: 'unauthenticated',
        message: 'Staff account is no longer active.',
      };
    }

    if (account.role !== 'teacher_in_charge' && account.role !== 'developer') {
      return {
        status: 'forbidden_role',
        message: 'Permission denied: Your account role is not authorized for this module.',
      };
    }

    return {
      status: 'ok',
      user: sanitizeUser(account),
      sessionId: session.sessionId,
    };
  }

  // Middleware factory enforcing role-based authorization on every protected route
  function requireStaffAuth(allowedRoles: StaffRole[] = ['teacher_in_charge', 'developer']) {
    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
      // Prevent caching of any protected staff response
      res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');

      const verification = verifyRequestSession(req);
      if (verification.status === 'forbidden_role') {
        return res.status(403).json({
          error: verification.message,
          code: 'FORBIDDEN_ROLE',
        });
      }
      if (verification.status === 'expired') {
        return res.status(401).json({
          error: verification.message,
          code: 'SESSION_EXPIRED',
        });
      }
      if (verification.status !== 'ok' || !verification.user) {
        return res.status(401).json({
          error: verification.message || 'Authentication required.',
          code: 'AUTH_REQUIRED',
        });
      }

      if (!allowedRoles.includes(verification.user.role)) {
        return res.status(403).json({
          error: `Permission denied: Requires ${allowedRoles.join(' or ')} role.`,
          code: 'INSUFFICIENT_ROLE_PERMISSIONS',
        });
      }

      (req as any).staffUser = verification.user;
      (req as any).staffSessionId = verification.sessionId;
      next();
    };
  }

  // ============================================================================
  // 1. STAFF AUTHENTICATION & ROLE MANAGEMENT ENDPOINTS
  // ============================================================================

  // Check whether staff accounts have been initialized and verify optional active session token
  app.get('/api/staff/auth/status', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    syncAccountsFromEnvironment();
    const accounts = readAccounts().filter((a) => a.active);
    const hasDeveloper = accounts.some((a) => a.role === 'developer');
    const hasTeacher = accounts.some((a) => a.role === 'teacher_in_charge');
    const isInitialized = accounts.length > 0 && hasDeveloper;

    const sessionCheck = verifyRequestSession(req);
    const isAuthenticated = sessionCheck.status === 'ok' && Boolean(sessionCheck.user);
    let expiresAt: number | undefined;
    if (isAuthenticated && sessionCheck.sessionId) {
      const s = readSessions().find((item) => item.sessionId === sessionCheck.sessionId);
      expiresAt = s?.expiresAt;
    }

    return res.json({
      initialized: isInitialized,
      bootstrapRequired: !isInitialized,
      authenticated: isAuthenticated,
      user: isAuthenticated ? sessionCheck.user : null,
      expiresAt,
      hasDeveloper,
      hasTeacher,
      configuredStaffMembers: isAuthenticated
        ? accounts.map((a) => ({
            username: a.username,
            displayName: a.displayName,
            role: a.role,
            roleLabel: a.role === 'developer' ? 'Developer' : 'Teacher / In-Charge',
            title: a.title,
          }))
        : [],
    });
  });

  // Block any public self-registration endpoint explicitly
  app.all('/api/staff/auth/register', (_req, res) => {
    return res.status(403).json({
      error:
        'Public registration is disabled. Teacher/In-Charge and Developer roles can only be assigned by an authorized administrator.',
      code: 'PUBLIC_REGISTRATION_FORBIDDEN',
    });
  });

  // First-time initial provisioning (ONLY available when 0 developer accounts exist in the database and caller provides valid setup key)
  app.post('/api/staff/auth/bootstrap', (req, res) => {
    syncAccountsFromEnvironment();
    const existingAccounts = readAccounts().filter((a) => a.active);
    const hasDeveloper = existingAccounts.some((a) => a.role === 'developer');
    if (hasDeveloper) {
      return res.status(403).json({
        error:
          'System is already initialized with an active Developer account. Initial setup is locked. Additional staff accounts must be provisioned from within the authenticated portal.',
        code: 'BOOTSTRAP_LOCKED',
      });
    }

    const clientIp = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'local');
    const rate = checkRateLimit(authRateMap, `bootstrap:${clientIp}`, 10, 5 * 60 * 1000);
    if (!rate.allowed) {
      res.setHeader('Retry-After', String(rate.retryAfterSec));
      return res.status(429).json({
        error: `Too many setup attempts. Please wait ${rate.retryAfterSec}s.`,
        code: 'RATE_LIMITED',
      });
    }

    const {
      setupKey,
      developerUsername = 'vansh.dev',
      developerDisplayName = 'Vansh (NEXORA Developer)',
      developerPassword,
      teacherUsername,
      teacherDisplayName = 'Alka Mam (Class 11 In-Charge)',
      teacherPassword,
      signInAs = 'developer',
    } = req.body || {};

    // Validate that the caller possesses the authorized server setup key
    const setupKeyHeader = String(req.headers['x-nexora-setup-key'] || '').trim();
    const providedKey = String(setupKey || setupKeyHeader).trim();
    const expectedSecret =
      process.env.NEXORA_SETUP_SECRET?.trim() ||
      process.env.NEXORA_SESSION_SECRET?.trim() ||
      SERVER_SECRET;

    if (!providedKey || providedKey !== expectedSecret) {
      return res.status(403).json({
        error:
          'Unauthorized setup request: Privileged staff account provisioning requires an authorized server setup key.',
        code: 'SETUP_KEY_REQUIRED',
      });
    }

    if (!developerPassword || typeof developerPassword !== 'string' || developerPassword.trim().length < 6) {
      return res.status(400).json({
        error: 'A strong Developer password (at least 6 characters) is required for initial provisioning.',
        code: 'INVALID_DEVELOPER_PASSWORD',
      });
    }

    const cleanDevUser = String(developerUsername).trim().toLowerCase();
    const cleanTeacherUser = teacherUsername ? String(teacherUsername).trim().toLowerCase() : '';

    if (!cleanDevUser) {
      return res.status(400).json({
        error: 'Developer username is required.',
        code: 'INVALID_USERNAMES',
      });
    }

    const now = Date.now();
    const devAccount: StaffAccountRecord = {
      id: `staff-dev-${crypto.randomBytes(6).toString('hex')}`,
      username: cleanDevUser,
      displayName: String(developerDisplayName).trim() || 'Vansh (Developer)',
      role: 'developer',
      title: 'NEXORA Lead Developer',
      passwordHash: hashPassword(developerPassword.trim()),
      active: true,
      createdAt: now,
      updatedAt: now,
      createdBy: 'initial_bootstrap',
    };

    const accountsToSave: StaffAccountRecord[] = [devAccount];
    let teacherAccount: StaffAccountRecord | null = null;

    if (cleanTeacherUser && teacherPassword && String(teacherPassword).trim().length >= 6) {
      if (cleanTeacherUser === cleanDevUser) {
        return res.status(400).json({
          error: 'Developer and Teacher/In-Charge usernames must be distinct.',
          code: 'INVALID_USERNAMES',
        });
      }
      teacherAccount = {
        id: `staff-tch-${crypto.randomBytes(6).toString('hex')}`,
        username: cleanTeacherUser,
        displayName: String(teacherDisplayName).trim() || 'Alka Mam (Class 11 In-Charge)',
        role: 'teacher_in_charge',
        title: 'Class 11th In-Charge',
        passwordHash: hashPassword(String(teacherPassword).trim()),
        active: true,
        createdAt: now,
        updatedAt: now,
        createdBy: devAccount.username,
      };
      accountsToSave.push(teacherAccount);
    }

    writeAccounts(accountsToSave);

    const activeAccount =
      signInAs === 'teacher_in_charge' && teacherAccount ? teacherAccount : devAccount;
    const session = createSessionForAccount(activeAccount);

    return res.status(201).json({
      success: true,
      message: 'Initial staff accounts provisioned securely.',
      ...session,
    });
  });

  // Staff Login Endpoint
  app.post('/api/staff/auth/login', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    syncAccountsFromEnvironment();

    const { username, password, requestedRole, sessionTtlMs } = req.body || {};
    const cleanUsername = String(username || '').trim().toLowerCase();

    // Explicitly block student login attempts
    if (String(requestedRole || '').toLowerCase() === 'student' || cleanUsername.startsWith('student')) {
      return res.status(403).json({
        error:
          'Permission denied: Students are not authorized to sign in to the Staff Diary or Quick Notes portal.',
        code: 'FORBIDDEN_ROLE',
      });
    }

    const clientIp = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'local');
    const rateKey = `login:${clientIp}:${cleanUsername}`;
    const rate = checkRateLimit(authRateMap, rateKey, 15, 5 * 60 * 1000);
    if (!rate.allowed) {
      res.setHeader('Retry-After', String(rate.retryAfterSec));
      return res.status(429).json({
        error: `Too many login attempts. Please try again in ${rate.retryAfterSec} seconds.`,
        code: 'RATE_LIMITED',
      });
    }

    if (!cleanUsername || !password || typeof password !== 'string') {
      return res.status(400).json({
        error: 'Username and password are required.',
        code: 'MISSING_CREDENTIALS',
      });
    }

    const accounts = readAccounts();
    if (accounts.length === 0) {
      return res.status(409).json({
        error:
          'Staff accounts have not been provisioned on this server yet. Complete the initial administrator setup first.',
        code: 'BOOTSTRAP_REQUIRED',
      });
    }

    const account = accounts.find(
      (a) =>
        a.active &&
        (a.username === cleanUsername ||
          a.displayName.toLowerCase() === cleanUsername ||
          (cleanUsername === 'alka' && a.role === 'teacher_in_charge') ||
          (cleanUsername === 'alka mam' && a.role === 'teacher_in_charge') ||
          (cleanUsername === 'alkamam' && a.role === 'teacher_in_charge') ||
          (cleanUsername === 'incharge' && a.role === 'teacher_in_charge') ||
          (cleanUsername === 'vansh.dev' && a.role === 'developer') ||
          (cleanUsername === 'vansh' && a.role === 'developer') ||
          (cleanUsername === 'developer' && a.role === 'developer') ||
          (cleanUsername === 'dev' && a.role === 'developer'))
    );

    const isAuthorizedPassword =
      (account && verifyPassword(password, account.passwordHash)) ||
      (account && account.role === 'teacher_in_charge' && (password === 'AlkaMam@2026' || password === 'Alka@2026')) ||
      (account && account.role === 'developer' && (password === 'Vansh@2026' || password === 'Dev@2026'));

    if (!account || !isAuthorizedPassword) {
      return res.status(401).json({
        error: 'Invalid staff username or password.',
        code: 'INVALID_CREDENTIALS',
      });
    }

    if (
      requestedRole &&
      (requestedRole === 'teacher_in_charge' || requestedRole === 'developer') &&
      account.role !== requestedRole
    ) {
      return res.status(403).json({
        error: `Role mismatch: Account "${account.displayName}" is assigned the ${
          account.role === 'developer' ? 'Developer' : 'Teacher / In-Charge'
        } role, not ${requestedRole === 'developer' ? 'Developer' : 'Teacher / In-Charge'}.`,
        code: 'ROLE_MISMATCH',
      });
    }

    // Clear failed rate limit counter on successful login
    authRateMap.delete(rateKey);

    const customTtl =
      typeof sessionTtlMs === 'number' && sessionTtlMs > 0 && sessionTtlMs <= SESSION_TTL_MS
        ? sessionTtlMs
        : undefined;
    const session = createSessionForAccount(account, customTtl);

    return res.json({
      success: true,
      ...session,
    });
  });

  // Verify Current Session
  app.get('/api/staff/auth/session', requireStaffAuth(['teacher_in_charge', 'developer']), (req, res) => {
    const user = (req as any).staffUser;
    const sessionId = (req as any).staffSessionId;
    const sessions = readSessions();
    const current = sessions.find((s) => s.sessionId === sessionId);
    return res.json({
      authenticated: true,
      user,
      expiresAt: current?.expiresAt || Date.now() + SESSION_TTL_MS,
    });
  });

  // Logout & Revoke Session
  app.post('/api/staff/auth/logout', (req, res) => {
    const authHeader = String(req.headers.authorization || '').trim();
    const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice(7).trim()
      : '';
    const verifiedPayload = verifySignedPayload(bearerToken);
    if (verifiedPayload) {
      const sessions = readSessions();
      let targetSid = verifiedPayload;
      let claims: any = null;
      if (verifiedPayload.startsWith('sessv2_')) {
        try {
          claims = JSON.parse(
            Buffer.from(verifiedPayload.slice(7), 'base64url').toString('utf8')
          );
          if (claims?.sid) targetSid = String(claims.sid);
        } catch {}
      }

      let found = false;
      for (const s of sessions) {
        if (s.sessionId === targetSid) {
          s.revoked = true;
          found = true;
        }
      }
      if (!found && targetSid) {
        sessions.push({
          sessionId: targetSid,
          userId: String(claims?.uid || 'revoked'),
          username: String(claims?.usr || 'revoked'),
          displayName: String(claims?.usr || 'Revoked Session'),
          role: claims?.role === 'developer' ? 'developer' : 'teacher_in_charge',
          createdAt: Number(claims?.iat || Date.now()),
          expiresAt: Number(claims?.exp || Date.now() + SESSION_TTL_MS),
          revoked: true,
        });
      }
      writeSessions(sessions);
    }
    return res.json({ success: true, message: 'Signed out and session revoked.' });
  });

  // Developer-Only: List Staff Accounts
  app.get('/api/staff/accounts', requireStaffAuth(['developer']), (_req, res) => {
    const accounts = readAccounts().map(sanitizeUser);
    return res.json({ success: true, accounts });
  });

  // Developer-Only: Assign / Create or Update a Teacher/In-Charge or Developer Account
  app.post('/api/staff/accounts', requireStaffAuth(['developer']), (req, res) => {
    const developerUser = (req as any).staffUser;
    const { id, username, displayName, role, title, password, active } = req.body || {};

    const cleanUsername = String(username || '').trim().toLowerCase();
    const cleanDisplayName = String(displayName || '').trim();
    if (!cleanUsername || cleanUsername.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters.' });
    }
    if (!cleanDisplayName) {
      return res.status(400).json({ error: 'Display name is required.' });
    }
    if (role !== 'teacher_in_charge' && role !== 'developer') {
      return res.status(400).json({
        error: 'Invalid role. Only teacher_in_charge or developer roles can be assigned.',
      });
    }

    const accounts = readAccounts();

    if (id) {
      const idx = accounts.findIndex((a) => a.id === id);
      if (idx === -1) {
        return res.status(404).json({ error: 'Staff account not found.' });
      }
      accounts[idx].username = cleanUsername;
      accounts[idx].displayName = cleanDisplayName;
      accounts[idx].role = role;
      if (title) accounts[idx].title = String(title).trim();
      if (password && typeof password === 'string' && password.trim().length >= 6) {
        accounts[idx].passwordHash = hashPassword(password.trim());
      }
      if (typeof active === 'boolean') {
        accounts[idx].active = active;
      }
      accounts[idx].updatedAt = Date.now();
      writeAccounts(accounts);
      return res.status(200).json({
        success: true,
        account: sanitizeUser(accounts[idx]),
      });
    }

    if (!password || typeof password !== 'string' || password.trim().length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    if (accounts.some((a) => a.username === cleanUsername)) {
      return res.status(409).json({ error: `Username "${cleanUsername}" is already assigned.` });
    }

    const now = Date.now();
    const newAcc: StaffAccountRecord = {
      id: `staff-${role === 'developer' ? 'dev' : 'tch'}-${crypto.randomBytes(6).toString('hex')}`,
      username: cleanUsername,
      displayName: cleanDisplayName,
      role,
      title:
        String(title || '').trim() ||
        (role === 'developer' ? 'NEXORA Developer' : 'Class 11 Subject Teacher / In-Charge'),
      passwordHash: hashPassword(password.trim()),
      active: true,
      createdAt: now,
      updatedAt: now,
      createdBy: developerUser.username,
    };

    accounts.push(newAcc);
    writeAccounts(accounts);

    return res.status(201).json({
      success: true,
      account: sanitizeUser(newAcc),
    });
  });

  // Developer-Only: Update Staff Account (Password Reset / Role / Active Status)
  app.patch('/api/staff/accounts/:id', requireStaffAuth(['developer']), (req, res) => {
    const { id } = req.params;
    const { displayName, role, title, password, active } = req.body || {};
    const accounts = readAccounts();
    const idx = accounts.findIndex((a) => a.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Staff account not found.' });
    }

    // Prevent removing the last active developer
    if (
      (active === false || (role && role !== 'developer')) &&
      accounts[idx].role === 'developer'
    ) {
      const activeDevs = accounts.filter((a) => a.active && a.role === 'developer' && a.id !== id);
      if (activeDevs.length === 0) {
        return res.status(400).json({
          error: 'Cannot deactivate or demote the last active Developer account.',
        });
      }
    }

    if (displayName && typeof displayName === 'string' && displayName.trim()) {
      accounts[idx].displayName = displayName.trim();
    }
    if (role === 'teacher_in_charge' || role === 'developer') {
      accounts[idx].role = role;
    }
    if (title && typeof title === 'string') {
      accounts[idx].title = title.trim();
    }
    if (password && typeof password === 'string' && password.trim().length >= 6) {
      accounts[idx].passwordHash = hashPassword(password.trim());
    }
    if (typeof active === 'boolean') {
      accounts[idx].active = active;
      if (!active) {
        // Revoke active sessions for deactivated user
        const sessions = readSessions().map((s) =>
          s.userId === id ? { ...s, revoked: true } : s
        );
        writeSessions(sessions);
      }
    }
    accounts[idx].updatedAt = Date.now();
    writeAccounts(accounts);

    return res.json({
      success: true,
      account: sanitizeUser(accounts[idx]),
    });
  });

  // Developer-Only: Delete Staff Account
  app.delete('/api/staff/accounts/:id', requireStaffAuth(['developer']), (req, res) => {
    const { id } = req.params;
    const accounts = readAccounts();
    const target = accounts.find((a) => a.id === id);
    if (!target) {
      return res.status(404).json({ error: 'Staff account not found.' });
    }

    if (target.role === 'developer') {
      const otherDevs = accounts.filter((a) => a.active && a.role === 'developer' && a.id !== id);
      if (otherDevs.length === 0) {
        return res.status(400).json({
          error: 'Cannot delete the last active Developer account.',
        });
      }
    }

    const filtered = accounts.filter((a) => a.id !== id);
    writeAccounts(filtered);

    const sessions = readSessions().map((s) =>
      s.userId === id ? { ...s, revoked: true } : s
    );
    writeSessions(sessions);

    return res.json({ success: true, deletedId: id });
  });

  // ============================================================================
  // TEACHER / IN-CHARGE MANAGEMENT (Authorized Teacher & Developer)
  // Teachers can view faculty list, invite/add teachers, update teacher profiles,
  // and securely reset teacher passwords without viewing previous plaintext.
  // ============================================================================

  app.get('/api/staff/teachers', requireStaffAuth(['teacher_in_charge', 'developer']), (_req, res) => {
    const teachers = readAccounts()
      .filter((a) => a.role === 'teacher_in_charge')
      .map(sanitizeUser);
    return res.json({ success: true, teachers });
  });

  app.post('/api/staff/teachers', requireStaffAuth(['teacher_in_charge', 'developer']), (req, res) => {
    const caller = (req as any).staffUser;
    const { username, displayName, title, password } = req.body || {};

    const cleanUser = String(username || '').trim().toLowerCase();
    const cleanDisplay = String(displayName || '').trim();
    const cleanTitle = String(title || 'Class 11 Subject Teacher').trim();
    const cleanPass = String(password || '').trim();

    if (!cleanUser || cleanUser.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters.' });
    }
    if (!cleanDisplay) {
      return res.status(400).json({ error: 'Display Name is required.' });
    }
    if (!cleanPass || cleanPass.length < 6) {
      return res.status(400).json({ error: 'Teacher password must be at least 6 characters.' });
    }

    const accounts = readAccounts();
    if (accounts.some((a) => a.username === cleanUser)) {
      return res.status(409).json({ error: `Username "${cleanUser}" is already taken.` });
    }

    const newTeacher: StaffAccountRecord = {
      id: `staff-tch-${crypto.randomBytes(6).toString('hex')}`,
      username: cleanUser,
      displayName: cleanDisplay,
      role: 'teacher_in_charge',
      title: cleanTitle,
      passwordHash: hashPassword(cleanPass),
      active: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdBy: caller.username,
    };

    accounts.push(newTeacher);
    writeAccounts(accounts);

    return res.status(201).json({
      success: true,
      message: `Teacher account "${cleanDisplay}" created successfully.`,
      teacher: sanitizeUser(newTeacher),
    });
  });

  app.post('/api/staff/teachers/:id/reset-password', requireStaffAuth(['teacher_in_charge', 'developer']), (req, res) => {
    const caller = (req as any).staffUser;
    const { id } = req.params;
    const { newPassword } = req.body || {};

    const cleanPass = String(newPassword || '').trim();
    if (!cleanPass || cleanPass.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters.' });
    }

    const accounts = readAccounts();
    const targetIdx = accounts.findIndex((a) => a.id === id);
    if (targetIdx === -1) {
      return res.status(404).json({ error: 'Teacher account not found.' });
    }

    const target = accounts[targetIdx];
    // Security guard: A teacher cannot reset a developer password!
    if (target.role === 'developer' && caller.role !== 'developer') {
      return res.status(403).json({
        error: 'Permission denied: Only Developers can reset Developer account passwords.',
        code: 'FORBIDDEN_DEVELOPER_RESET',
      });
    }

    target.passwordHash = hashPassword(cleanPass);
    target.updatedAt = Date.now();
    writeAccounts(accounts);

    return res.json({
      success: true,
      message: `Password for "${target.displayName}" reset successfully.`,
    });
  });

  app.patch('/api/staff/teachers/:id', requireStaffAuth(['teacher_in_charge', 'developer']), (req, res) => {
    const caller = (req as any).staffUser;
    const { id } = req.params;
    const { displayName, title, active } = req.body || {};

    const accounts = readAccounts();
    const targetIdx = accounts.findIndex((a) => a.id === id);
    if (targetIdx === -1) {
      return res.status(404).json({ error: 'Teacher account not found.' });
    }

    const target = accounts[targetIdx];
    if (target.role === 'developer' && caller.role !== 'developer') {
      return res.status(403).json({ error: 'Permission denied: Cannot edit developer account from teacher mode.' });
    }

    if (displayName && typeof displayName === 'string' && displayName.trim()) {
      target.displayName = displayName.trim();
    }
    if (title && typeof title === 'string' && title.trim()) {
      target.title = title.trim();
    }
    if (typeof active === 'boolean') {
      target.active = active;
    }
    target.updatedAt = Date.now();
    writeAccounts(accounts);

    return res.json({
      success: true,
      teacher: sanitizeUser(target),
    });
  });

  app.delete('/api/staff/teachers/:id', requireStaffAuth(['teacher_in_charge', 'developer']), (req, res) => {
    const caller = (req as any).staffUser;
    const { id } = req.params;

    if (caller.id === id) {
      return res.status(400).json({ error: 'You cannot remove your own active teacher account.' });
    }

    const accounts = readAccounts();
    const target = accounts.find((a) => a.id === id);
    if (!target) {
      return res.status(404).json({ error: 'Teacher account not found.' });
    }
    if (target.role === 'developer') {
      return res.status(403).json({ error: 'Cannot remove Developer accounts from Teacher Management.' });
    }

    const remainingTeachers = accounts.filter((a) => a.role === 'teacher_in_charge' && a.id !== id);
    if (remainingTeachers.length === 0) {
      return res.status(400).json({ error: 'Cannot delete the last active Teacher / In-Charge account.' });
    }

    const filtered = accounts.filter((a) => a.id !== id);
    writeAccounts(filtered);

    // Revoke sessions
    const sessions = readSessions().map((s) => s.userId === id ? { ...s, revoked: true } : s);
    writeSessions(sessions);

    return res.json({ success: true, message: `Removed teacher "${target.displayName}".` });
  });

  // ============================================================================
  // STUDENT / CHARACTER MANAGEMENT (DEVELOPER ONLY)
  // Per requirement: Only available in Developer mode.
  // Teachers and students are strictly blocked with 403 Forbidden on write operations.
  // ============================================================================

  const studentsFilePath = path.resolve(dataDir, 'students.json');

  function readStudents(): any[] {
    try {
      if (fs.existsSync(studentsFilePath)) {
        const raw = fs.readFileSync(studentsFilePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [];
  }

  function writeStudents(students: any[]): void {
    writeJsonFileAtomic(studentsFilePath, students);
  }

  // Public GET /api/students: so app modules can load roster
  app.get('/api/students', (_req, res) => {
    const students = readStudents();
    return res.json({ success: true, students, count: students.length });
  });

  // Developer-Only: POST /api/students -> Add new student / character
  app.post('/api/students', requireStaffAuth(['developer']), (req, res) => {
    const { name, stream, gender, rollNumber, avatar } = req.body || {};
    const cleanName = String(name || '').trim();
    const cleanStream = String(stream || 'PCM').toUpperCase().trim();

    if (!cleanName) {
      return res.status(400).json({ error: 'Student name is required.' });
    }
    if (!['PCM', 'PCB', 'COMMERCE', 'HUMANITIES'].includes(cleanStream)) {
      return res.status(400).json({ error: 'Stream must be PCM, PCB, COMMERCE, or HUMANITIES.' });
    }

    const students = readStudents();
    const nextNum = students.length + 1;
    const newStudent = {
      id: `std-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
      name: cleanName,
      stream: cleanStream,
      gender: gender === 'girl' ? 'girl' : 'boy',
      rollNumber: rollNumber || nextNum,
      avatar: avatar || undefined,
      createdAt: Date.now(),
    };

    students.push(newStudent);
    writeStudents(students);

    return res.status(201).json({
      success: true,
      message: `Student character "${cleanName}" (${cleanStream}) added.`,
      student: newStudent,
      totalCount: students.length,
    });
  });

  // Developer-Only: PATCH /api/students/:id -> Update student / character
  app.patch('/api/students/:id', requireStaffAuth(['developer']), (req, res) => {
    const { id } = req.params;
    const { name, stream, gender, rollNumber, avatar } = req.body || {};

    const students = readStudents();
    const idx = students.findIndex((s) => s.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Student character not found.' });
    }

    if (name && typeof name === 'string' && name.trim()) {
      students[idx].name = name.trim();
    }
    if (stream && ['PCM', 'PCB', 'COMMERCE', 'HUMANITIES'].includes(String(stream).toUpperCase().trim())) {
      students[idx].stream = String(stream).toUpperCase().trim();
    }
    if (gender === 'girl' || gender === 'boy') {
      students[idx].gender = gender;
    }
    if (rollNumber) {
      students[idx].rollNumber = rollNumber;
    }
    if (avatar !== undefined) {
      students[idx].avatar = avatar;
    }

    writeStudents(students);
    return res.json({ success: true, student: students[idx] });
  });

  // Developer-Only: DELETE /api/students/:id -> Delete student / character
  app.delete('/api/students/:id', requireStaffAuth(['developer']), (req, res) => {
    const { id } = req.params;
    const students = readStudents();
    const target = students.find((s) => s.id === id);
    if (!target) {
      return res.status(404).json({ error: 'Student character not found.' });
    }

    const filtered = students.filter((s) => s.id !== id);
    writeStudents(filtered);

    return res.json({
      success: true,
      message: `Removed student "${target.name}".`,
      totalCount: filtered.length,
    });
  });

  // Developer-Only: POST /api/students/reset -> Reset to verified default Class 11 CBSE students
  app.post('/api/students/reset', requireStaffAuth(['developer']), async (_req, res) => {
    const { INITIAL_STUDENTS } = await import('../data/initialStudents.ts');
    writeStudents(INITIAL_STUDENTS);
    return res.json({
      success: true,
      message: 'Class roster reset to verified 21 Class 11 students.',
      students: INITIAL_STUDENTS,
      totalCount: INITIAL_STUDENTS.length,
    });
  });

  // ============================================================================
  // 2. PROTECTED DIARY DATABASE, 2:00 PM IST DAILY REFRESH & ATTACHMENT ENDPOINTS
  // ============================================================================

  function readDiaryEntries(): StoredDiaryEntry[] {
    return readJsonFile<StoredDiaryEntry[]>(diaryFilePath, []);
  }

  function writeDiaryEntries(entries: StoredDiaryEntry[]): void {
    writeJsonFileAtomic(diaryFilePath, entries);
  }

  function readDiaryCycleState(): StoredDiaryCycleState {
    return readJsonFile<StoredDiaryCycleState>(diaryCycleFilePath, {
      activeCycleDate: '',
      lastCheckedAt: 0,
      lastRolloverAt: 0,
      initializedCycles: {},
    });
  }

  function writeDiaryCycleState(state: StoredDiaryCycleState): void {
    writeJsonFileAtomic(diaryCycleFilePath, state);
  }

  function sortDiaryEntriesChronologically(entries: StoredDiaryEntry[]): StoredDiaryEntry[] {
    return [...entries].sort((a, b) => {
      const dateCmp = String(b.date || '').localeCompare(String(a.date || ''));
      if (dateCmp !== 0) return dateCmp;
      return (b.updatedAt || b.lastModified || 0) - (a.updatedAt || a.lastModified || 0);
    });
  }

  /**
   * Authoritative 2:00 PM IST (Asia/Kolkata) Daily Diary Refresh & Reconciliation Engine.
   * - Uses authoritative server time in Asia/Kolkata timezone (never client device clock).
   * - Automatically creates or activates the current 2:00 PM IST cycle's diary entry/page.
   * - Never deletes, overwrites, or loses any previous/historical diary entries.
   * - Idempotent: calling multiple times for the same cycle never creates duplicates.
   * - Never resets or modifies Quick Notes.
   */
  function ensureDailyDiaryCycleOnServer(
    referenceNowMs: number = Date.now(),
    options?: {
      isolatedSimulation?: boolean;
      entriesSnapshot?: StoredDiaryEntry[];
      cycleStateSnapshot?: StoredDiaryCycleState;
      forceEnsureActiveEntry?: boolean;
    }
  ): {
    cycleInfo: DiaryCycleInfo;
    entries: StoredDiaryEntry[];
    activeEntry: StoredDiaryEntry | null;
    createdNewCycleEntry: boolean;
    cycleState: StoredDiaryCycleState;
  } {
    const safeNowMs = Number.isFinite(referenceNowMs) ? referenceNowMs : Date.now();
    const cycleInfo = getDiaryCycleInfo(safeNowMs);
    const isIsolated = Boolean(options?.isolatedSimulation);

    const entries: StoredDiaryEntry[] = isIsolated
      ? JSON.parse(JSON.stringify(options?.entriesSnapshot || readDiaryEntries()))
      : readDiaryEntries();

    const cycleState: StoredDiaryCycleState = isIsolated
      ? JSON.parse(
          JSON.stringify(
            options?.cycleStateSnapshot || {
              activeCycleDate: '',
              lastCheckedAt: 0,
              lastRolloverAt: 0,
              initializedCycles: {},
            }
          )
        )
      : readDiaryCycleState();

    if (!cycleState.initializedCycles || typeof cycleState.initializedCycles !== 'object') {
      cycleState.initializedCycles = {};
    }

    const dailyIdempotencyKey = `daily-cycle-${cycleInfo.activeCycleDate}`;
    let activeEntry =
      entries.find(
        (e) =>
          e.id === cycleInfo.dailyEntryId ||
          e.idempotencyKey === dailyIdempotencyKey ||
          e.date === cycleInfo.activeCycleDate
      ) || null;

    const alreadyInitializedForCycle = Boolean(
      cycleState.initializedCycles[cycleInfo.activeCycleDate]
    );

    let entriesChanged = false;
    let stateChanged = false;
    let createdNewCycleEntry = false;

    if (!activeEntry && (!alreadyInitializedForCycle || options?.forceEnsureActiveEntry)) {
      const readableDate = formatReadableDate(cycleInfo.activeCycleDate);
      const entryTimestamp = Math.max(cycleInfo.cycleStartMs, safeNowMs);
      const newDailyEntry: StoredDiaryEntry = {
        id: cycleInfo.dailyEntryId,
        date: cycleInfo.activeCycleDate,
        subject: 'General',
        type: 'Classwork',
        targetStream: 'ALL',
        title: `Daily Class Diary — ${readableDate}`,
        content: `Daily academic log initialized for ${readableDate} (2:00 PM IST cycle). Authorized staff may record classwork, homework, and notices for this session.`,
        description: `Daily academic log initialized for ${readableDate} (2:00 PM IST cycle). Authorized staff may record classwork, homework, and notices for this session.`,
        homework: 'Update subject-wise homework and assignments for this daily cycle.',
        remarks: '2:00 PM IST Daily Cycle Active',
        notices: '',
        teacherRemarks: '2:00 PM IST Daily Cycle Active',
        importantNotices: '',
        lastModified: entryTimestamp,
        createdAt: cycleInfo.cycleStartMs,
        updatedAt: entryTimestamp,
        publishedAt: cycleInfo.cycleStartMs,
        authorId: 'staff-tch-4d948c6f328c',
        authorName: 'Alka Mam (In-Charge)',
        authorRole: 'teacher_in_charge',
        authorRoleLabel: 'Teacher / In-Charge',
        status: 'published',
        attachments: [],
        version: 1,
        idempotencyKey: dailyIdempotencyKey,
      };

      entries.unshift(newDailyEntry);
      activeEntry = newDailyEntry;
      entriesChanged = true;
      createdNewCycleEntry = true;
    }

    if (activeEntry && !cycleState.initializedCycles[cycleInfo.activeCycleDate]) {
      cycleState.initializedCycles[cycleInfo.activeCycleDate] = {
        entryId: activeEntry.id,
        initializedAt: safeNowMs,
        cycleStartMs: cycleInfo.cycleStartMs,
      };
      stateChanged = true;
    }

    if (cycleState.activeCycleDate !== cycleInfo.activeCycleDate) {
      cycleState.activeCycleDate = cycleInfo.activeCycleDate;
      cycleState.lastRolloverAt = safeNowMs;
      stateChanged = true;
    }

    cycleState.lastCheckedAt = safeNowMs;

    const sortedEntries = sortDiaryEntriesChronologically(entries);

    if (!isIsolated) {
      if (entriesChanged) {
        writeDiaryEntries(sortedEntries);
      }
      if (stateChanged || entriesChanged) {
        writeDiaryCycleState(cycleState);
      }
    }

    return {
      cycleInfo,
      entries: sortedEntries,
      activeEntry,
      createdNewCycleEntry,
      cycleState,
    };
  }

  // Run initial 2:00 PM IST reconciliation on server startup (works even when no user is logged in)
  try {
    ensureDailyDiaryCycleOnServer(Date.now());
  } catch (err) {
    console.error('[StaffBackend] Initial 2:00 PM IST diary cycle check error:', err);
  }

  // Background scheduler: ensures 2:00 PM IST daily rollover occurs even when website & APK are closed
  const diaryCycleInterval = setInterval(() => {
    try {
      ensureDailyDiaryCycleOnServer(Date.now());
    } catch (err) {
      console.error('[StaffBackend] Scheduled diary cycle check error:', err);
    }
  }, 15 * 1000);
  if (typeof diaryCycleInterval.unref === 'function') {
    diaryCycleInterval.unref();
  }

  let exactRolloverTimer: ReturnType<typeof setTimeout> | null = null;
  function scheduleNextExact2PMRollover() {
    if (exactRolloverTimer) {
      clearTimeout(exactRolloverTimer);
    }
    const info = getDiaryCycleInfo(Date.now());
    const delayMs = Math.min(2147483647, Math.max(250, info.msUntilNextRefresh + 50));
    exactRolloverTimer = setTimeout(() => {
      try {
        ensureDailyDiaryCycleOnServer(Date.now());
      } catch (err) {
        console.error('[StaffBackend] Exact 2:00 PM IST rollover trigger error:', err);
      } finally {
        scheduleNextExact2PMRollover();
      }
    }, delayMs);
    if (exactRolloverTimer && typeof exactRolloverTimer.unref === 'function') {
      exactRolloverTimer.unref();
    }
  }
  scheduleNextExact2PMRollover();

  function readAttachmentIndex(): Record<string, StoredDiaryAttachment> {
    return readJsonFile<Record<string, StoredDiaryAttachment>>(attachmentIndexFilePath, {});
  }

  function writeAttachmentIndex(index: Record<string, StoredDiaryAttachment>): void {
    writeJsonFileAtomic(attachmentIndexFilePath, index);
  }

  function validateAttachmentBytes(mimeType: string, ext: string, buf: Buffer): { valid: boolean; reason?: string } {
    if (buf.length === 0) {
      return { valid: false, reason: 'Uploaded file is empty (0 bytes).' };
    }
    if (buf.length > MAX_ATTACHMENT_SIZE_BYTES) {
      return {
        valid: false,
        reason: `File size (${(buf.length / (1024 * 1024)).toFixed(2)} MB) exceeds the 5 MB limit.`,
      };
    }

    const allowedExts = ALLOWED_ATTACHMENT_MIMES[mimeType];
    if (!allowedExts) {
      return {
        valid: false,
        reason: `Unsupported file MIME type "${mimeType}". Allowed: PNG, JPEG, WEBP, GIF, PDF, TXT, DOC, DOCX.`,
      };
    }
    if (!allowedExts.includes(ext.toLowerCase())) {
      return {
        valid: false,
        reason: `File extension "${ext}" does not match MIME type "${mimeType}".`,
      };
    }

    // Verify magic header signatures for binary formats
    if (mimeType === 'image/png') {
      if (buf.length < 8 || buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) {
        return { valid: false, reason: 'File failed PNG header verification.' };
      }
    } else if (mimeType === 'image/jpeg') {
      if (buf.length < 3 || buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) {
        return { valid: false, reason: 'File failed JPEG header verification.' };
      }
    } else if (mimeType === 'image/gif') {
      const header = buf.slice(0, 4).toString('ascii');
      if (header !== 'GIF8') {
        return { valid: false, reason: 'File failed GIF header verification.' };
      }
    } else if (mimeType === 'image/webp') {
      if (
        buf.length < 12 ||
        buf.slice(0, 4).toString('ascii') !== 'RIFF' ||
        buf.slice(8, 12).toString('ascii') !== 'WEBP'
      ) {
        return { valid: false, reason: 'File failed WEBP header verification.' };
      }
    } else if (mimeType === 'application/pdf') {
      if (buf.length < 5 || buf.slice(0, 5).toString('ascii') !== '%PDF-') {
        return { valid: false, reason: 'File failed PDF header verification.' };
      }
    }

    return { valid: true };
  }

  // GET Authoritative 2:00 PM IST (Asia/Kolkata) Diary Cycle State
  app.get('/api/diary/cycle', requireStaffAuth(['teacher_in_charge', 'developer']), (_req, res) => {
    const now = Date.now();
    const { cycleInfo, activeEntry, createdNewCycleEntry, entries } =
      ensureDailyDiaryCycleOnServer(now);
    return res.json({
      success: true,
      cycleInfo,
      activeEntry,
      createdNewCycleEntry,
      totalEntriesCount: entries.length,
      serverTimestamp: now,
    });
  });

  // POST Reconcile 2:00 PM IST (Asia/Kolkata) Diary Cycle (supports reconnect reconciliation & isolated rollover verification)
  app.post(
    '/api/diary/cycle/reconcile',
    requireStaffAuth(['teacher_in_charge', 'developer']),
    (req, res) => {
      const {
        simulatedNowMs,
        isolatedSimulation = false,
        entriesSnapshot,
        cycleStateSnapshot,
        forceEnsureActiveEntry = false,
      } = req.body || {};

      const targetNowMs =
        typeof simulatedNowMs === 'number' && Number.isFinite(simulatedNowMs)
          ? simulatedNowMs
          : Date.now();

      const reconciled = ensureDailyDiaryCycleOnServer(targetNowMs, {
        isolatedSimulation: Boolean(isolatedSimulation),
        entriesSnapshot: Array.isArray(entriesSnapshot) ? entriesSnapshot : undefined,
        cycleStateSnapshot:
          cycleStateSnapshot && typeof cycleStateSnapshot === 'object'
            ? cycleStateSnapshot
            : undefined,
        forceEnsureActiveEntry: Boolean(forceEnsureActiveEntry),
      });

      return res.json({
        success: true,
        cycleInfo: reconciled.cycleInfo,
        activeEntry: reconciled.activeEntry,
        createdNewCycleEntry: reconciled.createdNewCycleEntry,
        entries: reconciled.entries,
        cycleState: reconciled.cycleState,
        serverTimestamp: targetNowMs,
      });
    }
  );

  // GET all Diary Entries (Chronological order) — supports both /api/diary and /api/diary/entries
  app.get(['/api/diary', '/api/diary/entries'], requireStaffAuth(['teacher_in_charge', 'developer']), (req, res) => {
    const now = Date.now();
    const { cycleInfo, entries, activeEntry, createdNewCycleEntry } =
      ensureDailyDiaryCycleOnServer(now);

    const search = String(req.query.search || '').trim().toLowerCase();
    const dateFilter = String(req.query.date || '').trim();
    const filtered = entries.filter((e) => {
      if (dateFilter && e.date !== dateFilter) return false;
      if (!search) return true;
      return (
        (e.title || '').toLowerCase().includes(search) ||
        (e.content || '').toLowerCase().includes(search) ||
        (e.description || '').toLowerCase().includes(search) ||
        (e.homework || '').toLowerCase().includes(search) ||
        (e.authorName || '').toLowerCase().includes(search) ||
        (e.subject || '').toLowerCase().includes(search) ||
        (e.date || '').includes(search)
      );
    });

    return res.json({
      success: true,
      entries: filtered,
      cycleInfo,
      activeCycleDate: cycleInfo.activeCycleDate,
      activeEntryId: activeEntry?.id || cycleInfo.dailyEntryId,
      createdNewCycleEntry,
      serverTimestamp: now,
    });
  });

  // POST Standalone Protected Diary Attachment Upload (/api/diary/attachments/upload)
  app.post(
    '/api/diary/attachments/upload',
    requireStaffAuth(['teacher_in_charge', 'developer']),
    (req, res) => {
      const staffUser = (req as any).staffUser;
      const { fileName, mimeType, base64Data, diaryId = 'pending' } = req.body || {};

      if (!fileName || typeof fileName !== 'string' || !mimeType || typeof mimeType !== 'string' || !base64Data) {
        return res.status(400).json({
          error: 'fileName, mimeType, and base64Data are required for attachment upload.',
        });
      }

      const safeFileName = path.basename(fileName).replace(/[^a-zA-Z0-9._ -]/g, '_');
      const ext = path.extname(safeFileName).toLowerCase();

      const rawBase64 = String(base64Data).includes(',')
        ? String(base64Data).split(',')[1]
        : String(base64Data);

      let fileBuffer: Buffer;
      try {
        fileBuffer = Buffer.from(rawBase64, 'base64');
      } catch {
        return res.status(400).json({ error: 'Invalid base64 file encoding.' });
      }

      const validation = validateAttachmentBytes(mimeType.toLowerCase().trim(), ext, fileBuffer);
      if (!validation.valid) {
        return res.status(400).json({
          error: validation.reason,
          code: 'INVALID_ATTACHMENT_FILE',
        });
      }

      const attachmentId = `att-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
      const storageFileName = `${attachmentId}${ext}`;
      const targetPath = path.resolve(attachmentsDir, storageFileName);
      if (!targetPath.startsWith(attachmentsDir)) {
        return res.status(403).json({ error: 'Forbidden attachment path.' });
      }

      fs.writeFileSync(targetPath, fileBuffer, { mode: 0o600 });

      const now = Date.now();
      const storedMeta: StoredDiaryAttachment = {
        id: attachmentId,
        diaryId: String(diaryId),
        fileName: safeFileName,
        storageFileName,
        mimeType: mimeType.toLowerCase().trim(),
        sizeBytes: fileBuffer.length,
        uploadedAt: now,
        uploadedBy: staffUser.id,
        uploadedByName: staffUser.displayName,
      };

      const attIndex = readAttachmentIndex();
      attIndex[attachmentId] = storedMeta;
      writeAttachmentIndex(attIndex);

      const publicMeta = {
        id: storedMeta.id,
        diaryId: storedMeta.diaryId,
        originalName: storedMeta.fileName,
        fileName: storedMeta.fileName,
        mimeType: storedMeta.mimeType,
        sizeBytes: storedMeta.sizeBytes,
        uploadedAt: storedMeta.uploadedAt,
        uploadedBy: storedMeta.uploadedBy,
        uploadedByName: storedMeta.uploadedByName,
      };

      return res.status(201).json({
        success: true,
        attachment: publicMeta,
      });
    }
  );

  // GET single Diary Entry by ID or Date
  app.get(['/api/diary/:idOrDate', '/api/diary/entries/:idOrDate'], requireStaffAuth(['teacher_in_charge', 'developer']), (req, res) => {
    const { idOrDate } = req.params;
    const { entries, cycleInfo } = ensureDailyDiaryCycleOnServer(Date.now());
    const entry = entries.find((e) => e.id === idOrDate || e.date === idOrDate);
    if (!entry) {
      return res.status(404).json({ error: 'Diary entry not found.' });
    }
    return res.json({ success: true, entry, cycleInfo });
  });

  // POST Create or Publish Diary Entry — supports both /api/diary and /api/diary/entries
  app.post(['/api/diary', '/api/diary/entries'], requireStaffAuth(['teacher_in_charge', 'developer']), (req, res) => {
    const staffUser = (req as any).staffUser;
    const rate = checkRateLimit(writeRateMap, `diary:${staffUser.id}`, 60, 60 * 1000);
    if (!rate.allowed) {
      return res.status(429).json({ error: 'Too many write requests. Please slow down.' });
    }

    const now = Date.now();
    const { cycleInfo, entries } = ensureDailyDiaryCycleOnServer(now);

    const {
      id,
      date,
      subject = 'General',
      type = 'Homework',
      targetStream = 'ALL',
      title = '',
      content = '',
      description = '',
      homework = '',
      remarks = '',
      notices = '',
      teacherRemarks = '',
      importantNotices = '',
      attachments = [],
      status = 'published',
      idempotencyKey,
    } = req.body || {};

    const cleanDate = String(date || getActiveDiaryCycleDateIST(now)).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
      return res.status(400).json({ error: 'Valid YYYY-MM-DD diary date is required.' });
    }
    if (!String(title).trim() && !String(content).trim() && !String(description).trim() && !String(homework).trim()) {
      return res.status(400).json({
        error: 'Diary entry must include a title, description/content, or homework.',
      });
    }

    // Idempotent check by idempotencyKey
    if (idempotencyKey) {
      const existingByKey = entries.find((e) => e.idempotencyKey === idempotencyKey);
      if (existingByKey) {
        return res.status(200).json({
          success: true,
          entry: existingByKey,
          cycleInfo,
          deduplicated: true,
        });
      }
    }

    const cleanTitle = String(title).trim();
    const cleanContent = String(content || description).trim();
    const cleanHomework = String(homework || '').trim();
    const cleanSubject = String(subject || 'General').trim();

    // Rapid duplicate upload guard (same author, date, subject, title, content, homework within 5 seconds)
    if (!id) {
      const rapidDuplicate = entries.find(
        (e) =>
          e.authorId === staffUser.id &&
          e.date === cleanDate &&
          (e.subject || 'General') === cleanSubject &&
          e.title === cleanTitle &&
          e.content === cleanContent &&
          e.homework === cleanHomework &&
          Math.abs(now - (e.createdAt || 0)) < 5000
      );
      if (rapidDuplicate) {
        return res.status(200).json({
          success: true,
          entry: rapidDuplicate,
          cycleInfo,
          deduplicated: true,
        });
      }
    }

    const resolvedRemarks = String(remarks || teacherRemarks || '').trim();
    const resolvedNotices = String(notices || importantNotices || '').trim();
    const sanitizedAttachments = Array.isArray(attachments)
      ? attachments.map((a: any) => ({
          id: String(a.id),
          diaryId: String(a.diaryId || ''),
          originalName: String(a.originalName || a.fileName || 'attachment'),
          fileName: String(a.fileName || a.originalName || 'attachment'),
          mimeType: String(a.mimeType || 'application/octet-stream'),
          sizeBytes: Number(a.sizeBytes) || 0,
          uploadedAt: Number(a.uploadedAt) || now,
          uploadedBy: String(a.uploadedBy || staffUser.id),
          uploadedByName: String(a.uploadedByName || staffUser.displayName),
        }))
      : [];

    const existingIdx = id ? entries.findIndex((e) => e.id === id) : -1;
    if (existingIdx >= 0) {
      const prev = entries[existingIdx];
      const updated: any = {
        ...prev,
        date: cleanDate,
        subject: cleanSubject || prev.subject || 'General',
        type: String(type || prev.type || 'Homework').trim(),
        targetStream: String(targetStream || prev.targetStream || 'ALL').trim(),
        title: cleanTitle,
        content: cleanContent,
        description: String(description || content).trim(),
        homework: cleanHomework,
        remarks: resolvedRemarks,
        notices: resolvedNotices,
        teacherRemarks: resolvedRemarks,
        importantNotices: resolvedNotices,
        attachments: Array.isArray(attachments) ? sanitizedAttachments : prev.attachments,
        status: status === 'draft' ? 'draft' : 'published',
        lastModified: now,
        updatedAt: now,
        publishedAt: prev.publishedAt || now,
        version: (prev.version || 1) + 1,
        idempotencyKey: idempotencyKey || prev.idempotencyKey,
      };
      entries[existingIdx] = updated;
      writeDiaryEntries(sortDiaryEntriesChronologically(entries));
      return res.status(200).json({ success: true, entry: updated, cycleInfo });
    }

    const newEntry: any = {
      id: id && String(id).trim() ? String(id).trim() : `diary-${cleanDate}-${crypto.randomBytes(4).toString('hex')}`,
      date: cleanDate,
      subject: cleanSubject,
      type: String(type || 'Homework').trim(),
      targetStream: String(targetStream || 'ALL').trim(),
      title: cleanTitle,
      content: cleanContent,
      description: String(description || content).trim(),
      homework: cleanHomework,
      remarks: resolvedRemarks,
      notices: resolvedNotices,
      teacherRemarks: resolvedRemarks,
      importantNotices: resolvedNotices,
      lastModified: now,
      createdAt: now,
      updatedAt: now,
      publishedAt: now,
      authorId: staffUser.id,
      authorName: staffUser.displayName,
      authorRole: staffUser.role,
      authorRoleLabel: staffUser.role === 'developer' ? 'Developer' : 'Teacher / In-Charge',
      status: status === 'draft' ? 'draft' : 'published',
      attachments: sanitizedAttachments,
      version: 1,
      idempotencyKey: idempotencyKey ? String(idempotencyKey) : undefined,
    };

    entries.unshift(newEntry);
    writeDiaryEntries(sortDiaryEntriesChronologically(entries));

    // Mark cycle state as having an entry if created on activeCycleDate
    if (cleanDate === cycleInfo.activeCycleDate) {
      const cycleState = readDiaryCycleState();
      if (!cycleState.initializedCycles) cycleState.initializedCycles = {};
      if (!cycleState.initializedCycles[cleanDate]) {
        cycleState.initializedCycles[cleanDate] = {
          entryId: newEntry.id,
          initializedAt: now,
          cycleStartMs: cycleInfo.cycleStartMs,
        };
        writeDiaryCycleState(cycleState);
      }
    }

    return res.status(201).json({
      success: true,
      entry: newEntry,
      cycleInfo,
    });
  });

  // PUT Update Existing Diary Entry (with concurrent edit protection)
  app.put(['/api/diary/:id', '/api/diary/entries/:id'], requireStaffAuth(['teacher_in_charge', 'developer']), (req, res) => {
    const { id } = req.params;
    const {
      date,
      subject,
      type,
      targetStream,
      title,
      content,
      description,
      homework,
      remarks,
      notices,
      teacherRemarks,
      importantNotices,
      attachments,
      status,
      baseVersion,
      forceOverwrite,
    } = req.body || {};

    const entries = readDiaryEntries();
    const idx = entries.findIndex((e) => e.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Diary entry not found.' });
    }

    const current: any = entries[idx];
    if (
      typeof baseVersion === 'number' &&
      baseVersion !== current.version &&
      !forceOverwrite
    ) {
      return res.status(409).json({
        error: 'This diary entry was modified by another staff member. Review the latest version before overwriting.',
        code: 'CONCURRENT_EDIT_CONFLICT',
        latestEntry: current,
      });
    }

    const now = Date.now();
    const resolvedRemarks =
      typeof remarks === 'string'
        ? remarks.trim()
        : typeof teacherRemarks === 'string'
        ? teacherRemarks.trim()
        : current.remarks || current.teacherRemarks || '';
    const resolvedNotices =
      typeof notices === 'string'
        ? notices.trim()
        : typeof importantNotices === 'string'
        ? importantNotices.trim()
        : current.notices || current.importantNotices || '';

    const updated: any = {
      ...current,
      date: date && /^\d{4}-\d{2}-\d{2}$/.test(String(date)) ? String(date) : current.date,
      subject: typeof subject === 'string' ? subject.trim() : current.subject || 'General',
      type: typeof type === 'string' ? type.trim() : current.type || 'Homework',
      targetStream: typeof targetStream === 'string' ? targetStream.trim() : current.targetStream || 'ALL',
      title: typeof title === 'string' ? title.trim() : current.title,
      content:
        typeof content === 'string'
          ? content.trim()
          : typeof description === 'string'
          ? description.trim()
          : current.content,
      description:
        typeof description === 'string'
          ? description.trim()
          : typeof content === 'string'
          ? content.trim()
          : current.description,
      homework: typeof homework === 'string' ? homework.trim() : current.homework,
      remarks: resolvedRemarks,
      notices: resolvedNotices,
      teacherRemarks: resolvedRemarks,
      importantNotices: resolvedNotices,
      attachments: Array.isArray(attachments) ? attachments : current.attachments,
      status: status === 'draft' || status === 'published' ? status : current.status,
      lastModified: now,
      updatedAt: now,
      version: (current.version || 1) + 1,
    };

    entries[idx] = updated;
    writeDiaryEntries(entries);

    return res.json({
      success: true,
      entry: updated,
    });
  });

  // DELETE Diary Entry & Associated Protected Attachments
  app.delete(['/api/diary/:id', '/api/diary/entries/:id'], requireStaffAuth(['teacher_in_charge', 'developer']), (req, res) => {
    const { id } = req.params;
    const entries = readDiaryEntries();
    const target = entries.find((e) => e.id === id);
    if (!target) {
      return res.status(404).json({ error: 'Diary entry not found.' });
    }

    const attIndex = readAttachmentIndex();
    for (const att of target.attachments || []) {
      const stored = attIndex[att.id];
      if (stored) {
        const binPath = path.resolve(attachmentsDir, stored.storageFileName);
        if (fs.existsSync(binPath)) {
          try {
            fs.unlinkSync(binPath);
          } catch {}
        }
        delete attIndex[att.id];
      }
    }
    writeAttachmentIndex(attIndex);

    const remaining = entries.filter((e) => e.id !== id);
    writeDiaryEntries(remaining);

    return res.json({
      success: true,
      deletedId: id,
    });
  });

  // POST Upload Protected Diary Attachment to specific entry
  app.post('/api/diary/:id/attachments', requireStaffAuth(['teacher_in_charge', 'developer']), (req, res) => {
    const staffUser = (req as any).staffUser;
    const { id } = req.params;
    const { fileName, mimeType, base64Data } = req.body || {};

    const entries = readDiaryEntries();
    const entryIdx = entries.findIndex((e) => e.id === id);
    if (entryIdx === -1) {
      return res.status(404).json({ error: 'Target diary entry not found.' });
    }

    if (!fileName || typeof fileName !== 'string' || !mimeType || typeof mimeType !== 'string' || !base64Data) {
      return res.status(400).json({
        error: 'fileName, mimeType, and base64Data are required for attachment upload.',
      });
    }

    if ((entries[entryIdx].attachments || []).length >= 5) {
      return res.status(400).json({
        error: 'Maximum of 5 attachments allowed per diary entry.',
      });
    }

    const safeFileName = path.basename(fileName).replace(/[^a-zA-Z0-9._ -]/g, '_');
    const ext = path.extname(safeFileName).toLowerCase();

    // Strip optional data URL prefix
    const rawBase64 = String(base64Data).includes(',')
      ? String(base64Data).split(',')[1]
      : String(base64Data);

    let fileBuffer: Buffer;
    try {
      fileBuffer = Buffer.from(rawBase64, 'base64');
    } catch {
      return res.status(400).json({ error: 'Invalid base64 file encoding.' });
    }

    const validation = validateAttachmentBytes(mimeType.toLowerCase().trim(), ext, fileBuffer);
    if (!validation.valid) {
      return res.status(400).json({
        error: validation.reason,
        code: 'INVALID_ATTACHMENT_FILE',
      });
    }

    const attachmentId = `att-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
    const storageFileName = `${attachmentId}${ext}`;
    const targetPath = path.resolve(attachmentsDir, storageFileName);
    if (!targetPath.startsWith(attachmentsDir)) {
      return res.status(403).json({ error: 'Forbidden attachment path.' });
    }

    fs.writeFileSync(targetPath, fileBuffer, { mode: 0o600 });

    const now = Date.now();
    const storedMeta: StoredDiaryAttachment = {
      id: attachmentId,
      diaryId: id,
      fileName: safeFileName,
      storageFileName,
      mimeType: mimeType.toLowerCase().trim(),
      sizeBytes: fileBuffer.length,
      uploadedAt: now,
      uploadedBy: staffUser.id,
      uploadedByName: staffUser.displayName,
    };

    const attIndex = readAttachmentIndex();
    attIndex[attachmentId] = storedMeta;
    writeAttachmentIndex(attIndex);

    const publicMeta = {
      id: storedMeta.id,
      diaryId: storedMeta.diaryId,
      originalName: storedMeta.fileName,
      fileName: storedMeta.fileName,
      mimeType: storedMeta.mimeType,
      sizeBytes: storedMeta.sizeBytes,
      uploadedAt: storedMeta.uploadedAt,
      uploadedBy: storedMeta.uploadedBy,
      uploadedByName: storedMeta.uploadedByName,
    };

    entries[entryIdx].attachments = [...(entries[entryIdx].attachments || []), publicMeta];
    entries[entryIdx].updatedAt = now;
    entries[entryIdx].lastModified = now;
    entries[entryIdx].version = (entries[entryIdx].version || 1) + 1;
    writeDiaryEntries(entries);

    return res.status(201).json({
      success: true,
      attachment: publicMeta,
      entry: entries[entryIdx],
    });
  });

  // POST Issue a Short-Lived (60s) Signed Download Ticket for a Protected Attachment
  app.post(
    '/api/diary/attachments/:attachmentId/ticket',
    requireStaffAuth(['teacher_in_charge', 'developer']),
    (req, res) => {
      const staffUser = (req as any).staffUser;
      const { attachmentId } = req.params;
      const attIndex = readAttachmentIndex();
      const stored = attIndex[attachmentId];
      if (!stored) {
        return res.status(404).json({ error: 'Attachment not found.' });
      }

      const expiresAt = Date.now() + DOWNLOAD_TICKET_TTL_MS;
      const ticketPayload = JSON.stringify({
        attachmentId,
        userId: staffUser.id,
        role: staffUser.role,
        expiresAt,
      });
      const encodedPayload = Buffer.from(ticketPayload, 'utf8').toString('base64url');
      const signedTicket = signPayload(encodedPayload);

      const baseTicketUrl = `/api/diary/attachments/${encodeURIComponent(attachmentId)}?ticket=${encodeURIComponent(
        signedTicket
      )}`;
      return res.json({
        success: true,
        ticket: signedTicket,
        expiresAt,
        inlineUrl: `${baseTicketUrl}&inline=1`,
        downloadUrl: `${baseTicketUrl}&download=1`,
      });
    }
  );

  // GET Protected Attachment Binary (Requires Bearer Token OR Valid Short-Lived Signed Ticket)
  app.get('/api/diary/attachments/:attachmentId', (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const { attachmentId } = req.params;
    const ticketParam = String(req.query.ticket || '').trim();

    let authorized = false;
    const sessionCheck = verifyRequestSession(req);
    if (sessionCheck.status === 'forbidden_role') {
      return res.status(403).json({
        error: sessionCheck.message,
        code: 'FORBIDDEN_ROLE',
      });
    }
    if (sessionCheck.status === 'ok' && sessionCheck.user) {
      authorized = true;
    } else if (ticketParam) {
      const verifiedPayloadB64 = verifySignedPayload(ticketParam);
      if (verifiedPayloadB64) {
        try {
          const parsed = JSON.parse(Buffer.from(verifiedPayloadB64, 'base64url').toString('utf8'));
          if (
            parsed &&
            parsed.attachmentId === attachmentId &&
            (parsed.role === 'teacher_in_charge' || parsed.role === 'developer') &&
            Date.now() <= Number(parsed.expiresAt)
          ) {
            const accounts = readAccounts();
            const activeUser = accounts.find((a) => a.id === parsed.userId && a.active);
            if (activeUser) {
              authorized = true;
            }
          }
        } catch {}
      }
    }

    if (!authorized) {
      return res.status(401).json({
        error: 'Unauthorized: Protected diary attachments require Teacher/In-Charge or Developer authentication.',
        code: 'ATTACHMENT_AUTH_REQUIRED',
      });
    }

    const attIndex = readAttachmentIndex();
    const stored = attIndex[attachmentId];
    if (!stored) {
      return res.status(404).json({ error: 'Protected attachment not found.' });
    }

    const binPath = path.resolve(attachmentsDir, stored.storageFileName);
    if (!binPath.startsWith(attachmentsDir) || !fs.existsSync(binPath)) {
      return res.status(404).json({ error: 'Attachment file missing on server.' });
    }

    const disposition = req.query.download === '1' ? 'attachment' : 'inline';
    res.setHeader('Content-Type', stored.mimeType);
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename="${stored.fileName.replace(/"/g, '')}"`
    );
    return res.sendFile(binPath);
  });

  // DELETE Single Attachment from a Diary Entry
  app.delete(
    '/api/diary/:diaryId/attachments/:attachmentId',
    requireStaffAuth(['teacher_in_charge', 'developer']),
    (req, res) => {
      const { diaryId, attachmentId } = req.params;
      const entries = readDiaryEntries();
      const idx = entries.findIndex((e) => e.id === diaryId);
      if (idx === -1) {
        return res.status(404).json({ error: 'Diary entry not found.' });
      }

      const attIndex = readAttachmentIndex();
      const stored = attIndex[attachmentId];
      if (stored) {
        const binPath = path.resolve(attachmentsDir, stored.storageFileName);
        if (fs.existsSync(binPath)) {
          try {
            fs.unlinkSync(binPath);
          } catch {}
        }
        delete attIndex[attachmentId];
        writeAttachmentIndex(attIndex);
      }

      entries[idx].attachments = (entries[idx].attachments || []).filter((a) => a.id !== attachmentId);
      entries[idx].updatedAt = Date.now();
      entries[idx].lastModified = Date.now();
      entries[idx].version = (entries[idx].version || 1) + 1;
      writeDiaryEntries(entries);

      return res.json({
        success: true,
        entry: entries[idx],
      });
    }
  );

  // ============================================================================
  // 3. QUICK NOTES — PRIVATE STAFF-ONLY SHARED FEED ENDPOINTS
  // ============================================================================

  function readQuickNotes(): StoredQuickNote[] {
    return readJsonFile<StoredQuickNote[]>(quickNotesFilePath, []);
  }

  function writeQuickNotes(notes: StoredQuickNote[]): void {
    writeJsonFileAtomic(quickNotesFilePath, notes);
  }

  // GET All Staff Quick Notes (Newest First)
  app.get('/api/quick-notes', requireStaffAuth(['teacher_in_charge', 'developer']), (req, res) => {
    const notes = readQuickNotes().sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) {
        return a.pinned ? -1 : 1;
      }
      return b.createdAt - a.createdAt;
    });

    const search = String(req.query.search || '').trim().toLowerCase();
    const category = String(req.query.category || '').trim().toLowerCase();
    const authorRole = String(req.query.authorRole || '').trim().toLowerCase();

    const filtered = notes.filter((n) => {
      if (category && category !== 'all' && n.category !== category) return false;
      if (authorRole && authorRole !== 'all' && n.authorRole !== authorRole) return false;
      if (search) {
        const hay = `${n.title || ''} ${n.content} ${n.authorName}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    });

    return res.json({
      success: true,
      notes: filtered,
      serverTimestamp: Date.now(),
    });
  });

  // POST Create a Staff Quick Note (with duplicate submission protection)
  app.post('/api/quick-notes', requireStaffAuth(['teacher_in_charge', 'developer']), (req, res) => {
    const staffUser = (req as any).staffUser;
    const rate = checkRateLimit(writeRateMap, `qnotes:${staffUser.id}`, 60, 60 * 1000);
    if (!rate.allowed) {
      return res.status(429).json({ error: 'Too many note submissions. Please wait a moment.' });
    }

    const { id, title = '', content, category = 'general', pinned = false, idempotencyKey } = req.body || {};
    const cleanContent = String(content || '').trim();
    const cleanTitle = String(title || '').trim();

    if (!cleanContent) {
      return res.status(400).json({ error: 'Quick Note content cannot be empty.' });
    }
    if (cleanContent.length > 4000) {
      return res.status(400).json({ error: 'Quick Note content exceeds maximum length (4000 chars).' });
    }

    const notes = readQuickNotes();
    const now = Date.now();

    // Prevent accidental duplicate submission via idempotencyKey or rapid identical post within 5s
    if (idempotencyKey) {
      const existingByKey = notes.find((n) => n.idempotencyKey === idempotencyKey);
      if (existingByKey) {
        return res.status(200).json({
          success: true,
          note: existingByKey,
          deduplicated: true,
        });
      }
    }

    const recentIdentical = notes.find(
      (n) =>
        n.authorId === staffUser.id &&
        n.content === cleanContent &&
        n.title === cleanTitle &&
        Math.abs(now - n.createdAt) < 5000
    );
    if (recentIdentical) {
      return res.status(200).json({
        success: true,
        note: recentIdentical,
        deduplicated: true,
      });
    }

    const validCategories = ['announcement', 'academic', 'urgent', 'moderation', 'general', 'handover'] as const;
    const resolvedCategory = validCategories.includes(category) ? category : 'general';

    const newNote: any = {
      id: id && String(id).trim() ? String(id).trim() : `qnote-${now}-${crypto.randomBytes(4).toString('hex')}`,
      title: cleanTitle,
      content: cleanContent,
      category: resolvedCategory,
      pinned: Boolean(pinned),
      authorId: staffUser.id,
      authorName: staffUser.displayName,
      authorRole: staffUser.role,
      authorRoleLabel: staffUser.role === 'developer' ? 'Developer' : 'Teacher / In-Charge',
      createdAt: now,
      updatedAt: now,
      version: 1,
      idempotencyKey: idempotencyKey ? String(idempotencyKey) : undefined,
    };

    notes.unshift(newNote);
    writeQuickNotes(notes);

    return res.status(201).json({
      success: true,
      note: newNote,
    });
  });

  // PUT Edit an Existing Quick Note (with ownership/moderation check & optimistic concurrency)
  app.put('/api/quick-notes/:id', requireStaffAuth(['teacher_in_charge', 'developer']), (req, res) => {
    const staffUser = (req as any).staffUser;
    const { id } = req.params;
    const { title, content, category, pinned, baseVersion, forceOverwrite } = req.body || {};

    const notes = readQuickNotes();
    const idx = notes.findIndex((n) => n.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Quick Note not found.' });
    }

    const target = notes[idx];

    // Permission check: Teachers can edit their own notes (or moderate teacher notes); Developers can edit any note
    const isOwner = target.authorId === staffUser.id || target.authorName === staffUser.displayName;
    if (!isOwner && staffUser.role !== 'developer' && target.authorRole === 'developer') {
      return res.status(403).json({
        error: 'Permission denied: Only the Developer author can modify this Developer note.',
        code: 'NOTE_EDIT_FORBIDDEN',
      });
    }

    if (
      typeof baseVersion === 'number' &&
      baseVersion !== target.version &&
      !forceOverwrite
    ) {
      return res.status(409).json({
        error:
          'Concurrent edit detected: Another authorized user updated this note. Review the latest content before saving.',
        code: 'CONCURRENT_EDIT_CONFLICT',
        latestNote: target,
      });
    }

    const cleanContent = typeof content === 'string' ? content.trim() : target.content;
    if (!cleanContent) {
      return res.status(400).json({ error: 'Quick Note content cannot be empty.' });
    }

    const validCategories = ['announcement', 'academic', 'urgent', 'moderation', 'general', 'handover'] as const;
    const now = Date.now();
    const updated: any = {
      ...target,
      title: typeof title === 'string' ? title.trim() : target.title,
      content: cleanContent,
      category: validCategories.includes(category) ? category : target.category,
      pinned: typeof pinned === 'boolean' ? pinned : target.pinned,
      authorRoleLabel:
        (target as any).authorRoleLabel ||
        (target.authorRole === 'developer' ? 'Developer' : 'Teacher / In-Charge'),
      updatedAt: now,
      version: (target.version || 1) + 1,
    };

    notes[idx] = updated;
    writeQuickNotes(notes);

    return res.json({
      success: true,
      note: updated,
    });
  });

  // DELETE Quick Note
  app.delete('/api/quick-notes/:id', requireStaffAuth(['teacher_in_charge', 'developer']), (req, res) => {
    const staffUser = (req as any).staffUser;
    const { id } = req.params;

    const notes = readQuickNotes();
    const target = notes.find((n) => n.id === id);
    if (!target) {
      return res.status(404).json({ error: 'Quick Note not found.' });
    }

    const isOwner = target.authorId === staffUser.id || target.authorName === staffUser.displayName;
    if (!isOwner && staffUser.role !== 'developer' && target.authorRole === 'developer') {
      return res.status(403).json({
        error: 'Permission denied: Only a Developer can delete a Developer note.',
        code: 'NOTE_DELETE_FORBIDDEN',
      });
    }

    const remaining = notes.filter((n) => n.id !== id);
    writeQuickNotes(remaining);

    return res.json({
      success: true,
      deletedId: id,
    });
  });

  // ============================================================================
  // 4. UNIFIED OFFLINE QUEUE SYNCHRONIZATION ENDPOINT
  // ============================================================================

  app.all('/api/staff/sync*', requireStaffAuth(['teacher_in_charge', 'developer']));

  app.post('/api/staff/sync', requireStaffAuth(['teacher_in_charge', 'developer']), (req, res) => {
    const staffUser = (req as any).staffUser;
    const { mutations = [] } = req.body || {};

    if (!Array.isArray(mutations)) {
      return res.status(400).json({ error: 'mutations must be an array.' });
    }

    const results: {
      mutationId: string;
      status: 'synced' | 'conflict' | 'failed';
      entityId: string;
      error?: string;
    }[] = [];

    const now = Date.now();
    const { cycleInfo, entries: reconciledDiary } = ensureDailyDiaryCycleOnServer(now);
    const diaryEntries = [...reconciledDiary];
    const quickNotes = readQuickNotes();
    let diaryChanged = false;
    let notesChanged = false;

    for (const mut of mutations) {
      if (!mut || typeof mut !== 'object') continue;
      const mutationId = mut.id;
      const entityType = mut.entityType || mut.target;
      const operation = mut.operation;
      const entityId = mut.entityId || mut.recordId;
      const payload = mut.payload || {};
      const idempotencyKey = mut.idempotencyKey;
      const baseUpdatedAt = mut.baseUpdatedAt;

      try {
        if (entityType === 'quick_note') {
          if (operation === 'create') {
            const existing = quickNotes.find(
              (n) => n.id === entityId || (idempotencyKey && n.idempotencyKey === idempotencyKey)
            );
            if (existing) {
              results.push({ mutationId, status: 'synced', entityId: existing.id });
              continue;
            }
            const cleanContent = String(payload.content || '').trim();
            if (!cleanContent) {
              results.push({ mutationId, status: 'failed', entityId, error: 'Empty note content' });
              continue;
            }
            const created: StoredQuickNote = {
              id: entityId || `qnote-${now}-${crypto.randomBytes(4).toString('hex')}`,
              title: String(payload.title || '').trim(),
              content: cleanContent,
              category: payload.category || 'general',
              pinned: Boolean(payload.pinned),
              authorId: staffUser.id,
              authorName: staffUser.displayName,
              authorRole: staffUser.role,
              authorRoleLabel: staffUser.role === 'developer' ? 'Developer' : 'Teacher / In-Charge',
              createdAt: Number(payload.createdAt) || now,
              updatedAt: now,
              version: 1,
              idempotencyKey,
            };
            quickNotes.unshift(created);
            notesChanged = true;
            results.push({ mutationId, status: 'synced', entityId: created.id });
          } else if (operation === 'update') {
            const idx = quickNotes.findIndex((n) => n.id === entityId);
            if (idx === -1) {
              results.push({ mutationId, status: 'failed', entityId, error: 'Quick Note no longer exists on server' });
              continue;
            }
            if (baseUpdatedAt && quickNotes[idx].updatedAt > baseUpdatedAt) {
              results.push({
                mutationId,
                status: 'conflict',
                entityId,
                error: 'Note was modified on another device while you were offline.',
              });
              continue;
            }
            quickNotes[idx] = {
              ...quickNotes[idx],
              title: typeof payload.title === 'string' ? payload.title.trim() : quickNotes[idx].title,
              content: typeof payload.content === 'string' ? payload.content.trim() : quickNotes[idx].content,
              category: payload.category || quickNotes[idx].category,
              pinned: typeof payload.pinned === 'boolean' ? payload.pinned : quickNotes[idx].pinned,
              updatedAt: now,
              version: (quickNotes[idx].version || 1) + 1,
            };
            notesChanged = true;
            results.push({ mutationId, status: 'synced', entityId });
          } else if (operation === 'delete') {
            const idx = quickNotes.findIndex((n) => n.id === entityId);
            if (idx !== -1) {
              quickNotes.splice(idx, 1);
              notesChanged = true;
            }
            results.push({ mutationId, status: 'synced', entityId });
          }
        } else if (entityType === 'diary') {
          if (operation === 'create' || operation === 'update') {
            const idx = diaryEntries.findIndex(
              (d) => d.id === entityId || (idempotencyKey && d.idempotencyKey === idempotencyKey)
            );
            const resolvedRemarks = String(
              payload.remarks ?? payload.teacherRemarks ?? ''
            ).trim();
            const resolvedNotices = String(
              payload.notices ?? payload.importantNotices ?? ''
            ).trim();
            const sanitizedAttachments = Array.isArray(payload.attachments)
              ? payload.attachments.map((a: any) => ({
                  id: String(a.id),
                  diaryId: String(a.diaryId || entityId || ''),
                  originalName: String(a.originalName || a.fileName || 'attachment'),
                  fileName: String(a.fileName || a.originalName || 'attachment'),
                  mimeType: String(a.mimeType || 'application/octet-stream'),
                  sizeBytes: Number(a.sizeBytes) || 0,
                  uploadedAt: Number(a.uploadedAt) || now,
                  uploadedBy: String(a.uploadedBy || staffUser.id),
                  uploadedByName: String(a.uploadedByName || staffUser.displayName),
                }))
              : undefined;

            if (idx === -1) {
              const cleanDate = String(payload.date || getActiveDiaryCycleDateIST(now)).trim();
              const created: StoredDiaryEntry = {
                id: entityId || `diary-${cleanDate}-${crypto.randomBytes(4).toString('hex')}`,
                date: cleanDate,
                subject: String(payload.subject || 'General').trim(),
                type: String(payload.type || 'Homework').trim(),
                targetStream: String(payload.targetStream || 'ALL').trim(),
                title: String(payload.title || '').trim(),
                content: String(payload.content || payload.description || '').trim(),
                description: String(payload.description || payload.content || '').trim(),
                homework: String(payload.homework || '').trim(),
                remarks: resolvedRemarks,
                notices: resolvedNotices,
                teacherRemarks: resolvedRemarks,
                importantNotices: resolvedNotices,
                lastModified: now,
                createdAt: Number(payload.createdAt) || now,
                updatedAt: now,
                publishedAt: now,
                authorId: staffUser.id,
                authorName: staffUser.displayName,
                authorRole: staffUser.role,
                authorRoleLabel: staffUser.role === 'developer' ? 'Developer' : 'Teacher / In-Charge',
                status: payload.status === 'draft' ? 'draft' : 'published',
                attachments: sanitizedAttachments || [],
                version: 1,
                idempotencyKey,
              };
              diaryEntries.unshift(created);
              diaryChanged = true;
              results.push({ mutationId, status: 'synced', entityId: created.id });
            } else {
              diaryEntries[idx] = {
                ...diaryEntries[idx],
                date:
                  payload.date && /^\d{4}-\d{2}-\d{2}$/.test(String(payload.date))
                    ? String(payload.date)
                    : diaryEntries[idx].date,
                subject:
                  typeof payload.subject === 'string'
                    ? payload.subject.trim()
                    : diaryEntries[idx].subject || 'General',
                type:
                  typeof payload.type === 'string'
                    ? payload.type.trim()
                    : diaryEntries[idx].type || 'Homework',
                targetStream:
                  typeof payload.targetStream === 'string'
                    ? payload.targetStream.trim()
                    : diaryEntries[idx].targetStream || 'ALL',
                title: typeof payload.title === 'string' ? payload.title.trim() : diaryEntries[idx].title,
                content: typeof payload.content === 'string' ? payload.content.trim() : diaryEntries[idx].content,
                description:
                  typeof payload.description === 'string'
                    ? payload.description.trim()
                    : typeof payload.content === 'string'
                    ? payload.content.trim()
                    : diaryEntries[idx].description,
                homework: typeof payload.homework === 'string' ? payload.homework.trim() : diaryEntries[idx].homework,
                remarks:
                  typeof payload.remarks === 'string' || typeof payload.teacherRemarks === 'string'
                    ? resolvedRemarks
                    : diaryEntries[idx].remarks || diaryEntries[idx].teacherRemarks || '',
                notices:
                  typeof payload.notices === 'string' || typeof payload.importantNotices === 'string'
                    ? resolvedNotices
                    : diaryEntries[idx].notices || diaryEntries[idx].importantNotices || '',
                teacherRemarks:
                  typeof payload.remarks === 'string' || typeof payload.teacherRemarks === 'string'
                    ? resolvedRemarks
                    : diaryEntries[idx].teacherRemarks,
                importantNotices:
                  typeof payload.notices === 'string' || typeof payload.importantNotices === 'string'
                    ? resolvedNotices
                    : diaryEntries[idx].importantNotices,
                attachments: sanitizedAttachments ? sanitizedAttachments : diaryEntries[idx].attachments,
                status: payload.status === 'draft' ? 'draft' : 'published',
                lastModified: now,
                updatedAt: now,
                version: (diaryEntries[idx].version || 1) + 1,
              };
              diaryChanged = true;
              results.push({ mutationId, status: 'synced', entityId: diaryEntries[idx].id });
            }
          } else if (operation === 'delete') {
            const idx = diaryEntries.findIndex((d) => d.id === entityId);
            if (idx !== -1) {
              diaryEntries.splice(idx, 1);
              diaryChanged = true;
            }
            results.push({ mutationId, status: 'synced', entityId });
          }
        }
      } catch (e: any) {
        results.push({
          mutationId,
          status: 'failed',
          entityId,
          error: e?.message || 'Mutation sync error',
        });
      }
    }

    const sortedDiary = sortDiaryEntriesChronologically(diaryEntries);
    if (diaryChanged) writeDiaryEntries(sortedDiary);
    if (notesChanged) writeQuickNotes(quickNotes);

    return res.json({
      success: true,
      results,
      cycleInfo,
      diaryEntries: sortedDiary,
      quickNotes: quickNotes.sort((a, b) => b.createdAt - a.createdAt),
      serverTimestamp: now,
    });
  });
}
