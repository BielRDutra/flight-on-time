import { expect, test } from '@playwright/test';
import { startE2EServer, type StartedE2EServer } from './test-server-harness.js';

test.describe('Web Activity Filters Flow (SC-001, SC-005)', () => {
  let server: StartedE2EServer | undefined;

  test.beforeEach(async () => {
    server = await startE2EServer();
  });

  test.afterEach(async () => {
    await server?.stop();
    server = undefined;
  });

  test('filters deterministic fixture events within 1 second and preserves unknown airline state', async ({
    request,
  }) => {
    if (!server) {
      throw new Error('Test API server not initialized');
    }

    const startedAt = Date.now();

    const optionsRes = await request.get(`${server.baseUrl}/v1/filter-options`);
    expect(optionsRes.status()).toBe(200);
    const optionsBody = (await optionsRes.json()) as { sourceStatus: string };
    expect(optionsBody.sourceStatus).toBe('current');

    // OR within airport facet + unrestricted airline/category
    const airportsRes = await request.get(
      `${server.baseUrl}/v1/events?airportIcao=SBBR&airportIcao=SBGR`,
    );
    expect(airportsRes.status()).toBe(200);
    const airportsBody = (await airportsRes.json()) as {
      items: { eventId: string; airline: unknown }[];
    };
    expect(airportsBody.items).toHaveLength(3);
    expect(airportsBody.items.some((item) => item.airline === null)).toBe(true);

    // AND across airport and category
    const combinedRes = await request.get(
      `${server.baseUrl}/v1/events?airportIcao=SBBR&eventType=go_around`,
    );
    expect(combinedRes.status()).toBe(200);
    const combinedBody = (await combinedRes.json()) as { items: unknown[] };
    expect(combinedBody.items).toHaveLength(1);

    const elapsedMs = Date.now() - startedAt;
    expect(elapsedMs).toBeLessThan(1000);
  });
});
