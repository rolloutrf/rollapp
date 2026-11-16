import { personalOfferLedgerSql } from "../checkout/personal-offer-ledger.js";
import { rollTopupSnapshot } from "./roll-topup-audit.js";
import { hasAutomaticRewardConfirmation } from "../loyalty/need-reward-settlement-terms.js";
import { openMarketplaceReserves, openRewardReserves, readRollAccountingSources, rollWalletEntries } from "./roll-accounting.js";

const noIssues = "SELECT NULL::text AS id,NULL::jsonb AS detail WHERE FALSE";

const rewardIssues = `
  SELECT o.id::text AS id,jsonb_build_object(
    'status',o.status,'amount',o.reward::text,
    'reserveId',reserve.id,'settlementId',settlement.id,'settlementKind',settlement.kind
  ) AS detail
  FROM reward_need_offers o JOIN reward_needs n ON n.id=o.need_id
  LEFT JOIN reward_need_entries reserve ON reserve.offer_id=o.id AND reserve.kind='reserve'
  LEFT JOIN reward_need_entries settlement ON settlement.offer_id=o.id AND settlement.kind IN ('reward','refund')
  WHERE reserve.user_id IS DISTINCT FROM o.business_id OR reserve.amount IS DISTINCT FROM o.reward
     OR settlement.kind IS DISTINCT FROM CASE
       WHEN o.status='settled' THEN 'reward'
       WHEN o.status IN ('cancelled','declined') THEN 'refund'
     END
     OR (settlement.kind='reward' AND (settlement.user_id<>n.user_id OR settlement.created_at<>o.settled_at))
     OR (settlement.kind='refund' AND settlement.user_id<>o.business_id)
     OR (settlement.id IS NOT NULL AND settlement.amount<>o.reward)
`;

const marketplaceIssues = `
  SELECT o.id::text AS id,jsonb_build_object(
    'status',o.status,'amount',o.amount::text,
    'terminalAction',terminal.action,'cardPaymentId',o.gift_payment_id,'cardRefundId',refund.id
  ) AS detail
  FROM roll_marketplace_orders o
  LEFT JOIN roll_marketplace_order_events terminal ON terminal.order_id=o.id
    AND terminal.action IN ('accept','claim','cancel','refund','resolve_release','resolve_refund')
  LEFT JOIN roll_marketplace_order_events fulfillment ON fulfillment.order_id=o.id AND fulfillment.action='fulfill'
  LEFT JOIN roll_marketplace_order_events dispute ON dispute.order_id=o.id AND dispute.action='dispute'
  LEFT JOIN business_gift_card_events debit ON debit.id=o.gift_payment_id
  LEFT JOIN business_gift_card_events refund ON refund.purchase_id=o.gift_payment_id AND refund.kind='refund'
  WHERE (o.status='released') <> COALESCE(terminal.action IN ('accept','claim','resolve_release'),FALSE)
     OR (o.status='refunded') <> COALESCE(terminal.action IN ('cancel','refund','resolve_refund'),FALSE)
     OR o.closed_at IS DISTINCT FROM terminal.created_at
     OR (terminal.action IN ('cancel','accept') AND terminal.actor_id IS DISTINCT FROM o.buyer_id)
     OR (terminal.action IN ('claim','refund') AND terminal.actor_id IS DISTINCT FROM o.seller_id)
     OR (o.review_until IS NOT NULL) <> (fulfillment.order_id IS NOT NULL)
     OR (fulfillment.order_id IS NOT NULL AND fulfillment.actor_id IS DISTINCT FROM o.seller_id)
     OR ((o.status='disputed' OR terminal.action IN ('resolve_release','resolve_refund')) AND dispute.order_id IS NULL)
     OR (dispute.order_id IS NOT NULL AND (dispute.actor_id IS DISTINCT FROM o.buyer_id
         OR fulfillment.order_id IS NULL OR dispute.created_at<fulfillment.created_at
         OR (o.status<>'disputed' AND COALESCE(terminal.action NOT IN ('accept','refund','resolve_release','resolve_refund'),TRUE))))
     OR (o.gift_card_id IS NOT NULL AND (debit.kind IS DISTINCT FROM 'spend'
         OR debit.card_id IS DISTINCT FROM o.gift_card_id OR debit.actor_id IS DISTINCT FROM o.buyer_id
         OR debit.amount IS DISTINCT FROM o.amount OR debit.purchase IS NOT NULL
         OR (o.status='refunded') <> (refund.id IS NOT NULL)
         OR (refund.id IS NOT NULL AND (refund.card_id<>o.gift_card_id OR refund.amount<>o.amount
             OR refund.actor_id<>o.buyer_id))))
`;

