ALTER TABLE users ADD COLUMN IF NOT EXISTS mood_level SMALLINT CHECK (mood_level BETWEEN 1 AND 5);
ALTER TABLE users ADD COLUMN IF NOT EXISTS mood_public BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS user_mood_entries (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id BIGINT NOT NULL CHECK (id > 0),
  request_id UUID NOT NULL,
  level SMALLINT NOT NULL CHECK (level BETWEEN 1 AND 5),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id, id),
  UNIQUE (user_id, request_id)
);
