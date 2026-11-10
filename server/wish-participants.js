import { maxWishParticipants } from "../shared/wish-participants.js";

export const wishParticipantsSchema = `
  CREATE TABLE IF NOT EXISTS wish_participants (
    wish_id TEXT NOT NULL REFERENCES wishes(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (wish_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_wish_participants_user ON wish_participants(user_id);
`;

export async function validateWishParticipantChanges(client, ownerId, wishId, { add, remove }) {
  if (add.includes(ownerId)) return "Вы уже владелец этого желания";
  if (add.length) {
    const placeholders = add.map((_, index) => `$${index + 1}`).join(",");
    const users = await client.query(`SELECT id FROM users WHERE id IN (${placeholders}) FOR KEY SHARE`, add);
    if (users.rowCount !== add.length) return "Один из участников больше не найден. Обновите выбор";
  }
  const current = wishId
    ? (await client.query("SELECT user_id FROM wish_participants WHERE wish_id=$1", [wishId])).rows
    : [];
  const next = new Set(current.map((row) => row.user_id));
  for (const id of remove) next.delete(id);
  for (const id of add) next.add(id);
  if (next.size > maxWishParticipants) return `Можно добавить до ${maxWishParticipants} участников`;
  return null;
}

// Called within the same transaction as the wish write, with the wish row locked on edits.
export async function applyWishParticipantChanges(client, wishId, { add, remove }) {
  for (const id of remove) {
    await client.query("DELETE FROM wish_participants WHERE wish_id=$1 AND user_id=$2", [wishId, id]);
  }
  for (const id of add) {
    await client.query(
      "INSERT INTO wish_participants (wish_id,user_id) VALUES ($1,$2) ON CONFLICT (wish_id,user_id) DO NOTHING",
      [wishId, id],
    );
  }
}

