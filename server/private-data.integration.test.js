import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import express from "express";
import { archivePrivateFile, importPrivateRecords, privateAssetId, sha256 } from "./private-data-import.js";
import { registerPrivateFiles } from "./private-files.js";
import { listContacts } from "./contacts.js";
import { planningContacts } from "./planning-contacts.js";

test("production private import preserves edits and deletions, verifies bytes, isolates archives and rolls back", { skip: process.env.ROLLAPP_TEST_PRIVATE_DATA !== "1" }, async () => {
  const { productionRollsDatabase } = await import("../scripts/rolls-database.mjs");
  const db = await productionRollsDatabase();
  const client = await db.pool.connect();
  const ownerId = randomUUID(), otherId = randomUUID();
  const query = client.query.bind(client);
  let server;
  try {
    await query("BEGIN");
    await query("SET LOCAL statement_timeout='15s'");
    await query("SET LOCAL lock_timeout='3s'");
    await query("SET LOCAL idle_in_transaction_session_timeout='60s'");
    for (const id of [ownerId, otherId]) {
      await query("INSERT INTO users (id,email,username,name,password_hash) VALUES ($1,$2,$3,'Synthetic owner','unusable')", [id, `${id}@private-import.invalid`, `private-${id}`]);
      await query("INSERT INTO default_follow_targets (user_id) VALUES ($1)", [id]);
    }
    const contacts = ["new", "edited", "deleted"].map(id => ({ id, name: `Synthetic ${id}`, links: [], notes: "Original note" }));
    await query("INSERT INTO contact_overrides (user_id,contact_id,name,notes,deleted_at) VALUES ($1,'edited','Human edit','Human note',NULL),($1,'deleted','Deleted by owner','Do not revive',CURRENT_TIMESTAMP)", [ownerId]);
    const before = (await query("SELECT contact_id,name,notes,deleted_at,updated_at FROM contact_overrides WHERE user_id=$1 ORDER BY contact_id", [ownerId])).rows;
    const labResults = { reports: [{ id: "synthetic-report", date: "2030-01-02", groups: [] }], trends: [], attentionItems: [] };
    const image = { contactId: "new", body: Buffer.from([0xff, 0xd8, 0xff, 0xe0]), mimeType: "image/jpeg" };
    const input = { contacts, labResults, images: [image] };
    assert.equal((await importPrivateRecords(client, ownerId, input)).insertedContacts, 1);
    assert.equal((await importPrivateRecords(client, ownerId, input)).insertedContacts, 0);
    assert.deepEqual((await query("SELECT contact_id,name,notes,deleted_at,updated_at FROM contact_overrides WHERE user_id=$1 AND contact_id IN ('edited','deleted') ORDER BY contact_id", [ownerId])).rows, before);
    const records = (await query("SELECT * FROM contact_overrides WHERE user_id=$1 ORDER BY source_order", [ownerId])).rows;
    assert.deepEqual(listContacts({ order: "source" }, records).contacts.map(contact => contact.id), ["new", "edited"]);
    assert.equal(listContacts({}, (await query("SELECT * FROM contact_overrides WHERE user_id=$1", [otherId])).rows).total, 0);
    assert.deepEqual(await planningContacts(query, otherId, ["new"]), []);
    assert.equal((await planningContacts(query, ownerId, ["new"]))[0].name, "Synthetic new");
    assert.equal((await query("SELECT content_json FROM health_lab_content WHERE user_id=$1", [ownerId])).rows[0].content_json, JSON.stringify(labResults));
    assert.equal((await query("SELECT user_id FROM health_lab_content WHERE user_id=$1", [otherId])).rowCount, 0);
    const imageId = privateAssetId(ownerId, `image:${sha256(image.body)}`);
    assert.equal((await query("SELECT image_data FROM wish_images WHERE id=$1 AND user_id=$2", [imageId, ownerId])).rows[0].image_data.equals(image.body), true);
    const file = { path: "synthetic/archive.bin", filename: "archive.bin", mimeType: "application/octet-stream", body: Buffer.from("original bytes\n\0\xff", "latin1") };
    const fileId = await archivePrivateFile(client, ownerId, file);
    assert.equal(await archivePrivateFile(client, ownerId, file), fileId);
    assert.equal((await query("SELECT id FROM private_files WHERE user_id=$1", [ownerId])).rowCount, 1);
    const app = express();
    const requireAuth = (req, res, next) => {
      const id = req.get("x-synthetic-owner");
      if (![ownerId, otherId].includes(id)) return res.sendStatus(401);
      req.user = { id }; next();
    };
    registerPrivateFiles(app, { query, requireAuth, asyncRoute: handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next) });
    app.use((_error, _req, res, _next) => res.sendStatus(500));
    server = await new Promise(resolve => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
    const origin = `http://127.0.0.1:${server.address().port}/api/me/private-files`;
    const request = (suffix, id) => fetch(`${origin}${suffix}`, { headers: id ? { "x-synthetic-owner": id } : {} });
    assert.equal((await request("", null)).status, 401);
    assert.deepEqual((await (await request("", otherId)).json()).files, []);
    assert.equal((await request(`/${fileId}`, otherId)).status, 404);
    assert.equal((await request("?owner=another", ownerId)).status, 403);
    const download = await request(`/${fileId}`, ownerId);
    assert.equal(download.status, 200);
    assert.equal(download.headers.get("cache-control"), "private, no-store");
    assert(Buffer.from(await download.arrayBuffer()).equals(file.body));
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await query("ROLLBACK");
    assert.equal((await query("SELECT id FROM users WHERE id=ANY($1::text[])", [[ownerId, otherId]])).rowCount, 0);
    client.release();
    await db.pool.end();
  }
});
