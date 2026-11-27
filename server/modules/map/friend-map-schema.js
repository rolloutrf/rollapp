export const FRIEND_LOCATION_TTL_MINUTES = 10;

// Additive schema only. Production installs it through scripts/migrate-friend-map.mjs;
// runtime startup never applies it in verify mode.
export const friendMapSchema = `
CREATE TABLE IF NOT EXISTS friend_map_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  share_location BOOLEAN NOT NULL DEFAULT FALSE,
  nearby_notifications BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
  CHECK (share_location OR NOT nearby_notifications)
);
CREATE TABLE IF NOT EXISTS friend_map_locations (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  accuracy_meters DOUBLE PRECISION NOT NULL CHECK (accuracy_meters BETWEEN 0 AND 5000),
  observed_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
  expires_at TIMESTAMPTZ NOT NULL,
  CHECK (expires_at > observed_at)
);
CREATE INDEX IF NOT EXISTS friend_map_locations_fresh
  ON friend_map_locations (expires_at DESC);
CREATE TABLE IF NOT EXISTS friend_map_proximity (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nearby BOOLEAN NOT NULL DEFAULT FALSE,
  last_distance_meters INTEGER NOT NULL CHECK (last_distance_meters >= 0),
  last_entered_at TIMESTAMPTZ,
  last_notified_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY (user_id, friend_id),
  CHECK (user_id <> friend_id)
);
CREATE INDEX IF NOT EXISTS friend_map_proximity_friend
  ON friend_map_proximity (friend_id, user_id);
`;

export async function verifyFriendMapSchema(client) {
  await client.query(`SELECT user_id,share_location,nearby_notifications,updated_at
    FROM friend_map_preferences LIMIT 0`);
  await client.query(`SELECT user_id,longitude,latitude,accuracy_meters,observed_at,expires_at
    FROM friend_map_locations LIMIT 0`);
  await client.query(`SELECT user_id,friend_id,nearby,last_distance_meters,last_entered_at,
    last_notified_at,updated_at FROM friend_map_proximity LIMIT 0`);
}

export async function friendMapSchemaAvailable(transaction, { required = false, onMissing } = {}) {
  return transaction(async client => {
    await client.query("SET TRANSACTION READ ONLY");
    const { rows: [schema] } = await client.query(`SELECT
      to_regclass('friend_map_preferences') IS NOT NULL AS preferences,
      to_regclass('friend_map_locations') IS NOT NULL AS locations,
      to_regclass('friend_map_proximity') IS NOT NULL AS proximity`);
    const tables = [schema.preferences, schema.locations, schema.proximity];
    if (tables.some(Boolean) && !tables.every(Boolean)) throw new Error("Incomplete friend map schema");
    if (!tables.every(Boolean)) {
      if (required) throw new Error("Friend map schema is not installed");
      onMissing?.();
      return false;
    }
    await verifyFriendMapSchema(client);
    return true;
  });
}
