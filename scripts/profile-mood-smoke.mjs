import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { browserLaunchOptions } from "./browser-runtime.mjs";
import { listenSmokeServer, smokeOrigin } from "./smoke-server.mjs";
import { smokeBaseUiDependencies } from "./smoke-dependencies.mjs";
import { MOOD_LEVELS, NEUTRAL_MOOD_LEVEL } from "../shared/modules/profile/profile-mood.js";

const screenshotDir = process.env.ROLLAPP_MOOD_SCREENSHOTS;
if (screenshotDir) await mkdir(screenshotDir, { recursive: true });

async function assertUncoloredAvatar(avatar) {
  assert.deepEqual(await avatar.evaluate((element) => {
    const glow = getComputedStyle(element, "::before");
    return [element.hasAttribute("data-profile-mood"), glow.boxShadow, glow.animationName];
  }), [false, "none", "none"]);
}

async function assertMoodTiles(rail, mood, expectedCount) {
  await rail.evaluate(async (element) => {
    await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => {})));
  });
  const tiles = await rail.locator("[data-list-tile]").evaluateAll((elements) => elements.map((element) => {
    const style = getComputedStyle(element);
    return {
      focused: element.matches('[aria-pressed="true"], [data-tile-preview-selected]'),
      accent: style.getPropertyValue("--list-tile-accent").trim(),
      gradient: style.backgroundImage,
      border: style.boxShadow,
      size: [element.offsetWidth, element.offsetHeight],
    };
  }));
  assert.equal(tiles.length, expectedCount);
  for (const tile of tiles) {
    assert.equal(tile.accent, mood.color);
    assert.match(tile.gradient, /^radial-gradient/);
    assert.deepEqual(tile.size, [130, 100]);
  }
  const selected = tiles.filter((tile) => tile.focused);
  const other = tiles.filter((tile) => !tile.focused);
  assert.equal(selected.length, 1);
  assert(other.every((tile) => tile.gradient === other[0].gradient && tile.border === other[0].border),
    `Tile color must not depend on its position: ${JSON.stringify(tiles)}`);
  assert.notEqual(selected[0].gradient, other[0].gradient, "The selected tile keeps stronger paint");
  assert.notEqual(selected[0].border, other[0].border);
  return other[0].gradient;
}

const neutral = MOOD_LEVELS[NEUTRAL_MOOD_LEVEL - 1];
const great = MOOD_LEVELS[4];

