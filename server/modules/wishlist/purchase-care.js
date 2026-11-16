import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { EMPTY_PURCHASE_CARE, PURCHASE_CARE_TYPES } from "../../../shared/modules/planning/purchase-care.js";
import { isPlanningDate } from "../../../shared/modules/planning/planning.js";
import { lockPlanningOwner, readPurchaseCareTask, readPurchaseCareTasks, writePurchaseCareTask } from "../planning/planning.js";
import { readPurchaseForCare, updatePurchaseCare } from "../planning/purchase-history.js";
import { readReceiptMetadata, registerPurchaseReceiptRoutes } from "./purchase-receipts.js";

const purchaseHistoryId = z.string().startsWith("purchase-history:").max(500);
const optionalDate = z.string().refine((value) => !value || isPlanningDate(value));
const fields = z.object({
  warrantyOn: optionalDate,
  warrantyReminderOn: optionalDate,
  maintenanceOn: optionalDate,
  maintenanceNote: z.string().trim().max(500),
  revision: z.string().min(1).max(50).nullable(),
}).strict();
const reminderFields = z.object({ type: z.enum(PURCHASE_CARE_TYPES), dueOn: z.string().refine(isPlanningDate),
  completed: z.boolean(), revision: z.string().min(1).max(50) }).strict();
const notFound = { status: 404, error: "Покупка не найдена" };
const changed = { status: 409, error: "Данные изменились. Откройте карточку покупки заново." };

const taskDate = (care, type) => type === "warranty" ? care.warrantyReminderOn : care.maintenanceOn;

async function careView(q, userId, purchase) {
  const receipt = await readReceiptMetadata(q, userId, purchase.id);
  const reminders = await readPurchaseCareTasks(q, userId, purchase.id);
  return { purchase: { ...purchase, care: purchase.care ?? EMPTY_PURCHASE_CARE }, receipt, reminders };
}

export function registerPurchaseCareRoutes(app, dependencies) {
  const { requireAuth, asyncRoute, query, transaction } = dependencies;
  const path = "/api/dashboard/purchase-history/:id/care";
  const handler = (operation) => [requireAuth, asyncRoute(async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    if (!purchaseHistoryId.safeParse(req.params.id).success) return res.status(404).json({ error: notFound.error });
    const result = await operation(req);
    return result.error ? res.status(result.status).json({ error: result.error }) : res.json(result);
  })];
  const mutate = (operation) => (req) => transaction(async (client) => {
    const q = (sql, args) => client.query(sql, args);
    const userId = req.user.id;
    await lockPlanningOwner(q, userId);
    const purchase = await readPurchaseForCare(q, userId, req.params.id);
    return purchase ? operation(q, userId, purchase, req.body) : notFound;
  });

  app.get(path, ...handler(async (req) => {
    const purchase = await readPurchaseForCare(query, req.user.id, req.params.id);
    return purchase ? careView(query, req.user.id, purchase) : notFound;
  }));

  app.post(path, ...handler(mutate(async (q, userId, purchase, body) => {
    const parsed = fields.safeParse(body);
    if (!parsed.success) return { status: 400, error: "Проверьте даты гарантии и обслуживания" };
    const { revision, ...care } = parsed.data;
    const previous = purchase.care ?? EMPTY_PURCHASE_CARE;
    if (isDeepStrictEqual(care, previous)) return careView(q, userId, purchase);
    if (purchase.revision !== revision) return changed;
    if (purchase.purchaseType === "subscription") return { status: 400, error: "Гарантия и обслуживание доступны для товаров" };
    if (care.warrantyReminderOn && (!care.warrantyOn || care.warrantyReminderOn > care.warrantyOn)) {
      return { status: 400, error: "Напоминание о гарантии должно быть до или в день её окончания" };
    }
    if (purchase.purchasedOn && [care.warrantyOn, care.warrantyReminderOn, care.maintenanceOn].some((date) => date && date < purchase.purchasedOn)) {
      return { status: 400, error: "Дата должна быть не раньше покупки" };
    }
    await readPurchaseForCare(q, userId, purchase.id, { preserve: true });
    await updatePurchaseCare(q, userId, purchase.id, care);
    for (const type of PURCHASE_CARE_TYPES) {
      const dueOn = taskDate(care, type);
      const task = await readPurchaseCareTask(q, userId, purchase.id, type);
      const newWarranty = type === "warranty" && Boolean(dueOn) && care.warrantyOn !== previous.warrantyOn;
      if (dueOn !== (task?.dueOn || "") || newWarranty) await writePurchaseCareTask(q, userId, purchase, type, dueOn, task);
    }
    return careView(q, userId, await readPurchaseForCare(q, userId, purchase.id));
  })));

  app.post(`${path}/reminder`, ...handler(mutate(async (q, userId, purchase, body) => {
    const parsed = reminderFields.safeParse(body);
    if (!parsed.success) return { status: 400, error: "Проверьте действие с напоминанием" };
    const { type, dueOn, completed, revision } = parsed.data;
    const task = await readPurchaseCareTask(q, userId, purchase.id, type);
    if (task?.dueOn !== dueOn) return changed;
    if (task.completed === completed) return careView(q, userId, purchase);
    if (task.revision !== revision) return changed;
    await writePurchaseCareTask(q, userId, purchase, type, dueOn, task, completed);
    return careView(q, userId, purchase);
  })));

  registerPurchaseReceiptRoutes(app, dependencies);
}
