import assert from "node:assert/strict";
import test from "node:test";
import { createInvite, drawAvailableNumber, formatMemberNumber, inviteTokenHash, INVITE_LIFETIME_MS, MEMBER_LIMIT, membershipHasCapacity } from "./invites.js";

test("invites are opaque, bound to a normalized email, and expire after ten days", () => {
  const now = new Date("2026-11-06T00:00:00.000Z");
  const first = createInvite({ email: " Person@Example.com ", creatorId: "owner", now });
  const second = createInvite({ email: "Person@Example.com", creatorId: "owner", now });
  assert.match(first.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(first.email, "person@example.com");
  assert.equal(first.expiresAt.getTime() - first.createdAt.getTime(), INVITE_LIFETIME_MS);
  assert.equal(first.tokenHash, inviteTokenHash(first.token));
  assert.notEqual(first.token, second.token);
  assert.notEqual(first.tokenHash, first.token);
});

test("member draw skips occupied numbers and formats the full range", () => {
  const choices = [1, 30_000];
  assert.equal(drawAvailableNumber(new Set([1]), () => choices.shift()), 30_000);
  assert.equal(formatMemberNumber(1), "00001");
  assert.equal(formatMemberNumber(30_000), "30000");
  assert.equal(formatMemberNumber(null), null);
  assert.equal(drawAvailableNumber(new Set(Array.from({ length: MEMBER_LIMIT }, (_, index) => index + 1))), null);
});

test("the thirtieth thousand account is the final available slot", () => {
  assert.equal(membershipHasCapacity("29999"), true);
  assert.equal(membershipHasCapacity("30000"), false);
  assert.equal(membershipHasCapacity("30001"), false);
});
