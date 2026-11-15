import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { rewardReceipt, verifyRewardBitcoin, advanceRewardProof, REWARD_PROOF_CALENDARS } from "./reward-blockchain-proof.js";

const receipt = { offerId: "offer", businessId: "business", recipientId: "person", kind: "reward", amount: 10, createdAt: "2026-11-01T12:00:00Z" };
const salt = "12".repeat(32);
const header = "01000000" + "00".repeat(32) + "3ba3edfd7a7b12b27ac72c3e67768f617fc81bc3888a51323a9fb8aa4b1e5e4a" + "29ab5f49ffff001d1dac2b7c";
const hash = "000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f";
const commitment = Buffer.from(header, "hex").subarray(36, 68).toString("hex");
function explorer({ disagree = false, tip = "10", wrongHeader = false } = {}) {
  return async (url, options) => {
    assert.equal(options.redirect, "error");
    if (url.endsWith("/block-height/0")) return new Response(disagree && url.includes("mempool") ? "f".repeat(64) : hash);
    if (url.endsWith("/blocks/tip/height")) return new Response(tip);
    if (url.endsWith("/header")) return new Response(wrongHeader ? "0".repeat(160) : header);
    assert.fail(`Unexpected explorer endpoint ${url}`);
  };
}
test("receipt has a private random salt, domain-separated canonical payload and exact digest", () => {
  const result = rewardReceipt(receipt, salt);
  assert.equal(result.digest, createHash("sha256").update(result.content).digest("hex"));
  const decoded = JSON.parse(result.content);
  assert.equal(decoded.currency, "rolls"); assert.equal(decoded.domain, "rollapp:funded-need-receipt"); assert.equal(decoded.salt, salt);
  assert.equal(rewardReceipt({ ...receipt }, salt).digest, result.digest);
  assert.notEqual(rewardReceipt(receipt).digest, rewardReceipt(receipt).digest);
  for (const bad of [{ amount: 0 }, { amount: 1.1 }, { amount: 1000001 }, { kind: "mint" }, { createdAt: "invalid" }, { businessId: "" }]) assert.throws(() => rewardReceipt({ ...receipt, ...bad }, salt));
});
test("Bitcoin verification checks exact merkle root/header hash and two matching canonical explorers", async () => {
  const result = await verifyRewardBitcoin([{ height: 0, commitment }], { fetchImpl: explorer() });
  assert.equal(result.hash, hash); assert.equal(result.height, 0); assert.equal(result.verification, "two-explorer-headers");
  assert.equal(await verifyRewardBitcoin([{ height: 0, commitment }], { fetchImpl: explorer({ disagree: true }) }), null);
  assert.equal(await verifyRewardBitcoin([{ height: 0, commitment }], { fetchImpl: explorer({ wrongHeader: true }) }), null);
  assert.equal(await verifyRewardBitcoin([{ height: 0, commitment: "00".repeat(32) }], { fetchImpl: explorer() }), null);
  assert.equal(await verifyRewardBitcoin([{ height: 0, commitment }], { fetchImpl: explorer({ tip: "4" }) }), null);
});
test("calendar acceptance is pending, never a blockchain confirmation, and transmits only 32 opaque bytes", async () => {
  const { digest, content } = rewardReceipt(receipt, salt);
  const calls = [];
  const result = await advanceRewardProof({ digest }, {
    fetchImpl: async (url, options) => {
      calls.push(url); assert(REWARD_PROOF_CALENDARS.some(origin => url === `${origin}/digest`));
      assert.equal(options.body.length, 32); assert.equal(options.body.toString("hex"), digest);
      assert(!options.body.includes(Buffer.from(content))); assert.equal(options.redirect, "error");
      return new Response("calendar-binary-response");
    },
    codec: async data => { assert.equal(data.digest, digest); assert.equal(data.additions.length, 2); return { proof: "opaque-ots", pending: [], bitcoin: [] }; },
    verifyBitcoin: async data => { assert.deepEqual(data, []); return null; },
  });
  assert.equal(calls.length, 2); assert.equal(result.status, "pending"); assert.equal(result.bitcoin, null);
});
test("untrusted pending calendar URLs and path injection are never fetched", async () => {
  let calls = 0;
  const result = await advanceRewardProof({ digest: "12".repeat(32), proof: "stored-ots" }, {
    codec: async () => ({ proof: "stored-ots", pending: [
      { calendar: "http://169.254.169.254", commitment: "12".repeat(32) },
      { calendar: `${REWARD_PROOF_CALENDARS[0]}/redirect`, commitment: "12".repeat(32) },
      { calendar: REWARD_PROOF_CALENDARS[0], commitment: "../../private" },
    ], bitcoin: [] }),
    fetchImpl: async () => { calls++; assert.fail("Untrusted URL fetched"); }, verifyBitcoin: async () => null,
  });
  assert.equal(calls, 0); assert.equal(result.status, "pending");
});
test("network errors preserve an existing proof without claiming confirmation", async () => {
  const result = await advanceRewardProof({ digest: "12".repeat(32), proof: "stored-ots" }, {
    codec: async () => ({ proof: "stored-ots", pending: [{ calendar: REWARD_PROOF_CALENDARS[0], commitment: "12".repeat(32) }], bitcoin: [] }),
    fetchImpl: async () => { throw new Error("network unavailable"); }, verifyBitcoin: async () => null,
  });
  assert.deepEqual(result, { proof: "stored-ots", bitcoin: null, status: "pending" });
});
test("calendar upgrade accepts real nonce-prefixed OTS messages longer than 32 bytes", async () => {
  const message = "12".repeat(52);
  let network = 0, merges = 0;
  const result = await advanceRewardProof({ digest: "12".repeat(32), proof: "stored-ots" }, {
    codec: async data => {
      if (data.additions) { merges++; assert.equal(data.additions[0].commitment, message); }
      return { proof: "upgraded-ots", pending: [{ calendar: REWARD_PROOF_CALENDARS[0], commitment: message }], bitcoin: [] };
    },
    fetchImpl: async url => { network++; assert.equal(url, `${REWARD_PROOF_CALENDARS[0]}/timestamp/${message}`); return new Response("calendar-upgrade"); },
    verifyBitcoin: async () => null,
  });
  assert.equal(network, 1); assert.equal(merges, 1); assert.equal(result.proof, "upgraded-ots");
});
