import assert from 'node:assert/strict';
import { MarkdownManager } from '@tiptap/markdown';
import { inlineEditorExtensions } from '../src/lib/inline-editor-extensions.js';
const p=value=>({type:'paragraph',content:[{type:'text',text:value}]});
const source=new MarkdownManager({extensions:inlineEditorExtensions()}).serialize({type:'doc',content:[p('Заметки'),p('Широкая таблица'),{type:'table',content:Array.from({length:4},(_,row)=>({type:'tableRow',content:Array.from({length:6},(_,col)=>({type:row===0?'tableHeader':'tableCell',attrs:{colwidth:[200],blockColor:col===1?'blue_background':null},content:[p(`R${row}C${col}`),p(`Деталь ${row}:${col}`)]}))}))},p('Сосед после таблицы')]});
export async function checkWideTable(browser,origin){
 for(const [width,height] of [[1024,844],[1440,400]]){
  const page=await browser.newPage({viewport:{width,height}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',route=>{errors.push('Unexpected API request');return route.abort();});
  const url=value=>`${origin}/__text-edit?source=${encodeURIComponent(value)}`;
  await page.goto(url(source));const editor=page.getByRole('textbox',{name:'О себе',exact:true});await editor.locator('td').last().waitFor();await page.evaluate(()=>document.fonts.ready);
  const wrapper=editor.locator('.tableWrapper');assert(await wrapper.evaluate(el=>el.scrollWidth>el.clientWidth+100));
  const before=await editor.evaluate(el=>el.editor.getJSON()),expected=structuredClone(before),order=[0,2,3,4,1,5];
  expected.content[2].content.forEach(row=>{row.content=order.map(index=>row.content[index]);});
  await editor.locator('th p').filter({hasText:/^R0C1$/}).hover();const handle=page.getByRole('button',{name:'Действия столбца 2',exact:true});await handle.waitFor();
  const h=await handle.boundingBox(),clip=await wrapper.boundingBox();
  await handle.evaluate(el=>{const holder=el.closest('[data-control-bar]'),r=holder.getBoundingClientRect();window.__wideCapture={element:el,holder,rect:{x:r.left,y:r.top,width:r.width,height:r.height}};el.addEventListener('pointerdown',event=>{window.__wideCapture.id=event.pointerId;},{once:true});});
  await page.mouse.move(h.x+24,h.y+24);await page.mouse.down();await page.mouse.move(clip.x+clip.width-4,h.y+24,{steps:10});
  await page.waitForFunction(()=>document.querySelector('.tableWrapper').scrollLeft>100);
  const target=editor.locator('th').filter({hasText:/R0C4/});
  await page.waitForFunction(()=>{const w=document.querySelector('.tableWrapper'),cell=[...document.querySelectorAll('th')].find(el=>el.querySelector('p')?.textContent==='R0C4');return cell.getBoundingClientRect().right<=w.getBoundingClientRect().right-48;});
  const capture=await page.evaluate(()=>{const {element,holder,id,rect}=window.__wideCapture,r=holder.getBoundingClientRect();return{connected:element.isConnected,captured:element.hasPointerCapture(id),left:r.left,top:r.top,width:r.width,height:r.height,original:rect};});
  assert(capture.connected&&capture.captured,'source handle retains actual pointer capture while its column scrolls out of view');assert.deepEqual({x:capture.left,y:capture.top,width:capture.width,height:capture.height},capture.original,'owned handle remains at its original clear position during edge-scroll');
  const cell=await target.boundingBox();await page.mouse.move(cell.x+cell.width/2+2,h.y+24,{steps:5});
  const guide=page.locator('[data-inline-axis-guide]');await guide.waitFor({state:'visible'});assert.equal((await guide.boundingBox()).width,2);await page.mouse.up();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const after=await editor.evaluate(el=>el.editor.getJSON());console.log('WIDE RESULT',width,await wrapper.evaluate(el=>({scrollLeft:el.scrollLeft,scrollWidth:el.scrollWidth,width:el.clientWidth})),after.content[2].content[0].content.map(cell=>cell.content[0].content[0].text));
  assert.deepEqual(after,expected,'native edge-scroll drag moves the exact original column to the distant destination');
  assert.equal(await page.locator('[data-inline-axis-guide]').count(),0);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:`/tmp/rollapp-wide-table-${width}-${height}.png`});
  await page.keyboard.press('ControlOrMeta+z');assert.deepEqual(await editor.evaluate(el=>el.editor.getJSON()),before);
  await page.keyboard.press('ControlOrMeta+Shift+z');assert.deepEqual(await editor.evaluate(el=>el.editor.getJSON()),expected);
  await page.keyboard.press('ControlOrMeta+s');await page.locator('[data-save-status="saved"]').waitFor();const saved=await page.evaluate(()=>window.inlineTest.saved);
  await page.goto(url(saved));await editor.locator('td').last().waitFor();assert.deepEqual(await editor.evaluate(el=>el.editor.getJSON()),expected);
  assert.deepEqual(errors,[]);await page.close();console.log(`PASS wide table ${width}×${height}: native column pointer edge-scroll to offscreen destination, exact content/attrs/widths, one Undo/Redo, save/reload, one horizontal owner and no API/root overflow`);
 }
}
