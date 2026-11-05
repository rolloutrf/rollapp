import assert from 'node:assert/strict';
import { smokeBaseUiDependencies } from './smoke-dependencies.mjs';
import { instrumentSmokeBrowser, smokeBrowserDiagnostics } from './smoke-browser-diagnostics.mjs';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { browserLaunchOptions } from './browser-runtime.mjs';
import { listenSmokeServer, smokeOrigin } from './smoke-server.mjs';
const cid='4a0effb1-352d-4bc4-9f1f-6ee126840d01';
const server=await createServer({optimizeDeps:{entries:['scripts/fixtures/messenger.jsx'],include:['react','react-dom','react-dom/client','react/jsx-runtime','react-router-dom','class-variance-authority','clsx','lucide-react','tailwind-merge','qrcode','sonner','zod',...smokeBaseUiDependencies,'date-fns/locale','next-themes','react-day-picker']},cacheDir:process.env.MESSENGER_CACHE_DIR || 'node_modules/.vite-messenger-smoke',server:{host:'127.0.0.1',port:0,hmr:false,watch:null},plugins:[{
  name:'messenger-fixture',enforce:'pre',transform(source,id){if(id.endsWith('/src/App.jsx?messenger-smoke'))return `${source}\nexport { GlobalAppChrome, PlanningFab, MessengerRoute, AppShell, SessionContext, ToastContext, CollectionNavigationContext };`;},configureServer(vite){vite.middlewares.use(async(req,res,next)=>{
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
  assert.equal(planning.y-(launcher.y+launcher.height),8,'Messenger must sit exactly 8px above planning');
  assert.equal(launcher.x,planning.x);assert.equal(launcher.width,48);assert.equal(launcher.height,48);
  await page.getByRole('button',{name:'Открыть сообщения',exact:true}).click();
  const drawer=page.getByRole('dialog',{name:'Сообщения',exact:true});
  await drawer.waitFor();
  await page.getByRole('searchbox',{name:'Найти участника'}).waitFor();
  assert.match(await drawer.locator('.messenger-directory-scroll .messenger-person').first().innerText(), /^Ассистент Rollapp/);
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
  await checkAssistant(page, drawer, width, height);
  assert.equal(navigations,1,'Assistant actions must use in-app navigation');
  if((width===1440 || width===390) && height===844){
    await page.goto(`${smokeOrigin(server)}/app/messenger/${cid}`,{waitUntil:'networkidle'});
    await drawer.locator('.messenger-message').last().waitFor();
    assert.equal(new URL(page.url()).pathname,'/app/wishes','Deep link must open drawer on source page');
  }
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

async function checkAssistant(page, drawer, width, height) {
  const trigger=page.getByRole('button',{name:'Открыть сообщения',exact:true});
  const entry=drawer.getByRole('button',{name:/^Ассистент Rollapp/});
  const chat=drawer.getByRole('region',{name:'Ассистент Rollapp',exact:true});
  const back=drawer.getByRole('button',{name:'Все диалоги',exact:true});
  const close=drawer.getByRole('button',{name:'Закрыть сообщения',exact:true});
  const openAssistant=async()=>{await trigger.click();await entry.click();await chat.waitFor();};
  const text=chat.getByRole('textbox',{name:'Сообщение',exact:true});
  const send=chat.getByRole('button',{name:'Отправить сообщение',exact:true});
  const planning=chat.getByRole('checkbox',{name:'Учесть моё планирование',exact:true});
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
  assert.match(await drawer.locator('.messenger-directory-scroll .messenger-person').first().innerText(),/^Ассистент Rollapp/);
  await entry.press('Enter');
  await chat.waitFor();
  assert(await back.evaluate(node=>node===document.activeElement),'Keyboard focus did not move to the assistant chat');
  assert.equal(await planning.getAttribute('aria-checked'),'false');
  assert.equal(await send.isDisabled(),true);
  await text.fill('Что у меня в планах?');
  await page.evaluate(()=>{window.messengerTest.failAssistant=true;});
  await send.click();
  await chat.getByRole('alert').filter({hasText:'Ассистент временно недоступен'}).waitFor();
  assert.equal(await text.inputValue(),'Что у меня в планах?');
  await page.evaluate(()=>{window.messengerTest.failAssistant=false;window.messengerTest.failList=false;});
  await planning.click();
  assert.equal(await planning.getAttribute('aria-checked'),'true');
  await text.press('Control+Enter');
  await chat.getByText('Личный ответ о планировании',{exact:true}).waitFor();
  assert.equal(await planning.getAttribute('aria-checked'),'false','Sharing must be opt-in for each send');
  await back.click();
  assert(await entry.evaluate(node=>node===document.activeElement),'Back did not restore focus to the assistant row');
  assert.match(await entry.innerText(),/Личный ответ о планировании/);
  await close.click();
  await drawer.waitFor({state:'hidden'});
  await openAssistant();
  await chat.getByText('Личный ответ о планировании',{exact:true}).waitFor();
  await text.fill('Подготовь черновики');
  await send.click();
  const task=chat.getByRole('link',{name:'Проверить задачу',exact:true});
  await task.waitFor();
  assert.equal(await chat.locator('article img').count(),0,'Assistant output must not execute HTML');
  assert.deepEqual(await page.evaluate(()=>window.messengerTest.assistant.map(({messages,includePlanning})=>({messages,includePlanning}))),[
    {messages:[{role:'user',content:'Что у меня в планах?'}],includePlanning:false},
    {messages:[{role:'user',content:'Что у меня в планах?'}],includePlanning:true},
    {messages:[{role:'user',content:'Подготовь черновики'}],includePlanning:false},
  ]);
  assert.deepEqual(await writes(),[],'An assistant reply must not save anything');
  const metrics=await chat.evaluate(node=>{
    const b=node.querySelector('button[type="submit"]').getBoundingClientRect(), history=node.querySelector('.messenger-history'), name=node.querySelector('header strong');
    return { overflow:document.documentElement.scrollWidth>innerWidth || history.scrollWidth>history.clientWidth+1,
      width:b.width,height:b.height,y:b.y,bottom:b.bottom,historyHeight:history.clientHeight, titleClipped:name.scrollWidth>name.clientWidth+1 };
  });
  assert.equal(metrics.overflow,false);assert.equal(metrics.titleClipped,false);assert.equal(metrics.width,48);assert.equal(metrics.height,48);
  assert(metrics.y>=0 && metrics.bottom<=height && metrics.historyHeight>0);
  if(width===390 && height===400) {
    await text.fill('Многострочный черновик\n'.repeat(12));
    await page.evaluate(()=>{
      const root=document.documentElement;
      root.style.setProperty('--app-visual-height','260px');
      root.style.setProperty('--app-visual-top','50px');
      root.style.setProperty('--app-visual-bottom','90px');
      root.setAttribute('data-overlay-keyboard','');
    });
    const panned=await send.boundingBox();
    assert(panned.y>=50 && panned.y+panned.height<=310,'Assistant composer escaped panned viewport');
    await page.evaluate(()=>{
      const root=document.documentElement;
      for(const name of ['height','top','bottom']) root.style.removeProperty(`--app-visual-${name}`);
      root.removeAttribute('data-overlay-keyboard');
    });
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
  assert.deepEqual((await page.evaluate(()=>window.messengerTest.assistant.at(-1).messages)).map(({role})=>role),['user','assistant','user']);
  await link.click();
  await drawer.waitFor({state:'hidden'});
  assert.equal(new URL(page.url()).searchParams.get('tab'),'calendar');
  console.log(`PASS assistant ${width}x${height}: first row, keyboard/focus, chat retry, scoped context, safe draft review, navigation`);
}
