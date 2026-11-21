import { fileURLToPath } from 'node:url';
import { openDatabase, runMigrations } from './database.js';

export { runMigrations };

const DEFAULT_DATABASE_PATH = './data/flight-on-time.sqlite';

export function resolveDefaultMigrationsDirectory(): string {
  return fileURLToPath(new URL('./migrations/', import.meta.url));
}

export function migrateDatabase(
  databasePath = process.env.DATABASE_PATH ?? DEFAULT_DATABASE_PATH,
  migrationsDirectory = resolveDefaultMigrationsDirectory(),
): void {
  const database = openDatabase(databasePath);

  try {
    runMigrations(database, migrationsDirectory);
  } finally {
    database.close();
  }
}
