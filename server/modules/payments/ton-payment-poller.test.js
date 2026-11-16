import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import { Address, beginCell, Dictionary, internal, storeTransaction } from "@ton/core";
import { createTonPaymentPoller, startTonPaymentPolling } from "./ton-payment-poller.js";
import { createTonOrder, quoteTonRolls } from "./roll-ton.js";

const first = Address.parse(`0:${"a".repeat(64)}`);
const second = Address.parse(`0:${"b".repeat(64)}`);
const sender = Address.parse(`0:${"c".repeat(64)}`);
const firstAddress = first.toRawString();
const secondAddress = second.toRawString();
const epoch = 1_800_000_000;
const group = (account) => ({ recipient: account.toRawString(), chain: "-239", oldest: new Date((epoch + 30) * 1000) });

function block({ account = first, lt, previous, time = epoch + 1, orderId = randomUUID() }) {
  const message = internal({ to: account, value: 1_000_000_000n, body: beginCell().storeUint(0, 32).storeStringTail(`rollapp:${orderId}`).endCell() });
  message.info.src = sender;
  const cell = beginCell().store(storeTransaction({
    address: BigInt(`0x${account.hash.toString("hex")}`), lt: BigInt(lt), now: time,
    prevTransactionLt: previous ? BigInt(previous.entry.transaction_id.lt) : 0n,
    prevTransactionHash: previous ? BigInt(`0x${Buffer.from(previous.entry.transaction_id.hash, "base64").toString("hex")}`) : 0n,
    outMessagesCount: 0, oldStatus: "active", endStatus: "active",
    inMessage: message, outMessages: Dictionary.empty(), totalFees: { coins: 0n },
    stateUpdate: { oldHash: Buffer.alloc(32), newHash: Buffer.alloc(32) },
    description: { type: "generic", creditFirst: false, computePhase: { type: "skipped", reason: "no-state" }, aborted: false, destroyed: false },
  })).endCell();
  return { orderId, entry: { data: cell.toBoc().toString("base64"), transaction_id: { lt: String(lt), hash: cell.hash().toString("base64") } } };
}

function scenario(groups, response, whenRead) {
  const calls = [];
  const checked = [];
  const poller = createTonPaymentPoller({
    query: async () => ({ rows: groups }),
    transaction: (callback) => callback({ query: async (sql, args) => {
      assert.match(sql, /^SELECT \* FROM roll_ton_orders WHERE id=/);
      checked.push(args[0]);
      await whenRead?.(args[0]);
      return { rows: [], rowCount: 0 };
    } }),
    fetchImpl: async (url) => {
      const address = url.searchParams.get("address");
      const cursor = url.searchParams.get("lt");
      const hash = url.searchParams.get("hash");
      calls.push({ address, cursor, hash });
      const result = await response(address, cursor, hash);
      return result instanceof Response ? result : Response.json({ ok: true, result });
    },
  });
  return { poller, checked, calls };
}

test("TON polls every receiver head before resuming verified archival cursors", async () => {
  const tooEarly = block({ lt: 10, time: epoch - 1 });
  const older = block({ lt: 20, previous: tooEarly, time: epoch });
  const recent = block({ lt: 30, previous: older });
  const next = block({ lt: 40, previous: recent, time: epoch + 2 });
  const other = block({ account: second, lt: 11 });
  let head = recent;
  const { poller, checked, calls } = scenario([group(first), group(second)], (to, cursor) => {
    if (to === secondAddress) return [other.entry];
    if (!cursor) return [head.entry];
    return [{ 10: tooEarly.entry, 20: older.entry, 30: recent.entry }[cursor]];
  });
  const firstTick = await poller.tick();
  assert.deepEqual(Object.values(firstTick), [0, 0, 0, 0, 0]);
  assert.deepEqual(checked, [recent.orderId, other.orderId, older.orderId]);
  assert.deepEqual(calls, [{ address: firstAddress, cursor: null, hash: null }, { address: secondAddress, cursor: null, hash: null },
    { address: firstAddress, cursor: "20", hash: older.entry.transaction_id.hash }]);
  head = next;
  await poller.tick();
  assert.deepEqual(checked.slice(3), [next.orderId, other.orderId]);
  assert.deepEqual(calls.at(-1), { address: firstAddress, cursor: "10", hash: tooEarly.entry.transaction_id.hash });
  await poller.tick();
  assert.deepEqual(calls.at(-1), { address: firstAddress, cursor: "30", hash: recent.entry.transaction_id.hash });
});

