import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { listenSmokeServer, smokePort, smokeOrigin } from './smoke-server.mjs';
import { browserLaunchOptions } from './browser-runtime.mjs';
const server = await createServer({ cacheDir: 'node_modules/.vite-page-scrollers', server: { host: '127.0.0.1', port: smokePort(), strictPort: true, hmr: false, watch: null }, plugins: [{ name: 'page-scrollers', configureServer(vite) { vite.middlewares.use(async (req,res,next) => {
  if (!req.url.startsWith('/__page-scrollers')) return next();
  res.setHeader('Content-Type','text/html');
  res.end(await vite.transformIndexHtml(req.url, '<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/page-scrollers.jsx"></script></body></html>'));
}); } }] });
await listenSmokeServer(server);
const browser = await chromium.launch(browserLaunchOptions());
try {
 for (const width of [320,390,640,767,768,820,1024,1440,1920]) for (const variant of ['reports','wishlist','groups','talents']) for (const count of [1,2,12]) {
  const page = await browser.newPage({ viewport: {width,height:width===820?414:844} });
  const errors=[];
  page.on('pageerror', e=>errors.push(e.message));
  await page.route('**/api/**',r=>{errors.push('Unexpected API request');return r.abort();});
  await page.goto(`${smokeOrigin(server)}/__page-scrollers?variant=${variant}&count=${count}`);
  const rail=page.locator('[data-tab-scroller], [data-wishlist-list-navigation], [data-group-navigation] .list-tabs, .page-edge-scroller');
  await rail.waitFor(); await page.evaluate(()=>document.fonts.ready);
  const measure=()=>rail.evaluate(el=>{
   const r=el.getBoundingClientRect(), buttons=[...el.querySelectorAll('button')], first=buttons[0].getBoundingClientRect(),last=buttons.at(-1).getBoundingClientRect();
   const clips=[];
   for(let a=el.parentElement;a;a=a.parentElement){const s=getComputedStyle(a),b=a.getBoundingClientRect();if(['hidden','clip','auto','scroll'].includes(s.overflowX)&&(b.left>r.left+1||b.right<r.right-1))clips.push(a.className);}
   return {left:r.left,right:r.right,first:first.left,last:last.right,scroll:el.scrollLeft,max:el.scrollWidth-el.clientWidth,clips,overflow:document.documentElement.scrollWidth>innerWidth+1,copy:document.querySelector('[data-copy]').getBoundingClientRect().left};
  });
  await rail.evaluate(el=>{el.scrollLeft=0;});
  let m=await measure();
  assert(!m.overflow,`${width}/${variant}: root overflow`);
  assert.deepEqual(m.clips,[],`${width}/${variant}: ancestor clips viewport`);
  if(width<=820){
   assert(Math.abs(m.left)<1&&Math.abs(m.right-width)<1,`${width}/${variant}: inset viewport ${JSON.stringify(m)}`);
   assert(m.copy>=16,'copy lost page inset');
   if(m.max>1){
    const gutter=width<=640?16:24;
    assert(Math.abs(m.first-gutter)<1,`${width}/${variant}: first item unreachable`);
    await rail.evaluate(el=>{el.scrollLeft=64;});m=await measure();
    if(m.max>64)assert(m.first<0,`${width}/${variant}: item clipped before screen edge`);
    if(width===390&&variant==='reports'&&count===12)await page.screenshot({path:'/tmp/rollapp-page-scrollers-390.png'});
    await rail.evaluate(el=>{el.scrollLeft=el.scrollWidth;});m=await measure();
    assert(Math.abs(m.last-(width-gutter))<1,`${width}/${variant}: last item unreachable ${JSON.stringify(m)}`);
   }
  }
  assert.deepEqual(errors,[]);
  console.log(`PASS ${width} ${variant} ${count}: viewport, clipping, scroll endpoints`);
  await page.close();
 }
} finally {await browser.close();await server.close();}
