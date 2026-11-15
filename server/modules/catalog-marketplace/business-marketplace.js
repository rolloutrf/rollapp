import { hasMarketplaceSettlementSchema } from "../checkout/marketplace-settlements-schema.js";
import { reserveMarketplacePurchase } from "../checkout/marketplace-settlements.js";
import { createRateLimit } from "../runtime/rate-limit.js";
import { lockOwnedGiftCard, recordGiftEvent } from "../loyalty/gift-cards.js";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { BUSINESS_MARKETPLACE_KINDS, BUSINESS_MARKETPLACE_SPHERES, isBusinessMarketplaceSphere } from "../../../shared/modules/catalog-marketplace/business-marketplace.js";
import { ensureRollWallet, RollsError } from "../payments/rolls.js";

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
  expectedPrice: z.number().int().min(1).max(1_000_000).optional(),
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

function purchaseConflict() {
  return new RollsError("Этот запрос уже использован для другой покупки", "IDEMPOTENCY_CONFLICT", 409);
}

async function findBusinessPurchase(client, userId, requestKey, settlementReady) {
  if (settlementReady) {
    const { rows: [row] } = await client.query(
      "SELECT id,item_id,sphere,amount,gift_card_id,status FROM roll_marketplace_orders WHERE buyer_id=$1 AND request_key=$2",
      [userId, requestKey],
    );
    if (row) return { id: row.id, itemId: row.item_id, sphere: row.sphere, amount: Number(row.amount),
      giftCardId: row.gift_card_id, status: row.status, protected: true };
  }
  const { rows: [order] } = await client.query(
    "SELECT * FROM roll_store_purchases WHERE user_id=$1 AND idempotency_key=$2", [userId, requestKey],
  );
  if (order) {
    if (!order.product_id?.startsWith("business:") || !order.delivery?.sphere) throw purchaseConflict();
    return { id: order.id, itemId: order.product_id.slice("business:".length), sphere: order.delivery.sphere,
      amount: Number(order.amount), giftCardId: order.delivery.giftCardId || null,
      status: order.refunded_at ? "refunded" : "placed", protected: false };
  }
  const { rows: [giftSchema] } = await client.query("SELECT to_regclass('business_gift_card_events')::text AS events");
  if (giftSchema?.events) {
    const { rows: [event] } = await client.query(`
      SELECT e.*,r.created_at AS refunded_at FROM business_gift_card_events e
      LEFT JOIN business_gift_card_events r ON r.purchase_id=e.id AND r.kind='refund'
      WHERE e.actor_id=$1 AND e.request_key=$2`, [userId, requestKey]);
    if (event) {
      if (event.kind !== "spend" || !event.purchase?.productId?.startsWith("business:") || !event.purchase?.delivery?.sphere) {
        throw purchaseConflict();
      }
      return { id: event.id, itemId: event.purchase.productId.slice("business:".length), sphere: event.purchase.delivery.sphere,
        amount: Number(event.amount), giftCardId: event.card_id, status: event.refunded_at ? "refunded" : "placed", protected: false };
    }
  }
  return null;
}

export async function readBusinessPurchaseStatus(client, userId, sphere, requestKey) {
  const key = z.uuid().safeParse(requestKey);
  if (!key.success) throw new RollsError("Проверьте номер запроса покупки", "INVALID_PURCHASE_REQUEST");
  const purchase = await findBusinessPurchase(client, userId, key.data, await hasMarketplaceSettlementSchema(client));
  if (purchase && purchase.sphere !== sphere) throw purchaseConflict();
  return purchase;
}

