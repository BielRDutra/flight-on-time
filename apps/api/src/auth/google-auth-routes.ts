import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  GoogleAuthError,
  type AuthPlatform,
  type GoogleAuthService,
} from './google-auth-service.js';

const challengeCookieName = 'fta_google_challenge';
const sessionCookieName = 'fta_account_session';
const googleCsrfCookieName = 'g_csrf_token';

const nativeSessionInput = z
  .object({
    challengeId: z.string().min(1),
    credential: z.string().min(1),
  })
  .strict();

const webSessionInput = z
  .object({
    credential: z.string().min(1),
    g_csrf_token: z.string().min(1),
  })
  .strict();

interface GoogleAuthRoutesOptions {
  service: Pick<GoogleAuthService, 'createChallenge' | 'exchange' | 'revokeSession'>;
  allowedWebOrigins: readonly string[];
  secureCookies?: boolean;
}

interface ChallengeQuery {
  platform: AuthPlatform;
}

export async function registerGoogleAuthRoutes(
  app: FastifyInstance,
  options: GoogleAuthRoutesOptions,
): Promise<void> {
  registerFormBodyParser(app);

  app.get<{ Querystring: ChallengeQuery }>(
    '/v1/auth/google/challenge',
    {
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          required: ['platform'],
          properties: {
            platform: { type: 'string', enum: ['web', 'android'] },
          },
        },
      },
    },
    async (request, reply) => {
      const challenge = options.service.createChallenge(request.query.platform);

      if (request.query.platform === 'web') {
        reply.setCookie(challengeCookieName, challenge.challengeId, {
          httpOnly: true,
          secure: options.secureCookies ?? true,
          sameSite: 'none',
          path: '/v1/auth/google/session',
          maxAge: 5 * 60,
        });
      }

      return reply.code(200).send(challenge);
    },
  );

  app.post('/v1/auth/google/session', async (request, reply) => {
    const isWebForm = request.headers['content-type']
      ?.toLowerCase()
      .startsWith('application/x-www-form-urlencoded');

    if (isWebForm) {
      return exchangeWebSession(request, reply, options);
    }

    return exchangeAndroidSession(request, reply, options);
  });

  app.delete('/v1/me/session', async (request, reply) => {
    const bearerToken = getBearerToken(request);
    const cookieToken = request.cookies[sessionCookieName];
    const sessionToken = bearerToken ?? cookieToken;

    if (!sessionToken || !options.service.revokeSession(sessionToken)) {
      return sendAuthError(reply, request, 'invalid_session');
    }

    if (cookieToken) {
      reply.clearCookie(sessionCookieName, {
        httpOnly: true,
        secure: options.secureCookies ?? true,
        sameSite: 'none',
        path: '/v1',
      });
    }

    return reply.code(204).send();
  });
}

async function exchangeAndroidSession(
  request: FastifyRequest,
  reply: FastifyReply,
  options: GoogleAuthRoutesOptions,
) {
  const parsed = nativeSessionInput.safeParse(request.body);

  if (!parsed.success) {
    return reply.code(400).send({
      code: 'invalid_request',
      message: 'A valid Android sign-in request is required.',
      requestId: request.id,
    });
  }

  try {
    const session = await options.service.exchange({
      platform: 'android',
      challengeId: parsed.data.challengeId,
      credential: parsed.data.credential,
    });

    return reply.code(201).send(session);
  } catch (error) {
    if (error instanceof GoogleAuthError) {
      return sendAuthError(reply, request, error.code);
    }

    throw error;
  }
}

async function exchangeWebSession(
  request: FastifyRequest,
  reply: FastifyReply,
  options: GoogleAuthRoutesOptions,
) {
  const parsed = webSessionInput.safeParse(request.body);
  const challengeId = request.cookies[challengeCookieName];
  const googleCsrfCookie = request.cookies[googleCsrfCookieName];
  const origin = request.headers.origin;

  if (
    !parsed.success ||
    !challengeId ||
    !googleCsrfCookie ||
    !constantTimeEqual(parsed.data.g_csrf_token, googleCsrfCookie) ||
    !origin ||
    !options.allowedWebOrigins.includes(origin)
  ) {
    return sendAuthError(reply, request, 'invalid_web_request');
  }

  try {
    const session = await options.service.exchange({
      platform: 'web',
      challengeId,
      credential: parsed.data.credential,
    });
    const maxAge = Math.max(1, Math.ceil((Date.parse(session.expiresAt) - Date.now()) / 1000));

    reply.setCookie(sessionCookieName, session.sessionToken, {
      httpOnly: true,
      secure: options.secureCookies ?? true,
      sameSite: 'none',
      path: '/v1',
      maxAge,
    });
    reply.clearCookie(challengeCookieName, {
      httpOnly: true,
      secure: options.secureCookies ?? true,
      sameSite: 'none',
      path: '/v1/auth/google/session',
    });

    return reply.code(204).send();
  } catch (error) {
    if (error instanceof GoogleAuthError) {
      return sendAuthError(reply, request, error.code);
    }

    throw error;
  }
}

function getBearerToken(request: FastifyRequest): string | undefined {
  const authorization = request.headers.authorization;
  const match = authorization?.match(/^Bearer ([^\s]+)$/i);

  return match?.[1];
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function sendAuthError(reply: FastifyReply, request: FastifyRequest, code: string) {
  return reply.code(401).send({
    code,
    message: 'Authentication could not be completed.',
    requestId: request.id,
  });
}

function registerFormBodyParser(app: FastifyInstance): void {
  if (app.hasContentTypeParser('application/x-www-form-urlencoded')) {
    return;
  }

  app.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (request, body, done) => {
      const params = new URLSearchParams(typeof body === 'string' ? body : body.toString());
      const values: Record<string, string> = {};

      for (const [key, value] of params) {
        if (Object.hasOwn(values, key)) {
          done(new Error('Duplicate form field'));
          return;
        }

        values[key] = value;
      }

      done(null, values);
    },
  );
}
