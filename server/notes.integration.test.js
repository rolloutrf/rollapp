import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import express from "express";
import cookieParser from "cookie-parser";
import { hashToken } from "./security.js";
import { registerNotesRoutes } from "./notes.js";
import { imageIsInUse } from "./image-usage.js";

// Explicit production check only. Never creates a schema or commits test records.
// The first query validates the existing notes table before any fixture writes.
test("notes HTTP CRUD, rich storage, ownership and media guards on production PostgreSQL with rollback", { skip: process.env.ROLLAPP_TEST_NOTES !== "1" }, async () => {
  const { productionRollsDatabase } = await import("../scripts/rolls-database.mjs");
  const db = await productionRollsDatabase();
  try {
    const client = await db.pool.connect();
    const ids = [randomUUID(), randomUUID()];
    const tokens = [randomUUID(), randomUUID()];
    let pending = Promise.resolve();
    const query = (sql, params) => {
      const result = pending.then(() => client.query(sql, params));
      pending = result.catch(() => {});
      return result;
    };
    let server;
    try {
      await query("BEGIN");
      await query("SET LOCAL lock_timeout='5s'");
      await query("SET LOCAL statement_timeout='10s'");
      await query("SET LOCAL idle_in_transaction_session_timeout='60s'");
      await query("SELECT id,user_id,title,content,created_at,updated_at FROM planning_notes LIMIT 0");
      for (const [index, id] of ids.entries()) {
        await query("INSERT INTO users (id,email,username,name,password_hash) VALUES ($1,$2,$3,$4,$5)", [id, `${id}@notes-test.invalid`, `notes-${id}`, "Notes rollback check", "unusable"]);
        await query("INSERT INTO sessions (token_hash,user_id,expires_at) VALUES ($1,$2,$3)", [hashToken(tokens[index]), id, new Date(Date.now() + 600_000)]);
      }
      const app = express();
      app.use(express.json({ limit: "2mb" }), cookieParser());
      const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
      const requireAuth = asyncRoute(async (req, res, next) => {
        const result = await query('SELECT u.id,u.name,u.username,u.account_type AS "accountType" FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>CURRENT_TIMESTAMP', [hashToken(req.cookies.rw_session || "")]);
        if (!result.rowCount) return res.status(401).json({ error: "Требуется вход" });
        req.user = result.rows[0];
        next();
      });
      registerNotesRoutes(app, { requireAuth, query, asyncRoute });
      app.get("/api/me", requireAuth, (req, res) => res.json({ user: req.user }));
      app.use((error, _req, res, _next) => res.status(500).json({ error: "Storage error" }));
      server = await new Promise(resolve => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
      const origin = `http://127.0.0.1:${server.address().port}`;
      const request = async (method, suffix = "", body, token = tokens[0]) => {
        const response = await fetch(`${origin}/api/planning/notes${suffix}`, { method, headers: { "Content-Type": "application/json", Cookie: `rw_session=${token}` }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
        return { status: response.status, body: await response.json(), cache: response.headers.get("Cache-Control") };
      };
      for (const [method, suffix, body] of [["GET", ""], ["POST", "", { title: "x", content: "" }], ["GET", "/unknown"], ["PATCH", "/unknown", { title: "x", content: "" }], ["DELETE", "/unknown"]]) {
        assert.equal((await request(method, suffix, body, "invalid")).status, 401);
      }
      assert.deepEqual((await request("GET")).body.notes, []);
      if (process.env.NOTES_TEST_UI === "1") {
        const { runNotesProductionChecks } = await import("../scripts/notes-production-checks.mjs");
        await runNotesProductionChecks({ origin, token: tokens[0] });
        assert.deepEqual((await request("GET")).body.notes, []);
      }
      const mediaUrl = `/api/media/${randomUUID()}`;
      const content = `  authored whitespace  \n\n## Заголовок\n\n- [ ] Задача\n\n**Выделено** и [ссылка](https://example.com)\n\n![Описание](${mediaUrl})\n\n<div data-type="columns"><div data-type="column"><p>Столбец</p></div></div>\n`;
      const created = await request("POST", "", { title: "  Моя заметка  ", content });
      assert.equal(created.status, 201);
      assert.equal(created.cache, "private, no-store");
      const id = created.body.note.id;
      assert.equal(created.body.note.title, "Моя заметка");
      assert.equal(created.body.note.content, content);
      assert.equal((await request("GET", `/${id}`)).body.note.content, content);
      assert.equal(await imageIsInUse(query, ids[0], mediaUrl), true);
      assert.equal(await imageIsInUse(query, ids[1], mediaUrl), false);
      const list = await request("GET");
      assert.equal(list.status, 200);
      assert.equal(list.body.notes.length, 1);
      assert.equal(list.body.notes[0].id, id);
      assert.equal("content" in list.body.notes[0], false);
      assert.equal(list.cache, "private, no-store");
      assert.deepEqual((await request("GET", `?owner=${ids[0]}`, undefined, tokens[1])).body.notes, []);
      for (const [method, body] of [["GET"], ["PATCH", { title: "Чужая", content: "Подмена" }], ["DELETE"]]) {
        assert.equal((await request(method, `/${id}?owner=${ids[0]}`, body, tokens[1])).status, 404);
      }
      assert.equal((await request("GET", `/${id}`)).body.note.content, content);
      const invalid = [{ title: "x".repeat(201), content }, { title: "x", content: "x".repeat(200001) }, { title: "x", content, user_id: ids[1] }];
      for (const input of invalid) {
        assert.equal((await request("POST", "", input)).status, 400);
        assert.equal((await request("PATCH", `/${id}`, input)).status, 400);
      }
      assert.equal((await request("GET")).body.notes.length, 1);
      // Exercise the actual JSON byte limit with a full Cyrillic document.
      const large = "я".repeat(200_000);
      const updated = await request("PATCH", `/${id}`, { title: "", content: large });
      assert.equal(updated.status, 200);
      assert.equal(updated.body.note.title, "Без названия");
      assert.equal(updated.body.note.content, large);
      assert.equal((await request("GET", `/${id}`)).body.note.content, large);
      assert.equal(await imageIsInUse(query, ids[0], mediaUrl), false);
      assert.equal((await request("DELETE", `/${id}`)).status, 200);
      assert.equal((await request("GET", `/${id}`)).status, 404);
      assert.equal((await request("PATCH", `/${id}`, { title: "Не воскрешать", content })).status, 404);
      assert.equal((await request("DELETE", `/${id}`)).status, 404);
      assert.deepEqual((await request("GET")).body.notes, []);
    } finally {
      if (server) await new Promise(resolve => server.close(resolve));
      try { await pending; await client.query("ROLLBACK"); }
      finally { client.release(); }
    }
    // Queries after the transaction confirm that no fixture records were committed.
    assert.equal((await db.query("SELECT id FROM users WHERE id=ANY($1::text[])", [ids])).rowCount, 0);
    assert.equal((await db.query("SELECT id FROM planning_notes WHERE user_id=ANY($1::text[])", [ids])).rowCount, 0);
  } finally { await db.pool.end(); }
});