export async function purchaseBusinessMarketplaceItem(client, userId, sphere, input, { protectedCheckout = false, verifySchema = false } = {}) {
  if (!BUSINESS_MARKETPLACE_SPHERES.includes(sphere)) {
    throw new RollsError("Раздел бизнеса не найден", "MARKETPLACE_NOT_FOUND", 404);
  }
  const parsed = businessMarketplacePurchaseSchema.safeParse(input);
  if (!parsed.success) throw new RollsError("Некорректные данные покупки", "INVALID_PURCHASE");
  const { itemId, idempotencyKey, giftCardId, expectedPrice } = parsed.data;
  const settlementReady = (protectedCheckout || verifySchema) && await hasMarketplaceSettlementSchema(client);
  if (protectedCheckout && !settlementReady) throw new RollsError("Защищённая оплата временно недоступна", "MARKETPLACE_SETTLEMENT_UNAVAILABLE", 503);
  await ensureRollWallet(client, userId);
  const previous = await findBusinessPurchase(client, userId, idempotencyKey, settlementReady);
  if (previous) {
    if (previous.itemId !== itemId || previous.sphere !== sphere || previous.giftCardId !== (giftCardId ?? null) ||
        ((previous.protected || expectedPrice !== undefined) && previous.amount !== expectedPrice)) throw purchaseConflict();
    const { rows: [wallet] } = await client.query("SELECT balance FROM roll_wallets WHERE user_id=$1", [userId]);
    return { id: previous.id, replayed: true, balance: Number(wallet.balance), status: previous.status, amount: previous.amount, ...(previous.protected && { protected: true }) };
  }
  if (settlementReady && !protectedCheckout) {
    throw new RollsError("Новые покупки временно приостановлены", "MARKETPLACE_SETTLEMENT_UNAVAILABLE", 503);
  }
  if (protectedCheckout && expectedPrice === undefined) {
    throw new RollsError("Обновите страницу и подтвердите цену покупки", "PRICE_CONFIRMATION_REQUIRED", 409);
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
  if (item.business_user_id === userId) throw new RollsError("Вы продаёте это предложение", "SELF_PURCHASE", 409);
  if (expectedPrice !== undefined && expectedPrice !== amount) {
    throw new RollsError("Цена изменилась. Проверьте новую сумму перед оплатой", "PRICE_CHANGED", 409);
  }
  if (protectedCheckout) return reserveMarketplacePurchase(client, userId, item, { giftCardId, idempotencyKey });
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

export function registerBusinessMarketplaceRoutes(app, { requireAuth, query, transaction, env = process.env }) {
  const protectedCheckout = env.ROLLAPP_MARKETPLACE_SETTLEMENTS_ENABLED === "true";
  const limit = createRateLimit({ windowMs: 60_000, max: 20, key: (req) => req.user.id });
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
    res.json({ items: items.rows.map(itemFromRow), protectedCheckout });
  }));
  const availableSphere = (req, res, next) => isBusinessMarketplaceSphere(req.params.sphere)
    ? next()
    : res.status(404).json({ error: "Раздел бизнеса не найден", code: "MARKETPLACE_NOT_FOUND" });
  app.get("/api/business-marketplace/:sphere/store", requireAuth, availableSphere, handle(async (req, res) => {
    res.json({ items: await listBusinessMarketplaceItems(query, { sphere: req.params.sphere, kind: "store" }), protectedCheckout });
  }));
  app.get("/api/business-marketplace/:sphere/purchases/:requestKey", requireAuth, availableSphere, limit, handle(async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    const purchase = await transaction(async (client) => {
      await client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
      return readBusinessPurchaseStatus(client, req.user.id, req.params.sphere, req.params.requestKey);
    });
    res.json({ purchase });
  }));
  app.post("/api/business-marketplace/:sphere/purchases", requireAuth, availableSphere, limit, handle(async (req, res) => {
    res.set("Cache-Control", "no-store");
    const purchase = await transaction((client) => purchaseBusinessMarketplaceItem(client, req.user.id, req.params.sphere, req.body, { protectedCheckout, verifySchema: true }));
    res.status(purchase.replayed ? 200 : 201).json({ purchase });
  }));
}
