import { z } from "zod";
import { isPlanningDate } from "../../../shared/modules/planning/planning.js";
import { MAX_PURCHASE_BUDGET_MINOR, openPurchaseItem } from "../../../shared/modules/planning/purchase-plan.js";
import { lockPlanningOwner, readPurchaseTask } from "../planning/planning.js";
import { createRateLimit } from "../runtime/rate-limit.js";

const space = "purchase-collaboration";
const recordId = (id) => `purchase-collaboration:${id}`;
const recipientId = z.string().min(1).max(150);
const needKey = /^need-[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;
const amount = z.number().int().min(0).max(MAX_PURCHASE_BUDGET_MINOR);
const action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("invite"), username: z.string().trim().regex(/^@?[\p{L}\d_.-]{1,80}$/u),
    role: z.enum(["household", "seller"]), city: z.string().trim().max(100).default("") }).strict(),
  z.object({ action: z.literal("revoke"), recipientId }).strict(),
  z.object({ action: z.enum(["claim", "release", "bought", "decline"]) }).strict(),
  z.object({ action: z.literal("pledge"), minor: amount }).strict(),
  z.object({ action: z.literal("offer"), product: z.string().trim().min(1).max(160), totalMinor: amount.min(1),
    deliveryOn: z.string().refine(isPlanningDate), url: z.string().url().max(2048).refine((value) => {
      try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password; }
      catch { return false; }
    }) }).strict(),
]);
const notFound = { status: 404, error: "Общая покупка не найдена" };
const forbidden = { status: 403, error: "Это действие недоступно для этой покупки" };
const conflict = { status: 409, error: "Эту покупку уже взял другой участник" };
const changeLimit = createRateLimit({ windowMs: 60_000, max: 40, key: (req) => req.user.id });

function viewerProjection(row, userId) {
  const { snapshot, recipients, assignedTo, bought } = row.data;
  const owner = row.ownerId === userId;
  const own = recipients.find(({ id }) => id === userId);
  const role = owner ? "owner" : own.role;
  const { budgetMinor, cycle: _cycle, ...request } = snapshot;
  return { id: snapshot.id, role, ownerUsername: row.ownerUsername, ...request,
    ...(role === "seller" ? { ownOffer: own.offer || null, city: own.city } : {
      budgetMinor, assignedTo, bought,
      recipients: (owner ? recipients : recipients.filter(({ role }) => role === "household")),
    }) };
}

async function readRecords(q, userId, id = null) {
  const { rows } = await q(`SELECT r.user_id AS "ownerId",u.username AS "ownerUsername",r.related_items->0 AS data
    FROM planning_tasks r JOIN users u ON u.id=r.user_id JOIN users viewer ON viewer.id=$2
    JOIN planning_tasks p ON p.id='purchase-plan:'||(r.related_items->0->'snapshot'->>'id') AND p.user_id=r.user_id
      AND p.space_id='main' AND NOT p.archived AND NOT COALESCE(p.completed,p.status='done')
      AND COALESCE(r.related_items->0->'snapshot'->'cycle','null'::jsonb)=COALESCE(p.related_items->0->'need'->'lastDecision','null'::jsonb)
    WHERE r.space_id=$1 AND ($3::text IS NULL OR r.id=$3)
      AND jsonb_array_length(r.related_items->0->'recipients')>0
      AND (r.user_id=$2 OR r.related_items->0->'recipients' @> jsonb_build_array(jsonb_build_object('id',$2::text,'role','household'))
        OR (viewer.account_type='business' AND r.related_items->0->'recipients' @> jsonb_build_array(jsonb_build_object('id',$2::text,'role','seller'))))
    ORDER BY r.updated_at DESC`, [space, userId, id && recordId(id)]);
  return rows;
}

export async function listPurchaseCollaborations(q, userId) {
  return (await readRecords(q, userId)).map((row) => viewerProjection(row, userId));
}

async function invite(q, userId, data, { username, role, city }) {
  const handle = username.replace(/^@/u, "").toLowerCase();
  const { rows: [recipient] } = await q("SELECT id,username,account_type FROM users WHERE lower(username)=$1", [handle]);
  if (!recipient || recipient.id === userId || (role === "seller" && recipient.account_type !== "business")) {
    return { status: 400, error: role === "seller" ? "Укажите имя бизнес-аккаунта в Роллапп" : "Укажите имя другого пользователя Роллапп" };
  }
  if (role === "seller" && !city) return { status: 400, error: "Укажите город доставки" };
  const previous = data.recipients.find(({ id }) => id === recipient.id);
  if (previous) {
    if (previous.role === role && previous.city === city) return null;
    return { status: 409, error: "Сначала отзовите текущее приглашение для этого участника" };
  }
  if (data.recipients.length >= 8) return { status: 400, error: "Можно пригласить до восьми участников" };
  data.recipients.push({ id: recipient.id, username: recipient.username, role, city });
  return null;
}

