import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { browserLaunchOptions } from "./browser-runtime.mjs";
import { listenSmokeServer, smokeOrigin } from "./smoke-server.mjs";

const server = await createServer({ cacheDir: "node_modules/.vite-product-suggestions", server: { host: "127.0.0.1", port: 0, hmr: false, watch: null },
  plugins: [{ name: "product-suggestions-fixture", configureServer(vite) {
    vite.middlewares.use(async (req, res, next) => {
      if (!req.url.startsWith("/__product-suggestions")) return next();
      res.setHeader("Content-Type", "text/html");
      res.end(await vite.transformIndexHtml(req.url, '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/product-suggestions.jsx"></script></body></html>'));
    });
  } }],
});
await listenSmokeServer(server);
const browser = await chromium.launch(browserLaunchOptions());
const viewports = [[320, 740], [390, 844], [768, 900], [820, 900], [1024, 900], [1440, 900], [1920, 1080], [1024, 420]];
try {
  for (const [width, height] of viewports) {
    const page = await browser.newPage({ viewport: { width, height } });
    page.setDefaultTimeout(15_000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", (route) => { errors.push("Unexpected HTTP API request"); return route.abort(); });
    await page.goto(`${smokeOrigin(server)}/__product-suggestions`);
    if (width === 390 || width === 1440) await page.evaluate(() => document.documentElement.classList.add("dark"));
    const input = page.getByRole("combobox", { name: "Название", exact: true });
    await input.fill("ip"); await page.waitForTimeout(700);
    assert.equal(await page.evaluate(() => window.suggestionCalls.length), 0, "short input must not query");
    await input.fill("iph"); await input.fill("iphone");
    await page.getByRole("option", { name: /iphone Model/ }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.suggestionCalls.map((call) => call.query)), ["iphone"], "debounce");
    const bounds = await page.locator('[data-slot="combobox-content"]').evaluate((el) => {
      const b = el.getBoundingClientRect();
      return { x: b.x, y: b.y, right: b.right, bottom: b.bottom, overflow: document.documentElement.scrollWidth > innerWidth + 1 };
    });
    assert(bounds.x >= -1 && bounds.right <= width + 1 && bounds.y >= -1 && bounds.bottom <= height + 1 && !bounds.overflow, JSON.stringify(bounds));
    for (const box of await page.getByRole("option").evaluateAll((els) => els.map((el) => ({ height: el.getBoundingClientRect().height, font: getComputedStyle(el).fontSize })))) {
      assert(box.height >= 48); assert.equal(box.font, "18px");
    }
    await page.screenshot({ path: `/tmp/rollapp-product-suggestions-${width}x${height}.png` });
    await input.press("ArrowDown"); await input.press("Enter");
    assert.equal(await input.inputValue(), "iphone Model");
    assert.equal(await page.evaluate(() => window.submitted), 0, "selecting must not submit");
    assert.equal(await page.getByLabel("Описание", { exact: true }).inputValue(), "Моё описание");
    await page.getByLabel("Описание", { exact: true }).click();
    assert.equal(await input.inputValue(), "iphone Model", "blur must preserve selection");

    await input.fill("empty"); await page.getByText("Модель не найдена. Оставьте своё название.").waitFor();
    await input.press("Escape"); await page.getByLabel("Описание", { exact: true }).click();
    assert.equal(await input.inputValue(), "empty", "arbitrary names survive Escape and blur");
    await input.fill("error"); await page.getByText(/Wikidata временно недоступна/).waitFor();
    assert.equal(await input.inputValue(), "error");

    await input.fill("slow"); await page.waitForTimeout(700); await input.fill("new");
    await page.getByRole("option", { name: /new Model/ }).waitFor(); await page.waitForTimeout(900);
    assert.equal(await page.getByRole("option", { name: /slow/ }).count(), 0, "late response must not replace new results");
    await page.getByRole("option", { name: /new Pro/ }).click();
    assert.equal(await input.inputValue(), "new Pro");
    await input.fill("slow"); await page.waitForTimeout(700); await input.fill(""); await page.waitForTimeout(1600);
    assert.equal(await page.getByRole("option").count(), 0, "clear retires late results");
    assert.equal(await input.inputValue(), "");

    const beforeIme = await page.evaluate(() => window.suggestionCalls.length);
    await input.dispatchEvent("compositionstart"); await input.fill("日本語"); await page.waitForTimeout(700);
    assert.equal(await page.evaluate(() => window.suggestionCalls.length), beforeIme, "IME must not query mid-composition");
    await input.dispatchEvent("compositionend"); await page.getByRole("option", { name: /日本語 Model/ }).waitFor();
    await page.evaluate(() => window.setSuggestionDisabled(true));
    assert(await input.isDisabled()); assert.equal(await page.getByRole("option").count(), 0);
    await page.evaluate(() => { window.setExternalTitle("Внешнее название"); window.setSuggestionDisabled(false); });
    assert.equal(await input.inputValue(), "Внешнее название");
    assert.equal(await page.getByRole("option").count(), 0);

    await input.fill("limit"); await page.getByText(/Подсказки заняты/).waitFor();
    const limitedCalls = await page.evaluate(() => window.suggestionCalls.length);
    await input.fill("another"); await page.waitForTimeout(750);
    assert.equal(await page.evaluate(() => window.suggestionCalls.length), limitedCalls, "cooldown must prevent another request");
    await input.press("Escape");
    assert.equal(await page.evaluate(() => window.submitted), 0);
    assert.deepEqual(errors, []);
    console.log(`PASS product suggestions ${width}x${height}`);
    await page.close();
  }
} finally { await browser.close(); await server.close(); }
