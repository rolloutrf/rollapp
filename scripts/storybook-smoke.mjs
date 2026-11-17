import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";
import { modules } from "../storybook/modules.js";
import { browserLaunchOptions } from "./browser-runtime.mjs";
import { waitForStoryContent } from "./storybook-readiness.mjs";

const origin = new URL(process.env.ROLLAPP_STORYBOOK_URL || "http://127.0.0.1:6006/");
const requested = process.argv.slice(2);
const viewportMatrix = [[320, 568], [390, 844], [390, 400], [768, 900], [820, 900], [1024, 768], [1440, 900], [1920, 1080]];
const index = await fetch(new URL("index.json", origin)).then(response => {
  assert(response.ok, "Start Storybook with npm run storybook before running this check.");
  return response.json();
});
const entries = Object.values(index.entries);
const published = entries.filter(entry => entry.type === "story");
const moduleIds = modules.map(([, , id]) => "rollapp-" + id);
const moduleTitles = new Set(modules.map(([number, label]) => `РОЛЛАПП/Модули/${number} ${label}`));
for (const { id, title, importPath } of entries) {
  const section = title.split("/").slice(0, 3).join("/");
  assert(id.startsWith("rollapp-") && importPath.startsWith("./storybook/stories/"), `Unexpected Storybook entry: ${id}`);
  assert(title === "РОЛЛАПП/Обзор" || moduleTitles.has(section), `Unknown Rollapp section: ${title}`);
}
for (const [number, label, id] of modules) {
  const entry = index.entries[`rollapp-${id}`];
  assert(entry?.type === "story", `Module link missing: ${id}`);
  assert.equal(entry.title, `РОЛЛАПП/Модули/${number} ${label}`);
}
assert.equal(new Set(moduleIds.map(id => index.entries[id].title)).size, modules.length);

const primary = ["rollapp-guide--catalog", ...moduleIds];
const matrixStories = [
  "rollapp-auth--email-and-phone", "rollapp-card--interactive", "rollapp-delivery--results", "rollapp-checkout--review",
  "rollapp-daily-todo--today", "rollapp-calendar--week", "rollapp-kanban--board", "rollapp-rich-documents--table",
  "rollapp-contacts--detail", "rollapp-shell--bars",
];
const interactions = {
  async "rollapp-profile--visitor"(page) {
    await page.getByText("Только чтение", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: /^Редактировать профиль/ }).count(), 0);
  },
  async "rollapp-wishlist--new"(page) {
    const upload = page.getByRole("button", { name: "Добавить изображение", exact: true });
    for (const key of ["Enter", "Space"]) {
      await upload.focus();
      const chooser = page.waitForEvent("filechooser");
      await upload.press(key);
      await chooser;
      assert(await upload.evaluate(node => node === document.activeElement));
    }
    assert.equal(await upload.locator('input[type="file"]').count(), 0);
    assert.equal(await page.getByLabel("Загрузить фотографию желания", { exact: true }).getAttribute("tabindex"), "-1");
  },
  async "rollapp-guide--catalog"(page) {
    const storyLinks = page.locator('#storybook-root a[href^="./?path=/story/"]');
    const hrefs = await storyLinks.evaluateAll(links => links.map(link => link.getAttribute("href")));
    assert.deepEqual(hrefs, moduleIds.map(id => `./?path=/story/${id}`));
  },
  async "rollapp-identification--number"(page) {
    await page.getByRole("button", { name: "Получить код" }).click();
    await page.getByRole("textbox", { name: "Код из SMS" }).fill("123456");
    await page.getByRole("button", { name: "Подтвердить и войти" }).click();
    await page.getByText("Код не подошёл или устарел.").waitFor();
  },
  async "rollapp-checkout--review"(page) {
    await page.getByRole("button", { name: /^Купить за/ }).click();
    await page.getByRole("heading", { name: "Кот куплен" }).waitFor();
  },
  async "rollapp-assistant--fallback"(page) {
    await page.getByRole("button", { name: "Найти лучшие" }).click();
    await page.getByText("Нейропоиск не ответил вовремя. Доступны предложения магазинов.").waitFor();
    assert(await page.getByRole("listitem", { name: /открыть предложение/i }).count() > 0);
  },
  async "rollapp-shell--bars"(page) {
    const icon = page.getByRole("button", { name: "Назад", exact: true });
    const geometry = await icon.evaluate(button => {
      const rect = button.getBoundingClientRect();
      const glyph = button.querySelector("svg").getBoundingClientRect();
      return [rect.width, rect.height, glyph.width, glyph.height, getComputedStyle(button).borderTopLeftRadius];
    });
    assert.deepEqual(geometry, [48, 48, 20, 20, "24px"]);
    await page.getByRole("button", { name: "Открыть форму" }).click();
    await page.getByRole("textbox", { name: "Название" }).fill("Пример");
    await page.getByRole("button", { name: "Сохранить" }).click();
    await page.getByRole("textbox", { name: "Название" }).waitFor({ state: "hidden" });
  },
};
const checks = requested.length
  ? published.filter(entry => requested.some(filter => entry.id.startsWith(filter))).map(({ id }) => ({ id, size: viewportMatrix[1] }))
  : [...published.flatMap(({ id }) => viewportMatrix.map(size => ({ id, size }))),
     ...primary.map(id => ({ id, size: viewportMatrix[6], light: true }))];
