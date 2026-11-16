import { giftCardCreditLimit } from "../loyalty/gift-card-balances.js";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { resolveCdekPoint } from "../delivery/cdek.js";
import { RollsError, ensureRollWallet, refundGiftCardOrder } from "../payments/rolls.js";
import { CAT_STORE_PRICE } from "../../../shared/modules/checkout/cat-store-price.js";
import { ROLLS_MAX_BALANCE } from "../../../shared/modules/payments/rolls.js";
import { orderFromRow } from "../history/order-history.js";

export const rollPurchaseSchema = z.object({
  productId: z.string().trim().min(1).max(120),
  idempotencyKey: z.string().uuid(),
  pickupPointCode: z.string().trim().min(1).max(40),
  expectedPrice: z.number().int().positive().optional(),
}).strict();

const ROLL_STORE_PRODUCTS = new Map([
  ["cat:red", { title: "Красный кот — Злой" }],
  ["cat:white", { title: "Белый кот — Милаха" }],
  ["cat:blue", { title: "Синий кот — Уставший" }],
  ["cat:pink", { title: "Розовый кот — Влюблён" }],
  ["cat:black", { title: "Чёрный кот — Крутой" }],
  ["cat:gold", { title: "Золотой кот" }],
]);

async function findStorePurchase(client, userId, requestKey) {
  const { rows: [row] } = await client.query(
    "SELECT * FROM roll_store_purchases WHERE user_id=$1 AND idempotency_key=$2", [userId, requestKey],
  );
  return row;
}

export async function readCatPurchaseStatus(client, userId, requestKey) {
  const key = z.uuid().safeParse(requestKey);
  if (!key.success) throw new RollsError("Проверьте номер запроса покупки", "INVALID_PURCHASE_REQUEST");
  const row = await findStorePurchase(client, userId, key.data);
  if (!row) return null;
  if (!row.product_id?.startsWith("cat:") || !row.delivery?.point?.code) {
    throw new RollsError("Этот запрос уже использован для другой покупки", "IDEMPOTENCY_CONFLICT", 409);
  }
  return orderFromRow(row);
}

export async function purchaseWithRolls(client, userId, input) {
  const parsed = rollPurchaseSchema.safeParse(input);
  if (!parsed.success) throw new RollsError("Некорректные данные покупки", "INVALID_PURCHASE");
  const { productId, idempotencyKey, pickupPointCode, expectedPrice } = parsed.data;
  const product = ROLL_STORE_PRODUCTS.get(productId);
  if (!product) throw new RollsError("Товар не найден", "PRODUCT_NOT_FOUND", 404);
  const { title: productTitle } = product;
  const amount = CAT_STORE_PRICE;
  await ensureRollWallet(client, userId);
  const row = await findStorePurchase(client, userId, idempotencyKey);
  if (row) {
    if (row.product_id !== productId || row.product_title !== productTitle || Number(row.amount) !== (expectedPrice ?? amount) || row.delivery?.point?.code !== pickupPointCode) {
      throw new RollsError("Этот запрос уже использован для другой покупки", "IDEMPOTENCY_CONFLICT", 409);
    }
    const wallet = await client.query("SELECT balance FROM roll_wallets WHERE user_id=$1", [userId]);
    return { id: row.id, replayed: true, balance: Number(wallet.rows[0].balance), delivery: row.delivery,
      amount: Number(row.amount), status: row.refunded_at ? "refunded" : "placed" };
  }
  if (expectedPrice !== undefined && expectedPrice !== amount) {
    throw new RollsError("Цена изменилась. Проверьте новую сумму перед оплатой", "PRICE_CHANGED", 409);
  }
  const point = await resolveCdekPoint(client, pickupPointCode);
  if (!point) throw new RollsError("Этот пункт CDEK больше недоступен. Найдите и выберите пункт заново.", "INVALID_PICKUP_POINT", 409);
  const delivery = { provider: "cdek", point };
  const debit = await client.query(
    "UPDATE roll_wallets SET balance=balance-$1 WHERE user_id=$2 AND balance >= $1 RETURNING balance",
    [amount, userId],
  );
  if (!debit.rowCount) throw new RollsError("Недостаточно роллов для покупки", "INSUFFICIENT_ROLLS", 409);
  const id = randomUUID();
  await client.query(
    `INSERT INTO roll_store_purchases (id,user_id,product_id,product_title,amount,idempotency_key,delivery)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [id, userId, productId, productTitle, amount, idempotencyKey, JSON.stringify(delivery)],
  );
  return { id, replayed: false, balance: Number(debit.rows[0].balance), delivery };
}

export async function refundRollPurchase(client, userId, purchaseId) {
  if (typeof purchaseId !== "string" || !purchaseId.trim() || purchaseId.length > 200) {
    throw new RollsError("Некорректный номер заказа", "INVALID_ORDER");
  }
  await ensureRollWallet(client, userId);
  const purchase = await client.query(
    `SELECT id,product_id,product_title,amount,delivery,created_at,refunded_at
     FROM roll_store_purchases WHERE id=$1 AND user_id=$2 FOR UPDATE`,
    [purchaseId, userId],
  );
  if (!purchase.rowCount) return refundGiftCardOrder(client, userId, purchaseId);
  if (purchase.rows[0].delivery?.personalOfferId) {
    throw new RollsError("Для возврата персонального заказа обратитесь к продавцу", "SELLER_REFUND_REQUIRED", 409);
  }
  if (purchase.rows[0].refunded_at) {
    const wallet = await client.query("SELECT balance FROM roll_wallets WHERE user_id=$1", [userId]);
    return { order: orderFromRow(purchase.rows[0]), balance: Number(wallet.rows[0].balance), replayed: true };
  }

  const amount = Number(purchase.rows[0].amount);
  const giftCardId = purchase.rows[0].delivery?.giftCardId;
  // Refund to the original payment source, even if the card has been sent on.
  const credit = giftCardId
    ? await client.query("UPDATE business_gift_cards SET balance=balance+$1 WHERE id=$2 AND balance <= $3 RETURNING balance", [amount, giftCardId, await giftCardCreditLimit(client, giftCardId, amount)])
    : await client.query("UPDATE roll_wallets SET balance=balance+$1 WHERE user_id=$2 AND balance <= $3 RETURNING balance", [amount, userId, ROLLS_MAX_BALANCE - amount]);
  if (!credit.rowCount) throw new RollsError("Баланс достиг лимита", "BALANCE_LIMIT", 409);
  if (giftCardId) {
    await client.query(`INSERT INTO business_gift_card_events(id,card_id,actor_id,kind,amount,request_key)
      VALUES($1,$2,$3,'refund',$4,$5)`, [randomUUID(), giftCardId, userId, amount, randomUUID()]);
  }
  const refunded = await client.query(
    `UPDATE roll_store_purchases SET refunded_at=CURRENT_TIMESTAMP
     WHERE id=$1 AND user_id=$2 RETURNING id,product_id,product_title,amount,delivery,created_at,refunded_at`,
    [purchaseId, userId],
  );
  return { order: orderFromRow(refunded.rows[0]), balance: giftCardId ? Number((await client.query("SELECT balance FROM roll_wallets WHERE user_id=$1", [userId])).rows[0].balance) : Number(credit.rows[0].balance), replayed: false };
}
