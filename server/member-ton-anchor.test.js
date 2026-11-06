import assert from "node:assert/strict";
import test from "node:test";
import { Address, beginCell } from "@ton/core";
import { fetchMemberTransactions, memberTonComment, memberTonConfig, receiptFromTonTransaction } from "./member-ton-anchor.js";

test("TON anchoring is opt-in and requires a dedicated 24-word wallet", () => {
  assert.equal(memberTonConfig({}), null);
  assert.throws(() => memberTonConfig({ TON_MEMBERSHIP_ENABLED: "true" }), /mnemonic/);
  assert.throws(() => memberTonConfig({ TON_MEMBERSHIP_ENABLED: "true", TON_MEMBERSHIP_MNEMONIC: "word ".repeat(24).trim() }), /TONCENTER_API_KEY/);
  const configured = memberTonConfig({ TON_MEMBERSHIP_ENABLED: "true", TON_MEMBERSHIP_MNEMONIC: "word ".repeat(24).trim(), TONCENTER_API_KEY: "key" });
  assert.equal(configured.words.length, 24);
});

test("only a matching, successful self-transfer comment proves an anchored receipt", () => {
  const wallet = Address.parseRaw(`0:${"a".repeat(64)}`);
  const hash = "b".repeat(64);
  const tx = {
    description: { type: "generic", aborted: false },
    inMessage: { info: { type: "internal", bounced: false, src: wallet, dest: wallet },
      body: beginCell().storeUint(0, 32).storeStringTail(memberTonComment(hash)).endCell() },
    hash: () => Buffer.from("c".repeat(64), "hex"),
  };
  assert.equal(receiptFromTonTransaction(tx, wallet, hash), "c".repeat(64));
  assert.equal(receiptFromTonTransaction(tx, wallet, "d".repeat(64)), null);
  assert.equal(receiptFromTonTransaction({ ...tx, description: { type: "generic", aborted: true } }, wallet, hash), null);
  assert.equal(receiptFromTonTransaction({ ...tx, inMessage: { ...tx.inMessage, info: { ...tx.inMessage.info, bounced: true } } }, wallet, hash), null);
});

test("TON history requires an authenticated result and a matching cell hash", async () => {
  const wallet = Address.parseRaw(`0:${"a".repeat(64)}`);
  const invalid = async () => ({ ok: true, json: async () => ({ ok: true, result: [{ data: beginCell().endCell().toBoc().toString("base64"), transaction_id: { hash: "incorrect" } }] }) });
  await assert.rejects(fetchMemberTransactions(wallet, "key", invalid), /hash mismatch/);
  const empty = async () => ({ ok: true, json: async () => ({ ok: true, result: [] }) });
  assert.deepEqual(await fetchMemberTransactions(wallet, "key", empty), []);
});
