import { getConfig } from './config/index.js';
import { getDbPool, closeDbPool } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { getStorageService } from './storage/index.js';
import { UserService } from './services/userService.js';
import { UploadService } from './services/uploadService.js';
import { DownloadService } from './services/downloadService.js';
import { CleanupService } from './services/cleanupService.js';
import { buildFastifyServer } from './api/server.js';
import { createBotClient, notifyUploadComplete } from './bot/client.js';

async function bootstrap() {
  console.log('[System] Initializing Discord Large File Uploader Service...');

  // 1. Load and validate environment configuration
  const config = getConfig();

  // 2. Initialize PostgreSQL connection and apply migrations
  const pool = getDbPool(config);
  try {
    await runMigrations(pool);
  } catch (err) {
    console.error('[System] Database migration failed:', err);
    process.exit(1);
  }

  // 3. Initialize storage client (Local Disk or S3/R2)
  const storage = getStorageService(config);

  // 4. Initialize core services
  const userService = new UserService(pool, config);
  const uploadService = new UploadService(pool, storage, userService, config);
  const downloadService = new DownloadService(pool, storage);
  const cleanupService = new CleanupService(pool, storage);

  // 5. Start background lifecycle cleanup worker
  cleanupService.start(10 * 60 * 1000); // 10 minutes interval

  // 6. Initialize Discord bot client
  const botClient = createBotClient(config, {
    pool,
    uploadService,
    userService,
    storage,
    config,
  });

  // Handler to dispatch completion embeds to Discord channels or DMs
  const onUploadCompleted = async (file: any, session: any) => {
    if (botClient.isReady()) {
      await notifyUploadComplete(botClient, file, session, config.BASE_URL);
    }
  };

  // 7. Build and start Fastify API server
  const server = buildFastifyServer(
    {
      uploadService,
      downloadService,
      storageService: storage,
      onUploadCompleted,
    },
    config
  );

  try {
    await server.listen({ port: config.PORT, host: '0.0.0.0' });
    console.log(`[Fastify] HTTP Server listening at ${config.BASE_URL} (Port ${config.PORT})`);
  } catch (err) {
    console.error('[Fastify] Server failed to start:', err);
    process.exit(1);
  }

  // 8. Connect Discord Bot
  try {
    await botClient.login(config.DISCORD_TOKEN);
  } catch (err) {
    console.error('[DiscordBot] Bot login failed. Check DISCORD_TOKEN in environment:', err);
    // Continue running web server even if bot token is not yet configured
  }

  // 9. Graceful shutdown handler
  const shutdown = async (signal: string) => {
    console.log(`\n[System] Received ${signal}. Starting graceful shutdown...`);
    cleanupService.stop();

    try {
      await server.close();
      console.log('[System] HTTP server closed.');
    } catch (err) {
      console.error('[System] Error closing HTTP server:', err);
    }

    try {
      botClient.destroy();
      console.log('[System] Discord bot client destroyed.');
    } catch (err) {
      console.error('[System] Error destroying Discord bot client:', err);
    }

    try {
      await closeDbPool();
      console.log('[System] Database pool disconnected.');
    } catch (err) {
      console.error('[System] Error closing DB pool:', err);
    }

    console.log('[System] Shutdown complete. Goodbye.');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  console.error('[System] Fatal error during bootstrap:', err);
  process.exit(1);
});
