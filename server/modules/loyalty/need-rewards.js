import { randomUUID } from "node:crypto";
import { z } from "zod";
import { RollsError, ensureRollWallet } from "../payments/rolls.js";
import { ROLLS_MAX_BALANCE } from "../../../shared/modules/payments/rolls.js";
import { NEED_REWARDS_MAX_AMOUNT, NEED_REWARDS_HOLD_DAYS, needRewardActions } from "../../../shared/modules/loyalty/need-rewards.js";
import { createRateLimit } from "../runtime/rate-limit.js";
import { enqueueRewardReceipt } from "./reward-proof-queue.js";
import { AUTOMATIC_REWARD_CONFIRMATION, hasAutomaticRewardConfirmation } from "./need-reward-settlement-terms.js";

export const createRewardNeedSchema = z.object({
  title: z.string().trim().min(3).max(160), description: z.string().trim().min(10).max(1200),
  category: z.string().trim().max(80).default(""), publishedToBusinesses: z.literal(true), idempotencyKey: z.string().uuid(),
}).strict();
export const createRewardOfferSchema = z.object({
  description: z.string().trim().min(10).max(1200), reward: z.number().int().min(1).max(NEED_REWARDS_MAX_AMOUNT),
  idempotencyKey: z.string().uuid(),
}).strict();
export const rewardActionSchema = z.object({
  action: z.enum(["accept", "decline", "cancel", "deliver", "confirm", "claim", "dispute"]),
  reason: z.string().trim().max(1200).default(""),
  automaticSettlement: z.literal(true).optional(),
}).strict().refine(value => value.action !== "dispute" || value.reason.length >= 10)
  .refine(value => value.action === "confirm" || value.automaticSettlement === undefined);

function invalid(message = "Некорректные данные") { throw new RollsError(message, "INVALID_REWARD_REQUEST"); }
function parse(schema, input) { const result = schema.safeParse(input); if (!result.success) invalid(); return result.data; }
function uuid(id) { if (!z.string().uuid().safeParse(id).success) invalid(); return id; }
async function account(client, id) {
  const result = await client.query("SELECT id,account_type FROM users WHERE id=$1", [id]);
  if (!result.rowCount) throw new RollsError("Аккаунт не найден", "ACCOUNT_NOT_FOUND", 404);
  return result.rows[0];
}
function offer(row) {
  return {
    id: row.id, needId: row.need_id, businessId: row.business_id, businessName: row.business_name,
    description: row.description, reward: Number(row.reward), status: row.status,
    expiresAt: row.expires_at, claimAt: row.claim_at, settledAt: row.settled_at,
    automaticSettlement: Boolean(row.automatic_settlement),
    disputeReason: row.status === "disputed" ? row.dispute_reason : null,
    proofStatus: row.proof_status || null, receiptHash: row.receipt_hash || null,
    bitcoinHeight: row.bitcoin_height ?? null,
  };
}
async function event(client, offerId, actor, action, note = "") {
  await client.query("INSERT INTO reward_need_events (id,offer_id,actor_id,action,note) VALUES ($1,$2,$3,$4,$5)", [randomUUID(), offerId, actor, action, note]);
}

async function lockRewardOffer(client, offerId, { skipLocked = false } = {}) {
  // Every operation locks the need, then its offer, then the destination wallet.
  const { rows: [found] } = await client.query("SELECT need_id FROM reward_need_offers WHERE id=$1", [offerId]);
  if (!found) return null;
  const { rows: [need] } = await client.query(
    `SELECT * FROM reward_needs WHERE id=$1 FOR UPDATE${skipLocked ? " SKIP LOCKED" : ""}`, [found.need_id],
  );
  if (!need) return null;
  const { rows: [row] } = await client.query(`
    SELECT o.*,${hasAutomaticRewardConfirmation} AS automatic_settlement,clock_timestamp() AS server_now
    FROM reward_need_offers o WHERE o.id=$1 FOR UPDATE OF o`, [offerId]);
  return row ? { need, row } : null;
}

