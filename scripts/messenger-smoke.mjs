import assert from 'node:assert/strict';
import { smokeBaseUiDependencies } from './smoke-dependencies.mjs';
import { instrumentSmokeBrowser, smokeBrowserDiagnostics } from './smoke-browser-diagnostics.mjs';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { browserLaunchOptions } from './browser-runtime.mjs';
import { listenSmokeServer, smokeOrigin } from './smoke-server.mjs';
const cid='4a0effb1-352d-4bc4-9f1f-6ee126840d01';
const server=await createServer({optimizeDeps:{entries:['scripts/fixtures/messenger.jsx'],include:['react','react-dom','react-dom/client','react/jsx-runtime','react-router-dom','class-variance-authority','clsx','lucide-react','tailwind-merge','qrcode','sonner','zod',...smokeBaseUiDependencies,'date-fns/locale','next-themes','react-day-picker','@ui-sdk/core','@ui-sdk/react/agent','@ui-sdk/react/primitive']},cacheDir:process.env.MESSENGER_CACHE_DIR || 'node_modules/.vite-messenger-smoke',server:{host:'127.0.0.1',port:0,hmr:false,watch:null},plugins:[{
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
  // The first AppShell load compiles the full module graph on a cold Vite server.
  await page.goto(`${smokeOrigin(server)}/app/wishes`,{waitUntil:'networkidle',timeout:120_000});
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
    await assertAssistantDirectory(direct, 1);
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
    await assertAssistantDirectory(chat);
    await settlePopup(chat);
  };
  const resume=async name=>{
    await openAssistant();
    await assistantRow(chat, name).click();
  };
  const first=/^Что у меня в планах\?/;
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
  await page.waitForFunction(() => document.querySelector('[data-slot="drawer-popup"] .messenger-heading h2') === document.activeElement);
  assert(await heading.evaluate(node=>node===document.activeElement),'Keyboard focus did not move to the assistant heading');
  assert.equal(await drawer.count(),0,'Assistant and contacts must not open two drawers');
  await settlePopup(chat);
  const assistantBounds=await chat.boundingBox();
  assert.deepEqual(assistantBounds,contactBounds,'Assistant must use the same drawer geometry as contacts');
  assert.equal(await chat.getAttribute('data-swipe-direction'),width<768?'down':'right');
  await assertAssistantDirectory(chat, 1);
  await assistantRow(chat, 'Новый чат').press('Enter');
  await chat.getByRole('heading',{name:'Чат 1',exact:true}).waitFor();
  const back=chat.getByRole('button',{name:'Все диалоги',exact:true});
  const backBox=await back.boundingBox();
  assert.equal(backBox.width,48);
  assert.equal(backBox.height,48);
  await back.click();
  await assertAssistantDirectory(chat, 1);
  await assistantRow(chat, 'Новый чат').click();
  const conversationHeading=chat.getByRole('heading',{name:'Чат 1',exact:true});
  assert(await conversationHeading.evaluate(node=>node===document.activeElement));
  assert.equal(await chat.getByText('Диктовка: микрофон или пробел вне поля ввода',{exact:true}).count(),0);
  assert.equal(await chat.getByText(/Ctrl\/⌘ \+ Enter — отправить/).count(),0);
  assert.equal(await chat.getByRole('checkbox').count(),0);
  assert.equal(await chat.getByText('Учесть моё планирование',{exact:true}).count(),0);
  if (width===320 || width===1440) await page.screenshot({path:`/tmp/rollapp-assistant-empty-${width}-${height}.png`});
  await checkDictation(page, chat, text, send, conversationHeading, close, resume);
  assert.equal(await send.isDisabled(),true);
  const example = 'Найди кофемолку на Ozon до 4500 ₽ в «Кухню»';
  assert.equal(await text.getAttribute('placeholder'), example);
  assert.equal(await text.inputValue(), '');
  assert(await text.evaluate(node => node.scrollHeight <= node.clientHeight + 1), 'The full suggestion must fit in the composer');
  await text.press('Shift+Tab');
  assert.equal(await text.inputValue(), '');
  assert(await text.evaluate(node => node !== document.activeElement), 'Shift+Tab must move focus');
  await text.press('Tab');
  assert.equal(await text.inputValue(), example);
  assert(await text.evaluate(node => node === document.activeElement && node.selectionStart === node.value.length),
    'Accepting a suggestion must keep the composer focused with the caret after the text');
  assert.equal(await send.isEnabled(), true);
  await page.keyboard.press('Tab');
  assert(await text.evaluate(node => node !== document.activeElement), 'Tab must move focus after accepting the suggestion');
  assert.deepEqual(await page.evaluate(() => window.messengerTest.assistant), [], 'Accepting a suggestion must not send it');
  await text.fill('');
  await checkAssistantPresets(page, chat, text, width, height);
  const starters = chat.getByRole('group', { name: 'Примеры запросов' });
  assert.equal(await starters.locator(':scope > button').count(), 17);
  assert(await starters.evaluate(catalog => {
    const history = catalog.closest('[role="log"]');
    return history.scrollWidth === history.clientWidth && Array.from(catalog.querySelectorAll('button')).every(button =>
      button.offsetHeight >= 48 && button.scrollWidth <= button.clientWidth + 1);
  }), 'Preset labels must fit without horizontal scrolling');
  const lastStarter = starters.getByRole('button', { name: 'Превратить пункт ИПР в задачи' });
  const sendBefore = await send.boundingBox();
  await lastStarter.scrollIntoViewIfNeeded();
  assert.deepEqual(await send.boundingBox(), sendBefore, 'Scrolling the presets moved the composer');
  await lastStarter.click();
  assert.match(await text.inputValue(), /^По пункту моего ИПР/);
  assert(await text.evaluate(node=>node===document.activeElement),'Starter did not focus the editable draft');
  await text.fill('');
  await starters.getByRole('button',{name:'Добавить желание',exact:true}).press('Enter');
  assert.match(await text.inputValue(),/кофемолку за 4 500 ₽/);
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
  assert.equal(await text.getAttribute('placeholder'), 'Сообщение…');
  await close.click();
  await chat.waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.activeElement?.classList.contains('assistant-fab'));
  await resume(first);
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
    const b=node.querySelector('button[type="submit"]').getBoundingClientRect(), history=node.querySelector('.messenger-history'), name=node.querySelector('.messenger-heading h2:not(.sr-only)');
    const heading=name.getBoundingClientRect(), close=node.querySelector('[data-slot="drawer-close"]').getBoundingClientRect();
    return { overflow:document.documentElement.scrollWidth>innerWidth || history.scrollWidth>history.clientWidth+1,
      width:b.width,height:b.height,y:b.y,bottom:b.bottom,historyHeight:history.clientHeight,
      titleFits:heading.width>0 && heading.right+8<=close.left+.5, fullTitle:name.title };
  });
  assert.equal(metrics.overflow,false);assert.equal(metrics.titleFits,true);assert.equal(metrics.fullTitle,'Что у меня в планах?');
  assert.equal(metrics.width,48);assert.equal(metrics.height,48);
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
  await resume(first);
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
  await resume(first);
  {
    const wishPage = await browser.newPage({ viewport: { width, height } });
    const wishErrors = [];
    wishPage.setDefaultTimeout(8000);
    wishPage.on('pageerror', error => wishErrors.push(error.message));
    await wishPage.route('**/api/**', route => {
      wishErrors.push('Unexpected production API request');
      return route.abort();
    });
    await wishPage.goto(`${smokeOrigin(server)}/app/wishes`, { waitUntil: 'domcontentloaded' });
    await wishPage.getByRole('button', { name: 'Ассистент Rollapp', exact: true }).waitFor({ timeout: 20_000 });
    await wishPage.getByRole('button', { name: 'Ассистент Rollapp', exact: true }).click();
    const assistantChat = wishPage.getByRole('dialog', { name: 'Ассистент Rollapp', exact: true });
    await assistantRow(assistantChat, 'Новый чат').click();
    await assistantChat.getByRole('button', { name: 'Добавить желание', exact: true }).click();
    const composer = assistantChat.getByRole('textbox', { name: 'Сообщение', exact: true });
    assert.match(await composer.inputValue(), /Кухня/);
    await assistantChat.getByRole('button', { name: 'Отправить сообщение', exact: true }).click();
    const review = assistantChat.getByRole('button', { name: 'Проверить желание', exact: true });
    await review.click();
    const title = wishPage.getByRole('combobox', { name: 'Название', exact: true });
    await title.waitFor();
    assert.equal(await title.inputValue(), 'Кофемолка');
    assert.equal(await wishPage.getByRole('spinbutton', { name: 'Цена', exact: true }).inputValue(), '4500');
    const kitchen = wishPage.getByRole('switch', { name: 'Кухня', exact: true });
    await kitchen.waitFor();
    assert.equal(await kitchen.getAttribute('aria-checked'), 'true');
    assert.deepEqual(await wishPage.evaluate(() => window.messengerTest.wishWrites), []);
    if (width < 768) await wishPage.goBack();
    else await wishPage.getByRole('button', { name: 'Закрыть', exact: true }).click();
    await review.waitFor();
    assert.deepEqual(await wishPage.evaluate(() => window.messengerTest.wishWrites), []);
    if ((width === 390 || width === 1440) && height === 844) {
      await composer.fill('Найди кофемолку на Ozon до 4500 ₽ в «Кухню»');
      await assistantChat.getByRole('button', { name: 'Отправить сообщение', exact: true }).click();
      const productReview = assistantChat.getByRole('group', { name: 'Черновик желания: Кофемолка Bosch' })
        .getByRole('button', { name: 'Проверить желание' });
      await productReview.click();
      const description = wishPage.getByRole('textbox', { name: 'Описание желания', exact: true });
      await description.waitFor();
      await wishPage.waitForFunction(() => Array.from(document.querySelectorAll('textarea')).some(
        field => field.value === 'Компактная кофемолка с ножом из нержавеющей стали'));
      assert(await wishPage.getByRole('button', { name: 'Заполнить по ссылке', exact: true }).isEnabled());
      assert.equal(await title.inputValue(), 'Кофемолка Bosch');
      assert.equal(await wishPage.getByRole('textbox', { name: 'Ссылка', exact: true }).inputValue(), 'https://www.ozon.ru/product/coffee-123/');
      assert.equal(await wishPage.getByRole('spinbutton', { name: 'Цена', exact: true }).inputValue(), '3290');
      assert.equal(await kitchen.getAttribute('aria-checked'), 'true');
      assert.deepEqual(await wishPage.evaluate(() => window.messengerTest.wishWrites), []);
      if (width < 768) await wishPage.goBack();
      else await wishPage.getByRole('button', { name: 'Закрыть', exact: true }).click();
      await productReview.waitFor();
      await composer.fill('Добавь в «Кухню» за 4 500 ₽ https://example.invalid/coffee');
      await assistantChat.getByRole('button', { name: 'Отправить сообщение', exact: true }).click();
      const linkDraft = assistantChat.getByRole('group', { name: 'Черновик желания: Желание по ссылке' });
      const linkReview = linkDraft.getByRole('button', { name: 'Проверить желание' });
      await linkReview.click();
      assert.equal(await wishPage.getByRole('textbox', { name: 'Ссылка', exact: true }).inputValue(), 'https://example.invalid/coffee');
      await wishPage.waitForFunction(() => Array.from(document.querySelectorAll('input')).some(input => input.value === 'Кофемолка из магазина'));
      assert.equal(await title.inputValue(), 'Кофемолка из магазина');
      assert.equal(await wishPage.getByRole('spinbutton', { name: 'Цена', exact: true }).inputValue(), '4500');
      assert.equal(await wishPage.getByRole('combobox', { name: 'Валюта', exact: true }).innerText(), '₽');
      assert.equal(await kitchen.getAttribute('aria-checked'), 'true');
      assert.deepEqual(await wishPage.evaluate(() => window.messengerTest.wishWrites), []);
      if (width < 768) await wishPage.goBack();
      else await wishPage.getByRole('button', { name: 'Закрыть', exact: true }).click();
      await linkReview.waitFor();
    }
    if (width === 390 && height === 400) {
      await composer.fill('Добавь кофемолку в список «Несуществующий»');
      await assistantChat.getByRole('button', { name: 'Отправить сообщение', exact: true }).click();
      const missingReview = assistantChat.getByRole('group', { name: 'Черновик желания: Кофемолка' })
        .filter({ hasText: 'Несуществующий' }).getByRole('button', { name: 'Проверить желание' });
      await missingReview.click();
      await wishPage.getByText('Список «Несуществующий» не найден.', { exact: false }).waitFor();
      assert.equal(await kitchen.getAttribute('aria-checked'), 'false');
      await wishPage.getByRole('button', { name: 'Назад', exact: true }).click();
      await missingReview.waitFor();
    }
    await assistantChat.getByRole('group', { name: 'Черновик желания: Кофемолка', exact: true })
      .filter({ hasText: 'Кухня' }).getByRole('button', { name: 'Проверить желание' }).click();
    await title.fill('Кофемолка для кухни');
    await title.press('Escape');
    await wishPage.getByRole('button', { name: 'Загадать желание', exact: true }).click();
    await wishPage.getByText('Сохранённое желание', { exact: true }).waitFor();
    const writes = await wishPage.evaluate(() => window.messengerTest.wishWrites);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].title, 'Кофемолка для кухни');
    assert.equal(writes[0].price, 4500);
    assert.deepEqual(writes[0].listIds, ['kitchen']);
    assert.deepEqual(wishErrors, []);
    await wishPage.close();
  }

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
  await resume(first);
  await text.fill('Открой календарь');
  await send.click();
  const link=chat.getByRole('link',{name:'Открыть: Календарь',exact:true});
  await link.waitFor();
  assert.deepEqual((await page.evaluate(()=>window.messengerTest.assistant.at(-1).messages)).map(({role})=>role),['user','assistant','user','assistant','user']);
  await checkParallelChats(page, chat, text, close, openAssistant, width, height);
  await link.click();
  await chat.waitFor({state:'hidden'});
  assert.equal(new URL(page.url()).searchParams.get('tab'),'calendar');
  await openAssistant();
  await checkWishlistSort(page, chat, text, send, width, height);
  await close.click();
  await chat.waitFor({state:'hidden'});
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
    await resume(first);
    assert.equal(await chat.getByRole('button',{name:'Диктовка',exact:true}).isDisabled(),true);
    await chat.getByText('Диктовка недоступна в этом браузере',{exact:true}).waitFor();
    await text.fill('Ручной ввод');
    assert.equal(await send.isEnabled(),true);
  }
  await checkNoteTasks(page, width, height);
  console.log(`PASS assistant ${width}x${height}: shared drawer, editable presets, keyboard/focus, dictation, parallel replies, scoped context, safe draft review, navigation`);
}

