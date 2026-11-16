import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import { Address, beginCell } from "@ton/core";
import { getTonRollsConfig, quoteTonRolls, receiptFromTransaction, createTonOrder, settleTonReceipt, readTonOrderByRequest, registerTonRollsRoutes } from "./roll-ton.js";
import { readRollWallet } from "../history/wallet-history.js";

const recipient = Address.parse('UQCEFkv5HNGWHb6CB_X8XFh7nC7wL8-e5Ynll9k3gorpZ-fU');
const sender = Address.parse(`0:${'a'.repeat(64)}`);
const config = { enabled: true, recipient: recipient.toRawString(), rate: 100, chain: '-239' };

test('TON pricing is integer exact; invalid receiving configuration disables checkout', () => {
  assert.equal(quoteTonRolls(100, 100), '1000000000');
  assert.equal(quoteTonRolls(500, 100), '5000000000');
  assert.equal(quoteTonRolls(100, 300), '333333334');
  assert.equal(getTonRollsConfig({ TON_ROLLS_ENABLED: 'true', TON_ROLLS_RECEIVER: '@example-owner', TON_ROLLS_PER_TON: '100' }).enabled, false);
  assert.equal(getTonRollsConfig({ TON_ROLLS_ENABLED: 'true', TON_ROLLS_RECEIVER: recipient.toString({ testOnly: true }), TON_ROLLS_PER_TON: '100' }).enabled, false);
});

test('only successful native incoming TON messages produce receipts', () => {
  const id = randomUUID();
  const tx = {
    description: { type: 'generic', aborted: false, destroyed: false },
    address: BigInt(`0x${recipient.hash.toString('hex')}`), now: 1000, hash: () => Buffer.alloc(32, 1),
    inMessage: { info: { type: 'internal', bounced: false, src: sender, dest: recipient, value: { coins: 1000000000n } },
      body: beginCell().storeUint(0, 32).storeStringTail(`rollapp:${id}`).endCell() },
  };
  const read = (value) => receiptFromTransaction(value, recipient.toRawString());
  assert.equal(read(tx).orderId, id);
  assert.equal(read(tx).nanotons, '1000000000');
  assert.equal(read({ ...tx, description: { ...tx.description, aborted: true } }), null);
  assert.equal(read({ ...tx, address: 0n }), null);
  assert.equal(read({ ...tx, inMessage: { ...tx.inMessage, info: { ...tx.inMessage.info, bounced: true } } }), null);
  assert.equal(read({ ...tx, inMessage: { ...tx.inMessage, info: { ...tx.inMessage.info, type: 'external-in' } } }), null);
  assert.equal(read({ ...tx, inMessage: { ...tx.inMessage, body: beginCell().storeUint(1, 32).endCell() } }), null);
});

test("TON order recovery is private, read-only, and independent of the sales flag", async () => {
  const id = randomUUID();
  const requestKey = randomUUID();
  const actor = "owner";
  const calls = [];
  const row = { id, rolls: 100, nanotons: "1000000000", sender: sender.toRawString(), recipient: recipient.toRawString(),
    chain: "-239", expires_at: new Date(Date.now() + 5_000), paid_at: null };
  const query = async (sql, args) => {
    calls.push([sql, args]);
    return { rows: args?.[0] === actor && [id, requestKey].includes(args[1]) ? [row] : [] };
  };
  const app = express();
  registerTonRollsRoutes(app, {
    requireAuth: (req, res, next) => { if (!req.get("x-test-user")) return res.sendStatus(401); req.user = { id: req.get("x-test-user") }; next(); },
    transaction: (callback) => callback({ query }), query, config: () => ({ enabled: false }),
  });
  const listener = await new Promise((resolve) => { const server = app.listen(0, "127.0.0.1", () => resolve(server)); });
  const origin = `http://127.0.0.1:${listener.address().port}/api/rolls/ton/orders`;
  const find = `${origin}/by-request/${requestKey}`;
  try {
    assert.equal((await fetch(find)).status, 401);
    const own = await fetch(find, { headers: { "x-test-user": actor } });
    assert.equal(own.headers.get("cache-control"), "private, no-store");
    assert.equal((await own.json()).order.id, id);
    assert.deepEqual(await (await fetch(find, { headers: { "x-test-user": "other" } })).json(), { order: null });
    assert.equal((await fetch(`${origin}/${id}`, { headers: { "x-test-user": "other" } })).status, 404);
    assert.equal((await (await fetch(`${origin}/${id}`, { headers: { "x-test-user": actor } })).json()).order.id, id);
    assert.equal((await fetch(`${origin}/by-request/invalid`, { headers: { "x-test-user": actor } })).status, 400);
    assert.deepEqual(calls.slice(0, 2), [["SET TRANSACTION READ ONLY", undefined],
      ["SELECT * FROM roll_ton_orders WHERE user_id=$1 AND idempotency_key=$2", [actor, requestKey]]]);
    assert(calls.every(([sql]) => /^(SELECT |SET TRANSACTION READ ONLY$)/.test(sql)));
  } finally { await new Promise((resolve) => listener.close(resolve)); }
});

