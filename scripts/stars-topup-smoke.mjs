import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { browserLaunchOptions } from "./browser-runtime.mjs";
import { listenSmokeServer, smokeOrigin } from "./smoke-server.mjs";

const server = await createServer({
  cacheDir: "node_modules/.vite-stars-topup",
  server: { host: "127.0.0.1", port: 0, hmr: false, watch: null },
  plugins: [{ name: "stars-topup-fixture", configureServer(vite) {
    vite.middlewares.use(async (req, res, next) => {
      if (!req.url.startsWith("/__stars-topup")) return next();
      res.setHeader("Content-Type", "text/html");
      res.end(await vite.transformIndexHtml(req.url, '<!doctype html><html lang="ru" class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/stars-topup.jsx"></script></body></html>'));
    });
  } }],
});
await listenSmokeServer(server);
const browser = await chromium.launch(browserLaunchOptions());
try {
  for (const [width, height, mode] of [[320,844,"missing"], [390,844,"paused"], [768,900,"worker"], [820,450,"direct"],
    [1024,900,"worker"], [1440,900,"direct"], [1920,900,"paused"], [390,400,"worker-queue"]]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: width <= 390 ? 3 : 1 });
    const issues = [];
    page.on("pageerror", (error) => issues.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") issues.push(message.text()); });
    await page.route("**/api/**", (route) => { issues.push("Unexpected real Stars API"); return route.abort(); });
    await page.goto(`${smokeOrigin(server)}/__stars-topup?mode=${mode}`);
    const button = (name) => page.getByRole("button", { name, exact: true });
    const posts = () => page.evaluate(() => starsFixture.state.posts);
    const openTopup = button("Пополнить баланс");
    await openTopup.waitFor();
    const topupBox = await openTopup.boundingBox();
    const sendBox = await button("Отправить роллы").boundingBox();
    assert(Math.abs(topupBox.x + topupBox.width / 2 - sendBox.x - sendBox.width / 2) < 1);
    assert(topupBox.y >= sendBox.y + sendBox.height + 7);
    await openTopup.click();
    await page.getByRole("radio", { name: "500 роллов 50 Stars" }).click();
    const buy = button("Купить за 50 Stars");
    assert.match(await buy.getAttribute("aria-describedby"), /rolls-stars-terms/);
    assert.match(await page.locator("#rolls-stars-terms").textContent(), /вы принимаете эти условия/);
    await buy.click();
    const find = button("Найти счёт");
    await find.waitFor();
    const original = await posts();
    assert.equal(original.length, 1);
    assert.equal(original[0].packageId, "rolls-500");
    assert.equal(await page.evaluate(() => starsFixture.invoiceOpens.length), 0);
    await button("К кошельку").click();
    const resume = button("Открыть счёт Stars");
    await resume.waitFor();
    assert(await resume.evaluate((node) => node === document.activeElement));
    if (mode === "paused") await page.evaluate(() => { starsFixture.pause(); starsFixture.settle(); });
    await page.reload();
    await resume.click();
    await find.waitFor();
    assert.deepEqual(await posts(), original);
    assert.equal(await page.evaluate(() => starsFixture.reads.filter((path) => path.includes("/by-request/")).length), 0);
    if (width === 1024) {
      await page.evaluate(() => { starsFixture.state.order.termsVersion = "other-terms"; });
      await find.click();
      await page.getByText(/с другими условиями/).waitFor();
      assert.deepEqual(await posts(), original);
      assert.equal(await button("Повторить создание счёта").count(), 0);
      await page.evaluate((terms) => { starsFixture.state.order.termsVersion = terms; }, original[0].termsVersion);
      await button("К кошельку").click();
      await resume.click();
    }
    await find.click();
    assert.equal(await page.evaluate(() => starsFixture.reads.find((path) => path.includes("/by-request/"))),
      `/rolls/stars/orders/by-request/${original[0].idempotencyKey}`);
    assert.deepEqual(await posts(), original);
    assert.equal(await page.evaluate(() => starsFixture.invoiceOpens.length), 0);

    let retried = false;
    if (mode === "missing") {
      await page.getByText("Счёт пока не найден.", { exact: true }).waitFor();
      const retry = button("Повторить создание счёта");
      assert.equal((await retry.boundingBox()).height, 48);
      await retry.click();
      retried = true;
    }
    if (mode === "direct") {
      await page.getByText("Ссылка на счёт ещё не готова.", { exact: true }).waitFor();
      const retry = button("Запросить ссылку снова");
      assert.equal((await retry.boundingBox()).height, 48);
      if (width === 820) await page.screenshot({ path: "/tmp/rollapp-stars-recovery-direct-820x450.png" });
      await retry.click();
      retried = true;
    }
    if (mode === "worker-queue") {
      await page.getByText(/Готовим счёт Telegram/).waitFor();
      assert.equal(await button("Запросить ссылку снова").count(), 0);
      await page.evaluate(() => starsFixture.deliver());
      await button("Проверить оплату").click();
    }
    if (mode !== "paused") {
      const pay = button("Оплатить в Telegram");
      await pay.waitFor();
      const link = page.getByRole("link", { name: "Открыть счёт в Telegram", exact: true });
      assert.match(await link.getAttribute("href"), /^https:\/\/t\.me\/\$/);
      if (mode === "worker" || mode === "worker-queue") {
        assert.equal(await page.evaluate(() => starsFixture.invoiceOpens.length), 0);
        await pay.click();
      }
      assert.equal(await page.evaluate(() => starsFixture.state.balance), 200, "A Mini App callback cannot credit the wallet");
      assert.equal(await page.evaluate(() => starsFixture.invoiceOpens.length), 1);
      await page.evaluate(() => starsFixture.settle());
      await button("Проверить оплату").click();
    }
    await page.getByText("Зачислено 500 роллов.", { exact: true }).waitFor();
    assert.deepEqual(await posts(), retried ? [...original, ...original] : original);
    const back = button("К кошельку");
    await back.scrollIntoViewIfNeeded();
    assert.equal((await back.boundingBox()).height, 48);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if (height === 400 || width === 1440) await page.screenshot({ path: `/tmp/rollapp-stars-recovery-paid-${width}x${height}.png` });
    await back.click();
    await page.getByRole("region", { name: "Баланс роллов" }).getByText("700", { exact: true }).waitFor();
    assert.equal(await resume.count(), 0);
    assert.equal(await openTopup.count(), mode === "paused" ? 0 : 1);
    assert.deepEqual(issues, []);
    console.log(`PASS Stars ${width}x${height} ${mode}: terms, read-only recovery, explicit retry, provider confirmation, wallet and Back`);
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
