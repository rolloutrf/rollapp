import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { browserLaunchOptions } from "./browser-runtime.mjs";
import { listenSmokeServer, smokeOrigin, smokePort } from "./smoke-server.mjs";
import { smokeBaseUiDependencies } from "./smoke-dependencies.mjs";

const server = await createServer({
  cacheDir: "node_modules/.vite-profile-accounts-smoke",
  optimizeDeps: { include: [...smokeBaseUiDependencies, "react-router-dom", "lucide-react", "input-otp", "sonner"] },
  server: { host: "127.0.0.1", port: smokePort(), hmr: false, watch: null },
  plugins: [{
    name: "profile-accounts-fixture",
    enforce: "pre",
    transform(source, id) {
      if (id.endsWith("/src/App.jsx?account-smoke")) {
        return source + "\nexport { AppProfileButton, AuthPage, MobileFormPages, ProfileEditorProvider, SessionProvider, ToastProvider, useSession };";
      }
    },
    configureServer(vite) {
      vite.middlewares.use(async (req, res, next) => {
        if (!/^\/(app\/wishes|login)?(?:\?|$)/.test(req.url)) return next();
        res.setHeader("Content-Type", "text/html");
        res.end(await vite.transformIndexHtml(req.url, '<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/profile-accounts.jsx"></script></body></html>'));
      });
    },
  }],
});
await listenSmokeServer(server);
const origin = smokeOrigin(server);
const browser = await chromium.launch(browserLaunchOptions());
const personal = { id: "personal", username: "personal", name: "Личный аккаунт", accountType: "personal" };
const business = { id: "business", username: "business-username-with-long-suffix", name: "Бизнес аккаунт с длинным названием для узкого экрана", accountType: "business" };
const errors = [];

async function fixture(viewport, accountCount = 2) {
  const context = await browser.newContext({ viewport, hasTouch: viewport.width < 768, isMobile: viewport.width < 768, reducedMotion: "reduce" });
  context.setDefaultTimeout(12_000);
  let active = personal;
  const extra = Array.from({ length: Math.max(0, accountCount - 2) }, (_, index) => ({
    id: `extra-${index}`, username: `extra-${index}`, name: `Сохранённый аккаунт ${index + 1}`, accountType: "personal",
  }));
  let remembered = accountCount === 1 ? [personal] : [personal, business, ...extra];
  let staleWrites = 0;
  let failList = false;
  let cancelYandex = true;
  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const { pathname, searchParams } = new URL(request.url());
    const method = request.method();
    const reply = (json, status = 200) => route.fulfill({ json, status });
    const expected = request.headers()["x-rollapp-account"];
    if (expected && active && expected !== active.id) {
      if (method === "PATCH") staleWrites++;
      return reply({ code: "ACTIVE_ACCOUNT_CHANGED" }, 409);
    }
    if (pathname === "/api/me" && method === "GET") return reply({ user: active });
    if (pathname === "/api/me/openrouter") return reply({ available: false, configured: false });
    if (pathname === "/api/me/openrouter/models") return reply({ models: [] });
    if (pathname === "/api/auth/yandex/config") return reply({ enabled: true, legacySignInEnabled: false });
    if (pathname === "/api/auth/accounts" && method === "GET" && expected === active?.id) {
      if (failList) {
        failList = false;
        return reply({ error: "Список временно недоступен" }, 503);
      }
      return reply({ accounts: [active, ...remembered.filter(({ id }) => id !== active.id)].map((user) => ({ ...user, active: user.id === active.id })), maxAccounts: 5 });
    }
    if (pathname === "/api/auth/yandex/start" && method === "GET" && searchParams.get("add_account") === "1" && active?.id === personal.id) {
      assert.equal(searchParams.get("next"), "/app/wishes?space=products");
      if (cancelYandex) {
        cancelYandex = false;
        searchParams.set("auth_error", "YANDEX_CANCELLED");
        return route.fulfill({ status: 303, headers: { Location: `/login?${searchParams}` } });
      }
      remembered = [personal, business];
      active = business;
      return route.fulfill({ status: 303, headers: { Location: "/app/wishes" } });
    }
    if (pathname === "/api/auth/accounts/switch" && method === "POST" && expected === active?.id) {
      active = remembered.find(({ id }) => id === request.postDataJSON().accountId);
      assert(active);
      return reply({ ok: true });
    }
    if (pathname === "/api/auth/accounts/business" && method === "DELETE" && expected === personal.id) {
      remembered = [personal];
      return reply({ ok: true });
    }
    if (pathname === "/api/auth/logout" && method === "POST" && expected === active?.id) {
      active = null;
      remembered = [];
      return reply({ ok: true });
    }
    errors.push(`Unexpected API request: ${method} ${pathname}`);
    return route.abort();
  });
  context.on("page", (page) => page.on("pageerror", (error) => errors.push(error.message)));
  return { context, failNextList: () => { failList = true; }, staleWrites: () => staleWrites };
}

