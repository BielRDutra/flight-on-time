import {
  preferenceSnapshotSchema,
  type PreferenceSnapshot,
  type PreferenceUpdate,
} from '@flight-on-time/contracts';
import {
  EMPTY_PREFERENCE_SNAPSHOT,
  type AccountPreferenceCache,
  type CachedAccountPreferenceState,
} from '../../storage/preference-cache';

export type ConflictResolutionStrategy = 'keep_server' | 'retry_local';

export interface PreferenceSyncCoordinatorOptions {
  apiBaseUrl: string;
  cache: AccountPreferenceCache;
  fetchImpl?: typeof fetch | undefined;
  bearerToken?: string | undefined;
}

export class PreferenceSyncCoordinator {
  private readonly fetchImpl: typeof fetch;
  private readonly apiBaseUrl: string;
  private readonly cache: AccountPreferenceCache;
  private readonly bearerToken?: string | undefined;

  constructor(options: PreferenceSyncCoordinatorOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.apiBaseUrl = options.apiBaseUrl.replace(/\/+$/, '');
    this.cache = options.cache;
    this.bearerToken = options.bearerToken;
  }

  private buildHeaders(extra: Record<string, string> = {}): Record<string, string> {
    return {
      ...(this.bearerToken ? { authorization: `Bearer ${this.bearerToken}` } : {}),
      ...extra,
    };
  }

  private async fetchRemoteSnapshot(): Promise<{ snapshot: PreferenceSnapshot; etag: string }> {
    const response = await this.fetchImpl(`${this.apiBaseUrl}/v1/me/preferences`, {
      method: 'GET',
      credentials: 'include',
      headers: this.buildHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Preference fetch failed with status ${response.status}`);
    }

    const parsed = preferenceSnapshotSchema.parse(await response.json());
    const etag = response.headers.get('etag') ?? `"${parsed.revision}"`;
    return { snapshot: parsed, etag };
  }

  async restore(accountId: string): Promise<CachedAccountPreferenceState> {
    const existing = await this.cache.getAccountState(accountId);

    try {
      const remote = await this.fetchRemoteSnapshot();

      if (existing && existing.pendingUpdate && existing.syncState !== 'synced') {
        if (remote.snapshot.revision !== existing.snapshot.revision) {
          return this.cache.savePendingUpdate({
            accountId,
            snapshot: remote.snapshot,
            pendingUpdate: existing.pendingUpdate,
            syncState: 'conflict',
            etag: remote.etag,
          });
        }

        return existing;
      }

      return this.cache.saveSyncedSnapshot(accountId, remote.snapshot, remote.etag);
    } catch {
      if (existing) {
        return existing;
      }

      return {
        accountId,
        snapshot: EMPTY_PREFERENCE_SNAPSHOT,
        pendingUpdate: null,
        syncState: 'failed',
        etag: '"0"',
        updatedAt: new Date().toISOString(),
      };
    }
  }

  async save(accountId: string, update: PreferenceUpdate): Promise<CachedAccountPreferenceState> {
    const current = await this.cache.getAccountState(accountId);
    const baseSnapshot = current?.snapshot ?? EMPTY_PREFERENCE_SNAPSHOT;
    const baseEtag = current?.etag ?? `"${baseSnapshot.revision}"`;

    await this.cache.savePendingUpdate({
      accountId,
      snapshot: baseSnapshot,
      pendingUpdate: update,
      syncState: 'pending',
      etag: baseEtag,
    });

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.apiBaseUrl}/v1/me/preferences`, {
        method: 'PUT',
        credentials: 'include',
        headers: this.buildHeaders({
          'content-type': 'application/json',
          'if-match': baseEtag,
        }),
        body: JSON.stringify(update),
      });
    } catch {
      return this.cache.savePendingUpdate({
        accountId,
        snapshot: baseSnapshot,
        pendingUpdate: update,
        syncState: 'pending',
        etag: baseEtag,
      });
    }

    if (response.status === 412) {
      try {
        const latest = await this.fetchRemoteSnapshot();
        return this.cache.savePendingUpdate({
          accountId,
          snapshot: latest.snapshot,
          pendingUpdate: update,
          syncState: 'conflict',
          etag: latest.etag,
        });
      } catch {
        return this.cache.savePendingUpdate({
          accountId,
          snapshot: baseSnapshot,
          pendingUpdate: update,
          syncState: 'conflict',
          etag: baseEtag,
        });
      }
    }

    if (!response.ok) {
      return this.cache.savePendingUpdate({
        accountId,
        snapshot: baseSnapshot,
        pendingUpdate: update,
        syncState: 'failed',
        etag: baseEtag,
      });
    }

    const parsed = preferenceSnapshotSchema.safeParse(await response.json());
    if (!parsed.success) {
      return this.cache.savePendingUpdate({
        accountId,
        snapshot: baseSnapshot,
        pendingUpdate: update,
        syncState: 'failed',
        etag: baseEtag,
      });
    }

    const nextEtag = response.headers.get('etag') ?? `"${parsed.data.revision}"`;
    return this.cache.saveSyncedSnapshot(accountId, parsed.data, nextEtag);
  }

  async resolveConflict(
    accountId: string,
    strategy: ConflictResolutionStrategy,
  ): Promise<CachedAccountPreferenceState> {
    const current = await this.cache.getAccountState(accountId);
    if (!current) {
      return this.restore(accountId);
    }

    if (strategy === 'keep_server') {
      return this.cache.saveSyncedSnapshot(accountId, current.snapshot, current.etag);
    }

    const draft = current.pendingUpdate;
    if (!draft) {
      return this.cache.saveSyncedSnapshot(accountId, current.snapshot, current.etag);
    }

    return this.save(accountId, draft);
  }
}
