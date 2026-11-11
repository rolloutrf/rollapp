import assert from 'node:assert/strict';
import { smokeBaseUiDependencies } from './smoke-dependencies.mjs';
import { instrumentSmokeBrowser, smokeBrowserDiagnostics } from './smoke-browser-diagnostics.mjs';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { browserLaunchOptions } from './browser-runtime.mjs';
import { listenSmokeServer, smokeOrigin } from './smoke-server.mjs';
const cid='4a0effb1-352d-4bc4-9f1f-6ee126840d01';
const server=await createServer({optimizeDeps:{entries:['scripts/fixtures/messenger.jsx'],include:['react','react-dom','react-dom/client','react/jsx-runtime','react-router-dom','class-variance-authority','clsx','lucide-react','tailwind-merge','qrcode','sonner','zod',...smokeBaseUiDependencies,'date-fns/locale','next-themes','react-day-picker']},cacheDir:process.env.MESSENGER_CACHE_DIR || 'node_modules/.vite-messenger-smoke',server:{host:'127.0.0.1',port:0,hmr:false,watch:null},plugins:[{
  name:'messenger-fixture',enforce:'pre',transform(source,id){if(id.endsWith('/src/App.jsx?messenger-smoke'))return `${source}\nexport { GlobalAppChrome, PlanningFab, MessengerRoute, AssistantRoute, AppShell, SessionContext, ToastContext, CollectionNavigationContext };`;},configureServer(vite){vite.middlewares.use(async(req,res,next)=>{
    if(!req.url.startsWith('/app/'))return next();
    res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml(req.url,'<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/messenger.jsx"></script></body></html>'));
  });},
}]});
await listenSmokeServer(server);const browser=instrumentSmokeBrowser(await chromium.launch(browserLaunchOptions()));
let activePage;
try{
 for(const [width,height] of [[320,844],[390,844],[767,844],[768,844],[820,844],[1024,844],[1440,844],[1920,844],[390,400],[1440,400]]){
  const page=await browser.newPage({viewport:{width,height}});const errors=[];activePage=page;let navigations=0;page.on('request',request=>{if(request.isNavigationRequest() && request.frame()===page.mainFrame())navigations++;});
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/**',route=>{errors.push('Unexpected production API request');return route.abort();});
  await page.route('https://example.invalid/**',route=>{errors.push('Assistant note loaded unconfirmed remote media');return route.abort();});
  await page.goto(`${smokeOrigin(server)}/app/wishes`,{waitUntil:'networkidle'});
  const launcher=await page.getByRole('button',{name:'Открыть сообщения',exact:true}).boundingBox();
  const planning=await page.getByRole('button',{name:'Открыть планирование',exact:true}).boundingBox();
  const assistant=await page.getByRole('button',{name:'Ассистент Rollapp',exact:true}).boundingBox();
  assert.equal(launcher.y-(assistant.y+assistant.height),8,'Assistant must sit exactly 8px above messages');
  assert.equal(assistant.x,launcher.x);assert.equal(assistant.width,48);assert.equal(assistant.height,48);
  assert.equal(planning.y-(launcher.y+launcher.height),8,'Messenger must sit exactly 8px above planning');
  assert.equal(launcher.x,planning.x);assert.equal(launcher.width,48);assert.equal(launcher.height,48);
  await page.getByRole('button',{name:'Открыть сообщения',exact:true}).click();
  const drawer=page.getByRole('dialog',{name:'Сообщения',exact:true});
  await drawer.waitFor();
  await page.getByRole('searchbox',{name:'Найти участника'}).waitFor();
  assert.equal(await drawer.getByText('Ассистент Rollapp',{exact:true}).count(),0);
  const subscriptions=drawer.getByRole('region',{name:'Подписки',exact:true});
  await subscriptions.getByRole('button',{name:/^Контакт 53 /}).waitFor();

  assert.equal(await subscriptions.locator('.messenger-person').count(),53,'All followed contacts without a conversation should be shown');
  assert.equal(await drawer.getByRole('button',{name:/Александра/}).count(),1,'Existing conversations must not duplicate followed contacts');
  await drawer.evaluate(async node => {
    await Promise.allSettled(node.getAnimations().map(animation => animation.finished));
  });
  const bounds=await drawer.boundingBox();
  if(width<768) assert.equal(bounds.width,width);
  else assert.equal(bounds.width,576);
  assert(bounds.x>=0 && bounds.x+bounds.width<=width+1 && bounds.y>=-1 && bounds.y+bounds.height<=height+1,'Drawer escaped viewport');
  if(width===1440 || width===390) await page.screenshot({path:`/tmp/rollapp-messenger-directory-${width}-${height}.png`});
  await subscriptions.getByRole('button',{name:/^Контакт 53 /}).click();
  await drawer.getByText('Здесь начинается ваш разговор.',{exact:true}).waitFor();
  await drawer.getByRole('button',{name:'Все диалоги',exact:true}).click();
  await subscriptions.getByRole('button',{name:/^Контакт 52 /}).waitFor();
  assert.equal(await subscriptions.getByRole('button',{name:/^Контакт 53 /}).count(),0,'A newly opened chat should leave the subscriptions section');
  await page.getByRole('searchbox',{name:'Найти участника'}).fill('none');
  await page.getByText('Участники не найдены',{exact:true}).waitFor();
  await page.getByRole('searchbox').fill('Александра');
  await page.getByRole('button',{name:/Александра/}).click();
  assert.equal(new URL(page.url()).pathname,'/app/wishes','Drawer navigated away from source');
  assert.equal(await page.locator('.messenger-directory').isVisible(),false,'Chat must replace directory');
  await page.locator('.messenger-message').last().waitFor();
  await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.locator('.messenger-message').count(),50);
  const text=page.getByRole('textbox',{name:'Сообщение',exact:true});
  await text.fill('Не терять текст');
  assert.equal(await drawer.getByText(/^\d+\/4000 · Ctrl\/⌘ \+ Enter — отправить$/).isVisible(),true);
  await page.evaluate(()=>{window.messengerTest.failSend=true;});
  await page.getByRole('button',{name:'Отправить сообщение',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'Сеть недоступна'}).waitFor();
  assert.equal(await text.inputValue(),'Не терять текст');
  await page.evaluate(()=>{window.messengerTest.failSend=false;});
  await page.getByRole('button',{name:'Отправить сообщение',exact:true}).click();
  await page.waitForFunction(()=>document.getElementById('messenger-text').value==='');
  assert.equal(await page.locator('.messenger-message p').filter({hasText:/^Не терять текст$/}).count(),1,'Retry duplicated message');
  assert(await page.evaluate(()=>window.messengerTest.sends[0].clientId===window.messengerTest.sends[1].clientId));
  await page.locator('.messenger-history').evaluate(node=>{node.scrollTop=0;});
  await page.getByRole('button',{name:'Предыдущие сообщения',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.messenger-message').length===76);
  await page.getByText('Сообщение 1\nВторая строка',{exact:true}).waitFor();
  await text.fill('Черновик');
  await page.getByRole('button',{name:'Все диалоги',exact:true}).click();
  await page.getByRole('button',{name:/Александра/}).click();
  assert.equal(await text.inputValue(),'Черновик','Navigation lost draft');
  await text.fill('<script>alert(1)</script>\nВторая строка');
  await page.waitForFunction(()=>!document.querySelector('button[type="submit"]').disabled);
  await text.press('Control+Enter');
  await page.locator('.messenger-message p').filter({hasText:'<script>alert(1)</script>'}).waitFor();
  await page.waitForFunction(()=>document.getElementById('messenger-text').value==='');
  assert(await text.evaluate(node=>document.activeElement===node),'Keyboard send lost composer focus');
  await text.fill('Отправка при переходе');
  await page.evaluate(()=>{window.messengerTest.sendDelay=700;});
  await page.getByRole('button',{name:'Отправить сообщение',exact:true}).click();
  await page.getByRole('button',{name:'Все диалоги',exact:true}).click();
  await page.getByRole('button',{name:/Александра/}).click();
  await page.waitForFunction(()=>window.messengerTest.delivered.some(item=>item.body==='Отправка при переходе'));
  await page.evaluate(()=>{window.messengerTest.sendDelay=100;});
  await page.getByRole('button',{name:'Отправить сообщение',exact:true}).click();
  await page.waitForFunction(()=>document.getElementById('messenger-text').value==='');
  assert(await page.evaluate(()=>window.messengerTest.sends.at(-1).clientId===window.messengerTest.sends.at(-2).clientId),'Offscreen send lost its idempotency key');
  assert.equal(await page.locator('.messenger-message p').filter({hasText:'Отправка при переходе'}).count(),1);
  const geometry=await page.evaluate(()=>{
    const textarea=document.querySelector('textarea'),button=document.querySelector('button[type="submit"]'),b=button.getBoundingClientRect(),s=getComputedStyle(button),t=getComputedStyle(textarea);
    return {overflow:document.documentElement.scrollWidth>innerWidth,w:b.width,h:b.height,bottom:b.bottom,top:b.top,r:s.borderTopLeftRadius,font:t.fontSize,line:t.lineHeight,icon:button.querySelector('svg').getBoundingClientRect().width};
  });
  assert.equal(geometry.overflow,false);assert.equal(geometry.w,48);assert.equal(geometry.h,48);assert.equal(geometry.r,'24px');assert.equal(geometry.icon,20);assert.equal(geometry.font,'18px');assert.equal(geometry.line,'28px');assert(geometry.bottom<=height && geometry.top>=0);
  await page.screenshot({path:`/tmp/rollapp-messenger-${width}-${height}.png`});
  await page.getByRole('button',{name:'Все диалоги',exact:true}).click();
  await page.evaluate(()=>{window.messengerTest.failHistory=true;});
  await page.getByRole('button',{name:/Александра/}).click();
  await page.getByRole('alert').filter({hasText:'История недоступна'}).waitFor();
  await page.evaluate(()=>{window.messengerTest.failHistory=false;});
  await page.getByRole('button',{name:'Повторить',exact:true}).click();
  await page.locator('.messenger-message').last().waitFor();
  assert.equal(await page.getByRole('alert').count(),0);
  if(width===390 && height===400){
    await page.evaluate(()=>{document.documentElement.style.setProperty('--app-visual-height','260px');document.documentElement.style.setProperty('--app-visual-top','50px');document.documentElement.style.setProperty('--app-visual-bottom','90px');document.documentElement.setAttribute('data-overlay-keyboard','');});
    const compact=await page.getByRole('button',{name:'Отправить сообщение',exact:true}).boundingBox();
    assert(compact.y>=50 && compact.y+compact.height<=310,'Composer escaped panned viewport');
    await page.evaluate(()=>{document.documentElement.style.removeProperty('--app-visual-height');document.documentElement.style.removeProperty('--app-visual-top');document.documentElement.style.removeProperty('--app-visual-bottom');document.documentElement.removeAttribute('data-overlay-keyboard');});
  }
  {
    await page.getByRole('button',{name:'Закрыть сообщения',exact:true}).click();
    await drawer.waitFor({state:'hidden'});
    const trigger=page.getByRole('button',{name:'Открыть сообщения',exact:true});
    await page.evaluate(()=>{window.messengerTest.failSubscriptions=true;});
    await trigger.click();
    await page.getByRole('searchbox').waitFor();
    await drawer.getByRole('alert').filter({hasText:'Подписки недоступны'}).waitFor();
    await page.evaluate(()=>{window.messengerTest.failSubscriptions=false;});
    await drawer.getByRole('button',{name:'Повторить',exact:true}).click();
    await subscriptions.getByRole('button',{name:/^Контакт 52 /}).waitFor();
    assert.equal(await page.locator('.messenger-directory').isVisible(),true);
    await page.keyboard.press('Escape');
    await drawer.waitFor({state:'hidden'});
    assert(await trigger.evaluate(node=>node===document.activeElement),'Escape did not restore trigger focus');
    await trigger.click();
    await page.mouse.click(8,8);
    await drawer.waitFor({state:'hidden'});
    assert.equal(new URL(page.url()).pathname,'/app/wishes');
  }
  assert.equal(navigations,1,'Fixture document reloaded during the interaction');
  await checkAssistant(page, drawer, bounds, width, height);
  assert.equal(navigations,1,'Assistant actions must use in-app navigation');
  if((width===1440 || width===390) && height===844){
    await page.goto(`${smokeOrigin(server)}/app/messenger/${cid}`,{waitUntil:'networkidle'});
    await drawer.locator('.messenger-message').last().waitFor();
    assert.equal(new URL(page.url()).pathname,'/app/wishes','Deep link must open drawer on source page');
  }
  if(width===1440 && height===844){
    await page.goto(`${smokeOrigin(server)}/app/assistant`);
    const direct=page.getByRole('dialog',{name:'Ассистент Rollapp',exact:true});
    await direct.getByRole('textbox',{name:'Сообщение'}).waitFor();
    assert.equal(new URL(page.url()).pathname,'/app/wishes');
    await checkAssistantAccountSwitch(page, direct);
    await direct.getByRole('button',{name:'Закрыть ассистента',exact:true}).click();
    await direct.waitFor({state:'hidden'});
  }
  assert.equal(await page.evaluate(()=>window.messengerTest.assistant.every(request=>request.includePlanning===true)),true);
  assert.deepEqual(errors,[]);console.log(`PASS messenger ${width}x${height}: search, chat, history, retry/idempotency, draft, plain text, error/retry, controls, overflow`);await page.close();
 }
}catch(error){
  if(activePage) {
    console.error(JSON.stringify(smokeBrowserDiagnostics(activePage)));
    console.error(await activePage.locator('body').ariaSnapshot().catch(()=>activePage.url()));
    await activePage.screenshot({path:'/tmp/rollapp-messenger-failure.png'}).catch(()=>{});
  }
  throw error;
}finally{await browser.close();await server.close();}

async function checkAssistant(page, drawer, contactBounds, width, height) {
  const trigger=page.getByRole('button',{name:'Открыть сообщения',exact:true});
  const entry=page.getByRole('button',{name:'Ассистент Rollapp',exact:true});
  const chat=page.getByRole('dialog',{name:'Ассистент Rollapp',exact:true});
  const heading=chat.getByRole('heading',{name:'Ассистент Rollapp',exact:true});
  const close=chat.getByRole('button',{name:'Закрыть ассистента',exact:true});
  const openAssistant=async()=>{
    await entry.click();
    await chat.waitFor();
    await settlePopup(chat);
  };
  const text=chat.getByRole('textbox',{name:'Сообщение',exact:true});
  const send=chat.getByRole('button',{name:'Отправить сообщение',exact:true});
  const writes=()=>page.evaluate(()=>window.messengerTest.planningWrites);
  const title=page.getByRole('textbox',{name:'Название',exact:true});
  const closeForm=async name=>{
    if(width<768) {
      await page.getByRole('button',{name:'Назад',exact:true}).click();
      await page.locator('[data-mobile-form-page]').waitFor({state:'hidden'});
      await page.waitForFunction(()=>!new URLSearchParams(location.search).has('formScreen'));
    } else {
      await page.getByRole('button',{name,exact:true}).click();
      await title.waitFor({state:'hidden'});
    }
  };
  await page.evaluate(()=>{window.messengerTest.failList=true;});
  await trigger.click();
  await drawer.getByRole('alert').filter({hasText:'Диалоги недоступны'}).waitFor();
  assert.equal(await drawer.getByText('Ассистент Rollapp',{exact:true}).count(),0);
  await drawer.getByRole('button',{name:'Закрыть сообщения',exact:true}).click();
  await drawer.waitFor({state:'hidden'});
  await entry.press('Enter');
  await chat.waitFor();
  assert.equal(new URL(page.url()).pathname,'/app/wishes');
  assert(await heading.evaluate(node=>node===document.activeElement),'Keyboard focus did not move to the assistant heading');
  assert.equal(await drawer.count(),0,'Assistant and contacts must not open two drawers');
  await settlePopup(chat);
  const assistantBounds=await chat.boundingBox();
  assert.deepEqual(assistantBounds,contactBounds,'Assistant must use the same drawer geometry as contacts');
  assert.equal(await chat.getAttribute('data-swipe-direction'),width<768?'down':'right');
  assert.equal(await chat.getByText('Диктовка: микрофон или пробел вне поля ввода',{exact:true}).count(),0);
  assert.equal(await chat.getByText(/Ctrl\/⌘ \+ Enter — отправить/).count(),0);
  assert.equal(await chat.getByRole('checkbox').count(),0);
  assert.equal(await chat.getByText('Учесть моё планирование',{exact:true}).count(),0);
  if (width===320 || width===1440) await page.screenshot({path:`/tmp/rollapp-assistant-empty-${width}-${height}.png`});
  await checkDictation(page, chat, text, send, heading, close, openAssistant);
  assert.equal(await send.isDisabled(),true);
  await chat.getByRole('button',{name:'Открыть календарь',exact:true}).press('Enter');
  assert.equal(await text.inputValue(),'Открой календарь Rollapp.');
  assert(await text.evaluate(node=>node===document.activeElement),'Starter did not focus the editable draft');
  assert.deepEqual(await page.evaluate(()=>window.messengerTest.assistant),[],'Selecting a starter must not send it');
  await text.fill('Что у меня в планах?');
  await page.evaluate(()=>{window.messengerTest.failAssistant=true;});
  await send.click();
  await chat.getByRole('alert').filter({hasText:'Ассистент временно недоступен'}).waitFor();
  assert.equal(await text.inputValue(),'Что у меня в планах?');
  await page.evaluate(()=>{window.messengerTest.failAssistant=false;window.messengerTest.failList=false;});
  await text.press('Control+Enter');
  await chat.getByText('Личный ответ о планировании',{exact:true}).waitFor();
  await close.click();
  await chat.waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.activeElement?.classList.contains('assistant-fab'));
  await openAssistant();
  await chat.getByText('Личный ответ о планировании',{exact:true}).waitFor();
  await chat.getByRole('button',{name:'Диктовка',exact:true}).click();
  await page.evaluate(()=>{
    const speech=window.messengerTest.speech;
    const result=Object.assign([{transcript:'Подготовь черновики'}],{isFinal:true});
    speech.onresult({resultIndex:0,results:[result]});
    speech.onend();
  });
  await send.click();
  const task=chat.getByRole('link',{name:'Проверить задачу',exact:true});
  await task.waitFor();
  assert.equal(await chat.locator('article img').count(),0,'Assistant output must not execute HTML');
  assert.deepEqual(await page.evaluate(()=>window.messengerTest.assistant.map(request=>request.messages)),[
    [{role:'user',content:'Что у меня в планах?'}],
    [{role:'user',content:'Что у меня в планах?'}],
    [{role:'user',content:'Что у меня в планах?'},{role:'assistant',content:'Личный ответ о планировании'},
      {role:'user',content:'Подготовь черновики'}],
  ]);
  assert.deepEqual(await writes(),[],'An assistant reply must not save anything');
  const metrics=await chat.evaluate(node=>{
    const b=node.querySelector('button[type="submit"]').getBoundingClientRect(), history=node.querySelector('.messenger-history'), name=node.querySelector('[data-slot="drawer-title"]');
    return { overflow:document.documentElement.scrollWidth>innerWidth || history.scrollWidth>history.clientWidth+1,
      width:b.width,height:b.height,y:b.y,bottom:b.bottom,historyHeight:history.clientHeight, titleClipped:name.scrollWidth>name.clientWidth+1 };
  });
  assert.equal(metrics.overflow,false);assert.equal(metrics.titleClipped,false);assert.equal(metrics.width,48);assert.equal(metrics.height,48);
  assert(metrics.y>=0 && metrics.bottom<=height && metrics.historyHeight>0);
  if(width===390 && height===400) {
    await text.fill('Многострочный черновик\n'.repeat(12));
    await page.evaluate(()=>{
      Object.defineProperties(visualViewport,{
        height:{configurable:true,value:260},
        offsetTop:{configurable:true,value:50},
      });
      visualViewport.dispatchEvent(new Event('resize'));
    });
    await page.waitForFunction(()=>document.documentElement.hasAttribute('data-overlay-keyboard'));
    const panned=await send.boundingBox();
    assert(panned.y>=50 && panned.y+panned.height<=310,`Assistant composer escaped panned viewport: ${JSON.stringify(panned)}`);
    await page.evaluate(()=>{
      delete visualViewport.height;
      delete visualViewport.offsetTop;
      visualViewport.dispatchEvent(new Event('resize'));
    });
    await page.waitForFunction(()=>!document.documentElement.hasAttribute('data-overlay-keyboard'));
    await text.fill('');
  }
  if(width===1440 || width===390 || width===320) await page.screenshot({path:`/tmp/rollapp-assistant-${width}-${height}.png`});
  await task.click();
  await title.waitFor();
  assert.equal(await title.inputValue(),'Подготовить встречу');
  assert.equal(await page.getByRole('textbox',{name:'Описание',exact:true}).inputValue(),'Собрать вопросы');
  assert.equal(new URL(page.url()).searchParams.get('date'),'2026-11-08');
  assert.equal(await page.locator('input[type=time]:visible').inputValue(),'','An untimed task must stay untimed');
  assert.deepEqual(await writes(),[]);
  await closeForm('Закрыть задачу');
  await openAssistant();
  await chat.getByRole('link',{name:'Проверить событие',exact:true}).click();
  await title.waitFor();
  assert.equal(await title.inputValue(),'Встреча команды');
  assert.equal(await page.locator('input[type=time]:visible').inputValue(),'14:30');
  assert.equal(await page.getByRole('spinbutton',{name:'Длительность, минут'}).inputValue(),'45');
  if(width===390 && height===844) {
    await page.getByRole('button',{name:'Сохранить',exact:true}).click();
    await title.waitFor({state:'hidden'});
    const [record]=await writes();
    assert.equal(record.body.startTime,'14:30');
    assert.equal(record.body.dueOn,'2026-11-09');
    await trigger.waitFor();
  } else await closeForm('Закрыть задачу');
  await openAssistant();
  await chat.getByRole('link',{name:'Проверить заметку',exact:true}).click();
  await title.waitFor();
  assert.equal(await title.inputValue(),'Идеи встречи');
  assert.match(await page.getByRole('textbox',{name:'Текст заметки',exact:true}).inputValue(),/^Первый пункт/);
  if((width===390 || width===1440) && height===844) {
    await page.getByRole('button',{name:'Сохранить',exact:true}).click();
    await page.waitForFunction(()=>new URLSearchParams(location.search).has('note'));
    const note=(await writes()).at(-1);
    assert.equal(note.path,'/planning/notes');
    assert.equal(note.body.title,'Идеи встречи');
    assert.match(note.body.content,/!\\\[Внешнее изображение\\\]/);
  } else await closeForm('Закрыть заметку');
  await openAssistant();
  await text.fill('Открой календарь');
  await send.click();
  const link=chat.getByRole('link',{name:'Открыть: Календарь',exact:true});
  await link.waitFor();
  assert.deepEqual((await page.evaluate(()=>window.messengerTest.assistant.at(-1).messages)).map(({role})=>role),['user','assistant','user','assistant','user']);
  await checkParallelChats(page, chat, text, close, openAssistant, width, height);
  await link.click();
  await chat.waitFor({state:'hidden'});
  assert.equal(new URL(page.url()).searchParams.get('tab'),'calendar');
  if (width===390 && height===844) {
    const planningPath=new URL(page.url()).pathname+new URL(page.url()).search;
    await openAssistant();
    await page.keyboard.press('Escape');
    await chat.waitFor({state:'hidden'});
    await entry.waitFor();
    assert.equal(new URL(page.url()).pathname+new URL(page.url()).search,planningPath);
    await openAssistant();
    await page.mouse.click(8,8);
    await chat.waitFor({state:'hidden'});
    await page.getByRole('link',{name:'Назад в приложение',exact:true}).click();
    assert.equal(new URL(page.url()).pathname,'/app/wishes','Assistant must not replace planning’s return path');
    await page.evaluate(()=>{delete window.SpeechRecognition; delete window.webkitSpeechRecognition;});
    await openAssistant();
    assert.equal(await chat.getByRole('button',{name:'Диктовка',exact:true}).isDisabled(),true);
    await chat.getByText('Диктовка недоступна в этом браузере',{exact:true}).waitFor();
    await text.fill('Ручной ввод');
    assert.equal(await send.isEnabled(),true);
  }
  console.log(`PASS assistant ${width}x${height}: shared drawer, keyboard/focus, dictation, parallel replies, scoped context, safe draft review, navigation`);
}

async function holdAssistantReplies(page, ...prompts) {
  await page.evaluate(prompts=>{
    for(const prompt of prompts) window.messengerTest.assistantHolds.set(prompt,{});
  },prompts);
}

async function settlePopup(popup) {
  await popup.evaluate(async node=>{
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    await Promise.allSettled(node.getAnimations().map(animation=>animation.finished));
  });
}

async function finishAssistantReply(page, prompt, { reply, error }) {
  await page.evaluate(({prompt,reply,error})=>{
    const holds=window.messengerTest.assistantHolds;
    const hold=holds.get(prompt);
    holds.delete(prompt);
    if(error) hold.reject(new Error(error));
    else hold.resolve({reply,actions:[]});
  },{prompt,reply,error});
}

async function checkParallelChats(page, chat, text, close, openAssistant, width, height) {
  const picker=chat.getByRole('button',{name:/^Чаты ассистента/});
  const create=chat.getByRole('button',{name:'Новый чат',exact:true});
  const list=page.getByRole('menu',{name:/^Чаты ассистента/});
  const send=chat.getByRole('button',{name:'Отправить сообщение',exact:true});
  const mic=chat.getByRole('button',{name:'Диктовка',exact:true});
  const history=chat.getByRole('log',{name:'История сообщений'});
  const select=async name=>{
    await picker.click();
    await list.getByRole('menuitemradio',{name}).click();
    await list.waitFor({state:'hidden'});
  };
  const first='Что у меня в планах?';
  const slow='Длинный план отдельной встречи '.repeat(4).trim();
  const fast='Короткий ответ в третьем чате';
  const initialRequests=await page.evaluate(()=>window.messengerTest.assistant.length);
  await holdAssistantReplies(page,slow,fast);

  const [pickerBox,createBox]=await Promise.all([picker.boundingBox(),create.boundingBox()]);
  assert.equal(pickerBox.height,48);
  assert.equal(createBox.height,48);
  assert.equal(createBox.width,48);
  assert.equal(createBox.y,pickerBox.y);
  assert.equal(createBox.x-pickerBox.x-pickerBox.width,8);
  assert(createBox.x+createBox.width<=width && createBox.y+createBox.height<=height);
  await create.click();
  assert.equal(await history.locator('article').count(),0);
  assert.equal(await text.inputValue(),'');
  await text.fill(slow);
  await mic.click();
  await create.click();
  assert.equal(await page.evaluate(()=>window.messengerTest.speech.aborted),true);
  await page.evaluate(()=>{
    const result=Object.assign([{transcript:'Поздняя диктовка'}],{isFinal:true});
    window.messengerTest.speech.onresult({resultIndex:0,results:[result]});
  });
  assert.equal(await text.inputValue(),'');
  await text.fill(fast);
  await select('Чат 2');
  assert.equal(await text.inputValue(),slow);
  await text.press('Control+Enter');
  await history.getByText('Ассистент готовит ответ…').waitFor();
  assert.equal(await text.getAttribute('readonly'),'');
  await text.press('Control+Enter');

  await select('Чат 3');
  assert.equal(await text.inputValue(),fast);
  await send.click();
  await history.getByText('Ассистент готовит ответ…').waitFor();
  assert.equal(await page.evaluate(()=>window.messengerTest.assistant.length),initialRequests+2);
  assert.deepEqual(await page.evaluate(()=>window.messengerTest.assistant.slice(-2).map(request=>request.messages)),[
    [{role:'user',content:slow}],
    [{role:'user',content:fast}],
  ]);
  await select(first);
  await chat.getByRole('button',{name:/Готовятся ответы: 2/}).waitFor();
  await close.click();
  await chat.waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>[...window.messengerTest.assistantHolds.values()].some(hold=>hold.signal.aborted)),false);
  await finishAssistantReply(page,fast,{reply:'Третий чат ответил первым'});
  await openAssistant();
  await chat.getByRole('button',{name:/Новые ответы: 1.*Готовятся ответы: 1/}).waitFor();
  assert.equal(await history.getByText('Третий чат ответил первым',{exact:true}).count(),0);
  await picker.press('Enter');
  const slowItem=list.getByRole('menuitemradio',{name:/^Длинный план.*Готовится ответ$/});
  await slowItem.waitFor();
  const fastItem=list.getByRole('menuitemradio',{name:/^Короткий ответ.*Новый ответ$/});
  await fastItem.waitFor();
  await settlePopup(list);
  const popup=await list.boundingBox();
  assert(popup.x>=0 && popup.x+popup.width<=width && popup.y>=0 && popup.y+popup.height<=height,
    `Chat picker escaped viewport: ${JSON.stringify(popup)}`);
  assert.equal(await slowItem.evaluate(node=>node.scrollWidth>node.clientWidth),false);
  if(width===1440 || width===390 || width===320) await page.screenshot({path:`/tmp/rollapp-assistant-chats-${width}-${height}.png`,animations:'disabled'});
  await page.keyboard.press('Escape');
  await list.waitFor({state:'hidden'});
  assert.equal(await chat.isVisible(),true,'Escape in the picker closed the assistant drawer');
  await picker.press('Enter');
  await fastItem.press('Space');
  await history.getByText('Третий чат ответил первым',{exact:true}).waitFor();
  assert.equal(await mic.getAttribute('aria-pressed'),'false','Selecting a chat with Space started dictation');
  assert.equal(await chat.getByRole('button',{name:/Новые ответы/}).count(),0);
  await finishAssistantReply(page,slow,{error:'Ошибка медленного запроса'});
  await chat.getByRole('button',{name:/Ошибки отправки: 1/}).waitFor();
  assert.equal(await chat.getByRole('alert').count(),0);
  await select(/^Длинный план.*Ошибка отправки$/);
  await chat.getByRole('alert').filter({hasText:'Ошибка медленного запроса'}).waitFor();
  assert.equal(await text.inputValue(),slow);
  await send.click();
  await history.getByText('Личный ответ о планировании',{exact:true}).waitFor();
  assert.equal(await history.locator('article').count(),2);
  assert.equal(await text.inputValue(),'');
  await select(first);
  assert.equal(await history.getByText('Третий чат ответил первым',{exact:true}).count(),0);
}

async function checkAssistantAccountSwitch(page, chat) {
  const prompts=['Первый незавершённый запрос','Второй незавершённый запрос'];
  await holdAssistantReplies(page,...prompts);
  const text=chat.getByRole('textbox',{name:'Сообщение',exact:true});
  for(const prompt of prompts){
    await text.fill(prompt);
    await text.press('Control+Enter');
    await chat.getByText('Ассистент готовит ответ…').waitFor();
    await chat.getByRole('button',{name:'Новый чат',exact:true}).click();
  }
  await text.fill('Черновик другого аккаунта');
  await page.evaluate(()=>window.messengerTest.switchAccount('other'));
  await chat.getByRole('button',{name:'Чаты ассистента. Текущий чат: Чат 1',exact:true}).waitFor();
  assert.equal(await text.inputValue(),'');
  assert.equal(await page.evaluate(()=>[...window.messengerTest.assistantHolds.values()].every(hold=>hold.signal.aborted)),true);
  for(const prompt of prompts) await finishAssistantReply(page,prompt,{reply:'Поздний ответ другого аккаунта'});
  await chat.getByRole('button',{name:/^Чаты ассистента/}).click();
  const list=page.getByRole('menu',{name:'Чаты ассистента'});
  await list.getByRole('menuitemradio',{name:'Чат 1',exact:true}).waitFor();
  assert.equal(await list.getByRole('menuitemradio').count(),1);
  assert.equal(await chat.getByText('Поздний ответ другого аккаунта').count(),0);
  await page.keyboard.press('Escape');
}

async function checkDictation(page, chat, text, send, heading, close, openAssistant) {
  const mic=chat.getByRole('button',{name:'Диктовка',exact:true});
  const micBounds=await mic.boundingBox();
  const sendBounds=await send.boundingBox();
  assert.equal(micBounds.width,48);
  assert.equal(micBounds.height,48);
  assert.equal(micBounds.y,sendBounds.y);
  assert.equal(sendBounds.x-micBounds.x-micBounds.width,8);
  await page.keyboard.press('Space');
  assert.equal(await mic.getAttribute('aria-pressed'),'true');
  assert.equal(await page.evaluate(()=>window.messengerTest.speech.lang),'ru-RU');
  await text.fill('Напомни');
  await text.press('Space');
  assert.equal(await text.inputValue(),'Напомни ');
  await page.evaluate(()=>{
    const speech=window.messengerTest.speech;
    const result=Object.assign([{transcript:'про встречу'}],{isFinal:true});
    speech.onresult({resultIndex:0,results:[result]});
    speech.onresult({resultIndex:0,results:[result]});
  });
  await page.waitForFunction(()=>document.querySelector('#messenger-text').value==='Напомни про встречу');
  await text.press('Control+Enter');
  assert.equal(await send.isDisabled(),true);
  assert.deepEqual(await page.evaluate(()=>window.messengerTest.assistant),[],'Dictation must not submit the draft');
  await heading.focus();
  await page.keyboard.press('Space');
  assert.equal(await page.evaluate(()=>window.messengerTest.speech.stopRequested),true);
  await page.evaluate(()=>window.messengerTest.speech.onend());
  await chat.getByRole('button',{name:'Диктовка',pressed:false}).waitFor();
  assert.equal(await send.isEnabled(),true);

  await mic.click();
  await page.evaluate(()=>{
    const speech=window.messengerTest.speech;
    speech.onerror({error:'not-allowed'});
    speech.onend();
  });
  await chat.getByText('Разрешите доступ к микрофону в настройках браузера.',{exact:true}).waitFor();
  assert.equal(await text.inputValue(),'Напомни про встречу');
  await mic.click();
  await close.click();
  await chat.waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>window.messengerTest.speech.aborted),true,'Leaving the page must stop the microphone');
  await page.evaluate(()=>{
    const result=Object.assign([{transcript:'поздняя реплика'}],{isFinal:true});
    window.messengerTest.speech.onresult({resultIndex:0,results:[result]});
  });
  await openAssistant();
  assert.equal(await text.inputValue(),'Напомни про встречу');
  await text.fill('');
}
