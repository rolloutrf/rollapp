import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import { registerBrandOfferConsentRoutes } from "./brand-offer-consent.js";

test("brand consent changes only the chosen buyer–brand pair and gates purchase needs", async () => {
  const app = express();
  app.use(express.json());
  const changes = [];
  const checks = [];
  let consent = false;
  registerBrandOfferConsentRoutes(app, {
    requireAuth: (req, res, next) => {
      const id = req.get("x-test-account");
      if (!id) return res.sendStatus(401);
      req.user = { id, account_type: id === "buyer" ? "personal" : "business" };
      next();
    },
    asyncRoute: handler => handler,
    findBrand: async (_query, name) => ({ rows: name === "brand" ? [{ id: "brand", account_type: "business" }] : [] }),
    query: async (sql, parties) => {
      assert.match(sql, /'brand-offers'/);
      assert.deepEqual(parties, ["buyer", "brand"]);
      consent = sql.startsWith("INSERT");
      changes.push(consent);
      return { rows: [] };
    },
    transaction: callback => callback({
      async query(sql, parties) {
        if (sql.startsWith("SET TRANSACTION")) {
          assert.match(sql, /REPEATABLE READ READ ONLY/);
          return;
        }
        if (sql.includes("sphere_section_shares")) {
          assert.match(sql, /sphere='brand-offers' AND section='needs'/);
          checks.push(parties);
          return { rowCount: Number(consent && parties[0] === "buyer" && parties[1] === "brand") };
        }
        assert.match(sql, /NOT archived AND NOT COALESCE\(completed, status='done'\)/);
        return { rows: [{
          id: "purchase-plan:need-example", dueOn: "2026-11-22", relatedItems: [{
            kind: "wishlist", id: "need-example", title: "Desk lamp", purchaseBudget: { minor: 50000, currency: "RUB" },
            need: { criteria: "Warm light", neededBy: "2026-12-01", savedMinor: 10000, variantIds: ["private-wish"] },
          }],
        }] };
      },
    }),
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const url = `http://127.0.0.1:${server.address().port}/api`;
    const needsPath = "/personal-offers/recipients/buyer/needs";
    const call = (path, id, body) => fetch(url + path, {
      method: body ? "POST" : "GET",
      headers: { "x-test-account": id, "Content-Type": "application/json" },
      body: body && JSON.stringify(body),
    });
    const setConsent = (id, granted, brand = "brand") => call(`/brand-offer-consents/${brand}`, id, { granted });
    assert.equal((await call(needsPath, "brand")).status, 404);
    assert.equal((await call(needsPath, "buyer")).status, 403);
    assert.equal((await setConsent("brand", true)).status, 403);
    assert.equal((await setConsent("buyer", true, "missing")).status, 404);
    assert.deepEqual(changes, []);
    assert.deepEqual(await (await setConsent("buyer", true)).json(), { granted: true });
    assert.equal((await call(needsPath, "other-brand")).status, 404);
    const shared = await call(needsPath, "brand");
    assert.equal(shared.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(await shared.json(), {
      needs: [{ id: "need-example", title: "Desk lamp", criteria: "Warm light", neededBy: "2026-12-01" }],
    });
    assert.deepEqual(await (await setConsent("buyer", false)).json(), { granted: false });
    assert.equal((await call(needsPath, "brand")).status, 404);
    assert.deepEqual(changes, [true, false]);
    assert.deepEqual(checks, [["buyer", "brand"], ["buyer", "other-brand"], ["buyer", "brand"], ["buyer", "brand"]]);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
