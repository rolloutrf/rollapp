import assert from "node:assert/strict";
import { test } from "node:test";
import { forecastPurchases } from "./purchase-summary.js";

test("purchase outlook crosses the month boundary and subtracts savings only in their own bucket and currency", () => {
  const plan = (id, dueOn, minor, savedMinor = 0) => ({ id, title: id, dueOn, purchaseBudget: { minor, currency: "RUB" }, need: { savedMinor } });
  const plans = [plan("earlier", "2026-12-02", 1000, 300), plan("today", "2026-12-03", 1000, 500),
    plan("last", "2027-01-01", 1000), plan("outside", "2027-01-02", 50000)];
  const subscriptions = [{ id: "next", title: "Next", chargeOn: "2027-01-01", dueOn: "2026-12-01", budgetMinor: 2500, currency: "USD" },
    { id: "stopped", title: "Stopped", chargeOn: "2026-12-15", budgetMinor: 1000, currency: "RUB", stopped: true }];
  const { end, currencies } = forecastPurchases(plans, subscriptions, "2026-12-03");
  assert.equal(end, "2027-01-01");
  assert.deepEqual(currencies.map(({ currency, scheduledMinor, savedMinor, overdueMinor, items }) => [currency, scheduledMinor, savedMinor, overdueMinor, items.map(({ id }) => id)]),
    [["RUB", 2000, 500, 700, ["earlier", "today", "last"]], ["USD", 2500, 0, 0, ["next"]]]);
});
