import assert from 'node:assert/strict';
const source=Array.from({length:70},(_,i)=>`Paragraph ${i+1}. A long document for native cursor navigation.`).join('\n\n');
const frames=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
async function caret(editor){return editor.evaluate(el=>{
 const s=getSelection(),r=document.createRange();r.setStart(s.focusNode,s.focusOffset);r.collapse(true);const c=r.getBoundingClientRect();
 const header=document.querySelector('.global-app-chrome')?.getBoundingClientRect(),nav=document.querySelector('.mobile-app-navigation')?.getBoundingClientRect();
 return {top:c.top,bottom:c.bottom,left:c.left,height:c.height,scrollY,head:el.editor.state.selection.head,native:el.editor.view.posAtDOM(s.focusNode,s.focusOffset),headerBottom:header?.bottom||0,navTop:nav?.top||innerHeight,heightLimit:innerHeight,active:document.activeElement?.getAttribute("aria-label"),behavior:getComputedStyle(document.documentElement).scrollBehavior};
});}
export async function checkCaretScroll(browser,origin){
 for(const [width,height] of [[320,844],[390,844],[768,844],[820,844],[1024,844],[1440,844],[1920,844],[390,400],[1440,400]]){
  const page=await browser.newPage({viewport:{width,height}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));await page.route('**/api/**',route=>{errors.push('Unexpected API request');return route.abort();});
  await page.goto(`${origin}/app/spheres/career?tab=about&__text_fixture=1&chrome=1&source=${encodeURIComponent(source)}`);
  const editor=page.getByRole('textbox',{name:'О себе',exact:true});await editor.locator('p').last().waitFor();await page.evaluate(()=>document.fonts.ready);

  const before=await editor.evaluate(el=>el.editor.getJSON());await editor.locator('p').nth(35).click();await page.keyboard.press('Home');await frames(page);
  const samples=[];let hidden=null;
  for(let step=0;step<45;step++){
   await page.keyboard.press('ArrowUp');await frames(page);const c=await caret(editor);samples.push(c);
   if(c.height>0&&c.top<c.headerBottom+8){hidden={step,...c};break;}
  }
  await page.waitForTimeout(650);const settled=await caret(editor);
  console.log('CARET SCROLL',width,height,JSON.stringify({hidden,settled,last:samples.slice(-3)}));
  await page.screenshot({path:`/tmp/rollapp-caret-header-candidate-${width}-${height}.png`});
  assert.equal(hidden,null,'native ArrowUp caret must remain below the app chrome on every frame');
  assert(settled.top>=settled.headerBottom+8,'native ArrowUp caret must remain below the app chrome');
  for(const key of ['ArrowDown','Shift+ArrowDown','ArrowUp','Shift+ArrowUp']){
   await editor.locator('p').nth(35).click();await page.keyboard.press('Home');await frames(page);
   for(let step=0;step<45;step++){
    await page.keyboard.press(key);await frames(page);const c=await caret(editor);
    assert.equal(c.head,c.native,`${key} preserves native cursor`);
    assert(c.top>=c.headerBottom+8,`${key} caret top ${c.top} below chrome ${c.headerBottom}`);
    assert(c.bottom<=c.navTop-8,`${key} step ${step} caret ${JSON.stringify(c)} above navigation ${c.navTop}`);
   }
  }
  // Manual scroll must stay where the user put it, even with an offscreen caret.
  await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await page.waitForTimeout(650);assert.equal(await page.evaluate(()=>scrollY),0);
  await page.getByRole('button',{name:'Поделиться',exact:true}).focus();
  assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).scrollBehavior),'smooth');
  assert.deepEqual(await editor.evaluate(el=>el.editor.getJSON()),before);assert.equal(await page.evaluate(()=>window.inlineTest.saves.length),0);assert.deepEqual(errors,[]);
  await page.close();console.log(`PASS caret scroll ${width}×${height}: native arrows/Shift selection stay between app controls, native cursor parity, manual scroll/blur preserved, unchanged text and no saves/API`);
 }
}
