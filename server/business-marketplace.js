import { lockOwnedGiftCard, recordGiftEvent } from "./gift-cards.js";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { BUSINESS_MARKETPLACE_KINDS, BUSINESS_MARKETPLACE_SPHERES, isBusinessMarketplaceSphere } from "../shared/business-marketplace.js";
import { ensureRollWallet, RollsError } from "./rolls.js";

export const businessMarketplaceSchema = `
  CREATE TABLE IF NOT EXISTS business_marketplace_items (
    id TEXT PRIMARY KEY,
    business_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sphere TEXT NOT NULL CHECK (sphere IN ('identity','career','education','health','contacts')),
    kind TEXT NOT NULL CHECK (kind = 'store'),
    item_type TEXT NOT NULL DEFAULT 'service' CHECK (item_type IN ('product','service')),
    title VARCHAR(160) NOT NULL,
    description VARCHAR(1200) NOT NULL DEFAULT '',
    category VARCHAR(80) NOT NULL DEFAULT '',
    image_url TEXT NOT NULL DEFAULT '',
    action_url TEXT NOT NULL DEFAULT '',
    price_rolls BIGINT NOT NULL CHECK (price_rolls BETWEEN 1 AND 1000000),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_business_marketplace_items_feed
    ON business_marketplace_items(sphere, kind, active, sort_order, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_business_marketplace_items_business
    ON business_marketplace_items(business_user_id, created_at DESC);
`;

const routeSchema = z.object({
  sphere: z.enum(BUSINESS_MARKETPLACE_SPHERES),
  kind: z.enum(BUSINESS_MARKETPLACE_KINDS),
}).strict();

export const businessMarketplacePurchaseSchema = z.object({
  giftCardId: z.string().min(1).max(200).optional(),
  itemId: z.string().trim().min(1).max(200),
  idempotencyKey: z.string().uuid(),
}).strict();

function itemFromRow(row) {
  return {
    id: row.id,
    sphere: row.sphere,
    kind: row.kind,
    itemType: row.item_type,
    title: row.title,
    description: row.description,
    category: row.category,
    imageUrl: row.image_url,
    actionUrl: row.action_url,
    priceRolls: row.price_rolls == null ? null : Number(row.price_rolls),
    business: {
      id: row.business_user_id,
      name: row.business_name,
      username: row.business_username,
      avatarUrl: row.business_avatar_url,
    },
  };
}

export async function listBusinessMarketplaceItems(query, params) {
  const parsed = routeSchema.safeParse(params);
  if (!parsed.success) throw new RollsError("Раздел бизнеса не найден", "MARKETPLACE_NOT_FOUND", 404);
  const result = await query(
    `SELECT i.*,u.name AS business_name,u.username AS business_username,u.avatar_url AS business_avatar_url
     FROM business_marketplace_items i
     JOIN users u ON u.id=i.business_user_id AND u.account_type='business'
     WHERE i.sphere=$1 AND i.kind=$2 AND i.active=TRUE
     ORDER BY i.sort_order,i.created_at DESC,i.id`,
    [parsed.data.sphere, parsed.data.kind],
  );
  return result.rows.map(itemFromRow);
}

