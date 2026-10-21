import { randomUUID } from "node:crypto";
import { trackerSchemas } from "../shared/health-trackers.js";

const mapEntry = row => ({ ...JSON.parse(row.data_json), id: row.id, updatedAt: row.updated_at });
export function registerHealthTrackerRoutes(app, { query, requireAuth, requireSphereReadAccess, requirePrivateSphereOwner, asyncRoute }) {
  const root = "/api/health/trackers/:tracker";
  const validateTracker = (req, res, next) => Object.hasOwn(trackerSchemas, req.params.tracker) ? next() : res.status(404).json({ error: "Трекер не найден" });
  const handle = callback => asyncRoute(async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    try { return await callback(req, res); }
    catch (error) {
      if (error.code === "42P01") return res.status(503).json({ error: "Хранилище трекеров ещё не подключено. Требуется отдельная установка схемы в production PostgreSQL.", code: "HEALTH_TRACKER_SCHEMA_REQUIRED" });
      throw error;
    }
  });
  app.get(root, requireAuth, validateTracker, requireSphereReadAccess("health", req => req.params.tracker), handle(async (req, res) => {
    const result = await query("SELECT id,data_json,updated_at FROM health_tracker_entries WHERE user_id=$1 AND tracker=$2 ORDER BY entry_on DESC,created_at DESC,id", [req.user.id, req.params.tracker]);
    return res.json({ entries: result.rows.map(mapEntry) });
  }));
  for (const method of ["post", "patch"]) app[method](method === "post" ? root : `${root}/:id`, requireAuth, validateTracker, requirePrivateSphereOwner, handle(async (req, res) => {
    const parsed = trackerSchemas[req.params.tracker].safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Проверьте поля записи" });
    const data = parsed.data;
    const result = method === "post"
      ? await query("INSERT INTO health_tracker_entries (id,user_id,tracker,entry_on,data_json) VALUES ($1,$2,$3,$4,$5) RETURNING id,data_json,updated_at", [randomUUID(), req.user.id, req.params.tracker, data.date, JSON.stringify(data)])
      : await query("UPDATE health_tracker_entries SET entry_on=$1,data_json=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$3 AND user_id=$4 AND tracker=$5 RETURNING id,data_json,updated_at", [data.date, JSON.stringify(data), req.params.id, req.user.id, req.params.tracker]);
    if (!result.rows.length) return res.status(404).json({ error: "Запись не найдена" });
    return res.status(method === "post" ? 201 : 200).json({ entry: mapEntry(result.rows[0]) });
  }));
  app.delete(`${root}/:id`, requireAuth, validateTracker, requirePrivateSphereOwner, handle(async (req, res) => {
    const result = await query("DELETE FROM health_tracker_entries WHERE id=$1 AND user_id=$2 AND tracker=$3 RETURNING id", [req.params.id, req.user.id, req.params.tracker]);
    if (!result.rows.length) return res.status(404).json({ error: "Запись не найдена" });
    return res.json({ ok: true });
  }));
}
