import { formatTon } from "../../../shared/modules/payments/ton.js";
import { ensureRollWallet } from "../payments/rolls.js";

function transactionFromRow(row, userId) {
  const outgoing = row.sender_id === userId;
  return {
    id: row.id,
    kind: row.kind,
    direction: outgoing ? "outgoing" : "incoming",
    amount: Number(row.amount),
    note: row.kind === "ton_topup" ? `${formatTon(String(row.note))} TON` : row.note,
    wishTitle: row.wish_title || null,
    createdAt: row.created_at,
    person: row.kind === "transfer" ? {
      id: outgoing ? row.recipient_id : row.sender_id,
      name: row.person_name,
      username: row.person_username,
      avatarUrl: row.person_avatar_url,
    } : null,
  };
}

export async function readRollWallet(client, userId, { offset = 0, limit = 30, needRewards = false } = {}) {
  // Locking also gives a consistent balance/history snapshot at READ COMMITTED.
  await ensureRollWallet(client, userId);
  const wallet = await client.query("SELECT balance FROM roll_wallets WHERE user_id=$1", [userId]);
  const giftSchema = await client.query("SELECT to_regclass('business_gift_card_events')::text AS events");
  const giftHistory = giftSchema.rows[0]?.events ? `
       UNION ALL
       SELECT e.id,'gift_topup' AS kind,e.actor_id AS sender_id,NULL::text AS recipient_id,
              e.amount,u.name AS note,NULL::text AS wish_title,e.created_at
       FROM business_gift_card_events e JOIN business_gift_cards c ON c.id=e.card_id
       JOIN users u ON u.id=c.business_id WHERE e.actor_id=$1 AND e.kind='topup'
  ` : "";
  const history = await client.query(
    `WITH history AS (
       SELECT id,kind,sender_id,recipient_id,amount,note,NULL::text AS wish_title,created_at
       FROM roll_transactions WHERE sender_id=$1 OR recipient_id=$1
       UNION ALL
       SELECT id,'wish_reward' AS kind,NULL::text AS sender_id,user_id AS recipient_id,
              amount,'' AS note,wish_title,created_at
       FROM roll_wish_rewards WHERE user_id=$1
       UNION ALL
       SELECT id,'manual_grant' AS kind,NULL::text AS sender_id,user_id AS recipient_id,
              amount,reason AS note,NULL::text AS wish_title,created_at
       FROM roll_manual_grants WHERE user_id=$1
       UNION ALL
       SELECT id,'stars_topup' AS kind,NULL::text AS sender_id,user_id AS recipient_id,
              rolls AS amount,stars::text || ' Telegram Stars' AS note,NULL::text AS wish_title,paid_at AS created_at
       FROM roll_star_orders WHERE user_id=$1 AND paid_at IS NOT NULL
       UNION ALL
       SELECT id,'ton_topup' AS kind,NULL::text AS sender_id,user_id AS recipient_id,
              rolls AS amount,nanotons::text AS note,NULL::text AS wish_title,paid_at AS created_at
       FROM roll_ton_orders WHERE user_id=$1 AND paid_at IS NOT NULL
       ${giftHistory}
       ${needRewards ? `UNION ALL
       SELECT e.id::text,'need_' || e.kind AS kind,
              CASE WHEN e.kind='reserve' THEN e.user_id ELSE NULL END AS sender_id,
              e.user_id AS recipient_id,e.amount,n.title AS note,NULL::text AS wish_title,e.created_at
       FROM reward_need_entries e JOIN reward_need_offers o ON o.id=e.offer_id
       JOIN reward_needs n ON n.id=o.need_id WHERE e.user_id=$1` : ""}
     )
     SELECT h.*,u.name AS person_name,u.username AS person_username,u.avatar_url AS person_avatar_url
     FROM history h
     LEFT JOIN users u ON h.kind='transfer'
       AND u.id=CASE WHEN h.sender_id=$1 THEN h.recipient_id ELSE h.sender_id END
     ORDER BY h.created_at DESC,h.id DESC LIMIT $2 OFFSET $3`,
    [userId, limit + 1, offset],
  );
  return {
    balance: Number(wallet.rows[0].balance),
    transactions: history.rows.slice(0, limit).map((row) => transactionFromRow(row, userId)),
    nextOffset: history.rowCount > limit ? offset + limit : null,
  };
}
