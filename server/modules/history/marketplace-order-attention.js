// Both account projections use the same server-time classification.
export const marketplaceOrderAttentionSql = `CASE
  WHEN o.status='disputed' AND $1 IN (o.buyer_id,o.seller_id) THEN 'dispute'
  WHEN o.buyer_id=$1 AND o.status='fulfilled' AND o.review_until>statement_timestamp() THEN 'review'
  WHEN o.seller_id=$1 AND o.status='reserved' THEN 'fulfill'
  WHEN o.seller_id=$1 AND o.status='fulfilled' AND o.review_until<=statement_timestamp() THEN 'claim'
END`;

export async function readMarketplaceOrderAttention(client, userId) {
  const { rows } = await client.query(`
    SELECT kind,COUNT(*)::int AS count,SUM(amount)::text AS amount,
      MIN(review_until) FILTER (WHERE kind='review') AS "reviewUntil"
    FROM (
      SELECT ${marketplaceOrderAttentionSql} AS kind,o.amount,o.review_until
      FROM roll_marketplace_orders o
      WHERE (o.buyer_id=$1 OR o.seller_id=$1) AND o.status IN ('reserved','fulfilled','disputed')
    ) pending
    WHERE kind IS NOT NULL GROUP BY kind
  `, [userId]);
  return rows;
}
