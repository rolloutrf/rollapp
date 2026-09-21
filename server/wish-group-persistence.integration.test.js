import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

test("wish edits preserve singleton groups on production PostgreSQL; all fixtures roll back", {
  skip: process.env.ROLLAPP_TEST_WISH_GROUPS !== "1",
}, async (t) => {
  const { productionRollsDatabase } = await import("../scripts/rolls-database.mjs");
  const db = await productionRollsDatabase();
  const { syncWishGroupMemberships } = await import("./wish-groups.js");
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='10s'");
    const userId = randomUUID();
    await client.query(
      "INSERT INTO users (id,email,username,name,password_hash) VALUES ($1,$2,$3,$4,$5)",
      [userId, `${userId}@wish-groups-test.invalid`, `groups-test-${userId}`, "Group persistence test", "unusable"],
    );
    const listIds = [randomUUID(), randomUUID()];
    for (const listId of listIds) {
      await client.query(
        "INSERT INTO wishlists (id,user_id,title,share_token,space) VALUES ($1,$2,$3,$4,$5)",
        [listId, userId, "Group persistence test", randomUUID(), "products"],
      );
    }
    const [single, first, second, ungrouped] = Array.from({ length: 4 }, () => randomUUID());
    for (const wishId of [single, first, second, ungrouped]) {
      await client.query("INSERT INTO wishes (id,user_id,title) VALUES ($1,$2,$3)", [wishId, userId, "Group persistence test"]);
      for (const listId of listIds) {
        await client.query("INSERT INTO wishlist_wishes (wishlist_id,wish_id) VALUES ($1,$2)", [listId, wishId]);
      }
    }
    const [singletonGroup, pairGroup, otherListGroup] = Array.from({ length: 3 }, () => randomUUID());
    for (const [groupId, listId, wishes] of [
      [singletonGroup, listIds[0], [single]],
      [pairGroup, listIds[0], [first, second]],
      [otherListGroup, listIds[1], [single]],
    ]) {
      await client.query("INSERT INTO wish_groups (id,wishlist_id,title) VALUES ($1,$2,$3)", [groupId, listId, "Saved title"]);
      for (const wishId of wishes) {
        await client.query(
          "INSERT INTO wish_group_members (group_id,wishlist_id,wish_id) VALUES ($1,$2,$3)",
          [groupId, listId, wishId],
        );
      }
    }
    const readGroups = async () => (await client.query(
      `SELECT g.id,g.title,g.wishlist_id,m.wish_id FROM wish_groups g
       JOIN wishlists l ON l.id=g.wishlist_id
       LEFT JOIN wish_group_members m ON m.group_id=g.id
       WHERE l.user_id=$1 ORDER BY g.id,m.wish_id`,
      [userId],
    )).rows;
    const editWish = async (wishId, selectedLists = listIds) => {
      await client.query("UPDATE wishes SET title=$1 WHERE id=$2", ["Edited title", wishId]);
      await client.query("DELETE FROM wishlist_wishes WHERE wish_id=$1", [wishId]);
      for (const listId of selectedLists) {
        await client.query("INSERT INTO wishlist_wishes (wishlist_id,wish_id) VALUES ($1,$2)", [listId, wishId]);
      }
      await syncWishGroupMemberships({ client, wishId, listIds: selectedLists, userId });
    };

    await t.test("editing a singleton, another grouped wish or an ungrouped wish preserves all groups", async () => {
      const before = await readGroups();
      for (const wishId of [single, first, ungrouped, single]) {
        await editWish(wishId);
        assert.deepEqual(await readGroups(), before);
      }
    });

    await t.test("removing one of two members keeps the remaining singleton and unrelated groups", async () => {
      await editWish(first, []);
      const groups = await readGroups();
      assert.deepEqual(groups.filter((row) => row.id === pairGroup).map((row) => row.wish_id), [second]);
      assert.ok(groups.some((row) => row.id === singletonGroup && row.wish_id === single));
      assert.ok(groups.some((row) => row.id === otherListGroup && row.wish_id === single));
    });

    await t.test("removing the last member deletes only the emptied group, preserving other list memberships", async () => {
      await editWish(single, [listIds[1]]);
      const groups = await readGroups();
      assert.equal(groups.some((row) => row.id === singletonGroup), false);
      assert.deepEqual(groups.filter((row) => row.id === otherListGroup).map((row) => row.wish_id), [single]);
      assert.deepEqual(groups.filter((row) => row.id === pairGroup).map((row) => row.wish_id), [second]);
      assert.equal((await client.query("SELECT id FROM wishes WHERE id=$1", [single])).rowCount, 1);
      await editWish(second, []);
      assert.equal((await readGroups()).some((row) => row.id === pairGroup), false);
    });
  } finally {
    try { await client.query("ROLLBACK"); } finally {
      client.release();
      await db.pool.end();
    }
  }
});
