export type DeviceNotificationPermissionStatus =
  | 'granted'
  | 'denied'
  | 'undetermined'
  | 'unsupported';

export interface AndroidNotificationAdapter {
  getPermissionStatus(): Promise<DeviceNotificationPermissionStatus>;
  requestPermission(): Promise<DeviceNotificationPermissionStatus>;
  getDevicePushToken(): Promise<string>;
}

export interface RegisterAndroidPushOptions {
  apiBaseUrl: string;
  installationId: string;
  accountBearerToken: string;
  installationCredential: string;
  adapter?: AndroidNotificationAdapter | undefined;
  fetchImpl?: typeof fetch | undefined;
}

export interface DisablePushSubscriptionOptions {
  apiBaseUrl: string;
  installationId: string;
  platform: 'android' | 'web';
  accountBearerToken?: string | undefined;
  installationCredential?: string | undefined;
  fetchImpl?: typeof fetch | undefined;
}

export function createExpoAndroidNotificationAdapter(): AndroidNotificationAdapter {
  return {
    async getPermissionStatus() {
      const Notifications = await import('expo-notifications');
      const status = await Notifications.getPermissionsAsync();
      return status.granted
        ? 'granted'
        : status.status === 'denied'
          ? 'denied'
          : 'undetermined';
    },
    async requestPermission() {
      const Notifications = await import('expo-notifications');
      const status = await Notifications.requestPermissionsAsync();
      return status.granted
        ? 'granted'
        : status.status === 'denied'
          ? 'denied'
          : 'undetermined';
    },
    async getDevicePushToken() {
      const Notifications = await import('expo-notifications');
      const tokenResult = await Notifications.getDevicePushTokenAsync();
      return String(tokenResult.data);
    },
  };
}

export async function registerAndroidPushSubscription(
  options: RegisterAndroidPushOptions,
): Promise<{ status: 'registered' | 'denied' }> {
  const adapter = options.adapter ?? createExpoAndroidNotificationAdapter();
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiBaseUrl = options.apiBaseUrl.replace(/\/+$/, '');

  let permission = await adapter.getPermissionStatus();
  if (permission !== 'granted') {
    permission = await adapter.requestPermission();
  }

  if (permission !== 'granted') {
    return { status: 'denied' };
  }

  const token = await adapter.getDevicePushToken();
  const response = await fetchImpl(
    `${apiBaseUrl}/v1/me/installations/${encodeURIComponent(options.installationId)}/push-subscription`,
    {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${options.accountBearerToken}`,
        'x-installation-authorization': `Bearer ${options.installationCredential}`,
      },
      body: JSON.stringify({
        platform: 'android',
        subscription: { token },
        consent: true,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Android push subscription failed with status ${response.status}`);
  }

  return { status: 'registered' };
}

export async function disableInstallationPushSubscription(
  options: DisablePushSubscriptionOptions,
): Promise<void> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiBaseUrl = options.apiBaseUrl.replace(/\/+$/, '');
  const headers: Record<string, string> = {};

  if (options.platform === 'android') {
    if (options.accountBearerToken) {
      headers.authorization = `Bearer ${options.accountBearerToken}`;
    }
    if (options.installationCredential) {
      headers['x-installation-authorization'] = `Bearer ${options.installationCredential}`;
    }
  }

  const response = await fetchImpl(
    `${apiBaseUrl}/v1/me/installations/${encodeURIComponent(options.installationId)}/push-subscription`,
    {
      method: 'DELETE',
      credentials: options.platform === 'web' ? 'include' : 'omit',
      headers,
    },
  );

  if (!response.ok && response.status !== 404) {
    throw new Error(`Disabling push subscription failed with status ${response.status}`);
  }
}
