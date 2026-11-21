import type {
  ClassificationStatus,
  EventLifecycleStatus,
  EventSourceObservation,
  EventType,
  InferredEvent,
} from '@flight-on-time/contracts';
import { z } from 'zod';
import type { SqliteDatabase } from '../../storage/database.js';
import {
  createInferredFlightEvent,
  toApiInferredEvent,
  type AirlineReferenceRecord,
  type InferredFlightEventRecord,
} from '../domain/inferred-flight-event.js';
import type { FlightDataProvider } from '../providers/flight-data-provider.js';

export interface EventQueryFilters {
  airportIcaos: readonly string[];
  airlineIds: readonly string[];
  eventTypes: readonly EventType[];
  cursor?: string | undefined;
  limit: number;
}

export interface EventQueryResult {
  items: InferredEvent[];
  nextCursor: string | null;
}

export class InvalidCursorError extends Error {
  constructor() {
    super('The pagination cursor is invalid.');
    this.name = 'InvalidCursorError';
  }
}

interface EventRow {
  event_id: string;
  airport_icao: string;
  category: EventType;
  classification_status: ClassificationStatus;
  airline_id: string | null;
  airline_source_id: string | null;
  airline_observed_at: string | null;
  aircraft_icao24: string | null;
  first_observed_at: string;
  last_observed_at: string;
  confidence: number;
  source_ids_json: string;
  algorithm_version: string;
  status: EventLifecycleStatus;
  ref_display_name: string | null;
  ref_source_id: string | null;
  ref_source_updated_at: string | null;
}

interface AirlineRow {
  airline_id: string;
  display_name: string;
  source_id: string;
  source_updated_at: string | null;
}

const cursorPayloadSchema = z.object({
  lastObservedAt: z.string().min(1),
  eventId: z.string().min(1),
});

export class SqliteEventRepository {
  constructor(private readonly database: SqliteDatabase) {}

  seedFromProvider(provider: FlightDataProvider): void {
    const upsertAirport = this.database.prepare(`
      INSERT INTO airports (icao_code, name, latitude, longitude, timezone)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (icao_code) DO UPDATE SET
        name = excluded.name,
        latitude = excluded.latitude,
        longitude = excluded.longitude,
        timezone = excluded.timezone
    `);

    const upsertAirline = this.database.prepare(`
      INSERT INTO airline_references (airline_id, display_name, source_id, source_updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT (airline_id) DO UPDATE SET
        display_name = excluded.display_name,
        source_id = excluded.source_id,
        source_updated_at = excluded.source_updated_at
    `);

    const upsertEvent = this.database.prepare(`
      INSERT INTO inferred_flight_events (
        event_id,
        airport_icao,
        category,
        classification_status,
        airline_id,
        airline_source_id,
        airline_observed_at,
        aircraft_icao24,
        first_observed_at,
        last_observed_at,
        confidence,
        source_ids_json,
        algorithm_version,
        status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (event_id) DO UPDATE SET
        airport_icao = excluded.airport_icao,
        category = excluded.category,
        classification_status = excluded.classification_status,
        airline_id = excluded.airline_id,
        airline_source_id = excluded.airline_source_id,
        airline_observed_at = excluded.airline_observed_at,
        aircraft_icao24 = excluded.aircraft_icao24,
        first_observed_at = excluded.first_observed_at,
        last_observed_at = excluded.last_observed_at,
        confidence = excluded.confidence,
        source_ids_json = excluded.source_ids_json,
        algorithm_version = excluded.algorithm_version,
        status = excluded.status
    `);

    const applySeed = this.database.transaction(() => {
      for (const airport of provider.getAirports()) {
        upsertAirport.run(
          airport.icaoCode,
          airport.name,
          airport.latitude,
          airport.longitude,
          airport.timezone,
        );
      }

      for (const airline of provider.getAirlines()) {
        upsertAirline.run(
          airline.airlineId,
          airline.displayName,
          airline.sourceId,
          airline.sourceUpdatedAt,
        );
      }

      for (const rawEvent of provider.getEvents()) {
        const event = createInferredFlightEvent(rawEvent);
        upsertEvent.run(
          event.eventId,
          event.airportIcao,
          event.category,
          event.classificationStatus,
          event.airlineId,
          event.airlineSourceId,
          event.airlineObservedAt,
          event.aircraftIcao24,
          event.firstObservedAt,
          event.lastObservedAt,
          event.confidence,
          JSON.stringify(event.sources),
          event.algorithmVersion,
          event.status,
        );
      }
    });

    applySeed();
  }

