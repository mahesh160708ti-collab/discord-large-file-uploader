import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { LocalStorageService } from '../../src/storage/localStorage.js';

describe('LocalStorageService', () => {
  const testDir = path.join(process.cwd(), 'tests', 'fixtures', 'local-storage-test');
  let storage: LocalStorageService;

  beforeAll(() => {
    fs.mkdirSync(testDir, { recursive: true });
    storage = new LocalStorageService(
      {
        BASE_URL: 'http://localhost:3000',
        DISCORD_TOKEN: 'test-token',
      } as any,
      testDir
    );
  });

  afterAll(() => {
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {}
  });

  it('handles full lifecycle: initiate, upload parts, complete, header, download url, delete', async () => {
    const key = 'test-file.txt';
    const uploadId = await storage.initiateMultipart(key, 'text/plain');
    expect(uploadId).toBeDefined();

    const partUrls = await storage.getPresignedPartUrls(key, uploadId, [1, 2]);
    expect(partUrls.length).toBe(2);
    expect(partUrls[0]).toContain('/api/local-storage/upload/' + uploadId + '/1');

    // Simulate writing 2 parts
    const tempDir = storage.getTempPath();
    const sessionDir = path.join(tempDir, uploadId);
    fs.writeFileSync(path.join(sessionDir, 'part-1'), Buffer.from('Hello, '));
    fs.writeFileSync(path.join(sessionDir, 'part-2'), Buffer.from('world!'));

    await storage.completeMultipart(key, uploadId, [
      { PartNumber: 1, ETag: '"etag1"' },
      { PartNumber: 2, ETag: '"etag2"' },
    ]);

    const size = await storage.getObjectSize(key);
    expect(size).toBe(13);

    const header = await storage.getObjectHeader(key, 5);
    expect(header.toString()).toBe('Hello');

    const downloadUrl = await storage.getPresignedDownloadUrl(key, 'test-file.txt', 'text/plain');
    expect(downloadUrl).toContain('/api/local-storage/download');
    expect(downloadUrl).toContain('sig=');

    await storage.deleteObject(key);
    const deletedSize = await storage.getObjectSize(key);
    expect(deletedSize).toBe(0);
  });
});
