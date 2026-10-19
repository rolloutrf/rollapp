import assert from 'node:assert/strict';
import {MarkdownManager} from '@tiptap/markdown';
import {inlineEditorExtensions} from '../src/lib/inline-editor-extensions.js';
import {IDENTITY_QUESTION_TITLES} from '../shared/identity-questions.js';
import {identityFourQuestionsSchema} from '../server/identity-content-schema.js';
const manager=new MarkdownManager({extensions:inlineEditorExtensions()});
const p=text=>({type:'paragraph',content:text?[{type:'text',text}]:[]});
const simple='Before\n\n| A | B | C |\n|---|---|---|\n| D | E | F |\n| G | H | I |\n\nAfter';
const frames=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const createTable=(columns,width=null)=>({type:'table',content:Array.from({length:3},(_,r)=>({type:'tableRow',content:Array.from({length:columns},(_,c)=>({type:r===0?'tableHeader':'tableCell',attrs:width?{colwidth:[width]}:{},content:[p(`${r}:${c}`)]}))}))});
export async function checkTableGrowthContexts(browser,origin){
 for(const [width,height] of [[1024,844],[1440,400]]){
  const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',r=>{errors.push('Unexpected API request');return r.abort();});
  const url=(source,extra='')=>`${origin}/app/spheres/career?tab=about&__text_fixture=1&chrome=1&source=${encodeURIComponent(source)}${extra}`;
  const show=async(table,mode)=>{
   await table.evaluate(el=>window.scrollBy({top:el.getBoundingClientRect().top-100,behavior:'instant'}));const box=await table.boundingBox(),wrapper=await table.locator('..').boundingBox();
   await page.mouse.move(0,0);await page.mouse.move(mode==='row'?wrapper.x+wrapper.width/2:wrapper.x+wrapper.width-2,mode==='column'?box.y+box.height/2:box.y+box.height-2);await frames(page);
   const control=page.locator(`[data-table-growth="${mode}"]`);await control.waitFor();return control;
  };
  const questions={questions:IDENTITY_QUESTION_TITLES.map((title,index)=>({title,paragraphs:[index===0?simple:`Neighbour ${index}`]}))};
  await page.goto(`${origin}/app/spheres/career?tab=about&__text_fixture=1&chrome=1&four=1&questions=${encodeURIComponent(JSON.stringify(questions))}`);
  const four=page.getByRole('textbox',{name:'Ответы на четыре вопроса',exact:true});await four.locator('table').waitFor();await page.evaluate(()=>document.fonts.ready);const before=await four.evaluate(el=>el.editor.getJSON());
  await (await show(four.locator('table'),'row')).click();await frames(page);assert.equal(await four.locator('tr').count(),4);
  await page.keyboard.type('New row');assert.equal(await four.evaluate(el=>el.editor.state.selection.$from.parent.textContent),'New row');
  await page.keyboard.press('ControlOrMeta+z');await page.keyboard.press('ControlOrMeta+z');assert.deepEqual(await four.evaluate(el=>el.editor.getJSON()),before);
  await (await show(four.locator('table'),'column')).click();await frames(page);assert.equal(await four.locator('tr').first().locator('th,td').count(),4);
  const changed=await four.evaluate(el=>el.editor.getJSON());await four.press('ControlOrMeta+s');await page.locator('[data-save-status="saved"]').waitFor();const saved=await page.evaluate(()=>window.inlineTest.saved);identityFourQuestionsSchema.parse(saved);assert.deepEqual(saved.questions.slice(1),questions.questions.slice(1));assert.deepEqual(saved.questions.map(q=>q.title),IDENTITY_QUESTION_TITLES);
  await page.goto(`${origin}/app/spheres/career?tab=about&__text_fixture=1&chrome=1&four=1&questions=${encodeURIComponent(JSON.stringify(saved))}`);await four.locator('table').waitFor();assert.deepEqual(await four.evaluate(el=>el.editor.getJSON()),changed);
  const wide=manager.serialize({type:'doc',content:[p('Before'),createTable(8,160),p('After')]});
  await page.goto(url(wide));const editor=page.getByRole('textbox',{name:'О себе',exact:true});await editor.locator('table').waitFor();await page.evaluate(()=>document.fonts.ready);const original=await editor.evaluate(el=>el.editor.getJSON());
  const overflow=await editor.locator('.tableWrapper').evaluate(el=>el.scrollWidth>el.clientWidth);assert(overflow);
  await (await show(editor.locator('table'),'column')).click();await frames(page);assert.equal(await editor.locator('tr').first().locator('th,td').count(),9);assert(await editor.locator('.tableWrapper').evaluate(el=>el.scrollLeft)>0,'new far column must scroll into its one horizontal owner');
  await page.keyboard.type('Wide');assert.equal(await editor.evaluate(el=>el.editor.state.selection.$from.parent.textContent),'Wide');
  await page.keyboard.press('ControlOrMeta+z');await page.keyboard.press('ControlOrMeta+z');assert.deepEqual(await editor.evaluate(el=>el.editor.getJSON()),original);
  const nested=manager.serialize({type:'doc',content:[p('Before'),{type:'table',content:[{type:'tableRow',content:[{type:'tableCell',content:[createTable(2)]},{type:'tableCell',content:Array.from({length:12},(_,i)=>p(`Neighbour text ${i+1}`))}]}]},p('After')]});
  await page.goto(url(nested));await editor.locator('table').nth(1).waitFor();await page.evaluate(()=>document.fonts.ready);const initialNested=await editor.evaluate(el=>el.editor.getJSON()),inner=editor.locator('table').nth(1);
  await inner.evaluate(el=>window.scrollBy({top:el.getBoundingClientRect().top-100,behavior:'instant'}));const innerBox=await inner.boundingBox(),innerWrapper=await inner.locator('..').boundingBox();
  await page.mouse.move(innerWrapper.x+innerWrapper.width-2,innerBox.y+innerBox.height/2);await frames(page);assert.equal(await page.locator('[data-table-growth="column"]').count(),0,'nested plus must not cover neighbouring cell text');
  await inner.locator('td p').first().click();await page.keyboard.press('ControlOrMeta+/');const menu=page.getByRole('dialog',{name:'Действия текстового блока',exact:true});await menu.waitFor();await menu.getByRole('button',{name:'Добавить строку ниже',exact:true}).click();await menu.waitFor({state:'hidden'});assert.equal(await inner.locator('tr').count(),4,'menu fallback edits the nearest nested table');
  const edited=await editor.evaluate(el=>el.editor.getJSON());assert.deepEqual(edited.content[1].content[0].content[1],initialNested.content[1].content[0].content[1],'neighbouring cell remains exact');
  await page.keyboard.press('ControlOrMeta+z');assert.deepEqual(await editor.evaluate(el=>el.editor.getJSON()),initialNested);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);await page.close();console.log(`PASS table growth contexts ${width}×${height}: native Four Questions growth/API-valid exact reload, fixed neighbours/titles and Undo, wide horizontal reveal/typing, nested peer-text protection and nearest-table menu fallback, no API/root overflow`);
 }
}
