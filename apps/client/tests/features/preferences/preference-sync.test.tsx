import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { describe, expect, it, vi } from 'vitest';
import type { PreferenceSnapshot, PreferenceUpdate } from '@flight-on-time/contracts';
import {
  AccountPreferenceCache,
  type ClientPreferenceSqliteDriver,
} from '../../../src/storage/preference-cache.js';
import { PreferenceSyncCoordinator } from '../../../src/features/preferences/preference-sync.js';
import { PreferenceSettingsScreen } from '../../../src/features/preferences/PreferenceSettingsScreen.js';

function createMemorySqliteDriver(): ClientPreferenceSqliteDriver {
  const rows = new Map<
    string,
    {
      account_id: string;
      snapshot_json: string;
      pending_update_json: string | null;
      sync_state: string;
      etag: string;
      updated_at: string;
    }
  >();

  return {
    async execAsync() {
      // Schema creation no-op for in-memory test driver
    },
    async getFirstAsync<T>(sql: string, params: readonly unknown[] = []): Promise<T | null> {
      if (sql.includes('FROM account_preference_cache WHERE account_id = ?')) {
        const accountId = String(params[0]);
        return (rows.get(accountId) as T | undefined) ?? null;
      }
      return null;
    },
    async runAsync(sql: string, params: readonly unknown[] = []): Promise<void> {
      if (sql.includes('INSERT INTO account_preference_cache')) {
        const [accountId, snapshotJson, pendingJson, syncState, etag, updatedAt] = params;
        rows.set(String(accountId), {
          account_id: String(accountId),
          snapshot_json: String(snapshotJson),
          pending_update_json: pendingJson === null ? null : String(pendingJson),
          sync_state: String(syncState),
          etag: String(etag),
          updated_at: String(updatedAt),
        });
      } else if (sql.includes('DELETE FROM account_preference_cache WHERE account_id = ?')) {
        rows.delete(String(params[0]));
      } else if (sql.includes('DELETE FROM account_preference_cache')) {
        rows.clear();
      }
    },
  };
}

const serverSnapshotV1: PreferenceSnapshot = {
  airportIcaos: ['SBBR'],
  airlineIds: ['LATAM'],
  eventTypes: ['go_around'],
  notificationsEnabled: false,
  revision: 1,
  updatedAt: '2026-11-18T12:00:00.000Z',
};

