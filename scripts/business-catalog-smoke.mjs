import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { browserLaunchOptions } from "./browser-runtime.mjs";
import { listenSmokeServer, smokeOrigin } from "./smoke-server.mjs";

const output = await mkdtemp(join(tmpdir(), "rollapp-business-catalog-"));
const server = await createServer({ cacheDir: "node_modules/.vite-business-catalog", server: { host: "127.0.0.1", port: 0, hmr: false, watch: null }, plugins: [{
  name: "business-catalog-fixture",
  configureServer(vite) {
    vite.middlewares.use(async (request, response, next) => {
      if (!request.url.startsWith("/__business-catalog")) return next();
      response.setHeader("Content-Type", "text/html");
      response.end(await vite.transformIndexHtml(request.url, '<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/business-catalog.jsx"></script></body></html>'));
    });
  },
}] });
await listenSmokeServer(server);
const origin = `${smokeOrigin(server)}/__business-catalog`;
const browser = await chromium.launch(browserLaunchOptions());
try {
  for (const [width, height] of [[320, 844], [390, 844], [768, 844], [820, 844], [1024, 844], [1440, 900], [1920, 1080], [390, 400]]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: width < 768 ? 3 : 1 });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/api/**", route => { errors.push("Unexpected real API request"); return route.abort(); });
    const sphere = width >= 768;
    const name = sphere ? "Студия" : "Витрина студии";
    await page.goto(`${origin}?${sphere ? "sphere" : "wishlist"}${width === 320 || width === 1920 ? "&light" : ""}`);
    const grid = page.getByRole("list", { name: "Бизнес-аккаунты" });
    const cards = grid.getByRole("listitem");
    const card = cards.first();
    const profile = card.getByRole("link", { name: `Открыть профиль ${name} (@example-studio)`, exact: true });
    const follow = card.getByRole("button", { name: `Подписаться · ${name}` });
    await profile.waitFor();
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await cards.count(), 3);
    assert.equal(await cards.last().getByRole("button").count(), 0);
    assert.equal(await profile.getAttribute("href"), sphere ? "/example-studio" : "/example-studio/products");
    const columns = await grid.evaluate(node => getComputedStyle(node).gridTemplateColumns.split(" ").length);
    assert.equal(columns, width >= 1024 ? 3 : width >= 640 ? 2 : 1);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    for (const item of await cards.all()) {
      const bounds = await item.evaluate(node => {
        const avatar = node.querySelector('[data-slot="avatar"]').getBoundingClientRect();
        const title = node.querySelector("strong").getBoundingClientRect();
        const footer = node.querySelector("footer");
        const button = footer?.querySelector("button");
        const style = button && getComputedStyle(button);
        return {
          fits: node.scrollWidth <= node.clientWidth + 1,
          radius: getComputedStyle(node).borderRadius,
          avatarSize: avatar.width,
          titleBelowAvatar: title.top > avatar.bottom,
          divider: footer && getComputedStyle(footer).borderTopWidth,
          action: style && [button.offsetHeight, style.paddingInlineStart, style.paddingInlineEnd, parseFloat(style.borderRadius) >= button.offsetHeight / 2],
        };
      });
      assert(bounds.fits && bounds.titleBelowAvatar);
      assert.equal(bounds.radius, width <= 560 ? "21px" : "24px");
      assert.equal(bounds.avatarSize, width <= 560 ? 54 : 60);
      if (bounds.action) {
        assert.equal(bounds.divider, "1px");
        assert.deepEqual(bounds.action, [48, "24px", "24px", true]);
      }
    }
    await grid.screenshot({ path: join(output, `${width}x${height}.png`), animations: "disabled" });
    await follow.click();
    assert.equal(await follow.getAttribute("aria-busy"), "true");
    assert(await follow.isDisabled());
    await card.getByRole("alert").waitFor();
    await follow.click();
    await card.getByRole("button", { name: `Отписаться · ${name}` }).click();
    await follow.waitFor();
    assert.deepEqual(await page.evaluate(() => window.followCalls), [true, true, false]);
    assert.equal(await page.locator("[data-location]").textContent(), "/");
    await page.keyboard.press("Tab");
    await profile.focus();
    assert.equal(await profile.evaluate(node => getComputedStyle(node, "::after").outlineStyle), "solid");
    await page.keyboard.press("Enter");
    await page.waitForFunction((path) => document.querySelector("[data-location]").textContent === path, sphere ? "/example-studio" : "/example-studio/products");
    const secondCard = cards.nth(1);
    await secondCard.scrollIntoViewIfNeeded();
    const cardBox = await secondCard.boundingBox();
    await page.mouse.click(cardBox.x + 12, cardBox.y + 12);
    await page.waitForFunction(() => document.querySelector("[data-location]").textContent.startsWith("/very-long-business-account"));
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`PASS ${width}x${height}: card geometry, profile, subscription, retry, read-only, keyboard`);
  }
  const page = await browser.newPage();
  await page.route("**/api/**", route => route.abort());
  await page.goto(`${origin}?loading`);
  await page.getByRole("status").getByText(/Загружаем/).waitFor();
  await page.goto(`${origin}?empty`);
  await page.getByText("В этом разделе пока нет бизнес-аккаунтов").waitFor();
  await page.goto(`${origin}?error`);
  await page.getByRole("alert").waitFor();
  await page.getByRole("button", { name: "Повторить" }).click();
  await page.getByRole("list", { name: "Бизнес-аккаунты" }).waitFor();
  console.log(`PASS loading, empty and catalog retry. Screenshots: ${output}`);
} finally {
  await browser.close();
  await server.close();
}