async function checkAssistantPresets(page, chat, text, width, height) {
  const trigger = chat.getByRole('button', { name: 'Пресеты запросов', exact: true });
  const menu = page.getByRole('menu', { name: 'Пресеты запросов', exact: true });
  const geometry = await trigger.boundingBox();
  assert.equal(geometry.width, 48);
  assert.equal(geometry.height, 48);
  await text.fill('Заметки встречи');
  await trigger.press('Enter');
  await menu.waitFor();
  await settlePopup(menu);
  assert.equal(await menu.getByRole('menuitem').count(), 17);
  const bounds = await menu.boundingBox();
  assert(bounds.x >= 0 && bounds.x + bounds.width <= width + 1 && bounds.y >= 0 && bounds.y + bounds.height <= height + 1);
  if ((width === 390 && height === 400) || (width === 1440 && height === 844)) {
    await page.screenshot({ path: `/tmp/rollapp-assistant-presets-${width}-${height}.png`, animations: 'disabled' });
  }
  await page.keyboard.press('Escape');
  await menu.waitFor({ state: 'hidden' });
  assert(await chat.isVisible());
  assert.equal(await text.inputValue(), 'Заметки встречи');
  await trigger.press('Enter');
  await menu.waitFor();
  await settlePopup(menu);
  await page.keyboard.press('Home');
  for (let index = 0; index < 9; index++) await page.keyboard.press('ArrowDown');
  const values = menu.getByRole('menuitem', { name: 'Ценности и действия на неделю', exact: true });
  assert(await values.evaluate(node => node === document.activeElement));
  assert(await values.evaluate(node => {
    const item = node.getBoundingClientRect();
    const popup = node.closest('[role="menu"]').getBoundingClientRect();
    return item.top >= popup.top - 1 && item.bottom <= popup.bottom + 1;
  }), 'Keyboard navigation must scroll the focused preset into the menu');
  await page.keyboard.press('Enter');
  await menu.waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.activeElement?.id === 'messenger-text');
  assert.match(await text.inputValue(), /^Заметки встречи\n\nПо моим примерам важных решений/);
  await text.fill('Заметки встречи');
  await trigger.press('Enter');
  await menu.getByRole('menuitem', { name: 'Подготовить заметку', exact: true }).press('Space');
  await menu.waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.activeElement?.id === 'messenger-text');
  assert.match(await text.inputValue(), /^Заметки встречи\n\nПодготовь заметку/);
  assert.equal(await chat.getByRole('button', { name: 'Диктовка', exact: true }).getAttribute('aria-pressed'), 'false');
  assert.deepEqual(await page.evaluate(() => window.messengerTest.assistant), []);
  await text.fill('а'.repeat(3999));
  assert(await trigger.isDisabled());
  assert.equal((await text.inputValue()).length, 3999);
  await text.fill('');
}

