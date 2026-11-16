import { randomUUID } from "node:crypto";
import { z } from "zod";
import { MARKETPLACE_ORDER_NOTE_LIMIT, MARKETPLACE_REVIEW_DAYS, marketplaceOrderActions } from "../../../shared/modules/checkout/marketplace-settlements.js";
import { ROLLS_MAX_BALANCE } from "../../../shared/modules/payments/rolls.js";
import { giftCardCreditLimit } from "../loyalty/gift-card-balances.js";
import { lockOwnedGiftCard, recordGiftEvent } from "../loyalty/gift-cards.js";
import { ensureRollWallet, RollsError } from "../payments/rolls.js";
import { hasMarketplaceSettlementSchema } from "./marketplace-settlements-schema.js";

const participantAction = z.enum(["cancel", "fulfill", "accept", "dispute", "claim", "refund"]);

export const marketplaceOrderActionSchema = z.object({
  action: participantAction,
  expectedAmount: z.number().int().min(1).max(1_000_000).optional(),
  note: z.string().trim().max(MARKETPLACE_ORDER_NOTE_LIMIT).default(""),
}).strict().refine(({ action, note }) => action === "dispute" ? Boolean(note) : action === "fulfill" || !note);

const staffActionSchema = z.object({
  action: z.enum(["resolve_release", "resolve_refund"]),
  operator: z.string().trim().min(1).max(200),
  expectedAmount: z.number().int().min(1).max(1_000_000),
  note: z.string().trim().min(1).max(MARKETPLACE_ORDER_NOTE_LIMIT),
}).strict();

// The catalogue checks the quote and owns the item lock. Its buyer wallet
// lock serializes request keys with purchases and gift-card operations.
export async function reserveMarketplacePurchase(client, buyerId, item, { giftCardId, idempotencyKey }) {
  const id = randomUUID();
  const amount = Number(item.price_rolls);
  let balance;
  if (giftCardId) {
    const card = await lockOwnedGiftCard(client, buyerId, giftCardId);
    if (card.business_id !== item.business_user_id) throw new RollsError("Карта действует только у своего бизнеса", "GIFT_CARD_BUSINESS_MISMATCH", 409);
    const debit = await client.query("UPDATE business_gift_cards SET balance=balance-$1 WHERE id=$2 AND balance >= $1 RETURNING id", [amount, giftCardId]);
    if (!debit.rowCount) throw new RollsError("На карте недостаточно роллов", "INSUFFICIENT_GIFT_ROLLS", 409);
    // Keep the event in the card ledger. Leaving purchase metadata empty
    // makes this reserve invisible to legacy readers and refund endpoints.
    await recordGiftEvent(client, { id, cardId: giftCardId, userId: buyerId, kind: "spend", amount, requestKey: idempotencyKey });
    const wallet = await client.query("SELECT balance FROM roll_wallets WHERE user_id=$1", [buyerId]);
    balance = Number(wallet.rows[0].balance);
  } else {
    const debit = await client.query("UPDATE roll_wallets SET balance=balance-$1 WHERE user_id=$2 AND balance >= $1 RETURNING balance", [amount, buyerId]);
    if (!debit.rowCount) throw new RollsError("Недостаточно роллов для покупки", "INSUFFICIENT_ROLLS", 409);
    balance = Number(debit.rows[0].balance);
  }
  await client.query(`INSERT INTO roll_marketplace_orders
    (id,buyer_id,seller_id,item_id,item_title,sphere,buyer_name,seller_name,amount,request_key,gift_card_id,gift_payment_id)
    SELECT $1,u.id,$3,$4,$5,$6,u.name,$7,$8,$9,$10,$11 FROM users u WHERE u.id=$2`,
  [id, buyerId, item.business_user_id, item.id, item.title, item.sphere, item.business_name, amount, idempotencyKey, giftCardId ?? null, giftCardId ? id : null]);
  return { id, replayed: false, balance, protected: true };
}

async function releaseMarketplaceFunds(client, order, release) {
  const amount = Number(order.amount);
  if (!release && order.gift_card_id) {
    const limit = await giftCardCreditLimit(client, order.gift_card_id, amount, { refundedOrderId: order.id });
    const credit = await client.query(
      "UPDATE business_gift_cards SET balance=balance+$1 WHERE id=$2 AND balance <= $3 RETURNING id",
      [amount, order.gift_card_id, limit],
    );
    if (!credit.rowCount) throw new RollsError("На исходной карте нужно освободить место для возврата", "GIFT_CARD_LIMIT", 409);
    await client.query(`INSERT INTO business_gift_card_events(id,card_id,actor_id,kind,amount,request_key,purchase_id)
      VALUES ($1,$2,$3,'refund',$4,$5,$6)`, [randomUUID(), order.gift_card_id, order.buyer_id, amount, randomUUID(), order.gift_payment_id]);
    return;
  }
  const recipient = release ? order.seller_id : order.buyer_id;
  await ensureRollWallet(client, recipient);
  const credit = await client.query(
    "UPDATE roll_wallets SET balance=balance+$1 WHERE user_id=$2 AND balance <= $3 RETURNING user_id",
    [amount, recipient, ROLLS_MAX_BALANCE - amount],
  );
  if (!credit.rowCount) throw new RollsError("В кошельке получателя нужно освободить место для этой операции", "BALANCE_LIMIT", 409);
}

