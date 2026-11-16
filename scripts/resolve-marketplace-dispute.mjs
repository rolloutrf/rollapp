import { userInfo } from "node:os";
import { parseArgs } from "node:util";
import { z } from "zod";
import { productionRollsDatabase } from "./rolls-database.mjs";
import { resolveMarketplaceDispute } from "../server/modules/checkout/marketplace-settlements.js";
import { verifyMarketplaceSettlementSchema } from "../server/modules/checkout/marketplace-settlements-schema.js";

const { values } = parseArgs({ options: {
  order: { type: "string" }, decision: { type: "string" }, amount: { type: "string" }, reason: { type: "string" },
} });
const id = values.order ? z.string().uuid().parse(values.order) : null;
const db = await productionRollsDatabase();
try {
  const result = await db.transaction(async (client) => {
    if (!values.decision) await client.query("SET TRANSACTION READ ONLY");
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='15s'");
    await verifyMarketplaceSettlementSchema(client);
    if (values.decision) {
      if (!id) throw new Error("Specify the exact --order");
      return resolveMarketplaceDispute(client, id, {
        action: `resolve_${values.decision}`, operator: userInfo().username,
        expectedAmount: Number(values.amount), note: values.reason,
      });
    }
    if (values.amount || values.reason) throw new Error("A decision is required with --amount or --reason");
    const { rows } = await client.query(`
      SELECT o.id,o.amount,o.status,o.item_title,o.created_at,e.note AS reason
      FROM roll_marketplace_orders o JOIN roll_marketplace_order_events e ON e.order_id=o.id AND e.action='dispute'
      WHERE ($1::uuid IS NULL AND o.status='disputed') OR o.id=$1
      ORDER BY e.created_at,o.id LIMIT 100`, [id]);
    return rows;
  });
  console.log(JSON.stringify(result, null, 2));
} finally { await db.pool.end(); }
