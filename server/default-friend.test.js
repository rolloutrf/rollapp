import assert from "node:assert/strict";
import { test } from "node:test";
import { newDb } from "pg-mem";
import { addDefaultFriend, backfillDefaultFriend, DEFAULT_FRIEND_USERNAME } from "./default-friend.js";

async function createClient() {
  const memory = newDb({ autoCreateForeignKeyIndices: true });
  const adapter = memory.adapters.createPg();
  const client = new adapter.Client();
  await client.connect();
  await client.query(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE
    );
    CREATE TABLE default_follow_targets (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE follows (
      follower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      following_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (follower_id,following_id)
    );
  `);
  return client;
}

test("backfill makes koloskof the default friend for every existing user", async (t) => {
  const client = await createClient();
  t.after(() => client.end());
  await client.query(
    "INSERT INTO users (id,username) VALUES ($1,$2),($3,$4),($5,$6)",
    ["mikhail", DEFAULT_FRIEND_USERNAME, "alisa", "alisa", "max", "max"],
  );

  const first = await backfillDefaultFriend(client);
  assert.deepEqual(first, { targetFound: true });
  assert.deepEqual(
    (await client.query("SELECT follower_id,following_id FROM follows ORDER BY follower_id")).rows,
    [
      { follower_id: "alisa", following_id: "mikhail" },
      { follower_id: "max", following_id: "mikhail" },
    ],
  );

  const repeated = await backfillDefaultFriend(client);
  assert.deepEqual(repeated, { targetFound: true });
  assert.equal((await client.query("SELECT 1 FROM follows")).rowCount, 2);

  await client.query("UPDATE users SET username=$1 WHERE id=$2", ["new-koloskof-address", "mikhail"]);
  await client.query("INSERT INTO users (id,username) VALUES ($1,$2)", ["new-user", "new-user"]);
  await addDefaultFriend(client, "new-user");
  assert.deepEqual(
    (await client.query("SELECT following_id FROM follows WHERE follower_id=$1", ["new-user"])).rows,
    [{ following_id: "mikhail" }],
  );
});

test("new users follow koloskof once while koloskof never follows himself", async (t) => {
  const client = await createClient();
  t.after(() => client.end());
  await client.query(
    "INSERT INTO users (id,username) VALUES ($1,$2),($3,$4)",
    ["mikhail", DEFAULT_FRIEND_USERNAME, "new-user", "new-user"],
  );
  await client.query("INSERT INTO default_follow_targets (user_id) VALUES ($1)", ["mikhail"]);

  await addDefaultFriend(client, "new-user");
  await addDefaultFriend(client, "new-user");
  await addDefaultFriend(client, "mikhail");
  assert.deepEqual(
    (await client.query("SELECT follower_id,following_id FROM follows")).rows,
    [{ follower_id: "new-user", following_id: "mikhail" }],
  );
});

test("default friendship waits safely when the koloskof profile is absent", async (t) => {
  const client = await createClient();
  t.after(() => client.end());
  await client.query("INSERT INTO users (id,username) VALUES ($1,$2)", ["alisa", "alisa"]);

  assert.deepEqual(await backfillDefaultFriend(client), { targetFound: false });
  await addDefaultFriend(client, "alisa");
  assert.equal((await client.query("SELECT 1 FROM follows")).rowCount, 0);
});
