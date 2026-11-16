import { z } from "zod";
import { ROLL_RECEIPT_KINDS } from "../../../shared/modules/history/roll-receipt.js";
import { formatTon } from "../../../shared/modules/payments/ton.js";
import { readRollAccountingSources, rollInvoiceJoins, rollWalletEntries } from "../payments/roll-accounting.js";
import { readRollOrders } from "./order-history.js";

export const rollReceiptParams = z.object({
  kind: z.enum(Object.keys(ROLL_RECEIPT_KINDS)),
  id: z.string().min(1).max(250).regex(/^[^\u0000-\u001f\u007f]+$/u),
}).strict();

async function readOrderReceipt(client, userId, id) {
  const { orders: [order] } = await readRollOrders(client, userId, { orderId: id });
  if (!order) return null;
  return {
    version: 1, id: order.id, kind: "order", currency: "rolls", amount: String(order.amount),
    status: order.status, createdAt: order.createdAt, closedAt: order.closedAt ?? order.refundedAt,
    subject: order.productTitle, role: order.settlement?.role ?? "buyer",
    participant: order.settlement?.participant ? { name: order.settlement.participant } : null,
    source: order.settlement ? order.settlement.source : order.delivery?.giftCardId ? "gift" : "wallet",
  };
}

const orderPrefixes = {
  purchase: "purchase:", refund: "refund:", market_reserve: "market-reserve:",
  market_refund: "market-refund:", market_sale: "market-sale:",
};

export async function readRollReceipt(client, userId, { kind, id }) {
  if (kind === "order") return readOrderReceipt(client, userId, id);
  const sources = await readRollAccountingSources(client);
  const { rows: [entry] } = await client.query(`
    SELECT e.id,e.kind,e.direction,e.amount::text AS amount,COALESCE(invoice.item_title,e.subject) AS subject,
      e.created_at,u.name AS person_name,u.username AS person_username,
      invoice.purchase_id,original.id AS reversal_of,
      CASE WHEN e.kind IN ('stars_topup','ton_topup') THEN e.note END AS provider_amount
    FROM (${rollWalletEntries(sources)}) e
    LEFT JOIN users u ON e.kind='transfer' AND u.id=e.person_id
    ${rollInvoiceJoins}
    WHERE e.account_id=$1 AND e.kind=$2 AND e.id=$3`, [userId, kind, id]);
  if (!entry) return null;
  const orderPrefix = orderPrefixes[kind];
  return {
    version: 1, id: entry.id, kind: entry.kind, currency: "rolls", status: "recorded",
    amount: entry.amount, direction: entry.direction, createdAt: entry.created_at, subject: entry.subject,
    orderId: entry.purchase_id ?? (orderPrefix && entry.id.startsWith(orderPrefix) ? entry.id.slice(orderPrefix.length) : null),
    purpose: entry.purchase_id ? (entry.reversal_of ? "personal_offer_refund" : "personal_offer_payment") : null,
    ...(entry.provider_amount && { paidWith: entry.kind === "ton_topup" ? `${formatTon(entry.provider_amount)} TON` : entry.provider_amount }),
    participant: entry.person_name || entry.person_username
      ? { name: entry.person_name, username: entry.person_username }
      : null,
  };
}
