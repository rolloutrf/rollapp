import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { contributionSchema, fundraiserTargetSchema, fundraiserUpdateSchema, publicFundraiser } from "./wish-group-fundraising.js";

test("fundraiser targets and contributions accept only bounded whole rolls and stable request IDs", () => {
  for (const target of [0, -1, 1.5, "100", 1_000_000_001, Infinity]) assert.equal(fundraiserTargetSchema.safeParse({ target }).success, false);
  for (const target of [1, 1_000_000_000]) assert.equal(fundraiserTargetSchema.safeParse({ target }).success, true);
  assert.equal(fundraiserTargetSchema.safeParse({ target: 10, raised: 9 }).success, false);
  assert.equal(fundraiserUpdateSchema.safeParse({ target: 10, accepting: false }).success, true);
  assert.equal(fundraiserUpdateSchema.safeParse({ target: 10 }).success, false);
  const input = { amount: 10, idempotencyKey: randomUUID() };
  assert.deepEqual(contributionSchema.parse(input), { ...input, shareToken: "" });
  for (const extra of [{ amount: 0 }, { amount: 0.1 }, { idempotencyKey: "" }, { recipientId: "another-owner" }, { amount: "10" }]) {
    assert.equal(contributionSchema.safeParse({ ...input, ...extra }).success, false);
  }
});

test("public fundraiser exposes progress without owners, keys or donor identities", () => {
  assert.equal(publicFundraiser(null), null);
  const row = { id: "fund", owner_id: "secret", target: "1000", raised: "200", contributors: "2", accepting: true };
  assert.deepEqual(publicFundraiser(row), { id: "fund", target: 1000, raised: 200, contributors: 2, accepting: true, status: "active" });
  assert.equal(publicFundraiser({ ...row, accepting: false }).status, "closed");
  assert.equal(publicFundraiser({ ...row, raised: "1000", accepting: false }).status, "completed");
});
