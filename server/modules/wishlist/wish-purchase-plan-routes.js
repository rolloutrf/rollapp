import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { isPlanningDate } from "../../../shared/modules/planning/planning.js";
import { MAX_PURCHASE_BUDGET_MINOR, MAX_REPLENISHMENT_DAYS, nextReplenishmentDate, openPurchaseItem, plannedPurchaseItem, purchaseProductId, PURCHASE_DELIVERY_COUNTRIES } from "../../../shared/modules/planning/purchase-plan.js";
import { applyPurchaseReview, lockPlanningOwner, readPurchaseTask, savePurchaseTask } from "../planning/planning.js";
import { readMonthlyPurchaseSummary, readPurchaseHistory, saveMonthlyPurchaseLimit } from "../planning/purchase-history.js";
import { mapWish } from "./wish-projection.js";
import { updateOwnedWishStatus } from "./wish-status.js";
import { purchasePriceSource } from "./purchase-price-quote.js";
import { checkPurchasePrice, purchasePriceWatchView } from "./purchase-price-watch.js";
import { createRateLimit } from "../runtime/rate-limit.js";
import { projectNeedVariants, registerPurchaseNeedRoutes } from "./purchase-needs.js";
import { registerPurchaseSubscriptionRoutes } from "./purchase-subscriptions.js";
import { registerPurchaseCareRoutes } from "./purchase-care.js";
import { registerPurchaseCollaborationRoutes } from "./purchase-collaboration.js";

const fields = z.object({
  dueOn: z.string().refine(isPlanningDate),
  budgetMinor: z.number().int().min(1).max(MAX_PURCHASE_BUDGET_MINOR),
  currency: z.string().regex(/^[A-Z]{3}$/),
  revision: z.string().min(1).max(50).nullable().optional(),
  priceWatchCountry: z.enum(PURCHASE_DELIVERY_COUNTRIES).nullable().optional(),
}).strict();
const revisionField = z.string().min(1).max(50);
const manualPriceChecks = createRateLimit({ windowMs: 60_000, max: 6, key: (req) => req.user.id });
const reviewFields = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("bought"), revision: revisionField,
    amountMinor: z.number().int().min(0).max(MAX_PURCHASE_BUDGET_MINOR).nullable(),
    intervalDays: z.number().int().min(1).max(MAX_REPLENISHMENT_DAYS).nullable().optional(),
    purchasedOn: z.string().refine(isPlanningDate).optional(),
    wishId: z.string().min(1).max(200).optional(),
    suited: z.boolean().optional(),
  }).strict(),
  z.object({ action: z.literal("postpone"), revision: revisionField, dueOn: z.string().refine(isPlanningDate) }).strict(),
  z.object({ action: z.literal("declined"), revision: revisionField }).strict(),
  z.object({ action: z.literal("skip"), revision: revisionField, skippedOn: z.string().refine(isPlanningDate) }).strict(),
  z.object({ action: z.literal("replace"), revision: revisionField, wishId: z.string().min(1).max(200) }).strict(),
]).refine((decision) => decision.action !== "bought" || !decision.intervalDays || Boolean(decision.purchasedOn));
const historyCursor = z.string().min(1).max(500).optional();
const monthField = z.string().regex(/^\d{4}-\d{2}$/).refine((month) => isPlanningDate(`${month}-01`));
const limitFields = z.object({ month: monthField, currency: fields.shape.currency,
  minor: z.number().int().min(0).max(MAX_PURCHASE_BUDGET_MINOR).nullable() }).strict();

function purchasePlan(wish, task) {
  const purchase = plannedPurchaseItem(task);
  const budget = purchase?.purchaseBudget;
  const priceWatch = purchasePriceWatchView(purchase?.priceWatch, wish?.url);
  return { dueOn: task?.dueOn || "", budgetMinor: budget?.minor ?? null, currency: budget?.currency || wish?.currency,
    ...(purchase?.replenishment && !purchase.purchaseReview && { replenishment: { intervalDays: purchase.replenishment.intervalDays } }),
    ...(priceWatch && { priceWatch }) };
}

async function readOwnWish(q, req, lock = false, wishId = req.params.id) {
  const result = await q(`SELECT * FROM wishes WHERE id=$1 AND user_id=$2${lock ? " FOR UPDATE" : ""}`, [wishId, req.user.id]);
  return result.rows[0];
}

function readPlanProduct(q, req, wish, purchase) {
  const productId = purchase?.purchaseReview ? wish.id : purchase?.replenishment?.wishId || wish.id;
  return productId === wish.id ? wish : readOwnWish(q, req, false, productId);
}