test('TON settlement on production PostgreSQL: exact once, attribution, expiry, and atomic rollback', { skip: process.env.ROLLAPP_TEST_TON !== '1' }, async () => {
  const { productionRollsDatabase } = await import('../../../scripts/rolls-database.mjs');
  const db = await productionRollsDatabase();
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET TRANSACTION READ ONLY');
    assert.equal((await client.query('SHOW transaction_read_only')).rows[0].transaction_read_only, 'on');
    assert.equal(await readTonOrderByRequest(client, randomUUID(), randomUUID()), null);
    await client.query('ROLLBACK');
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='10s'");
    const user = randomUUID();
    await client.query('INSERT INTO users (id,email,username,name,password_hash) VALUES ($1,$2,$3,$4,$5)', [user, `${user}@ton-test.invalid`, `ton-test-${user}`, 'TON rollback test', 'unusable']);
    const input = { rolls: 100, sender: sender.toRawString(), chain: '-239', idempotencyKey: randomUUID(), acceptedTerms: true,
      quote: { recipient: recipient.toRawString(), nanotons: '1000000000' } };
    const find = () => readTonOrderByRequest(client, user, input.idempotencyKey);
    assert.equal(await find(), null);
    assert.equal((await client.query('SELECT 1 FROM roll_wallets WHERE user_id=$1', [user])).rowCount, 0);
    await client.query('SAVEPOINT changed_quote');
    await assert.rejects(createTonOrder(client, user, input, { ...config, rate: 200 }), { code: 'TON_QUOTE_CHANGED' });
    await client.query('ROLLBACK TO SAVEPOINT changed_quote');
    assert.equal(await find(), null);
    const order = await createTonOrder(client, user, input, config);
    assert.equal((await find()).id, order.id);
    assert.equal(await readTonOrderByRequest(client, randomUUID(), input.idempotencyKey), null);
    await assert.rejects(createTonOrder(client, user, { ...input, quote: { ...input.quote, nanotons: '1' } }, config), { code: 'IDEMPOTENCY_CONFLICT' });
    assert.equal((await createTonOrder(client, user, input, { ...config, rate: 200 })).id, order.id);
    const balance = async () => BigInt((await client.query('SELECT balance FROM roll_wallets WHERE user_id=$1', [user])).rows[0].balance);
    const before = await balance();
    const receipt = { orderId: order.id, sender: order.sender, recipient: order.recipient, nanotons: order.nanotons, hash: '01'.repeat(32), time: Math.floor(new Date(order.created_at).getTime() / 1000) };
    for (const changes of [{ nanotons: '1' }, { sender: recipient.toRawString() }, { recipient: sender.toRawString() }, { time: receipt.time - 100 }, { time: receipt.time + 1000 }]) {
      assert.equal(await settleTonReceipt(client, { ...receipt, ...changes }), false);
      assert.equal(await balance(), before);
    }
    assert.equal(await settleTonReceipt(client, receipt, '-3'), false);
    assert.equal(await settleTonReceipt(client, receipt), true);
    assert.equal(await balance(), before + 100n);
    assert.equal((await find()).status, 'paid');
    const history = await readRollWallet(client, user);
    assert.equal(history.transactions.find((item) => item.kind === 'ton_topup').note, '1 TON');
    assert.equal(await settleTonReceipt(client, receipt), true);
    assert.equal(await balance(), before + 100n);
    const second = await createTonOrder(client, user, { ...input, idempotencyKey: randomUUID() }, config);
    await client.query('SAVEPOINT duplicate_hash');
    await assert.rejects(settleTonReceipt(client, { ...receipt, orderId: second.id }));
    await client.query('ROLLBACK TO SAVEPOINT duplicate_hash');
    assert.equal(await balance(), before + 100n);
    assert.equal((await client.query('SELECT paid_at FROM roll_ton_orders WHERE id=$1', [second.id])).rows[0].paid_at, null);
    await assert.rejects(createTonOrder(client, user, { ...input, sender: recipient.toRawString() }, config), { code: 'TON_SELF_PAYMENT' });
  } finally { await client.query('ROLLBACK'); client.release(); await db.pool.end(); }
});
