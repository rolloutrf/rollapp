import { listenSmokeServer, smokeOrigin, smokePort } from "./smoke-server.mjs";
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { browserLaunchOptions } from './browser-runtime.mjs';
const server=await createServer({cacheDir:'node_modules/.vite-todo-ribbon',server:{host:'127.0.0.1',port: smokePort(process.env.TODO_TEST_PORT),strictPort:true,hmr:false,watch:null},plugins:[{name:'todo-ribbon-fixture',transform(source,id){if(id.includes('planning-space.jsx?drawer-smoke-export=TaskEditor'))return `${source}\nexport { TaskEditor };`;},configureServer(vite){vite.middlewares.use(async(req,res,next)=>{
 if(!req.url.startsWith('/__todo-ribbon'))return next();
 res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml(req.url,'<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/daily-todo-ribbon.jsx"></script></body></html>'));
});}}]});
await listenSmokeServer(server);
const origin = smokeOrigin(server);
const browser=await chromium.launch(browserLaunchOptions());
try{
 for(const width of (process.env.TODO_WIDTHS||'320,390,640,767,768,820,1024,1440,1920').split(',').map(Number))for(const height of [844,400]){
  const page=await browser.newPage({viewport:{width,height}}),errors=[];
  // Date-only scenarios must survive midnight and not depend on the day the
  // audit runs. Keep timers/animations moving while fixing Date's wall clock.
  await page.clock.setFixedTime(new Date('2026-10-16T12:00:00+03:00'));
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',r=>{errors.push('Unexpected API request');return r.abort()});
  for(const empty of [false,true]){
   await page.goto(`${origin}/__todo-ribbon?date=2026-10-17${empty?'&empty':''}`);
   const ribbon=page.locator('.daily-todo__header'),selected=page.locator('.daily-todo__day[aria-pressed="true"]');
   await page.getByRole('button',{name:'Добавить задачу',exact:true}).waitFor();await page.evaluate(()=>document.fonts.ready);
   const measure=()=>ribbon.evaluate(el=>{const r=el.getBoundingClientRect(),active=el.querySelector('[aria-pressed="true"]').getBoundingClientRect(),nav=document.querySelector('.planning-fab-controls').getBoundingClientRect();return {top:r.top,bottom:r.bottom,center:(active.left+active.right)/2,navTop:nav.top,position:getComputedStyle(el).position}});
   if(width<768){
    assert.equal(await ribbon.count(),0,'Mobile circular date ribbon is still rendered');
    const dateTrigger=page.getByRole('button',{name:'Выбрать дату: 17.10.2026',exact:true});
    await dateTrigger.click();const datePage=page.locator('[data-mobile-form-page]:visible');await datePage.getByRole('heading',{name:'Выбрать дату',exact:true}).waitFor();await datePage.getByRole('button',{name:'Назад',exact:true}).click();await datePage.waitFor({state:'hidden'});await page.waitForURL(url=>!url.searchParams.has('formScreen'));
    const owner=page.locator('.daily-todo');await owner.evaluate(e=>{e.scrollTop=e.scrollHeight});
    const navTop=await page.locator('.planning-fab-controls').evaluate(e=>e.getBoundingClientRect().top);
    if(!empty){const last=await page.locator('.daily-todo__item').last().boundingBox();assert(last.y+last.height<=navTop-15,'Last task cannot scroll above navigation');}
    await owner.evaluate(e=>{e.scrollTop=0});
    const field=page.getByRole('textbox',{name:'Новая задача на этот день',exact:true}),add=page.getByRole('button',{name:'Добавить задачу',exact:true});
    assert.equal(await field.count(),0,'Mobile field is visible before opening');
    assert(await add.isEnabled(),'Collapsed Add is disabled');
    const trigger=await add.boundingBox();assert(trigger.y>=0&&trigger.y<120,'Add is not at the top');
    const dateBox=await dateTrigger.boundingBox();assert(Math.abs(dateBox.y-trigger.y)<1,'Date and Add are not in one row');
    const previous=page.getByRole('button',{name:'Предыдущий день',exact:true}),next=page.getByRole('button',{name:'Следующий день',exact:true});
    const buttons=[await previous.boundingBox(),dateBox,await next.boundingBox(),trigger];
    assert(buttons.every(b=>Math.abs(b.y-dateBox.y)<1&&b.height===48),'Toolbar controls are not aligned at 48px');
    assert(buttons[0].width===48&&buttons[2].width===48&&buttons[3].width===48,'Toolbar icon controls are not circular');
    const lower=await page.locator('.planning-fab-controls').evaluate(e=>[...e.querySelectorAll('button')].map(b=>{const r=b.getBoundingClientRect();return {width:r.width,height:r.height,y:r.y}}));
    assert(lower.length===3&&lower.every(b=>b.height===dateBox.height),'Lower controls differ from the top controls');
    assert(lower[0].width===48&&lower[2].width===48,'Lower icon controls are not 48px circles');
    assert(lower.every(b=>Math.abs(b.y-lower[0].y)<1),'Lower controls are not aligned');
    for(let i=1;i<buttons.length;i++)assert(buttons[i-1].x+buttons[i-1].width+7<=buttons[i].x,'Toolbar controls overlap');
    assert.equal((await dateTrigger.textContent()).trim(),'17.10, Сб','Date label does not contain the weekday');
    await previous.click();await page.getByRole('button',{name:'Выбрать дату: 16.10.2026',exact:true}).waitFor();
    await next.click();await dateTrigger.waitFor();
    if(!empty){const first=await page.locator('.daily-todo__item').first().boundingBox();assert(trigger.y+trigger.height<first.y,'Add is below the task list');}
    if(width===390&&height===844&&!empty){
     const listSelector=page.getByRole('button',{name:'Выбрать To Do-лист',exact:true});
     await listSelector.click();await page.getByRole('menuitem',{name:'Рабочие дела',exact:true}).click();
     await page.waitForURL(url=>url.searchParams.get('space')==='work');
     await previous.click();await page.getByRole('button',{name:'Выбрать дату: 16.10.2026',exact:true}).waitFor();await next.click();await dateTrigger.waitFor();
     assert.equal(new URL(page.url()).searchParams.get('space'),'work','Day navigation lost selected list');
     assert.equal(new URL(page.url()).searchParams.get('date'),'2026-10-17','List change lost selected date');
     await listSelector.click();await page.getByRole('menuitem',{name:'Создать To Do-лист',exact:true}).click();
     const listPage=page.locator('[data-mobile-form-page]:not([hidden])');await listPage.getByRole('heading',{name:'Новый To Do-лист',exact:true}).waitFor();
     await listPage.getByRole('textbox',{name:'Название',exact:true}).fill('Ошибка');
     await listPage.getByRole('button',{name:'Создать To Do-лист',exact:true}).click();await listPage.getByRole('alert').waitFor();
     await listPage.getByRole('textbox',{name:'Название',exact:true}).fill('  Личные дела  ');
     await listPage.getByRole('button',{name:'Создать To Do-лист',exact:true}).click();await listPage.waitFor({state:'hidden'});
     await page.waitForURL(url=>url.searchParams.get('space')==='new-todo'&&!url.searchParams.has('formScreen'));
     assert((await listSelector.textContent()).includes('Личные дела'),'Created list was not selected');
     assert.equal(new URL(page.url()).searchParams.get('date'),'2026-10-17','Create list lost date');
     await listSelector.click();await page.getByRole('menuitem',{name:'Основной To Do-лист',exact:true}).click();
     await page.waitForURL(url=>!url.searchParams.has('space'));
    }
    const chosenDate=new URL(page.url()).searchParams.get('date');
    const chosenUrl=page.url();
    await add.click();
    const screen=page.locator('[data-mobile-form-page]:not([hidden])');await screen.waitFor();
    await screen.getByRole('heading',{name:'Новая задача',exact:true}).waitFor();
    assert(new URL(page.url()).searchParams.has('formScreen'),'Create did not push a native form history entry');
    assert.equal(await page.locator('[aria-modal="true"]:visible').count(),0,'Mobile create is a modal');
    assert(await page.locator('[data-form-page-background]').evaluate(e=>getComputedStyle(e).display==='none'),'To Do remains visible behind form');
    assert.equal(await screen.getByRole('textbox',{name:'Название',exact:true}).inputValue(),'','New task retained a previous title');
    if(width===390&&height===844&&!empty){
     await screen.getByRole('textbox',{name:'Название',exact:true}).fill('Ошибка сохранения');
     await screen.getByRole('button',{name:'Сохранить',exact:true}).click();
     await screen.getByText('Не удалось сохранить задачу',{exact:true}).waitFor();
     assert.equal(await screen.getByRole('textbox',{name:'Название',exact:true}).inputValue(),'Ошибка сохранения','Save failure discarded draft');
     assert(new URL(page.url()).searchParams.has('formScreen'),'Save failure closed the page');
    }
    await screen.getByRole('textbox',{name:'Название',exact:true}).fill('  Новая задача  ');
    await screen.getByRole('textbox',{name:'Описание',exact:true}).fill('Детали');
    if(width===390&&height===844&&!empty){
     await page.evaluate(()=>{Object.defineProperty(visualViewport,'height',{configurable:true,value:460});Object.defineProperty(visualViewport,'offsetTop',{configurable:true,value:24});visualViewport.dispatchEvent(new Event('resize'));});
     await page.waitForFunction(()=>document.documentElement.hasAttribute('data-overlay-keyboard'));
    }
    const save=screen.getByRole('button',{name:'Сохранить',exact:true});await save.scrollIntoViewIfNeeded();
    const back=screen.getByRole('button',{name:'Назад',exact:true}),backBox=await back.boundingBox();
    assert(backBox.y>0&&backBox.height===48,'Native Back is not visible at the bottom');
    await save.click();await screen.waitFor({state:'hidden'});await page.waitForURL(chosenUrl);
    const saved=JSON.parse(await page.locator('[data-saved-task]').textContent());
    assert.equal(saved.title,'Новая задача');assert.equal(saved.description,'Детали');assert.equal(saved.dueOn,chosenDate);assert.equal(saved.columnId,'todo');assert.equal(saved.completed,false);
    if(width===390&&height===844&&!empty){
     await page.evaluate(()=>{delete visualViewport.height;delete visualViewport.offsetTop;visualViewport.dispatchEvent(new Event('resize'));});
     await page.waitForFunction(()=>!document.documentElement.hasAttribute('data-overlay-keyboard'));
    }
    await add.click();await screen.waitFor();
    assert.equal(await screen.getByRole('textbox',{name:'Название',exact:true}).inputValue(),'','Reopening create retained saved text');
    await screen.getByRole('textbox',{name:'Название',exact:true}).fill('Не сохранять');
    await screen.getByRole('button',{name:'Назад',exact:true}).click();await screen.waitFor({state:'hidden'});await page.waitForURL(chosenUrl);
    assert.equal(JSON.parse(await page.locator('[data-saved-task]').textContent()).title,'Новая задача','Cancel saved data');
    await add.click();await screen.waitFor();await page.waitForURL(url=>url.searchParams.has('formScreen'));await page.goBack();
    try{await screen.waitFor({state:'hidden',timeout:5000});}catch(error){console.log('BACK FAILURE',width,height,empty,await page.evaluate(()=>({url:location.href,state:history.state,forms:[...document.querySelectorAll('[data-mobile-form-page]')].map(e=>({id:e.dataset.mobileFormPage,hidden:e.hidden,text:e.textContent.slice(0,150)}))})));throw error;}
    await page.waitForURL(chosenUrl);
    assert.equal(await field.count(),0,'Inline field returned after closing page');

   }else{
    await selected.waitFor();
    const tiles=await page.locator('.daily-todo__day').evaluateAll(nodes=>nodes.map(node=>{
     const style=getComputedStyle(node),box=node.getBoundingClientRect(),label=node.querySelector('[data-slot="list-tile-label"]'),count=node.querySelector('[data-slot="list-tile-count"]'),l=label.getBoundingClientRect(),c=count.getBoundingClientRect();
     return {width:box.width,height:box.height,radius:style.borderRadius,padding:style.padding,border:style.borderTopWidth,labelTop:l.top-box.top,countTop:c.top-box.top,labelLeft:l.left-box.left,countLeft:c.left-box.left,font:getComputedStyle(count).fontSize,weight:getComputedStyle(count).fontWeight,inControlBar:!!node.closest('[data-control-bar]')};
    }));
    for(const tile of tiles){
     assert.equal(tile.width,130);assert.equal(tile.height,100);assert.equal(tile.radius,'18px');assert.equal(tile.padding,'12px');assert.equal(tile.border,'0px');
     assert.equal(tile.labelLeft,12);assert.equal(tile.countLeft,12);assert(tile.countTop>tile.labelTop+19,'Date number is not below weekday');
     assert.equal(tile.font,'24px');assert.equal(tile.weight,'600');assert.equal(tile.inControlBar,false,'Content tiles override navigation geometry');
    }
    assert.equal(await selected.locator('[data-slot="list-tile-label"]').textContent(),'Сб, октябрь');
    assert.equal(await selected.locator('[data-slot="list-tile-count"]').textContent(),'17');
    if(!empty&&[768,820,1024,1440,1920].includes(width)&&height===844)await page.screenshot({path:`/tmp/rollapp-date-tiles-${width}.png`});
    const m=await measure();assert(Math.abs(m.center-width/2)<1,'Desktop selected date lost its center');assert.notEqual(m.position,'fixed','Desktop ribbon became fixed');
    await selected.press('ArrowRight');await page.waitForURL(url=>url.searchParams.get('date')==='2026-10-18');
   }
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Root horizontal overflow');
   console.log(`PASS ${width}x${height} ${empty?'empty':'tasks'}: dates, scroll, composer`);
  }
  assert.deepEqual(errors,[]);await page.close();
 }
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',r=>{errors.push('Unexpected API request');return r.abort()});
 await page.clock.setFixedTime(new Date('2026-10-17T12:00:00+03:00'));
 await page.goto(`${origin}/__todo-ribbon?date=2026-10-17`);
 await page.getByRole('button',{name:'Предыдущий день',exact:true}).click();
 await page.getByRole('button',{name:'Выбрать дату: 16.10.2026',exact:true}).waitFor();
 await page.getByRole('button',{name:'Следующий день',exact:true}).click();
 await page.getByRole('button',{name:'Выбрать дату: 17.10.2026',exact:true}).waitFor();
 await page.waitForURL(url=>!url.searchParams.has('date'));
 await page.getByRole('button',{name:'Добавить задачу',exact:true}).click();
 const screen=page.locator('[data-mobile-form-page]:not([hidden])');await screen.waitFor();
 await screen.getByRole('textbox',{name:'Название',exact:true}).fill('Задача на сегодня');
 await screen.getByRole('button',{name:'Сохранить',exact:true}).click();await screen.waitFor({state:'hidden'});
 assert.equal(JSON.parse(await page.locator('[data-saved-task]').textContent()).dueOn,'2026-10-17','Omitted today URL lost the task date');
 await page.waitForURL(url=>!url.searchParams.has('date')&&!url.searchParams.has('formScreen'));
 assert.deepEqual(errors,[]);await page.close();
 console.log('PASS today shorthand: omitted date URL preserves the selected day in a new task');
 for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',r=>{errors.push('Unexpected API request');return r.abort()});
  await page.goto(`${origin}/__todo-ribbon?date=2026-10-17&slots`);
  await page.locator('.daily-todo__item').first().waitFor();
  for(const [title,time] of [['Без часа A','12:00'],['Без часа B','12:30'],['Утром','09:00']]){
   const row=page.getByRole('button',{name:`Редактировать задачу: ${title}`,exact:true});
   assert.equal(await row.locator('.daily-todo__time').textContent(),time,`To Do time disagrees with the calendar slot for ${title}`);
  }
  await page.getByRole('button',{name:'Редактировать задачу: Без часа A',exact:true}).click();
  assert.equal(JSON.parse(await page.locator('[data-edited-task]').textContent()).startTime,'','Editing persisted a display-only time');
  const gap=await page.locator('.daily-todo__group').evaluateAll(groups=>groups[1].getBoundingClientRect().top-groups[0].getBoundingClientRect().bottom);
  assert.equal(gap,0,'Completed tasks retain an extra group gap');
  await page.locator('.daily-todo__task').first().hover();
  const background=await page.locator('.daily-todo__task').first().evaluate(node=>getComputedStyle(node).backgroundColor);
  assert(['transparent','rgba(0, 0, 0, 0)'].includes(background),`Task hover has a background: ${background}`);
  if(width<768){
   await page.getByRole('button',{name:'Добавить задачу',exact:true}).click();
   const screen=page.locator('[data-mobile-form-page]:not([hidden])');await screen.waitFor();
   assert.equal(await screen.getByLabel('Начало').inputValue(),'13:00','New mobile task did not take the next free slot');
   assert.equal(await screen.getByLabel('Длительность, минут').inputValue(),'30','New mobile task does not occupy one half-hour slot');
  }else{
   await page.getByRole('textbox',{name:'Новая задача на этот день'}).fill('Следующая');
   await page.locator('.daily-todo__composer').evaluate(form=>form.requestSubmit());
   const saved=JSON.parse(await page.locator('[data-saved-task]').textContent());
   assert.equal(saved.startTime,'13:00','New desktop task did not take the next free slot');
   assert.equal(saved.durationMinutes,30,'New desktop task does not occupy one half-hour slot');
  }
  assert.deepEqual(errors,[]);await page.close();
  console.log(`PASS ${width}x844: no group gap or row hover, consecutive task slots`);
 }
}finally{await browser.close();await server.close();}
