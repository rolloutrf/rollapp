// All username allocation and renaming runs under one transaction lock, so an
// old shared address cannot be claimed by another account during a rename.
export const profileAliasesSchema = `
  CREATE TABLE IF NOT EXISTS profile_username_aliases (
    username TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_profile_username_aliases_user ON profile_username_aliases(user_id);
`;

export async function lockProfileUsernames(client, memory = false) {
  if (!memory) await client.query("SELECT pg_advisory_xact_lock(726655, 1)");
}

export async function preserveProfileUsername(client, userId, username) {
  const occupied = await client.query("SELECT user_id FROM profile_username_aliases WHERE username=$1", [username]);
  if (occupied.rowCount && occupied.rows[0].user_id !== userId) {
    const error = new Error("Такое имя профиля уже занято");
    error.code = "23505";
    throw error;
  }
  await client.query("INSERT INTO profile_username_aliases (username,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [username, userId]);
}

export async function findProfileByUsername(client, username) {
  return client.query(
    `SELECT u.* FROM users u WHERE u.username=$1
     OR u.id IN (SELECT user_id FROM profile_username_aliases WHERE username=$1)
     ORDER BY CASE WHEN u.username=$1 THEN 0 ELSE 1 END LIMIT 1`,
    [String(username).toLowerCase()],
  );
}
