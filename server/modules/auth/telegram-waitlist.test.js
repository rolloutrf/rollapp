import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { registerTelegramWaitlistReader } from "./telegram-waitlist.js";

test("only the operator's account can read Telegram submissions", async (t) => {
  const app = express();
  const queries = [];
  const rows = [{ username: "sample_visitor", requestedAt: "2026-11-24T12:00:00.000Z" }];
  const users = {
    owner: { id: "bbd4e87d-520b-44c7-8091-d453c771bdbb", username: "renamed" },
    other: { id: "other-account", username: "koloskof", can_invite: true },
  };
  registerTelegramWaitlistReader(app, {
    requireAuth(req, res, next) {
      req.user = users[req.get("Authorization")];
      if (req.user) next();
      else res.sendStatus(401);
    },
    asyncRoute: (handler) => handler,
    async query(sql, params) {
      queries.push({ sql, params });
      return { rows };
    },
  });
  const server = app.listen(0, "127.0.0.1");
  t.after(() => server.close());
  await new Promise((resolve) => server.once("listening", resolve));
  const endpoint = `http://127.0.0.1:${server.address().port}/api/me/telegram-waitlist`;

  assert.equal((await fetch(endpoint)).status, 401);
  const denied = await fetch(`${endpoint}?owner=koloskof`, { headers: { Authorization: "other" } });
  assert.equal(denied.status, 403);
  assert.deepEqual(await denied.json(), { error: "Нет доступа к заявкам из Telegram" });
  assert.equal(queries.length, 0);

  const allowed = await fetch(endpoint, { headers: { Authorization: "owner" } });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await allowed.json(), { entries: rows });
  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /WHERE starts_with\(key, \$1\)\s+ORDER BY value_text DESC, key/);
  assert.deepEqual(queries[0].params, ["telegram_waitlist:"]);
});