export async function purchaseBusinessMarketplaceItem(client, userId, sphere, input) {
  if (!BUSINESS_MARKETPLACE_SPHERES.includes(sphere)) {
    throw new RollsError("Раздел бизнеса не найден", "MARKETPLACE_NOT_FOUND", 404);
  }
  const parsed = businessMarketplacePurchaseSchema.safeParse(input);
  if (!parsed.success) throw new RollsError("Некорректные данные покупки", "INVALID_PURCHASE");
  const { itemId, idempotencyKey, giftCardId } = parsed.data;
  await ensureRollWallet(client, userId);
  const previous = await client.query(
    "SELECT * FROM roll_store_purchases WHERE user_id=$1 AND idempotency_key=$2",
    [userId, idempotencyKey],
  );
  if (previous.rowCount) {
    const row = previous.rows[0];
    if (row.product_id !== `business:${itemId}` || row.delivery?.sphere !== sphere || (row.delivery?.giftCardId || null) !== (giftCardId || null)) {
      throw new RollsError("Этот запрос уже использован для другой покупки", "IDEMPOTENCY_CONFLICT", 409);
    }
    const wallet = await client.query("SELECT balance FROM roll_wallets WHERE user_id=$1", [userId]);
    return { id: row.id, replayed: true, balance: Number(wallet.rows[0].balance) };
  }
  const giftSchema = await client.query("SELECT to_regclass('business_gift_card_events')::text AS events");
  if (giftSchema.rows[0]?.events) {
    const previousGift = await client.query("SELECT * FROM business_gift_card_events WHERE actor_id=$1 AND request_key=$2", [userId, idempotencyKey]);
    if (previousGift.rowCount) {
      const row = previousGift.rows[0];
      if (row.kind !== "spend" || row.card_id !== giftCardId || row.purchase?.productId !== `business:${itemId}` || row.purchase?.delivery?.sphere !== sphere) {
        throw new RollsError("Этот запрос уже использован для другой покупки", "IDEMPOTENCY_CONFLICT", 409);
      }
      const wallet = await client.query("SELECT balance FROM roll_wallets WHERE user_id=$1", [userId]);
      return { id: row.id, replayed: true, balance: Number(wallet.rows[0].balance) };
    }
  }
  const itemResult = await client.query(
    `SELECT i.*,u.name AS business_name,u.username AS business_username
     FROM business_marketplace_items i
     JOIN users u ON u.id=i.business_user_id AND u.account_type='business'
     WHERE i.id=$1 AND i.sphere=$2 AND i.kind='store' AND i.active=TRUE
     FOR UPDATE OF i`,
    [itemId, sphere],
  );
  if (!itemResult.rowCount) throw new RollsError("Товар или услуга больше не доступны", "PRODUCT_NOT_FOUND", 404);
  const item = itemResult.rows[0];
  const productId = `business:${item.id}`;
  const amount = Number(item.price_rolls);
  const id = randomUUID();
  const delivery = {
    provider: "business",
    ...(giftCardId ? { giftCardId } : {}),
    marketplaceItemId: item.id,
    sphere,
    itemType: item.item_type,
    business: { id: item.business_user_id, name: item.business_name, username: item.business_username },
  };
  let balance;
  if (giftCardId) {
    const card = await lockOwnedGiftCard(client, userId, giftCardId);
    if (card.business_id !== item.business_user_id) throw new RollsError("Карта действует только у своего бизнеса", "GIFT_CARD_BUSINESS_MISMATCH", 409);
    const debit = await client.query("UPDATE business_gift_cards SET balance=balance-$1 WHERE id=$2 AND balance >= $1 RETURNING balance", [amount, giftCardId]);
    if (!debit.rowCount) throw new RollsError("На карте недостаточно роллов", "INSUFFICIENT_GIFT_ROLLS", 409);
    // Older deployed servers refund every roll_store_purchase into the ordinary
    // wallet. Keep restricted payments out of that ledger during mixed versions.
    await recordGiftEvent(client, { id, cardId: giftCardId, userId, kind: "spend", amount, requestKey: idempotencyKey,
      purchase: { productId, productTitle: item.title, delivery } });
    balance = Number((await client.query("SELECT balance FROM roll_wallets WHERE user_id=$1", [userId])).rows[0].balance);
  } else {
    const debit = await client.query("UPDATE roll_wallets SET balance=balance-$1 WHERE user_id=$2 AND balance >= $1 RETURNING balance", [amount, userId]);
    if (!debit.rowCount) throw new RollsError("Недостаточно роллов для покупки", "INSUFFICIENT_ROLLS", 409);
    balance = Number(debit.rows[0].balance);
    await client.query(
      `INSERT INTO roll_store_purchases (id,user_id,product_id,product_title,amount,idempotency_key,delivery)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
      [id, userId, productId, item.title, amount, idempotencyKey, JSON.stringify(delivery)],
    );
  }
  return { id, replayed: false, balance };
}

export function registerBusinessMarketplaceRoutes(app, { requireAuth, query, transaction }) {
  const handle = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch((error) => {
    if (error instanceof RollsError) return res.status(error.status).json({ error: error.message, code: error.code });
    if (error.code === "42P01" && req.body?.giftCardId) return res.status(503).json({ error: "Подарочные карты временно недоступны. Попробуйте позже.", code: "GIFT_CARDS_UNAVAILABLE" });
    next(error);
  });
  app.get("/api/business-profiles/:username/offers", handle(async (req, res) => {
    res.set("Cache-Control", "no-store");
    const items = await query(`SELECT i.*,u.name AS business_name,u.username AS business_username,u.avatar_url AS business_avatar_url
      FROM business_marketplace_items i JOIN users u ON u.id=i.business_user_id
      WHERE lower(u.username)=lower($1) AND u.account_type='business' AND i.active=TRUE AND i.kind='store' AND i.sphere=ANY($2::text[])
      ORDER BY i.sort_order,i.created_at DESC,i.id`, [req.params.username, BUSINESS_MARKETPLACE_SPHERES]);
    res.json({ items: items.rows.map(itemFromRow) });
  }));
  const availableSphere = (req, res, next) => isBusinessMarketplaceSphere(req.params.sphere)
    ? next()
    : res.status(404).json({ error: "Раздел бизнеса не найден", code: "MARKETPLACE_NOT_FOUND" });
  app.get("/api/business-marketplace/:sphere/store", requireAuth, availableSphere, handle(async (req, res) => {
    res.json({ items: await listBusinessMarketplaceItems(query, { sphere: req.params.sphere, kind: "store" }) });
  }));
  app.post("/api/business-marketplace/:sphere/purchases", requireAuth, availableSphere, handle(async (req, res) => {
    const purchase = await transaction((client) => purchaseBusinessMarketplaceItem(client, req.user.id, req.params.sphere, req.body));
    res.status(purchase.replayed ? 200 : 201).json({ purchase });
  }));
}
