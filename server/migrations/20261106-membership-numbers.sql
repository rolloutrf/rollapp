-- Run transactionally and explicitly against the verified Rollapp database.
LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE IF NOT EXISTS membership_numbers (
  number integer PRIMARY KEY CHECK (number BETWEEN 1 AND 30000),
  draw_order integer NOT NULL UNIQUE CHECK (draw_order BETWEEN 1 AND 30000),
  user_id text UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  claim_digest bytea UNIQUE,
  CHECK (user_id IS NULL OR claim_digest IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS membership_free_draw
  ON membership_numbers (draw_order) WHERE claim_digest IS NULL;

CREATE TABLE IF NOT EXISTS membership_ton_anchors (
  number integer PRIMARY KEY REFERENCES membership_numbers(number),
  receipt text NOT NULL,
  digest text NOT NULL UNIQUE CHECK (digest ~ '^[0-9a-f]{64}$'),
  wallet text,
  seqno integer,
  expires_at timestamptz,
  boc bytea,
  tx_hash text CHECK (tx_hash ~ '^[0-9a-f]{64}$'),
  tx_lt text CHECK (tx_lt ~ '^[0-9]+$'),
  lease_token uuid,
  next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((boc IS NULL AND seqno IS NULL AND expires_at IS NULL)
      OR (boc IS NOT NULL AND seqno IS NOT NULL AND expires_at IS NOT NULL AND wallet IS NOT NULL)),
  CHECK ((tx_hash IS NULL AND tx_lt IS NULL) OR (tx_hash IS NOT NULL AND tx_lt IS NOT NULL AND wallet IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS membership_one_signed_anchor
  ON membership_ton_anchors ((true)) WHERE boc IS NOT NULL;

CREATE INDEX IF NOT EXISTS membership_ton_queue
  ON membership_ton_anchors (next_attempt_at, number) WHERE tx_hash IS NULL;

-- An independently shuffled draw order. Unused numbers are never sent to clients.
INSERT INTO membership_numbers (number, draw_order)
SELECT number, row_number() OVER (ORDER BY gen_random_uuid())
FROM generate_series(1, 30000) AS slots(number)
WHERE NOT EXISTS (SELECT 1 FROM membership_numbers)
ON CONFLICT DO NOTHING;

-- Existing accounts count towards the same cap. This operation is idempotent.
DO $$
BEGIN
  IF (SELECT count(*) FROM users u WHERE NOT EXISTS (SELECT 1 FROM membership_numbers n WHERE n.user_id = u.id))
     > (SELECT count(*) FROM membership_numbers WHERE claim_digest IS NULL) THEN
    RAISE EXCEPTION 'Existing accounts exceed the remaining Rollapp membership capacity';
  END IF;
END
$$;

WITH existing AS (
  SELECT u.id, row_number() OVER (ORDER BY u.created_at, u.id) AS rank
  FROM users u
  WHERE NOT EXISTS (SELECT 1 FROM membership_numbers n WHERE n.user_id = u.id)
), available AS (
  SELECT number, row_number() OVER (ORDER BY draw_order) AS rank
  FROM membership_numbers WHERE claim_digest IS NULL
)
UPDATE membership_numbers n
SET user_id = e.id, claim_digest = sha256(convert_to(e.id, 'UTF8'))
FROM existing e JOIN available a USING (rank) WHERE n.number = a.number;

CREATE OR REPLACE FUNCTION rollapp_assign_membership_number() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  assigned integer;
  content text;
  nonce text := gen_random_uuid()::text || gen_random_uuid()::text;
BEGIN
  -- Shared by every insert path, including OAuth and other application instances.
  PERFORM pg_advisory_xact_lock(14202204, 30000);
  UPDATE membership_numbers
  SET user_id = NEW.id, claim_digest = sha256(convert_to(NEW.id, 'UTF8'))
  WHERE number = (
    SELECT number FROM membership_numbers WHERE claim_digest IS NULL
    ORDER BY draw_order LIMIT 1
  )
  RETURNING number INTO assigned;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P3000', MESSAGE = 'Rollapp membership is full';
  END IF;

  -- Only the hash of these exact bytes leaves Rollapp.
  content := jsonb_build_object(
    'type', 'rollapp-membership-v1',
    'number', lpad(assigned::text, 5, '0'),
    'issuedAt', to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'accountCommitment', encode(sha256(convert_to('rollapp-membership-account-v1:' || NEW.id || ':' || nonce, 'UTF8')), 'hex'),
    'nonce', nonce
  )::text;
  INSERT INTO membership_ton_anchors (number, receipt, digest)
    VALUES (assigned, content, encode(sha256(convert_to(content, 'UTF8')), 'hex'));
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS rollapp_membership_on_insert ON users;
CREATE TRIGGER rollapp_membership_on_insert AFTER INSERT ON users
  FOR EACH ROW EXECUTE FUNCTION rollapp_assign_membership_number();
