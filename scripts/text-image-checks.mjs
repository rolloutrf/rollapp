import { MarkdownManager } from "@tiptap/markdown";
import assert from "node:assert/strict";
import { getSchema } from "@tiptap/core";
import { inlineEditorExtensions } from "../src/lib/inline-editor-extensions.js";

export const imageFixturePNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aTioAAAAASUVORK5CYII=", "base64");
const schema = getSchema(inlineEditorExtensions()), json = node => JSON.parse(JSON.stringify(node.toJSON()));
const frames = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
// Native line-start keys differ by OS: Ctrl+Left on Linux moves by words.
// Keep slash insertion at a real boundary without changing editor selection in JS.
async function openNativeImageSlash(page, owner) {
  await owner.press(process.platform === "darwin" ? "Meta+ArrowLeft" : "Home");
  await frames(page);
  const prefix = await owner.evaluate(el => {
    const { $from, empty } = el.editor.state.selection;
    return empty ? $from.parent.textBetween(0, $from.parentOffset, "\n", "\ufffc") : null;
  });
  assert(prefix !== null && (prefix === "" || /\s$/.test(prefix)), `Image slash must start at a word boundary: ${JSON.stringify(prefix)}`);
  await page.keyboard.type("/image");
  const choice = page.getByRole("group", { name: "Команды блока", exact: true }).getByRole("button", { name: "Изображение", exact: true });
  await choice.waitFor();
  assert.equal(await choice.getAttribute("aria-pressed"), "true", "Image is the selected slash command before native Enter");
  await page.keyboard.press("Enter");
}
export async function checkImages(browser, origin, diagnostic = false) {
  const sizes = diagnostic ? [[390,400],[1440,400]] : [[320,844],[390,844],[390,400],[768,844],[820,844],[1024,844],[1440,844],[1920,844]];
  for (const [width,height] of sizes) {
    const page = await browser.newPage({ viewport:{width,height}, permissions:["clipboard-read","clipboard-write"] }), errors=[];
    page.on("pageerror", error=>errors.push(error.message));
    await page.exposeBinding("reportInlineImageError", (_source, detail)=>{errors.push(detail.message);console.log("IMAGE CLIENT ERROR",JSON.stringify(detail));});
    await page.route("**/api/**", route=>{ errors.push("Unexpected API request"); return route.abort(); });
    await page.addInitScript(({diagnostic})=>{
      if (performance.getEntriesByType("navigation")[0]?.type !== "reload") sessionStorage.removeItem("rollapp:text:inline-fixture:fixture");
      window.inlineImageFixture={uploads:[],releases:[],pending:[],slow:false,fail:false};
      window.inlineImageFocusChoice={armed:false,count:0};
      new MutationObserver(()=>{
        if(!window.inlineImageFocusChoice.armed)return;
        const target=document.querySelector('.inline-editor__image-menu[aria-label="Изменить изображение"] input[id$="-alt"]');
        if(!target)return;
        window.inlineImageFocusChoice.armed=false;window.inlineImageFocusChoice.count++;
        target.focus({preventScroll:true});target.select();
      }).observe(document,{childList:true,subtree:true});
      const trail=[];
      if(diagnostic){const Original=window.ResizeObserver;window.ResizeObserver=class extends Original{constructor(callback){const origin=new Error().stack;super((entries,observer)=>{trail.push({time:performance.now(),origin,entries:entries.map(entry=>({tag:entry.target.tagName,classes:String(entry.target.className),width:entry.contentRect.width,height:entry.contentRect.height}))});if(trail.length>30)trail.shift();callback(entries,observer);});}};}
      window.addEventListener("error",event=>{void window.reportInlineImageError({message:event.message,trail,active:document.activeElement?.outerHTML?.slice(0,200),imagePicker:Boolean(document.querySelector('.inline-editor__image-menu')),uploads:window.inlineImageFixture.uploads.length}).catch(()=>{});});
      window.addEventListener("unhandledrejection",event=>{void window.reportInlineImageError({message:String(event.reason?.message||event.reason),trail}).catch(()=>{});});
    },{diagnostic});
    const url=value=>`${origin}/__text-edit?source=${encodeURIComponent(value)}`, editor=page.getByRole("textbox",{name:"О себе",exact:true});
    const read=()=>editor.evaluate(el=>el.editor.getJSON());
    const open=async (slash=true)=>{
      await editor.locator("p").first().click();
      if (slash) await openNativeImageSlash(page, editor);
      else { await editor.press("ControlOrMeta+/"); const menu=page.getByRole("dialog",{name:"Действия текстового блока",exact:true});await menu.getByRole("searchbox",{name:"Поиск действий блока"}).fill("image");await menu.getByRole("searchbox",{name:"Поиск действий блока"}).press("Enter"); }
      const picker=page.getByRole("dialog",{name:"Добавить изображение",exact:true});await picker.waitFor();return picker;
    };
    const chooseFile=async (picker, type="image/png")=>{
      const pending=page.waitForEvent("filechooser");await picker.getByRole("button",{name:"Загрузить изображение",exact:true}).click();
      await (await pending).setFiles({name:type==="image/png"?"image.png":"invalid.svg",mimeType:type,buffer:type==="image/png"?imageFixturePNG:Buffer.from("<svg/>")});
    };
    // Dismissing the deferred picker keeps the literal query, not an invalid
    // empty image node. An invalid URL must not change text or history either.
    await page.goto(url("Lead\n\nTail"));await editor.locator("p").nth(1).waitFor();
    let picker=await open(); const query=await read();
    await picker.getByLabel("Адрес изображения",{exact:true}).fill("javascript:alert(1)");await picker.getByRole("button",{name:"Добавить",exact:true}).click();await picker.getByRole("alert").waitFor();assert.deepEqual(await read(),query);
    await picker.getByRole("button",{name:"Отмена",exact:true}).click();assert.deepEqual(await read(),query);
    // A URL insertion preserves prose and marks and creates its own paragraph.
    await page.goto(url("Lead\n\nTail"));await editor.locator("p").nth(1).waitFor();const original=await read();picker=await open();const before=await read();
    await picker.getByRole("button",{name:"Описание и размер",exact:true}).click();
    await picker.evaluate(async el=>{await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));await Promise.all(el.getAnimations().map(animation=>animation.finished.catch(()=>{})));});
    const popup=await picker.boundingBox();assert(popup.x>=15&&popup.x+popup.width<=width-15&&popup.y>=0&&popup.y+popup.height<=height+1,JSON.stringify(popup));
    const controls=await picker.locator('button,input:not([type="file"])').evaluateAll(elements=>elements.map(el=>({height:el.getBoundingClientRect().height,font:getComputedStyle(el).fontSize,leading:getComputedStyle(el).lineHeight})));assert(controls.every(control=>control.height>=48&&control.font==="18px"&&control.leading==="28px"),JSON.stringify(controls));
    await page.screenshot({path:`/tmp/rollapp-inline-image-picker-${width}-${height}.png`});
    await picker.getByLabel("Адрес изображения",{exact:true}).fill("/__inline-image.png");await picker.getByLabel("Описание изображения",{exact:true}).fill("Diagram");await picker.getByLabel("Ширина в пикселях",{exact:true}).fill("240");await picker.getByRole("button",{name:"Добавить",exact:true}).click();await picker.waitFor({state:"hidden"});await frames(page);
    const expected={type:"doc",content:[original.content[0],json(schema.nodes.image.create({src:"/__inline-image.png",alt:"Diagram",width:240})),json(schema.nodes.paragraph.create()),original.content[1]]};
    assert.deepEqual(await read(),expected);await editor.locator('img[alt="Diagram"]').waitFor();await page.waitForFunction(()=>[...document.images].every(image=>image.complete&&image.naturalWidth>0));
    await page.keyboard.type("Continue");assert.equal((await read()).content[2].content[0].text,"Continue");assert.deepEqual((await read()).content.at(-1),original.content.at(-1));
    await editor.press("ControlOrMeta+z");assert.deepEqual(await read(),expected);await editor.press("ControlOrMeta+z");assert.deepEqual(await read(),before);await editor.press("ControlOrMeta+Shift+z");assert.deepEqual(await read(),expected);
    await editor.press("ControlOrMeta+s");await page.locator('[data-save-status="saved"]').waitFor();const saved=await page.evaluate(()=>window.inlineTest.saved);assert.equal(typeof saved,"string");
    await page.goto(url(saved));await editor.locator('img[alt="Diagram"]').waitFor();assert.deepEqual(await read(),expected);assert.equal(await editor.locator("img").getAttribute("width"),"240");
    await page.evaluate(()=>{window.inlineImageFocusChoice.armed=true;});await editor.locator("img").click();await editor.press("ControlOrMeta+/");const actionMenu=page.getByRole("dialog",{name:"Действия текстового блока",exact:true});await actionMenu.getByRole("searchbox",{name:"Поиск действий блока"}).fill("image");await actionMenu.getByRole("searchbox",{name:"Поиск действий блока"}).press("Enter");
    const editPicker=page.getByRole("dialog",{name:"Изменить изображение",exact:true});await page.waitForFunction(()=>window.inlineImageFocusChoice.count===1);await frames(page);assert.equal(await editPicker.getByLabel("Описание изображения",{exact:true}).evaluate(el=>el.ownerDocument.activeElement===el),true,"Opening autofocus must not reclaim another field after focus has moved inside the image picker");await page.keyboard.type("Updated");await editPicker.getByRole("button",{name:"Применить",exact:true}).click();await editPicker.waitFor({state:"hidden"});
    const edited={...expected,content:expected.content.map(node=>node.type==="image"?{...node,attrs:{...node.attrs,alt:"Updated"}}:node)};assert.deepEqual(await read(),edited);await editor.press("ControlOrMeta+z");assert.deepEqual(await read(),expected);await editor.press("ControlOrMeta+Shift+z");assert.deepEqual(await read(),edited);
    await editor.press("ControlOrMeta+Shift+ArrowDown");const moved=await read();assert.equal(moved.content[2].type,"image");assert.deepEqual(moved.content[2].attrs,edited.content[1].attrs);await editor.press("ControlOrMeta+z");assert.deepEqual(await read(),edited);
    await editor.locator("img").click();await editor.press("ControlOrMeta+c");await page.goto(url(""));await editor.waitFor();await editor.click();const empty=await read();await editor.press("ControlOrMeta+v");await frames(page);const copiedImage=(await read()).content.find(node=>node.type==="image");assert.deepEqual(copiedImage,edited.content[1],"native image clipboard retains numeric widths and complete attributes");await editor.press("ControlOrMeta+z");assert.deepEqual(await read(),empty);
    await page.goto(url(saved)+"&public=1");await page.getByRole("img",{name:"Diagram",exact:true}).waitFor();assert.equal(await page.locator('[contenteditable="true"]').count(),0);assert.equal(await page.getByRole("img",{name:"Diagram",exact:true}).getAttribute("width"),"240");
    // Real file-chooser events exercise the production upload call's explicit
    // fixture transport; all actual API requests remain rejected above.
    await page.goto(url("Lead\n\nTail"));await editor.locator("p").nth(1).waitFor();picker=await open(false);const uploadBefore=await read();
    await chooseFile(picker,"image/svg+xml");await picker.getByRole("alert").waitFor();assert.equal(await page.evaluate(()=>window.inlineImageFixture.uploads.length),0);assert.deepEqual(await read(),uploadBefore);
    await chooseFile(picker);await picker.waitFor({state:"hidden"});await frames(page);const uploaded=await read();assert.equal(uploaded.content[1].type,"image");assert.equal(uploaded.content[1].attrs.src,"/__inline-image.png");assert.equal(await page.evaluate(()=>window.inlineImageFixture.uploads.length),1);
    await editor.press("ControlOrMeta+z");assert.deepEqual(await read(),uploadBefore);assert.deepEqual(await page.evaluate(()=>window.inlineImageFixture.releases),[]);await editor.press("ControlOrMeta+Shift+z");assert.deepEqual(await read(),uploaded);
    // A late upload can release only its newly-created unused asset. It cannot
    // insert after Cancel, nor delete an asset already committed to Undo history.
    await page.goto(url("Lead\n\nTail"));await editor.locator("p").nth(1).waitFor();picker=await open(false);const cancelled=await read();await page.evaluate(()=>{window.inlineImageFixture.slow=true;});await chooseFile(picker);await picker.getByRole("status").waitFor();await picker.getByRole("button",{name:"Отмена",exact:true}).click();await page.evaluate(()=>window.inlineImageFixture.pending.shift()());await page.waitForFunction(()=>window.inlineImageFixture.releases.length===1);assert.deepEqual(await read(),cancelled);
    await page.goto(url("Lead\n\nTail"));await editor.locator("p").nth(1).waitFor();picker=await open(false);const failed=await read();await page.evaluate(()=>{window.inlineImageFixture.fail=true;});await chooseFile(picker);await picker.getByRole("alert").waitFor();assert.deepEqual(await read(),failed);await page.evaluate(()=>{window.inlineImageFixture.fail=false;});await chooseFile(picker);await picker.waitFor({state:"hidden"});assert.equal((await read()).content[1].type,"image");assert.deepEqual(await page.evaluate(()=>window.inlineImageFixture.releases),[]);
    await page.goto(url("Lead\n\nTail"));await editor.locator("p").nth(1).waitFor();picker=await open(false);await page.evaluate(()=>{window.inlineImageFixture.slow=true;});await chooseFile(picker);await picker.getByRole("status").waitFor();await editor.evaluate(el=>el.editor.commands.setContent("Changed source",{contentType:"markdown"}));await picker.waitFor({state:"hidden"});const changed=await read();await page.evaluate(()=>window.inlineImageFixture.pending.shift()());await page.waitForFunction(()=>window.inlineImageFixture.releases.length===1);assert.deepEqual(await read(),changed);
    await page.goto(url(saved)+"&error=1");await editor.locator("img").waitFor();await editor.locator("p").last().click();await page.keyboard.type(" draft");const draft=await read();await editor.press("ControlOrMeta+s");await page.locator('[data-save-status="error"]').waitFor();await page.reload();await editor.locator("img").waitFor();await page.locator('[data-save-status="error"]').waitFor();assert.deepEqual(await read(),draft);await page.evaluate(()=>{window.inlineTest.fail=false;});await page.getByRole("button",{name:"Повторить сохранение",exact:true}).click();await page.locator('[data-save-status="saved"]').waitFor();const retried=await page.evaluate(()=>window.inlineTest.saved);await page.goto(url(retried));await editor.locator("img").waitFor();assert.deepEqual(await read(),draft);
    const view=await editor.evaluate(el=>({border:getComputedStyle(el).borderTopWidth,outline:getComputedStyle(el).outlineWidth,shadow:getComputedStyle(el).boxShadow,overflow:document.documentElement.scrollWidth>innerWidth+1}));assert.deepEqual(view,{border:"0px",outline:"0px",shadow:"none",overflow:false});assert.deepEqual(errors,[]);
    await page.screenshot({path:`/tmp/rollapp-inline-images-${width}-${height}.png`});await page.close();console.log(`PASS inline images ${width}x${height}: slash/action catalogue, cancel/unsafe URL, native file upload/lateness, owned caret, separate Undo/Redo, dimensions and exact save/public reload, no prose frames/API`);
  }
}


