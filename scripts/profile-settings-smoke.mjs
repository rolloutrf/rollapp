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
    if (!req.url.startsWith("/__profile-settings")) return next();
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
    await page.goto(`${origin}/__profile-settings`);
    const button = (name) => page.getByRole("button", { name, exact: true });
    const menu = page.getByRole("navigation", { name: "Разделы профиля" });
    const personal = button("Персональная информация");
    const back = button("Назад");
    const name = page.getByRole("textbox", { name: "Имя", exact: true });
    const mobile = width < 768;
    await menu.waitFor();
    assert.equal(await menu.getByRole("button").count(), 4);
    assert.equal(await menu.locator("[aria-expanded]").count(), 0);
    await page.screenshot({ path: `/tmp/rollapp-profile-menu-${width}x${height}.png` });
    await personal.focus();
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
    assert.equal(await button("Сохранить").isEnabled(), true);
    const logout = button("Выйти из аккаунта");
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
    await button("OpenRouter").click();
    const apiKey = page.locator("#settings-openrouter-key");
    await apiKey.fill("fixture-draft");
    const saveOpenRouter = button("Сохранить настройки OpenRouter");
    const disconnectOpenRouter = button("Отключить личный ключ");
    const saveOpenRouterBox = await saveOpenRouter.boundingBox();
    const disconnectOpenRouterBox = await disconnectOpenRouter.boundingBox();
    const openRouterBox = await page.locator(".openrouter-settings").boundingBox();
    assert.equal(saveOpenRouterBox.x, openRouterBox.x);
    assert.equal(disconnectOpenRouterBox.x, openRouterBox.x);
    assert.equal(saveOpenRouterBox.width, openRouterBox.width);
    assert.equal(disconnectOpenRouterBox.width, openRouterBox.width);
    assert(saveOpenRouterBox.height >= 48 && disconnectOpenRouterBox.height >= 48);
    assert.equal(disconnectOpenRouterBox.y - saveOpenRouterBox.y - saveOpenRouterBox.height, 8);
    await disconnectOpenRouter.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `/tmp/rollapp-openrouter-actions-${width}x${height}.png` });
    await menu.waitFor({ state: "hidden" });
    await back.click();
    await button("OpenRouter").click();
    await apiKey.waitFor();
    assert.equal(await apiKey.inputValue(), "fixture-draft");
    await back.click();
    await button("Yandex ID").click();
    await page.getByText("Подключён", { exact: true }).waitFor();
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
    assert.equal(await button("Выйти из аккаунта").count(), 0);
    await button("Заказы").click();
    await page.waitForURL(url => url.pathname === "/app/orders" && !url.searchParams.has("formScreen"));
    await menu.waitFor({ state: "hidden" });
    await page.goBack();
    await page.waitForURL(url => url.pathname === "/__profile-settings" && !url.searchParams.has("formScreen"));
    await page.goto(`${origin}/__profile-settings?state=error`);
    await button("OpenRouter").click();
    await page.getByRole("alert").filter({ hasText: "Fixture settings unavailable" }).waitFor();
    await back.click();
    await button("Yandex ID").click();
    await page.getByText("Подключение Yandex ID сейчас недоступно.", { exact: true }).waitFor();
    await page.goto(`${origin}/__profile-settings?state=save`);
    await personal.click();
    await name.fill("Сохранённое имя");
    await button("Сохранить").click();
    await page.getByRole("status").filter({ hasText: "Сохранённое имя" }).waitFor();
    assert.equal(new URL(page.url()).searchParams.has("formScreen"), false);
    assert.deepEqual(errors, []);
    console.log(`PASS profile sections ${width}x${height}: menu, Back, drafts, validation and orders`);
    await page.close();
  }
} finally { await browser.close(); await server.close(); }
