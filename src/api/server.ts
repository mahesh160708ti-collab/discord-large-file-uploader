import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { AppConfig } from '../config/index.js';
import { UploadService } from '../services/uploadService.js';
import { DownloadService } from '../services/downloadService.js';
import { uploadRoutes } from './routes/uploadRoutes.js';
import { downloadRoutes } from './routes/downloadRoutes.js';
import { registerLocalStorageRoutes } from './routes/localStorageRoutes.js';
import { S3StorageService, LocalStorageService } from '../storage/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ApiServices {
  uploadService: UploadService;
  downloadService: DownloadService;
  storageService?: S3StorageService;
  onUploadCompleted?: (file: any, session: any) => Promise<void>;
}

export function buildFastifyServer(services: ApiServices, config: AppConfig): FastifyInstance {
  const server = Fastify({
    logger: {
      level: 'info',
      redact: [
        'req.headers.authorization',
        'req.headers["x-api-key"]',
        '*.token',
        '*.password',
        '*.secret',
        'DISCORD_TOKEN',
        'S3_SECRET_ACCESS_KEY',
      ],
    },
    trustProxy: true,
  });

  // 1. CORS
  server.register(cors, {
    origin: true, // Allow direct browser requests
    methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
    exposedHeaders: ['ETag'],
  });

  // 2. IP Rate Limiting
  server.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  // 3. Static Files
  const publicDir = path.resolve(__dirname, '../../public');
  if (fs.existsSync(publicDir)) {
    server.register(fastifyStatic, {
      root: publicDir,
      prefix: '/public/',
    });
  }

  // 4. Mount Upload Interface Route
  server.get<{ Params: { token: string } }>('/upload/:token', async (request, reply) => {
    const uploadHtmlPath = path.resolve(__dirname, '../../public/upload.html');
    if (fs.existsSync(uploadHtmlPath)) {
      reply.type('text/html');
      return fs.readFileSync(uploadHtmlPath, 'utf-8');
    }
    reply.type('text/html');
    return `
      <!DOCTYPE html>
      <html>
      <head><title>Upload File</title></head>
      <body><h1>Upload Service</h1><p>Session Token: ${request.params.token}</p></body>
      </html>
    `;
  });

  // Terms of Service and Privacy Policy for Discord App Directory & Verification
  server.get('/terms', async (request, reply) => {
    const termsPath = path.resolve(__dirname, '../../public/terms.html');
    if (fs.existsSync(termsPath)) {
      reply.type('text/html');
      return fs.readFileSync(termsPath, 'utf-8');
    }
    return 'Terms of Service';
  });

  server.get('/privacy', async (request, reply) => {
    const privacyPath = path.resolve(__dirname, '../../public/privacy.html');
    if (fs.existsSync(privacyPath)) {
      reply.type('text/html');
      return fs.readFileSync(privacyPath, 'utf-8');
    }
    return 'Privacy Policy';
  });

  // 5. Mount API Routes
  if (services.storageService instanceof LocalStorageService) {
    registerLocalStorageRoutes(server, services.storageService);
  }

  server.register(uploadRoutes, {
    uploadService: services.uploadService,
    onUploadCompleted: services.onUploadCompleted,
  });

  server.register(downloadRoutes, {
    downloadService: services.downloadService,
  });

  // Health check endpoint
  server.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  return server;
}
