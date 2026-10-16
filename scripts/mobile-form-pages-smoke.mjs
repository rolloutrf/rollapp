import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { drawerCases } from './fixtures/drawer-cases.js';
const server=await createServer({cacheDir:'node_modules/.vite-native-forms-smoke',server:{host:'127.0.0.1',port:5189,strictPort:true,hmr:false,watch:null},plugins:[{
  name:'native-form-fixture',enforce:'pre',
  transform(source,id){const name=new URLSearchParams(id.split('?')[1]).get('drawer-smoke-export');if(name&&/^[A-Z][A-Za-z]+$/.test(name)&&id.includes('/src/')&&!source.includes(`export function ${name}`))return `${source}\nexport { ${name} };`;},
  configureServer(vite){vite.middlewares.use(async(req,res,next)=>{if(!req.url.startsWith('/__drawer-smoke'))return next();res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml(req.url,'<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/'+(req.url.includes('flow=1')?'mobile-form-flow':'drawer-smoke')+'.jsx"></script></body></html>'));});}
}]});
await server.listen();
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{
 for(const width of (process.env.FORM_WIDTHS||'390,320,640,767,768,820,896,1024,1440,1920').split(',').map(Number)){
  const cases=drawerCases.filter(([name])=>process.env.FORM_CASES?process.env.FORM_CASES.split(',').includes(name):width<768||['planning-event','wish-list','contact','course','medication'].includes(name));
  for(const [name] of cases){
   const page=await browser.newPage({viewport:{width,height:width===896?414:844}});const errors=[];
   page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',route=>{errors.push('Unexpected API request');return route.abort();});
   await page.goto(`http://127.0.0.1:5189/__drawer-smoke?form=${name}`);
   if(width<768){
    const screen=page.locator('[data-mobile-form-page]:visible');await screen.waitFor();
    await page.waitForURL(url=>url.searchParams.has('formScreen'));
    assert.equal(await page.locator('[data-slot="drawer-popup"], [data-slot="drawer-overlay"], [aria-modal="true"]').count(),0,`${name}: modal remains`);
    assert(await page.evaluate(()=>getComputedStyle(document.documentElement).overflow!=='hidden'),`${name}: document locked`);
    const fields=screen.locator('input:not([type=hidden]):not([type=file]):not([type=checkbox]):not([type=radio]),textarea').filter({visible:true});
    assert(await fields.count()>0,`${name}: no fields`);
    if(name==='ideal-state'){
      // iOS overlays the keyboard without shrinking innerHeight or dvh.
      // Resizing the entire browser missed the empty space from the recording.
      const field=fields.last();await field.focus();
      await page.evaluate(()=>{
        Object.defineProperties(visualViewport,{height:{configurable:true,get:()=>471},offsetTop:{configurable:true,get:()=>0}});
        visualViewport.dispatchEvent(new Event('resize'));
      });
      await page.waitForFunction(()=>document.documentElement.hasAttribute('data-overlay-keyboard'));
      const gap=await screen.evaluate(element=>element.querySelector('footer').getBoundingClientRect().top-element.querySelector('textarea').getBoundingClientRect().bottom);
      assert(gap<=48,`${name}: keyboard leaves ${gap}px of empty space before submit`);
      assert.equal(await screen.evaluate(element=>getComputedStyle(element).minHeight),'471px','Native page still uses the hidden layout viewport');
      assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).scrollBehavior),'auto','Smooth document scrolling competes with keyboard focus');
      await page.evaluate(()=>{
        Object.defineProperty(visualViewport,'offsetTop',{configurable:true,get:()=>80});
        visualViewport.dispatchEvent(new Event('scroll'));
      });
      await page.waitForFunction(()=>getComputedStyle(document.documentElement).getPropertyValue('--app-visual-top').trim()==='80px');
      const panGap=await screen.evaluate(element=>element.querySelector('footer').getBoundingClientRect().top-element.querySelector('textarea').getBoundingClientRect().bottom);
      assert.equal(panGap,gap,'iOS viewport panning stretches form body');
      const actionBottom=await screen.locator('footer button').evaluate(element=>element.getBoundingClientRect().bottom);
      // Narrow headings may take another line: native panning must still be
      // able to reveal the action within the layout/visual viewport difference.
      assert(actionBottom+16<=844,`Submit cannot be revealed by native viewport panning: ${actionBottom}`);
      if(width===390)await page.screenshot({path:'/tmp/rollapp-ideal-state-keyboard.png',clip:{x:0,y:80,width,height:471}});
      // Reveal the action through the one document scroller, without a sheet
      // or a second nested scroll area left over from the desktop form.
      await screen.locator('footer').scrollIntoViewIfNeeded();
      assert.equal(await screen.evaluate(element=>[...element.querySelectorAll('*')].filter(node=>/auto|scroll/.test(getComputedStyle(node).overflowY)&&node.scrollHeight>node.clientHeight+1).length),0,'Native form has a nested vertical scroll owner');
      await page.evaluate(()=>{delete visualViewport.height;delete visualViewport.offsetTop;visualViewport.dispatchEvent(new Event('resize'));});
      await page.waitForFunction(()=>!document.documentElement.hasAttribute('data-overlay-keyboard'));
      assert.equal(await screen.evaluate(element=>getComputedStyle(element).minHeight),'844px','Page height did not restore after keyboard');
    }
    const last=fields.last();await last.scrollIntoViewIfNeeded();await last.focus();
    await page.setViewportSize({width,height:360});await last.scrollIntoViewIfNeeded();
    const rect=await last.boundingBox();assert(rect.y<360&&rect.y+rect.height>0,`${name}: field unreachable`);
    const back=screen.getByRole('button',{name:'Назад',exact:true});
    let backBox=await back.boundingBox();
    assert.equal(backBox.height,48,`${name}: Back size`);
    assert(backBox.y>=280&&backBox.y+backBox.height<=360,`${name}: Back is not at the bottom`);
    assert(await back.evaluate(element=>{const r=element.getBoundingClientRect();return element.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),`${name}: Back is covered by form content`);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${name}: horizontal overflow`);
    const footer=screen.locator('.mobile-form-page__footer, .contact-detail__edit-actions');
    assert.equal(await footer.count(),1,`${name}: expected one action footer`);
    const geometry=await footer.evaluate(element=>{
      const page=element.closest('[data-mobile-form-page]');
      const style=getComputedStyle(element);
      const action=element.querySelector('button[type="submit"]')||element.querySelector('button');
      return {background:style.backgroundColor,border:style.borderTopWidth,
        gap:page.getBoundingClientRect().bottom-action.getBoundingClientRect().bottom,
        padding:parseFloat(style.paddingBottom),pageEnd:page.getBoundingClientRect().bottom+scrollY};
    });
    assert.equal(geometry.background,'rgba(0, 0, 0, 0)',`${name}: colored footer slab`);
    assert.equal(geometry.border,'0px',`${name}: footer separator`);
    assert(Math.abs(geometry.gap-geometry.padding)<1,`${name}: stacked bottom insets ${JSON.stringify(geometry)}`);
    assert(geometry.pageEnd>=359,`${name}: short form does not fill viewport`);
    await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
    backBox=await back.boundingBox();
    const actions=await footer.locator('button').all();
    for(const action of actions){const box=await action.boundingBox();if(!box)continue;
      assert(box.x>=backBox.x+backBox.width+7,`${name}: footer action overlaps Back`);
      assert(box.x+box.width<=width,`${name}: footer action outside screen`);
    }
    if(name==='planning-event-edit'){
      const save=screen.getByRole('button',{name:'Сохранить',exact:true}),remove=screen.getByRole('button',{name:'Удалить всю серию',exact:true});
      const saveBox=await save.boundingBox(),removeBox=await remove.boundingBox();
      assert(Math.abs(saveBox.y-backBox.y)<1&&Math.abs(removeBox.y-backBox.y)<1,`${name}: actions are not alongside Back`);
      assert(saveBox.x+saveBox.width+7<=removeBox.x,`${name}: Save overlaps Delete`);
      assert(await footer.evaluate(e=>[...e.querySelectorAll('button')].every(b=>b.scrollWidth<=b.clientWidth+1)),`${name}: action label is clipped`);
      await remove.click();await page.getByRole('alertdialog').waitFor();
      await page.getByRole('button',{name:'Отмена',exact:true}).click();
    }
    await page.setViewportSize({width,height:844});await page.evaluate(()=>scrollTo(0,0));
    if(name==='markdown'&&width===390){await footer.scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/rollapp-form-footer.png'});}
    if(name==='planning-event'&&width===390)await page.screenshot({path:'/tmp/rollapp-native-task-form.png'});
    if(name==='ideal-state'&&width===390)await page.screenshot({path:'/tmp/rollapp-ideal-state-form.png'});
    await back.click();await screen.waitFor({state:'hidden'});
    assert(!new URL(page.url()).searchParams.has('formScreen'),`${name}: Back did not leave form`);
   }else await page.locator('[data-slot="drawer-popup"]').waitFor();
   assert.deepEqual(errors,[],`${name}: browser errors`);console.log(`PASS ${width} ${name}: ${width<768?'native page, fields, keyboard resize, Back':'desktop Drawer'}`);await page.close();
  }
 }
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5189/__drawer-smoke?flow=1');
 await page.getByRole('button',{name:'Открыть группу'}).click();
 await page.getByRole('button',{name:'Добавить запись'}).click();
 let screen=page.locator('[data-mobile-form-page]:visible');await screen.waitFor();
 await page.waitForURL(url=>url.searchParams.has('formScreen'));
 assert.equal(await page.locator('[data-slot="dialog-content"]:visible').count(),0,'Group remained above native form');
 await page.waitForFunction(()=>getComputedStyle(document.documentElement).overflow!=='hidden');
 await screen.getByRole('textbox',{name:'Черновик'}).fill('Сохранённый черновик');
 const parentUrl=page.url();
 await screen.getByRole('button',{name:'Создать список'}).click();
 await screen.getByRole('heading',{name:'Новый список'}).waitFor();
 assert.notEqual(page.url(),parentUrl);
 await page.goBack();await screen.getByRole('heading',{name:'Новая запись'}).waitFor();
 assert.equal(await screen.getByRole('textbox',{name:'Черновик'}).inputValue(),'Сохранённый черновик');
 await screen.getByRole('button',{name:'Заблокировать',exact:true}).click();
 await page.goBack();await page.waitForURL(parentUrl);
 await screen.getByRole('heading',{name:'Новая запись'}).waitFor();
 await screen.getByRole('button',{name:'Разблокировать',exact:true}).click();
 await screen.getByRole('button',{name:'Сохранить',exact:true}).click();
 await screen.waitFor({state:'hidden'});
 assert.equal(await page.locator('[data-saved]').getAttribute('data-saved'),'1','Save fired more than once');
 assert(!new URL(page.url()).searchParams.has('formScreen'));
 assert.deepEqual(errors,[]);
 console.log('PASS StrictMode, nested form, draft preservation, busy Back guard, one save, suspended group');
 await page.close();
}catch(error){
 for(const context of browser.contexts())for(const page of context.pages()){
  console.error('FAIL STATE',await page.evaluate(()=>({url:location.href,screens:[...document.querySelectorAll('[data-mobile-form-page]')].map(node=>({id:node.dataset.mobileFormPage,hidden:node.hidden,title:node.querySelector('h1')?.textContent}))})));
  await page.screenshot({path:'/tmp/rollapp-native-form-failure.png'});
 }
 throw error;
}finally{await browser.close();await server.close();}
