-- Separate, explicitly authorized production operation; never run at app startup.
-- Confirm the database/role before applying. No existing data is changed.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
CREATE TABLE IF NOT EXISTS health_tracker_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tracker TEXT NOT NULL CHECK (tracker IN ('sleep','nutrition')),
  entry_on DATE NOT NULL,
  data_json TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS health_tracker_entries_user_day_idx
  ON health_tracker_entries (user_id,tracker,entry_on DESC);
COMMIT;
