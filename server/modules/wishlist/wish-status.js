export function updateOwnedWishStatus(query, userId, wishId, requestedStatus) {
  return requestedStatus
    ? query("UPDATE wishes SET status=$3 WHERE id=$1 AND user_id=$2 RETURNING status", [wishId, userId, requestedStatus])
    : query("UPDATE wishes SET status=CASE WHEN status='fulfilled' THEN 'active' ELSE 'fulfilled' END WHERE id=$1 AND user_id=$2 RETURNING status", [wishId, userId]);
}
