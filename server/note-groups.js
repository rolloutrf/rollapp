import { z } from "zod";

export const noteGroupsSchema = `
  CREATE TABLE IF NOT EXISTS planning_note_layouts (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    revision INTEGER NOT NULL CHECK (revision > 0),
    layout JSONB NOT NULL
  );
`;

export const verifyNoteGroupsSql = "SELECT user_id,revision,layout FROM planning_note_layouts LIMIT 0";

const id = z.string().uuid();
const group = z.object({
  id,
  title: z.string().trim().min(1).max(60),
  noteIds: z.array(id).min(1),
}).strict();

export const noteLayoutInput = z.object({
  revision: z.number().int().min(0).max(2_147_483_646),
  groups: z.array(group),
  order: z.array(id),
}).strict().refine(({ groups, order }) => {
  const groupIds = new Set(groups.map(group => group.id));
  const members = groups.flatMap(group => group.noteIds);
  const ordered = new Set(order);
  return groupIds.size === groups.length
    && ordered.size === order.length
    && new Set(members).size === members.length
    && groups.every(group => ordered.has(group.id))
    && members.every(noteId => !ordered.has(noteId));
});

export async function loadNoteLibrary(query, userId) {
  const { rows: [row] } = await query(`
    SELECT COALESCE((
      SELECT json_agg(note ORDER BY "updatedAt" DESC, id DESC)
      FROM (SELECT id,title,created_at AS "createdAt",updated_at AS "updatedAt"
        FROM planning_notes WHERE user_id=$1) note
    ), '[]') AS notes, COALESCE(saved.revision,0) AS revision, saved.layout
    FROM (SELECT $1::text AS user_id) owner
    LEFT JOIN planning_note_layouts saved USING (user_id)
  `, [userId]);
  const noteIds = new Set(row.notes.map(note => note.id));
  const groups = (row.layout?.groups || []).flatMap(group => {
    const members = group.noteIds.filter(id => noteIds.has(id));
    return members.length ? [{ ...group, noteIds: members }] : [];
  });
  const groupIds = new Set(groups.map(group => group.id));
  const order = (row.layout?.order || []).filter(id => groupIds.has(id) || noteIds.has(id));
  return { notes: row.notes, layout: { revision: row.revision, groups, order } };
}

export async function saveNoteLayout(query, userId, { revision, groups, order }) {
  const groupIds = new Set(groups.map(group => group.id));
  const { rows } = await query(`
    WITH valid AS (
      SELECT NOT EXISTS (
        SELECT id FROM unnest($4::text[]) AS members(id)
        EXCEPT SELECT id FROM planning_notes WHERE user_id=$1
      ) AND NOT EXISTS (
        SELECT 1 FROM planning_notes WHERE user_id=$1 AND id=ANY($5::text[])
      ) AS ok
    ), saved AS (
      INSERT INTO planning_note_layouts (user_id,revision,layout)
      SELECT $1,1,$3::jsonb FROM valid WHERE ok AND $2::integer=0
      ON CONFLICT (user_id) DO NOTHING
      RETURNING revision
    ), updated AS (
      UPDATE planning_note_layouts SET revision=revision+1,layout=$3::jsonb
      WHERE user_id=$1 AND revision=$2 AND (SELECT ok FROM valid)
      RETURNING revision
    )
    SELECT (SELECT ok FROM valid) AS valid,
      COALESCE((SELECT revision FROM saved), (SELECT revision FROM updated)) AS revision
  `, [userId, revision, JSON.stringify({ groups, order }),
    [...groups.flatMap(group => group.noteIds), ...order.filter(id => !groupIds.has(id))],
    [...groupIds]]);
  return rows[0];
}
