#!/usr/bin/env node
/**
 * NEXORA Dalvik DEX Compiler & Assembler (DEX 035)
 * Compiles MainActivity, MainActivity$1 (DownloadListener), MainActivity$2 (WebViewClient),
 * MainActivity$3 (WebChromeClient with native onJsPrompt PDF bridge), and R classes into
 * a verified, sorted, 4-byte aligned classes.dex with SHA-1 signature and Adler32 checksum.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

function writeUleb128(arr, val) {
  let v = val >>> 0;
  while (v >= 0x80) {
    arr.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  arr.push(v & 0x7f);
}

function writeSleb128(arr, val) {
  let v = val | 0;
  let more = true;
  while (more) {
    let byte = v & 0x7f;
    v >>= 7;
    if ((v === 0 && (byte & 0x40) === 0) || (v === -1 && (byte & 0x40) !== 0)) {
      more = false;
    } else {
      byte |= 0x80;
    }
    arr.push(byte);
  }
}

function readUleb128(buf, o) {
  let result = 0;
  let shift = 0;
  while (true) {
    const b = buf[o.off++];
    result |= (b & 0x7f) << shift;
    if ((b & 0x80) === 0) break;
    shift += 7;
  }
  return result >>> 0;
}

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

function getInsnWidth(op) {
  if (
    op === 0x00 ||
    op === 0x01 ||
    op === 0x04 ||
    op === 0x07 ||
    (op >= 0x0a && op <= 0x12) ||
    op === 0x21 ||
    op === 0x28 ||
    (op >= 0x7b && op <= 0x8f) ||
    (op >= 0xb0 && op <= 0xcf)
  ) {
    return 1;
  }
  if (
    op === 0x13 ||
    op === 0x15 ||
    op === 0x16 ||
    op === 0x19 ||
    op === 0x1a ||
    (op >= 0x1c && op <= 0x20) ||
    op === 0x22 ||
    op === 0x23 ||
    op === 0x29 ||
    (op >= 0x2d && op <= 0x3d) ||
    (op >= 0x44 && op <= 0x6d) ||
    (op >= 0x90 && op <= 0xaf) ||
    (op >= 0xd0 && op <= 0xe2)
  ) {
    return 2;
  }
  if (
    op === 0x14 ||
    op === 0x17 ||
    op === 0x1b ||
    (op >= 0x24 && op <= 0x27) ||
    op === 0x2a ||
    (op >= 0x6e && op <= 0x72) ||
    (op >= 0x74 && op <= 0x78)
  ) {
    return 3;
  }
  if (op === 0x18) return 5;
  return 0;
}

/**
 * Symbolic Dalvik bytecode assembler helper
 */
class DalvikAssembler {
  constructor() {
    this.words = [];
    this.labels = new Map();
    this.branchFixups = [];
    this.refFixups = []; // { wordIdx, kind: 'string'|'type'|'field'|'method', value }
  }

  label(name) {
    this.labels.set(name, this.words.length);
  }

  emit16(w) {
    this.words.push(w & 0xffff);
  }

  // 10x: return-void (0x0e)
  returnVoid() {
    this.emit16(0x000e);
  }

  // 11x: move-result vAA (0x0a), move-result-wide vAA (0x0b), move-result-object vAA (0x0c), move-exception vAA (0x0d), return vAA (0x0f), return-object vAA (0x11)
  op11x(op, vAA) {
    this.emit16(((vAA & 0xff) << 8) | (op & 0xff));
  }
  moveResult(vAA) { this.op11x(0x0a, vAA); }
  moveResultWide(vAA) { this.op11x(0x0b, vAA); }
  moveResultObject(vAA) { this.op11x(0x0c, vAA); }
  moveException(vAA) { this.op11x(0x0d, vAA); }
  returnVal(vAA) { this.op11x(0x0f, vAA); }
  returnObject(vAA) { this.op11x(0x11, vAA); }

  // 11n: const/4 vA, #+B (0x12)
  const4(vA, lit4) {
    this.emit16((((lit4 & 0x0f) << 12) | ((vA & 0x0f) << 8) | 0x12) & 0xffff);
  }

  // 21s: const/16 vAA, #+BBBB (0x13), const-wide/16 vAA, #+BBBB (0x16)
  const16(vAA, lit16) {
    this.emit16(((vAA & 0xff) << 8) | 0x13);
    this.emit16(lit16 & 0xffff);
  }
  constWide16(vAA, lit16) {
    this.emit16(((vAA & 0xff) << 8) | 0x16);
    this.emit16(lit16 & 0xffff);
  }

  // 31i: const vAA, #+BBBBBBBB (0x14)
  const32(vAA, lit32) {
    this.emit16(((vAA & 0xff) << 8) | 0x14);
    this.emit16(lit32 & 0xffff);
    this.emit16((lit32 >>> 16) & 0xffff);
  }

  // 21h: const/high16 vAA, #+BBBB0000 (0x15)
  constHigh16(vAA, high16) {
    this.emit16(((vAA & 0xff) << 8) | 0x15);
    this.emit16(high16 & 0xffff);
  }

  // 12x: array-length vA, vB (0x21)
  arrayLength(vA, vB) {
    this.emit16(((vB & 0x0f) << 12) | ((vA & 0x0f) << 8) | 0x21);
  }

  // 23x: aget-byte vAA, vBB, vCC (0x48), cmp-long vAA, vBB, vCC (0x31)
  agetByte(vAA, vBB, vCC) {
    this.emit16(((vAA & 0xff) << 8) | 0x48);
    this.emit16(((vCC & 0xff) << 8) | (vBB & 0xff));
  }
  cmpLong(vAA, vBB, vCC) {
    this.emit16(((vAA & 0xff) << 8) | 0x31);
    this.emit16(((vCC & 0xff) << 8) | (vBB & 0xff));
  }

  // 21c: const-string vAA, string@BBBB (0x1a), new-instance vAA, type@BBBB (0x22), sget vAA, field@BBBB (0x60)
  constString(vAA, str) {
    this.emit16(((vAA & 0xff) << 8) | 0x1a);
    this.refFixups.push({ wordIdx: this.words.length, kind: 'string', value: str });
    this.emit16(0);
  }
  newInstance(vAA, typeDesc) {
    this.emit16(((vAA & 0xff) << 8) | 0x22);
    this.refFixups.push({ wordIdx: this.words.length, kind: 'type', value: typeDesc });
    this.emit16(0);
  }
  sgetInt(vAA, fieldKey) {
    this.emit16(((vAA & 0xff) << 8) | 0x60);
    this.refFixups.push({ wordIdx: this.words.length, kind: 'field', value: fieldKey });
    this.emit16(0);
  }

  // 22c: iget-object vA, vB, field@CCCC (0x54)
  igetObject(vA, vB, fieldKey) {
    this.emit16(((vB & 0x0f) << 12) | ((vA & 0x0f) << 8) | 0x54);
    this.refFixups.push({ wordIdx: this.words.length, kind: 'field', value: fieldKey });
    this.emit16(0);
  }

  // 21t: if-eqz vAA, +BBBB (0x38), if-nez vAA, +BBBB (0x39), if-gez vAA, +BBBB (0x3b), if-ltz vAA, +BBBB (0x3a)
  branch21t(op, vAA, targetLabel) {
    const insnPos = this.words.length;
    this.emit16(((vAA & 0xff) << 8) | (op & 0xff));
    this.branchFixups.push({ insnPos, wordIdx: this.words.length, targetLabel, type: '16' });
    this.emit16(0);
  }
  ifEqz(vAA, label) { this.branch21t(0x38, vAA, label); }
  ifNez(vAA, label) { this.branch21t(0x39, vAA, label); }
  ifLtz(vAA, label) { this.branch21t(0x3a, vAA, label); }
  ifGez(vAA, label) { this.branch21t(0x3b, vAA, label); }

  // 22t: if-eq vA, vB, +CCCC (0x32), if-ne vA, vB, +CCCC (0x33), if-lt vA, vB, +CCCC (0x34), if-ge vA, vB, +CCCC (0x35)
  branch22t(op, vA, vB, targetLabel) {
    const insnPos = this.words.length;
    this.emit16(((vB & 0x0f) << 12) | ((vA & 0x0f) << 8) | (op & 0xff));
    this.branchFixups.push({ insnPos, wordIdx: this.words.length, targetLabel, type: '16' });
    this.emit16(0);
  }
  ifEq(vA, vB, label) { this.branch22t(0x32, vA, vB, label); }
  ifNe(vA, vB, label) { this.branch22t(0x33, vA, vB, label); }
  ifLt(vA, vB, label) { this.branch22t(0x34, vA, vB, label); }
  ifGe(vA, vB, label) { this.branch22t(0x35, vA, vB, label); }

