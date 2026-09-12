import { productionRollsDatabase } from "./rolls-database.mjs";
import { cdekSchema, fetchCdekPoints, saveCdekCatalog } from "../server/cdek.js";

const db = await productionRollsDatabase();
try {
  console.log("Verified production target:", db.target);
  const points = await fetchCdekPoints();
  console.log(`CDEK: ${points.length} active pickup points in Russia.`);
  if (process.argv.includes("--apply")) {
    const catalog = await db.transaction(async (client) => {
      await client.query("SET LOCAL lock_timeout='5s'");
      await client.query(cdekSchema);
      await client.query("ALTER TABLE roll_store_purchases ADD COLUMN IF NOT EXISTS delivery JSONB");
      return saveCdekCatalog((...args) => client.query(...args), points);
    });
    console.log(`Catalog saved: ${catalog.syncedAt}. Existing purchases and balances unchanged.`);
  } else console.log("Read-only check. Use --apply to save the catalog and add the delivery column.");
} finally { await db.pool.end(); }
