import cookie from '@fastify/cookie';
import Fastify, { type FastifyRequest } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { requireAccountSession } from '../../../src/auth/session-middleware.js';
import type {
  ActiveAccountSession,
  GoogleAuthService,
} from '../../../src/auth/google-auth-service.js';

const androidSession: ActiveAccountSession = {
  accountId: 'account-android',
  platform: 'android',
  createdAt: '2026-11-18T11:00:00.000Z',
  expiresAt: '2026-11-19T11:00:00.000Z',
  revokedAt: null,
};
const webSession: ActiveAccountSession = {
  ...androidSession,
  accountId: 'account-web',
  platform: 'web',
};

describe('account-session middleware', () => {
  let app: ReturnType<typeof Fastify> | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  async function createApp(session: ActiveAccountSession | undefined) {
    app = Fastify();
    await app.register(cookie);
    const service: Pick<GoogleAuthService, 'findActiveSession'> = {
      findActiveSession: vi.fn((token: string) =>
        token === 'android-token' ? androidSession : token === 'web-token' ? webSession : session,
      ),
    };

    app.get(
      '/protected',
      { preHandler: requireAccountSession(service) },
      async (request: FastifyRequest) => ({
        accountId: request.accountSession?.accountId,
      }),
    );

    return { app, service };
  }

  it('authenticates an opaque Android bearer session', async () => {
    const { app: server, service } = await createApp(undefined);
    const response = await server.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: 'Bearer android-token' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ accountId: 'account-android' });
    expect(service.findActiveSession).toHaveBeenCalledWith('android-token');
  });

  it('authenticates a web session cookie', async () => {
    const { app: server } = await createApp(undefined);
    const response = await server.inject({
      method: 'GET',
      url: '/protected',
      headers: { cookie: 'fta_account_session=web-token' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ accountId: 'account-web' });
  });

  it.each([
    ['missing', undefined, {}],
    ['expired or revoked', undefined, { authorization: 'Bearer expired-token' }],
    ['wrong transport', webSession, { authorization: 'Bearer web-token' }],
    [
      'ambiguous credentials',
      androidSession,
      {
        authorization: 'Bearer android-token',
        cookie: 'fta_account_session=web-token',
      },
    ],
  ])('rejects %s credentials', async (_case, session, headers) => {
    const { app: server } = await createApp(session);
    const response = await server.inject({
      method: 'GET',
      url: '/protected',
      headers,
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'unauthorized' });
  });
});
