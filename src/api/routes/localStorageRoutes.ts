import { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { LocalStorageService } from '../../storage/localStorage.js';

export function registerLocalStorageRoutes(
  fastify: FastifyInstance,
  localStorageService: LocalStorageService
) {
  // Allow raw stream payload on PUT for local chunk uploads
  fastify.addContentTypeParser(
    'application/octet-stream',
    (req, payload, done) => {
      done(null, payload);
    }
  );

  fastify.put<{
    Params: { uploadId: string; partNumber: string };
    Querystring: { exp: string; sig: string };
  }>('/api/local-storage/upload/:uploadId/:partNumber', async (request, reply) => {
    const { uploadId, partNumber } = request.params;
    const { exp, sig } = request.query;

    const expiresAt = parseInt(exp, 10);
    if (!expiresAt || Date.now() > expiresAt) {
      return reply.status(403).send({ error: 'Upload link expired.' });
    }

    const expectedSig = localStorageService.generatePartSignature(uploadId, parseInt(partNumber, 10), expiresAt);
    if (expectedSig !== sig) {
      return reply.status(403).send({ error: 'Invalid signature.' });
    }

    const partDir = path.join(localStorageService.getTempPath(), uploadId);
    await fs.promises.mkdir(partDir, { recursive: true });
    const partPath = path.join(partDir, `part-${partNumber}`);

    const writeStream = fs.createWriteStream(partPath);
    const hash = crypto.createHash('md5');

    const bodyStream = request.body as any;
    bodyStream.on('data', (chunk: Buffer) => hash.update(chunk));

    await pipeline(bodyStream, writeStream);
    const etag = `"${hash.digest('hex')}"`;

    reply.header('ETag', etag);
    reply.header('Access-Control-Expose-Headers', 'ETag');
    return reply.status(200).send({ ok: true });
  });

  fastify.get<{
    Querystring: { key: string; filename: string; exp: string; sig: string };
  }>('/api/local-storage/download', async (request, reply) => {
    const { key, filename, exp, sig } = request.query;

    const expiresAt = parseInt(exp, 10);
    if (!expiresAt || Date.now() > expiresAt) {
      return reply.status(403).send('Download link expired.');
    }

    const expectedSig = localStorageService.generateDownloadSignature(key, expiresAt);
    if (expectedSig !== sig) {
      return reply.status(403).send('Invalid download signature.');
    }

    const filePath = path.join(localStorageService.getUploadsPath(), key);
    if (!fs.existsSync(filePath)) {
      return reply.status(404).send('File not found on storage.');
    }

    const safeFilename = (filename || 'download').replace(/["\r\n]/g, '');
    reply.header('Content-Disposition', `attachment; filename="${safeFilename}"`);
    reply.header('Content-Type', 'application/octet-stream');

    return reply.send(fs.createReadStream(filePath));
  });
}
