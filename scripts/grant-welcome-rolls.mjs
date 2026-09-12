import { productionRollsDatabase } from "./rolls-database.mjs";
import { grantWelcomeRolls, rollsSchema } from "../server/rolls.js";
import { ROLLS_WELCOME_AMOUNT } from "../shared/rolls.js";

const db = await productionRollsDatabase();
try {
  const users = await db.query("SELECT count(*)::int AS count FROM users");
  console.log(JSON.stringify({ target: db.target, registeredUsers: users.rows[0].count, welcomeAmount: ROLLS_WELCOME_AMOUNT }));
  if (process.argv.includes("--apply")) {
    const result = await db.transaction(async (client) => {
      await client.query(rollsSchema);
      return grantWelcomeRolls(client);
    });
    console.log(JSON.stringify({ applied: true, ...result }));
  } else {
    console.log("Без записи. Для однократного начисления запустите с --apply.");
  }
  const table = await db.query("SELECT to_regclass('roll_wallets') AS wallets");
  if (table.rows[0].wallets) {
    const stars = await db.query("SELECT to_regclass('roll_star_orders') AS orders");
    const totalStars = stars.rows[0].orders ? "(SELECT coalesce(sum(rolls),0) FROM roll_star_orders WHERE paid_at IS NOT NULL)" : "0";
    const walletStars = stars.rows[0].orders ? "coalesce((SELECT sum(s.rolls) FROM roll_star_orders s WHERE s.user_id=w.user_id AND s.paid_at IS NOT NULL),0)" : "0";
    const verification = await db.query(`
      SELECT
        (SELECT count(*)::int FROM users) AS users,
        (SELECT count(*)::int FROM roll_wallets) AS wallets,
        (SELECT count(*)::int FROM roll_transactions WHERE kind='welcome') AS welcome_grants,
        (SELECT coalesce(sum(balance),0)::text FROM roll_wallets) AS total_balance,
        ((SELECT coalesce(sum(amount),0) FROM roll_transactions WHERE kind='welcome')
          + (SELECT coalesce(sum(amount),0) FROM roll_wish_rewards)
          + (SELECT coalesce(sum(amount),0) FROM roll_manual_grants) + ${totalStars})::text AS total_issued,
        (SELECT coalesce(sum(amount),0)::text FROM roll_store_purchases WHERE refunded_at IS NULL) AS total_spent,
        (SELECT count(*)::int FROM users u WHERE NOT EXISTS
          (SELECT 1 FROM roll_transactions t WHERE t.recipient_id=u.id AND t.kind='welcome')) AS missing_grants,
        (SELECT count(*)::int FROM roll_wallets w WHERE w.balance <>
          coalesce((SELECT sum(CASE WHEN t.recipient_id=w.user_id THEN t.amount ELSE -t.amount END)
            FROM roll_transactions t WHERE t.sender_id=w.user_id OR t.recipient_id=w.user_id),0)
          + coalesce((SELECT sum(r.amount) FROM roll_wish_rewards r WHERE r.user_id=w.user_id),0)
          + coalesce((SELECT sum(g.amount) FROM roll_manual_grants g WHERE g.user_id=w.user_id),0)
          + ${walletStars}
          - coalesce((SELECT sum(p.amount) FROM roll_store_purchases p WHERE p.user_id=w.user_id AND p.refunded_at IS NULL),0)) AS mismatched_balances
    `);
    const audit = verification.rows[0];
    console.log(JSON.stringify({ verification: audit }));
    if (audit.mismatched_balances || BigInt(audit.total_balance) !== BigInt(audit.total_issued) - BigInt(audit.total_spent) || (process.argv.includes("--apply") && audit.missing_grants)) {
      throw new Error("Проверка начислений не прошла.");
    }
  }
} finally { await db.pool.end(); }
