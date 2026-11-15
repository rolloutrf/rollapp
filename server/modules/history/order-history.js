

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
  return { orders: orders.rows.map(orderFromRow) };
}
