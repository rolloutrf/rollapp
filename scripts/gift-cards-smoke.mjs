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
    const check = page.getByRole("button", { name: "Проверить результат", exact: true });
    const posted = () => page.evaluate(() => window.giftHarness.calls);
    const issueLost = width === 320 || height < 500;
    if (issueLost) await page.evaluate(() => { window.giftHarness.nextGiftLoss = "posted"; });
    await page.getByRole("button", { name: "Выпустить карту", exact: true }).click();
    if (issueLost) {
      await page.getByText("Ожидает проверки · Выпуск карты").waitFor();
      const issueCalls = await posted();
      await check.click();
      await page.getByLabel("Сколько роллов добавить").waitFor();
      assert.deepEqual(await posted(), issueCalls);
      assert.deepEqual(await page.evaluate(() => window.giftHarness.giftChecks), [{ kind: "issue", key: issueCalls[0].payload.idempotencyKey }]);
    }
    await page.getByLabel("Сколько роллов добавить").fill("25");
    const retryTopup = height < 500 || width === 1440;
    await page.evaluate(mode => { window.giftHarness.nextGiftLoss = mode; }, retryTopup ? "missing" : "posted");
    await page.getByRole("button", { name: "Пополнить на 25 роллов", exact: true }).click();
    await page.getByText("Ожидает проверки · Пополнение карты · 25 роллов").waitFor();
    const beforeCheck = await posted();
    await check.click();
    if (retryTopup) {
      await page.getByText("Операция пока не записана.", { exact: true }).waitFor();
      assert.deepEqual(await posted(), beforeCheck, "Read-only check must not start an unrecorded top-up");
      assert.equal(await page.evaluate(() => giftHarness.balance), 100);
      const retry = page.getByRole("button", { name: "Повторить операцию" });
      await retry.scrollIntoViewIfNeeded();
      assert.equal((await retry.boundingBox()).height, 48);
      const footer = await check.boundingBox();
      assert.equal(footer.height, 48);
      assert(footer.y + footer.height <= height + 1);
      await page.screenshot({ path: `/tmp/rollapp-gift-operation-recovery-${width}x${height}.png` });
      await retry.click();
    }
    await page.getByText("Карта пополнена на 25 роллов", { exact: true }).waitFor();
    assert.deepEqual(await posted(), retryTopup ? [...beforeCheck, beforeCheck.at(-1)] : beforeCheck);
    assert.deepEqual(await page.evaluate(() => giftHarness.giftChecks.at(-1)), {
      kind: "topup", key: beforeCheck.at(-1).payload.idempotencyKey,
    });
    assert.equal(await page.evaluate(() => giftHarness.balance), 75);
    assert.equal(await page.evaluate(() => giftHarness.cards[0].balance), 25);
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
    if (width === 1440) {
      await page.evaluate(() => { window.giftHarness.cards[0].balance = 30; });
      await send.click();
      await page.getByText(/Остаток карты изменился/).waitFor();
      await page.getByText(/Подарок: 30 роллов/).waitFor();
      assert.equal(await page.evaluate(() => giftHarness.cards.length), 1);
    }
    await page.evaluate(() => { window.giftHarness.nextGiftLoss = "posted"; });
    await send.click();
    await page.getByText(/Ожидает проверки · Отправка карты/).waitFor();
    const sent = await posted();
    assert.equal(sent.at(-1).payload.expectedBalance, width === 1440 ? 30 : 25);
    assert.equal(await page.evaluate(() => giftHarness.cards.length), 0);
    const closeStoreCard = async () => {
      if (width < 768) await page.goBack();
      else await page.getByRole("button", { name: "Закрыть подарочную карту" }).click();
      await trigger.waitFor();
    };
    const closeProfileOperation = async () => {
      if (width < 768) await page.goBack();
      else await page.getByRole("button", { name: "Назад", exact: true }).click();
      await page.getByRole("heading", { name: "Операция с подарочной картой" }).waitFor({ state: "hidden" });
    };
    const recoverFromProfile = width !== 820;
    if (recoverFromProfile) {
      await closeStoreCard();
      await page.evaluate(() => {
        const { calls, giftChecks, requests, balance, cards } = window.giftHarness;
        sessionStorage.setItem("gift-fixture-reload", JSON.stringify({ calls, giftChecks, requests: [...requests], balance, cards }));
        const intent = JSON.parse(sessionStorage.getItem("rollapp:gift-intent:owner:business"));
        sessionStorage.setItem("rollapp:gift-intent:someone:business", JSON.stringify({ ...intent, ownerId: "someone", businessName: "Чужая операция" }));
        sessionStorage.setItem("rollapp:gift-intent:owner:foreign:business", JSON.stringify({ ...intent, ownerId: "owner:foreign", businessName: "Соседний аккаунт" }));
      });
      await page.reload();
      const group = page.getByRole("group", { name: "Операции с картами, ожидающие проверки" });
      const profileOperation = group.getByRole("button", { name: /Проверить операцию · Мастерская.*Отправка карты/ });
      await profileOperation.waitFor();
      assert.equal(await group.getByRole("button").count(), 1);
      assert(await profileOperation.evaluate((node) => node.getBoundingClientRect().height === 48));
      assert.deepEqual(await posted(), sent);
      assert.equal(await page.getByRole("button", { name: "Открыть карту", exact: true }).count(), 0);
      const beforeOpen = await page.evaluate(() => ({ reads: [...giftHarness.reads], checks: [...giftHarness.giftChecks] }));
      await profileOperation.click();
      await check.waitFor();
      assert.deepEqual(await page.evaluate(() => giftHarness.giftChecks), beforeOpen.checks);
      assert.equal(await page.evaluate(() => giftHarness.reads.filter((path) => path === "/rolls").length),
        beforeOpen.reads.filter((path) => path === "/rolls").length);
      if (height < 500 || width === 1440) {
        await closeProfileOperation();
        await page.waitForFunction(() => document.activeElement?.textContent === "Проверить операцию");
        await profileOperation.click();
        await check.waitFor();
        await page.screenshot({ path: `/tmp/rollapp-profile-gift-recovery-${width}x${height}.png` });
      }
      assert.equal(await page.getByRole("button", { name: /^Выпустить карту$/ }).count(), 0);
    } else {
      await closeStoreCard();
      await trigger.click();
      await page.getByText(/Ожидает проверки · Отправка карты/).waitFor();
    }
    await check.click();
    await page.getByText("Карта отправлена: Получатель подарочной карты", { exact: true }).waitFor();
    assert.deepEqual(await posted(), sent);
    assert.deepEqual(await page.evaluate(() => giftHarness.giftChecks.at(-1)), {
      kind: "send", key: sent.at(-1).payload.idempotencyKey,
    });
    if (recoverFromProfile) {
      await closeProfileOperation();
      await page.getByRole("group", { name: "Операции с картами, ожидающие проверки" }).waitFor({ state: "hidden" });
      await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Подарочные карты");
      assert(await page.evaluate(() => sessionStorage.getItem("rollapp:gift-intent:someone:business") !== null));
    } else await closeStoreCard();
    if (width < 768) assert.equal(await page.evaluate(() => document.querySelectorAll("[data-form-page-host]").length), 0);
    assert.deepEqual(errors, []);
    console.log(`PASS gift cards ${width}x${height}: issue, topup, read-only recovery, confirmed send, profile recovery, 48px footer, cancel, overflow`);
    await page.close();
  }
  for (const width of [320,390,768,820,1024,1440,1920]) {
    const page = await browser.newPage({ viewport: { width, height: width === 820 ? 450 : 900 } });
    const errors = []; page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", (route) => { errors.push("Forbidden API"); return route.abort(); });
    await page.goto(`${smokeOrigin(server)}/__gift-cards?offers&public`);
    await page.getByRole("button", { name: /^Выпустить подарочную карту/ }).waitFor();
    const actions = page.locator(".public-collection-page__hero .horizontal-action-scroller");
    await page.evaluate(() => document.fonts.ready);
    assert.deepEqual(await actions.locator("[data-page-action]").allTextContents(), ["Подписаться", "Визитка"]);
    const publicationLinks = actions.locator(":scope > a[data-control-icon]");
    assert.deepEqual(await publicationLinks.evaluateAll(links => links.map(link => link.getAttribute("aria-label"))), ["Календарь", "Доска объявлений"]);
    const rail = await actions.evaluate((element) => {
      const { left, right } = element.getBoundingClientRect();
      const buttons = [...element.querySelectorAll(":scope > :is([data-page-action], [data-control-icon])")];
      const controls = buttons.map((button) => {
        const { left, top, height } = button.getBoundingClientRect();
        return { left, top, height };
      });
      const gutter = parseFloat(getComputedStyle(element).paddingInlineEnd);
      const overflow = element.scrollWidth > element.clientWidth;
      element.scrollLeft = element.scrollWidth;
      const lastRight = buttons.at(-1).getBoundingClientRect().right;
      element.scrollLeft = 0;
      return { left, right, controls, gutter, overflow, lastRight };
    });
    assert.equal(rail.controls.length, 4);
    assert(rail.controls.every(({ top, height }) => top === rail.controls[0].top && height === 48), `${width}: all four actions share one 48px row`);
    if (width <= 390) assert(rail.overflow, `${width}: the profile actions must scroll`);
    if (rail.overflow) {
      assert(Math.abs(rail.controls[0].left - rail.left - rail.gutter) < 1);
      assert(Math.abs(rail.right - rail.lastRight - rail.gutter) < 1, `${width}: announcements must be reachable`);
    } else {
      assert(Math.abs(rail.controls[0].left + rail.lastRight - rail.left - rail.right) < 1, `${width}: fitting row must be centered`);
    }
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
    assert(await page.evaluate(() => giftHarness.calls.length === 1 &&
      giftHarness.checkoutChecks.length === 1 && giftHarness.checkoutChecks[0] === giftHarness.calls[0].payload.idempotencyKey));
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
    const open = (balance) => page.getByRole("region", { name: "Подарочные карты" })
      .getByRole("button", { name: new RegExp(`^Открыть сертификат: .+, ${balance} роллов,`) });
    await open(50).click();
    if (missing) {
      await page.getByText("Этот сертификат больше недоступен. Вернитесь к списку карт.", { exact: true }).waitFor();
      assert.equal(await page.getByRole("article", { name: /^Сертификат:/ }).count(), 0);
      assert.equal(await page.getByLabel("Сколько роллов добавить").count(), 0);
      assert.equal(await page.getByRole("button", { name: "Подарить карту", exact: true }).count(), 0);
      assert.equal(await page.getByRole("button", { name: "Выпустить карту", exact: true }).count(), 0);
      await page.getByRole("button", { name: "Назад", exact: true }).click();
      await open(25).click();
      await page.getByRole("article", { name: /^Сертификат:/ }).getByText("25 роллов", { exact: true }).waitFor();
    } else {
      await page.getByRole("article", { name: /^Сертификат:/ }).getByText("50 роллов", { exact: true }).waitFor();
    }
    assert.equal(await page.evaluate(() => giftHarness.calls.length), 0);
    assert.deepEqual(errors, []);
    console.log(`PASS profile gift selection ${width} missing=${missing}: exact source card, no automatic substitution or writes`);
    await page.close();
  }
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 400 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", (route) => { errors.push("Forbidden API"); return route.abort(); });
    await page.goto(`${smokeOrigin(server)}/__gift-cards?cards&wallet-error`);
    const list = page.getByRole("region", { name: "Подарочные карты" });
    const open = (balance) => list.getByRole("button", { name: new RegExp(`^Открыть сертификат: .+, ${balance} роллов,`) });
    const active = (balance) => page.getByRole("article", { name: /^Сертификат:/ }).getByText(`${balance} роллов`, { exact: true });
    const topup = page.getByRole("button", { name: "Пополнить", exact: true });
    const gift = page.getByRole("button", { name: "Подарить", exact: true });
    const submitGift = page.getByRole("button", { name: "Подарить карту", exact: true });
    const amount = page.getByLabel("Сколько роллов добавить");
    const recipient = page.getByLabel("Кому подарить", { exact: true });
    const zero = open(0);
    await zero.focus();
    await page.evaluate(() => { giftHarness.holdCardDetails = true; });
    await zero.press("Enter");
    await page.getByRole("status").filter({ hasText: "Загружаем карты…" }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Выпустить карту", exact: true }).count(), 0);
    await page.waitForFunction(() => Boolean(giftHarness.finishCardDetails));
    await page.evaluate(() => giftHarness.finishCardDetails());
    await active(0).waitFor({ timeout: 5000 });
    assert(await gift.isDisabled());
    assert.equal(await amount.isVisible(), false);
    await topup.click();
    await page.getByText("Кошелёк временно недоступен", { exact: true }).waitFor();
    assert.equal(await page.getByText(/Этот сертификат больше недоступен/).count(), 0);
    assert(await amount.isDisabled());
    await page.screenshot({ path: `/tmp/rollapp-gift-opening-wallet-error-${width}.png` });
    const readsBefore = await page.evaluate(() => giftHarness.reads.length);
    await page.evaluate(() => { giftHarness.walletUnavailable = false; });
    await page.getByRole("button", { name: "Повторить загрузку кошелька", exact: true }).click();
    await amount.fill("12");
    assert.deepEqual(await page.evaluate((from) => giftHarness.reads.slice(from), readsBefore), ["/rolls"]);
    if (width < 768) await page.goBack();
    else await page.getByRole("button", { name: "Назад", exact: true }).click();
    await zero.waitFor();
    await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label")?.includes(", 0 роллов,"));
    await open(25).click();
    await active(25).waitFor();
    await topup.click();
    assert.equal(await amount.inputValue(), "");
    await gift.click();
    assert.equal(await amount.isVisible(), false);
    await recipient.fill("friend");
    await page.getByRole("button", { name: "Получатель подарочной карты · @friend", exact: true }).click();
    assert(await submitGift.isEnabled());
    await topup.click();
    assert.equal(await recipient.isVisible(), false);
    assert.equal(await submitGift.count(), 0);
    await gift.click();
    assert.equal(await recipient.inputValue(), "@friend");
    assert(await submitGift.isEnabled());
    const submitBox = await submitGift.boundingBox();
    assert.equal(submitBox.height, 48);
    if (width < 768) {
      const backBox = await page.getByRole("button", { name: "Назад", exact: true }).boundingBox();
      assert.deepEqual([backBox.width, backBox.height, backBox.y], [48, 48, submitBox.y]);
      assert.equal(submitBox.x - backBox.x - backBox.width, 8);
      assert(submitBox.y + submitBox.height <= 400);
    }
    assert.deepEqual(await page.evaluate(() => giftHarness.calls), []);
    if (width === 1440) {
      await page.getByRole("button", { name: "Назад", exact: true }).click();
      await zero.click();
      await active(0).waitFor();
      await topup.click();
      await amount.fill("10");
      await page.evaluate(() => { giftHarness.lost = true; });
      await page.getByRole("button", { name: "Пополнить на 10 роллов", exact: true }).click();
      await active(10).waitFor();
      await page.getByText("Карта пополнена на 10 роллов", { exact: true }).waitFor();
      assert(await amount.isVisible());
      await gift.click();
      await recipient.fill("friend");
      await page.getByRole("button", { name: "Получатель подарочной карты · @friend", exact: true }).click();
      await submitGift.click();
      await page.getByText("Карта отправлена: Получатель подарочной карты", { exact: true }).waitFor();
      const calls = await page.evaluate(() => giftHarness.calls);
      assert.deepEqual(calls.map(({ path }) => path),
        ["/rolls/gift-cards/second-card/topup", "/rolls/gift-cards/second-card/send"]);
      assert.equal(calls[1].payload.expectedBalance, 10);
      await page.getByRole("button", { name: "Назад", exact: true }).click();
      await open(25).waitFor();
      assert.equal(await open(10).count(), 0);
      assert.equal(await zero.count(), 0);
    }
    assert.deepEqual(errors, []);
    console.log(`PASS gift card reopening ${width}x400: exact zero/positive card, independent wallet retry, draft ownership, Back focus`);
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
