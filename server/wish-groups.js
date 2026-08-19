import { query } from "./db.js";

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
