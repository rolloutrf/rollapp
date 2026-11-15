import { hasMarketplaceSettlementSchema } from "../checkout/marketplace-settlements-schema.js";

// Older schemas may predate whole products. A partially present ledger is
// an error because its missing relations could hide real roll movements.
export async function readRollAccountingSources(client) {
  const { rows: [sources] } = await client.query(`
    SELECT to_regclass('business_gift_cards') IS NOT NULL AS cards,
           to_regclass('business_gift_card_events') IS NOT NULL AS card_events,
           to_regclass('reward_needs') IS NOT NULL AS needs,
           to_regclass('reward_need_offers') IS NOT NULL AS need_offers,
           to_regclass('reward_need_entries') IS NOT NULL AS need_entries
  `);
  if (sources.cards !== sources.card_events ||
      sources.needs !== sources.need_offers || sources.needs !== sources.need_entries) {
    throw new Error("The rolls accounting schema contains an incomplete source.");
  }
  return { gifts: sources.cards, rewards: sources.need_entries, marketplace: await hasMarketplaceSettlementSchema(client) };
}

// Personal offers already post a transfer, and restricted gift card purchases
// post to the card's journal. Only ordinary orders debit the wallet separately.
const ordinaryOrder = "delivery->>'personalOfferId' IS NULL AND delivery->>'giftCardId' IS NULL";

export function rollWalletEntries({ gifts, rewards, marketplace }) {
  return `
    SELECT id,kind,recipient_id AS account_id,sender_id AS person_id,amount,note,
           NULL::text AS subject,created_at,'incoming' AS direction
      FROM roll_transactions
    UNION ALL
    SELECT id,kind,sender_id,recipient_id,amount,note,NULL,created_at,'outgoing'
      FROM roll_transactions WHERE sender_id IS NOT NULL
    UNION ALL
    SELECT id,'wish_reward',user_id,NULL,amount,'',wish_title,created_at,'incoming'
      FROM roll_wish_rewards
    UNION ALL
    SELECT id,'manual_grant',user_id,NULL,amount,reason,NULL,created_at,'incoming'
      FROM roll_manual_grants
    UNION ALL
    SELECT id,'stars_topup',user_id,NULL,rolls,stars::text || ' Telegram Stars',NULL,paid_at,'incoming'
      FROM roll_star_orders WHERE paid_at IS NOT NULL
    UNION ALL
    SELECT id,'ton_topup',user_id,NULL,rolls,nanotons::text,NULL,paid_at,'incoming'
      FROM roll_ton_orders WHERE paid_at IS NOT NULL
    UNION ALL
    SELECT 'purchase:' || id,'purchase',user_id,NULL,amount,'',product_title,created_at,'outgoing'
      FROM roll_store_purchases WHERE ${ordinaryOrder}
    UNION ALL
    SELECT 'refund:' || id,'refund',user_id,NULL,amount,'',product_title,refunded_at,'incoming'
      FROM roll_store_purchases WHERE ${ordinaryOrder} AND refunded_at IS NOT NULL
    ${gifts ? `UNION ALL
    SELECT e.id,'gift_topup',e.actor_id,NULL,e.amount,u.name,NULL,e.created_at,'outgoing'
      FROM business_gift_card_events e JOIN business_gift_cards c ON c.id=e.card_id
      JOIN users u ON u.id=c.business_id WHERE e.kind='topup'` : ""}
    ${rewards ? `UNION ALL
    SELECT e.id::text,'need_' || e.kind,e.user_id,NULL,e.amount,n.title,NULL,e.created_at,
           CASE WHEN e.kind='reserve' THEN 'outgoing' ELSE 'incoming' END
      FROM reward_need_entries e JOIN reward_need_offers o ON o.id=e.offer_id
      JOIN reward_needs n ON n.id=o.need_id` : ""}
    ${marketplace ? `UNION ALL
    SELECT 'market-reserve:' || id,'market_reserve',buyer_id,NULL,amount,'',item_title,created_at,'outgoing'
      FROM roll_marketplace_orders WHERE gift_card_id IS NULL
    UNION ALL
    SELECT 'market-refund:' || id,'market_refund',buyer_id,NULL,amount,'',item_title,closed_at,'incoming'
      FROM roll_marketplace_orders WHERE gift_card_id IS NULL AND status='refunded'
    UNION ALL
    SELECT 'market-sale:' || id,'market_sale',seller_id,NULL,amount,'',item_title,closed_at,'incoming'
      FROM roll_marketplace_orders WHERE status='released'` : ""}

  `;
}