const personalOfferIssues = `
  SELECT id::text AS id,jsonb_build_object(
    'entity','invoice','amount',price_rolls::text,'orderId',purchase_id,
    'debitId',payment_id,'refundId',reversal_id,'evidenceIssue',evidence_issue
  ) AS detail FROM (${personalOfferLedgerSql}) evidence WHERE evidence_issue IS NOT NULL
`;

const noAttention = "SELECT NULL::text AS id,NULL::text AS reason,0::bigint AS amount,NULL::timestamptz AS since WHERE FALSE";

const rewardAttention = `
  SELECT o.id::text AS id,'reward_disputed' AS reason,o.reward AS amount,e.created_at AS since
    FROM reward_need_offers o LEFT JOIN LATERAL (
      SELECT MAX(created_at) AS created_at FROM reward_need_events WHERE offer_id=o.id AND action='dispute'
    ) e ON TRUE WHERE o.status='disputed'
  UNION ALL
  SELECT id::text,'reward_expiry_due',reward,expires_at FROM reward_need_offers
    WHERE status='offered' AND expires_at<=transaction_timestamp()
  UNION ALL
  SELECT id::text,CASE WHEN ${hasAutomaticRewardConfirmation} THEN 'reward_automatic_due' ELSE 'reward_claimable' END,
    reward,claim_at FROM reward_need_offers o WHERE status='confirmed' AND claim_at<=transaction_timestamp()
`;

const marketplaceAttention = `
  SELECT o.id::text AS id,'marketplace_disputed' AS reason,o.amount,e.created_at AS since
    FROM roll_marketplace_orders o LEFT JOIN roll_marketplace_order_events e ON e.order_id=o.id AND e.action='dispute'
    WHERE o.status='disputed'
  UNION ALL
  SELECT id::text,'marketplace_claimable',amount,review_until FROM roll_marketplace_orders
    WHERE status='fulfilled' AND review_until<=transaction_timestamp()
`;

