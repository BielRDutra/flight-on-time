import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import type { ActiveAccountSession, GoogleAuthService } from './google-auth-service.js';

declare module 'fastify' {
  interface FastifyRequest {
    accountSession?: ActiveAccountSession;
  }
}

const sessionCookieName = 'fta_account_session';

export function requireAccountSession(
  service: Pick<GoogleAuthService, 'findActiveSession'>,
): preHandlerHookHandler {
  return async (request, reply) => {
    const bearerToken = getBearerToken(request);
    const cookieToken = request.cookies[sessionCookieName];

    if (Boolean(bearerToken) === Boolean(cookieToken)) {
      return sendUnauthorized(reply, request);
    }

    const sessionToken = bearerToken ?? cookieToken;
    if (!sessionToken) {
      return sendUnauthorized(reply, request);
    }

    const session = service.findActiveSession(sessionToken);

    if (
      !session ||
      (bearerToken && session.platform !== 'android') ||
      (cookieToken && session.platform !== 'web')
    ) {
      return sendUnauthorized(reply, request);
    }

    request.accountSession = session;
  };
}

function getBearerToken(request: FastifyRequest): string | undefined {
  const authorization = request.headers.authorization;
  const match = authorization?.match(/^Bearer ([^\s]+)$/i);

  return match?.[1];
}

function sendUnauthorized(reply: FastifyReply, request: FastifyRequest): void {
  void reply.code(401).send({
    code: 'unauthorized',
    message: 'A valid application session is required.',
    requestId: request.id,
  });
}
