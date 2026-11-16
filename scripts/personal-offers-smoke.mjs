import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createServer } from "vite";
import { chromium } from "playwright-core";
import { browserLaunchOptions } from "./browser-runtime.mjs";
import { listenSmokeServer, smokeOrigin, smokePort } from "./smoke-server.mjs";
const output = "/tmp/rollapp-personal-offers-ui";
await fs.mkdir(output, { recursive: true });
const server = await createServer({ cacheDir: "node_modules/.vite-personal-offers-smoke", server: { host: "127.0.0.1", port: smokePort(), strictPort: true, hmr: false, watch: null }, plugins: [{ name: "personal-offers-fixture", enforce: "pre", transform(source, id) { if (id.includes("/src/App.jsx?personal-offers-test-export")) return `${source}\nexport { BusinessAccessPage } from \"./modules/access/sphere-access.jsx\";\nexport { SessionContext } from \"./modules/auth/session.jsx\";\nexport { ToastContext } from \"./modules/shell/toast.jsx\";`; }, configureServer(vite) { vite.middlewares.use(async (req, res, next) => { if (!req.url.startsWith("/__offers-smoke")) return next(); res.setHeader("Content-Type", "text/html"); res.end(await vite.transformIndexHtml(req.url, '<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/personal-offers.jsx"></script></body></html>')); }); } }] });
await listenSmokeServer(server);
const browser = await chromium.launch(browserLaunchOptions());
async function checkSphereCatalog(page, sphere, section) {
  await page.goto(`${smokeOrigin(server)}/__offers-smoke?case=sphere-catalog&sphere=${sphere}`);
  const catalog = page.getByRole("link", { name: "Открыть каталог брендов" });
  await catalog.waitFor();
  assert.deepEqual(await catalog.evaluate(link => [link.offsetWidth, link.offsetHeight]), [48, 48]);
  if (sphere === "career" && section === "contacts") {
    const rail = page.getByRole("navigation", { name: "Бизнес-разделы", exact: true });
    const store = rail.getByRole("link", { name: "Открыть магазин за роллы", exact: true });
    assert.equal(await catalog.count(), 1);
    assert.deepEqual(await rail.getByRole("link").evaluateAll(links => links.map(link => link.getAttribute("aria-label"))), [
      "Открыть каталог брендов", "Открыть магазин за роллы",
    ]);
    assert.equal(await catalog.getAttribute("href"), "/app/spheres/career/business/catalog?tab=contacts");
    assert.equal(await store.getAttribute("href"), "/app/spheres/career/business/store");
    const [catalogBox, storeBox] = await Promise.all([catalog.boundingBox(), store.boundingBox()]);
    assert.deepEqual([storeBox.width, storeBox.height], [48, 48]);
    assert.equal(catalogBox.y, storeBox.y);
    assert.equal(storeBox.x - (catalogBox.x + catalogBox.width), 8);
    assert.equal((catalogBox.x + storeBox.x + storeBox.width) / 2, (await page.viewportSize()).width / 2);
    const { width, height } = page.viewportSize();
    if ((width === 390 && height === 844) || width === 1440) {
      await page.getByRole("group", { name: "Действия с контактами", exact: true }).screenshot({
        path: `${output}/contacts-catalog-store-${width}.png`,
        animations: "disabled",
      });
    }
    await store.click();
    await page.waitForURL(url => url.pathname === "/app/spheres/career/business/store");
    await page.getByText("В магазине пока пусто").waitFor();
    await page.goBack();
    await page.waitForURL(url => url.pathname === "/app/spheres/career" && url.searchParams.get("tab") === section);
    await catalog.waitFor();
  }
  await catalog.click();
  await page.waitForURL(url => url.pathname.endsWith("/business/catalog") && url.searchParams.get("tab") === section);
  const subscribe = page.getByRole("button", { name: "Подписаться · Партнёр сферы" });
  const unsubscribe = page.getByRole("button", { name: "Отписаться · Партнёр сферы" });
  await subscribe.click();
  await page.getByText("Повторите подписку").waitFor();
  await subscribe.click();
  await unsubscribe.waitFor();
  await page.getByRole("link", { name: "Предложения", exact: true }).click();
  await page.getByRole("heading", { name: "Предложение партнёра" }).waitFor();
  await page.getByRole("link", { name: "Каталог брендов", exact: true }).click();
  await unsubscribe.click();
  await subscribe.waitFor();
  assert.deepEqual(await page.evaluate(() => window.offerCalls), [true, true, false].map(following => ({ path: "/profile/brand/follow", body: { following } })));
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.getByRole("link", { name: /^К сфере/ }).click();
  await page.waitForURL(url => url.pathname.endsWith(`/${sphere}`) && url.searchParams.get("tab") === section);
}
const viewports = [[320,844],[390,844],[768,844],[820,844],[1024,844],[1440,900],[1920,1080],[390,400]];
async function checkRecordedOperations() {
  for (const [width, height] of viewports) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", (route) => { errors.push("Unexpected API request"); return route.abort(); });
    const orderType = width === 768 || width === 1440 ? "seller-recorded" : width === 1024 || height === 400 ? "wishlist-recorded" : width === 1920 ? "payment-archived" : "payment-recorded";
    const refunding = orderType === "seller-recorded";
    const wishlist = orderType === "wishlist-recorded";
    const operationUrl = `${smokeOrigin(server)}/__offers-smoke?case=${orderType}`;
    const action = refunding ? "refund" : "pay";
    const offerId = refunding ? "paid" : wishlist ? "wishlist-invoice" : "active";
    const posted = [{ path: `/personal-offers/${offerId}/${action}`, body: { expectedPriceRolls: wishlist ? 75 : 50 } }];
    const popup = page.getByRole("alertdialog");
    const openWishlist = () => page.getByRole("button", { name: 'Открыть «Wishlist товар»' }).click();
    await page.goto(operationUrl);
    if (wishlist) await openWishlist();
    await page.getByRole("button", { name: refunding ? "Вернуть роллы" : "Оплатить", exact: true }).click();
    await popup.getByRole("button", { name: refunding ? "Подтвердить возврат" : "Подтвердить оплату" }).click();
    await popup.getByText(/Ответ потерян/).waitFor();
    assert.deepEqual(await page.evaluate(() => window.offerCalls), posted);
    if (height < 500 || width === 1440) await page.screenshot({ path: `${output}/operation-recovery-${width}-${height}.png`, animations: "disabled" });
    await popup.getByRole("button", { name: "Позже", exact: true }).click();
    await popup.waitFor({ state: "hidden" });
    await page.goto(operationUrl);
    if (wishlist) await openWishlist();
    const resume = page.getByRole("button", { name: "Открыть проверку", exact: true });
    await resume.click();
    const check = popup.getByRole("button", { name: "Проверить результат", exact: true });
    await page.waitForFunction(() => [...document.querySelectorAll('[role="alertdialog"] button')].some(button =>
      button.textContent === "Проверить результат" && button.getBoundingClientRect().height === 48));
    assert.equal((await check.boundingBox()).height, 48);
    assert.deepEqual(await page.evaluate(() => window.offerCalls), posted);
    assert.deepEqual(await page.evaluate(() => window.offerChecks), []);
    await check.click();
    await popup.waitFor({ state: "hidden" });
    if (wishlist) {
      await page.waitForURL(url => !url.searchParams.has("formScreen"));
      await openWishlist();
    }
    const result = wishlist ? page : page.getByRole("article").filter({ has: page.getByRole("heading", {
      name: refunding ? "Оплаченный оффер" : "Активный оффер", exact: true,
    }) });
    if (orderType === "payment-archived") {
      await page.getByRole("status").filter({ hasText: "Счёт «Активный оффер» оплачен." }).waitFor();
      assert.equal(await result.count(), 0);
    } else await result.getByRole("status").filter({ hasText: refunding ? "Роллы возвращены" : /^Оплачен$/ }).first().waitFor();
    assert.equal(await resume.count(), 0);
    assert.deepEqual(await page.evaluate(() => window.offerCalls), posted);
    assert.deepEqual(await page.evaluate(() => window.offerChecks), [`/personal-offers/${offerId}/${action}/status`]);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`PASS invoice recovery ${width}×${height} ${orderType}: exact GET after reload without another POST`);
  }
}
try {
  await checkRecordedOperations();
  for (const [width, height] of (process.argv.includes("--recovery-only") ? [] : viewports)) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.route("**/api/**", route => { errors.push("Unexpected API request"); return route.abort(); });
    for (const [sphere, section] of [["health", "sport"], ["education", "courses"], ["career", "contacts"], ["identity", "identity-reports"]]) {
      await checkSphereCatalog(page, sphere, section);
    }
    console.log(`PASS ${width}x${height}: sphere catalogs, subscriptions, offers and return to section`);
    await page.goto(`${smokeOrigin(server)}/__offers-smoke`);
    await page.getByRole("heading", { name: "Активный оффер" }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.getByRole("button", { name: "Оплатить", exact: true }).count(), 1);
    await page.getByRole("button", { name: "Рекомендовать с оффером" }).click();
    await page.getByRole("button", { name: "Получатель · @buyer" }).click();
    await page.getByLabel("Цена в роллах").fill("75");
    assert.equal(await page.getByLabel("Срок с момента создания").locator('[data-slot="select-value"]').textContent(), "24 часа");
    await page.screenshot({ path: `${output}/form-${width}-${height}.png`, fullPage: true });
    assert(await page.evaluate(() => [...document.querySelectorAll('[data-control-bar] button')].every(button => {
      const rect = button.getBoundingClientRect(), style = getComputedStyle(button);
      return rect.height >= 48 && [style.borderTopLeftRadius,style.borderTopRightRadius,style.borderBottomLeftRadius,style.borderBottomRightRadius].every(radius => parseFloat(radius) >= 24);
    })), "Composer control geometry");
    await page.getByRole("button", { name: "Создать счёт" }).click();
    await page.getByText("Повторите создание").waitFor();
    await page.getByRole("button", { name: "Создать счёт" }).click();
    await page.getByRole("status").filter({ hasText: "Персональный счёт создан" }).waitFor();
    const calls = await page.evaluate(() => window.offerCalls);
    assert.equal(calls.length, 2); assert.deepEqual(calls[0], calls[1]); assert.equal(calls[0].body.priceRolls, 75);
    await page.getByRole("button", { name: "Оплатить", exact: true }).click();
    await page.getByRole("button", { name: "Отмена", exact: true }).click();
    assert.equal((await page.evaluate(() => window.offerCalls)).length, 2);
    await page.getByRole("button", { name: "Оплатить", exact: true }).click();
    await page.getByRole("button", { name: "Подтвердить оплату" }).click();
    await page.getByText("Недостаточно роллов").waitFor();
    const popup = await page.getByRole("alertdialog").boundingBox();
    assert(popup.y >= 0 && popup.y + popup.height <= height + 1, "Payment confirmation stays in the viewport");
    await page.screenshot({ path: `${output}/payment-${width}-${height}.png` });
    await page.getByRole("button", { name: "Подтвердить оплату" }).click();
    await page.getByRole("alertdialog").waitFor({ state: "hidden" });
    assert.equal(await page.getByRole("button", { name: "Оплатить", exact: true }).count(), 0);
    await page.screenshot({ path: `${output}/${width}-${height}.png`, fullPage: true });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Root overflow");
    for (const scenario of ["empty", "error", "loading", "unavailable", "payment-conflict", "seller"]) {
      await page.goto(`${smokeOrigin(server)}/__offers-smoke?case=${scenario}`);
      if (scenario === "empty") await page.getByText("Здесь появятся персональные счета от бизнеса.").waitFor();
      if (scenario === "error") { await page.getByText("Не удалось загрузить счета").waitFor(); await page.getByRole("button", { name: "Повторить" }).click(); }
      if (scenario === "loading") await page.getByText("Загружаем счета…").waitFor();
      if (scenario === "unavailable") {
        await page.getByRole("status").filter({ hasText: "Оплата сейчас недоступна" }).waitFor();
        assert.equal(await page.getByRole("button", { name: "Оплатить", exact: true }).count(), 0);
        assert.deepEqual(await page.evaluate(() => window.offerCalls), []);
        if (width === 390 || width === 1440) await page.screenshot({ path: `${output}/unavailable-${width}-${height}.png`, fullPage: true });
      }
      if (scenario === "payment-conflict") {
        await page.getByRole("button", { name: "Оплатить", exact: true }).click();
        const confirmation = page.getByRole("alertdialog");
        await confirmation.getByRole("button", { name: "Подтвердить оплату" }).click();
        await confirmation.getByRole("status").filter({ hasText: "Реквизиты операции расходятся" }).waitFor();
        assert.equal(await confirmation.getByText("Операция ожидает проверки.").count(), 0);
        assert.equal(await confirmation.getByRole("button", { name: "Повторить оплату" }).count(), 0);
        const bounds = await confirmation.boundingBox();
        assert(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width + 1 && bounds.y + bounds.height <= height + 1);
        if (width === 390 || width === 1440) await page.screenshot({ path: `${output}/conflict-${width}-${height}.png` });
        await confirmation.getByRole("button", { name: "Закрыть запрос" }).click();
        await confirmation.waitFor({ state: "hidden" });
        assert.deepEqual(await page.evaluate(() => window.offerCalls), [{ path: "/personal-offers/active/pay", body: { expectedPriceRolls: 50 } }]);
        assert.equal(await page.getByRole("button", { name: "Открыть проверку" }).count(), 0);
      }
      if (scenario === "seller") {
        await page.getByText("Ожидает оплаты").waitFor();
        assert.equal(await page.getByRole("button", { name: "Оплатить", exact: true }).count(), 0);
        const refund = page.getByRole("button", { name: "Вернуть роллы", exact: true });
        await refund.click();
        await page.getByRole("button", { name: "Отмена" }).click();
        assert.equal((await page.evaluate(() => window.offerCalls)).length, 0);
        await refund.click();
        const confirmation = page.getByRole("alertdialog");
        const confirm = confirmation.getByRole("button", { name: "Подтвердить возврат" });
        await confirm.click();
        await confirmation.getByText(/Ответ потерян/).waitFor();
        const check = confirmation.getByRole("button", { name: "Проверить результат" });
        await check.click();
        await confirmation.getByText("Операция пока не записана.", { exact: true }).waitFor();
        assert.deepEqual(await page.evaluate(() => window.offerCalls), [{ path: "/personal-offers/paid/refund", body: { expectedPriceRolls: 50 } }]);
        const popup = await confirmation.boundingBox();
        assert(popup.x >= 0 && popup.y >= 0 && popup.x + popup.width <= width + 1 && popup.y + popup.height <= height + 1);
        if ([390, 1440].includes(width) && height > 400) await page.screenshot({ path: `${output}/refund-${width}.png` });
        await confirmation.getByRole("button", { name: "Повторить возврат", exact: true }).click();
        await confirmation.waitFor({ state: "hidden" });
        await page.getByRole("status").filter({ hasText: "Роллы возвращены" }).waitFor();
        assert.equal(await refund.count(), 0);
        assert.deepEqual(await page.evaluate(() => window.offerCalls), Array.from({length: 2}, () => ({ path: "/personal-offers/paid/refund", body: { expectedPriceRolls: 50 } })));
      }
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${scenario} overflow`);
    }
    await page.goto(`${smokeOrigin(server)}/__offers-smoke?case=wallet-page`);
    await page.getByText("В резерве для наград", { exact: true }).waitFor();
    const orderTasks = page.getByRole("region", { name: "Действия по заказам" });
    for (const [name, kind] of [["Проверить покупки · 2", "review"], ["Открытые споры · 1", "dispute"],
      ["Исполнить заказы · 1", "fulfill"], ["Роллы к получению · 1", "claim"]]) {
      const link = orderTasks.getByRole("link", { name, exact: true });
      await link.waitFor();
      assert.equal(await link.getAttribute("href"), `/app/orders?attention=${kind}`);
      assert.deepEqual(await link.evaluate((element) => [
        element.offsetHeight, getComputedStyle(element).paddingInlineStart, getComputedStyle(element).paddingInlineEnd,
      ]), [48, "24px", "24px"]);
    }
    await orderTasks.getByText("70 роллов", { exact: true }).waitFor();
    assert.equal(await orderTasks.locator("time").getAttribute("datetime"), "2026-11-19T10:00:00Z");
    await page.locator('[data-rolls-transaction="purchase"]').getByText("Покупка · Товар магазина").waitFor();
    await page.locator('[data-rolls-transaction="refund"]').getByText("Возврат · Товар магазина").waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Wallet breakdown overflow");
    if ([390, 1440].includes(width) && height > 400) await page.screenshot({ path: `${output}/accounting-${width}.png`, fullPage: true });
    await page.goto(`${smokeOrigin(server)}/__offers-smoke?case=business`);
    await page.getByText("У вашего бизнеса пока нет активных товаров или услуг.").waitFor();
    assert.deepEqual(await page.getByRole("button", { name: "Добавить товар" }).evaluate(button => [button.offsetWidth, button.offsetHeight]), [48, 48]);
    await page.getByRole("button", { name: "Добавить товар" }).click();
    await page.getByLabel("Название", { exact: true }).fill("Моя услуга");
    await page.getByLabel("Цена магазина в роллах").fill("70");
    await page.getByLabel("Описание", { exact: true }).fill("Описание предложения бизнеса");
    assert.equal(await page.getByLabel("Тип", { exact: true }).locator('[data-slot="select-value"]').textContent(), "Товар");
    assert.equal(await page.getByLabel("Сфера", { exact: true }).locator('[data-slot="select-value"]').textContent(), "Образование");
    await page.screenshot({ path: `${output}/item-${width}-${height}.png`, fullPage: true });
    await page.getByRole("button", { name: "Сохранить товар" }).click();
    await page.getByText("Повторите сохранение").waitFor();
    await page.getByRole("button", { name: "Сохранить товар" }).click();
    await page.getByRole("button", { name: "Рекомендовать с оффером" }).waitFor();
    const itemCalls = await page.evaluate(() => window.offerCalls);
    assert.equal(itemCalls.length, 2); assert.deepEqual(itemCalls[0], itemCalls[1]);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Business form overflow");
    await page.goto(`${smokeOrigin(server)}/__offers-smoke?case=business-page`);
    await page.getByRole("heading", { name: "Доступ к пространствам клиентов" }).waitFor();
    assert.equal(await page.locator('section[aria-labelledby="business-offers-title"]').evaluate(node => getComputedStyle(node).gap), "24px");
    await page.getByLabel("Товар или услуга", { exact: true }).click();
    await page.getByRole("option", { name: "Персональная консультация по развитию бизнеса" }).click();
    await page.getByRole("button", { name: "Рекомендовать с оффером" }).click();
    await page.getByRole("button", { name: "Получатель · @buyer", exact: true }).click();
    await page.getByLabel("Цена в роллах").fill("75");
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Real clients page overflow");
    await page.screenshot({ path: `${output}/clients-page-${width}-${height}.png`, fullPage: true });
    await page.goto(`${smokeOrigin(server)}/__offers-smoke?case=wallet-page`);
    await page.locator("[data-rolls-balance]").filter({ hasText: "100" }).waitFor();
    await page.getByRole("heading", { name: "Активный оффер" }).waitFor();
    await page.getByRole("button", { name: "Оплатить", exact: true }).click();
    await page.getByRole("alertdialog").waitFor();
    await page.getByRole("button", { name: "Отмена", exact: true }).click();
    await page.getByRole("alertdialog").waitFor({ state: "hidden" });
    assert.equal(await page.getByRole("heading", { name: "Персональные офферы", exact: true }).evaluate(node => getComputedStyle(node).fontSize), "30px");
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Real wallet page overflow");
    await page.screenshot({ path: `${output}/wallet-page-${width}-${height}.png`, fullPage: true });
    await page.goto(`${smokeOrigin(server)}/__offers-smoke?case=pagination`);
    await page.getByRole("button", { name: "Показать ещё счета" }).click();
    const older = page.locator("article").filter({ has: page.getByRole("heading", { name: "Ранний счёт", exact: true }) });
    await older.getByRole("button", { name: "Оплатить", exact: true }).click();
    await page.getByRole("button", { name: "Подтвердить оплату" }).click();
    await page.getByText("Недостаточно роллов").waitFor();
    await page.getByRole("button", { name: "Подтвердить оплату" }).click();
    await page.getByRole("alertdialog").waitFor({ state: "hidden" });
    await older.getByText("Оплачен", { exact: true }).waitFor();
    assert.equal(await page.getByRole("heading", { name: "Первый счёт", exact: true }).count(), 1, "Overlapping pages deduplicate invoices");
    assert.equal(await older.getByRole("button", { name: "Оплатить", exact: true }).count(), 0);
    assert.equal((await page.evaluate(() => window.offerCalls)).every(call => call.path === "/personal-offers/older-offer/pay"), true);
    await page.screenshot({ path: `${output}/pagination-${width}-${height}.png`, fullPage: true });
    await page.getByRole("button", { name: "Обновить счета" }).click();
    await page.getByRole("button", { name: "Показать ещё счета" }).waitFor();
    assert.equal(await page.getByRole("heading", { name: "Ранний счёт", exact: true }).count(), 0);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Paginated invoices overflow");
    await page.goto(`${smokeOrigin(server)}/__offers-smoke?case=long-recipient`);
    await page.getByRole("button", { name: "Рекомендовать с оффером" }).click();
    const longName = "И".repeat(80), longUsername = "w".repeat(32);
    const person = page.getByRole("button", { name: `${longName} · @${longUsername}`, exact: true });
    await person.waitFor();
    assert(await person.evaluate(node => node.scrollWidth <= node.clientWidth + 1), "Search result text stays inside its button");
    await person.click();
    const name = page.locator("form span").filter({ hasText: longName });
    assert(await name.evaluate(node => node.scrollWidth <= node.clientWidth + 1), "Selected recipient wraps inside the form");
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Long recipient root overflow");
    await page.screenshot({ path: `${output}/long-recipient-${width}-${height}.png`, fullPage: true });
    await page.goto(`${smokeOrigin(server)}/__offers-smoke?case=wishlist-manager`);
    await page.getByRole("button", {name:'Открыть «Wishlist товар»'}).click();
    await page.getByLabel("Покупатель", {exact:true}).click();
    await page.getByRole("option", {name:"Получатель · @buyer"}).click();
    await page.getByLabel("Цена в роллах", {exact:true}).fill("75");
    await page.getByLabel("Срок действия", {exact:true}).click();
    await page.getByRole("option", {name:"3 дня",exact:true}).click();
    await page.getByRole("button", {name:"Предложить",exact:true}).click();
    await page.getByText("Повторите рекомендацию").waitFor();
    await page.getByRole("button", {name:"Предложить",exact:true}).click();
    await page.getByLabel("Цена в роллах", {exact:true}).waitFor({state:"hidden"});
    await page.waitForURL(url=>!url.searchParams.has("formScreen"));
    const recommendations=await page.evaluate(()=>window.offerCalls);
    assert.equal(recommendations.length,2);assert.deepEqual(recommendations[0],recommendations[1]);
    assert.equal(recommendations[0].body.priceRolls,75);assert.equal(recommendations[0].body.durationHours,72);
    await page.goto(`${smokeOrigin(server)}/__offers-smoke?case=wishlist-buyer`);
    await page.getByRole("button", {name:'Открыть «Wishlist товар»'}).click();
    await page.getByRole("button", {name:"Оплатить",exact:true}).click();
    await page.getByRole("button", {name:"Подтвердить оплату"}).click();
    await page.getByText("Недостаточно роллов").waitFor();
    await page.getByRole("button", {name:"Подтвердить оплату"}).click();
    await page.getByRole("alertdialog").waitFor({state:"hidden"});
    await page.waitForURL(url=>!url.searchParams.has("formScreen"));
    await page.getByRole("button", {name:'Открыть «Wishlist товар»'}).click();
    await page.getByRole("status").filter({hasText:"Оплачен"}).waitFor();
    assert.equal(await page.getByRole("button", {name:"Оплатить",exact:true}).count(),0);
    await page.screenshot({path:`${output}/wishlist-paid-${width}-${height}.png`});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),"Wishlist offer root overflow");
    assert.deepEqual(errors, []);
    console.log(`PASS ${width}x${height}: terms, retry key, cancellation, insufficient balance, paid/expired, overflow`);
    await page.close();
  }
} finally { await browser.close(); await server.close(); }
