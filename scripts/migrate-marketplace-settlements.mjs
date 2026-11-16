import { parseArgs } from "node:util";
import { productionRollsDatabase } from "./rolls-database.mjs";
import { hasMarketplaceSettlementSchema, marketplaceSettlementsSchema, readMarketplaceSettlementPrerequisites, verifyMarketplaceSettlementSchema } from "../server/modules/checkout/marketplace-settlements-schema.js";

const { values } = parseArgs({ options: {
  apply: { type: "boolean" }, database: { type: "string" }, role: { type: "string" },
} });
const db = await productionRollsDatabase();
try {
  if (values.apply && (values.database !== db.target.database || values.role !== db.target.role)) {
    throw new Error("Pass --database and --role matching the verified production target");
  }
  const result = await db.transaction(async (client) => {
    if (!values.apply) await client.query("SET TRANSACTION READ ONLY");
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='15s'");
    const installed = await hasMarketplaceSettlementSchema(client);
    const prerequisites = await readMarketplaceSettlementPrerequisites(client);
    const canInstall = Boolean(prerequisites.schema && prerequisites.canUse && prerequisites.canCreate &&
      prerequisites.references.every(({ canReference, hasReferenceKey }) => canReference && hasReferenceKey));
    if (values.apply && !installed) {
      if (!canInstall) throw new Error("Settlement migration requires schema permissions and the existing reference keys listed in its read-only preflight");
      await client.query(marketplaceSettlementsSchema);
    }
    if (installed || values.apply) await verifyMarketplaceSettlementSchema(client);
    return {
      marketplaceSettlementSchema: installed || values.apply ? "ready" : "missing",
      prerequisites, canInstall,
    };
  });
  console.log(JSON.stringify({ target: db.target, ...result }));
} finally { await db.pool.end(); }
