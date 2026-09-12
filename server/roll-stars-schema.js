export const rollStarsSchema = `
  CREATE TABLE IF NOT EXISTS roll_star_orders (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES roll_wallets(user_id),
    telegram_user_id TEXT NOT NULL,
    package_id TEXT NOT NULL,
    rolls BIGINT NOT NULL CHECK (rolls BETWEEN 1 AND 1000000000),
    stars INTEGER NOT NULL CHECK (stars > 0),
    idempotency_key TEXT NOT NULL,
    terms_version TEXT NOT NULL,
    invoice_url TEXT,
    checkout_query_id TEXT UNIQUE,
    telegram_payment_charge_id TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '1 hour'),
    paid_at TIMESTAMPTZ,
    UNIQUE (user_id, idempotency_key),
    CHECK ((paid_at IS NULL) = (telegram_payment_charge_id IS NULL))
  );
  CREATE INDEX IF NOT EXISTS idx_roll_star_orders_user
    ON roll_star_orders(user_id, created_at DESC, id DESC);
`;
