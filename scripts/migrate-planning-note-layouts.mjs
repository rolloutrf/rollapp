import { productionRollsDatabase } from "./rolls-database.mjs";
import { noteGroupsSchema, verifyNoteGroupsSql } from "../server/note-groups.js";

const apply = process.argv.includes("--apply");
const db = await productionRollsDatabase();
try {
  console.log(`Verified configured target: database=${db.target.database}, role=${db.target.role}`);
  await db.transaction(async client => {
    if (!apply) await client.query("SET TRANSACTION READ ONLY");
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='15s'");
    await client.query("SELECT id,user_id FROM planning_notes LIMIT 0");
    if (apply) {
      await client.query(noteGroupsSchema);
      await client.query(verifyNoteGroupsSql);
      console.log("planning_note_layouts schema verified.");
    } else {
      const { rows: [row] } = await client.query("SELECT to_regclass('planning_note_layouts')::text AS note_layouts_table");
      if (row.note_layouts_table) await client.query(verifyNoteGroupsSql);
      console.log(JSON.stringify(row));
    }
  });
} finally {
  await db.pool.end();
}
