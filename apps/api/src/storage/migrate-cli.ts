import { fileURLToPath } from 'node:url';
import { openDatabase, runMigrations } from './database.js';

const databasePath = process.env.DATABASE_PATH ?? './data/flight-on-time.sqlite';
const migrationsDirectory = fileURLToPath(new URL('./migrations/', import.meta.url));
const database = openDatabase(databasePath);

try {
  runMigrations(database, migrationsDirectory);
  console.info('Database migrations applied.');
} finally {
  database.close();
}
