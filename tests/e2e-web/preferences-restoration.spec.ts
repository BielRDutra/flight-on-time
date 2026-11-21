import { expect, request as playwrightRequest, test } from '@playwright/test';
import { startE2EServer, type StartedE2EServer } from './test-server-harness.js';

function extractCookieValue(headers: Record<string, string>, name: string): string | undefined {
  const raw = headers['set-cookie'];
  if (!raw) {
    return undefined;
  }

  const match = raw.match(new RegExp(`${name}=([^;]+)`));
  return match?.[1];
}

test.describe('Web <-> Android Preference Restoration & Conflict Recovery (SC-003)', () => {
  let server: StartedE2EServer | undefined;

  test.beforeEach(async () => {
    server = await startE2EServer();
  });

  test.afterEach(async () => {
    await server?.stop();
    server = undefined;
  });

  test('restores preferences saved on web when signing in on Android, isolates accounts, and rejects stale revisions with 412', async ({
    request,
  }) => {
    if (!server) {
      throw new Error('Test API server not initialized');
    }

    // 1. Web sign-in
    const webChallengeRes = await request.get(
      `${server.baseUrl}/v1/auth/google/challenge?platform=web`,
    );
    expect(webChallengeRes.status()).toBe(200);
    const webChallenge = (await webChallengeRes.json()) as {
      challengeId: string;
      nonce: string;
    };

    const webSessionRes = await request.post(`${server.baseUrl}/v1/auth/google/session`, {
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        origin: 'https://flightontime.example',
        cookie: `fta_google_challenge=${webChallenge.challengeId}; g_csrf_token=e2e-csrf`,
      },
      data: new URLSearchParams({
        credential: `token:e2e-subject-1:${webChallenge.nonce}`,
        g_csrf_token: 'e2e-csrf',
      }).toString(),
    });
    expect(webSessionRes.status()).toBe(204);
    const webSessionCookie = extractCookieValue(webSessionRes.headers(), 'fta_account_session');
    expect(webSessionCookie).toBeTruthy();

    // 2. Save preferences on Web
    const webPut = await request.put(`${server.baseUrl}/v1/me/preferences`, {
      headers: {
        cookie: `fta_account_session=${webSessionCookie}`,
        'if-match': '"0"',
      },
      data: {
        airportIcaos: ['SBBR', 'SBSP'],
        airlineIds: ['LATAM'],
        eventTypes: ['go_around', 'diversion_candidate'],
        notificationsEnabled: true,
      },
    });
    expect(webPut.status()).toBe(200);
    expect(webPut.headers().etag).toBe('"1"');

    // 3. Sign in on an isolated Android client context with the same Google account and verify restoration
    const androidRequest = await playwrightRequest.newContext();
    try {
      const androidChallengeRes = await androidRequest.get(
        `${server.baseUrl}/v1/auth/google/challenge?platform=android`,
      );
      const androidChallenge = (await androidChallengeRes.json()) as {
        challengeId: string;
        nonce: string;
      };

      const androidSessionRes = await androidRequest.post(`${server.baseUrl}/v1/auth/google/session`, {
        data: {
          challengeId: androidChallenge.challengeId,
          credential: `token:e2e-subject-1:${androidChallenge.nonce}`,
        },
      });
      expect(androidSessionRes.status()).toBe(201);
      const androidToken = ((await androidSessionRes.json()) as { sessionToken: string }).sessionToken;

      const androidGet = await androidRequest.get(`${server.baseUrl}/v1/me/preferences`, {
        headers: { authorization: `Bearer ${androidToken}` },
      });
      expect(androidGet.status()).toBe(200);
      expect(await androidGet.json()).toMatchObject({
        airportIcaos: ['SBBR', 'SBSP'],
        airlineIds: ['LATAM'],
        eventTypes: ['diversion_candidate', 'go_around'],
        notificationsEnabled: true,
        revision: 1,
      });

      // 4. Stale If-Match from Web returns 412 after Android updates revision to 2
      const androidPut = await androidRequest.put(`${server.baseUrl}/v1/me/preferences`, {
        headers: {
          authorization: `Bearer ${androidToken}`,
          'if-match': '"1"',
        },
        data: {
          airportIcaos: ['SBBR'],
          airlineIds: ['LATAM'],
          eventTypes: ['go_around'],
          notificationsEnabled: true,
        },
      });
      expect(androidPut.status()).toBe(200);
      expect(androidPut.headers().etag).toBe('"2"');

      const staleWebPut = await request.put(`${server.baseUrl}/v1/me/preferences`, {
        headers: {
          cookie: `fta_account_session=${webSessionCookie}`,
          'if-match': '"1"',
        },
        data: {
          airportIcaos: ['SBRJ'],
          airlineIds: [],
          eventTypes: ['holding_or_orbit'],
          notificationsEnabled: false,
        },
      });
      expect(staleWebPut.status()).toBe(412);

      // 5. Different account never sees previous account's snapshot
      const otherChallengeRes = await androidRequest.get(
        `${server.baseUrl}/v1/auth/google/challenge?platform=android`,
      );
      const otherChallenge = (await otherChallengeRes.json()) as {
        challengeId: string;
        nonce: string;
      };
      const otherSessionRes = await androidRequest.post(`${server.baseUrl}/v1/auth/google/session`, {
        data: {
          challengeId: otherChallenge.challengeId,
          credential: `token:e2e-subject-other:${otherChallenge.nonce}`,
        },
      });
      const otherToken = ((await otherSessionRes.json()) as { sessionToken: string }).sessionToken;

      const otherGet = await androidRequest.get(`${server.baseUrl}/v1/me/preferences`, {
        headers: { authorization: `Bearer ${otherToken}` },
      });
      expect(otherGet.status()).toBe(200);
      expect(await otherGet.json()).toEqual({
        airportIcaos: [],
        airlineIds: [],
        eventTypes: [],
        notificationsEnabled: false,
        revision: 0,
        updatedAt: null,
      });
    } finally {
      await androidRequest.dispose();
    }
  });
});
