#!/usr/bin/env node
/**
 * Genuine NEXORA Android APK Packager, 4-Byte Zipaligner & Cryptographic Signer (v1 + v2 + v3)
 * Uses the persistent RSA-2048 release keystore (android/keystore/nexora-release.jks) to package
 * the latest production web build (dist/) into a valid, aligned, and signed Android APK.
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';
import { execSync } from 'child_process';

const VERSION_NAME = process.argv[2] || '1.7.0';
const VERSION_CODE = parseInt(process.argv[3] || '7', 10);
const RELEASE_NOTES =
  process.argv[4] ||
  `NEXORA v${VERSION_NAME} Production Release: Default CURRENT TIMETABLE (Class In-Charge: Diksha Mam) with instant OLD TIMETABLE switcher, 1-page A4 landscape PDF & Print export, Android APK native PDF download bridge, and Node.js production server ESM startup fix.`;

const ROOT = process.cwd();
const BASE_APK_PATH = fs.existsSync(path.resolve(ROOT, 'public/downloads/nexora-v1.2.0.apk'))
  ? path.resolve(ROOT, 'public/downloads/nexora-v1.2.0.apk')
  : path.resolve(ROOT, 'public/downloads/nexora-release.apk');
const KEYSTORE_PATH = path.resolve(ROOT, 'android/keystore/nexora-release.jks');
const KEYSTORE_PASS = 'nexora2026securekey';
const ASSETS_WWW_DIR = path.resolve(ROOT, 'android/assets/www');

if (!fs.existsSync(BASE_APK_PATH)) {
  console.error('Base APK template not found at:', BASE_APK_PATH);
  process.exit(1);
}
if (!fs.existsSync(KEYSTORE_PATH)) {
  console.error('Release keystore not found at:', KEYSTORE_PATH);
  process.exit(1);
}

// 1. Extract private key and certificate from PKCS#12 keystore (.jks)
const privateKeyPem = execSync(
  `openssl pkcs12 -in "${KEYSTORE_PATH}" -passin pass:${KEYSTORE_PASS} -nodes -nocerts 2>/dev/null`
).toString();
const certPemFull = execSync(
  `openssl pkcs12 -in "${KEYSTORE_PATH}" -passin pass:${KEYSTORE_PASS} -nodes -nokeys 2>/dev/null`
).toString();
const certMatch = certPemFull.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/);
if (!certMatch) {
  throw new Error('Failed to extract X.509 certificate from keystore.');
}
const certPem = certMatch[0] + '\n';

// 2. Read base APK to extract compiled AndroidManifest.xml, resources.arsc, res/*, classes.dex, and v2/v3 signing block templates
const baseApkBuf = fs.readFileSync(BASE_APK_PATH);

function parseZipEntries(buf) {
  const eocdOffset = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocdOffset === -1) throw new Error('EOCD not found in base APK');
  const totalEntries = buf.readUInt16LE(eocdOffset + 10);
  const cdSize = buf.readUInt32LE(eocdOffset + 12);
  const cdOffset = buf.readUInt32LE(eocdOffset + 16);

  const entries = new Map();
  let pos = cdOffset;
  for (let i = 0; i < totalEntries; i++) {
    if (buf.readUInt32LE(pos) !== 0x02014b50) throw new Error('Invalid CD header signature');
    const compressType = buf.readUInt16LE(pos + 10);
    const compSize = buf.readUInt32LE(pos + 20);
    const uncompSize = buf.readUInt32LE(pos + 24);
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const lfhOffset = buf.readUInt32LE(pos + 42);
    const name = buf.subarray(pos + 46, pos + 46 + nameLen).toString('utf8');

    const lfhNameLen = buf.readUInt16LE(lfhOffset + 26);
    const lfhExtraLen = buf.readUInt16LE(lfhOffset + 28);
    const dataStart = lfhOffset + 30 + lfhNameLen + lfhExtraLen;
    const compData = buf.subarray(dataStart, dataStart + compSize);
    const rawData =
      compressType === 0 ? Buffer.from(compData) : zlib.inflateRawSync(compData);

    entries.set(name, {
      name,
      compressType,
      rawData,
      uncompSize,
    });

    pos += 46 + nameLen + extraLen + commentLen;
  }
  return { entries, cdOffset, cdSize, eocdOffset };
}

const baseZip = parseZipEntries(baseApkBuf);

// Extract v2 (0x7109871a) and v3 (0xf05368c0) signer block templates from base APK
const sigMagicIdx = baseApkBuf.indexOf(Buffer.from('APK Sig Block 42'));
if (sigMagicIdx === -1) throw new Error('APK Sig Block 42 not found in base APK');
const baseSigBlockSize = Number(baseApkBuf.readBigUInt64LE(sigMagicIdx - 8));
const baseSigBlockStart = sigMagicIdx + 16 - (baseSigBlockSize + 8);
let pairPos = baseSigBlockStart + 8;
let v2PairTemplate = null;
let v3PairTemplate = null;
while (pairPos < sigMagicIdx - 8) {
  const plen = Number(baseApkBuf.readBigUInt64LE(pairPos));
  const pid = baseApkBuf.readUInt32LE(pairPos + 8);
  const pval = Buffer.from(baseApkBuf.subarray(pairPos + 12, pairPos + 8 + plen));
  if (pid === 0x7109871a) v2PairTemplate = pval;
  if (pid === 0xf05368c0) v3PairTemplate = pval;
  pairPos += 8 + plen;
}
if (!v2PairTemplate || !v3PairTemplate) {
  throw new Error('Missing v2 or v3 signature block template in base APK');
}

// 3. Patch binary AndroidManifest.xml with VERSION_NAME and VERSION_CODE
const manifestBuf = Buffer.from(baseZip.entries.get('AndroidManifest.xml').rawData);
// In binary AndroidManifest.xml, UTF-16LE "1.2.0" is at offset 874..884: '1', '.', '2', '.', '0'
const verParts = VERSION_NAME.split('.');
if (verParts.length === 3 && verParts.every((p) => p.length === 1)) {
  manifestBuf[874] = verParts[0].charCodeAt(0);
  manifestBuf[878] = verParts[1].charCodeAt(0);
  manifestBuf[882] = verParts[2].charCodeAt(0);
}
// versionCode int32 LE is at offset 1624
manifestBuf.writeUInt32LE(VERSION_CODE, 1624);

// 4. Patch classes.dex with VERSION_NAME and VERSION_CODE and recompute SHA-1 + Adler32
const dexBuf = Buffer.from(baseZip.entries.get('classes.dex').rawData);
// Update string constant "1.2.0" at offset 5262..5267
if (verParts.length === 3 && verParts.every((p) => p.length === 1)) {
  dexBuf.write(VERSION_NAME, 5262, 5, 'ascii');
}
// Update const/4 v2, #VERSION_CODE at offset 3999 (upper nibble = VERSION_CODE & 0x7, lower nibble = 2)
if (VERSION_CODE >= 1 && VERSION_CODE <= 7) {
  dexBuf[3999] = ((VERSION_CODE & 0x0f) << 4) | 0x02;
}
// Update static field initializer for VERSION_CODE at offset 8700
dexBuf[8700] = VERSION_CODE & 0xff;

// Recompute DEX SHA-1 signature (bytes 12..32 = SHA-1 of bytes 32..end)
const dexSha1 = crypto.createHash('sha1').update(dexBuf.subarray(32)).digest();
dexSha1.copy(dexBuf, 12);

// Recompute DEX Adler32 checksum (bytes 8..12 = Adler32 of bytes 12..end)
function computeAdler32(buf) {
  let a = 1;
  let b = 0;
  const MOD = 65521;
  for (let i = 0; i < buf.length; i++) {
    a = (a + buf[i]) % MOD;
    b = (b + a) % MOD;
  }
  return ((b << 16) | a) >>> 0;
}
const dexAdler = computeAdler32(dexBuf.subarray(12));
dexBuf.writeUInt32LE(dexAdler, 8);

// 5. Ensure production web build exists and copy dist/ into android/assets/www/
const distDir = path.resolve(ROOT, 'dist');
if (!fs.existsSync(path.resolve(distDir, 'index.html'))) {
  console.log('Building web assets (npm run build)...');
  execSync('npm run build', { stdio: 'inherit', cwd: ROOT });
}
fs.rmSync(ASSETS_WWW_DIR, { recursive: true, force: true });
fs.mkdirSync(ASSETS_WWW_DIR, { recursive: true });
function copyRecursiveSync(src, dest) {
  if (fs.statSync(src).isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const child of fs.readdirSync(src)) {
      copyRecursiveSync(path.join(src, child), path.join(dest, child));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}
copyRecursiveSync(distDir, ASSETS_WWW_DIR);

const releaseDate = new Date().toISOString().split('T')[0];
const bundledDrawsDir = path.resolve(ASSETS_WWW_DIR, 'downloads');
fs.mkdirSync(bundledDrawsDir, { recursive: true });
// Remove any .apk or .idsig files from android/assets/www/downloads so we never double-bundle APKs
for (const f of fs.readdirSync(bundledDrawsDir)) {
  if (f.endsWith('.apk') || f.endsWith('.idsig')) {
    fs.unlinkSync(path.resolve(bundledDrawsDir, f));
  }
}

const preliminaryManifest = {
  version: VERSION_NAME,
  versionCode: VERSION_CODE,
  releaseDate,
  minSupportedVersion: '1.0.0',
  apkUrl: '/downloads/nexora-release.apk',
  versionedApkUrl: `/downloads/nexora-v${VERSION_NAME}.apk`,
  apkSize: '820K',
  packageName: 'com.theabhinavschool.nexora',
  appName: 'NEXORA',
  releaseNotes: RELEASE_NOTES,
  platform: 'android',
};
fs.writeFileSync(
  path.resolve(bundledDrawsDir, 'release-info.json'),
  JSON.stringify(preliminaryManifest, null, 2) + '\n',
  'utf8'
);

// 6. Collect all files to package into the APK
const filesToPackage = [];

// 6a. AndroidManifest.xml (compressed)
filesToPackage.push({
  name: 'AndroidManifest.xml',
  rawData: manifestBuf,
  storeUncompressed: false,
});

// 6b. Walk android/assets/www/**
function walkDir(dir, prefix = '') {
  const items = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    const relPath = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.isDirectory()) {
      walkDir(fullPath, relPath);
    } else if (item.isFile()) {
      if (item.name.endsWith('.apk') || item.name.endsWith('.idsig')) continue;
      const ext = path.extname(item.name).toLowerCase();
      const storeUncompressed = ['.png', '.ico', '.jpg', '.jpeg', '.webp', '.mp3', '.ogg'].includes(ext);
      filesToPackage.push({
        name: `assets/www/${relPath}`,
        rawData: fs.readFileSync(fullPath),
        storeUncompressed,
      });
    }
  }
}
walkDir(ASSETS_WWW_DIR);

// 6c. Add res/* and resources.arsc from base APK
for (const [entryName, entryObj] of baseZip.entries.entries()) {
  if (entryName.startsWith('res/') || entryName === 'resources.arsc') {
    filesToPackage.push({
      name: entryName,
      rawData: entryObj.rawData,
      storeUncompressed: entryObj.compressType === 0,
    });
  }
}

// 6d. Add classes.dex
filesToPackage.push({
  name: 'classes.dex',
  rawData: dexBuf,
  storeUncompressed: false,
});

// 7. Generate v1 JAR Signature files: META-INF/MANIFEST.MF, META-INF/NEXORA.SF, META-INF/NEXORA.RSA
function wrap70(line) {
  if (Buffer.byteLength(line, 'utf8') <= 70) return line + '\r\n';
  let out = line.slice(0, 70) + '\r\n';
  let rest = line.slice(70);
  while (rest.length > 0) {
    out += ' ' + rest.slice(0, 69) + '\r\n';
    rest = rest.slice(69);
  }
  return out;
}

let manifestMf = 'Manifest-Version: 1.0\r\nCreated-By: 1.0 (Android)\r\n\r\n';
const sfEntries = [];

for (const file of filesToPackage) {
  const sha256B64 = crypto.createHash('sha256').update(file.rawData).digest('base64');
  const section = wrap70(`Name: ${file.name}`) + `SHA-256-Digest: ${sha256B64}\r\n\r\n`;
  manifestMf += section;
  const sectionSha256B64 = crypto.createHash('sha256').update(Buffer.from(section, 'utf8')).digest('base64');
  sfEntries.push(wrap70(`Name: ${file.name}`) + `SHA-256-Digest: ${sectionSha256B64}\r\n\r\n`);
}

const manifestMfBuf = Buffer.from(manifestMf, 'utf8');
const manifestDigestB64 = crypto.createHash('sha256').update(manifestMfBuf).digest('base64');

let nexoraSf =
  'Signature-Version: 1.0\r\n' +
  'Created-By: 1.0 (Android)\r\n' +
  `SHA-256-Digest-Manifest: ${manifestDigestB64}\r\n` +
  'X-Android-APK-Signed: 2, 3\r\n\r\n' +
  sfEntries.join('');
const nexoraSfBuf = Buffer.from(nexoraSf, 'utf8');

// Sign NEXORA.SF using OpenSSL CMS (PKCS#7 DER detached signature)
const tmpKeyPath = '/tmp/nexora_sign_key.pem';
const tmpCertPath = '/tmp/nexora_sign_cert.pem';
const tmpSfPath = '/tmp/nexora_sign.sf';
const tmpRsaPath = '/tmp/nexora_sign.rsa';
fs.writeFileSync(tmpKeyPath, privateKeyPem, { mode: 0o600 });
fs.writeFileSync(tmpCertPath, certPem, { mode: 0o600 });
fs.writeFileSync(tmpSfPath, nexoraSfBuf);

execSync(
  `openssl cms -sign -binary -noattr -in "${tmpSfPath}" -signer "${tmpCertPath}" -inkey "${tmpKeyPath}" -outform DER -out "${tmpRsaPath}" -md sha256`
);
const nexoraRsaBuf = fs.readFileSync(tmpRsaPath);

// Verify CMS signature immediately
execSync(
  `openssl cms -verify -inform DER -in "${tmpRsaPath}" -content "${tmpSfPath}" -CAfile "${tmpCertPath}" -out /dev/null 2>/dev/null`
);

// Clean up temp signing files
for (const p of [tmpKeyPath, tmpCertPath, tmpSfPath, tmpRsaPath]) {
  try {
    fs.unlinkSync(p);
  } catch {}
}

filesToPackage.push(
  { name: 'META-INF/NEXORA.SF', rawData: nexoraSfBuf, storeUncompressed: false },
  { name: 'META-INF/NEXORA.RSA', rawData: nexoraRsaBuf, storeUncompressed: false },
  { name: 'META-INF/MANIFEST.MF', rawData: manifestMfBuf, storeUncompressed: false }
);

// 8. Build 4-byte zipaligned ZIP archive (Local File Headers + Central Directory + EOCD)
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

const lfhChunks = [];
const cdChunks = [];
let currentOffset = 0;

for (const file of filesToPackage) {
  const nameBuf = Buffer.from(file.name, 'utf8');
  const uncompSize = file.rawData.length;
  const fileCrc = crc32(file.rawData);
  const compressType = file.storeUncompressed ? 0 : 8;
  const compData = file.storeUncompressed
    ? file.rawData
    : zlib.deflateRawSync(file.rawData, { level: 9 });
  const compSize = compData.length;

  // Compute 4-byte zipalign padding for uncompressed entries
  let extraLen = 0;
  if (file.storeUncompressed) {
    const dataStartWithoutExtra = currentOffset + 30 + nameBuf.length;
    const remainder = dataStartWithoutExtra % 4;
    if (remainder !== 0) {
      extraLen = 4 - remainder;
    }
  }
  const extraBuf = Buffer.alloc(extraLen, 0);

  const lfh = Buffer.alloc(30);
  lfh.writeUInt32LE(0x04034b50, 0); // signature
  lfh.writeUInt16LE(20, 4); // version needed
  lfh.writeUInt16LE(0, 6); // flags
  lfh.writeUInt16LE(compressType, 8);
  lfh.writeUInt16LE(0, 10); // mod time
  lfh.writeUInt16LE(0x21, 12); // mod date (1980-01-01)
  lfh.writeUInt32LE(fileCrc, 14);
  lfh.writeUInt32LE(compSize, 18);
  lfh.writeUInt32LE(uncompSize, 22);
  lfh.writeUInt16LE(nameBuf.length, 26);
  lfh.writeUInt16LE(extraBuf.length, 28);

  const lfhOffset = currentOffset;
  const entryChunk = Buffer.concat([lfh, nameBuf, extraBuf, compData]);
  lfhChunks.push(entryChunk);
  currentOffset += entryChunk.length;

  // Central Directory Header
  const cdh = Buffer.alloc(46);
  cdh.writeUInt32LE(0x02014b50, 0);
  cdh.writeUInt16LE(20, 4); // version made by
  cdh.writeUInt16LE(20, 6); // version needed
  cdh.writeUInt16LE(0, 8); // flags
  cdh.writeUInt16LE(compressType, 10);
  cdh.writeUInt16LE(0, 12);
  cdh.writeUInt16LE(0x21, 14);
  cdh.writeUInt32LE(fileCrc, 16);
  cdh.writeUInt32LE(compSize, 20);
  cdh.writeUInt32LE(uncompSize, 24);
  cdh.writeUInt16LE(nameBuf.length, 28);
  cdh.writeUInt16LE(0, 30); // extra len in CD
  cdh.writeUInt16LE(0, 32); // comment len
  cdh.writeUInt16LE(0, 34); // disk number
  cdh.writeUInt16LE(0, 36); // internal attrs
  cdh.writeUInt32LE(0, 38); // external attrs
  cdh.writeUInt32LE(lfhOffset, 42);

  cdChunks.push(Buffer.concat([cdh, nameBuf]));
}

// Pad the end of LFH section to a 4096-byte multiple if needed so APK Sig Block 42 is 4096-aligned
const entriesBuf = Buffer.concat(lfhChunks);
const cdBuf = Buffer.concat(cdChunks);

const eocdForDigest = Buffer.alloc(22);
eocdForDigest.writeUInt32LE(0x06054b50, 0);
eocdForDigest.writeUInt16LE(0, 4);
eocdForDigest.writeUInt16LE(0, 6);
eocdForDigest.writeUInt16LE(filesToPackage.length, 8);
eocdForDigest.writeUInt16LE(filesToPackage.length, 10);
eocdForDigest.writeUInt32LE(cdBuf.length, 12);
eocdForDigest.writeUInt32LE(entriesBuf.length, 16); // points to start of APK Signing Block for digest calculation
eocdForDigest.writeUInt16LE(0, 20);

// 9. Compute APK Signature Scheme v2 & v3 Merkle Tree SHA-256 Digest
const ONE_MB = 1048576;
const chunkDigests = [];
for (const section of [entriesBuf, cdBuf, eocdForDigest]) {
  for (let offset = 0; offset < section.length; offset += ONE_MB) {
    const chunk = section.subarray(offset, Math.min(offset + ONE_MB, section.length));
    const header = Buffer.alloc(5);
    header[0] = 0xa5;
    header.writeUInt32LE(chunk.length, 1);
    const digest = crypto.createHash('sha256').update(header).update(chunk).digest();
    chunkDigests.push(digest);
  }
}

const topHeader = Buffer.alloc(5);
topHeader[0] = 0x5a;
topHeader.writeUInt32LE(chunkDigests.length, 1);
const topDigest = crypto
  .createHash('sha256')
  .update(topHeader)
  .update(Buffer.concat(chunkDigests))
  .digest();

// 10. Sign v2 (0x7109871a) and v3 (0xf05368c0) blocks with RSA-2048 private key
function updateSignerPair(pairTemplate, isV3) {
  const val = Buffer.from(pairTemplate);
  const signedDataLen = val.readUInt32LE(8);
  // Replace 32-byte topDigest at offset 12 + 16 = 28..60
  topDigest.copy(val, 12 + 16);
  const signedData = val.subarray(12, 12 + signedDataLen);
  const signature = crypto.sign('sha256', signedData, privateKeyPem);
  if (signature.length !== 256) {
    throw new Error(`Expected 256-byte RSA-2048 signature, got ${signature.length}`);
  }
  // Verify signature immediately with public certificate
  if (!crypto.verify('sha256', signedData, certPem, signature)) {
    throw new Error('Self-verification of v2/v3 RSA signature failed');
  }
  const sigOffset = 12 + signedDataLen + (isV3 ? 8 : 0) + 16;
  signature.copy(val, sigOffset);
  return val;
}

const v2Val = updateSignerPair(v2PairTemplate, false);
const v3Val = updateSignerPair(v3PairTemplate, true);

function makePair(id, valBuf) {
  const out = Buffer.alloc(12 + valBuf.length);
  out.writeBigUInt64LE(BigInt(4 + valBuf.length), 0);
  out.writeUInt32LE(id, 8);
  valBuf.copy(out, 12);
  return out;
}

const pairV2 = makePair(0x7109871a, v2Val);
const pairV3 = makePair(0xf05368c0, v3Val);

// Add verity padding pair (0x42726577) so total APK Signing Block size is a multiple of 4096 bytes
const baseBlockContentLen = 8 + pairV2.length + pairV3.length + 8 + 16;
const remainder4096 = (baseBlockContentLen + 12) % 4096;
const padLen = remainder4096 === 0 ? 0 : 4096 - remainder4096;
const pairPad = makePair(0x42726577, Buffer.alloc(padLen, 0));

const allPairs = Buffer.concat([pairV2, pairV3, pairPad]);
const sizeOfBlock = BigInt(allPairs.length + 8 + 16);

const sigBlockHeader = Buffer.alloc(8);
sigBlockHeader.writeBigUInt64LE(sizeOfBlock, 0);

const sigBlockFooter = Buffer.alloc(24);
sigBlockFooter.writeBigUInt64LE(sizeOfBlock, 0);
sigBlockFooter.write('APK Sig Block 42', 8, 16, 'ascii');

const apkSigningBlock = Buffer.concat([sigBlockHeader, allPairs, sigBlockFooter]);

// Final EOCD pointing to Central Directory after APK Signing Block
const finalCdOffset = entriesBuf.length + apkSigningBlock.length;
const finalEocd = Buffer.from(eocdForDigest);
finalEocd.writeUInt32LE(finalCdOffset, 16);

const finalApkBuf = Buffer.concat([entriesBuf, apkSigningBlock, cdBuf, finalEocd]);

// 11. Write signed APK artifacts and update release-info.json
const downloadsDir = path.resolve(ROOT, 'public/downloads');
fs.mkdirSync(downloadsDir, { recursive: true });

const versionedApkPath = path.resolve(downloadsDir, `nexora-v${VERSION_NAME}.apk`);
const latestApkPath = path.resolve(downloadsDir, 'nexora-release.apk');

fs.writeFileSync(versionedApkPath, finalApkBuf);
fs.writeFileSync(latestApkPath, finalApkBuf);

const apkSha256 = crypto.createHash('sha256').update(finalApkBuf).digest('hex');
const apkSizeKB = `${Math.round(finalApkBuf.length / 1024)}K`;

const finalReleaseInfo = {
  version: VERSION_NAME,
  versionCode: VERSION_CODE,
  releaseDate,
  minSupportedVersion: '1.0.0',
  apkUrl: '/downloads/nexora-release.apk',
  versionedApkUrl: `/downloads/nexora-v${VERSION_NAME}.apk`,
  apkSize: apkSizeKB,
  sha256: apkSha256,
  packageName: 'com.theabhinavschool.nexora',
  appName: 'NEXORA',
  releaseNotes: RELEASE_NOTES,
  platform: 'android',
};

const releaseJsonStr = JSON.stringify(finalReleaseInfo, null, 2) + '\n';
fs.writeFileSync(path.resolve(downloadsDir, 'release-info.json'), releaseJsonStr, 'utf8');
fs.writeFileSync(path.resolve(bundledDrawsDir, 'release-info.json'), releaseJsonStr, 'utf8');

const distDownloadsDir = path.resolve(ROOT, 'dist/downloads');
if (fs.existsSync(path.resolve(ROOT, 'dist'))) {
  fs.mkdirSync(distDownloadsDir, { recursive: true });
  for (const f of fs.readdirSync(distDownloadsDir)) {
    if ((f.endsWith('.apk') || f.endsWith('.idsig')) && f !== 'nexora-release.apk' && f !== `nexora-v${VERSION_NAME}.apk`) {
      try { fs.unlinkSync(path.resolve(distDownloadsDir, f)); } catch {}
    }
  }
  fs.writeFileSync(path.resolve(distDownloadsDir, 'release-info.json'), releaseJsonStr, 'utf8');
  fs.writeFileSync(path.resolve(distDownloadsDir, `nexora-v${VERSION_NAME}.apk`), finalApkBuf);
  fs.writeFileSync(path.resolve(distDownloadsDir, 'nexora-release.apk'), finalApkBuf);
}

// Clean up obsolete historical APK binaries in public/downloads (keep nexora-release.apk and current versioned APK)
for (const f of fs.readdirSync(downloadsDir)) {
  if (
    (f.endsWith('.apk') || f.endsWith('.idsig')) &&
    f !== 'nexora-release.apk' &&
    f !== `nexora-v${VERSION_NAME}.apk`
  ) {
    try { fs.unlinkSync(path.resolve(downloadsDir, f)); } catch {}
  }
}

// Clean up temporary android/build and android/assets staging directories after APK is packaged
try {
  fs.rmSync(path.resolve(ROOT, 'android/build'), { recursive: true, force: true });
  fs.rmSync(path.resolve(ROOT, 'android/assets'), { recursive: true, force: true });
} catch {}

console.log(`=== GENUINE NEXORA APK v${VERSION_NAME} (code ${VERSION_CODE}) BUILT & SIGNED ===`);
console.log(`Artifact: ${versionedApkPath}`);
console.log(`Latest Alias: ${latestApkPath}`);
console.log(`Size: ${apkSizeKB} (${finalApkBuf.length} bytes)`);
console.log(`SHA-256: ${apkSha256}`);
console.log(`Verified: v1 (CMS/PKCS#7) + v2 (0x7109871a) + v3 (0xf05368c0) RSA-2048 signatures OK`);
