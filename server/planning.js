import { randomUUID } from "node:crypto";
import { z } from "zod";
import { defaultPlanningColumns, isPlanningDate, movePlanningTask, orderPlanningTasks, PLANNING_STATUSES } from "../shared/planning.js";
import { scheduleError, timeMinutes } from "../shared/planning-calendar.js";

export const planningSchema = `
  CREATE TABLE IF NOT EXISTS planning_tasks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'doing', 'done')),
    due_on DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_planning_tasks_user ON planning_tasks(user_id);
  ALTER TABLE planning_tasks ADD COLUMN IF NOT EXISTS column_id TEXT;
  ALTER TABLE planning_tasks ADD COLUMN IF NOT EXISTS completed BOOLEAN;
  ALTER TABLE planning_tasks ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE planning_tasks ADD COLUMN IF NOT EXISTS start_time TIME;
  ALTER TABLE planning_tasks ADD COLUMN IF NOT EXISTS duration_minutes INTEGER NOT NULL DEFAULT 60;
  ALTER TABLE planning_tasks ADD COLUMN IF NOT EXISTS space_id TEXT NOT NULL DEFAULT 'main';
  CREATE TABLE IF NOT EXISTS planning_spaces (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('kanban', 'calendar')),
    title TEXT NOT NULL,
    columns_json JSONB NOT NULL,
    task_order JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_planning_spaces_user ON planning_spaces(user_id);
  CREATE TABLE IF NOT EXISTS planning_boards (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    columns_json JSONB NOT NULL,
    task_order JSONB NOT NULL DEFAULT '[]',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`;
const taskFields = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000),
  status: z.enum(PLANNING_STATUSES.map(({ id }) => id)),
  dueOn: z.string().refine((value) => value === "" || isPlanningDate(value)),
  columnId: z.string().min(1).max(100),
  completed: z.boolean(),
  archived: z.boolean(),
  startTime: z.string().refine((value) => value === "" || timeMinutes(value) !== null),
  durationMinutes: z.number().int().min(15).max(1440),
});
export const planningTaskSchema = taskFields.omit({ archived: true }).extend({
  description: taskFields.shape.description.default(""),
  status: taskFields.shape.status.default("todo"),
  dueOn: taskFields.shape.dueOn.default(""),
  columnId: taskFields.shape.columnId.optional(),
  completed: taskFields.shape.completed.optional(),
  startTime: taskFields.shape.startTime.optional(),
  durationMinutes: taskFields.shape.durationMinutes.optional(),
});
export const planningPatchSchema = taskFields.partial().strict().refine((value) => Object.keys(value).length > 0);
const columnFields = z.object({ title: z.string().trim().min(1).max(100), complete: z.boolean(), collapsed: z.boolean() });
const moveSchema = z.object({ beforeId: z.string().min(1).max(100).nullable().default(null) });
const taskColumns = `id, title, description, status, to_char(due_on, 'YYYY-MM-DD') AS "dueOn",
  COALESCE(column_id,status) AS "columnId", COALESCE(completed,status='done') AS completed, archived,
  to_char(start_time, 'HH24:MI') AS "startTime", duration_minutes AS "durationMinutes"`;
const fail = (status, message) => Object.assign(new Error(message), { planningStatus: status });

