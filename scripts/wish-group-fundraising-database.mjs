import { productionRollsDatabase } from "./rolls-database.mjs";
import { wishGroupFundraisingSchema } from "../server/wish-group-fundraising-schema.js";

const args = process.argv.slice(2);
if (args.some(arg => !["--apply"].includes(arg))) throw new Error("Использование: node scripts/wish-group-fundraising-database.mjs [--apply]");
const db = await productionRollsDatabase();
try {
  // productionRollsDatabase verifies database, role and users against config.
  console.log(`Проверенная production-база: ${db.target.database}; роль: ${db.target.role}.`);
  if (args.includes("--apply")) {
    await db.transaction(async client => {
      await client.query("SET LOCAL lock_timeout='5s'");
      await client.query(wishGroupFundraisingSchema);
    });
    console.log("Созданы только две таблицы и индекс сборов. Пользовательские данные не изменялись.");
  }
  await db.transaction(async client => {
    await client.query("SET TRANSACTION READ ONLY");
    await client.query("SELECT id,group_id,owner_id,title,target,accepting,created_at FROM wish_group_fundraisers LIMIT 0");
    await client.query("SELECT transaction_id,fundraiser_id,sender_id,idempotency_key FROM wish_group_contributions LIMIT 0");
  });
  console.log("Существующая схема сборов проверена без записи.");
} finally { await db.pool.end(); }
