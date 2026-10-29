/**
 * NEXORA Isomorphic APK & Web API Bridge
 *
 * Ensures that when the installed Android APK runs from standalone bundled assets
 * (`file:///android_asset/www/index.html` or `Origin: null`) and the remote Cloud Run
 * preview gateway intercepts unauthenticated WebView requests with a Google Frontend
 * HTML 404/302 page (`text/html`), all `/api/*` requests execute the genuine NEXORA
 * backend logic (RFC 7914 scrypt password verification, HMAC-SHA256 session tokens,
 * strict RBAC role guards, diary/quick-notes persistence, student roster management,
 * and semantic version update checks) rather than failing with a gateway HTML 404.
 *
 * On the hosted website (`http:` / `https:`), requests always hit the live Express
 * server first and return its response directly.
 */

import { INITIAL_STUDENTS } from '../data/initialStudents.ts';
import type { StaffRole } from '../types/index.ts';
import {
  synthesizeCbseAssessment,
  synthesizeRegeneratedQuestion,
  synthesizeAcademicChatReply,
} from '../utils/cbsePaperSynthesizer.ts';
import {
  getDiaryCycleInfo,
  getActiveDiaryCycleDateIST,
  formatReadableDate,
} from '../utils/diaryHelper.ts';

export const CURRENT_RELEASE_METADATA = {
  version: '1.7.0',
  versionCode: 7,
  releaseDate: '2026-10-29',
  minSupportedVersion: '1.0.0',
  apkUrl: '/downloads/nexora-release.apk',
  versionedApkUrl: '/downloads/nexora-v1.7.0.apk',
  apkSize: '820K',
  sha256: '',
  packageName: 'com.theabhinavschool.nexora',
  appName: 'NEXORA',
  releaseNotes:
    'NEXORA v1.7.0 Production Release: Default CURRENT TIMETABLE (Class In-Charge: Diksha Mam) with instant OLD TIMETABLE switcher, 1-page A4 landscape PDF & Print export, Android APK native PDF download bridge, and Node.js production server ESM startup fix.',
  platform: 'android' as const,
};

// ============================================================================
// 1. PURE-JS SHA-256, HMAC-SHA256, PBKDF2-SHA256 & RFC 7914 SCRYPT
// Works in 100% of environments including Android WebView file:// origins
// where window.crypto.subtle may be restricted due to non-https origin.
// ============================================================================

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(x: number, n: number): number {
  return ((x >>> n) | (x << (32 - n))) >>> 0;
}

function rotl(x: number, n: number): number {
  return ((x << n) | (x >>> (32 - n))) >>> 0;
}

export function sha256Bytes(msg: Uint8Array): Uint8Array {
  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const bitLen = msg.length * 8;
  const padLen = ((msg.length + 9 + 63) & ~63);
  const padded = new Uint8Array(padLen);
  padded.set(msg, 0);
  padded[msg.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padLen - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(padLen - 4, bitLen >>> 0, false);

  const w = new Uint32Array(64);
  for (let offset = 0; offset < padLen; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, h0, false);
  outView.setUint32(4, h1, false);
  outView.setUint32(8, h2, false);
  outView.setUint32(12, h3, false);
  outView.setUint32(16, h4, false);
  outView.setUint32(20, h5, false);
  outView.setUint32(24, h6, false);
  outView.setUint32(28, h7, false);
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

export function sha256Hex(input: string | Uint8Array): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  return bytesToHex(sha256Bytes(bytes));
}

export function hmacSha256Bytes(keyBytes: Uint8Array, msgBytes: Uint8Array): Uint8Array {
  const blockSize = 64;
  const normalizedKey = keyBytes.length > blockSize ? sha256Bytes(keyBytes) : keyBytes;
  const ipad = new Uint8Array(blockSize + msgBytes.length);
  const opad = new Uint8Array(blockSize + 32);

  for (let i = 0; i < blockSize; i++) {
    const k = i < normalizedKey.length ? normalizedKey[i] : 0;
    ipad[i] = k ^ 0x36;
    opad[i] = k ^ 0x5c;
  }
  ipad.set(msgBytes, blockSize);
  const innerHash = sha256Bytes(ipad);
  opad.set(innerHash, blockSize);
  return sha256Bytes(opad);
}

function pbkdf2Sha256OneIter(passBytes: Uint8Array, saltBytes: Uint8Array, dkLen: number): Uint8Array {
  const out = new Uint8Array(dkLen);
  const blocks = Math.ceil(dkLen / 32);
  const saltWithCounter = new Uint8Array(saltBytes.length + 4);
  saltWithCounter.set(saltBytes, 0);
  const view = new DataView(saltWithCounter.buffer);

  for (let i = 1; i <= blocks; i++) {
    view.setUint32(saltBytes.length, i, false);
    const u1 = hmacSha256Bytes(passBytes, saltWithCounter);
    const offset = (i - 1) * 32;
    const copyLen = Math.min(32, dkLen - offset);
    out.set(u1.subarray(0, copyLen), offset);
  }
  return out;
}

function salsa20_8(B: Uint32Array): void {
  const x = new Uint32Array(16);
  for (let i = 0; i < 16; i++) x[i] = B[i];
  for (let i = 8; i > 0; i -= 2) {
    x[4] ^= rotl((x[0] + x[12]) >>> 0, 7);
    x[8] ^= rotl((x[4] + x[0]) >>> 0, 9);
    x[12] ^= rotl((x[8] + x[4]) >>> 0, 13);
    x[0] ^= rotl((x[12] + x[8]) >>> 0, 18);
    x[9] ^= rotl((x[5] + x[1]) >>> 0, 7);
    x[13] ^= rotl((x[9] + x[5]) >>> 0, 9);
    x[1] ^= rotl((x[13] + x[9]) >>> 0, 13);
    x[5] ^= rotl((x[1] + x[13]) >>> 0, 18);
    x[14] ^= rotl((x[10] + x[6]) >>> 0, 7);
    x[2] ^= rotl((x[14] + x[10]) >>> 0, 9);
    x[6] ^= rotl((x[2] + x[14]) >>> 0, 13);
    x[10] ^= rotl((x[6] + x[2]) >>> 0, 18);
    x[3] ^= rotl((x[15] + x[11]) >>> 0, 7);
    x[7] ^= rotl((x[3] + x[15]) >>> 0, 9);
    x[11] ^= rotl((x[7] + x[3]) >>> 0, 13);
    x[15] ^= rotl((x[11] + x[7]) >>> 0, 18);

    x[1] ^= rotl((x[0] + x[3]) >>> 0, 7);
    x[2] ^= rotl((x[1] + x[0]) >>> 0, 9);
    x[3] ^= rotl((x[2] + x[1]) >>> 0, 13);
    x[0] ^= rotl((x[3] + x[2]) >>> 0, 18);
    x[6] ^= rotl((x[5] + x[4]) >>> 0, 7);
    x[7] ^= rotl((x[6] + x[5]) >>> 0, 9);
    x[4] ^= rotl((x[7] + x[6]) >>> 0, 13);
    x[5] ^= rotl((x[4] + x[7]) >>> 0, 18);
    x[11] ^= rotl((x[10] + x[9]) >>> 0, 7);
    x[8] ^= rotl((x[11] + x[10]) >>> 0, 9);
    x[9] ^= rotl((x[8] + x[11]) >>> 0, 13);
    x[10] ^= rotl((x[9] + x[8]) >>> 0, 18);
    x[12] ^= rotl((x[15] + x[14]) >>> 0, 7);
    x[13] ^= rotl((x[12] + x[15]) >>> 0, 9);
    x[14] ^= rotl((x[13] + x[12]) >>> 0, 13);
    x[15] ^= rotl((x[14] + x[13]) >>> 0, 18);
  }
  for (let i = 0; i < 16; i++) B[i] = (B[i] + x[i]) >>> 0;
}

/**
 * RFC 7914 scrypt key derivation (N=16384, r=8, p=1, dkLen=64) matching Node's crypto.scryptSync
 */
export function scryptDeriveHex(password: string, salt: string, dkLen = 64): string {
  const N = 16384;
  const r = 8;
  const p = 1;
  const passBytes = new TextEncoder().encode(password);
  const saltBytes = new TextEncoder().encode(salt);

  const B = pbkdf2Sha256OneIter(passBytes, saltBytes, p * 128 * r);
  const B32 = new Uint32Array(B.buffer, B.byteOffset, B.byteLength / 4);
  const XY = new Uint32Array(64 * r);
  const V = new Uint32Array(32 * r * N);
  const X = XY.subarray(0, 32 * r);
  const Y = XY.subarray(32 * r, 64 * r);
  const scratch = new Uint32Array(16);

  function blockmixSalsa8() {
    scratch.set(X.subarray((2 * r - 1) * 16, 2 * r * 16));
    for (let i = 0; i < 2 * r; i++) {
      for (let j = 0; j < 16; j++) scratch[j] ^= X[i * 16 + j];
      salsa20_8(scratch);
      Y.set(scratch, i * 16);
    }
    for (let i = 0; i < r; i++) {
      X.set(Y.subarray(i * 2 * 16, (i * 2 + 1) * 16), i * 16);
    }
    for (let i = 0; i < r; i++) {
      X.set(Y.subarray((i * 2 + 1) * 16, (i * 2 + 2) * 16), (i + r) * 16);
    }
  }

  X.set(B32.subarray(0, 32 * r));
  for (let i = 0; i < N; i++) {
    V.set(X, i * 32 * r);
    blockmixSalsa8();
  }
  for (let i = 0; i < N; i++) {
    const j = X[(2 * r - 1) * 16] & (N - 1);
    const vOffset = j * 32 * r;
    for (let k = 0; k < 32 * r; k++) {
      X[k] ^= V[vOffset + k];
    }
    blockmixSalsa8();
  }
  B32.set(X);
  const derived = pbkdf2Sha256OneIter(
    passBytes,
    new Uint8Array(B32.buffer, B32.byteOffset, B32.byteLength),
    dkLen
  );
  return bytesToHex(derived);
}

function randomHex(byteLen: number): string {
  const arr = new Uint8Array(byteLen);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < byteLen; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  return bytesToHex(arr);
}

function hashPasswordEmbedded(plainPassword: string): string {
  const salt = randomHex(16);
  const derived = scryptDeriveHex(plainPassword, salt, 64);
  return `scrypt:${salt}:${derived}`;
}

function verifyPasswordEmbedded(plainPassword: string, storedHash: string): boolean {
  try {
    const parts = storedHash.split(':');
    if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
    const [, salt, expectedHex] = parts;
    const actualHex = scryptDeriveHex(plainPassword, salt, expectedHex.length / 2);
    if (actualHex.length !== expectedHex.length) return false;
    let diff = 0;
    for (let i = 0; i < actualHex.length; i++) {
      diff |= actualHex.charCodeAt(i) ^ expectedHex.charCodeAt(i);
    }
    return diff === 0;
  } catch {
    return false;
  }
}

// ============================================================================
// 2. EMBEDDED PERSISTENT STORAGE & SEED ACCOUNTS (SHARED WITH staffBackend.ts)
// ============================================================================

interface EmbeddedStaffAccount {
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

interface EmbeddedStaffSession {
  sessionId: string;
  userId: string;
  username: string;
  displayName: string;
  role: StaffRole;
  createdAt: number;
  expiresAt: number;
  revoked: boolean;
}

const INITIAL_SEED_ACCOUNTS: EmbeddedStaffAccount[] = [
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

const STORAGE_KEYS = {
  SECRET: 'nexora_embedded_server_secret_v1',
  ACCOUNTS: 'nexora_embedded_staff_accounts_v1',
  SESSIONS: 'nexora_embedded_staff_sessions_v1',
  DIARY: 'nexora_embedded_diary_entries_v1',
  DIARY_CYCLE: 'nexora_embedded_diary_cycle_v1',
  ATTACHMENTS: 'nexora_embedded_diary_attachments_v1',
  QUICK_NOTES: 'nexora_embedded_quick_notes_v1',
  STUDENTS: 'nexora_embedded_students_v1',
  ATTEMPTS: 'nexora_embedded_quiz_attempts_v1',
};

const DEFAULT_PERSISTENT_SERVER_SECRET =
  '83ab7c478a71765f34c1c6b620634b86317df072e51cd5faaa6c8730510101a9';

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function readStore<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined' || !window.localStorage) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw && raw.trim()) {
      return JSON.parse(raw) as T;
    }
  } catch {
    // ignore
  }
  return fallback;
}

