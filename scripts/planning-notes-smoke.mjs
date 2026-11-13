import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import {browserLaunchOptions} from './browser-runtime.mjs';
import {listenSmokeServer,smokePort,smokeOrigin} from './smoke-server.mjs';
import {smokeBaseUiDependencies} from './smoke-dependencies.mjs';
const server=await createServer({cacheDir:'node_modules/.vite-notes-smoke',optimizeDeps:{include:smokeBaseUiDependencies},server:{host:'127.0.0.1',port:smokePort(),strictPort:true,hmr:false,watch:null},plugins:[{
 name:'notes-fixture',enforce:'pre',transform(source,id){if(id.endsWith('/src/App.jsx?notes-smoke'))return source+'\nexport {AppShell,GlobalAppChrome,PlanningFab,SessionContext,ToastContext,CollectionNavigationContext};';},
 configureServer(vite){vite.middlewares.use(async(req,res,next)=>{if(!req.url.startsWith('/app/'))return next();res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml(req.url,'<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/planning-notes.jsx"></script></body></html>'));});}
}]});
await listenSmokeServer(server);const origin=smokeOrigin(server),browser=await chromium.launch(browserLaunchOptions());
const sizes=[[320,740],[390,844],[768,1024],[820,414],[1024,768],[1440,900],[1920,1080],[390,400]];

