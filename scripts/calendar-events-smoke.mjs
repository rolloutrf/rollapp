import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { browserLaunchOptions } from './browser-runtime.mjs';
const server=await createServer({cacheDir:'node_modules/.vite-calendar-events',server:{host:'127.0.0.1',port:5198,strictPort: false,hmr:false,watch:null},plugins:[{name:'calendar-events-fixture',transform(source,id){if(id.includes('planning-space.jsx?calendar-events-export'))return `${source}\nexport { TaskEditor };`;},configureServer(vite){vite.middlewares.use(async(req,res,next)=>{if(!req.url.startsWith('/__calendar-events'))return next();res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml(req.url,'<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/calendar-events.jsx"></script></body></html>'));});}}]});
await server.listen();
const fixtureOrigin = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser=await chromium.launch(browserLaunchOptions());
try{
 for(const width of (process.env.CALENDAR_WIDTHS||'320,390,768,820,1024,1440,1920').split(',').map(Number))for(const height of [900,400]){
  const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'}),errors=[];
  page.setDefaultNavigationTimeout(90000);
  page.setDefaultTimeout(90000);
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',r=>{errors.push('Unexpected API');return r.abort()});
  console.log('START calendar-events',width,height);
  await page.goto(`${fixtureOrigin}/__calendar-events?date=2026-10-02&view=day`);
  await page.locator('[data-calendar-event="long"]').waitFor();await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:`/tmp/rollapp-events-${width}-${height}.png`});
  const state=async()=>JSON.parse(await page.locator('[data-state]').textContent());
  const writes=async count=>{await page.waitForFunction(n=>JSON.parse(document.querySelector('[data-state]').textContent).writes.length===n,count);await page.locator('.schedule[aria-busy="false"]').waitFor();};
  const close=async()=>{await page.getByRole('button',{name:width<768?'Назад':'Закрыть задачу',exact:true}).click();await page.getByLabel('Название',{exact:true}).waitFor({state:'hidden'});};
  const event=id=>page.locator(`[data-calendar-event="${id}"] .schedule-event`);
  const edit=async id=>{await event(id).click();await page.locator('.schedule-preview[data-open]').getByRole('button',{name:id.startsWith('series')?'Изменить серию':'Изменить',exact:true}).click();await page.getByLabel('Название',{exact:true}).waitFor();};
  for(const id of ['long','short','overlap','untimed','series@2026-10-02']){
   const title=await page.locator(`[data-calendar-event="${id}"] .schedule-event__title`).boundingBox();
   assert(title.width>10&&title.height>=16,`Invisible title: ${id}`);
  }
  const shortBox=await page.locator('[data-calendar-event="short"]').boundingBox();
  assert.equal(shortBox.height,22,'15 minute event is stretched');
  await edit('untimed');
  assert.equal(await page.getByLabel('Начало',{exact:true}).inputValue(),'','Display allocation became a stored appointment');
  assert.equal(await page.getByLabel('Длительность, минут',{exact:true}).inputValue(),'60','Untimed task became 24 hours');
  await page.getByLabel('Название',{exact:true}).fill('Без времени обновлено');
  await page.getByRole('button',{name:'Сохранить',exact:true}).click();await writes(1);
  await page.getByLabel('Название',{exact:true}).waitFor({state:'hidden'});
  assert.equal((await state()).tasks.find(t=>t.id==='untimed').startTime,'');
  await edit('series@2026-10-02');
  assert.equal(await page.getByRole('button',{name:'Дата задачи: 25.09.2026',exact:true}).count(),1,'Editing occurrence changed series origin');
  await close();
  await event('long').click();await page.locator('.schedule-preview[data-open]').getByRole('button',{name:'Дублировать',exact:true}).click();
  assert.equal(await page.getByLabel('Название',{exact:true}).inputValue(),'Встреча с командой — копия');
  await close();assert.equal((await state()).writes.length,1,'Cancel wrote a duplicate');
  await edit('long');await page.getByLabel('Начало',{exact:true}).fill('23:30');
  await page.getByRole('button',{name:'Сохранить',exact:true}).click();
  await page.getByText('Задача должна заканчиваться в пределах выбранного дня',{exact:true}).waitFor();
  assert.equal((await state()).writes.length,1,'Invalid midnight schedule saved');await close();
  await page.getByRole('button',{name:'Новая задача в календаре',exact:true}).click();
  await page.getByLabel('Название',{exact:true}).fill('Новое событие');
  await page.getByLabel('Начало',{exact:true}).fill('16:00');
  await page.getByLabel('Длительность, минут',{exact:true}).fill('45');
  await page.locator('[data-fail]').dispatchEvent('click');
  await page.getByRole('button',{name:'Сохранить',exact:true}).click();
  await page.getByText('Не удалось сохранить событие',{exact:true}).waitFor();
  assert.equal(await page.getByLabel('Название',{exact:true}).inputValue(),'Новое событие','Failure lost draft');
  await page.locator('[data-fail]').dispatchEvent('click');
  await page.getByRole('button',{name:'Сохранить',exact:true}).click();await writes(2);
  await page.getByLabel('Название',{exact:true}).waitFor({state:'hidden'});
  await event('new-5').waitFor();
  await page.getByRole('button',{name:'Изменить длительность: Новое событие',exact:true}).press('ArrowDown');await writes(3);
  assert.equal((await state()).tasks.find(t=>t.id==='new-5').durationMinutes,60);
  await page.getByRole('button',{name:'Отменить',exact:true}).last().press('Enter');await writes(4);
  assert.equal((await state()).tasks.find(t=>t.id==='new-5').durationMinutes,45);
  await edit('new-5');await page.getByRole('button',{name:/^Удалить( задачу)?$/,exact:true}).click();
  await page.getByRole('alertdialog').getByRole('button',{name:'Удалить',exact:true}).click();await writes(5);
  await event('new-5').waitFor({state:'hidden'});
  if(width>=768){
   const handle=page.getByRole('button',{name:'Изменить длительность: Встреча с командой',exact:true});
   await handle.scrollIntoViewIfNeeded();const box=await handle.boundingBox();
   await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
   await page.mouse.move(box.x+box.width/2,box.y+box.height/2+24,{steps:5});
   assert.equal(await handle.evaluate(e=>e.hasPointerCapture(1)),true,'Resize capture lost');
   await page.keyboard.press('Escape');await page.mouse.up();
   assert.equal((await state()).writes.length,5,'Escape saved resize');
   await handle.scrollIntoViewIfNeeded();const nextBox=await handle.boundingBox();
   await page.mouse.move(nextBox.x+nextBox.width/2,nextBox.y+nextBox.height/2);await page.mouse.down();
   await page.mouse.move(nextBox.x+nextBox.width/2,nextBox.y+nextBox.height/2+24,{steps:5});await page.mouse.up();await writes(6);
   assert.equal((await state()).tasks.find(t=>t.id==='long').durationMinutes,150,'Pointer resize did not save');
   const slot=page.getByRole('button',{name:'Добавить задачу 2 октября, 13:00',exact:true});
   await slot.scrollIntoViewIfNeeded();const slotBox=await slot.boundingBox();
   await page.mouse.move(slotBox.x+50,slotBox.y+5);await page.mouse.down();await page.mouse.move(slotBox.x+50,slotBox.y+29,{steps:5});
   await page.keyboard.press('Escape');await page.waitForTimeout(250);await page.mouse.up();
   assert.equal(await page.getByLabel('Название',{exact:true}).count(),0,'Escaped range opened editor');
   assert.equal((await state()).writes.length,6);
   await slot.click();await page.getByLabel('Название',{exact:true}).waitFor();
   assert.equal(await page.getByLabel('Начало',{exact:true}).inputValue(),'13:00');await close();
   const dropSlot=page.getByRole('button',{name:'Добавить задачу 2 октября, 12:30',exact:true});
   await event('short').dragTo(dropSlot,{targetPosition:{x:50,y:1}});await writes(7);
   assert.equal((await state()).tasks.find(t=>t.id==='short').startTime,'12:30','Drag did not move event');
   const rangeSlot=page.getByRole('button',{name:'Добавить задачу 2 октября, 15:00',exact:true});
   await rangeSlot.scrollIntoViewIfNeeded();const rangeBox=await rangeSlot.boundingBox();
   await page.mouse.move(rangeBox.x+50,rangeBox.y+4);await page.mouse.down();
   await page.mouse.move(rangeBox.x+50,rangeBox.y+28,{steps:5});await page.mouse.up();
   await page.getByLabel('Название',{exact:true}).waitFor();
   assert.equal(await page.getByLabel('Начало',{exact:true}).inputValue(),'15:00');
   assert.equal(await page.getByLabel('Длительность, минут',{exact:true}).inputValue(),'30');
   await page.getByLabel('Название',{exact:true}).fill('Выделенный диапазон');
   await page.getByRole('button',{name:'Сохранить',exact:true}).click();await writes(8);
   await event('new-5').waitFor();
   const activeHandle=page.getByRole('button',{name:'Изменить длительность: Встреча с командой',exact:true});
   await activeHandle.scrollIntoViewIfNeeded();await activeHandle.focus();const activeBox=await activeHandle.boundingBox();
   await page.mouse.move(activeBox.x+activeBox.width/2,activeBox.y+activeBox.height/2);await page.mouse.down();
   await page.mouse.move(activeBox.x+activeBox.width/2,activeBox.y+activeBox.height/2+24,{steps:5});
   await page.keyboard.press('ControlOrMeta+ArrowRight');await page.waitForURL(url=>url.searchParams.get('date')==='2026-10-03');
   await page.mouse.up();
   assert.equal((await state()).writes.length,8,'Changing period committed an obsolete gesture');
   assert.equal(await page.getByLabel('Название',{exact:true}).count(),0,'Changing period opened an obsolete range');
   await page.getByRole('button',{name:'Предыдущий период',exact:true}).click();await event('long').waitFor();


  }
  if(width<768){
   const handle=page.getByRole('button',{name:'Изменить длительность: Встреча с командой',exact:true});
   await handle.scrollIntoViewIfNeeded();const box=await handle.boundingBox();
   const touch=await page.context().newCDPSession(page);
   const x=box.x+box.width/2,y=box.y+box.height/2;
   await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
   await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+24}]});
   await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await writes(6);
   assert.equal((await state()).tasks.find(t=>t.id==='long').durationMinutes,150,'Touch resize did not save');
   await touch.detach();
  }
  for(const [name,selector] of [['Неделя','.schedule-timegrid--week'],['Месяц','.schedule-month__grid'],['Год','.schedule-year']]){
   await page.getByRole('tab',{name,exact:true}).click();await page.locator(selector).waitFor();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Root overflow: ${name}`);
   await page.screenshot({path:`/tmp/rollapp-events-${name}-${width}-${height}.png`});
  }
  assert.deepEqual(errors,[]);
  console.log('PASS calendar-events',width,height);
  await page.close();
 }
}finally{await browser.close();await server.close();}
