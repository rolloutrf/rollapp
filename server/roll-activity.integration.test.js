import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import express from "express";
import { readRollActivity, readRollActivityEntries } from "./modules/pfm/roll-activity.js";
import { registerRollActivityRoutes } from "./modules/pfm/roll-activity-routes.js";
import { createPersonalOffer, payPersonalOffer } from "./personal-offers.js";
import { refundPersonalOffer } from "./modules/checkout/personal-offer-refunds.js";
import { changeGiftCard, issueGiftCard } from "./modules/loyalty/gift-cards.js";
import { ensureRollWallet, transferRolls } from "./modules/payments/rolls.js";

async function checkLedgerActivity(db) {
  const client = await db.pool.connect();
  const [buyer, seller, other, item, requestKey] = Array.from({ length: 5 }, () => randomUUID());
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout='5s'");
    for (const [id, type] of [[buyer, "personal"], [seller, "business"], [other, "personal"]]) {
      await client.query(`INSERT INTO users(id,email,username,name,password_hash,account_type)
        VALUES($1,$2,$3,'Roll activity test','unusable',$4)`, [id, `${id}@activity-test.invalid`, `activity-${id}`, type]);
      await ensureRollWallet(client, id);
    }
    const { rows: [dates] } = await client.query(`
      SELECT ((now() AT TIME ZONE 'Europe/Moscow')::date-6)::text AS start_on,
             (now() AT TIME ZONE 'Europe/Moscow')::date::text AS end_on`);
    const atBoundary = "(($2::date)::timestamp AT TIME ZONE 'Europe/Moscow')";
    await client.query(`INSERT INTO roll_manual_grants(id,user_id,amount,reason,idempotency_key,created_at)
      SELECT $3 || ':' || to_char(i,'FM00'),$1,2,'Included',$3 || ':' || to_char(i,'FM00'),
             ${atBoundary} + (i/2)*interval '1 microsecond'
      FROM generate_series(1,35) i`, [buyer, dates.start_on, requestKey]);
    await client.query(`INSERT INTO roll_manual_grants(id,user_id,amount,reason,idempotency_key,created_at)
      VALUES ($3,$1,5000,'Previous day',$3,${atBoundary}-interval '1 microsecond')`, [buyer, dates.start_on, randomUUID()]);
    await client.query("UPDATE roll_wallets SET balance=balance+5070 WHERE user_id=$1", [buyer]);

    const card = await issueGiftCard(client, buyer, { businessId: seller, idempotencyKey: randomUUID() });
    await changeGiftCard(client, buyer, card.id, "topup", { amount: 15, idempotencyKey: randomUUID() });
    await client.query(`INSERT INTO business_marketplace_items(id,business_user_id,sphere,kind,title,price_rolls)
      VALUES($1,$2,'career','store','Invoice test',25)`, [item, seller]);
    await client.query("INSERT INTO follows(follower_id,following_id) VALUES ($1,$2)", [buyer, seller]);
    const offer = await createPersonalOffer(client, seller, { itemId: item, recipientId: buyer, priceRolls: 25, durationHours: 24, idempotencyKey: randomUUID() });
    await payPersonalOffer(client, buyer, offer.id);
    await refundPersonalOffer(client, seller, offer.id);
    await transferRolls(client, buyer, { recipientId: other, amount: 7, note: "Ordinary transfer", idempotencyKey: randomUUID() });

    const summary = await readRollActivity(client, buyer, { days: 7 });
    assert.deepEqual([summary.period.startsOn, summary.period.endsOn], [dates.start_on, dates.end_on]);
    assert.deepEqual(summary.totals, { received: "195", debited: "47", change: "148", count: 40 });
    const category = Object.fromEntries(summary.groups.map(({ group, ...row }) => [group, row]));
    assert.deepEqual(category.payments, { received: "25", debited: "25", count: 2 });
    assert.deepEqual(category.transfers, { received: "0", debited: "7", count: 1 });
    assert.deepEqual(category.gifts, { received: "0", debited: "15", count: 1 });
    assert.equal((await readRollActivity(client, buyer, { days: 30 })).totals.received, "5195");
    assert.deepEqual((await readRollActivity(client, other, { days: 7 })).totals, { received: "107", debited: "0", change: "107", count: 2 });

    const options = { days: 7, asOf: summary.period.asOf, group: "bonuses" };
    const first = await readRollActivityEntries(client, buyer, options);
    assert.equal(first.transactions.length, 30);
    assert(first.next.before.match(/\.\d{6}Z$/));
    const second = await readRollActivityEntries(client, buyer, { ...options, ...first.next });
    assert.equal(second.transactions.length, 6);
    assert.equal(second.next, null);
    const records = [...first.transactions, ...second.transactions];
    assert.equal(new Set(records.map((row) => row.id)).size, category.bonuses.count);
    assert(records.every((row) => row.note !== "Previous day"));
    assert.equal(String(records.reduce((sum, row) => sum + row.amount, 0)), category.bonuses.received);

    const payments = (await readRollActivityEntries(client, buyer, { ...options, group: "payments" })).transactions;
    assert.equal(payments.length, 2);
    assert.deepEqual(payments.map((row) => row.direction).sort(), ["incoming", "outgoing"]);
    assert(payments.every((row) => row.person.id === seller));
    const otherPayments = await readRollActivityEntries(client, other, { ...options, group: "payments" });
    assert.equal(otherPayments.transactions.length, 0);
    assert.equal((await readRollActivity(client, randomUUID(), { days: 7 })).totals.count, 0);

    await client.query(`INSERT INTO roll_manual_grants(id,user_id,amount,reason,idempotency_key,created_at)
      VALUES ($3,$1,3,'After snapshot',$3,$2::timestamptz+interval '1 microsecond')`, [buyer, summary.period.asOf, randomUUID()]);
    await client.query("UPDATE roll_wallets SET balance=balance+3 WHERE user_id=$1", [buyer]);
    assert.equal((await readRollActivity(client, buyer, { days: 7 })).totals.received, "198");
    assert((await readRollActivityEntries(client, buyer, options)).transactions.every((row) => row.note !== "After snapshot"));
  } finally {
    try { await client.query("ROLLBACK"); } finally { client.release(); }
  }
}

