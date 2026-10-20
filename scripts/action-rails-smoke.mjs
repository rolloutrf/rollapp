import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { browserLaunchOptions, smokePort } from './browser-runtime.mjs';
const port = smokePort(5190);
const server=await createServer({cacheDir:'node_modules/.vite-action-rails-smoke',server:{host:'127.0.0.1',port,strictPort:true,hmr:false,watch:null},plugins:[{
  name:'action-rails-fixture',configureServer(vite){vite.middlewares.use(async(req,res,next)=>{
    if(!req.url.startsWith('/__action-rails'))return next();
    res.setHeader('Content-Type','text/html');
    res.end(await vite.transformIndexHtml(req.url,'<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/action-rails.jsx"></script></body></html>'));
  });}
}]});
await server.listen();
const browser=await chromium.launch(browserLaunchOptions());
try{
 for(const width of (process.env.ACTION_WIDTHS||'320,390,640,767,768,820,1024,1440,1920').split(',').map(Number)){
  const page=await browser.newPage({viewport:{width,height:width===820?414:844}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/**',route=>{errors.push('Unexpected API request');return route.abort();});
  for(const variant of ['text','collection','report','wishlist','narrow','short','icons','edit','dynamic','nested']){
   await page.goto(`http://127.0.0.1:${port}/__action-rails?variant=${variant}`);
   const rail=page.locator('.page-actions.horizontal-action-scroller,.identity-report-manager__actions.horizontal-action-scroller');
   await rail.waitFor();await page.evaluate(()=>document.fonts.ready);
   const measure=()=>rail.evaluate(element=>{
    const r=element.getBoundingClientRect(),controls=[...element.querySelectorAll('button,a')];
    return {top:r.top,left:r.left,right:r.right,width:r.width,scrollLeft:element.scrollLeft,scrollWidth:element.scrollWidth,clientWidth:element.clientWidth,
     first:controls[0].getBoundingClientRect().left,last:controls.at(-1).getBoundingClientRect().right,
     controls:controls.map(control=>{const r=control.getBoundingClientRect(),s=getComputedStyle(control);return {top:r.top,height:r.height,width:r.width,paddingLeft:s.paddingLeft,paddingRight:s.paddingRight}}),
     overflow:document.documentElement.scrollWidth>innerWidth+1,copyLeft:document.querySelector('[data-content-copy]').getBoundingClientRect().left};
   });
   let metrics=await measure();
   if(variant==='nested'){
    const gap=await page.locator('[data-nested-content]').evaluate(element=>element.getBoundingClientRect().top-document.querySelector('.page-toolbar').getBoundingClientRect().bottom);
    assert.equal(gap,24,`${width}: outer toolbar to nested content gap`);
    if([390,1440].includes(width))await page.screenshot({path:`/tmp/rollapp-toolbar-gap-${width}.png`});
   }
   assert(!metrics.overflow,`${width} ${variant}: page overflow`);
   assert(metrics.controls.every(c=>c.width>=48&&c.height>=48),`${width} ${variant}: small controls`);
   assert(metrics.controls.every(c=>Math.abs(c.top-metrics.controls[0].top)<1),`${width} ${variant}: wrapped controls`);
   if(!['icons','nested'].includes(variant)){
    assert.equal(metrics.controls[0].paddingLeft,'24px');assert.equal(metrics.controls[0].paddingRight,'24px');
   }
   const assertCentered=(m)=>{if(m.scrollWidth<=m.clientWidth+1)assert(Math.abs((m.first+m.last)/2-(m.left+m.right)/2)<1,`${width} ${variant}: fitting action group is not centered ${JSON.stringify(m)}`);};
   assertCentered(metrics);
   if(width<=820){
    assert(Math.abs(metrics.left)<1&&Math.abs(metrics.right-width)<1,`${width} ${variant}: inset scroll viewport ${JSON.stringify(metrics)}`);
    if(metrics.scrollWidth>metrics.clientWidth)assert.equal(metrics.first,width<=640?16:24,`${width} ${variant}: initial action inset`);
    assert(metrics.copyLeft>=16,`${width} ${variant}: content lost its page inset`);
    if(metrics.scrollWidth>metrics.clientWidth){
     await rail.evaluate(element=>{element.scrollLeft=42});metrics=await measure();
     assert(metrics.first<(width<=640?16:24),`${width} ${variant}: action did not scroll`);
     if(metrics.scrollWidth-metrics.clientWidth>(width<=640?16:24))assert(metrics.first<metrics.left,`${width} ${variant}: action did not pass behind left screen edge`);
     await rail.evaluate(element=>{element.scrollLeft=element.scrollWidth});metrics=await measure();
     assert(Math.abs(metrics.last-(width-(width<=640?16:24)))<1,`${width} ${variant}: unequal trailing gutter`);
     if(width===390&&variant==='text')await page.screenshot({path:'/tmp/rollapp-action-rail-edges.png',clip:{x:0,y:0,width,height:192}});
    }
   }else assert(metrics.left>=0&&metrics.right<=width,`${width} ${variant}: desktop rail leaves content`);
   if(variant==='dynamic'){
    await page.locator('[data-toggle-actions]').click();
    await page.waitForFunction(()=>document.querySelector('[aria-label="Действия"]').querySelectorAll('button').length===0);
    metrics=await measure();assertCentered(metrics);
    assert.equal(metrics.scrollLeft,0,'Shortened action rail retained stale scroll offset');
    await page.locator('[data-toggle-actions]').click();
    await page.waitForFunction(()=>document.querySelector('[aria-label="Действия"]').querySelectorAll('button').length===2);
    metrics=await measure();assertCentered(metrics);
   }
   metrics=await measure();
   await page.evaluate(()=>scrollTo(0,180));
   const afterScroll=await measure(),scrollY=await page.evaluate(()=>window.scrollY);
   assert(scrollY>0,'Fixture did not scroll vertically');
   assert(Math.abs(afterScroll.top-(metrics.top-scrollY))<1,`${width} ${variant}: actions are fixed or sticky`);
   assert(Math.abs(afterScroll.first-metrics.first)<1,`${width} ${variant}: actions shifted horizontally during vertical scroll`);
   assert.equal(afterScroll.scrollLeft,metrics.scrollLeft,'Vertical scrolling changed the horizontal offset');
   assertCentered(afterScroll);
   console.log(`PASS ${width} ${variant}: rail geometry, controls, scroll edges`);
  }
  assert.deepEqual(errors,[]);await page.close();
 }
}finally{
 console.log('Closing action-rail browser');
 await browser.close();
 console.log('Closing action-rail fixture server');
 await server.close();
 console.log('Action-rail fixture closed');
}
