export const DEFAULT_FRIEND_USERNAME = process.env.DEFAULT_FRIEND_USERNAME || "koloskof";

export async function addDefaultFriend(client, followerId) {
  await client.query(
    `INSERT INTO follows (follower_id,following_id)
     SELECT $1,target.user_id
     FROM default_follow_targets target
     WHERE target.user_id<>$1
     ON CONFLICT (follower_id,following_id) DO NOTHING`,
    [followerId],
  );
}

export async function backfillDefaultFriend(client) {
  const target = await client.query(
    "SELECT id FROM users WHERE username=$1",
    [DEFAULT_FRIEND_USERNAME],
  );
  if (!target.rowCount) return { targetFound: false };

  await client.query(
    `INSERT INTO default_follow_targets (user_id)
     VALUES ($1)
     ON CONFLICT (user_id) DO NOTHING`,
    [target.rows[0].id],
  );

  await client.query(
    `INSERT INTO follows (follower_id,following_id)
     SELECT users.id,$1
     FROM users
     WHERE users.id<>$1
     ON CONFLICT (follower_id,following_id) DO NOTHING`,
    [target.rows[0].id],
  );
  return { targetFound: true };
}
