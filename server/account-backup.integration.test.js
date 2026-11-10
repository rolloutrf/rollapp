import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Writable } from "node:stream";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import { verifyAccountBackupSchema, writeAccountBackup } from "./account-backup.js";

test("Yandex Disk snapshots include only the account's own wish participation", {
  skip: process.env.ROLLAPP_TEST_ACCOUNT_BACKUP !== "1",
}, async () => {
  const { productionRollsDatabase } = await import("../scripts/rolls-database.mjs");
  const db = await productionRollsDatabase();
  try {
    await db.transaction(async (client) => {
      await client.query("SET TRANSACTION READ ONLY");
      await verifyAccountBackupSchema(client);
    });

    const client = await db.pool.connect();
    const [owner, participant, otherParticipant, outsider] = Array.from({ length: 4 }, () => randomUUID());
    const accounts = [owner, participant, otherParticipant, outsider];
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
      await client.query("SET LOCAL lock_timeout='3s'");
      await client.query("SET LOCAL statement_timeout='20s'");
      await client.query("SET LOCAL idle_in_transaction_session_timeout='60s'");
      for (const id of accounts) {
        await client.query(
          "INSERT INTO users (id,email,username,name,password_hash) VALUES ($1,$2,$3,'Account backup test','unusable')",
          [id, `${id}@backup-test.invalid`, `backup-${id.slice(0, 18)}`],
        );
      }
      const wishId = randomUUID();
      await client.query("INSERT INTO wishes (id,user_id,title,privacy) VALUES ($1,$2,'Private shared wish','private')", [wishId, owner]);
      await client.query("INSERT INTO wish_participants (wish_id,user_id) VALUES ($1,$2),($1,$3)", [wishId, participant, otherParticipant]);

      const snapshot = async (userId) => {
        const chunks = [];
        // The fixture rows and the exporter share the outer rollback-only
        // transaction. Production still sets its own READ ONLY transaction.
        await writeAccountBackup({
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

      const ownerSnapshot = await snapshot(owner);
      const memberSnapshot = await snapshot(participant);
      const outsiderSnapshot = await snapshot(outsider);
      assert.deepEqual(ownerSnapshot.wish_participants.map(({ user_id }) => user_id).sort(), [participant, otherParticipant].sort());
      for (const row of ownerSnapshot.wish_participants) {
        assert.deepEqual(Object.keys(row).sort(), ["created_at", "user_id", "wish_id"]);
        assert.equal(row.wish_id, wishId);
        assert(Number.isFinite(Date.parse(row.created_at)));
      }
      assert.deepEqual(memberSnapshot.wish_participants, ownerSnapshot.wish_participants.filter(({ user_id }) => user_id === participant));
      assert.equal(ownerSnapshot.wishes[0].id, wishId);
      assert.deepEqual(memberSnapshot.wishes, []);
      assert.deepEqual(outsiderSnapshot.wish_participants, []);
      assert.deepEqual(outsiderSnapshot.wishes, []);
    } finally {
      try { await client.query("ROLLBACK"); } finally { client.release(); }
    }
    const persisted = await db.query("SELECT count(*)::int AS count FROM users WHERE id=ANY($1::text[])", [accounts]);
    assert.equal(persisted.rows[0].count, 0);
  } finally {
    await db.pool.end();
  }
});
