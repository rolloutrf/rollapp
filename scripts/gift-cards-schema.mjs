import { productionRollsDatabase } from "./rolls-database.mjs";
import { giftCardsSchema } from "../server/gift-cards-schema.js";

// Read-only by default. --apply is a separate, explicitly authorized operation.
const args = process.argv.slice(2);
if (args.some((arg) => !(arg === "--apply" || /^--(?:database|role)=[a-zA-Z0-9_-]+$/.test(arg)))) throw new Error("Неизвестный аргумент");
const db = await productionRollsDatabase();
try {
  console.log(`Target: database=${db.target.database}, role=${db.target.role}`);
  if (args.includes("--apply")) {
    if (!args.includes(`--database=${db.target.database}`) || !args.includes(`--role=${db.target.role}`)) {
      throw new Error("Для применения подтвердите точную базу и роль через --database и --role");
    }
    await db.transaction(async (client) => {
      await client.query("SET LOCAL lock_timeout='3s'");
      await client.query("SET LOCAL statement_timeout='15s'");
      await client.query(giftCardsSchema);
    });
    console.log("Gift-card schema applied. No balances or existing data changed.");
  }
  const result = await db.transaction(async (client) => {
    await client.query("SET TRANSACTION READ ONLY");
    const tables = await client.query("SELECT to_regclass('business_gift_cards')::text AS cards,to_regclass('business_gift_card_events')::text AS events");
    if (tables.rows[0].cards && tables.rows[0].events) {
      await client.query("SELECT id,business_id,creator_id,owner_id,balance,issue_key,created_at FROM business_gift_cards LIMIT 0");
      await client.query("SELECT id,card_id,actor_id,kind,amount,recipient_id,request_key,purchase,purchase_id,created_at FROM business_gift_card_events LIMIT 0");
    }
    return tables;
  });
  const ready = Boolean(result.rows[0].cards && result.rows[0].events);
  console.log(ready ? "Gift-card tables present." : "Gift-card tables missing; a separately authorized schema operation is required.");
  if (!ready) process.exitCode = 1;
} finally { await db.pool.end(); }