export async function checkImageLayout(browser, origin, diagnostic = false) {
  const sizes = diagnostic ? [[390,400],[1440,400]] : [[320,844],[390,844],[390,400],[768,844],[820,844],[1024,844],[1440,844],[1920,844]];
  for (const [width,height] of sizes) {
    const page=await browser.newPage({viewport:{width,height}}), errors=[];
    page.on("pageerror",error=>errors.push(error.message));
    await page.exposeBinding("imageLayoutError",(_source,message)=>errors.push(message));
    await page.addInitScript(()=>{
      sessionStorage.removeItem("rollapp:text:inline-fixture:fixture");
      window.addEventListener("error",event=>{void window.imageLayoutError(event.message);});
      window.addEventListener("unhandledrejection",event=>{void window.imageLayoutError(String(event.reason));});
    });
    await page.route("**/api/**",route=>{errors.push("Unexpected API request");return route.abort();});
    for(const mode of ["settle","type","wheel","selection","access"]){
      let release,held=0;const gate=new Promise(resolve=>{release=resolve;});
      await page.route("**/__late-inline-image.png*",async route=>{held++;await gate;await route.fulfill({contentType:"image/svg+xml",body:'<svg xmlns="http://www.w3.org/2000/svg" width="360" height="1500"><rect width="360" height="1500" fill="#666"/></svg>'});});
      try {
        const value=Array.from({length:20},(_,index)=>`Paragraph ${index+1} for image layout.`).join("\n\n");
        await page.goto(`${origin}/app/spheres/career?tab=about&__text_fixture=1&chrome=1&access=1&source=${encodeURIComponent(value)}`);
        const editor=page.getByRole("textbox",{name:"О себе",exact:true});await editor.locator("p").nth(19).waitFor();await page.evaluate(()=>document.fonts.ready);
        await editor.locator("p").nth(12).click();await openNativeImageSlash(page, editor);
        const picker=page.getByRole("dialog",{name:"Добавить изображение",exact:true});await picker.getByLabel("Адрес изображения",{exact:true}).fill(`/__late-inline-image.png?mode=${mode}`);await picker.getByRole("button",{name:"Добавить",exact:true}).click();await picker.waitFor({state:"hidden"});await frames(page);await page.waitForTimeout(80);
        assert.equal(held,1,"actual browser image response is held");assert.equal(await editor.locator("img").evaluate(el=>el.complete),false);
        const point=()=>editor.evaluate(el=>{const {view,state}=el.editor,s=getSelection(),r=view.coordsAtPos(state.selection.head),header=document.querySelector(".global-app-chrome").getBoundingClientRect(),navigation=document.querySelector(".mobile-app-navigation")?.getBoundingClientRect();return{top:r.top,bottom:r.bottom,headerBottom:header.height?header.bottom:0,limit:navigation?.height?navigation.top:innerHeight,scrollY,active:document.activeElement===el,head:state.selection.head,native:s.focusNode&&el.contains(s.focusNode)?view.posAtDOM(s.focusNode,s.focusOffset):null};});
        const first=await point();assert(first.active);assert(first.top>=first.headerBottom+8&&first.bottom<=first.limit-8,"initial caret clears chrome before the asset loads");
        if(mode==="type")await page.keyboard.type("Continue before load");
        if(mode==="wheel"){await page.mouse.wheel(0,-650);await page.waitForTimeout(120);}
        if(mode==="selection")await editor.locator("p").nth(2).click();
        if(mode==="access")await page.getByRole("button",{name:"Только чтение",exact:true}).click();
        await frames(page);
        const before=await editor.evaluate(el=>({doc:el.editor.getJSON(),selection:el.editor.state.selection.toJSON(),scrollY}));
        release();await editor.locator("img").evaluate(el=>el.decode());await frames(page);await page.waitForTimeout(180);
        const after=await editor.evaluate(el=>({doc:el.editor.getJSON(),selection:el.editor.state.selection.toJSON(),scrollY}));
        assert.deepEqual(after.doc,before.doc,`${mode}: image load cannot write content`);assert.deepEqual(after.selection,before.selection,`${mode}: image load cannot move selection`);
        const final=await point();console.log("IMAGE LAYOUT",width,height,mode,JSON.stringify({first,final}));
        if(["settle","type"].includes(mode)){assert(final.active);assert.equal(final.head,final.native);assert(final.top>=final.headerBottom+8&&final.bottom<=final.limit-8,`${mode}: late image must leave the owned caret visible`);}
        else assert.equal(after.scrollY,before.scrollY,`${mode}: cancelled image continuation must preserve manual scroll/selection/access`);
      } finally {release();await page.unroute("**/__late-inline-image.png*");}
    }
    assert.deepEqual(errors,[]);await page.close();console.log(`PASS image layout ${width}x${height}: held native asset load, visible caret before/after typing, manual wheel/selection/access guards, unchanged document and no API/errors`);
  }
}


