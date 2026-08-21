import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const dbModuleUrl = new URL("./db.js", import.meta.url).href;
const databaseEnvironmentKeys = [
  "DATABASE_URL",
  "PGHOST",
  "PGPORT",
  "PGDATABASE",
  "PGUSER",
  "PGPASSWORD",
];

function runDbProbe(source, overrides = {}) {
  const env = { ...process.env };
  for (const key of databaseEnvironmentKeys) delete env[key];
  Object.assign(env, overrides);
  return spawnSync(process.execPath, ["--input-type=module", "--eval", source], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
    env,
    timeout: 10_000,
  });
}

test("the PostgreSQL pool handles idle client errors without logging error details", () => {
  const result = runDbProbe(`
    const { isMemoryDatabase, pool } = await import(${JSON.stringify(dbModuleUrl)});
    if (isMemoryDatabase) throw new Error("Expected a PostgreSQL pool");
    if (pool.listenerCount("error") < 1) throw new Error("Missing pool error listener");
    const error = new Error("password=must-not-appear");
    error.code = "ECONNRESET";
    pool.emit("error", error);
    await pool.end();
  `, {
    DEMO_MODE: "false",
    PGHOST: "127.0.0.1",
    PGDATABASE: "rollapp_test",
    PGUSER: "rollapp_test",
    PGPASSWORD: "must-not-appear",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /Idle PostgreSQL client disconnected/);
  assert.doesNotMatch(result.stderr, /must-not-appear|password=/);
});

test("the in-memory database remains usable without PostgreSQL configuration", () => {
  const result = runDbProbe(`
    const { isMemoryDatabase, pool, query } = await import(${JSON.stringify(dbModuleUrl)});
    if (!isMemoryDatabase) throw new Error("Expected the in-memory database");
    const response = await query("SELECT 1 AS ok");
    if (Number(response.rows[0]?.ok) !== 1) throw new Error("In-memory query failed");
    await pool.end();
  `, { DEMO_MODE: "true" });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
});
