import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createRewardNeedSchema, createRewardOfferSchema, rewardActionSchema, processDueRewardOffers, registerNeedRewardsRoutes } from "./need-rewards.js";
import { needRewardActions } from "../../../shared/modules/loyalty/need-rewards.js";
import { initializeRuntimeDatabase } from "../runtime/database-startup.js";

test("publishing requires explicit consent and rejects private-source or reward fields", () => {
  const input = { title: "Нужна помощь", description: "Хочу получить проверяемый результат", publishedToBusinesses: true, idempotencyKey: randomUUID() };
  assert(createRewardNeedSchema.safeParse(input).success);
  for (const extra of [{ publishedToBusinesses: false }, { publishedToBusinesses: undefined }, { reward: 100 }, { userId: "other" }, { privateDocumentId: "source" }]) {
    assert(!createRewardNeedSchema.safeParse({ ...input, ...extra }).success);
  }
});
test("reward budgets are bounded whole rolls, never client-selected recipients or state", () => {
  const input = { description: "Конкретное решение и условия", reward: 1, idempotencyKey: randomUUID() };
  assert(createRewardOfferSchema.safeParse(input).success);
  for (const reward of [0, -1, 1.1, 1000001, "100", Infinity]) assert(!createRewardOfferSchema.safeParse({ ...input, reward }).success);
  for (const extra of [{ businessId: "other" }, { status: "settled" }, { claimAt: "yesterday" }, { recipientId: "me" }]) assert(!createRewardOfferSchema.safeParse({ ...input, ...extra }).success);
  assert(!rewardActionSchema.safeParse({ action: "claim", reward: 100 }).success);
  assert(rewardActionSchema.safeParse({ action: "confirm", automaticSettlement: true }).success);
  assert(!rewardActionSchema.safeParse({ action: "claim", automaticSettlement: true }).success);
  assert(!rewardActionSchema.safeParse({ action: "dispute", reason: "" }).success);
  assert(rewardActionSchema.safeParse({ action: "dispute", reason: "Результат не соответствует договорённости" }).success);
});
test("claim requires confirmation and a complete hold; the automatic election closes dispute at the published deadline", () => {
  const now = Date.UTC(2026, 10, 1);
  const row = { status: "confirmed", claimAt: new Date(now + 1).toISOString() };
  assert.deepEqual(needRewardActions(row, false, now), ["dispute"]);
  assert.deepEqual(needRewardActions(row, false, now + 1), ["claim", "dispute"]);
  for (const status of ["offered", "accepted", "delivered", "disputed", "settled", "declined", "cancelled"]) {
    assert(!needRewardActions({ ...row, status }, false, now + 2).includes("claim"));
  }
  assert.deepEqual(needRewardActions(row, true, now), ["dispute"]);
  assert.deepEqual(needRewardActions(row, true, now + 2), []);
  const automatic = { ...row, automaticSettlement: true };
  assert.deepEqual(needRewardActions(automatic, false, now), ["dispute"]);
  assert.deepEqual(needRewardActions(automatic, false, now + 1), ["claim"]);
});
test("expired proposals cannot be accepted and a business cannot cancel a delivered result", () => {
  const now = Date.UTC(2026, 10, 1);
  assert.deepEqual(needRewardActions({ status: "offered", expiresAt: new Date(now) }, false, now), ["decline"]);
  assert.deepEqual(needRewardActions({ status: "delivered" }, true, now), ["dispute"]);
});
test("disabled rewards are explicit and do not touch the database", async () => {
  const routes = new Map();
  const app = { get(path, ...handlers) { routes.set(path, handlers.at(-1)); }, post() {} };
  registerNeedRewardsRoutes(app, { requireAuth() {}, transaction() { assert.fail("Disabled feature queried a database"); }, env: {} });
  let result;
  const res = { set() { return this; }, status(code) { this.code = code; return this; }, json(body) { result = body; } };
  await routes.get("/api/need-rewards/config")({}, res);
  assert.equal(result.enabled, false); assert.equal(result.automaticSettlement, false); assert.equal(result.currency, "rolls");
  await routes.get("/api/need-rewards")({}, res, error => { throw error; });
  assert.equal(res.code, 503); assert.equal(result.code, "NEED_REWARDS_DISABLED");
});
test("enabled production startup checks rewards read-only and never migrates missing tables", async () => {
  const calls = [];
  let missingOffers = false;
  const options = { environment: { ROLLAPP_DATABASE_INITIALIZATION: "verify", ROLLAPP_NEED_REWARDS_ENABLED: "true" }, isMemoryDatabase: false,
    migrate() { assert.fail("Startup must not migrate"); }, transaction: fn => fn({ query: async sql => {
      calls.push(sql);
      if (missingOffers && sql.includes("reward_need_offers")) throw new Error("missing offers");
      if (sql.includes("to_regclass('roll_marketplace_orders')")) return { rows: [{ orders: false, events: false }] };
      if (sql.includes("profile_session_bookings_active_slot")) return { rows: [{
        indisunique: true, indisvalid: true, indisready: true, indislive: true,
        indexdef: "CREATE UNIQUE INDEX profile_session_bookings_active_slot ON profile_session_bookings (slot_id) WHERE status IN ('pending','confirmed')",
      }], rowCount: 1 };
      return { rows: [] };
    } }) };
  await initializeRuntimeDatabase(options);
  assert.equal(calls[0], "SET TRANSACTION READ ONLY");
  for (const table of ["reward_needs", "reward_need_offers", "reward_need_entries", "reward_need_events"]) assert(calls.some(sql => sql.includes(`FROM ${table} LIMIT 0`)));
  assert(calls.slice(1).every(sql => sql.trimStart().startsWith("SELECT ")));
  missingOffers = true;
  await assert.rejects(initializeRuntimeDatabase(options), /missing offers/);
});


test("the settlement sweep advances past a full batch of blocked offers and retries after wrapping", async () => {
  const ids = Array.from({ length: 21 }, (_, index) => ({ id: randomUUID(), action: "expire", dueAt: String(index) }));
  const blocked = new Error("balance limited");
  const errors = [];
  const attempted = [];
  const dependencies = {
    query(sql, [dueAt, id, limit]) {
      assert(sql.includes("(due_at,id)>"));
      const first = dueAt === null ? 0 : ids.findIndex((row) => row.id === id && row.dueAt === dueAt) + 1;
      return { rows: ids.slice(first, first + limit) };
    },
    transaction(run) {
      return run({ query(sql, [id] = []) {
        if (sql.startsWith("SET LOCAL")) return;
        attempted.push(id);
        if (id !== ids[20].id) throw blocked;
        return { rows: [] };
      } });
    },
    onError(error) { errors.push(error); },
  };
  const cursor = await processDueRewardOffers(dependencies);
  assert.equal(cursor.id, ids[19].id);
  assert.equal(errors.length, 20);
  assert.equal(await processDueRewardOffers({ ...dependencies, cursor }), null);
  assert.deepEqual(attempted, ids.map((row) => row.id));
  assert(errors.every((error) => error === blocked));
});
