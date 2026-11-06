import assert from "node:assert/strict";
import { test } from "node:test";
import { createRegistrationInvite, findRegistrationInvite, INVITE_TTL_MS, readRegistrationInvite } from "./registration-invites.js";

const secret = "registration-test-key".repeat(3);

test("signed invite binds an issuer and one new account ID and expires after seven days", () => {
  const now = Date.UTC(2026, 10, 6);
  const { token, expiresAt } = createRegistrationInvite("issuer", secret, now);
  const invite = readRegistrationInvite(token, secret, expiresAt - 1);
  assert.equal(expiresAt, now + INVITE_TTL_MS);
  assert.equal(invite.issuerId, "issuer");
  assert.match(invite.accountId, /^[0-9a-f-]{36}$/);
  assert.notEqual(invite.accountId, readRegistrationInvite(createRegistrationInvite("issuer", secret, now).token, secret, now).accountId);
  assert.equal(readRegistrationInvite(token, secret, expiresAt), null);
  assert.equal(readRegistrationInvite(token, "another-secret".repeat(3), now), null);
  const [payload, mac] = token.split(".");
  const edited = Buffer.from(JSON.stringify(["another-issuer", invite.accountId, expiresAt])).toString("base64url");
  assert.equal(readRegistrationInvite(`${edited}.${mac}`, secret, now), null);
  assert.equal(readRegistrationInvite(`${payload}.${mac}.extra`, secret, now), null);
  assert.equal(readRegistrationInvite(`${token}\n`, secret, now), null);
});

test("an invalid token cannot reach the user lookup", async () => {
  await assert.doesNotReject(async () => {
    const invite = await findRegistrationInvite(() => assert.fail("unexpected user lookup"), "malformed", secret);
    assert.equal(invite, null);
  });
});
