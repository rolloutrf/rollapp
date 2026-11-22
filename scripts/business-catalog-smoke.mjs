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
    const allow = card.getByRole("button", { name: `Открыть потребности · ${name}`, exact: true });
    const block = card.getByRole("button", { name: `Закрыть потребности · ${name}`, exact: true });
    await profile.waitFor();
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await cards.count(), 4);
    assert.equal(await cards.last().getByRole("button").count(), 0);
    assert.equal(await profile.getAttribute("href"), sphere ? "/example-studio" : "/example-studio/products");
    const columns = await grid.evaluate(node => getComputedStyle(node).gridTemplateColumns.split(" ").length);
    assert.equal(columns, width <= 350 ? 1 : width <= 760 ? 2 : width <= 1080 ? 3 : 4);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    for (const item of await cards.all()) {
      const bounds = await item.evaluate(node => {
        const avatar = node.querySelector('[data-slot="avatar"]').getBoundingClientRect();
        const identity = node.querySelector(".business-catalog-card__identity");
        const title = identity.querySelector("strong").getBoundingClientRect();
        const handle = identity.querySelector("span").getBoundingClientRect();
        const trigger = node.querySelector("button");
        const button = trigger?.getBoundingClientRect();
        const frame = node.getBoundingClientRect();
        return {
          aligned: [title, handle].every(box => Math.abs(box.left - avatar.left) <= 1),
          textAlign: getComputedStyle(identity).textAlign,
          inset: avatar.left - frame.left,
          ordered: avatar.bottom < title.top && title.bottom <= handle.top,
          accent: getComputedStyle(node).getPropertyValue("--contact-accent"),
          background: getComputedStyle(node).backgroundImage,
          fits: node.scrollWidth <= node.clientWidth + 1,
          radius: getComputedStyle(node).borderRadius,
          avatarSize: avatar.width,
          action: button && [button.height, parseFloat(getComputedStyle(trigger).borderRadius) >= 24, trigger.scrollWidth <= trigger.clientWidth + 1],
          actionFits: !button || (button.top >= handle.bottom && button.left >= frame.left && button.right <= frame.right),
        };
      });
      assert(bounds.fits && bounds.aligned && bounds.ordered, JSON.stringify(bounds));
      assert.equal(bounds.textAlign, "start");
      assert.equal(bounds.inset, width <= 560 ? 16 : 21);
      assert.match(bounds.accent, /^#[0-9a-f]{6}$/);
      assert.match(bounds.background, /^radial-gradient/);
      assert.equal(bounds.radius, width <= 560 ? "21px" : "24px");
      assert.equal(bounds.avatarSize, width <= 560 ? 54 : 60);
      if (bounds.action) {
        assert(bounds.actionFits, JSON.stringify(bounds));
        assert(bounds.action[0] >= 48 && bounds.action[1] && bounds.action[2], JSON.stringify(bounds));
      }
    }
    const accents = await cards.evaluateAll(nodes => nodes.map(node => getComputedStyle(node).getPropertyValue("--contact-accent")));
    assert(new Set(accents).size > 1);
    const initials = cards.nth(1).locator('[data-slot="avatar-fallback"]');
    assert.equal(await initials.textContent(), "НС");
    await grid.screenshot({ path: join(output, `${width}x${height}.png`), animations: "disabled" });
    if (!sphere) {
      const placesGrid = page.getByRole("list", { name: "Места рядом" });
      await placesGrid.waitFor();
      const placeCards = placesGrid.getByRole("listitem");
      assert.equal(await placeCards.count(), 3);
      assert.equal(await placeCards.last().getByRole("button").count(), 0);
      assert.match(await placeCards.first().getByRole("button").textContent(), /Жду на Роллапп \(7\)/);
      assert.match(await placeCards.nth(1).getByRole("button").textContent(), /Ждёте на Роллапп/);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      if (width === 1024) {
        const waitButton = placeCards.first().getByRole("button", { name: /Жду на Роллапп · ХОНГ/ });
        const completePlaceWait = () => page.evaluate(() => {
          const complete = window.completePlaceWait;
          window.completePlaceWait = undefined;
          complete();
        });
        await waitButton.click();
        assert.equal(await waitButton.getAttribute("aria-busy"), "true");
        assert(await waitButton.isDisabled());
        await completePlaceWait();
        await placeCards.first().getByRole("alert").waitFor();
        await waitButton.waitFor();
        assert.match(await waitButton.textContent(), /\(7\)/);
        await waitButton.click();
        await completePlaceWait();
        const waitingButton = placeCards.first().getByRole("button", { name: /Ждёте на Роллапп · ХОНГ/ });
        await waitingButton.waitFor();
        assert.match(await waitingButton.textContent(), /\(8\)/);
        await waitingButton.click();
        await completePlaceWait();
        await waitButton.waitFor();
        assert.deepEqual(await page.evaluate(() => window.waitCalls), [true, true, false]);
      }
    }
    const completeFollow = () => page.evaluate(() => {
      const complete = window.completeBusinessFollow;
      window.completeBusinessFollow = undefined;
      complete();
    });
    await profile.click({ modifiers: ["Control"] });
    await page.waitForFunction(() => document.activeElement?.textContent === "Открыть потребности");
    assert.deepEqual(await page.evaluate(() => window.followCalls), []);
    assert.equal(await page.locator("[data-location]").textContent(), "/");
    await allow.press("Enter");
    await page.waitForFunction(() => Boolean(window.completeBusinessFollow));
    assert.equal(await allow.getAttribute("aria-busy"), "true");
    assert(await allow.isDisabled());
    await completeFollow();
    await card.getByRole("alert").waitFor();
    await allow.click();
    await page.waitForFunction(() => Boolean(window.completeBusinessFollow));
    await completeFollow();
    await block.waitFor();
    if ([320, 1440].includes(width)) {
      await grid.screenshot({ path: join(output, `${width}x${height}-granted.png`), animations: "disabled" });
    }
    await block.click();
    await page.waitForFunction(() => Boolean(window.completeBusinessFollow));
    await completeFollow();
    await allow.waitFor();
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
    console.log(`PASS ${width}x${height}: direct consent, Ctrl-click focus, keyboard, retry and revoke`);
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
