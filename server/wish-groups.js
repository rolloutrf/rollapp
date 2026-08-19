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
