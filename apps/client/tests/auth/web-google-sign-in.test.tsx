import { describe, expect, it, vi } from 'vitest';
import {
  beginWebGoogleSignIn,
  type GoogleIdentityServices,
} from '../../src/platform/auth/web-google.js';

const challengeResponse = {
  challengeId: 'challenge-id',
  nonce: 'one-time-nonce',
  expiresAt: '2030-11-18T12:05:00.000Z',
};

function createGoogleIdentity() {
  let credentialCallback: ((response: { credential?: string }) => void) | undefined;
  const identity: GoogleIdentityServices = {
    accounts: {
      id: {
        initialize: vi.fn((options) => {
          credentialCallback = options.callback;
        }),
        renderButton: vi.fn(),
        cancel: vi.fn(),
      },
    },
  };

  return {
    identity,
    sendCredential: (credential?: string) => credentialCallback?.(credential ? { credential } : {}),
  };
}

describe('web Google sign-in', () => {
  it('initializes GIS with the server nonce and exchanges the one-time ID token', async () => {
    const { identity, sendCredential } = createGoogleIdentity();
    const onSignedIn = vi.fn();
    const onError = vi.fn();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(challengeResponse), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const button = {} as HTMLElement;

    await beginWebGoogleSignIn({
      apiBaseUrl: 'https://api.flightontime.example',
      googleWebClientId: 'web-client-id',
      button,
      identity,
      fetchImpl,
      readCookie: () => 'google-csrf-token',
      onSignedIn,
      onError,
    });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      'https://api.flightontime.example/v1/auth/google/challenge?platform=web',
      expect.objectContaining({ credentials: 'include' }),
    );
    expect(identity.accounts.id.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: 'web-client-id',
        nonce: 'one-time-nonce',
      }),
    );
    expect(identity.accounts.id.renderButton).toHaveBeenCalledWith(button, expect.any(Object));

    sendCredential('google-id-token');
    await vi.waitFor(() => expect(onSignedIn).toHaveBeenCalledOnce());

    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'https://api.flightontime.example/v1/auth/google/session',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          credential: 'google-id-token',
          g_csrf_token: 'google-csrf-token',
        }).toString(),
      }),
    );
    expect(onError).not.toHaveBeenCalled();
  });

  it('reports a missing GIS CSRF cookie instead of sending an unverifiable credential', async () => {
    const { identity, sendCredential } = createGoogleIdentity();
    const onError = vi.fn();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(challengeResponse), { status: 200 }));

    await beginWebGoogleSignIn({
      apiBaseUrl: 'https://api.flightontime.example',
      googleWebClientId: 'web-client-id',
      button: {} as HTMLElement,
      identity,
      fetchImpl,
      readCookie: () => undefined,
      onSignedIn: vi.fn(),
      onError,
    });

    sendCredential('google-id-token');
    await vi.waitFor(() =>
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'csrf_cookie_missing' }),
      ),
    );
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('does not send credentials after the user cancels sign-in', async () => {
    const { identity, sendCredential } = createGoogleIdentity();
    const onCancelled = vi.fn();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(challengeResponse), { status: 200 }));

    const cancel = await beginWebGoogleSignIn({
      apiBaseUrl: 'https://api.flightontime.example',
      googleWebClientId: 'web-client-id',
      button: {} as HTMLElement,
      identity,
      fetchImpl,
      readCookie: () => 'google-csrf-token',
      onSignedIn: vi.fn(),
      onError: vi.fn(),
      onCancelled,
    });

    cancel();
    sendCredential('google-id-token');
    await Promise.resolve();

    expect(onCancelled).toHaveBeenCalledOnce();
    expect(identity.accounts.id.cancel).toHaveBeenCalledOnce();
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('reports challenge failures to the UI', async () => {
    const { identity } = createGoogleIdentity();
    const onError = vi.fn();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 }));

    await expect(
      beginWebGoogleSignIn({
        apiBaseUrl: 'https://api.flightontime.example',
        googleWebClientId: 'web-client-id',
        button: {} as HTMLElement,
        identity,
        fetchImpl,
        readCookie: () => 'google-csrf-token',
        onSignedIn: vi.fn(),
        onError,
      }),
    ).resolves.toBeTypeOf('function');

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'challenge_failed' }));
    expect(identity.accounts.id.initialize).not.toHaveBeenCalled();
  });

  it('reports an unsuccessful session exchange without claiming sign-in succeeded', async () => {
    const { identity, sendCredential } = createGoogleIdentity();
    const onSignedIn = vi.fn();
    const onError = vi.fn();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(challengeResponse), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }));

    await beginWebGoogleSignIn({
      apiBaseUrl: 'https://api.flightontime.example',
      googleWebClientId: 'web-client-id',
      button: {} as HTMLElement,
      identity,
      fetchImpl,
      readCookie: () => 'google-csrf-token',
      onSignedIn,
      onError,
    });

    sendCredential('google-id-token');
    await vi.waitFor(() =>
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'session_exchange_failed' }),
      ),
    );
    expect(onSignedIn).not.toHaveBeenCalled();
  });
});
