import assert from 'node:assert/strict';
import { MarkdownManager } from '@tiptap/markdown';
import { inlineEditorExtensions } from '../src/lib/inline-editor-extensions.js';

const text = value => ({ type: 'text', text: value });
const p = value => ({ type: 'paragraph', content: [text(value)] });
const task = (value, checked = false, children = []) => ({ type: 'taskItem', attrs: { checked, blockColor: 'red' }, content: [p(value), ...children] });
const tasks = children => ({ type: 'taskList', content: children });
const toggle = (value, open) => ({ type: 'details', attrs: { open, blockColor: 'blue_background' }, content: [
  { type: 'detailsSummary', content: [{ ...text(value), marks: [{ type: 'bold' }] }] },
  { type: 'detailsContent', content: [p('Содержимое ' + value)] },
] });
const source = new MarkdownManager({ extensions: inlineEditorExtensions() }).serialize({ type: 'doc', content: [
  tasks([task('Родитель', false, [tasks([task('Дочерняя', true)])]), task('Соседняя задача')]),
  toggle('Закрытый блок', false), toggle('Открытый блок', true), p('Обычный сосед'),
] });
const frames = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

export async function checkModEnter(browser, origin) {
  for (const [width, height] of [[320,844],[390,844],[390,400],[768,844],[820,844],[1024,844],[1440,844],[1920,844]]) {
    const page = await browser.newPage({ viewport: { width, height } }), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', route => { errors.push('Unexpected API request'); return route.abort(); });
    const url = (value, extra = '') => `${origin}/__text-edit?source=${encodeURIComponent(value)}${extra}`;
    const editor = page.getByRole('textbox', { name: 'О себе', exact: true });
    const json = () => editor.evaluate(el => el.editor.getJSON());
    const selection = () => editor.evaluate(el => el.editor.state.selection.toJSON());
    await page.goto(url(source)); await editor.locator('summary').last().waitFor(); await page.evaluate(() => document.fonts.ready);
    const original = await json();
    for (const [line, path, attribute, value] of [
      [editor.locator('li p').filter({ hasText: /^Родитель$/ }), [0,0], 'checked', true],
      [editor.locator('li p').filter({ hasText: /^Дочерняя$/ }), [0,0,1,0], 'checked', false],
      [editor.locator('summary').filter({ hasText: /^Закрытый блок$/ }), [1], 'open', true],
      [editor.locator('summary').filter({ hasText: /^Открытый блок$/ }), [2], 'open', false],
    ]) {
      await line.click(); await page.keyboard.press(await page.evaluate(() => /Mac/.test(navigator.platform) ? 'Meta+ArrowLeft' : 'Home')); await page.keyboard.press('ArrowRight'); await frames(page);
      const before = await json(), caret = await selection(), expected = structuredClone(before);
      path.reduce((node, index) => node.content[index], expected).attrs[attribute] = value;
      await page.keyboard.press('ControlOrMeta+Enter'); await frames(page);
      assert.deepEqual(await json(), expected, `only current ${attribute} changes`);
      assert.deepEqual(await selection(), caret, 'caret remains at the same text offset');
      if (attribute === 'open') assert.equal(await line.locator('..').locator('[data-type="detailsContent"]').isVisible(), value);
      await page.keyboard.press('ControlOrMeta+z'); assert.deepEqual(await json(), before, 'one native Undo');
      await page.keyboard.press('ControlOrMeta+Shift+z'); assert.deepEqual(await json(), expected, 'native Redo');
      await page.keyboard.press('ControlOrMeta+Enter'); assert.deepEqual(await json(), before, 'repeat toggles back');
      await page.keyboard.press('ControlOrMeta+Enter'); assert.deepEqual(await json(), expected);
    }
    // Block mode has no text caret, and stays in block mode after acting.
    await editor.locator('li p').filter({ hasText: /^Соседняя задача$/ }).click();
    await page.keyboard.press('Escape'); const blockSelection = await selection();
    assert.equal(blockSelection.type, 'rollappBlocks');
    await page.keyboard.press('ControlOrMeta+Enter');
    assert.equal((await json()).content[0].content[1].attrs.checked, true);
    assert.deepEqual(await selection(), blockSelection);
    const edited = await json(); assert.notDeepEqual(edited, original);
    await page.keyboard.press('ControlOrMeta+s'); await page.locator('[data-save-status="saved"]').waitFor();
    const saved = await page.evaluate(() => window.inlineTest.saved);
    await page.goto(url(saved)); await editor.locator('summary').last().waitFor();
    assert.deepEqual(await json(), edited, 'attributes, content and marks survive Markdown save/reload');
    assert.equal(await page.evaluate(() => window.inlineTest.saves.length), 0);
    if (width === 390 && height === 400) await page.screenshot({ path: '/tmp/rollapp-mod-enter-390-400.png' });

    // Simulated IME key events complement native shortcut cases; this is not a real-device IME test.
    await editor.locator('li p').first().click(); const imeBefore = await json();
    await editor.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', metaKey: true, ctrlKey: true, isComposing: true });
    await frames(page); assert.deepEqual(await json(), imeBefore);
    await page.goto(url(saved, '&readonly=1&access=1')); await editor.locator('summary').last().waitFor();
    const readBefore = await json();
    await editor.locator('li p').first().click(); await page.keyboard.press('ControlOrMeta+Enter'); await frames(page);
    assert.deepEqual(await json(), readBefore); assert.equal(await page.evaluate(() => window.inlineTest.saves.length), 0);
    await page.getByRole('button', { name: 'Разрешить редактирование', exact: true }).click();
    await editor.locator('li p').first().click(); await page.keyboard.press('ControlOrMeta+Enter');
    assert.equal((await json()).content[0].content[0].attrs.checked, false, 'permission grant enables the shortcut');
    const geometry = await editor.evaluate(el => { const s = getComputedStyle(el); return { overflow: document.documentElement.scrollWidth > innerWidth + 1,
      frame: [s.borderTopWidth, s.borderRightWidth, s.borderBottomWidth, s.borderLeftWidth, s.outlineStyle === 'none' ? '0px' : s.outlineWidth, s.boxShadow] }; });
    assert(!geometry.overflow); assert.deepEqual(geometry.frame, ['0px','0px','0px','0px','0px','none']);
    assert.deepEqual(errors, []); await page.close();
    console.log(`PASS current block Mod+Enter ${width}×${height}: tasks/nested tasks, open/closed toggles, stable caret/block selection, native Undo/Redo, exact save/reload, composition/access guards, no frames/API`);
  }
}
