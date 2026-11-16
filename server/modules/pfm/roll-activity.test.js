import assert from "node:assert/strict";
import test from "node:test";
import { readRollActivity, readRollActivityEntries, rollActivityEntriesQuery, rollActivityQuery } from "./roll-activity.js";
import { registerRollActivityRoutes } from "./roll-activity-routes.js";

const period = { days: 30, startsOn: "2026-10-18", endsOn: "2026-11-16", asOf: "2026-11-15T23:00:00.888421Z" };
const sourceChecks = [
  [/to_regclass\('business_gift_cards'\)/, [{ cards: false, card_events: false, needs: false, need_offers: false, need_entries: false }]],
  [/to_regclass\('roll_marketplace_orders'\)/, [{ orders: false, events: false }]],
];

function scripted(steps) {
  return { async query(sql, params) {
    const [pattern, rows, inspect] = steps.shift();
    assert.match(sql, pattern);
    inspect?.(params, sql);
    return { rows, rowCount: rows.length };
  }, done() { assert.deepEqual(steps, []); } };
}

test("activity query permits only bounded period, category and paired precise cursors", () => {
  assert.deepEqual(rollActivityQuery.parse({}), { days: 30 });
  for (const days of ["7", "30", "90"]) assert.equal(rollActivityQuery.parse({ days }).days, Number(days));
  for (const input of [{ days: "", owner: "other" }, { days: "10000000000000" }, { days: "90.5" }, { days: ["7", "90"] }, { days: "1e1" }]) {
    assert.equal(rollActivityQuery.safeParse(input).success, false);
  }
  const input = { days: "7", asOf: period.asOf, group: "payments", before: period.asOf, beforeId: "purchase:1" };
  assert.equal(rollActivityEntriesQuery.safeParse(input).success, true);
  for (const changes of [{ beforeId: undefined }, { group: "if-not" }, { asOf: "0000-12-31T00:00:00Z" }, { direction: "incoming" }]) {
    assert.equal(rollActivityEntriesQuery.safeParse({ ...input, ...changes }).success, false);
  }
});

test("statement totals retain exact whole rolls above JS safe-integer precision", async () => {
  const client = scripted([...sourceChecks, [/GROUP BY b.starting_on/, [
    { ...period, group: "bonuses", count: 31, received: "9007199254740999", debited: "0" },
    { ...period, group: "transfers", count: 2, received: "25", debited: "9007199254741088" },
  ], (params, sql) => {
    assert.deepEqual(params, ["account", 30, null]);
    assert.match(sql, /WHERE e.account_id=\$1/);
    assert.match(sql, /Europe\/Moscow/);
    assert.match(sql, /invoice\.purchase_id=invoice_order\.id/);
    assert.match(sql, /invoice_order\.delivery->>'paymentTransactionId'/);
  }]]);
  const summary = await readRollActivity(client, "account", { days: 30 });
  assert.deepEqual(summary.totals, { received: "9007199254741024", debited: "9007199254741088", change: "-64", count: 33 });
  assert.equal(summary.period.asOf, period.asOf);
  client.done();
});

test("activity routes apply session ownership and start a read-only snapshot after input validation", async () => {
  const handlers = new Map();
  let calls = 0;
  const requireAuth = (_req, _res, next) => next();
  registerRollActivityRoutes({ get(path, auth, limit, handler) { assert.equal(auth, requireAuth); handlers.set(path, handler); } }, {
    requireAuth,
    transaction: (read) => {
      calls += 1;
      return read(scripted([[/SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY/, []], ...sourceChecks,
        [/GROUP BY b.starting_on/, [{ ...period, group: null }], (params) => assert.equal(params[0], "account")],
      ]));
    },
  });
  const run = async (query) => {
    const result = { status: 200 };
    const res = { set: (header, value) => { result[header] = value; }, status: (code) => { result.status = code; return res; }, json: (body) => { result.body = body; } };
    await handlers.get("/api/rolls/activity")({ user: { id: "account" }, query }, res, (error) => { throw error; });
    return result;
  };
  assert.equal((await run({ userId: "other" })).status, 400);
  assert.equal(calls, 0);
  const empty = await run({ days: "30" });
  assert.equal(empty["Cache-Control"], "private, no-store");
  assert.deepEqual(empty.body.totals, { received: "0", debited: "0", change: "0", count: 0 });
  assert.equal(calls, 1);
});

test("entry detail returns a microsecond cursor and the ordinary transaction shape", async () => {
  const created_at = new Date(period.asOf);
  const rows = Array.from({ length: 31 }, (_, i) => ({
    id: `purchase:${i}`, cursor_at: period.asOf, kind: "purchase", direction: "outgoing", amount: "1", note: "", subject: "Заказ", created_at,
  }));
  const client = scripted([...sourceChecks, [/ORDER BY m.created_at DESC,m.id DESC/, rows, (params, sql) => {
    assert.deepEqual(params, ["account", 30, period.asOf, "payments", null, null, 31]);
    assert.match(sql, /\(m.created_at,m.id\)<\(\$5::timestamptz,\$6::text\)/);
  }]]);
  const detail = await readRollActivityEntries(client, "account", { days: 30, asOf: period.asOf, group: "payments" });
  assert.equal(detail.transactions.length, 30);
  assert.deepEqual(detail.next, { before: period.asOf, beforeId: "purchase:29" });
  assert.equal(detail.transactions[29].productTitle, "Заказ");
  client.done();
});
