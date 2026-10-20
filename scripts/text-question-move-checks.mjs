import assert from 'node:assert/strict';
import { IDENTITY_QUESTION_TITLES } from '../shared/identity-questions.js';
import { identityFourQuestionsSchema } from '../server/identity-content-schema.js';
import { assertStableBlockSelection } from './text-block-boundary-checks.mjs';

export async function checkQuestionBlockMoves(browser, origin) {
  const original = { questions: [
    ['Первый', '**Переносимый**'], ['*Приёмник*', 'Сосед'], ['Третий', '**Перенос 2**'], ['Последний'],
  ].map((paragraphs, index) => ({ title: IDENTITY_QUESTION_TITLES[index], paragraphs })) };
  const url = value => `${origin}/__text-edit?four=1&questions=${encodeURIComponent(JSON.stringify(value))}`;
  for (const [width,height] of [[320,844],[390,844],[390,400],[768,844],[820,844],[1024,844],[1440,844],[1920,844]]) {
    const page = await browser.newPage({ viewport: { width,height } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', route => { errors.push('Unexpected API request'); return route.abort(); });
    await page.goto(url(original));
    const editor = page.getByRole('textbox', { name: 'Ответы на четыре вопроса', exact: true });
    const answers = editor.locator('[data-question-body]');
    await answers.nth(3).waitFor();
    await page.evaluate(() => document.fonts.ready);
    const modifiers = await page.evaluate(() => /Mac|iPhone|iPad/.test(navigator.platform) ? ['Meta','Shift'] : ['Alt','Shift']);
    const json = () => editor.evaluate(el => el.editor.getJSON());
    const texts = () => answers.evaluateAll(nodes => nodes.map(node => [...node.children].map(child => child.textContent)));
    const fixed = async () => assert.deepEqual(await editor.locator('h3[contenteditable="false"]').allTextContents(), IDENTITY_QUESTION_TITLES);
    const initial = await json();
    for (const [section, child, direction] of [[0,1,'Down'],[1,0,'Up']]) {
      await answers.nth(section).locator('p').nth(child).click();
      await editor.press(await page.evaluate(() => /Mac/.test(navigator.platform) ? 'Meta+ArrowLeft' : 'Home')); await editor.press('ArrowRight');
      await page.waitForFunction(() => document.querySelector('[role="textbox"]').editor.state.selection.$from.parentOffset === 1);
      const selection = await editor.evaluate(el => el.editor.state.selection.toJSON());
      await editor.press(`ControlOrMeta+Shift+Arrow${direction}`);
      assert.deepEqual((await texts()).slice(0,2), direction === 'Down' ? [['Первый'],['Переносимый','Приёмник','Сосед']] : [['Первый','Переносимый','Приёмник'],['Сосед']]);
      const caret = await editor.evaluate(el => ({ offset: el.editor.state.selection.$from.parentOffset, empty: el.editor.state.selection.empty, index: el.editor.state.selection.$from.node(1).attrs.index }));
      assert.deepEqual(caret,{offset:1,empty:true,index:direction==='Down'?1:0});
      await fixed();
      await editor.press('ControlOrMeta+z');
      assert.deepEqual(await json(),initial);
      assert.deepEqual(await editor.evaluate(el => el.editor.state.selection.toJSON()),selection);
    }
    await answers.nth(0).locator('p').last().click(); await editor.press('Escape');
    await editor.press('ControlOrMeta+/');
    const menu = page.getByRole('dialog',{name:'Действия текстового блока',exact:true});
    await menu.getByRole('button',{name:'Переместить вниз',exact:true}).click();
    assert.deepEqual((await texts()).slice(0,2),[['Первый'],['Переносимый','Приёмник','Сосед']]);
    await assertStableBlockSelection(editor,'one moved block across answers');
    await editor.press('ControlOrMeta+z').catch(async error => {
      const diagnostic = await page.evaluate(() => ({
        active: document.activeElement?.outerHTML.slice(0,300),
        roots: [...document.querySelectorAll('[role="textbox"]')].map(root => ({
          html: root.outerHTML.slice(0,400),
          ancestors: [...(function* () { for (let el = root; el; el = el.parentElement) yield el; })()].map(el => ({tag:el.tagName,hidden:el.hidden,inert:el.inert,ariaHidden:el.getAttribute('aria-hidden'),display:getComputedStyle(el).display,visibility:getComputedStyle(el).visibility})),
          selection: root.editor?.state.selection.toJSON(),
        })),
        menus: [...document.querySelectorAll('[role="dialog"]')].map(el => el.outerHTML.slice(0,400)),
      }));
      throw new Error(`Post-menu Undo failed at ${width}x${height}: ${JSON.stringify(diagnostic)}; ${error.message}`);
    }); assert.deepEqual(await json(),initial);

    for (const reverse of [false,true]) {
      await answers.nth(reverse?2:0).locator('p').last().click(); await editor.press('Escape');
      await answers.nth(reverse?0:2).locator('p').last().click({modifiers});
      assert.equal(await editor.evaluate(el => el.editor.state.selection.positions?.length),2);
      await editor.press('ControlOrMeta+Shift+ArrowDown');
      assert.deepEqual(await texts(),[['Первый'],['Переносимый','Приёмник','Сосед'],['Третий'],['Перенос 2','Последний']]);
      const selected = await editor.evaluate(el => ({ text:el.editor.state.selection.positions.map(pos=>el.editor.state.doc.nodeAt(pos).textContent),reverse:el.editor.state.selection.anchorBlock>el.editor.state.selection.headBlock }));
      assert.deepEqual(selected,{text:['Переносимый','Перенос 2'],reverse});
      await assertStableBlockSelection(editor,'sparse moved blocks across answers'); await fixed();
      await editor.press('ControlOrMeta+s'); await page.locator('[data-save-status="saved"]').waitFor();
      const saved = await page.evaluate(() => window.inlineTest.saved);
      assert.deepEqual(identityFourQuestionsSchema.parse(saved),saved);
      const moved = await json();
      await editor.press('ControlOrMeta+z'); assert.deepEqual(await json(),initial);
      if (reverse) {
        await page.goto(url(saved)); await answers.nth(3).waitFor(); assert.deepEqual(await json(),moved);
        assert.equal(await page.evaluate(()=>window.inlineTest.saves.length),0);
      }
    }
    await fixed();
    assert.deepEqual(errors,[]);
    console.log(`PASS cross-answer block movement ${width}×${height}: native keyboard/caret, menu, bidirectional sparse groups, fixed prompts, stable selection, one Undo and API-valid save/reload`);
    await page.close();
  }
}
