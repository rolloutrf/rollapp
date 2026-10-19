import assert from 'node:assert/strict';
import { MarkdownManager } from '@tiptap/markdown';
import { inlineEditorExtensions } from '../src/lib/inline-editor-extensions.js';
const manager=new MarkdownManager({extensions:inlineEditorExtensions()});
const p=text=>({type:'paragraph',content:[{type:'text',text,marks:[{type:'bold'}]}]});
const cell=(text,attrs={})=>({type:'tableCell',attrs:{colwidth:Array(attrs.colspan||1).fill(100),blockColor:'blue_background',...attrs},content:[p(text),p('Detail '+text)]});
const row=content=>({type:'tableRow',content});
const mergedSource=axis=>manager.serialize({type:'doc',content:[p('Before'),{type:'table',attrs:{blockColor:'green'},content:axis==='row'?[row([cell('A',{rowspan:2}),cell('B')]),row([cell('C')]),row([cell('D'),cell('E')])]:[row([cell('A',{colspan:2}),cell('B')]),row([cell('C'),cell('D'),cell('E')])]},p('After')]});
const source='Before\n\n| A | B | C |\n|---|---|---|\n| **D** | [E](https://example.com) | F |\n| G | H | I |\n\nAfter';
const frames=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const table=doc=>doc.content.find(node=>node.type==='table');
export async function checkTableDuplicate(browser,origin){
 for(const [width,height] of [[320,844],[390,844],[390,400],[768,844],[820,844],[1024,844],[1440,844],[1440,400],[1920,844]]){
  const page=await browser.newPage({viewport:{width,height}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));await page.route('**/api/**',route=>{errors.push('Unexpected API request');return route.abort();});
  const url=value=>`${origin}/__text-edit?source=${encodeURIComponent(value)}`;
  const editor=page.getByRole('textbox',{name:'О себе',exact:true}),json=()=>editor.evaluate(el=>el.editor.getJSON());
  await page.goto(url(source));await editor.locator('td').last().waitFor();await page.evaluate(()=>document.fonts.ready);
  const before=await json(),expectedRow=structuredClone(before),expectedColumn=structuredClone(before);
  table(expectedRow).content.splice(2,0,structuredClone(table(before).content[1]));
  for(const row of table(expectedColumn).content)row.content.splice(2,0,structuredClone(row.content[1]));
  const menu=page.getByRole('dialog',{name:'Действия текстового блока',exact:true});
  for(const [action,expected] of [['Дублировать строку',expectedRow],['Дублировать столбец',expectedColumn]]){
   await editor.locator('td p').filter({hasText:/^E$/}).click();await page.keyboard.press('ControlOrMeta+/');await menu.waitFor();
   await menu.getByRole('button',{name:action,exact:true}).click();await menu.waitFor({state:'hidden'});await frames(page);
   assert.deepEqual(await json(),expected,action);
   assert.equal(await editor.evaluate(el=>el.editor.state.selection.constructor.name),'CellSelection');
   await page.keyboard.press('ControlOrMeta+z');assert.deepEqual(await json(),before,'one native Undo');
   await page.keyboard.press('ControlOrMeta+Shift+z');assert.deepEqual(await json(),expected,'native Redo');
   await page.keyboard.press('ControlOrMeta+z');assert.deepEqual(await json(),before);
  }
  if(width>=1024){
   for(const [axis,action,expected] of [['строки','Дублировать строку',expectedRow],['столбца','Дублировать столбец',expectedColumn]]){
    await page.mouse.move(0,0);await editor.locator(axis==='строки'?'td p':'th p').filter({hasText:axis==='строки'?/^E$/:/^B$/}).hover();
    const handle=page.getByRole('button',{name:`Действия ${axis} 2`,exact:true});await handle.waitFor();await handle.click();
    const axisMenu=page.getByRole('dialog',{name:`Действия ${axis}`,exact:true});await axisMenu.waitFor();
    await axisMenu.getByRole('button',{name:action,exact:true}).click();await axisMenu.waitFor({state:'hidden'});await frames(page);
    assert.deepEqual(await json(),expected);await page.keyboard.press('ControlOrMeta+z');assert.deepEqual(await json(),before);
   }
  }
  await editor.locator('td p').filter({hasText:/^E$/}).click();await page.keyboard.press('ControlOrMeta+/');await menu.waitFor();
  await menu.getByRole('button',{name:'Дублировать столбец',exact:true}).click();await menu.waitFor({state:'hidden'});
  await editor.press('ControlOrMeta+s');await page.locator('[data-save-status="saved"]').waitFor();const saved=await page.evaluate(()=>window.inlineTest.saved);
  await page.goto(url(saved));await editor.locator('td').last().waitFor();assert.deepEqual(await json(),expectedColumn);
  const appearance=await editor.evaluate(el=>{const s=getComputedStyle(el);return {border:s.borderTopWidth,outline:s.outlineWidth,shadow:s.boxShadow,overflow:document.documentElement.scrollWidth>innerWidth};});
  assert.deepEqual(appearance,{border:'0px',outline:'0px',shadow:'none',overflow:false});
  for(const axis of ['row','column']){
   await page.goto(url(mergedSource(axis)));await editor.locator('td').last().waitFor();const initial=await json(),expected=structuredClone(initial),rows=table(expected).content;
   if(axis==='row')rows.splice(2,0,...structuredClone(rows.slice(0,2)));
   else {rows[0].content.splice(1,0,structuredClone(rows[0].content[0]));rows[1].content.splice(2,0,...structuredClone(rows[1].content.slice(0,2)));}
   await editor.locator('td p').filter({hasText:/^A$/}).click();await page.keyboard.press('ControlOrMeta+/');await menu.waitFor();
   await menu.getByRole('button',{name:axis==='row'?'Дублировать строку':'Дублировать столбец',exact:true}).click();await menu.waitFor({state:'hidden'});await frames(page);assert.deepEqual(await json(),expected,`merged ${axis} band keeps every cell and span`);
   await page.keyboard.press('ControlOrMeta+z');assert.deepEqual(await json(),initial);
   await page.keyboard.press('ControlOrMeta+Shift+z');assert.deepEqual(await json(),expected);
   await editor.press('ControlOrMeta+s');await page.locator('[data-save-status="saved"]').waitFor();const persisted=await page.evaluate(()=>window.inlineTest.saved);
   await page.goto(url(persisted));await editor.locator('td').last().waitFor();assert.deepEqual(await json(),expected);
  }
  assert.deepEqual(errors,[]);
  await page.close();console.log(`PASS table duplication ${width}×${height}: native contextual row/column actions${width>=1024?', real hover menus':''}, rich/merged cells and complete span bands, one Undo/Redo, exact save/reload, no frames/API`);
 }
}
