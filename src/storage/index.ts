import { AppConfig } from '../config/index.js';
import { S3StorageService, createStorageClient } from './s3.js';
import { LocalStorageService } from './localStorage.js';

export function getStorageService(config: AppConfig): S3StorageService {
  if (config.STORAGE_TYPE === 'local' || !config.S3_ENDPOINT || config.S3_ENDPOINT.includes('localhost:9000')) {
    return new LocalStorageService(config);
  }
  return createStorageClient(config);
}

export * from './s3.js';
export * from './localStorage.js';
