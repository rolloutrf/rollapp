// Invoice delivery in the external Stars worker is polled every two seconds.
// A minute without a link is an operational signal while the order is payable.
const starInvoiceDeadline = "created_at + INTERVAL '1 minute'";

export const rollTopupSnapshot = `
  SELECT 'stars' AS provider,id,rolls,stars::numeric AS external_amount,'XTR' AS unit,
    created_at,expires_at,paid_at,telegram_payment_charge_id AS provider_reference,
    CASE
      WHEN paid_at IS NOT NULL THEN 'credited'
      WHEN checkout_query_id IS NOT NULL AND expires_at<=transaction_timestamp() THEN 'checkout_expired'
      WHEN checkout_query_id IS NOT NULL THEN 'checkout_pending'
      WHEN expires_at<=transaction_timestamp() AND invoice_url IS NULL THEN 'invoice_expired'
      WHEN expires_at<=transaction_timestamp() THEN 'expired_unconfirmed'
      WHEN invoice_url IS NULL AND ${starInvoiceDeadline}<=transaction_timestamp() THEN 'invoice_delivery_due'
      WHEN invoice_url IS NULL THEN 'invoice_preparing'
      ELSE 'awaiting_payment'
    END AS state,
    CASE WHEN paid_at IS NOT NULL THEN paid_at
      WHEN expires_at<=transaction_timestamp() THEN expires_at
      WHEN checkout_query_id IS NULL AND invoice_url IS NULL AND ${starInvoiceDeadline}<=transaction_timestamp() THEN ${starInvoiceDeadline}
      ELSE created_at
    END AS since,
    CASE WHEN (paid_at IS NULL)<>(telegram_payment_charge_id IS NULL) THEN 'reference_timestamp_mismatch'
      WHEN telegram_payment_charge_id IS NOT NULL AND btrim(telegram_payment_charge_id)='' THEN 'invalid_reference'
    END AS evidence_issue
  FROM roll_star_orders
  UNION ALL
  SELECT 'ton',id,rolls,nanotons,'nanoton',created_at,expires_at,paid_at,transaction_hash,
    CASE
      WHEN paid_at IS NOT NULL THEN 'credited'
      WHEN expires_at<=transaction_timestamp() THEN 'expired_unconfirmed'
      ELSE 'awaiting_payment'
    END,
    CASE WHEN paid_at IS NOT NULL THEN paid_at WHEN expires_at<=transaction_timestamp() THEN expires_at ELSE created_at END,
    CASE WHEN (paid_at IS NULL)<>(transaction_hash IS NULL) THEN 'reference_timestamp_mismatch'
      WHEN transaction_hash IS NOT NULL AND transaction_hash!~'^[0-9a-fA-F]{64}$' THEN 'invalid_reference'
    END
  FROM roll_ton_orders
`;

export async function readRollTopupAudit(client, { provider, id }) {
  if (!["stars", "ton"].includes(provider) || typeof id !== "string" || !id || id.length > 200) {
    throw new RangeError("Укажите поставщика и номер счёта.");
  }
  const { rows: [order] } = await client.query(`
    SELECT provider,id,state,rolls::text,external_amount::text AS "externalAmount",unit,
      created_at AS "createdAt",expires_at AS "expiresAt",paid_at AS "creditedAt",
      provider_reference AS "providerReference",evidence_issue AS "evidenceIssue"
    FROM (${rollTopupSnapshot}) orders WHERE provider=$1 AND id=$2
  `, [provider, id]);
  return order ?? null;
}
