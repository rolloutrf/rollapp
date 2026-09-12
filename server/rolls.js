import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  ROLLS_MAX_BALANCE,
  ROLLS_MAX_TRANSFER,
  ROLLS_WELCOME_AMOUNT,
  ROLLS_WISH_REWARD_AMOUNT,
  ROLLS_WISH_REWARD_LIMIT,
} from "../shared/rolls.js";
import { cdekSchema, resolveCdekPoint } from "./cdek.js";
import { rollStarsSchema } from "./roll-stars-schema.js";

export const rollsSchema = `
  CREATE TABLE IF NOT EXISTS roll_wallets (
    user_id TEXT PRIMARY KEY REFERENCES users(id),
    balance BIGINT NOT NULL DEFAULT 0 CHECK (balance BETWEEN 0 AND ${ROLLS_MAX_BALANCE}),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS roll_transactions (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('welcome', 'transfer')),
    sender_id TEXT REFERENCES roll_wallets(user_id),
    recipient_id TEXT NOT NULL REFERENCES roll_wallets(user_id),
    amount BIGINT NOT NULL CHECK (amount BETWEEN 1 AND ${ROLLS_MAX_TRANSFER}),
    note VARCHAR(280) NOT NULL DEFAULT '',
    idempotency_key TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (
      (kind = 'welcome' AND sender_id IS NULL AND idempotency_key IS NULL AND amount = ${ROLLS_WELCOME_AMOUNT})
      OR (kind = 'transfer' AND sender_id IS NOT NULL AND sender_id <> recipient_id AND idempotency_key IS NOT NULL)
    ),
    UNIQUE (sender_id, idempotency_key)
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_roll_welcome_once
    ON roll_transactions(recipient_id) WHERE kind = 'welcome';
  CREATE INDEX IF NOT EXISTS idx_roll_transactions_sender
    ON roll_transactions(sender_id, created_at DESC, id DESC);
  CREATE INDEX IF NOT EXISTS idx_roll_transactions_recipient
    ON roll_transactions(recipient_id, created_at DESC, id DESC);
  CREATE TABLE IF NOT EXISTS roll_wish_reward_eligibility (
    user_id TEXT PRIMARY KEY REFERENCES users(id),
    enrolled_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS roll_wish_rewards (
    id TEXT PRIMARY KEY,
    wish_id TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL REFERENCES roll_wallets(user_id),
    wish_title VARCHAR(200) NOT NULL,
    amount BIGINT NOT NULL CHECK (amount = ${ROLLS_WISH_REWARD_AMOUNT}),
    ordinal INTEGER NOT NULL CHECK (ordinal BETWEEN 1 AND ${ROLLS_WISH_REWARD_LIMIT}),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, ordinal)
  );
  CREATE INDEX IF NOT EXISTS idx_roll_wish_rewards_user
    ON roll_wish_rewards(user_id, created_at DESC, id DESC);
  CREATE TABLE IF NOT EXISTS roll_manual_grants (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES roll_wallets(user_id),
    amount BIGINT NOT NULL CHECK (amount BETWEEN 1 AND ${ROLLS_MAX_TRANSFER}),
    reason VARCHAR(280) NOT NULL DEFAULT '',
    idempotency_key TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_roll_manual_grants_user
    ON roll_manual_grants(user_id, created_at DESC, id DESC);
  CREATE TABLE IF NOT EXISTS roll_store_purchases (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES roll_wallets(user_id),
    product_id VARCHAR(120) NOT NULL,
    product_title VARCHAR(200) NOT NULL,
    amount BIGINT NOT NULL CHECK (amount BETWEEN 1 AND ${ROLLS_MAX_TRANSFER}),
    idempotency_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, idempotency_key)
  );
  CREATE INDEX IF NOT EXISTS idx_roll_store_purchases_user
    ON roll_store_purchases(user_id, created_at DESC, id DESC);
  ALTER TABLE roll_store_purchases ADD COLUMN IF NOT EXISTS delivery JSONB;
  ALTER TABLE roll_store_purchases ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;
  ${cdekSchema}
  ${rollStarsSchema}
`;

