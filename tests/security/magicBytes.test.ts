import { describe, it, expect } from 'vitest';
import { detectDisguisedBinary } from '../../src/security/magicBytes.js';

describe('detectDisguisedBinary', () => {
  it('detects Windows PE binary headers (MZ)', () => {
    const buf = Buffer.from([0x4D, 0x5A, 0x90, 0x00, 0x03, 0x00]);
    const result = detectDisguisedBinary(buf);
    expect(result.isMalicious).toBe(true);
    expect(result.detectedType).toBe('Windows Executable (PE)');
  });

  it('detects Linux ELF headers', () => {
    const buf = Buffer.from([0x7F, 0x45, 0x4C, 0x46, 0x02, 0x01]);
    const result = detectDisguisedBinary(buf);
    expect(result.isMalicious).toBe(true);
    expect(result.detectedType).toBe('Linux ELF Binary');
  });

  it('detects macOS Mach-O headers', () => {
    const buf = Buffer.from([0xFE, 0xED, 0xFA, 0xCE]);
    const result = detectDisguisedBinary(buf);
    expect(result.isMalicious).toBe(true);
    expect(result.detectedType).toBe('macOS Mach-O Binary');
  });

  it('detects Windows LNK shortcut files', () => {
    const buf = Buffer.from([0x4C, 0x00, 0x00, 0x00, 0x01, 0x14, 0x02, 0x00]);
    const result = detectDisguisedBinary(buf);
    expect(result.isMalicious).toBe(true);
    expect(result.detectedType).toBe('Windows LNK Shortcut');
  });

  it('allows benign files like text, images, or zip', () => {
    const zipHeader = Buffer.from([0x50, 0x4B, 0x03, 0x04]);
    const result = detectDisguisedBinary(zipHeader);
    expect(result.isMalicious).toBe(false);
  });

  it('allows MZ headers when explicitly declared as .exe', () => {
    const buf = Buffer.from([0x4D, 0x5A, 0x90, 0x00, 0x03, 0x00]);
    const result = detectDisguisedBinary(buf, 'exe');
    expect(result.isMalicious).toBe(false);
  });
});
