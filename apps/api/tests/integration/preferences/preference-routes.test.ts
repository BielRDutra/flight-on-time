import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApiApp } from '../../../src/server.js';
import type {
  GoogleIdTokenVerifier,
  GoogleTokenClaims,
} from '../../../src/auth/google-auth-service.js';

function createStubVerifier(subject: string): GoogleIdTokenVerifier {
  const latestNonce = 'nonce';
  return {
    verifyIdToken: vi.fn(async (token): Promise<GoogleTokenClaims> => {
      const [, parsedSubject, parsedNonce] = token.split(':');
      return {
        issuer: 'https://accounts.google.com',
        subject: parsedSubject || subject,
        audience: 'web-client-id',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        nonce: parsedNonce || latestNonce,
      };
    }),
  };
}

async function createSignedInAndroidSession(app: FastifyInstance, subject: string): Promise<string> {
  const challengeRes = await app.inject({
    method: 'GET',
    url: '/v1/auth/google/challenge?platform=android',
  });
  const challenge = challengeRes.json() as { challengeId: string; nonce: string };

  const sessionRes = await app.inject({
    method: 'POST',
    url: '/v1/auth/google/session',
    payload: {
      challengeId: challenge.challengeId,
      credential: `token:${subject}:${challenge.nonce}`,
    },
  });

  expect(sessionRes.statusCode).toBe(201);
  return (sessionRes.json() as { sessionToken: string }).sessionToken;
}

