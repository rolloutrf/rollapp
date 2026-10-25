import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import { browserLaunchOptions } from './browser-runtime.mjs';
import { listenSmokeServer, smokePort, smokeOrigin } from './smoke-server.mjs';
const diagnostic=process.argv.includes('--diagnostic');
assert(process.argv.slice(2).every(arg=>arg==='--diagnostic'),'Unknown snippets smoke mode');
const exportsByFile = {courses:['CourseCard','COURSE_STATUS'],conferences:['ConferenceCard','CONFERENCE_STATUS'],'coaching-sessions':['CoachingSessionCard','SESSION_STATUS'],workouts:['WorkoutCard','WORKOUT_STATUS'],medications:['MedicationCard','MEDICATION_STATUS']};
const server = await createServer({cacheDir:'node_modules/.vite-snippets-smoke',server:{host:'127.0.0.1',port:smokePort(),strictPort:true,hmr:false,watch:null},plugins:[{
 name:'snippet-audit',enforce:'pre',transform(source,id){
  if(id.replace(/\?.*$/,'').endsWith('/src/lib/sphere-sharing.jsx')) return source+'\nexport { SphereSharingContext };';
  if(id.includes('?snippet-audit')){const file=id.split('/').at(-1).split('.jsx')[0];return source+`\nexport { ${exportsByFile[file].join(',')} };`;}
 },configureServer(vite){vite.middlewares.use(async(req,res,next)=>{
  if(req.url.startsWith('/snippet-destination')){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Snippet destination</title><p>Read-only destination</p>');return;}
  if(!req.url.startsWith('/__snippets')) return next();
  res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml(req.url,'<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/snippets.jsx"></script></body></html>'));
 });}
}]});
await listenSmokeServer(server);const origin=smokeOrigin(server);const browser=await chromium.launch(browserLaunchOptions());
const viewports=diagnostic?[[320,844]]:[[320,844],[390,844],[640,844],[767,844],[768,844],[820,844],[1024,844],[1440,844],[1920,844],[390,400],[1440,400]];
let activeCase={};
const records=[],failures=[];await mkdir('/tmp/rollapp-snippets',{recursive:true});
const output=process.env.SNIPPET_CHECK_OUTPUT||`/tmp/rollapp-snippets/check-${Date.now()}.json`;
const report={coverage:{themes:['dark','light'],families:['courses','conferences','coaching','workouts','medications']},commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),dirty:!!execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),diagnostic,records,failures};
const svg=name=>`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><rect width="240" height="240" fill="${name.includes('b')?'#116644':'#eee'}"/><text x="30" y="140" fill="${name.includes('b')?'white':'black'}" font-size="60">${name.includes('b')?'PS':'GO'}</text></svg>`;
async function setTheme(page,dark){
 await page.evaluate(async value=>{
  document.documentElement.classList.toggle('dark',value);
  const animations=[...document.querySelectorAll('.collection-snippet')].flatMap(el=>el.getAnimations({subtree:true}));
  await Promise.all(animations.filter(animation=>animation.effect?.getTiming().iterations!==Infinity).map(animation=>animation.finished.catch(()=>{})));
 },dark);
 // Inherited color can start a child's transition after its parent has finished.
 await page.waitForFunction(()=>[...document.querySelectorAll('.collection-snippet, .collection-snippet h3, .collection-snippet [data-slot="card-footer"] a')].every(element=>getComputedStyle(element).color===getComputedStyle(document.documentElement).getPropertyValue('--card-foreground').trim()));
}
async function measure(page){return page.locator('[data-audit-card]').evaluateAll(cards=>cards.map(card=>{
 const rect=el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
 const badge=card.querySelector('.collection-snippet__badge'),label=badge.querySelector('span'),range=document.createRange();range.selectNodeContents(label);
 const handle=card.querySelector('[data-card-drag-handle]'),menu=card.querySelector('[data-slot="card-action"] button');
 return {id:card.dataset.auditCard,card:rect(card),media:rect(card.querySelector('.collection-snippet__media')),badge:rect(badge),glyphs:[...range.getClientRects()].map(r=>({left:r.left,right:r.right,top:r.top,bottom:r.bottom})),handle:handle&&getComputedStyle(handle).display!=='none'?rect(handle):null,menu:menu?rect(menu):null,handleIcon:handle?getComputedStyle(handle.querySelector("svg")).width:null,menuIcon:menu?getComputedStyle(menu.querySelector("svg")).width:null,accessibleBadge:!badge.closest('[aria-hidden="true"]'),imageFit:card.querySelector('.collection-snippet__media img')?getComputedStyle(card.querySelector('.collection-snippet__media img')).objectFit:null,
 overflow:[...card.querySelectorAll('*')].filter(el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return r.width&&s.overflowX==='visible'&&el.scrollWidth>el.clientWidth+1&&s.position!=='absolute'&&s.display!=='inline'&&s.display!=='contents';}).map(el=>({tag:el.tagName,classes:el.className,width:el.clientWidth,scroll:el.scrollWidth})),
 links:[...card.querySelectorAll('[data-slot="card-footer"] a')].map(rect)};
}));}
try{
 for(const [width,height] of viewports) for(const touch of [false,true]){
  const context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch});
  const page=await context.newPage(),errors=[],pending=[];
  let slowObserved,slowFinished;
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'&&m.text().startsWith('Base UI:'))errors.push(m.text());});
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.pathname.startsWith('/api/')){errors.push('Unexpected API request');return route.abort();}
   if(url.pathname.startsWith('/__snippet-assets/')){
    if(url.pathname.includes('broken'))return route.fulfill({status:404,body:'Not found'});
    if(url.pathname.includes('slow')){slowObserved?.();await new Promise(resolve=>pending.push(resolve));}
    try{return await route.fulfill({contentType:'image/svg+xml',body:svg(url.pathname)});}catch{}finally{if(url.pathname.includes('slow'))slowFinished?.();}
    return;
   }
   return url.origin===origin?route.continue():route.abort();
  });
  for(const kind of ['courses','conferences','coaching','workouts','medications']) for(const readOnly of [false,true]){
   activeCase={kind,width,height,touch,readOnly,phase:'cards'};
   await page.goto(`${origin}/__snippets?kind=${kind}${readOnly?'&readonly':''}`);
   await page.locator('[data-audit-card]').first().waitFor();await page.evaluate(()=>document.fonts.ready);
   for(const dark of [true,false]){
    await setTheme(page,dark);
    activeCase.dark=dark;
    const cards=await measure(page);
    for(const item of cards){
     const {badge,media,handle,menu,glyphs}=item;
     assert(item.accessibleBadge,'Status badge must remain in the accessibility tree');
     assert(Math.abs(media.height/media.width-286/236)<.015,'Snippet media must retain its portrait ratio');
     if(item.imageFit)assert.equal(item.imageFit,'contain','Logos/photos must not be stretched or cropped');
     assert(badge.left>=media.left&&badge.right<=media.right&&badge.top>=media.top&&badge.bottom<=media.bottom,`${kind} ${width}: badge bounds ${JSON.stringify(item)}`);
     assert(glyphs.length&&glyphs.every(r=>r.left>=badge.left-.5&&r.right<=badge.right+.5&&r.top>=badge.top-.5&&r.bottom<=badge.bottom+.5),`${kind} ${width}: clipped status ${item.id}`);
     if(handle){assert.deepEqual({width:handle.width,height:handle.height},{width:48,height:48},'Touch handle must retain 48px geometry');assert.equal(item.handleIcon,'20px','Touch handle glyph must retain 20px geometry');}
     if(menu)assert.equal(item.menuIcon,'20px','Menu glyph must retain 20px geometry');
     if(handle)assert(badge.bottom<=handle.top||badge.top>=handle.bottom||badge.right<=handle.left||badge.left>=handle.right,`${kind} ${width}: handle overlaps badge`);
     assert.deepEqual(item.overflow,[],`${kind} ${width}: descendant overflow`);
     for(const link of item.links)assert(link.left>=item.card.left-1&&link.right<=item.card.right+1,`${kind} ${width}: footer link leaves card`);
     if(readOnly)assert.equal(menu,null,'Read-only snippet must not expose an editing menu');
     else assert(menu&&menu.width>=48&&menu.height>=48,`${kind} ${width}: menu hit target is too small: ${JSON.stringify(menu)}`);
    }
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Root overflow');
    const tooltips=await page.locator('[data-audit-card] .truncate').evaluateAll(nodes=>nodes.filter(el=>el.scrollWidth>el.clientWidth+1).map(el=>({text:el.textContent,title:el.title})));
    for(const entry of tooltips)assert.equal(entry.title,entry.text,'Truncated text must remain available in title');
   }
   if(readOnly){const open=page.locator('[data-audit-card]').first().locator('.collection-snippet__open');assert(!/редактировать|переместить/i.test(await open.getAttribute('aria-label')),'Read-only card must advertise opening instead of editing');}
   if(!readOnly){
    const first=page.locator('[data-audit-card]').first(),open=first.locator('.collection-snippet__open');
    await open.focus();await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(()=>window.snippetAudit.calls.filter(c=>c.action==='open').length),1,'Keyboard opening must call only this card');
    const menu=first.locator('[data-slot="card-action"] button');await menu.click();await page.getByRole('menu').waitFor();await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(()=>window.snippetAudit.calls.filter(c=>c.action==='open').length),1,'Menu must not open the card');
    await page.waitForFunction(()=>document.activeElement===document.querySelector('[data-audit-card] [data-slot="card-action"] button'));
    const link=first.locator('[data-slot="card-footer"] a');
    if(await link.count()){
     const role=await link.evaluate(el=>({size:getComputedStyle(el).fontSize,leading:getComputedStyle(el).lineHeight}));assert.deepEqual(role,{size:'18px',leading:'28px'});
     const popupReady=page.waitForEvent('popup');await link.click();const popup=await popupReady;await popup.close();
     assert.equal(await page.evaluate(()=>window.snippetAudit.calls.filter(c=>c.action==='open').length),1,'External link must not open the card');
    }
    if(kind!=='medications'){
     const media=first.locator('.collection-snippet__media');await media.scrollIntoViewIfNeeded();
     const source=await first.boundingBox(),sourceTag=await first.locator('.collection-snippet__badge').boundingBox(),mediaBox=await media.boundingBox();
     let client;
     if(touch){client=await context.newCDPSession(page);const handle=await first.locator('[data-card-drag-handle]').boundingBox(),x=handle.x+handle.width/2,y=handle.y+handle.height/2;await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await page.waitForTimeout(300);await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+14,y:y+6}]});}
     else{const x=mediaBox.x+mediaBox.width/2,y=mediaBox.y+mediaBox.height/2;await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+14,y+6);}
     const preview=page.locator('.education-card--drag-preview');await preview.waitFor();
     const ghost=await preview.boundingBox(),tag=await preview.locator('.collection-snippet__badge').boundingBox();
     assert(Math.abs(ghost.width-source.width)<=1&&Math.abs(ghost.height-source.height)<=1,'Real snippet drag preview changes source geometry');
     assert(Math.abs((tag.x-ghost.x)-(sourceTag.x-source.x))<=1&&Math.abs((tag.y-ghost.y)-(sourceTag.y-source.y))<=1,'Badge jumps when its handle is hidden in the drag preview');
     if(touch){await client.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await client.detach();}else{await page.keyboard.press('Escape');await page.mouse.up();}
     await page.waitForFunction(()=>!document.querySelector('.education-card--drag-preview'));
     assert.equal(await page.evaluate(()=>window.snippetAudit.calls.filter(c=>c.action==='persist').length),0,'Cancelled snippet drag must not persist');
    }
   }
   if(['courses','conferences','medications'].includes(kind)){
    const first=page.locator('[data-audit-card]').first();await first.scrollIntoViewIfNeeded();
    await page.waitForFunction(()=>{const img=document.querySelector('[data-audit-card] .collection-snippet__media img');return img?.complete&&img.naturalWidth>0;});
    const second=page.locator('[data-audit-card]').nth(1);await second.scrollIntoViewIfNeeded();await second.locator('.collection-snippet__placeholder').waitFor();
    await page.evaluate(id=>window.snippetAudit.changeMedia(id,'/__snippet-assets/good-b.svg'),`${kind}-1`);
    await second.locator('.collection-snippet__media img').waitFor();
    await second.locator('.collection-snippet__media img').evaluate(img=>img.decode());
    await page.waitForFunction(id=>!document.querySelector(`[data-audit-card="${id}"] .collection-snippet__placeholder`),`${kind}-1`);
   }
   const record={kind,width,height,touch,readOnly};records.push(record);console.log('PASS snippet',JSON.stringify(record));
   if(kind==='courses'&&!readOnly&&[390,1440].includes(width)) {await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));for(const dark of [true,false]){await setTheme(page,dark);await page.screenshot({path:`/tmp/rollapp-snippets/${kind}-${width}-${height}-${touch?'touch':'mouse'}-${dark?'dark':'light'}.png`});}}
   assert.deepEqual(errors,[]);
  }
  for(const kind of ['courses','conferences','coaching','workouts','medications']){
   activeCase={kind,width,height,touch,phase:'busy'};
   await page.goto(`${origin}/__snippets?kind=${kind}&busy`);await page.locator('[data-audit-card]').first().waitFor();
   for(const dark of [true,false]){
    await setTheme(page,dark);
    const menus=page.locator('[data-slot="card-action"] button');for(const menu of await menus.all())assert(await menu.isDisabled(),'Saving snippet menu must be disabled');
    assert.equal(await page.getByRole('menu').count(),0);assert.deepEqual(await page.evaluate(()=>window.snippetAudit.calls),[]);
   }
   records.push({...activeCase});console.log('PASS snippet',JSON.stringify(activeCase));
  }
  activeCase={width,height,touch,phase:'image-lifecycle'};
  const runtime=page.locator('[data-media-runtime]');
  for(const dark of [true,false]){
  await setTheme(page,dark);await runtime.scrollIntoViewIfNeeded();const before=await runtime.locator('.collection-snippet__media').boundingBox();
  const slowReady=new Promise(resolve=>{slowObserved=resolve;});const slowDone=new Promise(resolve=>{slowFinished=resolve;});
  await page.evaluate(dark=>window.snippetAudit.changeSources([`/__snippet-assets/slow-a.svg?theme=${dark?'dark':'light'}`]),dark);await slowReady;
  await runtime.locator('.collection-snippet__placeholder').waitFor();
  assert.equal(await runtime.locator('img').evaluate(el=>getComputedStyle(el).opacity),'0','Loading image must retain its placeholder');
  assert.deepEqual(await runtime.locator('.collection-snippet__media').boundingBox(),before,'Loading changes media geometry');
  await page.evaluate(()=>window.snippetAudit.changeSources(['/__snippet-assets/good-b.svg']));
  await page.waitForFunction(()=>{const img=document.querySelector('[data-media-runtime] img');return img?.getAttribute('src')==='/__snippet-assets/good-b.svg'&&img.complete&&img.naturalWidth>0&&getComputedStyle(img).opacity==='1';});
  while(pending.length)pending.shift()();await slowDone;
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(await runtime.locator('img').getAttribute('src'),'/__snippet-assets/good-b.svg','A late old image replaced its new owner');
  await page.evaluate(()=>window.snippetAudit.changeSources(['/__snippet-assets/broken.svg','/__snippet-assets/good-a.svg']));
  await page.waitForFunction(()=>{const img=document.querySelector('[data-media-runtime] img');return img?.getAttribute('src')==='/__snippet-assets/good-a.svg'&&getComputedStyle(img).opacity==='1';});
  await page.evaluate(()=>window.snippetAudit.changeSources(['/__snippet-assets/broken-a.svg','/__snippet-assets/broken-b.svg']));
  await page.waitForFunction(()=>!document.querySelector('[data-media-runtime] img')&&document.querySelector('[data-media-runtime] .collection-snippet__placeholder'));
  await page.evaluate(()=>window.snippetAudit.changeSources(['/__snippet-assets/good-b.svg']));
  await page.waitForFunction(()=>{const img=document.querySelector('[data-media-runtime] img');return img?.getAttribute('src')==='/__snippet-assets/good-b.svg'&&getComputedStyle(img).opacity==='1';});
  assert.equal(await runtime.locator('.collection-snippet__placeholder').count(),0,'Healthy replacement remains hidden after an earlier image failure');
  assert.deepEqual(await runtime.locator('.collection-snippet__media').boundingBox(),before,'Fallback changes media geometry');
  }
  assert.deepEqual(errors,[]);records.push({...activeCase});console.log('PASS snippet',JSON.stringify(activeCase));
  await context.close();
 }
}catch(error){failures.push({...activeCase,message:error.message});for(const context of browser.contexts())for(const page of context.pages())await page.screenshot({path:'/tmp/rollapp-snippets/failure.png'}).catch(()=>{});throw error;}
finally{report.status=failures.length?'failed':'passed';await writeFile(output,JSON.stringify(report,null,2));console.log(`Snippet report: ${output}`);await browser.close();await server.close();}