export async function createRewardNeed(client, userId, input) {
  const data = parse(createRewardNeedSchema, input);
  // Serialize both the per-person cap and retries across independent processes.
  await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [userId]);
  const old = await client.query("SELECT * FROM reward_needs WHERE user_id=$1 AND idempotency_key=$2", [userId, data.idempotencyKey]);
  if (old.rowCount) {
    const row = old.rows[0];
    if (row.title !== data.title || row.description !== data.description || row.category !== data.category) throw new RollsError("Ключ уже использован для другой потребности", "IDEMPOTENCY_CONFLICT", 409);
    return { id: row.id, replayed: true };
  }
  const count = await client.query("SELECT count(*)::int AS count FROM reward_needs WHERE user_id=$1 AND status<>'closed'", [userId]);
  if (count.rows[0].count >= 20) throw new RollsError("Сначала закройте одну из 20 активных потребностей", "NEEDS_LIMIT", 409);
  const id = randomUUID();
  await client.query("INSERT INTO reward_needs (id,user_id,title,description,category,idempotency_key) VALUES ($1,$2,$3,$4,$5,$6)", [id, userId, data.title, data.description, data.category, data.idempotencyKey]);
  return { id, replayed: false };
}

export async function createRewardOffer(client, businessId, needId, input) {
  uuid(needId);
  const data = parse(createRewardOfferSchema, input);
  if ((await account(client, businessId)).account_type !== "business") throw new RollsError("Предлагать решения могут бизнес-аккаунты", "BUSINESS_REQUIRED", 403);
  const needs = await client.query("SELECT * FROM reward_needs WHERE id=$1 FOR UPDATE", [needId]);
  if (!needs.rowCount) throw new RollsError("Потребность не найдена", "NEED_NOT_FOUND", 404);
  const need = needs.rows[0];
  if (need.user_id === businessId) throw new RollsError("Нельзя вознаграждать себя", "SELF_REWARD", 409);
  // Wallet lock serializes idempotency keys reused for different needs too.
  await ensureRollWallet(client, businessId);
  const previous = await client.query("SELECT * FROM reward_need_offers WHERE business_id=$1 AND idempotency_key=$2", [businessId, data.idempotencyKey]);
  if (previous.rowCount) {
    const row = previous.rows[0];
    if (row.need_id !== needId || row.description !== data.description || Number(row.reward) !== data.reward) throw new RollsError("Ключ уже использован для другого предложения", "IDEMPOTENCY_CONFLICT", 409);
    return { id: row.id, replayed: true };
  }
  if (need.status !== "open") throw new RollsError("Потребность уже в работе или закрыта", "NEED_CLOSED", 409);
  const existing = await client.query("SELECT id FROM reward_need_offers WHERE need_id=$1 AND business_id=$2", [needId, businessId]);
  if (existing.rowCount) throw new RollsError("Вы уже отправили предложение по этой потребности", "OFFER_EXISTS", 409);
  const total = await client.query("SELECT count(*)::int AS count FROM reward_need_offers WHERE need_id=$1 AND status='offered'", [needId]);
  if (total.rows[0].count >= 10) throw new RollsError("У потребности уже есть 10 предложений", "OFFERS_LIMIT", 409);
  const debit = await client.query("UPDATE roll_wallets SET balance=balance-$1 WHERE user_id=$2 AND balance >= $1 RETURNING balance", [data.reward, businessId]);
  if (!debit.rowCount) throw new RollsError("Недостаточно роллов для резерва награды", "INSUFFICIENT_ROLLS", 409);
  const id = randomUUID();
  await client.query("INSERT INTO reward_need_offers (id,need_id,business_id,description,reward,idempotency_key) VALUES ($1,$2,$3,$4,$5,$6)", [id, needId, businessId, data.description, data.reward, data.idempotencyKey]);
  await client.query("INSERT INTO reward_need_entries (id,offer_id,user_id,kind,amount) VALUES ($1,$2,$3,'reserve',$4)", [randomUUID(), id, businessId, data.reward]);
  await event(client, id, businessId, "offer");
  return { id, replayed: false };
}

