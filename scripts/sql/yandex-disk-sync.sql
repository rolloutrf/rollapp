-- Apply as a separate, explicitly authorized schema operation.
BEGIN;
CREATE TABLE IF NOT EXISTS yandex_disk_sync (
  user_id TEXT NOT NULL,
  oauth_client_id TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  next_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_completed_at TIMESTAMPTZ,
  last_error TEXT CHECK (last_error IN ('reconnect', 'space', 'folder', 'failed')),
  lease_token UUID,
  lease_until TIMESTAMPTZ,
  PRIMARY KEY (user_id, oauth_client_id),
  FOREIGN KEY (user_id, oauth_client_id) REFERENCES yandex_disk_notes (user_id, oauth_client_id) ON DELETE CASCADE,
  CHECK ((lease_token IS NULL) = (lease_until IS NULL))
);
CREATE INDEX IF NOT EXISTS yandex_disk_sync_due ON yandex_disk_sync (oauth_client_id, next_at) WHERE enabled;
COMMIT;
