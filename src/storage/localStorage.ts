import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { AppConfig } from '../config/index.js';
import { S3StorageService, S3Part } from './s3.js';

export class LocalStorageService implements S3StorageService {
  client: any = null;
  bucket: string = 'local-storage';
  private uploadsDir: string;
  private tempDir: string;
  private secretKey: string;

  constructor(private config: AppConfig, baseDir = process.cwd()) {
    this.uploadsDir = path.join(baseDir, 'uploads', 'objects');
    this.tempDir = path.join(baseDir, 'uploads', 'temp');
    this.secretKey = config.DISCORD_TOKEN || 'local-storage-secret-key';
    fs.mkdirSync(this.uploadsDir, { recursive: true });
    fs.mkdirSync(this.tempDir, { recursive: true });
  }

  getUploadsPath(): string {
    return this.uploadsDir;
  }

  getTempPath(): string {
    return this.tempDir;
  }

  async initiateMultipart(key: string, contentType: string): Promise<string> {
    const uploadId = crypto.randomUUID();
    const sessionTempDir = path.join(this.tempDir, uploadId);
    await fs.promises.mkdir(sessionTempDir, { recursive: true });
    return uploadId;
  }

  async getPresignedPartUrls(
    key: string,
    uploadId: string,
    partNumbers: number[],
    ttlSeconds = 900
  ): Promise<string[]> {
    const urls: string[] = [];
    const expiresAt = Date.now() + ttlSeconds * 1000;
    for (const partNumber of partNumbers) {
      const signature = this.generatePartSignature(uploadId, partNumber, expiresAt);
      urls.push(
        `${this.config.BASE_URL}/api/local-storage/upload/${uploadId}/${partNumber}?exp=${expiresAt}&sig=${signature}`
      );
    }
    return urls;
  }

  async completeMultipart(key: string, uploadId: string, parts: S3Part[]): Promise<void> {
    const sessionTempDir = path.join(this.tempDir, uploadId);
    const destinationPath = path.join(this.uploadsDir, key);
    await fs.promises.mkdir(path.dirname(destinationPath), { recursive: true });

    // S3 requires parts to be sorted in ascending order by PartNumber
    const sortedParts = [...parts].sort((a, b) => a.PartNumber - b.PartNumber);
    const destStream = fs.createWriteStream(destinationPath, { flags: 'w' });

    for (const part of sortedParts) {
      const partFile = path.join(sessionTempDir, `part-${part.PartNumber}`);
      if (fs.existsSync(partFile)) {
        await pipeline(fs.createReadStream(partFile), destStream, { end: false });
      }
    }
    destStream.end();
    await new Promise<void>((resolve, reject) => {
      destStream.on('finish', resolve);
      destStream.on('error', reject);
    });

    // Clean up temporary session directory
    try {
      await fs.promises.rm(sessionTempDir, { recursive: true, force: true });
    } catch {
      // Ignored
    }
  }

  async abortMultipart(key: string, uploadId: string): Promise<void> {
    const sessionTempDir = path.join(this.tempDir, uploadId);
    try {
      await fs.promises.rm(sessionTempDir, { recursive: true, force: true });
    } catch {
      // Ignored
    }
  }

  async getObjectSize(key: string): Promise<number> {
    const filePath = path.join(this.uploadsDir, key);
    if (!fs.existsSync(filePath)) return 0;
    const stat = await fs.promises.stat(filePath);
    return stat.size;
  }

  async getObjectHeader(key: string, bytes = 512): Promise<Buffer> {
    const filePath = path.join(this.uploadsDir, key);
    if (!fs.existsSync(filePath)) return Buffer.alloc(0);
    const fd = await fs.promises.open(filePath, 'r');
    try {
      const buffer = Buffer.alloc(bytes);
      const { bytesRead } = await fd.read(buffer, 0, bytes, 0);
      return buffer.subarray(0, bytesRead);
    } finally {
      await fd.close();
    }
  }

  async getPresignedDownloadUrl(
    key: string,
    filename: string,
    contentType: string,
    ttlSeconds = 300
  ): Promise<string> {
    const expiresAt = Date.now() + ttlSeconds * 1000;
    const signature = this.generateDownloadSignature(key, expiresAt);
    return `${this.config.BASE_URL}/api/local-storage/download?key=${encodeURIComponent(
      key
    )}&filename=${encodeURIComponent(filename)}&exp=${expiresAt}&sig=${signature}`;
  }

  async deleteObject(key: string): Promise<void> {
    const filePath = path.join(this.uploadsDir, key);
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  }

  generatePartSignature(uploadId: string, partNumber: number, expiresAt: number): string {
    return crypto
      .createHmac('sha256', this.secretKey)
      .update(`${uploadId}:${partNumber}:${expiresAt}`)
      .digest('hex');
  }

  generateDownloadSignature(key: string, expiresAt: number): string {
    return crypto
      .createHmac('sha256', this.secretKey)
      .update(`${key}:${expiresAt}`)
      .digest('hex');
  }
}
