import assert from 'node:assert/strict';
const lines=Array.from({length:70},(_,i)=>`Paragraph ${i+1}. A long document for native cursor navigation.`);
const frames=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
async function signature(host){return host.evaluate(el=>{const s=getSelection(),offset=(node,n)=>{const r=document.createRange();r.selectNodeContents(el);r.setEnd(node,n);return r.toString().length;};return {anchor:offset(s.anchorNode,s.anchorOffset),focus:offset(s.focusNode,s.focusOffset)};});}
async function middle(host,plain){
 if(!plain){await host.locator('p').nth(35).click();return;}
 await host.focus();await host.evaluate(el=>{const node=el.firstChild,position=el.textContent.indexOf('Paragraph 36.')+35;getSelection().collapse(node,position);el.scrollIntoView({block:'center',behavior:'instant'});});
}
export async function checkNativePageKeys(browser,origin){
 for(const [width,height] of [[1024,844],[1440,400]]){
  const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',r=>{errors.push('Unexpected API request');return r.abort();});
  const platform=await page.evaluate(()=>navigator.platform),mac=/Mac/.test(platform);
  for(const plain of [false,true]){
   const source=lines.join(plain?'\n':'\n\n');await page.goto(`${origin}/app/spheres/career?tab=about&__text_fixture=1&chrome=1${plain?'&plain=1':''}&source=${encodeURIComponent(source)}`);
   const editor=page.getByRole('textbox',{name:plain?'Описание блока':'О себе',exact:true});await editor.waitFor();await page.evaluate(()=>document.fonts.ready);
   const initial=await editor.evaluate(el=>el.editor?el.editor.getJSON():el.textContent);
   await editor.evaluate(el=>{const peer=el.cloneNode(true);peer.id='native-page-reference';peer.setAttribute('aria-label','Нативный текст');el.closest('.sphere-text-page').appendChild(peer);});const peer=page.locator('#native-page-reference');
   assert.equal(await peer.evaluate(el=>Boolean(el.editor)),false);
   await middle(peer,plain);const nativeBefore=await signature(peer);await peer.press('Home');await page.waitForTimeout(650);const nativeHome=await signature(peer),homeTop=await page.evaluate(()=>scrollY===0);if(mac){assert.deepEqual(nativeHome,nativeBefore,'native macOS Home leaves the caret unchanged');assert(homeTop);}
   await peer.press('End');await page.waitForTimeout(650);const nativeEnd=await signature(peer),endBottom=await page.evaluate(()=>Math.abs(scrollY-(document.scrollingElement.scrollHeight-document.scrollingElement.clientHeight))<=1);if(mac){assert.deepEqual(nativeEnd,nativeBefore,'native macOS End leaves the caret unchanged');assert(endBottom);}
   await peer.evaluate(el=>el.remove());await middle(editor,plain);await frames(page);const before=await signature(editor);assert.deepEqual(before,nativeBefore,"native and managed references start at the same caret");await editor.press('Home');await frames(page);assert.deepEqual(await signature(editor),nativeHome);if(homeTop)assert.equal(await page.evaluate(()=>scrollY),0);
   await editor.press('End');await frames(page);assert.deepEqual(await signature(editor),nativeEnd);if(endBottom)assert(await page.evaluate(()=>Math.abs(scrollY-(document.scrollingElement.scrollHeight-document.scrollingElement.clientHeight))<=1));
   if(!plain&&mac){
    await middle(editor,false);await editor.press('Escape');await frames(page);const block=await editor.evaluate(el=>el.editor.state.selection.toJSON());assert.equal(block.type,'rollappBlocks');await editor.press('Home');await frames(page);assert.deepEqual(await editor.evaluate(el=>el.editor.state.selection.toJSON()),block);assert.equal(await page.evaluate(()=>scrollY),0);await editor.press('End');await frames(page);assert.deepEqual(await editor.evaluate(el=>el.editor.state.selection.toJSON()),block);await editor.press('Escape');
   }
   for(let repetition=0;repetition<3;repetition++)for(const delay of [0,4,8,16,24,32,40]){
    await middle(editor,plain);await editor.press('Home');if(delay)await page.waitForTimeout(delay);await editor.press('Shift+ArrowUp');await frames(page);
    const point=await editor.evaluate(el=>{const s=getSelection(),r=document.createRange();r.setStart(s.focusNode,s.focusOffset);r.collapse(true);const b=r.getBoundingClientRect();return {top:b.top,bottom:b.bottom,height:b.height,header:document.querySelector('.global-app-chrome').getBoundingClientRect().bottom,model:el.editor?.state.selection.head,native:el.editor?.view.posAtDOM(s.focusNode,s.focusOffset)};});
    if(!(point.height>0&&point.top>=point.header+8&&point.bottom<=height-8)){await page.screenshot({path:`/tmp/rollapp-native-page-key-failure-${plain?'plain':'rich'}-${width}-${height}.png`});console.log('NATIVE PAGE KEY',JSON.stringify({plain,width,height,repetition,delay,point}));}
    assert(point.height>0&&point.top>=point.header+8&&point.bottom<=height-8,'editing after viewport navigation must reveal its real native caret');if(!plain)assert.equal(point.native,point.model);
   }
   await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await page.waitForTimeout(650);assert.equal(await page.evaluate(()=>scrollY),0,'manual scrolling must not trigger another caret reveal');assert.deepEqual(await editor.evaluate(el=>el.editor?el.editor.getJSON():el.textContent),initial);assert.equal(await page.evaluate(()=>window.inlineTest.saves.length),0);if(plain)assert.deepEqual(await page.evaluate(()=>window.inlinePlainTest.inputs),[]);
  }
  assert.deepEqual(errors,[]);await page.close();console.log(`PASS native page keys ${width}×${height}: actual ${platform} unmanaged Home/End reference, same endpoints/selection for rich/plain${mac?" and macOS block selection":"; macOS-only block selection branch not run"}, 42 rapid Home→Shift+Up phases, native parity, manual scrolling, no text/input/API changes`);
 }
}
