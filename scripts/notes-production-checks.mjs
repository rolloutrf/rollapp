import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { browserLaunchOptions } from "./browser-runtime.mjs";
import { developmentFrontendPort } from "./production-dev-config.mjs";

// Render the real development app. Every allowed API request is forwarded to
// the test's real PostgreSQL transaction; no presentation client or mock data.
export async function runNotesProductionChecks({ origin, token }) {
  const baseUrl = process.env.NOTES_TEST_BASE_URL || `http://127.0.0.1:${developmentFrontendPort(process.env)}`;
  const browser = await chromium.launch(browserLaunchOptions());
  try {
    for (const [width, height] of [[320, 740], [390, 844], [768, 1024], [820, 414], [1024, 768], [1440, 900], [1920, 1080], [390, 400]]) {
      const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 768 });
      try {
        await context.addCookies([{ name: "rw_session", value: token, url: baseUrl }]);
        const errors = [];
        await context.route("**/api/**", async route => {
          const url = new URL(route.request().url());
          if (url.pathname !== "/api/me" && !/^\/api\/planning\/notes(?:\/|$)/.test(url.pathname)) {
            errors.push(`Unexpected API ${url.pathname}`);
            return route.abort();
          }
          const response = await route.fetch({ url: `${origin}${url.pathname}${url.search}` });
          try { await route.fulfill({ response }); }
          catch (cause) { if (!/Route is already handled|Target page, context or browser has been closed/.test(cause.message)) throw cause; }
        });
        const page = await context.newPage();
        page.on("pageerror", error => errors.push(error.message));
        await page.goto(`${baseUrl}/app/planning?tab=notes`);
        await page.getByText("Пока нет заметок.", { exact: false }).waitFor();
        assert.equal(await page.locator(".app-layout--planning").count(), 0);
        await page.getByRole("button", { name: "Открыть планирование", exact: true }).click();
        await page.locator(".planning-fab__panel").getByRole("link", { name: "Заметки", exact: true }).click();
        const create = page.getByRole("button", { name: "Создать заметку", exact: true });
        const actionStyle = await create.evaluate(node => { const style = getComputedStyle(node); return { left: style.paddingLeft, right: style.paddingRight, height: node.getBoundingClientRect().height }; });
        assert.equal(actionStyle.left, "24px");
        assert.equal(actionStyle.right, "24px");
        assert(actionStyle.height >= 48);
        await create.click();
        const title = page.getByRole("textbox", { name: "Название заметки", exact: true });
        const editor = page.getByRole("textbox", { name: "Текст заметки", exact: true });
        await editor.waitFor();
        const controls = await page.locator(".planning-notes [data-control-bar] button,.planning-notes [data-control-bar] a").evaluateAll(nodes => nodes.map(node => {
          const box = node.getBoundingClientRect(), style = getComputedStyle(node), icon = node.querySelector("svg").getBoundingClientRect();
          return { width: box.width, height: box.height, radii: [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius], icon: [icon.width, icon.height] };
        }));
        for (const control of controls) {
          assert.equal(control.width, 48); assert.equal(control.height, 48);
          assert.deepEqual(control.radii, ["24px", "24px", "24px", "24px"]);
          assert.deepEqual(control.icon, [20, 20]);
        }
        const id = new URL(page.url()).searchParams.get("note");
        assert(id);
        const name = `Production rollback ${width}×${height}`;
        await title.fill(name);
        await title.press("Enter");
        await editor.click();
        await page.keyboard.type("Заметка сохраняется в PostgreSQL. ");
        await page.keyboard.press("ControlOrMeta+b");
        await page.keyboard.type("Важная мысль");
        await page.keyboard.press("ControlOrMeta+b");
        await page.keyboard.press("Enter");
        await page.keyboard.type("- [ ] Дело");
        await page.keyboard.press("ControlOrMeta+s");
        await page.waitForFunction(() => document.querySelector("[data-save-status]")?.dataset.saveStatus === "saved");
        assert.equal(await editor.locator("strong").innerText(), "Важная мысль");
        assert.equal(await editor.locator('[data-type="taskItem"]').count(), 1);
        // Reload reconstructs the editor from a fresh HTTP read of the real row.
        await page.reload();
        await editor.waitFor();
        assert.equal(await title.innerText(), name);
        assert((await editor.innerText()).includes("Заметка сохраняется в PostgreSQL."));
        assert.equal(await editor.locator("strong").innerText(), "Важная мысль");
        assert.equal(await editor.locator('[data-type="taskItem"]').count(), 1);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        await page.getByRole("link", { name: "К списку заметок", exact: true }).first().click();
        await page.getByRole("link", { name, exact: true }).click();
        await editor.waitFor();
        await page.getByRole("button", { name: "Удалить заметку", exact: true }).click();
        await page.getByRole("button", { name: "Отмена", exact: true }).click();
        await page.getByRole("alertdialog").waitFor({ state: "hidden" });
        await page.screenshot({ path: `/tmp/rollapp-notes-production-${width}-${height}.png`, animations: "disabled" });
        await page.getByRole("button", { name: "Удалить заметку", exact: true }).click();
        await page.getByRole("button", { name: "Удалить", exact: true }).click();
        await page.getByText("Пока нет заметок.", { exact: false }).waitFor();
        assert.deepEqual(errors, []);
        console.log(`PASS notes production UI ${width}×${height}: real app/authenticated HTTP/PostgreSQL, native edit/format/checklist, save/reload/reopen/delete`);
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
}