describe('account preference routes', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  async function createTestApp() {
    app = await buildApiApp({
      host: '127.0.0.1',
      port: 3000,
      databasePath: ':memory:',
      googleWebClientId: 'web-client-id',
      allowedWebOrigins: ['https://flightontime.example'],
      environment: 'test',
      idTokenVerifier: createStubVerifier('default-user'),
    });

    return app;
  }

  it('requires an authenticated application session', async () => {
    const server = await createTestApp();

    const getRes = await server.inject({ method: 'GET', url: '/v1/me/preferences' });
    const putRes = await server.inject({
      method: 'PUT',
      url: '/v1/me/preferences',
      headers: { 'if-match': '"0"' },
      payload: {
        airportIcaos: ['SBBR'],
        airlineIds: [],
        eventTypes: ['go_around'],
        notificationsEnabled: false,
      },
    });

    expect(getRes.statusCode).toBe(401);
    expect(putRes.statusCode).toBe(401);
  });

  it('returns empty defaults for a new account and atomically updates and restores preferences across sessions', async () => {
    const server = await createTestApp();
    const sessionOne = await createSignedInAndroidSession(server, 'google-sub-alpha');

    const initialGet = await server.inject({
      method: 'GET',
      url: '/v1/me/preferences',
      headers: { authorization: `Bearer ${sessionOne}` },
    });

    expect(initialGet.statusCode).toBe(200);
    expect(initialGet.headers.etag).toBe('"0"');
    expect(initialGet.json()).toEqual({
      airportIcaos: [],
      airlineIds: [],
      eventTypes: [],
      notificationsEnabled: false,
      revision: 0,
      updatedAt: null,
    });

    const putResponse = await server.inject({
      method: 'PUT',
      url: '/v1/me/preferences',
      headers: {
        authorization: `Bearer ${sessionOne}`,
        'if-match': '"0"',
      },
      payload: {
        airportIcaos: ['SBBR', 'SBGR'],
        airlineIds: ['LATAM'],
        eventTypes: ['go_around', 'holding_or_orbit'],
        notificationsEnabled: true,
      },
    });

    expect(putResponse.statusCode).toBe(200);
    expect(putResponse.headers.etag).toBe('"1"');
    expect(putResponse.json()).toMatchObject({
      airportIcaos: ['SBBR', 'SBGR'],
      airlineIds: ['LATAM'],
      eventTypes: ['go_around', 'holding_or_orbit'],
      notificationsEnabled: true,
      revision: 1,
    });
    expect(typeof putResponse.json().updatedAt).toBe('string');

    // Sign in again on a new session for the same Google account and verify restoration
    const sessionTwo = await createSignedInAndroidSession(server, 'google-sub-alpha');
    const restoredGet = await server.inject({
      method: 'GET',
      url: '/v1/me/preferences',
      headers: { authorization: `Bearer ${sessionTwo}` },
    });

    expect(restoredGet.statusCode).toBe(200);
    expect(restoredGet.headers.etag).toBe('"1"');
    expect(restoredGet.json()).toEqual(putResponse.json());
  });

  it('isolates preferences per authenticated account', async () => {
    const server = await createTestApp();
    const sessionA = await createSignedInAndroidSession(server, 'google-sub-account-a');
    const sessionB = await createSignedInAndroidSession(server, 'google-sub-account-b');

    await server.inject({
      method: 'PUT',
      url: '/v1/me/preferences',
      headers: {
        authorization: `Bearer ${sessionA}`,
        'if-match': '"0"',
      },
      payload: {
        airportIcaos: ['SBSP'],
        airlineIds: ['AZU'],
        eventTypes: ['diversion_candidate'],
        notificationsEnabled: false,
      },
    });

    const accountBGet = await server.inject({
      method: 'GET',
      url: '/v1/me/preferences',
      headers: { authorization: `Bearer ${sessionB}` },
    });

    expect(accountBGet.statusCode).toBe(200);
    expect(accountBGet.json()).toEqual({
      airportIcaos: [],
      airlineIds: [],
      eventTypes: [],
      notificationsEnabled: false,
      revision: 0,
      updatedAt: null,
    });
  });

  it('rejects stale If-Match revisions with 412 without overwriting newer changes', async () => {
    const server = await createTestApp();
    const session = await createSignedInAndroidSession(server, 'google-sub-conflict');

    const update1 = await server.inject({
      method: 'PUT',
      url: '/v1/me/preferences',
      headers: {
        authorization: `Bearer ${session}`,
        'if-match': '"0"',
      },
      payload: {
        airportIcaos: ['SBBR'],
        airlineIds: [],
        eventTypes: ['go_around'],
        notificationsEnabled: false,
      },
    });
    expect(update1.statusCode).toBe(200);

    const staleUpdate = await server.inject({
      method: 'PUT',
      url: '/v1/me/preferences',
      headers: {
        authorization: `Bearer ${session}`,
        'if-match': '"0"',
      },
      payload: {
        airportIcaos: ['SBRJ'],
        airlineIds: ['GOL'],
        eventTypes: ['holding_or_orbit'],
        notificationsEnabled: false,
      },
    });

    expect(staleUpdate.statusCode).toBe(412);
    expect(staleUpdate.json()).toMatchObject({ code: 'precondition_failed' });

    const verifyCurrent = await server.inject({
      method: 'GET',
      url: '/v1/me/preferences',
      headers: { authorization: `Bearer ${session}` },
    });
    expect(verifyCurrent.json()).toMatchObject({
      airportIcaos: ['SBBR'],
      airlineIds: [],
      eventTypes: ['go_around'],
      revision: 1,
    });
  });

  it('rejects enabling notifications when airportIcaos or eventTypes is empty', async () => {
    const server = await createTestApp();
    const session = await createSignedInAndroidSession(server, 'google-sub-validation');

    const missingAirport = await server.inject({
      method: 'PUT',
      url: '/v1/me/preferences',
      headers: {
        authorization: `Bearer ${session}`,
        'if-match': '"0"',
      },
      payload: {
        airportIcaos: [],
        airlineIds: [],
        eventTypes: ['go_around'],
        notificationsEnabled: true,
      },
    });
    expect(missingAirport.statusCode).toBe(400);

    const missingCategory = await server.inject({
      method: 'PUT',
      url: '/v1/me/preferences',
      headers: {
        authorization: `Bearer ${session}`,
        'if-match': '"0"',
      },
      payload: {
        airportIcaos: ['SBBR'],
        airlineIds: [],
        eventTypes: [],
        notificationsEnabled: true,
      },
    });
    expect(missingCategory.statusCode).toBe(400);
  });
});
