import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { describe, expect, it, vi } from 'vitest';
import type { EventType } from '@flight-on-time/contracts';
import {
  AccountPreferenceCache,
  type ClientPreferenceSqliteDriver,
} from '../../../src/storage/preference-cache.js';
import type { AndroidSecureSessionStore } from '../../../src/platform/auth/android-google.js';
import { signOutAccount } from '../../../src/features/account/sign-out.js';
import { NotificationSettingsScreen } from '../../../src/features/notifications/NotificationSettingsScreen.js';
import type { AndroidNotificationAdapter } from '../../../src/platform/notifications/android-push.js';
import type { WebPushAdapter } from '../../../src/platform/notifications/web-push.js';

function createMemoryDriver(): ClientPreferenceSqliteDriver {
  const rows = new Map<string, string>();
  return {
    async execAsync() {},
    async getFirstAsync<T>(sql: string, params: readonly unknown[] = []): Promise<T | null> {
      if (sql.includes('FROM account_preference_cache WHERE account_id = ?')) {
        const raw = rows.get(String(params[0]));
        return raw ? (JSON.parse(raw) as T) : null;
      }
      return null;
    },
    async runAsync(sql: string, params: readonly unknown[] = []): Promise<void> {
      if (sql.includes('INSERT INTO account_preference_cache')) {
        const [accountId, snapshotJson, pendingJson, syncState, etag, updatedAt] = params;
        rows.set(
          String(accountId),
          JSON.stringify({
            account_id: accountId,
            snapshot_json: snapshotJson,
            pending_update_json: pendingJson,
            sync_state: syncState,
            etag,
            updated_at: updatedAt,
          }),
        );
      } else if (sql.includes('DELETE FROM account_preference_cache WHERE account_id = ?')) {
        rows.delete(String(params[0]));
      }
    },
  };
}

describe('notification settings and sign-out orchestration', () => {
  it('starts disabled by default and requires at least one airport and category before enabling', async () => {
    const onEnableNotifications = vi.fn(async () => true);
    const webPushAdapter: WebPushAdapter = {
      isSupported: () => true,
      getPermissionStatus: async () => 'granted',
      requestPermission: async () => 'granted',
      subscribe: async () => ({
        endpoint: 'https://push.example/sub-1',
        keys: { p256dh: 'p256-key', auth: 'auth-key' },
      }),
    };

    await render(
      <NotificationSettingsScreen
        platform="web"
        apiBaseUrl="https://api.flightontime.example"
        installationId="inst-1"
        vapidPublicKey="vapid-pub"
        selectedAirports={[]}
        selectedEventTypes={[]}
        notificationsEnabled={false}
        webPushAdapter={webPushAdapter}
        onEnableNotifications={onEnableNotifications}
        onDisableNotifications={vi.fn(async () => {})}
      />,
    );

    expect(screen.getByText(/Avisos desativados/i)).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Ativar avisos personalizados'));

    await waitFor(() => {
      expect(
        screen.getByText(/Selecione ao menos um aeroporto e uma categoria antes de ativar os avisos/i),
      ).toBeTruthy();
    });
    expect(onEnableNotifications).not.toHaveBeenCalled();
  });

  it('handles denied device notification permission without activating delivery', async () => {
    const onEnableNotifications = vi.fn(async () => true);
    const webPushAdapter: WebPushAdapter = {
      isSupported: () => true,
      getPermissionStatus: async () => 'undetermined',
      requestPermission: async () => 'denied',
      subscribe: vi.fn(),
    };

    await render(
      <NotificationSettingsScreen
        platform="web"
        apiBaseUrl="https://api.flightontime.example"
        installationId="inst-1"
        vapidPublicKey="vapid-pub"
        selectedAirports={['SBBR']}
        selectedEventTypes={['go_around'] satisfies EventType[]}
        notificationsEnabled={false}
        webPushAdapter={webPushAdapter}
        onEnableNotifications={onEnableNotifications}
        onDisableNotifications={vi.fn(async () => {})}
      />,
    );

    await fireEvent.press(screen.getByLabelText('Ativar avisos personalizados'));

    await waitFor(() => {
      expect(
        screen.getByText(/Permissão de notificações negada neste dispositivo/i),
      ).toBeTruthy();
    });
    expect(webPushAdapter.subscribe).not.toHaveBeenCalled();
    expect(onEnableNotifications).not.toHaveBeenCalled();
  });

  it('registers consented Android push subscription when airport, category, and permission are granted', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));
    const onEnableNotifications = vi.fn(async () => true);
    const androidAdapter: AndroidNotificationAdapter = {
      getPermissionStatus: async () => 'undetermined',
      requestPermission: async () => 'granted',
      getDevicePushToken: async () => 'fcm-device-token-123',
    };

    await render(
      <NotificationSettingsScreen
        platform="android"
        apiBaseUrl="https://api.flightontime.example"
        installationId="inst-android-1"
        accountBearerToken="account-bearer"
        installationCredential="install-cred"
        selectedAirports={['SBBR']}
        selectedEventTypes={['go_around']}
        notificationsEnabled={false}
        androidAdapter={androidAdapter}
        fetchImpl={fetchImpl}
        onEnableNotifications={onEnableNotifications}
        onDisableNotifications={vi.fn(async () => {})}
      />,
    );

    await fireEvent.press(screen.getByLabelText('Ativar avisos personalizados'));

    await waitFor(() => {
      expect(onEnableNotifications).toHaveBeenCalledOnce();
      expect(fetchImpl).toHaveBeenCalledWith(
        'https://api.flightontime.example/v1/me/installations/inst-android-1/push-subscription',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({
            platform: 'android',
            subscription: { token: 'fcm-device-token-123' },
            consent: true,
          }),
        }),
      );
    });
  });

  it('unlinks installation, revokes session, and clears local account cache on sign-out', async () => {
    const cache = new AccountPreferenceCache(createMemoryDriver());
    await cache.saveSyncedSnapshot(
      'account-a',
      {
        airportIcaos: ['SBBR'],
        airlineIds: ['LATAM'],
        eventTypes: ['go_around'],
        notificationsEnabled: true,
        revision: 1,
        updatedAt: '2026-11-18T12:00:00.000Z',
      },
      '"1"',
    );

    const secureStore: AndroidSecureSessionStore = {
      saveSession: vi.fn(async () => {}),
      getSession: vi.fn(async () => ({
        sessionToken: 'android-session-token',
        expiresAt: '2030-01-01T00:00:00.000Z',
      })),
      clearSession: vi.fn(async () => {}),
    };

    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));

    await signOutAccount({
      platform: 'android',
      accountId: 'account-a',
      apiBaseUrl: 'https://api.flightontime.example',
      installationId: 'inst-android-1',
      accountBearerToken: 'android-session-token',
      installationCredential: 'install-cred',
      cache,
      secureStore,
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      'https://api.flightontime.example/v1/me/installations/inst-android-1/claim',
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({
          authorization: 'Bearer android-session-token',
          'x-installation-authorization': 'Bearer install-cred',
        }),
      }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'https://api.flightontime.example/v1/me/session',
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({
          authorization: 'Bearer android-session-token',
        }),
      }),
    );
    expect(secureStore.clearSession).toHaveBeenCalledOnce();
    await expect(cache.getAccountState('account-a')).resolves.toBeNull();
  });
});
