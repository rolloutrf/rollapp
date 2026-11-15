import { ROLLS_MAX_TRANSFER } from "../../../shared/modules/payments/rolls.js";
import { hasMarketplaceSettlementSchema } from "../checkout/marketplace-settlements-schema.js";

// Keep capacity for returning every open marketplace payment even when the
// card goes to a different owner. The card lock precedes the reserve query so
// READ COMMITTED observes debits made by a previous holder of that lock.
export async function giftCardCreditLimit(client, cardId, amount, { cardLocked = false, refundedOrderId = null } = {}) {
  const limit = ROLLS_MAX_TRANSFER - amount;
  if (!await hasMarketplaceSettlementSchema(client)) return limit;
  if (!cardLocked) await client.query("SELECT id FROM business_gift_cards WHERE id=$1 FOR UPDATE", [cardId]);
  const { rows: [{ held }] } = await client.query(`
    SELECT COALESCE(SUM(amount),0) AS held FROM roll_marketplace_orders
    WHERE gift_card_id=$1 AND status IN ('reserved','fulfilled','disputed')
      AND ($2::uuid IS NULL OR id<>$2)`, [cardId, refundedOrderId]);
  return Math.max(-1, limit - Number(held));
}
