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
    const trigger = name => page.getByRole("button", { name, exact: true });
    const personal = trigger("Персональная информация");
    await personal.waitFor();
    for (const name of ["Персональная информация", "OpenRouter", "Yandex ID", "Заказы"]) assert.equal(await trigger(name).count(), 1);
    await page.locator("#settings-profile-name").fill("Черновик имени");
    await personal.click();
    await page.locator("#settings-profile-name").waitFor({ state: "hidden" });
    await page.screenshot({ path: `/tmp/rollapp-profile-menu-${width}x${height}.png`, fullPage: true });
    await trigger("OpenRouter").focus();
    await page.keyboard.press("Enter");
    const key = page.locator("#settings-openrouter-key");
    await key.fill("unsaved-key");
    await trigger("OpenRouter").click();
    await trigger("OpenRouter").click();
    assert.equal(await key.inputValue(), "unsaved-key");
    await trigger("Yandex ID").click();
    await page.getByText("Подключён", { exact: true }).waitFor();
    await trigger("Заказы").click();
    const ordersCopy = page.getByText("История покупок, доставка и возврат товаров.", { exact: true });
    assert.deepEqual(await ordersCopy.evaluate(el => { const s = getComputedStyle(el); return [s.fontSize, s.lineHeight]; }), ["18px", "28px"]);
    const orders = page.locator('a[href="/app/orders"]');
    assert.equal(await orders.getAttribute("aria-disabled"), "true");
    await personal.click();
    assert.equal(await page.locator("#settings-profile-name").inputValue(), "Черновик имени");
    await page.locator("#settings-profile-name").fill("");
    await personal.click();
    await trigger("Сохранить").click();
    assert.equal(await personal.getAttribute("aria-expanded"), "true");
    assert.equal(await page.locator("#settings-profile-name").evaluate(el => el === document.activeElement), true);
    await page.locator("#settings-profile-name").fill("Имя профиля");
    await orders.waitFor();
    assert.notEqual(await orders.getAttribute("aria-disabled"), "true");
    assert.equal(await orders.getAttribute("href"), "/app/orders");
    const geometry = await page.locator('[data-slot="accordion-trigger"]').evaluateAll(elements => elements.map(el => {
      const r = el.getBoundingClientRect();
      return { height: r.height, overflow: el.scrollWidth > el.clientWidth, x: r.x, right: r.right };
    }));
    for (const item of geometry) {
      assert(item.height >= 48 && !item.overflow && item.x >= 0 && item.right <= width, `${width}: section control geometry`);
    }
    // Geometry follows the completed accordion layout, including reduced-motion transitions.
    await page.locator('[data-slot="accordion-content"]').evaluateAll(elements => Promise.all(
      elements.flatMap(el => el.getAnimations({ subtree: true })).filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})),
    ));
    const logout = trigger("Выйти из аккаунта");
    await logout.scrollIntoViewIfNeeded();
    const logoutBox = await logout.boundingBox();
    const footer = page.locator('[data-native-form-actions]:visible, .app-form-actions:visible').last();
    const footerBox = await footer.boundingBox();
    assert(logoutBox.y + logoutBox.height <= footerBox.y + 1, `${width}: logout cannot scroll above actions ${JSON.stringify({ logoutBox, footerBox })}`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert.equal(overflow, false, `${width}: root overflow`);
    await page.screenshot({ path: `/tmp/rollapp-profile-${width}x${height}.png`, fullPage: true });
    await orders.click();
    assert.equal(new URL(page.url()).pathname, "/app/orders");
    assert.equal(await page.locator(".profile-settings-dialog").count(), 0);
    await page.goto(`${origin}/__profile-settings?state=error`);
    await trigger("OpenRouter").click();
    await page.getByRole("alert").filter({ hasText: "Fixture settings unavailable" }).waitFor();
    await trigger("Yandex ID").click();
    await page.getByText("Подключение Yandex ID сейчас недоступно.", { exact: true }).waitFor();
    assert.deepEqual(errors, []);
    console.log(`PASS profile sections ${width}x${height}: drafts, validation, Yandex, order navigation, no API writes`);
    await page.close();
  }
} finally { await browser.close(); await server.close(); }
