import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ensureRollWallet, RollsError } from "../payments/rolls.js";
import { ROLLS_MAX_TRANSFER } from "../../../shared/modules/payments/rolls.js";
import { giftCardCreditLimit } from "./gift-card-balances.js";
import { createRateLimit } from "../runtime/rate-limit.js";

const key = z.string().uuid();
export const giftIssueSchema = z.object({ businessId: z.string().min(1).max(200), idempotencyKey: key }).strict();
export const giftTopupSchema = z.object({ amount: z.number().int().min(1).max(ROLLS_MAX_TRANSFER), idempotencyKey: key }).strict();
export const giftSendSchema = z.object({
  recipientId: z.string().min(1).max(200), idempotencyKey: key,
  expectedBalance: z.number().int().min(1).max(ROLLS_MAX_TRANSFER).optional(),
}).strict();
const operationParams = z.object({ kind: z.enum(["issue", "topup", "send"]), requestKey: key }).strict();

function parse(schema, input) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new RollsError("Проверьте данные подарочной карты", "INVALID_GIFT_CARD");
  return parsed.data;
}

async function findIssuedGiftCard(client, userId, requestKey) {
  const { rows: [card] } = await client.query("SELECT * FROM business_gift_cards WHERE creator_id=$1 AND issue_key=$2", [userId, requestKey]);
  return card;
}

async function findGiftCardEvent(client, userId, requestKey) {
  const { rows: [event] } = await client.query("SELECT * FROM business_gift_card_events WHERE actor_id=$1 AND request_key=$2", [userId, requestKey]);
  return event;
}

export async function readGiftCardOperation(client, userId, input) {
  const { kind, requestKey } = parse(operationParams, input);
  if (kind === "issue") {
    const card = await findIssuedGiftCard(client, userId, requestKey);
    return card ? { id: card.id, kind, businessId: card.business_id } : null;
  }
  const event = await findGiftCardEvent(client, userId, requestKey);
  if (!event) return null;
  if (event.kind !== kind) throw new RollsError("Запрос уже использован для другого действия", "IDEMPOTENCY_CONFLICT", 409);
  const { rows: [card] } = await client.query("SELECT business_id FROM business_gift_cards WHERE id=$1", [event.card_id]);
  return {
    id: event.card_id, kind, businessId: card.business_id,
    ...(kind === "topup" ? { amount: Number(event.amount) } : { recipientId: event.recipient_id }),
  };
}

export async function issueGiftCard(client, userId, input) {
  const { businessId, idempotencyKey } = parse(giftIssueSchema, input);
  const business = await client.query("SELECT id FROM users WHERE id=$1 AND account_type='business'", [businessId]);
  if (!business.rowCount) throw new RollsError("Бизнес-аккаунт не найден", "BUSINESS_NOT_FOUND", 404);
  // A wallet lock serializes issuance and all money operations for this owner.
  await ensureRollWallet(client, userId);
  const previous = await findIssuedGiftCard(client, userId, idempotencyKey);
  if (previous) {
    if (previous.business_id !== businessId) throw new RollsError("Запрос уже использован", "IDEMPOTENCY_CONFLICT", 409);
    return { id: previous.id, replayed: true };
  }
  const id = randomUUID();
  await client.query("INSERT INTO business_gift_cards(id,business_id,creator_id,owner_id,issue_key) VALUES($1,$2,$3,$3,$4)", [id, businessId, userId, idempotencyKey]);
  return { id, replayed: false };
}

export async function lockOwnedGiftCard(client, userId, cardId) {
  const result = await client.query("SELECT * FROM business_gift_cards WHERE id=$1 FOR UPDATE", [cardId]);
  if (!result.rowCount || result.rows[0].owner_id !== userId) throw new RollsError("Карта не найдена или уже передана", "GIFT_CARD_NOT_FOUND", 404);
  return result.rows[0];
}

export async function recordGiftEvent(client, { id = randomUUID(), cardId, userId, kind, amount = 0, recipientId = null, requestKey, purchase = null }) {
  await client.query(`INSERT INTO business_gift_card_events(id,card_id,actor_id,kind,amount,recipient_id,request_key,purchase)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`, [id, cardId, userId, kind, amount, recipientId, requestKey, purchase ? JSON.stringify(purchase) : null]);
  return id;
}

