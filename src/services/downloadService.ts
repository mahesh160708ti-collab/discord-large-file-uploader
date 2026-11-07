import crypto from 'crypto';
import pg from 'pg';
import { S3StorageService } from '../storage/s3.js';
import { FileRecord } from './uploadService.js';

export interface FileDownloadAccess {
  file?: FileRecord;
  isAccessible: boolean;
  reason?: string;
}

export class DownloadService {
  constructor(
    private pool: pg.Pool,
    private storage: S3StorageService
  ) {}

  static hashIp(ip: string): string {
    return crypto.createHash('sha256').update(ip || 'unknown').digest('hex');
  }

  async getFileForDownload(publicId: string): Promise<FileDownloadAccess> {
    const res = await this.pool.query('SELECT * FROM files WHERE public_id = $1', [publicId]);
    if (res.rows.length === 0) {
      return { isAccessible: false, reason: 'File not found.' };
    }

    const file: FileRecord = res.rows[0];

    if (file.status === 'deleted') {
      return { isAccessible: false, reason: 'File has been deleted.' };
    }

    if (file.status === 'banned') {
      return { isAccessible: false, reason: 'File is unavailable due to policy violation.' };
    }

    if (file.status === 'quarantined') {
      return { isAccessible: false, reason: 'File has been quarantined pending safety review.' };
    }

    const now = new Date();
    if (now > new Date(file.expires_at)) {
      return { isAccessible: false, reason: 'File download link has expired.' };
    }

    if (file.download_count >= file.max_downloads) {
      // Accelerate physical cleanup to 1 hour
      await this.pool.query(
        "UPDATE files SET delete_after = NOW() + INTERVAL '1 hour' WHERE id = $1 AND delete_after > NOW() + INTERVAL '1 hour'",
        [file.id]
      );
      return { isAccessible: false, reason: 'Download limit reached for this file.' };
    }

    return { file, isAccessible: true };
  }

  async generateDownloadUrl(publicId: string, ip: string): Promise<string> {
    const access = await this.getFileForDownload(publicId);
    if (!access.isAccessible || !access.file) {
      throw new Error(access.reason || 'File is not accessible for download.');
    }

    const file = access.file;
    const ipHash = DownloadService.hashIp(ip);

    // Increment download count atomically to prevent race condition
    const updateRes = await this.pool.query(
      `
      UPDATE files
      SET download_count = download_count + 1,
          delete_after = CASE
            WHEN download_count + 1 >= max_downloads THEN NOW() + INTERVAL '1 hour'
            ELSE delete_after
          END
      WHERE id = $1 AND download_count < max_downloads
      RETURNING *;
      `,
      [file.id]
    );

    if (updateRes.rowCount === 0) {
      throw new Error('Download limit reached for this file.');
    }

    await this.pool.query(
      'INSERT INTO download_events (file_id, ip_hash) VALUES ($1, $2);',
      [file.id, ipHash]
    );

    return await this.storage.getPresignedDownloadUrl(
      file.storage_key,
      file.original_filename,
      file.content_type || 'application/octet-stream',
      300 // 5 minutes signed URL
    );
  }

  async submitAbuseReport(
    publicId: string,
    ip: string,
    reason: string
  ): Promise<{ reported: boolean; quarantined: boolean }> {
    const res = await this.pool.query('SELECT id, status FROM files WHERE public_id = $1', [publicId]);
    if (res.rows.length === 0) {
      return { reported: false, quarantined: false };
    }

    const file = res.rows[0];
    const ipHash = DownloadService.hashIp(ip);

    await this.pool.query(
      'INSERT INTO file_reports (file_id, reporter_ip_hash, reason) VALUES ($1, $2, $3)',
      [file.id, ipHash, reason]
    );

    // Count reports
    const countRes = await this.pool.query(
      'SELECT COUNT(DISTINCT reporter_ip_hash) AS report_count FROM file_reports WHERE file_id = $1',
      [file.id]
    );

    const reportCount = parseInt(countRes.rows[0]?.report_count || '0', 10);
    let quarantined = false;

    if (reportCount >= 3 && file.status === 'completed') {
      await this.pool.query("UPDATE files SET status = 'quarantined' WHERE id = $1", [file.id]);
      quarantined = true;
    }

    return { reported: true, quarantined };
  }
}
