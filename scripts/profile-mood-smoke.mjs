import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { browserLaunchOptions } from "./browser-runtime.mjs";
import { listenSmokeServer, smokeOrigin } from "./smoke-server.mjs";
import { smokeBaseUiDependencies } from "./smoke-dependencies.mjs";
import { MOOD_LEVELS } from "../shared/profile-mood.js";

const screenshotDir = process.env.ROLLAPP_MOOD_SCREENSHOTS;
if (screenshotDir) await mkdir(screenshotDir, { recursive: true });
const server = await createServer({
  cacheDir: "node_modules/.vite-profile-mood",
  optimizeDeps: { include: smokeBaseUiDependencies },
  server: { host: "127.0.0.1", port: 0, hmr: false, watch: null },
  plugins: [{ name: "profile-mood-fixture", enforce: "pre", transform(source, id) {
    if (!id.endsWith("/src/App.jsx?profile-mood-smoke")) return;
    return `${source}\nexport { ProfileSettingsModal, ToastContext, SessionContext };`;
  }, configureServer(vite) {
    vite.middlewares.use(async (req, res, next) => {
      if (!req.url.startsWith("/__profile-mood")) return next();
      res.setHeader("Content-Type", "text/html");
      res.end(await vite.transformIndexHtml(req.url, '<!doctype html><html lang="ru" class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/profile-mood.jsx"></script></body></html>'));
    });
  } }],
});
await listenSmokeServer(server);
const browser = await chromium.launch(browserLaunchOptions());
try {
  for (const [width, height] of [[320, 800], [390, 844], [390, 400], [768, 844], [820, 844], [1024, 768], [1024, 400], [1440, 900], [1920, 1080]]) {
    const history = width === 390 || width === 1440;
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: width < 768 ? 3 : 1 });
    page.setDefaultNavigationTimeout(90_000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", (route) => { errors.push(`unexpected API request: ${new URL(route.request().url()).pathname}`); return route.abort(); });
    await page.goto(`${smokeOrigin(server)}/__profile-mood${history ? "?history" : ""}`);
    const open = page.getByRole("button", { name: "Открыть настроение" });
    const submit = page.getByRole("button", { name: "Сохранить настроение" });
    const visible = page.getByRole("switch", { name: "Показывать в профиле" });
    const preview = page.locator(".mood-settings__portrait");
    const list = page.getByRole("list", { name: "Отметки настроения" });
    await open.click();
    const moodSection = page.getByRole("button", { name: "Настроение", exact: true });
    await moodSection.click();
    if (history) {
      await page.getByText("Не удалось загрузить журнал", { exact: true }).waitFor();
      await page.getByRole("button", { name: "Повторить" }).click();
      const more = page.getByRole("button", { name: "Показать предыдущие" });
      await more.click();
      await page.waitForFunction(() => document.querySelectorAll(".mood-settings__history li").length === 24);
      await more.waitFor({ state: "hidden" });
    } else {
      await page.getByText("Здесь появятся ваши отметки с датой и временем.").waitFor();
      assert(await visible.isDisabled());
    }
    const radios = page.getByRole("radio");
    assert.equal(await radios.count(), 5);
    assert(await submit.isDisabled());
    for (const [i, mood] of MOOD_LEVELS.entries()) {
      if (i === 0) await radios.nth(i).click();
      else await page.keyboard.press("ArrowRight");
      await page.waitForFunction((level) => document.querySelector(".mood-settings__portrait")?.dataset.profileMood === level, String(mood.level));
      assert.equal(await radios.nth(i).getAttribute("aria-checked"), "true");
      assert.match(await preview.evaluate((el) => getComputedStyle(el).boxShadow), /rgb|okl/);
    }
    const geometry = await page.evaluate(() => {
      const boxes = [...document.querySelectorAll('[role="radio"]')].map((node) => node.getBoundingClientRect().toJSON());
      const footer = document.querySelector("form [data-control-bar]");
      const save = footer.querySelector('[type="submit"]');
      const label = document.querySelector('[role="switch"]').closest('label');
      return { boxes, screen: { width: innerWidth, height: innerHeight }, root: document.documentElement.scrollWidth,
        button: save.getBoundingClientRect().toJSON(), radius: getComputedStyle(save).borderTopLeftRadius,
        bodyFont: getComputedStyle(label).fontSize, bodyLeading: getComputedStyle(label).lineHeight,
        nestedScroll: !!document.querySelector('form [data-slot="scroll-area-viewport"]') };
    });
    assert(geometry.root <= width, `root overflow ${width}`);
    for (const [i, box] of geometry.boxes.entries()) {
      assert.equal(box.height, 48); assert.equal(box.width, 48);
      assert(box.x >= 0 && box.right <= width, `scale fits ${width}`);
      if (i) assert(box.x >= geometry.boxes[i - 1].right - 1, `scale items collide ${width}`);
    }
    assert.equal(geometry.button.height, 48);
    assert.equal(geometry.radius, "24px");
    assert.equal(geometry.bodyFont, "18px");
    assert.equal(geometry.bodyLeading, "28px");
    assert(geometry.button.bottom <= height + 1);
    assert.equal(geometry.nestedScroll, width >= 768);
    if (width < 768) assert.equal(await page.getByRole("button", { name: "Назад", exact: true }).count(), 1);
    if (screenshotDir && [390, 1440].includes(width) && height > 400) await page.screenshot({ path: `${screenshotDir}/settings-${width}.png` });
    await submit.click();
    await page.getByText("Не удалось сохранить отметку", { exact: true }).waitFor();
    await submit.click();
    await page.getByText("Отметка добавлена в журнал", { exact: true }).waitFor();
    assert.equal(await list.locator("li").first().locator("time").getAttribute("datetime"), "2026-11-13T10:30:00Z");
    const back = page.getByRole("button", { name: "Назад", exact: true });
    const closeMenu = async () => {
      await moodSection.waitFor();
      await page.getByRole("button", { name: width < 768 ? "Назад" : "Закрыть", exact: true }).click();
    };
    const close = async () => { await back.click(); await closeMenu(); };
    await close();
    await open.waitFor();
    assert.equal(await page.locator("[data-test-profile] [data-profile-mood]").count(), 0);
    await open.click();
    await moodSection.click();
    await visible.click();
    await submit.click();
    await page.getByText("Видимость обновлена", { exact: true }).waitFor();
    await close();
    await page.getByText("Настроение: отлично", { exact: true }).waitFor();
    const avatar = page.locator("[data-test-profile] [data-profile-mood='5']");
    const border = await avatar.evaluate((el) => getComputedStyle(el).borderTopColor);
    assert.equal(border, "rgb(242, 184, 78)");
    if (screenshotDir && [390, 1440].includes(width) && height > 400) await page.screenshot({ path: `${screenshotDir}/published-${width}.png` });
    await open.click();
    await moodSection.click();
    await visible.click();
    await submit.click();
    await page.getByText("Видимость обновлена", { exact: true }).waitFor();
    await radios.first().click();
    if (width < 768) await page.goBack(); else await page.keyboard.press("Escape");
    await closeMenu();
    await open.waitFor();
    assert.equal(await page.locator("[data-test-profile] [data-profile-mood]").count(), 0);
    const calls = await page.evaluate(() => window.__moodSaves);
    assert.deepEqual(calls, [calls[0], calls[0], { published: true }, { published: false }]);
    assert.equal(calls[0].entry.level, 5);
    for (const published of [false, true]) {
      await page.goto(`${smokeOrigin(server)}/__profile-mood?guest${published ? "&published" : ""}`);
      const profile = page.locator("[data-friend-profile]");
      await profile.getByRole("heading", { name: "Александра", exact: true }).waitFor();
      const portrait = profile.locator("[data-profile-mood='5']");
      assert.equal(await portrait.count(), Number(published));
      assert.equal(await profile.getByText("Настроение: отлично", { exact: true }).count(), Number(published));
      assert.equal(await page.getByRole("heading", { name: "Журнал настроения" }).count(), 0);
      if (published) {
        assert.match(await portrait.evaluate((el) => getComputedStyle(el).boxShadow), /242, 184, 78/);
        assert(await profile.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        if (screenshotDir && [390, 1440].includes(width) && height > 400) await page.screenshot({ path: `${screenshotDir}/guest-${width}.png` });
      }
    }
    assert.deepEqual(errors, []);
    console.log(`PASS ${width}×${height}: 5 levels, preview, retry, private log, publish/hide, cancel, 48px controls`);
    await page.close();
  }
} finally { await browser.close(); await server.close(); }
