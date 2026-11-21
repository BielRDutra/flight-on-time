CREATE TABLE IF NOT EXISTS account_preference_cache (
  account_id TEXT PRIMARY KEY,
  snapshot_json TEXT NOT NULL,
  pending_update_json TEXT,
  sync_state TEXT NOT NULL CHECK (sync_state IN ('synced', 'pending', 'failed', 'conflict')),
  etag TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
