import pg from 'pg';
import { AppConfig, getConfig } from '../config/index.js';

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getDbPool(config?: AppConfig): pg.Pool {
  if (!pool) {
    const appConfig = config || getConfig();
    pool = new Pool({
      connectionString: appConfig.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }
  return pool;
}

export async function closeDbPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
