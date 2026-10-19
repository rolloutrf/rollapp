import assert from "node:assert/strict";
import { IDENTITY_QUESTION_TITLES } from "../shared/identity-questions.js";

export async function checkTextBlockMenu(browser, origin) {
  for (const [width, height] of [[320,844],[390,844],[390,400],[768,844],[820,844],[1024,844],[1440,844],[1920,844]]) {
    const page = await browser.newPage({ viewport: { width, height } }), errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/api/**", route => { errors.push("Unexpected API request"); return route.abort(); });
    const editor = page.getByRole("textbox", { name: "О себе", exact: true });
    const menu = page.getByRole("dialog", { name: "Действия текстового блока", exact: true });
    const search = menu.getByRole("searchbox", { name: "Поиск действий блока", exact: true });
    const source = "До\n\n**Мысль** и текст\n\nПосле";
    const load = async (value = source, extra = "") => { await page.goto(`${origin}/__text-edit?source=${encodeURIComponent(value)}${extra}`); await editor.waitFor(); };
    const json = () => editor.evaluate(el => el.editor.getJSON());
    const open = async (owner = editor) => { await owner.press("ControlOrMeta+/"); await search.waitFor(); await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Поиск действий блока"); };
    const run = async query => { await search.fill(query); await search.press("Enter"); await menu.waitFor({ state: "hidden" }); };
    const undo = async (owner = editor) => { await owner.press("ControlOrMeta+z"); };
    await load(); await editor.locator("p").nth(1).click();
    const original = await json();
    await open(); await search.fill("несуществующее действие"); await menu.getByRole("status").waitFor();
    await search.press("Enter"); assert(await menu.isVisible());
    await search.press("Escape"); await menu.waitFor({ state: "hidden" });
    await page.waitForTimeout(900); assert.equal(await page.evaluate(() => window.inlineTest.saves.length), 0);
    assert.deepEqual(await json(), original, "Opening, filtering and cancelling never edit prose");
    await open(); await run("heading 2");
    assert.equal((await json()).content[1].type, "heading"); assert.equal((await json()).content[1].attrs.level, 2);
    assert.equal((await json()).content[1].content[0].marks[0].type, "bold");
    await undo(); assert.deepEqual(await json(), original, "Type conversion is one Undo");
    await open(); await search.fill("red");
    assert.equal(await menu.locator('button[aria-pressed="true"]').textContent(), "Красный текст блока");
    await search.press("Enter"); await menu.waitFor({ state: "hidden" });
    assert.equal((await json()).content[1].attrs.blockColor, "red");
    await undo(); assert.deepEqual(await json(), original);
    await open(); await run("duplicate"); assert.equal((await json()).content.length, 4);
    await undo(); assert.deepEqual(await json(), original);
    await open(); await run("delete"); assert.equal((await json()).content.length, 2);
    await undo(); assert.deepEqual(await json(), original);
    await open(); await run("move up"); assert.equal((await json()).content[0].content[0].text, "Мысль");
    await undo(); assert.deepEqual(await json(), original);
    // Query caret keys remain native; result navigation does not insert text.
    await open(); await search.fill("heading"); await search.press("ArrowDown"); await search.press("Enter");
    assert.equal((await json()).content[1].attrs.level, 2); await undo();
    await open(); await search.fill("фон"); await search.press("ArrowUp");
    const selected = menu.locator('button[aria-pressed="true"]');
    assert(await selected.evaluate(el => { const a = el.getBoundingClientRect(), b = el.closest('[role="dialog"]').getBoundingClientRect(); return a.top >= b.top && a.bottom <= b.bottom + 1; }), "Last search result scrolls into view");
    const bounds = await menu.boundingBox(); assert(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width + 1 && bounds.y + bounds.height <= height + 1);
    if (width === 390 || width === 1440) await page.screenshot({ path: `/tmp/rollapp-block-menu-${width}-${height}.png` });
    await search.press("Escape");
    // Contiguous groups retain their selection while the search input owns focus.
    await editor.locator("p").first().click(); await editor.press("Escape"); await editor.press("Shift+ArrowDown");
    const grouped = await json(); await open(); await run("blue background");
    const coloured = await json(); assert.equal(coloured.content[0].attrs.blockColor, "blue_background"); assert.equal(coloured.content[1].attrs.blockColor, "blue_background"); assert.equal(coloured.content[2].attrs.blockColor, null);
    await undo(); assert.deepEqual(await json(), grouped);
    await open(); await run("duplicate"); assert.equal((await json()).content.length, 5); await undo(); assert.deepEqual(await json(), grouped);
    await open(); await run("heading 3");
    assert.deepEqual((await json()).content.map(node => node.type), ["heading", "heading", "paragraph"]);
    await undo(); assert.deepEqual(await json(), grouped, "Type conversion preserves the whole selected group");
    await editor.press("Enter");
    // Save/reload uses ordinary autosave; the search text never enters storage.
    await editor.locator("p").nth(1).click(); await open(); await run("green background");
    await page.waitForFunction(() => window.inlineTest.saved?.includes('data-block-color="green_background"'));
    const saved = await page.evaluate(() => window.inlineTest.saved);
    await load(saved); assert.equal((await json()).content[1].attrs.blockColor, "green_background");
    assert.equal(await page.evaluate(() => window.inlineTest.saves.length), 0);
    assert(await editor.evaluate(el => { const s = getComputedStyle(el); return s.borderWidth === "0px" && s.outlineStyle === "none" && s.boxShadow === "none"; }));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    if (width >= 1024) {
      await editor.locator("p").nth(1).click(); await editor.locator("p").first().hover();
      await page.getByRole("button", { name: "Переместить блок или открыть меню", exact: true }).click();
      await search.waitFor(); await run("heading 4");
      assert.equal((await json()).content[0].type, "heading", "Grip search addresses the hovered block, not the old caret");
      assert.equal((await json()).content[1].type, "paragraph"); await undo();
    }
    await editor.locator("p").nth(1).click(); await open(); await search.fill("heading 1");
    await search.evaluate(el => el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, isComposing: true })));
    assert(await menu.isVisible(), "IME confirmation must not apply a command"); await search.press("Escape");
    if (width === 390 && height === 400) {
      await load(Array.from({ length: 24 }, (_, index) => `Блок ${index + 1}: Длинный документ для проверки действий у курсора.`).join("\n\n"));
      await editor.locator("p").last().click(); await open(); await search.press("Escape");
      await open(); await menu.getByRole("button", { name: "Добавить блок ниже", exact: true }).click();
      const creator = page.getByRole("dialog", { name: "Создать блок ниже", exact: true });
      await creator.getByRole("searchbox").waitFor();
      await creator.evaluate(el => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const box = await creator.boundingBox(); assert(box.y >= 0 && box.y + box.height <= height + 1, `Deep creation handoff: ${JSON.stringify(box)}`);
      await creator.getByRole("searchbox").press("Escape");
      await page.waitForFunction(() => document.querySelector('[contenteditable=true]')?.editor.state.selection.$from.parent.textContent.startsWith("Блок 24:"));
      assert.equal(await page.evaluate(() => window.inlineTest.saves.length), 0);
    }
    if (width === 390 && height === 400) {
      await editor.locator("p").nth(1).click(); await open(); await search.fill("фон");
      await page.evaluate(() => { Object.defineProperty(visualViewport, "height", { configurable: true, value: 220 }); Object.defineProperty(visualViewport, "offsetTop", { configurable: true, value: 96 }); visualViewport.dispatchEvent(new Event("resize")); visualViewport.dispatchEvent(new Event("scroll")); });
      await page.waitForFunction(() => { const r = document.querySelector('.inline-editor__block-menu')?.getBoundingClientRect(); return r && r.top >= 111 && r.bottom <= 301; });
      await search.press("ArrowUp"); await search.press("Escape");
    }
    await load(source, "&access=1"); await editor.locator("p").nth(1).click(); await open(); await search.fill("delete");
    await page.getByRole("button", { name: "Только чтение", exact: true }).click();
    await menu.waitFor({ state: "hidden" }); await editor.press("ControlOrMeta+/"); assert.equal(await menu.count(), 0);
    assert.equal(await page.evaluate(() => window.inlineTest.saves.length), 0);
    // A selection crossing protected answers may colour text, never prompts.
    await page.goto(`${origin}/__text-edit?four=1`);
    const answers = page.getByRole("textbox", { name: "Ответы на четыре вопроса", exact: true });
    await answers.waitFor();
    await answers.evaluate(el => { const ps = el.querySelectorAll('[data-question-index] p'); const range = document.createRange(); range.setStart(ps[0].firstChild, 1); range.setEnd(ps[1].firstChild, 4); el.focus(); const s = getSelection(); s.removeAllRanges(); s.addRange(range); });
    await open(answers); await run("red");
    const titles = await answers.locator('h3[contenteditable="false"]').allTextContents();
    assert.deepEqual(titles, IDENTITY_QUESTION_TITLES);
    assert.equal(await answers.locator('p[data-block-color="red"]').count(), 2);
    await undo(answers); assert.equal(await answers.locator('p[data-block-color="red"]').count(), 0);
    assert.deepEqual(errors, []); await page.close();
    console.log(`PASS block action search ${width}×${height}: types/colors/actions, native keys, groups, one Undo, save/reload, protected answers, no frames/API`);
  }
}
