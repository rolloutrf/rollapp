import { productionRollsDatabase } from "./rolls-database.mjs";
import { needRewardsSchema } from "../server/need-rewards-schema.js";

// Separate additive migration, never called by application startup or release.
const db = await productionRollsDatabase();
try {
  await db.transaction(async client => {
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='15s'");
    await client.query(needRewardsSchema);
    await client.query("SELECT n.id,o.reward,e.kind,v.action FROM reward_needs n JOIN reward_need_offers o ON o.need_id=n.id JOIN reward_need_entries e ON e.offer_id=o.id JOIN reward_need_events v ON v.offer_id=o.id LIMIT 0");
  });
  console.log("Need rewards schema ready on the verified production database; no balances or user records changed.");
} finally { await db.pool.end(); }
