import { z } from 'zod';

const ConfigSchema = z.object({
  DISCORD_TOKEN: z.string().min(1, 'DISCORD_TOKEN is required'),
  DISCORD_CLIENT_ID: z.string().min(1, 'DISCORD_CLIENT_ID is required'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  STORAGE_TYPE: z.enum(['local', 's3']).default('local'),
  S3_ENDPOINT: z.string().default('http://localhost:9000'),
  S3_BUCKET: z.string().default('discord-uploads'),
  S3_REGION: z.string().default('auto'),
  S3_ACCESS_KEY_ID: z.string().default('minioadmin'),
  S3_SECRET_ACCESS_KEY: z.string().default('minioadminpassword'),
  PORT: z.coerce.number().default(3000),
  BASE_URL: z.string().default('http://localhost:3000'),
  MAX_FILE_SIZE_BYTES: z.coerce.number().default(2 * 1024 * 1024 * 1024), // 2 GB
  DEFAULT_USER_QUOTA_BYTES: z.coerce.number().default(5 * 1024 * 1024 * 1024), // 5 GB
  ADMIN_DISCORD_USER_IDS: z
    .string()
    .default('')
    .transform((val) =>
      val
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    ),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export function getConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  return ConfigSchema.parse(env);
}
