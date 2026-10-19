import assert from "node:assert/strict";

export async function checkTextSelectionPosition(browser, origin) {
  for (const [width, height] of [[320, 844], [390, 844], [390, 400], [768, 844], [820, 844], [1024, 844], [1440, 844], [1920, 844]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    // Simulate a browser delivering selectionchange after its focus work. This
    // remains native DOM selection, not a ProseMirror selection command.
    await page.addInitScript(() => {
      document.addEventListener("selectionchange", event => {
        if (window.deferInlineRange) event.stopImmediatePropagation();
      }, true);
    });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/api/**", route => { errors.push("Unexpected API request"); return route.abort(); });
    await page.goto(`${origin}/__text-edit?four=1&selection=1`);
    const editor = page.getByRole('textbox', { name: 'Ответы на четыре вопроса', exact: true });
    const answers = editor.locator('[data-question-body]');
    await answers.nth(3).waitFor();
    assert.equal(await page.locator('[contenteditable="true"]').count(), 1, 'All four answers must share one editor');
    await page.evaluate(() => document.fonts.ready);
    const toolbar = page.getByRole("toolbar", { name: "Форматирование выделенного текста" });
    const geometry = () => page.evaluate(() => {
      const selection = getSelection();
      const range = selection?.rangeCount && selection.getRangeAt(0);
      const menu = [...document.querySelectorAll('.inline-editor__selection')].find(el => getComputedStyle(el).visibility === "visible");
      if (!range || !menu) return null;
      const r = range.getBoundingClientRect(), m = menu.getBoundingClientRect();
      return { selection: { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom }, menu: { x: m.x, y: m.y, width: m.width, height: m.height, bottom: m.bottom }, scroll: scrollY };
    });
    const assertAnchored = async () => {
      await toolbar.waitFor();
      await page.waitForFunction(() => document.querySelector('.inline-editor__selection')?.style.position === "fixed");
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const rects = await geometry(), { menu: m, selection: r } = rects;
      const gap = Math.min(Math.abs(r.y - m.bottom), Math.abs(m.y - r.bottom));
      assert(gap <= 12, `Toolbar must be adjacent to the selected text, not the editor origin: ${JSON.stringify(rects)}`);
      const expectedX = Math.max(16, Math.min(width - m.width - 16, r.x + r.width / 2 - m.width / 2));
      assert(Math.abs(m.x - expectedX) <= 2, `Toolbar must be centred on the real selection: ${JSON.stringify(rects)}`);
      assert(m.x >= 0 && m.y >= 0 && m.x + m.width <= width + 1 && m.bottom <= height + 1, `Toolbar must fit the viewport: ${JSON.stringify(rects)}`);
      assert.equal(await toolbar.count(), 1, "Only the selected editor may show its toolbar");
    };
    const original = await editor.evaluate(el => el.editor.getJSON());
    const focusParagraph = answers.nth(0).locator("p").nth(2);
    await focusParagraph.evaluate(el => el.scrollIntoView({ block: "center", behavior: "instant" }));
    for (const mode of ["forward", "backward", "caret"]) {
      const result = await focusParagraph.evaluate(async (paragraph, mode) => {
        const root = paragraph.closest('[contenteditable]'), editor = root.editor;
        const events = { focus: 0, blur: 0 };
        const onFocus = () => events.focus++, onBlur = () => events.blur++;
        editor.on("focus", onFocus); editor.on("blur", onBlur);
        // Ensure a real blur even if the preceding case left this editor out of focus.
        root.focus({ preventScroll: true });
        events.focus = events.blur = 0;
        window.deferInlineRange = true;
        root.blur();
        const blurred = !editor.isFocused && !root.classList.contains("ProseMirror-focused");
        root.focus({ preventScroll: true });
        const text = paragraph.firstChild, from = mode === "backward" ? 43 : 8, to = mode === "forward" ? 43 : 8;
        getSelection().setBaseAndExtent(text, from, text, to);
        const position = offset => editor.view.posAtDOM(text, offset);
        const expected = { anchor: position(from), head: position(to) };
        const native = () => ({ text: getSelection().toString(), anchor: getSelection().anchorOffset, head: getSelection().focusOffset });
        const explicit = native();
        await new Promise(resolve => setTimeout(resolve, 40));
        const early = native();
        window.deferInlineRange = false;
        document.dispatchEvent(new Event("selectionchange"));
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const after = native(), selection = editor.state.selection;
        const focused = editor.isFocused && editor.view.hasFocus() && root.classList.contains("ProseMirror-focused");
        editor.off("focus", onFocus); editor.off("blur", onBlur);
        return { explicit, early, after, expected, selection: { anchor: selection.anchor, head: selection.head }, events, blurred, focused };
      }, mode);
      assert.deepEqual(result.early, result.explicit, `${mode}: focus must preserve the native range before the delayed selection event`);
      assert.deepEqual(result.after, result.explicit, `${mode}: importing the range must preserve its direction and offsets`);
      assert.deepEqual(result.selection, result.expected, `${mode}: model must receive the exact native range`);
      assert.deepEqual(result.events, { focus: 1, blur: 1 }, "Public focus/blur callbacks must remain intact");
      assert(result.blurred && result.focused, "Editor focus state and native focus class must follow blur/return");
      if (mode === "caret") await toolbar.waitFor({ state: "hidden" });
      else await assertAnchored();
    }
    assert.deepEqual(await editor.evaluate(el => el.editor.getJSON()), original, "Focus and native selection must not edit the document");
    for (const index of [0, 2, 3, 1]) {
      const paragraph = answers.nth(index).locator("p").nth(2);
      await paragraph.evaluate(el => el.scrollIntoView({ block: "center", behavior: "instant" }));
      await paragraph.evaluate((el, backwards) => {
        el.closest('[contenteditable]').focus({ preventScroll: true });
        const text = el.firstChild;
        getSelection().setBaseAndExtent(text, backwards ? 43 : 8, text, backwards ? 8 : 43);
      }, index % 2 === 1);
      await assertAnchored();
      for (const delta of [24, -48]) {
        await page.evaluate(delta => scrollBy({ top: delta, behavior: "instant" }), delta);
        await page.waitForTimeout(100);
        await assertAnchored();
      }
      const scroll = await page.evaluate(() => scrollY);
      await page.evaluate(() => scrollTo({ top: scrollY > innerHeight ? 0 : document.documentElement.scrollHeight, behavior: "instant" }));
      await toolbar.waitFor({ state: "hidden" });
      await page.evaluate(top => scrollTo({ top, behavior: "instant" }), scroll);
      await assertAnchored();
    }
    if (width === 390 && height === 400) {
      await page.evaluate(() => {
        Object.defineProperty(visualViewport, "height", { configurable: true, value: 220 });
        Object.defineProperty(visualViewport, "offsetTop", { configurable: true, value: 96 });
        visualViewport.dispatchEvent(new Event("resize"));
        visualViewport.dispatchEvent(new Event("scroll"));
      });
      await page.waitForFunction(() => {
        const r = [...document.querySelectorAll('.inline-editor__selection')].find(el => getComputedStyle(el).visibility === "visible")?.getBoundingClientRect();
        return r && r.y >= 112 && r.bottom <= 300;
      });
      await assertAnchored();
      await page.evaluate(() => {
        delete visualViewport.height; delete visualViewport.offsetTop;
        visualViewport.dispatchEvent(new Event("resize"));
      });
      await page.waitForTimeout(100);
      await assertAnchored();
    }
    const selected = (await geometry()).selection;
    await toolbar.getByRole("button", { name: "Ссылка", exact: true }).click();
    const address = page.getByRole("textbox", { name: "Адрес ссылки" });
    await address.waitFor();
    await toolbar.waitFor({ state: "hidden" });
    await page.waitForFunction(() => document.querySelector('.inline-editor__link-panel')?.style.position === "fixed");
    const linkBox = await page.locator('.inline-editor__link-panel').boundingBox();
    assert(Math.min(Math.abs(selected.y - linkBox.y - linkBox.height), Math.abs(linkBox.y - selected.bottom)) <= 16, `Link editor must stay beside the source selection: ${JSON.stringify({ selected, linkBox })}`);
    await address.press("Escape");
    await assertAnchored();
    await page.screenshot({ path: `/tmp/rollapp-selection-position-${width}-${height}.png` });
    await editor.press("ControlOrMeta+a");
    await editor.press("ControlOrMeta+a");
    await toolbar.waitFor();
    await page.waitForTimeout(100);
    const largeSelection = await geometry();
    assert(largeSelection.selection.height > height, "Whole-editor selection must exercise a range taller than the viewport");
    const largeMenu = largeSelection.menu;
    assert(largeMenu.x >= 16 && largeMenu.y >= 16 && largeMenu.x + largeMenu.width <= width - 15 && largeMenu.bottom <= height - 15, `A tall selection must keep the toolbar reachable: ${JSON.stringify(largeSelection)}`);
    await editor.press("ArrowRight");
    await toolbar.waitFor({ state: "hidden" });
    assert.equal(await page.evaluate(() => window.inlineTest.saves.length), 0, "Selecting/scrolling must never save");
    assert.deepEqual(errors, []);
    console.log(`PASS selection position ${width}x${height}: delayed native forward/backward/caret on fresh focus, public focus/blur lifecycle, one document/four answers, first show deep, scroll follows, offscreen hides, link panel anchored, tall range fits, no writes`);
    await page.close();
  }
}