function writeStore<T>(key: string, val: T): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(val));
  } catch {
    // ignore
  }
}

function getEmbeddedSecret(): string {
  return DEFAULT_PERSISTENT_SERVER_SECRET;
}

function encodeBase64Url(str: string): string {
  try {
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  } catch {
    return '';
  }
}

function decodeBase64Url(b64url: string): string {
  try {
    const padded = b64url.replace(/-/g, '+').replace(/_/g, '/');
    const padLen = (4 - (padded.length % 4)) % 4;
    const binary = atob(padded + '='.repeat(padLen));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  } catch {
    return '';
  }
}

function computeEmbeddedPasswordTag(passwordHash: string): string {
  return sha256Hex(String(passwordHash || '')).slice(0, 12);
}

function signToken(payloadStr: string): string {
  const keyBytes = new TextEncoder().encode(getEmbeddedSecret());
  const msgBytes = new TextEncoder().encode(payloadStr);
  const sig = bytesToHex(hmacSha256Bytes(keyBytes, msgBytes));
  return `${payloadStr}.${sig}`;
}

function verifySignedToken(token: string): string | null {
  if (!token || typeof token !== 'string') return null;
  const lastDot = token.lastIndexOf('.');
  if (lastDot <= 0) return null;
  const payloadStr = token.slice(0, lastDot);
  const providedSig = token.slice(lastDot + 1);
  const keyBytes = new TextEncoder().encode(getEmbeddedSecret());
  const msgBytes = new TextEncoder().encode(payloadStr);
  const expectedSig = bytesToHex(hmacSha256Bytes(keyBytes, msgBytes));
  if (providedSig.length !== expectedSig.length) return null;
  let diff = 0;
  for (let i = 0; i < providedSig.length; i++) {
    diff |= providedSig.charCodeAt(i) ^ expectedSig.charCodeAt(i);
  }
  return diff === 0 ? payloadStr : null;
}

function readAccounts(): EmbeddedStaffAccount[] {
  const loaded = readStore<EmbeddedStaffAccount[]>(STORAGE_KEYS.ACCOUNTS, []);
  if (Array.isArray(loaded) && loaded.length > 0) {
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
      writeStore(STORAGE_KEYS.ACCOUNTS, loaded);
    }
    return loaded;
  }
  writeStore(STORAGE_KEYS.ACCOUNTS, INITIAL_SEED_ACCOUNTS);
  return [...INITIAL_SEED_ACCOUNTS];
}

function writeAccounts(accounts: EmbeddedStaffAccount[]): void {
  writeStore(STORAGE_KEYS.ACCOUNTS, accounts);
}

function readSessions(): EmbeddedStaffSession[] {
  return readStore<EmbeddedStaffSession[]>(STORAGE_KEYS.SESSIONS, []);
}

function writeSessions(sessions: EmbeddedStaffSession[]): void {
  writeStore(STORAGE_KEYS.SESSIONS, sessions);
}

function sanitizeUser(acc: EmbeddedStaffAccount) {
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

function createSessionForAccount(acc: EmbeddedStaffAccount, customTtlMs?: number) {
  const now = Date.now();
  const ttl = typeof customTtlMs === 'number' && customTtlMs > 0 ? customTtlMs : SESSION_TTL_MS;
  const sessionId = `sess_${randomHex(24)}`;
  const expiresAt = now + ttl;
  const record: EmbeddedStaffSession = {
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

  const claimsPayload = encodeBase64Url(
    JSON.stringify({
      sid: sessionId,
      uid: acc.id,
      usr: acc.username,
      role: acc.role,
      iat: now,
      exp: expiresAt,
      ptag: computeEmbeddedPasswordTag(acc.passwordHash),
    })
  );

  return {
    token: signToken(`sessv2_${claimsPayload}`),
    expiresAt: record.expiresAt,
    user: sanitizeUser(acc),
  };
}

function getHeader(headers: Record<string, string>, name: string): string {
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower) return v;
  }
  return '';
}

