import assert from 'node:assert/strict';
import { getSchema } from '@tiptap/core';
import { MarkdownManager } from '@tiptap/markdown';
import { Marked } from 'marked';
import { inlineEditorExtensions } from '../src/lib/inline-editor-extensions.js';
import { assertStableBlockSelection } from './text-block-boundary-checks.mjs';

const extensions = inlineEditorExtensions(), schema = getSchema(extensions);
const manager = new MarkdownManager({ extensions, marked: new Marked() });
function sourceFor(kind) {
  const p = text => schema.nodes.paragraph.create(null, schema.text(text, [schema.marks.bold.create()]));
  const child = schema.nodes.taskList.create(null, schema.nodes.taskItem.create({ checked: true }, p('Ребёнок')));
  const item = (text, children = []) => schema.nodes[kind === 'taskList' ? 'taskItem' : 'listItem'].create({ checked: true }, [p(text), ...children]);
  const list = schema.nodes[kind].create({ start: 7, blockColor: 'red' }, [item('Первый'), item('Последний', [child])]);
  const doc = schema.nodes.doc.create(null, [p('До'), list, p('После')]);
  return { source: manager.serialize(doc.toJSON()), doc: JSON.parse(JSON.stringify(doc.toJSON())) };
}

export async function checkListBlockMoves(browser, origin) {
  for (const [width,height] of [[320,844],[390,844],[390,400],[768,844],[820,844],[1024,844],[1440,844],[1920,844]]) {
    const page = await browser.newPage({ viewport: { width,height } }), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', route => { errors.push('Unexpected API request'); return route.abort(); });
    for (const kind of ['bulletList','orderedList','taskList']) {
      const input = sourceFor(kind);
      const url = source => `${origin}/__text-edit?source=${encodeURIComponent(source)}`;
      await page.goto(url(input.source));
      const editor = page.getByRole('textbox', { name: 'О себе', exact: true });
      await editor.locator(':scope > p').last().waitFor();
      await page.evaluate(() => document.fonts.ready);
      const json = () => editor.evaluate(el => el.editor.getJSON());
      const initial = await json();
      assert.deepEqual(initial,input.doc);
      for (const direction of ['Up','Down']) {
        const rootList = editor.locator(':scope > ul,:scope > ol');
        const items = rootList.locator(':scope > li');
        await items.nth(direction === 'Up' ? 0 : 1).locator('p').first().click();
        await page.keyboard.press('Escape');
        const selection = await editor.evaluate(el => el.editor.state.selection.toJSON());
        await page.keyboard.press(`ControlOrMeta+Shift+Arrow${direction}`);
        const moved = await json(), at = direction === 'Up' ? 0 : 3;
        assert.deepEqual(moved.content.map(node => node.type),direction === 'Up' ? [kind,'paragraph',kind,'paragraph'] : ['paragraph',kind,'paragraph',kind]);
        assert.deepEqual(moved.content[at].content[0],initial.content[1].content[direction === 'Up' ? 0 : 1]);
        assert.equal(moved.content[at].attrs.blockColor,'red');
        if (kind === 'orderedList') {
          assert.equal(moved.content[at].attrs.start,direction === 'Up'?7:8);
          assert.equal(await editor.locator(':scope > ol').nth(direction === 'Up'?0:1).getAttribute('start'),String(direction === 'Up'?7:8));
        }
        await assertStableBlockSelection(editor);
        await page.keyboard.press('ControlOrMeta+s'); await page.locator('[data-save-status="saved"]').waitFor();
        const saved = await page.evaluate(()=>window.inlineTest.saved);
        await page.keyboard.press('ControlOrMeta+z'); assert.deepEqual(await json(),initial);
        assert.deepEqual(await editor.evaluate(el => el.editor.state.selection.toJSON()),selection);
        if (direction === 'Down') {
          await page.goto(url(saved)); await editor.locator(':scope > p').last().waitFor();
          assert.deepEqual(await json(),moved); assert.equal(await page.evaluate(()=>window.inlineTest.saves.length),0);
          await page.goto(url(saved)+'&readonly=1'); await editor.locator(':scope > p').last().waitFor();
          assert.deepEqual(await json(),moved); assert.equal(await page.locator('[contenteditable="true"]').count(),0);
        }
      }
      const frames = await page.locator('[role="textbox"]').evaluate(el=>[el,...el.querySelectorAll('li,p')].map(node=>{const s=getComputedStyle(node);return [s.borderTopWidth,s.borderRightWidth,s.borderBottomWidth,s.borderLeftWidth,s.outlineStyle==='none'?'0px':s.outlineWidth,s.boxShadow];}));
      for(const frame of frames) assert.deepEqual(frame,['0px','0px','0px','0px','0px','none']);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    }
    assert.deepEqual(errors,[]);
    console.log(`PASS logical list block movement ${width}×${height}: bullet/ordered/task boundaries both ways, markers/colours/checked children, stable selection, one Undo, exact save/reload/read-only and no frames/API`);
    await page.close();
  }
}

