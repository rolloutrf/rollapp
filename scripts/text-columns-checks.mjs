import assert from "node:assert/strict";
const frames = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const initialSource = "Before\n\nTarget **bold**\n\nMoving *italic*\n\nAfter";

export async function checkDocumentColumns(browser, origin) {
  for (const [width,height] of [[320,844],[390,844],[390,400],[768,844],[820,844],[1024,844],[1440,844],[1440,400],[1920,844]]) {
    const page=await browser.newPage({viewport:{width,height}}),errors=[];
    page.on("pageerror",error=>errors.push(error.message));
    await page.route("**/api/**",route=>{errors.push("Unexpected API request");return route.abort();});
    const url=source=>`${origin}/app/spheres/career?tab=about&__text_fixture=1&chrome=1&source=${encodeURIComponent(source)}`;
    await page.goto(url(initialSource));
    const editor=page.getByRole("textbox",{name:"О себе",exact:true}),json=()=>editor.evaluate(el=>el.editor.getJSON());
    await editor.locator(":scope > p").last().waitFor();await page.evaluate(()=>document.fonts.ready);
    const original=await json();
    await editor.locator(":scope > p").last().click();await page.keyboard.press("End");await page.keyboard.press("Enter");await page.keyboard.type("/columns");
    await page.getByRole("button",{name:"Две колонки",exact:true}).click();await frames(page);
    const columns=editor.locator('[data-type="columns"]'),parts=columns.locator(':scope > [data-type="column"]');
    assert.equal(await parts.count(),2);
    const emptyColumns=await json();assert.deepEqual(emptyColumns.content.slice(0,4),original.content);
    await page.keyboard.type("Left text");assert.equal(await parts.first().innerText(),"Left text");
    await page.keyboard.press("ControlOrMeta+z");assert.deepEqual(await json(),emptyColumns,"typing is separate from creating the columns");
    await parts.first().locator("p").click();await page.keyboard.type("Left text");
    await parts.last().locator("p").click();await page.keyboard.type("Right text");
    const boxes=await parts.evaluateAll(nodes=>nodes.map(n=>{const b=n.getBoundingClientRect();return {left:b.left,top:b.top,right:b.right,bottom:b.bottom,width:b.width};}));
    if(width<768) assert(boxes[1].top>=boxes[0].bottom,"phone displays the right column after the left");
    else assert(boxes[1].left>boxes[0].right&&Math.abs(boxes[1].top-boxes[0].top)<1,"tablet and desktop columns share their row");
    await parts.first().locator("p").click();await page.keyboard.press("ControlOrMeta+Shift+ArrowDown");await frames(page);
    assert.equal(await columns.count(),0,"keyboard move crosses the column boundary and restores ordinary flow");assert((await editor.innerText()).includes("Left text"));assert((await editor.innerText()).includes("Right text"));
    await page.keyboard.press("ControlOrMeta+z");assert.equal(await parts.count(),2);
    const changed=await json();await editor.press("ControlOrMeta+s");await page.locator('[data-save-status="saved"]').waitFor();const saved=await page.evaluate(()=>window.inlineTest.saved);
    await page.goto(url(saved));await editor.locator('[data-type="columns"]').waitFor();assert.deepEqual(await json(),changed);
    await page.goto(url(saved)+"&public=1");const reader=page.locator('[data-type="columns"]');await reader.waitFor();assert.equal(await reader.locator('[data-type="column"]').count(),2);assert(await reader.innerText().then(t=>t.includes("Left text")&&t.includes("Right text")));
    if(width>=1024) {
      await page.goto(url(initialSource));await editor.locator(":scope > p").last().waitFor();
      const moving=editor.locator(":scope > p").nth(2),target=editor.locator(":scope > p").nth(1);
      await moving.hover();await frames(page);const grip=page.getByRole("button",{name:"Переместить блок или открыть меню",exact:true});await grip.waitFor();
      const targetBox=await target.boundingBox();await grip.dragTo(target,{targetPosition:{x:targetBox.width-2,y:targetBox.height/2}});await frames(page);
      const moved=await json();assert.equal(moved.content[1].type,"columns");assert.equal(moved.content.length,3);assert.deepEqual(moved.content[1].content[0].content,[original.content[1]]);assert.deepEqual(moved.content[1].content[1].content,[original.content[2]]);
      await editor.locator('[data-type="column"]').last().locator("p").hover();await frames(page);
      const rail=await editor.boundingBox(),handle=await page.locator('.inline-editor__drag-handle').boundingBox();assert(handle.x+handle.width<=rail.x+1,"column controls stay in the external gutter without covering peer text");
      const separator=page.getByRole("separator",{name:"Ширина колонки 1",exact:true});await separator.waitFor();await editor.locator('[data-type="column"]').first().locator('p').hover();await frames(page);
      const originalWidths=await json();await separator.press("ArrowRight");await frames(page);const keyboardWidths=await json();assert(keyboardWidths.content[1].content[0].attrs.width>originalWidths.content[1].content[0].attrs.width);
      await separator.press("ControlOrMeta+z");assert.deepEqual(await json(),originalWidths);await editor.locator('[data-type="column"]').first().locator('p').hover();await frames(page);
      const separatorBox=await separator.boundingBox();await page.mouse.move(separatorBox.x+4,separatorBox.y+separatorBox.height/2);await page.mouse.down();await page.mouse.move(separatorBox.x+64,separatorBox.y+separatorBox.height/2,{steps:8});await frames(page);assert.deepEqual(await json(),originalWidths,"pointer width preview is transient");await page.mouse.up();await frames(page);const resized=await json();assert(resized.content[1].content[0].attrs.width>1);assert(resized.content[1].content[1].attrs.width<1);
      await editor.press("ControlOrMeta+s");await page.locator('[data-save-status="saved"]').waitFor();const resizedSource=await page.evaluate(()=>window.inlineTest.saved);
      await page.keyboard.press("ControlOrMeta+z");assert.deepEqual(await json(),originalWidths);
      await editor.locator('[data-type="column"]').first().locator('p').hover();await frames(page);const cancelBox=await separator.boundingBox();await page.mouse.move(cancelBox.x+4,cancelBox.y+cancelBox.height/2);await page.mouse.down();await page.mouse.move(cancelBox.x+42,cancelBox.y+cancelBox.height/2,{steps:5});await page.keyboard.press("Escape");await page.mouse.up();await frames(page);assert.deepEqual(await json(),originalWidths);
      await page.screenshot({path:`/tmp/rollapp-document-columns-${width}-${height}.png`});
      const rightColumn=editor.locator('[data-type="column"]').last().locator("p"),leftColumn=editor.locator('[data-type="column"]').first().locator("p");
      await rightColumn.hover();await frames(page);const leftBox=await leftColumn.boundingBox();
      await grip.dragTo(leftColumn,{targetPosition:{x:leftBox.width/2,y:leftBox.height-1}});await frames(page);
      assert.deepEqual(await json(),original,"moving the last block out removes the column layout");
      await page.keyboard.press("ControlOrMeta+z");assert.deepEqual(await json(),moved);
      await editor.locator('[data-type="column"]').last().locator("p").click();await page.keyboard.press("Escape");await page.keyboard.press("Backspace");await frames(page);
      const removed=await json();assert.deepEqual(removed.content,[original.content[0],original.content[1],original.content[3]],"deleting a whole column unwraps the remaining column");
      await page.keyboard.press("ControlOrMeta+z");assert.deepEqual(await json(),moved);
      await page.keyboard.press("ControlOrMeta+z");assert.deepEqual(await json(),original);
      await page.goto(url(resizedSource));await editor.locator('[data-type="columns"]').waitFor();assert.deepEqual(await json(),resized);
      const sizes=await editor.locator('[data-type="column"]').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().width));assert(sizes[0]>sizes[1],"saved width ratio remains visible after reload");
    }
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    const framesFound=await page.locator('.inline-editor__content').evaluateAll(nodes=>nodes.flatMap(el=>[el,...el.querySelectorAll('[data-type="columns"],[data-type="column"],p')]).map(el=>{const s=getComputedStyle(el);return [s.borderTopWidth,s.borderRightWidth,s.borderBottomWidth,s.borderLeftWidth,s.outlineStyle==="none"?"0px":s.outlineWidth,s.boxShadow];}));
    for(const frame of framesFound)assert.deepEqual(frame,["0px","0px","0px","0px","0px","none"]);
    assert.deepEqual(errors,[]);await page.close();console.log(`PASS document columns ${width}×${height}: slash creation, immediate typing, separate Undo, exact reload/public read, responsive layout${width>=1024?", native side drag/removal/delete, rich nodes, keyboard/pointer width preview/cancel/Undo/reload and external gutter":""}, no frames/API/overflow`);
  }
}

