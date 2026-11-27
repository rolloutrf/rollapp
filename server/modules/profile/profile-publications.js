import { randomUUID } from "node:crypto";
import { z } from "zod";
import { findProfileForAddress, profileAddress } from "./profile-addresses.js";
import { BOOKING_CALENDAR_PATH } from "../../../shared/modules/calendar/booking-calendar.js";

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
    slot_id UUID NOT NULL REFERENCES profile_session_slots(id) ON DELETE CASCADE,
    guest_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(16) NOT NULL DEFAULT 'confirmed' CHECK (status IN ('pending','confirmed','declined','cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
    responded_at TIMESTAMPTZ
  );
  ALTER TABLE profile_session_bookings ADD COLUMN IF NOT EXISTS status VARCHAR(16) NOT NULL DEFAULT 'confirmed';
  ALTER TABLE profile_session_bookings ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp();
  ALTER TABLE profile_session_bookings ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ;
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='profile_session_bookings'::regclass
      AND conname='profile_session_bookings_status_check') THEN
      ALTER TABLE profile_session_bookings ADD CONSTRAINT profile_session_bookings_status_check
        CHECK (status IN ('pending','confirmed','declined','cancelled'));
    END IF;
  END $$;
  ALTER TABLE profile_session_bookings DROP CONSTRAINT IF EXISTS profile_session_bookings_slot_id_key;
  CREATE UNIQUE INDEX IF NOT EXISTS profile_session_bookings_active_slot
    ON profile_session_bookings(slot_id) WHERE status IN ('pending','confirmed');
  CREATE TABLE IF NOT EXISTS profile_announcements (
    id UUID PRIMARY KEY,
    owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(160) NOT NULL,
    body VARCHAR(4000) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS profile_announcements_owner_created ON profile_announcements(owner_id, created_at DESC);
`;

export async function verifyProfilePublicationsSchema(client) {
  await client.query("SELECT id,owner_id,starts_at,ends_at,title FROM profile_session_slots LIMIT 0");
  await client.query("SELECT id,slot_id,guest_id,status,created_at,responded_at FROM profile_session_bookings LIMIT 0");
  await client.query("SELECT id,owner_id,title,body,created_at FROM profile_announcements LIMIT 0");
  const { rows: [activeSlotIndex] } = await client.query(
    `SELECT i.indisunique,i.indisvalid,i.indisready,i.indislive,pg_get_indexdef(i.indexrelid) AS indexdef
     FROM pg_index i JOIN pg_class idx ON idx.oid=i.indexrelid JOIN pg_class table_ref ON table_ref.oid=i.indrelid
     WHERE idx.relname='profile_session_bookings_active_slot'
       AND table_ref.oid='profile_session_bookings'::regclass`,
  );
  if (!activeSlotIndex?.indisunique || !activeSlotIndex.indisvalid || !activeSlotIndex.indisready || !activeSlotIndex.indislive
    || !/\(slot_id\)/.test(activeSlotIndex.indexdef || "")
    || !/pending/.test(activeSlotIndex.indexdef || "") || !/confirmed/.test(activeSlotIndex.indexdef || "")) {
    throw new Error("Profile booking active-slot index is missing or invalid");
  }
}

const title = z.string().trim().min(1).max(160);
const id = z.uuid();
const slotInput = z.object({
  id, title, startsAt: z.iso.datetime(), duration: z.number().int().min(15).max(480),
}).strict();
const announcement = z.object({ title, body: z.string().trim().min(1).max(4000) }).strict();
const slotUnavailable = "Это время больше недоступно. Выберите другой слот.";
const maxPublications = 200;
const slotBatchInput = z.object({ slots: z.array(slotInput).min(1).max(maxPublications) }).strict();
const bookingResponseInput = z.object({ decision: z.enum(["confirm", "decline"]) }).strict();

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
    bookingStatus: row.booking_status ?? null,
    requestedAt: row.booking_created_at ?? null,
    bookedByMe,
    ...(isOwner && row.booking_id ? { guestName: row.guest_name } : {}),
  };
}

export function registerProfilePublicationRoutes(app, {
  requireAuth, query, transaction, asyncRoute, notifyBooking = async () => {}, markBookingRequestRead = async () => {},
}) {
  const section = "/api/profile/:username";
  const calendar = `${section}/calendar`;
  const board = `${section}/announcements`;
  const route = (handler, { ownerOnly = false } = {}) => asyncRoute(async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    res.vary("Cookie");
    try {
      const { rows: [owner] } = await findProfileForAddress(query, req.params.username);
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
              b.status AS booking_status,b.created_at AS booking_created_at,
              CASE WHEN $3 THEN u.name END AS guest_name
       FROM profile_session_slots s
       LEFT JOIN profile_session_bookings b ON b.slot_id=s.id AND b.status IN ('pending','confirmed')
       LEFT JOIN users u ON u.id=b.guest_id
       WHERE s.owner_id=$1 AND s.starts_at>clock_timestamp()
         AND (b.id IS NULL OR b.guest_id=$2 OR $3)
       ORDER BY s.starts_at,s.id`,
      [owner.id, viewerId ?? null, isOwner],
    );
    res.json({ profile: { name: owner.name, username: owner.username, profileSlug: await profileAddress(query, owner.id) }, isOwner, slots: rows.map(row => publicSessionSlot(row, access)).filter(Boolean) });
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
    const booking = await transaction(async client => {
      const slot = (await client.query(
        "SELECT id,title,starts_at FROM profile_session_slots WHERE owner_id=$1 AND id=$2 AND starts_at>clock_timestamp() FOR UPDATE",
        [owner.id, slotId],
      )).rows[0];
      if (!slot) throw new PublicationError(409, slotUnavailable);
      const { rows: [booking] } = await client.query(
        "SELECT id,guest_id,status FROM profile_session_bookings WHERE slot_id=$1 AND status IN ('pending','confirmed')", [slotId],
      );
      if (booking?.guest_id === viewerId) return { id: booking.id, status: booking.status };
      if (booking) throw new PublicationError(409, slotUnavailable);
      const key = randomUUID();
      const result = await client.query(
        `INSERT INTO profile_session_bookings (id,slot_id,guest_id,status)
         SELECT $1,id,$3,'pending' FROM profile_session_slots WHERE id=$2 AND starts_at>clock_timestamp()`,
        [key, slotId, viewerId],
      );
      if (!result.rowCount) throw new PublicationError(409, slotUnavailable);
      const { rows: [guest] } = await client.query("SELECT name FROM users WHERE id=$1", [viewerId]);
      await notifyBooking(client, {
        kind: "booking_request", recipientId: owner.id, bookingId: key, slotTitle: slot.title,
        actorName: guest?.name, startsAt: slot.starts_at,
        actionPath: `${BOOKING_CALENDAR_PATH}&booking=${encodeURIComponent(key)}`,
      });
      return { id: key, status: "pending" };
    });
    res.json({ bookingId: booking.id, bookingStatus: booking.status });
  }));

  app.patch("/api/profile-bookings/:bookingId", requireAuth, asyncRoute(async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    try {
      const bookingId = id.parse(req.params.bookingId);
      const { decision } = bookingResponseInput.parse(req.body);
      const bookingStatus = await transaction(async client => {
        const { rows: [booking] } = await client.query(
          `SELECT b.id,b.status,b.guest_id,s.id AS slot_id,s.owner_id,s.title,s.starts_at,
                  guest.name AS guest_name,owner.name AS owner_name,owner.username AS owner_username,
                  s.starts_at>clock_timestamp() AS upcoming
           FROM profile_session_bookings b
           JOIN profile_session_slots s ON s.id=b.slot_id
           JOIN users guest ON guest.id=b.guest_id JOIN users owner ON owner.id=s.owner_id
           WHERE b.id=$1 FOR UPDATE OF b,s`,
          [bookingId],
        );
        if (!booking) throw new PublicationError(404, "Запрос на встречу не найден");
        if (booking.owner_id !== req.user.id) throw new PublicationError(403, "Ответить на запрос может только владелец слота");
        if (!booking.upcoming) throw new PublicationError(409, "Время этой встречи уже прошло");
        const next = decision === "confirm" ? "confirmed" : "declined";
        if (booking.status === next) return next;
        if (booking.status !== "pending") throw new PublicationError(409, "На этот запрос уже ответили");
        await client.query(
          "UPDATE profile_session_bookings SET status=$2,responded_at=statement_timestamp() WHERE id=$1",
          [bookingId, next],
        );
        await markBookingRequestRead(client, req.user.id, bookingId);
        await notifyBooking(client, {
          kind: next === "confirmed" ? "booking_confirmed" : "booking_declined",
          recipientId: booking.guest_id, bookingId, slotTitle: booking.title, actorName: booking.owner_name,
          startsAt: booking.starts_at,
          actionPath: `/${encodeURIComponent(booking.owner_username)}/calendar/book?slot=${encodeURIComponent(booking.slot_id)}`,
        });
        return next;
      });
      res.json({ bookingId, bookingStatus });
    } catch (error) {
      if (error instanceof PublicationError) return res.status(error.status).json({ error: error.message });
      throw error;
    }
  }));

  app.delete(`${calendar}/:slotId/bookings/:bookingId`, requireAuth, route(async (req, res, { owner, viewerId, isOwner }) => {
    const slotId = id.parse(req.params.slotId);
    const bookingId = id.parse(req.params.bookingId);
    await transaction(async client => {
      await lockSlot(client, owner.id, slotId);
      const { rows: [booking] } = await client.query(
        `SELECT b.id,b.guest_id,b.status,s.title,s.starts_at,guest.name AS guest_name
         FROM profile_session_bookings b JOIN profile_session_slots s ON s.id=b.slot_id
         JOIN users guest ON guest.id=b.guest_id
         WHERE b.id=$1 AND b.slot_id=$2 AND b.status IN ('pending','confirmed') FOR UPDATE OF b`,
        [bookingId, slotId],
      );
      if (!booking || (!isOwner && booking.guest_id !== viewerId)) return;
      await client.query(
        "UPDATE profile_session_bookings SET status='cancelled',responded_at=statement_timestamp() WHERE id=$1",
        [bookingId],
      );
      const actorName = isOwner ? owner.name : booking.guest_name;
      await notifyBooking(client, {
        kind: "booking_cancelled", recipientId: isOwner ? booking.guest_id : owner.id,
        bookingId, slotTitle: booking.title, actorName, startsAt: booking.starts_at,
        actionPath: isOwner
          ? `/${encodeURIComponent(owner.username)}/calendar/book?slot=${encodeURIComponent(slotId)}`
          : `${BOOKING_CALENDAR_PATH}&booking=${encodeURIComponent(bookingId)}`,
      });
    });
    res.json({ ok: true });
  }));

  app.delete(`${calendar}/:slotId`, requireAuth, route(async (req, res, { owner }) => {
    const slotId = id.parse(req.params.slotId);
    await transaction(async client => {
      await lockSlot(client, owner.id, slotId);
      const result = await client.query(
        `DELETE FROM profile_session_slots s WHERE s.id=$1
         AND NOT EXISTS (SELECT 1 FROM profile_session_bookings WHERE slot_id=s.id AND status IN ('pending','confirmed'))`,
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
    res.json({ profile: { name: owner.name, username: owner.username, profileSlug: await profileAddress(query, owner.id) }, isOwner, announcements: rows });
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
