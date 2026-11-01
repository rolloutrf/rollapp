-- Separate, explicitly authorized operation. Never run during app startup.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
CREATE TABLE IF NOT EXISTS stories (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  video_data BYTEA NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 26214400),
  duration_seconds DOUBLE PRECISION NOT NULL CHECK (duration_seconds > 0 AND duration_seconds <= 60),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours'),
  CHECK (expires_at = created_at + INTERVAL '24 hours')
);
CREATE INDEX IF NOT EXISTS stories_user_expiry ON stories(user_id, expires_at);
COMMIT;
