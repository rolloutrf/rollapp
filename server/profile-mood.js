import { z } from "zod";
import { moodAt } from "../shared/profile-mood.js";

const PAGE_SIZE = 20;
const maxCursor = 9223372036854775807n;
const cursorSchema = z.string().regex(/^[1-9]\d{0,18}$/)
  .refine((value) => /^\d{1,19}$/.test(value) && BigInt(value) <= maxCursor);

export const moodQuerySchema = z.strictObject({ before: cursorSchema.optional() });
export const moodSaveSchema = z.strictObject({
  published: z.boolean(),
  entry: z.strictObject({ requestId: z.uuid(), level: z.number().int().refine((level) => moodAt(level) !== null) }).optional(),
});

export function publicMood(row) {
  return row?.mood_public === true ? moodAt(row.mood_level)?.level ?? null : null;
}

export async function checkProfileMoodSchema(client) {
  await client.query("SELECT mood_level,mood_public FROM users LIMIT 0");
  await client.query("SELECT id,user_id,request_id,level,recorded_at FROM user_mood_entries LIMIT 0");
}

export async function verifyProfileMoodAvailability(transaction, { required, onMissing = () => {} }) {
  try {
    await transaction(async (client) => {
      await client.query("SET TRANSACTION READ ONLY");
      await checkProfileMoodSchema(client);
    });
    return true;
  } catch (error) {
    if (required || !["42P01", "42703"].includes(error.code)) throw error;
    onMissing();
    return false;
  }
}

async function readJournal(client, userId, before = null) {
  const { rows } = await client.query(
    `SELECT id::text AS id,level,recorded_at FROM user_mood_entries
     WHERE user_id=$1 AND ($2::bigint IS NULL OR id<$2::bigint)
     ORDER BY user_mood_entries.id DESC LIMIT $3`,
    [userId, before, PAGE_SIZE + 1],
  );
  const entries = rows.slice(0, PAGE_SIZE).map(({ id, level, recorded_at }) => ({ id, level, recordedAt: recorded_at }));
  return { entries, nextBefore: rows.length > PAGE_SIZE ? entries.at(-1).id : null };
}

function privateState(row) {
  return { level: row.mood_level, published: row.mood_public, publicMood: publicMood(row) };
}

export async function readProfileMood(client, userId, before) {
  const { rows: [user] } = await client.query("SELECT mood_level,mood_public FROM users WHERE id=$1", [userId]);
  if (!user) return null;
  return { ...privateState(user), ...await readJournal(client, userId, before) };
}

// Lock the owner first: simultaneous saves must publish the same level as the
// latest journal entry. A replay may read the current state but cannot change it.
export async function saveProfileMood(client, userId, { published, entry }) {
  const { rows: [current] } = await client.query("SELECT mood_level,mood_public FROM users WHERE id=$1 FOR UPDATE", [userId]);
  if (!current) return { status: 404, error: "Профиль не найден" };
  const level = entry?.level ?? current.mood_level;
  if (published && level == null) return { status: 400, error: "Сначала отметьте настроение" };
  if (entry) {
    const { rows: [existing] } = await client.query(
      "SELECT level FROM user_mood_entries WHERE user_id=$1 AND request_id=$2", [userId, entry.requestId],
    );
    if (existing) {
      if (existing.level !== entry.level) return { status: 409, error: "У этой записи уже есть другая отметка" };
      return { ...privateState(current), ...await readJournal(client, userId) };
    }
    await client.query(
      `INSERT INTO user_mood_entries (user_id,id,request_id,level)
       VALUES ($1,COALESCE((SELECT id FROM user_mood_entries WHERE user_id=$1 ORDER BY id DESC LIMIT 1),0)+1,$2,$3)`,
      [userId, entry.requestId, level],
    );
  }
  const { rows: [updated] } = await client.query(
    "UPDATE users SET mood_level=$2,mood_public=$3 WHERE id=$1 RETURNING mood_level,mood_public",
    [userId, level, published],
  );
  return { ...privateState(updated), ...await readJournal(client, userId) };
}

export function registerProfileMoodRoutes(app, { requireAuth, asyncRoute, transaction, available }) {
  const privateResponse = (res) => { res.set("Cache-Control", "private, no-store"); res.vary("Cookie"); };
  const requireMood = (_req, res, next) => {
    privateResponse(res);
    if (!available()) return res.status(503).json({ error: "Журнал настроения пока недоступен: схема базы данных не установлена." });
    next();
  };
  app.get("/api/me/mood", requireAuth, requireMood, asyncRoute(async (req, res) => {
    const parsed = moodQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "Не удалось открыть эту страницу журнала" });
    const mood = await transaction(async (client) => {
      await client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
      return readProfileMood(client, req.user.id, parsed.data.before);
    });
    if (!mood) return res.status(404).json({ error: "Профиль не найден" });
    return res.json(mood);
  }));
  app.patch("/api/me/mood", requireAuth, requireMood, asyncRoute(async (req, res) => {
    const parsed = moodSaveSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Проверьте отметку и настройку видимости" });
    const mood = await transaction((client) => saveProfileMood(client, req.user.id, parsed.data));
    if (mood.status) return res.status(mood.status).json({ error: mood.error });
    return res.json(mood);
  }));
}
