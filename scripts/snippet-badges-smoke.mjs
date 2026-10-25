import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import {browserLaunchOptions} from './browser-runtime.mjs';
import {listenSmokeServer,smokeOrigin,smokePort} from './smoke-server.mjs';
const server=await createServer({server:{host:'127.0.0.1',port:smokePort(),strictPort:true,hmr:false,watch:null},plugins:[{name:'badge-fixture',enforce:'pre',transform(source,id){if(id.includes('/src/components/workouts.jsx?snippet-badge-test'))return source+'\nexport { WorkoutCard };';},configureServer(vite){vite.middlewares.use(async(req,res,next)=>{if(!req.url.startsWith('/__snippet-badges'))return next();res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml(req.url,'<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/snippet-badges.jsx"></script></body></html>'));});}}]});
await listenSmokeServer(server);
const browser=await chromium.launch(browserLaunchOptions());
try{
 for(const [width,height] of [[320,844],[390,844],[390,400],[768,844],[820,400],[1024,844],[1440,844],[1920,844]])for(const coarse of [false,true])for(const readonly of [false,true]){
  const page=await browser.newPage({viewport:{width,height},hasTouch:coarse,isMobile:coarse});const errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',route=>{errors.push('Unexpected API request');return route.abort()});
  await page.goto(`${smokeOrigin(server)}/__snippet-badges${readonly?'?readonly':''}`);await page.locator('.collection-snippet__badge').first().waitFor();await page.evaluate(()=>document.fonts.ready);
  const cards=await page.locator('.education-card').evaluateAll(cards=>cards.map(card=>{
   const badge=card.querySelector('.collection-snippet__badge'),media=card.querySelector('.collection-snippet__media'),handle=card.querySelector('[data-card-drag-handle]');
   const box=el=>{const b=el.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width,height:b.height}};
   return {badge:box(badge),media:box(media),handle:handle&&getComputedStyle(handle).display!=='none'?box(handle):null,clipped:badge.scrollWidth>badge.clientWidth+1,text:badge.textContent};
  }));
  assert.equal(cards.length,3);
  for(const {badge,media,handle,clipped,text} of cards){
   assert(text.trim().length>0);assert(!clipped,`Status text is clipped: ${text}`);
   assert(badge.left>=media.left&&badge.right<=media.right&&badge.top>=media.top&&badge.bottom<=media.bottom,'Badge escapes media');
   if(handle){assert.equal(handle.width,48);assert.equal(handle.height,48);assert(badge.top>=handle.bottom||badge.right<=handle.left||badge.left>=handle.right,'Drag handle overlaps status badge');}
  }
  if(width===390&&coarse&&!readonly)await page.screenshot({path:`/tmp/rollapp-snippet-badges-${width}x${height}.png`,fullPage:true});
  assert.deepEqual(errors,[]);await page.close();console.log(`PASS ${width}x${height} ${coarse?'touch':'mouse'} ${readonly?'reader':'author'}: complete badge and separate 48px handle`);
 }
}finally{await browser.close();await server.close()}
