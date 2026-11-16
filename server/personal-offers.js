import { randomUUID } from "node:crypto";
import { z } from "zod";
import { readPersonalOfferOperation, readPersonalOfferTerms, requirePersonalOfferPrice } from "./modules/checkout/personal-offer-status.js";
import { refundPersonalOffer } from "./modules/checkout/personal-offer-refunds.js";
import { createRateLimit } from "./modules/runtime/rate-limit.js";
import { RollsError, transferPersonalOfferRolls } from "./modules/payments/rolls.js";
import { canManageWishlistSpace } from "../shared/modules/wishlist/wishlist-business.js";
import { BUSINESS_OFFER_SPHERES, canBusinessAccessSection } from "../shared/modules/catalog-marketplace/business-accounts.js";
import { SPHERE_SECTIONS } from "../shared/modules/access/sphere-sharing.js";

export const personalOffersSchema = `
  CREATE TABLE IF NOT EXISTS business_personal_offers (
    id UUID PRIMARY KEY,
    business_user_id TEXT NOT NULL REFERENCES users(id),
    recipient_id TEXT NOT NULL REFERENCES users(id),
    item_id TEXT REFERENCES business_marketplace_items(id),
    wishlist_item_id TEXT REFERENCES wishlist_business_items(id),
    item_title VARCHAR(160) NOT NULL,
    price_rolls BIGINT NOT NULL CHECK (price_rolls BETWEEN 1 AND 1000000),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    idempotency_key UUID NOT NULL,
    purchase_id TEXT UNIQUE REFERENCES roll_store_purchases(id),
    CHECK (business_user_id <> recipient_id),
    CONSTRAINT business_personal_offers_single_item CHECK ((item_id IS NOT NULL)::int + (wishlist_item_id IS NOT NULL)::int = 1),
    CHECK (expires_at > created_at),
    UNIQUE (business_user_id, idempotency_key)
  );
  CREATE INDEX IF NOT EXISTS idx_personal_offers_recipient
    ON business_personal_offers(recipient_id, created_at DESC);
`;

export const createPersonalOfferSchema = z.object({
  itemId: z.string().trim().min(1).max(200),
  itemSource: z.enum(["marketplace", "wishlist"]).default("marketplace"),
  recipientId: z.string().trim().min(1).max(200),
  priceRolls: z.number().int().min(1).max(1000000),
  durationHours: z.number().int().min(1).max(720),
  idempotencyKey: z.string().uuid(),
}).strict();

export const personalOfferItemSchema = z.object({
  title: z.string().trim().min(1).max(160),
  priceRolls: z.number().int().min(1).max(1000000),
  description: z.string().trim().max(1200).default(""),
  sphere: z.enum([...BUSINESS_OFFER_SPHERES, "contacts"]),
  itemType: z.enum(["product", "service"]),
  idempotencyKey: z.string().uuid(),
}).strict();

export const personalOfferListSchema = z.object({
  offset: z.coerce.number().int().min(0).max(1000000).default(0),
  sphere: z.enum(BUSINESS_OFFER_SPHERES).optional(),
}).strict();

