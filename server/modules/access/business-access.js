// Read grants and request history in one snapshot so an approval cannot
// appear as a revoked grant while a second query catches up.
export function readBusinessAccessSnapshot(query, viewerId) {
  return query(
    `SELECT a.*,u.id,u.username,u.name,u.avatar_url,u.account_type
     FROM (
       SELECT r.id AS request_id,r.sphere,r.section,r.message,r.status,r.created_at,r.updated_at,r.responded_at,r.owner_user_id
       FROM sphere_access_requests r WHERE r.requester_user_id=$1
       UNION ALL
       SELECT NULL,s.sphere,s.section,NULL,NULL,s.created_at,s.created_at,NULL,s.owner_user_id
       FROM sphere_section_shares s WHERE s.viewer_user_id=$1
     ) a
     JOIN users u ON u.id=a.owner_user_id
     ORDER BY CASE WHEN a.request_id IS NULL THEN 0 WHEN a.status='approved' THEN 1 WHEN a.status='pending' THEN 2 ELSE 3 END,a.updated_at DESC`,
    [viewerId],
  );
}
