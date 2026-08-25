import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

process.env.DEMO_MODE = "true";
delete process.env.DATABASE_URL;
delete process.env.PGHOST;

const { pool, query } = await import("./db.js");
const { initializeDatabase } = await import("./schema.js");
const { backfillWishGroupSpaces, deleteOwnedWishGroup, moveOwnedWishGroup, removeWishFromOwnedGroup } = await import("./wish-groups.js");

before(initializeDatabase);
after(() => pool.end());

test("disbanding a group keeps its wishes in the list and rejects a different owner", async () => {
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
  assert.equal((await query("SELECT 1 FROM wish_groups WHERE id=$1", [groupId])).rowCount, 0);
  assert.equal((await query("SELECT 1 FROM wish_group_members WHERE group_id=$1", [groupId])).rowCount, 0);
  for (const { wish_id: wishId } of wishes) {
    assert.equal((await query("SELECT 1 FROM wishes WHERE id=$1", [wishId])).rowCount, 1);
    assert.equal((await query(
      "SELECT 1 FROM wishlist_wishes WHERE wishlist_id=$1 AND wish_id=$2",
      [list.id, wishId],
    )).rowCount, 1);
  }
});

test("removing one wish keeps a valid group and dissolves it below two members", async () => {
  const list = (await query("SELECT id,user_id FROM wishlists LIMIT 1")).rows[0];
  const groupId = randomUUID();
  const wishIds = [randomUUID(), randomUUID(), randomUUID()];
  for (const wishId of wishIds) {
    await query(
      "INSERT INTO wishes (id,user_id,title,space) VALUES ($1,$2,$3,$4)",
      [wishId, list.user_id, `Желание ${wishId}`, "products"],
    );
    await query("INSERT INTO wishlist_wishes (wishlist_id,wish_id) VALUES ($1,$2)", [list.id, wishId]);
  }
  await query("INSERT INTO wish_groups (id,wishlist_id,space) VALUES ($1,$2,$3)", [groupId, list.id, "products"]);
  for (const wishId of wishIds) {
    await query(
      "INSERT INTO wish_group_members (group_id,wishlist_id,space,wish_id) VALUES ($1,$2,$3,$4)",
      [groupId, list.id, "products", wishId],
    );
  }

  const denied = await removeWishFromOwnedGroup({
    groupId,
    listId: list.id,
    wishId: wishIds[2],
    userId: randomUUID(),
  });
  assert.deepEqual(denied, { status: 404, error: "Список не найден" });

  const missing = await removeWishFromOwnedGroup({
    groupId,
    listId: list.id,
    wishId: randomUUID(),
    userId: list.user_id,
  });
  assert.deepEqual(missing, { status: 404, error: "Желание не найдено в группе" });

  const kept = await removeWishFromOwnedGroup({
    groupId,
    listId: list.id,
    wishId: wishIds[2],
    userId: list.user_id,
  });
  assert.equal(kept.dissolved, false);
  assert.deepEqual(new Set(kept.group.wishIds), new Set(wishIds.slice(0, 2)));
  assert.equal((await query("SELECT 1 FROM wish_groups WHERE id=$1", [groupId])).rowCount, 1);

  const dissolved = await removeWishFromOwnedGroup({
    groupId,
    listId: list.id,
    wishId: wishIds[0],
    userId: list.user_id,
  });
  assert.equal(dissolved.dissolved, true);
  assert.equal(dissolved.group, null);
  assert.equal((await query("SELECT 1 FROM wish_groups WHERE id=$1", [groupId])).rowCount, 0);
  for (const wishId of wishIds) {
    assert.equal((await query(
      "SELECT 1 FROM wishlist_wishes WHERE wishlist_id=$1 AND wish_id=$2",
      [list.id, wishId],
    )).rowCount, 1);
  }
});

