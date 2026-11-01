import { productionRollsDatabase } from "./rolls-database.mjs";
import { personalOffersSchema } from "../server/personal-offers.js";

const args = process.argv.slice(2);
const apply = args[0] === "--apply";
if (!(args.length === 0 || args.length === 1 && args[0] === "--check" || apply && args.length === 3)) {
  throw new Error("Usage: node scripts/personal-offers-schema.mjs [--check | --apply <database> <role>]");
}
const db = await productionRollsDatabase();
try {
  if (apply && (args[1] !== db.target.database || args[2] !== db.target.role)) throw new Error("Database/role must match the reviewed production target");
  await db.transaction(async client => {
    if (!apply) await client.query("SET TRANSACTION READ ONLY");
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='15s'");
    console.log(JSON.stringify({ database: db.target.database, role: db.target.role, mode: apply ? "apply" : "read-only" }));
    await client.query("SELECT id,business_user_id,title,active FROM business_marketplace_items LIMIT 0");
    await client.query("SELECT id,user_id,product_id,delivery FROM roll_store_purchases LIMIT 0");
    if (apply) {
      await client.query(personalOffersSchema);
      await client.query(`ALTER TABLE business_personal_offers ADD COLUMN IF NOT EXISTS wishlist_item_id TEXT REFERENCES wishlist_business_items(id); ALTER TABLE business_personal_offers ALTER COLUMN item_id DROP NOT NULL; DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='business_personal_offers_single_item' AND conrelid='business_personal_offers'::regclass) THEN ALTER TABLE business_personal_offers ADD CONSTRAINT business_personal_offers_single_item CHECK ((item_id IS NOT NULL)::int + (wishlist_item_id IS NOT NULL)::int = 1); END IF; END $$;`);
    }
    const result = await client.query("SELECT to_regclass('business_personal_offers')::text AS table_name");
    if (!result.rows[0].table_name) { console.log("Personal offer schema is missing; separate authorized migration required."); return; }
    await client.query("SELECT id,business_user_id,recipient_id,item_id,wishlist_item_id,item_title,price_rolls,expires_at,created_at,idempotency_key,purchase_id FROM business_personal_offers LIMIT 0");
    console.log("Personal offer columns verified.");
  });
} finally { await db.pool.end(); }
