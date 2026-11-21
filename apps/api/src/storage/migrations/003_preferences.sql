CREATE TABLE account_preferences (
  account_id TEXT PRIMARY KEY REFERENCES account_identities(account_id) ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  notifications_enabled INTEGER NOT NULL DEFAULT 0 CHECK (notifications_enabled IN (0, 1)),
  updated_at TEXT NOT NULL
);

CREATE TABLE preference_airports (
  account_id TEXT NOT NULL REFERENCES account_identities(account_id) ON DELETE CASCADE,
  airport_icao TEXT NOT NULL
    CHECK (length(airport_icao) = 4 AND airport_icao GLOB '[A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9]'),
  PRIMARY KEY (account_id, airport_icao)
);

CREATE TABLE preference_airlines (
  account_id TEXT NOT NULL REFERENCES account_identities(account_id) ON DELETE CASCADE,
  airline_id TEXT NOT NULL REFERENCES airline_references(airline_id) ON DELETE CASCADE,
  PRIMARY KEY (account_id, airline_id)
);

CREATE TABLE preference_event_types (
  account_id TEXT NOT NULL REFERENCES account_identities(account_id) ON DELETE CASCADE,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('go_around', 'holding_or_orbit', 'diversion_candidate')),
  PRIMARY KEY (account_id, event_type)
);
