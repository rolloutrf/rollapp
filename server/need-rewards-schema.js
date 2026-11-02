// Applied only by the separately invoked, explicitly authorized migration.
// Never interpolate this into the application's automatic schema initializer.
export const needRewardsSchema = `
CREATE TABLE IF NOT EXISTS reward_needs (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  title VARCHAR(160) NOT NULL,
  description VARCHAR(1200) NOT NULL,
  category VARCHAR(80) NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','matched','closed')),
  idempotency_key UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS reward_needs_feed ON reward_needs(status,created_at DESC,id);
CREATE TABLE IF NOT EXISTS reward_need_offers (
  id UUID PRIMARY KEY,
  need_id UUID NOT NULL REFERENCES reward_needs(id),
  business_id TEXT NOT NULL REFERENCES users(id),
  description VARCHAR(1200) NOT NULL,
  reward BIGINT NOT NULL CHECK (reward BETWEEN 1 AND 1000000),
  status TEXT NOT NULL DEFAULT 'offered' CHECK (status IN ('offered','accepted','delivered','confirmed','settled','declined','cancelled','disputed')),
  idempotency_key UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP + INTERVAL '7 days',
  claim_at TIMESTAMPTZ,
  settled_at TIMESTAMPTZ,
  dispute_reason VARCHAR(1200),
  UNIQUE(business_id,idempotency_key),
  UNIQUE(need_id,business_id),
  CHECK (status NOT IN ('confirmed','settled') OR claim_at IS NOT NULL),
  CHECK ((status = 'settled') = (settled_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS reward_need_one_result ON reward_need_offers(need_id)
  WHERE status IN ('accepted','delivered','confirmed','settled','disputed');
CREATE INDEX IF NOT EXISTS reward_need_offers_business ON reward_need_offers(business_id,created_at DESC);
CREATE INDEX IF NOT EXISTS reward_need_offers_expiry ON reward_need_offers(expires_at,id) WHERE status='offered';
CREATE TABLE IF NOT EXISTS reward_need_entries (
  id UUID PRIMARY KEY,
  offer_id UUID NOT NULL REFERENCES reward_need_offers(id),
  user_id TEXT NOT NULL REFERENCES roll_wallets(user_id),
  kind TEXT NOT NULL CHECK (kind IN ('reserve','reward','refund')),
  amount BIGINT NOT NULL CHECK (amount BETWEEN 1 AND 1000000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(offer_id,kind)
);
CREATE UNIQUE INDEX IF NOT EXISTS reward_need_one_release ON reward_need_entries(offer_id) WHERE kind IN ('reward','refund');
CREATE TABLE IF NOT EXISTS reward_need_events (
  id UUID PRIMARY KEY,
  offer_id UUID NOT NULL REFERENCES reward_need_offers(id),
  actor_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  note VARCHAR(1200) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS reward_blockchain_receipts (
  offer_id UUID PRIMARY KEY REFERENCES reward_need_offers(id),
  content TEXT NOT NULL,
  digest VARCHAR(64) NOT NULL UNIQUE CHECK (digest ~ '^[a-f0-9]{64}$'),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','pending','confirmed')),
  proof BYTEA,
  bitcoin_height INTEGER,
  bitcoin_hash VARCHAR(64),
  verified_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lease_token UUID,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (status <> 'confirmed' OR (proof IS NOT NULL AND bitcoin_height IS NOT NULL AND bitcoin_hash IS NOT NULL AND verified_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS reward_blockchain_receipts_queue ON reward_blockchain_receipts(next_attempt_at) WHERE status<>'confirmed';
`;
