import assert from 'node:assert/strict';

export async function checkTextCodePaste(browser, origin) {
  const cases = [
    { text: '# Буквально\n- [ ] Задача\n```js\n**жирный** [ссылка](https://example.test)\n```', native: true },
    { text: '## Текст <span> и **звёздочки**', html: '<h1>Чужой заголовок</h1><p><em>Не должен появиться</em></p>', styled: true, replace: true },
    { text: '  \t  ', replace: true },
    { text: ' one\r\n\r\n two\rthree ', styled: true },
  ];
  for (const [width, height] of [[320,844],[390,844],[390,400],[768,844],[820,844],[1024,844],[1440,844],[1920,844]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    page.setDefaultTimeout(20000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', route => { errors.push('Unexpected API request'); return route.abort(); });
    for (const sample of cases) {
      const content = sample.styled ? '<span data-inline-color="blue" data-inline-background="yellow">**`alphaOMEGA`**</span>' : '`alphaOMEGA`';
      const source = `До ${content} после.\n\nСоседний абзац.`;
      await page.goto(`${origin}/__text-edit?source=${encodeURIComponent(source)}`);
      const editor = page.getByRole('textbox', { name: 'О себе', exact: true });
      await editor.locator('code').waitFor();
      await editor.locator('code').evaluate((code, replace) => {
        code.closest('[contenteditable]').focus();
        const node = document.createTreeWalker(code, NodeFilter.SHOW_TEXT).nextNode();
        const range = document.createRange(); range.setStart(node, 5); range.setEnd(node, replace ? 10 : 5);
        const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
      }, Boolean(sample.replace));
      if (sample.native) await editor.pressSequentially('T');
      const before = await editor.evaluate(el => el.editor.getJSON());
      if (sample.native) {
        await page.context().grantPermissions(['clipboard-read','clipboard-write']);
        await page.evaluate(text => navigator.clipboard.writeText(text), sample.text);
        await editor.press('ControlOrMeta+v');
      } else await editor.evaluate((el, sample) => {
        const clipboardData = new DataTransfer(); clipboardData.setData('text/plain', sample.text);
        if (sample.html) clipboardData.setData('text/html', sample.html);
        el.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
      }, sample);
      const expected = `alpha${sample.native ? 'T' : ''}${sample.text.replace(/\r\n?/g, '\n')}${sample.replace ? '' : 'OMEGA'}`;
      await page.waitForFunction(expected => document.querySelector('[aria-label="О себе"] code')?.textContent === expected, expected);
      assert.equal(await editor.locator(':scope > p').count(), 2, 'Inline paste must retain the paragraph structure');
      assert.equal(await editor.locator('h1,h2,ul,ol,pre,em,a').count(), 0, 'Inline code must not interpret Markdown or imported HTML');
      assert.equal(await editor.locator('p').last().textContent(), 'Соседний абзац.');
      const first = await editor.evaluate(el => el.editor.state.doc.child(0).toJSON());
      assert.equal(first.content.map(node => node.text || '').join(''), `До ${expected} после.`);
      const code = first.content.filter(node => node.marks?.some(mark => mark.type === 'code'));
      assert(code.every(node => !sample.styled || node.marks.some(mark => mark.type === 'bold') && node.marks.some(mark => mark.type === 'inlineStyle' && mark.attrs.color === 'blue' && mark.attrs.background === 'yellow')), 'Destination marks must survive');
      await editor.press('ControlOrMeta+z');
      assert.deepEqual(await editor.evaluate(el => el.editor.getJSON()), before, 'One Undo must restore the entire paste');
      await editor.press('ControlOrMeta+Shift+z');
      assert.equal(await editor.locator('code').textContent(), expected);
      await editor.press('ControlOrMeta+s');
      await page.waitForFunction(() => typeof window.inlineTest.saved === 'string');
      const stored = await page.evaluate(() => window.inlineTest.saved);
      await page.goto(`${origin}/__text-edit?source=${encodeURIComponent(stored)}`);
      await editor.locator('code').waitFor();
      assert.deepEqual(await editor.evaluate(el => el.editor.state.doc.child(0).toJSON()), first, 'Reload must preserve code, literal whitespace and marks exactly');
      assert.equal(await page.evaluate(() => window.inlineTest.saves.length), 0, 'Opening a saved document must not rewrite it');
      if (width === 390 && height === 400 && sample.native) await page.screenshot({ path: '/tmp/rollapp-inline-code-paste-390-400.png' });
      await page.goto(`${origin}/__text-edit?public=1&source=${encodeURIComponent(stored)}`);
      const publicCode = page.getByLabel('Опубликованный текст').locator('code');
      await publicCode.waitFor();
      assert.equal(await publicCode.textContent(), expected, 'Public reading must retain literal code');
      const reading = await publicCode.evaluate(el => ({ whitespace: getComputedStyle(el).whiteSpace, height: el.getBoundingClientRect().height, leading: parseFloat(getComputedStyle(el).lineHeight) }));
      assert.equal(reading.whitespace, 'pre-wrap');
      if (sample.native) assert(reading.height >= (expected.split('\n').length - 1) * reading.leading, 'Public code line breaks must remain visible');
    }
    const editor = page.getByRole('textbox', { name: 'О себе', exact: true });
    const paste = async data => editor.evaluate((el, data) => {
      const clipboardData = new DataTransfer();
      clipboardData.setData('text/plain', data.text);
      if (data.html) clipboardData.setData('text/html', data.html);
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
    }, data);
    const select = async selector => editor.locator(selector).first().evaluate(el => {
      el.closest('[contenteditable]').focus();
      const range = document.createRange(); range.selectNodeContents(el);
      const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    });
    await page.goto(`${origin}/__text-edit?source=${encodeURIComponent('`seed`')}`);
    await editor.locator('code').waitFor();
    await select('code');
    await paste({ text: '/heading' });
    await editor.pressSequentially(' /');
    await editor.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await editor.locator('code').textContent(), '/heading /');
    assert.equal(await page.locator('.inline-editor__menu:visible').count(), 0, 'Slash inside inline code must stay literal');
    await page.goto(`${origin}/__text-edit?source=${encodeURIComponent('Обычный текст.\n\nСоседний абзац.')}`);
    await editor.locator('p').first().waitFor();
    await select('p');
    await paste({ text: '## Заголовок\n\n- Пункт' });
    await editor.getByRole('heading', { name: 'Заголовок', level: 2 }).waitFor();
    assert.equal(await editor.locator('ul li').textContent(), 'Пункт');
    assert.equal(await editor.locator('p').last().textContent(), 'Соседний абзац.');
    await page.goto(`${origin}/__text-edit?source=${encodeURIComponent('Обычный текст.\n\nСоседний абзац.')}`);
    await editor.locator('p').first().waitFor();
    await select('p');
    await paste({ text: 'Жирный курсив', html: '<p><strong>Жирный</strong> <em>курсив</em></p>' });
    await editor.locator('strong').waitFor();
    assert.equal(await editor.locator('strong').textContent(), 'Жирный');
    assert.equal(await editor.locator('em').textContent(), 'курсив');
    assert.equal(await editor.locator('code').count(), 0);
    await page.goto(`${origin}/__text-edit?source=${encodeURIComponent('```txt\nalphaOMEGA\n```\n\nСоседний абзац.')}`);
    await editor.locator('pre code').waitFor();
    await select('pre code');
    const blockBefore = await editor.evaluate(el => el.editor.getJSON());
    await paste({ text: '# строка\n\t  **буквально**', html: '<h1>Чужой заголовок</h1>' });
    assert.equal(await editor.locator('pre code').textContent(), '# строка\n\t  **буквально**');
    assert.equal(await editor.locator('h1,strong').count(), 0);
    await editor.press('ControlOrMeta+z');
    assert.deepEqual(await editor.evaluate(el => el.editor.getJSON()), blockBefore);
    await page.goto(`${origin}/__text-edit?source=${encodeURIComponent('`one`\n\n`two`\n\nСоседний абзац.')}`);
    await editor.locator('p').first().click();
    await editor.press('Escape');
    await editor.press('Shift+ArrowDown');
    assert.equal(await editor.locator('.inline-editor__block-selected').count(), 2);
    const groupBefore = await editor.evaluate(el => el.editor.getJSON());
    await paste({ text: 'first\nsecond', html: '<p><code>first</code></p><p><code>second</code></p>' });
    assert.deepEqual(await editor.locator('p').allTextContents(), ['first','second','Соседний абзац.'], 'Block paste must not flatten a selected group of code paragraphs');
    assert.deepEqual(await editor.locator('code').allTextContents(), ['first','second']);
    await editor.press('ControlOrMeta+z');
    assert.deepEqual(await editor.evaluate(el => el.editor.getJSON()), groupBefore);
    assert.deepEqual(errors, []);
    console.log(`PASS inline code paste ${width}×${height}: native clipboard, literal Markdown/HTML/whitespace, destination marks, independent Undo/Redo and exact reload; normal Markdown/HTML and code-block paste retained`);
    await page.close();
  }
}
