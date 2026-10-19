import assert from 'node:assert/strict';
import {MarkdownManager} from '@tiptap/markdown';
import {inlineEditorExtensions} from '../src/lib/inline-editor-extensions.js';
const p=(text,marks)=>({type:'paragraph',content:text?[{type:'text',text,...(marks?{marks}:{})}]:[]});
const manager=new MarkdownManager({extensions:inlineEditorExtensions()});
const source=manager.serialize({type:'doc',content:[p('Before'),{type:'columns',content:[{type:'column',attrs:{width:1.3},content:[{type:'heading',attrs:{level:3,blockColor:'blue'},content:[{type:'text',text:'Left heading'}]},p('Literal  left\ntext ',[{type:'bold'},{type:'inlineStyle',attrs:{color:'red'}}])]},{type:'column',attrs:{width:.7},content:[{type:'taskList',content:[{type:'taskItem',attrs:{checked:true},content:[p('Checked task'),{type:'bulletList',content:[{type:'listItem',content:[p('Nested child')]}]}]}]},{type:'details',attrs:{open:true},content:[{type:'detailsSummary',content:[{type:'text',text:'Toggle'}]},{type:'detailsContent',content:[p('Toggle child')]}]}]}]},p('After')]});
const frames=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
export async function checkColumnPersistence(browser,origin){
 for(const [width,height] of [[390,400],[1024,844],[1440,400]]){
  const page=await browser.newPage({viewport:{width,height},permissions:['clipboard-read','clipboard-write']}),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.route('**/api/**',route=>{errors.push('Unexpected API request');return route.abort();});
  const url=text=>`${origin}/app/spheres/career?tab=about&__text_fixture=1&chrome=1&source=${encodeURIComponent(text)}`;
  await page.goto(url(source)+'&error=1');const editor=page.getByRole('textbox',{name:'О себе',exact:true}),json=()=>editor.evaluate(el=>el.editor.getJSON());await editor.locator('[data-type="columns"]').waitFor();await page.evaluate(()=>document.fonts.ready);
  await editor.locator('[data-type="column"]').first().locator('p').click();await page.keyboard.press('End');await page.keyboard.type(' draft');const failed=await json();await editor.press('ControlOrMeta+s');await page.locator('[data-save-status="error"]').waitFor();assert(await page.evaluate(()=>sessionStorage.getItem('rollapp:text:inline-fixture:fixture')));
  await page.reload();await editor.locator('[data-type="columns"]').waitFor();await page.locator('[data-save-status="error"]').waitFor();assert.deepEqual(await json(),failed,'failed save restores complete column draft');assert.equal(await page.evaluate(()=>window.inlineTest.saves.length),0);
  await page.evaluate(()=>{window.inlineTest.fail=false;});await page.getByRole('button',{name:'Повторить сохранение',exact:true}).click();await page.locator('[data-save-status="saved"]').waitFor();const saved=await page.evaluate(()=>window.inlineTest.saved);await page.goto(url(saved));await editor.locator('[data-type="columns"]').waitFor();assert.deepEqual(await json(),failed);
  // Native copy/paste of the complete document keeps columns, widths, nested
  // tasks/toggles, inline marks and literal whitespace through the HTML path.
  await editor.locator(':scope > p').first().click();await editor.press('ControlOrMeta+a');await editor.press('ControlOrMeta+a');await editor.press('ControlOrMeta+c');
  const copied=await page.evaluate(async()=>{const items=await navigator.clipboard.read();let html='';for(const item of items)if(item.types.includes('text/html'))html+=await(await item.getType('text/html')).text();return html;});assert(copied.includes('data-type="columns"'));assert(copied.includes('data-column-width="1.3"'));assert(copied.includes('data-column-width="0.7"'));
  await page.goto(url(''));await editor.waitFor();const empty=await json();await editor.click();await editor.press('ControlOrMeta+v');await frames(page);const pasted=await json();
  if(JSON.stringify(pasted)!==JSON.stringify(failed)){await page.screenshot({path:`/tmp/rollapp-column-paste-failure-${width}-${height}.png`});console.log('COLUMN PASTE JSON',JSON.stringify({expected:failed,actual:pasted}));}
  assert.deepEqual(pasted,failed,'native clipboard preserves exact rich column structure');
  await page.keyboard.type('!');await page.keyboard.press('ControlOrMeta+z');assert.deepEqual(await json(),pasted,'typing after paste has a separate Undo');await page.keyboard.press('ControlOrMeta+z');assert.deepEqual(await json(),empty);await page.keyboard.press('ControlOrMeta+Shift+z');assert.deepEqual(await json(),pasted);
  await editor.press('ControlOrMeta+s');await page.locator('[data-save-status="saved"]').waitFor();const afterPaste=await page.evaluate(()=>window.inlineTest.saved);await page.goto(url(afterPaste)+'&public=1');await page.locator('[data-type="columns"]').waitFor();assert.equal(await page.locator('[contenteditable="true"]').count(),0);assert.equal(await page.locator('[data-column-separator]').count(),0);assert(await page.getByText('Nested child',{exact:true}).isVisible());
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);await page.close();console.log(`PASS column persistence ${width}×${height}: failed-save draft/retry, native full-document clipboard, exact widths/marks/whitespace/nested tasks/toggles, separate typing/paste Undo/Redo and public reload, no API/overflow`);
 }
}
