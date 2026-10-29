// Applied to an existing production database only by the explicit import command.
export const privateDataSchema = `
  CREATE TABLE IF NOT EXISTS application_settings (
    key TEXT PRIMARY KEY,
    value_text TEXT NOT NULL
  );
  ALTER TABLE contact_overrides ADD COLUMN IF NOT EXISTS source_order INTEGER;
  CREATE TABLE IF NOT EXISTS health_lab_content (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    content_json TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS private_files (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source_path TEXT NOT NULL,
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_data BYTEA NOT NULL,
    size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
    file_sha256 TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id,source_path,file_sha256),
    CHECK (octet_length(file_data) = size_bytes),
    CHECK (encode(sha256(file_data),'hex') = file_sha256)
  );
  CREATE INDEX IF NOT EXISTS idx_private_files_owner ON private_files(user_id,created_at,id);
`;
