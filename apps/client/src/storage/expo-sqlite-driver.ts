import type { ClientPreferenceSqliteDriver, SqliteBindPrimitive } from './preference-cache';

export async function createExpoPreferenceSqliteDriver(
  databaseName = 'flight_on_time_client.db',
): Promise<ClientPreferenceSqliteDriver> {
  const SQLite = await import('expo-sqlite');
  const db = await SQLite.openDatabaseAsync(databaseName);

  return {
    execAsync: (source) => db.execAsync(source),
    getFirstAsync: <T,>(source: string, params: readonly SqliteBindPrimitive[] = []) =>
      db.getFirstAsync<T>(source, [...params]),
    runAsync: (source, params: readonly SqliteBindPrimitive[] = []) =>
      db.runAsync(source, [...params]),
  };
}
