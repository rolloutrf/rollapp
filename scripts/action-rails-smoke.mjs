import { listenSmokeServer, smokePort, smokeOrigin } from "./smoke-server.mjs";
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { browserLaunchOptions } from './browser-runtime.mjs';
const server=await createServer({cacheDir:'node_modules/.vite-action-rails-smoke',server:{host:'127.0.0.1',port: smokePort(),strictPort: true,hmr:false,watch:null},plugins:[{
  name:'action-rails-fixture',transform(source,id){if(id.includes('App.jsx?action-rails-export'))return `${source}\nexport { ContactsProfileControls, WishesProfileControls, WishesPage, AppShell, ProfileEditorProvider, SessionContext, ToastContext };`;
  if(id.endsWith('/src/lib/sphere-sharing.jsx'))return `${source}\nexport { SphereSharingContext };`;},configureServer(vite){vite.middlewares.use(async(req,res,next)=>{
    if(!req.url.startsWith('/__action-rails'))return next();
    res.setHeader('Content-Type','text/html');
    res.end(await vite.transformIndexHtml(req.url,'<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/action-rails.jsx"></script></body></html>'));
  });}
}]});
await listenSmokeServer(server);
const origin = smokeOrigin(server);
const browser=await chromium.launch(browserLaunchOptions());
try{
 for(const width of (process.env.ACTION_WIDTHS||'320,390,640,767,768,820,1024,1440,1920').split(',').map(Number)){
  const page=await browser.newPage({viewport:{width,height:width===820?414:844}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/**',route=>{errors.push(`Unexpected API request: ${route.request().method()} ${new URL(route.request().url()).pathname}`);return route.abort();});
  for(const variant of ['text','overflow','collection','contacts-real','wishlist-real','report','wishlist','narrow','short','icons','icon-labels','edit','dynamic','nested']){
   await page.goto(`${origin}/__action-rails?variant=${variant}`);
   const rail=page.locator('.page-actions.horizontal-action-scroller,.identity-report-manager__actions.horizontal-action-scroller');
   await rail.waitFor();await page.evaluate(()=>document.fonts.ready);
   const measure=()=>rail.evaluate(element=>{
    const r=element.getBoundingClientRect(),controls=[...element.querySelectorAll('button,a')];
    return {top:r.top,left:r.left,right:r.right,width:r.width,scrollLeft:element.scrollLeft,scrollWidth:element.scrollWidth,clientWidth:element.clientWidth,
     first:controls[0].getBoundingClientRect().left,last:controls.at(-1).getBoundingClientRect().right,
     controls:controls.map(control=>{const r=control.getBoundingClientRect(),s=getComputedStyle(control);return {top:r.top,height:r.height,width:r.width,paddingLeft:s.paddingLeft,paddingRight:s.paddingRight}}),
     overflow:document.documentElement.scrollWidth>innerWidth+1,copyLeft:document.querySelector('[data-content-copy]').getBoundingClientRect().left};
   });
   const gutter=width<=640?16:width<=820?24:width<=1180?40:48;
   let metrics=await measure();
   const textActions=await rail.locator('[data-page-action]').evaluateAll(elements=>elements.map(element=>{const s=getComputedStyle(element);return {left:s.paddingLeft,right:s.paddingRight,radii:[s.borderTopLeftRadius,s.borderTopRightRadius,s.borderBottomLeftRadius,s.borderBottomRightRadius],height:element.getBoundingClientRect().height};}));
   for(const action of textActions){assert.equal(action.left,'24px',`${variant}: shared left padding`);assert.equal(action.right,'24px',`${variant}: shared right padding`);assert(action.height>=48);assert(action.radii.every(radius=>parseFloat(radius)>=24),`${variant}: text actions must be pills`);}
   if(variant==='collection'){
    assert.equal(textActions.length,0,'Collection settings live on the tiles');
    assert.equal(await page.getByRole('button',{name:/^Настройки списка «/}).count(),2);
   }
   if(variant==='wishlist-real'){
    assert.equal(textActions.length,1,'Seller page uses the shared text action');
    assert.equal(await rail.getByRole('button',{name:/импорт/i}).count(),0,'Purchase import belongs in profile finances');
   }
   if(variant==='contacts-real')assert.equal(textActions.length,0,'Contacts toolbar contains the store action');
   if(['collection','wishlist-real'].includes(variant)){
    const tiles=await page.locator('.list-tabs [data-list-tile]').evaluateAll(elements=>elements.map(element=>{const r=element.getBoundingClientRect(),s=getComputedStyle(element),label=element.querySelector('[data-slot="list-tile-label"]'),count=element.querySelector('[data-slot="list-tile-count"]'),c=count.getBoundingClientRect();return {width:r.width,height:r.height,radius:s.borderTopLeftRadius,inlineStyle:element.hasAttribute('style')||label.hasAttribute('style')||count.hasAttribute('style'),countFits:c.top>=r.top&&c.bottom<=r.bottom};}));
    assert.equal(tiles.length,2);for(const tile of tiles){assert.equal(tile.width,130);assert.equal(tile.height,100);assert.equal(tile.radius,'18px');assert(!tile.inlineStyle,'List tiles must consume shared CSS without inline copies');assert(tile.countFits,'Tile count left its bounds');}
   }
   if(variant==='wishlist-real'&&width>=768){
    const parity=await page.evaluate(()=>{
     const style=el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect(),label=getComputedStyle(el.querySelector('[data-slot="list-tile-label"]')),count=getComputedStyle(el.querySelector('[data-slot="list-tile-count"]'));return {geometry:{width:r.width,height:r.height,radius:s.borderRadius,padding:s.padding,labelSize:label.fontSize,labelLine:label.lineHeight,labelWeight:label.fontWeight,countSize:count.fontSize,countLine:count.lineHeight,countWeight:count.fontWeight},paint:{background:s.backgroundColor,color:s.color,countColor:count.color}};};
     const tile=(container,state)=>document.querySelector(`${container} [data-list-tile][aria-pressed="${state}"]`);
     const wishlist=tile('.list-tabs','true'),day=tile('[data-day-tile-comparison]','true');
     const expectedPaint=(el,surface,ink,countColor)=>{
      const sample=document.createElement('span');sample.style.cssText='position:absolute;visibility:hidden';
      sample.style.backgroundColor=`var(${surface})`;sample.style.color=`var(${ink})`;
      const count=sample.appendChild(document.createElement('span'));count.style.color=countColor;
      el.append(sample);const s=getComputedStyle(sample),paint={background:s.backgroundColor,color:s.color,countColor:getComputedStyle(count).color};sample.remove();return paint;
     };
     return {
      idle:{wishlist:style(tile('.list-tabs','false')),day:style(tile('[data-day-tile-comparison]','false'))},
      selected:{wishlist:style(wishlist),day:style(day)},
      wishlistPaint:expectedPaint(wishlist,'--list-tile-selected-surface','--list-tile-selected-ink','inherit'),
      dayPaint:expectedPaint(day,'--primary','--primary-foreground','var(--muted-foreground)'),
      wishlistGlow:getComputedStyle(wishlist,'::before').backgroundImage,
      dayGlow:getComputedStyle(day,'::before').backgroundImage,
     };
    });
    assert.deepEqual(parity.idle.day,parity.idle.wishlist,'Unselected day and Wishlist tiles share geometry and paint');
    assert.deepEqual(parity.selected.day.geometry,parity.selected.wishlist.geometry,'Selected day and Wishlist tiles share geometry and typography');
    assert.deepEqual(parity.selected.day.paint,parity.dayPaint,'Selected days use the shared primary colors');
    assert.deepEqual(parity.selected.wishlist.paint,parity.wishlistPaint,'Selected Wishlist tiles use the dedicated surface and equal title and count colors');
    assert.match(parity.wishlistGlow,/radial-gradient/);
    assert.equal(parity.dayGlow,'none');
   }
   if(variant==='nested'){
    const gap=await page.locator('[data-nested-content]').evaluate(element=>element.getBoundingClientRect().top-document.querySelector('.page-toolbar').getBoundingClientRect().bottom);
    assert.equal(gap,24,`${width}: outer toolbar to nested content gap`);
    if([390,1440].includes(width))await page.screenshot({path:`/tmp/rollapp-toolbar-gap-${width}.png`});
   }
   assert(!metrics.overflow,`${width} ${variant}: page overflow`);
   assert(metrics.controls.every(c=>c.width>=48&&c.height>=48),`${width} ${variant}: small controls`);
   assert(metrics.controls.every(c=>Math.abs(c.top-metrics.controls[0].top)<1),`${width} ${variant}: wrapped controls`);
   const assertCentered=(m)=>{if(m.scrollWidth<=m.clientWidth+1)assert(Math.abs((m.first+m.last)/2-(m.left+m.right)/2)<1,`${width} ${variant}: fitting action group is not centered ${JSON.stringify(m)}`);};
   assertCentered(metrics);
   if(variant==='wishlist-real'&&[390,1440].includes(width))await page.screenshot({path:`/tmp/rollapp-wishlist-actions-${width}.png`});
   {
    assert(Math.abs(metrics.left)<1&&Math.abs(metrics.right-width)<1,`${width} ${variant}: inset scroll viewport ${JSON.stringify(metrics)}`);
    if(metrics.scrollWidth>metrics.clientWidth)assert.equal(metrics.first,gutter,`${width} ${variant}: initial action inset`);
    assert(metrics.copyLeft>=16,`${width} ${variant}: content lost its page inset`);
    if(metrics.scrollWidth>metrics.clientWidth){
     await rail.evaluate(element=>{element.scrollLeft=64});metrics=await measure();
     assert(metrics.first<(gutter),`${width} ${variant}: action did not scroll`);
     if(metrics.scrollWidth-metrics.clientWidth>(gutter))assert(metrics.first<metrics.left,`${width} ${variant}: action did not pass behind left screen edge`);
     await rail.evaluate(element=>{element.scrollLeft=element.scrollWidth});metrics=await measure();
     assert(Math.abs(metrics.last-(width-(gutter)))<1,`${width} ${variant}: unequal trailing gutter`);
     if(width===390&&variant==='wishlist-real')await page.screenshot({path:'/tmp/rollapp-wishlist-actions-390-end.png'});
     if(width===390&&variant==='text')await page.screenshot({path:'/tmp/rollapp-action-rail-edges.png',clip:{x:0,y:0,width,height:192}});
    }
   }
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
   await page.evaluate(()=>scrollTo({top:180,behavior:"instant"}));
   const afterScroll=await measure(),scrollY=await page.evaluate(()=>window.scrollY);
   assert(scrollY>0,'Fixture did not scroll vertically');
   assert(Math.abs(afterScroll.top-(metrics.top-scrollY))<1,`${width} ${variant}: actions are fixed or sticky`);
   assert(Math.abs(afterScroll.first-metrics.first)<1,`${width} ${variant}: actions shifted horizontally during vertical scroll`);
   assert.equal(afterScroll.scrollLeft,metrics.scrollLeft,'Vertical scrolling changed the horizontal offset');
   assertCentered(afterScroll);
   console.log(`PASS ${width} ${variant}: rail geometry, controls, scroll edges`);
  }
  for (const variant of ['sport', 'courses', 'conferences', 'coaching', 'medications', 'performance']) {
   const path = `${origin}/__action-rails?variant=${variant}`;
   await page.goto(path);
   const performance = variant === 'performance';
   const medication = variant === 'medications';
   const label = performance ? 'Редактировать цикл «Осень 2024»' : `Настройки ${medication ? 'группы' : 'списка'} «Второй»`;
   const settings = page.getByRole('button', { name: label, exact: true });
   await settings.waitFor();
   const selected = page.locator('[data-list-tile][aria-pressed="true"]');
   const initial = await selected.getAttribute('aria-label');
   assert.equal(await page.getByRole('button', { name: /^(Настройки списка|Настройки группы|Редактировать)$/ }).count(), 0);
   assert.equal(await page.getByRole('link', { name: 'Открыть магазин за роллы' }).count(), 1);
   await settings.focus();
   await page.keyboard.press('Enter');
   if (performance) {
    await page.getByText(/Редактируется выбранный цикл «Осень 2024»/).waitFor();
   } else {
    const title = page.getByRole('textbox', { name: medication ? 'Название группы' : 'Название', exact: true });
    assert.equal(await title.inputValue(), 'Второй');
    await title.fill('Переименованный');
    await page.locator('form button[type="submit"]').click();
    await page.getByRole('button', { name: label.replace('Второй', 'Переименованный'), exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.collectionWrites.length), 1);
   }
   if (performance) await page.getByRole('button', { name: width < 768 ? 'Назад' : 'Закрыть редактирование перфоманса', exact: true }).click();
   const expectedFocus = performance ? label : label.replace('Второй', 'Переименованный');
   await page.waitForFunction(name => document.activeElement?.getAttribute('aria-label') === name, expectedFocus);
   assert.equal(await selected.getAttribute('aria-label'), initial);
   if (performance) {
    await settings.click();
    await page.getByRole('button', { name: 'Удалить цикл', exact: true }).click();
    const confirm = page.getByRole('alertdialog', { name: 'Удалить цикл ревью?' });
    assert.match(await confirm.textContent(), /Осень 2024/);
    await confirm.getByRole('button', { name: 'Удалить цикл', exact: true }).click();
    await page.getByText('Цикл «Осень 2024» удалён.', { exact: true }).waitFor();
    await settings.waitFor({ state: 'detached' });
    await page.waitForFunction(() => !location.search.includes('formScreen'));
    assert.equal(await selected.getAttribute('aria-label'), initial);
   }
   if (variant === 'sport') {
    const first = page.locator('[data-wish-list-tile="first"]');
    await first.focus();
    await page.keyboard.press('Alt+ArrowRight');
    await page.reload();
    const sortables = page.locator('[data-wish-list-tile]');
    await sortables.first().waitFor();
    assert.equal(await sortables.first().getAttribute('data-wish-list-tile'), 'second');
    await page.evaluate(() => localStorage.removeItem('rollapp:wishlist-list-order:fixture-owner:lists:workouts'));
    if ([390,1440].includes(width)) await page.screenshot({ path: `/tmp/rollapp-sport-list-tiles-${width}.png` });
   }
   await page.goto(`${path}&readonly`);
   await selected.waitFor();
   assert.equal(await page.locator('.list-tabs__settings').count(), 0);
   assert.equal(await page.locator('[data-wish-list-tile]').count(), 0);
   console.log(`PASS ${width} ${variant}: per-tile actions, focus and read-only`);
  }
  for(const variant of ['identity-document','identity-document-add']){
   await page.goto(`${origin}/__action-rails?variant=${variant}`);
   await page.locator('.ProseMirror').waitFor();
   assert.equal(await page.locator('a[href*="/identity/business/"]').count(),0,'Identity document has no marketplace entry');
   assert.equal(await page.locator('.page-toolbar').count(),variant==='identity-document-add'?1:0,'Empty identity toolbar reserved a gap');
   assert.equal(await page.getByRole('button',{name:'Добавить блок',exact:true}).count(),variant==='identity-document-add'?1:0,'Independent block creation must stay available');
   assert.equal(await page.locator('.ProseMirror').textContent(),'Текст раздела');
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Identity document overflow');
   console.log(`PASS ${width} ${variant}: no marketplace/empty rail, document and Add retained`);
  }
  await page.goto(`${origin}/__action-rails?variant=wishlist-error`);
  await page.getByText('Не удалось загрузить Вишлист',{exact:true}).waitFor();
  assert.equal(await page.getByRole('navigation',{name:'Разделы Вишлиста'}).getByRole('link',{name:'Календарь',exact:true}).count(),1,'Publication links remain available when the Wishlist fails to load');
  assert.equal(await page.getByRole('heading',{name:'В этом списке пока пусто',exact:true}).count(),0,'Connection failure must never pretend the Wishlist is empty');
  await page.getByRole('button',{name:'Повторить',exact:true}).click();
  await page.waitForFunction(()=>window.wishlistLoadAttempts===2);
  await page.getByText('Не удалось загрузить Вишлист',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Повторить',exact:true}).click();
  await page.getByRole('heading',{name:'В этом списке пока пусто',exact:true}).waitFor();
  assert.equal(await page.getByText('Не удалось загрузить Вишлист',{exact:true}).count(),0);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Wishlist load states overflow');
  console.log(`PASS ${width} Wishlist: connection error, failed retry, successful empty response and no API`);
  assert.deepEqual(errors,[]);await page.close();
 }
}finally{
 console.log('Closing action-rail browser');
 await browser.close();
 console.log('Closing action-rail fixture server');
 await server.close();
 console.log('Action-rail fixture closed');
}
