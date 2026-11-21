import {
  clearStoredAndroidSession,
  type AndroidSecureSessionStore,
} from '../../platform/auth/android-google.js';
import type { AccountPreferenceCache } from '../../storage/preference-cache.js';

export interface SignOutAccountOptions {
  platform: 'android' | 'web';
  accountId: string;
  apiBaseUrl: string;
  installationId?: string | undefined;
  accountBearerToken?: string | undefined;
  installationCredential?: string | undefined;
  cache: AccountPreferenceCache;
  secureStore?: AndroidSecureSessionStore | undefined;
  fetchImpl?: typeof fetch | undefined;
}

export async function signOutAccount(options: SignOutAccountOptions): Promise<void> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiBaseUrl = options.apiBaseUrl.replace(/\/+$/, '');
  const accountHeaders: Record<string, string> =
    options.platform === 'android' && options.accountBearerToken
      ? { authorization: `Bearer ${options.accountBearerToken}` }
      : {};

  // 1. Unlink the current installation and disable its push subscription while preserving account preferences.
  if (options.installationId) {
    const unlinkHeaders: Record<string, string> = {
      ...accountHeaders,
      ...(options.platform === 'android' && options.installationCredential
        ? { 'x-installation-authorization': `Bearer ${options.installationCredential}` }
        : {}),
    };

    try {
      await fetchImpl(
        `${apiBaseUrl}/v1/me/installations/${encodeURIComponent(options.installationId)}/claim`,
        {
          method: 'DELETE',
          credentials: options.platform === 'web' ? 'include' : 'omit',
          headers: unlinkHeaders,
        },
      );
    } catch {
      // Proceed with session revocation and local cache clearing even if network unlink fails.
    }
  }

  // 2. Revoke the application session on the backend.
  try {
    await fetchImpl(`${apiBaseUrl}/v1/me/session`, {
      method: 'DELETE',
      credentials: options.platform === 'web' ? 'include' : 'omit',
      headers: accountHeaders,
    });
  } catch {
    // Always complete local state cleanup on explicit sign-out.
  }

  // 3. Clear the active account's visible local cache and Android secure session.
  await options.cache.clearAccount(options.accountId);

  if (options.platform === 'android') {
    await clearStoredAndroidSession(options.secureStore);
  }
}
