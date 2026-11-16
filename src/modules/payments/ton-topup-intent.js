import { TON_MAINNET } from "../../../shared/modules/payments/ton.js";

const address = /^0:[a-f0-9]{64}$/i;
export const isTonOrderId = (value) => typeof value === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
export const tonOrderStorageKey = (userId) => `rollapp:ton-order:${userId}`;
const trackedKey = (userId) => `rollapp:ton-tracked-order:${userId}`;

export function readTonIntent(userId) {
  try {
    const intent = JSON.parse(sessionStorage.getItem(tonOrderStorageKey(userId)));
    const { idempotencyKey, sender, chain, rolls, acceptedTerms, quote } = intent ?? {};
    if (!isTonOrderId(idempotencyKey) || !address.test(sender) || chain !== TON_MAINNET || acceptedTerms !== true ||
        ![100, 500, 1000].includes(rolls) || !/^(-?\d{1,3}):[a-f0-9]{64}$/i.test(quote?.recipient) ||
        typeof quote?.nanotons !== "string" || !/^[1-9]\d{0,39}$/.test(quote.nanotons)) return null;
    return intent;
  } catch { return null; }
}

export function readTrackedTonOrder(userId) {
  try {
    const id = sessionStorage.getItem(trackedKey(userId));
    return isTonOrderId(id) ? id : null;
  } catch { return null; }
}

export function trackTonOrder(userId, id) {
  try { sessionStorage.setItem(trackedKey(userId), id); } catch { /* The account history still contains the order. */ }
}

export function clearTrackedTonOrder(userId, id) {
  try {
    if (readTrackedTonOrder(userId) === id) sessionStorage.removeItem(trackedKey(userId));
  } catch { /* The account history still contains the order. */ }
}

export function tonOrderMatchesIntent(order, intent) {
  return order.rolls === intent.rolls && order.sender === intent.sender && order.chain === intent.chain &&
    order.recipient === intent.quote.recipient && order.nanotons === intent.quote.nanotons;
}
