import assert from "node:assert/strict";
import { test } from "node:test";
import { deliverStarInvoices, startStarInvoiceWorker } from "./star-invoice-worker.js";

const config = { webhookEnabled: true, webhookSecret: "test-secret", webAppUrl: "https://rollapp.example/" };
const order = { id: "094bce87-1e14-44c6-9eea-b8631b7a53a0", rolls: 100, stars: 10 };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });

test("invoice worker uses authenticated delivery and the stored price and payload", async () => {
  const requests = [];
  await deliverStarInvoices(config, {
    callApi: async (method, payload) => {
      assert.equal(method, "createInvoiceLink");
      assert.equal(payload.payload, `rolls:${order.id}`);
      assert.equal(payload.currency, "XTR");
      assert.deepEqual(payload.prices, [{ label: "100 роллов", amount: 10 }]);
      return "https://t.me/$invoice";
    },
    fetchImpl: async (url, options) => {
      requests.push(url.pathname);
      assert.equal(url.origin, "https://rollapp.example");
      assert.equal(options.headers["X-Telegram-Bot-Api-Secret-Token"], "test-secret");
      if (!options.method) return json({ orders: [order] });
      assert.deepEqual(JSON.parse(options.body), { invoiceUrl: "https://t.me/$invoice" });
      return json({ ok: true });
    },
  });
  assert.deepEqual(requests, ["/api/telegram/star-invoices", `/api/telegram/star-invoices/${order.id}`]);
});

test("invoice worker rejects unauthenticated queues, unsafe links and failed persistence", async () => {
  await assert.rejects(deliverStarInvoices({ ...config, webhookEnabled: false }), /secret/);
  await assert.rejects(deliverStarInvoices(config, { fetchImpl: async () => json({}, 401) }), /401/);
  await assert.rejects(deliverStarInvoices(config, {
    fetchImpl: async () => json({ orders: [order] }), callApi: async () => "https://attacker.example/",
  }), /Invalid Telegram/);
  await assert.rejects(deliverStarInvoices(config, {
    fetchImpl: async (_url, options) => options.method ? json({}, 503) : json({ orders: [order] }),
    callApi: async () => "https://t.me/$invoice",
  }), /503/);
});

test("invoice loop retries provider failures independently and stops cleanly", async () => {
  let calls = 0;
  let worker;
  worker = startStarInvoiceWorker(config, {
    intervalMs: 1,
    fetchImpl: async () => {
      if (++calls === 1) throw new Error("timeout");
      worker.stop();
      return json({ orders: [] });
    },
  });
  await worker.done;
  assert.equal(calls, 2);
});