function reconciliationSql({ gifts, rewards, marketplace, personalOffers }) {
  const cardBalances = gifts ? `
    SELECT c.id,c.balance,COALESCE(e.recorded,0) AS recorded
    FROM business_gift_cards c LEFT JOIN (
      SELECT card_id,SUM(CASE kind WHEN 'topup' THEN amount WHEN 'refund' THEN amount
                                   WHEN 'spend' THEN -amount ELSE 0 END) AS recorded
      FROM business_gift_card_events GROUP BY card_id
    ) e ON e.card_id=c.id
  ` : "SELECT NULL::text AS id,0::bigint AS balance,0::numeric AS recorded WHERE FALSE";
  const cardSpend = gifts ? `(SELECT COALESCE(SUM(CASE e.kind WHEN 'spend' THEN e.amount WHEN 'refund' THEN -e.amount ELSE 0 END),0)
    FROM business_gift_card_events e
    ${marketplace ? `WHERE NOT EXISTS (SELECT 1 FROM roll_marketplace_orders o
      WHERE o.gift_payment_id=CASE e.kind WHEN 'refund' THEN e.purchase_id ELSE e.id END)` : ""})` : "0";
  const reservedRewards = rewards ? `(SELECT COALESCE(SUM(amount),0) FROM (${openRewardReserves}) reserves)` : "0";
  const reservedOrders = marketplace ? `(SELECT COALESCE(SUM(amount),0) FROM (${openMarketplaceReserves}) reserves)` : "0";

  return `
    WITH entries AS MATERIALIZED (
      SELECT account_id,kind,amount,direction,created_at FROM (${rollWalletEntries({ gifts, rewards, marketplace })}) entries
    ),
    by_account AS (
      SELECT account_id,SUM(CASE direction WHEN 'incoming' THEN amount ELSE -amount END) AS balance
      FROM entries GROUP BY account_id
    ),
    wallet_balances AS (
      SELECT COALESCE(w.user_id,a.account_id) AS id,w.balance,COALESCE(a.balance,0) AS recorded
      FROM roll_wallets w FULL JOIN by_account a ON a.account_id=w.user_id
    ),
    card_balances AS (${cardBalances}),
    topups AS MATERIALIZED (${rollTopupSnapshot}),
    topup_totals AS (
      SELECT provider,state,COUNT(*)::int AS count,SUM(rolls)::text AS rolls,
        SUM(external_amount)::text AS external_amount,MIN(since) AS oldest
      FROM topups GROUP BY provider,state
    ),
    topup_by_provider AS (
      SELECT providers.provider,providers.unit,COALESCE(jsonb_object_agg(t.state,jsonb_build_object(
        'count',t.count,'rolls',t.rolls,'externalAmount',t.external_amount,'oldest',t.oldest
      )) FILTER (WHERE t.state IS NOT NULL),'{}'::jsonb) AS states
      FROM (VALUES ('stars','XTR'),('ton','nanoton')) AS providers(provider,unit)
      LEFT JOIN topup_totals t USING (provider) GROUP BY providers.provider,providers.unit
    ),
    issues AS MATERIALIZED (
      SELECT 'wallets' AS scope,id,jsonb_build_object(
        'stored',balance::text,'recorded',recorded::text,'difference',(COALESCE(balance,0)-recorded)::text) AS detail
      FROM wallet_balances WHERE balance IS NULL OR balance<>recorded
      UNION ALL
      SELECT 'giftCards',id,jsonb_build_object('stored',balance::text,'recorded',recorded::text,'difference',(balance-recorded)::text)
      FROM card_balances WHERE balance<>recorded
      UNION ALL
      SELECT 'rewards',i.* FROM (${rewards ? rewardIssues : noIssues}) i
      UNION ALL
      SELECT 'marketplace',i.* FROM (${marketplace ? marketplaceIssues : noIssues}) i
      UNION ALL
      SELECT 'personalOffers',i.* FROM (${personalOffers ? personalOfferIssues : noIssues}) i
      UNION ALL
      SELECT 'personalOffers',p.id,jsonb_build_object('entity','order','amount',p.amount::text,'evidenceIssue','order_unlinked')
      FROM roll_store_purchases p
      WHERE (p.delivery->>'personalOfferId' IS NOT NULL OR p.product_id LIKE 'offer:%')
        ${personalOffers ? "AND NOT EXISTS (SELECT 1 FROM business_personal_offers o WHERE o.purchase_id=p.id)" : ""}
      UNION ALL
      SELECT 'topups',id,jsonb_build_object('provider',provider,'state',state,'evidenceIssue',evidence_issue)
      FROM topups WHERE evidence_issue IS NOT NULL
    ),
    attention AS MATERIALIZED (
      ${rewards ? rewardAttention : noAttention} UNION ALL ${marketplace ? marketplaceAttention : noAttention}
      UNION ALL
      SELECT id,'stars_' || state,rolls,since FROM topups
      WHERE provider='stars' AND state IN ('invoice_delivery_due','checkout_expired')
    ),
    attention_totals AS (
      SELECT reason,COUNT(*)::int AS count,SUM(amount)::text AS amount,MIN(since) AS oldest
      FROM attention GROUP BY reason
    ),
    issuance AS (
      SELECT kind,COALESCE(SUM(amount),0) AS total,
        COALESCE(SUM(amount) FILTER (WHERE created_at>transaction_timestamp()-INTERVAL '720 hours'
          AND created_at<=transaction_timestamp()),0) AS recent
      FROM (VALUES ('welcome'),('wish_reward'),('manual_grant'),('stars_topup'),('ton_topup')) AS source(kind)
      LEFT JOIN entries USING (kind) GROUP BY kind
    ),
    supply AS (
      SELECT COALESCE(SUM(total),0) AS issued,jsonb_object_agg(kind,total::text) AS "issuedBySource",
        jsonb_object_agg(kind,recent::text) AS "issuedLast30DaysBySource" FROM issuance
    ),
    system AS (
      SELECT (SELECT COUNT(balance)::int FROM wallet_balances) AS wallets,
        (SELECT COALESCE(SUM(balance),0) FROM wallet_balances) AS wallet_rolls,
        (SELECT COUNT(*)::int FROM card_balances) AS cards,
        (SELECT COALESCE(SUM(balance),0) FROM card_balances) AS card_rolls,
        ${reservedRewards} AS reward_reserve,${reservedOrders} AS order_reserve,
        (SELECT COALESCE(SUM(CASE direction WHEN 'outgoing' THEN amount ELSE -amount END),0)
         FROM entries WHERE kind IN ('purchase','refund')) + ${cardSpend} AS redeemed
    )
    SELECT COALESCE((SELECT jsonb_object_agg(reason,jsonb_build_object(
        'count',count,'amount',amount,'oldest',oldest,'sample',
        CASE WHEN $1::int>0 THEN (
          SELECT jsonb_agg(jsonb_build_object('id',id,'amount',amount::text,'since',since) ORDER BY since,id)
          FROM (SELECT id,amount,since FROM attention WHERE reason=a.reason ORDER BY since,id LIMIT $1) limited
        ) END
      )) FROM attention_totals a),'{}'::jsonb) AS attention,
      (SELECT jsonb_object_agg(provider,jsonb_build_object('unit',unit,'states',states)) FROM topup_by_provider) AS topups,
      transaction_timestamp() AS "asOf",wallets,wallet_rolls::text AS "walletRolls",
      cards AS "giftCards",card_rolls::text AS "giftCardRolls",
      reward_reserve::text AS "reservedRewardRolls",order_reserve::text AS "reservedMarketplaceRolls",
      issued::text AS "issuedRolls",supply."issuedBySource",supply."issuedLast30DaysBySource",redeemed::text AS "redeemedRolls",
      (issued-redeemed-reward_reserve-order_reserve-wallet_rolls-card_rolls)::text AS "unaccountedRolls",
      (SELECT COUNT(*)::int FROM issues WHERE scope='wallets') AS "walletMismatches",
      (SELECT COUNT(*)::int FROM issues WHERE scope='giftCards') AS "cardMismatches",
      (SELECT COUNT(*)::int FROM issues WHERE scope='rewards') AS "rewardMismatches",
      (SELECT COUNT(*)::int FROM issues WHERE scope='marketplace') AS "marketplaceMismatches",
      (SELECT COUNT(*)::int FROM issues WHERE scope='topups') AS "topupMismatches",
      (SELECT COUNT(*)::int FROM issues WHERE scope='personalOffers') AS "personalOfferMismatches",
      CASE WHEN $1::int > 0 THEN (
        SELECT jsonb_object_agg(scopes.scope,COALESCE(sample.items,'[]'::jsonb))
        FROM (VALUES ('wallets'),('giftCards'),('rewards'),('marketplace'),('topups'),('personalOffers')) AS scopes(scope)
        CROSS JOIN LATERAL (
          SELECT jsonb_agg(jsonb_build_object('id',id) || detail ORDER BY id,detail) AS items
          FROM (SELECT id,detail FROM issues WHERE scope=scopes.scope ORDER BY id,detail LIMIT $1) limited
        ) sample
      ) END AS details
    FROM system,supply
  `;
}

export async function reconcileRollAccounting(client, { sampleLimit = 0 } = {}) {
  if (!Number.isInteger(sampleLimit) || sampleLimit < 0 || sampleLimit > 100) {
    throw new RangeError("sampleLimit must be an integer from 0 to 100");
  }
  const sources = await readRollAccountingSources(client);
  const { rows: [{ details, ...totals }] } = await client.query(reconciliationSql(sources), [sampleLimit]);
  return { ...sources, ...totals, ...(details === null ? {} : { details }) };
}

export function rollAccountingMatches(report) {
  return report.unaccountedRolls === "0" && report.walletMismatches === 0 && report.cardMismatches === 0
    && report.rewardMismatches === 0 && report.marketplaceMismatches === 0 && report.topupMismatches === 0
    && report.personalOfferMismatches === 0;
}
