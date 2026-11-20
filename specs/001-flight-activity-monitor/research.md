# Research: Flight Activity Monitor

## 1. Shared web and Android client

**Decision**: Use TypeScript with Expo, React Native, and Expo Router for shared navigation,
screen flows, and application/domain types. Implement a small platform-specific map adapter:
MapLibre Native on Android and MapLibre GL JS in the browser.

**Rationale**: Expo Router documents shared routes and components across Android and web. MapLibre
provides a native React Native wrapper for Android and a separate TypeScript/WebGL renderer for
web; retaining a common map-data contract avoids duplicating event and aircraft logic. The map
wrapper requires a native build/rebuild, so Expo Go is not sufficient for release-like testing.
The Expo Maps package is not a suitable universal map choice because its documented platform
support is Android/iOS and it uses Google Maps on Android rather than a web renderer.
Production map tiles/styles must come from a permitted provider; MapLibre's guide labels its demo
tiles for development.

**Alternatives considered**:
- Ionic/Capacitor with one DOM map implementation: shares web UI more directly, but sacrifices
  native map rendering and was not selected for the requested mobile fluency.
- Separate unrelated web and Android clients: allows fully native optimization but duplicates
  navigation and UI behavior unnecessarily.
- Expo Maps: native Android support is documented, but no web platform is listed.

**Sources**:
- Expo Router universal app support: https://docs.expo.dev/router/introduction/
- Expo Maps supported platforms: https://docs.expo.dev/versions/latest/sdk/maps/
- MapLibre React Native requirements and production tiles: https://maplibre.org/maplibre-react-native/docs/setup/getting-started/
- MapLibre GL JS WebGL renderer: https://maplibre.org/maplibre-gl-js/docs/
- Expo development builds: https://docs.expo.dev/develop/development-builds/introduction/

## 2. SQLite on Android, web, and the push service

**Decision**: Use `expo-sqlite` for per-installation local SQLite on Android and web. The web
build must ship the SQLite WASM assets and required cross-origin isolation headers. Use a separate,
persistent server-side SQLite database for only push subscriptions, alert preferences needed for
background delivery, hashed installation credentials, and notification deduplication. Keep the
service single-instance with durable storage and backups. Do not store raw aircraft positions
long-term. If multi-instance writes or high availability become requirements, migrate the
server-side store to a server database; keep client SQLite as the local cache.

**Rationale**: Expo documents `expo-sqlite` for Android and web and persistence across app restarts.
Its web setup requires WASM support and COOP/COEP headers. SQLite's own WASM documentation warns
that browser persistence depends on browser storage support and can be restricted in private
browsing. A remote process is necessary for push while clients are closed, but it does not require
persisting the high-volume aircraft stream.

**Alternatives considered**:
- SQLite only on the client: insufficient for monitoring and delivering push while all clients are
  closed.
- A server-side SQLite file on a shared/network filesystem or several service replicas: rejected
  because it complicates write coordination and reliability.
- A server database such as PostgreSQL from day one: the better choice if multi-instance
  availability or substantial concurrent writes are launch requirements, but those requirements
  were not provided. Retain as the scale-out migration.

**Sources**:
- Expo SQLite platforms, persistence, and web setup: https://docs.expo.dev/versions/latest/sdk/sqlite/
- SQLite WASM persistence and browser restrictions: https://sqlite.org/wasm/doc/trunk/persistence.md

## 3. Background notifications

**Decision**: Keep one backend notification contract, with distinct delivery adapters: Expo/FCM
push for Android and Web Push through a browser service worker for web. Store alert subscriptions
only after user consent. Keep notification endpoints/tokens secret and never log them.

**Rationale**: Expo's current `expo-notifications` reference lists Android and iOS, not web.
MDN documents that web push requires an active service worker and can reach a web application when
it is not loaded. Therefore, a backend worker must evaluate the user-selected events and send both
channels; browser and Android permission/registration flows differ.

**Alternatives considered**:
- Device-only local notifications: cannot monitor upstream flights when the app is closed.
- One Expo Notifications adapter for web and Android: rejected because Expo's documented package
  does not list web support.

