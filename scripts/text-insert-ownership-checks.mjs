import assert from 'node:assert/strict';
import {MarkdownManager} from '@tiptap/markdown';
import {inlineEditorExtensions} from '../src/lib/inline-editor-extensions.js';
import {IDENTITY_QUESTION_TITLES} from '../shared/identity-questions.js';
const p=text=>({type:'paragraph',content:text?[{type:'text',text}]:[]});
const code={type:'codeBlock',content:[{type:'text',text:Array.from({length:80},(_,i)=>`Code line ${i+1}`).join('\n')}]};
const table={type:'table',content:Array.from({length:32},(_,r)=>({type:'tableRow',content:Array.from({length:3},(_,c)=>({type:r?'tableCell':'tableHeader',attrs:{colwidth:[96]},content:[p(`Cell ${r}:${c}`)]}))}))};
const manager=new MarkdownManager({extensions:inlineEditorExtensions()});
const source=block=>manager.serialize({type:'doc',content:[p('Before'),block,p('After')]});
const cases=[
 {name:'code-before',block:code,selector:'pre',side:'выше',alias:'text'},
 {name:'code-after',block:code,selector:'pre',side:'ниже',alias:'h1'},
 {name:'table-before',block:table,selector:'table',side:'выше',alias:'table'},
 {name:'table-after',block:table,selector:'table',side:'ниже',alias:'columns'},
 {name:'column-child',block:{type:'columns',content:[{type:'column',content:[p('Left column')]},{type:'column',content:[code,p('Right tail')]}]},selector:'pre',side:'выше',alias:'task'},
 {name:'nested-child',block:{type:'nestedBlock',content:[p('Parent'),code,p('Child tail')]},selector:'pre',side:'ниже',alias:'quote'},
 {name:'toggle-child',block:{type:'details',attrs:{open:true},content:[{type:'detailsSummary',content:[{type:'text',text:'Summary'}]},{type:'detailsContent',content:[code,p('Toggle tail')]}]},selector:'pre',side:'выше',alias:'toggle'},
 {name:'four-answer',block:table,selector:'table',side:'ниже',alias:'h2',four:true},
];
const frames=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
function lines(json){const result=[];function visit(node){if(['paragraph','heading','codeBlock','detailsSummary','typographyBlock'].includes(node.type)&&node.content?.some(child=>child.type==='text'))result.push(node);else for(const child of node.content||[])visit(child);}visit(json);return result;}
async function point(editor){return editor.evaluate(el=>{const {state,view}=el.editor,s=getSelection(),caret=view.coordsAtPos(state.selection.head),header=document.querySelector('.global-app-chrome').getBoundingClientRect(),navigation=document.querySelector('.mobile-app-navigation')?.getBoundingClientRect();const range=document.createRange();range.setStart(s.focusNode,s.focusOffset);range.collapse(true);const nativeRect=range.getBoundingClientRect();return{nativeRect:{top:nativeRect.top,bottom:nativeRect.bottom,height:nativeRect.height},scrollY,active:document.activeElement===el,caret,head:state.selection.head,native:view.posAtDOM(s.focusNode,s.focusOffset),headerBottom:header.height?header.bottom:0,bottom:navigation?.height?navigation.top:innerHeight,selectedText:s.toString(),empty:state.selection.$from.parent.content.size===0};});}
export async function checkInsertOwnership(browser,origin){
 for(const [width,height] of [[320,844],[390,844],[390,400],[768,844],[820,844],[1024,844],[1440,400],[1920,844]]){
  const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',r=>{errors.push('Unexpected API request');return r.abort();});
  for(const test of cases){
   const value=source(test.block),questions={questions:IDENTITY_QUESTION_TITLES.map((title,index)=>({title,paragraphs:[index?`Answer ${index+1}`:value]}))};
   const url=saved=>`${origin}/app/spheres/career?tab=about&__text_fixture=1&chrome=1&${test.four?'four=1&questions='+encodeURIComponent(JSON.stringify(saved??questions)):'source='+encodeURIComponent(saved??value)}`;
   await page.addInitScript(()=>{sessionStorage.removeItem('rollapp:text:inline-fixture:fixture');sessionStorage.removeItem('rollapp:text:inline-fixture:identity:four-questions');});
   await page.goto(url());const editor=page.getByRole('textbox',{name:test.four?'Ответы на четыре вопроса':'О себе',exact:true}),target=editor.locator(test.selector).first();await target.waitFor();await page.evaluate(()=>document.fonts.ready);
   const json=()=>editor.evaluate(el=>el.editor.getJSON()),before=await json();
   await target.evaluate(el=>{const b=el.getBoundingClientRect();window.scrollBy({top:b.top+b.height/2-innerHeight/2,behavior:'instant'});});
   const box=await target.boundingBox();assert(box.y<0,`${test.name}: source starts offscreen`);
   const click=test.selector==='table'?await target.evaluate(el=>{const p=[...el.querySelectorAll('p')].find(p=>{const r=p.getBoundingClientRect();return r.top>100&&r.bottom<innerHeight-100;});if(!p)throw Error('No visible table text');const r=p.getBoundingClientRect();return{x:r.left+8,y:r.top+r.height/2};}):{x:box.x+Math.min(100,box.width/2),y:height/2};await page.mouse.click(click.x,click.y);await frames(page);const context=await editor.evaluate(el=>{const s=el.editor.state.selection;return{chain:Array.from({length:s.$from.depth},(_,i)=>s.$from.node(i+1).type.name),active:document.activeElement===el};});console.log('INSERT CONTEXT',test.name,JSON.stringify(context));assert(context.active);assert(context.chain.includes(test.selector==='table'?'table':'codeBlock'));await page.keyboard.press('ControlOrMeta+/');await page.getByRole('dialog',{name:'Действия текстового блока',exact:true}).getByRole('button',{name:`Добавить блок ${test.side}`,exact:true}).click();
   const search=page.getByRole('searchbox',{name:'Поиск типа блока'});await search.fill(test.alias);await search.press('Enter');await frames(page);await page.waitForTimeout(650);
   const position=await point(editor);console.log('INSERT OWNERSHIP',width,test.name,JSON.stringify(position));await page.screenshot({path:`/tmp/rollapp-insert-ownership-${test.name}-${width}-${height}.png`,caret:'initial'});
   assert(position.active,`${test.name}: editor owns focus`);assert.equal(position.head,position.native);assert.equal(position.selectedText,'');assert(position.empty,`${test.name}: caret belongs to an empty new text block`);
   assert(position.caret.top>=position.headerBottom+8,`${test.name}: new caret must clear actual header before typing`);assert(position.caret.bottom<=position.bottom-8,`${test.name}: new caret must clear navigation`);
   const inserted=await json();assert.notDeepEqual(inserted,before);assert.deepEqual(lines(inserted),lines(before),`${test.name}: creation preserves original text/marks/attributes`);
   const marker='New block';await page.keyboard.type(marker);assert.equal(await editor.evaluate(el=>el.editor.state.selection.$from.parent.textContent),marker);const typed=await json();const authored=lines(typed).filter(node=>node.content.some(child=>child.text===marker));assert.equal(authored.length,1);assert.deepEqual(lines(typed).filter(node=>!authored.includes(node)),lines(before),`${test.name}: immediate typing preserves existing text blocks`);
   await editor.press('ControlOrMeta+s');await page.locator('[data-save-status="saved"]').waitFor();const saved=await page.evaluate(()=>window.inlineTest.saved);
   await page.keyboard.press('ControlOrMeta+z');assert.deepEqual(await json(),inserted);await page.keyboard.press('ControlOrMeta+z');assert.deepEqual(await json(),before);
   await page.goto(url(saved));await editor.waitFor();assert.deepEqual(await json(),typed,`${test.name}: exact save/reload`);assert.equal(await page.evaluate(()=>window.inlineTest.saves.length),0);
   if(test.four)assert.deepEqual(await editor.locator('h3[contenteditable="false"]').allTextContents(),IDENTITY_QUESTION_TITLES);
  }
  assert.deepEqual(errors,[]);await page.close();
  if(height===400)await fontSettlementGuards(browser,origin,width,height);
  console.log(`PASS block insertion ownership ${width}x${height}: offscreen code/table, nested/columns/toggle/four answers, picker handoff, visible native caret, exact neighbours/marks, separate Undo and save/reload, font settlement/cancel guards, no API`);
 }
}

