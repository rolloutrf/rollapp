import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createRewardNeedSchema, createRewardOfferSchema, rewardActionSchema, registerNeedRewardsRoutes } from "./need-rewards.js";
import { needRewardActions } from "../shared/need-rewards.js";
import { initializeRuntimeDatabase } from "./database-startup.js";

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
  assert(!rewardActionSchema.safeParse({ action: "dispute", reason: "" }).success);
  assert(rewardActionSchema.safeParse({ action: "dispute", reason: "Результат не соответствует договорённости" }).success);
});
test("claim requires confirmation and a complete seven-day hold; dispute remains available until payout", () => {
  const now = Date.UTC(2026, 10, 1);
  const row = { status: "confirmed", claimAt: new Date(now + 1).toISOString() };
  assert.deepEqual(needRewardActions(row, false, now), ["dispute"]);
  assert.deepEqual(needRewardActions(row, false, now + 1), ["claim", "dispute"]);
  for (const status of ["offered", "accepted", "delivered", "disputed", "settled", "declined", "cancelled"]) {
    assert(!needRewardActions({ ...row, status }, false, now + 2).includes("claim"));
  }
  assert.deepEqual(needRewardActions(row, true, now + 2), []);
});
test("expired proposals cannot be accepted and a business cannot cancel a delivered result", () => {
  const now = Date.UTC(2026, 10, 1);
  assert.deepEqual(needRewardActions({ status: "offered", expiresAt: new Date(now) }, false, now), ["decline"]);
  assert.deepEqual(needRewardActions({ status: "delivered" }, true, now), []);
});
test("disabled rewards are explicit and do not touch the database", async () => {
  const routes = new Map();
  const app = { get(path, ...handlers) { routes.set(path, handlers.at(-1)); }, post() {} };
  registerNeedRewardsRoutes(app, { requireAuth() {}, transaction() { assert.fail("Disabled feature queried a database"); }, env: {} });
  let result;
  const res = { set() { return this; }, status(code) { this.code = code; return this; }, json(body) { result = body; } };
  await routes.get("/api/need-rewards/config")({}, res);
  assert.equal(result.enabled, false); assert.equal(result.currency, "rolls");
  await routes.get("/api/need-rewards")({}, res, error => { throw error; });
  assert.equal(res.code, 503); assert.equal(result.code, "NEED_REWARDS_DISABLED");
});
test("enabled production startup checks rewards read-only and never migrates missing tables", async () => {
  const calls = [];
  const options = { environment: { ROLLAPP_DATABASE_INITIALIZATION: "verify", ROLLAPP_NEED_REWARDS_ENABLED: "true" }, isMemoryDatabase: false,
    migrate() { assert.fail("Startup must not migrate"); }, transaction: fn => fn({ query: async sql => { calls.push(sql); return { rows: [] }; } }) };
  await initializeRuntimeDatabase(options);
  assert.equal(calls[0], "SET TRANSACTION READ ONLY");
  for (const table of ["reward_needs", "reward_need_offers", "reward_need_entries", "reward_need_events"]) assert(calls.some(sql => sql.includes(`FROM ${table} LIMIT 0`)));
  assert(calls.slice(1).every(sql => sql.startsWith("SELECT ")));
  options.transaction = fn => fn({ query: async sql => { if (sql.includes("reward_need_offers")) throw new Error("missing offers"); return { rows: [] }; } });
  await assert.rejects(initializeRuntimeDatabase(options), /missing offers/);
});
