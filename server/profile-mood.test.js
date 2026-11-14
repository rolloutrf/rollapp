import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import express from "express";
import { MOOD_LEVELS, NEUTRAL_MOOD_LEVEL } from "../shared/profile-mood.js";
import { moodQuerySchema, moodSaveSchema, publicMood, registerProfileMoodRoutes, verifyProfileMoodAvailability } from "./profile-mood.js";

test("visitors see only valid, non-neutral levels with public visibility", () => {
  for (const { level } of MOOD_LEVELS) {
    assert.equal(publicMood({ mood_level: level, mood_public: true, entries: [{ level }] }), level === NEUTRAL_MOOD_LEVEL ? null : level);
    assert.equal(publicMood({ mood_level: level, mood_public: false }), null);
  }
  for (const mood_level of [null, 0, 6, "5", undefined]) {
    assert.equal(publicMood({ mood_level, mood_public: true }), null);
  }
  assert.equal(publicMood({ mood_level: 5, mood_public: "true" }), null);
});

test("journal requests cannot select or submit another owner or an authored timestamp", () => {
  const entry = { requestId: randomUUID(), level: 5 };
  assert(moodSaveSchema.safeParse({ entry }).success);
  assert(moodSaveSchema.safeParse({ published: false, entry }).success);
  assert(moodSaveSchema.safeParse({ published: true }).success);
  for (const body of [
    {},
    { published: true, userId: "another-user" },
    { published: false, entry: { ...entry, userId: "another-user" } },
    { published: false, entry: { ...entry, recordedAt: "2026-11-13" } },
    { published: "true", entry },
    ...[0, 6, "5", 1.5, null].map((level) => ({ published: true, entry: { ...entry, level } })),
  ]) assert.equal(moodSaveSchema.safeParse(body).success, false);
  assert.equal(moodQuerySchema.safeParse({ owner: "another-user" }).success, false);
  assert(moodQuerySchema.safeParse({ before: "9223372036854775807" }).success);
  for (const before of ["9223372036854775808", "0", "-1", "1.5", "abc", ["1", "2"]]) {
    assert.equal(moodQuerySchema.safeParse({ before }).success, false);
  }
});

test("missing mood schema is explicit in development and prevents production startup", async () => {
  const checks = [];
  const transaction = (fn) => fn({ query: async (sql) => { checks.push(sql); } });
  assert.equal(await verifyProfileMoodAvailability(transaction, { required: true }), true);
  assert.equal(checks[0], "SET TRANSACTION READ ONLY");
  assert(checks.slice(1).every((sql) => /^SELECT .+ LIMIT 0$/.test(sql)));
  const missing = Object.assign(new Error("journal missing"), { code: "42P01" });
  const unavailable = async () => { throw missing; };
  let warnings = 0;
  assert.equal(await verifyProfileMoodAvailability(unavailable, { required: false, onMissing: () => warnings++ }), false);
  assert.equal(warnings, 1);
  await assert.rejects(verifyProfileMoodAvailability(unavailable, { required: true }), missing);
  await assert.rejects(verifyProfileMoodAvailability(async () => { throw new Error("connection lost"); }, { required: false }), /connection lost/);
});

test("journal routes reject guests and forged owner parameters before opening a transaction", async () => {
  const app = express();
  let available = true;
  let transactions = 0;
  app.use(express.json());
  registerProfileMoodRoutes(app, {
    requireAuth(req, res, next) {
      if (req.get("X-Test-Session") !== "owner") return res.sendStatus(401);
      req.user = { id: "owner" };
      next();
    },
    asyncRoute: (handler) => (req, res, next) => handler(req, res).catch(next),
    available: () => available,
    async transaction() {
      transactions++;
      throw new Error("Invalid requests must not reach PostgreSQL");
    },
  });
  const server = await new Promise((resolve, reject) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
    listener.once("error", reject);
  });
  try {
    const endpoint = `http://127.0.0.1:${server.address().port}/api/me/mood`;
    const options = { signal: AbortSignal.timeout(5000) };
    const session = { ...options, headers: { "X-Test-Session": "owner", "Content-Type": "application/json" } };
    const requests = await Promise.all([
      fetch(endpoint, options),
      fetch(endpoint, { ...options, method: "PATCH" }),
      fetch(`${endpoint}?owner=another-user`, session),
      fetch(endpoint, { ...session, method: "PATCH", body: JSON.stringify({ published: true, userId: "another-user" }) }),
    ]);
    assert.deepEqual(requests.map((response) => response.status), [401, 401, 400, 400]);
    await Promise.all(requests.map((response) => response.text()));
    available = false;
    const unavailable = await fetch(endpoint, session);
    assert.equal(unavailable.status, 503);
    assert.equal(unavailable.headers.get("cache-control"), "private, no-store");
    assert.match((await unavailable.json()).error, /схема базы данных не установлена/);
    assert.equal(transactions, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