assert(checks.length, "No Storybook stories matched the requested filters.");
const screenshotDir = process.env.ROLLAPP_STORYBOOK_SCREENSHOTS;
if (screenshotDir) await mkdir(screenshotDir, { recursive: true });
const browser = await chromium.launch(browserLaunchOptions());
const failures = [];
let next = 0;

try {
  await Promise.all(Array.from({ length: 3 }, async () => {
    const page = await browser.newPage();
    let diagnostics = [];
    page.setDefaultTimeout(25000);
    page.on("pageerror", error => diagnostics.push(error.message));
    page.on("console", message => { if (message.type() === "error" && /Maximum update depth|Too many re-renders/.test(message.text())) diagnostics.push(message.text()); });
    page.on("request", request => {
      if (/^\/(?:api(?:\/|$)|mcp(?:\/|$))/.test(new URL(request.url()).pathname)) diagnostics.push(`Unexpected API request: ${request.method()}`);
    });
    try {
      for (let current = next++; current < checks.length; current = next++) {
        const { id, size: [width, height], light } = checks[current];
        const label = `${id} ${width}×${height}${light ? " light" : ""}`;
        diagnostics = [];
        try {
          await page.setViewportSize({ width, height });
          const url = new URL("iframe.html", origin);
          url.searchParams.set("id", id);
          url.searchParams.set("viewMode", "story");
          if (light) url.searchParams.set("globals", "theme:light");
          await page.goto(url.href, { waitUntil: "domcontentloaded" });
          await page.waitForFunction(() => Boolean(document.querySelector("#storybook-root > *, .sb-errordisplay")));
          assert.equal(await page.locator(".sb-errordisplay:visible").count(), 0, await page.locator(".sb-errordisplay").allTextContents().then(items => items.join(" ")));
          await page.evaluate(() => document.fonts.ready);
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          await page.waitForFunction(() => Boolean(document.querySelector("#storybook-root > *")));
          await waitForStoryContent(page, id);
          assert.equal(await page.locator(".sb-errordisplay:visible").count(), 0, await page.locator(".sb-errordisplay").allTextContents().then(items => items.join(" ")));
          assert.deepEqual(diagnostics, []);
          const widthCheck = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: window.innerWidth }));
          assert(widthCheck.document <= widthCheck.viewport + 1, `Root overflow: ${JSON.stringify(widthCheck)}`);
          const theme = await page.locator("html").evaluate(node => node.classList.contains("dark") ? "dark" : "light");
          assert.equal(theme, light ? "light" : "dark");
          if (id === "rollapp-calendar--week") {
            const meeting = page.locator('[data-calendar-event="meeting"]');
            const { time, resize } = await meeting.evaluate(tile => ({
              time: tile.querySelector(".schedule-event__time").getBoundingClientRect().toJSON(),
              resize: tile.querySelector(".schedule-resize").getBoundingClientRect().toJSON(),
            }));
            assert(time.height <= 16 && time.height > 0, "The visible time interval must fit on one line");
            assert(time.bottom <= resize.top, "The resize target must start below the time interval");
            assert.match(await meeting.locator(".schedule-event").getAttribute("aria-description"), /09:00.*10:00/);
          }
          if (screenshotDir && matrixStories.includes(id)) await page.screenshot({ path: `${screenshotDir}/${id}-${width}x${height}-${theme}.png` });
          if (width === 390 && height === 844 && interactions[id]) {
            await interactions[id](page);
            assert.deepEqual(diagnostics, []);
          }
          console.log(`PASS ${label}`);
        } catch (error) {
          failures.push(`${label}: ${error.message}${diagnostics.length ? " | " + diagnostics.join(", ") : ""}`);
          console.error(`FAIL ${failures.at(-1)}`);
          if (screenshotDir) await page.screenshot({ path: `${screenshotDir}/failure-${id}-${width}x${height}.png` }).catch(() => {});
        }
      }
    } finally {
      await page.close();
    }
  }));
} finally {
  await browser.close();
}
assert.equal(failures.length, 0, failures.join("\n"));
console.log(`${checks.length} browser checks passed.`);
