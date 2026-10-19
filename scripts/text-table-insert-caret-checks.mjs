import assert from 'node:assert/strict';
import {MarkdownManager} from '@tiptap/markdown';
import {inlineEditorExtensions} from '../src/lib/inline-editor-extensions.js';
const p=text=>({type:'paragraph',content:text?[{type:'text',text}]:[]});
const source=new MarkdownManager({extensions:inlineEditorExtensions()}).serialize({type:'doc',content:[p('Before'),{type:'table',content:Array.from({length:24},(_,r)=>({type:'tableRow',content:Array.from({length:3},(_,c)=>({type:r===0?'tableHeader':'tableCell',attrs:{colwidth:[400]},content:[p(`${r}:${c}`)]}))}))},p('After')]});
const frames=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
async function point(editor){return editor.evaluate(el=>{
 const {state,view}=el.editor,selection=getSelection(),native=view.posAtDOM(selection.focusNode,selection.focusOffset),caret=view.coordsAtPos(state.selection.head);
 let depth=state.selection.$from.depth;while(depth&& !['cell','header_cell'].includes(state.selection.$from.node(depth).type.spec.tableRole))depth--;
 const cell=depth?view.nodeDOM(state.selection.$from.before(depth)):null,box=cell?.getBoundingClientRect(),wrapper=cell?.closest('.tableWrapper').getBoundingClientRect(),header=document.querySelector('.global-app-chrome').getBoundingClientRect();
 return {caret,head:state.selection.head,native,cell:box&&{left:box.left,right:box.right,top:box.top,bottom:box.bottom},wrapper:wrapper&&{left:wrapper.left,right:wrapper.right},headerBottom:header.bottom,height:innerHeight,scrollY,scrollLeft:cell?.closest('.tableWrapper').scrollLeft,active:document.activeElement===el};
});}
export async function checkTableInsertCaret(browser,origin){
 for(const [width,height] of [[1024,844],[1440,400]]){
  const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',r=>{errors.push('Unexpected API request');return r.abort();});
  await page.goto(`${origin}/app/spheres/career?tab=about&__text_fixture=1&chrome=1&source=${encodeURIComponent(source)}`);
  const editor=page.getByRole('textbox',{name:'О себе',exact:true});await editor.locator('td').last().waitFor();await page.evaluate(()=>document.fonts.ready);
  const before=await editor.evaluate(el=>el.editor.getJSON());
  await editor.locator('table').evaluate(el=>{const b=el.getBoundingClientRect();window.scrollBy({top:b.top+b.height/2-innerHeight/2,behavior:'instant'});});
  const b=await editor.locator('table').boundingBox(),w=await editor.locator('.tableWrapper').boundingBox();assert(b.y<0,'original header row must start offscreen');
  await page.mouse.move(w.x+w.width-2,Math.max(120,height/2));await frames(page);
  const plus=page.locator('[data-table-growth="column"]');await plus.waitFor();await plus.click();await frames(page);await page.waitForTimeout(650);
  const position=await point(editor);console.log('INSERT CARET',width,height,JSON.stringify(position));await page.screenshot({path:`/tmp/rollapp-table-insert-caret-${width}-${height}.png`,caret:'initial'});
  assert(position.active);assert.equal(position.head,position.native);
  assert(position.caret.top>=position.headerBottom+8,'new cell caret must clear actual app chrome after native reconciliation');
  assert(position.caret.bottom<=height-8);assert(position.cell.left>=position.wrapper.left-1&&position.cell.right<=position.wrapper.right+1,'entire new cell should be revealed by its horizontal owner');
  const grown=await editor.evaluate(el=>el.editor.getJSON());assert.equal(grown.content[1].content[0].content.length,4);
  await page.keyboard.type('New column');assert.equal(await editor.evaluate(el=>el.editor.state.selection.$from.parent.textContent),'New column');
  await page.keyboard.press('ControlOrMeta+z');assert.deepEqual(await editor.evaluate(el=>el.editor.getJSON()),grown);await page.keyboard.press('ControlOrMeta+z');assert.deepEqual(await editor.evaluate(el=>el.editor.getJSON()),before);
  await frames(page);await page.waitForTimeout(650);const undone=await point(editor);console.log('UNDO CARET',width,height,JSON.stringify(undone));assert(undone.caret.top>=undone.headerBottom+8,'Undo must leave its restored native caret below app chrome');
  await page.keyboard.press('ControlOrMeta+Shift+z');await frames(page);await page.waitForTimeout(650);const redone=await point(editor);assert.deepEqual(await editor.evaluate(el=>el.editor.getJSON()),grown);assert(redone.caret.top>=redone.headerBottom+8);assert(redone.cell.left>=redone.wrapper.left-1&&redone.cell.right<=redone.wrapper.right+1,'Redo reveals the entire restored cell');
  await page.keyboard.press('ControlOrMeta+z');await page.keyboard.press('ControlOrMeta+y');await frames(page);assert.deepEqual(await editor.evaluate(el=>el.editor.getJSON()),grown);
  assert.deepEqual(errors,[]);await page.close();console.log(`PASS inserted table caret ${width}×${height}: offscreen original header, whole new cell/caret visible, exact native cursor, immediate typing and separate Undo, no API`);
 }
}
