import type { FastifyInstance } from 'fastify';
import type { GoogleAuthService } from '../auth/google-auth-service.js';
import { requireAccountSession } from '../auth/session-middleware.js';
import {
  PreferenceRevisionConflictError,
  UnknownPreferenceAirlineError,
} from './preference-repository.js';
import { InvalidPreferenceRequestError, type PreferenceService } from './preference-service.js';

export interface PreferenceRoutesOptions {
  authService: Pick<GoogleAuthService, 'findActiveSession'>;
  preferenceService: PreferenceService;
}

export async function registerPreferenceRoutes(
  app: FastifyInstance,
  options: PreferenceRoutesOptions,
): Promise<void> {
  const authenticate = requireAccountSession(options.authService);

  app.get(
    '/v1/me/preferences',
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

      const result = options.preferenceService.getPreferences(accountSession.accountId);
      reply.header('ETag', result.etag);
      return reply.code(200).send(result.snapshot);
    },
  );

  app.put(
    '/v1/me/preferences',
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

      try {
        const result = options.preferenceService.updatePreferences(
          accountSession.accountId,
          request.headers['if-match'],
          request.body,
        );
        reply.header('ETag', result.etag);
        return reply.code(200).send(result.snapshot);
      } catch (error) {
        if (error instanceof InvalidPreferenceRequestError) {
          return reply.code(400).send({
            code: 'invalid_request',
            message: error.message,
            requestId: request.id,
          });
        }

        if (error instanceof UnknownPreferenceAirlineError) {
          return reply.code(400).send({
            code: 'unknown_airline',
            message: error.message,
            requestId: request.id,
          });
        }

        if (error instanceof PreferenceRevisionConflictError) {
          return reply.code(412).send({
            code: 'precondition_failed',
            message: error.message,
            requestId: request.id,
          });
        }

        throw error;
      }
    },
  );
}
