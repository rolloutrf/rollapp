import { randomUUID } from "node:crypto";
import { z } from "zod";
import { RollsError, transferRolls } from "./rolls.js";
import { ROLLS_MAX_TRANSFER } from "../shared/rolls.js";
import { createRateLimit } from "./rate-limit.js";

export const fundraiserTargetSchema = z.object({ target: z.number().int().min(1).max(ROLLS_MAX_TRANSFER) }).strict();
export const fundraiserUpdateSchema = fundraiserTargetSchema.extend({ accepting: z.boolean() }).strict();
export const contributionSchema = z.object({
  amount: z.number().int().min(1).max(ROLLS_MAX_TRANSFER),
  idempotencyKey: z.string().uuid(),
  shareToken: z.string().max(200).default(""),
}).strict();

export function publicFundraiser(row) {
  if (!row) return null;
  const raised = Number(row.raised);
  const target = Number(row.target);
  return { id: row.id, target, raised, contributors: Number(row.contributors), accepting: row.accepting,
    status: raised >= target ? "completed" : row.accepting ? "active" : "closed" };
}

export async function readGroupFundraiser(client, groupId) {
  const result = await client.query(
    `SELECT f.*,COALESCE(sum(t.amount),0)::text AS raised,count(DISTINCT c.sender_id)::int AS contributors
     FROM wish_group_fundraisers f
     LEFT JOIN wish_group_contributions c ON c.fundraiser_id=f.id
     LEFT JOIN roll_transactions t ON t.id=c.transaction_id
     WHERE f.group_id=$1 GROUP BY f.id`, [groupId]);
  return publicFundraiser(result.rows[0]);
}

// The caller locks the source group/list first, so moving, deleting, closing and
// contributing cannot race. The financial ledger survives group/list deletion.
export async function contributeToGroup(client, group, senderId, input) {
  const parsed = contributionSchema.safeParse(input);
  if (!parsed.success) throw new RollsError("Укажите целое количество роллов", "INVALID_CONTRIBUTION");
  const { amount, idempotencyKey } = parsed.data;
  const found = await client.query("SELECT * FROM wish_group_fundraisers WHERE group_id=$1 FOR UPDATE", [group.id]);
  if (!found.rowCount) throw new RollsError("Сбор ещё не открыт", "FUNDRAISER_NOT_FOUND", 404);
  const fund = found.rows[0];
  const previous = await client.query(
    `SELECT c.fundraiser_id,t.id,t.amount FROM wish_group_contributions c
     JOIN roll_transactions t ON t.id=c.transaction_id WHERE c.sender_id=$1 AND c.idempotency_key=$2`, [senderId, idempotencyKey]);
  if (previous.rowCount) {
    const row = previous.rows[0];
    if (row.fundraiser_id !== fund.id || Number(row.amount) !== amount) throw new RollsError("Запрос уже использован для другого взноса", "IDEMPOTENCY_CONFLICT", 409);
    return { id: row.id, replayed: true, fundraiser: await readGroupFundraiser(client, group.id) };
  }
  if (senderId === fund.owner_id) throw new RollsError("Владелец не может переводить роллы самому себе", "SELF_TRANSFER");
  const current = await readGroupFundraiser(client, group.id);
  if (current.status !== "active") throw new RollsError("Сбор завершён или приостановлен", "FUNDRAISER_CLOSED", 409);
  if (amount > current.target - current.raised) throw new RollsError("Сумма превышает остаток до цели. Обновите сбор", "TARGET_EXCEEDED", 409);
  const transfer = await transferRolls(client, senderId, {
    recipientId: fund.owner_id, amount, note: `Сбор «${fund.title}»`, idempotencyKey,
  });
  if (transfer.replayed) throw new RollsError("Запрос уже использован", "IDEMPOTENCY_CONFLICT", 409);
  await client.query(
    "INSERT INTO wish_group_contributions (transaction_id,fundraiser_id,sender_id,idempotency_key) VALUES ($1,$2,$3,$4)",
    [transfer.id, fund.id, senderId, idempotencyKey]);
  return { ...transfer, fundraiser: await readGroupFundraiser(client, group.id) };
}

