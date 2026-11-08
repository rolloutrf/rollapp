-- Apply as a separate, explicitly authorized schema operation.
BEGIN;
CREATE TABLE IF NOT EXISTS yandex_disk_notes (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  oauth_client_id TEXT NOT NULL,
  folder_id UUID NOT NULL UNIQUE,
  encrypted_tokens TEXT NOT NULL,
  revision TEXT CHECK (revision ~ '^[0-9]{17}-[0-9a-f-]{36}$'),
  PRIMARY KEY (user_id, oauth_client_id)
);
COMMIT;
