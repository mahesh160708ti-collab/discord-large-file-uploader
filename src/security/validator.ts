// Blocked file extensions representing dangerous scripts, macros, and shortcut drops
export const BLOCKED_EXTENSIONS = new Set([
  'scr', 'bat', 'cmd', 'sh', 'vbs', 'vbe', 'jse', 'wsf', 'wsh',
  'ps1', 'msi', 'msp', 'com', 'pif', 'cpl', 'iso', 'img', 'vhd', 'vhdx',
  'lnk', 'hta', 'chm', 'jar', 'gadget'
]);

// Middle extensions that should never be concealed inside a filename
const FORBIDDEN_MIDDLE_EXTENSIONS = new Set([...BLOCKED_EXTENSIONS, 'exe']);

// Common media and document extensions that should not be deceptively paired before .exe (e.g. photo.png.exe)
const DECEPTIVE_MEDIA_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg',
  'pdf', 'mp4', 'avi', 'mov', 'mp3', 'wav',
  'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt'
]);

// Characters used for Unicode direction overrides (e.g. Right-to-Left Override spoofing)
const RLO_REGEX = /[\u202A-\u202E\u200E\u200F\u2066-\u2069]/;

// Known phishing, token grabber, and scam patterns in filenames
const SCAM_KEYWORDS_REGEX = /(discord.*nitro|free.*nitro|token.*grabber|steam.*gift|cheat.*hack|account.*stealer|crack.*patch|nitro.*gen)/i;

export function isBlockedExtension(ext: string): boolean {
  return BLOCKED_EXTENSIONS.has(ext.toLowerCase().trim().replace(/^\./, ''));
}

export function validateFilename(filename: string): {
  isValid: boolean;
  sanitizedName: string;
  reason?: string;
} {
  if (!filename || typeof filename !== 'string') {
    return { isValid: false, sanitizedName: '', reason: 'Filename is required' };
  }

  // 1. Null byte and control character check
  if (/[\0\x00-\x1F\x7F]/.test(filename)) {
    return { isValid: false, sanitizedName: '', reason: 'Filename contains forbidden control characters' };
  }

  // 2. Path traversal check
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return { isValid: false, sanitizedName: '', reason: 'Path traversal detected in filename' };
  }

  // 3. Right-to-Left Override and direction spoofing
  if (RLO_REGEX.test(filename)) {
    return {
      isValid: false,
      sanitizedName: '',
      reason: 'Unicode Right-to-Left Override or direction control characters detected',
    };
  }

  // 4. Scam keyword heuristic
  if (SCAM_KEYWORDS_REGEX.test(filename)) {
    return {
      isValid: false,
      sanitizedName: '',
      reason: 'Prohibited filename pattern associated with scams or account-takeover attacks',
    };
  }

  // 5. Parse parts and extensions
  const parts = filename.trim().split('.');
  if (parts.length < 2) {
    return { isValid: false, sanitizedName: '', reason: 'Filename must include a valid extension' };
  }

  const finalExt = parts[parts.length - 1];
  if (isBlockedExtension(finalExt)) {
    return { isValid: false, sanitizedName: '', reason: `Blocked file extension: .${finalExt}` };
  }

  // Check for deceptive double extensions (e.g., "photo.png.scr" or "doc.exe.pdf" or "photo.png.exe")
  for (let i = 1; i < parts.length - 1; i++) {
    const subExt = parts[i].trim().toLowerCase();
    if (FORBIDDEN_MIDDLE_EXTENSIONS.has(subExt)) {
      return {
        isValid: false,
        sanitizedName: '',
        reason: `Deceptive double extension containing blocked type: .${subExt}`,
      };
    }
    if (finalExt.toLowerCase() === 'exe' && DECEPTIVE_MEDIA_EXTENSIONS.has(subExt)) {
      return {
        isValid: false,
        sanitizedName: '',
        reason: `Deceptive double extension spoofing media or document as executable: .${subExt}.exe`,
      };
    }
  }

  // 6. Sanitize filename: replace spaces and disallow characters that break headers
  const baseName = parts.slice(0, -1).join('.');
  const sanitizedBase = baseName
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_\-\.()[\]]/g, '');

  const sanitized = `${sanitizedBase}.${finalExt.toLowerCase()}`;

  return {
    isValid: true,
    sanitizedName: sanitized,
  };
}
