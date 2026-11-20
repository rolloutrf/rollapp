import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { ROLLS_MAX_BALANCE } from "../shared/modules/payments/rolls.js";
import { createHash } from "node:crypto";
import { processRewardProof } from "./modules/loyalty/reward-proof-queue.js";
import express from "express";
import { registerRollsRoutes } from "./modules/payments/rolls-routes.js";
import { createRewardNeed, createRewardOffer, actOnRewardOffer, readRewardNeeds, closeRewardNeed, resolveRewardDispute, registerNeedRewardsRoutes, expireRewardOffer, automaticallySettleRewardOffer, processDueRewardOffers } from "./modules/loyalty/need-rewards.js";
import { ensureRollWallet } from "./modules/payments/rolls.js";
import { readRollWallet } from "./modules/history/wallet-history.js";
import { reconcileRollAccounting } from "./modules/payments/roll-reconciliation.js";

test("funded need rewards on verified production PostgreSQL; all writes rolled back, no schema initialization", { skip: process.env.ROLLAPP_TEST_NEED_REWARDS !== "1" }, async t => {
  const { productionRollsDatabase } = await import("../scripts/rolls-database.mjs");
  const db = await productionRollsDatabase();
  const client = await db.pool.connect();
  const [owner, business, other, competitor] = Array.from({ length: 4 }, () => randomUUID());
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='15s'");
    for (const id of [owner, business, other, competitor]) {
      await client.query("INSERT INTO users (id,email,username,name,password_hash,account_type) VALUES ($1,$2,$3,'Reward verification','unusable',$4)", [id, `${id}@rewards-test.invalid`, `reward-test-${id}`, [business, competitor].includes(id) ? "business" : "personal"]);
      await ensureRollWallet(client, id);
    }
    const balances = async () => (await client.query("SELECT user_id,balance::text FROM roll_wallets WHERE user_id=ANY($1::text[]) ORDER BY user_id", [[owner, business, other, competitor]])).rows;
    const reject = async (fn, code) => {
      const before = await balances();
      await client.query("SAVEPOINT reject_reward");
      await assert.rejects(fn, error => error.code === code);
      await client.query("ROLLBACK TO SAVEPOINT reject_reward");
      assert.deepEqual(await balances(), before);
    };
    const makeNeed = () => ({ title: "Нужен результат", description: "Проверяемый результат и сроки", category: "Обучение", publishedToBusinesses: true, idempotencyKey: randomUUID() });
    const needInput = makeNeed();
    const need = await createRewardNeed(client, owner, needInput);
    const input = { description: "Конкретное решение за согласованную цену", reward: 60, idempotencyKey: randomUUID() };
    let first;
    await t.test("need publication grants nothing and is idempotent", async () => {
      assert.equal((await createRewardNeed(client, owner, needInput)).id, need.id);
      await reject(() => createRewardNeed(client, owner, { ...needInput, title: "Другая потребность" }), "IDEMPOTENCY_CONFLICT");
      assert.equal((await readRollWallet(client, owner)).balance, 100);
      assert.equal((await readRewardNeeds(client, other)).needs.length, 0);
      assert((await readRewardNeeds(client, business)).needs.some(row => row.id === need.id));
    });
    await t.test("only business can propose; self-rewards and insufficient budgets fail atomically", async () => {
      await reject(() => createRewardOffer(client, other, need.id, input), "BUSINESS_REQUIRED");
      const own = await createRewardNeed(client, business, makeNeed());
      await reject(() => createRewardOffer(client, business, own.id, input), "SELF_REWARD");
      await reject(() => createRewardOffer(client, business, need.id, { ...input, reward: 101 }), "INSUFFICIENT_ROLLS");
    });
    await t.test("reserve debits exactly once, records history, and prevents conflicting retries", async () => {
      first = await createRewardOffer(client, business, need.id, input);
      assert.equal((await createRewardOffer(client, business, need.id, input)).id, first.id);
      await reject(() => createRewardOffer(client, business, need.id, { ...input, reward: 1 }), "IDEMPOTENCY_CONFLICT");
      const wallet = await readRollWallet(client, business);
      assert.equal(wallet.balances.reservedRewards, "60");
      assert.equal(wallet.balance, 40);
      assert(wallet.transactions.some(row => row.kind === "need_reserve" && row.amount === 60 && row.direction === "outgoing"));
      assert.equal((await readRewardNeeds(client, other)).needs.length, 0);
      await reject(() => actOnRewardOffer(client, other, first.id, { action: "accept" }), "OFFER_NOT_FOUND");
      await reject(() => actOnRewardOffer(client, business, first.id, { action: "accept" }), "ACTION_FORBIDDEN");
    });
    await t.test("only one proposal can be accepted and payout cannot be claimed early", async () => {
      const second = await createRewardOffer(client, competitor, need.id, { ...input, idempotencyKey: randomUUID() });
      await actOnRewardOffer(client, owner, first.id, { action: "accept" });
      await reject(() => actOnRewardOffer(client, owner, second.id, { action: "accept" }), "NEED_CLOSED");
      await reject(() => actOnRewardOffer(client, owner, first.id, { action: "claim" }), "REWARD_STATE_CONFLICT");
      await actOnRewardOffer(client, owner, second.id, { action: "decline" });
      assert.equal((await readRollWallet(client, competitor)).balance, 100);
      await actOnRewardOffer(client, business, first.id, { action: "deliver" });
      await reject(() => actOnRewardOffer(client, business, first.id, { action: "cancel" }), "REWARD_STATE_CONFLICT");
      await actOnRewardOffer(client, owner, first.id, { action: "confirm" });
      await reject(() => actOnRewardOffer(client, owner, first.id, { action: "claim" }), "REWARD_STATE_CONFLICT");
    });
    await t.test("dispute blocks payout and refunds, including after the hold", async () => {
      await client.query("SAVEPOINT dispute_check");
      try {
        await actOnRewardOffer(client, owner, first.id, { action: "dispute", reason: "Результат не соответствует условиям" });
        await client.query("UPDATE reward_need_offers SET claim_at=CURRENT_TIMESTAMP - INTERVAL '1 second' WHERE id=$1", [first.id]);
        await reject(() => actOnRewardOffer(client, owner, first.id, { action: "claim" }), "REWARD_STATE_CONFLICT");
        await reject(() => actOnRewardOffer(client, business, first.id, { action: "cancel" }), "REWARD_STATE_CONFLICT");
      } finally { await client.query("ROLLBACK TO SAVEPOINT dispute_check"); }
    });
    await t.test("settlement conserves rolls, writes one receipt and is safe to retry", async () => {
      await client.query("UPDATE reward_need_offers SET claim_at=CURRENT_TIMESTAMP - INTERVAL '1 second' WHERE id=$1", [first.id]);
      await client.query("SAVEPOINT balance_limit_check");
      try {
        await client.query("UPDATE roll_wallets SET balance=$2 WHERE user_id=$1", [owner, ROLLS_MAX_BALANCE]);
        await reject(() => actOnRewardOffer(client, owner, first.id, { action: "claim" }), "BALANCE_LIMIT");
        assert.equal((await client.query("SELECT status FROM reward_need_offers WHERE id=$1", [first.id])).rows[0].status, "confirmed");
      } finally { await client.query("ROLLBACK TO SAVEPOINT balance_limit_check"); }
      await actOnRewardOffer(client, owner, first.id, { action: "claim" });
      assert.equal((await actOnRewardOffer(client, owner, first.id, { action: "claim" })).replayed, true);
      const wallet = await readRollWallet(client, owner);
      assert.equal(wallet.balance, 160);
      assert.equal(wallet.transactions.filter(row => row.kind === "need_reward").length, 1);
      assert.equal((await balances()).reduce((sum, row) => sum + Number(row.balance), 0), 400);
      assert.equal((await readRewardNeeds(client, owner)).needs.find(row => row.id === need.id).status, "closed");
      assert.equal((await readRewardNeeds(client, owner)).totals.earned, "60");
      assert.deepEqual((await readRewardNeeds(client, business)).totals, { earned: "0", reserved: "0", completed: 1 });
    });
    await t.test("cancel refunds once and an unused need can close", async () => {
      const n = await createRewardNeed(client, owner, makeNeed());
      const o = await createRewardOffer(client, business, n.id, { ...input, reward: 20, idempotencyKey: randomUUID() });
      await reject(() => closeRewardNeed(client, owner, n.id), "NEED_HAS_OFFERS");
      assert.equal(await expireRewardOffer(client, o.id), false);
      await actOnRewardOffer(client, business, o.id, { action: "cancel" });
      await actOnRewardOffer(client, business, o.id, { action: "cancel" });
      assert.equal((await readRollWallet(client, business)).balance, 40);
      await closeRewardNeed(client, owner, n.id);
    });
    await t.test("reviewed dispute decisions release the reserve once and retain an operator reason", async () => {
      for (const outcome of ["reward", "refund"]) {
        await client.query("SAVEPOINT decision_check");
        try {
          const n = await createRewardNeed(client, owner, makeNeed());
          const o = await createRewardOffer(client, business, n.id, { ...input, reward: 20, idempotencyKey: randomUUID() });
          await actOnRewardOffer(client, owner, o.id, { action: "accept" });
          await actOnRewardOffer(client, owner, o.id, { action: "dispute", reason: "Нужно проверить результат выполнения" });
          await resolveRewardDispute(client, o.id, outcome, "Решение после независимой проверки результата");
          await reject(() => resolveRewardDispute(client, o.id, outcome, "Повторное решение после проверки"), "REWARD_STATE_CONFLICT");
          assert.equal((await balances()).reduce((sum, row) => sum + Number(row.balance), 0), 400);
          const events = await client.query("SELECT actor_id,note FROM reward_need_events WHERE offer_id=$1 AND action=$2", [o.id, `resolve_${outcome}`]);
          assert.equal(events.rowCount, 1); assert.equal(events.rows[0].actor_id, null); assert(events.rows[0].note.length > 10);
        } finally { await client.query("ROLLBACK TO SAVEPOINT decision_check"); }
      }
    });
    await t.test("expired offers refund safely, and publication caps cannot mint balances", async () => {
      const n = await createRewardNeed(client, owner, makeNeed());
      const o = await createRewardOffer(client, business, n.id, { ...input, reward: 20, idempotencyKey: randomUUID() });
      await client.query("UPDATE reward_need_offers SET expires_at=CURRENT_TIMESTAMP - INTERVAL '1 second' WHERE id=$1", [o.id]);
      await reject(() => actOnRewardOffer(client, owner, o.id, { action: "accept" }), "REWARD_STATE_CONFLICT");
      assert.equal(await expireRewardOffer(client, o.id), true);
      assert.equal(await expireRewardOffer(client, o.id), false);
      await actOnRewardOffer(client, business, o.id, { action: "cancel" });
      const expired = await client.query("SELECT actor_id FROM reward_need_events WHERE offer_id=$1 AND action='expire'", [o.id]);
      assert.equal(expired.rowCount, 1); assert.equal(expired.rows[0].actor_id, null);
      const before = await balances();
      for (let index = 0; index < 20; index++) await createRewardNeed(client, other, makeNeed());
      await reject(() => createRewardNeed(client, other, makeNeed()), "NEEDS_LIMIT");
      assert.deepEqual(await balances(), before);
    });
    await t.test("blockchain outbox is atomic with reward and retries never touch balances", async () => {
      const row = (await client.query("SELECT * FROM reward_blockchain_receipts WHERE offer_id=$1", [first.id])).rows[0];
      assert.equal(row.status, "queued");
      assert.equal(createHash("sha256").update(row.content).digest("hex"), row.digest);
      assert.equal(JSON.parse(row.content).amount, 60);
      assert.equal(JSON.parse(row.content).currency, "rolls");
      const before = await balances();
      await processRewardProof({ transaction: fn => fn(client), offerId: first.id, advance: async () => { throw new Error("calendar offline"); } });
      const after = (await client.query("SELECT * FROM reward_blockchain_receipts WHERE offer_id=$1", [first.id])).rows[0];
      assert.equal(after.status, "queued"); assert.equal(after.last_error, "PROOF_RETRY_REQUIRED"); assert.equal(after.attempts, 1);
      assert.deepEqual(await balances(), before);
      assert.equal((await actOnRewardOffer(client, owner, first.id, { action: "claim" })).replayed, true);
      assert.equal((await client.query("SELECT count(*)::int AS count FROM reward_blockchain_receipts WHERE offer_id=$1", [first.id])).rows[0].count, 1);
      // Exercise the queue's SQL success path with an explicitly injected
      // transport response. Cryptographic validity is covered by codec/network
      // checks separately; this savepoint is never committed or broadcast.
      await client.query("SAVEPOINT proof_transport_check");
      try {
        await client.query("UPDATE reward_blockchain_receipts SET next_attempt_at=CURRENT_TIMESTAMP WHERE offer_id=$1", [first.id]);
        const bytes = Buffer.from("sql-transport-fixture-not-a-blockchain-proof");
        await processRewardProof({ transaction: fn => fn(client), offerId: first.id, advance: async input => {
          assert.equal(input.digest, row.digest);
          return { status: "pending", proof: bytes.toString("base64"), bitcoin: null };
        } });
        const saved = (await client.query("SELECT status,proof,verified_at,lease_token FROM reward_blockchain_receipts WHERE offer_id=$1", [first.id])).rows[0];
        assert.equal(saved.status, "pending"); assert.deepEqual(saved.proof, bytes); assert.equal(saved.verified_at, null); assert.equal(saved.lease_token, null);
        assert.deepEqual(await balances(), before);
      } finally { await client.query("ROLLBACK TO SAVEPOINT proof_transport_check"); }
    });
    await t.test("receipt download is private to participants and never mislabels a queued proof as ready", async () => {
      const app = express();
      registerNeedRewardsRoutes(app, {
        env: { ROLLAPP_NEED_REWARDS_ENABLED: "true" }, transaction: fn => fn(client),
        requireAuth: (req, _res, next) => { req.user = { id: req.get("x-verification-user") }; next(); },
      });
      const server = app.listen(0, "127.0.0.1");
      await new Promise(resolve => server.once("listening", resolve));
      try {
        const get = (id, format) => fetch(`http://127.0.0.1:${server.address().port}/api/need-rewards/offers/${first.id}/receipt/${format}`, { headers: { "x-verification-user": id } });
        for (const id of [owner, business]) {
          const result = await get(id, "json");
          assert.equal(result.status, 200); assert.equal(result.headers.get("cache-control"), "no-store");
          assert(result.headers.get("content-disposition").includes("attachment"));
          const content = await result.text();
          assert.equal(JSON.parse(content).offerId, first.id); assert.equal(JSON.parse(content).amount, 60);
        }
        assert.equal((await get(other, "json")).status, 404);
        assert.equal((await get(owner, "ots")).status, 409);
      } finally { await new Promise(resolve => server.close(resolve)); }
    });
    await t.test("wallet transfer and replay retain feature flags and reward history", async () => {
      const app = express(); app.use(express.json());
      registerRollsRoutes(app, {
        env: { ROLLAPP_NEED_REWARDS_ENABLED: "true" }, query: client.query.bind(client),
        transaction: fn => fn(client), starsConfig: () => ({ enabled: false }),
        requireAuth: (req, _res, next) => { req.user = { id: owner }; next(); },
      });
      const server = app.listen(0, "127.0.0.1");
      await new Promise(resolve => server.once("listening", resolve));
      try {
        const url = `http://127.0.0.1:${server.address().port}/api/rolls`;
        const body = JSON.stringify({ recipientId: other, amount: 1, note: "Rollback-only verification", idempotencyKey: randomUUID() });
        for (const status of [201, 200]) {
          const response = await fetch(`${url}/transfers`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
          assert.equal(response.status, status);
          const data = await response.json();
          assert.deepEqual(data.features, { starsPurchases: false, tonWallet: false, needRewards: true });
          assert.equal(data.balance, 159);
          assert(data.transactions.some(row => row.kind === "need_reward" && row.amount === 60));
        }
        const wallet = await (await fetch(url)).json();
        assert.equal(wallet.balance, 159); assert.equal(wallet.features.needRewards, true);
        assert.equal((await balances()).reduce((sum, row) => sum + Number(row.balance), 0), 400);
      } finally { await new Promise(resolve => server.close(resolve)); }
    });

    await t.test("the confirmation API supports an explicit automatic election and conserves rolls in the scheduled payout", async () => {
      await client.query("SAVEPOINT auto_reward");
      const preAudit = await reconcileRollAccounting(client);
      const preWallet = (await readRollWallet(client, owner)).balance;
      const app = express();
      app.use(express.json());
      registerNeedRewardsRoutes(app, {
        env: { ROLLAPP_NEED_REWARDS_ENABLED: "true" }, transaction: fn => fn(client),
        requireAuth: (req, _res, next) => { req.user = { id: req.get("x-verification-user") }; next(); },
      });
      const server = app.listen(0, "127.0.0.1");
      await new Promise(resolve => server.once("listening", resolve));
      try {
        const n = await createRewardNeed(client, owner, makeNeed());
        const o = await createRewardOffer(client, business, n.id, { ...input, reward: 10, idempotencyKey: randomUUID() });
        await actOnRewardOffer(client, owner, o.id, { action: "accept" });
        await actOnRewardOffer(client, business, o.id, { action: "deliver" });
        const base = `http://127.0.0.1:${server.address().port}/api/need-rewards`;
        const confirm = (id, body) => fetch(`${base}/offers/${o.id}/actions`, {
          method: "POST", headers: { "Content-Type": "application/json", "x-verification-user": id }, body: JSON.stringify(body),
        });
        const settings = await fetch(`${base}/config`, { headers: { "x-verification-user": owner } }).then(res => res.json());
        assert.equal(settings.automaticSettlement, true);
        assert.equal(settings.holdDays, 7);
        const election = { action: "confirm", automaticSettlement: true };
        assert.equal((await confirm(other, election)).status, 404);
        const response = await confirm(owner, election);
        assert.equal(response.status, 200);
        const now = (await client.query("SELECT clock_timestamp() AS now")).rows[0].now;
        const offers = (await readRewardNeeds(client, business)).needs.find(({ id }) => id === n.id).offers;
        assert.equal(offers[0].automaticSettlement, true);
        assert(offers[0].claimAt.getTime() <= now.getTime() + 168 * 3600000);
        assert(offers[0].claimAt.getTime() >= now.getTime() + 168 * 3600000 - 10_000);
        assert.equal(await automaticallySettleRewardOffer(client, o.id), false);
        assert.equal((await confirm(owner, { action: "confirm" })).status, 409);
        const confirmReplay = await confirm(owner, election).then(res => res.json());
        assert.equal(confirmReplay.offer.replayed, true);

        await client.query("UPDATE reward_need_offers SET claim_at=transaction_timestamp() WHERE id=$1", [o.id]);
        await reject(() => actOnRewardOffer(client, owner, o.id, { action: "dispute", reason: "Срок рассмотрения истёк" }), "REWARD_STATE_CONFLICT");
        await reject(() => actOnRewardOffer(client, business, o.id, { action: "dispute", reason: "Срок рассмотрения истёк" }), "REWARD_STATE_CONFLICT");
        const before = await reconcileRollAccounting(client, { sampleLimit: 100 });
        assert(before.attention.reward_automatic_due.sample.some(({ id }) => id === o.id));

        const queue = {
          query: (sql, params) => client.query(sql.replace('AS "dueAt" FROM due', 'AS "dueAt" FROM (SELECT * FROM due WHERE id=$4) fixture'), [...params, o.id]),
          transaction: fn => fn(client),
          onError(error) { throw error; },
        };
        assert.equal(await processDueRewardOffers(queue), null);
        assert.equal(await automaticallySettleRewardOffer(client, o.id), false);
        assert.equal((await actOnRewardOffer(client, owner, o.id, { action: "claim" })).replayed, true);
        assert.equal((await confirm(owner, election).then(res => res.json())).offer.replayed, true);
        const { rows } = await client.query(
          "SELECT actor_id FROM reward_need_events WHERE offer_id=$1 AND action='automatic_claim'", [o.id],
        );
        assert.deepEqual(rows, [{ actor_id: null }]);
        const receipt = (await client.query("SELECT content FROM reward_blockchain_receipts WHERE offer_id=$1", [o.id])).rows[0];
        assert.equal(JSON.parse(receipt.content).amount, 10);
        assert.equal((await readRollWallet(client, owner)).balance, preWallet + 10);
        const after = await reconcileRollAccounting(client);
        assert.equal(after.unaccountedRolls, preAudit.unaccountedRolls);
        assert.equal(after.rewardMismatches, preAudit.rewardMismatches);
        assert.equal(after.issuedRolls, preAudit.issuedRolls);
      } finally {
        await new Promise(resolve => server.close(resolve));
        await client.query("ROLLBACK TO SAVEPOINT auto_reward");
      }
    });

    await t.test("business escalation protects unresolved delivery; neither disputes nor old confirmations are auto-paid", async () => {
      await client.query("SAVEPOINT dispute_and_legacy");
      try {
        const prepare = async () => {
          const n = await createRewardNeed(client, owner, makeNeed());
          const o = await createRewardOffer(client, business, n.id, { ...input, reward: 5, idempotencyKey: randomUUID() });
          await actOnRewardOffer(client, owner, o.id, { action: "accept" });
          await actOnRewardOffer(client, business, o.id, { action: "deliver" });
          return o;
        };
        const delivery = await prepare();
        assert.equal(await automaticallySettleRewardOffer(client, delivery.id), false);
        const dispute = { action: "dispute", reason: "Клиент не подтвердил полученный результат" };
        assert.equal((await actOnRewardOffer(client, business, delivery.id, dispute)).status, "disputed");
        assert.equal((await actOnRewardOffer(client, business, delivery.id, dispute)).replayed, true);
        for (const participant of [owner, business]) {
          const offers = (await readRewardNeeds(client, participant)).needs.flatMap(({ offers }) => offers);
          assert.equal(offers.find(({ id }) => id === delivery.id).disputeReason, dispute.reason);
        }
        const visibleToOther = (await readRewardNeeds(client, competitor)).needs.flatMap(({ offers }) => offers);
        assert(!visibleToOther.some(({ id }) => id === delivery.id));
        await reject(() => actOnRewardOffer(client, owner, delivery.id, dispute), "REWARD_DISPUTE_CONFLICT");
        await reject(() => actOnRewardOffer(client, business, delivery.id, { ...dispute, reason: "Изменённое основание спора" }), "REWARD_DISPUTE_CONFLICT");
        assert.equal(await automaticallySettleRewardOffer(client, delivery.id), false);
        await resolveRewardDispute(client, delivery.id, "refund", "Оператор проверил условия и исполнение");

        const marked = await prepare();
        await actOnRewardOffer(client, owner, marked.id, { action: "confirm", automaticSettlement: true });
        await actOnRewardOffer(client, business, marked.id, dispute);
        await client.query("UPDATE reward_need_offers SET claim_at=transaction_timestamp() WHERE id=$1", [marked.id]);
        assert.equal(await automaticallySettleRewardOffer(client, marked.id), false);
        await reject(() => actOnRewardOffer(client, owner, marked.id, { action: "claim" }), "REWARD_STATE_CONFLICT");

        const manual = await prepare();
        await actOnRewardOffer(client, owner, manual.id, { action: "confirm" });
        await reject(() => actOnRewardOffer(client, owner, manual.id, { action: "confirm", automaticSettlement: true }), "REWARD_CONFIRMATION_CONFLICT");
        await client.query("UPDATE reward_need_offers SET claim_at=transaction_timestamp() WHERE id=$1", [manual.id]);
        assert.equal(await automaticallySettleRewardOffer(client, manual.id), false);
        assert.equal((await actOnRewardOffer(client, owner, manual.id, dispute)).status, "disputed");

        const capacity = await prepare();
        await actOnRewardOffer(client, owner, capacity.id, { action: "confirm", automaticSettlement: true });
        await client.query("UPDATE reward_need_offers SET claim_at=transaction_timestamp() WHERE id=$1", [capacity.id]);
        await client.query("SAVEPOINT full_wallet");
        await client.query("UPDATE roll_wallets SET balance=$2 WHERE user_id=$1", [owner, ROLLS_MAX_BALANCE]);
        await reject(() => automaticallySettleRewardOffer(client, capacity.id), "BALANCE_LIMIT");
        await client.query("ROLLBACK TO SAVEPOINT full_wallet");
        assert.equal((await client.query("SELECT status FROM reward_need_offers WHERE id=$1", [capacity.id])).rows[0].status, "confirmed");
        assert.equal(await automaticallySettleRewardOffer(client, capacity.id), true);
      } finally { await client.query("ROLLBACK TO SAVEPOINT dispute_and_legacy"); }
    });

  } finally {
    await client.query("ROLLBACK"); client.release(); await db.pool.end();
  }
});