export async function createPersonalOfferItem(client, businessId, input) {
  const parsed = personalOfferItemSchema.safeParse(input);
  if (!parsed.success) throw new RollsError("Проверьте название, описание и сферу товара", "INVALID_ITEM");
  const data = parsed.data;
  const owner = await client.query("SELECT * FROM users WHERE id=$1 AND account_type='business' FOR UPDATE", [businessId]);
  if (!owner.rowCount) throw new RollsError("Нужен бизнес-аккаунт", "BUSINESS_REQUIRED", 403);
  if (!canBusinessAccessSection({ ...owner.rows[0], account_type: "business" }, data.sphere, SPHERE_SECTIONS[data.sphere]?.[0])) throw new RollsError("Сфера недоступна для вашей категории бизнеса", "BUSINESS_SCOPE_REQUIRED", 403);
  // Namespace the request UUID: no new columns or changes to the item table.
  const id = `personal-offer-item:${data.idempotencyKey}`;
  const previous = await client.query("SELECT * FROM business_marketplace_items WHERE id=$1", [id]);
  if (previous.rowCount) {
    const row = previous.rows[0];
    if (row.business_user_id !== businessId || row.title !== data.title || row.description !== data.description || row.sphere !== data.sphere || row.item_type !== data.itemType || Number(row.price_rolls) !== data.priceRolls) throw new RollsError("Ключ уже использован для другого товара", "IDEMPOTENCY_CONFLICT", 409);
    return { id, replayed: true };
  }
  await client.query(`INSERT INTO business_marketplace_items (id,business_user_id,title,description,sphere,item_type,kind,price_rolls)
    VALUES ($1,$2,$3,$4,$5,$6,'store',$7)`, [id, businessId, data.title, data.description, data.sphere, data.itemType, data.priceRolls]);
  return { id, replayed: false };
}

function personalOfferItemAllowed(business, item, wishlist) {
  return wishlist ? canManageWishlistSpace(business, item.space)
    : canBusinessAccessSection(business, item.sphere, SPHERE_SECTIONS[item.sphere]?.[0]);
}

async function lockPersonalOfferItem(client, businessId, itemId, wishlist) {
  const sql = wishlist ? `
    SELECT i.id,i.title,i.space FROM wishlist_business_items i
    JOIN wishlist_business_pages p ON p.business_user_id=i.business_user_id AND p.space=i.space
    WHERE i.id=$1 AND i.business_user_id=$2 AND i.active AND p.published FOR SHARE OF i,p`
    : "SELECT id,title,sphere FROM business_marketplace_items WHERE id=$1 AND business_user_id=$2 AND active=TRUE FOR SHARE";
  const { rows: [item] } = await client.query(sql, [itemId, businessId]);
  return item;
}

async function lockPersonalOfferConsent(client, recipientId, businessId, wishlistSpace) {
  const subscription = await client.query("SELECT 1 FROM follows WHERE follower_id=$1 AND following_id=$2 FOR SHARE", [recipientId, businessId]);
  if (subscription.rowCount) return true;
  if (!wishlistSpace) return false;
  const grants = await client.query(`SELECT 1 FROM sphere_section_shares
    WHERE owner_user_id=$1 AND viewer_user_id=$2 AND sphere='wishlist' AND section IN ($3,'wishlist')
    ORDER BY section FOR SHARE`, [recipientId, businessId, wishlistSpace]);
  return grants.rowCount > 0;
}

async function lockPersonalOfferPaymentAccess(client, offer, recipientId) {
  // The follow mutation locks the buyer before touching the relationship.
  // Acquire both account locks before item and consent locks so an unfollow
  // cannot slip between the availability check and the transfer.
  const { rows: users } = await client.query(`SELECT id,account_type,business_category,seller_space
    FROM users WHERE id=ANY($1::text[]) ORDER BY id FOR SHARE`, [[recipientId, offer.business_user_id]]);
  const business = users.find((user) => user.id === offer.business_user_id);
  const wishlist = Boolean(offer.wishlist_item_id);
  const item = await lockPersonalOfferItem(client, offer.business_user_id, offer.wishlist_item_id || offer.item_id, wishlist);
  if (!business || !item || !personalOfferItemAllowed(business, item, wishlist) ||
      !await lockPersonalOfferConsent(client, recipientId, business.id, wishlist && item.space)) {
    throw new RollsError("Предложение больше недоступно", "OFFER_ACCESS_REVOKED", 403);
  }
}

function readPersonalOfferAvailability(row) {
  const wishlist = Boolean(row.wishlist_item_id);
  return Boolean(row.current_item_id && row.current_item_live && (row.subscribed || (wishlist && row.wishlist_consent)) &&
    personalOfferItemAllowed(row, { space: row.current_space, sphere: row.current_sphere }, wishlist));
}