function isRelease(action) {
  return ["accept", "claim", "resolve_release"].includes(action);
}

export async function readMarketplaceOrderAction(client, actorId, orderId, action) {
  const notFound = () => new RollsError("Заказ не найден", "ORDER_NOT_FOUND", 404);
  if (!z.uuid().safeParse(orderId).success || !participantAction.safeParse(action).success ||
      !await hasMarketplaceSettlementSchema(client)) throw notFound();
  const { rows: [order] } = await client.query(`
    SELECT o.id,o.buyer_id,o.status,o.amount,o.review_until,statement_timestamp() AS now,e.note,e.created_at AS action_at
    FROM roll_marketplace_orders o LEFT JOIN roll_marketplace_order_events e
      ON e.order_id=o.id AND e.action=$3 AND e.actor_id=$2
    WHERE o.id=$1 AND (o.buyer_id=$2 OR o.seller_id=$2)
  `, [orderId, actorId, action]);
  if (!order) throw notFound();
  const role = actorId === order.buyer_id ? "buyer" : "seller";
  return {
    id: order.id, status: order.status, amount: Number(order.amount), role, action,
    recorded: order.action_at ? { note: order.note, at: order.action_at } : null,
    available: marketplaceOrderActions(order, role, order.now).includes(action),
  };
}

async function performMarketplaceOrderAction(client, orderId, actorId, input, staff) {
  const notFound = () => new RollsError("Заказ не найден", "ORDER_NOT_FOUND", 404);
  if (!z.string().uuid().safeParse(orderId).success || !await hasMarketplaceSettlementSchema(client)) throw notFound();
  const parsed = (staff ? staffActionSchema : marketplaceOrderActionSchema).safeParse(input);
  if (!parsed.success) throw new RollsError("Проверьте действие и комментарий", "INVALID_ORDER_ACTION");
  const { action, note, operator, expectedAmount } = parsed.data;

  // Lock the deal first, then just the destination account for a terminal
  // action. A terminal event and the money movement have one commit.
  const { rows: [order] } = await client.query(`SELECT * FROM roll_marketplace_orders
    WHERE id=$1 AND ($3 OR buyer_id=$2 OR seller_id=$2) FOR UPDATE`, [orderId, actorId, staff]);
  if (!order) throw notFound();
  if (expectedAmount !== undefined && Number(order.amount) !== expectedAmount) {
    throw new RollsError("Сумма заказа отличается от указанной", "ORDER_AMOUNT_MISMATCH", 409);
  }
  const role = staff ? "operator" : actorId === order.buyer_id ? "buyer" : "seller";
  const { rows: [{ now }] } = await client.query("SELECT clock_timestamp() AS now");
  const { rows: [recorded] } = await client.query(
    "SELECT actor_id,operator_label,note FROM roll_marketplace_order_events WHERE order_id=$1 AND action=$2", [orderId, action],
  );
  if (recorded) {
    if (recorded.actor_id !== actorId) throw new RollsError("Действие уже выполнено", "ORDER_ACTION_UNAVAILABLE", 409);
    if (recorded.note !== note || recorded.operator_label !== (operator ?? null)) {
      throw new RollsError("Это действие уже выполнено с другими параметрами", "ORDER_ACTION_CONFLICT", 409);
    }
    return { id: order.id, status: order.status, replayed: true };
  }
  if (!marketplaceOrderActions(order, role, now).includes(action)) {
    throw new RollsError("Состояние заказа изменилось. Обновите его и проверьте доступные действия.", "ORDER_ACTION_UNAVAILABLE", 409);
  }
  let status;
  let reviewUntil = order.review_until;
  let closedAt = null;
  if (action === "fulfill") {
    status = "fulfilled";
    reviewUntil = new Date(now.getTime() + MARKETPLACE_REVIEW_DAYS * 86_400_000);
  } else if (action === "dispute") {
    status = "disputed";
  } else {
    const release = isRelease(action);
    await releaseMarketplaceFunds(client, order, release);
    status = release ? "released" : "refunded";
    closedAt = now;
  }
  await client.query(`INSERT INTO roll_marketplace_order_events(order_id,action,actor_id,operator_label,note,created_at)
    VALUES($1,$2,$3,$4,$5,$6)`, [orderId, action, actorId, operator ?? null, note, now]);
  await client.query("UPDATE roll_marketplace_orders SET status=$2,review_until=$3,closed_at=$4 WHERE id=$1",
    [orderId, status, reviewUntil, closedAt]);
  return { id: order.id, status, replayed: false };
}

export function settleMarketplaceOrder(client, userId, orderId, input) {
  return performMarketplaceOrderAction(client, orderId, userId, input, false);
}

export function resolveMarketplaceDispute(client, orderId, input) {
  return performMarketplaceOrderAction(client, orderId, null, input, true);
}
