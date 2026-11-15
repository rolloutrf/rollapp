// This schema is installed only by the separately authorized migration.
export const marketplaceSettlementsSchema = `
  CREATE TABLE IF NOT EXISTS roll_marketplace_orders (
    id UUID PRIMARY KEY,
    buyer_id TEXT NOT NULL REFERENCES roll_wallets(user_id),
    seller_id TEXT NOT NULL REFERENCES users(id),
    item_id TEXT NOT NULL,
    item_title VARCHAR(160) NOT NULL,
    sphere TEXT NOT NULL CHECK (sphere IN ('career','education','health','contacts')),
    buyer_name TEXT NOT NULL,
    seller_name TEXT NOT NULL,
    amount BIGINT NOT NULL CHECK (amount BETWEEN 1 AND 1000000),
    request_key UUID NOT NULL,
    gift_card_id TEXT REFERENCES business_gift_cards(id),
    gift_payment_id TEXT UNIQUE REFERENCES business_gift_card_events(id),
    status TEXT NOT NULL DEFAULT 'reserved'
      CHECK (status IN ('reserved','fulfilled','disputed','released','refunded')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    review_until TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    UNIQUE (buyer_id,request_key),
    CHECK (buyer_id<>seller_id),
    CHECK ((gift_card_id IS NULL)=(gift_payment_id IS NULL)),
    CHECK (gift_payment_id IS NULL OR gift_payment_id=id::text),
    CHECK (status NOT IN ('fulfilled','disputed','released') OR review_until IS NOT NULL),
    CHECK ((status IN ('released','refunded'))=(closed_at IS NOT NULL))
  );
  CREATE INDEX IF NOT EXISTS idx_roll_marketplace_orders_buyer
    ON roll_marketplace_orders(buyer_id,created_at DESC,id DESC);
  CREATE INDEX IF NOT EXISTS idx_roll_marketplace_orders_seller
    ON roll_marketplace_orders(seller_id,created_at DESC,id DESC);
  CREATE INDEX IF NOT EXISTS idx_roll_marketplace_orders_gift
    ON roll_marketplace_orders(gift_card_id) WHERE status IN ('reserved','fulfilled','disputed');

  CREATE TABLE IF NOT EXISTS roll_marketplace_order_events (
    order_id UUID NOT NULL REFERENCES roll_marketplace_orders(id),
    action TEXT NOT NULL CHECK (action IN ('fulfill','accept','dispute','claim','cancel','refund','resolve_release','resolve_refund')),
    actor_id TEXT REFERENCES users(id),
    operator_label TEXT,
    note VARCHAR(1000) NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (order_id,action),
    CHECK ((actor_id IS NULL)=(operator_label IS NOT NULL)),
    CHECK ((action IN ('resolve_release','resolve_refund'))=(operator_label IS NOT NULL)),
    CHECK (action NOT IN ('dispute','resolve_release','resolve_refund') OR length(btrim(note))>0)
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_roll_marketplace_single_settlement
    ON roll_marketplace_order_events(order_id)
    WHERE action IN ('accept','claim','cancel','refund','resolve_release','resolve_refund');
`;

export async function hasMarketplaceSettlementSchema(client) {
  const { rows: [schema] } = await client.query(`
    SELECT to_regclass('roll_marketplace_orders') IS NOT NULL AS orders,
           to_regclass('roll_marketplace_order_events') IS NOT NULL AS events
  `);
  if (schema.orders !== schema.events) throw new Error("Incomplete marketplace settlement schema");
  return schema.orders;
}

export async function verifyMarketplaceSettlementSchema(client) {
  if (!await hasMarketplaceSettlementSchema(client)) throw new Error("Marketplace settlement schema is not installed");
  await client.query(`SELECT o.id,o.buyer_id,o.seller_id,o.buyer_name,o.seller_name,o.item_id,o.item_title,
    o.sphere,o.amount,o.request_key,o.gift_card_id,o.gift_payment_id,o.status,o.created_at,o.review_until,o.closed_at,
    e.action,e.actor_id,e.operator_label,e.note,e.created_at,g.purchase_id
    FROM roll_marketplace_orders o JOIN roll_marketplace_order_events e ON e.order_id=o.id
    LEFT JOIN business_gift_card_events g ON g.id=o.gift_payment_id LIMIT 0`);
}
