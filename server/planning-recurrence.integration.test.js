import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { registerPlanningRoutes } from "./planning.js";
import { expandRecurringTasks } from "../shared/planning-recurrence.js";

test("recurrence API persists in configured production PostgreSQL; every fixture rolls back", { skip: process.env.ROLLAPP_TEST_PLANNING !== "1" }, async () => {
  const { productionRollsDatabase } = await import("../scripts/rolls-database.mjs");
  const db = await productionRollsDatabase();
  const client = await db.pool.connect();
  const userId = randomUUID();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='10s'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout='60s'");
    // Verification must never initialize/migrate production or acquire the
    // exclusive table locks from planningSchema's DROP/ADD CONSTRAINT.
    const schema = await client.query(`SELECT column_name FROM information_schema.columns
      WHERE table_schema=current_schema() AND table_name='planning_tasks'`);
    const columns = new Set(schema.rows.map(({ column_name }) => column_name));
    for (const column of ["recurrence", "recurrence_completed_dates", "space_id", "duration_minutes"]) {
      assert(columns.has(column), `Configured production schema is missing planning_tasks.${column}`);
    }
    await client.query("INSERT INTO users (id,email,username,name,password_hash) VALUES ($1,$2,$3,'Planning test','unusable')", [userId, `${userId}@planning-test.invalid`, `planning-${userId}`]);
    const routes = new Map();
    const app = Object.fromEntries(["get", "post", "patch", "delete"].map((method) => [method, (path, ...handlers) => routes.set(`${method} ${path}`, handlers.at(-1))]));
    registerPlanningRoutes(app, {
      requireAuth: () => {}, asyncRoute: (handler) => handler,
      query: (...args) => client.query(...args),
      transaction: async (callback) => {
        await client.query("SAVEPOINT planning_request");
        try { const result = await callback(client); await client.query("RELEASE SAVEPOINT planning_request"); return result; }
        catch (error) { await client.query("ROLLBACK TO SAVEPOINT planning_request"); await client.query("RELEASE SAVEPOINT planning_request"); throw error; }
      },
    });
    const request = async (method, path, body = {}, id, user = userId, query = {}) => {
      let status = 200, result;
      const res = { status(value) { status = value; return this; }, set() { return this; }, json(value) { result = value; return this; } };
      await routes.get(`${method} /api/planning/${path}`)({ method: method.toUpperCase(), user: { id: user }, query, params: { id }, body }, res);
      return { status, ...result };
    };
    const input = { title: "Повторение", dueOn: "2026-10-07", startTime: "08:15", durationMinutes: 60, recurrence: { frequency: "daily", until: "2026-10-09" } };
    assert.equal((await request("post", "tasks", { ...input, dueOn: "" })).status, 400);
    const created = await request("post", "tasks", input);
    assert.equal(created.status, 201);
    const id = created.task.id;
    const patch = (body) => request("patch", "tasks/:id", body, id);
    const read = async () => (await request("get", "tasks")).tasks.find((task) => task.id === id);
    assert.deepEqual((await read()).recurrence, input.recurrence);
    assert.equal((await read()).startTime, "08:15");
    assert.equal((await request("patch", "tasks/:id", { title: "unauthorized" }, id, randomUUID())).status, 404);
    assert.equal((await request("patch", "tasks/:id", { title: "wrong space" }, id, userId, { space: randomUUID() })).status, 404);
    assert.equal((await patch({ recurrence: { frequency: "daily", until: "2026-10-06" } })).status, 400);
    assert.equal((await patch({ dueOn: "" })).status, 400);
    assert.equal((await patch({ occurrenceDate: "2026-10-10", completed: true })).status, 400);
    await patch({ occurrenceDate: "2026-10-08", completed: true });
    await patch({ occurrenceDate: "2026-10-08", completed: true });
    let saved = await read();
    assert.deepEqual(saved.recurrenceCompletedDates, ["2026-10-08"]);
    assert.deepEqual(expandRecurringTasks([saved], "2026-10-07", "2026-10-09").map(({ completed }) => completed), [false, true, false]);
    await patch({ occurrenceDate: "2026-10-08", completed: false });
    assert.deepEqual((await read()).recurrenceCompletedDates, []);
    await patch({ title: "Обновлённая серия", recurrence: { frequency: "weekly", until: "" } });
    saved = await read();
    assert.deepEqual(expandRecurringTasks([saved], "2026-10-07", "2026-10-21").map(({ dueOn }) => dueOn), ["2026-10-07", "2026-10-14", "2026-10-21"]);
    await patch({ recurrence: null });
    assert.equal((await read()).recurrence, null);
    assert.equal((await patch({ occurrenceDate: "2026-10-07", completed: true })).status, 400);
    await patch({ recurrence: input.recurrence });
    assert.equal((await request("delete", "tasks/:id", {}, id)).status, 200);
    assert.equal(await read(), undefined);
  } finally {
    await client.query("ROLLBACK");
    client.release();
    try { assert.equal((await db.query("SELECT id FROM users WHERE id=$1", [userId])).rowCount, 0); }
    finally { await db.pool.end(); }
  }
});