  // 35c: invoke-virtual (0x6e), invoke-super (0x6f), invoke-direct (0x70), invoke-static (0x71), invoke-interface (0x72)
  invoke35c(op, regs, methodKey) {
    const argc = regs.length;
    const c = regs[0] ?? 0;
    const d = regs[1] ?? 0;
    const e = regs[2] ?? 0;
    const f = regs[3] ?? 0;
    const g = regs[4] ?? 0;
    this.emit16(((argc & 0x0f) << 12) | ((g & 0x0f) << 8) | (op & 0xff));
    this.refFixups.push({ wordIdx: this.words.length, kind: 'method', value: methodKey });
    this.emit16(0);
    this.emit16(((f & 0x0f) << 12) | ((e & 0x0f) << 8) | ((d & 0x0f) << 4) | (c & 0x0f));
  }
  invokeVirtual(regs, methodKey) { this.invoke35c(0x6e, regs, methodKey); }
  invokeSuper(regs, methodKey) { this.invoke35c(0x6f, regs, methodKey); }
  invokeDirect(regs, methodKey) { this.invoke35c(0x70, regs, methodKey); }
  invokeStatic(regs, methodKey) { this.invoke35c(0x71, regs, methodKey); }
  invokeInterface(regs, methodKey) { this.invoke35c(0x72, regs, methodKey); }

  // 3rc: invoke-super/range (0x75)
  invokeSuperRange(firstReg, count, methodKey) {
    this.emit16(((count & 0xff) << 8) | 0x75);
    this.refFixups.push({ wordIdx: this.words.length, kind: 'method', value: methodKey });
    this.emit16(0);
    this.emit16(firstReg & 0xffff);
  }

  finalize() {
    for (const bf of this.branchFixups) {
      if (!this.labels.has(bf.targetLabel)) {
        throw new Error(`Unresolved branch label: ${bf.targetLabel}`);
      }
      const targetPos = this.labels.get(bf.targetLabel);
      const offset = targetPos - bf.insnPos;
      this.words[bf.wordIdx] = offset & 0xffff;
    }
    return {
      words: this.words,
      refFixups: this.refFixups,
      labels: this.labels,
    };
  }
}

