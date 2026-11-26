import { readFile } from "node:fs/promises";
import { productionRollsDatabase } from "./rolls-database.mjs";
import { verifyMembershipSchema } from "../server/membership-numbers.js";

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== "--apply")) {
  throw new Error("Usage: npm run membership:migrate [-- --apply]");
}
process.env.PG_POOL_SIZE = "1";
const db = await productionRollsDatabase();
try {
  console.log("Verified production target:", db.target);
  const before = await db.transaction(async (client) => {
    await client.query("SET TRANSACTION READ ONLY");
    return (await client.query(`
      SELECT (SELECT count(*)::int FROM users) AS accounts,
        to_regclass('membership_numbers') IS NOT NULL AS migrated
    `)).rows[0];
  });
  console.log(before);
  if (args[0] === "--apply") {
    const sql = await readFile(new URL("../server/migrations/20261106-membership-numbers.sql", import.meta.url), "utf8");
    await db.transaction(async (client) => {
      await client.query("SET LOCAL lock_timeout='5s'");
      await client.query("SET LOCAL statement_timeout='30s'");
      await client.query(sql);
      await verifyMembershipSchema(client);
    });
    console.log("Membership migration committed.");
  } else if (before.migrated) {
    await db.transaction(async (client) => {
      await client.query("SET TRANSACTION READ ONLY");
      await verifyMembershipSchema(client);
    });
    console.log("Membership schema verified.");
  } else console.log("Read-only: membership migration has not been applied.");
} finally { await db.pool.end(); }
