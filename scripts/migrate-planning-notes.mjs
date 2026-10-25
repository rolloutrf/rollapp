import { productionRollsDatabase } from "./rolls-database.mjs";
import { notesSchema } from "../server/notes.js";

// Run only with explicit approval, separately from ordinary UI releases.
const db = await productionRollsDatabase();
try {
  console.log(`Verified configured target: database=${db.target.database}, role=${db.target.role}`);
  if (!process.argv.includes("--apply")) {
    const result = await db.transaction(async client => {
      await client.query("SET TRANSACTION READ ONLY");
      return client.query("SELECT to_regclass('planning_notes')::text AS notes_table");
    });
    console.log(JSON.stringify(result.rows[0]));
    console.log("Read-only check. Explicitly authorized application requires --apply.");
  } else await db.transaction(async client => {
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='15s'");
    await client.query(notesSchema);
    await client.query("SELECT id,user_id,title,content,created_at,updated_at FROM planning_notes LIMIT 0");
  });
  if (process.argv.includes("--apply")) console.log("Configured production database verified; planning_notes table/index ready. No existing user records changed.");
} finally {
  await db.pool.end();
}
