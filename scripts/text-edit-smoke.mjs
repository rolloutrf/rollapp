import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { chromium } from "playwright-core";
import { createServer } from "vite";

let executablePath;
for (const candidate of [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean)) {
  try { await access(candidate); executablePath = candidate; break; } catch {}
}
assert(executablePath, "Install Chrome or set CHROME_PATH");
const server = await createServer({ cacheDir: "node_modules/.vite-text-edit", server: { host: "127.0.0.1", port: 5199, strictPort: true, hmr: false, watch: null }, plugins: [{
  name: "text-edit-fixture",
  transform(source, id) { if (id.endsWith("/src/components/about-me.jsx?text-edit")) return `${source}\nexport { AboutMeQuestionEditor };`; },
  configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
    if (!req.url.startsWith("/__text-edit")) return next();
    res.setHeader("Content-Type", "text/html");
    res.end(await vite.transformIndexHtml(req.url, '<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/text-edit.jsx"></script></body></html>'));
  }); },
}] });
await server.listen();
const browser = await chromium.launch({ executablePath, headless: true, args: process.env.CI ? ["--no-sandbox"] : [] });
try {
  for (const width of (process.env.TEXT_EDIT_WIDTHS || "320,390,768,820,1024,1440,1920").split(",").map(Number)) {
    for (const height of width === 390 ? [844, 400] : [844]) {
      const page = await browser.newPage({ viewport: { width, height } }), errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/api/**", route => { errors.push("Unexpected API request"); return route.abort(); });
      await page.goto("http://127.0.0.1:5199/__text-edit");
      const editor = width < 768 ? page.locator('[data-mobile-form-page]:visible') : page.locator('[data-slot="drawer-popup"]');
      const close = () => width < 768 ? page.getByRole("button", { name: "Назад", exact: true }) : page.getByRole("button", { name: "Отмена", exact: true });
      const trigger = page.getByRole("button", { name: "Редактировать вопрос", exact: true });
      const answer = page.getByText("Текст ответа можно выделять и копировать.", { exact: true });
      assert(await trigger.evaluate(button => {
        const style = getComputedStyle(button);
        return style.position === "absolute" && (style.clip !== "auto" || style.clipPath !== "none");
      }), "Edit trigger must have no visible icon or reserved column");
      await page.getByRole("link", { name: "Ссылка на материал" }).click();
      assert(new URL(page.url()).hash === "#reference", "Markdown link stopped navigating");
      assert.equal(await editor.count(), 0, "Clicking a link opened the editor");
      const box = await answer.boundingBox();
      await page.mouse.move(box.x + 2, box.y + 14); await page.mouse.down();
      await page.mouse.move(box.x + Math.min(180, box.width - 4), box.y + 14, { steps: 12 }); await page.mouse.up();
      assert(await page.evaluate(() => getSelection().toString().length > 0), "Cannot select prose");
      assert.equal(await editor.count(), 0, "Selecting text opened the editor");
      await page.evaluate(() => getSelection().removeAllRanges());
      for (const action of ["heading", "answer", "Enter", "Space"]) {
        if (action === "heading") await page.getByRole("heading", { name: "Что для меня важно?", exact: true }).click();
        else if (action === "answer") await answer.click();
        else {
          await trigger.focus();
          assert.equal(await trigger.evaluate(button => getComputedStyle(button.closest('[data-editable-text]')).outlineStyle), "solid", "Keyboard focus must outline the text block");
          await trigger.press(action === "Space" ? " " : "Enter");
        }
        await editor.waitFor();
        assert.equal(await editor.getByRole("textbox", { name: "Вопрос", exact: true }).inputValue(), "Что для меня важно?");
        await close().click(); await editor.waitFor({ state: "hidden" });
      }
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Horizontal overflow");
      for (const mode of ["readonly", "loading"]) {
        await page.goto(`http://127.0.0.1:5199/__text-edit?${mode}=1`);
        await page.getByRole("heading", { name: "Что для меня важно?", exact: true }).click();
        assert.equal(await editor.count(), 0, `${mode}: text opened an editor`);
        if (mode === "readonly") assert.equal(await page.getByRole("button", { name: "Редактировать вопрос", exact: true }).count(), 0, "Read-only prose has edit actions");
        else assert(await page.getByRole("button", { name: "Редактировать вопрос", exact: true }).isDisabled());
      }
      assert.deepEqual(errors, []);
      console.log(`PASS ${width}×${height}: heading/answer click, Enter/Space, focus, links, selection, read-only and loading`);
      await page.close();
    }
  }
} catch (error) {
  for (const context of browser.contexts()) for (const page of context.pages()) await page.screenshot({ path: "/tmp/rollapp-text-edit-failure.png" });
  throw error;
} finally { await browser.close(); await server.close(); }
