import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

process.env.DEMO_MODE = "true";
delete process.env.DATABASE_URL;
delete process.env.PGHOST;

const { pool, query } = await import("./db.js");
const { initializeDatabase } = await import("./schema.js");
const { deleteOwnedWishGroup } = await import("./wish-groups.js");

before(initializeDatabase);
after(() => pool.end());

test("deleting a group keeps its wishes and rejects a different owner", async () => {
  const list = (await query("SELECT id,user_id FROM wishlists LIMIT 1")).rows[0];
  const wishes = (await query(
    "SELECT wish_id FROM wishlist_wishes WHERE wishlist_id=$1 LIMIT 2",
    [list.id],
  )).rows;
  assert.equal(wishes.length, 2);

  const groupId = randomUUID();
  await query("INSERT INTO wish_groups (id,wishlist_id) VALUES ($1,$2)", [groupId, list.id]);
  for (const { wish_id: wishId } of wishes) {
    await query(
      "INSERT INTO wish_group_members (group_id,wishlist_id,wish_id) VALUES ($1,$2,$3)",
      [groupId, list.id, wishId],
    );
  }

  const denied = await deleteOwnedWishGroup({ groupId, listId: list.id, userId: randomUUID() });
  assert.equal(denied.rowCount, 0);

  const deleted = await deleteOwnedWishGroup({ groupId, listId: list.id, userId: list.user_id });
  assert.equal(deleted.rowCount, 1);
  assert.equal((await query("SELECT 1 FROM wish_group_members WHERE group_id=$1", [groupId])).rowCount, 0);
  for (const { wish_id: wishId } of wishes) {
    assert.equal((await query("SELECT 1 FROM wishes WHERE id=$1", [wishId])).rowCount, 1);
  }
});