export async function changeGiftCard(client, userId, cardId, kind, input) {
  if (!["topup", "send"].includes(kind)) throw new RollsError("Неизвестное действие", "INVALID_GIFT_CARD");
  const data = parse(kind === "topup" ? giftTopupSchema : giftSendSchema, input);
  await ensureRollWallet(client, userId);
  const event = await findGiftCardEvent(client, userId, data.idempotencyKey);
  if (event) {
    if (event.card_id !== cardId || event.kind !== kind || Number(event.amount) !== (data.amount || 0) || event.recipient_id !== (data.recipientId || null)) {
      throw new RollsError("Запрос уже использован для другого действия", "IDEMPOTENCY_CONFLICT", 409);
    }
    return { id: cardId, replayed: true };
  }
  const card = await lockOwnedGiftCard(client, userId, cardId);
  if (kind === "topup") {
    if (Number(card.balance) > await giftCardCreditLimit(client, cardId, data.amount, { cardLocked: true })) throw new RollsError("Карта достигла лимита", "GIFT_CARD_LIMIT", 409);
    const debit = await client.query("UPDATE roll_wallets SET balance=balance-$1 WHERE user_id=$2 AND balance >= $1 RETURNING balance", [data.amount, userId]);
    if (!debit.rowCount) throw new RollsError("Недостаточно роллов", "INSUFFICIENT_ROLLS", 409);
    await client.query("UPDATE business_gift_cards SET balance=balance+$1 WHERE id=$2", [data.amount, cardId]);
  } else {
    if (data.recipientId === userId) throw new RollsError("Выберите другого человека", "SELF_TRANSFER");
    if (data.expectedBalance !== undefined && Number(card.balance) !== data.expectedBalance) {
      throw new RollsError("Остаток карты изменился. Проверьте сумму подарка и подтвердите отправку снова.", "GIFT_BALANCE_CHANGED", 409);
    }
    if (Number(card.balance) === 0) throw new RollsError("Сначала пополните карту", "EMPTY_GIFT_CARD", 409);
    const recipient = await client.query("SELECT id FROM users WHERE id=$1", [data.recipientId]);
    if (!recipient.rowCount) throw new RollsError("Получатель не найден", "RECIPIENT_NOT_FOUND", 404);
    await client.query("UPDATE business_gift_cards SET owner_id=$1 WHERE id=$2", [data.recipientId, cardId]);
  }
  await recordGiftEvent(client, { cardId, userId, kind, amount: data.amount, recipientId: data.recipientId, requestKey: data.idempotencyKey });
  return { id: cardId, replayed: false };
}

export async function listGiftCards(query, userId) {
  const result = await query(`SELECT c.id,c.balance,c.created_at,u.id AS business_id,u.name,u.username,u.avatar_url
    FROM business_gift_cards c JOIN users u ON u.id=c.business_id
    WHERE c.owner_id=$1 ORDER BY c.created_at DESC,c.id`, [userId]);
  return result.rows.map((row) => ({ id: row.id, balance: Number(row.balance), createdAt: row.created_at,
    business: { id: row.business_id, name: row.name, username: row.username, avatarUrl: row.avatar_url } }));
}

export function registerGiftCardRoutes(app, { requireAuth, query, transaction }) {
  const limit = createRateLimit({ windowMs: 60_000, max: 20, key: (req) => req.user.id });
  const handle = (fn) => async (req, res, next) => {
    res.set("Cache-Control", "no-store");
    try { await fn(req, res); } catch (error) {
      if (error instanceof RollsError) return res.status(error.status).json({ error: error.message, code: error.code });
      if (error.code === "42P01") return res.status(503).json({ error: "Подарочные карты временно недоступны. Попробуйте позже.", code: "GIFT_CARDS_UNAVAILABLE" });
      next(error);
    }
  };
  app.get("/api/rolls/gift-cards", requireAuth, handle(async (req, res) => res.json({ cards: await listGiftCards(query, req.user.id) })));
  app.get("/api/rolls/gift-cards/operations/:kind/:requestKey", requireAuth, limit, handle(async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    const card = await transaction(async (client) => {
      await client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
      return readGiftCardOperation(client, req.user.id, req.params);
    });
    res.json({ card });
  }));
  app.post("/api/rolls/gift-cards", requireAuth, limit, handle(async (req, res) => {
    const card = await transaction((client) => issueGiftCard(client, req.user.id, req.body));
    res.status(card.replayed ? 200 : 201).json({ card });
  }));
  for (const kind of ["topup", "send"]) app.post(`/api/rolls/gift-cards/:cardId/${kind}`, requireAuth, limit, handle(async (req, res) => {
    const card = await transaction((client) => changeGiftCard(client, req.user.id, req.params.cardId, kind, req.body));
    res.json({ card });
  }));
}
