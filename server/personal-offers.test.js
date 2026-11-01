import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createPersonalOfferSchema, createPersonalOffer, payPersonalOffer, personalOfferFromRow } from "./personal-offers.js";

const input = () => ({ itemId: "item", recipientId: "buyer", priceRolls: 50, durationHours: 24, idempotencyKey: randomUUID() });
function scripted(steps) {
  const calls = [];
  return { calls, async query(sql, params) {
    calls.push({ sql, params });
    const step = steps.shift();
    assert(step, `Unexpected SQL: ${sql}`);
    assert.match(sql, step[0]);
    const rows = step[1] || [];
    return { rows, rowCount: rows.length };
  }, done() { assert.equal(steps.length, 0); } };
}
const reject = (operation, code) => assert.rejects(operation, e => e.code === code);

test("offer terms require integer rolls, bounded duration and a stable request key", () => {
  assert(createPersonalOfferSchema.safeParse(input()).success);
  for (const changes of [{ priceRolls: 0 }, { priceRolls: 1.5 }, { priceRolls: 1000001 }, { durationHours: 0 }, { durationHours: 721 }, { durationHours: 1.2 }, { idempotencyKey: "bad" }, { purchaseId: "forged" }]) {
    assert.equal(createPersonalOfferSchema.safeParse({ ...input(), ...changes }).success, false);
  }
});
test("creation rejects personal sellers, self offers, unavailable or another business's item", async () => {
  const personal = scripted([[/account_type='business' FOR UPDATE/, []]]);
  await reject(createPersonalOffer(personal, "seller", input()), "BUSINESS_REQUIRED"); personal.done();
  await reject(createPersonalOffer(scripted([]), "buyer", input()), "SELF_OFFER");
  const foreign = scripted([[/account_type='business'/, [{ id: "seller" }]], [/idempotency_key/, []], [/business_user_id=\$2 AND active=TRUE FOR SHARE/, []]]);
  await reject(createPersonalOffer(foreign, "seller", input()), "PRODUCT_NOT_FOUND"); foreign.done();
});
test("creating an offer freezes price/title and computes expiry once using database time", async () => {
  const client = scripted([[/account_type='business'/, [{ id: "seller" }]], [/idempotency_key/, []], [/FROM business_marketplace_items/, [{ title: "Original title" }]], [/account_type='personal'/, [{ id: "buyer" }]], [/INSERT INTO business_personal_offers/, []]]);
  const data = input(); const result = await createPersonalOffer(client, "seller", data);
  assert.equal(result.replayed, false);
  assert.deepEqual(client.calls.at(-1).params.slice(1), ["seller", "buyer", "item", "Original title", 50, 24, data.idempotencyKey, null]);
  assert.match(client.calls.at(-1).sql, /clock_timestamp/); client.done();
});
test("creation retries preserve the original expiry and reject different terms", async () => {
  const data = input(); const row = { id: randomUUID(), item_id: data.itemId, recipient_id: data.recipientId, price_rolls: "50", duration_hours: "24" };
  for (const changed of [false, true]) {
    const client = scripted([[/FOR UPDATE/, [{ id: "seller" }]], [/idempotency_key/, [row]]]);
    if (changed) await reject(createPersonalOffer(client, "seller", { ...data, priceRolls: 51 }), "IDEMPOTENCY_CONFLICT");
    else assert.deepEqual(await createPersonalOffer(client, "seller", data), { id: row.id, replayed: true });
    client.done();
  }
});
test("payment is private and paid retries never touch balances, including after expiry", async () => {
  const id = randomUUID();
  const other = scripted([[/recipient_id=\$2 FOR UPDATE/, []]]);
  await reject(payPersonalOffer(other, "other", id), "OFFER_NOT_FOUND");
  assert.deepEqual(other.calls[0].params, [id, "other"]); other.done();
  const paid = scripted([[/FOR UPDATE/, [{ purchase_id: "purchase" }]]]);
  assert.deepEqual(await payPersonalOffer(paid, "buyer", id), { id: "purchase", replayed: true }); paid.done();
  await reject(payPersonalOffer(scripted([]), "buyer", "invalid"), "OFFER_NOT_FOUND");
});
test("status gives paid priority over expiry and does not expose request keys", () => {
  const row = { id: randomUUID(), price_rolls: "50", expired: true, purchase_id: "purchase", idempotency_key: "secret" };
  assert.equal(personalOfferFromRow(row).status, "paid");
  assert.equal(personalOfferFromRow({ ...row, purchase_id: null }).status, "expired");
  assert.equal(personalOfferFromRow({ ...row, purchase_id: null, expired: false }).status, "active");
  assert.equal(personalOfferFromRow(row).idempotencyKey, undefined);
});

test("expired offers fail before any wallet operation", async () => {
  const id = randomUUID();
  const client = scripted([[/recipient_id=\$2 FOR UPDATE/, [{ id, price_rolls: "50", business_user_id: "seller" }]], [/expires_at > clock_timestamp\(\)/, []]]);
  await reject(payPersonalOffer(client, "buyer", id), "OFFER_EXPIRED"); client.done();
});

