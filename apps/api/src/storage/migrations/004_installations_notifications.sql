CREATE TABLE device_installations (
  installation_id TEXT PRIMARY KEY,
  account_id TEXT REFERENCES account_identities(account_id) ON DELETE SET NULL,
  platform TEXT NOT NULL CHECK (platform IN ('android', 'web')),
  installation_credential_hash TEXT NOT NULL UNIQUE
    CHECK (
      length(installation_credential_hash) = 64
      AND installation_credential_hash NOT GLOB '*[^0-9a-f]*'
    ),
  claimed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX device_installations_account_id
  ON device_installations (account_id);

CREATE TABLE push_subscriptions (
  installation_id TEXT PRIMARY KEY REFERENCES device_installations(installation_id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('android', 'web')),
  endpoint_or_token_ciphertext TEXT NOT NULL CHECK (length(trim(endpoint_or_token_ciphertext)) > 0),
  consent_at TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  updated_at TEXT NOT NULL
);

CREATE TABLE notification_deliveries (
  event_id TEXT NOT NULL,
  account_id TEXT NOT NULL REFERENCES account_identities(account_id) ON DELETE CASCADE,
  installation_id TEXT NOT NULL REFERENCES device_installations(installation_id) ON DELETE CASCADE,
  sent_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'invalidated')),
  PRIMARY KEY (event_id, account_id, installation_id)
);

CREATE INDEX notification_deliveries_sent_at
  ON notification_deliveries (sent_at);
