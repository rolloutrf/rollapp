import assert from "node:assert/strict";
import { MarkdownManager } from "@tiptap/markdown";
import { inlineEditorExtensions } from "../src/lib/inline-editor-extensions.js";
import { IDENTITY_QUESTION_TITLES } from "../shared/identity-questions.js";

const frames = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const source = 'Lead\n\n<div data-inline-block="true"><img src="/__resize-image.svg" alt="Diagram" title="Original title" width="240" height="120" data-width-number="true" data-height-number="true" /></div>\n\nTail';
const manager=new MarkdownManager({extensions:inlineEditorExtensions()}),p=text=>({type:"paragraph",content:text?[{type:"text",text}]:[]}),i=()=>({type:"image",attrs:{src:"/__resize-image.svg",alt:"Diagram",title:"Original title",width:240,height:120}});
const resizedJSON=(doc,dimensions)=>{const result=structuredClone(doc);let found=false;const visit=node=>{if(node.type==="image"&&!found){Object.assign(node.attrs,dimensions);found=true;}for(const child of node.content||[])visit(child);};visit(result);assert(found);return result;};

export async function checkImageResize(browser, origin, diagnostic = false) {
  const sizes = diagnostic ? [[390,400],[1440,400]] : [[320,844],[390,844],[390,400],[768,844],[820,844],[1024,844],[1440,844],[1920,844]];
  for (const [width,height] of sizes) {
    const page = await browser.newPage({ viewport:{width,height} }), errors=[];
    page.on("pageerror", error => errors.push(error.message));
    await page.exposeBinding("imageResizeError", (_source,message) => errors.push(message));
    await page.addInitScript(() => {
      if(performance.getEntriesByType("navigation")[0]?.type!=="reload")sessionStorage.removeItem("rollapp:text:inline-fixture:fixture");
      window.addEventListener("error",event=>{void window.imageResizeError(event.message);});
      window.addEventListener("unhandledrejection",event=>{void window.imageResizeError(String(event.reason));});
      document.addEventListener("pointerdown",event=>{window.lastResizePointer={id:event.pointerId,type:event.pointerType};},true);
    });
    await page.route("**/api/**", route=>{errors.push("Unexpected API request");return route.abort();});
    await page.route("**/__resize-image.svg", route=>route.fulfill({contentType:"image/svg+xml",body:'<svg xmlns="http://www.w3.org/2000/svg" width="864" height="432"><rect width="864" height="432" fill="#737373"/><circle cx="432" cy="216" r="128" fill="#f5f5f5"/></svg>'}));
    const editor=page.getByRole("textbox",{name:"О себе",exact:true}), image=editor.locator("img");
    const read=()=>editor.evaluate(el=>el.editor.getJSON());
    const goto=async (value,extra="")=>{await page.goto(`${origin}/__text-edit?source=${encodeURIComponent(value)}${extra}`);await image.waitFor();await image.evaluate(el=>el.decode());await page.evaluate(()=>document.fonts.ready);await frames(page);};
    const handle=side=>page.getByRole("separator",{name:`Изменить ширину изображения ${side==="right"?"справа":"слева"}`,exact:true});
    await goto(source);
    const before=await read();
    await image.hover();await frames(page);
    assert.equal(await handle("right").count(),1,"Hovering a real image must expose its right resize guide");
    assert.equal(await handle("left").count(),1,"Both image edges have a resize guide");
    for (const [side,delta] of [["right",40],["left",-32]]) {
      await image.hover();await frames(page);
      const initial=await read(),box=await image.boundingBox(),control=await handle(side).boundingBox();
      await page.mouse.move(control.x+control.width/2,control.y+control.height/2);await page.mouse.down();
      assert.equal(await handle(side).evaluate(el=>el.hasPointerCapture(1)),true,"Native pointer owner stays mounted");
      await page.mouse.move(control.x+control.width/2+delta,control.y+control.height/2,{steps:4});await frames(page);
      assert.deepEqual(await read(),initial,"Resize preview cannot write document or autosave");
      const preview=await image.boundingBox();assert(preview.width>box.width+20);assert(Math.abs(preview.width/preview.height-2)<0.02,"Preview keeps the displayed aspect ratio");
      await page.mouse.up();await frames(page);const resized=await read();
      assert.equal(resized.content[1].attrs.width,Math.round(preview.width));assert.equal(resized.content[1].attrs.height,Math.round(preview.height));
      assert.deepEqual(resized.content[0],initial.content[0]);assert.deepEqual(resized.content[2],initial.content[2]);
      assert.deepEqual({...resized.content[1].attrs,width:initial.content[1].attrs.width,height:initial.content[1].attrs.height},initial.content[1].attrs,"Only dimensions change");
      await editor.press("ControlOrMeta+z");assert.deepEqual(await read(),initial);await editor.press("ControlOrMeta+Shift+z");assert.deepEqual(await read(),resized);
      await editor.press("ControlOrMeta+z");assert.deepEqual(await read(),initial);
    }
    assert.deepEqual(await read(),before);assert.deepEqual(errors,[]);
    const start=async(side="right",delta=24)=>{
      await image.hover();await frames(page);const box=await image.boundingBox(),control=await handle(side).boundingBox();
      await page.mouse.move(control.x+control.width/2,control.y+control.height/2);await page.mouse.down();
      await page.mouse.move(control.x+control.width/2+(side==="left"?-delta:delta),control.y+control.height/2,{steps:3});await frames(page);return box;
    };
    // A cancelled preview owns no history event and restores its native caret.
    for(const reason of ["Escape","capture","cancel","selection","source","access","ime","blur"]){
      await goto(source,"&access=1");await editor.locator("p").last().click();
      const clicked=await editor.evaluate(el=>{const s=el.ownerDocument.getSelection();return{model:el.editor.state.selection.toJSON(),native:el.contains(s.focusNode)?el.editor.view.posAtDOM(s.focusNode,s.focusOffset):null};});console.log("RESIZE CARET BASELINE",width,height,reason,JSON.stringify(clicked));
      await page.waitForFunction(()=>{const el=document.querySelector('[role="textbox"][aria-label="О себе"]'),s=getSelection();return el.contains(s.focusNode)&&el.editor.state.selection.head===el.editor.view.posAtDOM(s.focusNode,s.focusOffset);});
      const initial=await read(),selection=await editor.evaluate(el=>el.editor.state.selection.toJSON());const box=await start();
      assert.deepEqual(await read(),initial);let expected=initial;
      if(reason==="Escape")await page.keyboard.press("Escape");
      if(reason==="capture")await handle("right").evaluate(el=>el.releasePointerCapture(1));
      if(reason==="cancel")await handle("right").dispatchEvent("pointercancel",{pointerId:1,pointerType:"mouse"});
      if(reason==="selection")await editor.evaluate(el=>el.editor.commands.setTextSelection(2));
      if(reason==="source"){await editor.evaluate(el=>el.editor.commands.setContent('Replacement source',{contentType:'markdown'}));expected=await read();}
      if(reason==="access")await page.getByRole("button",{name:"Только чтение",exact:true}).dispatchEvent("click");
      if(reason==="ime")await editor.dispatchEvent("compositionstart",{data:"т"});
      if(reason==="blur")await page.evaluate(()=>window.dispatchEvent(new Event("blur")));
      await frames(page);await page.mouse.up();await frames(page);assert.deepEqual(await read(),expected,`${reason}: stale resize must not write`);
      if(reason!=="source")assert.deepEqual(await image.boundingBox(),box,`${reason}: preview must restore the actual image geometry`);
      if(["Escape","capture","cancel","access","ime","blur"].includes(reason))assert.deepEqual(await editor.evaluate(el=>el.editor.state.selection.toJSON()),selection,`${reason}: resize cancellation cannot move the caret`);
      if(reason==="Escape")assert.equal(await editor.evaluate(el=>el.ownerDocument.activeElement===el),true);
      if(reason==="ime")await editor.dispatchEvent("compositionend",{data:""});
    }
    // Keyboard controls use the same transaction/history and CSS parent bounds.
    await goto(source);await image.hover();await frames(page);const keyboardBefore=await read();
    await page.evaluate(()=>{window.imagePortalSaveFlags=[];window.addEventListener("keydown",event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==="s")setTimeout(()=>window.imagePortalSaveFlags.push({prevented:event.defaultPrevented,label:event.target.getAttribute("aria-label")}),0);},true);});
    await handle("right").press("ControlOrMeta+s");await page.waitForFunction(()=>window.imagePortalSaveFlags.length);assert.deepEqual(await page.evaluate(()=>window.imagePortalSaveFlags),[{prevented:true,label:"Изменить ширину изображения справа"}],"Image control Save must stay inside its document owner");assert(await handle("right").evaluate(el=>document.activeElement===el));assert.deepEqual(await read(),keyboardBefore);assert.equal(await page.evaluate(()=>window.inlineTest.saves.length),0,"Saving an unchanged image control cannot create a write");
    await handle("right").press("ArrowRight");await frames(page);let sized=await read();assert.equal(sized.content[1].attrs.width,248);assert.equal(sized.content[1].attrs.height,124);
    await editor.press("ControlOrMeta+z");assert.deepEqual(await read(),keyboardBefore);await image.hover();await frames(page);await handle("right").press("End");await frames(page);sized=await read();const bounded=await image.boundingBox();assert(bounded.width<=width-28);assert.equal(sized.content[1].attrs.width,Math.round(bounded.width));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    await editor.press("ControlOrMeta+s");await page.locator('[data-save-status="saved"]').waitFor();const saved=await page.evaluate(()=>window.inlineTest.saved);assert.equal(typeof saved,"string");await goto(saved);assert.deepEqual(await read(),sized);
    await page.goto(`${origin}/__text-edit?public=1&source=${encodeURIComponent(saved)}`);await page.getByRole("img",{name:"Diagram",exact:true}).waitFor();assert.equal(await page.locator('[data-image-resize]').count(),0);assert.equal(await page.getByRole("img",{name:"Diagram",exact:true}).getAttribute("width"),String(sized.content[1].attrs.width));
    // Nested owners retain exact children, cell peers, columns and rich attrs.
    const contexts=[
      {type:"nestedBlock",content:[i(),p("Nested child")]},
      {type:"bulletList",content:[{type:"listItem",content:[p("List parent"),i(),p("List child")]}]},
      {type:"table",content:[{type:"tableRow",content:[{type:"tableCell",content:[i(),p("Cell child")]},{type:"tableCell",content:[p("Cell peer")]}]}]},
      {type:"columns",content:[{type:"column",content:[i(),p("Column child")]},{type:"column",content:[p("Column peer")]}]},
      {type:"details",attrs:{open:true},content:[{type:"detailsSummary",content:[{type:"text",text:"Toggle parent"}]},{type:"detailsContent",content:[i(),p("Toggle child")]}]},
    ];
    for(const context of contexts){
      await goto(manager.serialize({type:"doc",content:[context,p("Outer tail")]}));const initial=await read();await image.hover();await frames(page);const box=await image.boundingBox(),control=await handle("right").boundingBox();const delta=-Math.min(24,box.width/4);
      await page.mouse.move(control.x+control.width/2,control.y+control.height/2);await page.mouse.down();await page.mouse.move(control.x+control.width/2+delta,control.y+control.height/2,{steps:3});await frames(page);assert.deepEqual(await read(),initial);const preview=await image.boundingBox();await page.mouse.up();await frames(page);
      const expected=resizedJSON(initial,{width:Math.round(preview.width),height:Math.round(preview.height)});assert.deepEqual(await read(),expected,`${context.type}: only its image dimensions change`);await editor.press("ControlOrMeta+z");assert.deepEqual(await read(),initial);
    }
    // A second editor must not keep stale selected-image chrome on the page.
    await goto(source,`&twins=1&secondSource=${encodeURIComponent(source)}`);await image.click();await frames(page);
    const second=page.getByRole("textbox",{name:"Второй документ",exact:true});await second.locator("img").click();await frames(page);assert.equal(await page.locator('[data-image-resize]').count(),2,"Only the hovered/focused editor owns its image guides");
    await editor.focus();await frames(page);assert.equal(await editor.evaluate(el=>el.editor.state.selection.node?.type.name),"image");assert.equal(await page.locator('[data-image-resize]').count(),2,"Returning native focus to the original selected image restores only its guides");const returnBox=await image.boundingBox();assert((await page.locator('[data-image-resize]').evaluateAll(nodes=>nodes.map(el=>el.getBoundingClientRect().toJSON()))).every(rect=>rect.top>=returnBox.y&&rect.bottom<=returnBox.y+returnBox.height),"Returned guides belong to the first image, not its inactive peer");
    // A portalled separator belongs to this image, not every editor's portal.
    await handle("right").focus();await frames(page);assert.equal(await page.locator('[data-image-resize]').count(),2);
    await second.locator("img").hover();await frames(page);assert.equal(await page.locator('[data-image-resize]').count(),2,"Hovering another editor retires the previous focused image controls");
    const secondBox=await second.locator("img").boundingBox();assert((await page.locator('[data-image-resize]').evaluateAll(nodes=>nodes.map(el=>el.getBoundingClientRect().toJSON()))).every(rect=>rect.top>=secondBox.y&&rect.bottom<=secondBox.y+secondBox.height));
    await handle("right").focus();await frames(page);assert.equal(await page.locator('[data-image-resize]').count(),2,"Only the second image owns its focused portal controls");
    await editor.focus();await frames(page);assert.equal(await page.locator('[data-image-resize]').count(),2,"Returning editor focus retires the second portalled controls");
    // Partly occluded media keeps its guide in the actual usable viewport.
    const longSource=Array.from({length:16},(_,n)=>`Before ${n}`).join("\n\n")+"\n\n"+source+"\n\n"+Array.from({length:16},(_,n)=>`After ${n}`).join("\n\n");
    await goto(longSource,"&chrome=1");await image.hover();await frames(page);
    await image.evaluate(el=>window.scrollBy({top:el.getBoundingClientRect().top-8,behavior:"instant"}));await frames(page);
    const guideBounds=await page.evaluate(()=>{const header=document.querySelector('.global-app-chrome')?.getBoundingClientRect(),nav=document.querySelector('.mobile-app-navigation')?.getBoundingClientRect(),v=visualViewport;return{top:Math.max(v.offsetTop,header?.height?header.bottom:0)+8,bottom:Math.min(v.offsetTop+v.height,nav?.height?nav.top:Infinity)-8,guides:[...document.querySelectorAll('[data-image-resize]')].map(el=>el.getBoundingClientRect().toJSON())};});
    assert.equal(guideBounds.guides.length,2);assert(guideBounds.guides.every(r=>r.top>=guideBounds.top&&r.bottom<=guideBounds.bottom),`Image guides must clear fixed chrome: ${JSON.stringify(guideBounds)}`);
    if(width===390&&height===400){
      await page.evaluate(()=>{Object.defineProperty(visualViewport,"height",{configurable:true,value:220});Object.defineProperty(visualViewport,"offsetTop",{configurable:true,value:96});visualViewport.dispatchEvent(new Event("resize"));visualViewport.dispatchEvent(new Event("scroll"));});await image.hover();await frames(page);
      const panned=await page.locator('[data-image-resize]').evaluateAll(nodes=>nodes.map(el=>el.getBoundingClientRect().toJSON()));assert(panned.length===2&&panned.every(r=>r.top>=104&&r.bottom<=308),JSON.stringify(panned));
      await page.evaluate(()=>{delete visualViewport.height;delete visualViewport.offsetTop;visualViewport.dispatchEvent(new Event("resize"));visualViewport.dispatchEvent(new Event("scroll"));});
    }
    // CDP sends genuine Chromium touch/pointer events, not React callbacks.
    await goto(source);await image.hover();await frames(page);const touchBefore=await read(),touchBox=await handle("right").boundingBox(),touch={x:touchBox.x+touchBox.width/2,y:touchBox.y+touchBox.height/2};const cdp=await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[touch]});await frames(page);const nativeTouch=await page.evaluate(()=>window.lastResizePointer);assert.equal(nativeTouch.type,"touch");assert.equal(await handle("right").evaluate((el,id)=>el.hasPointerCapture(id),nativeTouch.id),true);
    await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:touch.x+32,y:touch.y}]});await frames(page);assert.deepEqual(await read(),touchBefore);const touchPreview=await image.boundingBox();assert(touchPreview.width>240);await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});await frames(page);assert.deepEqual(await read(),resizedJSON(touchBefore,{width:Math.round(touchPreview.width),height:Math.round(touchPreview.height)}));
    await editor.press("ControlOrMeta+z");assert.deepEqual(await read(),touchBefore);await image.hover();await frames(page);const cancelBox=await handle("right").boundingBox(),cancelTouch={x:cancelBox.x+cancelBox.width/2,y:cancelBox.y+cancelBox.height/2};await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[cancelTouch]});await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:cancelTouch.x+24,y:cancelTouch.y}]});await frames(page);await cdp.send("Input.dispatchTouchEvent",{type:"touchCancel",touchPoints:[]});await frames(page);assert.deepEqual(await read(),touchBefore);assert.equal((await image.boundingBox()).width,240);await cdp.detach();
    // Resize inside a protected answer changes none of its prompts or peers.
    const questions={questions:IDENTITY_QUESTION_TITLES.map((title,index)=>({title,paragraphs:[index===0?source:`Untouched answer ${index}`]}))};
    await page.goto(`${origin}/__text-edit?four=1&questions=${encodeURIComponent(JSON.stringify(questions))}`);const four=page.getByRole("textbox",{name:"Ответы на четыре вопроса",exact:true}),fourImage=four.locator("img");await fourImage.waitFor();await fourImage.evaluate(el=>el.decode());const fourBefore=await four.evaluate(el=>el.editor.getJSON());await fourImage.hover();await frames(page);const fourBox=await handle("right").boundingBox();await page.mouse.move(fourBox.x+fourBox.width/2,fourBox.y+fourBox.height/2);await page.mouse.down();await page.mouse.move(fourBox.x+fourBox.width/2-24,fourBox.y+fourBox.height/2,{steps:3});await frames(page);const fourPreview=await fourImage.boundingBox();await page.mouse.up();await frames(page);const fourExpected=resizedJSON(fourBefore,{width:Math.round(fourPreview.width),height:Math.round(fourPreview.height)});assert.deepEqual(await four.evaluate(el=>el.editor.getJSON()),fourExpected);await four.press("ControlOrMeta+z");assert.deepEqual(await four.evaluate(el=>el.editor.getJSON()),fourBefore);await four.press("ControlOrMeta+Shift+z");assert.deepEqual(await four.evaluate(el=>el.editor.getJSON()),fourExpected);await four.press("ControlOrMeta+s");await page.locator('[data-save-status="saved"]').waitFor();const savedQuestions=await page.evaluate(()=>window.inlineTest.saved);assert.deepEqual(savedQuestions.questions.map(q=>q.title),IDENTITY_QUESTION_TITLES);assert.deepEqual(savedQuestions.questions.slice(1),questions.questions.slice(1));await page.goto(`${origin}/__text-edit?four=1&questions=${encodeURIComponent(JSON.stringify(savedQuestions))}`);await four.locator("img").waitFor();assert.deepEqual(await four.evaluate(el=>el.editor.getJSON()),fourExpected);
    // A failed resize save remains an exact recoverable draft, then retries.
    await goto(source,"&error=1");await start("right",24);const draftPreview=await image.boundingBox();await page.mouse.up();await frames(page);const draft=await read();assert.equal(draft.content[1].attrs.width,Math.round(draftPreview.width));await editor.press("ControlOrMeta+s");await page.locator('[data-save-status="error"]').waitFor();await page.reload();await image.waitFor();await page.locator('[data-save-status="error"]').waitFor();assert.deepEqual(await read(),draft);await page.evaluate(()=>{window.inlineTest.fail=false;});await page.getByRole("button",{name:"Повторить сохранение",exact:true}).click();await page.locator('[data-save-status="saved"]').waitFor();const retried=await page.evaluate(()=>window.inlineTest.saved);await goto(retried);assert.deepEqual(await read(),draft);
    const appearance=await editor.evaluate(el=>{const s=getComputedStyle(el);return{border:s.borderTopWidth,outline:s.outlineWidth,shadow:s.boxShadow,overflow:document.documentElement.scrollWidth>innerWidth+1};});assert.deepEqual(appearance,{border:"0px",outline:"0px",shadow:"none",overflow:false});
    assert.deepEqual(errors,[]);
    await page.screenshot({path:`/tmp/rollapp-image-resize-${width}-${height}.png`});await page.close();
    console.log(`PASS image resize ${width}x${height}: native edge/touch capture, proportional preview, eight cancel guards, keyboard/parent/chrome/panned viewport bounds, five nested owners, protected questions/draft/retry/public read, exact Undo/Redo and no frames/API/errors`);
  }
}
