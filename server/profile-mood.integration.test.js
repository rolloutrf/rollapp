import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Writable } from "node:stream";
import { gunzipSync } from "node:zlib";
import { writeAccountBackup } from "./account-backup.js";
import { productionRollsDatabase } from "../scripts/rolls-database.mjs";
import { checkProfileMoodSchema, publicMood, readProfileMood, saveProfileMood } from "./profile-mood.js";

test("production mood journal: owner isolation, ordering, pagination, replay and visibility (rollback only)", { skip: process.env.ROLLAPP_TEST_MOOD !== "1" }, async () => {
  const { pool } = await productionRollsDatabase();
  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout='3s'");
      await client.query("SET LOCAL statement_timeout='15s'");
      await checkProfileMoodSchema(client);
      const [owner, visitor] = [randomUUID(), randomUUID()];
      for (const id of [owner, visitor]) await client.query(
        "INSERT INTO users(id,email,username,name,password_hash) VALUES ($1,$2,$3,$4,'unusable-test-password')",
        [id, `${id}@example.invalid`, `mood-${id.slice(0, 24)}`, "Проверка журнала"],
      );
      const empty = { level: null, published: false, publicMood: null, entries: [], nextBefore: null };
      assert.deepEqual(await readProfileMood(client, owner), empty);
      assert.equal((await saveProfileMood(client, owner, { published: true })).status, 400);
      const first = { level: 1, requestId: randomUUID() };
      const privateMark = await saveProfileMood(client, owner, { published: false, entry: first });
      assert.equal(privateMark.publicMood, null);
      assert.equal(privateMark.entries[0].level, 1);
      const publication = await saveProfileMood(client, owner, { entry: { level: 1, requestId: randomUUID() } });
      assert.equal(publication.entries.length, 2);
      assert.equal(publication.publicMood, 1);
      const replay = await saveProfileMood(client, owner, { entry: first });
      assert.deepEqual(replay, publication);
      assert.equal((await saveProfileMood(client, owner, { published: true, entry: { ...first, level: 5 } })).status, 409);
      for (let i = 0; i < 22; i++) {
        await saveProfileMood(client, owner, { entry: { requestId: randomUUID(), level: 5 } });
      }
      assert.deepEqual(await readProfileMood(client, visitor), empty);
      const firstPage = await readProfileMood(client, owner);
      const secondPage = await readProfileMood(client, owner, firstPage.nextBefore);
      assert.equal(firstPage.publicMood, 5);
      assert.equal(firstPage.entries.length, 20);
      assert.equal(secondPage.entries.length, 4);
      assert.equal(secondPage.nextBefore, null);
      const entries = [...firstPage.entries, ...secondPage.entries];
      assert.equal(entries.at(-1).id, privateMark.entries[0].id);
      assert(entries.every((entry, index) => entry.recordedAt instanceof Date && (!index || BigInt(entry.id) < BigInt(entries[index - 1].id))));
      const neutral = await saveProfileMood(client, owner, { published: true, entry: { requestId: randomUUID(), level: 3 } });
      assert.equal(neutral.level, 3);
      assert.equal(neutral.entries[0].level, 3);
      assert.equal(neutral.publicMood, null);
      assert.equal(neutral.published, false);
      const { rows: [row] } = await client.query("SELECT mood_level,mood_public FROM users WHERE id=$1", [owner]);
      assert.equal(row.mood_level, 3);
      assert.equal(publicMood(row), null);

      const readBackup = async (userId) => {
        const chunks = [];
        await writeAccountBackup({
          // The uncommitted fixture is only visible inside this transaction.
          transaction: (exportSnapshot) => exportSnapshot({
            query: (sql, params) => sql === "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"
              ? Promise.resolve()
              : client.query(sql, params),
          }),
          userId,
          createdAt: new Date().toISOString(),
          output: new Writable({ write(chunk, _encoding, done) { chunks.push(chunk); done(); } }),
          signal: AbortSignal.timeout(30_000),
        });
        return JSON.parse(gunzipSync(Buffer.concat(chunks))).tables;
      };
      const ownerBackup = await readBackup(owner);
      const visitorBackup = await readBackup(visitor);
      assert.equal(ownerBackup.users[0].mood_level, 3);
      assert.equal(ownerBackup.users[0].mood_public, false);
      assert.equal(ownerBackup.user_mood_entries.length, 25);
      assert(ownerBackup.user_mood_entries.every((entry) => entry.user_id === owner && !("request_id" in entry)));
      assert.deepEqual(visitorBackup.user_mood_entries, []);
    } finally {
      try { await client.query("ROLLBACK"); } finally { client.release(); }
    }
  } finally { await pool.end(); }
});
