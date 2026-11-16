// Select one candidate per leg by its ledger key. Keeping a mismatched
// candidate lets the audit distinguish missing records from incorrect terms.
export const personalOfferLedgerSql = `
  SELECT o.id,o.recipient_id,o.business_user_id,o.price_rolls,o.purchase_id,
    o.expires_at,p.created_at,p.refunded_at,payment.id AS payment_id,reversal.id AS reversal_id,
    CASE
      WHEN o.purchase_id IS NULL THEN CASE WHEN payment.id IS NOT NULL THEN 'payment_key_unlinked' END
      WHEN p.id IS NULL THEN 'order_missing'
      WHEN p.user_id IS DISTINCT FROM o.recipient_id
        OR p.idempotency_key IS DISTINCT FROM o.id::text
        OR p.product_id IS DISTINCT FROM 'offer:' || o.id::text
        OR p.delivery->>'personalOfferId' IS DISTINCT FROM o.id::text
        OR p.amount IS DISTINCT FROM o.price_rolls
        THEN 'order_terms'
      WHEN payment.id IS NULL THEN 'debit_missing'
      WHEN payment.kind IS DISTINCT FROM 'transfer'
        OR payment.recipient_id IS DISTINCT FROM o.business_user_id
        OR payment.amount IS DISTINCT FROM o.price_rolls
        OR payment.id IS DISTINCT FROM COALESCE(p.delivery->>'paymentTransactionId',payment.id)
        THEN 'debit_terms'
      WHEN p.refunded_at IS NULL AND reversal.id IS NOT NULL THEN 'refund_unmarked'
      WHEN p.refunded_at IS NOT NULL AND reversal.id IS NULL THEN 'refund_missing'
      WHEN reversal.id IS NOT NULL AND (
        reversal.kind IS DISTINCT FROM 'transfer'
        OR reversal.recipient_id IS DISTINCT FROM o.recipient_id
        OR reversal.amount IS DISTINCT FROM o.price_rolls
      ) THEN 'refund_terms'
    END AS evidence_issue
  FROM business_personal_offers o
  LEFT JOIN roll_store_purchases p ON p.id=o.purchase_id
  LEFT JOIN roll_transactions payment ON payment.sender_id=o.recipient_id AND payment.idempotency_key=o.id::text
  LEFT JOIN roll_transactions reversal ON reversal.sender_id=o.business_user_id AND reversal.idempotency_key='reverse:' || payment.id
`;

export async function readPersonalOfferLedger(client, actorId, id, action) {
  const owner = action === "pay" ? "o.recipient_id" : "o.business_user_id";
  const { rows: [row] } = await client.query(`${personalOfferLedgerSql} WHERE o.id=$1 AND ${owner}=$2`, [id, actorId]);
  return row;
}

export async function readPersonalOfferAudit(client, id) {
  const { rows: [row] } = await client.query(`${personalOfferLedgerSql} WHERE o.id=$1`, [id]);
  if (!row) return null;
  return {
    id: row.id, amount: String(row.price_rolls),
    state: row.refunded_at ? "refunded" : row.purchase_id ? "paid" : "unpaid", expiresAt: row.expires_at,
    orderId: row.purchase_id, debitId: row.payment_id, refundId: row.reversal_id,
    paidAt: row.created_at, refundedAt: row.refunded_at, evidenceIssue: row.evidence_issue,
  };
}