export function personalOfferStatus(row, available = true) {
  return row.refunded_at ? "refunded" : row.purchase_id ? "paid" : row.expired ? "expired"
    : available ? "active" : "unavailable";
}

export function personalOfferFromRow(row) {
  return { id: row.id, itemId: row.wishlist_item_id || row.item_id, itemSource: row.wishlist_item_id ? "wishlist" : "marketplace", title: row.item_title,
    priceRolls: Number(row.price_rolls), expiresAt: row.expires_at,
    createdAt: row.created_at, purchaseId: row.purchase_id,
    status: personalOfferStatus(row, readPersonalOfferAvailability(row)),
    business: { id: row.business_user_id, name: row.business_name },
    recipient: { id: row.recipient_id, name: row.recipient_name } };
}

export async function createPersonalOffer(client, businessId, input) {
  const parsed = createPersonalOfferSchema.safeParse(input);
  if (!parsed.success) throw new RollsError("Укажите получателя, цену и срок от 1 часа до 30 дней", "INVALID_OFFER");
  const data = parsed.data;
  if (businessId === data.recipientId) throw new RollsError("Нельзя выставить счёт себе", "SELF_OFFER");
  // Serialize retries before checking the key, including across server processes.
  const owner = await client.query("SELECT * FROM users WHERE id=$1 AND account_type='business' FOR UPDATE", [businessId]);
  if (!owner.rowCount) throw new RollsError("Нужен бизнес-аккаунт", "BUSINESS_REQUIRED", 403);
  const previous = await client.query("SELECT *, EXTRACT(EPOCH FROM (expires_at-created_at))/3600 AS duration_hours FROM business_personal_offers WHERE business_user_id=$1 AND idempotency_key=$2", [businessId, data.idempotencyKey]);
  if (previous.rowCount) {
    const row = previous.rows[0];
    if ((data.itemSource === "wishlist" ? row.wishlist_item_id : row.item_id) !== data.itemId || row.recipient_id !== data.recipientId || Number(row.price_rolls) !== data.priceRolls || Number(row.duration_hours) !== data.durationHours) {
      throw new RollsError("Ключ уже использован для другого оффера", "IDEMPOTENCY_CONFLICT", 409);
    }
    return { id: row.id, replayed: true };
  }
  const wishlist = data.itemSource === "wishlist";
  const item = await lockPersonalOfferItem(client, businessId, data.itemId, wishlist);
  if (!item) throw new RollsError("Выберите свой доступный товар", "PRODUCT_NOT_FOUND", 404);
  if (!personalOfferItemAllowed(owner.rows[0], item, wishlist)) {
    throw new RollsError(wishlist ? "Нет доступа к пространству продавца" : "Сфера недоступна для вашей категории бизнеса", "BUSINESS_SCOPE_REQUIRED", 403);
  }
  const recipient = await client.query("SELECT id FROM users WHERE id=$1 AND account_type='personal'", [data.recipientId]);
  if (!recipient.rowCount) throw new RollsError("Пользователь не найден", "RECIPIENT_NOT_FOUND", 404);
  if (!await lockPersonalOfferConsent(client, data.recipientId, businessId, wishlist && item.space)) {
    throw new RollsError("Получатель не подписан на ваш бизнес", "OFFER_CONSENT_REQUIRED", 403);
  }
  const id = randomUUID();
  await client.query(`INSERT INTO business_personal_offers
    (id,business_user_id,recipient_id,item_id,item_title,price_rolls,created_at,expires_at,idempotency_key,wishlist_item_id)
    SELECT $1,$2,$3,$4,$5,$6,t,t+($7 * INTERVAL '1 hour'),$8,$9 FROM (SELECT clock_timestamp() AS t) now`,
  [id, businessId, data.recipientId, wishlist ? null : data.itemId, item.title, data.priceRolls, data.durationHours, data.idempotencyKey, wishlist ? data.itemId : null]);
  return { id, replayed: false };
}

