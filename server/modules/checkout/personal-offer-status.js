import { z } from "zod";
import { RollsError } from "../payments/rolls.js";
import { readPersonalOfferLedger } from "./personal-offer-ledger.js";

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
  const row = await readPersonalOfferLedger(client, actorId, id, action);
  if (!row) throw new RollsError("Счёт не найден", "OFFER_NOT_FOUND", 404);
  if (!row.purchase_id) return null;
  if (row.evidence_issue) {
    throw new RollsError("Записи по счёту расходятся. Обратитесь в поддержку.", "OFFER_ORDER_MISMATCH", 409);
  }
  if (action === "refund" && !row.refunded_at) return null;
  return {
    id: row.purchase_id, offerId: row.id, businessId: row.business_user_id, recipientId: row.recipient_id,
    priceRolls: Number(row.price_rolls), paidAt: row.created_at, refundedAt: row.refunded_at,
  };
}
