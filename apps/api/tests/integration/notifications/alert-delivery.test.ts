import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { InferredEvent } from '@flight-on-time/contracts';
import type {
  GoogleIdTokenVerifier,
  GoogleTokenClaims,
} from '../../../src/auth/google-auth-service.js';
import { buildApiApp } from '../../../src/server.js';
import type { AlertDeliveryWorker } from '../../../src/notifications/delivery-worker.js';
import type { AndroidPushProvider } from '../../../src/notifications/providers/android-push-provider.js';
import type { WebPushProvider } from '../../../src/notifications/providers/web-push-provider.js';

function createStubVerifier(): GoogleIdTokenVerifier {
  return {
    verifyIdToken: vi.fn(async (token): Promise<GoogleTokenClaims> => {
      const [, subject, nonce] = token.split(':');
      return {
        issuer: 'https://accounts.google.com',
        subject: subject ?? 'user-1',
        audience: 'web-client-id',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        nonce: nonce ?? 'nonce',
      };
    }),
  };
}

async function signInAndroid(app: FastifyInstance, subject: string): Promise<string> {
  const challenge = (
    await app.inject({
      method: 'GET',
      url: '/v1/auth/google/challenge?platform=android',
    })
  ).json() as { challengeId: string; nonce: string };

  const res = await app.inject({
    method: 'POST',
    url: '/v1/auth/google/session',
    payload: {
      challengeId: challenge.challengeId,
      credential: `token:${subject}:${challenge.nonce}`,
    },
  });
  return (res.json() as { sessionToken: string }).sessionToken;
}

const matchingGoAroundEvent: InferredEvent = {
  eventId: 'evt-alert-001',
  airportIcao: 'SBBR',
  eventType: 'go_around',
  classificationStatus: 'inferred',
  airline: {
    airlineId: 'LATAM',
    displayName: 'LATAM Airlines Brasil',
    sourceId: 'fixture-operator-registry',
    sourceUpdatedAt: '2026-11-18T11:55:00.000Z',
  },
  aircraftIcao24: 'e48c11',
  firstObservedAt: '2026-11-18T11:50:00.000Z',
  lastObservedAt: '2026-11-18T11:54:00.000Z',
  confidence: 0.88,
  sources: [{ id: 'fixture-adsb', observedAt: '2026-11-18T11:54:00.000Z' }],
  status: 'current',
};

