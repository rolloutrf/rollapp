import assert from "node:assert/strict";

async function entry(page, name) {
  const editor = page.getByRole("textbox", { name, exact: true });
  await editor.waitFor();
  await page.waitForFunction(name => {
    const root = document.activeElement;
    const native = document.getSelection();
    const view = root?.editor?.view;
    if (root?.getAttribute("aria-label") !== name || !view || !native.isCollapsed || !root.contains(native.focusNode)) return false;
    const selection = view.state.selection;
    return selection.$head.parent.isTextblock && selection.$head.parentOffset === 0 &&
      selection.head === view.posAtDOM(native.focusNode, native.focusOffset) &&
      root.firstElementChild.contains(native.focusNode);
  }, name);
  return editor;
}

async function typeWithKeyboardViewport(page, editor, panned) {
  const index = panned ? 9 : 16;
  const paragraph = editor.locator("blockquote p").nth(index);
  const before = await paragraph.evaluate((el, panned) => {
    // Place the native caret before simulating the keyboard. A pointer can
    // land on floating editor controls after scrolling in headless Chrome.
    const editor = el.closest(".ProseMirror").editor;
    const view = editor.view;
    editor.commands.setTextSelection(view.posAtDOM(el, 0));
    view.focus();
    const native = document.getSelection();
    if (!el.contains(native.focusNode) || view.state.selection.head !== view.posAtDOM(native.focusNode, native.focusOffset)) {
      throw new Error("Expected the native caret in the keyboard test paragraph");
    }
    const line = el.getBoundingClientRect();
    window.scrollBy({ top: line.top - Math.min(280, innerHeight - 170), behavior: "instant" });
    const caret = view.coordsAtPos(view.state.selection.head);
    // Model the iOS layout/visual viewport split without resizing the page.
    const height = caret.top - 12;
    const offsetTop = panned ? Math.min(195, innerHeight - height) : 0;
    Object.defineProperties(visualViewport, {
      height: { configurable: true, value: height },
      offsetTop: { configurable: true, value: offsetTop },
    });
    visualViewport.dispatchEvent(new Event("resize"));
    const calls = [];
    const positions = [window.scrollY];
    const scroll = window.scrollBy;
    window.scrollBy = (...args) => { calls.push(args); scroll.apply(window, args); };
    const record = () => positions.push(window.scrollY);
    window.addEventListener("scroll", record);
    window.inlineCaretScroll = { calls, positions, stop() {
      window.scrollBy = scroll;
      window.removeEventListener("scroll", record);
      delete visualViewport.height;
      delete visualViewport.offsetTop;
      visualViewport.dispatchEvent(new Event("resize"));
    } };
    return { height, offsetTop, scrollY, navTop: document.querySelector(".mobile-app-navigation").getBoundingClientRect().top };
  }, panned);
  // Enter requests a PM reveal synchronously, as do DOM text transactions.
  await page.keyboard.press("Enter");
  const text = panned ? "Сдвиг" : "Клавиши";
  await page.keyboard.insertText(text);
  await page.waitForFunction(text => window.inlineTest.saved?.includes(text), text);
  const after = await editor.evaluate(el => {
    const view = el.editor.view;
    const caret = view.coordsAtPos(view.state.selection.head);
    const navTop = document.querySelector(".mobile-app-navigation").getBoundingClientRect().top;
    const native = getSelection();
    const { calls, positions } = window.inlineCaretScroll;
    return { caret, navTop, scrollY, calls, positions,
      focused: document.activeElement === el && view.state.selection.head === view.posAtDOM(native.focusNode, native.focusOffset) };
  });
  assert(after.caret.top >= before.offsetTop && after.caret.bottom <= after.navTop - 8, JSON.stringify({ before, after }));
  if (panned) {
    assert(after.caret.bottom > before.height, "Caret is below the unshifted viewport used by ProseMirror");
    assert.deepEqual(after.calls, [], `A visible caret needs no corrective scroll. ${JSON.stringify({ before, after })}`);
    assert(after.positions.every(position => position === before.scrollY), "Visible caret stays stationary throughout typing");
    assert.equal(after.scrollY, before.scrollY, "Typing and autosave preserve page position");
  } else {
    assert(after.calls.length <= 1 && after.calls.every(([scroll]) => scroll.behavior === "instant" && scroll.top > 0),
      `At most one app correction for a clipped caret. ${JSON.stringify({ before, after })}`);
    assert(after.scrollY > before.scrollY && after.positions.every((position, index, positions) => !index || position >= positions[index - 1]),
      `Native and app scrolling must not reverse direction during reveal. ${JSON.stringify({ before, after })}`);
    assert(Math.abs(after.navTop - 8 - after.caret.bottom) <= 5, "Reveal only as far as the navigation clearance");
  }
  assert(after.focused, "Typing and autosave preserve the native caret");
  await editor.evaluate(() => window.inlineCaretScroll.stop());
}

