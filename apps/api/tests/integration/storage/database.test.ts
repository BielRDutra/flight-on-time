import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase, runMigrations } from '../../../src/storage/database.js';

describe('SQLite database', () => {
  let temporaryDirectory: string | undefined;
  let database: InstanceType<typeof Database> | undefined;

  afterEach(() => {
    database?.close();
    database = undefined;

    if (temporaryDirectory) {
      rmSync(temporaryDirectory, { recursive: true, force: true });
      temporaryDirectory = undefined;
    }
  });

  it('enables foreign keys and WAL for a file-backed database', () => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), 'flight-on-time-db-'));
    database = openDatabase(join(temporaryDirectory, 'test.sqlite'));

    const db = database;
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal');

    db.exec(`
      CREATE TABLE parent (id TEXT PRIMARY KEY);
      CREATE TABLE child (
        parent_id TEXT NOT NULL REFERENCES parent(id)
      );
    `);

    expect(() => db.prepare('INSERT INTO child (parent_id) VALUES (?)').run('missing')).toThrow();
  });

  it('applies migrations in filename order', () => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), 'flight-on-time-migrations-'));
    const migrationsDirectory = join(temporaryDirectory, 'migrations');
    mkdirSync(migrationsDirectory);
    writeFileSync(join(migrationsDirectory, '002_second.sql'), 'CREATE TABLE second (id TEXT);');
    writeFileSync(join(migrationsDirectory, '001_first.sql'), 'CREATE TABLE first (id TEXT);');
    database = openDatabase(join(temporaryDirectory, 'test.sqlite'));
    const db = database;

    runMigrations(db, migrationsDirectory);

    expect(db.prepare('SELECT version FROM schema_migrations ORDER BY version').all()).toEqual([
      { version: '001_first.sql' },
      { version: '002_second.sql' },
    ]);
  });

  it('rolls back the failing migration without undoing earlier migrations', () => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), 'flight-on-time-rollback-'));
    const migrationsDirectory = join(temporaryDirectory, 'migrations');
    mkdirSync(migrationsDirectory);
    writeFileSync(join(migrationsDirectory, '001_first.sql'), 'CREATE TABLE first (id TEXT);');
    writeFileSync(
      join(migrationsDirectory, '002_broken.sql'),
      'CREATE TABLE partial_table (id TEXT); INSERT INTO missing_table VALUES (1);',
    );
    database = openDatabase(join(temporaryDirectory, 'test.sqlite'));
    const db = database;

    expect(() => runMigrations(db, migrationsDirectory)).toThrow();
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'first'").get(),
    ).toEqual({ name: 'first' });
    expect(
      db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'partial_table'")
        .get(),
    ).toBeUndefined();
    expect(db.prepare('SELECT version FROM schema_migrations ORDER BY version').all()).toEqual([
      { version: '001_first.sql' },
    ]);
  });
});
