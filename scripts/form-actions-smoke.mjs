import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { chromium } from "playwright-core";
import { createServer } from "vite";

let executablePath;
for (const candidate of [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean)) {
  try { await access(candidate); executablePath = candidate; break; } catch {}
}
assert(executablePath, "Install Chrome or set CHROME_PATH");
const server = await createServer({ cacheDir: "node_modules/.vite-form-actions", server: { host: "127.0.0.1", port: 5198, strictPort: true, hmr: false, watch: null }, plugins: [{
  name: "form-actions-fixture",
  transform(source, id) {
    if (id.endsWith("/src/App.jsx?form-actions")) return `${source}\nexport { ContactEditForm, ToastContext, WishModal };`;
    const name = new URLSearchParams(id.split("?")[1]).get("drawer-smoke-export");
    if (name && /^[A-Z][A-Za-z]+$/.test(name) && id.includes("/src/") && !source.includes(`export function ${name}`)) return `${source}\nexport { ${name} };`;
  },
  configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
    if (!req.url.startsWith("/__form-actions")) return next();
    const fixture = req.url.includes("flow=1") ? "mobile-form-flow" : "form-actions";
    res.setHeader("Content-Type", "text/html");
    res.end(await vite.transformIndexHtml(req.url, `<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/${fixture}.jsx"></script></body></html>`));
  }); },
}] });
await server.listen();
const browser = await chromium.launch({ executablePath, headless: true, args: process.env.CI ? ["--no-sandbox"] : [] });
async function geometry(page) {
  const row = page.locator('[data-native-form-actions]:visible');
  const result = await row.evaluate(el => {
    const rect = el.getBoundingClientRect();
    return { y: rect.y, bottom: rect.bottom, height: rect.height, position: getComputedStyle(el).position,
      buttons: [...el.querySelectorAll("button")].map(button => {
        const box = button.getBoundingClientRect();
        const style = getComputedStyle(button);
        const canvas = document.createElement("canvas"); canvas.width = canvas.height = 1;
        const paint = canvas.getContext("2d"); paint.fillStyle = style.backgroundColor; paint.fillRect(0, 0, 1, 1);
        return { name: button.ariaLabel || button.textContent.trim(), x: box.x, y: box.y, height: box.height, width: box.width,
          opacity: Number(style.opacity), backgroundAlpha: paint.getImageData(0, 0, 1, 1).data[3],
          clipped: button.scrollWidth > button.clientWidth + 1, type: button.type,
          hasForm: !!button.form, hit: button.disabled || button.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)) };
      }) };
  });
  assert.equal(result.position, "fixed", "Form actions are not fixed together");
  assert.equal(result.height, 48, "Shared action row must be 48px");
  assert.equal(result.buttons[0].name, "Назад", "Back must be first in the same row");
  assert.equal(result.buttons[0].type, "button", "Back must never submit the form");
  assert(result.buttons.some(button => button.type === "submit"), "Submit is missing from the shared action row");
  for (const button of result.buttons) {
    assert.equal(button.height, 48, `${button.name}: control size`);
    assert(Math.abs(button.y - result.y) < 1, `${button.name}: different action row`);
    assert(!button.clipped, `${button.name}: clipped label`);
    assert(button.hit, `${button.name}: action is covered`);
    assert.equal(button.opacity, 1, `${button.name}: scrolling content shows through the action`);
    assert.equal(button.backgroundAlpha, 255, `${button.name}: action background is translucent`);
    if (button.type === "submit") assert(button.hasForm, "Native form submission lost its form owner");
  }
  assert.equal(await page.getByRole("button", { name: "Назад", exact: true }).count(), 1, "Duplicate Back outside the action row");
  return result;
}
try {
  for (const width of (process.env.FORM_ACTION_WIDTHS || "320,390,640,767,768,820,1024,1440,1920").split(",").map(Number)) {
    for (const height of width === 390 ? [844, 400] : [844]) {
      for (const name of (process.env.FORM_ACTION_CASES || "task,task-new,markdown,contact,wish,medication-group,conference,coaching-edit").split(",")) {
        const page = await browser.newPage({ viewport: { width, height } }), errors = [];
        page.setDefaultTimeout(10000);
        page.on("pageerror", error => errors.push(error.message));
        // Wish list metadata is a read effect: reject it without replacement.
        // Every mutation is forbidden; no accounts or database records exist here.
        await page.route("**/api/**", route => { if (route.request().method() !== "GET") errors.push("Unexpected API mutation"); return route.abort(); });
        await page.goto(`http://127.0.0.1:5198/__form-actions?form=${name}`);
        if (width < 768) {
          const screen = page.locator('[data-mobile-form-page]:visible'); await screen.waitFor();
          await page.locator('[data-native-form-actions]:visible').waitFor(); await page.evaluate(() => document.fonts.ready);
          const before = await geometry(page);
          if (name === "task" && width === 390 && height === 844) {
            for (const action of await page.locator('[data-native-form-actions] button').all()) {
              await action.hover();
              await action.evaluate(async button => Promise.all(button.getAnimations().map(animation => animation.finished.catch(() => {}))));
              await geometry(page);
            }
          }
          if (name === "task-new") {
            const save = screen.getByRole("button", { name: "Сохранить", exact: true });
            assert(await save.isDisabled(), "Empty task must not be submittable");
            const disabledColor = await save.evaluate(button => getComputedStyle(button).backgroundColor);
            await screen.getByRole("textbox", { name: "Название", exact: true }).fill("Несохранённая задача");
            assert(await save.isEnabled(), "Valid title must enable Save");
            assert.notEqual(await save.evaluate(button => getComputedStyle(button).backgroundColor), disabledColor, "Disabled state lost its color distinction");
            await save.hover();
            await save.evaluate(async button => Promise.all(button.getAnimations().map(animation => animation.finished.catch(() => {}))));
            await geometry(page);
          }
          if (name === "contact") {
            await screen.getByRole("button", { name: "Добавить ссылку", exact: true }).click();
            assert.equal(await screen.getByRole("textbox", { name: "Название ссылки 2", exact: true }).count(), 1, "Contact link did not add a field");
            assert.equal((await geometry(page)).y, before.y, "Adding contact fields moved the action row");
            // Base UI may retain inline overflow:scroll; only an actual overflow
            // would create a competing vertical scroll owner on the native page.
            const contactViewport = await screen.locator('[data-slot="scroll-area-viewport"]').evaluate(el => ({ height: el.clientHeight, content: el.scrollHeight, top: el.scrollTop }));
            assert(contactViewport.content <= contactViewport.height + 1 && contactViewport.top === 0, "Contact retained a nested scroll owner");
          }
          if (["coaching-edit", "contact"].includes(name)) {
            for (const bottom of [true, false]) {
              const frames = await page.evaluate(async bottom => {
                const samples = [], start = performance.now();
                scrollTo({ top: bottom ? document.documentElement.scrollHeight : 0, behavior: "smooth" });
                await new Promise(resolve => {
                  const sample = () => {
                    const row = document.querySelector('[data-native-form-actions]');
                    samples.push({ scroll: scrollY, buttons: [...row.querySelectorAll("button")].map(button => {
                      const box = button.getBoundingClientRect();
                      return { x: box.x, y: box.y, height: box.height, width: box.width };
                    }) });
                    if (performance.now() - start < 800) requestAnimationFrame(sample); else resolve();
                  };
                  requestAnimationFrame(sample);
                });
                return samples;
              }, bottom);
              assert(new Set(frames.map(frame => frame.scroll)).size > 3, `Motion check did not scroll the ${name} editor`);
              assert(frames.every(frame => frame.buttons.length === before.buttons.length && frame.buttons.every((box, i) =>
                Math.abs(box.y - before.y) < 1 && box.height === 48 && Math.abs(box.x - before.buttons[i].x) < 1 && Math.abs(box.width - before.buttons[i].width) < 1
              )), `${name}: Back, Save and Delete separated or resized during animated scrolling`);
            }
          }
          for (const ratio of [0, 0.5, 1, 0]) {
            await page.evaluate(ratio => scrollTo({ top: document.documentElement.scrollHeight * ratio, behavior: "instant" }), ratio);
            const after = await geometry(page);
            assert.equal(after.y, before.y, "Save and Back moved when scrolling");
          }
          const field = screen.locator('input:not([type="hidden"]):not([type="file"]),textarea').filter({ visible: true }).last();
          await field.scrollIntoViewIfNeeded();
          const box = await field.boundingBox();
          assert(box.y < before.y && box.y + Math.min(28, box.height) <= before.y, "Last field cannot be revealed above actions");
          await page.evaluate(() => {
            Object.defineProperties(visualViewport, { height: { configurable: true, value: 280 }, offsetTop: { configurable: true, value: 40 } });
            visualViewport.dispatchEvent(new Event("resize"));
          });
          await page.waitForFunction(() => document.documentElement.hasAttribute("data-overlay-keyboard"));
          const keyboard = await geometry(page);
          assert.equal(keyboard.bottom, 304, "Keyboard/panning must keep the entire row 16px above the visual bottom");
          await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
          assert.equal((await geometry(page)).y, keyboard.y);
          await page.evaluate(() => { delete visualViewport.height; delete visualViewport.offsetTop; visualViewport.dispatchEvent(new Event("resize")); });
          await page.waitForFunction(() => !document.documentElement.hasAttribute("data-overlay-keyboard"));
          assert.equal((await geometry(page)).y, before.y);
          assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Horizontal overflow");
          if (width === 390 && height === 844) await page.screenshot({ path: `/tmp/rollapp-form-actions-${name}.png` });
          await screen.getByRole("button", { name: "Назад", exact: true }).click(); await screen.waitFor({ state: "hidden" });
        } else {
          await page.locator('[data-slot="drawer-popup"]').waitFor();
          assert.equal(await page.locator('[data-native-form-actions]').count(), 0, "Desktop footer changed to native action row");
        }
        assert.deepEqual(errors, [], `${name}: browser errors`);
        console.log(`PASS ${width}×${height} ${name}: ${width < 768 ? "one fixed row, scroll, keyboard, form owner, Back" : "desktop Drawer"}`);
        await page.close();
      }
    }
  }
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.route("**/api/**", route => route.abort());
  await page.goto("http://127.0.0.1:5198/__form-actions?flow=1");
  await page.getByRole("button", { name: "Открыть группу", exact: true }).click();
  await page.getByRole("button", { name: "Добавить запись", exact: true }).click();
  const screen = page.locator('[data-mobile-form-page]:visible');
  await screen.getByRole("textbox", { name: "Черновик", exact: true }).fill("Черновик");
  await screen.getByRole("button", { name: "Заблокировать", exact: true }).click();
  await screen.getByRole("button", { name: "Назад", exact: true }).click(); assert(await screen.isVisible(), "Busy Back discarded draft");
  await screen.getByRole("button", { name: "Разблокировать", exact: true }).click();
  await screen.getByRole("textbox", { name: "Черновик", exact: true }).press("Enter");
  await screen.waitFor({ state: "hidden" });
  assert.equal(await page.locator('[data-saved]').getAttribute("data-saved"), "1", "Native Enter submitted more than once or lost form ownership");
  console.log("PASS StrictMode, native Enter submit, one save, busy Back");
  await page.close();
} catch (error) {
  for (const context of browser.contexts()) for (const page of context.pages()) {
    await page.screenshot({ path: "/tmp/rollapp-form-actions-failure.png" });
    console.error("FAIL STATE", page.url());
  }
  throw error;
} finally { await browser.close(); await server.close(); }
