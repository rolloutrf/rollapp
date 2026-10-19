import assert from 'node:assert/strict';
import { MarkdownManager } from '@tiptap/markdown';
import { inlineEditorExtensions } from '../src/lib/inline-editor-extensions.js';
const p=value=>({type:'paragraph',content:[{type:'text',text:value}]});
const sourceFor=(tall=false,rows=4)=>new MarkdownManager({extensions:inlineEditorExtensions()}).serialize({type:'doc',content:[...Array.from({length:10},(_,i)=>p(`Вводный абзац ${i+1}`)),{type:'table',content:Array.from({length:rows},(_,row)=>({type:'tableRow',content:Array.from({length:3},(_,col)=>({type:row===0?'tableHeader':'tableCell',content:[p(`R${row}C${col}`),p(`Деталь ${row}:${col}`),...(tall&&row===0?Array.from({length:18},(_,i)=>p(`Длинный заголовок ${i+1}`)):[])]}))}))},...Array.from({length:20},(_,i)=>p(`Абзац после таблицы ${i+1}`))]});
const overlaps=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
export async function checkTableChrome(browser,origin){
 const sizes=process.argv.includes('--table-chrome-single-row-diagnostic')?[[1024,400]]:process.argv.includes('--table-chrome-short-diagnostic')?[[1440,400]]:process.argv.includes('--table-chrome-diagnostic')?[[1024,844]]:[[320,844],[390,844],[390,400],[768,844],[820,844],[1024,844],[1024,400],[1440,844],[1440,400],[1920,844]];
 for(const [width,height] of sizes){
  const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',route=>{errors.push('Unexpected API request');return route.abort();});
  const source=sourceFor(width===1440&&height===400,width===1024&&height===400?1:4);
  await page.goto(`${origin}/app/spheres/career?tab=about&__text_fixture=1&chrome=1&source=${encodeURIComponent(source)}`);
  const editor=page.getByRole('textbox',{name:'О себе',exact:true});await editor.locator('td,th').last().waitFor();await page.getByRole('banner',{name:'Панель приложения',exact:true}).waitFor();await page.evaluate(()=>document.fonts.ready);
  const structure=await editor.evaluate(el=>{const prose=el.closest('.sphere-text-page');return {combined:prose.classList.contains('app-page'),nested:prose.parentElement.classList.contains('app-page'),width:prose.getBoundingClientRect().width};});
  assert.equal(structure.combined,false);assert(structure.nested);assert(structure.width<=768+1,'actual reading role must stay inside the page shell');
  const before=await editor.evaluate(el=>el.editor.getJSON());
  await editor.locator('table').evaluate(el=>window.scrollBy({top:el.getBoundingClientRect().top-80,behavior:'instant'}));
  await editor.locator('th p').filter({hasText:/^Деталь 0:1$/}).hover();
  if(width>=1024){
   const column=page.getByRole('button',{name:'Действия столбца 2',exact:true});await column.waitFor();
   const geometry=await column.evaluate(el=>{const b=el.getBoundingClientRect(),header=[...document.querySelectorAll('.global-app-chrome button,.global-app-chrome [data-slot="select-trigger"],.global-app-chrome a')].filter(node=>node.getBoundingClientRect().width).map(node=>{const r=node.getBoundingClientRect();return {name:node.getAttribute('aria-label'),left:r.left,top:r.top,right:r.right,bottom:r.bottom};});return {button:{left:b.left,top:b.top,right:b.right,bottom:b.bottom},hit:el.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)),header};});
   await page.screenshot({path:`/tmp/rollapp-table-chrome-${width}-${height}.png`});console.log('CHROME GEOMETRY',width,height,JSON.stringify(geometry));
   assert(geometry.hit,'column handle centre must be reachable with real app chrome');
   assert(!geometry.header.some(rect=>overlaps(geometry.button,rect)),'column control must not overlap header controls');
   const row=page.getByRole('button',{name:'Действия строки 1',exact:true});const r=await row.evaluate(el=>{const b=el.getBoundingClientRect();return {left:b.left,top:b.top,right:b.right,bottom:b.bottom,hit:el.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2))};});
   assert(r.hit,'row handle centre remains reachable beside a tall header cell');assert(!overlaps(geometry.button,r),'row and column handles use separate gutter slots');
   assert(!geometry.header.some(rect=>overlaps(r,rect)),'row control must not overlap header controls');
   const textRects=await editor.locator('p').evaluateAll(nodes=>nodes.flatMap(node=>{const range=document.createRange();range.selectNodeContents(node);return [...range.getClientRects()].map(rect=>({text:node.textContent,left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom}));}));
   const covered=textRects.filter(rect=>overlaps(geometry.button,rect)||overlaps(r,rect));
   assert.deepEqual(covered,[],'48px axis controls must not obscure authored text inside or below the table');
   await column.click();const menu=page.getByRole('dialog',{name:'Действия столбца',exact:true});await menu.waitFor();await page.keyboard.press('Escape');await menu.waitFor({state:'hidden'});
  }else {
   assert.equal(await page.locator('[data-table-axis]').count(),0);
   await editor.locator('th p').filter({hasText:/^Деталь 0:1$/}).click();await page.keyboard.press('ControlOrMeta+/');
   const menu=page.getByRole('dialog',{name:'Действия текстового блока',exact:true});await menu.waitFor();
   assert.equal(await menu.getByRole('button',{name:'Переместить столбец влево',exact:true}).isEnabled(),true);
   await page.keyboard.press('Escape');await menu.waitFor({state:'hidden'});
  }
  assert.deepEqual(await editor.evaluate(el=>el.editor.getJSON()),before);assert.equal(await page.evaluate(()=>window.inlineTest.saves.length),0);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);
  await page.close();console.log(`PASS table with app chrome ${width}×${height}: real header/navigation, deep scroll, reachable non-overlapping axis controls, menu cancel, no document/API changes or root overflow`);
 }
}
