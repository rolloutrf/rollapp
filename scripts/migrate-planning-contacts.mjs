import { productionRollsDatabase } from "./rolls-database.mjs";

// Deliberate additive feature migration, never invoked by development startup.
// productionRollsDatabase verifies the exact configured database and role first.
const db = await productionRollsDatabase();
try {
  await db.transaction(async (client) => {
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='15s'");
    await client.query("ALTER TABLE planning_tasks ADD COLUMN IF NOT EXISTS contact_ids JSONB NOT NULL DEFAULT '[]'");
  });
  console.log("Configured production database verified; planning contact links ready (no user records changed).");
} finally {
  await db.pool.end();
}
