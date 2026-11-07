import { describe, it, expect } from 'vitest';
import { validateFilename, isBlockedExtension } from '../../src/security/validator.js';

describe('validateFilename', () => {
  it('blocks dangerous script and container extensions like .scr, .bat, .lnk, .iso', () => {
    expect(isBlockedExtension('scr')).toBe(true);
    expect(isBlockedExtension('bat')).toBe(true);
    expect(isBlockedExtension('iso')).toBe(true);
    expect(isBlockedExtension('lnk')).toBe(true);
    expect(isBlockedExtension('exe')).toBe(false);
    expect(isBlockedExtension('png')).toBe(false);
    expect(isBlockedExtension('zip')).toBe(false);
  });

  it('rejects Unicode Right-to-Left Override (RLO) in filenames', () => {
    const malicious = 'invoice\u202Ecod.exe';
    const result = validateFilename(malicious);
    expect(result.isValid).toBe(false);
    expect(result.reason).toMatch(/RLO|direction/i);
  });

  it('rejects double extensions masking executables and media spoofing', () => {
    const result1 = validateFilename('photo.png.scr');
    expect(result1.isValid).toBe(false);
    expect(result1.reason).toMatch(/double extension|blocked/i);

    const result2 = validateFilename('photo.png.exe');
    expect(result2.isValid).toBe(false);
    expect(result2.reason).toMatch(/double extension/i);
  });

  it('rejects scam keywords in filenames', () => {
    const result = validateFilename('free_discord_nitro_generator.zip');
    expect(result.isValid).toBe(false);
    expect(result.reason).toMatch(/scam|prohibited/i);
  });

  it('rejects null bytes and path traversal', () => {
    expect(validateFilename('safe\0file.txt').isValid).toBe(false);
    expect(validateFilename('../../etc/passwd').isValid).toBe(false);
  });

  it('accepts and sanitizes legitimate filenames including executables', () => {
    const resultPdf = validateFilename('Project Report (v2) [Final].pdf');
    expect(resultPdf.isValid).toBe(true);
    expect(resultPdf.sanitizedName).toBe('Project_Report_(v2)_[Final].pdf');

    const resultExe = validateFilename('Setup Installer (v1.0).exe');
    expect(resultExe.isValid).toBe(true);
    expect(resultExe.sanitizedName).toBe('Setup_Installer_(v1.0).exe');
  });
});
