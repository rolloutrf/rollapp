-- Apply separately to the verified database before enabling Disk profiles.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '10s';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS disk_profile_head TEXT
  CHECK (disk_profile_head ~ '^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:){2}[0-9a-f]{64}$');
COMMIT;
