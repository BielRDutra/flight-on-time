import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApiApp } from '../../../src/server.js';
import { FixtureFlightDataProvider } from '../../../src/activity/providers/fixture-flight-data-provider.js';

describe('activity filter routes', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  async function createTestApp(provider = new FixtureFlightDataProvider()) {
    app = await buildApiApp({
      host: '127.0.0.1',
      port: 3000,
      databasePath: ':memory:',
      googleWebClientId: 'web-client-id',
      allowedWebOrigins: ['https://flightontime.example'],
      environment: 'test',
      flightDataProvider: provider,
    });

    return app;
  }

  it('lists supported event categories and verified airlines with source status', async () => {
    const server = await createTestApp();
    const response = await server.inject({
      method: 'GET',
      url: '/v1/filter-options',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      eventTypes: ['go_around', 'holding_or_orbit', 'diversion_candidate'],
      sourceStatus: 'current',
    });
    expect(response.json().airlines.map((a: { airlineId: string }) => a.airlineId)).toEqual(
      expect.arrayContaining(['AZU', 'GOL', 'LATAM']),
    );
  });

  it('filters verified airlines by airport when airportIcao query parameters are provided', async () => {
    const server = await createTestApp();
    const response = await server.inject({
      method: 'GET',
      url: '/v1/filter-options?airportIcao=SBBR',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().airlines.map((a: { airlineId: string }) => a.airlineId)).toEqual([
      'LATAM',
    ]);
  });

  it('returns unrestricted events including unknown-airline events when facets are omitted', async () => {
    const server = await createTestApp();
    const response = await server.inject({
      method: 'GET',
      url: '/v1/events',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.sourceStatus).toBe('current');
    expect(body.items).toHaveLength(4);
    expect(body.items.some((item: { airline: unknown }) => item.airline === null)).toBe(true);
    expect(body.nextCursor).toBeNull();
  });

  it('applies OR within each facet and AND across active facets', async () => {
    const server = await createTestApp();

    // OR within airportIcao (SBBR or SBGR)
    const multiAirport = await server.inject({
      method: 'GET',
      url: '/v1/events?airportIcao=SBBR&airportIcao=SBGR',
    });
    expect(multiAirport.statusCode).toBe(200);
    expect(multiAirport.json().items.map((item: { eventId: string }) => item.eventId)).toEqual([
      'evt-sbbr-go-around-latam-01',
      'evt-sbgr-holding-gol-02',
      'evt-sbbr-holding-unknown-04',
    ]);

    // AND across airportIcao=SBBR and eventType=holding_or_orbit -> returns unknown-airline event
    const combined = await server.inject({
      method: 'GET',
      url: '/v1/events?airportIcao=SBBR&eventType=holding_or_orbit',
    });
    expect(combined.statusCode).toBe(200);
    expect(combined.json().items).toHaveLength(1);
    expect(combined.json().items[0]).toMatchObject({
      eventId: 'evt-sbbr-holding-unknown-04',
      airline: null,
      classificationStatus: 'inferred',
    });

    // Filtering by specific airline excludes unknown-airline events
    const specificAirline = await server.inject({
      method: 'GET',
      url: '/v1/events?airportIcao=SBBR&airlineId=LATAM&airlineId=GOL',
    });
    expect(specificAirline.statusCode).toBe(200);
    expect(
      specificAirline.json().items.map((item: { eventId: string }) => item.eventId),
    ).toEqual(['evt-sbbr-go-around-latam-01']);
  });

  it('paginates deterministically using bounded limit and opaque cursor', async () => {
    const server = await createTestApp();
    const page1 = await server.inject({
      method: 'GET',
      url: '/v1/events?limit=2',
    });

    expect(page1.statusCode).toBe(200);
    const body1 = page1.json();
    expect(body1.items).toHaveLength(2);
    expect(typeof body1.nextCursor).toBe('string');

    const page2 = await server.inject({
      method: 'GET',
      url: `/v1/events?limit=2&cursor=${encodeURIComponent(body1.nextCursor)}`,
    });

    expect(page2.statusCode).toBe(200);
    const body2 = page2.json();
    expect(body2.items).toHaveLength(2);
    expect(body2.nextCursor).toBeNull();

    const allIds = [...body1.items, ...body2.items].map((item: { eventId: string }) => item.eventId);
    expect(new Set(allIds).size).toBe(4);
  });

  it('reports stale source status and returns 503 when upstream source is unavailable', async () => {
    const staleServer = await createTestApp(
      new FixtureFlightDataProvider({
        sourceStatus: 'stale',
        generatedAt: '2026-11-18T11:00:00.000Z',
      }),
    );
    const staleResponse = await staleServer.inject({
      method: 'GET',
      url: '/v1/events',
    });
    expect(staleResponse.statusCode).toBe(200);
    expect(staleResponse.json()).toMatchObject({
      sourceStatus: 'stale',
      generatedAt: '2026-11-18T11:00:00.000Z',
    });

    await staleServer.close();
    app = undefined;

    const unavailableServer = await createTestApp(
      new FixtureFlightDataProvider({
        sourceStatus: 'unavailable',
      }),
    );
    const unavailableResponse = await unavailableServer.inject({
      method: 'GET',
      url: '/v1/events',
    });
    expect(unavailableResponse.statusCode).toBe(503);
    expect(unavailableResponse.json()).toMatchObject({
      code: 'source_unavailable',
    });
  });

  it('rejects malformed filter queries with 400', async () => {
    const server = await createTestApp();
    const response = await server.inject({
      method: 'GET',
      url: '/v1/events?airportIcao=INVALID',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: 'invalid_request',
    });
  });
});
