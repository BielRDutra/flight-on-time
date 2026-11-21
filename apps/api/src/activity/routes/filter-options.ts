import { airportIcaoSchema } from '@flight-on-time/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ActivityFilterService } from '../filters/activity-filter-service.js';

const airportFacetQuerySchema = z
  .object({
    airportIcao: z
      .union([airportIcaoSchema, z.array(airportIcaoSchema).max(100)])
      .optional(),
  })
  .strict();

export async function registerFilterOptionsRoutes(
  app: FastifyInstance,
  service: Pick<ActivityFilterService, 'getFilterOptions'>,
): Promise<void> {
  app.get('/v1/filter-options', async (request, reply) => {
    const parsed = airportFacetQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({
        code: 'invalid_request',
        message: 'Invalid filter options query parameters.',
        requestId: request.id,
      });
    }

    const rawAirport = parsed.data.airportIcao;
    const airportIcaos = rawAirport ? (Array.isArray(rawAirport) ? rawAirport : [rawAirport]) : [];

    return reply.code(200).send(service.getFilterOptions(airportIcaos));
  });
}
