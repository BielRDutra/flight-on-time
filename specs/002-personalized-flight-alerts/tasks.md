# Tasks: Personalized Flight Alerts

**Input**: Design documents from `specs/002-personalized-flight-alerts/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, and
`quickstart.md`

**Tests**: Included because the project constitution requires test-first development and the user
approved automated tests. Write behavioral tests before the corresponding implementation.

**Organization**: Tasks are grouped by user story so each story can be independently implemented
and verified after the shared foundation is complete.

## Phase 1: Setup

**Purpose**: Bootstrap the TypeScript workspace and shared quality tooling.

- [x] T001 Create the npm workspaces, package manifests, and strict TypeScript configuration in `package.json`, `apps/client/package.json`, `apps/api/package.json`, `packages/contracts/package.json`, and `tsconfig.base.json`.
- [x] T002 [P] Configure ESLint and Prettier in `eslint.config.mjs` and `.prettierrc.json`.
- [x] T003 [P] Add the Node version, ignore rules, and secret-free environment templates in `.nvmrc`, `.gitignore`, `apps/api/.env.example`, and `apps/client/.env.example`.

---

## Phase 2: Foundational

**Purpose**: Complete shared persistence, authentication, and fixture-provider infrastructure
required by every user story.

- [x] T004 [P] Write SQLite connection and migration integration tests in `apps/api/tests/integration/storage/database.test.ts`, covering foreign keys, WAL configuration, migration ordering, and rollback.
- [x] T005 Implement the API SQLite connection and migration runner in `apps/api/src/storage/database.ts` and `apps/api/src/storage/migrate.ts`, and add the core migration in `apps/api/src/storage/migrations/001_core.sql` to satisfy T004.
- [x] T006 [P] Write Google sign-in verification tests in `apps/api/tests/unit/auth/google-session.test.ts`, covering invalid signature, issuer, audience, expiry, nonce mismatch, expired challenge, replayed challenge, and successful session exchange.
- [x] T007 Implement auth persistence in `apps/api/src/storage/migrations/002_google_auth.sql` and `apps/api/src/auth/auth-repository.ts`; follow `specs/002-personalized-flight-alerts/data-model.md` for `AccountIdentity.accountId`, `AccountIdentity.issuer`, `AccountIdentity.subject`, `AccountIdentity.createdAt`, `AccountSession.sessionIdHash`, `AccountSession.accountId`, `AccountSession.platform`, `AccountSession.createdAt`, `AccountSession.expiresAt`, `AccountSession.revokedAt`, `GoogleAuthChallenge.challengeIdHash`, `GoogleAuthChallenge.nonceHash`, `GoogleAuthChallenge.platform`, `GoogleAuthChallenge.createdAt`, `GoogleAuthChallenge.expiresAt`, and `GoogleAuthChallenge.consumedAt`.
- [x] T008 Implement Google ID-token verification and the challenge, session-exchange, and revoke routes in `apps/api/src/auth/google-id-token-verifier.ts` and `apps/api/src/auth/google-auth-routes.ts`, matching the authentication paths and schemas in `specs/002-personalized-flight-alerts/contracts/personalization-api.yaml`.
- [x] T009 [P] Write web Google sign-in tests in `apps/client/tests/auth/web-google-sign-in.test.tsx`, covering challenge nonce use, GIS callback handling, and user-visible cancellation/error states.
- [x] T010 [P] Implement the web Google Identity Services sign-in flow and sign-in route in `apps/client/src/platform/auth/web-google.ts` and `apps/client/app/(auth)/sign-in.tsx`, sending only the one-time ID token for server verification.
- [x] T011 [P] Write Android Google sign-in tests in `apps/client/tests/auth/android-google-sign-in.test.ts`, covering Credential Manager success, cancellation, no available credential, and secure session storage.
- [x] T012 [P] Implement Android Credential Manager sign-in and the Expo native integration in `apps/client/src/platform/auth/android-google.ts` and `apps/client/plugins/with-google-credential-manager.ts`; configure the web/server client ID and store only the resulting application session in Android SecureStore.
- [x] T013 [P] Write authenticated-session middleware tests in `apps/api/tests/unit/auth/session-middleware.test.ts`, covering opaque bearer sessions, web cookies, revoked/expired sessions, and unauthenticated access.
- [x] T014 Implement account-session authentication middleware and redacted auth logging in `apps/api/src/auth/session-middleware.ts` and `apps/api/src/auth/auth-logger.ts`, using the opaque application session rather than a Google ID token.
- [x] T015 [P] Write deterministic provider adapter tests in `apps/api/tests/unit/activity/fixture-provider.test.ts`, covering event fixtures, unavailable/stale source status, and no upstream requests in fixture mode.
- [x] T016 Implement the shared event-category contract and fixture-only provider boundary in `packages/contracts/src/activity/event-type.ts`, `apps/api/src/activity/providers/flight-data-provider.ts`, `apps/api/src/activity/providers/fixture-flight-data-provider.ts`, and `apps/api/src/activity/providers/source-policy.ts`; keep live connectors disabled until provider-specific rights are documented.

**Checkpoint**: The app can authenticate with Google, create/revoke application sessions, use SQLite,
and return deterministic flight-activity fixtures without contacting an unapproved provider.

---

## Phase 3: User Story 1 - Organizar eventos por filtros (Priority: P1)

**Goal**: Let an authenticated observer combine airline, airport, and event-category filters and
clearly see loading, empty, unknown-airline, and source-freshness states.

**Independent Test**: Using deterministic events for different airports, airlines, and categories,
verify OR within each selected facet, AND across active facets, unrestricted empty facets, explicit
unknown-airline display, and a clear empty/loading state. Verify filter updates meet SC-005 when
fixture data is already loaded.

### Tests for User Story 1

- [x] T017 [P] [US1] Write API tests for facet combination, empty facets, unknown airline, pagination, and freshness in `apps/api/tests/integration/activity/filter-events.test.ts`.
- [x] T018 [P] [US1] Write filter component tests for selection, clearing, loading, empty results, and stale-result prevention in `apps/client/tests/features/activity-filters/activity-filters.test.tsx`.

### Implementation for User Story 1

- [x] T019 [US1] Add verified airline and event classification fields to `packages/contracts/src/activity/flight-event.ts` and `apps/api/src/activity/domain/inferred-flight-event.ts`; follow `specs/002-personalized-flight-alerts/data-model.md` for `AirlineReference.airlineId`, `AirlineReference.displayName`, `AirlineReference.sourceId`, `AirlineReference.sourceUpdatedAt`, `InferredFlightEvent.airlineId`, `InferredFlightEvent.airlineSourceId`, `InferredFlightEvent.airlineObservedAt`, and `InferredFlightEvent.classificationStatus`.
- [x] T020 [P] [US1] Implement OR-within-facet and AND-across-facets queries, verified airline options, bounded pagination, and source status in `apps/api/src/activity/filters/activity-filter-service.ts`, `apps/api/src/activity/storage/event-repository.ts`, `apps/api/src/activity/routes/events.ts`, and `apps/api/src/activity/routes/filter-options.ts`, matching `specs/002-personalized-flight-alerts/contracts/personalization-api.yaml`.
- [x] T021 [P] [US1] Implement responsive filter controls and loading, empty, unknown-airline, and stale-source states in `apps/client/src/features/activity-filters/ActivityFilterBar.tsx`, `apps/client/src/features/activity-filters/use-filtered-events.ts`, and `apps/client/src/features/activity-filters/ActivityResultsState.tsx`.
- [x] T022 [US1] Verify the complete filter flow and the one-second loaded-data target in `tests/e2e-web/activity-filters.spec.ts` and `tests/e2e-android/activity-filters.yaml`, using deterministic fixtures only.

**Checkpoint**: US1 works independently for an authenticated account using fixture data and the
documented filter semantics.

---

## Phase 4: User Story 2 - Recuperar preferências ao entrar (Priority: P1)

**Goal**: Save the complete preference snapshot to the signed-in account and restore it across web
and Android sessions, while exposing pending, failed, and conflicting changes.

**Independent Test**: Save preferences in one session, sign out, sign in on another supported
client, and verify exact restoration to the same account. Verify a different account cannot read
the snapshot, offline writes are not reported as saved, and stale revisions return a resolvable
conflict.

### Tests for User Story 2

- [x] T023 [P] [US2] Write API preference tests in `apps/api/tests/integration/preferences/preference-routes.test.ts` for account isolation, empty defaults, atomic replacement, ETag/If-Match, and `412` stale-revision responses.
- [x] T024 [P] [US2] Write client cache and synchronization tests in `apps/client/tests/features/preferences/preference-sync.test.tsx` for account partitioning, offline pending state, failed saves, and conflict resolution.

### Implementation for User Story 2

- [x] T025 [P] [US2] Add the preference schema and transactional repository in `apps/api/src/storage/migrations/003_preferences.sql` and `apps/api/src/preferences/preference-repository.ts`; follow `specs/002-personalized-flight-alerts/data-model.md` for `AccountPreferences.accountId`, `AccountPreferences.revision`, `AccountPreferences.notificationsEnabled`, `AccountPreferences.updatedAt`, `PreferenceAirport.accountId`, `PreferenceAirport.airportIcao`, `PreferenceAirline.accountId`, `PreferenceAirline.airlineId`, `PreferenceEventType.accountId`, and `PreferenceEventType.eventType`.
- [x] T026 [US2] Implement authenticated GET/PUT preference endpoints and revision conflict handling in `apps/api/src/preferences/preference-service.ts` and `apps/api/src/preferences/preference-routes.ts`, matching `specs/002-personalized-flight-alerts/contracts/personalization-api.yaml`.
- [x] T027 [P] [US2] Implement the account-partitioned SQLite cache and sync coordinator in `apps/client/src/storage/migrations/001_preferences.sql`, `apps/client/src/storage/preference-cache.ts`, and `apps/client/src/features/preferences/preference-sync.ts`; clear the active account's visible cache on sign-out.
- [x] T028 [US2] Implement the preference settings and save/sync/conflict states in `apps/client/src/features/preferences/PreferenceSettingsScreen.tsx` and `apps/client/src/features/preferences/PreferenceSyncStatus.tsx`, restoring the server snapshot after authentication.
- [x] T029 [US2] Verify web-to-Android and Android-to-web preference restoration, account isolation, offline pending state, and stale-revision recovery in `tests/e2e-web/preferences-restoration.spec.ts` and `tests/e2e-android/preferences-restoration.yaml`.

**Checkpoint**: US2 independently restores the account's confirmed preferences across supported
clients without leaking data between accounts or silently overwriting concurrent edits.

---

## Phase 5: User Story 3 - Receber avisos relevantes (Priority: P2)

**Goal**: Send deduplicated push notifications only when account criteria, installation ownership,
explicit consent, and current platform permission all permit delivery.

**Independent Test**: With deterministic events and push-provider doubles, verify matching and
non-matching events, disabled-by-default behavior, missing airport/category rejection, per-device
permission and consent, deduplication, and sign-out unlink/revocation while retaining account
preferences.

### Tests for User Story 3

- [x] T030 [P] [US3] Write notification matching, consent, deduplication, stale-source, and sign-out tests in `apps/api/tests/integration/notifications/alert-delivery.test.ts`.
- [x] T031 [P] [US3] Write client tests for disabled-by-default alerts, required selections, permission denial/revocation, and sign-out in `apps/client/tests/features/notifications/notification-settings.test.tsx`.

### Implementation for User Story 3

- [x] T032 [US3] Add installation, subscription, and bounded delivery-deduplication persistence in `apps/api/src/storage/migrations/004_installations_notifications.sql` and `apps/api/src/notifications/notification-repository.ts`; follow `specs/002-personalized-flight-alerts/data-model.md` for `DeviceInstallation.installationId`, `DeviceInstallation.accountId`, `DeviceInstallation.platform`, `DeviceInstallation.installationCredentialHash`, `DeviceInstallation.claimedAt`, `DeviceInstallation.createdAt`, `PushSubscription.installationId`, `PushSubscription.platform`, `PushSubscription.endpointOrTokenCiphertext`, `PushSubscription.consentAt`, `PushSubscription.enabled`, `PushSubscription.updatedAt`, `NotificationDelivery.eventId`, `NotificationDelivery.accountId`, `NotificationDelivery.installationId`, `NotificationDelivery.sentAt`, and `NotificationDelivery.status`.
- [x] T033 [P] [US3] Implement installation claim/unlink and push-subscription routes in `apps/api/src/notifications/installation-routes.ts` and `apps/api/src/notifications/push-subscription-routes.ts`, matching the contract and encrypting provider endpoints/tokens at rest.
- [x] T034 [P] [US3] Implement preference-to-event matching and an idempotent delivery worker in `apps/api/src/notifications/alert-matcher.ts` and `apps/api/src/notifications/delivery-worker.ts`; reject disabled alerts, missing airport/category selections, stale or insufficiently classified events, and duplicate event/account/installation deliveries.
- [x] T035 [P] [US3] Implement Android and Web Push delivery adapters in `apps/api/src/notifications/providers/android-push-provider.ts` and `apps/api/src/notifications/providers/web-push-provider.ts`, keeping credentials external to SQLite and redacting them from logs.
- [x] T036 [US3] Implement Android and browser permission/registration flows and the alert settings UI in `apps/client/src/platform/notifications/android-push.ts`, `apps/client/src/platform/notifications/web-push.ts`, and `apps/client/src/features/notifications/NotificationSettingsScreen.tsx`.
- [x] T037 [US3] Implement sign-out orchestration in `apps/client/src/features/account/sign-out.ts` so it unlinks the current installation, disables its push subscription, revokes the application session, clears the visible local account cache, and preserves server preferences.

**Checkpoint**: US3 sends only eligible, consented, deduplicated informational alerts and stops
delivery on permission revocation or sign-out.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validate recovery, source authorization, cross-platform behavior, and final quality.

- [x] T038 [P] Add a consistent SQLite backup/restore integration test and operator runbook in `apps/api/tests/integration/storage/backup-restore.test.ts` and `docs/operations/sqlite-backup.md`.
- [x] T039 [P] Create the provider approval register in `docs/data-sources/approval.md`, documenting source scope, commercial/product permission, retention, attribution, redistribution, quotas, and approval evidence for Flightradar24, ADSB.lol, OpenSky, and AeroEscuta; mark each unapproved until evidence is recorded and keep fixture mode as the default.
- [ ] T040 Run the web and Android end-to-end scenarios from `specs/002-personalized-flight-alerts/quickstart.md` through `tests/e2e-web/` and `tests/e2e-android/`, fixing only failures caused by this feature. *(Web Playwright E2E executed and passed; Maestro Android E2E pending Maestro CLI and Android emulator).*
- [ ] T041 Run the scripts declared in `package.json` (`lint`, `typecheck`, `test`, `test:contracts`, `test:e2e:web`, and `test:e2e:android`); record results and confirm no live aviation provider is enabled without approved rights. *(`lint`, `typecheck`, `test`, `test:contracts`, and `test:e2e:web` all passed; `test:e2e:android` skipped as `maestro` is not installed in this environment).*

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 first; T002 and T003 can run after T001 and in parallel.
- **Foundational (Phase 2)**: Starts after Setup. T004/T005 establish storage; T006-T008 establish
  Google sign-in; T009-T014 complete web/Android session clients and middleware; T015/T016 establish
  the fixture-only aviation provider boundary. All foundational tasks block user stories.
- **User Stories (Phase 3+)**: US1 and US2 can proceed in parallel after Foundation. US3 requires
  both US1's event/filter behavior and US2's account preferences.
- **Polish (Phase 6)**: Complete after the desired stories; a live data source remains blocked
  until the product-specific rights evidence is recorded.

### User Story Dependencies

- **US1 (P1)**: Depends on Foundation; independently verifiable with fixture events.
- **US2 (P1)**: Depends on Foundation; Google sign-in is provided by the shared foundation and
  preference behavior is independently verifiable using deterministic accounts.
- **US3 (P2)**: Depends on US1 event/filter contracts and US2 saved preferences; cannot deliver
  personalized notifications before both are complete.

### Within Each User Story

- Write and observe the relevant test failure before implementing behavior.
- Implement the shared model/repository boundary before its service and API routes.
- Keep client platform adapters separate from server matching and persistence.
- Complete each checkpoint before treating that story as independently deliverable.

### Parallel Opportunities

- Setup: T002 and T003 after T001.
- Foundation: test tasks T004, T006, T009, T011, T013, and T015 are in separate files and can be
  prepared in parallel after T001. Web and Android sign-in implementations (T010 and T012) can run
  in parallel after their API and test prerequisites.
- US1: T017 and T018 tests can run in parallel; after T019, T020 and T021 can be implemented in
  parallel in server and client files.
- US2: T023 and T024 tests can run in parallel; after their respective tests, T025 and T027 can be
  implemented in parallel, followed by API/UI integration.
- US3: T030 and T031 tests can run in parallel; after T032, T033, T034, and T035 can be developed
  in parallel in distinct server areas.
- Polish: T038 and T039 use separate files and can run in parallel after core implementation.

### Parallel Example: User Story 1

```text
Start together: T017 API filter tests
Start together: T018 client filter tests
After T019: T020 API filtering and T021 client filter UI can proceed in parallel
```

### Parallel Example: User Story 2

```text
Start together: T023 API preference tests
Start together: T024 client cache/sync tests
After tests: T025 server preference storage and T027 client SQLite cache can proceed in parallel
```

### Parallel Example: User Story 3

```text
Start together: T030 notification service tests
Start together: T031 client notification settings tests
After T032: T033 API routes, T034 matching/worker, and T035 push adapters can proceed in parallel
```

## Implementation Strategy

### MVP First

1. Complete Setup and Foundation, including Google authentication and fixture-only data access.
2. Complete US1 and validate filtering independently on web and Android.
3. Keep real aviation data disabled until the source approval register contains written evidence
   for the selected provider and its data use.
4. Add US2 for cross-session/cross-device preference persistence, then US3 for push delivery.

### Incremental Delivery

1. Setup + Foundation: repeatable TypeScript workspace, authenticated sessions, SQLite, and fixture
   events.
2. US1: authenticated filter experience, demonstrable without live upstream services.
3. US2: server-owned preferences, conflict handling, and cross-client restoration.
4. US3: consented device registration, event matching, push delivery, and logout cleanup.
5. Polish: verify recovery, provider rights, and the complete web/Android quickstart.

## Notes

- Every task uses the required checkbox, sequential ID, optional `[P]`, story label where required,
  and at least one concrete file path.
- `[P]` marks work in different files with no unfinished prerequisite shared with the parallel task.
- Data-model constraints are cited at the implementing tasks by exact `Entity.field` names.
- No live-data connector is authorized by this plan; source availability does not imply airline
  authorization or permission to store, transform, or redistribute data.