export async function checkListBlockDrag(browser, origin) {
  for (const [width,height] of [[1024,844],[1440,400]]) {
    const page=await browser.newPage({viewport:{width,height}}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/api/**',route=>{errors.push('Unexpected API request');return route.abort();});
    const input=sourceFor('taskList');
    await page.goto(`${origin}/__text-edit?source=${encodeURIComponent(input.source)}`);
    const editor=page.getByRole('textbox',{name:'О себе',exact:true});
    await editor.locator(':scope > p').last().waitFor();
    await page.evaluate(()=>document.fonts.ready);
    const initial=await editor.evaluate(el=>el.editor.getJSON());
    const item=editor.locator(':scope > ul > li').last();
    await item.locator('p').first().hover();
    const grip=page.getByRole('button',{name:'Переместить блок или открыть меню',exact:true});
    await grip.waitFor();
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const after=editor.locator(':scope > p').last(),box=await after.boundingBox();
    await grip.dragTo(after,{targetPosition:{x:20,y:box.height-1}});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const result=await editor.evaluate(el=>el.editor.getJSON());
    await page.screenshot({path:`/tmp/rollapp-native-list-drag-${width}-${height}.png`});
    assert.deepEqual(result.content.map(node=>node.type),['paragraph','taskList','paragraph','taskList']);
    assert.deepEqual(result.content[3].content[0],initial.content[1].content[1]);
    assert.equal(result.content[3].attrs.blockColor,'red');
    await assertStableBlockSelection(editor);
    await page.keyboard.press('ControlOrMeta+z');
    assert.deepEqual(await editor.evaluate(el=>el.editor.getJSON()),initial);
    assert.deepEqual(errors,[]);
    console.log(`PASS native list drag ${width}×${height}: checked parent with children and marker colour crosses ordinary text as one block, stable selection and one Undo without API`);
    await page.close();
  }
}

export async function checkBlockDragGuards(browser, origin) {
  const page=await browser.newPage({viewport:{width:1440,height:400}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/**',route=>{errors.push('Unexpected API request');return route.abort();});
  const input=sourceFor('taskList');
  for(const mode of ['escape','document-change','access']) {
    await page.goto(`${origin}/__text-edit?access=1&source=${encodeURIComponent(input.source)}`);
    const editor=page.getByRole('textbox',{name:'О себе',exact:true});
    await editor.locator(':scope > p').last().waitFor(); await page.evaluate(()=>document.fonts.ready);
    const initial=await editor.evaluate(el=>el.editor.getJSON());
    await editor.locator(':scope > ul > li').last().locator('p').first().hover();
    const grip=page.getByRole('button',{name:'Переместить блок или открыть меню',exact:true});
    await grip.waitFor(); const handle=await grip.boundingBox(),target=await editor.locator(':scope > p').last().boundingBox();
    await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();
    await page.mouse.move(handle.x+handle.width/2+12,handle.y+handle.height/2+8,{steps:5});
    await page.mouse.move(target.x+20,target.y+target.height-1,{steps:10});
    await page.mouse.move(target.x+21,target.y+target.height-1);
    const guide=page.locator('.inline-editor__drop-guide');await guide.waitFor({state:'visible'});
    const line=await guide.evaluate(node=>{const b=node.getBoundingClientRect();return {left:b.left,top:b.top,width:b.width,height:b.height};});
    assert.equal(line.height,2);assert(line.width>0);assert(Math.abs(line.top-(target.y+target.height))<=2);
    let expected=initial;
    if(mode==='escape') await page.keyboard.press('Escape');
    if(mode==='document-change') {
      expected=await editor.evaluate(el=>{const e=el.editor;e.view.dispatch(e.state.tr.insertText('Внешнее ',1).setMeta('preventUpdate',true));return e.getJSON();});
      await guide.waitFor({state:'hidden'});
    }
    if(mode==='access') {
      await page.getByRole('button',{name:'Только чтение',exact:true}).evaluate(node=>node.click());
      await page.waitForFunction(()=>document.querySelectorAll('[contenteditable="true"]').length===0);
    }
    await page.mouse.up();
    await page.waitForFunction(()=>!document.querySelector('.inline-editor__drop-guide,.inline-editor__drag-preview'));
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    assert.deepEqual(await editor.evaluate(el=>el.editor.getJSON()),expected,`${mode}: cancelled internal drop never fits old HTML into the new document`);
    assert.equal(await page.evaluate(()=>window.inlineTest.saves.length),0);
  }
  assert.deepEqual(errors,[]);
  console.log('PASS block drag guards 1440×400: real insertion guide, Escape, changed source and revoked access cancel without HTML fallback, DOM residue, save or API');
  await page.close();
}
