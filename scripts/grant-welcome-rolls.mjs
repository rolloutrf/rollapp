import { productionRollsDatabase } from "./rolls-database.mjs";
import { grantWelcomeRolls } from "../server/modules/loyalty/roll-rewards.js";
import { reconcileRollAccounting } from "../server/modules/payments/roll-accounting.js";
import { ROLLS_WELCOME_AMOUNT } from "../shared/modules/payments/rolls.js";

const db = await productionRollsDatabase();
try {
  const apply = process.argv.includes("--apply");
  if (apply) {
    const result = await db.transaction(grantWelcomeRolls);
    console.log(JSON.stringify({ applied: true, ...result }));
  } else {
    console.log("Без записи. Для однократного начисления запустите с --apply.");
  }

  const report = await db.transaction(async (client) => {
    await client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
    const { rows: [users] } = await client.query(`
      SELECT COUNT(*)::int AS users,COUNT(*) FILTER (WHERE NOT EXISTS (
        SELECT 1 FROM roll_transactions t WHERE t.recipient_id=u.id AND t.kind='welcome'
      ))::int AS "missingGrants" FROM users u
    `);
    const accounting = await reconcileRollAccounting(client);
    return { ...users, ...accounting };
  });
  console.log(JSON.stringify({ target: db.target, welcomeAmount: ROLLS_WELCOME_AMOUNT, verification: report }));
  if (report.walletMismatches || report.cardMismatches || report.marketplaceMismatches || report.unaccountedRolls !== "0" || (apply && report.missingGrants)) {
    throw new Error("Проверка начислений не прошла.");
  }
} finally {
  await db.pool.end();
}
