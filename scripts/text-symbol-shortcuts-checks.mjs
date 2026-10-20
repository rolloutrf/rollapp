import assert from "node:assert/strict";

// Real keyboard input exercises ProseMirror input rules, not setContent/Markdown parsing.
export async function checkTextSymbolShortcuts(browser, origin) {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 400 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/api/**", route => { errors.push("Unexpected API request"); return route.abort(); });
    await page.addInitScript(() => { window.inlineFixtureSource = "\n"; });
    const editor = page.getByRole("textbox", { name: "О себе", exact: true });
    const cases = [
      ...[1, 2, 3, 4, 5, 6].map(level => ({ input: "#".repeat(level) + " ", selector: `h${level}` })),
      ...["- ", "* ", "+ "].map(input => ({ input, selector: 'ul:not([data-type]) > li' })),
      ...["1. ", "3. ", "a. ", "i. "].map(input => ({ input, selector: "ol > li" })),
      ...["[] ", "[ ] ", "[x] ", "[X] ", "- [ ] ", "- [x] ", "[ ]\u00a0"].map(input => ({ input, selector: 'ul[data-type="taskList"] > li', checked: /x/i.test(input) })),
      { input: "> ", selector: "summary" },
      ...['" ', '“ '].map(input => ({ input, selector: "blockquote" })),
      ...["---", "*** ", "___ "].map(input => ({ input, selector: "hr", divider: true })),
      ...["**жирный**", "__жирный__"].map(input => ({ input, selector: "strong", text: "жирный" })),
      ...["*курсив*", "_курсив_"].map(input => ({ input, selector: "em", text: "курсив" })),
      ...["~зачёркнутый~", "~~зачёркнутый~~"].map(input => ({ input, selector: "s", text: "зачёркнутый" })),
      { input: "`код`", selector: "code", text: "код" },
      { input: "[материал](https://example.org/notes)", selector: 'a[href="https://example.org/notes"]', text: "материал" },
      ...["```", "```js", "~~~python"].map(input => ({ input, selector: "pre code", enter: true })),
    ];
    for (const sample of cases) {
      await page.goto(`${origin}/__text-edit?symbols=1`);
      await editor.click().catch(async error => {
        const state = await page.locator('.inline-editor__content').evaluateAll(nodes => nodes.map(el => ({label:el.getAttribute('aria-label'),role:el.getAttribute('role'),editable:el.getAttribute('contenteditable'),hidden:el.closest('[aria-hidden="true"]')?.tagName,bounds:el.getBoundingClientRect().toJSON()})));
        const probe = () => page.evaluate(() => new Promise(resolve => { let count=0, done=false; const tick=()=>{if(done)return;count+=1;requestAnimationFrame(tick);};requestAnimationFrame(tick);setTimeout(()=>{done=true;resolve({frames:count,visibility:document.visibilityState,focus:document.hasFocus()});},500); }));
        const before=await probe(); await page.bringToFront(); const after=await probe();
        throw new Error(`${width}px before typing ${JSON.stringify(sample.input)}: ${JSON.stringify({errors,state,before,after})}; ${error.message}`);
      });
      await editor.pressSequentially(sample.input);
      if (sample.enter) await editor.press("Enter");
      await editor.locator(sample.selector).waitFor({ state: sample.enter ? "attached" : "visible", timeout: 5000 }).catch(error => { throw new Error(`${width}px typed ${JSON.stringify(sample.input)}: ${error.message}`); });
      if (sample.text) assert.equal(await editor.locator(sample.selector).textContent(), sample.text, sample.input);
      if (sample.checked !== undefined) {
        assert.equal(await editor.getByRole("checkbox").isChecked(), sample.checked, sample.input);
        assert.equal(await editor.locator('ul:not([data-type])').count(), 0, "Markdown tasks must not retain a bullet wrapper");
      }
      if (["a. ", "i. "].includes(sample.input)) {
        assert.equal(await editor.locator("ol").getAttribute("type"), sample.input[0]);
        assert.equal(await editor.locator("ol").evaluate(el => getComputedStyle(el).listStyleType), sample.input[0] === "a" ? "lower-alpha" : "lower-roman");
      }
      const formattedMarkdown = await editor.evaluate(el => el.editor.getMarkdown());
      await editor.press("ControlOrMeta+s");
      await page.waitForFunction(expected => window.inlineTest.saved === expected, formattedMarkdown).catch(async error => {
        const diagnostic = await editor.evaluate(el => ({ doc: el.editor.getJSON(), markdown: el.editor.getMarkdown(), saved: window.inlineTest.saved ?? null, saves: window.inlineTest.saves, status: document.querySelector('[data-save-status]')?.getAttribute('data-save-status'), native: { anchor: getSelection()?.anchorOffset, focus: getSelection()?.focusOffset } }));
        throw new Error(`${width}px shortcut ${JSON.stringify(sample.input)}, expected Markdown ${JSON.stringify(formattedMarkdown)}: ${JSON.stringify(diagnostic)}; ${error.message}`);
      });
      if (sample.enter) {
        await editor.press("ControlOrMeta+z");
        assert.equal(await editor.locator("p").textContent(), sample.input, "Undo must restore the typed fence");
        await editor.press("ControlOrMeta+Shift+z");
        await editor.locator("pre code").waitFor({ state: "attached" });
        await editor.pressSequentially("**буквально** # [] ~текст~");
        assert.equal(await editor.locator("strong, em, s, input").count(), 0, "Code must stay literal");
        assert.equal(await editor.locator("pre code").textContent(), "**буквально** # [] ~текст~");
      } else {
        // Backspace reverses only the automatic formatting, retaining literal symbols.
        await editor.press("Backspace");
        assert.equal(await editor.textContent(), sample.input.startsWith("- ") && sample.checked !== undefined ? sample.input.slice(2) : sample.input, `Backspace must reverse ${sample.input}`);
      }
      await page.locator("main").click({ position: { x: 1, y: 1 } });
      await page.locator('[data-save-status="saved"]').waitFor();
      assert(await page.evaluate(() => window.inlineTest.saved !== undefined), "Symbol edits must use autosave");
    }
    for (const literal of ["file_name_value", "2 * 3 = 6", "**не закончено", "[ссылка](javascript:alert)"]) {
      await page.goto(`${origin}/__text-edit?symbols=1`);
      await editor.click();
      await editor.pressSequentially(literal);
      assert.equal(await editor.textContent(), literal, "Unmatched/code-like text must stay intact");
      assert.equal(await editor.locator("strong, em, s, a").count(), 0, "Literal text must not become accidental formatting or an unsafe link");
      await page.locator("main").click({ position: { x: 1, y: 1 } });
      await page.locator('[data-save-status="saved"]').waitFor();
    }
    await page.goto(`${origin}/__text-edit?symbols=1`);
    await editor.click();
    await editor.pressSequentially("обычное **жирный** и *курсив* и ~удалено~ и `код` и [ссылка](https://example.org)");
    await editor.locator("strong").waitFor();
    await editor.locator("em").waitFor();
    await page.evaluate(() => document.fonts.ready);
    assert(await editor.locator("em").first().evaluate(el => getComputedStyle(el).fontStyle === "italic" && [...document.fonts].some(face => face.family.includes("Geist") && face.style === "italic" && face.status === "loaded")), "Italic formatting must render the real Geist italic face");
    await editor.locator("s").waitFor();
    await editor.locator("code").waitFor();
    await editor.locator('a[href="https://example.org"]').waitFor();
    await page.locator("main").click({ position: { x: 1, y: 1 } });
    await page.locator('[data-save-status="saved"]').waitFor();
    const markdown = await page.evaluate(() => window.inlineTest.saved);
    await page.screenshot({ path: `/tmp/rollapp-symbols-${width}.png` });
    await page.addInitScript(value => { window.inlineFixtureSource = value; }, markdown);
    await page.reload();
    await editor.locator("strong").waitFor();
    await editor.locator("s").waitFor();
    assert.equal(await page.evaluate(() => window.inlineTest.saves.length), 0, "Loading formatted text must not save");
    assert.deepEqual(errors, []);
    console.log(`PASS symbol shortcuts ${width}×400: ${cases.length} typed patterns, 4 literal/unsafe cases, Backspace/Undo, literal code, formatted autosave and reload`);
    await page.close();
  }
}
