import assert from "node:assert/strict";
import { test } from "node:test";
import { maxSavedSessions, readAccountSessions, sessionTokens } from "./account-sessions.js";
import { hashToken } from "./security.js";

const token = (character) => character.repeat(43);

test("the saved session cookie accepts a bounded list of unique opaque tokens", () => {
  assert.deepEqual(sessionTokens([token("a"), "invalid", token("a"), token("b")].join(".")), [token("a"), token("b")]);
  assert.deepEqual(sessionTokens(Array.from({ length: maxSavedSessions + 1 }, (_, i) => token(String(i))).join(".")), []);
  assert.deepEqual(sessionTokens({ token: token("a") }), []);
});

test("account switching resolves only the browser's live sessions and prefers the active session for duplicates", async () => {
  const active = token("a");
  const duplicate = token("b");
  const saved = token("c");
  const revoked = token("d");
  const expired = token("e");
  const now = new Date("2026-11-07T10:00:00Z");
  const expiry = new Date("2026-11-08T10:00:00Z");
  const row = (value, id) => ({ token_hash: hashToken(value), id, expires_at: expiry });
  const sessions = await readAccountSessions(async (sql, params) => {
    assert.match(sql, /s\.token_hash=ANY\(\$1::text\[\]\) AND s\.expires_at>\$2/);
    assert.deepEqual(params, [[active, duplicate, saved, revoked, expired].map(hashToken), now]);
    return { rows: [row(saved, "business"), row(duplicate, "personal"), row(active, "personal")] };
  }, { activeToken: active, savedTokens: [duplicate, saved, revoked, expired].join(".") }, now);
  assert.deepEqual(sessions.map(({ user, token, expiresAt }) => [user.id, token, expiresAt]), [
    ["personal", active, expiry],
    ["business", saved, expiry],
  ]);
});
