import {
  ROLLS_MAX_BALANCE,
  ROLLS_MAX_TRANSFER,
  ROLLS_WELCOME_AMOUNT,
  ROLLS_WISH_REWARD_AMOUNT,
  ROLLS_WISH_REWARD_LIMIT,
} from "../../../shared/modules/payments/rolls.js";
import { cdekSchema } from "../delivery/cdek.js";
import { rollStarsSchema } from "./roll-stars-schema.js";
import { tonRollsSchema } from "./roll-ton-schema.js";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { orderFromRow } from "../history/order-history.js";

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
  ${tonRollsSchema}
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

export async function refundGiftCardOrder(client, userId, purchaseId) {
  const giftSchema = await client.query("SELECT to_regclass('business_gift_card_events')::text AS events");
  if (!giftSchema.rows[0]?.events) throw new RollsError("Заказ не найден", "ORDER_NOT_FOUND", 404);
  const purchase = await client.query(
    `SELECT e.*,r.created_at AS refunded_at FROM business_gift_card_events e
     LEFT JOIN business_gift_card_events r ON r.purchase_id=e.id AND r.kind='refund'
     WHERE e.id=$1 AND e.actor_id=$2 AND e.kind='spend' AND e.purchase IS NOT NULL`,
    [purchaseId, userId],
  );
  if (!purchase.rowCount) throw new RollsError("Заказ не найден", "ORDER_NOT_FOUND", 404);
  const row = purchase.rows[0];
  const order = {
    id: row.id, product_id: row.purchase.productId, product_title: row.purchase.productTitle,
    amount: row.amount, delivery: row.purchase.delivery, created_at: row.created_at, refunded_at: row.refunded_at,
  };
  if (row.refunded_at) {
    const wallet = await client.query("SELECT balance FROM roll_wallets WHERE user_id=$1", [userId]);
    return { order: orderFromRow(order), balance: Number(wallet.rows[0].balance), replayed: true };
  }
  const amount = Number(row.amount);
  const credit = await client.query(
    "UPDATE business_gift_cards SET balance=balance+$1 WHERE id=$2 AND balance <= $3 RETURNING balance",
    [amount, row.card_id, ROLLS_MAX_TRANSFER - amount],
  );
  if (!credit.rowCount) throw new RollsError("Баланс карты достиг лимита", "BALANCE_LIMIT", 409);
  const refund = await client.query(
    `INSERT INTO business_gift_card_events(id,card_id,actor_id,kind,amount,request_key,purchase_id)
     VALUES($1,$2,$3,'refund',$4,$5,$6) RETURNING created_at`,
    [randomUUID(), row.card_id, userId, amount, randomUUID(), row.id],
  );
  order.refunded_at = refund.rows[0].created_at;
  const wallet = await client.query("SELECT balance FROM roll_wallets WHERE user_id=$1", [userId]);
  return { order: orderFromRow(order), balance: Number(wallet.rows[0].balance), replayed: false };
}
