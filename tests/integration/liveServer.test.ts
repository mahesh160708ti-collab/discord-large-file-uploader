import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildFastifyServer } from '../../src/api/server.js';
import { FastifyInstance } from 'fastify';

describe('Live HTTP Server & Security Suite', () => {
  let app: FastifyInstance;
  const PORT = 3199;
  const BASE_URL = `http://127.0.0.1:${PORT}`;

  beforeAll(async () => {
    const mockServices = {
      uploadService: {
        getSessionByToken: async (token: string) => {
          if (token === 'active-session') {
            return {
              id: 'sess-100',
              original_filename: 'project.zip',
              expected_size_bytes: '50000',
              expires_at: new Date(Date.now() + 3600000),
              completed_at: null,
            };
          }
          return null;
        },
        initiateUpload: async (token: string, filename: string, sizeBytes: number) => {
          if (filename.includes('.exe') || filename.includes('\u202E')) {
            throw new Error('Prohibited file pattern');
          }
          return {
            uploadId: 'upload-live-123',
            storageKey: `objects/test/${filename}`,
            chunkSize: 10485760,
          };
        },
        getPartUrls: async () => ['http://s3.local/part-1', 'http://s3.local/part-2'],
        completeUpload: async () => ({
          id: 'file-100',
          public_id: 'livePublic1',
          original_filename: 'archive.zip',
          size_bytes: '50000',
          expires_at: new Date(Date.now() + 86400000),
        }),
      },
      downloadService: {
        getFileForDownload: async (publicId: string) => {
          if (publicId === 'livePublic1') {
            return {
              isAccessible: true,
              file: {
                id: 'file-100',
                public_id: 'livePublic1',
                original_filename: 'archive.zip',
                size_bytes: '50000',
                download_count: 1,
                max_downloads: 10,
                expires_at: new Date(Date.now() + 86400000),
              },
            };
          }
          if (publicId === 'expired123') {
            return { isAccessible: false, reason: 'File download link has expired.' };
          }
          return { isAccessible: false, reason: 'File not found.' };
        },
        generateDownloadUrl: async () => 'https://s3.download/direct-file.zip',
        submitAbuseReport: async () => ({ reported: true, quarantined: true }),
      },
    } as any;

    app = buildFastifyServer(mockServices, {
      PORT,
      BASE_URL,
      MAX_FILE_SIZE_BYTES: 2 * 1024 * 1024 * 1024,
    } as any);

    await app.listen({ port: PORT, host: '127.0.0.1' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. GET /health returns 200 OK over real network socket', async () => {
    const res = await fetch(`${BASE_URL}/health`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('ok');
  });

  it('2. GET /upload/:token serves responsive HTML page with upload controls', async () => {
    const res = await fetch(`${BASE_URL}/upload/active-session`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Direct Storage Upload');
    expect(html).toContain('id="drop-zone"');
    expect(html).toContain('id="file-input"');
  });

  it('3. POST /api/upload-session/:token/verify-chunk-1 actively blocks Windows PE binary header (MZ)', async () => {
    const mzHeader = Buffer.from([0x4D, 0x5A, 0x90, 0x00, 0x03]).toString('base64');
    const res = await fetch(`${BASE_URL}/api/upload-session/active-session/verify-chunk-1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ headerBase64: mzHeader }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Windows Executable (PE)');
  });

  it('4. POST /api/upload-session/:token/verify-chunk-1 actively blocks Linux ELF binary header', async () => {
    const elfHeader = Buffer.from([0x7F, 0x45, 0x4C, 0x46]).toString('base64');
    const res = await fetch(`${BASE_URL}/api/upload-session/active-session/verify-chunk-1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ headerBase64: elfHeader }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Linux ELF Binary');
  });

  it('5. POST /api/upload-session/:token/verify-chunk-1 allows benign file headers (e.g. ZIP)', async () => {
    const zipHeader = Buffer.from([0x50, 0x4B, 0x03, 0x04]).toString('base64');
    const res = await fetch(`${BASE_URL}/api/upload-session/active-session/verify-chunk-1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ headerBase64: zipHeader }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.valid).toBe(true);
  });

  it('6. GET /d/:publicId returns landing page with Safety Notice for active file', async () => {
    const res = await fetch(`${BASE_URL}/d/livePublic1`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Safety Notice');
    expect(html).toContain('id="download-btn"');
    expect(html).toContain('Report Suspicious File');
  });

  it('7. GET /d/:publicId returns HTTP 410 Gone for expired links', async () => {
    const res = await fetch(`${BASE_URL}/d/expired123`);
    expect(res.status).toBe(410);
    const html = await res.text();
    expect(html).toContain('File Unavailable');
  });

  it('8. GET /api/d/:publicId/url issues signed download URL', async () => {
    const res = await fetch(`${BASE_URL}/api/d/livePublic1/url`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.downloadUrl).toBe('https://s3.download/direct-file.zip');
  });

  it('9. POST /api/d/:publicId/report handles abuse report with quarantine', async () => {
    const res = await fetch(`${BASE_URL}/api/d/livePublic1/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Malicious token stealer payload' }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.reported).toBe(true);
    expect(data.quarantined).toBe(true);
  });
});
