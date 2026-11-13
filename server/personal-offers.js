import { randomUUID } from "node:crypto";
import { z } from "zod";
import { RollsError, transferRolls } from "./rolls.js";
import { canManageWishlistSpace } from "../shared/wishlist-business.js";
import { BUSINESS_OFFER_SPHERES, canBusinessAccessSection } from "../shared/business-accounts.js";
import { SPHERE_SECTIONS } from "../shared/sphere-sharing.js";

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

export function personalOfferFromRow(row) {
  return { id: row.id, itemId: row.wishlist_item_id || row.item_id, itemSource: row.wishlist_item_id ? "wishlist" : "marketplace", title: row.item_title,
    priceRolls: Number(row.price_rolls), expiresAt: row.expires_at,
    createdAt: row.created_at, purchaseId: row.purchase_id,
    status: row.purchase_id ? "paid" : row.expired ? "expired" : "active",
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
  const item = wishlist
    ? await client.query(`SELECT i.id,i.title,i.space FROM wishlist_business_items i JOIN wishlist_business_pages p ON p.business_user_id=i.business_user_id AND p.space=i.space WHERE i.id=$1 AND i.business_user_id=$2 AND i.active AND p.published FOR SHARE OF i,p`, [data.itemId,businessId])
    : await client.query("SELECT id,title,sphere FROM business_marketplace_items WHERE id=$1 AND business_user_id=$2 AND active=TRUE FOR SHARE", [data.itemId, businessId]);
  if (!item.rowCount) throw new RollsError("Выберите свой доступный товар", "PRODUCT_NOT_FOUND", 404);
  if (wishlist) {
    if (!canManageWishlistSpace(owner.rows[0], item.rows[0].space)) throw new RollsError("Нет доступа к пространству продавца", "BUSINESS_SCOPE_REQUIRED", 403);
  } else if (!canBusinessAccessSection(owner.rows[0], item.rows[0].sphere, SPHERE_SECTIONS[item.rows[0].sphere]?.[0])) throw new RollsError("Сфера недоступна для вашей категории бизнеса", "BUSINESS_SCOPE_REQUIRED", 403);
  const recipient = await client.query("SELECT id FROM users WHERE id=$1 AND account_type='personal'", [data.recipientId]);
  if (!recipient.rowCount) throw new RollsError("Пользователь не найден", "RECIPIENT_NOT_FOUND", 404);
  const subscription = await client.query("SELECT 1 FROM follows WHERE follower_id=$1 AND following_id=$2 FOR SHARE", [data.recipientId, businessId]);
  if (!subscription.rowCount) {
    const grant = wishlist && await client.query(`SELECT 1 FROM sphere_section_shares
      WHERE owner_user_id=$1 AND viewer_user_id=$2 AND sphere='wishlist' AND section IN ($3,'wishlist') FOR SHARE`,
    [data.recipientId, businessId, item.rows[0].space]);
    if (!grant?.rowCount) throw new RollsError("Получатель не подписан на ваш бизнес", "OFFER_CONSENT_REQUIRED", 403);
  }
  const id = randomUUID();
  await client.query(`INSERT INTO business_personal_offers
    (id,business_user_id,recipient_id,item_id,item_title,price_rolls,created_at,expires_at,idempotency_key,wishlist_item_id)
    SELECT $1,$2,$3,$4,$5,$6,t,t+($7 * INTERVAL '1 hour'),$8,$9 FROM (SELECT clock_timestamp() AS t) now`,
  [id, businessId, data.recipientId, wishlist ? null : data.itemId, item.rows[0].title, data.priceRolls, data.durationHours, data.idempotencyKey, wishlist ? data.itemId : null]);
  return { id, replayed: false };
}

export async function payPersonalOffer(client, recipientId, offerId) {
  if (!z.string().uuid().safeParse(offerId).success) throw new RollsError("Счёт не найден", "OFFER_NOT_FOUND", 404);
  const result = await client.query("SELECT * FROM business_personal_offers WHERE id=$1 AND recipient_id=$2 FOR UPDATE", [offerId, recipientId]);
  if (!result.rowCount) throw new RollsError("Счёт не найден", "OFFER_NOT_FOUND", 404);
  const offer = result.rows[0];
  if (offer.purchase_id) return { id: offer.purchase_id, replayed: true };
  const checkExpiry = async () => {
    const valid = await client.query("SELECT id FROM business_personal_offers WHERE id=$1 AND expires_at > clock_timestamp()", [offerId]);
    if (!valid.rowCount) throw new RollsError("Срок оффера истёк", "OFFER_EXPIRED", 409);
  };
  if (offer.wishlist_item_id) {
    const accessible=await client.query(`SELECT i.id FROM wishlist_business_items i JOIN wishlist_business_pages p ON p.business_user_id=i.business_user_id AND p.space=i.space JOIN users u ON u.id=i.business_user_id WHERE i.id=$1 AND i.business_user_id=$2 AND i.active AND p.published AND u.account_type='business' AND u.business_category='seller' AND (u.seller_space IS NULL OR u.seller_space=i.space)
      AND (EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=$3 AND f.following_id=u.id)
        OR EXISTS(SELECT 1 FROM sphere_section_shares s WHERE s.owner_user_id=$3 AND s.viewer_user_id=u.id AND s.sphere='wishlist' AND s.section IN (i.space,'wishlist')))
      FOR SHARE OF i,p,u`,[offer.wishlist_item_id,offer.business_user_id,recipientId]);
    if(!accessible.rowCount) throw new RollsError("Предложение больше недоступно", "OFFER_ACCESS_REVOKED", 403);
  }
  await checkExpiry();
  // Acquire both wallet locks before the final expiry check; clock_timestamp
  // must observe time spent waiting, rather than the transaction start time.
  await transferRolls(client, recipientId, { recipientId: offer.business_user_id,
    amount: Number(offer.price_rolls), note: `Оффер: ${offer.item_title}`, idempotencyKey: offer.id });
  await checkExpiry();
  const id = randomUUID();
  await client.query(`INSERT INTO roll_store_purchases
    (id,user_id,product_id,product_title,amount,idempotency_key,delivery)
    VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`, [id, recipientId, `offer:${offer.id}`, offer.item_title,
    Number(offer.price_rolls), offer.id, JSON.stringify({ provider: "business", personalOfferId: offer.id, marketplaceItemId: offer.item_id, wishlistItemId: offer.wishlist_item_id, business: { id: offer.business_user_id } })]);
  await client.query("UPDATE business_personal_offers SET purchase_id=$2 WHERE id=$1", [offerId, id]);
  return { id, replayed: false };
}

export function registerPersonalOfferRoutes(app, { requireAuth, query, transaction }) {
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
    const result = await query(`SELECT o.*,b.name AS business_name,r.name AS recipient_name,
      o.expires_at <= clock_timestamp() AS expired FROM business_personal_offers o
      JOIN users b ON b.id=o.business_user_id JOIN users r ON r.id=o.recipient_id
      LEFT JOIN business_marketplace_items i ON i.id=o.item_id
      WHERE (o.recipient_id=$1 OR o.business_user_id=$1)
        AND ($3::text IS NULL OR i.sphere=$3 OR ($3='career' AND i.sphere='contacts'))
      ORDER BY o.created_at DESC,o.id DESC LIMIT 101 OFFSET $2`, [req.user.id, offset, sphere ?? null]);
    res.json({ offers: result.rows.slice(0, 100).map(personalOfferFromRow), nextOffset: result.rows.length > 100 ? offset + 100 : null });
  }));
  app.post("/api/personal-offers", requireAuth, handle(async (req, res) => {
    const offer = await transaction((client) => createPersonalOffer(client, req.user.id, req.body));
    res.status(offer.replayed ? 200 : 201).json({ offer });
  }));
  app.post("/api/personal-offers/:id/pay", requireAuth, handle(async (req, res) => {
    const purchase = await transaction((client) => payPersonalOffer(client, req.user.id, req.params.id));
    res.status(purchase.replayed ? 200 : 201).json({ purchase });
  }));
}
