import { query } from "./db.js";

const wishGroupSpaces = new Set(["products", "places", "events", "media", "food", "transport", "pets"]);

export async function backfillWishGroupSpaces(client) {
  const result = await client.query(
    `SELECT g.id,l.space AS list_space,m.wish_id,w.space AS wish_space
     FROM wish_groups g
     JOIN wishlists l ON l.id=g.wishlist_id
     LEFT JOIN wish_group_members m ON m.group_id=g.id
     LEFT JOIN wishes w ON w.id=m.wish_id
     ORDER BY g.id,m.wish_id`,
  );
  const groups = new Map();
  for (const row of result.rows) {
    if (!groups.has(row.id)) groups.set(row.id, { ...row, wishSpaces: new Set() });
    if (wishGroupSpaces.has(row.wish_space)) groups.get(row.id).wishSpaces.add(row.wish_space);
  }
  for (const group of groups.values()) {
    const [onlyWishSpace] = group.wishSpaces;
    const space = group.wishSpaces.size === 1
      ? onlyWishSpace
      : wishGroupSpaces.has(group.list_space) ? group.list_space : "products";
    await client.query("UPDATE wish_groups SET space=$1 WHERE id=$2", [space, group.id]);
    await client.query("UPDATE wish_group_members SET space=$1 WHERE group_id=$2", [space, group.id]);
  }
  return { rowCount: groups.size };
}

export async function deleteOwnedWishGroup({ groupId, listId, userId }) {
  return query(
    `DELETE FROM wish_groups
     WHERE id=$1
       AND wishlist_id IN (
         SELECT id FROM wishlists WHERE id=$2 AND user_id=$3
       )
     RETURNING id`,
    [groupId, listId, userId],
  );
}

const isGeneralWishList = (list) => list?.title === "Мои желания" && list?.description === "Всё, чему я буду рад";

export async function moveOwnedWishGroup({
  client = { query },
  groupId,
  sourceListId,
  targetListId,
  userId,
}) {
  if (sourceListId === targetListId) return { status: 400, error: "Группа уже находится в этом списке" };
  const lists = await client.query(
    `SELECT id,title,description,space
     FROM wishlists
     WHERE user_id=$1 AND id IN ($2,$3)
     ORDER BY id
     FOR UPDATE`,
    [userId, sourceListId, targetListId],
  );
  const sourceList = lists.rows.find((list) => list.id === sourceListId);
  const targetList = lists.rows.find((list) => list.id === targetListId);
  if (!sourceList) return { status: 404, error: "Исходный список не найден" };
  if (!targetList) return { status: 404, error: "Целевой список не найден" };

  const groupResult = await client.query(
    "SELECT id,space,title FROM wish_groups WHERE id=$1 AND wishlist_id=$2 FOR UPDATE",
    [groupId, sourceListId],
  );
  if (!groupResult.rowCount) return { status: 404, error: "Группа не найдена" };
  const members = await client.query(
    "SELECT wish_id FROM wish_group_members WHERE group_id=$1 ORDER BY wish_id FOR UPDATE",
    [groupId],
  );
  const wishIds = members.rows.map((row) => row.wish_id);
  if (wishIds.length < 2) return { status: 409, error: "Группа больше не содержит достаточно желаний" };
  const group = groupResult.rows[0];
  const targetSpace = isGeneralWishList(targetList) ? group.space : targetList.space;
  const placeholders = wishIds.map((_, index) => `$${index + 3}`).join(",");
  const occupied = await client.query(
    `SELECT wish_id FROM wish_group_members
     WHERE wishlist_id=$1 AND space=$2 AND wish_id IN (${placeholders})`,
    [targetListId, targetSpace, ...wishIds],
  );
  if (occupied.rowCount) return { status: 409, error: "Одно из желаний уже находится в группе в выбранном списке" };

  for (const wishId of wishIds) {
    await client.query(
      `INSERT INTO wishlist_wishes (wishlist_id,wish_id) VALUES ($1,$2)
       ON CONFLICT (wishlist_id,wish_id) DO NOTHING`,
      [targetListId, wishId],
    );
  }
  await client.query(
    "UPDATE wish_groups SET wishlist_id=$1,space=$2 WHERE id=$3",
    [targetListId, targetSpace, groupId],
  );
  await client.query(
    "UPDATE wish_group_members SET wishlist_id=$1,space=$2 WHERE group_id=$3",
    [targetListId, targetSpace, groupId],
  );

  const removedFromSourceWishIds = [];
  for (const wishId of wishIds) {
    const stillGroupedInSource = await client.query(
      "SELECT 1 FROM wish_group_members WHERE wishlist_id=$1 AND wish_id=$2 LIMIT 1",
      [sourceListId, wishId],
    );
    if (stillGroupedInSource.rowCount) continue;
    const removed = await client.query(
      "DELETE FROM wishlist_wishes WHERE wishlist_id=$1 AND wish_id=$2 RETURNING wish_id",
      [sourceListId, wishId],
    );
    if (removed.rowCount) removedFromSourceWishIds.push(wishId);
  }
  return {
    group: {
      id: group.id,
      listId: targetListId,
      space: targetSpace,
      title: group.title,
      wishIds,
    },
    sourceListId,
    targetListId,
    removedFromSourceWishIds,
  };
}

export async function removeWishFromOwnedGroup({ client = { query }, groupId, listId, wishId, userId }) {
  const list = await client.query(
    "SELECT id FROM wishlists WHERE id=$1 AND user_id=$2 FOR UPDATE",
    [listId, userId],
  );
  if (!list.rowCount) return { status: 404, error: "Список не найден" };
  const group = await client.query(
    "SELECT id,space,title FROM wish_groups WHERE id=$1 AND wishlist_id=$2 FOR UPDATE",
    [groupId, listId],
  );
  if (!group.rowCount) return { status: 404, error: "Группа не найдена" };
  const removed = await client.query(
    `DELETE FROM wish_group_members
     WHERE group_id=$1 AND wishlist_id=$2 AND wish_id=$3
     RETURNING wish_id`,
    [groupId, listId, wishId],
  );
  if (!removed.rowCount) return { status: 404, error: "Желание не найдено в группе" };
  const remaining = await client.query(
    "SELECT wish_id FROM wish_group_members WHERE group_id=$1 ORDER BY wish_id",
    [groupId],
  );
  const dissolved = remaining.rowCount < 2;
  if (dissolved) await client.query("DELETE FROM wish_groups WHERE id=$1", [groupId]);
  return {
    dissolved,
    wishId: removed.rows[0].wish_id,
    group: dissolved ? null : {
      id: group.rows[0].id,
      listId,
      space: group.rows[0].space,
      title: group.rows[0].title,
      wishIds: remaining.rows.map((row) => row.wish_id),
    },
  };
}
