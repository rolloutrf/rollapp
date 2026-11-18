import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { isPlanningDate } from "../../../shared/modules/planning/planning.js";
import { MAX_PURCHASE_BUDGET_MINOR } from "../../../shared/modules/planning/purchase-plan.js";
import { nextSubscriptionCharge, SUBSCRIPTION_LEAD_DAYS, SUBSCRIPTION_PERIODS, subscriptionItem, subscriptionReminderOn } from "../../../shared/modules/planning/subscription-renewal.js";
import { lockPlanningOwner, readSubscriptionTask, writeSubscriptionTask } from "../planning/planning.js";
import { recordSubscriptionCharge } from "../planning/purchase-history.js";

const revisionField = z.string().min(1).max(50);
const dateField = z.string().refine(isPlanningDate);
const amountField = z.number().int().min(0).max(MAX_PURCHASE_BUDGET_MINOR);
const fields = z.object({
  title: z.string().trim().min(1).max(160),
  budgetMinor: amountField,
  currency: z.string().regex(/^[A-Z]{3}$/),
  chargeOn: dateField,
  intervalMonths: z.number().refine((value) => SUBSCRIPTION_PERIODS.includes(value)),
  leadDays: z.number().refine((value) => SUBSCRIPTION_LEAD_DAYS.includes(value)),
  trial: z.boolean(),
  url: z.string().trim().max(2048).refine((value) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password;
    } catch { return false; }
  }),
  revision: revisionField.nullable(),
}).strict();
const decisions = z.discriminatedUnion("action", [
  z.object({ action: z.literal("paid"), revision: revisionField, amountMinor: amountField, purchasedOn: dateField }).strict(),
  z.object({ action: z.literal("skip"), revision: revisionField }).strict(),
  z.object({ action: z.literal("stop"), revision: revisionField }).strict(),
]);
const idField = z.string().uuid();
const changed = { status: 409, error: "Подписка изменилась. Откройте её карточку заново." };
const notFound = { status: 404, error: "Подписка не найдена" };
const invalidDate = { status: 400, error: "Проверьте даты списания и напоминания" };

function editableFields(item) {
  const { title, budgetMinor, currency, chargeOn, intervalMonths, leadDays, trial, url } = item;
  return { title, budgetMinor, currency, chargeOn, intervalMonths, leadDays, trial, url };
}

function subscriptionView(task) {
  const item = subscriptionItem(task);
  return item && { ...editableFields(item), id: item.id, dueOn: task.dueOn, stopped: Boolean(item.stopped), revision: task.revision };
}

export async function listSubscriptions(q, userId) {
  const { rows } = await q(`SELECT id, related_items AS "relatedItems", to_char(due_on,'YYYY-MM-DD') AS "dueOn",
      to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US') AS revision
    FROM planning_tasks WHERE user_id=$1 AND space_id='main' AND id LIKE 'subscription-renewal:%'
      AND NOT archived AND NOT COALESCE(completed,status='done')
    ORDER BY due_on, title, id`, [userId]);
  return rows.map(subscriptionView).filter((item) => item && !item.stopped);
}

export function registerPurchaseSubscriptionRoutes(app, { query, transaction, requireAuth, asyncRoute }) {
  const path = "/api/dashboard/subscriptions/:id";
  const read = (q, req) => readSubscriptionTask(q, req.user.id, req.params.id);

  const handler = (operation) => [requireAuth, asyncRoute(async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    if (!idField.safeParse(req.params.id).success) return res.status(400).json({ error: "Некорректный идентификатор подписки" });
    const result = await operation(req);
    return result.error ? res.status(result.status).json({ error: result.error }) : res.json(result);
  })];
  const mutate = (operation) => (req) => transaction(async (client) => {
    const q = (sql, args) => client.query(sql, args);
    await lockPlanningOwner(q, req.user.id);
    const task = await read(q, req);
    return operation(q, req, task, subscriptionItem(task));
  });

  app.get(path, ...handler(async (req) => {
    const subscription = subscriptionView(await read(query, req));
    return subscription ? { subscription } : notFound;
  }));

  app.post(path, ...handler(mutate(async (q, req, task, current) => {
    const parsed = fields.safeParse(req.body);
    if (!parsed.success) return { status: 400, error: "Проверьте данные подписки" };
    const { revision, ...payload } = parsed.data;
    if (current?.stopped) return changed;
    if (current && isDeepStrictEqual(payload, editableFields(current))) return { task };
    if (task && (!current || task.revision !== revision)) return changed;
    if (!task && revision !== null) return notFound;

    const anchorDay = current?.chargeOn === payload.chargeOn ? current.anchorDay : Number(payload.chargeOn.slice(-2));
    const item = { ...current, ...payload, id: req.params.id, kind: "subscription-renewal", anchorDay };
    if (!isPlanningDate(subscriptionReminderOn(item)) || !isPlanningDate(nextSubscriptionCharge(item))) return invalidDate;
    return { task: await writeSubscriptionTask(q, req.user.id, item, task) };
  })));

  app.post(`${path}/review`, ...handler(mutate(async (q, req, task, item) => {
    const parsed = decisions.safeParse(req.body);
    if (!parsed.success) return { status: 400, error: "Проверьте решение по подписке" };
    if (!item) return notFound;
    const decision = parsed.data;
    if (isDeepStrictEqual(item.lastDecision, decision)) return { task };
    if (item.stopped || task.revision !== decision.revision) return changed;

    const next = { ...item, lastDecision: decision };
    if (decision.action === "stop") {
      next.stopped = true;
    } else {
      next.chargeOn = nextSubscriptionCharge(item);
      next.trial = false;
      if (!isPlanningDate(next.chargeOn) || !isPlanningDate(subscriptionReminderOn(next))) return invalidDate;
      if (decision.action === "paid") await recordSubscriptionCharge(q, req.user.id, task, item, decision);
    }
    return { task: await writeSubscriptionTask(q, req.user.id, next, task) };
  })));
}