export async function checkImageReaders(browser,origin,diagnostic=false){
 const manager=new MarkdownManager({extensions:inlineEditorExtensions()});
 const p=text=>({type:'paragraph',content:[{type:'text',text}]}),image={type:'image',attrs:{src:'/__reader-image.svg',alt:'Reader diagram',width:240,height:120}};
 const body=manager.serialize({type:'doc',content:[p('Before diagram'),image,{type:'columns',content:[{type:'column',content:[p('Left column'),image]},{type:'column',content:[p('Right column')]}]},p('After diagram')]});
 for(const [width,height] of !diagnostic?[[320,844],[390,844],[390,400],[768,844],[820,844],[1024,844],[1440,844],[1920,844]]:[[390,400],[1440,400]]){
  const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.exposeBinding('publicImageReaderError',(_source,message)=>errors.push(message));await page.addInitScript(()=>{window.addEventListener('error',event=>{void window.publicImageReaderError(event.message);});window.addEventListener('unhandledrejection',event=>{void window.publicImageReaderError(String(event.reason));});});await page.route('**/api/**',r=>{errors.push('Unexpected API');return r.abort();});await page.route('**/__reader-image.svg',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120"><rect width="240" height="120" fill="#888"/></svg>'}));
  for(const kind of ['ages','strategies']){
   const title=kind==='ages'?'45 y.o.':'Platform',source=(kind==='ages'?'# ':'## ')+title+'\n\n'+body;
   await page.goto(`${origin}/__text-edit?public=1&public-${kind}=1&source=${encodeURIComponent(source)}`);await page.getByRole('button',{name:title,exact:true}).click();await page.locator('img').nth(1).waitFor();await page.evaluate(()=>document.fonts.ready);await page.locator('img').evaluateAll(images=>Promise.all(images.map(image=>image.decode())));await frames(page);
   const actual=await page.evaluate(()=>({images:[...document.querySelectorAll('img')].map(img=>({src:img.getAttribute('src'),alt:img.alt,width:img.getAttribute('width'),height:img.getAttribute('height')})),literal:document.body.textContent.includes('data-inline-block'),editable:document.querySelectorAll('[contenteditable="true"]').length,overflow:document.documentElement.scrollWidth>innerWidth+1}));
   console.log('PUBLIC READER',width,height,kind,JSON.stringify(actual));await page.screenshot({path:`/tmp/rollapp-image-reader-final-${kind}-${width}-${height}.png`});
   assert.equal(actual.images.length,2,'An opened public section must render both canonical images, including its column');assert.equal(actual.literal,false);assert.equal(actual.editable,0);assert.equal(actual.overflow,false);for(const item of actual.images)assert.deepEqual(item,{src:'/__reader-image.svg',alt:'Reader diagram',width:'240',height:'120'});
   const frameStyles=await page.locator('.inline-editor__content').evaluateAll(elements=>elements.flatMap(root=>[root,...root.querySelectorAll('p,[data-type="column"]')]).map(el=>{const s=getComputedStyle(el);return [s.borderTopWidth,s.borderRightWidth,s.borderBottomWidth,s.borderLeftWidth,s.outlineStyle==='none'?'0px':s.outlineWidth,s.boxShadow];}));for(const frame of frameStyles)assert.deepEqual(frame,['0px','0px','0px','0px','0px','none']);
   const doc=page.getByRole('article' ,{name:'Опубликованный текст',exact:true});await doc.getByText('After diagram',{exact:true}).waitFor();assert.equal(await page.locator('[data-type="columns"]').count(),1);assert.equal(await page.locator('[data-type="column"]').count(),2);
  }
  assert.deepEqual(errors,[]);await page.close();console.log(`PASS public rich reader ${width}x${height}: opened age/strategy sections, canonical images/columns, dimensions/alt/neighbours and no literal markup/frames/API/overflow`);
 }
}


export async function checkImageContexts(browser,origin,diagnostic=false){
 const manager=new MarkdownManager({extensions:inlineEditorExtensions()}), p=text=>({type:"paragraph",content:text?[{type:"text",text}]:[]});
 const image=json(schema.nodes.image.create({src:"/__inline-image.png",alt:""})), blank=json(schema.nodes.paragraph.create());
 const sizes=diagnostic?[[390,400],[1440,400]]:[[320,844],[390,844],[390,400],[768,844],[820,844],[1024,844],[1440,844],[1920,844]];
 for(const [width,height] of sizes){
  const page=await browser.newPage({viewport:{width,height}}),errors=[];
  page.on("pageerror",error=>errors.push(error.message));await page.exposeBinding("imageContextError",(_source,message)=>errors.push(message));
  await page.addInitScript(()=>{sessionStorage.removeItem("rollapp:text:inline-fixture:fixture");sessionStorage.removeItem("rollapp:text:inline-fixture:identity:four-questions");window.inlineImageFixture={uploads:[],releases:[],pending:[],slow:false,fail:false};window.addEventListener("error",e=>{void window.imageContextError(e.message);});window.addEventListener("unhandledrejection",e=>{void window.imageContextError(String(e.reason));});});
  await page.route("**/api/**",route=>{errors.push("Unexpected API request");return route.abort();});
  const editor=page.getByRole("textbox",{name:"О себе",exact:true}), read=()=>editor.evaluate(el=>el.editor.getJSON());
  const goto=async doc=>{const source=manager.serialize(doc);await page.goto(`${origin}/__text-edit?access=1&source=${encodeURIComponent(source)}`);await editor.waitFor();await page.evaluate(()=>document.fonts.ready);return read();};
  const slash=async(target,owner=editor)=>{await target.click();await openNativeImageSlash(page, owner);const picker=page.getByRole("dialog",{name:"Добавить изображение",exact:true});await picker.waitFor();return picker;};
  const submit=async picker=>{await picker.getByLabel("Адрес изображения",{exact:true}).fill("/__inline-image.png");await picker.getByRole("button",{name:"Добавить",exact:true}).click();await picker.waitFor({state:"hidden"});await frames(page);};
  // A slash authored inside a cell must address that text block, never the
  // surrounding table. Every peer and cell attribute is checked exactly.
  const cellDoc={type:"doc",content:[{type:"table",content:[{type:"tableRow",content:[{type:"tableCell",content:[p("Target")]},{type:"tableCell",content:[p("Peer")]}]}]},p("Tail")]};
  let before=await goto(cellDoc),picker=await slash(editor.getByText("Target",{exact:true}));await submit(picker);
  let expected=structuredClone(before);expected.content[0].content[0].content[0].content.push(image,blank);
  assert.deepEqual(await read(),expected,"Cell image insertion must stay inside its original cell and preserve the whole table");
  await page.keyboard.type("Continue");assert.equal(await editor.evaluate(el=>el.editor.state.selection.$from.parent.textContent),"Continue");assert.equal(await editor.evaluate(el=>el.editor.state.selection.$from.node(-1).type.name),"tableCell");await editor.press("ControlOrMeta+z");assert.deepEqual(await read(),expected);
  await editor.press("ControlOrMeta+s");await page.locator('[data-save-status="saved"]').waitFor();let saved=await page.evaluate(()=>window.inlineTest.saved);await page.goto(`${origin}/__text-edit?source=${encodeURIComponent(saved)}`);await editor.locator("img").waitFor();assert.deepEqual(await read(),expected,"Scoped table image survives exact save/reload");
  // Both sides use the real desktop plus/Option-click; narrow viewports use
  // the existing block action menu and common type picker.
  for(const side of ["after","before"]){
   before=await goto({type:"doc",content:[p("Before"),p("Target"),p("After")]});const target=editor.getByText("Target",{exact:true});await target.click();
   if(width>=1024){await target.hover();const plus=page.getByRole("button",{name:"Добавить блок ниже",exact:true});await plus.waitFor();await plus.click({modifiers:side==="before"?["Alt"]:[]});}
   else{await editor.press("ControlOrMeta+/");await page.getByRole("dialog",{name:"Действия текстового блока",exact:true}).getByRole("button",{name:side==="before"?"Добавить блок выше":"Добавить блок ниже",exact:true}).click();}
   const search=page.getByRole("searchbox",{name:"Поиск типа блока"});await search.fill("image");await search.press("Enter");picker=page.getByRole("dialog",{name:"Добавить изображение",exact:true});await picker.waitFor();assert.deepEqual(await read(),before,"Opening plus image picker cannot change history/content");await submit(picker);
   expected=structuredClone(before);expected.content.splice(side==="before"?1:2,0,image,blank);assert.deepEqual(await read(),expected,`${side}: exact image position and neighbours`);await editor.press("ControlOrMeta+z");assert.deepEqual(await read(),before);await editor.press("ControlOrMeta+Shift+z");assert.deepEqual(await read(),expected);
  }
  before=await goto({type:"doc",content:[{type:"nestedBlock",content:[p("Parent"),p("Target"),p("Nested tail")]},p("Outer tail")]});picker=await slash(editor.getByText("Target",{exact:true}));await submit(picker);expected=structuredClone(before);expected.content[0].content.splice(2,0,image,blank);assert.deepEqual(await read(),expected,"A nested image retains its owner and following sibling");
  for(const kind of ["nestedBlock","bulletList"]){const owner={type:kind==="bulletList"?"listItem":"nestedBlock",content:[p("Target"),p("Child")]};const root=kind==="bulletList"?{type:"bulletList",content:[owner]}:owner;before=await goto({type:"doc",content:[root,p("Outer tail")]});picker=await slash(editor.getByText("Target",{exact:true}));await submit(picker);expected=structuredClone(before);const parent=kind==="bulletList"?expected.content[0].content[0]:expected.content[0];parent.content.splice(1,0,image,blank);assert.deepEqual(await read(),expected,`${kind}: first parent paragraph keeps image and existing children inside its owner`);}
  before=await goto({type:"doc",content:[{type:"columns",content:[{type:"column",content:[p("Target"),p("Left tail")]},{type:"column",content:[p("Right peer")]}]},p("Outer tail")]});if(width>=768)await page.getByRole("separator",{name:"Ширина колонки 1",exact:true}).waitFor();picker=await slash(editor.getByText("Target",{exact:true}));await frames(page);assert.equal(await page.locator('[data-column-separator]').count(),0,"Image menu suspends competing column resize controls");assert.equal(await page.getByRole("toolbar",{name:"Форматирование выделенного текста",exact:true}).count(),0);await submit(picker);expected=structuredClone(before);expected.content[0].content[0].content.splice(1,0,image,blank);assert.deepEqual(await read(),expected,"Image stays inside its source column, preserving width ratios and peers");if(width>=768)await page.getByRole("separator",{name:"Ширина колонки 1",exact:true}).waitFor();
  before=await goto({type:"doc",content:[{type:"nestedBlock",content:[image,p("Child")]},p("Outer tail")]});await editor.locator("img").evaluate(img=>img.decode());const imageRail=await editor.locator("img").boundingBox();const childRail=await editor.getByText("Child",{exact:true}).boundingBox();await editor.evaluate(el=>{const e=el.editor;e.commands.setNodeSelection(1);const Selection=Object.getPrototypeOf(e.state.selection.constructor);e.view.dispatch(e.state.tr.setSelection(Selection.fromJSON(e.state.doc,{type:"gapcursor",pos:1})));e.view.focus();});await frames(page);assert.equal(await editor.locator(".ProseMirror-gapcursor.ProseMirror-widget").count(),1);assert.deepEqual(await editor.locator("img").boundingBox(),imageRail,"A gap-caret widget must not change the first semantic image rail or margin");assert.deepEqual(await editor.getByText("Child",{exact:true}).boundingBox(),childRail,"Caret decorations cannot move existing nested children");const gapPaint=await editor.locator(".ProseMirror-gapcursor").evaluate(el=>({line:getComputedStyle(el,"::after").borderTopColor,ink:getComputedStyle(el).color}));assert.equal(gapPaint.line,gapPaint.ink,"Gap caret uses foreground rather than invisible black on a dark page");assert.deepEqual(await read(),before);await editor.locator("img").hover();await frames(page);await editor.locator("img").click();assert.equal(await editor.evaluate(el=>el.editor.state.selection.node?.type.name),"image","Native click after hover selects the stable image header");await editor.press("ControlOrMeta+/");const mediaSearch=page.getByRole("dialog",{name:"Действия текстового блока",exact:true}).getByRole("searchbox",{name:"Поиск действий блока"});await mediaSearch.fill("image");await mediaSearch.press("Enter");const mediaEdit=page.getByRole("dialog",{name:"Изменить изображение",exact:true});await mediaEdit.getByLabel("Описание изображения",{exact:true}).fill("Updated nested image");await mediaEdit.getByRole("button",{name:"Применить",exact:true}).click();await mediaEdit.waitFor({state:"hidden"});expected=structuredClone(before);expected.content[0].content[0].attrs.alt="Updated nested image";assert.deepEqual(await read(),expected,"Nested head image metadata edits the selected image instead of duplicating it outside its parent");await editor.press("ControlOrMeta+z");assert.deepEqual(await read(),before);
  const {IDENTITY_QUESTION_TITLES}=await import("../shared/identity-questions.js");const {identityFourQuestionsSchema}=await import("../server/identity-content-schema.js");
  const questions={questions:IDENTITY_QUESTION_TITLES.map((title,index)=>({title,paragraphs:[index?`Answer ${index}`:"Target","Keep answer tail"]}))};
  await page.goto(`${origin}/__text-edit?four=1&questions=${encodeURIComponent(JSON.stringify(questions))}`);const four=page.getByRole("textbox",{name:"Ответы на четыре вопроса",exact:true});await four.locator('[data-question-body]').nth(3).waitFor();const fourBefore=await four.evaluate(el=>el.editor.getJSON());picker=await slash(four.getByText("Target",{exact:true}),four);const fourQuery=await four.evaluate(el=>el.editor.getJSON());await submit(picker);const fourExpected=structuredClone(fourBefore);fourExpected.content[0].content.splice(1,0,image,blank);assert.deepEqual(await four.evaluate(el=>el.editor.getJSON()),fourExpected);assert.deepEqual(await four.locator('h3[contenteditable="false"]').allTextContents(),IDENTITY_QUESTION_TITLES);await four.press("ControlOrMeta+s");await page.locator('[data-save-status="saved"]').waitFor();saved=await page.evaluate(()=>window.inlineTest.saved);identityFourQuestionsSchema.parse(saved);assert.deepEqual(saved.questions.slice(1),questions.questions.slice(1));await four.press("ControlOrMeta+z");assert.deepEqual(await four.evaluate(el=>el.editor.getJSON()),fourQuery);await four.press("ControlOrMeta+Shift+z");assert.deepEqual(await four.evaluate(el=>el.editor.getJSON()),fourExpected);await page.goto(`${origin}/__text-edit?four=1&questions=${encodeURIComponent(JSON.stringify(saved))}`);await four.locator("img").waitFor();assert.deepEqual(await four.evaluate(el=>el.editor.getJSON()),fourExpected);
  for(const mode of ["readonly","loading"]){const value="Target\n\nTail";await page.goto(`${origin}/__text-edit?${mode}=1&source=${encodeURIComponent(value)}`);await editor.waitFor();const guarded=await read();await editor.click();await editor.press("ControlOrMeta+/");await frames(page);assert.equal(await page.getByRole("dialog",{name:"Добавить изображение",exact:true}).count(),0);assert.equal(await page.locator('[contenteditable="true"]').count(),0);assert.deepEqual(await read(),guarded);assert.equal(await page.evaluate(()=>window.inlineTest.saves.length),0);}
  // Access revoked while an upload is pending unmounts the picker; its late
  // response may release only its unused asset and cannot write the document.
  before=await goto({type:"doc",content:[p("Target"),p("Tail")]});picker=await slash(editor.getByText("Target",{exact:true}));const pendingDoc=await read();await page.evaluate(()=>{window.inlineImageFixture.slow=true;});const chooser=page.waitForEvent("filechooser");await picker.getByRole("button",{name:"Загрузить изображение",exact:true}).click();await(await chooser).setFiles({name:"image.png",mimeType:"image/png",buffer:imageFixturePNG});await picker.getByRole("status").waitFor();await page.getByRole("button",{name:"Только чтение",exact:true}).dispatchEvent("click");await picker.waitFor({state:"hidden"});await page.evaluate(()=>window.inlineImageFixture.pending.shift()());await page.waitForFunction(()=>window.inlineImageFixture.releases.length===1);assert.deepEqual(await read(),pendingDoc);assert.equal(await editor.getAttribute("contenteditable"),"false");await page.getByRole("button",{name:"Разрешить редактирование",exact:true}).click();assert.deepEqual(await read(),pendingDoc);
  before=await goto({type:"doc",content:[p("Target"),p("Tail")]});picker=await slash(editor.getByText("Target",{exact:true}));const selectionDoc=await read();await page.evaluate(()=>{window.inlineImageFixture.slow=true;});const nextChooser=page.waitForEvent("filechooser");await picker.getByRole("button",{name:"Загрузить изображение",exact:true}).click();await(await nextChooser).setFiles({name:"image.png",mimeType:"image/png",buffer:imageFixturePNG});await picker.getByRole("status").waitFor();await editor.evaluate(el=>el.editor.commands.setTextSelection(el.editor.state.doc.firstChild.nodeSize+2));await picker.waitFor({state:"hidden"});const freshSelection=await editor.evaluate(el=>el.editor.state.selection.toJSON());await page.evaluate(()=>window.inlineImageFixture.pending.shift()());await page.waitForFunction(()=>window.inlineImageFixture.releases.length===1);assert.deepEqual(await read(),selectionDoc,"Same-document selection change rejects the stale upload owner");assert.deepEqual(await editor.evaluate(el=>el.editor.state.selection.toJSON()),freshSelection,"Late upload cannot redirect the fresh caret");
  before=await goto({type:"doc",content:[p("Target words"),p("Tail")]});await editor.locator("p").first().dblclick({position:{x:40,y:14}});const selectionTools=page.getByRole("toolbar",{name:"Форматирование выделенного текста",exact:true});await selectionTools.waitFor();const selectedRange=await editor.evaluate(el=>el.editor.state.selection.toJSON());await editor.press("ControlOrMeta+/");const handoffSearch=page.getByRole("searchbox",{name:"Поиск действий блока",exact:true});await handoffSearch.fill("image");
  await page.evaluate(()=>{window.imageHandoffFrames=[];window.recordImageHandoff=true;const sample=()=>{if(!window.recordImageHandoff)return;const visible=selector=>[...document.querySelectorAll(selector)].filter(el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=="none"&&s.visibility!=="hidden"&&Number(s.opacity)>0&&r.width>0&&r.height>0}).length;window.imageHandoffFrames.push({image:visible(".inline-editor__image-menu"),selection:visible(".inline-editor__selection"),create:visible(".inline-editor__create-menu"),block:visible(".inline-editor__block-menu")});if(window.imageHandoffFrames.length<90)requestAnimationFrame(sample);};requestAnimationFrame(sample);});
  await handoffSearch.press("Enter");picker=page.getByRole("dialog",{name:"Добавить изображение",exact:true});await picker.waitFor();await page.waitForFunction(()=>document.activeElement?.closest(".inline-editor__image-menu")?.querySelector("button")===document.activeElement);await frames(page);await page.keyboard.press("Tab");assert.equal(await picker.getByLabel("Адрес изображения",{exact:true}).evaluate(el=>document.activeElement===el),true);await page.keyboard.type("https://example.com/image.png",{delay:1});await page.waitForTimeout(180);assert.equal(await picker.getByLabel("Адрес изображения",{exact:true}).inputValue(),"https://example.com/image.png");assert.deepEqual(await read(),before,"Typing in media URL cannot replace the selected prose");await picker.getByRole("button",{name:"Отмена",exact:true}).click();await picker.waitFor({state:"hidden"});await selectionTools.waitFor();await frames(page);const handoffFrames=await page.evaluate(()=>{window.recordImageHandoff=false;return window.imageHandoffFrames;});assert(handoffFrames.length>=3);assert(handoffFrames.every(frame=>frame.image+frame.selection+frame.create+frame.block<=1),JSON.stringify(handoffFrames));assert.deepEqual(await read(),before);assert.deepEqual(await editor.evaluate(el=>el.editor.state.selection.toJSON()),selectedRange);assert.equal(await page.evaluate(()=>window.inlineTest.saves.length),0);
  // An image menu belongs to the visual viewport, including keyboard panning.
  before=await goto({type:"doc",content:[p("Target"),p("Tail")]});picker=await slash(editor.getByText("Target",{exact:true}));
  await page.evaluate(()=>{Object.defineProperty(visualViewport,"height",{configurable:true,value:220});Object.defineProperty(visualViewport,"offsetTop",{configurable:true,value:96});visualViewport.dispatchEvent(new Event("resize"));visualViewport.dispatchEvent(new Event("scroll"));});await frames(page);await picker.evaluate(async el=>{await Promise.all(el.getAnimations().map(animation=>animation.finished.catch(()=>{})));});await frames(page);
  const bounds=await picker.boundingBox();assert(bounds.y>=95&&bounds.y+bounds.height<=317,JSON.stringify(bounds));await picker.getByLabel("Адрес изображения",{exact:true}).fill("/__inline-image.png");await picker.getByRole("button",{name:"Добавить",exact:true}).click();await picker.waitFor({state:"hidden"});assert.equal((await read()).content[1].type,"image");await editor.locator("img").evaluate(img=>img.decode());await frames(page);const caret=await editor.evaluate(el=>el.editor.view.coordsAtPos(el.editor.state.selection.head));assert(caret.top>=103&&caret.bottom<=309,JSON.stringify(caret));
  assert.deepEqual(errors,[]);await page.close();console.log(`PASS image contexts ${width}x${height}: native plus/Option above-below or mobile menu, cell/nested/protected answer ownership, exact neighbours/save/reload/Undo, loading/read-only and pending-upload access guards and panned keyboard viewport, no API/errors`);
 }
}