async function release(client, row, userId, kind) {
  await ensureRollWallet(client, userId);
  const credited = await client.query("UPDATE roll_wallets SET balance=balance+$1 WHERE user_id=$2 AND balance <= $3 RETURNING balance", [row.reward, userId, ROLLS_MAX_BALANCE - Number(row.reward)]);
  if (!credited.rowCount) throw new RollsError("Кошелёк достиг лимита. Освободите место и повторите действие", "BALANCE_LIMIT", 409);
  await client.query("INSERT INTO reward_need_entries (id,offer_id,user_id,kind,amount) VALUES ($1,$2,$3,$4,$5)", [randomUUID(), row.id, userId, kind, row.reward]);
  await enqueueRewardReceipt(client, row, userId, kind);
}

async function recordRewardStatus(client, row, status) {
  await client.query(`UPDATE reward_need_offers SET status=$2,
    settled_at=CASE WHEN $2='settled' THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id=$1`, [row.id, status]);
}

async function settleReward(client, need, row, actor) {
  await release(client, row, need.user_id, "reward");
  await client.query("UPDATE reward_needs SET status='closed' WHERE id=$1", [need.id]);
  await recordRewardStatus(client, row, "settled");
  await event(client, row.id, actor, actor ? "claim" : "automatic_claim");
}

export async function actOnRewardOffer(client, userId, offerId, input) {
  uuid(offerId);
  const { action, reason, automaticSettlement = false } = parse(rewardActionSchema, input);
  const locked = await lockRewardOffer(client, offerId);
  if (!locked) throw new RollsError("Предложение не найдено", "OFFER_NOT_FOUND", 404);
  const { need, row } = locked;
  const business = row.business_id === userId;
  if (!business && need.user_id !== userId) throw new RollsError("Предложение не найдено", "OFFER_NOT_FOUND", 404);
  const terminalReplay = { claim: "settled", cancel: "cancelled", decline: "declined", confirm: "confirmed", deliver: "delivered", accept: "accepted", dispute: "disputed" };
  const businessAction = ["cancel", "deliver"].includes(action);
  if (action !== "dispute" && business !== businessAction) throw new RollsError("Действие недоступно", "ACTION_FORBIDDEN", 403);
  if (row.status === terminalReplay[action] || (action === "confirm" && row.status === "settled" && row.automatic_settlement)) {
    if (action === "confirm" && automaticSettlement !== row.automatic_settlement) {
      throw new RollsError("Результат уже подтверждён с другими условиями", "REWARD_CONFIRMATION_CONFLICT", 409);
    }
    if (action === "dispute") {
      const { rows: [recorded] } = await client.query(
        "SELECT actor_id FROM reward_need_events WHERE offer_id=$1 AND action='dispute' ORDER BY created_at DESC,id DESC LIMIT 1", [row.id],
      );
      if (recorded?.actor_id !== userId || row.dispute_reason !== reason) {
        throw new RollsError("Спор уже открыт", "REWARD_DISPUTE_CONFLICT", 409);
      }
    }
    return { id: row.id, status: row.status, replayed: true };
  }
  if (!needRewardActions(offer(row), business, row.server_now.getTime()).includes(action)) {
    throw new RollsError("Состояние изменилось. Обновите страницу", "REWARD_STATE_CONFLICT", 409);
  }
  if (action === "accept" && need.status !== "open") throw new RollsError("Другая заявка уже принята", "NEED_CLOSED", 409);
  if (action === "claim") {
    await settleReward(client, need, row, userId);
    return { id: row.id, status: "settled", replayed: false };
  }
  let status;
  if (action === "accept") {
    status = "accepted";
    await client.query("UPDATE reward_needs SET status='matched' WHERE id=$1", [need.id]);
  } else if (action === "decline" || action === "cancel") {
    status = action === "decline" ? "declined" : "cancelled";
    await release(client, row, row.business_id, "refund");
    if (row.status === "accepted") await client.query("UPDATE reward_needs SET status='open' WHERE id=$1", [need.id]);
  } else if (action === "deliver") status = "delivered";
  else if (action === "confirm") {
    status = "confirmed";
    await client.query("UPDATE reward_need_offers SET claim_at=$2::timestamptz+make_interval(hours=>$3) WHERE id=$1",
      [row.id, row.server_now, NEED_REWARDS_HOLD_DAYS * 24]);
  } else {
    status = "disputed";
    await client.query("UPDATE reward_need_offers SET dispute_reason=$2 WHERE id=$1", [row.id, reason]);
  }
  await recordRewardStatus(client, row, status);
  await event(client, row.id, userId, action, action === "confirm" && automaticSettlement ? AUTOMATIC_REWARD_CONFIRMATION : "");
  return { id: row.id, status, replayed: false };
}

