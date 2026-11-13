import { randomUUID } from "node:crypto";
import { z } from "zod";
import { findProfileByUsername } from "./profile-aliases.js";

export const profilePublicationsSchema = `
  CREATE TABLE IF NOT EXISTS profile_session_slots (
    id UUID PRIMARY KEY,
    owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL CHECK (ends_at > starts_at),
    title VARCHAR(160) NOT NULL
  );
  CREATE INDEX IF NOT EXISTS profile_session_slots_owner_start ON profile_session_slots(owner_id, starts_at);
  CREATE TABLE IF NOT EXISTS profile_session_bookings (
    id UUID PRIMARY KEY,
    slot_id UUID NOT NULL UNIQUE REFERENCES profile_session_slots(id) ON DELETE CASCADE,
    guest_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS profile_announcements (
    id UUID PRIMARY KEY,
    owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(160) NOT NULL,
    body VARCHAR(4000) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS profile_announcements_owner_created ON profile_announcements(owner_id, created_at DESC);
`;

const title = z.string().trim().min(1).max(160);
const id = z.uuid();
const slotInput = z.object({
  id, title, startsAt: z.iso.datetime(), duration: z.number().int().min(15).max(480),
}).strict();
const announcement = z.object({ title, body: z.string().trim().min(1).max(4000) }).strict();
const slotUnavailable = "Это время больше недоступно. Выберите другой слот.";
const maxPublications = 200;
const slotBatchInput = z.object({ slots: z.array(slotInput).min(1).max(maxPublications) }).strict();

class PublicationError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function publicSessionSlot(row, { viewerId, isOwner }) {
  const bookedByMe = Boolean(viewerId && row.guest_id === viewerId);
  if (row.booking_id && !bookedByMe && !isOwner) return null;
  return {
    id: row.id,
    title: row.title,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    bookingId: row.booking_id,
    bookedByMe,
    ...(isOwner && row.booking_id ? { guestName: row.guest_name } : {}),
  };
}

