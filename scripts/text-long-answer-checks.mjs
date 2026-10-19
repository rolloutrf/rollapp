import assert from 'node:assert/strict';
import { IDENTITY_QUESTION_TITLES } from '../shared/identity-questions.js';
import { identityFourQuestionsSchema } from '../server/identity-content-schema.js';

export async function checkLongQuestionAnswers(browser, origin) {
  const original = { questions: IDENTITY_QUESTION_TITLES.map((title, index) => ({ title, paragraphs: [index === 0 ? Array.from({ length: 30 }, (_, i) => `Абзац ${i + 1}`).join('\n\n') : `Соседний ответ ${index + 1}`] })) };
  assert.deepEqual(identityFourQuestionsSchema.parse(original), original);
  for (const [width, height] of [[320,844],[390,844],[390,400],[768,844],[820,844],[1024,844],[1440,844],[1920,844]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', route => { errors.push('Unexpected API request'); return route.abort(); });
    const url = value => `${origin}/__text-edit?four=1&questions=${encodeURIComponent(JSON.stringify(value))}`;
    await page.goto(url(original));
    const editor = page.getByRole('textbox', { name: 'Ответы на четыре вопроса', exact: true });
    const first = editor.locator('[data-question-body="0"]');
    await first.locator('p').last().waitFor();
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await first.locator('p').count(), 30);
    await first.locator('p').last().click();
    await editor.press('End');
    await editor.press('Enter');
    await editor.pressSequentially('Тридцать первый 👩🏽‍💻');
    assert.equal(await first.locator('p').count(), 31);
    assert.equal(await first.locator('p').last().textContent(), 'Тридцать первый 👩🏽‍💻');
    const edited = await editor.evaluate(el => el.editor.getJSON());
    await editor.press('ControlOrMeta+s');
    await page.locator('[data-save-status="saved"]').waitFor();
    const saved = await page.evaluate(() => window.inlineTest.saved);
    assert.deepEqual(identityFourQuestionsSchema.parse(saved), saved);
    assert.equal(saved.questions[0].paragraphs.length, 1);
    assert.deepEqual(saved.questions.slice(1), original.questions.slice(1));
    assert.deepEqual(await editor.locator('h3[contenteditable="false"]').allTextContents(), IDENTITY_QUESTION_TITLES);
    await page.goto(url(saved));
    await first.locator('p').last().waitFor();
    assert.deepEqual(await editor.evaluate(el => el.editor.getJSON()), edited);
    assert.equal(await page.evaluate(() => window.inlineTest.saves.length), 0, 'reloading packed source does not rewrite it');

    // The packed answer continues to use the ordinary draft/retry queue.
    await page.goto(url(saved) + '&error=1');
    await first.locator('p').last().click();
    await editor.press('End');
    await editor.press('Enter');
    await editor.pressSequentially('Ещё один абзац');
    await editor.press('ControlOrMeta+s');
    await page.locator('[data-save-status="error"]').waitFor();
    const draft = await editor.evaluate(el => el.editor.getJSON());
    await page.reload();
    await page.locator('[data-save-status="error"]').waitFor();
    assert.deepEqual(await editor.evaluate(el => el.editor.getJSON()), draft);
    assert.equal(await page.evaluate(() => window.inlineTest.saves.length), 0);
    await page.evaluate(() => { window.inlineTest.fail = false; });
    await page.getByRole('button', { name: 'Повторить сохранение', exact: true }).click();
    await page.locator('[data-save-status="saved"]').waitFor();
    const retried = await page.evaluate(() => window.inlineTest.saved);
    assert.deepEqual(identityFourQuestionsSchema.parse(retried), retried);
    assert.equal(retried.questions[0].paragraphs.length, 1);
    await page.goto(url(retried) + '&readonly=1');
    await first.locator('p').last().waitFor();
    assert.deepEqual(await editor.evaluate(el => el.editor.getJSON()), draft);
    assert.equal(await first.locator('p').count(), 32);
    assert.equal(await page.locator('[contenteditable="true"]').count(), 0);
    const geometry = await editor.evaluate(el => {
      const style = getComputedStyle(el);
      return { overflow: document.documentElement.scrollWidth > innerWidth + 1, frame: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth, style.outlineWidth, style.boxShadow] };
    });
    assert(!geometry.overflow);
    assert.deepEqual(geometry.frame, ['0px','0px','0px','0px','0px','none']);
    assert.deepEqual(errors, []);
    console.log(`PASS long four-question answer ${width}×${height}: native Enter past 30 paragraphs, real API validation, exact save/reload, unchanged neighbours, draft/retry and read-only without frames/API`);
    await page.close();
  }
}