test("moving a group transfers its members and rejects occupied target groups", async () => {
  const owner = (await query("SELECT id FROM users LIMIT 1")).rows[0];
  const sourceListId = randomUUID();
  const targetListId = randomUUID();
  await query(
    "INSERT INTO wishlists (id,user_id,title,share_token,space) VALUES ($1,$2,$3,$4,$5),($6,$2,$7,$8,$9)",
    [sourceListId, owner.id, "Покупки", randomUUID(), "products", targetListId, "События", randomUUID(), "events"],
  );
  const wishIds = [randomUUID(), randomUUID()];
  const blockerWishId = randomUUID();
  for (const wishId of [...wishIds, blockerWishId]) {
    await query(
      "INSERT INTO wishes (id,user_id,title,space) VALUES ($1,$2,$3,$4)",
      [wishId, owner.id, `Желание ${wishId}`, "products"],
    );
  }
  for (const wishId of wishIds) {
    await query("INSERT INTO wishlist_wishes (wishlist_id,wish_id) VALUES ($1,$2)", [sourceListId, wishId]);
  }
  const groupId = randomUUID();
  await query("INSERT INTO wish_groups (id,wishlist_id,space,title) VALUES ($1,$2,$3,$4)", [groupId, sourceListId, "products", "Выходные"]);
  for (const wishId of wishIds) {
    await query(
      "INSERT INTO wish_group_members (group_id,wishlist_id,space,wish_id) VALUES ($1,$2,$3,$4)",
      [groupId, sourceListId, "products", wishId],
    );
  }

  const occupiedGroupId = randomUUID();
  for (const wishId of [wishIds[0], blockerWishId]) {
    await query("INSERT INTO wishlist_wishes (wishlist_id,wish_id) VALUES ($1,$2)", [targetListId, wishId]);
  }
  await query("INSERT INTO wish_groups (id,wishlist_id,space) VALUES ($1,$2,$3)", [occupiedGroupId, targetListId, "events"]);
  for (const wishId of [wishIds[0], blockerWishId]) {
    await query(
      "INSERT INTO wish_group_members (group_id,wishlist_id,space,wish_id) VALUES ($1,$2,$3,$4)",
      [occupiedGroupId, targetListId, "events", wishId],
    );
  }

  const denied = await moveOwnedWishGroup({
    groupId,
    sourceListId,
    targetListId,
    userId: randomUUID(),
  });
  assert.deepEqual(denied, { status: 404, error: "Исходный список не найден" });
  const conflict = await moveOwnedWishGroup({
    groupId,
    sourceListId,
    targetListId,
    userId: owner.id,
  });
  assert.deepEqual(conflict, { status: 409, error: "Одно из желаний уже находится в группе в выбранном списке" });
  assert.equal((await query("SELECT wishlist_id FROM wish_groups WHERE id=$1", [groupId])).rows[0].wishlist_id, sourceListId);

  await query("DELETE FROM wish_groups WHERE id=$1", [occupiedGroupId]);
  const moved = await moveOwnedWishGroup({
    groupId,
    sourceListId,
    targetListId,
    userId: owner.id,
  });
  assert.deepEqual(moved.group, {
    id: groupId,
    listId: targetListId,
    space: "events",
    title: "Выходные",
    wishIds: [...wishIds].sort(),
  });
  assert.deepEqual(new Set(moved.removedFromSourceWishIds), new Set(wishIds));
  assert.deepEqual(
    new Set((await query("SELECT wishlist_id,space FROM wish_group_members WHERE group_id=$1", [groupId])).rows.map((row) => `${row.wishlist_id}:${row.space}`)),
    new Set([`${targetListId}:events`]),
  );
  for (const wishId of wishIds) {
    assert.equal((await query("SELECT 1 FROM wishlist_wishes WHERE wishlist_id=$1 AND wish_id=$2", [sourceListId, wishId])).rowCount, 0);
    assert.equal((await query("SELECT 1 FROM wishlist_wishes WHERE wishlist_id=$1 AND wish_id=$2", [targetListId, wishId])).rowCount, 1);
  }
});

test("legacy groups and members are backfilled from a unanimous wish space", async () => {
  const list = (await query("SELECT id,user_id FROM wishlists LIMIT 1")).rows[0];
  const groupId = randomUUID();
  const wishIds = [randomUUID(), randomUUID()];
  for (const wishId of wishIds) {
    await query(
      "INSERT INTO wishes (id,user_id,title,space) VALUES ($1,$2,$3,$4)",
      [wishId, list.user_id, `Транспорт ${wishId}`, "transport"],
    );
  }
  await query("INSERT INTO wish_groups (id,wishlist_id) VALUES ($1,$2)", [groupId, list.id]);
  for (const wishId of wishIds) {
    await query(
      "INSERT INTO wish_group_members (group_id,wishlist_id,wish_id) VALUES ($1,$2,$3)",
      [groupId, list.id, wishId],
    );
  }

  await backfillWishGroupSpaces({ query });

  assert.equal((await query("SELECT space FROM wish_groups WHERE id=$1", [groupId])).rows[0].space, "transport");
  assert.deepEqual(
    new Set((await query("SELECT space FROM wish_group_members WHERE group_id=$1", [groupId])).rows.map((row) => row.space)),
    new Set(["transport"]),
  );
});