async function checkNoteTasks(page, width, height) {
  const notePage = await browser.newPage({ viewport: { width, height } });
  try {
    const unexpected = [];
    await notePage.route('**/api/**', route => {
      unexpected.push(route.request().url());
      return route.abort();
    });
    await notePage.goto(new URL('/app/planning?tab=notes&note=meeting-note', page.url()).href);
    const source = notePage.getByRole('button', { name: 'Сделать задачи из заметки' });
    await source.click();
    const chat = notePage.getByRole('dialog', { name: 'Ассистент Rollapp' });
    const review = chat.getByRole('button', { name: 'Проверить задачи (2)', exact: true });
    await review.click();
    const first = notePage.getByRole('checkbox', { name: 'Задача 1', exact: true });
    const secondTitle = notePage.getByRole('textbox', { name: 'Название задачи 2', exact: true });
    const instruction = notePage.getByRole('textbox', { name: 'Что изменить в черновике?' });
    const save = notePage.getByRole('button', { name: /^Сохранить выбранные/ });
    await first.waitFor();
    assert(await notePage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    const saveGeometry = await save.evaluate(button => ({
      height: button.getBoundingClientRect().height,
      visible: button.scrollWidth <= button.clientWidth + 1,
    }));
    assert(saveGeometry.height >= 48 && saveGeometry.visible, JSON.stringify(saveGeometry));
    if ((width === 320 || width === 1440) && height === 844) {
      await notePage.screenshot({ path: `/tmp/rollapp-note-tasks-review-${width}.png` });
    }
    assert.deepEqual(await notePage.evaluate(() => window.messengerTest.noteTaskWrites), []);
    assert.equal(await notePage.getByText('Отправить итог встречи.', { exact: true }).count(), 1);
    const mobile = width < 768;
    const close = mobile ? notePage.getByRole('button', { name: 'Назад', exact: true }) :
      notePage.getByRole('button', { name: 'Закрыть разбор заметки', exact: true });
    await secondTitle.fill('Отправить протокол');
    const date = notePage.getByRole('button', { name: /^Срок задачи 2:/ });
    await date.click();
    if (mobile) {
      await notePage.getByRole('heading', { name: 'Срок задачи 2', exact: true }).waitFor();
      await notePage.goBack();
      await secondTitle.waitFor();
    } else {
      await notePage.getByRole('combobox', { name: 'Месяц', exact: true }).waitFor();
      await notePage.keyboard.press('Escape');
    }
    assert.equal(await secondTitle.inputValue(), 'Отправить протокол');
    await instruction.fill('У второй задачи поставь срок на пятницу, первую убери');
    await notePage.getByRole('button', { name: 'Уточнить через ассистента' }).click();
    await notePage.getByText('Обновлены строки 1, 2.', { exact: true }).waitFor();
    assert.equal(await first.isChecked(), false);
    await notePage.getByRole('button', { name: 'Срок задачи 2: 20.11.2026', exact: true }).waitFor();
    await close.click();
    await review.click();
    assert.equal(await secondTitle.inputValue(), 'Отправить протокол');
    assert.equal(await first.isChecked(), false);
    await notePage.evaluate(() => { window.messengerTest.failNoteSave = true; });
    await save.click();
    await notePage.getByRole('alert').filter({ hasText: 'Ответ о сохранении потерян' }).waitFor();
    await notePage.evaluate(() => { window.messengerTest.failNoteSave = false; });
    await notePage.getByRole('button', { name: 'Повторить сохранение', exact: true }).click();
    const openTodo = notePage.getByRole('link', { name: 'Открыть To Do', exact: true });
    await openTodo.waitFor();
    const requests = await notePage.evaluate(() => window.messengerTest.noteTaskWrites);
    assert.equal(requests.length, 2);
    assert.deepEqual(requests[0], requests[1]);
    assert.deepEqual(requests[0].tasks, [{ row: 2, title: 'Отправить протокол', description: '', dueOn: '2026-11-20' }]);
    await openTodo.click();
    await notePage.getByRole('button', { name: 'Редактировать задачу: Отправить протокол', exact: true }).click();
    await notePage.getByRole('link', { name: 'Заметка «Встреча с Анной»', exact: true }).click();
    await source.waitFor();
    assert.deepEqual(unexpected, []);
    console.log(`PASS note tasks ${width}x${height}: source, review, SDK row actions, date picker, retry, To Do source link`);
  } catch (error) {
    console.error('Note tasks state:', await notePage.locator('body').ariaSnapshot());
    throw error;
  } finally {
    await notePage.close();
  }
}

async function checkWishlistSort(page, chat, text, send, width, height) {
  const back = chat.getByRole('button', { name: 'Все диалоги', exact: true });
  const starter = chat.getByRole('group', { name: 'Примеры запросов' })
    .getByRole('button', { name: 'Разобрать «Не отсортированные»', exact: true });
  await assistantRow(chat, 'Новый чат').click();
  await starter.click();
  assert.match(await text.inputValue(), /^Разбери «Не отсортированные»/);
  await send.click();
  const preview = chat.getByRole('region', { name: 'Разбор желаний' });
  await preview.getByRole('button', { name: 'Проверить распределение' }).click();
  const coffee = preview.getByRole('checkbox', { name: 'Кофемолка', exact: true });
  const light = preview.getByRole('checkbox', { name: 'Лампа', exact: true });
  const other = preview.getByRole('checkbox', { name: /^Очень длинное название/ });
  await coffee.waitFor();
  assert.equal(await coffee.isChecked(), true);
  assert.equal(await light.isChecked(), true);
  assert.equal(await other.isChecked(), false);
  assert.deepEqual(await page.evaluate(() => window.messengerTest.sortWrites), []);
  const select = preview.getByRole('combobox', { name: 'Список для «Кофемолка»', exact: true });
  assert.equal(await select.locator('[data-slot="select-value"]').textContent(), 'Кухня');
  await select.click();
  await page.getByRole('option', { name: 'Воркспейс · закрытый', exact: true }).click();
  assert.equal(await select.locator('[data-slot="select-value"]').textContent(), 'Воркспейс · закрытый');
  await light.click();
  assert.equal(await light.isChecked(), false);
  const apply = preview.getByRole('button', { name: 'Перенести выбранные (1)', exact: true });
  await apply.scrollIntoViewIfNeeded();
  const geometry = await preview.evaluate(node => {
    const history = node.closest('[role="log"]');
    return { history: [history.clientWidth, history.scrollWidth], controls:
      Array.from(node.querySelectorAll('[role="combobox"],button[type="submit"]'), control =>
        ({ height: control.offsetHeight, client: control.clientWidth, scroll: control.scrollWidth, text: control.textContent })) };
  });
  assert(geometry.history[1] <= geometry.history[0] + 1 &&
    geometry.controls.every(control => control.height >= 48 && control.scroll <= control.client + 1),
  `Wishlist sort review must fit the chat at ${width}×${height}: ${JSON.stringify(geometry)}`);
  if ((width === 1440 || width === 390 || width === 320) && height === 844) {
    await page.screenshot({ path: `/tmp/rollapp-wishlist-sort-${width}.png` });
  }
  await page.evaluate(() => { window.messengerTest.failSort = true; });
  await apply.click();
  await preview.getByRole('alert').filter({ hasText: 'Желания или списки изменились' }).waitFor();
  assert.equal(await coffee.isChecked(), true);
  assert.equal(await light.isChecked(), false);
  assert.equal(await select.locator('[data-slot="select-value"]').textContent(), 'Воркспейс · закрытый');
  await back.click();
  await assistantRow(chat, 'Новый чат').click();
  await back.click();
  await assistantRow(chat, /^Разбери «Не отсортированные»/).click();
  await preview.getByRole('alert').filter({ hasText: 'Желания или списки изменились' }).waitFor();
  await page.evaluate(() => { window.messengerTest.failSort = false; });
  await apply.click();
  await preview.getByRole('status').filter({ hasText: 'Перенесено 1 желание.' }).waitFor();
  const expected = { moves: [{ wishId: 'coffee', listId: 'workspace' }] };
  assert.deepEqual(await page.evaluate(() => window.messengerTest.sortWrites), [expected, expected]);

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

function assistantRow(chat, name) {
  return chat.getByRole('group',{name:'Чаты ассистента'}).getByRole('button',{name,exact:typeof name==='string'});
}

async function assertAssistantDirectory(chat, count) {
  const list=chat.getByRole('group',{name:'Чаты ассистента'});
  await list.waitFor();
  assert.equal(await list.getByRole('button').first().innerText(),'Новый чат');
  if(count!==undefined) assert.equal(await list.getByRole('button').count(),count);
  assert.equal(await chat.getByRole('textbox',{name:'Сообщение'}).count(),0);
  assert.equal(await chat.getByRole('menu').count(),0);
}

async function checkParallelChats(page, chat, text, close, openAssistant, width, height) {
  const back=chat.getByRole('button',{name:'Все диалоги',exact:true});
  const create=assistantRow(chat,'Новый чат');
  const send=chat.getByRole('button',{name:'Отправить сообщение',exact:true});
  const mic=chat.getByRole('button',{name:'Диктовка',exact:true});
  const history=chat.getByRole('log',{name:'История сообщений'});
  const first=/^Что у меня в планах\?/;
  const slow='Длинный план отдельной встречи '.repeat(4).trim();
  const fast='Короткий ответ в третьем чате';
  const initialRequests=await page.evaluate(()=>window.messengerTest.assistant.length);
  await holdAssistantReplies(page,slow,fast);

  await back.click();
  await assertAssistantDirectory(chat,2);
  await create.click();
  assert.equal(await history.locator('article').count(),0);
  assert.equal(await text.inputValue(),'');
  await text.fill(slow);
  await mic.click();
  await back.click();
  assert.equal(await page.evaluate(()=>window.messengerTest.speech.aborted),true);
  await page.evaluate(()=>{
    const result=Object.assign([{transcript:'Поздняя диктовка'}],{isFinal:true});
    window.messengerTest.speech.onresult({resultIndex:0,results:[result]});
  });
  await create.click();
  assert.equal(await text.inputValue(),'');
  await text.fill(fast);
  await back.click();
  await assistantRow(chat,/^Чат 2 Черновик:/).click();
  assert.equal(await text.inputValue(),slow);
  await text.press('Control+Enter');
  await history.getByText('Ассистент готовит ответ…').waitFor();
  assert.equal(await text.getAttribute('readonly'),'');
  await text.press('Control+Enter');

  await back.click();
  await assistantRow(chat,/^Чат 3 Черновик:/).click();
  assert.equal(await text.inputValue(),fast);
  await send.click();
  await history.getByText('Ассистент готовит ответ…').waitFor();
  assert.equal(await page.evaluate(()=>window.messengerTest.assistant.length),initialRequests+2);
  assert.deepEqual(await page.evaluate(()=>window.messengerTest.assistant.slice(-2).map(request=>request.messages)),[
    [{role:'user',content:slow}],
    [{role:'user',content:fast}],
  ]);
  await back.click();
  await assertAssistantDirectory(chat,4);
  await assistantRow(chat,/^Длинный план.*Готовится ответ$/).waitFor();
  await assistantRow(chat,/^Короткий ответ.*Готовится ответ$/).click();
  await close.click();
  await chat.waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>[...window.messengerTest.assistantHolds.values()].some(hold=>hold.signal.aborted)),false);
  await finishAssistantReply(page,fast,{reply:'Третий чат ответил первым'});
  await openAssistant();
  const list=chat.getByRole('group',{name:'Чаты ассистента'});
  const slowItem=assistantRow(chat,/^Длинный план.*Готовится ответ$/);
  const fastItem=assistantRow(chat,/^Короткий ответ.*Новый ответ$/);
  await fastItem.waitFor();
  const box=await list.boundingBox();
  assert(box.x>=0 && box.x+box.width<=width && box.y>=0 && box.y+box.height<=height,
    `Chat list escaped viewport: ${JSON.stringify(box)}`);
  assert.equal(await slowItem.evaluate(node=>node.scrollWidth>node.clientWidth),false);
  if(width===1440 || width===390 || width===320) await page.screenshot({path:`/tmp/rollapp-assistant-chats-${width}-${height}.png`,animations:'disabled'});
  await fastItem.press('Space');
  await history.getByText('Третий чат ответил первым',{exact:true}).waitFor();
  assert.equal(await mic.getAttribute('aria-pressed'),'false','Selecting a chat with Space started dictation');
  await finishAssistantReply(page,slow,{error:'Ошибка медленного запроса'});
  assert.equal(await chat.getByRole('alert').count(),0);
  await back.click();
  await assistantRow(chat,/^Короткий ответ.*Третий чат ответил первым$/).waitFor();
  await assistantRow(chat,/^Длинный план.*Ошибка отправки$/).click();
  await chat.getByRole('alert').filter({hasText:'Ошибка медленного запроса'}).waitFor();
  assert.equal(await text.inputValue(),slow);
  await send.click();
  await history.getByText('Личный ответ о планировании',{exact:true}).waitFor();
  assert.equal(await history.locator('article').count(),2);
  assert.equal(await text.inputValue(),'');
  await back.click();
  await assistantRow(chat,first).click();
  assert.equal(await history.getByText('Третий чат ответил первым',{exact:true}).count(),0);
}

