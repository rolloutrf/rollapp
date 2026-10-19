import assert from 'node:assert/strict';
const source='Before\n\n| A | B | C |\n|---|---|---|\n| **D** | E | F |\n| G | H | I |\n\nAfter';
const frames=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const table=doc=>doc.content.find(node=>node.type==='table');
export async function checkTableGrowth(browser,origin){
 for(const [width,height] of (process.argv.includes('--table-growth-diagnostic')?[[1024,844]]:[[320,844],[390,844],[768,844],[820,844],[1024,844],[1440,844],[1920,844],[390,400],[1440,400]])){
  const page=await browser.newPage({viewport:{width,height}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));await page.route('**/api/**',route=>{errors.push('Unexpected API request');return route.abort();});
  const url=value=>`${origin}/app/spheres/career?tab=about&__text_fixture=1&chrome=1&source=${encodeURIComponent(value)}`;
  const editor=page.getByRole('textbox',{name:'О себе',exact:true}),json=()=>editor.evaluate(el=>el.editor.getJSON());
  await page.goto(url(source));await editor.locator('td').last().waitFor();await page.evaluate(()=>document.fonts.ready);const before=await json();
  if(width<1024){
   await editor.locator('td').last().hover();assert.equal(await page.locator('[data-table-growth]').count(),0);
   assert.deepEqual(await json(),before);assert.equal(await page.evaluate(()=>window.inlineTest.saves.length),0);
  }else{
   const show=async mode=>{
    const b=await editor.locator('table').boundingBox(),w=await editor.locator('.tableWrapper').boundingBox();await page.mouse.move(0,0);
    await page.mouse.move(mode==='row'?w.x+w.width/2:w.x+w.width-2,mode==='column'?b.y+b.height/2:b.y+b.height-2);await frames(page);
    const button=page.locator(`[data-table-growth="${mode}"]`);await button.waitFor();return button;
   };
   for(const axis of ['row','column']){
    const add=await show(axis);const geometry=await add.evaluate(el=>{const b=el.getBoundingClientRect(),s=getComputedStyle(el),header=document.querySelector('.global-app-chrome').getBoundingClientRect();return {w:b.width,h:b.height,top:b.top,bottom:b.bottom,left:b.left,right:b.right,header:header.bottom,hit:el.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)),radii:[s.borderTopLeftRadius,s.borderTopRightRadius,s.borderBottomLeftRadius,s.borderBottomRightRadius],glyph:el.querySelector('svg').getBoundingClientRect().width};});
    assert.equal(geometry.w,48);assert.equal(geometry.h,48);assert.equal(geometry.glyph,20);assert.deepEqual(geometry.radii,['24px','24px','24px','24px']);assert(geometry.top>=geometry.header+8&&geometry.bottom<=height-8&&geometry.left>=8&&geometry.right<=width-8&&geometry.hit);
    await add.click();await frames(page);const grown=await json();assert.equal(table(grown).content.length,axis==='row'?4:3);assert.equal(table(grown).content[0].content.length,axis==='column'?4:3);
    for(let r=0;r<3;r++)for(let c=0;c<3;c++)assert.deepEqual(table(grown).content[r].content[c],table(before).content[r].content[c]);
    await page.keyboard.type('New');assert.equal(await editor.evaluate(el=>el.editor.state.selection.$from.parent.textContent),'New');
    await page.keyboard.press('ControlOrMeta+z');assert.deepEqual(await json(),grown);await page.keyboard.press('ControlOrMeta+z');assert.deepEqual(await json(),before);
   }
   let corner=await show('corner');await corner.focus();await page.keyboard.press('Enter');await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowRight');await frames(page);assert.deepEqual(await json(),before,'keyboard size preview must not save or change text');assert.match(await page.getByRole('status').filter({hasText:/4 × 4/}).textContent(),/4 × 4/);
   await page.keyboard.press('Escape');assert.equal(await page.locator('[data-table-size-guide]').count(),0);assert.deepEqual(await json(),before);
   corner=await show('corner');await corner.focus();await page.keyboard.press('Enter');await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');await frames(page);const grown=await json();assert.equal(table(grown).content.length,4);assert.equal(table(grown).content[0].content.length,4);
   await page.keyboard.press('ControlOrMeta+z');assert.deepEqual(await json(),before);
   corner=await show('corner');await corner.focus();await page.keyboard.press('Enter');await page.keyboard.press('ArrowUp');await page.keyboard.press('ArrowLeft');await frames(page);
   assert.deepEqual(await json(),before);assert.match(await page.getByRole('status').filter({hasText:/удаление ячеек/}).textContent(),/2 × 2/);
   await corner.evaluate(async el=>{await Promise.all(el.getAnimations({subtree:true}).map(animation=>animation.finished.catch(()=>{})));});
   const warning=await corner.evaluate(el=>{const probe=document.createElement('span');probe.style.color='var(--destructive)';document.body.append(probe);const expected=getComputedStyle(probe).color;probe.remove();return {color:getComputedStyle(el).color,expected};});assert.equal(warning.color,warning.expected,'shrinking uses the destructive variant');
   await page.keyboard.press('Enter');assert.equal(table(await json()).content.length,2);assert.equal(table(await json()).content[0].content.length,2);await page.keyboard.press('ControlOrMeta+z');assert.deepEqual(await json(),before,'Undo restores all cropped cells');
   corner=await show('corner');await corner.focus();await page.keyboard.press('Space');await page.keyboard.press('ArrowDown');await page.keyboard.press('Space');await frames(page);assert.equal(table(await json()).content.length,4);await page.keyboard.press('ControlOrMeta+z');assert.deepEqual(await json(),before);
   corner=await show('corner');const b=await corner.boundingBox(),t=await editor.locator('table').boundingBox();await page.mouse.move(b.x+24,b.y+24);await page.mouse.down();await page.mouse.move(b.x+24+t.width/3,b.y+24+t.height/3,{steps:8});await frames(page);assert.deepEqual(await json(),before,'pointer preview keeps source unchanged');await page.locator('[data-table-size-guide="row"]').waitFor();await page.mouse.up();await frames(page);assert.equal(table(await json()).content.length,4);assert.equal(table(await json()).content[0].content.length,4);
   const pointerGrown=await json();await page.keyboard.press('ControlOrMeta+z');assert.deepEqual(await json(),before);await page.keyboard.press('ControlOrMeta+Shift+z');assert.deepEqual(await json(),pointerGrown);
   await editor.press('ControlOrMeta+s');await page.locator('[data-save-status="saved"]').waitFor();const saved=await page.evaluate(()=>window.inlineTest.saved);await page.goto(url(saved));await editor.locator('td').last().waitFor();assert.deepEqual(await json(),pointerGrown);
   await page.screenshot({path:`/tmp/rollapp-table-growth-${width}-${height}.png`});
   await page.goto(url(saved)+'&public=1');const published=page.getByRole('textbox',{name:'Опубликованный текст',exact:true});await published.locator('table').waitFor();assert.equal(await published.locator('tr').count(),4);assert.equal(await published.locator('tr').first().locator('th,td').count(),4);assert.equal(await page.locator('[contenteditable="true"]').count(),0);assert(!(await published.textContent()).includes('<table'));
  }
  assert.deepEqual(errors,[]);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.close();console.log(`PASS table growth ${width}×${height}: ${width>=1024?'edge plus controls, 48px geometry, immediate typing, keyboard/pointer grid growth, cancel, single Undo and exact reload':'no hover controls, no source/save changes'}, real chrome and no API/overflow`);
 }
}