export async function closeRewardNeed(client, userId, needId) {
  uuid(needId);
  const need = await client.query("SELECT * FROM reward_needs WHERE id=$1 AND user_id=$2 FOR UPDATE", [needId, userId]);
  if (!need.rowCount) throw new RollsError("Потребность не найдена", "NEED_NOT_FOUND", 404);
  if (need.rows[0].status === "closed") return;
  const active = await client.query("SELECT id FROM reward_need_offers WHERE need_id=$1 AND status NOT IN ('declined','cancelled') LIMIT 1", [needId]);
  if (active.rowCount) throw new RollsError("Сначала отклоните предложения или завершите текущую работу", "NEED_HAS_OFFERS", 409);
  await client.query("UPDATE reward_needs SET status='closed' WHERE id=$1", [needId]);
}

export async function expireRewardOffer(client, offerId) {
  uuid(offerId);
  const locked = await lockRewardOffer(client, offerId, { skipLocked: true });
  if (!locked) return false;
  const { row } = locked;
  if (row.status !== "offered" || row.expires_at > row.server_now) return false;
  await release(client, row, row.business_id, "refund");
  await recordRewardStatus(client, row, "cancelled");
  await event(client, offerId, null, "expire");
  return true;
}

export async function automaticallySettleRewardOffer(client, offerId) {
  uuid(offerId);
  const locked = await lockRewardOffer(client, offerId, { skipLocked: true });
  if (!locked) return false;
  const { need, row } = locked;
  if (row.status !== "confirmed" || !row.automatic_settlement || !row.claim_at || row.claim_at > row.server_now) return false;
  await settleReward(client, need, row, null);
  return true;
}

const rewardSettlementBatchSize = 20;

export async function processDueRewardOffers({ query, transaction, cursor, shouldStop = () => false, onError }) {
  const { rows } = await query(`
    WITH due AS (
      SELECT id,'expire' AS action,expires_at AS due_at
      FROM reward_need_offers WHERE status='offered' AND expires_at<=statement_timestamp()
      UNION ALL
      SELECT id,'automatic_claim',claim_at FROM reward_need_offers o
      WHERE status='confirmed' AND claim_at<=statement_timestamp() AND ${hasAutomaticRewardConfirmation}
    )
    SELECT id,action,due_at::text AS "dueAt" FROM due
    WHERE $1::timestamptz IS NULL OR (due_at,id)>($1::timestamptz,$2::uuid)
    ORDER BY due_at,id LIMIT $3`, [cursor?.dueAt ?? null, cursor?.id ?? null, rewardSettlementBatchSize]);
  for (const { id, action } of rows) {
    if (shouldStop()) break;
    try {
      await transaction(async (client) => {
        await client.query("SET LOCAL lock_timeout='2s'");
        return action === "expire" ? expireRewardOffer(client, id) : automaticallySettleRewardOffer(client, id);
      });
    } catch (error) { if (!shouldStop()) onError(error); }
  }
  // A failure at the head must not prevent unrelated offers from completing.
  // Wrap after the final page so blocked rows are retried on later ticks.
  return rows.length === rewardSettlementBatchSize ? rows.at(-1) : null;
}

