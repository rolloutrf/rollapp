import test from "node:test";
import assert from "node:assert/strict";
import { issueVirtualCard, purchaseWithVirtualCard, readVirtualCard } from "./virtual-card-emulator.js";
function setup() {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const input = { ownerId: "owner", isOwner: true, fundraiser: { id: "fund", raised: 1000, target: 1000, status: "completed" } };
  return { storage, input };
}
test("sandbox issues once, isolates owners/funds, preserves purchase balance on reload and repeat", () => {
  const { storage, input } = setup();
  const card = issueVirtualCard(storage, input, () => "one");
  const purchase = { ownerId: "owner", fundraiserId: "fund", merchant: "Магазин", amount: 300, idempotencyKey: "purchase" };
  assert.equal(purchaseWithVirtualCard(storage, purchase).balance, 700);
  assert.equal(purchaseWithVirtualCard(storage, purchase).balance, 700);
  assert.equal(issueVirtualCard(storage, input).id, card.id);
  assert.equal(issueVirtualCard(storage, input).balance, 700);
  assert.equal(readVirtualCard(storage, "other", "fund"), null);
  assert.equal(readVirtualCard(storage, "owner", "other"), null);
  assert.throws(() => purchaseWithVirtualCard(storage, { ...purchase, amount: 301 }), /другой покупки/);
  assert.throws(() => purchaseWithVirtualCard(storage, { ...purchase, amount: 701, idempotencyKey: "two" }), /Недостаточно/);
  assert.equal(readVirtualCard(storage, "owner", "fund").balance, 700);
});
test("sandbox refuses premature/non-owner issue, invalid purchases, corrupt or unavailable storage", () => {
  const { storage, input } = setup();
  assert.throws(() => issueVirtualCard(storage, { ...input, isOwner: false }));
  assert.throws(() => issueVirtualCard(storage, { ...input, fundraiser: { ...input.fundraiser, status: "active" } }));
  issueVirtualCard(storage, input, () => "one");
  for (const amount of [0, -1, 1.5, NaN, Infinity]) assert.throws(() => purchaseWithVirtualCard(storage, { ownerId: "owner", fundraiserId: "fund", merchant: "shop", amount, idempotencyKey: "bad" }));
  const broken = { getItem: () => "{}", setItem() { throw new Error("unavailable"); } };
  assert.throws(() => issueVirtualCard(broken, input));
  assert.throws(() => issueVirtualCard({ getItem: () => null, setItem: broken.setItem }, input));
});

test("a rejected sandbox storage write leaves the original balance and history intact", () => {
  const { storage, input } = setup();
  issueVirtualCard(storage, input, () => "one");
  assert.throws(() => purchaseWithVirtualCard({ getItem: storage.getItem, setItem() { throw new Error("quota"); } },
    { ownerId: "owner", fundraiserId: "fund", merchant: "shop", amount: 100, idempotencyKey: "buy" }), /quota/);
  assert.equal(readVirtualCard(storage, "owner", "fund").balance, 1000);
  assert.deepEqual(readVirtualCard(storage, "owner", "fund").purchases, []);
  const corrupt = { getItem: () => JSON.stringify({ ...readVirtualCard(storage, "owner", "fund"), balance: 999 }) };
  assert.throws(() => readVirtualCard(corrupt, "owner", "fund"), /не совпадает/);
});
