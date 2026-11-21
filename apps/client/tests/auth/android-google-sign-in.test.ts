import { describe, expect, it, vi } from 'vitest';
import {
  AndroidGoogleSignInError,
  clearStoredAndroidSession,
  getStoredAndroidSession,
  signInWithAndroidGoogle,
  type AndroidCredentialManager,
  type AndroidSecureSessionStore,
  type StoredAndroidSession,
} from '../../src/platform/auth/android-google.js';

const validChallenge = {
  challengeId: 'android-challenge-id',
  nonce: 'android-one-time-nonce',
  expiresAt: '2030-11-18T12:05:00.000Z',
};

const validSession: StoredAndroidSession = {
  sessionToken: 'opaque-android-session-token',
  expiresAt: '2030-11-19T12:00:00.000Z',
};

function createMemoryStore(): AndroidSecureSessionStore & { stored: StoredAndroidSession | null } {
  const store: AndroidSecureSessionStore & { stored: StoredAndroidSession | null } = {
    stored: null,
    async saveSession(session) {
      store.stored = session;
    },
    async getSession() {
      return store.stored;
    },
    async clearSession() {
      store.stored = null;
    },
  };

  return store;
}

describe('Android Google sign-in', () => {
  it('requests a challenge, gets an ID token via serverClientId, exchanges it, and stores only the app session', async () => {
    const secureStore = createMemoryStore();
    const credentialManager: AndroidCredentialManager = {
      requestGoogleIdToken: vi.fn(async () => ({
        status: 'success' as const,
        idToken: 'one-time-google-id-token',
      })),
    };
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(validChallenge), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(validSession), { status: 201 }));

    const result = await signInWithAndroidGoogle({
      apiBaseUrl: 'https://api.flightontime.example/',
      googleWebClientId: 'web-server-client-id',
      fetchImpl,
      credentialManager,
      secureStore,
    });

    expect(result).toEqual(validSession);
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      'https://api.flightontime.example/v1/auth/google/challenge?platform=android',
    );
    expect(credentialManager.requestGoogleIdToken).toHaveBeenCalledWith({
      serverClientId: 'web-server-client-id',
      nonce: 'android-one-time-nonce',
    });
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'https://api.flightontime.example/v1/auth/google/session',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          challengeId: 'android-challenge-id',
          credential: 'one-time-google-id-token',
        }),
      },
    );
    expect(secureStore.stored).toEqual(validSession);
    await expect(getStoredAndroidSession(secureStore)).resolves.toEqual(validSession);
    await clearStoredAndroidSession(secureStore);
    await expect(getStoredAndroidSession(secureStore)).resolves.toBeNull();
  });

  it('reports cancellation without calling session exchange or modifying secure storage', async () => {
    const secureStore = createMemoryStore();
    const credentialManager: AndroidCredentialManager = {
      requestGoogleIdToken: vi.fn(async () => ({ status: 'cancelled' as const })),
    };
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(validChallenge), { status: 200 }));

    await expect(
      signInWithAndroidGoogle({
        apiBaseUrl: 'https://api.flightontime.example',
        googleWebClientId: 'web-server-client-id',
        fetchImpl,
        credentialManager,
        secureStore,
      }),
    ).rejects.toMatchObject({ code: 'cancelled' });

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(secureStore.stored).toBeNull();
  });

  it('reports when no Google credential is available on the device', async () => {
    const secureStore = createMemoryStore();
    const credentialManager: AndroidCredentialManager = {
      requestGoogleIdToken: vi.fn(async () => ({ status: 'no_credential' as const })),
    };
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(validChallenge), { status: 200 }));

    await expect(
      signInWithAndroidGoogle({
        apiBaseUrl: 'https://api.flightontime.example',
        googleWebClientId: 'web-server-client-id',
        fetchImpl,
        credentialManager,
        secureStore,
      }),
    ).rejects.toMatchObject({ code: 'no_credential' });

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(secureStore.stored).toBeNull();
  });

  it('rejects expired challenges and failed session exchanges without storing a session', async () => {
    const secureStore = createMemoryStore();
    const credentialManager: AndroidCredentialManager = {
      requestGoogleIdToken: vi.fn(async () => ({
        status: 'success' as const,
        idToken: 'one-time-google-id-token',
      })),
    };
    const expiredFetch = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ...validChallenge,
          expiresAt: '2020-01-01T00:00:00.000Z',
        }),
        { status: 200 },
      ),
    );

    await expect(
      signInWithAndroidGoogle({
        apiBaseUrl: 'https://api.flightontime.example',
        googleWebClientId: 'web-server-client-id',
        fetchImpl: expiredFetch,
        credentialManager,
        secureStore,
      }),
    ).rejects.toBeInstanceOf(AndroidGoogleSignInError);
    expect(credentialManager.requestGoogleIdToken).not.toHaveBeenCalled();

    const rejectedExchangeFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(validChallenge), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }));

    await expect(
      signInWithAndroidGoogle({
        apiBaseUrl: 'https://api.flightontime.example',
        googleWebClientId: 'web-server-client-id',
        fetchImpl: rejectedExchangeFetch,
        credentialManager,
        secureStore,
      }),
    ).rejects.toMatchObject({ code: 'session_exchange_failed' });
    expect(secureStore.stored).toBeNull();
  });
});
