import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { buildFastifyServer } from '../../src/api/server.js';

describe('Fastify API Routes', () => {
  let app: any;

  beforeAll(async () => {
    const mockServices = {
      uploadService: {
        getSessionByToken: vi.fn().mockImplementation(async (token: string) => {
          if (token === 'valid-token') {
            return {
              id: 'session-1',
              original_filename: 'test.zip',
              expected_size_bytes: '1000',
              expires_at: new Date(Date.now() + 60000),
              completed_at: null,
            };
          }
          return null;
        }),
        initiateUpload: vi.fn().mockResolvedValue({
          uploadId: 'upload-123',
          storageKey: 'objects/test.zip',
          chunkSize: 10485760,
        }),
        getPartUrls: vi.fn().mockResolvedValue(['http://s3/part-1']),
        completeUpload: vi.fn().mockResolvedValue({
          id: 'file-1',
          public_id: 'xY7kP2',
          original_filename: 'test.zip',
          size_bytes: '1000',
          expires_at: new Date(Date.now() + 86400000),
        }),
      },
      downloadService: {
        getFileForDownload: vi.fn().mockImplementation(async (publicId: string) => {
          if (publicId === 'xY7kP2') {
            return {
              isAccessible: true,
              file: {
                public_id: 'xY7kP2',
                original_filename: 'project.zip',
                size_bytes: '4200000000',
                expires_at: new Date(Date.now() + 86400000),
              }
            };
          }
          if (publicId === 'expired-file') {
            return { isAccessible: false, reason: 'File download link has expired.' };
          }
          return { isAccessible: false, reason: 'File not found.' };
        }),
        generateDownloadUrl: vi.fn().mockResolvedValue('https://s3.download/file.zip'),
        submitAbuseReport: vi.fn().mockResolvedValue({ reported: true, quarantined: false }),
      },
    } as any;

    app = buildFastifyServer(mockServices, {
      PORT: 3000,
      BASE_URL: 'http://localhost:3000',
      MAX_FILE_SIZE_BYTES: 2147483648,
    } as any);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/upload-session/:token returns session details for valid token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/upload-session/valid-token',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.session.id).toBe('session-1');
  });

  it('GET /api/upload-session/:token returns 404 for invalid token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/upload-session/invalid-token',
    });
    expect(res.statusCode).toBe(404);
  });

  it('POST /api/upload-session/:token/initiate initiates multipart upload', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/upload-session/valid-token/initiate',
      payload: {
        filename: 'project.zip',
        sizeBytes: 1000,
        contentType: 'application/zip',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.uploadId).toBe('upload-123');
  });

  it('POST /api/upload-session/:token/verify-chunk-1 rejects PE executables', async () => {
    // Base64 MZ header
    const mzBase64 = Buffer.from([0x4D, 0x5A, 0x90, 0x00]).toString('base64');
    const res = await app.inject({
      method: 'POST',
      url: '/api/upload-session/valid-token/verify-chunk-1',
      payload: {
        headerBase64: mzBase64,
      },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toMatch(/executable/i);
  });

  it('GET /api/d/:publicId/info returns metadata for valid publicId', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/d/xY7kP2/info',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.file.original_filename).toBe('project.zip');
  });

  it('GET /api/d/:publicId/info returns 410 Gone for expired files', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/d/expired-file/info',
    });
    expect(res.statusCode).toBe(410);
    const body = JSON.parse(res.body);
    expect(body.error).toMatch(/expired/i);
  });

  it('GET /d/:publicId returns 410 Gone HTML for expired files', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/d/expired-file',
    });
    expect(res.statusCode).toBe(410);
    expect(res.body).toContain('File Unavailable');
  });

  it('GET /api/d/:publicId/url returns signed download URL', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/d/xY7kP2/url',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.downloadUrl).toBe('https://s3.download/file.zip');
  });

  it('POST /api/d/:publicId/report submits abuse report', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/d/xY7kP2/report',
      payload: {
        reason: 'Malware test',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.reported).toBe(true);
  });
});
