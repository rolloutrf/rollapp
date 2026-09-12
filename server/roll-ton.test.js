import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Address, beginCell } from "@ton/core";
import { getTonRollsConfig, quoteTonRolls, receiptFromTransaction, createTonOrder, settleTonReceipt } from "./roll-ton.js";
import { tonRollsSchema } from "./roll-ton-schema.js";
import { readRollWallet } from "./rolls.js";

const recipient = Address.parse('UQCEFkv5HNGWHb6CB_X8XFh7nC7wL8-e5Ynll9k3gorpZ-fU');
const sender = Address.parse(`0:${'a'.repeat(64)}`);
const config = { enabled: true, recipient: recipient.toRawString(), rate: 100, chain: '-239' };

test('TON pricing is integer exact; invalid receiving configuration disables checkout', () => {
  assert.equal(quoteTonRolls(100, 100), '1000000000');
  assert.equal(quoteTonRolls(500, 100), '5000000000');
  assert.equal(quoteTonRolls(100, 300), '333333334');
  assert.equal(getTonRollsConfig({ TON_ROLLS_ENABLED: 'true', TON_ROLLS_RECEIVER: '@koloskof', TON_ROLLS_PER_TON: '100' }).enabled, false);
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

test('TON settlement on production PostgreSQL: exact once, attribution, expiry, and atomic rollback', { skip: process.env.ROLLAPP_TEST_TON !== '1' }, async () => {
  const { productionRollsDatabase } = await import('../scripts/rolls-database.mjs');
  const db = await productionRollsDatabase();
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query(tonRollsSchema);
    const user = randomUUID();
    await client.query('INSERT INTO users (id,email,username,name,password_hash) VALUES ($1,$2,$3,$4,$5)', [user, `${user}@ton-test.invalid`, `ton-test-${user}`, 'TON rollback test', 'unusable']);
    const input = { rolls: 100, sender: sender.toRawString(), chain: '-239', idempotencyKey: randomUUID(), acceptedTerms: true };
    const order = await createTonOrder(client, user, input, config);
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