export function registerPlanningRoutes(app, { requireAuth, query, transaction, asyncRoute }) {
  const readBoard = async (q, userId, spaceId = "main") => {
    if (typeof spaceId !== "string" || !spaceId || spaceId.length > 100) throw fail(400, "Некорректный вариант планирования");
    if (spaceId !== "main") {
      const result = await q("SELECT columns_json,task_order FROM planning_spaces WHERE id=$1 AND user_id=$2", [spaceId, userId]);
      if (!result.rowCount) throw fail(404, "Доска или календарь не найдены");
      return { spaceId, columns: result.rows[0].columns_json, order: result.rows[0].task_order };
    }
    const result = await q("SELECT columns_json,task_order FROM planning_boards WHERE user_id=$1", [userId]);
    return result.rowCount ? { spaceId, columns: result.rows[0].columns_json, order: result.rows[0].task_order } : { spaceId, columns: defaultPlanningColumns(), order: [] };
  };
  const writeBoard = (q, userId, board) => board.spaceId !== "main"
    ? q("UPDATE planning_spaces SET columns_json=$3,task_order=$4 WHERE id=$1 AND user_id=$2", [board.spaceId, userId, JSON.stringify(board.columns), JSON.stringify(board.order)])
    : q(`INSERT INTO planning_boards (user_id,columns_json,task_order) VALUES ($1,$2,$3)
    ON CONFLICT (user_id) DO UPDATE SET columns_json=EXCLUDED.columns_json,task_order=EXCLUDED.task_order,updated_at=CURRENT_TIMESTAMP`, [userId, JSON.stringify(board.columns), JSON.stringify(board.order)]);
  const readTasks = async (q, userId, board) => {
    const result = await q(`SELECT ${taskColumns} FROM planning_tasks WHERE user_id=$1 AND space_id=$2 ORDER BY created_at,id`, [userId, board.spaceId]);
    return orderPlanningTasks(result.rows, board.order);
  };
  const responseBoard = async (q, userId, board) => ({ columns: board.columns, tasks: await readTasks(q, userId, board) });
  const ownedColumn = (board, id) => {
    const column = board.columns.find((item) => item.id === id);
    if (!column) throw fail(404, "Список не найден. Обновите доску.");
    return column;
  };
  const columnStatus = (column) => column.complete ? "done" : column.id === "doing" ? "doing" : "todo";
  const mutate = (handler) => asyncRoute(async (req, res) => {
    try {
      const result = await transaction(async (client) => {
        const q = (sql, params) => client.query(sql, params);
        // Serialize changes to this user's board, including its initially implicit lists.
        await q("SELECT id FROM users WHERE id=$1 FOR UPDATE", [req.user.id]);
        return handler(req, q, await readBoard(q, req.user.id, req.query.space));
      });
      res.status(req.method === "POST" ? 201 : 200).json(result);
    } catch (error) {
      if (error.planningStatus) return res.status(error.planningStatus).json({ error: error.message });
      throw error;
    }
  });
  const spaceFields = z.object({ kind: z.enum(["kanban", "calendar"]), title: z.string().trim().min(1).max(100) });
  app.get("/api/planning/spaces", requireAuth, asyncRoute(async (req, res) => {
    const kind = spaceFields.shape.kind.parse(req.query.kind);
    const result = await query("SELECT id,kind,title FROM planning_spaces WHERE user_id=$1 AND kind=$2 ORDER BY created_at,id", [req.user.id, kind]);
    res.set("Cache-Control", "no-store").json({ spaces: [{ id: "main", kind, title: kind === "kanban" ? "Основная доска" : "Основной календарь" }, ...result.rows] });
  }));
  app.post("/api/planning/spaces", requireAuth, asyncRoute(async (req, res) => {
    const { kind, title } = spaceFields.parse(req.body);
    const result = await query("INSERT INTO planning_spaces (id,user_id,kind,title,columns_json) VALUES ($1,$2,$3,$4,$5) RETURNING id,kind,title", [randomUUID(), req.user.id, kind, title, JSON.stringify(defaultPlanningColumns())]);
    res.status(201).json({ space: result.rows[0] });
  }));
  app.get("/api/planning/tasks", requireAuth, asyncRoute(async (req, res) => {
    try {
      const board = await readBoard(query, req.user.id, req.query.space);
      res.set("Cache-Control", "no-store").json(await responseBoard(query, req.user.id, board));
    } catch (error) {
      if (error.planningStatus) return res.status(error.planningStatus).json({ error: error.message });
      throw error;
    }
  }));
  app.post("/api/planning/tasks", requireAuth, mutate(async (req, q, board) => {
    const task = planningTaskSchema.parse(req.body);
    const error = scheduleError(task);
    if (error) throw fail(400, error);
    const column = ownedColumn(board, task.columnId || task.status);
    const result = await q(`INSERT INTO planning_tasks (id,user_id,title,description,status,due_on,column_id,completed,start_time,duration_minutes,space_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING ${taskColumns}`,
    [randomUUID(), req.user.id, task.title, task.description, columnStatus(column), task.dueOn || null, column.id, task.completed ?? column.complete, task.startTime || null, task.durationMinutes ?? 60, board.spaceId]);
    return { task: result.rows[0] };
  }));
  app.patch("/api/planning/tasks/:id/move", requireAuth, mutate(async (req, q, board) => {
    const { columnId, beforeId } = moveSchema.extend({ columnId: taskFields.shape.columnId }).parse(req.body);
    const column = ownedColumn(board, columnId);
    const tasks = await readTasks(q, req.user.id, board);
    const task = tasks.find((item) => item.id === req.params.id && !item.archived);
    if (!task) throw fail(404, "Задача не найдена");
    if (beforeId === task.id) return responseBoard(q, req.user.id, board);
    if (beforeId && !tasks.some((item) => item.id === beforeId && item.columnId === columnId && !item.archived)) throw fail(409, "Положение карточки изменилось. Обновите доску.");
    if (task.columnId !== columnId) await q("UPDATE planning_tasks SET column_id=$3,status=$4,completed=$5,updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND user_id=$2", [task.id, req.user.id, columnId, columnStatus(column), column.complete]);
    board.order = movePlanningTask(tasks, task.id, columnId, beforeId).map((item) => item.id);
    await writeBoard(q, req.user.id, board);
    return responseBoard(q, req.user.id, board);
  }));
  app.patch("/api/planning/tasks/:id", requireAuth, mutate(async (req, q, board) => {
    const patch = planningPatchSchema.parse(req.body);
    const existing = await q(`SELECT ${taskColumns} FROM planning_tasks WHERE id=$1 AND user_id=$2 AND space_id=$3`, [req.params.id, req.user.id, board.spaceId]);
    if (!existing.rowCount) throw fail(404, "Задача не найдена");
    if (["dueOn", "startTime", "durationMinutes"].some((key) => key in patch)) {
      const error = scheduleError({ ...existing.rows[0], ...patch });
      if (error) throw fail(400, error);
    }
    if (patch.columnId || patch.status) {
      const column = ownedColumn(board, patch.columnId || patch.status);
      patch.columnId = column.id;
      patch.status = columnStatus(column);
      if (patch.completed === undefined) patch.completed = column.complete;
    }
    const fields = { title: "title", description: "description", status: "status", dueOn: "due_on", columnId: "column_id", completed: "completed", archived: "archived", startTime: "start_time", durationMinutes: "duration_minutes" };
    const entries = Object.entries(patch);
    const result = await q(`UPDATE planning_tasks SET ${entries.map(([key], index) => `${fields[key]}=$${index + 3}`).join(",")}, updated_at=CURRENT_TIMESTAMP
      WHERE id=$1 AND user_id=$2 RETURNING ${taskColumns}`,
    [req.params.id, req.user.id, ...entries.map(([key, value]) => ["dueOn", "startTime"].includes(key) ? value || null : value)]);
    if (!result.rowCount) throw fail(404, "Задача не найдена");
    return { task: result.rows[0] };
  }));
  app.delete("/api/planning/tasks/:id", requireAuth, mutate(async (req, q, board) => {
    const result = await q("DELETE FROM planning_tasks WHERE id=$1 AND user_id=$2 AND space_id=$3 RETURNING id", [req.params.id, req.user.id, board.spaceId]);
    if (!result.rowCount) throw fail(404, "Задача не найдена");
    board.order = board.order.filter((id) => id !== req.params.id);
    await writeBoard(q, req.user.id, board);
    return { ok: true };
  }));
  app.post("/api/planning/columns", requireAuth, mutate(async (req, q, board) => {
    const fields = columnFields.extend({ complete: z.boolean().default(false), collapsed: z.boolean().default(false) }).parse(req.body);
    if (board.columns.length >= 50) throw fail(400, "На доске может быть до 50 списков");
    board.columns.push({ id: randomUUID(), ...fields });
    await writeBoard(q, req.user.id, board);
    return { columns: board.columns };
  }));
  app.patch("/api/planning/columns/:id/move", requireAuth, mutate(async (req, q, board) => {
    const { beforeId } = moveSchema.parse(req.body);
    const column = ownedColumn(board, req.params.id);
    if (beforeId) ownedColumn(board, beforeId);
    if (beforeId !== column.id) {
      board.columns = board.columns.filter((item) => item.id !== column.id);
      const index = beforeId ? board.columns.findIndex((item) => item.id === beforeId) : board.columns.length;
      board.columns.splice(index, 0, column);
      await writeBoard(q, req.user.id, board);
    }
    return { columns: board.columns };
  }));
  app.patch("/api/planning/columns/:id", requireAuth, mutate(async (req, q, board) => {
    const patch = columnFields.partial().strict().refine((value) => Object.keys(value).length > 0).parse(req.body);
    Object.assign(ownedColumn(board, req.params.id), patch);
    await writeBoard(q, req.user.id, board);
    return { columns: board.columns };
  }));
  app.delete("/api/planning/columns/:id", requireAuth, mutate(async (req, q, board) => {
    ownedColumn(board, req.params.id);
    if (board.columns.length === 1) throw fail(409, "Оставьте хотя бы один список");
    const occupied = await q("SELECT id FROM planning_tasks WHERE user_id=$1 AND COALESCE(column_id,status)=$2 AND space_id=$3 LIMIT 1", [req.user.id, req.params.id, board.spaceId]);
    if (occupied.rowCount) throw fail(409, "Сначала переместите карточки из списка, включая архивные");
    board.columns = board.columns.filter((item) => item.id !== req.params.id);
    await writeBoard(q, req.user.id, board);
    return { columns: board.columns };
  }));
}
