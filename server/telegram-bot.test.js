import assert from "node:assert/strict";
import { test } from "node:test";
import { callTelegramBotApi, getTelegramBotRuntimeConfig, pollTelegramBotOnce, startTelegramBotPolling, telegramLaunchReply } from "./telegram-bot.js";

test("builds a private /start Mini App reply and ignores unrelated updates", () => {
  const config = getTelegramBotRuntimeConfig({
    TELEGRAM_BOT_TOKEN: "123:secret",
    TELEGRAM_WEBHOOK_SECRET: "safe_webhook-secret",
    TELEGRAM_WEB_APP_URL: "https://xn--80avakiab.xn--p1ai/",
    TELEGRAM_BOT_USERNAME: "@rollappRFbot",
    TELEGRAM_DELIVERY_MODE: "polling",
  });
  assert.equal(config.enabled, true);
  assert.equal(config.webhookEnabled, true);
  assert.equal(config.botUsername, "rollappRFbot");
  assert.equal(config.deliveryMode, "polling");
  const reply = telegramLaunchReply({
    message: {
      text: "/start referral",
      chat: { id: 123456, type: "private" },
      from: { first_name: "Михаил" },
    },
  }, config);
  assert.equal(reply.chat_id, 123456);
  assert.match(reply.text, /^Михаил, добро пожаловать/);
  assert.deepEqual(reply.reply_markup.inline_keyboard[0][0], {
    text: "Открыть Rollapp",
    web_app: { url: "https://xn--80avakiab.xn--p1ai/" },
  });
  assert.equal(telegramLaunchReply({ message: { text: "привет", chat: { id: 1, type: "private" } } }, config), null);
  assert.equal(telegramLaunchReply({ message: { text: "/start", chat: { id: -100, type: "supergroup" } } }, config), null);
});

test("long polling acknowledges updates and answers launch commands", async () => {
  const requests = [];
  const config = getTelegramBotRuntimeConfig({
    TELEGRAM_BOT_TOKEN: "123:secret",
    TELEGRAM_WEB_APP_URL: "https://xn--80avakiab.xn--p1ai/",
    TELEGRAM_DELIVERY_MODE: "polling",
  });
  const nextOffset = await pollTelegramBotOnce({
    offset: 40,
    config,
    fetchImpl: async (url, options) => {
      const method = new URL(url).pathname.split("/").at(-1);
      requests.push({ method, body: JSON.parse(options.body) });
      const result = method === "getUpdates"
        ? [{ update_id: 42, message: { text: "/app@rollappRFbot", chat: { id: 7, type: "private" } } }]
        : { message_id: 9 };
      return new Response(JSON.stringify({ ok: true, result }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });
  assert.equal(nextOffset, 43);
  assert.deepEqual(requests.map(({ method }) => method), ["getUpdates", "sendMessage"]);
  assert.equal(requests[0].body.offset, 40);
  assert.equal(requests[1].body.reply_markup.inline_keyboard[0][0].web_app.url, "https://xn--80avakiab.xn--p1ai/");
});

test("long polling clears an existing webhook before requesting updates", async () => {
  const requests = [];
  let polling;
  const config = getTelegramBotRuntimeConfig({
    TELEGRAM_BOT_TOKEN: "123:secret",
    TELEGRAM_WEB_APP_URL: "https://xn--80avakiab.xn--p1ai/",
    TELEGRAM_DELIVERY_MODE: "polling",
  });
  polling = startTelegramBotPolling(config, {
    retryDelayMs: 0,
    fetchImpl: async (url, options) => {
      const method = new URL(url).pathname.split("/").at(-1);
      requests.push({ method, body: JSON.parse(options.body) });
      if (method === "getUpdates") polling.stop();
      const result = method === "getUpdates" ? [] : true;
      return new Response(JSON.stringify({ ok: true, result }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });
  await polling.done;
  assert.deepEqual(requests.map(({ method }) => method), ["deleteWebhook", "getUpdates"]);
  assert.deepEqual(requests[0].body, { drop_pending_updates: false });
});

test("long polling clears a webhook again after Telegram reports a conflict", async () => {
  const requests = [];
  let getUpdatesCalls = 0;
  let polling;
  const config = getTelegramBotRuntimeConfig({
    TELEGRAM_BOT_TOKEN: "123:secret",
    TELEGRAM_WEB_APP_URL: "https://xn--80avakiab.xn--p1ai/",
    TELEGRAM_DELIVERY_MODE: "polling",
  });
  polling = startTelegramBotPolling(config, {
    retryDelayMs: 0,
    fetchImpl: async (url, options) => {
      const method = new URL(url).pathname.split("/").at(-1);
      requests.push(method);
      if (method === "getUpdates" && getUpdatesCalls++ === 0) {
        return new Response(JSON.stringify({
          ok: false,
          description: "Conflict: can't use getUpdates method while webhook is active",
        }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (method === "getUpdates") polling.stop();
      return new Response(JSON.stringify({ ok: true, result: method === "getUpdates" ? [] : true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });
  await polling.done;
  assert.deepEqual(requests, ["deleteWebhook", "getUpdates", "deleteWebhook", "getUpdates"]);
});

test("Bot API helper sends JSON without exposing token in its return value", async () => {
  let request;
  const result = await callTelegramBotApi("sendMessage", { chat_id: 42, text: "Rollapp" }, {
    token: "123:secret",
    apiBase: "https://telegram.test/",
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({ ok: true, result: { message_id: 7 } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });
  assert.equal(request.url, "https://telegram.test/bot123:secret/sendMessage");
  assert.deepEqual(JSON.parse(request.options.body), { chat_id: 42, text: "Rollapp" });
  assert.deepEqual(result, { message_id: 7 });
});

test("Bot API errors omit the bot token", async () => {
  await assert.rejects(
    callTelegramBotApi("sendMessage", { chat_id: 42, text: "Rollapp" }, {
      token: "123:super-secret-token",
      apiBase: "https://telegram.test/",
      fetchImpl: async () => new Response(JSON.stringify({ ok: false, description: "Bad Request" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    }),
    (error) => {
      assert.match(error.message, /Bad Request/);
      assert.doesNotMatch(error.message, /super-secret-token/);
      return true;
    },
  );
});
