import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import express from "express";
import cookieParser from "cookie-parser";
import { registerOpenRouterRoutes, readOpenRouterCredential } from "./openrouter-routes.js";
import { OpenRouterSettingsError } from "./openrouter-settings.js";
import { decryptUserCredential } from "./user-credentials.js";
import { hashToken } from "./security.js";

test("personal OpenRouter settings survive new sessions and HTTP server recreation on production PostgreSQL", {
  skip: process.env.ROLLAPP_TEST_OPENROUTER !== "1",
}, async (t) => {
  const { productionRollsDatabase } = await import("../scripts/rolls-database.mjs");
  const db = await productionRollsDatabase();
  const client = await db.pool.connect();
  const query = (sql, params) => client.query(sql, params);
  const previousSecret = process.env.USER_CREDENTIALS_SECRET;
  // Only synthetic fixture keys use this secret, and all rows roll back.
  const stableSecret = randomUUID() + randomUUID();
  process.env.USER_CREDENTIALS_SECRET = stableSecret;
  let server;
  let origin;
  let upstreamUnavailable = false;
  const models = [{ id: "test/model-a", name: "Model A" }, { id: "test/model-b", name: "Model B" }];
  const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
  const start = async () => {
    const app = express();
    app.use(express.json(), cookieParser());
    const requireAuth = asyncRoute(async (req, res, next) => {
      const session = await query("SELECT user_id FROM sessions WHERE token_hash=$1 AND expires_at>CURRENT_TIMESTAMP", [hashToken(req.cookies.rw_session || "")]);
      if (!session.rowCount) return res.status(401).json({ error: "Требуется вход" });
      req.user = { id: session.rows[0].user_id };
      next();
    });
    const checkUpstream = () => {
      if (upstreamUnavailable) throw new OpenRouterSettingsError("OpenRouter временно недоступен");
    };
    registerOpenRouterRoutes(app, {
      query, requireAuth, asyncRoute, authRateLimit: (_req, _res, next) => next(),
      listModels: async () => { checkUpstream(); return models; },
      validateKey: async (key) => {
        checkUpstream();
        if (key.includes("rejected")) throw new OpenRouterSettingsError("Неверный ключ", { status: 400, code: "openrouter_key_invalid" });
      },
      validateModel: async (model) => {
        checkUpstream();
        if (!models.some(({ id }) => id === model)) throw new OpenRouterSettingsError("Неверная модель", { status: 400, code: "openrouter_model_invalid" });
      },
    });
    app.use((_error, _req, res, _next) => res.status(500).json({ error: "Unexpected server error" }));
    server = await new Promise((resolve) => {
      const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
    });
    origin = `http://127.0.0.1:${server.address().port}/api/me/openrouter`;
  };
  const stop = async () => {
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    server = null;
  };
  const request = async (cookie, method = "GET", body, suffix = "") => {
    const response = await fetch(origin + suffix, {
      method, headers: { Cookie: cookie, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json(), cache: response.headers.get("cache-control") };
  };
  const login = async (userId) => {
    const token = randomUUID();
    await query("INSERT INTO sessions (token_hash,user_id,expires_at) VALUES ($1,$2,$3)", [hashToken(token), userId, new Date(Date.now() + 60_000)]);
    return `rw_session=${token}`;
  };
  try {
    await query("BEGIN");
    await query("SET LOCAL lock_timeout='5s'");
    await query("SET LOCAL statement_timeout='10s'");
    const [ownerId, otherId] = [randomUUID(), randomUUID()];
    for (const userId of [ownerId, otherId]) {
      await query("INSERT INTO users (id,email,username,name,password_hash) VALUES ($1,$2,$3,$4,$5)", [userId, `${userId}@openrouter-test.invalid`, `or-test-${userId}`, "OpenRouter persistence test", "unusable"]);
    }
    let cookie = await login(ownerId);
    const otherCookie = await login(otherId);
    const apiKey = `sk-or-v1-fixture-${randomUUID()}`;
    await start();

    await t.test("saving encrypts the key and returns only a hint", async () => {
      const result = await request(cookie, "POST", { apiKey, model: models[0].id });
      assert.equal(result.status, 200, JSON.stringify(result.body));
      assert.equal(result.body.configured, true);
      assert.equal(result.body.model, models[0].id);
      assert.match(result.cache, /no-store/);
      assert.equal(JSON.stringify(result.body).includes(apiKey), false);
      const row = await readOpenRouterCredential(query, ownerId);
      assert.notEqual(row.encrypted_secret, apiKey);
      assert.equal(decryptUserCredential(row.encrypted_secret, { userId: ownerId, provider: "openrouter" }), apiKey);
    });

    await t.test("logout revokes the session but a new session restores the same key and model", async () => {
      const before = await readOpenRouterCredential(query, ownerId);
      await query("DELETE FROM sessions WHERE token_hash=$1", [hashToken(cookie.slice("rw_session=".length))]);
      assert.equal((await request(cookie)).status, 401);
      cookie = await login(ownerId);
      const result = await request(cookie);
      assert.equal(result.status, 200);
      assert.equal(result.body.configured, true);
      assert.equal(result.body.keyHint, before.secret_hint);
      assert.equal(result.body.model, models[0].id);
      assert.deepEqual(await readOpenRouterCredential(query, ownerId), before);
    });

    await t.test("changing the model preserves the encrypted key and survives server recreation", async () => {
      const before = await readOpenRouterCredential(query, ownerId);
      const result = await request(cookie, "PATCH", { model: models[1].id });
      assert.equal(result.status, 200);
      assert.equal(result.body.model, models[1].id);
      assert.equal((await readOpenRouterCredential(query, ownerId)).encrypted_secret, before.encrypted_secret);
      await stop();
      process.env.USER_CREDENTIALS_SECRET = stableSecret;
      await start();
      const reloaded = await request(cookie);
      assert.equal(reloaded.body.model, models[1].id);
      assert.equal(reloaded.body.keyHint, before.secret_hint);
      const row = await readOpenRouterCredential(query, ownerId);
      assert.equal(decryptUserCredential(row.encrypted_secret, { userId: ownerId, provider: "openrouter" }), apiKey);
    });

    await t.test("a different account cannot read, overwrite or disconnect these settings", async () => {
      const before = await readOpenRouterCredential(query, ownerId);
      assert.equal((await request(otherCookie)).body.configured, false);
      assert.equal((await request(otherCookie, "PATCH", { model: models[0].id })).status, 409);
      assert.equal((await request(otherCookie, "POST", { apiKey, model: models[0].id, userId: ownerId })).status, 400);
      assert.equal((await request(otherCookie, "DELETE")).status, 200);
      assert.deepEqual(await readOpenRouterCredential(query, ownerId), before);
    });

    await t.test("rejected input and provider failures never overwrite saved settings", async () => {
      const before = await readOpenRouterCredential(query, ownerId);
      assert.equal((await request(cookie, "POST", { apiKey: "sk-or-v1-rejected-fixture-key", model: models[0].id })).status, 400);
      assert.equal((await request(cookie, "PATCH", { model: "missing/model" })).status, 400);
      upstreamUnavailable = true;
      assert.equal((await request(cookie, "POST", { apiKey, model: models[0].id })).status, 503);
      assert.equal((await request(cookie, "PATCH", { model: models[0].id })).status, 503);
      assert.equal((await request(cookie, "GET", undefined, "/models")).status, 503);
      const reloaded = await request(cookie);
      assert.equal(reloaded.status, 200);
      assert.equal(reloaded.body.model, models[1].id);
      assert.deepEqual(await readOpenRouterCredential(query, ownerId), before);
      upstreamUnavailable = false;
    });

    await t.test("replacing a key preserves the selected model when none is supplied", async () => {
      const replacement = `sk-or-v1-replacement-${randomUUID()}`;
      const result = await request(cookie, "POST", { apiKey: replacement });
      assert.equal(result.status, 200);
      assert.equal(result.body.model, models[1].id);
      const row = await readOpenRouterCredential(query, ownerId);
      assert.equal(decryptUserCredential(row.encrypted_secret, { userId: ownerId, provider: "openrouter" }), replacement);
    });
  } finally {
    await stop();
    if (previousSecret === undefined) delete process.env.USER_CREDENTIALS_SECRET;
    else process.env.USER_CREDENTIALS_SECRET = previousSecret;
    try { await query("ROLLBACK"); } finally { client.release(); await db.pool.end(); }
  }
});
