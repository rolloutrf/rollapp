import { listenSmokeServer, smokePort, smokeOrigin } from "./smoke-server.mjs";
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { browserLaunchOptions } from './browser-runtime.mjs';
const server=await createServer({cacheDir:"node_modules/.vite-mobile-page-smoke",server:{host:'127.0.0.1',port: smokePort(),strictPort: true,hmr:false,watch:null},plugins:[{
  name:'mobile-page-fixture',enforce:'pre',
  transform(source,id){if(id.includes('/src/App.jsx?mobile-page-test-export'))return `${source}\nexport { CatalogWishDetailsContent, SessionContext, WishCatalogPage };`;},
  configureServer(vite){vite.middlewares.use(async(req,res,next)=>{if(!req.url.startsWith('/__mobile-page-smoke'))return next();res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml(req.url,'<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/mobile-catalog-page.jsx"></script></body></html>'));});}
}]});
await listenSmokeServer(server);
const origin = smokeOrigin(server);
const browser=await chromium.launch(browserLaunchOptions());

const feedUrl = `${origin}/__mobile-page-smoke/feed`;
const scrollNearFeedEnd = (page) => page.locator('.catalog-wish-grid').evaluate((grid) => {
  const top = scrollY + grid.getBoundingClientRect().bottom - innerHeight - 200;
  scrollTo({ top, behavior: 'instant' });
  return scrollY;
});
const requestOffsets = (page) => page.evaluate(() => catalogFeedTest.requests.map(({ offset }) => offset));
const waitForCard = (page, number) => page.getByRole('heading', { name: `Карточка каталога ${number}`, exact: true }).waitFor();
const cardCount = (page) => page.locator('.catalog-wish-card').count();

async function checkCatalogFeed(page, width) {
  await page.goto(feedUrl);
  await waitForCard(page, 48);
  const first = await page.locator('.catalog-wish-card').first().elementHandle();
  assert.deepEqual(await requestOffsets(page), [0]);
  assert.equal(await page.getByRole('button', { name: 'Показать ещё' }).count(), 0);

  await page.evaluate(() => { catalogFeedTest.holdNext = true; });
  const top = await scrollNearFeedEnd(page);
  await page.getByText('Загружаем карточки каталога').waitFor();
  assert(await page.locator('.catalog-wish-grid').evaluate((grid) => grid.getBoundingClientRect().bottom > innerHeight));
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await scrollNearFeedEnd(page);
  assert.deepEqual(await requestOffsets(page), [0, 48]);
  await page.evaluate(() => catalogFeedTest.release());
  await waitForCard(page, 96);
  assert.equal(await cardCount(page), 96);
  assert(await first.evaluate((node) => node.isConnected), 'Earlier cards must stay mounted');
  assert.equal(await page.evaluate(() => scrollY), top, 'Appending must preserve scroll position');

  await page.evaluate(() => { catalogFeedTest.failNext = true; });
  await scrollNearFeedEnd(page);
  await page.getByText('Временная ошибка каталога').waitFor();
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await scrollNearFeedEnd(page);
  assert.equal(await cardCount(page), 96);
  assert.deepEqual(await requestOffsets(page), [0, 48, 96]);
  await page.getByRole('button', { name: 'Повторить' }).click();
  await waitForCard(page, 103);
  await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
  assert.equal(await cardCount(page), 103);
  assert.equal(await page.locator('.wish-catalog-page__more').count(), 0);
  assert.equal(await page.getByRole('alert').count(), 0);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(await requestOffsets(page), [0, 48, 96, 96]);
  if (width === 390 || width === 1440) await page.screenshot({ path: `/tmp/rollapp-catalog-feed-${width}.png` });
}