async function checkActivityRoutes(db) {
  let server;
  try {
    const session = randomUUID();
    const app = express();
    registerRollActivityRoutes(app, {
      requireAuth(req, res, next) {
        if (req.get("x-test-session") !== session) return res.sendStatus(401);
        req.user = { id: session };
        next();
      },
      transaction: db.transaction,
    });
    server = await new Promise((resolve) => { const handle = app.listen(0, "127.0.0.1", () => resolve(handle)); });
    const path = `http://127.0.0.1:${server.address().port}/api/rolls/activity`;
    const request = (suffix = "") => fetch(path + suffix, { headers: { "x-test-session": session } });
    assert.equal((await fetch(path)).status, 401);
    assert.equal((await request(`?owner=${randomUUID()}`)).status, 400);
    assert.equal((await request("?days=31")).status, 400);
    const response = await request("?days=7");
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    const summary = await response.json();
    assert.equal(summary.totals.count, 0);
    const { asOf } = summary.period;
    const detail = await request("/entries?" + new URLSearchParams({ days: "7", asOf }));
    assert.equal(detail.status, 200);
    assert.deepEqual(await detail.json(), { transactions: [], next: null });
    const { rows: [wallet] } = await db.query("SELECT EXISTS (SELECT 1 FROM roll_wallets WHERE user_id=$1) AS exists", [session]);
    assert.equal(wallet.exists, false);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
  }
}

test("roll activity on configured PostgreSQL with rollback-only fixtures", { skip: process.env.ROLLAPP_TEST_ROLL_ACTIVITY !== "1" }, async (t) => {
  const { productionRollsDatabase } = await import("../scripts/rolls-database.mjs");
  const db = await productionRollsDatabase();
  try {
    await t.test("Moscow boundaries, invoice and wallet movements, and precise scoped pagination", () => checkLedgerActivity(db));
    await t.test("HTTP validates scope and reads an empty statement without creating a wallet", () => checkActivityRoutes(db));
  } finally {
    await db.pool.end();
  }
});
