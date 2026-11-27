import { productionRollsDatabase } from "./rolls-database.mjs";
import { profilePublicationsSchema, verifyProfilePublicationsSchema } from "../server/modules/profile/profile-publications.js";

// Default to a read-only preflight. Applying DDL is a separate release operation.
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const database = args.find(arg => arg.startsWith("--database="))?.slice("--database=".length);
if (args.some(arg => arg !== "--apply" && !arg.startsWith("--database=")) || (!apply && database)) {
  throw new Error("Use node scripts/profile-publications-schema.mjs [--apply --database=<exact database>]");
}
process.env.PG_POOL_SIZE = "1";
const db = await productionRollsDatabase();
try {
  console.log("Verified production database and role:", db.target);
  const inspect = async (client, { verify = true } = {}) => {
    const { rows: [tables] } = await client.query(`
      SELECT to_regclass('profile_session_slots')::text AS slots,
             to_regclass('profile_session_bookings')::text AS bookings,
             to_regclass('profile_announcements')::text AS announcements
    `);
    console.log(tables);
    if (!Object.values(tables).every(Boolean)) return false;
    if (verify) await verifyProfilePublicationsSchema(client);
    return true;
  };
  await db.transaction(async (client) => {
    await client.query("SET TRANSACTION READ ONLY");
    if (!await inspect(client, { verify: !apply }) && !apply) process.exitCode = 1;
  });
  if (apply) {
    if (!database || database !== db.target.database) {
      throw new Error("Передайте точное имя проверенной БД через --database=…");
    }
    await db.transaction(async (client) => {
      await client.query("SET LOCAL lock_timeout='5s'");
      await client.query("SET LOCAL statement_timeout='20s'");
      await client.query(profilePublicationsSchema);
      await verifyProfilePublicationsSchema(client);
      if (!await inspect(client)) throw new Error("Profile publications schema is incomplete");
    });
  }
} finally {
  await db.pool.end();
}
