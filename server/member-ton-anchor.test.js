import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";
import { gzipSync } from "node:zlib";
import { Address, beginCell } from "@ton/core";
import { WalletContractV4 } from "@ton/ton";
import { createMemberTonClient, fetchMemberTransactions, memberTonComment, memberTonConfig, receiptFromTonTransaction } from "./member-ton-anchor.js";

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

test("membership RPC bounds responses before passing them to the SDK", async (t) => {
  const state = {
    balance: "50000000", state: "active", data: "", code: "", sync_utime: 1,
    last_transaction_id: { "@type": "internal.transactionId", lt: "0", hash: "" },
    block_id: { "@type": "ton.blockIdExt", workchain: 0, shard: "", seqno: 1, root_hash: "", file_hash: "" },
  };
  const results = {
    getAddressInformation: state,
    runGetMethod: { gas_used: 1, exit_code: 0, stack: [["num", "0x2a"]] },
    sendBoc: { "@type": "ok" },
  };
  const calls = [];
  let reply;
  const listener = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const rpc = JSON.parse(Buffer.concat(chunks));
    calls.push({ url: request.url, apiKey: request.headers["x-api-key"], rpc });
    if (reply) return reply(response);
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: true, result: results[rpc.method] }));
  });
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  t.after(() => new Promise(resolve => listener.close(resolve)));

  const wallet = WalletContractV4.create({ workchain: 0, publicKey: Buffer.alloc(32, 1) });
  const client = createMemberTonClient({
    endpoint: `http://127.0.0.1:${listener.address().port}/jsonRPC`, apiKey: "fixture", timeout: 2_000,
  });
  await t.test("state, balance, seqno and submission use the regular SDK methods", async () => {
    assert.equal(await client.isContractDeployed(wallet.address), true);
    assert.equal(await client.getBalance(wallet.address), 50_000_000n);
    assert.equal(await wallet.getSeqno(client.provider(wallet.address)), 42);
    const boc = beginCell().endCell().toBoc();
    await client.sendFile(boc);
    assert.equal(calls.find(({ rpc }) => rpc.method === "runGetMethod").rpc.params.method, "seqno");
    assert.equal(calls.find(({ rpc }) => rpc.method === "sendBoc").rpc.params.boc, boc.toString("base64"));
    assert(calls.every(({ apiKey }) => apiKey === "fixture"));
  });
  await t.test("oversized compressed responses and redirects fail at the HTTP boundary", async () => {
    reply = (response) => {
      const json = JSON.stringify({ ok: true, result: state });
      response.writeHead(200, { "Content-Type": "application/json", "Content-Encoding": "gzip" });
      response.end(gzipSync(json + " ".repeat(1024 * 1024)));
    };
    await assert.rejects(client.getBalance(wallet.address), /maxContentLength/);
    reply = (response) => response.writeHead(307, { Location: "/redirected" }).end();
    await assert.rejects(client.getBalance(wallet.address), { status: 307 });
    assert(calls.every(({ url }) => url === "/jsonRPC"));
    reply = undefined;
  });
  await t.test("wallet currencies and seqno stack are checked before SDK validation", async () => {
    state.extra_currencies = Array(1025).fill({});
    await assert.rejects(client.getBalance(wallet.address), /too many extra currencies/);
    delete state.extra_currencies;
    for (const stack of [[["num", "0"], ["num", "1"]], [["num", "4294967296"]], [["null"]]]) {
      results.runGetMethod.stack = stack;
      await assert.rejects(wallet.getSeqno(client.provider(wallet.address)), /Invalid TON membership seqno/);
    }
  });
});