export function startNeedRewardSettlementWorker({ query, transaction, env = process.env }) {
  if (env.ROLLAPP_NEED_REWARDS_ENABLED !== "true") return { stop() {} };
  let running = false, stopped = false, cursor = null;
  const tick = async () => {
    if (running || stopped) return;
    running = true;
    try {
      cursor = await processDueRewardOffers({
        query, transaction, cursor, shouldStop: () => stopped,
        onError: () => console.error("[need-rewards] Scheduled reserve settlement failed; retry scheduled."),
      });
    } catch { if (!stopped) console.error("[need-rewards] Settlement queue unavailable; retry scheduled."); }
    finally { running = false; }
  };
  const timer = setInterval(tick, 60_000); timer.unref();
  return { stop() { stopped = true; clearInterval(timer); } };
}

// Operations-only adjudication. Deliberately has no HTTP route or client role.
// Invoke only after reviewing evidence, through the explicit production CLI.
export async function resolveRewardDispute(client, offerId, outcome, reason) {
  uuid(offerId);
  if (!["refund", "reward"].includes(outcome) || typeof reason !== "string" || reason.trim().length < 10 || reason.length > 1200) invalid();
  const locked = await lockRewardOffer(client, offerId);
  if (!locked) throw new RollsError("Предложение не найдено", "OFFER_NOT_FOUND", 404);
  const { need, row } = locked;
  if (row.status !== "disputed") throw new RollsError("Решение применимо только к открытому спору", "REWARD_STATE_CONFLICT", 409);
  await release(client, row, outcome === "reward" ? need.user_id : row.business_id, outcome);
  await client.query("UPDATE reward_need_offers SET status=$2,claim_at=CASE WHEN $2='settled' THEN CURRENT_TIMESTAMP ELSE claim_at END,settled_at=CASE WHEN $2='settled' THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id=$1", [offerId, outcome === "reward" ? "settled" : "cancelled"]);
  await client.query("UPDATE reward_needs SET status=$2 WHERE id=$1", [need.id, outcome === "reward" ? "closed" : "open"]);
  await client.query("INSERT INTO reward_need_events (id,offer_id,actor_id,action,note) VALUES ($1,$2,NULL,$3,$4)", [randomUUID(), offerId, `resolve_${outcome}`, reason.trim()]);
  return { id: offerId, outcome };
}

export async function readRewardNeeds(client, userId, offset = 0) {
  const business = (await account(client, userId)).account_type === "business";
  const result = await client.query(`SELECT n.* FROM reward_needs n
    WHERE n.user_id=$1 OR ($2::boolean AND (n.status='open' OR EXISTS
      (SELECT 1 FROM reward_need_offers o WHERE o.need_id=n.id AND o.business_id=$1)))
    ORDER BY n.created_at DESC,n.id LIMIT 51 OFFSET $3`, [userId, business, offset]);
  const rows = result.rows.slice(0, 50);
  const offers = rows.length ? await client.query(`SELECT o.*,u.name AS business_name,
    ${hasAutomaticRewardConfirmation} AS automatic_settlement,r.status AS proof_status,r.digest AS receipt_hash,r.bitcoin_height FROM reward_need_offers o
    JOIN reward_needs n ON n.id=o.need_id JOIN users u ON u.id=o.business_id
    LEFT JOIN reward_blockchain_receipts r ON r.offer_id=o.id
    WHERE o.need_id=ANY($1::uuid[]) AND (n.user_id=$2 OR o.business_id=$2)
    ORDER BY o.created_at,o.id`, [rows.map(row => row.id), userId]) : { rows: [] };
  const totals = (await client.query(`SELECT
    COALESCE(sum(o.reward) FILTER (WHERE o.business_id=$1 AND o.status IN ('offered','accepted','delivered','confirmed','disputed')),0)::text AS reserved,
    COALESCE(sum(o.reward) FILTER (WHERE n.user_id=$1 AND o.status='settled'),0)::text AS earned,
    count(*) FILTER (WHERE o.business_id=$1 AND o.status='settled')::int AS completed
    FROM reward_need_offers o JOIN reward_needs n ON n.id=o.need_id
    WHERE n.user_id=$1 OR o.business_id=$1`, [userId])).rows[0];
  return {
    business, nextOffset: result.rows.length > 50 ? offset + 50 : null,
    totals: { reserved: totals.reserved, earned: totals.earned, completed: totals.completed },
    needs: rows.map(row => ({ id: row.id, title: row.title, description: row.description,
      category: row.category, status: row.status, isMine: row.user_id === userId,
      offers: offers.rows.filter(item => item.need_id === row.id).map(offer) })),
  };
}

