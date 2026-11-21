import type {
  ClassificationStatus,
  EventLifecycleStatus,
  EventType,
  SourceStatus,
} from '@flight-on-time/contracts';

export interface ProviderAirport {
  icaoCode: string;
  name: string;
  latitude: number;
  longitude: number;
  timezone: string | null;
}

export interface ProviderAirline {
  airlineId: string;
  displayName: string;
  sourceId: string;
  sourceUpdatedAt: string | null;
}

export interface ProviderEventSource {
  id: string;
  observedAt: string;
}

export interface ProviderFlightEvent {
  eventId: string;
  airportIcao: string;
  category: EventType;
  classificationStatus: ClassificationStatus;
  airlineId: string | null;
  airlineSourceId: string | null;
  airlineObservedAt: string | null;
  aircraftIcao24: string | null;
  firstObservedAt: string;
  lastObservedAt: string;
  confidence: number;
  sources: ProviderEventSource[];
  algorithmVersion: string;
  status: EventLifecycleStatus;
}

export interface FlightDataProvider {
  getSourceId(): string;
  getSourceStatus(): SourceStatus;
  getGeneratedAt(): string;
  getAirports(): readonly ProviderAirport[];
  getAirlines(): readonly ProviderAirline[];
  getEvents(): readonly ProviderFlightEvent[];
}
