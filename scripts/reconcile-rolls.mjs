import { parseArgs } from "node:util";
import { z } from "zod";
import { readPersonalOfferAudit } from "../server/modules/checkout/personal-offer-ledger.js";
import { productionRollsDatabase } from "./rolls-database.mjs";
import { readRollTopupAudit } from "../server/modules/payments/roll-topup-audit.js";
import { reconcileRollAccounting, rollAccountingMatches } from "../server/modules/payments/roll-reconciliation.js";

const { values } = parseArgs({ options: { details: { type: "boolean" }, limit: { type: "string" }, topup: { type: "string" }, invoice: { type: "string" } } });
const sampleLimit = values.details ? Number(values.limit ?? 20) : 0;
if ((values.limit !== undefined && !values.details) ||
    (values.details && (!Number.isInteger(sampleLimit) || sampleLimit < 1 || sampleLimit > 100))) {
  throw new Error("Используйте --details с необязательным --limit от 1 до 100.");
}

const lookup = values.topup?.match(/^(stars|ton):([^\s:]{1,200})$/);
if (values.topup !== undefined && (!lookup || values.details || values.limit !== undefined)) {
  throw new Error("Для поиска одного счёта используйте --topup=stars:ID или --topup=ton:ID.");
}

if (values.invoice !== undefined && (!z.uuid().safeParse(values.invoice).success ||
    values.topup !== undefined || values.details || values.limit !== undefined)) {
  throw new Error("Для поиска персонального счёта используйте --invoice=UUID.");
}

const db = await productionRollsDatabase();
try {
  const report = await db.transaction(async (client) => {
    await client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
    await client.query("SET LOCAL statement_timeout='30s'");
    if (lookup || values.invoice) {
      const record = lookup
        ? await readRollTopupAudit(client, { provider: lookup[1], id: lookup[2] })
        : await readPersonalOfferAudit(client, values.invoice);
      const { rows: [{ asOf }] } = await client.query('SELECT transaction_timestamp() AS "asOf"');
      return lookup ? { asOf, order: record } : { asOf, invoice: record };
    }
    return reconcileRollAccounting(client, { sampleLimit });
  });
  const record = report.order ?? report.invoice;
  const ok = lookup || values.invoice ? record?.evidenceIssue === null : rollAccountingMatches(report);
  console.log(JSON.stringify({ target: db.target, ok, ...report }, null, 2));
  if (!ok) process.exitCode = 1;
} finally {
  await db.pool.end();
}
