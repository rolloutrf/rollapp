import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { test } from "node:test";
import { verifyMembershipSchema, readMembership, formatMembershipNumber } from "./membership-numbers.js";
import { createRegistrationInvite, findRegistrationInvite } from "./registration-invites.js";

test("production schema allocates unique numbers, enqueues the exact hash, and never reuses an invite", {
  skip: process.env.ROLLAPP_TEST_MEMBERSHIP !== "1",
}, async () => {
  process.env.PG_POOL_SIZE = "1";
  const { productionRollsDatabase } = await import("../scripts/rolls-database.mjs");
  const db = await productionRollsDatabase();
  const rollback = new Error("rollback test");
  const issuerId = randomUUID();
  const secret = "synthetic-membership-integration-secret";
  try {
    await db.transaction(async (client) => {
      await client.query("SET TRANSACTION READ ONLY");
      await verifyMembershipSchema(client);
    });
    await assert.rejects(db.transaction(async (client) => {
      await client.query("SET LOCAL lock_timeout='3s'");
      await client.query("SET LOCAL statement_timeout='8s'");
      const query = client.query.bind(client);
      const insert = (id, email = `${id}@membership-test.invalid`) => query(`
        INSERT INTO users(id,email,username,name,password_hash)
        VALUES($1,$2,$1,'Synthetic membership','unusable')
        ON CONFLICT (email) DO NOTHING RETURNING id
      `, [id, email]);
      const first = await query("SELECT number FROM membership_numbers WHERE claim_digest IS NULL ORDER BY draw_order LIMIT 3");
      assert.equal(first.rowCount, 3, "Run this test only with three unused numbers");
      await insert(issuerId);
      const { token } = createRegistrationInvite(issuerId, secret);
      const invite = await findRegistrationInvite(query, token, secret, { membershipEnabled: true });
      assert(invite);
      const duplicate = await insert(invite.accountId, `${issuerId}@membership-test.invalid`);
      assert.equal(duplicate.rowCount, 0);
      assert(await findRegistrationInvite(query, token, secret, { membershipEnabled: true }));
      await insert(invite.accountId);
      assert.equal(await findRegistrationInvite(query, token, secret, { membershipEnabled: true }), null);
      const row = await readMembership(query, invite.accountId);
      assert.equal(row.number, first.rows[1].number);
      assert.equal(row.digest, createHash("sha256").update(row.receipt).digest("hex"));
      const { number, nonce, accountCommitment } = JSON.parse(row.receipt);
      assert.equal(number, formatMembershipNumber(row.number));
      assert.equal(accountCommitment, createHash("sha256")
        .update(`rollapp-membership-account-v1:${invite.accountId}:${nonce}`).digest("hex"));
      assert(!row.receipt.includes(invite.accountId));
      await query("DELETE FROM users WHERE id=$1", [invite.accountId]);
      assert.equal(await findRegistrationInvite(query, token, secret, { membershipEnabled: true }), null);
      const nextId = randomUUID();
      await insert(nextId);
      assert.equal((await readMembership(query, nextId)).number, first.rows[2].number);
      throw rollback;
    }), (error) => error === rollback);
    assert.equal((await db.query("SELECT 1 FROM users WHERE id=$1", [issuerId])).rowCount, 0);
  } finally { await db.pool.end(); }
});