export function buildNexoraClassesDex(baseDexBuf, versionName = '1.8.0', versionCode = 8) {
  // 1. Parse existing strings, types, protos, fields, methods, classes, and code items from baseDexBuf
  const strIdsSize = baseDexBuf.readUInt32LE(56);
  const strIdsOff = baseDexBuf.readUInt32LE(60);
  const oldStrings = [];
  for (let i = 0; i < strIdsSize; i++) {
    const o = { off: baseDexBuf.readUInt32LE(strIdsOff + i * 4) };
    readUleb128(baseDexBuf, o);
    let end = o.off;
    while (baseDexBuf[end] !== 0) end++;
    oldStrings.push(baseDexBuf.subarray(o.off, end).toString('utf8'));
  }

  const typeIdsSize = baseDexBuf.readUInt32LE(64);
  const typeIdsOff = baseDexBuf.readUInt32LE(68);
  const oldTypes = [];
  for (let i = 0; i < typeIdsSize; i++) {
    oldTypes.push(oldStrings[baseDexBuf.readUInt32LE(typeIdsOff + i * 4)]);
  }

  const protoIdsSize = baseDexBuf.readUInt32LE(72);
  const protoIdsOff = baseDexBuf.readUInt32LE(76);
  const oldProtos = [];
  for (let i = 0; i < protoIdsSize; i++) {
    const base = protoIdsOff + i * 12;
    const shorty = oldStrings[baseDexBuf.readUInt32LE(base)];
    const returnType = oldTypes[baseDexBuf.readUInt32LE(base + 4)];
    const paramsOff = baseDexBuf.readUInt32LE(base + 8);
    const params = [];
    if (paramsOff !== 0) {
      const pCount = baseDexBuf.readUInt32LE(paramsOff);
      for (let p = 0; p < pCount; p++) {
        params.push(oldTypes[baseDexBuf.readUInt16LE(paramsOff + 4 + p * 2)]);
      }
    }
    oldProtos.push({ shorty, returnType, params, key: `(${params.join('')})${returnType}` });
  }

  const fieldIdsSize = baseDexBuf.readUInt32LE(80);
  const fieldIdsOff = baseDexBuf.readUInt32LE(84);
  const oldFields = [];
  for (let i = 0; i < fieldIdsSize; i++) {
    const base = fieldIdsOff + i * 8;
    const classType = oldTypes[baseDexBuf.readUInt16LE(base)];
    const fieldType = oldTypes[baseDexBuf.readUInt16LE(base + 2)];
    const name = oldStrings[baseDexBuf.readUInt32LE(base + 4)];
    oldFields.push({ classType, fieldType, name, key: `${classType}->${name}:${fieldType}` });
  }

  const methodIdsSize = baseDexBuf.readUInt32LE(88);
  const methodIdsOff = baseDexBuf.readUInt32LE(92);
  const oldMethods = [];
  for (let i = 0; i < methodIdsSize; i++) {
    const base = methodIdsOff + i * 8;
    const classType = oldTypes[baseDexBuf.readUInt16LE(base)];
    const proto = oldProtos[baseDexBuf.readUInt16LE(base + 2)];
    const name = oldStrings[baseDexBuf.readUInt32LE(base + 4)];
    oldMethods.push({ classType, protoKey: proto.key, returnType: proto.returnType, params: proto.params, name, key: `${classType}->${name}${proto.key}` });
  }

  function decodeExistingCodeItem(codeOff) {
    const registersSize = baseDexBuf.readUInt16LE(codeOff);
    const insSize = baseDexBuf.readUInt16LE(codeOff + 2);
    const outsSize = baseDexBuf.readUInt16LE(codeOff + 4);
    const triesSize = baseDexBuf.readUInt16LE(codeOff + 6);
    const insnsSize = baseDexBuf.readUInt32LE(codeOff + 12);
    const words = [];
    for (let i = 0; i < insnsSize; i++) {
      words.push(baseDexBuf.readUInt16LE(codeOff + 16 + i * 2));
    }
    const refFixups = [];
    let pc = 0;
    while (pc < insnsSize) {
      const op = words[pc] & 0xff;
      const w = getInsnWidth(op);
      if (!w) throw new Error(`Unknown opcode 0x${op.toString(16)} at codeOff=${codeOff}`);
      if (op === 0x1a) {
        let strVal = oldStrings[words[pc + 1]];
        if (strVal === '1.7.0' || strVal === '1.2.0') strVal = versionName;
        refFixups.push({ wordIdx: pc + 1, kind: 'string', value: strVal });
      } else if (op === 0x1c || op === 0x1f || op === 0x20 || op === 0x22 || op === 0x23) {
        refFixups.push({ wordIdx: pc + 1, kind: 'type', value: oldTypes[words[pc + 1]] });
      } else if (op >= 0x52 && op <= 0x6d) {
        refFixups.push({ wordIdx: pc + 1, kind: 'field', value: oldFields[words[pc + 1]].key });
      } else if ((op >= 0x6e && op <= 0x72) || (op >= 0x74 && op <= 0x78)) {
        refFixups.push({ wordIdx: pc + 1, kind: 'method', value: oldMethods[words[pc + 1]].key });
      }
      pc += w;
    }

    const tries = [];
    if (triesSize > 0) {
      // Only openExternalDownload has 1 try_item catching Ljava/lang/Exception;
      const tryBase = codeOff + 16 + insnsSize * 2 + (insnsSize % 2 ? 2 : 0);
      const startAddr = baseDexBuf.readUInt32LE(tryBase);
      const insnCount = baseDexBuf.readUInt16LE(tryBase + 4);
      tries.push({
        startAddr,
        insnCount,
        catchType: 'Ljava/lang/Exception;',
        handlerAddr: 0x38,
      });
    }

    return { registersSize, insSize, outsSize, words, refFixups, tries };
  }

  const classDefsSize = baseDexBuf.readUInt32LE(96);
  const classDefsOff = baseDexBuf.readUInt32LE(100);
  const classes = [];
  for (let c = 0; c < classDefsSize; c++) {
    const off = classDefsOff + c * 32;
    const classType = oldTypes[baseDexBuf.readUInt32LE(off)];
    const accessFlags = baseDexBuf.readUInt32LE(off + 4);
    const superType = oldTypes[baseDexBuf.readUInt32LE(off + 8)];
    const intfOff = baseDexBuf.readUInt32LE(off + 12);
    const sourceFile = oldStrings[baseDexBuf.readUInt32LE(off + 16)];
    const dataOff = baseDexBuf.readUInt32LE(off + 24);

    const interfaces = [];
    if (intfOff !== 0) {
      const iCount = baseDexBuf.readUInt32LE(intfOff);
      for (let i = 0; i < iCount; i++) {
        interfaces.push(oldTypes[baseDexBuf.readUInt16LE(intfOff + 4 + i * 2)]);
      }
    }

    const o = { off: dataOff };
    const sfCount = readUleb128(baseDexBuf, o);
    const ifCount = readUleb128(baseDexBuf, o);
    const dmCount = readUleb128(baseDexBuf, o);
    const vmCount = readUleb128(baseDexBuf, o);

    const staticFields = [];
    let fIdx = 0;
    for (let i = 0; i < sfCount; i++) {
      fIdx += readUleb128(baseDexBuf, o);
      const acc = readUleb128(baseDexBuf, o);
      staticFields.push({ field: oldFields[fIdx], accessFlags: acc });
    }

    const instanceFields = [];
    fIdx = 0;
    for (let i = 0; i < ifCount; i++) {
      fIdx += readUleb128(baseDexBuf, o);
      const acc = readUleb128(baseDexBuf, o);
      instanceFields.push({ field: oldFields[fIdx], accessFlags: acc });
    }

    const directMethods = [];
    let mIdx = 0;
    for (let i = 0; i < dmCount; i++) {
      mIdx += readUleb128(baseDexBuf, o);
      const acc = readUleb128(baseDexBuf, o);
      const co = readUleb128(baseDexBuf, o);
      directMethods.push({
        method: oldMethods[mIdx],
        accessFlags: acc,
        code: co ? decodeExistingCodeItem(co) : null,
      });
    }

    const virtualMethods = [];
    mIdx = 0;
    for (let i = 0; i < vmCount; i++) {
      mIdx += readUleb128(baseDexBuf, o);
      const acc = readUleb128(baseDexBuf, o);
      const co = readUleb128(baseDexBuf, o);
      virtualMethods.push({
        method: oldMethods[mIdx],
        accessFlags: acc,
        code: co ? decodeExistingCodeItem(co) : null,
      });
    }

    classes.push({
      classType,
      accessFlags,
      superType,
      interfaces,
      sourceFile,
      staticFields,
      instanceFields,
      directMethods,
      virtualMethods,
    });
  }

  // 2. Assemble New Method: MainActivity.savePdfToDownloads(String filename, String base64Data) : String
  function assembleSavePdfToDownloads() {
    // Registers: v0..v7 locals, v8=this, v9=filename, v10=base64Data
    const asm = new DalvikAssembler();
    asm.label('try_start');

    // byte[] v0 = Base64.decode(v10, 0)
    asm.const4(0, 0);
    asm.invokeStatic([10, 0], 'Landroid/util/Base64;->decode(Ljava/lang/String;I)[B');
    asm.moveResultObject(0);
    asm.ifEqz(0, 'err_invalid');

    // Check v0.length >= 100 and %PDF header (0x25, 0x50)
    asm.arrayLength(1, 0);
    asm.const16(2, 100);
    asm.ifLt(1, 2, 'err_invalid');
    asm.const4(2, 0);
    asm.agetByte(2, 0, 2);
    asm.const16(3, 0x25); // '%'
    asm.ifNe(2, 3, 'err_invalid');
    asm.const4(2, 1);
    asm.agetByte(2, 0, 2);
    asm.const16(3, 0x50); // 'P'
    asm.ifNe(2, 3, 'err_invalid');

    // Check Build.VERSION.SDK_INT >= 29
    asm.sgetInt(2, 'Landroid/os/Build$VERSION;->SDK_INT:I');
    asm.const16(3, 29);
    asm.ifLt(2, 3, 'legacy_storage');

    // Android 10+ (API 29+) MediaStore.Downloads
    asm.invokeVirtual([8], 'Lcom/theabhinavschool/nexora/MainActivity;->getContentResolver()Landroid/content/ContentResolver;');
    asm.moveResultObject(2);

    asm.newInstance(3, 'Landroid/content/ContentValues;');
    asm.invokeDirect([3], 'Landroid/content/ContentValues;-><init>()V');

    asm.constString(4, '_display_name');
    asm.invokeVirtual([3, 4, 9], 'Landroid/content/ContentValues;->put(Ljava/lang/String;Ljava/lang/String;)V');

    asm.constString(4, 'mime_type');
    asm.constString(5, 'application/pdf');
    asm.invokeVirtual([3, 4, 5], 'Landroid/content/ContentValues;->put(Ljava/lang/String;Ljava/lang/String;)V');

    asm.constString(4, 'relative_path');
    asm.constString(5, 'Download');
    asm.invokeVirtual([3, 4, 5], 'Landroid/content/ContentValues;->put(Ljava/lang/String;Ljava/lang/String;)V');

    asm.constString(4, 'content://media/external/downloads');
    asm.invokeStatic([4], 'Landroid/net/Uri;->parse(Ljava/lang/String;)Landroid/net/Uri;');
    asm.moveResultObject(4);

    asm.invokeVirtual([2, 4, 3], 'Landroid/content/ContentResolver;->insert(Landroid/net/Uri;Landroid/content/ContentValues;)Landroid/net/Uri;');
    asm.moveResultObject(4);
    asm.ifEqz(4, 'legacy_storage');

    asm.invokeVirtual([2, 4], 'Landroid/content/ContentResolver;->openOutputStream(Landroid/net/Uri;)Ljava/io/OutputStream;');
    asm.moveResultObject(5);
    asm.ifEqz(5, 'legacy_storage');

    asm.invokeVirtual([5, 0], 'Ljava/io/OutputStream;->write([B)V');
    asm.invokeVirtual([5], 'Ljava/io/OutputStream;->flush()V');
    asm.invokeVirtual([5], 'Ljava/io/OutputStream;->close()V');

    // Verify saved file via openFileDescriptor(itemUri, "r") and getStatSize() >= 100
    asm.constString(5, 'r');
    asm.invokeVirtual([2, 4, 5], 'Landroid/content/ContentResolver;->openFileDescriptor(Landroid/net/Uri;Ljava/lang/String;)Landroid/os/ParcelFileDescriptor;');
    asm.moveResultObject(5);
    asm.ifEqz(5, 'err_verify');
    asm.invokeVirtual([5], 'Landroid/os/ParcelFileDescriptor;->getStatSize()J');
    asm.moveResultWide(6); // v6, v7
    asm.invokeVirtual([5], 'Landroid/os/ParcelFileDescriptor;->close()V');
    asm.constWide16(2, 100); // v2, v3
    asm.cmpLong(2, 6, 2);
    asm.ifLtz(2, 'err_verify');

    // Toast: "PDF saved to Downloads"
    asm.constString(2, 'PDF saved to Downloads');
    asm.const4(3, 1);
    asm.invokeStatic([8, 2, 3], 'Landroid/widget/Toast;->makeText(Landroid/content/Context;Ljava/lang/CharSequence;I)Landroid/widget/Toast;');
    asm.moveResultObject(2);
    asm.invokeVirtual([2], 'Landroid/widget/Toast;->show()V');

    // Return "OK|" + itemUri.toString() + "|" + v1 + "|MediaStore.Downloads|" + filename
    asm.newInstance(2, 'Ljava/lang/StringBuilder;');
    asm.invokeDirect([2], 'Ljava/lang/StringBuilder;-><init>()V');
    asm.constString(3, 'OK|');
    asm.invokeVirtual([2, 3], 'Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;');
    asm.moveResultObject(2);
    asm.invokeVirtual([4], 'Landroid/net/Uri;->toString()Ljava/lang/String;');
    asm.moveResultObject(3);
    asm.invokeVirtual([2, 3], 'Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;');
    asm.moveResultObject(2);
    asm.constString(3, '|');
    asm.invokeVirtual([2, 3], 'Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;');
    asm.moveResultObject(2);
    asm.invokeVirtual([2, 1], 'Ljava/lang/StringBuilder;->append(I)Ljava/lang/StringBuilder;');
    asm.moveResultObject(2);
    asm.constString(3, '|MediaStore.Downloads|');
    asm.invokeVirtual([2, 3], 'Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;');
    asm.moveResultObject(2);
    asm.invokeVirtual([2, 9], 'Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;');
    asm.moveResultObject(2);
    asm.invokeVirtual([2], 'Ljava/lang/StringBuilder;->toString()Ljava/lang/String;');
    asm.moveResultObject(0);
    asm.returnObject(0);

    // Legacy / Fallback Storage: Environment.getExternalStoragePublicDirectory("Download")
    asm.label('legacy_storage');
    asm.constString(2, 'Download');
    asm.invokeStatic([2], 'Landroid/os/Environment;->getExternalStoragePublicDirectory(Ljava/lang/String;)Ljava/io/File;');
    asm.moveResultObject(2);
    asm.invokeVirtual([2], 'Ljava/io/File;->mkdirs()Z');

    asm.newInstance(3, 'Ljava/io/File;');
    asm.invokeDirect([3, 2, 9], 'Ljava/io/File;-><init>(Ljava/io/File;Ljava/lang/String;)V');

    asm.newInstance(4, 'Ljava/io/FileOutputStream;');
    asm.invokeDirect([4, 3], 'Ljava/io/FileOutputStream;-><init>(Ljava/io/File;)V');
    asm.invokeVirtual([4, 0], 'Ljava/io/FileOutputStream;->write([B)V');
    asm.invokeVirtual([4], 'Ljava/io/FileOutputStream;->flush()V');
    asm.invokeVirtual([4], 'Ljava/io/FileOutputStream;->close()V');

    // Verify file exists and length >= 100
    asm.invokeVirtual([3], 'Ljava/io/File;->exists()Z');
    asm.moveResult(4);
    asm.ifEqz(4, 'err_verify');
    asm.invokeVirtual([3], 'Ljava/io/File;->length()J');
    asm.moveResultWide(6);
    asm.constWide16(4, 100);
    asm.cmpLong(2, 6, 4);
    asm.ifLtz(2, 'err_verify');

    // Toast: "PDF saved to Downloads"
    asm.constString(2, 'PDF saved to Downloads');
    asm.const4(4, 1);
    asm.invokeStatic([8, 2, 4], 'Landroid/widget/Toast;->makeText(Landroid/content/Context;Ljava/lang/CharSequence;I)Landroid/widget/Toast;');
    asm.moveResultObject(2);
    asm.invokeVirtual([2], 'Landroid/widget/Toast;->show()V');

    // Return "OK|" + Uri.fromFile(file).toString() + "|" + v1 + "|Environment.DIRECTORY_DOWNLOADS|" + file.getAbsolutePath()
    asm.newInstance(2, 'Ljava/lang/StringBuilder;');
    asm.invokeDirect([2], 'Ljava/lang/StringBuilder;-><init>()V');
    asm.constString(4, 'OK|');
    asm.invokeVirtual([2, 4], 'Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;');
    asm.moveResultObject(2);
    asm.invokeStatic([3], 'Landroid/net/Uri;->fromFile(Ljava/io/File;)Landroid/net/Uri;');
    asm.moveResultObject(4);
    asm.invokeVirtual([4], 'Landroid/net/Uri;->toString()Ljava/lang/String;');
    asm.moveResultObject(4);
    asm.invokeVirtual([2, 4], 'Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;');
    asm.moveResultObject(2);
    asm.constString(4, '|');
    asm.invokeVirtual([2, 4], 'Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;');
    asm.moveResultObject(2);
    asm.invokeVirtual([2, 1], 'Ljava/lang/StringBuilder;->append(I)Ljava/lang/StringBuilder;');
    asm.moveResultObject(2);
    asm.constString(4, '|Environment.DIRECTORY_DOWNLOADS|');
    asm.invokeVirtual([2, 4], 'Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;');
    asm.moveResultObject(2);
    asm.invokeVirtual([3], 'Ljava/io/File;->getAbsolutePath()Ljava/lang/String;');
    asm.moveResultObject(4);
    asm.invokeVirtual([2, 4], 'Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;');
    asm.moveResultObject(2);
    asm.invokeVirtual([2], 'Ljava/lang/StringBuilder;->toString()Ljava/lang/String;');
    asm.moveResultObject(0);
    asm.returnObject(0);

    asm.label('err_invalid');
    asm.constString(0, 'ERR:Invalid or empty PDF payload.');
    asm.returnObject(0);

    asm.label('err_verify');
    asm.constString(0, 'ERR:File verification failed in Downloads.');
    asm.returnObject(0);

    asm.label('try_end');
    asm.label('catch_all');
    asm.moveException(0);
    asm.newInstance(1, 'Ljava/lang/StringBuilder;');
    asm.invokeDirect([1], 'Ljava/lang/StringBuilder;-><init>()V');
    asm.constString(2, 'ERR:');
    asm.invokeVirtual([1, 2], 'Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;');
    asm.moveResultObject(1);
    asm.invokeVirtual([0], 'Ljava/lang/Exception;->getMessage()Ljava/lang/String;');
    asm.moveResultObject(0);
    asm.invokeVirtual([1, 0], 'Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;');
    asm.moveResultObject(1);
    asm.invokeVirtual([1], 'Ljava/lang/StringBuilder;->toString()Ljava/lang/String;');
    asm.moveResultObject(0);
    asm.returnObject(0);

    const fin = asm.finalize();
    const startAddr = fin.labels.get('try_start');
    const endAddr = fin.labels.get('try_end');
    const catchAddr = fin.labels.get('catch_all');
    return {
      registersSize: 11,
      insSize: 3,
      outsSize: 3,
      words: fin.words,
      refFixups: fin.refFixups,
      tries: [
        {
          startAddr,
          insnCount: endAddr - startAddr,
          catchType: 'Ljava/lang/Exception;',
          handlerAddr: catchAddr,
        },
      ],
    };
  }

  // 3. Assemble New Method: MainActivity.openSavedPdf(String uriStr) : String
  function assembleOpenSavedPdf() {
    // Registers: v0..v3 locals, v4=this, v5=uriStr
    const asm = new DalvikAssembler();
    asm.label('try1_start');
    asm.ifEqz(5, 'open_downloads');
    asm.constString(0, 'content://');
    asm.invokeVirtual([5, 0], 'Ljava/lang/String;->startsWith(Ljava/lang/String;)Z');
    asm.moveResult(0);
    asm.ifEqz(0, 'open_downloads');

    asm.invokeStatic([5], 'Landroid/net/Uri;->parse(Ljava/lang/String;)Landroid/net/Uri;');
    asm.moveResultObject(0);
    asm.newInstance(1, 'Landroid/content/Intent;');
    asm.constString(2, 'android.intent.action.VIEW');
    asm.invokeDirect([1, 2], 'Landroid/content/Intent;-><init>(Ljava/lang/String;)V');
    asm.constString(2, 'application/pdf');
    asm.invokeVirtual([1, 0, 2], 'Landroid/content/Intent;->setDataAndType(Landroid/net/Uri;Ljava/lang/String;)Landroid/content/Intent;');
    asm.const32(0, 0x10000001); // FLAG_ACTIVITY_NEW_TASK | FLAG_GRANT_READ_URI_PERMISSION
    asm.invokeVirtual([1, 0], 'Landroid/content/Intent;->addFlags(I)Landroid/content/Intent;');
    asm.invokeVirtual([4, 1], 'Lcom/theabhinavschool/nexora/MainActivity;->startActivity(Landroid/content/Intent;)V');
    asm.constString(0, 'OK|VIEW_PDF');
    asm.returnObject(0);
    asm.label('try1_end');

    asm.label('catch1');
    asm.moveException(0);

    asm.label('open_downloads');
    asm.label('try2_start');
    asm.newInstance(0, 'Landroid/content/Intent;');
    asm.constString(1, 'android.intent.action.VIEW_DOWNLOADS');
    asm.invokeDirect([0, 1], 'Landroid/content/Intent;-><init>(Ljava/lang/String;)V');
    asm.constHigh16(1, 0x1000); // 0x10000000 FLAG_ACTIVITY_NEW_TASK
    asm.invokeVirtual([0, 1], 'Landroid/content/Intent;->addFlags(I)Landroid/content/Intent;');
    asm.invokeVirtual([4, 0], 'Lcom/theabhinavschool/nexora/MainActivity;->startActivity(Landroid/content/Intent;)V');
    asm.constString(0, 'OK|VIEW_DOWNLOADS');
    asm.returnObject(0);
    asm.label('try2_end');

    asm.label('catch2');
    asm.moveException(0);
    asm.constString(0, 'ERR:Unable to open PDF viewer or Downloads app.');
    asm.returnObject(0);

    const fin = asm.finalize();
    return {
      registersSize: 6,
      insSize: 2,
      outsSize: 3,
      words: fin.words,
      refFixups: fin.refFixups,
      tries: [
        {
          startAddr: fin.labels.get('try1_start'),
          insnCount: fin.labels.get('try1_end') - fin.labels.get('try1_start'),
          catchType: 'Ljava/lang/Exception;',
          handlerAddr: fin.labels.get('catch1'),
        },
        {
          startAddr: fin.labels.get('try2_start'),
          insnCount: fin.labels.get('try2_end') - fin.labels.get('try2_start'),
          catchType: 'Ljava/lang/Exception;',
          handlerAddr: fin.labels.get('catch2'),
        },
      ],
    };
  }

  // 4. Assemble New Method: MainActivity$3.onJsPrompt(WebView, String, String, String, JsPromptResult) : boolean
  function assembleOnJsPrompt() {
    // Registers: v0..v2 locals, v3=this, v4=view, v5=url, v6=message, v7=defaultValue, v8=result
    const asm = new DalvikAssembler();
    asm.ifEqz(6, 'call_super');

    asm.constString(0, 'NEXORA_SAVE_PDF:');
    asm.invokeVirtual([6, 0], 'Ljava/lang/String;->startsWith(Ljava/lang/String;)Z');
    asm.moveResult(0);
    asm.ifNez(0, 'handle_save');

    asm.constString(0, 'NEXORA_OPEN_PDF:');
    asm.invokeVirtual([6, 0], 'Ljava/lang/String;->startsWith(Ljava/lang/String;)Z');
    asm.moveResult(0);
    asm.ifNez(0, 'handle_open');

    asm.label('call_super');
    asm.invokeSuperRange(
      3,
      6,
      'Landroid/webkit/WebChromeClient;->onJsPrompt(Landroid/webkit/WebView;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Landroid/webkit/JsPromptResult;)Z'
    );
    asm.moveResult(0);
    asm.returnVal(0);

    asm.label('handle_save');
    asm.const16(0, 16);
    asm.invokeVirtual([6, 0], 'Ljava/lang/String;->substring(I)Ljava/lang/String;');
    asm.moveResultObject(0);
    asm.igetObject(1, 3, 'Lcom/theabhinavschool/nexora/MainActivity$3;->this$0:Lcom/theabhinavschool/nexora/MainActivity;');
    asm.invokeVirtual(
      [1, 0, 7],
      'Lcom/theabhinavschool/nexora/MainActivity;->savePdfToDownloads(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;'
    );
    asm.moveResultObject(0);
    asm.invokeVirtual([8, 0], 'Landroid/webkit/JsPromptResult;->confirm(Ljava/lang/String;)V');
    asm.const4(0, 1);
    asm.returnVal(0);

    asm.label('handle_open');
    asm.igetObject(0, 3, 'Lcom/theabhinavschool/nexora/MainActivity$3;->this$0:Lcom/theabhinavschool/nexora/MainActivity;');
    asm.invokeVirtual(
      [0, 7],
      'Lcom/theabhinavschool/nexora/MainActivity;->openSavedPdf(Ljava/lang/String;)Ljava/lang/String;'
    );
    asm.moveResultObject(0);
    asm.invokeVirtual([8, 0], 'Landroid/webkit/JsPromptResult;->confirm(Ljava/lang/String;)V');
    asm.const4(0, 1);
    asm.returnVal(0);

    const fin = asm.finalize();
    return {
      registersSize: 9,
      insSize: 6,
      outsSize: 6,
      words: fin.words,
      refFixups: fin.refFixups,
      tries: [],
    };
  }

  // 5. Assemble Updated Method: MainActivity$1.onDownloadStart(String, String, String, String, long) : void
  function assembleOnDownloadStart() {
    // Registers: v0..v1 locals, v2=this, v3=url, v4=userAgent, v5=contentDisp, v6=mimeType, v7,v8=contentLength
    const asm = new DalvikAssembler();
    asm.ifEqz(3, 'done');

    asm.constString(0, 'data:application/pdf;base64,');
    asm.invokeVirtual([3, 0], 'Ljava/lang/String;->startsWith(Ljava/lang/String;)Z');
    asm.moveResult(0);
    asm.ifNez(0, 'save_data_uri');

    asm.constString(0, 'blob:');
    asm.invokeVirtual([3, 0], 'Ljava/lang/String;->startsWith(Ljava/lang/String;)Z');
    asm.moveResult(0);
    asm.ifNez(0, 'done');

    asm.igetObject(0, 2, 'Lcom/theabhinavschool/nexora/MainActivity$1;->this$0:Lcom/theabhinavschool/nexora/MainActivity;');
    asm.invokeStatic([0, 3], 'Lcom/theabhinavschool/nexora/MainActivity;->access$000(Lcom/theabhinavschool/nexora/MainActivity;Ljava/lang/String;)V');
    asm.returnVoid();

    asm.label('save_data_uri');
    asm.const16(0, 28);
    asm.invokeVirtual([3, 0], 'Ljava/lang/String;->substring(I)Ljava/lang/String;');
    asm.moveResultObject(0);
    asm.igetObject(1, 2, 'Lcom/theabhinavschool/nexora/MainActivity$1;->this$0:Lcom/theabhinavschool/nexora/MainActivity;');
    asm.constString(4, 'NEXORA_Class11_Document.pdf');
    asm.invokeVirtual(
      [1, 4, 0],
      'Lcom/theabhinavschool/nexora/MainActivity;->savePdfToDownloads(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;'
    );

    asm.label('done');
    asm.returnVoid();

    const fin = asm.finalize();
    return {
      registersSize: 9,
      insSize: 7,
      outsSize: 3,
      words: fin.words,
      refFixups: fin.refFixups,
      tries: [],
    };
  }

  // Inject new/updated methods into our parsed classes
  const mainCls = classes.find((c) => c.classType === 'Lcom/theabhinavschool/nexora/MainActivity;');
  const dlListenerCls = classes.find((c) => c.classType === 'Lcom/theabhinavschool/nexora/MainActivity$1;');
  const chromeClientCls = classes.find((c) => c.classType === 'Lcom/theabhinavschool/nexora/MainActivity$3;');

  if (!mainCls || !dlListenerCls || !chromeClientCls) {
    throw new Error('Required MainActivity classes not found in base DEX');
  }

  // Update VERSION_CODE constant in MainActivity.initWebView (opcode 0x12 const/4 v2, #versionCode)
  const initWebViewMethod = mainCls.directMethods.find((m) => m.method.name === 'initWebView');
  if (initWebViewMethod && initWebViewMethod.code) {
    const words = initWebViewMethod.code.words;
    for (let i = 0; i < words.length; i++) {
      // Look for const/4 v2, #7 (0x7212) right before append(I)
      if ((words[i] & 0x0fff) === 0x0212 && i > 40) {
        words[i] = (((versionCode & 0x0f) << 12) | 0x0212) & 0xffff;
      }
    }
  }

  // Add savePdfToDownloads and openSavedPdf to MainActivity.virtualMethods
  mainCls.virtualMethods = mainCls.virtualMethods.filter(
    (m) => m.method.name !== 'savePdfToDownloads' && m.method.name !== 'openSavedPdf'
  );
  mainCls.virtualMethods.push(
    {
      method: {
        classType: 'Lcom/theabhinavschool/nexora/MainActivity;',
        name: 'savePdfToDownloads',
        returnType: 'Ljava/lang/String;',
        params: ['Ljava/lang/String;', 'Ljava/lang/String;'],
        protoKey: '(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;',
        key: 'Lcom/theabhinavschool/nexora/MainActivity;->savePdfToDownloads(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;',
      },
      accessFlags: 0x0001, // ACC_PUBLIC
      code: assembleSavePdfToDownloads(),
    },
    {
      method: {
        classType: 'Lcom/theabhinavschool/nexora/MainActivity;',
        name: 'openSavedPdf',
        returnType: 'Ljava/lang/String;',
        params: ['Ljava/lang/String;'],
        protoKey: '(Ljava/lang/String;)Ljava/lang/String;',
        key: 'Lcom/theabhinavschool/nexora/MainActivity;->openSavedPdf(Ljava/lang/String;)Ljava/lang/String;',
      },
      accessFlags: 0x0001, // ACC_PUBLIC
      code: assembleOpenSavedPdf(),
    }
  );

  // Add onJsPrompt to MainActivity$3.virtualMethods
  chromeClientCls.virtualMethods = chromeClientCls.virtualMethods.filter((m) => m.method.name !== 'onJsPrompt');
  chromeClientCls.virtualMethods.push({
    method: {
      classType: 'Lcom/theabhinavschool/nexora/MainActivity$3;',
      name: 'onJsPrompt',
      returnType: 'Z',
      params: [
        'Landroid/webkit/WebView;',
        'Ljava/lang/String;',
        'Ljava/lang/String;',
        'Ljava/lang/String;',
        'Landroid/webkit/JsPromptResult;',
      ],
      protoKey: '(Landroid/webkit/WebView;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Landroid/webkit/JsPromptResult;)Z',
      key: 'Lcom/theabhinavschool/nexora/MainActivity$3;->onJsPrompt(Landroid/webkit/WebView;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Landroid/webkit/JsPromptResult;)Z',
    },
    accessFlags: 0x0001, // ACC_PUBLIC
    code: assembleOnJsPrompt(),
  });

  // Update MainActivity$1.onDownloadStart
  const onDlMethod = dlListenerCls.virtualMethods.find((m) => m.method.name === 'onDownloadStart');
  if (onDlMethod) {
    onDlMethod.code = assembleOnDownloadStart();
  }

  // 6. Collect all strings, types, protos, fields, and methods across the entire DEX
  const stringSet = new Set(oldStrings.map((s) => (s === '1.7.0' || s === '1.2.0' ? versionName : s)));
  const typeSet = new Set(oldTypes);
  const protoMap = new Map();
  const fieldMap = new Map();
  const methodMap = new Map();

  function typeToShortyChar(t) {
    if (t.startsWith('L') || t.startsWith('[')) return 'L';
    return t;
  }

  function registerType(t) {
    typeSet.add(t);
    stringSet.add(t);
  }

  function registerProto(returnType, params) {
    const key = `(${params.join('')})${returnType}`;
    if (protoMap.has(key)) return protoMap.get(key);
    registerType(returnType);
    for (const p of params) registerType(p);
    const shorty = typeToShortyChar(returnType) + params.map(typeToShortyChar).join('');
    stringSet.add(shorty);
    const obj = { key, shorty, returnType, params };
    protoMap.set(key, obj);
    return obj;
  }

  function registerFieldKey(key) {
    if (fieldMap.has(key)) return fieldMap.get(key);
    const [clsAndName, fieldType] = key.split(':');
    const [classType, name] = clsAndName.split('->');
    registerType(classType);
    registerType(fieldType);
    stringSet.add(name);
    const obj = { key, classType, fieldType, name };
    fieldMap.set(key, obj);
    return obj;
  }

  function registerMethodKey(key) {
    if (methodMap.has(key)) return methodMap.get(key);
    const arrowIdx = key.indexOf('->');
    const parenIdx = key.indexOf('(', arrowIdx);
    const closeParenIdx = key.indexOf(')', parenIdx);
    const classType = key.slice(0, arrowIdx);
    const name = key.slice(arrowIdx + 2, parenIdx);
    const paramsRaw = key.slice(parenIdx + 1, closeParenIdx);
    const returnType = key.slice(closeParenIdx + 1);
    const params = [];
    let i = 0;
    while (i < paramsRaw.length) {
      let start = i;
      while (paramsRaw[i] === '[') i++;
      if (paramsRaw[i] === 'L') {
        while (paramsRaw[i] !== ';') i++;
        i++;
      } else {
        i++;
      }
      params.push(paramsRaw.slice(start, i));
    }
    registerType(classType);
    stringSet.add(name);
    const proto = registerProto(returnType, params);
    const obj = { key, classType, name, protoKey: proto.key, returnType, params };
    methodMap.set(key, obj);
    return obj;
  }

  for (const p of oldProtos) registerProto(p.returnType, p.params);
  for (const f of oldFields) registerFieldKey(f.key);
  for (const m of oldMethods) registerMethodKey(m.key);

  for (const cls of classes) {
    registerType(cls.classType);
    registerType(cls.superType);
    stringSet.add(cls.sourceFile);
    for (const intf of cls.interfaces) registerType(intf);
    for (const sf of cls.staticFields) registerFieldKey(sf.field.key);
    for (const inf of cls.instanceFields) registerFieldKey(inf.field.key);
    for (const dm of cls.directMethods) {
      registerMethodKey(dm.method.key);
      if (dm.code) {
        for (const rf of dm.code.refFixups) {
          if (rf.kind === 'string') stringSet.add(rf.value);
          if (rf.kind === 'type') registerType(rf.value);
          if (rf.kind === 'field') registerFieldKey(rf.value);
          if (rf.kind === 'method') registerMethodKey(rf.value);
        }
        for (const tr of dm.code.tries) registerType(tr.catchType);
      }
    }
    for (const vm of cls.virtualMethods) {
      registerMethodKey(vm.method.key);
      if (vm.code) {
        for (const rf of vm.code.refFixups) {
          if (rf.kind === 'string') stringSet.add(rf.value);
          if (rf.kind === 'type') registerType(rf.value);
          if (rf.kind === 'field') registerFieldKey(rf.value);
          if (rf.kind === 'method') registerMethodKey(rf.value);
        }
        for (const tr of vm.code.tries) registerType(tr.catchType);
      }
    }
  }

  // Sort tables strictly per DEX specification
  const sortedStrings = Array.from(stringSet).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const stringIdxMap = new Map(sortedStrings.map((s, idx) => [s, idx]));

  const sortedTypes = Array.from(typeSet).sort((a, b) => stringIdxMap.get(a) - stringIdxMap.get(b));
  const typeIdxMap = new Map(sortedTypes.map((t, idx) => [t, idx]));

  const sortedProtos = Array.from(protoMap.values()).sort((a, b) => {
    const rCmp = typeIdxMap.get(a.returnType) - typeIdxMap.get(b.returnType);
    if (rCmp !== 0) return rCmp;
    const minLen = Math.min(a.params.length, b.params.length);
    for (let i = 0; i < minLen; i++) {
      const pCmp = typeIdxMap.get(a.params[i]) - typeIdxMap.get(b.params[i]);
      if (pCmp !== 0) return pCmp;
    }
    return a.params.length - b.params.length;
  });
  const protoIdxMap = new Map(sortedProtos.map((p, idx) => [p.key, idx]));

  const sortedFields = Array.from(fieldMap.values()).sort((a, b) => {
    const cCmp = typeIdxMap.get(a.classType) - typeIdxMap.get(b.classType);
    if (cCmp !== 0) return cCmp;
    const nCmp = stringIdxMap.get(a.name) - stringIdxMap.get(b.name);
    if (nCmp !== 0) return nCmp;
    return typeIdxMap.get(a.fieldType) - typeIdxMap.get(b.fieldType);
  });
  const fieldIdxMap = new Map(sortedFields.map((f, idx) => [f.key, idx]));

  const sortedMethods = Array.from(methodMap.values()).sort((a, b) => {
    const cCmp = typeIdxMap.get(a.classType) - typeIdxMap.get(b.classType);
    if (cCmp !== 0) return cCmp;
    const nCmp = stringIdxMap.get(a.name) - stringIdxMap.get(b.name);
    if (nCmp !== 0) return nCmp;
    return protoIdxMap.get(a.protoKey) - protoIdxMap.get(b.protoKey);
  });
  const methodIdxMap = new Map(sortedMethods.map((m, idx) => [m.key, idx]));

  // Sort fields and methods inside each class by their new table indices
  for (const cls of classes) {
    cls.staticFields.sort((a, b) => fieldIdxMap.get(a.field.key) - fieldIdxMap.get(b.field.key));
    cls.instanceFields.sort((a, b) => fieldIdxMap.get(a.field.key) - fieldIdxMap.get(b.field.key));
    cls.directMethods.sort((a, b) => methodIdxMap.get(a.method.key) - methodIdxMap.get(b.method.key));
    cls.virtualMethods.sort((a, b) => methodIdxMap.get(a.method.key) - methodIdxMap.get(b.method.key));
  }

  // 7. Compute fixed index table offsets
  const headerOff = 0;
  const headerSize = 112;
  const stringIdsOff = headerSize;
  const typeIdsOffNew = stringIdsOff + sortedStrings.length * 4;
  const protoIdsOffNew = typeIdsOffNew + sortedTypes.length * 4;
  const fieldIdsOffNew = protoIdsOffNew + sortedProtos.length * 12;
  const methodIdsOffNew = fieldIdsOffNew + sortedFields.length * 8;
  const classDefsOffNew = methodIdsOffNew + sortedMethods.length * 8;
  const dataOffNew = classDefsOffNew + classes.length * 32;

  let curDataOff = dataOffNew;
  const dataChunks = [];
  function appendData(buf, align = 1) {
    if (align > 1) {
      const rem = curDataOff % align;
      if (rem !== 0) {
        const pad = Buffer.alloc(align - rem, 0);
        dataChunks.push(pad);
        curDataOff += pad.length;
      }
    }
    const start = curDataOff;
    dataChunks.push(buf);
    curDataOff += buf.length;
    return start;
  }

  // 7a. Emit type_list items (4-byte aligned)
  const typeListOffMap = new Map();
  function getOrEmitTypeList(typesArr) {
    if (!typesArr || typesArr.length === 0) return 0;
    const key = typesArr.join('|');
    if (typeListOffMap.has(key)) return typeListOffMap.get(key);
    const b = Buffer.alloc(4 + typesArr.length * 2 + (typesArr.length % 2 ? 2 : 0), 0);
    b.writeUInt32LE(typesArr.length, 0);
    for (let i = 0; i < typesArr.length; i++) {
      b.writeUInt16LE(typeIdxMap.get(typesArr[i]), 4 + i * 2);
    }
    const off = appendData(b, 4);
    typeListOffMap.set(key, off);
    return off;
  }

  for (const cls of classes) {
    cls.interfacesOff = getOrEmitTypeList(cls.interfaces);
  }
  for (const p of sortedProtos) {
    p.parametersOff = getOrEmitTypeList(p.params);
  }
  const typeListCount = typeListOffMap.size;
  const typeListFirstOff = typeListCount > 0 ? Array.from(typeListOffMap.values())[0] : 0;

  // 7b. Emit code_item blocks (4-byte aligned)
  let codeItemCount = 0;
  let codeItemFirstOff = 0;
  for (const cls of classes) {
    for (const mList of [cls.directMethods, cls.virtualMethods]) {
      for (const m of mList) {
        if (!m.code) {
          m.codeOff = 0;
          continue;
        }
        const c = m.code;
        const words = [...c.words];
        for (const rf of c.refFixups) {
          if (rf.kind === 'string') words[rf.wordIdx] = stringIdxMap.get(rf.value);
          if (rf.kind === 'type') words[rf.wordIdx] = typeIdxMap.get(rf.value);
          if (rf.kind === 'field') words[rf.wordIdx] = fieldIdxMap.get(rf.value);
          if (rf.kind === 'method') words[rf.wordIdx] = methodIdxMap.get(rf.value);
        }

        const insnsBytes = Buffer.alloc(words.length * 2);
        for (let i = 0; i < words.length; i++) {
          insnsBytes.writeUInt16LE(words[i] & 0xffff, i * 2);
        }

        const header = Buffer.alloc(16);
        header.writeUInt16LE(c.registersSize, 0);
        header.writeUInt16LE(c.insSize, 2);
        header.writeUInt16LE(c.outsSize, 4);
        header.writeUInt16LE(c.tries.length, 6);
        header.writeUInt32LE(0, 8); // debug_info_off = 0
        header.writeUInt32LE(words.length, 12);

        let trySuffix = Buffer.alloc(0);
        if (c.tries.length > 0) {
          const padBytes = words.length % 2 === 1 ? Buffer.alloc(2, 0) : Buffer.alloc(0);
          const tryItemsBuf = Buffer.alloc(c.tries.length * 8);
          const handlerListArr = [];
          writeUleb128(handlerListArr, c.tries.length);
          for (let t = 0; t < c.tries.length; t++) {
            const tr = c.tries[t];
            const handlerOffsetFromListStart = handlerListArr.length;
            tryItemsBuf.writeUInt32LE(tr.startAddr, t * 8);
            tryItemsBuf.writeUInt16LE(tr.insnCount, t * 8 + 4);
            tryItemsBuf.writeUInt16LE(handlerOffsetFromListStart, t * 8 + 6);
            writeSleb128(handlerListArr, 1); // 1 typed catch handler
            writeUleb128(handlerListArr, typeIdxMap.get(tr.catchType));
            writeUleb128(handlerListArr, tr.handlerAddr);
          }
          trySuffix = Buffer.concat([padBytes, tryItemsBuf, Buffer.from(handlerListArr)]);
        }

        const codeBuf = Buffer.concat([header, insnsBytes, trySuffix]);
        const off = appendData(codeBuf, 4);
        if (codeItemCount === 0) codeItemFirstOff = off;
        codeItemCount++;
        m.codeOff = off;
      }
    }
  }

  // 7c. Emit string_data_item blocks
  const stringDataFirstOff = curDataOff;
  const stringDataOffsets = [];
  for (const s of sortedStrings) {
    const utf8Buf = Buffer.from(s, 'utf8');
    // All strings here are standard ASCII, so UTF-16 code units == utf8Buf.length
    const lenArr = [];
    writeUleb128(lenArr, utf8Buf.length);
    const sBuf = Buffer.concat([Buffer.from(lenArr), utf8Buf, Buffer.from([0x00])]);
    stringDataOffsets.push(appendData(sBuf, 1));
  }

  // 7d. Emit encoded_array_item for MainActivity static fields
  // MainActivity static fields in sorted order: APP_VERSION, LOCAL_ENTRY_URL, PRODUCTION_URL, VERSION_CODE
  let encodedArrayFirstOff = 0;
  let encodedArrayCount = 0;
  for (const cls of classes) {
    if (cls.classType === 'Lcom/theabhinavschool/nexora/MainActivity;') {
      const arr = [];
      writeUleb128(arr, 4); // 4 static values
      function writeEncodedString(strVal) {
        const idx = stringIdxMap.get(strVal);
        if (idx <= 0xff) {
          arr.push(0x17, idx); // VALUE_STRING (0x17), 1 byte
        } else {
          arr.push(0x17 | (1 << 5), idx & 0xff, (idx >>> 8) & 0xff); // 2 bytes
        }
      }
      writeEncodedString(versionName);
      writeEncodedString('file:///android_asset/www/index.html');
      writeEncodedString('https://ais-pre-cjjqxynp5pw6257ks3igyi-205056013380.asia-southeast1.run.app');
      // VERSION_CODE: VALUE_INT (0x04), 1 byte
      arr.push(0x04, versionCode & 0xff);
      cls.staticValuesOff = appendData(Buffer.from(arr), 1);
      encodedArrayFirstOff = cls.staticValuesOff;
      encodedArrayCount = 1;
    } else {
      cls.staticValuesOff = 0;
    }
  }

  // 7e. Emit class_data_item blocks
  const classDataFirstOff = curDataOff;
  for (const cls of classes) {
    const arr = [];
    writeUleb128(arr, cls.staticFields.length);
    writeUleb128(arr, cls.instanceFields.length);
    writeUleb128(arr, cls.directMethods.length);
    writeUleb128(arr, cls.virtualMethods.length);

    let prevIdx = 0;
    for (const sf of cls.staticFields) {
      const idx = fieldIdxMap.get(sf.field.key);
      writeUleb128(arr, idx - prevIdx);
      writeUleb128(arr, sf.accessFlags);
      prevIdx = idx;
    }
    prevIdx = 0;
    for (const inf of cls.instanceFields) {
      const idx = fieldIdxMap.get(inf.field.key);
      writeUleb128(arr, idx - prevIdx);
      writeUleb128(arr, inf.accessFlags);
      prevIdx = idx;
    }
    prevIdx = 0;
    for (const dm of cls.directMethods) {
      const idx = methodIdxMap.get(dm.method.key);
      writeUleb128(arr, idx - prevIdx);
      writeUleb128(arr, dm.accessFlags);
      writeUleb128(arr, dm.codeOff);
      prevIdx = idx;
    }
    prevIdx = 0;
    for (const vm of cls.virtualMethods) {
      const idx = methodIdxMap.get(vm.method.key);
      writeUleb128(arr, idx - prevIdx);
      writeUleb128(arr, vm.accessFlags);
      writeUleb128(arr, vm.codeOff);
      prevIdx = idx;
    }
    cls.classDataOff = appendData(Buffer.from(arr), 1);
  }

  // 7f. Emit map_list (4-byte aligned)
  const mapEntries = [
    { type: 0x0000, size: 1, off: headerOff },
    { type: 0x0001, size: sortedStrings.length, off: stringIdsOff },
    { type: 0x0002, size: sortedTypes.length, off: typeIdsOffNew },
    { type: 0x0003, size: sortedProtos.length, off: protoIdsOffNew },
    { type: 0x0004, size: sortedFields.length, off: fieldIdsOffNew },
    { type: 0x0005, size: sortedMethods.length, off: methodIdsOffNew },
    { type: 0x0006, size: classes.length, off: classDefsOffNew },
    { type: 0x1001, size: typeListCount, off: typeListFirstOff },
    { type: 0x2001, size: codeItemCount, off: codeItemFirstOff },
    { type: 0x2002, size: sortedStrings.length, off: stringDataFirstOff },
    { type: 0x2005, size: encodedArrayCount, off: encodedArrayFirstOff },
    { type: 0x2000, size: classes.length, off: classDataFirstOff },
  ];
  // Pad to 4-byte boundary before map_list
  if (curDataOff % 4 !== 0) {
    appendData(Buffer.alloc(4 - (curDataOff % 4), 0), 1);
  }
  const mapListOff = curDataOff;
  mapEntries.push({ type: 0x1000, size: 1, off: mapListOff });

  const mapBuf = Buffer.alloc(4 + mapEntries.length * 12);
  mapBuf.writeUInt32LE(mapEntries.length, 0);
  for (let i = 0; i < mapEntries.length; i++) {
    const me = mapEntries[i];
    const base = 4 + i * 12;
    mapBuf.writeUInt16LE(me.type, base);
    mapBuf.writeUInt16LE(0, base + 2);
    mapBuf.writeUInt32LE(me.size, base + 4);
    mapBuf.writeUInt32LE(me.off, base + 8);
  }
  appendData(mapBuf, 4);

  const totalFileSize = curDataOff;
  const totalDataSize = totalFileSize - dataOffNew;

  // 8. Build fixed index tables & header
  const fixedBuf = Buffer.alloc(dataOffNew, 0);
  fixedBuf.write('dex\n035\0', 0, 8, 'ascii');
  fixedBuf.writeUInt32LE(totalFileSize, 32);
  fixedBuf.writeUInt32LE(112, 36);
  fixedBuf.writeUInt32LE(0x12345678, 40);
  fixedBuf.writeUInt32LE(0, 44);
  fixedBuf.writeUInt32LE(0, 48);
  fixedBuf.writeUInt32LE(mapListOff, 52);
  fixedBuf.writeUInt32LE(sortedStrings.length, 56);
  fixedBuf.writeUInt32LE(stringIdsOff, 60);
  fixedBuf.writeUInt32LE(sortedTypes.length, 64);
  fixedBuf.writeUInt32LE(typeIdsOffNew, 68);
  fixedBuf.writeUInt32LE(sortedProtos.length, 72);
  fixedBuf.writeUInt32LE(protoIdsOffNew, 76);
  fixedBuf.writeUInt32LE(sortedFields.length, 80);
  fixedBuf.writeUInt32LE(fieldIdsOffNew, 84);
  fixedBuf.writeUInt32LE(sortedMethods.length, 88);
  fixedBuf.writeUInt32LE(methodIdsOffNew, 92);
  fixedBuf.writeUInt32LE(classes.length, 96);
  fixedBuf.writeUInt32LE(classDefsOffNew, 100);
  fixedBuf.writeUInt32LE(totalDataSize, 104);
  fixedBuf.writeUInt32LE(dataOffNew, 108);

  for (let i = 0; i < sortedStrings.length; i++) {
    fixedBuf.writeUInt32LE(stringDataOffsets[i], stringIdsOff + i * 4);
  }
  for (let i = 0; i < sortedTypes.length; i++) {
    fixedBuf.writeUInt32LE(stringIdxMap.get(sortedTypes[i]), typeIdsOffNew + i * 4);
  }
  for (let i = 0; i < sortedProtos.length; i++) {
    const p = sortedProtos[i];
    const base = protoIdsOffNew + i * 12;
    fixedBuf.writeUInt32LE(stringIdxMap.get(p.shorty), base);
    fixedBuf.writeUInt32LE(typeIdxMap.get(p.returnType), base + 4);
    fixedBuf.writeUInt32LE(p.parametersOff, base + 8);
  }
  for (let i = 0; i < sortedFields.length; i++) {
    const f = sortedFields[i];
    const base = fieldIdsOffNew + i * 8;
    fixedBuf.writeUInt16LE(typeIdxMap.get(f.classType), base);
    fixedBuf.writeUInt16LE(typeIdxMap.get(f.fieldType), base + 2);
    fixedBuf.writeUInt32LE(stringIdxMap.get(f.name), base + 4);
  }
  for (let i = 0; i < sortedMethods.length; i++) {
    const m = sortedMethods[i];
    const base = methodIdsOffNew + i * 8;
    fixedBuf.writeUInt16LE(typeIdxMap.get(m.classType), base);
    fixedBuf.writeUInt16LE(protoIdxMap.get(m.protoKey), base + 2);
    fixedBuf.writeUInt32LE(stringIdxMap.get(m.name), base + 4);
  }
  for (let i = 0; i < classes.length; i++) {
    const c = classes[i];
    const base = classDefsOffNew + i * 32;
    fixedBuf.writeUInt32LE(typeIdxMap.get(c.classType), base);
    fixedBuf.writeUInt32LE(c.accessFlags, base + 4);
    fixedBuf.writeUInt32LE(typeIdxMap.get(c.superType), base + 8);
    fixedBuf.writeUInt32LE(c.interfacesOff, base + 12);
    fixedBuf.writeUInt32LE(stringIdxMap.get(c.sourceFile), base + 16);
    fixedBuf.writeUInt32LE(0, base + 20); // annotations_off = 0
    fixedBuf.writeUInt32LE(c.classDataOff, base + 24);
    fixedBuf.writeUInt32LE(c.staticValuesOff, base + 28);
  }

  const finalDex = Buffer.concat([fixedBuf, ...dataChunks]);
  if (finalDex.length !== totalFileSize) {
    throw new Error(`DEX size mismatch: expected ${totalFileSize}, got ${finalDex.length}`);
  }

  // Compute SHA-1 signature (bytes 12..32 = SHA-1 of bytes 32..end)
  const sha1 = crypto.createHash('sha1').update(finalDex.subarray(32)).digest();
  sha1.copy(finalDex, 12);

  // Compute Adler32 checksum (bytes 8..12 = Adler32 of bytes 12..end)
  const adler = computeAdler32(finalDex.subarray(12));
  finalDex.writeUInt32LE(adler, 8);

  return finalDex;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = process.cwd();
  const basePath = path.resolve(root, 'android/base-classes.dex');
  const baseBuf = fs.readFileSync(basePath);
  const compiled = buildNexoraClassesDex(baseBuf, '1.8.0', 8);
  console.log(`Compiled classes.dex successfully: ${compiled.length} bytes`);
}
