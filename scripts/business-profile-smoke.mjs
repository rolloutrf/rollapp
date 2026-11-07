import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium } from "playwright-core";
import { browserLaunchOptions } from "./browser-runtime.mjs";
import { listenSmokeServer, smokeOrigin } from "./smoke-server.mjs";

const salesOnly = process.argv.includes("--sales-only");
const server = await createServer({ cacheDir: salesOnly ? "node_modules/.vite-wish-sales" : "node_modules/.vite-business-profile", server: { host: "127.0.0.1", port: 0, hmr: false, watch: null }, plugins: [{
  name: "business-profile-fixture", configureServer(vite) {
    vite.middlewares.use(async (req, res, next) => {
      if (!req.url.startsWith("/__business-profile")) return next();
      res.setHeader("Content-Type", "text/html");
      res.end(await vite.transformIndexHtml(req.url, '<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/gift-cards.jsx"></script></body></html>'));
    });
  },
}] });
await listenSmokeServer(server);
const browser = await chromium.launch(browserLaunchOptions());
async function checkWishSale(width, height) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: width < 768 ? 3 : 1 });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/**", route => { errors.push("Real API request forbidden"); return route.abort(); });
  try {
    await page.goto(`${smokeOrigin(server)}/__business-profile?sales`);
    const sale = page.getByRole("menuitem", { name: "Выставить на продажу" });
    await page.getByRole("button", { name: "Опции желания «Кофеварка»" }).click();
    await page.getByRole("menuitem", { name: "Исполнено", exact: true }).waitFor();
    assert.equal(await sale.count(), 0);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Опции желания «Кофемолка»" }).click();
    await sale.click();

    const editor = page.locator("[data-wishlist-item-editor]");
    const title = editor.getByRole("combobox", { name: "Название" });
    const description = editor.getByRole("textbox", { name: "Описание" });
    await title.waitFor();
    assert.equal(await title.inputValue(), "Кофемолка");
    assert.equal(await description.inputValue(), "Ручная кофемолка");
    const submit = editor.locator("button[type=submit]");
    assert.equal(await submit.textContent(), "Сохранить скрытым");
    assert.deepEqual(await submit.evaluate(node => [node.offsetHeight, getComputedStyle(node).borderRadius]), [48, "24px"]);
    assert(await editor.locator(".app-drawer-body").evaluate(node => node.scrollWidth <= node.clientWidth + 1));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: `/tmp/rollapp-wish-sale-${width}-${height}.png` });
    if (width < 768) await page.goBack();
    else await editor.getByRole("button", { name: "Отмена", exact: true }).click();
    await page.waitForFunction(() => !new URLSearchParams(location.search).has("wish") && !new URLSearchParams(location.search).has("formScreen"));
    await page.getByText("Объявлений пока нет").waitFor();
    assert.deepEqual(await page.evaluate(() => giftHarness.calls), []);

    await page.getByRole("link", { name: "Вернуться в Вишлист" }).click();
    await page.getByRole("button", { name: "Открыть желание «Кофемолка»" }).click();
    await page.locator("[data-slot=wish-actions]").getByRole("button", { name: "Опции желания «Кофемолка»" }).click();
    await sale.click();
    await title.waitFor();
    const price = editor.getByRole("textbox", { name: "Цена с валютой" });
    await price.fill("3 500 ₽");
    await submit.click();
    await editor.getByText(/Ответ сервера потерян/).waitFor();
    assert.equal(await price.inputValue(), "3 500 ₽");
    await submit.click();
    await editor.waitFor({ state: "hidden" });
    const card = page.getByRole("button", { name: "Открыть «Кофемолка»", exact: true });
    await card.waitFor();
    assert.equal(await card.count(), 1);
    assert.deepEqual(await page.evaluate(() => giftHarness.calls.map(call => call.payload.wishId)), ["fulfilled", "fulfilled"]);
    await card.click();
    await editor.getByRole("switch", { name: "Показывать в магазине" }).click();
    await submit.click();
    await editor.waitFor({ state: "hidden" });
    await page.getByRole("link", { name: "Магазин", exact: true }).click();
    await card.waitFor();
    await card.click();
    assert.equal(await page.getByRole("button", { name: "Написать продавцу" }).count(), 0);
    await page.goto(`${smokeOrigin(server)}/__business-profile?sale-buyer`);
    await page.getByRole("button", { name: "Открыть «Товар участника»" }).click();
    await page.getByRole("button", { name: "Написать продавцу" }).click();
    await page.getByRole("region", { name: "Переписка с Получатель подарочной карты" }).waitFor();
    assert.equal(new URL(page.url()).pathname, "/app/store");
    assert(!new URL(page.url()).searchParams.has("formScreen"));
    await page.getByRole("button", { name: "Закрыть сообщения" }).click();
    await page.getByRole("button", { name: "Открыть «Товар участника»" }).waitFor();
    assert.deepEqual(await page.evaluate(() => giftHarness.calls), [
      { path: "/messenger/conversations", payload: { participantId: "friend" } },
    ]);
    assert.deepEqual(errors, []);
    console.log(`PASS wish sale ${width}x${height}`);
  } finally {
    await page.close();
  }
}
try {
  for (const [width, height] of [[320,844],[390,844],[768,900],[820,450],[1024,900],[1440,900],[1920,900],[390,400]]) {
    await checkWishSale(width, height);
    if (salesOnly) continue;
    for (const mode of ["owner", "dashboard", "guest", "buyer", "empty", "listing-error", "personal"]) {
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: width < 768 ? 3 : 1 });
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/api/**", route => { errors.push("Real API request forbidden"); return route.abort(); });
      const query = `public&offers&seller&${mode}${mode === "empty" || mode === "listing-error" ? "&guest" : ""}`;
      await page.goto(`${smokeOrigin(server)}/__business-profile?${query}`);
      await page.getByRole("heading", { level: 1 }).waitFor();
      if (mode === "dashboard") assert.equal(new URL(page.url()).pathname, "/studio/products");
      await page.evaluate(() => document.fonts.ready);
      if (mode === "personal") {
        await page.getByText("Добавьте то, что действительно порадует.").or(page.getByText("Загляните чуть позже — новая мечта наверняка появится.")).waitFor();
        assert.equal(await page.getByText("Бизнес-аккаунт", { exact: true }).count(), 0);
      } else {
        await page.getByText("Бизнес-аккаунт", { exact: true }).waitFor();
        assert.equal(await page.getByText("В этом списке пока пусто", { exact: true }).count(), 0);
        assert.equal(await page.getByRole("button", { name: "Новый список", exact: true }).count(), 0);
        assert.equal(await page.getByRole("button", { name: "Добавить", exact: true }).count(), 0);
        if (mode === "empty") {
          await page.getByText("Товаров пока нет", { exact: true }).waitFor();
          assert.equal(await page.getByText("В магазине пока пусто", { exact: true }).count(), 0);
        } else if (mode === "listing-error") {
          await page.getByText("Товары временно недоступны", { exact: true }).waitFor();
          await page.getByRole("button", { name: "Повторить", exact: true }).click();
          await page.getByText("Товары временно недоступны", { exact: true }).waitFor();
        } else {
          await page.getByRole("button", { name: "Открыть «Товар мастерской»", exact: true }).waitFor();
        }
        const manage = page.getByRole("link", { name: "Управлять товарами", exact: true });
        if (mode === "owner" || mode === "dashboard") {
          assert.equal(await manage.getAttribute("href"), "/app/wishes/business?tab=products");
          const style = await manage.evaluate(node => { const css = getComputedStyle(node); return { height: node.getBoundingClientRect().height, left: css.paddingLeft, right: css.paddingRight }; });
          assert(style.height >= 48); assert.equal(style.left, "24px"); assert.equal(style.right, "24px");
        } else assert.equal(await manage.count(), 0);
      }
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${mode} ${width}: root overflow`);
      await page.screenshot({ path: `/tmp/rollapp-business-profile-${mode}-${width}-${height}.png`, fullPage: true });
      if (mode === "owner" || mode === "dashboard") {
        await page.getByRole("link", { name: "Управлять товарами", exact: true }).click();
        await page.getByRole("textbox", { name: "Название страницы", exact: true }).waitFor();
        assert.equal(new URL(page.url()).searchParams.get("tab"), "products");
        const add = page.getByRole("button", { name: "Добавить товар", exact: true });
        const editor = page.locator("[data-wishlist-item-editor]");
        const title = editor.getByRole("combobox", { name: "Название", exact: true });
        const footer = editor.locator("[data-native-form-actions], .app-form-actions");
        const back = footer.getByRole("button", { name: width < 768 ? "Назад" : "Отмена", exact: true });
        const submit = footer.locator("button[type=submit]");
        await add.click();
        await title.waitFor();
        assert.equal(await editor.getByRole("heading", { name: "Добавить товар", exact: true }).count(), 1);
        assert.equal(await editor.getByRole("button", { name: /Добавить фото/ }).count(), 1);
        assert.equal(await submit.textContent(), mode === "owner" ? "Опубликовать" : "Добавить");
        for (const button of [back, submit]) {
          const geometry = await button.evaluate((element) => {
            const css = getComputedStyle(element);
            return [element.offsetHeight, css.borderTopLeftRadius, css.borderTopRightRadius, css.borderBottomLeftRadius, css.borderBottomRightRadius];
          });
          assert.deepEqual(geometry, [48, "24px", "24px", "24px", "24px"]);
        }
        const body = editor.locator(".app-drawer-body");
        assert(await body.evaluate((node) => node.scrollWidth <= node.clientWidth + 1), "Editor content must fit inside its scroll rail");
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Editor must not cause page overflow");
        if (mode === "owner") {
          await page.screenshot({ path: `/tmp/rollapp-item-editor-${width}-${height}.png` });
          await submit.click();
          await editor.getByText("Введите название.", { exact: true }).waitFor();
          assert(await title.evaluate((node) => node === document.activeElement));
          await title.fill("Несохранённый товар");
          await title.press("Tab");
          if (width < 768) await page.goBack();
          else await back.click();
          const discard = page.getByRole("alertdialog", { name: "Выйти без сохранения?" });
          await discard.getByRole("button", { name: "Продолжить редактирование" }).click();
          assert.equal(await title.inputValue(), "Несохранённый товар");
          await back.click();
          await discard.getByRole("button", { name: "Выйти", exact: true }).click();
          await editor.waitFor({ state: "hidden" });
          await page.waitForFunction(() => !new URLSearchParams(location.search).has("formScreen"));
          assert.deepEqual(await page.evaluate(() => giftHarness.calls), [], "Invalid submit and cancel must not write");
        } else {
          await back.click();
          await editor.waitFor({ state: "hidden" });
          await page.waitForFunction(() => !new URLSearchParams(location.search).has("formScreen"));
          const pageTitle = page.getByRole("textbox", { name: "Название страницы", exact: true });
          await pageTitle.fill("Несохранённое название витрины");
          await add.click();
          await title.fill("Кофемашина Dedica");
          await title.press("Tab");
          const description = editor.getByRole("textbox", { name: "Описание", exact: true });
          await description.fill("Готовит эспрессо.");
          await editor.getByText("17 / 4000", { exact: true }).waitFor();
          await editor.getByRole("textbox", { name: "Цена с валютой" }).fill("12 900 ₽");
          const link = editor.getByRole("textbox", { name: "Ссылка на товар", exact: true });
          await link.fill("javascript:alert(1)");
          await submit.click();
          await editor.getByText("Введите ссылку, которая начинается с https:// или http://.").waitFor();
          await link.fill("https://example.com/coffee");
          const picker = editor.locator("input[type=file]");
          const [chooser] = await Promise.all([
            page.waitForEvent("filechooser"),
            editor.getByRole("button", { name: /Добавить фото/ }).click(),
          ]);
          await chooser.setFiles({ name: "cover.txt", mimeType: "text/plain", buffer: Buffer.from("cover") });
          await editor.getByText("Выберите фото в формате JPG, PNG или WebP.").waitFor();
          const cover = { name: "cover.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGCAIAAABxZ0isAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWOo6D6IFTEMpAQAyI5UwfdZU4cAAAAASUVORK5CYII=", "base64") };
          await picker.setInputFiles({ ...cover, buffer: Buffer.from("broken image") });
          await editor.getByText("Фото не открывается", { exact: true }).waitFor();
          assert(await submit.isDisabled());
          await picker.setInputFiles(cover);
          const coverImage = editor.getByRole("img", { name: "Предпросмотр обложки" });
          await coverImage.waitFor();
          await coverImage.evaluate((node) => node.decode());
          await editor.getByRole("button", { name: "Убрать фото" }).click();
          await editor.getByRole("button", { name: /Добавить фото/ }).waitFor();
          if (width >= 768) {
            const transfer = await page.evaluateHandle(({ name, bytes }) => {
              const data = new DataTransfer();
              data.items.add(new File([new Uint8Array(bytes)], name, { type: "image/png" }));
              return data;
            }, { name: cover.name, bytes: [...cover.buffer] });
            const zone = editor.locator("[data-dragging]");
            await zone.dispatchEvent("dragover", { dataTransfer: transfer });
            await editor.locator('[data-dragging="true"]').waitFor();
            await zone.dispatchEvent("drop", { dataTransfer: transfer });
            await transfer.dispose();
          } else {
            await picker.setInputFiles(cover);
          }
          await coverImage.waitFor();
          await coverImage.evaluate((node) => node.decode());
          await editor.getByRole("switch", { name: "Показывать на витрине" }).click();
          assert.equal(await submit.textContent(), "Сохранить скрытым");
          await editor.getByRole("button", { name: "Предпросмотр", exact: true }).click();
          const preview = editor.locator('[aria-label="Предпросмотр карточки"]');
          await preview.getByRole("heading", { name: "Кофемашина Dedica" }).waitFor();
          await preview.getByText("12 900 ₽", { exact: true }).waitFor();
          assert.deepEqual(await page.evaluate(() => giftHarness.calls), [], "Previews must remain local");
          await submit.click();
          await editor.getByText(/Фото временно недоступно/).waitFor();
          assert.equal(await title.inputValue(), "Кофемашина Dedica");
          await submit.click();
          await page.waitForFunction(() => typeof giftHarness.completeItemSave === "function");
          assert(await submit.isDisabled());
          assert.equal(await submit.evaluate((node) => getComputedStyle(node).opacity), "1");
          await page.evaluate(() => document.querySelector("[data-wishlist-item-editor] form").requestSubmit());
          await page.evaluate(() => giftHarness.completeItemSave());
          await editor.getByText(/Ответ сервера потерян/).waitFor();
          await editor.getByRole("img", { name: "Предпросмотр обложки" }).waitFor();
          await submit.click();
          await editor.waitFor({ state: "hidden" });
          await page.waitForFunction(() => !new URLSearchParams(location.search).has("formScreen"));
          assert.equal(await pageTitle.inputValue(), "Несохранённое название витрины");
          await page.getByRole("button", { name: "Открыть «Кофемашина Dedica»", exact: true }).waitFor();
          const calls = await page.evaluate(() => giftHarness.calls);
          assert.deepEqual(calls.map((call) => call.path), ["/uploads/images", "/uploads/images", "/wishlist-business/products/items", "/wishlist-business/products/items"]);
          assert.deepEqual(calls[2].payload, calls[3].payload);
          assert.equal(calls[2].payload.active, false);
          assert.match(calls[2].payload.requestId, /^[0-9a-f-]{36}$/);
          assert.equal(await page.evaluate(() => giftHarness.sellerItems.filter((item) => item.title === "Кофемашина Dedica").length), 1);
          await page.getByRole("button", { name: "Открыть «Кофемашина Dedica»", exact: true }).click();
          await page.getByRole("button", { name: "Редактировать товар", exact: true }).click();
          await editor.getByRole("heading", { name: "Редактировать товар", exact: true }).waitFor();
          assert.equal(await title.inputValue(), "Кофемашина Dedica");
          await title.fill("Кофемашина Dedica EC685");
          await title.press("Tab");
          await submit.click();
          await editor.waitFor({ state: "hidden" });
          await page.waitForFunction(() => !new URLSearchParams(location.search).has("formScreen"));
          await page.getByRole("button", { name: "Открыть «Кофемашина Dedica EC685»", exact: true }).waitFor();
          assert.equal(await page.evaluate(() => giftHarness.calls.at(-1).payload.title), "Кофемашина Dedica EC685");
        }
      } else {
        assert.deepEqual(await page.evaluate(() => giftHarness.calls), [], "Read-only profile must not write");
      }
      assert.deepEqual(errors, []);
      await page.close();
      console.log(`PASS business profile ${mode} ${width}x${height}`);
    }
  }
} finally { await browser.close(); await server.close(); }
