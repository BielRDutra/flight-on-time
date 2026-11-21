import type { EventType, PreferenceSnapshot, PreferenceUpdate } from '@flight-on-time/contracts';
import type { SqliteDatabase } from '../storage/database.js';

export class PreferenceRevisionConflictError extends Error {
  constructor(readonly currentRevision: number) {
    super('The preference revision changed; fetch and resolve before retrying.');
    this.name = 'PreferenceRevisionConflictError';
  }
}

export class UnknownPreferenceAirlineError extends Error {
  constructor(readonly airlineId: string) {
    super(`Airline reference "${airlineId}" is not verified or available.`);
    this.name = 'UnknownPreferenceAirlineError';
  }
}

export interface PreferenceRepository {
  getSnapshot(accountId: string): PreferenceSnapshot;
  replaceSnapshot(input: {
    accountId: string;
    expectedRevision: number;
    update: PreferenceUpdate;
    updatedAt: string;
  }): PreferenceSnapshot;
}

export class SqlitePreferenceRepository implements PreferenceRepository {
  constructor(private readonly database: SqliteDatabase) {}

  getSnapshot(accountId: string): PreferenceSnapshot {
    const readSnapshot = this.database.transaction(() => {
      const header = this.database
        .prepare(
          `
          SELECT revision, notifications_enabled, updated_at
          FROM account_preferences
          WHERE account_id = ?
        `,
        )
        .get(accountId) as
        | { revision: number; notifications_enabled: number; updated_at: string }
        | undefined;

      if (!header) {
        return {
          airportIcaos: [],
          airlineIds: [],
          eventTypes: [],
          notificationsEnabled: false,
          revision: 0,
          updatedAt: null,
        };
      }

      const airports = this.database
        .prepare(
          `
          SELECT airport_icao
          FROM preference_airports
          WHERE account_id = ?
          ORDER BY airport_icao ASC
        `,
        )
        .all(accountId) as { airport_icao: string }[];

      const airlines = this.database
        .prepare(
          `
          SELECT airline_id
          FROM preference_airlines
          WHERE account_id = ?
          ORDER BY airline_id ASC
        `,
        )
        .all(accountId) as { airline_id: string }[];

      const eventTypes = this.database
        .prepare(
          `
          SELECT event_type
          FROM preference_event_types
          WHERE account_id = ?
          ORDER BY event_type ASC
        `,
        )
        .all(accountId) as { event_type: EventType }[];

      return {
        airportIcaos: airports.map((row) => row.airport_icao),
        airlineIds: airlines.map((row) => row.airline_id),
        eventTypes: eventTypes.map((row) => row.event_type),
        notificationsEnabled: header.notifications_enabled === 1,
        revision: header.revision,
        updatedAt: header.updated_at,
      };
    });

    return readSnapshot();
  }

  replaceSnapshot(input: {
    accountId: string;
    expectedRevision: number;
    update: PreferenceUpdate;
    updatedAt: string;
  }): PreferenceSnapshot {
    const applyUpdate = this.database.transaction(() => {
      const existing = this.database
        .prepare(
          `
          SELECT revision
          FROM account_preferences
          WHERE account_id = ?
        `,
        )
        .get(input.accountId) as { revision: number } | undefined;

      const currentRevision = existing?.revision ?? 0;
      if (currentRevision !== input.expectedRevision) {
        throw new PreferenceRevisionConflictError(currentRevision);
      }

      if (input.update.airlineIds.length > 0) {
        const checkAirline = this.database.prepare(
          'SELECT 1 FROM airline_references WHERE airline_id = ?',
        );
        for (const airlineId of input.update.airlineIds) {
          if (!checkAirline.get(airlineId)) {
            throw new UnknownPreferenceAirlineError(airlineId);
          }
        }
      }

      const nextRevision = currentRevision + 1;
      const notificationsFlag = input.update.notificationsEnabled ? 1 : 0;

      this.database
        .prepare(
          `
          INSERT INTO account_preferences (account_id, revision, notifications_enabled, updated_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT (account_id) DO UPDATE SET
            revision = excluded.revision,
            notifications_enabled = excluded.notifications_enabled,
            updated_at = excluded.updated_at
        `,
        )
        .run(input.accountId, nextRevision, notificationsFlag, input.updatedAt);

      this.database
        .prepare('DELETE FROM preference_airports WHERE account_id = ?')
        .run(input.accountId);
      this.database
        .prepare('DELETE FROM preference_airlines WHERE account_id = ?')
        .run(input.accountId);
      this.database
        .prepare('DELETE FROM preference_event_types WHERE account_id = ?')
        .run(input.accountId);

      const insertAirport = this.database.prepare(
        'INSERT INTO preference_airports (account_id, airport_icao) VALUES (?, ?)',
      );
      const insertAirline = this.database.prepare(
        'INSERT INTO preference_airlines (account_id, airline_id) VALUES (?, ?)',
      );
      const insertEventType = this.database.prepare(
        'INSERT INTO preference_event_types (account_id, event_type) VALUES (?, ?)',
      );

      const sortedAirports = [...input.update.airportIcaos].sort();
      const sortedAirlines = [...input.update.airlineIds].sort();
      const sortedEventTypes = [...input.update.eventTypes].sort();

      for (const airportIcao of sortedAirports) {
        insertAirport.run(input.accountId, airportIcao);
      }
      for (const airlineId of sortedAirlines) {
        insertAirline.run(input.accountId, airlineId);
      }
      for (const eventType of sortedEventTypes) {
        insertEventType.run(input.accountId, eventType);
      }

      return {
        airportIcaos: sortedAirports,
        airlineIds: sortedAirlines,
        eventTypes: sortedEventTypes,
        notificationsEnabled: input.update.notificationsEnabled,
        revision: nextRevision,
        updatedAt: input.updatedAt,
      };
    });

    return applyUpdate();
  }
}
