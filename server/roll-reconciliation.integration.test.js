import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { reconcileRollAccounting, rollAccountingMatches } from "./modules/payments/roll-reconciliation.js";
import { ensureRollWallet, transferRolls } from "./modules/payments/rolls.js";
import { enrollWishRewards, grantRolls, grantWishReward, previewRollGrant } from "./modules/loyalty/roll-rewards.js";
import { issueGiftCard, changeGiftCard } from "./modules/loyalty/gift-cards.js";
import { actOnRewardOffer, createRewardNeed, createRewardOffer } from "./modules/loyalty/need-rewards.js";

async function addUser(client, accountType, { wallet = true } = {}) {
  const id = randomUUID();
  await client.query(`INSERT INTO users(id,email,username,name,password_hash,account_type)
    VALUES ($1,$2,$3,'Ledger verification','unusable',$4)`, [id, `${id}@rolls-test.invalid`, `ledger-test-${id}`, accountType]);
  if (wallet) await ensureRollWallet(client, id);
  return id;
}

const difference = (before, after, key) => BigInt(after[key]) - BigInt(before[key]);

test("reconciliation on configured PostgreSQL, using rollback-only fixtures", { skip: process.env.ROLLAPP_TEST_ROLL_RECONCILIATION !== "1" }, async (t) => {
  const { productionRollsDatabase } = await import("../scripts/rolls-database.mjs");
  const db = await productionRollsDatabase();
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='15s'");
    const inspect = (sampleLimit = 0) => reconcileRollAccounting(client, { sampleLimit });
    const before = await inspect();

    const owner = await addUser(client, "personal");
    const other = await addUser(client, "personal");
    const business = await addUser(client, "business");
    const makeOffer = async () => {
      const need = await createRewardNeed(client, owner, {
        title: "Проверяемая потребность", description: "Подготовить результат", publishedToBusinesses: true, idempotencyKey: randomUUID(),
      });
      return createRewardOffer(client, business, need.id, {
        description: "Награда за результат", reward: 10, idempotencyKey: randomUUID(),
      });
    };
    const act = (offer, user, action, reason) => actOnRewardOffer(client, user, offer.id, { action, reason });
    const card = await issueGiftCard(client, other, { businessId: business, idempotencyKey: randomUUID() });

    await t.test("manual issuance preview detects replay and shows the welcome credit without writing", async () => {
      await client.query("SAVEPOINT grant_preview");
      try {
        const user = await addUser(client, "personal", { wallet: false });
        const terms = { amount: 25, reason: "Проверка начисления", idempotencyKey: randomUUID() };
        const preview = await previewRollGrant(client, user, terms);
        assert.equal(preview.account.balance, "0");
        assert.equal(preview.welcomeAmount, 100);
        assert.equal(preview.projectedBalance, "125");
        assert.equal(preview.existingGrantId, null);
        assert.equal((await client.query("SELECT 1 FROM roll_wallets WHERE user_id=$1", [user])).rowCount, 0);
        const grant = await grantRolls(client, user, terms);
        const replay = await previewRollGrant(client, user, terms);
        assert.equal(replay.welcomeAmount, 0);
        assert.equal(replay.existingGrantId, grant.id);
        assert.equal(replay.projectedBalance, "125");
        await assert.rejects(previewRollGrant(client, user, { ...terms, amount: 26 }), { code: "IDEMPOTENCY_CONFLICT" });
        await assert.rejects(previewRollGrant(client, other, terms), { code: "IDEMPOTENCY_CONFLICT" });
      } finally {
        await client.query("ROLLBACK TO SAVEPOINT grant_preview");
      }
    });

    await t.test("classifies issuance, all balances, and attention without exposing IDs by default", async () => {
      await grantRolls(client, owner, { amount: 17, reason: "Проверка", idempotencyKey: randomUUID() });
      await client.query(`INSERT INTO roll_manual_grants(id,user_id,amount,reason,idempotency_key,created_at)
        VALUES ($2,$1,7,'Historical fixture',$2,transaction_timestamp()-INTERVAL '720 hours')`, [owner, randomUUID()]);
      await client.query("UPDATE roll_wallets SET balance=balance+7 WHERE user_id=$1", [owner]);
      await enrollWishRewards(client, owner);
      await grantWishReward(client, owner, { id: randomUUID(), title: "Проверочное желание" });
      await transferRolls(client, owner, { recipientId: other, amount: 11, idempotencyKey: randomUUID() });
      await changeGiftCard(client, other, card.id, "topup", { amount: 6, idempotencyKey: randomUUID() });

      for (const paid of [false, true]) {
        const id = randomUUID();
        await client.query(`INSERT INTO roll_star_orders(id,user_id,telegram_user_id,package_id,rolls,stars,idempotency_key,terms_version,paid_at,telegram_payment_charge_id)
          VALUES ($1,$2,'123456','fixture',30,10,$1,'fixture',CASE WHEN $3 THEN transaction_timestamp() END,CASE WHEN $3 THEN $1 END)`, [id, owner, paid]);
        await client.query(`INSERT INTO roll_ton_orders(id,user_id,sender,recipient,chain,rolls,nanotons,rate,idempotency_key,paid_at,transaction_hash)
          VALUES ($1::text,$2,'fixture-sender','fixture-recipient','-239',40,1000,10,$1::text::uuid,CASE WHEN $3 THEN transaction_timestamp() END,CASE WHEN $3 THEN $1 END)`, [id, owner, paid]);
      }
      await client.query("UPDATE roll_wallets SET balance=balance+70 WHERE user_id=$1", [owner]);

      const settled = await makeOffer();
      await act(settled, owner, "accept");
      await act(settled, business, "deliver");
      await act(settled, owner, "confirm");
      await client.query("UPDATE reward_need_offers SET claim_at=transaction_timestamp() WHERE id=$1", [settled.id]);
      const claimable = await inspect(1);
      assert(claimable.attention.reward_claimable.count > (before.attention.reward_claimable?.count ?? 0));
      await act(settled, owner, "claim");
      const disputed = await makeOffer();
      await act(disputed, owner, "accept");
      await act(disputed, business, "deliver");
      await act(disputed, owner, "dispute", "Нужна проверка результата");
      const cancelled = await makeOffer();
      await act(cancelled, business, "cancel");
      const expired = await makeOffer();
      await client.query("UPDATE reward_need_offers SET expires_at=transaction_timestamp() WHERE id=$1", [expired.id]);

      const report = await inspect();
      assert.equal(difference(before, report, "issuedRolls"), 494n);
      for (const [source, total, recent] of [["welcome", 300n, 300n], ["wish_reward", 100n, 100n], ["manual_grant", 24n, 17n], ["stars_topup", 30n, 30n], ["ton_topup", 40n, 40n]]) {
        assert.equal(difference(before.issuedBySource, report.issuedBySource, source), total);
        assert.equal(difference(before.issuedLast30DaysBySource, report.issuedLast30DaysBySource, source), recent);
      }
      assert.equal(difference(before, report, "giftCardRolls"), 6n);
      assert.equal(difference(before, report, "reservedRewardRolls"), 20n);
      assert.equal(report.rewardMismatches, before.rewardMismatches);
      assert.equal(report.unaccountedRolls, before.unaccountedRolls);
      assert.equal(rollAccountingMatches(report), rollAccountingMatches(before));
      assert.equal("details" in report, false);
      assert.equal(report.attention.reward_disputed.count, (before.attention.reward_disputed?.count ?? 0) + 1);
      assert.equal(report.attention.reward_expiry_due.count, (before.attention.reward_expiry_due?.count ?? 0) + 1);
      assert.equal(report.attention.reward_disputed.sample, null);
      const detailed = await inspect(100);
      assert(detailed.attention.reward_disputed.sample.some(({ id }) => id === disputed.id));
      assert(detailed.attention.reward_expiry_due.sample.some(({ id }) => id === expired.id));
    });

    await t.test("detects offsetting balance damage and an incorrect payout recipient even when totals agree", async () => {
      const settled = await makeOffer();
      await act(settled, owner, "accept");
      await act(settled, business, "deliver");
      await act(settled, owner, "confirm");
      await client.query("UPDATE reward_need_offers SET claim_at=transaction_timestamp() WHERE id=$1", [settled.id]);
      await act(settled, owner, "claim");
      const clean = await inspect();
      await client.query("UPDATE reward_need_entries SET user_id=$2 WHERE offer_id=$1 AND kind='reward'", [settled.id, other]);
      await client.query("UPDATE roll_wallets SET balance=balance-10 WHERE user_id=$1", [owner]);
      await client.query("UPDATE roll_wallets SET balance=balance+10 WHERE user_id=$1", [other]);
      const wrongRecipient = await inspect(100);
      assert.equal(wrongRecipient.walletMismatches, clean.walletMismatches);
      assert.equal(wrongRecipient.rewardMismatches, clean.rewardMismatches + 1);
      assert.equal(wrongRecipient.unaccountedRolls, clean.unaccountedRolls);
      assert.equal(rollAccountingMatches(wrongRecipient), false);
      const incident = wrongRecipient.details.rewards.find(({ id }) => id === settled.id);
      assert.equal(incident.settlementKind, "reward");
      assert.equal(incident.amount, "10");

      await client.query("UPDATE roll_wallets SET balance=balance+9 WHERE user_id=$1", [owner]);
      await client.query("UPDATE roll_wallets SET balance=balance-11 WHERE user_id=$1", [other]);
      await client.query("UPDATE business_gift_cards SET balance=balance+2 WHERE id=$1", [card.id]);
      const report = await inspect(100);
      assert.equal(report.walletMismatches, clean.walletMismatches + 2);
      assert.equal(report.cardMismatches, clean.cardMismatches + 1);
      assert.equal(report.unaccountedRolls, clean.unaccountedRolls);
      assert.equal(report.details.wallets.find(({ id }) => id === owner).difference, "9");
      assert.equal(report.details.wallets.find(({ id }) => id === other).difference, "-11");
      assert.deepEqual(report.details.giftCards.find(({ id }) => id === card.id), { id: card.id, stored: "8", recorded: "6", difference: "2" });
      const limited = await inspect(1);
      assert.equal(limited.details.wallets.length, 1);
      assert.equal(limited.walletMismatches, report.walletMismatches);
    });
  } finally {
    try { await client.query("ROLLBACK"); } finally { client.release(); await db.pool.end(); }
  }
});