test("payment rechecks expiry after wallet locks and stores a single purchase with frozen terms", async () => {
  for (const expiresDuringTransfer of [true, false]) {
    const id = randomUUID();
    const steps = [
      [/recipient_id=\$2 FOR UPDATE/, [{ id, item_id: "item", item_title: "Frozen", price_rolls: "50", business_user_id: "seller" }]],
      [/expires_at > clock_timestamp/, [{ id }]],
      [/SELECT id FROM users/, [{ id: "seller" }]],
      // ensureRollWallet locks in sorted order: buyer, seller.
      ...["buyer", "seller"].flatMap(() => [[/INSERT INTO roll_wallets/, []], [/FOR UPDATE/, []], [/INSERT INTO roll_transactions/, []]]),
      [/SELECT \* FROM roll_transactions/, []],
      [/balance=balance-/, [{ balance: "50" }]], [/balance=balance\+/, [{ balance: "150" }]],
      [/INSERT INTO roll_transactions/, []],
      [/expires_at > clock_timestamp/, expiresDuringTransfer ? [] : [{ id }]],
      ...expiresDuringTransfer ? [] : [[/INSERT INTO roll_store_purchases/, []], [/UPDATE business_personal_offers SET purchase_id/, []]],
    ];
    const client = scripted(steps);
    if (expiresDuringTransfer) await reject(payPersonalOffer(client, "buyer", id), "OFFER_EXPIRED");
    else {
      const purchase = await payPersonalOffer(client, "buyer", id);
      assert.equal(purchase.replayed, false);
      const inserted = client.calls.find(call => call.sql.includes("INSERT INTO roll_store_purchases"));
      assert.deepEqual(inserted.params.slice(1, 6), ["buyer", `offer:${id}`, "Frozen", 50, id]);
      assert.equal(JSON.parse(inserted.params[6]).personalOfferId, id);
    }
    client.done();
  }
});

test("business item selection uses authenticated account_type and enforces seller ownership", async () => {
  const { default: express } = await import("express");
  const { registerPersonalOfferRoutes } = await import("./personal-offers.js");
  const app = express();
  const calls = [];
  registerPersonalOfferRoutes(app, {
    requireAuth(req, _res, next) { req.user = { id: "seller", account_type: req.headers["x-test-type"] || "personal" }; next(); },
    query: async (sql, params) => { calls.push({ sql, params }); return { rows: [{ id: "own", title: "Own item", price_rolls: "25" }] }; },
    transaction: async () => { throw new Error("GET must never mutate"); },
  });
  app.use((e, _req, res, _next) => res.status(e.status || 500).json({ code: e.code }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/personal-offers/items`;
    const forbidden = await fetch(url);
    assert.equal(forbidden.status, 403); assert.equal(calls.length, 0);
    const response = await fetch(url, { headers: { "x-test-type": "business" } });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { items: [{ id: "own", title: "Own item", priceRolls: 25 }] });
    assert.deepEqual(calls[0].params, ["seller"]);
    assert.match(calls[0].sql, /business_user_id=\$1 AND active=TRUE/);
    assert.match(response.headers.get("cache-control"), /no-store/);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test("own item creation accepts no client-supplied seller and retries do not duplicate", async () => {
  const { createPersonalOfferItem, personalOfferItemSchema } = await import("./personal-offers.js");
  const data = { title: "Service", priceRolls: 70, sphere: "education", itemType: "service", idempotencyKey: randomUUID() };
  assert.equal(personalOfferItemSchema.safeParse({ ...data, businessId: "other" }).success, false);
  assert.equal(personalOfferItemSchema.safeParse({ ...data, title: " " }).success, false);
  const personal = scripted([[/account_type='business'/, []]]);
  await reject(createPersonalOfferItem(personal, "buyer", data), "BUSINESS_REQUIRED"); personal.done();
  const first = scripted([[/account_type='business'/, [{ id: "seller" }]], [/SELECT \* FROM business_marketplace_items/, []], [/INSERT INTO business_marketplace_items/, []]]);
  const result = await createPersonalOfferItem(first, "seller", data);
  assert.equal(result.replayed, false); assert.equal(first.calls.at(-1).params[1], "seller"); first.done();
  const row = { business_user_id: "seller", title: "Service", description: "", price_rolls: "70", sphere: "education", item_type: "service" };
  for (const seller of ["seller", "other"]) {
    const retry = scripted([[/account_type='business'/, [{ id: seller }]], [/SELECT \* FROM business_marketplace_items/, [row]]]);
    if (seller === "seller") assert.deepEqual(await createPersonalOfferItem(retry, seller, data), { id: result.id, replayed: true });
    else await reject(createPersonalOfferItem(retry, seller, data), "IDEMPOTENCY_CONFLICT");
    retry.done();
  }
});
