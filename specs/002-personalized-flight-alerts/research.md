# Research: Personalized Flight Alerts

## 1. Google sign-in across web and Android

**Decision**: Use Google as the account identity provider. The web client uses Google Identity
Services; Android uses the official Credential Manager Sign in with Google flow through an
Expo-compatible native integration. Both clients obtain a Google ID token and exchange it once
with the backend. The backend verifies the token signature, accepted Google issuer, platform
client ID (`aud`), expiration, and a short-lived, single-use `nonce`; it then maps the canonical
Google issuer and `sub` to an internal account. Never use email as the account key or store Google
ID/refresh tokens. The backend issues its own opaque application session: a Secure, HttpOnly,
SameSite cookie for web and a token held in Android SecureStore for Android. The Google ID token
is not an API session credential.

The web GIS credential POST must pass Google's double-submit `g_csrf_token` check and the app's
Origin/CSRF checks. Register web and Android OAuth clients; Android Credential Manager requests
the ID token with the web/server client ID (`serverClientId`), and the backend validates against
an explicit audience allowlist. Keep client IDs in validated environment configuration; no Google
API scopes beyond identity are needed. Complete Google Cloud app branding/verification before
public release.

**Rationale**: The user selected Google verification. Google documents OpenID Connect and stable
`sub` identity, recommends server-side ID-token verification, recommends Credential Manager for
Android, and provides Google Identity Services for web. Exchanging identity assertions for
application sessions keeps Google credentials out of subsequent API requests and avoids a
password database.

**Alternatives considered**:

- Store email/password credentials in the application database: rejected; it creates unnecessary
  credential-handling and account-recovery responsibilities.
- Store browser access/refresh tokens in local storage: rejected because same-origin script
  compromise can read them; use the BFF session boundary instead.
- Use a Google ID token as the long-lived API bearer token: rejected; the backend issues and
  revokes application sessions.
- Store email or profile claims as account identity: rejected because Google documents `sub` as
  the stable identifier and warns that email can change.
- Request Drive, Gmail, or other Google API scopes: rejected; the feature needs identity only.

**Sources**:

- Google OpenID Connect:
  https://developers.google.com/identity/openid-connect/openid-connect
- Google server-side ID-token validation, including signature, `aud`, `iss`, `exp`, `sub`, and
  GIS CSRF requirements:
  https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
- Android Credential Manager Sign in with Google:
  https://developer.android.com/identity/sign-in/credential-manager-siwg
- Android Credential Manager implementation (`serverClientId` and nonce):
  https://developer.android.com/identity/sign-in/credential-manager-siwg-implementation
- Google Auth Library for Node.js:
  https://github.com/googleapis/google-auth-library-nodejs
- Expo SecureStore:
  https://docs.expo.dev/versions/latest/sdk/securestore/
- OWASP Cross-Site Request Forgery Prevention Cheat Sheet:
  https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html

## 2. Cross-session preference persistence and conflict handling

**Decision**: The authenticated API is the canonical owner of each user's preference snapshot.
Client SQLite is a cache, scoped by internal account ID and cleared from the active session on
sign-out. A preference update replaces a complete validated snapshot in one transaction and
requires the revision returned by the prior read (`ETag`/`If-Match`). A stale revision returns
`412 Precondition Failed`; the client fetches the latest snapshot and asks the user to keep the
server version or retry the local changes. Offline changes remain visibly pending and are never
reported as saved until the server confirms the transaction.

Resolve each identity on the server from the validated OIDC principal, not a request-body user
identifier. Use database foreign keys and account-scoped repository queries. Existing local
installation preferences may be imported on first sign-in only when the account has no saved
snapshot; when both exist, retain the account snapshot and ask before replacing it.

**Rationale**: A local-only database cannot meet cross-device restoration. A server revision makes
concurrent edits detectable without introducing a merge service or silent last-write-wins behavior.
Transactional replacement keeps all three filter facets and notification state consistent.

**Alternatives considered**:

- Local SQLite as the sole source of truth: rejected because it cannot restore preferences on
  another installation.
- Blind last-write-wins updates: rejected because simultaneous sessions can silently lose user
  changes.