test("TON isolates provider pages, unverifiable records and settlement failures", async () => {
  const late = block({ account: second, lt: 15 });
  const damaged = block({ account: second, lt: 25, previous: late });
  const valid = block({ account: second, lt: 35, previous: damaged });
  const latest = block({ account: second, lt: 45, previous: valid });
  const wrongAccount = block({ lt: 20 });
  let corrected = false;
  let failedSettlement = false;
  const { poller, checked } = scenario([group(first), group(second)], (to, cursor) => {
    if (to === firstAddress) return Response.json({}, { status: 503 });
    assert.equal(cursor, null);
    return corrected ? [latest.entry, valid.entry, damaged.entry, late.entry] : [latest.entry,
      { ...valid.entry, transaction_id: { ...valid.entry.transaction_id, lt: "42" } },
      { ...damaged.entry, transaction_id: { ...damaged.entry.transaction_id, hash: wrongAccount.entry.transaction_id.hash } },
      wrongAccount.entry, { data: "broken BOC" }, late.entry];
  }, (id) => {
    if (id === latest.orderId && !failedSettlement) { failedSettlement = true; throw new Error("Temporary database error"); }
  });
  assert.deepEqual(await poller.tick(), { failedGroups: 0, failedPages: 1, rejectedRecords: 4, incompleteHistory: 1, failedSettlements: 1 });
  assert.deepEqual(checked, [latest.orderId, late.orderId]);
  corrected = true;
  assert.deepEqual(await poller.tick(), { failedGroups: 0, failedPages: 1, rejectedRecords: 0, incompleteHistory: 0, failedSettlements: 0 });
  assert.deepEqual(checked.slice(2), [latest.orderId, valid.orderId, damaged.orderId, late.orderId]);
});

test("TON keeps a historical cursor across failed or empty pages and still checks the head", async () => {
  const archive = block({ lt: 30 });
  const recent = block({ lt: 40, previous: archive });
  let archiveCalls = 0;
  const { poller, checked, calls } = scenario([group(first)], (_to, cursor) => {
    if (!cursor) return [recent.entry];
    archiveCalls += 1;
    if (archiveCalls === 1) return [];
    if (archiveCalls === 2) return Response.json({}, { status: 429 });
    return [archive.entry];
  });
  assert.equal((await poller.tick()).incompleteHistory, 1);
  assert.equal((await poller.tick()).failedPages, 1);
  assert.equal((await poller.tick()).failedPages, 0);
  assert.deepEqual(calls.map(({ cursor }) => cursor), [null, "30", null, "30", null, "30"]);
  assert.deepEqual(checked, [recent.orderId, recent.orderId, recent.orderId, archive.orderId]);
});

test("TON stops an active provider request and prevents overlapping cycles", async () => {
  let signal;
  let start;
  const started = new Promise((resolve) => { start = resolve; });
  const poller = createTonPaymentPoller({
    query: async () => ({ rows: [group(first)] }),
    transaction: () => assert.fail("Stopped worker must not settle"),
    fetchImpl: async (_url, options) => {
      signal = options.signal;
      start();
      return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
    },
  });
  const result = poller.tick();
  await started;
  assert.equal(await poller.tick(), null);
  poller.stop();
  assert.equal(signal.aborted, true);
  assert.equal(await result, null);
  assert.equal(await poller.tick(), null);
});

test("TON worker startup honors its configuration flag", () => {
  const handle = startTonPaymentPolling({ env: {}, query: () => assert.fail("Disabled worker must not start") });
  handle.stop();
});


