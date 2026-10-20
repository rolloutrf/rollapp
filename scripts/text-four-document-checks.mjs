import assert from 'node:assert/strict';
import { IDENTITY_QUESTION_TITLES } from '../shared/identity-questions.js';
import { identityFourQuestionsSchema } from '../server/identity-content-schema.js';

export async function checkFourQuestionDocument(browser, origin) {
  const original = { questions: IDENTITY_QUESTION_TITLES.map((title, index) => ({ title, paragraphs: [`Ответ ${index + 1}: первый абзац.`, `Второй абзац ${index + 1}.`] })) };
  for (const [width, height] of [[320,844],[390,844],[390,400],[768,844],[820,844],[1024,844],[1440,844],[1920,844]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    page.setDefaultTimeout(20000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', route => { errors.push('Unexpected API request'); return route.abort(); });
    const url = data => `${origin}/__text-edit?four=1&questions=${encodeURIComponent(JSON.stringify(data))}`;
    await page.goto(url(original));
    const editor = page.getByRole('textbox', { name: 'Ответы на четыре вопроса', exact: true });
    const answers = editor.locator('[data-question-body]');
    await answers.nth(3).waitFor();
    assert.equal(await page.locator('[contenteditable="true"]').count(), 1);
    assert.deepEqual(await editor.locator('h3[contenteditable="false"]').allTextContents(), IDENTITY_QUESTION_TITLES);
    const json = () => editor.evaluate(el => el.editor.getJSON());
    const bodies = () => answers.evaluateAll(nodes => nodes.map(node => node.textContent));
    const selectAcross = async (backwards = false) => {
      // A new pointer selection starts with a click. In particular this leaves
      // the NodeSelection restored by Undo after a native block drag.
      await answers.nth(0).locator('p').first().click();
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await editor.evaluate((el, backwards) => {
        el.focus({ preventScroll: true });
        const first = el.querySelector('[data-question-body="0"] p');
        const last = el.querySelector('[data-question-body="1"] p');
        const a = document.createTreeWalker(first, NodeFilter.SHOW_TEXT).nextNode();
        const b = document.createTreeWalker(last, NodeFilter.SHOW_TEXT).nextNode();
        if (backwards) getSelection().setBaseAndExtent(b, 10, a, 7);
        else getSelection().setBaseAndExtent(a, 7, b, 10);
      }, backwards);
      await page.getByRole('toolbar', { name: 'Форматирование выделенного текста' }).waitFor();
    };
    const initial = await json();
    await selectAcross();
    await page.getByRole('toolbar').getByRole('button', { name: 'Жирный', exact: true }).click();
    assert.equal(await answers.nth(0).locator('strong').count(), 2);
    assert.equal(await answers.nth(1).locator('strong').count(), 1);
    assert.equal(await answers.nth(2).locator('strong').count(), 0);
    await editor.press('ControlOrMeta+z');
    assert.deepEqual(await json(), initial);
    await editor.press('ControlOrMeta+Shift+z');
    const formatted = await json();
    await editor.press('ControlOrMeta+s');
    await page.waitForFunction(() => Boolean(window.inlineTest.saved));
    const saved = await page.evaluate(() => window.inlineTest.saved);
    assert.deepEqual(identityFourQuestionsSchema.parse(saved), saved);
    assert.deepEqual(saved.questions.slice(2), original.questions.slice(2));
    for (const backwards of [false, true]) for (const action of ['Backspace', 'Delete', 'Enter', 'type']) {
      await selectAcross(backwards);
      if (action === 'type') await editor.pressSequentially('Х'); else await editor.press(action);
      const text = await bodies();
      assert.equal(text[0], original.questions[0].paragraphs[0].slice(0,7) + (action === 'type' ? 'Х' : ''));
      assert.equal(text[1], original.questions[1].paragraphs[0].slice(10) + original.questions[1].paragraphs[1]);
      assert.equal(await editor.locator('[data-question-index]').count(), 4);
      if (action === 'Enter') assert.equal(await answers.nth(0).locator('p').count(), 2);
      await editor.press('ControlOrMeta+z');
      assert.deepEqual(await json(), formatted, 'One Undo must restore all affected answers');
    }
    await selectAcross();
    await editor.evaluate(el => {
      el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' }));
    });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.deepEqual(await json(), formatted, 'Cancelling composition must restore the selected answers');
    await answers.nth(0).locator('p').first().click();
    await editor.press('Escape');
    assert.equal(await editor.locator('.inline-editor__block-selected').textContent(), original.questions[0].paragraphs[0]);
    await editor.press('ControlOrMeta+Shift+ArrowDown');
    assert.deepEqual(await answers.nth(0).locator('p').allTextContents(), [...original.questions[0].paragraphs].reverse());
    await editor.press('ControlOrMeta+z');
    assert.deepEqual(await json(), formatted, 'Moving a paragraph must keep its answer and undo independently');
    await editor.press('ControlOrMeta+d');
    assert.equal(await answers.nth(0).locator('p').count(), 3);
    await editor.press('ControlOrMeta+z');
    assert.deepEqual(await json(), formatted);
    if (width >= 1024) {
      await editor.press('Escape');
      await answers.nth(0).locator('p').nth(1).hover();
      const grip = page.getByRole('button', { name: 'Переместить блок или открыть меню', exact: true });
      await grip.waitFor();
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const handleCenter = await page.locator('.inline-editor__drag-handle').evaluate(el => {const b=el.getBoundingClientRect();return b.top+b.height/2;});
      const paragraphCenter = await answers.nth(0).locator('p').nth(1).evaluate(el => {const range=document.createRange();range.selectNodeContents(el);const first=[...range.getClientRects()].find(rect=>rect.width&&rect.height);return first.top+first.height/2;});
      assert(Math.abs(handleCenter - paragraphCenter) <= 1, 'The drag handle must align with the answer paragraph first line');
      await grip.dragTo(answers.nth(0).locator('p').first(), { targetPosition: { x: 20, y: 1 } });
      assert.deepEqual(await answers.nth(0).locator('p').allTextContents(), [...original.questions[0].paragraphs].reverse());
      await editor.press('ControlOrMeta+z');
      assert.deepEqual(await json(), formatted, 'Dragging must move an answer paragraph rather than its protected section');
      await page.getByRole('toolbar').waitFor({ state: 'hidden' });
      await grip.waitFor({ state: 'hidden' });
    }
    await selectAcross();
    const copied = await editor.evaluate(el => {
      const clipboardData = new DataTransfer();
      el.dispatchEvent(new ClipboardEvent('copy', { clipboardData, bubbles: true, cancelable: true }));
      return { text: clipboardData.getData('text/plain'), html: clipboardData.getData('text/html') };
    });
    assert(copied.text.includes(IDENTITY_QUESTION_TITLES[1]), `Copy must use the current native range: ${JSON.stringify(copied)}`);
    assert(!copied.text.includes(IDENTITY_QUESTION_TITLES[0]));
    assert.equal((copied.html.match(/<h3\b/g) || []).length, 1);
    await editor.evaluate(el => {
      const clipboardData = new DataTransfer();
      el.dispatchEvent(new ClipboardEvent('cut', { clipboardData, bubbles: true, cancelable: true }));
    });
    assert.equal((await bodies())[0], original.questions[0].paragraphs[0].slice(0,7));
    await editor.press('ControlOrMeta+z');
    assert.deepEqual(await json(), formatted);
    await selectAcross();
    await editor.evaluate((el, copied) => {
      const clipboardData = new DataTransfer();
      clipboardData.setData('text/plain', copied.text); clipboardData.setData('text/html', copied.html);
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
    }, copied);
    assert.equal(await editor.locator('[data-question-index]').count(), 4);
    assert((await bodies())[0].includes(IDENTITY_QUESTION_TITLES[1]));
    await editor.press('ControlOrMeta+z');
    assert.deepEqual(await json(), formatted);
    await editor.press('ControlOrMeta+a'); await editor.press('ControlOrMeta+a');
    await editor.press('Backspace');
    assert.deepEqual(await bodies(), ['','','','']);
    assert.equal(await editor.locator('h3[contenteditable="false"]').count(), 4);
    await editor.press('ControlOrMeta+z');
    assert.deepEqual(await json(), formatted);
    const geometry = await editor.evaluate(el => ({
      padding: getComputedStyle(el).paddingLeft,
      rootOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      bodyLeft: [...el.querySelectorAll('[data-question-body]')].map(node => node.getBoundingClientRect().left),
      left: el.getBoundingClientRect().left,
      frame: [getComputedStyle(el).borderTopWidth, getComputedStyle(el).outlineWidth, getComputedStyle(el).boxShadow],
    }));
    assert(!geometry.rootOverflow);
    assert.equal(geometry.padding, '0px');
    assert(geometry.bodyLeft.every(left => Math.abs(left - geometry.left) <= 1), 'Every answer must share the same text rail');
    assert.deepEqual(geometry.frame, ['0px','0px','none']);
    await editor.press('ArrowRight');
    await page.getByRole('toolbar').waitFor({ state: 'hidden' });
    if (width === 390 || width === 1440) await page.screenshot({ path: `/tmp/rollapp-four-document-${width}-${height}.png` });
    await page.goto(url(original) + '&slow=1');
    await editor.waitFor();
    await page.waitForFunction(() => Array.isArray(window.inlineTest?.pending));
    await answers.nth(0).locator('p').first().fill('Очередь один');
    await page.waitForFunction(() => window.inlineTest?.pending?.length === 1);
    await answers.nth(1).locator('p').first().fill('Очередь два');
    await page.evaluate(() => window.inlineTest.pending.shift()());
    await page.waitForFunction(() => window.inlineTest?.pending?.length === 1);
    assert.equal(await answers.nth(1).locator('p').first().textContent(), 'Очередь два');
    await page.evaluate(() => window.inlineTest.pending.shift()());
    await page.waitForFunction(() => window.inlineTest?.saved?.questions[1].paragraphs[0] === 'Очередь два');
    assert.equal(await page.evaluate(() => window.inlineTest.saved.questions[0].paragraphs[0]), 'Очередь один');
    assert.equal(await page.evaluate(() => window.inlineTest.saves.length), 2);
    const final = await page.evaluate(() => window.inlineTest.saved);
    await page.goto(url(final) + '&readonly=1');
    await answers.nth(3).waitFor();
    assert.equal(await page.locator('[contenteditable="true"]').count(), 0);
    assert.equal(await page.getByRole('toolbar').count(), 0);
    assert.equal(await page.evaluate(() => window.inlineTest.saves.length), 0);
    await page.goto(url(original) + '&error=1');
    await selectAcross(true);
    await editor.pressSequentially('Черновик');
    const failed = await json();
    await editor.press('ControlOrMeta+s');
    await page.locator('[data-save-status="error"]').waitFor();
    await page.reload();
    await page.locator('[data-save-status="error"]').waitFor();
    assert.deepEqual(await json(), failed, 'A failed cross-answer save must restore the complete document draft');
    assert.equal(await page.evaluate(() => window.inlineTest.saves.length), 0, 'A restored draft must wait for an explicit retry');
    await page.evaluate(() => { window.inlineTest.fail = false; });
    await page.getByRole('button', { name: 'Повторить сохранение', exact: true }).click();
    await page.locator('[data-save-status="saved"]').waitFor();
    const retried = await page.evaluate(() => window.inlineTest.saved);
    assert.deepEqual(identityFourQuestionsSchema.parse(retried), retried);
    assert.deepEqual(retried.questions.slice(2), original.questions.slice(2));
    assert.deepEqual(await json(), failed);
    assert.deepEqual(errors, []);
    console.log(`PASS unified four questions ${width}×${height}: one editor, bidirectional cross-answer edits/Enter/clipboard, cancelled composition, paragraph movement, shared Undo, fixed prompts, serial save, draft/retry and read-only`);
    await page.close();
  }
}
