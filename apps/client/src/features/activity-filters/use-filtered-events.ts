import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  EVENT_TYPES,
  eventPageSchema,
  filterOptionsSchema,
  type AirlineReference,
  type EventType,
  type InferredEvent,
  type SourceStatus,
} from '@flight-on-time/contracts';

export interface ActivityFilterSelection {
  airportIcaos: string[];
  airlineIds: string[];
  eventTypes: EventType[];
}

export type ActivityFilterFacet = 'airportIcaos' | 'airlineIds' | 'eventTypes';

export const EMPTY_ACTIVITY_FILTERS: ActivityFilterSelection = {
  airportIcaos: [],
  airlineIds: [],
  eventTypes: [],
};

export interface UseFilteredEventsOptions {
  apiBaseUrl: string;
  initialSelection?: ActivityFilterSelection | undefined;
  fetchImpl?: typeof fetch | undefined;
  bearerToken?: string | undefined;
}

export interface UseFilteredEventsState {
  selection: ActivityFilterSelection;
  airlines: AirlineReference[];
  eventTypes: readonly EventType[];
  events: InferredEvent[];
  sourceStatus: SourceStatus;
  generatedAt: string | null;
  nextCursor: string | null;
  isLoading: boolean;
  errorMessage: string | null;
  toggleAirport: (airportIcao: string) => void;
  toggleAirline: (airlineId: string) => void;
  toggleEventType: (eventType: EventType) => void;
  clearFacet: (facet: ActivityFilterFacet) => void;
  clearAllFilters: () => void;
  setSelection: (next: ActivityFilterSelection) => void;
  reload: () => void;
}

export function buildEventsQueryString(selection: ActivityFilterSelection): string {
  const params = new URLSearchParams();

  for (const airportIcao of selection.airportIcaos) {
    params.append('airportIcao', airportIcao);
  }
  for (const airlineId of selection.airlineIds) {
    params.append('airlineId', airlineId);
  }
  for (const eventType of selection.eventTypes) {
    params.append('eventType', eventType);
  }

  const query = params.toString();
  return query ? `?${query}` : '';
}

function toggleValue<T extends string>(items: readonly T[], value: T): T[] {
  return items.includes(value) ? items.filter((item) => item !== value) : [...items, value];
}

export function useFilteredEvents(options: UseFilteredEventsOptions): UseFilteredEventsState {
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiBaseUrl = options.apiBaseUrl.replace(/\/+$/, '');
  const [selection, setSelection] = useState<ActivityFilterSelection>(
    options.initialSelection ?? EMPTY_ACTIVITY_FILTERS,
  );
  const [airlines, setAirlines] = useState<AirlineReference[]>([]);
  const [eventTypes, setEventTypes] = useState<readonly EventType[]>(EVENT_TYPES);
  const [events, setEvents] = useState<InferredEvent[]>([]);
  const [sourceStatus, setSourceStatus] = useState<SourceStatus>('current');
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const requestCounterRef = useRef(0);

  const authHeaders = useMemo<Record<string, string>>(
    () => (options.bearerToken ? { authorization: `Bearer ${options.bearerToken}` } : {}),
    [options.bearerToken],
  );

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    for (const airportIcao of selection.airportIcaos) {
      params.append('airportIcao', airportIcao);
    }
    const query = params.toString();
    const url = `${apiBaseUrl}/v1/filter-options${query ? `?${query}` : ''}`;

    void fetchImpl(url, {
      credentials: 'include',
      headers: authHeaders,
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          return;
        }
        const parsed = filterOptionsSchema.safeParse(await response.json());
        if (!controller.signal.aborted && parsed.success) {
          setAirlines(parsed.data.airlines);
          setEventTypes(parsed.data.eventTypes);
        }
      })
      .catch(() => {
        // Filter options failures do not override explicit event list errors.
      });

    return () => {
      controller.abort();
    };
  }, [apiBaseUrl, authHeaders, fetchImpl, selection.airportIcaos]);

  useEffect(() => {
    const requestId = ++requestCounterRef.current;
    const controller = new AbortController();
    const queryString = buildEventsQueryString(selection);

    void Promise.resolve()
      .then(async () => {
        if (controller.signal.aborted || requestId !== requestCounterRef.current) {
          return;
        }

        setIsLoading(true);
        setErrorMessage(null);

        const response = await fetchImpl(`${apiBaseUrl}/v1/events${queryString}`, {
          credentials: 'include',
          headers: authHeaders,
          signal: controller.signal,
        });

        if (controller.signal.aborted || requestId !== requestCounterRef.current) {
          return;
        }

        if (!response.ok) {
          setSourceStatus(response.status === 503 ? 'unavailable' : 'limited');
          setErrorMessage(
            response.status === 503
              ? 'Fonte de atividade aérea indisponível no momento.'
              : 'Não foi possível carregar os eventos filtrados.',
          );
          setEvents([]);
          setIsLoading(false);
          return;
        }

        const parsed = eventPageSchema.safeParse(await response.json());
        if (controller.signal.aborted || requestId !== requestCounterRef.current) {
          return;
        }

        if (!parsed.success) {
          setErrorMessage('Resposta de eventos inválida recebida do servidor.');
          setEvents([]);
          setIsLoading(false);
          return;
        }

        setEvents(parsed.data.items);
        setSourceStatus(parsed.data.sourceStatus);
        setGeneratedAt(parsed.data.generatedAt);
        setNextCursor(parsed.data.nextCursor);
        setIsLoading(false);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || requestId !== requestCounterRef.current) {
          return;
        }
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        setErrorMessage('Falha de rede ao consultar eventos.');
        setIsLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [apiBaseUrl, authHeaders, fetchImpl, reloadNonce, selection]);

  const toggleAirport = useCallback((airportIcao: string) => {
    setSelection((current) => ({
      ...current,
      airportIcaos: toggleValue(current.airportIcaos, airportIcao),
    }));
  }, []);

  const toggleAirline = useCallback((airlineId: string) => {
    setSelection((current) => ({
      ...current,
      airlineIds: toggleValue(current.airlineIds, airlineId),
    }));
  }, []);

  const toggleEventType = useCallback((eventType: EventType) => {
    setSelection((current) => ({
      ...current,
      eventTypes: toggleValue(current.eventTypes, eventType),
    }));
  }, []);

  const clearFacet = useCallback((facet: ActivityFilterFacet) => {
    setSelection((current) => ({
      ...current,
      [facet]: [],
    }));
  }, []);

  const clearAllFilters = useCallback(() => {
    setSelection(EMPTY_ACTIVITY_FILTERS);
  }, []);

  const reload = useCallback(() => {
    setReloadNonce((value) => value + 1);
  }, []);

  return {
    selection,
    airlines,
    eventTypes,
    events,
    sourceStatus,
    generatedAt,
    nextCursor,
    isLoading,
    errorMessage,
    toggleAirport,
    toggleAirline,
    toggleEventType,
    clearFacet,
    clearAllFilters,
    setSelection,
    reload,
  };
}
