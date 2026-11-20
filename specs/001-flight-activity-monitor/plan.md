# Implementation Plan: Flight Activity Monitor

**Branch**: `001-flight-activity-monitor` | **Date**: 2026-11-18 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-flight-activity-monitor/spec.md`

## Summary

Build an informational airport activity monitor for web and Android. Use TypeScript and Expo
Router for shared application flows, while using MapLibre's native Android renderer and its
WebGL browser renderer for a responsive radar map. Keep user preferences and a bounded offline
cache in SQLite on each client. An always-on TypeScript service will aggregate permitted ADS-B
and weather sources, infer explicitly non-authoritative events, and send Android and browser
push notifications. Keep server-side SQLite limited to device subscriptions, alert preferences,
and notification deduplication; retain no raw aircraft history by default. Audio remains gated
on confirming an authorized feed for the airport.

## Technical Context

**Language/Version**: TypeScript in strict mode; Node.js current LTS for the service; pin compatible
stable versions when bootstrapping against the current Expo SDK.

**Primary Dependencies**: Expo + React Native + Expo Router; `expo-sqlite`; MapLibre Native for
Android and MapLibre GL JS for web; TypeScript Node.js API/worker; Expo Notifications for Android;
Web Push API and a service worker for web.

**Storage**: SQLite on Android and web for local preferences, cached airport/weather data, and
recent event summaries. Persistent server-side SQLite for minimal push configuration and
deduplication and hashed installation credentials, on a durable volume and a single service
instance. Do not persist raw live tracks by default. Browser SQLite uses WebAssembly and requires
deployment headers; browser storage can be cleared or restricted.

**Testing**: Vitest for domain, API, and provider-adapter tests; React Native Testing Library for
shared UI; Playwright for web flows; Maestro for Android end-to-end flows; OpenAPI contract
validation and deterministic fixture/replay tests for aircraft tracks, METAR, provider failures,
and push delivery.

**Target Platform**: Android and modern web browsers with WebGL, service workers, HTTPS, and
supported persistent browser storage. The Android app requires a development/release build for
native MapLibre and remote notifications; Expo Go is not the final validation target.

**Project Type**: Cross-platform mobile/web client plus a small backend API and data/push worker.

**Performance Goals**: Meet SC-001 through SC-006 in the feature specification. In particular,
target 95th-percentile map interaction response under 100 ms with 50 aircraft and display a
provider update within 5 seconds of its availability. These are validation goals, not provider
guarantees.

**Constraints**:
- This is an informational product, not a source of air-traffic control, dispatch, or flight
  safety instructions. Do not state that observed weather caused an aircraft event.
- Fetch upstream data from the server, not from every client. Keep credentials server-side,
  honor provider quotas and attribution/license terms, and show data source and age.
- Rate-limit installation registration. For web sessions, use same-origin secure cookies and
  CSRF protections; store Android installation credentials in platform secure storage. Redact
  push endpoints, credentials, and one-time WebSocket tickets from logs.
- Expo SQLite supports Android and web; web setup requires WASM support and COOP/COEP headers.
  Validate persistence, multi-tab behavior, cross-origin map tiles, and headers on the supported
  browser matrix.
- Expo Notifications documents Android/iOS, not web. Web push requires a service worker, HTTPS,
  user permission, and a separate server delivery path.
- Use a persistent server volume and one backend replica while server SQLite is in use. Plan a
  migration to a server database before requiring multi-instance writes or high availability.
- Do not enable an audio source until product use is authorized and coverage for the selected
  airport is verified. Public API or tile quotas must support the target refresh frequency.

**Scale/Scope**: Initial release targets SBBR as the default airport, allows airport selection,
and validates the map with at least 50 aircraft. The service is a single deployment for an initial
audience; user accounts, cross-device preference synchronization, historical replay, and iOS are
out of scope.

## Constitution Check

**Pre-design gate**:
- **Clear, expressive code**: PASS — use explicit names and small domain operations for event
  classification and data freshness.
- **Single responsibility and low coupling**: PASS — isolate provider, map-renderer, persistence,
  and notification adapters behind narrow interfaces.
- **Test-first**: PASS — write failing domain and contract tests before implementing behavior.
- **Verifiable quality and safe integration**: PASS — use unit, contract, integration, and platform
  end-to-end tests, including stale data and provider failures.
- **Simplicity, security, and controlled evolution**: PASS — begin with one service and one
  persistent SQLite instance; keep provider credentials and push capability URLs off client logs.

**Post-design gate**:
- PASS — the design retains the same boundaries, adds platform-specific map adapters only because
  the native and browser map renderers differ, and uses a remote service only to support background
  collection and push.
- PASS — no raw ADS-B history is required for the initial product, avoiding unnecessary
  collection and storage.
- PASS — audio and all inferred events are explicitly bounded by source authorization and
  non-operational presentation requirements.

## Project Structure

### Documentation (this feature)

```text
specs/001-flight-activity-monitor/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── openapi.yaml
│   └── realtime-protocol.md
└── tasks.md              # Phase 2 output (/speckit-tasks); not created here
```

### Source Code (repository root)

```text
apps/
├── client/
│   ├── app/                         # Expo Router routes
│   ├── src/
│   │   ├── features/                # Airport, map, weather, event, alert flows
│   │   ├── platform/maps/           # Native Android and web renderer adapters
│   │   └── storage/                 # SQLite client repositories and migrations
│   └── tests/
└── api/
    ├── src/
    │   ├── routes/                  # REST and WebSocket boundary
    │   ├── domain/                  # Airport/event/freshness rules
    │   ├── providers/               # ADS-B, weather, and optional audio adapters
    │   ├── notifications/           # Android and web push delivery
    │   └── storage/                 # Server SQLite schema and repositories
    └── tests/
packages/
└── contracts/                       # Shared TypeScript DTOs and validation
tests/
├── e2e-web/                         # Playwright user flows
└── e2e-android/                     # Maestro device flows
```

**Structure Decision**: Use a small TypeScript workspace with one universal client, one backend
service, and a shared contracts package. Reuse user flows and domain logic across web and Android;
keep MapLibre renderer code platform-specific to preserve native Android map performance and use
WebGL in browsers. No separate microservices are planned.
