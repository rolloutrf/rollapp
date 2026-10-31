import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { BUSINESS_CATEGORIES, canBusinessAccessSection } from "../shared/business-accounts.js";

test("production business categories persist and enforce account/category constraints inside rollback only", { skip: process.env.ROLLAPP_TEST_BUSINESS_CATEGORIES !== "1" }, async () => {
  const { productionRollsDatabase } = await import("../scripts/rolls-database.mjs");
  const { default: dotenv } = await import("dotenv");
  dotenv.config({ path: ".env.local", override: false, quiet: true });
  const { productionConnectionMode } = await import("../scripts/production-dev-config.mjs");
  if (productionConnectionMode(process.env) === "tunnel") {
    const { startTunnel, createProductionDatabaseEnvironment } = await import("../scripts/production-db-tunnel.mjs");
    const tunnel = await startTunnel();
    if (!tunnel.ready) throw new Error("Production PostgreSQL недоступен через SSH-туннель.");
    Object.assign(process.env, createProductionDatabaseEnvironment(process.env, tunnel.config));
  }
  const db = await productionRollsDatabase();
  let client;
  const ids = [];
  try {
    client = await db.pool.connect();
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout='2s'");
    await client.query("SET LOCAL statement_timeout='5s'");
    // No schema initialization, migrations, existing-account changes or HTTP
    // side effects. All temporary rows are uncommitted and always rolled back.
    await client.query("SELECT account_type,business_category FROM users LIMIT 0");
    for (const category of BUSINESS_CATEGORIES) {
      const id = randomUUID();
      ids.push(id);
      await client.query("INSERT INTO users (id,email,username,name,password_hash,account_type,business_category) VALUES ($1,$2,$3,$4,$5,'business',$6)",
        [id, `${id}@rollapp.test`, `category-check-${id}`, "Rollback category check", "unusable-test-password", category.id]);
      const saved = await client.query("SELECT account_type,business_category FROM users WHERE id=$1", [id]);
      assert.equal(saved.rows[0].business_category, category.id);
      for (const other of BUSINESS_CATEGORIES) {
        const section = other.sphere === "wishlist" ? "wishlist" : other.sphere === "identity" ? "values" : other.sphere === "health" ? "lab-results" : other.sphere === "education" ? "courses" : "cv";
        assert.equal(canBusinessAccessSection(saved.rows[0], other.sphere, section), category.id === other.id);
      }
    }
    for (const [accountType, category] of [["business", "unknown"], ["personal", "doctor"]]) {
      await client.query("SAVEPOINT invalid_category");
      const id = randomUUID();
      await assert.rejects(client.query("INSERT INTO users (id,email,username,name,password_hash,account_type,business_category) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [id, `${id}@rollapp.test`, `category-check-${id}`, "Invalid category check", "unusable-test-password", accountType, category]), (error) => error.code === "23514");
      await client.query("ROLLBACK TO SAVEPOINT invalid_category");
    }
  } finally {
    try {
      try { if (client) await client.query("ROLLBACK"); } finally { client?.release(); }
      const remaining = await db.query("SELECT COUNT(*)::int AS count FROM users WHERE id=ANY($1::text[])", [ids]);
      assert.equal(remaining.rows[0].count, 0, "Category checks must leave no accounts behind");
    } finally { await db.pool.end(); }
  }
});
