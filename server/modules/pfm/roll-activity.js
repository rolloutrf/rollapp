import { z } from "zod";
import { ROLL_ACTIVITY_GROUPS, ROLL_ACTIVITY_PERIODS, ROLL_ACTIVITY_TIME_ZONE } from "../../../shared/modules/pfm/roll-activity.js";
import { rollTransactionFromRow } from "../history/wallet-history.js";
import { readRollAccountingSources, rollWalletEntries } from "../payments/roll-accounting.js";

const period = z.preprocess((value) => typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value,
  z.literal(ROLL_ACTIVITY_PERIODS).default(30));
const timestamp = z.iso.datetime().refine((value) => Number(value.slice(0, 4)) >= 1970);
export const rollActivityQuery = z.object({ days: period }).strict();
export const rollActivityEntriesQuery = z.object({
  days: period,
  asOf: timestamp,
  group: z.enum(Object.keys(ROLL_ACTIVITY_GROUPS)).optional(),
  before: timestamp.optional(),
  beforeId: z.string().min(1).max(250).optional(),
}).strict().refine(({ before, beforeId }) => Boolean(before) === Boolean(beforeId));

const utcTimestamp = `to_char(%s AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
const isoTime = (column) => utcTimestamp.replace("%s", column);

function activitySql(sources) {
  return `WITH cutoff AS (
    SELECT LEAST(COALESCE($3::timestamptz,statement_timestamp()),statement_timestamp()) AS as_of
  ), dates AS (
    SELECT (as_of AT TIME ZONE '${ROLL_ACTIVITY_TIME_ZONE}')::date AS ending_on,as_of FROM cutoff
  ), bounds AS (
    SELECT ending_on-$2::int+1 AS starting_on,ending_on,as_of FROM dates
  ), movements AS (
    SELECT e.*,
      CASE
        WHEN e.kind IN ('market_reserve','market_refund') THEN 'orderReserves'
        WHEN e.kind IN ('purchase','refund','market_sale') OR invoice.id IS NOT NULL THEN 'payments'
        WHEN e.kind='transfer' THEN 'transfers'
        WHEN e.kind IN ('welcome','manual_grant','wish_reward') THEN 'bonuses'
        WHEN e.kind IN ('need_reward','need_reserve','need_refund') THEN 'rewards'
        WHEN e.kind='gift_topup' THEN 'gifts'
        WHEN e.kind IN ('stars_topup','ton_topup') THEN 'topups'
        ELSE 'other'
      END AS activity_group
    FROM bounds b
    CROSS JOIN (${rollWalletEntries(sources)}) e
    LEFT JOIN roll_transactions t ON e.kind='transfer' AND e.id=t.id
    LEFT JOIN roll_transactions original ON t.idempotency_key LIKE 'reverse:%'
      AND original.id=substring(t.idempotency_key FROM 9)
      AND original.sender_id=t.recipient_id AND original.recipient_id=t.sender_id AND original.amount=t.amount
    LEFT JOIN business_personal_offers invoice ON invoice.id=CASE
      WHEN COALESCE(original.idempotency_key,t.idempotency_key) ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
      THEN COALESCE(original.idempotency_key,t.idempotency_key)::uuid END
      AND invoice.purchase_id IS NOT NULL
      AND invoice.recipient_id=COALESCE(original.sender_id,t.sender_id)
      AND invoice.business_user_id=COALESCE(original.recipient_id,t.recipient_id)
      AND invoice.price_rolls=t.amount
    WHERE e.account_id=$1 AND e.created_at<=b.as_of
      AND e.created_at>=b.starting_on::timestamp AT TIME ZONE '${ROLL_ACTIVITY_TIME_ZONE}'
  )`;
}

export async function readRollActivity(client, userId, { days }) {
  const sources = await readRollAccountingSources(client);
  const { rows } = await client.query(`${activitySql(sources)}
    SELECT b.starting_on::text AS "startsOn",b.ending_on::text AS "endsOn",${isoTime("b.as_of")} AS "asOf",
      movements.activity_group AS "group",COUNT(movements.id)::int AS count,
      COALESCE(SUM(amount) FILTER (WHERE direction='incoming'),0)::text AS received,
      COALESCE(SUM(amount) FILTER (WHERE direction='outgoing'),0)::text AS debited
    FROM bounds b LEFT JOIN movements ON TRUE
    GROUP BY b.starting_on,b.ending_on,b.as_of,movements.activity_group`, [userId, days, null]);
  const { startsOn, endsOn, asOf } = rows[0];
  const groups = rows.filter((row) => row.group).map(({ group, count, received, debited }) => ({ group, count, received, debited }));
  let received = 0n;
  let debited = 0n;
  let count = 0;
  for (const row of groups) {
    received += BigInt(row.received);
    debited += BigInt(row.debited);
    count += row.count;
  }
  return {
    period: { days, startsOn, endsOn, asOf, timeZone: ROLL_ACTIVITY_TIME_ZONE },
    totals: { received: String(received), debited: String(debited), change: String(received - debited), count },
    groups,
  };
}

export async function readRollActivityEntries(client, userId, { days, asOf, group, before, beforeId }) {
  const sources = await readRollAccountingSources(client);
  const limit = 30;
  const { rows } = await client.query(`${activitySql(sources)}
    SELECT m.*,u.name AS person_name,u.username AS person_username,u.avatar_url AS person_avatar_url,
      ${isoTime("m.created_at")} AS cursor_at
    FROM movements m LEFT JOIN users u ON m.kind='transfer' AND u.id=m.person_id
    WHERE ($4::text IS NULL OR m.activity_group=$4)
      AND ($5::timestamptz IS NULL OR (m.created_at,m.id)<($5::timestamptz,$6::text))
    ORDER BY m.created_at DESC,m.id DESC LIMIT $7`, [userId, days, asOf, group ?? null, before ?? null, beforeId ?? null, limit + 1]);
  const last = rows[limit - 1];
  return {
    transactions: rows.slice(0, limit).map(rollTransactionFromRow),
    next: rows.length > limit ? { before: last.cursor_at, beforeId: last.id } : null,
  };
}