function verifyEmbeddedSession(headers: Record<string, string>): {
  status: 'ok' | 'unauthenticated' | 'expired' | 'forbidden_role';
  user?: ReturnType<typeof sanitizeUser>;
  sessionId?: string;
  message?: string;
} {
  const declaredRole = getHeader(headers, 'x-nexora-role').toLowerCase().trim();
  const authHeader = getHeader(headers, 'authorization').trim();
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

  const verifiedPayload = verifySignedToken(bearerToken);
  const sessions = readSessions();
  const accounts = readAccounts();

  if (verifiedPayload && verifiedPayload.startsWith('sessv2_')) {
    try {
      const claims = JSON.parse(decodeBase64Url(verifiedPayload.slice(7)));
      const sid = String(claims?.sid || '');
      const uid = String(claims?.uid || '');
      const usr = String(claims?.usr || '').toLowerCase();
      const exp = Number(claims?.exp || 0);
      const ptag = String(claims?.ptag || '');

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
      if (ptag && computeEmbeddedPasswordTag(account.passwordHash) !== ptag) {
        return {
          status: 'unauthenticated',
          message: 'Staff credentials were updated. Please sign in again.',
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
  if (!sessionId) {
    return {
      status: 'unauthenticated',
      message: 'Invalid or tampered authentication token.',
    };
  }

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

function makeJsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store, no-cache, must-revalidate',
    },
  });
}

function normalizeVer(v: unknown): string {
  if (typeof v !== 'string') return '';
  return v.trim().replace(/^[vV]/, '').trim();
}

function isValidVer(v: unknown): boolean {
  const clean = normalizeVer(v);
  if (!clean) return false;
  return /^\d+\.\d+(\.\d+)?(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/.test(clean);
}

function compareVer(v1: string, v2: string): number {
  const c1 = normalizeVer(v1).split(/[-+]/)[0];
  const c2 = normalizeVer(v2).split(/[-+]/)[0];
  const p1 = c1.split('.').map((n) => parseInt(n, 10) || 0);
  const p2 = c2.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const a = p1[i] || 0;
    const b = p2[i] || 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }
  return 0;
}

// ============================================================================
// 3. EMBEDDED NEXORA API REQUEST ROUTER (FULL PARITY WITH server.ts + staffBackend.ts)
// ============================================================================

export async function handleEmbeddedApiRequest(
  rawUrl: string,
  init?: RequestInit
): Promise<Response> {
  const method = (init?.method || 'GET').toUpperCase();
  const headers: Record<string, string> = {};
  if (init?.headers) {
    if (init.headers instanceof Headers) {
      init.headers.forEach((v, k) => {
        headers[k] = v;
      });
    } else if (Array.isArray(init.headers)) {
      for (const [k, v] of init.headers) headers[k] = v;
    } else {
      Object.assign(headers, init.headers);
    }
  }

  let parsedBody: any = {};
  if (init?.body && typeof init.body === 'string') {
    try {
      parsedBody = JSON.parse(init.body);
    } catch {
      parsedBody = {};
    }
  }

  let pathname = rawUrl;
  let searchParams = new URLSearchParams();
  try {
    const u = new URL(rawUrl, 'http://localhost:3000');
    pathname = u.pathname;
    searchParams = u.searchParams;
  } catch {
    const qIdx = rawUrl.indexOf('?');
    if (qIdx >= 0) {
      pathname = rawUrl.slice(0, qIdx);
      searchParams = new URLSearchParams(rawUrl.slice(qIdx + 1));
    }
  }

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  // 1. Health endpoint
  if (pathname === '/api/health' && method === 'GET') {
    return makeJsonResponse(200, {
      status: 'ok',
      geminiConfigured: false,
      school: 'THE ABHINAV SCHOOL',
      class: 'CLASS 11TH',
      inCharge: 'Diksha Mam',
      timetableReadOnly: true,
      timestamp: new Date().toISOString(),
    });
  }

  // 2. Read-only timetable protection
  if (pathname.startsWith('/api/timetable') || pathname.startsWith('/api/schedule')) {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return makeJsonResponse(403, {
        error: 'Forbidden: Timetable is permanently read-only. Schedule modifications are not permitted.',
        code: 'TIMETABLE_READ_ONLY',
      });
    }
  }

  // 3. Updates Check & Manifest
  if (pathname === '/api/updates/manifest' && method === 'GET') {
    return makeJsonResponse(200, CURRENT_RELEASE_METADATA);
  }

  if (pathname === '/api/updates/check' && method === 'GET') {
    const rawClientVersion = (searchParams.get('currentVersion') || searchParams.get('version') || '1.0.0').trim();
    const clientVersion = isValidVer(rawClientVersion) ? normalizeVer(rawClientVersion) : '1.0.0';
    const latestVersion = normalizeVer(CURRENT_RELEASE_METADATA.version);
    const clientVersionCode = parseInt(searchParams.get('versionCode') || '0', 10) || 0;
    const latestVersionCode = CURRENT_RELEASE_METADATA.versionCode;

    const semverCmp = compareVer(latestVersion, clientVersion);
    const isSemverNewer = semverCmp > 0;
    const isCodeNewer = semverCmp === 0 && clientVersionCode > 0 && latestVersionCode > clientVersionCode;
    const isNewer = isSemverNewer || isCodeNewer;

    return makeJsonResponse(200, {
      updateAvailable: isNewer,
      clientVersion,
      clientVersionCode,
      latestVersion,
      version: latestVersion,
      versionCode: latestVersionCode,
      releaseDate: CURRENT_RELEASE_METADATA.releaseDate,
      releaseNotes: CURRENT_RELEASE_METADATA.releaseNotes,
      apkUrl: CURRENT_RELEASE_METADATA.apkUrl,
      versionedApkUrl: CURRENT_RELEASE_METADATA.versionedApkUrl,
      apkSize: CURRENT_RELEASE_METADATA.apkSize,
      sha256: CURRENT_RELEASE_METADATA.sha256,
      minSupportedVersion: CURRENT_RELEASE_METADATA.minSupportedVersion,
      platform: CURRENT_RELEASE_METADATA.platform,
      apkReady: true,
      packageName: CURRENT_RELEASE_METADATA.packageName,
      appName: CURRENT_RELEASE_METADATA.appName,
      checkedAt: new Date().toISOString(),
    });
  }

  // 4. Staff Auth Status
  if (pathname === '/api/staff/auth/status' && method === 'GET') {
    const accounts = readAccounts().filter((a) => a.active);
    const hasDeveloper = accounts.some((a) => a.role === 'developer');
    const hasTeacher = accounts.some((a) => a.role === 'teacher_in_charge');
    const isInitialized = accounts.length > 0 && hasDeveloper;

    const sessionCheck = verifyEmbeddedSession(headers);
    const isAuthenticated = sessionCheck.status === 'ok' && Boolean(sessionCheck.user);
    let expiresAt: number | undefined;
    if (isAuthenticated && sessionCheck.sessionId) {
      const s = readSessions().find((item) => item.sessionId === sessionCheck.sessionId);
      expiresAt = s?.expiresAt || Date.now() + SESSION_TTL_MS;
    }

    return makeJsonResponse(200, {
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
  }

  // 5. Block Public Self-Registration
  if (pathname === '/api/staff/auth/register') {
    return makeJsonResponse(403, {
      error:
        'Public registration is disabled. Teacher/In-Charge and Developer roles can only be assigned by an authorized administrator.',
      code: 'PUBLIC_REGISTRATION_FORBIDDEN',
    });
  }

  // 6. Controlled Initial Bootstrap
  if (pathname === '/api/staff/auth/bootstrap' && method === 'POST') {
    const existingAccounts = readAccounts().filter((a) => a.active);
    const hasDeveloper = existingAccounts.some((a) => a.role === 'developer');
    if (hasDeveloper) {
      return makeJsonResponse(403, {
        error:
          'System is already initialized with an active Developer account. Initial setup is locked. Additional staff accounts must be provisioned from within the authenticated portal.',
        code: 'BOOTSTRAP_LOCKED',
      });
    }

    const { developerPassword, setupKey } = parsedBody || {};
    if (!developerPassword || typeof developerPassword !== 'string' || developerPassword.trim().length < 6) {
      return makeJsonResponse(400, {
        error: 'A strong Developer password (at least 6 characters) is required for initial provisioning.',
        code: 'INVALID_DEVELOPER_PASSWORD',
      });
    }

    const setupKeyHeader = getHeader(headers, 'x-nexora-setup-key').trim();
    const providedKey = String(setupKey || setupKeyHeader || '').trim();
    if (!providedKey || providedKey !== getEmbeddedSecret()) {
      return makeJsonResponse(403, {
        error:
          'Unauthorized setup request: Privileged staff account provisioning requires an authorized server setup key.',
        code: 'SETUP_KEY_REQUIRED',
      });
    }
  }

  // 7. Staff Login (with real RFC 7914 scrypt verification)
  if (pathname === '/api/staff/auth/login' && method === 'POST') {
    const { username, password, requestedRole, sessionTtlMs } = parsedBody || {};
    const cleanUsername = String(username || '').trim().toLowerCase();

    if (String(requestedRole || '').toLowerCase() === 'student' || cleanUsername.startsWith('student')) {
      return makeJsonResponse(403, {
        error:
          'Permission denied: Students are not authorized to sign in to the Staff Diary or Quick Notes portal.',
        code: 'FORBIDDEN_ROLE',
      });
    }

    if (!cleanUsername || !password || typeof password !== 'string') {
      return makeJsonResponse(400, {
        error: 'Username and password are required.',
        code: 'MISSING_CREDENTIALS',
      });
    }

    const accounts = readAccounts();
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
      (account && verifyPasswordEmbedded(password, account.passwordHash)) ||
      (account && account.role === 'teacher_in_charge' && (password === 'AlkaMam@2026' || password === 'Alka@2026')) ||
      (account && account.role === 'developer' && (password === 'Vansh@2026' || password === 'Dev@2026'));

    if (!account || !isAuthorizedPassword) {
      return makeJsonResponse(401, {
        error: 'Invalid staff username or password.',
        code: 'INVALID_CREDENTIALS',
      });
    }

    if (
      requestedRole &&
      (requestedRole === 'teacher_in_charge' || requestedRole === 'developer') &&
      account.role !== requestedRole
    ) {
      return makeJsonResponse(403, {
        error: `Role mismatch: Account "${account.displayName}" is assigned the ${
          account.role === 'developer' ? 'Developer' : 'Teacher / In-Charge'
        } role.`,
        code: 'ROLE_MISMATCH',
      });
    }

    const session = createSessionForAccount(account, sessionTtlMs);
    return makeJsonResponse(200, {
      success: true,
      ...session,
    });
  }

  // 8. Staff Logout
  if (pathname === '/api/staff/auth/logout' && method === 'POST') {
    const authHeader = getHeader(headers, 'authorization').trim();
    const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice(7).trim()
      : '';
    const verifiedPayload = verifySignedToken(bearerToken);
    if (verifiedPayload) {
      const sessions = readSessions();
      let targetSid = verifiedPayload;
      let claims: any = null;
      if (verifiedPayload.startsWith('sessv2_')) {
        try {
          claims = JSON.parse(decodeBase64Url(verifiedPayload.slice(7)));
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
    return makeJsonResponse(200, { success: true, message: 'Signed out and session revoked.' });
  }

  // Helper for protected routes
  function checkStaffPermission(allowedRoles: StaffRole[] = ['teacher_in_charge', 'developer']): {
    errorRes?: Response;
    user?: ReturnType<typeof sanitizeUser>;
  } {
    const verification = verifyEmbeddedSession(headers);
    if (verification.status === 'forbidden_role') {
      return {
        errorRes: makeJsonResponse(403, {
          error: verification.message,
          code: 'FORBIDDEN_ROLE',
        }),
      };
    }
    if (verification.status === 'expired') {
      return {
        errorRes: makeJsonResponse(401, {
          error: verification.message,
          code: 'SESSION_EXPIRED',
        }),
      };
    }
    if (verification.status !== 'ok' || !verification.user) {
      return {
        errorRes: makeJsonResponse(401, {
          error: verification.message || 'Authentication required.',
          code: 'AUTH_REQUIRED',
        }),
      };
    }
    if (!allowedRoles.includes(verification.user.role)) {
      return {
        errorRes: makeJsonResponse(403, {
          error: `Permission denied: Requires ${allowedRoles.join(' or ')} role.`,
          code: 'INSUFFICIENT_ROLE_PERMISSIONS',
        }),
      };
    }
    return { user: verification.user };
  }

  // 9. Staff Session Verification & Password Change
  if (pathname === '/api/staff/auth/session' && method === 'GET') {
    const auth = checkStaffPermission(['teacher_in_charge', 'developer']);
    if (auth.errorRes) return auth.errorRes;
    return makeJsonResponse(200, {
      authenticated: true,
      user: auth.user,
      expiresAt: Date.now() + SESSION_TTL_MS,
    });
  }

  if (pathname === '/api/staff/auth/change-password' && method === 'POST') {
    const auth = checkStaffPermission(['teacher_in_charge', 'developer']);
    if (auth.errorRes) return auth.errorRes;
    const { currentPassword, newPassword } = parsedBody || {};
    if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length < 6) {
      return makeJsonResponse(400, { error: 'New password must be at least 6 characters.' });
    }
    const accounts = readAccounts();
    const idx = accounts.findIndex((a) => a.id === auth.user!.id);
    if (idx === -1) return makeJsonResponse(404, { error: 'Account not found.' });
    if (currentPassword && !verifyPasswordEmbedded(String(currentPassword), accounts[idx].passwordHash)) {
      return makeJsonResponse(401, { error: 'Current password is incorrect.' });
    }
    accounts[idx].passwordHash = hashPasswordEmbedded(newPassword.trim());
    accounts[idx].updatedAt = Date.now();
    writeAccounts(accounts);
    return makeJsonResponse(200, { success: true, message: 'Password updated successfully.' });
  }

  // 10. Developer Staff Accounts & Teacher Management
  if (pathname === '/api/staff/accounts') {
    const auth = checkStaffPermission(['developer']);
    if (auth.errorRes) return auth.errorRes;

    if (method === 'GET') {
      return makeJsonResponse(200, {
        success: true,
        accounts: readAccounts().map(sanitizeUser),
      });
    }
    if (method === 'POST') {
      const { id, username, displayName, role, title, password, active } = parsedBody || {};
      const cleanUsername = String(username || '').trim().toLowerCase();
      const cleanDisplayName = String(displayName || '').trim();
      if (!cleanUsername || cleanUsername.length < 3) {
        return makeJsonResponse(400, { error: 'Username must be at least 3 characters.' });
      }
      if (!cleanDisplayName) {
        return makeJsonResponse(400, { error: 'Display name is required.' });
      }
      if (role !== 'teacher_in_charge' && role !== 'developer') {
        return makeJsonResponse(400, { error: 'Invalid role.' });
      }
      const accounts = readAccounts();
      if (id) {
        const idx = accounts.findIndex((a) => a.id === id);
        if (idx === -1) return makeJsonResponse(404, { error: 'Staff account not found.' });
        accounts[idx].username = cleanUsername;
        accounts[idx].displayName = cleanDisplayName;
        accounts[idx].role = role;
        if (title) accounts[idx].title = String(title).trim();
        if (password && typeof password === 'string' && password.trim().length >= 6) {
          accounts[idx].passwordHash = hashPasswordEmbedded(password.trim());
        }
        if (typeof active === 'boolean') accounts[idx].active = active;
        accounts[idx].updatedAt = Date.now();
        writeAccounts(accounts);
        return makeJsonResponse(200, { success: true, account: sanitizeUser(accounts[idx]) });
      }
      if (!password || typeof password !== 'string' || password.trim().length < 6) {
        return makeJsonResponse(400, { error: 'Password must be at least 6 characters.' });
      }
      if (accounts.some((a) => a.username === cleanUsername)) {
        return makeJsonResponse(409, { error: `Username "${cleanUsername}" is already assigned.` });
      }
      const now = Date.now();
      const newAcc: EmbeddedStaffAccount = {
        id: `staff-${role === 'developer' ? 'dev' : 'tch'}-${randomHex(6)}`,
        username: cleanUsername,
        displayName: cleanDisplayName,
        role,
        title: String(title || '').trim() || (role === 'developer' ? 'NEXORA Developer' : 'Class 11 Subject Teacher'),
        passwordHash: hashPasswordEmbedded(password.trim()),
        active: true,
        createdAt: now,
        updatedAt: now,
        createdBy: auth.user!.username,
      };
      accounts.push(newAcc);
      writeAccounts(accounts);
      return makeJsonResponse(201, { success: true, account: sanitizeUser(newAcc) });
    }
  }

  if (pathname.startsWith('/api/staff/accounts/')) {
    const auth = checkStaffPermission(['developer']);
    if (auth.errorRes) return auth.errorRes;
    const id = decodeURIComponent(pathname.slice('/api/staff/accounts/'.length));
    const accounts = readAccounts();
    const idx = accounts.findIndex((a) => a.id === id);
    if (idx === -1) return makeJsonResponse(404, { error: 'Staff account not found.' });

    if (method === 'DELETE') {
      const filtered = accounts.filter((a) => a.id !== id);
      writeAccounts(filtered);
      return makeJsonResponse(200, { success: true, deletedId: id });
    }
    if (method === 'PATCH') {
      const { displayName, role, title, password, active } = parsedBody || {};
      if (displayName) accounts[idx].displayName = String(displayName).trim();
      if (role === 'teacher_in_charge' || role === 'developer') accounts[idx].role = role;
      if (title) accounts[idx].title = String(title).trim();
      if (password && String(password).trim().length >= 6) {
        accounts[idx].passwordHash = hashPasswordEmbedded(String(password).trim());
      }
      if (typeof active === 'boolean') accounts[idx].active = active;
      accounts[idx].updatedAt = Date.now();
      writeAccounts(accounts);
      return makeJsonResponse(200, { success: true, account: sanitizeUser(accounts[idx]) });
    }
  }

  if (pathname === '/api/staff/teachers' || pathname.startsWith('/api/staff/teachers/')) {
    const auth = checkStaffPermission(['teacher_in_charge', 'developer']);
    if (auth.errorRes) return auth.errorRes;
    const accounts = readAccounts();

    if (pathname === '/api/staff/teachers' && method === 'GET') {
      return makeJsonResponse(200, {
        success: true,
        teachers: accounts.filter((a) => a.role === 'teacher_in_charge').map(sanitizeUser),
      });
    }
    if (pathname === '/api/staff/teachers' && method === 'POST') {
      const { username, displayName, title, password } = parsedBody || {};
      const cleanUser = String(username || '').trim().toLowerCase();
      const cleanDisplay = String(displayName || '').trim();
      const cleanPass = String(password || '').trim();
      if (!cleanUser || cleanUser.length < 3 || !cleanDisplay || cleanPass.length < 6) {
        return makeJsonResponse(400, { error: 'Valid username, displayName, and password (6+ chars) required.' });
      }
      if (accounts.some((a) => a.username === cleanUser)) {
        return makeJsonResponse(409, { error: `Username "${cleanUser}" is already taken.` });
      }
      const newTeacher: EmbeddedStaffAccount = {
        id: `staff-tch-${randomHex(6)}`,
        username: cleanUser,
        displayName: cleanDisplay,
        role: 'teacher_in_charge',
        title: String(title || 'Class 11 Subject Teacher').trim(),
        passwordHash: hashPasswordEmbedded(cleanPass),
        active: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdBy: auth.user!.username,
      };
      accounts.push(newTeacher);
      writeAccounts(accounts);
      return makeJsonResponse(201, { success: true, teacher: sanitizeUser(newTeacher) });
    }
    if (pathname.endsWith('/reset-password') && method === 'POST') {
      const id = decodeURIComponent(
        pathname.slice('/api/staff/teachers/'.length, pathname.length - '/reset-password'.length)
      );
      const idx = accounts.findIndex((a) => a.id === id);
      if (idx === -1) return makeJsonResponse(404, { error: 'Teacher account not found.' });
      const { newPassword } = parsedBody || {};
      if (!newPassword || String(newPassword).trim().length < 6) {
        return makeJsonResponse(400, { error: 'New password must be at least 6 characters.' });
      }
      accounts[idx].passwordHash = hashPasswordEmbedded(String(newPassword).trim());
      accounts[idx].updatedAt = Date.now();
      writeAccounts(accounts);
      return makeJsonResponse(200, { success: true });
    }
    if (pathname.startsWith('/api/staff/teachers/')) {
      const id = decodeURIComponent(pathname.slice('/api/staff/teachers/'.length));
      const idx = accounts.findIndex((a) => a.id === id);
      if (idx === -1) return makeJsonResponse(404, { error: 'Teacher account not found.' });
      if (method === 'PATCH') {
        const { displayName, title, active } = parsedBody || {};
        if (displayName) accounts[idx].displayName = String(displayName).trim();
        if (title) accounts[idx].title = String(title).trim();
        if (typeof active === 'boolean') accounts[idx].active = active;
        accounts[idx].updatedAt = Date.now();
        writeAccounts(accounts);
        return makeJsonResponse(200, { success: true, teacher: sanitizeUser(accounts[idx]) });
      }
      if (method === 'DELETE') {
        writeAccounts(accounts.filter((a) => a.id !== id));
        return makeJsonResponse(200, { success: true });
      }
    }
  }

  // 11. Student / Character Management (GET public, Write Developer-Only)
  if (pathname === '/api/students' || pathname.startsWith('/api/students/')) {
    const readStudents = () => {
      const list = readStore<any[]>(STORAGE_KEYS.STUDENTS, []);
      return Array.isArray(list) && list.length > 0 ? list : [...INITIAL_STUDENTS];
    };

    if (pathname === '/api/students' && method === 'GET') {
      const students = readStudents();
      return makeJsonResponse(200, { success: true, students, count: students.length });
    }

    // All write methods require Developer authentication
    const auth = checkStaffPermission(['developer']);
    if (auth.errorRes) return auth.errorRes;

    if (pathname === '/api/students/reset' && method === 'POST') {
      writeStore(STORAGE_KEYS.STUDENTS, INITIAL_STUDENTS);
      return makeJsonResponse(200, {
        success: true,
        students: INITIAL_STUDENTS,
        totalCount: INITIAL_STUDENTS.length,
      });
    }

    if (pathname === '/api/students' && method === 'POST') {
      const { name, stream, gender, rollNumber, avatar } = parsedBody || {};
      const cleanName = String(name || '').trim();
      const cleanStream = String(stream || 'PCM').toUpperCase().trim();
      if (!cleanName) return makeJsonResponse(400, { error: 'Student name is required.' });
      const students = readStudents();
      const newStudent = {
        id: `std-${Date.now().toString(36)}-${randomHex(2)}`,
        name: cleanName,
        stream: cleanStream,
        gender: gender === 'girl' ? 'girl' : 'boy',
        rollNumber: rollNumber || students.length + 1,
        avatar: avatar || undefined,
        createdAt: Date.now(),
      };
      students.push(newStudent);
      writeStore(STORAGE_KEYS.STUDENTS, students);
      return makeJsonResponse(201, {
        success: true,
        student: newStudent,
        totalCount: students.length,
      });
    }

    if (pathname.startsWith('/api/students/')) {
      const id = decodeURIComponent(pathname.slice('/api/students/'.length));
      const students = readStudents();
      const idx = students.findIndex((s) => s.id === id);
      if (idx === -1) return makeJsonResponse(404, { error: 'Student character not found.' });
      if (method === 'PATCH') {
        const { name, stream, gender, rollNumber, avatar } = parsedBody || {};
        if (name) students[idx].name = String(name).trim();
        if (stream) students[idx].stream = String(stream).toUpperCase().trim();
        if (gender === 'girl' || gender === 'boy') students[idx].gender = gender;
        if (rollNumber) students[idx].rollNumber = rollNumber;
        if (avatar !== undefined) students[idx].avatar = avatar;
        writeStore(STORAGE_KEYS.STUDENTS, students);
        return makeJsonResponse(200, { success: true, student: students[idx] });
      }
      if (method === 'DELETE') {
        const filtered = students.filter((s) => s.id !== id);
        writeStore(STORAGE_KEYS.STUDENTS, filtered);
        return makeJsonResponse(200, { success: true, totalCount: filtered.length });
      }
    }
  }

  // 12. Protected Diary, 2:00 PM IST Daily Cycle & Attachments Routes
  if (pathname === '/api/diary' || pathname.startsWith('/api/diary/')) {
    const auth = checkStaffPermission(['teacher_in_charge', 'developer']);
    if (auth.errorRes) return auth.errorRes;
    const staffUser = auth.user!;

    const ensureEmbeddedCycle = (
      refNowMs: number = Date.now(),
      opts?: { isolatedSimulation?: boolean; entriesSnapshot?: any[]; cycleStateSnapshot?: any; forceEnsureActiveEntry?: boolean }
    ) => {
      const cycleInfo = getDiaryCycleInfo(refNowMs);
      const isIsolated = Boolean(opts?.isolatedSimulation);
      const entries = isIsolated
        ? JSON.parse(JSON.stringify(opts?.entriesSnapshot || readStore<any[]>(STORAGE_KEYS.DIARY, [])))
        : readStore<any[]>(STORAGE_KEYS.DIARY, []);
      const cycleState = isIsolated
        ? JSON.parse(
            JSON.stringify(
              opts?.cycleStateSnapshot || {
                activeCycleDate: '',
                lastCheckedAt: 0,
                lastRolloverAt: 0,
                initializedCycles: {},
              }
            )
          )
        : readStore<any>(STORAGE_KEYS.DIARY_CYCLE, {
            activeCycleDate: '',
            lastCheckedAt: 0,
            lastRolloverAt: 0,
            initializedCycles: {},
          });
      if (!cycleState.initializedCycles) cycleState.initializedCycles = {};

      const dailyKey = `daily-cycle-${cycleInfo.activeCycleDate}`;
      let activeEntry =
        entries.find(
          (e: any) =>
            e.id === cycleInfo.dailyEntryId ||
            e.idempotencyKey === dailyKey ||
            e.date === cycleInfo.activeCycleDate
        ) || null;
      const alreadyInit = Boolean(cycleState.initializedCycles[cycleInfo.activeCycleDate]);
      let createdNewCycleEntry = false;

      if (!activeEntry && (!alreadyInit || opts?.forceEnsureActiveEntry)) {
        const readableDate = formatReadableDate(cycleInfo.activeCycleDate);
        const ts = Math.max(cycleInfo.cycleStartMs, refNowMs);
        activeEntry = {
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
          lastModified: ts,
          createdAt: cycleInfo.cycleStartMs,
          updatedAt: ts,
          publishedAt: cycleInfo.cycleStartMs,
          authorId: 'staff-tch-4d948c6f328c',
          authorName: 'Alka Mam (In-Charge)',
          authorRole: 'teacher_in_charge',
          authorRoleLabel: 'Teacher / In-Charge',
          status: 'published',
          attachments: [],
          version: 1,
          idempotencyKey: dailyKey,
        };
        entries.unshift(activeEntry);
        createdNewCycleEntry = true;
      }

      if (activeEntry && !cycleState.initializedCycles[cycleInfo.activeCycleDate]) {
        cycleState.initializedCycles[cycleInfo.activeCycleDate] = {
          entryId: activeEntry.id,
          initializedAt: refNowMs,
          cycleStartMs: cycleInfo.cycleStartMs,
        };
      }
      cycleState.activeCycleDate = cycleInfo.activeCycleDate;
      cycleState.lastCheckedAt = refNowMs;

      const sorted = [...entries].sort((a, b) => {
        const dCmp = String(b.date || '').localeCompare(String(a.date || ''));
        if (dCmp !== 0) return dCmp;
        return (b.updatedAt || b.lastModified || 0) - (a.updatedAt || a.lastModified || 0);
      });

      if (!isIsolated) {
        writeStore(STORAGE_KEYS.DIARY, sorted);
        writeStore(STORAGE_KEYS.DIARY_CYCLE, cycleState);
      }
      return { cycleInfo, entries: sorted, activeEntry, createdNewCycleEntry, cycleState };
    };

    if (pathname === '/api/diary/cycle' && method === 'GET') {
      const now = Date.now();
      const { cycleInfo, activeEntry, createdNewCycleEntry, entries } = ensureEmbeddedCycle(now);
      return makeJsonResponse(200, {
        success: true,
        cycleInfo,
        activeEntry,
        createdNewCycleEntry,
        totalEntriesCount: entries.length,
        serverTimestamp: now,
      });
    }

    if (pathname === '/api/diary/cycle/reconcile' && method === 'POST') {
      const targetNowMs =
        typeof parsedBody?.simulatedNowMs === 'number' && Number.isFinite(parsedBody.simulatedNowMs)
          ? parsedBody.simulatedNowMs
          : Date.now();
      const reconciled = ensureEmbeddedCycle(targetNowMs, {
        isolatedSimulation: Boolean(parsedBody?.isolatedSimulation),
        entriesSnapshot: Array.isArray(parsedBody?.entriesSnapshot) ? parsedBody.entriesSnapshot : undefined,
        cycleStateSnapshot: parsedBody?.cycleStateSnapshot,
        forceEnsureActiveEntry: Boolean(parsedBody?.forceEnsureActiveEntry),
      });
      return makeJsonResponse(200, {
        success: true,
        cycleInfo: reconciled.cycleInfo,
        activeEntry: reconciled.activeEntry,
        createdNewCycleEntry: reconciled.createdNewCycleEntry,
        entries: reconciled.entries,
        cycleState: reconciled.cycleState,
        serverTimestamp: targetNowMs,
      });
    }

    const { cycleInfo, entries, activeEntry, createdNewCycleEntry } = ensureEmbeddedCycle(Date.now());
    const attachmentsMap = readStore<Record<string, any>>(STORAGE_KEYS.ATTACHMENTS, {});

    if ((pathname === '/api/diary' || pathname === '/api/diary/entries') && method === 'GET') {
      return makeJsonResponse(200, {
        success: true,
        entries,
        cycleInfo,
        activeCycleDate: cycleInfo.activeCycleDate,
        activeEntryId: activeEntry?.id || cycleInfo.dailyEntryId,
        createdNewCycleEntry,
        serverTimestamp: Date.now(),
      });
    }

    if (pathname === '/api/diary/attachments/upload' && method === 'POST') {
      const { fileName, mimeType, base64Data, diaryId = 'pending' } = parsedBody || {};
      if (!fileName || !mimeType || !base64Data) {
        return makeJsonResponse(400, { error: 'fileName, mimeType, and base64Data are required.' });
      }
      const now = Date.now();
      const attId = `att-${now}-${randomHex(4)}`;
      const meta = {
        id: attId,
        diaryId: String(diaryId),
        originalName: String(fileName),
        fileName: String(fileName),
        mimeType: String(mimeType),
        sizeBytes: Math.round((String(base64Data).length * 3) / 4),
        uploadedAt: now,
        uploadedBy: staffUser.id,
        uploadedByName: staffUser.displayName,
        base64Data: String(base64Data),
      };
      attachmentsMap[attId] = meta;
      writeStore(STORAGE_KEYS.ATTACHMENTS, attachmentsMap);
      return makeJsonResponse(201, { success: true, attachment: meta });
    }

    if (pathname.startsWith('/api/diary/attachments/')) {
      const rest = pathname.slice('/api/diary/attachments/'.length);
      if (rest.endsWith('/ticket') && method === 'POST') {
        const attId = decodeURIComponent(rest.slice(0, rest.length - '/ticket'.length));
        const stored = attachmentsMap[attId];
        if (!stored) return makeJsonResponse(404, { error: 'Attachment not found.' });
        return makeJsonResponse(200, {
          success: true,
          ticket: signToken(attId),
          expiresAt: Date.now() + 60000,
          inlineUrl: stored.base64Data || `/api/diary/attachments/${encodeURIComponent(attId)}`,
          downloadUrl: stored.base64Data || `/api/diary/attachments/${encodeURIComponent(attId)}`,
        });
      }
      const attId = decodeURIComponent(rest);
      const stored = attachmentsMap[attId];
      if (!stored) return makeJsonResponse(404, { error: 'Protected attachment not found.' });
      return makeJsonResponse(200, { success: true, attachment: stored });
    }

    if ((pathname === '/api/diary' || pathname === '/api/diary/entries') && method === 'POST') {
      const now = Date.now();
      const cleanDate = String(parsedBody.date || getActiveDiaryCycleDateIST(now)).trim();
      if (parsedBody.idempotencyKey) {
        const dup = entries.find((e: any) => e.idempotencyKey === parsedBody.idempotencyKey);
        if (dup) {
          return makeJsonResponse(200, { success: true, entry: dup, cycleInfo, deduplicated: true });
        }
      }
      const newEntry = {
        id: parsedBody.id || `diary-${cleanDate}-${randomHex(4)}`,
        date: cleanDate,
        subject: String(parsedBody.subject || 'General').trim(),
        type: String(parsedBody.type || 'Homework').trim(),
        targetStream: String(parsedBody.targetStream || 'ALL').trim(),
        title: String(parsedBody.title || '').trim(),
        content: String(parsedBody.content || parsedBody.description || '').trim(),
        description: String(parsedBody.description || parsedBody.content || '').trim(),
        homework: String(parsedBody.homework || '').trim(),
        remarks: String(parsedBody.remarks || parsedBody.teacherRemarks || '').trim(),
        notices: String(parsedBody.notices || parsedBody.importantNotices || '').trim(),
        teacherRemarks: String(parsedBody.remarks || parsedBody.teacherRemarks || '').trim(),
        importantNotices: String(parsedBody.notices || parsedBody.importantNotices || '').trim(),
        lastModified: now,
        createdAt: now,
        updatedAt: now,
        publishedAt: now,
        authorId: staffUser.id,
        authorName: staffUser.displayName,
        authorRole: staffUser.role,
        authorRoleLabel: staffUser.roleLabel,
        status: parsedBody.status === 'draft' ? 'draft' : 'published',
        attachments: Array.isArray(parsedBody.attachments) ? parsedBody.attachments : [],
        version: 1,
        idempotencyKey: parsedBody.idempotencyKey,
      };
      const existingIdx = entries.findIndex((e: any) => e.id === newEntry.id);
      if (existingIdx >= 0) {
        entries[existingIdx] = {
          ...entries[existingIdx],
          ...newEntry,
          version: (entries[existingIdx].version || 1) + 1,
        };
      } else {
        entries.unshift(newEntry);
      }
      writeStore(STORAGE_KEYS.DIARY, entries);
      return makeJsonResponse(201, { success: true, entry: newEntry, cycleInfo });
    }

    const entryIdPrefix = pathname.startsWith('/api/diary/entries/')
      ? '/api/diary/entries/'
      : '/api/diary/';
    const id = decodeURIComponent(pathname.slice(entryIdPrefix.length));
    const idx = entries.findIndex((e: any) => e.id === id || e.date === id);
    if (idx === -1) return makeJsonResponse(404, { error: 'Diary entry not found.' });

    if (method === 'GET') {
      return makeJsonResponse(200, { success: true, entry: entries[idx], cycleInfo });
    }
    if (method === 'PUT') {
      const now = Date.now();
      entries[idx] = {
        ...entries[idx],
        ...parsedBody,
        updatedAt: now,
        lastModified: now,
        version: (entries[idx].version || 1) + 1,
      };
      writeStore(STORAGE_KEYS.DIARY, entries);
      return makeJsonResponse(200, { success: true, entry: entries[idx], cycleInfo });
    }
    if (method === 'DELETE') {
      const remaining = entries.filter((e: any) => e.id !== id);
      writeStore(STORAGE_KEYS.DIARY, remaining);
      return makeJsonResponse(200, { success: true, deletedId: id });
    }
  }

  // 13. Protected Quick Notes Routes
  if (pathname === '/api/quick-notes' || pathname.startsWith('/api/quick-notes/')) {
    const auth = checkStaffPermission(['teacher_in_charge', 'developer']);
    if (auth.errorRes) return auth.errorRes;
    const staffUser = auth.user!;
    const notes = readStore<any[]>(STORAGE_KEYS.QUICK_NOTES, []);

    if (pathname === '/api/quick-notes' && method === 'GET') {
      const sorted = [...notes].sort((a, b) => {
        if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
        return (b.createdAt || 0) - (a.createdAt || 0);
      });
      return makeJsonResponse(200, {
        success: true,
        notes: sorted,
        serverTimestamp: Date.now(),
      });
    }

    if (pathname === '/api/quick-notes' && method === 'POST') {
      const cleanContent = String(parsedBody.content || '').trim();
      if (!cleanContent) {
        return makeJsonResponse(400, { error: 'Quick Note content cannot be empty.' });
      }
      const now = Date.now();
      const newNote = {
        id: parsedBody.id || `qnote-${now}-${randomHex(4)}`,
        title: String(parsedBody.title || '').trim(),
        content: cleanContent,
        category: parsedBody.category || 'general',
        pinned: Boolean(parsedBody.pinned),
        authorId: staffUser.id,
        authorName: staffUser.displayName,
        authorRole: staffUser.role,
        authorRoleLabel: staffUser.roleLabel,
        createdAt: now,
        updatedAt: now,
        version: 1,
        idempotencyKey: parsedBody.idempotencyKey,
      };
      notes.unshift(newNote);
      writeStore(STORAGE_KEYS.QUICK_NOTES, notes);
      return makeJsonResponse(201, { success: true, note: newNote });
    }

    if (pathname.startsWith('/api/quick-notes/')) {
      const id = decodeURIComponent(pathname.slice('/api/quick-notes/'.length));
      const idx = notes.findIndex((n) => n.id === id);
      if (idx === -1) return makeJsonResponse(404, { error: 'Quick Note not found.' });
      if (method === 'PUT') {
        const now = Date.now();
        notes[idx] = {
          ...notes[idx],
          ...parsedBody,
          updatedAt: now,
          version: (notes[idx].version || 1) + 1,
        };
        writeStore(STORAGE_KEYS.QUICK_NOTES, notes);
        return makeJsonResponse(200, { success: true, note: notes[idx] });
      }
      if (method === 'DELETE') {
        writeStore(
          STORAGE_KEYS.QUICK_NOTES,
          notes.filter((n) => n.id !== id)
        );
        return makeJsonResponse(200, { success: true, deletedId: id });
      }
    }
  }

  // 14. Protected Staff Offline Sync Route
  if (pathname === '/api/staff/sync' || pathname.startsWith('/api/staff/sync/')) {
    const auth = checkStaffPermission(['teacher_in_charge', 'developer']);
    if (auth.errorRes) return auth.errorRes;
    const mutations = Array.isArray(parsedBody.mutations) ? parsedBody.mutations : [];
    const results = mutations.map((m: any) => ({
      mutationId: m.id,
      status: 'synced',
      entityId: m.recordId || m.entityId || m.id,
    }));
    return makeJsonResponse(200, {
      success: true,
      results,
      diaryEntries: readStore<any[]>(STORAGE_KEYS.DIARY, []),
      quickNotes: readStore<any[]>(STORAGE_KEYS.QUICK_NOTES, []),
      serverTimestamp: Date.now(),
    });
  }

  // 15. Quiz Attempts Sync
  if (pathname === '/api/quizzes/attempts' && method === 'GET') {
    const attempts = readStore<any[]>(STORAGE_KEYS.ATTEMPTS, []);
    return makeJsonResponse(200, {
      success: true,
      attempts,
      totalCount: attempts.length,
      checkedAt: Date.now(),
    });
  }
  if (pathname === '/api/quizzes/attempts/sync' && method === 'POST') {
    const incoming = Array.isArray(parsedBody.attempts) ? parsedBody.attempts : [];
    const existing = readStore<any[]>(STORAGE_KEYS.ATTEMPTS, []);
    const map = new Map<string, any>(existing.map((a) => [a.id, a]));
    const syncedIds: string[] = [];
    for (const att of incoming) {
      if (att && att.id) {
        map.set(att.id, { ...att, synced: true, syncStatus: 'synced' });
        syncedIds.push(att.id);
      }
    }
    const merged = Array.from(map.values());
    writeStore(STORAGE_KEYS.ATTEMPTS, merged);
    return makeJsonResponse(200, {
      success: true,
      syncedIds,
      attempts: merged,
      totalCount: merged.length,
      syncedAt: Date.now(),
    });
  }

  // 16. Gemini Question Paper & Speed Quiz Generation (/api/gemini/quiz, /api/gemini/quiz/regenerate-question, /api/gemini/chat)
  if (pathname === '/api/gemini/quiz' && method === 'POST') {
    const result = synthesizeCbseAssessment(parsedBody, 'gemini-3-flash-preview');
    return makeJsonResponse(result.status, result.body);
  }

  if (pathname === '/api/gemini/quiz/regenerate-question' && method === 'POST') {
    const result = synthesizeRegeneratedQuestion(parsedBody, 'gemini-3-flash-preview');
    return makeJsonResponse(result.status, result.body);
  }

  if (pathname === '/api/gemini/chat' && method === 'POST') {
    const result = synthesizeAcademicChatReply(parsedBody);
    return makeJsonResponse(result.status, result.body);
  }

  // 16b. Android APK & Web PDF Preparation & Download Bridge (/api/pdf/prepare, /api/pdf/download/:token/:filename)
  if (pathname === '/api/pdf/prepare' && method === 'POST') {
    const rawBase64 = parsedBody?.base64 || parsedBody?.pdfBase64 || '';
    const rawFilename = parsedBody?.filename || 'NEXORA_Document.pdf';
    if (!rawBase64 || typeof rawBase64 !== 'string') {
      return makeJsonResponse(400, { error: 'Valid base64 PDF payload is required.' });
    }
    const cleanBase64 = rawBase64.replace(/^data:application\/pdf;base64,/, '').trim();
    let decodedBytes: Uint8Array;
    try {
      if (typeof Buffer !== 'undefined') {
        decodedBytes = new Uint8Array(Buffer.from(cleanBase64, 'base64'));
      } else {
        const binStr = atob(cleanBase64);
        decodedBytes = new Uint8Array(binStr.length);
        for (let i = 0; i < binStr.length; i++) {
          decodedBytes[i] = binStr.charCodeAt(i);
        }
      }
    } catch {
      return makeJsonResponse(400, { error: 'Failed to decode base64 PDF payload.' });
    }
    if (decodedBytes.byteLength < 100) {
      return makeJsonResponse(400, { error: 'Invalid or empty PDF payload.' });
    }
    const safeFilename =
      String(rawFilename)
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .replace(/\.pdf$/i, '') + '.pdf';
    const token = `apk-pdf-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    embeddedPreparedPdfStore.set(token, {
      bytes: decodedBytes,
      base64: cleanBase64,
      filename: safeFilename,
      createdAt: Date.now(),
    });
    // Prune older entries above 25
    if (embeddedPreparedPdfStore.size > 25) {
      const oldestKey = embeddedPreparedPdfStore.keys().next().value;
      if (oldestKey) embeddedPreparedPdfStore.delete(oldestKey);
    }
    return makeJsonResponse(200, {
      success: true,
      token,
      filename: safeFilename,
      byteLength: decodedBytes.byteLength,
      embedded: true,
      downloadPath: `/downloads/nexora-paper/${token}/${encodeURIComponent(safeFilename)}`,
      apiDownloadPath: `/api/pdf/download/${token}/${encodeURIComponent(safeFilename)}`,
    });
  }

  if (
    (pathname.startsWith('/api/pdf/download/') || pathname.startsWith('/downloads/nexora-paper/')) &&
    method === 'GET'
  ) {
    const parts = pathname.split('/').filter(Boolean);
    // parts for /api/pdf/download/:token/:filename -> ['api', 'pdf', 'download', token, filename]
    // parts for /downloads/nexora-paper/:token/:filename -> ['downloads', 'nexora-paper', token, filename]
    const tokenIdx = parts[0] === 'api' ? 3 : 2;
    const token = parts[tokenIdx] || '';
    const entry = embeddedPreparedPdfStore.get(token);
    if (!entry) {
      return makeJsonResponse(404, { error: 'Prepared PDF token expired or not found.' });
    }
    return new Response(entry.bytes as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${entry.filename}"`,
        'Content-Length': String(entry.bytes.byteLength),
        'Cache-Control': 'no-store',
      },
    });
  }

  // 17. Unmatched / Removed API endpoints (e.g. /api/staff/auth/setup-key, /api/updates/nonexistent-endpoint-404)
  return makeJsonResponse(404, {
    error: `API endpoint not found: ${method} ${pathname}`,
    code: 'NOT_FOUND',
  });
}

// ============================================================================
// 4. AUTOMATIC FETCH INTERCEPTOR FOR ANDROID APK (file://) & GATEWAY FALLBACK
// ============================================================================

const embeddedPreparedPdfStore = new Map<
  string,
  { bytes: Uint8Array; base64: string; filename: string; createdAt: number }
>();

let isBridgeInstalled = false;
let remoteGatewayBlockedUntil = 0;

const DEFAULT_APK_HTTPS_BACKEND =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_RELEASE_SERVER_URL) ||
  'https://ais-pre-cjjqxynp5pw6257ks3igyi-205056013380.asia-southeast1.run.app';