- Merge lists automatically: rejected for the MVP because a merge can produce unexpected
  subscriptions; let the user resolve a detected conflict.

**Sources**:

- SQLite foreign key constraints and the requirement to enable them per connection:
  https://www.sqlite.org/foreignkeys.html
- SQLite transactions:
  https://www.sqlite.org/lang_transaction.html

## 3. SQLite operational boundary

**Decision**: Keep client-side SQLite for the account-scoped cache and server-side SQLite for the
MVP's preferences, identity mapping, BFF sessions, push subscriptions, and bounded delivery
deduplication. Run one API instance on the same host as a durable local database volume. Enable
foreign-key enforcement on every connection, use small atomic transactions and WAL for the
read-heavy/single-writer workload, monitor lock/busy errors and WAL/checkpoint growth, and create
online consistent backups with a documented restore test. Do not use a network filesystem for the
WAL database. Keep storage behind repositories so the server database can be migrated before
multi-instance writes or high availability are required.

**Rationale**: SQLite WAL allows readers and a writer to proceed concurrently but all database
processes must be on the same host and writes remain serialized. SQLite's Online Backup API can
produce a consistent snapshot while the database is in use. This is a bounded, simple MVP design,
not a multi-instance high-availability claim.

**Alternatives considered**:

- SQLite on a shared/network filesystem or several API replicas: rejected by WAL's same-host
  constraint and write-coordination requirements.
- PostgreSQL from the first deployment: viable if launch requires multiple replicas, high
  availability, or concurrent write scale; not required by the current scope. Adopt before those
  needs arise, not after exceeding an unmonitored limit.
- Store Google ID tokens or raw application session tokens in SQLite or logs: rejected; persist
  only hashes of revocable application session tokens.

**Sources**:

- SQLite Write-Ahead Logging, concurrency, and network-filesystem constraints:
  https://www.sqlite.org/wal.html
- SQLite Online Backup API:
  https://www.sqlite.org/backup.html
- Expo SQLite platform support and persistence:
  https://docs.expo.dev/versions/latest/sdk/sqlite/

## 4. Filter semantics and airline attribution

**Decision**: Apply OR semantics to multiple selected values within one facet and AND semantics
across airline, airport, and event-category facets. An empty facet does not restrict the activity
feed. Alert delivery starts disabled and requires explicit consent plus at least one selected
airport and category; an empty airline facet means any airline at those selected airports.
Expose filter options from the configured, verified event/operator data and existing airport
catalog. Add a stable optional airline identifier and provenance to events. Use only a
provider-supplied operator identity or an authorized reference mapping; callsign text alone is not
proof of airline identity. Preserve unmatched events with an explicit unknown-airline state.

**Rationale**: These semantics make combined filters predictable and avoid enabling broad,
unsolicited push by default. Airline metadata can be absent, stale, or ambiguous in public flight
reports, so unknown is safer than a guessed carrier.

**Alternatives considered**:

- Treat an empty airport selection as “all airports” for push: rejected because it may send a
  large, unintended volume of alerts.
- Derive airline identity from an aircraft callsign without a verified mapping: rejected because
  it can mislabel events and make airline filtering unreliable.
- Require a complete airline identity for an event: rejected because it would discard otherwise
  useful airport/category events when the provider omits operator data.

**Sources and release gates**:

- Feature 001 research documents ADSB.lol's published anonymous quota and ODbL terms, and the
  requirement to validate provider coverage, rights, and rate limits before production:
  [research.md](../001-flight-activity-monitor/research.md)
- Current ADSB.lol API OpenAPI document (quota and license metadata):
  https://api.adsb.lol/api/openapi.json
- Aviation Weather Center API product and usage guidance:
  https://aviationweather.gov/data/api/
- No airline/operator mapping provider has been selected or licensed. Before live use, verify that
  the chosen ADS-B source supplies adequate operator metadata or select an authorized mapping
  source. Until then, unknown-airline behavior is required.

### Provider authorization review

