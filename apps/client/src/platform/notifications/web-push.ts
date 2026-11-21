import type { WebPushSubscription } from '@flight-on-time/contracts';
import type { DeviceNotificationPermissionStatus } from './android-push';

export interface WebPushAdapter {
  isSupported(): boolean;
  getPermissionStatus(): Promise<DeviceNotificationPermissionStatus>;
  requestPermission(): Promise<DeviceNotificationPermissionStatus>;
  subscribe(vapidPublicKey: string): Promise<WebPushSubscription>;
}

export interface RegisterWebPushOptions {
  apiBaseUrl: string;
  installationId: string;
  vapidPublicKey: string;
  adapter?: WebPushAdapter | undefined;
  fetchImpl?: typeof fetch | undefined;
}

export function createBrowserWebPushAdapter(): WebPushAdapter {
  return {
    isSupported() {
      return (
        typeof window !== 'undefined' &&
        'Notification' in window &&
        'serviceWorker' in navigator &&
        'PushManager' in window
      );
    },
    async getPermissionStatus() {
      if (!this.isSupported()) {
        return 'unsupported';
      }

      const permission = window.Notification.permission;
      return permission === 'granted'
        ? 'granted'
        : permission === 'denied'
          ? 'denied'
          : 'undetermined';
    },
    async requestPermission() {
      if (!this.isSupported()) {
        return 'unsupported';
      }

      const permission = await window.Notification.requestPermission();
      return permission === 'granted'
        ? 'granted'
        : permission === 'denied'
          ? 'denied'
          : 'undetermined';
    },
    async subscribe(vapidPublicKey: string) {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToUint8Array(vapidPublicKey) as unknown as BufferSource,
      });

      const json = subscription.toJSON();
      const endpoint = json.endpoint;
      const p256dh = json.keys?.p256dh;
      const auth = json.keys?.auth;

      if (!endpoint || !p256dh || !auth) {
        throw new Error('Browser push subscription did not provide required keys.');
      }

      return {
        endpoint,
        keys: { p256dh, auth },
      };
    },
  };
}

export async function registerWebPushSubscription(
  options: RegisterWebPushOptions,
): Promise<{ status: 'registered' | 'denied' | 'unsupported' }> {
  const adapter = options.adapter ?? createBrowserWebPushAdapter();
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiBaseUrl = options.apiBaseUrl.replace(/\/+$/, '');

  if (!adapter.isSupported()) {
    return { status: 'unsupported' };
  }

  let permission = await adapter.getPermissionStatus();
  if (permission !== 'granted') {
    permission = await adapter.requestPermission();
  }

  if (permission !== 'granted') {
    return { status: 'denied' };
  }

  const subscription = await adapter.subscribe(options.vapidPublicKey);
  const response = await fetchImpl(
    `${apiBaseUrl}/v1/me/installations/${encodeURIComponent(options.installationId)}/push-subscription`,
    {
      method: 'PUT',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        platform: 'web',
        subscription,
        consent: true,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Web push subscription failed with status ${response.status}`);
  }

  return { status: 'registered' };
}

function base64UrlToUint8Array(value: string): Uint8Array {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replaceAll('-', '+').replaceAll('_', '/');
  const decoded = atob(base64);
  const bytes = new Uint8Array(decoded.length);

  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }

  return bytes;
}
