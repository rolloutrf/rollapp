import { z } from "zod";
import {
  ROLLS_MAX_TRANSFER,
  ROLLS_WELCOME_AMOUNT,
  ROLLS_MAX_BALANCE,
  ROLLS_WISH_REWARD_AMOUNT,
  ROLLS_WISH_REWARD_LIMIT,
} from "../../../shared/modules/payments/rolls.js";
import { ensureRollWallet, RollsError } from "../payments/rolls.js";
import { randomUUID } from "node:crypto";

export const rollGrantSchema = z.object({
  amount: z.number().int().min(1).max(ROLLS_MAX_TRANSFER),
  reason: z.string().trim().max(280).default(""),
  idempotencyKey: z.string().trim().min(1).max(200),
}).strict();

export async function grantWelcomeRolls(client) {
  const users = await client.query("SELECT id FROM users ORDER BY id");
  let credited = 0;
  for (const { id } of users.rows) {
    if (await ensureRollWallet(client, id)) credited += 1;
  }
  return { users: users.rowCount, credited, issued: credited * ROLLS_WELCOME_AMOUNT };
}

function grantTerms(input) {
  const parsed = rollGrantSchema.safeParse(input);
  if (!parsed.success) throw new RollsError("Некорректные данные начисления", "INVALID_GRANT");
  return parsed.data;
}

function priorGrantMatches(row, userId, { amount, reason }) {
  if (row.user_id !== userId || Number(row.amount) !== amount || row.reason !== reason) {
    throw new RollsError("Этот ключ уже использован для другого начисления", "IDEMPOTENCY_CONFLICT", 409);
  }
}

export async function previewRollGrant(client, userId, input) {
  const terms = grantTerms(input);
  const { rows: [target] } = await client.query(`
    SELECT u.id,u.name,u.username,COALESCE(w.balance,0)::text AS balance,
      EXISTS(SELECT 1 FROM roll_transactions t WHERE t.recipient_id=u.id AND t.kind='welcome') AS welcomed
    FROM users u LEFT JOIN roll_wallets w ON w.user_id=u.id WHERE u.id=$1`, [userId]);
  if (!target) throw new RollsError("Участник не найден", "RECIPIENT_NOT_FOUND", 404);
  const { welcomed, ...account } = target;
  const { rows: [previous] } = await client.query(
    "SELECT id,user_id,amount,reason FROM roll_manual_grants WHERE idempotency_key=$1", [terms.idempotencyKey],
  );
  if (previous) priorGrantMatches(previous, userId, terms);
  const welcomeAmount = welcomed ? 0 : ROLLS_WELCOME_AMOUNT;
  const increase = BigInt(welcomeAmount) + BigInt(previous ? 0 : terms.amount);
  const projected = BigInt(account.balance) + increase;
  if (projected > BigInt(ROLLS_MAX_BALANCE)) throw new RollsError("Кошелёк достиг лимита", "BALANCE_LIMIT", 409);
  return {
    account, amount: terms.amount, reason: terms.reason, welcomeAmount,
    projectedBalance: String(projected), existingGrantId: previous?.id ?? null,
  };
}

// Administrative grants are kept in their own append-only ledger so a manual
// credit remains visible and the stored balance can always be audited.
export async function grantRolls(client, userId, input) {
  const terms = grantTerms(input);
  const { amount, reason, idempotencyKey } = terms;
  const user = await client.query("SELECT id FROM users WHERE id=$1", [userId]);
  if (!user.rowCount) throw new RollsError("Участник не найден", "RECIPIENT_NOT_FOUND", 404);

  await ensureRollWallet(client, userId);
  const previous = await client.query(
    "SELECT * FROM roll_manual_grants WHERE idempotency_key=$1",
    [idempotencyKey],
  );
  if (previous.rowCount) {
    const row = previous.rows[0];
    priorGrantMatches(row, userId, terms);
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
