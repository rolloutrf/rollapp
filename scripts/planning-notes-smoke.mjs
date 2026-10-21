import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import {browserLaunchOptions} from './browser-runtime.mjs';
import {listenSmokeServer,smokePort,smokeOrigin} from './smoke-server.mjs';
import {smokeBaseUiDependencies} from './smoke-dependencies.mjs';
const server=await createServer({cacheDir:'node_modules/.vite-notes-smoke',optimizeDeps:{include:smokeBaseUiDependencies},server:{host:'127.0.0.1',port:smokePort(),strictPort:true,hmr:false,watch:null},plugins:[{
 name:'notes-fixture',enforce:'pre',transform(source,id){if(id.endsWith('/src/App.jsx?notes-smoke'))return source+'\nexport {GlobalAppChrome,PlanningFab,SessionContext,ToastContext,CollectionNavigationContext};';},
 configureServer(vite){vite.middlewares.use(async(req,res,next)=>{if(!req.url.startsWith('/app/'))return next();res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml(req.url,'<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/planning-notes.jsx"></script></body></html>'));});}
}]});
await listenSmokeServer(server);const origin=smokeOrigin(server),browser=await chromium.launch(browserLaunchOptions());
const sizes=[[320,740],[390,844],[768,1024],[820,414],[1024,768],[1440,900],[1920,1080],[390,400]];
try{for(const [width,height] of sizes){
 const page=await browser.newPage({viewport:{width,height}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));await page.route('**/api/**',route=>{errors.push('Unexpected API');return route.abort();});
 await page.goto(`${origin}/app/planning?tab=notes`);
 await page.getByRole('heading',{name:'Заметки',exact:true}).waitFor();
 await page.getByRole('link',{name:'Мысли и идеи',exact:true}).waitFor();
 await page.getByRole('button',{name:'Открыть планирование',exact:true}).click();
 await page.locator('.planning-fab__panel').getByRole('link',{name:'Заметки',exact:true}).waitFor();
 await page.locator('.planning-fab__panel').evaluate(async el=>{await Promise.all(el.getAnimations({subtree:true}).map(animation=>animation.finished.catch(()=>{})));});
 const menuBox=await page.locator('.planning-fab__panel').boundingBox();assert(menuBox.x>=0&&menuBox.y>=0&&menuBox.x+menuBox.width<=width+1&&menuBox.y+menuBox.height<=height+1,`planning menu clipped ${width}x${height}`);
 assert.equal(await page.locator('.planning-fab__panel a').count(),4);
 await page.keyboard.press('Escape');
 await page.getByRole('link',{name:'Мысли и идеи',exact:true}).click();
 const editor=page.getByRole('textbox',{name:'Текст заметки',exact:true}),title=page.getByRole('textbox',{name:'Название заметки',exact:true});
 await editor.waitFor();await editor.locator('p').first().click();await page.keyboard.press('Home');await page.keyboard.type('Test note ');
 const rhythm=await page.locator('.planning-notes__document').evaluate(el=>({gap:el.getBoundingClientRect().top-el.previousElementSibling.getBoundingClientRect().bottom,headingMargin:getComputedStyle(el.querySelector('h1')).marginBlockStart}));assert.equal(rhythm.gap,24);assert.equal(rhythm.headingMargin,'0px');
 const frame=await editor.evaluate(el=>{const s=getComputedStyle(el);return [s.borderTopWidth,s.borderRightWidth,s.borderBottomWidth,s.borderLeftWidth,s.outlineStyle,s.boxShadow];});assert.deepEqual(frame,['0px','0px','0px','0px','none','none']);
 await page.waitForFunction(()=>window.notesTest.saves.some(value=>value.content.includes('Test note')));
 await title.fill('Название заметки');await title.press('Enter');
 await page.waitForFunction(()=>window.notesTest.saves.at(-1)?.title==='Название заметки');
 await page.getByRole('link',{name:'К списку заметок',exact:true}).first().click();
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
 const controls=await page.locator('.planning-notes [data-control-bar] button,.planning-notes [data-control-bar] a').evaluateAll(nodes=>nodes.map(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return{width:r.width,height:r.height,radius:s.borderTopLeftRadius};}));
 for(const control of controls){assert.equal(control.width,48);assert.equal(control.height,48);assert.equal(control.radius,'24px');}
 if(width===390&&height===844||width===1440)await page.screenshot({path:`/tmp/rollapp-notes-${width}.png`,fullPage:true});
 await page.getByRole('button',{name:'Удалить заметку',exact:true}).click();await page.getByRole('button',{name:'Удалить',exact:true}).click();await page.getByRole('heading',{name:'Заметки',exact:true}).waitFor();assert.deepEqual(await page.evaluate(()=>window.notesTest.deleted),['first']);
 if(width===1440){
  await page.evaluate(()=>{window.notesTest.delayCreate=true;});await page.getByRole('button',{name:'Создать заметку',exact:true}).click();await page.waitForFunction(()=>Boolean(window.notesTest.finishCreate));
  await page.getByRole('link',{name:'Другая заметка',exact:true}).click();await editor.waitFor();
  await page.goBack();await page.getByRole('heading',{name:'Заметки',exact:true}).waitFor();
  await page.evaluate(()=>window.notesTest.finishCreate());await page.waitForFunction(()=>window.notesTest.createdDone);
  assert.equal(new URL(page.url()).searchParams.get('note'),null,'Late creation must not override browser Back even after returning to its original history key');
  await page.getByRole('link',{name:'Другая заметка',exact:true}).click();await editor.waitFor();assert.equal(await title.innerText(),'Другая заметка');
  await page.evaluate(()=>{window.notesTest.delayDelete=true;window.notesTest.deletedDone=false;});
  await page.getByRole('button',{name:'Удалить заметку',exact:true}).click();await page.getByRole('button',{name:'Удалить',exact:true}).click();await page.waitForFunction(()=>Boolean(window.notesTest.finishDelete));
  await page.goBack();await page.getByRole('heading',{name:'Заметки',exact:true}).waitFor();await page.getByRole('link',{name:'Без названия',exact:true}).click();await editor.waitFor();
  await page.evaluate(()=>window.notesTest.finishDelete());await page.waitForFunction(()=>window.notesTest.deletedDone);
  assert.equal(new URL(page.url()).searchParams.get('note'),'created','Late deletion must not navigate away from another note');assert.equal(await title.innerText(),'Без названия');
 }
 await page.goto(`${origin}/app/planning?tab=notes&empty=1`);await page.getByText('Пока нет заметок.',{exact:false}).waitFor();
 await page.getByRole('button',{name:'Создать заметку',exact:true}).click();await editor.waitFor();assert.equal(await title.innerText(),'Без названия');
 await page.goto(`${origin}/app/planning?tab=notes&error=1`);await page.getByRole('button',{name:'Повторить',exact:true}).waitFor();assert.equal(await page.locator('.ProseMirror').count(),0);await page.evaluate(()=>{window.notesTest.loadFail=false;});await page.getByRole('button',{name:'Повторить',exact:true}).click();await page.getByRole('link',{name:'Мысли и идеи',exact:true}).waitFor();
 assert.deepEqual(errors,[]);console.log(`PASS notes ${width}x${height}: navigation, edit/title/save/reopen/retry, delete/cancel, empty/create/error, scroll, controls`);await page.close();
}}finally{await browser.close();await server.close();}
