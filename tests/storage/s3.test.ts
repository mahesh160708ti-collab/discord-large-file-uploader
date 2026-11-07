import { describe, it, expect, vi } from 'vitest';
import { createStorageClient } from '../../src/storage/s3.js';

describe('S3StorageService', () => {
  it('instantiates the service with all required storage methods', () => {
    const mockConfig = {
      S3_ENDPOINT: 'http://localhost:9000',
      S3_BUCKET: 'test-bucket',
      S3_REGION: 'auto',
      S3_ACCESS_KEY_ID: 'test',
      S3_SECRET_ACCESS_KEY: 'test',
    } as any;

    const storage = createStorageClient(mockConfig);
    expect(typeof storage.initiateMultipart).toBe('function');
    expect(typeof storage.getPresignedPartUrls).toBe('function');
    expect(typeof storage.completeMultipart).toBe('function');
    expect(typeof storage.abortMultipart).toBe('function');
    expect(typeof storage.getObjectSize).toBe('function');
    expect(typeof storage.getObjectHeader).toBe('function');
    expect(typeof storage.getPresignedDownloadUrl).toBe('function');
    expect(typeof storage.deleteObject).toBe('function');
  });
});
