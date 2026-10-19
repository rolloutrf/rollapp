import assert from 'node:assert/strict';
const source='До таблицы\n\n| A | B | C |\n|---|---|---|\n| **D** | E | F |\n| G | H | I |\n\nПосле таблицы';
const frames=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
export async function checkTableHandles(browser,origin){
 const sizes=process.argv.includes('--table-handles-diagnostic')?[[1024,844]]:[[320,844],[390,844],[390,400],[768,844],[820,844],[1024,844],[1440,844],[1440,400],[1920,844]];
 for(const [width,height] of sizes){
  const page=await browser.newPage({viewport:{width,height}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',route=>{errors.push('Unexpected API request');return route.abort();});
  const editor=page.getByRole('textbox',{name:'О себе',exact:true}),json=()=>editor.evaluate(el=>el.editor.getJSON());
  const url=value=>`${origin}/__text-edit?source=${encodeURIComponent(value)}`;
  await page.goto(url(source));await editor.locator('td').last().waitFor();await page.evaluate(()=>document.fonts.ready);
  const initial=await json();
  await editor.locator('td p').filter({hasText:/^E$/}).click();await page.keyboard.press('ControlOrMeta+/');
  const menu=page.getByRole('dialog',{name:'Действия текстового блока',exact:true});await menu.waitFor();
  await menu.getByRole('button',{name:'Переместить строку ниже',exact:true}).click();await menu.waitFor({state:'hidden'});
  assert.deepEqual(await editor.locator('tr').allTextContents(),['ABC','GHI','DEF']);
  assert.equal(await editor.locator('tr').last().locator('strong').textContent(),'D');
  await page.keyboard.press('ControlOrMeta+z');assert.deepEqual(await json(),initial);
  await editor.locator('td p').filter({hasText:/^E$/}).click();await page.keyboard.press('ControlOrMeta+/');await menu.waitFor();
  await menu.getByRole('button',{name:'Переместить столбец влево',exact:true}).click();await menu.waitFor({state:'hidden'});
  assert.deepEqual(await editor.locator('tr').allTextContents(),['BAC','EDF','HGI']);
  await page.keyboard.press('ControlOrMeta+z');assert.deepEqual(await json(),initial);
  if(width>=1024){
   await page.mouse.move(0,0);await editor.locator('td p').filter({hasText:/^E$/}).hover();
   const row=page.getByRole('button',{name:'Действия строки 2',exact:true});await row.waitFor();
   const shape=await row.evaluate(el=>{const b=el.getBoundingClientRect(),s=getComputedStyle(el);return {width:b.width,height:b.height,radii:[s.borderTopLeftRadius,s.borderTopRightRadius,s.borderBottomRightRadius,s.borderBottomLeftRadius],glyph:[el.querySelector('svg').getBoundingClientRect().width,el.querySelector('svg').getBoundingClientRect().height],left:b.left,top:b.top};});
   const generic=page.getByRole('button',{name:'Переместить блок или открыть меню',exact:true});
   if(await generic.isVisible())console.log('AXIS GRIP DIAGNOSTIC',await generic.evaluate(el=>{const ancestors=[];for(let p=el;p;p=p.parentElement){const s=getComputedStyle(p);ancestors.push({tag:p.tagName,classes:p.className,tableHandles:p.getAttribute('data-table-handles'),visibility:s.visibility,display:s.display,inline:p.getAttribute("style"),priority:p.style.getPropertyPriority("visibility")});}const rules=[];const walk=items=>{for(const r of items){if(r.selectorText){try{if(el.matches(r.selectorText)&&(r.style.visibility||r.style.all))rules.push({selector:r.selectorText,visibility:r.style.visibility,all:r.style.all,priority:r.style.getPropertyPriority('visibility')});}catch{}}if(r.cssRules)walk(r.cssRules);}};for(const sheet of document.styleSheets){try{walk(sheet.cssRules);}catch{}}return {ancestors,rules};}));
   assert.equal(await generic.isVisible(),false,'the general block grip must not overlap axis controls');
   assert.equal(shape.width,48);assert.equal(shape.height,48);assert.deepEqual(shape.radii,['24px','24px','24px','24px']);assert.deepEqual(shape.glyph,[20,20]);assert(shape.left>=0&&shape.top>=0);
   if(width===1440)await page.screenshot({path:`/tmp/rollapp-table-axis-handles-${width}-${height}.png`});
   await row.click();const axis=page.getByRole('dialog',{name:'Действия строки',exact:true});await axis.waitFor();
   assert.equal(await menu.count(),0,'one menu, not duplicate table actions');
   await axis.evaluate(async el=>{await Promise.all(el.getAnimations({subtree:true}).map(animation=>animation.finished.catch(()=>{})));});
   assert.equal(await axis.evaluate(el=>getComputedStyle(el).opacity),'1');
   if(width===1440)await page.screenshot({path:`/tmp/rollapp-table-axis-menu-${width}-${height}.png`});
   await axis.getByRole('button',{name:'Переместить строку ниже',exact:true}).click();await axis.waitFor({state:'hidden'});
   assert.deepEqual(await editor.locator('tr').allTextContents(),['ABC','GHI','DEF']);
   await page.keyboard.press('ControlOrMeta+z');assert.deepEqual(await json(),initial);
   // Direct pointer movement uses an axis guide and one transaction.
   await editor.locator('td p').filter({hasText:/^E$/}).hover();await row.waitFor();
   const handle=await row.boundingBox(),last=await editor.locator('tr').last().boundingBox();
   await page.mouse.move(handle.x+24,handle.y+24);await page.mouse.down();await page.mouse.move(handle.x+24,last.y+last.height-2,{steps:10});
   const guide=page.locator('[data-inline-axis-guide]');await guide.waitFor({state:'visible'});
   assert.equal((await guide.boundingBox()).height,2);await page.mouse.up();await frames(page);
   assert.deepEqual(await editor.locator('tr').allTextContents(),['ABC','GHI','DEF']);assert.equal(await guide.count(),0);
   await page.keyboard.press('ControlOrMeta+z');assert.deepEqual(await json(),initial);
   await editor.locator('th p').filter({hasText:/^B$/}).hover();
   const column=page.getByRole('button',{name:'Действия столбца 2',exact:true});await column.waitFor();
   await column.focus();await page.keyboard.press('Enter');const columnMenu=page.getByRole('dialog',{name:'Действия столбца',exact:true});await columnMenu.waitFor();
   await page.keyboard.press('Escape');await columnMenu.waitFor({state:'hidden'});assert.deepEqual(await json(),initial,'keyboard activation after a pointer drag retains the table');
   await page.mouse.move(0,0);await editor.locator('th p').filter({hasText:/^B$/}).hover();await column.waitFor();
   const ch=await column.boundingBox(),first=await editor.locator('th').first().boundingBox();
   await page.mouse.move(ch.x+24,ch.y+24);await page.mouse.down();await page.mouse.move(first.x+2,ch.y+24,{steps:10});
   await guide.waitFor({state:'visible'});assert.equal((await guide.boundingBox()).width,2);await page.mouse.up();await frames(page);
   assert.deepEqual(await editor.locator('tr').allTextContents(),['BAC','EDF','HGI']);assert.equal(await guide.count(),0);
  }else {
   assert.equal(await page.locator('[data-table-axis]').count(),0);
   await editor.locator('td p').filter({hasText:/^E$/}).click();await page.keyboard.press('ControlOrMeta+/');await menu.waitFor();
   await menu.getByRole('button',{name:'Переместить столбец влево',exact:true}).click();await menu.waitFor({state:'hidden'});
  }
  const edited=await json();await editor.press('ControlOrMeta+s');await page.locator('[data-save-status="saved"]').waitFor();
  const saved=await page.evaluate(()=>window.inlineTest.saved);
  assert.notDeepEqual(edited,initial);await page.goto(url(saved));await editor.locator('td').last().waitFor();assert.deepEqual(await json(),edited);
  assert.deepEqual(errors,[]);await page.close();console.log(`PASS table axis controls ${width}×${height}: contextual keyboard row/column moves, rich cell content and Undo${width>=1024?', 48px hover handles, pointer guides, row/column drag and exact reload':''}, no API`);
 }
}


export async function checkTableAxisGuards(browser,origin){
 for(const [width,height] of [[1024,400],[1440,400]]){
  const page=await browser.newPage({viewport:{width,height}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',route=>{errors.push('Unexpected API request');return route.abort();});
  for(const mode of ['escape','document-change','access','blur','capture-loss']){
   await page.goto(`${origin}/__text-edit?access=1&source=${encodeURIComponent(source)}`);
   const editor=page.getByRole('textbox',{name:'О себе',exact:true});await editor.locator('td').last().waitFor();await page.evaluate(()=>document.fonts.ready);
   await editor.locator('td p').filter({hasText:/^E$/}).hover();const row=page.getByRole('button',{name:'Действия строки 2',exact:true});await row.waitFor();
   const before=await editor.evaluate(el=>el.editor.getJSON()),handle=await row.boundingBox(),target=await editor.locator('tr').last().boundingBox();
   await page.evaluate(()=>document.addEventListener('pointerdown',event=>{window.axisPointerId=event.pointerId;},{once:true,capture:true}));
   await page.mouse.move(handle.x+24,handle.y+24);await page.mouse.down();await page.mouse.move(handle.x+24,target.y+target.height-2,{steps:10});
   const guide=page.locator('[data-inline-axis-guide]');await guide.waitFor({state:'visible'});let expected=before;
   if(mode==='escape')await page.keyboard.press('Escape');
   if(mode==='document-change')expected=await editor.evaluate(el=>{el.editor.view.dispatch(el.editor.state.tr.insertText('Внешнее ',1).setMeta('preventUpdate',true));return el.editor.getJSON();});
   if(mode==='blur')await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
   if(mode==='capture-loss'){await row.evaluate(node=>node.releasePointerCapture(window.axisPointerId));await page.mouse.move(handle.x+25,target.y+target.height-2);}
   if(mode==='access')await page.getByRole('button',{name:'Только чтение',exact:true}).evaluate(node=>node.click());
   await guide.waitFor({state:'hidden'}).catch(error=>{error.message+=` (mode=${mode}, width=${width})`;throw error;});await page.mouse.up();await frames(page);
   assert.deepEqual(await editor.evaluate(el=>el.editor.getJSON()),expected,mode);assert.equal(await page.evaluate(()=>window.inlineTest.saves.length),0,mode);
  }
  assert.deepEqual(errors,[]);await page.close();console.log(`PASS table axis drag guards ${width}×${height}: held pointer Escape, changed document/access, synthetic window blur and native capture loss cancel before any table mutation/save/API`);
 }
}
