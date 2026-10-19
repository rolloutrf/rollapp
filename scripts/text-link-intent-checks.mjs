import assert from "node:assert/strict";
const frames=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
export async function checkLinkIntent(browser,origin){
 for(const [width,height] of [[320,844],[390,844],[390,400],[768,844],[820,844],[1024,844],[1440,844],[1920,844]]){
  const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on("pageerror",error=>errors.push(error.message));await page.route("**/api/**",route=>{errors.push("Unexpected API request");return route.abort();});
  const editor=page.getByRole("textbox",{name:"О себе",exact:true}),address=page.getByRole("textbox",{name:"Адрес ссылки",exact:true});
  const goto=async(source,extra="")=>{await page.goto(`${origin}/__text-edit?source=${encodeURIComponent(source)}${extra}`);await editor.waitFor();await page.evaluate(()=>document.fonts.ready);};
  const read=()=>editor.evaluate(el=>el.editor.getJSON());
  const select=async(from,to=from)=>{await editor.locator("p").first().evaluate((p,{from,to})=>{p.closest('[contenteditable]').focus();getSelection().setBaseAndExtent(p.firstChild,from,p.firstChild,to);},{from,to});await page.keyboard.press("ControlOrMeta+k");await address.waitFor();};
  const apply=async href=>{await address.fill(href);await address.press("Enter");await address.waitFor({state:"hidden"});await frames(page);};
  // A new link is visible at its captured caret, then one Undo/Redo and exact reload.
  await goto("");await editor.click();await page.keyboard.press("ControlOrMeta+k");await address.waitFor();const empty=await read();const href="https://example.test/new";await apply(href);assert.equal(await editor.textContent(),href);assert.equal(await editor.locator("a").getAttribute("href"),href);assert.equal(await editor.evaluate(el=>(el.editor.state.storedMarks||[]).some(mark=>mark.type.name==="link")),false);const inserted=await read();
  await editor.press("ControlOrMeta+z");assert.deepEqual(await read(),empty);await editor.press("ControlOrMeta+Shift+z");assert.deepEqual(await read(),inserted);await editor.press("ControlOrMeta+s");await page.locator('[data-save-status="saved"]').waitFor();let saved=await page.evaluate(()=>window.inlineTest.saved);await goto(saved);assert.deepEqual(await read(),inserted);await page.goto(`${origin}/__text-edit?public=1&source=${encodeURIComponent(saved)}`);assert.equal(await page.getByRole("link",{name:href,exact:true}).getAttribute("href"),href);
  // Reverse native ranges keep only the original characters when peers change.
  await goto("First target tail");await select(12,6);await address.fill("https://example.test/target");await editor.evaluate(el=>{const e=el.editor;let tr=e.state.tr.insert(1,e.schema.text("Prefix "));tr.insert(tr.doc.content.size-1,e.schema.text(" suffix"));e.view.dispatch(tr);});assert(await address.isVisible());await address.press("Enter");await address.waitFor({state:"hidden"});assert.deepEqual(await editor.locator("a").allTextContents(),["target"]);assert.equal(await editor.textContent(),"Prefix First target tail suffix");const linked=await read();
  await editor.press("ControlOrMeta+z");assert.equal(await editor.locator("a").count(),0);assert.equal(await editor.textContent(),"Prefix First target tail suffix");await editor.press("ControlOrMeta+Shift+z");assert.deepEqual(await read(),linked);
  // Changes to the target, the source, explicit selection or permission retire the form.
  for(const reason of ["source","inside","selection","access"]){
   await goto("Original target\n\nSecond",reason==="access"?"&access=1":"");await select(0,8);await address.fill("https://example.test/stale");
   if(reason==="source")await editor.evaluate(el=>el.editor.commands.setContent("Remote replacement",{contentType:"markdown"}));
   if(reason==="inside")await editor.evaluate(el=>{const e=el.editor;e.view.dispatch(e.state.tr.insert(4,e.schema.text("changed")));});
   if(reason==="selection")await editor.evaluate(el=>el.editor.commands.setTextSelection(13));
   if(reason==="access")await page.getByRole("button",{name:"Только чтение",exact:true}).dispatchEvent("click");
   const replacement=await read();await address.waitFor({state:"hidden"});await page.keyboard.press("Enter");assert.deepEqual(await read(),replacement,`${reason}: retired form cannot commit to a replacement target`);assert.equal(await editor.locator("a").count(),0);assert.equal(await editor.evaluate(el=>(el.editor.state.storedMarks||[]).some(mark=>mark.type.name==="link")),false);
  }
  // Cursor inside an existing marked link updates the full mark, not a new URL.
  await goto('Before [**target**](/old "Keep title") after');await editor.locator("a").evaluate(el=>{el.closest('[contenteditable]').focus();const text=el.querySelector("strong").firstChild;getSelection().setBaseAndExtent(text,2,text,2);});await page.keyboard.press("ControlOrMeta+k");await address.waitFor();assert.equal(await address.inputValue(),"/old");await apply("https://example.test/updated");assert.equal(await editor.textContent(),"Before target after");assert.equal(await editor.locator("a").getAttribute("title"),"Keep title");assert.equal(await editor.locator("a strong").textContent(),"target");
  await editor.locator("a strong").evaluate(el=>{el.closest('[contenteditable]').focus();getSelection().setBaseAndExtent(el.firstChild,3,el.firstChild,3);});await page.keyboard.press("ControlOrMeta+k");await address.waitFor();await apply("");assert.equal(await editor.locator("a").count(),0);assert.equal(await editor.locator("strong").textContent(),"target");
  // Outside pointer/focus belongs to its destination and retires stale portals.
  await goto("Original", "&twins=1");const other=page.getByRole("textbox",{name:"Второй документ",exact:true});await other.waitFor();const firstBefore=await read(),otherBefore=await other.evaluate(el=>el.editor.getJSON());
  for(const method of ["pointer","focus"]){
   await editor.click();await page.keyboard.press("ControlOrMeta+k");await address.waitFor();await address.fill("https://pending.test");
   if(method==="pointer")await other.locator("p").click();else await other.focus();await address.waitFor({state:"hidden"});assert(await other.evaluate(el=>document.activeElement===el),"Closing the first form must not reclaim focus from its destination");assert.deepEqual(await read(),firstBefore);assert.deepEqual(await other.evaluate(el=>el.editor.getJSON()),otherBefore);
   await page.keyboard.press("ControlOrMeta+k");await address.waitFor();assert.equal(await address.count(),1,"Only the current editor owns a link form");await address.press("Escape");await address.waitFor({state:"hidden"});
  }
  // Invalid URLs and Escape change neither history nor prose.
  await goto("Safe target");await select(0,4);const safe=await read();await address.fill("javascript:alert(1)");await address.press("Enter");await page.getByRole("alert").waitFor();assert.deepEqual(await read(),safe);await address.dispatchEvent("keydown",{key:"Escape",code:"Escape",isComposing:true,bubbles:true,cancelable:true});await frames(page);assert(await address.isVisible(),"A composing Escape belongs to the link input method, not form dismissal");assert.deepEqual(await read(),safe);await address.press("Escape");await address.waitFor({state:"hidden"});assert.deepEqual(await read(),safe);
  assert.equal(await editor.evaluate(el=>{const s=getComputedStyle(el);return s.borderTopWidth==="0px"&&s.outlineWidth==="0px"&&s.boxShadow==="none";}),true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);if(width===390&&height===400)await page.screenshot({path:"/tmp/rollapp-link-intent-390-400.png"});await page.close();console.log(`PASS link intent ${width}×${height}: visible caret URL, reverse native target, outside edits, stale source/target/access guards, existing rich link/unlink, one Undo/Redo/reload/public read and no frames/API`);
 }
}
