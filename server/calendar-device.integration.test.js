import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import { z } from "zod";
import { registerCalendarDeviceRoutes } from "./calendar-device.js";
import { registerPlanningRoutes } from "./planning.js";
import { hashToken } from "./security.js";

test("device Calendar intake persists read-only events with scoped, revocable credentials on production schema", { skip: process.env.ROLLAPP_TEST_PLANNING !== "1" }, async () => {
  const { productionRollsDatabase } = await import("../scripts/rolls-database.mjs");
  const db = await productionRollsDatabase(), client = await db.pool.connect();
  let pending = Promise.resolve(), server;
  const query = (sql, values) => { const result = pending.then(() => client.query(sql, values)); pending = result.catch(() => {}); return result; };
  try {
    await query("BEGIN"); await query("SET LOCAL lock_timeout='5s'"); await query("SET LOCAL statement_timeout='10s'"); await query("SET LOCAL idle_in_transaction_session_timeout='60s'");
    const owners = [randomUUID(), randomUUID()], sessions = [randomUUID(), randomUUID()], spaces = [randomUUID(), randomUUID()], deviceId = randomUUID();
    for (const [i, owner] of owners.entries()) {
      await query("INSERT INTO users (id,email,username,name,password_hash) VALUES ($1,$2,$3,$4,$5)", [owner, `${owner}@device-test.invalid`, `device-${owner}`, "Device rollback test", "unusable"]);
      await query("INSERT INTO sessions (token_hash,user_id,expires_at) VALUES ($1,$2,$3)", [hashToken(sessions[i]), owner, new Date(Date.now() + 600000)]);
    }
    for (const id of spaces) await query("INSERT INTO planning_spaces (id,user_id,kind,title,columns_json) VALUES ($1,$2,'calendar',$3,$4)", [id, owners[0], "Тест устройства", JSON.stringify([{ id: "todo", title: "Планы", complete: false }])]);
    const localId = randomUUID(); await query("INSERT INTO planning_tasks (id,user_id,space_id,title,due_on) VALUES ($1,$2,$3,'Моя задача','2026-10-25')", [localId, owners[0], spaces[0]]);
    const app = express(); app.use(express.json({ limit: "4mb" }));
    const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
    const requireAuth = asyncRoute(async (req, res, next) => {
      const found = await query("SELECT user_id FROM sessions WHERE token_hash=$1 AND expires_at>CURRENT_TIMESTAMP", [hashToken(req.get("X-Test-Session") || "")]);
      if (!found.rowCount) return res.status(401).json({ error: "Требуется вход" });
      req.user = { id: found.rows[0].user_id }; next();
    });
    const dependencies = { query, transaction: callback => callback({ query }), requireAuth, asyncRoute };
    registerPlanningRoutes(app, dependencies);
    registerCalendarDeviceRoutes(app, { ...dependencies, env: { USER_CREDENTIALS_SECRET: "rollback-device-secret-never-used-in-production" } });
    app.use((error, _req, res, _next) => res.status(error instanceof z.ZodError ? 400 : 500).json({ error: error.message }));
    server = await new Promise(resolve => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const request = async (method, pathname, body, session = sessions[0], token) => {
      const response = await fetch(`${origin}${pathname}`, { method, headers: { "Content-Type": "application/json", "X-Test-Session": session, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
      return { status: response.status, body: await response.json() };
    };
    const endpoint = (method, space, body, session) => request(method, `/api/planning/calendar-device?space=${space}`, body, session);
    const events = (space, session) => request("GET", `/api/planning/calendar-device/events?space=${space}`, null, session);
    assert.equal((await endpoint("GET", spaces[0], null, "invalid")).status, 401);
    assert.equal((await endpoint("POST", spaces[0], {}, sessions[1])).status, 404);
    const first = await endpoint("POST", spaces[0], {}); assert.equal(first.status, 200);
    assert.equal((await endpoint("POST", spaces[0], {})).body.token, first.body.token);
    assert.equal((await endpoint("GET", spaces[0], null, first.body.token)).status, 401, "Device credential authenticated a browser");
    const event = { id: "native-event", title: "Встреча Apple", description: "Детали", start: "2026-10-25T07:17:00Z", end: "2026-10-25T08:00:00Z", allDay: false, calendar: "На моём Mac" };
    const snapshot = { deviceId, deviceName: "Mac", from: "2026-10-24", to: "2026-10-27", timeZone: "Europe/Moscow", events: [event] };
    const push = (body = snapshot, token = first.body.token) => request("POST", "/api/calendar-device/snapshot", body, "", token);
    assert.equal((await push(snapshot, "invalid")).status, 401);
    const imported = await push(); assert.equal(imported.status, 200, JSON.stringify(imported.body));
    assert.equal(imported.body.eventCount, 1);
    let rows = await events(spaces[0]); assert.equal(rows.body.events.length, 1);
    const id = rows.body.events[0].id;
    assert.equal(rows.body.events[0].external, "apple-device"); assert.equal(rows.body.events[0].startTime, "10:17"); assert.equal(rows.body.events[0].durationMinutes, 43);
    assert.equal((await events(spaces[0], sessions[1])).status, 404);
    assert.equal((await events(spaces[1])).body.events.length, 0);
    assert.equal((await request("GET", `/api/planning/tasks?space=${spaces[0]}`)).body.tasks.length, 1, "Imported events leaked into To Do/Kanban tasks");
    for (const [method, suffix, body] of [["PATCH", "", { title: "Не менять" }], ["PATCH", "/move", { columnId: "todo" }], ["DELETE", "", null]]) assert.equal((await request(method, `/api/planning/tasks/${id}${suffix}?space=${spaces[0]}`, body)).status, 409);
    assert.equal((await push({ ...snapshot, deviceId: randomUUID() })).status, 409, "Second device replaced the paired source");
    assert.equal((await push({ ...snapshot, events: [event, event] })).status, 400);
    assert.equal((await events(spaces[0])).body.events[0].title, "Встреча Apple", "Failed snapshot changed existing events");
    assert.equal((await push({ ...snapshot, events: [{ ...event, title: "Обновлено на устройстве", start: "2026-10-25T08:17:00Z", end: "2026-10-25T09:00:00Z" }] })).status, 200);
    rows = await events(spaces[0]); assert.equal(rows.body.events.length, 1); assert.equal(rows.body.events[0].id, id); assert.equal(rows.body.events[0].startTime, "11:17");
    assert.equal((await push({ ...snapshot, events: [] })).status, 200);
    assert.equal((await events(spaces[0])).body.events.length, 0);
    assert.equal((await query("SELECT archived FROM planning_tasks WHERE id=$1", [localId])).rows[0].archived, false, "Snapshot archived a local task");
    await push(); const second = await endpoint("POST", spaces[1], {});
    assert.equal((await push(snapshot, second.body.token)).status, 200);
    assert.equal((await request("POST", `/api/planning/columns?space=${spaces[1]}`, { title: "Другой список" })).status, 201);
    assert.equal((await request("DELETE", `/api/planning/columns/todo?space=${spaces[1]}`)).status, 200, "Imported events occupied a To Do column");
    await endpoint("DELETE", spaces[0]);
    assert.equal((await push()).status, 401); assert.equal((await events(spaces[0])).body.events.length, 0);
    assert.equal((await events(spaces[1])).body.events.length, 1);
    assert.equal((await endpoint("GET", spaces[1])).status, 200, "Disconnect removed browser login");
    await query("DELETE FROM sessions WHERE user_id=$1", [owners[0]]);
    assert.equal((await push(snapshot, second.body.token)).status, 401, "Account-wide revocation retained a device capability");
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await pending; await client.query("ROLLBACK"); client.release(); await db.pool.end();
  }
});
