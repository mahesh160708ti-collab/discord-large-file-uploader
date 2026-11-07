import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { DownloadService } from '../../services/downloadService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface DownloadRoutesOptions {
  downloadService: DownloadService;
}

export const downloadRoutes: FastifyPluginAsync<DownloadRoutesOptions> = async (fastify, opts) => {
  const { downloadService } = opts;

  // GET download page landing HTML
  fastify.get<{ Params: { publicId: string } }>('/d/:publicId', async (request, reply) => {
    const { publicId } = request.params;
    const access = await downloadService.getFileForDownload(publicId);

    if (!access.isAccessible || !access.file) {
      const isGone = /expired|limit reached/i.test(access.reason || '');
      reply.status(isGone ? 410 : 404).type('text/html');
      return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <title>File Unavailable</title>
          <style>
            body { font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
            .card { background: #1e293b; padding: 2rem; border-radius: 0.75rem; border: 1px solid #334155; text-align: center; max-width: 450px; }
            h2 { color: #f87171; margin-top: 0; }
            p { color: #94a3b8; line-height: 1.5; }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>File Unavailable</h2>
            <p>${access.reason || 'This download link is invalid, expired, or has been removed.'}</p>
          </div>
        </body>
        </html>
      `;
    }

    const downloadHtmlPath = path.resolve(__dirname, '../../../public/download.html');
    if (fs.existsSync(downloadHtmlPath)) {
      reply.type('text/html');
      return fs.readFileSync(downloadHtmlPath, 'utf-8');
    }

    reply.type('text/html');
    return `
      <!DOCTYPE html>
      <html>
      <head><title>Download ${access.file.original_filename}</title></head>
      <body><h1>Download ${access.file.original_filename}</h1></body>
      </html>
    `;
  });

  // GET file metadata JSON
  fastify.get<{ Params: { publicId: string } }>('/api/d/:publicId/info', async (request, reply) => {
    const { publicId } = request.params;
    const access = await downloadService.getFileForDownload(publicId);

    if (!access.isAccessible || !access.file) {
      const isGone = /expired|limit reached/i.test(access.reason || '');
      return reply.status(isGone ? 410 : 404).send({ error: access.reason || 'File not accessible.' });
    }

    return {
      file: {
        public_id: access.file.public_id,
        original_filename: access.file.original_filename,
        size_bytes: access.file.size_bytes,
        expires_at: access.file.expires_at,
        download_count: access.file.download_count,
        max_downloads: access.file.max_downloads,
      },
    };
  });

  // GET signed download URL
  fastify.get<{ Params: { publicId: string } }>('/api/d/:publicId/url', async (request, reply) => {
    const { publicId } = request.params;
    const clientIp = request.ip || '127.0.0.1';

    try {
      const downloadUrl = await downloadService.generateDownloadUrl(publicId, clientIp);
      return { downloadUrl };
    } catch (err: any) {
      const isGone = /expired|limit reached/i.test(err.message || '');
      return reply.status(isGone ? 410 : 400).send({ error: err.message || 'Unable to generate download URL.' });
    }
  });

  // POST report abuse
  fastify.post<{
    Params: { publicId: string };
    Body: { reason: string };
  }>('/api/d/:publicId/report', async (request, reply) => {
    const { publicId } = request.params;
    const { reason } = request.body || {};
    const clientIp = request.ip || '127.0.0.1';

    if (!reason || typeof reason !== 'string') {
      return reply.status(400).send({ error: 'Report reason is required.' });
    }

    const result = await downloadService.submitAbuseReport(publicId, clientIp, reason);
    return result;
  });
};
