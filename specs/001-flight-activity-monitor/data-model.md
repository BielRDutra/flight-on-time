# Data Model: Flight Activity Monitor

The client SQLite database is installation-local. The server SQLite database contains only data
needed for background notification delivery and event deduplication. Raw upstream aircraft
positions are processed in memory and are not retained as a historical flight database.

## Airport

Represents an airport the user can observe.

| Field | Type | Rules |
|---|---|---|
| `icaoCode` | string | Required, uppercase four-character ICAO code; unique |
| `name` | string | Required display name |
| `latitude` | number | Decimal degrees, -90 through 90 |
| `longitude` | number | Decimal degrees, -180 through 180 |
| `timezone` | string | IANA timezone when known |
| `isFavorite` | boolean | Installation-local preference |
| `isSelected` | boolean | At most one selected airport per installation |

## AircraftObservation

One provider report for an aircraft at an observed time. It is an ephemeral provider response or
bounded local cache entry, not proof of a continuous or complete track.

| Field | Type | Rules |
|---|---|---|
| `icao24` | string | Optional when source omits an identifier; normalize if present |
| `callsign` | string | Optional; trim and preserve provider value |
| `latitude` | number | Required for map placement; decimal degrees |
| `longitude` | number | Required for map placement; decimal degrees |
| `altitudeMeters` | number | Optional; never infer if missing |
| `headingDegrees` | number | Optional; normalize to 0-359 |
| `groundSpeedMetersPerSecond` | number | Optional; non-negative |
| `verticalRateMetersPerSecond` | number | Optional; signed provider value |
| `source` | string | Required provider/source identifier |
| `observedAt` | timestamp | Required provider timestamp; UTC |
| `receivedAt` | timestamp | Required server receipt timestamp; UTC |

## InferredFlightEvent

An informational classification produced from a sequence of observations.

| Field | Type | Rules |
|---|---|---|
| `eventId` | string | Required stable identifier for deduplication |
| `airportIcao` | string | Required reference to Airport |
| `category` | enum | `go_around`, `holding_or_orbit`, or `diversion_candidate` |
| `aircraftIcao24` | string | Optional; avoid displaying when unavailable |
| `firstObservedAt` | timestamp | Required UTC timestamp |
| `lastObservedAt` | timestamp | Required UTC timestamp; not before first observation |
| `confidence` | number | Required from 0 to 1; indicates heuristic confidence only |
| `sourceIds` | string[] | Required source identifiers and associated timestamps |
| `algorithmVersion` | string | Required for reproducibility |
| `status` | enum | `current`, `stale`, or `expired` |

No value of `confidence` changes the event into an operational fact. The client must display the
inferred status and source age.

## WeatherObservation

An airport/station report, distinct from a forecast.

| Field | Type | Rules |
|---|---|---|
| `airportIcao` | string | Required airport/station identifier |
| `rawMetar` | string | Required original report when provided |
| `observedAt` | timestamp | Required report time in UTC |
| `receivedAt` | timestamp | Required ingestion time in UTC |
| `source` | string | Required provider identifier |
| `decodedSummary` | object | Optional display-friendly values derived from raw report |

## WeatherForecast

An official forecast report, kept distinct from observed weather and valid only for its published
period.

| Field | Type | Rules |
|---|---|---|
| `airportIcao` | string | Required airport/station identifier |
| `rawTaf` | string | Required original forecast when provided |
| `issuedAt` | timestamp | Required issue time in UTC |
| `validFrom` | timestamp | Required UTC start of validity |
| `validTo` | timestamp | Required UTC end of validity; after `validFrom` |
| `receivedAt` | timestamp | Required ingestion time in UTC |
| `source` | string | Required provider identifier |
| `decodedSummary` | object | Optional display-friendly forecast values |
| `weatherImpactLevel` | enum | `low`, `moderate`, `high`, or `unknown`; contextual, not a flight recommendation |

## AlertPreference

Installation-local selections plus the minimal synchronized copy required for background push.

| Field | Type | Rules |
|---|---|---|
| `installationId` | string | Opaque installation identifier |
| `airportIcao` | string | Airport for which the rule applies |
| `categories` | enum[] | Subset of supported inferred-event categories |
| `enabled` | boolean | Push is not sent when false |
| `consentAt` | timestamp | Present only after explicit consent |
| `updatedAt` | timestamp | Required UTC timestamp |

## PushSubscription

Server-side delivery capability for one user-approved client installation.

| Field | Type | Rules |
|---|---|---|
| `subscriptionId` | string | Opaque identifier |
| `platform` | enum | `android` or `web` |
| `endpointOrToken` | secret | Required; never logged or returned after registration |
| `installationSecretHash` | secret | Required verifier for installation-scoped updates |
| `createdAt` | timestamp | Required UTC timestamp |
| `lastConfirmedAt` | timestamp | Updated on valid client activity |
| `enabled` | boolean | Revoke/disable on user opt-out or provider invalidation |

## AudioFeed

Metadata for a feed that has passed source-authorization review. Not a recording or copied audio
archive.

| Field | Type | Rules |
|---|---|---|
| `airportIcao` | string | Required airport |
| `provider` | string | Required verified source |
| `playbackUrl` | secret | Optional protected URL; never log |
| `termsReference` | string | Required record of permission/terms review |
| `availability` | enum | `available`, `unavailable`, or `unverified` |
| `checkedAt` | timestamp | Required UTC timestamp |

## Relationships and lifecycle

- An Airport has many AircraftObservations, InferredFlightEvents, WeatherObservations, and
  WeatherForecasts.
- AlertPreference belongs to one installation and one Airport; it may select multiple event
  categories.
- PushSubscription belongs to one installation and is created only after consent.
- A PushSubscription can receive an InferredFlightEvent only when an enabled preference matches
  both its airport and category and the event has not already been delivered.
- Client copies of live observations and recent events are bounded caches and may be evicted.
- Server event deduplication records expire after a bounded operational retention period selected
  during implementation; raw ADS-B payload history is not persisted.
