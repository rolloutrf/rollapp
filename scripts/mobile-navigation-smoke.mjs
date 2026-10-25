import { listenSmokeServer, smokePort, smokeOrigin } from "./smoke-server.mjs";
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import {browserLaunchOptions} from './browser-runtime.mjs';
const server=await createServer({cacheDir:'node_modules/.vite-navigation-smoke',server:{host:'127.0.0.1',port: smokePort(),strictPort: true,hmr:false,watch:null},plugins:[{
 name:'navigation-fixture',enforce:'pre',transform(source,id){if(id.endsWith('/src/App.jsx?navigation-smoke'))return source+'\nexport {GlobalAppChrome,PlanningFab,SessionContext,ToastContext,CollectionNavigationContext};';},
 configureServer(vite){vite.middlewares.use(async(req,res,next)=>{if(!req.url.startsWith('/app/'))return next();res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml(req.url,'<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/mobile-navigation.jsx"></script></body></html>'));});}
}]});
await listenSmokeServer(server);
const origin = smokeOrigin(server);
const browser=await chromium.launch(browserLaunchOptions());
async function settle(popup){await popup.evaluate(async element=>{await Promise.all(element.getAnimations({subtree:true}).map(animation=>animation.finished.catch(()=>{})));});}
try{
 // JS navigation must follow CSS even if the browser reports a different
 // innerWidth. Exercise the initial render and both breakpoint transitions.
 const viewportPage=await browser.newPage({viewport:{width:393,height:844}});
 try{
  await viewportPage.addInitScript(()=>Object.defineProperty(window,'innerWidth',{configurable:true,get:()=>980}));
  await viewportPage.route('**/api/**',()=>{throw new Error('Unexpected API request');});
  await viewportPage.goto(`${origin}/app/spheres/career?tab=about`);
  await viewportPage.locator('.mobile-app-navigation').waitFor();
  for(const width of [393,820,390]){
   await viewportPage.setViewportSize({width,height:844});
   await viewportPage.waitForFunction(mobile=>Boolean(document.querySelector('.mobile-app-navigation'))===mobile,width<768);
   assert.equal(await viewportPage.locator('.global-app-chrome .sphere-switcher__trigger').count(),width<768?0:1);
   assert.equal(await viewportPage.locator('.global-app-chrome .global-service-select').count(),width<768?0:1);
  }
  console.log('PASS CSS media viewport owns initial mobile navigation and breakpoint transitions when innerWidth differs');
 }finally{await viewportPage.close();}
 for(const width of [320,390,640,767,768,820,1024,1440,1920]){
  const page=await browser.newPage({viewport:{width,height:width===820?414:844}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',route=>{errors.push('Unexpected API request');return route.abort();});
  for(const route of ['/app/spheres/career?tab=about','/app/wishes?tab=products','/app/spheres/identity?tab=ideal-state','/app/spheres/health?tab=medications','/app/wishes?guest=1']){
   await page.goto(origin+route);
   const sphere=page.getByRole('button',{name:'Открыть переключатель сфер',exact:true}),select=page.locator('.global-service-select');await sphere.waitFor();
   assert.equal(await sphere.count(),1);assert.equal(await select.count(),1);
   for(const dark of [true,false]){
    await page.evaluate(value=>document.documentElement.classList.toggle('dark',value),dark);
    const surface=await page.locator('.global-app-chrome').evaluate(element=>{
     const css=getComputedStyle(element);
     return {background:css.backgroundColor,image:css.backgroundImage,shadow:css.boxShadow,blur:css.backdropFilter,borders:[css.borderTopWidth,css.borderRightWidth,css.borderBottomWidth,css.borderLeftWidth]};
    });
    assert.deepEqual(surface,{background:'rgba(0, 0, 0, 0)',image:'none',shadow:'none',blur:'none',borders:['0px','0px','0px','0px']},`${route}: header must have no shared surface (${width}px, dark=${dark})`);
   }
   await page.evaluate(()=>document.documentElement.classList.add('dark'));
   const s=await sphere.boundingBox(),c=await select.boundingBox();
   if(width<768){
    assert(s.y>600&&c.y>600,`${route}: navigation stayed at top`);
    assert.equal(s.height,48);assert.equal(c.height,48);assert(Math.abs(s.y-c.y)<1);
    assert(s.x+s.width<=c.x&&c.x+c.width<=width-16,`${route}: controls overlap`);
    assert.equal(await page.locator('.global-app-chrome .sphere-switcher__trigger,.global-app-chrome .global-service-select').count(),0);
    const planner=page.getByRole('button',{name:'Открыть планирование',exact:true});
    if(!route.includes('guest')){const p=await planner.boundingBox();assert(Math.abs(p.y-c.y)<1&&c.x+c.width<=p.x-7,'Planner overlaps navigation');}
    await select.click();const popup=page.locator('[data-slot="select-content"]');await popup.waitFor();
    await settle(popup);
    const p=await popup.boundingBox();assert(p.y>=0&&p.y+p.height<=c.y+1,`${route}: select does not open above dock`);
    const inset=width<=640?16:24;
    assert(Math.abs(p.x-inset)<1&&Math.abs(p.width-(width-2*inset))<1,`${route}: section popup not full width ${JSON.stringify(p)}`);
    await page.keyboard.press('Escape');
    await sphere.click();const menu=page.locator('.sphere-switcher__panel');await menu.waitFor();
    await settle(menu);
    const m=await menu.boundingBox();assert(m.y>=0&&m.y+m.height<=s.y+1,`${route}: sphere popup clipped`);
    assert(Math.abs(m.x-inset)<1&&Math.abs(m.width-(width-2*inset))<1,`${route}: sphere popup not full width ${JSON.stringify(m)}`);
    await page.keyboard.press('Escape');
    if(!route.includes('guest')){
     await planner.click();const planningMenu=page.locator('.planning-fab__panel');await planningMenu.waitFor();await settle(planningMenu);
     const p=await planningMenu.boundingBox();
     assert(Math.abs(p.x-inset)<1&&Math.abs(p.width-(width-2*inset))<1,`${route}: planning menu not full width ${JSON.stringify(p)}`);
     assert(p.y>=0&&p.y+p.height<=c.y+1,`${route}: planning menu clipped`);
     await page.keyboard.press('Escape');
    }
    await page.evaluate(()=>scrollTo({top:document.documentElement.scrollHeight,behavior:"instant"}));
    const last=await page.locator('[data-last-action]').boundingBox();assert(last.y+last.height<=s.y,`${route}: last action hidden behind dock`);
    if(width===390&&route.includes('career'))await page.screenshot({path:'/tmp/rollapp-mobile-navigation.png'});
    if(route.includes('career')){
     await page.getByRole('button',{name:'Открыть форму',exact:true}).click();await page.locator('[data-mobile-form-page]:visible').waitFor();
     assert.equal(await page.locator('.mobile-app-navigation:visible,.planning-fab-controls:visible').count(),0,'Navigation remains above native form');
     await page.getByRole('button',{name:'Назад',exact:true}).click();await page.locator('.mobile-app-navigation').waitFor();
    }
   }else assert(s.y<100&&c.y<100,`${route}: desktop navigation moved`);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${route}: horizontal overflow`);
   console.log(`PASS ${width} ${route}: ${width<768?'bottom navigation, menus, scroll tail':'desktop header'}`);
  }
  if(width<768){
   await page.goto(`${origin}/app/spheres/career?tab=about`);
   await page.locator('.mobile-app-navigation').waitFor();
   await page.evaluate(()=>document.documentElement.style.setProperty('--tg-content-safe-area-inset-bottom','34px'));
   const safe=await page.locator('.mobile-app-navigation').boundingBox();assert.equal(safe.y+safe.height,794,'Navigation ignored lower safe area');
   await page.evaluate(()=>{
    Object.defineProperty(visualViewport,'height',{configurable:true,get:()=>471});visualViewport.dispatchEvent(new Event('resize'));
   });
   await page.waitForFunction(()=>document.documentElement.hasAttribute('data-overlay-keyboard'));
   const keyboard=await page.locator('.mobile-app-navigation').boundingBox();assert.equal(keyboard.y+keyboard.height,455,'Navigation must sit 16px above keyboard');
   await page.evaluate(()=>{delete visualViewport.height;document.documentElement.style.removeProperty('--tg-content-safe-area-inset-bottom');visualViewport.dispatchEvent(new Event('resize'));});
   await page.setViewportSize({width,height:360});
   await page.getByRole('button',{name:'Открыть переключатель сфер',exact:true}).click();
   await settle(page.locator('.sphere-switcher__panel'));
   const m=await page.locator('.sphere-switcher__panel').boundingBox();assert(m.y>=0&&m.y+m.height<=360,'Short-viewport menu clipped');
  }
  assert.deepEqual(errors,[]);await page.close();
 }
}finally{await browser.close();await server.close();}
