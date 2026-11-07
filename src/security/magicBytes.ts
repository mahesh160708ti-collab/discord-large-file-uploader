export interface MagicByteDetectionResult {
  isMalicious: boolean;
  detectedType?: string;
}

export function detectDisguisedBinary(buffer: Buffer, declaredExtension?: string): MagicByteDetectionResult {
  if (!buffer || buffer.length < 4) {
    return { isMalicious: false };
  }

  const ext = declaredExtension?.toLowerCase().trim().replace(/^\./, '');

  // Windows PE Executable / DLL (MZ Header)
  if (buffer[0] === 0x4D && buffer[1] === 0x5A) {
    // If explicitly declared as .exe, it is a transparent executable upload (not disguised)
    if (ext === 'exe') {
      return { isMalicious: false };
    }
    return {
      isMalicious: true,
      detectedType: 'Windows Executable (PE)',
    };
  }

  // Linux ELF Executable
  if (buffer[0] === 0x7F && buffer[1] === 0x45 && buffer[2] === 0x4C && buffer[3] === 0x46) {
    if (ext === 'elf' || ext === 'bin' || ext === 'exe') {
      return { isMalicious: false };
    }
    return {
      isMalicious: true,
      detectedType: 'Linux ELF Binary',
    };
  }

  // macOS Mach-O Binary
  const isMachO =
    (buffer[0] === 0xFE && buffer[1] === 0xED && buffer[2] === 0xFA && buffer[3] === 0xCE) ||
    (buffer[0] === 0xCE && buffer[1] === 0xFA && buffer[2] === 0xED && buffer[3] === 0xFE) ||
    (buffer[0] === 0xFE && buffer[1] === 0xED && buffer[2] === 0xFA && buffer[3] === 0xCF) ||
    (buffer[0] === 0xCF && buffer[1] === 0xFA && buffer[2] === 0xED && buffer[3] === 0xFE) ||
    (buffer[0] === 0xCA && buffer[1] === 0xFE && buffer[2] === 0xBA && buffer[3] === 0xBE);

  if (isMachO) {
    if (ext === 'app' || ext === 'bin' || ext === 'exe') {
      return { isMalicious: false };
    }
    return {
      isMalicious: true,
      detectedType: 'macOS Mach-O Binary',
    };
  }

  // Windows LNK Shortcut (often weaponized for initial code execution via cmd/powershell)
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x4C &&
    buffer[1] === 0x00 &&
    buffer[2] === 0x00 &&
    buffer[3] === 0x00 &&
    buffer[4] === 0x01 &&
    buffer[5] === 0x14 &&
    buffer[6] === 0x02 &&
    buffer[7] === 0x00
  ) {
    return {
      isMalicious: true,
      detectedType: 'Windows LNK Shortcut',
    };
  }

  return { isMalicious: false };
}
