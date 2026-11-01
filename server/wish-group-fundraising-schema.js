export const wishGroupFundraisingSchema = `
  CREATE TABLE IF NOT EXISTS wish_group_fundraisers (
    id TEXT PRIMARY KEY,
    group_id TEXT UNIQUE REFERENCES wish_groups(id) ON DELETE SET NULL,
    owner_id TEXT NOT NULL REFERENCES users(id),
    title VARCHAR(60) NOT NULL,
    target BIGINT NOT NULL CHECK (target BETWEEN 1 AND 1000000000),
    accepting BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS wish_group_contributions (
    transaction_id TEXT PRIMARY KEY REFERENCES roll_transactions(id),
    fundraiser_id TEXT NOT NULL REFERENCES wish_group_fundraisers(id),
    sender_id TEXT NOT NULL REFERENCES users(id),
    idempotency_key VARCHAR(100) NOT NULL,
    UNIQUE (sender_id,idempotency_key)
  );
  CREATE INDEX IF NOT EXISTS idx_wish_group_contributions_fundraiser
    ON wish_group_contributions(fundraiser_id);
`;