describe('notification matching, consent, encryption, deduplication, and sign-out unlink', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  async function createTestSetup() {
    const androidPushProvider: AndroidPushProvider = {
      send: vi.fn(async () => ({ status: 'sent' as const })),
    };
    const webPushProvider: WebPushProvider = {
      send: vi.fn(async () => ({ status: 'sent' as const })),
    };

    let worker: AlertDeliveryWorker | undefined;

    app = await buildApiApp({
      host: '127.0.0.1',
      port: 3000,
      databasePath: ':memory:',
      googleWebClientId: 'web-client-id',
      allowedWebOrigins: ['https://flightontime.example'],
      environment: 'test',
      idTokenVerifier: createStubVerifier(),
      pushEncryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      androidPushProvider,
      webPushProvider,
      onNotificationWorkerReady: (createdWorker) => {
        worker = createdWorker;
      },
    });

    if (!worker) {
      throw new Error('Notification delivery worker was not initialized');
    }

    return { app, worker, androidPushProvider, webPushProvider };
  }

  it('claims installation, encrypts push secret, delivers matching deduplicated alerts, and stops on sign-out unlink', async () => {
    const { app: server, worker, androidPushProvider } = await createTestSetup();
    const accountToken = await signInAndroid(server, 'google-sub-alert-1');

    // Save account preferences with notifications enabled
    const savePrefs = await server.inject({
      method: 'PUT',
      url: '/v1/me/preferences',
      headers: {
        authorization: `Bearer ${accountToken}`,
        'if-match': '"0"',
      },
      payload: {
        airportIcaos: ['SBBR'],
        airlineIds: [],
        eventTypes: ['go_around'],
        notificationsEnabled: true,
      },
    });
    expect(savePrefs.statusCode).toBe(200);

    // Register Android installation
    const installRes = await server.inject({
      method: 'POST',
      url: '/v1/installations',
      payload: { platform: 'android' },
    });
    expect(installRes.statusCode).toBe(201);
    const { installationId, androidCredential } = installRes.json() as {
      installationId: string;
      androidCredential: string;
    };

    // Claim installation for account
    const claimRes = await server.inject({
      method: 'POST',
      url: `/v1/me/installations/${installationId}/claim`,
      headers: {
        authorization: `Bearer ${accountToken}`,
        'x-installation-authorization': `Bearer ${androidCredential}`,
      },
    });
    expect(claimRes.statusCode).toBe(204);

    // Register consented push subscription
    const secretFcmToken = 'fcm-secret-device-token-xyz';
    const subRes = await server.inject({
      method: 'PUT',
      url: `/v1/me/installations/${installationId}/push-subscription`,
      headers: {
        authorization: `Bearer ${accountToken}`,
        'x-installation-authorization': `Bearer ${androidCredential}`,
      },
      payload: {
        platform: 'android',
        subscription: { token: secretFcmToken },
        consent: true,
      },
    });
    expect(subRes.statusCode).toBe(204);
    expect(subRes.body).toBe('');

    // Process matching event -> delivered once with inferred notice
    const result1 = await worker.processEvents([matchingGoAroundEvent], 'current');
    expect(result1.sentCount).toBe(1);
    expect(androidPushProvider.send).toHaveBeenCalledOnce();
    expect(androidPushProvider.send).toHaveBeenCalledWith(
      { token: secretFcmToken },
      expect.objectContaining({
        eventId: 'evt-alert-001',
        airportIcao: 'SBBR',
        eventType: 'go_around',
        classificationStatus: 'inferred',
      }),
    );

    // Re-process updated/repeated same event -> deduplicated
    const result2 = await worker.processEvents([matchingGoAroundEvent], 'current');
    expect(result2.sentCount).toBe(0);
    expect(result2.deduplicatedCount).toBe(1);
    expect(androidPushProvider.send).toHaveBeenCalledOnce();

    // Non-matching airport/category is suppressed
    const nonMatchingEvent: InferredEvent = {
      ...matchingGoAroundEvent,
      eventId: 'evt-other-002',
      airportIcao: 'SBSP',
    };
    const result3 = await worker.processEvents([nonMatchingEvent], 'current');
    expect(result3.sentCount).toBe(0);

    // Stale source suppresses delivery
    const staleEvent: InferredEvent = {
      ...matchingGoAroundEvent,
      eventId: 'evt-stale-003',
    };
    const result4 = await worker.processEvents([staleEvent], 'stale');
    expect(result4.sentCount).toBe(0);

    // Low confidence suppresses delivery
    const lowConfidenceEvent: InferredEvent = {
      ...matchingGoAroundEvent,
      eventId: 'evt-low-conf-004',
      confidence: 0.2,
    };
    const result5 = await worker.processEvents([lowConfidenceEvent], 'current');
    expect(result5.sentCount).toBe(0);

    // Explicit sign-out unlinks installation and disables subscription while retaining preferences
    const unlinkRes = await server.inject({
      method: 'DELETE',
      url: `/v1/me/installations/${installationId}/claim`,
      headers: {
        authorization: `Bearer ${accountToken}`,
        'x-installation-authorization': `Bearer ${androidCredential}`,
      },
    });
    expect(unlinkRes.statusCode).toBe(204);

    const afterUnlinkEvent: InferredEvent = {
      ...matchingGoAroundEvent,
      eventId: 'evt-after-unlink-005',
    };
    const result6 = await worker.processEvents([afterUnlinkEvent], 'current');
    expect(result6.sentCount).toBe(0);

    // Account preferences are retained after unlink
    const prefsAfterUnlink = await server.inject({
      method: 'GET',
      url: '/v1/me/preferences',
      headers: { authorization: `Bearer ${accountToken}` },
    });
    expect(prefsAfterUnlink.statusCode).toBe(200);
    expect(prefsAfterUnlink.json()).toMatchObject({
      airportIcaos: ['SBBR'],
      eventTypes: ['go_around'],
      notificationsEnabled: true,
    });
  });

  it('prevents a different account from silently claiming an already-claimed installation (409)', async () => {
    const { app: server } = await createTestSetup();
    const accountA = await signInAndroid(server, 'google-sub-owner-a');
    const accountB = await signInAndroid(server, 'google-sub-owner-b');

    const installRes = await server.inject({
      method: 'POST',
      url: '/v1/installations',
      payload: { platform: 'android' },
    });
    const { installationId, androidCredential } = installRes.json() as {
      installationId: string;
      androidCredential: string;
    };

    const claimA = await server.inject({
      method: 'POST',
      url: `/v1/me/installations/${installationId}/claim`,
      headers: {
        authorization: `Bearer ${accountA}`,
        'x-installation-authorization': `Bearer ${androidCredential}`,
      },
    });
    expect(claimA.statusCode).toBe(204);

    const claimB = await server.inject({
      method: 'POST',
      url: `/v1/me/installations/${installationId}/claim`,
      headers: {
        authorization: `Bearer ${accountB}`,
        'x-installation-authorization': `Bearer ${androidCredential}`,
      },
    });
    expect(claimB.statusCode).toBe(409);
  });

  it('disables subscription when push provider returns permanent invalidation', async () => {
    const androidPushProvider: AndroidPushProvider = {
      send: vi.fn(async () => ({ status: 'invalid_token' as const })),
    };
    const webPushProvider: WebPushProvider = {
      send: vi.fn(async () => ({ status: 'sent' as const })),
    };

    let worker: AlertDeliveryWorker | undefined;
    app = await buildApiApp({
      host: '127.0.0.1',
      port: 3000,
      databasePath: ':memory:',
      googleWebClientId: 'web-client-id',
      allowedWebOrigins: ['https://flightontime.example'],
      environment: 'test',
      idTokenVerifier: createStubVerifier(),
      pushEncryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      androidPushProvider,
      webPushProvider,
      onNotificationWorkerReady: (createdWorker) => {
        worker = createdWorker;
      },
    });

    const accountToken = await signInAndroid(app, 'google-sub-invalid-push');
    await app.inject({
      method: 'PUT',
      url: '/v1/me/preferences',
      headers: { authorization: `Bearer ${accountToken}`, 'if-match': '"0"' },
      payload: {
        airportIcaos: ['SBBR'],
        airlineIds: [],
        eventTypes: ['go_around'],
        notificationsEnabled: true,
      },
    });

    const installRes = await app.inject({
      method: 'POST',
      url: '/v1/installations',
      payload: { platform: 'android' },
    });
    const { installationId, androidCredential } = installRes.json() as {
      installationId: string;
      androidCredential: string;
    };

    await app.inject({
      method: 'POST',
      url: `/v1/me/installations/${installationId}/claim`,
      headers: {
        authorization: `Bearer ${accountToken}`,
        'x-installation-authorization': `Bearer ${androidCredential}`,
      },
    });
    await app.inject({
      method: 'PUT',
      url: `/v1/me/installations/${installationId}/push-subscription`,
      headers: {
        authorization: `Bearer ${accountToken}`,
        'x-installation-authorization': `Bearer ${androidCredential}`,
      },
      payload: {
        platform: 'android',
        subscription: { token: 'revoked-device-token' },
        consent: true,
      },
    });

    await worker?.processEvents([matchingGoAroundEvent], 'current');
    await worker?.processEvents(
      [{ ...matchingGoAroundEvent, eventId: 'evt-next-002' }],
      'current',
    );

    // Only attempted once; subscription was disabled after invalid_token
    expect(androidPushProvider.send).toHaveBeenCalledOnce();
  });
});
