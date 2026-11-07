import { describe, it, expect, vi } from 'vitest';
import { UploadService } from '../../src/services/uploadService.js';

describe('UploadService', () => {
  it('hashes upload session tokens with SHA-256 for database lookup', () => {
    const rawToken = 'abc123def456';
    const hash = UploadService.hashToken(rawToken);
    expect(hash).toHaveLength(64);
    expect(hash).toBe(UploadService.hashToken(rawToken));
  });

  it('rejects session initiation if expected file size exceeds quota', async () => {
    const mockDb = {
      query: vi.fn().mockResolvedValue({
        rows: [{
          id: 'session-1',
          owner_discord_id: 'user-1',
          expires_at: new Date(Date.now() + 60000),
          completed_at: null,
          requested_expiration_seconds: 86400,
        }]
      })
    } as any;
    const mockStorage = {} as any;
    const mockUserService = {
      getUserStorage: vi.fn().mockResolvedValue({
        usedBytes: 4.5 * 1024 * 1024 * 1024,
        quotaBytes: 5 * 1024 * 1024 * 1024,
        isBanned: false
      }),
    } as any;
    const service = new UploadService(mockDb, mockStorage, mockUserService, {
      BASE_URL: 'http://localhost',
      MAX_FILE_SIZE_BYTES: 2 * 1024 * 1024 * 1024,
    } as any);

    await expect(service.initiateUpload('token', 'movie.zip', 1 * 1024 * 1024 * 1024, 'application/zip'))
      .rejects.toThrow(/quota/i);
  });

  it('rejects and purges file in completeUpload if actual size exceeds MAX_FILE_SIZE_BYTES', async () => {
    const mockStorage = {
      completeMultipart: vi.fn().mockResolvedValue(undefined),
      getObjectSize: vi.fn().mockResolvedValue(3 * 1024 * 1024 * 1024), // 3 GB > 2 GB max
      deleteObject: vi.fn().mockResolvedValue(undefined),
      getObjectHeader: vi.fn().mockResolvedValue(Buffer.from([0x50, 0x4B, 0x03, 0x04])),
    } as any;
    const mockDb = {
      query: vi.fn()
        // getSessionByToken
        .mockResolvedValueOnce({
          rows: [{
            id: 'session-1',
            owner_discord_id: 'user-1',
            upload_id: 'up-1',
            storage_key: 'objects/big.zip',
            original_filename: 'big.zip',
            requested_expiration_seconds: 86400,
            max_downloads: 100,
            expires_at: new Date(Date.now() + 60000),
            completed_at: null,
          }]
        })
        .mockResolvedValue({ rowCount: 1 }),
    } as any;
    const mockUserService = {
      getUserStorage: vi.fn().mockResolvedValue({ usedBytes: 0, quotaBytes: 5 * 1024 * 1024 * 1024, isBanned: false }),
    } as any;
    const service = new UploadService(mockDb, mockStorage, mockUserService, {
      BASE_URL: 'http://localhost',
      MAX_FILE_SIZE_BYTES: 2 * 1024 * 1024 * 1024,
    } as any);

    await expect(service.completeUpload('token', [{ PartNumber: 1, ETag: '"e"' }]))
      .rejects.toThrow(/exceeds maximum permitted limit/i);
    expect(mockStorage.deleteObject).toHaveBeenCalledWith('objects/big.zip');
  });

  it('server detects disguised PE executable on S3 object, purges file and bans user', async () => {
    const mockStorage = {
      completeMultipart: vi.fn().mockResolvedValue(undefined),
      getObjectSize: vi.fn().mockResolvedValue(100000),
      deleteObject: vi.fn().mockResolvedValue(undefined),
      // MZ PE executable header disguised as video
      getObjectHeader: vi.fn().mockResolvedValue(Buffer.from([0x4D, 0x5A, 0x90, 0x00, 0x03, 0x00])),
    } as any;
    const mockDb = {
      query: vi.fn()
        // getSessionByToken
        .mockResolvedValueOnce({
          rows: [{
            id: 'session-1',
            owner_discord_id: 'bad-actor',
            upload_id: 'up-1',
            storage_key: 'objects/game.mp4',
            original_filename: 'game.mp4',
            requested_expiration_seconds: 86400,
            max_downloads: 100,
            expires_at: new Date(Date.now() + 60000),
            completed_at: null,
          }]
        })
        .mockResolvedValue({ rowCount: 1 }),
    } as any;
    const mockUserService = {
      getUserStorage: vi.fn().mockResolvedValue({ usedBytes: 0, quotaBytes: 5 * 1024 * 1024 * 1024, isBanned: false }),
    } as any;
    const service = new UploadService(mockDb, mockStorage, mockUserService, {
      BASE_URL: 'http://localhost',
      MAX_FILE_SIZE_BYTES: 2 * 1024 * 1024 * 1024,
    } as any);

    await expect(service.completeUpload('token', [{ PartNumber: 1, ETag: '"e"' }]))
      .rejects.toThrow(/Security violation.*Executable/i);
    expect(mockStorage.deleteObject).toHaveBeenCalledWith('objects/game.mp4');
    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE users SET is_banned = TRUE'),
      ['bad-actor']
    );
  });
});