export function registerWishGroupFundraisingRoutes(app, { requireAuth, query, transaction, canViewWish }) {
  const limit = createRateLimit({ windowMs: 60_000, max: 20, key: req => req.user.id });
  const handle = handler => async (req, res, next) => {
    res.set("Cache-Control", "private, no-store"); res.vary("Cookie");
    try { await handler(req, res); } catch (error) {
      if (error instanceof RollsError) return res.status(error.status).json({ error: error.message, code: error.code });
      if (error.code === "42P01") return res.status(503).json({ error: "Сборы пока недоступны: требуется обновление схемы базы данных", code: "FUNDRAISING_SCHEMA_REQUIRED" });
      if (error.code === "23505") return res.status(409).json({ error: "Запрос уже выполнен. Обновите сбор", code: "IDEMPOTENCY_CONFLICT" });
      next(error);
    }
  };
  const access = async (client, req, { ownerOnly = false, lock = false, shareToken = "" } = {}) => {
    const found = await client.query(
      `SELECT g.id,g.space,g.title,l.user_id,l.privacy,l.share_token FROM wish_groups g
       JOIN wishlists l ON l.id=g.wishlist_id WHERE g.id=$1 ${lock ? "FOR UPDATE OF g,l" : ""}`, [req.params.groupId]);
    const group = found.rows[0];
    const missing = () => { throw new RollsError("Группа не найдена", "GROUP_NOT_FOUND", 404); };
    if (!group || group.space !== "products") return missing();
    const isOwner = group.user_id === req.user?.id;
    if (isOwner) return { ...group, isOwner };
    if (ownerOnly) return missing();
    const grant = req.user?.account_type === "business" && Boolean((await client.query(
      "SELECT 1 FROM sphere_section_shares WHERE viewer_user_id=$1 AND owner_user_id=$2 AND sphere='wishlist' AND section='wishlist'", [req.user.id, group.user_id])).rowCount);
    let allowed = group.privacy === "public" || (group.privacy === "link" && shareToken && group.share_token === shareToken);
    if (!allowed && group.privacy === "followers" && req.user) {
      allowed = Boolean((await client.query("SELECT 1 FROM follows WHERE follower_id=$1 AND following_id=$2", [req.user.id, group.user_id])).rowCount);
    }
    allowed = allowed || grant;
    if (!allowed) return missing();
    const members = await client.query("SELECT w.* FROM wish_group_members m JOIN wishes w ON w.id=m.wish_id WHERE m.group_id=$1 AND w.status='active'", [group.id]);
    for (const wish of members.rows) if (grant || await canViewWish(wish, req.user?.id, shareToken, client)) return { ...group, isOwner };
    return missing();
  };
  app.get("/api/wish-groups/:groupId/fundraiser", handle(async (req, res) => {
    const group = await access({ query }, req, { shareToken: typeof req.query.shareToken === "string" ? req.query.shareToken : "" });
    const balance = req.user ? await query("SELECT balance FROM roll_wallets WHERE user_id=$1", [req.user.id]) : null;
    res.json({ fundraiser: await readGroupFundraiser({ query }, group.id), isOwner: group.isOwner, signedIn: Boolean(req.user), balance: req.user ? Number(balance.rows[0]?.balance || 0) : null });
  }));
  app.post("/api/wish-groups/:groupId/fundraiser", requireAuth, limit, handle(async (req, res) => {
    const parsed = fundraiserTargetSchema.safeParse(req.body);
    if (!parsed.success) throw new RollsError("Укажите цель сбора целым числом роллов", "INVALID_TARGET");
    const fundraiser = await transaction(async client => {
      const group = await access(client, req, { ownerOnly: true, lock: true });
      const existing = await readGroupFundraiser(client, group.id);
      if (existing) {
        if (existing.target === parsed.data.target) return existing;
        throw new RollsError("Сбор уже создан", "FUNDRAISER_EXISTS", 409);
      }
      await client.query("INSERT INTO wish_group_fundraisers (id,group_id,owner_id,title,target) VALUES ($1,$2,$3,$4,$5)", [randomUUID(), group.id, req.user.id, group.title, parsed.data.target]);
      return readGroupFundraiser(client, group.id);
    });
    res.status(201).json({ fundraiser });
  }));
  app.patch("/api/wish-groups/:groupId/fundraiser", requireAuth, limit, handle(async (req, res) => {
    const parsed = fundraiserUpdateSchema.safeParse(req.body);
    if (!parsed.success) throw new RollsError("Проверьте настройки сбора", "INVALID_TARGET");
    const fundraiser = await transaction(async client => {
      const group = await access(client, req, { ownerOnly: true, lock: true });
      const current = await readGroupFundraiser(client, group.id);
      if (!current) throw new RollsError("Сбор не найден", "FUNDRAISER_NOT_FOUND", 404);
      if (parsed.data.target < current.raised) throw new RollsError("Цель не может быть меньше уже собранной суммы", "TARGET_BELOW_RAISED", 409);
      await client.query("UPDATE wish_group_fundraisers SET target=$1,accepting=$2 WHERE group_id=$3", [parsed.data.target, parsed.data.accepting, group.id]);
      return readGroupFundraiser(client, group.id);
    });
    res.json({ fundraiser });
  }));
  app.post("/api/wish-groups/:groupId/fundraiser/contributions", requireAuth, limit, handle(async (req, res) => {
    const parsed = contributionSchema.safeParse(req.body);
    if (!parsed.success) throw new RollsError("Проверьте сумму взноса", "INVALID_CONTRIBUTION");
    const result = await transaction(async client => {
      const group = await access(client, req, { lock: true, shareToken: parsed.data.shareToken });
      return contributeToGroup(client, group, req.user.id, parsed.data);
    });
    res.status(result.replayed ? 200 : 201).json(result);
  }));
}
