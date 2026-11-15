import { parseArgs } from "node:util";
import { productionRollsDatabase } from "./rolls-database.mjs";
import { reconcileRollAccounting, rollAccountingMatches } from "../server/modules/payments/roll-reconciliation.js";

const { values } = parseArgs({ options: { details: { type: "boolean" }, limit: { type: "string" } } });
const sampleLimit = values.details ? Number(values.limit ?? 20) : 0;
if ((values.limit !== undefined && !values.details) ||
    (values.details && (!Number.isInteger(sampleLimit) || sampleLimit < 1 || sampleLimit > 100))) {
  throw new Error("Используйте --details с необязательным --limit от 1 до 100.");
}

const db = await productionRollsDatabase();
try {
  const report = await db.transaction(async (client) => {
    await client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
    await client.query("SET LOCAL statement_timeout='30s'");
    return reconcileRollAccounting(client, { sampleLimit });
  });
  const ok = rollAccountingMatches(report);
  console.log(JSON.stringify({ target: db.target, ok, ...report }, null, 2));
  if (!ok) process.exitCode = 1;
} finally {
  await db.pool.end();
}