const home = (page, user = personal) => page.getByRole("button", { name: `Редактировать профиль ${user.name}`, exact: true });
const section = (page) => page.getByRole("region", { name: "Аккаунты на этом устройстве" });
const toggle = (page) => page.getByRole("button", { name: "Аккаунты", exact: true });
const switchTo = (page, account) => page.getByRole("button", { name: `Переключиться на @${account.username}`, exact: true });
const addAccount = (page) => page.getByRole("link", { name: "Добавить аккаунт", exact: true });

async function footerGeometry(add) {
  return add.evaluate((button) => {
    const footer = button.closest('[data-slot="drawer-footer"], [data-native-form-actions]');
    const popup = footer.closest('[data-slot="drawer-content"]');
    const { top, bottom, left, right, height } = button.getBoundingClientRect();
    const style = getComputedStyle(button);
    return {
      top, bottom, left, right, height,
      radius: [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomLeftRadius, style.borderBottomRightRadius],
      drawerBottomGap: popup ? popup.getBoundingClientRect().bottom - footer.getBoundingClientRect().bottom : null,
      native: footer.hasAttribute("data-native-form-actions"),
      back: footer.querySelector('button[aria-label="Назад"]')?.getBoundingClientRect().top ?? null,
      outsideListScroll: !button.closest('[data-slot="scroll-area-viewport"]'),
      hit: button.contains(document.elementFromPoint((left + right) / 2, (top + bottom) / 2)),
    };
  });
}

async function checkAccountRows(page, width) {
  const accounts = section(page);
  const rows = accounts.getByRole("listitem");
  const current = rows.first();
  const saved = rows.last();
  const remove = saved.getByRole("button", { name: `Убрать @${business.username} с этого устройства` });
  const background = (locator) => locator.evaluate(async node => {
    getComputedStyle(node).backgroundColor;
    await Promise.all(node.getAnimations().map(animation => animation.finished.catch(() => {})));
    const color = getComputedStyle(node).backgroundColor;
    const context = document.createElement("canvas").getContext("2d");
    context.fillStyle = color;
    context.fillRect(0, 0, 1, 1);
    return [...context.getImageData(0, 0, 1, 1).data].join(",");
  });
  assert.deepEqual(await rows.evaluateAll(nodes => nodes.map(node => {
    const style = getComputedStyle(node);
    return [style.borderBlockStartWidth, style.borderBlockEndWidth];
  })), [["0px", "0px"], ["0px", "0px"]]);
  assert.equal(await remove.locator("svg.lucide-trash-2").count(), 1);
  assert(await remove.evaluate(node => {
    const { width, height } = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return width === 48 && height === 48 &&
      [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomLeftRadius, style.borderBottomRightRadius]
        .every(radius => parseFloat(radius) >= 24);
  }));
  if (width < 768) return;
  const heading = page.getByRole("heading", { name: "Аккаунты", exact: true });
  assert.equal(await heading.evaluate(node =>
    getComputedStyle(node.closest('[data-slot="drawer-header"]')).borderBlockEndWidth), "0px");

  const resting = await background(saved);
  const activeResting = await background(current);
  const switchButton = switchTo(page, business);
  await switchButton.hover();
  const highlighted = await background(saved);
  assert.notEqual(highlighted, resting);
  assert.equal(await background(switchButton), "0,0,0,0");
  assert.equal(await background(current), activeResting);
  await remove.hover();
  assert.equal(await background(saved), highlighted);
  assert.equal(await background(current), activeResting);
  if (process.env.ROLLAPP_ACCOUNT_SCREENSHOTS && width === 1440) {
    await accounts.screenshot({ path: `${process.env.ROLLAPP_ACCOUNT_SCREENSHOTS}/rollapp-accounts-hover-1440.png` });
  }
  await heading.hover();
  assert.equal(await background(saved), resting);
  await page.keyboard.press("Tab");
  await remove.focus();
  await page.waitForFunction(() => document.activeElement?.matches(":focus-visible"));
  assert.equal(await background(saved), highlighted);
}