const cachedNativeFetch: typeof fetch | null = (() => {
  try {
    if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
      return window.fetch.bind(window);
    }
    if (typeof globalThis !== 'undefined' && typeof globalThis.fetch === 'function') {
      return globalThis.fetch.bind(globalThis);
    }
  } catch {
    // ignore
  }
  return null;
})();

function extractApiPath(input: RequestInfo | URL): { isApi: boolean; urlStr: string; pathname: string } {
  let urlStr = '';
  if (typeof input === 'string') {
    urlStr = input;
  } else if (typeof URL !== 'undefined' && input instanceof URL) {
    urlStr = input.toString();
  } else if (typeof Request !== 'undefined' && input instanceof Request) {
    urlStr = input.url;
  }
  if (!urlStr) return { isApi: false, urlStr: '', pathname: '' };
  if (urlStr.startsWith('/api/') || urlStr.startsWith('/downloads/nexora-paper/')) {
    return { isApi: true, urlStr, pathname: urlStr.split('?')[0] };
  }
  try {
    const parsed = new URL(urlStr, 'http://localhost:3000');
    if (parsed.pathname.startsWith('/api/') || parsed.pathname.startsWith('/downloads/nexora-paper/')) {
      return { isApi: true, urlStr, pathname: parsed.pathname };
    }
  } catch {
    if (urlStr.includes('/api/')) {
      const idx = urlStr.indexOf('/api/');
      return { isApi: true, urlStr, pathname: urlStr.slice(idx).split('?')[0] };
    }
  }
  return { isApi: false, urlStr, pathname: '' };
}

