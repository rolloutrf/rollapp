// Local UI verification against production PostgreSQL. Fixture accounts and all
// their operations live in ONE uncommitted transaction, rolled back on shutdown.
// No real user's sessions or credentials are created or reused by this harness.
import { randomUUID } from "node:crypto";
import express from "express";
import path from "node:path";
import { productionRollsDatabase } from "./rolls-database.mjs";
import { ensureRollWallet } from "../server/rolls.js";
import { rollStarsSchema } from "../server/roll-stars-schema.js";
import { registerRollsRoutes } from "../server/rolls-routes.js";

if (!process.argv.includes("--rollback-preview")) throw new Error("Use --rollback-preview for the temporary PostgreSQL UI test.");
const db = await productionRollsDatabase();
const client = await db.pool.connect();
let server;
let stopping = false;
async function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  server?.close();
  try { await client.query("ROLLBACK"); } finally { client.release(); await db.pool.end(); }
  console.log("Rolls UI preview: all fixture accounts and transfers rolled back.");
  process.exit(exitCode);
}
process.once("SIGTERM", () => stop());
process.once("SIGINT", () => stop());
try {
  await client.query("BEGIN");
  await client.query("SET LOCAL idle_in_transaction_session_timeout='10min'");
  await client.query("SET LOCAL lock_timeout='5s'");
  await client.query(rollStarsSchema);
  const ids = [randomUUID(), randomUUID()];
  for (const [index, id] of ids.entries()) {
    await client.query("INSERT INTO users (id,email,username,name,password_hash) VALUES ($1,$2,$3,$4,'unusable')", [id, `${id}@rolls-test.invalid`, `rolls-preview-${index}-${id.slice(0, 8)}`, index ? "Тестовый получатель" : "Тест кошелька"]);
    await ensureRollWallet(client, id);
  }
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    if (req.method !== "GET" && !["http://127.0.0.1:5184", undefined].includes(req.headers.origin)) return res.sendStatus(403);
    if (req.body?.recipientId && !ids.includes(req.body.recipientId)) return res.sendStatus(403);
    next();
  });
  // Serialize complete API requests because they share the outer transaction.
  let queue = Promise.resolve();
  app.use("/api", (req, res, next) => {
    const previous = queue;
    queue = new Promise((resolve) => { res.once("finish", resolve); res.once("close", resolve); });
    previous.then(next);
  });
  app.get("/api/me", async (_req, res) => {
    const user = (await client.query('SELECT id,name,username,avatar_url AS "avatarUrl",account_type AS "accountType" FROM users WHERE id=$1', [ids[0]])).rows[0];
    res.json({ user });
  });
  registerRollsRoutes(app, {
    requireAuth: (req, _res, next) => { req.user = { id: ids[0] }; next(); },
    query: (...args) => client.query(...args),
    transaction: async (callback) => {
      await client.query("SAVEPOINT preview_request");
      try { return await callback(client); }
      catch (error) { await client.query("ROLLBACK TO SAVEPOINT preview_request"); throw error; }
    },
  });
  app.use("/api", (_req, res) => res.sendStatus(404));
  app.use(express.static(path.resolve("dist")));
  app.get("*splat", (_req, res) => res.sendFile(path.resolve("dist/index.html")));
  server = app.listen(5184, "127.0.0.1", () => console.log("Rollback UI preview: http://127.0.0.1:5184/app/rolls (production PostgreSQL, temporary fixtures)."));
  setTimeout(stop, 10 * 60_000).unref();
} catch (error) {
  console.error(error.code || error.message);
  await stop(1);
}
