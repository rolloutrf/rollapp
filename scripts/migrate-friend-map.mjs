import { friendMapSchema, verifyFriendMapSchema } from "../server/modules/map/friend-map-schema.js";
import { productionRollsDatabase } from "./rolls-database.mjs";

const db = await productionRollsDatabase();
try {
  console.log(JSON.stringify({ target: db.target, migration: "friend-map-v1" }));
  if (process.argv.includes("--apply")) {
    if (!process.argv.includes(`--database=${db.target.database}`)) {
      throw new Error("Передайте точное имя проверенной БД через --database=…");
    }
    await db.transaction(async client => {
      await client.query("SET LOCAL lock_timeout='5s'");
      await client.query("SET LOCAL statement_timeout='30s'");
      await client.query(friendMapSchema);
      await verifyFriendMapSchema(client);
    });
    console.log(JSON.stringify({ applied: true }));
  } else {
    await db.transaction(async client => {
      await client.query("SET TRANSACTION READ ONLY");
      const { rows: [schema] } = await client.query(`SELECT
        to_regclass('friend_map_preferences')::text AS preferences,
        to_regclass('friend_map_locations')::text AS locations,
        to_regclass('friend_map_proximity')::text AS proximity,
        to_regclass('user_notifications')::text AS notifications`);
      const mapTables = [schema.preferences, schema.locations, schema.proximity];
      if (mapTables.some(Boolean) && !mapTables.every(Boolean)) throw new Error("Incomplete friend map schema");
      if (mapTables.every(Boolean)) await verifyFriendMapSchema(client);
      if (!schema.notifications) throw new Error("Сначала установите схему оповещений");
      console.log(JSON.stringify({ schema, applied: false }));
    });
  }
} finally {
  await db.pool.end();
}
