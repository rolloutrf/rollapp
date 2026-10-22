import assert from "node:assert/strict";
import test from "node:test";
import { migratePlanningResults } from "./planning-results-migration.js";

const column = name => ({ column_name: name, data_type: "text", is_nullable: "NO", column_default: "''::text" });
function fixture(initial = []) {
  let rows = initial;
  const calls = [];
  return { calls, query: async sql => {
    calls.push(sql);
    if (sql.startsWith("ALTER TABLE")) rows = [column("expected_result"), column("actual_result")];
    return { rows: sql.includes("information_schema.columns") ? rows : [] };
  } };
}
test("planning outcomes migration defaults to read-only and reports both missing fields", async () => {
  const client = fixture();
  assert.deepEqual(await migratePlanningResults(client), { mode: "read-only", missing: ["expected_result", "actual_result"] });
  assert.equal(client.calls[0], "SET TRANSACTION READ ONLY");
  assert(!client.calls.some(sql => /ALTER|UPDATE|DELETE|INSERT/.test(sql)));
});
test("explicit outcome migration adds only two columns atomically and is idempotent", async () => {
  const client = fixture();
  assert.deepEqual(await migratePlanningResults(client, { apply: true }), { mode: "applied", added: ["expected_result", "actual_result"] });
  assert.deepEqual(await migratePlanningResults(client, { apply: true }), { mode: "applied", added: [] });
  assert.equal(client.calls.filter(sql => sql.startsWith("ALTER TABLE")).length, 1);
  assert(!client.calls.some(sql => /\b(UPDATE|DELETE|INSERT|DROP)\b/.test(sql)));
  assert(client.calls.includes("SET LOCAL lock_timeout='5s'"));
});
test("outcome migration refuses incompatible existing columns without DDL or repair", async () => {
  for (const override of [{ data_type: "integer" }, { is_nullable: "YES" }, { column_default: null }]) {
    const client = fixture([{ ...column("expected_result"), ...override }]);
    await assert.rejects(migratePlanningResults(client, { apply: true }), /Incompatible existing/);
    assert(!client.calls.some(sql => sql.startsWith("ALTER TABLE")));
  }
});
