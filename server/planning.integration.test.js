import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import express from "express";
import cookieParser from "cookie-parser";
import { z } from "zod";
import { registerPlanningRoutes } from "./planning.js";
import { hashToken } from "./security.js";
import { localDateKey } from "../shared/planning.js";

test("planning persists both views and isolates owners on production PostgreSQL", { skip: process.env.ROLLAPP_TEST_PLANNING !== "1" }, async () => {
  const { productionRollsDatabase } = await import("../scripts/rolls-database.mjs");
  const db = await productionRollsDatabase();
  const client = await db.pool.connect();
  let pending = Promise.resolve();
  const query = (sql, params) => {
    const result = pending.then(() => client.query(sql, params));
    pending = result.catch(() => {});
    return result;
  };
  let server;
  let browser;
  try {
    await query("BEGIN");
    await query("SET LOCAL statement_timeout='10s'");
    await query("SET LOCAL idle_in_transaction_session_timeout='60s'");
    const ownerId = randomUUID();
    const otherId = randomUUID();
    const tokens = [randomUUID(), randomUUID()];
    for (const [index, id] of [ownerId, otherId].entries()) {
      await query("INSERT INTO users (id,email,username,name,password_hash) VALUES ($1,$2,$3,$4,$5)", [id, `${id}@planning-test.invalid`, `planning-${id}`, "Planning test", "unusable"]);
      await query("INSERT INTO sessions (token_hash,user_id,expires_at) VALUES ($1,$2,$3)", [hashToken(tokens[index]), id, new Date(Date.now() + 600_000)]);
    }
    const app = express();
    app.use(express.json(), cookieParser());
    const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
    const requireAuth = asyncRoute(async (req, res, next) => {
      const result = await query("SELECT u.id,u.name,u.username FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>CURRENT_TIMESTAMP", [hashToken(req.cookies.rw_session || "")]);
      if (!result.rowCount) return res.status(401).json({ error: "Требуется вход" });
      req.user = result.rows[0];
      next();
    });
    app.get("/api/me", requireAuth, (req, res) => res.json({ user: req.user }));
    registerPlanningRoutes(app, { query, transaction: (callback) => callback({ query }), requireAuth, asyncRoute });
    app.use((error, _req, res, _next) => res.status(error instanceof z.ZodError ? 400 : 500).json({ error: "Проверьте введённые данные" }));
    server = await new Promise((resolve) => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const request = async (method, suffix = "", body, token = tokens[0]) => {
      const response = await fetch(`${origin}/api/planning${(suffix.startsWith("/columns") || suffix.startsWith("/spaces")) ? suffix : `/tasks${suffix}`}`, { method, headers: { "Content-Type": "application/json", Cookie: `rw_session=${token}` }, ...(body ? { body: JSON.stringify(body) } : {}) });
      return { status: response.status, body: await response.json() };
    };
    assert.equal((await request("GET", "", undefined, "invalid")).status, 401);
    const result = await request("POST", "", { title: "Проверить планирование", description: "Проверить оба представления", dueOn: localDateKey(new Date()) });
    assert.equal(result.status, 201);
    const id = result.body.task.id;
    assert.equal((await request("PATCH", `/${id}`, { status: "doing" })).body.task.title, "Проверить планирование");
    assert.equal((await request("GET")).body.tasks[0].status, "doing");
    assert.equal((await request("GET")).body.tasks[0].description, "Проверить оба представления");
    assert.equal((await request("GET")).body.tasks[0].dueOn, localDateKey(new Date()));
    assert.equal((await request("PATCH", `/${id}`, { title: "Чужая задача" }, tokens[1])).status, 404);
    assert.equal((await request("DELETE", `/${id}`, undefined, tokens[1])).status, 404);
    assert.deepEqual((await request("GET", "", undefined, tokens[1])).body.tasks, []);
    assert.equal((await request("PATCH", `/${id}`, { dueOn: "2026-02-30" })).status, 400);
    assert.equal((await request("PATCH", `/${id}`, {})).status, 400);
    assert.equal((await request("PATCH", `/${id}`, { user_id: otherId })).status, 400);
    assert.equal((await request("PATCH", `/${id}`, { dueOn: "" })).body.task.dueOn, null);
    await request("PATCH", `/${id}`, { dueOn: localDateKey(new Date()) });

    assert.equal((await request("POST", "", { title: "Нет даты", startTime: "10:00" })).status, 400);
    assert.equal((await request("PATCH", `/${id}`, { startTime: "23:30", durationMinutes: 60 })).status, 400);
    assert.equal((await request("PATCH", `/${id}`, { startTime: "09:30", durationMinutes: 90 })).body.task.startTime, "09:30");
    assert.equal((await request("GET")).body.tasks.find((task) => task.id === id).durationMinutes, 90);
    assert.equal((await request("PATCH", `/${id}`, { dueOn: "" })).status, 400);
    assert.equal((await request("PATCH", `/${id}`, { startTime: "12:00" }, tokens[1])).status, 404);
    assert.equal((await request("PATCH", `/${id}`, { startTime: "" })).body.task.startTime, null);

    const custom = await request("POST", "/columns", { title: "На проверке" });
    assert.equal(custom.status, 201);
    const columnId = custom.body.columns.at(-1).id;
    assert.equal((await request("PATCH", `/columns/${columnId}`, { title: "Ревью" })).body.columns.at(-1).title, "Ревью");
    assert.equal((await request("PATCH", `/columns/${columnId}`, { title: "Чужой список" }, tokens[1])).status, 404);
    assert.equal((await request("DELETE", `/columns/${columnId}`, undefined, tokens[1])).status, 404);
    const second = (await request("POST", "", { title: "Вторая карточка", columnId })).body.task;
    assert.equal((await request("DELETE", `/columns/${columnId}`)).status, 409);
    assert.equal((await request("PATCH", `/${id}/move`, { columnId, beforeId: second.id })).status, 200);
    const ordered = (await request("GET")).body.tasks.filter((task) => task.columnId === columnId);
    assert.deepEqual(ordered.map((task) => task.id), [id, second.id]);
    await request("PATCH", `/${id}`, { completed: true });
    await request("PATCH", `/${id}/move`, { columnId, beforeId: null });
    assert.equal((await request("GET")).body.tasks.find((task) => task.id === id).completed, true);
    assert.equal((await request("PATCH", `/${id}/move`, { columnId, beforeId: second.id }, tokens[1])).status, 404);
    assert.equal((await request("PATCH", `/${id}/move`, { columnId, beforeId: "missing" })).status, 409);
    await request("PATCH", `/${id}`, { archived: true });
    assert.equal((await request("GET")).body.tasks.find((task) => task.id === id).archived, true);
    await request("PATCH", `/${id}`, { archived: false });
    await request("PATCH", `/${id}/move`, { columnId: "doing" });
    assert.equal((await request("GET")).body.tasks.find((task) => task.id === id).completed, false);
    await request("DELETE", `/${second.id}`);
    assert.equal((await request("DELETE", `/columns/${columnId}`)).status, 200);
    await request("PATCH", "/columns/done/move", { beforeId: "todo" });
    assert.equal((await request("GET")).body.columns[0].id, "done");
    await request("PATCH", "/columns/done/move", { beforeId: null });
    // Existing rows keep their status-derived list and completion without a data rewrite.
    const legacyId = randomUUID();
    await query("INSERT INTO planning_tasks (id,user_id,title,status) VALUES ($1,$2,$3,$4)", [legacyId, ownerId, "Старая карточка", "done"]);
    const legacy = (await request("GET")).body.tasks.find((task) => task.id === legacyId);
    assert.equal(legacy.columnId, "done");
    assert.equal(legacy.completed, true);
    await request("DELETE", `/${legacyId}`);

    // Named variants isolate content, list configuration, and writes even within one owner.
    const boardSpace = (await request("POST", "/spaces", { kind: "kanban", title: "Рабочие проекты" })).body.space;
    const calendarSpace = (await request("POST", "/spaces", { kind: "calendar", title: "Личный календарь" })).body.space;
    assert.equal((await request("POST", "/spaces", { kind: "kanban", title: "   " })).status, 400);
    const namedBoards = (await request("GET", "/spaces?kind=kanban")).body.spaces;
    assert(namedBoards.some((space) => space.id === boardSpace.id));
    assert(!namedBoards.some((space) => space.id === calendarSpace.id));
    assert.equal((await request("GET", "/spaces?kind=kanban", undefined, tokens[1])).body.spaces.length, 1);
    const scoped = `?space=${boardSpace.id}`;
    assert.deepEqual((await request("GET", scoped)).body.tasks, []);
    const namedTask = (await request("POST", scoped, { title: "Только рабочая доска" })).body.task;
    assert.equal((await request("GET", scoped)).body.tasks[0].id, namedTask.id);
    assert(!(await request("GET")).body.tasks.some((task) => task.id === namedTask.id));
    assert.deepEqual((await request("GET", `?space=${calendarSpace.id}`)).body.tasks, []);
    assert.equal((await request("GET", scoped, undefined, tokens[1])).status, 404);
    assert.equal((await request("POST", scoped, { title: "Чужой вариант" }, tokens[1])).status, 404);
    assert.equal((await request("PATCH", `/${namedTask.id}`, { title: "Неверная доска" })).status, 404);
    assert.equal((await request("PATCH", `/${namedTask.id}/move`, { columnId: "doing" })).status, 404);
    assert.equal((await request("DELETE", `/${namedTask.id}`)).status, 404);
    await request("PATCH", `/columns/todo${scoped}`, { title: "Рабочие задачи" });
    assert.equal((await request("GET", scoped)).body.columns[0].title, "Рабочие задачи");
    assert.notEqual((await request("GET")).body.columns[0].title, "Рабочие задачи");
    assert.equal((await request("PATCH", `/${namedTask.id}${scoped}`, { title: "Сохранено" })).body.task.title, "Сохранено");
    assert.equal((await request("DELETE", `/${namedTask.id}${scoped}`)).status, 200);

    if (process.env.PLANNING_TEST_UI === "1") {
      const { runPlanningVisualChecks } = await import("../scripts/planning-visual-checks.mjs");
      browser = await runPlanningVisualChecks({ origin, token: tokens[0] });
    }
    if (process.env.PLANNING_TEST_RESPONSIVE === "1") {
      await query(`INSERT INTO planning_tasks (id,user_id,title,description,status,due_on,column_id,completed,archived,start_time)
        SELECT $1 || n, $2, 'Задача ' || n || ' с длинным названием для проверки адаптива', repeat('Подробное описание задачи. ', 8),
          'todo', '2026-10-15'::date, CASE WHEN n > 30 THEN 'doing' ELSE 'todo' END, false, n > 45,
          CASE WHEN n BETWEEN 16 AND 30 THEN ('08:00'::time + ((n - 16) * interval '30 minutes')) ELSE NULL END
        FROM generate_series(1,50) n`, [randomUUID(), ownerId]);
      const { runPlanningResponsiveChecks } = await import("../scripts/planning-responsive-checks.mjs");
      await runPlanningResponsiveChecks({ origin, token: tokens[0] });
    }
    assert.equal((await request("DELETE", `/${id}`)).status, 200);
    assert.equal((await request("PATCH", `/${id}`, { status: "done" })).status, 404);
  } finally {
    await browser?.close();
    if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
    await query("ROLLBACK");
    client.release();
    await db.pool.end();
  }
});
