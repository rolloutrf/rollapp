import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { rollPurchaseSchema, rollTransferSchema } from "./rolls.js";
import { formatRolls } from "../shared/rolls.js";

test("roll transfers reject fractional, negative, unsafe and coerced amounts", () => {
  const input = { recipientId: "recipient", amount: 1, idempotencyKey: randomUUID() };
  for (const amount of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER, "10", null]) {
    assert.equal(rollTransferSchema.safeParse({ ...input, amount }).success, false, String(amount));
  }
  assert.equal(rollTransferSchema.safeParse(input).success, true);
  assert.equal(rollTransferSchema.safeParse({ ...input, senderId: "other-user" }).success, false);
  assert.equal(rollTransferSchema.safeParse({ ...input, idempotencyKey: "" }).success, false);
  assert.equal(rollTransferSchema.safeParse({ ...input, note: "x".repeat(281) }).success, false);
});

test("store purchases require a pickup point and reject client prices and addresses", () => {
  const input = { productId: "cat:red", idempotencyKey: randomUUID(), pickupPointCode: "MSK180" };
  assert.equal(rollPurchaseSchema.safeParse(input).success, true);
  assert.equal(rollPurchaseSchema.safeParse({ ...input, amount: 1 }).success, false);
  assert.equal(rollPurchaseSchema.safeParse({ ...input, productTitle: "Подменённый товар" }).success, false);
  assert.equal(rollPurchaseSchema.safeParse({ ...input, idempotencyKey: "" }).success, false);
  assert.equal(rollPurchaseSchema.safeParse({ ...input, pickupPointCode: undefined }).success, false);
  assert.equal(rollPurchaseSchema.safeParse({ ...input, delivery: { address: "fake" } }).success, false);
});

test("Russian rolls amounts have the right plural forms", () => {
  for (const [amount, expected] of [[0, "0 роллов"], [1, "1 ролл"], [2, "2 ролла"], [5, "5 роллов"], [11, "11 роллов"], [14, "14 роллов"], [21, "21 ролл"], [22, "22 ролла"], [100, "100 роллов"], [111, "111 роллов"]]) {
    assert.equal(formatRolls(amount), expected);
  }
});
