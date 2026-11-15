import { formatTon } from "../../../shared/modules/payments/ton.js";
import { ensureRollWallet } from "../payments/rolls.js";
import { readRollAccountingSources, readRollBalanceBreakdown, rollWalletEntries } from "../payments/roll-accounting.js";

function transactionFromRow(row) {
  return {
    id: row.id,
    kind: row.kind,
    direction: row.direction,
    amount: Number(row.amount),
    note: row.kind === "ton_topup" ? `${formatTon(String(row.note))} TON` : row.note,
    wishTitle: row.kind === "wish_reward" ? row.subject : null,
    ...(["purchase", "refund"].includes(row.kind) && { productTitle: row.subject }),
    createdAt: row.created_at,
    person: row.kind === "transfer" ? {
      id: row.person_id,
      name: row.person_name,
      username: row.person_username,
      avatarUrl: row.person_avatar_url,
    } : null,
  };
}

export async function readRollWallet(client, userId, { offset = 0, limit = 30 } = {}) {
  await ensureRollWallet(client, userId);
  const wallet = await client.query("SELECT balance FROM roll_wallets WHERE user_id=$1", [userId]);
  const sources = await readRollAccountingSources(client);
  const balances = await readRollBalanceBreakdown(client, userId, sources);
  const history = await client.query(
    `SELECT h.*,u.name AS person_name,u.username AS person_username,u.avatar_url AS person_avatar_url
     FROM (${rollWalletEntries(sources)}) h
     LEFT JOIN users u ON h.kind='transfer' AND u.id=h.person_id
     WHERE h.account_id=$1
     ORDER BY h.created_at DESC,h.id DESC LIMIT $2 OFFSET $3`,
    [userId, limit + 1, offset],
  );
  return {
    balance: Number(wallet.rows[0].balance),
    balances,
    transactions: history.rows.slice(0, limit).map(transactionFromRow),
    nextOffset: history.rowCount > limit ? offset + limit : null,
  };
}
