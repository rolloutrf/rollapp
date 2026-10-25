import { productionRollsDatabase } from "./rolls-database.mjs";
import { migratePersonalDevelopmentPlan } from "../server/personal-development-plan-migration.js";

if (process.argv.slice(2).some(arg => arg !== "--apply")) throw new Error("Usage: node scripts/migrate-personal-development-plan.mjs [--apply]");
const db = await productionRollsDatabase();
try {
  console.log(`Verified configured target: database=${db.target.database}, role=${db.target.role}`);
  console.log(JSON.stringify(await db.transaction(client => migratePersonalDevelopmentPlan(client, { apply: process.argv.includes("--apply") }))));
} finally {
  await db.pool.end();
}