export function registerProfilePublicationRoutes(app, { requireAuth, query, transaction, asyncRoute }) {
  const section = "/api/profile/:username";
  const calendar = `${section}/calendar`;
  const board = `${section}/announcements`;
  const route = (handler, { ownerOnly = false } = {}) => asyncRoute(async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    res.vary("Cookie");
    try {
      const { rows: [owner] } = await findProfileByUsername({ query }, req.params.username);
      if (!owner) throw new PublicationError(404, "Профиль не найден");
      const viewerId = req.user?.id;
      const isOwner = viewerId === owner.id;
      if (ownerOnly && !isOwner) throw new PublicationError(403, "Изменять раздел может только владелец профиля");
      await handler(req, res, { owner, viewerId, isOwner });
    } catch (error) {
      if (error instanceof PublicationError) return res.status(error.status).json({ error: error.message });
      if (error.code === "42P01") return res.status(503).json({ error: "Раздел пока недоступен" });
      throw error;
    }
  });

  const lockOwner = (client, ownerId) => client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [ownerId]);
  const lockSlot = async (client, ownerId, slotId) => {
    const { rowCount } = await client.query(
      "SELECT id FROM profile_session_slots WHERE owner_id=$1 AND id=$2 AND starts_at>clock_timestamp() FOR UPDATE",
      [ownerId, slotId],
    );
    if (!rowCount) throw new PublicationError(409, slotUnavailable);
  };

  app.get(calendar, route(async (_req, res, access) => {
    const { owner, viewerId, isOwner } = access;
    const { rows } = await query(
      `SELECT s.id,s.title,s.starts_at,s.ends_at,b.id AS booking_id,b.guest_id,
              CASE WHEN $3 THEN u.name END AS guest_name
       FROM profile_session_slots s
       LEFT JOIN profile_session_bookings b ON b.slot_id=s.id
       LEFT JOIN users u ON u.id=b.guest_id
       WHERE s.owner_id=$1 AND s.starts_at>clock_timestamp()
         AND (b.id IS NULL OR b.guest_id=$2 OR $3)
       ORDER BY s.starts_at,s.id`,
      [owner.id, viewerId ?? null, isOwner],
    );
    res.json({ profile: { name: owner.name, username: owner.username }, isOwner, slots: rows.map(row => publicSessionSlot(row, access)).filter(Boolean) });
  }));

  app.post(calendar, requireAuth, route(async (req, res, { owner }) => {
    const batch = Object.hasOwn(req.body ?? {}, "slots");
    const slots = batch ? slotBatchInput.parse(req.body).slots : [slotInput.parse(req.body)];
    if (new Set(slots.map(slot => slot.id)).size !== slots.length) {
      throw new PublicationError(400, "Каждый слот должен иметь свой идентификатор");
    }
    const proposed = slots.map(slot => ({
      ...slot,
      start: Date.parse(slot.startsAt),
      end: Date.parse(slot.startsAt) + slot.duration * 60_000,
    }));
    await transaction(async client => {
      await lockOwner(client, owner.id);
      const { rows: existing } = await client.query(
        `SELECT id,title,starts_at,ends_at,starts_at>clock_timestamp() AS upcoming
         FROM profile_session_slots
         WHERE owner_id=$1 AND (id=ANY($2::uuid[]) OR ends_at>clock_timestamp())`,
        [owner.id, slots.map(slot => slot.id)],
      );
      const byId = new Map(existing.map(row => [row.id, row]));
      const additions = proposed.filter(slot => {
        const saved = byId.get(slot.id);
        if (!saved) return true;
        if (saved.title !== slot.title || +saved.starts_at !== slot.start || +saved.ends_at !== slot.end) {
          throw new PublicationError(409, "Обновите форму и повторите публикацию");
        }
        return false;
      });
      if (!additions.length) return;
      const { rows: [{ now }] } = await client.query("SELECT clock_timestamp() AS now");
      if (additions.some(slot => slot.start <= +now || slot.start >= +now + 365 * 86_400_000)) {
        throw new PublicationError(400, "Выберите время в пределах ближайших 365 дней");
      }
      if (existing.filter(row => row.upcoming).length + additions.length > maxPublications) {
        throw new PublicationError(409, "В календаре может быть до 200 предстоящих слотов");
      }
      const ordered = additions.toSorted((a, b) => a.start - b.start);
      if (ordered.some((slot, index) => (index > 0 && ordered[index - 1].end > slot.start)
        || existing.some(row => +row.starts_at < slot.end && +row.ends_at > slot.start))) {
        throw new PublicationError(409, "Это время пересекается с другим слотом");
      }
      const inserted = await client.query(
        `INSERT INTO profile_session_slots (id,owner_id,starts_at,ends_at,title)
         SELECT id,$1,starts_at,ends_at,title
         FROM unnest($2::uuid[],$3::timestamptz[],$4::timestamptz[],$5::text[]) AS slots(id,starts_at,ends_at,title)
         ON CONFLICT DO NOTHING`,
        [owner.id, additions.map(slot => slot.id), additions.map(slot => new Date(slot.start)),
          additions.map(slot => new Date(slot.end)), additions.map(slot => slot.title)],
      );
      if (inserted.rowCount !== additions.length) throw new PublicationError(409, "Обновите форму и повторите публикацию");
    });
    res.status(201).json(batch ? { ids: slots.map(slot => slot.id) } : { id: slots[0].id });
  }, { ownerOnly: true }));

  app.post(`${calendar}/:slotId/book`, requireAuth, route(async (req, res, { owner, viewerId, isOwner }) => {
    if (isOwner) throw new PublicationError(403, "На свой слот записаться нельзя");
    const slotId = id.parse(req.params.slotId);
    const bookingId = await transaction(async client => {
      await lockSlot(client, owner.id, slotId);
      const { rows: [booking] } = await client.query(
        "SELECT id,guest_id FROM profile_session_bookings WHERE slot_id=$1", [slotId],
      );
      if (booking?.guest_id === viewerId) return booking.id;
      if (booking) throw new PublicationError(409, slotUnavailable);
      const key = randomUUID();
      const result = await client.query(
        `INSERT INTO profile_session_bookings (id,slot_id,guest_id)
         SELECT $1,id,$3 FROM profile_session_slots WHERE id=$2 AND starts_at>clock_timestamp()`,
        [key, slotId, viewerId],
      );
      if (!result.rowCount) throw new PublicationError(409, slotUnavailable);
      return key;
    });
    res.json({ bookingId });
  }));

  app.delete(`${calendar}/:slotId/bookings/:bookingId`, requireAuth, route(async (req, res, { owner, viewerId, isOwner }) => {
    const slotId = id.parse(req.params.slotId);
    const bookingId = id.parse(req.params.bookingId);
    await transaction(async client => {
      await lockSlot(client, owner.id, slotId);
      await client.query(
        "DELETE FROM profile_session_bookings WHERE id=$1 AND slot_id=$2 AND (guest_id=$3 OR $4)",
        [bookingId, slotId, viewerId, isOwner],
      );
    });
    res.json({ ok: true });
  }));

  app.delete(`${calendar}/:slotId`, requireAuth, route(async (req, res, { owner }) => {
    const slotId = id.parse(req.params.slotId);
    await transaction(async client => {
      await lockSlot(client, owner.id, slotId);
      const result = await client.query(
        `DELETE FROM profile_session_slots s WHERE s.id=$1
         AND NOT EXISTS (SELECT 1 FROM profile_session_bookings WHERE slot_id=s.id)`,
        [slotId],
      );
      if (!result.rowCount) throw new PublicationError(409, "На это время уже записались. Сначала отмените запись.");
    });
    res.json({ ok: true });
  }, { ownerOnly: true }));

  app.get(board, route(async (_req, res, { owner, isOwner }) => {
    const { rows } = await query(
      `SELECT id,title,body,created_at AS "createdAt" FROM profile_announcements
       WHERE owner_id=$1 ORDER BY created_at DESC,id`,
      [owner.id],
    );
    res.json({ profile: { name: owner.name, username: owner.username }, isOwner, announcements: rows });
  }));

  app.post(board, requireAuth, route(async (req, res, { owner }) => {
    const item = announcement.extend({ id }).parse(req.body);
    await transaction(async client => {
      await lockOwner(client, owner.id);
      const existing = await client.query(
        "SELECT 1 FROM profile_announcements WHERE id=$1 AND owner_id=$2 AND title=$3 AND body=$4",
        [item.id, owner.id, item.title, item.body],
      );
      if (existing.rowCount) return;
      const { rows: [{ count }] } = await client.query("SELECT COUNT(*) AS count FROM profile_announcements WHERE owner_id=$1", [owner.id]);
      if (Number(count) >= maxPublications) throw new PublicationError(409, "На доске уже 200 объявлений");
      const result = await client.query(
        "INSERT INTO profile_announcements (id,owner_id,title,body) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING",
        [item.id, owner.id, item.title, item.body],
      );
      if (!result.rowCount) throw new PublicationError(409, "Обновите форму и повторите публикацию");
    });
    res.status(201).json({ id: item.id });
  }, { ownerOnly: true }));

  app.patch(`${board}/:id`, requireAuth, route(async (req, res, { owner }) => {
    const { title, body } = announcement.parse(req.body);
    const result = await query(
      "UPDATE profile_announcements SET title=$3,body=$4 WHERE id=$1 AND owner_id=$2",
      [id.parse(req.params.id), owner.id, title, body],
    );
    if (!result.rowCount) throw new PublicationError(404, "Объявление не найдено");
    res.json({ ok: true });
  }, { ownerOnly: true }));

  app.delete(`${board}/:id`, requireAuth, route(async (req, res, { owner }) => {
    await query("DELETE FROM profile_announcements WHERE id=$1 AND owner_id=$2", [id.parse(req.params.id), owner.id]);
    res.json({ ok: true });
  }, { ownerOnly: true }));
}
