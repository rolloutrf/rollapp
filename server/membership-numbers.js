export const membershipFull = { error: "Все 30 000 номеров Rollapp уже выданы", code: "MEMBERSHIP_FULL" };

export function formatMembershipNumber(value) {
  return Number.isInteger(value) && value >= 1 && value <= 30_000 ? String(value).padStart(5, "0") : null;
}

export async function verifyMembershipSchema(client) {
  await client.query("SELECT number,draw_order,user_id,claim_digest FROM membership_numbers LIMIT 0");
  await client.query("SELECT number,receipt,digest,wallet,seqno,expires_at,boc,tx_hash,tx_lt,lease_token,next_attempt_at FROM membership_ton_anchors LIMIT 0");
  const { rows: [check] } = await client.query(`
    SELECT (SELECT count(*) = 30000 FROM membership_numbers) AS slots_ready,
      NOT EXISTS (SELECT 1 FROM users u WHERE NOT EXISTS (SELECT 1 FROM membership_numbers n WHERE n.user_id=u.id)) AS users_ready,
      EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='users'::regclass AND tgname='rollapp_membership_on_insert' AND tgenabled IN ('O','A')) AS trigger_ready
  `);
  if (!check.slots_ready || !check.users_ready || !check.trigger_ready) {
    throw new Error("Rollapp membership migration is incomplete.");
  }
}

export async function hasFreeMembershipNumber(query, enabled) {
  return !enabled || (await query("SELECT 1 FROM membership_numbers WHERE claim_digest IS NULL LIMIT 1")).rowCount > 0;
}

export async function readMembershipNumber(query, userId) {
  const { rows: [row] } = await query("SELECT number FROM membership_numbers WHERE user_id=$1", [userId]);
  return formatMembershipNumber(row?.number);
}

export async function readMembership(query, userId) {
  return (await query(`
    SELECT n.number, a.receipt, a.digest, a.wallet, a.tx_hash, a.tx_lt
    FROM membership_numbers n LEFT JOIN membership_ton_anchors a USING (number)
    WHERE n.user_id=$1`, [userId])).rows[0];
}
