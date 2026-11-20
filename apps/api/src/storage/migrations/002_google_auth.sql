CREATE TABLE account_identities (
  account_id TEXT PRIMARY KEY,
  issuer TEXT NOT NULL CHECK (issuer = 'https://accounts.google.com'),
  subject TEXT NOT NULL
    CHECK (length(subject) BETWEEN 1 AND 255 AND subject NOT GLOB '*[^!-~]*'),
  created_at TEXT NOT NULL,
  UNIQUE (issuer, subject)
);

CREATE TABLE account_sessions (
  session_id_hash TEXT PRIMARY KEY
    CHECK (length(session_id_hash) = 64 AND session_id_hash NOT GLOB '*[^0-9a-f]*'),
  account_id TEXT NOT NULL REFERENCES account_identities(account_id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('web', 'android')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL CHECK (expires_at > created_at),
  revoked_at TEXT
);

CREATE INDEX account_sessions_account_expiry
  ON account_sessions (account_id, expires_at);

CREATE TABLE google_auth_challenges (
  challenge_id_hash TEXT PRIMARY KEY
    CHECK (length(challenge_id_hash) = 64 AND challenge_id_hash NOT GLOB '*[^0-9a-f]*'),
  nonce_hash TEXT NOT NULL
    CHECK (length(nonce_hash) = 64 AND nonce_hash NOT GLOB '*[^0-9a-f]*'),
  platform TEXT NOT NULL CHECK (platform IN ('web', 'android')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL CHECK (expires_at > created_at),
  consumed_at TEXT
);

CREATE INDEX google_auth_challenges_expiry
  ON google_auth_challenges (expires_at);
