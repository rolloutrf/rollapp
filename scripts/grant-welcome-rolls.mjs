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
    const ton = await db.query("SELECT to_regclass('roll_ton_orders') AS orders");
    const totalTon = ton.rows[0].orders ? "(SELECT coalesce(sum(rolls),0) FROM roll_ton_orders WHERE paid_at IS NOT NULL)" : "0";
    const walletTon = ton.rows[0].orders ? "coalesce((SELECT sum(t.rolls) FROM roll_ton_orders t WHERE t.user_id=w.user_id AND t.paid_at IS NOT NULL),0)" : "0";
    const gifts = await db.query("SELECT to_regclass('business_gift_card_events') AS events");
    const giftBalance = gifts.rows[0].events ? "(SELECT coalesce(sum(balance),0) FROM business_gift_cards)" : "0";
    const giftSpent = gifts.rows[0].events ? "(SELECT coalesce(sum(CASE kind WHEN 'spend' THEN amount WHEN 'refund' THEN -amount ELSE 0 END),0) FROM business_gift_card_events)" : "0";
    const walletGiftTopups = gifts.rows[0].events ? "coalesce((SELECT sum(e.amount) FROM business_gift_card_events e WHERE e.actor_id=w.user_id AND e.kind='topup'),0)" : "0";
    const giftMismatches = gifts.rows[0].events ? "(SELECT count(*)::int FROM business_gift_cards c WHERE c.balance <> coalesce((SELECT sum(CASE e.kind WHEN 'topup' THEN e.amount WHEN 'refund' THEN e.amount WHEN 'spend' THEN -e.amount ELSE 0 END) FROM business_gift_card_events e WHERE e.card_id=c.id),0))" : "0";
    const verification = await db.query(`
      SELECT
        (SELECT count(*)::int FROM users) AS users,
        (SELECT count(*)::int FROM roll_wallets) AS wallets,
        (SELECT count(*)::int FROM roll_transactions WHERE kind='welcome') AS welcome_grants,
        (SELECT coalesce(sum(balance),0)::text FROM roll_wallets) AS total_balance,
        (${giftBalance})::text AS total_gift_balance,
        ${giftMismatches} AS mismatched_gift_balances,
        ((SELECT coalesce(sum(amount),0) FROM roll_transactions WHERE kind='welcome')
          + (SELECT coalesce(sum(amount),0) FROM roll_wish_rewards)
          + (SELECT coalesce(sum(amount),0) FROM roll_manual_grants) + ${totalStars} + ${totalTon})::text AS total_issued,
        ((SELECT coalesce(sum(amount),0) FROM roll_store_purchases WHERE refunded_at IS NULL AND delivery->>'giftCardId' IS NULL) + ${giftSpent})::text AS total_spent,
        (SELECT count(*)::int FROM users u WHERE NOT EXISTS
          (SELECT 1 FROM roll_transactions t WHERE t.recipient_id=u.id AND t.kind='welcome')) AS missing_grants,
        (SELECT count(*)::int FROM roll_wallets w WHERE w.balance <>
          coalesce((SELECT sum(CASE WHEN t.recipient_id=w.user_id THEN t.amount ELSE -t.amount END)
            FROM roll_transactions t WHERE t.sender_id=w.user_id OR t.recipient_id=w.user_id),0)
          + coalesce((SELECT sum(r.amount) FROM roll_wish_rewards r WHERE r.user_id=w.user_id),0)
          + coalesce((SELECT sum(g.amount) FROM roll_manual_grants g WHERE g.user_id=w.user_id),0)
          + ${walletStars}
          + ${walletTon}
          - ${walletGiftTopups}
          - coalesce((SELECT sum(p.amount) FROM roll_store_purchases p WHERE p.user_id=w.user_id AND p.refunded_at IS NULL AND p.delivery->>'giftCardId' IS NULL),0)) AS mismatched_balances
    `);
    const audit = verification.rows[0];
    console.log(JSON.stringify({ verification: audit }));
    if (audit.mismatched_balances || audit.mismatched_gift_balances || BigInt(audit.total_balance) + BigInt(audit.total_gift_balance) !== BigInt(audit.total_issued) - BigInt(audit.total_spent) || (process.argv.includes("--apply") && audit.missing_grants)) {
      throw new Error("Проверка начислений не прошла.");
    }
  }
} finally { await db.pool.end(); }
