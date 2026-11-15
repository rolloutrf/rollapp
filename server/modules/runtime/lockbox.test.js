import assert from "node:assert/strict";
import test from "node:test";
import { loadLockboxValue } from "./lockbox.js";

const env = { YC_LOCKBOX_SOURCE: "iam", YC_IAM_TOKEN: "PRIVATE-IAM-TOKEN" };
test("default VM source still obtains its own metadata token, ignoring explicit CI credentials", async t => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url, ...options });
    return { ok: true, json: async () => calls.length === 1 ? { access_token: "VM-METADATA-TOKEN" } : { entries: [{ key: "key", textValue: "value" }] } };
  });
  assert.equal(await loadLockboxValue("secret", "key", { YC_IAM_TOKEN: env.YC_IAM_TOKEN }), "value");
  assert.equal(calls.length, 2);assert.match(calls[0].url, /^http:\/\/169\.254\.169\.254\//);
  assert.equal(calls[0].headers["Metadata-Flavor"], "Google");
  assert.equal(calls[1].headers.Authorization, "Bearer VM-METADATA-TOKEN");
});
test("explicit IAM source reads the official Lockbox endpoint without CLI/metadata or redirects", async t => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url, ...options });
    return { ok: true, json: async () => ({ entries: [{ key: "bot_token", textValue: "PRIVATE-BOT-TOKEN" }] }) };
  });
  assert.equal(await loadLockboxValue("secret1", "bot_token", env), "PRIVATE-BOT-TOKEN");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://payload.lockbox.api.cloud.yandex.net/lockbox/v1/secrets/secret1/payload");
  assert.equal(calls[0].headers.Authorization, `Bearer ${env.YC_IAM_TOKEN}`);
  assert.equal(calls[0].redirect, "error");assert(calls[0].signal instanceof AbortSignal);
});
test("IAM Lockbox validates configuration before any request", async t => {
  t.mock.method(globalThis, "fetch", async () => assert.fail("No request for invalid config"));
  for (const [secret, config] of [["../secret", env], ["x".repeat(51), env], ["secret", { ...env, YC_IAM_TOKEN: "" }], ["secret", { ...env, YC_IAM_TOKEN: "PRIVATE\nTOKEN" }]]) {
    await assert.rejects(loadLockboxValue(secret, "key", config), /Invalid IAM Lockbox configuration/);
  }
});
test("IAM Lockbox errors redact secrets and never parse HTTP error bodies or retry", async t => {
  for (const failure of [new Error("PRIVATE-IAM-TOKEN PRIVATE-BOT-TOKEN"), { ok: false, status: 403, json: async () => assert.fail("Do not parse an error body") }, { ok: true, json: async () => { throw new Error("PRIVATE-BOT-TOKEN"); } }]) {
    let calls = 0;
    const mock = t.mock.method(globalThis, "fetch", async () => { calls++;if (failure instanceof Error) throw failure;return failure; });
    await assert.rejects(loadLockboxValue("secret", "key", env), error => !/PRIVATE/.test(error.message));
    assert.equal(calls, 1);mock.mock.restore();
  }
});
test("IAM Lockbox fails closed on missing, empty, binary or duplicate text entries", async t => {
  for (const payload of [null, {}, { entries: {} }, { entries: [] }, { entries: [{ key: "key", textValue: "" }] }, { entries: [{ key: "key", binaryValue: "secret" }] }, { entries: [{ key: "key", textValue: "value", binaryValue: "secret" }] }, { entries: [{ key: "key", textValue: "a" }, { key: "key", textValue: "b" }] }]) {
    const mock = t.mock.method(globalThis, "fetch", async () => ({ ok: true, json: async () => payload }));
    await assert.rejects(loadLockboxValue("secret", "key", env), /text key missing or ambiguous/);mock.mock.restore();
  }
});
