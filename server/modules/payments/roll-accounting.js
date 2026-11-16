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

// Personal invoices are ordinary transfers in the ledger. Match the
// authoritative invoice and its original debit before attributing a reversal.
export const rollInvoiceJoins = `
    LEFT JOIN roll_transactions t ON e.kind='transfer' AND e.id=t.id
    LEFT JOIN roll_transactions original ON t.idempotency_key LIKE 'reverse:%'
      AND original.id=substring(t.idempotency_key FROM 9)
      AND original.sender_id=t.recipient_id AND original.recipient_id=t.sender_id AND original.amount=t.amount
    LEFT JOIN roll_store_purchases invoice_order ON invoice_order.user_id=COALESCE(original.sender_id,t.sender_id)
      AND invoice_order.idempotency_key=COALESCE(original.idempotency_key,t.idempotency_key)
      AND invoice_order.delivery->>'personalOfferId' IS NOT NULL
    LEFT JOIN business_personal_offers invoice ON invoice.purchase_id=invoice_order.id
      AND invoice.id::text=invoice_order.delivery->>'personalOfferId'
      AND invoice.id::text=invoice_order.idempotency_key
      AND invoice.recipient_id=invoice_order.user_id
      AND invoice.business_user_id=COALESCE(original.recipient_id,t.recipient_id)
      AND invoice.price_rolls=t.amount AND invoice.price_rolls=invoice_order.amount
      AND COALESCE(original.id,t.id)=COALESCE(invoice_order.delivery->>'paymentTransactionId',original.id,t.id)
      AND (original.id IS NULL OR invoice_order.refunded_at IS NOT NULL)
`;

export const openRewardReserves = `
  SELECT r.user_id,r.amount
  FROM reward_need_entries r
  WHERE r.kind='reserve' AND NOT EXISTS (
    SELECT 1 FROM reward_need_entries e WHERE e.offer_id=r.offer_id AND e.kind IN ('reward','refund')
  )
`;

export const openMarketplaceReserves = `
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
