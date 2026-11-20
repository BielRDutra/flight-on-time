import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerGoogleAuthRoutes } from '../../../src/auth/google-auth-routes.js';
import type {
  ApplicationSession,
  GoogleAuthService,
} from '../../../src/auth/google-auth-service.js';

const challenge = {
  challengeId: 'challenge-id',
  nonce: 'one-time-nonce',
  expiresAt: '2026-11-18T12:05:00.000Z',
};
const applicationSession: ApplicationSession = {
  sessionToken: 'opaque-session-token',
  expiresAt: '2026-11-19T12:00:00.000Z',
};

describe('Google authentication routes', () => {
  let app: ReturnType<typeof Fastify> | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  async function createApp() {
    app = Fastify();
    await app.register(cookie);

    const service: Pick<GoogleAuthService, 'createChallenge' | 'exchange' | 'revokeSession'> = {
      createChallenge: vi.fn(() => challenge),
      exchange: vi.fn(async () => applicationSession),
      revokeSession: vi.fn(() => true),
    };

    await registerGoogleAuthRoutes(app, {
      service,
      allowedWebOrigins: ['https://flightontime.example'],
      secureCookies: false,
    });

    return { app, service };
  }

  it('creates a platform-bound challenge and protects the web challenge with an HttpOnly cookie', async () => {
    const { app: server, service } = await createApp();
    const response = await server.inject({
      method: 'GET',
      url: '/v1/auth/google/challenge?platform=web',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(challenge);
    expect(response.headers['set-cookie']).toContain('fta_google_challenge=challenge-id');
    expect(response.headers['set-cookie']).toContain('HttpOnly');
    expect(service.createChallenge).toHaveBeenCalledWith('web');
  });

  it('exchanges an Android ID token for an application bearer session', async () => {
    const { app: server, service } = await createApp();
    const response = await server.inject({
      method: 'POST',
      url: '/v1/auth/google/session',
      payload: {
        challengeId: 'challenge-id',
        credential: 'one-time-google-id-token',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual(applicationSession);
    expect(service.exchange).toHaveBeenCalledWith({
      platform: 'android',
      challengeId: 'challenge-id',
      credential: 'one-time-google-id-token',
    });
  });

  it('requires an allowed Origin, a matching GIS CSRF token, and the web challenge cookie', async () => {
    const { app: server, service } = await createApp();
    const response = await server.inject({
      method: 'POST',
      url: '/v1/auth/google/session',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        origin: 'https://flightontime.example',
        cookie: 'fta_google_challenge=challenge-id; g_csrf_token=csrf-value',
      },
      payload: new URLSearchParams({
        credential: 'one-time-google-id-token',
        g_csrf_token: 'csrf-value',
      }).toString(),
    });

    expect(response.statusCode).toBe(204);
    const cookieHeaders = response.headers['set-cookie'];
    const cookieValues = Array.isArray(cookieHeaders) ? cookieHeaders : [cookieHeaders ?? ''];
    expect(
      cookieValues.some((value) => value.includes('fta_account_session=opaque-session-token')),
    ).toBe(true);
    expect(cookieValues.some((value) => value.includes('HttpOnly'))).toBe(true);
    expect(service.exchange).toHaveBeenCalledWith({
      platform: 'web',
      challengeId: 'challenge-id',
      credential: 'one-time-google-id-token',
    });
  });

  it('rejects invalid web CSRF state and clears neither the session nor the challenge', async () => {
    const { app: server, service } = await createApp();
    const response = await server.inject({
      method: 'POST',
      url: '/v1/auth/google/session',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        origin: 'https://flightontime.example',
        cookie: 'fta_google_challenge=challenge-id; g_csrf_token=csrf-value',
      },
      payload: new URLSearchParams({
        credential: 'one-time-google-id-token',
        g_csrf_token: 'wrong-value',
      }).toString(),
    });

    expect(response.statusCode).toBe(401);
    expect(service.exchange).not.toHaveBeenCalled();
  });

  it('revokes an Android session using its opaque bearer credential', async () => {
    const { app: server, service } = await createApp();
    const response = await server.inject({
      method: 'DELETE',
      url: '/v1/me/session',
      headers: { authorization: 'Bearer opaque-session-token' },
    });

    expect(response.statusCode).toBe(204);
    expect(service.revokeSession).toHaveBeenCalledWith('opaque-session-token');
  });
});
