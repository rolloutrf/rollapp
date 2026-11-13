import assert from "node:assert/strict";
const frames = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const viewports = [[320, 844], [390, 844], [390, 400], [768, 844], [820, 844], [1024, 844], [1440, 844], [1920, 844]];

export async function checkStatementAlignment(browser, origin) {
  const prose = "Первая строка начинается у края. ".repeat(10).trim();
  const source = `> ${prose}  \n> Явный перенос у края.\n\nОбычный абзац начинается там же.\n\n> Ещё одна цитата у края.`;

  for (const [section, label] of [["theses", "Тезисы"], ["principles", "Принципы"]]) {
    for (const readOnly of [false, true]) {
      const page = await browser.newPage({ viewport: { width: 320, height: 844 } });
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/api/**", route => { errors.push("Unexpected API request"); return route.abort(); });
      const params = new URLSearchParams({ statement: section, source });
      if (readOnly) params.set("statement-readonly", "");
      await page.goto(`${origin}/__text-edit?${params}`, { waitUntil: "commit" });
      const editor = page.getByRole("textbox", { name: label, exact: true });
      await editor.locator("blockquote p br").waitFor({ state: "attached", timeout: 60_000 });
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await editor.getAttribute("contenteditable"), String(!readOnly));

      for (const [width, height] of viewports) {
        await page.setViewportSize({ width, height });
        const geometry = await editor.evaluate(el => {
          const paragraphs = [...el.querySelectorAll(":scope > p, :scope > blockquote > p")];
          const range = document.createRange();
          const start = el.getBoundingClientRect().left;
          return paragraphs.map(paragraph => {
            range.selectNodeContents(paragraph);
            const offsets = [...range.getClientRects()].filter(rect => rect.width > 0).map(rect => rect.left - start);
            return { offsets, italic: getComputedStyle(paragraph).fontStyle === "italic" };
          });
        });
        assert.equal(geometry.length, 3);
        assert(geometry[0].offsets.length >= 3, "The first quote must contain wrapped and explicit lines");
        assert.deepEqual(geometry.map(block => block.italic), [true, false, true]);
        for (const { offsets } of geometry) {
          assert(offsets.length && offsets.every(offset => Math.abs(offset) < 0.5),
            `${label} (${readOnly ? "reading" : "editing"}), ${width}x${height}: all lines start at the content edge, got ${offsets.join(", ")}`);
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
        if ((width === 390 && height === 400) || width === 1440) {
          await page.screenshot({ path: `/tmp/rollapp-${section}-${width}-${height}-${readOnly ? "read" : "edit"}.png` });
        }
      }
      assert.deepEqual(await page.evaluate(() => window.inlineTest.saves), []);
      assert.deepEqual(errors, []);
      await page.close();
      console.log(`PASS statement alignment ${label} (${readOnly ? "reading" : "editing"}): ${viewports.length} viewports, first, wrapped and explicit lines`);
    }
  }
}

export async function checkQuoteStyles(browser, origin) {
  for (const [width, height] of viewports) {
    const page = await browser.newPage({ viewport: { width, height } }), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', route => { errors.push('Unexpected API request'); return route.abort(); });
    const url = (source, extra='') => `${origin}/__text-edit?source=${encodeURIComponent(source)}${extra}`;
    await page.goto(url('> Before **target** after\n\nTail'));
    const editor = page.getByRole('textbox', { name: 'О себе', exact: true });
    await editor.locator('strong').waitFor();await page.evaluate(() => document.fonts.ready);
    const read = () => editor.evaluate(el => el.editor.getJSON());
    const before = await read();
    const quoteStyle = await editor.locator('blockquote').evaluate(el => {
      const { fontStyle, fontSize, paddingInlineStart } = getComputedStyle(el);
      return { fontStyle, fontSize, paddingInlineStart };
    });
    assert.equal(quoteStyle.fontStyle, 'italic');
    assert.equal(quoteStyle.paddingInlineStart, quoteStyle.fontSize, "Ordinary quotes retain the shared 1em inset");
    await editor.locator('strong').evaluate(el => { el.closest('[role="textbox"]').focus();getSelection().setBaseAndExtent(el.firstChild,6,el.firstChild,0); });
    const toolbar = page.getByRole('toolbar', { name: 'Форматирование выделенного текста', exact: true });
    const italic = toolbar.getByRole('button', { name: 'Курсив', exact: true });
    await italic.waitFor();assert.equal(await italic.getAttribute('aria-pressed'), 'true', 'Toolbar must reflect inherited quote italic');
    await italic.click();await editor.locator('[data-inline-normal="true"]').waitFor();await frames(page);
    assert.equal(await italic.getAttribute('aria-pressed'), 'false');
    assert.equal(await editor.locator('[data-inline-normal="true"]').evaluate(el => getComputedStyle(el).fontStyle), 'normal', 'The actual selected glyphs must stop inheriting italic');
    assert.equal(await editor.locator('blockquote').evaluate(el => getComputedStyle(el).fontStyle), 'italic', 'The quote retains its default style');
    assert.equal(await editor.locator('strong').textContent(), 'target');
    const formatted = await read();assert.notDeepEqual(formatted, before);
    await editor.locator('[data-inline-normal="true"]').evaluate(el => { el.closest('[role="textbox"]').focus();getSelection().setBaseAndExtent(el.firstChild,2,el.firstChild,2); });
    await page.keyboard.type('X');await editor.press('ControlOrMeta+z');assert.deepEqual(await read(), formatted, 'Typing has its own Undo');
    await editor.press('ControlOrMeta+z');assert.deepEqual(await read(), before, 'Formatting Undo preserves the exact original document');
    await editor.press('ControlOrMeta+Shift+z');assert.deepEqual(await read(), formatted);
    await editor.press('ControlOrMeta+s');await page.locator('[data-save-status="saved"]').waitFor();
    const saved = await page.evaluate(() => window.inlineTest.saved);assert(saved.includes('data-inline-normal="true"'));
    await page.goto(url(saved));await editor.locator('[data-inline-normal="true"]').waitFor();assert.deepEqual(await read(), formatted);
    await editor.locator('[data-inline-normal="true"]').evaluate(el => { el.closest('[role="textbox"]').focus();getSelection().setBaseAndExtent(el.firstChild,0,el.firstChild,6); });
    await page.keyboard.press('ControlOrMeta+i');await frames(page);
    assert.equal(await editor.locator('[data-inline-normal="true"]').count(), 0, 'Keyboard turns italic back on');
    assert.equal(await editor.locator('strong').evaluate(el => getComputedStyle(el).fontStyle), 'italic');
    assert.equal(await editor.textContent(), 'Before target afterTail');
    await editor.press('ControlOrMeta+z');assert.deepEqual(await read(), formatted);
    if (width === 390 && height === 400) await page.screenshot({ path: '/tmp/rollapp-quote-normal-390-400.png' });
    await page.goto(url(saved, '&public=1'));
    const publicQuote = page.locator('blockquote');await publicQuote.locator('[data-inline-normal="true"]').waitFor();
    assert.equal(await publicQuote.evaluate(el => getComputedStyle(el).fontStyle), 'italic');
    assert.equal(await publicQuote.locator('[data-inline-normal="true"]').evaluate(el => getComputedStyle(el).fontStyle), 'normal');
    assert.equal(await page.locator('[contenteditable="true"]').count(), 0);
    for (const metadata of [{ target: '_self', rel: 'author', class: 'author-link', title: 'A "quoted" title' }, { target: null, rel: null, class: null, title: '' }]) {
      await page.goto(url('Seed'));await editor.waitFor();
      await editor.evaluate((el, metadata) => {
        const e = el.editor, s = e.schema, link = s.marks.link.create({ href: 'https://example.test/a)b', ...metadata });
        e.commands.setContent(s.nodes.doc.create(null, [s.nodes.blockquote.create(null, s.nodes.paragraph.create(null, [s.text('До '), s.text('фрагмент', [link, s.marks.bold.create()]), s.text(' после')])), s.nodes.paragraph.create(null, s.text('Сосед'))]).toJSON());
      }, metadata);
      const originalLink = await read();
      await editor.locator('a strong').evaluate(el => { el.closest('[role="textbox"]').focus();getSelection().setBaseAndExtent(el.firstChild,0,el.firstChild,8); });
      await page.keyboard.press('ControlOrMeta+i');await editor.locator('[data-inline-normal="true"]').waitFor();
      assert.equal(await editor.locator('[data-inline-normal="true"]').evaluate(el => getComputedStyle(el).fontStyle), 'normal');
      const normalLink = await read();
      assert.deepEqual(normalLink.content[0].content[0].content[1].marks.find(mark => mark.type === 'link').attrs, { href: 'https://example.test/a)b', ...metadata });
      await editor.press('ControlOrMeta+z');assert.deepEqual(await read(), originalLink);await editor.press('ControlOrMeta+Shift+z');assert.deepEqual(await read(), normalLink);
      await editor.press('ControlOrMeta+s');await page.locator('[data-save-status="saved"]').waitFor();const stored = await page.evaluate(() => window.inlineTest.saved);
      await page.goto(url(stored));await editor.locator('[data-inline-normal="true"]').waitFor();assert.deepEqual(await read(), normalLink);
      await page.goto(url(stored, '&public=1'));const link = page.getByRole('link', { name: 'фрагмент', exact: true });await link.waitFor();
      assert.equal(await link.getAttribute('target'), '_blank');assert.equal(await link.getAttribute('rel'), 'noopener noreferrer');assert.notEqual(await link.getAttribute('class'), 'author-link');
      assert.equal(await link.locator('[data-inline-normal="true"]').evaluate(el => getComputedStyle(el).fontStyle), 'normal');
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    assert.deepEqual(errors, []);
    await page.close();console.log(`PASS quote italic ${width}x${height}: effective toolbar and real normal glyphs, inherited default, keyboard/Undo, rich Cyrillic link metadata with quoted/empty attrs, exact reload and safe public reading`);
  }
}
