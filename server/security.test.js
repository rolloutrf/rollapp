import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword, hashToken, slugify, verifyPassword } from "./security.js";

test("password hashes are salted and verifiable", async () => {
  const first = await hashPassword("correct horse battery staple");
  const second = await hashPassword("correct horse battery staple");
  assert.notEqual(first, second);
  assert.equal(await verifyPassword("correct horse battery staple", first), true);
  assert.equal(await verifyPassword("wrong password", first), false);
});

test("tokens are stored as stable one-way hashes", () => {
  assert.equal(hashToken("session-token"), hashToken("session-token"));
  assert.notEqual(hashToken("session-token"), hashToken("another-token"));
});

test("profile names become URL-safe slugs", () => {
  assert.equal(slugify("Алиса Морозова"), "alisa-morozova");
  assert.equal(slugify("  Max & Co  "), "max-co");
});