export async function checkTableGrowthGuards(browser,origin){
 for(const [width,height] of [[1024,400],[1440,400]]){
  const page=await browser.newPage({viewport:{width,height}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));await page.route('**/api/**',route=>{errors.push('Unexpected API request');return route.abort();});
  for(const mode of ['escape','document-change','access','blur','capture-loss']){
   await page.goto(`${origin}/__text-edit?access=1&source=${encodeURIComponent(source)}`);
   const editor=page.getByRole('textbox',{name:'О себе',exact:true});await editor.locator('td').last().waitFor();await page.evaluate(()=>document.fonts.ready);
   const before=await editor.evaluate(el=>el.editor.getJSON());let expected=before;
   const table=await editor.locator('table').boundingBox(),wrapper=await editor.locator('.tableWrapper').boundingBox();
   await page.mouse.move(wrapper.x+wrapper.width-2,table.y+table.height-2);await frames(page);
   const corner=page.locator('[data-table-growth="corner"]');await corner.waitFor();const b=await corner.boundingBox();
   await page.evaluate(()=>document.addEventListener('pointerdown',event=>{window.growthPointer=event.pointerId;},{once:true,capture:true}));
   await page.mouse.move(b.x+24,b.y+24);await page.mouse.down();await page.mouse.move(b.x+24+table.width/3,b.y+24+table.height/3,{steps:6});
   const guide=page.locator('[data-table-size-guide="row"]');await guide.waitFor();
   if(mode==='escape')await page.keyboard.press('Escape');
   if(mode==='document-change')expected=await editor.evaluate(el=>{el.editor.view.dispatch(el.editor.state.tr.insertText('External ',1).setMeta('preventUpdate',true));return el.editor.getJSON();});
   if(mode==='access')await page.getByRole('button',{name:'Только чтение',exact:true}).evaluate(el=>el.click());
   if(mode==='blur')await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
   if(mode==='capture-loss'){await corner.evaluate(el=>el.releasePointerCapture(window.growthPointer));await page.mouse.move(b.x+25+table.width/3,b.y+24+table.height/3);}
   await guide.waitFor({state:'hidden'});await page.mouse.up();await frames(page);
   assert.deepEqual(await editor.evaluate(el=>el.editor.getJSON()),expected,mode);assert.equal(await page.evaluate(()=>window.inlineTest.saves.length),0,mode);
  }
  assert.deepEqual(errors,[]);await page.close();console.log(`PASS table growth guards ${width}×${height}: held pointer Escape, changed document/access, window blur and native capture loss cancel without mutation/save/API`);
 }
}