function wishError(wish) {
  if (!wish) return { status: 404, error: "Желание не найдено" };
  if (wish.status !== "active") return { status: 409, error: "Запланировать можно только активное желание" };
  return null;
}

export function registerWishPurchasePlanRoutes(app, { query, transaction, requireAuth, asyncRoute, readQuote }) {
  registerPurchaseNeedRoutes(app, { query, transaction, requireAuth, asyncRoute, readQuote });
  registerPurchaseSubscriptionRoutes(app, { query, transaction, requireAuth, asyncRoute });
  registerPurchaseCareRoutes(app, { query, transaction, requireAuth, asyncRoute });
  registerPurchaseCollaborationRoutes(app, { query, transaction, requireAuth, asyncRoute });
  app.get("/api/dashboard/purchase-month", requireAuth, asyncRoute(async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    const month = monthField.safeParse(req.query.month);
    if (!month.success) return res.status(400).json({ error: "Укажите месяц в формате ГГГГ-ММ" });
    return res.json(await readMonthlyPurchaseSummary(query, req.user.id, month.data));
  }));

  app.post("/api/dashboard/purchase-month/limit", requireAuth, asyncRoute(async (req, res) => {
    const input = limitFields.safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: "Проверьте месяц, валюту и сумму лимита" });
    await saveMonthlyPurchaseLimit(query, req.user.id, input.data);
    return res.json({ saved: true });
  }));

  app.get("/api/dashboard/purchase-history", requireAuth, asyncRoute(async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    const cursor = historyCursor.safeParse(req.query.cursor);
    if (!cursor.success) return res.status(400).json({ error: "Не удалось прочитать страницу истории покупок" });
    return res.json(await readPurchaseHistory(query, req.user.id, cursor.data));
  }));

  const path = "/api/wishes/:id/purchase-plan";
  app.get(path, requireAuth, asyncRoute(async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    const wish = await readOwnWish(query, req);
    const error = wishError(wish);
    if (error) return res.status(error.status).json({ error: error.error });
    const task = await readPurchaseTask(query, req.user.id, wish.id);
    const product = await readPlanProduct(query, req, wish, plannedPurchaseItem(task));
    return res.json({ plan: purchasePlan(product, task), revision: task?.revision ?? null,
      isOpen: Boolean(openPurchaseItem(task) && !task.completed && !task.archived && task.dueOn) });
  }));

  app.post(path, requireAuth, asyncRoute(async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    const parsed = fields.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Проверьте бюджет и дату пересмотра" });
    const outcome = await transaction(async (client) => {
      const q = (sql, params) => client.query(sql, params);
      await lockPlanningOwner(q, req.user.id);
      const wish = await readOwnWish(q, req, true);
      const error = wishError(wish);
      if (error) return error;
      const existing = await readPurchaseTask(q, req.user.id, wish.id);
      const purchase = plannedPurchaseItem(existing);
      const product = await readPlanProduct(q, req, wish, purchase);
      if (parsed.data.priceWatchCountry && parsed.data.priceWatchCountry !== purchase?.priceWatch?.country
        && !purchasePriceSource(product?.url)) return { status: 400, error: "Добавьте ссылку на страницу товара в желание" };
      const currentRevision = existing?.revision ?? null;
      if (parsed.data.revision !== undefined && parsed.data.revision !== currentRevision) {
        const plan = purchasePlan(product, existing);
        if (existing && !existing.completed && !existing.archived && !purchase?.purchaseReview
          && plan.dueOn === parsed.data.dueOn && plan.budgetMinor === parsed.data.budgetMinor && plan.currency === parsed.data.currency
          && (parsed.data.priceWatchCountry === undefined || parsed.data.priceWatchCountry === (plan.priceWatch?.country ?? null))) return { plan };
        return { status: 409, error: "План изменился. Откройте форму заново." };
      }
      const task = await savePurchaseTask(q, req.user.id, wish, parsed.data, existing);
      if (!task) return { status: 409, error: "Валюта бюджета изменилась. Откройте форму заново." };
      return { plan: purchasePlan(product, task) };
    });
    return outcome.error ? res.status(outcome.status).json({ error: outcome.error }) : res.json(outcome);
  }));

  app.post(`${path}/price-check`, requireAuth, manualPriceChecks, asyncRoute(async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    const { status, ...result } = await checkPurchasePrice({ transaction, userId: req.user.id, wishId: req.params.id, manual: true, readQuote });
    return res.status(status || 200).json(result);
  }));

  app.get(`${path}/review`, requireAuth, asyncRoute(async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    const task = await readPurchaseTask(query, req.user.id, req.params.id);
    const purchase = plannedPurchaseItem(task);
    if (!purchase) return res.status(404).json({ error: "План покупки не найден" });
    const wishId = purchase.need && purchase.purchaseReview ? purchase.need.lastWishId ?? null : purchaseProductId(purchase);
    const wish = wishId && await readOwnWish(query, req, false, wishId);
    const need = purchase.need && { ...purchase.need, variants: await projectNeedVariants(query, req.user.id, purchase) };
    return res.json({
      wish: wish ? mapWish(wish) : null,
      ...(need && { need }),
      plan: purchasePlan(wish, task),
      review: purchase.purchaseReview ?? null,
      revision: task.revision,
    });
  }));

  app.post(`${path}/review`, requireAuth, asyncRoute(async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    const parsed = reviewFields.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Проверьте данные пересмотра покупки" });
    const { id: userId } = req.user;
    const { action, dueOn, amountMinor, revision, intervalDays, purchasedOn, skippedOn } = parsed.data;
    const outcome = await transaction(async (client) => {
      const q = (sql, params) => client.query(sql, params);
      await lockPlanningOwner(q, userId);
      const task = await readPurchaseTask(q, userId, req.params.id);
      const purchase = plannedPurchaseItem(task);
      if (!purchase) return { status: 404, error: "План покупки не найден" };
      const review = purchase.purchaseReview;
      const replenishment = purchase.replenishment;
      const need = purchase.need;
      if (action === "bought" && !need && (parsed.data.wishId || parsed.data.suited !== undefined)) {
        return { status: 400, error: "У этого плана нет вариантов" };
      }
      const sameBought = need ? isDeepStrictEqual(need.lastDecision, parsed.data) : !intervalDays && review?.amountMinor === amountMinor;
      if ((!review && isDeepStrictEqual(replenishment?.lastDecision, parsed.data))
        || (review?.outcome === action && (action !== "bought" || sameBought))
        || (action === "postpone" && !review && !task.completed && task.dueOn === dueOn)) return { task };
      if (task.revision !== revision || review || (replenishment && (task.completed || task.archived || !task.dueOn))) return { status: 409, error: "План изменился. Обновите его перед пересмотром." };
      if ((action === "skip" && !replenishment) || (action === "replace" && (!replenishment || need))) return { status: 409, error: "Это действие недоступно для плана" };
      if ((intervalDays && !isPlanningDate(nextReplenishmentDate(purchasedOn, intervalDays)))
        || (action === "skip" && !isPlanningDate(nextReplenishmentDate(task.dueOn, replenishment.intervalDays, skippedOn)))) {
        return { status: 400, error: "Дата следующего пополнения вне календаря" };
      }
      let wish;
      if (action === "replace") {
        const { wishId } = parsed.data;
        if (wishId === purchaseProductId(purchase)) return { status: 400, error: "Выберите другое желание" };
        wish = await readOwnWish(q, req, true, wishId);
        if (!wish) return { status: 404, error: "Желание для замены не найдено" };
        if (wish.currency !== purchase.purchaseBudget.currency) return { status: 400, error: "Валюта желания должна совпадать с валютой бюджета" };
      }
      if (need && action === "bought") {
        const { wishId, suited } = parsed.data;
        if (wishId && !need.variantIds.includes(wishId)) return { status: 400, error: "Товар не входит в варианты потребности" };
        if (!wishId && suited !== undefined) return { status: 400, error: "Выберите товар для оценки" };
        if (wishId) {
          wish = await readOwnWish(q, req, true, wishId);
          if (!wish || wish.currency !== purchase.purchaseBudget.currency) return { status: 409, error: "Вариант больше недоступен" };
          if (wish.status !== "fulfilled") await updateOwnedWishStatus(q, userId, wish.id, "fulfilled");
        } else {
          wish = { id: purchase.id, title: purchase.title };
        }
      } else if (!need && (action === "bought" || action === "postpone")) {
        wish = await readOwnWish(q, req, true, purchaseProductId(purchase));
        if (!wish) return { status: 404, error: "Связанное желание не найдено" };
        if (action === "bought" && wish.status !== "fulfilled") await updateOwnedWishStatus(q, userId, wish.id, "fulfilled");
      }
      return { task: await applyPurchaseReview(q, userId, task, parsed.data, wish) };
    });
    return outcome.error ? res.status(outcome.status).json({ error: outcome.error }) : res.json(outcome);
  }));
}
