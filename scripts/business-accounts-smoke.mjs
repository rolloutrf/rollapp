import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { browserLaunchOptions } from "./browser-runtime.mjs";
import { listenSmokeServer, smokeOrigin } from "./smoke-server.mjs";
import { BUSINESS_CATEGORIES } from "../shared/modules/catalog-marketplace/business-accounts.js";
import { SPHERE_SECTIONS } from "../shared/modules/access/sphere-sharing.js";

const output = "/tmp/rollapp-business-categories";
const clientsOnly = process.argv.includes("--clients-only");
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

async function checkRegistration(page, label) {
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
      if (category.id === "seller") {
        await page.getByRole("combobox", { name: "Раздел Вишлиста" }).click();
        await page.getByRole("option", { name: "Транспорт", exact: true }).click();
      }
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
    // Options mount before the primitive finishes its initial-focus lifecycle.
    // Send navigation keys only once the native list item owns keyboard focus.
    await page.waitForFunction(() => document.activeElement?.getAttribute("role") === "option");
    await page.keyboard.press("Home");
    await page.keyboard.press("Enter");
    await page.waitForFunction((id) => JSON.parse(document.querySelector("[data-state]").textContent).businessCategory === id, BUSINESS_CATEGORIES[0].id);
    await page.screenshot({ path: `${output}/${label}-registration.png`, fullPage: true, animations: "disabled" });

}

async function checkOwnerCatalog(page, width, height) {
  const scopes = { identity: "mission", health: "nutrition", wishlist: "food", education: "coaching", career: "contacts" };
  for (const [sphere, section] of Object.entries(scopes)) {
    const retry = sphere === "identity" && width === 390 && height === 400;
    const empty = sphere === "health" && width === 390 && height === 400;
    await page.goto(`${origin}/__business-accounts?owner-catalog=${sphere}&section=${section}${retry ? "&retry=1" : ""}${empty ? "&empty=1" : ""}`);
    if (retry) {
      await page.getByText("Не удалось загрузить бизнес-аккаунты", { exact: true }).waitFor();
      await page.getByRole("button", { name: "Повторить", exact: true }).click();
    }
    if (empty) {
      await page.getByText("В этом разделе пока нет бизнес-аккаунтов", { exact: true }).waitFor();
    } else {
      const list = page.getByRole("list", { name: "Бизнес-аккаунты", exact: true });
      await list.waitFor();
      assert.equal(await list.getByRole("listitem").count(), sphere === "wishlist" ? 52 : 3);
      const index = sphere === "wishlist" ? 52 : 3;
      const name = `Организация ${index}`;
      const allow = list.getByRole("button", { name: `Открыть потребности · ${name}`, exact: true });
      await allow.click();
      if (retry) {
        await list.getByText("Повторите изменение подписки", { exact: true }).waitFor();
        await allow.click();
      }
      await list.getByRole("button", { name: `Закрыть потребности · ${name}`, exact: true }).click();
      await allow.waitFor();
      const path = `/brand-offer-consents/business-account-${index}`;
      assert.deepEqual(await page.evaluate(() => window.catalogCalls), [
        ...(retry ? [{ path, body: { granted: true } }] : []),
        { path, body: { granted: true } },
        { path, body: { granted: false } },
      ]);
    }
    assert.equal(await page.getByRole("button", { name: /Доступ к личному разделу|Открытые доступы/ }).count(), 0);
    if (sphere === "wishlist" && [390, 1440].includes(width) && height >= 800) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: `${output}/${width}x${height}-owner-catalog.png`, animations: "disabled" });
    }
  }

  await page.goto(`${origin}/__business-accounts?owner-catalog=wishlist&section=food&revoke=1`);
  await page.getByRole("link", { name: "Открыть каталог брендов" }).waitFor();
  assert.equal(await page.getByRole("button", { name: /Открытые доступы|Открыть доступ/ }).count(), 0);
  await page.goto(`${origin}/__business-accounts?owner-catalog=wishlist&section=food&old-grant=1`);
  const menu = page.getByRole("button", { name: "Ранее выданные права бренда «Организация 1»", exact: true });
  const revoke = page.getByRole("menuitem", { name: "Закрыть доступ к «Весь Вишлист (существующий доступ)»", exact: true });
  await menu.click();
  await revoke.click();
  await page.waitForFunction(() => window.catalogCalls.length === 1);
  assert.deepEqual(await page.evaluate(() => window.catalogCalls), [
    { path: "/sphere-shares", body: { viewerId: "business-1", sphere: "wishlist", section: "wishlist", granted: false } },
  ]);
  await menu.waitFor({ state: "detached" });
  await page.getByRole("button", { name: "Открыть потребности · Организация 1", exact: true }).waitFor();

}

