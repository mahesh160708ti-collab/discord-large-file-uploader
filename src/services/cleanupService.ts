import pg from 'pg';
import { S3StorageService } from '../storage/s3.js';

export class CleanupService {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(
    private pool: pg.Pool,
    private storage: S3StorageService
  ) {}

  async purgeExpiredFiles(): Promise<{ deletedCount: number; errors: number }> {
    let deletedCount = 0;
    let errors = 0;

    try {
      const query = `
        SELECT id, storage_key, original_filename
        FROM files
        WHERE delete_after <= NOW()
          AND storage_deleted = FALSE
        ORDER BY delete_after ASC
        LIMIT 100;
      `;
      const res = await this.pool.query(query);

      for (const file of res.rows) {
        try {
          await this.storage.deleteObject(file.storage_key);
          await this.pool.query(
            "UPDATE files SET status = 'deleted', deleted_at = COALESCE(deleted_at, NOW()), storage_deleted = TRUE WHERE id = $1",
            [file.id]
          );
          deletedCount++;
        } catch (err) {
          console.error(`Failed to delete storage object for file ${file.id} (${file.storage_key}):`, err);
          errors++;
        }
      }
    } catch (err) {
      console.error('Error during purgeExpiredFiles query:', err);
      errors++;
    }

    return { deletedCount, errors };
  }

  async abortStalledUploads(): Promise<{ abortedCount: number }> {
    let abortedCount = 0;

    try {
      const query = `
        SELECT id, storage_key, upload_id
        FROM upload_sessions
        WHERE expires_at < NOW()
          AND completed_at IS NULL
          AND upload_id IS NOT NULL
        LIMIT 50;
      `;
      const res = await this.pool.query(query);

      for (const session of res.rows) {
        try {
          if (session.storage_key && session.upload_id) {
            await this.storage.abortMultipart(session.storage_key, session.upload_id);
          }
          await this.pool.query(
            'UPDATE upload_sessions SET completed_at = NOW() WHERE id = $1',
            [session.id]
          );
          abortedCount++;
        } catch (err) {
          console.error(`Failed to abort multipart upload for session ${session.id}:`, err);
        }
      }
    } catch (err) {
      console.error('Error during abortStalledUploads query:', err);
    }

    return { abortedCount };
  }

  async runSweep(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    try {
      const filesResult = await this.purgeExpiredFiles();
      const uploadsResult = await this.abortStalledUploads();
      if (filesResult.deletedCount > 0 || uploadsResult.abortedCount > 0) {
        console.log(`[CleanupService] Purged ${filesResult.deletedCount} expired files, aborted ${uploadsResult.abortedCount} stalled uploads.`);
      }
    } finally {
      this.isRunning = false;
    }
  }

  start(intervalMs = 10 * 60 * 1000): void {
    if (this.timer) return;
    // Run initial sweep after short 5-second delay
    setTimeout(() => this.runSweep(), 5000);
    this.timer = setInterval(() => this.runSweep(), intervalMs);
    console.log(`[CleanupService] Background cleanup worker started (interval: ${intervalMs / 1000}s).`);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('[CleanupService] Background cleanup worker stopped.');
    }
  }
}
