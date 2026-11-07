import { productionRollsDatabase } from "./rolls-database.mjs";
import { profilePublicationsSchema } from "../server/profile-publications.js";

// Default to a read-only preflight. Applying DDL is a separate release operation.
const args = process.argv.slice(2);
if (args.length > 1 || (args.length && args[0] !== "--apply")) {
  throw new Error("Use node scripts/profile-publications-schema.mjs [--apply]");
}
process.env.PG_POOL_SIZE = "1";
const db = await productionRollsDatabase();
try {
  console.log("Verified production database and role:", db.target);
  const inspect = async (client) => {
    const { rows: [tables] } = await client.query(`
      SELECT to_regclass('profile_session_slots')::text AS slots,
             to_regclass('profile_session_bookings')::text AS bookings,
             to_regclass('profile_announcements')::text AS announcements
    `);
    console.log(tables);
    if (!Object.values(tables).every(Boolean)) return false;
    await client.query("SELECT id,owner_id,starts_at,ends_at,title FROM profile_session_slots LIMIT 0");
    await client.query("SELECT id,slot_id,guest_id FROM profile_session_bookings LIMIT 0");
    await client.query("SELECT id,owner_id,title,body,created_at FROM profile_announcements LIMIT 0");
    return true;
  };
  await db.transaction(async (client) => {
    await client.query("SET TRANSACTION READ ONLY");
    if (!await inspect(client) && !args.length) process.exitCode = 1;
  });
  if (args.length) {
    await db.transaction(async (client) => {
      await client.query("SET LOCAL lock_timeout='5s'");
      await client.query("SET LOCAL statement_timeout='20s'");
      await client.query(profilePublicationsSchema);
      if (!await inspect(client)) throw new Error("Profile publications schema is incomplete");
    });
  }
} finally {
  await db.pool.end();
}
