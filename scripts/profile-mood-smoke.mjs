import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { browserLaunchOptions } from "./browser-runtime.mjs";
import { listenSmokeServer, smokeOrigin } from "./smoke-server.mjs";
import { smokeBaseUiDependencies } from "./smoke-dependencies.mjs";
import { MOOD_LEVELS, NEUTRAL_MOOD_LEVEL } from "../shared/profile-mood.js";

const screenshotDir = process.env.ROLLAPP_MOOD_SCREENSHOTS;
if (screenshotDir) await mkdir(screenshotDir, { recursive: true });

async function assertMoodGlow(avatar, { reduced = false } = {}) {
  const paint = await avatar.evaluate((element) => {
    const glow = getComputedStyle(element, "::before");
    return {
      border: getComputedStyle(element).borderTopColor,
      overlay: getComputedStyle(element, "::after").display,
      shadow: glow.boxShadow,
      layer: glow.zIndex,
      animation: glow.animationName,
    };
  });
  assert.equal(paint.border, "rgba(0, 0, 0, 0)");
  assert.equal(paint.overlay, "none");
  assert.match(paint.shadow, /(?:oklch|color\(|rgba?\()/);
  assert.equal(paint.layer, "-1");
  assert.equal(paint.animation, reduced ? "none" : "profile-mood-breathe");
}

async function assertNoGlow(avatar) {
  assert.deepEqual(await avatar.evaluate((element) => {
    const glow = getComputedStyle(element, "::before");
    return [element.hasAttribute("data-profile-mood"), glow.boxShadow, glow.animationName];
  }), [false, "none", "none"]);
}

const server = await createServer({
  cacheDir: "node_modules/.vite-profile-mood",
  optimizeDeps: { include: smokeBaseUiDependencies },
  server: { host: "127.0.0.1", port: 0, hmr: false, watch: null },
  plugins: [{ name: "profile-mood-fixture", enforce: "pre", transform(source, id) {
    if (!id.endsWith("/src/App.jsx?profile-mood-smoke")) return;
    return `${source}\nexport { PersistentProfileHero, ProfileEditorProvider, SessionProvider, ToastContext, useSession };`;
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
    const photo = width === 390 && height === 844 || width === 1440;
    await page.goto(`${smokeOrigin(server)}/__profile-mood?${history ? "history&" : ""}${photo ? "photo" : ""}`);
    const owner = page.locator("[data-persistent-profile]");
    const open = owner.getByRole("button", { name: "Редактировать профиль Александра" });
    const submit = page.getByRole("button", { name: "Сохранить настроение" });
    const visible = page.getByRole("switch", { name: "Показывать посетителям профиля" });
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
    }
    const radios = page.getByRole("radio");
    assert.equal(await radios.count(), 5);
    assert.equal(await visible.count(), 0);
    await page.getByText(/цветное настроение видно всем посетителям/).waitFor();
    assert(await submit.isDisabled());
    for (const [i, mood] of MOOD_LEVELS.entries()) {
      if (i === 0) await radios.nth(i).click();
      else await page.keyboard.press("ArrowRight");
      assert.equal(await radios.nth(i).getAttribute("aria-checked"), "true");
      if (mood.level === NEUTRAL_MOOD_LEVEL) await assertNoGlow(preview);
      else {
        assert.equal(await preview.getAttribute("data-profile-mood"), String(mood.level));
        await assertMoodGlow(preview);
      }
    }
    const geometry = await page.evaluate(() => {
      const boxes = [...document.querySelectorAll('[role="radio"]')].map((node) => node.getBoundingClientRect().toJSON());
      const footer = document.querySelector("form [data-control-bar]");
      const save = footer.querySelector('[type="submit"]');
      const hint = document.querySelector("#profile-mood-visibility");
      return { boxes, screen: { width: innerWidth, height: innerHeight }, root: document.documentElement.scrollWidth,
        button: save.getBoundingClientRect().toJSON(), radius: getComputedStyle(save).borderTopLeftRadius,
        hintFont: getComputedStyle(hint).fontSize, hintLeading: getComputedStyle(hint).lineHeight,
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
    assert.equal(geometry.hintFont, "13px");
    assert.equal(geometry.hintLeading, "16px");
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
    const avatar = owner.locator("[data-profile-mood='5']");
    await avatar.waitFor();
    await owner.getByText("Настроение: отлично", { exact: true }).waitFor();
    if (photo) await avatar.locator('[data-slot="avatar-image"]').waitFor();
    await assertMoodGlow(avatar);
    const [dimmed, bright] = await avatar.evaluate((element) => {
      const animation = element.getAnimations({ subtree: true }).find(({ animationName }) => animationName === "profile-mood-breathe");
      animation.pause();
      const frames = [0, animation.effect.getTiming().duration / 2].map((time) => {
        animation.currentTime = time;
        const { opacity, transform } = getComputedStyle(element, "::before");
        return { opacity: Number(opacity), transform };
      });
      animation.play();
      return frames;
    });
    assert(bright.opacity > dimmed.opacity);
    assert.notEqual(bright.transform, dimmed.transform);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await assertMoodGlow(avatar, { reduced: true });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    if (screenshotDir && [390, 1440].includes(width) && height > 400) await page.screenshot({ path: `${screenshotDir}/published-${width}.png` });
    await open.click();
    await moodSection.click();
    await page.getByRole("radio", { name: "Нейтрально", exact: true }).click();
    await submit.click();
    await page.getByText("Отметка добавлена в журнал", { exact: true }).waitFor();
    assert.equal(await list.locator("li").first().getByText("Нейтрально", { exact: true }).count(), 1);
    await assertNoGlow(preview);
    await radios.first().click();
    if (width < 768) await page.goBack(); else await page.keyboard.press("Escape");
    await closeMenu();
    await open.waitFor();
    const ownerPortrait = owner.locator(".wishes-page__hero-avatar");
    await assertNoGlow(ownerPortrait);
    assert.equal(await owner.locator(".profile-mood-caption").count(), 0);
    const calls = await page.evaluate(() => window.__moodSaves);
    assert.deepEqual(calls, [calls[0], calls[0], calls[2]]);
    assert.deepEqual(Object.keys(calls[0]), ["entry"]);
    assert.equal(calls[0].entry.level, 5);
    assert.equal(calls[2].entry.level, NEUTRAL_MOOD_LEVEL);
    assert.notEqual(calls[0].entry.requestId, calls[2].entry.requestId);
    await page.reload();
    await ownerPortrait.waitFor();
    await assertNoGlow(ownerPortrait);
    if (screenshotDir && photo) await page.screenshot({ path: `${screenshotDir}/neutral-owner-${width}.png` });
    // The photo and initials use different portrait CSS. Exercise both.
    for (const scenario of ["", "&neutral", "&published"]) {
      const published = scenario === "&published";
      await page.goto(`${smokeOrigin(server)}/__profile-mood?guest${scenario}${photo ? "&photo" : ""}`);
      const profile = page.locator("[data-friend-profile]");
      await profile.getByRole("heading", { name: "Александра", exact: true }).waitFor();
      const portrait = profile.locator("[data-profile-mood='5']");
      assert.equal(await portrait.count(), Number(published));
      assert.equal(await profile.getByText("Настроение: отлично", { exact: true }).count(), Number(published));
      assert.equal(await page.getByRole("heading", { name: "Журнал настроения" }).count(), 0);
      if (photo) {
        const image = profile.locator('[data-slot="avatar-image"]');
        await image.waitFor();
        assert(await image.evaluate((el) => el.complete && el.naturalWidth > 0));
      }
      if (published) {
        await assertMoodGlow(portrait);
        assert(await profile.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        if (screenshotDir && [390, 1440].includes(width) && height > 400) await page.screenshot({ path: `${screenshotDir}/guest-${width}.png` });
      } else await assertNoGlow(profile.locator(".wishes-page__hero-avatar"));
    }
    assert.deepEqual(errors, []);
    console.log(`PASS ${width}×${height}: 5 levels, preview, retry, private log, automatic glow, neutral without glow, cancel, 48px controls`);
    await page.close();
  }
} finally { await browser.close(); await server.close(); }
