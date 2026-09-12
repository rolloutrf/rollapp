import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createStarInvoice, getStarsConfig, starOrderInput } from "./roll-stars.js";
import { forwardTelegramPaymentUpdate, getTelegramBotRuntimeConfig, pollTelegramBotOnce, telegramLaunchReply } from "./telegram-bot.js";
import { ROLL_STAR_PACKAGES, ROLL_STAR_TERMS_VERSION } from "../shared/roll-stars.js";

const bot = getTelegramBotRuntimeConfig({ TELEGRAM_BOT_TOKEN: "test:token", TELEGRAM_WEBHOOK_SECRET: "test-secret", TELEGRAM_DELIVERY_MODE: "external-polling" });
const checkout = { update_id: 91, pre_checkout_query: { id: "checkout-91" } };
const paid = { update_id: 92, message: { successful_payment: { telegram_payment_charge_id: "charge" } } };
const json = (result, status = 200) => new Response(JSON.stringify(result), { status, headers: { "Content-Type": "application/json" } });

test("Stars packages use the agreed rate and reject prices supplied by the client", () => {
  assert.deepEqual(ROLL_STAR_PACKAGES.map(({ rolls, stars }) => [rolls, stars]), [[100, 10], [500, 50], [1000, 100]]);
  const valid = { packageId: "rolls-100", idempotencyKey: randomUUID(), termsVersion: ROLL_STAR_TERMS_VERSION };
  assert.equal(starOrderInput.safeParse(valid).success, true);
  for (const input of [{ ...valid, stars: 1 }, { ...valid, rolls: 999999 }, { ...valid, termsVersion: "" }, { ...valid, packageId: "free" }]) {
    assert.equal(starOrderInput.safeParse(input).success, false);
  }
  assert.equal(getStarsConfig({}).enabled, false);
  assert.equal(getStarsConfig({ TELEGRAM_BOT_TOKEN: "x", TELEGRAM_DELIVERY_MODE: "external-polling" }).enabled, false);
  assert.equal(getStarsConfig({ TELEGRAM_BOT_TOKEN: "x", TELEGRAM_DELIVERY_MODE: "polling" }).enabled, true);
  assert.equal(getStarsConfig({ TELEGRAM_BOT_TOKEN: "x", TELEGRAM_DELIVERY_MODE: "polling", TELEGRAM_STARS_ENABLED: "false" }).enabled, false);
});

test("invoice uses one XTR price, opaque payload and no recurring payment", async () => {
  const order = { id: randomUUID(), rolls: 100, stars: 10 };
  const link = await createStarInvoice(order, bot, async (method, payload) => {
    assert.equal(method, "createInvoiceLink");
    assert.equal(payload.payload, `rolls:${order.id}`);
    assert.equal(payload.currency, "XTR");
    assert.equal(payload.provider_token, "");
    assert.equal(payload.subscription_period, undefined);
    assert.deepEqual(payload.prices, [{ label: "100 роллов", amount: 10 }]);
    return "https://t.me/$example-invoice";
  });
  assert.equal(link, "https://t.me/$example-invoice");
  await assert.rejects(createStarInvoice(order, bot, async () => "https://attacker.test"), /invalid invoice/);
});

test("external poller authenticates forwarding and requires durable payment acknowledgement", async () => {
  await forwardTelegramPaymentUpdate(paid, bot, async (url, options) => {
    assert.equal(url.pathname, "/api/telegram/webhook");
    assert.equal(options.headers["X-Telegram-Bot-Api-Secret-Token"], "test-secret");
    assert.deepEqual(JSON.parse(options.body), paid);
    return json({ ok: true, paymentProcessed: true });
  });
  for (const body of [{ ok: true }, { method: "sendMessage" }]) {
    await assert.rejects(forwardTelegramPaymentUpdate(paid, bot, async () => json(body)), /did not confirm/);
  }
  await assert.rejects(forwardTelegramPaymentUpdate(checkout, bot, async () => json({ ok: true })), /did not confirm/);
  assert.equal(await forwardTelegramPaymentUpdate({ message: { text: "hello" } }, bot), null);
});

test("poller subscribes to checkout events and does not acknowledge failed settlements", async () => {
  let methods = [];
  const fetchImpl = async (url, options) => {
    const method = new URL(url).pathname.split("/").at(-1);
    methods.push(method);
    if (method === "getUpdates") {
      assert.deepEqual(JSON.parse(options.body).allowed_updates, ["message", "pre_checkout_query"]);
      return json({ ok: true, result: [paid] });
    }
    return json({ ok: true, result: true });
  };
  await assert.rejects(pollTelegramBotOnce({ config: bot, fetchImpl }), /handler is not configured/);
  await assert.rejects(pollTelegramBotOnce({ config: bot, fetchImpl, handleUpdate: async () => { throw new Error("DB unavailable"); } }), /DB unavailable/);
  methods = [];
  const offset = await pollTelegramBotOnce({ config: bot, fetchImpl, handleUpdate: async () => ({ ok: true, paymentProcessed: true }) });
  assert.equal(offset, 93);
  assert.deepEqual(methods, ["getUpdates"]);
});

test("expired checkout answers do not block following successful payments", async () => {
  const methods = [];
  const offset = await pollTelegramBotOnce({
    config: bot,
    fetchImpl: async (url) => {
      const method = new URL(url).pathname.split("/").at(-1);
      methods.push(method);
      return method === "getUpdates" ? json({ ok: true, result: [checkout] }) : json({ ok: false, error_code: 400, description: "query is too old" }, 400);
    },
    handleUpdate: async () => ({ method: "answerPreCheckoutQuery", pre_checkout_query_id: "checkout-91", ok: true }),
  });
  assert.equal(offset, 92);
  assert.deepEqual(methods, ["getUpdates", "answerPreCheckoutQuery"]);
});

test("payment support and terms commands resolve to the agreed contact", () => {
  const message = { text: "/paysupport", chat: { id: 1, type: "private" } };
  assert.match(telegramLaunchReply({ message }, bot).text, /https:\/\/t.me\/koloskof/);
  assert.match(telegramLaunchReply({ message: { ...message, text: "/terms" } }, bot).text, /100 роллов стоят 10/);
});
