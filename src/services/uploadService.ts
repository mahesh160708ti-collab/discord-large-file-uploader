import crypto from 'crypto';
import pg from 'pg';
import { AppConfig } from '../config/index.js';
import { S3Part, S3StorageService } from '../storage/s3.js';
import { UserService } from './userService.js';
import { validateFilename } from '../security/validator.js';
import { detectDisguisedBinary } from '../security/magicBytes.js';

export interface CreateSessionParams {
  ownerDiscordId: string;
  guildId?: string | null;
  channelId?: string | null;
  requestedExpirationSeconds: number;
  maxDownloads?: number;
  isPrivate?: boolean;
}

export interface UploadSessionRecord {
  id: string;
  token_hash: string;
  owner_discord_id: string;
  guild_id: string | null;
  channel_id: string | null;
  is_private: boolean;
  upload_id: string | null;
  storage_key: string | null;
  original_filename: string | null;
  expected_size_bytes: string | null;
  requested_expiration_seconds: number;
  max_downloads: number;
  expires_at: Date;
  completed_at: Date | null;
  created_at: Date;
}

export interface FileRecord {
  id: string;
  owner_discord_id: string;
  guild_id: string | null;
  channel_id: string | null;
  storage_key: string;
  original_filename: string;
  size_bytes: string;
  content_type: string;
  public_id: string;
  expires_at: Date;
  delete_after: Date;
  status: string;
  download_count: number;
  max_downloads: number;
  created_at: Date;
}

export class UploadService {
  public static readonly CHUNK_SIZE = 16 * 1024 * 1024; // 16 MB per chunk for high-speed throughput

  constructor(
    private pool: pg.Pool,
    private storage: S3StorageService,
    private userService: UserService,
    private config: AppConfig
  ) {}