async function fontSettlementGuards(browser,origin,width,height){
 for(const mode of ['settle','wheel','selection','access']){
  const page=await browser.newPage({viewport:{width,height}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',r=>{errors.push('Unexpected API request');return r.abort();});
  let release,held=0;const gate=new Promise(resolve=>{release=resolve;});
  await page.route('**/*-wght-italic.woff2*',async route=>{held++;const response=await route.fetch();await gate;await route.fulfill({response});});
  try{
   const value=source(cases.find(c=>c.name==='nested-child').block);
   await page.goto(`${origin}/app/spheres/career?tab=about&__text_fixture=1&chrome=1&access=1&source=${encodeURIComponent(value)}`);
   const editor=page.getByRole('textbox',{name:'О себе',exact:true});await editor.locator('pre').waitFor();await page.evaluate(()=>document.fonts.ready);
   await editor.locator('pre').evaluate(el=>{const b=el.getBoundingClientRect();window.scrollBy({top:b.top+b.height/2-innerHeight/2,behavior:'instant'});});
   const box=await editor.locator('pre').boundingBox();await page.mouse.click(box.x+Math.min(100,box.width/2),height/2);await frames(page);await page.keyboard.press('ControlOrMeta+/');
   await page.getByRole('dialog',{name:'Действия текстового блока',exact:true}).getByRole('button',{name:'Добавить блок ниже',exact:true}).click();const search=page.getByRole('searchbox',{name:'Поиск типа блока'});await search.fill('quote');await search.press('Enter');
   await page.waitForFunction(()=>document.fonts.status==='loading');assert(held>0,'real italic font request is held');await frames(page);await page.waitForTimeout(80);
   const initial=await point(editor);assert(initial.caret.top>=initial.headerBottom+8);assert(initial.caret.bottom<=initial.bottom-8,'first reveal must work before font settles');
   if(mode==='wheel'){await page.mouse.wheel(0,-320);await page.waitForTimeout(100);assert(Math.abs((await page.evaluate(()=>scrollY))-initial.scrollY)>100,'actual wheel changes scroll');}
   if(mode==='selection')await editor.locator(':scope > p').first().click();
   if(mode==='access')await page.getByRole('button',{name:'Только чтение',exact:true}).click();
   await frames(page);
   if(mode==='selection'){const moved=await point(editor);assert.notEqual(moved.head,initial.head,'new click owns a different caret before releasing the font');assert.equal(moved.head,moved.native);}
   const stopped=await page.evaluate(()=>scrollY),state=await editor.evaluate(el=>({json:el.editor.getJSON(),selection:el.editor.state.selection.toJSON()}));
   release();await page.evaluate(()=>document.fonts.ready);await frames(page);await page.waitForTimeout(650);
   assert.deepEqual(await editor.evaluate(el=>({json:el.editor.getJSON(),selection:el.editor.state.selection.toJSON()})),state,`${mode}: font completion preserves document/range`);
   if(mode==='settle'){const final=await point(editor);assert(final.active);assert.equal(final.head,final.native);assert(final.caret.top>=final.headerBottom+8);assert(final.caret.bottom<=final.bottom-8,'final font metrics clear navigation');}
   else assert.equal(await page.evaluate(()=>scrollY),stopped,`${mode}: cancelled font continuation must not scroll`);
   assert.deepEqual(errors,[]);console.log('FONT OWNERSHIP',width,mode,'PASS');
  }finally{release();await page.close();}
 }
}
