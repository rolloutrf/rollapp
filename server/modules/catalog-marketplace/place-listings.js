import { z } from "zod";
import { WISHLIST_SPACE_IDS } from "../../../shared/modules/wishlist/wishlist-business.js";

const spacesSql = WISHLIST_SPACE_IDS.map(id => `'${id}'`).join(",");
// Explicit additive migration only; never invoked by runtime startup.
export const placeListingsSchema = `
CREATE TABLE IF NOT EXISTS place_listings (
 id TEXT PRIMARY KEY,
 space TEXT NOT NULL CHECK (space IN (${spacesSql})),
 slug TEXT NOT NULL,
 name VARCHAR(160) NOT NULL,
 category VARCHAR(60) NOT NULL DEFAULT '',
 category_label VARCHAR(120) NOT NULL DEFAULT '',
 subcategory VARCHAR(120) NOT NULL DEFAULT '',
 description VARCHAR(1000) NOT NULL DEFAULT '',
 addresses JSONB NOT NULL DEFAULT '[]',
 links JSONB NOT NULL DEFAULT '[]',
 source VARCHAR(40) NOT NULL DEFAULT '',
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(space, slug)
);
CREATE TABLE IF NOT EXISTS place_waitlist (
 place_id TEXT NOT NULL REFERENCES place_listings(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(place_id, user_id)
);
`;
export const spaceSchema = z.enum(WISHLIST_SPACE_IDS);
export const waitBodySchema = z.object({ waiting: z.boolean() }).strict();
const fail = (res, status, error) => res.status(status).json({ error });

export function registerPlaceListingRoutes(app, { requireAuth, query, transaction }) {
 const route = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
 const scope = (req, res, next) => {
   if (!spaceSchema.safeParse(req.params.space).success) return fail(res, 404, "Пространство не найдено");
   res.set("Cache-Control", "private, no-store"); next();
 };
 const base = "/api/wishlist-business/:space";
 app.get(`${base}/places`, requireAuth, scope, route(async (req, res) => {
   const { rows } = await query(
     `SELECT p.id, p.slug, p.name, p.category, p.category_label AS "categoryLabel",
             p.subcategory, p.description, p.addresses, p.links,
             (SELECT COUNT(*)::int FROM place_waitlist w WHERE w.place_id=p.id) AS "waitCount",
             CASE WHEN $2 IS NOT NULL THEN EXISTS (
               SELECT 1 FROM place_waitlist w WHERE w.place_id=p.id AND w.user_id=$2
             ) END AS "isWaiting"
      FROM place_listings p
      WHERE p.space=$1
      ORDER BY lower(p.name), p.id`,
     [req.params.space, req.user.account_type === "personal" ? req.user.id : null],
   );
   res.json({ places: rows });
 }));
 app.post(`${base}/places/:slug/wait`, requireAuth, scope, route(async (req, res) => {
   const parsed = waitBodySchema.safeParse(req.body);
   if (!parsed.success) return fail(res, 400, "Проверьте поле waiting");
   const { waiting } = parsed.data;
   const result = await transaction(async (client) => {
     const place = await client.query("SELECT id FROM place_listings WHERE space=$1 AND slug=$2", [req.params.space, req.params.slug]);
     if (!place.rowCount) return { status: 404, error: "Место не найдено" };
     const placeId = place.rows[0].id;
     if (waiting) {
       await client.query("INSERT INTO place_waitlist(place_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [placeId, req.user.id]);
     } else {
       await client.query("DELETE FROM place_waitlist WHERE place_id=$1 AND user_id=$2", [placeId, req.user.id]);
     }
     const count = await client.query("SELECT COUNT(*) AS count FROM place_waitlist WHERE place_id=$1", [placeId]);
     return { waiting, waitCount: Number(count.rows[0].count) };
   });
   if (result.error) return fail(res, result.status, result.error);
   res.json(result);
 }));
}
