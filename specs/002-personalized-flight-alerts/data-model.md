# Data Model: Personalized Flight Alerts

Feature 002 extends the event and installation models from
[feature 001](../001-flight-activity-monitor/data-model.md). Server preferences are canonical;
the client copy is an account-partitioned cache. Persist no raw aircraft position history.

## AccountIdentity

Maps a validated external identity to an internal account identifier. User identity is taken only
from the verified OIDC principal.

| Field | Type | Rules |
|---|---|---|
| `accountId` | UUID | Required, generated internally, primary key |
| `issuer` | URL | Required; canonical Google issuer `https://accounts.google.com` after validating the accepted Google issuer value |
| `subject` | string | Required Google `sub`; case-sensitive ASCII, maximum 255 characters; never use email as the identity key |
| `createdAt` | timestamp | Required UTC |

Unique constraint: `(issuer, subject)`. Do not store passwords, Google ID tokens, or email/profile
claims unless a separately approved feature requires them.

## AccountSession

Server-side record for an opaque application session. The web client receives the session in a
Secure, HttpOnly, SameSite cookie; Android receives it once and stores it in OS-backed secure
storage. Google ID tokens are exchanged at sign-in and are never application session credentials.

| Field | Type | Rules |
|---|---|---|
| `sessionIdHash` | secret hash | Required; unique hash of the opaque application session value, never the raw value |
| `accountId` | UUID | Required foreign key to `AccountIdentity` |
| `platform` | enum | Required; `web` or `android` |
| `createdAt` | timestamp | Required UTC |
| `expiresAt` | timestamp | Required UTC; must be after `createdAt` |
| `revokedAt` | timestamp | Nullable UTC; set on logout/revocation |

Web session cookies are Secure, HttpOnly, SameSite, and rotated after authentication. Revoke
opaque sessions on logout. Do not log cookies, ID tokens, session tokens, or authorization codes.
`sessionIdHash` is unique and indexed; expired or revoked sessions are removed by a bounded
cleanup process.

## GoogleAuthChallenge

Short-lived, single-use server challenge that binds Google sign-in to a platform and prevents
replay of a previously issued ID token.

| Field | Type | Rules |
|---|---|---|
| `challengeIdHash` | secret hash | Required, unique; never store the raw challenge ID |
| `nonceHash` | secret hash | Required; compare with the hash of the verified token's `nonce` claim |
| `platform` | enum | Required; `web` or `android` |
| `createdAt` | timestamp | Required UTC |
| `expiresAt` | timestamp | Required UTC; short-lived and after `createdAt` |
| `consumedAt` | timestamp | Nullable UTC; set atomically on successful token exchange |

Consume a challenge at most once and reject expired, mismatched-platform, or replayed challenges.
Delete expired challenges through bounded cleanup.

## AirlineReference

Canonical display identity for an airline/operator only when backed by verified provider metadata
or an authorized mapping source.

| Field | Type | Rules |
|---|---|---|
| `airlineId` | string | Stable canonical identifier; unique |
| `displayName` | string | Required when `airlineId` is present |
| `sourceId` | string | Required provenance for the mapping |
| `sourceUpdatedAt` | timestamp | Optional UTC source timestamp |

No reference row represents an unknown or guessed airline. An event with no verified mapping has
a null airline reference and an explicit unknown display state.

## AccountPreferences

One versioned, complete preference snapshot per account.

| Field | Type | Rules |
|---|---|---|
| `accountId` | UUID | Required, primary/foreign key to `AccountIdentity` |
| `revision` | integer | Required, starts at 0; increment on each accepted update |
| `notificationsEnabled` | boolean | Required; defaults to false |
| `updatedAt` | timestamp | Required UTC |

### Preference selections

Store selected facets as normalized child rows so that airport, airline, and event-type
relationships can be validated and indexed.

