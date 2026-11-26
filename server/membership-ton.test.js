import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { Address, Cell, internal, loadMessage, loadMessageRelaxed } from "@ton/core";
import { keyPairFromSeed } from "@ton/crypto";
import { WalletContractV4 } from "@ton/ton";
import { advanceMembershipAnchor, inspectMembershipTransactions, membershipAnchorBody, signMembershipAnchor } from "./membership-ton.js";

const { publicKey, secretKey } = keyPairFromSeed(Buffer.alloc(32, 3));
const wallet = WalletContractV4.create({ workchain: 0, publicKey });
const address = wallet.address;
const receipt = '{"number":"00001","nonce":"synthetic"}';
const digest = createHash("sha256").update(receipt).digest("hex");
const seqno = 42;
const timeout = 1_900_000_000;
const boc = signMembershipAnchor({ wallet, secretKey, seqno, timeout, digest });
const message = loadMessage(Cell.fromBoc(boc)[0].beginParse());

test("real TON Wallet V4 BOC carries only the private receipt hash in a self-transfer", () => {
  assert(message.info.dest.equals(address));
  assert.equal(message.info.type, "external-in");
  const body = message.body.beginParse();
  body.skip(512);
  assert.equal(body.loadUint(32), wallet.walletId);
  assert.equal(body.loadUint(32), timeout);
  assert.equal(body.loadUint(32), seqno);
  assert.equal(body.loadUint(8), 0);
  body.skip(8); // send mode
  const transfer = loadMessageRelaxed(body.loadRef().beginParse());
  assert(transfer.info.dest.equals(address));
  assert.equal(transfer.body.bits.length, 288);
  const payload = transfer.body.beginParse();
  assert.equal(payload.loadUint(32), 0x524c4d31);
  assert.equal(payload.loadBuffer(32).toString("hex"), digest);
  assert.throws(() => signMembershipAnchor({ wallet, secretKey, seqno: 0, timeout, digest }), /initialized/);
});

test("TON confirmation needs the exact signed input and the successful matching outgoing payload", () => {
  const output = internal({ to: address, value: 1n, body: membershipAnchorBody(digest) });
  const successful = {
    address: BigInt("0x" + address.hash.toString("hex")),
    inMessage: message,
    description: { type: "generic", aborted: false, computePhase: { type: "vm", success: true }, actionPhase: { success: true } },
    outMessages: new Map([[0, { ...output, info: { ...output.info, src: address } }]]),
    hash: () => Buffer.alloc(32, 5),
    lt: 600n,
  };
  // TON's Dictionary.values() returns an array, unlike Map.values().
  const inspect = (tx) => inspectMembershipTransactions([{
    ...tx, outMessages: { values: () => [...tx.outMessages.values()] },
  }], { boc, digest, address });
  assert.deepEqual(inspect(successful), { kind: "confirmed", hash: "05".repeat(32), lt: "600" });
  assert.deepEqual(inspect({ ...successful, inMessage: { ...message, body: Cell.EMPTY } }), { kind: "missing" });
  assert.deepEqual(inspect({ ...successful, outMessages: new Map() }), { kind: "failed" });
  const actual = successful.outMessages.get(0);
  const different = { ...actual, info: { ...actual.info, dest: Address.parseRaw("0:" + "a".repeat(64)) } };
  assert.deepEqual(inspect({ ...successful, outMessages: new Map([[0, different]]) }), { kind: "failed" });
  assert.deepEqual(inspect({ ...successful, description: { ...successful.description, aborted: true } }), { kind: "failed" });
});

test("a lost broadcast response retries the exact persisted BOC; never re-sign after a sequence advance", async () => {
  const calls = [];
  const raw = address.toRawString();
  const row = { receipt, digest };
  let saved;
  let current = seqno;
  const ton = {
    address: raw,
    seqno: async () => current,
    sign: () => { calls.push("sign"); return boc; },
    broadcast: async value => { calls.push("broadcast"); assert.deepEqual(value, boc); if (calls.length === 3) throw new Error("response lost"); },
    inspect: async () => ({ kind: "missing" }),
  };
  const persist = {
    signed: async envelope => { calls.push("persist"); saved = { ...row, ...envelope, expires_at: new Date(envelope.timeout * 1000) }; return true; },
    confirm: async () => calls.push("confirm"),
    clear: async () => calls.push("clear"),
  };
  const run = (row, time) => advanceMembershipAnchor({ row, ton, persist, now: () => time });
  await assert.rejects(run(row, (timeout - 120) * 1000), /response lost/);
  await run(saved, (timeout - 90) * 1000);
  current++;
  await run(saved, (timeout + 180) * 1000);
  assert.deepEqual(calls, ["sign", "persist", "broadcast", "broadcast"]);
  current--;
  await run(saved, (timeout + 180) * 1000);
  assert.equal(calls.at(-1), "clear");
  ton.inspect = async () => ({ kind: "confirmed", hash: "a".repeat(64), lt: "10" });
  await run(saved, timeout * 1000);
  assert.equal(calls.at(-1), "confirm");
  await assert.rejects(run({ ...row, receipt: "changed" }, timeout * 1000), /integrity/);
});