const openRewardReserves = `
  SELECT r.user_id,r.amount
  FROM reward_need_entries r
  WHERE r.kind='reserve' AND NOT EXISTS (
    SELECT 1 FROM reward_need_entries e WHERE e.offer_id=r.offer_id AND e.kind IN ('reward','refund')
  )
`;

const openMarketplaceReserves = `
  SELECT buyer_id,seller_id,amount FROM roll_marketplace_orders
  WHERE status IN ('reserved','fulfilled','disputed')
`;

export async function readRollBalanceBreakdown(client, userId, sources) {
  if (!sources.gifts && !sources.rewards && !sources.marketplace) {
    return { giftCards: "0", reservedRewards: "0", reservedOrders: "0", pendingSales: "0" };
  }
  const giftBalance = sources.gifts
    ? "SELECT COALESCE(SUM(balance),0)::text FROM business_gift_cards WHERE owner_id=$1"
    : "SELECT '0'::text";
  const rewardBalance = sources.rewards
    ? `SELECT COALESCE(SUM(amount),0)::text FROM (${openRewardReserves}) reserves WHERE user_id=$1`
    : "SELECT '0'::text";
  const marketplaceBalance = (column) => sources.marketplace
    ? `SELECT COALESCE(SUM(amount),0)::text FROM (${openMarketplaceReserves}) reserves WHERE ${column}=$1`
    : "SELECT '0'::text";
  const { rows: [balances] } = await client.query(
    `SELECT (${giftBalance}) AS "giftCards", (${rewardBalance}) AS "reservedRewards",
       (${marketplaceBalance("buyer_id")}) AS "reservedOrders", (${marketplaceBalance("seller_id")}) AS "pendingSales"`, [userId],
  );
  return balances;
}