export async function checkDocumentColumnContexts(browser,origin){
  const [{MarkdownManager},{inlineEditorExtensions},{IDENTITY_QUESTION_TITLES},{identityFourQuestionsSchema}]=await Promise.all([import('@tiptap/markdown'),import('../src/lib/inline-editor-extensions.js'),import('../shared/identity-questions.js'),import('../server/identity-content-schema.js')]);
  const p=text=>({type:'paragraph',content:[{type:'text',text}]}),column=(width,content)=>({type:'column',attrs:{width},content});
  const source=new MarkdownManager({extensions:inlineEditorExtensions()}).serialize({type:'doc',content:[{type:'columns',content:[column(1.2,[p('Left peer: '+('Text beside the table must stay readable. '.repeat(9)))]),column(.8,[p('Middle'),{type:'table',content:Array.from({length:3},(_,r)=>({type:'tableRow',content:Array.from({length:3},(_,c)=>({type:r===0?'tableHeader':'tableCell',content:[p(`${r}:${c}`)]}))}))}]),column(1,[p('Right peer')])]}]});
  for(const [width,height] of [[390,400],[1024,844],[1440,400]]){
    const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',r=>{errors.push('Unexpected API request');return r.abort();});
    const questions={questions:IDENTITY_QUESTION_TITLES.map((title,index)=>({title,paragraphs:[index===0?source:`Neighbour ${index}`]}))},url=value=>`${origin}/app/spheres/career?tab=about&__text_fixture=1&chrome=1&four=1&questions=${encodeURIComponent(JSON.stringify(value))}`;
    await page.goto(url(questions));const four=page.getByRole('textbox',{name:'Ответы на четыре вопроса',exact:true});await four.locator('[data-type="columns"]').waitFor();await page.evaluate(()=>document.fonts.ready);
    await four.getByText('Middle',{exact:true}).click();await page.keyboard.press('End');await page.keyboard.type(' edited');const changed=await four.evaluate(el=>el.editor.getJSON());await four.press('ControlOrMeta+s');await page.locator('[data-save-status="saved"]').waitFor();const saved=await page.evaluate(()=>window.inlineTest.saved);identityFourQuestionsSchema.parse(saved);assert.deepEqual(saved.questions.slice(1),questions.questions.slice(1));assert.deepEqual(saved.questions.map(q=>q.title),IDENTITY_QUESTION_TITLES);
    await page.goto(url(saved));await four.locator('table').waitFor();assert.deepEqual(await four.evaluate(el=>el.editor.getJSON()),changed);
    if(width>=1024){
      await four.locator('th').first().hover();await frames(page);const controls=page.locator('[data-table-axis]');assert.equal(await controls.count(),2);
      const collisions=await four.evaluate(el=>{const overlap=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;return [...document.querySelectorAll('[data-table-axis]')].flatMap(control=>{const box=control.getBoundingClientRect();return [...el.querySelectorAll('p,h1,h2,h3,h4,h5,h6,summary')].flatMap(node=>{const range=document.createRange();range.selectNodeContents(node);return [...range.getClientRects()].some(rect=>rect.width&&rect.height&&overlap(box,rect))?[{axis:control.dataset.tableAxis,text:node.textContent}]:[];});});});
      await page.screenshot({path:`/tmp/rollapp-columns-table-controls-${width}-${height}.png`});assert.deepEqual(collisions,[],'nested table axis controls must not cover prose in peer columns');
      await page.goto(`${origin}/app/spheres/career?tab=about&__text_fixture=1&chrome=1&access=1&source=${encodeURIComponent(source)}`);const editor=page.getByRole('textbox',{name:'О себе',exact:true});await editor.locator('[data-type="columns"]').waitFor();await page.evaluate(()=>document.fonts.ready);await editor.locator('[data-type="column"]').first().locator('p').hover();await frames(page);
      const separator=page.getByRole('separator',{name:'Ширина колонки 1',exact:true}),before=await editor.evaluate(el=>el.editor.getJSON());
      const beginPreview=async()=>{
        await page.mouse.move(10,height-10);await frames(page);
        const box=await separator.boundingBox();
        const hit=await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.closest('[data-column-separator]')?.getAttribute('aria-label'),{x:box.x+4,y:box.y+24});
        assert.equal(hit,'Ширина колонки 1','Column boundary must receive the first pointer before hover state renders; prose must not start native drag');
        await page.evaluate(()=>{window.columnPointerId=null;document.addEventListener('pointerdown',event=>{window.columnPointerId=event.pointerId;},{once:true,capture:true});});
        await page.mouse.move(box.x+4,box.y+24);await page.mouse.down();
        assert(await separator.evaluate(el=>el.hasPointerCapture(window.columnPointerId)),'Native resize must capture its own pointer');
        await page.mouse.move(box.x+44,box.y+24,{steps:4});
      };
      await beginPreview();assert.deepEqual(await editor.evaluate(el=>el.editor.getJSON()),before);
      await page.getByRole('button',{name:'Только чтение',exact:true}).dispatchEvent('click');await frames(page);await page.mouse.up();assert.deepEqual(await editor.evaluate(el=>el.editor.getJSON()),before);assert.equal(await page.locator('[data-column-separator]').count(),0);
      await page.getByRole('button',{name:'Разрешить редактирование',exact:true}).click();await editor.locator('[data-type="column"]').first().locator('p').hover();await frames(page);await beginPreview();
      await editor.evaluate(el=>el.editor.commands.insertContent('Changed during preview'));const external=await editor.evaluate(el=>el.editor.getJSON());await frames(page);await page.mouse.up();assert.deepEqual(await editor.evaluate(el=>el.editor.getJSON()),external,'changed document cancels stale resize');
    }
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);await page.close();console.log(`PASS column contexts ${width}×${height}: Four Questions API-valid exact save/reload, fixed neighbours/titles${width>=1024?', nested table control glyph geometry, access and changed-source resize cancellation':''}, no API/root overflow`);
  }
}
