import { afterEach, describe, expect, it } from 'vitest';
import { buildApiApp } from '../../src/server.js';
import type { FastifyInstance } from 'fastify';

describe('API server', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('starts with migrations applied and exposes the liveness endpoint', async () => {
    app = await buildApiApp({
      host: '127.0.0.1',
      port: 3000,
      databasePath: ':memory:',
      googleWebClientId: 'web-client-id',
      allowedWebOrigins: ['https://flightontime.example'],
      environment: 'test',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/health/live',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });
});