async function checkAllOwnerSections(page) {
  for (const [sphere, sections] of Object.entries(SPHERE_SECTIONS)) {
    for (const section of sections) {
      if (section === "wishlist") continue; // Historical all-Wishlist grant, not a visible tab.
      const params = new URLSearchParams({ "owner-catalog": sphere, section, "audit-section": "1" });
      await page.goto(`${origin}/__business-accounts?${params}`);
      await page.getByRole("link", { name: "Открыть каталог брендов" }).waitFor();
      await page.waitForFunction(() => window.ownerScopeRead === true);
      assert.equal(await page.getByRole("button", { name: /Открытые доступы|^Открыть доступ$|^Запросить доступ$/ }).count(), 0, `${sphere}/${section}`);
    }
  }
  console.log("PASS all owner sphere sections without manual access buttons");
}

try {
  for (const [width, height] of [[320, 844], [390, 844], [768, 844], [820, 844], [1024, 844], [1440, 900], [1920, 1080], [390, 400]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    page.setDefaultTimeout(30_000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", (route) => { errors.push(`Unexpected API request: ${route.request().method()}`); return route.abort(); });
    const label = `${width}x${height}`;
    if (!clientsOnly) await checkRegistration(page, label);
    await page.goto(`${origin}/__business-accounts?clients=1&access-unavailable`);
    const accessError = "Не удалось загрузить ранее открытые разделы";
    await page.getByText(accessError, { exact: true }).waitFor();
    await page.evaluate(() => window.restoreClientAccess());
    await page.getByRole("button", { name: "Повторить", exact: true }).click();
    const shares = page.getByRole("region", { name: "Ранее открытые разделы", exact: true });
    const openProducts = shares.getByRole("link", { name: "Открыть «Товары» — Александр Соколов" });
    await openProducts.waitFor();
    assert.equal(await openProducts.getAttribute("href"), "/shared-client/products");
    assert.equal(await page.getByRole("button", { name: /Запросить доступ|Отправить запрос/ }).count(), 0);
    assert.deepEqual(await page.evaluate(() => window.clientAccessReads.filter(path => path.includes("access") || path.includes("sphere-shares"))), [
      "/sphere-shares/incoming", "/sphere-shares/incoming",
    ]);
    const menu = page.getByRole("button", { name: "Открыть переключатель сфер", exact: true });
    await menu.click();
    const services = page.getByRole("navigation", { name: "Сервисы и сферы Rollapp" });
    await services.waitFor();
    assert.deepEqual(await services.getByRole("link").allTextContents(), ["Вишлист", "Клиенты"]);
    assert.equal(await services.getByRole("link", { name: "Клиенты", exact: true }).getAttribute("aria-current"), "page");
    assert.equal(await page.getByRole("navigation", { name: "Разделы, доступные для чтения", exact: true }).count(), 0);
    if ((width === 390 && height > 400) || width === 1440) {
      await page.locator(".sphere-switcher__panel").screenshot({ path: `${output}/${label}-business-menu.png`, animations: "disabled" });
    }
    await page.keyboard.press("Escape");
    await services.waitFor({ state: "hidden" });

    await geometry(page, `${label} client access`);
    for (const card of await page.locator(".business-access-card").all()) {
      const overflow = await card.evaluate(element => {
        if (element.scrollWidth <= element.clientWidth + 1) return null;
        const cardBounds = element.getBoundingClientRect();
        return {
          text: element.innerText,
          size: [element.clientWidth, element.scrollWidth],
          descendants: [...element.querySelectorAll("*")].map(node => ({
            name: node.className,
            width: node.clientWidth,
            scroll: node.scrollWidth,
            right: node.getBoundingClientRect().right - cardBounds.right,
          })).filter(node => node.right > 0 || node.scroll > node.width + 1),
        };
      });
      assert.equal(overflow, null, `${label}: client card overflow ${JSON.stringify(overflow)}`);
      for (const action of await card.locator('[data-slot="button"]').all()) {
        assert((await action.boundingBox()).height >= 48, `${label}: small card action`);
        assert(await action.evaluate(element =>
          element.scrollWidth <= element.clientWidth + 1 &&
          parseFloat(getComputedStyle(element).borderTopLeftRadius) >= 24 &&
          [...element.children].every(child => child.scrollWidth <= child.clientWidth + 1)
        ), `${label}: card action radius or text`);
      }
    }
    if ([390, 1440].includes(width) && height >= 800) {
      await page.screenshot({ path: `${output}/${label}-client-access.png`, fullPage: true, animations: "disabled" });
    }
    if (!clientsOnly) await checkOwnerCatalog(page, width, height);
    if (!clientsOnly && width === 1440) await checkAllOwnerSections(page);
    assert.deepEqual(errors, [], `${label}: runtime errors or API requests`);
    await page.close();
    console.log(`PASS ${label}: ${clientsOnly ? "" : "registration, categories, brand consent, "}legacy client cards and retry; no API requests`);
  }
} finally { await browser.close(); await server.close(); }