  listVerifiedAirlines(airportIcaos: readonly string[] = []): AirlineReferenceRecord[] {
    if (airportIcaos.length === 0) {
      const rows = this.database
        .prepare(
          `
          SELECT airline_id, display_name, source_id, source_updated_at
          FROM airline_references
          ORDER BY airline_id ASC
        `,
        )
        .all() as AirlineRow[];

      return rows.map(mapAirlineRow);
    }

    const placeholders = airportIcaos.map(() => '?').join(', ');
    const rows = this.database
      .prepare(
        `
        SELECT DISTINCT a.airline_id, a.display_name, a.source_id, a.source_updated_at
        FROM airline_references a
        INNER JOIN inferred_flight_events e ON e.airline_id = a.airline_id
        WHERE e.airport_icao IN (${placeholders})
          AND e.airline_source_id IS NOT NULL
        ORDER BY a.airline_id ASC
      `,
      )
      .all(...airportIcaos) as AirlineRow[];

    return rows.map(mapAirlineRow);
  }

  listEvents(filters: EventQueryFilters): EventQueryResult {
    const conditions: string[] = [];
    const parameters: unknown[] = [];

    if (filters.airportIcaos.length > 0) {
      const placeholders = filters.airportIcaos.map(() => '?').join(', ');
      conditions.push(`e.airport_icao IN (${placeholders})`);
      parameters.push(...filters.airportIcaos);
    }

    if (filters.airlineIds.length > 0) {
      const placeholders = filters.airlineIds.map(() => '?').join(', ');
      conditions.push(`e.airline_id IN (${placeholders}) AND e.airline_source_id IS NOT NULL`);
      parameters.push(...filters.airlineIds);
    }

    if (filters.eventTypes.length > 0) {
      const placeholders = filters.eventTypes.map(() => '?').join(', ');
      conditions.push(`e.category IN (${placeholders})`);
      parameters.push(...filters.eventTypes);
    }

    if (filters.cursor) {
      const decoded = decodeCursor(filters.cursor);
      conditions.push(
        '(e.last_observed_at < ? OR (e.last_observed_at = ? AND e.event_id > ?))',
      );
      parameters.push(decoded.lastObservedAt, decoded.lastObservedAt, decoded.eventId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const fetchLimit = filters.limit + 1;
    parameters.push(fetchLimit);

    const rows = this.database
      .prepare(
        `
        SELECT
          e.event_id,
          e.airport_icao,
          e.category,
          e.classification_status,
          e.airline_id,
          e.airline_source_id,
          e.airline_observed_at,
          e.aircraft_icao24,
          e.first_observed_at,
          e.last_observed_at,
          e.confidence,
          e.source_ids_json,
          e.algorithm_version,
          e.status,
          a.display_name AS ref_display_name,
          a.source_id AS ref_source_id,
          a.source_updated_at AS ref_source_updated_at
        FROM inferred_flight_events e
        LEFT JOIN airline_references a ON a.airline_id = e.airline_id
        ${whereClause}
        ORDER BY e.last_observed_at DESC, e.event_id ASC
        LIMIT ?
      `,
      )
      .all(...parameters) as EventRow[];

    const hasMore = rows.length > filters.limit;
    const pageRows = hasMore ? rows.slice(0, filters.limit) : rows;

    const airlinesById = new Map<string, AirlineReferenceRecord>();
    const items: InferredEvent[] = pageRows.map((row) => {
      if (row.airline_id && row.ref_display_name && row.ref_source_id) {
        airlinesById.set(row.airline_id, {
          airlineId: row.airline_id,
          displayName: row.ref_display_name,
          sourceId: row.ref_source_id,
          sourceUpdatedAt: row.ref_source_updated_at,
        });
      }

      const record: InferredFlightEventRecord = {
        eventId: row.event_id,
        airportIcao: row.airport_icao,
        category: row.category,
        classificationStatus: row.classification_status,
        airlineId: row.airline_id,
        airlineSourceId: row.airline_source_id,
        airlineObservedAt: row.airline_observed_at,
        aircraftIcao24: row.aircraft_icao24,
        firstObservedAt: row.first_observed_at,
        lastObservedAt: row.last_observed_at,
        confidence: row.confidence,
        sources: JSON.parse(row.source_ids_json) as EventSourceObservation[],
        algorithmVersion: row.algorithm_version,
        status: row.status,
      };

      return toApiInferredEvent(record, airlinesById);
    });

    const lastRow = pageRows.at(-1);
    const nextCursor =
      hasMore && lastRow
        ? encodeCursor({ lastObservedAt: lastRow.last_observed_at, eventId: lastRow.event_id })
        : null;

    return { items, nextCursor };
  }
}

function mapAirlineRow(row: AirlineRow): AirlineReferenceRecord {
  return {
    airlineId: row.airline_id,
    displayName: row.display_name,
    sourceId: row.source_id,
    sourceUpdatedAt: row.source_updated_at,
  };
}

function encodeCursor(payload: { lastObservedAt: string; eventId: string }): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeCursor(cursor: string): { lastObservedAt: string; eventId: string } {
  try {
    const parsedJson = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    const parsed = cursorPayloadSchema.safeParse(parsedJson);
    if (!parsed.success) {
      throw new InvalidCursorError();
    }

    return parsed.data;
  } catch (error) {
    if (error instanceof InvalidCursorError) {
      throw error;
    }

    throw new InvalidCursorError();
  }
}
