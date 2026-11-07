import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { createPersonalOffer } from "./personal-offers.js";
import { RollsError } from "./rolls.js";
import { WISHLIST_SPACE_IDS, canManageWishSales, canManageWishlistSpace } from "../shared/wishlist-business.js";

const spacesSql = WISHLIST_SPACE_IDS.map(id => `'${id}'`).join(",");
// Explicit additive migration only; never invoked by runtime startup.
export const wishlistBusinessSchema = `
ALTER TABLE users ADD COLUMN IF NOT EXISTS seller_space TEXT CHECK (seller_space IS NULL OR (account_type='business' AND business_category='seller' AND seller_space IN (${spacesSql})));
CREATE TABLE IF NOT EXISTS wishlist_business_pages (
 business_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 space TEXT NOT NULL CHECK (space IN (${spacesSql})),
 title VARCHAR(160) NOT NULL, description VARCHAR(4000) NOT NULL DEFAULT '',
 published BOOLEAN NOT NULL DEFAULT FALSE, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(business_user_id,space)
);
CREATE TABLE IF NOT EXISTS wishlist_business_items (
 id TEXT PRIMARY KEY, business_user_id TEXT NOT NULL, space TEXT NOT NULL,
 title VARCHAR(160) NOT NULL, description VARCHAR(4000) NOT NULL DEFAULT '',
 brand VARCHAR(100) NOT NULL DEFAULT '', image_url TEXT NOT NULL DEFAULT '', action_url TEXT NOT NULL DEFAULT '',
 price VARCHAR(80) NOT NULL DEFAULT '', active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(business_user_id,space) REFERENCES wishlist_business_pages(business_user_id,space) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS wishlist_business_items_space ON wishlist_business_items(space,business_user_id,active,created_at DESC);
CREATE TABLE IF NOT EXISTS wishlist_business_offers (
 id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES wishlist_business_items(id) ON DELETE CASCADE,
 buyer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 dismissed BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(item_id,buyer_user_id)
);
CREATE INDEX IF NOT EXISTS wishlist_business_offers_buyer ON wishlist_business_offers(buyer_user_id,created_at DESC);
`;
const spaceSchema = z.enum(WISHLIST_SPACE_IDS);
const pageSchema = z.object({ title: z.string().trim().min(1).max(160), description: z.string().trim().max(4000).default(""), published: z.boolean() }).strict();
const webUrl = z.union([z.literal(""), z.string().url().max(2000).refine(value => /^https?:\/\//i.test(value))]);
const uploadedImage = z.string().regex(/^\/api\/media\/[0-9a-f-]{36}$/i);
const itemSchema = z.object({
 title: z.string().trim().min(1).max(160), description: z.string().trim().max(4000).default(""),
 brand: z.string().trim().max(100).default(""), imageUrl: z.union([z.literal(""), uploadedImage]).default(""),
 actionUrl: webUrl.default(""), price: z.string().trim().max(80).default(""), active: z.boolean().default(true),
}).strict();
const createItemSchema = itemSchema.extend({ requestId: z.uuid().optional() });
const wishIdSchema = z.string().min(1).max(200);
const saleItemSchema = itemSchema.extend({ wishId: wishIdSchema, active: z.boolean() });
const wishSalePrefix = "wish-sale:";
const saleIdForWish = (wishId) => wishSalePrefix + createHash("sha256").update(wishId).digest("hex");
const wishSale = `starts_with(i.id, '${wishSalePrefix}')`;
const personalSale = `(u.account_type='personal' AND ${wishSale})`;
const consent = `EXISTS (SELECT 1 FROM sphere_section_shares s WHERE s.owner_user_id=o.buyer_user_id AND s.viewer_user_id=i.business_user_id AND s.sphere='wishlist' AND s.section IN (i.space,'wishlist'))`;
const eligible = `u.account_type='business' AND u.business_category='seller' AND (u.seller_space IS NULL OR u.seller_space=i.space)`;
const itemSelect = `SELECT i.*,u.name AS business_name,u.username AS business_username,p.title AS page_title,${personalSale} AS personal_sale FROM wishlist_business_items i JOIN wishlist_business_pages p ON p.business_user_id=i.business_user_id AND p.space=i.space JOIN users u ON u.id=i.business_user_id`;
const clean = row => ({ id: row.id, space: row.space, title: row.title, description: row.description, brand: row.brand, imageUrl: row.image_url, actionUrl: row.action_url, price: row.price, active: row.active, offerId: row.offer_id, personalSale: row.personal_sale, business: { id: row.business_user_id, name: row.business_name, username: row.business_username, pageTitle: row.page_title } });
const fail = (res, status, error) => res.status(status).json({ error });

async function readSaleSource(query, wishId, userId, space, lock = false) {
  const { rows } = await query(
    `SELECT w.title,w.description,w.image_url
     FROM wishes w
     WHERE w.id=$1 AND w.user_id=$2 AND w.status='fulfilled'
       AND (w.space=$3 OR (w.space IS NULL AND (
         EXISTS (SELECT 1 FROM wishlist_wishes ww JOIN wishlists l ON l.id=ww.wishlist_id
                 WHERE ww.wish_id=w.id AND l.user_id=w.user_id AND l.space=$3)
         OR ($3='products' AND NOT EXISTS (
           SELECT 1 FROM wishlist_wishes ww JOIN wishlists l ON l.id=ww.wishlist_id
           WHERE ww.wish_id=w.id AND l.user_id=w.user_id))
       ))) ${lock ? "FOR SHARE OF w" : ""}`,
    [wishId, userId, space],
  );
  return rows[0];
}

async function ownsItemImage(query, imageUrl, userId) {
  if (!imageUrl) return true;
  const result = await query("SELECT 1 FROM wish_images WHERE id=$1 AND user_id=$2", [imageUrl.split("/").at(-1), userId]);
  return Boolean(result.rowCount);
}

export function registerWishlistBusinessRoutes(app, { requireAuth, query, transaction }) {
 const route = fn => (req,res,next) => Promise.resolve(fn(req,res)).catch(error=>error instanceof RollsError?res.status(error.status).json({error:error.message,code:error.code}):next(error));
 const scope = (req,res,next) => {
   if (!spaceSchema.safeParse(req.params.space).success) return fail(res,404,"Пространство не найдено");
   res.set("Cache-Control","private, no-store"); next();
 };
 const seller = (req,res,next) => canManageWishlistSpace(req.user,req.params.space) ? next() : fail(res,403,"Раздел недоступен для вашей категории бизнеса");
 const saleOwner = (req,res,next) => canManageWishSales(req.user,req.params.space) ? next() : fail(res,403,"Продажи в этом разделе недоступны");
 const base = "/api/wishlist-business/:space";
 app.get(`${base}/accounts`, requireAuth, scope, route(async (req, res) => {
   const { rows } = await query(
     `SELECT u.username, u.name, u.avatar_url AS "avatarUrl", p.title AS "storefrontTitle"
      FROM users u
      LEFT JOIN wishlist_business_pages p ON p.business_user_id=u.id AND p.space=$1 AND p.published
      WHERE u.account_type='business' AND u.business_category='seller'
        AND (u.seller_space=$1 OR (u.seller_space IS NULL AND p.business_user_id IS NOT NULL))
      ORDER BY lower(COALESCE(p.title,u.name)), u.username`,
     [req.params.space],
   );
   res.json({ accounts: rows });
 }));
 app.get(`${base}/profiles/:username`,scope,route(async(req,res) => {
   const username = req.params.username;
   const result = await query(`${itemSelect} WHERE i.space=$1 AND i.active AND p.published AND ${eligible} AND u.username=$2 ORDER BY i.created_at DESC,i.id LIMIT 200`,[req.params.space,username]);
   const pages = await query(`SELECT p.title,p.description,u.username,u.name FROM wishlist_business_pages p JOIN users u ON u.id=p.business_user_id WHERE p.space=$1 AND p.published AND u.account_type='business' AND u.business_category='seller' AND (u.seller_space IS NULL OR u.seller_space=p.space) AND u.username=$2`,[req.params.space,username]);
   res.json({items:result.rows.map(clean),pages:pages.rows});
 }));
 app.get(`${base}/store`,requireAuth,scope,route(async(req,res) => {
   const username = String(req.query.business || "").trim().slice(0,100);
   const result = await query(`${itemSelect} WHERE i.space=$1 AND i.active AND p.published AND ((${eligible} AND ($2='' OR u.username=$2)) OR ($2='' AND ${personalSale})) ORDER BY i.created_at DESC,i.id LIMIT 200`,[req.params.space,username]);
   const pages = await query(`SELECT p.title,p.description,u.username,u.name FROM wishlist_business_pages p JOIN users u ON u.id=p.business_user_id WHERE p.space=$1 AND p.published AND u.account_type='business' AND u.business_category='seller' AND (u.seller_space IS NULL OR u.seller_space=p.space) AND ($2='' OR u.username=$2) ORDER BY p.title LIMIT 200`,[req.params.space,username]);
   res.json({items:result.rows.map(clean),pages:pages.rows});
 }));
 app.get(`${base}/page`,requireAuth,scope,seller,route(async(req,res) => {
   const page = await query("SELECT title,description,published FROM wishlist_business_pages WHERE business_user_id=$1 AND space=$2",[req.user.id,req.params.space]);
   const items = await query(`${itemSelect} WHERE i.business_user_id=$1 AND i.space=$2 ORDER BY i.created_at DESC,i.id`,[req.user.id,req.params.space]);
   res.json({page:page.rows[0] || {title:req.user.name,description:"",published:false},items:items.rows.map(clean)});
 }));
 app.post(`${base}/page`,requireAuth,scope,seller,route(async(req,res) => {
   const parsed=pageSchema.safeParse(req.body); if(!parsed.success) return fail(res,400,"Проверьте название и описание страницы");
   const {title,description,published}=parsed.data;
   await query(`INSERT INTO wishlist_business_pages(business_user_id,space,title,description,published) VALUES($1,$2,$3,$4,$5) ON CONFLICT(business_user_id,space) DO UPDATE SET title=$3,description=$4,published=$5,updated_at=CURRENT_TIMESTAMP`,[req.user.id,req.params.space,title,description,published]);
   res.json({saved:true});
 }));
 app.get(`${base}/sales`, requireAuth, scope, saleOwner, route(async (req, res) => {
   const { space } = req.params;
   const userId = req.user.id;
   const parsed = wishIdSchema.optional().safeParse(req.query.wish);
   if (!parsed.success) return fail(res, 400, "Проверьте ссылку на желание");
   const wishId = parsed.data;
   const saleId = wishId ? saleIdForWish(wishId) : null;
   const result = await query(
     `${itemSelect} WHERE i.business_user_id=$1 AND ${wishSale} AND (i.space=$2 OR i.id=$3)
      ORDER BY i.created_at DESC,i.id`,
     [userId, space, saleId],
   );
   const items = result.rows.filter(row => row.space === space).map(clean);
   let editor = saleId && result.rows.find(row => row.id === saleId);
   if (editor && !canManageWishSales(req.user, editor.space)) return fail(res, 403, "Продажа находится в другом разделе");
   if (editor) editor = clean(editor);
   if (wishId && !editor) {
     const wish = await readSaleSource(query, wishId, userId, space);
     if (!wish) return fail(res, 404, "Исполненное желание не найдено в этом разделе");
     const hasImage = uploadedImage.safeParse(wish.image_url).success && await ownsItemImage(query, wish.image_url, userId);
     editor = { space, title: wish.title.trim().slice(0, 160), description: wish.description.trim().slice(0, 4000), imageUrl: hasImage ? wish.image_url : "", active: false };
   }
   const page = req.user.account_type === "personal" ? null : await query(
     "SELECT published FROM wishlist_business_pages WHERE business_user_id=$1 AND space=$2", [userId, editor?.space || space],
   );
   res.json({ items, editor: editor || null, published: page ? Boolean(page.rows[0]?.published) : true });
 }));
 const saveItem = (sale = false) => route(async (req, res) => {
   const editing = Boolean(req.params.itemId);
   const parsed = (editing ? itemSchema : sale ? saleItemSchema : createItemSchema).safeParse(req.body);
   if (!parsed.success) return fail(res, 400, "Проверьте поля карточки");
   const input = parsed.data;
   const id = req.params.itemId || (sale ? saleIdForWish(input.wishId) : input.requestId || randomUUID());
   if (sale && !id.startsWith(wishSalePrefix)) return fail(res, 404, "Продажа не найдена");
   const personal = sale && req.user.account_type === "personal";
   const itemKey = [id, req.user.id, req.params.space];
   const result = await transaction(async (client) => {
     const readItem = async () => (await client.query(
       `${itemSelect} WHERE i.id=$1 AND i.business_user_id=$2 AND i.space=$3`, itemKey,
     )).rows[0];
     if (input.requestId || (sale && !editing)) {
       const existing = await readItem();
       if (existing) return { item: clean(existing), replayed: true };
     }
     if (sale && !editing && !await readSaleSource(client.query.bind(client), input.wishId, req.user.id, req.params.space, true)) {
       return { error: "Исполненное желание не найдено в этом разделе" };
     }
     if (!await ownsItemImage(client.query.bind(client), input.imageUrl, req.user.id)) return null;
     const params = [...itemKey, input.title, input.description, input.brand, input.imageUrl, input.actionUrl, input.price, input.active];
     if (editing) {
       const updated = await client.query(`UPDATE wishlist_business_items SET title=$4,description=$5,brand=$6,image_url=$7,action_url=$8,price=$9,active=$10,updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND business_user_id=$2 AND space=$3 RETURNING id`, params);
       if (!updated.rowCount) return null;
       return { item: clean(await readItem()), replayed: false };
     }
     await client.query(`INSERT INTO wishlist_business_pages(business_user_id,space,title,published) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [req.user.id, req.params.space, req.user.name, personal]);
     const inserted = await client.query(`INSERT INTO wishlist_business_items(id,business_user_id,space,title,description,brand,image_url,action_url,price,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(id) DO NOTHING RETURNING id`, params);
     const saved = await readItem();
     if (saved) return { item: clean(saved), replayed: !inserted.rowCount };
     if (sale) throw new RollsError("Желание уже добавлено в продажи в другом разделе", "wish_sale_exists", 409);
     return null;
   });
   if (!result) return fail(res, 404, "Карточка или ваше фото не найдены");
   if (result.error) return fail(res, 404, result.error);
   res.status(editing || result.replayed ? 200 : 201).json({ id, ...result });
 });
 app.post(`${base}/items`,requireAuth,scope,seller,saveItem());
 app.patch(`${base}/items/:itemId`,requireAuth,scope,seller,saveItem());
 app.post(`${base}/sales`, requireAuth, scope, saleOwner, saveItem(true));
 app.patch(`${base}/sales/:itemId`, requireAuth, scope, saleOwner, saveItem(true));
 app.get(`${base}/buyers`,requireAuth,scope,seller,route(async(req,res) => {
   const result=await query(`SELECT u.id,u.name,u.username FROM users u WHERE u.account_type='personal' AND EXISTS(SELECT 1 FROM sphere_section_shares s WHERE s.owner_user_id=u.id AND s.viewer_user_id=$1 AND s.sphere='wishlist' AND s.section IN ($2,'wishlist')) ORDER BY u.name,u.id LIMIT 200`,[req.user.id,req.params.space]);
   res.json({buyers:result.rows});
 }));
 app.post(`${base}/items/:itemId/recommend`,requireAuth,scope,seller,route(async(req,res) => {
   const parsed=z.object({buyerId:z.string().min(1).max(100),priceRolls:z.number().int().min(1).max(1000000),durationHours:z.number().int().min(1).max(720),idempotencyKey:z.string().uuid()}).strict().safeParse(req.body);
   if(!parsed.success) return fail(res,400,"Укажите покупателя, цену в роллах и срок действия");
   const result=await transaction(async client => {
     const item=await client.query(`SELECT i.id FROM wishlist_business_items i JOIN wishlist_business_pages p ON p.business_user_id=i.business_user_id AND p.space=i.space WHERE i.id=$1 AND i.business_user_id=$2 AND i.space=$3 AND i.active AND p.published FOR SHARE OF i,p`,[req.params.itemId,req.user.id,req.params.space]);
     if(!item.rowCount) return {status:404,error:"Сначала опубликуйте страницу и айтем"};
     const granted=await client.query(`SELECT s.owner_user_id FROM sphere_section_shares s JOIN users u ON u.id=s.owner_user_id AND u.account_type='personal' WHERE s.owner_user_id=$1 AND s.viewer_user_id=$2 AND s.sphere='wishlist' AND s.section IN ($3,'wishlist') FOR SHARE OF s,u`,[parsed.data.buyerId,req.user.id,req.params.space]);
     if(!granted.rowCount) return {status:403,error:"Покупатель не открыл доступ к этому пространству"};
     const payment=await createPersonalOffer(client,req.user.id,{itemId:req.params.itemId,itemSource:"wishlist",recipientId:parsed.data.buyerId,priceRolls:parsed.data.priceRolls,durationHours:parsed.data.durationHours,idempotencyKey:parsed.data.idempotencyKey});
     const saved=await client.query(`INSERT INTO wishlist_business_offers(id,item_id,buyer_user_id) VALUES($1,$2,$3) ON CONFLICT(item_id,buyer_user_id) DO NOTHING RETURNING id`,[randomUUID(),req.params.itemId,parsed.data.buyerId]);
     return {sent:true,alreadySent:payment.replayed,personalOfferId:payment.id};
   });
   if(result.error) return fail(res,result.status,result.error); res.json(result);
 }));
 app.get(`${base}/offers`,requireAuth,scope,route(async(req,res) => {
   const result=await query(`${itemSelect.replace("SELECT i.*", "SELECT i.*,o.id AS offer_id")} JOIN wishlist_business_offers o ON o.item_id=i.id WHERE o.buyer_user_id=$1 AND i.space=$2 AND NOT o.dismissed AND i.active AND p.published AND ${eligible} AND ${consent} ORDER BY o.created_at DESC,o.id LIMIT 200`,[req.user.id,req.params.space]);
   const ids=result.rows.map(row=>row.id);
   const invoices=ids.length?await query(`SELECT DISTINCT ON (wishlist_item_id) id,wishlist_item_id,item_title,price_rolls,expires_at,purchase_id,expires_at<=clock_timestamp() AS expired FROM business_personal_offers WHERE recipient_id=$1 AND wishlist_item_id=ANY($2::text[]) ORDER BY wishlist_item_id,created_at DESC,id DESC`,[req.user.id,ids]):{rows:[]};
   const byItem=new Map(invoices.rows.map(row=>[row.wishlist_item_id,row]));
   res.json({items:result.rows.map(row=>{const invoice=byItem.get(row.id);return {...clean(row),title:invoice?.item_title||row.title,personalOffer:invoice?{id:invoice.id,title:invoice.item_title,priceRolls:Number(invoice.price_rolls),expiresAt:invoice.expires_at,status:invoice.purchase_id?"paid":invoice.expired?"expired":"active",business:{id:row.business_user_id,name:row.business_name}}:null};})});
 }));
 app.delete(`${base}/offers/:offerId`,requireAuth,scope,route(async(req,res) => {
   await query(`UPDATE wishlist_business_offers o SET dismissed=TRUE FROM wishlist_business_items i WHERE o.id=$1 AND o.buyer_user_id=$2 AND i.id=o.item_id AND i.space=$3`,[req.params.offerId,req.user.id,req.params.space]);
   res.json({dismissed:true});
 }));
}