function removeRecipient(data, id) {
  data.recipients = data.recipients.filter((entry) => entry.id !== id);
  if (data.assignedTo === id && !data.bought) data.assignedTo = null;
}

export function registerPurchaseCollaborationRoutes(app, { query, transaction, requireAuth, asyncRoute }) {
  const path = "/api/dashboard/purchase-collaborations/:id";
  app.get(path, requireAuth, asyncRoute(async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    const { id } = req.params;
    if (!needKey.test(id)) return res.status(404).json({ error: notFound.error });
    const userId = req.user.id;
    const [row] = await readRecords(query, userId, id);
    if (row) return res.json({ collaboration: viewerProjection(row, userId) });
    const task = await readPurchaseTask(query, userId, id);
    if (openPurchaseItem(task)?.need && !task.completed && !task.archived) return res.json({ collaboration: null });
    return res.status(404).json({ error: notFound.error });
  }));

  app.post(path, requireAuth, changeLimit, asyncRoute(async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    const { id } = req.params;
    const parsed = action.safeParse(req.body);
    if (!needKey.test(id) || !parsed.success) return res.status(400).json({ error: "Проверьте данные покупки" });
    const userId = req.user.id;
    const input = parsed.data;
    const result = await transaction(async (client) => {
      const q = (sql, values) => client.query(sql, values);
      const [accessible] = await readRecords(q, userId, id);
      const ownerId = accessible?.ownerId || userId;
      await lockPlanningOwner(q, ownerId);
      const task = await readPurchaseTask(q, ownerId, id);
      const purchase = openPurchaseItem(task);
      if (!purchase?.need || task.completed || task.archived) return notFound;
      const [stored] = await readRecords(q, userId, id);
      if (!stored && (input.action !== "invite" || ownerId !== userId)) return notFound;
      const data = stored?.data || { snapshot: { id, title: purchase.title, criteria: purchase.need.criteria,
        neededBy: purchase.need.neededBy, budgetMinor: purchase.purchaseBudget.minor, currency: purchase.purchaseBudget.currency, cycle: purchase.need.lastDecision ?? null },
        recipients: [], assignedTo: null, bought: false };
      const recipient = data.recipients.find((entry) => entry.id === userId);
      if (input.action === "invite" || input.action === "revoke") {
        if (ownerId !== userId) return forbidden;
        if (input.action === "invite") {
          const error = await invite(q, userId, data, input);
          if (error) return error;
        } else removeRecipient(data, input.recipientId);
      } else if (!recipient) return forbidden;
      else if (input.action === "decline") removeRecipient(data, userId);
      else if (input.action === "offer") {
        if (recipient.role !== "seller" || req.user.account_type !== "business") return forbidden;
        const { action: _action, ...offer } = input;
        recipient.offer = offer;
      } else {
        if (recipient.role !== "household") return forbidden;
        if (input.action === "pledge") {
          if (input.minor > data.snapshot.budgetMinor) return { status: 400, error: "Доля больше бюджета покупки" };
          recipient.pledgeMinor = input.minor;
        } else if ((input.action === "bought" && data.bought && data.assignedTo === userId)
          || (input.action === "release" && !data.bought && !data.assignedTo)) {
          return { collaboration: viewerProjection(stored, userId) };
        } else if (data.bought || (data.assignedTo && data.assignedTo !== userId)) return conflict;
        else if (input.action === "claim") data.assignedTo = userId;
        else if (data.assignedTo !== userId) return conflict;
        else if (input.action === "release") data.assignedTo = null;
        else if (input.action === "bought") data.bought = true;
      }
      await q(`INSERT INTO planning_tasks (id,user_id,space_id,title,status,completed,archived,related_items)
        VALUES ($1,$2,$3,$4,'done',true,true,$5)
        ON CONFLICT (id) DO UPDATE SET related_items=EXCLUDED.related_items,updated_at=clock_timestamp()
        WHERE planning_tasks.user_id=EXCLUDED.user_id AND planning_tasks.space_id=EXCLUDED.space_id`,
      [recordId(id), ownerId, space, data.snapshot.title, JSON.stringify([data])]);
      const [updated] = await readRecords(q, userId, id);
      return { collaboration: updated ? viewerProjection(updated, userId) : null };
    });
    return result.error ? res.status(result.status).json({ error: result.error }) : res.json(result);
  }));
}
