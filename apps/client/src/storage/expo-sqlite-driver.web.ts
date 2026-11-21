import type { ClientPreferenceSqliteDriver, SqliteBindPrimitive } from './preference-cache';

const STORAGE_PREFIX = 'flight_on_time.pref_cache:';

export async function createExpoPreferenceSqliteDriver(): Promise<ClientPreferenceSqliteDriver> {
  const memoryFallback = new Map<string, string>();
  const storage =
    typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
      ? window.localStorage
      : null;

  return {
    async execAsync() {
      // No-op on web storage fallback
    },
    async getFirstAsync<T>(_sql: string, params: readonly SqliteBindPrimitive[] = []): Promise<T | null> {
      const accountId = String(params[0] ?? '');
      const raw = storage
        ? storage.getItem(`${STORAGE_PREFIX}${accountId}`)
        : (memoryFallback.get(accountId) ?? null);
      return raw ? (JSON.parse(raw) as T) : null;
    },
    async runAsync(sql: string, params: readonly SqliteBindPrimitive[] = []): Promise<void> {
      if (sql.includes('INSERT INTO account_preference_cache')) {
        const [accountId, snapshotJson, pendingJson, syncState, etag, updatedAt] = params;
        const key = String(accountId);
        const serialized = JSON.stringify({
          account_id: accountId,
          snapshot_json: snapshotJson,
          pending_update_json: pendingJson,
          sync_state: syncState,
          etag,
          updated_at: updatedAt,
        });
        if (storage) {
          storage.setItem(`${STORAGE_PREFIX}${key}`, serialized);
        } else {
          memoryFallback.set(key, serialized);
        }
      } else if (sql.includes('DELETE FROM account_preference_cache WHERE account_id = ?')) {
        const key = String(params[0] ?? '');
        if (storage) {
          storage.removeItem(`${STORAGE_PREFIX}${key}`);
        } else {
          memoryFallback.delete(key);
        }
      } else if (sql.includes('DELETE FROM account_preference_cache')) {
        if (storage) {
          const keysToRemove: string[] = [];
          for (let index = 0; index < storage.length; index += 1) {
            const key = storage.key(index);
            if (key?.startsWith(STORAGE_PREFIX)) {
              keysToRemove.push(key);
            }
          }
          for (const key of keysToRemove) {
            storage.removeItem(key);
          }
        } else {
          memoryFallback.clear();
        }
      }
    },
  };
}
