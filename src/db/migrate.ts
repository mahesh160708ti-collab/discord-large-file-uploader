import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { getDbPool, closeDbPool } from './client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function getMigrationSql(): string {
  const candidates = [
    path.resolve(__dirname, 'migrations/001_initial_schema.sql'),
    path.resolve(__dirname, '../src/db/migrations/001_initial_schema.sql'),
    path.resolve(process.cwd(), 'src/db/migrations/001_initial_schema.sql'),
    path.resolve(process.cwd(), 'dist/db/migrations/001_initial_schema.sql'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return fs.readFileSync(candidate, 'utf-8');
    }
  }

  throw new Error(`Migration SQL file not found in paths: ${candidates.join(', ')}`);
}

export async function runMigrations(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create schema_migrations tracking table
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(64) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const result = await client.query('SELECT version FROM schema_migrations WHERE version = $1', [
      '001_initial_schema',
    ]);

    if (result.rows.length === 0) {
      const sql = getMigrationSql();
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [
        '001_initial_schema',
      ]);
      console.log('Applied migration: 001_initial_schema');
    } else {
      console.log('Migration 001_initial_schema already applied.');
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Allow direct CLI invocation
if (process.argv[1] === __filename) {
  const pool = getDbPool();
  runMigrations(pool)
    .then(async () => {
      console.log('Migrations completed successfully.');
      await closeDbPool();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('Migration failed:', err);
      await closeDbPool();
      process.exit(1);
    });
}
