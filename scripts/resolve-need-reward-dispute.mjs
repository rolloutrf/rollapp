import { productionRollsDatabase } from "./rolls-database.mjs";
import { resolveRewardDispute } from "../server/need-rewards.js";

const [offerId, outcome, reason, confirmation] = process.argv.slice(2);
if (!offerId || !["reward", "refund"].includes(outcome) || !reason || confirmation !== "--apply") {
  throw new Error('Usage after reviewing evidence: node scripts/resolve-need-reward-dispute.mjs OFFER_UUID reward|refund "Decision reason (10–1200 characters)" --apply');
}
const db = await productionRollsDatabase();
try {
  const result = await db.transaction(async client => {
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='15s'");
    return resolveRewardDispute(client, offerId, outcome, reason);
  });
  console.log(JSON.stringify(result));
} finally { await db.pool.end(); }
