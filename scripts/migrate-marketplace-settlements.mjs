import { parseArgs } from "node:util";
import { productionRollsDatabase } from "./rolls-database.mjs";
import { hasMarketplaceSettlementSchema, marketplaceSettlementsSchema, verifyMarketplaceSettlementSchema } from "../server/modules/checkout/marketplace-settlements-schema.js";

const { values } = parseArgs({ options: {
  apply: { type: "boolean" }, database: { type: "string" }, role: { type: "string" },
} });
const db = await productionRollsDatabase();
try {
  if (values.apply && (values.database !== db.target.database || values.role !== db.target.role)) {
    throw new Error("Pass --database and --role matching the verified production target");
  }
  const ready = await db.transaction(async (client) => {
    if (!values.apply) await client.query("SET TRANSACTION READ ONLY");
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='15s'");
    if (values.apply) await client.query(marketplaceSettlementsSchema);
    const installed = await hasMarketplaceSettlementSchema(client);
    if (installed) await verifyMarketplaceSettlementSchema(client);
    return installed;
  });
  console.log(JSON.stringify({ target: db.target, marketplaceSettlementSchema: ready ? "ready" : "missing" }));
} finally { await db.pool.end(); }
