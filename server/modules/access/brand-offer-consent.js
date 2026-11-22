import { z } from "zod";
import { listOpenPurchasePlans } from "../planning/planning.js";
import { findProfileForAddress } from "../profile/profile-addresses.js";

// These rows are consent for offers and purchase needs. They are deliberately
// outside SPHERE_SECTIONS and cannot authorize reading a personal section.
export const brandOfferScope = "sphere='brand-offers' AND section='needs'";

export async function lockBrandOfferConsent(client, ownerId, businessId) {
  const result = await client.query(
    `SELECT 1 FROM sphere_section_shares
     WHERE owner_user_id=$1 AND viewer_user_id=$2 AND ${brandOfferScope} FOR SHARE`,
    [ownerId, businessId],
  );
  return result.rowCount > 0;
}

export async function readBrandPurchaseNeeds(query, ownerId, businessId) {
  const result = await query(
    `SELECT 1 FROM sphere_section_shares s JOIN users u ON u.id=s.owner_user_id AND u.account_type='personal'
     WHERE s.owner_user_id=$1 AND s.viewer_user_id=$2 AND ${brandOfferScope}`,
    [ownerId, businessId],
  );
  if (!result.rowCount) return null;
  const plans = await listOpenPurchasePlans(query, ownerId);
  return plans.filter(plan => plan.need).map(({ id, title, need }) => ({
    id, title, criteria: need.criteria || "", neededBy: need.neededBy || "",
  }));
}

export function registerBrandOfferConsentRoutes(app, { requireAuth, asyncRoute, query, transaction, findBrand = findProfileForAddress }) {
  app.post("/api/brand-offer-consents/:username", requireAuth, asyncRoute(async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    if (req.user.account_type !== "personal") return res.status(403).json({ error: "Разрешение может дать только личный аккаунт" });
    const parsed = z.object({ granted: z.boolean() }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Укажите новое состояние разрешения" });
    const { rows: [brand] } = await findBrand(query, req.params.username);
    if (brand?.account_type !== "business" || brand.id === req.user.id) return res.status(404).json({ error: "Бренд не найден" });
    const { granted } = parsed.data;
    const parties = [req.user.id, brand.id];
    if (granted) {
      await query(`INSERT INTO sphere_section_shares (owner_user_id,viewer_user_id,sphere,section)
        VALUES ($1,$2,'brand-offers','needs') ON CONFLICT DO NOTHING`, parties);
    } else {
      await query(`DELETE FROM sphere_section_shares WHERE owner_user_id=$1 AND viewer_user_id=$2 AND ${brandOfferScope}`, parties);
    }
    return res.json({ granted });
  }));

  app.get("/api/personal-offers/recipients/:id/needs", requireAuth, asyncRoute(async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    if (req.user.account_type !== "business") return res.status(403).json({ error: "Раздел доступен только бизнес-аккаунтам" });
    const needs = await transaction(async (client) => {
      await client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
      return readBrandPurchaseNeeds((sql, params) => client.query(sql, params), req.params.id, req.user.id);
    });
    if (needs === null) return res.status(404).json({ error: "Покупатель не открыл потребности" });
    return res.json({ needs });
  }));
}
