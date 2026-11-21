import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import Database from 'better-sqlite3';

export type SqliteDatabase = InstanceType<typeof Database>;

export function openDatabase(filename: string): SqliteDatabase {
  if (filename !== ':memory:') {
    const databasePath = isAbsolute(filename) ? filename : resolve(filename);
    mkdirSync(dirname(databasePath), { recursive: true });
  }

  const database = new Database(filename);
  database.pragma('foreign_keys = ON');
  database.pragma('busy_timeout = 5000');

  if (filename !== ':memory:') {
    database.pragma('journal_mode = WAL');
    database.pragma('synchronous = NORMAL');
  }

  return database;
}

export function runMigrations(database: SqliteDatabase, migrationsDirectory: string): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const migrationFiles = readdirSync(migrationsDirectory)
    .filter((filename) => filename.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right));

  for (const filename of migrationFiles) {
    const applied = database
      .prepare('SELECT version FROM schema_migrations WHERE version = ?')
      .get(filename);

    if (applied) {
      continue;
    }

    const migration = readFileSync(resolve(migrationsDirectory, filename), 'utf8');
    const applyMigration = database.transaction(() => {
      database.exec(migration);
      database
        .prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')
        .run(filename, new Date().toISOString());
    });

    applyMigration();
  }
}

export async function backupDatabase(
  source: SqliteDatabase,
  destinationPath: string,
): Promise<void> {
  const resolvedDestination = isAbsolute(destinationPath)
    ? destinationPath
    : resolve(destinationPath);
  mkdirSync(dirname(resolvedDestination), { recursive: true });
  await source.backup(resolvedDestination);
}