  static hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  static generatePublicId(length = 10): string {
    const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const bytes = crypto.randomBytes(length);
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars[bytes[i] % chars.length];
    }
    return result;
  }

  async createSession(params: CreateSessionParams): Promise<{
    rawToken: string;
    uploadUrl: string;
    expiresAt: Date;
  }> {
    const user = await this.userService.getUserStorage(params.ownerDiscordId);
    if (user.isBanned) {
      throw new Error('User is prohibited from uploading files.');
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = UploadService.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes TTL

    const query = `
      INSERT INTO upload_sessions (
        token_hash, owner_discord_id, guild_id, channel_id, is_private,
        requested_expiration_seconds, max_downloads, expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, expires_at;
    `;

    await this.pool.query(query, [
      tokenHash,
      params.ownerDiscordId,
      params.guildId || null,
      params.channelId || null,
      params.isPrivate || false,
      params.requestedExpirationSeconds,
      params.maxDownloads || 100,
      expiresAt,
    ]);

    return {
      rawToken,
      uploadUrl: `${this.config.BASE_URL}/upload/${rawToken}`,
      expiresAt,
    };
  }

  async getSessionByToken(rawToken: string): Promise<UploadSessionRecord | null> {
    const tokenHash = UploadService.hashToken(rawToken);
    const query = `
      SELECT * FROM upload_sessions
      WHERE token_hash = $1
        AND expires_at > NOW()
        AND completed_at IS NULL;
    `;
    const res = await this.pool.query(query, [tokenHash]);
    return res.rows[0] || null;
  }

  async initiateUpload(
    rawToken: string,
    filename: string,
    sizeBytes: number,
    contentType: string
  ): Promise<{ uploadId: string; storageKey: string; chunkSize: number }> {
    const session = await this.getSessionByToken(rawToken);
    if (!session) {
      throw new Error('Upload session not found, expired, or already completed.');
    }

    // 1. Filename validation and sanitization
    const fileValidation = validateFilename(filename);
    if (!fileValidation.isValid) {
      throw new Error(fileValidation.reason || 'Invalid filename.');
    }

    // 2. Maximum single file size check
    if (sizeBytes > this.config.MAX_FILE_SIZE_BYTES) {
      throw new Error(`File size exceeds maximum permitted limit (${this.config.MAX_FILE_SIZE_BYTES / (1024 * 1024 * 1024)} GB).`);
    }

    // 3. User quota check
    const userStorage = await this.userService.getUserStorage(session.owner_discord_id);
    if (userStorage.usedBytes + sizeBytes > userStorage.quotaBytes) {
      const remainingBytes = Math.max(0, userStorage.quotaBytes - userStorage.usedBytes);
      const remainingMb = (remainingBytes / (1024 * 1024)).toFixed(1);
      throw new Error(`File size exceeds your remaining storage quota (${remainingMb} MB remaining).`);
    }

    // 4. Generate partitioned storage path
    const now = new Date();
    const datePath = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${String(now.getUTCDate()).padStart(2, '0')}`;
    const storageKey = `objects/${datePath}/${crypto.randomUUID()}/${fileValidation.sanitizedName}`;

    // 5. Initiate multipart upload on S3/R2
    const uploadId = await this.storage.initiateMultipart(storageKey, contentType);

    // 6. Update session
    await this.pool.query(
      `
      UPDATE upload_sessions
      SET upload_id = $1, storage_key = $2, original_filename = $3, expected_size_bytes = $4
      WHERE id = $5;
      `,
      [uploadId, storageKey, fileValidation.sanitizedName, sizeBytes, session.id]
    );

    return {
      uploadId,
      storageKey,
      chunkSize: UploadService.CHUNK_SIZE,
    };
  }

  async getPartUrls(rawToken: string, partNumbers: number[]): Promise<string[]> {
    const session = await this.getSessionByToken(rawToken);
    if (!session || !session.upload_id || !session.storage_key) {
      throw new Error('Upload session has not been initiated.');
    }

    return await this.storage.getPresignedPartUrls(session.storage_key, session.upload_id, partNumbers);
  }

  async completeUpload(rawToken: string, parts: S3Part[]): Promise<FileRecord> {
    const session = await this.getSessionByToken(rawToken);
    if (!session || !session.upload_id || !session.storage_key || !session.original_filename) {
      throw new Error('Invalid or uninitiated upload session.');
    }

    // 1. Complete S3 multipart
    await this.storage.completeMultipart(session.storage_key, session.upload_id, parts);

    // 2. Query actual size from S3
    const actualSizeBytes = await this.storage.getObjectSize(session.storage_key);

    // 2a. Server-side verification of maximum file size on actual uploaded bytes
    if (actualSizeBytes > this.config.MAX_FILE_SIZE_BYTES) {
      await this.storage.deleteObject(session.storage_key);
      await this.pool.query('UPDATE upload_sessions SET completed_at = NOW() WHERE id = $1', [session.id]);
      throw new Error(`File size exceeds maximum permitted limit (${this.config.MAX_FILE_SIZE_BYTES / (1024 * 1024 * 1024)} GB).`);
    }

    // 2b. Server-side verification of user storage quota against actual uploaded bytes
    const userStorage = await this.userService.getUserStorage(session.owner_discord_id);
    if (userStorage.usedBytes + actualSizeBytes > userStorage.quotaBytes) {
      await this.storage.deleteObject(session.storage_key);
      await this.pool.query('UPDATE upload_sessions SET completed_at = NOW() WHERE id = $1', [session.id]);
      throw new Error('File size exceeds your remaining storage quota.');
    }

    // 2c. Server-side magic byte inspection of the assembled object
    const declaredExt = session.original_filename.split('.').pop()?.toLowerCase();
    const headerBytes = await this.storage.getObjectHeader(session.storage_key, 512);
    const detection = detectDisguisedBinary(headerBytes, declaredExt);
    if (detection.isMalicious) {
      await this.storage.deleteObject(session.storage_key);
      await this.pool.query('UPDATE upload_sessions SET completed_at = NOW() WHERE id = $1', [session.id]);
      await this.pool.query('UPDATE users SET is_banned = TRUE WHERE discord_user_id = $1', [session.owner_discord_id]);
      throw new Error(`Security violation: ${detection.detectedType} detected. Disguised executable binaries and malicious shortcuts are strictly prohibited.`);
    }

    // 3. Compute expiration and deletion timestamps
    const expiresAt = new Date(Date.now() + session.requested_expiration_seconds * 1000);
    const deleteAfter = new Date(expiresAt.getTime() + 60 * 60 * 1000); // +1 hour grace
    const publicId = UploadService.generatePublicId(10);

    // 4. Insert into files table
    const fileInsertQuery = `
      INSERT INTO files (
        owner_discord_id, guild_id, channel_id, storage_key, original_filename,
        size_bytes, public_id, expires_at, delete_after, max_downloads, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'completed')
      RETURNING *;
    `;

    const fileRes = await this.pool.query(fileInsertQuery, [
      session.owner_discord_id,
      session.guild_id,
      session.channel_id,
      session.storage_key,
      session.original_filename,
      actualSizeBytes,
      publicId,
      expiresAt,
      deleteAfter,
      session.max_downloads,
    ]);

    // 5. Mark session as completed
    await this.pool.query('UPDATE upload_sessions SET completed_at = NOW() WHERE id = $1', [session.id]);

    return fileRes.rows[0];
  }
}
