import { describe, it, expect } from 'vitest';
import { runMigrations, getMigrationSql } from '../../src/db/migrate.js';

describe('runMigrations', () => {
  it('exports runMigrations and getMigrationSql functions', () => {
    expect(typeof runMigrations).toBe('function');
    expect(typeof getMigrationSql).toBe('function');
  });

  it('reads valid schema SQL containing all required tables and indexes', () => {
    const sql = getMigrationSql();
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS users');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS files');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS upload_sessions');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS download_events');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS file_reports');
    expect(sql).toContain('delete_after');
    expect(sql).toContain('token_hash');
    expect(sql).toContain('is_private');
    expect(sql).toContain('storage_deleted');
  });
});
