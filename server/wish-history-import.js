import { randomUUID } from "node:crypto";
import { z } from "zod";
import { PURCHASE_CURRENCIES, PURCHASE_HISTORY_MAX_ITEMS, PURCHASE_MAX_PRICE, purchaseTitleKey } from "../shared/purchase-history.js";

const wishHistoryImportSchema = z.strictObject({
  listId: z.string().min(1).max(128).nullable(),
  space: z.enum(["products", "food"]),
  items: z.array(z.strictObject({
    title: z.string().trim().min(1).max(160),
    price: z.number().min(0).max(PURCHASE_MAX_PRICE).nullable(),
    currency: z.enum(PURCHASE_CURRENCIES),
  })).min(1).max(PURCHASE_HISTORY_MAX_ITEMS),
});

// The caller owns the transaction. Its advisory lock also serializes retries
// across processes, so a lost response cannot create a second set of cards.
async function importWishHistory(client, userId, { listId, space, items }) {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`wish-history:${userId}`]);
  if (listId) {
    const owned = await client.query(
      `SELECT id FROM wishlists
       WHERE id=$1 AND user_id=$2 AND COALESCE(space,'products')=$3
         AND NOT (title='Мои желания' AND description='Всё, чему я буду рад')
       FOR UPDATE`,
      [listId, userId, space],
    );
    if (!owned.rowCount) return null;
  }
  const existing = listId
    ? await client.query(
      `SELECT w.title FROM wishes w JOIN wishlist_wishes ww ON ww.wish_id=w.id
       WHERE w.user_id=$1 AND w.status='active' AND ww.wishlist_id=$2`, [userId, listId],
    )
    : await client.query(
      `SELECT w.title FROM wishes w
       WHERE w.user_id=$1 AND w.status='active' AND COALESCE(w.space,'products')=$2
         AND NOT EXISTS (
           SELECT 1 FROM wishlist_wishes ww JOIN wishlists l ON l.id=ww.wishlist_id
           WHERE ww.wish_id=w.id AND NOT (l.title='Мои желания' AND l.description='Всё, чему я буду рад')
         )`, [userId, space],
    );
  const seen = new Set(existing.rows.map((row) => purchaseTitleKey(row.title)));
  const created = [];
  for (const item of items) {
    const key = purchaseTitleKey(item.title);
    if (seen.has(key)) continue;
    seen.add(key);
    created.push({ ...item, id: randomUUID() });
  }
  if (created.length) {
    await client.query(
      `INSERT INTO wishes (id,user_id,title,price,currency,privacy,space)
       SELECT id,$1,title,price,currency,'private',$3
       FROM jsonb_to_recordset($2::jsonb) AS item(id text,title text,price numeric,currency text)`,
      [userId, JSON.stringify(created), space],
    );
    if (listId) {
      await client.query(
        "INSERT INTO wishlist_wishes (wishlist_id,wish_id) SELECT $1, unnest($2::text[])",
        [listId, created.map(({ id }) => id)],
      );
    }
  }
  return { created: created.length, skipped: items.length - created.length };
}

export function registerWishHistoryImport(app, { requireAuth, asyncRoute, transaction }) {
  app.post("/api/wishes/import-history", requireAuth, asyncRoute(async (req, res) => {
    const parsed = wishHistoryImportSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Проверьте список и названия выбранных товаров" });
    const result = await transaction((client) => importWishHistory(client, req.user.id, parsed.data));
    if (!result) return res.status(404).json({ error: "Список для импорта больше недоступен" });
    res.status(result.created ? 201 : 200).json(result);
  }));
}