export async function reconcileRollAccounting(client) {
  const sources = await readRollAccountingSources(client);
  const cardBalances = sources.gifts ? `
    SELECT c.balance,COALESCE(e.recorded,0) AS recorded
    FROM business_gift_cards c LEFT JOIN (
      SELECT card_id,SUM(CASE kind WHEN 'topup' THEN amount WHEN 'refund' THEN amount
                                   WHEN 'spend' THEN -amount ELSE 0 END) AS recorded
      FROM business_gift_card_events GROUP BY card_id
    ) e ON e.card_id=c.id
  ` : "SELECT 0::bigint AS balance,0::numeric AS recorded WHERE FALSE";
  const cardSpend = sources.gifts
    ? `(SELECT COALESCE(SUM(CASE e.kind WHEN 'spend' THEN e.amount WHEN 'refund' THEN -e.amount ELSE 0 END),0)
      FROM business_gift_card_events e
      ${sources.marketplace ? `WHERE NOT EXISTS (SELECT 1 FROM roll_marketplace_orders o
        WHERE o.gift_payment_id=CASE e.kind WHEN 'refund' THEN e.purchase_id ELSE e.id END)` : ""})`
    : "0";
  const reservedRewards = sources.rewards
    ? `(SELECT COALESCE(SUM(amount),0) FROM (${openRewardReserves}) reserves)`
    : "0";
  const reservedOrders = sources.marketplace ? `(SELECT COALESCE(SUM(amount),0) FROM (${openMarketplaceReserves}) reserves)` : "0";
  const marketplaceMismatches = sources.marketplace ? `(SELECT COUNT(*)::int FROM roll_marketplace_orders o
    LEFT JOIN roll_marketplace_order_events terminal ON terminal.order_id=o.id
      AND terminal.action IN ('accept','claim','cancel','refund','resolve_release','resolve_refund')
    LEFT JOIN business_gift_card_events debit ON debit.id=o.gift_payment_id
    LEFT JOIN business_gift_card_events refund ON refund.purchase_id=o.gift_payment_id AND refund.kind='refund'
    WHERE (o.status='released') <> COALESCE(terminal.action IN ('accept','claim','resolve_release'),FALSE)
       OR (o.status='refunded') <> COALESCE(terminal.action IN ('cancel','refund','resolve_refund'),FALSE)
       OR o.closed_at IS DISTINCT FROM terminal.created_at
       OR (terminal.action IN ('cancel','accept') AND terminal.actor_id IS DISTINCT FROM o.buyer_id)
       OR (terminal.action IN ('claim','refund') AND terminal.actor_id IS DISTINCT FROM o.seller_id)
       OR (o.gift_card_id IS NOT NULL AND (debit.kind IS DISTINCT FROM 'spend'
           OR debit.card_id IS DISTINCT FROM o.gift_card_id OR debit.actor_id IS DISTINCT FROM o.buyer_id
           OR debit.amount IS DISTINCT FROM o.amount OR debit.purchase IS NOT NULL
           OR (o.status='refunded') <> (refund.id IS NOT NULL)
           OR (refund.id IS NOT NULL AND (refund.card_id<>o.gift_card_id OR refund.amount<>o.amount)))))` : "0";
  const { rows: [totals] } = await client.query(`
    WITH entries AS MATERIALIZED (
      SELECT account_id,kind,amount,direction FROM (${rollWalletEntries(sources)}) entries
    ),
    by_account AS (
      SELECT account_id,SUM(CASE direction WHEN 'incoming' THEN amount ELSE -amount END) AS balance
      FROM entries GROUP BY account_id
    ), wallets AS (
      SELECT COUNT(w.user_id)::int AS count,
        COUNT(*) FILTER (WHERE COALESCE(w.balance,0)<>COALESCE(a.balance,0))::int AS mismatches,
        COALESCE(SUM(w.balance),0) AS balance
      FROM roll_wallets w FULL JOIN by_account a ON a.account_id=w.user_id
    ), cards AS (
      SELECT COUNT(*)::int AS count,COUNT(*) FILTER (WHERE balance<>recorded)::int AS mismatches,
        COALESCE(SUM(balance),0) AS balance
      FROM (${cardBalances}) balances
    ), system AS (
      SELECT ${reservedRewards} AS reserved,${reservedOrders} AS orders_reserved,
        (SELECT COALESCE(SUM(amount),0) FROM entries
         WHERE kind IN ('welcome','wish_reward','manual_grant','stars_topup','ton_topup')) AS issued,
        (SELECT COALESCE(SUM(CASE direction WHEN 'outgoing' THEN amount ELSE -amount END),0)
         FROM entries WHERE kind IN ('purchase','refund')) + ${cardSpend} AS redeemed
    )
    SELECT wallets.count AS wallets, wallets.mismatches AS "walletMismatches", wallets.balance::text AS "walletRolls",
      cards.count AS "giftCards", cards.mismatches AS "cardMismatches", cards.balance::text AS "giftCardRolls",
      reserved::text AS "reservedRewardRolls",orders_reserved::text AS "reservedMarketplaceRolls",
      ${marketplaceMismatches} AS "marketplaceMismatches", issued::text AS "issuedRolls", redeemed::text AS "redeemedRolls",
      (issued-redeemed-reserved-orders_reserved-wallets.balance-cards.balance)::text AS "unaccountedRolls"
    FROM wallets,cards,system
  `);
  return { ...sources, ...totals };
}
