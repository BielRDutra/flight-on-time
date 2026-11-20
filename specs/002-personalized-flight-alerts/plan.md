# Implementation Plan: Personalized Flight Alerts

**Branch**: `002-personalized-flight-alerts` | **Date**: 2026-11-18 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/002-personalized-flight-alerts/spec.md`

## Summary

Extend the Flight Activity Monitor with account-owned filters for airlines, airports, and event
categories; restore those preferences across web and Android sessions; and use them to evaluate
consented push notifications. Reuse the TypeScript, Expo, SQLite, MapLibre, and single-service
architecture selected for feature 001. Use Google Sign-In with Google Identity Services on web and
Android Credential Manager on Android; the backend verifies the Google ID token and issues its
own application session. The server is the canonical preference store; client SQLite is an
account-partitioned cache. Versioned writes prevent one session from silently overwriting another.
Airline identity is accepted only from verified provider metadata or licensed mapping; otherwise
it remains unknown. Live flight data uses deterministic fixtures until a provider's applicable
commercial, storage, attribution, and redistribution rights are approved.

## Technical Context

**Language/Version**: TypeScript strict mode; Node.js current LTS; pin mutually compatible stable
Expo and package versions when the implementation workspace is bootstrapped.

**Primary Dependencies**: Expo, React Native, Expo Router, Google Identity Services for web,
Android Credential Manager through an Expo-compatible native integration, `google-auth-library`
for backend ID-token verification, Android `expo-secure-store`, `expo-sqlite`, MapLibre Native for
Android and MapLibre GL JS for web. Reuse the feature 001 TypeScript API/worker and SQLite
repository boundary. Keep Google-specific verification behind the authentication adapter.

**Storage**: Server SQLite is the canonical store for account identity references, preferences,
web BFF sessions, installation ownership, push subscriptions, and bounded notification
deduplication. Use a durable local volume and one API instance. Client SQLite stores a recoverable
cache partitioned by account; clear the active account's cache on sign-out. Do not store passwords
or Google ID tokens, Google refresh tokens, or raw aircraft history. Store only hashes of opaque
application sessions; retain the raw native session token only in OS-backed secure storage and
the web session only in a Secure, HttpOnly, SameSite cookie.

**Testing**: Vitest for filter, preference, Google token verification, session, and event-matching
logic; API contract tests for OpenAPI; integration tests against temporary SQLite databases for
migrations, transactions, foreign-key isolation, backup/restore, one-time auth challenges, and
stale-revision conflicts; React Native Testing Library for the shared UI; Playwright for web
authentication and preference flows; and Maestro for Android sign-in, filtering, sign-out, and
notification flows. Use deterministic signed-token fixtures and event fixtures for repeatable
tests; do not make automated tests depend on live Google or aviation services.

**Target Platform**: Android and modern web browsers. The browser requires HTTPS, supported
service workers, WebAssembly SQLite support, and the cross-origin isolation headers documented in
feature 001. Android uses a native development/release build; Expo Go is not a release-like test
target.

**Project Type**: Cross-platform mobile/web client plus one TypeScript backend API and data/push
worker, with shared TypeScript contracts.

**Performance Goals**: Meet SC-001 through SC-006 in the feature specification. In particular,
95% of filter interactions show results within one second when their data is loaded. Filtered
requests must not cause per-client polling of upstream aviation providers.

**Constraints**:

- Google is the selected identity provider. Register web and Android OAuth clients; configure
  Android Credential Manager with the web/server client ID and verify the Google ID token's
  signature, issuer, explicitly allowed audience, expiration, and one-time nonce on the backend.
  Do not accept client-supplied account IDs or use email as the identity key; map the canonical
  Google issuer and `sub` to the internal account.
- The web client uses Google Identity Services with CSRF/Origin protection and receives only a
  same-origin BFF session cookie. Android uses Credential Manager and receives an opaque
  application session token stored in Android secure storage. Do not use the Google ID token as
  an API session, request unrelated Google scopes, or store Google tokens after session exchange.
- Require verified Google Cloud OAuth client configuration and complete applicable Google brand
  verification before public release; client IDs and origins remain environment configuration.
- Apply preference updates atomically and condition them on a server revision. Return a conflict
  instead of overwriting newer changes; the client must identify unsaved or conflicting changes.
- Keep account preference filters distinct from device-specific notification permission and push
  subscription. Delivery requires explicit opt-in, at least one selected airport and category,
  and permission for that device.
- SQLite WAL is a single-host design and permits only one writer at a time. Do not place the
  database on a network filesystem or run multiple API replicas against it. Back up using a
  SQLite-consistent online method and exercise restore before release.
- Move server persistence and BFF sessions to a server database before requiring multi-instance
  writes or high availability. Keep the repository/API contracts independent of the database.
- Airline attribution must come from verified provider metadata or an authorized reference
  source. Do not infer an airline from a callsign alone. An unmatched operator is unknown.
- Honor source coverage, quotas, attribution, retention, redistribution, and license terms.
  Public API availability is not airline authorization. Use fixtures until source approval is
  recorded. Do not combine FR24 data with another near-time/real-time provider; do not use
  OpenSky's public API for commercial production without a written commercial agreement; assess
  ADSB.lol's ODbL obligations before using its public data. AeroEscuta is an audio-streaming site
  and is not a structured flight-data source or an airline-authorized feed. Continue to show
  events as inferred and weather as context; do not assert weather causality or provide
  operational guidance.
- On explicit sign-out, unlink the current installation and disable its account push subscription;
  retain the account's preferences for the next sign-in.

**Scale/Scope**: Initial audience and request volume are not yet quantified. Use a single backend
instance and durable SQLite for the MVP; define operational metrics and a documented PostgreSQL
scale-out trigger before launch. This feature adds account preference persistence and
personalization; it does not add historical flight tracking or operational decision support.
Live source integration remains gated on a documented license and rights review.

## Constitution Check

**Pre-design gate**:

- **Clear, expressive code**: PASS — use explicit domain terms for account preferences, filter
  facets, event categories, and source-backed airline identity.
- **Single responsibility and low coupling**: PASS — keep Google auth, SQLite, map, upstream provider,
  and push integrations behind narrow adapters; share only domain contracts and rules.
- **Test-first**: PASS — add failing tests for filter combination, owner isolation, revision
  conflicts, logout cleanup, and alert matching before implementation.
- **Verifiable quality and safe integration**: PASS — validate contracts, persistence,
  authentication boundaries, and browser/Android flows with deterministic fixtures.
- **Simplicity, security, and controlled evolution**: PASS — reuse one backend, use Google OIDC,
  avoid raw passwords and long-term flight history, and retain a single-instance SQLite MVP with
  an explicit scale-out trigger.

**Post-design gate**:

- PASS — the design adds no separate microservices; user preferences and account sessions are
  isolated behind the existing API and persistence boundaries.
- PASS — account ownership is derived from validated identity, preference replacement is
  transactional and versioned, and device push authorization remains separate from account
  preference.
- PASS — browser and Android use distinct session handling only where their security models
  differ; the user-facing contracts and preference semantics remain shared.
- PASS — unknown airline identity, stale sources, and inferred event classifications remain
  explicit; weather context is not treated as evidence of cause.
- PASS — tests cover the added cross-session, cross-device, and persistence behavior; no
  constitution violation or unjustified complexity is introduced.

## Project Structure

### Documentation (this feature)

```text
specs/002-personalized-flight-alerts/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── personalization-api.yaml
└── tasks.md              # Phase 2 output (/speckit-tasks); not created here
```

### Source Code (repository root)

The repository does not yet contain application source or package manifests. The following is the
planned layout for the combined feature 001 and feature 002 implementation:

```text
apps/
├── client/
│   ├── app/                              # Expo Router routes
│   ├── src/
│   │   ├── features/
│   │   │   ├── activity-filters/         # Airline, airport, and category facets
│   │   │   ├── account/                  # Sign-in, sign-out, and session state
│   │   │   └── preferences/              # Save/restore, sync, and conflict states
│   │   ├── platform/auth/                # Android Credential Manager and web GIS adapters
│   │   ├── platform/maps/                # Native and browser map adapters
│   │   └── storage/                      # Account-partitioned client SQLite cache
│   └── tests/
└── api/
    ├── src/
    │   ├── auth/                         # Google token verification and app sessions
    │   ├── activity/                     # Filtered event queries and source adapters
    │   ├── preferences/                  # Account-owned preference operations
    │   ├── notifications/                # Device association, matching, and delivery
    │   └── storage/                      # SQLite migrations and repositories
    └── tests/
packages/
└── contracts/                            # Shared DTOs and runtime validation
tests/
├── e2e-web/                              # Playwright account and filter flows
└── e2e-android/                          # Maestro account and notification flows
```

**Structure Decision**: Keep one shared Expo client, one backend service, and one shared
contracts package as selected in feature 001. Place each feature's UI and domain behavior in
separate modules. Keep platform-specific authentication/session adapters, map renderers, and push
registration at the platform boundary. Do not introduce a separate authentication service or
microservice for this initial scope.

## Complexity Tracking

No constitution violations or additional architectural components require justification.
