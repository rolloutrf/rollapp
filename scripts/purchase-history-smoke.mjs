import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createServer } from "vite";
import { chromium } from "playwright-core";
import { browserLaunchOptions } from "./browser-runtime.mjs";
import { smokeBaseUiDependencies } from "./smoke-dependencies.mjs";
import { listenSmokeServer, smokeOrigin, smokePort } from "./smoke-server.mjs";

const fixture = "/__purchase-history-smoke";
const activityScreenshots = process.env.ROLLAPP_ACTIVITY_SCREENSHOTS;
if (activityScreenshots) await mkdir(activityScreenshots, { recursive: true });
const server = await createServer({
  optimizeDeps: { include: [...smokeBaseUiDependencies, "read-excel-file/universal"] },
  cacheDir: "node_modules/.vite-purchase-history-smoke",
  server: { host: "127.0.0.1", port: smokePort(), strictPort: true, hmr: false, watch: null },
  plugins: [{
    name: "purchase-history-fixture",
    enforce: "pre",
    transform(source, id) {
      if (id.endsWith("/src/App.jsx?purchase-history-smoke")) return `${source}\nexport { ProfileSettingsModal } from \"./modules/profile/profile-settings.jsx\";\nexport { SessionContext } from \"./modules/auth/session.jsx\";\nexport { ToastContext } from \"./modules/shell/toast.jsx\";\nexport { WishlistSectionNavigation } from \"./modules/wishlist/wish-navigation.jsx\";`;
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

async function checkActivity(page, viewport, surface) {
  const open = page.getByRole("button", { name: "Сводка по роллам", exact: true });
  const walletReceipt = page.getByRole("button", { name: "Квитанция · От Мария", exact: false });
  await walletReceipt.press("Enter");
  const receipt = page.getByRole("region", { name: "Квитанция Rollapp", exact: true });
  await receipt.getByText("Мария · @maria").waitFor();
  await receipt.getByText("16 нояб. 2026 г., 01:30:00").waitFor();
  await walletReceipt.press("Space");
  await receipt.waitFor({ state: "hidden" });
  assert(await walletReceipt.evaluate(node => node === document.activeElement));
  await open.click();
  const report = page.getByRole("region", { name: "Движение роллов", exact: true });
  await report.getByText("70 роллов", { exact: false }).waitFor();
  await report.getByText("Москва", { exact: false }).waitFor();
  const period = report.getByRole("group", { name: "Период сводки" });
  for (const button of await period.getByRole("button").all()) {
    assert.equal(await button.evaluate((element) => element.offsetHeight), 48);
  }
  await report.getByRole("button", { name: /Покупки и продажи/ }).click();
  await report.getByRole("alert").filter({ hasText: "Выписка временно недоступна" }).waitFor();
  await report.getByRole("button", { name: "Повторить", exact: true }).click();
  await report.getByText("Возврат · Возврат заказа A").waitFor();
  await report.getByRole("button", { name: "Показать ещё", exact: true }).click();
  await report.getByText("Покупка · Книги для проекта").waitFor();
  const refundReceipt = report.getByRole("button", { name: "Квитанция · Возврат · Возврат заказа A", exact: false });
  await refundReceipt.click();
  await receipt.getByText("Квитанция временно недоступна").waitFor();
  await receipt.getByRole("button", { name: "Повторить", exact: true }).click();
  await receipt.getByText("refund:invoice", { exact: true }).waitFor();
  const download = receipt.getByRole("button", { name: "Скачать квитанцию" });
  assert.equal((await download.boundingBox()).height, 48);
  const downloadReady = page.waitForEvent("download");
  await download.click();
  const file = await downloadReady;
  assert.equal(file.suggestedFilename(), "rollapp-refund-invoice.txt");
  const contents = await readFile(await file.path(), "utf8");
  assert.match(contents, /Сумма: 150 роллов/);
  assert.match(contents, /Номер: refund:invoice/);
  assert.match(contents, /Номер заказа: invoice/);
  assert.match(contents, /Движение: Зачисление/);
  assert(await receipt.evaluate(node => [node, ...node.querySelectorAll("button, dl, dd")].every(el => el.scrollWidth <= el.clientWidth + 1)));
  if (activityScreenshots && [390, 1440].includes(viewport.width) && viewport.height >= 800) {
    await receipt.getByRole("heading").scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(activityScreenshots, `receipt-${surface}-${viewport.width}.png`) });
  }
  await refundReceipt.click();
  await receipt.waitFor({ state: "hidden" });
  assert.deepEqual(await page.evaluate(() => window.activityRequests.filter(({ mode }) => mode === "detail")), [
    { mode: "detail", days: "30", asOf: "2026-11-15T23:00:00.842461Z", group: "payments" },
    { mode: "detail", days: "30", asOf: "2026-11-15T23:00:00.842461Z", group: "payments" },
    { mode: "detail", days: "30", asOf: "2026-11-15T23:00:00.842461Z", group: "payments", beforeId: "refund:invoice", before: "2026-11-14T12:23:10.824521Z" },
  ]);
  if (activityScreenshots && [390, 1440].includes(viewport.width) && viewport.height >= 800) {
    await report.getByRole("heading").scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(activityScreenshots, `${surface}-${viewport.width}.png`) });
  }
  await period.getByRole("button", { name: "7 дней" }).click();
  await report.getByText("За этот период операций не было.").waitFor();
  assert.equal(await report.getByText("Книги для проекта", { exact: false }).count(), 0);
  await period.getByRole("button", { name: "90 дней" }).click();
  await report.getByText("Сводка временно недоступна").waitFor();
  await report.getByRole("button", { name: "Повторить", exact: true }).click();
  await report.getByText("103 ролла", { exact: false }).waitFor();
  assert.equal(await period.getByRole("button", { name: "90 дней" }).getAttribute("aria-pressed"), "true");
  const overflows = await report.evaluate((element) => {
    return [document.documentElement, element, ...element.querySelectorAll("button, dl")]
      .filter((node) => node.scrollWidth > node.clientWidth + 1).map((node) => node.tagName);
  });
  assert.deepEqual(overflows, [], `Roll activity overflow ${surface} ${viewport.width}`);
  await page.evaluate(() => { window.delayRollActivity = true; });
  await period.getByRole("button", { name: "30 дней" }).click();
  await page.waitForFunction(() => typeof window.finishRollActivity === "function");
  await period.getByRole("button", { name: "7 дней" }).click();
  await report.getByText("За этот период операций не было.").waitFor();
  await page.evaluate(async () => { window.finishRollActivity(); await new Promise(requestAnimationFrame); });
  assert.equal(await report.getByRole("button", { name: /Покупки и продажи/ }).count(), 0);
  await page.getByRole("button", { name: "Скрыть сводку" }).click();
  await report.waitFor({ state: "hidden" });
}

async function checkTransfers(page, { width, height, surface, expectRetry = false }) {
  const persistedKey = "rollapp:pending-roll-transfer:purchase-history";
  const readFixture = () => page.evaluate(() => window.readTransferFixture());
  const stored = () => page.evaluate(key => JSON.parse(sessionStorage.getItem(key)), persistedKey);
  const opener = page.getByRole("button", { name: "Отправить роллы", exact: true });
  await opener.click();
  await page.getByRole("textbox", { name: "Получатель" }).fill("Иван");
  await page.getByRole("button", { name: /Иван.*@ivan/ }).click();
  const amount = page.getByRole("textbox", { name: "Сколько роллов" });
  await amount.fill("12");
  const memo = "Тестовое назначение. ".repeat(12).trim();
  await page.getByRole("textbox", { name: /Комментарий/ }).fill(memo);
  const next = page.getByRole("button", { name: "Продолжить" });
  const dialog = page.getByRole("alertdialog");
  await next.press("Enter");
  await dialog.getByRole("heading", { name: "Перевести 12 роллов?" }).waitFor();
  await dialog.getByText(/Иван · @ivan.*Комиссия/).waitFor();
  assert.deepEqual((await readFixture()).attempts, []);
  assert.equal(await stored(), null);
  await dialog.getByRole("button", { name: "Назад", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  assert.equal(await amount.inputValue(), "12");
  await amount.fill("13");
  await next.click();
  await dialog.getByRole("heading", { name: "Перевести 13 роллов?" }).waitFor();
  await dialog.getByRole("button", { name: "Перевести", exact: true }).click();
  await dialog.getByText(/Ответ о переводе пока не получен/).waitFor();
  const before = await readFixture();
  assert.equal(before.attempts.length, 1);
  const [initial] = before.attempts;
  assert.equal(initial.amount, 13);
  assert.equal(initial.note, memo);
  assert.equal(initial.recipientId, "transfer-fixture-recipient");
  assert.deepEqual((await stored()).payload, initial);

  if (surface === "wallet") await page.reload({ waitUntil: "commit" });
  else {
    await dialog.getByRole("button", { name: "Позже", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "К кошельку", exact: true }).click();
    await page.getByText("Ожидает проверки перевод · 13 роллов").waitFor();
    const checkOpener = page.getByRole("button", { name: "Проверить перевод", exact: true });
    assert(await checkOpener.evaluate(node => node === document.activeElement));
    await checkOpener.click();
  }
  await dialog.getByRole("heading", { name: "Проверить перевод" }).waitFor();
  await dialog.getByText("Сумма · 13 роллов").waitFor();
  assert(await page.locator("#rolls-amount").isDisabled());
  assert.deepEqual((await readFixture()).checks, [], "Opening or reloading must not check or send by itself");
  assert.deepEqual((await readFixture()).attempts, [initial]);

  const check = dialog.getByRole("button", { name: "Проверить перевод", exact: true });
  if (expectRetry && height < 500) {
    await page.evaluate(() => { window.failTransferStatusOnce = true; });
    await check.click();
    await dialog.getByText("Войдите снова").waitFor();
    assert.deepEqual((await stored()).payload, initial);
  }
  await check.click();
  if (expectRetry) {
    const missingStatus = dialog.getByText("В журнале пока нет перевода.", { exact: true });
    await missingStatus.waitFor();
    assert(await missingStatus.evaluate(node => node.getBoundingClientRect().bottom <= node.closest(".overflow-y-auto").getBoundingClientRect().bottom + 1));
    assert.deepEqual((await readFixture()).attempts, [initial], "Check must not post an unrecorded transfer");
    assert.deepEqual((await stored()).payload, initial);
    const retry = dialog.getByRole("button", { name: "Повторить отправку", exact: true });
    const bounds = await dialog.boundingBox();
    for (const button of [retry, check, dialog.getByRole("button", { name: "Позже" })]) {
      const box = await button.boundingBox();
      assert.equal(box.height, 48);
      assert(box.y >= bounds.y && box.y + box.height <= bounds.y + bounds.height + 1);
    }
    if (activityScreenshots && (width === 390 || width === 1440)) {
      await page.screenshot({ path: join(activityScreenshots, `transfer-${width}x${height}.png`) });
    }
    await retry.click();
  }
  await dialog.waitFor({ state: "hidden" });
  await page.locator("[data-rolls-balance]").getByText("15", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Квитанция · Иван", exact: false }).waitFor();
  assert.equal(await stored(), null);
  const after = await readFixture();
  assert.deepEqual(after.attempts, expectRetry ? [initial, initial] : [initial]);
  assert.deepEqual(after.checks, expectRetry && height < 500 ? [initial.idempotencyKey, initial.idempotencyKey] : [initial.idempotencyKey]);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  if (surface === "wallet" && width === 1024) {
    await opener.click();
    await page.getByRole("textbox", { name: "Получатель" }).fill("Иван");
    await page.getByRole("button", { name: /Иван.*@ivan/ }).click();
    await page.getByRole("textbox", { name: "Сколько роллов" }).fill("3");
    await page.getByRole("button", { name: "Продолжить" }).click();
    await dialog.getByRole("heading", { name: "Перевести 3 ролла?" }).waitFor();
    const outstanding = { recipient: { id: initial.recipientId, name: "Иван", username: "ivan" },
      payload: { ...initial, amount: 4, idempotencyKey: "6e9874be-23a7-4a4d-8029-e9094efba925" } };
    await page.evaluate(([key, intent]) => sessionStorage.setItem(key, JSON.stringify(intent)), [persistedKey, outstanding]);
    await dialog.getByRole("button", { name: "Перевести", exact: true }).click();
    await dialog.getByText("Сумма · 4 ролла").waitFor();
    assert.deepEqual((await readFixture()).attempts, after.attempts, "An outstanding request in the same tab must not be overwritten");
    assert.deepEqual(await stored(), outstanding);
    await page.evaluate(() => { window.transferStatusOverride = { id: "existing-transfer", recipientId: "other", amount: 4, note: "" }; });
    await dialog.getByRole("button", { name: "Проверить перевод", exact: true }).click();
    await dialog.getByText(/По этому номеру уже проведён перевод/).waitFor();
    await dialog.getByRole("button", { name: "Закрыть запрос", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    assert.equal(await stored(), null);
    assert.deepEqual((await readFixture()).attempts, after.attempts, "Retiring a conflicting local intent must not post a transfer");
  }
}

try {
  const generator = await browser.newPage();
  await generator.setContent("<p>09.11.2026 11:20 -350.00 RUB Book Store</p><p>09.11.2026 11:25 +1000.00 RUB Deposit</p>");
  const pdf = await generator.pdf();
  await generator.close();
  const csv = "Дата операции;Статус;Сумма операции;Валюта операции;Категория;Описание\n09.11.2026;OK;-1279,95;RUB;Книги;Книжный магазин\n08.11.2026;OK;-400;RUB;Переводы;Перевод";
  for (const [width, height] of [[320, 700], [390, 844], [390, 400], [768, 800], [820, 450], [1024, 800], [1440, 900], [1920, 1000]]) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: "reduce" });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", (route) => { errors.push("Unexpected API request from fixture"); return route.abort(); });
    await page.goto(smokeOrigin(server) + fixture, { waitUntil: "commit" });
    const shortMobile = width === 390 && height === 400;
    if (shortMobile) await page.evaluate(() => {
      window.rejectDestinationLoad = true;
      window.rejectPurchaseSave = true;
    });
    await page.getByRole("navigation", { name: "Разделы Вишлиста" }).waitFor({ timeout: 90_000 });
    assert.equal(await page.getByRole("button", { name: "Импорт покупок" }).count(), 0);
    await page.getByRole("button", { name: "Профиль", exact: true }).click();
    await page.getByRole("button", { name: "Финансы", exact: true }).click();
    await checkActivity(page, { width, height }, "drawer");
    await checkTransfers(page, { width, height, surface: "drawer" });
    await page.evaluate(() => sessionStorage.removeItem("purchase-history-transfer-fixture"));
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
    }), "Import action should be visible within the finance surface");
    await open.click();
    const heading = page.getByRole("heading", { name: "Импорт покупок" });
    await heading.waitFor();
    const surface = heading.locator("xpath=ancestor::*[contains(@class, 'app-drawer--form')][1]");
    const back = surface.getByRole("button", { name: "Назад", exact: true });
    const backBox = await back.boundingBox();
    assert.deepEqual([backBox.width, backBox.height], [48, 48]);
    if (width >= 768) assert(backBox.x < (await heading.boundingBox()).x, "Back precedes the title in the drawer header");
    const destination = surface.getByRole("combobox", { name: "Список в Вишлисте" });
    if (shortMobile) {
      await surface.getByRole("alert").filter({ hasText: "Списки временно недоступны" }).waitFor();
      assert(await destination.isDisabled());
      await surface.getByRole("button", { name: "Повторить загрузку списков" }).click();
    }
    await page.waitForFunction((id) => document.getElementById(id)?.disabled === false, await destination.getAttribute("id"));
    const selectDestination = async (group, name) => {
      await destination.click();
      const option = page.getByRole("group", { name: group }).getByRole("option", { name, exact: true });
      await option.click();
      assert.equal(await destination.innerText(), `${group} · ${name}`);
    };
    await destination.click();
    const picker = page.getByRole("listbox");
    await picker.getByRole("option", { name: "Книги" }).waitFor();
    assert.deepEqual(await picker.getByRole("group").allTextContents(), [
      "ТоварыНе отсортированныеКниги", "ЕдаНе отсортированныеПерекусы",
    ]);
    await page.keyboard.press("Escape");
    await picker.waitFor({ state: "hidden" });
    const file = surface.locator("input[type=file]");
    const upload = page.getByRole("button", { name: "Выбрать файл" });
    const uploadBox = await upload.boundingBox();
    assert.equal(uploadBox.height, 48);
    if (width < 768) assert.equal(await surface.locator("[data-native-form-actions]").count(), 1);
    else assert.equal(await surface.evaluate((node) => node.matches("[data-slot=drawer-popup][data-swipe-direction=right]")), true);

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
    assert(await create.isDisabled(), "A destination is required before creating cards");
    await selectDestination("Товары", "Книги");
    assert(await create.isEnabled());
    assert.equal((await create.boundingBox()).height, 48);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert(await page.locator(".app-drawer-body").evaluate((node) => node.scrollWidth <= node.clientWidth + 1));
    const summary = surface.getByRole("status").filter({ hasText: "Карточки будут видны только вам" });
    assert(await summary.evaluate((node, mobile) => {
      const scroller = mobile ? document.scrollingElement : node.closest(".app-drawer-body");
      const footer = node.closest("form").querySelector("[data-native-form-actions], [data-slot=drawer-footer]");
      scroller.scrollTo({ top: scroller.scrollHeight, behavior: "instant" });
      const box = node.getBoundingClientRect();
      return box.top >= 0 && box.bottom <= footer.getBoundingClientRect().top + 1;
    }, width < 768), "Review content must be able to scroll fully above the footer");
    await page.screenshot({ path: `/tmp/rollapp-purchase-history-${width}x${height}.png` });

    await page.getByRole("button", { name: "Изменить источник" }).click();
    await page.getByRole("button", { name: "Заказы и чеки" }).click();
    await page.getByRole("textbox", { name: "Текст чека или заказа" }).fill("Чай зелёный — 249 ₽\nШоколад — 159 ₽\nИтого 408 ₽");
    await page.getByRole("button", { name: "Найти товары" }).click();
    await page.getByRole("heading", { name: "Найденные товары: 2" }).waitFor();
    await page.getByRole("checkbox", { name: /Шоколад/ }).uncheck();
    await page.getByRole("button", { name: "Создать карточки · 1" }).waitFor();
    if (shortMobile || width === 1440 || width === 820) {
      if (width === 1440) await selectDestination("Еда", "Перекусы");
      if (width === 820) await selectDestination("Товары", "Не отсортированные");
      const expected = { listId: width === 1440 ? "snacks" : width === 820 ? null : "books",
        space: width === 1440 ? "food" : "products",
        items: [{ title: "Чай зелёный", price: 249, currency: "RUB" }] };
      await create.click();
      if (shortMobile) {
        await surface.getByRole("alert").filter({ hasText: "Список для импорта больше недоступен" }).waitFor();
        assert(await create.isDisabled());
        await destination.click();
        assert.equal(await picker.getByRole("option", { name: "Книги" }).count(), 0);
        await picker.getByRole("group", { name: "Еда" }).getByRole("option", { name: "Не отсортированные" }).click();
        await create.click();
        assert.deepEqual(await page.evaluate(() => window.purchaseImportRequests), [
          expected, { ...expected, listId: null, space: "food" },
        ]);
      } else {
        assert.deepEqual(await page.evaluate(() => window.purchaseImportRequests), [expected]);
      }
      assert.equal(await page.evaluate(() => window.wishlistRefreshes), 1);
    } else {
      if (width === 320) await page.goBack();
      else await back.click();
      assert.deepEqual(await page.evaluate(() => window.purchaseImportRequests), []);
      assert.equal(await page.evaluate(() => window.wishlistRefreshes), 0);
    }
    await heading.waitFor({ state: "hidden" });
    await open.waitFor();
    await page.waitForFunction(() => document.activeElement?.textContent.trim() === "Импорт покупок");
    assert.deepEqual(errors, []);
    const expectRetry = width === 390 || width === 1440;
    await page.goto(smokeOrigin(server) + fixture + `?wallet${expectRetry ? "&transferMiss" : ""}`, { waitUntil: "commit" });
    await checkActivity(page, { width, height }, "wallet");
    await checkTransfers(page, { width, height, surface: "wallet", expectRetry });
    assert.deepEqual(errors, []);
    console.log(`PASS ${width}×${height}: confirmed transfers, private status, roll receipts and statements, native import`);
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
