import type { SourceStatus } from '@flight-on-time/contracts';
import type {
  FlightDataProvider,
  ProviderAirline,
  ProviderAirport,
  ProviderFlightEvent,
} from './flight-data-provider.js';
import { assertApprovedDataSource } from './source-policy.js';

export interface FixtureFlightDataProviderOptions {
  sourceStatus?: SourceStatus;
  generatedAt?: string;
  airports?: readonly ProviderAirport[];
  airlines?: readonly ProviderAirline[];
  events?: readonly ProviderFlightEvent[];
}

const DEFAULT_GENERATED_AT = '2026-11-18T12:00:00.000Z';

const DEFAULT_AIRPORTS: readonly ProviderAirport[] = [
  {
    icaoCode: 'SBBR',
    name: 'Aeroporto Internacional de Brasília',
    latitude: -15.8711,
    longitude: -47.9186,
    timezone: 'America/Sao_Paulo',
  },
  {
    icaoCode: 'SBGR',
    name: 'Aeroporto Internacional de São Paulo/Guarulhos',
    latitude: -23.4356,
    longitude: -46.4731,
    timezone: 'America/Sao_Paulo',
  },
  {
    icaoCode: 'SBSP',
    name: 'Aeroporto de Congonhas',
    latitude: -23.6261,
    longitude: -46.6564,
    timezone: 'America/Sao_Paulo',
  },
  {
    icaoCode: 'SBRJ',
    name: 'Aeroporto Santos Dumont',
    latitude: -22.9105,
    longitude: -43.1631,
    timezone: 'America/Sao_Paulo',
  },
];

const DEFAULT_AIRLINES: readonly ProviderAirline[] = [
  {
    airlineId: 'LATAM',
    displayName: 'LATAM Airlines Brasil',
    sourceId: 'fixture-operator-registry',
    sourceUpdatedAt: '2026-11-18T11:55:00.000Z',
  },
  {
    airlineId: 'GOL',
    displayName: 'GOL Linhas Aéreas',
    sourceId: 'fixture-operator-registry',
    sourceUpdatedAt: '2026-11-18T11:55:00.000Z',
  },
  {
    airlineId: 'AZU',
    displayName: 'Azul Linhas Aéreas',
    sourceId: 'fixture-operator-registry',
    sourceUpdatedAt: '2026-11-18T11:55:00.000Z',
  },
];

const DEFAULT_EVENTS: readonly ProviderFlightEvent[] = [
  {
    eventId: 'evt-sbbr-go-around-latam-01',
    airportIcao: 'SBBR',
    category: 'go_around',
    classificationStatus: 'inferred',
    airlineId: 'LATAM',
    airlineSourceId: 'fixture-operator-registry',
    airlineObservedAt: '2026-11-18T11:54:00.000Z',
    aircraftIcao24: 'e48c11',
    firstObservedAt: '2026-11-18T11:50:00.000Z',
    lastObservedAt: '2026-11-18T11:54:00.000Z',
    confidence: 0.84,
    sources: [{ id: 'fixture-adsb', observedAt: '2026-11-18T11:54:00.000Z' }],
    algorithmVersion: 'fixture-v1',
    status: 'current',
  },
  {
    eventId: 'evt-sbgr-holding-gol-02',
    airportIcao: 'SBGR',
    category: 'holding_or_orbit',
    classificationStatus: 'inferred',
    airlineId: 'GOL',
    airlineSourceId: 'fixture-operator-registry',
    airlineObservedAt: '2026-11-18T11:48:00.000Z',
    aircraftIcao24: 'e48d22',
    firstObservedAt: '2026-11-18T11:40:00.000Z',
    lastObservedAt: '2026-11-18T11:48:00.000Z',
    confidence: 0.78,
    sources: [{ id: 'fixture-adsb', observedAt: '2026-11-18T11:48:00.000Z' }],
    algorithmVersion: 'fixture-v1',
    status: 'current',
  },
  {
    eventId: 'evt-sbsp-diversion-azu-03',
    airportIcao: 'SBSP',
    category: 'diversion_candidate',
    classificationStatus: 'inferred',
    airlineId: 'AZU',
    airlineSourceId: 'fixture-operator-registry',
    airlineObservedAt: '2026-11-18T11:42:00.000Z',
    aircraftIcao24: 'e49033',
    firstObservedAt: '2026-11-18T11:32:00.000Z',
    lastObservedAt: '2026-11-18T11:42:00.000Z',
    confidence: 0.72,
    sources: [{ id: 'fixture-adsb', observedAt: '2026-11-18T11:42:00.000Z' }],
    algorithmVersion: 'fixture-v1',
    status: 'current',
  },
  {
    eventId: 'evt-sbbr-holding-unknown-04',
    airportIcao: 'SBBR',
    category: 'holding_or_orbit',
    classificationStatus: 'inferred',
    airlineId: null,
    airlineSourceId: null,
    airlineObservedAt: null,
    aircraftIcao24: 'e49944',
    firstObservedAt: '2026-11-18T11:30:00.000Z',
    lastObservedAt: '2026-11-18T11:36:00.000Z',
    confidence: 0.65,
    sources: [{ id: 'fixture-adsb', observedAt: '2026-11-18T11:36:00.000Z' }],
    algorithmVersion: 'fixture-v1',
    status: 'current',
  },
];

export class FixtureFlightDataProvider implements FlightDataProvider {
  private readonly sourceStatus: SourceStatus;
  private readonly generatedAt: string;
  private readonly airports: readonly ProviderAirport[];
  private readonly airlines: readonly ProviderAirline[];
  private readonly events: readonly ProviderFlightEvent[];

  constructor(options: FixtureFlightDataProviderOptions = {}) {
    assertApprovedDataSource('fixture');
    this.sourceStatus = options.sourceStatus ?? 'current';
    this.generatedAt = options.generatedAt ?? DEFAULT_GENERATED_AT;
    this.airports = options.airports ?? DEFAULT_AIRPORTS;
    this.airlines = options.airlines ?? DEFAULT_AIRLINES;
    this.events = options.events ?? DEFAULT_EVENTS;
  }

  getSourceId(): string {
    return 'fixture';
  }

  getSourceStatus(): SourceStatus {
    return this.sourceStatus;
  }

  getGeneratedAt(): string {
    return this.generatedAt;
  }

  getAirports(): readonly ProviderAirport[] {
    return this.airports;
  }

  getAirlines(): readonly ProviderAirline[] {
    return this.airlines;
  }

  getEvents(): readonly ProviderFlightEvent[] {
    return this.events;
  }
}
