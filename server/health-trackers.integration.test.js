import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import { registerHealthTrackerRoutes } from "./health-trackers.js";

test("health trackers persist, reload and isolate owners in a rollback-only production transaction", { skip: process.env.ROLLAPP_TEST_HEALTH !== "1" }, async () => {
  const { productionRollsDatabase } = await import("../scripts/rolls-database.mjs");
  const db = await productionRollsDatabase();
  const client = await db.pool.connect();
  let server;
  const ids = [randomUUID(), randomUUID()];
  const created = [];
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='10s'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout='60s'");
    for (const id of ids) await client.query("INSERT INTO users (id,email,username,name,password_hash) VALUES ($1,$2,$3,'Health tracker test','unusable')", [id, `${id}@health-test.invalid`, `health-${id}`]);
    const app = express(); app.use(express.json());
    const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
    const requireAuth = (req, res, next) => { if (!ids.includes(req.headers['x-test-user'])) return res.sendStatus(401); req.user = { id: req.headers['x-test-user'] }; next(); };
    registerHealthTrackerRoutes(app, { query: (sql, params) => client.query(sql, params), requireAuth, asyncRoute, requireSphereReadAccess: () => (_req, _res, next) => next(), requirePrivateSphereOwner: (_req, _res, next) => next() });
    server = await new Promise(resolve => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
    const request = async (method, path, body, user = ids[0]) => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/health/trackers/${path}`, { method, headers: { 'content-type': 'application/json', 'x-test-user': user }, ...(body ? { body: JSON.stringify(body) } : {}) });
      return { status: response.status, data: await response.json() };
    };
    for (const [tracker, data] of Object.entries({
      sleep: { date: "2026-10-20", bedtime: "23:30", wakeTime: "07:15", quality: 4, notes: "Rollback-only test" },
      nutrition: { completed: true, date: "2026-10-20", time: "12:00", mealType: "lunch", title: "Rollback-only meal", calories: 350, protein: 20.5, fat: 0, carbs: null, notes: "" },
    })) {
      const added = await request("POST", tracker, data); assert.equal(added.status, 201);
      const id = added.data.entry.id; created.push(id);
      const reload = await request("GET", tracker); assert.equal(reload.data.entries.length, 1);
      const { id: savedId, updatedAt, ...saved } = reload.data.entries[0]; assert.equal(savedId, id); assert.deepEqual(saved, data);
      assert.deepEqual((await request("GET", tracker, undefined, ids[1])).data.entries, []);
      assert.equal((await request("PATCH", `${tracker}/${id}`, data, ids[1])).status, 404);
      assert.equal((await request("DELETE", `${tracker}/${id}`, undefined, ids[1])).status, 404);
      assert.equal((await request("PATCH", `${tracker}/${id}`, { ...data, notes: "Updated" })).data.entry.notes, "Updated");
      if (tracker === "nutrition") {
        assert.equal((await request("PATCH", `${tracker}/${id}`, { ...data, completed: false })).data.entry.completed, false);
        assert.equal((await request("GET", tracker)).data.entries[0].completed, false);
      }
      const wrongTracker = tracker === "sleep" ? "nutrition" : "sleep";
      assert.equal((await request("DELETE", `${wrongTracker}/${id}`)).status, 404);
      assert.equal((await request("DELETE", `${tracker}/${id}`)).status, 200);
      assert.deepEqual((await request("GET", tracker)).data.entries, []);
    }
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    try {
    await client.query("ROLLBACK");
    const remains = await client.query("SELECT id FROM users WHERE id=ANY($1::text[]) UNION ALL SELECT id FROM health_tracker_entries WHERE id=ANY($2::text[])", [ids, created]);
    assert.equal(remains.rowCount, 0, "Rollback must remove all temporary users and entries");
    } finally { client.release(); await db.pool.end(); }
  }
});