async function checkGroups(browser, origin, width, height, errors) {
 const touch = width < 768;
 const page = await browser.newPage({viewport:{width,height}, hasTouch:touch, isMobile:touch});
 page.setDefaultTimeout(60_000);
 page.setDefaultNavigationTimeout(60_000);
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/**',route=>{errors.push('Unexpected API');return route.abort();});
 try {
  await page.goto(`${origin}/app/planning?tab=notes&grouping=1`,{waitUntil:'domcontentloaded'});
  const note = title => page.getByRole('link',{name:title,exact:true});
  const menu = title => page.getByRole('button',{name:`Действия: ${title}`,exact:true});
  const item = name => page.getByRole('menuitem',{name,exact:true});
  const activate = locator => touch ? locator.tap() : locator.click();
  const order = () => page.locator('.notes-grid .notes-tile').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label')));
  const first = 'Мысли и идеи', second = 'Другая заметка';
  await note(first).waitFor();
  const cdp = touch ? await page.context().newCDPSession(page) : null;
  const finger = (type, point) => cdp.send('Input.dispatchTouchEvent',{type,touchPoints:point ? [point] : []});
  const dragTo = async (target, { source = first, wait = 0, cancel = false, edge = false } = {}) => {
   await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
   await page.locator('.notes-grid').evaluate(async grid => {
    await Promise.all(grid.getAnimations({subtree:true}).map(animation => animation.finished.catch(()=>{})));
   });
   const trigger = touch ? note(source).locator('..').getByRole('button',{name:`Перетащить «${source}»`}) : note(source);
   const from = await trigger.boundingBox(), to = await note(target).boundingBox();
   const start = {x:from.x + from.width/2,y:from.y + from.height/2};
   const end = {x:to.x + to.width*(edge ? .09 : .5),y:to.y + to.height*(edge ? .58 : .54)};
   if (touch) { await finger('touchStart',start); await finger('touchMove',end); }
   else { await page.mouse.move(start.x,start.y); await page.mouse.down(); await page.mouse.move(end.x,end.y); }
   if (wait) {
    await page.locator('.notes-card.is-group-target').waitFor({timeout:5000}).catch(async cause => {
     const state = await page.evaluate(({start,end}) => ({
      startHit:document.elementFromPoint(start.x,start.y)?.outerHTML.slice(0,180),
      endHit:document.elementFromPoint(end.x,end.y)?.outerHTML.slice(0,180),
      dragging:document.querySelector('.notes-card.is-dragging')?.dataset.sortableCardId,
      tiles:[...document.querySelectorAll('.notes-card')].map(card=>[card.dataset.sortableCardId,card.getBoundingClientRect().toJSON()]),
     }),{start,end});
     throw new Error(`Note group target was not highlighted at ${width}×${height}: ${JSON.stringify(state)}`,{cause});
    });
   }
   if (cancel) await page.keyboard.press('Escape');
   if (touch) await finger('touchEnd');
   else await page.mouse.up();
  };
  const initial = await order();
  await dragTo(second,{wait:1,cancel:true});
  assert.deepEqual(await order(),initial);
  assert.equal(await page.evaluate(()=>window.notesTest.layoutWrites),0);
  await dragTo(second,{edge:true});
  await page.waitForFunction(([a,b]) => {
   const ids=[...document.querySelectorAll('.notes-card .notes-tile')].map(node=>node.getAttribute('aria-label'));
   return window.notesTest.layoutWrites===1 && ids.indexOf(a)>ids.indexOf(b);
  },[first,second]);
  await menu(first).focus();
  await page.keyboard.press('Enter');
  await item('Переместить раньше').focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(expected => window.notesTest.layoutWrites===2 &&
   JSON.stringify([...document.querySelectorAll('.notes-grid .notes-tile')].map(node=>node.getAttribute('aria-label')))===JSON.stringify(expected),initial);
  await dragTo(second,{wait:1});
  const group = note('Новая группа');
  await group.waitFor();
  assert.equal(await page.evaluate(()=>window.notesTest.layoutWrites),3);
  assert.match(await group.innerText(),/2 заметки/);
  await page.reload({waitUntil:'domcontentloaded'});
  await group.waitFor();
  await dragTo('Третья заметка',{source:'Новая группа',edge:true});
  await page.waitForFunction(()=>window.notesTest.layoutWrites===1 &&
   document.querySelector('.notes-grid .notes-card:last-child').classList.contains('notes-card--group'));
  await dragTo('Новая группа',{source:'Третья заметка',wait:1});
  await page.waitForFunction(()=>document.querySelector('.notes-card--group').textContent.includes('3 заметки'));
  await menu('Новая группа').focus();
  await page.keyboard.press('Enter');
  await activate(item('Переименовать'));
  const title = 'Заметки семьи — очень длинное название тематической группы';
  await page.getByRole('textbox',{name:'Название группы'}).fill(title);
   await page.getByRole('button',{name:'Сохранить',exact:true}).click();
  await note(title).waitFor();
  const groupBox = await note(title).boundingBox();
  const menuBox = await menu(title).boundingBox();
  assert.equal(menuBox.width,48);
  assert.equal(menuBox.height,48);
  assert(groupBox.x>=0 && groupBox.x+groupBox.width<=width+1);
  const label = note(title).locator('.notes-tile__title');
  assert.equal(await label.getAttribute('title'),title);
  assert(await label.evaluate(node=>node.scrollWidth>node.clientWidth && getComputedStyle(node).textOverflow==='ellipsis'));
  if (width===390 || width===1440) await page.screenshot({path:`/tmp/rollapp-note-groups-${width}x${height}.png`});
  await note(title).click();
  await note(first).click();
  await page.getByRole('textbox',{name:'Название заметки'}).waitFor();
  await page.getByRole('link',{name:'Назад к заметкам',exact:true}).click();
  await note(first).waitFor();
  assert(new URL(page.url()).searchParams.get('noteGroup'));
  await page.evaluate(()=>{window.notesTest.layoutFail=true;});
  await activate(menu(first));
  await activate(item('Убрать из группы'));
  await page.getByRole('alert').filter({hasText:'Не удалось сохранить группы.'}).waitFor();
  assert(await note(first).isVisible());
  await page.evaluate(()=>{window.notesTest.layoutFail=false;});
  await activate(menu(first));
  await activate(item('Убрать из группы'));
  await note(first).waitFor({state:'detached'});
  await page.getByRole('link',{name:'Назад к заметкам',exact:true}).click();
  await activate(menu(first));
  await activate(item(`Добавить в «${title}»`));
  await note(first).waitFor({state:'detached'});
  await activate(menu(title));
  await activate(item('Расформировать'));
  await page.getByRole('button',{name:'Отмена',exact:true}).click();
  assert(await note(title).isVisible());
  await activate(menu(title));
  await activate(item('Расформировать'));
  await page.getByRole('button',{name:'Расформировать',exact:true}).click();
  await note(first).waitFor();
  await note(second).waitFor();
  await note(title).waitFor({state:'detached'});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 } finally { await page.close(); }
}

try{for(const [width,height] of sizes){
 const page=await browser.newPage({viewport:{width,height}}),errors=[];
 page.setDefaultTimeout(60_000);page.setDefaultNavigationTimeout(60_000);
 page.on('pageerror',error=>errors.push(error.message));await page.route('**/api/**',route=>{errors.push('Unexpected API');return route.abort();});
 await page.goto(`${origin}/app/planning?tab=notes`,{waitUntil:"domcontentloaded"});
 await page.getByRole('link',{name:'Мысли и идеи',exact:true}).waitFor();
 await page.evaluate(()=>document.fonts.ready);
 const grid=page.locator('.notes-grid'),noteTiles=grid.getByRole('link'),createTiles=grid.getByRole('button',{name:'Создать заметку'});
 const checkScreenStart=async(content)=>{
  const layout=await content.evaluate(el=>({
   top:el.getBoundingClientRect().top,
   chromeBottom:document.querySelector('.global-app-chrome')?.getBoundingClientRect().bottom ?? 0,
   spacer:Boolean(el.closest('.app-main').querySelector('.app-shell-chrome-spacer')),
  }));
  assert.equal(layout.top,width<768?8:96,`Unexpected top inset: ${JSON.stringify(layout)}`);
  assert(!layout.spacer&&layout.top>=layout.chromeBottom);
 };
 await checkScreenStart(grid);
 assert.equal(await createTiles.count(),1);
 assert.equal(await noteTiles.count(),2);
 assert.deepEqual(await grid.locator('.notes-tile').evaluateAll(tiles=>tiles.map(tile=>tile.getAttribute('aria-label'))),['Создать заметку','Мысли и идеи','Другая заметка']);
 assert.equal(await grid.evaluate(el=>el.parentElement.firstElementChild===el),true,'Library must start with the grid');
 const geometry=await grid.evaluate(el=>{
  const tiles=[...el.children].map(tile=>tile.getBoundingClientRect());
  return {root:document.documentElement.scrollWidth<=innerWidth+1,overflow:el.scrollWidth>el.clientWidth+1||el.scrollHeight>el.clientHeight+1,
   columns:getComputedStyle(el).gridTemplateColumns.split(' ').length,tiles:tiles.every(r=>r.left>=0&&r.right<=innerWidth+1&&r.height>=48&&Math.abs(r.width-tiles[0].width)<1)};
 });
 assert(geometry.root&&!geometry.overflow&&geometry.tiles,`Library overflow ${width}x${height}`);
 assert(width<=640 ? geometry.columns===2 : geometry.columns>=3);
 await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
 await page.screenshot({path:`/tmp/rollapp-notes-library-${width}x${height}.png`,fullPage:true});
 await page.getByRole('button',{name:'Открыть планирование',exact:true}).click();
 await page.locator('.planning-fab__panel').getByRole('link',{name:'Заметки',exact:true}).waitFor();
 await page.locator('.planning-fab__panel').evaluate(async el=>{await Promise.all(el.getAnimations({subtree:true}).map(animation=>animation.finished.catch(()=>{})));});
 const menuBox=await page.locator('.planning-fab__panel').boundingBox();assert(menuBox.x>=0&&menuBox.y>=0&&menuBox.x+menuBox.width<=width+1&&menuBox.y+menuBox.height<=height+1,`planning menu clipped ${width}x${height}`);
 assert.equal(await page.locator('.planning-fab__panel a').count(),4);
 await page.keyboard.press('Escape');
 await page.getByRole('link',{name:'Мысли и идеи',exact:true}).click();
 const editor=page.getByRole('textbox',{name:'Текст заметки',exact:true}),title=page.getByRole('textbox',{name:'Название заметки',exact:true});
 await editor.waitFor();await checkScreenStart(page.locator('.planning-notes__document > header'));
 await editor.locator('p').first().click();await page.keyboard.press('Home');await page.keyboard.type('Test note ');
 const checkTitleRow=async()=>{
  const layout=await page.locator('.planning-notes__document > header').evaluate(row=>{
   const heading=row.querySelector('h1'), titleBox=heading.getBoundingClientRect(), action=row.querySelector('button').getBoundingClientRect();
   return {
    bodyGap:row.nextElementSibling.getBoundingClientRect().top-row.getBoundingClientRect().bottom,
    headingMargin:getComputedStyle(heading).marginBlockStart,
    actionGap:action.left-titleBox.right,
    centerOffset:action.top+action.height/2-(titleBox.top+titleBox.height/2),
    insideRow:action.right<=row.getBoundingClientRect().right+1,
   };
  });
  assert.equal(layout.bodyGap,24);assert.equal(layout.headingMargin,'0px');
  assert(Math.abs(layout.actionGap-8)<1&&Math.abs(layout.centerOffset)<1&&layout.insideRow,JSON.stringify(layout));
 };
 await checkTitleRow();
 const frame=await editor.evaluate(el=>{const s=getComputedStyle(el);return [s.borderTopWidth,s.borderRightWidth,s.borderBottomWidth,s.borderLeftWidth,s.outlineStyle,s.boxShadow];});assert.deepEqual(frame,['0px','0px','0px','0px','none','none']);
 await page.waitForFunction(()=>window.notesTest.saves.some(value=>value.content.includes('Test note')));
 if(width<=390){
  await title.fill('ОченьДлинноеНазваниеБезПробелов'.repeat(4));await checkTitleRow();
 }
 await title.fill('Название заметки');await title.press('Enter');
 await page.waitForFunction(()=>window.notesTest.saves.at(-1)?.title==='Название заметки');
 const back=page.locator('.planning-fab-controls').getByRole('link',{name:'Назад к заметкам',exact:true});
 assert.equal(await page.locator('.planning-notes a[data-control-icon]').count(),0);
 await back.click();
 await grid.waitFor();
 await page.locator('.planning-fab-controls').getByRole('link',{name:'Назад в приложение',exact:true}).waitFor();
 await page.getByRole('link',{name:'Название заметки',exact:true}).click();await editor.waitFor();
 assert((await editor.innerText()).includes('Test note'));
 await page.evaluate(()=>{window.notesTest.fail=true;});
 await editor.locator('p').first().click();await page.keyboard.type(' draft');
 await page.getByRole('button',{name:'Повторить сохранение',exact:true}).waitFor();
 assert((await editor.innerText()).includes('draft'));
 await page.evaluate(()=>{window.notesTest.fail=false;});await page.getByRole('button',{name:'Повторить сохранение',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('[data-save-status]')?.dataset.saveStatus==='saved');
 if(width===1440){
  await page.evaluate(()=>{window.notesTest.delay=true;});await editor.locator('p').first().click();await page.keyboard.type(' slow');
  await page.waitForFunction(()=>window.notesTest.pending.length===1);await title.fill('Очередь сохранений');await title.press('Enter');
  await page.evaluate(()=>{window.notesTest.delay=false;window.notesTest.pending.shift()();});
  await page.waitForFunction(()=>window.notesTest.saves.at(-1)?.title==='Очередь сохранений'&&document.querySelector('[data-save-status]')?.dataset.saveStatus==='saved');
  assert((await editor.innerText()).includes('slow'));assert.equal(await title.innerText(),'Очередь сохранений');
 }
 // The final text and status must remain reachable above fixed navigation.
 await page.evaluate(()=>scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'}));
 const status=await page.locator('[data-save-status]').boundingBox(),dock=await page.locator('.planning-fab-controls').boundingBox();
 assert(status.y+status.height<=dock.y,`status hidden ${width}x${height}: ${JSON.stringify({status,dock})}`);
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`overflow ${width}`);
 await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
 await page.getByRole('button',{name:'Удалить заметку',exact:true}).click();await page.getByRole('button',{name:'Отмена',exact:true}).click();await page.getByRole('alertdialog').waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>window.notesTest.deleted.length),0);
 const controls=await page.locator('.planning-notes [data-control-bar] button,.planning-fab--back').evaluateAll(nodes=>nodes.map(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return{width:r.width,height:r.height,radius:s.borderTopLeftRadius};}));
 assert.equal(controls.length,2);
 for(const control of controls){assert.equal(control.width,48);assert.equal(control.height,48);assert.equal(control.radius,'24px');}
 if(width===390&&height===844||width===1440)await page.screenshot({path:`/tmp/rollapp-notes-${width}.png`,fullPage:true});
 await page.getByRole('button',{name:'Удалить заметку',exact:true}).click();await page.getByRole('button',{name:'Удалить',exact:true}).click();await grid.waitFor();assert.deepEqual(await page.evaluate(()=>window.notesTest.deleted),['first']);
 if(width===1440){
  await page.evaluate(()=>{window.notesTest.delayCreate=true;});await page.getByRole('button',{name:'Создать заметку',exact:true}).click();await page.waitForFunction(()=>Boolean(window.notesTest.finishCreate));
  await page.getByRole('link',{name:'Другая заметка',exact:true}).click();await editor.waitFor();
  await page.goBack();await grid.waitFor();
  await page.evaluate(()=>window.notesTest.finishCreate());await page.waitForFunction(()=>window.notesTest.createdDone);
  assert.equal(new URL(page.url()).searchParams.get('note'),null,'Late creation must not override browser Back even after returning to its original history key');
  await page.getByRole('link',{name:'Другая заметка',exact:true}).click();await editor.waitFor();assert.equal(await title.innerText(),'Другая заметка');
  await page.evaluate(()=>{window.notesTest.delayDelete=true;window.notesTest.deletedDone=false;});
  await page.getByRole('button',{name:'Удалить заметку',exact:true}).click();await page.getByRole('button',{name:'Удалить',exact:true}).click();await page.waitForFunction(()=>Boolean(window.notesTest.finishDelete));
  await page.goBack();await page.getByRole('link',{name:'Без названия',exact:true}).click();await editor.waitFor();
  await page.evaluate(()=>window.notesTest.finishDelete());await page.waitForFunction(()=>window.notesTest.deletedDone);
  assert.equal(new URL(page.url()).searchParams.get('note'),'created','Late deletion must not navigate away from another note');assert.equal(await title.innerText(),'Без названия');
  await page.goto(`${origin}/app/planning?tab=notes&note=missing`,{waitUntil:"domcontentloaded"});
  await page.getByText('Заметка не найдена.',{exact:true}).waitFor();
  assert.equal(await page.locator('.planning-notes a[data-control-icon]').count(),0);
  await back.click();await grid.waitFor();
 }
 await page.goto(`${origin}/app/planning?tab=notes&empty=1`,{waitUntil:"domcontentloaded"});
 await page.getByRole('button',{name:'Создать заметку',exact:true}).click();await editor.waitFor();assert.equal(await title.innerText(),'Без названия');
 assert.equal((await editor.innerText()).trim(),'');
 await page.goto(`${origin}/app/planning?tab=notes&loading=1`,{waitUntil:"domcontentloaded"});
 await page.getByRole('status').filter({hasText:'Загружаем заметки'}).waitFor({state:'attached'});assert(await page.getByRole('button',{name:'Создать заметку',exact:true}).isDisabled());assert.equal(await grid.locator('[data-slot=skeleton]').count(),3);
 await page.evaluate(()=>window.notesTest.finishLoad());await page.getByRole('link',{name:'Мысли и идеи',exact:true}).waitFor();
 await page.goto(`${origin}/app/planning?tab=notes&long=1`,{waitUntil:"domcontentloaded"});await noteTiles.nth(13).waitFor();
 const lastTitle=noteTiles.last().locator('.notes-tile__title');
 assert.equal(await lastTitle.getAttribute('title'),await noteTiles.last().getAttribute('aria-label'));
 assert(await lastTitle.evaluate(el=>el.scrollHeight>el.clientHeight),'Long title should be visibly truncated');
 await page.evaluate(()=>scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'}));
 const lastTile=await noteTiles.last().boundingBox(),bottomDock=await page.locator('.planning-fab-controls').boundingBox();assert(lastTile.y>=0&&lastTile.y+lastTile.height<=bottomDock.y,`Last tile is hidden ${width}x${height}`);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await page.goto(`${origin}/app/planning?tab=notes&error=1`,{waitUntil:"domcontentloaded"});await page.getByRole('button',{name:'Повторить',exact:true}).waitFor();assert.equal(await page.locator('.ProseMirror').count(),0);await page.evaluate(()=>{window.notesTest.loadFail=false;});await page.getByRole('button',{name:'Повторить',exact:true}).click();await page.getByRole('link',{name:'Мысли и идеи',exact:true}).waitFor();
 await page.close();
 await checkGroups(browser,origin,width,height,errors);
 assert.deepEqual(errors,[]);console.log(`PASS notes ${width}x${height}: navigation, edit/title/save/reopen/retry, delete/cancel, empty/create/error, scroll, controls, grouping and reordering`);
}}finally{await browser.close();await server.close();}
