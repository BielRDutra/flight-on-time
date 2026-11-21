CREATE TABLE airports (
  icao_code TEXT PRIMARY KEY
    CHECK (length(icao_code) = 4 AND icao_code GLOB '[A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9]'),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  latitude REAL NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude REAL NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  timezone TEXT
);

CREATE TABLE airline_references (
  airline_id TEXT PRIMARY KEY CHECK (length(trim(airline_id)) > 0),
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) > 0),
  source_id TEXT NOT NULL CHECK (length(trim(source_id)) > 0),
  source_updated_at TEXT
);

CREATE TABLE inferred_flight_events (
  event_id TEXT PRIMARY KEY,
  airport_icao TEXT NOT NULL REFERENCES airports(icao_code),
  category TEXT NOT NULL
    CHECK (category IN ('go_around', 'holding_or_orbit', 'diversion_candidate')),
  classification_status TEXT NOT NULL DEFAULT 'inferred'
    CHECK (classification_status IN ('inferred', 'directly_reported')),
  airline_id TEXT REFERENCES airline_references(airline_id),
  airline_source_id TEXT,
  airline_observed_at TEXT,
  aircraft_icao24 TEXT,
  first_observed_at TEXT NOT NULL,
  last_observed_at TEXT NOT NULL CHECK (last_observed_at >= first_observed_at),
  confidence REAL NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  source_ids_json TEXT NOT NULL,
  algorithm_version TEXT NOT NULL CHECK (length(trim(algorithm_version)) > 0),
  status TEXT NOT NULL CHECK (status IN ('current', 'stale', 'expired')),
  CHECK (airline_id IS NULL OR (airline_source_id IS NOT NULL AND length(trim(airline_source_id)) > 0))
);

CREATE INDEX inferred_flight_events_airport_category_time
  ON inferred_flight_events (airport_icao, category, last_observed_at DESC);

CREATE INDEX inferred_flight_events_airline_time
  ON inferred_flight_events (airline_id, last_observed_at DESC);
