import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium } from "playwright-core";
import { browserLaunchOptions } from "./browser-runtime.mjs";
import { listenSmokeServer, smokeOrigin } from "./smoke-server.mjs";

const server = await createServer({ cacheDir: "node_modules/.vite-calendar-sync", server: { host: "127.0.0.1", port: 0, hmr: false, watch: null }, plugins: [{ name: "calendar-sync-fixture", configureServer(vite) {
  vite.middlewares.use(async (req, res, next) => {
    if (!req.url.startsWith("/__calendar-sync")) return next();
    res.setHeader("Content-Type", "text/html");
    res.end(await vite.transformIndexHtml(req.url, '<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/calendar-sync.jsx"></script></body></html>'));
  });
} }] });
await listenSmokeServer(server);
const browser = await chromium.launch(browserLaunchOptions());
try {
  for (const width of [320, 390, 767, 768, 820, 1024, 1440, 1920]) for (const height of [900, 400]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: width === 390 ? 3 : 1, reducedMotion: "reduce", permissions: ["clipboard-read", "clipboard-write"] });
    const page = await context.newPage(), errors = [];
    page.setDefaultTimeout(15000);
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/api/**", route => { errors.push(`Unexpected API ${route.request().url()}`); return route.abort(); });
    await page.goto(`${smokeOrigin(server)}/__calendar-sync?date=2026-10-25&view=month`);
    const sync = page.getByRole("button", { name: "Синхронизация с Apple Calendar", exact: true });
    await sync.waitFor(); await page.evaluate(() => document.fonts.ready);
    const state = async () => JSON.parse(await page.locator("[data-state]").textContent());
    const control = await page.locator(".schedule-toolbar").evaluate(toolbar => {
      const rect = element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
      const buttons = [...toolbar.querySelectorAll("button")].filter(element => element.getBoundingClientRect().width);
      const actions = [...toolbar.querySelectorAll(".schedule-window-actions > button")];
      return { overflow: document.documentElement.scrollWidth > innerWidth, buttons: buttons.map(rect), actions: actions.map(element => ({ ...rect(element), icon: rect(element.querySelector("svg")), radius: getComputedStyle(element).borderRadius })) };
    });
    assert(!control.overflow, `Root overflow ${width}x${height}`);
    for (const b of control.buttons) assert(b.x >= -0.5 && b.right <= width + 0.5 && b.height === 48, `Toolbar bounds ${width}: ${JSON.stringify(b)}`);
    assert.equal(control.actions.length, 2);
    for (const b of control.actions) { assert.equal(b.width, 48); assert.equal(b.height, 48); assert.equal(b.icon.width, 20); assert(parseFloat(b.radius) >= 24); }
    assert.equal(control.actions[1].x - control.actions[0].right, 8); assert.equal(control.actions[0].y, control.actions[1].y);
    for (let a = 0; a < control.buttons.length; a++) for (let b = a + 1; b < control.buttons.length; b++) {
      const one = control.buttons[a], two = control.buttons[b];
      assert(!(one.x < two.right - 0.5 && two.x < one.right - 0.5 && one.y < two.bottom - 0.5 && two.y < one.bottom - 0.5), `Overlapping controls ${width}`);
    }
    await page.screenshot({ path: `/tmp/rollapp-calendar-sync-toolbar-${width}-${height}.png` });
    const toggle = async name => page.locator(`[data-${name}]`).evaluate(button => button.click());
    const close = async () => { await page.getByRole("button", { name: width < 768 ? "Назад" : "Закрыть синхронизацию", exact: true }).click(); await page.locator("[data-calendar-sync]").waitFor({ state: "hidden" }); };
    await toggle("fail-read"); await sync.click();
    await page.getByText("Не удалось загрузить подключение", { exact: true }).waitFor();
    assert.equal((await state()).writes.length, 0);
    await toggle("fail-read"); await page.getByRole("button", { name: "Повторить", exact: true }).click();
    await page.getByRole("button", { name: "Подключить", exact: true }).waitFor();
    await toggle("fail-write"); await page.getByRole("button", { name: "Подключить", exact: true }).click();
    await page.getByText("Не удалось подключить устройство", { exact: true }).waitFor();
    assert.equal((await state()).writes.length, 0);
    await toggle("fail-write"); await toggle("hold");
    await page.getByRole("button", { name: "Подключить", exact: true }).click();
    assert(await page.getByRole("button", { name: "Подключить", exact: true }).isDisabled());
    const dismiss = page.getByRole("button", { name: width < 768 ? "Назад" : "Закрыть синхронизацию", exact: true });
    if (width < 768) {
      await dismiss.click(); await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert(await page.locator("[data-calendar-sync]").isVisible(), "Back interrupted an in-flight connection");
    } else assert(await dismiss.isDisabled());
    await toggle("release");
    const link = page.getByLabel("Код подключения устройства", { exact: true }); await link.waitFor();
    const original = await link.inputValue();
    assert.equal((await state()).writes.length, 1);
    const openLink = page.getByRole("link", { name: "Открыть Rollapp Calendar" });
    assert.equal(await openLink.getAttribute("href"), original);
    await page.getByRole("button", { name: "Копировать код", exact: true }).click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), original);
    await toggle("device-sync"); await page.getByRole("button", {name:"Проверить обновление",exact:true}).click();
    await page.getByText(/Последнее обновление:/).waitFor();
    assert.equal((await state()).writes.length, 1, "Reading device state caused a write");
    await page.screenshot({ path: `/tmp/rollapp-calendar-sync-connected-${width}-${height}.png` });
    const geometry = await page.locator("[data-calendar-sync]").evaluate(surface => {
      const footer = surface.querySelector("footer, [data-slot='drawer-footer']"), box = footer.getBoundingClientRect(), action = footer.querySelector("a");
      return { overflow: document.documentElement.scrollWidth > innerWidth, footer: { top: box.top, bottom: box.bottom }, action: { text: action.textContent, color: getComputedStyle(action).color, background: getComputedStyle(action).backgroundColor, height: action.getBoundingClientRect().height, radii: ["borderTopLeftRadius", "borderTopRightRadius", "borderBottomLeftRadius", "borderBottomRightRadius"].map(key => parseFloat(getComputedStyle(action)[key])) } };
    });
    assert(!geometry.overflow); assert.equal(geometry.action.height, 48); assert(geometry.action.radii.every(radius => radius >= 24));
    assert.equal(geometry.action.text, "Открыть приложение"); assert.notEqual(geometry.action.color, geometry.action.background);
    assert(geometry.footer.top >= 0 && geometry.footer.bottom <= height + 1);
    await close(); await sync.click(); await link.waitFor();
    assert.equal((await state()).writes.length, 1, "Opening the sheet recreated the connection");
    await close();
    await page.getByRole("tab", {name:"День",exact:true}).click();
    const imported = page.locator('[data-calendar-event="apple-device:fixture"]'); await imported.waitFor();
    assert.equal(await imported.locator(".schedule-resize").count(),0);
    assert.equal(await imported.locator(".schedule-event").getAttribute("draggable"),"false");
    await imported.locator(".schedule-event").click();
    await page.locator(".schedule-preview[data-open]").getByText(/Изменяйте это событие/).waitFor();
    assert.equal(await page.locator(".schedule-preview[data-open]").getByRole("button").count(),0);
    await page.keyboard.press("Escape"); await sync.click(); await link.waitFor();
    await page.getByRole("button", { name: "Отключить устройство", exact: true }).click();
    await toggle("fail-write"); await page.getByRole("button", { name: "Отключить", exact: true }).click();
    await page.getByText("Не удалось отключить устройство", { exact: true }).waitFor(); assert(await link.isVisible());
    await toggle("fail-write"); await page.getByRole("button", { name: "Отключить", exact: true }).click();
    await link.waitFor({ state: "hidden" }); assert.equal((await state()).writes.length, 2);
    await close();
    assert(!new URL(page.url()).searchParams.has("form"));
    await page.getByRole("button", { name: "Новая задача в календаре", exact: true }).click(); assert.equal((await state()).created, 1);
    assert.deepEqual(errors, []);
    console.log(`PASS calendar-sync ${width}x${height}`);
    await context.close();
  }
} finally { await browser.close(); await server.close(); }
