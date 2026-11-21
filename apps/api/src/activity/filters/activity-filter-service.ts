import {
  EVENT_TYPES,
  type EventPage,
  type EventType,
  type FilterOptions,
} from '@flight-on-time/contracts';
import { toApiAirlineReference } from '../domain/inferred-flight-event.js';
import type { FlightDataProvider } from '../providers/flight-data-provider.js';
import type { SqliteEventRepository } from '../storage/event-repository.js';

export class SourceUnavailableError extends Error {
  constructor() {
    super('Upstream flight activity source is unavailable.');
    this.name = 'SourceUnavailableError';
  }
}

export interface ActivityEventFilters {
  airportIcaos: readonly string[];
  airlineIds: readonly string[];
  eventTypes: readonly EventType[];
  cursor?: string | undefined;
  limit: number;
}

export class ActivityFilterService {
  constructor(
    private readonly repository: SqliteEventRepository,
    private readonly provider: FlightDataProvider,
  ) {}

  getFilterOptions(airportIcaos: readonly string[] = []): FilterOptions {
    const airlines = this.repository.listVerifiedAirlines(airportIcaos).map(toApiAirlineReference);

    return {
      eventTypes: [...EVENT_TYPES],
      airlines,
      sourceStatus: this.provider.getSourceStatus(),
      generatedAt: this.provider.getGeneratedAt(),
    };
  }

  listEvents(filters: ActivityEventFilters): EventPage {
    const sourceStatus = this.provider.getSourceStatus();
    if (sourceStatus === 'unavailable') {
      throw new SourceUnavailableError();
    }

    const page = this.repository.listEvents(filters);

    return {
      items: page.items,
      sourceStatus,
      generatedAt: this.provider.getGeneratedAt(),
      nextCursor: page.nextCursor,
    };
  }
}
