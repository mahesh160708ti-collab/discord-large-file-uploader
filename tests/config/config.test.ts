import { describe, it, expect } from 'vitest';
import { getConfig } from '../../src/config/index.js';

describe('AppConfig', () => {
  it('throws an error if required environment variables are missing', () => {
    expect(() => getConfig({})).toThrow(/DISCORD_TOKEN/);
  });

  it('parses valid environment variables with correct defaults', () => {
    const config = getConfig({
      DISCORD_TOKEN: 'mock-bot-token',
      DISCORD_CLIENT_ID: '123456789012345678',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/uploader',
      S3_ENDPOINT: 'http://localhost:9000',
      S3_BUCKET: 'discord-uploads',
      S3_REGION: 'auto',
      S3_ACCESS_KEY_ID: 'minioadmin',
      S3_SECRET_ACCESS_KEY: 'minioadmin',
      BASE_URL: 'http://localhost:3000',
      ADMIN_DISCORD_USER_IDS: '111,222',
    });

    expect(config.DISCORD_TOKEN).toBe('mock-bot-token');
    expect(config.MAX_FILE_SIZE_BYTES).toBe(2 * 1024 * 1024 * 1024); // 2 GB default
    expect(config.DEFAULT_USER_QUOTA_BYTES).toBe(5 * 1024 * 1024 * 1024); // 5 GB default
    expect(config.ADMIN_DISCORD_USER_IDS).toEqual(['111', '222']);
  });
});
