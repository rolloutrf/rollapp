import test from "node:test";
import assert from "node:assert/strict";
import { createTonBalanceReader } from "./ton-balance.js";
import { formatTon, TON_MAINNET, TON_TESTNET } from "../shared/ton.js";

const address = `0:${"a".repeat(64)}`;

test("TON amounts preserve every nanoton without floating point rounding", () => {
  assert.equal(formatTon("0"), "0");
  assert.equal(formatTon("1"), "0,000000001");
  assert.equal(formatTon("1234567890"), "1,23456789");
  assert.equal(formatTon("9007199254740993123456789").replaceAll(/\s/g, ""), "9007199254740993,123456789");
  for (const invalid of [1, "-1", "1.2", "1e9", "NaN"]) assert.throws(() => formatTon(invalid));
});

test("balance cache deduplicates requests and isolates mainnet from testnet", async () => {
  let now = 100_000;
  const calls = [];
  const read = createTonBalanceReader({ now: () => now, fetchImpl: async (url) => {
    calls.push(url.href);
    return Response.json({ ok: true, result: url.hostname.startsWith("testnet") ? "0" : "1234567890123456789" });
  } });
  const [first, duplicate] = await Promise.all([read(address, TON_MAINNET), read(address, TON_MAINNET)]);
  assert.deepEqual(first, duplicate);
  assert.equal(first.nanotons, "1234567890123456789");
  assert.equal(calls.length, 1);
  assert.equal((await read(address, TON_TESTNET)).nanotons, "0");
  assert.equal(calls.length, 2);
  await read(address, TON_MAINNET);
  assert.equal(calls.length, 2);
  now += 20_001;
  await read(address, TON_MAINNET);
  assert.equal(calls.length, 3);
});

test("invalid network/address never reaches the provider; provider failures never become zero", async () => {
  let calls = 0;
  const read = createTonBalanceReader({ fetchImpl: async () => { calls++; return Response.json({ ok: false, result: "0" }); } });
  await assert.rejects(read("https://attacker.test", TON_MAINNET), { status: 400 });
  await assert.rejects(read(address, "attacker"), { status: 400 });
  assert.equal(calls, 0);
  await assert.rejects(read(address, TON_MAINNET), { status: 502 });
  assert.equal(calls, 1);
});

test("provider timeout ends and permits a later retry", async () => {
  let healthy = false;
  const read = createTonBalanceReader({ env: { TONCENTER_API_KEY: "test-key" }, timeoutMs: 20, fetchImpl: async (_url, { signal }) => {
    if (healthy) return Response.json({ ok: true, result: "5" });
    return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("timeout")), { once: true }));
  } });
  await assert.rejects(read(address, TON_MAINNET), { status: 502 });
  healthy = true;
  assert.equal((await read(address, TON_MAINNET)).nanotons, "5");
});
