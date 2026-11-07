import { describe, it, expect, vi } from 'vitest';

describe('System Integration & Lifecycle', () => {
  it('wires up database, storage, API, and bot services gracefully', async () => {
    const { getConfig } = await import('../../src/config/index.js');
    const { getDbPool } = await import('../../src/db/client.js');
    const { createStorageClient } = await import('../../src/storage/s3.js');
    const { UserService } = await import('../../src/services/userService.js');
    const { UploadService } = await import('../../src/services/uploadService.js');
    const { DownloadService } = await import('../../src/services/downloadService.js');
    const { CleanupService } = await import('../../src/services/cleanupService.js');
    const { buildFastifyServer } = await import('../../src/api/server.js');
    const { createBotClient } = await import('../../src/bot/client.js');

    expect(typeof getConfig).toBe('function');
    expect(typeof getDbPool).toBe('function');
    expect(typeof createStorageClient).toBe('function');
    expect(typeof UserService).toBe('function');
    expect(typeof UploadService).toBe('function');
    expect(typeof DownloadService).toBe('function');
    expect(typeof CleanupService).toBe('function');
    expect(typeof buildFastifyServer).toBe('function');
    expect(typeof createBotClient).toBe('function');
  });

  it('runs an end-to-end simulated upload lifecycle from session to signed download', async () => {
    const mockStorage = {
      initiateMultipart: vi.fn().mockResolvedValue('s3-upload-1'),
      getPresignedPartUrls: vi.fn().mockResolvedValue(['http://s3/part-1']),
      completeMultipart: vi.fn().mockResolvedValue(undefined),
      getObjectSize: vi.fn().mockResolvedValue(5000000), // 5 MB
      getObjectHeader: vi.fn().mockResolvedValue(Buffer.from([0x50, 0x4B, 0x03, 0x04])), // benign zip
      getPresignedDownloadUrl: vi.fn().mockResolvedValue('https://s3.download/signed-file.zip'),
    } as any;

    const mockDb = {
      query: vi.fn()
        // 1. check user ban
        .mockResolvedValueOnce({ rows: [{ discord_user_id: 'user-1', is_banned: false }] })
        // 2. active storage sum
        .mockResolvedValueOnce({ rows: [{ total_used: '0' }] })
        // 3. insert session
        .mockResolvedValueOnce({ rows: [{ id: 'sess-1' }] })
        // 4. get session
        .mockResolvedValueOnce({
          rows: [{
            id: 'sess-1',
            owner_discord_id: 'user-1',
            requested_expiration_seconds: 86400,
            max_downloads: 100,
            expires_at: new Date(Date.now() + 60000),
            completed_at: null,
          }]
        })
        // 5. check quota in initiate
        .mockResolvedValueOnce({ rows: [{ discord_user_id: 'user-1', is_banned: false }] })
        .mockResolvedValueOnce({ rows: [{ total_used: '0' }] })
        // 6. update session with storage key
        .mockResolvedValueOnce({ rowCount: 1 })
        // 7. get session in complete
        .mockResolvedValueOnce({
          rows: [{
            id: 'sess-1',
            owner_discord_id: 'user-1',
            storage_key: 'objects/test.zip',
            upload_id: 's3-upload-1',
            original_filename: 'archive.zip',
            requested_expiration_seconds: 86400,
            max_downloads: 100,
          }]
        })
        // 7b. check quota in completeUpload
        .mockResolvedValueOnce({ rows: [{ discord_user_id: 'user-1', is_banned: false }] })
        .mockResolvedValueOnce({ rows: [{ total_used: '0' }] })
        // 8. insert file
        .mockResolvedValueOnce({
          rows: [{
            id: 'file-1',
            public_id: 'pub123',
            original_filename: 'archive.zip',
            size_bytes: '5000000',
            content_type: 'application/zip',
            download_count: 0,
            max_downloads: 100,
            status: 'completed',
            expires_at: new Date(Date.now() + 86400000),
          }]
        })
        // 9. update session completed
        .mockResolvedValueOnce({ rowCount: 1 })
        // 10. getFileForDownload
        .mockResolvedValueOnce({
          rows: [{
            id: 'file-1',
            public_id: 'pub123',
            storage_key: 'objects/test.zip',
            original_filename: 'archive.zip',
            content_type: 'application/zip',
            size_bytes: '5000000',
            download_count: 0,
            max_downloads: 100,
            status: 'completed',
            expires_at: new Date(Date.now() + 86400000),
          }]
        })
        // 11. update download count in generateDownloadUrl
        .mockResolvedValueOnce({ rowCount: 1 })
        // 12. insert download_events
        .mockResolvedValueOnce({ rowCount: 1 }),
    } as any;

    const { UserService } = await import('../../src/services/userService.js');
    const { UploadService } = await import('../../src/services/uploadService.js');
    const { DownloadService } = await import('../../src/services/downloadService.js');

    const config = {
      DEFAULT_USER_QUOTA_BYTES: 5 * 1024 * 1024 * 1024,
      MAX_FILE_SIZE_BYTES: 2 * 1024 * 1024 * 1024,
      BASE_URL: 'http://localhost:3000',
    } as any;

    const userService = new UserService(mockDb, config);
    const uploadService = new UploadService(mockDb, mockStorage, userService, config);
    const downloadService = new DownloadService(mockDb, mockStorage);

    // 1. Create upload session
    const session = await uploadService.createSession({
      ownerDiscordId: 'user-1',
      requestedExpirationSeconds: 86400,
    });
    expect(session.rawToken).toHaveLength(64);

    // 2. Initiate multipart
    const init = await uploadService.initiateUpload(session.rawToken, 'archive.zip', 5000000, 'application/zip');
    expect(init.uploadId).toBe('s3-upload-1');

    // 3. Complete multipart
    const file = await uploadService.completeUpload(session.rawToken, [{ PartNumber: 1, ETag: '"etag-1"' }]);
    expect(file.public_id).toBe('pub123');

    // 4. Download file
    const downloadUrl = await downloadService.generateDownloadUrl(file.public_id, '127.0.0.1');
    expect(downloadUrl).toBe('https://s3.download/signed-file.zip');
  });
});