describe('client preference cache and sync', () => {
  it('partitions cached preferences by account and clears visible cache on sign-out', async () => {
    const cache = new AccountPreferenceCache(createMemorySqliteDriver());
    await cache.initialize();

    await cache.saveSyncedSnapshot('account-a', serverSnapshotV1, '"1"');

    const accountAState = await cache.getAccountState('account-a');
    const accountBState = await cache.getAccountState('account-b');

    expect(accountAState?.snapshot).toEqual(serverSnapshotV1);
    expect(accountAState?.syncState).toBe('synced');
    expect(accountBState).toBeNull();

    await cache.clearAccount('account-a');
    await expect(cache.getAccountState('account-a')).resolves.toBeNull();
  });

  it('marks offline or failed saves as pending/failed and never reports them as saved', async () => {
    const cache = new AccountPreferenceCache(createMemorySqliteDriver());
    await cache.initialize();

    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(serverSnapshotV1), {
          status: 200,
          headers: { etag: '"1"' },
        }),
      )
      .mockRejectedValueOnce(new TypeError('Network offline'));

    const coordinator = new PreferenceSyncCoordinator({
      apiBaseUrl: 'https://api.flightontime.example',
      cache,
      fetchImpl,
      bearerToken: 'android-session-token',
    });

    const restored = await coordinator.restore('account-a');
    expect(restored.syncState).toBe('synced');
    expect(restored.snapshot).toEqual(serverSnapshotV1);

    const draftUpdate: PreferenceUpdate = {
      airportIcaos: ['SBBR', 'SBGR'],
      airlineIds: ['LATAM'],
      eventTypes: ['go_around'],
      notificationsEnabled: false,
    };

    const saveResult = await coordinator.save('account-a', draftUpdate);
    expect(saveResult.syncState).toBe('pending');
    expect(saveResult.pendingUpdate).toEqual(draftUpdate);
    expect(saveResult.snapshot.revision).toBe(1);

    const cached = await cache.getAccountState('account-a');
    expect(cached?.syncState).toBe('pending');
    expect(cached?.pendingUpdate).toEqual(draftUpdate);
  });

  it('detects 412 revision conflicts and supports resolving by keeping server or retrying local changes', async () => {
    const cache = new AccountPreferenceCache(createMemorySqliteDriver());
    await cache.initialize();

    const newerServerSnapshot: PreferenceSnapshot = {
      airportIcaos: ['SBSP'],
      airlineIds: ['AZU'],
      eventTypes: ['diversion_candidate'],
      notificationsEnabled: false,
      revision: 2,
      updatedAt: '2026-11-18T12:05:00.000Z',
    };

    const retriedSnapshot: PreferenceSnapshot = {
      airportIcaos: ['SBBR', 'SBGR'],
      airlineIds: ['LATAM'],
      eventTypes: ['go_around'],
      notificationsEnabled: false,
      revision: 3,
      updatedAt: '2026-11-18T12:06:00.000Z',
    };

    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(serverSnapshotV1), {
          status: 200,
          headers: { etag: '"1"' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 'precondition_failed', message: 'stale' }), {
          status: 412,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(newerServerSnapshot), {
          status: 200,
          headers: { etag: '"2"' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(retriedSnapshot), {
          status: 200,
          headers: { etag: '"3"' },
        }),
      );

    const coordinator = new PreferenceSyncCoordinator({
      apiBaseUrl: 'https://api.flightontime.example',
      cache,
      fetchImpl,
      bearerToken: 'android-session-token',
    });

    await coordinator.restore('account-a');

    const localDraft: PreferenceUpdate = {
      airportIcaos: ['SBBR', 'SBGR'],
      airlineIds: ['LATAM'],
      eventTypes: ['go_around'],
      notificationsEnabled: false,
    };

    const conflictState = await coordinator.save('account-a', localDraft);
    expect(conflictState.syncState).toBe('conflict');
    expect(conflictState.snapshot).toEqual(newerServerSnapshot);
    expect(conflictState.pendingUpdate).toEqual(localDraft);

    const resolved = await coordinator.resolveConflict('account-a', 'retry_local');
    expect(resolved.syncState).toBe('synced');
    expect(resolved.snapshot).toEqual(retriedSnapshot);
    expect(fetchImpl).toHaveBeenLastCalledWith(
      'https://api.flightontime.example/v1/me/preferences',
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          'if-match': '"2"',
        }),
      }),
    );
  });

  it('renders restored preferences and allows resolving a conflict from the UI', async () => {
    const cache = new AccountPreferenceCache(createMemorySqliteDriver());
    await cache.initialize();

    const newerServerSnapshot: PreferenceSnapshot = {
      airportIcaos: ['SBSP'],
      airlineIds: [],
      eventTypes: ['holding_or_orbit'],
      notificationsEnabled: false,
      revision: 2,
      updatedAt: '2026-11-18T12:05:00.000Z',
    };

    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(serverSnapshotV1), {
          status: 200,
          headers: { etag: '"1"' },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 412 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(newerServerSnapshot), {
          status: 200,
          headers: { etag: '"2"' },
        }),
      );

    const coordinator = new PreferenceSyncCoordinator({
      apiBaseUrl: 'https://api.flightontime.example',
      cache,
      fetchImpl,
    });

    await render(
      <PreferenceSettingsScreen
        accountId="account-a"
        availableAirports={['SBBR', 'SBGR', 'SBSP']}
        availableAirlines={[
          {
            airlineId: 'LATAM',
            displayName: 'LATAM Airlines Brasil',
            sourceId: 'fixture-operator-registry',
          },
        ]}
        coordinator={coordinator}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/Preferências sincronizadas/i)).toBeTruthy();
    });

    await fireEvent.press(screen.getByLabelText('Preferência aeroporto SBGR'));
    await fireEvent.press(screen.getByLabelText('Salvar preferências'));

    await waitFor(() => {
      expect(screen.getByText(/Conflito de revisão detectado/i)).toBeTruthy();
    });

    await fireEvent.press(screen.getByLabelText('Manter versão do servidor'));

    await waitFor(() => {
      expect(screen.getByText(/Preferências sincronizadas/i)).toBeTruthy();
    });
  });
});
