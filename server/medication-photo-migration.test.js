import assert from "node:assert/strict";
import test from "node:test";
import { migrateMedicationPhoto } from "./medication-photo-migration.js";

const column = name => ({ column_name: name, data_type: "text", is_nullable: "NO", column_default: "''::text" });
function fixture(initial = []) {
  let rows = initial;
  const calls = [];
  return { calls, query: async sql => {
    calls.push(sql);
    if (sql.startsWith("ALTER TABLE")) rows = [column("image_url")];
    return { rows: sql.includes("information_schema.columns") ? rows : [] };
  } };
}
test("medication photo migration defaults to read-only and reports the missing photo column", async () => {
  const client = fixture();
  assert.deepEqual(await migrateMedicationPhoto(client), { mode: "read-only", missing: ["image_url"] });
  assert.equal(client.calls[0], "SET TRANSACTION READ ONLY");
  assert(!client.calls.some(sql => /ALTER|UPDATE|DELETE|INSERT/.test(sql)));
});
test("explicit photo migration adds only one column atomically and is idempotent", async () => {
  const client = fixture();
  assert.deepEqual(await migrateMedicationPhoto(client, { apply: true }), { mode: "applied", added: ["image_url"] });
  assert.deepEqual(await migrateMedicationPhoto(client, { apply: true }), { mode: "applied", added: [] });
  assert.equal(client.calls.filter(sql => sql.startsWith("ALTER TABLE")).length, 1);
  assert(!client.calls.some(sql => /\b(UPDATE|DELETE|INSERT|DROP)\b/.test(sql)));
  assert(client.calls.includes("SET LOCAL lock_timeout='5s'"));
});
test("photo migration refuses incompatible existing columns without DDL or repair", async () => {
  for (const override of [{ data_type: "integer" }, { is_nullable: "YES" }, { column_default: null }]) {
    const client = fixture([{ ...column("image_url"), ...override }]);
    await assert.rejects(migrateMedicationPhoto(client, { apply: true }), /Incompatible existing/);
    assert(!client.calls.some(sql => sql.startsWith("ALTER TABLE")));
  }
});
