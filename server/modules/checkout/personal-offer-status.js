import { z } from "zod";
import { RollsError } from "../payments/rolls.js";

const operationParams = z.object({ id: z.string().uuid(), action: z.enum(["pay", "refund"]) }).strict();
const terms = z.object({ expectedPriceRolls: z.number().int().min(1).max(1_000_000).optional() }).strict();

export function readPersonalOfferTerms(input) {
  const parsed = terms.safeParse(input ?? {});
  if (!parsed.success) throw new RollsError("Проверьте условия счёта", "INVALID_OFFER_TERMS");
  return parsed.data;
}

export function requirePersonalOfferPrice(price, expectedPriceRolls) {
  if (expectedPriceRolls !== undefined && Number(price) !== expectedPriceRolls) {
    throw new RollsError("Сумма счёта изменилась. Откройте счёт и проверьте новую сумму.", "OFFER_PRICE_CHANGED", 409);
  }
}

export async function readPersonalOfferOperation(client, actorId, input) {
  const parsed = operationParams.safeParse(input);
  if (!parsed.success) throw new RollsError("Счёт не найден", "OFFER_NOT_FOUND", 404);
  const { id, action } = parsed.data;
  const ownership = action === "pay" ? "o.recipient_id" : "o.business_user_id";
  const { rows: [row] } = await client.query(`
    SELECT o.id,o.recipient_id,o.business_user_id,o.price_rolls,o.purchase_id,
      p.id AS order_id,p.user_id AS order_recipient,p.amount AS order_amount,p.idempotency_key AS order_key,
      p.delivery->>'personalOfferId' AS linked_offer,p.created_at,p.refunded_at,
      payment.id AS payment_id,reversal.id AS reversal_id
    FROM business_personal_offers o
    LEFT JOIN roll_store_purchases p ON p.id=o.purchase_id
    LEFT JOIN roll_transactions payment ON payment.kind='transfer' AND payment.sender_id=o.recipient_id
      AND payment.recipient_id=o.business_user_id AND payment.idempotency_key=o.id::text AND payment.amount=o.price_rolls
      AND payment.id=COALESCE(p.delivery->>'paymentTransactionId',payment.id)
    LEFT JOIN roll_transactions reversal ON reversal.kind='transfer' AND reversal.sender_id=o.business_user_id
      AND reversal.recipient_id=o.recipient_id AND reversal.idempotency_key='reverse:' || payment.id AND reversal.amount=o.price_rolls
    WHERE o.id=$1 AND ${ownership}=$2
  `, [id, actorId]);
  if (!row) throw new RollsError("Счёт не найден", "OFFER_NOT_FOUND", 404);
  if (!row.purchase_id) return null;
  if (!row.order_id || row.order_key !== row.id || row.linked_offer !== row.id || row.order_recipient !== row.recipient_id ||
      row.order_amount !== row.price_rolls || !row.payment_id || (Boolean(row.refunded_at) !== Boolean(row.reversal_id))) {
    throw new RollsError("Записи по счёту расходятся. Обратитесь в поддержку.", "OFFER_ORDER_MISMATCH", 409);
  }
  if (action === "refund" && !row.refunded_at) return null;
  return {
    id: row.order_id, offerId: row.id, businessId: row.business_user_id, recipientId: row.recipient_id,
    priceRolls: Number(row.price_rolls), paidAt: row.created_at, refundedAt: row.refunded_at,
  };
}
