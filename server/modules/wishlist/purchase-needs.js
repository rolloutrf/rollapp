import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { isPlanningDate } from "../../../shared/modules/planning/planning.js";
import { MAX_PURCHASE_BUDGET_MINOR, MAX_PURCHASE_VARIANTS, openPurchaseItem, PURCHASE_DELIVERY_COUNTRIES } from "../../../shared/modules/planning/purchase-plan.js";
import { lockPlanningOwner, readPurchaseTask, savePurchaseNeed } from "../planning/planning.js";
import { createRateLimit } from "../runtime/rate-limit.js";
import { mapWish } from "./wish-projection.js";
import { purchasePriceSource, readPurchasePriceQuote } from "./purchase-price-quote.js";

const fields = z.object({
  title: z.string().trim().min(1).max(160),
  criteria: z.string().trim().max(500),
  dueOn: z.string().refine(isPlanningDate),
  neededBy: z.string().refine((value) => !value || isPlanningDate(value)),
  budgetMinor: z.number().int().min(1).max(MAX_PURCHASE_BUDGET_MINOR),
  savedMinor: z.number().int().min(0).max(MAX_PURCHASE_BUDGET_MINOR).optional(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  country: z.enum(PURCHASE_DELIVERY_COUNTRIES),
  variantIds: z.array(z.string().min(1).max(200)).max(MAX_PURCHASE_VARIANTS).refine((ids) => new Set(ids).size === ids.length),
  revision: z.string().min(1).max(50).nullable(),
}).strict();
const needId = z.string().regex(/^need-[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i);
const compareLimit = createRateLimit({ windowMs: 60_000, max: 4, key: (req) => req.user.id });

export async function readNeedVariants(q, userId, ids, currency, lock = false) {
  if (!ids.length) return [];
  const { rows } = await q(`SELECT * FROM wishes WHERE user_id=$1 AND id=ANY($2::text[]) AND currency=$3${lock ? " ORDER BY id FOR UPDATE" : ""}`, [userId, ids, currency]);
  const byId = new Map(rows.map((wish) => [wish.id, wish]));
  return ids.flatMap((id) => byId.has(id) ? [byId.get(id)] : []);
}

function currentFields(purchase, dueOn) {
  const { title, need, purchaseBudget } = purchase;
  return { title, dueOn, budgetMinor: purchaseBudget.minor, currency: purchaseBudget.currency,
    criteria: need.criteria, neededBy: need.neededBy, country: need.country, variantIds: need.variantIds, savedMinor: need.savedMinor || 0 };
}

export function registerPurchaseNeedRoutes(app, { query, transaction, requireAuth, asyncRoute, readQuote = readPurchasePriceQuote }) {
  const path = "/api/dashboard/purchase-needs/:id";
  app.post(path, requireAuth, asyncRoute(async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    const parsed = fields.safeParse(req.body);
    if (!parsed.success || !needId.safeParse(req.params.id).success) return res.status(400).json({ error: "Проверьте данные потребности" });
    const { id } = req.params;
    const { revision, ...payload } = parsed.data;
    const userId = req.user.id;
    const result = await transaction(async (client) => {
      const q = (sql, params) => client.query(sql, params);
      await lockPlanningOwner(q, userId);
      const existing = await readPurchaseTask(q, userId, id);
      const purchase = openPurchaseItem(existing);
      if (existing && (!purchase?.need || existing.completed || existing.archived)) return { status: 409, error: "Этот план уже закрыт" };
      const savedMinor = payload.savedMinor ?? (purchase?.purchaseBudget.currency === payload.currency ? purchase.need.savedMinor || 0 : 0);
      if (savedMinor > payload.budgetMinor) return { status: 400, error: "Отложенная сумма больше бюджета потребности" };
      const updated = { ...payload, savedMinor };
      if (purchase && isDeepStrictEqual(currentFields(purchase, existing.dueOn), updated)) return { task: existing };
      if ((existing?.revision ?? null) !== revision) return { status: 409, error: "План изменился. Откройте форму заново." };
      if (purchase?.replenishment && payload.currency !== purchase.purchaseBudget.currency) return { status: 400, error: "Валюта пополнения уже задана" };
      const variants = await readNeedVariants(q, userId, payload.variantIds, payload.currency, true);
      if (variants.length !== payload.variantIds.length) return { status: 400, error: "Выберите свои желания в валюте потребности" };
      return { task: await savePurchaseNeed(q, userId, id, updated, existing) };
    });
    return result.error ? res.status(result.status).json({ error: result.error }) : res.json(result);
  }));

  app.post(`${path}/compare`, requireAuth, compareLimit, asyncRoute(async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    const task = await readPurchaseTask(query, req.user.id, req.params.id);
    const purchase = openPurchaseItem(task);
    if (!purchase?.need || task.archived || task.completed) return res.status(404).json({ error: "Открытая потребность не найдена" });
    const { country, variantIds } = purchase.need;
    const { currency } = purchase.purchaseBudget;
    const variants = await readNeedVariants(query, req.user.id, variantIds, currency);
    const checkedAt = new Date().toISOString();
    const offers = await Promise.all(variants.map(async (wish) => {
      const sourceUrl = purchasePriceSource(wish.url);
      if (!sourceUrl) return { wishId: wish.id, status: "no-link" };
      try {
        const quote = await readQuote(sourceUrl, { country, currency, checkedAt });
        return { wishId: wish.id, status: quote ? "available" : "unconfirmed", quote };
      } catch {
        return { wishId: wish.id, status: "unavailable" };
      }
    }));
    return res.json({ checkedAt, offers });
  }));
}

export async function projectNeedVariants(q, userId, purchase) {
  return (await readNeedVariants(q, userId, purchase.need.variantIds, purchase.purchaseBudget.currency)).map(mapWish);
}
