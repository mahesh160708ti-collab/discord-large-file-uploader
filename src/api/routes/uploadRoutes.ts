import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { UploadService } from '../../services/uploadService.js';
import { detectDisguisedBinary } from '../../security/magicBytes.js';

export interface UploadRoutesOptions {
  uploadService: UploadService;
  onUploadCompleted?: (file: any, session: any) => Promise<void>;
}

export const uploadRoutes: FastifyPluginAsync<UploadRoutesOptions> = async (fastify, opts) => {
  const { uploadService, onUploadCompleted } = opts;

  // GET session details
  fastify.get<{ Params: { token: string } }>('/api/upload-session/:token', async (request, reply) => {
    const { token } = request.params;
    const session = await uploadService.getSessionByToken(token);
    if (!session) {
      return reply.status(404).send({ error: 'Upload session not found or expired.' });
    }
    return { session };
  });

  // POST initiate multipart upload
  fastify.post<{
    Params: { token: string };
    Body: { filename: string; sizeBytes: number; contentType: string };
  }>('/api/upload-session/:token/initiate', async (request, reply) => {
    const { token } = request.params;
    const { filename, sizeBytes, contentType } = request.body;

    if (!filename || typeof sizeBytes !== 'number') {
      return reply.status(400).send({ error: 'Filename and sizeBytes are required.' });
    }

    try {
      const result = await uploadService.initiateUpload(token, filename, sizeBytes, contentType);
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message || 'Failed to initiate upload.' });
    }
  });

  // POST part presigned URLs
  fastify.post<{
    Params: { token: string };
    Body: { partNumbers: number[] };
  }>('/api/upload-session/:token/part-urls', async (request, reply) => {
    const { token } = request.params;
    const { partNumbers } = request.body;

    if (!Array.isArray(partNumbers) || partNumbers.length === 0) {
      return reply.status(400).send({ error: 'partNumbers must be a non-empty array of numbers.' });
    }

    try {
      const urls = await uploadService.getPartUrls(token, partNumbers);
      return { urls };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message || 'Failed to obtain part URLs.' });
    }
  });

  // POST verify chunk 1 magic bytes for disguised executable / stealer binaries
  fastify.post<{
    Params: { token: string };
    Body: { headerBase64: string; filename?: string };
  }>('/api/upload-session/:token/verify-chunk-1', async (request, reply) => {
    const { token } = request.params;
    const { headerBase64, filename } = request.body;
    if (!headerBase64 || typeof headerBase64 !== 'string') {
      return reply.status(400).send({ error: 'headerBase64 is required.' });
    }

    let declaredExt: string | undefined;
    if (filename && typeof filename === 'string') {
      declaredExt = filename.split('.').pop()?.toLowerCase();
    } else {
      const session = await uploadService.getSessionByToken(token);
      if (session?.original_filename) {
        declaredExt = session.original_filename.split('.').pop()?.toLowerCase();
      }
    }

    const buffer = Buffer.from(headerBase64, 'base64');
    const detection = detectDisguisedBinary(buffer, declaredExt);
    if (detection.isMalicious) {
      return reply.status(400).send({
        error: `Security violation: ${detection.detectedType} detected. Disguised executable binaries and malicious shortcuts are strictly prohibited.`,
      });
    }

    return { valid: true };
  });

  // POST complete multipart upload
  fastify.post<{
    Params: { token: string };
    Body: { parts: { PartNumber: number; ETag: string }[] };
  }>('/api/upload-session/:token/complete', async (request, reply) => {
    const { token } = request.params;
    const { parts } = request.body;

    if (!Array.isArray(parts) || parts.length === 0) {
      return reply.status(400).send({ error: 'parts array is required.' });
    }

    try {
      const session = await uploadService.getSessionByToken(token);
      const file = await uploadService.completeUpload(token, parts);

      if (onUploadCompleted && session) {
        onUploadCompleted(file, session).catch((err) => {
          console.error('[uploadRoutes] onUploadCompleted handler failed:', err);
        });
      }

      return { file };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message || 'Failed to complete upload.' });
    }
  });
};
