import assert from "node:assert/strict";

const frames = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const text = "Моя роль — визионер";
const paragraph = value => ({ type: "paragraph", attrs: { blockColor: null }, ...(value ? { content: [{ type: "text", text: value }] } : {}) });
const place = (block, from, to = from) => block.evaluate((el, { from, to }) => {
  const root = el.closest('[role="textbox"]');
  root.focus();
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), nodes = [];
  let node;
  while (node = walker.nextNode()) nodes.push(node);
  const point = offset => {
    for (const node of nodes) { if (offset <= node.length) return [node, offset]; offset -= node.length; }
    throw new Error("Invalid native text offset");
  };
  getSelection().setBaseAndExtent(...point(from), ...point(to));
  document.dispatchEvent(new Event("selectionchange"));
}, { from, to });

// execCommand exercises the browser's DOM-first input path without synthesizing
// a keydown. ProseMirror recognizes this native mutation and invokes its own
// synthetic Enter handler against the pre-input model. Keyboard-only tests miss
// this path on desktop Chromium; iOS WebKit uses it for normal Enter as well.
export async function checkMobileEnter(browser, origin, pageOptions = {}) {
  for (const [width, height] of [[320,844],[390,844],[390,400],[768,844],[820,844],[1024,844],[1440,844],[1920,844]]) {
    const page = await browser.newPage({ viewport: { width, height }, ...pageOptions });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/api/**", route => { errors.push("Unexpected API request"); return route.abort(); });
    const url = source => `${origin}/__text-edit?source=${encodeURIComponent(source)}`;
    const editor = page.getByRole("textbox", { name: "О себе", exact: true });
    const read = () => editor.evaluate(el => el.editor.getJSON());
    for (const mode of ["keyboard", "native"]) for (const [from, to] of [[0,0],[8,8],[text.length,text.length],[4,8],[8,4]]) {
      await page.goto(url(`До\n\n${text}\n\nПосле`));
      await editor.locator("p").nth(2).waitFor();
      await place(editor.locator("p").nth(1), from, to);
      const original = await read();
      await editor.evaluate(el => {
        window.mobileEnterEvents = [];
        for (const type of ["keydown", "input"]) el.addEventListener(type, event => window.mobileEnterEvents.push({ type, inputType: event.inputType }));
      });
      if (mode === "keyboard") await page.keyboard.press("Enter");
      else assert(await editor.evaluate(() => document.execCommand("insertParagraph")), "Native paragraph insertion must run");
      await frames(page);
      const start = Math.min(from,to), end = Math.max(from,to);
      const expected = { type: "doc", content: [paragraph("До"), paragraph(text.slice(0,start)), paragraph(text.slice(end)), paragraph("После")] };
      assert.deepEqual(await read(), expected, `${mode}/${from}/${to}: split at the original native range without moving its neighbours`);
      const caret = await editor.evaluate(el => {
        const s = getSelection();
        return { model: el.editor.state.selection.toJSON(), native: el.editor.view.posAtDOM(s.focusNode,s.focusOffset), collapsed: s.isCollapsed };
      });
      const head = paragraph("До").content[0].text.length + 2 + start + 3;
      assert.deepEqual(caret, { model: { type: "text", anchor: head, head }, native: head, collapsed: true });
      const events = await page.evaluate(() => window.mobileEnterEvents);
      if (mode === "native") {
        assert.equal(events.filter(event => event.type === "keydown").length, 0);
        assert(events.some(event => event.inputType === "insertParagraph"));
      }
      await editor.press("ControlOrMeta+z");
      assert.deepEqual(await read(), original, "Undo restores the exact unsplit text and selected content");
    }
    // Continue typing into the new block, then save/reload through the shared
    // queue. Native Backspace joins it using the same DOM-first parser path.
    await page.goto(url(text)); await editor.locator("p").waitFor();
    await place(editor.locator("p"), 8);
    await editor.evaluate(() => document.execCommand("insertParagraph")); await frames(page);
    await page.keyboard.type("Новый");
    assert.deepEqual(await read(), { type: "doc", content: [paragraph(text.slice(0,8)), paragraph(`Новый${text.slice(8)}`)] });
    const edited = await read();
    await editor.press("ControlOrMeta+s"); await page.locator('[data-save-status="saved"]').waitFor();
    const saved = await page.evaluate(() => window.inlineTest.saved);
    await page.goto(url(saved)); await editor.locator("p").nth(1).waitFor();
    assert.deepEqual(await read(), edited, "The canonical saved source retains the split and subsequent typing");
    await place(editor.locator("p").nth(1), 0);
    await editor.evaluate(() => document.execCommand("delete")); await frames(page);
    assert.deepEqual(await read(), { type: "doc", content: [paragraph(`${text.slice(0,8)}Новый${text.slice(8)}`)] });
    await editor.press("ControlOrMeta+z"); assert.deepEqual(await read(), edited);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`PASS mobile Enter ${width}x${height}: keyboard and DOM-first native split, forward/reverse ranges, exact caret/neighbours, Undo, typing/save/reload and native join, no API`);
  }
}
