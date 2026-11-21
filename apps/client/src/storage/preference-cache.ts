import {
  preferenceSnapshotSchema,
  preferenceUpdateSchema,
  type PreferenceSnapshot,
  type PreferenceUpdate,
} from '@flight-on-time/contracts';

export type PreferenceSyncState = 'synced' | 'pending' | 'failed' | 'conflict';

export interface CachedAccountPreferenceState {
  accountId: string;
  snapshot: PreferenceSnapshot;
  pendingUpdate: PreferenceUpdate | null;
  syncState: PreferenceSyncState;
  etag: string;
  updatedAt: string;
}

export type SqliteBindPrimitive = string | number | null | boolean | Uint8Array;

export interface ClientPreferenceSqliteDriver {
  execAsync(source: string): Promise<void>;
  getFirstAsync<T>(source: string, params?: readonly SqliteBindPrimitive[]): Promise<T | null>;
  runAsync(source: string, params?: readonly SqliteBindPrimitive[]): Promise<unknown>;
}

interface CacheRow {
  account_id: string;
  snapshot_json: string;
  pending_update_json: string | null;
  sync_state: PreferenceSyncState;
  etag: string;
  updated_at: string;
}

export const CLIENT_PREFERENCE_MIGRATION_001 = `
CREATE TABLE IF NOT EXISTS account_preference_cache (
  account_id TEXT PRIMARY KEY,
  snapshot_json TEXT NOT NULL,
  pending_update_json TEXT,
  sync_state TEXT NOT NULL CHECK (sync_state IN ('synced', 'pending', 'failed', 'conflict')),
  etag TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

export const EMPTY_PREFERENCE_SNAPSHOT: PreferenceSnapshot = {
  airportIcaos: [],
  airlineIds: [],
  eventTypes: [],
  notificationsEnabled: false,
  revision: 0,
  updatedAt: null,
};

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

export class AccountPreferenceCache {
  private initialized = false;

  constructor(private readonly driver: ClientPreferenceSqliteDriver) {}

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await this.driver.execAsync(CLIENT_PREFERENCE_MIGRATION_001);
    this.initialized = true;
  }

  async getAccountState(accountId: string): Promise<CachedAccountPreferenceState | null> {
    await this.initialize();

    const row = await this.driver.getFirstAsync<CacheRow>(
      `
      SELECT account_id, snapshot_json, pending_update_json, sync_state, etag, updated_at
      FROM account_preference_cache WHERE account_id = ?
      `,
      [accountId],
    );

    if (!row) {
      return null;
    }

    const parsedSnapshot = preferenceSnapshotSchema.safeParse(JSON.parse(row.snapshot_json));
    if (!parsedSnapshot.success) {
      return null;
    }

    let pendingUpdate: PreferenceUpdate | null = null;
    if (row.pending_update_json) {
      const parsedPending = preferenceUpdateSchema.safeParse(JSON.parse(row.pending_update_json));
      if (parsedPending.success) {
        pendingUpdate = parsedPending.data;
      }
    }

    return {
      accountId: row.account_id,
      snapshot: parsedSnapshot.data,
      pendingUpdate,
      syncState: row.sync_state,
      etag: row.etag,
      updatedAt: row.updated_at,
    };
  }

  async saveSyncedSnapshot(
    accountId: string,
    snapshot: PreferenceSnapshot,
    etag: string,
    updatedAt = new Date().toISOString(),
  ): Promise<CachedAccountPreferenceState> {
    await this.initialize();

    await this.driver.runAsync(
      `
      INSERT INTO account_preference_cache (
        account_id, snapshot_json, pending_update_json, sync_state, etag, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (account_id) DO UPDATE SET
        snapshot_json = excluded.snapshot_json,
        pending_update_json = excluded.pending_update_json,
        sync_state = excluded.sync_state,
        etag = excluded.etag,
        updated_at = excluded.updated_at
      `,
      [accountId, JSON.stringify(snapshot), null, 'synced', etag, updatedAt],
    );

    return {
      accountId,
      snapshot,
      pendingUpdate: null,
      syncState: 'synced',
      etag,
      updatedAt,
    };
  }

  async savePendingUpdate(input: {
    accountId: string;
    snapshot: PreferenceSnapshot;
    pendingUpdate: PreferenceUpdate;
    syncState: Exclude<PreferenceSyncState, 'synced'>;
    etag: string;
    updatedAt?: string;
  }): Promise<CachedAccountPreferenceState> {
    await this.initialize();
    const updatedAt = input.updatedAt ?? new Date().toISOString();

    await this.driver.runAsync(
      `
      INSERT INTO account_preference_cache (
        account_id, snapshot_json, pending_update_json, sync_state, etag, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (account_id) DO UPDATE SET
        snapshot_json = excluded.snapshot_json,
        pending_update_json = excluded.pending_update_json,
        sync_state = excluded.sync_state,
        etag = excluded.etag,
        updated_at = excluded.updated_at
      `,
      [
        input.accountId,
        JSON.stringify(input.snapshot),
        JSON.stringify(input.pendingUpdate),
        input.syncState,
        input.etag,
        updatedAt,
      ],
    );

    return {
      accountId: input.accountId,
      snapshot: input.snapshot,
      pendingUpdate: input.pendingUpdate,
      syncState: input.syncState,
      etag: input.etag,
      updatedAt,
    };
  }

  async clearAccount(accountId: string): Promise<void> {
    await this.initialize();
    await this.driver.runAsync('DELETE FROM account_preference_cache WHERE account_id = ?', [
      accountId,
    ]);
  }

  async clearAllVisibleCaches(): Promise<void> {
    await this.initialize();
    await this.driver.runAsync('DELETE FROM account_preference_cache', []);
  }
}
