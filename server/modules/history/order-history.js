import { hasMarketplaceSettlementSchema } from "../checkout/marketplace-settlements-schema.js";
import { marketplaceOrderActions } from "../../../shared/modules/checkout/marketplace-settlements.js";


export function orderFromRow(row) {
  return {
    id: row.id,
    productId: row.product_id,
    productTitle: row.product_title,
    amount: Number(row.amount),
    delivery: row.delivery,
    createdAt: row.created_at,
    refundedAt: row.refunded_at,
    status: row.refunded_at ? "refunded" : "placed",
  };
}

export async function readRollOrders(client, userId) {
  const giftSchema = await client.query("SELECT to_regclass('business_gift_card_events')::text AS events");
  const giftOrders = giftSchema.rows[0]?.events ? `
    UNION ALL
    SELECT e.id,e.purchase->>'productId' AS product_id,e.purchase->>'productTitle' AS product_title,
           e.amount,e.purchase->'delivery' AS delivery,e.created_at,r.created_at AS refunded_at
    FROM business_gift_card_events e
    LEFT JOIN business_gift_card_events r ON r.purchase_id=e.id AND r.kind='refund'
    WHERE e.actor_id=$1 AND e.kind='spend' AND e.purchase IS NOT NULL
  ` : "";
  const orders = await client.query(
    `WITH orders AS (
       SELECT id,product_id,product_title,amount,delivery,created_at,refunded_at
       FROM roll_store_purchases WHERE user_id=$1
       ${giftOrders}
     ) SELECT * FROM orders ORDER BY created_at DESC,id DESC`,
    [userId],
  );
  const history = orders.rows.map(orderFromRow);
  if (!await hasMarketplaceSettlementSchema(client)) return { orders: history };
  const { rows } = await client.query(`
    SELECT o.*,statement_timestamp() AS now,
      COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'action',e.action,'note',e.note,'createdAt',e.created_at
      ) ORDER BY e.created_at,e.action)
      FROM roll_marketplace_order_events e WHERE e.order_id=o.id),'[]'::jsonb) AS events
    FROM roll_marketplace_orders o WHERE o.buyer_id=$1 OR o.seller_id=$1
  `, [userId]);
  const protectedOrders = rows.map((order) => {
    const buyer = userId === order.buyer_id;
    const role = buyer ? "buyer" : "seller";
    return {
      id: order.id, productId: `business:${order.item_id}`, productTitle: order.item_title,
      amount: Number(order.amount), createdAt: order.created_at, status: order.status,
      refundedAt: order.status === "refunded" ? order.closed_at : null,
      settlement: {
        role, participant: buyer ? order.seller_name : order.buyer_name,
        reviewUntil: order.review_until, source: buyer ? (order.gift_card_id ? "gift" : "wallet") : null,
        actions: marketplaceOrderActions(order, role, order.now), events: order.events,
      },
    };
  });
  return { orders: [...history, ...protectedOrders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt) || b.id.localeCompare(a.id)) };
}
