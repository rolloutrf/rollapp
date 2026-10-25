import assert from "node:assert/strict";
import test from "node:test";
import { migratePersonalDevelopmentPlan } from "./personal-development-plan-migration.js";

function database({ extra = [], missing = false } = {}) {
  const statements = [];
  let sections = ["four-questions", "theses", "principles", "values", "character", "mission", "ideal-state", "life-strategy", ...extra];
  return { statements, async query(sql) {
    statements.push(sql);
    if (sql.includes("pg_get_constraintdef")) return { rows: missing ? [] : [{ definition: `CHECK (section = ANY (ARRAY[${sections.map(value => `'${value}'::text`).join(",")}]))` }] };
    if (sql.startsWith("ALTER TABLE") && sql.includes("ADD CONSTRAINT")) sections.push("personal-development-plan");
    return { rows: [] };
  } };
}

test("inspection is read-only and cannot alter production schema", async () => {
  const client = database();
  assert.deepEqual(await migratePersonalDevelopmentPlan(client), { mode: "read-only", missing: ["personal-development-plan"] });
  assert.equal(client.statements[0], "SET TRANSACTION READ ONLY");
  assert.equal(client.statements.some(sql => sql.includes("ALTER TABLE")), false);
});

test("explicit migration is bounded and idempotent", async () => {
  const client = database();
  assert.deepEqual(await migratePersonalDevelopmentPlan(client, { apply: true }), { mode: "applied", added: ["personal-development-plan"] });
  assert.ok(client.statements.includes("SET LOCAL lock_timeout='5s'"));
  const alterations = client.statements.filter(sql => sql.startsWith("ALTER TABLE")).length;
  assert.deepEqual(await migratePersonalDevelopmentPlan(client, { apply: true }), { mode: "applied", added: [] });
  assert.equal(client.statements.filter(sql => sql.startsWith("ALTER TABLE")).length, alterations);
});

test("missing or unrecognized constraints fail closed before DDL", async () => {
  for (const config of [{ missing: true }, { extra: ["future-section"] }]) {
    const client = database(config);
    await assert.rejects(migratePersonalDevelopmentPlan(client, { apply: true }));
    assert.equal(client.statements.some(sql => sql.includes("ALTER TABLE")), false);
  }
});