**Sources**:
- Expo Notifications supported platforms and push setup: https://docs.expo.dev/versions/latest/sdk/notifications/
- Expo push notification overview: https://docs.expo.dev/push-notifications/overview/
- MDN Push API and service-worker requirements: https://developer.mozilla.org/en-US/docs/Web/API/Push_API

## 4. ADS-B and aviation-weather sources

**Decision**: Put upstream data behind server-side adapters and select a provider only after
verifying SBBR coverage, permitted commercial/product use, attribution, rate limits, and refresh
latency. Do not use a public no-key endpoint as if it were an unlimited real-time feed. The ADSB.lol
API is a candidate for a controlled prototype, not a production commitment: its published API
states 500 requests/day without a key, 7,200/day for feeder access, higher sponsored tiers, and
ODbL licensing. OpenSky is another candidate but requires compliance with its terms and API
limitations. Request suitable plan/permission before building a live polling schedule.

Use the Aviation Weather Center Data API for METAR/TAF evaluation where its worldwide product
coverage includes the selected station. Cache narrow station queries, obey its frequency guidance,
and preserve observation time, forecast validity, and source. Do not treat METAR or TAF as a
decision or a prediction of aircraft behavior. ADS-B coverage and position timestamps are
provider/receiver dependent and are not guaranteed to be complete or current.

**Rationale**: A 5-second refresh would exceed ADSB.lol's published anonymous daily request limit
for one continuously polled endpoint. The backend can centralize polling and apply provider quotas,
but a provider tier and rate budget that satisfy the specified user-visible latency remain a
release prerequisite. The Aviation Weather Center lists METAR and TAF as worldwide products and
requests limited query scope/frequency.

**Alternatives considered**:
- Query upstream providers directly from every client: rejected because it exposes keys, multiplies
  quota use, and makes data freshness inconsistent.
- Treat provider coverage or refresh as guaranteed: rejected; the specification explicitly exposes
  age and availability and makes latency conditional on upstream delivery.

**Sources**:
- ADSB.lol OpenAPI, quota and ODbL statement: https://api.adsb.lol/api/openapi.json
- OpenSky API client and terms reference: https://github.com/openskynetwork/opensky-api
- OpenSky REST API limits and state-vector fields: https://openskynetwork.github.io/opensky-api/rest.html
- Aviation Weather Center Data API, products and rate guidance: https://aviationweather.gov/data/api/
- MapLibre production tile guidance: https://maplibre.org/maplibre-react-native/docs/setup/getting-started/

## 5. Event inference, audio, and safety boundary

**Decision**: Implement event detection as explainable, versioned heuristics over time-ordered
observations. Label results as inferred, attach source timestamps and confidence, suppress alerts
when evidence is stale or insufficient, and provide no operational recommendations. Treat METAR
and TAF only as context and do not infer that a particular aircraft diverted because of weather.
Any weather impact label must be based on documented weather-only criteria, identify its sources,
and must not be presented as a probability or recommendation about a flight's alternate airport.

Keep the audio adapter disabled until a public feed and its terms explicitly authorize the
product's access and playback for the chosen airport. No feed was verified in this research; show
an unavailable state rather than proxying, recording, or redistributing unverified audio.

**Rationale**: Public aircraft reports may be incomplete or delayed, and an observed trajectory
cannot establish pilot intent or the cause of an event. An informational label and explicit source
freshness reduce the risk of mistaken interpretation. No reliable authorization/coverage evidence
for an SBBR audio feed was established.

**Alternatives considered**:
- Present inferred events as confirmed operational facts: rejected because the input data cannot
  establish intent or causal weather decisions.
- Integrate an unverified audio stream: rejected until access, usage, and redistribution terms are
  checked.

**Sources**:
- ADSB.lol API documentation and license information: https://www.adsb.lol/docs
- Aviation Weather Center product definitions: https://aviationweather.gov/data/api/
- Audio source terms/access: not verified; release gate remains explicit.
