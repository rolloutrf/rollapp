import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { browserLaunchOptions } from "./browser-runtime.mjs";
import { listenSmokeServer, smokePort, smokeOrigin } from "./smoke-server.mjs";
import { smokeBaseUiDependencies } from "./smoke-dependencies.mjs";
const server = await createServer({
  cacheDir: "node_modules/.vite-profile-settings",
  optimizeDeps: { include: smokeBaseUiDependencies },
  server: { host: "127.0.0.1", port: smokePort(process.env.PROFILE_SETTINGS_PORT), strictPort: true, hmr: false, watch: null },
  plugins: [{ name: "profile-settings-fixture", transform(source, id) {
    if (id.endsWith("/src/App.jsx?profile-settings-fixture")) return `${source}\nexport { ProfileSettingsModal, SessionContext, ToastContext };`;
  }, configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
    if (!req.url.startsWith("/__profile-settings") && !req.url.startsWith("/login?state=backup-result")) return next();
    res.setHeader("Content-Type", "text/html");
    res.end(await vite.transformIndexHtml(req.url, '<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/profile-settings.jsx"></script></body></html>'));
  }); } }],
});
await listenSmokeServer(server);
const origin = smokeOrigin(server);
const browser = await chromium.launch(browserLaunchOptions());
const errors = [];
try {
  for (const [width, height] of [[320,568],[390,844],[768,900],[820,900],[1024,768],[1440,900],[1920,1080],[390,400],[1440,400]]) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: "reduce" });
    page.setDefaultTimeout(10000);
    // Cold App imports share the calendar runner navigation budget.
    page.setDefaultNavigationTimeout(90000);
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/api/**", route => { errors.push("Unexpected API request"); return route.abort(); });
    const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2i8AAAAASUVORK5CYII=", "base64");
    await page.route("**/api/media/01234567-89ab-4cde-8fab-0123456789ab", route => route.fulfill({ contentType: "image/png", body: pixel }));
    await page.goto(`${origin}/__profile-settings`);
    const button = (name) => page.getByRole("button", { name, exact: true });
    const menu = page.getByRole("navigation", { name: "Разделы профиля" });
    const personal = button("Персональная информация");
    const back = button("Назад");
    const name = page.getByRole("textbox", { name: "Имя", exact: true });
    const photo = page.getByRole("group", { name: "Фото профиля", exact: true });
    const upload = photo.getByRole("button", { name: "Изменить фото профиля", exact: true });
    const savePhoto = button("Сохранить фото");
    const mobile = width < 768;
    await menu.waitFor();
    assert.deepEqual((await menu.getByRole("button").allTextContents()).map(text => text.trim()), [
      "Аккаунты", "Персональная информация", "Настроение", "Визитка и QR-код", "Внешние вишлисты", "Инвайты", "OpenRouter", "Ключи MCP", "Yandex ID", "Финансы", "Подарочные карты", "Заказы",
    ]);
    assert.equal(await menu.locator("[aria-expanded]").count(), 0);
    const photoBox = await photo.boundingBox();
    const avatarBox = await photo.locator(".avatar").boundingBox();
    const displayName = photo.getByText("Имя профиля", { exact: true });
    const nameBox = await displayName.boundingBox();
    const personalBox = await personal.boundingBox();
    const uploadBox = await upload.boundingBox();
    assert(photoBox.y + photoBox.height <= personalBox.y && photoBox.x === personalBox.x);
    assert.deepEqual([uploadBox.width, uploadBox.height], [144, 144]);
    assert(Math.abs(uploadBox.x + uploadBox.width / 2 - (photoBox.x + photoBox.width / 2)) <= 1);
    assert.equal(await photo.getByRole("button").count(), 1);
    assert.equal(await photo.locator('input[type="file"]').isVisible(), false);
    assert.equal(await button("Загрузить фото").count(), 0);
    assert(nameBox.y >= avatarBox.y + avatarBox.height && nameBox.y >= uploadBox.y + uploadBox.height);
    assert(Math.abs(nameBox.x + nameBox.width / 2 - (avatarBox.x + avatarBox.width / 2)) < 1);
    assert.equal(await displayName.evaluate(node => getComputedStyle(node).textAlign), "center");
    assert.equal(await savePhoto.count(), 0);
    await page.screenshot({ path: `/tmp/rollapp-profile-menu-${width}x${height}.png` });
    if (mobile) {
      await page.evaluate(() => window.scrollTo({ top: document.scrollingElement.scrollHeight, behavior: "instant" }));
      assert((await button("Заказы").boundingBox()).y + (await button("Заказы").boundingBox()).height <= (await back.boundingBox()).y);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    }
    if (width === 1440 && height === 900) {
      const rowColors = (row) => row.evaluate(async (el) => {
        el.getBoundingClientRect();
        await Promise.allSettled(el.getAnimations().map(animation => animation.finished));
        const { backgroundColor, color } = getComputedStyle(el);
        return [backgroundColor, color];
      });
      for (const dark of [false, true]) {
        await page.evaluate(dark => document.documentElement.classList.toggle("dark", dark), dark);
        for (const row of await menu.getByRole("button").all()) {
          await page.mouse.move(0, 0);
          const rest = await rowColors(row);
          await row.hover();
          assert.deepEqual(await rowColors(row), rest, `Profile row hover changed colors in ${dark ? "dark" : "light"} theme`);
        }
      }
      await upload.focus();
      await page.keyboard.press("Tab");
      assert(await button("Аккаунты").evaluate(el => el.matches(":focus-visible")));
      await page.keyboard.press("Tab");
      assert(await personal.evaluate(el => el.matches(":focus-visible") && getComputedStyle(el).boxShadow !== "none"));
    } else {
      await personal.focus();
    }
    await page.keyboard.press("Enter");
    await name.fill("Черновик имени");
    const addressTypography = await page.locator("#settings-profile-address").evaluate(input => {
      const prefix = input.closest('[data-slot="input-group"]').querySelector('[data-slot="input-group-addon"] span');
      return [prefix, input].map(el => {
        const { fontSize, lineHeight } = getComputedStyle(el);
        return [fontSize, lineHeight];
      });
    });
    assert.deepEqual(addressTypography, [["18px", "28px"], ["18px", "28px"]]);
    await menu.waitFor({ state: "hidden" });
    assert.equal(await photo.count(), 0);
    assert.equal(await button("Сохранить").isEnabled(), true);
    const logout = button("Выйти на этом устройстве");
    const saveBox = await button("Сохранить").boundingBox();
    const logoutBox = await logout.boundingBox();
    assert.equal(logoutBox.width, 48);
    assert.equal(logoutBox.height, 48);
    assert.equal(logoutBox.y, saveBox.y);
    assert.equal(logoutBox.x - saveBox.x - saveBox.width, 8);
    const style = await logout.evaluate(el => {
      const style = getComputedStyle(el);
      const glyph = el.querySelector("svg").getBoundingClientRect();
      const warning = document.createElement("span");
      warning.style.color = "var(--destructive)";
      el.append(warning);
      const warningColor = getComputedStyle(warning).color;
      warning.remove();
      return {
        radii: [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius],
        color: style.color,
        warningColor,
        glyph: [glyph.width, glyph.height],
        inControlBar: Boolean(el.closest("[data-control-bar]")),
      };
    });
    assert.deepEqual(style.radii, Array(4).fill("24px"));
    assert.deepEqual(style.glyph, [20, 20]);
    assert.equal(style.color, style.warningColor);
    assert.equal(style.inControlBar, true);
    if (mobile) {
      const backBox = await back.boundingBox();
      assert.equal(backBox.y, saveBox.y);
      assert.equal(saveBox.x - backBox.x - backBox.width, 8);
    }
    await page.screenshot({ path: `/tmp/rollapp-profile-inner-${width}x${height}.png` });
    if (mobile) await page.goBack();
    else await back.click();
    await menu.waitFor();
    await page.waitForFunction(() => document.activeElement?.textContent.trim() === "Персональная информация", undefined, { polling: 50 });
    assert.equal(await button("Заказы").isDisabled(), true);
    assert.equal(await button("Финансы").isDisabled(), true);
    await button("Визитка и QR-код").click();
    await page.getByRole("img", { name: "QR-код профиля Имя профиля", exact: true }).waitFor();
    await back.click();
    await menu.waitFor();
    const invites = button("Инвайты");
    await invites.click();
    await page.getByRole("heading", { name: "Инвайты", exact: true }).waitFor();
    const inviteEmail = page.getByRole("textbox", { name: "Email получателя" });
    const sendInvite = button("Отправить приглашение");
    await inviteEmail.fill("alice@example.com");
    await sendInvite.click();
    await page.getByRole("alert").filter({ hasText: "Отправка временно недоступна" }).waitFor();
    await sendInvite.click();
    await page.getByText("alice@example.com", { exact: true }).waitFor();
    assert.equal(await inviteEmail.inputValue(), "");
    const inviteAction = await sendInvite.evaluate((element) => {
      const style = getComputedStyle(element);
      return [element.getBoundingClientRect().height, parseFloat(style.borderTopLeftRadius)];
    });
    assert.equal(inviteAction[0], 48);
    assert(inviteAction[1] >= 24);
    await inviteEmail.fill("bob@example.com");
    await sendInvite.click();
    await page.getByText("bob@example.com", { exact: true }).waitFor();
    await page.screenshot({ path: `/tmp/rollapp-profile-invites-${width}x${height}.png` });
    await back.click();
    await menu.waitFor();
    await page.waitForFunction(() => document.activeElement?.textContent.trim() === "Инвайты", undefined, { polling: 50 });
    await button("OpenRouter").click();
    const apiKey = page.locator("#settings-openrouter-key");
    await apiKey.fill("fixture-draft");
    const saveOpenRouter = button("Сохранить изменения");
    const disconnectOpenRouter = button("Отключить личный ключ");
    const openRouterForm = page.locator("#settings-openrouter-form");
    const saveOpenRouterBox = await saveOpenRouter.boundingBox();
    const disconnectOpenRouterBox = await disconnectOpenRouter.boundingBox();
    assert.equal(saveOpenRouterBox.height, 48);
    assert.equal(disconnectOpenRouterBox.height, 48);
    assert.equal(disconnectOpenRouterBox.width, 48);
    assert.equal(disconnectOpenRouterBox.y, saveOpenRouterBox.y);
    assert.equal(disconnectOpenRouterBox.x - saveOpenRouterBox.x - saveOpenRouterBox.width, 8);
    const openRouterFooter = page.locator("[data-control-bar]").filter({ has: disconnectOpenRouter });
    const openRouterActions = await openRouterFooter.evaluate(footer => {
      const save = footer.querySelector("button[form]");
      const disconnect = footer.querySelector('button[aria-label="Отключить личный ключ"]');
      const radii = (button) => {
        const style = getComputedStyle(button);
        return [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomLeftRadius, style.borderBottomRightRadius];
      };
      const glyph = disconnect.querySelector("svg").getBoundingClientRect();
      const warning = document.createElement("span");
      warning.style.color = "var(--destructive)";
      disconnect.append(warning);
      const warningColor = getComputedStyle(warning).color;
      warning.remove();
      const footerStyle = getComputedStyle(footer);
      return {
        radii: [radii(save), radii(disconnect)],
        glyph: [glyph.width, glyph.height],
        form: save.form?.id,
        saveFits: save.scrollWidth <= save.clientWidth,
        outsideScrollArea: !footer.closest('[data-slot="scroll-area"]'),
        transparent: footerStyle.backgroundColor === "rgba(0, 0, 0, 0)" && footerStyle.backgroundImage === "none" && footerStyle.boxShadow === "none",
        warning: getComputedStyle(disconnect).color === warningColor,
      };
    });
    assert.deepEqual(openRouterActions, {
      radii: [Array(4).fill("24px"), Array(4).fill("24px")],
      glyph: [20, 20],
      form: "settings-openrouter-form",
      saveFits: true,
      outsideScrollArea: true,
      transparent: true,
      warning: true,
    });
    if (mobile) {
      const backBox = await back.boundingBox();
      assert.equal(backBox.y, saveOpenRouterBox.y);
      assert.equal(saveOpenRouterBox.x - backBox.x - backBox.width, 8);
      await page.evaluate(() => window.scrollTo({ top: document.scrollingElement.scrollHeight, behavior: "instant" }));
      assert.deepEqual(await saveOpenRouter.boundingBox(), saveOpenRouterBox);
      const formBox = await openRouterForm.boundingBox();
      assert(formBox.y + formBox.height <= saveOpenRouterBox.y);
    } else {
      const formBox = await openRouterForm.boundingBox();
      assert.equal(saveOpenRouterBox.x, formBox.x + 16);
      assert.equal(disconnectOpenRouterBox.x + disconnectOpenRouterBox.width, formBox.x + formBox.width - 16);
      const scrolled = await openRouterForm.evaluate(form => {
        const viewport = form.closest('[data-slot="scroll-area-viewport"]');
        viewport.scrollTo({ top: viewport.scrollHeight, behavior: "instant" });
        return viewport.scrollTop;
      });
      if (height < 500) assert(scrolled > 0);
    }
    assert.deepEqual(await disconnectOpenRouter.boundingBox(), disconnectOpenRouterBox, "OpenRouter actions moved with the fields");
    await page.screenshot({ path: `/tmp/rollapp-openrouter-actions-${width}x${height}.png` });
    await menu.waitFor({ state: "hidden" });
    await back.click();
    await button("OpenRouter").click();
    await apiKey.waitFor();
    assert.equal(await apiKey.inputValue(), "fixture-draft");
    await back.click();
    await button("Yandex ID").click();
    await page.getByText("Подключён", { exact: true }).waitFor();
    const copy = page.getByRole("link", { name: "Создать резервную копию на Яндекс Диске", exact: true });
    await page.getByText("Сохраните или отмените изменения профиля перед копированием.", { exact: true }).waitFor();
    assert.equal(await copy.count(), 0, "A profile draft must not be discarded by the OAuth redirect");
    await back.click();
    await personal.click();
    assert.equal(await name.inputValue(), "Черновик имени");
    await name.fill("");
    await button("Сохранить").click();
    assert.equal(await name.evaluate(el => !el.validity.valid && el === document.activeElement), true);
    await name.fill("Имя профиля");
    await back.click();
    await menu.waitFor();
    const geometry = await menu.getByRole("button").evaluateAll(elements => elements.map(el => {
      const r = el.getBoundingClientRect();
      return { height: r.height, overflow: el.scrollWidth > el.clientWidth, x: r.x, right: r.right };
    }));
    for (const item of geometry) {
      assert(item.height >= 48 && !item.overflow && item.x >= 0 && item.right <= width, `${width}: section control geometry`);
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.equal(await button("Выйти на этом устройстве").count(), 0);
    const finance = button("Финансы");
    const source = new URL(page.url());
    await finance.click();
    const financeTitle = page.getByRole("heading", { name: "Финансы", exact: true });
    await financeTitle.waitFor();
    await menu.waitFor({ state: "hidden" });
    assert.equal(new URL(page.url()).pathname, source.pathname);
    if (!mobile) assert.equal(page.url(), source.href);
    await page.getByText("Загружаем баланс…", { exact: true }).waitFor();
    await page.evaluate(() => window.finishWalletLoad());
    await page.getByRole("alert").filter({ hasText: "Кошелёк временно недоступен" }).waitFor();
    await button("Повторить").click();
    const balance = page.getByRole("region", { name: "Баланс роллов" });
    await balance.getByText(/23\s999\s870/).waitFor();
    const fundraiserCards = page.getByRole("region", { name: "Карты сборов" });
    await fundraiserCards.getByText("Карта сбора", { exact: true }).waitFor();
    await fundraiserCards.getByText("150 роллов · тестовый баланс", { exact: true }).waitFor();
    await page.getByRole("heading", { name: "Персональные офферы" }).waitFor();
    assert.equal(await page.getByRole("region", { name: "Подарочные карты" }).count(), 0);
    assert.equal(await page.evaluate(() => window.giftCardReads || 0), 0);
    const wallet = balance.locator("xpath=ancestor::div[contains(@class, 'rolls-page--embedded')]");
    const backBox = await back.boundingBox();
    assert.equal(backBox.width, 48);
    assert.equal(backBox.height, 48);
    assert.equal(await wallet.evaluate(element => [...element.querySelectorAll("*")].some(child => (
      child.clientWidth > 0 && child.scrollWidth > child.clientWidth + 1
    ))), false, `${width}×${height}: wallet content overflows horizontally`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `/tmp/rollapp-profile-finances-${width}x${height}.png` });
    const lastTransaction = page.locator("[data-rolls-transaction]").last();
    const scrolled = await wallet.evaluate((element, mobile) => {
      const viewport = mobile ? document.scrollingElement : element.closest('[data-slot="scroll-area-viewport"]');
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: "instant" });
      return viewport.scrollTop;
    }, mobile);
    assert(scrolled > 0);
    const lastBox = await lastTransaction.boundingBox();
    assert(lastBox.y + lastBox.height <= (mobile ? backBox.y : height));
    assert.deepEqual(await back.boundingBox(), backBox);
    const sendRolls = button("Отправить роллы");
    await sendRolls.click();
    await page.getByRole("heading", { name: "Перевод" }).waitFor();
    const continueTransfer = button("Продолжить");
    assert.equal(await continueTransfer.isDisabled(), true);
    assert(await continueTransfer.evaluate(element => element.form?.closest("[data-slot=scroll-area-viewport]")
      && !element.closest("[data-slot=scroll-area-viewport]") && element.closest("[data-control-bar]")));
    const returnToWallet = button("К кошельку");
    const returnBox = await returnToWallet.boundingBox();
    assert.equal(returnBox.width, 48);
    assert.equal(returnBox.height, 48);
    await returnToWallet.focus();
    await page.keyboard.press("Enter");
    await balance.getByText(/23\s999\s870/).waitFor();
    assert(await sendRolls.evaluate(element => document.activeElement === element), "Returning to the wallet must restore focus to the transfer opener");
    if (mobile && width === 320) await page.goBack();
    else if (width === 1440) await page.keyboard.press("Escape");
    else await back.click();
    await menu.waitFor();
    await page.waitForFunction(() => document.activeElement?.textContent.trim() === "Финансы", undefined, { polling: 50 });
    assert.equal(page.url(), source.href);
    const gifts = button("Подарочные карты");
    const giftList = page.getByRole("region", { name: "Подарочные карты" });
    const business = giftList.getByRole("link", { name: "Магазин", exact: true });
    await gifts.click();
    await giftList.waitFor();
    await business.waitFor();
    assert.equal(await page.getByRole("heading", { name: "Подарочные карты", exact: true }).count(), 1);
    assert.equal(await balance.count(), 0);
    assert.equal(new URL(page.url()).pathname, source.pathname);
    if (!mobile) assert.equal(page.url(), source.href);
    await page.evaluate(() => document.fonts.ready);
    const openCard = giftList.getByRole("button", { name: "Открыть карту", exact: true });
    const giftBox = await openCard.boundingBox();
    const giftBackBox = await back.boundingBox();
    assert.equal(giftBox.height, 48);
    assert(giftBox.x >= 0 && giftBox.x + giftBox.width <= width);
    assert(giftBox.y + giftBox.height <= (mobile ? giftBackBox.y : height));
    assert.deepEqual([giftBackBox.width, giftBackBox.height], [48, 48]);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `/tmp/rollapp-profile-gift-cards-${width}x${height}.png` });
    await openCard.click();
    const card = page.getByRole("heading", { name: "Подарочная карта", exact: true });
    await card.waitFor();
    await page.getByRole("button", { name: "Магазин · 100 роллов", pressed: true }).waitFor();
    await button(mobile ? "Назад" : "Закрыть подарочную карту").click();
    await card.waitFor({ state: "hidden" });
    await giftList.waitFor();
    if (mobile && width === 320) await page.goBack();
    else await back.click();
    await menu.waitFor();
    await page.waitForFunction(() => document.activeElement?.textContent.trim() === "Подарочные карты");
    assert.equal(page.url(), source.href);
    const giftExit = width === 320 || width === 1440;
    const destination = giftExit ? "/fixture-shop" : "/app/orders";
    if (giftExit) {
      await gifts.click();
      await business.click();
    } else await button("Заказы").click();
    await page.waitForURL(url => url.pathname === destination && !url.searchParams.has("formScreen"));
    await menu.waitFor({ state: "hidden" });
    await page.goBack();
    await page.waitForURL(url => url.pathname === "/__profile-settings" && !url.searchParams.has("formScreen"));
    if (giftExit) {
      await page.goto(`${origin}/__profile-settings?state=gifts-empty`);
      await gifts.click();
      await giftList.getByText("Полученные и выпущенные карты появятся здесь.").waitFor();
      await page.goto(`${origin}/__profile-settings?state=gifts-error`);
      await gifts.click();
      await giftList.getByRole("status").filter({ hasText: "Загружаем карты…" }).waitFor();
      await page.evaluate(() => window.finishGiftLoad());
      await giftList.getByText("Подарочные карты временно недоступны").waitFor();
      await giftList.getByRole("button", { name: "Повторить", exact: true }).click();
      await business.waitFor();
    }
    await page.goto(`${origin}/__profile-settings?state=error`);
    await button("OpenRouter").click();
    await page.getByRole("alert").filter({ hasText: "Fixture settings unavailable" }).waitFor();
    await back.click();
    await button("Yandex ID").click();
    await page.getByText("Подключение Yandex ID сейчас недоступно.", { exact: true }).waitFor();
    await page.goto(`${origin}/__profile-settings?state=backup`);
    await button("Yandex ID").click();
    await copy.waitFor();
    const backupHref = new URL(await copy.getAttribute("href"), origin);
    assert.equal(backupHref.pathname, "/api/auth/yandex/start");
    assert.equal(backupHref.searchParams.get("link"), "1");
    assert.equal(backupHref.searchParams.get("next"), "/__profile-settings?state=backup");
    const copyGeometry = await copy.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        height: rect.height,
        onScreen: rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight,
        fits: element.scrollWidth <= element.clientWidth,
        footer: Boolean(element.closest("[data-control-bar]")),
      };
    });
    assert.deepEqual(copyGeometry, { height: 48, onScreen: true, fits: true, footer: true });
    if (height === 400 || width === 1440) await page.screenshot({ path: `/tmp/rollapp-yandex-settings-${width}x${height}.png` });
    await page.goto(`${origin}/__profile-settings?state=disk-profile`);
    await button("Yandex ID").click();
    const activateDisk = button("Хранить профиль на Диске");
    await activateDisk.waitFor();
    assert(await activateDisk.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return box.width >= 48 && box.height >= 48 && box.left >= 0 && box.right <= innerWidth;
    }));
    assert.equal(await page.evaluate(() => window.diskProfileAttempts), undefined);
    await activateDisk.click();
    await page.getByRole("alert").filter({ hasText: "Диск временно недоступен" }).waitFor();
    await activateDisk.click();
    await page.getByText("Профиль хранится на Яндекс Диске.", { exact: true }).waitFor();
    assert.equal(await activateDisk.count(), 0);
    if (width === 390 && height === 844 || width === 1440 && height === 900) {
      await page.screenshot({ path: `/tmp/rollapp-disk-profile-${width}.png` });
    }
    await page.goto(`${origin}/__profile-settings?state=save`);
    await personal.click();
    await name.fill("Сохранённое имя");
    await button("Сохранить").click();
    await page.getByRole("status").filter({ hasText: "Сохранённое имя" }).waitFor();
    assert.equal(new URL(page.url()).searchParams.has("formScreen"), false);
    await page.goto(`${origin}/__profile-settings?state=avatar`);
    await personal.click();
    await name.fill("");
    await back.click();
    const fileInput = photo.locator('input[type="file"]');
    await fileInput.setInputFiles({ name: "photo.txt", mimeType: "text/plain", buffer: Buffer.from("invalid") });
    await photo.getByText("Подойдёт изображение JPG, PNG или WEBP.").waitFor();
    const avatarFile = { name: "avatar.png", mimeType: "image/png", buffer: pixel };
    if (width === 320) {
      await page.evaluate(() => { window.rejectAvatarSave = true; });
      await fileInput.setInputFiles(avatarFile);
      await photo.getByText("Fixture rejected photo").waitFor();
      await page.waitForFunction(() => window.rejectedAvatarReleased === true);
      assert.equal(await photo.locator("img").count(), 0);
      await page.evaluate(() => { window.rejectAvatarSave = false; });
    }
    const chooserPromise = page.waitForEvent("filechooser");
    if (width === 1440) await upload.press("Space");
    else await upload.locator('[data-slot="avatar"]').click();
    const chooser = await chooserPromise;
    await chooser.setFiles(avatarFile);
    await page.locator("output").filter({ hasText: "Фото сохранено" }).waitFor({ state: "attached" });
    assert.equal(await savePhoto.count(), 0);
    await menu.waitFor();
    await photo.locator("img").waitFor();
    assert.equal(await photo.getByRole("alert").count(), 0);
    await personal.click();
    assert.equal(await name.inputValue(), "");
    if (width === 320 || (width === 1440 && height === 900)) {
      await page.goto(`${origin}/__profile-settings?state=openrouter`);
      await button("OpenRouter").click();
      await saveOpenRouter.waitFor();
      assert.equal(await saveOpenRouter.isDisabled(), true);
      await apiKey.fill("sk-or-v1-fixture_test_key");
      await page.getByRole("combobox", { name: "Модель", exact: true }).press("Enter");
      assert.equal(await apiKey.inputValue(), "sk-or-v1-fixture_test_key");
      await apiKey.press("Enter");
      await page.getByText(/Сохранён ключ …fixture-saved\./).waitFor();
      assert.equal(await apiKey.inputValue(), "");
      assert.equal(await saveOpenRouter.isDisabled(), true);
      await disconnectOpenRouter.click();
      await button("Подключить OpenRouter").waitFor();
      assert.equal(await disconnectOpenRouter.count(), 0);
      assert.equal(await page.getByRole("alert").count(), 0);
    }
    await page.goto(`${origin}/__profile-settings?state=mcp`);
    const shortMobile = width === 390 && height === 400;
    if (shortMobile) await page.evaluate(() => { window.rejectMcpKeyList = true; });
    await button("Ключи MCP").click();
    const keys = page.getByRole("region", { name: "Ключи доступа MCP" });
    const writeScope = keys.getByRole("switch", { name: "Разрешить запись" });
    const createKey = button("Создать ключ");
    const secret = keys.getByRole("textbox", { name: "Новый ключ MCP" });
    if (shortMobile) {
      await keys.getByRole("alert").getByText("Ключи временно недоступны").waitFor();
      await button("Повторить").click();
    }
    await createKey.waitFor();
    await keys.getByText("Активных ключей пока нет.").waitFor();
    assert.equal(await writeScope.getAttribute("aria-checked"), "false");
    const createBox = await createKey.boundingBox();
    assert(createBox.x >= 0 && createBox.x + createBox.width <= width && createBox.height >= 48);
    await createKey.click();
    await secret.waitFor();
    const readToken = `rwmcp_read_${"x".repeat(43)}`;
    assert.equal(await secret.inputValue(), readToken);
    const keyMetadata = keys.getByText(/Только чтение · до/);
    assert.deepEqual(await keyMetadata.evaluate((element) => {
      const { fontSize, lineHeight } = getComputedStyle(element);
      return [fontSize, lineHeight];
    }), ["13px", "16px"]);
    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text) => { window.copiedMcpKey = text; } } });
    });
    await button("Скопировать ключ").click();
    await keys.getByRole("status").getByText("Ключ скопирован").waitFor();
    assert.equal(await page.evaluate(() => window.copiedMcpKey), readToken);
    if (width === 1440 && height === 900) {
      await writeScope.click();
      await createKey.click();
      await keys.getByText("Чтение и запись", { exact: false }).waitFor();
      assert.deepEqual(await page.evaluate(() => window.mcpKeyRequests), ["read", "write"]);
      assert.equal(await writeScope.getAttribute("aria-checked"), "false");
    }
    await page.screenshot({ path: `/tmp/rollapp-profile-mcp-${width}x${height}.png` });
    if (mobile) {
      const lastKey = keys.getByRole("listitem").last();
      await lastKey.evaluate((element) => element.scrollIntoView({ block: "end", behavior: "instant" }));
      const [lastBox, backBox] = await Promise.all([lastKey.boundingBox(), back.boundingBox()]);
      assert(lastBox.y + lastBox.height <= backBox.y + 1);
    }
    await back.click();
    await menu.waitFor();
    await button("Ключи MCP").click();
    const revoke = button("Отозвать ключ …00000001");
    await revoke.waitFor();
    assert.equal(await secret.count(), 0);
    await revoke.click();
    const confirmRevoke = page.getByRole("alertdialog", { name: "Отозвать ключ MCP?" });
    await confirmRevoke.getByRole("button", { name: "Отозвать ключ …00000001" }).click();
    await revoke.waitFor({ state: "detached" });
    await back.click();
    await menu.waitFor();
    const result = mobile ? "permission" : "complete";
    await page.clock.install();
    await page.goto(`${origin}/login?state=backup-result&auth_success=YANDEX_LINKED&backup=f589bf34-5586-4456-aea6-83223dbbd052&result=${result}`);
    await page.getByRole("status").filter({ hasText: "Готовим резервную копию." }).waitFor();
    await page.waitForFunction(() => window.backupStatusRequested === true);
    await page.evaluate(() => { window.backupReady = true; });
    await page.clock.runFor(2_500);
    const nextAction = page.getByRole("link", { name: mobile ? "Повторить копирование" : "Открыть папку ROLLAPP", exact: true });
    await nextAction.waitFor();
    assert.equal(await page.locator(".mobile-app-navigation, .planning-fab-controls").count(), 0);
    const returnLink = page.getByRole("link", { name: "Вернуться в Rollapp", exact: true });
    for (const link of [nextAction, returnLink]) {
      await link.scrollIntoViewIfNeeded();
      assert(await link.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
      }), "Authentication result actions must remain reachable in a short viewport");
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    if (height === 400) await page.screenshot({ path: `/tmp/rollapp-yandex-result-${width}x${height}.png` });
    assert.deepEqual(errors, []);
    console.log(`PASS profile sections ${width}x${height}: photo, Back, drafts, finance, MCP keys and Yandex backup result (${result})`);
    await page.close();
  }
} finally { await browser.close(); await server.close(); }
