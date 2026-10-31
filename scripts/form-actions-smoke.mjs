import { listenSmokeServer, smokePort, smokeOrigin } from "./smoke-server.mjs";
import { browserLaunchOptions } from "./browser-runtime.mjs";
import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { chromium } from "playwright-core";
import { createServer } from "vite";

let executablePath;
for (const candidate of [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean)) {
  try { await access(candidate); executablePath = candidate; break; } catch {}
}
assert(executablePath, "Install Chrome or set CHROME_PATH");
const port = smokePort(process.env.FORM_ACTION_PORT);
const server = await createServer({ cacheDir: "node_modules/.vite-form-actions", server: { host: "127.0.0.1", port, strictPort: true, hmr: false, watch: null }, plugins: [{
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
await listenSmokeServer(server);
const origin = smokeOrigin(server);
const browser = await chromium.launch({ ...browserLaunchOptions(), executablePath });
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
          radii: [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomLeftRadius, style.borderBottomRightRadius].map(parseFloat),
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
    assert(button.radii.every(radius => radius >= button.height / 2), `${button.name}: action must have pill/circular corners`);
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
      for (const name of (process.env.FORM_ACTION_CASES || "task,task-new,markdown,contact,wish,wish-edit,medication-group,conference,coaching-edit,principle,identity-test").split(",")) {
        const page = await browser.newPage({ viewport: { width, height } }), errors = [];
        page.setDefaultTimeout(10000);
        page.on("pageerror", error => errors.push(error.message));
        // Wish list metadata is a read effect: reject it without replacement.
        // Every mutation is forbidden; no accounts or database records exist here.
        await page.route("**/api/**", route => { if (route.request().method() !== "GET") errors.push("Unexpected API mutation"); return route.abort(); });
        await page.goto(`${origin}/__form-actions?form=${name}`);
        if (name === "contact") {
          const heading = page.locator('.contact-detail__edit-heading--editable');
          await heading.waitFor();
          await page.evaluate(() => document.fonts.ready);
          const parts = await heading.locator(':scope > *').evaluateAll(elements => elements.map(el => {
            const r = el.getBoundingClientRect(); return { left: r.left, right: r.right };
          }));
          assert(parts.every((part, i) => !i || part.left >= parts[i - 1].right), "Contact avatar, name and favorite overlap");
          assert.equal(await page.getByRole('button', { name: 'Удалить фото', exact: true }).count(), 0);
          assert.equal(await page.getByRole('button', { name: 'Удалить', exact: true }).count(), 0, "Ambiguous Delete action");
          const footer = page.locator('.contact-detail__edit-actions');
          assert.equal(await footer.locator('xpath=ancestor::*[@data-slot="scroll-area-viewport"]').count(), 0, "Contact actions scroll with the fields");
          if (width >= 768) {
            const viewport = page.locator('.contact-detail__scroll [data-slot="scroll-area-viewport"]');
            const before = await footer.boundingBox();
            const save = await footer.getByRole('button', { name: 'Сохранить', exact: true }).boundingBox();
            const trash = await footer.getByRole('button', { name: 'Удалить контакт', exact: true }).boundingBox();
            assert.equal(save.height, 48); assert.equal(trash.height, 48); assert.equal(trash.width, 48);
            assert.equal(save.y, trash.y, "Desktop contact actions must share one row");
            assert((await viewport.boundingBox()).y + (await viewport.boundingBox()).height <= before.y + 1, "Contact footer overlaps fields");
            await viewport.evaluate(el => { el.scrollTop = el.scrollHeight; });
            assert.equal((await footer.boundingBox()).y, before.y, "Desktop contact footer moves with scroll");
            await viewport.evaluate(el => { el.scrollTop = 0; });
          }
          if ([320, 390, 768, 820, 1024, 1440, 1920].includes(width)) await page.screenshot({ path: `/tmp/rollapp-contact-layout-${width}-${height}.png` });
        }
        // Warning colors must survive both neutral footer surfaces and hover.
        const deleteButtons = page.getByRole("button", { name: /^Удалить/ });
        for (const button of await deleteButtons.all()) {
          if (!await button.isVisible()) continue;
          for (const hover of [false, true]) {
            if (hover) {
              await button.hover();
              await button.evaluate(async el => Promise.all(el.getAnimations().map(a => a.finished.catch(() => {}))));
            }
            assert(await button.evaluate(el => {
              const probe = document.createElement("span");
              probe.style.color = "var(--destructive)"; el.append(probe);
              const expected = getComputedStyle(probe).color; probe.remove();
              return getComputedStyle(el).color === expected;
            }), `${name}: Delete lost warning color${hover ? " on hover" : ""}`);
          }
        }
        if (name === "task" && [390, 1440].includes(width)) await page.screenshot({ path: `/tmp/rollapp-delete-color-${width}.png` });
        if (name === "task") {
          await page.getByRole("button", { name: "Удалить всю серию", exact: true }).click();
          const confirm = page.getByRole("alertdialog").getByRole("button", { name: "Удалить", exact: true });
          await confirm.waitFor();
          assert(await confirm.evaluate(el => el.classList.contains("text-destructive")), "Task confirmation must use the warning variant");
          await page.getByRole("button", { name: "Отмена", exact: true }).click();
          await page.getByRole("alertdialog").waitFor({ state: "hidden" });
        }
        if (width < 768 && name !== "wish-edit") {
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
          if (name === "principle") {
            const trash = screen.getByRole("button", { name: "Удалить принцип", exact: true });
            const box = await trash.boundingBox();
            assert.equal(box.width, 48, "Principle trash must be a 48px icon control");
            assert.equal(await trash.textContent(), "", "Principle trash must be icon-only");
            assert.equal(await trash.locator("svg").count(), 1);
            await trash.click();
            await page.getByRole("alertdialog").waitFor();
            await page.getByRole("button", { name: "Отмена", exact: true }).click();
            await page.getByRole("alertdialog").waitFor({ state: "hidden" });
            await geometry(page);
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
          // Safari can report a changing innerHeight while the fixed
          // containing block retains its layout height. A bottom-inset anchor
          // then moves twice. Exercise both pan directions, including a
          // document scroll event before VisualViewport.scroll is delivered.
          for (const offset of [0, 80, 40, 0, 40]) {
            await page.evaluate(offsetTop => {
              Object.defineProperty(window, "innerHeight", { configurable: true, value: 600 });
              Object.defineProperty(visualViewport, "offsetTop", { configurable: true, value: offsetTop });
              window.dispatchEvent(new Event("scroll"));
            }, offset);
            const panned = await geometry(page);
            assert.equal(panned.bottom, offset + 280 - 16, "Keyboard actions must follow the visual top, independent of the layout bottom");
            assert.equal(await page.locator('[data-native-form-actions]:visible').evaluate(el => parseFloat(getComputedStyle(el).top)), offset + 280 - 16 - 48, "Keyboard row must anchor to the visual top");
          }
          await page.evaluate(() => { delete window.innerHeight; });
          await page.evaluate(() => { delete visualViewport.height; delete visualViewport.offsetTop; visualViewport.dispatchEvent(new Event("resize")); });
          await page.waitForFunction(() => !document.documentElement.hasAttribute("data-overlay-keyboard"));
          assert.equal((await geometry(page)).y, before.y);
          assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Horizontal overflow");
          if (width === 390 && height === 844) await page.screenshot({ path: `/tmp/rollapp-form-actions-${name}.png` });
          await screen.getByRole("button", { name: "Назад", exact: true }).click(); await screen.waitFor({ state: "hidden" });
        } else {
          await page.locator(name === "wish-edit" ? '.app-fullscreen-dialog' : '[data-slot="drawer-popup"]').waitFor();
          assert.equal(await page.locator('[data-native-form-actions]').count(), 0, "Desktop footer changed to native action row");
          const footer = page.locator('.app-form-actions');
          await footer.waitFor();
          await page.evaluate(() => document.fonts.ready);
          const buttons = await footer.locator('button').evaluateAll(elements => elements.map(el => {
            const r = el.getBoundingClientRect(), s = getComputedStyle(el);
            const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
            const paint = canvas.getContext('2d'); paint.fillStyle = s.backgroundColor; paint.fillRect(0,0,1,1);
            return { x:r.x, right:r.right, y:r.y, height:r.height, width:r.width,
              radii:[s.borderTopLeftRadius,s.borderTopRightRadius,s.borderBottomLeftRadius,s.borderBottomRightRadius].map(parseFloat),
              opacity:s.opacity, alpha:paint.getImageData(0,0,1,1).data[3], icon:el.hasAttribute('data-control-icon'),
              clipped:el.scrollWidth > el.clientWidth + 1 };
          }));
          for (const button of buttons) {
            assert.equal(button.height,48,`${name}: footer height`);
            assert(button.radii.every(radius => radius >= 24),`${name}: footer corners`);
            assert.equal(button.opacity,'1'); assert.equal(button.alpha,255);
            assert(!button.clipped && button.x >= 0 && button.right <= width,`${name}: footer label/overflow`);
            if (button.icon) assert.equal(button.width,48);
          }
          if (['wish','wish-edit','task-new'].includes(name)) await page.screenshot({path:`/tmp/rollapp-form-actions-${name}-${width}-${height}.png`});
          if (name === "principle") {
            const trash = page.getByRole("button", { name: "Удалить принцип", exact: true });
            const box = await trash.boundingBox();
            const save = await page.getByRole("button", { name: "Сохранить изменения", exact: true }).boundingBox();
            assert.equal(box.width, 48);
            assert.equal(box.height, 48);
            assert(Math.abs(box.y - save.y) < 1, "Desktop principle actions must share one row");
            assert.equal(await trash.textContent(), "");
            if (width === 1440) await page.screenshot({ path: "/tmp/rollapp-form-actions-principle-desktop.png" });
          }
        }
        assert.deepEqual(errors, [], `${name}: browser errors`);
        console.log(`PASS ${width}×${height} ${name}: ${name === "wish-edit" ? "fullscreen footer" : width < 768 ? "one fixed row, scroll, keyboard, form owner, Back" : "desktop Drawer"}`);
        await page.close();
      }
    }
  }
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.route("**/api/**", route => route.abort());
  await page.goto(`${origin}/__form-actions?flow=1`);
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
