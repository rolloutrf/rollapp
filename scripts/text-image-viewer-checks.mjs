import assert from "node:assert/strict";
import { MarkdownManager } from "@tiptap/markdown";
import { inlineEditorExtensions } from "../src/lib/inline-editor-extensions.js";
const manager = new MarkdownManager({ extensions: inlineEditorExtensions() });
const frames = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
export async function checkImageViewer(browser, origin) {
  const p = text => ({ type: "paragraph", content: [{ type: "text", text }] });
  const source = manager.serialize({ type: "doc", content: [p("Before"), { type: "captionedImage", content: [
    { type: "image", attrs: { src: "/__viewer.svg", alt: "Viewer diagram", title: "Keep metadata", width: 240, height: 180 } },
    { type: "imageCaption", content: [{ type: "text", text: "Keep caption" }] },
  ] }, p("After")] });
  for (const [width, height] of [[320,844],[390,844],[390,400],[768,844],[820,844],[1024,844],[1440,844],[1920,844]]) {
    const page = await browser.newPage({ viewport: { width, height } }), errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/api/**", route => { errors.push("Unexpected API"); return route.abort(); });
    await page.route("**/__viewer.svg", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#555"/><circle cx="400" cy="300" r="180" fill="#eee"/></svg>' }));
    for (const readonly of [false, true]) {
      await page.goto(`${origin}/__text-edit?source=${encodeURIComponent(source)}${readonly ? "&readonly=1" : ""}`);
      // Base UI correctly hides the document from accessibility while modal.
      const root = page.locator('.inline-editor__content[aria-label="О себе"]'), image = root.locator("img");
      await image.waitFor(); await image.evaluate(el => el.decode()); await page.evaluate(() => document.fonts.ready);
      const before = await root.evaluate(el => el.editor.getJSON());
      assert.equal(await root.getByRole("img", { name: "Viewer diagram", exact: true }).count(), 1, "Viewer affordances retain native image role and authored alt name");
      const dialog = page.getByRole("dialog", { name: "Просмотр изображения", exact: true });
      if (readonly) await image.press("Enter"); else await image.dblclick();
      await dialog.waitFor(); await dialog.locator("img").evaluate(el => el.decode()); await frames(page);
      assert.deepEqual(await root.evaluate(el => el.editor.getJSON()), before);
      assert.equal(await page.locator('[data-image-resize]').count(), 0);
      assert.equal(await page.getByRole("toolbar", { name: "Форматирование выделенного текста" }).count(), 0);
      const geometry = await dialog.evaluate(el => {
        const box = el.getBoundingClientRect(), image = el.querySelector("img").getBoundingClientRect();
        return { box: box.toJSON(), image: image.toJSON(), overflow: document.documentElement.scrollWidth > innerWidth + 1,
          controls: [...el.querySelectorAll('[data-control-icon]')].map(n => { const r = n.getBoundingClientRect(); return [r.width, r.height]; }) };
      });
      assert.equal(geometry.overflow, false);
      assert(geometry.box.x >= -1 && geometry.box.y >= -1 && geometry.box.right <= width + 1 && geometry.box.bottom <= height + 1, JSON.stringify(geometry));
      assert(geometry.image.x >= -1 && geometry.image.right <= width + 1 && geometry.image.bottom <= height + 1, JSON.stringify(geometry));
      assert.deepEqual(geometry.controls, [[48,48],[48,48]]);
      await dialog.getByRole("button", { name: "Увеличить изображение", exact: true }).click();
      await dialog.getByRole("button", { name: "Уместить изображение", exact: true }).click();
      await page.screenshot({ path: `/tmp/rollapp-viewer-${readonly ? "reader" : "editor"}-${width}-${height}.png` });
      await page.keyboard.press("Escape"); await dialog.waitFor({ state: "hidden" }); await frames(page);
      assert.deepEqual(await root.evaluate(el => el.editor.getJSON()), before);
      assert.equal(await page.evaluate(() => window.inlineTest.saves.length), 0, "Viewing never saves");
      assert.equal(await root.evaluate(el => document.activeElement === el || el.contains(document.activeElement)), true, "Still-owned focus returns to the source");
      if (!readonly) {
        await image.click(); await root.press("Alt+Enter"); await dialog.waitFor();
        await dialog.getByRole("button", { name: "Закрыть просмотр изображения", exact: true }).click(); await dialog.waitFor({ state: "hidden" });
        assert.deepEqual(await root.evaluate(el => el.editor.getJSON()), before);
      }
    }
    await page.goto(`${origin}/__text-edit?source=${encodeURIComponent(source)}&twins=1&access=1`);
    const root = page.locator('.inline-editor__content[aria-label="О себе"]'), dialog = page.getByRole("dialog", { name: "Просмотр изображения", exact: true });
    await root.locator("img").waitFor(); await root.locator("img").evaluate(el => el.decode());
    const before = await root.evaluate(el => el.editor.getJSON());
    await root.locator("img").dblclick(); await dialog.waitFor();
    await root.evaluate(el => el.editor.commands.setTextSelection(1));
    await dialog.waitFor({ state: "hidden" });
    assert.deepEqual(await root.evaluate(el => el.editor.getJSON()), before, "Selection cancellation is not a document edit");
    await root.locator("img").dblclick(); await dialog.waitFor();
    await page.getByRole("button", { name: "Только чтение", exact: true, includeHidden: true }).evaluate(el => el.click());
    await dialog.waitFor({ state: "hidden" }); await frames(page);
    assert.equal(await root.getAttribute("contenteditable"), "false");
    assert.deepEqual(await root.evaluate(el => el.editor.getJSON()), before);
    await root.locator("img").press("Enter"); await dialog.waitFor();
    await root.evaluate(el => el.editor.commands.setContent({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Replacement source" }] }] }, { emitUpdate: false }));
    await dialog.waitFor({ state: "hidden" });
    assert.equal(await root.evaluate(el => el.editor.getText()), "Replacement source", "Source cancellation must not restore old content");
    assert.equal(await page.evaluate(() => window.inlineTest.saves.length), 0);
    assert.equal(await page.locator('.inline-editor__content[aria-label="Второй документ"]').evaluate(el => el.editor.getText()), "Второй документ");
    assert.deepEqual(errors, []); await page.close();
    console.log(`PASS image viewer ${width}x${height}: editor/reader keyboard and pointer, caption/attrs, zoom/Escape/focus,48px controls, no saves/API`);
  }
}
