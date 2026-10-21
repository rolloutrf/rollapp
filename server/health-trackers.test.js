import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { registerHealthTrackerRoutes } from "./health-trackers.js";

test("tracker routes validate and enforce owner/section boundaries without database access", async () => {
  const app = express(); app.use(express.json());
  const calls = [];
  let failure = null;
  registerHealthTrackerRoutes(app, {
    query: async (sql, params) => { calls.push({ sql, params }); if (failure) throw failure; return { rows: sql.startsWith("SELECT") ? [] : [{ id: params[0], data_json: JSON.stringify({ date: "2026-10-20" }) }] }; },
    requireAuth: (req, res, next) => { if (!req.headers.authorization) return res.sendStatus(401); req.user = { id: "viewer" }; next(); },
    requirePrivateSphereOwner: (req, res, next) => req.query.owner ? res.sendStatus(403) : next(),
    requireSphereReadAccess: (sphere, section) => (req, res, next) => { assert.equal(sphere, "health"); if (req.query.denied) return res.sendStatus(403); assert.equal(section(req), req.params.tracker); req.user = { id: "shared-owner" }; next(); },
    asyncRoute: handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next),
  });
  const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
  const origin = `http://127.0.0.1:${server.address().port}/api/health/trackers`;
  const request = (path, options = {}) => fetch(origin + path, { headers: { authorization: "test", "content-type": "application/json" }, ...options });
  try {
    assert.equal((await fetch(origin + "/sleep")).status, 401);
    assert.equal((await request("/unknown")).status, 404);
    assert.equal((await request("/sleep?denied=1")).status, 403);
    assert.equal(calls.length, 0);
    assert.equal((await request("/sleep")).status, 200);
    assert.deepEqual(calls.at(-1).params, ["shared-owner", "sleep"]);
    assert.equal((await request("/sleep", { method: "POST", body: "{}" })).status, 400);
    const data = { date: "2026-10-20", bedtime: "23:00", wakeTime: "07:00", quality: 4, notes: "" };
    assert.equal((await request("/sleep?owner=other", { method: "POST", body: JSON.stringify(data) })).status, 403);
    assert.equal((await request("/sleep", { method: "POST", body: JSON.stringify(data) })).status, 201);
    assert.equal(calls.at(-1).params[1], "viewer"); assert.equal(calls.at(-1).params[2], "sleep");
    assert.equal((await request("/sleep/entry", { method: "PATCH", body: JSON.stringify(data) })).status, 200);
    assert.deepEqual(calls.at(-1).params.slice(2), ["entry", "viewer", "sleep"]);
    assert.equal((await request("/nutrition/entry", { method: "DELETE" })).status, 200);
    assert.deepEqual(calls.at(-1).params, ["entry", "viewer", "nutrition"]);
    failure = { code: "42P01" };
    const unavailable = await request("/nutrition"); assert.equal(unavailable.status, 503); assert.equal((await unavailable.json()).code, "HEALTH_TRACKER_SCHEMA_REQUIRED");
  } finally { await new Promise(resolve => server.close(resolve)); }
});
