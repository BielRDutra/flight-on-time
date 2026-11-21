import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { GoogleAuthService } from '../auth/google-auth-service.js';
import { requireAccountSession } from '../auth/session-middleware.js';
import {
  InstallationConflictError,
  InstallationNotFoundError,
  InvalidInstallationCredentialError,
  type NotificationPlatform,
  type SqliteNotificationRepository,
} from './notification-repository.js';

const installationCookieName = 'fta_session';

const registerInstallationSchema = z
  .object({
    platform: z.enum(['android', 'web']),
  })
  .strict();

const installationParamsSchema = z
  .object({
    installationId: z.string().min(1).max(128),
  })
  .strict();

export interface InstallationRoutesOptions {
  authService: Pick<GoogleAuthService, 'findActiveSession'>;
  repository: SqliteNotificationRepository;
  secureCookies?: boolean;
  now?: () => Date;
}

export function extractInstallationCredential(
  request: FastifyRequest,
  platform: NotificationPlatform,
): string | undefined {
  if (platform === 'web') {
    return request.cookies[installationCookieName];
  }

  const headerAuth = request.headers['x-installation-authorization'];
  const rawHeader = Array.isArray(headerAuth) ? headerAuth[0] : headerAuth;
  const bearerMatch = rawHeader?.match(/^Bearer ([^\s]+)$/i);
  if (bearerMatch?.[1]) {
    return bearerMatch[1];
  }

  const fallback = request.headers['x-installation-credential'];
  return Array.isArray(fallback) ? fallback[0] : fallback;
}

export function handleInstallationError(
  error: unknown,
  reply: FastifyReply,
  request: FastifyRequest,
): FastifyReply | undefined {
  if (error instanceof InvalidInstallationCredentialError) {
    return reply.code(401).send({
      code: 'unauthorized',
      message: error.message,
      requestId: request.id,
    });
  }

  if (error instanceof InstallationNotFoundError) {
    return reply.code(404).send({
      code: 'not_found',
      message: error.message,
      requestId: request.id,
    });
  }

  if (error instanceof InstallationConflictError) {
    return reply.code(409).send({
      code: 'installation_conflict',
      message: error.message,
      requestId: request.id,
    });
  }

  return undefined;
}

export async function registerInstallationRoutes(
  app: FastifyInstance,
  options: InstallationRoutesOptions,
): Promise<void> {
  const authenticate = requireAccountSession(options.authService);
  const now = options.now ?? (() => new Date());

  app.post('/v1/installations', async (request, reply) => {
    const parsed = registerInstallationSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        code: 'invalid_request',
        message: 'A valid installation platform is required.',
        requestId: request.id,
      });
    }

    const created = options.repository.registerInstallation(
      parsed.data.platform,
      now().toISOString(),
    );

    if (parsed.data.platform === 'web') {
      reply.setCookie(installationCookieName, created.installationCredential, {
        httpOnly: true,
        secure: options.secureCookies ?? true,
        sameSite: 'none',
        path: '/v1',
        maxAge: 365 * 24 * 60 * 60,
      });
      return reply.code(201).send({ installationId: created.installationId });
    }

    return reply.code(201).send({
      installationId: created.installationId,
      androidCredential: created.installationCredential,
    });
  });

  app.post(
    '/v1/me/installations/:installationId/claim',
    { preHandler: authenticate },
    async (request, reply) => {
      const accountSession = request.accountSession;
      if (!accountSession) {
        return reply.code(401).send({
          code: 'unauthorized',
          message: 'A valid application session is required.',
          requestId: request.id,
        });
      }

      const params = installationParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send({
          code: 'invalid_request',
          message: 'A valid installationId is required.',
          requestId: request.id,
        });
      }

      const credential = extractInstallationCredential(request, accountSession.platform);
      if (!credential) {
        return reply.code(401).send({
          code: 'unauthorized',
          message: 'Installation credential is required.',
          requestId: request.id,
        });
      }

      try {
        options.repository.claimInstallation({
          installationId: params.data.installationId,
          credential,
          accountId: accountSession.accountId,
          sessionPlatform: accountSession.platform,
          claimedAt: now().toISOString(),
        });

        return reply.code(204).send();
      } catch (error) {
        const handled = handleInstallationError(error, reply, request);
        if (handled) {
          return handled;
        }
        throw error;
      }
    },
  );

  app.delete(
    '/v1/me/installations/:installationId/claim',
    { preHandler: authenticate },
    async (request, reply) => {
      const accountSession = request.accountSession;
      if (!accountSession) {
        return reply.code(401).send({
          code: 'unauthorized',
          message: 'A valid application session is required.',
          requestId: request.id,
        });
      }

      const params = installationParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send({
          code: 'invalid_request',
          message: 'A valid installationId is required.',
          requestId: request.id,
        });
      }

      const credential = extractInstallationCredential(request, accountSession.platform);
      if (!credential) {
        return reply.code(401).send({
          code: 'unauthorized',
          message: 'Installation credential is required.',
          requestId: request.id,
        });
      }

      try {
        options.repository.unlinkInstallation({
          installationId: params.data.installationId,
          credential,
          accountId: accountSession.accountId,
          unlinkedAt: now().toISOString(),
        });

        return reply.code(204).send();
      } catch (error) {
        const handled = handleInstallationError(error, reply, request);
        if (handled) {
          return handled;
        }
        throw error;
      }
    },
  );
}
