import { productionRollsDatabase } from "./rolls-database.mjs";
import { businessCategorySchema } from "../server/business-accounts.js";
import "dotenv/config";
import dotenv from "dotenv";
import { productionConnectionMode } from "./production-dev-config.mjs";

if (process.argv.slice(2).some((argument) => argument !== "--apply")) {
  throw new Error("Использование: npm run business:categories:migrate [-- --apply]");
}
dotenv.config({ path: ".env.local", override: false, quiet: true });
if (productionConnectionMode(process.env) === "tunnel") {
  const { startTunnel, createProductionDatabaseEnvironment } = await import("./production-db-tunnel.mjs");
  const tunnel = await startTunnel();
  if (!tunnel.ready) throw new Error("Production PostgreSQL недоступен через SSH-туннель.");
  Object.assign(process.env, createProductionDatabaseEnvironment(process.env, tunnel.config));
}
const db = await productionRollsDatabase();
try {
  console.log("Verified production target:", db.target);
  const present = await db.transaction(async (client) => {
    await client.query("SET TRANSACTION READ ONLY");
    const result = await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='users' AND column_name='business_category'");
    return result.rowCount > 0;
  });
  console.log(`users.business_category: ${present ? "present" : "missing"}`);
  if (process.argv.includes("--apply")) {
    await db.transaction(async (client) => {
      await client.query("SET LOCAL lock_timeout='5s'");
      await client.query("SET LOCAL statement_timeout='15s'");
      await client.query(businessCategorySchema);
      await client.query("SELECT account_type,business_category FROM users LIMIT 0");
    });
    console.log("Business category column ready. Existing accounts and grants were not modified.");
  } else console.log("Read-only check. A separately authorized --apply adds the nullable category column; it does not backfill existing accounts.");
} finally { await db.pool.end(); }