| Relation | Fields | Rules |
|---|---|---|
| `PreferenceAirport` | `accountId`, `airportIcao` | Unique pair; uppercase four-character ICAO code |
| `PreferenceAirline` | `accountId`, `airlineId` | Unique pair; references `AirlineReference` |
| `PreferenceEventType` | `accountId`, `eventType` | Unique pair; one of `go_around`, `holding_or_orbit`, `diversion_candidate` |

Replace the snapshot and all child selections in one transaction. Reject stale expected revisions
with a precondition failure; do not silently merge or overwrite another session's edits. An empty
facet leaves feed results unrestricted. Alert delivery remains off unless notifications are
enabled and at least one airport and event type are selected.

## InferredFlightEvent (extension)

Retains the base fields described by feature 001 and adds optional operator provenance.

| Field | Type | Rules |
|---|---|---|
| `airlineId` | string | Nullable; reference to verified `AirlineReference` |
| `airlineSourceId` | string | Nullable; required when the airline mapping is present |
| `airlineObservedAt` | timestamp | Nullable UTC timestamp for the source/operator mapping |
| `classificationStatus` | enum | `inferred` by default; only use a directly reported status if an explicit trusted source supplies one |

An event without an airline mapping remains queryable by airport and category. Never infer the
airline from callsign text alone. The event's weather context is not a causal explanation.

## DeviceInstallation (extension)

Associates an existing feature 001 installation with, at most, one authenticated account.

| Field | Type | Rules |
|---|---|---|
| `installationId` | string | Required opaque identifier |
| `accountId` | UUID | Nullable until explicitly claimed by an authenticated account |
| `platform` | enum | `android` or `web` |
| `installationCredentialHash` | secret hash | Required for installation-scoped authorization; never log the raw credential |
| `claimedAt` | timestamp | Nullable UTC |
| `createdAt` | timestamp | Required UTC |

The same installation cannot be claimed by two accounts. Explicit sign-out removes the account
association and disables that installation's push subscription.
`installationId` and `installationCredentialHash` are unique.

## PushSubscription (extension)

One consented delivery endpoint for an account-linked installation.

| Field | Type | Rules |
|---|---|---|
| `installationId` | string | Required unique foreign key to `DeviceInstallation` |
| `platform` | enum | `android` or `web`; must match the installation |
| `endpointOrTokenCiphertext` | encrypted secret | Required while enabled; never log or return after registration |
| `consentAt` | timestamp | Required UTC |
| `enabled` | boolean | Disabled on opt-out, invalid endpoint, or account unlink |
| `updatedAt` | timestamp | Required UTC |

Device OS/browser permission is external state and must be refreshed or handled when delivery
fails. It is not treated as a permanent account-wide authorization.

## NotificationDelivery

Bounded idempotency record for one event delivered to one account installation.

| Field | Type | Rules |
|---|---|---|
| `eventId` | string | Required base event identifier |
| `accountId` | UUID | Required foreign key |
| `installationId` | string | Required foreign key |
| `sentAt` | timestamp | Required UTC |
| `status` | enum | `sent`, `failed`, or `invalidated` |

Unique constraint: `(eventId, accountId, installationId)`. Expire records after a bounded
deduplication period. Do not use this table as a flight-history store.

## Relationships and lifecycle

- One `AccountIdentity` has zero or one `AccountPreferences`, many `AccountSession` rows, and many
  claimed `DeviceInstallation` rows.
- `AccountPreferences` has many selected airports, airlines, and event types.
- A `DeviceInstallation` has zero or one `PushSubscription`; it may be associated with only one
  account at a time.
- A push delivery is eligible only when the account preference is enabled, the event matches all
  active alert facets, the installation is linked to that account, the subscription is enabled,
  and the device previously consented.
- A change to preference selections increments `revision`; the client cache records its account
  ID and server revision. On sign-out, clear the visible account cache and unlink the current
  installation without deleting the server-owned preference snapshot.
- Turn on SQLite foreign-key enforcement for every connection. Apply schema changes through
  versioned migrations and test restore from a consistent database backup.
