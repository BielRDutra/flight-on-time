import { pushSubscriptionInputSchema } from '@flight-on-time/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { GoogleAuthService } from '../auth/google-auth-service.js';
import { requireAccountSession } from '../auth/session-middleware.js';
import {
  extractInstallationCredential,
  handleInstallationError,
} from './installation-routes.js';
import {
  InstallationPlatformMismatchError,
  type SqliteNotificationRepository,
} from './notification-repository.js';

const installationParamsSchema = z
  .object({
    installationId: z.string().min(1).max(128),
  })
  .strict();

export interface PushSubscriptionRoutesOptions {
  authService: Pick<GoogleAuthService, 'findActiveSession'>;
  repository: SqliteNotificationRepository;
  now?: () => Date;
}

export async function registerPushSubscriptionRoutes(
  app: FastifyInstance,
  options: PushSubscriptionRoutesOptions,
): Promise<void> {
  const authenticate = requireAccountSession(options.authService);
  const now = options.now ?? (() => new Date());

  app.put(
    '/v1/me/installations/:installationId/push-subscription',
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
      const body = pushSubscriptionInputSchema.safeParse(request.body);
      if (!params.success || !body.success) {
        return reply.code(400).send({
          code: 'invalid_request',
          message: 'A valid consented push subscription is required.',
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
        options.repository.upsertPushSubscription({
          installationId: params.data.installationId,
          credential,
          accountId: accountSession.accountId,
          platform: body.data.platform,
          subscriptionSecretJson: JSON.stringify(body.data.subscription),
          recordedAt: now().toISOString(),
        });

        return reply.code(204).send();
      } catch (error) {
        if (error instanceof InstallationPlatformMismatchError) {
          return reply.code(400).send({
            code: 'invalid_request',
            message: error.message,
            requestId: request.id,
          });
        }

        const handled = handleInstallationError(error, reply, request);
        if (handled) {
          return handled;
        }
        throw error;
      }
    },
  );

  app.delete(
    '/v1/me/installations/:installationId/push-subscription',
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
        options.repository.disablePushSubscription({
          installationId: params.data.installationId,
          credential,
          accountId: accountSession.accountId,
          updatedAt: now().toISOString(),
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
