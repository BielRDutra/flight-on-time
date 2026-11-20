# Realtime Protocol

After selecting an airport, the client requests a short-lived, single-use ticket from
`POST /v1/live-tickets` using its installation credential, then opens
`/v1/live?airport={ICAO}&ticket={ticket}`. The backend validates the ticket and airport code before
streaming user-visible snapshots and inferred events. Tickets expire within 60 seconds, are
single-use, and must be redacted from access logs. Provider credentials and raw provider payloads
are never sent to the client.

## Server messages

Every message is JSON and includes a `type`, `airportIcao`, and UTC `sentAt`.

- `snapshot`: current aircraft observations, source status, and provider timestamp. Replaces the
  client's in-memory map state; the client may cache it locally with its source age.
- `aircraft_delta`: added, updated, or removed observations since the last snapshot.
- `inferred_event`: an event matching the user's selected airport; includes the same event shape as
  `InferredEvent` in [openapi.yaml](openapi.yaml).
- `source_status`: `current`, `stale`, `unavailable`, or `limited`, plus a reason safe to display.

## Client messages

- `ping`: application-level heartbeat; server responds with `pong`.
- `refresh`: request a fresh snapshot subject to provider quota and rate limits.

## Freshness and failure behavior

- Server messages include upstream observation time separately from server send time.
- Clients mark an observation stale using the documented freshness threshold returned by the
  service; a stale position is not rendered as current.
- Invalid JSON, unsupported protocol versions, and invalid airport codes produce a clear close
  reason. Clients reconnect with bounded exponential backoff and jitter.
- A provider outage results in `source_status`, not a fabricated empty/current snapshot.
- Event delivery is at-least-once. Clients deduplicate by `eventId`; push delivery is independently
  deduplicated by the server.
- This stream is observational only and MUST NOT provide control instructions or operational
  decisions.
