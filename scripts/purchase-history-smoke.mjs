import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium } from "playwright-core";
import { browserLaunchOptions } from "./browser-runtime.mjs";
import { listenSmokeServer, smokeOrigin, smokePort } from "./smoke-server.mjs";

const fixture = "/__purchase-history-smoke";
const server = await createServer({
  cacheDir: "node_modules/.vite-purchase-history-smoke",
  server: { host: "127.0.0.1", port: smokePort(), strictPort: true, hmr: false, watch: null },
  plugins: [{
    name: "purchase-history-fixture",
    enforce: "pre",
    transform(source, id) {
      if (id.endsWith("/src/App.jsx?purchase-history-smoke")) return `${source}\nexport { SessionContext, WishesProfileControls };`;
    },
    configureServer(vite) {
      vite.middlewares.use(async (req, res, next) => {
        if (req.url.split("?")[0] !== fixture) return next();
        res.setHeader("Content-Type", "text/html");
        res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data:; worker-src 'self'");
        res.end(await vite.transformIndexHtml(req.url, '<!doctype html><html class="dark" lang="ru"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/purchase-history.jsx"></script></body></html>'));
      });
    },
  }],
});
await listenSmokeServer(server);
const browser = await chromium.launch(browserLaunchOptions());
try {
  const generator = await browser.newPage();
  await generator.setContent("<p>09.11.2026 11:20 -350.00 RUB Book Store</p><p>09.11.2026 11:25 +1000.00 RUB Deposit</p>");
  const pdf = await generator.pdf();
  await generator.close();
  const csv = "Дата операции;Статус;Сумма операции;Валюта операции;Категория;Описание\n09.11.2026;OK;-1279,95;RUB;Книги;Книжный магазин\n08.11.2026;OK;-400;RUB;Переводы;Перевод";
  for (const [width, height] of [[320, 700], [390, 844], [768, 800], [820, 450], [1024, 800], [1440, 900], [1920, 1000]]) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: "reduce" });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", (route) => { errors.push("Unexpected API request from fixture"); return route.abort(); });
    await page.goto(smokeOrigin(server) + fixture);
    const open = page.getByRole("button", { name: "Импорт покупок" });
    const trigger = await open.evaluate((node) => {
      const css = getComputedStyle(node);
      return [css.paddingLeft, css.paddingRight, node.offsetHeight, css.borderRadius];
    });
    assert.deepEqual(trigger.slice(0, 3), ["24px", "24px", 48]);
    assert(Number.parseFloat(trigger[3]) >= 24);
    assert(await open.evaluate((node) => {
      const box = node.querySelector("span")?.getBoundingClientRect() ?? node.getBoundingClientRect();
      return box.left < innerWidth - 25 && box.right > 25;
    }), "Import action should be discoverable at the leading edge of the toolbar");
    await open.click();
    const heading = page.getByRole("heading", { name: "Импорт покупок" });
    await heading.waitFor();
    const file = page.locator("input[type=file]");
    const upload = page.getByRole("button", { name: "Выбрать файл" });
    const uploadBox = await upload.boundingBox();
    assert.equal(uploadBox.height, 48);
    if (width < 768) assert.equal(await page.locator("[data-native-form-actions]").count(), 1);
    else assert.equal(await page.locator("[data-slot=drawer-popup][data-swipe-direction=right]").count(), 1);

    await file.setInputFiles({ name: "broken.csv", mimeType: "text/csv", buffer: Buffer.from("invalid;file") });
    await page.getByRole("alert").filter({ hasText: "Не удалось найти колонки" }).waitFor();
    if (width === 390) {
      await file.setInputFiles(new URL("./fixtures/purchase-history.xlsx", import.meta.url).pathname);
    } else if (width === 1440) {
      await file.setInputFiles({ name: "operations.pdf", mimeType: "application/pdf", buffer: pdf });
    } else {
      await file.setInputFiles({ name: "operations.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    }
    await page.getByRole("heading", { name: "Покупки из выписки: 1" }).waitFor();
    const purchase = page.getByRole("checkbox", { name: width === 1440 ? /Book Store/ : /Книжный магазин/ });
    assert.equal(await purchase.isChecked(), false);
    const create = page.getByRole("button", { name: /Создать карточки/ });
    assert(await create.isDisabled());
    await purchase.check();
    assert(await create.isDisabled(), "The operation description is not a product name");
    await page.getByRole("textbox", { name: /Название товара/ }).fill("Роман в твёрдом переплёте");
    assert(await create.isEnabled());
    assert.equal((await create.boundingBox()).height, 48);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert(await page.locator(".app-drawer-body").evaluate((node) => node.scrollWidth <= node.clientWidth + 1));
    if ([390, 820, 1440].includes(width)) await page.screenshot({ path: `/tmp/rollapp-purchase-history-${width}.png` });

    await page.getByRole("button", { name: "Изменить источник" }).click();
    await page.getByRole("button", { name: "Заказы и чеки" }).click();
    await page.getByRole("textbox", { name: "Текст чека или заказа" }).fill("Чай зелёный — 249 ₽\nШоколад — 159 ₽\nИтого 408 ₽");
    await page.getByRole("button", { name: "Найти товары" }).click();
    await page.getByRole("heading", { name: "Найденные товары: 2" }).waitFor();
    await page.getByRole("checkbox", { name: /Шоколад/ }).uncheck();
    await page.getByRole("button", { name: "Создать карточки · 1" }).waitFor();
    if (width === 320) await page.goBack();
    else await page.getByRole("button", { name: width < 768 ? /^Назад/ : "Закрыть импорт" }).click();
    await heading.waitFor({ state: "hidden" });
    await open.waitFor();
    assert.deepEqual(errors, []);
    console.log(`PASS ${width}×${height}: file, invalid format, selected-only review, receipts, 48px controls, cancel without writes`);
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
