import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium } from "playwright-core";
import { browserLaunchOptions } from "./browser-runtime.mjs";
const server = await createServer({ cacheDir: "node_modules/.vite-contact-notes", server: { host: "127.0.0.1", port: 5397, strictPort: false, hmr: false, watch: null }, plugins: [{
  name: "planning-contact-notes", transform(source, id) {
    if (id.includes("planning-space.jsx?drawer-smoke-export=TaskEditor")) return `${source}\nexport { TaskEditor };`;
    if (id.includes("App.jsx?planning-contact-notes")) return `${source}\nexport { ContactEditForm, ToastContext };`;
  }, configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
    if (!req.url.startsWith("/__contact-notes")) return next();
    res.setHeader("Content-Type", "text/html");
    res.end(await vite.transformIndexHtml(req.url, '<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/planning-contact-notes.jsx"></script></body></html>'));
  }); },
}] });
await server.listen();
const origin = new URL(server.resolvedUrls.local[0]).origin;
const browser = await chromium.launch(browserLaunchOptions());
try {
  for (const [width, height] of [[320,844],[390,844],[768,844],[820,844],[1024,844],[1440,900],[1920,1080],[390,400],[1440,400]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", (route) => { errors.push("Unexpected API request"); return route.abort(); });
    await page.goto(`${origin}/__contact-notes`);
    const search = page.getByRole("textbox", { name: "Участники встречи", exact: true });
    await search.fill("Анна");
    await page.getByRole("button", { name: /Анна с длинным/ }).click();
    await page.getByRole("button", { name: /Убрать участника Анна/ }).waitFor();
    await page.screenshot({ path: `/tmp/rollapp-meeting-participants-${width}x${height}.png` });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Participant form overflows");
    await search.fill("Борис");
    await page.getByRole("button", { name: "Борис", exact: true }).click();
    await page.getByRole("button", { name: /Убрать участника Борис/ }).click();
    await search.fill("Никого");
    await page.getByRole("status").filter({ hasText: "Контакты не найдены." }).waitFor();
    await search.fill("Ошибка");
    await page.getByRole("status").filter({ hasText: "Поиск временно недоступен" }).waitFor();
    await page.getByRole("button", { name: "Повторить поиск" }).click();
    await search.fill("");
    await page.getByRole("textbox", { name: "Название", exact: true }).fill("Ошибка сохранения");
    await page.getByRole("button", { name: "Сохранить", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Не удалось сохранить встречу" }).waitFor();
    await page.getByRole("button", { name: /Убрать участника Анна/ }).waitFor();
    await page.getByRole("textbox", { name: "Название", exact: true }).fill("Встреча");
    await page.getByRole("button", { name: "Сохранить", exact: true }).click();
    await page.waitForFunction(() => JSON.parse(document.querySelector("[data-saved]").textContent));
    const saved = JSON.parse(await page.locator("[data-saved]").textContent());
    assert.deepEqual(saved.contactIds, ["anna"]);
    assert.equal(saved.description, "Договорились о следующем шаге.");
    await page.goto(`${origin}/__contact-notes`);
    await page.getByRole("textbox", { name: "Участники встречи", exact: true }).fill("Анна");
    await page.getByRole("button", { name: /Анна с длинным/ }).click();
    await page.getByRole("button", { name: width < 768 ? "Назад" : "Закрыть задачу", exact: true }).click();
    await page.getByRole("textbox", { name: "Участники встречи", exact: true }).waitFor({ state: "hidden" });
    assert.equal(JSON.parse(await page.locator("[data-saved]").textContent()), null, "Cancel saved participants");
    await page.waitForURL((url) => !url.searchParams.has("formScreen"));
    await page.goto(`${origin}/__contact-notes?contact`);
    const notes = page.getByRole("region", { name: "Заметки из To Do" });
    await notes.scrollIntoViewIfNeeded();
    await page.evaluate(() => document.fonts.ready);
    assert.match(await notes.textContent(), /19.10.2026 · 10:00/);
    assert.match(await notes.textContent(), /Вторая строка заметки/);
    assert.equal(await page.getByRole("textbox", { name: "Заметки", exact: true }).inputValue(), "Моя личная заметка");
    const bounds = await page.evaluate(() => {
      const region = document.querySelector('[aria-label="Заметки из To Do"]');
      return { root: document.documentElement.scrollWidth <= innerWidth + 1, children: [...region.querySelectorAll("*")].every((el) => { const box = el.getBoundingClientRect(); return box.left >= -1 && box.right <= innerWidth + 1; }), body: getComputedStyle(region.querySelector("section > p:last-child")).fontSize };
    });
    assert(bounds.root && bounds.children, `Notes overflow at ${width}x${height}`);
    assert.equal(bounds.body, "18px");
    await page.screenshot({ path: `/tmp/rollapp-contact-notes-${width}x${height}.png` });
    assert.deepEqual(errors, []);
    console.log(`PASS contact notes ${width}x${height}: participants/search/empty/error/save, personal notes preserved, meeting history layout`);
    await page.close();
  }
} finally { await browser.close(); await server.close(); }
