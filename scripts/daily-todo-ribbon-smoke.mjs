import { listenSmokeServer, smokePort, smokeOrigin } from "./smoke-server.mjs";
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { browserLaunchOptions } from './browser-runtime.mjs';
const server=await createServer({cacheDir:'node_modules/.vite-todo-ribbon',server:{host:'127.0.0.1',port: smokePort(),strictPort: true,hmr:false,watch:null},plugins:[{name:'todo-ribbon-fixture',transform(source,id){if(id.includes('planning-space.jsx?drawer-smoke-export=TaskEditor'))return `${source}\nexport { TaskEditor };`;},configureServer(vite){vite.middlewares.use(async(req,res,next)=>{
 if(!req.url.startsWith('/__todo-ribbon'))return next();
 res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml(req.url,'<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/daily-todo-ribbon.jsx"></script></body></html>'));
});}}]});
await listenSmokeServer(server);
const origin = smokeOrigin(server);
const browser=await chromium.launch(browserLaunchOptions());
try{
 {
  const page=await browser.newPage({viewport:{width:1440,height:400}});
  await page.route('**/api/**',route=>route.abort());
  await page.goto(`${origin}/__todo-ribbon?date=2026-10-18&empty`);
  const field=page.getByRole('textbox',{name:'Новая задача на этот день',exact:true});
  await field.fill('Однократная отправка');
  await page.evaluate(()=>{
   const form=document.querySelector('.daily-todo__composer');
   window.todoNativeSubmits=0;
   form.addEventListener('submit',()=>window.todoNativeSubmits++);
   form.requestSubmit(); form.requestSubmit();
  });
  await page.waitForFunction(()=>document.querySelector('.daily-todo__composer textarea').value==='');
  const result=await page.evaluate(()=>({events:window.todoNativeSubmits,calls:window.todoSaveCalls}));
  assert.equal(result.events,2,'The browser must dispatch both real native submit events');
  assert.equal(result.calls.length,1,`A pending/settling composer must save once: ${JSON.stringify(result)}`);
  assert.equal(result.calls[0].title,'Однократная отправка');
  await page.close();
  console.log('PASS native same-frame submit: two native events, one saved task and one draft reset');
 }
 for(const width of (process.env.TODO_WIDTHS||'320,390,640,767,768,820,1024,1440,1920').split(',').map(Number))for(const height of [844,400]){
  const page=await browser.newPage({viewport:{width,height}}),errors=[];
  // Date-only scenarios must survive midnight and not depend on the day the
  // audit runs. Keep timers/animations moving while fixing Date's wall clock.
  await page.clock.setFixedTime(new Date('2026-10-16T12:00:00+03:00'));
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',r=>{errors.push('Unexpected API request');return r.abort()});
  if([320,390,768,820,1024,1440,1920].includes(width)){
   await page.goto(`${origin}/__todo-ribbon?relatedCards`);
   const card=page.locator('.planning-related__choices .planning-related__choice');
   await card.waitFor();await page.evaluate(()=>document.fonts.ready);
   await page.locator('img').first().evaluate(img=>img.decode());
   assert.equal(await card.locator('.planning-related__choice-kind').count(),0,'Fallback category is duplicated below the description');
   const media=card.locator('.planning-related__choice-media');
   assert.equal(await media.evaluate(el=>getComputedStyle(el).outlineStyle),'none','Selected media has a second external outline');
   assert.equal(await media.evaluate(el=>getComputedStyle(el).borderTopWidth),'2px','Selected media lost its single contour');
   const previews=page.locator('.daily-todo__composer-related');
   const snippets=previews.locator('.planning-related__choice');
   assert.equal(await snippets.count(),12);
   assert.equal(await snippets.locator('.planning-related__choice-body').count(),0,'Previews show text instead of images only');
   const geometry=await previews.evaluate(el=>{
    const r=el.getBoundingClientRect();const style=getComputedStyle(el);
    return {left:r.left,right:r.right,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth,wrap:style.flexWrap,overflowX:style.overflowX,overflowY:style.overflowY,items:[...el.querySelectorAll('.planning-related__choice')].map(card=>{const b=card.getBoundingClientRect(),a=card.querySelector('.planning-related__choice-action').getBoundingClientRect(),icon=card.querySelector('.planning-related__choice-action svg').getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width,height:b.height,action:{left:a.left,right:a.right,top:a.top,bottom:a.bottom},iconWidth:icon.width,iconHeight:icon.height};})};
   });
   assert.equal(geometry.wrap,'wrap');assert.equal(geometry.overflowX,'visible');assert.equal(geometry.overflowY,'visible');
   assert(geometry.scrollWidth<=geometry.clientWidth+1,'Previews create a horizontal scroller');
   assert(new Set(geometry.items.map(item=>item.top)).size>1,'Previews do not wrap into several rows');
   for(const item of geometry.items){
    assert.equal(item.width,48);assert.equal(item.height,48);assert.equal(item.iconWidth,20);assert.equal(item.iconHeight,20);
    assert(item.left>=geometry.left&&item.right<=geometry.right,'Preview escapes the wrapping parent');
    assert(item.action.left>=item.left&&item.action.right<=item.right&&item.action.top>=item.top&&item.action.bottom<=item.bottom,'Remove glyph is not on the image');
   }
   assert(await snippets.last().locator('.planning-related__choice-fallback').isVisible(),'Missing-image preview lost its fallback');
   await snippets.first().locator('.planning-related__choice-action').click();assert.equal(await snippets.count(),11,'Overlay cross did not remove just its preview');
   await card.click();assert.equal(await card.getAttribute('aria-pressed'),'false');await card.click();assert.equal(await card.getAttribute('aria-pressed'),'true');
   await page.screenshot({path:`/tmp/rollapp-related-cards-${width}-${height}.png`,clip:{x:0,y:0,width,height:Math.min(height,460)}});
   console.log(`PASS ${width}x${height} related cards: single contour, image-only previews, overlay removal, wrapping without scroll`);
  }
  for(const empty of [false,true]){
   await page.goto(`${origin}/__todo-ribbon?date=2026-10-17${empty?'&empty':''}`);
   const ribbon=page.locator('.daily-todo__header'),selected=page.locator('.daily-todo__day[aria-pressed="true"]');
   await page.getByRole('button',{name:'Добавить задачу',exact:true}).waitFor();await page.evaluate(()=>document.fonts.ready);
   if(!empty){
    for(const [number,time] of [[1,'10:00'],[2,'10:30']]){
     const row=page.getByRole('button',{name:`Редактировать задачу: Задача ${number}`,exact:true});
     assert.equal(await row.locator('.daily-todo__time').textContent(),time,'Date-only tasks must receive consecutive display slots from 10:00');
    }
    assert.equal(await page.locator('.daily-todo__item').count(),30,'A full day must not hide overflow tasks');
    for(const number of [29,30])assert.equal(await page.getByRole('button',{name:`Редактировать задачу: Задача ${number}`,exact:true}).locator('.daily-todo__time').count(),0,'Tasks without a free slot must remain visible and unscheduled');
    assert.equal(JSON.parse(await page.locator('[data-saved-task]').textContent()),null,'Rendering display slots must not save task data');
   }
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
     const relatedApi=route=>{const url=new URL(route.request().url()),path=url.pathname;const payload={
      '/api/dashboard':{wishes:[{id:'wish-1',title:'Книга',description:'Роман о путешествии',price:30000,currency:'RUB',imageUrl:'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="8" height="8"%3E%3Crect width="8" height="8" fill="red"/%3E%3C/svg%3E'}]},
      '/api/health/workouts':{workouts:[{id:'workout-1',title:'Тренировка'}]},
      '/api/health/medications':{medications:[]},
      '/api/health/lab-results':{reports:[]},
      '/api/education/courses':{courses:[{id:'course-1',title:'Курс'}]},
      '/api/education/conferences':{conferences:[]},
      '/api/education/coaching-sessions':{sessions:[]},
      '/api/contacts':url.searchParams.get('page')==='2'?{contacts:[{id:'contact-2',name:'Мария'}],hasMore:false}:{contacts:[{id:'contact-1',name:'Анна'}],hasMore:true},
     }[path];return payload?route.fulfill({json:payload}):route.abort();};
     await page.route('**/api/**',relatedApi);
     await screen.locator('button[id$="-related-toggle"]').click();
     await screen.getByText(/30\s?000\s?₽/).waitFor();
     assert(await screen.getByRole('button',{name:/Книга 30/}).locator('img').evaluate(image=>image.complete&&image.naturalWidth>0),'wishlist snippet image loads');
     for(const name of [/Книга 30/,/Тренировка Здоровье · тренировки/,/Курс Образование · курсы/,/Мария Контакты/])await screen.getByRole('button',{name}).click();
     await screen.getByRole('button',{name:'Готово · 4'}).click();
     assert.equal(await screen.locator('.planning-related__selected .planning-related__choice').count(),4,'Selected objects are not displayed as snippet cards');
     assert(await screen.getByRole('button',{name:'Убрать Книга'}).locator('img').evaluate(image=>image.complete&&image.naturalWidth>0),'Selected wishlist image is missing');
     await page.unroute('**/api/**',relatedApi);
    }
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
    if(width===390&&height===844&&!empty)assert.deepEqual(saved.relatedItems.map(({kind,id})=>[kind,id]),[['wishlist','wish-1'],['workout','workout-1'],['course','course-1'],['contact','contact-2']]);
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
    const composer=page.locator('.daily-todo__composer'),field=composer.getByRole('textbox',{name:'Новая задача на этот день',exact:true}),send=composer.getByRole('button',{name:'Добавить задачу',exact:true}),attach=composer.getByRole('button',{name:'Добавить связанные объекты',exact:true});
    assert(await send.isDisabled(),'Empty composer can submit');
    assert.equal(await composer.locator('[data-slot="input-group"]').evaluate(node=>getComputedStyle(node).opacity),'1','Empty send fades the entire composer');
    const group=await composer.locator('[data-slot="input-group"]').boundingBox(),text=await field.boundingBox(),plusBox=await attach.boundingBox(),sendBox=await send.boundingBox();
    assert.equal(plusBox.width,48);assert.equal(plusBox.height,48);assert.equal(sendBox.width,48);assert.equal(sendBox.height,48);
    assert(Math.abs(plusBox.y-sendBox.y)<1&&plusBox.y>=text.y+text.height,'Composer actions are not below the text');
    assert(plusBox.x>group.x&&sendBox.x+sendBox.width<group.x+group.width,'Composer actions escape the shared surface');
    assert.equal(await send.textContent(),'','Composer still shows the old text button');
    if(!empty){
     await field.fill('Черновик с айтемами');
     const thumbnail='data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="80" height="80"%3E%3Crect width="80" height="80" fill="teal"/%3E%3C/svg%3E';
     const choicesRoute=r=>{
      assert.equal(r.request().method(),'GET','Picker must not mutate API data');
      return r.fulfill({json:{contacts:[],hasMore:false,wishes:[{id:'wish-preview',title:'Книга с миниатюрой',description:'Описание книги',imageUrl:thumbnail},{id:'wish-fallback',title:'Без изображения',description:'Второй сниппет'},...Array.from({length:10},(_,i)=>({id:`extra-${i}`,title:`Ещё превью ${i+1}`,imageUrl:thumbnail}))]}});
     };
     await page.route('**/api/**',choicesRoute);
     const picker=page.getByRole('region',{name:'Выбор связанных объектов'});
     await attach.click();await picker.getByText('Книга с миниатюрой',{exact:true}).waitFor();
     await picker.getByRole('button').filter({hasText:'Книга с миниатюрой'}).click();
     await page.getByRole('button',{name:'Назад к задаче',exact:true}).click();
     await picker.waitFor({state:'hidden'});
     assert.equal(await field.inputValue(),'Черновик с айтемами','Cancel lost the composer draft');
     assert.equal(await composer.locator('.planning-related__choice').count(),0,'Back applied an unconfirmed selection');
     await attach.click();await picker.getByText('Книга с миниатюрой',{exact:true}).waitFor();
     await picker.getByRole('button').filter({hasText:'Книга с миниатюрой'}).click();
     await picker.getByRole('button').filter({hasText:'Без изображения'}).click();
     await picker.getByRole('button',{name:'Готово · 2',exact:true}).click();await picker.waitFor({state:'hidden'});
     await composer.getByRole('button',{name:'Убрать Книга с миниатюрой',exact:true}).waitFor();
     assert.equal(await composer.locator('.planning-related__choice').count(),2);
     assert.equal(await field.inputValue(),'Черновик с айтемами','Done lost the composer title');
     assert.equal(await page.locator('[data-saved-task]').textContent(),'null','Done created the task prematurely');
     assert.equal(await composer.locator('img').getAttribute('src'),thumbnail,'Done lost image metadata');
     assert.equal(await composer.locator('.planning-related__choice-body').count(),0,'Composer previews still show titles or descriptions');
     assert.equal(await composer.locator('.planning-related__choice').first().getAttribute('title'),'Книга с миниатюрой','Preview lost its full accessible title');
     const bounds=await composer.evaluate(node=>{const r=node.getBoundingClientRect();return {x:r.x,right:r.right,bottom:r.bottom,children:[...node.querySelectorAll('button,img')].map(el=>{const b=el.getBoundingClientRect();return {left:b.left,right:b.right}})}});
     await page.screenshot({path:`/tmp/rollapp-related-composer-${width}-${height}.png`});
     assert(bounds.x>=0&&bounds.right<=width+1&&bounds.bottom<=height+1,`Composer escaped viewport ${width}x${height}: ${JSON.stringify(bounds)}`);
     const previewLayout=await composer.locator('.daily-todo__composer-related').evaluate(node=>({wrap:getComputedStyle(node).flexWrap,overflowX:getComputedStyle(node).overflowX,scrollWidth:node.scrollWidth,clientWidth:node.clientWidth}));
     assert.equal(previewLayout.wrap,'wrap');assert.equal(previewLayout.overflowX,'visible');assert(previewLayout.scrollWidth<=previewLayout.clientWidth+1,'Actual composer has a horizontal preview scroller');
     assert.equal((await composer.locator('.planning-related__choice').first().boundingBox()).width,48);
     const lastSnippet=await composer.getByRole('button',{name:'Убрать Без изображения',exact:true}).boundingBox();
     assert(lastSnippet.x>=bounds.x-1&&lastSnippet.x+lastSnippet.width<=bounds.right+1,'Preview is outside the composer');
     await page.screenshot({path:`/tmp/rollapp-related-composer-${width}-${height}.png`});
     await attach.click();await picker.getByText('Книга с миниатюрой',{exact:true}).waitFor();
     assert.equal(await picker.getByRole('button').filter({hasText:'Книга с миниатюрой'}).getAttribute('aria-pressed'),'true','Reopen lost selected objects');
     await picker.getByRole('button').filter({hasText:'Книга с миниатюрой'}).click();
     await page.getByRole('button',{name:'Назад к задаче',exact:true}).click();
     await picker.waitFor({state:'hidden'});
     assert.equal(await composer.locator('.planning-related__choice').count(),2,'Cancel changed confirmed snippets');
     await composer.getByRole('button',{name:'Убрать Без изображения',exact:true}).click();
     assert.equal(await composer.locator('.planning-related__choice').count(),1);
     await field.fill('Ошибка сохранения');await field.press('Enter');await page.getByRole('alert').waitFor();
     assert.equal(await composer.locator('.planning-related__choice').count(),1,'Failed save lost snippets');
     await field.fill('Черновик с айтемами');await send.click();
     await page.waitForFunction(()=>document.querySelector('.daily-todo__composer textarea').value==='');
     const payload=JSON.parse(await page.locator('[data-saved-task]').textContent());
     assert.equal(payload.title,'Черновик с айтемами');
     const calls=await page.evaluate(()=>window.todoSaveCalls||[]);
     assert.equal(calls.filter(call=>call.title==='Черновик с айтемами').length,1,`Composer must submit once: ${JSON.stringify(calls)}`);
     assert.deepEqual(payload.relatedItems,[{kind:'wishlist',id:'wish-preview',title:'Книга с миниатюрой'}],`Save must send canonical related references, not thumbnail metadata. Calls: ${JSON.stringify(calls)}`);
     assert.equal(await composer.locator('.planning-related__choice').count(),0,'Successful send retained snippets');
     await attach.click();await picker.getByText('Книга с миниатюрой',{exact:true}).waitFor();
     for(const choice of await picker.locator('.planning-related__choice').all())await choice.click();
     await picker.getByRole('button',{name:'Готово · 12',exact:true}).click();await picker.waitFor({state:'hidden'});
     const wrapped=await composer.locator('.daily-todo__composer-related').evaluate(node=>({overflowX:getComputedStyle(node).overflowX,overflowY:getComputedStyle(node).overflowY,scrollWidth:node.scrollWidth,clientWidth:node.clientWidth,rows:[...new Set([...node.querySelectorAll('button')].map(el=>el.getBoundingClientRect().top))].length}));
     assert.equal(wrapped.overflowX,'visible');assert.equal(wrapped.overflowY,'visible');assert(wrapped.scrollWidth<=wrapped.clientWidth+1);assert(wrapped.rows>1,'Actual composer previews do not wrap');
     const wrappedBox=await composer.boundingBox();assert(wrappedBox.y>=0&&wrappedBox.y+wrappedBox.height<=height,`Wrapping previews hide composer actions: ${JSON.stringify(wrappedBox)}`);
     await page.screenshot({path:`/tmp/rollapp-related-wrapped-${width}-${height}.png`});
     for(let i=0;i<12;i++)await composer.locator('.planning-related__choice').first().click();
     assert.equal(await composer.locator('.planning-related__choice').count(),0);
     await page.unroute('**/api/**',choicesRoute);
    }
    if(width===1440&&height===844&&!empty){
     await field.fill('Ошибка сохранения');await field.press('Enter');await page.getByRole('alert').waitFor();
     assert.equal(await field.inputValue(),'Ошибка сохранения','Failed send lost the composer draft');
     await field.fill('Строка');await field.press('Shift+Enter');await field.press('b');
     assert.equal(await field.inputValue(),'Строка\nb','Shift+Enter does not insert a newline');
     await field.fill('Из нового поля');await field.press('Enter');
     await page.waitForFunction(()=>document.querySelector('.daily-todo__composer textarea').value==='');
     assert.equal(JSON.parse(await page.locator('[data-saved-task]').textContent()).title,'Из нового поля');
     await page.screenshot({path:'/tmp/rollapp-task-composer-1440.png'});
    }

   }
   const overview=page.locator('.daily-todo__overview');
   assert(await overview.isVisible(),'Day overview is missing');
   assert.equal(await page.locator('.daily-todo__empty').count(),empty?1:0,'Empty day state is incorrect');
   const beforeCalendar=new URL(page.url());
   await page.getByRole('button',{name:/^Открыть .* в календаре$/}).click();
   await page.waitForURL(url=>url.searchParams.get('tab')==='calendar'&&url.searchParams.get('view')==='day');
   const calendarUrl=new URL(page.url());
   assert.equal(calendarUrl.searchParams.get('date'),beforeCalendar.searchParams.get('date')||'2026-10-16','Calendar lost the selected date');
   assert.equal(calendarUrl.searchParams.get('space'),beforeCalendar.searchParams.get('space'),'Calendar lost the selected list');
   assert.equal(calendarUrl.searchParams.get('spaceKind'),'todo','Calendar no longer identifies the To Do list');
   await page.locator('.schedule[data-view="day"]').waitFor();
   if(!empty){
    const event=page.locator('.schedule-event').first();
    await event.waitFor();
    const visible=await event.evaluate(el=>{const e=el.getBoundingClientRect(),v=el.closest('[data-slot="scroll-area-viewport"]').getBoundingClientRect();return e.bottom>v.top&&e.top<v.bottom});
    assert(visible,'All-day To Do task is hidden in the calendar day view');
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
