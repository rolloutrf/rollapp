import assert from "node:assert/strict";
import test from "node:test";
import { canRegisterInvitedAccount, createInvite, drawAvailableNumber, formatMemberNumber, inviteTokenHash, INVITE_LIFETIME_MS, MEMBER_LIMIT, requireMemberNumberAccount } from "./invites.js";

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

test("only personal registration uses the thirty thousand membership slots", async () => {
  const queryWithCount = (count) => ({ query: async (sql) => {
    assert.match(sql, /WHERE account_type='personal'/);
    return { rows: [{ count }] };
  } });
  assert.equal(await canRegisterInvitedAccount(queryWithCount("29999"), "personal"), true);
  assert.equal(await canRegisterInvitedAccount(queryWithCount("30000"), "personal"), false);
  assert.equal(await canRegisterInvitedAccount(queryWithCount("30001"), "personal"), false);
  assert.equal(await canRegisterInvitedAccount({}, "business"), true);
});

test("membership routes pass only a personal account to the handler", () => {
  const res = {
    status: (status) => {
      assert.equal(status, 403);
      return { json: (body) => body.code };
    },
  };
  const next = () => "handler";
  assert.equal(requireMemberNumberAccount({ user: { account_type: "personal" } }, res, next), "handler");
  assert.equal(requireMemberNumberAccount({ user: { account_type: "business" } }, res, next), "MEMBER_NUMBER_PERSONAL_ONLY");
});