export async function checkStatementEntry(browser, origin, viewports, device = {}) {
  const source = Array.from({ length: 35 }, (_, index) => `> Тезис ${index + 1}. Текст для проверки.`).join("\n\n");
  for (const [width, height] of viewports) {
    const context = await browser.newContext({ ...device, viewport: { width, height } });
    const page = await context.newPage();
    page.setDefaultTimeout(60_000);
    await page.addInitScript(value => { window.inlineFixtureSource = value; }, source);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/api/**", route => { errors.push("Unexpected API request"); return route.abort(); });
    const url = `${origin}/app/spheres/identity?tab=theses&__text_fixture=1&chrome=1&identity=1&statement=theses&statement-loading=1`;
    try {
      await page.addInitScript(() => {
        // Track the loading state even if the next step starts after it ends.
        new MutationObserver(() => {
          if ([...document.querySelectorAll('[role="status"]')].some(el => el.textContent === "Загружаем…")) {
            window.inlineStatementWaitedForContent = !document.activeElement.isContentEditable;
          }
        }).observe(document, { subtree: true, childList: true });
      });
      await page.goto(url, { waitUntil: "commit" });
      const theses = await entry(page, "Тезисы");
      assert.equal(await page.evaluate(() => window.inlineStatementWaitedForContent), true);
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.evaluate(() => window.inlineTest.saves.length), 0, "Entry never saves the document");
      await page.keyboard.insertText("Первый ");
      assert.match(await theses.locator("blockquote").first().textContent(), /^Первый Тезис 1\./);
      await page.waitForFunction(() => window.inlineTest.saved?.includes("Первый Тезис"));
      await page.evaluate(() => window.scrollTo({ top: 950, behavior: "instant" }));
      const select = page.getByRole("combobox", { name: "Раздел сервиса Идентичность" });
      const activate = locator => device.hasTouch ? locator.tap() : locator.click();
      await page.evaluate(() => { window.inlineStatementWaitedForContent = false; });
      await activate(select);
      await activate(page.getByRole("option", { name: "Принципы", exact: true }));
      const principles = await entry(page, "Принципы");
      assert.equal(await page.evaluate(() => window.inlineStatementWaitedForContent), true);
      assert.equal(await principles.textContent(), "");
      assert.equal(await page.evaluate(() => window.inlineTest.saves.length), 1, "Switching sections never saves either document");
      await page.keyboard.insertText("Первый принцип");
      assert.equal(await principles.textContent(), "Первый принцип");
      await page.waitForFunction(() => window.inlineTest.saved === "Первый принцип");
      await activate(select);
      await activate(page.getByRole("option", { name: "Тезисы", exact: true }));
      await entry(page, "Тезисы");
      if (width < 768) {
        await typeWithKeyboardViewport(page, theses, true);
        await typeWithKeyboardViewport(page, theses, false);
      }

      await page.goto(`${url}&statement-readonly=1`, { waitUntil: "commit" });
      await theses.waitFor();
      assert.equal(await theses.getAttribute("contenteditable"), "false");
      assert.equal(await theses.evaluate(el => document.activeElement === el), false);
      assert.equal(await page.evaluate(() => window.inlineTest.saves.length), 0);
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
    console.log(`PASS statement entry ${browser.browserType().name()} ${width}×${height}: section switch, first-line typing, read-only${width < 768 ? ", panned viewport and stable typing" : ""}`);
  }
}
