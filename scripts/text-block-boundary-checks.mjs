import assert from "node:assert/strict";
import { IDENTITY_QUESTION_TITLES } from "../shared/identity-questions.js";

export async function assertStableBlockSelection(editor) {
 const samples=await editor.evaluate(el=>new Promise(resolve=>{
  const samples=[],start=performance.now();
  const frame=()=>{samples.push({selection:el.editor.state.selection.toJSON(),count:el.querySelectorAll('.inline-editor__block-selected').length,hidden:el.classList.contains('ProseMirror-hideselection'),toolbar:el.ownerDocument.querySelectorAll('[role="toolbar"]').length});if(performance.now()-start>=650)resolve(samples);else requestAnimationFrame(frame);};frame();
 }));
 assert.equal(samples[0].selection.type,'rollappBlocks');
 for(const sample of samples){assert.deepEqual(sample.selection,samples[0].selection,'DOM selection normalization must retain exact blocks and direction on every frame');assert.equal(sample.count,samples[0].count);assert(sample.hidden);assert.equal(sample.toolbar,0,'A block selection must not become a text formatting toolbar after rendering');}
}

export async function checkTextBlockBoundaries(browser, origin) {
 const questions={questions:IDENTITY_QUESTION_TITLES.map((title,index)=>({title,paragraphs:[`Ответ ${index}`,`Хвост ${index}`]}))};
 for(const [width,height]of [[320,844],[390,844],[390,400],[768,844],[820,844],[1024,844],[1440,844],[1920,844]]){
  const page=await browser.newPage({viewport:{width,height}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',route=>{errors.push('Unexpected API request');return route.abort();});
  await page.goto(`${origin}/__text-edit?four=1&questions=${encodeURIComponent(JSON.stringify(questions))}`);
  const editor=page.getByRole('textbox',{name:'Ответы на четыре вопроса',exact:true}),answers=editor.locator('[data-question-body]'),selected=editor.locator('.inline-editor__block-selected');
  await answers.nth(3).waitFor();const json=()=>editor.evaluate(el=>el.editor.getJSON()),initial=await json();
  for(const reverse of [false,true]){
   const start=answers.nth(reverse?2:0).locator('p').nth(reverse?0:1),end=answers.nth(reverse?0:2).locator('p').nth(reverse?1:0);
   await start.click();await page.keyboard.press('Escape');await end.click({modifiers:['Shift']});
   assert.deepEqual(await selected.allTextContents(),['Хвост 0','Ответ 1','Хвост 1','Ответ 2']);assert.deepEqual(await json(),initial);
   const selection=await editor.evaluate(el=>el.editor.state.selection.toJSON());assert.equal(selection.anchorBlock>selection.headBlock,reverse);
   await assertStableBlockSelection(editor);
   if(width===1440&&!reverse){
    const headBox=await end.boundingBox();await page.keyboard.press('ControlOrMeta+/');const menu=page.getByRole('dialog',{name:'Действия текстового блока',exact:true});await menu.waitFor();
    const menuBox=await menu.boundingBox();assert(menuBox.x>=0&&menuBox.y>=0&&menuBox.x+menuBox.width<=width+1&&menuBox.y+menuBox.height<=height+1);assert(headBox);await page.keyboard.press('Escape');await menu.waitFor({state:'hidden'});
   }
   const copy=await editor.evaluate(el=>{const data=new DataTransfer();el.dispatchEvent(new ClipboardEvent('copy',{bubbles:true,cancelable:true,clipboardData:data}));return {text:data.getData('text/plain'),html:data.getData('text/html')};});
   assert.equal(copy.text,'Хвост 0\n\nОтвет 1\n\nХвост 1\n\nОтвет 2');assert(!copy.html.includes('contenteditable="false"'));
   await page.keyboard.press('Backspace');assert.deepEqual(await answers.evaluateAll(nodes=>nodes.map(n=>n.textContent)),['Ответ 0','','Хвост 2','Ответ 3Хвост 3']);
   await page.keyboard.press('ControlOrMeta+z');assert.deepEqual(await json(),initial);assert.deepEqual(await editor.evaluate(el=>el.editor.state.selection.toJSON()),selection);
   await page.keyboard.press('Enter');assert.equal(await editor.evaluate(el=>el.editor.state.selection.$from.parent.textContent),reverse?'Хвост 0':'Ответ 2');assert.deepEqual(await json(),initial);
  }
  for(const reverse of [false,true]){
   await answers.nth(0).locator('p').nth(1).click();
   await editor.evaluate((el,reverse)=>{el.focus({preventScroll:true});const first=el.querySelector('[data-question-body="0"] p:last-child').firstChild,last=el.querySelector('[data-question-body="2"] p').firstChild;if(reverse)getSelection().setBaseAndExtent(last,0,first,2);else getSelection().setBaseAndExtent(first,2,last,0);},reverse);
   await page.getByRole('toolbar',{name:'Форматирование выделенного текста'}).waitFor();await page.keyboard.press('Escape');
   assert.deepEqual(await selected.allTextContents(),['Хвост 0','Ответ 1','Хвост 1'],'An endpoint at the start of an untouched answer excludes that answer, but retains every preceding block');
   await assertStableBlockSelection(editor);
   assert.deepEqual(await json(),initial);await page.keyboard.press('Enter');
  }
  const frames=await editor.evaluate(el=>[el,...el.querySelectorAll('[data-question-body] p')].map(n=>{const s=getComputedStyle(n);return [s.borderTopWidth,s.borderRightWidth,s.borderBottomWidth,s.borderLeftWidth,s.outlineStyle==='none'?'0px':s.outlineWidth,s.boxShadow];}));for(const f of frames)assert.deepEqual(f,['0px','0px','0px','0px','0px','none']);
  assert.deepEqual(await editor.locator('h3[contenteditable="false"]').allTextContents(),IDENTITY_QUESTION_TITLES);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);
  await answers.nth(0).locator('p').nth(1).click();await page.keyboard.press('Escape');await answers.nth(2).locator('p').first().click({modifiers:['Shift']});
  const selection=await editor.evaluate(el=>el.editor.state.selection.toJSON());
  await page.keyboard.type('Новая запись');
  assert.deepEqual(await answers.evaluateAll(nodes=>nodes.map(n=>n.textContent)),['Ответ 0Новая запись','','Хвост 2','Ответ 3Хвост 3']);
  await page.keyboard.press('ControlOrMeta+z');assert.deepEqual(await json(),initial);assert.deepEqual(await editor.evaluate(el=>el.editor.state.selection.toJSON()),selection);
  const command=async query=>{await page.keyboard.press('ControlOrMeta+/');const menu=page.getByRole('dialog',{name:'Действия текстового блока',exact:true}),search=page.getByRole('searchbox',{name:'Поиск действий блока'});await menu.waitFor();await search.fill(query);await search.press('Enter');await menu.waitFor({state:'hidden'});};
  await command('red color');const colored=await json();assert.equal(await selected.count(),4);
  await command('heading 2');const changed=await json();assert.equal(await selected.count(),4);assert.deepEqual(await selected.evaluateAll(nodes=>nodes.map(n=>n.tagName)),['H2','H2','H2','H2']);
  assert.deepEqual(changed.content[0].content[0],initial.content[0].content[0]);assert.deepEqual(changed.content[2].content[1],initial.content[2].content[1]);assert.deepEqual(changed.content[3],initial.content[3]);
  for(const [section,index]of [[0,1],[1,0],[1,1],[2,0]]){assert.equal(changed.content[section].content[index].type,'heading');assert.equal(changed.content[section].content[index].attrs.level,2);assert.equal(changed.content[section].content[index].attrs.blockColor,'red');}
  await page.keyboard.press('ControlOrMeta+z');assert.deepEqual(await json(),colored);await page.keyboard.press('ControlOrMeta+Shift+z');assert.deepEqual(await json(),changed);
  await page.keyboard.press('ControlOrMeta+s');await page.waitForFunction(()=>window.inlineTest.saved?.questions[0].paragraphs.join('\n').includes('data-block-color="red"'));
  const saved=await page.evaluate(()=>window.inlineTest.saved);assert.deepEqual(saved.questions[3],questions.questions[3]);
  await page.goto(`${origin}/__text-edit?four=1&questions=${encodeURIComponent(JSON.stringify(saved))}`);await answers.nth(3).waitFor();assert.deepEqual(await json(),changed);
  await page.goto(`${origin}/__text-edit?four=1&readonly=1&questions=${encodeURIComponent(JSON.stringify(saved))}`);await answers.nth(3).waitFor();assert.equal(await page.locator('[contenteditable="true"]').count(),0);assert.equal(await editor.locator('h2[data-block-color="red"]').count(),4);assert.deepEqual(await editor.locator('h3[contenteditable="false"]').allTextContents(),IDENTITY_QUESTION_TITLES);
  const empty={questions:questions.questions.map((question,index)=>index?question:{...question,paragraphs:[]})};
  await page.goto(`${origin}/__text-edit?four=1&questions=${encodeURIComponent(JSON.stringify(empty))}`);await answers.nth(3).waitFor();
  const emptyParagraph=answers.first().locator('p').first();await emptyParagraph.click();await page.keyboard.press('Escape');await assertStableBlockSelection(editor);assert.equal(await selected.count(),1);
  await emptyParagraph.click();await page.waitForFunction(()=>document.querySelector('[contenteditable="true"]').editor.state.selection.toJSON().type==='text');assert.equal(await selected.count(),0);assert.equal(await page.getByRole('toolbar').count(),0);
  assert.equal(await page.evaluate(()=>window.inlineTest.saves.length),0);await page.keyboard.type('Прямой ввод');await page.keyboard.press('ControlOrMeta+s');await page.waitForFunction(()=>window.inlineTest.saved?.questions[0].paragraphs[0]==='Прямой ввод');
  assert.deepEqual((await page.evaluate(()=>window.inlineTest.saved)).questions.slice(1),empty.questions.slice(1));
  assert.deepEqual(errors,[]);
  await page.close();console.log(`PASS block boundaries ${width}x${height}: forward/backward exact blocks, fixed prompts, copy/delete/type/colour/one Undo/Enter, native endpoint exclusion, saved reload/read-only, frameless`);
 }
}
