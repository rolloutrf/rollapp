import { z } from "zod";
import { reverseRollTransfer, RollsError } from "../payments/rolls.js";

export async function refundPersonalOffer(client, businessId, offerId) {
  const notFound = () => new RollsError("Счёт не найден", "OFFER_NOT_FOUND", 404);
  if (!z.string().uuid().safeParse(offerId).success) throw notFound();
  const id = offerId.toLowerCase();
  // Match the purchase action's order of locks: offer, wallets, then order.
  // The ordinary order refund endpoint rejects orders linked to a personal offer.
  const { rows: [offer] } = await client.query(
    "SELECT recipient_id,purchase_id,item_title,price_rolls FROM business_personal_offers WHERE id=$1 AND business_user_id=$2 FOR UPDATE",
    [id, businessId],
  );
  if (!offer) throw notFound();
  if (!offer.purchase_id) throw new RollsError("Возврат доступен после оплаты счёта", "OFFER_NOT_PAID", 409);
  // Take a fresh READ COMMITTED snapshot after waiting for the offer lock.
  const { rows: [order] } = await client.query(
    "SELECT user_id,amount,refunded_at,delivery->>'personalOfferId' AS linked_offer FROM roll_store_purchases WHERE id=$1",
    [offer.purchase_id],
  );
  if (!order || order.linked_offer !== id || order.user_id !== offer.recipient_id || order.amount !== offer.price_rolls) {
    throw new RollsError("Заказ не соответствует оплаченному счёту", "OFFER_ORDER_MISMATCH", 409);
  }
  if (order.refunded_at) return { id: offer.purchase_id, refundedAt: order.refunded_at, replayed: true };

  await reverseRollTransfer(client, {
    senderId: offer.recipient_id,
    recipientId: businessId,
    amount: Number(offer.price_rolls),
    idempotencyKey: id,
    note: `Возврат по счёту: ${offer.item_title}`,
  });
  const { rows: [refunded] } = await client.query(`
    UPDATE roll_store_purchases SET refunded_at=clock_timestamp()
    WHERE id=$1 AND refunded_at IS NULL RETURNING refunded_at
  `, [offer.purchase_id]);
  if (!refunded) throw new RollsError("Заказ уже возвращён", "OFFER_ALREADY_REFUNDED", 409);
  return { id: offer.purchase_id, refundedAt: refunded.refunded_at, replayed: false };
}