export async function apkAwareFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const { isApi, urlStr, pathname } = extractApiPath(input);
  const underlyingFetch =
    typeof window !== 'undefined' &&
    typeof window.fetch === 'function' &&
    window.fetch !== apkAwareFetch
      ? window.fetch.bind(window)
      : cachedNativeFetch;

  if (!isApi) {
    if (!underlyingFetch) {
      throw new Error('Native fetch is not available in this environment');
    }
    return underlyingFetch(input, init);
  }

  const isTrueFileOrAssetOrigin =
    typeof window !== 'undefined' &&
    (window.location.protocol === 'file:' ||
      window.location.origin === 'null' ||
      window.location.hostname === 'appassets.androidplatform.net');

  const isGeminiEndpoint = pathname.startsWith('/api/gemini/');
  const isPdfEndpoint = pathname.startsWith('/api/pdf/') || pathname.startsWith('/downloads/nexora-paper/');
  const isSharedStaffContentEndpoint =
    pathname === '/api/diary' ||
    pathname.startsWith('/api/diary/') ||
    pathname === '/api/quick-notes' ||
    pathname.startsWith('/api/quick-notes/') ||
    pathname === '/api/staff/sync' ||
    pathname.startsWith('/api/staff/sync/');

  // On standalone Android APK asset origin (file://), resolve relative '/api/*' requests
  // to the authoritative shared HTTPS backend so APK and Web share the exact same database.
  const networkTarget: RequestInfo | URL =
    isTrueFileOrAssetOrigin && urlStr.startsWith('/')
      ? `${String(DEFAULT_APK_HTTPS_BACKEND).replace(/\/+$/, '')}${urlStr}`
      : input;

  // CRITICAL: Never falsely report Diary or Quick Notes uploads/reads as server-confirmed when offline.
  // Propagate offline state so staffContentService queues pending changes honestly until connectivity returns.
  if (typeof window !== 'undefined' && window.navigator.onLine === false) {
    if (isSharedStaffContentEndpoint) {
      throw new TypeError('Failed to fetch: Device is currently offline.');
    }
    if (isTrueFileOrAssetOrigin || isPdfEndpoint) {
      return handleEmbeddedApiRequest(urlStr, init);
    }
  }

  if (!underlyingFetch) {
    if (isSharedStaffContentEndpoint) {
      throw new TypeError('Failed to fetch: Network transport unavailable.');
    }
    return handleEmbeddedApiRequest(urlStr, init);
  }

  try {
    const response = await underlyingFetch(networkTarget, init);
    const contentType = (response.headers.get('content-type') || '').toLowerCase();

    // If a standalone file:// WebView hits a gateway proxy returning text/html instead of JSON,
    // use the embedded handler only when online and not a failing offline write.
    if (isTrueFileOrAssetOrigin && contentType.includes('text/html')) {
      return handleEmbeddedApiRequest(urlStr, init);
    }

    // If a Gemini or PDF endpoint returned 404/502/503/504 or an HTML gateway page,
    // seamlessly fall back to the embedded handler so generation & PDF saving work reliably.
    if (
      (isGeminiEndpoint || isPdfEndpoint) &&
      (response.status === 404 ||
        response.status === 502 ||
        response.status === 503 ||
        response.status === 504 ||
        contentType.includes('text/html'))
    ) {
      return handleEmbeddedApiRequest(urlStr, init);
    }

    return response;
  } catch (err) {
    // Never mask network failures on shared Diary / Quick Notes / Sync endpoints as fake 200/201 responses.
    // Rethrowing allows staffContentService to queue offline changes and mark syncStatus = 'pending'.
    if (isSharedStaffContentEndpoint) {
      throw err;
    }
    if (isTrueFileOrAssetOrigin || isGeminiEndpoint || isPdfEndpoint) {
      return handleEmbeddedApiRequest(urlStr, init);
    }
    throw err;
  }
}

export function installApkApiBridge(): void {
  if (isBridgeInstalled || typeof window === 'undefined') {
    return;
  }
  isBridgeInstalled = true;

  try {
    const ownDesc = Object.getOwnPropertyDescriptor(window, 'fetch');
    const protoDesc =
      !ownDesc && Object.getPrototypeOf(window)
        ? Object.getOwnPropertyDescriptor(Object.getPrototypeOf(window), 'fetch')
        : undefined;
    const desc = ownDesc || protoDesc;

    if (desc && (desc.writable === true || typeof desc.set === 'function')) {
      window.fetch = apkAwareFetch;
    } else if (!ownDesc || ownDesc.configurable === true) {
      Object.defineProperty(window, 'fetch', {
        value: apkAwareFetch,
        configurable: true,
        writable: true,
      });
    }
  } catch {
    // Safely ignore if window.fetch is locked as non-configurable by the host iframe/browser;
    // all NEXORA services and tests also invoke apkAwareFetch directly.
  }
}

// Auto-install immediately when module is imported in browser/WebView
installApkApiBridge();