export async function payPersonalOffer(client, recipientId, offerId, { expectedPriceRolls } = {}) {
  if (!z.string().uuid().safeParse(offerId).success) throw new RollsError("Счёт не найден", "OFFER_NOT_FOUND", 404);
  const result = await client.query("SELECT * FROM business_personal_offers WHERE id=$1 AND recipient_id=$2 FOR UPDATE", [offerId, recipientId]);
  if (!result.rowCount) throw new RollsError("Счёт не найден", "OFFER_NOT_FOUND", 404);
  const offer = result.rows[0];
  requirePersonalOfferPrice(offer.price_rolls, expectedPriceRolls);
  if (offer.purchase_id) {
    const recorded = await readPersonalOfferOperation(client, recipientId, { id: offerId, action: "pay" });
    return { id: recorded.id, replayed: true, ...(recorded.refundedAt && { refundedAt: recorded.refundedAt }) };
  }
  const checkExpiry = async () => {
    const valid = await client.query("SELECT id FROM business_personal_offers WHERE id=$1 AND expires_at > clock_timestamp()", [offerId]);
    if (!valid.rowCount) throw new RollsError("Срок оффера истёк", "OFFER_EXPIRED", 409);
  };
  await checkExpiry();
  await lockPersonalOfferPaymentAccess(client, offer, recipientId);
  // Acquire both wallet locks before the final expiry check; clock_timestamp
  // must observe time spent waiting, rather than the transaction start time.
  const payment = await transferPersonalOfferRolls(client, recipientId, {
    recipientId: offer.business_user_id, priceRolls: Number(offer.price_rolls), title: offer.item_title, offerId: offer.id,
  });
  await checkExpiry();
  const id = randomUUID();
  const delivery = {
    provider: "business", personalOfferId: offer.id, paymentTransactionId: payment.id,
    marketplaceItemId: offer.item_id, wishlistItemId: offer.wishlist_item_id, business: { id: offer.business_user_id },
  };
  await client.query(`INSERT INTO roll_store_purchases
    (id,user_id,product_id,product_title,amount,idempotency_key,delivery)
    VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`, [id, recipientId, `offer:${offer.id}`, offer.item_title,
    Number(offer.price_rolls), offer.id, JSON.stringify(delivery)]);
  await client.query("UPDATE business_personal_offers SET purchase_id=$2 WHERE id=$1", [offerId, id]);
  return { id, replayed: false };
}