An API or public website is not, by itself, proof that an airline authorized the source or that
Flight On Time may persist, transform, or redistribute its data. Each candidate must be approved
for this specific product and its intended data lifecycle before live integration.

| Candidate | What the official source documents | Decision for this product |
|---|---|---|
| Flightradar24 API | Business API for live/historical flight tracking; paid subscriptions/credits. Its current terms allow commercial use subject to restrictions, prohibit raw-data redistribution and unauthorized storage, prohibit mixing its data with another near-time/real-time provider, and restrict competing products. | Do not treat as approved by default. Require a written product-specific authorization confirming event derivation, caching/retention, display/attribution, and that this product is permitted. Do not combine with another near-time provider. |
| ADSB.lol | Public API/data are under ODbL 1.0; the official OpenAPI documents quotas (including 500 requests/day per IP without a key) and metered endpoints. | Candidate only after ODbL attribution, share-alike, derived database, and product-distribution obligations are reviewed and accepted. This is not airline authorization. |
| OpenSky Network | Official API documentation says the live API is for research and non-commercial use; commercial use requires contacting OpenSky. It returns ADS-B state vectors, not commercial schedule/delay data. | Use only fixtures for now. Production requires written commercial access terms that cover this application. |
| AeroEscuta | The site describes Brazilian aviation-band audio streams and explicitly says it has no affiliation with companies or individuals. It does not expose a documented flight-position/event API. | Not a structured flight-data source or airline-authorized feed. Do not ingest or redistribute its audio; require separate written permission for any future use. |

**Recommendation**: Keep the provider adapter boundary and deterministic fixtures for MVP
development. Evaluate ADSB.lol for an ODbL-compliant deployment and request product-specific terms
from OpenSky or Flightradar24 if their data quality is needed. A live provider remains a release
gate; never infer airline authorization from a provider's public endpoint or customer logos.

**Official sources checked**:

- Flightradar24 API portal: https://fr24api.flightradar24.com/docs
- Flightradar24 business data services: https://www.flightradar24.com/data-for-business
- Flightradar24 Terms of Service (updated 2026-06-23), especially sections 2.4, 6.3, and 8.2:
  https://www.flightradar24.com/terms-of-service
- ADSB.lol API OpenAPI/license/quota metadata:
  https://api.adsb.lol/api/openapi.json
- OpenSky official API documentation and citation/terms-of-use notice:
  https://openskynetwork.github.io/opensky-api/
- OpenSky REST API fields and coverage:
  https://openskynetwork.github.io/opensky-api/rest.html
- AeroEscuta project description and statement of no affiliation:
  https://aeroescuta.com.br/

## 5. Notifications and aviation information boundary

**Decision**: Keep account-level alert criteria in the preference snapshot and keep each push
permission and endpoint/token attached to a specific installation. Deliver only to installations
linked to the account that have explicit consent and current platform permission. On explicit
sign-out, disable the current installation's subscription and unlink it while preserving account
preferences. Deduplicate deliveries by event, account, and installation. Continue to classify
arremetidas, holding/orbit, and diversion candidates as inferred, include source times, and present
weather only as context unless an explicit source supports a causal statement.

**Rationale**: Account preferences must follow the user, while OS/browser permission is specific to
one device. Separating them prevents one device's permission state from being mistaken for a
global account setting. Deduplication and sign-out cleanup support predictable delivery and
account privacy.

**Alternatives considered**:

- Store notification permission as an account-wide fact: rejected because each device or browser
  controls its own permission.
- Continue delivering an account's notifications to a device after explicit sign-out: rejected
  for privacy on shared devices.
- Treat weather observations as proof of the reason for an event: rejected; METAR/TAF and tracks
  do not establish pilot or controller intent.

**Sources**:

- Feature 001 event, provider, and push architecture:
  [plan.md](../001-flight-activity-monitor/plan.md)
- Feature 001 source, weather, event-inference, and audio boundaries:
  [research.md](../001-flight-activity-monitor/research.md)
- Expo Notifications platform support:
  https://docs.expo.dev/versions/latest/sdk/notifications/
- MDN Push API and service-worker requirements:
  https://developer.mozilla.org/en-US/docs/Web/API/Push_API