const server = await createServer({
  cacheDir: "node_modules/.vite-profile-mood",
  optimizeDeps: { include: smokeBaseUiDependencies },
  server: { host: "127.0.0.1", port: 0, hmr: false, watch: null },
  plugins: [{ name: "profile-mood-fixture", enforce: "pre", transform(source, id) {
    if (!id.endsWith("/src/App.jsx?profile-mood-smoke")) return;
    return `${source}\nexport { PersistentProfileHero } from \"./modules/profile/profile-hero.jsx\";\nexport { ProfileEditorProvider } from \"./modules/profile/profile-editor.jsx\";\nexport { SessionProvider, useSession } from \"./modules/auth/session.jsx\";\nexport { ToastContext } from \"./modules/shell/toast.jsx\";`;
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
    const preview = page.locator(".mood-settings__tiles");
    const ownerTiles = page.locator("[data-wishlist-list-navigation]");
    const ownerPortrait = owner.locator(".wishes-page__hero-avatar");
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
    await page.getByText(/все плитки списков окрасятся в один цвет/).waitFor();
    assert(await submit.isDisabled());
    const colors = new Set();
    for (const [i, mood] of MOOD_LEVELS.entries()) {
      if (i === 0) await radios.nth(i).click();
      else await page.keyboard.press("ArrowRight");
      assert.equal(await radios.nth(i).getAttribute("aria-checked"), "true");
      colors.add(await assertMoodTiles(preview, mood, 2));
    }
    assert.equal(colors.size, 5, "Each mood must produce a different tint");
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
    assert.equal(await owner.getByText(/^Настроение:/).count(), 0);
    if (photo) await ownerPortrait.locator('[data-slot="avatar-image"]').waitFor();
    await assertUncoloredAvatar(ownerPortrait);
    await assertMoodTiles(ownerTiles, great, 3);
    await ownerTiles.locator("[data-list-tile]").nth(1).click();
    await assertMoodTiles(ownerTiles, great, 3);
    assert.equal(await ownerTiles.locator("[data-list-tile]").nth(1).getAttribute("aria-pressed"), "true");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await assertMoodTiles(ownerTiles, great, 3);
    if (width === 1440) {
      await page.emulateMedia({ forcedColors: "active" });
      assert.deepEqual(await ownerTiles.locator("[data-list-tile]").evaluateAll(tiles => tiles.map(tile => getComputedStyle(tile).backgroundImage)), ["none", "none", "none"]);
      const active = ownerTiles.locator('[aria-pressed="true"]');
      assert.equal(await active.evaluate(tile => {
        const sample = tile.appendChild(document.createElement("span"));
        sample.style.cssText = "background-color: Highlight; forced-color-adjust: none";
        const activePaint = getComputedStyle(tile).backgroundColor;
        const highlight = getComputedStyle(sample).backgroundColor;
        sample.remove();
        return activePaint === highlight;
      }), true);
      await page.emulateMedia({ forcedColors: "none" });
    }
    await page.emulateMedia({ reducedMotion: "no-preference" });
    if (screenshotDir && [390, 1440].includes(width) && height > 400) await page.screenshot({ path: `${screenshotDir}/published-${width}.png` });
    await open.click();
    await moodSection.click();
    await page.getByRole("radio", { name: "Нейтрально", exact: true }).click();
    await submit.click();
    await page.getByText("Отметка добавлена в журнал", { exact: true }).waitFor();
    assert.equal(await list.locator("li").first().getByText("Нейтрально", { exact: true }).count(), 1);
    await assertMoodTiles(preview, neutral, 2);
    await radios.first().click();
    if (width < 768) await page.goBack(); else await page.keyboard.press("Escape");
    await closeMenu();
    await open.waitFor();
    await assertUncoloredAvatar(ownerPortrait);
    await assertMoodTiles(ownerTiles, neutral, 3);
    assert.equal(await owner.getByText(/^Настроение:/).count(), 0);
    const calls = await page.evaluate(() => window.__moodSaves);
    assert.deepEqual(calls, [calls[0], calls[0], calls[2]]);
    assert.deepEqual(Object.keys(calls[0]), ["entry"]);
    assert.equal(calls[0].entry.level, 5);
    assert.equal(calls[2].entry.level, NEUTRAL_MOOD_LEVEL);
    assert.notEqual(calls[0].entry.requestId, calls[2].entry.requestId);
    await page.reload();
    await ownerPortrait.waitFor();
    await assertUncoloredAvatar(ownerPortrait);
    await assertMoodTiles(ownerTiles, neutral, 3);
    if (screenshotDir && photo) await page.screenshot({ path: `${screenshotDir}/neutral-owner-${width}.png` });
    // The photo and initials use different portrait CSS. Exercise both.
    for (const scenario of ["", "&published", ...(width === 1440 ? ["&visitor", "&visitor&published"] : [])]) {
      const published = scenario.includes("&published");
      await page.goto(`${smokeOrigin(server)}/__profile-mood?guest${scenario}${photo ? "&photo" : ""}`);
      const profile = page.locator("[data-friend-profile]");
      await profile.getByRole("heading", { name: "Александра", exact: true }).waitFor();
      const portrait = profile.locator(".wishes-page__hero-avatar");
      await assertUncoloredAvatar(portrait);
      assert.equal(await profile.getByText(/^Настроение:/).count(), 0);
      assert.equal(await page.getByRole("heading", { name: "Журнал настроения" }).count(), 0);
      if (photo) {
        const image = profile.locator('[data-slot="avatar-image"]');
        await image.waitFor();
        assert(await image.evaluate((el) => el.complete && el.naturalWidth > 0));
      }
      const tiles = page.locator("[data-public-collection] [data-wishlist-list-navigation]");
      await assertMoodTiles(tiles, published ? great : neutral, 3);
      assert(await profile.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (published && screenshotDir && [390, 1440].includes(width) && height > 400)
        await page.screenshot({ path: `${screenshotDir}/guest-${width}.png` });
    }
    assert.deepEqual(errors, []);
    console.log(`PASS ${width}×${height}: 5 levels, preview, retry, private log, one tile tint per level, no avatar halo, public color and neutral fallback, cancel, 48px controls`);
    await page.close();
  }
} finally { await browser.close(); await server.close(); }
