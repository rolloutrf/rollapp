import test from "node:test";
import assert from "node:assert/strict";
import { issueVirtualCard, listVirtualCards, purchaseWithVirtualCard, readVirtualCard, syncVirtualCard } from "./virtual-card-emulator.js";
function setup() {
  const values = new Map();
  const storage = {
    get length() { return values.size; },
    key: index => [...values.keys()][index] ?? null,
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
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
test("sandbox refuses missing/invalid fundraiser or non-owner issue, invalid purchases, corrupt or unavailable storage", () => {
  const { storage, input } = setup();
  assert.throws(() => issueVirtualCard(storage, { ...input, isOwner: false }));
  assert.throws(() => issueVirtualCard(storage, { ...input, fundraiser: null }));
  assert.throws(() => issueVirtualCard(storage, { ...input, fundraiser: { ...input.fundraiser, raised: -1 } }));
  issueVirtualCard(storage, input, () => "one");
  for (const amount of [0, -1, 1.5, NaN, Infinity]) assert.throws(() => purchaseWithVirtualCard(storage, { ownerId: "owner", fundraiserId: "fund", merchant: "shop", amount, idempotencyKey: "bad" }));
  const broken = { getItem: () => "{}", setItem() { throw new Error("unavailable"); } };
  assert.throws(() => issueVirtualCard(broken, input));
  assert.throws(() => issueVirtualCard({ getItem: () => null, setItem: broken.setItem }, input));
});

test("an active zero-balance card appears in Finance, receives later contributions and preserves purchases", () => {
  const { storage, input } = setup();
  const active = { ...input, groupTitle: "Машинка", fundraiser: { ...input.fundraiser, status: "active", raised: 0 } };
  const issued = issueVirtualCard(storage, active, () => "zero");
  assert.equal(issued.balance, 0);
  assert.deepEqual(listVirtualCards(storage, "owner"), { cards: [issued], hasUnreadableCards: false });
  assert.deepEqual(listVirtualCards(storage, "other"), { cards: [], hasUnreadableCards: false });

  const funded = { ...active, fundraiser: { ...active.fundraiser, raised: 250 } };
  assert.equal(syncVirtualCard(storage, funded).balance, 250);
  purchaseWithVirtualCard(storage, { ownerId: "owner", fundraiserId: "fund", merchant: "shop", amount: 100, idempotencyKey: "buy" });
  const updated = syncVirtualCard(storage, { ...funded, fundraiser: { ...funded.fundraiser, raised: 500 } });
  assert.equal(updated.id, issued.id);
  assert.equal(updated.balance, 400);
  assert.deepEqual(syncVirtualCard(storage, funded), updated);

  storage.setItem("rollapp:virtual-card-sandbox:owner:broken", "null");
  assert.deepEqual(listVirtualCards(storage, "owner"), { cards: [updated], hasUnreadableCards: true });
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
