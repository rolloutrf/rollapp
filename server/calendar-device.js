import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { isPlanningDate } from "../shared/planning.js";
import { userCredentialsConfigured } from "./user-credentials.js";

const digest = value => createHash("sha256").update(value).digest("hex");
const prefix = space => `calendar-device:v1:${digest(space)}:`;
const eventPrefix = (owner, space) => `apple-device:${digest(`${owner}:${space}`).slice(0, 32)}:`;
const dateSchema = z.string().refine(isPlanningDate);
const spaceSchema = z.string().min(1).max(100);
const error = (status, message) => Object.assign(new Error(message), { status });
const stateValue = row => { try { return JSON.parse(Buffer.from(row.token_hash.split(":")[4], "base64url").toString()); } catch { throw error(503, "Не удалось прочитать подключение устройства"); } };
const recordKey = (space, nonce, state = {}) => `${prefix(space)}${nonce}:${Buffer.from(JSON.stringify(state)).toString("base64url")}`;
const signature = (payload, env) => {
  if (!userCredentialsConfigured(env)) throw error(503, "Подключение календаря устройства пока не настроено на сервере");
  return createHmac("sha256", env.USER_CREDENTIALS_SECRET).update(`rollapp:calendar-device:v1\0${payload}`).digest("base64url");
};
export function calendarDeviceToken(owner, space, nonce, env = process.env) {
  const payload = Buffer.from(JSON.stringify({ owner, space, nonce })).toString("base64url");
  return `${payload}.${signature(payload, env)}`;
}
export function readCalendarDeviceToken(value, env = process.env) {
  if (typeof value !== "string" || value.length > 1500) return null;
  const [payload, sig, extra] = value.split(".");
  if (extra || !/^[\w-]+$/.test(payload || "") || !/^[\w-]{43}$/.test(sig || "")) return null;
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(signature(payload, env)))) return null;
  try { return z.object({ owner: spaceSchema, space: spaceSchema, nonce: z.string().regex(/^[a-f0-9]{64}$/) }).strict().parse(JSON.parse(Buffer.from(payload, "base64url").toString())); } catch { return null; }
}

export const calendarDeviceSnapshotSchema = z.object({
  deviceId: z.string().uuid(), deviceName: z.string().trim().min(1).max(100),
  from: dateSchema, to: dateSchema,
  timeZone: z.string().max(100).refine(value => { try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; } }),
  events: z.array(z.object({ id: z.string().min(1).max(1000), title: z.string().max(200), description: z.string().max(5000),
    start: z.string().datetime({ offset: true }), end: z.string().datetime({ offset: true }), allDay: z.boolean(), calendar: z.string().max(200),
  }).strict().refine(event => Date.parse(event.end) > Date.parse(event.start), "Окончание события должно быть позже начала")).max(5000),
}).strict().refine(value => value.from <= value.to && Date.parse(value.to) - Date.parse(value.from) <= 400 * 86400000, "Период синхронизации ограничен 401 днём")
  .refine(value => new Set(value.events.map(event => event.id)).size === value.events.length, "Повторяются идентификаторы событий");

