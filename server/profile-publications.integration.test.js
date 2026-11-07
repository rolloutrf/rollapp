import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import express from "express";
import { ZodError } from "zod";
import { registerProfilePublicationRoutes } from "./profile-publications.js";

test("profile publications and booking ownership on production PostgreSQL", {
  skip: process.env.ROLLAPP_TEST_PROFILE_PUBLICATIONS !== "1",
}, async () => {
  const { productionRollsDatabase } = await import("../scripts/rolls-database.mjs");
  const db = await productionRollsDatabase();
  const client = await db.pool.connect();
  const query = client.query.bind(client);
  let server;
  try {
    await query("BEGIN");
    await query("SET LOCAL lock_timeout='5s'");
    await query("SET LOCAL statement_timeout='10s'");
    await query("SET LOCAL idle_in_transaction_session_timeout='60s'");
    // Fail before creating any fixtures when the separately authorized schema is absent.
    await query("SELECT id FROM profile_session_slots LIMIT 0");
    await query("SELECT id FROM profile_session_bookings LIMIT 0");
    await query("SELECT id FROM profile_announcements LIMIT 0");

    const viewers = new Map();
    const profiles = [];
    for (const name of ["Host", "Guest", "Other"]) {
      const id = randomUUID();
      const username = `publication-${id.slice(0, 20)}`;
      const token = randomUUID();
      await query(
        "INSERT INTO users (id,email,username,name,password_hash) VALUES ($1,$2,$3,$4,$5)",
        [id, `${id}@profile-publications-test.invalid`, username, name, "unusable"],
      );
      viewers.set(token, { id });
      profiles.push({ id, username, token });
    }
    const [host, guest, other] = profiles;
    const app = express();
    const requireAuth = (req, res, next) => req.user ? next() : res.sendStatus(401);
    app.use(express.json(), (req, _res, next) => {
      req.user = viewers.get(req.get("X-Publication-Test-Token"));
      next();
    });
    const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
    registerProfilePublicationRoutes(app, { requireAuth, query, transaction: callback => callback(client), asyncRoute });
    app.use((error, _req, res, _next) => res.status(error instanceof ZodError ? 400 : 500).json({ error: error.code ?? error.message }));
    server = await new Promise(resolve => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
    const base = `http://127.0.0.1:${server.address().port}/api/profile`;
    const request = async (method, path, viewer, body, owner = host) => {
      const response = await fetch(`${base}/${owner.username}${path}`, {
        method,
        headers: { "Content-Type": "application/json", ...(viewer && { "X-Publication-Test-Token": viewer.token }) },
        ...(body && { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(15_000),
      });
      return {
        status: response.status,
        cache: response.headers.get("cache-control"),
        data: await response.json().catch(() => null),
      };
    };
    const calendar = "/calendar";
    const board = "/announcements";
    const { rows: [{ starts_at }] } = await query("SELECT clock_timestamp() + interval '1 day' AS starts_at");
    const slot = { id: randomUUID(), startsAt: starts_at.toISOString(), title: "Review session", duration: 60 };
    const slotPath = `${calendar}/${slot.id}`;
    assert.equal((await request("POST", calendar, null, slot)).status, 401);
    assert.equal((await request("POST", calendar, other, slot)).status, 403);
    assert.equal((await request("POST", calendar, host, slot)).status, 201);
    assert.equal((await request("POST", calendar, host, slot)).status, 201);
    assert.equal((await request("POST", calendar, host, { ...slot, id: randomUUID() })).status, 409);
    assert.equal((await request("POST", `${slotPath}/book`, host)).status, 403);
    const open = await request("GET", calendar);
    assert.equal(open.status, 200);
    assert.equal(open.cache, "private, no-store");
    assert.deepEqual(open.data.slots, [{
      id: slot.id,
      title: slot.title,
      startsAt: slot.startsAt,
      endsAt: new Date(starts_at.getTime() + 60 * 60_000).toISOString(),
      bookingId: null,
      bookedByMe: false,
    }]);
    assert.deepEqual((await request("GET", calendar, null, undefined, guest)).data.slots, []);

    const booking = await request("POST", `${slotPath}/book`, guest);
    assert.equal(booking.status, 200, JSON.stringify(booking.data));
    const bookingId = booking.data.bookingId;
    assert.ok(bookingId);
    assert.equal((await request("POST", `${slotPath}/book`, guest)).data.bookingId, bookingId);
    assert.equal((await request("POST", `${slotPath}/book`, other)).status, 409);
    assert.equal((await request("DELETE", slotPath, host)).status, 409);
    assert.deepEqual((await request("GET", calendar)).data.slots, []);
    assert.deepEqual((await request("GET", calendar, other)).data.slots, []);
    const mySlot = (await request("GET", calendar, guest)).data.slots[0];
    assert.equal(mySlot.bookedByMe, true);
    assert.equal(mySlot.guestName, undefined);
    assert.equal((await request("GET", calendar, host)).data.slots[0].guestName, "Guest");

    const bookingPath = `${slotPath}/bookings/${bookingId}`;
    await request("DELETE", bookingPath, other);
    assert.equal((await request("GET", calendar, guest)).data.slots[0].bookingId, bookingId);
    assert.equal((await request("DELETE", bookingPath, guest)).status, 200);
    const bookedAgain = (await request("POST", `${slotPath}/book`, other)).data.bookingId;
    assert.ok(bookedAgain && bookedAgain !== bookingId);
    await request("DELETE", bookingPath, host);
    assert.equal((await request("GET", calendar, other)).data.slots[0].bookingId, bookedAgain);
    assert.equal((await request("DELETE", `${slotPath}/bookings/${bookedAgain}`, host)).status, 200);
    assert.equal((await request("DELETE", slotPath, host)).status, 200);
    assert.deepEqual((await request("GET", calendar)).data.slots, []);

    const item = { id: randomUUID(), title: "Board announcement", body: "Meeting at 18:00" };
    const itemPath = `${board}/${item.id}`;
    assert.equal((await request("POST", board, other, item)).status, 403);
    assert.equal((await request("POST", board, host, item)).status, 201);
    assert.equal((await request("POST", board, host, item)).status, 201);
    assert.deepEqual((await request("GET", board)).data.announcements.map(({ id, body }) => [id, body]), [[item.id, item.body]]);
    assert.deepEqual((await request("GET", board, null, undefined, guest)).data.announcements, []);
    assert.equal((await request("PATCH", itemPath, guest, { title: "Changed", body: "Changed" })).status, 403);
    assert.equal((await request("PATCH", itemPath, host, { title: item.title, body: "Meeting at 19:00" })).status, 200);
    assert.equal((await request("GET", board)).data.announcements[0].body, "Meeting at 19:00");
    assert.equal((await request("DELETE", itemPath, other)).status, 403);
    assert.equal((await request("DELETE", itemPath, host)).status, 200);
    assert.deepEqual((await request("GET", board)).data.announcements, []);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    try { await query("ROLLBACK"); } finally { client.release(); await db.pool.end(); }
  }
});
