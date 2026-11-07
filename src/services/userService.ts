import pg from 'pg';
import { AppConfig } from '../config/index.js';

export interface UserStorageInfo {
  usedBytes: number;
  quotaBytes: number;
  isBanned: boolean;
}

export class UserService {
  constructor(
    private pool: pg.Pool,
    private config: AppConfig
  ) {}

  async ensureUser(discordUserId: string): Promise<{ discord_user_id: string; is_banned: boolean }> {
    const query = `
      INSERT INTO users (discord_user_id)
      VALUES ($1)
      ON CONFLICT (discord_user_id)
      DO UPDATE SET updated_at = NOW()
      RETURNING discord_user_id, is_banned;
    `;
    const res = await this.pool.query(query, [discordUserId]);
    return res.rows[0];
  }

  async getUserStorage(discordUserId: string): Promise<UserStorageInfo> {
    const user = await this.ensureUser(discordUserId);

    // Sum active bytes: only files that are completed, not expired, and not download-exhausted
    const query = `
      SELECT COALESCE(SUM(size_bytes), 0) AS total_used
      FROM files
      WHERE owner_discord_id = $1
        AND status = 'completed'
        AND expires_at > NOW()
        AND download_count < max_downloads;
    `;
    const res = await this.pool.query(query, [discordUserId]);
    const usedBytes = parseInt(res.rows[0]?.total_used || '0', 10);

    return {
      usedBytes,
      quotaBytes: this.config.DEFAULT_USER_QUOTA_BYTES,
      isBanned: user.is_banned,
    };
  }
}
