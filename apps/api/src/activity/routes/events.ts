import {
  airlineIdSchema,
  airportIcaoSchema,
  eventTypeSchema,
} from '@flight-on-time/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  SourceUnavailableError,
  type ActivityFilterService,
} from '../filters/activity-filter-service.js';
import { InvalidCursorError } from '../storage/event-repository.js';

function normalizeArrayFacet<T extends z.ZodTypeAny>(itemSchema: T, maxItems: number) {
  return z
    .union([itemSchema, z.array(itemSchema).max(maxItems)])
    .optional()
    .transform((value) => (value === undefined ? [] : Array.isArray(value) ? value : [value]));
}

const eventsQuerySchema = z
  .object({
    airportIcao: normalizeArrayFacet(airportIcaoSchema, 100),
    airlineId: normalizeArrayFacet(airlineIdSchema, 100),
    eventType: normalizeArrayFacet(eventTypeSchema, 3),
    cursor: z.string().max(512).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export async function registerEventsRoutes(
  app: FastifyInstance,
  service: Pick<ActivityFilterService, 'listEvents'>,
): Promise<void> {
  app.get('/v1/events', async (request, reply) => {
    const parsed = eventsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({
        code: 'invalid_request',
        message: 'Invalid event filter parameters.',
        requestId: request.id,
      });
    }

    try {
      const page = service.listEvents({
        airportIcaos: parsed.data.airportIcao,
        airlineIds: parsed.data.airlineId,
        eventTypes: parsed.data.eventType,
        cursor: parsed.data.cursor,
        limit: parsed.data.limit,
      });

      return reply.code(200).send(page);
    } catch (error) {
      if (error instanceof InvalidCursorError) {
        return reply.code(400).send({
          code: 'invalid_cursor',
          message: error.message,
          requestId: request.id,
        });
      }

      if (error instanceof SourceUnavailableError) {
        return reply.code(503).send({
          code: 'source_unavailable',
          message: error.message,
          requestId: request.id,
        });
      }

      throw error;
    }
  });
}
