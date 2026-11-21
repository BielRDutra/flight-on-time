import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { describe, expect, it, vi } from 'vitest';
import type { EventPage, FilterOptions } from '@flight-on-time/contracts';
import { ActivityFilterBar } from '../../../src/features/activity-filters/ActivityFilterBar.js';
import { ActivityResultsState } from '../../../src/features/activity-filters/ActivityResultsState.js';
import { useFilteredEvents } from '../../../src/features/activity-filters/use-filtered-events.js';

const filterOptionsPayload: FilterOptions = {
  eventTypes: ['go_around', 'holding_or_orbit', 'diversion_candidate'],
  airlines: [
    {
      airlineId: 'LATAM',
      displayName: 'LATAM Airlines Brasil',
      sourceId: 'fixture-operator-registry',
      sourceUpdatedAt: '2026-11-18T11:55:00.000Z',
    },
  ],
  sourceStatus: 'current',
  generatedAt: '2026-11-18T12:00:00.000Z',
};

const defaultEventsPayload: EventPage = {
  items: [
    {
      eventId: 'evt-1',
      airportIcao: 'SBBR',
      eventType: 'go_around',
      classificationStatus: 'inferred',
      airline: {
        airlineId: 'LATAM',
        displayName: 'LATAM Airlines Brasil',
        sourceId: 'fixture-operator-registry',
        sourceUpdatedAt: '2026-11-18T11:55:00.000Z',
      },
      aircraftIcao24: 'e48c11',
      firstObservedAt: '2026-11-18T11:50:00.000Z',
      lastObservedAt: '2026-11-18T11:54:00.000Z',
      confidence: 0.84,
      sources: [{ id: 'fixture-adsb', observedAt: '2026-11-18T11:54:00.000Z' }],
      status: 'current',
    },
    {
      eventId: 'evt-2',
      airportIcao: 'SBBR',
      eventType: 'holding_or_orbit',
      classificationStatus: 'inferred',
      airline: null,
      aircraftIcao24: 'e49944',
      firstObservedAt: '2026-11-18T11:30:00.000Z',
      lastObservedAt: '2026-11-18T11:36:00.000Z',
      confidence: 0.65,
      sources: [{ id: 'fixture-adsb', observedAt: '2026-11-18T11:36:00.000Z' }],
      status: 'current',
    },
  ],
  sourceStatus: 'current',
  generatedAt: '2026-11-18T12:00:00.000Z',
  nextCursor: null,
};

function TestActivityFilterScreen({
  fetchImpl,
  airports = ['SBBR', 'SBGR'],
}: {
  fetchImpl: typeof fetch;
  airports?: readonly string[];
}) {
  const filtered = useFilteredEvents({
    apiBaseUrl: 'https://api.flightontime.example',
    fetchImpl,
  });

  return (
    <>
      <ActivityFilterBar
        availableAirports={airports}
        availableAirlines={filtered.airlines}
        availableEventTypes={filtered.eventTypes}
        selection={filtered.selection}
        onToggleAirport={filtered.toggleAirport}
        onToggleAirline={filtered.toggleAirline}
        onToggleEventType={filtered.toggleEventType}
        onClearFacet={filtered.clearFacet}
        onClearAll={filtered.clearAllFilters}
      />
      <ActivityResultsState
        events={filtered.events}
        isLoading={filtered.isLoading}
        sourceStatus={filtered.sourceStatus}
        generatedAt={filtered.generatedAt}
        errorMessage={filtered.errorMessage}
        onClearFilters={filtered.clearAllFilters}
      />
    </>
  );
}

describe('activity filters UI and hook', () => {
  it('displays events, marks unknown airlines explicitly, and renders non-causal weather disclaimer', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes('/v1/filter-options')) {
        return new Response(JSON.stringify(filterOptionsPayload), { status: 200 });
      }
      return new Response(JSON.stringify(defaultEventsPayload), { status: 200 });
    });

    await render(<TestActivityFilterScreen fetchImpl={fetchImpl} />);

    await waitFor(() => {
      expect(screen.getByText('SBBR · Arremetida')).toBeTruthy();
      expect(screen.getAllByText('LATAM Airlines Brasil').length).toBeGreaterThanOrEqual(2);
      expect(screen.getByText('Companhia desconhecida')).toBeTruthy();
    });

    expect(
      screen.getByText(/Condições meteorológicas são apresentadas apenas como contexto/i),
    ).toBeTruthy();
    expect(screen.getAllByText(/Classificação inferida/i).length).toBeGreaterThan(0);
  });

  it('shows empty state when a filter combination has no matches and allows clearing all filters', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes('/v1/filter-options')) {
        return new Response(JSON.stringify(filterOptionsPayload), { status: 200 });
      }
      if (url.includes('airportIcao=SBGR')) {
        return new Response(
          JSON.stringify({
            ...defaultEventsPayload,
            items: [],
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify(defaultEventsPayload), { status: 200 });
    });

    await render(<TestActivityFilterScreen fetchImpl={fetchImpl} />);

    await waitFor(() => expect(screen.getByText('SBBR · Arremetida')).toBeTruthy());

    await fireEvent.press(screen.getByLabelText('Filtrar aeroporto SBGR'));
    await waitFor(() =>
      expect(
        screen.getByText('Nenhum evento encontrado para os filtros selecionados.'),
      ).toBeTruthy(),
    );

    await fireEvent.press(screen.getByLabelText('Limpar todos os filtros'));
    await waitFor(() => expect(screen.getByText('SBBR · Arremetida')).toBeTruthy());
  });

  it('ignores stale out-of-order responses and shows stale source status warning', async () => {
    let resolveFirstEvents: ((response: Response) => void) | undefined;
    let eventsCallCount = 0;

    const fetchImpl = vi.fn<typeof fetch>((input) => {
      const url = String(input);
      if (url.includes('/v1/filter-options')) {
        return Promise.resolve(new Response(JSON.stringify(filterOptionsPayload), { status: 200 }));
      }

      eventsCallCount += 1;
      if (eventsCallCount === 1) {
        return new Promise<Response>((resolve) => {
          resolveFirstEvents = resolve;
        });
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            items: [defaultEventsPayload.items[1]],
            sourceStatus: 'stale',
            generatedAt: '2026-11-18T11:30:00.000Z',
            nextCursor: null,
          }),
          { status: 200 },
        ),
      );
    });

    await render(<TestActivityFilterScreen fetchImpl={fetchImpl} />);

    expect(screen.getByText('Carregando eventos...')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Filtrar aeroporto SBBR'));

    await waitFor(() => {
      expect(screen.getByText('Companhia desconhecida')).toBeTruthy();
      expect(screen.getByText(/Dados desatualizados/i)).toBeTruthy();
    });

    // Resolve the older, slower initial request AFTER the newer selection settled.
    resolveFirstEvents?.(new Response(JSON.stringify(defaultEventsPayload), { status: 200 }));
    await Promise.resolve();

    expect(screen.queryByText('SBBR · Arremetida')).toBeNull();
    expect(screen.getByText('Companhia desconhecida')).toBeTruthy();
  });
});
