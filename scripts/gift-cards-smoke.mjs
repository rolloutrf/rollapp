import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium } from "playwright-core";
import { browserLaunchOptions } from "./browser-runtime.mjs";
import { listenSmokeServer, smokeOrigin } from "./smoke-server.mjs";

const server = await createServer({
  cacheDir: "node_modules/.vite-gift-cards", server: { host: "127.0.0.1", port: 0, hmr: false, watch: null },
  plugins: [{ name: "gift-cards-fixture", configureServer(vite) {
    vite.middlewares.use(async (req, res, next) => {
      if (!req.url.startsWith("/__gift-cards")) return next();
      res.setHeader("Content-Type", "text/html");
      res.end(await vite.transformIndexHtml(req.url, '<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/gift-cards.jsx"></script></body></html>'));
    });
  } }],
});
await listenSmokeServer(server);
const browser = await chromium.launch(browserLaunchOptions());
try {
  for (const [width, height] of [[320,844],[390,844],[768,900],[820,450],[1024,900],[1440,900],[1920,900],[390,400]]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: width < 768 ? 3 : 1 });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", (route) => { errors.push("Real API request forbidden"); return route.abort(); });
    await page.goto(`${smokeOrigin(server)}/__gift-cards`);
    const trigger = page.getByRole("button", { name: /^Выпустить подарочную карту/ });
    await trigger.waitFor();
    await page.evaluate(() => document.fonts.ready);
    const box = await trigger.boundingBox(); assert.equal(box.width, 48); assert.equal(box.height, 48);
    await trigger.click();
    await page.getByRole("button", { name: "Выпустить карту", exact: true }).click();
    await page.getByLabel("Сколько роллов добавить").fill("25");
    await page.getByRole("button", { name: "Пополнить на 25 роллов", exact: true }).click();
    await page.getByRole("button", { name: "Проверить результат", exact: true }).click();
    await page.getByLabel("Сколько роллов добавить").waitFor();
    await page.waitForFunction(() => giftHarness.calls.length === 3);
    assert.equal(await page.evaluate(() => giftHarness.balance), 75);
    assert.equal(await page.evaluate(() => giftHarness.cards[0].balance), 25);
    assert.deepEqual(await page.evaluate(() => giftHarness.calls[1]), await page.evaluate(() => giftHarness.calls[2]));
    await page.getByLabel("Кому подарить", { exact: true }).fill("friend");
    await page.getByRole("button", { name: "Получатель подарочной карты · @friend", exact: true }).click();
    const send = page.getByRole("button", { name: "Подарить карту", exact: true });
    await page.waitForFunction(() => [...document.querySelectorAll("button")].some((node) => node.textContent === "Подарить карту" && !node.disabled));
    await send.scrollIntoViewIfNeeded();
    const geometry = await send.evaluate((node) => {
      const style = getComputedStyle(node), box = node.getBoundingClientRect();
      return { height: box.height, bottom: box.bottom, radii: [style.borderTopLeftRadius,style.borderTopRightRadius,style.borderBottomLeftRadius,style.borderBottomRightRadius], opacity: style.opacity };
    });
    assert.equal(geometry.height, 48); assert(geometry.radii.every((radius) => parseFloat(radius) === 24));
    assert(geometry.bottom <= height + 1);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `/tmp/rollapp-gift-card-${width}-${height}.png`, fullPage: true });
    await send.click();
    await page.getByText("Карта отправлена: Получатель подарочной карты", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => giftHarness.cards.length), 0);
    if (width < 768) {
      await page.goBack();
      await trigger.waitFor();
      assert.equal(await page.evaluate(() => document.querySelectorAll("[data-form-page-host]").length), 0);
    } else await page.getByRole("button", { name: "Закрыть подарочную карту" }).click();
    assert.deepEqual(errors, []);
    console.log(`PASS gift cards ${width}x${height}: issue, topup, lost-response retry, send, 48px footer, cancel, overflow`);
    await page.close();
  }
  for (const width of [320,390,768,820,1024,1440,1920]) {
    const page = await browser.newPage({ viewport: { width, height: width === 820 ? 450 : 900 } });
    const errors = []; page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", (route) => { errors.push("Forbidden API"); return route.abort(); });
    await page.goto(`${smokeOrigin(server)}/__gift-cards?offers&public`);
    await page.getByRole("button", { name: /^Выпустить подарочную карту/ }).waitFor();
    const order = await page.evaluate(() => {
      const avatar = document.querySelector(".wishes-page__hero-avatar").getBoundingClientRect();
      const gift = document.querySelector('[aria-label^="Выпустить подарочную карту"]').getBoundingClientRect();
      const heading = document.getElementById("public-profile-name").getBoundingClientRect();
      return avatar.bottom <= gift.top && gift.bottom <= heading.top;
    }); assert(order, "Gift icon belongs directly below the real business avatar");
    const certificates = page.getByRole("region", { name: "Сертификаты" });
    const issue = certificates.getByRole("button", { name: "Выпустить и подарить" });
    await issue.waitFor();
    assert.equal((await issue.boundingBox()).height, 48);
    assert.equal(await issue.evaluate((element) => getComputedStyle(element).paddingInlineStart), "24px");
    const section = await certificates.boundingBox();
    const offers = await page.getByRole("region", { name: "Товары и предложения бизнеса" }).boundingBox();
    assert.equal(Math.round(offers.y - section.y - section.height), 24);
    await issue.click();
    const form = page.locator('[data-mobile-form-page]:visible, [data-slot="drawer-popup"]:visible');
    await form.getByRole("heading", { name: "Подарочная карта", exact: true }).waitFor();
    if (width < 768) {
      await page.getByRole("button", { name: "Назад", exact: true }).click();
      await page.waitForURL((url) => !url.searchParams.has("formScreen"));
    } else {
      await page.getByRole("button", { name: "Закрыть подарочную карту" }).click();
    }
    await form.waitFor({ state: "hidden" });
    assert.equal(await page.evaluate(() => giftHarness.calls.length), 0);
    assert.equal(await page.getByRole("link", { name: /^Открыть бизнес-профиль/ }).getAttribute("href"), "/studio");
    assert((await page.getByRole("link", { name: /^Открыть бизнес-профиль/ }).boundingBox()).height >= 48);
    await page.getByRole("button", { name: "Купить", exact: true }).click();
    await page.getByRole("combobox", { name: "Оплатить покупку" }).click();
    await page.getByRole("option", { name: "Карта · 25 роллов", exact: true }).click();
    assert.equal(await page.getByRole("option", { name: /100 роллов/ }).count(), 0);
    await page.getByRole("button", { name: "Подтвердить", exact: true }).click();
    await page.getByRole("button", { name: "Позже", exact: true }).click();
    await page.getByRole("alertdialog").waitFor({ state:"hidden" });
    await page.getByRole("button", { name: "Проверить оплату", exact: true }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Проверить оплату", exact: true }).click();
    await page.getByRole("alertdialog").waitFor({ state:"hidden" });
    assert.equal(await page.evaluate(() => giftHarness.cards[0].balance), 5);
    assert.equal(await page.evaluate(() => giftHarness.balance), 100);
    assert.deepEqual(await page.evaluate(() => giftHarness.calls[0]), await page.evaluate(() => giftHarness.calls[1]));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({path:`/tmp/rollapp-business-profile-${width}.png`,fullPage:true});
    assert.deepEqual(errors, []);
    console.log(`PASS business profile ${width}: real avatar/gift order, offers, own-business card payment, replay`);
    await page.close();
  }
  for (const [width, missing] of [[390, false], [1440, false], [390, true], [1440, true]]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", (route) => { errors.push("Forbidden API"); return route.abort(); });
    await page.goto(`${smokeOrigin(server)}/__gift-cards?cards${missing ? "&missing-card" : ""}`);
    const card = page.getByRole("article").filter({ hasText: "50 роллов · Только у этого бизнеса" });
    await card.getByRole("button", { name: "Открыть карту", exact: true }).click();
    if (missing) {
      await page.getByText("Выбранная карта больше недоступна. Можно выбрать другую карту или выпустить новую.", { exact: true }).waitFor();
      const other = page.getByRole("button", { name: "Мастерская подарков и хорошего настроения · 25 роллов", exact: true });
      assert.equal(await other.getAttribute("aria-pressed"), "false");
      assert.equal(await page.getByLabel("Сколько роллов добавить").count(), 0);
      assert.equal(await page.getByRole("button", { name: "Подарить карту", exact: true }).count(), 0);
    } else {
      const selected = page.getByRole("button", { name: "Мастерская подарков и хорошего настроения · 50 роллов", exact: true });
      await selected.waitFor();
      assert.equal(await selected.getAttribute("aria-pressed"), "true");
    }
    assert.equal(await page.evaluate(() => giftHarness.calls.length), 0);
    assert.deepEqual(errors, []);
    console.log(`PASS profile gift selection ${width} missing=${missing}: exact source card, no automatic substitution or writes`);
    await page.close();
  }
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", (route) => { errors.push("Forbidden API"); return route.abort(); });
    await page.goto(`${smokeOrigin(server)}/__gift-cards?brand-certificates`);
    const certificates = page.getByRole("region", { name: "Сертификаты" });
    await certificates.getByRole("button", { name: "Открыть информацию о «Подарочный сертификат»" }).waitFor();
    await page.getByRole("region", { name: "Товары" }).getByRole("button", { name: "Открыть информацию о «Товар бренда»" }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Открыть информацию о «Подарочный сертификат»" }).count(), 1);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`PASS brand catalog ${width}: certificates separate from products`);
  }
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.route("**/api/**", (route) => route.abort());
  await page.goto(`${smokeOrigin(server)}/__gift-cards?public&owner`);
  const ownerCertificates = page.getByRole("region", { name: "Сертификаты" });
  await ownerCertificates.getByRole("button", { name: "Выпустить и подарить" }).click();
  await page.getByRole("button", { name: "Выпустить карту", exact: true }).click();
  await page.getByLabel("Сколько роллов добавить").waitFor();
  assert.equal(await page.evaluate(() => giftHarness.calls[0].payload.businessId), "business");
  await page.goto(`${smokeOrigin(server)}/__gift-cards?public&guest`);
  const signIn = page.getByRole("region", { name: "Сертификаты" }).getByRole("link", { name: "Войти и подарить" });
  assert.equal(await signIn.getAttribute("href"), "/login?next=%2Fstudio");
  await page.goto(`${smokeOrigin(server)}/__gift-cards?guest`);
  assert((await page.getByRole("link", { name: "Войти и выпустить подарочную карту" }).getAttribute("href")).startsWith("/login?next="));
  await page.goto(`${smokeOrigin(server)}/__gift-cards?error`);
  await page.getByRole("button", { name: /^Выпустить подарочную карту/ }).click();
  await page.getByRole("button", { name: "Повторить загрузку" }).waitFor();
  assert(await page.getByRole("button", { name: "Выпустить карту", exact: true }).isDisabled());
  await page.close();
} finally { await browser.close(); await server.close(); }
