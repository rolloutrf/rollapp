import assert from "node:assert/strict";

// Exercise actual menu choices, typing, native Tab and undo. Never call editor
// mutation commands from the test: the UI must put the caret in the right node.
export async function checkTextBasicBlocks(browser, origin) {
  const sizes = [[320,844],[390,844],[390,400],[768,844],[820,844],[1024,844],[1440,844],[1920,844]];
  for (const [width, height] of sizes) {
    for (const [id, alias, label, selector, typed] of [
      ["codeBlock", "code", "Код", "pre code", "**буквально** > []"],
      ["horizontalRule", "divider", "Разделитель", "hr", "После разделителя"],
      ["table", "table", "Таблица", "table", "Ячейка 1"],
    ]) {
      const page = await browser.newPage({ viewport: { width, height } });
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/api/**", route => { errors.push("Unexpected API request"); return route.abort(); });
      await page.addInitScript(() => { window.inlineFixtureSource = "До\n\nПосле"; });
      await page.goto(`${origin}/__text-edit?basic=1`);
      const editor = page.getByRole("textbox", { name: "О себе", exact: true });
      await editor.locator("p").first().click();
      let original;
      // Both the common insertion picker and slash catalog must create every type.
      if (width === 390 && height === 400) {
        original = await editor.evaluate(el => el.editor.getMarkdown());
        await editor.press("ControlOrMeta+/");
        await page.getByRole("button", { name: "Добавить блок ниже", exact: true }).click();
        const search = page.getByRole("searchbox", { name: "Поиск типа блока" });
        await search.fill(alias);
        await page.getByRole("dialog", { name: "Создать блок ниже", exact: true }).getByRole("button", { name: label, exact: true }).waitFor();
        await search.press("Enter");
      } else {
        await editor.press(process.platform === "darwin" ? "Meta+ArrowRight" : "End");
        await editor.evaluate(el => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await editor.press("Enter");
        await editor.pressSequentially(`/${alias}`);
        await page.getByRole("group", { name: "Команды блока", exact: true }).getByRole("button", { name: label, exact: true }).waitFor();
        original = await editor.evaluate(el => el.editor.getMarkdown());
        await editor.press("Enter");
      }
      await editor.locator(selector).waitFor({ state: id === "codeBlock" ? "attached" : "visible" });
      await editor.evaluate(el => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert(await editor.evaluate(el => document.activeElement === el), `${id} must focus the document before typing`);
      await editor.pressSequentially(typed);
      let typedSteps = 1;
      if (id === "table") {
        await editor.press("Tab");
        await editor.pressSequentially("Ячейка 2");
        typedSteps = 2;
        assert.equal(await editor.locator("th").nth(0).textContent(), typed);
        assert.equal(await editor.locator("th").nth(1).textContent(), "Ячейка 2");
        assert.equal(await editor.locator("tr").count(), 3);
        assert.equal(await editor.locator("td, th").count(), 9);
      }
      if (id === "codeBlock") assert.equal(await editor.locator("strong, summary, input").count(), 0, "Code must remain literal");
      assert.deepEqual(await editor.locator(":scope > p").allTextContents(), id === "horizontalRule" ? ["До", typed, "После"] : ["До", "После"], "Creation/typing must preserve both neighbours without spacer paragraphs");
      assert.deepEqual(await editor.evaluate(el => { const nodes=[]; el.editor.state.doc.forEach(node => nodes.push(node.type.name)); return nodes; }), id === "horizontalRule" ? ["paragraph", "horizontalRule", "paragraph", "paragraph"] : ["paragraph", id, "paragraph"], "The selected block must be created between its neighbours");
      const created = await editor.evaluate(el => el.editor.getMarkdown());
      await editor.press("ControlOrMeta+s");
      await page.waitForFunction(value => window.inlineTest.saved === value, created);
      await page.screenshot({ path: `/tmp/rollapp-notion-basic-${id}-${width}-${height}.png` });
      for (let step = 0; step < typedSteps; step += 1) await editor.press("ControlOrMeta+z");
      assert.equal(await editor.locator(selector).count(), 1, "Undo of typing must retain the created block");
      await editor.press("ControlOrMeta+z");
      assert.equal(await editor.evaluate(el => el.editor.getMarkdown()), original, "One further Undo must restore the state before choosing the block");
      for (let step = 0; step < typedSteps + 1; step += 1) await editor.press("ControlOrMeta+Shift+z");
      await editor.press("ControlOrMeta+s");
      await page.waitForFunction(value => window.inlineTest.saved === value, created);
      await page.addInitScript(value => { window.inlineFixtureSource = value; }, created);
      await page.reload();
      await editor.locator(selector).waitFor({ state: id === "codeBlock" ? "attached" : "visible" });
      assert((await editor.textContent()).includes(typed));
      assert.equal(await page.evaluate(() => window.inlineTest.saves.length), 0, "Reload must not rewrite saved Markdown");
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.deepEqual(errors, []);
      await page.close();
    }
    if ((width === 390 && height === 400) || width === 1440) {
      const page = await browser.newPage({ viewport: { width, height } });
      await page.route("**/api/**", route => route.abort());
      await page.addInitScript(() => { window.inlineFixtureSource = "До\n\n**Заголовок**  \nПродолжение\n\nПосле"; });
      await page.goto(`${origin}/__text-edit?toggle-conversion=1`);
      const editor = page.getByRole("textbox", { name: "О себе", exact: true });
      await editor.locator("p").nth(1).evaluate(el => {
        el.closest('[contenteditable]').focus();
        const range=document.createRange(); range.selectNodeContents(el);
        const selection=getSelection(); selection.removeAllRanges(); selection.addRange(range);
      });
      await page.getByRole("button", { name: "Тип блока", exact: true }).click();
      await page.getByRole("searchbox", { name: "Поиск типа блока" }).fill("toggle");
      await page.getByRole("dialog", { name: "Выбрать тип блока" }).getByRole("button", { name: "Раскрывающийся список", exact: true }).click();
      const summary = editor.locator("summary");
      await summary.waitFor();
      assert.equal(await summary.locator("strong").textContent(), "Заголовок");
      assert.equal(await summary.locator("br").count(), 1);
      assert.equal(await summary.textContent(), "ЗаголовокПродолжение", "Existing text must become the toggle title");
      assert.deepEqual(await editor.locator(":scope > p").allTextContents(), ["До", "После"]);
      await editor.press("Enter");
      await editor.pressSequentially("> Вложенный");
      assert.equal(await editor.locator('[data-type="details"]').count(), 2, "A toggle can be created inside a toggle");
      await editor.press("Enter");
      await editor.pressSequentially("Внутри вложенного");
      const saved=await editor.evaluate(el => el.editor.getMarkdown());
      await editor.press("ControlOrMeta+s");
      await page.waitForFunction(value => window.inlineTest.saved === value, saved);
      await page.addInitScript(value => { window.inlineFixtureSource = value; }, saved);
      await page.reload();
      await editor.locator("summary").nth(1).waitFor();
      assert.equal(await editor.locator("summary").first().locator("strong").textContent(), "Заголовок");
      assert.equal(await editor.locator("summary").first().locator("br").count(), 1);
      assert.equal(await editor.locator("summary").nth(1).textContent(), "Вложенный");
      assert((await editor.textContent()).includes("Внутри вложенного"));
      assert.equal(await page.evaluate(() => window.inlineTest.saves.length), 0);
      await editor.press("ControlOrMeta+a");
      await editor.press("ControlOrMeta+a");
      await page.getByRole("button", { name: "Тип блока", exact: true }).click();
      await page.getByRole("searchbox", { name: "Поиск типа блока" }).fill("table");
      assert.equal(await page.getByRole("toolbar", { name: "Форматирование выделенного текста" }).count(), 0, "The selection toolbar must not cover the open block picker");
      await page.getByRole("dialog", { name: "Выбрать тип блока" }).getByRole("button", { name: "Таблица", exact: true }).click();
      await editor.locator("table").waitFor();
      await editor.evaluate(el => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await editor.pressSequentially("Новая ячейка");
      assert.equal(await editor.locator("th").first().textContent(), "Новая ячейка");
      assert.deepEqual(await editor.locator(":scope > p").allTextContents(), ["До", "После"]);
      assert((await editor.textContent()).includes("Внутри вложенного"), "Inserting after a whole-document selection must retain all nested content");
      await editor.press("ControlOrMeta+s");
      await page.locator('[data-save-status="saved"]').waitFor();
      await page.close();
    }
    console.log(`PASS Notion basic blocks ${width}x${height}: code/divider/table via slash and shared picker, immediate typing, native Tab, separate Undo, saved Markdown reload`);
  }
}
