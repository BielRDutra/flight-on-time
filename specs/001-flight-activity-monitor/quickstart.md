# Quickstart: Flight Activity Monitor

This guide describes the planned development and validation flow. The repository currently has no
application package manifests or implementations; the commands become runnable after the tasks
phase bootstraps the workspace.

## Prerequisites

- Node.js current LTS and npm.
- Android Studio with an Android emulator or a physical Android device.
- A modern browser with WebGL, service workers, and persistent storage support.
- Development ADS-B and METAR provider credentials/quotas configured only in the backend
  environment. Do not put keys in client environment variables.
- Push credentials for Android and Web Push test keys, with permission enabled on test devices.
- A deterministic fixture provider for aircraft trajectories, METAR/TAF reports, outages, and push
  responses. Use fixtures by default; live aviation feeds are not required for local tests.

## Run the client and API

From the repository root, install the workspace dependencies after implementation:

```powershell
npm install
```

Start the API and data worker in one terminal:

```powershell
npm --workspace apps/api run dev
```

Start the universal client for web:

```powershell
npx expo start --web
```

Start/install the Android development build (native map and push modules require a development
build, not Expo Go):

```powershell
npx expo run:android
```

Configure local provider fixtures through the API test configuration. For any live provider
verification, use only a permitted key/tier and a low-frequency, airport-scoped query.

## Validation scenarios

1. **Airport and map**: Select SBBR; verify source, observation time, aircraft updates, and that
   stale/unavailable states are explicit. Pan and zoom with at least 50 fixture aircraft.
2. **Inference and alerts**: Replay fixture trajectories for a go-around, holding pattern,
   diversion candidate, insufficient evidence, and data gaps. Verify confidence labels and that
   disabled categories do not notify.
3. **Weather**: Replay fresh, stale, and missing METAR/TAF reports. Verify source, observation time,
   forecast validity, and that the UI never states that weather caused a specific aircraft action.
4. **Push**: Register an Android token and a web subscription after consent. Close both clients;
   trigger a fixture event and verify delivery, deduplication, permission revocation, and safe
   handling of invalid tokens.
5. **Audio**: Test available, unverified, interrupted, and unavailable states. Until legal access
   for a feed is confirmed, tests must not use a real stream.
6. **Cross-platform behavior**: Complete airport selection, map inspection, weather view, and
   notification settings in a browser and Android build; verify local preferences survive restarts.

## Planned test commands

The tasks phase should add and document these package scripts:

```powershell
npm test
npm run test:e2e:web
npm run test:e2e:android
```

The end-to-end commands must use deterministic providers, and a separate opt-in smoke check may
verify permitted live-provider connectivity without making live-data availability a unit-test
requirement.
