import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium } from "playwright-core";
import { browserLaunchOptions } from "./browser-runtime.mjs";

// Actual picker, Router and task editor; unsaved props only, all API forbidden.
const port = Number(process.env.DATE_PICKER_PORT || 5197);
const server = await createServer({
  cacheDir: "node_modules/.vite-date-pages-smoke",
  server: { host: "127.0.0.1", port, strictPort: true, hmr: false, watch: null },
  plugins: [{ name: "date-page-fixture",
    transform(source, id) {
      if (id.includes("planning-space.jsx?drawer-smoke-export=TaskEditor")) return `${source}\nexport { TaskEditor };`;
    },
    configureServer(vite) {
      vite.middlewares.use(async (req, res, next) => {
        if (!req.url.startsWith("/__date-page")) return next();
        res.setHeader("Content-Type", "text/html");
        res.end(await vite.transformIndexHtml(req.url, '<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/date-picker-page.jsx"></script></body></html>'));
      });
    },
  }],
});
await server.listen();
const browser = await chromium.launch(browserLaunchOptions());
try {
  for (const width of (process.env.DATE_WIDTHS || "320,390,640,767,768,820,1024,1440,1920").split(",").map(Number)) {
    for (const height of width < 768 ? [844, 400] : [844]) {
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: width === 390 ? 3 : 1 });
      page.setDefaultTimeout(8000);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/api/**", (route) => { errors.push("Unexpected API request"); return route.abort(); });
      const base = `http://127.0.0.1:${port}/__date-page?date=2026-10-16&space=work`;
      const screen = page.locator("[data-mobile-form-page]:visible");
      const open = () => page.getByRole("button", { name: "Выбрать дату: 16.10.2026", exact: true }).click();
      await page.goto(base);
      await open();
      const calendar = page.locator('[data-slot="calendar"]:visible');
      await calendar.waitFor();
      await page.evaluate(() => document.fonts.ready);
      if (width < 768) {
        await screen.getByRole("heading", { name: "Выбрать дату", exact: true }).waitFor();
        await page.waitForURL((url) => url.searchParams.has("formScreen"));
        assert.equal(await page.locator('[aria-modal="true"], [data-slot="dialog-overlay"], [data-slot="drawer-popup"]').count(), 0, "Date is still modal");
        assert.equal(await page.locator('[data-form-page-background]').evaluate((el) => getComputedStyle(el).display), "none", "Source page is visible");
        assert.notEqual(await page.evaluate(() => getComputedStyle(document.documentElement).overflow), "hidden", "Document is locked");
        const back = screen.getByRole("button", { name: "Назад", exact: true });
        const box = await back.boundingBox();
        assert.equal(box.height, 48);
        assert.equal(box.width, 48);
        assert(box.y >= height - 100 && box.y + box.height <= height, "Back is not at the bottom");
        const overflow = await page.evaluate(() => ({ root: document.documentElement.scrollWidth - innerWidth,
          descendants: [...document.querySelectorAll('[data-mobile-form-page]:not([hidden]) *')].filter((el) => {
            const r = el.getBoundingClientRect(); return r.width > 0 && (r.left < -1 || r.right > innerWidth + 1);
          }).map((el) => el.className) }));
        assert(overflow.root <= 1 && !overflow.descendants.length, JSON.stringify(overflow));
        await calendar.locator('button[data-day="31.10.2026"]').scrollIntoViewIfNeeded();
        const last = await calendar.locator('button[data-day="31.10.2026"]').boundingBox();
        assert(last.y >= 0 && last.y + last.height <= height - 72, "Last calendar row cannot scroll above Back");
        if (width === 390 && height === 844) await page.screenshot({ path: "/tmp/rollapp-date-picker-page.png" });
        await back.click();
        await page.waitForURL(base);
        await open(); await screen.waitFor();
        await page.goBack(); await page.waitForURL(base);
        await open(); await calendar.waitFor();
      } else {
        assert.equal(await screen.count(), 0, "Desktop picker became a page");
        assert.equal(page.url(), base);
      }
      // Month/year lists, a leap day, local-date keys and return history.
      await calendar.getByRole("combobox", { name: "Месяц", exact: true }).click();
      await page.getByRole("option", { name: "февр.", exact: true }).click();
      await calendar.getByRole("combobox", { name: "Год", exact: true }).click();
      await page.getByRole("option", { name: "2028", exact: true }).click();
      await calendar.locator('button[data-day="29.02.2028"]').click();
      await page.waitForURL((url) => url.searchParams.get("date") === "2028-02-29" && !url.searchParams.has("formScreen"));
      assert.equal(new URL(page.url()).searchParams.get("space"), "work", "Selection lost list context");
      await page.goBack(); await page.waitForURL(base);
      assert.equal(await page.locator('[data-mobile-form-page]:visible').count(), 0, "Back reopened a dismissed picker");
      await open(); await calendar.waitFor();
      await page.getByRole("button", { name: "Очистить дату", exact: true }).click();
      await page.waitForURL((url) => !url.searchParams.has("date") && !url.searchParams.has("formScreen"));
      await page.getByRole("button", { name: "Выбрать дату: не выбрана", exact: true }).click();
      await calendar.waitFor();
      assert.equal(await page.getByRole("button", { name: "Очистить дату", exact: true }).count(), 0);
      if (width < 768) {
        await screen.getByRole("button", { name: "Назад", exact: true }).click();
        await page.waitForURL((url) => !url.searchParams.has("formScreen"));
        await page.getByRole("button", { name: "Открыть задачу", exact: true }).click();
        await screen.getByRole("heading", { name: "Новая задача", exact: true }).waitFor();
        const title = screen.getByRole("textbox", { name: "Название", exact: true });
        await title.fill("Черновик задачи");
        const parentUrl = page.url();
        const date = screen.getByRole("button", { name: "Дата задачи: не выбрана", exact: true });
        await date.click();
        await screen.getByRole("heading", { name: "Дата задачи", exact: true }).waitFor();
        await page.goBack(); await page.waitForURL(parentUrl);
        assert.equal(await title.inputValue(), "Черновик задачи", "Cancel lost parent draft");
        await date.click(); await calendar.waitFor();
        await calendar.getByRole("combobox", { name: "Месяц", exact: true }).click();
        await page.getByRole("option", { name: "окт.", exact: true }).click();
        await calendar.getByRole("combobox", { name: "Год", exact: true }).click();
        await page.getByRole("option", { name: "2026", exact: true }).click();
        await calendar.locator('button[data-day="17.10.2026"]').click();
        await page.waitForURL(parentUrl);
        await screen.getByRole("button", { name: "Дата задачи: 17.10.2026", exact: true }).waitFor();
        assert.equal(await title.inputValue(), "Черновик задачи", "Selection lost parent draft");
        const save = screen.getByRole("button", { name: "Сохранить", exact: true });
        await save.scrollIntoViewIfNeeded(); await save.click();
        await page.waitForURL((url) => !url.searchParams.has("formScreen"));
        assert.equal(JSON.parse(await page.locator("[data-saved-task]").textContent()).dueOn, "2026-10-17");
      } else {
        await page.keyboard.press("Escape");
        await page.getByRole("button", { name: "Открыть задачу", exact: true }).click();
        const drawer = page.locator('[data-slot="drawer-popup"]:visible');
        await drawer.waitFor();
        await page.waitForFunction(() => {
          const popup = document.querySelector('[data-slot="drawer-popup"]');
          return popup && Math.abs(popup.getBoundingClientRect().right - innerWidth) < 2;
        });
        assert.equal(await drawer.getAttribute("data-swipe-direction"), "right", "Task drawer opens from the wrong side");
        const bounds = await drawer.boundingBox();
        assert(bounds.x >= 0 && Math.abs(bounds.x + bounds.width - width) < 2, "Task drawer is not aligned to the right edge");
        await page.keyboard.press("Escape");
      }
      assert.deepEqual(errors, []);
      console.log(`PASS ${width}×${height}: ${width < 768 ? "native date page, Back, draft" : "desktop popover"}, leap day, clearing, history`);
      await page.close();
    }
  }
} catch (error) {
  for (const context of browser.contexts()) for (const page of context.pages()) {
    await page.screenshot({ path: "/tmp/rollapp-date-picker-failure.png" });
    console.error("FAIL STATE", page.url());
  }
  throw error;
} finally {
  await browser.close();
  await server.close();
}
