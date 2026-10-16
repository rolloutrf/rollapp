import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { browserLaunchOptions } from './browser-runtime.mjs';
const server=await createServer({cacheDir:"node_modules/.vite-mobile-page-smoke",server:{host:'127.0.0.1',port:5188,strictPort:true,hmr:false,watch:null},plugins:[{
  name:'mobile-page-fixture',enforce:'pre',
  transform(source,id){if(id.includes('/src/App.jsx?mobile-page-test-export'))return `${source}\nexport { CatalogWishDetailsContent };`;},
  configureServer(vite){vite.middlewares.use(async(req,res,next)=>{if(!req.url.startsWith('/__mobile-page-smoke'))return next();res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml(req.url,'<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/mobile-catalog-page.jsx"></script></body></html>'));});}
}]});
await server.listen();
const browser=await chromium.launch(browserLaunchOptions());
try{
 for(const width of [320,390,768,820,1024,1440,1920]){
  const page=await browser.newPage({viewport:{width,height:width===820?450:844}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',route=>{errors.push('Unexpected API request in UI fixture');return route.abort();});
  await page.goto('http://127.0.0.1:5188/__mobile-page-smoke');
  await page.getByRole('link',{name:'Открыть карточку'}).click();
  await page.getByRole('heading',{name:'Позиция каталога: Карточка места'}).waitFor();
  assert(page.url().endsWith('/item/fixture'));
  assert.equal(await page.locator('[data-slot="drawer-popup"], [role="dialog"], [aria-modal="true"]').count(),0);
  assert(await page.evaluate(()=>getComputedStyle(document.documentElement).overflow!=='hidden'));
  if(width<768){const back=await page.getByRole('button',{name:'Назад: Каталог'}).boundingBox();assert.equal(back.height,48);assert(back.y>700,'Detail Back remains at the top');}
  await page.evaluate(()=>scrollTo(0,1000));assert(await page.evaluate(()=>scrollY)>0);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  if(width<768){
    await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
    const content=await page.locator('.app-drawer-body').boundingBox(),back=await page.getByRole('button',{name:'Назад: Каталог'}).boundingBox();
    assert(content.y+content.height<=back.y+1,'Detail content cannot scroll above Back');
  }
  await page.reload();await page.getByRole('heading',{name:'Позиция каталога: Карточка места'}).waitFor();
  if(width===390){await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'/tmp/rollapp-native-catalog-page.png'});}
  await page.getByRole('button',{name:'Назад: Каталог'}).click();
  await page.getByRole('link',{name:'Открыть карточку'}).waitFor();
  assert.deepEqual(errors,[]);
  console.log(`PASS ${width}: route, native scroll, reload, Back, no Drawer`);
  await page.close();
 }
}finally{await browser.close();await server.close();}
