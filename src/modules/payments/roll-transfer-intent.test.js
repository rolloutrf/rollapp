import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { clearRollTransfer, restoreRollTransfer, rollTransferMatches, rollTransferWasRejected } from "./roll-transfer-intent.js";

const key = "rollapp:pending-roll-transfer:owner";
const payload = { recipientId: "recipient", amount: 40, note: "Комментарий", idempotencyKey: randomUUID() };
const intent = { recipient: { id: "recipient", name: "Получатель" }, payload };

test("transfer recovery preserves the original identity and exact payload under its owner key", () => {
  const values = new Map([[key, JSON.stringify(intent)]]);
  const access = () => ({ getItem: (name) => values.get(name), removeItem: (name) => values.delete(name) });
  assert.deepEqual(restoreRollTransfer(key, access), intent);
  assert.equal(restoreRollTransfer("another-owner", access), null);
  clearRollTransfer(key, randomUUID(), access);
  assert.deepEqual(restoreRollTransfer(key, access), intent);
  clearRollTransfer(key, payload.idempotencyKey, access);
  assert.equal(restoreRollTransfer(key, access), null);
  values.set(key, JSON.stringify({ ...intent, payload: { ...payload, amount: -3 } }));
  assert.equal(restoreRollTransfer(key, access), null);
  const forbidden = () => { throw new Error("Storage not available"); };
  assert.equal(restoreRollTransfer(key, forbidden), null);
  assert.doesNotThrow(() => clearRollTransfer(key, payload.idempotencyKey, forbidden));
});

test("only exact requested terms confirm posting and only definitive errors clear recovery", () => {
  const receipt = { ...payload, id: "record" };
  assert(rollTransferMatches(receipt, payload));
  for (const other of [null, { ...receipt, note: "" }, { ...receipt, amount: 41 }, { ...receipt, recipientId: "somebody-else" }]) {
    assert(!rollTransferMatches(other, payload));
  }
  assert(rollTransferWasRejected({ status: 409, code: "INSUFFICIENT_ROLLS" }));
  for (const error of [{ status: 401 }, { status: 403 }, { status: 409, code: "ACTIVE_ACCOUNT_CHANGED" },
    { status: 409, code: "IDEMPOTENCY_CONFLICT" }, { status: 429 }, { status: 503 }, {}]) assert(!rollTransferWasRejected(error));
});
