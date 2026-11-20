# Quickstart: Personalized Flight Alerts

This guide describes planned validation. The repository currently has no application source,
package manifests, or configured identity provider; commands become runnable after the tasks phase
bootstraps the workspace.

## Prerequisites

- Node.js current LTS and npm, plus the workspace dependencies introduced by implementation.
- Android Studio with an emulator or physical Android device.
- A modern browser with WebAssembly, Web Push/service workers, and persistent storage support.
- A Google Cloud project configured with separate web and Android OAuth client IDs, authorized
  web origins, and a verified app name/brand before public release. Keep client IDs in environment
  configuration; never commit credentials or tokens.
- A persistent local volume for the single-instance server SQLite database and a separate,
  protected key for encrypting server-side session or push-subscription material.
- Deterministic Google ID-token verification fixtures and aircraft/event fixtures. Live aviation
  data and live push services are not required for unit or integration tests.

## Start the workspace

After implementation creates package scripts, install dependencies from the repository root:

```powershell
npm install
```

Run database migrations and start the API/BFF:

```powershell
npm --workspace apps/api run db:migrate
npm --workspace apps/api run dev
```

Start the web client:

```powershell
npx expo start --web
```

Build and run the Android development client (native authentication redirects and notification
modules require a development build):

```powershell
npx expo run:android
```

## Validation scenarios

1. **Account ownership**: Sign in as two fixture identities. Verify each identity sees only its
   own preference snapshot and that a client-supplied account identifier cannot change the
   authenticated owner.
2. **Filter semantics**: Load fixture events for several airports, airlines, and categories.
   Verify OR within a facet, AND across facets, empty-facet behavior, unknown airline display,
   paging, and source-freshness states.
3. **Save and restore**: Save preferences in web, start a new session and verify restoration.
   Repeat between Android and web using the same account. Verify a different account on the same
   installation never sees the previous account's client cache.
4. **Concurrent edits and offline state**: Read one revision in two sessions, save a change in
   the first, then submit the stale revision from the second. Verify `412`, visible conflict
   handling, and no silent overwrite. Simulate an offline save and verify it is not shown as
   persisted until confirmed.
5. **Account and push lifecycle**: Enable notifications only after selecting at least one airport
   and event category and granting device permission. Verify matching event delivery, non-matching
   suppression, event deduplication, revoked-permission handling, and that sign-out disables and
   unlinks only the current installation while preserving account preferences.
6. **Authentication security**: Verify Google ID tokens against the configured client ID and
   reject invalid signature, issuer, audience, expiration, nonce, and reused sign-in challenge.
   Verify web GIS CSRF/Origin checks, browser cookie flags, opaque Android session storage, and
   session revocation on sign-out.
7. **Airline provenance and safety boundary**: Replay events with verified airline metadata,
   missing metadata, and stale metadata. Verify that only supported metadata is filterable and
   that weather appears as context, not as the asserted cause of a maneuver.
8. **Database recovery**: Create an online-consistent SQLite backup, restore it into a clean test
   instance, and verify preference revisions, account isolation, and installation ownership.
   Ensure no raw tokens or aircraft history are present in logs or retained tables.

## Planned test commands

The tasks phase should implement and document the scripts; names are proposed, not runnable yet:

```powershell
npm test
npm run test:contracts
npm run test:e2e:web
npm run test:e2e:android
```

Use mocks and deterministic fixtures by default. A separate opt-in smoke test may verify the
selected identity provider or permitted live-data connectivity without making external service
availability a unit-test requirement.