async function openAccounts(page, user) {
  await home(page, user).click();
  await toggle(page).click();
}

try {
  for (const [width, height] of [[320, 568], [390, 844], [390, 400], [768, 900], [820, 900], [1024, 768], [1440, 900], [1920, 1080]]) {
    const { context } = await fixture({ width, height });
    try {
      const page = await context.newPage();
      await page.goto(origin + "/app/wishes?space=products");
      await openAccounts(page);
      await section(page).getByText("Активный аккаунт", { exact: true }).waitFor({ state: "attached" });
      const add = addAccount(page);
      await add.waitFor();
      const footer = await footerGeometry(add);
      assert.equal(await section(page).getByRole("link", { name: "Добавить аккаунт" }).count(), 0);
      assert.equal(footer.height, 48);
      assert.deepEqual(footer.radius, Array(4).fill("24px"));
      assert(footer.outsideListScroll && footer.hit);
      assert.equal(footer.native, width < 768);
      if (footer.native) {
        assert.equal(footer.back, footer.top);
        assert(footer.bottom <= height && height - footer.bottom < 40);
      } else {
        assert(Math.abs(footer.drawerBottomGap) < 1);
        assert(footer.bottom <= height && height - footer.bottom < 40);
      }
      for (const control of [switchTo(page, business), add]) {
        const box = await control.boundingBox();
        assert(box && box.height >= 48 && box.x >= 0 && box.x + box.width <= width, `${width}x${height}: invalid account control bounds ${JSON.stringify(box)}`);
      }
      const dimensions = await section(page).evaluate((element) => ({
        available: element.clientWidth,
        scroll: element.scrollWidth,
        document: document.documentElement.scrollWidth,
      }));
      assert(dimensions.scroll <= dimensions.available && dimensions.document <= width, JSON.stringify(dimensions));
      assert.equal(new URL(await add.getAttribute("href"), origin).searchParams.get("next"), "/app/wishes?space=products");
      await checkAccountRows(page, width);
      if (process.env.ROLLAPP_ACCOUNT_SCREENSHOTS && ((width === 390 && height === 844) || width === 1440)) {
        await page.screenshot({ path: `${process.env.ROLLAPP_ACCOUNT_SCREENSHOTS}/rollapp-accounts-${width}.png` });
      }
      console.log(`PASS ${width}x${height}: account list, current marker, long account names, borderless rows, trash, fixed footer and return path`);
    } finally {
      await context.close();
    }
  }
  for (const width of [390, 1024]) {
    const { context } = await fixture({ width, height: 250 }, 4);
    try {
      const page = await context.newPage();
      await page.goto(origin + "/app/wishes");
      await openAccounts(page);
      const add = addAccount(page);
      await add.waitFor();
      const initial = await footerGeometry(add);
      const lastRow = section(page).getByRole("listitem").last();
      const scroll = (top) => lastRow.evaluate((row, top) => {
        const owner = row.closest('[data-slot="scroll-area-viewport"]') || document.scrollingElement;
        owner.scrollTo({ top, behavior: "instant" });
        return owner.scrollTop;
      }, top);
      assert(await scroll(10_000) > 0, "Short screen should scroll account rows");
      assert.deepEqual(await footerGeometry(add), initial);
      assert((await lastRow.boundingBox()).y + (await lastRow.boundingBox()).height <= initial.top + 1);
      assert.equal(await scroll(0), 0);
      assert.deepEqual(await footerGeometry(add), initial);
      console.log(`PASS ${width}x250: footer stays in place while scrolling to the last account and back`);
    } finally {
      await context.close();
    }
  }
  {
    const { context } = await fixture({ width: 390, height: 400 }, 5);
    try {
      const page = await context.newPage();
      await page.goto(origin + "/app/wishes");
      await openAccounts(page);
      await section(page).getByText("Чтобы добавить аккаунт, уберите один из сохранённых.").waitFor();
      assert.equal(await addAccount(page).count(), 0);
      await page.getByRole("button", { name: "Назад", exact: true }).click();
      await toggle(page).waitFor();
    } finally {
      await context.close();
    }
  }
  const { context, failNextList, staleWrites } = await fixture({ width: 390, height: 844 }, 1);
  try {
    const page = await context.newPage();
    await page.goto(origin + "/app/wishes?space=products");
    failNextList();
    await openAccounts(page);
    await section(page).getByText("Список временно недоступен").waitFor();
    await section(page).getByRole("button", { name: "Повторить" }).click();
    await addAccount(page).click();
    await page.getByRole("heading", { name: "Добавить аккаунт" }).waitFor();
    const yandex = page.getByRole("link", { name: "Войти с помощью Яндекс ID", exact: true });
    await yandex.waitFor();
    assert.equal(new URL(await yandex.getAttribute("href"), origin).searchParams.get("add_account"), "1");
    assert.equal(await page.locator(".auth-form input, .auth-method-switch, .auth-password-link, .auth-form .or").count(), 0);
    await page.getByRole("link", { name: "Отмена", exact: true }).click();
    await home(page).waitFor();
    assert.equal(new URL(page.url()).search, "?space=products");

    const stale = await context.newPage();
    await stale.goto(origin + "/app/wishes");
    await home(stale).click();
    await stale.getByRole("button", { name: "Персональная информация" }).click();
    await stale.getByLabel("Имя", { exact: true }).fill("Черновик старой вкладки");
    await openAccounts(page);
    await addAccount(page).click();
    await yandex.click();
    await page.getByText("Вход через Яндекс отменён", { exact: true }).waitFor();
    await yandex.click();
    await home(page, business).waitFor();
    await stale.locator("#profile-editor-form").evaluate((element) => element.requestSubmit());
    await home(stale, business).waitFor();
    assert.equal(staleWrites(), 1);
    await stale.close();
    await openAccounts(page, business);
    await switchTo(page, personal).click();
    await home(page).waitFor();
    await openAccounts(page);
    await section(page).getByRole("button", { name: `Убрать @${business.username} с этого устройства` }).click();
    await switchTo(page, business).waitFor({ state: "detached" });
    await page.getByRole("button", { name: "Назад", exact: true }).click();
    await page.getByRole("button", { name: "Персональная информация" }).click();
    await page.getByRole("button", { name: "Выйти на этом устройстве", exact: true }).click();
    await page.getByText("Нет активного аккаунта").waitFor();
    console.log("PASS: retry, cancel, Yandex-only add, OAuth cancellation/retry, switch back, stale tab write guard, remove, logout");
  } finally {
    await context.close();
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await server.close();
}
