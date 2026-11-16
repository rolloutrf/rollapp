import { ROLLS_MAX_TRANSFER } from "../../../shared/modules/payments/rolls.js";

const requestKeyPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const definiteRejections = new Set(["INVALID_TRANSFER", "SELF_TRANSFER", "RECIPIENT_NOT_FOUND", "INSUFFICIENT_ROLLS", "RECIPIENT_BALANCE_LIMIT"]);

export function restoreRollTransfer(key, getStorage = () => globalThis.sessionStorage) {
  let intent;
  try { intent = JSON.parse(getStorage().getItem(key)); } catch { return null; }
  const recipient = intent?.recipient;
  const payload = intent?.payload;
  if (typeof recipient?.id !== "string" || !recipient.id || typeof recipient.name !== "string" ||
      recipient.id !== payload?.recipientId || !Number.isSafeInteger(payload.amount) ||
      payload.amount <= 0 || payload.amount > ROLLS_MAX_TRANSFER || typeof payload.note !== "string" || payload.note.length > 280 ||
      typeof payload.idempotencyKey !== "string" || !requestKeyPattern.test(payload.idempotencyKey)) return null;
  return intent;
}

export function clearRollTransfer(key, requestKey, getStorage = () => globalThis.sessionStorage) {
  try {
    const storage = getStorage();
    if (restoreRollTransfer(key, () => storage)?.payload.idempotencyKey === requestKey) storage.removeItem(key);
  } catch {
    // A persisted record can still be verified and cleared on a later visit.
  }
}

export function rollTransferWasRejected(error) {
  return error.status >= 400 && error.status < 500 && definiteRejections.has(error.code);
}

export function rollTransferMatches(receipt, payload) {
  return Boolean(receipt?.id && receipt.recipientId === payload.recipientId && receipt.amount === payload.amount && receipt.note === payload.note);
}
