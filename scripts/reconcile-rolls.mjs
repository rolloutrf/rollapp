import { parseArgs } from "node:util";
import { productionRollsDatabase } from "./rolls-database.mjs";
import { readRollTopupAudit } from "../server/modules/payments/roll-topup-audit.js";
import { reconcileRollAccounting, rollAccountingMatches } from "../server/modules/payments/roll-reconciliation.js";

const { values } = parseArgs({ options: { details: { type: "boolean" }, limit: { type: "string" }, topup: { type: "string" } } });
const sampleLimit = values.details ? Number(values.limit ?? 20) : 0;
if ((values.limit !== undefined && !values.details) ||
    (values.details && (!Number.isInteger(sampleLimit) || sampleLimit < 1 || sampleLimit > 100))) {
  throw new Error("Используйте --details с необязательным --limit от 1 до 100.");
}

const lookup = values.topup?.match(/^(stars|ton):([^\s:]{1,200})$/);
if (values.topup !== undefined && (!lookup || values.details || values.limit !== undefined)) {
  throw new Error("Для поиска одного счёта используйте --topup=stars:ID или --topup=ton:ID.");
}

const db = await productionRollsDatabase();
try {
  const report = await db.transaction(async (client) => {
    await client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
    await client.query("SET LOCAL statement_timeout='30s'");
    if (lookup) {
      const [, provider, id] = lookup;
      const order = await readRollTopupAudit(client, { provider, id });
      const { rows: [{ asOf }] } = await client.query('SELECT transaction_timestamp() AS "asOf"');
      return { asOf, order };
    }
    return reconcileRollAccounting(client, { sampleLimit });
  });
  const ok = lookup ? report.order !== null && report.order.evidenceIssue === null : rollAccountingMatches(report);
  console.log(JSON.stringify({ target: db.target, ok, ...report }, null, 2));
  if (!ok) process.exitCode = 1;
} finally {
  await db.pool.end();
}
