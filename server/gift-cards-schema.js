// Applied only by an explicitly authorized schema operation, never by verify startup.
export const giftCardsSchema = `
  CREATE TABLE IF NOT EXISTS business_gift_cards (
    id TEXT PRIMARY KEY,
    business_id TEXT NOT NULL REFERENCES users(id),
    creator_id TEXT NOT NULL REFERENCES users(id),
    owner_id TEXT NOT NULL REFERENCES users(id),
    balance BIGINT NOT NULL DEFAULT 0 CHECK (balance BETWEEN 0 AND 1000000000),
    issue_key UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (creator_id, issue_key)
  );
  CREATE INDEX IF NOT EXISTS idx_gift_cards_owner ON business_gift_cards(owner_id, created_at DESC);
  CREATE TABLE IF NOT EXISTS business_gift_card_events (
    id TEXT PRIMARY KEY,
    card_id TEXT NOT NULL REFERENCES business_gift_cards(id),
    actor_id TEXT NOT NULL REFERENCES users(id),
    kind TEXT NOT NULL CHECK (kind IN ('topup','send','spend','refund')),
    amount BIGINT NOT NULL DEFAULT 0 CHECK (amount BETWEEN 0 AND 1000000000),
    recipient_id TEXT REFERENCES users(id),
    request_key UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (actor_id, request_key)
  );
  ALTER TABLE business_gift_card_events ADD COLUMN IF NOT EXISTS purchase JSONB;
  ALTER TABLE business_gift_card_events ADD COLUMN IF NOT EXISTS purchase_id TEXT REFERENCES business_gift_card_events(id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_gift_card_refund_once
    ON business_gift_card_events(purchase_id) WHERE kind='refund';
  CREATE INDEX IF NOT EXISTS idx_gift_card_events_card ON business_gift_card_events(card_id, created_at, id);
`;
