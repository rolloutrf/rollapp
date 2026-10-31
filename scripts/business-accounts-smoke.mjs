import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { browserLaunchOptions } from "./browser-runtime.mjs";
import { listenSmokeServer, smokeOrigin } from "./smoke-server.mjs";
import { BUSINESS_CATEGORIES } from "../shared/business-accounts.js";
import { SPHERE_SECTIONS, SPHERE_SECTION_LABELS } from "../shared/sphere-sharing.js";

const output = "/tmp/rollapp-business-categories";
await mkdir(output, { recursive: true });
const server = await createServer({ cacheDir: "node_modules/.vite-business-accounts", server: { host: "127.0.0.1", port: 0, strictPort: true, hmr: false, watch: null }, plugins: [{
  name: "business-account-layout", configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
    if (!req.url.startsWith("/__business-accounts")) return next();
    res.setHeader("Content-Type", "text/html");
    res.end(await vite.transformIndexHtml(req.url, '<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/business-accounts.jsx"></script></body></html>'));
  }); },
}] });
await listenSmokeServer(server);
const origin = smokeOrigin(server);
const browser = await chromium.launch(browserLaunchOptions());

async function geometry(page, label) {
  const result = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > innerWidth + 1,
    clipped: [...document.querySelectorAll('[data-slot="input"],[data-slot="select-trigger"],[data-slot="select-content"],[data-slot="select-item"],.auth-account-type')].filter((element) => {
      const box = element.getBoundingClientRect();
      return box.width && (box.left < -1 || box.right > innerWidth + 1);
    }).map((element) => element.textContent),
    controls: [...document.querySelectorAll('[data-slot="input"],[data-slot="select-trigger"]')].filter((element) => element.getBoundingClientRect().height > 0).map((element) => ({ name: element.id, height: element.getBoundingClientRect().height, font: getComputedStyle(element).fontSize })),
  }));
  assert.equal(result.overflow, false, `${label}: document overflow`);
  assert.deepEqual(result.clipped, [], `${label}: clipped controls`);
  for (const control of result.controls) {
    assert(control.height >= 48, `${label}: ${control.name} is ${control.height}px; expected at least 48px`);
    assert.equal(control.font, "18px", `${label}: product control typography`);
  }
}

try {
  for (const [width, height] of [[320, 844], [390, 844], [768, 844], [820, 844], [1024, 844], [1440, 900], [1920, 1080], [390, 400]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    page.setDefaultTimeout(30_000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", (route) => { errors.push(`Unexpected API request: ${route.request().method()}`); return route.abort(); });
    const label = `${width}x${height}`;
    await page.goto(`${origin}/__business-accounts`);
    await page.getByRole("radio", { name: /^Личный/ }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.getByRole("combobox", { name: "Категория бизнеса" }).count(), 0);
    await page.getByLabel("Как вас зовут").fill("Новый специалист");
    await page.getByLabel("Email", { exact: true }).fill("specialist@example.com");
    await page.getByLabel("Пароль", { exact: true }).fill("test-password");
    await page.getByRole("radio", { name: /^Бизнес/ }).check();
    const picker = page.getByRole("combobox", { name: "Категория бизнеса" });
    await picker.waitFor();
    await page.getByRole("button", { name: "Создать бизнес-аккаунт" }).click();
    assert.equal(await page.locator("[data-submitted]").textContent(), "null", `${label}: category must be required`);
    await picker.click();
    await page.getByRole("option").first().waitFor();
    assert.equal(await page.getByRole("option").count(), 5);
    await geometry(page, label);
    await page.screenshot({ path: `${output}/${label}-categories.png`, animations: "disabled" });
    await page.keyboard.press("Escape");
    assert.equal(JSON.parse(await page.locator("[data-state]").textContent()).businessCategory, null);
    for (const category of BUSINESS_CATEGORIES) {
      await picker.click();
      const option = page.getByRole("option").filter({ hasText: category.label });
      await option.scrollIntoViewIfNeeded();
      const fits = await option.evaluate((element) => [...element.querySelectorAll("span,small")].every((child) => child.scrollWidth <= child.clientWidth + 1));
      assert(fits, `${label}: ${category.label} option text clipped`);
      await option.click();
      assert.equal(await picker.locator('[data-slot="select-value"]').textContent(), category.label);
      await page.getByRole("button", { name: "Создать бизнес-аккаунт" }).click();
      assert.equal(JSON.parse(await page.locator("[data-submitted]").textContent()).businessCategory, category.id);
      await geometry(page, `${label} ${category.id}`);
    }
    await page.getByRole("radio", { name: /^Личный/ }).check();
    assert.equal(await picker.count(), 0);
    assert.equal(JSON.parse(await page.locator("[data-state]").textContent()).businessCategory, null);
    assert.equal(await page.getByLabel("Email", { exact: true }).inputValue(), "specialist@example.com");
    await page.getByRole("button", { name: "Создать вишлист" }).click();
    assert.equal(JSON.parse(await page.locator("[data-submitted]").textContent()).businessCategory, null);
    await page.getByRole("radio", { name: /^Бизнес/ }).check();
    await picker.focus();
    await page.keyboard.press("ArrowDown");
    await page.getByRole("option").first().waitFor();
    await page.keyboard.press("Home");
    await page.keyboard.press("Enter");
    await page.waitForFunction((id) => JSON.parse(document.querySelector("[data-state]").textContent).businessCategory === id, BUSINESS_CATEGORIES[0].id);
    await page.screenshot({ path: `${output}/${label}-registration.png`, fullPage: true, animations: "disabled" });

    for (const category of BUSINESS_CATEGORIES) {
      await page.goto(`${origin}/__business-accounts?request=1&category=${category.id}`);
      const sphere = page.getByRole("combobox", { name: "Сфера", exact: true });
      await sphere.waitFor();
      assert.equal(await sphere.locator('[data-slot="select-value"]').textContent(), category.sphereLabel);
      assert(await sphere.isDisabled(), `${label}: category sphere must be fixed`);
      const section = page.getByRole("combobox", { name: "Пространство", exact: true });
      await section.click();
      await page.getByRole("option").first().waitFor();
      const expected = SPHERE_SECTIONS[category.sphere].map((id) => SPHERE_SECTION_LABELS[id]);
      assert.deepEqual(await page.getByRole("option").allTextContents(), expected);
      await page.getByRole("option").last().click();
      await page.getByRole("button", { name: "Отправить запрос" }).click();
      assert.deepEqual(JSON.parse(await page.locator("[data-submitted]").textContent()), { sphere: category.sphere, section: SPHERE_SECTIONS[category.sphere].at(-1) });
      await geometry(page, `${label} request ${category.id}`);
    }
    assert.deepEqual(errors, [], `${label}: runtime errors or API requests`);
    await page.close();
    console.log(`PASS ${label}: registration, required/reset category, keyboard, five scoped request forms, scroll reachability; no API requests`);
  }
} finally { await browser.close(); await server.close(); }
