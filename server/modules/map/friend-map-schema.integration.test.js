import assert from "node:assert/strict";
import test from "node:test";
import { DataType, newDb } from "pg-mem";
import { friendMapSchema, verifyFriendMapSchema } from "./friend-map-schema.js";

async function createClient() {
  const memory = newDb({ autoCreateForeignKeyIndices: true });
  memory.public.registerFunction({
    name: "statement_timestamp",
    returns: DataType.timestamptz,
    implementation: () => new Date("2026-11-27T00:00:00Z"),
  });
  const adapter = memory.adapters.createPg();
  const client = new adapter.Client();
  await client.connect();
  await client.query("CREATE TABLE users (id TEXT PRIMARY KEY)");
  await client.query(friendMapSchema);
  return client;
}

test("friend map DDL applies as one additive schema and enforces consent, coordinates and pair ownership", async t => {
  const client = await createClient();
  t.after(() => client.end());
  await verifyFriendMapSchema(client);
  await client.query("INSERT INTO users (id) VALUES ('owner'),('friend')");
  await assert.rejects(client.query(`INSERT INTO friend_map_preferences
    (user_id,share_location,nearby_notifications) VALUES ('owner',false,true)`), /check constraint/i);
  await client.query(`INSERT INTO friend_map_preferences
    (user_id,share_location,nearby_notifications) VALUES ('owner',true,true),('friend',true,false)`);
  await assert.rejects(client.query(`INSERT INTO friend_map_locations
    (user_id,longitude,latitude,accuracy_meters,expires_at)
    VALUES ('owner',181,59.9,10,'2026-11-27T00:10:00Z')`), /check constraint/i);
  await client.query(`INSERT INTO friend_map_locations
    (user_id,longitude,latitude,accuracy_meters,expires_at)
    VALUES ('owner',30.3,59.9,10,'2026-11-27T00:10:00Z'),
           ('friend',30.31,59.91,20,'2026-11-27T00:10:00Z')`);
  await assert.rejects(client.query(`INSERT INTO friend_map_proximity
    (user_id,friend_id,nearby,last_distance_meters) VALUES ('owner','owner',true,900)`), /check constraint/i);
  await client.query(`INSERT INTO friend_map_proximity
    (user_id,friend_id,nearby,last_distance_meters) VALUES ('owner','friend',true,900)`);
  assert.deepEqual((await client.query(`SELECT user_id,friend_id,nearby,last_distance_meters
    FROM friend_map_proximity`)).rows, [{
    user_id: "owner", friend_id: "friend", nearby: true, last_distance_meters: 900,
  }]);
  await client.query("DELETE FROM users WHERE id='friend'");
  assert.equal((await client.query("SELECT 1 FROM friend_map_locations WHERE user_id='friend'")).rowCount, 0);
  assert.equal((await client.query("SELECT 1 FROM friend_map_proximity")).rowCount, 0);
});
