import assert from "node:assert/strict";

export async function checkPlaceholders(browser, origin) {
  for (const [width, height] of [[320,844],[390,844],[390,400],[768,844],[820,844],[1024,844],[1440,844],[1920,844]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/api/**", route => { errors.push("Unexpected API request"); return route.abort(); });
    await page.goto(`${origin}/__text-edit?source=${encodeURIComponent("<p>До пустых блоков</p><p></p><p></p><p>Моя роль — визионер</p>")}`);
    const editor = page.getByRole("textbox", { name: "О себе", exact: true });
    await editor.locator("p").nth(3).waitFor();
    await page.evaluate(() => document.fonts.ready);
    const before = await editor.evaluate(el => el.editor.getJSON());
    const empty = editor.locator("p").nth(1);
    await empty.click();
    await page.waitForFunction(() => document.querySelectorAll('.inline-editor__content [data-placeholder]').length === 1);
    await page.screenshot({ path: `/tmp/rollapp-placeholder-${width}-${height}.png` });
    const hint = await empty.evaluate(el => {
      const style = getComputedStyle(el, "::before");
      return { content: style.content, whiteSpace: style.whiteSpace, overflow: style.overflowX, maxWidth: style.maxWidth, textOverflow: style.textOverflow, position: style.position, height: parseFloat(style.height), lineHeight: parseFloat(style.lineHeight), width: parseFloat(style.width), parentWidth: el.getBoundingClientRect().width };
    });
    assert(hint.content.includes("выбора блока"));
    assert.equal(hint.whiteSpace, "nowrap", "A long empty-block hint must not wrap over the next authored line");
    assert.equal(hint.overflow, "hidden");
    assert.equal(hint.maxWidth, "100%");
    assert.equal(hint.textOverflow, "ellipsis");
    assert.equal(hint.position, "absolute", "The hint must not add a line to the authored block");
    assert.equal(hint.height, hint.lineHeight, "The clipped hint must retain one visible line of glyphs");
    assert(hint.height > 0 && hint.width > 0 && hint.width <= hint.parentWidth + 1);
    assert.equal(await editor.locator("[data-placeholder]").count(), 1, "Only the current empty block shows a hint");
    await editor.locator("p").nth(2).click();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await editor.locator("[data-placeholder]").count(), 1, "Moving through empty neighbours must not accumulate hints");
    assert.equal(await editor.locator("p").nth(1).getAttribute("data-placeholder"), null);
    await editor.locator("p").nth(3).click();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await editor.locator("[data-placeholder]").count(), 0, "Moving to a populated block leaves no stale empty hints");
    assert.equal(await editor.evaluate(el => el.editor.state.selection.$anchor.parent.textContent), "Моя роль — визионер");
    assert.deepEqual(await editor.evaluate(el => el.editor.getJSON()), before);
    assert.equal(await page.evaluate(() => window.inlineTest.saves.length), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await page.goto(`${origin}/__text-edit?source=${encodeURIComponent("```\n\n```\n\nAfter")}`);
    const code = editor.locator("pre");
    await code.waitFor();
    await code.click();
    await page.waitForFunction(() => document.querySelector('.inline-editor__content pre[data-placeholder]'));
    const inset = await code.evaluate(el => {
      const block = getComputedStyle(el), hint = getComputedStyle(el, "::before");
      return { blockInline: block.paddingInlineStart, blockTop: block.paddingTop, hintInline: hint.paddingInlineStart, hintTop: hint.paddingTop, visibleHeight: parseFloat(hint.height) - parseFloat(hint.paddingTop) - parseFloat(hint.paddingBottom), lineHeight: parseFloat(hint.lineHeight) };
    });
    await page.screenshot({ path: `/tmp/rollapp-placeholder-code-${width}-${height}.png` });
    assert.equal(inset.hintInline, inset.blockInline, "Code hints retain the code's real text inset");
    assert.equal(inset.hintTop, inset.blockTop, "Code hints retain the code's first-line baseline");
    assert(inset.visibleHeight >= inset.lineHeight - 1, "Code hint glyphs must not be clipped by inherited padding");
    assert.equal(await page.evaluate(() => window.inlineTest.saves.length), 0);
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`PASS placeholder ${width}x${height}: one bounded line, current block only, native caret and exact document, no saves/API`);
  }
}