export function registerNeedRewardsRoutes(app, { requireAuth, transaction, env = process.env }) {
  const enabled = () => env.ROLLAPP_NEED_REWARDS_ENABLED === "true";
  const limit = createRateLimit({ windowMs: 60_000, max: 20, key: req => req.user.id });
  const handle = fn => async (req, res, next) => {
    res.set("Cache-Control", "no-store");
    try {
      if (!enabled()) throw new RollsError("Вознаграждения за потребности ещё не включены", "NEED_REWARDS_DISABLED", 503);
      await fn(req, res);
    } catch (error) {
      if (error instanceof RollsError) return res.status(error.status).json({ error: error.message, code: error.code });
      next(error);
    }
  };
  app.get("/api/need-rewards/config", requireAuth, (_req, res) => {
    res.set("Cache-Control", "no-store").json({ enabled: enabled(), proofsEnabled: env.ROLLAPP_REWARD_PROOFS_ENABLED === "true", holdDays: NEED_REWARDS_HOLD_DAYS, automaticSettlement: enabled(), maxReward: NEED_REWARDS_MAX_AMOUNT, currency: "rolls" });
  });
  app.get("/api/need-rewards", requireAuth, handle(async (req, res) => {
    const offset = req.query.offset === undefined ? 0 : Number(req.query.offset);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 10000) invalid();
    res.json(await transaction(client => readRewardNeeds(client, req.user.id, offset)));
  }));
  app.get("/api/need-rewards/offers/:id/receipt/:format", requireAuth, handle(async (req, res) => {
    uuid(req.params.id);
    if (!["json", "ots"].includes(req.params.format)) invalid();
    const result = await transaction(client => client.query(`SELECT r.content,r.proof FROM reward_blockchain_receipts r
      JOIN reward_need_offers o ON o.id=r.offer_id JOIN reward_needs n ON n.id=o.need_id
      WHERE r.offer_id=$1 AND (n.user_id=$2 OR o.business_id=$2)`, [req.params.id, req.user.id]));
    if (!result.rowCount) throw new RollsError("Квитанция не найдена", "RECEIPT_NOT_FOUND", 404);
    const row = result.rows[0];
    if (req.params.format === "ots" && !row.proof) throw new RollsError("Блокчейн-подтверждение ещё готовится", "PROOF_PENDING", 409);
    const filename = `rollapp-reward-${req.params.id}.json${req.params.format === "ots" ? ".ots" : ""}`;
    res.set("Content-Disposition", `attachment; filename="${filename}"`);
    res.type(req.params.format === "json" ? "application/json" : "application/octet-stream").send(req.params.format === "json" ? row.content : row.proof);
  }));
  app.post("/api/need-rewards", requireAuth, limit, handle(async (req, res) => {
    const need = await transaction(client => createRewardNeed(client, req.user.id, req.body));
    res.status(need.replayed ? 200 : 201).json({ need });
  }));
  app.post("/api/need-rewards/:id/close", requireAuth, limit, handle(async (req, res) => {
    await transaction(client => closeRewardNeed(client, req.user.id, req.params.id));
    res.json({ closed: true });
  }));
  app.post("/api/need-rewards/:id/offers", requireAuth, limit, handle(async (req, res) => {
    const result = await transaction(client => createRewardOffer(client, req.user.id, req.params.id, req.body));
    res.status(result.replayed ? 200 : 201).json({ offer: result });
  }));
  app.post("/api/need-rewards/offers/:id/actions", requireAuth, limit, handle(async (req, res) => {
    res.json({ offer: await transaction(client => actOnRewardOffer(client, req.user.id, req.params.id, req.body)) });
  }));
}
