export const tonRollsSchema = `
  CREATE TABLE IF NOT EXISTS roll_ton_orders (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    sender TEXT NOT NULL,
    recipient TEXT NOT NULL,
    chain TEXT NOT NULL CHECK (chain = '-239'),
    rolls BIGINT NOT NULL CHECK (rolls > 0),
    nanotons NUMERIC(40,0) NOT NULL CHECK (nanotons > 0),
    rate BIGINT NOT NULL CHECK (rate > 0),
    idempotency_key UUID NOT NULL,
    terms_version TEXT NOT NULL DEFAULT '2026-09-12-ton-1',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '10 minutes'),
    paid_at TIMESTAMPTZ,
    transaction_hash TEXT,
    UNIQUE(user_id, idempotency_key),
    UNIQUE(chain, recipient, transaction_hash)
  );
  CREATE INDEX IF NOT EXISTS roll_ton_orders_pending ON roll_ton_orders(created_at) WHERE paid_at IS NULL;
`;
