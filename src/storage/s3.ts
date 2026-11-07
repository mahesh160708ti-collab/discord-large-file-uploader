import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  HeadObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { AppConfig } from '../config/index.js';

export interface S3Part {
  PartNumber: number;
  ETag: string;
}

export interface S3StorageService {
  client: S3Client;
  bucket: string;
  initiateMultipart(key: string, contentType: string): Promise<string>;
  getPresignedPartUrls(key: string, uploadId: string, partNumbers: number[], ttlSeconds?: number): Promise<string[]>;
  completeMultipart(key: string, uploadId: string, parts: S3Part[]): Promise<void>;
  abortMultipart(key: string, uploadId: string): Promise<void>;
  getObjectSize(key: string): Promise<number>;
  getObjectHeader(key: string, bytes?: number): Promise<Buffer>;
  getPresignedDownloadUrl(key: string, filename: string, contentType: string, ttlSeconds?: number): Promise<string>;
  deleteObject(key: string): Promise<void>;
}

export function createStorageClient(config: AppConfig): S3StorageService {
  const client = new S3Client({
    endpoint: config.S3_ENDPOINT,
    region: config.S3_REGION || 'auto',
    credentials: {
      accessKeyId: config.S3_ACCESS_KEY_ID,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true,
  });

  const bucket = config.S3_BUCKET;

  return {
    client,
    bucket,

    async initiateMultipart(key: string, contentType: string): Promise<string> {
      const command = new CreateMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType || 'application/octet-stream',
      });
      const response = await client.send(command);
      if (!response.UploadId) {
        throw new Error('Failed to obtain UploadId from S3 storage');
      }
      return response.UploadId;
    },

    async getPresignedPartUrls(
      key: string,
      uploadId: string,
      partNumbers: number[],
      ttlSeconds = 900
    ): Promise<string[]> {
      const urls: string[] = [];
      for (const partNumber of partNumbers) {
        const command = new UploadPartCommand({
          Bucket: bucket,
          Key: key,
          UploadId: uploadId,
          PartNumber: partNumber,
        });
        const url = await getSignedUrl(client, command, { expiresIn: ttlSeconds });
        urls.push(url);
      }
      return urls;
    },

    async completeMultipart(key: string, uploadId: string, parts: S3Part[]): Promise<void> {
      // S3 requires parts to be sorted in ascending order by PartNumber
      const sortedParts = [...parts].sort((a, b) => a.PartNumber - b.PartNumber);
      const command = new CompleteMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: sortedParts,
        },
      });
      await client.send(command);
    },

    async abortMultipart(key: string, uploadId: string): Promise<void> {
      const command = new AbortMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
      });
      await client.send(command);
    },

    async getObjectSize(key: string): Promise<number> {
      const command = new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      });
      const response = await client.send(command);
      return response.ContentLength || 0;
    },

    async getObjectHeader(key: string, bytes = 512): Promise<Buffer> {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        Range: `bytes=0-${bytes - 1}`,
      });
      const response = await client.send(command);
      if (!response.Body) {
        return Buffer.alloc(0);
      }
      const stream = response.Body as any;
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    },

    async getPresignedDownloadUrl(
      key: string,
      filename: string,
      contentType: string,
      ttlSeconds = 300
    ): Promise<string> {
      const safeFilename = filename.replace(/"/g, '');
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        ResponseContentDisposition: `attachment; filename="${safeFilename}"`,
        ResponseContentType: contentType || 'application/octet-stream',
      });
      return await getSignedUrl(client, command, { expiresIn: ttlSeconds });
    },

    async deleteObject(key: string): Promise<void> {
      const command = new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      });
      await client.send(command);
    },
  };
}
