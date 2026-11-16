import { plannedPurchaseItem, purchaseProductId } from "../../../shared/modules/planning/purchase-plan.js";
import { lockPlanningOwner, readPurchaseTask, writePurchasePriceWatch } from "../planning/planning.js";
import { purchasePriceSource, readPurchasePriceQuote } from "./purchase-price-quote.js";

const checkIntervalMs = 6 * 60 * 60 * 1000;
const manualIntervalMs = 5 * 60 * 1000;
const workerIntervalMs = 60 * 1000;

export function purchasePriceWatchView(watch, wishUrl) {
  if (!watch) return null;
  const sourceUrl = purchasePriceSource(wishUrl);
  const result = watch.result?.sourceUrl === sourceUrl ? watch.result : null;
  const notice = watch.notice?.url === sourceUrl ? watch.notice : null;
  return { country: watch.country, result, notice };
}

function checkedWatch(watch, { quote, sourceUrl, checkedAt, budgetMinor, failed }) {
  const status = !quote ? (failed ? "unavailable" : "unconfirmed") : quote.totalMinor <= budgetMinor ? "within_budget" : "above_budget";
  const previousNotice = watch.notice?.url === sourceUrl ? watch.notice : null;
  const notice = status === "within_budget"
    ? previousNotice || { ...quote, checkedAt }
    : status === "above_budget" ? null : previousNotice;
  return { ...watch, result: { status, sourceUrl, checkedAt, quote }, notice };
}

async function lockWatchedPurchase(q, userId, wishId) {
  await lockPlanningOwner(q, userId);
  const task = await readPurchaseTask(q, userId, wishId);
  const purchase = plannedPurchaseItem(task);
  if (!purchase?.priceWatch || purchase.purchaseReview || task.completed || task.archived || !task.dueOn) return null;
  const { rows } = await q("SELECT url FROM wishes WHERE id=$1 AND user_id=$2 AND (status='active' OR $3) FOR UPDATE", [purchaseProductId(purchase), userId, Boolean(purchase.replenishment)]);
  if (!rows.length) return null;
  const sourceUrl = purchasePriceSource(rows[0].url);
  return { task, sourceUrl, budget: purchase.purchaseBudget, watch: purchase.priceWatch };
}

export async function checkPurchasePrice({ transaction, userId, wishId, manual = false, now = () => new Date(), readQuote = readPurchasePriceQuote }) {
  const claimed = await transaction(async (client) => {
    const q = (sql, params) => client.query(sql, params);
    const target = await lockWatchedPurchase(q, userId, wishId);
    if (!target) return { status: 404, error: "Отслеживаемый план покупки не найден" };
    const time = now();
    const interval = manual ? manualIntervalMs : checkIntervalMs;
    if (Date.parse(target.watch.attemptedAt) + interval > time.getTime()) {
      return { status: 429, error: "Цена недавно проверялась. Повторите через несколько минут.", priceWatch: purchasePriceWatchView(target.watch, target.sourceUrl) };
    }
    const watch = { ...target.watch, attemptedAt: time.toISOString() };
    await writePurchasePriceWatch(q, userId, target.task, watch);
    return { ...target, watch };
  });
  if (claimed.error) return claimed;

  const { sourceUrl, budget, watch } = claimed;
  let quote = null;
  let failed = false;
  try {
    if (sourceUrl) quote = await readQuote(sourceUrl, { country: watch.country, currency: budget.currency, checkedAt: now().toISOString() });
  } catch { failed = true; }
  const checkedAt = now().toISOString();
  return transaction(async (client) => {
    const q = (sql, params) => client.query(sql, params);
    const current = await lockWatchedPurchase(q, userId, wishId);
    if (!current || current.watch.id !== watch.id || current.watch.attemptedAt !== watch.attemptedAt || current.sourceUrl !== sourceUrl) {
      return { status: 409, error: "План покупки изменился. Откройте его заново." };
    }
    const next = checkedWatch(watch, { quote, sourceUrl, checkedAt, budgetMinor: budget.minor, failed });
    await writePurchasePriceWatch(q, userId, current.task, next);
    return { priceWatch: purchasePriceWatchView(next, sourceUrl) };
  });
}

export async function runPurchasePriceChecks({ query, transaction, now = () => new Date(), readQuote }) {
  const before = new Date(now().getTime() - checkIntervalMs).toISOString();
  const { rows } = await query(`SELECT t.user_id AS "userId", link.item->>'id' AS "wishId"
    FROM planning_tasks t
    JOIN LATERAL jsonb_array_elements(t.related_items) AS link(item) ON link.item->>'kind'='wishlist' AND t.id='purchase-plan:' || (link.item->>'id')
    JOIN wishes w ON w.id=COALESCE(link.item->'replenishment'->>'wishId', link.item->>'id') AND w.user_id=t.user_id
      AND (w.status='active' OR link.item->'replenishment' IS NOT NULL)
    WHERE t.space_id='main' AND t.due_on IS NOT NULL AND NOT t.archived AND NOT COALESCE(t.completed,t.status='done')
      AND link.item->'priceWatch'->>'id' IS NOT NULL AND link.item->>'purchaseReview' IS NULL
      AND w.url <> '' AND COALESCE(link.item->'priceWatch'->>'attemptedAt','') <= $1
    ORDER BY link.item->'priceWatch'->>'attemptedAt' NULLS FIRST, t.id LIMIT 6`, [before]);
  await Promise.all(rows.map((target) => checkPurchasePrice({ transaction, ...target, now, readQuote })));
}

export function startPurchasePriceChecks({ query, transaction, onError }) {
  let pending = null;
  const tick = () => {
    if (pending) return;
    pending = runPurchasePriceChecks({ query, transaction }).catch(onError).finally(() => { pending = null; });
  };
  const timer = setInterval(tick, workerIntervalMs);
  timer.unref();
  return { stop() { clearInterval(timer); return pending; } };
}
