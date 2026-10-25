import { randomUUID } from "node:crypto";
import { z } from "zod";

// Applied separately from ordinary startup/releases; verify mode never runs DDL.
export const notesSchema = `
  CREATE TABLE IF NOT EXISTS planning_notes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'Без названия',
    content TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_planning_notes_user ON planning_notes(user_id, created_at, id);
`;

export const noteInputSchema = z.object({
  title: z.string().trim().max(200).transform(value => value || "Без названия"),
  content: z.string().max(200_000),
}).strict();
const fields = 'id,title,content,created_at AS "createdAt",updated_at AS "updatedAt"';

export function registerNotesRoutes(app, { requireAuth, query, asyncRoute }) {
  app.get("/api/planning/notes", requireAuth, asyncRoute(async (req, res) => {
    const result = await query('SELECT id,title,created_at AS "createdAt",updated_at AS "updatedAt" FROM planning_notes WHERE user_id=$1 ORDER BY created_at DESC,id DESC', [req.user.id]);
    res.set("Cache-Control", "private, no-store");
    res.json({ notes: result.rows });
  }));
  app.post("/api/planning/notes", requireAuth, asyncRoute(async (req, res) => {
    const parsed = noteInputSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Проверьте название и текст заметки (до 200 000 символов)." });
    const result = await query(`INSERT INTO planning_notes (id,user_id,title,content) VALUES ($1,$2,$3,$4) RETURNING ${fields}`, [randomUUID(), req.user.id, parsed.data.title, parsed.data.content]);
    res.set("Cache-Control", "private, no-store");
    res.status(201).json({ note: result.rows[0] });
  }));
  app.get("/api/planning/notes/:id", requireAuth, asyncRoute(async (req, res) => {
    const result = await query(`SELECT ${fields} FROM planning_notes WHERE id=$1 AND user_id=$2`, [req.params.id, req.user.id]);
    res.set("Cache-Control", "private, no-store");
    if (!result.rowCount) return res.status(404).json({ error: "Заметка не найдена." });
    res.json({ note: result.rows[0] });
  }));
  app.patch("/api/planning/notes/:id", requireAuth, asyncRoute(async (req, res) => {
    const parsed = noteInputSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Проверьте название и текст заметки (до 200 000 символов)." });
    const result = await query(`UPDATE planning_notes SET title=$3,content=$4,updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND user_id=$2 RETURNING ${fields}`, [req.params.id, req.user.id, parsed.data.title, parsed.data.content]);
    res.set("Cache-Control", "private, no-store");
    if (!result.rowCount) return res.status(404).json({ error: "Заметка не найдена." });
    res.json({ note: result.rows[0] });
  }));
  app.delete("/api/planning/notes/:id", requireAuth, asyncRoute(async (req, res) => {
    const result = await query("DELETE FROM planning_notes WHERE id=$1 AND user_id=$2 RETURNING id", [req.params.id, req.user.id]);
    if (!result.rowCount) return res.status(404).json({ error: "Заметка не найдена." });
    res.json({ ok: true });
  }));
}
