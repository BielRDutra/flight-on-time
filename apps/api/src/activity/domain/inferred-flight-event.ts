import type {
  AirlineReference,
  ClassificationStatus,
  EventLifecycleStatus,
  EventSourceObservation,
  EventType,
  InferredEvent,
} from '@flight-on-time/contracts';

export interface AirlineReferenceRecord {
  airlineId: string;
  displayName: string;
  sourceId: string;
  sourceUpdatedAt: string | null;
}

export interface InferredFlightEventRecord {
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
  sources: EventSourceObservation[];
  algorithmVersion: string;
  status: EventLifecycleStatus;
}

export interface CreateInferredFlightEventInput {
  eventId: string;
  airportIcao: string;
  category: EventType;
  classificationStatus?: ClassificationStatus | undefined;
  airlineId?: string | null | undefined;
  airlineSourceId?: string | null | undefined;
  airlineObservedAt?: string | null | undefined;
  aircraftIcao24?: string | null | undefined;
  firstObservedAt: string;
  lastObservedAt: string;
  confidence: number;
  sources: EventSourceObservation[];
  algorithmVersion: string;
  status: EventLifecycleStatus;
}

export function createInferredFlightEvent(
  input: CreateInferredFlightEventInput,
): InferredFlightEventRecord {
  const airlineId = input.airlineId ?? null;
  const airlineSourceId = input.airlineSourceId?.trim() || null;

  if (airlineId !== null && airlineSourceId === null) {
    throw new Error(
      'Airline attribution requires a verified airlineSourceId; never infer airline from callsign.',
    );
  }

  return {
    eventId: input.eventId,
    airportIcao: input.airportIcao,
    category: input.category,
    classificationStatus: input.classificationStatus ?? 'inferred',
    airlineId,
    airlineSourceId: airlineId === null ? null : airlineSourceId,
    airlineObservedAt: airlineId === null ? null : (input.airlineObservedAt ?? null),
    aircraftIcao24: input.aircraftIcao24 ?? null,
    firstObservedAt: input.firstObservedAt,
    lastObservedAt: input.lastObservedAt,
    confidence: input.confidence,
    sources: input.sources,
    algorithmVersion: input.algorithmVersion,
    status: input.status,
  };
}

export function toApiAirlineReference(record: AirlineReferenceRecord): AirlineReference {
  return {
    airlineId: record.airlineId,
    displayName: record.displayName,
    sourceId: record.sourceId,
    sourceUpdatedAt: record.sourceUpdatedAt,
  };
}

export function toApiInferredEvent(
  record: InferredFlightEventRecord,
  airlinesById: ReadonlyMap<string, AirlineReferenceRecord>,
): InferredEvent {
  const verifiedAirline =
    record.airlineId && record.airlineSourceId ? airlinesById.get(record.airlineId) : undefined;

  return {
    eventId: record.eventId,
    airportIcao: record.airportIcao,
    eventType: record.category,
    classificationStatus: record.classificationStatus,
    airline: verifiedAirline
      ? {
          airlineId: verifiedAirline.airlineId,
          displayName: verifiedAirline.displayName,
          sourceId: record.airlineSourceId ?? verifiedAirline.sourceId,
          sourceUpdatedAt: record.airlineObservedAt ?? verifiedAirline.sourceUpdatedAt,
        }
      : null,
    aircraftIcao24: record.aircraftIcao24,
    firstObservedAt: record.firstObservedAt,
    lastObservedAt: record.lastObservedAt,
    confidence: record.confidence,
    sources: record.sources,
    status: record.status,
  };
}