export class RollsError extends Error {
  constructor(message, code, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export const rollTransferSchema = z.object({
  recipientId: z.string().trim().min(1).max(200),
  amount: z.number().int().min(1).max(ROLLS_MAX_TRANSFER),
  note: z.string().trim().max(280).default(""),
  idempotencyKey: z.string().uuid(),
}).strict();

export const rollPurchaseSchema = z.object({
  productId: z.string().trim().min(1).max(120),
  idempotencyKey: z.string().uuid(),
  pickupPointCode: z.string().trim().min(1).max(40),
}).strict();

export const rollGrantSchema = z.object({
  amount: z.number().int().min(1).max(ROLLS_MAX_TRANSFER),
  reason: z.string().trim().max(280).default(""),
  idempotencyKey: z.string().trim().min(1).max(200),
}).strict();

const ROLL_STORE_PRODUCTS = new Map([
  ["cat:red", { title: "Красный кот — Злой", amount: 1000 }],
  ["cat:white", { title: "Белый кот — Милаха", amount: 1000 }],
  ["cat:blue", { title: "Синий кот — Уставший", amount: 1000 }],
  ["cat:pink", { title: "Розовый кот — Влюблён", amount: 1000 }],
  ["cat:black", { title: "Чёрный кот — Крутой", amount: 1000 }],
  ["cat:gold", { title: "Золотой кот", amount: 1000 }],
]);

// The caller owns the transaction. Locking the wallet serializes both welcome
// credits and transfers across every application process.
export async function ensureRollWallet(client, userId) {
  await client.query("INSERT INTO roll_wallets (user_id) VALUES ($1) ON CONFLICT DO NOTHING", [userId]);
  await client.query("SELECT user_id FROM roll_wallets WHERE user_id=$1 FOR UPDATE", [userId]);
  const grant = await client.query(
    `INSERT INTO roll_transactions (id,kind,recipient_id,amount)
     VALUES ($1,'welcome',$2,$3) ON CONFLICT DO NOTHING RETURNING id`,
    [randomUUID(), userId, ROLLS_WELCOME_AMOUNT],
  );
  if (grant.rowCount) {
    await client.query("UPDATE roll_wallets SET balance=balance+$1 WHERE user_id=$2", [ROLLS_WELCOME_AMOUNT, userId]);
  }
  return grant.rowCount > 0;
}

export async function grantWelcomeRolls(client) {
  const users = await client.query("SELECT id FROM users ORDER BY id");
  let credited = 0;
  for (const { id } of users.rows) {
    if (await ensureRollWallet(client, id)) credited += 1;
  }
  return { users: users.rowCount, credited, issued: credited * ROLLS_WELCOME_AMOUNT };
}

// Administrative grants are kept in their own append-only ledger so a manual
// credit remains visible and the stored balance can always be audited.
export async function grantRolls(client, userId, input) {
  const parsed = rollGrantSchema.safeParse(input);
  if (!parsed.success) throw new RollsError("Некорректные данные начисления", "INVALID_GRANT");
  const { amount, reason, idempotencyKey } = parsed.data;
  const user = await client.query("SELECT id FROM users WHERE id=$1", [userId]);
  if (!user.rowCount) throw new RollsError("Участник не найден", "RECIPIENT_NOT_FOUND", 404);

  await ensureRollWallet(client, userId);
  const previous = await client.query(
    "SELECT * FROM roll_manual_grants WHERE idempotency_key=$1",
    [idempotencyKey],
  );
  if (previous.rowCount) {
    const row = previous.rows[0];
    if (row.user_id !== userId || Number(row.amount) !== amount || row.reason !== reason) {
      throw new RollsError("Этот ключ уже использован для другого начисления", "IDEMPOTENCY_CONFLICT", 409);
    }
    const wallet = await client.query("SELECT balance FROM roll_wallets WHERE user_id=$1", [userId]);
    return { id: row.id, replayed: true, balance: Number(wallet.rows[0].balance) };
  }

  const credit = await client.query(
    "UPDATE roll_wallets SET balance=balance+$1 WHERE user_id=$2 AND balance <= $3 RETURNING balance",
    [amount, userId, ROLLS_MAX_BALANCE - amount],
  );
  if (!credit.rowCount) throw new RollsError("Кошелёк достиг лимита", "BALANCE_LIMIT", 409);
  const id = randomUUID();
  await client.query(
    `INSERT INTO roll_manual_grants (id,user_id,amount,reason,idempotency_key)
     VALUES ($1,$2,$3,$4,$5)`,
    [id, userId, amount, reason, idempotencyKey],
  );
  return { id, replayed: false, balance: Number(credit.rows[0].balance) };
}

// Eligibility is recorded only while a new account is being created. Existing
// users are deliberately not enrolled by schema initialization or wallet access.
export async function enrollWishRewards(client, userId) {
  const result = await client.query(
    "INSERT INTO roll_wish_reward_eligibility (user_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING user_id",
    [userId],
  );
  return result.rowCount > 0;
}

// The caller owns the wish-creation transaction. The wallet lock serializes
// concurrent additions, while the wish and ordinal constraints make retries
// idempotent and cap the promotion at exactly ten grants.
export async function grantWishReward(client, userId, wish) {
  const eligible = await client.query(
    "SELECT user_id FROM roll_wish_reward_eligibility WHERE user_id=$1",
    [userId],
  );
  if (!eligible.rowCount) return { granted: false };

  await ensureRollWallet(client, userId);
  const previous = await client.query(
    "SELECT ordinal FROM roll_wish_rewards WHERE wish_id=$1 AND user_id=$2",
    [wish.id, userId],
  );
  if (previous.rowCount) {
    return { granted: false, ordinal: previous.rows[0].ordinal, limit: ROLLS_WISH_REWARD_LIMIT };
  }

  const rewards = await client.query(
    "SELECT count(*)::int AS count FROM roll_wish_rewards WHERE user_id=$1",
    [userId],
  );
  const ordinal = rewards.rows[0].count + 1;
  if (ordinal > ROLLS_WISH_REWARD_LIMIT) return { granted: false, limit: ROLLS_WISH_REWARD_LIMIT };

  const id = randomUUID();
  await client.query(
    `INSERT INTO roll_wish_rewards (id,wish_id,user_id,wish_title,amount,ordinal)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [id, wish.id, userId, wish.title, ROLLS_WISH_REWARD_AMOUNT, ordinal],
  );
  const credit = await client.query(
    "UPDATE roll_wallets SET balance=balance+$1 WHERE user_id=$2 AND balance <= $3 RETURNING balance",
    [ROLLS_WISH_REWARD_AMOUNT, userId, ROLLS_MAX_BALANCE - ROLLS_WISH_REWARD_AMOUNT],
  );
  if (!credit.rowCount) throw new RollsError("Кошелёк достиг лимита", "BALANCE_LIMIT", 409);
  return {
    granted: true,
    id,
    amount: ROLLS_WISH_REWARD_AMOUNT,
    ordinal,
    limit: ROLLS_WISH_REWARD_LIMIT,
    remaining: ROLLS_WISH_REWARD_LIMIT - ordinal,
  };
}

function transactionFromRow(row, userId) {
  const outgoing = row.sender_id === userId;
  return {
    id: row.id,
    kind: row.kind,
    direction: outgoing ? "outgoing" : "incoming",
    amount: Number(row.amount),
    note: row.note,
    wishTitle: row.wish_title || null,
    createdAt: row.created_at,
    person: row.kind === "transfer" ? {
      id: outgoing ? row.recipient_id : row.sender_id,
      name: row.person_name,
      username: row.person_username,
      avatarUrl: row.person_avatar_url,
    } : null,
  };
}

export async function readRollWallet(client, userId, { offset = 0, limit = 30 } = {}) {
  // Locking also gives a consistent balance/history snapshot at READ COMMITTED.
  await ensureRollWallet(client, userId);
  const wallet = await client.query("SELECT balance FROM roll_wallets WHERE user_id=$1", [userId]);
  const history = await client.query(
    `WITH history AS (
       SELECT id,kind,sender_id,recipient_id,amount,note,NULL::text AS wish_title,created_at
       FROM roll_transactions WHERE sender_id=$1 OR recipient_id=$1
       UNION ALL
       SELECT id,'wish_reward' AS kind,NULL::text AS sender_id,user_id AS recipient_id,
              amount,'' AS note,wish_title,created_at
       FROM roll_wish_rewards WHERE user_id=$1
       UNION ALL
       SELECT id,'manual_grant' AS kind,NULL::text AS sender_id,user_id AS recipient_id,
              amount,reason AS note,NULL::text AS wish_title,created_at
       FROM roll_manual_grants WHERE user_id=$1
       UNION ALL
       SELECT id,'stars_topup' AS kind,NULL::text AS sender_id,user_id AS recipient_id,
              rolls AS amount,stars::text || ' Telegram Stars' AS note,NULL::text AS wish_title,paid_at AS created_at
       FROM roll_star_orders WHERE user_id=$1 AND paid_at IS NOT NULL
     )
     SELECT h.*,u.name AS person_name,u.username AS person_username,u.avatar_url AS person_avatar_url
     FROM history h
     LEFT JOIN users u ON h.kind='transfer'
       AND u.id=CASE WHEN h.sender_id=$1 THEN h.recipient_id ELSE h.sender_id END
     ORDER BY h.created_at DESC,h.id DESC LIMIT $2 OFFSET $3`,
    [userId, limit + 1, offset],
  );
  return {
    balance: Number(wallet.rows[0].balance),
    transactions: history.rows.slice(0, limit).map((row) => transactionFromRow(row, userId)),
    nextOffset: history.rowCount > limit ? offset + limit : null,
  };
}

export async function transferRolls(client, senderId, input) {
  const parsed = rollTransferSchema.safeParse(input);
  if (!parsed.success) throw new RollsError("Укажите получателя, целое количество роллов и комментарий до 280 символов", "INVALID_TRANSFER");
  const { recipientId, amount, note, idempotencyKey } = parsed.data;
  if (senderId === recipientId) throw new RollsError("Выберите другого участника", "SELF_TRANSFER");
  const recipient = await client.query("SELECT id FROM users WHERE id=$1", [recipientId]);
  if (!recipient.rowCount) throw new RollsError("Участник не найден", "RECIPIENT_NOT_FOUND", 404);

  // Always acquire locks in the same order, including wallet creation, to avoid
  // deadlocks in simultaneous A→B and B→A transfers.
  for (const userId of [senderId, recipientId].sort()) await ensureRollWallet(client, userId);
  const previous = await client.query(
    "SELECT * FROM roll_transactions WHERE sender_id=$1 AND idempotency_key=$2",
    [senderId, idempotencyKey],
  );
  if (previous.rowCount) {
    const row = previous.rows[0];
    if (row.recipient_id !== recipientId || Number(row.amount) !== amount || row.note !== note) {
      throw new RollsError("Этот запрос уже использован для другого перевода", "IDEMPOTENCY_CONFLICT", 409);
    }
    return { id: row.id, replayed: true };
  }
  const debit = await client.query(
    "UPDATE roll_wallets SET balance=balance-$1 WHERE user_id=$2 AND balance >= $1 RETURNING balance",
    [amount, senderId],
  );
  if (!debit.rowCount) throw new RollsError("Недостаточно роллов для перевода", "INSUFFICIENT_ROLLS", 409);
  const credit = await client.query(
    "UPDATE roll_wallets SET balance=balance+$1 WHERE user_id=$2 AND balance <= $3 RETURNING balance",
    [amount, recipientId, ROLLS_MAX_BALANCE - amount],
  );
  if (!credit.rowCount) throw new RollsError("Кошелёк получателя достиг лимита", "RECIPIENT_BALANCE_LIMIT", 409);
  const id = randomUUID();
  await client.query(
    `INSERT INTO roll_transactions (id,kind,sender_id,recipient_id,amount,note,idempotency_key)
     VALUES ($1,'transfer',$2,$3,$4,$5,$6)`,
    [id, senderId, recipientId, amount, note, idempotencyKey],
  );
  return { id, replayed: false };
}

export async function purchaseWithRolls(client, userId, input) {
  const parsed = rollPurchaseSchema.safeParse(input);
  if (!parsed.success) throw new RollsError("Некорректные данные покупки", "INVALID_PURCHASE");
  const { productId, idempotencyKey, pickupPointCode } = parsed.data;
  const product = ROLL_STORE_PRODUCTS.get(productId);
  if (!product) throw new RollsError("Товар не найден", "PRODUCT_NOT_FOUND", 404);
  const { title: productTitle, amount } = product;
  await ensureRollWallet(client, userId);
  const previous = await client.query(
    "SELECT * FROM roll_store_purchases WHERE user_id=$1 AND idempotency_key=$2",
    [userId, idempotencyKey],
  );
  if (previous.rowCount) {
    const row = previous.rows[0];
    if (row.product_id !== productId || row.product_title !== productTitle || Number(row.amount) !== amount || row.delivery?.point?.code !== pickupPointCode) {
      throw new RollsError("Этот запрос уже использован для другой покупки", "IDEMPOTENCY_CONFLICT", 409);
    }
    const wallet = await client.query("SELECT balance FROM roll_wallets WHERE user_id=$1", [userId]);
    return { id: row.id, replayed: true, balance: Number(wallet.rows[0].balance), delivery: row.delivery };
  }
  const point = await resolveCdekPoint(client, pickupPointCode);
  if (!point) throw new RollsError("Этот пункт CDEK больше недоступен. Найдите и выберите пункт заново.", "INVALID_PICKUP_POINT", 409);
  const delivery = { provider: "cdek", point };
  const debit = await client.query(
    "UPDATE roll_wallets SET balance=balance-$1 WHERE user_id=$2 AND balance >= $1 RETURNING balance",
    [amount, userId],
  );
  if (!debit.rowCount) throw new RollsError("Недостаточно роллов для покупки", "INSUFFICIENT_ROLLS", 409);
  const id = randomUUID();
  await client.query(
    `INSERT INTO roll_store_purchases (id,user_id,product_id,product_title,amount,idempotency_key,delivery)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [id, userId, productId, productTitle, amount, idempotencyKey, JSON.stringify(delivery)],
  );
  return { id, replayed: false, balance: Number(debit.rows[0].balance), delivery };
}

function orderFromRow(row) {
  return {
    id: row.id,
    productId: row.product_id,
    productTitle: row.product_title,
    amount: Number(row.amount),
    delivery: row.delivery,
    createdAt: row.created_at,
    refundedAt: row.refunded_at,
    status: row.refunded_at ? "refunded" : "placed",
  };
}

export async function readRollOrders(client, userId) {
  const orders = await client.query(
    `SELECT id,product_id,product_title,amount,delivery,created_at,refunded_at
     FROM roll_store_purchases WHERE user_id=$1 ORDER BY created_at DESC,id DESC`,
    [userId],
  );
  return { orders: orders.rows.map(orderFromRow) };
}

export async function refundRollPurchase(client, userId, purchaseId) {
  if (typeof purchaseId !== "string" || !purchaseId.trim() || purchaseId.length > 200) {
    throw new RollsError("Некорректный номер заказа", "INVALID_ORDER");
  }
  await ensureRollWallet(client, userId);
  const purchase = await client.query(
    `SELECT id,product_id,product_title,amount,delivery,created_at,refunded_at
     FROM roll_store_purchases WHERE id=$1 AND user_id=$2 FOR UPDATE`,
    [purchaseId, userId],
  );
  if (!purchase.rowCount) throw new RollsError("Заказ не найден", "ORDER_NOT_FOUND", 404);
  if (purchase.rows[0].refunded_at) {
    const wallet = await client.query("SELECT balance FROM roll_wallets WHERE user_id=$1", [userId]);
    return { order: orderFromRow(purchase.rows[0]), balance: Number(wallet.rows[0].balance), replayed: true };
  }

  const amount = Number(purchase.rows[0].amount);
  const credit = await client.query(
    "UPDATE roll_wallets SET balance=balance+$1 WHERE user_id=$2 AND balance <= $3 RETURNING balance",
    [amount, userId, ROLLS_MAX_BALANCE - amount],
  );
  if (!credit.rowCount) throw new RollsError("Кошелёк достиг лимита", "BALANCE_LIMIT", 409);
  const refunded = await client.query(
    `UPDATE roll_store_purchases SET refunded_at=CURRENT_TIMESTAMP
     WHERE id=$1 AND user_id=$2 RETURNING id,product_id,product_title,amount,delivery,created_at,refunded_at`,
    [purchaseId, userId],
  );
  return { order: orderFromRow(refunded.rows[0]), balance: Number(credit.rows[0].balance), replayed: false };
}
