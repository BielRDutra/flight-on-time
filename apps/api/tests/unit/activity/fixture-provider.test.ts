import { describe, expect, it, vi } from 'vitest';
import { FixtureFlightDataProvider } from '../../../src/activity/providers/fixture-flight-data-provider.js';
import {
  assertApprovedDataSource,
  DataSourcePolicyError,
} from '../../../src/activity/providers/source-policy.js';

describe('source approval policy', () => {
  it('allows deterministic fixture mode without external approval evidence', () => {
    expect(() => assertApprovedDataSource('fixture')).not.toThrow();
  });

  it.each(['flightradar24', 'adsb_lol', 'opensky'] as const)(
    'rejects live provider %s unless explicit approval evidence is recorded',
    (sourceId) => {
      expect(() => assertApprovedDataSource(sourceId)).toThrow(DataSourcePolicyError);
      expect(() =>
        assertApprovedDataSource(sourceId, {
          [sourceId]: {
            approved: false,
            termsReference: 'pending review',
          },
        }),
      ).toThrow(DataSourcePolicyError);
    },
  );

  it('permits a non-audio live provider only when explicit product approval is recorded', () => {
    expect(() =>
      assertApprovedDataSource('adsb_lol', {
        adsb_lol: {
          approved: true,
          termsReference: 'ODbL 1.0 attribution and compliance review approved',
        },
      }),
    ).not.toThrow();
  });

  it('unconditionally rejects aeroescuta even if marked approved because it is not a structured flight feed', () => {
    expect(() =>
      assertApprovedDataSource('aeroescuta', {
        aeroescuta: {
          approved: true,
          termsReference: 'invalid override',
        },
      }),
    ).toThrow(DataSourcePolicyError);
  });
});

describe('FixtureFlightDataProvider', () => {
  it('returns deterministic airports, verified airlines, and inferred events without making network calls', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const provider = new FixtureFlightDataProvider();

    const airports = provider.getAirports();
    const airlines = provider.getAirlines();
    const events = provider.getEvents();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(provider.getSourceStatus()).toBe('current');
    expect(provider.getGeneratedAt()).toBeTruthy();

    expect(airports.map((airport) => airport.icaoCode)).toContain('SBBR');
    expect(airlines.map((airline) => airline.airlineId)).toEqual(
      expect.arrayContaining(['LATAM', 'GOL', 'AZU']),
    );
    expect(events.map((event) => event.category)).toEqual(
      expect.arrayContaining(['go_around', 'holding_or_orbit', 'diversion_candidate']),
    );
    expect(events.some((event) => event.airlineId === null)).toBe(true);
    expect(
      events.every((event) =>
        event.airlineId === null ? event.airlineSourceId === null : Boolean(event.airlineSourceId),
      ),
    ).toBe(true);

    fetchSpy.mockRestore();
  });

  it.each(['current', 'stale', 'unavailable', 'limited'] as const)(
    'reports configured source status %s',
    (sourceStatus) => {
      const provider = new FixtureFlightDataProvider({
        sourceStatus,
        generatedAt: '2026-11-18T14:00:00.000Z',
      });

      expect(provider.getSourceStatus()).toBe(sourceStatus);
      expect(provider.getGeneratedAt()).toBe('2026-11-18T14:00:00.000Z');
    },
  );
});
