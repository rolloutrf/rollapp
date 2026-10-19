import assert from 'node:assert/strict';

export async function checkFirstOffscreenSelection(browser, origin) {
  for (const [width,height] of [[320,844],[390,844],[390,400],[768,844],[820,844],[1024,844],[1280,720],[1440,844],[1920,844]]) {
    const page = await browser.newPage({viewport:{width,height}});
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/api/**',route=>{errors.push('Unexpected API request');return route.abort();});
    await page.goto(`${origin}/__text-edit?four=1&selection=1`);
    const editor=page.getByRole('textbox',{name:'Ответы на четыре вопроса',exact:true});
    const paragraph=editor.locator('[data-question-body="1"] p').nth(2);
    await paragraph.waitFor(); await page.evaluate(()=>document.fonts.ready);
    const select=()=>paragraph.evaluate(el=>{el.closest('[contenteditable]').focus({preventScroll:true});getSelection().setBaseAndExtent(el.firstChild,8,el.firstChild,43);});
    await select();
    await page.waitForFunction(()=>!getSelection().isCollapsed&&document.querySelector('[role="textbox"]').editor.state.selection.from!==document.querySelector('[role="textbox"]').editor.state.selection.to);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await page.getByRole('toolbar').waitFor({state:'hidden'});
    console.log('OFFSCREEN',width,await page.locator('[role="toolbar"]').getAttribute('style'));
    await page.keyboard.press('ArrowRight');
    await paragraph.evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));
    await select();
    await page.getByRole('toolbar').waitFor();
    const samples=await page.evaluate(()=>new Promise(resolve=>{
      const samples=[],start=performance.now();
      const tick=()=>{const s=getSelection().getRangeAt(0).getBoundingClientRect(),t=document.querySelector('[role="toolbar"]'),m=t.getBoundingClientRect();samples.push({selection:{top:s.top,bottom:s.bottom,left:s.left,right:s.right},menu:{top:m.top,bottom:m.bottom,left:m.left,right:m.right},position:getComputedStyle(t).position,visibility:getComputedStyle(t).visibility,scrollY});if(performance.now()-start>=650)resolve(samples);else requestAnimationFrame(tick);};tick();
    }));
    const final=samples.at(-1);
    console.log('SETTLED',width,JSON.stringify(final));
    await page.screenshot({path:`/tmp/rollapp-first-offscreen-${width}.png`});
    assert(Math.min(Math.abs(final.selection.top-final.menu.bottom),Math.abs(final.menu.top-final.selection.bottom))<=12,JSON.stringify(final));
    for(const sample of samples.filter(sample=>sample.visibility==='visible')) assert(sample.menu.top>=0&&sample.menu.bottom<=height+1,`Every visible toolbar frame fits: ${JSON.stringify(sample)}`);
    await page.keyboard.press('ControlOrMeta+k');
    const address=page.getByRole('textbox',{name:'Адрес ссылки',exact:true});
    await address.waitFor();
    const link=await page.locator('.inline-editor__link-panel').evaluate(node=>{const b=node.getBoundingClientRect();return {menu:{top:b.top,bottom:b.bottom,left:b.left,right:b.right},position:getComputedStyle(node).position};});
    assert.equal(link.position,'fixed');
    assert(Math.min(Math.abs(final.selection.top-link.menu.bottom),Math.abs(link.menu.top-final.selection.bottom))<=16,JSON.stringify(link));
    assert(link.menu.top>=0&&link.menu.bottom<=height+1&&link.menu.left>=0&&link.menu.right<=width+1);
    await address.press('Escape');
    await page.getByRole('toolbar').waitFor();
    assert.equal(await page.evaluate(()=>window.inlineTest.saves.length),0);
    assert.deepEqual(errors,[]);
    console.log(`PASS first offscreen selection ${width}×${height}: hidden first range, visible selection and first link panel stay anchored, frame stability and no API/writes`);
    await page.close();
  }
}