export function registerPersonalOfferRoutes(app, { requireAuth, query, transaction }) {
  const statusLimit = createRateLimit({ windowMs: 60_000, max: 60, key: (req) => req.user.id });
  const handle = (fn) => (req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    return Promise.resolve(fn(req, res)).catch(error => {
      if (error instanceof RollsError) return res.status(error.status).json({ error: error.message, code: error.code });
      if (error.code === "42P01") return res.status(503).json({ error: "Персональные офферы пока недоступны", code: "OFFERS_UNAVAILABLE" });
      return next(error);
    });
  };
  app.post("/api/personal-offers/items", requireAuth, handle(async (req, res) => {
    const item = await transaction(client => createPersonalOfferItem(client, req.user.id, req.body));
    res.status(item.replayed ? 200 : 201).json({ item });
  }));
  app.get("/api/personal-offers/items", requireAuth, handle(async (req, res) => {
    if (req.user.account_type !== "business") throw new RollsError("Нужен бизнес-аккаунт", "BUSINESS_REQUIRED", 403);
    const result = await query("SELECT id,title,price_rolls FROM business_marketplace_items WHERE business_user_id=$1 AND active=TRUE ORDER BY title,id", [req.user.id]);
    res.set("Cache-Control", "private, no-store").json({ items: result.rows.map(row => ({ id: row.id, title: row.title, priceRolls: row.price_rolls == null ? null : Number(row.price_rolls) })) });
  }));
  app.get("/api/personal-offers/recipients", requireAuth, handle(async (req, res) => {
    if (req.user.account_type !== "business") throw new RollsError("Нужен бизнес-аккаунт", "BUSINESS_REQUIRED", 403);
    const search = String(req.query.search || "").trim().slice(0, 80).toLowerCase();
    const { rows } = await query(`SELECT u.id,u.name,u.username FROM follows f
      JOIN users u ON u.id=f.follower_id AND u.account_type='personal'
      WHERE f.following_id=$1 AND ($2='' OR strpos(lower(u.name),$2)>0 OR strpos(lower(u.username),$2)>0)
      ORDER BY lower(u.name),u.username LIMIT 50`, [req.user.id, search]);
    res.json({ people: rows });
  }));
  app.get("/api/personal-offers", requireAuth, handle(async (req, res) => {
    const parsed = personalOfferListSchema.safeParse(req.query);
    if (!parsed.success) throw new RollsError("Проверьте параметры списка счетов", "INVALID_OFFER_PAGE");
    const { offset, sphere } = parsed.data;
    const result = await query(`SELECT o.*,b.name AS business_name,r.name AS recipient_name,b.account_type,b.business_category,b.seller_space,
      o.expires_at <= clock_timestamp() AS expired,p.refunded_at,
      COALESCE(i.id,w.id) AS current_item_id,i.sphere AS current_sphere,w.space AS current_space,
      CASE WHEN o.wishlist_item_id IS NULL THEN i.active ELSE w.active AND storefront.published END AS current_item_live,
      EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=o.recipient_id AND f.following_id=o.business_user_id) AS subscribed,
      EXISTS(SELECT 1 FROM sphere_section_shares s WHERE s.owner_user_id=o.recipient_id AND s.viewer_user_id=o.business_user_id
        AND s.sphere='wishlist' AND s.section IN (w.space,'wishlist')) AS wishlist_consent
      FROM business_personal_offers o
      JOIN users b ON b.id=o.business_user_id JOIN users r ON r.id=o.recipient_id
      LEFT JOIN business_marketplace_items i ON i.id=o.item_id AND i.business_user_id=o.business_user_id
      LEFT JOIN wishlist_business_items w ON w.id=o.wishlist_item_id AND w.business_user_id=o.business_user_id
      LEFT JOIN wishlist_business_pages storefront ON storefront.business_user_id=w.business_user_id AND storefront.space=w.space
      LEFT JOIN roll_store_purchases p ON p.id=o.purchase_id
      WHERE (o.recipient_id=$1 OR o.business_user_id=$1)
        AND ($3::text IS NULL OR i.sphere=$3 OR ($3='career' AND i.sphere='contacts'))
      ORDER BY o.created_at DESC,o.id DESC LIMIT 101 OFFSET $2`, [req.user.id, offset, sphere ?? null]);
    res.json({ offers: result.rows.slice(0, 100).map(personalOfferFromRow), nextOffset: result.rows.length > 100 ? offset + 100 : null });
  }));
  app.post("/api/personal-offers", requireAuth, handle(async (req, res) => {
    const offer = await transaction((client) => createPersonalOffer(client, req.user.id, req.body));
    res.status(offer.replayed ? 200 : 201).json({ offer });
  }));
  app.get("/api/personal-offers/:id/:action/status", requireAuth, statusLimit, handle(async (req, res) => {
    const purchase = await transaction(async (client) => {
      await client.query("SET TRANSACTION READ ONLY");
      return readPersonalOfferOperation(client, req.user.id, req.params);
    });
    res.json({ purchase });
  }));
  app.post("/api/personal-offers/:id/pay", requireAuth, handle(async (req, res) => {
    const purchase = await transaction((client) => payPersonalOffer(client, req.user.id, req.params.id, readPersonalOfferTerms(req.body)));
    res.status(purchase.replayed ? 200 : 201).json({ purchase });
  }));
  app.post("/api/personal-offers/:id/refund", requireAuth, handle(async (req, res) => {
    const purchase = await transaction((client) => refundPersonalOffer(client, req.user.id, req.params.id, readPersonalOfferTerms(req.body)));
    res.json({ purchase });
  }));
}