async function checkAssistantAccountSwitch(page, chat) {
  await assertAssistantDirectory(chat, 1);
  await assistantRow(chat, 'Новый чат').click();
  await chat.getByRole('button', { name: 'Пресеты запросов', exact: true }).click();
  const presets = page.getByRole('menu', { name: 'Пресеты запросов', exact: true });
  const spherePresets = [['Здоровье', 'Поставить тренировки в календарь'], ['Образование', 'Разложить курс по календарю'], ['Карьера', 'Превратить пункт ИПР в задачи']];
  for (const [sphere, name] of spherePresets) {
    await presets.getByRole('group', { name: sphere, exact: true }).getByRole('menuitem', { name, exact: true }).waitFor();
  }
  await page.keyboard.press('Escape');
  await presets.waitFor({ state: 'hidden' });
  await chat.getByRole('button',{name:'Все диалоги',exact:true}).click();
  const prompts=['Первый незавершённый запрос','Второй незавершённый запрос'];
  await holdAssistantReplies(page,...prompts);
  const text=chat.getByRole('textbox',{name:'Сообщение',exact:true});
  for(const prompt of prompts){
    await assistantRow(chat,'Новый чат').click();
    await text.fill(prompt);
    await text.press('Control+Enter');
    await chat.getByText('Ассистент готовит ответ…').waitFor();
    await chat.getByRole('button',{name:'Все диалоги',exact:true}).click();
  }
  await assistantRow(chat,'Новый чат').click();
  await text.fill('Черновик другого аккаунта');
  await page.evaluate(()=>window.messengerTest.switchAccount('other'));
  await assertAssistantDirectory(chat,1);
  assert.equal(await page.evaluate(()=>[...window.messengerTest.assistantHolds.values()].every(hold=>hold.signal.aborted)),true);
  for(const prompt of prompts) await finishAssistantReply(page,prompt,{reply:'Поздний ответ другого аккаунта'});
  await assistantRow(chat,'Новый чат').click();
  assert.equal(await text.inputValue(),'');
  assert.equal(await chat.getByText('Поздний ответ другого аккаунта').count(),0);
  await chat.getByRole('button', { name: 'Пресеты запросов', exact: true }).click();
  await presets.waitFor();
  assert.equal(await presets.getByRole('menuitem').count(), 9);
  for (const [sphere] of spherePresets) {
    assert.equal(await presets.getByRole('group', { name: sphere, exact: true }).count(), 0);
  }
  await page.keyboard.press('Escape');
}

async function checkDictation(page, chat, text, send, conversationHeading, close, resume) {
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
  await conversationHeading.focus();
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
  await resume(/^Чат 1 Черновик:/);
  assert.equal(await text.inputValue(),'Напомни про встречу');
  await text.fill('');
}
