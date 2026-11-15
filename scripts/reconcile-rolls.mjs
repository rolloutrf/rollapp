import { productionRollsDatabase } from "./rolls-database.mjs";
import { reconcileRollAccounting } from "../server/modules/payments/roll-accounting.js";

const db = await productionRollsDatabase();
try {
  const summary = await db.transaction(async (client) => {
    await client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
    return reconcileRollAccounting(client);
  });
  console.log(JSON.stringify(summary, null, 2));
  if (summary.walletMismatches || summary.cardMismatches || summary.unaccountedRolls !== "0") process.exitCode = 1;
} finally {
  await db.pool.end();
}