test("TON worker applies validated BOCs exactly once on existing PostgreSQL with rollback", { skip: process.env.ROLLAPP_TEST_TON !== "1" }, async () => {
  const { productionRollsDatabase } = await import("../../../scripts/rolls-database.mjs");
  const db = await productionRollsDatabase();
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='10s'");
    const userId = randomUUID();
    const receiver = Address.parse(`0:${randomBytes(32).toString("hex")}`);
    const receiverAddress = receiver.toRawString();
    await client.query("INSERT INTO users(id,email,username,name,password_hash) VALUES ($1,$2,$3,'TON worker rollback test','unusable')",
      [userId, `${userId}@ton-test.invalid`, `ton-worker-${userId}`]);
    const newOrder = () => createTonOrder(client, userId, {
      rolls: 100, sender: sender.toRawString(), chain: "-239", idempotencyKey: randomUUID(), acceptedTerms: true,
      quote: { recipient: receiverAddress, nanotons: quoteTonRolls(100, 100) },
    }, { enabled: true, recipient: receiverAddress, rate: 100 });
    const historicOrder = await newOrder();
    const headOrder = await newOrder();
    const time = Math.floor(new Date(headOrder.created_at).getTime() / 1000);
    // Simulate late indexing after an invoice expired, while the block time
    // stays inside its original confirmation window.
    await client.query("UPDATE roll_ton_orders SET expires_at=CURRENT_TIMESTAMP-INTERVAL '1 second' WHERE id=$1", [historicOrder.id]);
    const archive = block({ account: receiver, lt: 50, time, orderId: historicOrder.id });
    const head = block({ account: receiver, lt: 60, previous: archive, time, orderId: headOrder.id });
    let indexed = false;
    const poller = createTonPaymentPoller({
      query: (sql) => client.query(`SELECT * FROM (${sql}) AS scan_targets WHERE recipient=$1`, [receiverAddress]),
      transaction: async (callback) => {
        await client.query("SAVEPOINT worker_settlement");
        try {
          const result = await callback(client);
          await client.query("RELEASE SAVEPOINT worker_settlement");
          return result;
        } catch (cause) {
          await client.query("ROLLBACK TO SAVEPOINT worker_settlement");
          await client.query("RELEASE SAVEPOINT worker_settlement");
          throw cause;
        }
      },
      fetchImpl: async (url) => {
        assert.equal(url.searchParams.get("address"), receiverAddress);
        if (!url.searchParams.has("lt")) return Response.json({ ok: true, result: [head.entry] });
        assert.equal(url.searchParams.get("lt"), "50");
        assert.equal(url.searchParams.get("hash"), archive.entry.transaction_id.hash);
        return Response.json({ ok: true, result: indexed ? [archive.entry] : [] });
      },
    });
    const balance = async () => BigInt((await client.query("SELECT balance FROM roll_wallets WHERE user_id=$1", [userId])).rows[0].balance);
    const before = await balance();
    assert.equal((await poller.tick()).incompleteHistory, 1);
    assert.equal(await balance(), before + 100n);
    indexed = true;
    assert.deepEqual(Object.values(await poller.tick()), [0, 0, 0, 0, 0]);
    assert.equal(await balance(), before + 200n);
    const { rows } = await client.query("SELECT id,transaction_hash FROM roll_ton_orders WHERE user_id=$1 AND paid_at IS NOT NULL", [userId]);
    assert.deepEqual(Object.fromEntries(rows.map((row) => [row.id, row.transaction_hash])), {
      [historicOrder.id]: Buffer.from(archive.entry.transaction_id.hash, "base64").toString("hex"),
      [headOrder.id]: Buffer.from(head.entry.transaction_id.hash, "base64").toString("hex"),
    });
    await poller.tick();
    assert.equal(await balance(), before + 200n);
  } finally { await client.query("ROLLBACK"); client.release(); await db.pool.end(); }
});
