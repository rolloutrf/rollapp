import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createPersonalOffer, createPersonalOfferItem, payPersonalOffer } from "./personal-offers.js";
import { readPersonalOfferAudit } from "./modules/checkout/personal-offer-ledger.js";
import { refundPersonalOffer } from "./modules/checkout/personal-offer-refunds.js";
import { readRollTopupAudit } from "./modules/payments/roll-topup-audit.js";
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
        const quote = () => previewRollGrant(client, user, terms, { includeIssuanceImpact: true });
        const { circulation } = await inspect();
        const preview = await quote();
        assert.equal(preview.account.balance, "0");
        assert.equal(preview.welcomeAmount, 100);
        assert.equal(preview.projectedBalance, "125");
        assert.equal(preview.existingGrantId, null);
        const impact = preview.issuanceImpact;
        assert.equal(impact.newlyIssuedRolls, "125");
        assert.equal(impact.current.heldRolls, circulation.heldRolls);
        assert.equal(impact.current.largestHoldingSharePercent, circulation.largestHoldingSharePercent);
        assert.equal(impact.current.recipientHoldingRolls, "0");
        assert.equal(impact.projected.recipientHoldingRolls, "125");
        assert.equal(difference(impact.current, impact.projected, "heldRolls"), 125n);
        assert.equal(JSON.stringify(impact).includes(user), false);
        assert.equal((await client.query("SELECT 1 FROM roll_wallets WHERE user_id=$1", [user])).rowCount, 0);
        const grant = await grantRolls(client, user, terms);
        const replay = await quote();
        assert.equal(replay.welcomeAmount, 0);
        assert.equal(replay.existingGrantId, grant.id);
        assert.equal(replay.projectedBalance, "125");
        assert.equal(replay.issuanceImpact.newlyIssuedRolls, "0");
        assert.deepEqual(replay.issuanceImpact.current, impact.projected);
        assert.deepEqual(replay.issuanceImpact.projected, replay.issuanceImpact.current);
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
      const beforeCardTopup = await inspect();
      await changeGiftCard(client, other, card.id, "topup", { amount: 6, idempotencyKey: randomUUID() });
      assert.deepEqual((await inspect()).circulation, beforeCardTopup.circulation);

      for (const paid of [false, true]) {
        const id = randomUUID();
        await client.query(`INSERT INTO roll_star_orders(id,user_id,telegram_user_id,package_id,rolls,stars,idempotency_key,terms_version,paid_at,telegram_payment_charge_id)
          VALUES ($1,$2,'123456','fixture',30,10,$1,'fixture',CASE WHEN $3 THEN transaction_timestamp() END,CASE WHEN $3 THEN $1 END)`, [id, owner, paid]);
        await client.query(`INSERT INTO roll_ton_orders(id,user_id,sender,recipient,chain,rolls,nanotons,rate,idempotency_key,paid_at,transaction_hash)
          VALUES ($1::text,$2,'fixture-sender','fixture-recipient','-239',40,1000,10,$1::text::uuid,CASE WHEN $3 THEN transaction_timestamp() END,CASE WHEN $3 THEN repeat(replace($1,'-',''),2) END)`, [id, owner, paid]);
      }
      await client.query("UPDATE roll_wallets SET balance=balance+70 WHERE user_id=$1", [owner]);

      const settled = await makeOffer();
      const beforeReserve = await inspect();
      await act(settled, owner, "accept");
      assert.deepEqual((await inspect()).circulation, beforeReserve.circulation);
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
      for (const [participant, additional] of [[other, 6n], [business, 20n]]) {
        const forecast = await previewRollGrant(client, participant, {
          amount: 1, reason: "Проверка состава остатка", idempotencyKey: randomUUID(),
        }, { includeIssuanceImpact: true });
        assert.equal(BigInt(forecast.issuanceImpact.current.recipientHoldingRolls), BigInt(forecast.account.balance) + additional);
        assert.equal(forecast.issuanceImpact.current.heldRolls, report.circulation.heldRolls);
      }
      assert.equal(difference(before, report, "issuedRolls"), 494n);
      for (const [source, total, recent] of [["welcome", 300n, 300n], ["wish_reward", 100n, 100n], ["manual_grant", 24n, 17n], ["stars_topup", 30n, 30n], ["ton_topup", 40n, 40n]]) {
        assert.equal(difference(before.issuedBySource, report.issuedBySource, source), total);
        assert.equal(difference(before.issuedLast30DaysBySource, report.issuedLast30DaysBySource, source), recent);
        assert.equal(difference(before.issuedPrevious30DaysBySource, report.issuedPrevious30DaysBySource, source), total - recent);
      }
      assert.equal(difference(before.circulation, report.circulation, "heldRolls"), 494n);
      assert.equal(report.circulation.participantsWithHoldings, before.circulation.participantsWithHoldings + 3);
      assert.equal(difference(before.circulation, report.circulation, "netSupplyChangeLast30Days"), 487n);
      assert.equal(difference(before.circulation, report.circulation, "netSupplyChangePrevious30Days"), 7n);
      for (const participant of [owner, other, business]) {
        assert.equal(JSON.stringify(report.circulation).includes(participant), false);
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

    await t.test("counts store spends and refunds once, in the period of each posting", async () => {
      await client.query("SAVEPOINT circulation");
      try {
        const baseline = await inspect();
        await client.query(`INSERT INTO roll_store_purchases(id,user_id,product_id,product_title,amount,idempotency_key,created_at,refunded_at)
          SELECT id,$1,'fixture','Circulation fixture',amount,id,
            transaction_timestamp()-age*INTERVAL '1 hour',
            CASE WHEN refunded THEN transaction_timestamp() END
          FROM (VALUES ($2::text,8,720,true),($3,12,0,false),($4,3,1440,false),($5,1,-1,false))
          AS fixtures(id,amount,age,refunded)`, [owner, randomUUID(), randomUUID(), randomUUID(), randomUUID()]);
        await client.query("UPDATE roll_wallets SET balance=balance-16 WHERE user_id=$1", [owner]);

        // Card purchases use the card journal even when they also have a store order.
        const spend = randomUUID();
        await client.query(`INSERT INTO business_gift_card_events (id,card_id,actor_id,kind,amount,request_key,created_at)
          VALUES ($1::text,$2,$3,'spend',4,$1::text::uuid,transaction_timestamp()-INTERVAL '720 hours')`, [spend, card.id, other]);
        const refund = randomUUID();
        await client.query(`INSERT INTO business_gift_card_events (id,card_id,actor_id,kind,amount,request_key,purchase_id)
          VALUES ($1::text,$2,$3,'refund',4,$1::text::uuid,$4)`, [refund, card.id, other, spend]);
        const order = randomUUID();
        await client.query(`INSERT INTO roll_store_purchases(id,user_id,product_id,product_title,amount,idempotency_key,delivery,created_at,refunded_at)
          VALUES ($1,$2,'fixture','Card-backed order',4,$1,jsonb_build_object('giftCardId',$3::text),
            transaction_timestamp()-INTERVAL '720 hours',transaction_timestamp())`, [order, other, card.id]);

        const result = await inspect();
        assert.equal(difference(baseline, result, "redeemedRolls"), 16n);
        assert.equal(difference(baseline.circulation, result.circulation, "redeemedLast30Days"), 0n);
        assert.equal(difference(baseline.circulation, result.circulation, "redeemedPrevious30Days"), 12n);
        assert.equal(difference(baseline.circulation, result.circulation, "netSupplyChangeLast30Days"), 0n);
        assert.equal(difference(baseline.circulation, result.circulation, "netSupplyChangePrevious30Days"), -12n);
        assert.equal(difference(baseline.circulation, result.circulation, "heldRolls"), -16n);
        assert.equal(result.unaccountedRolls, baseline.unaccountedRolls);
        assert.equal(rollAccountingMatches(result), rollAccountingMatches(baseline));
      } finally {
        await client.query("ROLLBACK TO SAVEPOINT circulation");
        await client.query("RELEASE SAVEPOINT circulation");
      }
    });

    await t.test("reports delayed top-ups, exact order lookup and independent payment evidence", async () => {
      await client.query("SAVEPOINT topup_audit");
      try {
        const baseline = await inspect();
        const createStars = async ({ age, expires = 900, linked = false, checkout = false }) => {
          const id = randomUUID();
          await client.query(`INSERT INTO roll_star_orders(id,user_id,telegram_user_id,package_id,rolls,stars,idempotency_key,terms_version,
            created_at,expires_at,invoice_url,checkout_query_id)
            VALUES ($1,$2,'987654','fixture',50,5,$1,'fixture',transaction_timestamp()-$3::int*INTERVAL '1 second',
             transaction_timestamp()+$4::int*INTERVAL '1 second',CASE WHEN $5 THEN 'https://t.me/$private' END,CASE WHEN $6 THEN $1 END)`,
          [id, owner, age, expires, linked, checkout]);
          return id;
        };
        const preparing = await createStars({ age: 59 });
        const due = await createStars({ age: 60 });
        const oldestDue = await createStars({ age: 600 });
        const payable = await createStars({ age: 45, linked: true });
        const reviewing = await createStars({ age: 45, linked: true, checkout: true });
        const expiredCheckout = await createStars({ age: 4000, expires: 0, linked: true, checkout: true });
        const expiredInvoice = await createStars({ age: 4000, expires: 0 });
        const expiredPayable = await createStars({ age: 4000, expires: 0, linked: true });
        const ton = randomUUID();
        const amount = "123456789012345678901";
        await client.query(`INSERT INTO roll_ton_orders(id,user_id,sender,recipient,chain,rolls,nanotons,rate,idempotency_key,created_at,expires_at)
          VALUES ($1,$2,'fixture-sender','fixture-recipient','-239',75,$3,10,$1::text::uuid,
            transaction_timestamp()-INTERVAL '15 minutes',transaction_timestamp())`, [ton, owner, amount]);

        const after = await inspect(1);
        assert.equal(after.topups.stars.unit, "XTR");
        assert.equal(after.topups.ton.unit, "nanoton");
        assert.equal(after.topupMismatches, baseline.topupMismatches);
        assert.equal(after.issuedRolls, baseline.issuedRolls);
        assert.equal(rollAccountingMatches(after), rollAccountingMatches(baseline));
        const states = [
          ["invoice_preparing", preparing], ["invoice_delivery_due", due], ["awaiting_payment", payable],
          ["checkout_pending", reviewing], ["checkout_expired", expiredCheckout],
          ["invoice_expired", expiredInvoice], ["expired_unconfirmed", expiredPayable],
        ];
        for (const [state, id] of states) {
          const record = await readRollTopupAudit(client, { provider: "stars", id });
          assert.equal(record.state, state);
          assert.equal(record.providerReference, null);
          assert.equal(record.externalAmount, "5");
          assert.equal(record.evidenceIssue, null);
          assert.deepEqual(Object.keys(record).sort(), ["createdAt", "creditedAt", "evidenceIssue", "expiresAt", "externalAmount", "id", "provider", "providerReference", "rolls", "state", "unit"].sort());
          const priorCount = baseline.topups.stars.states[state]?.count ?? 0;
          assert.equal(after.topups.stars.states[state].count - priorCount, state === "invoice_delivery_due" ? 2 : 1);
        }
        assert.equal(after.attention.stars_invoice_delivery_due.count - (baseline.attention.stars_invoice_delivery_due?.count ?? 0), 2);
        assert.equal(after.attention.stars_checkout_expired.count - (baseline.attention.stars_checkout_expired?.count ?? 0), 1);
        const full = await inspect(100);
        const newDue = full.attention.stars_invoice_delivery_due.sample.filter(({ id }) => [due, oldestDue].includes(id));
        assert.deepEqual(newDue.map(({ id }) => id), [oldestDue, due]);
        assert.equal(after.attention.stars_invoice_delivery_due.sample.length, 1);
        const aggregate = await inspect();
        assert.equal(aggregate.attention.stars_invoice_delivery_due.sample, null);
        assert.equal(JSON.stringify(aggregate).includes(due), false);
        assert.equal(JSON.stringify(aggregate).includes(ton), false);
        const tonStatus = await readRollTopupAudit(client, { provider: "ton", id: ton });
        assert.equal(tonStatus.state, "expired_unconfirmed");
        assert.equal(tonStatus.externalAmount, amount);
        assert.equal(tonStatus.creditedAt, null);
        assert.equal(await readRollTopupAudit(client, { provider: "stars", id: ton }), null);

        await client.query("UPDATE roll_ton_orders SET transaction_hash=$2 WHERE id=$1", [ton, "a9".repeat(32)]);
        const damaged = await inspect(100);
        assert.equal(damaged.issuedRolls, baseline.issuedRolls);
        assert.equal(damaged.unaccountedRolls, baseline.unaccountedRolls);
        assert.equal(damaged.topupMismatches, baseline.topupMismatches + 1);
        assert.equal(rollAccountingMatches(damaged), false);
        assert.deepEqual(damaged.details.topups.find(({ id }) => id === ton), {
          id: ton, provider: "ton", state: "expired_unconfirmed", evidenceIssue: "reference_timestamp_mismatch",
        });
        const exact = await readRollTopupAudit(client, { provider: "ton", id: ton });
        assert.equal(exact.providerReference, "a9".repeat(32));
        assert.equal(exact.evidenceIssue, "reference_timestamp_mismatch");
        assert.equal(JSON.stringify(damaged).includes("a9".repeat(32)), false);

        await client.query("UPDATE roll_ton_orders SET transaction_hash='fixture-invalid',paid_at=transaction_timestamp() WHERE id=$1", [ton]);
        await client.query("UPDATE roll_wallets SET balance=balance+75 WHERE user_id=$1", [owner]);
        const invalid = await inspect(100);
        assert.equal(invalid.unaccountedRolls, baseline.unaccountedRolls);
        assert.equal(invalid.details.topups.find(({ id }) => id === ton).evidenceIssue, "invalid_reference");
        await client.query("UPDATE roll_ton_orders SET transaction_hash=$2 WHERE id=$1", [ton, "a9".repeat(32)]);
        const reconciled = await inspect();
        assert.equal(reconciled.topupMismatches, baseline.topupMismatches);
        assert.equal(rollAccountingMatches(reconciled), rollAccountingMatches(baseline));
        assert.equal((await readRollTopupAudit(client, { provider: "ton", id: ton })).state, "credited");
      } finally { await client.query("ROLLBACK TO SAVEPOINT topup_audit"); }
    });

    await t.test("detects personal invoice evidence damage independently from wallet and system balances", async () => {
      await client.query("SAVEPOINT invoice_audit");
      try {
        const baseline = await inspect();
        assert.equal(baseline.personalOffers, true);
        const item = await createPersonalOfferItem(client, business, {
          title: "Проверка проводки счёта", priceRolls: 23, sphere: "education", itemType: "service", idempotencyKey: randomUUID(),
        });
        await client.query("INSERT INTO follows (follower_id,following_id) VALUES ($1,$2)", [owner, business]);
        const offer = await createPersonalOffer(client, business, {
          itemId: item.id, recipientId: owner, priceRolls: 23, durationHours: 24, idempotencyKey: randomUUID(),
        });
        const readInvoice = () => readPersonalOfferAudit(client, offer.id);
        const unpaid = await readInvoice();
        assert.equal(unpaid.state, "unpaid");
        assert.equal(unpaid.evidenceIssue, null);
        assert.equal(await readPersonalOfferAudit(client, randomUUID()), null);
        const { id: order } = await payPersonalOffer(client, owner, offer.id);
        const paid = await readInvoice();
        assert.equal(paid.amount, "23");
        assert.equal(paid.state, "paid");
        assert.equal(paid.orderId, order);
        assert.equal(typeof paid.debitId, "string");
        assert.equal(paid.evidenceIssue, null);
        assert.equal(JSON.stringify(paid).includes(owner), false);
        assert.equal(JSON.stringify(paid).includes(business), false);
        assert.equal((await inspect()).personalOfferMismatches, baseline.personalOfferMismatches);

        const verifyDamage = async (reason, sql, args, rejectCode = null) => {
          await client.query("SAVEPOINT invoice_damage");
          try {
            await client.query(sql, args);
            const result = await inspect(100);
            assert.equal(result.personalOfferMismatches, baseline.personalOfferMismatches + 1);
            assert.equal(result.walletMismatches, baseline.walletMismatches);
            assert.equal(result.unaccountedRolls, baseline.unaccountedRolls);
            assert.equal(rollAccountingMatches(result), false);
            const incident = result.details.personalOffers.find(({ id }) => id === offer.id);
            assert.equal(incident.evidenceIssue, reason);
            assert.equal(incident.orderId, order);
            assert.equal(incident.amount, "23");
            assert.equal((await readInvoice()).evidenceIssue, reason);
            if (rejectCode) await assert.rejects(refundPersonalOffer(client, business, offer.id), { code: rejectCode });
            assert.equal(JSON.stringify(await inspect()).includes(offer.id), false);
          } finally {
            await client.query("ROLLBACK TO SAVEPOINT invoice_damage");
            await client.query("RELEASE SAVEPOINT invoice_damage");
          }
        };
        await verifyDamage("order_terms", "UPDATE roll_store_purchases SET amount=24 WHERE id=$1", [order], "OFFER_ORDER_MISMATCH");
        await verifyDamage("debit_missing", "UPDATE roll_transactions SET idempotency_key=$2 WHERE id=$1", [paid.debitId, randomUUID()], "ORDER_PAYMENT_NOT_FOUND");
        await verifyDamage("debit_terms", "UPDATE roll_store_purchases SET delivery=jsonb_set(delivery,'{paymentTransactionId}',to_jsonb($2::text)) WHERE id=$1",
          [order, randomUUID()], "ORDER_PAYMENT_NOT_FOUND");
        await verifyDamage("refund_missing", "UPDATE roll_store_purchases SET refunded_at=clock_timestamp() WHERE id=$1", [order], "OFFER_ORDER_MISMATCH");

        await client.query("UPDATE roll_store_purchases SET delivery=delivery-'paymentTransactionId' WHERE id=$1", [order]);
        assert.equal((await readInvoice()).evidenceIssue, null);
        assert.equal((await refundPersonalOffer(client, business, offer.id)).replayed, false);
        const refunded = await readInvoice();
        assert.equal(refunded.state, "refunded");
        assert.equal(typeof refunded.refundId, "string");
        assert.equal(refunded.evidenceIssue, null);
        await verifyDamage("refund_unmarked", "UPDATE roll_store_purchases SET refunded_at=NULL WHERE id=$1", [order], "OFFER_ORDER_MISMATCH");
        await verifyDamage("refund_terms", `
          WITH changed AS (UPDATE roll_transactions SET recipient_id=$2 WHERE id=$1 RETURNING amount)
          UPDATE roll_wallets SET balance=balance+CASE WHEN user_id=$2 THEN changed.amount ELSE -changed.amount END
          FROM changed WHERE user_id IN ($2,$3)
        `, [refunded.refundId, other, owner], "OFFER_ORDER_MISMATCH");

        await client.query("UPDATE business_personal_offers SET purchase_id=NULL WHERE id=$1", [offer.id]);
        assert.equal((await readInvoice()).evidenceIssue, "payment_key_unlinked");
        const detached = await inspect(100);
        assert.equal(detached.personalOfferMismatches, baseline.personalOfferMismatches + 2);
        const incidents = Object.fromEntries(detached.details.personalOffers.map(({ id, evidenceIssue }) => [id, evidenceIssue]));
        assert.equal(incidents[offer.id], "payment_key_unlinked");
        assert.equal(incidents[order], "order_unlinked");
        const limited = await inspect(1);
        assert.equal(limited.personalOfferMismatches, detached.personalOfferMismatches);
        assert.equal(limited.details.personalOffers.length, 1);
      } finally { await client.query("ROLLBACK TO SAVEPOINT invoice_audit"); }
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
