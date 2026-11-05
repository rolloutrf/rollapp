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
 for(const [width,height] of [[320,844],[390,844],[768,844],[820,844],[1024,844],[1440,844],[1920,844],[390,400],[1440,400]]){
  const page=await browser.newPage({viewport:{width,height}});const errors=[];activePage=page;let navigations=0;page.on('request',request=>{if(request.isNavigationRequest() && request.frame()===page.mainFrame())navigations++;});
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/**',route=>{errors.push('Unexpected production API request');return route.abort();});
  await page.goto(`${smokeOrigin(server)}/app/wishes`,{waitUntil:'networkidle'});
  const launcher=await page.getByRole(width<768?'link':'button',{name:'Открыть сообщения',exact:true}).boundingBox();
  const planning=await page.getByRole('button',{name:'Открыть планирование',exact:true}).boundingBox();
  assert.equal(planning.y-(launcher.y+launcher.height),8,'Messenger must sit exactly 8px above planning');
  assert.equal(launcher.x,planning.x);assert.equal(launcher.width,48);assert.equal(launcher.height,48);
  await page.getByRole(width<768?'link':'button',{name:'Открыть сообщения',exact:true}).click();
  await page.getByRole('searchbox',{name:'Найти участника'}).waitFor();
  if(width===1440) await page.screenshot({path:`/tmp/rollapp-messenger-directory-${width}-${height}.png`});
  await page.getByRole('searchbox',{name:'Найти участника'}).fill('none');
  await page.getByText('Участники не найдены',{exact:true}).waitFor();
  await page.getByRole('searchbox').fill('Александра');
  await page.getByRole('button',{name:/Александра/}).click();
  if(width<768) await page.waitForURL(`**/app/messenger/${cid}`);
  else {
    assert.equal(new URL(page.url()).pathname,'/app/wishes','Popup navigated away from source');
    const box=await page.locator('.messenger-popup').boundingBox();
    assert(box.width<=448 && box.height<=576 && box.x>=0 && box.y>=0 && box.y+box.height<=height,'Popup is not compact/in bounds');
    assert.equal(await page.locator('.messenger-directory').isVisible(),false,'Chat must replace directory');
  }
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
  await page.getByRole(width<768?'link':'button',{name:'Все диалоги',exact:true}).click();
  await page.getByRole(width<768?'link':'button',{name:/Александра/}).click();
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
  await page.getByRole(width<768?'link':'button',{name:'Все диалоги',exact:true}).click();
  await page.getByRole(width<768?'link':'button',{name:/Александра/}).click();
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
  await page.getByRole(width<768?'link':'button',{name:'Все диалоги',exact:true}).click();
  await page.evaluate(()=>{window.messengerTest.failHistory=true;});
  await page.getByRole(width<768?'link':'button',{name:/Александра/}).click();
  await page.getByRole('alert').filter({hasText:'История недоступна'}).waitFor();
  await page.evaluate(()=>{window.messengerTest.failHistory=false;});
  await page.getByRole('button',{name:'Повторить',exact:true}).click();
  await page.locator('.messenger-message').last().waitFor();
  assert.equal(await page.getByRole('alert').count(),0);
  if(width===390 && height===400){
    await page.evaluate(()=>{document.documentElement.style.setProperty('--app-visual-height','260px');document.documentElement.style.setProperty('--app-visual-top','50px');});
    const compact=await page.getByRole('button',{name:'Отправить сообщение',exact:true}).boundingBox();
    assert(compact.y>=50 && compact.y+compact.height<=310,'Composer escaped panned viewport');
    await page.evaluate(()=>{document.documentElement.style.removeProperty('--app-visual-height');document.documentElement.style.removeProperty('--app-visual-top');});
  }
  if(width>=768){
    await page.getByRole('button',{name:'Закрыть сообщения',exact:true}).click();
    await page.locator('.messenger-popup').waitFor({state:'hidden'});
    const trigger=page.getByRole('button',{name:'Открыть сообщения',exact:true});
    await trigger.click();
    await page.getByRole('searchbox').waitFor();
    assert.equal(await page.locator('.messenger-directory').isVisible(),true);
    await page.keyboard.press('Escape');
    await page.locator('.messenger-popup').waitFor({state:'hidden'});
    assert(await trigger.evaluate(node=>node===document.activeElement),'Escape did not restore trigger focus');
    await trigger.click();
    await page.mouse.click(8,height-8);
    await page.locator('.messenger-popup').waitFor({state:'hidden'});
    assert.equal(new URL(page.url()).pathname,'/app/wishes');
  }
  assert.equal(navigations,1,'Fixture document reloaded during the interaction');
  if(width===1440 && height===844){
    await page.goto(`${smokeOrigin(server)}/app/messenger/${cid}`,{waitUntil:'networkidle'});
    await page.locator('.messenger-popup .messenger-message').last().waitFor();
    assert.equal(new URL(page.url()).pathname,'/app/wishes','Desktop deep link must open popup on source page');
  }
  assert.deepEqual(errors,[]);console.log(`PASS messenger ${width}x${height}: search, chat, history, retry/idempotency, draft, plain text, error/retry, controls, overflow`);await page.close();
 }
}catch(error){if(activePage)console.error(JSON.stringify(smokeBrowserDiagnostics(activePage)));throw error;}finally{await browser.close();await server.close();}
