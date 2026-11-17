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

export function readSphereShareCandidates(query, { ownerId, sphere, section, category, search }) {
  return query(
    `SELECT u.id,u.username,u.name,u.avatar_url,u.account_type,u.business_category,u.seller_space,
            s.section AS grant_section
     FROM users u
     LEFT JOIN LATERAL (
       SELECT s0.section
       FROM sphere_section_shares s0
       WHERE s0.viewer_user_id=u.id AND s0.owner_user_id=$1 AND s0.sphere=$2
         AND (s0.section=$3 OR ($2='wishlist' AND s0.section='wishlist'))
       ORDER BY (s0.section='wishlist') DESC
       LIMIT 1
     ) s ON TRUE
     WHERE u.id<>$1 AND u.account_type='business'
       AND (u.business_category=$4 OR (u.business_category IS NULL AND s.section IS NOT NULL))
       AND ($2<>'wishlist' OR u.seller_space IS NULL OR u.seller_space=$3 OR $3='wishlist')
       AND ($5='' OR LOWER(u.name) LIKE $6 OR LOWER(u.username) LIKE $6)
     ORDER BY lower(u.name),u.username,u.id`,
    [ownerId, sphere, section, category, search, `%${search}%`],
  );
}
