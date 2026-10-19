import assert from "node:assert/strict";

const selectRange=(locator,range)=>locator.evaluate((el,{from,to,reverse})=>{
  el.focus();
  const texts=[],walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let text;
  while(text=walker.nextNode())texts.push(text);
  const point=offset=>{for(const node of texts){if(offset<=node.length)return [node,offset];offset-=node.length;}throw new Error("Invalid reference offset");};
  const start=point(from),end=point(to),selection=getSelection();
  selection.setBaseAndExtent(...(reverse?end:start),...(reverse?start:end));
},range);
const nativeOffset=locator=>locator.evaluate(el=>{
  const selection=getSelection(),range=document.createRange();range.selectNodeContents(el);range.setEnd(selection.focusNode,selection.focusOffset);
  return {offset:range.toString().length,collapsed:selection.isCollapsed};
});

// Compare actual keyboard handling with an unmanaged native editing host. This
// checks visual direction/graphemes independently of the application's command.
export async function checkTextNativeCaret(browser,origin){
 for(const [width,height]of [[390,400],[1440,400]]){
  const page=await browser.newPage({viewport:{width,height}}),errors=[];
  page.on("pageerror",error=>errors.push(error.message));await page.route("**/api/**",route=>{errors.push("Unexpected API request");return route.abort();});
  const cases=[
   {name:"formatted",source:'<div data-inline-block="true"><p><span data-inline-color="red"><strong><u><code>Обычный жирный текст и сосед.</code></u></strong></span></p></div>',dir:"ltr",from:0,to:29},
   {name:"rtl",source:"مرحبا بالعالم",dir:"rtl",from:0,to:6},
   {name:"mixed",source:"abc אבג def",dir:"ltr",from:4,to:7},
   {name:"graphemes",source:"А👩‍💻 е́",dir:"ltr",from:1,to:6},
  ];
  for(const current of cases){
   await page.goto(`${origin}/__text-edit?source=${encodeURIComponent(current.source)}`);
   const editor=page.getByRole("textbox",{name:"О себе",exact:true});await editor.locator("p").waitFor();await page.evaluate(()=>document.fonts.ready);
   const original=await editor.evaluate((el,dir)=>{el.dir=dir;const copy=el.cloneNode(true);copy.id="native-caret-reference";copy.setAttribute("aria-label","Нативный эталон");copy.style.width=`${el.getBoundingClientRect().width}px`;document.body.append(copy);return el.editor.getJSON();},current.dir);
   const reference=page.getByRole("textbox",{name:"Нативный эталон",exact:true});
   for(const reverse of [false,true])for(const key of ["ArrowLeft","ArrowRight"]){
    const range={from:current.from,to:current.to,reverse};
    await selectRange(reference,range);await page.keyboard.press(key);const expected=await nativeOffset(reference);assert(expected.collapsed);
    await selectRange(editor,range);await page.keyboard.press(key);const actual=await nativeOffset(editor);
    assert.deepEqual(actual,expected,`${current.name}/${reverse}/${key}: match the native visual endpoint`);
    const frames=await editor.evaluate(el=>new Promise(resolve=>{const frames=[],start=performance.now();const frame=()=>{frames.push({empty:el.editor.state.selection.empty,offset:el.editor.state.selection.$from.parentOffset,native:getSelection()?.isCollapsed,toolbar:document.querySelectorAll('[role="toolbar"]').length});if(performance.now()-start>=650)resolve(frames);else requestAnimationFrame(frame);};frame();}));
    for(const frame of frames){assert(frame.empty);assert(frame.native);assert.equal(frame.offset,expected.offset);assert.equal(frame.toolbar,0);}
    assert.deepEqual(await editor.evaluate(el=>el.editor.getJSON()),original,"Arrows must not insert spaces, delete text or change marks");
   }
   // Extend visual selections through the same native browser engine. Check
   // both range directions and collapsed endpoints, including bidi/graphemes.
   const rangeState=locator=>locator.evaluate(el=>{const s=getSelection(),offset=(node,end)=>{const r=document.createRange();r.selectNodeContents(el);r.setEnd(node,end);return r.toString().length;};return {anchor:offset(s.anchorNode,s.anchorOffset),focus:offset(s.focusNode,s.focusOffset),text:s.toString(),collapsed:s.isCollapsed};});
   for(const range of [{from:current.from,to:current.to,reverse:false},{from:current.from,to:current.to,reverse:true},{from:current.from,to:current.from,reverse:false},{from:current.to,to:current.to,reverse:false}])for(const key of ["Shift+ArrowLeft","Shift+ArrowRight"]){
    await selectRange(reference,range);await page.keyboard.press(key);const expected=await rangeState(reference);
    await selectRange(editor,range);await page.keyboard.press(key);assert.deepEqual(await rangeState(editor),expected,`${current.name}/${JSON.stringify(range)}/${key}: native visual extension`);
    const samples=await editor.evaluate(el=>new Promise(resolve=>{const values=[],start=performance.now();const frame=()=>{const s=getSelection(),offset=(node,end)=>{const r=document.createRange();r.selectNodeContents(el);r.setEnd(node,end);return r.toString().length;};values.push({anchor:offset(s.anchorNode,s.anchorOffset),focus:offset(s.focusNode,s.focusOffset),text:s.toString(),collapsed:s.isCollapsed});if(performance.now()-start>=650)resolve(values);else requestAnimationFrame(frame);};frame();}));
    for(const actual of samples)assert.deepEqual(actual,expected,`${current.name}/${key}: extension must stay stable`);
    assert.deepEqual(await editor.evaluate(el=>el.editor.getJSON()),original,"Native extension keeps exact text/marks");
   }
   // A fresh native focus plus an explicit collapsed range must not be mistaken
   // for the browser's automatic reset. Deliver the document event in this task
   // to cover ProseMirror's recent-focus heuristic without a timing lottery.
   await reference.evaluate(el=>el.focus());
   const explicitStart=await editor.evaluate(el=>{
    el.focus();el.editor.commands.setTextSelection({from:el.editor.state.doc.firstChild.content.size+1,to:2});
    const text=document.createTreeWalker(el,NodeFilter.SHOW_TEXT).nextNode();getSelection().setBaseAndExtent(text,0,text,0);
    el.ownerDocument.dispatchEvent(new Event("selectionchange"));
    return{model:el.editor.state.selection.toJSON(),collapsed:getSelection().isCollapsed,text:getSelection().toString()};
   });
   assert.deepEqual(explicitStart,{model:{type:"text",anchor:1,head:1},collapsed:true,text:""},`${current.name}: explicit start wins over stale pre-focus range`);
   // Returning through the editor's focus API still restores the owned range.
   const focusSelection=await editor.evaluate(el=>{el.editor.commands.setTextSelection({from:el.editor.state.doc.firstChild.content.size+1,to:1});return el.editor.state.selection.toJSON();});
   const nativeBeforeBlur=await rangeState(editor);await reference.evaluate(el=>el.focus());
   await editor.evaluate(el=>el.editor.view.focus());await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   assert.deepEqual(await rangeState(editor),nativeBeforeBlur,`${current.name}: editor focus preserves owned native range`);
   assert.deepEqual(await editor.evaluate(el=>el.editor.state.selection.toJSON()),focusSelection);assert.deepEqual(await editor.evaluate(el=>el.editor.getJSON()),original);
  }
  // A selectionchange can be delivered while native text/markup mutations
  // are still queued. Core must parse those changes before range synchronisation.
  const pendingEditor=page.getByRole("textbox",{name:"О себе",exact:true});
  for(const mode of ["append","middle","delete","markup"]){
   const source=mode==="middle"?"First\n\nBefore\n\nTail":"Before";await page.evaluate(()=>sessionStorage.removeItem("rollapp:text:inline-fixture:fixture"));await page.goto(`${origin}/__text-edit?source=${encodeURIComponent(source)}`);await pendingEditor.locator("p").first().waitFor();
   const pending=await pendingEditor.evaluate((el,mode)=>{
    el.focus();const paragraphs=[...el.querySelectorAll("p")],index=mode==="middle"?1:0,p=paragraphs[index];let text=p.firstChild;
    if(mode==="delete")text.deleteData(3,3);else if(mode==="markup"){const strong=document.createElement("strong");strong.textContent=text.textContent;p.replaceChildren(strong);text=strong.firstChild;}else text.appendData(" typed");
    getSelection().setBaseAndExtent(text,text.length,text,text.length);el.ownerDocument.dispatchEvent(new Event("selectionchange"));
    let expectedHead=1+text.length;for(let i=0;i<index;i++)expectedHead+=el.editor.state.doc.child(i).nodeSize;
    return {json:el.editor.getJSON(),modelText:el.editor.state.doc.textContent,domText:el.textContent,head:el.editor.state.selection.head,expectedHead,nativeOffset:getSelection().focusOffset,expectedNative:text.length,paragraphs:paragraphs.map(node=>node.textContent)};
   },mode);
   assert.equal(pending.modelText,pending.domText,`${mode}: native DOM input is retained`);assert.equal(pending.head,pending.expectedHead,`${mode}: caret follows parsed input`);assert.equal(pending.nativeOffset,pending.expectedNative);
   assert.deepEqual(pending.paragraphs,mode==="middle"?["First","Before typed","Tail"]:[mode==="delete"?"Bef":mode==="markup"?"Before":"Before typed"]);
   if(mode==="markup")assert(pending.json.content[0].content[0].marks.some(mark=>mark.type==="bold"));
  }
  assert.deepEqual(errors,[]);await page.close();console.log(`PASS native caret ${width}x${height}: styled/LTR/RTL/bidi/graphemes, collapse/extension in both directions and explicit/native-focus ownership and queued input retain browser semantics, 650ms stable reference cursor, exact queued input/marks/caret and no API`);
 }
}