export function calendarDeviceTasks(owner, space, snapshot) {
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: snapshot.timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const local = stamp => {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(stamp)).map(part => [part.type, part.value]));
    return { date: `${parts.year}-${parts.month}-${parts.day}`, minute: Number(parts.hour) * 60 + Number(parts.minute) };
  };
  const next = date => new Date(Date.parse(`${date}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  const result = [];
  for (const event of snapshot.events) {
    const start = local(event.start), end = local(event.end);
    if (end.date < start.date) throw error(400, "Не удалось представить событие в часовом поясе устройства");
    if (start.date === end.date && end.minute <= start.minute) throw error(400, "В календаре есть событие короче минуты или с повторяющимся часом при смене часового пояса. Этот снимок не применён; прежние события сохранены.");
    const last = end.minute === 0 ? new Date(Date.parse(`${end.date}T00:00:00Z`) - 86400000).toISOString().slice(0, 10) : end.date;
    let date = start.date < snapshot.from ? snapshot.from : start.date;
    for (; date <= last && date <= snapshot.to; date = next(date)) {
      const from = event.allDay || date !== start.date ? 0 : start.minute;
      const to = event.allDay || date !== end.date ? 1440 : end.minute;
      if (to <= from) continue;
      result.push({ id: `${eventPrefix(owner, space)}${digest(event.id).slice(0, 32)}:${date}`, title: event.title.trim() || "Без названия",
        description: [event.description, event.calendar ? `Календарь устройства: ${event.calendar}` : ""].filter(Boolean).join("\n\n").slice(0, 5000), dueOn: date,
        startTime: `${String(Math.floor(from / 60)).padStart(2, "0")}:${String(from % 60).padStart(2, "0")}`, durationMinutes: to - from });
      if (result.length > 12000) throw error(400, "Слишком много событий в выбранном периоде. Выберите меньше календарей.");
    }
  }
  return result;
}

export function registerCalendarDeviceRoutes(app, { requireAuth, query, transaction, asyncRoute, env = process.env }) {
  const route = handler => asyncRoute(async (req, res) => {
    res.set({ "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" });
    try { await handler(req, res); } catch (cause) { if (cause.status) return res.status(cause.status).json({ error: cause.message }); throw cause; }
  });
  const ownedSpace = async (q, owner, space) => {
    if (space === "main") return "Основной календарь";
    const found = await q("SELECT title FROM planning_spaces WHERE id=$1 AND user_id=$2 AND kind='calendar'", [space, owner]);
    if (!found.rowCount) throw error(404, "Календарь не найден");
    return found.rows[0].title;
  };
  const find = async (q, owner, space, nonce = "") => (await q("SELECT token_hash FROM sessions WHERE user_id=$1 AND token_hash LIKE $2 AND expires_at>CURRENT_TIMESTAMP ORDER BY created_at DESC LIMIT 1", [owner, `${prefix(space)}${nonce ? `${nonce}:` : ""}%`])).rows[0];
  const response = (row, owner, space, title) => row ? { connected: true, title, ...stateValue(row), token: calendarDeviceToken(owner, space, row.token_hash.split(":")[3], env) } : { connected: false, title };
  app.get("/api/planning/calendar-device", requireAuth, route(async (req, res) => {
    signature("", env);
    const space = spaceSchema.parse(req.query.space || "main"), title = await ownedSpace(query, req.user.id, space);
    res.json(response(await find(query, req.user.id, space), req.user.id, space, title));
  }));
  app.post("/api/planning/calendar-device", requireAuth, route(async (req, res) => {
    signature("", env);
    const space = spaceSchema.parse(req.query.space || "main");
    res.json(await transaction(async client => {
      const q = (sql, values) => client.query(sql, values);
      await q("SELECT id FROM users WHERE id=$1 FOR UPDATE", [req.user.id]);
      const title = await ownedSpace(q, req.user.id, space), previous = await find(q, req.user.id, space);
      if (previous) return response(previous, req.user.id, space, title);
      const token_hash = recordKey(space, randomBytes(32).toString("hex"));
      // Scoped device capability, incompatible with SHA-256 browser session keys.
      await q("INSERT INTO sessions (token_hash,user_id,expires_at) VALUES ($1,$2,$3)", [token_hash, req.user.id, "9999-12-31T00:00:00Z"]);
      return response({ token_hash }, req.user.id, space, title);
    }));
  }));
  app.delete("/api/planning/calendar-device", requireAuth, route(async (req, res) => {
    const space = spaceSchema.parse(req.query.space || "main");
    await transaction(async client => {
      await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [req.user.id]);
      await client.query("DELETE FROM sessions WHERE user_id=$1 AND token_hash LIKE $2", [req.user.id, `${prefix(space)}%`]);
      await client.query("UPDATE planning_tasks SET archived=TRUE,updated_at=CURRENT_TIMESTAMP WHERE user_id=$1 AND space_id=$2 AND id LIKE $3 AND archived=FALSE", [req.user.id, space, `${eventPrefix(req.user.id, space)}%`]);
    });
    res.json({ connected: false });
  }));
  app.get("/api/planning/calendar-device/events", requireAuth, route(async (req, res) => {
    const space = spaceSchema.parse(req.query.space || "main"); await ownedSpace(query, req.user.id, space);
    const found = await query(`SELECT id,title,description,to_char(due_on,'YYYY-MM-DD') AS "dueOn",to_char(start_time,'HH24:MI') AS "startTime",duration_minutes AS "durationMinutes"
      FROM planning_tasks WHERE user_id=$1 AND space_id=$2 AND id LIKE $3 AND archived=FALSE ORDER BY due_on,start_time,id`, [req.user.id, space, `${eventPrefix(req.user.id, space)}%`]);
    res.json({ events: found.rows.map(event => ({ ...event, external: "apple-device", completed: false, columnId: "" })) });
  }));
  app.post("/api/calendar-device/snapshot", route(async (req, res) => {
    const token = readCalendarDeviceToken(req.get("authorization")?.replace(/^Bearer /, ""), env);
    if (!token) return res.status(401).json({ error: "Подключите устройство заново в Rollapp" });
    const snapshot = calendarDeviceSnapshotSchema.parse(req.body), tasks = calendarDeviceTasks(token.owner, token.space, snapshot);
    const result = await transaction(async client => {
      const q = (sql, values) => client.query(sql, values);
      await q("SELECT id FROM users WHERE id=$1 FOR UPDATE", [token.owner]);
      const row = await find(q, token.owner, token.space, token.nonce);
      if (!row) throw error(401, "Подключение отозвано. Подключите устройство заново в Rollapp");
      await ownedSpace(q, token.owner, token.space);
      const state = stateValue(row);
      if (state.deviceId && state.deviceId !== snapshot.deviceId) throw error(409, "Календарь уже связан с другим устройством. Сначала отключите его в Rollapp.");
      await q(`UPDATE planning_tasks SET archived=TRUE,updated_at=CURRENT_TIMESTAMP WHERE user_id=$1 AND space_id=$2 AND id LIKE $3 AND due_on BETWEEN $4::date AND $5::date AND archived=FALSE AND NOT(id=ANY($6::text[]))`, [token.owner, token.space, `${eventPrefix(token.owner, token.space)}%`, snapshot.from, snapshot.to, tasks.map(task => task.id)]);
      if (tasks.length) await q(`INSERT INTO planning_tasks (id,user_id,space_id,title,description,due_on,start_time,duration_minutes,column_id,completed,archived)
        SELECT t.id,$1,$2,t.title,t.description,t."dueOn"::date,t."startTime"::time,t."durationMinutes",'todo',FALSE,FALSE
        FROM jsonb_to_recordset($3::jsonb) AS t(id text,title text,description text,"dueOn" text,"startTime" text,"durationMinutes" integer)
        ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description,due_on=EXCLUDED.due_on,start_time=EXCLUDED.start_time,duration_minutes=EXCLUDED.duration_minutes,archived=FALSE,updated_at=CURRENT_TIMESTAMP
        WHERE planning_tasks.user_id=$1 AND planning_tasks.space_id=$2`, [token.owner, token.space, JSON.stringify(tasks)]);
      const updated = { deviceId: snapshot.deviceId, deviceName: snapshot.deviceName, lastSyncedAt: new Date().toISOString(), eventCount: snapshot.events.length };
      await q("UPDATE sessions SET token_hash=$2 WHERE token_hash=$1 AND user_id=$3", [row.token_hash, recordKey(token.space, token.nonce, updated), token.owner]);
      return updated;
    });
    res.json({ ok: true, ...result });
  }));
  app.get("/api/planning/calendar-device/macos", requireAuth, route(async (_req, res) => {
    const file = env.ROLLAPP_CALENDAR_MACOS_ARCHIVE || fileURLToPath(new URL("../native/apple-calendar/build/RollappCalendar-macOS.zip", import.meta.url));
    if (!existsSync(file)) return res.status(503).json({ error: "Приложение для macOS ещё не собрано. См. native/apple-calendar/README.md" });
    // The trusted build path can live under .codex/worktrees on this Mac.
    // No request path or filename is used to select a download.
    res.download(path.resolve(file), "RollappCalendar-macOS.zip", { dotfiles: "allow" });
  }));
}
