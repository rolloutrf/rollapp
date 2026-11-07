import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import cookieParser from "cookie-parser";
import express from "express";
import { createAccountSessions, requireExpectedAccount, savedSessionsCookie, sessionCookie } from "./account-sessions.js";
import { createSessionToken, hashToken } from "./security.js";

test("account sessions use only this browser's valid production session rows", {
  skip: process.env.ROLLAPP_TEST_ACCOUNT_SESSIONS !== "1",
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
    const profiles = [];
    for (const name of ["personal", "business", "outside", "expired"]) {
      const id = randomUUID();
      const token = createSessionToken();
      const expiresAt = new Date(Date.now() + (name === "expired" ? -600_000 : 600_000));
      await query("INSERT INTO users (id,email,username,name,password_hash,account_type) VALUES ($1,$2,$3,$4,$5,$6)",
        [id, `${id}@account-test.invalid`, `accounts-${id.slice(0, 20)}`, name, "unusable", name === "business" ? "business" : "personal"]);
      await query("INSERT INTO sessions (token_hash,user_id,expires_at) VALUES ($1,$2,$3)", [hashToken(token), id, expiresAt]);
      profiles.push({ id, token, expiresAt });
    }
    const [personal, business, outside, expired] = profiles;
    const app = express();
    app.use(express.json(), cookieParser());
    const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
    const requireAuth = (req, res, next) => req.user ? next() : res.sendStatus(401);
    app.use(asyncRoute(async (req, _res, next) => {
      const token = req.cookies[sessionCookie];
      if (token) {
        const result = await query("SELECT user_id AS id FROM sessions WHERE token_hash=$1 AND expires_at>CURRENT_TIMESTAMP", [hashToken(token)]);
        req.user = result.rows[0];
      }
      next();
    }), requireExpectedAccount);
    const { setAuthenticatedSession, registerAccountRoutes } = createAccountSessions({
      query, sessionCookieOptions: (path) => ({ path, httpOnly: true, sameSite: "lax" }),
    });
    registerAccountRoutes(app, { requireAuth, asyncRoute });
    // Feed an already verified test sign-in to the production session handoff.
    app.post("/api/auth/test-add", requireAuth, asyncRoute(async (req, res) => {
      await setAuthenticatedSession(req, res, business, business.id, { addAccount: true });
      res.json({ ok: true });
    }));
    server = await new Promise((resolve) => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
    const base = `http://127.0.0.1:${server.address().port}/api/auth`;
    const jar = new Map([[sessionCookie, personal.token]]);
    const request = async (method, path, body, expectedAccount) => {
      const response = await fetch(base + path, {
        method,
        headers: {
          Cookie: [...jar].map(([key, value]) => `${key}=${value}`).join("; "),
          ...(body && { "Content-Type": "application/json" }),
          ...(expectedAccount && { "X-Rollapp-Account": expectedAccount }),
        },
        ...(body && { body: JSON.stringify(body) }),
      });
      for (const cookie of response.headers.getSetCookie()) {
        const [key, value] = cookie.split(";")[0].split("=");
        if (value) jar.set(key, value);
        else jar.delete(key);
      }
      return response;
    };
    const accountRows = async () => {
      const response = await request("GET", "/accounts");
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      const payload = await response.json();
      assert.equal(payload.maxAccounts, 5);
      assert(!JSON.stringify(payload).includes(personal.token));
      return payload.accounts.map(({ id, active }) => [id, active]);
    };
    assert.deepEqual(await accountRows(), [[personal.id, true]]);
    assert.equal((await request("POST", "/accounts/switch", { accountId: outside.id })).status, 404);
    const added = await request("POST", "/test-add", {}, personal.id);
    assert.equal(added.status, 200);
    assert(added.headers.getSetCookie().some((cookie) => cookie.startsWith(savedSessionsCookie + "=") && cookie.includes("Path=/api/auth") && cookie.includes("HttpOnly")));
    assert.equal(jar.get(sessionCookie), business.token);
    assert.deepEqual(await accountRows(), [[business.id, true], [personal.id, false]]);
    jar.set(savedSessionsCookie, `${personal.token}.${expired.token}`);
    assert.equal((await request("POST", "/accounts/switch", { accountId: expired.id })).status, 404);
    assert.equal((await request("POST", "/accounts/switch", { accountId: personal.id }, personal.id)).status, 409);
    assert.equal((await request("POST", "/accounts/switch", { accountId: personal.id }, business.id)).status, 200);
    assert.deepEqual(await accountRows(), [[personal.id, true], [business.id, false]]);
    assert.equal((await request("DELETE", `/accounts/${personal.id}`)).status, 400);
    assert.equal((await request("DELETE", `/accounts/${business.id}`)).status, 200);
    assert.deepEqual(await accountRows(), [[personal.id, true]]);
    assert.equal((await query("SELECT 1 FROM sessions WHERE token_hash=$1", [hashToken(business.token)])).rowCount, 0);
    jar.set(savedSessionsCookie, expired.token);
    assert.equal((await request("POST", "/logout", {})).status, 200);
    assert.equal(jar.size, 0);
    assert.equal((await request("GET", "/accounts")).status, 401);
    assert.equal((await query("SELECT 1 FROM sessions WHERE token_hash=ANY($1::text[])", [[personal.token, expired.token].map(hashToken)])).rowCount, 0);
    assert.equal((await query("SELECT 1 FROM sessions WHERE token_hash=$1", [hashToken(outside.token)])).rowCount, 1);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    try { await query("ROLLBACK"); } finally { client.release(); await db.pool.end(); }
  }
});
