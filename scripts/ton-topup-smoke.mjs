import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { browserLaunchOptions } from "./browser-runtime.mjs";
import { listenSmokeServer, smokeOrigin } from "./smoke-server.mjs";

const server = await createServer({
  cacheDir: "node_modules/.vite-ton-topup", server: { host: "127.0.0.1", port: 0, hmr: false, watch: null },
  plugins: [{ name: "ton-topup-fixture", configureServer(vite) {
    vite.middlewares.use(async (req, res, next) => {
      if (!req.url.startsWith("/__ton-topup")) return next();
      res.setHeader("Content-Type", "text/html");
      res.end(await vite.transformIndexHtml(req.url, '<!doctype html><html lang="ru" class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/ton-topup.jsx"></script></body></html>'));
    });
  } }],
});
await listenSmokeServer(server);
const browser = await chromium.launch(browserLaunchOptions());
const origin = smokeOrigin(server);
const matrix = [[320,844,"missing"], [390,844,"paused"], [768,900,"quote"], [820,450,"lost"],
  [1024,900,"lost"], [1440,900,"lost"], [1920,900,"paused"], [390,400,"lost"]];
const button = (page, name) => page.getByRole("button", { name, exact: true });
async function seed(page, mode) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/**", (route) => { errors.push("Forbidden real API"); return route.abort(); });
  await page.goto(`${origin}/__ton-topup?mode=${mode}`);
  return errors;
}
async function createOrder(page) {
  await button(page, "Пополнить роллы за TON").click();
  await button(page, "500 роллов").click();
  await page.getByText(/Принимаю условия разового пополнения/).click();
  assert(await button(page, "Создать счёт").isEnabled());
  await button(page, "Создать счёт").click();
}
try {
  for (const [width, height, mode] of matrix) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: width < 768 ? 3 : 1 });
    const errors = await seed(page, mode);
    const snapshot = () => page.evaluate(() => tonFixture.state());
    const back = button(page, "Назад");
    const pay = button(page, "Открыть оплату в кошельке");
    const check = button(page, "Проверить создание счёта");
    await createOrder(page);
    if (mode === "quote") {
      await page.getByText(/Сумма или получатель изменились/).waitFor();
      await page.getByText("К оплате 2,5 TON и комиссия сети.", { exact: true }).waitFor();
      assert.equal((await snapshot()).order, null);
      assert(await button(page, "Создать счёт").isDisabled());
      await page.getByText(/Принимаю условия разового пополнения/).click();
      await button(page, "Создать счёт").click();
      await pay.waitFor();
      assert.notEqual((await snapshot()).posts[0].idempotencyKey, (await snapshot()).posts[1].idempotencyKey);
    } else {
      await page.getByText(/Ответ о создании счёта потерян/).waitFor();
      const original = (await snapshot()).posts[0];
      await back.click();
      await button(page, "Восстановить счёт TON").waitFor();
      if (mode === "paused") await page.evaluate(() => { tonFixture.disable(); tonFixture.settle(); });
      if (mode === "paused" && width === 1920) await page.goto(`${origin}/__ton-topup?mode=wallet-status`);
      else {
        await page.reload();
        await button(page, "Отключить тестовый кошелёк").click();
      }
      await button(page, "Восстановить счёт TON").click();
      const bounds = await check.boundingBox();
      assert.equal(bounds.height, 48);
      assert(bounds.y + bounds.height <= height + 1);
      assert.equal(await page.evaluate(() => tonFixture.reads.filter(path => path.includes("/by-request/")).length), 0);
      await check.click();
      assert.deepEqual((await snapshot()).posts, [original]);
      assert.equal((await snapshot()).attempts.length, 0);
      assert.equal(await page.evaluate(() => tonFixture.reads.find(path => path.includes("/by-request/"))),
        `/rolls/ton/orders/by-request/${original.idempotencyKey}`);
      if (mode === "paused") {
        await page.getByText("Оплата подтверждена. Роллы начислены.").waitFor();
        assert.equal(await pay.count(), 0);
        await back.click();
        await page.getByText(/Отправленные платежи продолжают проверяться/).waitFor();
        assert.equal(await button(page, "Пополнить роллы за TON").count(), 0);
        assert.deepEqual(errors, []);
        console.log(`PASS TON ${width}×${height} paused: exact order without a connected wallet or new purchase`);
        await page.close();
        continue;
      }
      if (mode === "missing") await page.getByText("Счёт пока не найден.").waitFor();
      else await page.getByText(/Для оплаты подключите исходный кошелёк/).waitFor();
      await back.click();
      await button(page, "Подключить тестовый кошелёк").click();
      if (mode === "missing") {
        await button(page, "Восстановить счёт TON").click();
        await check.click();
        await button(page, "Повторить создание счёта").click();
        assert.deepEqual((await snapshot()).posts, [original, original]);
      } else await button(page, "Счёт TON").click();
      await pay.waitFor();
    }
    assert.equal((await snapshot()).attempts.length, 0, "Order creation and checking never open a wallet request");
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await pay.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => {
      const element = document.querySelector('button[aria-label="Открыть оплату в кошельке"]');
      const box = element?.getBoundingClientRect();
      return box && box.right <= innerWidth + 1 && box.bottom <= innerHeight + 1;
    });
    assert(await pay.evaluate((element) => element.scrollWidth <= element.clientWidth + 1 &&
      element.getBoundingClientRect().height === 48 && parseFloat(getComputedStyle(element).borderTopLeftRadius) === 24));
    if (height < 500 || width === 1440) await page.screenshot({ path: `/tmp/rollapp-ton-order-${width}x${height}.png` });
    if (height < 500) {
      const support = page.getByRole("link", { name: "Поддержка по оплате и возвратам", exact: true });
      await support.scrollIntoViewIfNeeded();
      const supportBounds = await support.boundingBox();
      const payBounds = await pay.boundingBox();
      assert(supportBounds.y + supportBounds.height <= (width < 768 ? payBounds.y : height));
    }
    await pay.click();
    await page.waitForFunction(() => tonFixture.state().attempts.length === 1);
    assert.deepEqual((await snapshot()).attempts[0], (await snapshot()).order.transaction);
    if (width === 1440) {
      await page.evaluate(() => tonFixture.finishWallet("reject"));
      await page.getByText("Оплата отменена в кошельке.").waitFor();
      await pay.click();
      await page.waitForFunction(() => tonFixture.state().attempts.length === 2);
    }
    await page.evaluate(() => tonFixture.finishWallet("timeout"));
    await page.getByText(/Результат запроса неизвестен/).waitFor();
    assert.equal(await pay.count(), 0);
    const orderId = (await snapshot()).order.id;
    await back.click();
    await button(page, "Счёт TON").waitFor();
    await page.reload();
    await button(page, "Счёт TON").click();
    await page.getByText(/Запрос уже открыт в кошельке/).waitFor();
    assert(await page.evaluate((id) => localStorage.getItem(`rollapp:ton-payment:${id}`) === "requested", orderId));
    assert.equal(await pay.count(), 0);
    await page.evaluate(() => tonFixture.settle());
    await button(page, "Обновить статус счёта").click();
    await page.getByText("Оплата подтверждена. Роллы начислены.").waitFor();
    await back.click();
    await page.getByText("Обновлений баланса · 1").waitFor();
    assert.deepEqual(errors, []);
    console.log(`PASS TON ${width}×${height} ${mode}: quote, original request, separate payment, timeout and confirmed settlement`);
    await page.close();
  }

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const first = await context.newPage();
  const second = await context.newPage();
  const firstErrors = await seed(first, "parallel");
  await createOrder(first);
  const firstPay = button(first, "Открыть оплату в кошельке");
  await firstPay.waitFor();
  const secondErrors = await seed(second, "parallel");
  await button(second, "Счёт TON").click();
  const secondPay = button(second, "Открыть оплату в кошельке");
  await secondPay.waitFor();
  assert(await first.evaluate(() => Boolean(navigator.locks)));
  await Promise.all([firstPay.evaluate((node) => node.click()), secondPay.evaluate((node) => node.click())]);
  await first.waitForFunction(() => tonFixture.state().attempts.length === 1);
  await first.getByText(/Запрос уже открыт в кошельке/).waitFor();
  await second.getByText(/Запрос уже открыт в кошельке/).waitFor();
  assert.equal(await second.evaluate(() => tonFixture.state().attempts.length), 1);
  assert.deepEqual([...firstErrors, ...secondErrors], []);
  console.log("PASS TON concurrent tabs: one request reaches the connected wallet");
  await context.close();
} finally {
  await browser.close();
  await server.close();
}