try{
 for(const width of [320,390,768,820,1024,1440,1920]){
  const page=await browser.newPage({viewport:{width,height:width===820?450:844}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',route=>{errors.push('Unexpected API request in UI fixture');return route.abort();});
  await page.goto(`${origin}/__mobile-page-smoke`);
  await page.getByRole('link',{name:'Открыть карточку'}).click();
  await page.getByRole('heading',{name:'Позиция каталога: Карточка места'}).waitFor();
  assert(page.url().endsWith('/item/fixture'));
  assert.equal(await page.locator('[data-slot="drawer-popup"], [role="dialog"], [aria-modal="true"]').count(),0);
  assert(await page.evaluate(()=>getComputedStyle(document.documentElement).overflow!=='hidden'));
  if(width<768){const back=await page.getByRole('button',{name:'Назад: Каталог'}).boundingBox();assert.equal(back.height,48);assert(back.y>700,'Detail Back remains at the top');}
  await page.evaluate(()=>scrollTo({top:1000,behavior:"instant"}));assert(await page.evaluate(()=>scrollY)>0);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  if(width<768){
    await page.evaluate(()=>scrollTo({top:document.documentElement.scrollHeight,behavior:"instant"}));
    const content=await page.locator('.app-drawer-body').boundingBox(),back=await page.getByRole('button',{name:'Назад: Каталог'}).boundingBox();
    assert(content.y+content.height<=back.y+1,'Detail content cannot scroll above Back');
  }
  await page.reload();await page.getByRole('heading',{name:'Позиция каталога: Карточка места'}).waitFor();
  if(width===390){await page.evaluate(()=>scrollTo({top:0,behavior:"instant"}));await page.screenshot({path:'/tmp/rollapp-native-catalog-page.png'});}
  await page.getByRole('button',{name:'Назад: Каталог'}).click();
  await page.getByRole('link',{name:'Открыть карточку'}).waitFor();
  await checkCatalogFeed(page, width);
  assert.deepEqual(errors,[]);
  console.log(`PASS ${width}: detail route, reload and Back; catalog scroll, append, retry and end`);
  await page.close();
 }

 const page = await browser.newPage({ viewport: { width: 390, height: 400 } });
 const unexpected = [];
 page.on('pageerror', (error) => unexpected.push(error.message));
 await page.route('**/api/**', (route) => { unexpected.push('Unexpected API request'); return route.abort(); });
 await page.goto(feedUrl);
 await waitForCard(page, 48);
 await page.evaluate(() => { catalogFeedTest.holdNext = true; });
 await scrollNearFeedEnd(page);
 await page.getByText('Загружаем карточки каталога').waitFor();
 await page.getByRole('link', { name: 'Открыть бренд' }).click();
 await page.getByRole('heading', { name: 'Карточка бренда' }).waitFor();
 await page.evaluate(() => catalogFeedTest.release());
 await page.waitForFunction(() => catalogFeedTest.requests.length === 3);
 assert.deepEqual(await page.evaluate(() => catalogFeedTest.requests), [
   { offset: 0, brand: null }, { offset: 48, brand: null }, { offset: 0, brand: 'fixture' },
 ]);
 assert.equal(await cardCount(page), 1, 'An earlier response must not append to the new filter');

 await page.goto(feedUrl);
 await waitForCard(page, 48);
 await page.evaluate(() => { catalogFeedTest.emptyNext = true; });
 await scrollNearFeedEnd(page);
 await page.waitForFunction(() => catalogFeedTest.requests.length === 2 && !document.querySelector('.wish-catalog-page__more'));
 assert.equal(await cardCount(page), 48);
 assert.deepEqual(await requestOffsets(page), [0, 48], 'An empty page must not request the same offset again');
 assert.deepEqual(unexpected, []);
 await page.close();

 const fallback = await browser.newPage({ viewport: { width: 390, height: 400 } });
 await fallback.addInitScript(() => { window.IntersectionObserver = undefined; });
 await fallback.route('**/api/**', (route) => { unexpected.push('Unexpected API request'); return route.abort(); });
 await fallback.goto(feedUrl);
 await waitForCard(fallback, 48);
 await scrollNearFeedEnd(fallback);
 assert.deepEqual(await requestOffsets(fallback), [0]);
 await fallback.getByRole('button', { name: 'Показать ещё' }).click();
 await waitForCard(fallback, 96);
 assert.deepEqual(await requestOffsets(fallback), [0, 48]);
 assert.deepEqual(unexpected, []);
 await fallback.close();
 console.log('PASS 390×400: catalog filter switch, empty page and manual fallback');
}finally{await browser.close();await server.close();}
